import { PayrollComparisonRow, PayrollAnalysisMetric } from '../types';
import { formatRial, formatPercent, toPersianDigits } from './persian';
import {
  normalizeFaHeader,
  getPayrollField,
  parsePayrollNumber,
  PAYROLL_MAIN_ORDER_FIELDS,
  PAYROLL_SUB_ORDER_FIELDS,
  PAYROLL_LOAN_GROUPS,
  PAYROLL_LOAN_SUBFIELDS,
} from './payrollColumns';

export type RoleTierName = 'مدیر' | 'رئیس' | 'مسئول' | 'کارشناس' | 'اپراتور' | 'سایر رده‌ها';

export const ROLE_TIER_ORDER: RoleTierName[] = [
  'مدیر',
  'رئیس',
  'مسئول',
  'کارشناس',
  'اپراتور',
  'سایر رده‌ها',
];

/**
 * دسته‌بندی رده سازمانی بر اساس پست و عنوان شغلی (با یکسان‌سازی حروف عربی و فارسی)
 */
export function classifyPayrollRoleTier(position?: string, jobTitle?: string): RoleTierName {
  const combined = normalizeFaHeader(`${position || ''} ${jobTitle || ''}`)
    .replace(/آ/g, 'ا')
    .replace(/ئ/g, 'ی')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');

  if (/مدیر|مدیریت|معاون|قائم مقام/.test(combined)) return 'مدیر';
  if (/رئیس|رییس|ریاست|سرپرست/.test(combined)) return 'رئیس';
  if (/مسئول|مسیول|مسوول|مسؤول/.test(combined)) return 'مسئول';
  if (/کارشناس/.test(combined)) return 'کارشناس';
  if (/اپراتور|متصدی دستگاه/.test(combined)) return 'اپراتور';
  return 'سایر رده‌ها';
}

