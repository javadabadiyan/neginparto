import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Clock,
  Users,
  Activity,
  FileEdit,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SecurityAuditLog, User, AuditActionType } from '../types';
import { api } from '../services/api';
import { toPersianDigits } from '../utils/persian';
import { formatIranDateTime } from '../utils/audit';

interface SecurityAuditLogsPanelProps {
  users: User[];
}

const MODULE_LABELS: Record<string, string> = {
  auth: 'ورود و نشست امنیتی',
  users: 'کاربران و سطوح دسترسی',
  personnel: 'پرونده پرسنلی',
  relatives: 'بستگان و عائله',
  karaneh: 'کارانه ماهانه',
  finalKaraneh: 'کارانه نهایی ارسالی',
  payroll: 'حقوق و دستمزد',
  jobGroups: 'گروه‌های شغلی',
  jobClassifications: 'طبقه‌بندی مشاغل',
  commitments: 'تعهدات و تضامین',
  miningVolumes: 'حجم عملیات معدن',
  miningMachinery: 'ماشین‌آلات و تعمیرگاه',
  unitReports: 'گزارش واحدها',
  database: 'پایگاه داده و پشتیبان‌گیری',
};

const ACTION_META: Record<string, { label: string; toneClass: string }> = {
  login: { label: 'ورود به سامانه', toneClass: 'text-sky-700' },
  create: { label: 'ایجاد رکورد', toneClass: 'text-emerald-700' },
  update: { label: 'ویرایش اطلاعات', toneClass: 'text-indigo-700' },
  delete: { label: 'حذف رکورد', toneClass: 'text-rose-700' },
  batch_delete: { label: 'حذف گروهی', toneClass: 'text-rose-700' },
  delete_all: { label: 'پاکسازی کامل', toneClass: 'text-rose-800' },
  import_excel: { label: 'ورود اکسل', toneClass: 'text-amber-700' },
  submit: { label: 'تأیید و ارسال نهایی', toneClass: 'text-emerald-700' },
  reopen: { label: 'بازگشت به پیش‌نویس', toneClass: 'text-amber-700' },
  backup: { label: 'دریافت بکاپ', toneClass: 'text-slate-700' },
  restore: { label: 'بازیابی دیتابیس', toneClass: 'text-indigo-700' },
  reset_demo: { label: 'بازنشانی دمو', toneClass: 'text-rose-700' },
};

const PAGE_SIZE = 50;

