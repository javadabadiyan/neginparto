import React, { useState, useMemo } from 'react';
import {
  MiningMachineryRecord,
  MiningMachineryStatus,
} from '../types';
import { toPersianDigits } from '../utils/persian';
import {
  downloadCeoMachineryTemplate,
  exportCeoMachineryToExcel,
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Truck,
  Plus,
  Edit3,
  Trash2,
  Download,
  FileSpreadsheet,
  Upload,
  Search,
  Eye,
  X,
} from 'lucide-react';

interface CeoMachineryPanelProps {
  records: MiningMachineryRecord[];
  unitNames: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDeleteAll: boolean;
  canImportExcel: boolean;
  canExportExcel: boolean;
  onSave: (record: Partial<MiningMachineryRecord>) => Promise<{ success: boolean; message?: string }>;
  onBatchImport: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDelete: (id: string) => Promise<void>;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

const STATUS_OPTIONS: MiningMachineryStatus[] = [
  'آماده به کار',
  'خراب / در تعمیرگاه',
  'در انتظار قطعه',
  'سرویس دوره‌ای',
];

const STATUS_COLORS: Record<MiningMachineryStatus, string> = {
  'آماده به کار': '#10b981',
  'خراب / در تعمیرگاه': '#e11d48',
  'در انتظار قطعه': '#f59e0b',
  'سرویس دوره‌ای': '#6366f1',
};

export const CeoMachineryPanel: React.FC<CeoMachineryPanelProps> = ({
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | MiningMachineryStatus>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Partial<MiningMachineryRecord> | null>(null);
  const [detailMachine, setDetailMachine] = useState<MiningMachineryRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const stats = useMemo(() => {
    const total = records.length;
    const ready = records.filter((r) => r.status === 'آماده به کار');
    const broken = records.filter((r) => r.status === 'خراب / در تعمیرگاه');
    const waitingParts = records.filter((r) => r.status === 'در انتظار قطعه');
    const maintenance = records.filter((r) => r.status === 'سرویس دوره‌ای');
    const availabilityPct = total > 0 ? (ready.length / total) * 100 : 0;

    return {
      total,
      readyCount: ready.length,
      brokenCount: broken.length,
      waitingPartsCount: waitingParts.length,
      maintenanceCount: maintenance.length,
      availabilityPct,
      pieData: [
        { name: 'آماده به کار', value: ready.length, color: STATUS_COLORS['آماده به کار'] },
        { name: 'خراب / در تعمیرگاه', value: broken.length, color: STATUS_COLORS['خراب / در تعمیرگاه'] },
        { name: 'در انتظار قطعه', value: waitingParts.length, color: STATUS_COLORS['در انتظار قطعه'] },
        { name: 'سرویس دوره‌ای', value: maintenance.length, color: STATUS_COLORS['سرویس دوره‌ای'] },
      ].filter((d) => d.value > 0),
    };
  }, [records]);

  const unitChartData = useMemo(() => {
    const map = new Map<string, { unit: string; ready: number; stopped: number }>();
    records.forEach((r) => {
      const u = r.unitName || 'سایر واحدها';
      const item = map.get(u) || { unit: u, ready: 0, stopped: 0 };
      if (r.status === 'آماده به کار') item.ready += 1;
      else item.stopped += 1;
      map.set(u, item);
    });
    return Array.from(map.values());
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return records.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.machineCode.toLowerCase().includes(q) ||
        r.machineName.toLowerCase().includes(q) ||
        r.machineType.toLowerCase().includes(q) ||
        r.unitName.toLowerCase().includes(q) ||
        (r.issueDescription || '').toLowerCase().includes(q)
      );
    });
  }, [records, statusFilter, searchTerm]);

  const getStatusBadge = (status: MiningMachineryStatus) => {
    switch (status) {
      case 'آماده به کار':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'خراب / در تعمیرگاه':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'در انتظار قطعه':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'سرویس دوره‌ای':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const res = await onSave(editingRecord);
    if (res.success) {
      setFeedback({ type: 'success', text: res.message || 'ذخیره شد.' });
      setEditingRecord(null);
    } else {
      setFeedback({ type: 'error', text: res.message || 'خطا در ثبت اطلاعات دستگاه.' });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-rose-600 to-amber-500 text-white shadow-sm">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              پایش وضعیت ماشین‌آلات، دستگاه‌های خراب در تعمیرگاه و تجهیزات آماده به کار
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              گزارش زنده آماده‌به‌کاری ناوگان معدن، تجهیزات متوقف‌شده در تعمیرگاه و قابلیت ورود مستقیم با اکسل
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجوی کد، نام یا شرح خرابی..."
              className="pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs w-56 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <button
              onClick={() =>
                setEditingRecord({
                  machineCode: '',
                  machineName: '',
                  machineType: 'دامپتراک',
                  unitName: unitNames[0] || 'استخراج و معدن‌کاری',
                  status: 'آماده به کار',
                  issueDescription: '',
                  stoppedSince: '',
                  estimatedReadyDate: '',
                  operatorName: '',
                  notes: '',
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              ثبت دستگاه / وضعیت تعمیرگاه
            </button>
          )}

          {canImportExcel && (
            <button
              onClick={() => setShowSmartImport((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              ورود اکسل ماشین‌آلات و تعمیرگاه
            </button>
          )}

          <button
            onClick={() => downloadCeoMachineryTemplate()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            دانلود نمونه اکسل تعمیرگاه
          </button>

          {canExportExcel && (
            <button
              onClick={() => exportCeoMachineryToExcel(records)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              خروجی اکسل ماشین‌آلات
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
                <span className="text-[11px] font-bold text-rose-700">کل جدول ماشین‌آلات پاک شود؟</span>
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
                پاک کردن کل لیست ماشین‌آلات
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
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showSmartImport && (
        <SmartExcelImportMapper
          moduleType="ceoMachinery"
          title="ورود هوشمند اکسل ماشین‌آلات آماده به کار و دستگاه‌های تعمیرگاه"
          subtitle="تمامی فایل‌های اکسل لیست ماشین‌آلات، کد دستگاه، وضعیت آماده‌به‌کار یا خراب در تعمیرگاه به صورت خودکار تطبیق داده می‌شوند."
          onDownloadTemplate={downloadCeoMachineryTemplate}
          onCancel={() => setShowSmartImport(false)}
          accentColor="amber"
          onImport={async (mappedRows) => {
            const res = await onBatchImport(mappedRows);
            setFeedback({
              type: res.success ? 'success' : 'error',
              text: res.message || (res.success ? 'لیست ماشین‌آلات با موفقیت ذخیره شد.' : 'خطا در ورود فایل.'),
            });
            if (res.success) setShowSmartImport(false);
          }}
        />
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`text-right p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-200'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/70'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>کل ناوگان ثبت‌شده</span>
            <Truck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5">
            {toPersianDigits(stats.total)} <span className="text-xs font-medium text-slate-500">دستگاه</span>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('آماده به کار')}
          className={`text-right p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'آماده به کار'
              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
              : 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>آماده به کار</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 mt-1.5">
            {toPersianDigits(stats.readyCount)} <span className="text-xs font-medium">دستگاه</span>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('خراب / در تعمیرگاه')}
          className={`text-right p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'خراب / در تعمیرگاه'
              ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-200'
              : 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
            <span>خراب / در تعمیرگاه</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-800 mt-1.5">
            {toPersianDigits(stats.brokenCount)} <span className="text-xs font-medium">دستگاه</span>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('در انتظار قطعه')}
          className={`text-right p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'در انتظار قطعه'
              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
              : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
            <span>در انتظار قطعه</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-800 mt-1.5">
            {toPersianDigits(stats.waitingPartsCount)} <span className="text-xs font-medium">دستگاه</span>
          </div>
        </button>

        <div className="p-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-800 to-slate-900 text-white">
          <div className="text-xs text-slate-300 font-medium">ضریب آماده‌به‌کاری ناوگان</div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5">
            {toPersianDigits(stats.availabilityPct.toFixed(1))}٪
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            سرویس دوره‌ای: {toPersianDigits(stats.maintenanceCount)} دستگاه
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-50/60 rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-800 mb-3">ترکیب وضعیت ماشین‌آلات (آماده به کار در برابر تعمیرگاه)</h4>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={86}
                  paddingAngle={4}
                >
                  {stats.pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any) => `${toPersianDigits(v)} دستگاه`}
                  contentStyle={{ borderRadius: '12px', direction: 'rtl' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-50/60 rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-800 mb-3">پراکندگی تجهیزات آماده و متوقف به تفکیک واحدها</h4>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitChartData} margin={{ top: 10, right: 16, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="unit" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(v: any) => `${toPersianDigits(v)} دستگاه`}
                  contentStyle={{ borderRadius: '12px', direction: 'rtl' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="ready" name="آماده به کار" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="stopped" name="متوقف / در تعمیرگاه" fill="#e11d48" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              {canDelete && (
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredRecords.length > 0 &&
                      filteredRecords.every((r) => selectedIds.includes(r.id))
                    }
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? filteredRecords.map((r) => r.id) : [])
                    }
                    className="rounded border-slate-300"
                  />
                </th>
              )}
              <th className="p-3 font-bold">کد دستگاه</th>
              <th className="p-3 font-bold">نام و مدل تجهیز</th>
              <th className="p-3 font-bold">واحد بهره‌بردار</th>
              <th className="p-3 font-bold">وضعیت</th>
              <th className="p-3 font-bold">شرح خرابی / وضعیت تعمیرگاه</th>
              <th className="p-3 font-bold">تاریخ توقف / تحویل</th>
              <th className="p-3 font-bold">مسئول / اپراتور</th>
              <th className="p-3 font-bold text-center">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  دستگاهی با فیلتر فعلی ثبت نشده است.
                </td>
              </tr>
            ) : (
              filteredRecords.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setDetailMachine(m)}
                  className="hover:bg-amber-50/40 transition-colors cursor-pointer"
                >
                  {canDelete && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                  )}
                  <td className="p-3 font-bold text-slate-800">{toPersianDigits(m.machineCode)}</td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{m.machineName}</div>
                    <div className="text-[11px] text-slate-400">{m.machineType}</div>
                  </td>
                  <td className="p-3 text-slate-700">{m.unitName}</td>
                  <td className="p-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadge(m.status)}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 max-w-xs truncate">{m.issueDescription || '-'}</td>
                  <td className="p-3 text-slate-600">
                    <div>توقف: {toPersianDigits(m.stoppedSince || '-')}</div>
                    <div className="text-[11px] text-indigo-700">تحویل: {toPersianDigits(m.estimatedReadyDate || '-')}</div>
                  </td>
                  <td className="p-3 text-slate-700">{m.operatorName || '-'}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setDetailMachine(m)}
                        title="مشاهده جزئیات دستگاه"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => setEditingRecord(m)}
                          title="ویرایش"
                          className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => onDelete(m.id)}
                          title="حذف"
                          className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailMachine && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">{detailMachine.machineName}</h4>
                <p className="text-xs text-slate-500">کد تجهیز: {toPersianDigits(detailMachine.machineCode)}</p>
              </div>
              <button
                onClick={() => setDetailMachine(null)}
                className="p-1.5 rounded-xl bg-slate-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="text-slate-400">وضعیت فعلی</div>
                <div className="font-bold text-slate-900 mt-1">{detailMachine.status}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="text-slate-400">واحد بهره‌بردار</div>
                <div className="font-bold text-slate-900 mt-1">{detailMachine.unitName}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="text-slate-400">تاریخ ورود / توقف</div>
                <div className="font-bold text-slate-900 mt-1">{toPersianDigits(detailMachine.stoppedSince || '-')}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="text-slate-400">تخمین آماده‌به‌کار</div>
                <div className="font-bold text-indigo-700 mt-1">{toPersianDigits(detailMachine.estimatedReadyDate || '-')}</div>
              </div>
            </div>
            <div className="p-3 bg-rose-50/60 border border-rose-100 rounded-2xl text-xs text-slate-800">
              <div className="font-bold text-rose-800 mb-1">شرح وضعیت فنی و تعمیرگاه:</div>
              <div>{detailMachine.issueDescription || 'توضیحی ثبت نشده است.'}</div>
            </div>
            {detailMachine.notes && (
              <div className="p-3 bg-slate-50 rounded-2xl text-xs text-slate-700">
                <span className="font-bold">یادداشت: </span>
                {detailMachine.notes}
              </div>
            )}
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
                {editingRecord.id ? 'ویرایش وضعیت دستگاه / تعمیرگاه' : 'ثبت دستگاه جدید در ناوگان'}
              </h4>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-xl bg-slate-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">کد دستگاه / پلاک *</label>
                <input
                  type="text"
                  required
                  value={editingRecord.machineCode || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, machineCode: e.target.value })}
                  placeholder="مثلاً EQ-DT-105"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام و مدل دستگاه *</label>
                <input
                  type="text"
                  required
                  value={editingRecord.machineName || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, machineName: e.target.value })}
                  placeholder="مثلاً دامپتراک بلاز ۴۵ تن"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع ماشین‌آلات</label>
                <input
                  type="text"
                  value={editingRecord.machineType || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, machineType: e.target.value })}
                  placeholder="دامپتراک / لودر / بیل مکانیکی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">واحد مستقر</label>
                <input
                  type="text"
                  list="machinery-units-list"
                  value={editingRecord.unitName || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, unitName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="machinery-units-list">
                  {unitNames.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">وضعیت دستگاه *</label>
                <select
                  value={editingRecord.status || 'آماده به کار'}
                  onChange={(e) =>
                    setEditingRecord({
                      ...editingRecord,
                      status: e.target.value as MiningMachineryStatus,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">اپراتور / مسئول تعمیر</label>
                <input
                  type="text"
                  value={editingRecord.operatorName || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, operatorName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">تاریخ توقف / ورود به تعمیرگاه</label>
                <input
                  type="text"
                  value={editingRecord.stoppedSince || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, stoppedSince: e.target.value })}
                  placeholder="مثلاً 1403/08/25"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">تخمین آماده‌به‌کار</label>
                <input
                  type="text"
                  value={editingRecord.estimatedReadyDate || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, estimatedReadyDate: e.target.value })}
                  placeholder="مثلاً 1403/08/30"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-bold text-slate-700 mb-1">شرح خرابی / وضعیت تعمیرگاه</label>
              <textarea
                rows={2}
                value={editingRecord.issueDescription || ''}
                onChange={(e) => setEditingRecord({ ...editingRecord, issueDescription: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="text-xs">
              <label className="block font-bold text-slate-700 mb-1">یادداشت</label>
              <input
                type="text"
                value={editingRecord.notes || ''}
                onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
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
                ذخیره وضعیت تجهیز
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
