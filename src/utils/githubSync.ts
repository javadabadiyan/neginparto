export type CredentialStorageMode = 'session_only' | 'encrypted_vault';

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string; // e.g., 'db-data' (separate from 'main' code branch) or 'main' inside a separate private DB repo
  filePath: string; // e.g., 'database.json'
  token: string; // Kept in session/memory or AES-GCM encrypted vault (never plaintext in localStorage when vault/session mode is active)
  encryptionPassphrase: string; // Kept strictly in memory + sessionStorage for the current tab session; NEVER persisted to localStorage or uploaded
  encryptDatabase: boolean; // Zero-knowledge AES-256-GCM encryption before pushing to GitHub
  requirePrivateRepo: boolean; // Strictly block pushing to public GitHub repositories
  credentialStorageMode: CredentialStorageMode;
  autoSync: boolean;
  hasEncryptedTokenVault?: boolean;
  lastSyncedAt?: string;
  lastCommitUrl?: string;
}

export interface GitHubConnectionTestResult {
  ok: boolean;
  repoPrivate: boolean;
  defaultBranch: string;
  branchExists: boolean;
  fileExists: boolean;
  fileSizeBytes?: number;
  fileEncrypted?: boolean | null;
  message: string;
}

export interface EncryptedEnvelope {
  encrypted: true;
  formatVersion: 'npn-e2e-aes256gcm-v1';
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  integritySha256: string;
  ciphertext: string;
  publicMeta?: {
    company: string;
    syncedAt: string;
    branch: string;
    schemaVersion: string;
    note: string;
  };
}

export class GitHubSecurityError extends Error {
  code: 'E2E_LOCKED' | 'PUBLIC_REPO_BLOCKED' | 'INVALID_PASSPHRASE' | 'TAMPER_DETECTED' | 'WEAK_KEY';
  constructor(
    code: 'E2E_LOCKED' | 'PUBLIC_REPO_BLOCKED' | 'INVALID_PASSPHRASE' | 'TAMPER_DETECTED' | 'WEAK_KEY',
    message: string
  ) {
    super(message);
    this.name = 'GitHubSecurityError';
    this.code = code;
  }
}

const LS_GH_SYNC_CONFIG = 'npn_github_sync_config_v1';
const SS_GH_SESSION_SECRETS = 'npn_gh_session_secrets_v1';
const PBKDF2_ITERATIONS = 310_000;

// Volatile in-memory fallback (guarantees secrets survive even if sessionStorage is restricted)
let memoryToken = '';
let memoryPassphrase = '';

function readSessionSecrets(): { token: string; encryptionPassphrase: string } {
  let ssToken = '';
  let ssPass = '';
  try {
    const raw = sessionStorage.getItem(SS_GH_SESSION_SECRETS);
    if (raw) {
      const parsed = JSON.parse(raw);
      ssToken = typeof parsed.token === 'string' ? parsed.token.trim() : '';
      ssPass = typeof parsed.encryptionPassphrase === 'string' ? parsed.encryptionPassphrase : '';
    }
  } catch {
    // ignore
  }
  return {
    token: memoryToken || ssToken,
    encryptionPassphrase: memoryPassphrase || ssPass,
  };
}

function writeSessionSecrets(token: string, encryptionPassphrase: string): void {
  memoryToken = token.trim();
  memoryPassphrase = encryptionPassphrase;
  try {
    sessionStorage.setItem(
      SS_GH_SESSION_SECRETS,
      JSON.stringify({
        token: memoryToken,
        encryptionPassphrase: memoryPassphrase,
      })
    );
  } catch {
    // ignore sessionStorage quota errors
  }
}

export function lockGitHubSession(): void {
  memoryToken = '';
  memoryPassphrase = '';
  try {
    sessionStorage.removeItem(SS_GH_SESSION_SECRETS);
  } catch {
    // ignore
  }
}

export function isGitHubVaultLocked(): boolean {
  try {
    const raw = localStorage.getItem(LS_GH_SYNC_CONFIG);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const hasVault = Boolean(parsed?.tokenVault);
    const secrets = readSessionSecrets();
    return Boolean(hasVault && !secrets.token);
  } catch {
    return false;
  }
}

