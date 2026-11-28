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
  SecurityAuditLog,
} from '../types';
import { embeddedDb } from './embeddedDb';
import { normalizePermissions } from '../utils/permissions';

export type StorageEngine = 'node' | 'php' | 'cloudflare' | 'indexeddb';

export interface BatchImportProgress {
  active: boolean;
  processedRows: number;
  totalRows: number;
  completedChunks: number;
  totalChunks: number;
  savedRows: number;
  failedRows: number;
}

const DEFAULT_BATCH_PROGRESS: BatchImportProgress = {
  active: false,
  processedRows: 0,
  totalRows: 0,
  completedChunks: 0,
  totalChunks: 0,
  savedRows: 0,
  failedRows: 0,
};

let activeBatchImportCount = 0;
let batchImportProgressState: BatchImportProgress = { ...DEFAULT_BATCH_PROGRESS };
const batchProgressListeners = new Set<(p: BatchImportProgress) => void>();

function emitBatchImportProgress(next: BatchImportProgress): void {
  batchImportProgressState = next;
  for (const listener of batchProgressListeners) {
    try {
      listener(next);
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeBatchImportProgress(listener: (p: BatchImportProgress) => void): () => void {
  batchProgressListeners.add(listener);
  try {
    listener(batchImportProgressState);
  } catch {
    // ignore
  }
  return () => {
    batchProgressListeners.delete(listener);
  };
}

export function isBatchImportActive(): boolean {
  return activeBatchImportCount > 0 || batchImportProgressState.active;
}

async function runEmbeddedBatchWithProgress<T>(items: any[], fn: () => Promise<T>): Promise<T> {
  const total = Array.isArray(items) ? items.length : 0;
  activeBatchImportCount++;
  emitBatchImportProgress({
    active: true,
    processedRows: 0,
    totalRows: total,
    completedChunks: 0,
    totalChunks: 1,
    savedRows: 0,
    failedRows: 0,
  });
  try {
    const res: any = await fn();
    const saved = Number(res?.data?.inserted ?? res?.added ?? 0) + Number(res?.data?.updated ?? res?.updated ?? 0);
    emitBatchImportProgress({
      active: false,
      processedRows: total,
      totalRows: total,
      completedChunks: 1,
      totalChunks: 1,
      savedRows: saved || (res?.success ? total : 0),
      failedRows: res?.success ? 0 : total,
    });
    return res;
  } finally {
    activeBatchImportCount = Math.max(0, activeBatchImportCount - 1);
    if (batchImportProgressState.active) {
      emitBatchImportProgress({ ...batchImportProgressState, active: false });
    }
  }
}

const LS_CLOUDFLARE_API_URL_KEY = 'npn_cloudflare_api_url_v1';
const LS_CLOUDFLARE_UNIFIED_FLAG = 'npn_cf_url_unified_v2';

export const DEFAULT_CLOUDFLARE_API_URL = 'https://neginparto-api.ci-runner-223bd6.workers.dev';

let detectedEngine: StorageEngine | null = null;
let engineDetectPromise: Promise<StorageEngine> | null = null;

function ensureUnifiedCloudflareDefault(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(LS_CLOUDFLARE_UNIFIED_FLAG) !== '1') {
      localStorage.removeItem(LS_CLOUDFLARE_API_URL_KEY);
      localStorage.setItem(LS_CLOUDFLARE_UNIFIED_FLAG, '1');
    }
  } catch {
    // ignore storage access error
  }
}

ensureUnifiedCloudflareDefault();

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
  ensureUnifiedCloudflareDefault();
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
    localStorage.setItem(LS_CLOUDFLARE_UNIFIED_FLAG, '1');
    if (normalized && normalized !== DEFAULT_CLOUDFLARE_API_URL) {
      localStorage.setItem(LS_CLOUDFLARE_API_URL_KEY, normalized);
    } else {
      localStorage.removeItem(LS_CLOUDFLARE_API_URL_KEY);
    }
  } catch {
    // ignore storage write error
  }
  resetDetectedEngine();
  return normalized || getCloudflareApiUrl();
}

export function resetCloudflareApiUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_CLOUDFLARE_API_URL_KEY);
      localStorage.setItem(LS_CLOUDFLARE_UNIFIED_FLAG, '1');
    }
  } catch {
    // ignore
  }
  resetDetectedEngine();
  return getCloudflareApiUrl();
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

  const cfUrl = getCloudflareApiUrl();
  if (cfUrl) {
    // Immediate fast-path: go straight to Cloudflare D1 without wasting a startup /health round-trip
    detectedEngine = 'cloudflare';
    return 'cloudflare';
  }

  if (!engineDetectPromise) {
    engineDetectPromise = (async () => {
      if (await probeJsonEndpoint('./api/health', 'node', 2500)) {
        detectedEngine = 'node';
        return 'node';
      }
      if (await probeJsonEndpoint('./api.php?r=/health', 'php', 2500)) {
        detectedEngine = 'php';
        return 'php';
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

async function gzipPayloadBytes(text: string): Promise<Blob | null> {
  try {
    if (typeof CompressionStream === 'undefined' || text.length < 900) return null;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    if (buf.byteLength >= text.length) return null;
    return new Blob([buf], { type: 'application/json' });
  } catch {
    return null;
  }
}

function encodeColumnarPayload(items: any[]): { __cols: string[]; __rows: any[][] } {
  const colIndex = new Map<string, number>();
  const cols: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!row || typeof row !== 'object') continue;
    const keys = Object.keys(row);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if (!colIndex.has(key)) {
        colIndex.set(key, cols.length);
        cols.push(key);
      }
    }
  }
  const rows: any[][] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!row || typeof row !== 'object') {
      rows[i] = [];
      continue;
    }
    const arr: any[] = [];
    let lastNonNull = -1;
    for (let c = 0; c < cols.length; c++) {
      const val = row[cols[c]];
      if (val !== undefined && val !== null) {
        arr[c] = val;
        lastNonNull = c;
      } else {
        arr[c] = null;
      }
    }
    arr.length = lastNonNull + 1;
    rows[i] = arr;
  }
  return { __cols: cols, __rows: rows };
}

function buildFastBatchBody(
  engine: StorageEngine,
  items: any[],
  extra?: Record<string, any>
): Record<string, any> {
  if (engine === 'cloudflare') {
    return { ...(extra || {}), ...encodeColumnarPayload(items) };
  }
  return { ...(extra || {}), items };
}

