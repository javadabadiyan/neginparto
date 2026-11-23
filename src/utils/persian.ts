/**
 * Utility functions for Persian digits, currency, and date formatting
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const str = input.toString();
  return str.replace(/\d/g, (digit) => PERSIAN_DIGITS[parseInt(digit, 10)]);
}

export function toEnglishDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  let str = input.toString();
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), i.toString());
    str = str.replace(new RegExp(ARABIC_DIGITS[i], 'g'), i.toString());
  }
  return str;
}

/**
 * Format Rial amount with thousands separators and Persian digits
 * Example: 45000000 -> "۴۵,۰۰۰,۰۰۰ ریال"
 */
export function formatRial(amount: number | string | null | undefined, includeUnit = true): string {
  if (amount === null || amount === undefined || amount === '') return includeUnit ? '۰ ریال' : '۰';
  const cleanNum = typeof amount === 'number' ? amount : parseFloat(toEnglishDigits(amount).replace(/,/g, '')) || 0;
  
  const isNegative = cleanNum < 0;
  const absNum = Math.abs(Math.round(cleanNum));
  const parts = absNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const persianFormatted = toPersianDigits(parts);
  
  const sign = isNegative ? '-' : '';
  return includeUnit ? `${sign}${persianFormatted} ریال` : `${sign}${persianFormatted}`;
}

/**
 * Format Toman amount (divide by 10)
 */
export function formatToman(amount: number | string | null | undefined, includeUnit = true): string {
  if (amount === null || amount === undefined || amount === '') return includeUnit ? '۰ تومان' : '۰';
  const cleanNum = typeof amount === 'number' ? amount : parseFloat(toEnglishDigits(amount).replace(/,/g, '')) || 0;
  const tomanNum = Math.round(cleanNum / 10);
  
  const isNegative = tomanNum < 0;
  const absNum = Math.abs(tomanNum);
  const parts = absNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const persianFormatted = toPersianDigits(parts);
  
  const sign = isNegative ? '-' : '';
  return includeUnit ? `${sign}${persianFormatted} تومان` : `${sign}${persianFormatted}`;
}

/**
 * Format percentage with Persian digits
 */
export function formatPercent(value: number): string {
  const rounded = Math.abs(value).toFixed(1);
  const persian = toPersianDigits(rounded);
  if (value > 0) return `+${persian}٪`;
  if (value < 0) return `-${persian}٪`;
  return `${persian}٪`;
}

/**
 * Available Persian months
 */
export const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

/**
 * Common recent Persian periods for selection (1403 & 1404)
 */
export const SAMPLE_PERIODS = [
  { id: '1403-10', label: 'دی ۱۴۰۳' },
  { id: '1403-09', label: 'آذر ۱۴۰۳' },
  { id: '1403-08', label: 'آبان ۱۴۰۳' },
  { id: '1403-07', label: 'مهر ۱۴۰۳' },
  { id: '1403-06', label: 'شهریور ۱۴۰۳' },
  { id: '1403-05', label: 'مرداد ۱۴۰۳' },
  { id: '1403-04', label: 'تیر ۱۴۰۳' },
  { id: '1403-03', label: 'خرداد ۱۴۰۳' },
  { id: '1403-02', label: 'اردیبهشت ۱۴۰۳' },
  { id: '1403-01', label: 'فروردین ۱۴۰۳' },
];

export function getPeriodLabel(periodId: string): string {
  const found = SAMPLE_PERIODS.find(p => p.id === periodId);
  if (found) return found.label;
  
  // Parse manually if custom (e.g., 1403-08)
  const parts = periodId.split('-');
  if (parts.length === 2) {
    const year = toPersianDigits(parts[0]);
    const monthIndex = parseInt(parts[1], 10) - 1;
    if (monthIndex >= 0 && monthIndex < PERSIAN_MONTHS.length) {
      return `${PERSIAN_MONTHS[monthIndex]} ${year}`;
    }
  }
  return toPersianDigits(periodId);
}

export const YEARS_LIST = Array.from({ length: 51 }, (_, idx) => String(1400 + idx));

export function parsePeriod(periodId: string): { year: string; monthIndex: number; monthName: string } {
  if (!periodId || !periodId.includes('-')) {
    return { year: '1403', monthIndex: 7, monthName: 'آبان' };
  }
  const parts = periodId.split('-');
  const year = parts[0] || '1403';
  const monthNum = parseInt(parts[1] || '8', 10);
  const monthIndex = Math.max(0, Math.min(11, monthNum - 1));
  return {
    year,
    monthIndex,
    monthName: PERSIAN_MONTHS[monthIndex]
  };
}

export function buildPeriod(year: string, monthIndex: number): string {
  const m = (monthIndex + 1).toString().padStart(2, '0');
  return `${year}-${m}`;
}

export function getPreviousPeriodId(periodId: string): string {
  const { year, monthIndex } = parsePeriod(periodId);
  const currentYearNum = parseInt(year, 10);
  if (monthIndex === 0) {
    // If Farvardin, previous month is Esfand of last year
    return buildPeriod((currentYearNum - 1).toString(), 11);
  }
  return buildPeriod(year, monthIndex - 1);
}

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function convertThreeDigits(num: number): string {
  if (num === 0) return '';
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const remainder = num % 100;
  if (h > 0) parts.push(HUNDREDS[h]);

  if (remainder >= 10 && remainder <= 19) {
    parts.push(TEENS[remainder - 10]);
  } else {
    const t = Math.floor(remainder / 10);
    const o = remainder % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }
  return parts.join(' و ');
}

export function numberToPersianWords(input: number | string): string {
  const clean = typeof input === 'number' ? input : parseFloat(toEnglishDigits(input).replace(/,/g, '')) || 0;
  if (clean === 0) return 'صفر';

  const isNeg = clean < 0;
  let abs = Math.abs(Math.round(clean));

  const chunks: string[] = [];
  let scaleIndex = 0;

  while (abs > 0) {
    const chunk = abs % 1000;
    if (chunk !== 0) {
      const words = convertThreeDigits(chunk);
      const scale = SCALES[scaleIndex];
      chunks.unshift(scale ? `${words} ${scale}` : words);
    }
    abs = Math.floor(abs / 1000);
    scaleIndex++;
  }

  const result = chunks.join(' و ');
  return (isNeg ? 'منفی ' : '') + result;
}

/**
 * Calculate difference and percentage between two values
 */
export function calculateComparison(current: number, previous: number) {
  const diffAmount = current - previous;
  let diffPercent = 0;
  if (previous > 0) {
    diffPercent = ((current - previous) / previous) * 100;
  } else if (current > 0) {
    diffPercent = 100;
  }

  let trend: 'increase' | 'decrease' | 'unchanged' | 'new' = 'unchanged';
  if (previous === 0 && current > 0) {
    trend = 'new';
  } else if (diffAmount > 0) {
    trend = 'increase';
  } else if (diffAmount < 0) {
    trend = 'decrease';
  }

  return {
    diffAmount,
    diffPercent,
    trend,
  };
}

