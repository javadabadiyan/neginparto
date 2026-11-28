import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from '../types';
import {
  Users,
  TrendingUp,
  Award,
  FileCheck,
  Shield,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Wallet,
  BarChart3,
  Pickaxe,
  Layers,
  CalendarDays,
  ChevronDown,
  Send
} from 'lucide-react';
import { normalizePermissions, getFirstAccessibleTab } from '../utils/permissions';
import { getDayIranCalendarInfo, getCurrentJalaliMonthEvents } from '../utils/iranCalendar';
import { toPersianDigits } from '../utils/persian';

interface NavbarProps {
  currentUser: User | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  onOpenDatabaseModal?: () => void;
}

interface NavItemConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'default' | 'sky' | 'ceo' | 'emerald';
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'javadabadiyan';
  const perms = normalizePermissions(currentUser?.permissions);

  const canViewDashboard = isAdmin || Boolean(perms.system?.dashboardStats);
  const canViewSmartDashboard = isAdmin || Boolean(perms.smartDashboard?.view);
  const canViewCeoDashboard = isAdmin || Boolean(perms.ceoDashboard?.view);
  const canViewUnitOperations = isAdmin || Boolean(perms.unitOperations?.view);
  const canViewPersonnel = isAdmin || Boolean(perms.personnel?.view);
  const canViewCommitments = isAdmin || Boolean(perms.commitments?.view);
  const canViewJobGroups = isAdmin || Boolean(perms.jobGroups?.view);
  const canViewPayroll = isAdmin || Boolean(perms.payroll?.view);
  const canViewKaraneh = isAdmin || Boolean(perms.karaneh?.view);
  const canViewFinalKaraneh = isAdmin || Boolean(perms.finalKaraneh?.view);
  const canViewUsers = isAdmin || Boolean(perms.users?.view) || Boolean(perms.system?.securityLogs);
  const canViewBackup = isAdmin || Boolean(perms.system?.backupDatabase) || Boolean(perms.system?.restoreDatabase);
  const defaultTab = getFirstAccessibleTab(perms, isAdmin);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Refresh Iranian calendar date every 60 seconds
  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayCalendar = useMemo(() => getDayIranCalendarInfo(nowDate), [nowDate]);
  const monthCalendar = useMemo(() => getCurrentJalaliMonthEvents(nowDate), [nowDate]);

  const navItems: NavItemConfig[] = [
    ...(canViewDashboard
      ? [{ id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, accent: 'default' as const }]
      : []),
    ...(canViewSmartDashboard
      ? [{ id: 'smart-dashboard', label: 'هوشمند پرسنل', icon: BarChart3, accent: 'sky' as const }]
      : []),
    ...(canViewCeoDashboard
      ? [{ id: 'ceo-dashboard', label: 'مدیر عامل', icon: Pickaxe, accent: 'ceo' as const }]
      : []),
    ...(canViewUnitOperations
      ? [{ id: 'unit-operations', label: 'عملیات واحدها', icon: Layers, accent: 'emerald' as const }]
      : []),
    ...(canViewPersonnel
      ? [{ id: 'personnel', label: 'پرسنل', icon: Users, accent: 'default' as const }]
      : []),
    ...(canViewCommitments
      ? [{ id: 'commitments', label: 'تعهدات', icon: FileCheck, accent: 'default' as const }]
      : []),
    ...(canViewJobGroups
      ? [{ id: 'job-groups', label: 'گروه‌های شغلی', icon: Award, accent: 'default' as const }]
      : []),
    ...(canViewPayroll
      ? [{ id: 'payroll', label: 'حقوق', icon: Wallet, accent: 'default' as const }]
      : []),
    ...(canViewKaraneh
      ? [{ id: 'karaneh', label: 'کارانه', icon: TrendingUp, accent: 'default' as const }]
      : []),
    ...(canViewFinalKaraneh
      ? [{ id: 'final-karaneh', label: 'کارانه نهایی ارسالی', icon: Send, accent: 'default' as const }]
      : []),
    ...(canViewUsers
      ? [{ id: 'users', label: perms.users?.view || isAdmin ? 'کاربران و امنیت' : 'امنیت و گزارش عملکرد', icon: Shield, accent: 'default' as const }]
      : []),
    ...(canViewBackup
      ? [{ id: 'database', label: 'پشتیبان‌گیری', icon: HardDrive, accent: 'default' as const }]
      : []),
  ];

  // Auto-center active navigation tab smoothly on mobile & tablet horizontal scroll bars
  useEffect(() => {
    const btn = tabButtonRefs.current[activeTab];
    if (btn && typeof btn.scrollIntoView === 'function') {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  // Close Calendar popover on outside click or Escape
  useEffect(() => {
    if (!calendarOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [calendarOpen]);

  const getTabButtonClass = (isActive: boolean, accent: NavItemConfig['accent'] = 'default') => {
    const base =
      'whitespace-nowrap shrink-0 min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-1';
    if (!isActive) {
      return `${base} text-slate-600 hover:text-slate-900 hover:bg-slate-200/70`;
    }
    if (accent === 'ceo') {
      return `${base} bg-slate-900 text-amber-300 shadow-xs font-bold`;
    }
    if (accent === 'emerald') {
      return `${base} bg-emerald-600 text-white shadow-xs font-bold`;
    }
    if (accent === 'sky') {
      return `${base} bg-sky-600 text-white shadow-xs font-bold`;
    }
    return `${base} bg-indigo-600 text-white shadow-xs font-bold`;
  };

  const getIconClass = (isActive: boolean, accent: NavItemConfig['accent'] = 'default') => {
    if (isActive) {
      return accent === 'ceo' ? 'w-3.5 h-3.5 shrink-0 text-amber-300' : 'w-3.5 h-3.5 shrink-0 text-white';
    }
    if (accent === 'ceo') return 'w-3.5 h-3.5 shrink-0 text-amber-600';
    if (accent === 'emerald') return 'w-3.5 h-3.5 shrink-0 text-emerald-600';
    if (accent === 'sky') return 'w-3.5 h-3.5 shrink-0 text-sky-600';
    return 'w-3.5 h-3.5 shrink-0 text-slate-500';
  };

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40 shadow-2xs no-print">
      {/* Row 1: Compact Utility Header */}
      <div className="max-w-[1440px] mx-auto px-2.5 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-11 sm:h-12 gap-2 sm:gap-3">
          {/* Brand Zone */}
          <button
            type="button"
            onClick={() => onSelectTab(defaultTab)}
            className="flex items-center gap-2 min-w-0 cursor-pointer text-right shrink-0"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-[11px] sm:text-xs shrink-0">
              ن‌پ
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap truncate max-w-[130px] sm:max-w-none">
              شرکت نگین پرتو نصر
            </span>
          </button>

          {/* Iranian Date, Occasions & Holidays Widget + User Zone */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="relative" ref={calendarRef}>
              <button
                type="button"
                onClick={() => setCalendarOpen((v) => !v)}
                aria-expanded={calendarOpen}
                aria-haspopup="dialog"
                title="تقویم رسمی ایران، مناسبت‌ها و تعطیلات ماه"
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 min-h-[34px] text-[11px] font-semibold border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer persian-num ${
                  todayCalendar.isHoliday
                    ? 'bg-rose-50 hover:bg-rose-100/80 border-rose-200 text-rose-900'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                }`}
              >
                <CalendarDays
                  className={`w-3.5 h-3.5 shrink-0 ${
                    todayCalendar.isHoliday ? 'text-rose-600' : 'text-indigo-600'
                  }`}
                />
                <span className="hidden sm:inline font-bold">{todayCalendar.persianDateFull}</span>
                <span className="sm:hidden font-bold">{todayCalendar.persianDateShort}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    todayCalendar.isHoliday
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {todayCalendar.isHoliday ? 'تعطیل رسمی' : 'روز کاری'}
                </span>
                {todayCalendar.occasions.some((o) => o.category !== 'weekly') && (
                  <span className="hidden lg:inline text-[10.5px] text-slate-600 max-w-[180px] truncate">
                    · {todayCalendar.primaryOccasionTitle}
                  </span>
                )}
                <ChevronDown
                  className={`w-3 h-3 text-slate-500 transition-transform ${calendarOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {calendarOpen && (
                <div
                  role="dialog"
                  aria-label="تقویم، مناسبت‌ها و تعطیلات رسمی"
                  className="fixed sm:absolute left-2 right-2 sm:left-0 sm:right-auto mt-1.5 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl p-3.5 z-50 space-y-3 text-right"
                >
                  {/* Today Overview */}
                  <div
                    className={`p-3 rounded-xl border space-y-1.5 ${
                      todayCalendar.isHoliday
                        ? 'bg-rose-50/80 border-rose-200'
                        : 'bg-indigo-50/60 border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 persian-num">
                        {todayCalendar.persianDateFull}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          todayCalendar.isHoliday
                            ? 'bg-rose-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {todayCalendar.isHoliday ? 'تعطیل رسمی' : 'روز کاری'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-600 persian-num">
                      <span>قمری: {todayCalendar.hijriDateShort}</span>
                      <span className="text-slate-300">|</span>
                      <span dir="ltr">{todayCalendar.gregorianDateShort}</span>
                    </div>
                    <div className="pt-1 border-t border-slate-200/70 space-y-1">
                      <div className="text-[10.5px] font-bold text-slate-700">مناسبت‌های امروز:</div>
                      {todayCalendar.occasions.length > 0 ? (
                        <ul className="space-y-1">
                          {todayCalendar.occasions.map((occ, i) => (
                            <li
                              key={`${occ.title}-${i}`}
                              className={`text-[11px] font-semibold flex items-center justify-between gap-2 ${
                                occ.isHoliday ? 'text-rose-700' : 'text-slate-800'
                              }`}
                            >
                              <span>• {occ.title}</span>
                              {occ.isHoliday && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9.5px] font-bold shrink-0">
                                  تعطیل
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-[11px] text-slate-600">مناسبت رسمی خاصی برای امروز ثبت نشده است.</div>
                      )}
                    </div>
                  </div>

                  {/* Month Holidays & Occasions List */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 px-0.5 persian-num">
                      <span>
                        مناسبت‌ها و تعطیلات {monthCalendar.jMonthName} {toPersianDigits(monthCalendar.jYear)}
                      </span>
                      <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                        {toPersianDigits(monthCalendar.holidaysCount)} روز تعطیل
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
                      {monthCalendar.events.length === 0 ? (
                        <div className="text-[11px] text-slate-500 py-3 text-center">
                          رویدادی برای این ماه ثبت نشده است.
                        </div>
                      ) : (
                        monthCalendar.events.map((ev) => {
                          const isToday = ev.jDay === todayCalendar.jDay;
                          return (
                            <div
                              key={ev.jDay}
                              className={`p-2 rounded-xl border text-[11px] flex items-start justify-between gap-2 persian-num ${
                                isToday
                                  ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
                                  : ev.isHoliday
                                  ? 'bg-rose-50/50 border-rose-200/80'
                                  : 'bg-slate-50 border-slate-200/80'
                              }`}
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{ev.persianDateLabel}</span>
                                  {isToday && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9.5px] font-bold">
                                      امروز
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10.5px] text-slate-700 leading-relaxed">
                                  {ev.occasions.map((o) => o.title).join(' · ')}
                                </div>
                              </div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold shrink-0 ${
                                  ev.isHoliday
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-slate-200/80 text-slate-700'
                                }`}
                              >
                                {ev.isHoliday ? 'تعطیل' : 'مناسبت'}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {currentUser && (
              <>
                <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-600 whitespace-nowrap">
                  <span className="font-bold text-slate-800 truncate max-w-[140px]">
                    {currentUser.fullName}
                  </span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="hidden lg:inline text-slate-500 truncate max-w-[120px]">
                    {isAdmin ? 'مدیر ارشد' : (currentUser.role || 'کاربر سامانه')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  title="خروج از حساب کاربری"
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[34px] text-[11px] sm:text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>خروج</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Compact Horizontal Single-Line Navigation Strip (No Hamburger) */}
      {navItems.length > 0 && (
        <div className="bg-slate-50/90 border-t border-slate-200/80">
          <div className="max-w-[1440px] mx-auto px-2 sm:px-5 lg:px-6">
            <nav
              aria-label="منوی اصلی سامانه"
              className="flex items-center justify-start lg:justify-between gap-1 overflow-x-auto no-scrollbar py-1.5"
            >
              <div className="flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => {
                        tabButtonRefs.current[item.id] = el;
                      }}
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={getTabButtonClass(isActive, item.accent)}
                    >
                      <Icon className={getIconClass(isActive, item.accent)} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
};
