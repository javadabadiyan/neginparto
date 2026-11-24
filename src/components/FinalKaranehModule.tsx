import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Download,
  Edit2,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  AlertCircle,
  X,
  Briefcase,
  Building2,
  RotateCcw,
  ArrowLeftRight,
  CheckSquare,
  CheckCircle2,
  Sparkles,
  Undo2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { KaranehRecord, KaranehComparisonRow, Personnel } from '../types';
import {
  formatRial,
  formatPercent,
  toPersianDigits,
  toEnglishDigits,
  PERSIAN_MONTHS,
  YEARS_LIST,
  parsePeriod,
  buildPeriod,
  getPeriodLabel,
  getPreviousPeriodId,
  numberToPersianWords
} from '../utils/persian';
import { exportFinalKaranehToExcel } from '../utils/excel';
import { TablePagination } from './TablePagination';
import { buildDuplicateIndex, normalizeDuplicateKey } from '../utils/duplicates';

interface FinalKaranehModuleProps {
  karanehList: KaranehRecord[];
  personnelList?: Personnel[];
  onSaveKaraneh: (record: Partial<KaranehRecord>) => Promise<boolean>;
  onDeleteKaraneh: (id: string) => Promise<boolean>;
  onBatchDeleteKaraneh: (ids: string[]) => Promise<boolean>;
  onDeleteAllKaraneh?: (period?: string, scope?: 'all' | 'submitted') => Promise<boolean>;
  onReopenKaraneh: (period: string, department?: string) => Promise<boolean>;
  canEdit?: boolean;
  canDelete?: boolean;
  canDeleteAll?: boolean;
  canExportExcel?: boolean;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

interface UnitSummaryRow {
  department: string;
  employeesCount: number;
  totalPrevious: number;
  totalCurrent: number;
  diffAmount: number;
  diffPercent: number;
  submittedAt?: string;
  submittedByName?: string;
}

export const FinalKaranehModule: React.FC<FinalKaranehModuleProps> = ({
  karanehList,
  personnelList = [],
  onSaveKaraneh,
  onDeleteKaraneh,
  onBatchDeleteKaraneh,
  onDeleteAllKaraneh,
  onReopenKaraneh,
  canEdit = false,
  canDelete = false,
  canDeleteAll = false,
  canExportExcel = false,
  onRefreshData,
  isRefreshing = false
}) => {
  const allSubmittedRecords = useMemo(
    () => karanehList.filter((k) => k.status === 'submitted'),
    [karanehList]
  );

  const submittedPeriods = useMemo(() => {
    return Array.from(new Set(allSubmittedRecords.map((k) => k.period).filter(Boolean))).sort().reverse();
  }, [allSubmittedRecords]);

  // Period selectors (default to latest submitted period if any, else 1403-08)
  const initialPeriod = submittedPeriods[0] || '1403-08';
  const initialParsed = parsePeriod(initialPeriod);
  const initialPrevParsed = parsePeriod(getPreviousPeriodId(initialPeriod));

  const [currentYear, setCurrentYear] = useState<string>(initialParsed.year);
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(initialParsed.monthIndex);
  const [prevYear, setPrevYear] = useState<string>(initialPrevParsed.year);
  const [prevMonthIndex, setPrevMonthIndex] = useState<number>(initialPrevParsed.monthIndex);
  const [hasAutoAlignedPeriod, setHasAutoAlignedPeriod] = useState<boolean>(submittedPeriods.length > 0);

  useEffect(() => {
    if (!hasAutoAlignedPeriod && submittedPeriods.length > 0) {
      const latest = submittedPeriods[0];
      const p = parsePeriod(latest);
      const pp = parsePeriod(getPreviousPeriodId(latest));
      setCurrentYear(p.year);
      setCurrentMonthIndex(p.monthIndex);
      setPrevYear(pp.year);
      setPrevMonthIndex(pp.monthIndex);
      setHasAutoAlignedPeriod(true);
    }
  }, [submittedPeriods, hasAutoAlignedPeriod]);

  const currentPeriod = buildPeriod(currentYear, currentMonthIndex);
  const previousPeriod = buildPeriod(prevYear, prevMonthIndex);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterTrend, setFilterTrend] = useState<string>('all');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Selection & Modals
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingRecord, setEditingRecord] = useState<KaranehRecord | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    position: '',
    department: '',
    finalKaraneh: 0,
    notes: ''
  });
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<KaranehRecord | null>(null);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [deleteAllScope, setDeleteAllScope] = useState<'period' | 'all'>('period');
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [reopeningUnit, setReopeningUnit] = useState<string | null>(null);

  const handleSelectPeriodShortcut = (period: string) => {
    const p = parsePeriod(period);
    const pp = parsePeriod(getPreviousPeriodId(period));
    setCurrentYear(p.year);
    setCurrentMonthIndex(p.monthIndex);
    setPrevYear(pp.year);
    setPrevMonthIndex(pp.monthIndex);
  };

  const handleAutoSetPreviousMonth = () => {
    const pp = parsePeriod(getPreviousPeriodId(currentPeriod));
    setPrevYear(pp.year);
    setPrevMonthIndex(pp.monthIndex);
  };

  // Records for selected currentPeriod (only submitted!) and previousPeriod (all records for comparison baseline)
  const currentSubmittedRecords = useMemo(
    () => allSubmittedRecords.filter((k) => k.period === currentPeriod),
    [allSubmittedRecords, currentPeriod]
  );

  useEffect(() => {
    const validIds = new Set(currentSubmittedRecords.map((k) => k.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [currentSubmittedRecords]);

  const prevMap = useMemo(() => {
    const map = new Map<string, KaranehRecord>();
    karanehList
      .filter((k) => k.period === previousPeriod)
      .forEach((p) => map.set(String(p.personnelCode).trim(), p));
    return map;
  }, [karanehList, previousPeriod]);

  const comparisonRows: KaranehComparisonRow[] = useMemo(() => {
    return currentSubmittedRecords.map((curr) => {
      const code = String(curr.personnelCode).trim();
      const prev = prevMap.get(code);
      const prevFinal = prev ? Number(prev.finalKaraneh || 0) : 0;
      const currFinal = Number(curr.finalKaraneh || 0);
      const diffAmount = currFinal - prevFinal;
      const diffPercent =
        prevFinal > 0
          ? Number(((diffAmount / prevFinal) * 100).toFixed(1))
          : currFinal > 0
          ? 100
          : 0;
      const trend: 'increase' | 'decrease' | 'unchanged' | 'new' = !prev
        ? 'new'
        : diffAmount > 0
        ? 'increase'
        : diffAmount < 0
        ? 'decrease'
        : 'unchanged';

      return {
        id: curr.id,
        personnelCode: curr.personnelCode,
        fullName: curr.fullName,
        department: curr.department || 'عمومی',
        position: curr.position || '',
        currentKaraneh: currFinal,
        previousKaraneh: prevFinal,
        diffAmount,
        diffPercent,
        trend,
        notes: curr.notes || '',
        status: 'submitted',
        submittedAt: curr.submittedAt,
        submittedByName: curr.submittedByName
      };
    });
  }, [currentSubmittedRecords, prevMap]);

  // Unit Summary & Analysis grouped by department
  const unitSummaries: UnitSummaryRow[] = useMemo(() => {
    const grouped = new Map<string, UnitSummaryRow>();
    comparisonRows.forEach((row) => {
      const dept = row.department || 'عمومی';
      const existing = grouped.get(dept) || {
        department: dept,
        employeesCount: 0,
        totalPrevious: 0,
        totalCurrent: 0,
        diffAmount: 0,
        diffPercent: 0,
        submittedAt: row.submittedAt,
        submittedByName: row.submittedByName
      };
      existing.employeesCount += 1;
      existing.totalPrevious += row.previousKaraneh;
      existing.totalCurrent += row.currentKaraneh;
      if (!existing.submittedAt && row.submittedAt) existing.submittedAt = row.submittedAt;
      if (!existing.submittedByName && row.submittedByName) existing.submittedByName = row.submittedByName;
      grouped.set(dept, existing);
    });

    return Array.from(grouped.values())
      .map((u) => {
        const diffAmount = u.totalCurrent - u.totalPrevious;
        const diffPercent =
          u.totalPrevious > 0
            ? Number(((diffAmount / u.totalPrevious) * 100).toFixed(1))
            : u.totalCurrent > 0
            ? 100
            : 0;
        return { ...u, diffAmount, diffPercent };
      })
      .sort((a, b) => b.totalCurrent - a.totalCurrent);
  }, [comparisonRows]);

  const departments = useMemo(
    () => Array.from(new Set(comparisonRows.map((r) => r.department))).filter(Boolean),
    [comparisonRows]
  );

  // Overall KPIs
  const totalCurrent = comparisonRows.reduce((s, r) => s + r.currentKaraneh, 0);
  const totalPrevious = comparisonRows.reduce((s, r) => s + r.previousKaraneh, 0);
  const totalDiff = totalCurrent - totalPrevious;
  const growthPercent =
    totalPrevious > 0 ? Number(((totalDiff / totalPrevious) * 100).toFixed(1)) : totalCurrent > 0 ? 100 : 0;

  const personnelNationalIdByCode = useMemo(() => {
    const map = new Map<string, string>();
    personnelList.forEach((p) => {
      const code = normalizeDuplicateKey(p.personnelCode);
      if (code && p.nationalId) map.set(code, p.nationalId);
    });
    return map;
  }, [personnelList]);

  const duplicateIndex = useMemo(
    () =>
      buildDuplicateIndex(
        comparisonRows,
        (r) => r.personnelCode,
        (r) => personnelNationalIdByCode.get(normalizeDuplicateKey(r.personnelCode)) || ''
      ),
    [comparisonRows, personnelNationalIdByCode]
  );

  // Filtered rows
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return comparisonRows.filter((r) => {
      const nid = personnelNationalIdByCode.get(normalizeDuplicateKey(r.personnelCode)) || '';
      const matchesSearch =
        !term ||
        r.fullName.toLowerCase().includes(term) ||
        r.personnelCode.toLowerCase().includes(term) ||
        nid.toLowerCase().includes(term) ||
        r.department.toLowerCase().includes(term) ||
        r.position.toLowerCase().includes(term);
      const matchesDept = filterDepartment === 'all' || r.department === filterDepartment;
      const matchesTrend = filterTrend === 'all' || r.trend === filterTrend;
      const matchesDup = !onlyDuplicates || duplicateIndex.isDuplicateRow(r);
      return matchesSearch && matchesDept && matchesTrend && matchesDup;
    });
  }, [comparisonRows, searchTerm, filterDepartment, filterTrend, onlyDuplicates, duplicateIndex, personnelNationalIdByCode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterDepartment, filterTrend, onlyDuplicates, currentPeriod, previousPeriod]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize]
  );

  const filteredRecordIds = useMemo(
    () => filteredRows.map((r) => r.id).filter((id): id is string => Boolean(id)),
    [filteredRows]
  );
  const allFilteredSelected =
    filteredRecordIds.length > 0 && filteredRecordIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredRecordIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredRecordIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // Edit Handlers
  const handleOpenEdit = (row: KaranehComparisonRow) => {
    const rec = currentSubmittedRecords.find((k) => k.id === row.id || k.personnelCode === row.personnelCode);
    if (!rec) return;
    setEditingRecord(rec);
    setEditError('');
    setEditForm({
      fullName: rec.fullName,
      position: rec.position || '',
      department: rec.department || '',
      finalKaraneh: Number(rec.finalKaraneh || 0),
      notes: rec.notes || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setEditError('');
    setSavingEdit(true);
    const ok = await onSaveKaraneh({
      ...editingRecord,
      fullName: editForm.fullName.trim(),
      position: editForm.position.trim(),
      department: editForm.department.trim(),
      finalKaraneh: Number(toEnglishDigits(editForm.finalKaraneh)) || 0,
      baseKaraneh: Number(toEnglishDigits(editForm.finalKaraneh)) || 0,
      notes: editForm.notes.trim(),
      status: 'submitted'
    });
    setSavingEdit(false);
    if (ok) {
      setEditingRecord(null);
    } else {
      setEditError('ذخیره تغییرات با خطا مواجه شد.');
    }
  };

  // Delete Handlers
  const handleConfirmDeleteOne = async () => {
    if (!deleteTarget) return;
    await onDeleteKaraneh(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    const ok = await onBatchDeleteKaraneh(selectedIds);
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmBatchDeleteOpen(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllKaraneh) return;
    setBatchDeleting(true);
    const ok = await onDeleteAllKaraneh(
      deleteAllScope === 'period' ? currentPeriod : undefined,
      'submitted'
    );
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmDeleteAllOpen(false);
    }
  };

  const handleReopenUnit = async (dept: string) => {
    setReopeningUnit(dept);
    await onReopenKaraneh(currentPeriod, dept);
    setReopeningUnit(null);
  };

  const handleExportAll = () => {
    const activeUnitSummaries =
      filterDepartment === 'all'
        ? unitSummaries
        : unitSummaries.filter((u) => u.department === filterDepartment);
    exportFinalKaranehToExcel(
      filteredRows,
      activeUnitSummaries,
      getPeriodLabel(currentPeriod),
      getPeriodLabel(previousPeriod)
    );
  };

  const handleExportSingleUnit = (unit: UnitSummaryRow) => {
    const unitRows = comparisonRows.filter((r) => r.department === unit.department);
    exportFinalKaranehToExcel(
      unitRows,
      [unit],
      getPeriodLabel(currentPeriod),
      getPeriodLabel(previousPeriod),
      `کارانه_نهایی_${unit.department}_${getPeriodLabel(currentPeriod)}.xlsx`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-violet-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                کارانه نهایی ارسالی واحدها (تجمیع، آنالیز رشد و خروجی جامع)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                تمامی کارانه‌های تأیید و ارسال‌شده توسط مدیران واحدها در این صفحه تجمیع و با ماه قبل مقایسه می‌شوند
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefreshData && (
            <button
              type="button"
              onClick={() => onRefreshData()}
              disabled={Boolean(isRefreshing)}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-800 rounded-xl text-xs font-bold transition-colors border border-violet-200 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>بروزرسانی اطلاعات</span>
            </button>
          )}
          {canExportExcel && (
            <button
              onClick={handleExportAll}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>خروجی اکسل جامع کارانه نهایی ({toPersianDigits(filteredRows.length)})</span>
            </button>
          )}

          {canDeleteAll && onDeleteAllKaraneh && allSubmittedRecords.length > 0 && (
            <button
              onClick={() => {
                setDeleteAllScope(currentSubmittedRecords.length > 0 ? 'period' : 'all');
                setConfirmDeleteAllOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors border border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>پاکسازی کارانه‌های ارسالی</span>
            </button>
          )}
        </div>
      </div>

      {/* Period Selector & Submitted Periods Quick Pills */}
      <div className="bg-slate-900 text-white p-4.5 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 px-2.5 rounded-xl border border-slate-700">
              <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="font-bold text-white whitespace-nowrap">دوره کارانه ارسالی:</span>

              <select
                value={currentMonthIndex}
                onChange={(e) => setCurrentMonthIndex(Number(e.target.value))}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-violet-400"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>

              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(e.target.value)}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-violet-400 persian-num"
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
              title="تنظیم خودکار به ۱ ماه قبل"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border border-violet-500/30 font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ماه قبل از این</span>
            </button>
          </div>

          <div className="text-xs text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[11px]">
              تحلیل تجمیعی <b>{getPeriodLabel(previousPeriod)}</b> در برابر <b>{getPeriodLabel(currentPeriod)}</b>
            </span>
          </div>
        </div>

        {submittedPeriods.length > 0 && (
          <div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400 font-semibold">دوره‌های دارای کارانه ارسالی:</span>
            {submittedPeriods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSelectPeriodShortcut(p)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors persian-num ${
                  p === currentPeriod
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {getPeriodLabel(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">واحدها و پرسنل ارسال‌شده</span>
          <div className="flex items-baseline gap-2 mt-1 persian-num">
            <span className="text-xl font-bold text-slate-900">{toPersianDigits(unitSummaries.length)} واحد</span>
            <span className="text-xs text-slate-600">({toPersianDigits(comparisonRows.length)} نفر)</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            مجموع مبنا در {getPeriodLabel(previousPeriod)} (ماه قبل)
          </span>
          <span className="text-lg font-bold text-slate-700 mt-1 block persian-num">
            {formatRial(totalPrevious)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-violet-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            جمع کارانه نهایی ارسالی ({getPeriodLabel(currentPeriod)})
          </span>
          <span className="text-lg font-bold text-violet-800 mt-1 block persian-num">
            {formatRial(totalCurrent)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">تغییر ریالی و درصد افزایش کل</span>
          <div className="flex items-center justify-between mt-1 persian-num">
            <span className={`text-sm font-bold ${totalDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {totalDiff >= 0 ? `+${formatRial(totalDiff)}` : formatRial(totalDiff)}
            </span>
            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-xs ${
              growthPercent >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}>
              {growthPercent > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
              {growthPercent < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
              {growthPercent > 0 ? `+${toPersianDigits(growthPercent)}٪` : `${toPersianDigits(growthPercent)}٪`}
            </span>
          </div>
        </div>
      </div>

      {/* Unit Summary & Analysis Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-700" />
            <h3 className="font-bold text-xs text-slate-900">
              جدول خلاصه و آنالیز کارانه ارسالی به تفکیک هر واحد سازمانی ({getPeriodLabel(currentPeriod)})
            </h3>
          </div>
          {filterDepartment !== 'all' && (
            <button
              type="button"
              onClick={() => setFilterDepartment('all')}
              className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold"
            >
              نمایش همه واحدها
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <th className="py-3 px-3 text-center w-12">ردیف</th>
                <th className="py-3 px-4">نام واحد سازمانی</th>
                <th className="py-3 px-3 text-center">تعداد پرسنل</th>
                <th className="py-3 px-3">جمع ماه قبل</th>
                <th className="py-3 px-3">جمع کارانه ارسالی جدید</th>
                <th className="py-3 px-3">اختلاف مبلغ (ریال)</th>
                <th className="py-3 px-3 text-center">درصد افزایش / تغییر</th>
                <th className="py-3 px-4">تأییدکننده و زمان ارسال</th>
                <th className="py-3 px-3 text-center">عملیات واحد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unitSummaries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    هنوز هیچ واحدی کارانه دوره <b>{getPeriodLabel(currentPeriod)}</b> را تأیید و ارسال نهایی نکرده است.
                  </td>
                </tr>
              ) : (
                unitSummaries.map((u, idx) => {
                  const isFocused = filterDepartment === u.department;
                  return (
                    <tr
                      key={u.department}
                      className={isFocused ? 'bg-violet-50/50' : 'hover:bg-slate-50/70 transition-colors'}
                    >
                      <td className="py-3 px-3 text-center text-slate-500 persian-num">{toPersianDigits(idx + 1)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => setFilterDepartment(isFocused ? 'all' : u.department)}
                          className="hover:text-violet-700 text-right font-bold cursor-pointer"
                        >
                          {u.department}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-center font-bold persian-num">
                        {toPersianDigits(u.employeesCount)} نفر
                      </td>
                      <td className="py-3 px-3 text-slate-600 persian-num">
                        {u.totalPrevious > 0 ? formatRial(u.totalPrevious) : '—'}
                      </td>
                      <td className="py-3 px-3 font-bold text-violet-800 persian-num">
                        {formatRial(u.totalCurrent)}
                      </td>
                      <td className="py-3 px-3 font-bold persian-num">
                        <span className={u.diffAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {u.diffAmount >= 0 ? `+${formatRial(u.diffAmount)}` : formatRial(u.diffAmount)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] persian-num ${
                            u.diffPercent > 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : u.diffPercent < 0
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {u.diffPercent > 0 && <ArrowUpRight className="w-3 h-3" />}
                          {u.diffPercent < 0 && <ArrowDownRight className="w-3 h-3" />}
                          {formatPercent(u.diffPercent)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-600 persian-num">
                        <div className="font-bold text-slate-800">{u.submittedByName || 'مدیر واحد'}</div>
                        <div className="text-[10px] text-slate-500">{u.submittedAt || '—'}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canExportExcel && (
                            <button
                              type="button"
                              onClick={() => handleExportSingleUnit(u)}
                              title={`خروجی اکسل ${u.department}`}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10.5px] font-bold flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>اکسل</span>
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              disabled={reopeningUnit === u.department}
                              onClick={() => handleReopenUnit(u.department)}
                              title="بازگرداندن به پیش‌نویس جهت اصلاح توسط واحد"
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[10.5px] font-bold flex items-center gap-1 disabled:opacity-50"
                            >
                              <Undo2 className="w-3 h-3" />
                              <span>{reopeningUnit === u.department ? '...' : 'بازگشت به پیش‌نویس'}</span>
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

      {/* Duplicate Warning Banner */}
      {duplicateIndex.totalDuplicateRows > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="persian-num">
              <span className="font-bold">هشدار اطلاعات تکراری در کارانه نهایی:</span>{' '}
              <span>
                <b>{toPersianDigits(duplicateIndex.totalDuplicateRows)} ردیف</b> تکراری شناسایی شد
                ({toPersianDigits(duplicateIndex.dupCodeCount)} کد پرسنلی تکراری و {toPersianDigits(duplicateIndex.dupNationalIdCount)} کد ملی تکراری).
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOnlyDuplicates((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors shrink-0 cursor-pointer persian-num ${
              onlyDuplicates
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
            }`}
          >
            {onlyDuplicates
              ? 'نمایش همه رکوردها'
              : `مشاهده فقط تکراری‌ها (${toPersianDigits(duplicateIndex.totalDuplicateRows)})`}
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="md:col-span-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجوی پرسنل بر اساس نام، کد پرسنلی، کد ملی، پست یا واحد..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="md:col-span-3">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">همه واحدهای ارسالی ({toPersianDigits(departments.length)})</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <select
            value={filterTrend}
            onChange={(e) => setFilterTrend(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">تمام وضعیت‌های تغییر</option>
            <option value="increase">افزایشی</option>
            <option value="decrease">کاهشی</option>
            <option value="new">پرسنل جدید</option>
            <option value="unchanged">بدون تغییر</option>
          </select>
        </div>
        <div className="md:col-span-2 flex items-center">
          <button
            type="button"
            onClick={() => setOnlyDuplicates((prev) => !prev)}
            className={`w-full px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer persian-num ${
              onlyDuplicates
                ? 'bg-amber-600 text-white border-amber-700'
                : duplicateIndex.totalDuplicateRows > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>فقط تکراری‌ها ({toPersianDigits(duplicateIndex.totalDuplicateRows)})</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {canDelete && selectedIds.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <span>{toPersianDigits(selectedIds.length)} رکورد انتخاب شده است</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold"
            >
              لغو انتخاب
            </button>
            <button
              onClick={() => setConfirmBatchDeleteOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs persian-num"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف انتخاب‌شده‌ها ({toPersianDigits(selectedIds.length)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Employee Consolidated Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold">
                {canDelete && (
                  <th className="py-3 px-2.5 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-violet-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-3 text-center w-12">ردیف</th>
                <th className="py-3 px-3">کد پرسنلی</th>
                <th className="py-3 px-4">نام و نام خانوادگی</th>
                <th className="py-3 px-3">واحد</th>
                <th className="py-3 px-4">پست سازمانی</th>
                <th className="py-3 px-3 bg-slate-100/70">کارانه ماه قبل</th>
                <th className="py-3 px-3 bg-violet-50/60 text-violet-900">کارانه نهایی جدید</th>
                <th className="py-3 px-3">تغییر مبلغ (ریال)</th>
                <th className="py-3 px-3 text-center">درصد تغییر</th>
                <th className="py-3 px-3 text-center">وضعیت</th>
                <th className="py-3 px-4">توضیحات</th>
                {(canEdit || canDelete) && <th className="py-3 px-3 text-center w-24">عملیات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={(canEdit || canDelete) ? (canDelete ? 13 : 12) : 11} className="py-12 text-center text-slate-500">
                    ردیف کارانه ارسالی برای این دوره یا فیلتر یافت نشد.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
                  const isSelected = Boolean(row.id) && selectedIds.includes(row.id!);
                  const orig = currentSubmittedRecords.find((k) => k.id === row.id || k.personnelCode === row.personnelCode);
                  const dupReasons = duplicateIndex.getRowDuplicateReasons(row);
                  const isDup = dupReasons.length > 0;
                  const nid = personnelNationalIdByCode.get(normalizeDuplicateKey(row.personnelCode)) || '';
                  return (
                    <tr
                      key={row.id || `${row.personnelCode}-${idx}`}
                      className={
                        isSelected
                          ? 'bg-violet-50/40'
                          : isDup
                          ? 'bg-amber-50/60 hover:bg-amber-100/50 transition-colors'
                          : 'hover:bg-slate-50/70 transition-colors'
                      }
                    >
                      {canDelete && (
                        <td className="py-3 px-2.5 text-center">
                          {row.id && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(row.id!)}
                              className="w-4 h-4 rounded text-violet-600 cursor-pointer"
                            />
                          )}
                        </td>
                      )}
                      <td className="py-3 px-3 text-center text-slate-500 persian-num">{toPersianDigits((safePage - 1) * pageSize + idx + 1)}</td>
                      <td className="py-3 px-3 font-bold text-slate-800 persian-num">
                        <div>{toPersianDigits(row.personnelCode)}</div>
                        {dupReasons.includes('personnelCode') && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 text-[10px] font-bold">
                            تکراری: کد پرسنلی
                          </span>
                        )}
                        {dupReasons.includes('nationalId') && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            تکراری: کد ملی
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div>{row.fullName}</div>
                        {nid && (
                          <div className="text-[10px] text-slate-500 font-normal persian-num">
                            کد ملی: {toPersianDigits(nid)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-semibold">{row.department}</td>
                      <td className="py-3 px-4 text-slate-700">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] border border-slate-200">
                          <Briefcase className="w-3 h-3 text-violet-600 shrink-0" />
                          <span>{row.position || '—'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 bg-slate-50/50 text-slate-600 persian-num">
                        {row.previousKaraneh > 0 ? formatRial(row.previousKaraneh) : <span className="text-slate-400">بدون سابقه</span>}
                      </td>
                      <td className="py-3 px-3 bg-violet-50/30 font-bold text-violet-900 persian-num">
                        {formatRial(row.currentKaraneh)}
                      </td>
                      <td className="py-3 px-3 font-bold persian-num">
                        <span className={row.diffAmount > 0 ? 'text-emerald-700' : row.diffAmount < 0 ? 'text-rose-700' : 'text-slate-500'}>
                          {row.diffAmount > 0 ? `+${formatRial(row.diffAmount)}` : formatRial(row.diffAmount)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] persian-num ${
                          row.trend === 'increase'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : row.trend === 'decrease'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : row.trend === 'new'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {row.trend === 'increase' && <ArrowUpRight className="w-3 h-3" />}
                          {row.trend === 'decrease' && <ArrowDownRight className="w-3 h-3" />}
                          {row.trend === 'new' ? 'جدید' : formatPercent(row.diffPercent)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>نهایی ارسالی</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={row.notes}>
                        {row.notes || '—'}
                      </td>
                      {(canEdit || canDelete) && (
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => handleOpenEdit(row)}
                                title="ویرایش کارانه نهایی"
                                className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && orig && (
                              <button
                                onClick={() => setDeleteTarget(orig)}
                                title="حذف رکورد"
                                className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={safePage}
          totalItems={filteredRows.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Edit Submitted Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white p-4.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                ویرایش کارانه نهایی ارسالی ({editingRecord.fullName})
              </h3>
              <button onClick={() => setEditingRecord(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              {editError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-bold">
                  {editError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام و نام خانوادگی</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">واحد سازمانی</label>
                  <input
                    type="text"
                    required
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">پست سازمانی</label>
                  <input
                    type="text"
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-violet-50/70 border border-violet-200 rounded-xl space-y-2">
                <label className="block font-bold text-violet-950">مبلغ کارانه نهایی (ریال)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={toPersianDigits(editForm.finalKaraneh)}
                  onChange={(e) => {
                    const raw = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                    setEditForm({ ...editForm, finalKaraneh: Number(raw) || 0 });
                  }}
                  className="w-full px-3 py-2 bg-white border border-violet-300 rounded-lg text-sm font-bold text-violet-900 persian-num"
                />
                <div className="flex flex-wrap justify-between text-[11px] text-slate-700">
                  <span className="font-bold text-emerald-800 persian-num">{formatRial(editForm.finalKaraneh)}</span>
                  <span>{numberToPersianWords(editForm.finalKaraneh)} ریال</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">توضیحات</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {savingEdit ? 'در حال ذخیره...' : 'ذخیره تغییرات نهایی'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">حذف رکورد کارانه نهایی ارسالی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed">
              آیا از حذف کارانه نهایی ارسالی <b>{deleteTarget.fullName}</b> (واحد <b>{deleteTarget.department}</b>) اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOne}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Modal */}
      {confirmBatchDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف گروهی کارانه نهایی</h3>
            </div>
            <p className="text-slate-600 persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedIds.length)} رکورد انتخاب‌شده</b> اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBatchDeleteOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchDeleting ? 'در حال حذف...' : 'بله، حذف شود'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Submitted Modal */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">پاکسازی کارانه‌های نهایی ارسالی</h3>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="finalKaranehDeleteScope"
                  checked={deleteAllScope === 'period'}
                  onChange={() => setDeleteAllScope('period')}
                />
                <span className="font-bold text-slate-800 persian-num">
                  فقط دوره {getPeriodLabel(currentPeriod)} ({toPersianDigits(currentSubmittedRecords.length)} رکورد)
                </span>
              </label>
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-rose-200 bg-rose-50/40 cursor-pointer">
                <input
                  type="radio"
                  name="finalKaranehDeleteScope"
                  checked={deleteAllScope === 'all'}
                  onChange={() => setDeleteAllScope('all')}
                />
                <span className="font-bold text-rose-800 persian-num">
                  تمام کارانه‌های ارسالی در همه دوره‌ها ({toPersianDigits(allSubmittedRecords.length)} رکورد)
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchDeleting ? 'در حال پاکسازی...' : 'تأیید و پاکسازی'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