export function getRowMetricValues(
  row: PayrollComparisonRow,
  metricBasis: PayrollAnalysisMetric = 'netPayable'
): {
  curr: number;
  prev: number;
  diff: number;
  diffPercent: number;
  trend: 'increase' | 'decrease' | 'unchanged' | 'new';
} {
  if (metricBasis === 'totalBenefits') {
    const curr = row.totalBenefits ?? 0;
    const prev = row.previousBenefits ?? 0;
    const diff = row.diffBenefits ?? (curr - prev);
    const diffPercent =
      row.diffBenefitsPercent ??
      (prev > 0 ? Number(((diff / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0);
    const trend =
      row.benefitsTrend ??
      (!row.previousRecord ? 'new' : diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'unchanged');
    return { curr, prev, diff, diffPercent, trend };
  }
  return {
    curr: row.currentNet,
    prev: row.previousNet,
    diff: row.diffNet,
    diffPercent: row.diffPercent,
    trend: row.trend,
  };
}

export interface PayrollGroupStat {
  key: string;
  count: number;
  prevMatchedCount: number;
  increasedCount: number;
  decreasedCount: number;
  newCount: number;
  unchangedCount: number;
  currTotal: number;
  prevTotal: number;
  diffTotal: number;
  growthPercent: number;
  currAvg: number;
  prevAvg: number;
  avgDiff: number;
  avgGrowthPercent: number;
  maxCurr: number;
  maxPersonName: string;
  maxPersonCode: string;
  minCurr: number;
  minPersonName: string;
  minPersonCode: string;
  maxPrev: number;
  minPrev: number;
}

export function computeGroupAnalytics(
  rows: PayrollComparisonRow[],
  getGroupKey: (row: PayrollComparisonRow) => string,
  metricBasis: PayrollAnalysisMetric = 'netPayable',
  preferredOrder?: string[],
  includeEmptyKeys?: string[]
): PayrollGroupStat[] {
  const buckets = new Map<string, PayrollComparisonRow[]>();

  if (includeEmptyKeys) {
    includeEmptyKeys.forEach((k) => buckets.set(k, []));
  }

  rows.forEach((r) => {
    const k = (getGroupKey(r) || '').trim() || 'تعیین نشده';
    const arr = buckets.get(k) || [];
    arr.push(r);
    buckets.set(k, arr);
  });

  const stats: PayrollGroupStat[] = Array.from(buckets.entries()).map(([key, items]) => {
    const count = items.length;
    const prevMatched = items.filter((r) => Boolean(r.previousRecord));
    const prevMatchedCount = prevMatched.length;

    let increasedCount = 0;
    let decreasedCount = 0;
    let newCount = 0;
    let unchangedCount = 0;

    let currTotal = 0;
    let prevTotal = 0;

    items.forEach((r) => {
      const m = getRowMetricValues(r, metricBasis);
      currTotal += m.curr;
      prevTotal += m.prev;
      if (m.trend === 'increase') increasedCount++;
      else if (m.trend === 'decrease') decreasedCount++;
      else if (m.trend === 'new') newCount++;
      else unchangedCount++;
    });

    const diffTotal = currTotal - prevTotal;
    const growthPercent =
      prevTotal > 0 ? Number(((diffTotal / prevTotal) * 100).toFixed(1)) : currTotal > 0 ? 100 : 0;

    const currAvg = count > 0 ? Math.round(currTotal / count) : 0;
    const prevAvg = prevMatchedCount > 0 ? Math.round(prevTotal / prevMatchedCount) : 0;
    const avgDiff = currAvg - prevAvg;
    const avgGrowthPercent =
      prevAvg > 0 ? Number(((avgDiff / prevAvg) * 100).toFixed(1)) : currAvg > 0 ? 100 : 0;

    let maxCurr = 0;
    let maxPersonName = '—';
    let maxPersonCode = '';
    let minCurr = 0;
    let minPersonName = '—';
    let minPersonCode = '';

    if (items.length > 0) {
      const sortedCurr = [...items].sort(
        (a, b) => getRowMetricValues(b, metricBasis).curr - getRowMetricValues(a, metricBasis).curr
      );
      const top = sortedCurr[0];
      maxCurr = getRowMetricValues(top, metricBasis).curr;
      maxPersonName = top.fullName;
      maxPersonCode = top.personnelCode;

      const positiveItems = sortedCurr.filter((x) => getRowMetricValues(x, metricBasis).curr > 0);
      const bottom = positiveItems.length > 0 ? positiveItems[positiveItems.length - 1] : sortedCurr[sortedCurr.length - 1];
      minCurr = getRowMetricValues(bottom, metricBasis).curr;
      minPersonName = bottom.fullName;
      minPersonCode = bottom.personnelCode;
    }

    const prevVals = prevMatched.map((x) => getRowMetricValues(x, metricBasis).prev).filter((n) => n > 0);
    const maxPrev = prevVals.length > 0 ? Math.max(...prevVals) : 0;
    const minPrev = prevVals.length > 0 ? Math.min(...prevVals) : 0;

    return {
      key,
      count,
      prevMatchedCount,
      increasedCount,
      decreasedCount,
      newCount,
      unchangedCount,
      currTotal,
      prevTotal,
      diffTotal,
      growthPercent,
      currAvg,
      prevAvg,
      avgDiff,
      avgGrowthPercent,
      maxCurr,
      maxPersonName,
      maxPersonCode,
      minCurr,
      minPersonName,
      minPersonCode,
      maxPrev,
      minPrev,
    };
  });

  if (preferredOrder && preferredOrder.length > 0) {
    return stats.sort((a, b) => {
      const ia = preferredOrder.indexOf(a.key);
      const ib = preferredOrder.indexOf(b.key);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b.currTotal - a.currTotal;
    });
  }

  return stats.sort((a, b) => b.currTotal - a.currTotal);
}

/**
 * ساخت سند HTML استاندارد A4 برای چاپ فیش مقایسه‌ای حقوق بدون وابستگی به اسکرول مودال
 */
export function buildPayrollComparisonHtml(
  row: PayrollComparisonRow,
  currentPeriodLabel: string,
  previousPeriodLabel: string
): string {
  const keyItems = [
    { label: 'کارکرد موثر (روز)', key: 'کارکرد موثر', isCurrency: false },
    { label: 'ساعت اضافه کاری (کارکرد)', key: 'ساعت اضافه کاری(کارکرد)', isCurrency: false },
    { label: 'ساعت جمعه کاری (کارکرد)', key: 'ساعت جمعه کاری(کارکرد)', isCurrency: false },
    { label: 'حقوق پایه (حکم اصلی)', key: 'حقوق پایه(حكم-اصلي)', isCurrency: true },
    { label: 'مزد شغل', key: 'مزد شغل', isCurrency: true },
    { label: 'جمع عوامل حکمی', key: 'جمع عوامل حکمی', isCurrency: true },
    { label: 'اضافه کاری (ریال)', key: 'اضافه کاری', isCurrency: true },
    { label: 'جمعه کاری (ریال)', key: 'جمعه کاری', isCurrency: true },
    { label: 'ماموریت ریالی', key: 'ماموریت ریالی', isCurrency: true },
    { label: 'پاداش', key: 'پاداش', isCurrency: true },
    { label: 'تشویقی', key: 'تشویقی', isCurrency: true },
    { label: 'حق اولاد', key: 'حق اولاد', isCurrency: true },
    { label: 'حق تاهل', key: 'حق تاهل', isCurrency: true },
    { label: 'سایر مزایا', key: 'سایر مزایا', isCurrency: true },
    { label: 'مابه التفاوت', key: 'مابه التفاوت', isCurrency: true },
    { label: 'جمع مزایا', key: 'جمع مزایا', isCurrency: true, rowClass: 'bg-emerald' },
    { label: 'مساعده', key: 'مساعده', isCurrency: true },
    { label: 'مالیات', key: 'مالیات', isCurrency: true },
    { label: 'مالیات حقوق', key: 'مالیات حقوق', isCurrency: true },
    { label: 'جمع کسور', key: 'جمع کسور', isCurrency: true, rowClass: 'bg-rose' },
    { label: 'خالص پرداختی نهایی', key: 'خالص پرداختی', isCurrency: true, rowClass: 'bg-indigo' },
  ];

  const comparisonRowsHtml = keyItems
    .map((item) => {
      const currVal = parsePayrollNumber(getPayrollField(row.currentRecord.rawFields || {}, item.key));
      const prevVal = row.previousRecord
        ? parsePayrollNumber(getPayrollField(row.previousRecord.rawFields || {}, item.key))
        : 0;
      const diff = currVal - prevVal;
      const diffText =
        diff > 0
          ? `+${item.isCurrency ? formatRial(diff) : toPersianDigits(diff)}`
          : item.isCurrency
          ? formatRial(diff)
          : toPersianDigits(diff);
      const diffClass = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
      return `
        <tr class="${item.rowClass || ''}">
          <td>${item.label}</td>
          <td>${item.isCurrency ? formatRial(prevVal) : toPersianDigits(prevVal)}</td>
          <td><b>${item.isCurrency ? formatRial(currVal) : toPersianDigits(currVal)}</b></td>
          <td class="${diffClass}"><b>${diffText}</b></td>
        </tr>
      `;
    })
    .join('');

  const orderRowsHtml = [...PAYROLL_MAIN_ORDER_FIELDS, ...PAYROLL_SUB_ORDER_FIELDS, 'جمع عوامل حكمي']
    .map((field) => {
      const cRaw = getPayrollField(row.currentRecord.rawFields || {}, field);
      const pRaw = row.previousRecord ? getPayrollField(row.previousRecord.rawFields || {}, field) : '';
      const cNum = parsePayrollNumber(cRaw);
      const pNum = parsePayrollNumber(pRaw);
      if (cNum === 0 && pNum === 0 && !cRaw && !pRaw) return '';
      const diff = cNum - pNum;
      return `
        <tr>
          <td>${field}</td>
          <td>${formatRial(pNum)}</td>
          <td><b>${formatRial(cNum)}</b></td>
          <td class="${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${diff > 0 ? '+' : ''}${formatRial(diff)}</td>
        </tr>
      `;
    })
    .filter(Boolean)
    .join('');

  const activeLoansHtml = PAYROLL_LOAN_GROUPS.map((group) => {
    const vals = PAYROLL_LOAN_SUBFIELDS.map((sub) =>
      parsePayrollNumber(getPayrollField(row.currentRecord.rawFields || {}, `${group}(${sub})`))
    );
    if (!vals.some((v) => v !== 0)) return '';
    return `
      <tr>
        <td><b>${group}</b></td>
        ${vals.map((v, i) => `<td>${i === 5 ? toPersianDigits(v) : formatRial(v)}</td>`).join('')}
      </tr>
    `;
  })
    .filter(Boolean)
    .join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فیش حقوق مقایسه‌ای - ${row.fullName}</title>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Vazirmatn', Tahoma, sans-serif; }
    body { margin: 0; padding: 16px; color: #0f172a; background: #fff; font-size: 11px; direction: rtl; font-feature-settings: "ss01" 1, "tnum" 1; }
    .header { border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 15px; font-weight: 800; }
    .header p { margin: 3px 0 0; font-size: 10px; color: #475569; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
    .meta div span { display: block; font-size: 9px; color: #64748b; }
    .meta div b { font-size: 10.5px; }
    h3 { font-size: 12px; margin: 12px 0 6px; color: #1e293b; border-right: 3px solid #4f46e5; padding-right: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: right; font-size: 10px; }
    th { background: #f1f5f9; font-weight: 700; }
    .bg-emerald { background: #ecfdf5; font-weight: 700; }
    .bg-rose { background: #fff1f2; font-weight: 700; }
    .bg-indigo { background: #eef2ff; font-weight: 800; font-size: 11px; }
    .pos { color: #047857; }
    .neg { color: #be123c; }
    .sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; text-align: center; }
    .sign-box { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; }
    .toolbar { margin-bottom: 14px; text-align: left; }
    .btn-print { background: #059669; color: #fff; border: none; padding: 7px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">چاپ نهایی فیش (A4)</button>
  </div>
  <div class="header">
    <div>
      <h1>فیش حقوقی و آنالیز مقایسه‌ای دو دوره</h1>
      <p>دوره مقایسه: ${previousPeriodLabel} (ماه قبل) ↔ ${currentPeriodLabel} (ماه جدید)</p>
    </div>
    <div style="text-align:left; font-size:10px;">
      <div>تاریخ چاپ: <b>${new Date().toLocaleDateString('fa-IR')}</b></div>
      <div>رده سازمانی: <b>${classifyPayrollRoleTier(row.position, row.jobTitle)}</b></div>
    </div>
  </div>

  <div class="meta">
    <div><span>نام و نام خانوادگی</span><b>${row.fullName}</b></div>
    <div><span>کد پرسنلی / کد ملی</span><b>${toPersianDigits(row.personnelCode)} / ${toPersianDigits(row.nationalId || '—')}</b></div>
    <div><span>واحد / محل خدمت</span><b>${row.department || '—'} / ${row.workLocation || '—'}</b></div>
    <div><span>شغل / پست سازمانی</span><b>${row.jobTitle || '—'} / ${row.position || '—'}</b></div>
  </div>

  <h3>جدول مقایسه آیتم‌های کلیدی حقوق و کارکرد</h3>
  <table>
    <thead>
      <tr>
        <th>عنوان آیتم</th>
        <th>ماه قبل (${previousPeriodLabel})</th>
        <th>ماه جدید (${currentPeriodLabel})</th>
        <th>تغییرات / اختلاف</th>
      </tr>
    </thead>
    <tbody>${comparisonRowsHtml}</tbody>
  </table>

  ${orderRowsHtml ? `
  <h3>عوامل حکمی (دارای مقدار در ماه قبل یا جدید)</h3>
  <table>
    <thead>
      <tr>
        <th>عامل حکمی</th>
        <th>ماه قبل</th>
        <th>ماه جدید</th>
        <th>تغییر</th>
      </tr>
    </thead>
    <tbody>${orderRowsHtml}</tbody>
  </table>` : ''}

  ${activeLoansHtml ? `
  <h3>وضعیت وام‌ها و اقساط فعال در ماه جدید</h3>
  <table>
    <thead>
      <tr>
        <th>عنوان وام</th>
        ${PAYROLL_LOAN_SUBFIELDS.map((s) => `<th>${s}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${activeLoansHtml}</tbody>
  </table>` : ''}

  <div class="sign-grid">
    <div class="sign-box">تایید امور کارگزینی و پرسنلی</div>
    <div class="sign-box">تایید واحد حسابداری و حقوق</div>
    <div class="sign-box">امضاء پرسنل (${row.fullName})</div>
  </div>
</body>
</html>`;
}

/**
 * چاپ تضمینی با استفاده از Iframe مخفی A4 (بدون تداخل با اسکرول مودال) و تشخیص محدودیت سندباکس پیش‌نمایش
 */
export function printPayrollComparisonSheet(
  row: PayrollComparisonRow,
  currentPeriodLabel: string,
  previousPeriodLabel: string,
  onFallbackNeeded: () => void
) {
  const html = buildPayrollComparisonHtml(row, currentPeriodLabel, previousPeriodLabel);
  const existing = document.getElementById('hr-payroll-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'hr-payroll-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    onFallbackNeeded();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let printTriggered = false;
  const markTriggered = () => {
    printTriggered = true;
  };

  try {
    iframe.contentWindow.addEventListener('beforeprint', markTriggered);
  } catch {
    // ignore listener error
  }

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      onFallbackNeeded();
      return;
    }

    setTimeout(() => {
      if (!printTriggered) {
        // در برخی محیط‌های پیش‌نمایش آیفریم، دستور print مرورگر توسط سندباکس مسدود می‌شود
        onFallbackNeeded();
      }
      setTimeout(() => {
        iframe.remove();
      }, 2000);
    }, 350);
  }, 250);
}

/**
 * دانلود فایل آماده چاپ فیش مقایسه‌ای (HTML A4) جهت باز کردن و چاپ مستقیم در مرورگر ویندوز/موبایل
 */
export function downloadPayrollComparisonHtml(
  row: PayrollComparisonRow,
  currentPeriodLabel: string,
  previousPeriodLabel: string
) {
  const html = buildPayrollComparisonHtml(row, currentPeriodLabel, previousPeriodLabel);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `فیش_مقایسه_حقوق_${row.personnelCode}_${row.fullName.replace(/\s+/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
