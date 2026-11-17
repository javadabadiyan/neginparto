import React, { useState, useMemo } from 'react';
import {
  User,
  MiningVolumeRecord,
  MiningMachineryRecord,
  UnitOperationalReport,
  GranularUnitOperationsPermissions,
  UserPermissions,
} from '../types';
import { canUserAccessMiningUnit, normalizePermissions } from '../utils/permissions';
import {
  toPersianDigits,
  formatPercent,
  getPeriodLabel,
  getPreviousPeriodId,
} from '../utils/persian';
import {
  downloadUnitReportsTemplate,
  exportUnitReportsToExcel,
} from '../utils/excel';
import { MINING_UNITS_CATALOG } from './CeoMiningUnitsPanel';
import { CeoVolumesPanel } from './CeoVolumesPanel';
import { CeoMachineryPanel } from './CeoMachineryPanel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Mountain,
  Wrench,
  Layers,
  Upload,
  Download,
  FileSpreadsheet,
  Plus,
  Edit3,
  Trash2,
  Eye,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Truck,
  Clock,
  Crown,
} from 'lucide-react';

interface UnitOperationsModuleProps {
  currentUser: User | null;
  miningVolumes: MiningVolumeRecord[];
  miningMachinery: MiningMachineryRecord[];
  unitReports: UnitOperationalReport[];
  granularPermissions?: GranularUnitOperationsPermissions;
  isSuperAdmin?: boolean;
  onSaveVolume: (record: Partial<MiningVolumeRecord>) => Promise<{ success: boolean; message?: string }>;
  onBatchImportVolumes: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDeleteVolume: (id: string) => Promise<void>;
  onBatchDeleteVolumes: (ids: string[]) => Promise<void>;
  onDeleteAllVolumes: () => Promise<void>;
  onSaveMachinery: (record: Partial<MiningMachineryRecord>) => Promise<{ success: boolean; message?: string }>;
  onBatchImportMachinery: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDeleteMachinery: (id: string) => Promise<void>;
  onBatchDeleteMachinery: (ids: string[]) => Promise<void>;
  onDeleteAllMachinery: () => Promise<void>;
  onSaveUnitReport: (record: Partial<UnitOperationalReport>) => Promise<{ success: boolean; message?: string }>;
  onBatchImportUnitReports: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDeleteUnitReport: (id: string) => Promise<void>;
  onBatchDeleteUnitReports: (ids: string[]) => Promise<void>;
  onDeleteAllUnitReports: () => Promise<void>;
  onNavigateToCeoDashboard?: () => void;
  canViewCeoDashboard?: boolean;
}

const formatNum = (val: number) => toPersianDigits(Math.round((val || 0) * 100) / 100);