export const SecurityAuditLogsPanel: React.FC<SecurityAuditLogsPanelProps> = ({ users }) => {
  const [logs, setLogs] = useState<SecurityAuditLog[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = async (targetPage = page) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getAuditLogs({
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE,
        userId: selectedUserId || undefined,
        module: selectedModule || undefined,
        action: selectedAction || undefined,
        search: debouncedSearch || undefined,
      });
      setLogs(res.data || []);
      setTotal(Number(res.total || 0));
    } catch (err: any) {
      setError(err?.message || 'خطا در دریافت تاریخچه امنیت و عملکرد کاربران');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(page);
  }, [page, selectedUserId, selectedModule, selectedAction, debouncedSearch]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const userOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    users.forEach((u) => {
      if (u.id) {
        map.set(u.id, { id: u.id, label: `${u.fullName} (${u.username})` });
      }
    });
    logs.forEach((l) => {
      if (l.userId && !map.has(l.userId)) {
        map.set(l.userId, { id: l.userId, label: `${l.userFullName || l.username} (${l.username})` });
      }
    });
    return Array.from(map.values());
  }, [users, logs]);

  const pageStats = useMemo(() => {
    const editOrDeleteCount = logs.filter((l) =>
      ['create', 'update', 'delete', 'batch_delete', 'delete_all'].includes(l.action)
    ).length;
    const importOrSubmitCount = logs.filter((l) =>
      ['import_excel', 'submit', 'reopen', 'backup', 'restore'].includes(l.action)
    ).length;
    const uniqueActors = new Set(logs.map((l) => l.username || l.userId).filter(Boolean)).size;
    return { editOrDeleteCount, importOrSubmitCount, uniqueActors };
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const res = await api.getAuditLogs({
        limit: 1000,
        offset: 0,
        userId: selectedUserId || undefined,
        module: selectedModule || undefined,
        action: selectedAction || undefined,
        search: debouncedSearch || undefined,
      });
      const rows = (res.data || []).map((log, i) => ({
        ردیف: i + 1,
        'تاریخ و ساعت': log.persianDateTime || formatIranDateTime(log.createdAtIso),
        'نام کاربر': log.userFullName || log.username,
        'نام کاربری': log.username,
        'نقش سازمانی': log.userRole || '—',
        'بخش سامانه': MODULE_LABELS[log.module] || log.module,
        'نوع عملیات': ACTION_META[log.action]?.label || log.action,
        'رکورد هدف': log.targetLabel || '—',
        'تعداد رکورد': log.recordCount ?? 1,
        'شرح عملیات': log.summary,
        'جزئیات تغییرات': Array.isArray(log.changes) && log.changes.length > 0
          ? log.changes.map((c) => `${c.label}: «${c.oldValue}» ← «${c.newValue}»`).join(' | ')
          : '—',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'گزارش امنیت');
      XLSX.writeFile(wb, `security_audit_logs_${Date.now()}.xlsx`);
    } catch (err: any) {
      setError(err?.message || 'خطا در خروجی اکسل تاریخچه عملکرد');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              مرکز امنیت و ردیابی تاریخچه عملکرد کاربران
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              ثبت خودکار تمامی ورودها، ویرایش‌ها، حذف‌ها، بارگذاری‌های اکسل و تغییرات مقادیر فیلدها با تاریخ و ساعت دقیق
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchLogs(page)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>بروزرسانی گزارش</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={exporting || logs.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exporting ? 'در حال تهیه اکسل...' : 'خروجی اکسل امنیت'}</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>کل رویدادهای ثبت‌شده</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1.5 tabular-nums persian-num">
            {toPersianDigits(total)} رویداد
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>ایجاد، ویرایش و حذف (صفحه فعلی)</span>
            <FileEdit className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg font-bold text-indigo-700 mt-1.5 tabular-nums persian-num">
            {toPersianDigits(pageStats.editOrDeleteCount)} مورد
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>اکسل، ارسال و پشتیبان (صفحه فعلی)</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg font-bold text-emerald-700 mt-1.5 tabular-nums persian-num">
            {toPersianDigits(pageStats.importOrSubmitCount)} مورد
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>کاربران فعال در فهرست</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg font-bold text-slate-800 mt-1.5 tabular-nums persian-num">
            {toPersianDigits(pageStats.uniqueActors)} کاربر
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در کاربر، شرح یا رکورد هدف..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
          />
        </div>

        <select
          value={selectedUserId}
          onChange={(e) => {
            setSelectedUserId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
        >
          <option value="">همه کاربران سامانه</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>

        <select
          value={selectedModule}
          onChange={(e) => {
            setSelectedModule(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
        >
          <option value="">همه بخش‌های سامانه</option>
          {Object.entries(MODULE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={selectedAction}
          onChange={(e) => {
            setSelectedAction(e.target.value as AuditActionType | '');
            setPage(1);
          }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
        >
          <option value="">همه نوع عملیات‌ها</option>
          {Object.entries(ACTION_META).map(([k, meta]) => (
            <option key={k} value={k}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[960px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <th className="py-3 px-3 text-center w-12">ردیف</th>
                <th className="py-3 px-3 w-40">تاریخ و ساعت (ایران)</th>
                <th className="py-3 px-3 w-48">کاربر انجام‌دهنده</th>
                <th className="py-3 px-3 w-36">بخش سامانه</th>
                <th className="py-3 px-3 w-36">نوع عملیات</th>
                <th className="py-3 px-4">شرح اقدام و رکورد هدف</th>
                <th className="py-3 px-3 text-center w-36">جزئیات تغییرات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="py-3.5 px-4">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 space-y-2">
                    <div className="font-bold text-slate-800">هیچ رویداد امنیتی با فیلترهای انتخابی یافت نشد.</div>
                    <p className="text-[11px] text-slate-500">
                      پس از ورود کاربران یا ثبت و ویرایش رکوردها، تاریخچه کامل در این بخش نمایش داده می‌شود.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => {
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                  const actionInfo = ACTION_META[log.action] || { label: log.action, toneClass: 'text-slate-700' };
                  const hasChanges = Array.isArray(log.changes) && log.changes.length > 0;
                  const isExpanded = Boolean(expandedIds[log.id]);
                  const formattedTime = log.persianDateTime || formatIranDateTime(log.createdAtIso);

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-500 tabular-nums persian-num">
                          {toPersianDigits(rowNum)}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-700 tabular-nums persian-num whitespace-nowrap" dir="ltr">
                          {toPersianDigits(formattedTime)}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{log.userFullName || log.username || 'کاربر سامانه'}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span dir="ltr">{log.username || '—'}</span>
                            {log.userRole && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{log.userRole}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700">
                          {MODULE_LABELS[log.module] || log.module}
                        </td>
                        <td className={`py-3 px-3 font-bold whitespace-nowrap ${actionInfo.toneClass}`}>
                          {actionInfo.label}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900 font-medium leading-relaxed">{log.summary}</div>
                          {(log.targetLabel || (log.recordCount && log.recordCount > 1)) && (
                            <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                              {log.targetLabel && <span>هدف: {log.targetLabel}</span>}
                              {log.targetLabel && log.recordCount && log.recordCount > 1 && <span aria-hidden="true">·</span>}
                              {log.recordCount && log.recordCount > 1 && (
                                <span className="tabular-nums persian-num">تعداد رکورد: {toPersianDigits(log.recordCount)}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {hasChanges ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(log.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap persian-num"
                            >
                              <span>مشاهده تغییرات ({toPersianDigits(log.changes!.length)})</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">ثبت بدون تغییر فیلد</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && hasChanges && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="px-6 py-3.5 border-t border-slate-200/70">
                            <div className="text-[11px] font-bold text-slate-700 mb-2">
                              جدول مقایسه مقادیر قبل و بعد از ویرایش:
                            </div>
                            <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                              <table className="w-full text-right text-[11px]">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                    <th className="py-2 px-3 w-48">فیلد تغییریافته</th>
                                    <th className="py-2 px-3">مقدار قبلی</th>
                                    <th className="py-2 px-3">مقدار جدید</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {log.changes!.map((ch, cIdx) => (
                                    <tr key={`${log.id}-ch-${cIdx}`}>
                                      <td className="py-2 px-3 font-bold text-slate-800">{ch.label || ch.field}</td>
                                      <td className="py-2 px-3 text-rose-700 tabular-nums persian-num">{ch.oldValue || '—'}</td>
                                      <td className="py-2 px-3 text-emerald-700 font-semibold tabular-nums persian-num">{ch.newValue || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
          <div className="tabular-nums persian-num">
            نمایش صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)} · مجموع {toPersianDigits(total)} رویداد ثبت‌شده
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 font-semibold"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <span>صفحه قبل</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 font-semibold"
            >
              <span>صفحه بعد</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
