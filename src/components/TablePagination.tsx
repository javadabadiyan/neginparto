import React from 'react';
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { toPersianDigits } from '../utils/persian';

interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  extraRight?: React.ReactNode;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100, 200],
  extraRight,
}) => {
  const safePageSize = Math.max(1, pageSize || 50);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const endIdx = Math.min(totalItems, safePage * safePageSize);

  return (
    <div className="bg-slate-50 px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          نمایش <strong className="text-slate-800">{toPersianDigits(startIdx)}</strong> تا{' '}
          <strong className="text-slate-800">{toPersianDigits(endIdx)}</strong> از مجموع{' '}
          <strong className="text-slate-800">{toPersianDigits(totalItems)}</strong> ردیف
        </span>
        {extraRight}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>تعداد در صفحه:</span>
          <select
            value={safePageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value) || 50);
              onPageChange(1);
            }}
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold text-xs cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {toPersianDigits(opt)}
              </option>
            ))}
          </select>
        </label>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(1)}
              title="صفحه اول"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              title="صفحه قبل"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-[11px]">
              صفحه {toPersianDigits(safePage)} از {toPersianDigits(totalPages)}
            </span>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              title="صفحه بعد"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(totalPages)}
              title="صفحه آخر"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
