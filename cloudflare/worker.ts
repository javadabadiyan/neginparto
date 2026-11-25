// Cloudflare Worker + D1 Backend for سامانه جامع شرکت نگین پرتو نصر
// Implements 100% of the REST API with fail-closed RBAC, PBKDF2-SHA256 password hashing,
// HMAC-SHA256 Bearer tokens, CORS for GitHub Pages, and persistent Cloudflare D1 storage.

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = Record<string, any>>(colName?: string): Promise<T | null>;
  all<T = Record<string, any>>(): Promise<{ results?: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results?: T[]; success: boolean }[]>;
}

export interface Env {
  DB: D1Database;
  AUTH_SECRET?: string;
  ALLOWED_ORIGIN?: string;
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours (strict security session expiration)

// ================= CORS & RESPONSE HELPERS =================

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  const configured = (env.ALLOWED_ORIGIN || '*').trim();
  const allowOrigin = configured === '*' ? origin : configured;
  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Encoding',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonRes(
  request: Request,
  env: Env,
  payload: any,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

async function readJsonBody(request: Request): Promise<any> {
  try {
    const reqUrl = new URL(request.url);
    const isGzip =
      reqUrl.searchParams.get('gz') === '1' ||
      request.headers.get('X-Requested-With') === 'npn-gzip' ||
      (request.headers.get('Content-Encoding') || '').toLowerCase().includes('gzip');
    if (isGzip && request.body && typeof DecompressionStream !== 'undefined') {
      const decompressed = request.body.pipeThrough(new DecompressionStream('gzip'));
      return await new Response(decompressed).json();
    }
    return await request.json();
  } catch {
    return {};
  }
}

function unpackBatchItems(body: any): any[] {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.items)) return body.items;
  if (Array.isArray(body.__cols) && Array.isArray(body.__rows)) {
    const cols: string[] = body.__cols;
    const rows: any[][] = body.__rows;
    const colCount = cols.length;
    const out = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const vals = rows[i];
      const obj: Record<string, any> = {};
      if (Array.isArray(vals)) {
        for (let j = 0; j < colCount; j++) {
          const v = vals[j];
          if (v !== undefined && v !== null) {
            obj[cols[j]] = v;
          }
        }
      }
      out[i] = obj;
    }
    return out;
  }
  return [];
}

const FA_DATE_FMT = (() => {
  try {
    return new Intl.DateTimeFormat('fa-IR');
  } catch {
    return null;
  }
})();

const FA_DATETIME_FMT = (() => {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
})();

function faDate(): string {
  try {
    return FA_DATE_FMT ? FA_DATE_FMT.format(new Date()) : new Date().toLocaleDateString('fa-IR');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function faDateTime(): string {
  try {
    return FA_DATETIME_FMT ? FA_DATETIME_FMT.format(new Date()) : new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
  } catch {
    return new Date().toISOString();
  }
}

function genId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  return `${prefix}-${rand}`;
}

// ================= CRYPTO: PBKDF2 + SHA256 + HMAC-SHA256 =================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim();
  const out = new Uint8Array(new ArrayBuffer(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function b64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecodeToBytes(str: string): Uint8Array | null {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hashPassword(plain: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(plain),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$100000$${bytesToHex(saltBytes)}$${bytesToHex(new Uint8Array(derived))}`;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

async function verifyPassword(
  plain: string,
  stored: string
): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (!stored) return { valid: false, needsMigration: false };

  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return { valid: false, needsMigration: false };
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHex = parts[3];
    if (!Number.isFinite(iterations) || !saltHex || !expectedHex) {
      return { valid: false, needsMigration: false };
    }
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(plain),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const actualHex = bytesToHex(new Uint8Array(derived));
    return { valid: timingSafeEqualStr(actualHex, expectedHex), needsMigration: false };
  }

  if (stored.startsWith('sha256$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valid: false, needsMigration: false };
    const actualHex = await sha256Hex(`${parts[1]}:${plain}`);
    const valid = timingSafeEqualStr(actualHex, parts[2]);
    return { valid, needsMigration: valid };
  }

  if (!stored.startsWith('scrypt$') && !stored.startsWith('$2')) {
    const valid = timingSafeEqualStr(stored, plain);
    return { valid, needsMigration: valid };
  }

  return { valid: false, needsMigration: false };
}

let cachedSecret: string | null = null;

async function getAuthSecret(env: Env): Promise<string> {
  if (env.AUTH_SECRET && env.AUTH_SECRET.trim().length >= 16) {
    return env.AUTH_SECRET.trim();
  }
  if (cachedSecret) return cachedSecret;
  const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key = ?')
    .bind('auth_secret')
    .first<{ value: string }>();
  if (row?.value && row.value.length >= 32) {
    cachedSecret = row.value;
    return cachedSecret;
  }
  const generated = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)')
    .bind('auth_secret', generated)
    .run();
  const recheck = await env.DB.prepare('SELECT value FROM app_meta WHERE key = ?')
    .bind('auth_secret')
    .first<{ value: string }>();
  cachedSecret = recheck?.value || generated;
  return cachedSecret;
}

async function signHmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data));
  return b64UrlEncodeBytes(new Uint8Array(sig));
}

async function createAuthToken(user: any, env: Env): Promise<string> {
  const secret = await getAuthSecret(env);
  const payload = {
    uid: user.id,
    usr: user.username,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = b64UrlEncodeBytes(textEncoder.encode(JSON.stringify(payload)));
  const sig = await signHmac(secret, encoded);
  return `${encoded}.${sig}`;
}

async function verifyAuthToken(
  token: string,
  env: Env
): Promise<{ uid: string; usr: string; exp: number } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const secret = await getAuthSecret(env);
    const expectedSig = await signHmac(secret, encoded);
    if (!timingSafeEqualStr(sig, expectedSig)) return null;
    const rawBytes = b64UrlDecodeToBytes(encoded);
    if (!rawBytes) return null;
    const payload = JSON.parse(textDecoder.decode(rawBytes));
    if (!payload?.uid || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ================= RBAC (STRICT FAIL-CLOSED) =================

function isSuperAdminUser(user: any): boolean {
  if (!user) return false;
  return user.role === 'super_admin' || user.username === 'javadabadiyan';
}

function syncLegacyPermissions(perms: any) {
  return {
    ...perms,
    canManagePersonnel: Boolean(perms.personnel.create || perms.personnel.edit || perms.personnel.delete),
    canManageKaraneh: Boolean(perms.karaneh.create || perms.karaneh.edit || perms.karaneh.delete),
    canManageJobGroups: Boolean(perms.jobGroups.create || perms.jobGroups.edit || perms.jobGroups.delete),
    canManageCommitments: Boolean(perms.commitments.create || perms.commitments.edit || perms.commitments.delete),
    canManageUsers: Boolean(perms.users.create || perms.users.edit || perms.users.delete),
    canExportExcel: Boolean(
      perms.personnel.exportExcel ||
      perms.karaneh.exportExcel ||
      perms.finalKaraneh?.exportExcel ||
      perms.jobGroups.exportExcel ||
      perms.commitments.exportExcel ||
      perms.payroll.exportExcel ||
      perms.users.exportExcel ||
      perms.smartDashboard?.exportExcel ||
      perms.ceoDashboard?.exportExcel ||
      perms.unitOperations?.exportExcel
    ),
    canImportExcel: Boolean(
      perms.personnel.importExcel ||
      perms.karaneh.importExcel ||
      perms.jobGroups.importExcel ||
      perms.commitments.importExcel ||
      perms.payroll.importExcel ||
      perms.users.importExcel ||
      perms.ceoDashboard?.importExcel ||
      perms.unitOperations?.importExcel
    ),
    canBackupRestore: Boolean(perms.system.backupDatabase || perms.system.restoreDatabase),
  };
}

function getFullAdminPermissions() {
  return syncLegacyPermissions({
    personnel: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
    karaneh: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, submit: true, allowedUnits: [] },
    finalKaraneh: { view: true, edit: true, delete: true, deleteAll: true, exportExcel: true },
    jobGroups: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    commitments: { view: true, create: true, edit: true, delete: true, deleteAll: true, print: true, archive: true, importExcel: true, exportExcel: true },
    payroll: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    users: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    system: { dashboardStats: true, backupDatabase: true, restoreDatabase: true },
    smartDashboard: { view: true, exportExcel: true, print: true },
    ceoDashboard: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, print: true },
    unitOperations: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, allowedUnits: [] },
  });
}

function getEmptyPermissions() {
  return syncLegacyPermissions({
    personnel: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, viewSalary: false, documents: false },
    karaneh: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, submit: false, allowedUnits: [] },
    finalKaraneh: { view: false, edit: false, delete: false, deleteAll: false, exportExcel: false },
    jobGroups: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
    payroll: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    system: { dashboardStats: false, backupDatabase: false, restoreDatabase: false },
    smartDashboard: { view: false, exportExcel: false, print: false },
    ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
    unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
  });
}

function normalizePermissions(raw?: any) {
  if (!raw || typeof raw !== 'object') return getEmptyPermissions();

  const hasModernSchema = Boolean(
    (raw.personnel && typeof raw.personnel === 'object') ||
    (raw.karaneh && typeof raw.karaneh === 'object') ||
    (raw.finalKaraneh && typeof raw.finalKaraneh === 'object') ||
    (raw.jobGroups && typeof raw.jobGroups === 'object') ||
    (raw.commitments && typeof raw.commitments === 'object') ||
    (raw.payroll && typeof raw.payroll === 'object') ||
    (raw.users && typeof raw.users === 'object') ||
    (raw.system && typeof raw.system === 'object') ||
    (raw.smartDashboard && typeof raw.smartDashboard === 'object') ||
    (raw.ceoDashboard && typeof raw.ceoDashboard === 'object') ||
    (raw.unitOperations && typeof raw.unitOperations === 'object')
  );

  if (!hasModernSchema) {
    const lp = raw.canManagePersonnel === true;
    const lk = raw.canManageKaraneh === true;
    const lj = raw.canManageJobGroups === true;
    const lc = raw.canManageCommitments === true;
    const lu = raw.canManageUsers === true;
    const le = raw.canExportExcel === true;
    const li = raw.canImportExcel === true;
    const lb = raw.canBackupRestore === true;

    return syncLegacyPermissions({
      personnel: { view: lp, create: lp, edit: lp, delete: lp && lu, deleteAll: false, importExcel: lp && li, exportExcel: lp && le, viewSalary: lp, documents: lp },
      karaneh: { view: lk, create: lk, edit: lk, delete: lk && lu, deleteAll: false, importExcel: lk && li, exportExcel: lk && le, submit: false, allowedUnits: [] },
      finalKaraneh: { view: false, edit: false, delete: false, deleteAll: false, exportExcel: false },
      jobGroups: { view: lj, create: lj, edit: lj, delete: lj && lu, deleteAll: false, importExcel: lj && li, exportExcel: lj && le },
      commitments: { view: lc, create: lc, edit: lc, delete: lc && lu, deleteAll: false, print: lc, archive: lc, importExcel: lc && li, exportExcel: lc && le },
      payroll: { view: lk || lp, create: lk || lp, edit: lk || lp, delete: (lk || lp) && lu, deleteAll: false, importExcel: (lk || lp) && li, exportExcel: (lk || lp) && le },
      users: { view: lu, create: lu, edit: lu, delete: lu, deleteAll: false, importExcel: lu && li, exportExcel: lu && le },
      system: { dashboardStats: lp || lk || lj || lc || lu, backupDatabase: lb, restoreDatabase: lb },
      smartDashboard: { view: false, exportExcel: false, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
    });
  }

  const p = raw.personnel || {};
  const k = raw.karaneh || {};
  const fk = raw.finalKaraneh || {};
  const jg = raw.jobGroups || {};
  const c = raw.commitments || {};
  const pr = raw.payroll || {};
  const u = raw.users || {};
  const s = raw.system || {};
  const sd = raw.smartDashboard || {};
  const cd = raw.ceoDashboard || {};
  const uo = raw.unitOperations || {};
  const b = (v: any) => v === true;

  return syncLegacyPermissions({
    personnel: { view: b(p.view), create: b(p.create), edit: b(p.edit), delete: b(p.delete), deleteAll: b(p.deleteAll), importExcel: b(p.importExcel), exportExcel: b(p.exportExcel), viewSalary: b(p.viewSalary), documents: b(p.documents) },
    karaneh: {
      view: b(k.view),
      create: b(k.create),
      edit: b(k.edit),
      delete: b(k.delete),
      deleteAll: b(k.deleteAll),
      importExcel: b(k.importExcel),
      exportExcel: b(k.exportExcel),
      submit: b(k.submit),
      allowedUnits: Array.isArray(k.allowedUnits) ? k.allowedUnits.map(String).filter(Boolean) : [],
    },
    finalKaraneh: {
      view: b(fk.view),
      edit: b(fk.edit),
      delete: b(fk.delete),
      deleteAll: b(fk.deleteAll),
      exportExcel: b(fk.exportExcel),
    },
    jobGroups: { view: b(jg.view), create: b(jg.create), edit: b(jg.edit), delete: b(jg.delete), deleteAll: b(jg.deleteAll), importExcel: b(jg.importExcel), exportExcel: b(jg.exportExcel) },
    commitments: { view: b(c.view), create: b(c.create), edit: b(c.edit), delete: b(c.delete), deleteAll: b(c.deleteAll), print: b(c.print), archive: b(c.archive), importExcel: b(c.importExcel), exportExcel: b(c.exportExcel) },
    payroll: { view: b(pr.view), create: b(pr.create), edit: b(pr.edit), delete: b(pr.delete), deleteAll: b(pr.deleteAll), importExcel: b(pr.importExcel), exportExcel: b(pr.exportExcel) },
    users: { view: b(u.view), create: b(u.create), edit: b(u.edit), delete: b(u.delete), deleteAll: b(u.deleteAll), importExcel: b(u.importExcel), exportExcel: b(u.exportExcel) },
    system: { dashboardStats: b(s.dashboardStats), backupDatabase: b(s.backupDatabase), restoreDatabase: b(s.restoreDatabase) },
    smartDashboard: { view: b(sd.view), exportExcel: b(sd.exportExcel), print: b(sd.print) },
    ceoDashboard: { view: b(cd.view), create: b(cd.create), edit: b(cd.edit), delete: b(cd.delete), deleteAll: b(cd.deleteAll), importExcel: b(cd.importExcel), exportExcel: b(cd.exportExcel), print: b(cd.print) },
    unitOperations: { view: b(uo.view), create: b(uo.create), edit: b(uo.edit), delete: b(uo.delete), deleteAll: b(uo.deleteAll), importExcel: b(uo.importExcel), exportExcel: b(uo.exportExcel), allowedUnits: Array.isArray(uo.allowedUnits) ? uo.allowedUnits.map(String) : [] },
  });
}

function sanitizeUser(user: any) {
  if (!user || typeof user !== 'object') return user;
  const { password: _, ...rest } = user;
  return {
    ...rest,
    permissions: isSuperAdminUser(user) ? getFullAdminPermissions() : normalizePermissions(user.permissions),
  };
}

function checkPermission(user: any, section: string, action: string): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdminUser(user)) return true;
  const perms: any = normalizePermissions(user.permissions);
  return Boolean(perms?.[section]?.[action] === true);
}

const NON_ASCII_RE = /[^\x00-\x7F]/;

function toAsciiDigits(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  const s = typeof val === 'string' ? val : String(val);
  if (!NON_ASCII_RE.test(s)) return s;
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

const normKeyCache = new Map<string, string>();
const normRowCache = new WeakMap<object, Map<string, any> | null>();
const ASCII_KEY_RE = /^[a-zA-Z0-9_]+$/;

function normKey(key: string): string {
  const cached = normKeyCache.get(key);
  if (cached !== undefined) return cached;
  const normalized = toAsciiDigits(key)
    .replace(/\u200c|\u200e|\u200f|\ufeff/g, ' ')
    .replace(/[يیئى]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (normKeyCache.size < 2500) {
    normKeyCache.set(key, normalized);
  }
  return normalized;
}

function getVal(row: Record<string, any>, ...keys: string[]): any {
  if (!row || typeof row !== 'object') return undefined;
  for (let i = 0; i < keys.length; i++) {
    const v = row[keys[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  let map = normRowCache.get(row);
  if (map === undefined) {
    let hasNonAsciiKey = false;
    const rowKeys = Object.keys(row);
    for (let i = 0; i < rowKeys.length; i++) {
      if (!ASCII_KEY_RE.test(rowKeys[i])) {
        hasNonAsciiKey = true;
        break;
      }
    }
    if (!hasNonAsciiKey) {
      // Cache null sentinel so canonical mapper rows skip regex normalization on missing optional fields
      normRowCache.set(row, null);
      return undefined;
    }
    map = new Map<string, any>();
    for (let i = 0; i < rowKeys.length; i++) {
      const rk = rowKeys[i];
      const rv = row[rk];
      if (rv !== undefined && rv !== null && rv !== '') {
        const nk = normKey(rk);
        if (!map.has(nk)) map.set(nk, rv);
      }
    }
    normRowCache.set(row, map);
  }
  if (map === null) return undefined;
  for (let i = 0; i < keys.length; i++) {
    const found = map.get(normKey(keys[i]));
    if (found !== undefined) return found;
  }
  return undefined;
}

function compactRawRow(row: Record<string, any>, maxKeys = 120): Record<string, any> {
  const out: Record<string, any> = {};
  if (!row || typeof row !== 'object') return out;
  let count = 0;
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (k.startsWith('ستون_')) continue;
    out[k] = v;
    count++;
    if (count >= maxKeys) break;
  }
  return out;
}

function parseNum(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const eng = toAsciiDigits(val)
    .replace(/[,٬،\s]/g, '')
    .replace(/ریال/g, '');
  const n = Number(eng);
  return Number.isFinite(n) ? n : 0;
}

function parseYearMonth(rawYm: any, fallbackPeriod: string): string {
  const eng = toAsciiDigits(rawYm).trim();
  const cleanFallback = toAsciiDigits(fallbackPeriod).trim();
  if (!eng) return cleanFallback;
  const m1 = eng.match(/^(\d{4})\s*[-/]\s*(\d{1,2})$/);
  if (m1) {
    const mo = m1[2].padStart(2, '0');
    if (Number(mo) >= 1 && Number(mo) <= 12) return `${m1[1]}-${mo}`;
  }
  const m2 = eng.match(/^(\d{4})(\d{2})$/);
  if (m2 && Number(m2[2]) >= 1 && Number(m2[2]) <= 12) {
    return `${m2[1]}-${m2[2]}`;
  }
  return cleanFallback;
}

function getAllowedUnitsForUser(user: any): string[] {
  const raw = user?.permissions?.unitOperations?.allowedUnits;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x || '').trim()).filter(Boolean);
}

function isUnitAllowedForUser(user: any, unitName?: string): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdminUser(user) || checkPermission(user, 'ceoDashboard', 'view')) return true;
  if (!checkPermission(user, 'unitOperations', 'view')) return false;
  const allowed = getAllowedUnitsForUser(user);
  if (allowed.length === 0) return true;
  if (!unitName) return false;
  const norm = normKey(unitName);
  return allowed.some((a) => {
    const na = normKey(a);
    return na === norm || norm.includes(na) || na.includes(norm);
  });
}

function isWorkshopOrUnitAllowed(user: any, unitName?: string): boolean {
  return (
    isUnitAllowedForUser(user, unitName) ||
    isUnitAllowedForUser(user, 'واحد تعمیرگاه و ماشین‌آلات سنگین') ||
    isUnitAllowedForUser(user, 'تعمیرگاه')
  );
}

function isDispatchingOrUnitAllowed(user: any, unitName?: string): boolean {
  return (
    isUnitAllowedForUser(user, unitName) ||
    isUnitAllowedForUser(user, 'واحد دیسپچینگ و کنترل تولید') ||
    isUnitAllowedForUser(user, 'دیسپچینگ')
  );
}

function hasMiningOrUnitPerm(user: any, action: string): boolean {
  return checkPermission(user, 'ceoDashboard', action) || checkPermission(user, 'unitOperations', action);
}

function getKaranehAllowedUnitsForUser(user: any): string[] {
  const raw = user?.permissions?.karaneh?.allowedUnits;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x || '').trim()).filter(Boolean);
}

function hasFullKaranehScope(user: any): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdminUser(user) || checkPermission(user, 'finalKaraneh', 'view')) return true;
  return getKaranehAllowedUnitsForUser(user).length === 0;
}

function isKaranehUnitAllowedForUser(user: any, deptName?: string): boolean {
  if (!user || !user.isActive) return false;
  if (hasFullKaranehScope(user)) return true;
  const allowed = getKaranehAllowedUnitsForUser(user);
  if (allowed.length === 0) return true;
  if (!deptName) return false;
  const norm = normKey(deptName);
  return allowed.some((a) => {
    const na = normKey(a);
    return na === norm || norm.includes(na) || na.includes(norm);
  });
}

function buildPresetPermissions(presetName: string) {
  const p = String(presetName || '').trim();
  if (p.includes('مدیر عامل') || p.includes('مدیرعامل')) {
    return normalizePermissions({
      personnel: { view: true, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, exportExcel: true, allowedUnits: [] },
      finalKaraneh: { view: true, exportExcel: true },
      jobGroups: { view: true, exportExcel: true },
      commitments: { view: true, print: true, exportExcel: true },
      payroll: { view: true, exportExcel: true },
      system: { dashboardStats: true },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, print: true },
      unitOperations: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, allowedUnits: [] },
    });
  }
  if (p.includes('واحد') && p.includes('کارانه')) {
    return normalizePermissions({
      karaneh: { view: true, create: true, edit: true, delete: true, importExcel: true, exportExcel: true, submit: true, allowedUnits: [] },
    });
  }
  if (p.includes('دیسپچینگ')) {
    return normalizePermissions({
      personnel: { view: true },
      system: { dashboardStats: true },
      unitOperations: {
        view: true, create: true, edit: true, delete: true, importExcel: true, exportExcel: true,
        allowedUnits: ['واحد دیسپچینگ و کنترل تولید', 'استخراج و معدن‌کاری', 'حمل‌ونقل و ترابری معدنی'],
      },
    });
  }
  if (p.includes('تعمیرگاه')) {
    return normalizePermissions({
      personnel: { view: true },
      system: { dashboardStats: true },
      unitOperations: {
        view: true, create: true, edit: true, delete: true, importExcel: true, exportExcel: true,
        allowedUnits: ['تعمیرگاه و ماشین‌آلات سنگین', 'نگهداری و تعمیرات (نت) و تاسیسات'],
      },
    });
  }
  if (p.includes('سرپرست واحد')) {
    return normalizePermissions({
      personnel: { view: true, exportExcel: true },
      system: { dashboardStats: true },
      unitOperations: { view: true, create: true, edit: true, delete: true, importExcel: true, exportExcel: true, allowedUnits: [] },
    });
  }
  if (p.includes('مدیر')) return getFullAdminPermissions();
  if (p.includes('کارگزینی')) {
    return normalizePermissions({
      personnel: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, exportExcel: true },
      finalKaraneh: { view: true, exportExcel: true },
      jobGroups: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
      commitments: { view: true, create: true, edit: true, print: true, archive: true, importExcel: true, exportExcel: true },
      payroll: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
      system: { dashboardStats: true },
      smartDashboard: { view: true, exportExcel: true, print: true },
    });
  }
  if (p.includes('کارانه') || p.includes('حقوق')) {
    return normalizePermissions({
      personnel: { view: true, exportExcel: true, viewSalary: true },
      karaneh: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, submit: true, allowedUnits: [] },
      finalKaraneh: { view: true, edit: true, exportExcel: true },
      jobGroups: { view: true, exportExcel: true },
      payroll: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
      system: { dashboardStats: true },
      smartDashboard: { view: true, exportExcel: true },
    });
  }
  if (p.includes('مشاهده') || p.includes('بیننده') || p.includes('viewer')) {
    return normalizePermissions({
      personnel: { view: true, exportExcel: true },
      karaneh: { view: true, exportExcel: true },
      finalKaraneh: { view: true, exportExcel: true },
      jobGroups: { view: true, exportExcel: true },
      commitments: { view: true, print: true, exportExcel: true },
      payroll: { view: true, exportExcel: true },
      system: { dashboardStats: true },
      smartDashboard: { view: true, exportExcel: true, print: true },
    });
  }
  return getEmptyPermissions();
}

// ================= D1 DATA ACCESS HELPERS =================

function rowToUser(row: any) {
  let permissions = {};
  try {
    permissions = JSON.parse(row.permissions_json || '{}');
  } catch {
    permissions = {};
  }
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    fullName: row.full_name,
    role: row.role,
    department: row.department,
    email: row.email || '',
    uid: row.uid || '',
    permissions,
    isActive: row.is_active !== 0,
    createdAt: row.created_at || '',
    lastLogin: row.last_login || '',
  };
}

async function getAllUsers(db: D1Database): Promise<any[]> {
  const { results } = await db.prepare('SELECT * FROM users').all();
  return (results || []).map(rowToUser);
}

async function getUserById(db: D1Database, id: string): Promise<any | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return row ? rowToUser(row) : null;
}

async function getUserByUsername(db: D1Database, username: string): Promise<any | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
    .bind(username.trim())
    .first();
  return row ? rowToUser(row) : null;
}

async function upsertUser(db: D1Database, u: any): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, username, password, full_name, role, department, email, uid, permissions_json, is_active, created_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         password = excluded.password,
         full_name = excluded.full_name,
         role = excluded.role,
         department = excluded.department,
         email = excluded.email,
         uid = excluded.uid,
         permissions_json = excluded.permissions_json,
         is_active = excluded.is_active,
         created_at = excluded.created_at,
         last_login = excluded.last_login`
    )
    .bind(
      u.id,
      u.username,
      u.password || '',
      u.fullName || '',
      u.role || 'کاربر سفارشی',
      u.department || '',
      u.email || '',
      u.uid || '',
      JSON.stringify(u.permissions || {}),
      u.isActive === false ? 0 : 1,
      u.createdAt || '',
      u.lastLogin || ''
    )
    .run();
}

async function getJsonRows(db: D1Database, table: string, whereClause = '', binds: any[] = []): Promise<any[]> {
  const sql = whereClause ? `SELECT data_json FROM ${table} WHERE ${whereClause}` : `SELECT data_json FROM ${table}`;
  const stmt = binds.length > 0 ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  const { results } = await stmt.all<{ data_json: string }>();
  const out: any[] = [];
  for (const r of results || []) {
    try {
      out.push(JSON.parse(r.data_json));
    } catch {
      // skip malformed row
    }
  }
  return out;
}

async function getRawJsonArrayString(
  db: D1Database,
  table: string,
  whereClause = '',
  binds: any[] = [],
  selectExpr = 'data_json',
  limit?: number,
  offset = 0
): Promise<string> {
  let sql = whereClause
    ? `SELECT ${selectExpr} as data_json FROM ${table} WHERE ${whereClause} ORDER BY rowid ASC`
    : `SELECT ${selectExpr} as data_json FROM ${table} ORDER BY rowid ASC`;
  const finalBinds = [...binds];
  if (typeof limit === 'number' && limit > 0) {
    sql += ' LIMIT ? OFFSET ?';
    finalBinds.push(limit, Math.max(0, offset));
  }
  const stmt = finalBinds.length > 0 ? db.prepare(sql).bind(...finalBinds) : db.prepare(sql);
  const { results } = await stmt.all<{ data_json: string }>();
  const parts: string[] = [];
  for (const r of results || []) {
    const s = typeof r.data_json === 'string' ? r.data_json.trim() : '';
    if (s && (s[0] === '{' || s[0] === '[')) {
      parts.push(s);
    }
  }
  return `[${parts.join(',')}]`;
}

function parsePagination(url: URL): { hasPagination: boolean; limit: number; offset: number } {
  const rawLimit = url.searchParams.get('limit');
  if (!rawLimit) return { hasPagination: false, limit: 0, offset: 0 };
  const limit = Math.max(1, Math.min(1000, parseInt(rawLimit, 10) || 200));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  return { hasPagination: true, limit, offset };
}

function rawJsonResponse(request: Request, env: Env, rawJsonBody: string, status = 200): Response {
  return new Response(rawJsonBody, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(request, env),
    },
  });
}

async function getPersonnelLookupMap(
  db: D1Database,
  codes?: string[]
): Promise<Map<string, { id: string; personnelCode: string; fullName: string; nationalId: string; department: string; position: string; employeeId: string }>> {
  const map = new Map<string, any>();
  const baseSelect = `SELECT id,
              personnel_code as personnelCode,
              COALESCE(json_extract(data_json, '$.fullName'), '') as fullName,
              COALESCE(json_extract(data_json, '$.nationalId'), '') as nationalId,
              COALESCE(json_extract(data_json, '$.department'), '') as department,
              COALESCE(json_extract(data_json, '$.position'), '') as position,
              COALESCE(json_extract(data_json, '$.employeeId'), '') as employeeId
       FROM personnel`;

  if (Array.isArray(codes) && codes.length > 0) {
    const cleanCodes = Array.from(new Set(codes.map((c) => toAsciiDigits(c).trim()).filter(Boolean)));
    const slices: string[][] = [];
    for (let i = 0; i < cleanCodes.length; i += 90) {
      slices.push(cleanCodes.slice(i, i + 90));
    }
    const responses = await Promise.all(
      slices.map((slice) => {
        const placeholders = slice.map(() => '?').join(',');
        return db
          .prepare(`${baseSelect} WHERE personnel_code IN (${placeholders})`)
          .bind(...slice)
          .all<any>();
      })
    );
    for (const res of responses) {
      for (const r of res.results || []) {
        const code = toAsciiDigits(r.personnelCode).trim();
        if (code) map.set(code, { ...r, personnelCode: code });
      }
    }
    return map;
  }

  const { results } = await db.prepare(baseSelect).all<any>();
  for (const r of results || []) {
    const code = toAsciiDigits(r.personnelCode).trim();
    if (code) map.set(code, { ...r, personnelCode: code });
  }
  return map;
}

async function batchExecuteChunked(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  const CHUNK = 25;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await db.batch(stmts.slice(i, i + CHUNK));
  }
}

