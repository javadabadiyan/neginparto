import React, { useState, useMemo, useEffect } from 'react';
import {
  Wallet,
  Upload,
  Download,
  FileSpreadsheet,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  RotateCcw,
  ArrowLeftRight,
  Eye,
  Trash2,
  X,
  AlertCircle,
  Printer,
  Sparkles,
  Building2,
  MapPin,
  Users,
  BarChart3,
  Wrench,
  CheckSquare,
  FileText,
  Layers,
  Info
} from 'lucide-react';
import {
  PayrollRecord,
  PayrollComparisonRow,
  PayrollAnalysisMetric,
  GranularPayrollPermissions
} from '../types';
import {
  formatRial,
  formatPercent,
  toPersianDigits,
  PERSIAN_MONTHS,
  YEARS_LIST,
  parsePeriod,
  buildPeriod,
  getPeriodLabel,
  getPreviousPeriodId
} from '../utils/persian';
import {
  exportPayrollComparisonToExcel,
  exportFullPayrollToExcel,
  exportPayrollAnalyticsToExcel,
  exportPayrollDrilldownToExcel,
  downloadPayrollTemplate
} from '../utils/excel';
import {
  PAYROLL_EXCEL_COLUMNS,
  PAYROLL_LOAN_GROUPS,
  PAYROLL_LOAN_SUBFIELDS,
  PAYROLL_MAIN_ORDER_FIELDS,
  PAYROLL_SUB_ORDER_FIELDS,
  getPayrollField,
  parsePayrollNumber,
  parseYearMonthToPeriod
} from '../utils/payrollColumns';
import {
  ROLE_TIER_ORDER,
  classifyPayrollRoleTier,
  computeGroupAnalytics,
  getRowMetricValues,
  PayrollGroupStat,
  printPayrollComparisonSheet,
  downloadPayrollComparisonHtml
} from '../utils/payrollAnalytics';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';

interface PayrollSliceInfo {
  title: string;
  subtitle: string;
  rows: PayrollComparisonRow[];
  defaultTrendFilter?: 'all' | 'decrease' | 'increase' | 'new';
  onApplyTableFilter?: () => void;
}

interface PayrollModuleProps {
  payrollList: PayrollRecord[];
  onBatchImportPayroll: (period: string, items: any[], useRowYearMonth: boolean) => Promise<boolean>;
  onDeletePayrollRecord: (id: string) => Promise<boolean>;
  onBatchDeletePayroll: (ids: string[]) => Promise<boolean>;
  onDeleteAllPayroll?: () => Promise<boolean>;
  onDeletePayrollPeriod: (period: string) => Promise<boolean>;
  canManage?: boolean;
  granularPermissions?: GranularPayrollPermissions;
}

