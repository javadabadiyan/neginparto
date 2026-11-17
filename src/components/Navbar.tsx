import React, { useState, useEffect } from 'react';
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
  const canViewPersonnel = isAdmin || Boolean(perms.personnel?.view);
  const canViewCommitments = isAdmin || Boolean(perms.commitments?.view);
  const canViewJobGroups = isAdmin || Boolean(perms.jobGroups?.view);
  const canViewPayroll = isAdmin || Boolean(perms.payroll?.view);
  const canViewKaraneh = isAdmin || Boolean(perms.karaneh?.view);
  const canViewUsers = isAdmin || Boolean(perms.users?.view);
  const canViewBackup = isAdmin || Boolean(perms.system?.backupDatabase) || Boolean(perms.system?.restoreDatabase);

  const [menuOpen, setMenuOpen] = useState(false);

  // Close drawer on Escape key and lock background scroll when open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    setMenuOpen(false);
  };

  const navItemClass = (isActive: boolean, accent = 'indigo') => {
    if (isActive) {
      if (accent === 'ceo') return 'bg-slate-900 text-amber-300 font-bold shadow-xs';
      if (accent === 'emerald') return 'bg-emerald-600 text-white font-bold shadow-xs';
      if (accent === 'sky') return 'bg-sky-600 text-white font-bold shadow-xs';
      return 'bg-indigo-600 text-white font-bold shadow-xs';
    }
    return 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium';
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">

            {/* Right Zone (RTL Start): Hamburger Button + Brand */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="باز کردن منوی سامانه"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-2 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                {menuOpen ? <X className="w-4 h-4 shrink-0" /> : <Menu className="w-4 h-4 shrink-0" />}
                <span className="hidden xs:inline sm:inline">منو</span>
              </button>

              <button
                type="button"
                onClick={() => handleNavClick('dashboard')}
                className="flex items-center gap-2 min-w-0 cursor-pointer text-right"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs shrink-0">
                  ن‌پ
                </div>
                <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate max-w-[140px] sm:max-w-none whitespace-nowrap">
                  شرکت نگین پرتو نصر
                </span>
              </button>
            </div>

            {/* Left Zone (RTL End): Active User + Quick DB + Clear Logout Button */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {canViewBackup && (
                <button
                  type="button"
                  onClick={onOpenDatabaseModal}
                  title="پشتیبان‌گیری، ایمیل روزانه و دیتابیس"
                  className="hidden md:flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <HardDrive className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>پشتیبان‌گیری</span>
                </button>
              )}

              {currentUser && (
                <div className="flex items-center gap-2.5">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-slate-800 truncate max-w-[160px]">
                      {currentUser.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                      {isAdmin ? 'مدیر ارشد سامانه' : (currentUser.role || 'کاربر سامانه')}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onLogout}
                    title="خروج از حساب کاربری"
                    className="flex items-center gap-1.5 px-3 py-2 min-h-[42px] text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">خروج</span>
                    <span className="hidden sm:inline">خروج از اکانت</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Slide-Over Hamburger Navigation Drawer (All Devices: Mobile, Tablet & Desktop) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex no-print" role="dialog" aria-modal="true" aria-label="منوی ناوبری سامانه">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuOpen(false)}
          />

          {/* Drawer Panel (Anchored on Right for RTL) */}
          <aside className="relative w-[86vw] max-w-xs sm:max-w-sm bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col z-10 mr-0 ml-auto">

            {/* Drawer Header */}
            <div className="p-4 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                  ن‌پ
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">سامانه جامع نگین پرتو نصر</div>
                  {currentUser && (
                    <div className="text-[11px] text-indigo-200 truncate mt-0.5">
                      {currentUser.fullName}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="بستن منو"
                className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Links */}
            <nav className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-5">

              {/* Section 1: Dashboards */}
              <div className="space-y-1.5">
                <div className="px-2 text-[11px] font-bold text-slate-400">داشبوردها و گزارش‌های مدیریتی</div>

                <button
                  type="button"
                  onClick={() => handleNavClick('dashboard')}
                  className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'dashboard')}`}
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>داشبورد کلان</span>
                </button>

                {canViewSmartDashboard && (
                  <button
                    type="button"
                    onClick={() => handleNavClick('smart-dashboard')}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'smart-dashboard', 'sky')}`}
                  >
                    <BarChart3 className="w-4 h-4 shrink-0" />
                    <span>گزارش‌گیری هوشمند پرسنل</span>
                  </button>
                )}

                {canViewCeoDashboard && (
                  <button
                    type="button"
                    onClick={() => handleNavClick('ceo-dashboard')}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'ceo-dashboard', 'ceo')}`}
                  >
                    <Pickaxe className={`w-4 h-4 shrink-0 ${activeTab === 'ceo-dashboard' ? 'text-amber-300' : 'text-amber-600'}`} />
                    <span>داشبورد راهبردی مدیر عامل</span>
                  </button>
                )}

                {canViewUnitOperations && (
                  <button
                    type="button"
                    onClick={() => handleNavClick('unit-operations')}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'unit-operations', 'emerald')}`}
                  >
                    <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'unit-operations' ? 'text-white' : 'text-emerald-600'}`} />
                    <span>عملیات واحدها، دیسپچینگ و تعمیرگاه</span>
                  </button>
                )}
              </div>

              {/* Section 2: HR & Personnel */}
              {(canViewPersonnel || canViewCommitments || canViewJobGroups) && (
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <div className="px-2 text-[11px] font-bold text-slate-400">امور کارکنان و کارگزینی</div>

                  {canViewPersonnel && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('personnel')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'personnel')}`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span>پرونده پرسنلی، بستگان و مدارک</span>
                    </button>
                  )}

                  {canViewCommitments && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('commitments')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'commitments')}`}
                    >
                      <FileCheck className="w-4 h-4 shrink-0" />
                      <span>تعهدات و تضامین پرسنلی</span>
                    </button>
                  )}

                  {canViewJobGroups && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('job-groups')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'job-groups')}`}
                    >
                      <Award className="w-4 h-4 shrink-0" />
                      <span>گروه‌های شغلی و طبقه‌بندی مشاغل</span>
                    </button>
                  )}
                </div>
              )}

              {/* Section 3: Payroll & Karaneh */}
              {(canViewPayroll || canViewKaraneh) && (
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <div className="px-2 text-[11px] font-bold text-slate-400">حقوق، دستمزد و کارانه</div>

                  {canViewPayroll && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('payroll')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'payroll')}`}
                    >
                      <Wallet className="w-4 h-4 shrink-0" />
                      <span>حقوق و دستمزد (۲۲۶ ستونی)</span>
                    </button>
                  )}

                  {canViewKaraneh && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('karaneh')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'karaneh')}`}
                    >
                      <TrendingUp className="w-4 h-4 shrink-0" />
                      <span>آنالیز مقایسه‌ای و لیست کارانه</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {canViewPayroll && (
                      <button
                        type="button"
                        onClick={() => {
                          downloadPayrollTemplate();
                          setMenuOpen(false);
                        }}
                        className="min-h-[40px] flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl font-bold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>نمونه اکسل حقوق</span>
                      </button>
                    )}
                    {canViewKaraneh && (
                      <button
                        type="button"
                        onClick={() => {
                          downloadKaranehTemplate();
                          setMenuOpen(false);
                        }}
                        className="min-h-[40px] flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl font-bold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>نمونه اکسل کارانه</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Section 4: System Management & Backups */}
              {(canViewUsers || canViewBackup) && (
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <div className="px-2 text-[11px] font-bold text-indigo-600">مدیریت سیستم، امنیت و پشتیبان‌گیری</div>

                  {canViewUsers && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('users')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'users')}`}
                    >
                      <Shield className="w-4 h-4 shrink-0" />
                      <span>مدیریت کاربران و سطح دسترسی</span>
                    </button>
                  )}

                  {canViewBackup && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('database')}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl transition-colors cursor-pointer ${navItemClass(activeTab === 'database')}`}
                    >
                      <HardDrive className="w-4 h-4 shrink-0" />
                      <span>پشتیبان‌گیری، ایمیل روزانه و گیت‌هاب</span>
                    </button>
                  )}
                </div>
              )}

            </nav>

            {/* Drawer Footer: Always Accessible Account Logout */}
            <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>خروج از حساب کاربری</span>
              </button>
            </div>

          </aside>
        </div>
      )}
    </>
  );
};
