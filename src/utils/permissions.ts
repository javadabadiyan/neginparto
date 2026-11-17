import { UserPermissions } from '../types';

export function getFullAdminPermissions(): UserPermissions {
  return {
    personnel: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
      viewSalary: true,
      documents: true,
    },
    karaneh: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
    },
    jobGroups: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
    },
    commitments: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      print: true,
      archive: true,
      importExcel: true,
      exportExcel: true,
    },
    payroll: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
    },
    users: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
    },
    system: {
      dashboardStats: true,
      backupDatabase: true,
      restoreDatabase: true,
    },
    smartDashboard: {
      view: true,
      exportExcel: true,
      print: true,
    },
    ceoDashboard: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
      print: true,
    },
    unitOperations: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: true,
      importExcel: true,
      exportExcel: true,
      allowedUnits: [],
    },
    canManagePersonnel: true,
    canManageKaraneh: true,
    canManageJobGroups: true,
    canManageCommitments: true,
    canManageUsers: true,
    canExportExcel: true,
    canImportExcel: true,
    canBackupRestore: true,
  };
}

export function getDefaultViewerPermissions(): UserPermissions {
  return {
    personnel: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
      viewSalary: false,
      documents: false,
    },
    karaneh: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    jobGroups: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    commitments: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      print: true,
      archive: false,
      importExcel: false,
      exportExcel: true,
    },
    payroll: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    users: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
    },
    system: {
      dashboardStats: true,
      backupDatabase: false,
      restoreDatabase: false,
    },
    smartDashboard: {
      view: true,
      exportExcel: true,
      print: true,
    },
    ceoDashboard: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      print: false,
    },
    unitOperations: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      allowedUnits: [],
    },
    canManagePersonnel: false,
    canManageKaraneh: false,
    canManageJobGroups: false,
    canManageCommitments: false,
    canManageUsers: false,
    canExportExcel: true,
    canImportExcel: false,
    canBackupRestore: false,
  };
}

export function getCeoPermissions(): UserPermissions {
  return {
    personnel: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
      viewSalary: true,
      documents: true,
    },
    karaneh: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    jobGroups: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    commitments: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      print: true,
      archive: false,
      importExcel: false,
      exportExcel: true,
    },
    payroll: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    users: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
    },
    system: {
      dashboardStats: true,
      backupDatabase: false,
      restoreDatabase: false,
    },
    smartDashboard: {
      view: true,
      exportExcel: true,
      print: true,
    },
    ceoDashboard: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
      print: true,
    },
    unitOperations: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
      allowedUnits: [],
    },
    canManagePersonnel: false,
    canManageKaraneh: false,
    canManageJobGroups: false,
    canManageCommitments: false,
    canManageUsers: false,
    canExportExcel: true,
    canImportExcel: false,
    canBackupRestore: false,
  };
}

export function getHrSpecialistPermissions(): UserPermissions {
  return {
    personnel: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
      viewSalary: true,
      documents: true,
    },
    karaneh: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    jobGroups: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
    },
    commitments: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      print: true,
      archive: true,
      importExcel: true,
      exportExcel: true,
    },
    payroll: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
    },
    users: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
    },
    system: {
      dashboardStats: true,
      backupDatabase: false,
      restoreDatabase: false,
    },
    smartDashboard: {
      view: true,
      exportExcel: true,
      print: true,
    },
    ceoDashboard: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      print: false,
    },
    unitOperations: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      allowedUnits: [],
    },
    canManagePersonnel: true,
    canManageKaraneh: false,
    canManageJobGroups: true,
    canManageCommitments: true,
    canManageUsers: false,
    canExportExcel: true,
    canImportExcel: true,
    canBackupRestore: false,
  };
}