export const PayrollModule: React.FC<PayrollModuleProps> = ({
  payrollList,
  onBatchImportPayroll,
  onDeletePayrollRecord,
  onBatchDeletePayroll,
  onDeleteAllPayroll,
  onDeletePayrollPeriod,
  canManage = true,
  granularPermissions
}) => {
  const canDelete = granularPermissions ? granularPermissions.delete : canManage;
  const allowDeleteAll = granularPermissions ? Boolean(granularPermissions.deleteAll) : false;
  const allowImport = granularPermissions ? granularPermissions.importExcel : canManage;
  const allowExport = granularPermissions ? granularPermissions.exportExcel : true;

  // Period selectors
  const [currentYear, setCurrentYear] = useState<string>('1403');
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(7);
  const [prevYear, setPrevYear] = useState<string>('1403');
  const [prevMonthIndex, setPrevMonthIndex] = useState<number>(6);

  const currentPeriod = buildPeriod(currentYear, currentMonthIndex);
  const previousPeriod = buildPeriod(prevYear, prevMonthIndex);

  // Analysis Metric Basis: netPayable vs totalBenefits
  const [metricBasis, setMetricBasis] = useState<PayrollAnalysisMetric>('netPayable');
  const metricLabel = metricBasis === 'totalBenefits' ? 'جمع مزایا' : 'خالص پرداختی';

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTrend, setFilterTrend] = useState<string>('all');
  const [filterRoleTier, setFilterRoleTier] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterWorkLocation, setFilterWorkLocation] = useState<string>('all');

  // Analytics tab
  const [analyticsTab, setAnalyticsTab] = useState<'roles' | 'operators' | 'departments' | 'locations' | 'movers'>('roles');

  // Hover Preview & Click Drill-Down states
  const [hoveredSlice, setHoveredSlice] = useState<PayrollSliceInfo | null>(null);
  const [drilldownSlice, setDrilldownSlice] = useState<PayrollSliceInfo | null>(null);
  const [drilldownTrendFilter, setDrilldownTrendFilter] = useState<'all' | 'decrease' | 'increase' | 'new'>('all');
  const [drilldownSearch, setDrilldownSearch] = useState('');

  // Selection for batch delete
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);

  // Modals
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importYear, setImportYear] = useState<string>('1403');
  const [importMonthIndex, setImportMonthIndex] = useState<number>(7);
  const [useRowYearMonth, setUseRowYearMonth] = useState<boolean>(true);

  // Detail & 226-column modal + Print feedback
  const [selectedRow, setSelectedRow] = useState<PayrollComparisonRow | null>(null);
  const [detailTab, setDetailTab] = useState<'summary' | 'orders' | 'loans' | 'all'>('summary');
  const [detailColSearch, setDetailColSearch] = useState('');
  const [showZeroLoans, setShowZeroLoans] = useState(false);
  const [printFallbackHint, setPrintFallbackHint] = useState(false);

  // Delete confirmation modals
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<PayrollComparisonRow | null>(null);
  const [confirmClearPeriod, setConfirmClearPeriod] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

  const importPeriod = buildPeriod(importYear, importMonthIndex);

  // Prune stale selectedIds when payrollList or period changes
  useEffect(() => {
    const valid = new Set(payrollList.filter((r) => r.period === currentPeriod).map((r) => r.id));
    setSelectedIds((prev) => prev.filter((id) => valid.has(id)));
  }, [payrollList, currentPeriod]);

  // Available periods stored in DB
  const availablePeriods = useMemo(() => {
    const set = new Set<string>(payrollList.map((r) => r.period));
    return Array.from(set).sort().reverse();
  }, [payrollList]);

  const handleSelectSavedPeriod = (periodId: string) => {
    const parsed = parsePeriod(periodId);
    setCurrentYear(parsed.year);
    setCurrentMonthIndex(parsed.monthIndex);
    const prevId = getPreviousPeriodId(periodId);
    const prevParsed = parsePeriod(prevId);
    setPrevYear(prevParsed.year);
    setPrevMonthIndex(prevParsed.monthIndex);
  };

  const handleAutoSetPreviousMonth = () => {
    const prevId = getPreviousPeriodId(currentPeriod);
    const parsed = parsePeriod(prevId);
    setPrevYear(parsed.year);
    setPrevMonthIndex(parsed.monthIndex);
  };

  // Current and Previous period slices
  const currentRecords = useMemo(
    () => payrollList.filter((r) => r.period === currentPeriod),
    [payrollList, currentPeriod]
  );

  const previousRecords = useMemo(
    () => payrollList.filter((r) => r.period === previousPeriod),
    [payrollList, previousPeriod]
  );

  const comparisonRows: PayrollComparisonRow[] = useMemo(() => {
    const prevMap = new Map<string, PayrollRecord>();
    previousRecords.forEach((r) => prevMap.set(String(r.personnelCode).trim(), r));

    return currentRecords.map((curr) => {
      const code = String(curr.personnelCode).trim();
      const prev = prevMap.get(code);
      const currentNet = Number(curr.netPayable || 0);
      const previousNet = prev ? Number(prev.netPayable || 0) : 0;
      const diffNet = currentNet - previousNet;

      let diffPercent = 0;
      if (previousNet > 0) {
        diffPercent = Number(((diffNet / previousNet) * 100).toFixed(1));
      } else if (currentNet > 0) {
        diffPercent = 100;
      }

      let trend: 'increase' | 'decrease' | 'unchanged' | 'new' = 'unchanged';
      if (!prev) trend = 'new';
      else if (diffNet > 0) trend = 'increase';
      else if (diffNet < 0) trend = 'decrease';

      const currBenefits = Number(curr.totalBenefits || 0);
      const previousBenefits = prev ? Number(prev.totalBenefits || 0) : 0;
      const diffBenefits = currBenefits - previousBenefits;

      let diffBenefitsPercent = 0;
      if (previousBenefits > 0) {
        diffBenefitsPercent = Number(((diffBenefits / previousBenefits) * 100).toFixed(1));
      } else if (currBenefits > 0) {
        diffBenefitsPercent = 100;
      }

      let benefitsTrend: 'increase' | 'decrease' | 'unchanged' | 'new' = 'unchanged';
      if (!prev) benefitsTrend = 'new';
      else if (diffBenefits > 0) benefitsTrend = 'increase';
      else if (diffBenefits < 0) benefitsTrend = 'decrease';

      return {
        recordId: curr.id,
        personnelCode: curr.personnelCode,
        fullName: curr.fullName,
        nationalId: curr.nationalId || '',
        workLocation: curr.workLocation || '',
        department: curr.department || '',
        jobTitle: curr.jobTitle || '',
        position: curr.position || '',
        jobGroupCode: curr.jobGroupCode || '',
        employmentType: curr.employmentType || '',
        effectiveDays: Number(curr.effectiveDays || 0),
        prevEffectiveDays: prev ? Number(prev.effectiveDays || 0) : 0,
        jobWage: Number(curr.jobWage || 0),
        totalOrderFactors: Number(curr.totalOrderFactors || 0),
        totalBenefits: currBenefits,
        previousBenefits,
        diffBenefits,
        diffBenefitsPercent,
        benefitsTrend,
        overtimeAmount: Number(curr.overtimeAmount || 0),
        totalDeductions: Number(curr.totalDeductions || 0),
        taxAmount: Number(curr.taxAmount || curr.salaryTaxAmount || 0),
        currentNet,
        previousNet,
        diffNet,
        diffPercent,
        trend,
        currentRecord: curr,
        previousRecord: prev,
      };
    });
  }, [currentRecords, previousRecords]);

  // Filter lists
  const departments = useMemo(
    () => Array.from(new Set(comparisonRows.map((r) => r.department).filter(Boolean))),
    [comparisonRows]
  );

  const workLocations = useMemo(
    () => Array.from(new Set(comparisonRows.map((r) => r.workLocation).filter(Boolean))),
    [comparisonRows]
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return comparisonRows.filter((r) => {
      const roleTier = classifyPayrollRoleTier(r.position, r.jobTitle);
      const metric = getRowMetricValues(r, metricBasis);
      const matchesSearch =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.personnelCode.toLowerCase().includes(q) ||
        r.nationalId.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.workLocation.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q) ||
        r.jobTitle.toLowerCase().includes(q) ||
        (r.currentRecord.projectTitle || '').toLowerCase().includes(q);
      const matchesTrend = filterTrend === 'all' || metric.trend === filterTrend;
      const matchesRole = filterRoleTier === 'all' || roleTier === filterRoleTier;
      const matchesDept = filterDepartment === 'all' || r.department === filterDepartment;
      const matchesLoc = filterWorkLocation === 'all' || r.workLocation === filterWorkLocation;
      return matchesSearch && matchesTrend && matchesRole && matchesDept && matchesLoc;
    });
  }, [comparisonRows, searchTerm, filterTrend, filterRoleTier, filterDepartment, filterWorkLocation, metricBasis]);

  // Multi-Dimensional Comparative Analytics (Role Tier, Operators, Departments, Work Locations)
  const roleTierStats = useMemo(
    () =>
      computeGroupAnalytics(
        comparisonRows,
        (r) => classifyPayrollRoleTier(r.position, r.jobTitle),
        metricBasis,
        ROLE_TIER_ORDER,
        ['مدیر', 'رئیس', 'مسئول', 'کارشناس', 'اپراتور']
      ),
    [comparisonRows, metricBasis]
  );

  const operatorRows = useMemo(
    () => comparisonRows.filter((r) => classifyPayrollRoleTier(r.position, r.jobTitle) === 'اپراتور'),
    [comparisonRows]
  );

  const operatorStat = useMemo(
    () => roleTierStats.find((s) => s.key === 'اپراتور'),
    [roleTierStats]
  );

  const operatorDeptStats = useMemo(
    () => computeGroupAnalytics(operatorRows, (r) => r.department || 'واحد نامشخص', metricBasis),
    [operatorRows, metricBasis]
  );

  const departmentStats = useMemo(
    () => computeGroupAnalytics(comparisonRows, (r) => r.department || 'سایر واحدها', metricBasis),
    [comparisonRows, metricBasis]
  );

  const workLocationStats = useMemo(
    () => computeGroupAnalytics(comparisonRows, (r) => r.workLocation || 'محل خدمت نامشخص', metricBasis),
    [comparisonRows, metricBasis]
  );

  // Metric-aware KPI Aggregates
  const totalCurrentNet = comparisonRows.reduce((s, r) => s + r.currentNet, 0);
  const totalPrevNet = comparisonRows.reduce((s, r) => s + r.previousNet, 0);
  const totalBenefitsAll = comparisonRows.reduce((s, r) => s + r.totalBenefits, 0);
  const totalPrevBenefitsAll = comparisonRows.reduce((s, r) => s + r.previousBenefits, 0);

  const totalCurrentMetric = metricBasis === 'totalBenefits' ? totalBenefitsAll : totalCurrentNet;
  const totalPrevMetric = metricBasis === 'totalBenefits' ? totalPrevBenefitsAll : totalPrevNet;
  const totalDiffMetric = totalCurrentMetric - totalPrevMetric;
  const overallGrowth = totalPrevMetric > 0 ? Number(((totalDiffMetric / totalPrevMetric) * 100).toFixed(1)) : 0;

  const totalDeductionsAll = comparisonRows.reduce((s, r) => s + r.totalDeductions, 0);
  const totalTaxAll = comparisonRows.reduce((s, r) => s + r.taxAmount, 0);

  const countIncreased = comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'increase').length;
  const countDecreased = comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'decrease').length;
  const countNew = comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'new').length;
  const countUnchanged = comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'unchanged').length;

  // Top movers (metric-aware)
  const topIncreases = useMemo(
    () =>
      [...comparisonRows]
        .filter((r) => r.previousRecord && getRowMetricValues(r, metricBasis).diff > 0)
        .sort((a, b) => getRowMetricValues(b, metricBasis).diff - getRowMetricValues(a, metricBasis).diff)
        .slice(0, 8),
    [comparisonRows, metricBasis]
  );
  const topDecreases = useMemo(
    () =>
      [...comparisonRows]
        .filter((r) => r.previousRecord && getRowMetricValues(r, metricBasis).diff < 0)
        .sort((a, b) => getRowMetricValues(a, metricBasis).diff - getRowMetricValues(b, metricBasis).diff)
        .slice(0, 8),
    [comparisonRows, metricBasis]
  );

  const openDrilldown = (slice: PayrollSliceInfo) => {
    if (slice.rows.length === 0) return;
    setDrilldownSlice(slice);
    setDrilldownTrendFilter(slice.defaultTrendFilter || 'all');
    setDrilldownSearch('');
  };

  const drilldownFilteredRows = useMemo(() => {
    if (!drilldownSlice) return [];
    const q = drilldownSearch.trim().toLowerCase();
    return drilldownSlice.rows.filter((r) => {
      const m = getRowMetricValues(r, metricBasis);
      const matchesTrend =
        drilldownTrendFilter === 'all'
          ? true
          : drilldownTrendFilter === 'decrease'
          ? m.trend === 'decrease'
          : drilldownTrendFilter === 'increase'
          ? m.trend === 'increase'
          : m.trend === 'new' || m.trend === 'unchanged';
      const matchesSearch =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.personnelCode.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.workLocation.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q) ||
        r.jobTitle.toLowerCase().includes(q);
      return matchesTrend && matchesSearch;
    });
  }, [drilldownSlice, drilldownTrendFilter, drilldownSearch, metricBasis]);

  const hoverStats = useMemo(() => {
    if (!hoveredSlice || hoveredSlice.rows.length === 0) return null;
    const rows = hoveredSlice.rows;
    let currTotal = 0;
    let prevTotal = 0;
    let inc = 0;
    let dec = 0;
    let nw = 0;
    let maxVal = -Infinity;
    let minVal = Infinity;
    rows.forEach((r) => {
      const m = getRowMetricValues(r, metricBasis);
      currTotal += m.curr;
      prevTotal += m.prev;
      if (m.trend === 'increase') inc++;
      else if (m.trend === 'decrease') dec++;
      else if (m.trend === 'new') nw++;
      if (m.curr > maxVal) maxVal = m.curr;
      if (m.curr > 0 && m.curr < minVal) minVal = m.curr;
    });
    if (minVal === Infinity) minVal = 0;
    if (maxVal === -Infinity) maxVal = 0;
    const avg = Math.round(currTotal / rows.length);
    const diff = currTotal - prevTotal;
    // Pick sample personnel: prioritize decreases if any, else biggest absolute movers
    const samples = [...rows]
      .sort((a, b) => {
        const ma = getRowMetricValues(a, metricBasis);
        const mb = getRowMetricValues(b, metricBasis);
        if (dec > 0 && ma.diff < 0 && mb.diff >= 0) return -1;
        if (dec > 0 && mb.diff < 0 && ma.diff >= 0) return 1;
        return Math.abs(mb.diff) - Math.abs(ma.diff);
      })
      .slice(0, 4);
    return { count: rows.length, currTotal, prevTotal, diff, avg, maxVal, minVal, inc, dec, nw, samples };
  }, [hoveredSlice, metricBasis]);

  // Selection helpers
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedIds.includes(r.recordId));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredRows.map((r) => r.recordId));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...filteredRows.map((r) => r.recordId)]);
      setSelectedIds(Array.from(merged));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = await onBatchDeletePayroll(selectedIds);
    if (ok) {
      setSelectedIds([]);
      setConfirmBatchDeleteOpen(false);
    }
  };

  // Smart Excel import handler
  const handleSmartPayrollImport = async (mappedRows: Record<string, any>[]) => {
    if (mappedRows.length === 0) return;
    const ok = await onBatchImportPayroll(importPeriod, mappedRows, useRowYearMonth);
    if (ok) {
      setIsImportOpen(false);
      let targetP = importPeriod;
      if (useRowYearMonth && mappedRows[0]) {
        const firstYm = getPayrollField(mappedRows[0], 'سال/ماه');
        targetP = parseYearMonthToPeriod(firstYm, importPeriod);
      }
      const parsed = parsePeriod(targetP);
      setCurrentYear(parsed.year);
      setCurrentMonthIndex(parsed.monthIndex);

      const prevP = getPreviousPeriodId(targetP);
      const prevParsed = parsePeriod(prevP);
      setPrevYear(prevParsed.year);
      setPrevMonthIndex(prevParsed.monthIndex);
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!deleteRecordTarget) return;
    await onDeletePayrollRecord(deleteRecordTarget.recordId);
    setDeleteRecordTarget(null);
  };

  const handleConfirmClearPeriod = async () => {
    await onDeletePayrollPeriod(currentPeriod);
    setConfirmClearPeriod(false);
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllPayroll) return;
    const ok = await onDeleteAllPayroll();
    if (ok) {
      setSelectedIds([]);
      setConfirmDeleteAllOpen(false);
    }
  };

  const handlePrintComparisonPayslip = (row: PayrollComparisonRow) => {
    setPrintFallbackHint(false);
    printPayrollComparisonSheet(
      row,
      getPeriodLabel(currentPeriod),
      getPeriodLabel(previousPeriod),
      () => setPrintFallbackHint(true)
    );
  };

  const renderAnalyticsTable = (
    stats: PayrollGroupStat[],
    dimensionLabel: string,
    getRowsForKey: (key: string) => PayrollComparisonRow[],
    onFilterClick: (key: string) => void
  ) => (
    <div className="responsive-table-container border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-right text-xs min-w-[1060px]">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
          <tr>
            <th className="py-2.5 px-3">{dimensionLabel}</th>
            <th className="py-2.5 px-2.5 text-center">تعداد و روند</th>
            <th className="py-2.5 px-3 bg-slate-100/70">میانگین {metricLabel} قبل</th>
            <th className="py-2.5 px-3 bg-indigo-50/60 text-indigo-900">میانگین {metricLabel} جدید</th>
            <th className="py-2.5 px-3">بیشترین (ماه جدید)</th>
            <th className="py-2.5 px-3">کمترین (ماه جدید)</th>
            <th className="py-2.5 px-3">جمع کل ماه قبل</th>
            <th className="py-2.5 px-3">جمع کل ماه جدید</th>
            <th className="py-2.5 px-2.5 text-center">تغییر جمع و جزئیات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 persian-num">
          {stats.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-slate-500">
                اطلاعاتی برای تحلیل در این دوره ثبت نشده است.
              </td>
            </tr>
          ) : (
            stats.map((s) => {
              const sliceRows = getRowsForKey(s.key);
              const sliceTitle = `${dimensionLabel}: ${s.key}`;
              const sliceSubtitle = `مبنای مقایسه: ${metricLabel} (${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)})`;
              return (
                <tr
                  key={s.key}
                  onMouseEnter={() =>
                    s.count > 0 &&
                    setHoveredSlice({
                      title: sliceTitle,
                      subtitle: sliceSubtitle,
                      rows: sliceRows,
                    })
                  }
                  onMouseLeave={() => setHoveredSlice(null)}
                  onClick={() =>
                    s.count > 0 &&
                    openDrilldown({
                      title: sliceTitle,
                      subtitle: sliceSubtitle,
                      rows: sliceRows,
                      defaultTrendFilter: s.diffTotal < 0 && s.decreasedCount > 0 ? 'decrease' : 'all',
                      onApplyTableFilter: () => onFilterClick(s.key),
                    })
                  }
                  className={`transition-colors ${s.count > 0 ? 'hover:bg-indigo-50/50 cursor-pointer' : 'opacity-60'}`}
                  title={s.count > 0 ? 'کلیک برای مشاهده جزئیات کامل پرسنل این دسته' : ''}
                >
                  <td className="py-2.5 px-3 font-bold text-slate-900">
                    <div>{s.key}</div>
                    {s.diffTotal < 0 && (
                      <span className="inline-block mt-0.5 text-[10px] text-rose-700 font-bold">
                        کاهش جمع {metricLabel} نسبت به ماه قبل
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5 text-center">
                    <div className="font-bold text-indigo-700">{toPersianDigits(s.count)} نفر</div>
                    <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px]">
                      {s.increasedCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrilldown({
                              title: `افزایشی‌های ${s.key}`,
                              subtitle: sliceSubtitle,
                              rows: sliceRows,
                              defaultTrendFilter: 'increase',
                              onApplyTableFilter: () => onFilterClick(s.key),
                            });
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100"
                        >
                          +{toPersianDigits(s.increasedCount)}
                        </button>
                      )}
                      {s.decreasedCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrilldown({
                              title: `کاهشی‌های ${s.key}`,
                              subtitle: sliceSubtitle,
                              rows: sliceRows,
                              defaultTrendFilter: 'decrease',
                              onApplyTableFilter: () => onFilterClick(s.key),
                            });
                          }}
                          className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100"
                        >
                          -{toPersianDigits(s.decreasedCount)} کاهش
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{formatRial(s.prevAvg)}</td>
                  <td className="py-2.5 px-3 font-bold text-indigo-900">{formatRial(s.currAvg)}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-emerald-700">{formatRial(s.maxCurr)}</div>
                    {s.count > 0 && <div className="text-[10px] text-slate-500">{s.maxPersonName}</div>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-amber-700">{formatRial(s.minCurr)}</div>
                    {s.count > 0 && <div className="text-[10px] text-slate-500">{s.minPersonName}</div>}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{formatRial(s.prevTotal)}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{formatRial(s.currTotal)}</td>
                  <td className="py-2.5 px-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] ${
                          s.diffTotal > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : s.diffTotal < 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.diffTotal > 0 ? '+' : ''}
                        {formatPercent(s.growthPercent)}
                      </span>
                      {s.count > 0 && (
                        <span className="text-[10px] text-indigo-600 font-semibold inline-flex items-center gap-0.5">
                          <Eye className="w-3 h-3" /> جزئیات پرسنل
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="no-print bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              سیستم جامع حقوق و دستمزد و تحلیل مقایسه‌ای ماه قبل و جدید
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            تحلیل تفکیکی بر اساس رده (کارشناس، مسئول، رئیس، مدیر، اپراتورها)، واحد سازمانی و محل خدمت با آمار بیشترین، کمترین و میانگین + تمامی {toPersianDigits(PAYROLL_EXCEL_COLUMNS.length)} ستون حقوق
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowExport && (
            <>
              <button
                onClick={() =>
                  exportPayrollAnalyticsToExcel(
                    roleTierStats,
                    departmentStats,
                    workLocationStats,
                    operatorRows,
                    getPeriodLabel(currentPeriod),
                    getPeriodLabel(previousPeriod),
                    metricBasis
                  )
                }
                disabled={comparisonRows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-800 rounded-xl text-xs font-bold transition-colors border border-violet-200 disabled:opacity-50"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>اکسل آنالیز ({metricLabel})</span>
              </button>

              <button
                onClick={() =>
                  exportPayrollComparisonToExcel(
                    filteredRows,
                    getPeriodLabel(currentPeriod),
                    getPeriodLabel(previousPeriod),
                    metricBasis
                  )
                }
                disabled={filteredRows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors border border-emerald-200 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>خروجی مقایسه ({toPersianDigits(filteredRows.length)})</span>
              </button>

              <button
                onClick={() =>
                  exportFullPayrollToExcel(currentRecords, getPeriodLabel(currentPeriod))
                }
                disabled={currentRecords.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-bold transition-colors border border-indigo-200 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>خروجی کامل {toPersianDigits(PAYROLL_EXCEL_COLUMNS.length)} ستون</span>
              </button>
            </>
          )}

          {allowImport && (
            <button
              onClick={() => {
                setImportYear(currentYear);
                setImportMonthIndex(currentMonthIndex);
                setIsImportOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>آپلود هوشمند اکسل حقوق</span>
            </button>
          )}

          <button
            onClick={downloadPayrollTemplate}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود نمونه اکسل حقوق</span>
          </button>

          {allowDeleteAll && onDeleteAllPayroll && payrollList.length > 0 && (
            <button
              onClick={() => setConfirmDeleteAllOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف کامل جدول حقوق</span>
            </button>
          )}
        </div>
      </div>

      {/* Period Selection Bar */}
      <div className="no-print bg-slate-900 text-white p-4.5 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 px-2.5 rounded-xl border border-slate-700">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-white whitespace-nowrap">حقوق ماه جدید:</span>
              <select
                value={currentMonthIndex}
                onChange={(e) => setCurrentMonthIndex(Number(e.target.value))}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-indigo-400"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(e.target.value)}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-indigo-400 persian-num"
              >
                {YEARS_LIST.map((y) => (
                  <option key={y} value={y}>{toPersianDigits(y)}</option>
                ))}
              </select>
            </div>

            <ArrowLeftRight className="w-4 h-4 text-slate-500 hidden sm:inline" />

            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 px-2.5 rounded-xl border border-slate-700">
              <span className="font-bold text-amber-300 whitespace-nowrap">ماه قبل (مبنای مقایسه):</span>
              <select
                value={prevMonthIndex}
                onChange={(e) => setPrevMonthIndex(Number(e.target.value))}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-amber-400"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={prevYear}
                onChange={(e) => setPrevYear(e.target.value)}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-amber-400 persian-num"
              >
                {YEARS_LIST.map((y) => (
                  <option key={y} value={y}>{toPersianDigits(y)}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAutoSetPreviousMonth}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ماه قبل از این</span>
            </button>

            {canDelete && currentRecords.length > 0 && (
              <button
                onClick={() => setConfirmClearPeriod(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>پاک‌کردن دوره جاری</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[11px]">
              تحلیل مقایسه‌ای <b>{getPeriodLabel(previousPeriod)}</b> با <b>{getPeriodLabel(currentPeriod)}</b>
            </span>
          </div>
        </div>

        {availablePeriods.length > 0 && (
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 font-semibold">دوره‌های حقوق بارگذاری‌شده در سرور:</span>
            {availablePeriods.map((pId) => (
              <button
                key={pId}
                onClick={() => handleSelectSavedPeriod(pId)}
                className={`px-2.5 py-0.5 rounded-lg font-bold transition-colors persian-num ${
                  pId === currentPeriod
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {getPeriodLabel(pId)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Analysis Metric Basis Selector + KPI Strip */}
      <div className="no-print bg-white p-4 rounded-2xl border border-indigo-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-slate-900">تعیین مبنای محاسبه و آنالیز مقایسه‌ای حقوق</div>
            <div className="text-[11px] text-slate-500">
              انتخاب کنید تمامی شاخص‌های بیشترین، کمترین، میانگین، جمع کل، رده‌ها و واحدها بر چه اساسی تحلیل شوند:
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setMetricBasis('netPayable')}
            className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
              metricBasis === 'netPayable'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            بر اساس خالص پرداختی پرسنل
          </button>
          <button
            type="button"
            onClick={() => setMetricBasis('totalBenefits')}
            className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
              metricBasis === 'totalBenefits'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            بر اساس جمع مزایا
          </button>
        </div>
      </div>

      {/* KPI Strip (Interactive Hover + Click Drilldown) */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onMouseEnter={() =>
            setHoveredSlice({
              title: `پرسنل دارای سابقه در ${getPeriodLabel(previousPeriod)}`,
              subtitle: `مبنا: ${metricLabel}`,
              rows: comparisonRows.filter((r) => Boolean(r.previousRecord)),
            })
          }
          onMouseLeave={() => setHoveredSlice(null)}
          onClick={() =>
            openDrilldown({
              title: `مقایسه پرسنل دارای سابقه ماه قبل (${getPeriodLabel(previousPeriod)})`,
              subtitle: `مبنای محاسبه: ${metricLabel}`,
              rows: comparisonRows.filter((r) => Boolean(r.previousRecord)),
            })
          }
          className="text-right bg-white hover:border-indigo-300 p-4 rounded-xl border border-slate-200 shadow-xs transition-all"
        >
          <span className="text-xs text-slate-600 block">
            جمع {metricLabel} {getPeriodLabel(previousPeriod)}
          </span>
          <span className="text-lg font-bold text-slate-700 mt-1 block persian-num">
            {formatRial(totalPrevMetric)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block persian-num">
            تعداد رکورد ماه قبل: {toPersianDigits(previousRecords.length)} نفر
          </span>
        </button>

        <button
          type="button"
          onMouseEnter={() =>
            setHoveredSlice({
              title: `کل پرسنل ${getPeriodLabel(currentPeriod)}`,
              subtitle: `مبنای مقایسه: ${metricLabel}`,
              rows: comparisonRows,
            })
          }
          onMouseLeave={() => setHoveredSlice(null)}
          onClick={() =>
            openDrilldown({
              title: `کل پرسنل ${getPeriodLabel(currentPeriod)} — تحلیل ${metricLabel}`,
              subtitle: `${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)}`,
              rows: comparisonRows,
            })
          }
          className="text-right bg-white hover:border-indigo-300 p-4 rounded-xl border border-slate-200 shadow-xs transition-all"
        >
          <span className="text-xs text-slate-600 block">
            جمع {metricLabel} {getPeriodLabel(currentPeriod)}
          </span>
          <span className={`text-lg font-bold mt-1 block persian-num ${metricBasis === 'totalBenefits' ? 'text-emerald-700' : 'text-indigo-700'}`}>
            {formatRial(totalCurrentMetric)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block persian-num">
            {metricBasis === 'totalBenefits'
              ? `خالص پرداختی کل: ${formatRial(totalCurrentNet)}`
              : `جمع مزایا کل: ${formatRial(totalBenefitsAll)}`}
          </span>
        </button>

        <button
          type="button"
          onMouseEnter={() =>
            setHoveredSlice({
              title: `تغییرات ${metricLabel} نسبت به ماه قبل`,
              subtitle: totalDiffMetric < 0 ? 'اولویت نمایش افراد کاهشی' : 'اولویت نمایش بیشترین تغییر',
              rows: comparisonRows.filter((r) => Boolean(r.previousRecord)),
            })
          }
          onMouseLeave={() => setHoveredSlice(null)}
          onClick={() =>
            openDrilldown({
              title: `تحلیل تغییرات ${metricLabel} پرسنل`,
              subtitle: `اختلاف ${getPeriodLabel(previousPeriod)} تا ${getPeriodLabel(currentPeriod)}`,
              rows: comparisonRows.filter((r) => Boolean(r.previousRecord)),
              defaultTrendFilter: totalDiffMetric < 0 ? 'decrease' : 'all',
            })
          }
          className="text-right bg-white hover:border-indigo-300 p-4 rounded-xl border border-slate-200 shadow-xs transition-all"
        >
          <span className="text-xs text-slate-600 block">
            تغییرات {metricLabel} و درصد رشد
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-lg font-bold persian-num ${totalDiffMetric >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {totalDiffMetric >= 0 ? `+${formatRial(totalDiffMetric)}` : formatRial(totalDiffMetric)}
            </span>
          </div>
          <span className={`text-[11px] font-bold mt-1 inline-flex items-center gap-1 persian-num ${overallGrowth >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {overallGrowth >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            نسبت به ماه قبل: {formatPercent(overallGrowth)}
          </span>
        </button>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            کسور، مالیات و روند پرسنل ({metricLabel})
          </span>
          <div className="text-sm font-bold text-rose-700 mt-1 persian-num">
            کسور: {formatRial(totalDeductionsAll)}
          </div>
          <div className="text-[11px] text-slate-600 mt-1.5 flex flex-wrap items-center gap-2 persian-num">
            <span>مالیات: {formatRial(totalTaxAll)}</span>
            <button
              type="button"
              onMouseEnter={() =>
                setHoveredSlice({
                  title: `پرسنل افزایشی (${metricLabel})`,
                  subtitle: `${toPersianDigits(countIncreased)} نفر`,
                  rows: comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'increase'),
                })
              }
              onMouseLeave={() => setHoveredSlice(null)}
              onClick={() =>
                openDrilldown({
                  title: `فهرست پرسنل افزایشی (${metricLabel})`,
                  subtitle: `${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)}`,
                  rows: comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'increase'),
                  defaultTrendFilter: 'increase',
                })
              }
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100"
            >
              افزایش: {toPersianDigits(countIncreased)}
            </button>
            <button
              type="button"
              onMouseEnter={() =>
                setHoveredSlice({
                  title: `پرسنل کاهشی (${metricLabel})`,
                  subtitle: `${toPersianDigits(countDecreased)} نفر`,
                  rows: comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'decrease'),
                })
              }
              onMouseLeave={() => setHoveredSlice(null)}
              onClick={() =>
                openDrilldown({
                  title: `فهرست پرسنل کاهشی (${metricLabel})`,
                  subtitle: `${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)}`,
                  rows: comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'decrease'),
                  defaultTrendFilter: 'decrease',
                })
              }
              className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100"
            >
              کاهش: {toPersianDigits(countDecreased)}
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Dimensional Comparative Analytics Section */}
      {comparisonRows.length > 0 && (
        <div className="no-print bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  آنالیز مقایسه‌ای ماه قبل و جدید بر اساس <span className="text-indigo-700">«{metricLabel}»</span> (بیشترین، کمترین، میانگین و جمع کل)
                </h3>
                <p className="text-[11px] text-slate-500">
                  با بردن ماوس روی هر آیتم، خلاصه جزئیات و نفرات نمونه نمایش داده می‌شود و با کلیک روی آن، پنجره لیست کامل پرسنل باز می‌گردد
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { id: 'roles', label: 'مدیر / رئیس / مسئول / کارشناس / اپراتور', icon: Users },
                { id: 'operators', label: `آنالیز تخصصی اپراتورها (${toPersianDigits(operatorRows.length)})`, icon: Wrench },
                { id: 'departments', label: `واحدهای سازمانی (${toPersianDigits(departmentStats.length)})`, icon: Building2 },
                { id: 'locations', label: `محل‌های خدمت (${toPersianDigits(workLocationStats.length)})`, icon: MapPin },
                { id: 'movers', label: 'بیشترین افزایش و کاهش', icon: Sparkles },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setAnalyticsTab(t.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors ${
                      analyticsTab === t.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Hover Preview Bar */}
          {hoveredSlice && hoverStats && (
            <div className="mx-4 mt-4 p-3.5 bg-slate-900 text-white rounded-xl border border-indigo-500/40 shadow-md text-xs space-y-2 persian-num">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-bold text-white">{hoveredSlice.title}</span>
                  <span className="text-[11px] text-slate-300">({hoveredSlice.subtitle})</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 font-bold">
                  برای مشاهده فهرست کامل پرسنل و خروجی اکسل کلیک کنید
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px] bg-slate-800/80 p-2 rounded-lg">
                <div>تعداد: <b>{toPersianDigits(hoverStats.count)} نفر</b></div>
                <div className="text-emerald-300">افزایش: <b>{toPersianDigits(hoverStats.inc)}</b></div>
                <div className="text-rose-300">کاهش: <b>{toPersianDigits(hoverStats.dec)}</b></div>
                <div>میانگین: <b>{formatRial(hoverStats.avg, false)}</b></div>
                <div>بیشترین: <b>{formatRial(hoverStats.maxVal, false)}</b></div>
                <div className={hoverStats.diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  اختلاف جمع: <b>{hoverStats.diff >= 0 ? `+${formatRial(hoverStats.diff, false)}` : formatRial(hoverStats.diff, false)}</b>
                </div>
              </div>
              {hoverStats.samples.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                  {hoverStats.samples.map((sr) => {
                    const sm = getRowMetricValues(sr, metricBasis);
                    return (
                      <div key={sr.recordId} className="bg-slate-800/60 px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 border border-slate-700/80">
                        <div className="truncate">
                          <span className="font-bold text-white">{sr.fullName}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{sr.department || sr.position || '—'}</span>
                        </div>
                        <span className={`font-bold shrink-0 ${sm.diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {sm.diff >= 0 ? `+${formatRial(sm.diff, false)}` : formatRial(sm.diff, false)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="p-4 sm:p-5 space-y-4">
            {analyticsTab === 'roles' && (
              <div className="space-y-4">
                {/* Summary Cards for مدیر، رئیس، مسئول، کارشناس، اپراتور */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {roleTierStats
                    .filter((s) => ['مدیر', 'رئیس', 'مسئول', 'کارشناس', 'اپراتور'].includes(s.key) || s.count > 0)
                    .map((s) => {
                      const active = filterRoleTier === s.key;
                      const tierRows = comparisonRows.filter(
                        (r) => classifyPayrollRoleTier(r.position, r.jobTitle) === s.key
                      );
                      return (
                        <button
                          key={s.key}
                          onMouseEnter={() =>
                            s.count > 0 &&
                            setHoveredSlice({
                              title: `رده سازمانی: ${s.key}`,
                              subtitle: `مبنای مقایسه: ${metricLabel}`,
                              rows: tierRows,
                            })
                          }
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={() =>
                            openDrilldown({
                              title: `جزئیات پرسنل رده «${s.key}»`,
                              subtitle: `بر اساس ${metricLabel} (${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)})`,
                              rows: tierRows,
                              onApplyTableFilter: () => setFilterRoleTier(active ? 'all' : s.key),
                            })
                          }
                          className={`text-right p-3.5 rounded-xl border transition-all space-y-1.5 persian-num ${
                            active
                              ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200'
                              : 'bg-slate-50/70 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-sm text-slate-900">{s.key}</span>
                            <span className="text-[11px] font-bold bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-indigo-700">
                              {toPersianDigits(s.count)} نفر
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            میانگین جدید: <b className="text-slate-900">{formatRial(s.currAvg)}</b>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            میانگین قبل: {formatRial(s.prevAvg)}
                          </div>
                          <div className="pt-1 border-t border-slate-200/80 flex items-center justify-between text-[10px]">
                            <span className="text-emerald-700 font-bold">بیشترین: {formatRial(s.maxCurr, false)}</span>
                            <span className="text-amber-700 font-bold">کمترین: {formatRial(s.minCurr, false)}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>

                {renderAnalyticsTable(
                  roleTierStats,
                  'رده سازمانی (پست / شغل)',
                  (key) => comparisonRows.filter((r) => classifyPayrollRoleTier(r.position, r.jobTitle) === key),
                  (key) => setFilterRoleTier((prev) => (prev === key ? 'all' : key))
                )}
              </div>
            )}

            {analyticsTab === 'operators' && (
              <div className="space-y-4">
                {operatorRows.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-600">
                    در دوره انتخاب‌شده ردیفی با عنوان شغلی یا پست «اپراتور» یافت نشد. برای مشاهده آنالیز، فایل حقوق شامل پرسنل اپراتور را بارگذاری کنید.
                  </div>
                ) : (
                  <>
                    {/* Operator KPI Cards: Min / Max / Avg / Total */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 persian-num">
                      <button
                        type="button"
                        onMouseEnter={() =>
                          setHoveredSlice({
                            title: 'مجموع دریافتی اپراتورها',
                            subtitle: `مبنا: ${metricLabel}`,
                            rows: operatorRows,
                          })
                        }
                        onMouseLeave={() => setHoveredSlice(null)}
                        onClick={() =>
                          openDrilldown({
                            title: `تمامی اپراتورها (${toPersianDigits(operatorRows.length)} نفر)`,
                            subtitle: `مبنای مقایسه: ${metricLabel}`,
                            rows: operatorRows,
                          })
                        }
                        className="text-right p-3.5 bg-indigo-50/60 hover:bg-indigo-100/60 border border-indigo-200 rounded-xl transition-colors"
                      >
                        <span className="text-[11px] text-indigo-800 block font-semibold">تعداد و مجموع {metricLabel} اپراتورها</span>
                        <div className="text-base font-extrabold text-indigo-950 mt-1">
                          {formatRial(operatorStat?.currTotal || 0)}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          {toPersianDigits(operatorRows.length)} اپراتور | قبل: {formatRial(operatorStat?.prevTotal || 0)}
                        </div>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() =>
                          setHoveredSlice({
                            title: 'میانگین دریافتی اپراتورها',
                            subtitle: `مبنا: ${metricLabel}`,
                            rows: operatorRows,
                          })
                        }
                        onMouseLeave={() => setHoveredSlice(null)}
                        onClick={() =>
                          openDrilldown({
                            title: `مقایسه میانگین ${metricLabel} اپراتورها`,
                            subtitle: `${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)}`,
                            rows: operatorRows,
                          })
                        }
                        className="text-right p-3.5 bg-violet-50/60 hover:bg-violet-100/60 border border-violet-200 rounded-xl transition-colors"
                      >
                        <span className="text-[11px] text-violet-800 block font-semibold">میانگین {metricLabel} اپراتورها</span>
                        <div className="text-base font-extrabold text-violet-950 mt-1">
                          {formatRial(operatorStat?.currAvg || 0)}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          میانگین قبل: {formatRial(operatorStat?.prevAvg || 0)} ({formatPercent(operatorStat?.avgGrowthPercent || 0)})
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const maxR = [...operatorRows].sort((a, b) => getRowMetricValues(b, metricBasis).curr - getRowMetricValues(a, metricBasis).curr)[0];
                          if (maxR) { setSelectedRow(maxR); setDetailTab('summary'); setPrintFallbackHint(false); }
                        }}
                        className="text-right p-3.5 bg-emerald-50/60 hover:bg-emerald-100/60 border border-emerald-200 rounded-xl transition-colors"
                      >
                        <span className="text-[11px] text-emerald-800 block font-semibold">بیشترین {metricLabel} در اپراتورها</span>
                        <div className="text-base font-extrabold text-emerald-900 mt-1">
                          {formatRial(operatorStat?.maxCurr || 0)}
                        </div>
                        <div className="text-[11px] text-emerald-800 font-bold mt-1">
                          {operatorStat?.maxPersonName} (کد {toPersianDigits(operatorStat?.maxPersonCode || '')})
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const positive = operatorRows.filter((r) => getRowMetricValues(r, metricBasis).curr > 0);
                          const targetList = positive.length > 0 ? positive : operatorRows;
                          const minR = [...targetList].sort((a, b) => getRowMetricValues(a, metricBasis).curr - getRowMetricValues(b, metricBasis).curr)[0];
                          if (minR) { setSelectedRow(minR); setDetailTab('summary'); setPrintFallbackHint(false); }
                        }}
                        className="text-right p-3.5 bg-amber-50/60 hover:bg-amber-100/60 border border-amber-200 rounded-xl transition-colors"
                      >
                        <span className="text-[11px] text-amber-800 block font-semibold">کمترین {metricLabel} در اپراتورها</span>
                        <div className="text-base font-extrabold text-amber-900 mt-1">
                          {formatRial(operatorStat?.minCurr || 0)}
                        </div>
                        <div className="text-[11px] text-amber-800 font-bold mt-1">
                          {operatorStat?.minPersonName} (کد {toPersianDigits(operatorStat?.minPersonCode || '')})
                        </div>
                      </button>
                    </div>

                    {/* Operators by Department */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 mb-2">تفکیک {metricLabel} اپراتورها بر اساس واحد سازمانی</h4>
                      {renderAnalyticsTable(
                        operatorDeptStats,
                        'واحد (اپراتورها)',
                        (key) => operatorRows.filter((r) => (r.department || 'واحد نامشخص') === key),
                        (key) => {
                          setFilterRoleTier('اپراتور');
                          setFilterDepartment(key);
                        }
                      )}
                    </div>

                    {/* Individual Operator Comparison Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
                        فهرست مقایسه‌ای تک‌تک اپراتورها بر اساس {metricLabel} (کلیک برای مشاهده فیش ۲۲۶ ستونی)
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-700 font-bold">
                            <tr>
                              <th className="p-2">کد</th>
                              <th className="p-2">نام و نام خانوادگی</th>
                              <th className="p-2">پست / شغل</th>
                              <th className="p-2">واحد / محل خدمت</th>
                              <th className="p-2">{metricLabel} ماه قبل</th>
                              <th className="p-2">{metricLabel} ماه جدید</th>
                              <th className="p-2">تغییر</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 persian-num">
                            {[...operatorRows]
                              .sort((a, b) => getRowMetricValues(b, metricBasis).curr - getRowMetricValues(a, metricBasis).curr)
                              .map((r) => {
                                const m = getRowMetricValues(r, metricBasis);
                                return (
                                  <tr
                                    key={r.recordId}
                                    onClick={() => { setSelectedRow(r); setDetailTab('summary'); setPrintFallbackHint(false); }}
                                    className="hover:bg-indigo-50/40 cursor-pointer"
                                  >
                                    <td className="p-2 font-bold">{toPersianDigits(r.personnelCode)}</td>
                                    <td className="p-2 font-bold text-slate-900">{r.fullName}</td>
                                    <td className="p-2">{r.position || r.jobTitle}</td>
                                    <td className="p-2 text-slate-600">{r.department || '—'} / {r.workLocation || '—'}</td>
                                    <td className="p-2 text-slate-600">{formatRial(m.prev)}</td>
                                    <td className="p-2 font-bold text-indigo-800">{formatRial(m.curr)}</td>
                                    <td className={`p-2 font-bold ${m.diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                      {m.diff >= 0 ? `+${formatRial(m.diff)}` : formatRial(m.diff)} ({formatPercent(m.diffPercent)})
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {analyticsTab === 'departments' && (
              renderAnalyticsTable(
                departmentStats,
                'واحد سازمانی',
                (key) => comparisonRows.filter((r) => (r.department || 'سایر واحدها') === key),
                (key) => setFilterDepartment((prev) => (prev === key ? 'all' : key))
              )
            )}

            {analyticsTab === 'locations' && (
              renderAnalyticsTable(
                workLocationStats,
                'محل خدمت',
                (key) => comparisonRows.filter((r) => (r.workLocation || 'محل خدمت نامشخص') === key),
                (key) => setFilterWorkLocation((prev) => (prev === key ? 'all' : key))
              )
            )}

            {analyticsTab === 'movers' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700">بیشترین افزایش {metricLabel} نسبت به ماه قبل</span>
                    <button
                      type="button"
                      onClick={() =>
                        openDrilldown({
                          title: `همه موارد افزایشی (${metricLabel})`,
                          subtitle: `${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)}`,
                          rows: comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'increase'),
                          defaultTrendFilter: 'increase',
                        })
                      }
                      className="text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      مشاهده همه ({toPersianDigits(countIncreased)} نفر)
                    </button>
                  </div>
                  {topIncreases.length === 0 ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-500">مورد افزایشی در مقایسه یافت نشد.</div>
                  ) : (
                    topIncreases.map((r) => {
                      const m = getRowMetricValues(r, metricBasis);
                      return (
                        <button
                          key={r.recordId}
                          onMouseEnter={() =>
                            setHoveredSlice({
                              title: `تغییر افزایشی: ${r.fullName}`,
                              subtitle: `${r.position || r.jobTitle} · ${r.department}`,
                              rows: [r],
                            })
                          }
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={() => { setSelectedRow(r); setDetailTab('summary'); setPrintFallbackHint(false); }}
                          className="w-full text-right p-2.5 bg-emerald-50/70 hover:bg-emerald-100/70 rounded-xl border border-emerald-200 transition-colors flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{r.fullName}</div>
                            <div className="text-[10px] text-slate-600">{r.position || r.jobTitle} · {r.department}</div>
                          </div>
                          <div className="text-emerald-800 font-bold persian-num text-left">
                            +{formatRial(m.diff)} ({formatPercent(m.diffPercent)})
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700">بیشترین کاهش {metricLabel} نسبت به ماه قبل</span>
                    <button
                      type="button"
                      onClick={() =>
                        openDrilldown({
                          title: `همه موارد کاهشی (${metricLabel})`,
                          subtitle: `${getPeriodLabel(previousPeriod)} ↔ ${getPeriodLabel(currentPeriod)}`,
                          rows: comparisonRows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'decrease'),
                          defaultTrendFilter: 'decrease',
                        })
                      }
                      className="text-[11px] font-bold text-rose-700 hover:underline"
                    >
                      مشاهده همه ({toPersianDigits(countDecreased)} نفر)
                    </button>
                  </div>
                  {topDecreases.length === 0 ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-500">مورد کاهشی در مقایسه یافت نشد.</div>
                  ) : (
                    topDecreases.map((r) => {
                      const m = getRowMetricValues(r, metricBasis);
                      return (
                        <button
                          key={r.recordId}
                          onMouseEnter={() =>
                            setHoveredSlice({
                              title: `تغییر کاهشی: ${r.fullName}`,
                              subtitle: `${r.position || r.jobTitle} · ${r.department}`,
                              rows: [r],
                            })
                          }
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={() => { setSelectedRow(r); setDetailTab('summary'); setPrintFallbackHint(false); }}
                          className="w-full text-right p-2.5 bg-rose-50/70 hover:bg-rose-100/70 rounded-xl border border-rose-200 transition-colors flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{r.fullName}</div>
                            <div className="text-[10px] text-slate-600">{r.position || r.jobTitle} · {r.department}</div>
                          </div>
                          <div className="text-rose-800 font-bold persian-num text-left">
                            {formatRial(m.diff)} ({formatPercent(m.diffPercent)})
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="no-print grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="md:col-span-4 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو نام، کد پرسنلی، کد ملی، شغل، پست، واحد..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2">
          <select
            value={filterRoleTier}
            onChange={(e) => setFilterRoleTier(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-semibold"
          >
            <option value="all">همه رده‌ها</option>
            {ROLE_TIER_ORDER.map((tier) => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={filterTrend}
            onChange={(e) => setFilterTrend(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">همه روندها ({toPersianDigits(comparisonRows.length)})</option>
            <option value="increase">افزایشی ({toPersianDigits(countIncreased)})</option>
            <option value="decrease">کاهشی ({toPersianDigits(countDecreased)})</option>
            <option value="new">جدید این ماه ({toPersianDigits(countNew)})</option>
            <option value="unchanged">بدون تغییر ({toPersianDigits(countUnchanged)})</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">همه واحدها ({toPersianDigits(departments.length)})</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={filterWorkLocation}
            onChange={(e) => setFilterWorkLocation(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">همه محل‌های خدمت ({toPersianDigits(workLocations.length)})</option>
            {workLocations.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {canDelete && selectedIds.length > 0 && (
        <div className="no-print bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <span>{toPersianDigits(selectedIds.length)} رکورد حقوقی انتخاب شده است</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold"
            >
              لغو انتخاب
            </button>
            <button
              onClick={() => setConfirmBatchDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs persian-num"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف انتخاب‌شده‌ها ({toPersianDigits(selectedIds.length)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Comparison Table */}
      <div className="no-print bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="responsive-table-container">
          <table className="w-full text-right text-xs min-w-[1160px]">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold">
                {canDelete && (
                  <th className="py-3 px-2.5 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      title="انتخاب همه ردیف‌های جدول"
                      className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-2.5 text-center w-12">ردیف</th>
                <th className="py-3 px-3">کد پرسنلی</th>
                <th className="py-3 px-3">نام و نام خانوادگی</th>
                <th className="py-3 px-3">واحد / محل خدمت</th>
                <th className="py-3 px-3">شغل / پست / رده</th>
                <th className="py-3 px-3 text-center">کارکرد موثر</th>
                <th className="py-3 px-3">جمع عوامل حکمی</th>
                <th className={`py-3 px-3 ${metricBasis === 'totalBenefits' ? 'bg-emerald-50/60 text-emerald-900' : ''}`}>
                  جمع مزایا {metricBasis === 'totalBenefits' ? `(${getPeriodLabel(currentPeriod)})` : ''}
                </th>
                <th className="py-3 px-3">جمع کسور و مالیات</th>
                <th className="py-3 px-3 bg-slate-100/70">
                  {metricLabel} {getPeriodLabel(previousPeriod)}
                </th>
                <th className="py-3 px-3 bg-indigo-50/60 text-indigo-900">
                  {metricLabel} {getPeriodLabel(currentPeriod)}
                </th>
                <th className="py-3 px-3">تغییرات {metricLabel}</th>
                <th className="py-3 px-3 text-center">درصد / روند</th>
                <th className="py-3 px-3 text-center w-24">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={canDelete ? 15 : 14} className="py-12 text-center text-slate-600 space-y-2">
                    <div className="font-bold text-slate-800">
                      رکوردی با فیلترهای انتخابی در دوره {getPeriodLabel(currentPeriod)} یافت نشد.
                    </div>
                    <p className="text-[11px] text-slate-500">
                      ابتدا فایل نمونه اکسل ۲۲۶ ستونی را دانلود کرده یا فایل حقوق خروجی سیستم خود را از دکمه «آپلود هوشمند اکسل حقوق» بارگذاری نمایید.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const isSelected = selectedIds.includes(row.recordId);
                  const roleTier = classifyPayrollRoleTier(row.position, row.jobTitle);
                  const m = getRowMetricValues(row, metricBasis);
                  return (
                    <tr
                      key={row.recordId}
                      className={`transition-colors ${isSelected ? 'bg-rose-50/40' : 'hover:bg-slate-50/70'}`}
                    >
                      {canDelete && (
                        <td className="py-3 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(row.recordId)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3 px-2.5 text-center text-slate-600 persian-num">{toPersianDigits(idx + 1)}</td>
                      <td className="py-3 px-3 font-bold text-slate-800 persian-num">{toPersianDigits(row.personnelCode)}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{row.fullName}</div>
                        {row.nationalId && <div className="text-[10px] text-slate-500 persian-num">کد ملی: {toPersianDigits(row.nationalId)}</div>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{row.department || '—'}</div>
                        <div className="text-[10px] text-slate-500">{row.workLocation || '—'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-800 font-medium">{row.position || row.jobTitle || '—'}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">
                            {roleTier}
                          </span>
                          {row.currentRecord.projectTitle && (
                            <span className="text-[10px] text-indigo-700">{row.currentRecord.projectTitle}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center persian-num">
                        <span className="font-bold text-slate-900">{toPersianDigits(row.effectiveDays)}</span>
                        {row.previousRecord && (
                          <span className="text-[10px] text-slate-500 block">قبل: {toPersianDigits(row.prevEffectiveDays)}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-semibold persian-num">{formatRial(row.totalOrderFactors)}</td>
                      <td className="py-3 px-3 text-emerald-800 font-semibold persian-num">{formatRial(row.totalBenefits)}</td>
                      <td className="py-3 px-3 persian-num">
                        <div className="text-rose-700 font-semibold">{formatRial(row.totalDeductions)}</div>
                        <div className="text-[10px] text-slate-500">مالیات: {formatRial(row.taxAmount)}</div>
                      </td>
                      <td className="py-3 px-3 bg-slate-50/50 text-slate-600 font-semibold persian-num">
                        {row.previousRecord ? formatRial(m.prev) : <span className="text-slate-400">بدون سابقه</span>}
                      </td>
                      <td className="py-3 px-3 bg-indigo-50/30 text-indigo-900 font-bold persian-num">
                        {formatRial(m.curr)}
                      </td>
                      <td className="py-3 px-3 font-bold persian-num">
                        {m.diff > 0 ? (
                          <span className="text-emerald-700">+{formatRial(m.diff)}</span>
                        ) : m.diff < 0 ? (
                          <span className="text-rose-700">{formatRial(m.diff)}</span>
                        ) : (
                          <span className="text-slate-500">۰ ریال</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] persian-num ${
                          m.trend === 'increase'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : m.trend === 'decrease'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : m.trend === 'new'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {m.trend === 'increase' && <ArrowUpRight className="w-3 h-3" />}
                          {m.trend === 'decrease' && <ArrowDownRight className="w-3 h-3" />}
                          {m.trend === 'new' ? 'جدید' : formatPercent(m.diffPercent)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setSelectedRow(row); setDetailTab('summary'); setDetailColSearch(''); setPrintFallbackHint(false); }}
                            title="مشاهده فیش کامل ۲۲۶ ستون و چاپ"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePrintComparisonPayslip(row)}
                            title="چاپ مستقیم فیش مقایسه‌ای"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeleteRecordTarget(row)}
                              title="حذف رکورد حقوق"
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed 226-Column Comparison & Payslip Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
          <div className="print-sheet bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col print:shadow-none print:border-none print:max-h-none print:overflow-visible">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:bg-white print:text-slate-900 print:border-b print:border-slate-300">
              <div>
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400 print:text-slate-800" />
                  <h3 className="font-bold text-base">
                    فیش حقوق و آنالیز مقایسه‌ای کامل — {selectedRow.fullName}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-300 mt-1 persian-num print:text-slate-600">
                  کد پرسنلی: {toPersianDigits(selectedRow.personnelCode)} | کد ملی: {toPersianDigits(selectedRow.nationalId || '—')} | دوره مقایسه: {getPeriodLabel(previousPeriod)} ↔ {getPeriodLabel(currentPeriod)}
                </p>
              </div>
              <div className="no-print flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handlePrintComparisonPayslip(selectedRow)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ فیش مقایسه‌ای (A4)</span>
                </button>
                <button
                  onClick={() =>
                    downloadPayrollComparisonHtml(
                      selectedRow,
                      getPeriodLabel(currentPeriod),
                      getPeriodLabel(previousPeriod)
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  <FileText className="w-4 h-4" />
                  <span>دانلود نسخه قابل چاپ</span>
                </button>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {printFallbackHint && (
              <div className="no-print px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  در این پیش‌نمایش ممکن است دستور چاپ خودکار مرورگر محدود شده باشد؛ از دکمه <b>«دانلود نسخه قابل چاپ»</b> استفاده کنید یا کلید ترکیبی <b dir="ltr">Ctrl + P</b> را بزنید.
                </span>
                <button
                  onClick={() =>
                    downloadPayrollComparisonHtml(
                      selectedRow,
                      getPeriodLabel(currentPeriod),
                      getPeriodLabel(previousPeriod)
                    )
                  }
                  className="shrink-0 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold"
                >
                  دانلود فایل فیش A4
                </button>
              </div>
            )}

            {/* Sub-tabs */}
            <div className="no-print px-5 pt-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 shrink-0 text-xs">
              {[
                { id: 'summary', label: '۱. مقایسه کلیدی حقوق، کارکرد و مشخصات' },
                { id: 'orders', label: '۲. عوامل حکمی (اصلی و فرعی)' },
                { id: 'loans', label: '۳. وام‌ها، اقساط و فروشگاه‌ها (۱۸ مورد)' },
                { id: 'all', label: `۴. تمامی ${toPersianDigits(PAYROLL_EXCEL_COLUMNS.length)} ستون فایل` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetailTab(t.id as any)}
                  className={`px-3.5 py-2 font-bold rounded-t-xl border-b-2 transition-colors ${
                    detailTab === t.id
                      ? 'bg-white text-indigo-700 border-indigo-600'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs print:overflow-visible print:max-h-none">
              {detailTab === 'summary' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">محل خدمت / واحد:</span>
                      <b className="text-slate-900">{selectedRow.workLocation || '—'} / {selectedRow.department || '—'}</b>
                    </div>
                    <div>
                      <span className="text-slate-500 block">شغل / پست سازمانی:</span>
                      <b className="text-slate-900">{selectedRow.jobTitle || '—'} / {selectedRow.position || '—'}</b>
                    </div>
                    <div>
                      <span className="text-slate-500 block">مرکز هزینه / پروژه:</span>
                      <b className="text-slate-900">
                        {selectedRow.currentRecord.costCenterTitle || '—'} ({selectedRow.currentRecord.projectTitle || '—'})
                      </b>
                    </div>
                    <div>
                      <span className="text-slate-500 block">بانک و شماره حساب:</span>
                      <b className="text-slate-900 persian-num">
                        {selectedRow.currentRecord.bankName || '—'} — {toPersianDigits(selectedRow.currentRecord.bankAccount || '—')}
                      </b>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">عنوان آیتم حقوقی و کارکرد</th>
                          <th className="p-2.5">ماه قبل ({getPeriodLabel(previousPeriod)})</th>
                          <th className="p-2.5">ماه جدید ({getPeriodLabel(currentPeriod)})</th>
                          <th className="p-2.5">اختلاف / تغییر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 persian-num">
                        {[
                          { label: 'کارکرد موثر (روز)', key: 'کارکرد موثر', isCurrency: false },
                          { label: 'ساعت اضافه کاری (کارکرد)', key: 'ساعت اضافه کاری(کارکرد)', isCurrency: false },
                          { label: 'ساعت جمعه کاری (کارکرد)', key: 'ساعت جمعه کاری(کارکرد)', isCurrency: false },
                          { label: 'حقوق پایه (حکم اصلی)', key: 'حقوق پایه(حكم-اصلي)', isCurrency: true },
                          { label: 'مزد شغل', key: 'مزد شغل', isCurrency: true },
                          { label: 'جمع عوامل حکمی', key: 'جمع عوامل حکمی', isCurrency: true },
                          { label: 'اضافه کاری (ریال)', key: 'اضافه کاری', isCurrency: true },
                          { label: 'جمعه کاری (ریال)', key: 'جمعه کاری', isCurrency: true },
                          { label: 'ماموریت ریالی', key: 'ماموریت ریالی', isCurrency: true },
                          { label: 'پاداش و تشویقی', key: 'پاداش', isCurrency: true },
                          { label: 'تشویقی', key: 'تشویقی', isCurrency: true },
                          { label: 'حق اولاد', key: 'حق اولاد', isCurrency: true },
                          { label: 'حق تاهل', key: 'حق تاهل', isCurrency: true },
                          { label: 'سایر مزایا', key: 'سایر مزایا', isCurrency: true },
                          { label: 'مابه التفاوت', key: 'مابه التفاوت', isCurrency: true },
                          { label: 'جمع مزایا', key: 'جمع مزایا', isCurrency: true, highlight: 'emerald' },
                          { label: 'مساعده', key: 'مساعده', isCurrency: true },
                          { label: 'مالیات', key: 'مالیات', isCurrency: true },
                          { label: 'مالیات حقوق', key: 'مالیات حقوق', isCurrency: true },
                          { label: 'جمع کسور', key: 'جمع کسور', isCurrency: true, highlight: 'rose' },
                          { label: 'خالص پرداختی نهایی', key: 'خالص پرداختی', isCurrency: true, highlight: 'indigo' },
                        ].map((item) => {
                          const currVal = parsePayrollNumber(getPayrollField(selectedRow.currentRecord.rawFields || {}, item.key));
                          const prevVal = selectedRow.previousRecord
                            ? parsePayrollNumber(getPayrollField(selectedRow.previousRecord.rawFields || {}, item.key))
                            : 0;
                          const diff = currVal - prevVal;
                          return (
                            <tr
                              key={item.key}
                              className={
                                item.highlight === 'indigo'
                                  ? 'bg-indigo-50/70 font-bold text-indigo-950'
                                  : item.highlight === 'emerald'
                                  ? 'bg-emerald-50/50 font-bold text-emerald-900'
                                  : item.highlight === 'rose'
                                  ? 'bg-rose-50/50 font-bold text-rose-900'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              <td className="p-2.5 font-semibold">{item.label}</td>
                              <td className="p-2.5 text-slate-600">
                                {item.isCurrency ? formatRial(prevVal) : toPersianDigits(prevVal)}
                              </td>
                              <td className="p-2.5 font-bold">
                                {item.isCurrency ? formatRial(currVal) : toPersianDigits(currVal)}
                              </td>
                              <td className={`p-2.5 font-bold ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                                {diff > 0 ? '+' : ''}
                                {item.isCurrency ? formatRial(diff) : toPersianDigits(diff)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {detailTab === 'orders' && (
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-900">عوامل حکمی اصلی و فرعی (مقایسه ماه قبل و ماه جدید)</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">عنوان عامل حکمی</th>
                          <th className="p-2.5">ماه قبل ({getPeriodLabel(previousPeriod)})</th>
                          <th className="p-2.5">ماه جدید ({getPeriodLabel(currentPeriod)})</th>
                          <th className="p-2.5">اختلاف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 persian-num">
                        {[...PAYROLL_MAIN_ORDER_FIELDS, ...PAYROLL_SUB_ORDER_FIELDS, 'جمع عوامل حكمي'].map((field) => {
                          const cRaw = getPayrollField(selectedRow.currentRecord.rawFields || {}, field);
                          const pRaw = selectedRow.previousRecord
                            ? getPayrollField(selectedRow.previousRecord.rawFields || {}, field)
                            : '';
                          const cNum = parsePayrollNumber(cRaw);
                          const pNum = parsePayrollNumber(pRaw);
                          const isNumeric = cNum !== 0 || pNum !== 0 || field.includes('حكم-اصلي') || field.includes('جمع');
                          const diff = cNum - pNum;
                          return (
                            <tr key={field} className="hover:bg-slate-50">
                              <td className="p-2.5 font-semibold text-slate-800">{field}</td>
                              <td className="p-2.5 text-slate-600">
                                {isNumeric ? formatRial(pNum) : toPersianDigits(String(pRaw || '—'))}
                              </td>
                              <td className="p-2.5 font-bold text-slate-900">
                                {isNumeric ? formatRial(cNum) : toPersianDigits(String(cRaw || '—'))}
                              </td>
                              <td className={`p-2.5 font-bold ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                                {isNumeric ? `${diff > 0 ? '+' : ''}${formatRial(diff)}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {detailTab === 'loans' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-900">
                      وضعیت وام‌ها، مساعده‌ها و خریدهای اقساطی (۱۸ صندوق و فروشگاه)
                    </h4>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showZeroLoans}
                        onChange={(e) => setShowZeroLoans(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>نمایش همه ۱۸ عنوان (حتی موارد با مبلغ صفر)</span>
                    </label>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-right text-xs min-w-[780px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">عنوان وام / فروشگاه</th>
                          {PAYROLL_LOAN_SUBFIELDS.map((sub) => (
                            <th key={sub} className="p-2.5">{sub}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 persian-num">
                        {PAYROLL_LOAN_GROUPS.map((group) => {
                          const vals = PAYROLL_LOAN_SUBFIELDS.map((sub) =>
                            parsePayrollNumber(getPayrollField(selectedRow.currentRecord.rawFields || {}, `${group}(${sub})`))
                          );
                          const hasNonZero = vals.some((v) => v !== 0);
                          if (!showZeroLoans && !hasNonZero) return null;
                          return (
                            <tr key={group} className="hover:bg-slate-50">
                              <td className="p-2.5 font-bold text-slate-900">{group}</td>
                              {vals.map((v, i) => (
                                <td key={i} className={`p-2.5 ${i === 4 && v > 0 ? 'font-bold text-rose-700' : 'text-slate-700'}`}>
                                  {i === 5 ? toPersianDigits(v) : formatRial(v)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {!showZeroLoans &&
                          PAYROLL_LOAN_GROUPS.every((group) =>
                            PAYROLL_LOAN_SUBFIELDS.every(
                              (sub) => parsePayrollNumber(getPayrollField(selectedRow.currentRecord.rawFields || {}, `${group}(${sub})`)) === 0
                            )
                          ) && (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-slate-500">
                                برای این پرسنل در دوره جاری هیچ وام یا قسط فعالی ثبت نشده است.
                              </td>
                            </tr>
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {detailTab === 'all' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={detailColSearch}
                      onChange={(e) => setDetailColSearch(e.target.value)}
                      placeholder="جستجو در میان ۲۲۶ ستون فایل حقوق..."
                      className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[48vh] overflow-y-auto print:max-h-none print:overflow-visible">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 sticky top-0 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2 w-12 text-center">#</th>
                          <th className="p-2">نام ستون در فایل اکسل</th>
                          <th className="p-2">ماه قبل</th>
                          <th className="p-2">ماه جدید</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 persian-num">
                        {PAYROLL_EXCEL_COLUMNS.map((col, idx) => ({ col, idx }))
                          .filter((x) => !detailColSearch.trim() || x.col.includes(detailColSearch.trim()))
                          .map(({ col, idx }) => {
                            const currVal = getPayrollField(selectedRow.currentRecord.rawFields || {}, col);
                            const prevVal = selectedRow.previousRecord
                              ? getPayrollField(selectedRow.previousRecord.rawFields || {}, col)
                              : '';
                            return (
                              <tr key={`${idx}-${col}`} className="hover:bg-slate-50">
                                <td className="p-2 text-center text-slate-400">{toPersianDigits(idx + 1)}</td>
                                <td className="p-2 font-semibold text-slate-800">{col}</td>
                                <td className="p-2 text-slate-600">{toPersianDigits(String(prevVal ?? '—'))}</td>
                                <td className="p-2 font-bold text-slate-900">{toPersianDigits(String(currVal ?? '—'))}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payroll Comparative Drill-Down Modal */}
      {drilldownSlice && (
        <div className="no-print fixed inset-0 z-40 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-400" />
                  <span>{drilldownSlice.title}</span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-1">{drilldownSlice.subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {drilldownSlice.onApplyTableFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      drilldownSlice.onApplyTableFilter?.();
                      setDrilldownSlice(null);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700"
                  >
                    اعمال فیلتر در جدول اصلی
                  </button>
                )}
                {allowExport && (
                  <button
                    type="button"
                    onClick={() =>
                      exportPayrollDrilldownToExcel(
                        drilldownFilteredRows,
                        drilldownSlice.title,
                        getPeriodLabel(currentPeriod),
                        getPeriodLabel(previousPeriod),
                        metricBasis
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>خروجی اکسل جزئیات</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrilldownSlice(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `همه (${toPersianDigits(drilldownSlice.rows.length)})` },
                  {
                    id: 'decrease',
                    label: `کاهشی‌ها (${toPersianDigits(
                      drilldownSlice.rows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'decrease').length
                    )})`,
                  },
                  {
                    id: 'increase',
                    label: `افزایشی‌ها (${toPersianDigits(
                      drilldownSlice.rows.filter((r) => getRowMetricValues(r, metricBasis).trend === 'increase').length
                    )})`,
                  },
                  {
                    id: 'new',
                    label: `جدید و بدون تغییر (${toPersianDigits(
                      drilldownSlice.rows.filter((r) => {
                        const t = getRowMetricValues(r, metricBasis).trend;
                        return t === 'new' || t === 'unchanged';
                      }).length
                    )})`,
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDrilldownTrendFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors persian-num ${
                      drilldownTrendFilter === f.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2" />
                <input
                  type="text"
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  placeholder="جستجو نام، کد پرسنلی، سمت..."
                  className="w-full pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs min-w-[920px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">کد پرسنلی</th>
                      <th className="p-2.5">نام و نام خانوادگی</th>
                      <th className="p-2.5">واحد / محل خدمت</th>
                      <th className="p-2.5">پست / شغل</th>
                      <th className="p-2.5 text-center">کارکرد قبل / جدید</th>
                      <th className="p-2.5">{metricLabel} ماه قبل</th>
                      <th className="p-2.5">{metricLabel} ماه جدید</th>
                      <th className="p-2.5">تغییر (ریال / %)</th>
                      <th className="p-2.5 text-center">فیش ۲۲۶ ستونی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 persian-num">
                    {drilldownFilteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500">
                          موردی با فیلتر انتخابی در این دسته یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      drilldownFilteredRows.map((r, i) => {
                        const m = getRowMetricValues(r, metricBasis);
                        return (
                          <tr
                            key={r.recordId}
                            onClick={() => { setSelectedRow(r); setDetailTab('summary'); setPrintFallbackHint(false); }}
                            className="hover:bg-indigo-50/40 cursor-pointer"
                          >
                            <td className="p-2.5 text-slate-500">{toPersianDigits(i + 1)}</td>
                            <td className="p-2.5 font-bold text-slate-800">{toPersianDigits(r.personnelCode)}</td>
                            <td className="p-2.5 font-bold text-slate-900">{r.fullName}</td>
                            <td className="p-2.5 text-slate-600">{r.department || '—'} / {r.workLocation || '—'}</td>
                            <td className="p-2.5 text-slate-700">{r.position || r.jobTitle || '—'}</td>
                            <td className="p-2.5 text-center">
                              {toPersianDigits(r.prevEffectiveDays)} → <b>{toPersianDigits(r.effectiveDays)}</b>
                            </td>
                            <td className="p-2.5 text-slate-600">{r.previousRecord ? formatRial(m.prev) : '—'}</td>
                            <td className="p-2.5 font-bold text-indigo-900">{formatRial(m.curr)}</td>
                            <td className={`p-2.5 font-bold ${m.diff > 0 ? 'text-emerald-700' : m.diff < 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                              {m.diff > 0 ? `+${formatRial(m.diff)}` : formatRial(m.diff)} ({m.trend === 'new' ? 'جدید' : formatPercent(m.diffPercent)})
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">
                                <Eye className="w-3.5 h-3.5" /> فیش
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Excel Import Modal */}
      {isImportOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden my-6 p-5 max-h-[92vh] overflow-y-auto">
            <SmartExcelImportMapper
              moduleType="payroll"
              title="ورود هوشمند فایل اکسل جامع حقوق و دستمزد (۲۲۶ ستون)"
              subtitle="تطبیق خودکار نام ستون‌ها با هر فرمت فایل اکسل + امکان انتخاب شیت و ویرایش نگاشت قبل از ثبت نهایی"
              onDownloadTemplate={downloadPayrollTemplate}
              templateLabel="دانلود نمونه اکسل حقوق (۲۲۶ ستون)"
              onImport={handleSmartPayrollImport}
              onCancel={() => setIsImportOpen(false)}
              accentColor="indigo"
              confirmLabel="تایید و ذخیره حقوق در دیتابیس"
              extraOptions={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">دوره پیش‌فرض فایل اکسل (ماه و سال):</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={importMonthIndex}
                        onChange={(e) => setImportMonthIndex(Number(e.target.value))}
                        className="w-2/3 bg-white border border-slate-300 rounded-lg p-2 font-bold"
                      >
                        {PERSIAN_MONTHS.map((m, idx) => (
                          <option key={m} value={idx}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={importYear}
                        onChange={(e) => setImportYear(e.target.value)}
                        className="w-1/3 bg-white border border-slate-300 rounded-lg p-2 font-bold persian-num"
                      >
                        {YEARS_LIST.map((y) => (
                          <option key={y} value={y}>{toPersianDigits(y)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={useRowYearMonth}
                        onChange={(e) => setUseRowYearMonth(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>استخراج خودکار سال/ماه از ستون «سال/ماه» هر ردیف در صورت وجود</span>
                    </label>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* Delete Single Record Confirmation */}
      {deleteRecordTarget && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف رکورد حقوق</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              آیا از حذف رکورد حقوق <b>{deleteRecordTarget.fullName}</b> در دوره <b>{getPeriodLabel(currentPeriod)}</b> اطمینان دارید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteRecordTarget(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteRecord}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {confirmBatchDeleteOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف گروهی رکوردهای حقوق</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed persian-num">
              آیا از حذف <b>{toPersianDigits(selectedIds.length)} رکورد حقوقی انتخاب‌شده</b> در دوره <b>{getPeriodLabel(currentPeriod)}</b> اطمینان دارید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmBatchDeleteOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold persian-num"
              >
                حذف قطعی ({toPersianDigits(selectedIds.length)} مورد)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Whole Period Confirmation */}
      {confirmClearPeriod && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm">حذف کامل حقوق دوره {getPeriodLabel(currentPeriod)}</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed persian-num">
              آیا مطمئن هستید تمام {toPersianDigits(currentRecords.length)} رکورد حقوق ثبت‌شده برای دوره <b>{getPeriodLabel(currentPeriod)}</b> پاک شوند؟ سایر دوره‌ها دست‌نخورده باقی می‌مانند.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmClearPeriod(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmClearPeriod}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                بله، دوره جاری پاک شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear ALL Payroll Table Confirmation */}
      {confirmDeleteAllOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm">حذف کامل تمامی اطلاعات جدول حقوق</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed persian-num">
              آیا مطمئن هستید کل <b>{toPersianDigits(payrollList.length)} رکورد حقوق و دستمزد</b> در تمامی ماه‌ها و دوره‌ها برای همیشه پاک شوند؟ این عملیات غیرقابل بازگشت است.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteAllOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteAll}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                بله، کل جدول حقوق پاک شود
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
