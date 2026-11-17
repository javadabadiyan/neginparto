import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Users,
  Award,
  FileCheck,
  FileSpreadsheet,
  Printer,
  Filter,
  RotateCcw,
  BarChart3,
  PieChart as PieChartIcon,
  Layers,
  ShieldCheck,
  Download,
} from 'lucide-react';
import {
  Personnel,
  JobGroup,
  JobClassificationRecord,
  PersonnelCommitment,
  GranularDashboardReportPermissions,
} from '../types';
import { formatRial, formatPercent, toPersianDigits } from '../utils/persian';
import { exportSmartPersonnelReportToExcel } from '../utils/excel';

interface SmartPersonnelDashboardProps {
  personnel: Personnel[];
  jobGroups: JobGroup[];
  jobClassifications: JobClassificationRecord[];
  commitments: PersonnelCommitment[];
  granularPermissions?: GranularDashboardReportPermissions;
  isSuperAdmin?: boolean;
}

const CHART_PALETTE = [
  '#4338ca', // indigo-700
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#0284c7', // sky-600
  '#be123c', // rose-700
  '#059669', // emerald-600
  '#64748b', // slate-500
];

const COMMITMENT_STATUS_COLORS: Record<string, string> = {
  'جاری و معتبر': '#059669',
  'پایان یافته': '#64748b',
  'عودت داده شده': '#0284c7',
  'به اجرا گذاشته شده': '#be123c',
};

const formatMillionLabel = (rial: number) => {
  const m = rial / 1_000_000;
  return `${toPersianDigits(m.toFixed(1))} م.ر`;
};

const CustomPersianTooltip: React.FC<any> = ({ active, payload, label, mode }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      dir="rtl"
      className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-lg p-3 text-xs text-slate-800 space-y-1.5 min-w-[175px]"
    >
      {label && <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">{label}</div>}
      {payload.map((entry: any, idx: number) => {
        const val = Number(entry.value || 0);
        const formatted =
          mode === 'currency'
            ? formatRial(val)
            : mode === 'million'
            ? `${formatRial(val * 1_000_000)}`
            : `${toPersianDigits(val)} ${entry.name?.includes('مبلغ') ? 'میلیون ریال' : 'فقره / نفر'}`;
        return (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color || entry.payload?.fill || '#4338ca' }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-bold text-slate-900 persian-num">{formatted}</span>
          </div>
        );
      })}
    </div>
  );
};