export function getKaranehSpecialistPermissions(): UserPermissions {
  return {
    personnel: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
      viewSalary: true,
      documents: false,
    },
    karaneh: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
    },
    jobGroups: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    commitments: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      print: false,
      archive: false,
      importExcel: false,
      exportExcel: false,
    },
    payroll: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: true,
    },
    users: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
    },
    system: {
      dashboardStats: true,
      backupDatabase: false,
      restoreDatabase: false,
    },
    smartDashboard: {
      view: true,
      exportExcel: true,
      print: false,
    },
    ceoDashboard: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      print: false,
    },
    unitOperations: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      allowedUnits: [],
    },
    canManagePersonnel: false,
    canManageKaraneh: true,
    canManageJobGroups: false,
    canManageCommitments: false,
    canManageUsers: false,
    canExportExcel: true,
    canImportExcel: true,
    canBackupRestore: false,
  };
}

export function getUnitSupervisorPermissions(allowedUnits: string[] = []): UserPermissions {
  const base = getDefaultViewerPermissions();
  return {
    ...base,
    personnel: { ...base.personnel, view: false, exportExcel: false },
    karaneh: { ...base.karaneh, view: false, exportExcel: false },
    jobGroups: { ...base.jobGroups, view: false, exportExcel: false },
    commitments: { ...base.commitments, view: false, print: false, exportExcel: false },
    payroll: { ...base.payroll, view: false, exportExcel: false },
    smartDashboard: { view: false, exportExcel: false, print: false },
    unitOperations: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
      allowedUnits,
    },
    canExportExcel: true,
    canImportExcel: true,
  };
}

export function getDispatchingOfficerPermissions(): UserPermissions {
  return getUnitSupervisorPermissions(['واحد دیسپچینگ و کنترل تولید', 'استخراج و معدن‌کاری', 'حمل‌ونقل و ترابری معدنی']);
}

export function getWorkshopOfficerPermissions(): UserPermissions {
  return getUnitSupervisorPermissions(['تعمیرگاه و ماشین‌آلات سنگین', 'نگهداری و تعمیرات (نت) و تاسیسات']);
}

export function canUserAccessMiningUnit(
  perms: UserPermissions | undefined,
  isAdmin: boolean,
  unitName: string
): boolean {
  if (isAdmin || perms?.ceoDashboard?.view) return true;
  if (!perms?.unitOperations?.view) return false;
  const allowed = perms.unitOperations.allowedUnits || [];
  if (allowed.length === 0) return true;
  const norm = (s: string) =>
    String(s || '')
      .replace(/\u200c/g, ' ')
      .replace(/[يی]/g, 'ی')
      .replace(/[كک]/g, 'ک')
      .trim()
      .toLowerCase();
  const target = norm(unitName);
  return allowed.some((u) => {
    const nu = norm(u);
    return nu === target || target.includes(nu) || nu.includes(target);
  });
}