export function loadGitHubSyncConfig(): GitHubSyncConfig {
  const sessionSecrets = readSessionSecrets();
  try {
    const raw = localStorage.getItem(LS_GH_SYNC_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const legacyPlainToken = typeof parsed.token === 'string' ? parsed.token.trim() : '';
      const hasEncryptedTokenVault = Boolean(parsed.tokenVault);
      const effectiveToken = sessionSecrets.token || legacyPlainToken;

      const mode: CredentialStorageMode =
        parsed.credentialStorageMode === 'session_only' || parsed.credentialStorageMode === 'encrypted_vault'
          ? parsed.credentialStorageMode
          : hasEncryptedTokenVault
          ? 'encrypted_vault'
          : 'session_only';

      return {
        owner: String(parsed.owner || '').trim(),
        repo: String(parsed.repo || '').trim(),
        branch: String(parsed.branch || 'db-data').trim() || 'db-data',
        filePath: String(parsed.filePath || 'database.json').trim() || 'database.json',
        token: effectiveToken,
        encryptionPassphrase: sessionSecrets.encryptionPassphrase,
        encryptDatabase: parsed.encryptDatabase !== undefined ? Boolean(parsed.encryptDatabase) : true,
        requirePrivateRepo: parsed.requirePrivateRepo !== undefined ? Boolean(parsed.requirePrivateRepo) : true,
        credentialStorageMode: mode,
        autoSync: parsed.autoSync !== undefined ? Boolean(parsed.autoSync) : true,
        hasEncryptedTokenVault,
        lastSyncedAt: parsed.lastSyncedAt ? String(parsed.lastSyncedAt) : undefined,
        lastCommitUrl: parsed.lastCommitUrl ? String(parsed.lastCommitUrl) : undefined,
      };
    }
  } catch {
    // ignore corrupted config
  }
  return {
    owner: '',
    repo: '',
    branch: 'db-data',
    filePath: 'database.json',
    token: sessionSecrets.token,
    encryptionPassphrase: sessionSecrets.encryptionPassphrase,
    encryptDatabase: true,
    requirePrivateRepo: true,
    credentialStorageMode: 'encrypted_vault',
    autoSync: true,
    hasEncryptedTokenVault: false,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeUtf8Base64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function decodeUtf8Base64(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

interface EncryptedSecretBox {
  v: 1;
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

async function encryptSecretString(plainText: string, passphrase: string): Promise<EncryptedSecretBox> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainText)
  );
  return {
    v: 1,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

async function decryptSecretString(box: EncryptedSecretBox, passphrase: string): Promise<string> {
  try {
    const salt = base64ToBytes(box.salt);
    const iv = base64ToBytes(box.iv);
    const ct = base64ToBytes(box.ct);
    const key = await deriveAesKey(passphrase, salt, box.iterations || PBKDF2_ITERATIONS);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new GitHubSecurityError(
      'INVALID_PASSPHRASE',
      'کلید رمزنگاری اشتباه است یا توکن ذخیره شده قابل رمزگشایی نیست.'
    );
  }
}

export async function encryptSnapshotEnvelope(
  payload: Record<string, any>,
  passphrase: string,
  branch: string
): Promise<EncryptedEnvelope> {
  if (!passphrase || passphrase.length < 8) {
    throw new GitHubSecurityError(
      'WEAK_KEY',
      'برای رمزنگاری نظامی AES-256-GCM، کلید رمزنگاری باید حداقل ۸ کاراکتر باشد.'
    );
  }
  const plainJson = JSON.stringify(payload);
  const plainBytes = new TextEncoder().encode(plainJson);
  const integritySha256 = await sha256Hex(plainBytes);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBytes
  );

  return {
    encrypted: true,
    formatVersion: 'npn-e2e-aes256gcm-v1',
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    integritySha256,
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
    publicMeta: {
      company: 'شرکت نگین پرتو نصر',
      syncedAt: new Date().toISOString(),
      branch,
      schemaVersion: '5.0-negin-parto-nasr-units-hub',
      note: 'Zero-knowledge AES-256-GCM encrypted payload. Plaintext cannot be read without master passphrase.',
    },
  };
}

export async function decryptSnapshotEnvelope(
  envelope: EncryptedEnvelope,
  passphrase: string
): Promise<Record<string, any>> {
  if (!passphrase) {
    throw new GitHubSecurityError(
      'E2E_LOCKED',
      'فایل دیتابیس گیت‌هاب با رمزنگاری AES-256-GCM قفل شده است. لطفاً کلید رمزنگاری را وارد کنید.'
    );
  }

  let plainBytes: Uint8Array;
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ct = base64ToBytes(envelope.ciphertext);
    const key = await deriveAesKey(passphrase, salt, envelope.iterations || PBKDF2_ITERATIONS);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource
    );
    plainBytes = new Uint8Array(plainBuf);
  } catch {
    throw new GitHubSecurityError(
      'INVALID_PASSPHRASE',
      'کلید رمزنگاری برای باز کردن فایل دیتابیس گیت‌هاب نادرست است!'
    );
  }

  if (envelope.integritySha256) {
    const computedHash = await sha256Hex(plainBytes);
    if (computedHash !== envelope.integritySha256) {
      throw new GitHubSecurityError(
        'TAMPER_DETECTED',
        'هشدار امنیتی: امضای یکپارچگی (SHA-256) فایل دیتابیس مطابقت ندارد و ممکن است فایل دستکاری شده باشد!'
      );
    }
  }

  const parsed = JSON.parse(new TextDecoder().decode(plainBytes));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ساختار داده‌های رمزگشایی شده نامعتبر است.');
  }
  return parsed;
}

