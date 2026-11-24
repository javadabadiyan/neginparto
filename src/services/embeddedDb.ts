import {
  User,
  Personnel,
  KaranehRecord,
  JobGroup,
  JobClassificationRecord,
  PersonnelCommitment,
  PayrollRecord,
  MiningVolumeRecord,
  MiningMachineryRecord,
  UnitOperationalReport,
  DatabaseStatus,
  KaranehComparisonRow,
} from '../types';
import {
  normalizePermissions,
  getEmptyPermissions,
  getFullAdminPermissions,
} from '../utils/permissions';

const IDB_NAME = 'hr_embedded_permanent_db';
const IDB_VERSION = 1;
const IDB_STORE = 'hr_store';
const IDB_MAIN_KEY = 'main_database';
const IDB_SECRET_KEY = 'embedded_secret';
const LS_FALLBACK_KEY = 'hr_embedded_db_fallback_v1';
const LS_SECRET_KEY = 'hr_embedded_secret_v1';

interface EmbeddedDatabase {
  users: (User & { password?: string; uid?: string })[];
  jobGroups: JobGroup[];
  jobClassifications: JobClassificationRecord[];
  personnel: Personnel[];
  karaneh: KaranehRecord[];
  commitments: PersonnelCommitment[];
  payroll: PayrollRecord[];
  miningVolumes: MiningVolumeRecord[];
  miningMachinery: MiningMachineryRecord[];
  unitReports: UnitOperationalReport[];
  lastSaved?: string;
}

// Pure-JS SHA-256 (works over both http:// and https:// without crypto.subtle)
function utf8Bytes(str: string): number[] {
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(str));
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return utf8;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  bytes.push((highBits >>> 24) & 0xff, (highBits >>> 16) & 0xff, (highBits >>> 8) & 0xff, highBits & 0xff);
  bytes.push((lowBits >>> 24) & 0xff, (lowBits >>> 16) & 0xff, (lowBits >>> 8) & 0xff, lowBits & 0xff);

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((v) => v.toString(16).padStart(8, '0')).join('');
}

function randomHex(byteLength = 16): string {
  const arr = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hashPasswordClient(plain: string): string {
  const salt = randomHex(16);
  const digest = sha256Hex(`${salt}:${plain}`);
  return `sha256$${salt}$${digest}`;
}

function verifyPasswordClient(plain: string, stored: string): { valid: boolean; needsMigration: boolean } {
  if (!stored) return { valid: false, needsMigration: false };
  if (stored.startsWith('sha256$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valid: false, needsMigration: false };
    const [, salt, original] = parts;
    return { valid: sha256Hex(`${salt}:${plain}`) === original, needsMigration: false };
  }
  if (!stored.startsWith('scrypt$') && !stored.startsWith('$2y$') && !stored.startsWith('$2a$') && !stored.startsWith('$argon2')) {
    const match = stored === plain;
    return { valid: match, needsMigration: match };
  }
  return { valid: false, needsMigration: false };
}

function b64UrlEncode(str: string): string {
  const bytes = utf8Bytes(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(str: string): string | null {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(escape(bin));
  } catch {
    return null;
  }
}

function buildPresetPermissions(presetName: string): any {
  const p = String(presetName || '').trim();
  if (p.includes('مدیر عامل') || p.includes('مدیرعامل')) {
    return {
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, submit: false, allowedUnits: [] },
      finalKaraneh: { view: true, edit: false, delete: false, deleteAll: false, exportExcel: true },
      jobGroups: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      commitments: { view: true, create: false, edit: false, delete: false, deleteAll: false, print: true, archive: false, importExcel: false, exportExcel: true },
      payroll: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, print: true },
      unitOperations: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, allowedUnits: [] },
      canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: false, canBackupRestore: false,
    };
  }
  if (p.includes('دیسپچینگ')) {
    return {
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, viewSalary: false, documents: false },
      karaneh: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, submit: false, allowedUnits: [] },
      finalKaraneh: { view: false, edit: false, delete: false, deleteAll: false, exportExcel: false },
      jobGroups: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
      payroll: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: false, exportExcel: false, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, allowedUnits: ['واحد دیسپچینگ و کنترل تولید', 'استخراج و معدن‌کاری', 'تراش و باطله‌برداری', 'حمل و نقل و بارگیری'] },
      canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    };
  }
  if (p.includes('تعمیرگاه')) {
    return {
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, viewSalary: false, documents: false },
      karaneh: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, submit: false, allowedUnits: [] },
      finalKaraneh: { view: false, edit: false, delete: false, deleteAll: false, exportExcel: false },
      jobGroups: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
      payroll: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: false, exportExcel: false, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, allowedUnits: ['واحد تعمیرگاه و ماشین‌آلات سنگین'] },
      canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    };
  }
  if (p.includes('سرپرست واحد')) {
    return {
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: false, documents: false },
      karaneh: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, submit: false, allowedUnits: [] },
      finalKaraneh: { view: false, edit: false, delete: false, deleteAll: false, exportExcel: false },
      jobGroups: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
      payroll: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: false, exportExcel: false, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, allowedUnits: [] },
      canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    };
  }
  if (p.includes('مدیر کارانه واحد')) {
    return {
      personnel: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, viewSalary: false, documents: false },
      karaneh: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, submit: true, allowedUnits: [] },
      finalKaraneh: { view: false, edit: false, delete: false, deleteAll: false, exportExcel: false },
      jobGroups: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
      payroll: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: false, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: false, exportExcel: false, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
      canManagePersonnel: false, canManageKaraneh: true, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    };
  }
  if (p.includes('مدیر')) {
    return {
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
      canManagePersonnel: true, canManageKaraneh: true, canManageJobGroups: true, canManageCommitments: true,
      canManageUsers: true, canExportExcel: true, canImportExcel: true, canBackupRestore: true,
    };
  }
  if (p.includes('کارگزینی')) {
    return normalizePermissions({
      personnel: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, submit: false, allowedUnits: [] },
      finalKaraneh: { view: true, edit: false, delete: false, deleteAll: false, exportExcel: true },
      jobGroups: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      commitments: { view: true, create: true, edit: true, delete: false, deleteAll: false, print: true, archive: true, importExcel: true, exportExcel: true },
      payroll: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
      canManagePersonnel: true, canManageKaraneh: false, canManageJobGroups: true, canManageCommitments: true,
      canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    });
  }
  if (p.includes('کارانه') || p.includes('حقوق')) {
    return normalizePermissions({
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: true, documents: false },
      karaneh: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true, submit: true, allowedUnits: [] },
      finalKaraneh: { view: true, edit: true, delete: false, deleteAll: false, exportExcel: true },
      jobGroups: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
      payroll: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
      canManagePersonnel: false, canManageKaraneh: true, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    });
  }
  if (p.includes('مشاهده') || p.includes('بیننده') || p.toLowerCase().includes('viewer')) {
    return normalizePermissions({
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: false, documents: false },
      karaneh: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, submit: false, allowedUnits: [] },
      finalKaraneh: { view: true, edit: false, delete: false, deleteAll: false, exportExcel: true },
      jobGroups: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      commitments: { view: true, create: false, edit: false, delete: false, deleteAll: false, print: true, archive: false, importExcel: false, exportExcel: true },
      payroll: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
      canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false,
      canManageUsers: false, canExportExcel: true, canImportExcel: false, canBackupRestore: false,
    });
  }
  return getEmptyPermissions();
}

function getInitialEmbeddedDatabase(): EmbeddedDatabase {
  return {
    users: [
      {
        id: 'u-admin-1',
        username: 'javadabadiyan',
        password: hashPasswordClient('javad_5221157'),
        fullName: 'جواد آبادیان (مدیر ارشد سامانه)',
        role: 'super_admin',
        department: 'مدیریت منابع انسانی و کارگزینی',
        permissions: buildPresetPermissions('مدیر ارشد'),
        isActive: true,
        createdAt: '1403/01/01',
        lastLogin: 'هم‌اکنون',
      },
      {
        id: 'u-officer-2',
        username: 'karaneh_admin',
        password: hashPasswordClient('12345678'),
        fullName: 'سارا کاظمی (کارشناس ارزیابی و کارانه)',
        role: 'karaneh_officer',
        department: 'اداره جبران خدمت و کارانه',
        permissions: buildPresetPermissions('کارشناس کارانه'),
        isActive: true,
        createdAt: '1403/03/10',
        lastLogin: '۱۴۰۳/۰۸/۰۲',
      },
      {
        id: 'u-officer-3',
        username: 'hr_expert',
        password: hashPasswordClient('12345678'),
        fullName: 'محمد امینی (کارشناس امور اداری و پرسنلی)',
        role: 'hr_officer',
        department: 'امور کارکنان و قراردادها',
        permissions: buildPresetPermissions('کارشناس کارگزینی'),
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
      { id: 'p-103', personnelCode: '10103', firstName: 'امیرحسین', lastName: 'مرادی', fullName: 'امیرحسین مرادی', nationalId: '0451239876', position: 'کارشناس ارشد شبکه و امنیت', department: 'فناوری اطلاعات', hireDate: '1400/07/01', employmentType: 'پیمانی', jobGroupId: 'jg-3', jobGroupName: 'گروه ۱۲ - کارشناسان ارشد تخصصی', education: 'کارشناسی مهندسی فناوری اطلاعات', phone: '09123336789', email: 'a.moradi@org.ir', status: 'فعال', baseSalary: 235000000, notes: 'طراح معماری دیتابیس لوکال و تونل ارتباطی امن', createdAt: '1403/01/01', updatedAt: '1403/08/01' },
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
      { id: 'k-101-08', personnelId: 'p-101', personnelCode: '10101', fullName: 'رضا قاسمی', department: 'فناوری اطلاعات', position: 'مدیر فناوری اطلاعات و سامانه‌ها', period: '1403-08', baseKaraneh: 65000000, overtimeBonus: 28000000, deductions: 0, finalKaraneh: 93000000, notes: 'راه‌اندازی کامل دیتابیس لوکال و پشتیبانی ۲۴ ساعته (+۱۶.۲۵٪ رشد)', updatedAt: '1403/08/29' },
      { id: 'k-102-08', personnelId: 'p-102', personnelCode: '10102', fullName: 'زهرا کریمی', department: 'امور مالی و اقتصادی', position: 'رئیس حسابداری و بودجه', period: '1403-08', baseKaraneh: 52000000, overtimeBonus: 16000000, deductions: 0, finalKaraneh: 68000000, notes: 'ارائه گزارش تحلیلی سود و زیان واحدها (+۱۳.۳٪ رشد)', updatedAt: '1403/08/29' },
      { id: 'k-103-08', personnelId: 'p-103', personnelCode: '10103', fullName: 'امیرحسین مرادی', department: 'فناوری اطلاعات', position: 'کارشناس ارشد شبکه و امنیت', period: '1403-08', baseKaraneh: 42000000, overtimeBonus: 11000000, deductions: 0, finalKaraneh: 53000000, notes: 'پیاده‌سازی رمزنگاری اطلاعات و تونل اینترنتی (+۱۷.۸٪ رشد)', updatedAt: '1403/08/29' },
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
    lastSaved: new Date().toLocaleString('fa-IR'),
  };
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<any> {
  const idb = await openIdb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: any): Promise<boolean> {
  const idb = await openIdb();
  if (!idb) return false;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function getEmbeddedSecret(): Promise<string> {
  const fromIdb = await idbGet(IDB_SECRET_KEY);
  if (typeof fromIdb === 'string' && fromIdb.length >= 32) return fromIdb;
  const fromLs = localStorage.getItem(LS_SECRET_KEY);
  if (fromLs && fromLs.length >= 32) {
    await idbSet(IDB_SECRET_KEY, fromLs);
    return fromLs;
  }
  const secret = randomHex(32);
  localStorage.setItem(LS_SECRET_KEY, secret);
  await idbSet(IDB_SECRET_KEY, secret);
  return secret;
}

async function loadEmbeddedDb(): Promise<EmbeddedDatabase> {
  const fromIdb = await idbGet(IDB_MAIN_KEY);
  if (fromIdb && Array.isArray(fromIdb.users) && Array.isArray(fromIdb.personnel)) {
    return {
      users: fromIdb.users || [],
      jobGroups: fromIdb.jobGroups || [],
      jobClassifications: fromIdb.jobClassifications || [],
      personnel: fromIdb.personnel || [],
      karaneh: fromIdb.karaneh || [],
      commitments: fromIdb.commitments || [],
      payroll: fromIdb.payroll || [],
      miningVolumes: fromIdb.miningVolumes || [],
      miningMachinery: fromIdb.miningMachinery || [],
      unitReports: fromIdb.unitReports || [],
      lastSaved: fromIdb.lastSaved,
    };
  }
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.personnel)) {
        await idbSet(IDB_MAIN_KEY, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  const initial = getInitialEmbeddedDatabase();
  await saveEmbeddedDb(initial);
  return initial;
}

async function saveEmbeddedDb(db: EmbeddedDatabase): Promise<void> {
  const next = { ...db, lastSaved: new Date().toLocaleString('fa-IR') };
  await idbSet(IDB_MAIN_KEY, next);
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage quota exceeded when large scanned images live inside IndexedDB
  }
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

async function createToken(user: User): Promise<string> {
  const secret = await getEmbeddedSecret();
  const payload = { uid: user.id, usr: user.username, exp: Date.now() + TOKEN_TTL_MS };
  const encoded = b64UrlEncode(JSON.stringify(payload));
  const sig = sha256Hex(`${secret}.${encoded}`);
  return `emb.${encoded}.${sig}`;
}

async function getCurrentAuthUser(db: EmbeddedDatabase): Promise<User | null> {
  const token = localStorage.getItem('hr_auth_token') || '';
  if (!token) return null;
  if (token.startsWith('emb.')) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, encoded, sig] = parts;
    const secret = await getEmbeddedSecret();
    if (sha256Hex(`${secret}.${encoded}`) !== sig) return null;
    const raw = b64UrlDecode(encoded);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      if (!payload.uid || !payload.exp || Date.now() > payload.exp) return null;
      const found = db.users.find((u) => u.id === payload.uid && u.isActive);
      return found || null;
    } catch {
      return null;
    }
  }
  return null;
}

function isSuperAdmin(user: User | null): boolean {
  return !!user && (user.role === 'super_admin' || user.username === 'javadabadiyan');
}

function hasPerm(user: User | null, section: string, action: string): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdmin(user)) return true;
  const perms: any = normalizePermissions(user.permissions);
  return Boolean(perms?.[section]?.[action] === true);
}

