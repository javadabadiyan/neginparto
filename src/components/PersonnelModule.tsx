import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Download,
  Upload,
  Edit2,
  Trash2,
  Eye,
  AlertCircle,
  X,
  Building,
  Image as ImageIcon,
  FileText,
  UserPlus,
  Heart,
  ZoomIn,
  CheckSquare,
  Columns,
  HeartHandshake
} from 'lucide-react';
import {
  Personnel,
  JobGroup,
  EmploymentType,
  EmploymentStatus,
  GranularPersonnelPermissions,
  PersonnelDocuments,
  PersonnelChildDoc,
  PersonnelRelative
} from '../types';
import { formatRial, toPersianDigits, toEnglishDigits } from '../utils/persian';
import {
  exportPersonnelToExcel,
  downloadPersonnelTemplate
} from '../utils/excel';
import { readAndCompressDocument } from '../utils/image';
import { SmartExcelImportMapper } from './SmartExcelImportMapper';
import { PersonnelRelativesTab } from './PersonnelRelativesTab';

interface PersonnelModuleProps {
  personnelList: Personnel[];
  jobGroups: JobGroup[];
  onSavePersonnel: (personnel: Partial<Personnel>) => Promise<boolean>;
  onDeletePersonnel: (id: string) => Promise<boolean>;
  onBatchDeletePersonnel: (ids: string[]) => Promise<boolean>;
  onDeleteAllPersonnel?: () => Promise<boolean>;
  onBatchImportPersonnel: (items: any[]) => Promise<boolean>;
  onBatchImportRelatives?: (items: any[]) => Promise<boolean>;
  onDeleteAllRelatives?: () => Promise<boolean>;
  canManage?: boolean;
  canExport?: boolean;
  canImport?: boolean;
  granularPermissions?: GranularPersonnelPermissions;
}

const EMPTY_DOCS: PersonnelDocuments = {
  nationalCardImage: '',
  shenasnamehPages: [],
  maritalStatus: 'مجرد',
  spouseName: '',
  spouseShenasnamehPages: [],
  children: []
};

