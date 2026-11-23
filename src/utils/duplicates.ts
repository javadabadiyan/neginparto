export type DuplicateReason = 'personnelCode' | 'nationalId';

export interface DuplicateIndex<T> {
  dupCodes: Set<string>;
  dupNationalIds: Set<string>;
  dupCodeCount: number;
  dupNationalIdCount: number;
  totalDuplicateRows: number;
  isDuplicateRow: (row: T) => boolean;
  getRowDuplicateReasons: (row: T) => DuplicateReason[];
}

export function normalizeDuplicateKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  if (!str) return '';
  // Convert Persian & Arabic-Indic digits to ASCII digits
  str = str
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    // Strip zero-width joiners/non-joiners, directional marks, and whitespace
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\s]+/g, '');

  if (!str || str === '-' || str === '--' || str === '---' || str === '—' || /^0+$/.test(str)) {
    return '';
  }
  return str.toUpperCase();
}

export function buildDuplicateIndex<T>(
  rows: T[],
  getCode: (row: T) => unknown,
  getNationalId: (row: T) => unknown
): DuplicateIndex<T> {
  const codeCounts = new Map<string, number>();
  const nidCounts = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = normalizeDuplicateKey(getCode(row));
    if (code) {
      codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
    }
    const nid = normalizeDuplicateKey(getNationalId(row));
    if (nid) {
      nidCounts.set(nid, (nidCounts.get(nid) || 0) + 1);
    }
  }

  const dupCodes = new Set<string>();
  codeCounts.forEach((count, key) => {
    if (count > 1) dupCodes.add(key);
  });

  const dupNationalIds = new Set<string>();
  nidCounts.forEach((count, key) => {
    if (count > 1) dupNationalIds.add(key);
  });

  let totalDuplicateRows = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = normalizeDuplicateKey(getCode(row));
    const nid = normalizeDuplicateKey(getNationalId(row));
    if ((code && dupCodes.has(code)) || (nid && dupNationalIds.has(nid))) {
      totalDuplicateRows++;
    }
  }

  const getRowDuplicateReasons = (row: T): DuplicateReason[] => {
    const reasons: DuplicateReason[] = [];
    const code = normalizeDuplicateKey(getCode(row));
    const nid = normalizeDuplicateKey(getNationalId(row));
    if (code && dupCodes.has(code)) reasons.push('personnelCode');
    if (nid && dupNationalIds.has(nid)) reasons.push('nationalId');
    return reasons;
  };

  const isDuplicateRow = (row: T): boolean => {
    const code = normalizeDuplicateKey(getCode(row));
    const nid = normalizeDuplicateKey(getNationalId(row));
    return Boolean((code && dupCodes.has(code)) || (nid && dupNationalIds.has(nid)));
  };

  return {
    dupCodes,
    dupNationalIds,
    dupCodeCount: dupCodes.size,
    dupNationalIdCount: dupNationalIds.size,
    totalDuplicateRows,
    isDuplicateRow,
    getRowDuplicateReasons,
  };
}
