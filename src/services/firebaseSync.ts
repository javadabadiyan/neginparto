import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  auth,
  FIREBASE_META,
  BLUEPRINT_LIMITS,
  OperationType,
  handleFirestoreError,
} from '../firebase';
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
} from '../types';

export interface DatabaseSnapshot {
  users: User[];
  personnel: Personnel[];
  karaneh: KaranehRecord[];
  jobGroups: JobGroup[];
  jobClassifications: JobClassificationRecord[];
  commitments: PersonnelCommitment[];
  payroll: PayrollRecord[];
  miningVolumes?: MiningVolumeRecord[];
  miningMachinery?: MiningMachineryRecord[];
  unitReports?: UnitOperationalReport[];
}

export interface SyncSummary {
  users: number;
  personnel: number;
  relatives: number;
  documents: number;
  karaneh: number;
  jobGroups: number;
  jobClassifications: number;
  commitments: number;
  payroll: number;
  miningVolumes: number;
  miningMachinery: number;
  unitReports: number;
  skippedOversizedDocs: number;
}

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = val === undefined || val === null ? fallback : String(val).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeId(rawId: unknown, prefix = 'rec'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, BLUEPRINT_LIMITS.ID_MAX);
  return cleaned.length > 0 ? cleaned : `${prefix}_${Date.now()}`;
}

function toNonNegNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function normalizePeriod(raw: unknown): string {
  const s = String(raw || '').trim();
  if (BLUEPRINT_LIMITS.PERIOD_REGEX.test(s)) return s;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length >= 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  return '1403-01';
}

const EMPLOYMENT_TYPES = new Set(['رسمی', 'پیمانی', 'قراردادی', 'طرحی', 'شرکتی']);
const EMPLOYMENT_STATUSES = new Set(['فعال', 'مرخصی', 'ماموریت', 'قطع همکاری']);
const COMMITMENT_TYPES = new Set([
  'تعهد حسابداری',
  'تعهد خدمت',
  'سفته حسن انجام کار',
  'چک تضمین',
  'تعهد دوره‌های آموزشی',
  'محرمانگی و عدم رقابت',
]);
const COMMITMENT_STATUSES = new Set([
  'جاری و معتبر',
  'پایان یافته',
  'عودت داده شده',
  'به اجرا گذاشته شده',
]);

function getVerifiedUid(): string | null {
  const u = auth.currentUser;
  if (!u || !u.emailVerified) return null;
  return u.uid;
}

function isCurrentUserBootstrappedAdmin(): boolean {
  const u = auth.currentUser;
  return Boolean(
    u &&
      u.emailVerified &&
      u.email &&
      u.email.toLowerCase() === FIREBASE_META.superAdminEmail.toLowerCase()
  );
}