export function evaluatePassphraseStrength(passphrase: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  colorClass: string;
} {
  if (!passphrase) {
    return { score: 0, label: 'وارد نشده', colorClass: 'text-slate-500 bg-slate-100 border-slate-200' };
  }
  let points = 0;
  if (passphrase.length >= 8) points++;
  if (passphrase.length >= 14) points++;
  if (/[A-Z]/.test(passphrase) && /[a-z]/.test(passphrase)) points++;
  if (/[0-9]/.test(passphrase) && /[^A-Za-z0-9]/.test(passphrase)) points++;

  if (passphrase.length < 8 || points <= 1) {
    return { score: 1, label: 'ضعیف (حداقل ۸ کاراکتر لازم است)', colorClass: 'text-rose-700 bg-rose-50 border-rose-200' };
  }
  if (points === 2) {
    return { score: 2, label: 'متوسط', colorClass: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  if (points === 3) {
    return { score: 3, label: 'قوی', colorClass: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
  }
  return { score: 4, label: 'فوق‌امن (سطح نظامی AES-256)', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
}

export function generateStrongPassphrase(length = 24): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_+=';
  const randomValues = crypto.getRandomValues(new Uint32Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

export function saveGitHubSyncConfig(cfg: GitHubSyncConfig): void {
  writeSessionSecrets(cfg.token || '', cfg.encryptionPassphrase || '');

  let existingVault: EncryptedSecretBox | undefined;
  try {
    const prevRaw = localStorage.getItem(LS_GH_SYNC_CONFIG);
    if (prevRaw) {
      const prev = JSON.parse(prevRaw);
      if (prev?.tokenVault && cfg.credentialStorageMode === 'encrypted_vault') {
        existingVault = prev.tokenVault;
      }
    }
  } catch {
    // ignore
  }

  const persisted = {
    owner: cfg.owner.trim(),
    repo: cfg.repo.trim(),
    branch: cfg.branch.trim() || 'db-data',
    filePath: cfg.filePath.trim() || 'database.json',
    encryptDatabase: cfg.encryptDatabase,
    requirePrivateRepo: cfg.requirePrivateRepo,
    credentialStorageMode: cfg.credentialStorageMode,
    autoSync: cfg.autoSync,
    lastSyncedAt: cfg.lastSyncedAt,
    lastCommitUrl: cfg.lastCommitUrl,
    ...(existingVault ? { tokenVault: existingVault } : {}),
  };
  localStorage.setItem(LS_GH_SYNC_CONFIG, JSON.stringify(persisted));
}

export async function saveGitHubSyncConfigSecure(cfg: GitHubSyncConfig): Promise<GitHubSyncConfig> {
  writeSessionSecrets(cfg.token || '', cfg.encryptionPassphrase || '');

  let tokenVault: EncryptedSecretBox | undefined;
  if (cfg.credentialStorageMode === 'encrypted_vault' && cfg.token.trim()) {
    if (!cfg.encryptionPassphrase || cfg.encryptionPassphrase.length < 8) {
      throw new GitHubSecurityError(
        'WEAK_KEY',
        'برای ذخیره قفل‌شده توکن در گاوصندوق مرورگر (Encrypted Vault)، وارد کردن کلید رمزنگاری حداقل ۸ کاراکتری الزامی است. (در غیر این صورت حالت «فقط در همین نشست مرورگر» را انتخاب کنید.)'
      );
    }
    tokenVault = await encryptSecretString(cfg.token.trim(), cfg.encryptionPassphrase);
  }

  const persisted = {
    owner: cfg.owner.trim(),
    repo: cfg.repo.trim(),
    branch: cfg.branch.trim() || 'db-data',
    filePath: cfg.filePath.trim() || 'database.json',
    encryptDatabase: cfg.encryptDatabase,
    requirePrivateRepo: cfg.requirePrivateRepo,
    credentialStorageMode: cfg.credentialStorageMode,
    autoSync: cfg.autoSync,
    lastSyncedAt: cfg.lastSyncedAt,
    lastCommitUrl: cfg.lastCommitUrl,
    ...(tokenVault ? { tokenVault } : {}),
  };
  localStorage.setItem(LS_GH_SYNC_CONFIG, JSON.stringify(persisted));
  return loadGitHubSyncConfig();
}

export async function unlockGitHubVault(passphrase: string): Promise<GitHubSyncConfig> {
  if (!passphrase) {
    throw new GitHubSecurityError('INVALID_PASSPHRASE', 'کلید رمزنگاری را وارد کنید.');
  }
  const raw = localStorage.getItem(LS_GH_SYNC_CONFIG);
  if (!raw) {
    writeSessionSecrets('', passphrase);
    return loadGitHubSyncConfig();
  }
  const parsed = JSON.parse(raw);
  let unlockedToken = readSessionSecrets().token;

  if (parsed?.tokenVault) {
    unlockedToken = await decryptSecretString(parsed.tokenVault as EncryptedSecretBox, passphrase);
  }

  writeSessionSecrets(unlockedToken, passphrase);
  return loadGitHubSyncConfig();
}

export function clearGitHubSyncConfig(): GitHubSyncConfig {
  lockGitHubSession();
  localStorage.removeItem(LS_GH_SYNC_CONFIG);
  return loadGitHubSyncConfig();
}

export function isGitHubSyncConfigured(cfg?: GitHubSyncConfig): boolean {
  const c = cfg || loadGitHubSyncConfig();
  return Boolean(c.owner && c.repo && c.branch && c.filePath && c.token);
}

export function isGitHubAutoSyncEnabled(): boolean {
  const c = loadGitHubSyncConfig();
  return Boolean(c.autoSync && isGitHubSyncConfigured(c));
}

function getHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function buildContentsUrl(cfg: GitHubSyncConfig): string {
  const cleanPath = cfg.filePath
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cleanPath}`;
}

async function getRepoInfo(cfg: GitHubSyncConfig): Promise<{ isPrivate: boolean; defaultBranch: string }> {
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const repoRes = await fetch(baseUrl, { headers, cache: 'no-store' });
  if (!repoRes.ok) {
    const errBody = await repoRes.json().catch(() => ({}));
    if (repoRes.status === 401) {
      throw new Error('توکن دسترسی گیت‌هاب نامعتبر یا منقضی شده است.');
    }
    if (repoRes.status === 404) {
      throw new Error(`مخزن ${cfg.owner}/${cfg.repo} یافت نشد یا توکن دسترسی به آن را ندارد.`);
    }
    throw new Error(errBody?.message || 'امکان دسترسی به مخزن گیت‌هاب وجود ندارد.');
  }
  const repoInfo = await repoRes.json();
  return {
    isPrivate: Boolean(repoInfo.private),
    defaultBranch: repoInfo.default_branch || 'main',
  };
}

async function ensureBranchExists(cfg: GitHubSyncConfig): Promise<{ isPrivate: boolean; defaultBranch: string }> {
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const repoMeta = await getRepoInfo(cfg);

  const checkRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers,
    cache: 'no-store',
  });
  if (checkRes.ok) return repoMeta;

  const defaultRefRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(repoMeta.defaultBranch)}`, {
    headers,
    cache: 'no-store',
  });
  if (!defaultRefRes.ok) {
    throw new Error(
      `شاخه مرجع ${repoMeta.defaultBranch} در مخزن یافت نشد. ابتدا حداقل یک فایل (مثلاً README) در مخزن ایجاد کنید.`
    );
  }
  const defaultRef = await defaultRefRes.json();
  const sha = defaultRef?.object?.sha;
  if (!sha) {
    throw new Error('شناسه کامیت اولیه مخزن یافت نشد.');
  }

  const createRefRes = await fetch(`${baseUrl}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${cfg.branch}`,
      sha,
    }),
  });
  if (!createRefRes.ok && createRefRes.status !== 422) {
    const errBody = await createRefRes.json().catch(() => ({}));
    throw new Error(errBody?.message || `خطا در ایجاد شاخه مجزای ${cfg.branch}`);
  }

  return repoMeta;
}

