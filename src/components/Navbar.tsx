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
  FileSpreadsheet,
  Download,
  BookOpen,
  Menu,
  X,
  Lock,
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

  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardMenuRef = useRef<HTMLDivElement>(null);
  const hrMenuRef = useRef<HTMLDivElement>(null);
  const karanehMenuRef = useRef<HTMLDivElement>(null);
  const payrollMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dashboardMenuRef.current && !dashboardMenuRef.current.contains(event.target as Node) &&
        hrMenuRef.current && !hrMenuRef.current.contains(event.target as Node) &&
        karanehMenuRef.current && !karanehMenuRef.current.contains(event.target as Node) &&
        payrollMenuRef.current && !payrollMenuRef.current.contains(event.target as Node) &&
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
  const isKaranehActive = activeTab === 'karaneh';
  const isPayrollActive = activeTab === 'payroll';
  const isAdminActive = ['users', 'database'].includes(activeTab);

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Zone 1: Brand title & logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              کار
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 tracking-tight block">
                سامانه جامع راهبردی شرکت نگین پرتو نصر
              </span>
              <span className="text-[11px] text-slate-500 block">
                کارگزینی، حقوق، عملیات معدنی و تحلیل مدیرعامل
              </span>
            </div>
          </div>

          {/* Zone 2: Categorized Menus (منوهای دسته‌بندی‌شده) */}
          <nav className="hidden lg:flex items-center gap-1.5">
            
            {/* 1. منوی داشبوردها و گزارش‌گیری */}
            <div className="relative" ref={dashboardMenuRef}>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'dashboard' ? null : 'dashboard')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isDashboardActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                <span>داشبورد و گزارش‌ها</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'dashboard' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'dashboard' && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    نمای تحلیلی و مدیریتی
                  </div>

                  <button
                    onClick={() => handleNavClick('dashboard')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                      activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                    <div>
                      <div className="font-bold">داشبورد کلان</div>
                      <div className="text-[10px] text-slate-500">نمای کلی آمار و دسترسی سریع</div>
                    </div>
                  </button>

                  {canViewSmartDashboard && (
                    <button
                      onClick={() => handleNavClick('smart-dashboard')}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                        activeTab === 'smart-dashboard' ? 'bg-sky-50 text-sky-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 text-sky-600" />
                      <div>
                        <div className="font-bold">گزارش‌گیری هوشمند پرسنل</div>
                        <div className="text-[10px] text-slate-500">نمودارهای میله‌ای و دایره‌ای گروه و تعهدات</div>
                      </div>
                    </button>
                  )}

                  {canViewCeoDashboard && (
                    <button
                      onClick={() => handleNavClick('ceo-dashboard')}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors border-t border-slate-100 ${
                        activeTab === 'ceo-dashboard' ? 'bg-slate-900 text-amber-300 font-bold' : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Pickaxe className={`w-4 h-4 ${activeTab === 'ceo-dashboard' ? 'text-amber-300' : 'text-amber-600'}`} />
                      <div>
                        <div className="font-bold">داشبورد مدیر عامل شرکت نگین پرتو نصر</div>
                        <div className={`text-[10px] ${activeTab === 'ceo-dashboard' ? 'text-slate-300' : 'text-slate-500'}`}>
                          حجم عملیات، تعمیرگاه ماشین‌آلات، واحدها و خروجی رسمی
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {canViewUnitOperations && (
              <button
                onClick={() => handleNavClick('unit-operations')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'unit-operations'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className={`w-4 h-4 ${activeTab === 'unit-operations' ? 'text-white' : 'text-emerald-600'}`} />
                <span>عملیات واحدها و دیسپچینگ</span>
              </button>
            )}

            {/* 2. منوی دسته‌بندی: امور کارکنان و کارگزینی */}
            <div className="relative" ref={hrMenuRef}>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'hr' ? null : 'hr')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isHrActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600" />
                <span>امور کارکنان و کارگزینی</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'hr' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'hr' && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    بخش‌های کارگزینی
                  </div>
                  
                  <button
                    onClick={() => handleNavClick('personnel')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                      activeTab === 'personnel' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-4 h-4 text-indigo-600" />
                    <div>
                      <div className="font-bold">پرونده پرسنلی</div>
                      <div className="text-[10px] text-slate-500">اطلاعات احکام و مشخصات فردی</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavClick('commitments')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                      activeTab === 'commitments' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileCheck className="w-4 h-4 text-amber-600" />
                    <div>
                      <div className="font-bold">تعهدات و تضامین پرسنلی</div>
                      <div className="text-[10px] text-slate-500">سفته، چک تضمین و تعهد خدمت</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavClick('job-groups')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                      activeTab === 'job-groups' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Award className="w-4 h-4 text-purple-600" />
                    <div>
                      <div className="font-bold">گروه‌های شغلی و رتبه‌بندی</div>
                      <div className="text-[10px] text-slate-500">تعیین پایه‌ها و سقف کارانه</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 3. منوی دسته‌بندی: سیستم کارانه و آنالیز */}
            <div className="relative" ref={karanehMenuRef}>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'karaneh' ? null : 'karaneh')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isKaranehActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>سیستم کارانه و آنالیز</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'karaneh' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'karaneh' && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    امکانات کارانه پرسنل
                  </div>

                  <button
                    onClick={() => handleNavClick('karaneh')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                      activeTab === 'karaneh' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-bold">آنالیز مقایسه‌ای و لیست کارانه</div>
                      <div className="text-[10px] text-slate-500">مقایسه تغییرات ماه قبل و ماه جدید</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      downloadKaranehTemplate();
                      setOpenDropdown(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors border-t border-slate-100"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-bold text-emerald-700">دانلود نمونه اکسل کارانه</div>
                      <div className="text-[10px] text-slate-500">فایل استاندارد جهت ورود اطلاعات</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 3.5 منوی دسته‌بندی: حقوق و دستمزد */}
            <div className="relative" ref={payrollMenuRef}>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'payroll' ? null : 'payroll')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isPayrollActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Wallet className="w-4 h-4 text-violet-600" />
                <span>حقوق و دستمزد</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'payroll' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'payroll' && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    سامانه جامع حقوق پرسنل
                  </div>

                  <button
                    onClick={() => handleNavClick('payroll')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                      activeTab === 'payroll' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Wallet className="w-4 h-4 text-violet-600" />
                    <div>
                      <div className="font-bold">لیست و مقایسه ماهانه حقوق</div>
                      <div className="text-[10px] text-slate-500">آپلود اکسل ۲۲۶ ستونی و آنالیز ماه قبل و جدید</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      downloadPayrollTemplate();
                      setOpenDropdown(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right text-slate-700 hover:bg-violet-50 hover:text-violet-800 transition-colors border-t border-slate-100"
                  >
                    <Download className="w-4 h-4 text-violet-600" />
                    <div>
                      <div className="font-bold text-violet-700">دانلود نمونه اکسل حقوق (۲۲۶ ستون)</div>
                      <div className="text-[10px] text-slate-500">تمپلیت کامل با وام‌ها و عوامل حکمی</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 4. منوی دسته‌بندی ویژه مدیر ارشد (تنها برای ادمین نمایش داده می‌شود) */}
            {isAdmin && (
              <div className="relative" ref={adminMenuRef}>
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'admin' ? null : 'admin')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    isAdminActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>مدیریت و پشتیبان‌گیری</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-bold">ادمین</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'admin' ? 'rotate-180' : ''}`} />
                </button>

                {openDropdown === 'admin' && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      دسترسی‌های اختصاصی مدیر ارشد
                    </div>

                    <button
                      onClick={() => handleNavClick('users')}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                        activeTab === 'users' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Shield className="w-4 h-4 text-indigo-600" />
                      <div>
                        <div className="font-bold">مدیریت کاربران و دسترسی‌ها</div>
                        <div className="text-[10px] text-slate-500">تعریف کاربری، رمز عبور و مجوزها</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleNavClick('database')}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right transition-colors ${
                        activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <HardDrive className="w-4 h-4 text-emerald-600" />
                      <div>
                        <div className="font-bold">پشتیبان‌گیری، بازیابی و پایگاه داده</div>
                        <div className="text-[10px] text-slate-500">دانلود نسخه کامل و بازیابی JSON</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleNavClick('database')}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-right text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                    >
                      <BookOpen className="w-4 h-4 text-blue-600" />
                      <div>
                        <div className="font-bold">راهنمای اتصال آنلاین سیستم</div>
                        <div className="text-[10px] text-slate-500">آموزش دسترسی سایر همکاران با اینترنت</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

          </nav>

          {/* Zone 3: User Info & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Quick backup button - ONLY for admin */}
            {isAdmin && (
              <button
                onClick={onOpenDatabaseModal}
                title="مشاهده وضعیت پشتیبان‌گیری و دیتابیس (ویژه مدیر ارشد)"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                <span>دیتابیس سیستم</span>
              </button>
            )}

            {currentUser && (
              <div className="flex items-center gap-2 pl-2 border-r border-slate-200">
                <div className="text-left rtl:text-right hidden sm:block">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <span>{currentUser.fullName}</span>
                    {isAdmin && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-bold">
                        ارشد
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAdmin ? 'مدیر ارشد سامانه' : (currentUser.role || 'کارشناس اداری')}
                  </div>
                </div>

                <button
                  onClick={onLogout}
                  title="خروج از حساب کاربری"
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>

        {/* Mobile Categorized Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-200 space-y-3">
            <button
              onClick={() => handleNavClick('dashboard')}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg ${
                activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>داشبورد کلان</span>
            </button>

            {canViewSmartDashboard && (
              <button
                onClick={() => handleNavClick('smart-dashboard')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg ${
                  activeTab === 'smart-dashboard' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>گزارش‌گیری هوشمند پرسنل (نموداری)</span>
              </button>
            )}

            {canViewCeoDashboard && (
              <button
                onClick={() => handleNavClick('ceo-dashboard')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg ${
                  activeTab === 'ceo-dashboard' ? 'bg-slate-900 text-amber-300' : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Pickaxe className="w-4 h-4 text-amber-600" />
                <span>داشبورد مدیر عامل نگین پرتو نصر</span>
              </button>
            )}

            {canViewUnitOperations && (
              <button
                onClick={() => handleNavClick('unit-operations')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg ${
                  activeTab === 'unit-operations' ? 'bg-emerald-600 text-white' : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>عملیات واحدها، دیسپچینگ و تعمیرگاه</span>
              </button>
            )}

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 px-3 uppercase">امور پرسنلی و کارگزینی</span>
              <button
                onClick={() => handleNavClick('personnel')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                  activeTab === 'personnel' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600" />
                <span>پرونده پرسنلی</span>
              </button>
              <button
                onClick={() => handleNavClick('commitments')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                  activeTab === 'commitments' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileCheck className="w-4 h-4 text-amber-600" />
                <span>تعهدات و تضامین پرسنلی</span>
              </button>
              <button
                onClick={() => handleNavClick('job-groups')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                  activeTab === 'job-groups' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Award className="w-4 h-4 text-purple-600" />
                <span>گروه‌های شغلی و رتبه‌بندی</span>
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 px-3 uppercase">سیستم کارانه و پاداش</span>
              <button
                onClick={() => handleNavClick('karaneh')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                  activeTab === 'karaneh' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>آنالیز مقایسه‌ای و لیست کارانه</span>
              </button>
              <button
                onClick={() => {
                  downloadKaranehTemplate();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50 rounded-lg font-bold"
              >
                <Download className="w-4 h-4" />
                <span>دانلود فایل نمونه اکسل کارانه</span>
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 px-3 uppercase">حقوق و دستمزد</span>
              <button
                onClick={() => handleNavClick('payroll')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                  activeTab === 'payroll' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Wallet className="w-4 h-4 text-violet-600" />
                <span>لیست و تحلیل مقایسه‌ای حقوق</span>
              </button>
              <button
                onClick={() => {
                  downloadPayrollTemplate();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-700 hover:bg-violet-50 rounded-lg font-bold"
              >
                <Download className="w-4 h-4" />
                <span>دانلود فایل نمونه اکسل حقوق (۲۲۶ ستون)</span>
              </button>
            </div>

            {/* Admin only sections */}
            {isAdmin && (
              <div className="space-y-1 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold text-indigo-600 px-3 uppercase">مدیریت و پشتیبان‌گیری (ویژه ادمین)</span>
                <button
                  onClick={() => handleNavClick('users')}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                    activeTab === 'users' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>مدیریت کاربران و دسترسی‌ها</span>
                </button>
                <button
                  onClick={() => handleNavClick('database')}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${
                    activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <HardDrive className="w-4 h-4 text-emerald-600" />
                  <span>پشتیبان‌گیری، بازیابی و راهنما</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </header>
  );
};