export function normalizePermissions(raw?: any): UserPermissions {
  if (!raw) return getDefaultViewerPermissions();

  const p = raw.personnel || {};
  const k = raw.karaneh || {};
  const jg = raw.jobGroups || {};
  const c = raw.commitments || {};
  const pr = raw.payroll || {};
  const u = raw.users || {};
  const s = raw.system || {};
  const sd = raw.smartDashboard || {};
  const cd = raw.ceoDashboard || {};
  const uo = raw.unitOperations || {};

  const legacyPersonnel = raw.canManagePersonnel ?? true;
  const legacyKaraneh = raw.canManageKaraneh ?? false;
  const legacyJobGroups = raw.canManageJobGroups ?? false;
  const legacyCommitments = raw.canManageCommitments ?? false;
  const legacyUsers = raw.canManageUsers ?? false;
  const legacyExport = raw.canExportExcel ?? true;
  const legacyImport = raw.canImportExcel ?? false;
  const legacyBackup = raw.canBackupRestore ?? false;

  return {
    personnel: {
      view: p.view ?? true,
      create: p.create ?? legacyPersonnel,
      edit: p.edit ?? legacyPersonnel,
      delete: p.delete ?? (legacyPersonnel && legacyUsers),
      deleteAll: Boolean(p.deleteAll ?? false),
      importExcel: p.importExcel ?? (legacyImport && legacyPersonnel),
      exportExcel: p.exportExcel ?? legacyExport,
      viewSalary: p.viewSalary ?? true,
      documents: p.documents ?? legacyPersonnel,
    },
    karaneh: {
      view: k.view ?? true,
      create: k.create ?? legacyKaraneh,
      edit: k.edit ?? legacyKaraneh,
      delete: k.delete ?? (legacyKaraneh && legacyUsers),
      deleteAll: Boolean(k.deleteAll ?? false),
      importExcel: k.importExcel ?? (legacyImport && legacyKaraneh),
      exportExcel: k.exportExcel ?? legacyExport,
    },
    jobGroups: {
      view: jg.view ?? true,
      create: jg.create ?? legacyJobGroups,
      edit: jg.edit ?? legacyJobGroups,
      delete: jg.delete ?? (legacyJobGroups && legacyUsers),
      deleteAll: Boolean(jg.deleteAll ?? false),
      importExcel: jg.importExcel ?? (legacyImport && legacyJobGroups),
      exportExcel: jg.exportExcel ?? legacyExport,
    },
    commitments: {
      view: c.view ?? true,
      create: c.create ?? legacyCommitments,
      edit: c.edit ?? legacyCommitments,
      delete: c.delete ?? (legacyCommitments && legacyUsers),
      deleteAll: Boolean(c.deleteAll ?? false),
      print: c.print ?? true,
      archive: c.archive ?? legacyCommitments,
      importExcel: c.importExcel ?? (legacyImport && legacyCommitments),
      exportExcel: c.exportExcel ?? legacyExport,
    },
    payroll: {
      view: pr.view ?? true,
      create: pr.create ?? (legacyPersonnel || legacyKaraneh),
      edit: pr.edit ?? (legacyPersonnel || legacyKaraneh),
      delete: pr.delete ?? ((legacyPersonnel || legacyKaraneh) && legacyUsers),
      deleteAll: Boolean(pr.deleteAll ?? false),
      importExcel: pr.importExcel ?? (legacyImport && (legacyPersonnel || legacyKaraneh)),
      exportExcel: pr.exportExcel ?? legacyExport,
    },
    users: {
      view: u.view ?? legacyUsers,
      create: u.create ?? legacyUsers,
      edit: u.edit ?? legacyUsers,
      delete: u.delete ?? legacyUsers,
      deleteAll: Boolean(u.deleteAll ?? false),
      importExcel: u.importExcel ?? legacyUsers,
      exportExcel: u.exportExcel ?? legacyUsers,
    },
    system: {
      dashboardStats: s.dashboardStats ?? true,
      backupDatabase: s.backupDatabase ?? legacyBackup,
      restoreDatabase: s.restoreDatabase ?? legacyBackup,
    },
    smartDashboard: {
      view: sd.view ?? true,
      exportExcel: sd.exportExcel ?? legacyExport,
      print: sd.print ?? true,
    },
    ceoDashboard: {
      view: cd.view ?? false,
      create: cd.create ?? false,
      edit: cd.edit ?? false,
      delete: cd.delete ?? false,
      deleteAll: Boolean(cd.deleteAll ?? false),
      importExcel: cd.importExcel ?? false,
      exportExcel: cd.exportExcel ?? (cd.view ?? false),
      print: cd.print ?? (cd.view ?? false),
    },
    unitOperations: {
      view: uo.view ?? (cd.view ?? false),
      create: uo.create ?? (cd.create ?? false),
      edit: uo.edit ?? (cd.edit ?? false),
      delete: uo.delete ?? (cd.delete ?? false),
      deleteAll: Boolean(uo.deleteAll ?? false),
      importExcel: uo.importExcel ?? (cd.importExcel ?? false),
      exportExcel: uo.exportExcel ?? (cd.exportExcel ?? (uo.view ?? false)),
      allowedUnits: Array.isArray(uo.allowedUnits) ? uo.allowedUnits.map(String) : [],
    },
    canManagePersonnel: legacyPersonnel,
    canManageKaraneh: legacyKaraneh,
    canManageJobGroups: legacyJobGroups,
    canManageCommitments: legacyCommitments,
    canManageUsers: legacyUsers,
    canExportExcel: legacyExport,
    canImportExcel: legacyImport,
    canBackupRestore: legacyBackup,
  };
}
