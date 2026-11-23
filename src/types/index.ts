export type UserRole = 'super_admin' | 'hr_officer' | 'karaneh_officer' | 'department_head' | 'viewer' | string;

export interface GranularPersonnelPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  importExcel: boolean;
  exportExcel: boolean;
  viewSalary: boolean;
  documents?: boolean;
}

export interface GranularKaranehPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  importExcel: boolean;
  exportExcel: boolean;
  submit?: boolean;
  allowedUnits?: string[];
}

export interface GranularFinalKaranehPermissions {
  view: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  exportExcel: boolean;
}

export interface GranularJobGroupsPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  importExcel?: boolean;
  exportExcel?: boolean;
}

export interface GranularCommitmentsPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  print?: boolean;
  archive?: boolean;
  importExcel?: boolean;
  exportExcel?: boolean;
}

export interface GranularUsersPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  importExcel?: boolean;
  exportExcel?: boolean;
}

export interface GranularPayrollPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  importExcel: boolean;
  exportExcel: boolean;
}

export interface GranularSystemPermissions {
  dashboardStats: boolean;
  backupDatabase: boolean;
  restoreDatabase: boolean;
}

export interface GranularDashboardReportPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  deleteAll?: boolean;
  importExcel?: boolean;
  exportExcel: boolean;
  print: boolean;
}

export interface GranularUnitOperationsPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  deleteAll?: boolean;
  importExcel: boolean;
  exportExcel: boolean;
  allowedUnits?: string[];
}

export interface UserPermissions {
  personnel: GranularPersonnelPermissions;
  karaneh: GranularKaranehPermissions;
  jobGroups: GranularJobGroupsPermissions;
  commitments: GranularCommitmentsPermissions;
  payroll: GranularPayrollPermissions;
  users: GranularUsersPermissions;
  system: GranularSystemPermissions;
  smartDashboard?: GranularDashboardReportPermissions;
  ceoDashboard?: GranularDashboardReportPermissions;
  unitOperations?: GranularUnitOperationsPermissions;
  finalKaraneh?: GranularFinalKaranehPermissions;

  // Legacy fallback flags
  canManagePersonnel?: boolean;
  canManageKaraneh?: boolean;
  canManageJobGroups?: boolean;
  canManageCommitments?: boolean;
  canManageUsers?: boolean;
  canExportExcel?: boolean;
  canImportExcel?: boolean;
  canBackupRestore?: boolean;
}