async function batchExecuteAndTouch(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  const version = String(Date.now());
  const metaStmt = db
    .prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_saved', ?), ('sync_version', ?)")
    .bind(faDateTime(), version);
  if (stmts.length === 0) {
    await metaStmt.run();
    return;
  }
  const CHUNK = 25;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    const slice = stmts.slice(i, i + CHUNK);
    if (i + CHUNK >= stmts.length) {
      slice.push(metaStmt);
    }
    await db.batch(slice);
  }
}

function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function buildMultiRowUpsertStmts(
  db: D1Database,
  table: string,
  columns: string[],
  conflictCol: string,
  updateCols: string[],
  rows: any[][],
  customUpdateSql?: string
): D1PreparedStatement[] {
  if (rows.length === 0) return [];
  const maxRowsPerStmt = Math.max(1, Math.floor(96 / columns.length));
  // D1 limits bound SQL statements to ~100KB UTF-8 bytes; stay well below to prevent SQLITE_TOOBIG with Persian JSON
  const MAX_STMT_BYTES = 58_000;
  const colList = columns.join(', ');
  const rowPlaceholder = `(${columns.map(() => '?').join(',')})`;
  const updateSql = customUpdateSql || updateCols.map((c) => `${c} = excluded.${c}`).join(', ');
  const baseSqlBytes = utf8ByteLength(table) + utf8ByteLength(colList) + utf8ByteLength(updateSql) + 64;
  const stmts: D1PreparedStatement[] = [];

  let currentSlice: any[][] = [];
  let currentBytes = baseSqlBytes;

  const flushSlice = () => {
    if (currentSlice.length === 0) return;
    const valuesSql = currentSlice.map(() => rowPlaceholder).join(',');
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${valuesSql} ON CONFLICT(${conflictCol}) DO UPDATE SET ${updateSql}`;
    const binds: any[] = [];
    for (let i = 0; i < currentSlice.length; i++) {
      const r = currentSlice[i];
      for (let j = 0; j < r.length; j++) binds.push(r[j]);
    }
    stmts.push(db.prepare(sql).bind(...binds));
    currentSlice = [];
    currentBytes = baseSqlBytes;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let rowBytes = rowPlaceholder.length + 2;
    for (let j = 0; j < r.length; j++) {
      if (typeof r[j] === 'string') rowBytes += utf8ByteLength(r[j]) + 4;
      else rowBytes += 16;
    }
    if (
      currentSlice.length > 0 &&
      (currentSlice.length >= maxRowsPerStmt || currentBytes + rowBytes > MAX_STMT_BYTES)
    ) {
      flushSlice();
    }
    currentSlice.push(r);
    currentBytes += rowBytes;
  }
  flushSlice();
  return stmts;
}

async function touchLastSaved(db: D1Database): Promise<string> {
  const version = String(Date.now());
  await db
    .prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_saved', ?), ('sync_version', ?)")
    .bind(faDateTime(), version)
    .run();
  return version;
}

async function getSyncMeta(db: D1Database): Promise<{ syncVersion: string; lastSaved: string }> {
  const { results } = await db
    .prepare("SELECT key, value FROM app_meta WHERE key IN ('sync_version', 'last_saved')")
    .all<{ key: string; value: string }>();
  let syncVersion = '1';
  let lastSaved = '';
  for (const r of results || []) {
    if (r.key === 'sync_version' && r.value) syncVersion = String(r.value);
    if (r.key === 'last_saved' && r.value) lastSaved = String(r.value);
  }
  return { syncVersion, lastSaved: lastSaved || faDateTime() };
}

async function computeDatabaseStatus(db: D1Database, authUser: any) {
  const [
    persAgg,
    karAgg,
    payAgg,
    usrAgg,
    jgRow,
    jcRow,
    cmtAgg,
    mvRow,
    mmRow,
    urRow,
    meta,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) as total,
           COALESCE(SUM(CASE WHEN (data_json LIKE '%"nationalCardImage":"_%' OR data_json LIKE '%"shenasnamehPages":["_%') AND json_valid(data_json) AND (COALESCE(json_extract(data_json, '$.documents.nationalCardImage'), '') != '' OR COALESCE(json_array_length(json_extract(data_json, '$.documents.shenasnamehPages')), 0) > 0) THEN 1 ELSE 0 END), 0) as docsCount,
           COALESCE(SUM(CASE WHEN data_json LIKE '%"relatives":[{%' AND json_valid(data_json) THEN COALESCE(json_array_length(json_extract(data_json, '$.relatives')), 0) ELSE 0 END), 0) as relCount
         FROM personnel`
      )
      .first<any>(),
    db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT NULLIF(period, \'\')) as periods FROM karaneh').first<any>(),
    db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT NULLIF(period, \'\')) as periods FROM payroll').first<any>(),
    db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN is_active != 0 THEN 1 ELSE 0 END), 0) as activeTotal FROM users').first<any>(),
    db.prepare('SELECT COUNT(*) as total FROM job_groups').first<any>(),
    db.prepare('SELECT COUNT(*) as total FROM job_classifications').first<any>(),
    db
      .prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN (data_json LIKE '%"isArchived":true%' OR data_json LIKE '%"isArchived":1%') AND json_valid(data_json) AND json_extract(data_json, '$.isArchived') = 1 THEN 1 ELSE 0 END), 0) as archivedTotal
         FROM commitments`
      )
      .first<any>(),
    db.prepare('SELECT COUNT(*) as total FROM mining_volumes').first<any>(),
    db.prepare('SELECT COUNT(*) as total FROM mining_machinery').first<any>(),
    db.prepare('SELECT COUNT(*) as total FROM unit_reports').first<any>(),
    getSyncMeta(db),
  ]);

  const canStats =
    isSuperAdminUser(authUser) ||
    checkPermission(authUser, 'system', 'dashboardStats') ||
    checkPermission(authUser, 'system', 'backupDatabase') ||
    checkPermission(authUser, 'system', 'restoreDatabase');
  const canPers = canStats || checkPermission(authUser, 'personnel', 'view');
  const canKar = canStats || checkPermission(authUser, 'karaneh', 'view') || checkPermission(authUser, 'finalKaraneh', 'view');
  const canPay = canStats || checkPermission(authUser, 'payroll', 'view');
  const canUsers = canStats || checkPermission(authUser, 'users', 'view');
  const canJg = canStats || checkPermission(authUser, 'jobGroups', 'view');
  const canCmt = canStats || checkPermission(authUser, 'commitments', 'view');
  const canMining = canStats || hasMiningOrUnitPerm(authUser, 'view');

  return {
    storageLocation: 'دیتابیس ابری دائمی و رایگان Cloudflare D1',
    storageEngine: 'cloudflare-d1',
    totalPersonnel: canPers ? Number(persAgg?.total || 0) : 0,
    totalRelatives: canPers ? Number(persAgg?.relCount || 0) : 0,
    totalKaranehRecords: canKar ? Number(karAgg?.total || 0) : 0,
    totalPayrollRecords: canPay ? Number(payAgg?.total || 0) : 0,
    totalUsers: canUsers ? Number(usrAgg?.total || 0) : 0,
    totalActiveUsers: canUsers ? Number(usrAgg?.activeTotal || 0) : 0,
    totalPersonnelWithDocs: canPers ? Number(persAgg?.docsCount || 0) : 0,
    payrollPeriodsCount: canPay ? Number(payAgg?.periods || 0) : 0,
    karanehPeriodsCount: canKar ? Number(karAgg?.periods || 0) : 0,
    totalJobGroups: canJg ? Number(jgRow?.total || 0) : 0,
    totalJobClassifications: canJg ? Number(jcRow?.total || 0) : 0,
    totalCommitments: canCmt ? Number(cmtAgg?.total || 0) : 0,
    totalArchivedCommitments: canCmt ? Number(cmtAgg?.archivedTotal || 0) : 0,
    totalMiningVolumes: canMining ? Number(mvRow?.total || 0) : 0,
    totalMiningMachinery: canMining ? Number(mmRow?.total || 0) : 0,
    totalUnitReports: canMining ? Number(urRow?.total || 0) : 0,
    fileSizeBytes: 0,
    lastSaved: meta.lastSaved,
    syncVersion: meta.syncVersion,
    isLocalHost: false,
    hostPlatform: 'cloudflare-workers-d1',
    authProtected: true,
    schemaVersion: '5.0-negin-parto-nasr-units-hub',
  };
}

// ================= INITIAL SCHEMA & SEED =================

async function buildInitialSeedData() {
  return {
    users: [
      {
        id: 'u-admin-1',
        username: 'javadabadiyan',
        password: await hashPassword('javad_5221157'),
        fullName: 'جواد آبادیان (مدیر ارشد سامانه)',
        role: 'super_admin',
        department: 'مدیریت منابع انسانی و کارگزینی',
        permissions: getFullAdminPermissions(),
        isActive: true,
        createdAt: '1403/01/01',
        lastLogin: 'هم‌اکنون',
      },
      {
        id: 'u-officer-2',
        username: 'karaneh_admin',
        password: await hashPassword('12345678'),
        fullName: 'سارا کاظمی (کارشناس ارزیابی و کارانه)',
        role: 'karaneh_officer',
        department: 'اداره جبران خدمت و کارانه',
        permissions: normalizePermissions({
          personnel: { view: true, exportExcel: true, viewSalary: true },
          karaneh: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, submit: true, allowedUnits: [] },
          finalKaraneh: { view: true, edit: true, exportExcel: true },
          jobGroups: { view: true, exportExcel: true },
          payroll: { view: true, exportExcel: true },
          smartDashboard: { view: true, exportExcel: true },
          system: { dashboardStats: true },
        }),
        isActive: true,
        createdAt: '1403/03/10',
        lastLogin: '۱۴۰۳/۰۸/۰۲',
      },
      {
        id: 'u-officer-3',
        username: 'hr_expert',
        password: await hashPassword('12345678'),
        fullName: 'محمد امینی (کارشناس امور اداری و پرسنلی)',
        role: 'hr_officer',
        department: 'امور کارکنان و قراردادها',
        permissions: normalizePermissions({
          personnel: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
          karaneh: { view: true, exportExcel: true },
          jobGroups: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
          commitments: { view: true, create: true, edit: true, print: true, archive: true, importExcel: true, exportExcel: true },
          payroll: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
          smartDashboard: { view: true, exportExcel: true, print: true },
          system: { dashboardStats: true },
        }),
        isActive: true,
        createdAt: '1403/04/15',
        lastLogin: '۱۴۰۳/۰۸/۰۱',
      },
    ],
    jobGroups: [
      { id: 'jg-1', code: 'گروه ۱۶', title: 'مدیران ارشد و رؤسای ادارات', grade: 16, minBaseSalary: 280000000, maxBaseSalary: 450000000, maxKaranehCeiling: 120000000, requiredExperienceYears: 12, requiredDegree: 'کارشناسی ارشد یا دکتری', description: 'راهبری استراتژیک، مدیریت واحدهای ستادی و مسئولیت نهایی برنامه‌ها' },
      { id: 'jg-2', code: 'گروه ۱۴', title: 'کارشناسان مسئول و سرپرستان', grade: 14, minBaseSalary: 220000000, maxBaseSalary: 320000000, maxKaranehCeiling: 85000000, requiredExperienceYears: 8, requiredDegree: 'کارشناسی یا کارشناسی ارشد', description: 'نظارت اجرایی، هماهنگی پروژه‌ها و هدایت تیم‌های تخصصی' },
      { id: 'jg-3', code: 'گروه ۱۲', title: 'کارشناسان ارشد تخصصی', grade: 12, minBaseSalary: 180000000, maxBaseSalary: 260000000, maxKaranehCeiling: 65000000, requiredExperienceYears: 5, requiredDegree: 'کارشناسی مرتبط', description: 'اجرای وظایف تخصصی، تحلیل فرآیندها و توسعه سامانه‌ها' },
      { id: 'jg-4', code: 'گروه ۱۰', title: 'کارشناسان و تکنسین‌های فنی', grade: 10, minBaseSalary: 140000000, maxBaseSalary: 200000000, maxKaranehCeiling: 50000000, requiredExperienceYears: 3, requiredDegree: 'کارشناسی یا کاردانی فنی', description: 'پشتیبانی فنی، نگهداری تجهیزات و امور اجرایی' },
      { id: 'jg-5', code: 'گروه ۸', title: 'متصدیان اداری و پشتیبانی', grade: 8, minBaseSalary: 110000000, maxBaseSalary: 160000000, maxKaranehCeiling: 35000000, requiredExperienceYears: 1, requiredDegree: 'دیپلم یا کاردانی', description: 'دبیرخانه، بایگانی، خدمات دفتری و لجستیک' },
    ],
    jobClassifications: [],
    personnel: [
      { id: 'p-101', personnelCode: '10101', firstName: 'رضا', lastName: 'قاسمی', fullName: 'رضا قاسمی', nationalId: '0078912345', position: 'مدیر فناوری اطلاعات و سامانه‌ها', department: 'فناوری اطلاعات', hireDate: '1397/02/10', employmentType: 'رسمی', jobGroupId: 'jg-1', jobGroupName: 'گروه ۱۶ - مدیران ارشد و رؤسای ادارات', education: 'کارشناسی ارشد مهندسی نرم‌افزار', phone: '09121114567', email: 'r.ghasemi@org.ir', status: 'فعال', baseSalary: 340000000, notes: 'مسئول مستقیم تحول دیجیتال و سرورهای مرکزی', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
      { id: 'p-102', personnelCode: '10102', firstName: 'زهرا', lastName: 'کریمی', fullName: 'زهرا کریمی', nationalId: '0065432109', position: 'رئیس حسابداری و بودجه', department: 'امور مالی و اقتصادی', hireDate: '1398/05/15', employmentType: 'رسمی', jobGroupId: 'jg-2', jobGroupName: 'گروه ۱۴ - کارشناسان مسئول و سرپرستان', education: 'کارشناسی ارشد حسابداری و مدیریت مالی', phone: '09122225678', email: 'z.karimi@org.ir', status: 'فعال', baseSalary: 290000000, notes: 'ناظر بر فرآیندهای مالیاتی و محاسبات کارانه', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
      { id: 'p-103', personnelCode: '10103', firstName: 'امیرحسین', lastName: 'مرادی', fullName: 'امیرحسین مرادی', nationalId: '0451239876', position: 'کارشناس ارشد شبکه و امنیت', department: 'فناوری اطلاعات', hireDate: '1400/07/01', employmentType: 'پیمانی', jobGroupId: 'jg-3', jobGroupName: 'گروه ۱۲ - کارشناسان ارشد تخصصی', education: 'کارشناسی مهندسی فناوری اطلاعات', phone: '09123336789', email: 'a.moradi@org.ir', status: 'فعال', baseSalary: 235000000, notes: 'طراح معماری دیتابیس ابری و امنیت', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
      { id: 'p-104', personnelCode: '10104', firstName: 'فاطمه', lastName: 'صادقی', fullName: 'فاطمه صادقی', nationalId: '0032165498', position: 'کارشناس کارگزینی و تشکیلات', department: 'منابع انسانی', hireDate: '1401/03/20', employmentType: 'قراردادی', jobGroupId: 'jg-3', jobGroupName: 'گروه ۱۲ - کارشناسان ارشد تخصصی', education: 'کارشناسی مدیریت دولتی', phone: '09124447890', email: 'f.sadeghi@org.ir', status: 'فعال', baseSalary: 195000000, notes: 'مسئول ثبت و پایش تعهدات پرسنلی و پرونده‌ها', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
      { id: 'p-105', personnelCode: '10105', firstName: 'مهدی', lastName: 'نجفی', fullName: 'مهدی نجفی', nationalId: '0389874561', position: 'سرپرست خط تولید و تضمین کیفیت', department: 'تولید و عملیات', hireDate: '1399/11/12', employmentType: 'رسمی', jobGroupId: 'jg-2', jobGroupName: 'گروه ۱۴ - کارشناسان مسئول و سرپرستان', education: 'کارشناسی مهندسی صنایع', phone: '09125558901', email: 'm.najafi@org.ir', status: 'فعال', baseSalary: 275000000, notes: 'مدیریت شیفت‌های کارگاهی و راندمان خطوط', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
      { id: 'p-106', personnelCode: '10106', firstName: 'سمیرا', lastName: 'پژمان', fullName: 'سمیرا پژمان', nationalId: '0081234567', position: 'مسئول دفتر مدیرعامل و دبیرخانه', department: 'مدیریت و پشتیبانی', hireDate: '1402/01/15', employmentType: 'قراردادی', jobGroupId: 'jg-5', jobGroupName: 'گروه ۸ - متصدیان اداری و پشتیبانی', education: 'کاردانی روابط عمومی', phone: '09126669012', email: 's.pezhman@org.ir', status: 'فعال', baseSalary: 145000000, notes: 'پیگیری مکاتبات اداری و ارجاعات کارگزینی', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
    ],
    karaneh: [
      { id: 'k-101-07', personnelId: 'p-101', personnelCode: '10101', fullName: 'رضا قاسمی', department: 'فناوری اطلاعات', position: 'مدیر فناوری اطلاعات و سامانه‌ها', period: '1403-07', baseKaraneh: 60000000, overtimeBonus: 20000000, deductions: 0, finalKaraneh: 80000000, notes: 'تحویل فاز یک شبکه', updatedAt: '1403/07/28' },
      { id: 'k-102-07', personnelId: 'p-102', personnelCode: '10102', fullName: 'زهرا کریمی', department: 'امور مالی و اقتصادی', position: 'رئیس حسابداری و بودجه', period: '1403-07', baseKaraneh: 48000000, overtimeBonus: 12000000, deductions: 0, finalKaraneh: 60000000, notes: 'بستن حساب‌های شش‌ماهه', updatedAt: '1403/07/28' },
      { id: 'k-103-07', personnelId: 'p-103', personnelCode: '10103', fullName: 'امیرحسین مرادی', department: 'فناوری اطلاعات', position: 'کارشناس ارشد شبکه و امنیت', period: '1403-07', baseKaraneh: 38000000, overtimeBonus: 7000000, deductions: 0, finalKaraneh: 45000000, notes: 'پیکربندی فایروال', updatedAt: '1403/07/28' },
      { id: 'k-104-07', personnelId: 'p-104', personnelCode: '10104', fullName: 'فاطمه صادقی', department: 'منابع انسانی', position: 'کارشناس کارگزینی و تشکیلات', period: '1403-07', baseKaraneh: 32000000, overtimeBonus: 6000000, deductions: 0, finalKaraneh: 38000000, notes: 'ساماندهی پرونده‌های فیزیکی', updatedAt: '1403/07/28' },
      { id: 'k-105-07', personnelId: 'p-105', personnelCode: '10105', fullName: 'مهدی نجفی', department: 'تولید و عملیات', position: 'سرپرست خط تولید و تضمین کیفیت', period: '1403-07', baseKaraneh: 46000000, overtimeBonus: 14000000, deductions: 0, finalKaraneh: 60000000, notes: 'کاهش ضایعات خط A', updatedAt: '1403/07/28' },
      { id: 'k-106-07', personnelId: 'p-106', personnelCode: '10106', fullName: 'سمیرا پژمان', department: 'مدیریت و پشتیبانی', position: 'مسئول دفتر مدیرعامل و دبیرخانه', period: '1403-07', baseKaraneh: 22000000, overtimeBonus: 4000000, deductions: 0, finalKaraneh: 26000000, notes: 'نظم در مکاتبات جلسات هیئت‌مدیره', updatedAt: '1403/07/28' },
      { id: 'k-101-08', personnelId: 'p-101', personnelCode: '10101', fullName: 'رضا قاسمی', department: 'فناوری اطلاعات', position: 'مدیر فناوری اطلاعات و سامانه‌ها', period: '1403-08', baseKaraneh: 65000000, overtimeBonus: 28000000, deductions: 0, finalKaraneh: 93000000, notes: 'راه‌اندازی کامل دیتابیس ابری (+۱۶.۲۵٪ رشد)', updatedAt: '1403/08/29' },
      { id: 'k-102-08', personnelId: 'p-102', personnelCode: '10102', fullName: 'زهرا کریمی', department: 'امور مالی و اقتصادی', position: 'رئیس حسابداری و بودجه', period: '1403-08', baseKaraneh: 52000000, overtimeBonus: 16000000, deductions: 0, finalKaraneh: 68000000, notes: 'ارائه گزارش تحلیلی سود و زیان واحدها (+۱۳.۳٪ رشد)', updatedAt: '1403/08/29' },
      { id: 'k-103-08', personnelId: 'p-103', personnelCode: '10103', fullName: 'امیرحسین مرادی', department: 'فناوری اطلاعات', position: 'کارشناس ارشد شبکه و امنیت', period: '1403-08', baseKaraneh: 42000000, overtimeBonus: 11000000, deductions: 0, finalKaraneh: 53000000, notes: 'پیاده‌سازی رمزنگاری اطلاعات (+۱۷.۸٪ رشد)', updatedAt: '1403/08/29' },
      { id: 'k-104-08', personnelId: 'p-104', personnelCode: '10104', fullName: 'فاطمه صادقی', department: 'منابع انسانی', position: 'کارشناس کارگزینی و تشکیلات', period: '1403-08', baseKaraneh: 34000000, overtimeBonus: 8000000, deductions: 0, finalKaraneh: 42000000, notes: 'ورود اطلاعات اکسل پرونده‌های پرسنلی (+۱۰.۵٪ رشد)', updatedAt: '1403/08/29' },
      { id: 'k-105-08', personnelId: 'p-105', personnelCode: '10105', fullName: 'مهدی نجفی', department: 'تولید و عملیات', position: 'سرپرست خط تولید و تضمین کیفیت', period: '1403-08', baseKaraneh: 42000000, overtimeBonus: 10000000, deductions: 4000000, finalKaraneh: 48000000, notes: 'کسر به دلیل تاخیر در تحویل محموله خط تولید (-۲۰٪ کاهش)', updatedAt: '1403/08/29' },
      { id: 'k-106-08', personnelId: 'p-106', personnelCode: '10106', fullName: 'سمیرا پژمان', department: 'مدیریت و پشتیبانی', position: 'مسئول دفتر مدیرعامل و دبیرخانه', period: '1403-08', baseKaraneh: 24000000, overtimeBonus: 5000000, deductions: 0, finalKaraneh: 29000000, notes: 'هماهنگی منظم همایش سالانه (+۱۱.۵٪ رشد)', updatedAt: '1403/08/29' },
    ],
    commitments: [
      { id: 'cmt-1', personnelId: 'p-101', personnelCode: '10101', personnelName: 'رضا قاسمی', commitmentType: 'تعهد خدمت', amount: 1500000000, previouslyTakenAmount: 300000000, maxAllowedAmount: 2500000000, startDate: '1397/02/10', endDate: '1407/02/10', status: 'جاری و معتبر', isArchived: false, guarantorName: 'مهندس احمد باقری', notes: 'تعهد خدمت ۱۰ ساله بابت بورسیه دوره‌های امنیت پیشرفته' },
      { id: 'cmt-2', personnelId: 'p-102', personnelCode: '10102', personnelName: 'زهرا کریمی', commitmentType: 'تعهد حسابداری', amount: 500000000, previouslyTakenAmount: 250000000, maxAllowedAmount: 1500000000, startDate: '1403/05/15', endDate: '1405/05/15', status: 'جاری و معتبر', isArchived: false, guarantorName: 'دکتر علیرضا کریمی', notes: 'تعهد حسابداری مسئول امور مالی و تنخواه گردان' },
      { id: 'cmt-3', personnelId: 'p-103', personnelCode: '10103', personnelName: 'امیرحسین مرادی', commitmentType: 'سفته حسن انجام کار', amount: 800000000, previouslyTakenAmount: 0, maxAllowedAmount: 1200000000, startDate: '1400/07/01', endDate: '1404/07/01', status: 'جاری و معتبر', isArchived: false, guarantorName: 'پدر - حسن مرادی', notes: 'تضمین اموال رایانه‌ای و دیتاسنتر' },
      { id: 'cmt-4', personnelId: 'p-104', personnelCode: '10104', personnelName: 'فاطمه صادقی', commitmentType: 'تعهد دوره‌های آموزشی', amount: 300000000, previouslyTakenAmount: 100000000, maxAllowedAmount: 600000000, startDate: '1402/06/01', endDate: '1404/06/01', status: 'جاری و معتبر', isArchived: false, guarantorName: '-', notes: 'تعهد خدمت دو ساله پس از گذراندن دوره طبقه‌بندی مشاغل' },
    ],
    payroll: [],
    miningVolumes: [
      { id: 'mv-140307-1', period: '1403-07', unitName: 'استخراج و معدن‌کاری', activityType: 'استخراج ماده معدنی', metricTitle: 'استخراج سینه کار اصلی', volumeValue: 44200, targetVolume: 48000, unitLabel: 'تن', status: 'تکمیل‌شده', notes: 'عملکرد مهرماه', updatedAt: '1403/07/30' },
      { id: 'mv-140307-2', period: '1403-07', unitName: 'تراش و باطله‌برداری', activityType: 'باطله‌برداری', metricTitle: 'باطله‌برداری جبهه شمالی', volumeValue: 56000, targetVolume: 58000, unitLabel: 'مترمکعب', status: 'تکمیل‌شده', notes: 'آمار بارگیری و حمل باطله', updatedAt: '1403/07/30' },
      { id: 'mv-140307-3', period: '1403-07', unitName: 'فرآوری و سنگ‌شکن', activityType: 'خردایش و دانه‌بندی', metricTitle: 'خوراک ورودی سنگ‌شکن', volumeValue: 39500, targetVolume: 42000, unitLabel: 'تن', status: 'تکمیل‌شده', notes: 'بهره‌برداری خط یک و دو', updatedAt: '1403/07/30' },
      { id: 'mv-140308-1', period: '1403-08', unitName: 'استخراج و معدن‌کاری', activityType: 'استخراج ماده معدنی', metricTitle: 'استخراج سینه کار اصلی', volumeValue: 49800, targetVolume: 50000, unitLabel: 'تن', status: 'نزدیک به هدف', notes: 'رشد ۱۲.۷ درصدی نسبت به مهرماه', updatedAt: '1403/08/29' },
      { id: 'mv-140308-2', period: '1403-08', unitName: 'تراش و باطله‌برداری', activityType: 'باطله‌برداری', metricTitle: 'باطله‌برداری جبهه شمالی', volumeValue: 63400, targetVolume: 60000, unitLabel: 'مترمکعب', status: 'فراتر از برنامه', notes: 'اضافه‌شدن یک دستگاه دامپتراک', updatedAt: '1403/08/29' },
      { id: 'mv-140308-3', period: '1403-08', unitName: 'فرآوری و سنگ‌شکن', activityType: 'خردایش و دانه‌بندی', metricTitle: 'خوراک ورودی سنگ‌شکن', volumeValue: 45100, targetVolume: 44000, unitLabel: 'تن', status: 'فراتر از برنامه', notes: 'کاهش توقفات خط سنگ‌شکن', updatedAt: '1403/08/29' },
    ],
    miningMachinery: [
      { id: 'mm-1', machineCode: 'EQ-DT-101', machineName: 'دامپتراک بلاز ۴۵ تن شماره ۱', machineType: 'دامپتراک', unitName: 'حمل و نقل و بارگیری', status: 'آماده به کار', issueDescription: 'سالم و فعال در شیفت روز و شب', stoppedSince: '-', estimatedReadyDate: '-', operatorName: 'حسین محمدی', notes: 'آماده سرویس کامل', updatedAt: '1403/08/29' },
      { id: 'mm-2', machineCode: 'EQ-DT-102', machineName: 'دامپتراک کوماتسو HD465 شماره ۲', machineType: 'دامپتراک', unitName: 'حمل و نقل و بارگیری', status: 'آماده به کار', issueDescription: 'فعال در مسیر جبهه استخراج به سنگ‌شکن', stoppedSince: '-', estimatedReadyDate: '-', operatorName: 'مجید کریمی', notes: '', updatedAt: '1403/08/29' },
      { id: 'mm-3', machineCode: 'EQ-EX-201', machineName: 'بیل مکانیکی کوماتسو PC400', machineType: 'بیل مکانیکی', unitName: 'استخراج و معدن‌کاری', status: 'خراب / در تعمیرگاه', issueDescription: 'نشتی جک بوم و تعویض پکینگ هیدرولیک در تعمیرگاه مرکزی', stoppedSince: '1403/08/22', estimatedReadyDate: '1403/08/28', operatorName: 'تیم تعمیرات سنگین', notes: 'کیت پکینگ تامین شد', updatedAt: '1403/08/29' },
      { id: 'mm-4', machineCode: 'EQ-LD-301', machineName: 'لودر کاترپیلار 966H شماره ۱', machineType: 'لودر', unitName: 'فرآوری و سنگ‌شکن', status: 'در انتظار قطعه', issueDescription: 'نیاز به تعویض پمپ گیربکس و فیلترهای فشار قوی', stoppedSince: '1403/08/19', estimatedReadyDate: '1403/09/02', operatorName: 'واحد تعمیرگاه', notes: 'درخواست خرید فوری ارسال شده', updatedAt: '1403/08/29' },
      { id: 'mm-5', machineCode: 'EQ-BD-401', machineName: 'بولدوزر کوماتسو D155A', machineType: 'بولدوزر', unitName: 'تراش و باطله‌برداری', status: 'سرویس دوره‌ای', issueDescription: 'تعویض روغن ۵۰۰ ساعته و آچارکشی زیربندی', stoppedSince: '1403/08/26', estimatedReadyDate: '1403/08/27', operatorName: 'سرویسکار سیار', notes: 'تحویل در شیفت صبح', updatedAt: '1403/08/29' },
    ],
    unitReports: [
      { id: 'ur-140308-1', period: '1403-08', unitName: 'واحد فرآوری و سنگ‌شکن', reportCategory: 'تولید و فرآوری', metricName: 'خوراک ورودی به سنگ‌شکن اولیه', actualValue: 45100, previousValue: 39500, targetValue: 44000, unitLabel: 'تن', status: 'تایید شده', submittedBy: 'سرپرست سنگ‌شکن', notes: 'افزایش راندمان خط خردایش شماره ۱ و ۲', rawFields: { 'شیفت فعال': '۳ شیفت', 'ساعات کارکرد مفید': 612, 'ضریب دسترسی': '۹۴٪' }, updatedAt: '1403/08/29' },
      { id: 'ur-140308-2', period: '1403-08', unitName: 'واحد حفاری و آتشباری', reportCategory: 'عملیات استخراج', metricName: 'متراژ حفاری چال‌های انفجاری', actualValue: 12850, previousValue: 11400, targetValue: 12500, unitLabel: 'متر', status: 'تایید شده', submittedBy: 'واحد آتشباری معدن', notes: 'تکمیل الگوی حفاری پله ۴ و ۵ شمالی', rawFields: { 'تعداد چال': 1420, 'مصرف ماده منفجره (کیلوگرم)': 18400 }, updatedAt: '1403/08/29' },
      { id: 'ur-140308-3', period: '1403-08', unitName: 'واحد ایمنی، بهداشت و محیط زیست (HSE)', reportCategory: 'ایمنی و بازرسی', metricName: 'نرخ انطباق ایمنی شیفت‌های معدن', actualValue: 98.5, previousValue: 96.2, targetValue: 98, unitLabel: 'درصد', status: 'تایید شده', submittedBy: 'مسئول HSE', notes: 'صفر بودن حوادث منجر به فوت یا توقف کار', rawFields: { 'تعداد بازرسی': 64, 'مانور ایمنی برگزارشده': 3 }, updatedAt: '1403/08/29' },
      { id: 'ur-140308-4', period: '1403-08', unitName: 'واحد انبار، تدارکات و بازرگانی', reportCategory: 'پشتیبانی و تامین', metricName: 'نرخ تامین به‌موقع قطعات مصرفی', actualValue: 92, previousValue: 87, targetValue: 95, unitLabel: 'درصد', status: 'در انتظار بررسی', submittedBy: 'واحد انبار مرکزی', notes: 'سفارش‌گذاری فوری پمپ گیربکس لودر 966H', rawFields: { 'تعداد حواله صادره': 318, 'اقلام بحرانی در مسیر': 4 }, updatedAt: '1403/08/29' },
    ],
  };
}

async function upsertChunkIntoD1(db: D1Database, table: string, items: any[]): Promise<number> {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let stmts: D1PreparedStatement[] = [];
  if (table === 'users') {
    const existingUsers = await getAllUsers(db);
    const existingById = new Map(existingUsers.map((u: any) => [String(u.id), u]));
    const rows: any[][] = [];
    for (const u of items) {
      if (!u || !u.id || !u.username) continue;
      const prev = existingById.get(String(u.id));
      let pass = u.password || prev?.password || '';
      if (pass && !String(pass).startsWith('pbkdf2$') && !String(pass).startsWith('sha256$')) {
        if (String(pass).startsWith('scrypt$')) {
          pass = u.username === 'javadabadiyan' ? await hashPassword('javad_5221157') : await hashPassword('12345678');
        } else {
          pass = await hashPassword(String(pass));
        }
      } else if (!pass) {
        pass = u.username === 'javadabadiyan' ? await hashPassword('javad_5221157') : await hashPassword('12345678');
      }
      const normalizedPerms =
        u.username === 'javadabadiyan' || u.role === 'super_admin'
          ? getFullAdminPermissions()
          : normalizePermissions(u.permissions || prev?.permissions);
      rows.push([
        String(u.id),
        String(u.username),
        pass,
        u.fullName || prev?.fullName || '',
        u.role || prev?.role || 'کاربر سفارشی',
        u.department || prev?.department || '',
        u.email || prev?.email || '',
        u.uid || prev?.uid || '',
        JSON.stringify(normalizedPerms),
        u.isActive === false ? 0 : 1,
        u.createdAt || prev?.createdAt || '',
        u.lastLogin || prev?.lastLogin || '',
      ]);
    }
    stmts = buildMultiRowUpsertStmts(
      db,
      'users',
      ['id', 'username', 'password', 'full_name', 'role', 'department', 'email', 'uid', 'permissions_json', 'is_active', 'created_at', 'last_login'],
      'id',
      ['username', 'password', 'full_name', 'role', 'department', 'email', 'uid', 'permissions_json', 'is_active', 'created_at', 'last_login'],
      rows
    );
  } else if (table === 'personnel') {
    const rows = items.filter((p) => p?.id).map((p) => [String(p.id), toAsciiDigits(p.personnelCode || '').trim(), JSON.stringify(p), p.updatedAt || '']);
    stmts = buildMultiRowUpsertStmts(db, 'personnel', ['id', 'personnel_code', 'data_json', 'updated_at'], 'id', ['personnel_code', 'data_json', 'updated_at'], rows);
  } else if (table === 'jobGroups') {
    const rows = items.filter((jg) => jg?.id).map((jg) => [String(jg.id), JSON.stringify(jg)]);
    stmts = buildMultiRowUpsertStmts(db, 'job_groups', ['id', 'data_json'], 'id', ['data_json'], rows);
  } else if (table === 'jobClassifications') {
    const rows = items.filter((jc) => jc?.id).map((jc) => [String(jc.id), toAsciiDigits(jc.personnelCode || '').trim(), JSON.stringify(jc)]);
    stmts = buildMultiRowUpsertStmts(db, 'job_classifications', ['id', 'personnel_code', 'data_json'], 'id', ['personnel_code', 'data_json'], rows);
  } else if (table === 'karaneh') {
    const rows = items.filter((k) => k?.id).map((k) => [String(k.id), String(k.period || ''), toAsciiDigits(k.personnelCode || '').trim(), JSON.stringify(k)]);
    stmts = buildMultiRowUpsertStmts(db, 'karaneh', ['id', 'period', 'personnel_code', 'data_json'], 'id', ['period', 'personnel_code', 'data_json'], rows);
  } else if (table === 'commitments') {
    const rows = items.filter((c) => c?.id).map((c) => [String(c.id), toAsciiDigits(c.personnelCode || '').trim(), JSON.stringify(c)]);
    stmts = buildMultiRowUpsertStmts(db, 'commitments', ['id', 'personnel_code', 'data_json'], 'id', ['personnel_code', 'data_json'], rows);
  } else if (table === 'payroll') {
    const rows = items.filter((pr) => pr?.id).map((pr) => [String(pr.id), String(pr.period || ''), toAsciiDigits(pr.personnelCode || '').trim(), JSON.stringify(pr)]);
    stmts = buildMultiRowUpsertStmts(db, 'payroll', ['id', 'period', 'personnel_code', 'data_json'], 'id', ['period', 'personnel_code', 'data_json'], rows);
  } else if (table === 'miningVolumes') {
    const rows = items.filter((mv) => mv?.id).map((mv) => [String(mv.id), String(mv.period || ''), String(mv.unitName || ''), JSON.stringify(mv)]);
    stmts = buildMultiRowUpsertStmts(db, 'mining_volumes', ['id', 'period', 'unit_name', 'data_json'], 'id', ['period', 'unit_name', 'data_json'], rows);
  } else if (table === 'miningMachinery') {
    const rows = items.filter((mm) => mm?.id).map((mm) => [String(mm.id), toAsciiDigits(mm.machineCode || '').trim(), JSON.stringify(mm)]);
    stmts = buildMultiRowUpsertStmts(db, 'mining_machinery', ['id', 'machine_code', 'data_json'], 'id', ['machine_code', 'data_json'], rows);
  } else if (table === 'unitReports') {
    const rows = items.filter((ur) => ur?.id).map((ur) => [String(ur.id), String(ur.period || ''), String(ur.unitName || ''), JSON.stringify(ur)]);
    stmts = buildMultiRowUpsertStmts(db, 'unit_reports', ['id', 'period', 'unit_name', 'data_json'], 'id', ['period', 'unit_name', 'data_json'], rows);
  }
  if (stmts.length > 0) {
    await batchExecuteChunked(db, stmts);
  }
  return items.length;
}

async function clearAllSnapshotTablesInD1(db: D1Database): Promise<void> {
  const clearTables = [
    'users',
    'personnel',
    'job_groups',
    'job_classifications',
    'karaneh',
    'commitments',
    'payroll',
    'mining_volumes',
    'mining_machinery',
    'unit_reports',
  ];
  await db.batch(clearTables.map((t) => db.prepare(`DELETE FROM ${t}`)));
}

async function replaceAllSnapshotInD1(db: D1Database, data: any): Promise<void> {
  await clearAllSnapshotTablesInD1(db);
  await upsertChunkIntoD1(db, 'users', data.users || []);
  await upsertChunkIntoD1(db, 'personnel', data.personnel || []);
  await upsertChunkIntoD1(db, 'jobGroups', data.jobGroups || []);
  await upsertChunkIntoD1(db, 'jobClassifications', data.jobClassifications || []);
  await upsertChunkIntoD1(db, 'karaneh', data.karaneh || []);
  await upsertChunkIntoD1(db, 'commitments', data.commitments || []);
  await upsertChunkIntoD1(db, 'payroll', data.payroll || []);
  await upsertChunkIntoD1(db, 'miningVolumes', data.miningVolumes || []);
  await upsertChunkIntoD1(db, 'miningMachinery', data.miningMachinery || []);
  await upsertChunkIntoD1(db, 'unitReports', data.unitReports || []);
  await touchLastSaved(db);
}

let isBootstrappedInIsolate = false;

async function ensureBootstrapped(db: D1Database): Promise<void> {
  if (isBootstrappedInIsolate) return;

  let seededFlag = false;
  let indexesV6Flag = false;
  try {
    const { results } = await db
      .prepare("SELECT key, value FROM app_meta WHERE key IN ('seeded_v1', 'schema_v6_indexes')")
      .all<{ key: string; value: string }>();
    for (const r of results || []) {
      if (r.key === 'seeded_v1' && r.value === 'true') seededFlag = true;
      if (r.key === 'schema_v6_indexes' && r.value === 'true') indexesV6Flag = true;
    }
    if (seededFlag && indexesV6Flag) {
      isBootstrappedInIsolate = true;
      return;
    }
  } catch {
    // Table does not exist yet — proceed to create schema below
  }

  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'کاربر سفارشی',
        department TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
        uid TEXT NOT NULL DEFAULT '', permissions_json TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT '',
        last_login TEXT NOT NULL DEFAULT ''
      )`
    ),
    db.prepare('CREATE TABLE IF NOT EXISTS personnel (id TEXT PRIMARY KEY, personnel_code TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT \'\')'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_personnel_code ON personnel(personnel_code)'),
    db.prepare('CREATE TABLE IF NOT EXISTS job_groups (id TEXT PRIMARY KEY, data_json TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS job_classifications (id TEXT PRIMARY KEY, personnel_code TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_job_classifications_code ON job_classifications(personnel_code)'),
    db.prepare('CREATE TABLE IF NOT EXISTS karaneh (id TEXT PRIMARY KEY, period TEXT NOT NULL DEFAULT \'\', personnel_code TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_karaneh_period ON karaneh(period)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_karaneh_period_code ON karaneh(period, personnel_code)'),
    db.prepare('CREATE TABLE IF NOT EXISTS commitments (id TEXT PRIMARY KEY, personnel_code TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_commitments_code ON commitments(personnel_code)'),
    db.prepare('CREATE TABLE IF NOT EXISTS payroll (id TEXT PRIMARY KEY, period TEXT NOT NULL DEFAULT \'\', personnel_code TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(period)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_payroll_period_code ON payroll(period, personnel_code)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_payroll_code ON payroll(personnel_code)'),
    db.prepare('CREATE TABLE IF NOT EXISTS mining_volumes (id TEXT PRIMARY KEY, period TEXT NOT NULL DEFAULT \'\', unit_name TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mining_volumes_period ON mining_volumes(period)'),
    db.prepare('CREATE TABLE IF NOT EXISTS mining_machinery (id TEXT PRIMARY KEY, machine_code TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mining_machinery_code ON mining_machinery(machine_code)'),
    db.prepare('CREATE TABLE IF NOT EXISTS unit_reports (id TEXT PRIMARY KEY, period TEXT NOT NULL DEFAULT \'\', unit_name TEXT NOT NULL DEFAULT \'\', data_json TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_unit_reports_period_unit ON unit_reports(period, unit_name)'),
  ]);

  if (!indexesV6Flag) {
    await db.batch([
      db.prepare('UPDATE personnel SET personnel_code = TRIM(personnel_code) WHERE personnel_code != TRIM(personnel_code)'),
      db.prepare('UPDATE karaneh SET personnel_code = TRIM(personnel_code) WHERE personnel_code != TRIM(personnel_code)'),
      db.prepare('UPDATE job_classifications SET personnel_code = TRIM(personnel_code) WHERE personnel_code != TRIM(personnel_code)'),
      db.prepare('UPDATE commitments SET personnel_code = TRIM(personnel_code) WHERE personnel_code != TRIM(personnel_code)'),
      db.prepare('UPDATE payroll SET personnel_code = TRIM(personnel_code) WHERE personnel_code != TRIM(personnel_code)'),
      db.prepare('UPDATE mining_machinery SET machine_code = TRIM(machine_code) WHERE machine_code != TRIM(machine_code)'),
      db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v6_indexes', 'true')"),
    ]);
  }

  if (!seededFlag) {
    const counts = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>(),
      db.prepare('SELECT COUNT(*) as cnt FROM personnel').first<{ cnt: number }>(),
      db.prepare('SELECT COUNT(*) as cnt FROM karaneh').first<{ cnt: number }>(),
      db.prepare('SELECT COUNT(*) as cnt FROM payroll').first<{ cnt: number }>(),
      db.prepare('SELECT COUNT(*) as cnt FROM commitments').first<{ cnt: number }>(),
    ]);
    const hasAnyExistingData = counts.some((row) => Number(row?.cnt || 0) > 0);
    if (!hasAnyExistingData) {
      const seed = await buildInitialSeedData();
      await replaceAllSnapshotInD1(db, seed);
    }
    await db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').bind('seeded_v1', 'true').run();
  }

  isBootstrappedInIsolate = true;
}