async function callBackendOnce(
  route: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: any; skipAuthRedirect?: boolean; timeoutMs?: number; compress?: boolean } = {}
): Promise<any> {
  const engine = await detectStorageEngine();
  if (engine === 'indexeddb') {
    throw new Error('USE_EMBEDDED');
  }

  const method = options.method || 'GET';
  const isPhp = engine === 'php';
  const isCloudflare = engine === 'cloudflare';
  let url = isPhp
    ? buildPhpUrl(route, method)
    : isCloudflare
    ? `${getCloudflareApiUrl()}/api${route}`
    : `./api${route}`;
  const fetchMethod = isPhp && method !== 'GET' ? 'POST' : method;

  const headers = getHeaders(isPhp);
  let requestBody: BodyInit | undefined;
  if (options.body !== undefined) {
    const rawJson = JSON.stringify(options.body);
    if (isCloudflare && options.compress) {
      const gzBlob = await gzipPayloadBytes(rawJson);
      if (gzBlob) {
        url += `${url.includes('?') ? '&' : '?'}gz=1`;
        headers['X-Requested-With'] = 'npn-gzip';
        headers['Content-Type'] = 'application/octet-stream';
        requestBody = gzBlob;
      } else {
        requestBody = rawJson;
      }
    } else {
      requestBody = rawJson;
    }
  }

  const timeoutMs = options.timeoutMs ?? 35000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timerId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  let text = '';
  try {
    res = await fetch(url, {
      method: fetchMethod,
      headers,
      cache: 'no-store',
      ...(requestBody !== undefined ? { body: requestBody } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (res.status === 401 && !options.skipAuthRedirect) {
      window.dispatchEvent(new CustomEvent('hr:unauthorized'));
    }

    text = await res.text();
  } catch (networkErr: any) {
    if (timerId) clearTimeout(timerId);
    const isAborted = networkErr?.name === 'AbortError';
    const isCorsOrOffline = networkErr instanceof TypeError;
    return {
      success: false,
      networkError: true,
      timeout: isAborted,
      message: isAborted
        ? 'مهلت پاسخ‌گویی سرور به پایان رسید. اتصال اینترنت یا سرور کلودفلر را بررسی کنید.'
        : isCorsOrOffline
        ? isCloudflare
          ? 'خطای ارتباط با سرور Cloudflare Worker. اتصال اینترنت، آدرس Worker یا حجم درخواست را بررسی کنید.'
          : 'خطای ارتباط شبکه‌ای با سرور پایگاه داده.'
        : networkErr?.message || 'خطا در ارسال درخواست به سرور.',
    };
  }
  if (timerId) clearTimeout(timerId);

  try {
    const parsed = JSON.parse(text);
    if (!res.ok && parsed && typeof parsed === 'object') {
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

async function callBackend(
  route: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: any; skipAuthRedirect?: boolean; timeoutMs?: number; retries?: number; compress?: boolean } = {}
): Promise<any> {
  const method = options.method || 'GET';
  const maxRetries = options.retries ?? (method === 'GET' ? 2 : 0);
  let lastRes: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRes = await callBackendOnce(route, options);
    if (lastRes && lastRes.success !== false) return lastRes;
    const retryable = Boolean(lastRes?.networkError || lastRes?.timeout || (lastRes?.status && lastRes.status >= 502));
    if (!retryable || attempt >= maxRetries) return lastRes;
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  return lastRes;
}

const PERSIAN_DIGIT_TEST_RE = /[۰-۹٠-٩]/;
const ASCII_CONVERT_KEYS = new Set([
  'employeeId', 'personnelCode', 'nationalId', 'shenasnamehNumber', 'phone',
  'birthDate', 'issueDate', 'hireDate', 'baseSalary', 'jobCode', 'positionCode',
  'personnelNationalId', 'period', 'yearMonthLabel', 'baseKaraneh', 'overtimeBonus',
  'deductions', 'finalKaraneh', 'score', 'performanceCoeff', 'netPayable',
  'totalBenefits', 'amount', 'previouslyTakenAmount', 'maxAllowedAmount',
  'startDate', 'endDate', 'machineCode', 'stoppedSince', 'estimatedReadyDate',
  'volumeValue', 'targetVolume', 'actualValue', 'previousValue',
]);

function compactRowForUpload(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('ستون_')) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) continue;
      out[k] = ASCII_CONVERT_KEYS.has(k) && PERSIAN_DIGIT_TEST_RE.test(t) ? toAsciiDigits(t) : t;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function compactPayrollItemForUpload(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const raw = item.rawFields;
  const base = compactRowForUpload(item);
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, rawFields: compactRowForUpload(raw) };
}

function extractBatchOverlapKey(row: any): string {
  if (!row || typeof row !== 'object') return '';
  const code = row.personnelCode ?? row['كد پرسنلي'] ?? row['کد پرسنلی'] ?? row.machineCode ?? row.username ?? '';
  if (code === undefined || code === null || code === '') return '';
  return toAsciiDigits(String(code)).trim();
}

async function sendBatchInChunks(
  items: any[],
  chunkSize: number,
  sendChunk: (
    chunk: any[],
    chunkIndex: number,
    totalChunks: number,
    attemptMeta?: { retryCount: number; disableCompress: boolean }
  ) => Promise<any>,
  concurrency = 2
): Promise<any> {
  const nonEmptyItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0)
    : [];
  if (nonEmptyItems.length === 0) {
    return { success: false, message: 'هیچ ردیف معتبری در فایل اکسل برای ثبت وجود ندارد.' };
  }

  const totalRows = nonEmptyItems.length;
  const initialChunkSize = Math.max(1, Math.min(chunkSize, totalRows));
  const minChunkSize = Math.min(initialChunkSize, 10);
  const maxConcurrency = Math.max(1, Math.min(4, concurrency));
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalSkippedUnit = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;
  let totalAddedRelatives = 0;
  let processedRows = 0;
  let completedChunks = 0;
  const failedRows = 0;
  let lastMessage = '';
  let lastFailureMessage = '';

  const isAuthErr = (r: any) => r?.status === 401 || r?.status === 403;
  const isRetryable = (r: any) =>
    !isAuthErr(r) &&
    (Boolean(r?.networkError) ||
      Boolean(r?.timeout) ||
      r?.status === 408 ||
      r?.status === 413 ||
      r?.status === 429 ||
      (typeof r?.status === 'number' && r.status >= 500 && r.status <= 504));

  activeBatchImportCount++;
  const initialTotalChunks = Math.ceil(totalRows / initialChunkSize);
  emitBatchImportProgress({
    active: true,
    processedRows: 0,
    totalRows,
    completedChunks: 0,
    totalChunks: initialTotalChunks,
    savedRows: 0,
    failedRows: 0,
  });

  try {
    interface BatchRange {
      start: number;
      end: number;
      retries: number;
      disableCompress?: boolean;
      notBefore?: number;
    }

    let nextCursor = 0;
    const pendingRanges: BatchRange[] = [];
    let currentChunkSize = initialChunkSize;
    let activeConcurrency = maxConcurrency;
    let successStreak = 0;
    let fatalFailure: any = null;
    const inFlightRanges = new Set<BatchRange>();
    const inFlightKeyCounts = new Map<string, number>();

    const getRangeKeys = (r: BatchRange): string[] => {
      const keys: string[] = [];
      for (let idx = r.start; idx < r.end; idx++) {
        const k = extractBatchOverlapKey(nonEmptyItems[idx]);
        if (k) keys.push(k);
      }
      return keys;
    };

    const hasKeyOverlap = (keys: string[]): boolean => {
      if (inFlightRanges.size === 0 || keys.length === 0) return false;
      for (let i = 0; i < keys.length; i++) {
        if ((inFlightKeyCounts.get(keys[i]) || 0) > 0) return true;
      }
      return false;
    };

    const acquireKeys = (keys: string[]) => {
      for (let i = 0; i < keys.length; i++) {
        inFlightKeyCounts.set(keys[i], (inFlightKeyCounts.get(keys[i]) || 0) + 1);
      }
    };

    const releaseKeys = (keys: string[]) => {
      for (let i = 0; i < keys.length; i++) {
        const next = (inFlightKeyCounts.get(keys[i]) || 1) - 1;
        if (next <= 0) inFlightKeyCounts.delete(keys[i]);
        else inFlightKeyCounts.set(keys[i], next);
      }
    };

    const estimateTotalChunks = () => {
      const remainingUnqueued = Math.max(0, totalRows - nextCursor);
      return Math.max(
        completedChunks + inFlightRanges.size + pendingRanges.length,
        completedChunks +
          inFlightRanges.size +
          pendingRanges.length +
          Math.ceil(remainingUnqueued / Math.max(1, currentChunkSize))
      );
    };

    const pickNextRange = (): { range: BatchRange; keys: string[]; waitMs: number } | null => {
      const now = Date.now();
      let minWaitMs = 0;

      for (let i = 0; i < pendingRanges.length; i++) {
        const cand = pendingRanges[i];
        if (cand.notBefore && cand.notBefore > now) {
          const w = cand.notBefore - now;
          if (minWaitMs === 0 || w < minWaitMs) minWaitMs = w;
          continue;
        }
        const keys = getRangeKeys(cand);
        if (!hasKeyOverlap(keys)) {
          pendingRanges.splice(i, 1);
          return { range: cand, keys, waitMs: 0 };
        }
      }

      if (minWaitMs > 0) {
        return { range: { start: 0, end: 0, retries: 0 }, keys: [], waitMs: minWaitMs };
      }

      if (nextCursor < totalRows) {
        const end = Math.min(totalRows, nextCursor + currentChunkSize);
        const cand: BatchRange = { start: nextCursor, end, retries: 0 };
        const keys = getRangeKeys(cand);
        if (!hasKeyOverlap(keys)) {
          nextCursor = end;
          return { range: cand, keys, waitMs: 0 };
        }
      }

      return null;
    };

    // Pipelined worker pool: keeps D1 busy smoothly with <= 2 concurrent writers and zero head-of-line stalls
    const runWorker = async (): Promise<void> => {
      while (!fatalFailure) {
        if (inFlightRanges.size >= activeConcurrency) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }

        const picked = pickNextRange();
        if (!picked) {
          if (pendingRanges.length === 0 && nextCursor >= totalRows) {
            return;
          }
          await new Promise((r) => setTimeout(r, 45));
          continue;
        }

        if (picked.waitMs > 0) {
          await new Promise((r) => setTimeout(r, Math.min(picked.waitMs, 500)));
          continue;
        }

        const { range, keys } = picked;
        inFlightRanges.add(range);
        acquireKeys(keys);

        const slice = nonEmptyItems.slice(range.start, range.end);
        const estTotal = estimateTotalChunks();
        const chunkIdx = completedChunks;

        let res: any;
        try {
          res = await sendChunk(slice, chunkIdx, estTotal, {
            retryCount: range.retries,
            disableCompress: Boolean(range.disableCompress),
          });
        } catch (err: any) {
          res = { success: false, networkError: true, message: err?.message || 'خطای ارسال دسته' };
        } finally {
          inFlightRanges.delete(range);
          releaseKeys(keys);
        }

        if (fatalFailure) return;

        if (res && res.success) {
          const sliceLen = range.end - range.start;
          completedChunks++;
          processedRows += sliceLen;
          const d = res.data || {};
          totalInserted += Number(d.inserted ?? res.added ?? 0);
          totalUpdated += Number(d.updated ?? res.updated ?? 0);
          totalSkipped += Number(d.skipped || 0);
          totalSkippedUnit += Number(d.skippedUnit ?? res.skippedUnit ?? 0);
          totalMatched += Number(d.matched || 0);
          totalUnmatched += Number(d.unmatched || 0);
          totalAddedRelatives += Number(d.addedRelatives ?? res.addedRelatives ?? 0);
          if (res.message) lastMessage = res.message;

          successStreak++;
          if (activeConcurrency < maxConcurrency && successStreak >= 4) {
            activeConcurrency = Math.min(maxConcurrency, activeConcurrency + 1);
            successStreak = 0;
          }
          if (successStreak >= 6 && currentChunkSize < initialChunkSize) {
            currentChunkSize = Math.min(initialChunkSize, Math.round(currentChunkSize * 1.25));
            successStreak = 0;
          }

          const liveSaved =
            totalInserted + totalUpdated + (totalInserted + totalUpdated === 0 ? totalMatched + totalAddedRelatives : 0);
          emitBatchImportProgress({
            active: true,
            processedRows,
            totalRows,
            completedChunks,
            totalChunks: estimateTotalChunks(),
            savedRows: liveSaved,
            failedRows,
          });
          continue;
        }

        const savedSoFar = totalInserted + totalUpdated + totalMatched + totalAddedRelatives;

        if (isAuthErr(res)) {
          const baseMsg = res?.message || 'دسترسی یا نشست کاربری معتبر نیست.';
          const savedNote = savedSoFar > 0 ? ` (${savedSoFar} ردیف تا پیش از این مرحله ثبت شد)` : '';
          const progressNote = estTotal > 1 ? ` (توقف در دسته ${completedChunks + 1} از ${estTotal}${savedNote})` : '';
          fatalFailure = {
            success: false,
            message: `${baseMsg}${progressNote}`,
            data: { ...(res?.data || {}), partialSaved: savedSoFar },
          };
          return;
        }

        if (res?.message) lastFailureMessage = res.message;
        successStreak = 0;
        activeConcurrency = 1;
        const sliceLen = range.end - range.start;
        currentChunkSize = Math.max(minChunkSize, Math.floor(currentChunkSize / 2));

        // Split oversized or persistently failing batches cleanly down to smaller sub-chunks (even 1 row if needed)
        const nextRetry = range.retries + 1;
        const canSplitFurther = isRetryable(res) && (sliceLen > minChunkSize || (sliceLen > 1 && range.retries >= 2));

        if (canSplitFurther) {
          const splitTarget = sliceLen > minChunkSize ? Math.max(minChunkSize, Math.floor(sliceLen / 2)) : Math.max(1, Math.floor(sliceLen / 2));
          const backoffMs = Math.min(3500, 600 * nextRetry);
          const readyAt = Date.now() + backoffMs;
          const subRanges: BatchRange[] = [];
          for (let s = range.start; s < range.end; s += splitTarget) {
            subRanges.push({
              start: s,
              end: Math.min(range.end, s + splitTarget),
              retries: range.retries >= 2 ? range.retries : 0,
              disableCompress: range.disableCompress || range.retries >= 1,
              notBefore: readyAt,
            });
          }
          pendingRanges.unshift(...subRanges);
          emitBatchImportProgress({
            active: true,
            processedRows,
            totalRows,
            completedChunks,
            totalChunks: estimateTotalChunks(),
            savedRows: savedSoFar,
            failedRows,
          });
          continue;
        }

        if (isRetryable(res) && range.retries < 5) {
          const backoffMs = Math.min(4500, 750 * nextRetry);
          pendingRanges.unshift({
            start: range.start,
            end: range.end,
            retries: nextRetry,
            disableCompress: range.disableCompress || nextRetry >= 2,
            notBefore: Date.now() + backoffMs,
          });
          continue;
        }

        const baseMsg = lastFailureMessage || 'خطای ارتباط با سرور پایگاه داده.';
        const savedNote = savedSoFar > 0 ? ` (${savedSoFar} ردیف تا پیش از این مرحله ثبت شد)` : '';
        const progressNote = estTotal > 1 ? ` (توقف در دسته ${completedChunks + 1} از ${estTotal}${savedNote})` : '';
        fatalFailure = {
          success: false,
          message: `${baseMsg}${progressNote}`,
          data: { ...(res?.data || {}), partialSaved: savedSoFar },
        };
        return;
      }
    };

    const workerCount = Math.max(1, maxConcurrency);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    if (fatalFailure) {
      return fatalFailure;
    }

    const totalChunks = completedChunks;

    const totalSaved = totalInserted + totalUpdated + totalMatched;
    if (totalSaved === 0 && (failedRows > 0 || totalSkippedUnit > 0)) {
      return {
        success: false,
        message:
          totalSkippedUnit > 0
            ? `هیچ ردیفی ثبت نشد؛ ${totalSkippedUnit} ردیف متعلق به واحد سازمانی غیرمجاز بود.`
            : lastFailureMessage || 'هیچ ردیفی در پایگاه داده ثبت نشد.',
      };
    }

    if (totalChunks === 1 && lastMessage && failedRows === 0) {
      return {
        success: true,
        message: lastMessage,
        data: {
          totalProcessed: totalRows,
          inserted: totalInserted,
          updated: totalUpdated,
          skipped: totalSkipped,
          matched: totalMatched,
          unmatched: totalUnmatched,
          addedRelatives: totalAddedRelatives,
          failedRows,
        },
      };
    }

    const parts: string[] = [];
    if (totalInserted > 0) parts.push(`${totalInserted} ردیف جدید`);
    if (totalUpdated > 0) parts.push(`${totalUpdated} ردیف به‌روزرسانی`);
    if (totalAddedRelatives > 0) parts.push(`${totalAddedRelatives} بستگان`);
    if (totalMatched > 0) parts.push(`${totalMatched} ردیف منطبق`);
    if (totalSkipped > 0) parts.push(`${totalSkipped} ردیف ردشده`);
    if (failedRows > 0) parts.push(`${failedRows} ردیف ناموفق`);
    const summaryMsg =
      parts.length > 0
        ? `بارگذاری اکسل انجام شد (${parts.join('، ')}).`
        : lastMessage || `تعداد ${totalRows} ردیف با موفقیت در پایگاه داده ثبت شد.`;

    return {
      success: true,
      message: summaryMsg,
      data: {
        totalProcessed: totalRows,
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        matched: totalMatched,
        unmatched: totalUnmatched,
        addedRelatives: totalAddedRelatives,
        failedRows,
      },
    };
  } finally {
    activeBatchImportCount = Math.max(0, activeBatchImportCount - 1);
    emitBatchImportProgress({
      active: false,
      processedRows,
      totalRows,
      completedChunks,
      totalChunks: Math.max(completedChunks, initialTotalChunks),
      savedRows: totalInserted + totalUpdated,
      failedRows,
    });
  }
}

function unwrapArrayResponse<T>(json: any, fallbackError: string): T[] {
  if (!json || json.success === false || !Array.isArray(json.data)) {
    throw new Error(json?.message || fallbackError);
  }
  return json.data as T[];
}

async function fetchPaginatedCloudflareList<T>(
  baseRoute: string,
  pageSize: number,
  fallbackError: string,
  startOffset = 0,
  initialItems: T[] = [],
  knownTotal?: number,
  options?: {
    concurrency?: number;
    timeoutMs?: number;
    retries?: number;
    onProgress?: (itemsSoFar: T[], total: number) => void;
  }
): Promise<T[]> {
  const sep = baseRoute.includes('?') ? '&' : '?';
  const reqTimeout = options?.timeoutMs ?? 42000;
  const reqRetries = options?.retries ?? 3;
  let results = [...initialItems];
  const offset = startOffset;

  const fetchSingleSlice = async (off: number, lim: number): Promise<{ items: T[]; raw: any }> => {
    const res = await callBackend(`${baseRoute}${sep}limit=${lim}&offset=${off}`, {
      timeoutMs: reqTimeout,
      retries: reqRetries,
    });
    if (res?.status === 401 || res?.status === 403) {
      const authErr: any = new Error(res?.message || 'عدم دسترسی به این بخش');
      authErr.status = res.status;
      throw authErr;
    }
    const items = unwrapArrayResponse<T>(res, fallbackError);
    return { items, raw: res };
  };

  let firstRes: { items: T[]; raw: any };
  try {
    firstRes = await fetchSingleSlice(offset, pageSize);
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      throw err;
    }
    if (pageSize > 80) {
      const half = Math.max(40, Math.floor(pageSize / 2));
      const p1 = await fetchSingleSlice(offset, half);
      results = results.concat(p1.items);
      const t1 = typeof p1.raw?.total === 'number' ? p1.raw.total : knownTotal ?? results.length;
      options?.onProgress?.(results, t1);
      const p1More = p1.raw?.hasMore !== undefined ? Boolean(p1.raw.hasMore) : p1.items.length === half && results.length < t1;
      if (!p1More || p1.items.length === 0) return results;
      firstRes = { items: p1.items, raw: p1.raw };
      pageSize = half;
    } else {
      if (results.length > 0 && err && typeof err === 'object') {
        (err as any).partialItems = results;
      }
      throw err;
    }
  }

  const firstBatch = firstRes.items;
  if (results.length === initialItems.length) {
    results = results.concat(firstBatch);
  }
  const total = typeof firstRes.raw?.total === 'number' ? firstRes.raw.total : knownTotal ?? results.length;
  options?.onProgress?.(results, total);
  const hasMore =
    firstRes.raw?.hasMore !== undefined
      ? Boolean(firstRes.raw.hasMore)
      : firstBatch.length === pageSize && results.length < total;
  if (!hasMore || firstBatch.length === 0) return results;

  const offsets: number[] = [];
  for (let next = offset + firstBatch.length; next < total; next += pageSize) {
    offsets.push(next);
  }

  let waveSize = Math.max(1, Math.min(2, options?.concurrency ?? 2));
  let idx = 0;
  while (idx < offsets.length) {
    const wave = offsets.slice(idx, idx + waveSize);
    const settled = await Promise.allSettled(wave.map((off) => fetchSingleSlice(off, pageSize)));
    let hitEmptySlice = false;

    for (let w = 0; w < settled.length; w++) {
      const outcome = settled[w];
      const off = wave[w];
      if (outcome.status === 'fulfilled') {
        if (outcome.value.items.length === 0) {
          hitEmptySlice = true;
          continue;
        }
        results = results.concat(outcome.value.items);
        options?.onProgress?.(results, total);
        continue;
      }
      if ((outcome.reason as any)?.status === 401 || (outcome.reason as any)?.status === 403) {
        throw outcome.reason;
      }

      // Drop wave size to 1 so flaky mobile connections don't choke on concurrent streams
      waveSize = 1;
      const sliceLimit = Math.min(pageSize, Math.max(1, total - off));
      const subStep = Math.max(40, Math.floor(sliceLimit / 2));
      try {
        if (sliceLimit > subStep) {
          for (let subOff = off; subOff < off + sliceLimit; subOff += subStep) {
            const take = Math.min(subStep, off + sliceLimit - subOff);
            const subRes = await fetchSingleSlice(subOff, take);
            if (subRes.items.length === 0) {
              hitEmptySlice = true;
              break;
            }
            results = results.concat(subRes.items);
            options?.onProgress?.(results, total);
          }
        } else {
          const retryRes = await fetchSingleSlice(off, sliceLimit);
          if (retryRes.items.length === 0) {
            hitEmptySlice = true;
          } else {
            results = results.concat(retryRes.items);
            options?.onProgress?.(results, total);
          }
        }
      } catch (sliceErr: any) {
        if (sliceErr && typeof sliceErr === 'object') {
          sliceErr.partialItems = results;
        }
        throw sliceErr;
      }
    }
    if (hitEmptySlice) break;
    idx += wave.length;
  }

  return results;
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
    return unwrapArrayResponse<User>(json, 'خطا در دریافت لیست کاربران');
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
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportUsers(items));
    return sendBatchInChunks(
      items,
      35,
      (chunk, _i, _t, meta) =>
        callBackend('/users/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
  async getPersonnel(options?: {
    lite?: boolean;
    onProgress?: (itemsSoFar: Personnel[], total: number) => void;
  }): Promise<Personnel[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getPersonnel();
    if (engine === 'cloudflare') {
      const route = options?.lite ? '/personnel?lite=1' : '/personnel';
      return fetchPaginatedCloudflareList<Personnel>(
        route,
        options?.lite ? 180 : 100,
        'خطا در دریافت اطلاعات پرسنل',
        0,
        [],
        undefined,
        {
          concurrency: options?.lite ? 2 : 1,
          timeoutMs: 42000,
          retries: 3,
          onProgress: options?.onProgress,
        }
      );
    }
    const json = await callBackend('/personnel');
    return unwrapArrayResponse<Personnel>(json, 'خطا در دریافت اطلاعات پرسنل');
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
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportPersonnel(items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      160,
      (chunk, _i, _t, meta) =>
        callBackend('/personnel/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportRelatives(items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      150,
      (chunk, _i, _t, meta) =>
        callBackend('/personnel/relatives/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<KaranehRecord>(route, 400, 'خطا در دریافت اطلاعات کارانه');
    }
    const json = await callBackend(route);
    return unwrapArrayResponse<KaranehRecord>(json, 'خطا در دریافت اطلاعات کارانه');
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

  async getKaranehUnitPersonnel(): Promise<Personnel[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getKaranehUnitPersonnel();
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<Personnel>('/karaneh/unit-personnel', 300, 'خطا در دریافت لیست پرسنل واحد');
    }
    const json = await callBackend('/karaneh/unit-personnel');
    return unwrapArrayResponse<Personnel>(json, 'خطا در دریافت لیست پرسنل واحد');
  },

  async saveKaraneh(record: Partial<KaranehRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveKaraneh(record);
    return callBackend('/karaneh', { method: 'POST', body: record });
  },

  async batchImportKaraneh(period: string, items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportKaraneh(period, items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      220,
      (chunk, _i, _t, meta) =>
        callBackend('/karaneh/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk, { period }),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
    );
  },

  async submitKaraneh(period: string, department?: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.submitKaraneh(period, department);
    return callBackend('/karaneh/submit', { method: 'POST', body: { period, ...(department ? { department } : {}) } });
  },

  async reopenKaraneh(period: string, department?: string) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.reopenKaraneh(period, department);
    return callBackend('/karaneh/reopen', { method: 'POST', body: { period, ...(department ? { department } : {}) } });
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

  async deleteAllKaraneh(period?: string, scope?: 'all' | 'submitted') {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.deleteAllKaraneh(period, scope);
    return callBackend('/karaneh/delete-all', {
      method: 'POST',
      body: {
        ...(period ? { period } : {}),
        ...(scope ? { scope } : {}),
      },
    });
  },

  // Job Groups
  async getJobGroups(): Promise<JobGroup[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getJobGroups();
    const json = await callBackend('/job-groups');
    return unwrapArrayResponse<JobGroup>(json, 'خطا در دریافت گروه‌های شغلی');
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
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<JobClassificationRecord>('/job-classifications', 300, 'خطا در دریافت طبقه‌بندی مشاغل');
    }
    const json = await callBackend('/job-classifications');
    return unwrapArrayResponse<JobClassificationRecord>(json, 'خطا در دریافت طبقه‌بندی مشاغل');
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
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportJobClassifications(items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      200,
      (chunk, _i, _t, meta) =>
        callBackend('/job-classifications/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<PersonnelCommitment>('/commitments', 300, 'خطا در دریافت تعهدات پرسنلی');
    }
    const json = await callBackend('/commitments');
    return unwrapArrayResponse<PersonnelCommitment>(json, 'خطا در دریافت تعهدات پرسنلی');
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
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportCommitments(items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      220,
      (chunk, _i, _t, meta) =>
        callBackend('/commitments/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
  async getPayroll(
    period?: string,
    options?: { onProgress?: (itemsSoFar: PayrollRecord[], total: number) => void }
  ): Promise<PayrollRecord[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getPayroll(period);
    const route = period ? `/payroll?period=${encodeURIComponent(period)}` : '/payroll';
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<PayrollRecord>(
        route,
        140,
        'خطا در دریافت لیست حقوق و دستمزد',
        0,
        [],
        undefined,
        {
          concurrency: 2,
          timeoutMs: 42000,
          retries: 3,
          onProgress: options?.onProgress,
        }
      );
    }
    const json = await callBackend(route, { timeoutMs: 35000 });
    return unwrapArrayResponse<PayrollRecord>(json, 'خطا در دریافت لیست حقوق و دستمزد');
  },

  async batchImportPayroll(period: string, items: any[], useRowYearMonth = true) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportPayroll(period, items, useRowYearMonth));
    const compacted = Array.isArray(items) ? items.map(compactPayrollItemForUpload) : items;
    return sendBatchInChunks(
      compacted,
      100,
      (chunk, _i, _t, meta) =>
        callBackend('/payroll/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk, { period, useRowYearMonth }),
          timeoutMs: 55000,
          compress: !meta?.disableCompress,
        }),
      2
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
    return unwrapArrayResponse<MiningVolumeRecord>(json, 'خطا در دریافت آمار تولید معدن');
  },

  async saveMiningVolume(record: Partial<MiningVolumeRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveMiningVolume(record);
    return callBackend('/mining-volumes', { method: 'POST', body: record });
  },

  async batchImportMiningVolumes(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportMiningVolumes(items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      200,
      (chunk, _i, _t, meta) =>
        callBackend('/mining-volumes/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
    return unwrapArrayResponse<MiningMachineryRecord>(json, 'خطا در دریافت وضعیت ماشین‌آلات');
  },

  async saveMiningMachinery(record: Partial<MiningMachineryRecord>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveMiningMachinery(record);
    return callBackend('/mining-machinery', { method: 'POST', body: record });
  },

  async batchImportMiningMachinery(items: any[]) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportMiningMachinery(items));
    const compacted = Array.isArray(items) ? items.map(compactRowForUpload) : items;
    return sendBatchInChunks(
      compacted,
      200,
      (chunk, _i, _t, meta) =>
        callBackend('/mining-machinery/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<UnitOperationalReport>(route, 300, 'خطا در دریافت گزارش واحدها');
    }
    const json = await callBackend(route);
    return unwrapArrayResponse<UnitOperationalReport>(json, 'خطا در دریافت گزارش واحدها');
  },

  async saveUnitReport(record: Partial<UnitOperationalReport>) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.saveUnitReport(record);
    return callBackend('/unit-reports', { method: 'POST', body: record });
  },

  async batchImportUnitReports(payload: { unitName?: string; period?: string; reportCategory?: string; items: any[] }) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(payload?.items || [], () => embeddedDb.batchImportUnitReports(payload));
    const items = Array.isArray(payload?.items) ? payload.items.map(compactRowForUpload) : [];
    const { items: _ignored, ...extra } = payload || {};
    return sendBatchInChunks(
      items,
      180,
      (chunk, _i, _t, meta) =>
        callBackend('/unit-reports/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk, extra),
          timeoutMs: 45000,
          compress: !meta?.disableCompress,
        }),
      2
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

  async getBootstrapData(options?: {
    lite?: boolean;
    priorityDomain?: string;
    onFirstPaint?: (bundle: {
      personnel: Personnel[];
      karaneh: KaranehRecord[];
      karanehPersonnel?: Personnel[];
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
      isLite?: boolean;
      partialErrors?: string[];
    }) => void;
    onDomainProgress?: (
      domain: 'personnel' | 'karaneh' | 'payroll' | 'jobClassifications' | 'commitments' | 'unitReports',
      items: any[],
      isComplete: boolean
    ) => void;
  }): Promise<{
    personnel: Personnel[];
    karaneh: KaranehRecord[];
    karanehPersonnel?: Personnel[];
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
    isLite?: boolean;
    partialErrors?: string[];
  }> {
    const engine = await detectStorageEngine();
    const wantLite = Boolean(options?.lite);

    if (engine === 'cloudflare') {
      const json = await callBackend(wantLite ? '/bootstrap?lite=1' : '/bootstrap', {
        timeoutMs: wantLite ? 22000 : 45000,
        retries: wantLite ? 1 : 2,
      });

      let d: any = null;
      const partialErrors: string[] = [];

      if (json?.success && json?.data) {
        d = json.data;
      } else if (json?.status === 401 || json?.status === 403) {
        throw new Error(json?.message || 'نشست کاربری معتبر نیست.');
      } else if (json?.status !== 404) {
        // Permission-aware resilient fallback: skip endpoints the signed-in user has no permission to read,
        // and defer /karaneh/unit-personnel to lazy post-paint loading in App.tsx.
        let storedUser: any = null;
        try {
          const rawUser = localStorage.getItem('hr_current_user');
          if (rawUser) storedUser = JSON.parse(rawUser);
        } catch {
          storedUser = null;
        }
        const isSuper = Boolean(storedUser && (storedUser.role === 'super_admin' || storedUser.username === 'javadabadiyan'));
        const perms = storedUser ? normalizePermissions(storedUser.permissions) : null;
        const can = (section: string, action = 'view') => {
          if (!perms) return true;
          if (isSuper) return true;
          return Boolean((perms as any)?.[section]?.[action]);
        };
        const canKaranehAny = can('karaneh', 'view') || can('finalKaraneh', 'view');
        const canMiningAny = can('ceoDashboard', 'view') || can('unitOperations', 'view');
        const emptyOk = () => Promise.resolve({ success: true, data: [], total: 0 });

        const [sRes, pRes, kRes, kpRes, jgRes, jcRes, cRes, mvRes, mmRes, urRes, uRes] = await Promise.allSettled([
          callBackend('/database/status', { timeoutMs: 14000, retries: 1 }),
          can('personnel') ? callBackend('/personnel?lite=1&limit=80&offset=0', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          canKaranehAny ? callBackend('/karaneh?limit=100&offset=0', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          emptyOk(),
          can('jobGroups') ? callBackend('/job-groups', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          can('jobGroups') ? callBackend('/job-classifications?limit=80&offset=0', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          can('commitments') ? callBackend('/commitments?limit=80&offset=0', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          canMiningAny ? callBackend('/mining-volumes', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          canMiningAny ? callBackend('/mining-machinery', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          canMiningAny ? callBackend('/unit-reports?limit=80&offset=0', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
          can('users') ? callBackend('/users', { timeoutMs: 14000, retries: 1 }) : emptyOk(),
        ]);

        const okVal = (r: PromiseSettledResult<any>) =>
          r.status === 'fulfilled' && r.value && r.value.success !== false ? r.value : null;

        const sOk = okVal(sRes);
        const pOk = okVal(pRes);
        const kOk = okVal(kRes);
        const kpOk = okVal(kpRes);
        const jgOk = okVal(jgRes);
        const jcOk = okVal(jcRes);
        const cOk = okVal(cRes);
        const mvOk = okVal(mvRes);
        const mmOk = okVal(mmRes);
        const urOk = okVal(urRes);
        const uOk = okVal(uRes);

        const anyOk = Boolean(sOk || pOk || kOk || jgOk || jcOk || cOk || mvOk || mmOk || urOk || uOk);
        if (!anyOk) {
          throw new Error(json?.message || 'خطا در اتصال به سرور کلودفلر');
        }

        if (!pOk && can('personnel')) partialErrors.push('خطا در دریافت لیست پرسنل');
        if (!kOk && canKaranehAny) partialErrors.push('خطا در دریافت لیست کارانه');

        const statusData = sOk?.data || null;
        d = {
          personnel: Array.isArray(pOk?.data) ? pOk.data : [],
          karaneh: Array.isArray(kOk?.data) ? kOk.data : [],
          karanehPersonnel: Array.isArray(kpOk?.data) ? kpOk.data : [],
          payroll: [],
          jobGroups: Array.isArray(jgOk?.data) ? jgOk.data : [],
          jobClassifications: Array.isArray(jcOk?.data) ? jcOk.data : [],
          commitments: Array.isArray(cOk?.data) ? cOk.data : [],
          miningVolumes: Array.isArray(mvOk?.data) ? mvOk.data : [],
          miningMachinery: Array.isArray(mmOk?.data) ? mmOk.data : [],
          unitReports: Array.isArray(urOk?.data) ? urOk.data : [],
          users: Array.isArray(uOk?.data) ? uOk.data : [],
          dbStatus: statusData,
          syncVersion: statusData?.syncVersion,
          lite: wantLite,
          personnelTotal: can('personnel')
            ? Number(pOk?.total ?? statusData?.totalPersonnel ?? (Array.isArray(pOk?.data) ? pOk.data.length : 0))
            : 0,
          karanehTotal: canKaranehAny
            ? Number(kOk?.total ?? statusData?.totalKaranehRecords ?? (Array.isArray(kOk?.data) ? kOk.data.length : 0))
            : 0,
          payrollTotal: !wantLite && can('payroll') ? Number(statusData?.totalPayrollRecords ?? 0) : 0,
          jobClassificationsTotal: can('jobGroups')
            ? Number(jcOk?.total ?? statusData?.totalJobClassifications ?? (Array.isArray(jcOk?.data) ? jcOk.data.length : 0))
            : 0,
          commitmentsTotal: can('commitments')
            ? Number(cOk?.total ?? statusData?.totalCommitments ?? (Array.isArray(cOk?.data) ? cOk.data.length : 0))
            : 0,
          unitReportsTotal: canMiningAny
            ? Number(urOk?.total ?? statusData?.totalUnitReports ?? (Array.isArray(urOk?.data) ? urOk.data.length : 0))
            : 0,
        };
      }

      if (d) {
        let personnelList: Personnel[] = Array.isArray(d.personnel) ? d.personnel : [];
        let karanehList: KaranehRecord[] = Array.isArray(d.karaneh) ? d.karaneh : [];
        let payrollList: PayrollRecord[] = Array.isArray(d.payroll) ? d.payroll : [];
        let jcList: JobClassificationRecord[] = Array.isArray(d.jobClassifications) ? d.jobClassifications : [];
        let cmtList: PersonnelCommitment[] = Array.isArray(d.commitments) ? d.commitments : [];
        let urList: UnitOperationalReport[] = Array.isArray(d.unitReports) ? d.unitReports : [];

        const personnelTotal = Number(d.personnelTotal ?? d.dbStatus?.totalPersonnel ?? personnelList.length);
        const karanehTotal = Number(d.karanehTotal ?? d.dbStatus?.totalKaranehRecords ?? karanehList.length);
        const payrollTotal = Number(d.payrollTotal ?? d.dbStatus?.totalPayrollRecords ?? payrollList.length);
        const jcTotal = Number(d.jobClassificationsTotal ?? d.dbStatus?.totalJobClassifications ?? jcList.length);
        const cmtTotal = Number(d.commitmentsTotal ?? d.dbStatus?.totalCommitments ?? cmtList.length);
        const urTotal = Number(d.unitReportsTotal ?? d.dbStatus?.totalUnitReports ?? urList.length);

        // First-paint UI immediately with initial compact bundle so tables never sit empty waiting for remaining pages
        options?.onFirstPaint?.({
          ...d,
          personnel: personnelList,
          karaneh: karanehList,
          payroll: payrollList,
          jobClassifications: jcList,
          commitments: cmtList,
          unitReports: urList,
          isLite: Boolean(d.lite),
          partialErrors: partialErrors.length > 0 ? [...partialErrors] : undefined,
        });

        type DomainKey = 'personnel' | 'karaneh' | 'payroll' | 'jobClassifications' | 'commitments' | 'unitReports';
        interface HydrationTask {
          domain: DomainKey;
          priority: number;
          run: () => Promise<void>;
        }

        const pri = options?.priorityDomain || '';
        const priorityOf = (domain: DomainKey): number => {
          if (
            (pri === 'personnel' && domain === 'personnel') ||
            ((pri === 'karaneh' || pri === 'final-karaneh') && domain === 'karaneh') ||
            (pri === 'payroll' && domain === 'payroll') ||
            (pri === 'job-groups' && domain === 'jobClassifications') ||
            (pri === 'commitments' && domain === 'commitments') ||
            ((pri === 'unit-operations' || pri === 'ceo-dashboard') && domain === 'unitReports')
          ) {
            return 0;
          }
          if (domain === 'personnel') return 1;
          if (domain === 'karaneh') return 2;
          return 3;
        };

        const tasks: HydrationTask[] = [];

        if (personnelTotal > personnelList.length) {
          tasks.push({
            domain: 'personnel',
            priority: priorityOf('personnel'),
            run: async () => {
              try {
                const full = await fetchPaginatedCloudflareList<Personnel>(
                  wantLite ? '/personnel?lite=1' : '/personnel',
                  180,
                  'خطا در دریافت ادامه لیست پرسنل',
                  personnelList.length,
                  personnelList,
                  personnelTotal,
                  {
                    concurrency: 2,
                    timeoutMs: 42000,
                    retries: 3,
                    onProgress: (itemsSoFar) => {
                      personnelList = itemsSoFar;
                      options?.onDomainProgress?.('personnel', itemsSoFar, false);
                    },
                  }
                );
                personnelList = full;
                options?.onDomainProgress?.('personnel', full, true);
              } catch (err: any) {
                if (Array.isArray(err?.partialItems) && err.partialItems.length > personnelList.length) {
                  personnelList = err.partialItems;
                  options?.onDomainProgress?.('personnel', personnelList, false);
                }
                partialErrors.push(err?.message || 'بخش پرسنل به صورت ناقص بارگذاری شد');
              }
            },
          });
        }

        if (karanehTotal > karanehList.length) {
          tasks.push({
            domain: 'karaneh',
            priority: priorityOf('karaneh'),
            run: async () => {
              try {
                const full = await fetchPaginatedCloudflareList<KaranehRecord>(
                  '/karaneh',
                  220,
                  'خطا در دریافت ادامه لیست کارانه',
                  karanehList.length,
                  karanehList,
                  karanehTotal,
                  {
                    concurrency: 2,
                    timeoutMs: 42000,
                    retries: 3,
                    onProgress: (itemsSoFar) => {
                      karanehList = itemsSoFar;
                      options?.onDomainProgress?.('karaneh', itemsSoFar, false);
                    },
                  }
                );
                karanehList = full;
                options?.onDomainProgress?.('karaneh', full, true);
              } catch (err: any) {
                if (Array.isArray(err?.partialItems) && err.partialItems.length > karanehList.length) {
                  karanehList = err.partialItems;
                  options?.onDomainProgress?.('karaneh', karanehList, false);
                }
                partialErrors.push(err?.message || 'بخش کارانه به صورت ناقص بارگذاری شد');
              }
            },
          });
        }

        if (!wantLite && payrollTotal > payrollList.length) {
          tasks.push({
            domain: 'payroll',
            priority: priorityOf('payroll'),
            run: async () => {
              try {
                const full = await fetchPaginatedCloudflareList<PayrollRecord>(
                  '/payroll',
                  140,
                  'خطا در دریافت ادامه لیست حقوق',
                  payrollList.length,
                  payrollList,
                  payrollTotal,
                  {
                    concurrency: 2,
                    timeoutMs: 42000,
                    retries: 3,
                    onProgress: (itemsSoFar) => {
                      payrollList = itemsSoFar;
                      options?.onDomainProgress?.('payroll', itemsSoFar, false);
                    },
                  }
                );
                payrollList = full;
                options?.onDomainProgress?.('payroll', full, true);
              } catch (err: any) {
                if (Array.isArray(err?.partialItems) && err.partialItems.length > payrollList.length) {
                  payrollList = err.partialItems;
                  options?.onDomainProgress?.('payroll', payrollList, false);
                }
                partialErrors.push(err?.message || 'بخش حقوق به صورت ناقص بارگذاری شد');
              }
            },
          });
        }

        if (jcTotal > jcList.length) {
          tasks.push({
            domain: 'jobClassifications',
            priority: priorityOf('jobClassifications'),
            run: async () => {
              try {
                const full = await fetchPaginatedCloudflareList<JobClassificationRecord>(
                  '/job-classifications',
                  200,
                  'خطا در دریافت ادامه لیست طبقه‌بندی مشاغل',
                  jcList.length,
                  jcList,
                  jcTotal,
                  {
                    concurrency: 2,
                    timeoutMs: 42000,
                    retries: 3,
                    onProgress: (itemsSoFar) => {
                      jcList = itemsSoFar;
                      options?.onDomainProgress?.('jobClassifications', itemsSoFar, false);
                    },
                  }
                );
                jcList = full;
                options?.onDomainProgress?.('jobClassifications', full, true);
              } catch (err: any) {
                if (Array.isArray(err?.partialItems) && err.partialItems.length > jcList.length) {
                  jcList = err.partialItems;
                  options?.onDomainProgress?.('jobClassifications', jcList, false);
                }
                partialErrors.push(err?.message || 'بخش طبقه‌بندی مشاغل به صورت ناقص بارگذاری شد');
              }
            },
          });
        }

        if (cmtTotal > cmtList.length) {
          tasks.push({
            domain: 'commitments',
            priority: priorityOf('commitments'),
            run: async () => {
              try {
                const full = await fetchPaginatedCloudflareList<PersonnelCommitment>(
                  '/commitments',
                  200,
                  'خطا در دریافت ادامه لیست تعهدات',
                  cmtList.length,
                  cmtList,
                  cmtTotal,
                  {
                    concurrency: 2,
                    timeoutMs: 42000,
                    retries: 3,
                    onProgress: (itemsSoFar) => {
                      cmtList = itemsSoFar;
                      options?.onDomainProgress?.('commitments', itemsSoFar, false);
                    },
                  }
                );
                cmtList = full;
                options?.onDomainProgress?.('commitments', full, true);
              } catch (err: any) {
                if (Array.isArray(err?.partialItems) && err.partialItems.length > cmtList.length) {
                  cmtList = err.partialItems;
                  options?.onDomainProgress?.('commitments', cmtList, false);
                }
                partialErrors.push(err?.message || 'بخش تعهدات به صورت ناقص بارگذاری شد');
              }
            },
          });
        }

        if (urTotal > urList.length) {
          tasks.push({
            domain: 'unitReports',
            priority: priorityOf('unitReports'),
            run: async () => {
              try {
                const full = await fetchPaginatedCloudflareList<UnitOperationalReport>(
                  '/unit-reports',
                  200,
                  'خطا در دریافت ادامه گزارش واحدها',
                  urList.length,
                  urList,
                  urTotal,
                  {
                    concurrency: 2,
                    timeoutMs: 42000,
                    retries: 3,
                    onProgress: (itemsSoFar) => {
                      urList = itemsSoFar;
                      options?.onDomainProgress?.('unitReports', itemsSoFar, false);
                    },
                  }
                );
                urList = full;
                options?.onDomainProgress?.('unitReports', full, true);
              } catch (err: any) {
                if (Array.isArray(err?.partialItems) && err.partialItems.length > urList.length) {
                  urList = err.partialItems;
                  options?.onDomainProgress?.('unitReports', urList, false);
                }
                partialErrors.push(err?.message || 'بخش گزارش واحدها به صورت ناقص بارگذاری شد');
              }
            },
          });
        }

        // Run domain hydration sequentially in priority order so mobile connections never choke on 10 concurrent streams
        tasks.sort((a, b) => a.priority - b.priority);
        for (const task of tasks) {
          await task.run();
        }

        return {
          ...d,
          personnel: personnelList,
          karaneh: karanehList,
          payroll: payrollList,
          jobClassifications: jcList,
          commitments: cmtList,
          unitReports: urList,
          isLite: Boolean(d.lite),
          partialErrors: partialErrors.length > 0 ? partialErrors : undefined,
        };
      }
    }

    const [pData, kData, kpData, payData, jData, jcData, cData, volData, machData, urData, uData, sData] = await Promise.all([
      api.getPersonnel({ lite: wantLite }),
      api.getKaraneh(),
      api.getKaranehUnitPersonnel().catch(() => [] as Personnel[]),
      wantLite ? Promise.resolve([] as PayrollRecord[]) : api.getPayroll(),
      api.getJobGroups(),
      api.getJobClassifications(),
      api.getCommitments(),
      api.getMiningVolumes(),
      api.getMiningMachinery(),
      api.getUnitReports(),
      api.getUsers(),
      api.getDatabaseStatus(),
    ]);

    const fallbackBundle = {
      personnel: pData || [],
      karaneh: kData || [],
      karanehPersonnel: kpData || [],
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
      isLite: wantLite,
    };
    options?.onFirstPaint?.(fallbackBundle);
    return fallbackBundle;
  },

  async getDatabaseStatus(): Promise<DatabaseStatus> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getDatabaseStatus();
    const json = await callBackend('/database/status');
    if (!json || json.success === false || !json.data) {
      throw new Error(json?.message || 'خطا در دریافت وضعیت پایگاه داده');
    }
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(url, { headers: getHeaders(engine === 'php'), signal: controller.signal, cache: 'no-store' });
      if (!res.ok) return false;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `negin_parto_nasr_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      return true;
    } finally {
      clearTimeout(timer);
    }
  },

  async restoreDatabase(
    backupData: any,
    onProgress?: (info: { stage: string; doneRows: number; totalRows: number }) => void
  ) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.restoreDatabase(backupData);
    if (engine === 'cloudflare') {
      const tableKeys: Array<{ key: string; label: string; batchSize: number }> = [
        { key: 'users', label: 'کاربران و دسترسی‌ها', batchSize: 60 },
        { key: 'jobGroups', label: 'گروه‌های شغلی', batchSize: 150 },
        { key: 'jobClassifications', label: 'طبقه‌بندی مشاغل', batchSize: 100 },
        { key: 'personnel', label: 'پرونده پرسنلی و مدارک', batchSize: 50 },
        { key: 'karaneh', label: 'کارانه و کارانه نهایی', batchSize: 150 },
        { key: 'commitments', label: 'اسناد تعهدات', batchSize: 100 },
        { key: 'payroll', label: 'فیش‌های حقوق ۲۲۶ ستونی', batchSize: 40 },
        { key: 'miningVolumes', label: 'حجم عملیات معدن', batchSize: 120 },
        { key: 'miningMachinery', label: 'ماشین‌آلات تعمیرگاه', batchSize: 120 },
        { key: 'unitReports', label: 'گزارش‌های واحدها', batchSize: 120 },
        { key: 'auditLogs', label: 'گزارش‌های امنیت و عملکرد', batchSize: 150 },
      ];
      const totalRows = tableKeys.reduce(
        (sum, t) => sum + (Array.isArray(backupData?.[t.key]) ? backupData[t.key].length : 0),
        0
      );
      if (totalRows > 50) {
        onProgress?.({ stage: 'پاکسازی جداول قبلی...', doneRows: 0, totalRows });
        await callBackend('/database/restore-chunk', {
          method: 'POST',
          body: { clearAll: true, mode: 'replace' },
          timeoutMs: 45000,
        });

        let doneRows = 0;
        const sendSliceResilient = async (key: string, label: string, slice: any[]) => {
          try {
            const res = await callBackend('/database/restore-chunk', {
              method: 'POST',
              body: { table: key, items: slice, mode: 'replace' },
              timeoutMs: 45000,
            });
            if (!res?.success) {
              throw new Error(res?.message || `خطا در بازیابی بخش ${label}`);
            }
          } catch (err: any) {
            if (slice.length <= 5) throw err;
            const mid = Math.ceil(slice.length / 2);
            await sendSliceResilient(key, label, slice.slice(0, mid));
            await sendSliceResilient(key, label, slice.slice(mid));
          }
        };

        for (const { key, label, batchSize } of tableKeys) {
          const rows = Array.isArray(backupData?.[key]) ? backupData[key] : [];
          for (let i = 0; i < rows.length; i += batchSize) {
            const slice = rows.slice(i, i + batchSize);
            onProgress?.({ stage: `در حال بازیابی ${label}...`, doneRows, totalRows });
            await sendSliceResilient(key, label, slice);
            doneRows += slice.length;
            onProgress?.({ stage: `در حال بازیابی ${label}...`, doneRows, totalRows });
          }
        }
        onProgress?.({ stage: 'تثبیت نهایی دیتابیس...', doneRows: totalRows, totalRows });
        return callBackend('/database/restore-chunk', {
          method: 'POST',
          body: { finalize: true, mode: 'replace' },
          timeoutMs: 30000,
        });
      }
    }
    return callBackend('/database/restore', { method: 'POST', body: backupData, timeoutMs: 120000 });
  },

  async exportDatabaseSnapshot() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.exportDatabaseSnapshot();
    return callBackend('/database/export-snapshot', { timeoutMs: 90000 });
  },

  async mergeFirestoreSnapshot(snapshot: any) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.mergeFirestoreSnapshot(snapshot);
    if (engine === 'cloudflare') {
      const tableKeys: Array<{ key: string; batchSize: number }> = [
        { key: 'users', batchSize: 100 },
        { key: 'jobGroups', batchSize: 200 },
        { key: 'jobClassifications', batchSize: 120 },
        { key: 'personnel', batchSize: 80 },
        { key: 'karaneh', batchSize: 200 },
        { key: 'commitments', batchSize: 150 },
        { key: 'payroll', batchSize: 60 },
        { key: 'miningVolumes', batchSize: 150 },
        { key: 'miningMachinery', batchSize: 150 },
        { key: 'unitReports', batchSize: 150 },
        { key: 'auditLogs', batchSize: 150 },
      ];
      const totalRows = tableKeys.reduce(
        (sum, t) => sum + (Array.isArray(snapshot?.[t.key]) ? snapshot[t.key].length : 0),
        0
      );
      if (totalRows > 200) {
        for (const { key, batchSize } of tableKeys) {
          const rows = Array.isArray(snapshot?.[key]) ? snapshot[key] : [];
          for (let i = 0; i < rows.length; i += batchSize) {
            const slice = rows.slice(i, i + batchSize);
            const res = await callBackend('/database/restore-chunk', {
              method: 'POST',
              body: { table: key, items: slice, mode: 'merge' },
              timeoutMs: 45000,
            });
            if (!res?.success) return res;
          }
        }
        return callBackend('/database/restore-chunk', {
          method: 'POST',
          body: { finalize: true, mode: 'merge' },
          timeoutMs: 30000,
        });
      }
    }
    return callBackend('/database/merge-firestore', { method: 'POST', body: snapshot, timeoutMs: 90000 });
  },

  async resetDemo() {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.resetDemo();
    return callBackend('/database/reset-demo', { method: 'POST' });
  },

  async getAuditLogs(params?: {
    limit?: number;
    offset?: number;
    userId?: string;
    module?: string;
    action?: string;
    search?: string;
  }): Promise<{ data: SecurityAuditLog[]; total: number; limit: number; offset: number; hasMore: boolean }> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') {
      return embeddedDb.getAuditLogs(params);
    }
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.module) qs.set('module', params.module);
    if (params?.action) qs.set('action', params.action);
    if (params?.search) qs.set('search', params.search);
    const qStr = qs.toString();
    const json = await callBackend(`/audit-logs${qStr ? `?${qStr}` : ''}`, { timeoutMs: 25000, retries: 1 });
    if (!json || json.success === false) {
      throw new Error(json?.message || 'خطا در دریافت تاریخچه امنیت و عملکرد کاربران');
    }
    return {
      data: Array.isArray(json.data) ? json.data : [],
      total: Number(json.total ?? (Array.isArray(json.data) ? json.data.length : 0)),
      limit: Number(json.limit ?? params?.limit ?? 100),
      offset: Number(json.offset ?? params?.offset ?? 0),
      hasMore: Boolean(json.hasMore),
    };
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