export async function testGitHubConnection(cfg: GitHubSyncConfig): Promise<GitHubConnectionTestResult> {
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.filePath || !cfg.token) {
    throw new Error('نام کاربری گیت‌هاب، نام مخزن، نام شاخه، مسیر فایل و توکن دسترسی (PAT) باید تکمیل شوند.');
  }
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const repoMeta = await getRepoInfo(cfg);

  const refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers,
    cache: 'no-store',
  });
  const branchExists = refRes.ok;

  let fileExists = false;
  let fileSizeBytes: number | undefined;
  let fileEncrypted: boolean | null = null;

  if (branchExists) {
    const fileUrl = `${buildContentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
    const fileRes = await fetch(fileUrl, { headers, cache: 'no-store' });
    if (fileRes.ok) {
      const fMeta = await fileRes.json().catch(() => ({}));
      fileExists = true;
      fileSizeBytes = typeof fMeta.size === 'number' ? fMeta.size : undefined;
      if (typeof fMeta.content === 'string') {
        try {
          const decodedPreview = decodeUtf8Base64(fMeta.content);
          const parsedPreview = JSON.parse(decodedPreview);
          fileEncrypted = Boolean(parsedPreview?.encrypted && parsedPreview?.formatVersion === 'npn-e2e-aes256gcm-v1');
        } catch {
          fileEncrypted = null;
        }
      }
    }
  }

  const privacyText = repoMeta.isPrivate
    ? 'مخزن به‌صورت خصوصی (Private) است و از دسترسی عمومی محافظت می‌شود.'
    : 'هشدار امنیتی: این مخزن عمومی (Public) است! با سپر امنیتی فعال، ارسال اطلاعات به مخزن عمومی مسدود خواهد شد تا اطلاعات پرسنل و حقوق افشا نشوند.';

  const branchText = branchExists
    ? `شاخه «${cfg.branch}» آماده است.`
    : `شاخه «${cfg.branch}» هنوز ساخته نشده است و در اولین ذخیره به‌صورت خودکار ایجاد می‌شود.`;

  const fileText = fileExists
    ? `فایل ${cfg.filePath} (${((fileSizeBytes || 0) / 1024).toFixed(1)} کیلوبایت) موجود است${
        fileEncrypted === true
          ? ' و به‌صورت سرتاسری (AES-256-GCM) رمزنگاری شده است.'
          : fileEncrypted === false
          ? ' (بدون رمز — با اولین ارسال به رمزنگاری AES-256-GCM ارتقا می‌یابد).'
          : '.'
      }`
    : `فایل ${cfg.filePath} هنوز ایجاد نشده است و در اولین ارسال به‌صورت امن ساخته می‌شود.`;

  return {
    ok: true,
    repoPrivate: repoMeta.isPrivate,
    defaultBranch: repoMeta.defaultBranch,
    branchExists,
    fileExists,
    fileSizeBytes,
    fileEncrypted,
    message: `${privacyText} ${branchText} ${fileText}`,
  };
}

/**
 * Commit large snapshots (>900KB) via Git Data API (Blob -> Tree -> Commit -> Update Ref)
 * so databases with scanned documents or thousands of payroll rows never hit Contents API size limits.
 */
async function pushViaGitDataApi(
  cfg: GitHubSyncConfig,
  encodedBase64Content: string,
  commitMessage: string
): Promise<{ commitUrl?: string; sha: string }> {
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const cleanPath = cfg.filePath.replace(/^\/+/, '');

  const refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers,
    cache: 'no-store',
  });
  if (!refRes.ok) throw new Error(`شاخه ${cfg.branch} یافت نشد.`);
  const refData = await refRes.json();
  const parentCommitSha = refData?.object?.sha;

  const commitRes = await fetch(`${baseUrl}/git/commits/${parentCommitSha}`, { headers, cache: 'no-store' });
  if (!commitRes.ok) throw new Error('امکان خواندن کامیت فعلی شاخه وجود ندارد.');
  const commitData = await commitRes.json();
  const baseTreeSha = commitData?.tree?.sha;

  const blobRes = await fetch(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: encodedBase64Content,
      encoding: 'base64',
    }),
  });
  const blobData = await blobRes.json().catch(() => ({}));
  if (!blobRes.ok || !blobData?.sha) {
    throw new Error(blobData?.message || 'خطا در ایجاد Blob پایگاه داده روی گیت‌هاب.');
  }

  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        {
          path: cleanPath,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        },
      ],
    }),
  });
  const treeData = await treeRes.json().catch(() => ({}));
  if (!treeRes.ok || !treeData?.sha) {
    throw new Error(treeData?.message || 'خطا در ساخت ساختار درخت فایل روی گیت‌هاب.');
  }

  const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: treeData.sha,
      parents: [parentCommitSha],
    }),
  });
  const newCommitData = await newCommitRes.json().catch(() => ({}));
  if (!newCommitRes.ok || !newCommitData?.sha) {
    throw new Error(newCommitData?.message || 'خطا در ثبت کامیت پایگاه داده.');
  }

  const updateRefRes = await fetch(`${baseUrl}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: false,
    }),
  });
  const updateRefData = await updateRefRes.json().catch(() => ({}));
  if (!updateRefRes.ok) {
    const err = new Error(updateRefData?.message || 'خطا در به‌روزرسانی شاخه دیتابیس.');
    (err as any).status = updateRefRes.status;
    throw err;
  }

  return {
    commitUrl: newCommitData.html_url || `https://github.com/${cfg.owner}/${cfg.repo}/commit/${newCommitData.sha}`,
    sha: blobData.sha,
  };
}

