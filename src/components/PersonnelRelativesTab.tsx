import React, { useMemo, useState } from 'react';
import {
  HeartHandshake,
  Search,
  Download,
  Upload,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  AlertCircle,
  X,
  Users,
  ShieldCheck,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { Personnel, PersonnelRelative } from '../types';
import { toPersianDigits, toEnglishDigits } from '../utils/persian';
import {
  exportPersonnelRelativesToExcel,
  downloadPersonnelRelativesTemplate
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import { buildDuplicateIndex, normalizeDuplicateKey } from '../utils/duplicates';

interface PersonnelRelativesTabProps {
  personnelList: Personnel[];
  onSavePersonnel: (personnel: Partial<Personnel>) => Promise<boolean>;
  onBatchImportRelatives?: (items: any[]) => Promise<boolean>;
  onDeleteAllRelatives?: () => Promise<boolean>;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  allowDeleteAll: boolean;
  allowExport: boolean;
  allowImport: boolean;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const RELATION_OPTIONS = ['همسر', 'فرزند (پسر)', 'فرزند (دختر)', 'پدر', 'مادر', 'سایر'];

export const PersonnelRelativesTab: React.FC<PersonnelRelativesTabProps> = ({
  personnelList,
  onSavePersonnel,
  onBatchImportRelatives,
  onDeleteAllRelatives,
  canCreate,
  canEdit,
  canDelete,
  allowDeleteAll,
  allowExport,
  allowImport,
  onRefreshData,
  isRefreshing = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [relationFilter, setRelationFilter] = useState('all');
  const [onlyDependent, setOnlyDependent] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);

  const [selectedCompositeIds, setSelectedCompositeIds] = useState<string[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  const [isSmartImportOpen, setIsSmartImportOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{ personnelId: string; relativeId: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formState, setFormState] = useState<{
    personnelId: string;
    fullName: string;
    relation: string;
    nationalId: string;
    shenasnamehNumber: string;
    fatherName: string;
    birthDate: string;
    gender: 'مرد' | 'زن' | '';
    phone: string;
    education: string;
    isDependent: boolean;
    insuranceCovered: boolean;
    notes: string;
  }>({
    personnelId: '',
    fullName: '',
    relation: 'همسر',
    nationalId: '',
    shenasnamehNumber: '',
    fatherName: '',
    birthDate: '',
    gender: '',
    phone: '',
    education: '',
    isDependent: true,
    insuranceCovered: true,
    notes: ''
  });

  const allRelatives = useMemo(() => {
    const rows: (PersonnelRelative & { parentPersonnel: Personnel })[] = [];
    personnelList.forEach(p => {
      (p.relatives || []).forEach(rel => {
        rows.push({
          ...rel,
          personnelId: rel.personnelId || p.id,
          personnelCode: rel.personnelCode || p.personnelCode,
          personnelName: rel.personnelName || p.fullName,
          parentPersonnel: p
        });
      });
    });
    return rows;
  }, [personnelList]);

  const personnelNationalIds = useMemo(() => {
    const set = new Set<string>();
    personnelList.forEach((p) => {
      const nid = normalizeDuplicateKey(p.nationalId);
      if (nid) set.add(nid);
    });
    return set;
  }, [personnelList]);

  const relativeDupIndex = useMemo(
    () => buildDuplicateIndex(allRelatives, () => '', (r) => r.nationalId),
    [allRelatives]
  );

  const isDuplicateRelative = (r: PersonnelRelative & { parentPersonnel: Personnel }) => {
    if (relativeDupIndex.isDuplicateRow(r)) return true;
    const nid = normalizeDuplicateKey(r.nationalId);
    return Boolean(nid && personnelNationalIds.has(nid));
  };

  const totalDuplicateRelatives = useMemo(
    () => allRelatives.filter((r) => isDuplicateRelative(r)).length,
    [allRelatives, relativeDupIndex, personnelNationalIds]
  );

  const filteredRelatives = useMemo(() => {
    const term = toEnglishDigits(searchTerm).trim().toLowerCase();
    return allRelatives.filter(r => {
      const matchesSearch =
        !term ||
        (r.fullName || '').toLowerCase().includes(term) ||
        toEnglishDigits(r.nationalId || '').includes(term) ||
        (r.personnelName || '').toLowerCase().includes(term) ||
        toEnglishDigits(r.personnelCode || '').toLowerCase().includes(term);

      const matchesRelation =
        relationFilter === 'all' || (r.relation || '').includes(relationFilter);

      const matchesDependent = !onlyDependent || Boolean(r.isDependent);
      const matchesDup = !onlyDuplicates || isDuplicateRelative(r);

      return matchesSearch && matchesRelation && matchesDependent && matchesDup;
    });
  }, [allRelatives, searchTerm, relationFilter, onlyDependent, onlyDuplicates, relativeDupIndex, personnelNationalIds]);

  const getCompositeKey = (r: { personnelId: string; id: string }) => `${r.personnelId}::${r.id}`;
  const filteredKeys = filteredRelatives.map(getCompositeKey);
  const allFilteredSelected =
    filteredKeys.length > 0 && filteredKeys.every(k => selectedCompositeIds.includes(k));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedCompositeIds(prev => prev.filter(k => !filteredKeys.includes(k)));
    } else {
      setSelectedCompositeIds(prev => Array.from(new Set([...prev, ...filteredKeys])));
    }
  };

  const toggleSelectOne = (key: string) => {
    setSelectedCompositeIds(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    );
  };

  const handleOpenAdd = () => {
    setEditingTarget(null);
    setFormError('');
    setFormState({
      personnelId: personnelList[0]?.id || '',
      fullName: '',
      relation: 'همسر',
      nationalId: '',
      shenasnamehNumber: '',
      fatherName: '',
      birthDate: '',
      gender: '',
      phone: '',
      education: '',
      isDependent: true,
      insuranceCovered: true,
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (r: PersonnelRelative) => {
    setEditingTarget({ personnelId: r.personnelId, relativeId: r.id });
    setFormError('');
    setFormState({
      personnelId: r.personnelId,
      fullName: r.fullName || '',
      relation: r.relation || 'همسر',
      nationalId: r.nationalId || '',
      shenasnamehNumber: r.shenasnamehNumber || '',
      fatherName: r.fatherName || '',
      birthDate: r.birthDate || '',
      gender: (r.gender as 'مرد' | 'زن' | '') || '',
      phone: r.phone || '',
      education: r.education || '',
      isDependent: r.isDependent ?? true,
      insuranceCovered: r.insuranceCovered ?? true,
      notes: r.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveRelative = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formState.personnelId) {
      setFormError('لطفاً پرسنل سرپرست را انتخاب نمایید.');
      return;
    }
    if (!formState.fullName.trim()) {
      setFormError('لطفاً نام و نام خانوادگی فرد بستگان را وارد نمایید.');
      return;
    }

    const parent = personnelList.find(p => p.id === formState.personnelId);
    if (!parent) {
      setFormError('پرونده پرسنل انتخاب‌شده یافت نشد.');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const existingRelatives = Array.isArray(parent.relatives) ? [...parent.relatives] : [];

    const cleanRelative: PersonnelRelative = {
      id: editingTarget ? editingTarget.relativeId : `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personnelId: parent.id,
      personnelCode: parent.personnelCode,
      personnelName: parent.fullName,
      fullName: formState.fullName.trim(),
      relation: formState.relation.trim() || 'سایر',
      nationalId: toEnglishDigits(formState.nationalId).trim(),
      shenasnamehNumber: toEnglishDigits(formState.shenasnamehNumber).trim(),
      fatherName: formState.fatherName.trim(),
      birthDate: toEnglishDigits(formState.birthDate).trim(),
      gender: formState.gender,
      phone: toEnglishDigits(formState.phone).trim(),
      education: formState.education.trim(),
      isDependent: formState.isDependent,
      insuranceCovered: formState.insuranceCovered,
      notes: formState.notes.trim(),
      updatedAt: now
    };

    if (editingTarget && editingTarget.personnelId !== parent.id) {
      // Moved from one personnel to another
      const oldParent = personnelList.find(p => p.id === editingTarget.personnelId);
      if (oldParent) {
        await onSavePersonnel({
          ...oldParent,
          relatives: (oldParent.relatives || []).filter(r => r.id !== editingTarget.relativeId)
        });
      }
      existingRelatives.push({ ...cleanRelative, createdAt: now });
    } else if (editingTarget) {
      const idx = existingRelatives.findIndex(r => r.id === editingTarget.relativeId);
      if (idx >= 0) {
        existingRelatives[idx] = { ...existingRelatives[idx], ...cleanRelative };
      } else {
        existingRelatives.push({ ...cleanRelative, createdAt: now });
      }
    } else {
      existingRelatives.push({ ...cleanRelative, createdAt: now });
    }

    const ok = await onSavePersonnel({
      ...parent,
      relatives: existingRelatives
    });
    setSaving(false);
    if (ok) {
      setIsModalOpen(false);
    }
  };

  const handleDeleteSingleRelative = async (rel: PersonnelRelative) => {
    const parent = personnelList.find(p => p.id === rel.personnelId);
    if (!parent) return;
    const nextRelatives = (parent.relatives || []).filter(r => r.id !== rel.id);
    await onSavePersonnel({ ...parent, relatives: nextRelatives });
    setSelectedCompositeIds(prev => prev.filter(k => k !== getCompositeKey(rel)));
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedCompositeIds.length === 0) return;
    setBatchDeleting(true);
    const byPersonnel = new Map<string, Set<string>>();
    selectedCompositeIds.forEach(key => {
      const [pId, rId] = key.split('::');
      if (!byPersonnel.has(pId)) byPersonnel.set(pId, new Set());
      byPersonnel.get(pId)!.add(rId);
    });

    for (const [pId, relIds] of byPersonnel.entries()) {
      const parent = personnelList.find(p => p.id === pId);
      if (!parent) continue;
      const nextRelatives = (parent.relatives || []).filter(r => !relIds.has(r.id));
      await onSavePersonnel({ ...parent, relatives: nextRelatives });
    }

    setBatchDeleting(false);
    setSelectedCompositeIds([]);
    setConfirmBatchDeleteOpen(false);
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllRelatives) return;
    setDeleteAllLoading(true);
    const ok = await onDeleteAllRelatives();
    setDeleteAllLoading(false);
    if (ok) {
      setSelectedCompositeIds([]);
      setConfirmDeleteAllOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                مدیریت متمرکز بستگان، عائله و افراد تحت تکفل پرسنل
              </h3>
              <p className="text-[11px] text-slate-600 persian-num">
                مجموع کل بستگان ثبت‌شده: <b>{toPersianDigits(allRelatives.length)}</b> نفر · تحت تکفل:{' '}
                <b>{toPersianDigits(allRelatives.filter(r => r.isDependent).length)}</b> نفر
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefreshData && (
              <button
                type="button"
                onClick={() => onRefreshData()}
                disabled={Boolean(isRefreshing)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>بروزرسانی اطلاعات</span>
              </button>
            )}
            {allowExport && (
              <>
                <button
                  onClick={downloadPersonnelRelativesTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>فایل نمونه بستگان</span>
                </button>
                <button
                  onClick={() => exportPersonnelRelativesToExcel(filteredRelatives)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 transition-colors cursor-pointer persian-num"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>خروجی اکسل ({toPersianDigits(filteredRelatives.length)})</span>
                </button>
              </>
            )}

            {allowImport && onBatchImportRelatives && (
              <button
                onClick={() => setIsSmartImportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>ورود هوشمند با اکسل</span>
              </button>
            )}

            {allowDeleteAll && onDeleteAllRelatives && allRelatives.length > 0 && (
              <button
                onClick={() => setConfirmDeleteAllOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>پاک کردن کل بستگان</span>
              </button>
            )}

            {(canCreate || canEdit) && (
              <button
                onClick={handleOpenAdd}
                disabled={personnelList.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن دستی بستگان</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          <div className="md:col-span-5 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو بر اساس نام بستگان، کد ملی، نام یا کد پرسنلی کارمند..."
              className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white persian-num"
            />
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-2.5" />
          </div>

          <div className="md:col-span-3">
            <select
              value={relationFilter}
              onChange={(e) => setRelationFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
            >
              <option value="all">همه نسبت‌های خانوادگی</option>
              {RELATION_OPTIONS.map(rel => (
                <option key={rel} value={rel}>{rel}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex items-center">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg w-full">
              <input
                type="checkbox"
                checked={onlyDependent}
                onChange={(e) => setOnlyDependent(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span>فقط تحت تکفل</span>
            </label>
          </div>

          <div className="md:col-span-2 flex items-center">
            <button
              type="button"
              onClick={() => setOnlyDuplicates((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer persian-num ${
                onlyDuplicates
                  ? 'bg-amber-600 text-white border-amber-700'
                  : totalDuplicateRelatives > 0
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>فقط تکراری‌ها ({toPersianDigits(totalDuplicateRelatives)})</span>
            </button>
          </div>
        </div>
      </div>

      {totalDuplicateRelatives > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-950">
          <div className="flex items-center gap-2 persian-num">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <b>{toPersianDigits(totalDuplicateRelatives)} ردیف بستگان</b> دارای کد ملی تکراری (یا هم‌سان با کد ملی پرسنل) شناسایی شد.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOnlyDuplicates((prev) => !prev)}
            className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold hover:bg-amber-100 shrink-0"
          >
            {onlyDuplicates ? 'نمایش همه' : 'فیلتر تکراری‌ها'}
          </button>
        </div>
      )}

      {/* Bulk Bar */}
      {canDelete && selectedCompositeIds.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <span>{toPersianDigits(selectedCompositeIds.length)} ردیف بستگان انتخاب شده است</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCompositeIds([])}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold"
            >
              لغو انتخاب
            </button>
            <button
              onClick={() => setConfirmBatchDeleteOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs persian-num"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف انتخاب‌شده‌ها ({toPersianDigits(selectedCompositeIds.length)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Relatives Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="responsive-table-container">
          <table className="w-full text-right text-xs min-w-[980px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                {canDelete && (
                  <th className="py-3 px-2.5 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-3 w-12 text-center">ردیف</th>
                <th className="py-3 px-3">کد پرسنلی کارمند</th>
                <th className="py-3 px-3">نام کارمند</th>
                <th className="py-3 px-3">نام و نام خانوادگی بستگان</th>
                <th className="py-3 px-3">نسبت</th>
                <th className="py-3 px-3">کد ملی بستگان</th>
                <th className="py-3 px-3">تاریخ تولد</th>
                <th className="py-3 px-3">جنسیت</th>
                <th className="py-3 px-3">تلفن تماس</th>
                <th className="py-3 px-3 text-center">تحت تکفل</th>
                <th className="py-3 px-3 text-center">بیمه تکمیلی</th>
                <th className="py-3 px-3 text-center w-24">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRelatives.length === 0 ? (
                <tr>
                  <td colSpan={canDelete ? 13 : 12} className="py-12 text-center text-slate-500">
                    هنوز اطلاعات بستگان با این فیلترها ثبت نشده است. می‌توانید به‌صورت دستی یا با اکسل هوشمند وارد نمایید.
                  </td>
                </tr>
              ) : (
                filteredRelatives.map((r, idx) => {
                  const compositeKey = getCompositeKey(r);
                  const isSelected = selectedCompositeIds.includes(compositeKey);
                  const isDupRel = relativeDupIndex.isDuplicateRow(r);
                  const nid = normalizeDuplicateKey(r.nationalId);
                  const matchesEmpNid = Boolean(nid && personnelNationalIds.has(nid));
                  const isDup = isDupRel || matchesEmpNid;
                  return (
                    <tr
                      key={compositeKey}
                      className={
                        isSelected
                          ? 'bg-indigo-50/40'
                          : isDup
                          ? 'bg-amber-50/60 hover:bg-amber-100/50'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      {canDelete && (
                        <td className="py-3 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(compositeKey)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3 px-3 text-center text-slate-500 persian-num">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-3 px-3 font-bold text-indigo-700 persian-num">
                        {toPersianDigits(r.personnelCode || '')}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{r.personnelName}</td>
                      <td className="py-3 px-3 font-bold text-slate-900">{r.fullName}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-bold">
                          {r.relation}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 persian-num">
                        <div>{toPersianDigits(r.nationalId || '—')}</div>
                        {isDup && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            {matchesEmpNid ? 'تکراری با کد ملی کارمند' : 'تکراری: کد ملی'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 persian-num">
                        {toPersianDigits(r.birthDate || '—')}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{r.gender || '—'}</td>
                      <td className="py-3 px-3 text-slate-600 persian-num">
                        {toPersianDigits(r.phone || '—')}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            r.isDependent
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.isDependent ? 'بله' : 'خیر'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {r.insuranceCovered ? (
                          <span className="inline-flex items-center gap-1 text-teal-700 font-bold text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            بله
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">خیر</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(r)}
                              title="ویرایش مشخصات بستگان"
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteSingleRelative(r)}
                              title="حذف فرد از لیست بستگان"
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
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

      {/* Add / Edit Relative Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6">
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-sm sm:text-base">
                  {editingTarget ? 'ویرایش مشخصات بستگان پرسنل' : 'ثبت دستی بستگان و افراد تحت تکفل'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRelative} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">کارمند سرپرست *</label>
                  <select
                    required
                    value={formState.personnelId}
                    onChange={(e) => setFormState({ ...formState, personnelId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold persian-num"
                  >
                    <option value="">انتخاب پرسنل...</option>
                    {personnelList.map(p => (
                      <option key={p.id} value={p.id}>
                        {toPersianDigits(p.personnelCode)} - {p.fullName} ({p.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام و نام خانوادگی بستگان *</label>
                  <input
                    type="text"
                    required
                    value={formState.fullName}
                    onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                    placeholder="سارا محمدی"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نسبت خانوادگی *</label>
                  <select
                    value={formState.relation}
                    onChange={(e) => setFormState({ ...formState, relation: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold"
                  >
                    {RELATION_OPTIONS.map(rel => (
                      <option key={rel} value={rel}>{rel}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">کد ملی بستگان</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={toPersianDigits(formState.nationalId)}
                    onChange={(e) => setFormState({ ...formState, nationalId: toEnglishDigits(e.target.value) })}
                    placeholder="۰۰۱۲۳۴۵۶۷۸"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">شماره شناسنامه</label>
                  <input
                    type="text"
                    value={toPersianDigits(formState.shenasnamehNumber)}
                    onChange={(e) => setFormState({ ...formState, shenasnamehNumber: toEnglishDigits(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام پدر</label>
                  <input
                    type="text"
                    value={formState.fatherName}
                    onChange={(e) => setFormState({ ...formState, fatherName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاریخ تولد (شمسی)</label>
                  <input
                    type="text"
                    value={toPersianDigits(formState.birthDate)}
                    onChange={(e) => setFormState({ ...formState, birthDate: toEnglishDigits(e.target.value) })}
                    placeholder="۱۳۷۰/۰۴/۱۵"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">جنسیت</label>
                  <select
                    value={formState.gender}
                    onChange={(e) => setFormState({ ...formState, gender: e.target.value as 'مرد' | 'زن' | '' })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="">نامشخص</option>
                    <option value="زن">زن</option>
                    <option value="مرد">مرد</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تلفن تماس</label>
                  <input
                    type="text"
                    value={toPersianDigits(formState.phone)}
                    onChange={(e) => setFormState({ ...formState, phone: toEnglishDigits(e.target.value) })}
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تحصیلات</label>
                  <input
                    type="text"
                    value={formState.education}
                    onChange={(e) => setFormState({ ...formState, education: e.target.value })}
                    placeholder="کارشناسی / دانش‌آموز"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div className="flex items-center gap-5 pt-4">
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.isDependent}
                      onChange={(e) => setFormState({ ...formState, isDependent: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span>تحت تکفل</span>
                  </label>
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.insuranceCovered}
                      onChange={(e) => setFormState({ ...formState, insuranceCovered: e.target.checked })}
                      className="w-4 h-4 rounded text-teal-600"
                    />
                    <span>بیمه تکمیلی</span>
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">توضیحات</label>
                  <input
                    type="text"
                    value={formState.notes}
                    onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {saving ? 'در حال ذخیره...' : editingTarget ? 'ثبت تغییرات بستگان' : 'ذخیره اطلاعات بستگان'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Excel Import Modal for Relatives */}
      {isSmartImportOpen && onBatchImportRelatives && (
        <SmartExcelImportMapper
          moduleType="relatives"
          title="ورود هوشمند اطلاعات بستگان و عائله پرسنل از فایل اکسل"
          subtitle="تمامی ستون‌های فایل اکسل (کد پرسنلی، نام بستگان، نسبت، کد ملی، تکفل، بیمه) به‌صورت خودکار تطبیق داده می‌شوند."
          onDownloadTemplate={downloadPersonnelRelativesTemplate}
          templateLabel="دانلود الگوی اکسل بستگان"
          onCancel={() => setIsSmartImportOpen(false)}
          onImport={async (mappedRows) => {
            const ok = await onBatchImportRelatives(mappedRows);
            if (ok) {
              setSearchTerm('');
              setRelationFilter('all');
              setOnlyDependent(false);
              setOnlyDuplicates(false);
              setIsSmartImportOpen(false);
            }
          }}
        />
      )}

      {/* Batch Delete Confirmation */}
      {confirmBatchDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">تأیید حذف گروهی بستگان</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedCompositeIds.length)} ردیف بستگان</b> انتخاب‌شده از پرونده پرسنل اطمینان دارید؟
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
                {batchDeleting ? 'در حال حذف...' : 'بله، حذف شود'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Relatives Confirmation */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">پاکسازی کامل جدول بستگان پرسنل</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از پاک کردن کامل تمامی <b>{toPersianDigits(allRelatives.length)} ردیف اطلاعات بستگان</b> از پرونده کل پرسنل اطمینان دارید؟ اطلاعات اصلی پرسنل حفظ خواهد شد.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={deleteAllLoading}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteAll}
                disabled={deleteAllLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {deleteAllLoading ? 'در حال پاکسازی...' : 'بله، کل بستگان پاک شود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
