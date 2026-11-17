import { toEnglishDigits } from './persian';

export const PAYROLL_LOAN_GROUPS: string[] = [
  'وام صندوق',
  'بیمه ثالث و بدنه خودرو',
  'خرید عینک فروشگاه نگین',
  'وام صندوق کارکنان جهاد نصر سیرجان',
  'خسارت',
  'مساعده کارگزینی',
  'مساعده مالی',
  'خرید بتن',
  'وام بانک ملت',
  'کمک به بازسازی و توسعه عتبات عالیات',
  'وام پروژه تاقدیس',
  'وام سهام جهان فولاد سیرجان ( فجهان)',
  'لوازم تحریر( شمس)',
  'لوازم تحریر(پلیکان)',
  'سهام شرکت آرمان گهرنصر',
  'لوازم تحریر( فرهنگیان)',
  'لوازم تحریر( شاد شو)',
  'لوازم تحریر( زرین خط)',
];

export const PAYROLL_LOAN_SUBFIELDS: string[] = [
  'مبلغ وام',
  'پرداختي تا ماه',
  'قسط در ماه غيرسيستمي',
  'قسط در ماه سيستمي',
  'مانده وام',
  'تعداد قسط',
];

export const PAYROLL_MAIN_ORDER_FIELDS: string[] = [
  'حقوق پایه(حكم-اصلي)',
  'تفاوت تطبیق(حكم-اصلي)',
  'حق اولاد(حكم-اصلي)',
  'حق جذب(حكم-اصلي)',
  'حق سرپرستی(حكم-اصلي)',
  'حق مسکن(حكم-اصلي)',
  'دوری از مرکز(حكم-اصلي)',
  'افزایش سنوات(حكم-اصلي)',
  'مزایای رفاهی و انگیزشی(حق بن)(حكم-اصلي)',
  'سختی کار(حكم-اصلي)',
  'فوق العاده شغل(حكم-اصلي)',
  'محرومیت از تسهیلأت(حكم-اصلي)',
  'حق تاهل(حكم-اصلي)',
  'تست(حكم-اصلي)',
  'حق ایاب و ذهاب غیرفعال(حكم-اصلي)',
  'حق سختی کار(حكم-اصلي)',
  'بدی آب وهوا(حكم-اصلي)',
  'ایاب و ذهاب(حكم-اصلي)',
  'مزد رتبه(حكم-اصلي)',
  'آرمان گهر(حكم-اصلي)',
  'حق شایستگی(حكم-اصلي)',
  'حق ایثارگری(حكم-اصلي)',
  'تفاوت مزد مبنا(حكم-اصلي)',
  'کمک هزینه فرزند معلول(حكم-اصلي)',
];

export const PAYROLL_SUB_ORDER_FIELDS: string[] = [
  'درصد حق شایستگی(حكم-فرعي)',
  'سابقه کار(سال)(حكم-فرعي)',
  'سابقه کار(ماه)(حكم-فرعي)',
  'انتقالی آرمان به نگین(حكم-فرعي)',
  'کنترل ایاب و ذهاب(حكم-فرعي)',
  'نوع قرارداد(حكم-فرعي)',
  'سابقه خدمت قابل قبول(حكم-فرعي)',
  'سابقه تجربی قابل قبول(حكم-فرعي)',
];