export const UnitOperationsModule: React.FC<UnitOperationsModuleProps> = ({
  currentUser,
  miningVolumes,
  miningMachinery,
  unitReports,
  granularPermissions,
  isSuperAdmin = false,
  onSaveVolume,
  onBatchImportVolumes,
  onDeleteVolume,
  onBatchDeleteVolumes,
  onDeleteAllVolumes,
  onSaveMachinery,
  onBatchImportMachinery,
  onDeleteMachinery,
  onBatchDeleteMachinery,
  onDeleteAllMachinery,
  onSaveUnitReport,
  onBatchImportUnitReports,
  onDeleteUnitReport,
  onBatchDeleteUnitReports,
  onDeleteAllUnitReports,
  onNavigateToCeoDashboard,
  canViewCeoDashboard = false,
}) => {
  const normalizedUserPerms: UserPermissions = useMemo(
    () => normalizePermissions(currentUser?.permissions),
    [currentUser?.permissions]
  );

  const effectivePerms = granularPermissions || normalizedUserPerms.unitOperations;
  const canCreate = isSuperAdmin || Boolean(effectivePerms?.create);
  const canEdit = isSuperAdmin || Boolean(effectivePerms?.edit);
  const canDelete = isSuperAdmin || Boolean(effectivePerms?.delete);
  const canDeleteAll = isSuperAdmin || Boolean(effectivePerms?.deleteAll);
  const canImportExcel = isSuperAdmin || Boolean(effectivePerms?.importExcel);
  const canExportExcel = isSuperAdmin || Boolean(effectivePerms?.exportExcel);

  // Build accessible mining units list (catalog + any custom unit names registered in reports/volumes)
  const accessibleUnitNames = useMemo(() => {
    const allUnitsSet = new Set<string>(MINING_UNITS_CATALOG.map((u) => u.unitName));
    unitReports.forEach((r) => {
      if (r.unitName && r.unitName.trim()) allUnitsSet.add(r.unitName.trim());
    });
    miningVolumes.forEach((v) => {
      if (v.unitName && v.unitName.trim()) allUnitsSet.add(v.unitName.trim());
    });
    const list = Array.from(allUnitsSet);
    return list.filter((unitName) =>
      canUserAccessMiningUnit(normalizedUserPerms, isSuperAdmin, unitName)
    );
  }, [unitReports, miningVolumes, normalizedUserPerms, isSuperAdmin]);

  const canAccessDispatching = useMemo(
    () =>
      isSuperAdmin ||
      Boolean(normalizedUserPerms.ceoDashboard?.view) ||
      accessibleUnitNames.some(
        (u) =>
          u.includes('دیسپچینگ') ||
          u.includes('استخراج') ||
          u.includes('حمل') ||
          u.includes('فرآوری')
      ),
    [isSuperAdmin, normalizedUserPerms.ceoDashboard?.view, accessibleUnitNames]
  );

  const canAccessWorkshop = useMemo(
    () =>
      isSuperAdmin ||
      Boolean(normalizedUserPerms.ceoDashboard?.view) ||
      accessibleUnitNames.some((u) => u.includes('تعمیرگاه') || u.includes('نگهداری')),
    [isSuperAdmin, normalizedUserPerms.ceoDashboard?.view, accessibleUnitNames]
  );

  const defaultTab: 'dispatching' | 'workshop' | 'units' = useMemo(() => {
    if (!canAccessDispatching && canAccessWorkshop) return 'workshop';
    if (!canAccessDispatching && !canAccessWorkshop) return 'units';
    return 'dispatching';
  }, [canAccessDispatching, canAccessWorkshop]);

  const [activeSubTab, setActiveSubTab] = useState<'dispatching' | 'workshop' | 'units'>(defaultTab);

  // Scoped datasets for volumes, machinery, and unit reports
  const accessibleVolumes = useMemo(() => {
    if (isSuperAdmin || normalizedUserPerms.ceoDashboard?.view) return miningVolumes;
    return miningVolumes.filter((v) =>
      canUserAccessMiningUnit(normalizedUserPerms, false, v.unitName)
    );
  }, [miningVolumes, normalizedUserPerms, isSuperAdmin]);

  const accessibleMachinery = useMemo(() => {
    if (isSuperAdmin || normalizedUserPerms.ceoDashboard?.view || canAccessWorkshop) {
      return miningMachinery;
    }
    return miningMachinery.filter((m) =>
      canUserAccessMiningUnit(normalizedUserPerms, false, m.unitName)
    );
  }, [miningMachinery, normalizedUserPerms, isSuperAdmin, canAccessWorkshop]);

  const accessibleUnitReports = useMemo(() => {
    if (isSuperAdmin || normalizedUserPerms.ceoDashboard?.view) return unitReports;
    return unitReports.filter((r) =>
      canUserAccessMiningUnit(normalizedUserPerms, false, r.unitName)
    );
  }, [unitReports, normalizedUserPerms, isSuperAdmin]);

  // Machinery quick live stats for Workshop header cards
  const workshopStats = useMemo(() => {
    const total = accessibleMachinery.length;
    const ready = accessibleMachinery.filter((m) => m.status === 'آماده به کار').length;
    const broken = accessibleMachinery.filter((m) => m.status === 'خراب / در تعمیرگاه').length;
    const waitingParts = accessibleMachinery.filter((m) => m.status === 'در انتظار قطعه').length;
    const periodic = accessibleMachinery.filter((m) => m.status === 'سرویس دوره‌ای').length;
    const readinessPct = total > 0 ? Math.round((ready / total) * 100) : 0;
    return { total, ready, broken, waitingParts, periodic, readinessPct };
  }, [accessibleMachinery]);

  // States for 'units' (all mining units Excel & reporting hub)
  const availablePeriods = useMemo(() => {
    const set = new Set<string>(accessibleUnitReports.map((r) => r.period).filter(Boolean));
    if (set.size === 0) {
      set.add('1403-08');
      set.add('1403-07');
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [accessibleUnitReports]);

  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [currentPeriod, setCurrentPeriod] = useState<string>(availablePeriods[0] || '1403-08');
  const [previousPeriod, setPreviousPeriod] = useState<string>(
    availablePeriods[1] || getPreviousPeriodId(availablePeriods[0] || '1403-08')
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [editingReport, setEditingReport] = useState<Partial<UnitOperationalReport> | null>(null);
  const [detailReport, setDetailReport] = useState<UnitOperationalReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const unitFilteredReports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return accessibleUnitReports.filter((r) => {
      if (selectedUnit !== 'ALL' && r.unitName !== selectedUnit) return false;
      if (q) {
        const text = `${r.unitName} ${r.reportCategory} ${r.metricName} ${r.submittedBy || ''} ${r.notes || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [accessibleUnitReports, selectedUnit, searchTerm]);

  const currentPeriodReports = useMemo(
    () => unitFilteredReports.filter((r) => r.period === currentPeriod),
    [unitFilteredReports, currentPeriod]
  );

  const previousPeriodReports = useMemo(
    () => unitFilteredReports.filter((r) => r.period === previousPeriod),
    [unitFilteredReports, previousPeriod]
  );

  // Pair current period rows with matching previous period row or inline previousValue
  const comparisonRows = useMemo(() => {
    return currentPeriodReports.map((curr) => {
      const prevMatch = previousPeriodReports.find(
        (p) => p.unitName === curr.unitName && p.metricName === curr.metricName
      );
      const prevResolved =
        prevMatch !== undefined
          ? Number(prevMatch.actualValue || 0)
          : Number(curr.previousValue || 0);
      const actual = Number(curr.actualValue || 0);
      const target = Number(curr.targetValue || 0);
      const diff = actual - prevResolved;
      const diffPct = prevResolved > 0 ? ((diff / prevResolved) * 100) : 0;
      const targetPct = target > 0 ? ((actual / target) * 100) : 0;
      return {
        ...curr,
        prevResolved,
        diff,
        diffPct,
        targetPct,
      };
    });
  }, [currentPeriodReports, previousPeriodReports]);

  const unitKpis = useMemo(() => {
    const count = comparisonRows.length;
    const totalActual = comparisonRows.reduce((s, r) => s + Number(r.actualValue || 0), 0);
    const totalPrev = comparisonRows.reduce((s, r) => s + Number(r.prevResolved || 0), 0);
    const totalTarget = comparisonRows.reduce((s, r) => s + Number(r.targetValue || 0), 0);
    const diff = totalActual - totalPrev;
    const changePct = totalPrev > 0 ? (diff / totalPrev) * 100 : 0;
    const achievementPct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
    return { count, totalActual, totalPrev, totalTarget, diff, changePct, achievementPct };
  }, [comparisonRows]);

  const comparisonChartData = useMemo(
    () =>
      comparisonRows.slice(0, 10).map((r) => ({
        name:
          r.metricName.length > 22 ? `${r.metricName.slice(0, 22)}...` : r.metricName,
        fullName: `${r.unitName} - ${r.metricName}`,
        actual: Number(r.actualValue || 0),
        previous: Number(r.prevResolved || 0),
        target: Number(r.targetValue || 0),
      })),
    [comparisonRows]
  );

  const monthlyTrendChartData = useMemo(() => {
    const byPeriod = new Map<string, { period: string; actualSum: number; targetSum: number; count: number }>();
    unitFilteredReports.forEach((r) => {
      if (!r.period) return;
      if (!byPeriod.has(r.period)) {
        byPeriod.set(r.period, { period: r.period, actualSum: 0, targetSum: 0, count: 0 });
      }
      const bucket = byPeriod.get(r.period)!;
      bucket.actualSum += Number(r.actualValue || 0);
      bucket.targetSum += Number(r.targetValue || 0);
      bucket.count += 1;
    });
    return Array.from(byPeriod.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((item) => ({
        ...item,
        label: getPeriodLabel(item.period),
      }));
  }, [unitFilteredReports]);

  const visibleTableRows = useMemo(
    () =>
      unitFilteredReports
        .slice()
        .sort((a, b) => b.period.localeCompare(a.period) || a.unitName.localeCompare(b.unitName)),
    [unitFilteredReports]
  );

  const allSelected =
    visibleTableRows.length > 0 && visibleTableRows.every((r) => selectedIds.includes(r.id));

  const handleToggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(visibleTableRows.map((r) => r.id));
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleOpenNewReport = () => {
    setEditingReport({
      period: currentPeriod || '1403-08',
      unitName: selectedUnit !== 'ALL' ? selectedUnit : (accessibleUnitNames[0] || 'کارخانه فرآوری و سنگ‌شکن'),
      reportCategory: 'عملکرد تولید و عملیات',
      metricName: '',
      actualValue: 0,
      previousValue: 0,
      targetValue: 0,
      unitLabel: 'تن',
      status: 'ثبت‌شده',
      submittedBy: currentUser?.fullName || '',
      notes: '',
    });
  };

  const handleSaveReportForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport?.metricName?.trim() || !editingReport?.unitName?.trim()) {
      setFeedback({ type: 'error', text: 'نام واحد عملیاتی و عنوان شاخص گزارش الزامی است.' });
      return;
    }
    const res = await onSaveUnitReport(editingReport);
    if (res.success) {
      setEditingReport(null);
      setFeedback({ type: 'success', text: res.message || 'گزارش عملیاتی واحد با موفقیت ذخیره شد.' });
    } else {
      setFeedback({ type: 'error', text: res.message || 'خطا در ذخیره گزارش واحد.' });
    }
  };

  const handleSmartImportReports = async (rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) return;
    const defaultUnit =
      selectedUnit !== 'ALL' ? selectedUnit : (accessibleUnitNames[0] || 'استخراج و معدن‌کاری');
    const prepared = rows.map((r) => ({
      ...r,
      period: r.period || currentPeriod || '1403-08',
      unitName: r.unitName || defaultUnit,
      submittedBy: r.submittedBy || currentUser?.fullName || '',
    }));
    const res = await onBatchImportUnitReports(prepared);
    if (res.success) {
      setShowSmartImport(false);
      setFeedback({
        type: 'success',
        text: res.message || `${toPersianDigits(prepared.length)} ردیف گزارش واحد از اکسل وارد شد و به داشبورد مدیرعامل ارسال گردید.`,
      });
    } else {
      setFeedback({ type: 'error', text: res.message || 'خطا در ورود فایل اکسل واحد.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Operational Units Header */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                پنل یکپارچه عملیات واحدهای معدن، دیسپچینگ و تعمیرگاه
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                هر واحد عملیاتی شرکت نگین پرتو نصر (دیسپچینگ، تعمیرگاه، استخراج، فرآوری، حفاری، حمل‌ونقل، نت، زمین‌شناسی، HSE، انبار، حراست و ستاد) اطلاعات و اکسل خود را اینجا بارگذاری می‌کند و داده‌ها به‌صورت خودکار در داشبورد راهبردی مدیرعامل تجمیع و پایش می‌شوند.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canViewCeoDashboard && onNavigateToCeoDashboard && (
              <button
                type="button"
                onClick={onNavigateToCeoDashboard}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
              >
                <Crown className="w-4 h-4" />
                <span>مشاهده تجمیع در داشبورد مدیرعامل</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-module Tab Switcher */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2 text-xs">
          {canAccessDispatching && (
            <button
              type="button"
              onClick={() => setActiveSubTab('dispatching')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer persian-num ${
                activeSubTab === 'dispatching'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Mountain className="w-4 h-4" />
              <span>واحد دیسپچینگ و کنترل تولید (آمار حجم عملیات)</span>
              <span className="px-2 py-0.5 rounded-lg text-[10px] bg-black/15 font-extrabold">
                {toPersianDigits(accessibleVolumes.length)} رکورد
              </span>
            </button>
          )}

          {canAccessWorkshop && (
            <button
              type="button"
              onClick={() => setActiveSubTab('workshop')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer persian-num ${
                activeSubTab === 'workshop'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>واحد تعمیرگاه و ماشین‌آلات سنگین</span>
              <span className="px-2 py-0.5 rounded-lg text-[10px] bg-black/15 font-extrabold">
                {toPersianDigits(workshopStats.ready)} آماده / {toPersianDigits(workshopStats.broken)} خراب
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveSubTab('units')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer persian-num ${
              activeSubTab === 'units'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>آپلود اکسل و گزارش‌های سایر واحدهای معدن</span>
            <span className="px-2 py-0.5 rounded-lg text-[10px] bg-black/20 font-extrabold">
              {toPersianDigits(accessibleUnitReports.length)} گزارش
            </span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: DISPATCHING & MINING VOLUMES ================= */}
      {activeSubTab === 'dispatching' && canAccessDispatching && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="font-extrabold text-emerald-950 flex items-center gap-2">
                <Mountain className="w-4 h-4 text-emerald-700" />
                <span>واحد دیسپچینگ و کنترل تولید — پایش آمار حجم عملیات معدن</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                ثبت دستی یا ورود هوشمند اکسل حجم استخراج، باطله‌برداری، حمل و خردایش با مقایسه خودکار ماه جاری در برابر ماه قبل و نمودار روند ماهانه. تمام داده‌ها بلافاصله در داشبورد مدیرعامل نمایش داده می‌شوند.
              </p>
            </div>
          </div>

          <CeoVolumesPanel
            records={accessibleVolumes}
            unitNames={
              accessibleUnitNames.length > 0
                ? accessibleUnitNames
                : MINING_UNITS_CATALOG.map((u) => u.unitName)
            }
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            canDeleteAll={canDeleteAll}
            canImportExcel={canImportExcel}
            canExportExcel={canExportExcel}
            onSave={onSaveVolume}
            onBatchImport={onBatchImportVolumes}
            onDelete={onDeleteVolume}
            onBatchDelete={onBatchDeleteVolumes}
            onDeleteAll={onDeleteAllVolumes}
          />
        </div>
      )}

      {/* ================= TAB 2: WORKSHOP & HEAVY MACHINERY ================= */}
      {activeSubTab === 'workshop' && canAccessWorkshop && (
        <div className="space-y-4">
          {/* Quick Workshop Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 persian-num">
            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>کل ناوگان ثبت‌شده</span>
                <Truck className="w-4 h-4 text-slate-600" />
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-1.5">
                {toPersianDigits(workshopStats.total)} <span className="text-[11px] font-semibold">دستگاه</span>
              </div>
            </div>
            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200">
              <div className="flex items-center justify-between text-xs text-emerald-800 font-bold">
                <span>آماده به کار</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-extrabold text-emerald-900 mt-1.5">
                {toPersianDigits(workshopStats.ready)}{' '}
                <span className="text-[11px] font-semibold">({toPersianDigits(workshopStats.readinessPct)}٪)</span>
              </div>
            </div>
            <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200">
              <div className="flex items-center justify-between text-xs text-rose-800 font-bold">
                <span>خراب / در تعمیرگاه</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-xl font-extrabold text-rose-900 mt-1.5">
                {toPersianDigits(workshopStats.broken)} <span className="text-[11px] font-semibold">دستگاه</span>
              </div>
            </div>
            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
              <div className="flex items-center justify-between text-xs text-amber-800 font-bold">
                <span>در انتظار قطعه</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-extrabold text-amber-900 mt-1.5">
                {toPersianDigits(workshopStats.waitingParts)} <span className="text-[11px] font-semibold">دستگاه</span>
              </div>
            </div>
            <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-200">
              <div className="flex items-center justify-between text-xs text-indigo-800 font-bold">
                <span>سرویس دوره‌ای</span>
                <Wrench className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-xl font-extrabold text-indigo-900 mt-1.5">
                {toPersianDigits(workshopStats.periodic)} <span className="text-[11px] font-semibold">دستگاه</span>
              </div>
            </div>
          </div>

          <CeoMachineryPanel
            records={accessibleMachinery}
            unitNames={
              accessibleUnitNames.length > 0
                ? accessibleUnitNames
                : MINING_UNITS_CATALOG.map((u) => u.unitName)
            }
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            canDeleteAll={canDeleteAll}
            canImportExcel={canImportExcel}
            canExportExcel={canExportExcel}
            onSave={onSaveMachinery}
            onBatchImport={onBatchImportMachinery}
            onDelete={onDeleteMachinery}
            onBatchDelete={onBatchDeleteMachinery}
            onDeleteAll={onDeleteAllMachinery}
          />
        </div>
      )}

      {/* ================= TAB 3: PER-UNIT EXCEL & OPERATIONAL REPORTS ================= */}
      {activeSubTab === 'units' && (
        <div className="space-y-5">
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{feedback.text}</span>
              <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Unit Selection Strip + Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  درگاه بارگذاری اکسل و گزارش‌های عملکردی واحدهای معدن
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  واحد مورد نظر خود را انتخاب کرده، فایل اکسل گزارش دوره را با تطبیق هوشمند وارد کنید؛ تمام ستون‌های اضافه فایل اکسل نیز حفظ و در داشبورد مدیرعامل تجمیع می‌شوند.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    downloadUnitReportsTemplate(selectedUnit !== 'ALL' ? selectedUnit : undefined)
                  }
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>دانلود نمونه اکسل واحدها</span>
                </button>

                {canImportExcel && (
                  <button
                    type="button"
                    onClick={() => setShowSmartImport(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>آپلود هوشمند اکسل واحد</span>
                  </button>
                )}

                {canCreate && (
                  <button
                    type="button"
                    onClick={handleOpenNewReport}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ثبت دستی گزارش واحد</span>
                  </button>
                )}

                {canExportExcel && unitFilteredReports.length > 0 && (
                  <button
                    type="button"
                    onClick={() => exportUnitReportsToExcel(unitFilteredReports)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>خروجی اکسل ({toPersianDigits(unitFilteredReports.length)})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mining Unit Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedUnit('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer persian-num ${
                  selectedUnit === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                همه واحدهای مجاز ({toPersianDigits(accessibleUnitNames.length)})
              </button>
              {accessibleUnitNames.map((unitName) => {
                const cnt = accessibleUnitReports.filter((r) => r.unitName === unitName).length;
                return (
                  <button
                    key={unitName}
                    type="button"
                    onClick={() => setSelectedUnit(unitName)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer persian-num ${
                      selectedUnit === unitName
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {unitName} ({toPersianDigits(cnt)})
                  </button>
                );
              })}
            </div>

            {/* Period Comparison & Search Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  دوره مبنا (ماه جاری):
                </label>
                <select
                  value={currentPeriod}
                  onChange={(e) => setCurrentPeriod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs persian-num"
                >
                  {availablePeriods.map((p) => (
                    <option key={p} value={p}>
                      {getPeriodLabel(p)} ({toPersianDigits(p)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  دوره مقایسه (ماه قبل):
                </label>
                <select
                  value={previousPeriod}
                  onChange={(e) => setPreviousPeriod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs persian-num"
                >
                  {Array.from(new Set([...availablePeriods, getPreviousPeriodId(currentPeriod)]))
                    .sort((a, b) => b.localeCompare(a))
                    .map((p) => (
                      <option key={p} value={p}>
                        {getPeriodLabel(p)} ({toPersianDigits(p)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  جستجو در شاخص‌ها و گزارش‌ها:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="جستجوی عنوان شاخص، واحد یا سرپرست..."
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 persian-num">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-500">تعداد شاخص‌های دوره جاری</span>
              <div className="text-xl font-extrabold text-slate-900">
                {toPersianDigits(unitKpis.count)} <span className="text-xs font-medium">شاخص گزارش‌شده</span>
              </div>
              <div className="text-[11px] text-slate-500">
                کل سوابق واحد در دیتابیس: {toPersianDigits(unitFilteredReports.length)} ردیف
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-500">مجموع عملکرد ثبت‌شده ماه جاری</span>
              <div className="text-xl font-extrabold text-indigo-700">
                {formatNum(unitKpis.totalActual)}
              </div>
              <div className="text-[11px] text-slate-500">
                در مقایسه با {formatNum(unitKpis.totalPrev)} ماه قبل
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-500">تغییر تجمیعی نسبت به ماه قبل</span>
              <div
                className={`text-xl font-extrabold flex items-center gap-1 ${
                  unitKpis.diff >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {unitKpis.diff >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>
                  {unitKpis.diff >= 0 ? '+' : ''}
                  {formatPercent(unitKpis.changePct)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                اختلاف مقداری: {unitKpis.diff >= 0 ? '+' : ''}
                {formatNum(unitKpis.diff)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-500">نرخ تحقق برنامه هدف دوره</span>
              <div className="text-xl font-extrabold text-teal-700">
                {formatPercent(unitKpis.achievementPct)}
              </div>
              <div className="text-[11px] text-slate-500">
                مجموع هدف مصوب: {formatNum(unitKpis.totalTarget)}
              </div>
            </div>
          </div>

          {/* 2 Recharts Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  نمودار مقایسه‌ای شاخص‌های واحد ({getPeriodLabel(currentPeriod)} در برابر {getPeriodLabel(previousPeriod)})
                </h4>
              </div>
              <div className="h-64 w-full min-w-0" dir="ltr">
                {comparisonChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonChartData} margin={{ top: 10, right: 12, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#334155', fontSize: 10, fontFamily: 'Vazirmatn' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#475569', fontSize: 10.5, fontFamily: 'Vazirmatn' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => toPersianDigits(v)}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [formatNum(Number(val || 0)), name]}
                        contentStyle={{
                          direction: 'rtl',
                          fontFamily: 'Vazirmatn',
                          fontSize: '11px',
                          borderRadius: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                      <Bar dataKey="previous" name="ماه قبل" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="actual" name="عملکرد ماه جاری" fill="#4338ca" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="target" name="هدف مصوب" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
                    <span>در دوره {getPeriodLabel(currentPeriod)} گزارشی برای نمودار یافت نشد.</span>
                    {canImportExcel && (
                      <button
                        type="button"
                        onClick={() => setShowSmartImport(true)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-200 cursor-pointer"
                      >
                        بارگذاری اولین فایل اکسل واحد
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                روند ماهانه شاخص‌های واحد (آمار تجمیعی ادوار)
              </h4>
              <div className="h-64 w-full min-w-0" dir="ltr">
                {monthlyTrendChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrendChartData} margin={{ top: 10, right: 12, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#334155', fontSize: 10, fontFamily: 'Vazirmatn' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#475569', fontSize: 10.5, fontFamily: 'Vazirmatn' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => toPersianDigits(v)}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [formatNum(Number(val || 0)), name]}
                        contentStyle={{
                          direction: 'rtl',
                          fontFamily: 'Vazirmatn',
                          fontSize: '11px',
                          borderRadius: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                      <Area
                        type="monotone"
                        dataKey="actualSum"
                        name="مجموع محقق‌شده"
                        stroke="#4338ca"
                        fill="#e0e7ff"
                        strokeWidth={2.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="targetSum"
                        name="مجموع هدف"
                        stroke="#0f766e"
                        fill="#ccfbf1"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    هنوز داده‌ای برای ترسیم روند ماهانه ثبت نشده است.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Operational Unit Reports Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-bold text-slate-900 persian-num">
                فهرست گزارش‌های ثبت‌شده واحدها ({toPersianDigits(visibleTableRows.length)} ردیف) — برای مشاهده تمام ستون‌های اکسل روی هر سطر کلیک کنید
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canDelete && selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onBatchDeleteUnitReports(selectedIds);
                      setSelectedIds([]);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 text-white rounded-lg font-bold cursor-pointer persian-num"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف انتخاب‌شده ({toPersianDigits(selectedIds.length)})</span>
                  </button>
                )}
                {canDeleteAll && visibleTableRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>پاکسازی کامل گزارش‌های واحدها</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    {canDelete && (
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                      </th>
                    )}
                    <th className="p-3">دوره</th>
                    <th className="p-3">واحد عملیاتی</th>
                    <th className="p-3">دسته‌بندی / موضوع</th>
                    <th className="p-3">عملکرد ماه جاری</th>
                    <th className="p-3">ماه قبل</th>
                    <th className="p-3">هدف مصوب</th>
                    <th className="p-3">تنظیم‌کننده</th>
                    <th className="p-3">وضعیت</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTableRows.length === 0 ? (
                    <tr>
                      <td colSpan={canDelete ? 10 : 9} className="p-8 text-center text-slate-500">
                        هیچ گزارشی برای واحد یا فیلتر انتخاب‌شده ثبت نشده است. از دکمه‌های «آپلود هوشمند اکسل واحد» یا «ثبت دستی گزارش واحد» استفاده کنید.
                      </td>
                    </tr>
                  ) : (
                    visibleTableRows.map((r) => {
                      const pct =
                        r.targetValue && r.targetValue > 0
                          ? Math.round((r.actualValue / r.targetValue) * 100)
                          : null;
                      const extraColsCount = r.rawFields ? Object.keys(r.rawFields).length : 0;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setDetailReport(r)}
                          className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                        >
                          {canDelete && (
                            <td
                              className="p-3 text-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelect(r.id);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(r.id)}
                                onChange={() => {}}
                                className="w-4 h-4 rounded text-indigo-600"
                              />
                            </td>
                          )}
                          <td className="p-3 font-bold text-slate-700 persian-num">
                            {getPeriodLabel(r.period)}
                          </td>
                          <td className="p-3 font-bold text-indigo-800">{r.unitName}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{r.metricName}</div>
                            <div className="text-[10px] text-slate-500">
                              {r.reportCategory || 'عملیاتی'}
                              {extraColsCount > 0 && ` · +${toPersianDigits(extraColsCount)} ستون اکسل`}
                            </div>
                          </td>
                          <td className="p-3 font-extrabold text-slate-900 persian-num">
                            {formatNum(r.actualValue)} {r.unitLabel}
                          </td>
                          <td className="p-3 text-slate-600 persian-num">
                            {formatNum(r.previousValue || 0)} {r.unitLabel}
                          </td>
                          <td className="p-3 text-slate-700 persian-num">
                            {formatNum(r.targetValue || 0)} {r.unitLabel}
                            {pct !== null && (
                              <span className="block text-[10px] font-bold text-teal-700">
                                {toPersianDigits(pct)}٪ تحقق
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600">{r.submittedBy || '—'}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">
                              {r.status || 'ثبت‌شده'}
                            </span>
                          </td>
                          <td
                            className="p-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailReport(r)}
                                title="مشاهده جزئیات کامل و ستون‌های اکسل"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setEditingReport({ ...r })}
                                  title="ویرایش"
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteUnitReport(r.id)}
                                  title="حذف"
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
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
        </div>
      )}

      {/* Smart Excel Import Modal for Unit Reports */}
      {showSmartImport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl p-5 my-6 max-h-[92vh] overflow-y-auto">
            <SmartExcelImportMapper
              moduleType="unitReports"
              title="بارگذاری هوشمند فایل اکسل گزارش‌های واحدهای عملیاتی معدن"
              subtitle="هر فایل اکسل واحد (عملکرد، آمار تولید، انبار، ایمنی HSE، آزمایشگاه و...) را انتخاب کنید تا سامانه ستون‌ها را خودکار تطبیق دهد و بقیه ستون‌های اضافه را نیز در دیتابیس ذخیره کند."
              onDownloadTemplate={() =>
                downloadUnitReportsTemplate(selectedUnit !== 'ALL' ? selectedUnit : undefined)
              }
              templateLabel="دانلود فایل نمونه اکسل واحدها"
              onImport={handleSmartImportReports}
              onCancel={() => setShowSmartImport(false)}
              accentColor="indigo"
              confirmLabel="تأیید و ثبت در پایگاه داده واحدها و داشبورد مدیرعامل"
            />
          </div>
        </div>
      )}

      {/* Manual Add/Edit Modal */}
      {editingReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-6">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingReport.id ? 'ویرایش گزارش عملکرد واحد' : 'ثبت دستی گزارش عملکرد واحد معدن'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveReportForm} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">دوره (سال-ماه) *</label>
                  <input
                    type="text"
                    required
                    value={editingReport.period || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, period: e.target.value })}
                    placeholder="1403-08"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">واحد عملیاتی معدن *</label>
                  <select
                    value={editingReport.unitName || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, unitName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  >
                    {accessibleUnitNames.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">دسته‌بندی گزارش</label>
                  <input
                    type="text"
                    value={editingReport.reportCategory || ''}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, reportCategory: e.target.value })
                    }
                    placeholder="تولید / ایمنی / انبار / فنی..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">واحد سنجش (یکا)</label>
                  <input
                    type="text"
                    value={editingReport.unitLabel || ''}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, unitLabel: e.target.value })
                    }
                    placeholder="تن / متر / ساعت / عدد"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">عنوان شاخص / موضوع گزارش *</label>
                  <input
                    type="text"
                    required
                    value={editingReport.metricName || ''}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, metricName: e.target.value })
                    }
                    placeholder="مثلاً: تناژ خوراک ورودی سنگ‌شکن یا تعداد بازرسی ایمنی"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">مقدار محقق‌شده ماه *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingReport.actualValue ?? 0}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, actualValue: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">مقدار ماه قبل</label>
                  <input
                    type="number"
                    step="any"
                    value={editingReport.previousValue ?? 0}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, previousValue: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">هدف / برنامه ماه</label>
                  <input
                    type="number"
                    step="any"
                    value={editingReport.targetValue ?? 0}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, targetValue: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وضعیت</label>
                  <input
                    type="text"
                    value={editingReport.status || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, status: e.target.value })}
                    placeholder="محقق‌شده / نیاز به پیگیری"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">تنظیم‌کننده / سرپرست واحد</label>
                  <input
                    type="text"
                    value={editingReport.submittedBy || ''}
                    onChange={(e) =>
                      setEditingReport({ ...editingReport, submittedBy: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">توضیحات</label>
                  <textarea
                    rows={2}
                    value={editingReport.notes || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingReport(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  ذخیره در دیتابیس
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Row Detail Modal showing structured fields + arbitrary rawFields Excel columns */}
      {detailReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">{detailReport.metricName}</h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {detailReport.unitName} · دوره {getPeriodLabel(detailReport.period)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailReport(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 persian-num">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">عملکرد ماه جاری</span>
                  <b className="text-indigo-700 text-sm">
                    {formatNum(detailReport.actualValue)} {detailReport.unitLabel}
                  </b>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">عملکرد ماه قبل</span>
                  <b className="text-slate-800 text-sm">
                    {formatNum(detailReport.previousValue || 0)} {detailReport.unitLabel}
                  </b>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">هدف مصوب دوره</span>
                  <b className="text-teal-700 text-sm">
                    {formatNum(detailReport.targetValue || 0)} {detailReport.unitLabel}
                  </b>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">دسته‌بندی گزارش</span>
                  <b className="text-slate-800">{detailReport.reportCategory || '—'}</b>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">وضعیت</span>
                  <b className="text-slate-800">{detailReport.status || 'ثبت‌شده'}</b>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">ثبت‌کننده واحد</span>
                  <b className="text-slate-800">{detailReport.submittedBy || '—'}</b>
                </div>
              </div>

              {detailReport.notes && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-slate-800">
                  <span className="font-bold block text-[11px] text-amber-900 mb-1">توضیحات سرپرست:</span>
                  {detailReport.notes}
                </div>
              )}

              {detailReport.rawFields && Object.keys(detailReport.rawFields).length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs">
                    سایر ستون‌های واردشده از فایل اکسل واحد ({toPersianDigits(Object.keys(detailReport.rawFields).length)} ستون):
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-[11px]">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5">عنوان ستون در اکسل</th>
                          <th className="p-2.5">مقدار ثبت‌شده</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(detailReport.rawFields).map(([k, v]) => (
                          <tr key={k}>
                            <td className="p-2.5 font-semibold text-slate-700">{k}</td>
                            <td className="p-2.5 text-slate-900 persian-num">{toPersianDigits(String(v))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete All Unit Reports Modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>پاکسازی کامل گزارش‌های واحدهای عملیاتی</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              آیا اطمینان دارید که تمامی گزارش‌های عملکردی واحدهای معدن حذف شوند؟ آمار حجم دیسپچینگ و لیست ماشین‌آلات تعمیرگاه در بخش‌های خود باقی می‌مانند.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDeleteAllUnitReports();
                  setConfirmClearAll(false);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold cursor-pointer"
              >
                بله، پاکسازی کامل شود
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
