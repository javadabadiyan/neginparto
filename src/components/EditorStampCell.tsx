import React from 'react';
import { getRecordEditorInfo } from '../utils/audit';
import { toPersianDigits } from '../utils/persian';

interface EditorStampCellProps {
  record?: any;
  fallbackName?: string;
  fallbackAt?: string;
  compact?: boolean;
  emptyLabel?: string;
}

export const EditorStampCell: React.FC<EditorStampCellProps> = ({
  record,
  fallbackName,
  fallbackAt,
  compact = false,
  emptyLabel = 'ثبت سیستمی',
}) => {
  const info = getRecordEditorInfo(record);
  const editorName = info.editorName || String(fallbackName || '').trim();
  const editedAt = info.editedAt || String(fallbackAt || '').trim();

  if (!editorName && !editedAt) {
    return <span className="text-[10px] text-slate-400">{emptyLabel}</span>;
  }

  if (compact) {
    return (
      <div className="text-[10px] text-slate-500 leading-relaxed flex flex-wrap items-center gap-1.5">
        {editorName && (
          <span className="font-semibold text-slate-700 truncate max-w-[160px]" title={editorName}>
            ویرایش: {editorName}
          </span>
        )}
        {editorName && editedAt && <span aria-hidden="true">·</span>}
        {editedAt && (
          <span className="tabular-nums persian-num text-slate-500" dir="ltr">
            {toPersianDigits(editedAt)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-[130px] leading-snug space-y-0.5">
      <div
        className="text-[11px] font-semibold text-slate-800 truncate max-w-[170px]"
        title={editorName || emptyLabel}
      >
        {editorName || emptyLabel}
      </div>
      {editedAt && (
        <div className="text-[10px] text-slate-500 tabular-nums persian-num whitespace-nowrap" dir="ltr">
          {toPersianDigits(editedAt)}
        </div>
      )}
    </div>
  );
};
