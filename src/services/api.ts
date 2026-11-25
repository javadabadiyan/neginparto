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
        requestBody = gzBlob;
      } else {
        requestBody = rawJson;
      }
    } else {
      requestBody = rawJson;
    }
  }

  const timeoutMs = options.timeoutMs ?? 30000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timerId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  let text = '';
  try {
    res = await fetch(url, {
      method: fetchMethod,
      headers,
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
    await new Promise((r) => setTimeout(r, 550 * (attempt + 1)));
  }
  return lastRes;
}

function compactRowForUpload(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('ستون_')) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) continue;
      out[k] = t;
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
  sendChunk: (chunk: any[], chunkIndex: number, totalChunks: number) => Promise<any>,
  concurrency = 3
): Promise<any> {
  const nonEmptyItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0)
    : [];
  if (nonEmptyItems.length === 0) {
    return { success: false, message: 'هیچ ردیف معتبری در فایل اکسل برای ثبت وجود ندارد.' };
  }

  const totalRows = nonEmptyItems.length;
  const initialChunkSize = Math.max(1, Math.min(chunkSize, totalRows));
  const minChunkSize = Math.min(initialChunkSize, 12);
  const maxConcurrency = Math.max(1, Math.min(5, concurrency));
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
      minRetries: number;
    }

    let nextCursor = 0;
    const pendingRanges: BatchRange[] = [];
    let currentChunkSize = initialChunkSize;
    let activeConcurrency = Math.min(maxConcurrency, 2);
    let successStreak = 0;

    const getRangeKeys = (r: BatchRange): string[] => {
      const keys: string[] = [];
      for (let idx = r.start; idx < r.end; idx++) {
        const k = extractBatchOverlapKey(nonEmptyItems[idx]);
        if (k) keys.push(k);
      }
      return keys;
    };

    const estimateTotalChunks = (inFlightCount: number) => {
      const remainingUnqueued = Math.max(0, totalRows - nextCursor);
      return Math.max(
        completedChunks + inFlightCount + pendingRanges.length,
        completedChunks + inFlightCount + pendingRanges.length + Math.ceil(remainingUnqueued / Math.max(1, currentChunkSize))
      );
    };

    while (pendingRanges.length > 0 || nextCursor < totalRows) {
      const wave: BatchRange[] = [];
      const waveKeys = new Set<string>();

      const tryAddToWave = (candidate: BatchRange): boolean => {
        const keys = getRangeKeys(candidate);
        if (wave.length > 0) {
          for (let i = 0; i < keys.length; i++) {
            if (waveKeys.has(keys[i])) return false;
          }
        }
        for (let i = 0; i < keys.length; i++) waveKeys.add(keys[i]);
        wave.push(candidate);
        return true;
      };

      while (wave.length < activeConcurrency && pendingRanges.length > 0) {
        const nextPending = pendingRanges[0];
        if (!tryAddToWave(nextPending)) break;
        pendingRanges.shift();
      }

      while (wave.length < activeConcurrency && nextCursor < totalRows) {
        const end = Math.min(totalRows, nextCursor + currentChunkSize);
        const candidate: BatchRange = { start: nextCursor, end, minRetries: 0 };
        if (!tryAddToWave(candidate)) break;
        nextCursor = end;
      }

      const estTotal = estimateTotalChunks(wave.length);
      const results = await Promise.all(
        wave.map(async (range, idx) => {
          const slice = nonEmptyItems.slice(range.start, range.end);
          const res = await sendChunk(slice, completedChunks + idx, estTotal);
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

            const liveSaved =
              totalInserted + totalUpdated + (totalInserted + totalUpdated === 0 ? totalMatched + totalAddedRelatives : 0);
            const liveTotalChunks = Math.max(
              completedChunks,
              completedChunks + pendingRanges.length + Math.ceil(Math.max(0, totalRows - nextCursor) / Math.max(1, currentChunkSize))
            );
            emitBatchImportProgress({
              active: true,
              processedRows,
              totalRows,
              completedChunks,
              totalChunks: liveTotalChunks,
              savedRows: liveSaved,
              failedRows,
            });
          }
          return { range, res };
        })
      );

      let anyFailed = false;
      const retryQueuePushFront: BatchRange[] = [];
      let needsBackoff = false;

      for (const { range, res } of results) {
        if (res && res.success) continue;

        if (isAuthErr(res)) {
          const baseMsg = res?.message || 'دسترسی یا نشست کاربری معتبر نیست.';
          const savedSoFar = totalInserted + totalUpdated;
          const savedNote = savedSoFar > 0 ? ` (${savedSoFar} ردیف تا پیش از این مرحله ثبت شد)` : '';
          const progressNote = estTotal > 1 ? ` (توقف در دسته ${completedChunks + 1} از ${estTotal}${savedNote})` : '';
          return { success: false, message: `${baseMsg}${progressNote}`, data: res?.data };
        }

        if (res?.message) lastFailureMessage = res.message;
        anyFailed = true;
        const sliceLen = range.end - range.start;

        if (isRetryable(res) && sliceLen > minChunkSize) {
          const splitSize = Math.max(minChunkSize, Math.floor(sliceLen / 2));
          for (let s = range.start; s < range.end; s += splitSize) {
            retryQueuePushFront.push({
              start: s,
              end: Math.min(range.end, s + splitSize),
              minRetries: 0,
            });
          }
          continue;
        }

        if (isRetryable(res) && range.minRetries < 2) {
          needsBackoff = true;
          retryQueuePushFront.push({
            start: range.start,
            end: range.end,
            minRetries: range.minRetries + 1,
          });
          continue;
        }

        const baseMsg = lastFailureMessage || 'خطای ارتباط با سرور پایگاه داده.';
        const savedSoFar = totalInserted + totalUpdated;
        const savedNote = savedSoFar > 0 ? ` (${savedSoFar} ردیف تا پیش از این مرحله ثبت شد)` : '';
        const progressNote = estTotal > 1 ? ` (توقف در دسته ${completedChunks + 1} از ${estTotal}${savedNote})` : '';
        return {
          success: false,
          message: `${baseMsg}${progressNote}`,
          data: res?.data,
        };
      }

      if (anyFailed) {
        successStreak = 0;
        activeConcurrency = Math.max(1, Math.floor(activeConcurrency / 2));
        currentChunkSize = Math.max(minChunkSize, Math.floor(currentChunkSize / 2));
        if (retryQueuePushFront.length > 0) {
          pendingRanges.unshift(...retryQueuePushFront);
        }
        emitBatchImportProgress({
          active: true,
          processedRows,
          totalRows,
          completedChunks,
          totalChunks: estimateTotalChunks(0),
          savedRows: totalInserted + totalUpdated,
          failedRows,
        });
        if (needsBackoff) {
          await new Promise((r) => setTimeout(r, 450));
        }
      } else {
        successStreak += wave.length;
        if (activeConcurrency < maxConcurrency) {
          activeConcurrency = maxConcurrency;
        }
        if (successStreak >= 2 && currentChunkSize < initialChunkSize) {
          currentChunkSize = Math.min(initialChunkSize, Math.round(currentChunkSize * 1.5));
          successStreak = 0;
        }
      }
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
  knownTotal?: number
): Promise<T[]> {
  const sep = baseRoute.includes('?') ? '&' : '?';
  let results = [...initialItems];
  let offset = startOffset;

  const first = await callBackend(`${baseRoute}${sep}limit=${pageSize}&offset=${offset}`, { timeoutMs: 45000, retries: 2 });
  const firstBatch = unwrapArrayResponse<T>(first, fallbackError);
  results = results.concat(firstBatch);

  const total = typeof first?.total === 'number' ? first.total : knownTotal ?? results.length;
  const hasMore = first?.hasMore !== undefined ? Boolean(first.hasMore) : firstBatch.length === pageSize && results.length < total;
  if (!hasMore || firstBatch.length === 0) return results;

  const offsets: number[] = [];
  for (let next = offset + firstBatch.length; next < total; next += pageSize) {
    offsets.push(next);
  }
  // Fetch remaining pages in waves of 3 concurrent read requests for fast table loading
  for (let i = 0; i < offsets.length; i += 3) {
    const wave = offsets.slice(i, i + 3);
    const pages = await Promise.all(
      wave.map((off) =>
        callBackend(`${baseRoute}${sep}limit=${pageSize}&offset=${off}`, { timeoutMs: 45000, retries: 2 }).then((r) =>
          unwrapArrayResponse<T>(r, fallbackError)
        )
      )
    );
    for (const p of pages) {
      results = results.concat(p);
    }
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
      25,
      (chunk) => callBackend('/users/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 25000, compress: true }),
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
  async getPersonnel(options?: { lite?: boolean }): Promise<Personnel[]> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getPersonnel();
    if (engine === 'cloudflare') {
      const route = options?.lite ? '/personnel?lite=1' : '/personnel';
      return fetchPaginatedCloudflareList<Personnel>(route, options?.lite ? 800 : 300, 'خطا در دریافت اطلاعات پرسنل');
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
      220,
      (chunk) => callBackend('/personnel/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 18000, compress: true }),
      4
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
      (chunk) => callBackend('/personnel/relatives/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 18000, compress: true }),
      3
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
      return fetchPaginatedCloudflareList<KaranehRecord>(route, 1000, 'خطا در دریافت اطلاعات کارانه');
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
      350,
      (chunk) => callBackend('/karaneh/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk, { period }), timeoutMs: 18000, compress: true }),
      4
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
      250,
      (chunk) => callBackend('/job-classifications/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 18000, compress: true }),
      4
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
      250,
      (chunk) => callBackend('/commitments/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 18000, compress: true }),
      4
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
    if (engine === 'cloudflare') {
      return fetchPaginatedCloudflareList<PayrollRecord>(route, 250, 'خطا در دریافت لیست حقوق و دستمزد');
    }
    const json = await callBackend(route, { timeoutMs: 45000 });
    return unwrapArrayResponse<PayrollRecord>(json, 'خطا در دریافت لیست حقوق و دستمزد');
  },

  async batchImportPayroll(period: string, items: any[], useRowYearMonth = true) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return runEmbeddedBatchWithProgress(items, () => embeddedDb.batchImportPayroll(period, items, useRowYearMonth));
    const compacted = Array.isArray(items) ? items.map(compactPayrollItemForUpload) : items;
    return sendBatchInChunks(
      compacted,
      100,
      (chunk) => callBackend('/payroll/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk, { period, useRowYearMonth }), timeoutMs: 24000, compress: true }),
      3
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
      (chunk) => callBackend('/mining-volumes/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 18000, compress: true }),
      3
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
      (chunk) => callBackend('/mining-machinery/batch-import', { method: 'POST', body: buildFastBatchBody(engine, chunk), timeoutMs: 18000, compress: true }),
      3
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
      150,
      (chunk) =>
        callBackend('/unit-reports/batch-import', {
          method: 'POST',
          body: buildFastBatchBody(engine, chunk, extra),
          timeoutMs: 18000,
          compress: true,
        }),
      3
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

  async getBootstrapData(options?: { lite?: boolean }): Promise<{
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
  }> {
    const engine = await detectStorageEngine();
    const wantLite = Boolean(options?.lite);
    if (engine === 'cloudflare') {
      const json = await callBackend(wantLite ? '/bootstrap?lite=1' : '/bootstrap', {
        timeoutMs: wantLite ? 45000 : 75000,
      });
      if (json?.success && json?.data) {
        const d = json.data;
        let personnelList: Personnel[] = Array.isArray(d.personnel) ? d.personnel : [];
        let karanehList: KaranehRecord[] = Array.isArray(d.karaneh) ? d.karaneh : [];
        let payrollList: PayrollRecord[] = Array.isArray(d.payroll) ? d.payroll : [];

        const personnelTotal = Number(d.personnelTotal ?? d.dbStatus?.totalPersonnel ?? personnelList.length);
        const karanehTotal = Number(d.karanehTotal ?? d.dbStatus?.totalKaranehRecords ?? karanehList.length);
        const payrollTotal = Number(d.payrollTotal ?? d.dbStatus?.totalPayrollRecords ?? payrollList.length);

        const extraLoads: Promise<void>[] = [];
        if (personnelTotal > personnelList.length) {
          extraLoads.push(
            fetchPaginatedCloudflareList<Personnel>(
              wantLite ? '/personnel?lite=1' : '/personnel',
              wantLite ? 800 : 300,
              'خطا در دریافت ادامه لیست پرسنل',
              personnelList.length,
              personnelList,
              personnelTotal
            ).then((full) => {
              personnelList = full;
            })
          );
        }
        if (karanehTotal > karanehList.length) {
          extraLoads.push(
            fetchPaginatedCloudflareList<KaranehRecord>(
              '/karaneh',
              1000,
              'خطا در دریافت ادامه لیست کارانه',
              karanehList.length,
              karanehList,
              karanehTotal
            ).then((full) => {
              karanehList = full;
            })
          );
        }
        if (!wantLite && payrollTotal > payrollList.length) {
          extraLoads.push(
            fetchPaginatedCloudflareList<PayrollRecord>(
              '/payroll',
              250,
              'خطا در دریافت ادامه لیست حقوق',
              payrollList.length,
              payrollList,
              payrollTotal
            ).then((full) => {
              payrollList = full;
            })
          );
        }
        if (extraLoads.length > 0) {
          await Promise.all(extraLoads);
        }

        return {
          ...d,
          personnel: personnelList,
          karaneh: karanehList,
          payroll: payrollList,
          isLite: Boolean(d.lite),
        };
      }
      if (json?.status !== 404) {
        throw new Error(json?.message || 'خطا در اتصال به سرور کلودفلر');
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

    return {
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
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(url, { headers: getHeaders(engine === 'php'), signal: controller.signal, cache: 'no-store' });
      if (!res.ok) return false;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `hr_database_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      return true;
    } finally {
      clearTimeout(timer);
    }
  },

  async restoreDatabase(backupData: any) {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.restoreDatabase(backupData);
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
      ];
      const totalRows = tableKeys.reduce(
        (sum, t) => sum + (Array.isArray(backupData?.[t.key]) ? backupData[t.key].length : 0),
        0
      );
      if (totalRows > 200) {
        await callBackend('/database/restore-chunk', {
          method: 'POST',
          body: { clearAll: true, mode: 'replace' },
          timeoutMs: 45000,
        });
        for (const { key, batchSize } of tableKeys) {
          const rows = Array.isArray(backupData?.[key]) ? backupData[key] : [];
          for (let i = 0; i < rows.length; i += batchSize) {
            const slice = rows.slice(i, i + batchSize);
            const res = await callBackend('/database/restore-chunk', {
              method: 'POST',
              body: { table: key, items: slice, mode: 'replace' },
              timeoutMs: 45000,
            });
            if (!res?.success) return res;
          }
        }
        return callBackend('/database/restore-chunk', {
          method: 'POST',
          body: { finalize: true, mode: 'replace' },
          timeoutMs: 30000,
        });
      }
    }
    return callBackend('/database/restore', { method: 'POST', body: backupData, timeoutMs: 90000 });
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