export async function ensureAdminRoleDoc(): Promise<void> {
  const u = auth.currentUser;
  if (!u || !u.emailVerified || !u.email) return;
  if (u.email.toLowerCase() !== FIREBASE_META.superAdminEmail.toLowerCase()) return;

  const uid = sanitizeId(u.uid, 'uid');
  const path = `admins/${uid}`;
  const ref = doc(db, 'admins', uid);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        uid,
        email: clampStr(u.email, BLUEPRINT_LIMITS.EMAIL_MAX),
        role: 'super_admin',
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

async function upsertDocClean(
  collectionName: string,
  docId: string,
  payload: Record<string, any>
): Promise<void> {
  const path = `${collectionName}/${docId}`;
  const ref = doc(db, collectionName, docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    const existingData = snap.data() || {};
    const updatePayload = {
      ...payload,
      ownerUid: existingData.ownerUid || payload.ownerUid,
      updatedAt: serverTimestamp(),
    };
    try {
      await updateDoc(ref, updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

function buildUserPayload(user: User, ownerUid: string) {
  const id = sanitizeId(user.id, 'u');
  const roleType =
    user.role === 'super_admin' || user.roleType === 'super_admin'
      ? 'super_admin'
      : user.roleType === 'viewer'
      ? 'viewer'
      : 'custom';
  return {
    id,
    account: {
      id,
      ownerUid,
      username: clampStr(user.username || id, BLUEPRINT_LIMITS.USERNAME_MAX, id),
      fullName: clampStr(user.fullName || user.username, 120, 'کاربر'),
      role: clampStr(user.role || 'viewer', 80, 'viewer'),
      roleType,
      department: clampStr(user.department || '', 120),
      isActive: user.isActive !== false,
      permissions: user.permissions || {},
    },
    privateInfo: {
      ownerUid,
      email: clampStr(user.email || '', BLUEPRINT_LIMITS.EMAIL_MAX),
      phone: '',
      lastLogin: clampStr(user.lastLogin || '', 64),
    },
  };
}

function buildPersonnelPayload(p: Personnel, ownerUid: string) {
  const id = sanitizeId(p.id, 'p');
  const empType = EMPLOYMENT_TYPES.has(p.employmentType) ? p.employmentType : 'قراردادی';
  const status = EMPLOYMENT_STATUSES.has(p.status) ? p.status : 'فعال';
  const hasDocs = Boolean(
    p.documents &&
      (p.documents.nationalCardImage ||
        (p.documents.shenasnamehPages && p.documents.shenasnamehPages.length > 0) ||
        (p.documents.spouseShenasnamehPages && p.documents.spouseShenasnamehPages.length > 0) ||
        (p.documents.children && p.documents.children.length > 0))
  );
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      employeeId: clampStr(p.employeeId || '', 64),
      personnelCode: clampStr(p.personnelCode || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      firstName: clampStr(p.firstName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      lastName: clampStr(p.lastName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      fullName: clampStr(p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'پرسنل', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'پرسنل'),
      fatherName: clampStr(p.fatherName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      shenasnamehNumber: clampStr(p.shenasnamehNumber || '', BLUEPRINT_LIMITS.CODE_MAX),
      nationalId: clampStr(p.nationalId || '', 20),
      nationality: clampStr(p.nationality || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      citizenship: clampStr(p.citizenship || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      gender: clampStr(p.gender || '', 32),
      position: clampStr(p.position || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      positionCode: clampStr(p.positionCode || '', BLUEPRINT_LIMITS.CODE_MAX),
      jobTitle: clampStr(p.jobTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      jobCode: clampStr(p.jobCode || '', BLUEPRINT_LIMITS.CODE_MAX),
      workLocation: clampStr(p.workLocation || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      department: clampStr(p.department || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      hireDate: clampStr(p.hireDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      birthPlace: clampStr(p.birthPlace || '', 120),
      issuePlace: clampStr(p.issuePlace || '', 120),
      birthDate: clampStr(p.birthDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      issueDate: clampStr(p.issueDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      maritalStatus: clampStr(p.maritalStatus || '', 40),
      militaryStatus: clampStr(p.militaryStatus || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      employmentType: empType,
      jobGroupId: p.jobGroupId ? sanitizeId(p.jobGroupId, 'jg') : '',
      jobGroupName: clampStr(p.jobGroupName || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      education: clampStr(p.education || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      fieldOfStudy: clampStr(p.fieldOfStudy || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      phone: clampStr(p.phone || '', BLUEPRINT_LIMITS.PHONE_MAX),
      email: clampStr(p.email || '', BLUEPRINT_LIMITS.EMAIL_MAX),
      status,
      baseSalary: toNonNegNum(p.baseSalary),
      notes: clampStr(p.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
      hasDocuments: hasDocs,
    },
  };
}

function buildKaranehPayload(k: KaranehRecord, ownerUid: string) {
  const id = sanitizeId(k.id, 'k');
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      personnelId: k.personnelId ? sanitizeId(k.personnelId, 'p') : '',
      personnelCode: clampStr(k.personnelCode || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      fullName: clampStr(k.fullName || 'پرسنل', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'پرسنل'),
      department: clampStr(k.department || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      position: clampStr(k.position || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      period: normalizePeriod(k.period),
      score: toNum(k.score ?? 0),
      performanceCoeff: toNum(k.performanceCoeff ?? 1),
      baseKaraneh: toNonNegNum(k.baseKaraneh),
      overtimeBonus: toNonNegNum(k.overtimeBonus),
      deductions: toNonNegNum(k.deductions),
      finalKaraneh: toNum(k.finalKaraneh),
      notes: clampStr(k.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
    },
  };
}

function buildJobGroupPayload(jg: JobGroup, ownerUid: string) {
  const id = sanitizeId(jg.id, 'jg');
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      code: clampStr(jg.code || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      title: clampStr(jg.title || 'گروه شغلی', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'گروه شغلی'),
      grade: toNonNegNum(jg.grade),
      minBaseSalary: toNonNegNum(jg.minBaseSalary),
      maxBaseSalary: toNonNegNum(jg.maxBaseSalary),
      maxKaranehCeiling: toNonNegNum(jg.maxKaranehCeiling),
      requiredExperienceYears: toNonNegNum(jg.requiredExperienceYears),
      requiredDegree: clampStr(jg.requiredDegree || '', 120),
      description: clampStr(jg.description || '', BLUEPRINT_LIMITS.NOTES_MAX),
    },
  };
}

function buildJobClassificationPayload(jc: JobClassificationRecord, ownerUid: string) {
  const id = sanitizeId(jc.id, 'jc');
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      personnelCode: clampStr(jc.personnelCode || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      firstName: clampStr(jc.firstName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      lastName: clampStr(jc.lastName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      workLocation: clampStr(jc.workLocation || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      department: clampStr(jc.department || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      nationalId: clampStr(jc.nationalId || '', 20),
      education: clampStr(jc.education || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      hireDate: clampStr(jc.hireDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      hireMonth: clampStr(jc.hireMonth || '', BLUEPRINT_LIMITS.DATE_MAX),
      miningExperienceDays: clampStr(jc.miningExperienceDays || '', BLUEPRINT_LIMITS.CODE_MAX),
      totalInsuranceHistory: clampStr(jc.totalInsuranceHistory || '', 64),
      miningExperience: clampStr(jc.miningExperience || '', 64),
      nonMiningExperience: clampStr(jc.nonMiningExperience || '', 64),
      jobGroup: clampStr(jc.jobGroup || '', 64),
      groupGapFrom1405: clampStr(jc.groupGapFrom1405 || '', 64),
      nextGroupGap: clampStr(jc.nextGroupGap || '', 64),
      jobTitle: clampStr(jc.jobTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      position: clampStr(jc.position || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
    },
  };
}

function buildCommitmentPayload(c: PersonnelCommitment, ownerUid: string) {
  const id = sanitizeId(c.id, 'cmt');
  const commitmentType = COMMITMENT_TYPES.has(c.commitmentType)
    ? c.commitmentType
    : 'تعهد حسابداری';
  const status = COMMITMENT_STATUSES.has(c.status) ? c.status : 'جاری و معتبر';
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      personnelId: c.personnelId ? sanitizeId(c.personnelId, 'p') : '',
      personnelCode: clampStr(c.personnelCode || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      personnelName: clampStr(c.personnelName || 'پرسنل', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'پرسنل'),
      commitmentType,
      documentNumber: clampStr(c.documentNumber || '', 80),
      amount: toNonNegNum(c.amount),
      previouslyTakenAmount: toNonNegNum(c.previouslyTakenAmount),
      maxAllowedAmount: toNonNegNum(c.maxAllowedAmount),
      startDate: clampStr(c.startDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      endDate: clampStr(c.endDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      status,
      isArchived: Boolean(c.isArchived),
      archivedAt: clampStr(c.archivedAt || '', BLUEPRINT_LIMITS.CODE_MAX),
      archiveCode: clampStr(c.archiveCode || '', BLUEPRINT_LIMITS.CODE_MAX),
      guarantorName: clampStr(c.guarantorName || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      notes: clampStr(c.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
    },
  };
}

function buildPayrollPayload(p: PayrollRecord, ownerUid: string) {
  const id = sanitizeId(p.id, 'pay');
  const boundedRaw: Record<string, string | number> = {};
  if (p.rawFields && typeof p.rawFields === 'object') {
    const entries = Object.entries(p.rawFields).slice(0, BLUEPRINT_LIMITS.RAW_FIELDS_MAX_KEYS);
    for (const [k, v] of entries) {
      if (v !== undefined && v !== null) {
        boundedRaw[String(k).slice(0, 120)] =
          typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : clampStr(v, 300);
      }
    }
  }

  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      period: normalizePeriod(p.period),
      yearMonthLabel: clampStr(p.yearMonthLabel || '', 24),
      employeeId: clampStr(p.employeeId || '', 64),
      personnelCode: clampStr(p.personnelCode || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      firstName: clampStr(p.firstName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      lastName: clampStr(p.lastName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      fullName: clampStr(p.fullName || 'پرسنل', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'پرسنل'),
      nationalId: clampStr(p.nationalId || '', 20),
      workLocation: clampStr(p.workLocation || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      department: clampStr(p.department || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      jobTitle: clampStr(p.jobTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      position: clampStr(p.position || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      jobGroupCode: clampStr(p.jobGroupCode || '', BLUEPRINT_LIMITS.CODE_MAX),
      jobGroupTitle: clampStr(p.jobGroupTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      employmentType: clampStr(p.employmentType || '', BLUEPRINT_LIMITS.CODE_MAX),
      effectiveDays: toNum(p.effectiveDays),
      netPayable: toNum(p.netPayable),
      totalBenefits: toNum(p.totalBenefits),
      overtimeAmount: toNum(p.overtimeAmount),
      fridayWorkAmount: toNum(p.fridayWorkAmount),
      missionAmount: toNum(p.missionAmount),
      bonusAmount: toNum(p.bonusAmount),
      incentiveAmount: toNum(p.incentiveAmount),
      otherBenefits: toNum(p.otherBenefits),
      arrearsAmount: toNum(p.arrearsAmount),
      advanceAmount: toNum(p.advanceAmount),
      totalDeductions: toNum(p.totalDeductions),
      taxAmount: toNum(p.taxAmount),
      salaryTaxAmount: toNum(p.salaryTaxAmount),
      jobWage: toNum(p.jobWage),
      totalOrderFactors: toNum(p.totalOrderFactors),
      baseSalaryOrder: toNum(p.baseSalaryOrder),
      overtimeHours: toNum(p.overtimeHours),
      fridayWorkHours: toNum(p.fridayWorkHours),
      costCenterCode: clampStr(p.costCenterCode || '', 64),
      costCenterTitle: clampStr(p.costCenterTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      projectCode: clampStr(p.projectCode || '', 64),
      projectTitle: clampStr(p.projectTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      bankName: clampStr(p.bankName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      bankAccount: clampStr(p.bankAccount || '', 64),
      rawFields: boundedRaw,
    },
  };
}

const MACHINERY_STATUSES = new Set([
  'آماده به کار',
  'خراب / در تعمیرگاه',
  'در انتظار قطعه',
  'سرویس دوره‌ای',
]);

function buildMiningVolumePayload(v: MiningVolumeRecord, ownerUid: string) {
  const id = sanitizeId(v.id, 'mv');
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      period: normalizePeriod(v.period),
      unitName: clampStr(v.unitName || 'استخراج و معدن‌کاری', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'استخراج و معدن‌کاری'),
      activityType: clampStr(v.activityType || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      metricTitle: clampStr(v.metricTitle || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      volumeValue: toNonNegNum(v.volumeValue),
      targetVolume: toNonNegNum(v.targetVolume),
      unitLabel: clampStr(v.unitLabel || 'تن', BLUEPRINT_LIMITS.CODE_MAX),
      status: clampStr(v.status || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      notes: clampStr(v.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
    },
  };
}

function buildMiningMachineryPayload(m: MiningMachineryRecord, ownerUid: string) {
  const id = sanitizeId(m.id, 'mm');
  const status = MACHINERY_STATUSES.has(m.status) ? m.status : 'آماده به کار';
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      machineCode: clampStr(m.machineCode || id, BLUEPRINT_LIMITS.CODE_MAX, id),
      machineName: clampStr(m.machineName || 'تجهیز معدنی', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'تجهیز معدنی'),
      machineType: clampStr(m.machineType || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      unitName: clampStr(m.unitName || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      status,
      issueDescription: clampStr(m.issueDescription || '', BLUEPRINT_LIMITS.NOTES_MAX),
      stoppedSince: clampStr(m.stoppedSince || '', BLUEPRINT_LIMITS.DATE_MAX),
      estimatedReadyDate: clampStr(m.estimatedReadyDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      operatorName: clampStr(m.operatorName || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      notes: clampStr(m.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
    },
  };
}

function buildUnitReportPayload(r: UnitOperationalReport, ownerUid: string) {
  const id = sanitizeId(r.id, 'ur');
  const boundedRaw: Record<string, string | number> = {};
  if (r.rawFields && typeof r.rawFields === 'object') {
    const entries = Object.entries(r.rawFields).slice(0, 120);
    for (const [k, v] of entries) {
      if (v !== undefined && v !== null) {
        boundedRaw[String(k).slice(0, 120)] =
          typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : clampStr(v, 300);
      }
    }
  }
  return {
    id,
    data: {
      id,
      ownerUid,
      accessUids: [ownerUid],
      period: normalizePeriod(r.period),
      unitName: clampStr(r.unitName || 'استخراج و معدن‌کاری', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'استخراج و معدن‌کاری'),
      reportCategory: clampStr(r.reportCategory || 'عملیاتی', 120),
      metricName: clampStr(r.metricName || 'گزارش واحد', 200, 'گزارش واحد'),
      actualValue: toNum(r.actualValue),
      previousValue: toNum(r.previousValue ?? 0),
      targetValue: toNum(r.targetValue ?? 0),
      unitLabel: clampStr(r.unitLabel || 'عدد', BLUEPRINT_LIMITS.CODE_MAX),
      status: clampStr(r.status || 'ثبت‌شده', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      submittedBy: clampStr(r.submittedBy || '', 120),
      notes: clampStr(r.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
      rawFields: boundedRaw,
    },
  };
}

async function syncPersonnelDocuments(
  personnel: Personnel,
  ownerUid: string
): Promise<{ uploaded: number; skipped: number }> {
  let uploaded = 0;
  let skipped = 0;
  const docs = personnel.documents;
  if (!docs) return { uploaded, skipped };

  const personnelId = sanitizeId(personnel.id, 'p');
  const items: Array<{ docId: string; docType: string; label: string; dataUrl: string }> = [];

  if (docs.nationalCardImage) {
    items.push({
      docId: 'national_card_1',
      docType: 'national_card',
      label: 'کارت ملی',
      dataUrl: docs.nationalCardImage,
    });
  }
  (docs.shenasnamehPages || []).forEach((dataUrl, i) => {
    items.push({
      docId: `shenasnameh_${i + 1}`,
      docType: 'shenasnameh',
      label: `صفحه ${i + 1} شناسنامه`,
      dataUrl,
    });
  });
  (docs.spouseShenasnamehPages || []).forEach((dataUrl, i) => {
    items.push({
      docId: `spouse_shenasnameh_${i + 1}`,
      docType: 'spouse_shenasnameh',
      label: `صفحه ${i + 1} شناسنامه همسر (${docs.spouseName || ''})`,
      dataUrl,
    });
  });
  (docs.children || []).forEach((child, cIdx) => {
    (child.shenasnamehPages || []).forEach((dataUrl, pIdx) => {
      items.push({
        docId: `child_${cIdx + 1}_page_${pIdx + 1}`,
        docType: 'child_shenasnameh',
        label: `شناسنامه فرزند (${child.fullName || ''})`,
        dataUrl,
      });
    });
  });

  for (const item of items) {
    if (item.dataUrl.length > BLUEPRINT_LIMITS.DOC_DATA_URL_MAX) {
      skipped++;
      continue;
    }
    const subColPath = `personnel/${personnelId}/documents`;
    const fullPath = `${subColPath}/${item.docId}`;
    const ref = doc(db, 'personnel', personnelId, 'documents', item.docId);
    let snap;
    try {
      snap = await getDoc(ref);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, fullPath);
    }
    if (!snap.exists()) {
      try {
        await setDoc(ref, {
          id: item.docId,
          personnelId,
          ownerUid,
          docType: item.docType,
          label: clampStr(item.label, BLUEPRINT_LIMITS.FULL_NAME_MAX),
          dataUrl: item.dataUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploaded++;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, fullPath);
      }
    } else {
      try {
        await updateDoc(ref, {
          label: clampStr(item.label, BLUEPRINT_LIMITS.FULL_NAME_MAX),
          dataUrl: item.dataUrl,
          updatedAt: serverTimestamp(),
        });
        uploaded++;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, fullPath);
      }
    }
  }

  return { uploaded, skipped };
}

async function syncPersonnelRelatives(
  personnel: Personnel,
  ownerUid: string
): Promise<number> {
  const relatives = Array.isArray(personnel.relatives) ? personnel.relatives : [];
  if (relatives.length === 0) return 0;

  const personnelId = sanitizeId(personnel.id, 'p');
  let uploaded = 0;

  for (const rel of relatives) {
    const relId = sanitizeId(rel.id, 'rel');
    const fullPath = `personnel/${personnelId}/relatives/${relId}`;
    const ref = doc(db, 'personnel', personnelId, 'relatives', relId);
    const payload = {
      id: relId,
      personnelId,
      ownerUid,
      personnelCode: clampStr(rel.personnelCode || personnel.personnelCode || '', BLUEPRINT_LIMITS.CODE_MAX),
      personnelName: clampStr(rel.personnelName || personnel.fullName || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      fullName: clampStr(rel.fullName || 'عضو خانواده', BLUEPRINT_LIMITS.FULL_NAME_MAX, 'عضو خانواده'),
      relation: clampStr(rel.relation || 'سایر', BLUEPRINT_LIMITS.CODE_MAX, 'سایر'),
      nationalId: clampStr(rel.nationalId || '', 20),
      shenasnamehNumber: clampStr(rel.shenasnamehNumber || '', BLUEPRINT_LIMITS.CODE_MAX),
      fatherName: clampStr(rel.fatherName || '', BLUEPRINT_LIMITS.SHORT_NAME_MAX),
      birthDate: clampStr(rel.birthDate || '', BLUEPRINT_LIMITS.DATE_MAX),
      gender: clampStr(rel.gender || '', 32),
      phone: clampStr(rel.phone || '', BLUEPRINT_LIMITS.PHONE_MAX),
      education: clampStr(rel.education || '', BLUEPRINT_LIMITS.FULL_NAME_MAX),
      isDependent: Boolean(rel.isDependent),
      insuranceCovered: Boolean(rel.insuranceCovered),
      notes: clampStr(rel.notes || '', BLUEPRINT_LIMITS.NOTES_MAX),
    };

    let snap;
    try {
      snap = await getDoc(ref);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, fullPath);
    }
    if (!snap.exists()) {
      try {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploaded++;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, fullPath);
      }
    } else {
      try {
        const existingData = snap.data() || {};
        await updateDoc(ref, {
          ...payload,
          ownerUid: existingData.ownerUid || ownerUid,
          updatedAt: serverTimestamp(),
        });
        uploaded++;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, fullPath);
      }
    }
  }

  return uploaded;
}

export async function syncSnapshotToFirestore(snapshot: DatabaseSnapshot): Promise<SyncSummary> {
  const ownerUid = getVerifiedUid();
  if (!ownerUid) {
    throw new Error('ابتدا باید با حساب گوگل تأییدشده وارد Firebase شوید.');
  }

  await ensureAdminRoleDoc();

  const summary: SyncSummary = {
    users: 0,
    personnel: 0,
    relatives: 0,
    documents: 0,
    karaneh: 0,
    jobGroups: 0,
    jobClassifications: 0,
    commitments: 0,
    payroll: 0,
    miningVolumes: 0,
    miningMachinery: 0,
    unitReports: 0,
    skippedOversizedDocs: 0,
  };

  for (const jg of snapshot.jobGroups || []) {
    const built = buildJobGroupPayload(jg, ownerUid);
    await upsertDocClean('jobGroups', built.id, built.data);
    summary.jobGroups++;
  }

  for (const p of snapshot.personnel || []) {
    const built = buildPersonnelPayload(p, ownerUid);
    await upsertDocClean('personnel', built.id, built.data);
    summary.personnel++;
    const relCount = await syncPersonnelRelatives(p, ownerUid);
    summary.relatives += relCount;
    const docRes = await syncPersonnelDocuments(p, ownerUid);
    summary.documents += docRes.uploaded;
    summary.skippedOversizedDocs += docRes.skipped;
  }

  for (const k of snapshot.karaneh || []) {
    const built = buildKaranehPayload(k, ownerUid);
    await upsertDocClean('karaneh', built.id, built.data);
    summary.karaneh++;
  }

  for (const jc of snapshot.jobClassifications || []) {
    const built = buildJobClassificationPayload(jc, ownerUid);
    await upsertDocClean('jobClassifications', built.id, built.data);
    summary.jobClassifications++;
  }

  for (const c of snapshot.commitments || []) {
    const built = buildCommitmentPayload(c, ownerUid);
    await upsertDocClean('commitments', built.id, built.data);
    summary.commitments++;
  }

  for (const pay of snapshot.payroll || []) {
    const built = buildPayrollPayload(pay, ownerUid);
    await upsertDocClean('payroll', built.id, built.data);
    summary.payroll++;
  }

  for (const mv of snapshot.miningVolumes || []) {
    const built = buildMiningVolumePayload(mv, ownerUid);
    await upsertDocClean('miningVolumes', built.id, built.data);
    summary.miningVolumes++;
  }

  for (const mm of snapshot.miningMachinery || []) {
    const built = buildMiningMachineryPayload(mm, ownerUid);
    await upsertDocClean('miningMachinery', built.id, built.data);
    summary.miningMachinery++;
  }

  for (const ur of snapshot.unitReports || []) {
    const built = buildUnitReportPayload(ur, ownerUid);
    await upsertDocClean('unitReports', built.id, built.data);
    summary.unitReports++;
  }

  for (const u of snapshot.users || []) {
    const built = buildUserPayload(u, ownerUid);
    await upsertDocClean('users', built.id, built.account);
    const privPath = `users/${built.id}/private/info`;
    const privRef = doc(db, 'users', built.id, 'private', 'info');
    let snap;
    try {
      snap = await getDoc(privRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, privPath);
    }
    if (!snap.exists()) {
      try {
        await setDoc(privRef, {
          ...built.privateInfo,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, privPath);
      }
    } else {
      try {
        await updateDoc(privRef, {
          ...built.privateInfo,
          ownerUid: snap.data()?.ownerUid || ownerUid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, privPath);
      }
    }
    summary.users++;
  }

  return summary;
}

async function fetchScopedCollection(colName: string, uid: string): Promise<any[]> {
  const path = colName;
  const colRef = collection(db, colName);
  const q = isCurrentUserBootstrappedAdmin()
    ? colRef
    : query(colRef, where('ownerUid', '==', uid));

  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const { ownerUid: _o, accessUids: _a, ...clean } = data;
      return {
        ...clean,
        createdAt:
          typeof data.createdAt?.toDate === 'function'
            ? data.createdAt.toDate().toLocaleDateString('fa-IR')
            : data.createdAt || '',
        updatedAt:
          typeof data.updatedAt?.toDate === 'function'
            ? data.updatedAt.toDate().toLocaleDateString('fa-IR')
            : data.updatedAt || '',
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function pullSnapshotFromFirestore(): Promise<DatabaseSnapshot> {
  const uid = getVerifiedUid();
  if (!uid) {
    throw new Error('ابتدا باید با حساب گوگل تأییدشده وارد Firebase شوید.');
  }

  const [users, personnel, karaneh, jobGroups, jobClassifications, commitments, payroll, miningVolumes, miningMachinery, unitReports] =
    await Promise.all([
      fetchScopedCollection('users', uid),
      fetchScopedCollection('personnel', uid),
      fetchScopedCollection('karaneh', uid),
      fetchScopedCollection('jobGroups', uid),
      fetchScopedCollection('jobClassifications', uid),
      fetchScopedCollection('commitments', uid),
      fetchScopedCollection('payroll', uid),
      fetchScopedCollection('miningVolumes', uid),
      fetchScopedCollection('miningMachinery', uid),
      fetchScopedCollection('unitReports', uid),
    ]);

  // Pull family relatives subcollection for each personnel record
  const personnelWithRelatives = await Promise.all(
    personnel.map(async (p) => {
      const pid = sanitizeId(p.id, 'p');
      try {
        const relCol = collection(db, 'personnel', pid, 'relatives');
        const relQ = isCurrentUserBootstrappedAdmin()
          ? relCol
          : query(relCol, where('ownerUid', '==', uid));
        const relSnap = await getDocs(relQ);
        const relatives = relSnap.docs.map((d) => {
          const rData = d.data();
          const { ownerUid: _o, ...clean } = rData;
          return {
            ...clean,
            createdAt:
              typeof rData.createdAt?.toDate === 'function'
                ? rData.createdAt.toDate().toLocaleDateString('fa-IR')
                : rData.createdAt || '',
            updatedAt:
              typeof rData.updatedAt?.toDate === 'function'
                ? rData.updatedAt.toDate().toLocaleDateString('fa-IR')
                : rData.updatedAt || '',
          };
        });
        return { ...p, relatives };
      } catch {
        return { ...p, relatives: Array.isArray(p.relatives) ? p.relatives : [] };
      }
    })
  );

  return {
    users,
    personnel: personnelWithRelatives,
    karaneh,
    jobGroups,
    jobClassifications,
    commitments,
    payroll,
    miningVolumes,
    miningMachinery,
    unitReports,
  };
}

export async function deleteIdsFromFirestore(
  collectionName: string,
  ids: string[]
): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid || ids.length === 0) return;

  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const rawId of chunk) {
      const id = sanitizeId(rawId);
      batch.delete(doc(db, collectionName, id));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    }
  }
}

export async function deleteSingleFromFirestore(
  collectionName: string,
  rawId: string
): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const id = sanitizeId(rawId);
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncSingleRecordToFirestore(
  type:
    | 'personnel'
    | 'karaneh'
    | 'jobGroups'
    | 'jobClassifications'
    | 'commitments'
    | 'payroll'
    | 'users'
    | 'miningVolumes'
    | 'miningMachinery'
    | 'unitReports',
  record: any
): Promise<void> {
  const ownerUid = getVerifiedUid();
  if (!ownerUid || !record) return;
  await ensureAdminRoleDoc();

  if (type === 'personnel') {
    const built = buildPersonnelPayload(record, ownerUid);
    await upsertDocClean('personnel', built.id, built.data);
    await syncPersonnelRelatives(record, ownerUid);
    await syncPersonnelDocuments(record, ownerUid);
  } else if (type === 'karaneh') {
    const built = buildKaranehPayload(record, ownerUid);
    await upsertDocClean('karaneh', built.id, built.data);
  } else if (type === 'jobGroups') {
    const built = buildJobGroupPayload(record, ownerUid);
    await upsertDocClean('jobGroups', built.id, built.data);
  } else if (type === 'jobClassifications') {
    const built = buildJobClassificationPayload(record, ownerUid);
    await upsertDocClean('jobClassifications', built.id, built.data);
  } else if (type === 'commitments') {
    const built = buildCommitmentPayload(record, ownerUid);
    await upsertDocClean('commitments', built.id, built.data);
  } else if (type === 'payroll') {
    const built = buildPayrollPayload(record, ownerUid);
    await upsertDocClean('payroll', built.id, built.data);
  } else if (type === 'users') {
    const built = buildUserPayload(record, ownerUid);
    await upsertDocClean('users', built.id, built.account);
  } else if (type === 'miningVolumes') {
    const built = buildMiningVolumePayload(record, ownerUid);
    await upsertDocClean('miningVolumes', built.id, built.data);
  } else if (type === 'miningMachinery') {
    const built = buildMiningMachineryPayload(record, ownerUid);
    await upsertDocClean('miningMachinery', built.id, built.data);
  } else if (type === 'unitReports') {
    const built = buildUnitReportPayload(record, ownerUid);
    await upsertDocClean('unitReports', built.id, built.data);
  }
}
