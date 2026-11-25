import * as XLSX from 'xlsx';
import { PAYROLL_EXCEL_COLUMNS } from './payrollColumns';
import { toEnglishDigits } from './persian';

export type SmartImportModuleType =
  | 'personnel'
  | 'relatives'
  | 'karaneh'
  | 'payroll'
  | 'jobClassifications'
  | 'commitments'
  | 'users'
  | 'ceoVolumes'
  | 'ceoMachinery'
  | 'unitReports';

export interface SmartFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  category?: string;
}

export interface InspectedSheet {
  name: string;
  rows2D: any[][];
  detectedHeaderRowIndex: number;
  rawRowCount: number;
  cachedExtracted?: { headers: string[]; rows: Record<string, any>[] };
}

export interface InspectedWorkbook {
  fileName: string;
  sheets: InspectedSheet[];
  defaultSheetIndex: number;
}

/**
 * یکسان‌سازی کامل متن فارسی/عربی جهت تطبیق هوشمند ستون‌های اکسل‌های مختلف
 */
export function normalizeSmartHeader(value: any): string {
  return toEnglishDigits(String(value ?? ''))
    .replace(/\u200c|\u200f|\u200e|\ufeff/g, ' ')
    .replace(/[يیئى]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[_/\\\-:|.،؛()\[\]{}«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeCompactHeader(value: any): string {
  return normalizeSmartHeader(value).replace(/\s+/g, '');
}

const PERSONNEL_FIELDS: SmartFieldDefinition[] = [
  { key: 'employeeId', label: 'شناسه كارمند', aliases: ['شناسه کارمند', 'شناسه كارمند', 'employee id', 'emp id', 'id پرسنل', 'شناسه پرسنلی'], category: 'هویتی و پرسنلی' },
  { key: 'personnelCode', label: 'كد پرسنلي', required: true, aliases: ['کد پرسنلی', 'كد پرسنلي', 'شماره پرسنلی', 'کد کارمندی', 'شماره استخدامی', 'personnel code', 'person code', 'code'], category: 'هویتی و پرسنلی' },
  { key: 'firstName', label: 'نام', aliases: ['نام', 'نام کوچک', 'first name', 'firstname'], category: 'هویتی و پرسنلی' },
  { key: 'lastName', label: 'نام خانوادگي', aliases: ['نام خانوادگی', 'نام خانوادگي', 'فامیل', 'فامیلی', 'نام خانواده', 'last name', 'lastname'], category: 'هویتی و پرسنلی' },
  { key: 'fullName', label: 'نام و نام خانوادگي', aliases: ['نام و نام خانوادگی', 'نام و نام خانوادگي', 'نام کامل', 'نام پرسنل', 'مشخصات', 'full name', 'fullname', 'name'], category: 'هویتی و پرسنلی' },
  { key: 'fatherName', label: 'نام پدر', aliases: ['نام پدر', 'اسم پدر', 'پدر', 'father name'], category: 'هویتی و پرسنلی' },
  { key: 'shenasnamehNumber', label: 'شماره شناسنامه', aliases: ['شماره شناسنامه', 'ش شناسنامه', 'شماره ش', 'شناسنامه'], category: 'هویتی و پرسنلی' },
  { key: 'nationalId', label: 'كد ملي', required: true, aliases: ['کد ملی', 'كد ملي', 'کدملی', 'شماره ملی', 'شناسه ملی', 'national id', 'national code'], category: 'هویتی و پرسنلی' },
  { key: 'nationality', label: 'مليت', aliases: ['ملیت', 'مليت', 'nationality'], category: 'هویتی و پرسنلی' },
  { key: 'citizenship', label: 'تابعيت', aliases: ['تابعیت', 'تابعيت', 'کشور', 'citizenship'], category: 'هویتی و پرسنلی' },
  { key: 'gender', label: 'جنسيت', aliases: ['جنسیت', 'جنسيت', 'جنس', 'gender', 'sex'], category: 'هویتی و پرسنلی' },
  { key: 'phone', label: 'تلفن همراه', aliases: ['تلفن همراه', 'موبایل', 'شماره تماس', 'تلفن', 'شماره همراه', 'همراه', 'mobile', 'phone'], category: 'تماس و اقامت' },
  { key: 'email', label: 'پست الكترونيك', aliases: ['پست الکترونیک', 'پست الكترونيك', 'ایمیل', 'رایانامه', 'email', 'mail'], category: 'تماس و اقامت' },
  { key: 'birthPlace', label: 'محل تولد', aliases: ['محل تولد', 'شهر تولد', 'birth place'], category: 'هویتی و پرسنلی' },
  { key: 'issuePlace', label: 'محل صدور', aliases: ['محل صدور', 'محل صدور شناسنامه', 'issue place'], category: 'هویتی و پرسنلی' },
  { key: 'birthDate', label: 'تاريخ تولد', aliases: ['تاریخ تولد', 'تاريخ تولد', 'تولد', 'birth date', 'dob'], category: 'هویتی و پرسنلی' },
  { key: 'issueDate', label: 'تاريخ صدور', aliases: ['تاریخ صدور', 'تاريخ صدور', 'تاریخ صدور شناسنامه', 'issue date'], category: 'هویتی و پرسنلی' },
  { key: 'maritalStatus', label: 'وضعيت تاهل', aliases: ['وضعیت تاهل', 'وضعيت تاهل', 'تاهل', 'وضعیت تأهل', 'marital status'], category: 'هویتی و پرسنلی' },
  { key: 'militaryStatus', label: 'وضعيت نظام وظيفه', aliases: ['وضعیت نظام وظیفه', 'وضعيت نظام وظيفه', 'نظام وظیفه', 'وضعیت سربازی', 'خدمت سربازی'], category: 'هویتی و پرسنلی' },
  { key: 'education', label: 'مدرك تحصيلي', aliases: ['مدرک تحصیلی', 'مدرك تحصيلي', 'تحصیلات', 'میزان تحصیلات', 'مقطع تحصیلی', 'education'], category: 'تحصیلی و شغلی' },
  { key: 'fieldOfStudy', label: 'رشته تحصيلي', aliases: ['رشته تحصیلی', 'رشته تحصيلي', 'رشته', 'گرایش تحصیلی'], category: 'تحصیلی و شغلی' },
  { key: 'hireDate', label: 'تاريخ استخدام', aliases: ['تاریخ استخدام', 'تاريخ استخدام', 'تاریخ شروع به کار', 'شروع همکاری', 'hire date'], category: 'کارگزینی و شغلی' },
  { key: 'workLocation', label: 'محل خدمت', aliases: ['محل خدمت', 'سایت معدن', 'محل کار', 'منطقه', 'کارگاه', 'work location', 'site'], category: 'کارگزینی و شغلی' },
  { key: 'department', label: 'واحد سازماني', aliases: ['واحد سازمانی', 'واحد سازماني', 'واحد', 'دپارتمان', 'واحد اداری', 'معاونت', 'قسمت', 'department'], category: 'کارگزینی و شغلی' },
  { key: 'jobTitle', label: 'شغل', aliases: ['شغل', 'عنوان شغل', 'شغل سازمانی', 'job title'], category: 'کارگزینی و شغلی' },
  { key: 'jobCode', label: 'كد شغل', aliases: ['کد شغل', 'كد شغل', 'کدشغل'], category: 'کارگزینی و شغلی' },
  { key: 'position', label: 'پست', aliases: ['پست', 'پست و سمت', 'پست سازمانی', 'سمت', 'سمت سازمانی', 'عنوان پست', 'position'], category: 'کارگزینی و شغلی' },
  { key: 'positionCode', label: 'كد پست', aliases: ['کد پست', 'كد پست', 'کدپست'], category: 'کارگزینی و شغلی' },
  { key: 'employmentType', label: 'نوع استخدام', aliases: ['نوع استخدام', 'نوع قرارداد', 'وضعیت استخدامی', 'employment type'], category: 'کارگزینی و حقوقی' },
  { key: 'jobGroupName', label: 'گروه شغلی', aliases: ['گروه شغلی', 'عنوان گروه شغلی', 'رتبه', 'طبقه شغلی'], category: 'کارگزینی و حقوقی' },
  { key: 'status', label: 'وضعیت', aliases: ['وضعیت', 'وضعیت پرسنل', 'وضعیت اشتغال', 'status'], category: 'کارگزینی و حقوقی' },
  { key: 'baseSalary', label: 'حقوق پایه (ریال)', aliases: ['حقوق پایه', 'حقوق پایه (ریال)', 'مزد پایه', 'مبلغ حکم پایه', 'حقوق مبنا', 'base salary'], category: 'کارگزینی و حقوقی' },
  { key: 'notes', label: 'یادداشت', aliases: ['یادداشت', 'توضیحات', 'ملاحظات', 'notes'], category: 'تکمیلی' },
];

const RELATIVES_FIELDS: SmartFieldDefinition[] = [
  { key: 'personnelCode', label: 'کد پرسنلی کارمند', required: true, aliases: ['کد پرسنلی کارمند', 'کد پرسنلی', 'كد پرسنلي', 'کد کارمند', 'شماره پرسنلی کارمند'] },
  { key: 'personnelNationalId', label: 'کد ملی کارمند', aliases: ['کد ملی کارمند', 'کد ملی سرپرست', 'کد ملی پرسنل'] },
  { key: 'employeeId', label: 'شناسه کارمند', aliases: ['شناسه کارمند', 'شناسه كارمند'] },
  { key: 'personnelName', label: 'نام کارمند', aliases: ['نام کارمند', 'نام پرسنل', 'نام و نام خانوادگی کارمند', 'نام سرپرست'] },
  { key: 'fullName', label: 'نام و نام خانوادگی بستگان', required: true, aliases: ['نام و نام خانوادگی بستگان', 'نام و نام خانوادگی', 'نام بستگان', 'نام کامل', 'نام عضو خانواده', 'نام'] },
  { key: 'relation', label: 'نسبت', required: true, aliases: ['نسبت', 'نسبت خانوادگی', 'نسبت با کارمند', 'نوع نسبت', 'relation'] },
  { key: 'nationalId', label: 'کد ملی بستگان', aliases: ['کد ملی بستگان', 'کد ملی', 'كد ملي', 'شماره ملی بستگان'] },
  { key: 'shenasnamehNumber', label: 'شماره شناسنامه', aliases: ['شماره شناسنامه', 'ش شناسنامه', 'شناسنامه'] },
  { key: 'fatherName', label: 'نام پدر', aliases: ['نام پدر', 'اسم پدر'] },
  { key: 'birthDate', label: 'تاریخ تولد', aliases: ['تاریخ تولد', 'تاريخ تولد', 'تولد'] },
  { key: 'gender', label: 'جنسیت', aliases: ['جنسیت', 'جنسيت', 'جنس'] },
  { key: 'phone', label: 'شماره تماس', aliases: ['شماره تماس', 'تلفن همراه', 'موبایل', 'تلفن'] },
  { key: 'education', label: 'تحصیلات', aliases: ['تحصیلات', 'مدرک تحصیلی', 'مقطع تحصیلی'] },
  { key: 'isDependent', label: 'تحت تکفل', aliases: ['تحت تکفل', 'تکفل', 'مشمول تکفل'] },
  { key: 'insuranceCovered', label: 'پوشش بیمه تکمیلی', aliases: ['پوشش بیمه تکمیلی', 'بیمه تکمیلی', 'تحت پوشش بیمه', 'بیمه'] },
  { key: 'notes', label: 'توضیحات', aliases: ['توضیحات', 'یادداشت', 'ملاحظات'] },
];

const KARANEH_FIELDS: SmartFieldDefinition[] = [
  { key: 'personnelCode', label: 'کد پرسنلی', required: true, aliases: ['کد پرسنلی', 'كد پرسنلي', 'شماره پرسنلی', 'کد کارمند'] },
  { key: 'fullName', label: 'نام و نام خانوادگی', aliases: ['نام و نام خانوادگی', 'نام کامل', 'نام پرسنل', 'نام'] },
  { key: 'department', label: 'واحد', aliases: ['واحد', 'واحد اداری', 'واحد سازمانی', 'دپارتمان', 'قسمت'] },
  { key: 'position', label: 'پست', aliases: ['پست', 'پست سازمانی', 'سمت', 'شغل', 'پست و سمت'] },
  { key: 'baseKaraneh', label: 'مبلغ کارانه (ریال)', aliases: ['کارانه', 'مبلغ کارانه', 'مبلغ کارانه (ریال)', 'کارانه پایه', 'کارانه پایه (ریال)', 'پاداش کارانه', 'مبلغ'] },
  { key: 'overtimeBonus', label: 'پاداش اضافه‌کاری', aliases: ['پاداش اضافه کاری', 'اضافه کاری', 'پاداش بهره وری', 'فوق العاده'] },
  { key: 'deductions', label: 'کسورات کارانه', aliases: ['کسورات', 'کسورات کارانه', 'کسر کارانه'] },
  { key: 'finalKaraneh', label: 'کارانه نهایی قابل پرداخت', aliases: ['کارانه نهایی', 'خالص کارانه', 'قابل پرداخت', 'جمع کارانه', 'کارانه خالص'] },
  { key: 'score', label: 'امتیاز عملکرد', aliases: ['امتیاز', 'امتیاز عملکرد', 'نمره ارزیابی'] },
  { key: 'performanceCoeff', label: 'ضریب بهره‌وری', aliases: ['ضریب', 'ضریب بهره وری', 'ضریب عملکرد'] },
  { key: 'notes', label: 'توضیحات', aliases: ['توضیحات', 'علت تغییر', 'یادداشت', 'ملاحظات'] },
];

const JOB_CLASSIFICATION_FIELDS: SmartFieldDefinition[] = [
  { key: 'کد پرسنلی', label: 'کد پرسنلی', required: true, aliases: ['کد پرسنلی', 'كد پرسنلي', 'شماره پرسنلی'] },
  { key: 'نام', label: 'نام', aliases: ['نام', 'نام کوچک'] },
  { key: 'نام خانوادگی', label: 'نام خانوادگی', aliases: ['نام خانوادگی', 'نام خانوادگي', 'فامیل'] },
  { key: 'محل خدمت', label: 'محل خدمت', aliases: ['محل خدمت', 'سایت', 'محل کار'] },
  { key: 'واحد', label: 'واحد', aliases: ['واحد', 'واحد سازمانی', 'دپارتمان'] },
  { key: 'کد ملی', label: 'کد ملی', aliases: ['کد ملی', 'كد ملي', 'شماره ملی'] },
  { key: 'مدرک تحصیلی', label: 'مدرک تحصیلی', aliases: ['مدرک تحصیلی', 'تحصیلات'] },
  { key: 'تاریخ استخدام', label: 'تاریخ استخدام', aliases: ['تاریخ استخدام', 'تاريخ استخدام'] },
  { key: 'ماه استخدام', label: 'ماه استخدام', aliases: ['ماه استخدام', 'ماه شروع'] },
  { key: 'سابقه معدنی به روز', label: 'سابقه معدنی به روز', aliases: ['سابقه معدنی به روز', 'سابقه معدنی روز'] },
  { key: 'سابقه بیمه کلی', label: 'سابقه بیمه کلی', aliases: ['سابقه بیمه کلی', 'کل سابقه بیمه', 'سابقه بیمه'] },
  { key: 'سابقه معدنی', label: 'سابقه معدنی', aliases: ['سابقه معدنی', 'سابقه در معدن'] },
  { key: 'سابقه غیرمعدنی', label: 'سابقه غیرمعدنی', aliases: ['سابقه غیرمعدنی', 'سابقه غیر معدنی'] },
  { key: 'گروه شغلی', label: 'گروه شغلی', aliases: ['گروه شغلی', 'عنوان گروه شغلی', 'گروه'] },
  { key: 'فاصله گروه از 1405 به بعد', label: 'فاصله گروه از 1405 به بعد', aliases: ['فاصله گروه از 1405 به بعد', 'فاصله گروه 1405'] },
  { key: 'فاصله گروه بعدی', label: 'فاصله گروه بعدی', aliases: ['فاصله گروه بعدی', 'فاصله تا ارتقا'] },
  { key: 'شغل', label: 'شغل', aliases: ['شغل', 'عنوان شغل'] },
  { key: 'پست', label: 'پست', aliases: ['پست', 'سمت', 'پست سازمانی'] },
];

const COMMITMENT_FIELDS: SmartFieldDefinition[] = [
  { key: 'personnelCode', label: 'کد پرسنلی', required: true, aliases: ['کد پرسنلی', 'كد پرسنلي', 'شماره پرسنلی'] },
  { key: 'personnelName', label: 'نام پرسنل', aliases: ['نام پرسنل', 'نام و نام خانوادگی', 'نام متعهد'] },
  { key: 'commitmentType', label: 'نوع تعهد یا تضمین', aliases: ['نوع تعهد یا تضمین', 'نوع تعهد', 'نوع تضمین', 'تضمین'] },
  { key: 'amount', label: 'مبلغ تعهد فعلی (ریال)', aliases: ['مبلغ تعهد فعلی (ریال)', 'مبلغ تعهد فعلی', 'مبلغ تعهد', 'مبلغ'] },
  { key: 'previouslyTakenAmount', label: 'مبلغ قبلاً دریافت شده (ریال)', aliases: ['مبلغ قبلاً دریافت شده (ریال)', 'مبلغ قبلا دریافت شده', 'قبلا دریافتی', 'مصرف شده قبلی'] },
  { key: 'maxAllowedAmount', label: 'سقف مجاز کل (ریال)', aliases: ['سقف مجاز کل (ریال)', 'سقف مجاز کل', 'سقف تعهد', 'حداکثر مجاز'] },
  { key: 'startDate', label: 'تاریخ شروع', aliases: ['تاریخ شروع', 'شروع تعهد'] },
  { key: 'endDate', label: 'تاریخ سررسید', aliases: ['تاریخ سررسید', 'تاریخ پایان', 'سررسید', 'انقضا'] },
  { key: 'guarantorName', label: 'نام ضامن', aliases: ['نام ضامن', 'ضامن'] },
  { key: 'status', label: 'وضعیت', aliases: ['وضعیت', 'وضعیت تعهد'] },
  { key: 'isArchived', label: 'بایگانی', aliases: ['بایگانی', 'وضعیت بایگانی'] },
  { key: 'notes', label: 'توضیحات', aliases: ['توضیحات', 'یادداشت', 'شرح'] },
];

const USER_FIELDS: SmartFieldDefinition[] = [
  { key: 'username', label: 'نام کاربری', required: true, aliases: ['نام کاربری', 'شناسه کاربری', 'username', 'user'] },
  { key: 'password', label: 'رمز عبور', aliases: ['رمز عبور', 'کلمه عبور', 'پسورد', 'password'] },
  { key: 'fullName', label: 'نام و نام خانوادگی', required: true, aliases: ['نام و نام خانوادگی', 'نام کامل', 'نام کاربر', 'fullName'] },
  { key: 'role', label: 'نقش سازمانی', aliases: ['نقش سازمانی', 'نقش', 'سمت', 'role'] },
  { key: 'department', label: 'واحد اداری', aliases: ['واحد اداری', 'واحد سازمانی', 'واحد', 'department'] },
  { key: 'isActive', label: 'وضعیت حساب', aliases: ['وضعیت حساب', 'وضعیت', 'فعال', 'isActive'] },
  { key: 'preset', label: 'الگوی دسترسی', aliases: ['الگوی دسترسی', 'سطح دسترسی', 'نوع دسترسی', 'preset'] },
];

const PAYROLL_SYNONYM_MAP: Record<string, string[]> = {
  'سال/ماه': ['سال ماه', 'دوره', 'سال/ماه حقوق', 'ماه کارکرد'],
  'كد پرسنلي': ['کد پرسنلی', 'شماره پرسنلی', 'کد کارمندی', 'کد پرسنل'],
  'نام و نام خانوادگي': ['نام و نام خانوادگی', 'نام کامل', 'نام پرسنل'],
  'كد ملي': ['کد ملی', 'شماره ملی'],
  'محل خدمت': ['محل خدمت', 'سایت معدن', 'کارگاه', 'محل کار'],
  'واحد سازماني': ['واحد سازمانی', 'واحد', 'دپارتمان', 'قسمت'],
  'شغل': ['شغل', 'عنوان شغلی'],
  'پست': ['پست', 'سمت', 'پست سازمانی'],
  'کارکرد موثر': ['کارکرد موثر', 'روز کارکرد', 'کارکرد روز'],
  'خالص پرداختی': ['خالص پرداختی', 'خالص حقوق', 'قابل پرداخت', 'خالص دریافتی', 'خالص'],
  'جمع مزایا': ['جمع مزایا', 'مجموع مزایا', 'کل مزایا', 'مزایای ناخالص', 'جمع ناخالص'],
  'جمع کسور': ['جمع کسور', 'مجموع کسورات', 'کل کسور'],
  'مالیات': ['مالیات', 'مالیات حقوق و مزایا'],
  'مالیات حقوق': ['مالیات حقوق', 'مالیات دستمزد'],
  'مزد شغل': ['مزد شغل', 'پایه مزد شغل'],
  'اضافه کاری': ['اضافه کاری', 'مبلغ اضافه کاری', 'اضافه کار'],
  'جمع عوامل حکمی': ['جمع عوامل حکمی', 'مجموع حکم'],
};

const PAYROLL_FIELDS: SmartFieldDefinition[] = PAYROLL_EXCEL_COLUMNS.map((col, idx) => ({
  key: col,
  label: col,
  required: col === 'كد پرسنلي' || col === 'خالص پرداختی',
  aliases: [col, ...(PAYROLL_SYNONYM_MAP[col] || [])],
  category:
    idx < 29
      ? 'اطلاعات پرسنلی و کارگزینی'
      : idx < 42
      ? 'اطلاعات حکم و رتبه'
      : idx < 69
      ? 'اقلام اصلی حقوق و کارکرد'
      : col.includes('(') && (col.includes('وام') || col.includes('بیمه') || col.includes('خرید') || col.includes('مساعده') || col.includes('سهام') || col.includes('لوازم'))
      ? 'وام‌ها و اقساط'
      : col.includes('حكم-اصلي') || col.includes('حكم-فرعي')
      ? 'عوامل حکمی'
      : 'تامین اجتماعی، دارایی و بانک',
}));

const CEO_VOLUMES_FIELDS: SmartFieldDefinition[] = [
  { key: 'period', label: 'دوره (سال-ماه)', required: true, aliases: ['دوره', 'سال-ماه', 'سال/ماه', 'ماه آمار', 'period', 'month'] },
  { key: 'unitName', label: 'واحد عملیاتی معدن', required: true, aliases: ['واحد عملیاتی معدن', 'واحد معدن', 'واحد', 'نام واحد', 'بخش', 'سایت', 'unit', 'department'] },
  { key: 'activityType', label: 'نوع عملیات / فعالیت', aliases: ['نوع عملیات', 'نوع فعالیت', 'عملیات', 'حوزه فعالیت', 'activity'] },
  { key: 'metricTitle', label: 'عنوان شاخص حجم', aliases: ['عنوان شاخص', 'شرح عملیات', 'عنوان شاخص حجم', 'شاخص', 'توضیح عملیات', 'title'] },
  { key: 'volumeValue', label: 'حجم محقق‌شده ماه', required: true, aliases: ['حجم محقق شده', 'حجم محقق‌شده ماه', 'مقدار', 'حجم', 'میزان تولید', 'حجم عملیات', 'تناژ', 'volume'] },
  { key: 'targetVolume', label: 'برنامه / هدف ماه', aliases: ['برنامه ماه', 'هدف ماه', 'برنامه / هدف ماه', 'سقف برنامه', 'تارگت', 'هدف', 'target'] },
  { key: 'unitLabel', label: 'واحد اندازه‌گیری', aliases: ['واحد اندازه گیری', 'واحد اندازه‌گیری', 'یکا', 'واحد سنجش', 'unit label'] },
  { key: 'status', label: 'وضعیت تحقق', aliases: ['وضعیت تحقق', 'وضعیت', 'ارزیابی', 'status'] },
  { key: 'notes', label: 'توضیحات', aliases: ['توضیحات', 'یادداشت', 'گزارش سرپرست', 'notes'] },
];

const CEO_MACHINERY_FIELDS: SmartFieldDefinition[] = [
  { key: 'machineCode', label: 'کد دستگاه / پلاک', required: true, aliases: ['کد دستگاه', 'کد تجهیز', 'پلاک تجهیز', 'کد ماشین', 'شناسه دستگاه', 'machine code', 'code'] },
  { key: 'machineName', label: 'نام و مدل دستگاه', required: true, aliases: ['نام و مدل دستگاه', 'نام دستگاه', 'مدل دستگاه', 'شرح دستگاه', 'نام ماشین', 'machine name', 'name'] },
  { key: 'machineType', label: 'نوع ماشین‌آلات', aliases: ['نوع ماشین آلات', 'نوع دستگاه', 'گروه تجهیز', 'کاربری دستگاه', 'machine type', 'type'] },
  { key: 'unitName', label: 'واحد مستقر / بهره‌بردار', aliases: ['واحد مستقر', 'واحد', 'بخش', 'واحد بهره‌بردار', 'محل استقرار', 'unit'] },
  { key: 'status', label: 'وضعیت دستگاه', required: true, aliases: ['وضعیت دستگاه', 'وضعیت', 'وضعیت تعمیرگاه', 'وضعیت عملیاتی', 'status'] },
  { key: 'issueDescription', label: 'شرح خرابی / وضعیت تعمیر', aliases: ['شرح خرابی', 'علت خرابی', 'وضعیت تعمیر', 'شرح خرابی / وضعیت تعمیر', 'گزارش تعمیرگاه', 'ایراد فنی'] },
  { key: 'stoppedSince', label: 'تاریخ توقف / ورود به تعمیرگاه', aliases: ['تاریخ توقف', 'تاریخ ورود به تعمیرگاه', 'شروع خرابی', 'تاریخ توقف / ورود به تعمیرگاه'] },
  { key: 'estimatedReadyDate', label: 'تاریخ تخمینی آماده‌به‌کار', aliases: ['تاریخ تخمینی آماده به کار', 'تاریخ آماده به کار', 'تخمین تحویل', 'زمان تحویل'] },
  { key: 'operatorName', label: 'اپراتور / مسئول تعمیر', aliases: ['اپراتور', 'نام اپراتور', 'مسئول تعمیر', 'اپراتور / مسئول تعمیر', 'تعمیرکار'] },
  { key: 'notes', label: 'یادداشت', aliases: ['یادداشت', 'توضیحات', 'ملاحظات', 'notes'] },
];

const UNIT_REPORTS_FIELDS: SmartFieldDefinition[] = [
  { key: 'period', label: 'دوره (سال-ماه)', required: true, aliases: ['دوره', 'سال-ماه', 'سال/ماه', 'ماه گزارش', 'period', 'month'] },
  { key: 'unitName', label: 'نام واحد عملیاتی', required: true, aliases: ['نام واحد', 'واحد عملیاتی', 'واحد سازمانی', 'واحد', 'دپارتمان', 'بخش', 'unit'] },
  { key: 'reportCategory', label: 'دسته‌بندی / نوع گزارش', aliases: ['دسته بندی', 'دسته‌بندی', 'نوع گزارش', 'بخش گزارش', 'حوزه فعالیت', 'category'] },
  { key: 'metricName', label: 'عنوان شاخص / موضوع فعالیت', required: true, aliases: ['عنوان شاخص', 'نام آیتم', 'شرح فعالیت', 'موضوع گزارش', 'شاخص', 'نام شاخص', 'metric', 'item'] },
  { key: 'actualValue', label: 'مقدار محقق‌شده ماه', required: true, aliases: ['مقدار محقق شده', 'مقدار فعلی', 'عملکرد ماه', 'تعداد', 'حجم', 'مقدار', 'actual', 'value'] },
  { key: 'previousValue', label: 'مقدار ماه قبل', aliases: ['مقدار ماه قبل', 'دوره قبل', 'عملکرد قبل', 'ماه گذشته', 'previous'] },
  { key: 'targetValue', label: 'هدف / برنامه ماه', aliases: ['هدف ماه', 'برنامه', 'سقف', 'ظرفیت', 'هدف', 'تارگت', 'target'] },
  { key: 'unitLabel', label: 'واحد سنجش (یکا)', aliases: ['یکا', 'واحد سنجش', 'واحد اندازه گیری', 'واحد اندازه‌گیری', 'unit label'] },
  { key: 'status', label: 'وضعیت / ارزیابی', aliases: ['وضعیت', 'ارزیابی', 'وضعیت تحقق', 'status'] },
  { key: 'submittedBy', label: 'ثبت‌کننده / سرپرست واحد', aliases: ['ثبت کننده', 'سرپرست واحد', 'تهیه کننده', 'مسئول گزارش', 'submitted by'] },
  { key: 'notes', label: 'توضیحات', aliases: ['توضیحات', 'یادداشت', 'شرح', 'ملاحظات', 'notes'] },
];

export function getSmartModuleFields(moduleType: SmartImportModuleType): SmartFieldDefinition[] {
  switch (moduleType) {
    case 'personnel':
      return PERSONNEL_FIELDS;
    case 'relatives':
      return RELATIVES_FIELDS;
    case 'karaneh':
      return KARANEH_FIELDS;
    case 'payroll':
      return PAYROLL_FIELDS;
    case 'jobClassifications':
      return JOB_CLASSIFICATION_FIELDS;
    case 'commitments':
      return COMMITMENT_FIELDS;
    case 'users':
      return USER_FIELDS;
    case 'ceoVolumes':
      return CEO_VOLUMES_FIELDS;
    case 'ceoMachinery':
      return CEO_MACHINERY_FIELDS;
    case 'unitReports':
      return UNIT_REPORTS_FIELDS;
    default:
      return [];
  }
}

/**
 * تشخیص هوشمند سطر سرستون (Header Row) در شیت اکسل (با رد کردن سطرهای عنوان/بنر خالی)
 */
export function detectHeaderRowIndex(rows2D: any[][], targetFields: SmartFieldDefinition[]): number {
  const limit = Math.min(rows2D.length, 15);
  let bestRowIdx = 0;
  let bestScore = -1;

  const knownAliasSet = new Set<string>();
  targetFields.forEach((f) => {
    knownAliasSet.add(normalizeCompactHeader(f.key));
    knownAliasSet.add(normalizeCompactHeader(f.label));
    f.aliases.forEach((a) => knownAliasSet.add(normalizeCompactHeader(a)));
  });

  for (let i = 0; i < limit; i++) {
    const row = rows2D[i] || [];
    const nonEmptyCells = row
      .map((c) => String(c ?? '').trim())
      .filter((s) => s.length > 0);
    if (nonEmptyCells.length === 0) continue;

    let aliasHits = 0;
    let textCells = 0;
    for (const cell of nonEmptyCells) {
      const compact = normalizeCompactHeader(cell);
      if (knownAliasSet.has(compact)) aliasHits += 5;
      if (!/^\d+$/.test(compact) && compact.length >= 2) textCells += 1;
    }

    const score = aliasHits * 10 + textCells * 2 + (nonEmptyCells.length >= 3 ? 4 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = i;
    }
  }

  return bestRowIdx;
}

/**
 * استخراج داده‌های یک شیت بر اساس شماره سطر سرستون انتخاب‌شده
 */
export function extractRowsFromSheet(
  rows2D: any[][],
  headerRowIndex: number
): { headers: string[]; rows: Record<string, any>[] } {
  const rawHeaderRow = rows2D[headerRowIndex] || [];
  const headers: string[] = [];
  const usedCounts = new Map<string, number>();
  const headerIndexMap: { colIdx: number; headerName: string }[] = [];
  const rowSampleEnd = Math.min(rows2D.length, headerRowIndex + 25);

  for (let c = 0; c < rawHeaderRow.length; c++) {
    let h = String(rawHeaderRow[c] ?? '').replace(/\s+/g, ' ').trim();
    if (!h) {
      let hasData = false;
      for (let r = headerRowIndex + 1; r < rowSampleEnd; r++) {
        if (String(rows2D[r]?.[c] ?? '').trim() !== '') {
          hasData = true;
          break;
        }
      }
      if (!hasData) continue;
      h = `ستون_${c + 1}`;
    }
    const count = usedCounts.get(h) || 0;
    usedCounts.set(h, count + 1);
    const uniqueName = count > 0 ? `${h}_${count + 1}` : h;
    headers.push(uniqueName);
    headerIndexMap.push({ colIdx: c, headerName: uniqueName });
  }

  const colCount = headerIndexMap.length;
  const rows: Record<string, any>[] = [];
  for (let r = headerRowIndex + 1; r < rows2D.length; r++) {
    const rawRow = rows2D[r];
    if (!rawRow || rawRow.length === 0) continue;
    const obj: Record<string, any> = {};
    let nonEmpty = false;
    for (let j = 0; j < colCount; j++) {
      const { colIdx, headerName } = headerIndexMap[j];
      const val = rawRow[colIdx];
      if (val === undefined || val === null || val === '') continue;
      if (typeof val === 'string' && val.trim() === '') continue;
      nonEmpty = true;
      obj[headerName] = val;
    }
    if (nonEmpty) rows.push(obj);
  }

  return { headers, rows };
}

/**
 * بازرسی کامل فایل اکسل (پشتیبانی از چند شیت و یافتن خودکار بهترین شیت و سرستون)
 */
export async function inspectExcelWorkbook(
  file: File,
  moduleType: SmartImportModuleType
): Promise<InspectedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const targetFields = getSmartModuleFields(moduleType);

  let defaultSheetIndex = 0;
  let highestMatchScore = -1;

  const sheets: InspectedSheet[] = workbook.SheetNames.map((name, idx) => {
    const ws = workbook.Sheets[name];
    const rows2D = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    const detectedHeaderRowIndex = detectHeaderRowIndex(rows2D, targetFields);
    const extracted = extractRowsFromSheet(rows2D, detectedHeaderRowIndex);
    const mapping = autoMatchColumns(extracted.headers, targetFields);
    const score = Object.values(mapping).filter(Boolean).length * 100 + (extracted.rows.length > 0 ? 10 : 0);
    if (score > highestMatchScore) {
      highestMatchScore = score;
      defaultSheetIndex = idx;
    }
    return {
      name,
      rows2D,
      detectedHeaderRowIndex,
      rawRowCount: extracted.rows.length,
      cachedExtracted: extracted,
    };
  });

  return {
    fileName: file.name,
    sheets,
    defaultSheetIndex,
  };
}

function bigramDiceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }
  let intersections = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const cnt = bigramsA.get(bg) || 0;
    if (cnt > 0) {
      bigramsA.set(bg, cnt - 1);
      intersections++;
    }
  }
  return (2 * intersections) / (a.length + b.length - 2);
}

