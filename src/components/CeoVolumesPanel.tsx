import React, { useState, useMemo } from 'react';
import {
  MiningVolumeRecord,
} from '../types';
import {
  toPersianDigits,
  formatPercent,
  getPeriodLabel,
  getPreviousPeriodId,
  calculateComparison,
} from '../utils/persian';
import {
  downloadCeoVolumesTemplate,
  exportCeoVolumesToExcel,
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Plus,
  Edit3,
  Trash2,
  Download,
  FileSpreadsheet,
  Upload,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  Mountain,
  Calendar,
} from 'lucide-react';

interface CeoVolumesPanelProps {
  records: MiningVolumeRecord[];
  unitNames: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDeleteAll: boolean;
  canImportExcel: boolean;
  canExportExcel: boolean;
  onSave: (record: Partial<MiningVolumeRecord>) => Promise<{ success: boolean; message?: string }>;
  onBatchImport: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDelete: (id: string) => Promise<void>;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

export const CeoVolumesPanel: React.FC<CeoVolumesPanelProps> = ({
  records,
  unitNames,
  canCreate,
  canEdit,
  canDelete,
  canDeleteAll,
  canImportExcel,
  canExportExcel,
  onSave,
  onBatchImport,
  onDelete,
  onBatchDelete,
  onDeleteAll,
}) => {
  const availablePeriods = useMemo(() => {
    const set = new Set<string>(records.map((r) => r.period).filter(Boolean));
    if (set.size === 0) {
      set.add('1403-08');
      set.add('1403-07');
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const [currentPeriod, setCurrentPeriod] = useState<string>(availablePeriods[0] || '1403-08');
  const [previousPeriod, setPreviousPeriod] = useState<string>(
    availablePeriods[1] || getPreviousPeriodId(availablePeriods[0] || '1403-08')
  );
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Partial<MiningVolumeRecord> | null>(null);
  const [drilldownItem, setDrilldownItem] = useState<{
    title: string;
    unitName: string;
    currentVal: number;
    prevVal: number;
    targetVal: number;
    unitLabel: string;
    diffAmount: number;
    diffPercent: number;
    trend: string;
    history: { period: string; label: string; volumeValue: number; targetVolume: number }[];
    notes?: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const effectiveCurrentPeriod = availablePeriods.includes(currentPeriod) ? currentPeriod : (availablePeriods[0] || '1403-08');
  const effectivePrevPeriod = previousPeriod || (availablePeriods[1] || getPreviousPeriodId(effectiveCurrentPeriod));

  const currentRows = useMemo(
    () =>
      records.filter(
        (r) =>
          r.period === effectiveCurrentPeriod &&
          (unitFilter === 'ALL' || r.unitName === unitFilter)
      ),
    [records, effectiveCurrentPeriod, unitFilter]
  );

  const prevRows = useMemo(
    () =>
      records.filter(
        (r) =>
          r.period === effectivePrevPeriod &&
          (unitFilter === 'ALL' || r.unitName === unitFilter)
      ),
    [records, effectivePrevPeriod, unitFilter]
  );

  const comparisonRows = useMemo(() => {
    const keyOf = (r: MiningVolumeRecord) => `${r.unitName}__${r.metricTitle || r.activityType}`;
    const prevMap = new Map<string, MiningVolumeRecord>();
    prevRows.forEach((p) => prevMap.set(keyOf(p), p));

    const seenKeys = new Set<string>();
    const rows = currentRows.map((curr) => {
      const k = keyOf(curr);
      seenKeys.add(k);
      const prev = prevMap.get(k);
      const prevVal = prev ? Number(prev.volumeValue || 0) : 0;
      const currVal = Number(curr.volumeValue || 0);
      const cmp = calculateComparison(currVal, prevVal);
      const targetVal = Number(curr.targetVolume || 0);
      const achievementPct = targetVal > 0 ? (currVal / targetVal) * 100 : 0;
      return {
        ...curr,
        prevVolume: prevVal,
        diffAmount: cmp.diffAmount,
        diffPercent: cmp.diffPercent,
        trend: cmp.trend,
        achievementPct,
      };
    });

    // Include items present in previous month but not yet entered for current month
    prevRows.forEach((prev) => {
      const k = keyOf(prev);
      if (!seenKeys.has(k)) {
        const cmp = calculateComparison(0, Number(prev.volumeValue || 0));
        rows.push({
          ...prev,
          id: `prev-only-${prev.id}`,
          period: effectiveCurrentPeriod,
          volumeValue: 0,
          targetVolume: prev.targetVolume || 0,
          prevVolume: Number(prev.volumeValue || 0),
          diffAmount: cmp.diffAmount,
          diffPercent: cmp.diffPercent,
          trend: cmp.trend,
          achievementPct: 0,
          status: 'ثبت‌نشده در ماه جاری',
        });
      }
    });

    return rows;
  }, [currentRows, prevRows, effectiveCurrentPeriod]);

  const totals = useMemo(() => {
    const totalCurrent = comparisonRows.reduce((s, r) => s + Number(r.volumeValue || 0), 0);
    const totalPrev = comparisonRows.reduce((s, r) => s + Number(r.prevVolume || 0), 0);
    const totalTarget = comparisonRows.reduce((s, r) => s + Number(r.targetVolume || 0), 0);
    const cmp = calculateComparison(totalCurrent, totalPrev);
    const achievementPct = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;
    const increasedCount = comparisonRows.filter((r) => r.diffAmount > 0).length;
    const decreasedCount = comparisonRows.filter((r) => r.diffAmount < 0).length;
    return {
      totalCurrent,
      totalPrev,
      totalTarget,
      diffAmount: cmp.diffAmount,
      diffPercent: cmp.diffPercent,
      trend: cmp.trend,
      achievementPct,
      increasedCount,
      decreasedCount,
    };
  }, [comparisonRows]);

  const monthlyHistoryData = useMemo(() => {
    const map = new Map<string, { period: string; label: string; volumeValue: number; targetVolume: number; itemsCount: number }>();
    records
      .filter((r) => unitFilter === 'ALL' || r.unitName === unitFilter)
      .forEach((r) => {
        const cur = map.get(r.period) || {
          period: r.period,
          label: getPeriodLabel(r.period),
          volumeValue: 0,
          targetVolume: 0,
          itemsCount: 0,
        };
        cur.volumeValue += Number(r.volumeValue || 0);
        cur.targetVolume += Number(r.targetVolume || 0);
        cur.itemsCount += 1;
        map.set(r.period, cur);
      });
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [records, unitFilter]);

  const openDrilldown = (row: (typeof comparisonRows)[number]) => {
    const history = records
      .filter(
        (r) =>
          r.unitName === row.unitName &&
          (!row.metricTitle || r.metricTitle === row.metricTitle)
      )
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((r) => ({
        period: r.period,
        label: getPeriodLabel(r.period),
        volumeValue: Number(r.volumeValue || 0),
        targetVolume: Number(r.targetVolume || 0),
      }));

    setDrilldownItem({
      title: row.metricTitle || row.activityType,
      unitName: row.unitName,
      currentVal: row.volumeValue,
      prevVal: row.prevVolume,
      targetVal: row.targetVolume,
      unitLabel: row.unitLabel || 'تن',
      diffAmount: row.diffAmount,
      diffPercent: row.diffPercent,
      trend: row.trend,
      history,
      notes: row.notes,
    });
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const res = await onSave(editingRecord);
    if (res.success) {
      setFeedback({ type: 'success', text: res.message || 'ذخیره شد.' });
      setEditingRecord(null);
    } else {
      setFeedback({ type: 'error', text: res.message || 'خطا در ثبت اطلاعات.' });
    }
  };

  const toggleSelect = (id: string) => {
    if (id.startsWith('prev-only-')) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const realRowIds = comparisonRows.filter((r) => !r.id.startsWith('prev-only-')).map((r) => r.id);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white shadow-sm">
            <Mountain className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              پایش و مقایسه آمار حجم عملیات معدن (ماه جاری در برابر ماه قبل و روند ماهانه)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              مقایسه تناژ استخراج، باطله‌برداری، خوراک سنگ‌شکن و حمل با جزئیات تحلیلی بر روی هر ستون و ردیف
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-slate-500">ماه جاری:</span>
            <select
              value={effectiveCurrentPeriod}
              onChange={(e) => setCurrentPeriod(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none"
            >
              {availablePeriods.map((p) => (
                <option key={p} value={p}>
                  {getPeriodLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-500">ماه مقایسه:</span>
            <select
              value={effectivePrevPeriod}
              onChange={(e) => setPreviousPeriod(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none"
            >
              {availablePeriods.map((p) => (
                <option key={p} value={p}>
                  {getPeriodLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 outline-none"
          >
            <option value="ALL">همه واحدهای معدن</option>
            {Array.from(new Set([...unitNames, ...records.map((r) => r.unitName)])).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <button
              onClick={() =>
                setEditingRecord({
                  period: effectiveCurrentPeriod,
                  unitName: unitNames[0] || 'استخراج و معدن‌کاری',
                  activityType: 'استخراج ماده معدنی',
                  metricTitle: '',
                  volumeValue: 0,
                  targetVolume: 0,
                  unitLabel: 'تن',
                  status: 'در حال اجرا',
                  notes: '',
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              ثبت آمار حجم ماهانه
            </button>
          )}

          {canImportExcel && (
            <button
              onClick={() => setShowSmartImport((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              ورود اکسل آمار حجم
            </button>
          )}

          <button
            onClick={() => downloadCeoVolumesTemplate()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            دانلود نمونه اکسل
          </button>

          {canExportExcel && (
            <button
              onClick={() => exportCeoVolumesToExcel(records)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              خروجی اکسل حجم
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDelete && selectedIds.length > 0 && (
            <button
              onClick={async () => {
                await onBatchDelete(selectedIds);
                setSelectedIds([]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف انتخاب‌شده‌ها ({toPersianDigits(selectedIds.length)})
            </button>
          )}

          {canDeleteAll && records.length > 0 && (
            confirmClearAll ? (
              <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1">
                <span className="text-[11px] font-bold text-rose-700">کل آمار حجم حذف شود؟</span>
                <button
                  onClick={async () => {
                    await onDeleteAll();
                    setConfirmClearAll(false);
                    setSelectedIds([]);
                  }}
                  className="px-2 py-0.5 bg-rose-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  بله، پاک شود
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-0.5 bg-white text-slate-600 rounded-lg text-[11px] border cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                پاک کردن کل آمار حجم
              </button>
            )
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 rounded-2xl text-xs font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Smart Excel Import */}
      {showSmartImport && (
        <SmartExcelImportMapper
          moduleType="ceoVolumes"
          title="ورود هوشمند اکسل آمار حجم عملیات ماهانه معدن"
          subtitle="ستون‌های فایل اکسل خود را با شاخص‌های دوره، واحد معدن، حجم محقق‌شده و برنامه هدف تطبیق دهید."
          onDownloadTemplate={downloadCeoVolumesTemplate}
          onCancel={() => setShowSmartImport(false)}
          accentColor="indigo"
          onImport={async (mappedRows) => {
            const res = await onBatchImport(mappedRows);
            setFeedback({
              type: res.success ? 'success' : 'error',
              text: res.message || (res.success ? 'اطلاعات حجم عملیات وارد شد.' : 'خطا در ورود اطلاعات.'),
            });
            if (res.success) setShowSmartImport(false);
          }}
        />
      )}

      {/* Comparative KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <p className="text-xs font-semibold text-indigo-700">حجم کل عملیات ماه جاری ({getPeriodLabel(effectiveCurrentPeriod)})</p>
          <p className="text-2xl font-black text-slate-900 mt-1.5">
            {toPersianDigits(totals.totalCurrent.toLocaleString('en-US'))}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            در {toPersianDigits(comparisonRows.length)} سرفصل عملیاتی
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold text-slate-600">حجم کل ماه مقایسه ({getPeriodLabel(effectivePrevPeriod)})</p>
          <p className="text-2xl font-black text-slate-800 mt-1.5">
            {toPersianDigits(totals.totalPrev.toLocaleString('en-US'))}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            هدف مصوب دوره جاری: {toPersianDigits(totals.totalTarget.toLocaleString('en-US'))}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            totals.diffAmount >= 0
              ? 'border-emerald-200 bg-emerald-50/60'
              : 'border-rose-200 bg-rose-50/60'
          }`}
        >
          <p className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>تغییر حجم نسبت به ماه قبل</span>
            {totals.diffAmount >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-600" />
            )}
          </p>
          <p
            className={`text-2xl font-black mt-1.5 ${
              totals.diffAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatPercent(totals.diffPercent)}
          </p>
          <p className="text-[11px] text-slate-600 mt-1">
            اختلاف عددی: {totals.diffAmount > 0 ? '+' : ''}
            {toPersianDigits(totals.diffAmount.toLocaleString('en-US'))} | رشد: {toPersianDigits(totals.increasedCount)} / افت: {toPersianDigits(totals.decreasedCount)}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-semibold text-amber-800">نرخ تحقق برنامه مصوب ماه جاری</p>
          <p className="text-2xl font-black text-slate-900 mt-1.5">
            {toPersianDigits(totals.achievementPct.toFixed(1))}٪
          </p>
          <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, totals.achievementPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Month-over-Month Bar Comparison */}
        <div className="bg-slate-50/60 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              مقایسه حجم این ماه با ماه قبل و برنامه هدف (کلیک روی ردیف برای جزئیات)
            </h4>
          </div>
          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonRows.map((r) => ({
                  name: `${r.unitName} (${r.unitLabel || ''})`.slice(0, 26),
                  'ماه جاری': r.volumeValue,
                  'ماه قبل': r.prevVolume,
                  'هدف مصوب': r.targetVolume,
                  _raw: r,
                }))}
                margin={{ top: 10, right: 16, left: 8, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(v: any) => toPersianDigits(Number(v || 0).toLocaleString('en-US'))}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', direction: 'rtl' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="ماه قبل"
                  fill="#94a3b8"
                  radius={[6, 6, 0, 0]}
                  onClick={(d: any) => d?._raw && openDrilldown(d._raw)}
                  className="cursor-pointer"
                />
                <Bar
                  dataKey="ماه جاری"
                  fill="#4f46e5"
                  radius={[6, 6, 0, 0]}
                  onClick={(d: any) => d?._raw && openDrilldown(d._raw)}
                  className="cursor-pointer"
                />
                <Bar
                  dataKey="هدف مصوب"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                  onClick={(d: any) => d?._raw && openDrilldown(d._raw)}
                  className="cursor-pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Multi-Month Trend Chart */}
        <div className="bg-slate-50/60 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              روند مقایسه آمار کل حجم عملیات در تمام ماه‌های ثبت‌شده
            </h4>
          </div>
          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyHistoryData} margin={{ top: 10, right: 16, left: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(v: any) => toPersianDigits(Number(v || 0).toLocaleString('en-US'))}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', direction: 'rtl' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="volumeValue"
                  name="حجم محقق‌شده ماه"
                  stroke="#4f46e5"
                  fill="#c7d2fe"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="targetVolume"
                  name="برنامه مصوب ماه"
                  stroke="#10b981"
                  fill="#a7f3d0"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Interactive Detailed Comparison Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              {canDelete && (
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={realRowIds.length > 0 && realRowIds.every((id) => selectedIds.includes(id))}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? realRowIds : [])
                    }
                    className="rounded border-slate-300"
                  />
                </th>
              )}
              <th className="p-3 font-bold">واحد معدن</th>
              <th className="p-3 font-bold">شرح شاخص / عملیات</th>
              <th className="p-3 font-bold">حجم ماه قبل</th>
              <th className="p-3 font-bold">حجم ماه جاری</th>
              <th className="p-3 font-bold">تغییر ماهانه</th>
              <th className="p-3 font-bold">برنامه هدف</th>
              <th className="p-3 font-bold">تحقق هدف</th>
              <th className="p-3 font-bold text-center">جزئیات و عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparisonRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  آماری برای این دوره ثبت نشده است. از دکمه «ثبت آمار حجم ماهانه» یا «ورود اکسل» استفاده کنید.
                </td>
              </tr>
            ) : (
              comparisonRows.map((row) => {
                const isVirtual = row.id.startsWith('prev-only-');
                return (
                  <tr
                    key={row.id}
                    onClick={() => openDrilldown(row)}
                    className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                  >
                    {canDelete && (
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {!isVirtual && (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="rounded border-slate-300"
                          />
                        )}
                      </td>
                    )}
                    <td className="p-3 font-bold text-slate-800">{row.unitName}</td>
                    <td className="p-3 text-slate-700">
                      <div className="font-semibold">{row.metricTitle || row.activityType}</div>
                      <div className="text-[11px] text-slate-400">{row.activityType}</div>
                    </td>
                    <td className="p-3 text-slate-600">
                      {toPersianDigits(row.prevVolume.toLocaleString('en-US'))} {row.unitLabel}
                    </td>
                    <td className="p-3 font-extrabold text-indigo-700">
                      {toPersianDigits(row.volumeValue.toLocaleString('en-US'))} {row.unitLabel}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          row.diffAmount > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.diffAmount < 0
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {formatPercent(row.diffPercent)} ({row.diffAmount > 0 ? '+' : ''}
                        {toPersianDigits(row.diffAmount.toLocaleString('en-US'))})
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">
                      {toPersianDigits(Number(row.targetVolume || 0).toLocaleString('en-US'))} {row.unitLabel}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-800">
                        {row.targetVolume > 0 ? `${toPersianDigits(row.achievementPct.toFixed(1))}٪` : '-'}
                      </span>
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDrilldown(row)}
                          title="مشاهده آنالیز و روند ماهانه"
                          className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isVirtual && canEdit && (
                          <button
                            onClick={() => setEditingRecord(row)}
                            title="ویرایش"
                            className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {!isVirtual && canDelete && (
                          <button
                            onClick={() => onDelete(row.id)}
                            title="حذف"
                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
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

      {/* Monthly Drill-Down Detail Modal */}
      {drilldownItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  آنالیز جزئیات حجم عملیات: {drilldownItem.title}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">واحد: {drilldownItem.unitName}</p>
              </div>
              <button
                onClick={() => setDrilldownItem(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100">
                <div className="text-slate-500">ماه جاری</div>
                <div className="text-base font-black text-indigo-800 mt-1">
                  {toPersianDigits(drilldownItem.currentVal.toLocaleString('en-US'))} {drilldownItem.unitLabel}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">ماه مقایسه</div>
                <div className="text-base font-black text-slate-800 mt-1">
                  {toPersianDigits(drilldownItem.prevVal.toLocaleString('en-US'))} {drilldownItem.unitLabel}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                <div className="text-slate-500">تغییر درصدی</div>
                <div className="text-base font-black text-emerald-800 mt-1">
                  {formatPercent(drilldownItem.diffPercent)}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="text-slate-500">برنامه مصوب</div>
                <div className="text-base font-black text-amber-800 mt-1">
                  {toPersianDigits(drilldownItem.targetVal.toLocaleString('en-US'))} {drilldownItem.unitLabel}
                </div>
              </div>
            </div>

            {drilldownItem.notes && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <span className="font-bold">توضیحات سرپرست: </span>
                {drilldownItem.notes}
              </div>
            )}

            <div>
              <h5 className="text-xs font-bold text-slate-700 mb-2">تاریخچه مقایسه ماهانه این شاخص</h5>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2.5">دوره</th>
                      <th className="p-2.5">حجم محقق‌شده</th>
                      <th className="p-2.5">هدف مصوب</th>
                      <th className="p-2.5">درصد تحقق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drilldownItem.history.map((h) => (
                      <tr key={h.period}>
                        <td className="p-2.5 font-semibold">{h.label}</td>
                        <td className="p-2.5 font-bold text-indigo-700">
                          {toPersianDigits(h.volumeValue.toLocaleString('en-US'))} {drilldownItem.unitLabel}
                        </td>
                        <td className="p-2.5 text-slate-600">
                          {toPersianDigits(h.targetVolume.toLocaleString('en-US'))} {drilldownItem.unitLabel}
                        </td>
                        <td className="p-2.5 font-bold">
                          {h.targetVolume > 0
                            ? `${toPersianDigits(((h.volumeValue / h.targetVolume) * 100).toFixed(1))}٪`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveForm}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-slate-900">
                {editingRecord.id ? 'ویرایش آمار حجم عملیات' : 'ثبت آمار حجم عملیات ماهانه'}
              </h4>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">دوره (YYYY-MM) *</label>
                <input
                  type="text"
                  required
                  value={editingRecord.period || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, period: e.target.value })}
                  placeholder="مثلاً 1403-08"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">واحد معدن *</label>
                <input
                  type="text"
                  required
                  list="mining-units-list"
                  value={editingRecord.unitName || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, unitName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <datalist id="mining-units-list">
                  {unitNames.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع عملیات</label>
                <input
                  type="text"
                  value={editingRecord.activityType || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, activityType: e.target.value })}
                  placeholder="مثلاً استخراج ماده معدنی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">عنوان شاخص</label>
                <input
                  type="text"
                  value={editingRecord.metricTitle || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, metricTitle: e.target.value })}
                  placeholder="مثلاً استخراج سینه کار اصلی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">حجم محقق‌شده ماه *</label>
                <input
                  type="number"
                  required
                  value={editingRecord.volumeValue ?? 0}
                  onChange={(e) => setEditingRecord({ ...editingRecord, volumeValue: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">برنامه / هدف ماه</label>
                <input
                  type="number"
                  value={editingRecord.targetVolume ?? 0}
                  onChange={(e) => setEditingRecord({ ...editingRecord, targetVolume: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">واحد اندازه‌گیری</label>
                <input
                  type="text"
                  value={editingRecord.unitLabel || 'تن'}
                  onChange={(e) => setEditingRecord({ ...editingRecord, unitLabel: e.target.value })}
                  placeholder="تن / مترمکعب / سرویس"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">وضعیت تحقق</label>
                <input
                  type="text"
                  value={editingRecord.status || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-bold text-slate-700 mb-1">توضیحات</label>
              <textarea
                rows={2}
                value={editingRecord.notes || ''}
                onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                ذخیره آمار حجم
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