export async function pushDatabaseToGitHub(
  cfg: GitHubSyncConfig,
  snapshot: Record<string, any>
): Promise<{ commitUrl?: string; sha: string; repoPrivate: boolean; encrypted: boolean }> {
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.filePath || !cfg.token) {
    throw new Error('تکمیل نام کاربری گیت‌هاب، نام مخزن، نام شاخه، مسیر فایل و توکن دسترسی (PAT) الزامی است.');
  }

  const repoMeta = await ensureBranchExists(cfg);

  // Strict Security Guard 1: Prevent pushing confidential company data to a Public repo
  if (cfg.requirePrivateRepo !== false && !repoMeta.isPrivate) {
    throw new GitHubSecurityError(
      'PUBLIC_REPO_BLOCKED',
      `مسدودسازی امنیتی: مخزن «${cfg.owner}/${cfg.repo}» در گیت‌هاب عمومی (Public) است! برای جلوگیری از افشای اطلاعات پرسنل و حقوق، ارسال اطلاعات به مخزن عمومی مسدود شد. لطفاً از یک مخزن خصوصی (Private) استفاده کنید.`
    );
  }

  if ((cfg.branch === 'main' || cfg.branch === 'master') && cfg.filePath === 'package.json') {
    throw new Error('مسیر فایل دیتابیس نباید با فایل‌های کد تداخل داشته باشد.');
  }

  const payloadWithMeta = {
    ...snapshot,
    _githubSyncMeta: {
      syncedAt: new Date().toISOString(),
      branch: cfg.branch,
      company: 'شرکت نگین پرتو نصر',
      schemaVersion: '5.0-negin-parto-nasr-units-hub',
    },
  };

  let serializedOutput: string;
  let isEncrypted = false;

  if (cfg.encryptDatabase) {
    if (!cfg.encryptionPassphrase || cfg.encryptionPassphrase.length < 8) {
      throw new GitHubSecurityError(
        'WEAK_KEY',
        'حالت رمزنگاری سرتاسری (AES-256-GCM) فعال است؛ لطفاً کلید رمزنگاری حداقل ۸ کاراکتری را وارد کنید تا داده‌ها بدون رمز ارسال نشوند.'
      );
    }
    const encryptedEnvelope = await encryptSnapshotEnvelope(payloadWithMeta, cfg.encryptionPassphrase, cfg.branch);
    serializedOutput = JSON.stringify(encryptedEnvelope, null, 2);
    isEncrypted = true;
  } else {
    serializedOutput = JSON.stringify(payloadWithMeta, null, 2);
  }

  const headers = getHeaders(cfg.token);
  const fileUrl = buildContentsUrl(cfg);
  const encodedContent = encodeUtf8Base64(serializedOutput);
  const commitMessage = isEncrypted
    ? `chore(db-sync): update encrypted Negine Parto Nasr database [AES-256-GCM] (${new Date().toISOString()})`
    : `chore(db-sync): update Negine Parto Nasr database (${new Date().toISOString()})`;

  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (encodedContent.length > 850_000) {
        const res = await pushViaGitDataApi(cfg, encodedContent, commitMessage);
        const syncedAt = new Date().toLocaleString('fa-IR');
        saveGitHubSyncConfig({ ...cfg, lastSyncedAt: syncedAt, lastCommitUrl: res.commitUrl });
        return { ...res, repoPrivate: repoMeta.isPrivate, encrypted: isEncrypted };
      }

      let existingSha: string | undefined;
      const getRes = await fetch(`${fileUrl}?ref=${encodeURIComponent(cfg.branch)}`, {
        headers,
        cache: 'no-store',
      });
      if (getRes.ok) {
        const fileMeta = await getRes.json();
        existingSha = fileMeta.sha;
      }

      const putRes = await fetch(fileUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          content: encodedContent,
          branch: cfg.branch,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });

      const putJson = await putRes.json().catch(() => ({}));
      if (putRes.status === 409 || putRes.status === 422) {
        lastError = new Error(putJson?.message || 'تداخل همزمانی ویرایش روی گیت‌هاب (SHA Conflict)');
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
      }

      if (!putRes.ok) {
        throw new Error(putJson?.message || 'خطا در ثبت فایل پایگاه داده روی گیت‌هاب.');
      }

      const commitUrl = putJson?.commit?.html_url;
      const syncedAt = new Date().toLocaleString('fa-IR');
      saveGitHubSyncConfig({ ...cfg, lastSyncedAt: syncedAt, lastCommitUrl: commitUrl });

      return {
        commitUrl,
        sha: putJson?.content?.sha || '',
        repoPrivate: repoMeta.isPrivate,
        encrypted: isEncrypted,
      };
    } catch (err: any) {
      lastError = err;
      if (err?.status === 409 || err?.status === 422) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
      }
      if (attempt >= maxAttempts) break;
    }
  }

  throw lastError || new Error('خطا در ذخیره فایل پایگاه داده روی گیت‌هاب.');
}

