import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Download,
  Sparkles,
  RefreshCw,
  ArrowLeftRight,
  Table as TableIcon,
  X,
  Search,
} from 'lucide-react';
import {
  SmartImportModuleType,
  InspectedWorkbook,
  getSmartModuleFields,
  inspectExcelWorkbook,
  extractRowsFromSheet,
  autoMatchColumns,
  transformMappedRows,
} from '../utils/smartExcel';
import { toPersianDigits } from '../utils/persian';
import { BatchImportProgress, subscribeBatchImportProgress } from '../services/api';

interface SmartExcelImportMapperProps {
  moduleType: SmartImportModuleType;
  title: string;
  subtitle?: string;
  onDownloadTemplate?: () => void;
  templateLabel?: string;
  onImport: (mappedRows: Record<string, any>[]) => Promise<void> | void;
  onCancel?: () => void;
  extraOptions?: React.ReactNode;
  accentColor?: 'indigo' | 'emerald' | 'amber' | 'violet' | 'cyan';
  confirmLabel?: string;
}

export const SmartExcelImportMapper: React.FC<SmartExcelImportMapperProps> = ({
  moduleType,
  title,
  subtitle,
  onDownloadTemplate,
  templateLabel = 'دانلود فایل نمونه اکسل',
  onImport,
  onCancel,
  extraOptions,
  accentColor = 'indigo',
  confirmLabel = 'تایید و ورود هوشمند اطلاعات',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workbookInfo, setWorkbookInfo] = useState<InspectedWorkbook | null>(null);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState<number>(0);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMatchedKeys, setAutoMatchedKeys] = useState<Set<string>>(new Set());
  const [fieldSearch, setFieldSearch] = useState('');
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [importProgress, setImportProgress] = useState<BatchImportProgress | null>(null);

  useEffect(() => {
    return subscribeBatchImportProgress((next) => {
      setImportProgress(next);
    });
  }, []);

  const targetFields = useMemo(() => getSmartModuleFields(moduleType), [moduleType]);

  const activeSheet = useMemo(() => {
    if (!workbookInfo) return null;
    return workbookInfo.sheets[selectedSheetIdx] || workbookInfo.sheets[0] || null;
  }, [workbookInfo, selectedSheetIdx]);

  const extracted = useMemo(() => {
    if (!activeSheet) return { headers: [], rows: [] };
    if (activeSheet.cachedExtracted && headerRowIndex === activeSheet.detectedHeaderRowIndex) {
      return activeSheet.cachedExtracted;
    }
    return extractRowsFromSheet(activeSheet.rows2D, headerRowIndex);
  }, [activeSheet, headerRowIndex]);

  const runAutoMatch = (headers: string[]) => {
    const auto = autoMatchColumns(headers, targetFields);
    setMapping(auto);
    setAutoMatchedKeys(new Set(Object.keys(auto)));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setLoadingFile(true);
    try {
      const inspected = await inspectExcelWorkbook(file, moduleType);
      setWorkbookInfo(inspected);
      const sheetIdx = inspected.defaultSheetIndex;
      setSelectedSheetIdx(sheetIdx);
      const sheet = inspected.sheets[sheetIdx];
      const hdrIdx = sheet?.detectedHeaderRowIndex || 0;
      setHeaderRowIndex(hdrIdx);
      if (sheet) {
        const headers = sheet.cachedExtracted?.headers || extractRowsFromSheet(sheet.rows2D, hdrIdx).headers;
        runAutoMatch(headers);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در خواندن فایل اکسل. لطفاً ساختار فایل را بررسی کنید.');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSheetChange = (idx: number) => {
    if (!workbookInfo) return;
    setSelectedSheetIdx(idx);
    const sheet = workbookInfo.sheets[idx];
    const hdrIdx = sheet?.detectedHeaderRowIndex || 0;
    setHeaderRowIndex(hdrIdx);
    if (sheet) {
      const headers = sheet.cachedExtracted?.headers || extractRowsFromSheet(sheet.rows2D, hdrIdx).headers;
      runAutoMatch(headers);
    }
  };

  const handleHeaderRowChange = (newIdx: number) => {
    if (!activeSheet) return;
    setHeaderRowIndex(newIdx);
    const { headers } = extractRowsFromSheet(activeSheet.rows2D, newIdx);
    runAutoMatch(headers);
  };

  const handleMappingChange = (fieldKey: string, sourceHeader: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (!sourceHeader) delete next[fieldKey];
      else next[fieldKey] = sourceHeader;
      return next;
    });
    setAutoMatchedKeys((prev) => {
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
  };

  const matchedCount = useMemo(
    () => targetFields.filter((f) => Boolean(mapping[f.key])).length,
    [targetFields, mapping]
  );

  const missingRequired = useMemo(
    () => targetFields.filter((f) => f.required && !mapping[f.key]),
    [targetFields, mapping]
  );

  const filteredFields = useMemo(() => {
    return targetFields.filter((f) => {
      if (showUnmappedOnly && mapping[f.key]) return false;
      if (fieldSearch.trim()) {
        const q = fieldSearch.trim().toLowerCase();
        return (
          f.label.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q) ||
          (f.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [targetFields, fieldSearch, showUnmappedOnly, mapping]);

  const previewRows = useMemo(() => {
    if (extracted.rows.length === 0) return [];
    const sampleRaw = extracted.rows.slice(0, 5);
    return transformMappedRows(sampleRaw, mapping, moduleType);
  }, [extracted.rows, mapping, moduleType]);

  const previewFields = useMemo(
    () => targetFields.filter((f) => Boolean(mapping[f.key])).slice(0, 7),
    [targetFields, mapping]
  );

  const handleConfirmImport = async () => {
    if (!workbookInfo || extracted.rows.length === 0) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      // Yield 1 render tick so spinner & progress state paint before synchronous row mapping
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const transformed = transformMappedRows(extracted.rows, mapping, moduleType);
      await onImport(transformed);
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در ثبت اطلاعات اکسل');
    } finally {
      setSubmitting(false);
    }
  };

  const accentBtnClass =
    accentColor === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-700'
      : accentColor === 'amber'
      ? 'bg-amber-600 hover:bg-amber-700'
      : accentColor === 'violet'
      ? 'bg-violet-600 hover:bg-violet-700'
      : accentColor === 'cyan'
      ? 'bg-cyan-600 hover:bg-cyan-700'
      : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {subtitle ||
                'موتور هوشمند تشخیص ستون‌ها: هر فایل اکسلی با هر ترتیب و عنوان ستون را بارگذاری کنید تا سامانه به‌صورت خودکار عناوین را تطبیق دهد.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {onDownloadTemplate && (
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="px-3 py-2 min-h-[38px] rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{templateLabel}</span>
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="بستن"
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {extraOptions}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelected}
        className="hidden"
      />

      {!workbookInfo ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/30 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all"
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-indigo-600 mb-3">
            {loadingFile ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
          </div>
          <p className="text-sm font-bold text-slate-800">
            {loadingFile ? 'در حال آنالیز هوشمند ساختار فایل اکسل...' : 'انتخاب فایل اکسل (.xlsx / .xls / .csv)'}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            پشتیبانی از شناسایی خودکار سطر سرستون، چند شیت، حروف فارسی/عربی (ي/ی و ك/ک) و تطبیق خودکار با پیش‌نمایش زنده
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* File summary & sheet / header-row controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-2.5 sm:col-span-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">{workbookInfo.fileName}</p>
                <p className="text-[11px] text-slate-500">
                  {toPersianDigits(extracted.rows.length)} ردیف داده • {toPersianDigits(extracted.headers.length)} ستون در فایل •{' '}
                  <span className="text-emerald-700 font-bold">
                    {toPersianDigits(matchedCount)} از {toPersianDigits(targetFields.length)} فیلد تطبیق یافت
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                تعویض فایل
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">انتخاب شیت (Sheet)</label>
              <select
                value={selectedSheetIdx}
                onChange={(e) => handleSheetChange(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                {workbookInfo.sheets.map((s, idx) => (
                  <option key={s.name} value={idx}>
                    {s.name} ({toPersianDigits(s.rawRowCount)} ردیف)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">سطر سرستون‌ها (خودکار)</label>
              <select
                value={headerRowIndex}
                onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                {Array.from({ length: Math.min(activeSheet?.rows2D.length || 1, 15) }, (_, idx) => (
                  <option key={idx} value={idx}>
                    ردیف {toPersianDigits(idx + 1)} {idx === activeSheet?.detectedHeaderRowIndex ? '(تشخیص خودکار)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {missingRequired.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <span className="font-bold">فیلدهای کلیدی تطبیق‌نیافته: </span>
                {missingRequired.map((f) => f.label).join('، ')}.
                <span className="mr-1">در صورت وجود در فایل اکسل، از فهرست زیر ستون متناظر را انتخاب کنید.</span>
              </div>
            </div>
          )}

          {/* Search & filter over target fields */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="جستجو در نام فیلدهای سامانه (مثلاً کد ملی، محل خدمت، حقوق...)"
                className="w-full pr-9 pl-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUnmappedOnly((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  showUnmappedOnly
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {showUnmappedOnly ? 'نمایش همه فیلدها' : 'فقط تطبیق‌نیافته‌ها'}
              </button>
              <button
                type="button"
                onClick={() => runAutoMatch(extracted.headers)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تطبیق مجدد خودکار</span>
              </button>
            </div>
          </div>

          {/* Column mapping matrix */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {filteredFields.map((field) => {
                const mappedHeader = mapping[field.key] || '';
                const isAuto = autoMatchedKeys.has(field.key) && Boolean(mappedHeader);
                return (
                  <div
                    key={field.key}
                    className={`grid grid-cols-1 md:grid-cols-12 items-center gap-2 px-3 py-2 text-xs ${
                      mappedHeader ? 'bg-white' : field.required ? 'bg-amber-50/50' : 'bg-slate-50/40'
                    }`}
                  >
                    <div className="md:col-span-5 flex items-center gap-2">
                      {mappedHeader ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className={`w-4 h-4 shrink-0 ${field.required ? 'text-amber-500' : 'text-slate-300'}`} />
                      )}
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800">{field.label}</span>
                        {field.required && (
                          <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-bold">
                            الزامی
                          </span>
                        )}
                        {field.category && (
                          <span className="block text-[10px] text-slate-400">{field.category}</span>
                        )}
                      </div>
                    </div>

                    <div className="hidden md:flex md:col-span-1 justify-center text-slate-400">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </div>

                    <div className="md:col-span-4">
                      <select
                        value={mappedHeader}
                        onChange={(e) => handleMappingChange(field.key, e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                          mappedHeader
                            ? 'border-emerald-300 bg-emerald-50/30 font-bold text-slate-800'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <option value="">— عدم انتخاب / بدون ستون متناظر —</option>
                        {extracted.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 text-left">
                      {mappedHeader ? (
                        <span
                          className={`inline-block text-[10px] px-2 py-0.5 rounded font-bold ${
                            isAuto ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isAuto ? 'تطبیق خودکار' : 'انتخاب دستی'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">نگاشت‌نشده</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Data Preview */}
          {previewRows.length > 0 && previewFields.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2 text-xs font-bold text-slate-700">
                <TableIcon className="w-4 h-4 text-indigo-600" />
                <span>پیش‌نمایش زنده داده‌های استخراج‌شده (۵ ردیف اول)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-bold">#</th>
                      {previewFields.map((f) => (
                        <th key={f.key} className="px-3 py-2 font-bold whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-400">{toPersianDigits(idx + 1)}</td>
                        {previewFields.map((f) => (
                          <td key={f.key} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[180px] truncate">
                            {String(row[f.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-700">
              {errorMsg}
            </div>
          )}

          {submitting && importProgress?.active && importProgress.totalRows > 0 && (() => {
            const pct = Math.min(100, Math.round((importProgress.processedRows / importProgress.totalRows) * 100));
            return (
              <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-indigo-900">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                    <span>
                      در حال ثبت در پایگاه داده... {toPersianDigits(importProgress.processedRows)} از {toPersianDigits(importProgress.totalRows)} ردیف ({toPersianDigits(pct)}٪)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-medium text-indigo-700">
                    <span>دسته {toPersianDigits(importProgress.completedChunks)} از {toPersianDigits(importProgress.totalChunks)}</span>
                    {importProgress.savedRows > 0 && (
                      <span className="text-emerald-700 font-bold">{toPersianDigits(importProgress.savedRows)} ثبت‌شده</span>
                    )}
                    {importProgress.failedRows > 0 && (
                      <span className="text-rose-600 font-bold">{toPersianDigits(importProgress.failedRows)} ناموفق</span>
                    )}
                  </div>
                </div>
                <div className="w-full h-2.5 bg-white border border-indigo-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-indigo-600 to-emerald-500 transition-all duration-300"
                    style={{ width: `${pct > 0 ? Math.max(2, pct) : 0}%` }}
                  />
                </div>
              </div>
            );
          })()}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
            {onCancel && (
              <button
                type="button"
                disabled={submitting}
                onClick={onCancel}
                className="px-4 py-2.5 min-h-[42px] rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                انصراف
              </button>
            )}
            <button
              type="button"
              disabled={submitting || extracted.rows.length === 0 || matchedCount === 0}
              onClick={handleConfirmImport}
              className={`px-5 py-2.5 min-h-[42px] rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${accentBtnClass}`}
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>
                {submitting
                  ? importProgress?.active && importProgress.totalRows > 0
                    ? `در حال ثبت اطلاعات (${toPersianDigits(Math.min(100, Math.round((importProgress.processedRows / importProgress.totalRows) * 100)))}٪)...`
                    : 'در حال ثبت اطلاعات...'
                  : `${confirmLabel} (${toPersianDigits(extracted.rows.length)} ردیف)`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
