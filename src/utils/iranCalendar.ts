import { PERSIAN_MONTHS, toPersianDigits } from './persian';

export interface CalendarOccasion {
  title: string;
  isHoliday: boolean;
  category: 'national' | 'religious' | 'occasion' | 'weekly';
}

export interface DayCalendarInfo {
  date: Date;
  jYear: number;
  jMonth: number; // 1..12
  jDay: number; // 1..31
  jMonthName: string;
  weekdayName: string;
  isFriday: boolean;
  hijriYear: number;
  hijriMonth: number;
  hijriDay: number;
  hijriMonthName: string;
  persianDateShort: string; // e.g. ۱۴۰۵/۰۴/۰۹
  persianDateFull: string; // e.g. سه‌شنبه ۹ تیر ۱۴۰۵
  hijriDateShort: string;
  gregorianDateShort: string;
  isHoliday: boolean;
  occasions: CalendarOccasion[];
  primaryOccasionTitle: string;
}

export interface MonthCalendarEvent {
  jDay: number;
  jMonth: number;
  weekdayName: string;
  persianDateLabel: string;
  isHoliday: boolean;
  occasions: CalendarOccasion[];
}

const HIJRI_MONTH_NAMES = [
  'محرم',
  'صفر',
  'ربیع‌الاول',
  'ربیع‌الثانی',
  'جمادی‌الاول',
  'جمادی‌الثانی',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذی‌القعده',
  'ذی‌الحجه',
];

// Fixed Solar Jalali official holidays & key national / workplace occasions in Iran (MM-DD -> occasions)
const SOLAR_EVENTS: Record<string, CalendarOccasion[]> = {
  '01-01': [{ title: 'آغاز نوروز (جشن سال نو)', isHoliday: true, category: 'national' }],
  '01-02': [{ title: 'عید نوروز', isHoliday: true, category: 'national' }],
  '01-03': [{ title: 'عید نوروز', isHoliday: true, category: 'national' }],
  '01-04': [{ title: 'عید نوروز', isHoliday: true, category: 'national' }],
  '01-12': [{ title: 'روز جمهوری اسلامی ایران', isHoliday: true, category: 'national' }],
  '01-13': [{ title: 'روز طبیعت (سیزده‌به‌در)', isHoliday: true, category: 'national' }],
  '01-20': [{ title: 'روز ملی فناوری هسته‌ای', isHoliday: false, category: 'occasion' }],
  '01-25': [{ title: 'روز بزرگداشت عطار نیشابوری', isHoliday: false, category: 'occasion' }],
  '02-01': [{ title: 'روز بزرگداشت سعدی', isHoliday: false, category: 'occasion' }],
  '02-10': [{ title: 'روز ملی خلیج فارس', isHoliday: false, category: 'occasion' }],
  '02-11': [{ title: 'روز جهانی کار و کارگر', isHoliday: false, category: 'occasion' }],
  '02-12': [{ title: 'روز معلم', isHoliday: false, category: 'occasion' }],
  '02-25': [{ title: 'روز بزرگداشت فردوسی و پاسداشت زبان فارسی', isHoliday: false, category: 'occasion' }],
  '03-03': [{ title: 'سالروز فتح خرمشهر (روز مقاومت)', isHoliday: false, category: 'occasion' }],
  '03-14': [{ title: 'رحلت حضرت امام خمینی (ره)', isHoliday: true, category: 'national' }],
  '03-15': [{ title: 'قیام خونین ۱۵ خرداد', isHoliday: true, category: 'national' }],
  '04-07': [{ title: 'روز قوه قضائیه', isHoliday: false, category: 'occasion' }],
  '04-10': [{ title: 'روز صنعت و معدن', isHoliday: false, category: 'occasion' }],
  '05-17': [{ title: 'روز خبرنگار', isHoliday: false, category: 'occasion' }],
  '06-04': [{ title: 'روز کارمند', isHoliday: false, category: 'occasion' }],
  '06-08': [{ title: 'روز مبارزه با تروریسم', isHoliday: false, category: 'occasion' }],
  '06-31': [{ title: 'آغاز هفته دفاع مقدس', isHoliday: false, category: 'occasion' }],
  '07-07': [{ title: 'روز آتش‌نشانی و ایمنی', isHoliday: false, category: 'occasion' }],
  '07-14': [{ title: 'روز دامپزشکی و منابع طبیعی', isHoliday: false, category: 'occasion' }],
  '07-20': [{ title: 'روز بزرگداشت حافظ', isHoliday: false, category: 'occasion' }],
  '08-08': [{ title: 'روز پدافند غیرعامل', isHoliday: false, category: 'occasion' }],
  '08-13': [{ title: 'روز دانش‌آموز', isHoliday: false, category: 'occasion' }],
  '09-07': [{ title: 'روز نیروی دریایی', isHoliday: false, category: 'occasion' }],
  '09-15': [{ title: 'روز حسابدار', isHoliday: false, category: 'occasion' }],
  '09-16': [{ title: 'روز دانشجو', isHoliday: false, category: 'occasion' }],
  '09-30': [{ title: 'شب یلدا (چله)', isHoliday: false, category: 'occasion' }],
  '10-05': [{ title: 'روز ملی ایمنی در برابر زلزله', isHoliday: false, category: 'occasion' }],
  '10-13': [{ title: 'روز جهانی مقاومت', isHoliday: false, category: 'occasion' }],
  '11-12': [{ title: 'آغاز دهه فجر انقلاب اسلامی', isHoliday: false, category: 'occasion' }],
  '11-22': [{ title: 'پیروزی انقلاب اسلامی ایران', isHoliday: true, category: 'national' }],
  '12-05': [{ title: 'روز مهندس (بزرگداشت خواجه نصیرالدین طوسی)', isHoliday: false, category: 'occasion' }],
  '12-15': [{ title: 'روز درختکاری', isHoliday: false, category: 'occasion' }],
  '12-29': [{ title: 'روز ملی شدن صنعت نفت ایران', isHoliday: true, category: 'national' }],
};

