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
import { embeddedDb } from './embeddedDb';

export type StorageEngine = 'node' | 'php' | 'cloudflare' | 'indexeddb';

const LS_CLOUDFLARE_API_URL_KEY = 'npn_cloudflare_api_url_v1';

const DEFAULT_CLOUDFLARE_API_URL = 'https://neginparto-api.ci-runner-223bd6.workers.dev';

let detectedEngine: StorageEngine | null = null;
let engineDetectPromise: Promise<StorageEngine> | null = null;

function toAsciiDigits(raw: string): string {
  return String(raw || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function normalizeCloudflareUrl(raw: string): string {
  const trimmed = toAsciiDigits(String(raw || ''))
    .replace(/[\u200c\u200e\u200f\ufeff]/g, '')
    .trim()
    .replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function getCloudflareApiUrl(): string {
  try {
    const lsVal = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_CLOUDFLARE_API_URL_KEY) || '' : '';
    if (lsVal.trim()) return normalizeCloudflareUrl(lsVal);
  } catch {
    // ignore storage read error
  }
  const envVal = (import.meta as any)?.env?.VITE_CLOUDFLARE_API_URL || '';
  if (String(envVal).trim()) {
    return normalizeCloudflareUrl(String(envVal));
  }
  return DEFAULT_CLOUDFLARE_API_URL;
}

export function setCloudflareApiUrl(rawUrl: string): string {
  const normalized = normalizeCloudflareUrl(rawUrl);
  try {
    if (normalized) {
      localStorage.setItem(LS_CLOUDFLARE_API_URL_KEY, normalized);
    } else {
      localStorage.removeItem(LS_CLOUDFLARE_API_URL_KEY);
    }
  } catch {
    // ignore storage write error
  }
  resetDetectedEngine();
  return normalized;
}

export function resetDetectedEngine(): void {
  detectedEngine = null;
  engineDetectPromise = null;
}

export async function testCloudflareConnection(rawUrl: string): Promise<{ ok: boolean; url: string; message: string }> {
  const url = normalizeCloudflareUrl(rawUrl);
  if (!url) {
    return { ok: false, url: '', message: 'آدرس Cloudflare Worker را وارد کنید.' };
  }
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        url,
        message: `سرور Cloudflare Worker خطای HTTP ${res.status} برگرداند. Binding دیتابیس D1 یا وضعیت Worker را بررسی کنید.`,
      };
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return {
        ok: false,
        url,
        message: 'آدرس واردشده پاسخ JSON برنگرداند. مطمئن شوید آدرس صحیح *.workers.dev را وارد کرده‌اید.',
      };
    }

    const json: any = await res.json().catch(() => null);
    if (json && json.success === true && json.engine === 'cloudflare') {
      return { ok: true, url, message: 'اتصال به سرور Cloudflare Worker و دیتابیس D1 با موفقیت برقرار شد.' };
    }
    return {
      ok: false,
      url,
      message: json?.message || 'پاسخ سلامت سرویس کلودفلر معتبر نیست.',
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      ok: false,
      url,
      message: isAbort
        ? 'زمان انتظار برای اتصال به Cloudflare Worker به پایان رسید (Timeout). اتصال اینترنت را بررسی کنید.'
        : 'امکان برقراری ارتباط شبکه‌ای با Cloudflare Worker وجود ندارد. آدرس یا دسترسی اینترنت را بررسی کنید.',
    };
  }
}

async function probeJsonEndpoint(
  url: string,
  expectedEngine: 'node' | 'php' | 'cloudflare',
  timeoutMs = 7500
): Promise<boolean> {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return false;
    const json = await res.json();
    return Boolean(json && json.success === true && json.engine === expectedEngine);
  } catch {
    return false;
  }
}

