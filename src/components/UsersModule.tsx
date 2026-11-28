import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  X,
  KeyRound,
  CheckCircle2,
  Sparkles,
  Users,
  TrendingUp,
  Award,
  FileCheck,
  Database,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Download,
  Upload,
  Wallet,
  CheckSquare,
  BarChart3,
  Pickaxe,
  Layers,
  Send,
  FileSpreadsheet,
  Building2,
  RefreshCw
} from 'lucide-react';
import {
  User,
  UserPermissions,
  GranularUsersPermissions
} from '../types';
import { toPersianDigits } from '../utils/persian';
import {
  getFullAdminPermissions,
  getEmptyPermissions,
  getDefaultViewerPermissions,
  getHrSpecialistPermissions,
  getKaranehSpecialistPermissions,
  getCeoPermissions,
  getUnitSupervisorPermissions,
  getDispatchingOfficerPermissions,
  getWorkshopOfficerPermissions,
  getUnitKaranehManagerPermissions,
  normalizePermissions,
  countActivePermissions
} from '../utils/permissions';
import {
  exportUsersToExcel,
  downloadUsersTemplate
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import { MINING_UNITS_CATALOG } from './CeoMiningUnitsPanel';

interface UsersModuleProps {
  users: User[];
  currentUser: User | null;
  onSaveUser: (userData: Partial<User> & { password?: string }) => Promise<boolean>;
  onDeleteUser: (id: string) => Promise<boolean>;
  onBatchDeleteUsers: (ids: string[]) => Promise<boolean>;
  onDeleteAllUsers?: () => Promise<boolean>;
  onBatchImportUsers: (items: any[]) => Promise<boolean>;
  granularPermissions?: GranularUsersPermissions;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const ROLE_SUGGESTIONS = [
  { label: 'کاربر سفارشی (شروع خالی — انتخاب دستی)', preset: 'empty' },
  { label: 'مدیر عامل شرکت نگین پرتو نصر', preset: 'ceo' },
  { label: 'مسئول دیسپچینگ و کنترل تولید', preset: 'dispatching' },
  { label: 'مسئول تعمیرگاه و ماشین‌آلات سنگین', preset: 'workshop' },
  { label: 'مدیر کارانه واحد (فقط واحد اختصاصی)', preset: 'unit_karaneh' },
  { label: 'سرپرست واحد عملیاتی معدن', preset: 'unit_supervisor' },
  { label: 'کارشناس کارگزینی و امور کارکنان', preset: 'hr' },
  { label: 'کارشناس ارزیابی عملکرد و کارانه', preset: 'karaneh' },
  { label: 'مدیر امور اداری و منابع انسانی', preset: 'admin' },
  { label: 'سرپرست کارگزینی', preset: 'hr' },
  { label: 'حسابدار حقوق و دستمزد', preset: 'karaneh' },
  { label: 'مشاهده‌گر و بازرس', preset: 'viewer' },
];

const COMPANY_KARANEH_UNITS: string[] = Array.from(
  new Set([
    'فناوری اطلاعات',
    'امور مالی و اقتصادی',
    'منابع انسانی',
    'تولید و عملیات',
    'مدیریت و پشتیبانی',
    ...MINING_UNITS_CATALOG.map((u) => u.unitName),
  ])
);

export const UsersModule: React.FC<UsersModuleProps> = ({
  users,
  currentUser,
  onSaveUser,
  onDeleteUser,
  onBatchDeleteUsers,
  onDeleteAllUsers,
  onBatchImportUsers,
  granularPermissions,
  onRefreshData,
  isRefreshing = false
}) => {
  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'javadabadiyan';
  const canCreateUser = isSuperAdmin || Boolean(granularPermissions?.create);
  const canEditUser = isSuperAdmin || Boolean(granularPermissions?.edit);
  const canDeleteUser = isSuperAdmin || Boolean(granularPermissions?.delete);
  const canDeleteAllUsers = isSuperAdmin || Boolean(granularPermissions?.deleteAll);
  const canImportUsers = isSuperAdmin || Boolean(granularPermissions?.importExcel);
  const canExportUsers = isSuperAdmin || Boolean(granularPermissions?.exportExcel);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Excel import modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [customKaranehUnitInput, setCustomKaranehUnitInput] = useState('');

  const isUserSelectable = (u: User) => u.username !== 'javadabadiyan' && u.id !== currentUser?.id;

  useEffect(() => {
    const validIds = new Set(users.filter(isUserSelectable).map(u => u.id));
    setSelectedIds(prev => prev.filter(id => validIds.has(id)));
  }, [users, currentUser?.id]);

  const fullAdminPerms = getFullAdminPermissions();
  const totalPermissionsCount = countActivePermissions(fullAdminPerms).total;

  const [formData, setFormData] = useState<{
    username: string;
    password?: string;
    email?: string;
    fullName: string;
    role: string;
    department: string;
    isActive: boolean;
    permissions: UserPermissions;
  }>({
    username: '',
    password: '',
    email: '',
    fullName: '',
    role: 'کاربر سفارشی',
    department: '',
    isActive: true,
    permissions: getEmptyPermissions()
  });

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormError('');
    setFormData({
      username: '',
      password: '',
      email: '',
      fullName: '',
      role: 'کاربر سفارشی',
      department: '',
      isActive: true,
      permissions: getEmptyPermissions()
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setActionError('');
    if (!isSuperAdmin && (user.username === 'javadabadiyan' || user.role === 'super_admin')) {
      setActionError('ویرایش اطلاعات یا مجوزهای مدیر ارشد سامانه فقط توسط مدیر ارشد مجاز است.');
      return;
    }
    setEditingUser(user);
    setFormError('');
    const normalized = normalizePermissions(user.permissions);
    setFormData({
      username: user.username,
      password: '', // blank unless changing
      email: user.email || '',
      fullName: user.fullName,
      role: user.role || 'کاربر سفارشی',
      department: user.department || '',
      isActive: user.isActive,
      permissions: normalized
    });
    setIsFormOpen(true);
  };

  // Helper to toggle specific nested permission with parent/child consistency
  const handleToggle = <M extends keyof UserPermissions>(
    module: M,
    field: keyof NonNullable<UserPermissions[M]>
  ) => {
    setFormData(prev => {
      const moduleObj = { ...((prev.permissions[module] as any) || {}) };
      const fieldKey = String(field);
      const nextValue = !Boolean(moduleObj[fieldKey]);
      moduleObj[fieldKey] = nextValue;

      if (fieldKey === 'view' && !nextValue) {
        Object.keys(moduleObj).forEach(k => {
          if (k === 'allowedUnits') {
            moduleObj[k] = [];
          } else if (typeof moduleObj[k] === 'boolean') {
            moduleObj[k] = false;
          }
        });
      } else if (fieldKey !== 'view' && nextValue && 'view' in moduleObj) {
        moduleObj.view = true;
      }

      return {
        ...prev,
        permissions: normalizePermissions({
          ...prev.permissions,
          [module]: moduleObj
        })
      };
    });
  };

  // Helper to toggle all in a module
  const handleSetModuleAll = <M extends 'personnel' | 'karaneh' | 'finalKaraneh' | 'jobGroups' | 'commitments' | 'payroll' | 'users' | 'system' | 'smartDashboard' | 'ceoDashboard' | 'unitOperations'>(
    module: M,
    value: boolean
  ) => {
    setFormData(prev => {
      const empty = getEmptyPermissions();
      const existing = (prev.permissions[module] as any) || (empty[module] as any) || {};
      const currentModule = { ...existing } as Record<string, any>;
      Object.keys(currentModule).forEach(k => {
        if (k === 'allowedUnits') {
          if (!value) currentModule[k] = [];
          return;
        }
        if (typeof currentModule[k] === 'boolean') {
          currentModule[k] = value;
        }
      });
      return {
        ...prev,
        permissions: normalizePermissions({
          ...prev.permissions,
          [module]: currentModule
        })
      };
    });
  };

  const handleToggleAllowedUnit = (unitName: string) => {
    setFormData(prev => {
      const uo = prev.permissions.unitOperations || {
        view: false,
        create: false,
        edit: false,
        delete: false,
        deleteAll: false,
        importExcel: false,
        exportExcel: false,
        allowedUnits: []
      };
      const currentUnits = Array.isArray(uo.allowedUnits) ? uo.allowedUnits : [];
      const exists = currentUnits.includes(unitName);
      const nextUnits = exists
        ? currentUnits.filter(u => u !== unitName)
        : [...currentUnits, unitName];
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          unitOperations: {
            ...uo,
            allowedUnits: nextUnits
          }
        }
      };
    });
  };

  const handleClearAllowedUnits = () => {
    setFormData(prev => {
      const uo = prev.permissions.unitOperations || {
        view: false,
        create: false,
        edit: false,
        delete: false,
        deleteAll: false,
        importExcel: false,
        exportExcel: false,
        allowedUnits: []
      };
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          unitOperations: {
            ...uo,
            allowedUnits: []
          }
        }
      };
    });
  };

  const handleToggleKaranehAllowedUnit = (unitName: string) => {
    const clean = unitName.trim();
    if (!clean) return;
    setFormData(prev => {
      const k = prev.permissions.karaneh || {
        view: false,
        create: false,
        edit: false,
        delete: false,
        deleteAll: false,
        importExcel: false,
        exportExcel: false,
        submit: false,
        allowedUnits: []
      };
      const currentUnits = Array.isArray(k.allowedUnits) ? k.allowedUnits : [];
      const exists = currentUnits.includes(clean);
      const nextUnits = exists
        ? currentUnits.filter(u => u !== clean)
        : [...currentUnits, clean];
      return {
        ...prev,
        permissions: normalizePermissions({
          ...prev.permissions,
          karaneh: {
            ...k,
            view: nextUnits.length > 0 ? true : k.view,
            allowedUnits: nextUnits
          }
        })
      };
    });
  };

  const handleClearKaranehAllowedUnits = () => {
    setFormData(prev => {
      const k = prev.permissions.karaneh || getEmptyPermissions().karaneh;
      return {
        ...prev,
        permissions: normalizePermissions({
          ...prev.permissions,
          karaneh: {
            ...k,
            allowedUnits: []
          }
        })
      };
    });
  };

  const handleAddCustomKaranehUnit = () => {
    const clean = customKaranehUnitInput.trim();
    if (!clean) return;
    setFormData(prev => {
      const k = prev.permissions.karaneh || getEmptyPermissions().karaneh;
      const currentUnits = Array.isArray(k.allowedUnits) ? k.allowedUnits : [];
      const nextUnits = currentUnits.includes(clean) ? currentUnits : [...currentUnits, clean];
      return {
        ...prev,
        permissions: normalizePermissions({
          ...prev.permissions,
          karaneh: {
            ...k,
            view: true,
            allowedUnits: nextUnits
          }
        })
      };
    });
    setCustomKaranehUnitInput('');
  };

  // Preset handlers
  const applyPreset = (
    presetType: 'empty' | 'admin' | 'ceo' | 'hr' | 'karaneh' | 'dispatching' | 'workshop' | 'unit_supervisor' | 'unit_karaneh' | 'viewer'
  ) => {
    let perms: UserPermissions;
    if (presetType === 'empty') perms = getEmptyPermissions();
    else if (presetType === 'admin') perms = getFullAdminPermissions();
    else if (presetType === 'ceo') perms = getCeoPermissions();
    else if (presetType === 'hr') perms = getHrSpecialistPermissions();
    else if (presetType === 'karaneh') perms = getKaranehSpecialistPermissions();
    else if (presetType === 'dispatching') perms = getDispatchingOfficerPermissions();
    else if (presetType === 'workshop') perms = getWorkshopOfficerPermissions();
    else if (presetType === 'unit_supervisor') perms = getUnitSupervisorPermissions([]);
    else if (presetType === 'unit_karaneh') perms = getUnitKaranehManagerPermissions([]);
    else perms = getDefaultViewerPermissions();

    setFormData(prev => ({
      ...prev,
      permissions: normalizePermissions(perms)
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.username.trim() || !formData.fullName.trim() || !formData.role.trim()) {
      setFormError('لطفاً نام کاربری، نام و نام خانوادگی و نقش سازمانی کاربر را وارد فرمایید.');
      return;
    }

    if (!isSuperAdmin && formData.role.trim() === 'super_admin') {
      setFormError('تخصیص نقش مدیر ارشد سامانه (super_admin) فقط توسط مدیر ارشد مجاز است.');
      return;
    }

    if (!isSuperAdmin && editingUser && (editingUser.username === 'javadabadiyan' || editingUser.role === 'super_admin')) {
      setFormError('شما مجوز ویرایش حساب مدیر ارشد را ندارید.');
      return;
    }

    if (!editingUser && !formData.password) {
      setFormError('وارد کردن رمز عبور برای ایجاد کاربر جدید الزامی است.');
      return;
    }

    const normalizedPermissions = normalizePermissions(formData.permissions);

    const payload = {
      ...formData,
      id: editingUser ? editingUser.id : undefined,
      permissions: normalizedPermissions,
    };

    const success = await onSaveUser(payload);
    if (success) {
      setIsFormOpen(false);
    }
  };

  const handleDelete = (user: User) => {
    setActionError('');
    if (user.username === 'javadabadiyan') {
      setActionError('امکان حذف کاربر ارشد و برنامه‌نویس سامانه (javadabadiyan) وجود ندارد.');
      return;
    }

    if (!canDeleteUser) {
      setActionError('شما مجوز حذف کاربران سامانه را ندارید.');
      return;
    }

    setDeleteTarget(user);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await onDeleteUser(deleteTarget.id);
    setDeleteTarget(null);
  };

  const selectableUserIds = users.filter(isUserSelectable).map(u => u.id);
  const allSelectableSelected = selectableUserIds.length > 0 && selectableUserIds.every(id => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableUserIds);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    const ok = await onBatchDeleteUsers(selectedIds);
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmBatchDeleteOpen(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllUsers) return;
    setBatchDeleting(true);
    const ok = await onDeleteAllUsers();
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmDeleteAllOpen(false);
    }
  };

  const handleSmartUsersImport = async (mappedRows: Record<string, any>[]) => {
    if (mappedRows.length === 0) return;
    const ok = await onBatchImportUsers(mappedRows);
    if (ok) {
      setIsImportOpen(false);
    }
  };

  // Count active permissions for summary
  const countModuleActive = (moduleObj?: Record<string, any>): { active: number; total: number } => {
    if (!moduleObj) return { active: 0, total: 0 };
    const keys = Object.keys(moduleObj).filter(k => k !== 'allowedUnits' && typeof moduleObj[k] === 'boolean');
    const active = keys.filter(k => Boolean(moduleObj[k])).length;
    return { active, total: keys.length };
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              مدیریت پیشرفته کاربران، نقش‌های سازمانی و سطوح دسترسی
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            تعریف و ویرایش نقش‌های سفارشی سازمانی، آپلود و خروجی اکسل کاربران و کنترل تفکیکی مجوزها
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefreshData && (
            <button
              type="button"
              onClick={() => onRefreshData()}
              disabled={Boolean(isRefreshing)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-bold transition-colors border border-indigo-200 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>بروزرسانی اطلاعات</span>
            </button>
          )}
          {canExportUsers && (
            <button
              onClick={() => exportUsersToExcel(users)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors border border-emerald-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل کاربران ({toPersianDigits(users.length)})</span>
            </button>
          )}

          {canImportUsers && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors border border-slate-200"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>آپلود هوشمند اکسل کاربران</span>
            </button>
          )}

          {(canImportUsers || canExportUsers) && (
            <button
              onClick={downloadUsersTemplate}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>نمونه اکسل کاربران</span>
            </button>
          )}

          {canDeleteAllUsers && onDeleteAllUsers && selectableUserIds.length > 0 && (
            <button
              onClick={() => setConfirmDeleteAllOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف کامل کاربران</span>
            </button>
          )}

          {canCreateUser && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>تعریف کاربر جدید با دسترسی دلخواه</span>
            </button>
          )}
        </div>
      </div>

      {/* Super Admin Notice Card */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white p-4.5 rounded-2xl border border-indigo-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold shrink-0 border border-amber-400/30">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <div className="font-bold text-white text-sm flex items-center gap-2">
              <span>حساب مدیر ارشد سامانه (Super Administrator)</span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30">
                مالک و طراح سیستم
              </span>
            </div>
            <div className="text-slate-300 text-[11px] mt-0.5">
              نام کاربری: <b className="text-white" dir="ltr">javadabadiyan</b> · وضعیت امنیتی: <span className="text-emerald-400">محافظت‌شده با رمزنگاری Scrypt و توکن HMAC</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-xl border border-emerald-500/30 font-bold flex items-center gap-1.5 persian-num">
            <ShieldCheck className="w-4 h-4" />
            <span>دسترسی کامل به تمامی {toPersianDigits(totalPermissionsCount)} مجوز</span>
          </span>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between gap-2 font-bold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-rose-500 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      {canDeleteUser && selectedIds.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <span>{toPersianDigits(selectedIds.length)} حساب کاربری انتخاب شده است</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold"
            >
              لغو انتخاب
            </button>
            <button
              onClick={() => setConfirmBatchDeleteOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs persian-num"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف انتخاب‌شده‌ها ({toPersianDigits(selectedIds.length)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Users List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-xs text-slate-800">
              فهرست پرسنل و کاربران دارای حساب دسترسی به سامانه ({toPersianDigits(users.length)} کاربر)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            امکان تخصیص نقش سازمانی اختصاصی و دسترسی تفکیک‌شده به هر بخش
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold">
                {canDeleteUser && (
                  <th className="py-3 px-2.5 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableUserIds.length === 0}
                      title="انتخاب همه کاربران قابل حذف"
                      className="w-4 h-4 rounded text-indigo-600 cursor-pointer disabled:opacity-40"
                    />
                  </th>
                )}
                <th className="py-3 px-3 text-center w-12">ردیف</th>
                <th className="py-3 px-3">نام کاربری</th>
                <th className="py-3 px-4">نام و نام خانوادگی</th>
                <th className="py-3 px-4">نقش و سمت سازمانی</th>
                <th className="py-3 px-3">واحد اداری</th>
                <th className="py-3 px-4">خلاصه سطوح دسترسی تفکیک‌شده</th>
                <th className="py-3 px-3 text-center">وضعیت حساب</th>
                <th className="py-3 px-3 text-center w-24">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u, idx) => {
                const norm = normalizePermissions(u.permissions);
                const pCount = countModuleActive(norm.personnel as any);
                const kCount = countModuleActive(norm.karaneh as any);
                const fkCount = countModuleActive(norm.finalKaraneh as any);
                const jCount = countModuleActive(norm.jobGroups as any);
                const cCount = countModuleActive(norm.commitments as any);
                const prCount = countModuleActive(norm.payroll as any);
                const uCount = countModuleActive(norm.users as any);
                const sCount = countModuleActive(norm.system as any);
                const sdCount = countModuleActive(norm.smartDashboard as any);
                const cdCount = countModuleActive(norm.ceoDashboard as any);
                const uoCount = countModuleActive(norm.unitOperations as any);
                const totalActive = pCount.active + kCount.active + fkCount.active + jCount.active + cCount.active + prCount.active + uCount.active + sCount.active + sdCount.active + cdCount.active + uoCount.active;

                const isSuper = u.username === 'javadabadiyan' || u.role === 'super_admin';
                const selectable = isUserSelectable(u);
                const isSelected = selectable && selectedIds.includes(u.id);

                return (
                  <tr key={u.id} className={isSelected ? 'bg-indigo-50/40 transition-colors' : 'hover:bg-slate-50/70 transition-colors'}>
                    {canDeleteUser && (
                      <td className="py-3.5 px-2.5 text-center">
                        {selectable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(u.id)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400" title="حساب محافظت‌شده">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-3.5 px-3 text-center text-slate-600 persian-num">
                      {toPersianDigits(idx + 1)}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-slate-800">
                      <span dir="ltr">{u.username}</span>
                      {isSuper && (
                        <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-bold">
                          ارشد
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {u.fullName}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg text-[11px] border border-slate-200">
                        {u.role || (isSuper ? 'مدیر ارشد سامانه' : 'کارشناس اداری')}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-600">
                      {u.department || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100 persian-num">
                          {toPersianDigits(totalActive)} از {toPersianDigits(totalPermissionsCount)} مجوز
                        </span>
                        {totalActive === 0 && (
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            بدون دسترسی فعال
                          </span>
                        )}
                        {norm.system?.dashboardStats && (
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            داشبورد کلان
                          </span>
                        )}
                        {norm.personnel.view && (
                          <span className={`px-1.5 py-0.5 rounded ${norm.personnel.delete ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>
                            کارگزینی ({toPersianDigits(pCount.active)})
                          </span>
                        )}
                        {norm.karaneh.view && (
                          <span className={`px-1.5 py-0.5 rounded persian-num ${norm.karaneh.delete ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                            کارانه ({toPersianDigits(kCount.active)})
                            {norm.karaneh.allowedUnits && norm.karaneh.allowedUnits.length > 0
                              ? ` · ${toPersianDigits(norm.karaneh.allowedUnits.length)} واحد`
                              : ''}
                          </span>
                        )}
                        {norm.finalKaraneh?.view && (
                          <span className="bg-violet-50 text-violet-800 border border-violet-200 px-1.5 py-0.5 rounded font-bold persian-num">
                            کارانه نهایی ارسالی ({toPersianDigits(fkCount.active)})
                          </span>
                        )}
                        {norm.payroll?.view && (
                          <span className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">
                            حقوق ({toPersianDigits(prCount.active)})
                          </span>
                        )}
                        {norm.jobGroups.view && (
                          <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                            رتبه‌ها ({toPersianDigits(jCount.active)})
                          </span>
                        )}
                        {norm.commitments.view && (
                          <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                            تعهدات ({toPersianDigits(cCount.active)})
                          </span>
                        )}
                        {norm.smartDashboard?.view && (
                          <span className="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">
                            گزارش هوشمند ({toPersianDigits(sdCount.active)})
                          </span>
                        )}
                        {norm.ceoDashboard?.view && (
                          <span className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                            داشبورد مدیرعامل ({toPersianDigits(cdCount.active)})
                          </span>
                        )}
                        {norm.unitOperations?.view && (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold persian-num">
                            عملیات واحدها ({toPersianDigits(uoCount.active)})
                            {norm.unitOperations.allowedUnits && norm.unitOperations.allowedUnits.length > 0
                              ? ` · ${toPersianDigits(norm.unitOperations.allowedUnits.length)} واحد`
                              : ''}
                          </span>
                        )}
                        {norm.users.view && (
                          <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            کاربران ({toPersianDigits(uCount.active)})
                          </span>
                        )}
                        {(norm.system?.backupDatabase || norm.system?.restoreDatabase) && (
                          <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                            پشتیبان‌گیری
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        u.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700'
                      }`}>
                        {u.isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                        {u.isActive ? 'فعال' : 'مسدود'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canEditUser && (isSuperAdmin || (u.username !== 'javadabadiyan' && u.role !== 'super_admin')) && (
                          <button
                            onClick={() => handleOpenEdit(u)}
                            title="تنظیم دقیق نقش و مجوزها"
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {u.username !== 'javadabadiyan' && canDeleteUser && (
                          <button
                            onClick={() => handleDelete(u)}
                            title="حذف حساب کاربری"
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced User Permissions Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/20">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    {editingUser ? `تنظیم نقش و دسترسی‌های کاربر (${formData.username})` : 'تعریف کاربر جدید با دسترسی‌های تفکیکی'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    امکان نوشتن عنوان دلخواه برای نقش و تنظیم تک‌تک کلیدهای دسترسی سامانه‌ای
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Account Basic Info */}
              <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200/80 space-y-4">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  مشخصات کاربری و هویتی
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      نام کاربری (انگلیسی) *
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      disabled={editingUser?.username === 'javadabadiyan'}
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="ali_rezaee"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      رمز عبور {editingUser ? '(در صورت عدم تغییر خالی بگذارید)' : '*'}
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      required={!editingUser}
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      نام و نام خانوادگی کاربر *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="علی رضایی"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      واحد اداری / دپارتمان
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="امور اداری و کارگزینی"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      ایمیل گوگل (اختیاری - جهت ورود سریع با حساب گوگل / Firebase Auth)
                    </label>
                    <input
                      type="email"
                      dir="ltr"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="user@gmail.com"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Role field: free text + suggestion chips */}
                <div className="pt-2 border-t border-slate-200/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      عنوان و سمت سازمانی کاربر (امکان نوشتن هر نقش دلخواه):
                    </label>
                    <span className="text-[11px] text-slate-500">
                      می‌توانید عنوان نقش را آزادانه ویرایش کرده یا از الگوهای آماده زیر استفاده کنید:
                    </span>
                  </div>

                  <input
                    type="text"
                    required
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="مثلاً: سرپرست کارگزینی و محاسبات کارانه"
                    className="w-full px-3.5 py-2.5 bg-white border border-indigo-200 rounded-xl text-slate-900 font-bold text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                  />

                  {/* Suggestion tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[11px] text-slate-400 font-medium">الگوهای سریع نقش و دسترسی:</span>
                    {ROLE_SUGGESTIONS.map(item => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            role: item.label
                          }));
                          applyPreset(item.preset as any);
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                          formData.role === item.label
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Granular Permissions Section */}
              <div className="space-y-4">
                
                {/* Granular Section Header with Global Presets */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      تنظیم دقیق و تفکیکی مجوزهای کاربر (Granular Access Control)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      تیک هر دسترسی را متناسب با اختیارات کارمند فعال یا غیرفعال فرمایید:
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset('empty')}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition-colors"
                    >
                      دسترسی صفر (شروع خالی)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('admin')}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition-colors border border-indigo-200 persian-num"
                    >
                      انتخاب تمام {toPersianDigits(totalPermissionsCount)} مجوز
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('ceo')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[11px] font-bold transition-colors border border-slate-700"
                    >
                      الگوی مدیر عامل
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('unit_supervisor')}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold transition-colors border border-emerald-200"
                    >
                      الگوی سرپرست واحد
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('unit_karaneh')}
                      className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-800 rounded-lg text-[11px] font-bold transition-colors border border-violet-200"
                    >
                      الگوی مدیر کارانه واحد
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('viewer')}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition-colors border border-slate-200"
                    >
                      فقط مشاهده
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('empty')}
                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-medium transition-colors border border-red-200"
                    >
                      غیرفعال کردن همه
                    </button>
                  </div>
                </div>

                {/* Live Active Permissions & Visible Menus Preview */}
                {(() => {
                  const modalCounts = countActivePermissions(formData.permissions);
                  const visibleTabs: string[] = [];
                  if (formData.permissions.system?.dashboardStats) visibleTabs.push('داشبورد کلان');
                  if (formData.permissions.smartDashboard?.view) visibleTabs.push('گزارش هوشمند');
                  if (formData.permissions.ceoDashboard?.view) visibleTabs.push('داشبورد مدیرعامل');
                  if (formData.permissions.unitOperations?.view) visibleTabs.push('عملیات واحدها');
                  if (formData.permissions.personnel?.view) visibleTabs.push('پرونده پرسنلی');
                  if (formData.permissions.commitments?.view) visibleTabs.push('تعهدات');
                  if (formData.permissions.jobGroups?.view) visibleTabs.push('رتبه‌های شغلی');
                  if (formData.permissions.payroll?.view) visibleTabs.push('حقوق و دستمزد');
                  if (formData.permissions.karaneh?.view) visibleTabs.push('کارانه');
                  if (formData.permissions.finalKaraneh?.view) visibleTabs.push('کارانه نهایی ارسالی');
                  if (formData.permissions.users?.view) visibleTabs.push('مدیریت کاربران');
                  if (formData.permissions.system?.backupDatabase || formData.permissions.system?.restoreDatabase) visibleTabs.push('پشتیبان‌گیری');

                  return (
                    <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-indigo-900">بخش‌های قابل مشاهده برای این کاربر:</span>
                        {visibleTabs.length > 0 ? (
                          visibleTabs.map(tab => (
                            <span key={tab} className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 font-bold">
                              {tab}
                            </span>
                          ))
                        ) : (
                          <span className="text-rose-700 font-bold">
                            هیچ بخشی فعال نیست — کاربر فقط صفحه دسترسی محدود را می‌بیند
                          </span>
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold shrink-0 persian-num">
                        {toPersianDigits(modalCounts.active)} از {toPersianDigits(totalPermissionsCount)} مجوز فعال
                      </span>
                    </div>
                  );
                })()}

                {/* 10 Categorized Granular Modules */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* 1. پرونده پرسنلی */}
                  <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                          <Users className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۱. پرونده پرسنلی و کارگزینی</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('personnel', true)}
                          className="text-[10px] text-indigo-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('personnel', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده لیست، پرونده ۲۸ ستونی و بستگان پرسنل' },
                        { key: 'create', label: 'ثبت و استخدام پرسنل جدید و افزودن بستگان' },
                        { key: 'edit', label: 'ویرایش اطلاعات کارگزینی، احکام و بستگان' },
                        { key: 'delete', label: 'حذف تکی و گروهی پرونده یا بستگان پرسنل' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جدول (Clear Table)' },
                        { key: 'importExcel', label: 'بارگذاری هوشمند پرسنل و بستگان از اکسل' },
                        { key: 'exportExcel', label: 'دریافت خروجی اکسل پرسنل و بستگان' },
                        { key: 'viewSalary', label: 'مشاهده حقوق پایه (عدم پنهان‌سازی)' },
                        { key: 'documents', label: 'مشاهده و بارگذاری مدارک هویتی (کارت ملی و شناسنامه)' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-indigo-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.personnel as any)[item.key] || false}
                            onChange={() => handleToggle('personnel', item.key as any)}
                            className="rounded-sm text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 2. سیستم کارانه */}
                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۲. سیستم کارانه و تحلیل مقایسه‌ای</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('karaneh', true)}
                          className="text-[10px] text-emerald-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('karaneh', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده لیست، کارانه و تحلیل ماه قبل/جدید' },
                        { key: 'create', label: 'ثبت دستی کارانه برای پرسنل' },
                        { key: 'edit', label: 'ویرایش مبالغ کارانه پرسنل' },
                        { key: 'delete', label: 'حذف رکورد کارانه پرسنل' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جدول (Clear Table)' },
                        { key: 'importExcel', label: 'بارگذاری فایل اکسل کارانه ماهانه (با نام و نام خانوادگی مجزا)' },
                        { key: 'exportExcel', label: 'دریافت خروجی اکسل مقایسه‌ای، انتخاب هر ماه و دانلود همه ماه‌ها' },
                        { key: 'viewAnalytics', label: 'مشاهده نمودار واحدها (میانگین، بیشترین، کمترین) و آنالیز واحد و پست' },
                        { key: 'exportAnalytics', label: 'دریافت خروجی اکسل آنالیز کارانه بر اساس واحد و پست' },
                        { key: 'submit', label: 'تأیید و ارسال کارانه واحد به صفحه کارانه نهایی ارسالی' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-emerald-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.karaneh as any)[item.key] || false}
                            onChange={() => handleToggle('karaneh', item.key as any)}
                            className="rounded-sm text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>

                    {/* جداسازی کارانه بر اساس واحد سازمانی */}
                    <div className="pt-3 border-t border-emerald-100 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-800 text-[11px]">
                            واحدهای مجاز کارانه (جداسازی کارانه هر واحد):
                          </span>
                        </div>
                        {(formData.permissions.karaneh?.allowedUnits?.length || 0) > 0 && (
                          <button
                            type="button"
                            onClick={handleClearKaranehAllowedUnits}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                          >
                            دسترسی به همه واحدها
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {(formData.permissions.karaneh?.allowedUnits?.length || 0) === 0
                          ? 'در حالت انتخاب‌نشده، دسترسی کارانه محدود به واحد خاصی نیست. برای ایزوله‌سازی مدیر واحد، واحد(های) او را انتخاب یا تایپ کنید.'
                          : `${toPersianDigits(formData.permissions.karaneh?.allowedUnits?.length || 0)} واحد انتخاب شده است — این کاربر فقط کارانه همین واحدها را می‌بیند و ثبت می‌کند.`}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                        {Array.from(
                          new Set([
                            ...COMPANY_KARANEH_UNITS,
                            ...(formData.permissions.karaneh?.allowedUnits || [])
                          ])
                        ).map(unitName => {
                          const isChecked = Boolean(
                            formData.permissions.karaneh?.allowedUnits?.includes(unitName)
                          );
                          return (
                            <label
                              key={unitName}
                              className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-[10.5px] cursor-pointer select-none transition-colors ${
                                isChecked
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleKaranehAllowedUnit(unitName)}
                                className="rounded-sm text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 shrink-0"
                              />
                              <span className="truncate">{unitName}</span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          value={customKaranehUnitInput}
                          onChange={(e) => setCustomKaranehUnitInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomKaranehUnit();
                            }
                          }}
                          placeholder="افزودن نام واحد دلخواه (دقیقاً مطابق ستون واحد در اکسل)..."
                          className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomKaranehUnit}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shrink-0"
                        >
                          افزودن واحد
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3. گروه‌های شغلی و رتبه‌ها */}
                  <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                          <Award className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۳. رتبه‌ها و گروه‌های شغلی</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('jobGroups', true)}
                          className="text-[10px] text-purple-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('jobGroups', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده رتبه‌بندی‌ها و سقف کارانه' },
                        { key: 'create', label: 'تعریف رتبه و گروه شغلی جدید' },
                        { key: 'edit', label: 'ویرایش کف و سقف حقوق و کارانه رتبه و جدول طبقه‌بندی' },
                        { key: 'delete', label: 'حذف گروه یا ردیف طبقه‌بندی شغلی' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جدول (Clear Table)' },
                        { key: 'importExcel', label: 'آپلود اکسل جدول طبقه‌بندی مشاغل' },
                        { key: 'exportExcel', label: 'دریافت خروجی و نمونه اکسل طبقه‌بندی مشاغل' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-purple-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.jobGroups as any)[item.key] || false}
                            onChange={() => handleToggle('jobGroups', item.key as any)}
                            className="rounded-sm text-purple-600 focus:ring-purple-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 4. تعهدات و تضامین پرسنلی */}
                  <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                          <FileCheck className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۴. اسناد تعهدات و تضامین</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('commitments', true)}
                          className="text-[10px] text-amber-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('commitments', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده اسناد تعهدات، مانده مجاز و بایگانی' },
                        { key: 'create', label: 'ثبت سند تعهد حسابداری، سفته یا ضمانت جدید' },
                        { key: 'edit', label: 'ویرایش مبالغ، وضعیت ابطال/عودت و سوابق دریافتی' },
                        { key: 'delete', label: 'حذف سند تعهد از پرونده' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جدول (Clear Table)' },
                        { key: 'print', label: 'چاپ رسمی فرم تعهد حسابداری (A4)' },
                        { key: 'archive', label: 'بایگانی و بازیابی اسناد تعهدات' },
                        { key: 'importExcel', label: 'بارگذاری گروهی اسناد تعهدات از فایل اکسل' },
                        { key: 'exportExcel', label: 'دریافت خروجی و نمونه اکسل تعهدات' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-amber-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.commitments as any)[item.key] || false}
                            onChange={() => handleToggle('commitments', item.key as any)}
                            className="rounded-sm text-amber-600 focus:ring-amber-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 5. مدیریت کاربران */}
                  <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                          <Shield className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۵. مدیریت کاربران و حساب‌ها</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('users', true)}
                          className="text-[10px] text-rose-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('users', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده لیست کاربران و حساب‌ها' },
                        { key: 'create', label: 'ایجاد حساب کاربری جدید' },
                        { key: 'edit', label: 'ویرایش نقش، رمز عبور و مجوز کاربران' },
                        { key: 'delete', label: 'حذف حساب کاربران' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جدول (Clear Table)' },
                        { key: 'importExcel', label: 'تعریف گروهی کاربران با فایل اکسل' },
                        { key: 'exportExcel', label: 'دریافت خروجی و نمونه اکسل کاربران' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-rose-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.users as any)[item.key] || false}
                            onChange={() => handleToggle('users', item.key as any)}
                            className="rounded-sm text-rose-600 focus:ring-rose-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 6. حقوق و دستمزد (جدید) */}
                  <div className="bg-white p-4 rounded-xl border border-teal-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
                          <Wallet className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۶. حقوق و دستمزد و مقایسه ماهانه</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('payroll', true)}
                          className="text-[10px] text-teal-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('payroll', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده لیست حقوق و مقایسه ماه قبل و جدید' },
                        { key: 'create', label: 'ثبت رکورد حقوقی' },
                        { key: 'edit', label: 'ویرایش اطلاعات حقوق پرسنل' },
                        { key: 'delete', label: 'حذف رکورد یا دوره حقوق' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جدول (Clear Table)' },
                        { key: 'importExcel', label: 'آپلود فایل اکسل جامع حقوق (۲۲۶ ستون)' },
                        { key: 'exportExcel', label: 'دریافت خروجی مقایسه و اکسل کامل حقوق' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-teal-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.payroll as any)?.[item.key] || false}
                            onChange={() => handleToggle('payroll', item.key as any)}
                            className="rounded-sm text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 7. سیستم و پایگاه داده */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                          <Database className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۷. سیستم، داشبورد و دیتابیس</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('system', true)}
                          className="text-[10px] text-indigo-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('system', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { key: 'dashboardStats', label: 'مشاهده آمار و نمودارهای تحلیلی داشبورد' },
                        { key: 'backupDatabase', label: 'دانلود نسخه کامل پشتیبان دیتابیس JSON' },
                        { key: 'restoreDatabase', label: 'بازیابی پایگاه داده از فایل پشتیبان' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-indigo-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.system as any)[item.key] || false}
                            onChange={() => handleToggle('system', item.key as any)}
                            className="rounded-sm text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 8. داشبورد گزارش‌گیری هوشمند پرسنل */}
                  <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۸. داشبورد گزارش‌گیری هوشمند پرسنل</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('smartDashboard', true)}
                          className="text-[10px] text-sky-600 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('smartDashboard', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده نمودارهای میله‌ای و دایره‌ای گروه‌های شغلی و تعهدات' },
                        { key: 'exportExcel', label: 'خروجی اکسل گزارش هوشمند پرسنل' },
                        { key: 'print', label: 'چاپ رسمی گزارش هوشمند (A4)' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-sky-600">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.smartDashboard as any)?.[item.key] || false}
                            onChange={() => handleToggle('smartDashboard', item.key as any)}
                            className="rounded-sm text-sky-600 focus:ring-sky-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 9. داشبورد راهبردی مدیر عامل شرکت نگین پرتو نصر */}
                  <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-slate-900 text-amber-300">
                          <Pickaxe className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۹. داشبورد راهبردی مدیر عامل شرکت نگین پرتو نصر</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('ceoDashboard', true)}
                          className="text-[10px] text-slate-800 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('ceoDashboard', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'view', label: 'مشاهده کامل داشبورد راهبردی (واحدهای معدن، حجم عملیات، تعمیرگاه)' },
                        { key: 'create', label: 'ثبت دستی آمار حجم عملیات ماهانه و وضعیت دستگاه‌ها' },
                        { key: 'edit', label: 'ویرایش آمار حجم ماهانه و وضعیت ماشین‌آلات تعمیرگاه' },
                        { key: 'delete', label: 'حذف تکی و گروهی رکوردهای حجم عملیات و ناوگان' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل جداول آمار حجم و ماشین‌آلات' },
                        { key: 'importExcel', label: 'ورود هوشمند اکسل آمار حجم ماهانه و ماشین‌آلات تعمیرگاه' },
                        { key: 'exportExcel', label: 'دریافت خروجی اکسل جامع مدیر عامل (تمام کاربرگ‌ها)' },
                        { key: 'print', label: 'چاپ رسمی گزارش مدیریتی مدیر عامل (A4)' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-slate-900">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.ceoDashboard as any)?.[item.key] || false}
                            onChange={() => handleToggle('ceoDashboard', item.key as any)}
                            className="rounded-sm text-slate-900 focus:ring-slate-700 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 10. عملیات واحدهای معدن، دیسپچینگ، تعمیرگاه و بارگذاری اکسل واحدها */}
                  <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                          <Layers className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">۱۰. عملیات واحدهای معدن، دیسپچینگ، تعمیرگاه و بارگذاری اکسل واحدها</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('unitOperations', true)}
                          className="text-[10px] text-emerald-700 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('unitOperations', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { key: 'view', label: 'مشاهده پنل عملیات واحدها، دیسپچینگ و وضعیت تعمیرگاه' },
                        { key: 'create', label: 'ثبت گزارش جدید عملکرد واحد، آمار حجم یا دستگاه تعمیرگاه' },
                        { key: 'edit', label: 'ویرایش گزارش‌های واحدها و به‌روزرسانی وضعیت ماشین‌آلات' },
                        { key: 'delete', label: 'حذف تکی و گروهی گزارش‌های عملیاتی واحدها' },
                        { key: 'deleteAll', label: 'حذف کامل و پاکسازی کل گزارش‌های واحدها' },
                        { key: 'importExcel', label: 'آپلود هوشمند فایل اکسل اطلاعات واحدها (دیسپچینگ، تعمیرگاه و سایر واحدها)' },
                        { key: 'exportExcel', label: 'دریافت خروجی اکسل و نمونه فایل ورود اطلاعات واحدها' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-emerald-700">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.unitOperations as any)?.[item.key] || false}
                            onChange={() => handleToggle('unitOperations', item.key as any)}
                            className="rounded-sm text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800 text-[11px]">
                            محدودسازی دسترسی به واحدهای مشخص معدن (اختیاری):
                          </span>
                          <span className="text-[10px] text-slate-500 mr-2">
                            {(formData.permissions.unitOperations?.allowedUnits?.length || 0) === 0
                              ? 'در حالت انتخاب‌نشده، کاربر به تمام واحدهای معدن دسترسی دارد.'
                              : `${toPersianDigits(formData.permissions.unitOperations?.allowedUnits?.length || 0)} واحد انتخاب شده است.`}
                          </span>
                        </div>
                        {(formData.permissions.unitOperations?.allowedUnits?.length || 0) > 0 && (
                          <button
                            type="button"
                            onClick={handleClearAllowedUnits}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                          >
                            دسترسی به همه واحدها
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {MINING_UNITS_CATALOG.map(unit => {
                          const isChecked = Boolean(
                            formData.permissions.unitOperations?.allowedUnits?.includes(unit.unitName)
                          );
                          return (
                            <label
                              key={unit.id}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer select-none transition-colors ${
                                isChecked
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleAllowedUnit(unit.unitName)}
                                className="rounded-sm text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 shrink-0"
                              />
                              <span className="truncate">{unit.unitName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 11. صفحه کارانه نهایی ارسالی واحدها */}
                  <div className="bg-white p-4 rounded-xl border border-violet-200 shadow-2xs space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-violet-50 text-violet-700">
                          <Send className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">
                          ۱۱. صفحه تجمیعی «کارانه نهایی ارسالی واحدها» (مخصوص کاربر نهایی / مدیریت)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('finalKaraneh', true)}
                          className="text-[10px] text-violet-700 hover:underline px-1"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSetModuleAll('finalKaraneh', false)}
                          className="text-[10px] text-slate-500 hover:underline px-1"
                        >
                          هیچ‌کدام
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {[
                        { key: 'view', label: 'مشاهده تجمیعی کارانه‌های ارسالی تمام واحدها و آنالیز رشد' },
                        { key: 'edit', label: 'ویرایش مبالغ و بازگرداندن کارانه واحد به پیش‌نویس' },
                        { key: 'delete', label: 'حذف تکی و گروهی ردیف‌های کارانه نهایی ارسالی' },
                        { key: 'deleteAll', label: 'پاکسازی کامل کارانه‌های ارسالی دوره یا کل' },
                        { key: 'exportExcel', label: 'خروجی اکسل جامع تمام واحدها، انتخاب هر ماه و دانلود همه ماه‌ها' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer select-none py-0.5 hover:text-violet-700">
                          <input
                            type="checkbox"
                            checked={(formData.permissions.finalKaraneh as any)?.[item.key] || false}
                            onChange={() => handleToggle('finalKaraneh', item.key as any)}
                            className="rounded-sm text-violet-600 focus:ring-violet-500 w-4 h-4"
                          />
                          <span className="text-slate-800 text-[11px]">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                </div>

              </div>

              {/* Status and Action Buttons */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 text-xs">وضعیت حساب:</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                      formData.isActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'
                    }`}
                  >
                    {formData.isActive ? 'فعال (مجاز به ورود آنلاین)' : 'مسدود شده (غیرفعال)'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-xs"
                  >
                    {editingUser ? 'ذخیره تغییرات و مجوزها' : 'ایجاد حساب کاربری جدید'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Smart Excel Import Users Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-6 p-5 max-h-[92vh] overflow-y-auto">
            <SmartExcelImportMapper
              moduleType="users"
              title="ورود هوشمند فایل اکسل کاربران و سطوح دسترسی"
              subtitle="تطبیق خودکار ستون‌های نام کاربری، رمز عبور، نام کامل، نقش سازمانی، واحد اداری و الگوی دسترسی با هر فایل اکسل"
              onDownloadTemplate={downloadUsersTemplate}
              templateLabel="دانلود نمونه اکسل کاربران"
              onImport={handleSmartUsersImport}
              onCancel={() => setIsImportOpen(false)}
              accentColor="indigo"
              confirmLabel="تأیید و ثبت کاربران در دیتابیس"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف حساب کاربری</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              آیا از حذف حساب کاربری <b>{deleteTarget.fullName}</b> (<span dir="ltr">{deleteTarget.username}</span>) اطمینان دارید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {confirmBatchDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">تأیید حذف گروهی حساب‌های کاربری</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedIds.length)} حساب کاربری</b> انتخاب‌شده از سامانه اطمینان دارید؟ حساب مدیر ارشد و حساب فعلی شما محافظت‌شده هستند.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmBatchDeleteOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50 persian-num"
              >
                {batchDeleting ? 'در حال حذف...' : `بله، حذف ${toPersianDigits(selectedIds.length)} کاربر`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Users Confirmation Modal */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">حذف کامل جدول کاربران سامانه</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا مطمئن هستید تمامی <b>{toPersianDigits(selectableUserIds.length)} حساب کاربری قابل حذف</b> پاک شوند؟ حساب مدیر ارشد (<span dir="ltr">javadabadiyan</span>) و حساب کاربری فعال فعلی شما جهت جلوگیری از قفل شدن سامانه حفظ خواهند شد.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchDeleting ? 'در حال پاکسازی...' : 'بله، جدول کاربران پاک شود'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
