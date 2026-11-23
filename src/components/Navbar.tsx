import React, { useState, useEffect, useRef } from 'react';
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
  Wallet,
  BarChart3,
  Pickaxe,
  Layers,
  ChevronDown,
  FileSpreadsheet,
  Send
} from 'lucide-react';
import { downloadKaranehTemplate, downloadPayrollTemplate } from '../utils/excel';
import { normalizePermissions, getFirstAccessibleTab } from '../utils/permissions';

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
  const canViewUsers = isAdmin || Boolean(perms.users?.view);
  const canViewBackup = isAdmin || Boolean(perms.system?.backupDatabase) || Boolean(perms.system?.restoreDatabase);
  const defaultTab = getFirstAccessibleTab(perms, isAdmin);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
      ? [{ id: 'users', label: 'کاربران', icon: Shield, accent: 'default' as const }]
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

  // Close Excel templates popover on outside click or Escape
  useEffect(() => {
    if (!templatesOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTemplatesOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [templatesOpen]);

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
        <div className="flex items-center justify-between h-11 sm:h-12 gap-3">
          {/* Brand Zone */}
          <button
            type="button"
            onClick={() => onSelectTab(defaultTab)}
            className="flex items-center gap-2 min-w-0 cursor-pointer text-right shrink-0"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-[11px] sm:text-xs shrink-0">
              ن‌پ
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap truncate max-w-[165px] sm:max-w-none">
              شرکت نگین پرتو نصر
            </span>
          </button>

          {/* Actions & Active User Zone */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {(canViewPayroll || canViewKaraneh) && (
              <div className="relative" ref={templatesRef}>
                <button
                  type="button"
                  onClick={() => setTemplatesOpen((v) => !v)}
                  aria-expanded={templatesOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 min-h-[34px] text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden xs:inline sm:inline">الگوهای اکسل</span>
                  <span className="xs:hidden sm:hidden">الگو</span>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
                </button>

                {templatesOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 space-y-1"
                  >
                    {canViewPayroll && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          downloadPayrollTemplate();
                          setTemplatesOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors cursor-pointer text-right"
                      >
                        <Download className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                        <span>نمونه اکسل حقوق (۲۲۶ ستونی)</span>
                      </button>
                    )}
                    {canViewKaraneh && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          downloadKaranehTemplate();
                          setTemplatesOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors cursor-pointer text-right"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>نمونه اکسل کارانه ماهانه</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentUser && (
              <>
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-600 whitespace-nowrap">
                  <span className="font-bold text-slate-800 truncate max-w-[140px]">
                    {currentUser.fullName}
                  </span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="hidden md:inline text-slate-500 truncate max-w-[120px]">
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
