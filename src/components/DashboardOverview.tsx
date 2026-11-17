import React from 'react';
import {
  Users,
  TrendingUp,
  Award,
  FileCheck,
  HardDrive,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  Building2,
  CheckCircle,
  Clock,
  ShieldCheck,
  BarChart3,
  Crown,
  Layers
} from 'lucide-react';
import { Personnel, KaranehRecord, PersonnelCommitment, DatabaseStatus } from '../types';
import { formatRial, formatPercent, toPersianDigits } from '../utils/persian';
import { api } from '../services/api';

interface DashboardOverviewProps {
  personnel: Personnel[];
  karaneh: KaranehRecord[];
  commitments: PersonnelCommitment[];
  dbStatus: DatabaseStatus | null;
  isAdmin?: boolean;
  canViewSmartDashboard?: boolean;
  canViewCeoDashboard?: boolean;
  canViewUnitOperations?: boolean;
  onNavigate: (tab: string) => void;
  onOpenAddPersonnel: () => void;
  onOpenUploadKaraneh: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  personnel,
  karaneh,
  commitments,
  dbStatus,
  isAdmin = false,
  canViewSmartDashboard = false,
  canViewCeoDashboard = false,
  canViewUnitOperations = false,
  onNavigate,
  onOpenAddPersonnel,
  onOpenUploadKaraneh
}) => {
  // Current month (1403-08) & previous month (1403-07)
  const currentKaranehList = karaneh.filter(k => k.period === '1403-08');
  const previousKaranehList = karaneh.filter(k => k.period === '1403-07');

  const totalCurrentKaraneh = currentKaranehList.reduce((sum, k) => sum + (k.finalKaraneh || 0), 0);
  const totalPreviousKaraneh = previousKaranehList.reduce((sum, k) => sum + (k.finalKaraneh || 0), 0);

  const diffKaraneh = totalCurrentKaraneh - totalPreviousKaraneh;
  const growthPercent = totalPreviousKaraneh > 0 ? ((diffKaraneh / totalPreviousKaraneh) * 100) : 0;

  const activePersonnel = personnel.filter(p => p.status === 'فعال');
  const activeCommitments = commitments.filter(c => c.status === 'جاری و معتبر');

  // Average Karaneh per employee (Replaced average score)
  const avgKaraneh = currentKaranehList.length > 0
    ? Math.round(totalCurrentKaraneh / currentKaranehList.length)
    : 0;

  // Department counts
  const departmentCounts: Record<string, number> = {};
  personnel.forEach(p => {
    departmentCounts[p.department] = (departmentCounts[p.department] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            {isAdmin ? (
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  پنل مدیریت ارشد سامانه
                </span>
                <span className="text-xs text-slate-300">
                  پایگاه داده لوکال و کنترل کامل دسترسی‌ها
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
                  پورتال اداری و کارگزینی
                </span>
              </div>
            )}
            <h2 className="text-xl font-bold tracking-tight">
              سامانه جامع راهبردی شرکت نگین پرتو نصر
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              مدیریت احکام پرسنلی، پایش واحدهای معدن و ماشین‌آلات تعمیرگاه، بایگانی اسناد تعهدات و آنالیز مقایسه‌ای حقوق و کارانه
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canViewSmartDashboard && (
              <button
                onClick={() => onNavigate('smart-dashboard')}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-teal-600/90 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <BarChart3 className="w-4 h-4" />
                <span>گزارش هوشمند پرسنل</span>
              </button>
            )}
            {canViewCeoDashboard && (
              <button
                onClick={() => onNavigate('ceo-dashboard')}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-500/90 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Crown className="w-4 h-4" />
                <span>داشبورد مدیر عامل نگین پرتو نصر</span>
              </button>
            )}
            {canViewUnitOperations && (
              <button
                onClick={() => onNavigate('unit-operations')}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                <span>عملیات واحدها و دیسپچینگ</span>
              </button>
            )}
            <button
              onClick={onOpenAddPersonnel}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت پرسنل جدید</span>
            </button>
            <button
              onClick={onOpenUploadKaraneh}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>بارگذاری اکسل کارانه</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Personnel */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">کل پرسنل شاغل</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 persian-num">
              {toPersianDigits(activePersonnel.length)}
            </span>
            <span className="text-xs text-slate-600">نفر فعال</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center gap-2">
            <span>رسمی، پیمانی و قراردادی</span>
            <button
              onClick={() => onNavigate('personnel')}
              className="text-indigo-600 hover:underline mr-auto font-medium"
            >
              مشاهده لیست
            </button>
          </div>
        </div>

        {/* KPI 2: Karaneh Month */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">کل کارانه ماه جاری (آبان)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900 persian-num">
              {formatRial(totalCurrentKaraneh)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {diffKaraneh >= 0 ? (
              <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                <ArrowUpRight className="w-3.5 h-3.5" />
                {formatPercent(growthPercent)}
              </span>
            ) : (
              <span className="text-rose-700 font-bold flex items-center gap-0.5">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {formatPercent(growthPercent)}
              </span>
            )}
            <span className="text-slate-600">نسبت به کارانه مهر ماه</span>
          </div>
        </div>

        {/* KPI 3: Commitments */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">تعهدات و تضامین پرسنلی</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 persian-num">
              {toPersianDigits(activeCommitments.length)}
            </span>
            <span className="text-xs text-slate-600">فقره سند جاری</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
            <span>سفته، چک تضمین و خدمت</span>
            <button
              onClick={() => onNavigate('commitments')}
              className="text-amber-700 hover:underline font-medium"
            >
              مدیریت اسناد
            </button>
          </div>
        </div>

        {/* KPI 4: Average Karaneh per Employee (Replaced average score completely) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">میانگین کارانه هر پرسنل</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900 persian-num">
              {formatRial(avgKaraneh)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>بر اساس دوره ماه جاری ({toPersianDigits(currentKaranehList.length)} نفر مشمول)</span>
          </div>
        </div>

      </div>

      {/* Middle Grid: Departments distribution & Quick Karaneh Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Department Personnel Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">توزیع پرسنل در واحدهای سازمانی</h3>
            </div>
            <button
              onClick={() => onNavigate('personnel')}
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              مشاهده همه
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(departmentCounts).map(([dept, count]) => {
              const percentage = Math.round((count / (personnel.length || 1)) * 100);
              return (
                <div key={dept} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{dept}</span>
                    <span className="text-slate-600 font-bold persian-num">
                      {toPersianDigits(count)} نفر ({toPersianDigits(percentage)}٪)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>تعداد واحدهای فعال: {toPersianDigits(Object.keys(departmentCounts).length)} واحد</span>
            <button
              onClick={() => onNavigate('job-groups')}
              className="text-indigo-600 hover:underline font-medium"
            >
              مشاهده رتبه‌های شغلی
            </button>
          </div>
        </div>

        {/* Top Karaneh Growth & Analysis preview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                آنالیز مقایسه‌ای کارانه پرسنل (مهر ماه ۱۴۰۳ ↔ آبان ماه ۱۴۰۳)
              </h3>
            </div>
            <button
              onClick={() => onNavigate('karaneh')}
              className="text-xs text-indigo-600 hover:underline font-bold"
            >
              ورود به سیستم جامع کارانه و اکسل
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">کد پرسنلی</th>
                  <th className="py-2.5 px-3">نام و نام خانوادگی</th>
                  <th className="py-2.5 px-3 text-indigo-900 font-bold">پست سازمانی</th>
                  <th className="py-2.5 px-3">واحد اداری</th>
                  <th className="py-2.5 px-3">کارانه ماه قبل</th>
                  <th className="py-2.5 px-3 font-bold text-indigo-900">کارانه ماه جدید</th>
                  <th className="py-2.5 px-3">تغییرات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentKaranehList.slice(0, 5).map((curr) => {
                  const prev = previousKaranehList.find(p => p.personnelCode === curr.personnelCode);
                  const prevFinal = prev ? prev.finalKaraneh : 0;
                  const diff = curr.finalKaraneh - prevFinal;
                  const percent = prevFinal > 0 ? ((diff / prevFinal) * 100) : 0;

                  return (
                    <tr key={curr.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-700 persian-num">
                        {toPersianDigits(curr.personnelCode)}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {curr.fullName}
                      </td>
                      <td className="py-3 px-3 text-slate-800 font-medium">
                        {curr.position || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {curr.department || '—'}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-600 persian-num">
                        {formatRial(prevFinal)}
                      </td>
                      <td className="py-3 px-3 font-bold text-indigo-700 persian-num">
                        {formatRial(curr.finalKaraneh)}
                      </td>
                      <td className="py-3 px-3">
                        {diff >= 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold persian-num bg-emerald-50 px-2 py-0.5 rounded-md">
                            <ArrowUpRight className="w-3 h-3" />
                            {formatPercent(percent)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold persian-num bg-rose-50 px-2 py-0.5 rounded-md">
                            <ArrowDownRight className="w-3 h-3" />
                            {formatPercent(percent)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>نمایش ۵ مورد اول · برای مشاهده همه مبالغ، مقایسه کامل و خروجی اکسل کلیک کنید</span>
            <button
              onClick={() => onNavigate('karaneh')}
              className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold transition-colors"
            >
              آنالیز تفصیلی و چاپ
            </button>
          </div>
        </div>

      </div>

      {/* Local Disk Storage & Internet Access Box - STRICTLY ADMIN ONLY */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  پشتیبان‌گیری و دسترسی آنلاین سامانه (ویژه مدیر ارشد)
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  ذخیره‌سازی دائمی و رمزنگاری‌شده تمام پرونده‌های پرسنلی، احکام، تعهدات و کارانه با قابلیت دریافت نسخه پشتیبان کامل
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('database')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
              >
                راهنمای راه‌اندازی و اتصال اینترنت
              </button>
              <button
                onClick={() => api.downloadBackup()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                دریافت نسخه پشتیبان (JSON)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