export async function detectStorageEngine(): Promise<StorageEngine> {
  if (detectedEngine) return detectedEngine;
  if (!engineDetectPromise) {
    engineDetectPromise = (async () => {
      const cfUrl = getCloudflareApiUrl();

      // Always prioritize the shared Cloudflare D1 database across ALL browsers, phones, previews, and GitHub Pages
      if (cfUrl) {
        if (await probeJsonEndpoint(`${cfUrl}/api/health`, 'cloudflare', 6500)) {
          detectedEngine = 'cloudflare';
          return 'cloudflare';
        }
        await new Promise((r) => setTimeout(r, 300));
        if (await probeJsonEndpoint(`${cfUrl}/api/health`, 'cloudflare', 8000)) {
          detectedEngine = 'cloudflare';
          return 'cloudflare';
        }
      }

      if (await probeJsonEndpoint('./api/health', 'node', 2500)) {
        detectedEngine = 'node';
        return 'node';
      }
      if (await probeJsonEndpoint('./api.php?r=/health', 'php', 2500)) {
        detectedEngine = 'php';
        return 'php';
      }

      // Never permanently lock into browser-local IndexedDB when Cloudflare is configured;
      // allow subsequent calls to re-detect Cloudflare once network recovers.
      if (cfUrl) {
        engineDetectPromise = null;
        return 'cloudflare';
      }

      detectedEngine = 'indexeddb';
      return 'indexeddb';
    })();
  }
  return engineDetectPromise;
}

export function getDetectedEngine(): StorageEngine | null {
  return detectedEngine;
}

function getHeaders(extraTokenHeaders = false): Record<string, string> {
  const token = localStorage.getItem('hr_auth_token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    if (extraTokenHeaders) {
      headers['X-HR-Auth'] = `Bearer ${token}`;
    }
  }
  return headers;
}

function buildPhpUrl(route: string, method: string): string {
  const [rawPath, rawQuery] = route.split('?');
  const params = new URLSearchParams(rawQuery || '');
  params.set('r', rawPath.startsWith('/') ? rawPath : `/${rawPath}`);
  if (method !== 'GET' && method !== 'POST') {
    params.set('_method', method);
  }
  return `./api.php?${params.toString()}`;
}