export const SmartPersonnelDashboard: React.FC<SmartPersonnelDashboardProps> = ({
  personnel,
  jobGroups,
  jobClassifications,
  commitments,
  granularPermissions,
  isSuperAdmin = false,
}) => {
  const canExport = isSuperAdmin || (granularPermissions?.exportExcel ?? true);
  const canPrint = isSuperAdmin || (granularPermissions?.print ?? true);

  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [employmentFilter, setEmploymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [includeArchivedCommitments, setIncludeArchivedCommitments] = useState<boolean>(true);
  const [jobGroupMetric, setJobGroupMetric] = useState<'count' | 'salary'>('count');
  const [commitmentMetric, setCommitmentMetric] = useState<'count' | 'amount'>('count');

  const departments = useMemo(() => {
    const set = new Set<string>();
    personnel.forEach((p) => {
      if (p.department) set.add(p.department.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
  }, [personnel]);

  const employmentTypes = useMemo(() => {
    const set = new Set<string>();
    personnel.forEach((p) => {
      if (p.employmentType) set.add(p.employmentType.trim());
    });
    return Array.from(set);
  }, [personnel]);

  const filteredPersonnel = useMemo(() => {
    return personnel.filter((p) => {
      if (deptFilter !== 'all' && p.department?.trim() !== deptFilter) return false;
      if (employmentFilter !== 'all' && p.employmentType?.trim() !== employmentFilter) return false;
      if (statusFilter !== 'all' && p.status?.trim() !== statusFilter) return false;
      return true;
    });
  }, [personnel, deptFilter, employmentFilter, statusFilter]);

  const filteredPersonnelIdSet = useMemo(
    () => new Set(filteredPersonnel.map((p) => p.id)),
    [filteredPersonnel]
  );
  const filteredPersonnelCodeSet = useMemo(
    () => new Set(filteredPersonnel.map((p) => String(p.personnelCode || '').trim())),
    [filteredPersonnel]
  );

  const filteredCommitments = useMemo(() => {
    const isPersonnelFiltered = deptFilter !== 'all' || employmentFilter !== 'all' || statusFilter !== 'all';
    return commitments.filter((c) => {
      if (!includeArchivedCommitments && c.isArchived) return false;
      if (!isPersonnelFiltered) return true;
      return (
        filteredPersonnelIdSet.has(c.personnelId) ||
        filteredPersonnelCodeSet.has(String(c.personnelCode || '').trim())
      );
    });
  }, [
    commitments,
    includeArchivedCommitments,
    deptFilter,
    employmentFilter,
    statusFilter,
    filteredPersonnelIdSet,
    filteredPersonnelCodeSet,
  ]);

  // Job Groups distribution from Personnel + JobGroups (enriched with JobClassifications when matching)
  const jobGroupStats = useMemo(() => {
    const totalCount = filteredPersonnel.length;
    const classificationByCode = new Map<string, JobClassificationRecord>();
    jobClassifications.forEach((jc) => {
      if (jc.personnelCode) classificationByCode.set(String(jc.personnelCode).trim(), jc);
    });

    const buckets = new Map<
      string,
      {
        code: string;
        title: string;
        grade: number;
        count: number;
        totalSalary: number;
        maxKaranehCeiling: number;
      }
    >();

    // Seed configured job groups
    jobGroups.forEach((jg) => {
      buckets.set(jg.id, {
        code: jg.code,
        title: jg.title,
        grade: jg.grade || 0,
        count: 0,
        totalSalary: 0,
        maxKaranehCeiling: jg.maxKaranehCeiling || 0,
      });
    });

    filteredPersonnel.forEach((p) => {
      const matchedJg = jobGroups.find((g) => g.id === p.jobGroupId);
      const jc = classificationByCode.get(String(p.personnelCode || '').trim());

      if (matchedJg) {
        const current = buckets.get(matchedJg.id)!;
        current.count += 1;
        current.totalSalary += Number(p.baseSalary || 0);
      } else {
        const fallbackCode = (jc?.jobGroup || p.jobGroupName || 'تعیین نشده').trim();
        const fallbackKey = `other:${fallbackCode}`;
        const existing = buckets.get(fallbackKey) || {
          code: fallbackCode,
          title: fallbackCode === 'تعیین نشده' ? 'فاقد گروه ثبت‌شده' : fallbackCode,
          grade: 0,
          count: 0,
          totalSalary: 0,
          maxKaranehCeiling: 0,
        };
        existing.count += 1;
        existing.totalSalary += Number(p.baseSalary || 0);
        buckets.set(fallbackKey, existing);
      }
    });

    return Array.from(buckets.values())
      .filter((b) => b.count > 0 || !b.code.startsWith('other:'))
      .sort((a, b) => b.grade - a.grade || b.count - a.count)
      .map((b, idx) => ({
        ...b,
        shortLabel: b.code,
        avgSalary: b.count > 0 ? Math.round(b.totalSalary / b.count) : 0,
        avgSalaryMillion: b.count > 0 ? Number((b.totalSalary / b.count / 1_000_000).toFixed(1)) : 0,
        totalSalaryMillion: Number((b.totalSalary / 1_000_000).toFixed(1)),
        percent: totalCount > 0 ? (b.count / totalCount) * 100 : 0,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
      }));
  }, [filteredPersonnel, jobGroups, jobClassifications]);

  // Commitments Status distribution
  const commitmentStatusStats = useMemo(() => {
    const statuses = ['جاری و معتبر', 'پایان یافته', 'عودت داده شده', 'به اجرا گذاشته شده'];
    const buckets = new Map<
      string,
      {
        status: string;
        count: number;
        archivedCount: number;
        totalAmount: number;
        previouslyTaken: number;
        maxAllowed: number;
      }
    >();
    statuses.forEach((st) =>
      buckets.set(st, { status: st, count: 0, archivedCount: 0, totalAmount: 0, previouslyTaken: 0, maxAllowed: 0 })
    );

    filteredCommitments.forEach((c) => {
      const st = c.status || 'جاری و معتبر';
      const entry = buckets.get(st) || {
        status: st,
        count: 0,
        archivedCount: 0,
        totalAmount: 0,
        previouslyTaken: 0,
        maxAllowed: 0,
      };
      entry.count += 1;
      if (c.isArchived) entry.archivedCount += 1;
      entry.totalAmount += Number(c.amount || 0);
      entry.previouslyTaken += Number(c.previouslyTakenAmount || 0);
      entry.maxAllowed += Number(c.maxAllowedAmount || c.amount || 0);
      buckets.set(st, entry);
    });

    const totalCount = filteredCommitments.length;
    return Array.from(buckets.values()).map((b, idx) => ({
      ...b,
      amountMillion: Number((b.totalAmount / 1_000_000).toFixed(1)),
      previouslyTakenMillion: Number((b.previouslyTaken / 1_000_000).toFixed(1)),
      maxAllowedMillion: Number((b.maxAllowed / 1_000_000).toFixed(1)),
      percent: totalCount > 0 ? (b.count / totalCount) * 100 : 0,
      color: COMMITMENT_STATUS_COLORS[b.status] || CHART_PALETTE[idx % CHART_PALETTE.length],
    }));
  }, [filteredCommitments]);

  // Commitment Type breakdown
  const commitmentTypeStats = useMemo(() => {
    const map = new Map<string, { type: string; count: number; totalAmount: number }>();
    filteredCommitments.forEach((c) => {
      const t = c.commitmentType || 'سایر';
      const cur = map.get(t) || { type: t, count: 0, totalAmount: 0 };
      cur.count += 1;
      cur.totalAmount += Number(c.amount || 0);
      map.set(t, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map((item, idx) => ({
        ...item,
        amountMillion: Number((item.totalAmount / 1_000_000).toFixed(1)),
        color: CHART_PALETTE[(idx + 2) % CHART_PALETTE.length],
      }));
  }, [filteredCommitments]);

  // Department Breakdown
  const departmentBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { department: string; count: number; activeCount: number; totalSalary: number; commitmentsCount: number }
    >();
    const codeToDept = new Map<string, string>();

    filteredPersonnel.forEach((p) => {
      const dept = (p.department || 'تعیین نشده').trim();
      codeToDept.set(p.id, dept);
      codeToDept.set(String(p.personnelCode || '').trim(), dept);
      const cur = map.get(dept) || {
        department: dept,
        count: 0,
        activeCount: 0,
        totalSalary: 0,
        commitmentsCount: 0,
      };
      cur.count += 1;
      if (p.status === 'فعال') cur.activeCount += 1;
      cur.totalSalary += Number(p.baseSalary || 0);
      map.set(dept, cur);
    });

    filteredCommitments.forEach((c) => {
      const dept = codeToDept.get(c.personnelId) || codeToDept.get(String(c.personnelCode || '').trim());
      if (dept && map.has(dept)) {
        map.get(dept)!.commitmentsCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredPersonnel, filteredCommitments]);

  // Top KPIs
  const activePersonnelCount = useMemo(
    () => filteredPersonnel.filter((p) => p.status === 'فعال').length,
    [filteredPersonnel]
  );
  const docsCompletedCount = useMemo(
    () =>
      filteredPersonnel.filter(
        (p) =>
          Boolean(p.documents?.nationalCardImage) ||
          Boolean(p.documents?.shenasnamehPages && p.documents.shenasnamehPages.length > 0)
      ).length,
    [filteredPersonnel]
  );
  const totalBaseSalary = useMemo(
    () => filteredPersonnel.reduce((sum, p) => sum + Number(p.baseSalary || 0), 0),
    [filteredPersonnel]
  );
  const totalCommitmentsAmount = useMemo(
    () => filteredCommitments.reduce((sum, c) => sum + Number(c.amount || 0), 0),
    [filteredCommitments]
  );
  const activeCommitmentsCount = useMemo(
    () => filteredCommitments.filter((c) => c.status === 'جاری و معتبر' && !c.isArchived).length,
    [filteredCommitments]
  );
  const dominantGroup = useMemo(() => {
    const nonZero = jobGroupStats.filter((g) => g.count > 0);
    if (nonZero.length === 0) return null;
    return [...nonZero].sort((a, b) => b.count - a.count)[0];
  }, [jobGroupStats]);

  const filterSummaryText = [
    deptFilter === 'all' ? 'همه واحدها' : `واحد: ${deptFilter}`,
    employmentFilter === 'all' ? 'همه نوع استخدام' : `استخدام: ${employmentFilter}`,
    statusFilter === 'all' ? 'همه وضعیت‌ها' : `وضعیت: ${statusFilter}`,
  ].join(' · ');

  const handleResetFilters = () => {
    setDeptFilter('all');
    setEmploymentFilter('all');
    setStatusFilter('all');
    setIncludeArchivedCommitments(true);
  };

  const handleExportExcel = () => {
    exportSmartPersonnelReportToExcel({
      filterSummary: filterSummaryText,
      totalPersonnel: filteredPersonnel.length,
      activePersonnel: activePersonnelCount,
      docsCompletedCount,
      totalBaseSalary,
      totalCommitmentsAmount,
      jobGroupDistribution: jobGroupStats.map((g) => ({
        code: g.code,
        title: g.title,
        count: g.count,
        percent: g.percent,
        avgSalary: g.avgSalary,
        totalSalary: g.totalSalary,
        maxKaranehCeiling: g.maxKaranehCeiling,
      })),
      commitmentStatusDistribution: commitmentStatusStats.map((c) => ({
        status: c.status,
        count: c.count,
        archivedCount: c.archivedCount,
        totalAmount: c.totalAmount,
        previouslyTaken: c.previouslyTaken,
        maxAllowed: c.maxAllowed,
        percent: c.percent,
      })),
      commitmentTypeDistribution: commitmentTypeStats.map((t) => ({
        type: t.type,
        count: t.count,
        totalAmount: t.totalAmount,
      })),
      departmentBreakdown,
    });
  };

  const buildPrintableHtml = () => {
    const jgRowsHtml = jobGroupStats
      .map(
        (g, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${g.code}</b></td>
        <td>${g.title}</td>
        <td>${toPersianDigits(g.count)} نفر</td>
        <td>${formatPercent(g.percent)}</td>
        <td>${formatRial(g.avgSalary)}</td>
        <td>${formatRial(g.totalSalary)}</td>
      </tr>`
      )
      .join('');

    const csRowsHtml = commitmentStatusStats
      .map(
        (c, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${c.status}</b></td>
        <td>${toPersianDigits(c.count)} فقره</td>
        <td>${toPersianDigits(c.archivedCount)}</td>
        <td>${formatPercent(c.percent)}</td>
        <td>${formatRial(c.totalAmount)}</td>
        <td>${formatRial(c.maxAllowed)}</td>
      </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>گزارش هوشمند وضعیت پرسنل، گروه‌های شغلی و تعهدات</title>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; font-family: 'Vazirmatn', Tahoma, sans-serif; }
    body { margin: 0; padding: 14px; color: #0f172a; background: #fff; font-size: 11px; direction: rtl; font-feature-settings: "ss01" 1, "tnum" 1; }
    .hdr { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
    .hdr h1 { margin: 0; font-size: 16px; font-weight: 800; }
    .hdr p { margin: 3px 0 0; font-size: 10px; color: #475569; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
    .kpi span { display: block; font-size: 9.5px; color: #475569; }
    .kpi b { display: block; font-size: 12.5px; margin-top: 3px; color: #0f172a; }
    h2 { font-size: 12.5px; margin: 14px 0 6px; padding-right: 6px; border-right: 3px solid #4338ca; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: right; font-size: 10px; }
    th { background: #f1f5f9; font-weight: 700; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>گزارش هوشمند وضعیت پرسنل، گروه‌های شغلی و تعهدات</h1>
      <p>محدوده گزارش: ${filterSummaryText}</p>
    </div>
    <div style="text-align:left; font-size:10px;">
      <div>تاریخ گزارش: <b>${new Date().toLocaleDateString('fa-IR')}</b></div>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><span>کل پرسنل محدوده</span><b>${toPersianDigits(filteredPersonnel.length)} نفر (${toPersianDigits(activePersonnelCount)} فعال)</b></div>
    <div class="kpi"><span>پرونده‌های دارای مدارک هویتی</span><b>${toPersianDigits(docsCompletedCount)} پرونده</b></div>
    <div class="kpi"><span>مجموع حقوق پایه احکام</span><b>${formatRial(totalBaseSalary)}</b></div>
    <div class="kpi"><span>مجموع تعهدات (${toPersianDigits(filteredCommitments.length)} فقره)</span><b>${formatRial(totalCommitmentsAmount)}</b></div>
  </div>
  <h2>توزیع پرسنل و حقوق پایه در گروه‌های شغلی</h2>
  <table>
    <thead><tr><th>ردیف</th><th>کد گروه</th><th>عنوان گروه شغلی</th><th>تعداد</th><th>سهم</th><th>میانگین پایه</th><th>مجموع پایه</th></tr></thead>
    <tbody>${jgRowsHtml}</tbody>
  </table>
  <h2>وضعیت تعهدات و تضامین پرسنلی</h2>
  <table>
    <thead><tr><th>ردیف</th><th>وضعیت</th><th>تعداد فقره</th><th>بایگانی</th><th>سهم</th><th>مبلغ فعلی</th><th>سقف مجاز</th></tr></thead>
    <tbody>${csRowsHtml}</tbody>
  </table>
</body>
</html>`;
  };

  const handlePrintReport = () => {
    const html = buildPrintableHtml();
    const existing = document.getElementById('hr-smart-dashboard-print');
    if (existing) existing.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'hr-smart-dashboard-print';
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc && iframe.contentWindow) {
      doc.open();
      doc.write(html);
      doc.close();
      let triggered = false;
      try {
        iframe.contentWindow.addEventListener('beforeprint', () => {
          triggered = true;
        });
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.print();
        }
        setTimeout(() => {
          if (!triggered) {
            window.print();
          }
          setTimeout(() => iframe.remove(), 2000);
        }, 400);
      }, 250);
    } else {
      window.print();
    }
  };

  const handleDownloadHtml = () => {
    const html = buildPrintableHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش_هوشمند_پرسنل_${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Smart Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">
                داشبورد گزارش‌گیری هوشمند وضعیت پرسنل، گروه‌های شغلی و تعهدات
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              تحلیل پویا با نمودارهای میله‌ای و دایره‌ای · {filterSummaryText}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>خروجی اکسل گزارش</span>
              </button>
            )}
            {canPrint && (
              <>
                <button
                  onClick={handlePrintReport}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ گزارش (A4)</span>
                </button>
                <button
                  onClick={handleDownloadHtml}
                  title="دانلود نسخه آماده چاپ مستقل برای زمانی که مرورگر پیش‌نمایش پرینت را محدود می‌کند"
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors border border-slate-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>فایل چاپی</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Interactive Filters */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              <Filter className="w-3 h-3 inline ml-1 text-indigo-600" />
              واحد سازمانی:
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="all">همه واحدهای سازمانی</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">نوع استخدام:</label>
            <select
              value={employmentFilter}
              onChange={(e) => setEmploymentFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="all">همه انواع استخدام</option>
              {employmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">وضعیت اشتغال:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="فعال">فعال</option>
              <option value="مرخصی">مرخصی</option>
              <option value="ماموریت">ماموریت</option>
              <option value="قطع همکاری">قطع همکاری</option>
            </select>
          </div>

          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchivedCommitments}
              onChange={(e) => setIncludeArchivedCommitments(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600"
            />
            <span className="text-slate-700 font-medium">احتساب تعهدات بایگانی‌شده</span>
          </label>

          <button
            onClick={handleResetFilters}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازنشانی فیلترها</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Cards (Clean SaaS Hairline Cards, No Decorative Dots, No Pill Overload) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>نیروی انسانی در محدوده</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 persian-num">
            {toPersianDigits(filteredPersonnel.length)} <span className="text-xs font-semibold text-slate-500">نفر</span>
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            {toPersianDigits(activePersonnelCount)} فعال · {toPersianDigits(docsCompletedCount)} پرونده دارای مدارک هویتی
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>گروه‌های شغلی فعال</span>
            <Award className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 persian-num">
            {toPersianDigits(jobGroupStats.filter((g) => g.count > 0).length)}{' '}
            <span className="text-xs font-semibold text-slate-500">گروه</span>
          </div>
          <div className="text-[11px] text-slate-600 truncate">
            گروه غالب: <b className="text-slate-800">{dominantGroup ? `${dominantGroup.code} (${toPersianDigits(dominantGroup.count)} نفر)` : '—'}</b>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>اسناد تعهدات و تضامین</span>
            <FileCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 persian-num">
            {toPersianDigits(filteredCommitments.length)}{' '}
            <span className="text-xs font-semibold text-slate-500">فقره</span>
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            {toPersianDigits(activeCommitmentsCount)} جاری و معتبر · {toPersianDigits(filteredCommitments.filter((c) => c.isArchived).length)} بایگانی
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>مجموع تعهدات ریالی</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 persian-num">
            {formatRial(totalCommitmentsAmount)}
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            حقوق پایه محدوده: {formatRial(totalBaseSalary)}
          </div>
        </div>
      </div>

      {/* Primary Charts Row: Job Groups Distribution (Bar + Pie) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* BarChart: Job Groups */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                نمودار میله‌ای توزیع گروه‌های شغلی پرسنل
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                مقایسه فراوانی نیروها و میانگین حقوق پایه در هر گروه شغلی
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] no-print">
              <button
                onClick={() => setJobGroupMetric('count')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  jobGroupMetric === 'count' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                تعداد پرسنل
              </button>
              <button
                onClick={() => setJobGroupMetric('salary')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  jobGroupMetric === 'salary' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                میانگین پایه (میلیون ریال)
              </button>
            </div>
          </div>

          <div className="h-72 w-full min-w-0" dir="ltr">
            {jobGroupStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobGroupStats} margin={{ top: 10, right: 16, left: 4, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: '#334155', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => toPersianDigits(v)}
                  />
                  <Tooltip
                    content={
                      <CustomPersianTooltip mode={jobGroupMetric === 'salary' ? 'million' : 'count'} />
                    }
                  />
                  <Bar
                    dataKey={jobGroupMetric === 'count' ? 'count' : 'avgSalaryMillion'}
                    name={jobGroupMetric === 'count' ? 'تعداد پرسنل' : 'میانگین حقوق پایه'}
                    radius={[8, 8, 0, 0]}
                    maxBarSize={52}
                  >
                    {jobGroupStats.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                داده‌ای برای رسم نمودار گروه‌های شغلی در این فیلتر یافت نشد.
              </div>
            )}
          </div>
        </div>

        {/* PieChart: Job Groups Share */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-violet-600" />
              نمودار دایره‌ای سهم گروه‌های شغلی
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              نسبت پراکندگی سرمایه انسانی در سطوح و گروه‌های شغلی
            </p>
          </div>

          <div className="h-60 w-full min-w-0" dir="ltr">
            {jobGroupStats.some((g) => g.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={jobGroupStats.filter((g) => g.count > 0)}
                    dataKey="count"
                    nameKey="shortLabel"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={86}
                    paddingAngle={3}
                  >
                    {jobGroupStats
                      .filter((g) => g.count > 0)
                      .map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                      ))}
                  </Pie>
                  <Tooltip content={<CustomPersianTooltip mode="count" />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                پرسنلی با گروه شغلی در این محدوده یافت نشد.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            {jobGroupStats
              .filter((g) => g.count > 0)
              .map((g, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <span className="flex items-center gap-1.5 text-slate-700 truncate">
                    <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="truncate">{g.shortLabel}</span>
                  </span>
                  <span className="font-bold text-slate-900 persian-num shrink-0">
                    {toPersianDigits(g.count)} ({formatPercent(g.percent)})
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Secondary Charts Row: Commitments Status (Pie + Bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* PieChart: Commitments Status */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                نمودار دایره‌ای وضعیت تعهدات و تضامین
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ترکیب وضعیت اسناد تعهد حسابداری، سفته، چک و تعهد خدمت
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] no-print shrink-0">
              <button
                onClick={() => setCommitmentMetric('count')}
                className={`px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  commitmentMetric === 'count' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                تعداد
              </button>
              <button
                onClick={() => setCommitmentMetric('amount')}
                className={`px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  commitmentMetric === 'amount' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                مبلغ
              </button>
            </div>
          </div>

          <div className="h-60 w-full min-w-0" dir="ltr">
            {commitmentStatusStats.some((s) => s.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={commitmentStatusStats.filter((s) =>
                      commitmentMetric === 'count' ? s.count > 0 : s.amountMillion > 0
                    )}
                    dataKey={commitmentMetric === 'count' ? 'count' : 'amountMillion'}
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={84}
                    paddingAngle={3}
                  >
                    {commitmentStatusStats
                      .filter((s) => (commitmentMetric === 'count' ? s.count > 0 : s.amountMillion > 0))
                      .map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                      ))}
                  </Pie>
                  <Tooltip
                    content={
                      <CustomPersianTooltip mode={commitmentMetric === 'amount' ? 'million' : 'count'} />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                سند تعهدی در محدوده فیلتر یافت نشد.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {commitmentStatusStats.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100"
              >
                <span className="flex items-center gap-1.5 text-slate-700 truncate">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.status}</span>
                </span>
                <span className="font-bold text-slate-900 persian-num shrink-0">
                  {toPersianDigits(s.count)} ({formatPercent(s.percent)})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* BarChart: Commitments Financial Exposure vs Ceiling by Status */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-600" />
              نمودار میله‌ای وضعیت مالی تعهدات (تعهد فعلی، دریافتی قبلی و سقف مجاز)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              مقایسه بار مالی تعهدات بر حسب میلیون ریال در تفکیک وضعیت اسناد
            </p>
          </div>

          <div className="h-72 w-full min-w-0" dir="ltr">
            {commitmentStatusStats.some((s) => s.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={commitmentStatusStats}
                  margin={{ top: 10, right: 16, left: 4, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="status"
                    tick={{ fill: '#334155', fontSize: 10.5, fontFamily: 'Vazirmatn' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => toPersianDigits(v)}
                  />
                  <Tooltip content={<CustomPersianTooltip mode="million" />} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                  <Bar
                    dataKey="amountMillion"
                    name="مبلغ تعهد فعلی (م.ر)"
                    fill="#4338ca"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="previouslyTakenMillion"
                    name="قبلاً دریافت‌شده (م.ر)"
                    fill="#d97706"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="maxAllowedMillion"
                    name="سقف مجاز کل (م.ر)"
                    fill="#0d9488"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                داده مالی تعهدات برای نمایش وجود ندارد.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Analytical Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Job Groups Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">جدول تحلیلی گروه‌های شغلی</h3>
            <span className="text-[11px] text-slate-500 persian-num">
              جمع پرسنل: {toPersianDigits(filteredPersonnel.length)} نفر
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">گروه</th>
                  <th className="py-2.5 px-3">عنوان</th>
                  <th className="py-2.5 px-3 text-center">تعداد</th>
                  <th className="py-2.5 px-3 text-center">سهم</th>
                  <th className="py-2.5 px-3">میانگین حقوق پایه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobGroupStats.map((g, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{g.code}</td>
                    <td className="py-2.5 px-3 text-slate-600">{g.title}</td>
                    <td className="py-2.5 px-3 text-center font-bold persian-num">{toPersianDigits(g.count)}</td>
                    <td className="py-2.5 px-3 text-center text-indigo-700 font-semibold persian-num">
                      {formatPercent(g.percent)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 persian-num">
                      {g.count > 0 ? formatRial(g.avgSalary) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Commitments Type & Department Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">خلاصه واحدهای سازمانی و ریسک تعهدات</h3>
            <span className="text-[11px] text-slate-500 persian-num">
              {toPersianDigits(departmentBreakdown.length)} واحد فعال
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">واحد سازمانی</th>
                  <th className="py-2.5 px-3 text-center">کل / فعال</th>
                  <th className="py-2.5 px-3 text-center">تعداد تعهدات</th>
                  <th className="py-2.5 px-3">جمع حقوق پایه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departmentBreakdown.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{d.department}</td>
                    <td className="py-2.5 px-3 text-center persian-num">
                      {toPersianDigits(d.count)} / {toPersianDigits(d.activeCount)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-amber-700 persian-num">
                      {toPersianDigits(d.commitmentsCount)} فقره
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 persian-num">
                      {formatRial(d.totalSalary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