export const PersonnelModule: React.FC<PersonnelModuleProps> = ({
  personnelList,
  jobGroups,
  onSavePersonnel,
  onDeletePersonnel,
  onBatchDeletePersonnel,
  onDeleteAllPersonnel,
  onBatchImportPersonnel,
  onBatchImportRelatives,
  onDeleteAllRelatives,
  canManage = true,
  canExport = true,
  canImport = true,
  granularPermissions
}) => {
  const canCreate = granularPermissions ? granularPermissions.create : canManage;
  const canEdit = granularPermissions ? granularPermissions.edit : canManage;
  const canDelete = granularPermissions ? granularPermissions.delete : canManage;
  const allowDeleteAll = granularPermissions ? Boolean(granularPermissions.deleteAll) : false;
  const allowExport = granularPermissions ? granularPermissions.exportExcel : canExport;
  const allowImport = granularPermissions ? granularPermissions.importExcel : canImport;
  const canViewSalary = granularPermissions ? granularPermissions.viewSalary : true;
  const canManageDocs = granularPermissions?.documents ?? (canCreate || canEdit || true);

  const [activeSubTab, setActiveSubTab] = useState<'personnel' | 'relatives'>('personnel');
  const [tableViewMode, setTableViewMode] = useState<'full28' | 'compact'>('full28');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [viewingPersonnel, setViewingPersonnel] = useState<Personnel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personnel | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [confirmDeleteAllPersonnelOpen, setConfirmDeleteAllPersonnelOpen] = useState(false);
  const [deleteAllPersonnelLoading, setDeleteAllPersonnelLoading] = useState(false);
  const [previewDocImage, setPreviewDocImage] = useState<{ title: string; src: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [docUploading, setDocUploading] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);

  const totalRelativesCount = useMemo(
    () => personnelList.reduce((sum, p) => sum + (Array.isArray(p.relatives) ? p.relatives.length : 0), 0),
    [personnelList]
  );

  useEffect(() => {
    const validIds = new Set(personnelList.map(p => p.id));
    setSelectedIds(prev => prev.filter(id => validIds.has(id)));
  }, [personnelList]);

  const [formData, setFormData] = useState<Partial<Personnel>>({
    employeeId: '',
    personnelCode: '',
    firstName: '',
    lastName: '',
    fullName: '',
    fatherName: '',
    shenasnamehNumber: '',
    nationalId: '',
    nationality: 'ایرانی',
    citizenship: 'ایران',
    gender: 'مرد',
    phone: '',
    email: '',
    birthPlace: '',
    issuePlace: '',
    birthDate: '',
    issueDate: '',
    maritalStatus: 'مجرد',
    militaryStatus: '',
    education: 'کارشناسی',
    fieldOfStudy: '',
    hireDate: '1403/01/01',
    workLocation: '',
    department: 'فناوری اطلاعات',
    jobTitle: '',
    jobCode: '',
    position: '',
    positionCode: '',
    employmentType: 'رسمی',
    jobGroupId: '',
    status: 'فعال',
    baseSalary: 150000000,
    notes: '',
    documents: { ...EMPTY_DOCS },
    relatives: []
  });

  const departments = Array.from(new Set(personnelList.map(p => p.department))).filter(Boolean);

  const filteredList = personnelList.filter(p => {
    const term = toEnglishDigits(searchTerm).toLowerCase();
    const matchesSearch =
      !term ||
      p.fullName.toLowerCase().includes(term) ||
      toEnglishDigits(p.personnelCode).toLowerCase().includes(term) ||
      toEnglishDigits(p.employeeId || '').toLowerCase().includes(term) ||
      toEnglishDigits(p.nationalId).includes(term) ||
      toEnglishDigits(p.shenasnamehNumber || '').includes(term) ||
      (p.fatherName || '').toLowerCase().includes(term) ||
      (p.workLocation || '').toLowerCase().includes(term) ||
      (p.jobTitle || '').toLowerCase().includes(term) ||
      p.position.toLowerCase().includes(term) ||
      p.department.toLowerCase().includes(term);

    const matchesDept = filterDepartment === 'all' || p.department === filterDepartment;
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const handleOpenAdd = () => {
    setEditingPersonnel(null);
    setFormError('');
    const nextCode = String(10100 + personnelList.length + 1);
    setFormData({
      employeeId: `EMP-${nextCode}`,
      personnelCode: nextCode,
      firstName: '',
      lastName: '',
      fullName: '',
      fatherName: '',
      shenasnamehNumber: '',
      nationalId: '',
      nationality: 'ایرانی',
      citizenship: 'ایران',
      gender: 'مرد',
      phone: '',
      email: '',
      birthPlace: '',
      issuePlace: '',
      birthDate: '',
      issueDate: '',
      maritalStatus: 'مجرد',
      militaryStatus: 'پایان خدمت',
      education: 'کارشناسی',
      fieldOfStudy: '',
      hireDate: '1403/01/01',
      workLocation: '',
      department: departments[0] || 'استخراج و معدن‌کاری',
      jobTitle: '',
      jobCode: '',
      position: '',
      positionCode: '',
      employmentType: 'رسمی',
      jobGroupId: jobGroups[0]?.id || '',
      status: 'فعال',
      baseSalary: 180000000,
      notes: '',
      documents: { ...EMPTY_DOCS, shenasnamehPages: [], spouseShenasnamehPages: [], children: [] },
      relatives: []
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (p: Personnel) => {
    setEditingPersonnel(p);
    setFormError('');
    setFormData({
      ...p,
      maritalStatus: p.maritalStatus || p.documents?.maritalStatus || 'مجرد',
      relatives: Array.isArray(p.relatives) ? p.relatives : [],
      documents: {
        ...EMPTY_DOCS,
        ...(p.documents || {}),
        shenasnamehPages: p.documents?.shenasnamehPages || [],
        spouseShenasnamehPages: p.documents?.spouseShenasnamehPages || [],
        children: p.documents?.children || []
      }
    });
    setIsFormOpen(true);
  };

  const updateDocs = (patch: Partial<PersonnelDocuments>) => {
    setFormData(prev => ({
      ...prev,
      documents: {
        ...EMPTY_DOCS,
        ...(prev.documents || {}),
        ...patch
      }
    }));
  };

  const handleUploadNationalCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setDocUploading(true);
      const dataUrl = await readAndCompressDocument(file);
      updateDocs({ nationalCardImage: dataUrl });
    } catch (err: any) {
      setFormError(err.message || 'خطا در بارگذاری تصویر کارت ملی');
    } finally {
      setDocUploading(false);
    }
  };

  const handleUploadPages = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'self' | 'spouse'
  ) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    try {
      setDocUploading(true);
      const encoded = await Promise.all(files.map(f => readAndCompressDocument(f)));
      const docs = formData.documents || EMPTY_DOCS;
      if (target === 'self') {
        updateDocs({ shenasnamehPages: [...(docs.shenasnamehPages || []), ...encoded] });
      } else {
        updateDocs({ spouseShenasnamehPages: [...(docs.spouseShenasnamehPages || []), ...encoded] });
      }
    } catch (err: any) {
      setFormError(err.message || 'خطا در بارگذاری صفحات شناسنامه');
    } finally {
      setDocUploading(false);
    }
  };

  const handleAddChild = () => {
    const docs = formData.documents || EMPTY_DOCS;
    const newChild: PersonnelChildDoc = {
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      fullName: '',
      relation: 'پسر',
      shenasnamehPages: []
    };
    updateDocs({ children: [...(docs.children || []), newChild] });
  };

  const handleUpdateChild = (childId: string, patch: Partial<PersonnelChildDoc>) => {
    const docs = formData.documents || EMPTY_DOCS;
    updateDocs({
      children: (docs.children || []).map(ch => (ch.id === childId ? { ...ch, ...patch } : ch))
    });
  };

  const handleRemoveChild = (childId: string) => {
    const docs = formData.documents || EMPTY_DOCS;
    updateDocs({
      children: (docs.children || []).filter(ch => ch.id !== childId)
    });
  };

  const handleUploadChildPages = async (childId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    try {
      setDocUploading(true);
      const encoded = await Promise.all(files.map(f => readAndCompressDocument(f)));
      const docs = formData.documents || EMPTY_DOCS;
      const target = (docs.children || []).find(c => c.id === childId);
      handleUpdateChild(childId, {
        shenasnamehPages: [...(target?.shenasnamehPages || []), ...encoded]
      });
    } catch (err: any) {
      setFormError(err.message || 'خطا در بارگذاری شناسنامه فرزند');
    } finally {
      setDocUploading(false);
    }
  };

  const handleAddInlineRelative = () => {
    const newRel: PersonnelRelative = {
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personnelId: editingPersonnel?.id || '',
      personnelCode: formData.personnelCode || '',
      personnelName: formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
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
    };
    setFormData(prev => ({
      ...prev,
      relatives: [...(prev.relatives || []), newRel]
    }));
  };

  const handleUpdateInlineRelative = (relId: string, patch: Partial<PersonnelRelative>) => {
    setFormData(prev => ({
      ...prev,
      relatives: (prev.relatives || []).map(r => (r.id === relId ? { ...r, ...patch } : r))
    }));
  };

  const handleRemoveInlineRelative = (relId: string) => {
    setFormData(prev => ({
      ...prev,
      relatives: (prev.relatives || []).filter(r => r.id !== relId)
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const computedFullName =
      (formData.fullName || '').trim() || `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
    if (!formData.personnelCode || (!formData.firstName && !computedFullName)) {
      setFormError('لطفاً کد پرسنلی، نام و نام خانوادگی را وارد نمایید.');
      return;
    }

    const cleanCode = toEnglishDigits(formData.personnelCode).trim();
    const cleanedRelatives = (formData.relatives || [])
      .filter(r => r.fullName && r.fullName.trim().length > 0)
      .map(r => ({
        ...r,
        personnelId: editingPersonnel?.id || r.personnelId || '',
        personnelCode: cleanCode,
        personnelName: computedFullName,
        nationalId: toEnglishDigits(r.nationalId || '').trim(),
        shenasnamehNumber: toEnglishDigits(r.shenasnamehNumber || '').trim(),
        birthDate: toEnglishDigits(r.birthDate || '').trim(),
        phone: toEnglishDigits(r.phone || '').trim()
      }));

    const payload = {
      ...formData,
      id: editingPersonnel ? editingPersonnel.id : undefined,
      employeeId: toEnglishDigits(formData.employeeId || '').trim(),
      personnelCode: cleanCode,
      nationalId: toEnglishDigits(formData.nationalId || '').trim(),
      shenasnamehNumber: toEnglishDigits(formData.shenasnamehNumber || '').trim(),
      phone: toEnglishDigits(formData.phone || '').trim(),
      birthDate: toEnglishDigits(formData.birthDate || '').trim(),
      issueDate: toEnglishDigits(formData.issueDate || '').trim(),
      hireDate: toEnglishDigits(formData.hireDate || '').trim(),
      jobCode: toEnglishDigits(formData.jobCode || '').trim(),
      positionCode: toEnglishDigits(formData.positionCode || '').trim(),
      fullName: computedFullName,
      maritalStatus: formData.maritalStatus || formData.documents?.maritalStatus || 'مجرد',
      baseSalary: Number(toEnglishDigits(formData.baseSalary)) || 0,
      jobGroupName: jobGroups.find(g => g.id === formData.jobGroupId)?.title || formData.jobGroupName || '',
      relatives: cleanedRelatives
    };

    const success = await onSavePersonnel(payload);
    if (success) {
      setIsFormOpen(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await onDeletePersonnel(deleteTarget.id);
    setDeleteTarget(null);
  };

  const filteredIds = filteredList.map(p => p.id);
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
    const ok = await onBatchDeletePersonnel(selectedIds);
    setBatchDeleting(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmBatchDeleteOpen(false);
    }
  };

  const handleConfirmDeleteAllPersonnel = async () => {
    if (!onDeleteAllPersonnel) return;
    setDeleteAllPersonnelLoading(true);
    const ok = await onDeleteAllPersonnel();
    setDeleteAllPersonnelLoading(false);
    if (ok) {
      setSelectedIds([]);
      setConfirmDeleteAllPersonnelOpen(false);
    }
  };

  const countDocs = (p: Personnel) => {
    const d = p.documents;
    if (!d) return 0;
    let total = 0;
    if (d.nationalCardImage) total += 1;
    total += (d.shenasnamehPages || []).length;
    total += (d.spouseShenasnamehPages || []).length;
    (d.children || []).forEach(c => {
      total += (c.shenasnamehPages || []).length;
    });
    return total;
  };

  const docs = formData.documents || EMPTY_DOCS;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                پرونده پرسنلی، مدارک هویتی و اطلاعات کارگزینی
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              مدیریت کامل ۲۸ ستون اطلاعات هویتی و کارگزینی، آرشیو کارت ملی/شناسنامه و بانک اطلاعات بستگان و عائله
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sub-tab Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setActiveSubTab('personnel')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer persian-num ${
                  activeSubTab === 'personnel' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>پرونده پرسنل ({toPersianDigits(personnelList.length)})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('relatives')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer persian-num ${
                  activeSubTab === 'relatives' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <HeartHandshake className="w-3.5 h-3.5" />
                <span>بستگان و عائله ({toPersianDigits(totalRelativesCount)})</span>
              </button>
            </div>
          </div>
        </div>

        {activeSubTab === 'personnel' && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setTableViewMode('full28')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  tableViewMode === 'full28' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <Columns className="w-3.5 h-3.5 text-indigo-600" />
                <span>نمایش کامل ۲۸ ستون کارگزینی</span>
              </button>
              <button
                type="button"
                onClick={() => setTableViewMode('compact')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  tableViewMode === 'compact' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                نمایش فشرده
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {allowExport && (
                <>
                  <button
                    onClick={downloadPersonnelTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors border border-slate-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>فایل نمونه ۲۸ ستون</span>
                  </button>
                  <button
                    onClick={() => exportPersonnelToExcel(filteredList)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors border border-emerald-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="persian-num">خروجی اکسل ({toPersianDigits(filteredList.length)})</span>
                  </button>
                </>
              )}

              {allowImport && (
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors border border-slate-200 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>ورود هوشمند با اکسل</span>
                </button>
              )}

              {allowDeleteAll && onDeleteAllPersonnel && personnelList.length > 0 && (
                <button
                  onClick={() => setConfirmDeleteAllPersonnelOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors border border-rose-200 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>پاک کردن کل جدول</span>
                </button>
              )}

              {canCreate && (
                <button
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>تعریف پرسنل جدید</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {activeSubTab === 'relatives' ? (
        <PersonnelRelativesTab
          personnelList={personnelList}
          onSavePersonnel={onSavePersonnel}
          onBatchImportRelatives={onBatchImportRelatives}
          onDeleteAllRelatives={onDeleteAllRelatives}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          allowDeleteAll={allowDeleteAll}
          allowExport={allowExport}
          allowImport={allowImport}
        />
      ) : (
        <>

      {/* Filters & Search Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="md:col-span-6 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو بر اساس نام، کد پرسنلی، کد ملی، پست یا واحد..."
            className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white persian-num"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-2.5" />
        </div>

        <div className="md:col-span-3">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 persian-num"
          >
            <option value="all">همه واحدهای سازمانی ({toPersianDigits(departments.length)})</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="فعال">فقط فعال</option>
            <option value="مرخصی">در حال مرخصی</option>
            <option value="ماموریت">در ماموریت</option>
            <option value="قطع همکاری">قطع همکاری</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {canDelete && selectedIds.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900 persian-num">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <span>{toPersianDigits(selectedIds.length)} پرونده پرسنلی انتخاب شده است</span>
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

      {/* Personnel Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="responsive-table-container">
          <table className={`w-full text-right text-xs ${tableViewMode === 'full28' ? 'min-w-[2950px]' : 'min-w-[960px]'}`}>
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold whitespace-nowrap">
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
                <th className="py-3 px-3 w-12 text-center">ردیف</th>
                {tableViewMode === 'full28' ? (
                  <>
                    <th className="py-3 px-3">شناسه كارمند</th>
                    <th className="py-3 px-3">كد پرسنلي</th>
                    <th className="py-3 px-3">نام</th>
                    <th className="py-3 px-3">نام خانوادگي</th>
                    <th className="py-3 px-4">نام و نام خانوادگي</th>
                    <th className="py-3 px-3">نام پدر</th>
                    <th className="py-3 px-3">شماره شناسنامه</th>
                    <th className="py-3 px-3">كد ملي</th>
                    <th className="py-3 px-3">مليت</th>
                    <th className="py-3 px-3">تابعيت</th>
                    <th className="py-3 px-3">جنسيت</th>
                    <th className="py-3 px-3">تلفن همراه</th>
                    <th className="py-3 px-3">پست الكترونيك</th>
                    <th className="py-3 px-3">محل تولد</th>
                    <th className="py-3 px-3">محل صدور</th>
                    <th className="py-3 px-3">تاريخ تولد</th>
                    <th className="py-3 px-3">تاريخ صدور</th>
                    <th className="py-3 px-3">وضعيت تاهل</th>
                    <th className="py-3 px-3">وضعيت نظام وظيفه</th>
                    <th className="py-3 px-3">مدرك تحصيلي</th>
                    <th className="py-3 px-3">رشته تحصيلي</th>
                    <th className="py-3 px-3">تاريخ استخدام</th>
                    <th className="py-3 px-3">محل خدمت</th>
                    <th className="py-3 px-3">واحد سازماني</th>
                    <th className="py-3 px-3">شغل</th>
                    <th className="py-3 px-3">كد شغل</th>
                    <th className="py-3 px-3">پست</th>
                    <th className="py-3 px-3">كد پست</th>
                  </>
                ) : (
                  <>
                    <th className="py-3 px-3">کد پرسنلی</th>
                    <th className="py-3 px-4">نام و نام خانوادگی</th>
                    <th className="py-3 px-3">کد ملی</th>
                    <th className="py-3 px-3">پست و سمت سازمانی</th>
                    <th className="py-3 px-3">محل خدمت / واحد</th>
                    <th className="py-3 px-3">تاریخ استخدام</th>
                  </>
                )}
                <th className="py-3 px-3 text-center">بستگان</th>
                <th className="py-3 px-3 text-center">مدارک هویتی</th>
                <th className="py-3 px-4">حقوق پایه (ریال)</th>
                <th className="py-3 px-3 text-center">وضعیت</th>
                <th className="py-3 px-3 text-center w-28">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={tableViewMode === 'full28' ? (canDelete ? 35 : 34) : (canDelete ? 13 : 12)} className="py-12 text-center text-slate-600">
                    پرسنلی با مشخصات جستجو شده یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredList.map((p, idx) => {
                  const docCount = countDocs(p);
                  const relCount = Array.isArray(p.relatives) ? p.relatives.length : 0;
                  const isSelected = selectedIds.includes(p.id);
                  return (
                    <tr key={p.id} className={isSelected ? 'bg-indigo-50/40 transition-colors' : 'hover:bg-slate-50/70 transition-colors'}>
                      {canDelete && (
                        <td className="py-3.5 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(p.id)}
                            className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3.5 px-3 text-center text-slate-600 persian-num">
                        {toPersianDigits(idx + 1)}
                      </td>
                      {tableViewMode === 'full28' ? (
                        <>
                          <td className="py-3.5 px-3 text-slate-700 persian-num whitespace-nowrap">{toPersianDigits(p.employeeId || '—')}</td>
                          <td className="py-3.5 px-3 font-bold text-indigo-700 persian-num whitespace-nowrap">{toPersianDigits(p.personnelCode)}</td>
                          <td className="py-3.5 px-3 text-slate-800 whitespace-nowrap">{p.firstName || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-800 whitespace-nowrap">{p.lastName || '—'}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                            <button
                              onClick={() => setViewingPersonnel(p)}
                              className="text-right hover:text-indigo-600 hover:underline transition-colors"
                            >
                              {p.fullName}
                            </button>
                          </td>
                          <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{p.fatherName || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-700 persian-num whitespace-nowrap">{toPersianDigits(p.shenasnamehNumber || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-700 persian-num whitespace-nowrap">{toPersianDigits(p.nationalId || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.nationality || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.citizenship || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.gender || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-700 persian-num whitespace-nowrap">{toPersianDigits(p.phone || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.email || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.birthPlace || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.issuePlace || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 persian-num whitespace-nowrap">{toPersianDigits(p.birthDate || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-600 persian-num whitespace-nowrap">{toPersianDigits(p.issueDate || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{p.maritalStatus || p.documents?.maritalStatus || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.militaryStatus || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{p.education || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">{p.fieldOfStudy || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 persian-num whitespace-nowrap">{toPersianDigits(p.hireDate || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{p.workLocation || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{p.department || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{p.jobTitle || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 persian-num whitespace-nowrap">{toPersianDigits(p.jobCode || '—')}</td>
                          <td className="py-3.5 px-3 text-slate-800 font-medium whitespace-nowrap">{p.position || '—'}</td>
                          <td className="py-3.5 px-3 text-slate-600 persian-num whitespace-nowrap">{toPersianDigits(p.positionCode || '—')}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-3.5 px-3 font-bold text-indigo-700 persian-num">
                            {toPersianDigits(p.personnelCode)}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <button
                              onClick={() => setViewingPersonnel(p)}
                              className="text-right hover:text-indigo-600 hover:underline transition-colors"
                            >
                              {p.fullName}
                            </button>
                          </td>
                          <td className="py-3.5 px-3 text-slate-700 persian-num">
                            {toPersianDigits(p.nationalId)}
                          </td>
                          <td className="py-3.5 px-3 text-slate-800 font-medium">
                            {p.position}
                          </td>
                          <td className="py-3.5 px-3 text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-500" />
                              {p.workLocation ? `${p.workLocation} · ${p.department}` : p.department}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-slate-600 persian-num">
                            {toPersianDigits(p.hireDate)}
                          </td>
                        </>
                      )}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold persian-num ${
                          relCount > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {toPersianDigits(relCount)} نفر
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setViewingPersonnel(p)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold persian-num ${
                            docCount > 0
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>{docCount > 0 ? `${toPersianDigits(docCount)} برگ` : 'فاقد سند'}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-700 persian-num whitespace-nowrap">
                        {canViewSalary ? formatRial(p.baseSalary) : <span className="text-slate-400 font-normal">محرمانه</span>}
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          p.status === 'فعال'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'مرخصی'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setViewingPersonnel(p)}
                            title="مشاهده پرونده و مدارک"
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(p)}
                              title="ویرایش اطلاعات و مدارک"
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(p)}
                              title="حذف پرونده"
                              className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

        <div className="px-5 py-3 bg-slate-50/90 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
          <span className="persian-num">
            نمایش <b>{toPersianDigits(filteredList.length)}</b> پرونده از مجموع <b>{toPersianDigits(personnelList.length)}</b> پرسنل
          </span>
          <span className="text-slate-500">
            پشتیبانی کامل ۲۸ ستون استاندارد کارگزینی + مدیریت بستگان + فونت استاندارد فارسی
          </span>
        </div>
      </div>

      {/* Add / Edit Personnel Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-4 max-h-[92vh] flex flex-col">
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm sm:text-base">
                  {editingPersonnel ? `ویرایش پرونده پرسنلی (${editingPersonnel.fullName})` : 'تعریف پرسنل جدید و بارگذاری مدارک'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">شناسه کارمند</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.employeeId || '')}
                    onChange={(e) => setFormData({ ...formData, employeeId: toEnglishDigits(e.target.value) })}
                    placeholder="EMP-10101"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">کد پرسنلی *</label>
                  <input
                    type="text"
                    required
                    value={toPersianDigits(formData.personnelCode || '')}
                    onChange={(e) => setFormData({ ...formData, personnelCode: toEnglishDigits(e.target.value) })}
                    placeholder="۱۰۱۰۷"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="رضا"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام خانوادگی *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="قاسمی"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام و نام خانوادگی</label>
                  <input
                    type="text"
                    value={formData.fullName || ''}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="در صورت خالی بودن از نام و فامیل ساخته می‌شود"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نام پدر</label>
                  <input
                    type="text"
                    value={formData.fatherName || ''}
                    onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">شماره شناسنامه</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.shenasnamehNumber || '')}
                    onChange={(e) => setFormData({ ...formData, shenasnamehNumber: toEnglishDigits(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">کد ملی (۱۰ رقمی)</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={toPersianDigits(formData.nationalId || '')}
                    onChange={(e) => setFormData({ ...formData, nationalId: toEnglishDigits(e.target.value) })}
                    placeholder="۰۰۱۲۳۴۵۶۷۸"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ملیت</label>
                  <input
                    type="text"
                    value={formData.nationality || ''}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                    placeholder="ایرانی"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تابعیت</label>
                  <input
                    type="text"
                    value={formData.citizenship || ''}
                    onChange={(e) => setFormData({ ...formData, citizenship: e.target.value })}
                    placeholder="ایران"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">جنسیت</label>
                  <select
                    value={formData.gender || 'مرد'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="مرد">مرد</option>
                    <option value="زن">زن</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تلفن همراه</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.phone || '')}
                    onChange={(e) => setFormData({ ...formData, phone: toEnglishDigits(e.target.value) })}
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">پست الکترونیک</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="name@company.ir"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">محل تولد</label>
                  <input
                    type="text"
                    value={formData.birthPlace || ''}
                    onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">محل صدور</label>
                  <input
                    type="text"
                    value={formData.issuePlace || ''}
                    onChange={(e) => setFormData({ ...formData, issuePlace: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاریخ تولد (شمسی)</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.birthDate || '')}
                    onChange={(e) => setFormData({ ...formData, birthDate: toEnglishDigits(e.target.value) })}
                    placeholder="۱۳۶۵/۰۴/۱۲"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاریخ صدور (شمسی)</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.issueDate || '')}
                    onChange={(e) => setFormData({ ...formData, issueDate: toEnglishDigits(e.target.value) })}
                    placeholder="۱۳۶۵/۰۴/۲۰"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وضعیت تاهل</label>
                  <select
                    value={formData.maritalStatus || 'مجرد'}
                    onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="مجرد">مجرد</option>
                    <option value="متاهل">متاهل</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وضعیت نظام وظیفه</label>
                  <input
                    type="text"
                    value={formData.militaryStatus || ''}
                    onChange={(e) => setFormData({ ...formData, militaryStatus: e.target.value })}
                    placeholder="پایان خدمت / معافیت"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">مدرک تحصیلی</label>
                  <input
                    type="text"
                    value={formData.education || ''}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    placeholder="کارشناسی / کارشناسی ارشد"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">رشته تحصیلی</label>
                  <input
                    type="text"
                    value={formData.fieldOfStudy || ''}
                    onChange={(e) => setFormData({ ...formData, fieldOfStudy: e.target.value })}
                    placeholder="مهندسی معدن / مکانیک"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاریخ استخدام (شمسی)</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.hireDate || '')}
                    onChange={(e) => setFormData({ ...formData, hireDate: toEnglishDigits(e.target.value) })}
                    placeholder="۱۴۰۲/۰۵/۱۰"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">محل خدمت</label>
                  <input
                    type="text"
                    value={formData.workLocation || ''}
                    onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })}
                    placeholder="مجتمع معدنی شماره ۱"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">واحد سازمانی *</label>
                  <input
                    type="text"
                    required
                    value={formData.department || ''}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="استخراج و معدن‌کاری"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">شغل</label>
                  <input
                    type="text"
                    value={formData.jobTitle || ''}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    placeholder="مهندس معدن / مکانیک"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">کد شغل</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.jobCode || '')}
                    onChange={(e) => setFormData({ ...formData, jobCode: toEnglishDigits(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">پست سازمانی *</label>
                  <input
                    type="text"
                    required
                    value={formData.position || ''}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="سرپرست تعمیرگاه"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">کد پست</label>
                  <input
                    type="text"
                    value={toPersianDigits(formData.positionCode || '')}
                    onChange={(e) => setFormData({ ...formData, positionCode: toEnglishDigits(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نوع استخدام</label>
                  <select
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value as EmploymentType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="رسمی">رسمی قطعی</option>
                    <option value="پیمانی">پیمانی</option>
                    <option value="قراردادی">قراردادی کار معین</option>
                    <option value="شرکتی">شرکتی / برون‌سپاری</option>
                    <option value="طرحی">طرحی / موقت</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">گروه شغلی و رتبه‌بندی</label>
                  <select
                    value={formData.jobGroupId}
                    onChange={(e) => setFormData({ ...formData, jobGroupId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="">انتخاب گروه شغلی</option>
                    {jobGroups.map((jg) => (
                      <option key={jg.id} value={jg.id}>
                        {jg.code} - {jg.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وضعیت همکاری</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as EmploymentStatus })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="فعال">فعال</option>
                    <option value="مرخصی">مرخصی</option>
                    <option value="ماموریت">ماموریت</option>
                    <option value="قطع همکاری">قطع همکاری</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">حقوق پایه ماهانه (ریال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={toPersianDigits(formData.baseSalary ?? '')}
                    onChange={(e) => {
                      const clean = toEnglishDigits(e.target.value).replace(/[^\d]/g, '');
                      setFormData({ ...formData, baseSalary: Number(clean || 0) });
                    }}
                    placeholder="۱۸۰۰۰۰۰۰۰"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num font-bold"
                  />
                  <span className="text-[11px] text-slate-600 mt-1 block persian-num">
                    معادل: {formatRial(formData.baseSalary)}
                  </span>
                </div>
              </div>

              {/* بخش مدارک هویتی پرسنل و خانواده (کارت ملی + شناسنامه + همسر و فرزندان) */}
              {canManageDocs && (
                <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-2xl p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-200/60">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-indigo-950 text-xs sm:text-sm">
                        آرشیو مدارک هویتی (کارت ملی و صفحات شناسنامه پرسنل و خانواده)
                      </h4>
                    </div>
                    {docUploading && (
                      <span className="text-[11px] font-bold text-indigo-600 animate-pulse">
                        در حال بهینه‌سازی و بارگذاری تصویر...
                      </span>
                    )}
                  </div>

                  {/* کارت ملی و صفحات شناسنامه خود پرسنل */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* کارت ملی */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">تصویر کارت ملی پرسنل</span>
                        <label className="cursor-pointer px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold">
                          انتخاب فایل
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleUploadNationalCard}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {docs.nationalCardImage ? (
                        <div className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          {docs.nationalCardImage.startsWith('data:image') ? (
                            <img
                              src={docs.nationalCardImage}
                              alt="کارت ملی"
                              className="w-full h-32 object-cover cursor-pointer"
                              onClick={() => setPreviewDocImage({ title: 'کارت ملی پرسنل', src: docs.nationalCardImage! })}
                            />
                          ) : (
                            <div className="p-4 text-center text-indigo-700 font-bold">فایل PDF کارت ملی بارگذاری شد</div>
                          )}
                          <button
                            type="button"
                            onClick={() => updateDocs({ nationalCardImage: '' })}
                            className="absolute top-1.5 left-1.5 p-1 bg-red-600 text-white rounded-md shadow-xs"
                            title="حذف تصویر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                          تصویر کارت ملی بارگذاری نشده است
                        </div>
                      )}
                    </div>

                    {/* صفحات شناسنامه خود پرسنل */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 persian-num">
                          صفحات شناسنامه پرسنل ({toPersianDigits((docs.shenasnamehPages || []).length)} صفحه)
                        </span>
                        <label className="cursor-pointer px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold">
                          افزودن صفحات
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            onChange={(e) => handleUploadPages(e, 'self')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {(docs.shenasnamehPages || []).length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {(docs.shenasnamehPages || []).map((img, i) => (
                            <div key={i} className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 h-20">
                              {img.startsWith('data:image') ? (
                                <img
                                  src={img}
                                  alt={`صفحه ${i + 1}`}
                                  className="w-full h-full object-cover cursor-pointer"
                                  onClick={() => setPreviewDocImage({ title: `شناسنامه پرسنل - صفحه ${toPersianDigits(i + 1)}`, src: img })}
                                />
                              ) : (
                                <div className="h-full flex items-center justify-center text-[10px] font-bold text-indigo-700">PDF</div>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  updateDocs({
                                    shenasnamehPages: (docs.shenasnamehPages || []).filter((_, idx) => idx !== i)
                                  })
                                }
                                className="absolute top-1 left-1 p-0.5 bg-red-600 text-white rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                          صفحات شناسنامه خود پرسنل (امکان انتخاب چند صفحه همزمان)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* وضعیت تاهل و مدارک همسر و فرزندان */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <Heart className="w-4 h-4 text-rose-500" />
                        <span>وضعیت تاهل و پرونده خانواده (همسر و فرزندان):</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateDocs({ maritalStatus: 'مجرد' })}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                            docs.maritalStatus !== 'متاهل'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          مجرد
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDocs({ maritalStatus: 'متاهل' })}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                            docs.maritalStatus === 'متاهل'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          متاهل (ثبت مدارک همسر و فرزندان)
                        </button>
                      </div>
                    </div>

                    {docs.maritalStatus === 'متاهل' && (
                      <div className="pt-3 border-t border-slate-100 space-y-4">
                        {/* همسر */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">نام و نام خانوادگی همسر</label>
                            <input
                              type="text"
                              value={docs.spouseName || ''}
                              onChange={(e) => updateDocs({ spouseName: e.target.value })}
                              placeholder="نام کامل همسر"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-700 persian-num">
                                صفحات شناسنامه همسر ({toPersianDigits((docs.spouseShenasnamehPages || []).length)})
                              </span>
                              <label className="cursor-pointer px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold">
                                بارگذاری صفحات همسر
                                <input
                                  type="file"
                                  accept="image/*,.pdf"
                                  multiple
                                  onChange={(e) => handleUploadPages(e, 'spouse')}
                                  className="hidden"
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(docs.spouseShenasnamehPages || []).map((img, i) => (
                                <div key={i} className="relative w-16 h-16 border border-slate-200 rounded-lg overflow-hidden bg-white">
                                  <img
                                    src={img}
                                    alt="شناسنامه همسر"
                                    className="w-full h-full object-cover cursor-pointer"
                                    onClick={() => setPreviewDocImage({ title: `شناسنامه همسر - صفحه ${toPersianDigits(i + 1)}`, src: img })}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDocs({
                                        spouseShenasnamehPages: (docs.spouseShenasnamehPages || []).filter((_, idx) => idx !== i)
                                      })
                                    }
                                    className="absolute top-0.5 left-0.5 p-0.5 bg-red-600 text-white rounded"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* فرزندان (پسر و دختر) */}
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 persian-num">
                              فرزندان تحت تکفل ({toPersianDigits((docs.children || []).length)} فرزند)
                            </span>
                            <button
                              type="button"
                              onClick={handleAddChild}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px]"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>افزودن فرزند (پسر / دختر)</span>
                            </button>
                          </div>

                          {(docs.children || []).map((child, idx) => (
                            <div key={child.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                                <div className="sm:col-span-5">
                                  <input
                                    type="text"
                                    value={child.fullName}
                                    onChange={(e) => handleUpdateChild(child.id, { fullName: e.target.value })}
                                    placeholder={`نام فرزند ${toPersianDigits(idx + 1)}`}
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <select
                                    value={child.relation}
                                    onChange={(e) => handleUpdateChild(child.id, { relation: e.target.value as 'پسر' | 'دختر' })}
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold"
                                  >
                                    <option value="پسر">پسر</option>
                                    <option value="دختر">دختر</option>
                                  </select>
                                </div>
                                <div className="sm:col-span-4 flex items-center justify-end gap-2">
                                  <label className="cursor-pointer px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold">
                                    آپلود شناسنامه
                                    <input
                                      type="file"
                                      accept="image/*,.pdf"
                                      multiple
                                      onChange={(e) => handleUploadChildPages(child.id, e)}
                                      className="hidden"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChild(child.id)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                    title="حذف فرزند"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {child.shenasnamehPages.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {child.shenasnamehPages.map((img, pi) => (
                                    <div key={pi} className="relative w-16 h-16 border border-slate-200 rounded-lg overflow-hidden bg-white">
                                      <img
                                        src={img}
                                        alt={`شناسنامه ${child.fullName}`}
                                        className="w-full h-full object-cover cursor-pointer"
                                        onClick={() => setPreviewDocImage({ title: `شناسنامه ${child.relation} (${child.fullName})`, src: img })}
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateChild(child.id, {
                                            shenasnamehPages: child.shenasnamehPages.filter((_, pIdx) => pIdx !== pi)
                                          })
                                        }
                                        className="absolute top-0.5 left-0.5 p-0.5 bg-red-600 text-white rounded"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* بخش اطلاعات بستگان کارمند */}
              <div className="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-rose-600" />
                    <h4 className="font-bold text-rose-950 text-xs sm:text-sm persian-num">
                      اطلاعات بستگان و افراد تحت تکفل کارمند ({toPersianDigits((formData.relatives || []).length)} نفر)
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddInlineRelative}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>افزودن عضو بستگان</span>
                  </button>
                </div>

                {(formData.relatives || []).length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    هنوز فردی به عنوان بستگان برای این کارمند ثبت نشده است. از دکمه «افزودن عضو بستگان» یا تب «بستگان و عائله» (ورود اکسل) استفاده کنید.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {(formData.relatives || []).map((rel, rIdx) => (
                      <div key={rel.id} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-3">
                          <input
                            type="text"
                            value={rel.fullName}
                            onChange={(e) => handleUpdateInlineRelative(rel.id, { fullName: e.target.value })}
                            placeholder={`نام بستگان ${toPersianDigits(rIdx + 1)} *`}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <select
                            value={rel.relation}
                            onChange={(e) => handleUpdateInlineRelative(rel.id, { relation: e.target.value })}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold"
                          >
                            <option value="همسر">همسر</option>
                            <option value="فرزند (پسر)">فرزند (پسر)</option>
                            <option value="فرزند (دختر)">فرزند (دختر)</option>
                            <option value="پدر">پدر</option>
                            <option value="مادر">مادر</option>
                            <option value="سایر">سایر</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            maxLength={10}
                            value={toPersianDigits(rel.nationalId || '')}
                            onChange={(e) => handleUpdateInlineRelative(rel.id, { nationalId: toEnglishDigits(e.target.value) })}
                            placeholder="کد ملی بستگان"
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            value={toPersianDigits(rel.birthDate || '')}
                            onChange={(e) => handleUpdateInlineRelative(rel.id, { birthDate: toEnglishDigits(e.target.value) })}
                            placeholder="تاریخ تولد"
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 persian-num"
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-2 text-[11px]">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(rel.isDependent)}
                              onChange={(e) => handleUpdateInlineRelative(rel.id, { isDependent: e.target.checked })}
                            />
                            <span>تکفل</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(rel.insuranceCovered)}
                              onChange={(e) => handleUpdateInlineRelative(rel.id, { insuranceCovered: e.target.checked })}
                            />
                            <span>بیمه</span>
                          </label>
                        </div>
                        <div className="sm:col-span-1 text-left">
                          <button
                            type="button"
                            onClick={() => handleRemoveInlineRelative(rel.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">توضیحات و سوابق پرونده</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="سوابق، مهارت‌ها و یادداشت‌های کارگزینی..."
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
                  disabled={docUploading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50"
                >
                  {editingPersonnel ? 'ثبت تغییرات پرونده' : 'ایجاد پرونده پرسنلی'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Excel Batch Import Modal */}
      {isImportOpen && (
        <SmartExcelImportMapper
          moduleType="personnel"
          title="ورود هوشمند پرونده‌های ۲۸ ستونی پرسنل از فایل اکسل"
          subtitle="تمامی عنوان‌های اکسل (شناسه کارمند، کد پرسنلی، کد ملی، مشخصات شناسنامه‌ای، تحصیلی و شغلی) به‌صورت خودکار شناسایی و تطبیق داده می‌شوند."
          onDownloadTemplate={downloadPersonnelTemplate}
          templateLabel="دانلود الگوی ۲۸ ستونی پرسنل"
          onCancel={() => setIsImportOpen(false)}
          onImport={async (mappedRows) => {
            const ok = await onBatchImportPersonnel(mappedRows);
            if (ok) setIsImportOpen(false);
          }}
        />
      )}

      {/* Personnel Profile & Documents View Modal */}
      {viewingPersonnel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-4 max-h-[92vh] flex flex-col">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white p-5 relative shrink-0">
              <button
                onClick={() => setViewingPersonnel(null)}
                className="absolute top-4 left-4 p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-lg font-bold border border-white/20">
                  {viewingPersonnel.firstName[0]}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold">{viewingPersonnel.fullName}</h3>
                  <p className="text-xs text-indigo-200 mt-0.5">{viewingPersonnel.position} · {viewingPersonnel.department}</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: 'شناسه کارمند', value: toPersianDigits(viewingPersonnel.employeeId || '—') },
                  { label: 'کد پرسنلی', value: toPersianDigits(viewingPersonnel.personnelCode) },
                  { label: 'نام', value: viewingPersonnel.firstName || '—' },
                  { label: 'نام خانوادگی', value: viewingPersonnel.lastName || '—' },
                  { label: 'نام پدر', value: viewingPersonnel.fatherName || '—' },
                  { label: 'شماره شناسنامه', value: toPersianDigits(viewingPersonnel.shenasnamehNumber || '—') },
                  { label: 'کد ملی', value: toPersianDigits(viewingPersonnel.nationalId || '—') },
                  { label: 'جنسیت / ملیت / تابعیت', value: `${viewingPersonnel.gender || '—'} · ${viewingPersonnel.nationality || '—'} · ${viewingPersonnel.citizenship || '—'}` },
                  { label: 'تلفن همراه', value: toPersianDigits(viewingPersonnel.phone || '—') },
                  { label: 'پست الکترونیک', value: viewingPersonnel.email || '—' },
                  { label: 'محل تولد / صدور', value: `${viewingPersonnel.birthPlace || '—'} / ${viewingPersonnel.issuePlace || '—'}` },
                  { label: 'تاریخ تولد / صدور', value: `${toPersianDigits(viewingPersonnel.birthDate || '—')} / ${toPersianDigits(viewingPersonnel.issueDate || '—')}` },
                  { label: 'وضعیت تاهل', value: viewingPersonnel.maritalStatus || viewingPersonnel.documents?.maritalStatus || '—' },
                  { label: 'نظام وظیفه', value: viewingPersonnel.militaryStatus || '—' },
                  { label: 'مدرک تحصیلی', value: viewingPersonnel.education || '—' },
                  { label: 'رشته تحصیلی', value: viewingPersonnel.fieldOfStudy || '—' },
                  { label: 'تاریخ استخدام', value: toPersianDigits(viewingPersonnel.hireDate || '—') },
                  { label: 'محل خدمت', value: viewingPersonnel.workLocation || '—' },
                  { label: 'واحد سازمانی', value: viewingPersonnel.department || '—' },
                  { label: 'شغل (کد)', value: `${viewingPersonnel.jobTitle || '—'} (${toPersianDigits(viewingPersonnel.jobCode || '—')})` },
                  { label: 'پست (کد)', value: `${viewingPersonnel.position || '—'} (${toPersianDigits(viewingPersonnel.positionCode || '—')})` },
                  { label: 'نوع استخدام / وضعیت', value: `${viewingPersonnel.employmentType} · ${viewingPersonnel.status}` },
                ].map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block text-[10px]">{item.label}</span>
                    <span className="font-bold text-slate-900 persian-num mt-0.5 block truncate" title={String(item.value)}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-center justify-between">
                <span className="text-slate-700 font-semibold">حقوق پایه سازمانی:</span>
                <span className="font-bold text-emerald-800 text-sm persian-num">
                  {canViewSalary ? formatRial(viewingPersonnel.baseSalary) : <span className="text-slate-400 font-normal">محرمانه (عدم دسترسی)</span>}
                </span>
              </div>

              {/* نمایش بستگان ثبت‌شده در پرونده */}
              <div className="p-4 bg-rose-50/40 rounded-xl border border-rose-200/80 space-y-2.5">
                <span className="font-bold text-rose-950 flex items-center gap-1.5 persian-num">
                  <HeartHandshake className="w-4 h-4 text-rose-600" />
                  بستگان و عائله ثبت‌شده ({toPersianDigits((viewingPersonnel.relatives || []).length)} نفر)
                </span>
                {(viewingPersonnel.relatives || []).length === 0 ? (
                  <p className="text-slate-500 text-[11px]">بستگانی برای این پرسنل ثبت نشده است.</p>
                ) : (
                  <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                    <table className="w-full text-right text-[11px]">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="p-2">نام کامل</th>
                          <th className="p-2">نسبت</th>
                          <th className="p-2">کد ملی</th>
                          <th className="p-2">تاریخ تولد</th>
                          <th className="p-2">تکفل</th>
                          <th className="p-2">بیمه</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(viewingPersonnel.relatives || []).map(rel => (
                          <tr key={rel.id}>
                            <td className="p-2 font-bold">{rel.fullName}</td>
                            <td className="p-2">{rel.relation}</td>
                            <td className="p-2 persian-num">{toPersianDigits(rel.nationalId || '—')}</td>
                            <td className="p-2 persian-num">{toPersianDigits(rel.birthDate || '—')}</td>
                            <td className="p-2">{rel.isDependent ? 'بله' : 'خیر'}</td>
                            <td className="p-2">{rel.insuranceCovered ? 'بله' : 'خیر'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* نمایش مدارک هویتی */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    مدارک هویتی پرسنل و خانواده ({viewingPersonnel.documents?.maritalStatus || 'مجرد'})
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => {
                        const target = viewingPersonnel;
                        setViewingPersonnel(null);
                        handleOpenEdit(target);
                      }}
                      className="text-indigo-600 hover:underline font-bold"
                    >
                      ویرایش / بارگذاری مدارک
                    </button>
                  )}
                </div>

                {countDocs(viewingPersonnel) === 0 ? (
                  <p className="text-slate-500">هنوز تصویر کارت ملی یا شناسنامه‌ای برای این پرسنل بارگذاری نشده است.</p>
                ) : (
                  <div className="space-y-3">
                    {viewingPersonnel.documents?.nationalCardImage && (
                      <div>
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1">تصویر کارت ملی:</span>
                        <button
                          type="button"
                          onClick={() => setPreviewDocImage({ title: `کارت ملی ${viewingPersonnel.fullName}`, src: viewingPersonnel.documents!.nationalCardImage! })}
                          className="relative group rounded-lg overflow-hidden border border-slate-200 inline-block"
                        >
                          <img src={viewingPersonnel.documents.nationalCardImage} alt="کارت ملی" className="h-24 object-cover" />
                          <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <ZoomIn className="w-5 h-5" />
                          </span>
                        </button>
                      </div>
                    )}

                    {(viewingPersonnel.documents?.shenasnamehPages || []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1">صفحات شناسنامه پرسنل:</span>
                        <div className="flex flex-wrap gap-2">
                          {viewingPersonnel.documents!.shenasnamehPages!.map((src, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setPreviewDocImage({ title: `شناسنامه ${viewingPersonnel.fullName} - صفحه ${toPersianDigits(i + 1)}`, src })}
                              className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200"
                            >
                              <img src={src} alt="شناسنامه" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewingPersonnel.documents?.maritalStatus === 'متاهل' && (
                      <>
                        {(viewingPersonnel.documents?.spouseShenasnamehPages || []).length > 0 && (
                          <div>
                            <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                              صفحات شناسنامه همسر ({viewingPersonnel.documents.spouseName || 'ثبت شده'}):
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {viewingPersonnel.documents.spouseShenasnamehPages!.map((src, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPreviewDocImage({ title: `شناسنامه همسر (${viewingPersonnel.documents?.spouseName || ''})`, src })}
                                  className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200"
                                >
                                  <img src={src} alt="شناسنامه همسر" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {(viewingPersonnel.documents?.children || []).map(ch => (
                          <div key={ch.id}>
                            <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                              شناسنامه {ch.relation}: {ch.fullName || 'بدون نام'}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {ch.shenasnamehPages.map((src, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPreviewDocImage({ title: `شناسنامه ${ch.relation} (${ch.fullName})`, src })}
                                  className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200"
                                >
                                  <img src={src} alt="شناسنامه فرزند" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {viewingPersonnel.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-600 block text-[11px] mb-1">یادداشت کارگزینی:</span>
                  <p className="text-slate-800 leading-relaxed">{viewingPersonnel.notes}</p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setViewingPersonnel(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Document Preview Modal */}
      {previewDocImage && (
        <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between text-xs font-bold">
              <span>{previewDocImage.title}</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewDocImage.src}
                  download={`${previewDocImage.title}.jpg`}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود تصویر</span>
                </a>
                <button
                  onClick={() => setPreviewDocImage(null)}
                  className="p-1 text-slate-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[80vh] overflow-auto">
              <img src={previewDocImage.src} alt={previewDocImage.title} className="max-h-[72vh] rounded-lg shadow-md" />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">تأیید حذف پرونده پرسنلی</h3>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف پرونده پرسنلی <b>{deleteTarget.fullName}</b> (کد: {toPersianDigits(deleteTarget.personnelCode)}) اطمینان دارید؟
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">تأیید حذف گروهی پرونده‌های پرسنلی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از حذف قطعی <b>{toPersianDigits(selectedIds.length)} پرونده پرسنلی</b> انتخاب‌شده از پایگاه داده اطمینان دارید؟ این عملیات غیرقابل بازگشت است.
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
                {batchDeleting ? 'در حال حذف...' : `بله، حذف ${toPersianDigits(selectedIds.length)} پرونده`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Personnel Confirmation Modal */}
      {confirmDeleteAllPersonnelOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">پاکسازی کامل جدول پرونده پرسنلی</h3>
            </div>
            <p className="text-slate-600 leading-relaxed persian-num">
              آیا از پاک کردن کامل تمامی <b>{toPersianDigits(personnelList.length)} پرونده پرسنلی</b> (و بستگان ثبت‌شده در آن‌ها) از پایگاه داده اطمینان دارید؟ این عملیات غیرقابل بازگشت است.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteAllPersonnelOpen(false)}
                disabled={deleteAllPersonnelLoading}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteAllPersonnel}
                disabled={deleteAllPersonnelLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {deleteAllPersonnelLoading ? 'در حال پاکسازی...' : 'بله، کل جدول پاک شود'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