// ================= AUTH MIDDLEWARE HELPER =================

async function authenticate(request: Request, env: Env): Promise<{ user?: any; errorRes?: Response }> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return {
      errorRes: jsonRes(request, env, { success: false, message: 'احراز هویت انجام نشده است. لطفاً مجدداً وارد شوید.' }, 401),
    };
  }
  const verified = await verifyAuthToken(token, env);
  if (!verified) {
    return {
      errorRes: jsonRes(request, env, { success: false, message: 'نشست کاربری منقضی یا نامعتبر است. لطفاً مجدداً وارد شوید.' }, 401),
    };
  }
  const user = await getUserById(env.DB, verified.uid);
  if (!user || !user.isActive) {
    return {
      errorRes: jsonRes(request, env, { success: false, message: 'حساب کاربری یافت نشد یا غیرفعال شده است.' }, 403),
    };
  }
  return { user };
}

function forbidden(request: Request, env: Env, message = 'شما مجوز لازم برای انجام این عملیات را ندارید.'): Response {
  return jsonRes(request, env, { success: false, message }, 403);
}

// ================= MAIN WORKER FETCH HANDLER =================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    try {
      await ensureBootstrapped(env.DB);
      const url = new URL(request.url);
      let path = url.pathname;
      if (path.startsWith('/api/')) path = path.slice(4);
      else if (path === '/api') path = '/';

      const method = request.method.toUpperCase();

      // 1. Health Check (Public)
      if (method === 'GET' && (path === '/health' || path === '/')) {
        const meta = await getSyncMeta(env.DB);
        return jsonRes(request, env, {
          success: true,
          engine: 'cloudflare',
          database: 'd1',
          service: 'neginparto-api',
          syncVersion: meta.syncVersion,
        });
      }

      // 2. Login (Public)
      if (method === 'POST' && path === '/auth/login') {
        const body: any = await request.json().catch(() => ({}));
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!username || !password) {
          return jsonRes(request, env, { success: false, message: 'لطفاً نام کاربری و رمز عبور را وارد کنید.' }, 400);
        }
        const user = await getUserByUsername(env.DB, username);
        if (!user) {
          return jsonRes(request, env, { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, 401);
        }
        const check = await verifyPassword(password, String(user.password || ''));
        if (!check.valid) {
          return jsonRes(request, env, { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, 401);
        }
        if (!user.isActive) {
          return jsonRes(request, env, { success: false, message: 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر ارشد تماس بگیرید.' }, 403);
        }
        if (check.needsMigration) {
          user.password = await hashPassword(password);
        }
        user.lastLogin = faDateTime();
        await upsertUser(env.DB, user);
        const token = await createAuthToken(user, env);
        return jsonRes(request, env, {
          success: true,
          data: { user: sanitizeUser(user), token, expiresAt: Date.now() + TOKEN_TTL_MS },
        });
      }

      // All remaining routes require valid auth
      const { user: authUser, errorRes } = await authenticate(request, env);
      if (errorRes || !authUser) return errorRes!;

      // 3. Session Verify
      if (method === 'GET' && path === '/auth/me') {
        return jsonRes(request, env, { success: true, data: sanitizeUser(authUser) });
      }

      // 4. Lightweight Sync Version Polling (for cross-browser real-time updates)
      if (method === 'GET' && path === '/sync-version') {
        const meta = await getSyncMeta(env.DB);
        return jsonRes(request, env, { success: true, data: meta });
      }

      // 5. Unified Single-Request Bootstrap (loads all permitted data safely; supports ?lite=1 capped pages for zero OOM/1102)
      if (method === 'GET' && path === '/bootstrap') {
        const isLite = url.searchParams.get('lite') === '1';
        const canPers = checkPermission(authUser, 'personnel', 'view');
        const hideSalary = canPers && !checkPermission(authUser, 'personnel', 'viewSalary');
        const hideDocs = canPers && (!checkPermission(authUser, 'personnel', 'documents') || isLite);
        const canKar = checkPermission(authUser, 'karaneh', 'view');
        const canFinalKar = checkPermission(authUser, 'finalKaraneh', 'view');
        const canAnyKar = canKar || canFinalKar;
        const canKarFull = canKar && hasFullKaranehScope(authUser);
        const canPay = !isLite && checkPermission(authUser, 'payroll', 'view');
        const canJg = checkPermission(authUser, 'jobGroups', 'view');
        const canCmt = checkPermission(authUser, 'commitments', 'view');
        const canMining = hasMiningOrUnitPerm(authUser, 'view');
        const canUsers = checkPermission(authUser, 'users', 'view');
        const isCeoOrSuper = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'view');

        const persLimit = 250;
        const karLimit = 400;
        const payLimit = canPay ? 150 : undefined;
        const jcLimit = 300;
        const cmtLimit = 300;
        const urLimit = 300;

        const [
          personnelJson,
          karanehResult,
          karanehPersJson,
          payrollJson,
          jobGroupsJson,
          jobClassificationsJson,
          commitmentsJson,
          rawVolumesResult,
          rawMachineryResult,
          rawReportsResult,
          rawUsers,
          dbStatus,
        ] = await Promise.all([
          !canPers
            ? Promise.resolve('[]')
            : hideSalary && hideDocs
            ? getRawJsonArrayString(
                env.DB,
                'personnel',
                '',
                [],
                "CASE WHEN data_json LIKE '%\"documents\":%' AND json_valid(data_json) THEN json_set(json_remove(data_json, '$.documents'), '$.baseSalary', 0) WHEN json_valid(data_json) THEN json_set(data_json, '$.baseSalary', 0) ELSE data_json END",
                persLimit,
                0
              )
            : hideSalary
            ? getRawJsonArrayString(
                env.DB,
                'personnel',
                '',
                [],
                "CASE WHEN json_valid(data_json) THEN json_set(data_json, '$.baseSalary', 0) ELSE data_json END",
                persLimit,
                0
              )
            : hideDocs
            ? getRawJsonArrayString(
                env.DB,
                'personnel',
                '',
                [],
                "CASE WHEN data_json LIKE '%\"documents\":%' AND json_valid(data_json) THEN json_remove(data_json, '$.documents') ELSE data_json END",
                persLimit,
                0
              )
            : getRawJsonArrayString(env.DB, 'personnel', '', [], 'data_json', persLimit, 0),
          !canAnyKar
            ? Promise.resolve({ json: '[]', total: 0 })
            : canKarFull
            ? getRawJsonArrayString(env.DB, 'karaneh', '', [], 'data_json', karLimit, 0).then((json) => ({ json, total: -1 }))
            : getJsonRows(env.DB, 'karaneh').then((rows) => {
                const filtered = rows.filter(
                  (k: any) =>
                    (canKar && isKaranehUnitAllowedForUser(authUser, k.department)) ||
                    (canFinalKar && k.status === 'submitted')
                );
                return { json: JSON.stringify(filtered.slice(0, karLimit)), total: filtered.length };
              }),
          !canKar || canPers
            ? Promise.resolve('[]')
            : env.DB.prepare(
                `SELECT id,
                        TRIM(personnel_code) as personnelCode,
                        COALESCE(json_extract(data_json, '$.fullName'), '') as fullName,
                        COALESCE(json_extract(data_json, '$.department'), '') as department,
                        COALESCE(json_extract(data_json, '$.position'), '') as position
                 FROM personnel`
              )
                .all<any>()
                .then(({ results }) =>
                  JSON.stringify(
                    (results || []).filter((p: any) => isKaranehUnitAllowedForUser(authUser, p.department))
                  )
                ),
          canPay ? getRawJsonArrayString(env.DB, 'payroll', '', [], 'data_json', payLimit, 0) : Promise.resolve('[]'),
          canJg ? getRawJsonArrayString(env.DB, 'job_groups') : Promise.resolve('[]'),
          canJg ? getRawJsonArrayString(env.DB, 'job_classifications', '', [], 'data_json', jcLimit, 0) : Promise.resolve('[]'),
          canCmt ? getRawJsonArrayString(env.DB, 'commitments', '', [], 'data_json', cmtLimit, 0) : Promise.resolve('[]'),
          !canMining
            ? Promise.resolve('[]')
            : isCeoOrSuper
            ? getRawJsonArrayString(env.DB, 'mining_volumes')
            : getJsonRows(env.DB, 'mining_volumes').then((rows) =>
                JSON.stringify(rows.filter((v: any) => isDispatchingOrUnitAllowed(authUser, v.unitName)))
              ),
          !canMining
            ? Promise.resolve('[]')
            : isCeoOrSuper
            ? getRawJsonArrayString(env.DB, 'mining_machinery')
            : getJsonRows(env.DB, 'mining_machinery').then((rows) =>
                JSON.stringify(rows.filter((m: any) => isWorkshopOrUnitAllowed(authUser, m.unitName)))
              ),
          !canMining
            ? Promise.resolve({ json: '[]', total: 0 })
            : isCeoOrSuper
            ? getRawJsonArrayString(env.DB, 'unit_reports', '', [], 'data_json', urLimit, 0).then((json) => ({ json, total: -1 }))
            : getJsonRows(env.DB, 'unit_reports').then((rows) => {
                const filtered = rows.filter((r: any) => isUnitAllowedForUser(authUser, r.unitName));
                return { json: JSON.stringify(filtered.slice(0, urLimit)), total: filtered.length };
              }),
          canUsers ? getAllUsers(env.DB) : Promise.resolve([]),
          computeDatabaseStatus(env.DB, authUser),
        ]);

        const resolvedKarTotal =
          !canAnyKar
            ? 0
            : karanehResult.total >= 0
            ? karanehResult.total
            : Number(dbStatus.totalKaranehRecords || 0);

        const resolvedUrTotal =
          !canMining
            ? 0
            : rawReportsResult.total >= 0
            ? rawReportsResult.total
            : Number(dbStatus.totalUnitReports || 0);

        const payloadStr =
          `{"success":true,"data":{` +
          `"personnel":${personnelJson},` +
          `"karaneh":${karanehResult.json},` +
          `"karanehPersonnel":${karanehPersJson},` +
          `"payroll":${payrollJson},` +
          `"jobGroups":${jobGroupsJson},` +
          `"jobClassifications":${jobClassificationsJson},` +
          `"commitments":${commitmentsJson},` +
          `"miningVolumes":${rawVolumesResult},` +
          `"miningMachinery":${rawMachineryResult},` +
          `"unitReports":${rawReportsResult.json},` +
          `"users":${JSON.stringify(rawUsers.map(sanitizeUser))},` +
          `"dbStatus":${JSON.stringify(dbStatus)},` +
          `"syncVersion":${JSON.stringify(dbStatus.syncVersion)},` +
          `"lite":${isLite},` +
          `"personnelTotal":${canPers ? Number(dbStatus.totalPersonnel || 0) : 0},` +
          `"karanehTotal":${resolvedKarTotal},` +
          `"payrollTotal":${checkPermission(authUser, 'payroll', 'view') ? Number(dbStatus.totalPayrollRecords || 0) : 0},` +
          `"jobClassificationsTotal":${canJg ? Number(dbStatus.totalJobClassifications || 0) : 0},` +
          `"commitmentsTotal":${canCmt ? Number(dbStatus.totalCommitments || 0) : 0},` +
          `"unitReportsTotal":${resolvedUrTotal}` +
          `}}`;

        return rawJsonResponse(request, env, payloadStr);
      }

      // ================= USERS ROUTES =================
      if (path === '/users' && method === 'GET') {
        if (!checkPermission(authUser, 'users', 'view')) {
          return jsonRes(request, env, { success: true, data: [] });
        }
        const users = await getAllUsers(env.DB);
        return jsonRes(request, env, { success: true, data: users.map(sanitizeUser) });
      }

      if (path === '/users' && method === 'POST') {
        if (!checkPermission(authUser, 'users', 'create')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        const fullName = String(body.fullName || '').trim();
        if (!username || !password || !fullName) {
          return jsonRes(request, env, { success: false, message: 'تکمیل نام کاربری، رمز عبور و نام الزامی است.' }, 400);
        }
        if (String(body.role || '').trim() === 'super_admin' && !isSuperAdminUser(authUser)) {
          return forbidden(request, env, 'فقط مدیر ارشد سامانه مجاز به ایجاد حساب با نقش super_admin است.');
        }
        const dup = await getUserByUsername(env.DB, username);
        if (dup) {
          return jsonRes(request, env, { success: false, message: 'این نام کاربری قبلاً در سامانه ثبت شده است.' }, 400);
        }
        const perms = body.role === 'super_admin'
          ? getFullAdminPermissions()
          : body.permissions && typeof body.permissions === 'object'
          ? normalizePermissions(body.permissions)
          : getEmptyPermissions();

        const newUser = {
          id: genId('u'),
          username,
          password: await hashPassword(password),
          email: body.email ? String(body.email).trim().toLowerCase() : '',
          fullName,
          role: body.role || 'کاربر سفارشی',
          department: body.department || '',
          permissions: perms,
          isActive: true,
          createdAt: faDate(),
          lastLogin: '',
        };
        await upsertUser(env.DB, newUser);
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: sanitizeUser(newUser), message: 'کاربر جدید با موفقیت ذخیره شد.' });
      }

      if (path.startsWith('/users/') && !path.includes('/batch-') && path !== '/users/delete-all') {
        const id = decodeURIComponent(path.slice('/users/'.length));
        if (method === 'PUT') {
          if (!checkPermission(authUser, 'users', 'edit')) return forbidden(request, env);
          const existing = await getUserById(env.DB, id);
          if (!existing) return jsonRes(request, env, { success: false, message: 'کاربر یافت نشد.' }, 404);
          const body: any = await request.json().catch(() => ({}));
          if (!isSuperAdminUser(authUser) && (isSuperAdminUser(existing) || body.role === 'super_admin')) {
            return forbidden(request, env, 'تغییر مشخصات یا ارتقای سطح به مدیر ارشد فقط توسط مدیر ارشد مجاز است.');
          }
          if (existing.username === 'javadabadiyan' && body.isActive === false) {
            return jsonRes(request, env, { success: false, message: 'حساب ادمین ارشد (javadabadiyan) قابل غیرفعال‌سازی نیست.' }, 400);
          }
          const nextRole = body.role ?? existing.role;
          const nextPermissions =
            nextRole === 'super_admin' || existing.username === 'javadabadiyan'
              ? getFullAdminPermissions()
              : body.permissions !== undefined
              ? normalizePermissions(body.permissions)
              : normalizePermissions(existing.permissions);

          const updated = {
            ...existing,
            fullName: body.fullName ?? existing.fullName,
            email: body.email !== undefined ? String(body.email).trim().toLowerCase() : existing.email,
            role: nextRole,
            department: body.department ?? existing.department,
            permissions: nextPermissions,
            isActive: body.isActive ?? existing.isActive,
            password: body.password ? await hashPassword(String(body.password)) : existing.password,
          };
          await upsertUser(env.DB, updated);
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, data: sanitizeUser(updated), message: 'اطلاعات و دسترسی‌های کاربر با موفقیت به‌روزرسانی شد.' });
        }

        if (method === 'DELETE') {
          if (!checkPermission(authUser, 'users', 'delete')) return forbidden(request, env);
          const existing = await getUserById(env.DB, id);
          if (!existing) return jsonRes(request, env, { success: false, message: 'کاربر یافت نشد.' }, 404);
          if (existing.username === 'javadabadiyan') {
            return jsonRes(request, env, { success: false, message: 'امکان حذف کاربر ارشد سامانه (javadabadiyan) وجود ندارد.' }, 400);
          }
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, message: 'کاربر با موفقیت حذف گردید.' });
        }
      }

      if (path === '/users/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'users', 'importExcel') && !checkPermission(authUser, 'users', 'create')) {
          return forbidden(request, env, 'شما مجوز بارگذاری اکسل کاربران را ندارید.');
        }
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) {
          return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);
        }

        const incomingUsernames = Array.from(
          new Set<string>(
            items
              .map((row: any) => String(getVal(row, 'username', 'نام کاربری', 'کاربر') || '').trim().toLowerCase())
              .filter(Boolean)
          )
        );
        const existingMap = new Map<string, any>();
        for (let i = 0; i < incomingUsernames.length; i += 50) {
          const slice = incomingUsernames.slice(i, i + 50);
          const ph = slice.map(() => '?').join(',');
          const { results } = await env.DB.prepare(
            `SELECT * FROM users WHERE LOWER(username) IN (${ph})`
          )
            .bind(...slice)
            .all<any>();
          for (const r of results || []) {
            const u = rowToUser(r);
            existingMap.set(String(u.username || '').trim().toLowerCase(), u);
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const todayStr = faDate();

        for (const row of items) {
          const username = String(getVal(row, 'username', 'نام کاربری', 'کاربر') || '').trim();
          if (!username) {
            skipped++;
            continue;
          }
          const unameLower = username.toLowerCase();
          const existing = existingMap.get(unameLower);
          const fullName = String(getVal(row, 'fullName', 'نام و نام خانوادگی', 'نام کامل', 'نام') || username).trim();
          const role = String(getVal(row, 'role', 'نقش سازمانی', 'نقش', 'سمت') || existing?.role || 'viewer').trim();
          const presetLabel = String(getVal(row, 'preset', 'الگوی دسترسی') || '').trim();
          const department = String(getVal(row, 'department', 'واحد اداری', 'واحد سازمانی', 'واحد', 'بخش') || existing?.department || '').trim();
          const rawPass = String(getVal(row, 'password', 'رمز عبور', 'کلمه عبور') || '').trim();
          const rawActive = String(getVal(row, 'isActive', 'وضعیت حساب', 'وضعیت', 'فعال') || '').trim();
          const isActive = rawActive ? !['غیرفعال', 'مسدود', 'false', '0', 'خیر'].includes(rawActive) : existing ? existing.isActive : true;
          const isTargetSuper = role === 'super_admin' || existing?.username === 'javadabadiyan';
          if (isTargetSuper && !isSuperAdminUser(authUser)) {
            skipped++;
            continue;
          }

          const nextUser = existing
            ? {
                ...existing,
                fullName,
                role: existing.username === 'javadabadiyan' ? 'super_admin' : role,
                department,
                isActive: existing.username === 'javadabadiyan' ? true : isActive,
                password: rawPass ? await hashPassword(rawPass) : existing.password,
                permissions:
                  existing.username === 'javadabadiyan'
                    ? getFullAdminPermissions()
                    : presetLabel
                    ? buildPresetPermissions(presetLabel)
                    : normalizePermissions(existing.permissions),
              }
            : {
                id: genId('u'),
                username,
                password: await hashPassword(rawPass || '12345678'),
                fullName,
                role,
                department,
                email: '',
                uid: '',
                permissions:
                  role === 'super_admin'
                    ? getFullAdminPermissions()
                    : presetLabel
                    ? buildPresetPermissions(presetLabel)
                    : buildPresetPermissions(role),
                isActive,
                createdAt: todayStr,
                lastLogin: '',
              };

          if (existing) updated++;
          else added++;
          existingMap.set(unameLower, nextUser);
          pendingMap.set(nextUser.id, [
            nextUser.id,
            nextUser.username,
            nextUser.password || '',
            nextUser.fullName || '',
            nextUser.role || 'کاربر سفارشی',
            nextUser.department || '',
            nextUser.email || '',
            nextUser.uid || '',
            JSON.stringify(nextUser.permissions || {}),
            nextUser.isActive === false ? 0 : 1,
            nextUser.createdAt || '',
            nextUser.lastLogin || '',
          ]);
        }

        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped,
            message: 'هیچ ردیف معتبری با «نام کاربری» در این دسته یافت نشد.',
          });
        }

        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'users',
          ['id', 'username', 'password', 'full_name', 'role', 'department', 'email', 'uid', 'permissions_json', 'is_active', 'created_at', 'last_login'],
          'id',
          ['username', 'password', 'full_name', 'role', 'department', 'email', 'uid', 'permissions_json', 'is_active', 'created_at', 'last_login'],
          Array.from(pendingMap.values())
        );
        await batchExecuteChunked(env.DB, stmts);
        await touchLastSaved(env.DB);
        return jsonRes(request, env, {
          success: true,
          added,
          updated,
          skipped,
          message: `لیست کاربران با موفقیت وارد شد (${added} جدید، ${updated} به‌روزرسانی).`,
        });
      }

      if (path === '/users/batch-delete' && method === 'POST') {
        if (!checkPermission(authUser, 'users', 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        let deletedCount = 0;
        for (const id of ids) {
          const u = await getUserById(env.DB, id);
          if (u && u.username !== 'javadabadiyan') {
            await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
            deletedCount++;
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `${deletedCount} حساب کاربری حذف شد.` });
      }

      if (path === '/users/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'users', 'deleteAll')) return forbidden(request, env);
        const before = await env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE username != ?').bind('javadabadiyan').first<{ c: number }>();
        await env.DB.prepare('DELETE FROM users WHERE username != ?').bind('javadabadiyan').run();
        const deletedCount = Number(before?.c || 0);
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `حساب‌های کاربری به جز مدیر ارشد (${deletedCount} کاربر) پاکسازی شدند.` });
      }

      // ================= PERSONNEL ROUTES =================
      if (path === '/personnel' && method === 'GET') {
        if (!checkPermission(authUser, 'personnel', 'view')) return jsonRes(request, env, { success: true, data: [] });
        const hideSalary = !checkPermission(authUser, 'personnel', 'viewSalary');
        const hideDocs = !checkPermission(authUser, 'personnel', 'documents') || url.searchParams.get('lite') === '1';
        const selectExpr =
          hideSalary && hideDocs
            ? "CASE WHEN data_json LIKE '%\"documents\":%' AND json_valid(data_json) THEN json_set(json_remove(data_json, '$.documents'), '$.baseSalary', 0) WHEN json_valid(data_json) THEN json_set(data_json, '$.baseSalary', 0) ELSE data_json END"
            : hideSalary
            ? "CASE WHEN json_valid(data_json) THEN json_set(data_json, '$.baseSalary', 0) ELSE data_json END"
            : hideDocs
            ? "CASE WHEN data_json LIKE '%\"documents\":%' AND json_valid(data_json) THEN json_remove(data_json, '$.documents') ELSE data_json END"
            : 'data_json';
        const pg = parsePagination(url);
        if (pg.hasPagination) {
          const [countRow, rawArr] = await Promise.all([
            env.DB.prepare('SELECT COUNT(*) as total FROM personnel').first<{ total: number }>(),
            getRawJsonArrayString(env.DB, 'personnel', '', [], selectExpr, pg.limit, pg.offset),
          ]);
          const total = Number(countRow?.total || 0);
          const hasMore = pg.offset + pg.limit < total;
          return rawJsonResponse(
            request,
            env,
            `{"success":true,"data":${rawArr},"total":${total},"limit":${pg.limit},"offset":${pg.offset},"hasMore":${hasMore}}`
          );
        }
        const rawArr = await getRawJsonArrayString(env.DB, 'personnel', '', [], selectExpr);
        return rawJsonResponse(request, env, `{"success":true,"data":${rawArr}}`);
      }

      if (path === '/personnel' && method === 'POST') {
        if (!checkPermission(authUser, 'personnel', 'create')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        if (!body.personnelCode || (!body.fullName && !body.firstName)) {
          return jsonRes(request, env, { success: false, message: 'کد پرسنلی و نام پرسنل الزامی است.' }, 400);
        }
        const cleanPersCode = toAsciiDigits(body.personnelCode).trim();
        const existing = await env.DB.prepare('SELECT id FROM personnel WHERE personnel_code = ?')
          .bind(cleanPersCode)
          .first();
        if (existing) {
          return jsonRes(request, env, { success: false, message: 'پرسنلی با این کد پرسنلی قبلاً ثبت شده است.' }, 400);
        }
        const fullName = body.fullName || `${body.firstName || ''} ${body.lastName || ''}`.trim();
        const item = {
          id: genId('p'),
          ...body,
          personnelCode: cleanPersCode,
          fullName,
          firstName: body.firstName || fullName.split(' ')[0] || '',
          lastName: body.lastName || fullName.split(' ').slice(1).join(' ') || '',
          baseSalary: Number(body.baseSalary || 0),
          createdAt: faDate(),
          updatedAt: faDate(),
        };
        await env.DB.prepare('INSERT INTO personnel (id, personnel_code, data_json, updated_at) VALUES (?, ?, ?, ?)')
          .bind(item.id, item.personnelCode, JSON.stringify(item), item.updatedAt)
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: item, message: 'پرونده پرسنلی با موفقیت ذخیره شد.' });
      }

      if (path.startsWith('/personnel/') && !path.includes('/batch-') && !path.includes('/relatives/') && path !== '/personnel/delete-all') {
        const id = decodeURIComponent(path.slice('/personnel/'.length));
        if (method === 'PUT') {
          if (!checkPermission(authUser, 'personnel', 'edit')) return forbidden(request, env);
          const row = await env.DB.prepare('SELECT data_json FROM personnel WHERE id = ?').bind(id).first<{ data_json: string }>();
          if (!row) return jsonRes(request, env, { success: false, message: 'پرسنل یافت نشد.' }, 404);
          const existing = JSON.parse(row.data_json);
          const body: any = await request.json().catch(() => ({}));
          const cleanCode = toAsciiDigits(body.personnelCode ?? existing.personnelCode ?? '').trim();
          const updated = {
            ...existing,
            ...body,
            personnelCode: cleanCode,
            fullName: body.fullName || `${body.firstName ?? existing.firstName} ${body.lastName ?? existing.lastName}`.trim(),
            baseSalary: body.baseSalary !== undefined ? Number(body.baseSalary) : existing.baseSalary,
            updatedAt: faDate(),
          };
          await env.DB.prepare('UPDATE personnel SET personnel_code = ?, data_json = ?, updated_at = ? WHERE id = ?')
            .bind(cleanCode, JSON.stringify(updated), updated.updatedAt, id)
            .run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, data: updated, message: 'پرونده پرسنلی با موفقیت به‌روزرسانی شد.' });
        }
        if (method === 'DELETE') {
          if (!checkPermission(authUser, 'personnel', 'delete')) return forbidden(request, env);
          await env.DB.prepare('DELETE FROM personnel WHERE id = ?').bind(id).run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, message: 'پرونده پرسنلی حذف شد.' });
        }
      }

      if (path === '/personnel/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'personnel', 'importExcel')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const incomingCodes: string[] = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی', 'شماره پرسنلی') || '').trim())
              .filter((v: string) => Boolean(v))
          )
        );

        const byCode = new Map<string, any>();
        const lookupSlices: string[][] = [];
        for (let i = 0; i < incomingCodes.length; i += 90) {
          lookupSlices.push(incomingCodes.slice(i, i + 90));
        }
        const lookupResponses = await Promise.all(
          lookupSlices.map((slice) => {
            const placeholders = slice.map(() => '?').join(',');
            return env.DB.prepare(
              `SELECT personnel_code, CASE WHEN data_json LIKE '%"documents":%' AND json_valid(data_json) THEN json_remove(data_json, '$.documents') ELSE data_json END as data_json FROM personnel WHERE personnel_code IN (${placeholders})`
            )
              .bind(...slice)
              .all<{ personnel_code: string; data_json: string }>();
          })
        );
        for (const res of lookupResponses) {
          for (const r of res.results || []) {
            try {
              const parsed = JSON.parse(r.data_json);
              const c = toAsciiDigits(parsed.personnelCode || r.personnel_code).trim();
              if (c) byCode.set(c, parsed);
            } catch {
              // ignore malformed row
            }
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const nowStr = faDate();

        for (const row of items) {
          const code = toAsciiDigits(getVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی', 'شماره پرسنلی') || '').trim();
          if (!code) {
            skipped++;
            continue;
          }
          const existing = byCode.get(code);
          const firstName = String(getVal(row, 'firstName', 'نام') || '').trim();
          const lastName = String(getVal(row, 'lastName', 'نام خانوادگي', 'نام خانوادگی') || '').trim();
          const fullNameRaw = String(getVal(row, 'fullName', 'نام و نام خانوادگي', 'نام و نام خانوادگی') || '').trim();
          const fullName = `${firstName} ${lastName}`.trim() || fullNameRaw || existing?.fullName || 'پرسنل';

          const itemData: Record<string, any> = {
            employeeId: String(getVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') ?? existing?.employeeId ?? ''),
            personnelCode: code,
            firstName: firstName || fullName.split(' ')[0] || '',
            lastName: lastName || fullName.split(' ').slice(1).join(' ') || '',
            fullName,
            fatherName: String(getVal(row, 'fatherName', 'نام پدر') ?? existing?.fatherName ?? ''),
            shenasnamehNumber: String(getVal(row, 'shenasnamehNumber', 'شماره شناسنامه') ?? existing?.shenasnamehNumber ?? ''),
            nationalId: toAsciiDigits(getVal(row, 'nationalId', 'كد ملي', 'کد ملی') ?? existing?.nationalId ?? '').trim(),
            nationality: String(getVal(row, 'nationality', 'مليت', 'ملیت') ?? existing?.nationality ?? 'ایرانی'),
            citizenship: String(getVal(row, 'citizenship', 'تابعيت', 'تابعیت') ?? existing?.citizenship ?? 'جمهوری اسلامی ایران'),
            gender: String(getVal(row, 'gender', 'جنسيت', 'جنسیت') ?? existing?.gender ?? ''),
            phone: toAsciiDigits(getVal(row, 'phone', 'تلفن همراه', 'شماره تماس', 'تلفن') ?? existing?.phone ?? '').trim(),
            email: String(getVal(row, 'email', 'پست الكترونيك', 'پست الکترونیک', 'ایمیل') ?? existing?.email ?? ''),
            birthPlace: String(getVal(row, 'birthPlace', 'محل تولد') ?? existing?.birthPlace ?? ''),
            issuePlace: String(getVal(row, 'issuePlace', 'محل صدور') ?? existing?.issuePlace ?? ''),
            birthDate: toAsciiDigits(getVal(row, 'birthDate', 'تاريخ تولد', 'تاریخ تولد') ?? existing?.birthDate ?? '').trim(),
            issueDate: toAsciiDigits(getVal(row, 'issueDate', 'تاريخ صدور', 'تاریخ صدور') ?? existing?.issueDate ?? '').trim(),
            maritalStatus: String(getVal(row, 'maritalStatus', 'وضعيت تاهل', 'وضعیت تاهل', 'وضعیت تأهل') ?? existing?.maritalStatus ?? ''),
            militaryStatus: String(getVal(row, 'militaryStatus', 'وضعيت نظام وظيفه', 'وضعیت نظام وظیفه') ?? existing?.militaryStatus ?? ''),
            education: String(getVal(row, 'education', 'مدرك تحصيلي', 'مدرک تحصیلی', 'تحصیلات') ?? existing?.education ?? ''),
            fieldOfStudy: String(getVal(row, 'fieldOfStudy', 'رشته تحصيلي', 'رشته تحصیلی') ?? existing?.fieldOfStudy ?? ''),
            hireDate: toAsciiDigits(getVal(row, 'hireDate', 'تاريخ استخدام', 'تاریخ استخدام') ?? existing?.hireDate ?? '1403/01/01').trim(),
            workLocation: String(getVal(row, 'workLocation', 'محل خدمت') ?? existing?.workLocation ?? ''),
            department: String(getVal(row, 'department', 'واحد سازماني', 'واحد سازمانی', 'واحد') ?? existing?.department ?? 'عمومی'),
            jobTitle: String(getVal(row, 'jobTitle', 'شغل') ?? existing?.jobTitle ?? ''),
            jobCode: String(getVal(row, 'jobCode', 'كد شغل', 'کد شغل') ?? existing?.jobCode ?? ''),
            position: String(getVal(row, 'position', 'پست', 'پست و سمت', 'پست سازمانی') ?? existing?.position ?? 'کارشناس'),
            positionCode: String(getVal(row, 'positionCode', 'كد پست', 'کد پست') ?? existing?.positionCode ?? ''),
            employmentType: String(getVal(row, 'employmentType', 'نوع استخدام') ?? existing?.employmentType ?? 'قراردادی'),
            jobGroupId: String(getVal(row, 'jobGroupId') ?? existing?.jobGroupId ?? ''),
            status: String(getVal(row, 'status', 'وضعیت') ?? existing?.status ?? 'فعال'),
            baseSalary: parseNum(getVal(row, 'baseSalary', 'حقوق پایه', 'حقوق پایه (ریال)') ?? existing?.baseSalary ?? 0),
            notes: String(getVal(row, 'notes', 'یادداشت', 'توضیحات') ?? existing?.notes ?? ''),
            updatedAt: nowStr,
          };

          const merged = existing
            ? {
                id: existing.id,
                ...itemData,
                ...(existing.jobGroupName ? { jobGroupName: existing.jobGroupName } : {}),
                ...(existing.documents ? { documents: existing.documents } : {}),
                relatives: Array.isArray(existing.relatives) ? existing.relatives : [],
                createdAt: existing.createdAt || nowStr,
              }
            : { id: genId('p'), ...itemData, relatives: [], createdAt: nowStr };

          byCode.set(code, merged);
          if (existing) updated++;
          else added++;

          pendingMap.set(merged.id, [merged.id, code, JSON.stringify(merged), nowStr]);
        }

        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped,
            message: 'هیچ ردیف معتبری با «کد پرسنلی» در این دسته یافت نشد.',
          });
        }

        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'personnel',
          ['id', 'personnel_code', 'data_json', 'updated_at'],
          'id',
          ['personnel_code', 'data_json', 'updated_at'],
          Array.from(pendingMap.values()),
          "personnel_code = excluded.personnel_code, data_json = CASE WHEN personnel.data_json LIKE '%\"documents\":%' AND json_valid(personnel.data_json) AND json_type(personnel.data_json, '$.documents') IS NOT NULL THEN json_set(excluded.data_json, '$.documents', json_extract(personnel.data_json, '$.documents')) ELSE excluded.data_json END, updated_at = excluded.updated_at"
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, {
          success: true,
          added,
          updated,
          skipped,
          message: `ورود اطلاعات با موفقیت انجام شد: ${added} نفر جدید اضافه شدند و ${updated} پرونده به‌روزرسانی گردید.`,
        });
      }

      if (path === '/personnel/batch-delete' && method === 'POST') {
        if (!checkPermission(authUser, 'personnel', 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (ids.length === 0) return jsonRes(request, env, { success: false, message: 'موردی برای حذف انتخاب نشده است.' }, 400);
        await batchExecuteChunked(env.DB, ids.map((id: string) => env.DB.prepare('DELETE FROM personnel WHERE id = ?').bind(id)));
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: ids.length, message: `${ids.length} پرونده پرسنلی با موفقیت حذف شد.` });
      }

      if (path === '/personnel/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'personnel', 'deleteAll')) return forbidden(request, env);
        const c = await env.DB.prepare('SELECT COUNT(*) as c FROM personnel').first<{ c: number }>();
        await env.DB.prepare('DELETE FROM personnel').run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: Number(c?.c || 0), message: `کل جدول پرسنل (${Number(c?.c || 0)} پرونده) با موفقیت پاکسازی شد.` });
      }

      if (path === '/personnel/relatives/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'personnel', 'importExcel')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const incomingCodes = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim())
              .filter(Boolean)
          )
        );
        const parentByCode = new Map<string, any>();
        const parentByEmpId = new Map<string, any>();
        const parentByNatId = new Map<string, any>();
        const parentByName = new Map<string, any>();

        const indexParent = (parsed: any) => {
          if (!parsed || !parsed.id) return;
          const c = toAsciiDigits(parsed.personnelCode || '').trim();
          const e = toAsciiDigits(parsed.employeeId || '').trim();
          const n = toAsciiDigits(parsed.nationalId || '').trim();
          const nm = normKey(String(parsed.fullName || ''));
          if (c) parentByCode.set(c, parsed);
          if (e) parentByEmpId.set(e, parsed);
          if (n) parentByNatId.set(n, parsed);
          if (nm) parentByName.set(nm, parsed);
        };

        const relCodeSlices: string[][] = [];
        for (let i = 0; i < incomingCodes.length; i += 90) relCodeSlices.push(incomingCodes.slice(i, i + 90));
        const relCodeRes = await Promise.all(
          relCodeSlices.map((slice) => {
            const ph = slice.map(() => '?').join(',');
            return env.DB.prepare(
              `SELECT CASE WHEN data_json LIKE '%"documents":%' AND json_valid(data_json) THEN json_remove(data_json, '$.documents') ELSE data_json END as data_json FROM personnel WHERE personnel_code IN (${ph})`
            )
              .bind(...slice)
              .all<{ data_json: string }>();
          })
        );
        for (const res of relCodeRes) {
          for (const r of res.results || []) {
            try {
              indexParent(JSON.parse(r.data_json));
            } catch {
              // skip malformed row
            }
          }
        }

        // Targeted fallback ONLY for rows not yet matched by personnelCode
        const fallbackEmpIds: string[] = [];
        const fallbackNatIds: string[] = [];
        for (const row of items) {
          const pCode = toAsciiDigits(getVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim();
          if (pCode && parentByCode.has(pCode)) continue;
          const pEmpId = toAsciiDigits(getVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') || '').trim();
          const pNatId = toAsciiDigits(getVal(row, 'personnelNationalId', 'کد ملی کارمند', 'کد ملی پرسنل') || '').trim();
          if (pEmpId && !parentByEmpId.has(pEmpId)) fallbackEmpIds.push(pEmpId);
          if (pNatId && !parentByNatId.has(pNatId)) fallbackNatIds.push(pNatId);
        }
        const uniqFallbackNats = Array.from(new Set(fallbackNatIds));
        const uniqFallbackEmps = Array.from(new Set(fallbackEmpIds));
        const natSlices: string[][] = [];
        for (let i = 0; i < uniqFallbackNats.length; i += 90) natSlices.push(uniqFallbackNats.slice(i, i + 90));
        const empSlices: string[][] = [];
        for (let i = 0; i < uniqFallbackEmps.length; i += 90) empSlices.push(uniqFallbackEmps.slice(i, i + 90));
        const [natResList, empResList] = await Promise.all([
          Promise.all(
            natSlices.map((slice) => {
              const ph = slice.map(() => '?').join(',');
              return env.DB.prepare(
                `SELECT CASE WHEN data_json LIKE '%"documents":%' AND json_valid(data_json) THEN json_remove(data_json, '$.documents') ELSE data_json END as data_json FROM personnel WHERE json_extract(data_json, '$.nationalId') IN (${ph})`
              )
                .bind(...slice)
                .all<{ data_json: string }>();
            })
          ),
          Promise.all(
            empSlices.map((slice) => {
              const ph = slice.map(() => '?').join(',');
              return env.DB.prepare(
                `SELECT CASE WHEN data_json LIKE '%"documents":%' AND json_valid(data_json) THEN json_remove(data_json, '$.documents') ELSE data_json END as data_json FROM personnel WHERE json_extract(data_json, '$.employeeId') IN (${ph})`
              )
                .bind(...slice)
                .all<{ data_json: string }>();
            })
          ),
        ]);
        for (const res of [...natResList, ...empResList]) {
          for (const r of res.results || []) {
            try { indexParent(JSON.parse(r.data_json)); } catch {}
          }
        }

        let added = 0;
        let updated = 0;
        let unmatched = 0;
        const touchedParents = new Map<string, any>();
        const nowStr = faDate();

        for (const row of items) {
          const pCode = toAsciiDigits(getVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim();
          const pEmpId = toAsciiDigits(getVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') || '').trim();
          const pNatId = toAsciiDigits(getVal(row, 'personnelNationalId', 'کد ملی کارمند', 'کد ملی پرسنل') || '').trim();
          const pName = normKey(String(getVal(row, 'personnelName', 'نام کارمند', 'نام پرسنل', 'نام و نام خانوادگی کارمند') || ''));

          const parent =
            (pCode ? parentByCode.get(pCode) : undefined) ||
            (pEmpId ? parentByEmpId.get(pEmpId) : undefined) ||
            (pNatId ? parentByNatId.get(pNatId) : undefined) ||
            (pName ? parentByName.get(pName) : undefined);

          if (!parent) {
            unmatched++;
            continue;
          }

          const relFullName = String(getVal(row, 'fullName', 'نام و نام خانوادگی بستگان', 'نام بستگان', 'نام و نام خانوادگی') || '').trim();
          if (!relFullName) continue;
          const relation = String(getVal(row, 'relation', 'نسبت', 'نسبت با کارمند') || 'سایر').trim();
          const relNationalId = toAsciiDigits(getVal(row, 'nationalId', 'کد ملی بستگان', 'كد ملي', 'کد ملی') || '').trim();
          const rawDep = String(getVal(row, 'isDependent', 'تحت تکفل', 'تحت تکفل؟') || '').trim();
          const rawIns = String(getVal(row, 'insuranceCovered', 'بیمه تکمیلی', 'مشمول بیمه', 'بیمه') || '').trim();
          const isDependent = rawDep === '' ? true : !['خیر', 'نه', 'false', '0', 'ندارد'].includes(rawDep);
          const insuranceCovered = rawIns === '' ? isDependent : !['خیر', 'نه', 'false', '0', 'ندارد'].includes(rawIns);

          if (!Array.isArray(parent.relatives)) parent.relatives = [];
          const existingIdx = parent.relatives.findIndex(
            (r: any) =>
              (relNationalId && toAsciiDigits(r.nationalId).trim() === relNationalId) ||
              (normKey(String(r.fullName || '')) === normKey(relFullName) && normKey(String(r.relation || '')) === normKey(relation))
          );

          const relPayload = {
            id: existingIdx >= 0 ? parent.relatives[existingIdx].id : genId('rel'),
            personnelId: parent.id,
            personnelCode: parent.personnelCode,
            personnelName: parent.fullName,
            fullName: relFullName,
            relation,
            nationalId: relNationalId,
            shenasnamehNumber: String(getVal(row, 'shenasnamehNumber', 'شماره شناسنامه') || ''),
            fatherName: String(getVal(row, 'fatherName', 'نام پدر') || ''),
            birthDate: toAsciiDigits(getVal(row, 'birthDate', 'تاریخ تولد', 'تاريخ تولد') || '').trim(),
            gender: String(getVal(row, 'gender', 'جنسیت', 'جنسيت') || ''),
            phone: toAsciiDigits(getVal(row, 'phone', 'تلفن همراه', 'شماره تماس') || '').trim(),
            education: String(getVal(row, 'education', 'تحصیلات', 'مدرک تحصیلی') || ''),
            isDependent,
            insuranceCovered,
            notes: String(getVal(row, 'notes', 'توضیحات', 'یادداشت') || ''),
            updatedAt: nowStr,
            createdAt: existingIdx >= 0 ? parent.relatives[existingIdx].createdAt : nowStr,
          };

          if (existingIdx >= 0) {
            parent.relatives[existingIdx] = { ...parent.relatives[existingIdx], ...relPayload };
            updated++;
          } else {
            parent.relatives.push(relPayload);
            added++;
          }
          parent.updatedAt = nowStr;
          touchedParents.set(parent.id, parent);
        }

        if (touchedParents.size > 0) {
          const rowsToSave = Array.from(touchedParents.values()).map((p) => [
            p.id,
            toAsciiDigits(p.personnelCode || '').trim(),
            JSON.stringify(p),
            p.updatedAt,
          ]);
          const stmts = buildMultiRowUpsertStmts(
            env.DB,
            'personnel',
            ['id', 'personnel_code', 'data_json', 'updated_at'],
            'id',
            ['personnel_code', 'data_json', 'updated_at'],
            rowsToSave,
            "personnel_code = excluded.personnel_code, data_json = CASE WHEN personnel.data_json LIKE '%\"documents\":%' AND json_valid(personnel.data_json) AND json_type(personnel.data_json, '$.documents') IS NOT NULL THEN json_set(excluded.data_json, '$.documents', json_extract(personnel.data_json, '$.documents')) ELSE excluded.data_json END, updated_at = excluded.updated_at"
          );
          await batchExecuteAndTouch(env.DB, stmts);
        }

        return jsonRes(request, env, {
          success: true,
          added,
          updated,
          unmatched,
          message: `اطلاعات بستگان با موفقیت ذخیره شد (${added} جدید، ${updated} به‌روزرسانی${unmatched > 0 ? `، ${unmatched} ردیف بدون تطابق کد پرسنلی` : ''}).`,
        });
      }

      if (path === '/personnel/relatives/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'personnel', 'deleteAll')) return forbidden(request, env);
        const allPersonnel = await getJsonRows(env.DB, 'personnel');
        let deletedCount = 0;
        const stmts: D1PreparedStatement[] = [];
        for (const p of allPersonnel) {
          if (Array.isArray(p.relatives) && p.relatives.length > 0) {
            deletedCount += p.relatives.length;
            p.relatives = [];
            stmts.push(env.DB.prepare('UPDATE personnel SET data_json = ? WHERE id = ?').bind(JSON.stringify(p), p.id));
          }
        }
        if (stmts.length > 0) await batchExecuteChunked(env.DB, stmts);
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `تمامی اطلاعات بستگان پرسنل (${deletedCount} رکورد) پاکسازی شد.` });
      }

      // ================= KARANEH ROUTES =================
      if (path === '/karaneh/unit-personnel' && method === 'GET') {
        const canAccess =
          checkPermission(authUser, 'karaneh', 'view') ||
          checkPermission(authUser, 'karaneh', 'create') ||
          checkPermission(authUser, 'karaneh', 'edit') ||
          checkPermission(authUser, 'finalKaraneh', 'view');
        if (!canAccess) return jsonRes(request, env, { success: true, data: [] });
        const { results } = await env.DB.prepare(
          `SELECT id,
                  TRIM(personnel_code) as personnelCode,
                  COALESCE(json_extract(data_json, '$.fullName'), '') as fullName,
                  COALESCE(json_extract(data_json, '$.department'), '') as department,
                  COALESCE(json_extract(data_json, '$.position'), '') as position
           FROM personnel`
        ).all<any>();
        const rows = (results || []).filter((p: any) => isKaranehUnitAllowedForUser(authUser, p.department));
        return jsonRes(request, env, { success: true, data: rows });
      }

      if (path === '/karaneh' && method === 'GET') {
        const canKarView = checkPermission(authUser, 'karaneh', 'view');
        const canFinalView = checkPermission(authUser, 'finalKaraneh', 'view');
        if (!canKarView && !canFinalView) return jsonRes(request, env, { success: true, data: [] });
        const period = url.searchParams.get('period');
        const scope = url.searchParams.get('scope');
        const whereClause = period ? 'period = ?' : '';
        const binds = period ? [period] : [];
        const fullScope = hasFullKaranehScope(authUser);

        if (canKarView && fullScope && scope !== 'submitted') {
          const pg = parsePagination(url);
          if (pg.hasPagination) {
            const countSql = whereClause ? `SELECT COUNT(*) as total FROM karaneh WHERE ${whereClause}` : 'SELECT COUNT(*) as total FROM karaneh';
            const countStmt = binds.length > 0 ? env.DB.prepare(countSql).bind(...binds) : env.DB.prepare(countSql);
            const [countRow, rawArr] = await Promise.all([
              countStmt.first<{ total: number }>(),
              getRawJsonArrayString(env.DB, 'karaneh', whereClause, binds, 'data_json', pg.limit, pg.offset),
            ]);
            const total = Number(countRow?.total || 0);
            const hasMore = pg.offset + pg.limit < total;
            return rawJsonResponse(
              request,
              env,
              `{"success":true,"data":${rawArr},"total":${total},"limit":${pg.limit},"offset":${pg.offset},"hasMore":${hasMore}}`
            );
          }
          const rawArr = await getRawJsonArrayString(env.DB, 'karaneh', whereClause, binds);
          return rawJsonResponse(request, env, `{"success":true,"data":${rawArr}}`);
        }

        let rows = await getJsonRows(env.DB, 'karaneh', whereClause, binds);
        if (scope === 'submitted') {
          if (!canFinalView && !isSuperAdminUser(authUser)) {
            rows = rows.filter((k: any) => k.status === 'submitted' && isKaranehUnitAllowedForUser(authUser, k.department));
          } else {
            rows = rows.filter((k: any) => k.status === 'submitted');
          }
        } else {
          rows = rows.filter(
            (k: any) =>
              (canKarView && isKaranehUnitAllowedForUser(authUser, k.department)) ||
              (canFinalView && k.status === 'submitted')
          );
        }
        const pg = parsePagination(url);
        if (pg.hasPagination) {
          const slice = rows.slice(pg.offset, pg.offset + pg.limit);
          return jsonRes(request, env, {
            success: true,
            data: slice,
            total: rows.length,
            limit: pg.limit,
            offset: pg.offset,
            hasMore: pg.offset + pg.limit < rows.length,
          });
        }
        return jsonRes(request, env, { success: true, data: rows });
      }

      if (path === '/karaneh/comparison' && method === 'GET') {
        const canKarView = checkPermission(authUser, 'karaneh', 'view');
        const canFinalView = checkPermission(authUser, 'finalKaraneh', 'view');
        if (!canKarView && !canFinalView) return forbidden(request, env);
        const currentPeriod = url.searchParams.get('currentPeriod') || '1403-08';
        const previousPeriod = url.searchParams.get('previousPeriod') || '1403-07';
        const scope = url.searchParams.get('scope');
        let currentRecords = await getJsonRows(env.DB, 'karaneh', 'period = ?', [currentPeriod]);
        let previousRecords = await getJsonRows(env.DB, 'karaneh', 'period = ?', [previousPeriod]);

        const filterForUser = (list: any[]) => {
          if (scope === 'submitted') {
            return canFinalView || isSuperAdminUser(authUser)
              ? list.filter((k: any) => k.status === 'submitted')
              : list.filter((k: any) => k.status === 'submitted' && isKaranehUnitAllowedForUser(authUser, k.department));
          }
          if (canKarView && hasFullKaranehScope(authUser)) return list;
          return list.filter(
            (k: any) =>
              (canKarView && isKaranehUnitAllowedForUser(authUser, k.department)) ||
              (canFinalView && k.status === 'submitted')
          );
        };

        currentRecords = filterForUser(currentRecords);
        previousRecords = filterForUser(previousRecords);

        const prevMap = new Map<string, any>();
        for (const prev of previousRecords) prevMap.set(toAsciiDigits(prev.personnelCode).trim(), prev);

        const comparisonRows = currentRecords.map((curr: any) => {
          const prev = prevMap.get(toAsciiDigits(curr.personnelCode).trim());
          const prevFinal = prev ? Number(prev.finalKaraneh || 0) : 0;
          const currFinal = Number(curr.finalKaraneh || 0);
          const diffAmount = currFinal - prevFinal;
          const diffPercent = prevFinal > 0 ? Number(((diffAmount / prevFinal) * 100).toFixed(1)) : currFinal > 0 ? 100 : 0;
          const trend = !prev ? 'new' : diffAmount > 0 ? 'increase' : diffAmount < 0 ? 'decrease' : 'unchanged';
          return {
            id: curr.id,
            personnelId: curr.personnelId,
            personnelCode: curr.personnelCode,
            fullName: curr.fullName,
            department: curr.department,
            position: curr.position,
            currentKaraneh: currFinal,
            previousKaraneh: prevFinal,
            diffAmount,
            diffPercent,
            trend,
            notes: curr.notes || '',
            status: curr.status === 'submitted' ? 'submitted' : 'draft',
            submittedAt: curr.submittedAt || '',
            submittedBy: curr.submittedBy || '',
            submittedByName: curr.submittedByName || '',
          };
        });
        const totalCurrent = comparisonRows.reduce((s, r) => s + r.currentKaraneh, 0);
        const totalPrevious = comparisonRows.reduce((s, r) => s + r.previousKaraneh, 0);
        const totalDiff = totalCurrent - totalPrevious;
        const overallGrowthPercent = totalPrevious > 0 ? Number(((totalDiff / totalPrevious) * 100).toFixed(1)) : 0;
        return jsonRes(request, env, {
          success: true,
          data: {
            currentPeriod,
            previousPeriod,
            comparisonRows,
            summary: {
              totalEmployees: comparisonRows.length,
              totalCurrent,
              totalPrevious,
              totalDiff,
              overallGrowthPercent,
              countIncreased: comparisonRows.filter((r) => r.trend === 'increase').length,
              countDecreased: comparisonRows.filter((r) => r.trend === 'decrease').length,
              countUnchanged: comparisonRows.filter((r) => r.trend === 'unchanged').length,
              countNew: comparisonRows.filter((r) => r.trend === 'new').length,
            },
          },
        });
      }

      if (path === '/karaneh' && method === 'POST') {
        const kData: any = await request.json().catch(() => ({}));
        const isEdit = Boolean(kData.id);
        const hasKarPerm = checkPermission(authUser, 'karaneh', isEdit ? 'edit' : 'create');
        const hasFinalEditPerm = isEdit && checkPermission(authUser, 'finalKaraneh', 'edit');
        if (!hasKarPerm && !hasFinalEditPerm) return forbidden(request, env);
        if (!kData.personnelCode || !kData.period) {
          return jsonRes(request, env, { success: false, message: 'کد پرسنلی و دوره کارانه الزامی است.' }, 400);
        }
        const cleanCode = toAsciiDigits(kData.personnelCode).trim();
        const existingRow = await env.DB.prepare('SELECT id, data_json FROM karaneh WHERE period = ? AND personnel_code = ?')
          .bind(kData.period, cleanCode)
          .first<{ id: string; data_json?: string }>();
        const existingParsed = existingRow?.data_json ? JSON.parse(existingRow.data_json) : null;

        let effectiveDept = String(kData.department || existingParsed?.department || '').trim();
        if (!hasFullKaranehScope(authUser)) {
          const allowed = getKaranehAllowedUnitsForUser(authUser);
          if (!effectiveDept || effectiveDept === 'عمومی') {
            effectiveDept = allowed[0] || 'عمومی';
          }
          if (!isKaranehUnitAllowedForUser(authUser, effectiveDept) || (existingParsed && !isKaranehUnitAllowedForUser(authUser, existingParsed.department))) {
            return forbidden(request, env, `شما فقط مجاز به ثبت یا ویرایش کارانه واحد ${allowed.join('، ')} هستید.`);
          }
        } else if (!effectiveDept) {
          effectiveDept = 'عمومی';
        }

        const baseKaraneh = Number(kData.baseKaraneh || 0);
        const overtimeBonus = Number(kData.overtimeBonus || 0);
        const deductions = Number(kData.deductions || 0);
        const finalKaraneh = kData.finalKaraneh !== undefined ? Number(kData.finalKaraneh) : baseKaraneh + overtimeBonus - deductions;
        const canKeepSubmitted = isSuperAdminUser(authUser) || checkPermission(authUser, 'finalKaraneh', 'edit');
        const resolvedStatus =
          kData.status === 'submitted' && canKeepSubmitted
            ? 'submitted'
            : kData.status === 'draft'
            ? 'draft'
            : existingParsed?.status === 'submitted' && canKeepSubmitted
            ? 'submitted'
            : existingParsed?.status || 'draft';

        const record = {
          id: existingRow?.id || kData.id || genId('k'),
          personnelId: kData.personnelId || existingParsed?.personnelId || '',
          personnelCode: cleanCode,
          fullName: kData.fullName || existingParsed?.fullName || 'پرسنل',
          department: effectiveDept,
          position: kData.position ?? existingParsed?.position ?? '',
          period: kData.period,
          baseKaraneh,
          overtimeBonus,
          deductions,
          finalKaraneh,
          notes: kData.notes ?? existingParsed?.notes ?? '',
          status: resolvedStatus,
          submittedAt: resolvedStatus === 'submitted' ? (kData.submittedAt || existingParsed?.submittedAt || '') : '',
          submittedBy: resolvedStatus === 'submitted' ? (kData.submittedBy || existingParsed?.submittedBy || '') : '',
          submittedByName: resolvedStatus === 'submitted' ? (kData.submittedByName || existingParsed?.submittedByName || '') : '',
          updatedAt: faDate(),
        };
        await env.DB.prepare(
          `INSERT INTO karaneh (id, period, personnel_code, data_json) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET period = excluded.period, personnel_code = excluded.personnel_code, data_json = excluded.data_json`
        )
          .bind(record.id, record.period, record.personnelCode, JSON.stringify(record))
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: record, message: 'کارانه پرسنل با موفقیت ثبت شد.' });
      }

      if (path === '/karaneh/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'karaneh', 'importExcel')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        const period = parseYearMonth(body.period, String(body.period || '').trim());
        const items = unpackBatchItems(body);
        if (!period || items.length === 0) return jsonRes(request, env, { success: false, message: 'دوره کارانه و لیست رکوردها الزامی است.' }, 400);

        const incomingCodes = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'personnelCode', 'کد پرسنلی', 'كد پرسنلي', 'شماره پرسنلی') || '').trim())
              .filter(Boolean)
          )
        );
        if (incomingCodes.length === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped: items.length,
            message: 'هیچ ردیف معتبری با «کد پرسنلی» در این دسته کارانه یافت نشد.',
          });
        }

        const byCode = new Map<string, any>();
        const karSlices: string[][] = [];
        for (let i = 0; i < incomingCodes.length; i += 90) {
          karSlices.push(incomingCodes.slice(i, i + 90));
        }
        const [karLookupResponses, persMap] = await Promise.all([
          Promise.all(
            karSlices.map((slice) => {
              const placeholders = slice.map(() => '?').join(',');
              return env.DB.prepare(
                `SELECT id, personnel_code as personnelCode, data_json FROM karaneh WHERE period = ? AND personnel_code IN (${placeholders})`
              )
                .bind(period, ...slice)
                .all<any>();
            })
          ),
          getPersonnelLookupMap(env.DB, incomingCodes),
        ]);
        for (const res of karLookupResponses) {
          for (const k of res.results || []) {
            const c = toAsciiDigits(k.personnelCode).trim();
            if (!c) continue;
            try {
              byCode.set(c, JSON.parse(k.data_json));
            } catch {
              byCode.set(c, { id: k.id, personnelCode: c });
            }
          }
        }
        const fullScope = hasFullKaranehScope(authUser);
        const allowedUnits = getKaranehAllowedUnitsForUser(authUser);
        const defaultUnit = !fullScope && allowedUnits.length > 0 ? allowedUnits[0] : 'عمومی';
        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        let skippedUnit = 0;
        const nowStr = faDate();

        for (const row of items) {
          const code = toAsciiDigits(getVal(row, 'personnelCode', 'کد پرسنلی', 'كد پرسنلي', 'شماره پرسنلی') || '').trim();
          if (!code) continue;
          const matchingP = persMap.get(code);
          const prev = byCode.get(code);
          let dept = String(getVal(row, 'department', 'واحد اداری', 'واحد سازمانی', 'واحد') || matchingP?.department || prev?.department || '').trim();
          if (!dept) dept = defaultUnit;
          if (!fullScope && !isKaranehUnitAllowedForUser(authUser, dept)) {
            skippedUnit++;
            continue;
          }

          const baseKaraneh = parseNum(getVal(row, 'baseKaraneh', 'مبلغ کارانه (ریال)', 'مبلغ کارانه', 'کارانه پایه', 'کارانه پایه (ریال)'));
          const overtimeBonus = parseNum(getVal(row, 'overtimeBonus', 'پاداش اضافه‌کاری', 'پاداش', 'پاداش و اضافه‌کار', 'پاداش مازاد'));
          const deductions = parseNum(getVal(row, 'deductions', 'کسورات کارانه', 'کسورات'));
          const finalRaw = getVal(row, 'finalKaraneh', 'کارانه نهایی قابل پرداخت', 'کارانه نهایی', 'کارانه نهایی (ریال)', 'کارانه', 'مبلغ');
          const finalKaraneh = finalRaw !== undefined ? parseNum(finalRaw) : baseKaraneh + overtimeBonus - deductions;

          const record = {
            id: prev?.id || genId('k'),
            personnelId: matchingP?.id || prev?.personnelId || '',
            personnelCode: code,
            fullName: String(getVal(row, 'fullName', 'نام و نام خانوادگی') || matchingP?.fullName || prev?.fullName || 'پرسنل'),
            department: dept,
            position: String(getVal(row, 'position', 'پست سازمانی', 'پست و سمت', 'پست', 'سمت') || matchingP?.position || prev?.position || ''),
            period,
            baseKaraneh,
            overtimeBonus,
            deductions,
            finalKaraneh,
            notes: String(getVal(row, 'notes', 'توضیحات', 'یادداشت') || ''),
            status: prev?.status === 'submitted' && fullScope ? 'submitted' : 'draft',
            submittedAt: prev?.status === 'submitted' && fullScope ? (prev.submittedAt || '') : '',
            submittedBy: prev?.status === 'submitted' && fullScope ? (prev.submittedBy || '') : '',
            submittedByName: prev?.status === 'submitted' && fullScope ? (prev.submittedByName || '') : '',
            updatedAt: nowStr,
          };
          if (prev) updated++;
          else added++;
          byCode.set(code, record);
          pendingMap.set(record.id, [record.id, period, code, JSON.stringify(record)]);
        }

        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped: items.length,
            skippedUnit,
            message:
              skippedUnit > 0
                ? `ردیف‌های این دسته متعلق به واحد مجاز شما (${allowedUnits.join('، ')}) نبود.`
                : 'هیچ ردیف معتبری با «کد پرسنلی» در این دسته کارانه یافت نشد.',
          });
        }

        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'karaneh',
          ['id', 'period', 'personnel_code', 'data_json'],
          'id',
          ['period', 'personnel_code', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, {
          success: true,
          added,
          updated,
          skippedUnit,
          message: `لیست کارانه دوره ${period} با موفقیت ذخیره شد (${added} جدید، ${updated} به‌روزرسانی${skippedUnit > 0 ? `، ${skippedUnit} ردیف سایر واحدها نادیده گرفته شد` : ''}).`,
        });
      }

      if (path === '/karaneh/submit' && method === 'POST') {
        const canSubmit =
          isSuperAdminUser(authUser) ||
          checkPermission(authUser, 'karaneh', 'submit') ||
          checkPermission(authUser, 'finalKaraneh', 'edit');
        if (!canSubmit) return forbidden(request, env, 'شما مجوز ارسال کارانه به کارانه نهایی را ندارید.');
        const body: any = await request.json().catch(() => ({}));
        const period = parseYearMonth(body.period, String(body.period || '').trim());
        const targetDept = String(body.department || '').trim();
        if (!period) return jsonRes(request, env, { success: false, message: 'دوره کارانه الزامی است.' }, 400);
        if (targetDept && !hasFullKaranehScope(authUser) && !isKaranehUnitAllowedForUser(authUser, targetDept)) {
          return forbidden(request, env, 'شما مجاز به ارسال کارانه سایر واحدها نیستید.');
        }

        const rows = await getJsonRows(env.DB, 'karaneh', 'period = ?', [period]);
        const fullScope = hasFullKaranehScope(authUser);
        const nowTime = faDateTime();
        const pendingMap = new Map<string, any[]>();
        let submittedCount = 0;

        for (const r of rows) {
          if (targetDept && normKey(String(r.department || '')) !== normKey(targetDept)) continue;
          if (!fullScope && !isKaranehUnitAllowedForUser(authUser, r.department)) continue;
          const updatedRec = {
            ...r,
            status: 'submitted',
            submittedAt: nowTime,
            submittedBy: authUser.username,
            submittedByName: authUser.fullName,
            updatedAt: faDate(),
          };
          pendingMap.set(updatedRec.id, [updatedRec.id, period, String(updatedRec.personnelCode || '').trim(), JSON.stringify(updatedRec)]);
          submittedCount++;
        }

        if (submittedCount === 0) {
          return jsonRes(request, env, { success: false, message: 'رکورد کارانه‌ای برای ارسال در این دوره و واحد یافت نشد.' }, 400);
        }

        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'karaneh',
          ['id', 'period', 'personnel_code', 'data_json'],
          'id',
          ['period', 'personnel_code', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteChunked(env.DB, stmts);
        await touchLastSaved(env.DB);
        return jsonRes(request, env, {
          success: true,
          submittedCount,
          message: `کارانه ${submittedCount} نفر در دوره ${period} با موفقیت تأیید و به صفحه «کارانه نهایی ارسالی» ارسال گردید.`,
        });
      }

      if (path === '/karaneh/reopen' && method === 'POST') {
        if (!isSuperAdminUser(authUser) && !checkPermission(authUser, 'finalKaraneh', 'edit')) {
          return forbidden(request, env, 'شما مجوز بازگرداندن کارانه به حالت پیش‌نویس را ندارید.');
        }
        const body: any = await request.json().catch(() => ({}));
        const period = parseYearMonth(body.period, String(body.period || '').trim());
        const targetDept = String(body.department || '').trim();
        if (!period) return jsonRes(request, env, { success: false, message: 'دوره کارانه الزامی است.' }, 400);

        const rows = await getJsonRows(env.DB, 'karaneh', 'period = ?', [period]);
        const pendingMap = new Map<string, any[]>();
        let reopenedCount = 0;

        for (const r of rows) {
          if (r.status !== 'submitted') continue;
          if (targetDept && normKey(String(r.department || '')) !== normKey(targetDept)) continue;
          const updatedRec = {
            ...r,
            status: 'draft',
            submittedAt: '',
            submittedBy: '',
            submittedByName: '',
            updatedAt: faDate(),
          };
          pendingMap.set(updatedRec.id, [updatedRec.id, period, String(updatedRec.personnelCode || '').trim(), JSON.stringify(updatedRec)]);
          reopenedCount++;
        }

        if (reopenedCount > 0) {
          const stmts = buildMultiRowUpsertStmts(
            env.DB,
            'karaneh',
            ['id', 'period', 'personnel_code', 'data_json'],
            'id',
            ['period', 'personnel_code', 'data_json'],
            Array.from(pendingMap.values())
          );
          await batchExecuteChunked(env.DB, stmts);
          await touchLastSaved(env.DB);
        }

        return jsonRes(request, env, {
          success: true,
          reopenedCount,
          message: `کارانه ${reopenedCount} نفر به حالت پیش‌نویس واحد بازگردانده شد.`,
        });
      }

      if (path.startsWith('/karaneh/') && method === 'DELETE') {
        const canDel = checkPermission(authUser, 'karaneh', 'delete') || checkPermission(authUser, 'finalKaraneh', 'delete');
        if (!canDel) return forbidden(request, env);
        const id = decodeURIComponent(path.slice('/karaneh/'.length));
        if (!hasFullKaranehScope(authUser)) {
          const row = await env.DB.prepare('SELECT data_json FROM karaneh WHERE id = ?').bind(id).first<{ data_json: string }>();
          if (row) {
            const parsed = JSON.parse(row.data_json);
            if (!isKaranehUnitAllowedForUser(authUser, parsed.department)) return forbidden(request, env);
          }
        }
        await env.DB.prepare('DELETE FROM karaneh WHERE id = ?').bind(id).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: 'رکورد کارانه حذف شد.' });
      }

      if (path === '/karaneh/batch-delete' && method === 'POST') {
        const canDel = checkPermission(authUser, 'karaneh', 'delete') || checkPermission(authUser, 'finalKaraneh', 'delete');
        if (!canDel) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        let ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (!hasFullKaranehScope(authUser) && ids.length > 0) {
          const allowedIds: string[] = [];
          for (let i = 0; i < ids.length; i += 75) {
            const slice = ids.slice(i, i + 75);
            const ph = slice.map(() => '?').join(',');
            const { results } = await env.DB.prepare(`SELECT id, data_json FROM karaneh WHERE id IN (${ph})`).bind(...slice).all<any>();
            for (const r of results || []) {
              const parsed = JSON.parse(r.data_json);
              if (isKaranehUnitAllowedForUser(authUser, parsed.department)) allowedIds.push(r.id);
            }
          }
          ids = allowedIds;
        }
        if (ids.length > 0) {
          await batchExecuteChunked(env.DB, ids.map((id: string) => env.DB.prepare('DELETE FROM karaneh WHERE id = ?').bind(id)));
          await touchLastSaved(env.DB);
        }
        return jsonRes(request, env, { success: true, deletedCount: ids.length, message: `${ids.length} رکورد کارانه حذف شد.` });
      }

      if (path === '/karaneh/delete-all' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const scope = body.scope === 'submitted' ? 'submitted' : 'all';
        const hasPerm =
          scope === 'submitted'
            ? checkPermission(authUser, 'finalKaraneh', 'deleteAll') || checkPermission(authUser, 'karaneh', 'deleteAll')
            : checkPermission(authUser, 'karaneh', 'deleteAll');
        if (!hasPerm) return forbidden(request, env);

        let deletedCount = 0;
        const fullScope = hasFullKaranehScope(authUser);
        if (scope === 'submitted' || !fullScope) {
          const rows = body.period
            ? await getJsonRows(env.DB, 'karaneh', 'period = ?', [body.period])
            : await getJsonRows(env.DB, 'karaneh');
          const idsToDelete = rows
            .filter((r: any) => {
              if (scope === 'submitted' && r.status !== 'submitted') return false;
              if (!fullScope && !isKaranehUnitAllowedForUser(authUser, r.department)) return false;
              return true;
            })
            .map((r: any) => r.id);
          deletedCount = idsToDelete.length;
          if (idsToDelete.length > 0) {
            await batchExecuteChunked(env.DB, idsToDelete.map((id: string) => env.DB.prepare('DELETE FROM karaneh WHERE id = ?').bind(id)));
          }
        } else if (body.period) {
          const c = await env.DB.prepare('SELECT COUNT(*) as c FROM karaneh WHERE period = ?').bind(body.period).first<{ c: number }>();
          deletedCount = Number(c?.c || 0);
          await env.DB.prepare('DELETE FROM karaneh WHERE period = ?').bind(body.period).run();
        } else {
          const c = await env.DB.prepare('SELECT COUNT(*) as c FROM karaneh').first<{ c: number }>();
          deletedCount = Number(c?.c || 0);
          await env.DB.prepare('DELETE FROM karaneh').run();
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `${deletedCount} رکورد کارانه پاکسازی شد.` });
      }

      // ================= JOB GROUPS ROUTES =================
      if (path === '/job-groups' && method === 'GET') {
        if (!checkPermission(authUser, 'jobGroups', 'view')) return jsonRes(request, env, { success: true, data: [] });
        return jsonRes(request, env, { success: true, data: await getJsonRows(env.DB, 'job_groups') });
      }

      if (path === '/job-groups' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'create')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        if (!body.code || !body.title) return jsonRes(request, env, { success: false, message: 'کد و عنوان گروه شغلی الزامی است.' }, 400);
        const item = {
          id: genId('jg'),
          ...body,
          grade: Number(body.grade || 1),
          minBaseSalary: Number(body.minBaseSalary || 0),
          maxBaseSalary: Number(body.maxBaseSalary || 0),
          maxKaranehCeiling: Number(body.maxKaranehCeiling || 0),
          requiredExperienceYears: Number(body.requiredExperienceYears || 0),
        };
        await env.DB.prepare('INSERT INTO job_groups (id, data_json) VALUES (?, ?)').bind(item.id, JSON.stringify(item)).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: item, message: 'گروه شغلی جدید با موفقیت ثبت شد.' });
      }

      if (path.startsWith('/job-groups/') && !path.includes('/batch-') && path !== '/job-groups/delete-all') {
        const id = decodeURIComponent(path.slice('/job-groups/'.length));
        if (method === 'PUT') {
          if (!checkPermission(authUser, 'jobGroups', 'edit')) return forbidden(request, env);
          const row = await env.DB.prepare('SELECT data_json FROM job_groups WHERE id = ?').bind(id).first<{ data_json: string }>();
          if (!row) return jsonRes(request, env, { success: false, message: 'گروه شغلی یافت نشد.' }, 404);
          const updated = { ...JSON.parse(row.data_json), ...(await request.json().catch(() => ({}))) };
          await env.DB.prepare('UPDATE job_groups SET data_json = ? WHERE id = ?').bind(JSON.stringify(updated), id).run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, data: updated, message: 'گروه شغلی به‌روزرسانی شد.' });
        }
        if (method === 'DELETE') {
          if (!checkPermission(authUser, 'jobGroups', 'delete')) return forbidden(request, env);
          await env.DB.prepare('DELETE FROM job_groups WHERE id = ?').bind(id).run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, message: 'گروه شغلی حذف شد.' });
        }
      }

      if (path === '/job-groups/batch-delete' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (ids.length === 0) return jsonRes(request, env, { success: false, message: 'موردی برای حذف انتخاب نشده است.' }, 400);
        await batchExecuteChunked(env.DB, ids.map((id: string) => env.DB.prepare('DELETE FROM job_groups WHERE id = ?').bind(id)));
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: ids.length, message: `${ids.length} گروه شغلی حذف شد.` });
      }

      if (path === '/job-groups/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'deleteAll')) return forbidden(request, env);
        const c = await env.DB.prepare('SELECT COUNT(*) as c FROM job_groups').first<{ c: number }>();
        await env.DB.prepare('DELETE FROM job_groups').run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: Number(c?.c || 0), message: `کل جدول گروه‌های شغلی (${Number(c?.c || 0)} گروه) پاکسازی شد.` });
      }

      // ================= JOB CLASSIFICATIONS ROUTES =================
      if (path === '/job-classifications' && method === 'GET') {
        if (!checkPermission(authUser, 'jobGroups', 'view')) return jsonRes(request, env, { success: true, data: [] });
        const pg = parsePagination(url);
        if (pg.hasPagination) {
          const [countRow, rawArr] = await Promise.all([
            env.DB.prepare('SELECT COUNT(*) as total FROM job_classifications').first<{ total: number }>(),
            getRawJsonArrayString(env.DB, 'job_classifications', '', [], 'data_json', pg.limit, pg.offset),
          ]);
          const total = Number(countRow?.total || 0);
          const hasMore = pg.offset + pg.limit < total;
          return rawJsonResponse(
            request,
            env,
            `{"success":true,"data":${rawArr},"total":${total},"limit":${pg.limit},"offset":${pg.offset},"hasMore":${hasMore}}`
          );
        }
        const rawArr = await getRawJsonArrayString(env.DB, 'job_classifications');
        return rawJsonResponse(request, env, `{"success":true,"data":${rawArr}}`);
      }

      if (path === '/job-classifications' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'create')) return forbidden(request, env);
        const b: any = await request.json().catch(() => ({}));
        if (!b.personnelCode && !b.nationalId && !b.lastName) {
          return jsonRes(request, env, { success: false, message: 'کد پرسنلی یا کد ملی یا نام خانوادگی الزامی است.' }, 400);
        }
        const record = {
          id: genId('jc'),
          personnelCode: String(b.personnelCode || '').trim(),
          firstName: String(b.firstName || '').trim(),
          lastName: String(b.lastName || '').trim(),
          workLocation: String(b.workLocation || '').trim(),
          department: String(b.department || '').trim(),
          nationalId: String(b.nationalId || '').trim(),
          education: String(b.education || '').trim(),
          hireDate: String(b.hireDate || '').trim(),
          hireMonth: String(b.hireMonth || '').trim(),
          miningExperienceDays: String(b.miningExperienceDays || '').trim(),
          totalInsuranceHistory: String(b.totalInsuranceHistory || '').trim(),
          miningExperience: String(b.miningExperience || '').trim(),
          nonMiningExperience: String(b.nonMiningExperience || '').trim(),
          jobGroup: String(b.jobGroup || '').trim(),
          groupGapFrom1405: String(b.groupGapFrom1405 || '').trim(),
          nextGroupGap: String(b.nextGroupGap || '').trim(),
          jobTitle: String(b.jobTitle || '').trim(),
          position: String(b.position || '').trim(),
          updatedAt: faDate(),
        };
        await env.DB.prepare('INSERT INTO job_classifications (id, personnel_code, data_json) VALUES (?, ?, ?)')
          .bind(record.id, record.personnelCode, JSON.stringify(record))
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: record, message: 'ردیف طرح طبقه‌بندی مشاغل با موفقیت ثبت شد.' });
      }

      if (path.startsWith('/job-classifications/') && !path.includes('/batch-') && path !== '/job-classifications/delete-all') {
        const id = decodeURIComponent(path.slice('/job-classifications/'.length));
        if (method === 'PUT') {
          if (!checkPermission(authUser, 'jobGroups', 'edit')) return forbidden(request, env);
          const row = await env.DB.prepare('SELECT data_json FROM job_classifications WHERE id = ?').bind(id).first<{ data_json: string }>();
          if (!row) return jsonRes(request, env, { success: false, message: 'رکورد طبقه‌بندی یافت نشد.' }, 404);
          const updated = { ...JSON.parse(row.data_json), ...(await request.json().catch(() => ({}))), updatedAt: faDate() };
          await env.DB.prepare('UPDATE job_classifications SET personnel_code = ?, data_json = ? WHERE id = ?')
            .bind(String(updated.personnelCode || ''), JSON.stringify(updated), id)
            .run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, data: updated, message: 'رکورد طرح طبقه‌بندی مشاغل به‌روزرسانی شد.' });
        }
        if (method === 'DELETE') {
          if (!checkPermission(authUser, 'jobGroups', 'delete')) return forbidden(request, env);
          await env.DB.prepare('DELETE FROM job_classifications WHERE id = ?').bind(id).run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, message: 'رکورد طبقه‌بندی مشاغل حذف شد.' });
        }
      }

      if (path === '/job-classifications/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'importExcel')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const incomingCodes = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'personnelCode', 'کد پرسنلی', 'كد پرسنلي') || '').trim())
              .filter(Boolean)
          )
        );
        const incomingNats = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'nationalId', 'کد ملی', 'كد ملي') || '').trim())
              .filter(Boolean)
          )
        );

        const byCode = new Map<string, string>();
        const byNat = new Map<string, string>();

        const codeSlices: string[][] = [];
        for (let i = 0; i < incomingCodes.length; i += 90) codeSlices.push(incomingCodes.slice(i, i + 90));
        const natSlices: string[][] = [];
        for (let i = 0; i < incomingNats.length; i += 90) natSlices.push(incomingNats.slice(i, i + 90));

        const [codeResponses, natResponses] = await Promise.all([
          Promise.all(
            codeSlices.map((slice) => {
              const ph = slice.map(() => '?').join(',');
              return env.DB.prepare(
                `SELECT id, personnel_code as personnelCode, COALESCE(json_extract(data_json, '$.nationalId'), '') as nationalId FROM job_classifications WHERE personnel_code IN (${ph})`
              )
                .bind(...slice)
                .all<any>();
            })
          ),
          Promise.all(
            natSlices.map((slice) => {
              const ph = slice.map(() => '?').join(',');
              return env.DB.prepare(
                `SELECT id, personnel_code as personnelCode, COALESCE(json_extract(data_json, '$.nationalId'), '') as nationalId FROM job_classifications WHERE COALESCE(json_extract(data_json, '$.nationalId'), '') IN (${ph})`
              )
                .bind(...slice)
                .all<any>();
            })
          ),
        ]);
        for (const res of [...codeResponses, ...natResponses]) {
          for (const r of res.results || []) {
            const c = toAsciiDigits(r.personnelCode).trim();
            const n = toAsciiDigits(r.nationalId).trim();
            if (c) byCode.set(c, r.id);
            if (n) byNat.set(n, r.id);
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        const nowStr = faDate();

        for (const row of items) {
          const code = toAsciiDigits(getVal(row, 'personnelCode', 'کد پرسنلی', 'كد پرسنلي') || '').trim();
          const nationalId = toAsciiDigits(getVal(row, 'nationalId', 'کد ملی', 'كد ملي') || '').trim();
          const firstName = String(getVal(row, 'firstName', 'نام') || '').trim();
          const lastName = String(getVal(row, 'lastName', 'نام خانوادگی', 'نام خانوادگي') || '').trim();
          if (!code && !nationalId && !lastName) continue;

          const existingId = (code && byCode.get(code)) || (nationalId && byNat.get(nationalId)) || '';
          const rec = {
            id: existingId || genId('jc'),
            personnelCode: code,
            firstName,
            lastName,
            workLocation: String(getVal(row, 'workLocation', 'محل خدمت') || '').trim(),
            department: String(getVal(row, 'department', 'واحد', 'واحد سازمانی') || '').trim(),
            nationalId,
            education: String(getVal(row, 'education', 'مدرک تحصیلی', 'مدرك تحصيلي') || '').trim(),
            hireDate: toAsciiDigits(getVal(row, 'hireDate', 'تاریخ استخدام', 'تاريخ استخدام') || '').trim(),
            hireMonth: String(getVal(row, 'hireMonth', 'ماه استخدام') || '').trim(),
            miningExperienceDays: String(getVal(row, 'miningExperienceDays', 'سابقه معدنی به روز') || '').trim(),
            totalInsuranceHistory: String(getVal(row, 'totalInsuranceHistory', 'سابقه بیمه کلی') || '').trim(),
            miningExperience: String(getVal(row, 'miningExperience', 'سابقه معدنی') || '').trim(),
            nonMiningExperience: String(getVal(row, 'nonMiningExperience', 'سابقه غیرمعدنی') || '').trim(),
            jobGroup: String(getVal(row, 'jobGroup', 'گروه شغلی') || '').trim(),
            groupGapFrom1405: String(getVal(row, 'groupGapFrom1405', 'فاصله گروه از 1405 به بعد', 'فاصله گروه از ۱۴۰۵ به بعد') || '').trim(),
            nextGroupGap: String(getVal(row, 'nextGroupGap', 'فاصله گروه بعدی') || '').trim(),
            jobTitle: String(getVal(row, 'jobTitle', 'شغل') || '').trim(),
            position: String(getVal(row, 'position', 'پست', 'سمت') || '').trim(),
            updatedAt: nowStr,
          };
          if (existingId) updated++;
          else added++;
          if (code) byCode.set(code, rec.id);
          if (nationalId) byNat.set(nationalId, rec.id);
          pendingMap.set(rec.id, [rec.id, rec.personnelCode, JSON.stringify(rec)]);
        }

        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped: items.length,
            message: 'هیچ ردیف معتبری با کد پرسنلی، کد ملی یا نام خانوادگی در این دسته یافت نشد.',
          });
        }

        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'job_classifications',
          ['id', 'personnel_code', 'data_json'],
          'id',
          ['personnel_code', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, {
          success: true,
          added,
          updated,
          message: `جدول طرح طبقه‌بندی مشاغل با موفقیت در دیتابیس ذخیره شد (${added} جدید، ${updated} به‌روزرسانی).`,
        });
      }

      if (path === '/job-classifications/batch-delete' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        await batchExecuteChunked(env.DB, ids.map((id: string) => env.DB.prepare('DELETE FROM job_classifications WHERE id = ?').bind(id)));
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: ids.length, message: `${ids.length} رکورد طبقه‌بندی مشاغل حذف شد.` });
      }

      if (path === '/job-classifications/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'jobGroups', 'deleteAll')) return forbidden(request, env);
        const c = await env.DB.prepare('SELECT COUNT(*) as c FROM job_classifications').first<{ c: number }>();
        await env.DB.prepare('DELETE FROM job_classifications').run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: Number(c?.c || 0), message: `جدول طرح طبقه‌بندی مشاغل (${Number(c?.c || 0)} رکورد) پاکسازی شد.` });
      }

      // ================= COMMITMENTS ROUTES =================
      if (path === '/commitments' && method === 'GET') {
        if (!checkPermission(authUser, 'commitments', 'view')) return jsonRes(request, env, { success: true, data: [] });
        const pg = parsePagination(url);
        if (pg.hasPagination) {
          const [countRow, rawArr] = await Promise.all([
            env.DB.prepare('SELECT COUNT(*) as total FROM commitments').first<{ total: number }>(),
            getRawJsonArrayString(env.DB, 'commitments', '', [], 'data_json', pg.limit, pg.offset),
          ]);
          const total = Number(countRow?.total || 0);
          const hasMore = pg.offset + pg.limit < total;
          return rawJsonResponse(
            request,
            env,
            `{"success":true,"data":${rawArr},"total":${total},"limit":${pg.limit},"offset":${pg.offset},"hasMore":${hasMore}}`
          );
        }
        const rawArr = await getRawJsonArrayString(env.DB, 'commitments');
        return rawJsonResponse(request, env, `{"success":true,"data":${rawArr}}`);
      }

      if (path === '/commitments' && method === 'POST') {
        if (!checkPermission(authUser, 'commitments', 'create')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        if (!body.personnelName || !body.commitmentType) {
          return jsonRes(request, env, { success: false, message: 'نام پرسنل و نوع تعهد الزامی است.' }, 400);
        }
        const item = {
          id: genId('cmt'),
          ...body,
          amount: Number(body.amount || 0),
          previouslyTakenAmount: Number(body.previouslyTakenAmount || 0),
          maxAllowedAmount: Number(body.maxAllowedAmount || 0),
          isArchived: Boolean(body.isArchived),
        };
        await env.DB.prepare('INSERT INTO commitments (id, personnel_code, data_json) VALUES (?, ?, ?)')
          .bind(item.id, String(item.personnelCode || ''), JSON.stringify(item))
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: item, message: 'سند تعهد پرسنلی با موفقیت ذخیره شد.' });
      }

      if (path.startsWith('/commitments/') && !path.includes('/batch-') && path !== '/commitments/delete-all') {
        const id = decodeURIComponent(path.slice('/commitments/'.length));
        if (method === 'PUT') {
          const body: any = await request.json().catch(() => ({}));
          const isArchiveToggle = body.isArchived !== undefined && Object.keys(body).length <= 3;
          if (!checkPermission(authUser, 'commitments', isArchiveToggle ? 'archive' : 'edit') && !checkPermission(authUser, 'commitments', 'edit')) {
            return forbidden(request, env);
          }
          const row = await env.DB.prepare('SELECT data_json FROM commitments WHERE id = ?').bind(id).first<{ data_json: string }>();
          if (!row) return jsonRes(request, env, { success: false, message: 'تعهد یافت نشد.' }, 404);
          const prev = JSON.parse(row.data_json);
          const updated = {
            ...prev,
            ...body,
            amount: body.amount !== undefined ? Number(body.amount) : prev.amount,
            previouslyTakenAmount: body.previouslyTakenAmount !== undefined ? Number(body.previouslyTakenAmount) : prev.previouslyTakenAmount,
            maxAllowedAmount: body.maxAllowedAmount !== undefined ? Number(body.maxAllowedAmount) : prev.maxAllowedAmount,
          };
          await env.DB.prepare('UPDATE commitments SET personnel_code = ?, data_json = ? WHERE id = ?')
            .bind(String(updated.personnelCode || ''), JSON.stringify(updated), id)
            .run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, data: updated, message: 'سند تعهد به‌روزرسانی شد.' });
        }
        if (method === 'DELETE') {
          if (!checkPermission(authUser, 'commitments', 'delete')) return forbidden(request, env);
          await env.DB.prepare('DELETE FROM commitments WHERE id = ?').bind(id).run();
          await touchLastSaved(env.DB);
          return jsonRes(request, env, { success: true, message: 'سند تعهد حذف شد.' });
        }
      }

      if (path === '/commitments/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'commitments', 'importExcel')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const incomingCodes = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'personnelCode', 'کد پرسنلی', 'كد پرسنلي') || '').trim())
              .filter(Boolean)
          )
        );
        const persMap = incomingCodes.length > 0 ? await getPersonnelLookupMap(env.DB, incomingCodes) : new Map<string, any>();
        const pendingMap = new Map<string, any[]>();
        let added = 0;

        for (const row of items) {
          const code = toAsciiDigits(getVal(row, 'personnelCode', 'کد پرسنلی', 'كد پرسنلي') || '').trim();
          const matchingP = code ? persMap.get(code) : undefined;
          const rawName = String(getVal(row, 'personnelName', 'نام پرسنل', 'نام و نام خانوادگی') || matchingP?.fullName || '').trim();
          const name = rawName || (code ? `پرسنل ${code}` : '');
          const type = String(getVal(row, 'commitmentType', 'نوع تعهد یا تضمین', 'نوع تعهد') || 'تعهد خدمت').trim();
          if (!name) continue;
          const rawArch = String(getVal(row, 'isArchived', 'بایگانی', 'وضعیت بایگانی') || '').trim();
          const isArchived = ['بله', 'آری', 'true', '1', 'بایگانی شده'].includes(rawArch);
          const rec = {
            id: genId('cmt'),
            personnelId: matchingP?.id || '',
            personnelCode: code,
            personnelName: name,
            commitmentType: type,
            amount: parseNum(getVal(row, 'amount', 'مبلغ تعهد فعلی (ریال)', 'مبلغ تعهد فعلی', 'مبلغ تعهد', 'مبلغ')),
            previouslyTakenAmount: parseNum(getVal(row, 'previouslyTakenAmount', 'مبلغ قبلاً دریافت شده (ریال)', 'مبلغ قبلی', 'مبلغی که قبلاً گرفته')),
            maxAllowedAmount: parseNum(getVal(row, 'maxAllowedAmount', 'سقف مجاز کل (ریال)', 'سقف کل مجاز', 'سقف مجاز')),
            startDate: toAsciiDigits(getVal(row, 'startDate', 'تاریخ شروع') || faDate()).trim(),
            endDate: toAsciiDigits(getVal(row, 'endDate', 'تاریخ سررسید', 'تاریخ پایان') || '').trim(),
            status: String(getVal(row, 'status', 'وضعیت') || 'جاری و معتبر'),
            isArchived,
            guarantorName: String(getVal(row, 'guarantorName', 'نام ضامن', 'ضامن') || '-'),
            notes: String(getVal(row, 'notes', 'توضیحات') || ''),
          };
          pendingMap.set(rec.id, [rec.id, code, JSON.stringify(rec)]);
          added++;
        }
        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped: items.length,
            message: 'هیچ ردیف معتبری با «کد پرسنلی» یا «نام پرسنل» در این دسته تعهدات یافت نشد.',
          });
        }
        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'commitments',
          ['id', 'personnel_code', 'data_json'],
          'id',
          ['personnel_code', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, { success: true, added, message: `${added} سند تعهد پرسنلی با موفقیت ذخیره شد.` });
      }

      if (path === '/commitments/batch-delete' && method === 'POST') {
        if (!checkPermission(authUser, 'commitments', 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        await batchExecuteChunked(env.DB, ids.map((id: string) => env.DB.prepare('DELETE FROM commitments WHERE id = ?').bind(id)));
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: ids.length, message: `${ids.length} سند تعهد پرسنلی حذف شد.` });
      }

      if (path === '/commitments/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'commitments', 'deleteAll')) return forbidden(request, env);
        const c = await env.DB.prepare('SELECT COUNT(*) as c FROM commitments').first<{ c: number }>();
        await env.DB.prepare('DELETE FROM commitments').run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: Number(c?.c || 0), message: `کل جدول تعهدات پرسنلی (${Number(c?.c || 0)} سند) پاکسازی شد.` });
      }

      // ================= PAYROLL ROUTES =================
      if (path === '/payroll' && method === 'GET') {
        if (!checkPermission(authUser, 'payroll', 'view')) return jsonRes(request, env, { success: true, data: [] });
        const period = url.searchParams.get('period');
        const whereClause = period ? 'period = ?' : '';
        const binds = period ? [period] : [];
        const pg = parsePagination(url);
        if (pg.hasPagination) {
          const countSql = whereClause ? `SELECT COUNT(*) as total FROM payroll WHERE ${whereClause}` : 'SELECT COUNT(*) as total FROM payroll';
          const countStmt = binds.length > 0 ? env.DB.prepare(countSql).bind(...binds) : env.DB.prepare(countSql);
          const [countRow, rawArr] = await Promise.all([
            countStmt.first<{ total: number }>(),
            getRawJsonArrayString(env.DB, 'payroll', whereClause, binds, 'data_json', pg.limit, pg.offset),
          ]);
          const total = Number(countRow?.total || 0);
          const hasMore = pg.offset + pg.limit < total;
          return rawJsonResponse(
            request,
            env,
            `{"success":true,"data":${rawArr},"total":${total},"limit":${pg.limit},"offset":${pg.offset},"hasMore":${hasMore}}`
          );
        }
        const rawArr = await getRawJsonArrayString(env.DB, 'payroll', whereClause, binds);
        return rawJsonResponse(request, env, `{"success":true,"data":${rawArr}}`);
      }

      if (path === '/payroll/batch-import' && method === 'POST') {
        if (!checkPermission(authUser, 'payroll', 'importExcel')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        const period = parseYearMonth(body.period, String(body.period || '').trim());
        const useRowYearMonth = body.useRowYearMonth !== false;
        const items = unpackBatchItems(body);
        if (!period || items.length === 0) return jsonRes(request, env, { success: false, message: 'دوره و لیست ردیف‌های حقوق الزامی است.' }, 400);

        const incomingPayCodes: string[] = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'كد پرسنلي', 'کد پرسنلی', 'شماره پرسنلی', 'personnelCode') || '').trim())
              .filter((c: string) => Boolean(c))
          )
        );
        const paySlices: string[][] = [];
        for (let i = 0; i < incomingPayCodes.length; i += 90) {
          paySlices.push(incomingPayCodes.slice(i, i + 90));
        }
        const [persByCode, payLookupResponses] = await Promise.all([
          getPersonnelLookupMap(env.DB, incomingPayCodes),
          Promise.all(
            paySlices.map((slice) => {
              const placeholders = slice.map(() => '?').join(',');
              return env.DB.prepare(
                `SELECT id, period, personnel_code as personnelCode FROM payroll WHERE personnel_code IN (${placeholders})`
              )
                .bind(...slice)
                .all<{ id: string; period: string; personnelCode: string }>();
            })
          ),
        ]);
        const payIdMap = new Map<string, string>();
        for (const res of payLookupResponses) {
          for (const r of res.results || []) {
            const k = `${toAsciiDigits(r.period).trim()}__${toAsciiDigits(r.personnelCode).trim()}`;
            payIdMap.set(k, r.id);
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        const nowStr = faDate();

        for (const row of items) {
          const code = toAsciiDigits(getVal(row, 'كد پرسنلي', 'کد پرسنلی', 'شماره پرسنلی', 'personnelCode') || '').trim();
          if (!code) continue;
          const rawYm = getVal(row, 'سال/ماه', 'سال ماه', 'دوره', 'yearMonthLabel');
          const targetPeriod = useRowYearMonth ? parseYearMonth(rawYm, period) : period;
          const firstName = String(getVal(row, 'نام', 'firstName') || '').trim();
          const lastName = String(getVal(row, 'نام خانوادگي', 'نام خانوادگی', 'lastName') || '').trim();
          const fullNameRaw = String(getVal(row, 'نام و نام خانوادگي', 'نام و نام خانوادگی', 'fullName') || '').trim();
          const matchingP = persByCode.get(code);
          const fullName = fullNameRaw || `${firstName} ${lastName}`.trim() || matchingP?.fullName || 'پرسنل';
          const key = `${targetPeriod}__${code}`;
          const prevId = payIdMap.get(key);
          const recordId = prevId || genId('pay');

          const record = {
            id: recordId,
            period: targetPeriod,
            yearMonthLabel: toAsciiDigits(rawYm || targetPeriod.replace('-', '/')).trim(),
            employeeId: String(getVal(row, 'شناسه كارمند', 'شناسه کارمند', 'employeeId') || ''),
            personnelCode: code,
            firstName,
            lastName,
            fullName,
            nationalId: toAsciiDigits(getVal(row, 'كد ملي', 'کد ملی', 'nationalId') || matchingP?.nationalId || '').trim(),
            workLocation: String(getVal(row, 'محل خدمت', 'workLocation') || ''),
            department: String(getVal(row, 'واحد سازماني', 'واحد سازمانی', 'واحد', 'department') || matchingP?.department || ''),
            jobTitle: String(getVal(row, 'شغل', 'jobTitle') || ''),
            position: String(getVal(row, 'پست', 'پست سازمانی', 'position') || matchingP?.position || ''),
            jobGroupCode: String(getVal(row, 'کد گروه شغلي', 'کد گروه شغلی', 'jobGroupCode') || ''),
            jobGroupTitle: String(getVal(row, 'عنوان گروه شغلي', 'عنوان گروه شغلی', 'jobGroupTitle') || ''),
            employmentType: String(getVal(row, 'نوع استخدام', 'employmentType') || ''),
            effectiveDays: parseNum(getVal(row, 'کارکرد موثر', 'effectiveDays')),
            netPayable: parseNum(getVal(row, 'خالص پرداختی', 'netPayable')),
            totalBenefits: parseNum(getVal(row, 'جمع مزایا', 'totalBenefits')),
            overtimeAmount: parseNum(getVal(row, 'اضافه کاری', 'overtimeAmount')),
            fridayWorkAmount: parseNum(getVal(row, 'جمعه کاری', 'fridayWorkAmount')),
            missionAmount: parseNum(getVal(row, 'ماموریت ریالی', 'missionAmount')),
            bonusAmount: parseNum(getVal(row, 'پاداش', 'پاداشِ', 'bonusAmount')),
            incentiveAmount: parseNum(getVal(row, 'تشویقی', 'incentiveAmount')),
            otherBenefits: parseNum(getVal(row, 'سایر مزایا', 'otherBenefits')),
            arrearsAmount: parseNum(getVal(row, 'مابه التفاوت', 'arrearsAmount')),
            advanceAmount: parseNum(getVal(row, 'مساعده', 'advanceAmount')),
            totalDeductions: parseNum(getVal(row, 'جمع کسور', 'totalDeductions')),
            taxAmount: parseNum(getVal(row, 'مالیات', 'taxAmount')),
            salaryTaxAmount: parseNum(getVal(row, 'مالیات حقوق', 'salaryTaxAmount')),
            jobWage: parseNum(getVal(row, 'مزد شغل', 'jobWage')),
            totalOrderFactors: parseNum(getVal(row, 'جمع عوامل حکمی', 'جمع عوامل حكمي', 'totalOrderFactors')),
            baseSalaryOrder: parseNum(getVal(row, 'حقوق پایه(حكم-اصلي)', 'حقوق پایه(حکم-اصلی)', 'baseSalaryOrder')),
            overtimeHours: parseNum(getVal(row, 'ساعت اضافه کاری(کارکرد)', 'overtimeHours')),
            fridayWorkHours: parseNum(getVal(row, 'ساعت جمعه کاری(کارکرد)', 'fridayWorkHours')),
            costCenterCode: String(getVal(row, 'مرکز هزینه(كد تفصيل)', 'مرکز هزینه(کد تفصیل)') || ''),
            costCenterTitle: String(getVal(row, 'مرکز هزینه(عنوان تفصيل)', 'مرکز هزینه(عنوان تفصیل)') || ''),
            projectCode: String(getVal(row, 'پروژه(كد تفصيل)', 'پروژه(کد تفصیل)') || ''),
            projectTitle: String(getVal(row, 'پروژه(عنوان تفصيل)', 'پروژه(عنوان تفصیل)') || ''),
            bankName: String(getVal(row, 'نام بانک') || ''),
            bankAccount: String(getVal(row, 'شماره حساب') || ''),
            rawFields: compactRawRow(row),
            updatedAt: nowStr,
          };
          if (prevId) updated++;
          else added++;
          payIdMap.set(key, recordId);
          pendingMap.set(record.id, [record.id, targetPeriod, code, JSON.stringify(record)]);
        }

        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped: items.length,
            message: 'هیچ ردیف معتبری با «كد پرسنلي» در این دسته حقوق یافت نشد.',
          });
        }

        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'payroll',
          ['id', 'period', 'personnel_code', 'data_json'],
          'id',
          ['period', 'personnel_code', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, {
          success: true,
          added,
          updated,
          message: `فایل حقوق با موفقیت در دیتابیس ذخیره شد (${added} رکورد جدید، ${updated} رکورد به‌روزرسانی گردید).`,
        });
      }

      if (path.startsWith('/payroll/by-period/') && method === 'DELETE') {
        if (!checkPermission(authUser, 'payroll', 'delete')) return forbidden(request, env);
        const period = decodeURIComponent(path.slice('/payroll/by-period/'.length));
        await env.DB.prepare('DELETE FROM payroll WHERE period = ?').bind(period).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: `لیست حقوق دوره ${period} حذف شد.` });
      }

      if (path.startsWith('/payroll/') && method === 'DELETE') {
        if (!checkPermission(authUser, 'payroll', 'delete')) return forbidden(request, env);
        const id = decodeURIComponent(path.slice('/payroll/'.length));
        await env.DB.prepare('DELETE FROM payroll WHERE id = ?').bind(id).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: 'ردیف حقوق حذف شد.' });
      }

      if (path === '/payroll/batch-delete' && method === 'POST') {
        if (!checkPermission(authUser, 'payroll', 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        await batchExecuteChunked(env.DB, ids.map((id: string) => env.DB.prepare('DELETE FROM payroll WHERE id = ?').bind(id)));
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: ids.length, message: `${ids.length} ردیف حقوق حذف شد.` });
      }

      if (path === '/payroll/delete-all' && method === 'POST') {
        if (!checkPermission(authUser, 'payroll', 'deleteAll')) return forbidden(request, env);
        const c = await env.DB.prepare('SELECT COUNT(*) as c FROM payroll').first<{ c: number }>();
        await env.DB.prepare('DELETE FROM payroll').run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount: Number(c?.c || 0), message: `کل لیست‌های حقوق (${Number(c?.c || 0)} ردیف) پاکسازی شد.` });
      }

      // ================= MINING VOLUMES ROUTES =================
      if (path === '/mining-volumes' && method === 'GET') {
        if (!hasMiningOrUnitPerm(authUser, 'view')) return jsonRes(request, env, { success: true, data: [] });
        const period = url.searchParams.get('period');
        let records = period
          ? await getJsonRows(env.DB, 'mining_volumes', 'period = ?', [period])
          : await getJsonRows(env.DB, 'mining_volumes');
        if (!isSuperAdminUser(authUser) && !checkPermission(authUser, 'ceoDashboard', 'view')) {
          records = records.filter((v: any) => isDispatchingOrUnitAllowed(authUser, v.unitName));
        }
        return jsonRes(request, env, { success: true, data: records });
      }

      if (path === '/mining-volumes' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const action = body.id ? 'edit' : 'create';
        const hasCeoPerm = checkPermission(authUser, 'ceoDashboard', action);
        const hasUnitPerm = checkPermission(authUser, 'unitOperations', action) && isDispatchingOrUnitAllowed(authUser, body.unitName);
        if (!hasCeoPerm && !hasUnitPerm) return forbidden(request, env, 'عدم دسترسی ثبت یا ویرایش آمار حجم معدن.');
        if (!body.period || !body.unitName) return jsonRes(request, env, { success: false, message: 'دوره و نام واحد عملیاتی الزامی است.' }, 400);
        const volumeValue = Number(body.volumeValue || 0);
        const targetVolume = Number(body.targetVolume || 0);
        const rec = {
          id: body.id || genId('mv'),
          period: String(body.period).trim(),
          unitName: String(body.unitName).trim(),
          activityType: String(body.activityType || 'عملیات معدنی').trim(),
          metricTitle: String(body.metricTitle || body.activityType || body.unitName).trim(),
          volumeValue: Number.isFinite(volumeValue) ? volumeValue : 0,
          targetVolume: Number.isFinite(targetVolume) ? targetVolume : 0,
          unitLabel: String(body.unitLabel || 'تن').trim(),
          status: String(body.status || (targetVolume > 0 && volumeValue >= targetVolume ? 'فراتر از برنامه' : 'در حال اجرا')).trim(),
          notes: String(body.notes || '').trim(),
          updatedAt: faDate(),
        };
        await env.DB.prepare('INSERT OR REPLACE INTO mining_volumes (id, period, unit_name, data_json) VALUES (?, ?, ?, ?)')
          .bind(rec.id, rec.period, rec.unitName, JSON.stringify(rec))
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: rec, message: 'آمار حجم عملیات ماهانه با موفقیت ذخیره شد.' });
      }

      if (path === '/mining-volumes/batch-import' && method === 'POST') {
        const canCeo = checkPermission(authUser, 'ceoDashboard', 'importExcel') || checkPermission(authUser, 'ceoDashboard', 'create');
        const canUnit = checkPermission(authUser, 'unitOperations', 'importExcel') || checkPermission(authUser, 'unitOperations', 'create');
        if (!canCeo && !canUnit) return forbidden(request, env, 'عدم دسترسی ورود اکسل آمار حجم عملیات.');
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const chunkPeriods = Array.from(
          new Set<string>(
            items.map((row: any) =>
              parseYearMonth(getVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه'), '1403-08')
            )
          )
        ).filter(Boolean);
        const existingMap = new Map<string, string>();
        const mvSlices: string[][] = [];
        for (let i = 0; i < chunkPeriods.length; i += 40) mvSlices.push(chunkPeriods.slice(i, i + 40));
        const mvLookupRes = await Promise.all(
          mvSlices.map((slice) => {
            const ph = slice.map(() => '?').join(',');
            return env.DB.prepare(
              `SELECT id, period, unit_name as unitName, COALESCE(json_extract(data_json, '$.metricTitle'), '') as metricTitle FROM mining_volumes WHERE period IN (${ph})`
            )
              .bind(...slice)
              .all<any>();
          })
        );
        for (const res of mvLookupRes) {
          for (const v of res.results || []) {
            existingMap.set(`${toAsciiDigits(v.period).trim()}__${normKey(v.unitName)}__${normKey(v.metricTitle)}`, v.id);
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const nowStr = faDate();

        for (const row of items) {
          const unitName = String(getVal(row, 'unitName', 'واحد عملیاتی معدن', 'واحد معدن', 'واحد') || '').trim();
          const period = parseYearMonth(getVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه'), '1403-08');
          if (!unitName || (!canCeo && !isDispatchingOrUnitAllowed(authUser, unitName))) {
            skipped++;
            continue;
          }
          const activityType = String(getVal(row, 'activityType', 'نوع عملیات / فعالیت', 'نوع عملیات', 'عملیات') || 'عملیات معدنی').trim();
          const metricTitle = String(getVal(row, 'metricTitle', 'عنوان شاخص حجم', 'عنوان شاخص', 'شرح عملیات') || activityType).trim();
          const volumeValue = parseNum(getVal(row, 'volumeValue', 'حجم محقق‌شده ماه', 'حجم محقق شده', 'حجم', 'مقدار'));
          const targetVolume = parseNum(getVal(row, 'targetVolume', 'برنامه / هدف ماه', 'برنامه ماه', 'هدف ماه', 'هدف'));
          const unitLabel = String(getVal(row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') || 'تن').trim();
          const status = String(getVal(row, 'status', 'وضعیت تحقق', 'وضعیت') || (targetVolume > 0 && volumeValue >= targetVolume ? 'فراتر از برنامه' : 'در حال اجرا')).trim();
          const notes = String(getVal(row, 'notes', 'توضیحات', 'یادداشت') || '').trim();
          const k = `${period}__${normKey(unitName)}__${normKey(metricTitle)}`;
          const prevId = existingMap.get(k);
          const rec = { id: prevId || genId('mv'), period, unitName, activityType, metricTitle, volumeValue, targetVolume, unitLabel, status, notes, updatedAt: nowStr };
          if (prevId) updated++;
          else added++;
          existingMap.set(k, rec.id);
          pendingMap.set(rec.id, [rec.id, period, unitName, JSON.stringify(rec)]);
        }
        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped,
            message: 'هیچ ردیف معتبری با «نام واحد عملیاتی» و مجاز در این دسته یافت نشد.',
          });
        }
        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'mining_volumes',
          ['id', 'period', 'unit_name', 'data_json'],
          'id',
          ['period', 'unit_name', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, { success: true, added, updated, skipped, message: `آمار حجم عملیات وارد شد (${added} جدید، ${updated} به‌روزرسانی).` });
      }

      if (path.startsWith('/mining-volumes/') && method === 'DELETE') {
        if (!hasMiningOrUnitPerm(authUser, 'delete')) return forbidden(request, env);
        const id = decodeURIComponent(path.slice('/mining-volumes/'.length));
        const row = await env.DB.prepare('SELECT unit_name FROM mining_volumes WHERE id = ?').bind(id).first<{ unit_name: string }>();
        if (row && !checkPermission(authUser, 'ceoDashboard', 'delete') && !isDispatchingOrUnitAllowed(authUser, row.unit_name)) {
          return forbidden(request, env, 'دسترسی حذف برای این واحد محدود شده است.');
        }
        await env.DB.prepare('DELETE FROM mining_volumes WHERE id = ?').bind(id).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: 'ردیف آمار حجم حذف شد.' });
      }

      if (path === '/mining-volumes/batch-delete' && method === 'POST') {
        if (!hasMiningOrUnitPerm(authUser, 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        const canAll = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'delete');
        let deletedCount = 0;
        for (const id of ids) {
          const row = await env.DB.prepare('SELECT unit_name FROM mining_volumes WHERE id = ?').bind(id).first<{ unit_name: string }>();
          if (row && (canAll || isDispatchingOrUnitAllowed(authUser, row.unit_name))) {
            await env.DB.prepare('DELETE FROM mining_volumes WHERE id = ?').bind(id).run();
            deletedCount++;
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `${deletedCount} ردیف آمار حجم حذف شد.` });
      }

      if (path === '/mining-volumes/delete-all' && method === 'POST') {
        if (!hasMiningOrUnitPerm(authUser, 'deleteAll')) return forbidden(request, env);
        const canAll = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'deleteAll');
        let deletedCount = 0;
        if (canAll) {
          const c = await env.DB.prepare('SELECT COUNT(*) as c FROM mining_volumes').first<{ c: number }>();
          deletedCount = Number(c?.c || 0);
          await env.DB.prepare('DELETE FROM mining_volumes').run();
        } else {
          const rows = await getJsonRows(env.DB, 'mining_volumes');
          for (const v of rows) {
            if (isDispatchingOrUnitAllowed(authUser, v.unitName)) {
              await env.DB.prepare('DELETE FROM mining_volumes WHERE id = ?').bind(v.id).run();
              deletedCount++;
            }
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `جدول آمار حجم عملیات (${deletedCount} ردیف) پاکسازی شد.` });
      }

      // ================= MINING MACHINERY ROUTES =================
      if (path === '/mining-machinery' && method === 'GET') {
        if (!hasMiningOrUnitPerm(authUser, 'view')) return jsonRes(request, env, { success: true, data: [] });
        let records = await getJsonRows(env.DB, 'mining_machinery');
        if (!isSuperAdminUser(authUser) && !checkPermission(authUser, 'ceoDashboard', 'view')) {
          records = records.filter((m: any) => isWorkshopOrUnitAllowed(authUser, m.unitName));
        }
        return jsonRes(request, env, { success: true, data: records });
      }

      if (path === '/mining-machinery' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const action = body.id ? 'edit' : 'create';
        const hasCeoPerm = checkPermission(authUser, 'ceoDashboard', action);
        const hasUnitPerm = checkPermission(authUser, 'unitOperations', action) && isWorkshopOrUnitAllowed(authUser, body.unitName);
        if (!hasCeoPerm && !hasUnitPerm) return forbidden(request, env, 'عدم دسترسی ثبت یا ویرایش وضعیت ماشین‌آلات.');
        if (!body.machineCode || !body.machineName) return jsonRes(request, env, { success: false, message: 'کد دستگاه و نام تجهیز الزامی است.' }, 400);
        const existingRow = !body.id
          ? await env.DB.prepare('SELECT id FROM mining_machinery WHERE machine_code = ?').bind(toAsciiDigits(body.machineCode).trim()).first<{ id: string }>()
          : null;
        const rawStatus = String(body.status || 'آماده به کار').trim();
        const status =
          rawStatus.includes('خراب') || rawStatus.includes('تعمیرگاه')
            ? 'خراب / در تعمیرگاه'
            : rawStatus.includes('قطعه')
            ? 'در انتظار قطعه'
            : rawStatus.includes('سرویس')
            ? 'سرویس دوره‌ای'
            : 'آماده به کار';
        const rec = {
          id: body.id || existingRow?.id || genId('mm'),
          machineCode: String(body.machineCode).trim(),
          machineName: String(body.machineName).trim(),
          machineType: String(body.machineType || 'تجهیز معدنی').trim(),
          unitName: String(body.unitName || 'استخراج و معدن‌کاری').trim(),
          status,
          issueDescription: String(body.issueDescription || '').trim(),
          stoppedSince: String(body.stoppedSince || '-').trim(),
          estimatedReadyDate: String(body.estimatedReadyDate || '-').trim(),
          operatorName: String(body.operatorName || '').trim(),
          notes: String(body.notes || '').trim(),
          updatedAt: faDate(),
        };
        await env.DB.prepare('INSERT OR REPLACE INTO mining_machinery (id, machine_code, data_json) VALUES (?, ?, ?)')
          .bind(rec.id, rec.machineCode, JSON.stringify(rec))
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: rec, message: 'وضعیت تجهیز و ماشین‌آلات با موفقیت ذخیره شد.' });
      }

      if (path === '/mining-machinery/batch-import' && method === 'POST') {
        const canCeo = checkPermission(authUser, 'ceoDashboard', 'importExcel') || checkPermission(authUser, 'ceoDashboard', 'create');
        const canUnit = checkPermission(authUser, 'unitOperations', 'importExcel') || checkPermission(authUser, 'unitOperations', 'create');
        if (!canCeo && !canUnit) return forbidden(request, env, 'عدم دسترسی ورود اکسل ماشین‌آلات.');
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const incomingMachineCodes = Array.from(
          new Set<string>(
            items
              .map((row: any) => toAsciiDigits(getVal(row, 'machineCode', 'کد دستگاه / پلاک', 'کد دستگاه', 'پلاک تجهیزات', 'کد') || '').trim())
              .filter(Boolean)
          )
        );
        const existingMap = new Map<string, string>();
        const mmSlices: string[][] = [];
        for (let i = 0; i < incomingMachineCodes.length; i += 90) mmSlices.push(incomingMachineCodes.slice(i, i + 90));
        const mmLookupRes = await Promise.all(
          mmSlices.map((slice) => {
            const ph = slice.map(() => '?').join(',');
            return env.DB.prepare(
              `SELECT id, machine_code as machineCode FROM mining_machinery WHERE machine_code IN (${ph})`
            )
              .bind(...slice)
              .all<{ id: string; machineCode: string }>();
          })
        );
        for (const res of mmLookupRes) {
          for (const m of res.results || []) {
            const mc = toAsciiDigits(m.machineCode).trim();
            if (mc) existingMap.set(mc, m.id);
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const nowStr = faDate();

        for (const row of items) {
          const machineCode = toAsciiDigits(getVal(row, 'machineCode', 'کد دستگاه / پلاک', 'کد دستگاه', 'پلاک تجهیزات', 'کد') || '').trim();
          const machineName = String(getVal(row, 'machineName', 'نام و مدل دستگاه', 'نام دستگاه', 'مدل') || '').trim();
          if (!machineCode || !machineName) {
            skipped++;
            continue;
          }
          const unitName = String(getVal(row, 'unitName', 'واحد مستقر / بهره‌بردار', 'واحد مستقر', 'واحد معدن', 'واحد') || 'تعمیرگاه و ماشین‌آلات سنگین').trim();
          if (!canCeo && !isWorkshopOrUnitAllowed(authUser, unitName)) {
            skipped++;
            continue;
          }
          const rawStatus = String(getVal(row, 'status', 'وضعیت دستگاه', 'وضعیت عملیاتی', 'وضعیت') || 'آماده به کار').trim();
          const status =
            rawStatus.includes('خراب') || rawStatus.includes('تعمیرگاه')
              ? 'خراب / در تعمیرگاه'
              : rawStatus.includes('قطعه')
              ? 'در انتظار قطعه'
              : rawStatus.includes('سرویس')
              ? 'سرویس دوره‌ای'
              : 'آماده به کار';
          const prevId = existingMap.get(machineCode);
          const rec = {
            id: prevId || genId('mm'),
            machineCode,
            machineName,
            machineType: String(getVal(row, 'machineType', 'نوع ماشین‌آلات', 'نوع تجهیز', 'نوع') || 'تجهیز معدنی').trim(),
            unitName,
            status,
            issueDescription: String(getVal(row, 'issueDescription', 'شرح خرابی / وضعیت تعمیر', 'شرح خرابی', 'علت توقف') || '').trim(),
            stoppedSince: toAsciiDigits(getVal(row, 'stoppedSince', 'تاریخ توقف / ورود به تعمیرگاه', 'تاریخ توقف', 'شروع توقف') || '-').trim(),
            estimatedReadyDate: toAsciiDigits(getVal(row, 'estimatedReadyDate', 'تاریخ تخمینی آماده‌به‌کار', 'تخمین آماده‌به‌کار', 'تاریخ تحویل') || '-').trim(),
            operatorName: String(getVal(row, 'operatorName', 'اپراتور / مسئول تعمیر', 'مسئول / اپراتور', 'اپراتور') || '').trim(),
            notes: String(getVal(row, 'notes', 'توضیحات', 'یادداشت') || '').trim(),
            updatedAt: nowStr,
          };
          if (prevId) updated++;
          else added++;
          existingMap.set(machineCode, rec.id);
          pendingMap.set(rec.id, [rec.id, machineCode, JSON.stringify(rec)]);
        }
        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped,
            message: 'هیچ ردیف معتبری با «کد دستگاه» و «نام دستگاه» در این دسته یافت نشد.',
          });
        }
        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'mining_machinery',
          ['id', 'machine_code', 'data_json'],
          'id',
          ['machine_code', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, { success: true, added, updated, skipped, message: `لیست ماشین‌آلات و تعمیرگاه وارد شد (${added} جدید، ${updated} به‌روزرسانی).` });
      }

      if (path.startsWith('/mining-machinery/') && method === 'DELETE') {
        if (!hasMiningOrUnitPerm(authUser, 'delete')) return forbidden(request, env);
        const id = decodeURIComponent(path.slice('/mining-machinery/'.length));
        const row = await env.DB.prepare('SELECT data_json FROM mining_machinery WHERE id = ?').bind(id).first<{ data_json: string }>();
        if (row && !checkPermission(authUser, 'ceoDashboard', 'delete')) {
          const parsed = JSON.parse(row.data_json);
          if (!isWorkshopOrUnitAllowed(authUser, parsed.unitName)) return forbidden(request, env);
        }
        await env.DB.prepare('DELETE FROM mining_machinery WHERE id = ?').bind(id).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: 'رکورد ماشین‌آلات حذف شد.' });
      }

      if (path === '/mining-machinery/batch-delete' && method === 'POST') {
        if (!hasMiningOrUnitPerm(authUser, 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        const canAll = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'delete');
        let deletedCount = 0;
        for (const id of ids) {
          const row = await env.DB.prepare('SELECT data_json FROM mining_machinery WHERE id = ?').bind(id).first<{ data_json: string }>();
          if (row && (canAll || isWorkshopOrUnitAllowed(authUser, JSON.parse(row.data_json).unitName))) {
            await env.DB.prepare('DELETE FROM mining_machinery WHERE id = ?').bind(id).run();
            deletedCount++;
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `${deletedCount} ردیف ماشین‌آلات حذف شد.` });
      }

      if (path === '/mining-machinery/delete-all' && method === 'POST') {
        if (!hasMiningOrUnitPerm(authUser, 'deleteAll')) return forbidden(request, env);
        const canAll = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'deleteAll');
        let deletedCount = 0;
        if (canAll) {
          const c = await env.DB.prepare('SELECT COUNT(*) as c FROM mining_machinery').first<{ c: number }>();
          deletedCount = Number(c?.c || 0);
          await env.DB.prepare('DELETE FROM mining_machinery').run();
        } else {
          const rows = await getJsonRows(env.DB, 'mining_machinery');
          for (const m of rows) {
            if (isWorkshopOrUnitAllowed(authUser, m.unitName)) {
              await env.DB.prepare('DELETE FROM mining_machinery WHERE id = ?').bind(m.id).run();
              deletedCount++;
            }
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `لیست ماشین‌آلات و تعمیرگاه (${deletedCount} دستگاه) پاکسازی شد.` });
      }

      // ================= UNIT REPORTS ROUTES =================
      if (path === '/unit-reports' && method === 'GET') {
        if (!hasMiningOrUnitPerm(authUser, 'view')) return jsonRes(request, env, { success: true, data: [] });
        const period = url.searchParams.get('period');
        const unitName = url.searchParams.get('unitName');
        const fullScope = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'view');
        const pg = parsePagination(url);
        if (fullScope && !unitName) {
          const whereClause = period ? 'period = ?' : '';
          const binds = period ? [period] : [];
          if (pg.hasPagination) {
            const countSql = whereClause ? `SELECT COUNT(*) as total FROM unit_reports WHERE ${whereClause}` : 'SELECT COUNT(*) as total FROM unit_reports';
            const countStmt = binds.length > 0 ? env.DB.prepare(countSql).bind(...binds) : env.DB.prepare(countSql);
            const [countRow, rawArr] = await Promise.all([
              countStmt.first<{ total: number }>(),
              getRawJsonArrayString(env.DB, 'unit_reports', whereClause, binds, 'data_json', pg.limit, pg.offset),
            ]);
            const total = Number(countRow?.total || 0);
            const hasMore = pg.offset + pg.limit < total;
            return rawJsonResponse(
              request,
              env,
              `{"success":true,"data":${rawArr},"total":${total},"limit":${pg.limit},"offset":${pg.offset},"hasMore":${hasMore}}`
            );
          }
          const rawArr = await getRawJsonArrayString(env.DB, 'unit_reports', whereClause, binds);
          return rawJsonResponse(request, env, `{"success":true,"data":${rawArr}}`);
        }
        let records = period
          ? await getJsonRows(env.DB, 'unit_reports', 'period = ?', [period])
          : await getJsonRows(env.DB, 'unit_reports');
        if (unitName) records = records.filter((r: any) => normKey(String(r.unitName || '')) === normKey(unitName));
        if (!fullScope) {
          records = records.filter((r: any) => isUnitAllowedForUser(authUser, r.unitName));
        }
        if (pg.hasPagination) {
          const slice = records.slice(pg.offset, pg.offset + pg.limit);
          return jsonRes(request, env, {
            success: true,
            data: slice,
            total: records.length,
            limit: pg.limit,
            offset: pg.offset,
            hasMore: pg.offset + pg.limit < records.length,
          });
        }
        return jsonRes(request, env, { success: true, data: records });
      }

      if (path === '/unit-reports' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const action = body.id ? 'edit' : 'create';
        const hasCeoPerm = checkPermission(authUser, 'ceoDashboard', action);
        const hasUnitPerm = checkPermission(authUser, 'unitOperations', action) && isUnitAllowedForUser(authUser, body.unitName);
        if (!hasCeoPerm && !hasUnitPerm) return forbidden(request, env, 'عدم دسترسی ثبت یا ویرایش گزارش عملیاتی واحد.');
        if (!body.period || !body.unitName || !body.metricName) {
          return jsonRes(request, env, { success: false, message: 'دوره، نام واحد و عنوان شاخص / فعالیت الزامی است.' }, 400);
        }
        const sanitizedRaw: Record<string, string | number> = {};
        if (body.rawFields && typeof body.rawFields === 'object') {
          for (const [k, v] of Object.entries(body.rawFields).slice(0, 100)) {
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              sanitizedRaw[String(k).slice(0, 120)] = typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : String(v).slice(0, 300);
            }
          }
        }
        const rec = {
          id: body.id || genId('ur'),
          period: String(body.period).trim(),
          unitName: String(body.unitName).trim(),
          reportCategory: String(body.reportCategory || 'گزارش عملیاتی واحد').trim(),
          metricName: String(body.metricName).trim(),
          actualValue: Number.isFinite(Number(body.actualValue || 0)) ? Number(body.actualValue || 0) : 0,
          previousValue: Number.isFinite(Number(body.previousValue || 0)) ? Number(body.previousValue || 0) : 0,
          targetValue: Number.isFinite(Number(body.targetValue || 0)) ? Number(body.targetValue || 0) : 0,
          unitLabel: String(body.unitLabel || 'عدد').trim(),
          status: String(body.status || 'تایید شده').trim(),
          submittedBy: String(body.submittedBy || authUser.fullName || '').trim(),
          notes: String(body.notes || '').trim(),
          rawFields: sanitizedRaw,
          updatedAt: faDate(),
        };
        await env.DB.prepare('INSERT OR REPLACE INTO unit_reports (id, period, unit_name, data_json) VALUES (?, ?, ?, ?)')
          .bind(rec.id, rec.period, rec.unitName, JSON.stringify(rec))
          .run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, data: rec, message: 'گزارش عملیاتی واحد با موفقیت ذخیره شد.' });
      }

      if (path === '/unit-reports/batch-import' && method === 'POST') {
        const canCeo = checkPermission(authUser, 'ceoDashboard', 'importExcel') || checkPermission(authUser, 'ceoDashboard', 'create');
        const canUnit = checkPermission(authUser, 'unitOperations', 'importExcel') || checkPermission(authUser, 'unitOperations', 'create');
        if (!canCeo && !canUnit) return forbidden(request, env, 'عدم دسترسی ورود اکسل گزارش واحدها.');
        const body: any = await readJsonBody(request);
        const items = unpackBatchItems(body);
        if (items.length === 0) return jsonRes(request, env, { success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' }, 400);

        const chunkPeriods = Array.from(
          new Set<string>(
            items
              .filter((row: any) => row && typeof row === 'object')
              .map((row: any) =>
                parseYearMonth(getVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه') || body.period || '1403-08', '1403-08')
              )
          )
        ).filter(Boolean);
        const existingMap = new Map<string, string>();
        const urSlices: string[][] = [];
        for (let i = 0; i < chunkPeriods.length; i += 40) urSlices.push(chunkPeriods.slice(i, i + 40));
        const urLookupRes = await Promise.all(
          urSlices.map((slice) => {
            const ph = slice.map(() => '?').join(',');
            return env.DB.prepare(
              `SELECT id, period, unit_name as unitName, COALESCE(json_extract(data_json, '$.metricName'), '') as metricName FROM unit_reports WHERE period IN (${ph})`
            )
              .bind(...slice)
              .all<any>();
          })
        );
        for (const res of urLookupRes) {
          for (const r of res.results || []) {
            existingMap.set(`${toAsciiDigits(r.period).trim()}__${normKey(r.unitName)}__${normKey(r.metricName)}`, r.id);
          }
        }

        const pendingMap = new Map<string, any[]>();
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const nowStr = faDate();

        for (const row of items) {
          if (!row || typeof row !== 'object') continue;
          const unitName = String(getVal(row, 'unitName', 'نام واحد عملیاتی', 'واحد عملیاتی معدن', 'نام واحد', 'واحد', 'بخش') || body.unitName || '').trim();
          const period = parseYearMonth(getVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه') || body.period || '1403-08', '1403-08');
          const metricName = String(getVal(row, 'metricName', 'عنوان شاخص / موضوع فعالیت', 'عنوان شاخص / فعالیت', 'شرح شاخص', 'فعالیت', 'عنوان', 'موضوع') || '').trim();
          if (!unitName || !metricName || (!canCeo && !isUnitAllowedForUser(authUser, unitName))) {
            skipped++;
            continue;
          }

          const reportCategory = String(getVal(row, 'reportCategory', 'دسته‌بندی / نوع گزارش', 'دسته‌بندی گزارش', 'نوع گزارش', 'گروه فعالیت') || body.reportCategory || 'گزارش عملیاتی واحد').trim();
          const actualValue = parseNum(getVal(row, 'actualValue', 'مقدار محقق‌شده ماه', 'مقدار محقق‌شده', 'عملکرد ماه جاری', 'عملکرد', 'مقدار', 'مقدار فعلی'));
          const previousValue = parseNum(getVal(row, 'previousValue', 'مقدار ماه قبل', 'عملکرد ماه قبل', 'دوره قبل'));
          const targetValue = parseNum(getVal(row, 'targetValue', 'هدف / برنامه ماه', 'هدف / برنامه', 'برنامه ماه', 'هدف'));
          const unitLabel = String(getVal(row, 'unitLabel', 'واحد سنجش (یکا)', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') || 'عدد').trim();
          const status = String(getVal(row, 'status', 'وضعیت / ارزیابی', 'وضعیت گزارش', 'وضعیت') || 'تایید شده').trim();
          const submittedBy = String(getVal(row, 'submittedBy', 'ثبت‌کننده / سرپرست واحد', 'ثبت‌کننده / مسئول واحد', 'مسئول واحد', 'ثبت‌کننده') || authUser.fullName || '').trim();
          const notes = String(getVal(row, 'notes', 'توضیحات / تحلیل واحد', 'توضیحات', 'یادداشت') || '').trim();
          const rawFields: Record<string, string | number> = {};
          const incomingRaw = row.rawFields && typeof row.rawFields === 'object' ? row.rawFields : row;
          let rawCount = 0;
          for (const [k, v] of Object.entries(incomingRaw)) {
            if (v === undefined || v === null) continue;
            if (typeof v === 'string' && v.trim() === '') continue;
            if (k.startsWith('ستون_')) continue;
            rawFields[String(k).slice(0, 120)] = typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : String(v).slice(0, 300);
            rawCount++;
            if (rawCount >= 100) break;
          }
          const mapKey = `${period}__${normKey(unitName)}__${normKey(metricName)}`;
          const prevId = existingMap.get(mapKey);
          const rec = { id: prevId || genId('ur'), period, unitName, reportCategory, metricName, actualValue, previousValue, targetValue, unitLabel, status, submittedBy, notes, rawFields, updatedAt: nowStr };
          if (prevId) updated++;
          else added++;
          existingMap.set(mapKey, rec.id);
          pendingMap.set(rec.id, [rec.id, period, unitName, JSON.stringify(rec)]);
        }
        if (pendingMap.size === 0) {
          return jsonRes(request, env, {
            success: true,
            added: 0,
            updated: 0,
            skipped,
            message: 'هیچ ردیف معتبری با «نام واحد» و «عنوان شاخص» مجاز در این دسته یافت نشد.',
          });
        }
        const stmts = buildMultiRowUpsertStmts(
          env.DB,
          'unit_reports',
          ['id', 'period', 'unit_name', 'data_json'],
          'id',
          ['period', 'unit_name', 'data_json'],
          Array.from(pendingMap.values())
        );
        await batchExecuteAndTouch(env.DB, stmts);
        return jsonRes(request, env, { success: true, added, updated, skipped, message: `گزارش اکسل واحدها با موفقیت ثبت شد (${added} جدید، ${updated} به‌روزرسانی).` });
      }

      if (path.startsWith('/unit-reports/') && method === 'DELETE') {
        if (!hasMiningOrUnitPerm(authUser, 'delete')) return forbidden(request, env);
        const id = decodeURIComponent(path.slice('/unit-reports/'.length));
        const row = await env.DB.prepare('SELECT unit_name FROM unit_reports WHERE id = ?').bind(id).first<{ unit_name: string }>();
        if (row && !checkPermission(authUser, 'ceoDashboard', 'delete') && !isUnitAllowedForUser(authUser, row.unit_name)) {
          return forbidden(request, env);
        }
        await env.DB.prepare('DELETE FROM unit_reports WHERE id = ?').bind(id).run();
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: 'ردیف گزارش عملیاتی واحد حذف شد.' });
      }

      if (path === '/unit-reports/batch-delete' && method === 'POST') {
        if (!hasMiningOrUnitPerm(authUser, 'delete')) return forbidden(request, env);
        const body: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        const canAll = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'delete');
        let deletedCount = 0;
        for (const id of ids) {
          const row = await env.DB.prepare('SELECT unit_name FROM unit_reports WHERE id = ?').bind(id).first<{ unit_name: string }>();
          if (row && (canAll || isUnitAllowedForUser(authUser, row.unit_name))) {
            await env.DB.prepare('DELETE FROM unit_reports WHERE id = ?').bind(id).run();
            deletedCount++;
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `${deletedCount} ردیف گزارش واحد حذف شد.` });
      }

      if (path === '/unit-reports/delete-all' && method === 'POST') {
        if (!hasMiningOrUnitPerm(authUser, 'deleteAll')) return forbidden(request, env);
        const canAll = isSuperAdminUser(authUser) || checkPermission(authUser, 'ceoDashboard', 'deleteAll');
        let deletedCount = 0;
        if (canAll) {
          const c = await env.DB.prepare('SELECT COUNT(*) as c FROM unit_reports').first<{ c: number }>();
          deletedCount = Number(c?.c || 0);
          await env.DB.prepare('DELETE FROM unit_reports').run();
        } else {
          const rows = await getJsonRows(env.DB, 'unit_reports');
          for (const r of rows) {
            if (isUnitAllowedForUser(authUser, r.unitName)) {
              await env.DB.prepare('DELETE FROM unit_reports WHERE id = ?').bind(r.id).run();
              deletedCount++;
            }
          }
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, deletedCount, message: `گزارش‌های واحدهای عملیاتی (${deletedCount} ردیف) پاکسازی شد.` });
      }

      // ================= DATABASE STATUS, BACKUP & RESTORE =================
      if (path === '/database/status' && method === 'GET') {
        const statusData = await computeDatabaseStatus(env.DB, authUser);
        return jsonRes(request, env, {
          success: true,
          data: statusData,
        });
      }

      if (path === '/database/export-snapshot' && method === 'GET') {
        if (!isSuperAdminUser(authUser) && !checkPermission(authUser, 'system', 'backupDatabase')) {
          return forbidden(request, env, 'شما مجوز دریافت اسنپ‌شات همگام‌سازی را ندارید.');
        }
        const [
          users,
          personnelRaw,
          karanehRaw,
          jobGroupsRaw,
          jobClassificationsRaw,
          commitmentsRaw,
          payrollRaw,
          miningVolumesRaw,
          miningMachineryRaw,
          unitReportsRaw,
        ] = await Promise.all([
          getAllUsers(env.DB).then((rows) => rows.map(sanitizeUser)),
          getRawJsonArrayString(env.DB, 'personnel'),
          getRawJsonArrayString(env.DB, 'karaneh'),
          getRawJsonArrayString(env.DB, 'job_groups'),
          getRawJsonArrayString(env.DB, 'job_classifications'),
          getRawJsonArrayString(env.DB, 'commitments'),
          getRawJsonArrayString(env.DB, 'payroll'),
          getRawJsonArrayString(env.DB, 'mining_volumes'),
          getRawJsonArrayString(env.DB, 'mining_machinery'),
          getRawJsonArrayString(env.DB, 'unit_reports'),
        ]);
        const rawBody = `{"success":true,"data":{"users":${JSON.stringify(users)},"personnel":${personnelRaw},"karaneh":${karanehRaw},"jobGroups":${jobGroupsRaw},"jobClassifications":${jobClassificationsRaw},"commitments":${commitmentsRaw},"payroll":${payrollRaw},"miningVolumes":${miningVolumesRaw},"miningMachinery":${miningMachineryRaw},"unitReports":${unitReportsRaw}}}`;
        return rawJsonResponse(request, env, rawBody);
      }

      if (path === '/database/backup' && method === 'GET') {
        if (!checkPermission(authUser, 'system', 'backupDatabase')) return forbidden(request, env);
        const [
          users,
          personnelRaw,
          karanehRaw,
          jobGroupsRaw,
          jobClassificationsRaw,
          commitmentsRaw,
          payrollRaw,
          miningVolumesRaw,
          miningMachineryRaw,
          unitReportsRaw,
          countsAgg,
        ] = await Promise.all([
          getAllUsers(env.DB),
          getRawJsonArrayString(env.DB, 'personnel'),
          getRawJsonArrayString(env.DB, 'karaneh'),
          getRawJsonArrayString(env.DB, 'job_groups'),
          getRawJsonArrayString(env.DB, 'job_classifications'),
          getRawJsonArrayString(env.DB, 'commitments'),
          getRawJsonArrayString(env.DB, 'payroll'),
          getRawJsonArrayString(env.DB, 'mining_volumes'),
          getRawJsonArrayString(env.DB, 'mining_machinery'),
          getRawJsonArrayString(env.DB, 'unit_reports'),
          env.DB.prepare(
            `SELECT
               (SELECT COUNT(*) FROM personnel) as personnelCount,
               (SELECT COALESCE(SUM(COALESCE(json_array_length(json_extract(data_json, '$.relatives')), 0)), 0) FROM personnel) as relativesCount,
               (SELECT COUNT(*) FROM karaneh) as karanehCount,
               (SELECT COUNT(*) FROM payroll) as payrollCount,
               (SELECT COUNT(*) FROM job_groups) as jobGroupsCount,
               (SELECT COUNT(*) FROM job_classifications) as jobClassificationsCount,
               (SELECT COUNT(*) FROM commitments) as commitmentsCount,
               (SELECT COUNT(*) FROM mining_volumes) as miningVolumesCount,
               (SELECT COUNT(*) FROM mining_machinery) as miningMachineryCount,
               (SELECT COUNT(*) FROM unit_reports) as unitReportsCount`
          ).first<any>(),
        ]);

        const meta = {
          version: '5.0-negin-parto-nasr-units-hub',
          exportedAt: new Date().toISOString(),
          engine: 'cloudflare-d1',
          counts: {
            users: users.length,
            personnel: Number(countsAgg?.personnelCount || 0),
            relatives: Number(countsAgg?.relativesCount || 0),
            karaneh: Number(countsAgg?.karanehCount || 0),
            payroll: Number(countsAgg?.payrollCount || 0),
            jobGroups: Number(countsAgg?.jobGroupsCount || 0),
            jobClassifications: Number(countsAgg?.jobClassificationsCount || 0),
            commitments: Number(countsAgg?.commitmentsCount || 0),
            miningVolumes: Number(countsAgg?.miningVolumesCount || 0),
            miningMachinery: Number(countsAgg?.miningMachineryCount || 0),
            unitReports: Number(countsAgg?.unitReportsCount || 0),
          },
        };

        const rawPayload = `{"users":${JSON.stringify(users)},"personnel":${personnelRaw},"karaneh":${karanehRaw},"jobGroups":${jobGroupsRaw},"jobClassifications":${jobClassificationsRaw},"commitments":${commitmentsRaw},"payroll":${payrollRaw},"miningVolumes":${miningVolumesRaw},"miningMachinery":${miningMachineryRaw},"unitReports":${unitReportsRaw},"_backupMetadata":${JSON.stringify(meta)}}`;
        return new Response(rawPayload, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename=hr_database_backup_${Date.now()}.json`,
            ...getCorsHeaders(request, env),
          },
        });
      }

      if (path === '/database/restore' && method === 'POST') {
        if (!checkPermission(authUser, 'system', 'restoreDatabase')) return forbidden(request, env);
        const incoming: any = await request.json().catch(() => ({}));
        if (!incoming || !Array.isArray(incoming.users) || !Array.isArray(incoming.personnel)) {
          return jsonRes(request, env, { success: false, message: 'ساختار فایل پشتیبان معتبر نیست.' }, 400);
        }
        await replaceAllSnapshotInD1(env.DB, incoming);
        return jsonRes(request, env, { success: true, message: 'پایگاه داده Cloudflare D1 با موفقیت بازیابی گردید.' });
      }

      if (path === '/database/restore-chunk' && method === 'POST') {
        if (!checkPermission(authUser, 'system', 'restoreDatabase')) return forbidden(request, env);
        const body: any = await readJsonBody(request);
        if (body.clearAll === true) {
          await clearAllSnapshotTablesInD1(env.DB);
        }
        const table = String(body.table || '').trim();
        const items = unpackBatchItems(body);
        let processed = 0;
        if (table && items.length > 0) {
          if (table === 'users' && body.mode === 'merge') {
            const safeUsers = items.filter((u: any) => u && u.id && u.username !== 'javadabadiyan');
            processed = await upsertChunkIntoD1(env.DB, 'users', safeUsers);
          } else {
            processed = await upsertChunkIntoD1(env.DB, table, items);
          }
        }
        if (body.finalize === true) {
          await touchLastSaved(env.DB);
        }
        return jsonRes(request, env, { success: true, processed, message: 'بخش پشتیبان با موفقیت ثبت شد.' });
      }

      if (path === '/database/reset-demo' && method === 'POST') {
        if (!checkPermission(authUser, 'system', 'restoreDatabase')) return forbidden(request, env);
        const seed = await buildInitialSeedData();
        await replaceAllSnapshotInD1(env.DB, seed);
        return jsonRes(request, env, { success: true, message: 'داده‌های اولیه در دیتابیس Cloudflare D1 بازنشانی شدند.' });
      }

      if (path === '/database/merge-firestore' && method === 'POST') {
        if (!checkPermission(authUser, 'system', 'restoreDatabase')) return forbidden(request, env);
        const incoming: any = await request.json().catch(() => ({}));
        if (!incoming || typeof incoming !== 'object') {
          return jsonRes(request, env, { success: false, message: 'ساختار داده‌های ارسالی نامعتبر است.' }, 400);
        }
        if (Array.isArray(incoming.personnel)) await upsertChunkIntoD1(env.DB, 'personnel', incoming.personnel);
        if (Array.isArray(incoming.karaneh)) await upsertChunkIntoD1(env.DB, 'karaneh', incoming.karaneh);
        if (Array.isArray(incoming.jobGroups)) await upsertChunkIntoD1(env.DB, 'jobGroups', incoming.jobGroups);
        if (Array.isArray(incoming.jobClassifications)) await upsertChunkIntoD1(env.DB, 'jobClassifications', incoming.jobClassifications);
        if (Array.isArray(incoming.commitments)) await upsertChunkIntoD1(env.DB, 'commitments', incoming.commitments);
        if (Array.isArray(incoming.payroll)) await upsertChunkIntoD1(env.DB, 'payroll', incoming.payroll);
        if (Array.isArray(incoming.miningVolumes)) await upsertChunkIntoD1(env.DB, 'miningVolumes', incoming.miningVolumes);
        if (Array.isArray(incoming.miningMachinery)) await upsertChunkIntoD1(env.DB, 'miningMachinery', incoming.miningMachinery);
        if (Array.isArray(incoming.unitReports)) await upsertChunkIntoD1(env.DB, 'unitReports', incoming.unitReports);
        if (Array.isArray(incoming.users)) {
          const safeUsers = incoming.users.filter((u: any) => u && u.id && u.username !== 'javadabadiyan');
          await upsertChunkIntoD1(env.DB, 'users', safeUsers);
        }
        await touchLastSaved(env.DB);
        return jsonRes(request, env, { success: true, message: 'اطلاعات با موفقیت در پایگاه داده Cloudflare D1 ادغام شد.' });
      }

      return jsonRes(request, env, { success: false, message: `مسیر ${path} یافت نشد.` }, 404);
    } catch (err: any) {
      return jsonRes(
        request,
        env,
        { success: false, message: err?.message || 'خطای داخلی سرور Cloudflare Worker' },
        500
      );
    }
  },
};
