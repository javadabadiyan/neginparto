export interface EditorStamp {
  updatedByUserId?: string;
  updatedByUsername?: string;
  updatedByName?: string;
  updatedAt: string;
}

export interface AuditDiffItem {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

const TEHRAN_DATE_FORMATTER = (() => {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return null;
  }
})();

const TEHRAN_TIME_FORMATTER = (() => {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return null;
  }
})();

export function formatIranDateTime(dateInput?: Date | number | string): string {
  try {
    const d = dateInput instanceof Date ? dateInput : dateInput ? new Date(dateInput) : new Date();
    if (Number.isNaN(d.getTime())) {
      return typeof dateInput === 'string' ? dateInput : '';
    }
    const datePart = TEHRAN_DATE_FORMATTER
      ? TEHRAN_DATE_FORMATTER.format(d)
      : d.toLocaleDateString('fa-IR');
    const timePart = TEHRAN_TIME_FORMATTER
      ? TEHRAN_TIME_FORMATTER.format(d)
      : d.toLocaleTimeString('fa-IR');
    return `${datePart} - ${timePart}`;
  } catch {
    return new Date().toLocaleString('fa-IR');
  }
}

export function formatIranDateOnly(dateInput?: Date | number | string): string {
  try {
    const d = dateInput instanceof Date ? dateInput : dateInput ? new Date(dateInput) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return TEHRAN_DATE_FORMATTER ? TEHRAN_DATE_FORMATTER.format(d) : d.toLocaleDateString('fa-IR');
  } catch {
    return new Date().toLocaleDateString('fa-IR');
  }
}

export function buildEditorStamp(
  user?: { id?: string; username?: string; fullName?: string } | null
): EditorStamp {
  return {
    updatedByUserId: user?.id ? String(user.id) : undefined,
    updatedByUsername: user?.username ? String(user.username) : undefined,
    updatedByName: user?.fullName ? String(user.fullName) : user?.username ? String(user.username) : undefined,
    updatedAt: formatIranDateTime(),
  };
}

export function getRecordEditorInfo(record: any): {
  editorName: string;
  editedAt: string;
  hasEditor: boolean;
} {
  if (!record || typeof record !== 'object') {
    return { editorName: '', editedAt: '', hasEditor: false };
  }
  const editorName = String(
    record.updatedByName ||
      record.updatedByUsername ||
      record.submittedByName ||
      record.submittedBy ||
      ''
  ).trim();
  const editedAt = String(record.updatedAt || record.submittedAt || record.createdAt || '').trim();
  return {
    editorName,
    editedAt,
    hasEditor: Boolean(editorName || editedAt),
  };
}

function formatAuditValue(val: any): string {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'بله' : 'خیر';
  if (typeof val === 'number') return Number.isFinite(val) ? val.toLocaleString('fa-IR') : '0';
  if (Array.isArray(val)) return `${val.length} مورد`;
  if (typeof val === 'object') return '[جزئیات ساختاری]';
  const s = String(val).trim();
  return s.length > 90 ? `${s.slice(0, 87)}...` : s;
}

export function computeRecordChanges(
  oldRecord: Record<string, any> | null | undefined,
  newRecord: Record<string, any> | null | undefined,
  fieldLabels: Record<string, string>,
  maxChanges = 20
): AuditDiffItem[] {
  if (!oldRecord || !newRecord || typeof oldRecord !== 'object' || typeof newRecord !== 'object') {
    return [];
  }
  const ignored = new Set([
    'id',
    'password',
    'documents',
    'rawFields',
    'updatedAt',
    'updatedByUserId',
    'updatedByUsername',
    'updatedByName',
    'createdAt',
    'createdByUserId',
    'createdByUsername',
    'createdByName',
    'lastLogin',
  ]);
  const keys = Array.from(new Set([...Object.keys(fieldLabels), ...Object.keys(newRecord)]));
  const diffs: AuditDiffItem[] = [];
  for (const key of keys) {
    if (ignored.has(key)) continue;
    if (key === 'permissions') {
      const prevJson = JSON.stringify(oldRecord[key] || {});
      const nextJson = JSON.stringify(newRecord[key] || {});
      if (prevJson !== nextJson) {
        diffs.push({
          field: 'permissions',
          label: fieldLabels.permissions || 'سطوح دسترسی',
          oldValue: 'دسترسی قبلی',
          newValue: 'به‌روزرسانی دسترسی‌ها',
        });
      }
      continue;
    }
    const prevRaw = oldRecord[key];
    const nextRaw = newRecord[key];
    const prevStr = prevRaw === undefined || prevRaw === null ? '' : String(prevRaw).trim();
    const nextStr = nextRaw === undefined || nextRaw === null ? '' : String(nextRaw).trim();
    if (prevStr === nextStr) continue;
    diffs.push({
      field: key,
      label: fieldLabels[key] || key,
      oldValue: formatAuditValue(prevRaw),
      newValue: formatAuditValue(nextRaw),
    });
    if (diffs.length >= maxChanges) break;
  }
  return diffs;
}