function getAllowedUnitsEmb(user: User | null): string[] {
  const raw = (user?.permissions as any)?.unitOperations?.allowedUnits;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x || '').trim()).filter(Boolean);
}

function isUnitAllowedEmb(user: User | null, unitName?: string): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdmin(user) || hasPerm(user, 'ceoDashboard', 'view')) return true;
  if (!hasPerm(user, 'unitOperations', 'view')) return false;
  const allowed = getAllowedUnitsEmb(user);
  if (allowed.length === 0) return true;
  if (!unitName) return false;
  const nu = String(unitName).replace(/[\u200c]/g, ' ').replace(/\s+/g, ' ').trim();
  return allowed.some((a) => {
    const na = a.replace(/[\u200c]/g, ' ').replace(/\s+/g, ' ').trim();
    return na === nu || nu.includes(na) || na.includes(nu);
  });
}

function isWorkshopOrUnitAllowedEmb(user: User | null, unitName?: string): boolean {
  return isUnitAllowedEmb(user, unitName) || isUnitAllowedEmb(user, 'واحد تعمیرگاه و ماشین‌آلات سنگین') || isUnitAllowedEmb(user, 'تعمیرگاه');
}

function isDispatchingOrUnitAllowedEmb(user: User | null, unitName?: string): boolean {
  return isUnitAllowedEmb(user, unitName) || isUnitAllowedEmb(user, 'واحد دیسپچینگ و کنترل تولید') || isUnitAllowedEmb(user, 'دیسپچینگ');
}

function hasMiningOrUnitPermEmb(user: User | null, action: string): boolean {
  return hasPerm(user, 'ceoDashboard', action) || hasPerm(user, 'unitOperations', action);
}

function normalizeUnitTextEmb(s?: string): string {
  return String(s || '')
    .replace(/\u200c/g, ' ')
    .replace(/[يی]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getKaranehAllowedUnitsEmb(user: User | null): string[] {
  const raw = (user?.permissions as any)?.karaneh?.allowedUnits;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x || '').trim()).filter(Boolean);
}

function hasFullKaranehScopeEmb(user: User | null): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdmin(user) || hasPerm(user, 'finalKaraneh', 'view')) return true;
  return getKaranehAllowedUnitsEmb(user).length === 0;
}

function isKaranehUnitAllowedEmb(user: User | null, unitName?: string): boolean {
  if (!user || !user.isActive) return false;
  if (hasFullKaranehScopeEmb(user)) return true;
  if (!hasPerm(user, 'karaneh', 'view')) return false;
  const allowed = getKaranehAllowedUnitsEmb(user);
  const target = normalizeUnitTextEmb(unitName);
  if (!target) return false;
  return allowed.some((a) => {
    const na = normalizeUnitTextEmb(a);
    return na === target || target.includes(na) || na.includes(target);
  });
}

function stripPass(u: any): User {
  const { password: _, ...rest } = u;
  return {
    ...rest,
    permissions: isSuperAdmin(u) ? getFullAdminPermissions() : normalizePermissions(u?.permissions),
  };
}

function normPayrollKey(key: string): string {
  return String(key || '').replace(/\u200c/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/أ|إ/g, 'ا').replace(/\s+/g, ' ').trim();
}

function getPayrollVal(row: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  const map = new Map<string, any>();
  for (const [rk, rv] of Object.entries(row)) {
    if (rv !== undefined && rv !== null && rv !== '') {
      const nk = normPayrollKey(rk);
      if (!map.has(nk)) map.set(nk, rv);
    }
  }
  for (const k of keys) {
    const found = map.get(normPayrollKey(k));
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseNumPayroll(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const eng = String(val)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,٬،\s]/g, '')
    .replace(/ریال/g, '');
  const n = Number(eng);
  return Number.isFinite(n) ? n : 0;
}