export interface User {
  id: string;
  username: string;
  password?: string;
  email?: string;
  fullName: string;
  role: string;
  roleType?: 'super_admin' | 'custom' | 'viewer';
  department?: string;
  permissions: UserPermissions;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export type EmploymentType = 'رسمی' | 'پیمانی' | 'قراردادی' | 'طرحی' | 'شرکتی';
export type EmploymentStatus = 'فعال' | 'مرخصی' | 'ماموریت' | 'قطع همکاری';

export interface PersonnelChildDoc {
  id: string;
  fullName: string;
  relation: 'پسر' | 'دختر';
  shenasnamehPages: string[];
}

export interface PersonnelDocuments {
  nationalCardImage?: string;
  shenasnamehPages?: string[];
  maritalStatus?: 'مجرد' | 'متاهل';
  spouseName?: string;
  spouseShenasnamehPages?: string[];
  children?: PersonnelChildDoc[];
}

export type RelativeRelationType =
  | 'همسر'
  | 'فرزند (پسر)'
  | 'فرزند (دختر)'
  | 'پدر'
  | 'مادر'
  | 'سایر';

export interface PersonnelRelative {
  id: string;
  personnelId: string;
  personnelCode?: string;
  personnelName?: string;
  fullName: string;
  relation: RelativeRelationType | string;
  nationalId: string;
  shenasnamehNumber?: string;
  fatherName?: string;
  birthDate?: string;
  gender?: 'مرد' | 'زن' | '';
  phone?: string;
  education?: string;
  isDependent?: boolean; // تحت تکفل
  insuranceCovered?: boolean; // مشمول بیمه تکمیلی / تامین اجتماعی
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Personnel {
  id: string;
  employeeId?: string; // شناسه كارمند
  personnelCode: string; // كد پرسنلي
  firstName: string; // نام
  lastName: string; // نام خانوادگي
  fullName: string; // نام و نام خانوادگي
  fatherName?: string; // نام پدر
  shenasnamehNumber?: string; // شماره شناسنامه
  nationalId: string; // كد ملي
  nationality?: string; // مليت
  citizenship?: string; // تابعيت
  gender?: string; // جنسيت
  phone: string; // تلفن همراه
  email?: string; // پست الكترونيك
  birthPlace?: string; // محل تولد
  issuePlace?: string; // محل صدور
  birthDate?: string; // تاريخ تولد
  issueDate?: string; // تاريخ صدور
  maritalStatus?: string; // وضعيت تاهل
  militaryStatus?: string; // وضعيت نظام وظيفه
  education: string; // مدرك تحصيلي
  fieldOfStudy?: string; // رشته تحصيلي
  hireDate: string; // تاريخ استخدام
  workLocation?: string; // محل خدمت
  department: string; // واحد سازماني
  jobTitle?: string; // شغل
  jobCode?: string; // كد شغل
  position: string; // پست
  positionCode?: string; // كد پست
  employmentType: EmploymentType;
  jobGroupId: string;
  jobGroupName?: string;
  status: EmploymentStatus;
  baseSalary: number; // حقوق پایه (ریال)
  notes?: string;
  documents?: PersonnelDocuments;
  relatives?: PersonnelRelative[];
  createdAt: string;
  updatedAt: string;
}

export interface KaranehRecord {
  id: string;
  personnelId: string;
  personnelCode: string;
  fullName: string;
  department: string;
  position: string;
  period: string; // e.g. "1403-08"
  score?: number;
  performanceCoeff?: number;
  baseKaraneh: number;
  overtimeBonus: number;
  deductions: number;
  finalKaraneh: number;
  notes?: string;
  status?: 'draft' | 'submitted';
  submittedAt?: string;
  submittedBy?: string;
  submittedByName?: string;
  updatedAt: string;
}

export interface KaranehComparisonRow {
  id?: string;
  personnelCode: string;
  fullName: string;
  department: string;
  position: string;
  currentKaraneh: number;
  previousKaraneh: number;
  diffAmount: number;
  diffPercent: number;
  trend: 'increase' | 'decrease' | 'unchanged' | 'new';
  notes?: string;
  status?: 'draft' | 'submitted';
  submittedAt?: string;
  submittedByName?: string;
}

export interface JobGroup {
  id: string;
  code: string;
  title: string;
  grade: number;
  minBaseSalary: number;
  maxBaseSalary: number;
  maxKaranehCeiling: number;
  requiredExperienceYears: number;
  requiredDegree: string;
  description?: string;
}

export interface JobClassificationRecord {
  id: string;
  personnelCode: string; // کد پرسنلی
  firstName: string; // نام
  lastName: string; // نام خانوادگی
  workLocation: string; // محل خدمت
  department: string; // واحد
  nationalId: string; // کد ملی
  education: string; // مدرک تحصیلی
  hireDate: string; // تاریخ استخدام
  hireMonth: string; // ماه استخدام
  miningExperienceDays: string; // سابقه معدنی به روز
  totalInsuranceHistory: string; // سابقه بیمه کلی
  miningExperience: string; // سابقه معدنی
  nonMiningExperience: string; // سابقه غیرمعدنی
  jobGroup: string; // گروه شغلی
  groupGapFrom1405: string; // فاصله گروه از 1405 به بعد
  nextGroupGap: string; // فاصله گروه بعدی
  jobTitle: string; // شغل
  position: string; // پست
  updatedAt?: string;
}

export type CommitmentType =
  | 'تعهد حسابداری'
  | 'تعهد خدمت'
  | 'سفته حسن انجام کار'
  | 'چک تضمین'
  | 'تعهد دوره‌های آموزشی'
  | 'محرمانگی و عدم رقابت';

export type CommitmentStatus =
  | 'جاری و معتبر'
  | 'پایان یافته'
  | 'عودت داده شده'
  | 'به اجرا گذاشته شده';

export interface PersonnelCommitment {
  id: string;
  personnelId: string;
  personnelCode: string;
  personnelName: string;
  commitmentType: CommitmentType;
  documentNumber?: string; // legacy optional field kept for backward compatibility only
  amount: number; // مبلغ تعهد فعلی (ریال)
  previouslyTakenAmount?: number; // مبلغی که قبلاً گرفته (ریال)
  maxAllowedAmount?: number; // سقف کل مجاز (ریال)
  startDate: string;
  endDate: string;
  status: CommitmentStatus;
  isArchived?: boolean;
  archivedAt?: string;
  archiveCode?: string;
  guarantorName?: string;
  notes?: string;
}

export interface PayrollRecord {
  id: string;
  period: string; // e.g. "1403-08"
  yearMonthLabel?: string; // سال/ماه
  employeeId?: string; // شناسه كارمند
  personnelCode: string; // كد پرسنلي
  firstName?: string; // نام
  lastName?: string; // نام خانوادگي
  fullName: string; // نام و نام خانوادگي
  nationalId?: string; // كد ملي
  workLocation?: string; // محل خدمت
  department?: string; // واحد سازماني
  jobTitle?: string; // شغل
  position?: string; // پست
  jobGroupCode?: string; // کد گروه شغلي
  jobGroupTitle?: string; // عنوان گروه شغلي
  employmentType?: string; // نوع استخدام
  effectiveDays?: number; // کارکرد موثر
  netPayable: number; // خالص پرداختی
  totalBenefits: number; // جمع مزایا
  overtimeAmount: number; // اضافه کاری
  fridayWorkAmount: number; // جمعه کاری
  missionAmount: number; // ماموریت ریالی
  bonusAmount: number; // پاداش
  incentiveAmount: number; // تشویقی
  otherBenefits: number; // سایر مزایا
  arrearsAmount: number; // مابه التفاوت
  advanceAmount: number; // مساعده
  totalDeductions: number; // جمع کسور
  taxAmount: number; // مالیات
  salaryTaxAmount: number; // مالیات حقوق
  jobWage: number; // مزد شغل
  totalOrderFactors: number; // جمع عوامل حکمی
  baseSalaryOrder: number; // حقوق پایه(حكم-اصلي)
  overtimeHours?: number; // ساعت اضافه کاری(کارکرد)
  fridayWorkHours?: number; // ساعت جمعه کاری(کارکرد)
  costCenterCode?: string; // مرکز هزینه(كد تفصيل)
  costCenterTitle?: string; // مرکز هزینه(عنوان تفصيل)
  projectCode?: string; // پروژه(كد تفصيل)
  projectTitle?: string; // پروژه(عنوان تفصيل)
  bankName?: string; // نام بانک
  bankAccount?: string; // شماره حساب
  rawFields: Record<string, string | number>; // All 226 exact columns preserved
  updatedAt?: string;
}

export type PayrollAnalysisMetric = 'netPayable' | 'totalBenefits';

export interface PayrollComparisonRow {
  recordId: string;
  personnelCode: string;
  fullName: string;
  nationalId: string;
  workLocation: string;
  department: string;
  jobTitle: string;
  position: string;
  jobGroupCode?: string;
  employmentType?: string;
  effectiveDays: number;
  prevEffectiveDays: number;
  jobWage: number;
  totalOrderFactors: number;
  totalBenefits: number;
  previousBenefits: number;
  diffBenefits: number;
  diffBenefitsPercent: number;
  benefitsTrend: 'increase' | 'decrease' | 'unchanged' | 'new';
  overtimeAmount?: number;
  totalDeductions: number;
  taxAmount: number;
  currentNet: number;
  previousNet: number;
  diffNet: number;
  diffPercent: number;
  trend: 'increase' | 'decrease' | 'unchanged' | 'new';
  currentRecord: PayrollRecord;
  previousRecord?: PayrollRecord;
}

export type MiningMachineryStatus = 'آماده به کار' | 'خراب / در تعمیرگاه' | 'در انتظار قطعه' | 'سرویس دوره‌ای';

export interface MiningVolumeRecord {
  id: string;
  period: string; // e.g. "1403-08"
  unitName: string; // واحد عملیاتی یا پشتیبانی معدن
  activityType: string; // نوع عملیات (استخراج، باطله‌برداری، سنگ‌شکن، حمل، ...)
  metricTitle: string; // عنوان شاخص / گزارش حجم
  volumeValue: number; // مقدار / حجم محقق‌شده این ماه
  targetVolume: number; // برنامه / هدف مصوب ماه
  unitLabel: string; // واحد اندازه‌گیری (تن، مترمکعب، سرویس، ساعت...)
  status?: string;
  notes?: string;
  updatedAt?: string;
}

export interface MiningMachineryRecord {
  id: string;
  machineCode: string; // کد دستگاه / پلاک تجهیزات
  machineName: string; // نام / مدل دستگاه
  machineType: string; // گروه / نوع تجهیز (دامپتراک، لودر، بیل مکانیکی، بولدوزر، سنگ‌شکن...)
  unitName: string; // واحد بهره‌بردار / مستقر
  status: MiningMachineryStatus;
  issueDescription?: string; // شرح خرابی یا وضعیت تعمیر
  stoppedSince?: string; // تاریخ توقف / ورود به تعمیرگاه
  estimatedReadyDate?: string; // تاریخ تخمینی آماده‌به‌کار
  operatorName?: string; // اپراتور / سرپرست مسئول
  notes?: string;
  updatedAt?: string;
}

export interface UnitOperationalReport {
  id: string;
  period: string; // e.g. "1403-08"
  unitName: string; // نام واحد عملیاتی یا پشتیبانی معدن
  reportCategory: string; // دسته‌بندی گزارش (تولید، تعمیرات، ایمنی، انبار، اکتشاف و...)
  metricName: string; // عنوان شاخص / موضوع گزارش
  actualValue: number; // مقدار محقق‌شده این ماه
  previousValue?: number; // مقدار ماه قبل (در صورت ورود مستقیم در اکسل)
  targetValue?: number; // هدف / برنامه ماه
  unitLabel: string; // واحد اندازه‌گیری (تن، متر، دستگاه، ساعت، عدد...)
  status?: string; // وضعیت
  submittedBy?: string; // مسئول / تنظیم‌کننده گزارش واحد
  notes?: string;
  rawFields?: Record<string, string | number>; // ستون‌های اضافه فایل اکسل واحد
  updatedAt?: string;
}

export interface DatabaseStatus {
  storageLocation: string;
  storageEngine?: string;
  totalPersonnel: number;
  totalRelatives?: number;
  totalKaranehRecords: number;
  totalPayrollRecords?: number;
  totalUsers: number;
  totalActiveUsers?: number;
  totalPersonnelWithDocs?: number;
  payrollPeriodsCount?: number;
  karanehPeriodsCount?: number;
  totalJobGroups: number;
  totalJobClassifications?: number;
  totalCommitments: number;
  totalArchivedCommitments?: number;
  totalMiningVolumes?: number;
  totalMiningMachinery?: number;
  totalUnitReports?: number;
  fileSizeBytes: number;
  lastSaved: string;
  isLocalHost: boolean;
  hostPlatform: string;
  authProtected?: boolean;
  firebaseProjectId?: string;
  firestoreDatabaseId?: string;
  schemaVersion?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