export async function pullDatabaseFromGitHub(cfg: GitHubSyncConfig): Promise<Record<string, any>> {
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.filePath || !cfg.token) {
    throw new Error('مشخصات مخزن و توکن دسترسی (PAT) گیت‌هاب کامل نیست.');
  }

  const headers = getHeaders(cfg.token);
  const fileUrl = `${buildContentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;

  const res = await fetch(fileUrl, { headers, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `فایل ${cfg.filePath} در شاخه ${cfg.branch} یافت نشد.`);
  }

  let rawJsonText = '';
  if (data.content) {
    rawJsonText = decodeUtf8Base64(data.content);
  } else if (data.git_url) {
    const blobRes = await fetch(data.git_url, { headers, cache: 'no-store' });
    const blobData = await blobRes.json();
    rawJsonText = decodeUtf8Base64(blobData.content || '');
  } else if (data.sha) {
    const blobRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/blobs/${encodeURIComponent(data.sha)}`,
      { headers, cache: 'no-store' }
    );
    const blobData = await blobRes.json();
    rawJsonText = decodeUtf8Base64(blobData.content || '');
  } else {
    throw new Error('محتوای فایل پایگاه داده از گیت‌هاب قابل دریافت نبود.');
  }

  const parsed = JSON.parse(rawJsonText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ساختار فایل JSON دریافتی از گیت‌هاب نامعتبر است.');
  }

  // Transparently decrypt zero-knowledge AES-256-GCM envelope
  if (parsed.encrypted === true && parsed.formatVersion === 'npn-e2e-aes256gcm-v1') {
    return await decryptSnapshotEnvelope(parsed as EncryptedEnvelope, cfg.encryptionPassphrase);
  }

  return parsed;
}