/**
 * تطبیق هوشمند و خودکار عنوان ستون‌های فایل اکسل ورودی با فیلدهای استاندارد سامانه
 */
export function autoMatchColumns(
  sourceHeaders: string[],
  targetFields: SmartFieldDefinition[]
): Record<string, string> {
  const result: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  const sourceNormalized = sourceHeaders.map((h) => ({
    raw: h,
    norm: normalizeSmartHeader(h),
    compact: normalizeCompactHeader(h),
  }));

  // Pass 1: Exact normalized or exact compact match on key/label/aliases
  for (const field of targetFields) {
    const candidates = [field.key, field.label, ...field.aliases].map((c) => ({
      norm: normalizeSmartHeader(c),
      compact: normalizeCompactHeader(c),
    }));

    const exact = sourceNormalized.find(
      (s) =>
        !usedHeaders.has(s.raw) &&
        candidates.some((c) => (s.norm && s.norm === c.norm) || (s.compact && s.compact === c.compact))
    );
    if (exact) {
      result[field.key] = exact.raw;
      usedHeaders.add(exact.raw);
    }
  }

  // Pass 2: Fuzzy similarity & containment match for remaining unmapped fields
  for (const field of targetFields) {
    if (result[field.key]) continue;
    const candidates = [field.label, field.key, ...field.aliases]
      .map((c) => ({
        norm: normalizeSmartHeader(c),
        compact: normalizeCompactHeader(c),
      }))
      .filter((c) => c.compact.length >= 2);

    let bestHeader = '';
    let bestScore = 0;

    for (const s of sourceNormalized) {
      if (usedHeaders.has(s.raw) || s.compact.length < 2) continue;
      for (const c of candidates) {
        let score = bigramDiceSimilarity(s.compact, c.compact);
        if (s.compact.includes(c.compact) && c.compact.length >= 4) {
          score = Math.max(score, 0.78);
        } else if (c.compact.includes(s.compact) && s.compact.length >= 4) {
          score = Math.max(score, 0.74);
        }
        if (score > bestScore) {
          bestScore = score;
          bestHeader = s.raw;
        }
      }
    }

    if (bestHeader && bestScore >= 0.64) {
      result[field.key] = bestHeader;
      usedHeaders.add(bestHeader);
    }
  }

  return result;
}

