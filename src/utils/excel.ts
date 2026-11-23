import * as XLSX from 'xlsx';
import {
  Personnel,
  PersonnelRelative,
  KaranehComparisonRow,
  PersonnelCommitment,
  JobClassificationRecord,
  User,
  PayrollRecord,
  PayrollComparisonRow,
  PayrollAnalysisMetric
} from '../types';
import {
  PAYROLL_EXCEL_COLUMNS,
  createSamplePayrollRow,
  getPayrollField
} from './payrollColumns';
import { PayrollGroupStat, getRowMetricValues } from './payrollAnalytics';

/**
 * Export Personnel list to Excel file (Full 28 HR/Identity columns + supplementary columns)
 */
export function exportPersonnelToExcel(personnelList: Personnel[], fileName = 'پرونده_جامع_پرسنل_۲۸_ستون.xlsx') {
  const data = personnelList.map((p) => ({
    'شناسه كارمند': p.employeeId || '',
    'كد پرسنلي': p.personnelCode || '',
    'نام': p.firstName || '',
    'نام خانوادگي': p.lastName || '',
    'نام و نام خانوادگي': p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
    'نام پدر': p.fatherName || '',
    'شماره شناسنامه': p.shenasnamehNumber || '',
    'كد ملي': p.nationalId || '',
    'مليت': p.nationality || '',
    'تابعيت': p.citizenship || '',
    'جنسيت': p.gender || '',
    'تلفن همراه': p.phone || '',
    'پست الكترونيك': p.email || '',
    'محل تولد': p.birthPlace || '',
    'محل صدور': p.issuePlace || '',
    'تاريخ تولد': p.birthDate || '',
    'تاريخ صدور': p.issueDate || '',
    'وضعيت تاهل': p.maritalStatus || p.documents?.maritalStatus || '',
    'وضعيت نظام وظيفه': p.militaryStatus || '',
    'مدرك تحصيلي': p.education || '',
    'رشته تحصيلي': p.fieldOfStudy || '',
    'تاريخ استخدام': p.hireDate || '',
    'محل خدمت': p.workLocation || '',
    'واحد سازماني': p.department || '',
    'شغل': p.jobTitle || '',
    'كد شغل': p.jobCode || '',
    'پست': p.position || '',
    'كد پست': p.positionCode || '',
    'نوع استخدام': p.employmentType || '',
    'گروه شغلی': p.jobGroupName || '',
    'وضعیت': p.status || 'فعال',
    'حقوق پایه (ریال)': p.baseSalary || 0,
    'تعداد بستگان': Array.isArray(p.relatives) ? p.relatives.length : (p.documents?.children?.length || 0),
    'یادداشت': p.notes || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = Array.from({ length: 34 }, () => ({ wch: 18 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'اطلاعات پرسنلی و کارگزینی');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Export Personnel Relatives to Excel
 */
export function exportPersonnelRelativesToExcel(
  relatives: PersonnelRelative[],
  fileName = 'لیست_بستگان_و_عائله_پرسنل.xlsx'
) {
  const data = relatives.map((r, idx) => ({
    'ردیف': idx + 1,
    'کد پرسنلی کارمند': r.personnelCode || '',
    'نام کارمند': r.personnelName || '',
    'نام و نام خانوادگی بستگان': r.fullName || '',
    'نسبت': r.relation || '',
    'کد ملی بستگان': r.nationalId || '',
    'شماره شناسنامه': r.shenasnamehNumber || '',
    'نام پدر': r.fatherName || '',
    'تاریخ تولد': r.birthDate || '',
    'جنسیت': r.gender || '',
    'شماره تماس': r.phone || '',
    'تحصیلات': r.education || '',
    'تحت تکفل': r.isDependent ? 'بله' : 'خیر',
    'پوشش بیمه تکمیلی': r.insuranceCovered ? 'بله' : 'خیر',
    'توضیحات': r.notes || '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'پیام': 'موردی ثبت نشده است' }]);
  worksheet['!cols'] = Array.from({ length: 15 }, () => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'بستگان پرسنل');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Sample Excel template for Personnel Relatives import
 */
export function downloadPersonnelRelativesTemplate() {
  const sample = [
    {
      'کد پرسنلی کارمند': '10101',
      'نام کارمند': 'رضا قاسمی',
      'نام و نام خانوادگی بستگان': 'سارا محمدی',
      'نسبت': 'همسر',
      'کد ملی بستگان': '3071122334',
      'شماره شناسنامه': '4512',
      'نام پدر': 'حسین',
      'تاریخ تولد': '1369/05/14',
      'جنسیت': 'زن',
      'شماره تماس': '09131112233',
      'تحصیلات': 'کارشناسی',
      'تحت تکفل': 'بله',
      'پوشش بیمه تکمیلی': 'بله',
      'توضیحات': 'همسر دائمی - تحت پوشش بیمه تکمیلی',
    },
    {
      'کد پرسنلی کارمند': '10101',
      'نام کارمند': 'رضا قاسمی',
      'نام و نام خانوادگی بستگان': 'امیرعلی قاسمی',
      'نسبت': 'فرزند (پسر)',
      'کد ملی بستگان': '3079988776',
      'شماره شناسنامه': '10442',
      'نام پدر': 'رضا',
      'تاریخ تولد': '1396/02/20',
      'جنسیت': 'مرد',
      'شماره تماس': '',
      'تحصیلات': 'دانش‌آموز',
      'تحت تکفل': 'بله',
      'پوشش بیمه تکمیلی': 'بله',
      'توضیحات': 'فرزند اول',
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(sample);
  worksheet['!cols'] = Array.from({ length: 14 }, () => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_بستگان_پرسنل');
  XLSX.writeFile(workbook, 'الگوی_اکسل_اطلاعات_بستگان_پرسنل.xlsx');
}

/**
 * Export Karaneh list to Excel with Month-over-Month comparison
 */
export function exportKaranehComparisonToExcel(
  rows: KaranehComparisonRow[],
  currentPeriodName: string,
  previousPeriodName: string,
  fileName = `گزارش_تحلیلی_مقایسه_کارانه_${currentPeriodName}.xlsx`
) {
  const data = rows.map((r, index) => ({
    'ردیف': index + 1,
    'کد پرسنلی': r.personnelCode,
    'نام و نام خانوادگی': r.fullName,
    'پست سازمانی': r.position || '',
    'واحد اداری': r.department || '',
    [`کارانه ${previousPeriodName} (ماه قبل)`]: r.previousKaraneh,
    [`کارانه ${currentPeriodName} (ماه جدید)`]: r.currentKaraneh,
    'اختلاف مبلغ (ریال)': r.diffAmount,
    'درصد تغییر': r.diffPercent ? `${r.diffPercent.toFixed(1)}%` : '۰%',
    'وضعیت روند': r.trend === 'increase' ? 'افزایشی' : r.trend === 'decrease' ? 'کاهشی' : r.trend === 'new' ? 'جدید' : 'بدون تغییر',
    'توضیحات و علت تغییر': r.notes || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 25 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'تحلیل کارانه');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Export Final Submitted Consolidated Karaneh (2 sheets: employee details + unit summary & % change)
 */
export function exportFinalKaranehToExcel(
  rows: KaranehComparisonRow[],
  unitSummaries: Array<{
    department: string;
    employeesCount: number;
    totalPrevious: number;
    totalCurrent: number;
    diffAmount: number;
    diffPercent: number;
    submittedAt?: string;
    submittedByName?: string;
  }>,
  currentPeriodName: string,
  previousPeriodName: string,
  fileName = `کارانه_نهایی_ارسالی_واحدها_${currentPeriodName}.xlsx`
) {
  const detailsData = rows.map((r, index) => ({
    'ردیف': index + 1,
    'کد پرسنلی': r.personnelCode,
    'نام و نام خانوادگی': r.fullName,
    'واحد': r.department || '',
    'پست': r.position || '',
    [`کارانه ${previousPeriodName} (ماه قبل)`]: r.previousKaraneh,
    [`کارانه ${currentPeriodName} (ماه جدید)`]: r.currentKaraneh,
    'تغییر مبلغ (ریال)': r.diffAmount,
    'درصد افزایش / تغییر': r.diffPercent ? `${r.diffPercent.toFixed(1)}%` : '۰%',
    'وضعیت روند': r.trend === 'increase' ? 'افزایشی' : r.trend === 'decrease' ? 'کاهشی' : r.trend === 'new' ? 'جدید' : 'بدون تغییر',
    'تأییدکننده واحد': r.submittedByName || '—',
    'زمان ارسال': r.submittedAt || '—',
    'توضیحات': r.notes || '',
  }));

  const unitData = unitSummaries.map((u, index) => ({
    'ردیف': index + 1,
    'نام واحد': u.department,
    'تعداد پرسنل': u.employeesCount,
    [`جمع ${previousPeriodName} (ریال)`]: u.totalPrevious,
    [`جمع ${currentPeriodName} (ریال)`]: u.totalCurrent,
    'اختلاف مبلغ (ریال)': u.diffAmount,
    'درصد افزایش / تغییر': `${u.diffPercent.toFixed(1)}%`,
    'ارسال‌کننده': u.submittedByName || '—',
    'تاریخ ارسال نهایی': u.submittedAt || '—',
  }));

  const detailsSheet = XLSX.utils.json_to_sheet(detailsData);
  detailsSheet['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 25 },
  ];

  const unitSheet = XLSX.utils.json_to_sheet(unitData);
  unitSheet['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailsSheet, 'کارانه_نهایی_پرسنل');
  XLSX.utils.book_append_sheet(workbook, unitSheet, 'تحلیل_و_خلاصه_واحدها');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Generate sample Excel template for Personnel import (Full exact 28 columns + optional salary/status)
 */
export function downloadPersonnelTemplate() {
  const sample = [
    {
      'شناسه كارمند': 'EMP-10101',
      'كد پرسنلي': '10101',
      'نام': 'رضا',
      'نام خانوادگي': 'قاسمی',
      'نام و نام خانوادگي': 'رضا قاسمی',
      'نام پدر': 'محمد',
      'شماره شناسنامه': '1245',
      'كد ملي': '0078912345',
      'مليت': 'ایرانی',
      'تابعيت': 'ایران',
      'جنسيت': 'مرد',
      'تلفن همراه': '09121114567',
      'پست الكترونيك': 'r.ghasemi@mine.ir',
      'محل تولد': 'سیرجان',
      'محل صدور': 'سیرجان',
      'تاريخ تولد': '1365/04/12',
      'تاريخ صدور': '1365/04/20',
      'وضعيت تاهل': 'متاهل',
      'وضعيت نظام وظيفه': 'پایان خدمت',
      'مدرك تحصيلي': 'کارشناسی ارشد',
      'رشته تحصيلي': 'مهندسی معدن - استخراج',
      'تاريخ استخدام': '1397/02/10',
      'محل خدمت': 'مجتمع معدنی شماره ۱',
      'واحد سازماني': 'استخراج و معدن‌کاری',
      'شغل': 'مهندس بهره‌برداری معدن',
      'كد شغل': 'SH-201',
      'پست': 'رئیس شیفت استخراج',
      'كد پست': 'PS-201',
      'نوع استخدام': 'رسمی',
      'حقوق پایه (ریال)': 240000000,
    },
    {
      'شناسه كارمند': 'EMP-10102',
      'كد پرسنلي': '10102',
      'نام': 'مهدی',
      'نام خانوادگي': 'صادقی',
      'نام و نام خانوادگي': 'مهدی صادقی',
      'نام پدر': 'علی',
      'شماره شناسنامه': '884',
      'كد ملي': '3071234567',
      'مليت': 'ایرانی',
      'تابعيت': 'ایران',
      'جنسيت': 'مرد',
      'تلفن همراه': '09132225678',
      'پست الكترونيك': 'm.sadeghi@mine.ir',
      'محل تولد': 'کرمان',
      'محل صدور': 'کرمان',
      'تاريخ تولد': '1368/08/22',
      'تاريخ صدور': '1368/08/30',
      'وضعيت تاهل': 'متاهل',
      'وضعيت نظام وظيفه': 'پایان خدمت',
      'مدرك تحصيلي': 'کارشناسی',
      'رشته تحصيلي': 'مهندسی مکانیک خودروهای سنگین',
      'تاريخ استخدام': '1399/05/01',
      'محل خدمت': 'کارگاه مرکزی معدن',
      'واحد سازماني': 'تعمیرگاه و ماشین‌آلات سنگین',
      'شغل': 'سرپرست مکانیک ماشین‌آلات معدنی',
      'كد شغل': 'SH-304',
      'پست': 'مسئول تعمیرگاه ماشین‌آلات سنگین',
      'كد پست': 'PS-304',
      'نوع استخدام': 'قراردادی',
      'حقوق پایه (ریال)': 210000000,
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sample);
  worksheet['!cols'] = Array.from({ length: 30 }, () => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_۲۸_ستونی_پرسنل');
  XLSX.writeFile(workbook, 'الگوی_اکسل_پرونده_۲۸_ستونی_پرسنل.xlsx');
}

/**
 * Generate sample Excel template for Karaneh import
 */
export function downloadKaranehTemplate(defaultUnit = '') {
  const unitName = defaultUnit || 'استخراج و معدن‌کاری';
  const sample = [
    {
      'کد پرسنلی': '10101',
      'نام و نام خانوادگی': 'رضا قاسمی',
      'واحد': unitName,
      'پست': 'رئیس شیفت استخراج',
      'مبلغ کارانه (ریال)': 55000000,
      'توضیحات': 'عملکرد مطلوب ماهانه'
    },
    {
      'کد پرسنلی': '10102',
      'نام و نام خانوادگی': 'زهرا کریمی',
      'واحد': unitName,
      'پست': 'کارشناس ارشد واحد',
      'مبلغ کارانه (ریال)': 48000000,
      'توضیحات': 'تحویل به موقع امور دوره'
    },
    {
      'کد پرسنلی': '10103',
      'نام و نام خانوادگی': 'امیرحسین مرادی',
      'واحد': unitName,
      'پست': 'سرپرست شیفت',
      'مبلغ کارانه (ریال)': 42000000,
      'توضیحات': 'پشتیبانی و بهره‌وری'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sample);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 24 },
    { wch: 24 },
    { wch: 22 },
    { wch: 25 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_کارانه');
  XLSX.writeFile(workbook, 'الگوی_اکسل_کارانه_پرسنل.xlsx');
}

/**
 * Export Commitments to Excel (without شماره سند / لاشه چک)
 */
export function exportCommitmentsToExcel(
  commitments: PersonnelCommitment[],
  fileName = 'لیست_تعهدات_و_تضامین_پرسنلی.xlsx'
) {
  const data = commitments.map((c, index) => {
    const prev = Number(c.previouslyTakenAmount || 0);
    const curr = Number(c.amount || 0);
    const maxAllowed = Number(c.maxAllowedAmount || 0);
    const remaining = maxAllowed > 0 ? Math.max(0, maxAllowed - prev - curr) : 0;
    return {
      'ردیف': index + 1,
      'کد پرسنلی': c.personnelCode,
      'نام پرسنل': c.personnelName,
      'نوع تعهد یا تضمین': c.commitmentType,
      'مبلغ تعهد فعلی (ریال)': curr,
      'مبلغ قبلاً دریافت شده (ریال)': prev,
      'سقف مجاز کل (ریال)': maxAllowed,
      'مانده قابل دریافت (ریال)': remaining,
      'تاریخ شروع': c.startDate,
      'تاریخ سررسید': c.endDate,
      'نام ضامن': c.guarantorName || '',
      'وضعیت': c.status,
      'وضعیت بایگانی': c.isArchived ? 'بایگانی شده' : 'جاری',
      'کد بایگانی': c.archiveCode || '',
      'توضیحات': c.notes || ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'تعهدات پرسنلی');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Sample Excel template for Commitments import (without شماره سند / لاشه چک)
 */
export function downloadCommitmentsTemplate() {
  const sample = [
    {
      'کد پرسنلی': '10101',
      'نام پرسنل': 'رضا قاسمی',
      'نوع تعهد یا تضمین': 'تعهد حسابداری',
      'مبلغ تعهد فعلی (ریال)': 300000000,
      'مبلغ قبلاً دریافت شده (ریال)': 200000000,
      'سقف مجاز کل (ریال)': 1000000000,
      'تاریخ شروع': '1403/08/01',
      'تاریخ سررسید': '1405/08/01',
      'نام ضامن': 'مهندس احمد باقری',
      'وضعیت': 'جاری و معتبر',
      'بایگانی': 'خیر',
      'توضیحات': 'تعهد حسابداری جهت مساعده و تنخواه'
    },
    {
      'کد پرسنلی': '10102',
      'نام پرسنل': 'زهرا کریمی',
      'نوع تعهد یا تضمین': 'سفته حسن انجام کار',
      'مبلغ تعهد فعلی (ریال)': 500000000,
      'مبلغ قبلاً دریافت شده (ریال)': 0,
      'سقف مجاز کل (ریال)': 1500000000,
      'تاریخ شروع': '1403/09/01',
      'تاریخ سررسید': '1406/09/01',
      'نام ضامن': 'دکتر علیرضا کریمی',
      'وضعیت': 'جاری و معتبر',
      'بایگانی': 'خیر',
      'توضیحات': 'تضمین حسن انجام وظایف مالی'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sample);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 10 },
    { wch: 30 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_تعهدات');
  XLSX.writeFile(workbook, 'الگوی_اکسل_تعهدات_و_تضامین.xlsx');
}

/**
 * Export 18-column Job Classifications table to Excel
 */
export function exportJobClassificationsToExcel(
  records: JobClassificationRecord[],
  fileName = 'جدول_طبقه_بندی_مشاغل_پرسنل.xlsx'
) {
  const data = records.map((r) => ({
    'کد پرسنلی': r.personnelCode,
    'نام': r.firstName,
    'نام خانوادگی': r.lastName,
    'محل خدمت': r.workLocation,
    'واحد': r.department,
    'کد ملی': r.nationalId,
    'مدرک تحصیلی': r.education,
    'تاریخ استخدام': r.hireDate,
    'ماه استخدام': r.hireMonth,
    'سابقه معدنی به روز': r.miningExperienceDays,
    'سابقه بیمه کلی': r.totalInsuranceHistory,
    'سابقه معدنی': r.miningExperience,
    'سابقه غیرمعدنی': r.nonMiningExperience,
    'گروه شغلی': r.jobGroup,
    'فاصله گروه از 1405 به بعد': r.groupGapFrom1405,
    'فاصله گروه بعدی': r.nextGroupGap,
    'شغل': r.jobTitle,
    'پست': r.position,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = Array.from({ length: 18 }, () => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'طبقه_بندی_مشاغل');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Sample Excel template for 18-column Job Classification
 */
export function downloadJobClassificationsTemplate() {
  const sample = [
    {
      'کد پرسنلی': '10101',
      'نام': 'رضا',
      'نام خانوادگی': 'قاسمی',
      'محل خدمت': 'ستاد مرکزی',
      'واحد': 'فناوری اطلاعات',
      'کد ملی': '0078912345',
      'مدرک تحصیلی': 'کارشناسی ارشد مهندسی نرم‌افزار',
      'تاریخ استخدام': '1397/02/10',
      'ماه استخدام': 'اردیبهشت',
      'سابقه معدنی به روز': '۲۵۵۰ روز',
      'سابقه بیمه کلی': '۱۰ سال و ۴ ماه',
      'سابقه معدنی': '۷ سال',
      'سابقه غیرمعدنی': '۳ سال و ۴ ماه',
      'گروه شغلی': 'گروه ۱۶',
      'فاصله گروه از 1405 به بعد': '۲ سال',
      'فاصله گروه بعدی': '۱ سال تا ارتقا',
      'شغل': 'مهندس ارشد سیستم‌ها',
      'پست': 'مدیر فناوری اطلاعات و سامانه‌ها',
    },
    {
      'کد پرسنلی': '10105',
      'نام': 'مهدی',
      'نام خانوادگی': 'نجفی',
      'محل خدمت': 'مجتمع معدنی شماره ۱',
      'واحد': 'تولید و عملیات',
      'کد ملی': '0389874561',
      'مدرک تحصیلی': 'کارشناسی مهندسی صنایع',
      'تاریخ استخدام': '1399/11/12',
      'ماه استخدام': 'بهمن',
      'سابقه معدنی به روز': '۱۸۲۰ روز',
      'سابقه بیمه کلی': '۸ سال',
      'سابقه معدنی': '۵ سال',
      'سابقه غیرمعدنی': '۳ سال',
      'گروه شغلی': 'گروه ۱۴',
      'فاصله گروه از 1405 به بعد': '۳ سال',
      'فاصله گروه بعدی': '۲ سال تا ارتقا',
      'شغل': 'مهندس بهره‌برداری معدن',
      'پست': 'سرپرست خط تولید و تضمین کیفیت',
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sample);
  worksheet['!cols'] = Array.from({ length: 18 }, () => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_طبقه_بندی_مشاغل');
  XLSX.writeFile(workbook, 'الگوی_اکسل_طبقه_بندی_مشاغل.xlsx');
}

/**
 * Export Users list to Excel (safe - excludes password hashes)
 */
export function exportUsersToExcel(
  users: User[],
  fileName = 'لیست_کاربران_و_دسترسی‌ها.xlsx'
) {
  const data = users.map((u, idx) => {
    const p = u.permissions;
    let presetLabel = 'سفارشی';
    if (u.username === 'javadabadiyan' || u.role === 'super_admin') presetLabel = 'مدیر کامل';
    else if (p?.users?.create && p?.system?.backupDatabase) presetLabel = 'مدیر کامل';
    else if (p?.ceoDashboard?.view && !p?.users?.create) presetLabel = 'مدیر عامل';
    else if (p?.personnel?.create && !p?.karaneh?.create) presetLabel = 'کارشناس کارگزینی';
    else if (p?.karaneh?.create && !p?.personnel?.create) presetLabel = 'کارشناس کارانه';
    else if (!p?.personnel?.create && !p?.karaneh?.create && !p?.users?.create) presetLabel = 'مشاهده‌گر';

    return {
      'ردیف': idx + 1,
      'نام کاربری': u.username,
      'نام و نام خانوادگی': u.fullName,
      'نقش سازمانی': u.role,
      'واحد اداری': u.department || '',
      'وضعیت حساب': u.isActive ? 'فعال' : 'غیرفعال',
      'الگوی دسترسی': presetLabel,
      'آخرین ورود': u.lastLogin || '',
      'تاریخ ایجاد': u.createdAt || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 26 },
    { wch: 28 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'کاربران');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Sample Excel template for Users batch import
 */
export function downloadUsersTemplate() {
  const sample = [
    {
      'نام کاربری': 's.ahmadi',
      'رمز عبور': 'Ahmadi@1403',
      'نام و نام خانوادگی': 'سعید احمدی',
      'نقش سازمانی': 'کارشناس کارگزینی و امور کارکنان',
      'واحد اداری': 'امور اداری و کارگزینی',
      'وضعیت حساب': 'فعال',
      'الگوی دسترسی': 'کارشناس کارگزینی',
    },
    {
      'نام کاربری': 'm.rezai',
      'رمز عبور': 'Rezai@1403',
      'نام و نام خانوادگی': 'مریم رضایی',
      'نقش سازمانی': 'حسابدار حقوق و دستمزد',
      'واحد اداری': 'امور مالی و حقوق',
      'وضعیت حساب': 'فعال',
      'الگوی دسترسی': 'کارشناس کارانه',
    },
    {
      'نام کاربری': 'n.moradi',
      'رمز عبور': 'Moradi@1403',
      'نام و نام خانوادگی': 'نگار مرادی',
      'نقش سازمانی': 'مشاهده‌گر و بازرس',
      'واحد اداری': 'بازرسی و نظارت',
      'وضعیت حساب': 'فعال',
      'الگوی دسترسی': 'مشاهده‌گر',
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sample);
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
    { wch: 28 },
    { wch: 24 },
    { wch: 14 },
    { wch: 22 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_تعریف_کاربران');
  XLSX.writeFile(workbook, 'الگوی_اکسل_تعریف_کاربران.xlsx');
}

/**
 * Export Payroll monthly comparison summary to Excel (metric-aware)
 */
export function exportPayrollComparisonToExcel(
  rows: PayrollComparisonRow[],
  currentPeriodLabel: string,
  previousPeriodLabel: string,
  metricBasis: PayrollAnalysisMetric = 'netPayable',
  fileName?: string
) {
  const metricLabel = metricBasis === 'totalBenefits' ? 'جمع مزایا' : 'خالص پرداختی';
  const data = rows.map((r, idx) => {
    const m = getRowMetricValues(r, metricBasis);
    return {
      'ردیف': idx + 1,
      'کد پرسنلی': r.personnelCode,
      'نام و نام خانوادگی': r.fullName,
      'کد ملی': r.nationalId || '',
      'محل خدمت': r.workLocation || '',
      'واحد سازمانی': r.department || '',
      'شغل': r.jobTitle || '',
      'پست': r.position || '',
      'کارکرد موثر ماه قبل': r.prevEffectiveDays,
      'کارکرد موثر ماه جدید': r.effectiveDays,
      'مزد شغل': r.jobWage,
      'جمع عوامل حکمی': r.totalOrderFactors,
      'جمع مزایا ماه جدید': r.totalBenefits,
      'جمع مزایا ماه قبل': r.previousBenefits ?? 0,
      'جمع کسور': r.totalDeductions,
      'مالیات': r.taxAmount,
      [`${metricLabel} ${previousPeriodLabel} (ماه قبل)`]: m.prev,
      [`${metricLabel} ${currentPeriodLabel} (ماه جدید)`]: m.curr,
      [`اختلاف ${metricLabel} (ریال)`]: m.diff,
      'درصد تغییر': `${m.diffPercent.toFixed(1)}%`,
      'وضعیت روند': m.trend === 'increase' ? 'افزایشی' : m.trend === 'decrease' ? 'کاهشی' : m.trend === 'new' ? 'جدید' : 'بدون تغییر',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = Array.from({ length: 21 }, () => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'تحلیل_مقایسه_حقوق');
  XLSX.writeFile(
    workbook,
    fileName || `تحلیل_مقایسه_${metricBasis === 'totalBenefits' ? 'مزایا' : 'خالص'}_${currentPeriodLabel}.xlsx`
  );
}

/**
 * Export Drilldown slice of Payroll comparison rows to Excel
 */
export function exportPayrollDrilldownToExcel(
  rows: PayrollComparisonRow[],
  sliceTitle: string,
  currentPeriodLabel: string,
  previousPeriodLabel: string,
  metricBasis: PayrollAnalysisMetric = 'netPayable'
) {
  const safeTitle = sliceTitle.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 45);
  exportPayrollComparisonToExcel(
    rows,
    currentPeriodLabel,
    previousPeriodLabel,
    metricBasis,
    `جزئیات_آنالیز_${safeTitle}_${currentPeriodLabel}.xlsx`
  );
}

/**
 * Export Full 226-Column Payroll Records for a Period (exact column sequence)
 */
export function exportFullPayrollToExcel(
  records: PayrollRecord[],
  periodLabel: string,
  fileName = `فایل_کامل_حقوق_${periodLabel}.xlsx`
) {
  const rows = records.map((rec) =>
    PAYROLL_EXCEL_COLUMNS.map((col) => {
      if (rec.rawFields && rec.rawFields[col] !== undefined) return rec.rawFields[col];
      const fallback = getPayrollField(rec.rawFields || {}, col);
      return fallback !== undefined ? fallback : '';
    })
  );
  const aoa = [PAYROLL_EXCEL_COLUMNS, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = PAYROLL_EXCEL_COLUMNS.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'حقوق_کامل');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Generate Sample Payroll Excel Template containing ALL 226 exact columns
 */
export function downloadPayrollTemplate() {
  const row1 = createSamplePayrollRow({
    'سال/ماه': '1403/08',
    'شناسه كارمند': 'EMP-101',
    'كد پرسنلي': '10101',
    'نام': 'رضا',
    'نام خانوادگي': 'قاسمی',
    'نام و نام خانوادگي': 'رضا قاسمی',
    'نام پدر': 'محمد',
    'شماره شناسنامه': '1245',
    'كد ملي': '0078912345',
    'مليت': 'ایرانی',
    'تابعيت': 'ایران',
    'جنسيت': 'مرد',
    'تلفن همراه': '09121114567',
    'پست الكترونيك': 'r.ghasemi@org.ir',
    'محل تولد': 'سیرجان',
    'محل صدور': 'سیرجان',
    'تاريخ تولد': '1365/04/12',
    'تاريخ صدور': '1365/04/20',
    'وضعيت تاهل': 'متاهل',
    'وضعيت نظام وظيفه': 'پایان خدمت',
    'مدرك تحصيلي': 'کارشناسی ارشد',
    'رشته تحصيلي': 'مهندسی نرم‌افزار',
    'تاريخ استخدام': '1397/02/10',
    'محل خدمت': 'ستاد مرکزی',
    'واحد سازماني': 'فناوری اطلاعات',
    'شغل': 'مهندس سیستم‌ها',
    'كد شغل': 'SH-101',
    'پست': 'مدیر فناوری اطلاعات',
    'كد پست': 'PS-101',
    'رتبه': '۱۶',
    'کد گروه شغلي': 'G16',
    'عنوان گروه شغلي': 'گروه ۱۶',
    'نوع استخدام': 'رسمی',
    'نوع حكم': 'اصلاح حقوق',
    'تعداد فرزند': 2,
    'شماره حكم': '1403/8821',
    'تاريخ اجرا حكم': '1403/01/01',
    'تاريخ صدور حكم': '1403/01/15',
    'كد وضعيت حكم': '1',
    'وضعيت حكم': 'فعال',
    'کد شغل بیمه': '251201',
    'تفصیل شخص': '10101',
    'کارکرد موثر': 30,
    'خالص پرداختی': 312500000,
    'جمع مزایا': 385000000,
    'اضافه کاری': 28000000,
    'جمعه کاری': 8500000,
    'ماموریت ریالی': 12000000,
    'پاداش': 15000000,
    'تشویقی': 5000000,
    'سایر مزایا': 4500000,
    'جمع کسور': 72500000,
    'مالیات': 29500000,
    'مالیات حقوق': 29500000,
    'حق اولاد': 14332000,
    'حق تاهل': 5000000,
    'مزد شغل': 195000000,
    'جمع عوامل حکمی': 312000000,
    'ساعت اضافه کاری(کارکرد)': 18,
    'ساعت جمعه کاری(کارکرد)': 6,
    'وام صندوق(مبلغ وام)': 500000000,
    'وام صندوق(پرداختي تا ماه)': 200000000,
    'وام صندوق(قسط در ماه سيستمي)': 20000000,
    'وام صندوق(مانده وام)': 300000000,
    'وام صندوق(تعداد قسط)': 25,
    'حقوق پایه(حكم-اصلي)': 195000000,
    'حق جذب(حكم-اصلي)': 45000000,
    'حق سرپرستی(حكم-اصلي)': 25000000,
    'حق مسکن(حكم-اصلي)': 9000000,
    'مزایای رفاهی و انگیزشی(حق بن)(حكم-اصلي)': 14000000,
    'جمع عوامل حكمي': 312000000,
    'مرکز هزینه(كد تفصيل)': 'CC-01',
    'مرکز هزینه(عنوان تفصيل)': 'فناوری و سیستم‌ها',
    'پروژه(كد تفصيل)': 'PRJ-01',
    'پروژه(عنوان تفصيل)': 'پروژه جامع اداری',
    'شعبه سازمان تامین اجتماعی': 'شعبه ۱ سیرجان',
    'نام بانک': 'بانک ملت',
    'شعبه': 'مرکزی سیرجان',
    'شماره حساب': '6104337811223344',
    'نام صندوق': 'صندوق کارکنان',
  });

  const row2 = createSamplePayrollRow({
    'سال/ماه': '1403/08',
    'شناسه كارمند': 'EMP-102',
    'كد پرسنلي': '10102',
    'نام': 'زهرا',
    'نام خانوادگي': 'کریمی',
    'نام و نام خانوادگي': 'زهرا کریمی',
    'نام پدر': 'علی',
    'شماره شناسنامه': '884',
    'كد ملي': '0065432109',
    'مليت': 'ایرانی',
    'تابعيت': 'ایران',
    'جنسيت': 'زن',
    'تلفن همراه': '09122225678',
    'محل خدمت': 'ستاد مرکزی',
    'واحد سازماني': 'امور مالی و اقتصادی',
    'شغل': 'رئیس حسابداری',
    'پست': 'رئیس حسابداری و بودجه',
    'نوع استخدام': 'رسمی',
    'کارکرد موثر': 30,
    'خالص پرداختی': 278400000,
    'جمع مزایا': 332000000,
    'اضافه کاری': 19500000,
    'جمع کسور': 53600000,
    'مالیات': 24100000,
    'مالیات حقوق': 24100000,
    'مزد شغل': 175000000,
    'جمع عوامل حکمی': 275000000,
    'حقوق پایه(حكم-اصلي)': 175000000,
    'حق سرپرستی(حكم-اصلي)': 20000000,
    'حق مسکن(حكم-اصلي)': 9000000,
    'مزایای رفاهی و انگیزشی(حق بن)(حكم-اصلي)': 14000000,
    'جمع عوامل حكمي': 275000000,
    'نام بانک': 'بانک تجارت',
    'شماره حساب': '5859831199887766',
  });

  const aoa = [
    PAYROLL_EXCEL_COLUMNS,
    PAYROLL_EXCEL_COLUMNS.map((c) => row1[c]),
    PAYROLL_EXCEL_COLUMNS.map((c) => row2[c]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = PAYROLL_EXCEL_COLUMNS.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الگوی_جامع_حقوق');
  XLSX.writeFile(workbook, 'الگوی_اکسل_جامع_حقوق.xlsx');
}

/**
 * Export multi-sheet comparative analytics for Role Tiers, Operators, Departments, Work Locations
 */
export function exportPayrollAnalyticsToExcel(
  roleStats: PayrollGroupStat[],
  deptStats: PayrollGroupStat[],
  workLocationStats: PayrollGroupStat[],
  operatorRows: PayrollComparisonRow[],
  currentPeriodLabel: string,
  previousPeriodLabel: string,
  metricBasis: PayrollAnalysisMetric = 'netPayable',
  fileName?: string
) {
  const metricLabel = metricBasis === 'totalBenefits' ? 'جمع مزایا' : 'خالص پرداختی';
  const mapStats = (stats: PayrollGroupStat[], titleCol: string) =>
    stats.map((s, idx) => ({
      'ردیف': idx + 1,
      [titleCol]: s.key,
      'تعداد ماه جدید': s.count,
      'تعداد دارای سابقه ماه قبل': s.prevMatchedCount,
      'تعداد افزایشی': s.increasedCount,
      'تعداد کاهشی': s.decreasedCount,
      'تعداد جدید': s.newCount,
      [`جمع ${metricLabel} ${previousPeriodLabel}`]: s.prevTotal,
      [`جمع ${metricLabel} ${currentPeriodLabel}`]: s.currTotal,
      'تغییر جمع (ریال)': s.diffTotal,
      'درصد رشد جمع': `${s.growthPercent}%`,
      [`میانگین ${previousPeriodLabel}`]: s.prevAvg,
      [`میانگین ${currentPeriodLabel}`]: s.currAvg,
      'درصد تغییر میانگین': `${s.avgGrowthPercent}%`,
      [`بیشترین ${metricLabel} ماه جدید`]: s.maxCurr,
      'پرسنل دارای بیشترین': s.maxPersonName,
      [`کمترین ${metricLabel} ماه جدید`]: s.minCurr,
      'پرسنل دارای کمترین': s.minPersonName,
    }));

  const wb = XLSX.utils.book_new();

  const roleSheet = XLSX.utils.json_to_sheet(mapStats(roleStats, 'رده سازمانی'));
  roleSheet['!cols'] = Array.from({ length: 18 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, roleSheet, 'تحلیل_رده_سازمانی');

  const opData = operatorRows.map((r, idx) => {
    const m = getRowMetricValues(r, metricBasis);
    return {
      'ردیف': idx + 1,
      'کد پرسنلی': r.personnelCode,
      'نام و نام خانوادگی': r.fullName,
      'پست / شغل': r.position || r.jobTitle || '',
      'واحد سازمانی': r.department || '',
      'محل خدمت': r.workLocation || '',
      [`${metricLabel} ${previousPeriodLabel}`]: m.prev,
      [`${metricLabel} ${currentPeriodLabel}`]: m.curr,
      'اختلاف (ریال)': m.diff,
      'درصد تغییر': `${m.diffPercent}%`,
      'روند': m.trend === 'increase' ? 'افزایشی' : m.trend === 'decrease' ? 'کاهشی' : m.trend === 'new' ? 'جدید' : 'بدون تغییر',
    };
  });
  const opSheet = XLSX.utils.json_to_sheet(opData);
  opSheet['!cols'] = Array.from({ length: 11 }, () => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, opSheet, 'تحلیل_اپراتورها');

  const deptSheet = XLSX.utils.json_to_sheet(mapStats(deptStats, 'واحد سازمانی'));
  deptSheet['!cols'] = Array.from({ length: 18 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, deptSheet, 'تحلیل_واحد_سازمانی');

  const locSheet = XLSX.utils.json_to_sheet(mapStats(workLocationStats, 'محل خدمت'));
  locSheet['!cols'] = Array.from({ length: 18 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, locSheet, 'تحلیل_محل_خدمت');

  XLSX.writeFile(
    wb,
    fileName || `آنالیز_تخصصی_${metricBasis === 'totalBenefits' ? 'مزایا' : 'حقوق'}_${currentPeriodLabel}.xlsx`
  );
}

/**
 * Export Smart Personnel Dashboard report (Job Groups distribution & Commitments status) to Excel
 */
export interface SmartPersonnelExcelInput {
  filterSummary: string;
  totalPersonnel: number;
  activePersonnel: number;
  docsCompletedCount: number;
  totalBaseSalary: number;
  totalCommitmentsAmount: number;
  jobGroupDistribution: {
    code: string;
    title: string;
    count: number;
    percent: number;
    avgSalary: number;
    totalSalary: number;
    maxKaranehCeiling: number;
  }[];
  commitmentStatusDistribution: {
    status: string;
    count: number;
    archivedCount: number;
    totalAmount: number;
    previouslyTaken: number;
    maxAllowed: number;
    percent: number;
  }[];
  commitmentTypeDistribution: {
    type: string;
    count: number;
    totalAmount: number;
  }[];
  departmentBreakdown: {
    department: string;
    count: number;
    activeCount: number;
    totalSalary: number;
    commitmentsCount: number;
  }[];
}

export function exportSmartPersonnelReportToExcel(
  payload: SmartPersonnelExcelInput,
  fileName = `گزارش_هوشمند_پرسنل_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.xlsx`
) {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { 'شاخص': 'محدوده فیلتر گزارش', 'مقدار': payload.filterSummary, 'توضیحات': 'وضعیت فیلتر انتخاب‌شده' },
    { 'شاخص': 'تعداد کل پرسنل فیلترشده', 'مقدار': payload.totalPersonnel, 'توضیحات': 'نفر' },
    { 'شاخص': 'پرسنل شاغل و فعال', 'مقدار': payload.activePersonnel, 'توضیحات': 'نفر' },
    { 'شاخص': 'پرونده‌های دارای مدارک هویتی اسکن‌شده', 'مقدار': payload.docsCompletedCount, 'توضیحات': 'کارت ملی / شناسنامه' },
    { 'شاخص': 'مجموع حقوق پایه پرسنل (ریال)', 'مقدار': payload.totalBaseSalary, 'توضیحات': 'جمع احکام پایه' },
    { 'شاخص': 'مجموع ارزش تعهدات و تضامین (ریال)', 'مقدار': payload.totalCommitmentsAmount, 'توضیحات': 'جمع کل اسناد' },
    { 'شاخص': 'تاریخ تهیه گزارش', 'مقدار': new Date().toLocaleDateString('fa-IR'), 'توضیحات': 'خروجی هوشمند سامانه' },
  ];
  const s1 = XLSX.utils.json_to_sheet(summaryRows);
  s1['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, s1, 'خلاصه_گزارش');

  const jgRows = payload.jobGroupDistribution.map((g, idx) => ({
    'ردیف': idx + 1,
    'کد گروه شغلی': g.code,
    'عنوان گروه شغلی': g.title,
    'تعداد پرسنل': g.count,
    'سهم درصدی (%)': `${g.percent.toFixed(1)}%`,
    'میانگین حقوق پایه (ریال)': g.avgSalary,
    'مجموع حقوق پایه (ریال)': g.totalSalary,
    'سقف کارانه گروه (ریال)': g.maxKaranehCeiling,
  }));
  const s2 = XLSX.utils.json_to_sheet(jgRows.length > 0 ? jgRows : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  s2['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, s2, 'توزیع_گروههای_شغلی');

  const csRows = payload.commitmentStatusDistribution.map((c, idx) => ({
    'ردیف': idx + 1,
    'وضعیت تعهد': c.status,
    'تعداد کل فقره': c.count,
    'تعداد بایگانی‌شده': c.archivedCount,
    'سهم درصدی (%)': `${c.percent.toFixed(1)}%`,
    'جمع مبلغ تعهد فعلی (ریال)': c.totalAmount,
    'جمع قبلاً دریافت‌شده (ریال)': c.previouslyTaken,
    'جمع سقف مجاز (ریال)': c.maxAllowed,
  }));
  const s3 = XLSX.utils.json_to_sheet(csRows.length > 0 ? csRows : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  s3['!cols'] = Array.from({ length: 8 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, s3, 'وضعیت_تعهدات');

  const ctRows = payload.commitmentTypeDistribution.map((t, idx) => ({
    'ردیف': idx + 1,
    'نوع تعهد یا تضمین': t.type,
    'تعداد فقره': t.count,
    'مجموع مبلغ (ریال)': t.totalAmount,
  }));
  const s4 = XLSX.utils.json_to_sheet(ctRows.length > 0 ? ctRows : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  s4['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, s4, 'تفکیک_نوع_تعهدات');

  const deptRows = payload.departmentBreakdown.map((d, idx) => ({
    'ردیف': idx + 1,
    'واحد سازمانی': d.department,
    'تعداد کل پرسنل': d.count,
    'پرسنل فعال': d.activeCount,
    'تعداد تعهدات': d.commitmentsCount,
    'مجموع حقوق پایه (ریال)': d.totalSalary,
  }));
  const s5 = XLSX.utils.json_to_sheet(deptRows.length > 0 ? deptRows : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  s5['!cols'] = [{ wch: 8 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, s5, 'تفکیک_واحدها');

  XLSX.writeFile(wb, fileName);
}

/**
 * Export Comprehensive Mining Company CEO Executive Report Workbook to Excel
 */
export interface CeoExecutiveExcelInput {
  reportTitle: string;
  companyName?: string;
  ceoDisplayName?: string;
  payrollPeriodLabel: string;
  karanehPeriodLabel: string;
  selectedSiteOrDept: string;
  kpis: { label: string; value: string | number; note: string }[];
  siteAndDeptCosts: {
    name: string;
    personnelCount: number;
    payrollRecordsCount: number;
    totalNetPayroll: number;
    totalBenefits: number;
    totalTax: number;
    overtimeCost: number;
    totalKaraneh: number;
    avgNetPayroll: number;
  }[];
  roleTierSummary: {
    tier: string;
    count: number;
    totalNet: number;
    avgNet: number;
    maxNet: number;
    minNet: number;
  }[];
  jobGroupDistribution: {
    label: string;
    count: number;
    avgSalary: number;
    totalSalary: number;
  }[];
  commitmentsRiskRows: {
    personnelCode: string;
    personnelName: string;
    commitmentType: string;
    status: string;
    amount: number;
    previouslyTaken: number;
    maxAllowed: number;
    utilizationPercent: number;
    endDate: string;
    riskNote: string;
  }[];
  miningClassificationRows: {
    personnelCode: string;
    fullName: string;
    workLocation: string;
    department: string;
    jobTitle: string;
    position: string;
    jobGroup: string;
    miningExperienceDays: string;
    miningExperience: string;
    nonMiningExperience: string;
    groupGapFrom1405: string;
    nextGroupGap: string;
  }[];
  miningUnitsBreakdown?: {
    unitName: string;
    category: string;
    personnelCount: number;
    activeCount: number;
    relativesCount: number;
    payrollCount: number;
    totalNetPayroll: number;
    totalBenefits: number;
    overtimeCost: number;
    totalKaraneh: number;
    avgNetPayroll: number;
    commitmentsCount: number;
    commitmentsAmount: number;
    classificationsCount: number;
  }[];
  volumeRecords?: {
    period: string;
    unitName: string;
    activityType: string;
    metricTitle: string;
    volumeValue: number;
    targetVolume: number;
    unitLabel: string;
    status?: string;
    notes?: string;
  }[];
  machineryRecords?: {
    machineCode: string;
    machineName: string;
    machineType: string;
    unitName: string;
    status: string;
    issueDescription?: string;
    stoppedSince?: string;
    estimatedReadyDate?: string;
    operatorName?: string;
    notes?: string;
  }[];
  unitReports?: {
    period: string;
    unitName: string;
    reportCategory: string;
    metricName: string;
    actualValue: number;
    previousValue?: number;
    targetValue?: number;
    unitLabel: string;
    status?: string;
    submittedBy?: string;
    notes?: string;
  }[];
}

export function exportCeoExecutiveReportToExcel(
  payload: CeoExecutiveExcelInput,
  fileName = `گزارش_جامع_مدیرعامل_نگین_پرتو_نصر_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.xlsx`
) {
  const wb = XLSX.utils.book_new();
  const companyTitle = payload.companyName || 'شرکت نگین پرتو نصر';

  const kpiSheetData = [
    { 'شاخص کلیدی مدیریت عامل': 'نام شرکت', 'مقدار': companyTitle, 'توضیح': 'گزارش رسمی راهبردی' },
    { 'شاخص کلیدی مدیریت عامل': 'مخاطب گزارش', 'مقدار': payload.ceoDisplayName || 'جناب آقای مهندس مدیرعامل محترم', 'توضیح': 'تعریف‌شده در مدیریت کاربران' },
    { 'شاخص کلیدی مدیریت عامل': 'عنوان گزارش', 'مقدار': payload.reportTitle, 'توضیح': `فیلتر: ${payload.selectedSiteOrDept}` },
    { 'شاخص کلیدی مدیریت عامل': 'دوره حقوقی مبنا', 'مقدار': payload.payrollPeriodLabel || 'ثبت نشده', 'توضیح': 'آخرین دوره انتخاب‌شده' },
    { 'شاخص کلیدی مدیریت عامل': 'دوره کارانه مبنا', 'مقدار': payload.karanehPeriodLabel || 'ثبت نشده', 'توضیح': 'آخرین دوره انتخاب‌شده' },
    ...payload.kpis.map((k) => ({
      'شاخص کلیدی مدیریت عامل': k.label,
      'مقدار': k.value,
      'توضیح': k.note,
    })),
  ];
  const s1 = XLSX.utils.json_to_sheet(kpiSheetData);
  s1['!cols'] = [{ wch: 36 }, { wch: 32 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, s1, 'خلاصه_اجرایی_مدیرعامل');

  if (payload.volumeRecords) {
    const volData = payload.volumeRecords.map((v, idx) => {
      const pct = v.targetVolume > 0 ? ((v.volumeValue / v.targetVolume) * 100).toFixed(1) + '%' : '-';
      return {
        'ردیف': idx + 1,
        'دوره (سال-ماه)': v.period,
        'واحد عملیاتی': v.unitName,
        'نوع عملیات': v.activityType,
        'عنوان شاخص': v.metricTitle,
        'حجم محقق‌شده': v.volumeValue,
        'برنامه / هدف ماه': v.targetVolume,
        'واحد سنجش': v.unitLabel,
        'درصد تحقق': pct,
        'وضعیت': v.status || '-',
        'توضیحات': v.notes || '',
      };
    });
    const sv = XLSX.utils.json_to_sheet(volData.length > 0 ? volData : [{ 'پیام': 'آمار حجم عملیاتی ثبت نشده است' }]);
    sv['!cols'] = Array.from({ length: 11 }, () => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, sv, 'پایش_حجم_عملیات');
  }

  if (payload.machineryRecords) {
    const macData = payload.machineryRecords.map((m, idx) => ({
      'ردیف': idx + 1,
      'کد دستگاه': m.machineCode,
      'نام و مدل دستگاه': m.machineName,
      'نوع تجهیز': m.machineType,
      'واحد بهره‌بردار': m.unitName,
      'وضعیت فعلی': m.status,
      'شرح خرابی / سرویس': m.issueDescription || '-',
      'تاریخ توقف / ورود': m.stoppedSince || '-',
      'تخمین آماده‌به‌کار': m.estimatedReadyDate || '-',
      'اپراتور / مسئول': m.operatorName || '-',
      'توضیحات': m.notes || '',
    }));
    const sm = XLSX.utils.json_to_sheet(macData.length > 0 ? macData : [{ 'پیام': 'لیست ماشین‌آلات و تعمیرگاه ثبت نشده است' }]);
    sm['!cols'] = Array.from({ length: 11 }, () => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, sm, 'ماشین_آلات_تعمیرگاه');
  }

  if (payload.unitReports) {
    const urData = payload.unitReports.map((r, idx) => {
      const pct = r.targetValue && r.targetValue > 0 ? ((r.actualValue / r.targetValue) * 100).toFixed(1) + '%' : '-';
      return {
        'ردیف': idx + 1,
        'دوره (سال-ماه)': r.period,
        'نام واحد عملیاتی': r.unitName,
        'دسته‌بندی گزارش': r.reportCategory || '-',
        'عنوان شاخص / موضوع': r.metricName,
        'مقدار محقق‌شده ماه': r.actualValue,
        'مقدار ماه قبل': r.previousValue ?? 0,
        'هدف / برنامه ماه': r.targetValue ?? 0,
        'واحد سنجش': r.unitLabel || '-',
        'درصد تحقق': pct,
        'وضعیت': r.status || '-',
        'ثبت‌کننده / سرپرست': r.submittedBy || '-',
        'توضیحات': r.notes || '',
      };
    });
    const sur = XLSX.utils.json_to_sheet(urData.length > 0 ? urData : [{ 'پیام': 'گزارش عملیاتی واحدها ثبت نشده است' }]);
    sur['!cols'] = Array.from({ length: 13 }, () => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, sur, 'گزارش_عملیاتی_واحدها');
  }

  if (payload.miningUnitsBreakdown && payload.miningUnitsBreakdown.length > 0) {
    const unitData = payload.miningUnitsBreakdown.map((u, idx) => ({
      'ردیف': idx + 1,
      'نام واحد عملیاتی / پشتیبانی معدن': u.unitName,
      'حوزه عملکرد': u.category,
      'تعداد پرسنل کارگزینی': u.personnelCount,
      'پرسنل شاغل': u.activeCount,
      'تعداد بستگان ثبت‌شده': u.relativesCount,
      'فیش حقوق دوره': u.payrollCount,
      'جمع خالص حقوق (ریال)': u.totalNetPayroll,
      'جمع مزایا (ریال)': u.totalBenefits,
      'جمع اضافه‌کاری (ریال)': u.overtimeCost,
      'جمع کارانه دوره (ریال)': u.totalKaraneh,
      'میانگین دریافتی (ریال)': u.avgNetPayroll,
      'تعداد تعهدات': u.commitmentsCount,
      'ارزش تعهدات (ریال)': u.commitmentsAmount,
      'رکورد طبقه‌بندی مشاغل': u.classificationsCount,
    }));
    const su = XLSX.utils.json_to_sheet(unitData);
    su['!cols'] = Array.from({ length: 15 }, () => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, su, 'پایش_واحدهای_معدن');
  }

  const siteData = payload.siteAndDeptCosts.map((s, idx) => ({
    'ردیف': idx + 1,
    'محل خدمت / واحد سازمانی': s.name,
    'تعداد پرسنل کارگزینی': s.personnelCount,
    'تعداد فیش حقوقی': s.payrollRecordsCount,
    'مجموع خالص پرداختی حقوق (ریال)': s.totalNetPayroll,
    'مجموع مزایا (ریال)': s.totalBenefits,
    'مجموع اضافه‌کار (ریال)': s.overtimeCost,
    'مجموع مالیات (ریال)': s.totalTax,
    'مجموع کارانه دوره (ریال)': s.totalKaraneh,
    'میانگین خالص دریافتی (ریال)': s.avgNetPayroll,
  }));
  const s2 = XLSX.utils.json_to_sheet(siteData.length > 0 ? siteData : [{ 'پیام': 'داده‌ای موجود نیست' }]);
  s2['!cols'] = Array.from({ length: 10 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, s2, 'هزینه_مراکز_و_معدن');

  const tierData = payload.roleTierSummary.map((r, idx) => ({
    'ردیف': idx + 1,
    'رده سازمانی': r.tier,
    'تعداد نفرات': r.count,
    'جمع خالص حقوق (ریال)': r.totalNet,
    'میانگین خالص (ریال)': r.avgNet,
    'بیشترین دریافتی (ریال)': r.maxNet,
    'کمترین دریافتی (ریال)': r.minNet,
  }));
  const s3 = XLSX.utils.json_to_sheet(tierData.length > 0 ? tierData : [{ 'پیام': 'داده‌ای موجود نیست' }]);
  s3['!cols'] = Array.from({ length: 7 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, s3, 'تحلیل_رده‌های_شغلی');

  const jgData = payload.jobGroupDistribution.map((g, idx) => ({
    'ردیف': idx + 1,
    'گروه شغلی': g.label,
    'تعداد پرسنل': g.count,
    'میانگین حقوق پایه (ریال)': g.avgSalary,
    'مجموع حقوق پایه (ریال)': g.totalSalary,
  }));
  const s4 = XLSX.utils.json_to_sheet(jgData.length > 0 ? jgData : [{ 'پیام': 'داده‌ای موجود نیست' }]);
  s4['!cols'] = Array.from({ length: 5 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, s4, 'گروه‌های_شغلی');

  const riskData = payload.commitmentsRiskRows.map((c, idx) => ({
    'ردیف': idx + 1,
    'کد پرسنلی': c.personnelCode,
    'نام پرسنل': c.personnelName,
    'نوع تعهد/تضمین': c.commitmentType,
    'وضعیت': c.status,
    'مبلغ تعهد فعلی (ریال)': c.amount,
    'قبلاً دریافت شده (ریال)': c.previouslyTaken,
    'سقف مجاز (ریال)': c.maxAllowed,
    'نرخ مصرف سقف (%)': `${c.utilizationPercent.toFixed(1)}%`,
    'تاریخ سررسید': c.endDate,
    'وضعیت ریسک / هشدار': c.riskNote,
  }));
  const s5 = XLSX.utils.json_to_sheet(riskData.length > 0 ? riskData : [{ 'پیام': 'موردی یافت نشد' }]);
  s5['!cols'] = Array.from({ length: 11 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, s5, 'ریسک_تعهدات_و_تضامین');

  const mcData = payload.miningClassificationRows.map((m, idx) => ({
    'ردیف': idx + 1,
    'کد پرسنلی': m.personnelCode,
    'نام و نام خانوادگی': m.fullName,
    'محل خدمت': m.workLocation,
    'واحد': m.department,
    'شغل': m.jobTitle,
    'پست': m.position,
    'گروه شغلی': m.jobGroup,
    'سابقه معدنی به روز': m.miningExperienceDays,
    'سابقه معدنی': m.miningExperience,
    'سابقه غیرمعدنی': m.nonMiningExperience,
    'فاصله گروه از 1405 به بعد': m.groupGapFrom1405,
    'فاصله گروه بعدی': m.nextGroupGap,
  }));
  const s6 = XLSX.utils.json_to_sheet(mcData.length > 0 ? mcData : [{ 'پیام': 'ردیفی ثبت نشده است' }]);
  s6['!cols'] = Array.from({ length: 13 }, () => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, s6, 'طبقه‌بندی_مشاغل_معدنی');

  XLSX.writeFile(wb, fileName);
}

/**
 * Download Sample Excel Template for Mining Monthly Volumes (آمار حجم عملیات ماهانه معدن)
 */
export function downloadCeoVolumesTemplate() {
  const sampleData = [
    {
      'دوره (سال-ماه)': '1403-08',
      'واحد عملیاتی معدن': 'استخراج و معدن‌کاری',
      'نوع عملیات / فعالیت': 'استخراج ماده معدنی',
      'عنوان شاخص حجم': 'حجم کل استخراج سینه کار اصلی',
      'حجم محقق‌شده ماه': 48500,
      'برنامه / هدف ماه': 50000,
      'واحد اندازه‌گیری': 'تن',
      'وضعیت تحقق': 'نزدیک به هدف',
      'توضیحات': 'عملکرد مطلوب شیفت‌های روز و شب',
    },
    {
      'دوره (سال-ماه)': '1403-08',
      'واحد عملیاتی معدن': 'تراش و باطله‌برداری',
      'نوع عملیات / فعالیت': 'باطله‌برداری',
      'عنوان شاخص حجم': 'جابجایی باطله پله‌های شمالی',
      'حجم محقق‌شده ماه': 62000,
      'برنامه / هدف ماه': 60000,
      'واحد اندازه‌گیری': 'مترمکعب',
      'وضعیت تحقق': 'فراتر از برنامه',
      'توضیحات': 'افزایش راندمان حمل',
    },
    {
      'دوره (سال-ماه)': '1403-07',
      'واحد عملیاتی معدن': 'استخراج و معدن‌کاری',
      'نوع عملیات / فعالیت': 'استخراج ماده معدنی',
      'عنوان شاخص حجم': 'حجم کل استخراج سینه کار اصلی',
      'حجم محقق‌شده ماه': 44200,
      'برنامه / هدف ماه': 48000,
      'واحد اندازه‌گیری': 'تن',
      'وضعیت تحقق': 'در حال اجرا',
      'توضیحات': 'آمار دوره قبل جهت مقایسه ماهانه',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws['!cols'] = Array.from({ length: 9 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'نمونه_ورود_حجم_عملیات');
  XLSX.writeFile(wb, 'نمونه_فایل_آمار_حجم_عملیات_معدن.xlsx');
}

export function exportCeoVolumesToExcel(records: any[], fileName = `آمار_حجم_عملیات_معدن_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.xlsx`) {
  const data = records.map((r, idx) => ({
    'ردیف': idx + 1,
    'دوره (سال-ماه)': r.period,
    'واحد عملیاتی معدن': r.unitName,
    'نوع عملیات / فعالیت': r.activityType,
    'عنوان شاخص حجم': r.metricTitle,
    'حجم محقق‌شده ماه': r.volumeValue,
    'برنامه / هدف ماه': r.targetVolume,
    'واحد اندازه‌گیری': r.unitLabel,
    'درصد تحقق': r.targetVolume > 0 ? `${((r.volumeValue / r.targetVolume) * 100).toFixed(1)}%` : '-',
    'وضعیت تحقق': r.status || '-',
    'توضیحات': r.notes || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  ws['!cols'] = Array.from({ length: 11 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'حجم_عملیات_ماهانه');
  XLSX.writeFile(wb, fileName);
}

/**
 * Download Sample Excel Template for Mining Machinery & Workshop Status
 */
export function downloadCeoMachineryTemplate() {
  const sampleData = [
    {
      'کد دستگاه / پلاک': 'EQ-DT-101',
      'نام و مدل دستگاه': 'دامپتراک بلاز ۴۵ تن شماره ۱',
      'نوع ماشین‌آلات': 'دامپتراک',
      'واحد مستقر / بهره‌بردار': 'حمل و نقل و بارگیری',
      'وضعیت دستگاه': 'آماده به کار',
      'شرح خرابی / وضعیت تعمیر': 'سالم و فعال در شیفت کاری',
      'تاریخ توقف / ورود به تعمیرگاه': '-',
      'تاریخ تخمینی آماده‌به‌کار': '-',
      'اپراتور / مسئول تعمیر': 'حسین محمدی',
      'یادداشت': 'بازبینی دوره‌ای انجام شده',
    },
    {
      'کد دستگاه / پلاک': 'EQ-EX-204',
      'نام و مدل دستگاه': 'بیل مکانیکی کوماتسو PC400',
      'نوع ماشین‌آلات': 'بیل مکانیکی',
      'واحد مستقر / بهره‌بردار': 'استخراج و معدن‌کاری',
      'وضعیت دستگاه': 'خراب / در تعمیرگاه',
      'شرح خرابی / وضعیت تعمیر': 'نشتی جک بوم اصلی و تعویض پکینگ هیدرولیک',
      'تاریخ توقف / ورود به تعمیرگاه': '1403/08/21',
      'تاریخ تخمینی آماده‌به‌کار': '1403/08/27',
      'اپراتور / مسئول تعمیر': 'واحد تعمیرگاه مرکزی',
      'یادداشت': 'قطعات از انبار مرکزی تحویل شد',
    },
    {
      'کد دستگاه / پلاک': 'EQ-LD-302',
      'نام و مدل دستگاه': 'لودر کاترپیلار 966H',
      'نوع ماشین‌آلات': 'لودر',
      'واحد مستقر / بهره‌بردار': 'فرآوری و سنگ‌شکن',
      'وضعیت دستگاه': 'در انتظار قطعه',
      'شرح خرابی / وضعیت تعمیر': 'نیاز به تعویض کیت گیربکس و مبدل گشتاور',
      'تاریخ توقف / ورود به تعمیرگاه': '1403/08/18',
      'تاریخ تخمینی آماده‌به‌کار': '1403/08/30',
      'اپراتور / مسئول تعمیر': 'سرپرست تعمیرات سنگین',
      'یادداشت': 'در انتظار خرید فوری قطعه',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws['!cols'] = Array.from({ length: 10 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'نمونه_ورود_ماشین_آلات');
  XLSX.writeFile(wb, 'نمونه_فایل_ماشین_آلات_و_تعمیرگاه.xlsx');
}

export function exportCeoMachineryToExcel(records: any[], fileName = `وضعیت_ماشین_آلات_تعمیرگاه_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.xlsx`) {
  const data = records.map((m, idx) => ({
    'ردیف': idx + 1,
    'کد دستگاه / پلاک': m.machineCode,
    'نام و مدل دستگاه': m.machineName,
    'نوع ماشین‌آلات': m.machineType,
    'واحد مستقر / بهره‌بردار': m.unitName,
    'وضعیت دستگاه': m.status,
    'شرح خرابی / وضعیت تعمیر': m.issueDescription || '-',
    'تاریخ توقف / ورود به تعمیرگاه': m.stoppedSince || '-',
    'تاریخ تخمینی آماده‌به‌کار': m.estimatedReadyDate || '-',
    'اپراتور / مسئول تعمیر': m.operatorName || '-',
    'یادداشت': m.notes || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  ws['!cols'] = Array.from({ length: 11 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'ماشین_آلات_تعمیرگاه');
  XLSX.writeFile(wb, fileName);
}

/**
 * Download Sample Excel Template for Per-Unit Operational Reports (بارگذاری اکسل واحدهای عملیاتی)
 */
export function downloadUnitReportsTemplate(defaultUnitName = 'کارخانه فرآوری و سنگ‌شکن') {
  const sampleData = [
    {
      'دوره (سال-ماه)': '1403-08',
      'نام واحد عملیاتی': defaultUnitName,
      'دسته‌بندی / نوع گزارش': 'عملکرد تولید و عملیات',
      'عنوان شاخص / موضوع فعالیت': 'تناژ خوراک ورودی خط تولید',
      'مقدار محقق‌شده ماه': 45100,
      'مقدار ماه قبل': 39500,
      'هدف / برنامه ماه': 44000,
      'واحد سنجش (یکا)': 'تن',
      'وضعیت / ارزیابی': 'فراتر از برنامه',
      'ثبت‌کننده / سرپرست واحد': 'سرپرست شیفت واحد',
      'توضیحات': 'پایداری خط در هر سه شیفت کاری',
    },
    {
      'دوره (سال-ماه)': '1403-08',
      'نام واحد عملیاتی': defaultUnitName,
      'دسته‌بندی / نوع گزارش': 'ایمنی و بهره‌وری',
      'عنوان شاخص / موضوع فعالیت': 'ساعات کارکرد مفید تجهیزات',
      'مقدار محقق‌شده ماه': 610,
      'مقدار ماه قبل': 580,
      'هدف / برنامه ماه': 620,
      'واحد سنجش (یکا)': 'ساعت',
      'وضعیت / ارزیابی': 'نزدیک به هدف',
      'ثبت‌کننده / سرپرست واحد': 'سرپرست شیفت واحد',
      'توضیحات': 'سرویس پیشگیرانه در موعد مقرر انجام شد',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws['!cols'] = Array.from({ length: 11 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'نمونه_گزارش_واحد');
  XLSX.writeFile(wb, 'نمونه_فایل_اکسل_واحدهای_عملیاتی.xlsx');
}

export function exportUnitReportsToExcel(
  records: any[],
  fileName = `گزارش_عملیاتی_واحدها_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.xlsx`
) {
  const data = records.map((r, idx) => ({
    'ردیف': idx + 1,
    'دوره (سال-ماه)': r.period,
    'نام واحد عملیاتی': r.unitName,
    'دسته‌بندی / نوع گزارش': r.reportCategory || '-',
    'عنوان شاخص / موضوع فعالیت': r.metricName,
    'مقدار محقق‌شده ماه': r.actualValue,
    'مقدار ماه قبل': r.previousValue ?? 0,
    'هدف / برنامه ماه': r.targetValue ?? 0,
    'واحد سنجش (یکا)': r.unitLabel || '-',
    'درصد تحقق': r.targetValue > 0 ? `${((r.actualValue / r.targetValue) * 100).toFixed(1)}%` : '-',
    'وضعیت / ارزیابی': r.status || '-',
    'ثبت‌کننده / سرپرست واحد': r.submittedBy || '-',
    'توضیحات': r.notes || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'پیام': 'داده‌ای یافت نشد' }]);
  ws['!cols'] = Array.from({ length: 13 }, () => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'گزارش_عملیاتی_واحدها');
  XLSX.writeFile(wb, fileName);
}

/**
 * Parse uploaded Excel file to JSON
 */
export async function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