async function callBackend(
  route: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: any; skipAuthRedirect?: boolean } = {}
): Promise<any> {
  const engine = await detectStorageEngine();
  if (engine === 'indexeddb') {
    throw new Error('USE_EMBEDDED');
  }

  const method = options.method || 'GET';
  const isPhp = engine === 'php';
  const isCloudflare = engine === 'cloudflare';
  const url = isPhp
    ? buildPhpUrl(route, method)
    : isCloudflare
    ? `${getCloudflareApiUrl()}/api${route}`
    : `./api${route}`;
  const fetchMethod = isPhp && method !== 'GET' ? 'POST' : method;

  let res: Response;
  try {
    res = await fetch(url, {
      method: fetchMethod,
      headers: getHeaders(isPhp),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (networkErr: any) {
    const isCorsOrOffline = networkErr instanceof TypeError;
    return {
      success: false,
      networkError: true,
      message: isCorsOrOffline
        ? isCloudflare
          ? 'خطای ارتباط با سرور Cloudflare Worker. اتصال اینترنت، آدرس Worker یا حجم درخواست را بررسی کنید.'
          : 'خطای ارتباط شبکه‌ای با سرور پایگاه داده.'
        : networkErr?.message || 'خطا در ارسال درخواست به سرور.',
    };
  }

  if (res.status === 401 && !options.skipAuthRedirect) {
    window.dispatchEvent(new CustomEvent('hr:unauthorized'));
  }

  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (!res.ok && parsed && typeof parsed === 'object' && parsed.success !== false) {
      return { ...parsed, success: false, status: res.status };
    }
    return parsed;
  } catch {
    const isCfWorkerLimit = res.status === 503 || res.status === 500 || /Worker|exceeded|1102/i.test(text);
    return {
      success: false,
      status: res.status,
      message: isCfWorkerLimit
        ? `خطای سرور (کد ${res.status}): پردازش یا محدودیت منابع سرور کلودفلر رخ داد. لطفاً بخش‌های کوچک‌تر یا نسخه به‌روز Worker را بررسی کنید.`
        : `پاسخ نامعتبر از سرور دریافت شد (کد وضعیت ${res.status}).`,
    };
  }
}

function compactPayrollItemForUpload(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const raw = item.rawFields;
  if (!raw || typeof raw !== 'object') return item;
  const compactRaw: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    compactRaw[k] = v;
  }
  return { ...item, rawFields: compactRaw };
}

async function sendBatchInChunks(
  items: any[],
  chunkSize: number,
  sendChunk: (chunk: any[], chunkIndex: number, totalChunks: number) => Promise<any>
): Promise<any> {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: 'هیچ ردیف معتبری در فایل اکسل برای ثبت وجود ندارد.' };
  }

  const totalChunks = Math.ceil(items.length / chunkSize);
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;
  let totalAddedRelatives = 0;
  let lastMessage = '';

  const sendAdaptiveSlice = async (
    slice: any[],
    chunkIndex: number,
    totalChunks: number,
    depth = 0
  ): Promise<any> => {
    const res = await sendChunk(slice, chunkIndex, totalChunks);
    if (res && res.success) return res;

    const isRetryable =
      Boolean(res?.networkError) || res?.status === 500 || res?.status === 502 || res?.status === 503 || res?.status === 504;

    if (isRetryable && slice.length > 5 && depth < 2) {
      const mid = Math.ceil(slice.length / 2);
      const left = await sendAdaptiveSlice(slice.slice(0, mid), chunkIndex, totalChunks, depth + 1);
      if (!left?.success) return left;
      const right = await sendAdaptiveSlice(slice.slice(mid), chunkIndex, totalChunks, depth + 1);
      if (!right?.success) return right;
      const ld = left.data || {};
      const rd = right.data || {};
      return {
        success: true,
        message: right.message || left.message,
        data: {
          inserted: Number(ld.inserted || 0) + Number(rd.inserted || 0),
          updated: Number(ld.updated || 0) + Number(rd.updated || 0),
          skipped: Number(ld.skipped || 0) + Number(rd.skipped || 0),
          matched: Number(ld.matched || 0) + Number(rd.matched || 0),
          unmatched: Number(ld.unmatched || 0) + Number(rd.unmatched || 0),
          addedRelatives: Number(ld.addedRelatives || 0) + Number(rd.addedRelatives || 0),
        },
      };
    }

    if (isRetryable && depth === 0) {
      await new Promise((r) => setTimeout(r, 350));
      return sendChunk(slice, chunkIndex, totalChunks);
    }

    return res;
  };

  for (let i = 0; i < totalChunks; i++) {
    const slice = items.slice(i * chunkSize, (i + 1) * chunkSize);
    const res = await sendAdaptiveSlice(slice, i, totalChunks);
    if (!res || !res.success) {
      const baseMsg = res?.message || 'خطا در ثبت اطلاعات در پایگاه داده.';
      const progressNote =
        totalChunks > 1 ? ` (توقف در دسته ${i + 1} از ${totalChunks})` : '';
      return {
        success: false,
        message: `${baseMsg}${progressNote}`,
        data: res?.data,
      };
    }
    const d = res.data || {};
    totalInserted += Number(d.inserted || 0);
    totalUpdated += Number(d.updated || 0);
    totalSkipped += Number(d.skipped || 0);
    totalMatched += Number(d.matched || 0);
    totalUnmatched += Number(d.unmatched || 0);
    totalAddedRelatives += Number(d.addedRelatives || 0);
    if (res.message) lastMessage = res.message;
  }

  if (totalChunks === 1 && lastMessage) {
    return {
      success: true,
      message: lastMessage,
      data: {
        totalProcessed: items.length,
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        matched: totalMatched,
        unmatched: totalUnmatched,
        addedRelatives: totalAddedRelatives,
      },
    };
  }

  const parts: string[] = [];
  if (totalInserted > 0) parts.push(`${totalInserted} ردیف جدید`);
  if (totalUpdated > 0) parts.push(`${totalUpdated} ردیف به‌روزرسانی`);
  if (totalAddedRelatives > 0) parts.push(`${totalAddedRelatives} بستگان`);
  if (totalMatched > 0) parts.push(`${totalMatched} ردیف منطبق`);
  if (totalSkipped > 0) parts.push(`${totalSkipped} ردیف ردشده`);
  const summaryMsg =
    parts.length > 0
      ? `بارگذاری اکسل با موفقیت انجام شد (${parts.join('، ')}).`
      : lastMessage || `تعداد ${items.length} ردیف با موفقیت در پایگاه داده ثبت شد.`;

  return {
    success: true,
    message: summaryMsg,
    data: {
      totalProcessed: items.length,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
      matched: totalMatched,
      unmatched: totalUnmatched,
      addedRelatives: totalAddedRelatives,
    },
  };
}