// Debounced automatic background sync to GitHub file database
let ghPushTimer: ReturnType<typeof setTimeout> | null = null;
let ghPushInFlight = false;
let ghPushQueued = false;

export function scheduleBackgroundGitHubPush(
  fetchSnapshot: () => Promise<{ success?: boolean; data?: Record<string, any> }>,
  onSynced?: (result: { commitUrl?: string; syncedAt: string }) => void,
  onError?: (message: string) => void
): void {
  if (!isGitHubAutoSyncEnabled()) return;

  if (ghPushTimer) {
    clearTimeout(ghPushTimer);
  }

  ghPushTimer = setTimeout(async () => {
    if (ghPushInFlight) {
      ghPushQueued = true;
      return;
    }

    const executePush = async () => {
      const cfg = loadGitHubSyncConfig();
      if (!cfg.autoSync || !isGitHubSyncConfigured(cfg)) return;
      // Do not attempt silent plaintext push if E2E encryption is enabled and passphrase is locked
      if (cfg.encryptDatabase && (!cfg.encryptionPassphrase || cfg.encryptionPassphrase.length < 8)) {
        onError?.('کلید رمزنگاری دیتابیس گیت‌هاب در این نشست قفل است؛ برای ثبت خودکار ابتدا کلید را بازگشایی کنید.');
        return;
      }

      ghPushInFlight = true;
      try {
        const snapRes = await fetchSnapshot();
        if (snapRes?.success && snapRes.data) {
          const result = await pushDatabaseToGitHub(cfg, snapRes.data);
          onSynced?.({
            commitUrl: result.commitUrl,
            syncedAt: new Date().toLocaleString('fa-IR'),
          });
        }
      } catch (err: any) {
        console.warn('Background GitHub DB sync skipped:', err);
        onError?.(err?.message || 'خطا در همگام‌سازی خودکار با گیت‌هاب');
      } finally {
        ghPushInFlight = false;
        if (ghPushQueued) {
          ghPushQueued = false;
          await executePush();
        }
      }
    };

    await executePush();
  }, 1600);
}
