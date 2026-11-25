import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Download,
  Upload,
  Plus,
  Edit2,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Calendar,
  AlertCircle,
  X,
  Briefcase,
  Building,
  RotateCcw,
  ArrowLeftRight,
  CheckSquare,
  Send,
  Lock,
  CheckCircle2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { KaranehRecord, Personnel, KaranehComparisonRow, GranularKaranehPermissions, UserPermissions } from '../types';
import { normalizePermissions, canUserAccessKaranehUnit } from '../utils/permissions';
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
import {
  exportKaranehComparisonToExcel,
  downloadKaranehTemplate
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import { TablePagination } from './TablePagination';
import { buildDuplicateIndex, normalizeDuplicateKey } from '../utils/duplicates';

interface KaranehModuleProps {
  personnelList: Personnel[];
  karanehList: KaranehRecord[];
  onSaveKaraneh: (record: Partial<KaranehRecord>) => Promise<boolean>;
  onDeleteKaraneh: (id: string) => Promise<boolean>;
  onBatchDeleteKaraneh: (ids: string[]) => Promise<boolean>;
  onDeleteAllKaraneh?: (period?: string, scope?: 'all' | 'submitted') => Promise<boolean>;
  onBatchImportKaraneh: (period: string, items: any[]) => Promise<boolean>;
  onSubmitKaraneh?: (period: string, department?: string) => Promise<boolean>;
  canManage?: boolean;
  canExport?: boolean;
  canImport?: boolean;
  granularPermissions?: GranularKaranehPermissions;
  userPermissions?: UserPermissions;
  isAdmin?: boolean;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const KaranehModule: React.FC<KaranehModuleProps> = ({
  personnelList,
  karanehList,
  onSaveKaraneh,
  onDeleteKaraneh,
  onBatchDeleteKaraneh,
  onDeleteAllKaraneh,
  onBatchImportKaraneh,
  onSubmitKaraneh,
  canManage = false,
  canExport = false,
  canImport = false,
  granularPermissions,
  userPermissions,
  isAdmin = false,
  onRefreshData,
  isRefreshing = false
}) => {
  const canCreate = granularPermissions ? Boolean(granularPermissions.create) : canManage;
  const canEdit = granularPermissions ? Boolean(granularPermissions.edit) : canManage;
  const canDelete = granularPermissions ? Boolean(granularPermissions.delete) : canManage;
  const allowDeleteAll = Boolean(granularPermissions?.deleteAll);
  const allowExport = granularPermissions ? Boolean(granularPermissions.exportExcel) : canExport;
  const allowImport = granularPermissions ? Boolean(granularPermissions.importExcel) : canImport;
  const canSubmit = isAdmin || Boolean(granularPermissions?.submit) || Boolean(userPermissions?.finalKaraneh?.edit);

  const effectivePerms = useMemo(() => normalizePermissions(userPermissions), [userPermissions]);
  const allowedUnits = useMemo(() => {
    const fromGranular = granularPermissions?.allowedUnits;
    const raw = Array.isArray(fromGranular) ? fromGranular : effectivePerms.karaneh.allowedUnits;
    return (raw || []).map((u) => String(u || '').trim()).filter(Boolean);
  }, [granularPermissions?.allowedUnits, effectivePerms]);
  const hasFullAccess = isAdmin || Boolean(effectivePerms.finalKaraneh?.view) || allowedUnits.length === 0;

  const unitPermsCheck = useMemo<UserPermissions>(
    () => ({
      ...effectivePerms,
      karaneh: {
        ...effectivePerms.karaneh,
        view: true,
        allowedUnits,
      },
    }),
    [effectivePerms, allowedUnits]
  );

  const scopedKaranehList = useMemo(() => {
    if (hasFullAccess) return karanehList;
    return karanehList.filter((k) =>
      canUserAccessKaranehUnit(unitPermsCheck, false, k.department || '')
    );
  }, [karanehList, hasFullAccess, unitPermsCheck]);

  const scopedPersonnelList = useMemo(() => {
    if (hasFullAccess) return personnelList;
    return personnelList.filter((p) =>
      canUserAccessKaranehUnit(unitPermsCheck, false, p.department || '')
    );
  }, [personnelList, hasFullAccess, unitPermsCheck]);

  const karanehPeriods = useMemo(() => {
    return Array.from(new Set(scopedKaranehList.map((k) => k.period).filter(Boolean))).sort().reverse();
  }, [scopedKaranehList]);

  // Dedicated Year & Month selection for Current Period (ماه جدید)
  const initialPeriod = karanehPeriods[0] || '1403-08';
  const initialParsed = parsePeriod(initialPeriod);
  const initialPrevParsed = parsePeriod(getPreviousPeriodId(initialPeriod));

  const [currentYear, setCurrentYear] = useState<string>(initialParsed.year);
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(initialParsed.monthIndex);

  // Dedicated Year & Month selection for Previous Period (ماه قبل جهت مقایسه)
  const [prevYear, setPrevYear] = useState<string>(initialPrevParsed.year);
  const [prevMonthIndex, setPrevMonthIndex] = useState<number>(initialPrevParsed.monthIndex);
  const [hasAutoAlignedPeriod, setHasAutoAlignedPeriod] = useState<boolean>(karanehPeriods.length > 0);

  useEffect(() => {
    if (!hasAutoAlignedPeriod && karanehPeriods.length > 0) {
      const latest = karanehPeriods[0];
      const p = parsePeriod(latest);
      const pp = parsePeriod(getPreviousPeriodId(latest));
      setCurrentYear(p.year);
      setCurrentMonthIndex(p.monthIndex);
      setPrevYear(pp.year);
      setPrevMonthIndex(pp.monthIndex);
      setHasAutoAlignedPeriod(true);
    }
  }, [karanehPeriods, hasAutoAlignedPeriod]);

  const currentPeriod = buildPeriod(currentYear, currentMonthIndex);
  const previousPeriod = buildPeriod(prevYear, prevMonthIndex);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTrend, setFilterTrend] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const [editingRecord, setEditingRecord] = useState<KaranehRecord | null>(null);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<KaranehRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteAllScope, setDeleteAllScope] = useState<'period' | 'all'>('period');
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Manual Form inputs (طراحی شده دقیقاً متناظر با جدول)
  const [formYear, setFormYear] = useState<string>('1403');
  const [formMonthIndex, setFormMonthIndex] = useState<number>(7);
  const [formData, setFormData] = useState<{
    personnelCode: string;
    firstName: string;
    lastName: string;
    position: string;
    department: string;
    finalKaraneh: number;
    notes: string;
  }>({
    personnelCode: '',
    firstName: '',
    lastName: '',
    position: '',
    department: '',
    finalKaraneh: 45000000,
    notes: ''
  });

  // Import modal states (با انتخاب اختصاصی سال و ماه)
  const [importYear, setImportYear] = useState<string>('1403');
  const [importMonthIndex, setImportMonthIndex] = useState<number>(7);
  const [importPrevYear, setImportPrevYear] = useState<string>('1403');
  const [importPrevMonthIndex, setImportPrevMonthIndex] = useState<number>(6);

  const importPeriod = buildPeriod(importYear, importMonthIndex);

  // Quick button to set previous month automatically
  const handleAutoSetPreviousMonth = () => {
    setHasAutoAlignedPeriod(true);
    const prevId = getPreviousPeriodId(currentPeriod);
    const parsed = parsePeriod(prevId);
    setPrevYear(parsed.year);
    setPrevMonthIndex(parsed.monthIndex);
  };

  // Calculate comparison rows between currentPeriod and previousPeriod (unit-isolated)
  const currentRecords = scopedKaranehList.filter(k => k.period === currentPeriod);

  useEffect(() => {
    const validIds = new Set(scopedKaranehList.filter(k => k.period === currentPeriod).map(k => k.id));
    setSelectedIds(prev => prev.filter(id => validIds.has(id)));
  }, [scopedKaranehList, currentPeriod]);
  const previousRecords = scopedKaranehList.filter(k => k.period === previousPeriod);

  const prevMap = new Map<string, KaranehRecord>();
  previousRecords.forEach(p => {
    prevMap.set(String(p.personnelCode).trim(), p);
  });

  const personnelByCode = useMemo(() => {
    const map = new Map<string, Personnel>();
    personnelList.forEach((p) => {
      const code = normalizeDuplicateKey(p.personnelCode);
      if (code) map.set(code, p);
    });
    return map;
  }, [personnelList]);

  const comparisonRows: KaranehComparisonRow[] = currentRecords.map(curr => {
    const code = String(curr.personnelCode).trim();
    const prev = prevMap.get(code);
    const pMatch = personnelByCode.get(normalizeDuplicateKey(code));

    const prevFinal = prev ? Number(prev.finalKaraneh || 0) : 0;
    const currFinal = Number(curr.finalKaraneh || 0);
    const diffAmount = currFinal - prevFinal;

    let diffPercent = 0;
    if (prevFinal > 0) {
      diffPercent = Number(((diffAmount / prevFinal) * 100).toFixed(1));
    } else if (currFinal > 0) {
      diffPercent = 100;
    }

    let trend: 'increase' | 'decrease' | 'unchanged' | 'new' = 'unchanged';
    if (!prev) {
      trend = 'new';
    } else if (diffAmount > 0) {
      trend = 'increase';
    } else if (diffAmount < 0) {
      trend = 'decrease';
    }

    const rawFull = String(curr.fullName || pMatch?.fullName || '').trim();
    const parts = rawFull ? rawFull.split(/\s+/).filter(Boolean) : [];
    const firstName = String(curr.firstName || '').trim() || String(pMatch?.firstName || '').trim() || parts[0] || '';
    const lastName = String(curr.lastName || '').trim() || String(pMatch?.lastName || '').trim() || parts.slice(1).join(' ') || '';

    return {
      id: curr.id,
      personnelCode: curr.personnelCode,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || rawFull,
      position: curr.position || '',
      department: curr.department || '',
      currentKaraneh: currFinal,
      previousKaraneh: prevFinal,
      diffAmount,
      diffPercent,
      trend,
      notes: curr.notes || '',
      status: curr.status || 'draft',
      submittedAt: curr.submittedAt,
      submittedByName: curr.submittedByName
    };
  });

  // Summary KPIs
  const totalCurrent = comparisonRows.reduce((sum, r) => sum + r.currentKaraneh, 0);
  const totalPrevious = comparisonRows.reduce((sum, r) => sum + r.previousKaraneh, 0);
  const totalDiff = totalCurrent - totalPrevious;
  const growthPercent = totalPrevious > 0 ? Number(((totalDiff / totalPrevious) * 100).toFixed(1)) : 0;

  const countIncreased = comparisonRows.filter(r => r.trend === 'increase').length;
  const countDecreased = comparisonRows.filter(r => r.trend === 'decrease').length;
  const countNew = comparisonRows.filter(r => r.trend === 'new').length;

  const departments = Array.from(new Set(comparisonRows.map(r => r.department))).filter(Boolean);

  const personnelNationalIdByCode = useMemo(() => {
    const map = new Map<string, string>();
    personnelList.forEach((p) => {
      const code = normalizeDuplicateKey(p.personnelCode);
      if (code && p.nationalId) {
        map.set(code, p.nationalId);
      }
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

  // Filtered comparison rows
  const filteredRows = comparisonRows.filter(r => {
    const term = searchTerm.toLowerCase();
    const nid = personnelNationalIdByCode.get(normalizeDuplicateKey(r.personnelCode)) || '';
    const matchesSearch =
      (r.firstName || '').toLowerCase().includes(term) ||
      (r.lastName || '').toLowerCase().includes(term) ||
      r.fullName.toLowerCase().includes(term) ||
      r.personnelCode.toLowerCase().includes(term) ||
      nid.toLowerCase().includes(term) ||
      r.department.toLowerCase().includes(term) ||
      r.position.toLowerCase().includes(term);

    const matchesTrend = filterTrend === 'all' || r.trend === filterTrend;
    const matchesDept = filterDepartment === 'all' || r.department === filterDepartment;
    const matchesDup = !onlyDuplicates || duplicateIndex.isDuplicateRow(r);

    return matchesSearch && matchesTrend && matchesDept && matchesDup;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTrend, filterDepartment, onlyDuplicates, currentPeriod, previousPeriod]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize]
  );

  // Handle open Add Modal (ثبت دستی کارانه)
  const handleOpenAdd = () => {
    setEditingRecord(null);
    setFormError('');
    setFormYear(currentYear);
    setFormMonthIndex(currentMonthIndex);

    const firstP = scopedPersonnelList[0];
    const prevBonus = firstP ? previousRecords.find(p => p.personnelCode === firstP.personnelCode) : null;
    const firstParts = (firstP?.fullName || '').trim().split(/\s+/).filter(Boolean);

    setFormData({
      personnelCode: firstP ? firstP.personnelCode : '',
      firstName: firstP ? (firstP.firstName || firstParts[0] || '') : '',
      lastName: firstP ? (firstP.lastName || firstParts.slice(1).join(' ') || '') : '',
      position: firstP ? firstP.position : '',
      department: firstP ? firstP.department : (allowedUnits[0] || ''),
      finalKaraneh: prevBonus ? prevBonus.finalKaraneh : 45000000,
      notes: ''
    });
    setIsFormOpen(true);
  };

  // Handle open Edit Modal
  const handleOpenEdit = (row: KaranehComparisonRow) => {
    const originalRecord =
      currentRecords.find(k => (row.id ? k.id === row.id : k.personnelCode === row.personnelCode)) ||
      currentRecords.find(k => k.personnelCode === row.personnelCode);
    if (!originalRecord) return;

    setEditingRecord(originalRecord);
    setFormError('');
    const parsed = parsePeriod(originalRecord.period);
    setFormYear(parsed.year);
    setFormMonthIndex(parsed.monthIndex);
    const fullParts = (originalRecord.fullName || '').trim().split(/\s+/).filter(Boolean);

    setFormData({
      personnelCode: originalRecord.personnelCode,
      firstName: originalRecord.firstName || row.firstName || fullParts[0] || '',
      lastName: originalRecord.lastName || row.lastName || fullParts.slice(1).join(' ') || '',
      position: originalRecord.position || '',
      department: originalRecord.department || allowedUnits[0] || '',
      finalKaraneh: originalRecord.finalKaraneh || 0,
      notes: originalRecord.notes || ''
    });
    setIsFormOpen(true);
  };

  // When personnel selected in manual form
  const handleSelectPersonnel = (code: string) => {
    const found = scopedPersonnelList.find(p => p.personnelCode === code);
    if (!found) return;

    const prevBonus = previousRecords.find(p => p.personnelCode === code);
    const nameParts = (found.fullName || '').trim().split(/\s+/).filter(Boolean);

    setFormData(prev => ({
      ...prev,
      personnelCode: found.personnelCode,
      firstName: found.firstName || nameParts[0] || '',
      lastName: found.lastName || nameParts.slice(1).join(' ') || '',
      position: found.position,
      department: found.department || allowedUnits[0] || '',
      finalKaraneh: prevBonus ? prevBonus.finalKaraneh : (found.baseSalary ? Math.round(found.baseSalary * 0.25) : 45000000)
    }));
  };

  // Submit manual form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const fn = formData.firstName.trim();
    const ln = formData.lastName.trim();
    if (!formData.personnelCode.trim() || (!fn && !ln)) {
      setFormError('لطفاً کد پرسنلی، نام و نام خانوادگی را وارد نمایید.');
      return;
    }

    const resolvedDept = (formData.department || allowedUnits[0] || '').trim();
    if (!hasFullAccess && !canUserAccessKaranehUnit(unitPermsCheck, false, resolvedDept)) {
      setFormError(`شما تنها مجاز به ثبت و ویرایش کارانه برای واحد(های) ${allowedUnits.join('، ')} هستید.`);
      return;
    }

    const targetPeriod = buildPeriod(formYear, formMonthIndex);

    const payload: Partial<KaranehRecord> = {
      id: editingRecord ? editingRecord.id : undefined,
      personnelCode: toEnglishDigits(formData.personnelCode).trim(),
      firstName: fn,
      lastName: ln,
      fullName: `${fn} ${ln}`.trim(),
      position: formData.position.trim(),
      department: resolvedDept,
      period: targetPeriod,
      finalKaraneh: Number(toEnglishDigits(formData.finalKaraneh)) || 0,
      baseKaraneh: Number(toEnglishDigits(formData.finalKaraneh)) || 0,
      overtimeBonus: 0,
      deductions: 0,
      notes: formData.notes || ''
    };

    const success = await onSaveKaraneh(payload);
    if (success) {
      setIsFormOpen(false);
      setHasAutoAlignedPeriod(true);
      // Synchronize current period if saved in another period
      if (targetPeriod !== currentPeriod) {
        setCurrentYear(formYear);
        setCurrentMonthIndex(formMonthIndex);
      }
    }
  };

  // Delete record
  const handleDeleteRecord = (row: KaranehComparisonRow) => {
    const original =
      currentRecords.find(k => (row.id ? k.id === row.id : k.personnelCode === row.personnelCode)) ||
      currentRecords.find(k => k.personnelCode === row.personnelCode);
    if (!original) return;
    setDeleteTarget(original);
  };

  const confirmDeleteRecord = async () => {
    if (!deleteTarget) return;
    await onDeleteKaraneh(deleteTarget.id);
    setDeleteTarget(null);
  };

  const filteredRecordIds = filteredRows
    .map(r => r.id || currentRecords.find(k => k.personnelCode === r.personnelCode)?.id)
    .filter((id): id is string => !!id);
  const allFilteredSelected = filteredRecordIds.length > 0 && filteredRecordIds.every(id => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredRecordIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredRecordIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
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
    const ok = await onDeleteAllKaraneh(deleteAllScope === 'period' ? currentPeriod : undefined);
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmDeleteAllOpen(false);
    }
  };

  // Smart Excel import handler (with strict unit validation)
  const handleSmartKaranehImport = async (mappedRows: Record<string, any>[]) => {
    if (mappedRows.length === 0) return;
    setImportError('');

    let normalizedRows = mappedRows;
    if (!hasFullAccess) {
      const firstAllowed = allowedUnits[0] || '';
      const badDepts = new Set<string>();
      let emptyCount = 0;

      normalizedRows = mappedRows.map((r) => {
        const rawDept = String(
          r.department || r['واحد'] || r['واحد اداری'] || r['واحد سازمانی'] || ''
        ).trim();
        const dept = rawDept || (allowedUnits.length === 1 ? firstAllowed : '');
        if (!dept) {
          emptyCount++;
        } else if (!canUserAccessKaranehUnit(unitPermsCheck, false, dept)) {
          badDepts.add(dept);
        }
        return { ...r, department: dept };
      });

      if (emptyCount > 0 || badDepts.size > 0) {
        const badList = Array.from(badDepts).slice(0, 3).join('، ');
        setImportError(
          badDepts.size > 0
            ? `امکان بارگذاری اکسل برای واحد(های) «${badList}» وجود ندارد. شما تنها مجاز به ثبت کارانه برای «${allowedUnits.join('، ')}» هستید.`
            : `لطفاً ستون «واحد» را در فایل اکسل مطابق واحد مجاز (${allowedUnits.join('، ')}) مشخص کنید.`
        );
        return;
      }
    }

    const success = await onBatchImportKaraneh(importPeriod, normalizedRows);
    if (success) {
      setHasAutoAlignedPeriod(true);
      setIsImportOpen(false);
      setSearchTerm('');
      setFilterTrend('all');
      setFilterDepartment('all');
      setOnlyDuplicates(false);
      setCurrentYear(importYear);
      setCurrentMonthIndex(importMonthIndex);
      setPrevYear(importPrevYear);
      setPrevMonthIndex(importPrevMonthIndex);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!onSubmitKaraneh) return;
    setSubmitting(true);
    const targetDept =
      !hasFullAccess && allowedUnits.length === 1
        ? allowedUnits[0]
        : filterDepartment !== 'all'
        ? filterDepartment
        : undefined;
    const ok = await onSubmitKaraneh(currentPeriod, targetDept);
    setSubmitting(false);
    if (ok) {
      setConfirmSubmitOpen(false);
    }
  };

  // Previous month bonus for the employee in the manual modal
  const selectedPrevRecord = previousRecords.find(p => p.personnelCode === formData.personnelCode);
  const modalPrevKaraneh = selectedPrevRecord ? selectedPrevRecord.finalKaraneh : 0;
  const modalCurrentKaraneh = Number(toEnglishDigits(formData.finalKaraneh)) || 0;
  const modalDiffAmount = modalCurrentKaraneh - modalPrevKaraneh;
  const modalDiffPercent = modalPrevKaraneh > 0 ? ((modalDiffAmount / modalPrevKaraneh) * 100) : 0;

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              سیستم جامع مدیریت کارانه و تحلیل مقایسه‌ای ماه قبل و جدید
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            ثبت دستی بر اساس جدول، ورود با اکسل (کد پرسنلی، نام، نام خانوادگی، واحد، پست و مبلغ)، و تحلیل خودکار تغییرات دو ماه
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefreshData && (
            <button
              type="button"
              onClick={() => onRefreshData()}
              disabled={Boolean(isRefreshing)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-bold transition-colors border border-indigo-200 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>بروزرسانی اطلاعات</span>
            </button>
          )}
          {allowExport && (
            <button
              onClick={() => exportKaranehComparisonToExcel(
                filteredRows,
                getPeriodLabel(currentPeriod),
                getPeriodLabel(previousPeriod)
              )}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors border border-emerald-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل مقایسه‌ای ({toPersianDigits(filteredRows.length)})</span>
            </button>
          )}

          {allowImport && (
            <button
              onClick={() => {
                setImportError('');
                setImportYear(currentYear);
                setImportMonthIndex(currentMonthIndex);
                setImportPrevYear(prevYear);
                setImportPrevMonthIndex(prevMonthIndex);
                setIsImportOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors border border-slate-200"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>آپلود هوشمند اکسل کارانه</span>
            </button>
          )}

          {/* Direct template download button */}
          <button
            onClick={() => downloadKaranehTemplate(allowedUnits[0] || '')}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود نمونه اکسل کارانه</span>
          </button>

          {allowDeleteAll && onDeleteAllKaraneh && scopedKaranehList.length > 0 && (
            <button
              onClick={() => {
                setDeleteAllScope(currentRecords.length > 0 ? 'period' : 'all');
                setConfirmDeleteAllOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors border border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>پاکسازی جدول کارانه</span>
            </button>
          )}

          {canCreate && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت دستی کارانه</span>
            </button>
          )}

          {canSubmit && onSubmitKaraneh && currentRecords.length > 0 && (
            <button
              onClick={() => setConfirmSubmitOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>تأیید و ارسال به کارانه نهایی</span>
            </button>
          )}
        </div>
      </div>

      {/* Unit Isolation Banner */}
      {!hasFullAccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold">
            <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              ایزوله‌سازی واحد سازمانی فعال است — شما تنها کارانه و پرسنل واحد(های) مجاز خود را مشاهده و مدیریت می‌کنید:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {allowedUnits.map((u) => (
              <span key={u} className="px-2.5 py-0.5 bg-white border border-emerald-300 text-emerald-900 rounded-lg font-bold text-[11px]">
                {u}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Period Selection Bar (انتخاب دقیق ماه و سال برای ماه جدید و ماه قبل) */}
      <div className="bg-slate-900 text-white p-4.5 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          <div className="flex flex-wrap items-center gap-3 text-xs">
            
            {/* 1. انتخاب ماه جدید (دوره جاری) */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 px-2.5 rounded-xl border border-slate-700">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-white whitespace-nowrap">کارانه ماه جدید:</span>
              
              {/* انتخاب ماه */}
              <select
                value={currentMonthIndex}
                onChange={(e) => {
                  setHasAutoAlignedPeriod(true);
                  setCurrentMonthIndex(Number(e.target.value));
                }}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-indigo-400"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>

              {/* انتخاب سال */}
              <select
                value={currentYear}
                onChange={(e) => {
                  setHasAutoAlignedPeriod(true);
                  setCurrentYear(e.target.value);
                }}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-indigo-400 persian-num"
              >
                {YEARS_LIST.map(y => (
                  <option key={y} value={y}>{toPersianDigits(y)}</option>
                ))}
              </select>
            </div>

            <ArrowLeftRight className="w-4 h-4 text-slate-500 hidden sm:inline" />

            {/* 2. انتخاب ماه قبل جهت مقایسه */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 px-2.5 rounded-xl border border-slate-700">
              <span className="font-bold text-amber-300 whitespace-nowrap">ماه قبل (مبنای مقایسه):</span>
              
              {/* انتخاب ماه */}
              <select
                value={prevMonthIndex}
                onChange={(e) => {
                  setHasAutoAlignedPeriod(true);
                  setPrevMonthIndex(Number(e.target.value));
                }}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-amber-400"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>

              {/* انتخاب سال */}
              <select
                value={prevYear}
                onChange={(e) => {
                  setHasAutoAlignedPeriod(true);
                  setPrevYear(e.target.value);
                }}
                className="bg-slate-900 text-white font-bold px-2 py-1 rounded-lg border border-slate-600 focus:ring-1 focus:ring-amber-400 persian-num"
              >
                {YEARS_LIST.map(y => (
                  <option key={y} value={y}>{toPersianDigits(y)}</option>
                ))}
              </select>
            </div>

            {/* Quick button to set to immediate previous month */}
            <button
              onClick={handleAutoSetPreviousMonth}
              title="تنظیم خودکار به ۱ ماه قبل از دوره جدید"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ماه قبل از این</span>
            </button>

          </div>

          <div className="text-xs text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[11px]">
              مقایسه آنلاین کارانه <b>{getPeriodLabel(previousPeriod)}</b> با <b>{getPeriodLabel(currentPeriod)}</b>
            </span>
          </div>

        </div>
      </div>

      {/* Comparison Statistics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            مجموع کارانه {getPeriodLabel(previousPeriod)} (ماه قبل)
          </span>
          <span className="text-lg font-bold text-slate-700 mt-1 block persian-num">
            {formatRial(totalPrevious)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            مجموع کارانه {getPeriodLabel(currentPeriod)} (ماه جدید)
          </span>
          <span className="text-lg font-bold text-indigo-700 mt-1 block persian-num">
            {formatRial(totalCurrent)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            تفاضل کل کارانه (تغییرات ریالی)
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-lg font-bold persian-num ${totalDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {totalDiff >= 0 ? `+${formatRial(totalDiff)}` : formatRial(totalDiff)}
            </span>
            {totalDiff > 0 && <ArrowUpRight className="w-4 h-4 text-emerald-600" />}
            {totalDiff < 0 && <ArrowDownRight className="w-4 h-4 text-rose-600" />}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">
            درصد رشد کلی و پرسنل مشمول
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-lg font-bold persian-num ${growthPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {growthPercent > 0 ? `+${toPersianDigits(growthPercent)}٪` : `${toPersianDigits(growthPercent)}٪`}
            </span>
            <span className="text-xs text-slate-600 persian-num">
              {toPersianDigits(comparisonRows.length)} نفر
            </span>
          </div>
        </div>

      </div>

      {/* Duplicate Personnel Warning Banner */}
      {duplicateIndex.totalDuplicateRows > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="persian-num">
              <span className="font-bold">هشدار اطلاعات تکراری در کارانه ماه {getPeriodLabel(currentPeriod)}:</span>{' '}
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

      {/* Filters & Search Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        
        {/* Search */}
        <div className="md:col-span-4 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو بر اساس نام، کد پرسنلی، کد ملی، پست یا واحد..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Trend */}
        <div className="md:col-span-3">
          <select
            value={filterTrend}
            onChange={(e) => setFilterTrend(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">تمام وضعیت‌های تغییر کارانه</option>
            <option value="increase">فقط مبالغ افزایش‌یافته ({toPersianDigits(countIncreased)})</option>
            <option value="decrease">فقط مبالغ کاهش‌یافته ({toPersianDigits(countDecreased)})</option>
            <option value="new">پرسنل جدید این ماه ({toPersianDigits(countNew)})</option>
            <option value="unchanged">بدون تغییر</option>
          </select>
        </div>

        {/* Filter Department */}
        <div className="md:col-span-3">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">همه واحدها ({toPersianDigits(departments.length)})</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Duplicate filter toggle */}
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
            <span>{toPersianDigits(selectedIds.length)} رکورد کارانه دوره {getPeriodLabel(currentPeriod)} انتخاب شده است</span>
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

      {/* The Central Comparison Table with explicit 'پست سازمانی' Column */}
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
                      title="انتخاب همه ردیف‌های فیلترشده"
                      className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-3 text-center w-12">ردیف</th>
                <th className="py-3 px-3">کد پرسنلی</th>
                <th className="py-3 px-3">نام</th>
                <th className="py-3 px-3">نام خانوادگی</th>
                {/* ستون اختصاصی و تفکیک‌شده پست سازمانی طبق درخواست کاربر */}
                <th className="py-3 px-4 bg-indigo-50/30 text-indigo-950 font-bold border-x border-slate-200/60">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                    <span>پست سازمانی</span>
                  </div>
                </th>
                <th className="py-3 px-3">واحد اداری</th>
                <th className="py-3 px-3 bg-slate-100/70 font-bold text-slate-700">
                  کارانه {getPeriodLabel(previousPeriod)} (ماه قبل)
                </th>
                <th className="py-3 px-3 bg-indigo-50/60 font-bold text-indigo-900">
                  کارانه {getPeriodLabel(currentPeriod)} (ماه جدید)
                </th>
                <th className="py-3 px-3 font-bold">تغییرات مبلغ (ریال)</th>
                <th className="py-3 px-3 text-center font-bold">درصد تغییر</th>
                <th className="py-3 px-3 text-center font-bold">وضعیت روند</th>
                <th className="py-3 px-3 text-center font-bold">وضعیت ارسال</th>
                <th className="py-3 px-4">توضیحات و علت تغییر</th>
                <th className="py-3 px-3 text-center w-24">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={canDelete ? 15 : 14} className="py-12 text-center text-slate-600">
                    رکوردی برای دوره {getPeriodLabel(currentPeriod)} با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
                  const rowRecordId = row.id || currentRecords.find(k => k.personnelCode === row.personnelCode)?.id;
                  const isSelected = !!rowRecordId && selectedIds.includes(rowRecordId);
                  const dupReasons = duplicateIndex.getRowDuplicateReasons(row);
                  const isDup = dupReasons.length > 0;
                  const nid = personnelNationalIdByCode.get(normalizeDuplicateKey(row.personnelCode)) || '';
                  return (
                  <tr
                    key={rowRecordId || `${row.personnelCode}-${idx}`}
                    className={
                      isSelected
                        ? 'bg-indigo-50/40 transition-colors'
                        : isDup
                        ? 'bg-amber-50/60 hover:bg-amber-100/50 transition-colors'
                        : 'hover:bg-slate-50/70 transition-colors'
                    }
                  >
                    {canDelete && (
                      <td className="py-3.5 px-2.5 text-center">
                        {rowRecordId && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(rowRecordId)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        )}
                      </td>
                    )}
                    <td className="py-3.5 px-3 text-center text-slate-600 persian-num">
                      {toPersianDigits((safePage - 1) * pageSize + idx + 1)}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-slate-800 persian-num">
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
                    <td className="py-3.5 px-3 font-bold text-slate-900">
                      <div>{row.firstName || '—'}</div>
                      {nid && (
                        <div className="text-[10px] text-slate-500 font-normal persian-num">
                          کد ملی: {toPersianDigits(nid)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-slate-900">
                      {row.lastName || '—'}
                    </td>
                    
                    {/* ستون اختصاصی و شکیل پست سازمانی */}
                    <td className="py-3.5 px-4 bg-indigo-50/10 border-x border-slate-100 font-semibold text-slate-800">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] border border-slate-200">
                        <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span>{row.position || '—'}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-slate-600">
                      {row.department || '—'}
                    </td>
                    
                    {/* Previous Month Karaneh */}
                    <td className="py-3.5 px-3 bg-slate-50/50 font-semibold text-slate-600 persian-num">
                      {row.previousKaraneh > 0 ? formatRial(row.previousKaraneh) : <span className="text-slate-400">بدون سابقه</span>}
                    </td>

                    {/* Current Month Karaneh */}
                    <td className="py-3.5 px-3 bg-indigo-50/30 font-bold text-indigo-800 persian-num">
                      {formatRial(row.currentKaraneh)}
                    </td>

                    {/* Diff Amount */}
                    <td className="py-3.5 px-3 font-bold persian-num">
                      {row.diffAmount > 0 ? (
                        <span className="text-emerald-700">+{formatRial(row.diffAmount)}</span>
                      ) : row.diffAmount < 0 ? (
                        <span className="text-rose-700">{formatRial(row.diffAmount)}</span>
                      ) : (
                        <span className="text-slate-600">۰ ریال</span>
                      )}
                    </td>

                    {/* Diff Percent */}
                    <td className="py-3.5 px-3 text-center">
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] persian-num ${
                        row.trend === 'increase'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : row.trend === 'decrease'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : row.trend === 'new'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {row.trend === 'increase' && <ArrowUpRight className="w-3 h-3 text-emerald-600" />}
                        {row.trend === 'decrease' && <ArrowDownRight className="w-3 h-3 text-rose-600" />}
                        {row.trend === 'new' ? 'جدید' : formatPercent(row.diffPercent)}
                      </span>
                    </td>

                    {/* Trend status badge */}
                    <td className="py-3.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.trend === 'increase'
                          ? 'bg-emerald-100/70 text-emerald-800'
                          : row.trend === 'decrease'
                          ? 'bg-rose-100/70 text-rose-800'
                          : row.trend === 'new'
                          ? 'bg-blue-100/70 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {row.trend === 'increase' ? 'افزایشی' :
                         row.trend === 'decrease' ? 'کاهشی' :
                         row.trend === 'new' ? 'پرسنل جدید' : 'بدون تغییر'}
                      </span>
                    </td>

                    {/* Submission status badge */}
                    <td className="py-3.5 px-3 text-center">
                      {row.status === 'submitted' ? (
                        <span
                          title={row.submittedAt ? `ارسال‌شده در ${row.submittedAt}` : 'ارسال‌شده به کارانه نهایی'}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>ارسال‌شده</span>
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                          پیش‌نویس واحد
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={row.notes}>
                      {row.notes || '—'}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      {(canEdit || canDelete) && (
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(row)}
                              title="ویرایش کارانه و مبالغ"
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteRecord(row)}
                              title="حذف رکورد کارانه این ماه"
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
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
          extraRight={
            <span className="text-slate-500">
              دوره <b>{getPeriodLabel(currentPeriod)}</b> در مقایسه با <b>{getPeriodLabel(previousPeriod)}</b>
            </span>
          }
        />
      </div>

      {/* Manual Entry Modal (ثبت دستی کارانه منطبق بر ستون‌های جدول) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-base">
                    {editingRecord ? `ویرایش کارانه (${`${formData.firstName} ${formData.lastName}`.trim() || editingRecord.fullName})` : 'ثبت دستی کارانه ماهانه پرسنل'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ورود اطلاعات منطبق بر جدول کارانه با مقایسه خودکار کارانه ماه قبل
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              
              {/* انتخاب ماه و سال کارانه */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  دوره ثبت کارانه (ماه و سال):
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={formMonthIndex}
                    onChange={(e) => setFormMonthIndex(Number(e.target.value))}
                    className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  >
                    {PERSIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                    className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 persian-num focus:ring-2 focus:ring-indigo-500"
                  >
                    {YEARS_LIST.map(y => (
                      <option key={y} value={y}>{toPersianDigits(y)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* انتخاب سریع از لیست پرسنل موجود جهت تکمیل خودکار اطلاعات */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  انتخاب پرسنل جهت تکمیل سریع مشخصات (یا ورود دستی فیلدهای زیر):
                </label>
                <select
                  disabled={!!editingRecord}
                  value={formData.personnelCode}
                  onChange={(e) => handleSelectPersonnel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                >
                  <option value="">-- انتخاب از پرونده‌های پرسنلی مجاز --</option>
                  {scopedPersonnelList.map(p => (
                    <option key={p.id} value={p.personnelCode}>
                      {toPersianDigits(p.personnelCode)} - {p.fullName} ({p.position} - {p.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* فیلدهای جدول: کد پرسنلی، نام، نام خانوادگی، پست سازمانی، واحد اداری */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    کد پرسنلی *
                  </label>
                  <input
                    type="text"
                    required
                    value={toPersianDigits(formData.personnelCode)}
                    onChange={(e) => setFormData({ ...formData, personnelCode: toEnglishDigits(e.target.value) })}
                    placeholder="مثلاً: ۱۰۱۰۱"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 persian-num font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    نام *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="مثلاً: رضا"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    نام خانوادگی *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="مثلاً: قاسمی"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold"
                  />
                </div>

                {/* پست سازمانی */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    پست سازمانی *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="مثلاً: مدیر فناوری اطلاعات"
                      className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                    <Briefcase className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>

                {/* واحد اداری */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    واحد اداری *
                  </label>
                  <div className="relative">
                    {!hasFullAccess && allowedUnits.length > 1 ? (
                      <select
                        required
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold"
                      >
                        {allowedUnits.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        readOnly={!hasFullAccess && allowedUnits.length === 1}
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        placeholder="مثلاً: فناوری اطلاعات"
                        className={`w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 ${
                          !hasFullAccess && allowedUnits.length === 1 ? 'bg-slate-100 font-bold cursor-not-allowed' : 'bg-slate-50'
                        }`}
                      />
                    )}
                    <Building className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              {/* مقایسه کارانه ماه قبل به صورت زنده در فرم */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950">
                    کارانه پرداختی ماه قبل ({getPeriodLabel(previousPeriod)}):
                  </span>
                  <span className="font-bold text-amber-900 text-sm persian-num">
                    {modalPrevKaraneh > 0 ? formatRial(modalPrevKaraneh) : 'بدون سابقه کارانه در ماه قبل'}
                  </span>
                </div>

                {modalPrevKaraneh > 0 && modalCurrentKaraneh > 0 && (
                  <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px]">
                    <span className="text-amber-800">تغییرات نسبت به ماه قبل:</span>
                    <span className={`font-bold persian-num ${modalDiffAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {modalDiffAmount >= 0 ? `+${formatRial(modalDiffAmount)}` : formatRial(modalDiffAmount)} ({modalDiffAmount >= 0 ? `+${formatPercent(modalDiffPercent)}` : formatPercent(modalDiffPercent)})
                    </span>
                  </div>
                )}
              </div>

              {/* فیلد اصلی مبلغ کارانه جدید (ریال) به همراه تبدیل خودکار به حروف */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-900">
                  مبلغ کارانه این ماه (ریال) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={toPersianDigits(formData.finalKaraneh)}
                    onChange={(e) => {
                      const raw = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setFormData({ ...formData, finalKaraneh: Number(raw) || 0 });
                    }}
                    className="w-full px-3 py-2.5 bg-white border border-indigo-300 rounded-xl text-sm font-bold text-indigo-900 persian-num focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* نمایش همزمان مبلغ به ریال و تومان و تبدیل به حروف */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs pt-1">
                  <div className="font-bold text-emerald-800 persian-num">
                    معادل عددی: {formatRial(formData.finalKaraneh)}
                  </div>
                  <div className="text-slate-600 font-medium">
                    به حروف: <b className="text-slate-900">{numberToPersianWords(formData.finalKaraneh)} ریال</b>
                  </div>
                </div>
              </div>

              {/* توضیحات و علت تغییرات */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  توضیحات و علت تغییرات کارانه (اختیاری)
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="مثلاً: ارتقای راندمان کاری، تحویل به موقع پروژه‌ها، اضافه کاری مازاد..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>

              {/* Footer buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  {editingRecord ? 'ذخیره تغییرات کارانه' : 'ثبت کارانه در دیتابیس'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Smart Excel Upload Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden my-6 p-5 max-h-[92vh] overflow-y-auto space-y-3">
            {importError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{importError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setImportError('')}
                  className="text-rose-600 hover:text-rose-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <SmartExcelImportMapper
              moduleType="karaneh"
              title="ورود هوشمند فایل اکسل کارانه ماهانه"
              subtitle="تشخیص خودکار ستون‌های کد پرسنلی، نام، نام خانوادگی، واحد، پست و مبلغ کارانه با انتخاب دوره هدف و مبنای مقایسه"
              onDownloadTemplate={() => downloadKaranehTemplate(allowedUnits[0] || '')}
              templateLabel="دانلود نمونه اکسل کارانه"
              onImport={handleSmartKaranehImport}
              onCancel={() => {
                setImportError('');
                setIsImportOpen(false);
              }}
              accentColor="emerald"
              confirmLabel={`تأیید و ثبت کارانه دوره ${getPeriodLabel(importPeriod)}`}
              extraOptions={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">دوره کارانه فایل اکسل (ماه جدید):</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={importMonthIndex}
                        onChange={(e) => setImportMonthIndex(Number(e.target.value))}
                        className="w-2/3 bg-white border border-slate-300 rounded-lg p-2 font-bold text-xs"
                      >
                        {PERSIAN_MONTHS.map((m, idx) => (
                          <option key={m} value={idx}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={importYear}
                        onChange={(e) => setImportYear(e.target.value)}
                        className="w-1/3 bg-white border border-slate-300 rounded-lg p-2 font-bold text-xs persian-num"
                      >
                        {YEARS_LIST.map(y => (
                          <option key={y} value={y}>{toPersianDigits(y)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">ماه قبل جهت مقایسه آنلاین تغییرات:</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={importPrevMonthIndex}
                        onChange={(e) => setImportPrevMonthIndex(Number(e.target.value))}
                        className="w-2/3 bg-white border border-slate-300 rounded-lg p-2 font-bold text-xs"
                      >
                        {PERSIAN_MONTHS.map((m, idx) => (
                          <option key={m} value={idx}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={importPrevYear}
                        onChange={(e) => setImportPrevYear(e.target.value)}
                        className="w-1/3 bg-white border border-slate-300 rounded-lg p-2 font-bold text-xs persian-num"
                      >
                        {YEARS_LIST.map(y => (
                          <option key={y} value={y}>{toPersianDigits(y)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف رکورد کارانه</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              آیا از حذف رکورد کارانه پرسنل <b>{deleteTarget.fullName}</b> ({deleteTarget.position}) در دوره <b>{getPeriodLabel(currentPeriod)}</b> اطمینان دارید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={confirmDeleteRecord}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف گروهی رکوردهای کارانه</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedIds.length)} رکورد کارانه</b> در دوره <b>{getPeriodLabel(currentPeriod)}</b> اطمینان دارید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmBatchDeleteOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50 persian-num"
              >
                {batchDeleting ? 'در حال حذف...' : `بله، حذف ${toPersianDigits(selectedIds.length)} رکورد`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Karaneh Modal */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">پاکسازی کامل رکوردهای کارانه</h3>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="karanehDeleteScope"
                  checked={deleteAllScope === 'period'}
                  onChange={() => setDeleteAllScope('period')}
                />
                <span className="font-bold text-slate-800 persian-num">
                  فقط دوره جاری ({getPeriodLabel(currentPeriod)} - {toPersianDigits(currentRecords.length)} رکورد)
                </span>
              </label>
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-rose-200 bg-rose-50/40 cursor-pointer hover:bg-rose-50">
                <input
                  type="radio"
                  name="karanehDeleteScope"
                  checked={deleteAllScope === 'all'}
                  onChange={() => setDeleteAllScope('all')}
                />
                <span className="font-bold text-rose-800 persian-num">
                  پاکسازی کل جدول کارانه در تمام ماه‌ها ({toPersianDigits(scopedKaranehList.length)} رکورد)
                </span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchDeleting ? 'در حال پاکسازی...' : 'تأیید و پاکسازی قطعی'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Unit Karaneh Confirmation Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-violet-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-violet-800">
              <Send className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">تأیید و ارسال کارانه به کارانه نهایی ارسالی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              پس از تأیید، اطلاعات کارانه دوره <b>{getPeriodLabel(currentPeriod)}</b> برای{' '}
              <b>
                {!hasFullAccess
                  ? allowedUnits.join('، ')
                  : filterDepartment !== 'all'
                  ? `واحد ${filterDepartment}`
                  : 'تمامی واحدهای نمایش‌داده‌شده'}
              </b>{' '}
              به صفحه تجمیعی <b>«کارانه نهایی ارسالی»</b> منتقل خواهد شد.
            </p>
            <div className="p-3 bg-violet-50/70 rounded-xl border border-violet-200 space-y-1.5 persian-num">
              <div className="flex justify-between">
                <span className="text-slate-600">تعداد پرسنل مشمول ارسال:</span>
                <b className="text-slate-900">{toPersianDigits(currentRecords.length)} نفر</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">جمع کل کارانه دوره:</span>
                <b className="text-violet-900">{formatRial(totalCurrent)}</b>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                disabled={submitting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {submitting ? 'در حال ارسال نهایی...' : 'بله، تأیید و ارسال نهایی'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
