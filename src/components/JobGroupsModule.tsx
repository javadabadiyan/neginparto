import React, { useState, useEffect } from 'react';
import {
  Award,
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  GraduationCap,
  Clock,
  Download,
  Upload,
  Table,
  Layers,
  AlertCircle,
  CheckSquare,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  JobGroup,
  JobClassificationRecord,
  Personnel,
  GranularJobGroupsPermissions
} from '../types';
import { formatRial, toPersianDigits, toEnglishDigits } from '../utils/persian';
import {
  exportJobClassificationsToExcel,
  downloadJobClassificationsTemplate
} from '../utils/excel';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import { TablePagination } from './TablePagination';
import { buildDuplicateIndex } from '../utils/duplicates';

interface JobGroupsModuleProps {
  jobGroups: JobGroup[];
  classifications: JobClassificationRecord[];
  personnelList: Personnel[];
  onSaveJobGroup: (group: Partial<JobGroup>) => Promise<boolean>;
  onDeleteJobGroup: (id: string) => Promise<boolean>;
  onBatchDeleteJobGroups: (ids: string[]) => Promise<boolean>;
  onDeleteAllJobGroups?: () => Promise<boolean>;
  onSaveClassification: (record: Partial<JobClassificationRecord>) => Promise<boolean>;
  onDeleteClassification: (id: string) => Promise<boolean>;
  onBatchDeleteClassifications: (ids: string[]) => Promise<boolean>;
  onDeleteAllClassifications?: () => Promise<boolean>;
  onBatchImportClassifications: (items: any[]) => Promise<boolean>;
  canManage?: boolean;
  granularPermissions?: GranularJobGroupsPermissions;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const EMPTY_CLASSIFICATION: Partial<JobClassificationRecord> = {
  personnelCode: '',
  firstName: '',
  lastName: '',
  workLocation: '',
  department: '',
  nationalId: '',
  education: '',
  hireDate: '',
  hireMonth: '',
  miningExperienceDays: '',
  totalInsuranceHistory: '',
  miningExperience: '',
  nonMiningExperience: '',
  jobGroup: '',
  groupGapFrom1405: '',
  nextGroupGap: '',
  jobTitle: '',
  position: '',
};

export const JobGroupsModule: React.FC<JobGroupsModuleProps> = ({
  jobGroups,
  classifications,
  personnelList,
  onSaveJobGroup,
  onDeleteJobGroup,
  onBatchDeleteJobGroups,
  onDeleteAllJobGroups,
  onSaveClassification,
  onDeleteClassification,
  onBatchDeleteClassifications,
  onDeleteAllClassifications,
  onBatchImportClassifications,
  canManage = false,
  granularPermissions,
  onRefreshData,
  isRefreshing = false
}) => {
  const canCreate = granularPermissions ? Boolean(granularPermissions.create) : canManage;
  const canEdit = granularPermissions ? Boolean(granularPermissions.edit) : canManage;
  const canDelete = granularPermissions ? Boolean(granularPermissions.delete) : canManage;
  const allowDeleteAll = Boolean(granularPermissions?.deleteAll);
  const allowImport = granularPermissions ? Boolean(granularPermissions.importExcel) : false;
  const allowExport = granularPermissions ? Boolean(granularPermissions.exportExcel) : false;

  const [subTab, setSubTab] = useState<'classifications' | 'groups'>('classifications');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Job Group modal
  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<JobGroup | null>(null);
  const [groupFormError, setGroupFormError] = useState('');
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<JobGroup | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [confirmBatchGroupDelete, setConfirmBatchGroupDelete] = useState(false);
  const [batchGroupDeleting, setBatchGroupDeleting] = useState(false);

  const [groupFormData, setGroupFormData] = useState<Partial<JobGroup>>({
    code: 'گروه ',
    title: '',
    grade: 10,
    minBaseSalary: 150000000,
    maxBaseSalary: 250000000,
    maxKaranehCeiling: 60000000,
    requiredExperienceYears: 3,
    requiredDegree: 'کارشناسی',
    description: ''
  });

  // 18-column Classification modal
  const [isClassFormOpen, setIsClassFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<JobClassificationRecord | null>(null);
  const [classFormData, setClassFormData] = useState<Partial<JobClassificationRecord>>(EMPTY_CLASSIFICATION);
  const [classFormError, setClassFormError] = useState('');
  const [deleteClassTarget, setDeleteClassTarget] = useState<JobClassificationRecord | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [confirmBatchClassDelete, setConfirmBatchClassDelete] = useState(false);
  const [batchClassDeleting, setBatchClassDeleting] = useState(false);

  // Excel import modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [confirmDeleteAllClass, setConfirmDeleteAllClass] = useState(false);
  const [confirmDeleteAllGroups, setConfirmDeleteAllGroups] = useState(false);

  useEffect(() => {
    const validClassIds = new Set(classifications.map(c => c.id));
    setSelectedClassIds(prev => prev.filter(id => validClassIds.has(id)));
  }, [classifications]);

  useEffect(() => {
    const validGroupIds = new Set(jobGroups.map(g => g.id));
    setSelectedGroupIds(prev => prev.filter(id => validGroupIds.has(id)));
  }, [jobGroups]);

  const filteredGroups = jobGroups.filter(g =>
    g.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.requiredDegree.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const uniqueJobGroupLabels = Array.from(new Set(classifications.map(c => c.jobGroup).filter(Boolean)));

  const duplicateIndex = React.useMemo(
    () => buildDuplicateIndex(classifications, (c) => c.personnelCode, (c) => c.nationalId),
    [classifications]
  );

  const filteredClassifications = classifications.filter(c => {
    const term = toEnglishDigits(searchTerm).toLowerCase();
    const matchesSearch =
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(term) ||
      toEnglishDigits(c.personnelCode).toLowerCase().includes(term) ||
      toEnglishDigits(c.nationalId).includes(term) ||
      c.workLocation.toLowerCase().includes(term) ||
      c.department.toLowerCase().includes(term) ||
      c.jobTitle.toLowerCase().includes(term) ||
      c.position.toLowerCase().includes(term) ||
      c.jobGroup.toLowerCase().includes(term);
    const matchesGroup = filterGroup === 'all' || c.jobGroup === filterGroup;
    const matchesDup = !onlyDuplicates || duplicateIndex.isDuplicateRow(c);
    return matchesSearch && matchesGroup && matchesDup;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterGroup, onlyDuplicates, subTab]);

  const totalPages = Math.max(1, Math.ceil(filteredClassifications.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedClassifications = React.useMemo(
    () => filteredClassifications.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredClassifications, safePage, pageSize]
  );

  // Group CRUD handlers
  const handleOpenAddGroup = () => {
    setEditingGroup(null);
    setGroupFormError('');
    setGroupFormData({
      code: `گروه ${toPersianDigits(jobGroups.length + 6)}`,
      title: '',
      grade: jobGroups.length + 6,
      minBaseSalary: 150000000,
      maxBaseSalary: 250000000,
      maxKaranehCeiling: 60000000,
      requiredExperienceYears: 3,
      requiredDegree: 'کارشناسی',
      description: ''
    });
    setIsGroupFormOpen(true);
  };

  const handleOpenEditGroup = (group: JobGroup) => {
    setEditingGroup(group);
    setGroupFormError('');
    setGroupFormData({ ...group });
    setIsGroupFormOpen(true);
  };

  const handleGroupFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupFormError('');
    if (!groupFormData.code || !groupFormData.title) {
      setGroupFormError('کد گروه و عنوان رتبه شغلی الزامی است.');
      return;
    }

    const payload = {
      ...groupFormData,
      id: editingGroup ? editingGroup.id : undefined,
      grade: Number(toEnglishDigits(groupFormData.grade)) || 1,
      minBaseSalary: Number(toEnglishDigits(groupFormData.minBaseSalary)) || 0,
      maxBaseSalary: Number(toEnglishDigits(groupFormData.maxBaseSalary)) || 0,
      maxKaranehCeiling: Number(toEnglishDigits(groupFormData.maxKaranehCeiling)) || 0,
      requiredExperienceYears: Number(toEnglishDigits(groupFormData.requiredExperienceYears)) || 0,
    };

    const success = await onSaveJobGroup(payload);
    if (success) setIsGroupFormOpen(false);
  };

  // Classification CRUD handlers
  const handleOpenAddClass = () => {
    setEditingClass(null);
    setClassFormError('');
    setClassFormData({ ...EMPTY_CLASSIFICATION });
    setIsClassFormOpen(true);
  };

  const handleOpenEditClass = (rec: JobClassificationRecord) => {
    setEditingClass(rec);
    setClassFormError('');
    setClassFormData({ ...rec });
    setIsClassFormOpen(true);
  };

  const handleAutoFillFromPersonnel = (code: string) => {
    const p = personnelList.find(item => item.personnelCode === code);
    if (!p) {
      setClassFormData(prev => ({ ...prev, personnelCode: code }));
      return;
    }
    setClassFormData(prev => ({
      ...prev,
      personnelCode: p.personnelCode,
      firstName: p.firstName,
      lastName: p.lastName,
      department: p.department,
      nationalId: p.nationalId,
      education: p.education,
      hireDate: p.hireDate,
      position: p.position,
      jobGroup: p.jobGroupName ? p.jobGroupName.split(' - ')[0] : (prev.jobGroup || '')
    }));
  };

  const handleClassFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassFormError('');
    if (!classFormData.personnelCode) {
      setClassFormError('کد پرسنلی الزامی است.');
      return;
    }

    const payload: Partial<JobClassificationRecord> = {
      ...classFormData,
      id: editingClass ? editingClass.id : undefined,
      personnelCode: toEnglishDigits(classFormData.personnelCode || '').trim(),
      nationalId: toEnglishDigits(classFormData.nationalId || '').trim(),
      hireDate: toEnglishDigits(classFormData.hireDate || '').trim(),
    };

    const success = await onSaveClassification(payload);
    if (success) setIsClassFormOpen(false);
  };

  const handleSmartClassificationsImport = async (mappedRows: Record<string, any>[]) => {
    if (mappedRows.length === 0) return;
    const success = await onBatchImportClassifications(mappedRows);
    if (success) {
      setSubTab('classifications');
      setSearchTerm('');
      setFilterGroup('all');
      setOnlyDuplicates(false);
      setIsImportOpen(false);
    }
  };

  const handleConfirmDeleteAllClassifications = async () => {
    if (!onDeleteAllClassifications) return;
    setBatchClassDeleting(true);
    const ok = await onDeleteAllClassifications();
    setBatchClassDeleting(false);
    if (ok) {
      setSelectedClassIds([]);
      setConfirmDeleteAllClass(false);
    }
  };

  const handleConfirmDeleteAllJobGroups = async () => {
    if (!onDeleteAllJobGroups) return;
    setBatchGroupDeleting(true);
    const ok = await onDeleteAllJobGroups();
    setBatchGroupDeleting(false);
    if (ok) {
      setSelectedGroupIds([]);
      setConfirmDeleteAllGroups(false);
    }
  };

  const filteredClassIds = filteredClassifications.map(c => c.id);
  const allClassSelected = filteredClassIds.length > 0 && filteredClassIds.every(id => selectedClassIds.includes(id));

  const toggleSelectAllClass = () => {
    if (allClassSelected) {
      setSelectedClassIds(prev => prev.filter(id => !filteredClassIds.includes(id)));
    } else {
      setSelectedClassIds(prev => Array.from(new Set([...prev, ...filteredClassIds])));
    }
  };

  const toggleSelectOneClass = (id: string) => {
    setSelectedClassIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleConfirmBatchClassDelete = async () => {
    if (selectedClassIds.length === 0) return;
    setBatchClassDeleting(true);
    const ok = await onBatchDeleteClassifications(selectedClassIds);
    setBatchClassDeleting(false);
    if (ok) {
      setSelectedClassIds([]);
      setConfirmBatchClassDelete(false);
    }
  };

  const filteredGroupIds = filteredGroups.map(g => g.id);
  const allGroupsSelected = filteredGroupIds.length > 0 && filteredGroupIds.every(id => selectedGroupIds.includes(id));

  const toggleSelectAllGroups = () => {
    if (allGroupsSelected) {
      setSelectedGroupIds(prev => prev.filter(id => !filteredGroupIds.includes(id)));
    } else {
      setSelectedGroupIds(prev => Array.from(new Set([...prev, ...filteredGroupIds])));
    }
  };

  const toggleSelectOneGroup = (id: string) => {
    setSelectedGroupIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleConfirmBatchGroupDelete = async () => {
    if (selectedGroupIds.length === 0) return;
    setBatchGroupDeleting(true);
    const ok = await onBatchDeleteJobGroups(selectedGroupIds);
    setBatchGroupDeleting(false);
    if (ok) {
      setSelectedGroupIds([]);
      setConfirmBatchGroupDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              سامانه طبقه‌بندی مشاغل و رتبه‌بندی گروه‌های شغلی
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            جدول کامل ۱۸ ستونی سوابق بیمه‌ای، سابقه معدنی/غیرمعدنی، فاصله گروه و مدیریت رتبه‌های شغلی به همراه خروجی و ورودی اکسل
          </p>
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
          {subTab === 'classifications' ? (
            <>
              {allowExport && (
                <button
                  onClick={() => exportJobClassificationsToExcel(filteredClassifications)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="persian-num">خروجی اکسل ({toPersianDigits(filteredClassifications.length)})</span>
                </button>
              )}
              {allowImport && (
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>آپلود هوشمند اکسل طبقه‌بندی</span>
                </button>
              )}
              <button
                onClick={downloadJobClassificationsTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>فایل نمونه اکسل</span>
              </button>
              {allowDeleteAll && onDeleteAllClassifications && classifications.length > 0 && (
                <button
                  onClick={() => setConfirmDeleteAllClass(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف کل جدول طبقه‌بندی</span>
                </button>
              )}
              {canCreate && (
                <button
                  onClick={handleOpenAddClass}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت ردیف طبقه‌بندی</span>
                </button>
              )}
            </>
          ) : (
            <>
              {allowDeleteAll && onDeleteAllJobGroups && jobGroups.length > 0 && (
                <button
                  onClick={() => setConfirmDeleteAllGroups(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف کل گروه‌های شغلی</span>
                </button>
              )}
              {canCreate && (
                <button
                  onClick={handleOpenAddGroup}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>تعریف رتبه شغلی جدید</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={() => setSubTab('classifications')}
          className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all persian-num ${
            subTab === 'classifications'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>جدول طبقه‌بندی مشاغل پرسنل ({toPersianDigits(classifications.length)})</span>
        </button>
        <button
          onClick={() => setSubTab('groups')}
          className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all persian-num ${
            subTab === 'groups'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>تعریف پایه‌ها و سقف گروه‌های شغلی ({toPersianDigits(jobGroups.length)})</span>
        </button>
      </div>

      {/* Duplicate Warning Banner */}
      {subTab === 'classifications' && duplicateIndex.totalDuplicateRows > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="persian-num">
              <span className="font-bold">هشدار اطلاعات تکراری در جدول طبقه‌بندی مشاغل:</span>{' '}
              <span>
                <b>{toPersianDigits(duplicateIndex.totalDuplicateRows)} ردیف</b> دارای اطلاعات تکراری هستند
                ({toPersianDigits(duplicateIndex.dupCodeCount)} کد پرسنلی تکراری و {toPersianDigits(duplicateIndex.dupNationalIdCount)} کد ملی تکراری).
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOnlyDuplicates((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors shrink-0 cursor-pointer persian-num ${
              onlyDuplicates
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
            }`}
          >
            {onlyDuplicates
              ? 'نمایش همه رکوردها'
              : `مشاهده فقط تکراری‌ها (${toPersianDigits(duplicateIndex.totalDuplicateRows)})`}
          </button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className={subTab === 'classifications' ? 'md:col-span-6 relative' : 'md:col-span-12 relative'}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              subTab === 'classifications'
                ? 'جستجو در جدول طبقه‌بندی (کد پرسنلی، نام، کد ملی، محل خدمت، واحد، شغل، پست، گروه شغلی)...'
                : 'جستجو بر اساس عنوان گروه شغلی یا شرایط احراز...'
            }
            className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 persian-num"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-2.5" />
        </div>

        {subTab === 'classifications' && (
          <>
            <div className="md:col-span-4">
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 persian-num"
              >
                <option value="all">همه گروه‌های شغلی</option>
                {uniqueJobGroupLabels.map(g => (
                  <option key={g} value={g}>{toPersianDigits(g)}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center">
              <button
                type="button"
                onClick={() => setOnlyDuplicates((prev) => !prev)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer persian-num ${
                  onlyDuplicates
                    ? 'bg-amber-600 text-white border-amber-700'
                    : duplicateIndex.totalDuplicateRows > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>فقط تکراری‌ها ({toPersianDigits(duplicateIndex.totalDuplicateRows)})</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* TAB 1: 18-Column Classification Table */}
      {subTab === 'classifications' && (
        <div className="space-y-4">
          {canDelete && selectedClassIds.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
                <CheckSquare className="w-4 h-4 text-rose-600" />
                <span>{toPersianDigits(selectedClassIds.length)} ردیف طبقه‌بندی شغلی انتخاب شده است</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedClassIds([])}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold"
                >
                  لغو انتخاب
                </button>
                <button
                  onClick={() => setConfirmBatchClassDelete(true)}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs persian-num"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف انتخاب‌شده‌ها ({toPersianDigits(selectedClassIds.length)})</span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="responsive-table-container">
            <table className="w-full text-right text-xs min-w-[1750px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  {canDelete && (
                    <th className="py-3 px-2.5 text-center w-10">
                      <input
                        type="checkbox"
                        checked={allClassSelected}
                        onChange={toggleSelectAllClass}
                        title="انتخاب همه ردیف‌های فیلترشده"
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="py-3 px-2.5 text-center">ردیف</th>
                  <th className="py-3 px-2.5">کد پرسنلی</th>
                  <th className="py-3 px-2.5">نام</th>
                  <th className="py-3 px-2.5">نام خانوادگی</th>
                  <th className="py-3 px-2.5">محل خدمت</th>
                  <th className="py-3 px-2.5">واحد</th>
                  <th className="py-3 px-2.5">کد ملی</th>
                  <th className="py-3 px-2.5">مدرک تحصیلی</th>
                  <th className="py-3 px-2.5">تاریخ استخدام</th>
                  <th className="py-3 px-2.5">ماه استخدام</th>
                  <th className="py-3 px-2.5">سابقه معدنی به روز</th>
                  <th className="py-3 px-2.5">سابقه بیمه کلی</th>
                  <th className="py-3 px-2.5">سابقه معدنی</th>
                  <th className="py-3 px-2.5">سابقه غیرمعدنی</th>
                  <th className="py-3 px-2.5">گروه شغلی</th>
                  <th className="py-3 px-2.5">فاصله گروه از ۱۴۰۵ به بعد</th>
                  <th className="py-3 px-2.5">فاصله گروه بعدی</th>
                  <th className="py-3 px-2.5">شغل</th>
                  <th className="py-3 px-2.5">پست</th>
                  <th className="py-3 px-2.5 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClassifications.length === 0 ? (
                  <tr>
                    <td colSpan={canDelete ? 21 : 20} className="py-12 text-center text-slate-600">
                      رکوردی در جدول طبقه‌بندی مشاغل ثبت نشده است. از دکمه «ثبت ردیف طبقه‌بندی» یا «آپلود اکسل طبقه‌بندی» استفاده نمایید.
                    </td>
                  </tr>
                ) : (
                  paginatedClassifications.map((c, idx) => {
                    const isSelected = selectedClassIds.includes(c.id);
                    const dupReasons = duplicateIndex.getRowDuplicateReasons(c);
                    const isDup = dupReasons.length > 0;
                    return (
                    <tr
                      key={c.id}
                      className={`${
                        isSelected
                          ? 'bg-indigo-50/40'
                          : isDup
                          ? 'bg-amber-50/60 hover:bg-amber-100/50'
                          : 'hover:bg-slate-50/70'
                      } transition-colors persian-num`}
                    >
                      {canDelete && (
                        <td className="py-3 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOneClass(c.id)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3 px-2.5 text-center text-slate-500">{toPersianDigits((safePage - 1) * pageSize + idx + 1)}</td>
                      <td className="py-3 px-2.5 font-bold text-indigo-700">
                        <div>{toPersianDigits(c.personnelCode)}</div>
                        {dupReasons.includes('personnelCode') && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 text-[10px] font-bold">
                            تکراری: کد پرسنلی
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2.5 font-bold text-slate-900">{c.firstName}</td>
                      <td className="py-3 px-2.5 font-bold text-slate-900">{c.lastName}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.workLocation)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{c.department}</td>
                      <td className="py-3 px-2.5 text-slate-700">
                        <div>{toPersianDigits(c.nationalId)}</div>
                        {dupReasons.includes('nationalId') && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            تکراری: کد ملی
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2.5 text-slate-700">{c.education}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.hireDate)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{c.hireMonth}</td>
                      <td className="py-3 px-2.5 text-slate-800 font-semibold">{toPersianDigits(c.miningExperienceDays)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.totalInsuranceHistory)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.miningExperience)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.nonMiningExperience)}</td>
                      <td className="py-3 px-2.5 font-bold text-indigo-700">{toPersianDigits(c.jobGroup)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.groupGapFrom1405)}</td>
                      <td className="py-3 px-2.5 text-slate-700">{toPersianDigits(c.nextGroupGap)}</td>
                      <td className="py-3 px-2.5 text-slate-800 font-medium">{c.jobTitle}</td>
                      <td className="py-3 px-2.5 text-slate-800 font-medium">{c.position}</td>
                      <td className="py-3 px-2.5 text-center">
                        {(canEdit || canDelete) && (
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => handleOpenEditClass(c)}
                                className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                title="ویرایش"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setDeleteClassTarget(c)}
                                className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={safePage}
            totalItems={filteredClassifications.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
        </div>
      )}

      {/* TAB 2: Job Groups Definitions */}
      {subTab === 'groups' && (
        <div className="space-y-4">
          {canDelete && filteredGroups.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none persian-num">
                <input
                  type="checkbox"
                  checked={allGroupsSelected}
                  onChange={toggleSelectAllGroups}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
                <span>انتخاب همه رتبه‌های شغلی ({toPersianDigits(filteredGroups.length)} مورد)</span>
              </label>

              {selectedGroupIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedGroupIds([])}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold"
                  >
                    لغو انتخاب
                  </button>
                  <button
                    onClick={() => setConfirmBatchGroupDelete(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs persian-num"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف رتبه‌های انتخاب‌شده ({toPersianDigits(selectedGroupIds.length)})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredGroups.map((group) => {
              const isGroupSelected = selectedGroupIds.includes(group.id);
              return (
              <div
                key={group.id}
                className={`rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                  isGroupSelected
                    ? 'bg-indigo-50/40 border-indigo-400 ring-1 ring-indigo-300'
                    : 'bg-white border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {canDelete && (
                        <input
                          type="checkbox"
                          checked={isGroupSelected}
                          onChange={() => toggleSelectOneGroup(group.id)}
                          className="w-4 h-4 rounded text-indigo-600 cursor-pointer shrink-0"
                        />
                      )}
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs persian-num">
                        {toPersianDigits(group.grade)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-sm block persian-num">{toPersianDigits(group.code)}</span>
                        <span className="text-xs text-slate-600 block">{group.title}</span>
                      </div>
                    </div>

                    {(canEdit || canDelete) && (
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEditGroup(group)}
                            title="ویرایش رتبه"
                            className="p-1 text-slate-400 hover:text-amber-600 rounded-md"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteGroupTarget(group)}
                            title="حذف رتبه"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-xs py-3 border-y border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">پایه حقوق سازمانی:</span>
                      <span className="font-semibold text-slate-800 persian-num">
                        {formatRial(group.minBaseSalary, false)} تا {formatRial(group.maxBaseSalary)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">سقف مجاز کارانه ماهانه:</span>
                      <span className="font-bold text-indigo-700 persian-num">{formatRial(group.maxKaranehCeiling)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        حداقل سابقه کار:
                      </span>
                      <span className="font-semibold text-slate-800 persian-num">
                        {toPersianDigits(group.requiredExperienceYears)} سال
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 flex items-center gap-1">
                        <GraduationCap className="w-3 h-3 text-slate-400" />
                        مدرک تحصیلی:
                      </span>
                      <span className="font-semibold text-slate-800">{group.requiredDegree}</span>
                    </div>
                  </div>

                  {group.description && (
                    <p className="mt-3 text-[11px] text-slate-600 leading-relaxed">{group.description}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                  <span>رتبه رسمی در چارت</span>
                  <span className="font-bold text-slate-700 persian-num">رتبه {toPersianDigits(group.grade)}</span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Add/Edit 18-Column Classification Record */}
      {isClassFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm sm:text-base">
                  {editingClass ? `ویرایش طبقه‌بندی شغلی (${classFormData.firstName} ${classFormData.lastName})` : 'ثبت ردیف طبقه‌بندی مشاغل پرسنل'}
                </h3>
              </div>
              <button onClick={() => setIsClassFormOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleClassFormSubmit} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {classFormError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{classFormError}</span>
                </div>
              )}

              {!editingClass && personnelList.length > 0 && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                  <label className="block font-bold text-indigo-950 mb-1">تکمیل خودکار از لیست پرسنل موجود:</label>
                  <select
                    value={classFormData.personnelCode}
                    onChange={(e) => handleAutoFillFromPersonnel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-slate-900 persian-num"
                  >
                    <option value="">-- انتخاب پرسنل جهت پر کردن خودکار مشخصات --</option>
                    {personnelList.map(p => (
                      <option key={p.id} value={p.personnelCode}>
                        {toPersianDigits(p.personnelCode)} - {p.fullName} ({p.department})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {[
                  { key: 'personnelCode', label: 'کد پرسنلی *', persianNum: true, required: true },
                  { key: 'firstName', label: 'نام', persianNum: false },
                  { key: 'lastName', label: 'نام خانوادگی', persianNum: false },
                  { key: 'workLocation', label: 'محل خدمت', persianNum: false },
                  { key: 'department', label: 'واحد', persianNum: false },
                  { key: 'nationalId', label: 'کد ملی', persianNum: true },
                  { key: 'education', label: 'مدرک تحصیلی', persianNum: false },
                  { key: 'hireDate', label: 'تاریخ استخدام', persianNum: true },
                  { key: 'hireMonth', label: 'ماه استخدام', persianNum: false },
                  { key: 'miningExperienceDays', label: 'سابقه معدنی به روز', persianNum: true },
                  { key: 'totalInsuranceHistory', label: 'سابقه بیمه کلی', persianNum: true },
                  { key: 'miningExperience', label: 'سابقه معدنی', persianNum: true },
                  { key: 'nonMiningExperience', label: 'سابقه غیرمعدنی', persianNum: true },
                  { key: 'jobGroup', label: 'گروه شغلی', persianNum: true },
                  { key: 'groupGapFrom1405', label: 'فاصله گروه از ۱۴۰۵ به بعد', persianNum: true },
                  { key: 'nextGroupGap', label: 'فاصله گروه بعدی', persianNum: true },
                  { key: 'jobTitle', label: 'شغل', persianNum: false },
                  { key: 'position', label: 'پست', persianNum: false },
                ].map(field => (
                  <div key={field.key}>
                    <label className="block font-semibold text-slate-700 mb-1">{field.label}</label>
                    <input
                      type="text"
                      required={field.required}
                      value={
                        field.persianNum
                          ? toPersianDigits((classFormData as any)[field.key] || '')
                          : ((classFormData as any)[field.key] || '')
                      }
                      onChange={(e) =>
                        setClassFormData({
                          ...classFormData,
                          [field.key]: field.persianNum ? toEnglishDigits(e.target.value) : e.target.value
                        })
                      }
                      className={`w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 ${
                        field.persianNum ? 'persian-num' : ''
                      }`}
                    />
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClassFormOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm"
                >
                  ذخیره در جدول طبقه‌بندی
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Excel Import Modal for 18-Column Classifications */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden my-6 p-5 max-h-[92vh] overflow-y-auto">
            <SmartExcelImportMapper
              moduleType="jobClassifications"
              title="ورود هوشمند فایل اکسل طبقه‌بندی مشاغل معدنی (۱۸ ستون)"
              subtitle="تطبیق خودکار ستون‌های سابقه بیمه‌ای، سابقه معدنی و غیرمعدنی، فاصله گروه شغلی و مشخصات پرسنل با هر ساختار فایل اکسل"
              onDownloadTemplate={downloadJobClassificationsTemplate}
              templateLabel="دانلود نمونه اکسل طبقه‌بندی"
              onImport={handleSmartClassificationsImport}
              onCancel={() => setIsImportOpen(false)}
              accentColor="violet"
              confirmLabel="تأیید و ثبت در جدول طبقه‌بندی"
            />
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Job Group Definition */}
      {isGroupFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-8">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingGroup ? `ویرایش ${groupFormData.code}` : 'تعریف گروه شغلی و رتبه‌بندی جدید'}
                </h3>
              </div>
              <button onClick={() => setIsGroupFormOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGroupFormSubmit} className="p-6 space-y-4 text-xs">
              {groupFormError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{groupFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">کد گروه شغلی *</label>
                  <input
                    type="text"
                    required
                    value={groupFormData.code}
                    onChange={(e) => setGroupFormData({ ...groupFormData, code: e.target.value })}
                    placeholder="گروه ۱۴"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">رتبه عددی (۱ تا ۲۰) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={toPersianDigits(groupFormData.grade ?? '')}
                    onChange={(e) => {
                      const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setGroupFormData({ ...groupFormData, grade: Number(clean || 1) });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">عنوان سازمانی رتبه *</label>
                <input
                  type="text"
                  required
                  value={groupFormData.title}
                  onChange={(e) => setGroupFormData({ ...groupFormData, title: e.target.value })}
                  placeholder="کارشناسان مسئول و سرپرستان"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">حداقل پایه حقوق (ریال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={toPersianDigits(groupFormData.minBaseSalary ?? '')}
                    onChange={(e) => {
                      const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setGroupFormData({ ...groupFormData, minBaseSalary: Number(clean || 0) });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                  <span className="text-[11px] text-slate-600 mt-1 block persian-num">
                    {formatRial(groupFormData.minBaseSalary)}
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">حداکثر پایه حقوق (ریال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={toPersianDigits(groupFormData.maxBaseSalary ?? '')}
                    onChange={(e) => {
                      const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setGroupFormData({ ...groupFormData, maxBaseSalary: Number(clean || 0) });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                  <span className="text-[11px] text-slate-600 mt-1 block persian-num">
                    {formatRial(groupFormData.maxBaseSalary)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">سقف کارانه مجاز ماهانه (ریال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={toPersianDigits(groupFormData.maxKaranehCeiling ?? '')}
                    onChange={(e) => {
                      const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setGroupFormData({ ...groupFormData, maxKaranehCeiling: Number(clean || 0) });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                  <span className="text-[11px] text-indigo-700 mt-1 block font-bold persian-num">
                    {formatRial(groupFormData.maxKaranehCeiling)}
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">حداقل سابقه کار (سال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={toPersianDigits(groupFormData.requiredExperienceYears ?? '')}
                    onChange={(e) => {
                      const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setGroupFormData({ ...groupFormData, requiredExperienceYears: Number(clean || 0) });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">مدرک تحصیلی مورد نیاز</label>
                <input
                  type="text"
                  value={groupFormData.requiredDegree}
                  onChange={(e) => setGroupFormData({ ...groupFormData, requiredDegree: e.target.value })}
                  placeholder="کارشناسی یا کارشناسی ارشد رشته‌های مرتبط"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">شرح وظایف و شرایط احراز</label>
                <textarea
                  rows={2}
                  value={groupFormData.description || ''}
                  onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsGroupFormOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm"
                >
                  ذخیره رتبه شغلی
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmations */}
      {deleteGroupTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">تأیید حذف گروه شغلی</h3>
            <p className="text-slate-600">
              آیا از حذف گروه شغلی «{deleteGroupTarget.code} - {deleteGroupTarget.title}» اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteGroupTarget(null)} className="px-4 py-2 border border-slate-200 rounded-xl font-bold">انصراف</button>
              <button
                onClick={async () => {
                  await onDeleteJobGroup(deleteGroupTarget.id);
                  setDeleteGroupTarget(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold"
              >
                حذف قطعی
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteClassTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">تأیید حذف ردیف طبقه‌بندی</h3>
            <p className="text-slate-600 persian-num">
              آیا از حذف رکورد طبقه‌بندی پرسنل <b>{deleteClassTarget.firstName} {deleteClassTarget.lastName}</b> (کد: {toPersianDigits(deleteClassTarget.personnelCode)}) اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteClassTarget(null)} className="px-4 py-2 border border-slate-200 rounded-xl font-bold">انصراف</button>
              <button
                onClick={async () => {
                  await onDeleteClassification(deleteClassTarget.id);
                  setDeleteClassTarget(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold"
              >
                حذف قطعی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation: Classifications */}
      {confirmBatchClassDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">تأیید حذف گروهی ردیف‌های طبقه‌بندی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedClassIds.length)} ردیف طبقه‌بندی شغلی</b> انتخاب‌شده اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmBatchClassDelete(false)}
                disabled={batchClassDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmBatchClassDelete}
                disabled={batchClassDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50 persian-num"
              >
                {batchClassDeleting ? 'در حال حذف...' : `بله، حذف ${toPersianDigits(selectedClassIds.length)} ردیف`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation: Job Groups */}
      {confirmBatchGroupDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">تأیید حذف گروهی رتبه‌های شغلی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedGroupIds.length)} رتبه/گروه شغلی</b> انتخاب‌شده اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmBatchGroupDelete(false)}
                disabled={batchGroupDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmBatchGroupDelete}
                disabled={batchGroupDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50 persian-num"
              >
                {batchGroupDeleting ? 'در حال حذف...' : `بله، حذف ${toPersianDigits(selectedGroupIds.length)} گروه`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Classifications Confirmation Modal */}
      {confirmDeleteAllClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">حذف کامل جدول طبقه‌بندی مشاغل (۱۸ ستون)</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی تمامی <b>{toPersianDigits(classifications.length)} ردیف طبقه‌بندی مشاغل</b> از پایگاه داده اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteAllClass(false)}
                disabled={batchClassDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteAllClassifications}
                disabled={batchClassDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchClassDeleting ? 'در حال پاکسازی...' : 'بله، جدول طبقه‌بندی پاک شود'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Job Groups Confirmation Modal */}
      {confirmDeleteAllGroups && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">حذف کامل رتبه‌ها و گروه‌های شغلی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی تمامی <b>{toPersianDigits(jobGroups.length)} گروه شغلی</b> ثبت‌شده اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteAllGroups(false)}
                disabled={batchGroupDeleting}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteAllJobGroups}
                disabled={batchGroupDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {batchGroupDeleting ? 'در حال پاکسازی...' : 'بله، همه گروه‌ها پاک شوند'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