export const api = {
  detectEngine: detectStorageEngine,

  // Auth
  async login(username: string, password: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.login(username, password);
    return callBackend('/auth/login', {
      method: 'POST',
      body: { username, password },
      skipAuthRedirect: true,
    });
  },

  async firebaseLogin(idToken: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.firebaseLogin(idToken);
    return callBackend('/auth/firebase-login', {
      method: 'POST',
      body: { idToken },
      skipAuthRedirect: true,
    });
  },

  async verifySession() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.verifySession();
    return callBackend('/auth/me');
  },

  // Users
  async getUsers(): Promise<User[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getUsers();
    const json = await callBackend('/users');
    return json.data || [];
  },

  async createUser(user: Partial<User> & { password?: string }) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.createUser(user);
    return callBackend('/users', { method: 'POST', body: user });
  },

  async updateUser(id: string, user: Partial<User> & { password?: string }) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.updateUser(id, user);
    return callBackend(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: user });
  },

  async deleteUser(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteUser(id);
    return callBackend(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchImportUsers(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportUsers(items);
    return sendBatchInChunks(items, 15, (chunk) =>
      callBackend('/users/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async batchDeleteUsers(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteUsers(ids);
    return callBackend('/users/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllUsers() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllUsers();
    return callBackend('/users/delete-all', { method: 'POST' });
  },

  // Personnel
  async getPersonnel(): Promise<Personnel[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getPersonnel();
    const json = await callBackend('/personnel');
    return json.data || [];
  },

  async createPersonnel(personnel: Partial<Personnel>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.createPersonnel(personnel);
    return callBackend('/personnel', { method: 'POST', body: personnel });
  },

  async updatePersonnel(id: string, personnel: Partial<Personnel>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.updatePersonnel(id, personnel);
    return callBackend(`/personnel/${encodeURIComponent(id)}`, { method: 'PUT', body: personnel });
  },

  async deletePersonnel(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deletePersonnel(id);
    return callBackend(`/personnel/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchImportPersonnel(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportPersonnel(items);
    return sendBatchInChunks(items, 35, (chunk) =>
      callBackend('/personnel/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async batchDeletePersonnel(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeletePersonnel(ids);
    return callBackend('/personnel/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllPersonnel() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllPersonnel();
    return callBackend('/personnel/delete-all', { method: 'POST' });
  },

  async batchImportRelatives(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportRelatives(items);
    return sendBatchInChunks(items, 35, (chunk) =>
      callBackend('/personnel/relatives/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async deleteAllRelatives() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllRelatives();
    return callBackend('/personnel/relatives/delete-all', { method: 'POST' });
  },

  // Karaneh
  async getKaraneh(period?: string): Promise<KaranehRecord[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getKaraneh(period);
    const route = period ? `/karaneh?period=${encodeURIComponent(period)}` : '/karaneh';
    const json = await callBackend(route);
    return json.data || [];
  },

  async getKaranehComparison(currentPeriod: string, previousPeriod: string): Promise<{
    currentPeriod: string;
    previousPeriod: string;
    comparisonRows: KaranehComparisonRow[];
    summary: {
      totalEmployees: number;
      totalCurrent: number;
      totalPrevious: number;
      totalDiff: number;
      overallGrowthPercent: number;
      countIncreased: number;
      countDecreased: number;
      countUnchanged: number;
      countNew: number;
    };
  }> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getKaranehComparison(currentPeriod, previousPeriod);
    const route = `/karaneh/comparison?currentPeriod=${encodeURIComponent(currentPeriod)}&previousPeriod=${encodeURIComponent(previousPeriod)}`;
    const json = await callBackend(route);
    return json.data;
  },

  async saveKaraneh(record: Partial<KaranehRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveKaraneh(record);
    return callBackend('/karaneh', { method: 'POST', body: record });
  },

  async batchImportKaraneh(period: string, items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportKaraneh(period, items);
    return sendBatchInChunks(items, 40, (chunk) =>
      callBackend('/karaneh/batch-import', { method: 'POST', body: { period, items: chunk } })
    );
  },

  async deleteKaraneh(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteKaraneh(id);
    return callBackend(`/karaneh/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchDeleteKaraneh(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteKaraneh(ids);
    return callBackend('/karaneh/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllKaraneh(period?: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllKaraneh(period);
    return callBackend('/karaneh/delete-all', { method: 'POST', body: period ? { period } : {} });
  },

  // Job Groups
  async getJobGroups(): Promise<JobGroup[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getJobGroups();
    const json = await callBackend('/job-groups');
    return json.data || [];
  },

  async createJobGroup(group: Partial<JobGroup>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.createJobGroup(group);
    return callBackend('/job-groups', { method: 'POST', body: group });
  },

  async updateJobGroup(id: string, group: Partial<JobGroup>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.updateJobGroup(id, group);
    return callBackend(`/job-groups/${encodeURIComponent(id)}`, { method: 'PUT', body: group });
  },

  async deleteJobGroup(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteJobGroup(id);
    return callBackend(`/job-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchDeleteJobGroups(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteJobGroups(ids);
    return callBackend('/job-groups/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllJobGroups() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllJobGroups();
    return callBackend('/job-groups/delete-all', { method: 'POST' });
  },

  // Job Classifications (18-column table)
  async getJobClassifications(): Promise<JobClassificationRecord[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getJobClassifications();
    const json = await callBackend('/job-classifications');
    return json.data || [];
  },

  async createJobClassification(record: Partial<JobClassificationRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.createJobClassification(record);
    return callBackend('/job-classifications', { method: 'POST', body: record });
  },

  async updateJobClassification(id: string, record: Partial<JobClassificationRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.updateJobClassification(id, record);
    return callBackend(`/job-classifications/${encodeURIComponent(id)}`, { method: 'PUT', body: record });
  },

  async deleteJobClassification(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteJobClassification(id);
    return callBackend(`/job-classifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchImportJobClassifications(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportJobClassifications(items);
    return sendBatchInChunks(items, 40, (chunk) =>
      callBackend('/job-classifications/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async batchDeleteJobClassifications(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteJobClassifications(ids);
    return callBackend('/job-classifications/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllJobClassifications() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllJobClassifications();
    return callBackend('/job-classifications/delete-all', { method: 'POST' });
  },

  // Commitments
  async getCommitments(): Promise<PersonnelCommitment[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getCommitments();
    const json = await callBackend('/commitments');
    return json.data || [];
  },

  async createCommitment(commitment: Partial<PersonnelCommitment>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.createCommitment(commitment);
    return callBackend('/commitments', { method: 'POST', body: commitment });
  },

  async updateCommitment(id: string, commitment: Partial<PersonnelCommitment>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.updateCommitment(id, commitment);
    return callBackend(`/commitments/${encodeURIComponent(id)}`, { method: 'PUT', body: commitment });
  },

  async deleteCommitment(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteCommitment(id);
    return callBackend(`/commitments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchImportCommitments(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportCommitments(items);
    return sendBatchInChunks(items, 40, (chunk) =>
      callBackend('/commitments/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async batchDeleteCommitments(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteCommitments(ids);
    return callBackend('/commitments/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllCommitments() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllCommitments();
    return callBackend('/commitments/delete-all', { method: 'POST' });
  },

  // Payroll (حقوق و دستمزد)
  async getPayroll(period?: string): Promise<PayrollRecord[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getPayroll(period);
    const route = period ? `/payroll?period=${encodeURIComponent(period)}` : '/payroll';
    const json = await callBackend(route);
    return json.data || [];
  },

  async batchImportPayroll(period: string, items: any[], useRowYearMonth = true) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportPayroll(period, items, useRowYearMonth);
    const compacted = Array.isArray(items) ? items.map(compactPayrollItemForUpload) : items;
    return sendBatchInChunks(compacted, 15, (chunk) =>
      callBackend('/payroll/batch-import', { method: 'POST', body: { period, useRowYearMonth, items: chunk } })
    );
  },

  async deletePayrollRecord(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deletePayrollRecord(id);
    return callBackend(`/payroll/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async deletePayrollPeriod(period: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deletePayrollPeriod(period);
    return callBackend(`/payroll/by-period/${encodeURIComponent(period)}`, { method: 'DELETE' });
  },

  async batchDeletePayroll(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeletePayroll(ids);
    return callBackend('/payroll/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllPayroll() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllPayroll();
    return callBackend('/payroll/delete-all', { method: 'POST' });
  },

  // Mining Volumes & Workshop Machinery (داشبورد راهبردی مدیرعامل)
  async getMiningVolumes(period?: string): Promise<MiningVolumeRecord[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getMiningVolumes(period);
    const route = period ? `/mining-volumes?period=${encodeURIComponent(period)}` : '/mining-volumes';
    const json = await callBackend(route);
    return json.data || [];
  },

  async saveMiningVolume(record: Partial<MiningVolumeRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveMiningVolume(record);
    return callBackend('/mining-volumes', { method: 'POST', body: record });
  },

  async batchImportMiningVolumes(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportMiningVolumes(items);
    return sendBatchInChunks(items, 40, (chunk) =>
      callBackend('/mining-volumes/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async deleteMiningVolume(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteMiningVolume(id);
    return callBackend(`/mining-volumes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchDeleteMiningVolumes(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteMiningVolumes(ids);
    return callBackend('/mining-volumes/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllMiningVolumes() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllMiningVolumes();
    return callBackend('/mining-volumes/delete-all', { method: 'POST' });
  },

  async getMiningMachinery(): Promise<MiningMachineryRecord[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getMiningMachinery();
    const json = await callBackend('/mining-machinery');
    return json.data || [];
  },

  async saveMiningMachinery(record: Partial<MiningMachineryRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveMiningMachinery(record);
    return callBackend('/mining-machinery', { method: 'POST', body: record });
  },

  async batchImportMiningMachinery(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportMiningMachinery(items);
    return sendBatchInChunks(items, 40, (chunk) =>
      callBackend('/mining-machinery/batch-import', { method: 'POST', body: { items: chunk } })
    );
  },

  async deleteMiningMachinery(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteMiningMachinery(id);
    return callBackend(`/mining-machinery/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchDeleteMiningMachinery(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteMiningMachinery(ids);
    return callBackend('/mining-machinery/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllMiningMachinery() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllMiningMachinery();
    return callBackend('/mining-machinery/delete-all', { method: 'POST' });
  },

  // Per-Unit Operational Reports & Excel Uploads
  async getUnitReports(period?: string, unitName?: string): Promise<UnitOperationalReport[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getUnitReports(period, unitName);
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (unitName) params.set('unitName', unitName);
    const qs = params.toString();
    const route = qs ? `/unit-reports?${qs}` : '/unit-reports';
    const json = await callBackend(route);
    return json.data || [];
  },

  async saveUnitReport(record: Partial<UnitOperationalReport>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveUnitReport(record);
    return callBackend('/unit-reports', { method: 'POST', body: record });
  },

  async batchImportUnitReports(payload: { unitName?: string; period?: string; reportCategory?: string; items: any[] }) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchImportUnitReports(payload);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return sendBatchInChunks(items, 25, (chunk) =>
      callBackend('/unit-reports/batch-import', {
        method: 'POST',
        body: { ...payload, items: chunk },
      })
    );
  },

  async deleteUnitReport(id: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteUnitReport(id);
    return callBackend(`/unit-reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async batchDeleteUnitReports(ids: string[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.batchDeleteUnitReports(ids);
    return callBackend('/unit-reports/batch-delete', { method: 'POST', body: { ids } });
  },

  async deleteAllUnitReports() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllUnitReports();
    return callBackend('/unit-reports/delete-all', { method: 'POST' });
  },

  // Database status, fast single-request bootstrap & real-time sync version
  async getSyncVersion(): Promise<{ syncVersion: string; lastSaved?: string } | null> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return null;
    if (engine === 'cloudflare') {
      const cfUrl = getCloudflareApiUrl();
      try {
        const res = await fetch(`${cfUrl}/api/sync-version`, {
          method: 'GET',
          headers: getHeaders(false),
          cache: 'no-store',
        });
        if (res.ok) {
          const json: any = await res.json().catch(() => null);
          if (json?.success && json?.data?.syncVersion) {
            return {
              syncVersion: String(json.data.syncVersion),
              lastSaved: json.data.lastSaved,
            };
          }
        }
        if (res.status === 404) {
          // Fallback to /health on older Worker deployments
          const hRes = await fetch(`${cfUrl}/api/health`, { cache: 'no-store' });
          const hJson: any = await hRes.json().catch(() => null);
          if (hJson?.syncVersion) {
            return { syncVersion: String(hJson.syncVersion) };
          }
        }
      } catch {
        return null;
      }
    }
    return null;
  },

  async getBootstrapData(): Promise<{
    personnel: Personnel[];
    karaneh: KaranehRecord[];
    payroll: PayrollRecord[];
    jobGroups: JobGroup[];
    jobClassifications: JobClassificationRecord[];
    commitments: PersonnelCommitment[];
    miningVolumes: MiningVolumeRecord[];
    miningMachinery: MiningMachineryRecord[];
    unitReports: UnitOperationalReport[];
    users: User[];
    dbStatus: DatabaseStatus | null;
    syncVersion?: string;
  }> {
    const engine = await detectStorageEngine();
    if (engine === 'cloudflare') {
      const json = await callBackend('/bootstrap');
      if (json?.success && json?.data) {
        return json.data;
      }
    }

    const [pData, kData, payData, jData, jcData, cData, volData, machData, urData, uData, sData] = await Promise.all([
      api.getPersonnel(),
      api.getKaraneh(),
      api.getPayroll(),
      api.getJobGroups(),
      api.getJobClassifications(),
      api.getCommitments(),
      api.getMiningVolumes(),
      api.getMiningMachinery(),
      api.getUnitReports(),
      api.getUsers(),
      api.getDatabaseStatus(),
    ]);

    return {
      personnel: pData || [],
      karaneh: kData || [],
      payroll: payData || [],
      jobGroups: jData || [],
      jobClassifications: jcData || [],
      commitments: cData || [],
      miningVolumes: volData || [],
      miningMachinery: machData || [],
      unitReports: urData || [],
      users: uData || [],
      dbStatus: sData || null,
      syncVersion: (sData as any)?.syncVersion,
    };
  },

  async getDatabaseStatus(): Promise<DatabaseStatus> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getDatabaseStatus();
    const json = await callBackend('/database/status');
    return json.data;
  },

  async downloadBackup(): Promise<boolean> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.downloadBackup();
    const url =
      engine === 'php'
        ? buildPhpUrl('/database/backup', 'GET')
        : engine === 'cloudflare'
        ? `${getCloudflareApiUrl()}/api/database/backup`
        : './api/database/backup';
    const res = await fetch(url, { headers: getHeaders(engine === 'php') });
    if (!res.ok) return false;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `hr_database_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(blobUrl);
    return true;
  },

  async restoreDatabase(backupData: any) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.restoreDatabase(backupData);
    return callBackend('/database/restore', { method: 'POST', body: backupData });
  },

  async exportDatabaseSnapshot() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.exportDatabaseSnapshot();
    return callBackend('/database/export-snapshot');
  },

  async mergeFirestoreSnapshot(snapshot: any) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.mergeFirestoreSnapshot(snapshot);
    return callBackend('/database/merge-firestore', { method: 'POST', body: snapshot });
  },

  async resetDemo() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.resetDemo();
    return callBackend('/database/reset-demo', { method: 'POST' });
  },

  async getEmailBackupConfig() {
    const engine = await detectStorageEngine();
    if (engine !== 'node') {
      return { success: false, supported: false };
    }
    const res = await callBackend('/backup/email-config');
    return { ...res, supported: true };
  },

  async saveEmailBackupConfig(config: Record<string, any>) {
    const engine = await detectStorageEngine();
    if (engine !== 'node') {
      return { success: false, supported: false, message: 'ارسال ایمیل مستقیم نیازمند سرور Node.js یا GitHub Actions است.' };
    }
    return callBackend('/backup/email-config', { method: 'POST', body: config });
  },

  async sendBackupEmailNow() {
    const engine = await detectStorageEngine();
    if (engine !== 'node') {
      return { success: false, supported: false, message: 'در حالت استاتیک GitHub Pages، از گردش‌کار روزانه GitHub Actions یا دانلود دستی استفاده کنید.' };
    }
    return callBackend('/backup/send-email-now', { method: 'POST' });
  },
};