function parseYearMonth(rawYm: any, fallbackPeriod: string): string {
  const eng = String(rawYm || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
  if (!eng) return fallbackPeriod;
  const m1 = eng.match(/^(\d{4})\s*[-/]\s*(\d{1,2})$/);
  if (m1) {
    const mo = m1[2].padStart(2, '0');
    if (Number(mo) >= 1 && Number(mo) <= 12) return `${m1[1]}-${mo}`;
  }
  const m2 = eng.match(/^(\d{4})(\d{2})$/);
  if (m2 && Number(m2[2]) >= 1 && Number(m2[2]) <= 12) return `${m2[1]}-${m2[2]}`;
  return fallbackPeriod;
}

export const embeddedDb = {
  async login(username: string, password: string) {
    const db = await loadEmbeddedDb();
    const user = db.users.find((u) => u.username === String(username).trim());
    if (!user) return { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' };
    const check = verifyPasswordClient(String(password), String(user.password || ''));
    if (!check.valid) return { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' };
    if (!user.isActive) return { success: false, message: 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر ارشد تماس بگیرید.' };
    if (check.needsMigration) user.password = hashPasswordClient(String(password));
    user.lastLogin = new Date().toLocaleString('fa-IR');
    await saveEmbeddedDb(db);
    return {
      success: true,
      data: { user: stripPass(user), token: await createToken(user), expiresAt: Date.now() + TOKEN_TTL_MS },
    };
  },

  async firebaseLogin(idToken: string) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) return { success: false, message: 'توکن گوگل نامعتبر است.' };
    const decodedRaw = b64UrlDecode(parts[1]);
    if (!decodedRaw) return { success: false, message: 'امکان خواندن اطلاعات توکن گوگل وجود ندارد.' };
    const decoded = JSON.parse(decodedRaw);
    if (!decoded?.email || !decoded?.email_verified) {
      return { success: false, message: 'حساب گوگل باید دارای ایمیل تأییدشده باشد.' };
    }
    const email = String(decoded.email).trim().toLowerCase();
    const uid = String(decoded.user_id || decoded.sub || '');
    const db = await loadEmbeddedDb();
    const user =
      email === 'javadabadiyangoshi@gmail.com'
        ? db.users.find((u) => u.username === 'javadabadiyan' || u.role === 'super_admin')
        : db.users.find(
            (u) =>
              (u.uid && u.uid === uid) ||
              (u.email && String(u.email).trim().toLowerCase() === email) ||
              String(u.username || '').trim().toLowerCase() === email.split('@')[0]
          );
    if (!user) return { success: false, message: `ایمیل ${email} در لیست کاربران مجاز سامانه ثبت نشده است.` };
    if (!user.isActive) return { success: false, message: 'حساب کاربری غیرفعال است.' };
    user.uid = uid;
    user.email = email;
    user.lastLogin = new Date().toLocaleString('fa-IR');
    await saveEmbeddedDb(db);
    return {
      success: true,
      data: { user: stripPass(user), token: await createToken(user), expiresAt: Date.now() + TOKEN_TTL_MS },
    };
  },

  async verifySession() {
    const db = await loadEmbeddedDb();
    const user = await getCurrentAuthUser(db);
    if (!user) {
      window.dispatchEvent(new CustomEvent('hr:unauthorized'));
      return { success: false, message: 'نشست منقضی شده است.' };
    }
    return { success: true, data: stripPass(user) };
  },

  async getUsers(): Promise<User[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'view')) return [];
    return db.users.map(stripPass);
  },

  async createUser(user: Partial<User> & { password?: string }) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'create')) return { success: false, message: 'عدم دسترسی ایجاد کاربر.' };
    if (!user.username || !user.password || !user.fullName) {
      return { success: false, message: 'تکمیل نام کاربری، رمز عبور و نام الزامی است.' };
    }
    if (String(user.role || '').trim() === 'super_admin' && !isSuperAdmin(auth)) {
      return { success: false, message: 'فقط مدیر ارشد مجاز به ایجاد کاربر با نقش مدیر ارشد است.' };
    }
    if (db.users.some((u) => u.username.toLowerCase() === String(user.username).trim().toLowerCase())) {
      return { success: false, message: 'این نام کاربری قبلاً ثبت شده است.' };
    }
    const normalizedPerms = user.role === 'super_admin'
      ? getFullAdminPermissions()
      : user.permissions && typeof user.permissions === 'object'
      ? normalizePermissions(user.permissions)
      : getEmptyPermissions();
    const newUser: any = {
      id: `u-${Date.now()}`,
      username: String(user.username).trim(),
      password: hashPasswordClient(String(user.password)),
      email: user.email ? String(user.email).trim().toLowerCase() : '',
      fullName: user.fullName,
      role: user.role || 'کاربر سفارشی',
      department: user.department || '',
      permissions: normalizedPerms,
      isActive: true,
      createdAt: new Date().toLocaleDateString('fa-IR'),
    };
    db.users.push(newUser);
    await saveEmbeddedDb(db);
    return { success: true, data: stripPass(newUser), message: 'کاربر جدید با موفقیت ذخیره شد.' };
  },

  async updateUser(id: string, user: Partial<User> & { password?: string }) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'edit')) return { success: false, message: 'عدم دسترسی ویرایش کاربر.' };
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx < 0) return { success: false, message: 'کاربر یافت نشد.' };
    const existing = db.users[idx];
    if (!isSuperAdmin(auth) && (isSuperAdmin(existing) || user.role === 'super_admin')) {
      return { success: false, message: 'ویرایش مدیر ارشد یا ارتقای نقش فقط توسط مدیر ارشد مجاز است.' };
    }
    if (existing.username === 'javadabadiyan' && user.isActive === false) {
      return { success: false, message: 'حساب ادمین ارشد قابل غیرفعال‌سازی نیست.' };
    }
    const nextRole = user.role ?? existing.role;
    const nextPermissions = nextRole === 'super_admin' || existing.username === 'javadabadiyan'
      ? getFullAdminPermissions()
      : user.permissions !== undefined
      ? normalizePermissions(user.permissions)
      : normalizePermissions(existing.permissions);
    db.users[idx] = {
      ...existing,
      fullName: user.fullName ?? existing.fullName,
      email: user.email !== undefined ? String(user.email).trim().toLowerCase() : existing.email,
      role: nextRole,
      department: user.department ?? existing.department,
      permissions: nextPermissions,
      isActive: user.isActive ?? existing.isActive,
      password: user.password ? hashPasswordClient(String(user.password)) : existing.password,
    };
    await saveEmbeddedDb(db);
    return { success: true, data: stripPass(db.users[idx]), message: 'اطلاعات و دسترسی‌های کاربر به‌روزرسانی شد.' };
  },

  async deleteUser(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'delete')) return { success: false, message: 'عدم دسترسی حذف کاربر.' };
    const u = db.users.find((x) => x.id === id);
    if (!u) return { success: false, message: 'کاربر یافت نشد.' };
    if (u.username === 'javadabadiyan') return { success: false, message: 'کاربر ارشد سامانه قابل حذف نیست.' };
    db.users = db.users.filter((x) => x.id !== id);
    await saveEmbeddedDb(db);
    return { success: true, message: 'کاربر با موفقیت حذف گردید.' };
  },

  async batchImportUsers(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'importExcel') && !hasPerm(auth, 'users', 'create')) {
      return { success: false, message: 'شما مجوز بارگذاری اکسل کاربران را ندارید.' };
    }
    const uIdxMap = new Map<string, number>();
    db.users.forEach((u, i) => {
      const k = String(u.username || '').trim().toLowerCase();
      if (k && !uIdxMap.has(k)) uIdxMap.set(k, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const username = String(row.username || row['نام کاربری'] || '').trim();
      const fullName = String(row.fullName || row['نام و نام خانوادگی'] || '').trim();
      const unameKey = username.toLowerCase();
      if (!username || !fullName || unameKey === 'javadabadiyan') continue;
      const role = String(row.role || row['نقش سازمانی'] || 'کارشناس اداری').trim();
      if (role === 'super_admin' && !isSuperAdmin(auth)) continue;
      const department = String(row.department || row['واحد اداری'] || '').trim();
      const rawActive = String(row.isActive ?? row['وضعیت حساب'] ?? 'فعال').trim();
      const isActive = rawActive !== 'غیرفعال' && rawActive !== 'مسدود' && rawActive !== 'false' && rawActive !== '0';
      const presetLabel = String(row.preset || row['الگوی دسترسی'] || 'دسترسی صفر').trim();
      const rawPass = String(row.password || row['رمز عبور'] || '').trim();
      const idx = uIdxMap.get(unameKey) ?? -1;
      if (idx >= 0) {
        const existing = db.users[idx];
        if (isSuperAdmin(existing) && !isSuperAdmin(auth)) continue;
        db.users[idx] = {
          ...existing, fullName, role, department, isActive,
          permissions: (row['الگوی دسترسی'] || row.preset)
            ? normalizePermissions(buildPresetPermissions(presetLabel))
            : normalizePermissions(existing.permissions),
          password: rawPass ? hashPasswordClient(rawPass) : existing.password,
        };
        updated++;
      } else {
        const newIdx = db.users.length;
        db.users.push({
          id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          username, password: hashPasswordClient(rawPass || '12345678'), fullName, role, department, isActive,
          permissions: row['الگوی دسترسی'] || row.preset ? normalizePermissions(buildPresetPermissions(presetLabel)) : getEmptyPermissions(),
          createdAt: todayFa,
        });
        uIdxMap.set(unameKey, newIdx);
        added++;
      }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `بارگذاری کاربران از اکسل انجام شد (${added} کاربر جدید، ${updated} کاربر به‌روزرسانی شد).` };
  },

  async batchDeleteUsers(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    const idSet = new Set(ids.map(String));
    const before = db.users.length;
    db.users = db.users.filter((u) => !idSet.has(u.id) || u.username === 'javadabadiyan' || u.id === auth?.id);
    const deletedCount = before - db.users.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} کاربر با موفقیت حذف گردید.` };
  },

  async deleteAllUsers() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'users', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی کاربران.' };
    const before = db.users.length;
    db.users = db.users.filter((u) => u.username === 'javadabadiyan' || u.id === auth?.id);
    const deletedCount = before - db.users.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} حساب کاربری حذف شدند (حساب مدیر ارشد و کاربر جاری حفظ گردید).` };
  },

  async getPersonnel(): Promise<Personnel[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'view')) return [];
    const canSal = hasPerm(auth, 'personnel', 'viewSalary');
    const canDocs = hasPerm(auth, 'personnel', 'documents');
    return db.personnel.map((p) => ({ ...p, baseSalary: canSal ? p.baseSalary : 0, documents: canDocs ? p.documents : undefined }));
  },

  async createPersonnel(personnel: Partial<Personnel>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'create')) return { success: false, message: 'عدم دسترسی ثبت پرسنل.' };
    if (!personnel.personnelCode || !personnel.firstName || !personnel.lastName) {
      return { success: false, message: 'کد پرسنلی، نام و نام خانوادگی الزامی هستند.' };
    }
    if (db.personnel.some((p) => p.personnelCode === personnel.personnelCode)) {
      return { success: false, message: `کد پرسنلی ${personnel.personnelCode} قبلاً ثبت شده است.` };
    }
    const newP: any = {
      id: `p-${Date.now()}`, ...personnel,
      fullName: `${personnel.firstName} ${personnel.lastName}`.trim() || String(personnel.fullName || ''),
      relatives: Array.isArray(personnel.relatives) ? personnel.relatives : [],
      createdAt: personnel.createdAt || new Date().toLocaleDateString('fa-IR'),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    db.personnel.push(newP);
    await saveEmbeddedDb(db);
    return { success: true, data: newP, message: 'پرسنل جدید با موفقیت ثبت گردید.' };
  },

  async updatePersonnel(id: string, personnel: Partial<Personnel>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'edit')) return { success: false, message: 'عدم دسترسی ویرایش پرسنل.' };
    const idx = db.personnel.findIndex((p) => p.id === id);
    if (idx < 0) return { success: false, message: 'پرسنل یافت نشد.' };
    if (personnel.personnelCode && personnel.personnelCode !== db.personnel[idx].personnelCode) {
      if (db.personnel.some((p) => p.id !== id && p.personnelCode === personnel.personnelCode)) {
        return { success: false, message: `کد پرسنلی ${personnel.personnelCode} متعلق به شخص دیگری است.` };
      }
    }
    const prev = db.personnel[idx];
    db.personnel[idx] = {
      ...prev, ...personnel,
      fullName: personnel.firstName && personnel.lastName ? `${personnel.firstName} ${personnel.lastName}`.trim() : (personnel.fullName || prev.fullName),
      relatives: personnel.relatives !== undefined ? personnel.relatives : (prev.relatives || []),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    await saveEmbeddedDb(db);
    return { success: true, data: db.personnel[idx], message: 'اطلاعات پرسنلی با موفقیت ویرایش شد.' };
  },

  async deletePersonnel(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    const p = db.personnel.find((x) => x.id === id);
    if (!p) return { success: false, message: 'پرسنل یافت نشد.' };
    db.personnel = db.personnel.filter((x) => x.id !== id);
    db.commitments = db.commitments.filter((c) => c.personnelId !== id && c.personnelCode !== p.personnelCode);
    await saveEmbeddedDb(db);
    return { success: true, message: `پرسنل ${p.fullName} با موفقیت حذف شد.` };
  },

  async batchImportPersonnel(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'importExcel')) return { success: false, message: 'عدم دسترسی ورود اکسل.' };
    const pIdxMap = new Map<string, number>();
    db.personnel.forEach((p, i) => {
      const k = String(p.personnelCode || '').trim();
      if (k && !pIdxMap.has(k)) pIdxMap.set(k, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const code = String(getPayrollVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim();
      if (!code) continue;
      const idx = pIdxMap.get(code) ?? -1;
      const existing = idx >= 0 ? db.personnel[idx] : undefined;
      const firstName = String(getPayrollVal(row, 'firstName', 'نام') || '').trim();
      const lastName = String(getPayrollVal(row, 'lastName', 'نام خانوادگي', 'نام خانوادگی') || '').trim();
      const fullNameRaw = String(getPayrollVal(row, 'fullName', 'نام و نام خانوادگي', 'نام و نام خانوادگی') || '').trim();
      const fullName = `${firstName} ${lastName}`.trim() || fullNameRaw || 'پرسنل';
      const itemData: any = {
        employeeId: String(getPayrollVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') ?? existing?.employeeId ?? ''),
        personnelCode: code,
        firstName: firstName || fullName.split(' ')[0] || '',
        lastName: lastName || fullName.split(' ').slice(1).join(' ') || '',
        fullName,
        fatherName: String(getPayrollVal(row, 'fatherName', 'نام پدر') ?? existing?.fatherName ?? ''),
        shenasnamehNumber: String(getPayrollVal(row, 'shenasnamehNumber', 'شماره شناسنامه') ?? existing?.shenasnamehNumber ?? ''),
        nationalId: String(getPayrollVal(row, 'nationalId', 'كد ملي', 'کد ملی') ?? existing?.nationalId ?? ''),
        nationality: String(getPayrollVal(row, 'nationality', 'مليت', 'ملیت') ?? existing?.nationality ?? 'ایرانی'),
        citizenship: String(getPayrollVal(row, 'citizenship', 'تابعيت', 'تابعیت') ?? existing?.citizenship ?? 'جمهوری اسلامی ایران'),
        gender: String(getPayrollVal(row, 'gender', 'جنسيت', 'جنسیت') ?? existing?.gender ?? ''),
        phone: String(getPayrollVal(row, 'phone', 'تلفن همراه', 'شماره تماس', 'تلفن') ?? existing?.phone ?? ''),
        email: String(getPayrollVal(row, 'email', 'پست الكترونيك', 'پست الکترونیک', 'ایمیل') ?? existing?.email ?? ''),
        birthPlace: String(getPayrollVal(row, 'birthPlace', 'محل تولد') ?? existing?.birthPlace ?? ''),
        issuePlace: String(getPayrollVal(row, 'issuePlace', 'محل صدور') ?? existing?.issuePlace ?? ''),
        birthDate: String(getPayrollVal(row, 'birthDate', 'تاريخ تولد', 'تاریخ تولد') ?? existing?.birthDate ?? ''),
        issueDate: String(getPayrollVal(row, 'issueDate', 'تاريخ صدور', 'تاریخ صدور') ?? existing?.issueDate ?? ''),
        maritalStatus: String(getPayrollVal(row, 'maritalStatus', 'وضعيت تاهل', 'وضعیت تاهل', 'وضعیت تأهل') ?? existing?.maritalStatus ?? ''),
        militaryStatus: String(getPayrollVal(row, 'militaryStatus', 'وضعيت نظام وظيفه', 'وضعیت نظام وظیفه') ?? existing?.militaryStatus ?? ''),
        education: String(getPayrollVal(row, 'education', 'مدرك تحصيلي', 'مدرک تحصیلی', 'تحصیلات') ?? existing?.education ?? ''),
        fieldOfStudy: String(getPayrollVal(row, 'fieldOfStudy', 'رشته تحصيلي', 'رشته تحصیلی') ?? existing?.fieldOfStudy ?? ''),
        hireDate: String(getPayrollVal(row, 'hireDate', 'تاريخ استخدام', 'تاریخ استخدام') ?? existing?.hireDate ?? '1403/01/01'),
        workLocation: String(getPayrollVal(row, 'workLocation', 'محل خدمت') ?? existing?.workLocation ?? ''),
        department: String(getPayrollVal(row, 'department', 'واحد سازماني', 'واحد سازمانی', 'واحد') ?? existing?.department ?? 'عمومی'),
        jobTitle: String(getPayrollVal(row, 'jobTitle', 'شغل') ?? existing?.jobTitle ?? ''),
        jobCode: String(getPayrollVal(row, 'jobCode', 'كد شغل', 'کد شغل') ?? existing?.jobCode ?? ''),
        position: String(getPayrollVal(row, 'position', 'پست', 'پست و سمت', 'پست سازمانی') ?? existing?.position ?? 'کارشناس'),
        positionCode: String(getPayrollVal(row, 'positionCode', 'كد پست', 'کد پست') ?? existing?.positionCode ?? ''),
        employmentType: String(getPayrollVal(row, 'employmentType', 'نوع استخدام') ?? existing?.employmentType ?? 'قراردادی'),
        jobGroupId: String(getPayrollVal(row, 'jobGroupId') ?? existing?.jobGroupId ?? ''),
        status: String(getPayrollVal(row, 'status', 'وضعیت') ?? existing?.status ?? 'فعال'),
        baseSalary: Number(getPayrollVal(row, 'baseSalary', 'حقوق پایه', 'حقوق پایه (ریال)') ?? existing?.baseSalary ?? 0),
        notes: String(getPayrollVal(row, 'notes', 'یادداشت', 'توضیحات') ?? existing?.notes ?? ''),
        updatedAt: todayFa,
      };
      if (idx >= 0) { db.personnel[idx] = { ...db.personnel[idx], ...itemData }; updated++; }
      else {
        const newIdx = db.personnel.length;
        db.personnel.push({ id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...itemData, relatives: [], createdAt: todayFa });
        pIdxMap.set(code, newIdx);
        added++;
      }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `ورود اطلاعات انجام شد: ${added} نفر جدید اضافه شدند و ${updated} پرونده به‌روزرسانی گردید.` };
  },

  async batchDeletePersonnel(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    const idSet = new Set(ids.map(String));
    const before = db.personnel.length;
    db.personnel = db.personnel.filter((p) => !idSet.has(p.id));
    const deletedCount = before - db.personnel.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} پرونده پرسنلی حذف شد.` };
  },

  async deleteAllPersonnel() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی جدول پرسنل.' };
    const deletedCount = db.personnel.length;
    db.personnel = [];
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `کل جدول پرسنل (${deletedCount} پرونده) پاکسازی شد.` };
  },

  async batchImportRelatives(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'importExcel')) return { success: false, message: 'عدم دسترسی ورود اکسل.' };
    const byCode = new Map<string, any>();
    const byEmpId = new Map<string, any>();
    const byNatId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const p of db.personnel) {
      const c = String(p.personnelCode || '').trim();
      const eid = String(p.employeeId || '').trim();
      const nid = String(p.nationalId || '').trim();
      const fn = normPayrollKey(String(p.fullName || ''));
      if (c && !byCode.has(c)) byCode.set(c, p);
      if (eid && !byEmpId.has(eid)) byEmpId.set(eid, p);
      if (nid && !byNatId.has(nid)) byNatId.set(nid, p);
      if (fn && !byName.has(fn)) byName.set(fn, p);
    }
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0; let unmatched = 0;
    for (const row of items || []) {
      const pCode = String(getPayrollVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim();
      const pEmpId = String(getPayrollVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') || '').trim();
      const pNatId = String(getPayrollVal(row, 'personnelNationalId', 'کد ملی کارمند', 'کد ملی پرسنل') || '').trim();
      const pName = normPayrollKey(String(getPayrollVal(row, 'personnelName', 'نام کارمند', 'نام پرسنل', 'نام و نام خانوادگی کارمند') || ''));
      const parent =
        (pCode ? byCode.get(pCode) : undefined) ||
        (pEmpId ? byEmpId.get(pEmpId) : undefined) ||
        (pNatId ? byNatId.get(pNatId) : undefined) ||
        (pName ? byName.get(pName) : undefined);
      if (!parent) { unmatched++; continue; }
      const relFullName = String(getPayrollVal(row, 'fullName', 'نام و نام خانوادگی بستگان', 'نام بستگان', 'نام و نام خانوادگی') || '').trim();
      if (!relFullName) continue;
      const relation = String(getPayrollVal(row, 'relation', 'نسبت', 'نسبت با کارمند') || 'سایر').trim();
      const relNationalId = String(getPayrollVal(row, 'nationalId', 'کد ملی بستگان', 'كد ملي', 'کد ملی') || '').trim();
      const rawDep = String(getPayrollVal(row, 'isDependent', 'تحت تکفل', 'تحت تکفل؟') || '').trim();
      const rawIns = String(getPayrollVal(row, 'insuranceCovered', 'بیمه تکمیلی', 'مشمول بیمه', 'بیمه') || '').trim();
      const isDependent = rawDep === '' ? true : !['خیر', 'نه', 'false', '0', 'ندارد'].includes(rawDep);
      const insuranceCovered = rawIns === '' ? isDependent : !['خیر', 'نه', 'false', '0', 'ندارد'].includes(rawIns);
      if (!Array.isArray(parent.relatives)) parent.relatives = [];
      const existingIdx = parent.relatives.findIndex((r: any) =>
        (relNationalId && String(r.nationalId || '').trim() === relNationalId) ||
        (normPayrollKey(String(r.fullName || '')) === normPayrollKey(relFullName) && normPayrollKey(String(r.relation || '')) === normPayrollKey(relation))
      );
      const relPayload: any = {
        id: existingIdx >= 0 ? parent.relatives[existingIdx].id : `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        personnelId: parent.id,
        personnelCode: parent.personnelCode,
        personnelName: parent.fullName,
        fullName: relFullName,
        relation,
        nationalId: relNationalId,
        shenasnamehNumber: String(getPayrollVal(row, 'shenasnamehNumber', 'شماره شناسنامه') || ''),
        fatherName: String(getPayrollVal(row, 'fatherName', 'نام پدر') || ''),
        birthDate: String(getPayrollVal(row, 'birthDate', 'تاریخ تولد', 'تاريخ تولد') || ''),
        gender: String(getPayrollVal(row, 'gender', 'جنسیت', 'جنسيت') || ''),
        phone: String(getPayrollVal(row, 'phone', 'تلفن همراه', 'شماره تماس') || ''),
        education: String(getPayrollVal(row, 'education', 'تحصیلات', 'مدرک تحصیلی') || ''),
        isDependent,
        insuranceCovered,
        notes: String(getPayrollVal(row, 'notes', 'توضیحات', 'یادداشت') || ''),
        updatedAt: todayFa,
        createdAt: existingIdx >= 0 ? parent.relatives[existingIdx].createdAt : todayFa,
      };
      if (existingIdx >= 0) {
        parent.relatives[existingIdx] = { ...parent.relatives[existingIdx], ...relPayload };
        updated++;
      } else {
        parent.relatives.push(relPayload);
        added++;
      }
      parent.updatedAt = todayFa;
    }
    await saveEmbeddedDb(db);
    return {
      success: true,
      added,
      updated,
      unmatched,
      data: { inserted: added, updated, addedRelatives: added, unmatched },
      message: `اطلاعات بستگان با موفقیت ذخیره شد (${added} جدید، ${updated} به‌روزرسانی${unmatched > 0 ? `، ${unmatched} ردیف بدون تطابق` : ''}).`,
    };
  },

  async deleteAllRelatives() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'personnel', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی بستگان.' };
    let deletedCount = 0;
    for (const p of db.personnel) {
      if (Array.isArray(p.relatives) && p.relatives.length > 0) {
        deletedCount += p.relatives.length;
        p.relatives = [];
      }
    }
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `تمامی اطلاعات بستگان پرسنل (${deletedCount} رکورد) پاکسازی شد.` };
  },

  async getKaraneh(period?: string, scope?: 'all' | 'submitted'): Promise<KaranehRecord[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'karaneh', 'view') && !hasPerm(auth, 'finalKaraneh', 'view')) return [];
    let rows = period ? db.karaneh.filter((k) => k.period === period) : db.karaneh;
    if (scope === 'submitted') {
      rows = rows.filter((k) => k.status === 'submitted');
    }
    if (!hasFullKaranehScopeEmb(auth)) {
      rows = rows.filter((k) => isKaranehUnitAllowedEmb(auth, k.department));
    }
    return rows;
  },

  async getKaranehUnitPersonnel(): Promise<Personnel[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'karaneh', 'view') && !hasPerm(auth, 'finalKaraneh', 'view')) return [];
    const filtered = hasFullKaranehScopeEmb(auth)
      ? db.personnel
      : db.personnel.filter((p) => isKaranehUnitAllowedEmb(auth, p.department));
    return filtered.map((p) => ({
      ...p,
      baseSalary: hasPerm(auth, 'personnel', 'viewSalary') ? p.baseSalary : 0,
      documents: undefined,
      relatives: undefined,
    }));
  },

  async getKaranehComparison(currentPeriod: string, previousPeriod: string, scope?: 'all' | 'submitted'): Promise<{
    currentPeriod: string;
    previousPeriod: string;
    comparisonRows: KaranehComparisonRow[];
    summary: { totalEmployees: number; totalCurrent: number; totalPrevious: number; totalDiff: number; overallGrowthPercent: number; countIncreased: number; countDecreased: number; countUnchanged: number; countNew: number; };
  }> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'karaneh', 'view') && !hasPerm(auth, 'finalKaraneh', 'view')) {
      return {
        currentPeriod,
        previousPeriod,
        comparisonRows: [],
        summary: {
          totalEmployees: 0, totalCurrent: 0, totalPrevious: 0, totalDiff: 0,
          overallGrowthPercent: 0, countIncreased: 0, countDecreased: 0, countUnchanged: 0, countNew: 0,
        },
      };
    }
    const unitAllowed = (dept?: string) => hasFullKaranehScopeEmb(auth) || isKaranehUnitAllowedEmb(auth, dept);
    const currentRecords = db.karaneh.filter(
      (k) =>
        k.period === currentPeriod &&
        unitAllowed(k.department) &&
        (scope === 'submitted' ? k.status === 'submitted' : true)
    );
    const previousRecords = db.karaneh.filter(
      (k) => k.period === previousPeriod && unitAllowed(k.department)
    );
    const prevMap = new Map(previousRecords.map((p) => [String(p.personnelCode).trim(), p]));
    const comparisonRows: any[] = currentRecords.map((curr) => {
      const prev = prevMap.get(String(curr.personnelCode).trim());
      const prevFinal = prev ? Number(prev.finalKaraneh || 0) : 0;
      const currFinal = Number(curr.finalKaraneh || 0);
      const diffAmount = currFinal - prevFinal;
      const diffPercent = prevFinal > 0 ? Number(((diffAmount / prevFinal) * 100).toFixed(1)) : (currFinal > 0 ? 100 : 0);
      const trend: 'increase' | 'decrease' | 'unchanged' | 'new' = !prev ? 'new' : diffAmount > 0 ? 'increase' : diffAmount < 0 ? 'decrease' : 'unchanged';
      return {
        id: curr.id, personnelId: curr.personnelId, personnelCode: curr.personnelCode, fullName: curr.fullName,
        department: curr.department, position: curr.position, currentKaraneh: currFinal, previousKaraneh: prevFinal,
        diffAmount, diffPercent, trend, notes: curr.notes || '',
        status: curr.status || 'draft', submittedAt: curr.submittedAt, submittedByName: curr.submittedByName,
      };
    });
    const totalCurrent = comparisonRows.reduce((s, r) => s + r.currentKaraneh, 0);
    const totalPrevious = comparisonRows.reduce((s, r) => s + r.previousKaraneh, 0);
    const totalDiff = totalCurrent - totalPrevious;
    return {
      currentPeriod, previousPeriod, comparisonRows,
      summary: {
        totalEmployees: comparisonRows.length, totalCurrent, totalPrevious, totalDiff,
        overallGrowthPercent: totalPrevious > 0 ? Number(((totalDiff / totalPrevious) * 100).toFixed(1)) : 0,
        countIncreased: comparisonRows.filter((r) => r.trend === 'increase').length,
        countDecreased: comparisonRows.filter((r) => r.trend === 'decrease').length,
        countUnchanged: comparisonRows.filter((r) => r.trend === 'unchanged').length,
        countNew: comparisonRows.filter((r) => r.trend === 'new').length,
      },
    };
  },

  async saveKaraneh(record: Partial<KaranehRecord>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canSave = hasPerm(auth, 'karaneh', record.id ? 'edit' : 'create') || (Boolean(record.id) && hasPerm(auth, 'finalKaraneh', 'edit'));
    if (!canSave) return { success: false, message: 'عدم دسترسی ثبت کارانه.' };
    if (!record.personnelCode || !record.period) return { success: false, message: 'کد پرسنلی و دوره الزامی است.' };
    const code = String(record.personnelCode).trim();
    const idx = db.karaneh.findIndex((k) => String(k.personnelCode).trim() === code && k.period === record.period);
    const existing = idx >= 0 ? db.karaneh[idx] : null;
    const allowedUnits = getKaranehAllowedUnitsEmb(auth);
    const targetDept = String(record.department || existing?.department || (allowedUnits[0] || 'عمومی')).trim();
    if (!hasFullKaranehScopeEmb(auth)) {
      if (!isKaranehUnitAllowedEmb(auth, targetDept) || (existing && !isKaranehUnitAllowedEmb(auth, existing.department))) {
        return { success: false, message: 'امکان ثبت یا ویرایش کارانه برای واحد سازمانی دیگر وجود ندارد.' };
      }
    }
    const baseKaraneh = Number(record.baseKaraneh || 0);
    const overtimeBonus = Number(record.overtimeBonus || 0);
    const deductions = Number(record.deductions || 0);
    const finalKaraneh = record.finalKaraneh !== undefined ? Number(record.finalKaraneh) : (baseKaraneh + overtimeBonus - deductions);
    const nextStatus: 'draft' | 'submitted' = record.status === 'submitted' ? 'submitted' : (existing?.status === 'submitted' ? 'submitted' : 'draft');
    const rec: any = {
      id: existing ? existing.id : `k-${Date.now()}`,
      personnelId: record.personnelId || existing?.personnelId || '',
      personnelCode: code,
      fullName: record.fullName || existing?.fullName || 'پرسنل',
      department: targetDept,
      position: record.position || existing?.position || '',
      period: record.period,
      baseKaraneh,
      overtimeBonus,
      deductions,
      finalKaraneh,
      notes: record.notes || '',
      status: nextStatus,
      submittedAt: nextStatus === 'submitted' ? (record.submittedAt || existing?.submittedAt) : undefined,
      submittedBy: nextStatus === 'submitted' ? (record.submittedBy || existing?.submittedBy) : undefined,
      submittedByName: nextStatus === 'submitted' ? (record.submittedByName || existing?.submittedByName) : undefined,
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) db.karaneh[idx] = rec; else db.karaneh.push(rec);
    await saveEmbeddedDb(db);
    return { success: true, data: rec, message: 'کارانه پرسنل با موفقیت ثبت شد.' };
  },

  async batchImportKaraneh(period: string, items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'karaneh', 'importExcel')) return { success: false, message: 'عدم دسترسی ورود اکسل کارانه.' };
    const fullScope = hasFullKaranehScopeEmb(auth);
    const allowedUnits = getKaranehAllowedUnitsEmb(auth);
    const pMap = new Map<string, Personnel>();
    for (const p of db.personnel) {
      const k = String(p.personnelCode || '').trim();
      if (k && !pMap.has(k)) pMap.set(k, p);
    }
    const kIdxMap = new Map<string, number>();
    db.karaneh.forEach((k, i) => {
      if (k.period === period) {
        const c = String(k.personnelCode || '').trim();
        if (c && !kIdxMap.has(c)) kIdxMap.set(c, i);
      }
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const code = String(row.personnelCode || row['کد پرسنلی'] || '').trim();
      if (!code) continue;
      const mp = pMap.get(code);
      const dept = String(
        row.department || row['واحد اداری'] || row['واحد سازمانی'] || row['واحد'] || (mp ? mp.department : (allowedUnits[0] || 'عمومی'))
      ).trim();
      if (!fullScope && !isKaranehUnitAllowedEmb(auth, dept)) {
        return {
          success: false,
          message: `واحد "${dept}" در مجوز کارانه حساب کاربری شما تعریف نشده است. تنها امکان بارگذاری کارانه واحد مجاز خود را دارید.`,
        };
      }
      const baseKaraneh = Number(row.baseKaraneh || row['کارانه پایه (ریال)'] || row['کارانه پایه'] || 0);
      const overtimeBonus = Number(row.overtimeBonus || row['پاداش تشویقی (ریال)'] || row['پاداش تشویقی'] || row['اضافه کاری'] || 0);
      const deductions = Number(row.deductions || row['کسورات (ریال)'] || row['کسورات'] || 0);
      const explicitFinal = row.finalKaraneh ?? row['مبلغ کارانه (ریال)'] ?? row['مبلغ کارانه'] ?? row['کارانه خالص نهایی (ریال)'] ?? row['کارانه خالص'] ?? row['کارانه'] ?? row['مبلغ'] ?? row.amount;
      const finalKaraneh = explicitFinal !== undefined ? Number(explicitFinal) : (baseKaraneh + overtimeBonus - deductions);
      const idx = kIdxMap.get(code) ?? -1;
      const existing = idx >= 0 ? db.karaneh[idx] : null;
      const rec: any = {
        id: existing ? existing.id : `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        personnelId: mp ? mp.id : '',
        personnelCode: code,
        fullName: row.fullName || row['نام و نام خانوادگی'] || row['نام'] || (mp ? mp.fullName : 'پرسنل'),
        department: dept,
        position: row.position || row['پست سازمانی'] || row['پست و سمت'] || row['پست'] || row['سمت'] || (mp ? mp.position : ''),
        period,
        baseKaraneh,
        overtimeBonus,
        deductions,
        finalKaraneh,
        notes: row.notes || row['توضیحات'] || row['یادداشت'] || '',
        status: existing?.status === 'submitted' ? 'submitted' : 'draft',
        submittedAt: existing?.submittedAt,
        submittedBy: existing?.submittedBy,
        submittedByName: existing?.submittedByName,
        updatedAt: todayFa,
      };
      if (idx >= 0) { db.karaneh[idx] = rec; updated++; }
      else { const newIdx = db.karaneh.length; db.karaneh.push(rec); kIdxMap.set(code, newIdx); added++; }
    }
    await saveEmbeddedDb(db);
    const count = added + updated;
    return { success: true, added, updated, data: { inserted: added, updated }, message: `کارانه دوره با موفقیت بارگذاری شد (${count} رکورد ثبت گردید).` };
  },

  async submitKaraneh(period: string, department?: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canSubmit = isSuperAdmin(auth) || hasPerm(auth, 'karaneh', 'submit') || hasPerm(auth, 'finalKaraneh', 'edit');
    if (!canSubmit || !auth) return { success: false, message: 'عدم دسترسی تأیید و ارسال کارانه نهایی.' };
    if (!period) return { success: false, message: 'دوره کارانه مشخص نشده است.' };
    const fullScope = hasFullKaranehScopeEmb(auth);
    if (department && !fullScope && !isKaranehUnitAllowedEmb(auth, department)) {
      return { success: false, message: 'شما مجوز ارسال کارانه برای این واحد را ندارید.' };
    }
    const nowFa = new Date().toLocaleString('fa-IR');
    const targetNorm = department ? normalizeUnitTextEmb(department) : '';
    let submittedCount = 0;
    db.karaneh = db.karaneh.map((k) => {
      if (k.period !== period) return k;
      if (!fullScope && !isKaranehUnitAllowedEmb(auth, k.department)) return k;
      if (targetNorm && normalizeUnitTextEmb(k.department) !== targetNorm) return k;
      submittedCount++;
      return {
        ...k,
        status: 'submitted',
        submittedAt: nowFa,
        submittedBy: auth.id,
        submittedByName: auth.fullName,
      };
    });
    if (submittedCount === 0) {
      return { success: false, message: 'رکورد کارانه‌ای در این دوره برای ارسال یافت نشد.' };
    }
    await saveEmbeddedDb(db);
    return {
      success: true,
      submittedCount,
      message: `${submittedCount} ردیف کارانه دوره ${period} تأیید و به کارانه نهایی ارسالی منتقل شد.`,
    };
  },

  async reopenKaraneh(period: string, department?: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!isSuperAdmin(auth) && !hasPerm(auth, 'finalKaraneh', 'edit')) {
      return { success: false, message: 'عدم دسترسی بازگرداندن کارانه به پیش‌نویس.' };
    }
    if (!period) return { success: false, message: 'دوره مشخص نشده است.' };
    const targetNorm = department ? normalizeUnitTextEmb(department) : '';
    let reopenedCount = 0;
    db.karaneh = db.karaneh.map((k) => {
      if (k.period !== period || k.status !== 'submitted') return k;
      if (targetNorm && normalizeUnitTextEmb(k.department) !== targetNorm) return k;
      reopenedCount++;
      const { submittedAt: _sa, submittedBy: _sb, submittedByName: _sbn, ...rest } = k as any;
      return { ...rest, status: 'draft' };
    });
    await saveEmbeddedDb(db);
    return {
      success: true,
      reopenedCount,
      message: `${reopenedCount} ردیف کارانه به حالت پیش‌نویس واحد بازگردانده شد.`,
    };
  },

  async deleteKaraneh(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canDel = hasPerm(auth, 'karaneh', 'delete') || hasPerm(auth, 'finalKaraneh', 'delete');
    if (!canDel) return { success: false, message: 'عدم دسترسی حذف.' };
    const target = db.karaneh.find((k) => k.id === id);
    if (target && !hasFullKaranehScopeEmb(auth) && !isKaranehUnitAllowedEmb(auth, target.department)) {
      return { success: false, message: 'امکان حذف کارانه سایر واحدها وجود ندارد.' };
    }
    db.karaneh = db.karaneh.filter((k) => k.id !== id);
    await saveEmbeddedDb(db);
    return { success: true, message: 'رکورد کارانه حذف گردید.' };
  },

  async batchDeleteKaraneh(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canDel = hasPerm(auth, 'karaneh', 'delete') || hasPerm(auth, 'finalKaraneh', 'delete');
    if (!canDel) return { success: false, message: 'عدم دسترسی حذف.' };
    const idSet = new Set(ids.map(String));
    const fullScope = hasFullKaranehScopeEmb(auth);
    const before = db.karaneh.length;
    db.karaneh = db.karaneh.filter((k) => {
      if (!idSet.has(k.id)) return true;
      if (!fullScope && !isKaranehUnitAllowedEmb(auth, k.department)) return true;
      return false;
    });
    const deletedCount = before - db.karaneh.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} رکورد کارانه حذف شد.` };
  },

  async deleteAllKaraneh(period?: string, scope?: 'all' | 'submitted') {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const isSubmittedOnly = scope === 'submitted';
    const canDelAll = isSubmittedOnly
      ? (hasPerm(auth, 'finalKaraneh', 'deleteAll') || hasPerm(auth, 'karaneh', 'deleteAll'))
      : hasPerm(auth, 'karaneh', 'deleteAll');
    if (!canDelAll) return { success: false, message: 'عدم دسترسی پاکسازی کارانه.' };
    const fullScope = hasFullKaranehScopeEmb(auth);
    const before = db.karaneh.length;
    db.karaneh = db.karaneh.filter((k) => {
      const matchesPeriod = !period || k.period === period;
      const matchesScope = !isSubmittedOnly || k.status === 'submitted';
      const matchesUnit = fullScope || isKaranehUnitAllowedEmb(auth, k.department);
      if (matchesPeriod && matchesScope && matchesUnit) return false;
      return true;
    });
    const deletedCount = before - db.karaneh.length;
    await saveEmbeddedDb(db);
    return {
      success: true,
      deletedCount,
      message: period
        ? `تمام رکوردهای کارانه دوره ${period} (${deletedCount} رکورد) حذف شدند.`
        : `جدول کارانه (${deletedCount} رکورد) پاکسازی شد.`,
    };
  },

  async getJobGroups(): Promise<JobGroup[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'view')) return [];
    return db.jobGroups;
  },

  async createJobGroup(group: Partial<JobGroup>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'create')) return { success: false, message: 'عدم دسترسی.' };
    if (!group.code || !group.title) return { success: false, message: 'کد گروه و عنوان شغلی الزامی است.' };
    const g: any = {
      id: `jg-${Date.now()}`, ...group,
      grade: Number(group.grade || 1), minBaseSalary: Number(group.minBaseSalary || 0),
      maxBaseSalary: Number(group.maxBaseSalary || 0), maxKaranehCeiling: Number(group.maxKaranehCeiling || 0),
      requiredExperienceYears: Number(group.requiredExperienceYears || 0),
    };
    db.jobGroups.push(g);
    await saveEmbeddedDb(db);
    return { success: true, data: g, message: 'گروه شغلی جدید ایجاد شد.' };
  },

  async updateJobGroup(id: string, group: Partial<JobGroup>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'edit')) return { success: false, message: 'عدم دسترسی.' };
    const idx = db.jobGroups.findIndex((g) => g.id === id);
    if (idx < 0) return { success: false, message: 'گروه شغلی یافت نشد.' };
    db.jobGroups[idx] = { ...db.jobGroups[idx], ...group };
    await saveEmbeddedDb(db);
    return { success: true, data: db.jobGroups[idx], message: 'گروه شغلی ویرایش شد.' };
  },

  async deleteJobGroup(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    db.jobGroups = db.jobGroups.filter((g) => g.id !== id);
    await saveEmbeddedDb(db);
    return { success: true, message: 'گروه شغلی حذف شد.' };
  },

  async batchDeleteJobGroups(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    const idSet = new Set(ids.map(String));
    const before = db.jobGroups.length;
    db.jobGroups = db.jobGroups.filter((g) => !idSet.has(g.id));
    const deletedCount = before - db.jobGroups.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} گروه شغلی حذف شد.` };
  },

  async deleteAllJobGroups() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی.' };
    const deletedCount = db.jobGroups.length;
    db.jobGroups = [];
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `کل جدول گروه‌های شغلی (${deletedCount} رکورد) پاکسازی شد.` };
  },

  async getJobClassifications(): Promise<JobClassificationRecord[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'view')) return [];
    return db.jobClassifications;
  },

  async createJobClassification(record: Partial<JobClassificationRecord>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'create')) return { success: false, message: 'عدم دسترسی.' };
    if (!record.personnelCode) return { success: false, message: 'کد پرسنلی الزامی است.' };
    const newRec: JobClassificationRecord = {
      id: `jc-${Date.now()}`,
      personnelCode: String(record.personnelCode || '').trim(),
      firstName: String(record.firstName || ''), lastName: String(record.lastName || ''),
      workLocation: String(record.workLocation || ''), department: String(record.department || ''),
      nationalId: String(record.nationalId || ''), education: String(record.education || ''),
      hireDate: String(record.hireDate || ''), hireMonth: String(record.hireMonth || ''),
      miningExperienceDays: String(record.miningExperienceDays || ''),
      totalInsuranceHistory: String(record.totalInsuranceHistory || ''),
      miningExperience: String(record.miningExperience || ''),
      nonMiningExperience: String(record.nonMiningExperience || ''),
      jobGroup: String(record.jobGroup || ''), groupGapFrom1405: String(record.groupGapFrom1405 || ''),
      nextGroupGap: String(record.nextGroupGap || ''), jobTitle: String(record.jobTitle || ''),
      position: String(record.position || ''), updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    db.jobClassifications.push(newRec);
    await saveEmbeddedDb(db);
    return { success: true, data: newRec, message: 'رکورد طبقه‌بندی شغلی ثبت شد.' };
  },

  async updateJobClassification(id: string, record: Partial<JobClassificationRecord>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'edit')) return { success: false, message: 'عدم دسترسی.' };
    const idx = db.jobClassifications.findIndex((r) => r.id === id);
    if (idx < 0) return { success: false, message: 'رکورد یافت نشد.' };
    db.jobClassifications[idx] = { ...db.jobClassifications[idx], ...record, updatedAt: new Date().toLocaleDateString('fa-IR') };
    await saveEmbeddedDb(db);
    return { success: true, data: db.jobClassifications[idx], message: 'رکورد طبقه‌بندی شغلی ویرایش شد.' };
  },

  async deleteJobClassification(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    db.jobClassifications = db.jobClassifications.filter((r) => r.id !== id);
    await saveEmbeddedDb(db);
    return { success: true, message: 'رکورد طبقه‌بندی شغلی حذف شد.' };
  },

  async batchImportJobClassifications(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'importExcel')) return { success: false, message: 'عدم دسترسی.' };
    const jcIdxMap = new Map<string, number>();
    db.jobClassifications.forEach((item, i) => {
      const k = String(item.personnelCode || '').trim();
      if (k && !jcIdxMap.has(k)) jcIdxMap.set(k, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const code = String(row.personnelCode ?? row['کد پرسنلی'] ?? '').trim();
      if (!code) continue;
      const mapped: any = {
        personnelCode: code,
        firstName: String(row.firstName ?? row['نام'] ?? ''), lastName: String(row.lastName ?? row['نام خانوادگی'] ?? ''),
        workLocation: String(row.workLocation ?? row['محل خدمت'] ?? ''),
        department: String(row.department ?? row['واحد'] ?? row['واحد سازمانی'] ?? ''),
        nationalId: String(row.nationalId ?? row['کد ملی'] ?? ''),
        education: String(row.education ?? row['مدرک تحصیلی'] ?? row['تحصیلات'] ?? ''),
        hireDate: String(row.hireDate ?? row['تاریخ استخدام'] ?? ''), hireMonth: String(row.hireMonth ?? row['ماه استخدام'] ?? ''),
        miningExperienceDays: String(row.miningExperienceDays ?? row['سابقه معدنی به روز'] ?? row['سابقه معدنی به‌روز'] ?? ''),
        totalInsuranceHistory: String(row.totalInsuranceHistory ?? row['سابقه بیمه کلی'] ?? ''),
        miningExperience: String(row.miningExperience ?? row['سابقه معدنی'] ?? ''),
        nonMiningExperience: String(row.nonMiningExperience ?? row['سابقه غیرمعدنی'] ?? row['سابقه غیر معدنی'] ?? ''),
        jobGroup: String(row.jobGroup ?? row['گروه شغلی'] ?? ''),
        groupGapFrom1405: String(row.groupGapFrom1405 ?? row['فاصله گروه از 1405 به بعد'] ?? row['فاصله گروه از ۱۴۰۵ به بعد'] ?? ''),
        nextGroupGap: String(row.nextGroupGap ?? row['فاصله گروه بعدی'] ?? ''),
        jobTitle: String(row.jobTitle ?? row['شغل'] ?? ''), position: String(row.position ?? row['پست'] ?? row['پست سازمانی'] ?? ''),
        updatedAt: todayFa,
      };
      const idx = jcIdxMap.get(code) ?? -1;
      if (idx >= 0) { db.jobClassifications[idx] = { ...db.jobClassifications[idx], ...mapped }; updated++; }
      else { const newIdx = db.jobClassifications.length; db.jobClassifications.push({ id: `jc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...mapped }); jcIdxMap.set(code, newIdx); added++; }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `جدول طبقه‌بندی بارگذاری شد (${added} جدید، ${updated} به‌روزرسانی).` };
  },

  async batchDeleteJobClassifications(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    const idSet = new Set(ids.map(String));
    const before = db.jobClassifications.length;
    db.jobClassifications = db.jobClassifications.filter((c) => !idSet.has(c.id));
    const deletedCount = before - db.jobClassifications.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} ردیف طبقه‌بندی شغلی حذف شد.` };
  },

  async deleteAllJobClassifications() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'jobGroups', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی.' };
    const deletedCount = db.jobClassifications.length;
    db.jobClassifications = [];
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `کل جدول طبقه‌بندی مشاغل ۱۸ ستونی (${deletedCount} رکورد) پاکسازی شد.` };
  },

  async getCommitments(): Promise<PersonnelCommitment[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'commitments', 'view')) return [];
    return db.commitments;
  },

  async createCommitment(commitment: Partial<PersonnelCommitment>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'commitments', 'create')) return { success: false, message: 'عدم دسترسی.' };
    if (!commitment.personnelCode || !commitment.commitmentType) return { success: false, message: 'کد پرسنلی و نوع تعهد الزامی است.' };
    const mp = db.personnel.find((p) => String(p.personnelCode).trim() === String(commitment.personnelCode).trim());
    const c: any = {
      id: `cmt-${Date.now()}`, ...commitment,
      personnelId: mp ? mp.id : (commitment.personnelId || ''),
      personnelName: mp ? mp.fullName : (commitment.personnelName || 'پرسنل'),
      amount: Number(commitment.amount || 0), previouslyTakenAmount: Number(commitment.previouslyTakenAmount || 0),
      maxAllowedAmount: Number(commitment.maxAllowedAmount || 0),
      isArchived: Boolean(commitment.isArchived),
      archivedAt: commitment.isArchived ? (commitment.archivedAt || new Date().toLocaleDateString('fa-IR')) : undefined,
      archiveCode: commitment.isArchived ? (commitment.archiveCode || `ARC-${Date.now().toString().slice(-5)}`) : undefined,
      status: commitment.status || 'جاری و معتبر',
    };
    db.commitments.push(c);
    await saveEmbeddedDb(db);
    return { success: true, data: c, message: 'تعهد پرسنلی جدید با موفقیت ثبت شد.' };
  },

  async updateCommitment(id: string, commitment: Partial<PersonnelCommitment>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const idx = db.commitments.findIndex((c) => c.id === id);
    if (idx < 0) return { success: false, message: 'تعهد پرسنلی یافت نشد.' };
    const onlyArchive = Object.keys(commitment).every((k) => ['isArchived', 'archivedAt', 'archiveCode'].includes(k));
    if (onlyArchive ? (!hasPerm(auth, 'commitments', 'archive') && !hasPerm(auth, 'commitments', 'edit')) : !hasPerm(auth, 'commitments', 'edit')) {
      return { success: false, message: 'عدم دسترسی ویرایش تعهد.' };
    }
    const prev = db.commitments[idx];
    const nextArchived = commitment.isArchived !== undefined ? Boolean(commitment.isArchived) : prev.isArchived;
    db.commitments[idx] = {
      ...prev, ...commitment,
      amount: commitment.amount !== undefined ? Number(commitment.amount) : prev.amount,
      previouslyTakenAmount: commitment.previouslyTakenAmount !== undefined ? Number(commitment.previouslyTakenAmount) : prev.previouslyTakenAmount,
      maxAllowedAmount: commitment.maxAllowedAmount !== undefined ? Number(commitment.maxAllowedAmount) : prev.maxAllowedAmount,
      isArchived: nextArchived,
      archivedAt: nextArchived ? (commitment.archivedAt || prev.archivedAt || new Date().toLocaleDateString('fa-IR')) : undefined,
      archiveCode: nextArchived ? (commitment.archiveCode || prev.archiveCode || `ARC-${Date.now().toString().slice(-5)}`) : undefined,
    };
    await saveEmbeddedDb(db);
    return { success: true, data: db.commitments[idx], message: 'تعهد پرسنلی با موفقیت به‌روزرسانی شد.' };
  },

  async deleteCommitment(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'commitments', 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    db.commitments = db.commitments.filter((c) => c.id !== id);
    await saveEmbeddedDb(db);
    return { success: true, message: 'سند تعهد پرسنلی حذف شد.' };
  },

  async batchImportCommitments(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'commitments', 'importExcel')) return { success: false, message: 'عدم دسترسی.' };
    const pMap = new Map<string, Personnel>();
    for (const p of db.personnel) {
      const k = String(p.personnelCode || '').trim();
      if (k && !pMap.has(k)) pMap.set(k, p);
    }
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0;
    for (const row of items || []) {
      const code = String(row.personnelCode || row['کد پرسنلی'] || '').trim();
      if (!code) continue;
      const mp = pMap.get(code);
      const archVal = String(row['بایگانی'] || row['وضعیت بایگانی'] || '').trim();
      const isArchived = archVal === 'بله' || archVal === 'بایگانی شده' || row.isArchived === true;
      db.commitments.push({
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        personnelId: mp ? mp.id : '', personnelCode: code,
        personnelName: row.personnelName || row['نام پرسنل'] || row['نام و نام خانوادگی'] || (mp ? mp.fullName : 'پرسنل'),
        commitmentType: row.commitmentType || row['نوع تعهد یا تضمین'] || row['نوع تعهد'] || 'تعهد حسابداری',
        amount: Number(row.amount ?? row['مبلغ تعهد فعلی (ریال)'] ?? row['مبلغ تعهد (ریال)'] ?? row['مبلغ'] ?? 0),
        previouslyTakenAmount: Number(row.previouslyTakenAmount ?? row['مبلغ قبلاً دریافت شده (ریال)'] ?? row['مبلغ قبلا دریافت شده'] ?? 0),
        maxAllowedAmount: Number(row.maxAllowedAmount ?? row['سقف مجاز کل (ریال)'] ?? row['سقف مجاز'] ?? 0),
        startDate: String(row.startDate || row['تاریخ شروع'] || '1403/01/01'),
        endDate: String(row.endDate || row['تاریخ سررسید'] || '1405/01/01'),
        status: row.status || row['وضعیت'] || 'جاری و معتبر',
        isArchived, archivedAt: isArchived ? todayFa : undefined,
        archiveCode: isArchived ? `ARC-${Date.now().toString().slice(-5)}` : undefined,
        guarantorName: row.guarantorName || row['نام ضامن'] || '',
        notes: row.notes || row['توضیحات'] || '',
      });
      added++;
    }
    await saveEmbeddedDb(db);
    return { success: true, added, data: { inserted: added, updated: 0 }, message: `${added} فقره تعهد پرسنلی با موفقیت از اکسل ثبت گردید.` };
  },

  async batchDeleteCommitments(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'commitments', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    const idSet = new Set(ids.map(String));
    const before = db.commitments.length;
    db.commitments = db.commitments.filter((c) => !idSet.has(c.id));
    const deletedCount = before - db.commitments.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} سند تعهد پرسنلی حذف شد.` };
  },

  async deleteAllCommitments() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'commitments', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی.' };
    const deletedCount = db.commitments.length;
    db.commitments = [];
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `کل جدول تعهدات پرسنلی (${deletedCount} سند) پاکسازی شد.` };
  },

  async getPayroll(period?: string): Promise<PayrollRecord[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'payroll', 'view')) return [];
    return period ? db.payroll.filter((r) => r.period === period) : db.payroll;
  },

  async batchImportPayroll(period: string, items: any[], useRowYearMonth = true) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'payroll', 'importExcel')) return { success: false, message: 'عدم دسترسی.' };
    const pMap = new Map<string, Personnel>();
    for (const p of db.personnel) {
      const k = String(p.personnelCode || '').trim();
      if (k && !pMap.has(k)) pMap.set(k, p);
    }
    const payIdxMap = new Map<string, number>();
    db.payroll.forEach((r, i) => {
      const key = `${String(r.personnelCode || '').trim()}::${r.period}`;
      if (!payIdxMap.has(key)) payIdxMap.set(key, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const code = String(getPayrollVal(row, 'كد پرسنلي', 'کد پرسنلی', 'personnelCode') || '').trim();
      if (!code) continue;
      const rawYm = getPayrollVal(row, 'سال/ماه', 'yearMonthLabel');
      const targetPeriod = useRowYearMonth ? parseYearMonth(rawYm, String(period)) : String(period);
      const firstName = String(getPayrollVal(row, 'نام', 'firstName') || '').trim();
      const lastName = String(getPayrollVal(row, 'نام خانوادگي', 'نام خانوادگی', 'lastName') || '').trim();
      const fullNameRaw = String(getPayrollVal(row, 'نام و نام خانوادگي', 'نام و نام خانوادگی', 'fullName') || '').trim();
      const mp = pMap.get(code);
      const fullName = fullNameRaw || `${firstName} ${lastName}`.trim() || (mp ? mp.fullName : 'پرسنل');
      const rec: any = {
        period: targetPeriod, yearMonthLabel: String(rawYm || targetPeriod.replace('-', '/')),
        employeeId: String(getPayrollVal(row, 'شناسه كارمند', 'شناسه کارمند', 'employeeId') || ''),
        personnelCode: code, firstName, lastName, fullName,
        nationalId: String(getPayrollVal(row, 'كد ملي', 'کد ملی', 'nationalId') || (mp?.nationalId || '')),
        workLocation: String(getPayrollVal(row, 'محل خدمت', 'workLocation') || ''),
        department: String(getPayrollVal(row, 'واحد سازماني', 'واحد سازمانی', 'واحد', 'department') || (mp?.department || '')),
        jobTitle: String(getPayrollVal(row, 'شغل', 'jobTitle') || ''),
        position: String(getPayrollVal(row, 'پست', 'پست سازمانی', 'position') || (mp?.position || '')),
        jobGroupCode: String(getPayrollVal(row, 'کد گروه شغلي', 'کد گروه شغلی', 'jobGroupCode') || ''),
        jobGroupTitle: String(getPayrollVal(row, 'عنوان گروه شغلي', 'عنوان گروه شغلی', 'jobGroupTitle') || ''),
        employmentType: String(getPayrollVal(row, 'نوع استخدام', 'employmentType') || ''),
        effectiveDays: parseNumPayroll(getPayrollVal(row, 'کارکرد موثر', 'effectiveDays')),
        netPayable: parseNumPayroll(getPayrollVal(row, 'خالص پرداختی', 'netPayable')),
        totalBenefits: parseNumPayroll(getPayrollVal(row, 'جمع مزایا', 'totalBenefits')),
        overtimeAmount: parseNumPayroll(getPayrollVal(row, 'اضافه کاری', 'overtimeAmount')),
        fridayWorkAmount: parseNumPayroll(getPayrollVal(row, 'جمعه کاری', 'fridayWorkAmount')),
        missionAmount: parseNumPayroll(getPayrollVal(row, 'ماموریت ریالی', 'missionAmount')),
        bonusAmount: parseNumPayroll(getPayrollVal(row, 'پاداش', 'پاداشِ', 'bonusAmount')),
        incentiveAmount: parseNumPayroll(getPayrollVal(row, 'تشویقی', 'incentiveAmount')),
        otherBenefits: parseNumPayroll(getPayrollVal(row, 'سایر مزایا', 'otherBenefits')),
        arrearsAmount: parseNumPayroll(getPayrollVal(row, 'مابه التفاوت', 'arrearsAmount')),
        advanceAmount: parseNumPayroll(getPayrollVal(row, 'مساعده', 'advanceAmount')),
        totalDeductions: parseNumPayroll(getPayrollVal(row, 'جمع کسور', 'totalDeductions')),
        taxAmount: parseNumPayroll(getPayrollVal(row, 'مالیات', 'taxAmount')),
        salaryTaxAmount: parseNumPayroll(getPayrollVal(row, 'مالیات حقوق', 'salaryTaxAmount')),
        jobWage: parseNumPayroll(getPayrollVal(row, 'مزد شغل', 'jobWage')),
        totalOrderFactors: parseNumPayroll(getPayrollVal(row, 'جمع عوامل حکمی', 'جمع عوامل حكمي', 'totalOrderFactors')),
        baseSalaryOrder: parseNumPayroll(getPayrollVal(row, 'حقوق پایه(حكم-اصلي)', 'حقوق پایه(حکم-اصلی)', 'baseSalaryOrder')),
        overtimeHours: parseNumPayroll(getPayrollVal(row, 'ساعت اضافه کاری(کارکرد)', 'overtimeHours')),
        fridayWorkHours: parseNumPayroll(getPayrollVal(row, 'ساعت جمعه کاری(کارکرد)', 'fridayWorkHours')),
        costCenterCode: String(getPayrollVal(row, 'مرکز هزینه(كد تفصيل)', 'مرکز هزینه(کد تفصیل)') || ''),
        costCenterTitle: String(getPayrollVal(row, 'مرکز هزینه(عنوان تفصيل)', 'مرکز هزینه(عنوان تفصیل)') || ''),
        projectCode: String(getPayrollVal(row, 'پروژه(كد تفصيل)', 'پروژه(کد تفصیل)') || ''),
        projectTitle: String(getPayrollVal(row, 'پروژه(عنوان تفصيل)', 'پروژه(عنوان تفصیل)') || ''),
        bankName: String(getPayrollVal(row, 'نام بانک') || ''),
        bankAccount: String(getPayrollVal(row, 'شماره حساب') || ''),
        rawFields: row, updatedAt: todayFa,
      };
      const payKey = `${code}::${targetPeriod}`;
      const idx = payIdxMap.get(payKey) ?? -1;
      if (idx >= 0) { db.payroll[idx] = { ...db.payroll[idx], ...rec }; updated++; }
      else { const newIdx = db.payroll.length; db.payroll.push({ id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...rec }); payIdxMap.set(payKey, newIdx); added++; }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `فایل حقوق در پایگاه داده داخلی ذخیره شد (${added} جدید، ${updated} به‌روزرسانی).` };
  },

  async deletePayrollRecord(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'payroll', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    db.payroll = db.payroll.filter((r) => r.id !== id);
    await saveEmbeddedDb(db);
    return { success: true, message: 'رکورد حقوق حذف گردید.' };
  },

  async deletePayrollPeriod(period: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'payroll', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    db.payroll = db.payroll.filter((r) => r.period !== period);
    await saveEmbeddedDb(db);
    return { success: true, message: `تمام رکوردهای حقوق دوره ${period} حذف شدند.` };
  },

  async batchDeletePayroll(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'payroll', 'delete')) return { success: false, message: 'عدم دسترسی.' };
    const idSet = new Set(ids.map(String));
    const before = db.payroll.length;
    db.payroll = db.payroll.filter((r) => !idSet.has(r.id));
    const deletedCount = before - db.payroll.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} رکورد حقوقی حذف شد.` };
  },

  async deleteAllPayroll() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'payroll', 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی.' };
    const deletedCount = db.payroll.length;
    db.payroll = [];
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `کل جدول حقوق و دستمزد (${deletedCount} فیش) پاکسازی شد.` };
  },

  async getMiningVolumes(period?: string): Promise<MiningVolumeRecord[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'view')) return [];
    let list = db.miningVolumes || [];
    if (period) list = list.filter((v) => v.period === period);
    if (!isSuperAdmin(auth) && !hasPerm(auth, 'ceoDashboard', 'view')) {
      list = list.filter((v) => isDispatchingOrUnitAllowedEmb(auth, v.unitName));
    }
    return list;
  },

  async saveMiningVolume(record: Partial<MiningVolumeRecord>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const action = record.id ? 'edit' : 'create';
    const hasCeo = hasPerm(auth, 'ceoDashboard', action);
    const hasUnit = hasPerm(auth, 'unitOperations', action) && isDispatchingOrUnitAllowedEmb(auth, record.unitName);
    if (!hasCeo && !hasUnit) {
      return { success: false, message: 'عدم دسترسی ثبت یا ویرایش آمار حجم معدن.' };
    }
    if (!record.period || !record.unitName) {
      return { success: false, message: 'دوره و نام واحد عملیاتی الزامی است.' };
    }
    if (!Array.isArray(db.miningVolumes)) db.miningVolumes = [];
    const volumeValue = Number(record.volumeValue || 0);
    const targetVolume = Number(record.targetVolume || 0);
    const idx = record.id ? db.miningVolumes.findIndex((v) => v.id === record.id) : -1;
    const rec: MiningVolumeRecord = {
      id: idx >= 0 ? db.miningVolumes[idx].id : `mv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      period: String(record.period).trim(),
      unitName: String(record.unitName).trim(),
      activityType: String(record.activityType || 'عملیات معدنی').trim(),
      metricTitle: String(record.metricTitle || record.activityType || record.unitName).trim(),
      volumeValue: Number.isFinite(volumeValue) ? volumeValue : 0,
      targetVolume: Number.isFinite(targetVolume) ? targetVolume : 0,
      unitLabel: String(record.unitLabel || 'تن').trim(),
      status: String(record.status || (targetVolume > 0 && volumeValue >= targetVolume ? 'تحقق کامل' : 'در حال اجرا')).trim(),
      notes: String(record.notes || '').trim(),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) db.miningVolumes[idx] = rec; else db.miningVolumes.push(rec);
    await saveEmbeddedDb(db);
    return { success: true, data: rec, message: 'آمار حجم عملیات ماهانه با موفقیت ذخیره شد.' };
  },

  async batchImportMiningVolumes(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canCeo = hasPerm(auth, 'ceoDashboard', 'importExcel') || hasPerm(auth, 'ceoDashboard', 'create');
    const canUnit = hasPerm(auth, 'unitOperations', 'importExcel') || hasPerm(auth, 'unitOperations', 'create');
    if (!canCeo && !canUnit) {
      return { success: false, message: 'عدم دسترسی ورود اکسل آمار حجم عملیات.' };
    }
    if (!Array.isArray(db.miningVolumes)) db.miningVolumes = [];
    const mvIdxMap = new Map<string, number>();
    db.miningVolumes.forEach((v, i) => {
      const key = `${v.period}::${normPayrollKey(v.unitName)}::${normPayrollKey(v.metricTitle)}`;
      if (!mvIdxMap.has(key)) mvIdxMap.set(key, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const unitName = String(getPayrollVal(row, 'unitName', 'واحد عملیاتی معدن', 'واحد معدن', 'واحد') || '').trim();
      const rawPeriod = getPayrollVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه');
      const period = parseYearMonth(rawPeriod, '1403-08');
      if (!unitName) continue;
      if (!canCeo && !isDispatchingOrUnitAllowedEmb(auth, unitName)) continue;
      const activityType = String(getPayrollVal(row, 'activityType', 'نوع عملیات / فعالیت', 'نوع عملیات', 'عملیات') || 'عملیات معدنی').trim();
      const metricTitle = String(getPayrollVal(row, 'metricTitle', 'عنوان شاخص حجم', 'عنوان شاخص', 'شرح عملیات') || activityType).trim();
      const volumeValue = parseNumPayroll(getPayrollVal(row, 'volumeValue', 'حجم محقق‌شده ماه', 'حجم محقق شده', 'حجم', 'مقدار'));
      const targetVolume = parseNumPayroll(getPayrollVal(row, 'targetVolume', 'برنامه / هدف ماه', 'برنامه ماه', 'هدف ماه', 'هدف'));
      const unitLabel = String(getPayrollVal(row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') || 'تن').trim();
      const status = String(getPayrollVal(row, 'status', 'وضعیت تحقق', 'وضعیت') || (targetVolume > 0 && volumeValue >= targetVolume ? 'فراتر از برنامه' : 'در حال اجرا')).trim();
      const notes = String(getPayrollVal(row, 'notes', 'توضیحات', 'یادداشت') || '').trim();
      const mvKey = `${period}::${normPayrollKey(unitName)}::${normPayrollKey(metricTitle)}`;
      const idx = mvIdxMap.get(mvKey) ?? -1;
      const rec: MiningVolumeRecord = {
        id: idx >= 0 ? db.miningVolumes[idx].id : `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        period, unitName, activityType, metricTitle, volumeValue, targetVolume, unitLabel, status, notes,
        updatedAt: todayFa,
      };
      if (idx >= 0) { db.miningVolumes[idx] = rec; updated++; }
      else { const newIdx = db.miningVolumes.length; db.miningVolumes.push(rec); mvIdxMap.set(mvKey, newIdx); added++; }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `آمار حجم عملیات وارد شد (${added} جدید، ${updated} به‌روزرسانی).` };
  },

  async deleteMiningVolume(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    db.miningVolumes = (db.miningVolumes || []).filter((v) => v.id !== id || (!hasPerm(auth, 'ceoDashboard', 'delete') && !isDispatchingOrUnitAllowedEmb(auth, v.unitName)));
    await saveEmbeddedDb(db);
    return { success: true, message: 'ردیف آمار حجم حذف شد.' };
  },

  async batchDeleteMiningVolumes(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    const idSet = new Set(ids.map(String));
    const canAll = isSuperAdmin(auth) || hasPerm(auth, 'ceoDashboard', 'delete');
    const before = (db.miningVolumes || []).length;
    db.miningVolumes = (db.miningVolumes || []).filter((v) => !idSet.has(v.id) || (!canAll && !isDispatchingOrUnitAllowedEmb(auth, v.unitName)));
    const deletedCount = before - db.miningVolumes.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} ردیف آمار حجم حذف شد.` };
  },

  async deleteAllMiningVolumes() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی آمار حجم.' };
    const canAll = isSuperAdmin(auth) || hasPerm(auth, 'ceoDashboard', 'deleteAll');
    const before = (db.miningVolumes || []).length;
    db.miningVolumes = canAll ? [] : (db.miningVolumes || []).filter((v) => !isDispatchingOrUnitAllowedEmb(auth, v.unitName));
    const deletedCount = before - db.miningVolumes.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `جدول آمار حجم عملیات (${deletedCount} ردیف) پاکسازی شد.` };
  },

  async getMiningMachinery(): Promise<MiningMachineryRecord[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'view')) return [];
    let list = db.miningMachinery || [];
    if (!isSuperAdmin(auth) && !hasPerm(auth, 'ceoDashboard', 'view')) {
      list = list.filter((m) => isWorkshopOrUnitAllowedEmb(auth, m.unitName));
    }
    return list;
  },

  async saveMiningMachinery(record: Partial<MiningMachineryRecord>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const action = record.id ? 'edit' : 'create';
    const hasCeo = hasPerm(auth, 'ceoDashboard', action);
    const hasUnit = hasPerm(auth, 'unitOperations', action) && isWorkshopOrUnitAllowedEmb(auth, record.unitName);
    if (!hasCeo && !hasUnit) {
      return { success: false, message: 'عدم دسترسی ثبت یا ویرایش وضعیت ماشین‌آلات.' };
    }
    if (!record.machineCode || !record.machineName) {
      return { success: false, message: 'کد دستگاه و نام تجهیز الزامی است.' };
    }
    if (!Array.isArray(db.miningMachinery)) db.miningMachinery = [];
    const idx = record.id
      ? db.miningMachinery.findIndex((m) => m.id === record.id)
      : db.miningMachinery.findIndex((m) => String(m.machineCode).trim() === String(record.machineCode).trim());
    const validStatuses = ['آماده به کار', 'خراب / در تعمیرگاه', 'در انتظار قطعه', 'سرویس دوره‌ای'];
    const rawStatus = String(record.status || 'آماده به کار').trim();
    const status: any = validStatuses.includes(rawStatus)
      ? rawStatus
      : rawStatus.includes('خراب') || rawStatus.includes('تعمیرگاه')
      ? 'خراب / در تعمیرگاه'
      : rawStatus.includes('قطعه')
      ? 'در انتظار قطعه'
      : rawStatus.includes('سرویس')
      ? 'سرویس دوره‌ای'
      : 'آماده به کار';
    const rec: MiningMachineryRecord = {
      id: idx >= 0 ? db.miningMachinery[idx].id : `mm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      machineCode: String(record.machineCode).trim(),
      machineName: String(record.machineName).trim(),
      machineType: String(record.machineType || 'تجهیزات معدنی').trim(),
      unitName: String(record.unitName || 'استخراج و معدن‌کاری').trim(),
      status,
      issueDescription: String(record.issueDescription || '').trim(),
      stoppedSince: String(record.stoppedSince || '').trim(),
      estimatedReadyDate: String(record.estimatedReadyDate || '').trim(),
      operatorName: String(record.operatorName || '').trim(),
      notes: String(record.notes || '').trim(),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) db.miningMachinery[idx] = rec; else db.miningMachinery.push(rec);
    await saveEmbeddedDb(db);
    return { success: true, data: rec, message: 'وضعیت دستگاه و تعمیرگاه ذخیره شد.' };
  },

  async batchImportMiningMachinery(items: any[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canCeo = hasPerm(auth, 'ceoDashboard', 'importExcel') || hasPerm(auth, 'ceoDashboard', 'create');
    const canUnit = hasPerm(auth, 'unitOperations', 'importExcel') || hasPerm(auth, 'unitOperations', 'create');
    if (!canCeo && !canUnit) {
      return { success: false, message: 'عدم دسترسی ورود اکسل ماشین‌آلات.' };
    }
    if (!Array.isArray(db.miningMachinery)) db.miningMachinery = [];
    const mmIdxMap = new Map<string, number>();
    db.miningMachinery.forEach((m, i) => {
      const k = String(m.machineCode || '').trim();
      if (k && !mmIdxMap.has(k)) mmIdxMap.set(k, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of items || []) {
      const machineCode = String(getPayrollVal(row, 'machineCode', 'کد دستگاه / پلاک', 'کد دستگاه', 'کد تجهیز', 'پلاک تجهیز') || '').trim();
      const machineName = String(getPayrollVal(row, 'machineName', 'نام و مدل دستگاه', 'نام دستگاه', 'مدل دستگاه') || '').trim();
      if (!machineCode || !machineName) continue;
      const unitName = String(getPayrollVal(row, 'unitName', 'واحد مستقر / بهره‌بردار', 'واحد مستقر', 'واحد') || 'استخراج و معدن‌کاری').trim();
      if (!canCeo && !isWorkshopOrUnitAllowedEmb(auth, unitName)) continue;
      const rawStatus = String(getPayrollVal(row, 'status', 'وضعیت دستگاه', 'وضعیت') || 'آماده به کار').trim();
      const status: any =
        rawStatus.includes('خراب') || rawStatus.includes('تعمیرگاه')
          ? 'خراب / در تعمیرگاه'
          : rawStatus.includes('قطعه')
          ? 'در انتظار قطعه'
          : rawStatus.includes('سرویس')
          ? 'سرویس دوره‌ای'
          : 'آماده به کار';
      const idx = mmIdxMap.get(machineCode) ?? -1;
      const rec: MiningMachineryRecord = {
        id: idx >= 0 ? db.miningMachinery[idx].id : `mm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        machineCode,
        machineName,
        machineType: String(getPayrollVal(row, 'machineType', 'نوع ماشین‌آلات', 'نوع دستگاه') || 'تجهیز معدنی').trim(),
        unitName,
        status,
        issueDescription: String(getPayrollVal(row, 'issueDescription', 'شرح خرابی / وضعیت تعمیر', 'شرح خرابی') || '').trim(),
        stoppedSince: String(getPayrollVal(row, 'stoppedSince', 'تاریخ توقف / ورود به تعمیرگاه', 'تاریخ توقف') || '').trim(),
        estimatedReadyDate: String(getPayrollVal(row, 'estimatedReadyDate', 'تاریخ تخمینی آماده‌به‌کار', 'تاریخ آماده به کار') || '').trim(),
        operatorName: String(getPayrollVal(row, 'operatorName', 'اپراتور / مسئول تعمیر', 'اپراتور') || '').trim(),
        notes: String(getPayrollVal(row, 'notes', 'یادداشت', 'توضیحات') || '').trim(),
        updatedAt: todayFa,
      };
      if (idx >= 0) { db.miningMachinery[idx] = rec; updated++; }
      else { const newIdx = db.miningMachinery.length; db.miningMachinery.push(rec); mmIdxMap.set(machineCode, newIdx); added++; }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `لیست ماشین‌آلات و تعمیرگاه وارد شد (${added} جدید، ${updated} به‌روزرسانی).` };
  },

  async deleteMiningMachinery(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    db.miningMachinery = (db.miningMachinery || []).filter((m) => m.id !== id || (!hasPerm(auth, 'ceoDashboard', 'delete') && !isWorkshopOrUnitAllowedEmb(auth, m.unitName)));
    await saveEmbeddedDb(db);
    return { success: true, message: 'دستگاه از فهرست حذف شد.' };
  },

  async batchDeleteMiningMachinery(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    const idSet = new Set(ids.map(String));
    const canAll = isSuperAdmin(auth) || hasPerm(auth, 'ceoDashboard', 'delete');
    const before = (db.miningMachinery || []).length;
    db.miningMachinery = (db.miningMachinery || []).filter((m) => !idSet.has(m.id) || (!canAll && !isWorkshopOrUnitAllowedEmb(auth, m.unitName)));
    const deletedCount = before - db.miningMachinery.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} دستگاه حذف شد.` };
  },

  async deleteAllMiningMachinery() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی جدول ماشین‌آلات.' };
    const canAll = isSuperAdmin(auth) || hasPerm(auth, 'ceoDashboard', 'deleteAll');
    const before = (db.miningMachinery || []).length;
    db.miningMachinery = canAll ? [] : (db.miningMachinery || []).filter((m) => !isWorkshopOrUnitAllowedEmb(auth, m.unitName));
    const deletedCount = before - db.miningMachinery.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `لیست ماشین‌آلات و تعمیرگاه (${deletedCount} دستگاه) پاکسازی شد.` };
  },

  async getUnitReports(period?: string, unitName?: string): Promise<UnitOperationalReport[]> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'view')) return [];
    let list = db.unitReports || [];
    if (period) list = list.filter((r) => r.period === period);
    if (unitName) list = list.filter((r) => normPayrollKey(r.unitName) === normPayrollKey(unitName));
    if (!isSuperAdmin(auth) && !hasPerm(auth, 'ceoDashboard', 'view')) {
      list = list.filter((r) => isUnitAllowedEmb(auth, r.unitName));
    }
    return list;
  },

  async saveUnitReport(record: Partial<UnitOperationalReport>) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const action = record.id ? 'edit' : 'create';
    const hasCeo = hasPerm(auth, 'ceoDashboard', action);
    const hasUnit = hasPerm(auth, 'unitOperations', action) && isUnitAllowedEmb(auth, record.unitName);
    if (!hasCeo && !hasUnit) return { success: false, message: 'عدم دسترسی ثبت یا ویرایش گزارش واحد.' };
    if (!record.period || !record.unitName || !record.metricName) {
      return { success: false, message: 'دوره، نام واحد و عنوان شاخص الزامی است.' };
    }
    if (!Array.isArray(db.unitReports)) db.unitReports = [];
    const idx = record.id ? db.unitReports.findIndex((r) => r.id === record.id) : -1;
    const rec: UnitOperationalReport = {
      id: idx >= 0 ? db.unitReports[idx].id : `ur-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      period: String(record.period).trim(),
      unitName: String(record.unitName).trim(),
      reportCategory: String(record.reportCategory || 'گزارش عملیاتی واحد').trim(),
      metricName: String(record.metricName).trim(),
      actualValue: Number(record.actualValue || 0),
      previousValue: Number(record.previousValue || 0),
      targetValue: Number(record.targetValue || 0),
      unitLabel: String(record.unitLabel || 'عدد').trim(),
      status: String(record.status || 'تایید شده').trim(),
      submittedBy: String(record.submittedBy || auth?.fullName || '').trim(),
      notes: String(record.notes || '').trim(),
      rawFields: record.rawFields && typeof record.rawFields === 'object' ? record.rawFields : {},
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) db.unitReports[idx] = rec; else db.unitReports.push(rec);
    await saveEmbeddedDb(db);
    return { success: true, data: rec, message: 'گزارش عملیاتی واحد با موفقیت ذخیره شد.' };
  },

  async batchImportUnitReports(payload: { unitName?: string; period?: string; reportCategory?: string; items: any[] }) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canCeo = hasPerm(auth, 'ceoDashboard', 'importExcel') || hasPerm(auth, 'ceoDashboard', 'create');
    const canUnit = hasPerm(auth, 'unitOperations', 'importExcel') || hasPerm(auth, 'unitOperations', 'create');
    if (!canCeo && !canUnit) return { success: false, message: 'عدم دسترسی ورود اکسل گزارش واحدها.' };
    if (!Array.isArray(db.unitReports)) db.unitReports = [];
    const urIdxMap = new Map<string, number>();
    db.unitReports.forEach((r, i) => {
      const key = `${r.period}::${normPayrollKey(r.unitName)}::${normPayrollKey(r.metricName)}`;
      if (!urIdxMap.has(key)) urIdxMap.set(key, i);
    });
    const todayFa = new Date().toLocaleDateString('fa-IR');
    let added = 0; let updated = 0;
    for (const row of payload.items || []) {
      const unitName = String(getPayrollVal(row, 'unitName', 'واحد عملیاتی معدن', 'نام واحد', 'واحد', 'بخش') || payload.unitName || '').trim();
      const rawPeriod = getPayrollVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه');
      const period = parseYearMonth(rawPeriod || payload.period || '1403-08', '1403-08');
      const metricName = String(getPayrollVal(row, 'metricName', 'عنوان شاخص / فعالیت', 'شرح شاخص', 'فعالیت', 'عنوان', 'موضوع') || '').trim();
      if (!unitName || !metricName) continue;
      if (!canCeo && !isUnitAllowedEmb(auth, unitName)) continue;
      const urKey = `${period}::${normPayrollKey(unitName)}::${normPayrollKey(metricName)}`;
      const idx = urIdxMap.get(urKey) ?? -1;
      const rawFields: Record<string, string | number> = {};
      const srcRaw = row.rawFields && typeof row.rawFields === 'object' ? row.rawFields : row;
      let rawCount = 0;
      for (const [k, v] of Object.entries(srcRaw)) {
        if (rawCount >= 100) break;
        if (k.startsWith('ستون_')) continue;
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          rawFields[String(k).slice(0, 120)] = typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : String(v).slice(0, 300);
          rawCount++;
        }
      }
      const rec: UnitOperationalReport = {
        id: idx >= 0 ? db.unitReports[idx].id : `ur-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        period,
        unitName,
        reportCategory: String(getPayrollVal(row, 'reportCategory', 'دسته‌بندی گزارش', 'نوع گزارش', 'گروه فعالیت') || payload.reportCategory || 'گزارش عملیاتی واحد').trim(),
        metricName,
        actualValue: parseNumPayroll(getPayrollVal(row, 'actualValue', 'مقدار محقق‌شده', 'عملکرد ماه جاری', 'عملکرد', 'مقدار', 'مقدار فعلی')),
        previousValue: parseNumPayroll(getPayrollVal(row, 'previousValue', 'مقدار ماه قبل', 'عملکرد ماه قبل', 'دوره قبل')),
        targetValue: parseNumPayroll(getPayrollVal(row, 'targetValue', 'هدف / برنامه', 'برنامه ماه', 'هدف')),
        unitLabel: String(getPayrollVal(row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') || 'عدد').trim(),
        status: String(getPayrollVal(row, 'status', 'وضعیت گزارش', 'وضعیت') || 'تایید شده').trim(),
        submittedBy: String(getPayrollVal(row, 'submittedBy', 'ثبت‌کننده / مسئول واحد', 'مسئول واحد', 'ثبت‌کننده') || auth?.fullName || '').trim(),
        notes: String(getPayrollVal(row, 'notes', 'توضیحات / تحلیل واحد', 'توضیحات', 'یادداشت') || '').trim(),
        rawFields,
        updatedAt: todayFa,
      };
      if (idx >= 0) { db.unitReports[idx] = rec; updated++; }
      else { const newIdx = db.unitReports.length; db.unitReports.push(rec); urIdxMap.set(urKey, newIdx); added++; }
    }
    await saveEmbeddedDb(db);
    return { success: true, added, updated, data: { inserted: added, updated }, message: `گزارش اکسل واحدها با موفقیت ثبت شد (${added} جدید، ${updated} به‌روزرسانی).` };
  },

  async deleteUnitReport(id: string) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    db.unitReports = (db.unitReports || []).filter((r) => r.id !== id || (!hasPerm(auth, 'ceoDashboard', 'delete') && !isUnitAllowedEmb(auth, r.unitName)));
    await saveEmbeddedDb(db);
    return { success: true, message: 'ردیف گزارش واحد حذف شد.' };
  },

  async batchDeleteUnitReports(ids: string[]) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'delete')) return { success: false, message: 'عدم دسترسی حذف.' };
    const idSet = new Set(ids.map(String));
    const canAll = isSuperAdmin(auth) || hasPerm(auth, 'ceoDashboard', 'delete');
    const before = (db.unitReports || []).length;
    db.unitReports = (db.unitReports || []).filter((r) => !idSet.has(r.id) || (!canAll && !isUnitAllowedEmb(auth, r.unitName)));
    const deletedCount = before - db.unitReports.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `${deletedCount} ردیف گزارش واحد حذف شد.` };
  },

  async deleteAllUnitReports() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasMiningOrUnitPermEmb(auth, 'deleteAll')) return { success: false, message: 'عدم دسترسی پاکسازی گزارش واحدها.' };
    const canAll = isSuperAdmin(auth) || hasPerm(auth, 'ceoDashboard', 'deleteAll');
    const before = (db.unitReports || []).length;
    db.unitReports = canAll ? [] : (db.unitReports || []).filter((r) => !isUnitAllowedEmb(auth, r.unitName));
    const deletedCount = before - db.unitReports.length;
    await saveEmbeddedDb(db);
    return { success: true, deletedCount, message: `گزارش‌های واحدها (${deletedCount} ردیف) پاکسازی شد.` };
  },

  async getDatabaseStatus(): Promise<DatabaseStatus> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    const canStats = isSuperAdmin(auth) || hasPerm(auth, 'system', 'dashboardStats') || hasPerm(auth, 'system', 'backupDatabase') || hasPerm(auth, 'system', 'restoreDatabase');
    const canPers = canStats || hasPerm(auth, 'personnel', 'view');
    const canKar = canStats || hasPerm(auth, 'karaneh', 'view') || hasPerm(auth, 'finalKaraneh', 'view');
    const canPay = canStats || hasPerm(auth, 'payroll', 'view');
    const canUsers = canStats || hasPerm(auth, 'users', 'view');
    const canJg = canStats || hasPerm(auth, 'jobGroups', 'view');
    const canCmt = canStats || hasPerm(auth, 'commitments', 'view');
    const canMining = canStats || hasMiningOrUnitPermEmb(auth, 'view');
    const approxBytes = canStats ? utf8Bytes(JSON.stringify(db)).length : 0;
    const totalActiveUsers = db.users.filter((u) => u.isActive !== false).length;
    const totalPersonnelWithDocs = db.personnel.filter((p) => {
      const d = p.documents || {};
      return Boolean(d.nationalCardImage || (d.shenasnamehPages && d.shenasnamehPages.length > 0));
    }).length;
    const totalRelatives = db.personnel.reduce((sum, p) => sum + (Array.isArray(p.relatives) ? p.relatives.length : 0), 0);
    const payrollPeriodsCount = new Set(db.payroll.map((p) => p.period).filter(Boolean)).size;
    const karanehPeriodsCount = new Set(db.karaneh.map((k) => k.period).filter(Boolean)).size;
    return {
      storageLocation: 'پایگاه داده دائمی داخلی مرورگر (IndexedDB)',
      totalPersonnel: canPers ? db.personnel.length : 0,
      totalRelatives: canPers ? totalRelatives : 0,
      totalKaranehRecords: canKar ? db.karaneh.length : 0,
      totalPayrollRecords: canPay ? db.payroll.length : 0,
      totalUsers: canUsers ? db.users.length : 0,
      totalActiveUsers: canUsers ? totalActiveUsers : 0,
      totalPersonnelWithDocs: canPers ? totalPersonnelWithDocs : 0,
      payrollPeriodsCount: canPay ? payrollPeriodsCount : 0,
      karanehPeriodsCount: canKar ? karanehPeriodsCount : 0,
      totalJobGroups: canJg ? db.jobGroups.length : 0,
      totalJobClassifications: canJg ? db.jobClassifications.length : 0,
      totalCommitments: canCmt ? db.commitments.length : 0,
      totalArchivedCommitments: canCmt ? db.commitments.filter((c) => c.isArchived).length : 0,
      totalMiningVolumes: canMining ? (db.miningVolumes || []).length : 0,
      totalMiningMachinery: canMining ? (db.miningMachinery || []).length : 0,
      totalUnitReports: canMining ? (db.unitReports || []).length : 0,
      storageEngine: 'indexeddb-embedded',
      fileSizeBytes: approxBytes,
      lastSaved: db.lastSaved || 'هم‌اکنون',
      isLocalHost: false,
      hostPlatform: 'indexeddb-embedded',
      authProtected: true,
      firebaseProjectId: 'modern-xyston-gv0ns',
      firestoreDatabaseId: 'ai-studio-b445490f-35ad-4b58-ad86-c952f46a7166',
      schemaVersion: '5.0-negin-parto-nasr-units-hub',
    };
  },

  async downloadBackup(): Promise<boolean> {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'system', 'backupDatabase')) return false;
    const totalRelatives = db.personnel.reduce((sum, p) => sum + (Array.isArray(p.relatives) ? p.relatives.length : 0), 0);
    const backupPayload = {
      ...db,
      _backupMetadata: {
        version: '5.0-negin-parto-nasr-units-hub',
        exportedAt: new Date().toISOString(),
        modules: ['personnel', 'relatives', 'documents', 'karaneh', 'payroll', 'jobGroups', 'jobClassifications', 'commitments', 'users', 'smartDashboard', 'ceoDashboard', 'unitOperations', 'miningVolumes', 'miningMachinery', 'unitReports', 'smartExcel'],
        counts: {
          users: db.users.length,
          personnel: db.personnel.length,
          relatives: totalRelatives,
          karaneh: db.karaneh.length,
          payroll: db.payroll.length,
          jobGroups: db.jobGroups.length,
          jobClassifications: db.jobClassifications.length,
          commitments: db.commitments.length,
          miningVolumes: (db.miningVolumes || []).length,
          miningMachinery: (db.miningMachinery || []).length,
          unitReports: (db.unitReports || []).length,
        },
      },
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hr_database_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },

  async restoreDatabase(backupData: any) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'system', 'restoreDatabase')) return { success: false, message: 'عدم دسترسی بازیابی.' };
    if (!backupData || !Array.isArray(backupData.users) || !Array.isArray(backupData.personnel)) {
      return { success: false, message: 'ساختار فایل پشتیبان معتبر نیست.' };
    }
    const nextUsers = backupData.users.map((u: any) => {
      const pass = String(u.password || '');
      const normalizedPerms = isSuperAdmin(u) ? getFullAdminPermissions() : normalizePermissions(u.permissions);
      if (pass && !pass.startsWith('sha256$') && !pass.startsWith('scrypt$') && !pass.startsWith('$2y$')) {
        return { ...u, permissions: normalizedPerms, password: hashPasswordClient(pass) };
      }
      return { ...u, permissions: normalizedPerms };
    });
    await saveEmbeddedDb({
      users: nextUsers,
      jobGroups: backupData.jobGroups || [],
      jobClassifications: backupData.jobClassifications || [],
      personnel: backupData.personnel || [],
      karaneh: backupData.karaneh || [],
      commitments: backupData.commitments || [],
      payroll: backupData.payroll || [],
      miningVolumes: backupData.miningVolumes || [],
      miningMachinery: backupData.miningMachinery || [],
      unitReports: backupData.unitReports || [],
    });
    return { success: true, message: 'پایگاه داده سیستم (تمامی ماژول‌ها، مجوزها و اسناد) با موفقیت بازیابی گردید.' };
  },

  async exportDatabaseSnapshot() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!isSuperAdmin(auth) && !hasPerm(auth, 'system', 'backupDatabase')) {
      return { success: false, message: 'عدم دسترسی.' };
    }
    return {
      success: true,
      data: {
        users: db.users.map(stripPass),
        personnel: db.personnel,
        karaneh: db.karaneh,
        jobGroups: db.jobGroups,
        jobClassifications: db.jobClassifications,
        commitments: db.commitments,
        payroll: db.payroll,
        miningVolumes: db.miningVolumes || [],
        miningMachinery: db.miningMachinery || [],
        unitReports: db.unitReports || [],
      },
    };
  },

  async mergeFirestoreSnapshot(incoming: any) {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'system', 'restoreDatabase')) return { success: false, message: 'عدم دسترسی.' };
    const mergeById = (existingArr: any[], incomingArr: any[]) => {
      const map = new Map<string, any>();
      for (const item of existingArr || []) if (item?.id) map.set(String(item.id), item);
      for (const item of incomingArr || []) {
        if (!item?.id) continue;
        map.set(String(item.id), { ...(map.get(String(item.id)) || {}), ...item });
      }
      return Array.from(map.values());
    };
    if (Array.isArray(incoming.personnel)) db.personnel = mergeById(db.personnel, incoming.personnel);
    if (Array.isArray(incoming.karaneh)) db.karaneh = mergeById(db.karaneh, incoming.karaneh);
    if (Array.isArray(incoming.jobGroups)) db.jobGroups = mergeById(db.jobGroups, incoming.jobGroups);
    if (Array.isArray(incoming.jobClassifications)) db.jobClassifications = mergeById(db.jobClassifications, incoming.jobClassifications);
    if (Array.isArray(incoming.commitments)) db.commitments = mergeById(db.commitments, incoming.commitments);
    if (Array.isArray(incoming.payroll)) db.payroll = mergeById(db.payroll, incoming.payroll);
    if (Array.isArray(incoming.miningVolumes)) db.miningVolumes = mergeById(db.miningVolumes || [], incoming.miningVolumes);
    if (Array.isArray(incoming.miningMachinery)) db.miningMachinery = mergeById(db.miningMachinery || [], incoming.miningMachinery);
    if (Array.isArray(incoming.unitReports)) db.unitReports = mergeById(db.unitReports || [], incoming.unitReports);
    if (Array.isArray(incoming.users)) {
      const uMap = new Map(db.users.map((u) => [String(u.id), u]));
      for (const u of incoming.users) {
        if (!u?.id || u.username === 'javadabadiyan') continue;
        const prev = uMap.get(String(u.id));
        const normalizedPerms = isSuperAdmin(u) ? getFullAdminPermissions() : normalizePermissions(u.permissions);
        uMap.set(
          String(u.id),
          prev
            ? { ...prev, ...u, permissions: normalizedPerms, password: prev.password }
            : { ...u, permissions: normalizedPerms, password: hashPasswordClient('12345678') }
        );
      }
      db.users = Array.from(uMap.values());
    }
    await saveEmbeddedDb(db);
    return { success: true, message: 'اطلاعات ابری با موفقیت در پایگاه داده داخلی ادغام شد.' };
  },

  async resetDemo() {
    const db = await loadEmbeddedDb();
    const auth = await getCurrentAuthUser(db);
    if (!hasPerm(auth, 'system', 'restoreDatabase')) return { success: false, message: 'عدم دسترسی.' };
    const initial = getInitialEmbeddedDatabase();
    await saveEmbeddedDb(initial);
    return { success: true, message: 'داده‌های اولیه با موفقیت بازنشانی شدند.' };
  },
};