export const PAYROLL_EXCEL_COLUMNS: string[] = [
  'سال/ماه',
  'شناسه كارمند',
  'كد پرسنلي',
  'نام',
  'نام خانوادگي',
  'نام و نام خانوادگي',
  'نام پدر',
  'شماره شناسنامه',
  'كد ملي',
  'مليت',
  'تابعيت',
  'جنسيت',
  'تلفن همراه',
  'پست الكترونيك',
  'محل تولد',
  'محل صدور',
  'تاريخ تولد',
  'تاريخ صدور',
  'وضعيت تاهل',
  'وضعيت نظام وظيفه',
  'مدرك تحصيلي',
  'رشته تحصيلي',
  'تاريخ استخدام',
  'محل خدمت',
  'واحد سازماني',
  'شغل',
  'كد شغل',
  'پست',
  'كد پست',
  'رتبه',
  'کد گروه شغلي',
  'عنوان گروه شغلي',
  'نوع استخدام',
  'نوع حكم',
  'تعداد فرزند',
  'شماره حكم',
  'تاريخ اجرا حكم',
  'تاريخ صدور حكم',
  'كد وضعيت حكم',
  'وضعيت حكم',
  'کد شغل بیمه',
  'تفصیل شخص',
  'کارکرد موثر',
  'خالص پرداختی',
  'جمع مزایا',
  'اضافه کاری',
  'جمعه کاری',
  'ماموریت ریالی',
  'پاداش',
  'تشویقی',
  'پاداشِ',
  'سایر مزایا',
  'مابه التفاوت',
  'وام معوق یا نامه قضائی',
  'مساعده',
  'جمع کسور',
  'مالیات',
  'مالیات حقوق',
  'بدهی ماه جاری',
  'کمک هزینه فرزند معلول',
  'حق اولاد',
  'حق تاهل',
  'نوبتکاری',
  'ماموریت محاسباتی',
  'مزد شغل',
  'جمع عوامل حکمی',
  'ساعت اضافه کاری(کارکرد)',
  'ساعت جمعه کاری(کارکرد)',
  'مازاد اصلی(کارکرد)',
  ...PAYROLL_LOAN_GROUPS.flatMap((group) =>
    PAYROLL_LOAN_SUBFIELDS.map((sub) => `${group}(${sub})`)
  ),
  ...PAYROLL_MAIN_ORDER_FIELDS,
  ...PAYROLL_SUB_ORDER_FIELDS,
  'جمع عوامل حكمي',
  'مرکز هزینه(كد تفصيل)',
  'مرکز هزینه(عنوان تفصيل)',
  'پروژه(كد تفصيل)',
  'پروژه(عنوان تفصيل)',
  'شعبه سازمان تامین اجتماعی',
  'شماره شعبه سازمان تامین اجتماعی',
  'رديف پيمان سازمان تامین اجتماعی',
  'شماره بيمه سازمان تامین اجتماعی',
  'شعبه اداره دارایی و امور اقتصادی',
  'گروه مالياتي اداره دارایی و امور اقتصادی',
  'روش محاسبه ماليات اداره دارایی و امور اقتصادی',
  'شماره/كد اداره دارایی و امور اقتصادی',
  'نام بانک',
  'شعبه',
  'شماره حساب',
  'نام صندوق',
];

export function normalizeFaHeader(key: string): string {
  return String(key || '')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/أ|إ/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePayrollNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = toEnglishDigits(String(val))
    .replace(/[,٬،\s]/g, '')
    .replace(/ریال/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getPayrollField(row: Record<string, any>, ...candidates: string[]): any {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c];
  }
  const normalizedMap = new Map<string, any>();
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null && v !== '') {
      const nk = normalizeFaHeader(k);
      if (!normalizedMap.has(nk)) normalizedMap.set(nk, v);
    }
  }
  for (const c of candidates) {
    const found = normalizedMap.get(normalizeFaHeader(c));
    if (found !== undefined) return found;
  }
  return undefined;
}

export function parseYearMonthToPeriod(rawYearMonth: any, fallbackPeriod: string): string {
  const str = toEnglishDigits(String(rawYearMonth || '')).trim();
  if (!str) return fallbackPeriod;

  // Match 1403/08 or 1403-08
  const slashMatch = str.match(/^(\d{4})\s*[-/]\s*(\d{1,2})$/);
  if (slashMatch) {
    const yr = slashMatch[1];
    const mo = slashMatch[2].padStart(2, '0');
    if (Number(mo) >= 1 && Number(mo) <= 12) return `${yr}-${mo}`;
  }

  // Match 140308
  const compactMatch = str.match(/^(\d{4})(\d{2})$/);
  if (compactMatch) {
    const yr = compactMatch[1];
    const mo = compactMatch[2];
    if (Number(mo) >= 1 && Number(mo) <= 12) return `${yr}-${mo}`;
  }

  return fallbackPeriod;
}

export function createSamplePayrollRow(overrides: Record<string, string | number>): Record<string, string | number> {
  const base: Record<string, string | number> = {};
  for (const col of PAYROLL_EXCEL_COLUMNS) {
    base[col] = col.includes('مبلغ') || col.includes('قسط') || col.includes('مانده') || col.includes('پرداخت') || col.includes('مزایا') || col.includes('کسور') || col.includes('مالیات') || col.includes('حق') || col.includes('مزد') || col.includes('اضافه') || col.includes('پاداش') || col.includes('مساعده') || col.includes('کارکرد') || col.includes('تفاوت') || col.includes('سختی') || col.includes('فوق العاده') || col.includes('سنوات') || col.includes('جذب') || col.includes('سرپرستی') || col.includes('مسکن') || col.includes('دوری') || col.includes('محرومیت') || col.includes('ایاب') || col.includes('نوبتکاری') || col.includes('ماموریت') || col.includes('بدهی')
      ? 0
      : '';
  }
  return { ...base, ...overrides };
}
