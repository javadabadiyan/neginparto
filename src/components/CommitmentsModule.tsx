import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Printer,
  Archive,
  ArchiveRestore,
  Download,
  Upload,
  AlertCircle,
  Wallet,
  CheckSquare
} from 'lucide-react';
import {
  PersonnelCommitment,
  Personnel,
  CommitmentType,
  CommitmentStatus,
  GranularCommitmentsPermissions
} from '../types';
import {
  formatRial,
  toPersianDigits,
  toEnglishDigits,
  numberToPersianWords
} from '../utils/persian';
import {
  exportCommitmentsToExcel,
  downloadCommitmentsTemplate
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';

interface CommitmentsModuleProps {
  commitments: PersonnelCommitment[];
  personnelList: Personnel[];
  onSaveCommitment: (commitment: Partial<PersonnelCommitment>) => Promise<boolean>;
  onDeleteCommitment: (id: string) => Promise<boolean>;
  onBatchDeleteCommitments: (ids: string[]) => Promise<boolean>;
  onDeleteAllCommitments?: () => Promise<boolean>;
  onBatchImportCommitments: (items: any[]) => Promise<boolean>;
  canManage?: boolean;
  granularPermissions?: GranularCommitmentsPermissions;
}

export const CommitmentsModule: React.FC<CommitmentsModuleProps> = ({
  commitments,
  personnelList,
  onSaveCommitment,
  onDeleteCommitment,
  onBatchDeleteCommitments,
  onDeleteAllCommitments,
  onBatchImportCommitments,
  canManage = false,
  granularPermissions
}) => {
  const canCreate = granularPermissions ? Boolean(granularPermissions.create) : canManage;
  const canEdit = granularPermissions ? Boolean(granularPermissions.edit) : canManage;
  const canDelete = granularPermissions ? Boolean(granularPermissions.delete) : canManage;
  const allowDeleteAll = Boolean(granularPermissions?.deleteAll);
  const canPrint = granularPermissions ? Boolean(granularPermissions.print) : false;
  const canArchive = granularPermissions ? Boolean(granularPermissions.archive) : false;
  const allowExport = granularPermissions ? Boolean(granularPermissions.exportExcel) : false;
  const allowImport = granularPermissions ? Boolean(granularPermissions.importExcel) : false;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [archiveTab, setArchiveTab] = useState<'active' | 'archived' | 'all'>('active');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<PersonnelCommitment | null>(null);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PersonnelCommitment | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [printingCommitment, setPrintingCommitment] = useState<PersonnelCommitment | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

  useEffect(() => {
    const validIds = new Set(commitments.map(c => c.id));
    setSelectedIds(prev => prev.filter(id => validIds.has(id)));
  }, [commitments]);

  const [formData, setFormData] = useState<Partial<PersonnelCommitment>>({
    personnelCode: '',
    personnelName: '',
    commitmentType: 'تعهد حسابداری',
    amount: 500000000,
    previouslyTakenAmount: 0,
    maxAllowedAmount: 1500000000,
    startDate: '1403/01/01',
    endDate: '1405/01/01',
    status: 'جاری و معتبر',
    isArchived: false,
    guarantorName: '',
    notes: ''
  });

  // Compute remaining eligible allowance for any commitment row
  const computeRemaining = (c: Partial<PersonnelCommitment>) => {
    const prev = Number(c.previouslyTakenAmount || 0);
    const curr = Number(c.amount || 0);
    const ceiling = Number(c.maxAllowedAmount || 0);
    if (ceiling <= 0) return 0;
    return Math.max(0, ceiling - prev - curr);
  };

  // Compute cumulative prior taken for selected employee across existing commitments
  const getEmployeeExistingTotal = (code: string, excludeId?: string) => {
    return commitments
      .filter(c => String(c.personnelCode).trim() === String(code).trim() && c.id !== excludeId)
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  };

  const filtered = commitments.filter(c => {
    const term = toEnglishDigits(searchTerm).toLowerCase();
    const matchesSearch =
      c.personnelName.toLowerCase().includes(term) ||
      toEnglishDigits(c.personnelCode).toLowerCase().includes(term) ||
      c.commitmentType.toLowerCase().includes(term) ||
      (c.guarantorName && c.guarantorName.toLowerCase().includes(term)) ||
      (c.archiveCode && toEnglishDigits(c.archiveCode).toLowerCase().includes(term));

    const matchesType = filterType === 'all' || c.commitmentType === filterType;
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesArchive =
      archiveTab === 'all' ||
      (archiveTab === 'archived' && !!c.isArchived) ||
      (archiveTab === 'active' && !c.isArchived);

    return matchesSearch && matchesType && matchesStatus && matchesArchive;
  });

  const handleOpenAdd = () => {
    setEditingCommitment(null);
    setFormError('');
    const firstP = personnelList[0];
    const prior = firstP ? getEmployeeExistingTotal(firstP.personnelCode) : 0;
    setFormData({
      personnelCode: firstP ? firstP.personnelCode : '',
      personnelName: firstP ? firstP.fullName : '',
      personnelId: firstP ? firstP.id : '',
      commitmentType: 'تعهد حسابداری',
      amount: 300000000,
      previouslyTakenAmount: prior,
      maxAllowedAmount: 1500000000,
      startDate: '1403/08/01',
      endDate: '1405/08/01',
      status: 'جاری و معتبر',
      isArchived: false,
      guarantorName: '',
      notes: ''
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (c: PersonnelCommitment) => {
    setEditingCommitment(c);
    setFormError('');
    setFormData({
      ...c,
      previouslyTakenAmount: c.previouslyTakenAmount ?? 0,
      maxAllowedAmount: c.maxAllowedAmount ?? 0,
      isArchived: !!c.isArchived
    });
    setIsFormOpen(true);
  };

  const handleSelectPersonnel = (code: string) => {
    const found = personnelList.find(p => p.personnelCode === code);
    if (!found) return;
    const prior = getEmployeeExistingTotal(found.personnelCode, editingCommitment?.id);
    setFormData(prev => ({
      ...prev,
      personnelCode: found.personnelCode,
      personnelName: found.fullName,
      personnelId: found.id,
      previouslyTakenAmount: prev.previouslyTakenAmount && editingCommitment ? prev.previouslyTakenAmount : prior
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.personnelCode || !formData.commitmentType) {
      setFormError('انتخاب پرسنل و نوع تعهد الزامی است.');
      return;
    }

    const payload: Partial<PersonnelCommitment> = {
      ...formData,
      id: editingCommitment ? editingCommitment.id : undefined,
      personnelCode: toEnglishDigits(formData.personnelCode).trim(),
      startDate: toEnglishDigits(formData.startDate || '').trim(),
      endDate: toEnglishDigits(formData.endDate || '').trim(),
      amount: Number(toEnglishDigits(formData.amount)) || 0,
      previouslyTakenAmount: Number(toEnglishDigits(formData.previouslyTakenAmount)) || 0,
      maxAllowedAmount: Number(toEnglishDigits(formData.maxAllowedAmount)) || 0,
    };

    const success = await onSaveCommitment(payload);
    if (success) {
      setIsFormOpen(false);
    }
  };

  const handleToggleArchive = async (c: PersonnelCommitment) => {
    await onSaveCommitment({
      id: c.id,
      isArchived: !c.isArchived,
      archivedAt: !c.isArchived ? new Date().toLocaleDateString('fa-IR') : undefined,
      archiveCode: !c.isArchived ? (c.archiveCode || `ARC-${Date.now().toString().slice(-5)}`) : c.archiveCode
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await onDeleteCommitment(deleteTarget.id);
    setDeleteTarget(null);
  };

  const filteredIds = filtered.map(c => c.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    const ok = await onBatchDeleteCommitments(selectedIds);
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmBatchDeleteOpen(false);
    }
  };

  const handleSmartCommitmentsImport = async (mappedRows: Record<string, any>[]) => {
    if (mappedRows.length === 0) return;
    const success = await onBatchImportCommitments(mappedRows);
    if (success) {
      setIsImportOpen(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllCommitments) return;
    setBatchDeleting(true);
    const ok = await onDeleteAllCommitments();
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmDeleteAllOpen(false);
    }
  };

  const totalAmount = filtered.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalPreviouslyTaken = filtered.reduce((sum, c) => sum + (c.previouslyTakenAmount || 0), 0);
  const archivedCount = commitments.filter(c => c.isArchived).length;
  const activeCount = commitments.length - archivedCount;
  const modalRemaining = computeRemaining(formData);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              سامانه تعهدات حسابداری، تضامین، سفته‌های پرسنلی و بایگانی
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            ثبت تعهد حسابداری، محاسبه مبالغ قبلاً دریافت‌شده و مانده قابل دریافت، چاپ رسمی تعهدنامه و بایگانی الکترونیک
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowExport && (
            <button
              onClick={() => exportCommitmentsToExcel(filtered)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors border border-emerald-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="persian-num">خروجی اکسل ({toPersianDigits(filtered.length)})</span>
            </button>
          )}

          {allowImport && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors border border-slate-200"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>ورود هوشمند اکسل</span>
            </button>
          )}

          <button
            onClick={downloadCommitmentsTemplate}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>فایل نمونه اکسل</span>
          </button>

          {allowDeleteAll && onDeleteAllCommitments && commitments.length > 0 && (
            <button
              onClick={() => setConfirmDeleteAllOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors border border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف کل جدول تعهدات</span>
            </button>
          )}

          {canCreate && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت تعهد جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">تعداد تعهدات فیلترشده</span>
          <span className="text-xl font-bold text-slate-800 mt-1 block persian-num">
            {toPersianDigits(filtered.length)} فقره
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">مجموع مبالغ تعهدات فعلی</span>
          <span className="text-lg font-bold text-indigo-700 mt-1 block persian-num">
            {formatRial(totalAmount)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">مجموع مبالغ قبلاً دریافت‌شده</span>
          <span className="text-lg font-bold text-amber-700 mt-1 block persian-num">
            {formatRial(totalPreviouslyTaken)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-600 block">وضعیت بایگانی اسناد</span>
          <span className="text-xs font-bold text-emerald-700 mt-2 flex items-center gap-1.5 persian-num">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toPersianDigits(activeCount)} جاری · {toPersianDigits(archivedCount)} بایگانی‌شده</span>
          </span>
        </div>
      </div>

      {/* Archive Tabs & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 no-print">
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
          <button
            onClick={() => setArchiveTab('active')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors persian-num ${
              archiveTab === 'active'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            اسناد جاری ({toPersianDigits(activeCount)})
          </button>
          <button
            onClick={() => setArchiveTab('archived')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors persian-num ${
              archiveTab === 'archived'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>بایگانی تعهدات ({toPersianDigits(archivedCount)})</span>
          </button>
          <button
            onClick={() => setArchiveTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors persian-num ${
              archiveTab === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            نمایش همه ({toPersianDigits(commitments.length)})
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو بر اساس نام پرسنل، کد پرسنلی، نام ضامن یا کد بایگانی..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 persian-num"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">همه انواع تعهدات</option>
              <option value="تعهد حسابداری">تعهد حسابداری</option>
              <option value="سفته حسن انجام کار">سفته حسن انجام کار</option>
              <option value="چک تضمین">چک تضمین</option>
              <option value="تعهد خدمت">تعهد خدمت سازمانی</option>
              <option value="تعهد دوره‌های آموزشی">تعهد دوره‌های آموزشی</option>
              <option value="محرمانگی و عدم رقابت">محرمانگی و عدم رقابت</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="جاری و معتبر">جاری و معتبر</option>
              <option value="پایان یافته">پایان یافته</option>
              <option value="عودت داده شده">عودت داده شده</option>
              <option value="به اجرا گذاشته شده">به اجرا گذاشته شده</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {canDelete && selectedIds.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <span>{toPersianDigits(selectedIds.length)} سند تعهد انتخاب شده است</span>
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

      {/* Commitments Table (Without شماره سند / لاشه چک) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden no-print">
        <div className="responsive-table-container">
          <table className="w-full text-right text-xs min-w-[1050px]">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold">
                {canDelete && (
                  <th className="py-3 px-2.5 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      title="انتخاب همه ردیف‌های فیلترشده"
                      className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-3 text-center w-12">ردیف</th>
                <th className="py-3 px-3">کد پرسنلی</th>
                <th className="py-3 px-3">نام پرسنل</th>
                <th className="py-3 px-3">نوع تعهد یا تضمین</th>
                <th className="py-3 px-3">مبلغ فعلی (ریال)</th>
                <th className="py-3 px-3">قبلاً دریافت‌شده</th>
                <th className="py-3 px-3">مانده قابل دریافت</th>
                <th className="py-3 px-3">تاریخ شروع</th>
                <th className="py-3 px-3">تاریخ سررسید</th>
                <th className="py-3 px-3">نام ضامن</th>
                <th className="py-3 px-3 text-center">وضعیت / بایگانی</th>
                <th className="py-3 px-3 text-center w-36">عملیات و چاپ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canDelete ? 13 : 12} className="py-12 text-center text-slate-600">
                    تعهدی با شرایط انتخاب‌شده یافت نشد.
                  </td>
                </tr>
              ) : (
                filtered.map((c, idx) => {
                  const remaining = computeRemaining(c);
                  const isSelected = selectedIds.includes(c.id);
                  return (
                    <tr key={c.id} className={isSelected ? 'bg-indigo-50/40 transition-colors' : 'hover:bg-slate-50/70 transition-colors'}>
                      {canDelete && (
                        <td className="py-3.5 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(c.id)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3.5 px-3 text-center text-slate-600 persian-num">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-indigo-700 persian-num">
                        {toPersianDigits(c.personnelCode)}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-900">
                        {c.personnelName}
                      </td>
                      <td className="py-3.5 px-3 text-slate-800 font-medium">
                        <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                          c.commitmentType === 'تعهد حسابداری'
                            ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {c.commitmentType}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-emerald-800 persian-num">
                        {formatRial(c.amount)}
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-amber-700 persian-num">
                        {formatRial(c.previouslyTakenAmount || 0)}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-indigo-700 persian-num">
                        {c.maxAllowedAmount && c.maxAllowedAmount > 0 ? formatRial(remaining) : <span className="text-slate-400 font-normal">سقف نامشخص</span>}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 persian-num">
                        {toPersianDigits(c.startDate)}
                      </td>
                      <td className="py-3.5 px-3 font-medium text-slate-700 persian-num">
                        {toPersianDigits(c.endDate)}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        {c.guarantorName || '—'}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.status === 'جاری و معتبر'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : c.status === 'پایان یافته'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {c.status}
                          </span>
                          {c.isArchived && (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold persian-num">
                              بایگانی {c.archiveCode ? `(${toPersianDigits(c.archiveCode)})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canPrint && (
                            <button
                              onClick={() => setPrintingCommitment(c)}
                              title="چاپ تعهد حسابداری"
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                          {canArchive && (
                            <button
                              onClick={() => handleToggleArchive(c)}
                              title={c.isArchived ? 'بازگردانی از بایگانی' : 'ارسال به بایگانی'}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              {c.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(c)}
                              title="ویرایش تعهد"
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(c)}
                              title="حذف تعهد"
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
      </div>

      {/* Add / Edit Commitment Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm sm:text-base">
                  {editingCommitment ? `ویرایش تعهد (${formData.personnelName})` : 'ثبت تعهد حسابداری / تضمین پرسنلی جدید'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">انتخاب پرسنل *</label>
                  <select
                    value={formData.personnelCode}
                    onChange={(e) => handleSelectPersonnel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                    required
                  >
                    <option value="">انتخاب پرسنل</option>
                    {personnelList.map(p => (
                      <option key={p.id} value={p.personnelCode}>
                        {toPersianDigits(p.personnelCode)} - {p.fullName} ({p.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نوع تعهد یا ضمانت *</label>
                  <select
                    value={formData.commitmentType}
                    onChange={(e) => setFormData({ ...formData, commitmentType: e.target.value as CommitmentType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold"
                  >
                    <option value="تعهد حسابداری">تعهد حسابداری</option>
                    <option value="سفته حسن انجام کار">سفته حسن انجام کار</option>
                    <option value="چک تضمین">چک تضمین</option>
                    <option value="تعهد خدمت">تعهد خدمت سازمانی</option>
                    <option value="تعهد دوره‌های آموزشی">تعهد دوره‌های آموزشی</option>
                    <option value="محرمانگی و عدم رقابت">محرمانگی و عدم رقابت</option>
                  </select>
                </div>
              </div>

              {/* Financial Quota Section: قبلاً چقدر گرفته و چقدر دیگه می‌تونه بگیره */}
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  <span>محاسبه مبالغ تعهد، دریافتی قبلی و سقف مانده قابل دریافت</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">مبلغ تعهد فعلی (ریال) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={toPersianDigits(formData.amount ?? '')}
                      onChange={(e) => {
                        const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                        setFormData({ ...formData, amount: Number(clean || 0) });
                      }}
                      className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-slate-900 persian-num font-bold"
                    />
                    <span className="text-[11px] text-emerald-700 mt-1 block persian-num font-bold">
                      {formatRial(formData.amount)}
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">قبلاً چقدر گرفته؟ (ریال)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={toPersianDigits(formData.previouslyTakenAmount ?? '')}
                      onChange={(e) => {
                        const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                        setFormData({ ...formData, previouslyTakenAmount: Number(clean || 0) });
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                    />
                    <span className="text-[11px] text-amber-700 mt-1 block persian-num">
                      {formatRial(formData.previouslyTakenAmount)}
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">سقف مجاز کل (ریال)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={toPersianDigits(formData.maxAllowedAmount ?? '')}
                      onChange={(e) => {
                        const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                        setFormData({ ...formData, maxAllowedAmount: Number(clean || 0) });
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                    />
                    <span className="text-[11px] text-slate-600 mt-1 block persian-num">
                      {formatRial(formData.maxAllowedAmount)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">مانده مجاز (چقدر دیگر می‌تواند بگیرد؟):</span>
                  <span className={`text-sm font-bold persian-num ${modalRemaining > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formData.maxAllowedAmount && formData.maxAllowedAmount > 0
                      ? `${formatRial(modalRemaining)} (${numberToPersianWords(modalRemaining)} ریال)`
                      : 'سقف کل وارد نشده است'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاریخ شروع / اخذ تعهد (شمسی)</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.startDate || '')}
                    onChange={(e) => setFormData({ ...formData, startDate: toEnglishDigits(e.target.value) })}
                    placeholder="۱۴۰۳/۰۱/۰۱"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاریخ سررسید / خاتمه تعهد (شمسی)</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.endDate || '')}
                    onChange={(e) => setFormData({ ...formData, endDate: toEnglishDigits(e.target.value) })}
                    placeholder="۱۴۰۵/۰۱/۰۱"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام و مشخصات ضامن</label>
                  <input
                    type="text"
                    value={formData.guarantorName || ''}
                    onChange={(e) => setFormData({ ...formData, guarantorName: e.target.value })}
                    placeholder="نام ضامن و نسبت"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وضعیت تعهد</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as CommitmentStatus })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="جاری و معتبر">جاری و معتبر</option>
                    <option value="پایان یافته">پایان یافته</option>
                    <option value="عودت داده شده">عودت داده شده به پرسنل</option>
                    <option value="به اجرا گذاشته شده">به اجرا گذاشته شده</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={!!formData.isArchived}
                  onChange={(e) => setFormData({ ...formData, isArchived: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-600"
                />
                <span className="font-bold text-amber-900">ارسال مستقیم به بایگانی تعهدات</span>
              </label>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">توضیحات و شرایط تعهدنامه</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="موضوع تعهد حسابداری، شرایط بازپرداخت یا کسر از کارانه..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm"
                >
                  ذخیره تعهد در سیستم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Accounting Commitment Sheet Modal */}
      {printingCommitment && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden my-4 print-sheet">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
              <span className="font-bold text-sm">پیش‌نمایش چاپ رسمی تعهدنامه حسابداری</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ برگه (Print)</span>
                </button>
                <button
                  onClick={() => setPrintingCommitment(null)}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Formal A4 Document Content */}
            <div className="p-6 sm:p-10 space-y-6 text-slate-900 text-xs sm:text-sm leading-relaxed">
              <div className="border-b-2 border-slate-800 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">فرم رسمی تعهد حسابداری و مالی پرسنل</h2>
                  <p className="text-xs text-slate-600 mt-1">امور کارگزینی و واحد حسابداری منابع انسانی</p>
                </div>
                <div className="text-left text-xs space-y-1 persian-num">
                  <div>تاریخ تنظیم: <b>{toPersianDigits(printingCommitment.startDate)}</b></div>
                  <div>تاریخ سررسید: <b>{toPersianDigits(printingCommitment.endDate)}</b></div>
                  {printingCommitment.archiveCode && (
                    <div>کد بایگانی: <b>{toPersianDigits(printingCommitment.archiveCode)}</b></div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs persian-num">
                <div>نام و نام خانوادگی متعهد: <b>{printingCommitment.personnelName}</b></div>
                <div>کد پرسنلی: <b>{toPersianDigits(printingCommitment.personnelCode)}</b></div>
                <div>نوع تعهد: <b>{printingCommitment.commitmentType}</b></div>
                <div>نام ضامن: <b>{printingCommitment.guarantorName || 'ندارد'}</b></div>
              </div>

              <div className="space-y-2 text-justify leading-7">
                <p>
                  اینجانب <b className="mx-1">{printingCommitment.personnelName}</b> با کد پرسنلی{' '}
                  <b className="persian-num mx-1">{toPersianDigits(printingCommitment.personnelCode)}</b>، متعهد می‌گردم مبلغ{' '}
                  <b className="persian-num mx-1">{formatRial(printingCommitment.amount)}</b> (به حروف:{' '}
                  <b>{numberToPersianWords(printingCommitment.amount)} ریال</b>) بابت{' '}
                  <b>{printingCommitment.commitmentType}</b> را در چارچوب ضوابط مالی و حسابداری سازمان تعهد نموده و در صورت عدم تسویه تا تاریخ{' '}
                  <b className="persian-num">{toPersianDigits(printingCommitment.endDate)}</b>، واحد حسابداری مجاز به کسر از حقوق، کارانه و مزایای اینجانب می‌باشد.
                </p>
                {printingCommitment.notes && (
                  <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <b>توضیحات تکمیلی:</b> {printingCommitment.notes}
                  </p>
                )}
              </div>

              {/* Financial Quota Box */}
              <div className="grid grid-cols-3 gap-3 border border-slate-300 rounded-xl p-4 bg-slate-50/70 text-xs persian-num">
                <div>
                  <span className="text-slate-600 block">قبلاً دریافت‌شده:</span>
                  <b className="text-slate-900">{formatRial(printingCommitment.previouslyTakenAmount || 0)}</b>
                </div>
                <div>
                  <span className="text-slate-600 block">تعهد فعلی:</span>
                  <b className="text-slate-900">{formatRial(printingCommitment.amount)}</b>
                </div>
                <div>
                  <span className="text-slate-600 block">مانده قابل دریافت از سقف:</span>
                  <b className="text-slate-900">
                    {printingCommitment.maxAllowedAmount && printingCommitment.maxAllowedAmount > 0
                      ? formatRial(computeRemaining(printingCommitment))
                      : 'تعیین نشده'}
                  </b>
                </div>
              </div>

              {/* Signature Blocks */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 text-center text-xs">
                <div className="border-t border-slate-400 pt-2">
                  <div className="font-bold">امضاء و اثر انگشت متعهد</div>
                  <div className="text-slate-500 mt-1">{printingCommitment.personnelName}</div>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <div className="font-bold">امضاء ضامن</div>
                  <div className="text-slate-500 mt-1">{printingCommitment.guarantorName || '—'}</div>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <div className="font-bold">تایید واحد حسابداری</div>
                  <div className="text-slate-500 mt-1">مهر و امضاء</div>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <div className="font-bold">تایید امور کارگزینی</div>
                  <div className="text-slate-500 mt-1">مهر و امضاء</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Excel Batch Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden my-6 p-5 max-h-[92vh] overflow-y-auto">
            <SmartExcelImportMapper
              moduleType="commitments"
              title="ورود هوشمند فایل اکسل تعهدات حسابداری و تضامین پرسنل"
              subtitle="تشخیص و تطبیق خودکار ستون‌های کد پرسنلی، نوع تعهد، مبلغ فعلی، مبلغ قبلاً دریافت‌شده، سقف مجاز، ضامن و وضعیت با هر فایل اکسل"
              onDownloadTemplate={downloadCommitmentsTemplate}
              templateLabel="دانلود فایل نمونه تعهدات"
              onImport={handleSmartCommitmentsImport}
              onCancel={() => setIsImportOpen(false)}
              accentColor="amber"
              confirmLabel="تأیید و ثبت تعهدات در دیتابیس"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">تأیید حذف تعهد</h3>
            <p className="text-slate-600">
              آیا از حذف سند تعهد پرسنل <b>{deleteTarget.personnelName}</b> اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
              >
                حذف قطعی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {confirmBatchDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">تأیید حذف گروهی اسناد تعهدات</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedIds.length)} سند تعهد</b> انتخاب‌شده از پایگاه داده اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmBatchDeleteOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50 persian-num"
              >
                {batchDeleting ? 'در حال حذف...' : `بله، حذف ${toPersianDigits(selectedIds.length)} سند`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Commitments Confirmation Modal */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">حذف کامل جدول تعهدات و تضامین</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی تمامی <b>{toPersianDigits(commitments.length)} سند تعهد</b> (جاری و بایگانی‌شده) از پایگاه داده اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={batchDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteAll}
                disabled={batchDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchDeleting ? 'در حال پاکسازی...' : 'بله، جدول تعهدات پاک شود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
