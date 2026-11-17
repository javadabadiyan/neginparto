import React, { useState, useRef, useEffect } from 'react';
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
  ChevronDown,
  Download,
  Menu,
  X,
  Wallet,
  BarChart3,
  Pickaxe,
  Layers
} from 'lucide-react';
import { downloadKaranehTemplate, downloadPayrollTemplate } from '../utils/excel';
import { normalizePermissions } from '../utils/permissions';

interface NavbarProps {
  currentUser: User | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  onOpenDatabaseModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  onOpenDatabaseModal
}) => {
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'javadabadiyan';
  const perms = normalizePermissions(currentUser?.permissions);
  const canViewSmartDashboard = isAdmin || Boolean(perms.smartDashboard?.view);
  const canViewCeoDashboard = isAdmin || Boolean(perms.ceoDashboard?.view);
  const canViewUnitOperations = isAdmin || Boolean(perms.unitOperations?.view) || Boolean(perms.ceoDashboard?.view);
  const canViewBackup = isAdmin || Boolean(perms.system?.backupDatabase) || Boolean(perms.system?.restoreDatabase);
  const canViewUsers = isAdmin || Boolean(perms.users?.view);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardMenuRef = useRef<HTMLDivElement>(null);
  const hrMenuRef = useRef<HTMLDivElement>(null);
  const compMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dashboardMenuRef.current && !dashboardMenuRef.current.contains(event.target as Node) &&
        hrMenuRef.current && !hrMenuRef.current.contains(event.target as Node) &&
        compMenuRef.current && !compMenuRef.current.contains(event.target as Node) &&
        adminMenuRef.current && !adminMenuRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isDashboardActive = ['dashboard', 'smart-dashboard', 'ceo-dashboard'].includes(activeTab);
  const isHrActive = ['personnel', 'commitments', 'job-groups'].includes(activeTab);
  const isCompActive = ['karaneh', 'payroll'].includes(activeTab);
  const isAdminActive = ['users', 'database'].includes(activeTab);

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">

          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 min-w-0 shrink cursor-pointer text-right"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs shrink-0">
              ن‌پ
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate max-w-[155px] sm:max-w-[230px] lg:max-w-none whitespace-nowrap">
              شرکت نگین پرتو نصر
            </span>
          </button>

          {/* Zone 2: Organized Single-Line Navigation Links (Desktop / Laptop) */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2">

            {/* 1. داشبوردها */}
            <div className="relative" ref={dashboardMenuRef}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'dashboard' ? null : 'dashboard')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isDashboardActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>داشبوردها</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'dashboard' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'dashboard' && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-100">
                    نمای تحلیلی و مدیریتی
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavClick('dashboard')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                      activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold">داشبورد کلان</div>
                      <div className="text-[10px] text-slate-500">نمای کلی آمار و دسترسی سریع</div>
                    </div>
                  </button>

                  {canViewSmartDashboard && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('smart-dashboard')}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                        activeTab === 'smart-dashboard' ? 'bg-sky-50 text-sky-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 text-sky-600 shrink-0" />
                      <div>
                        <div className="font-bold">گزارش‌گیری هوشمند پرسنل</div>
                        <div className="text-[10px] text-slate-500">نمودارهای میله‌ای و دایره‌ای</div>
                      </div>
                    </button>
                  )}

                  {canViewCeoDashboard && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('ceo-dashboard')}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors border-t border-slate-100 cursor-pointer ${
                        activeTab === 'ceo-dashboard' ? 'bg-slate-900 text-amber-300 font-bold' : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Pickaxe className={`w-4 h-4 shrink-0 ${activeTab === 'ceo-dashboard' ? 'text-amber-300' : 'text-amber-600'}`} />
                      <div>
                        <div className="font-bold">داشبورد راهبردی مدیر عامل</div>
                        <div className={`text-[10px] ${activeTab === 'ceo-dashboard' ? 'text-slate-300' : 'text-slate-500'}`}>
                          حجم عملیات، تعمیرگاه و گزارش A4
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 2. عملیات واحدها */}
            {canViewUnitOperations && (
              <button
                type="button"
                onClick={() => handleNavClick('unit-operations')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'unit-operations'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'unit-operations' ? 'text-white' : 'text-emerald-600'}`} />
                <span>عملیات واحدها</span>
              </button>
            )}

            {/* 3. امور کارکنان و کارگزینی */}
            <div className="relative" ref={hrMenuRef}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'hr' ? null : 'hr')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isHrActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>امور کارکنان</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'hr' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'hr' && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-100">
                    پرونده، تضامین و رتبه‌بندی
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavClick('personnel')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                      activeTab === 'personnel' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold">پرونده پرسنلی و بستگان</div>
                      <div className="text-[10px] text-slate-500">اطلاعات ۲۸ ستونی و مدارک هویتی</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('commitments')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                      activeTab === 'commitments' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-bold">تعهدات و تضامین</div>
                      <div className="text-[10px] text-slate-500">سفته، چک تضمین و تعهد خدمت</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('job-groups')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                      activeTab === 'job-groups' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Award className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <div className="font-bold">گروه‌های شغلی و طبقه‌بندی</div>
                      <div className="text-[10px] text-slate-500">رتبه‌بندی مشاغل و سقف کارانه</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 4. حقوق و کارانه */}
            <div className="relative" ref={compMenuRef}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'comp' ? null : 'comp')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isCompActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Wallet className="w-4 h-4 text-violet-600 shrink-0" />
                <span>حقوق و کارانه</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'comp' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'comp' && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-100">
                    حقوق، دستمزد و کارانه
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavClick('payroll')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                      activeTab === 'payroll' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Wallet className="w-4 h-4 text-violet-600 shrink-0" />
                    <div>
                      <div className="font-bold">حقوق و دستمزد (۲۲۶ ستون)</div>
                      <div className="text-[10px] text-slate-500">آنالیز مقایسه‌ای ماه قبل و جدید</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('karaneh')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                      activeTab === 'karaneh' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">کارانه و بهره‌وری</div>
                      <div className="text-[10px] text-slate-500">محاسبه و مقایسه کارانه پرسنل</div>
                    </div>
                  </button>

                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        downloadPayrollTemplate();
                        setOpenDropdown(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span className="font-semibold">دانلود نمونه اکسل حقوق</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        downloadKaranehTemplate();
                        setOpenDropdown(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span className="font-semibold">دانلود نمونه اکسل کارانه</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. مدیریت و پشتیبان‌گیری */}
            {(canViewUsers || canViewBackup) && (
              <div className="relative" ref={adminMenuRef}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'admin' ? null : 'admin')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isAdminActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>مدیریت و بک‌آپ</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'admin' ? 'rotate-180' : ''}`} />
                </button>

                {openDropdown === 'admin' && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-100">
                      امنیت، کاربران و پشتیبان‌گیری
                    </div>

                    {canViewUsers && (
                      <button
                        type="button"
                        onClick={() => handleNavClick('users')}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                          activeTab === 'users' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div>
                          <div className="font-bold">کاربران و سطح دسترسی</div>
                          <div className="text-[10px] text-slate-500">تعریف کاربر، رمز و مجوز ماژول‌ها</div>
                        </div>
                      </button>
                    )}

                    {canViewBackup && (
                      <button
                        type="button"
                        onClick={() => handleNavClick('database')}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-right transition-colors cursor-pointer ${
                          activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <HardDrive className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <div className="font-bold">پشتیبان‌گیری، ایمیل و گیت‌هاب</div>
                          <div className="text-[10px] text-slate-500">ارسال خودکار ایمیل، رمزنگاری و JSON</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

          </nav>

          {/* Zone 3: User Profile, Quick DB (Desktop) & Prominent Logout Button */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {canViewBackup && (
              <button
                type="button"
                onClick={onOpenDatabaseModal}
                title="پشتیبان‌گیری، ایمیل خودکار و دیتابیس"
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                <span>پشتیبان‌گیری</span>
              </button>
            )}

            {currentUser && (
              <div className="flex items-center gap-2">
                <div className="text-right hidden md:block">
                  <div className="text-xs font-bold text-slate-800 truncate max-w-[130px]">
                    {currentUser.fullName}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                    {isAdmin ? 'مدیر ارشد سامانه' : (currentUser.role || 'کاربر سامانه')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  title="خروج از حساب کاربری"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[38px] text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-600 hover:text-white border border-rose-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>خروج</span>
                </button>
              </div>
            )}

            {/* Mobile Drawer Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="منوی سامانه"
              className="lg:hidden p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>

        {/* Mobile / Tablet Responsive Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-200 space-y-3 max-h-[calc(100dvh-4rem)] overflow-y-auto pb-5">
            {currentUser && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{currentUser.fullName}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {isAdmin ? 'مدیر ارشد سامانه' : (currentUser.role || 'کاربر سامانه')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-rose-600 text-white rounded-lg shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج از اکانت</span>
                </button>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-[11px] font-bold text-slate-400 px-3">داشبوردها و گزارش‌های کلان</div>
              <button
                type="button"
                onClick={() => handleNavClick('dashboard')}
                className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer ${
                  activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>داشبورد کلان</span>
              </button>

              {canViewSmartDashboard && (
                <button
                  type="button"
                  onClick={() => handleNavClick('smart-dashboard')}
                  className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer ${
                    activeTab === 'smart-dashboard' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  <span>گزارش‌گیری هوشمند پرسنل</span>
                </button>
              )}

              {canViewCeoDashboard && (
                <button
                  type="button"
                  onClick={() => handleNavClick('ceo-dashboard')}
                  className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer ${
                    activeTab === 'ceo-dashboard' ? 'bg-slate-900 text-amber-300' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Pickaxe className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>داشبورد راهبردی مدیر عامل</span>
                </button>
              )}

              {canViewUnitOperations && (
                <button
                  type="button"
                  onClick={() => handleNavClick('unit-operations')}
                  className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer ${
                    activeTab === 'unit-operations' ? 'bg-emerald-600 text-white' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>عملیات واحدها، دیسپچینگ و تعمیرگاه</span>
                </button>
              )}
            </div>

            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-400 px-3">امور کارکنان و کارگزینی</div>
              <button
                type="button"
                onClick={() => handleNavClick('personnel')}
                className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                  activeTab === 'personnel' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>پرونده پرسنلی و بستگان</span>
              </button>
              <button
                type="button"
                onClick={() => handleNavClick('commitments')}
                className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                  activeTab === 'commitments' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>تعهدات و تضامین پرسنلی</span>
              </button>
              <button
                type="button"
                onClick={() => handleNavClick('job-groups')}
                className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                  activeTab === 'job-groups' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Award className="w-4 h-4 text-purple-600 shrink-0" />
                <span>گروه‌های شغلی و طبقه‌بندی</span>
              </button>
            </div>

            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-400 px-3">حقوق، کارانه و فایل نمونه اکسل</div>
              <button
                type="button"
                onClick={() => handleNavClick('payroll')}
                className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                  activeTab === 'payroll' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Wallet className="w-4 h-4 text-violet-600 shrink-0" />
                <span>لیست و تحلیل مقایسه‌ای حقوق</span>
              </button>
              <button
                type="button"
                onClick={() => handleNavClick('karaneh')}
                className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                  activeTab === 'karaneh' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>آنالیز مقایسه‌ای و لیست کارانه</span>
              </button>
              <div className="grid grid-cols-2 gap-2 px-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    downloadPayrollTemplate();
                    setMobileMenuOpen(false);
                  }}
                  className="min-h-[40px] flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl font-bold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>نمونه اکسل حقوق</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadKaranehTemplate();
                    setMobileMenuOpen(false);
                  }}
                  className="min-h-[40px] flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl font-bold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>نمونه اکسل کارانه</span>
                </button>
              </div>
            </div>

            {(canViewUsers || canViewBackup) && (
              <div className="space-y-1 pt-2 border-t border-slate-100">
                <div className="text-[11px] font-bold text-indigo-600 px-3">مدیریت، پشتیبان‌گیری و ایمیل خودکار</div>
                {canViewUsers && (
                  <button
                    type="button"
                    onClick={() => handleNavClick('users')}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                      activeTab === 'users' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>مدیریت کاربران و دسترسی‌ها</span>
                  </button>
                )}
                {canViewBackup && (
                  <button
                    type="button"
                    onClick={() => handleNavClick('database')}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl cursor-pointer ${
                      activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <HardDrive className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>پشتیبان‌گیری، ایمیل روزانه و گیت‌هاب</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </header>
  );
};
