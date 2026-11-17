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

export type StorageEngine = 'node' | 'php' | 'indexeddb';

let detectedEngine: StorageEngine | null = null;
let engineDetectPromise: Promise<StorageEngine> | null = null;

async function probeJsonEndpoint(url: string, expectedEngine: 'node' | 'php'): Promise<boolean> {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
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
      if (await probeJsonEndpoint('./api/health', 'node')) {
        detectedEngine = 'node';
        return 'node';
      }
      if (await probeJsonEndpoint('./api.php?r=/health', 'php')) {
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
  const url = isPhp ? buildPhpUrl(route, method) : `./api${route}`;
  const fetchMethod = isPhp && method !== 'GET' ? 'POST' : method;

  const res = await fetch(url, {
    method: fetchMethod,
    headers: getHeaders(isPhp),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (res.status === 401 && !options.skipAuthRedirect) {
    window.dispatchEvent(new CustomEvent('hr:unauthorized'));
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: 'پاسخ نامعتبر از سرور دریافت شد.',
    };
  }
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
    return callBackend('/users/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/personnel/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/personnel/relatives/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/karaneh/batch-import', { method: 'POST', body: { period, items } });
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
    return callBackend('/job-classifications/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/commitments/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/payroll/batch-import', { method: 'POST', body: { period, useRowYearMonth, items } });
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
    return callBackend('/mining-volumes/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/mining-machinery/batch-import', { method: 'POST', body: { items } });
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
    return callBackend('/unit-reports/batch-import', { method: 'POST', body: payload });
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

  // Database status & backup
  async getDatabaseStatus(): Promise<DatabaseStatus> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.getDatabaseStatus();
    const json = await callBackend('/database/status');
    return json.data;
  },

  async downloadBackup(): Promise<boolean> {
    const engine = await detectStorageEngine();
    if (engine === 'indexeddb') return embeddedDb.downloadBackup();
    const url = engine === 'php' ? buildPhpUrl('/database/backup', 'GET') : './api/database/backup';
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
};
