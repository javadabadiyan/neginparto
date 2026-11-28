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
      viewAnalytics: true,
      exportAnalytics: true,
      submit: true,
      allowedUnits: [],
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
    finalKaraneh: {
      view: true,
      edit: true,
      delete: true,
      deleteAll: true,
      exportExcel: true,
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

export function getEmptyPermissions(): UserPermissions {
  return {
    personnel: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      viewSalary: false,
      documents: false,
    },
    karaneh: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
      viewAnalytics: false,
      exportAnalytics: false,
      submit: false,
      allowedUnits: [],
    },
    jobGroups: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
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
      view: false,
      create: false,
      edit: false,
      delete: false,
      deleteAll: false,
      importExcel: false,
      exportExcel: false,
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
      dashboardStats: false,
      backupDatabase: false,
      restoreDatabase: false,
    },
    smartDashboard: {
      view: false,
      exportExcel: false,
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
    finalKaraneh: {
      view: false,
      edit: false,
      delete: false,
      deleteAll: false,
      exportExcel: false,
    },
    canManagePersonnel: false,
    canManageKaraneh: false,
    canManageJobGroups: false,
    canManageCommitments: false,
    canManageUsers: false,
    canExportExcel: false,
    canImportExcel: false,
    canBackupRestore: false,
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
      viewAnalytics: true,
      exportAnalytics: false,
      submit: false,
      allowedUnits: [],
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
    finalKaraneh: {
      view: true,
      edit: false,
      delete: false,
      deleteAll: false,
      exportExcel: true,
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
      viewAnalytics: true,
      exportAnalytics: true,
      submit: false,
      allowedUnits: [],
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
    finalKaraneh: {
      view: true,
      edit: false,
      delete: false,
      deleteAll: false,
      exportExcel: true,
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
      viewAnalytics: true,
      exportAnalytics: true,
      submit: false,
      allowedUnits: [],
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
    finalKaraneh: {
      view: true,
      edit: false,
      delete: false,
      deleteAll: false,
      exportExcel: true,
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
      viewAnalytics: true,
      exportAnalytics: true,
      submit: true,
      allowedUnits: [],
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
    finalKaraneh: {
      view: true,
      edit: true,
      delete: false,
      deleteAll: false,
      exportExcel: true,
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
  const base = getEmptyPermissions();
  return {
    ...base,
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

export function getUnitKaranehManagerPermissions(allowedUnits: string[] = []): UserPermissions {
  const base = getEmptyPermissions();
  return {
    ...base,
    karaneh: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      deleteAll: false,
      importExcel: true,
      exportExcel: true,
      viewAnalytics: true,
      exportAnalytics: true,
      submit: true,
      allowedUnits,
    },
    canManageKaraneh: true,
    canExportExcel: true,
    canImportExcel: true,
  };
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

export function canUserAccessKaranehUnit(
  perms: UserPermissions | undefined,
  isAdmin: boolean,
  unitName: string
): boolean {
  if (isAdmin || perms?.finalKaraneh?.view) return true;
  if (!perms?.karaneh?.view) return false;
  const allowed = (perms.karaneh.allowedUnits || []).map((u) => String(u || '').trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  if (!unitName) return false;
  const norm = (s: string) =>
    String(s || '')
      .replace(/\u200c/g, ' ')
      .replace(/[يی]/g, 'ی')
      .replace(/[كک]/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const target = norm(unitName);
  return allowed.some((u) => {
    const nu = norm(u);
    return nu === target || target.includes(nu) || nu.includes(target);
  });
}

function syncLegacyPermissionFlags(perms: Omit<UserPermissions,
  | 'canManagePersonnel'
  | 'canManageKaraneh'
  | 'canManageJobGroups'
  | 'canManageCommitments'
  | 'canManageUsers'
  | 'canExportExcel'
  | 'canImportExcel'
  | 'canBackupRestore'
>): UserPermissions {
  return {
    ...perms,
    canManagePersonnel: Boolean(perms.personnel.create || perms.personnel.edit || perms.personnel.delete),
    canManageKaraneh: Boolean(perms.karaneh.create || perms.karaneh.edit || perms.karaneh.delete),
    canManageJobGroups: Boolean(perms.jobGroups.create || perms.jobGroups.edit || perms.jobGroups.delete),
    canManageCommitments: Boolean(perms.commitments.create || perms.commitments.edit || perms.commitments.delete),
    canManageUsers: Boolean(perms.users.create || perms.users.edit || perms.users.delete),
    canExportExcel: Boolean(
      perms.personnel.exportExcel ||
      perms.karaneh.exportExcel ||
      perms.karaneh.exportAnalytics ||
      perms.finalKaraneh?.exportExcel ||
      perms.jobGroups.exportExcel ||
      perms.commitments.exportExcel ||
      perms.payroll.exportExcel ||
      perms.users.exportExcel ||
      perms.smartDashboard?.exportExcel ||
      perms.ceoDashboard?.exportExcel ||
      perms.unitOperations?.exportExcel
    ),
    canImportExcel: Boolean(
      perms.personnel.importExcel ||
      perms.karaneh.importExcel ||
      perms.jobGroups.importExcel ||
      perms.commitments.importExcel ||
      perms.payroll.importExcel ||
      perms.users.importExcel ||
      perms.ceoDashboard?.importExcel ||
      perms.unitOperations?.importExcel
    ),
    canBackupRestore: Boolean(perms.system.backupDatabase || perms.system.restoreDatabase),
  };
}

export function normalizePermissions(raw?: any): UserPermissions {
  if (!raw || typeof raw !== 'object') return getEmptyPermissions();

  const hasModernSchema = Boolean(
    (raw.personnel && typeof raw.personnel === 'object') ||
    (raw.karaneh && typeof raw.karaneh === 'object') ||
    (raw.finalKaraneh && typeof raw.finalKaraneh === 'object') ||
    (raw.jobGroups && typeof raw.jobGroups === 'object') ||
    (raw.commitments && typeof raw.commitments === 'object') ||
    (raw.payroll && typeof raw.payroll === 'object') ||
    (raw.users && typeof raw.users === 'object') ||
    (raw.system && typeof raw.system === 'object') ||
    (raw.smartDashboard && typeof raw.smartDashboard === 'object') ||
    (raw.ceoDashboard && typeof raw.ceoDashboard === 'object') ||
    (raw.unitOperations && typeof raw.unitOperations === 'object')
  );

  // Genuine legacy-only objects (no nested module sections): map ONLY explicit true booleans
  if (!hasModernSchema) {
    const lp = raw.canManagePersonnel === true;
    const lk = raw.canManageKaraneh === true;
    const lj = raw.canManageJobGroups === true;
    const lc = raw.canManageCommitments === true;
    const lu = raw.canManageUsers === true;
    const le = raw.canExportExcel === true;
    const li = raw.canImportExcel === true;
    const lb = raw.canBackupRestore === true;

    return syncLegacyPermissionFlags({
      personnel: {
        view: lp,
        create: lp,
        edit: lp,
        delete: lp && lu,
        deleteAll: false,
        importExcel: lp && li,
        exportExcel: lp && le,
        viewSalary: lp,
        documents: lp,
      },
      karaneh: {
        view: lk,
        create: lk,
        edit: lk,
        delete: lk && lu,
        deleteAll: false,
        importExcel: lk && li,
        exportExcel: lk && le,
        viewAnalytics: lk,
        exportAnalytics: lk && le,
        submit: lk,
        allowedUnits: [],
      },
      jobGroups: {
        view: lj,
        create: lj,
        edit: lj,
        delete: lj && lu,
        deleteAll: false,
        importExcel: lj && li,
        exportExcel: lj && le,
      },
      commitments: {
        view: lc,
        create: lc,
        edit: lc,
        delete: lc && lu,
        deleteAll: false,
        print: lc,
        archive: lc,
        importExcel: lc && li,
        exportExcel: lc && le,
      },
      payroll: {
        view: lk || lp,
        create: lk || lp,
        edit: lk || lp,
        delete: (lk || lp) && lu,
        deleteAll: false,
        importExcel: (lk || lp) && li,
        exportExcel: (lk || lp) && le,
      },
      users: {
        view: lu,
        create: lu,
        edit: lu,
        delete: lu,
        deleteAll: false,
        importExcel: lu && li,
        exportExcel: lu && le,
      },
      system: {
        dashboardStats: lp || lk || lj || lc || lu,
        backupDatabase: lb,
        restoreDatabase: lb,
      },
      smartDashboard: {
        view: false,
        exportExcel: false,
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
      finalKaraneh: {
        view: false,
        edit: false,
        delete: false,
        deleteAll: false,
        exportExcel: false,
      },
    });
  }

  // Modern schema: strictly fail-closed (every flag is false unless explicitly true)
  const p = raw.personnel || {};
  const k = raw.karaneh || {};
  const fk = raw.finalKaraneh || {};
  const jg = raw.jobGroups || {};
  const c = raw.commitments || {};
  const pr = raw.payroll || {};
  const u = raw.users || {};
  const s = raw.system || {};
  const sd = raw.smartDashboard || {};
  const cd = raw.ceoDashboard || {};
  const uo = raw.unitOperations || {};

  const b = (v: any) => v === true;

  return syncLegacyPermissionFlags({
    personnel: {
      view: b(p.view),
      create: b(p.create),
      edit: b(p.edit),
      delete: b(p.delete),
      deleteAll: b(p.deleteAll),
      importExcel: b(p.importExcel),
      exportExcel: b(p.exportExcel),
      viewSalary: b(p.viewSalary),
      documents: b(p.documents),
    },
    karaneh: {
      view: b(k.view),
      create: b(k.create),
      edit: b(k.edit),
      delete: b(k.delete),
      deleteAll: b(k.deleteAll),
      importExcel: b(k.importExcel),
      exportExcel: b(k.exportExcel),
      viewAnalytics: k.viewAnalytics === undefined ? b(k.view) : b(k.viewAnalytics),
      exportAnalytics: k.exportAnalytics === undefined ? b(k.exportExcel) : b(k.exportAnalytics),
      submit: b(k.submit),
      allowedUnits: Array.isArray(k.allowedUnits) ? k.allowedUnits.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
    },
    jobGroups: {
      view: b(jg.view),
      create: b(jg.create),
      edit: b(jg.edit),
      delete: b(jg.delete),
      deleteAll: b(jg.deleteAll),
      importExcel: b(jg.importExcel),
      exportExcel: b(jg.exportExcel),
    },
    commitments: {
      view: b(c.view),
      create: b(c.create),
      edit: b(c.edit),
      delete: b(c.delete),
      deleteAll: b(c.deleteAll),
      print: b(c.print),
      archive: b(c.archive),
      importExcel: b(c.importExcel),
      exportExcel: b(c.exportExcel),
    },
    payroll: {
      view: b(pr.view),
      create: b(pr.create),
      edit: b(pr.edit),
      delete: b(pr.delete),
      deleteAll: b(pr.deleteAll),
      importExcel: b(pr.importExcel),
      exportExcel: b(pr.exportExcel),
    },
    users: {
      view: b(u.view),
      create: b(u.create),
      edit: b(u.edit),
      delete: b(u.delete),
      deleteAll: b(u.deleteAll),
      importExcel: b(u.importExcel),
      exportExcel: b(u.exportExcel),
    },
    system: {
      dashboardStats: b(s.dashboardStats),
      backupDatabase: b(s.backupDatabase),
      restoreDatabase: b(s.restoreDatabase),
    },
    smartDashboard: {
      view: b(sd.view),
      exportExcel: b(sd.exportExcel),
      print: b(sd.print),
    },
    ceoDashboard: {
      view: b(cd.view),
      create: b(cd.create),
      edit: b(cd.edit),
      delete: b(cd.delete),
      deleteAll: b(cd.deleteAll),
      importExcel: b(cd.importExcel),
      exportExcel: b(cd.exportExcel),
      print: b(cd.print),
    },
    unitOperations: {
      view: b(uo.view),
      create: b(uo.create),
      edit: b(uo.edit),
      delete: b(uo.delete),
      deleteAll: b(uo.deleteAll),
      importExcel: b(uo.importExcel),
      exportExcel: b(uo.exportExcel),
      allowedUnits: Array.isArray(uo.allowedUnits) ? uo.allowedUnits.map(String) : [],
    },
    finalKaraneh: {
      view: b(fk.view),
      edit: b(fk.edit),
      delete: b(fk.delete),
      deleteAll: b(fk.deleteAll),
      exportExcel: b(fk.exportExcel),
    },
  });
}

export function countActivePermissions(perms: UserPermissions): { active: number; total: number } {
  const modules: any[] = [
    perms.personnel,
    perms.karaneh,
    perms.finalKaraneh,
    perms.jobGroups,
    perms.commitments,
    perms.payroll,
    perms.users,
    perms.system,
    perms.smartDashboard,
    perms.ceoDashboard,
    perms.unitOperations,
  ];
  let active = 0;
  let total = 0;
  for (const mod of modules) {
    if (!mod || typeof mod !== 'object') continue;
    for (const key of Object.keys(mod)) {
      if (key === 'allowedUnits') continue;
      if (typeof mod[key] === 'boolean') {
        total++;
        if (mod[key]) active++;
      }
    }
  }
  return { active, total };
}

export function getFirstAccessibleTab(perms: UserPermissions, isAdmin: boolean): string {
  if (isAdmin || perms.system?.dashboardStats) return 'dashboard';
  if (perms.ceoDashboard?.view) return 'ceo-dashboard';
  if (perms.unitOperations?.view) return 'unit-operations';
  if (perms.smartDashboard?.view) return 'smart-dashboard';
  if (perms.personnel?.view) return 'personnel';
  if (perms.karaneh?.view) return 'karaneh';
  if (perms.finalKaraneh?.view) return 'final-karaneh';
  if (perms.payroll?.view) return 'payroll';
  if (perms.jobGroups?.view) return 'job-groups';
  if (perms.commitments?.view) return 'commitments';
  if (perms.users?.view) return 'users';
  if (perms.system?.backupDatabase || perms.system?.restoreDatabase) return 'database';
  return 'dashboard';
}