// Official Islamic Lunar holidays & major occasions in Iran (Hijri MM-DD -> occasions)
const LUNAR_EVENTS: Record<string, CalendarOccasion[]> = {
  '01-01': [{ title: 'آغاز سال هجری قمری', isHoliday: false, category: 'religious' }],
  '01-09': [{ title: 'تاسوعای حسینی', isHoliday: true, category: 'religious' }],
  '01-10': [{ title: 'عاشورای حسینی', isHoliday: true, category: 'religious' }],
  '02-20': [{ title: 'اربعین حسینی', isHoliday: true, category: 'religious' }],
  '02-28': [{ title: 'رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)', isHoliday: true, category: 'religious' }],
  '02-29': [{ title: 'شهادت امام رضا (ع) (پایان ماه صفر)', isHoliday: true, category: 'religious' }],
  '03-08': [{ title: 'شهادت امام حسن عسکری (ع)', isHoliday: true, category: 'religious' }],
  '03-17': [{ title: 'میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)', isHoliday: true, category: 'religious' }],
  '06-03': [{ title: 'شهادت حضرت فاطمه زهرا (س)', isHoliday: true, category: 'religious' }],
  '07-13': [{ title: 'ولادت حضرت علی (ع) و روز پدر', isHoliday: true, category: 'religious' }],
  '07-27': [{ title: 'عید سعید مبعث پیامبر اکرم (ص)', isHoliday: true, category: 'religious' }],
  '08-15': [{ title: 'میلاد حضرت ولی‌عصر (عج) — نیمه شعبان', isHoliday: true, category: 'religious' }],
  '09-15': [{ title: 'ولادت امام حسن مجتبی (ع)', isHoliday: false, category: 'religious' }],
  '09-19': [{ title: 'ضربت خوردن حضرت علی (ع) (شب قدر)', isHoliday: false, category: 'religious' }],
  '09-21': [{ title: 'شهادت حضرت علی (ع)', isHoliday: true, category: 'religious' }],
  '10-01': [{ title: 'عید سعید فطر', isHoliday: true, category: 'religious' }],
  '10-02': [{ title: 'تعطیل عید سعید فطر', isHoliday: true, category: 'religious' }],
  '10-25': [{ title: 'شهادت امام جعفر صادق (ع)', isHoliday: true, category: 'religious' }],
  '12-10': [{ title: 'عید سعید قربان', isHoliday: true, category: 'religious' }],
  '12-18': [{ title: 'عید سعید غدیر خم', isHoliday: true, category: 'religious' }],
};

function extractNumericParts(date: Date, calendar: string): { year: number; month: number; day: number } {
  try {
    const fmt = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = fmt.formatToParts(date);
    const y = Number(parts.find((p) => p.type === 'year')?.value || 0);
    const m = Number(parts.find((p) => p.type === 'month')?.value || 1);
    const d = Number(parts.find((p) => p.type === 'day')?.value || 1);
    if (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { year: y, month: m, day: d };
    }
  } catch {
    // Fallback below
  }
  return {
    year: calendar === 'persian' ? 1404 : calendar.startsWith('islamic') ? 1447 : date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getIranWeekday(date: Date): { weekdayName: string; isFriday: boolean } {
  try {
    const weekdayName = new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
    }).format(date);
    return {
      weekdayName,
      isFriday: weekdayName.includes('جمعه'),
    };
  } catch {
    const names = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
    const idx = date.getDay();
    return { weekdayName: names[idx] || '', isFriday: idx === 5 };
  }
}