/**
 * تبدیل سطرهای خام اکسل به رکوردهای استاندارد بر اساس نگاشت تاییدشده کاربر
 */
export function transformMappedRows(
  rawRows: Record<string, any>[],
  mapping: Record<string, string>,
  moduleType: SmartImportModuleType
): Record<string, any>[] {
  const fields = getSmartModuleFields(moduleType);
  const reverseMappedSourceHeaders = new Set(Object.values(mapping).filter(Boolean));

  return rawRows.map((rawRow) => {
    const out: Record<string, any> = {};

    for (const field of fields) {
      const sourceHeader = mapping[field.key];
      if (sourceHeader && rawRow[sourceHeader] !== undefined) {
        out[field.key] = rawRow[sourceHeader];
      }
    }

    // برای حقوق و دستمزد یا گزارش واحدها، ستون‌های تکمیلی نگاشت‌نشده را نیز حفظ می‌کنیم تا داده‌ای از بین نرود
    if (moduleType === 'payroll' || moduleType === 'unitReports') {
      let extraCount = 0;
      for (const [k, v] of Object.entries(rawRow)) {
        if (extraCount >= 120) break;
        if (k.startsWith('ستون_')) continue;
        if (reverseMappedSourceHeaders.has(k) || out[k] !== undefined) continue;
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        out[k] = typeof v === 'string' ? v.trim() : v;
        extraCount++;
      }
    }

    return out;
  });
}