export function getDayIranCalendarInfo(inputDate: Date = new Date()): DayCalendarInfo {
  const persian = extractNumericParts(inputDate, 'persian');
  // Prefer islamic-civil (closest tabular match in Intl to Iran lunar calendar), fallback umalqura
  let hijri = extractNumericParts(inputDate, 'islamic-civil');
  if (!hijri || hijri.year < 1300) {
    hijri = extractNumericParts(inputDate, 'islamic-umalqura');
  }
  const { weekdayName, isFriday } = getIranWeekday(inputDate);

  const solarKey = `${String(persian.month).padStart(2, '0')}-${String(persian.day).padStart(2, '0')}`;
  const lunarKey = `${String(hijri.month).padStart(2, '0')}-${String(hijri.day).padStart(2, '0')}`;

  const occasions: CalendarOccasion[] = [];
  const solarMatches = SOLAR_EVENTS[solarKey] || [];
  const lunarMatches = LUNAR_EVENTS[lunarKey] || [];

  occasions.push(...solarMatches, ...lunarMatches);
  if (isFriday) {
    occasions.push({ title: 'تعطیل پایان هفته (جمعه)', isHoliday: true, category: 'weekly' });
  }

  const isHoliday = isFriday || occasions.some((o) => o.isHoliday);
  const jMonthName = PERSIAN_MONTHS[persian.month - 1] || '';
  const hijriMonthName = HIJRI_MONTH_NAMES[hijri.month - 1] || '';

  const persianDateShort = toPersianDigits(
    `${persian.year}/${String(persian.month).padStart(2, '0')}/${String(persian.day).padStart(2, '0')}`
  );
  const persianDateFull = `${weekdayName} ${toPersianDigits(persian.day)} ${jMonthName} ${toPersianDigits(persian.year)}`;
  const hijriDateShort = `${toPersianDigits(hijri.day)} ${hijriMonthName} ${toPersianDigits(hijri.year)}`;

  let gregorianDateShort = '';
  try {
    gregorianDateShort = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(inputDate);
  } catch {
    gregorianDateShort = inputDate.toISOString().slice(0, 10);
  }

  const holidayOccasion = occasions.find((o) => o.isHoliday && o.category !== 'weekly');
  const firstOccasion = holidayOccasion || occasions[0];
  const primaryOccasionTitle = firstOccasion ? firstOccasion.title : 'روز کاری عادی';

  return {
    date: inputDate,
    jYear: persian.year,
    jMonth: persian.month,
    jDay: persian.day,
    jMonthName,
    weekdayName,
    isFriday,
    hijriYear: hijri.year,
    hijriMonth: hijri.month,
    hijriDay: hijri.day,
    hijriMonthName,
    persianDateShort,
    persianDateFull,
    hijriDateShort,
    gregorianDateShort,
    isHoliday,
    occasions,
    primaryOccasionTitle,
  };
}

/**
 * Enumerate all holidays and occasions in the same Jalali month as referenceDate
 */
export function getCurrentJalaliMonthEvents(referenceDate: Date = new Date()): {
  jYear: number;
  jMonth: number;
  jMonthName: string;
  events: MonthCalendarEvent[];
  holidaysCount: number;
} {
  const ref = getDayIranCalendarInfo(referenceDate);
  // Step backward to day 1 of this Jalali month and forward up to 31 days
  const startGuess = new Date(referenceDate.getTime() - (ref.jDay - 1) * 86400000);
  const events: MonthCalendarEvent[] = [];
  const seenDays = new Set<number>();

  for (let offset = -1; offset <= 32; offset++) {
    const d = new Date(startGuess.getTime() + offset * 86400000);
    const info = getDayIranCalendarInfo(d);
    if (info.jYear !== ref.jYear || info.jMonth !== ref.jMonth) continue;
    if (seenDays.has(info.jDay)) continue;
    seenDays.add(info.jDay);

    if (info.occasions.length > 0) {
      events.push({
        jDay: info.jDay,
        jMonth: info.jMonth,
        weekdayName: info.weekdayName,
        persianDateLabel: `${info.weekdayName} ${toPersianDigits(info.jDay)} ${info.jMonthName}`,
        isHoliday: info.isHoliday,
        occasions: info.occasions,
      });
    }
  }

  events.sort((a, b) => a.jDay - b.jDay);
  const holidaysCount = events.filter((e) => e.isHoliday).length;
  return {
    jYear: ref.jYear,
    jMonth: ref.jMonth,
    jMonthName: ref.jMonthName,
    events,
    holidaysCount,
  };
}
