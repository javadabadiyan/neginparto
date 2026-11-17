import { eq, inArray, notInArray } from 'drizzle-orm';
import { createPool, db, isPostgresConfigured } from './index.ts';
import {
  users,
  jobGroups,
  personnel,
  jobClassifications,
  karaneh,
  commitments,
  payroll,
  miningVolumes,
  miningMachinery,
  unitReports,
} from './schema.ts';

export interface AppDatabaseSnapshot {
  users: any[];
  jobGroups: any[];
  personnel: any[];
  jobClassifications: any[];
  karaneh: any[];
  commitments: any[];
  payroll: any[];
  miningVolumes?: any[];
  miningMachinery?: any[];
  unitReports?: any[];
}

let extraTablesInitialized = false;
async function ensureExtraMiningTablesExist(): Promise<void> {
  if (extraTablesInitialized || !isPostgresConfigured()) return;
  const pool = createPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mining_volumes (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      activity_type TEXT,
      metric_title TEXT,
      volume_value DOUBLE PRECISION NOT NULL DEFAULT 0,
      target_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
      unit_label TEXT,
      status TEXT,
      notes TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS mining_machinery (
      id TEXT PRIMARY KEY,
      machine_code TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      machine_type TEXT,
      unit_name TEXT,
      status TEXT NOT NULL,
      issue_description TEXT,
      stopped_since TEXT,
      estimated_ready_date TEXT,
      operator_name TEXT,
      notes TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS unit_reports (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      report_category TEXT,
      metric_name TEXT NOT NULL,
      actual_value DOUBLE PRECISION NOT NULL DEFAULT 0,
      previous_value DOUBLE PRECISION DEFAULT 0,
      target_value DOUBLE PRECISION DEFAULT 0,
      unit_label TEXT,
      status TEXT,
      submitted_by TEXT,
      notes TEXT,
      raw_fields JSONB,
      updated_at TEXT
    );
  `);
  extraTablesInitialized = true;
}

export async function getOrCreateUserByUid(
  uid: string,
  email: string,
  defaults: {
    id: string;
    username: string;
    fullName: string;
    role: string;
    permissions: Record<string, any>;
  }
) {
  if (!isPostgresConfigured()) return null;
  try {
    const result = await db
      .insert(users)
      .values({
        id: defaults.id,
        uid,
        username: defaults.username,
        email,
        fullName: defaults.fullName,
        role: defaults.role,
        permissions: defaults.permissions,
        isActive: true,
        lastLogin: new Date().toLocaleString('fa-IR'),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          lastLogin: new Date().toLocaleString('fa-IR'),
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Database user update failed. Please try again later.', { cause: error });
  }
}

export async function loadSnapshotFromPostgres(): Promise<AppDatabaseSnapshot | null> {
  if (!isPostgresConfigured()) return null;

  try {
    await ensureExtraMiningTablesExist();
    const [uRows, jgRows, pRows, jcRows, kRows, cRows, payRows, mvRows, mmRows, urRows] = await Promise.all([
      db.select().from(users),
      db.select().from(jobGroups),
      db.select().from(personnel),
      db.select().from(jobClassifications),
      db.select().from(karaneh),
      db.select().from(commitments),
      db.select().from(payroll),
      db.select().from(miningVolumes),
      db.select().from(miningMachinery),
      db.select().from(unitReports),
    ]);

    return {
      users: uRows.map((u) => ({
        id: u.id,
        uid: u.uid || undefined,
        username: u.username,
        password: u.passwordHash || '',
        email: u.email || '',
        fullName: u.fullName,
        role: u.role,
        roleType: u.roleType || undefined,
        department: u.department || '',
        permissions: (u.permissions as Record<string, any>) || {},
        isActive: u.isActive,
        createdAt: u.createdAt || '',
        lastLogin: u.lastLogin || '',
      })),
      jobGroups: jgRows.map((jg) => ({
        id: jg.id,
        code: jg.code,
        title: jg.title,
        grade: jg.grade,
        minBaseSalary: jg.minBaseSalary,
        maxBaseSalary: jg.maxBaseSalary,
        maxKaranehCeiling: jg.maxKaranehCeiling,
        requiredExperienceYears: jg.requiredExperienceYears,
        requiredDegree: jg.requiredDegree || '',
        description: jg.description || '',
      })),
      personnel: pRows.map((p) => ({
        id: p.id,
        personnelCode: p.personnelCode,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        nationalId: p.nationalId || '',
        position: p.position || '',
        department: p.department || '',
        hireDate: p.hireDate || '',
        employmentType: p.employmentType,
        jobGroupId: p.jobGroupId || '',
        jobGroupName: p.jobGroupName || '',
        education: p.education || '',
        phone: p.phone || '',
        email: p.email || '',
        status: p.status,
        baseSalary: p.baseSalary,
        notes: p.notes || '',
        documents: (p.documents as any) || undefined,
        createdAt: p.createdAt || '',
        updatedAt: p.updatedAt || '',
      })),
      jobClassifications: jcRows.map((jc) => ({
        id: jc.id,
        personnelCode: jc.personnelCode,
        firstName: jc.firstName || '',
        lastName: jc.lastName || '',
        workLocation: jc.workLocation || '',
        department: jc.department || '',
        nationalId: jc.nationalId || '',
        education: jc.education || '',
        hireDate: jc.hireDate || '',
        hireMonth: jc.hireMonth || '',
        miningExperienceDays: jc.miningExperienceDays || '',
        totalInsuranceHistory: jc.totalInsuranceHistory || '',
        miningExperience: jc.miningExperience || '',
        nonMiningExperience: jc.nonMiningExperience || '',
        jobGroup: jc.jobGroup || '',
        groupGapFrom1405: jc.groupGapFrom1405 || '',
        nextGroupGap: jc.nextGroupGap || '',
        jobTitle: jc.jobTitle || '',
        position: jc.position || '',
        updatedAt: jc.updatedAt || '',
      })),
      karaneh: kRows.map((k) => ({
        id: k.id,
        personnelId: k.personnelId || '',
        personnelCode: k.personnelCode,
        fullName: k.fullName,
        department: k.department || '',
        position: k.position || '',
        period: k.period,
        score: k.score ?? undefined,
        performanceCoeff: k.performanceCoeff ?? undefined,
        baseKaraneh: k.baseKaraneh,
        overtimeBonus: k.overtimeBonus,
        deductions: k.deductions,
        finalKaraneh: k.finalKaraneh,
        notes: k.notes || '',
        updatedAt: k.updatedAt || '',
      })),
      commitments: cRows.map((c) => ({
        id: c.id,
        personnelId: c.personnelId || '',
        personnelCode: c.personnelCode,
        personnelName: c.personnelName,
        commitmentType: c.commitmentType,
        documentNumber: c.documentNumber || undefined,
        amount: c.amount,
        previouslyTakenAmount: c.previouslyTakenAmount ?? 0,
        maxAllowedAmount: c.maxAllowedAmount ?? 0,
        startDate: c.startDate || '',
        endDate: c.endDate || '',
        status: c.status,
        isArchived: c.isArchived,
        archivedAt: c.archivedAt || undefined,
        archiveCode: c.archiveCode || undefined,
        guarantorName: c.guarantorName || '',
        notes: c.notes || '',
      })),
      payroll: payRows.map((pay) => ({
        id: pay.id,
        period: pay.period,
        yearMonthLabel: pay.yearMonthLabel || '',
        employeeId: pay.employeeId || '',
        personnelCode: pay.personnelCode,
        firstName: pay.firstName || '',
        lastName: pay.lastName || '',
        fullName: pay.fullName,
        nationalId: pay.nationalId || '',
        workLocation: pay.workLocation || '',
        department: pay.department || '',
        jobTitle: pay.jobTitle || '',
        position: pay.position || '',
        jobGroupCode: pay.jobGroupCode || '',
        jobGroupTitle: pay.jobGroupTitle || '',
        employmentType: pay.employmentType || '',
        effectiveDays: pay.effectiveDays ?? 0,
        netPayable: pay.netPayable,
        totalBenefits: pay.totalBenefits,
        overtimeAmount: pay.overtimeAmount ?? 0,
        fridayWorkAmount: pay.fridayWorkAmount ?? 0,
        missionAmount: pay.missionAmount ?? 0,
        bonusAmount: pay.bonusAmount ?? 0,
        incentiveAmount: pay.incentiveAmount ?? 0,
        otherBenefits: pay.otherBenefits ?? 0,
        arrearsAmount: pay.arrearsAmount ?? 0,
        advanceAmount: pay.advanceAmount ?? 0,
        totalDeductions: pay.totalDeductions,
        taxAmount: pay.taxAmount ?? 0,
        salaryTaxAmount: pay.salaryTaxAmount ?? 0,
        jobWage: pay.jobWage ?? 0,
        totalOrderFactors: pay.totalOrderFactors ?? 0,
        baseSalaryOrder: pay.baseSalaryOrder ?? 0,
        overtimeHours: pay.overtimeHours ?? 0,
        fridayWorkHours: pay.fridayWorkHours ?? 0,
        costCenterCode: pay.costCenterCode || '',
        costCenterTitle: pay.costCenterTitle || '',
        projectCode: pay.projectCode || '',
        projectTitle: pay.projectTitle || '',
        bankName: pay.bankName || '',
        bankAccount: pay.bankAccount || '',
        rawFields: (pay.rawFields as Record<string, string | number>) || {},
        updatedAt: pay.updatedAt || '',
      })),
      miningVolumes: mvRows.map((mv) => ({
        id: mv.id,
        period: mv.period,
        unitName: mv.unitName,
        activityType: mv.activityType || '',
        metricTitle: mv.metricTitle || '',
        volumeValue: mv.volumeValue,
        targetVolume: mv.targetVolume,
        unitLabel: mv.unitLabel || 'تن',
        status: mv.status || '',
        notes: mv.notes || '',
        updatedAt: mv.updatedAt || '',
      })),
      miningMachinery: mmRows.map((mm) => ({
        id: mm.id,
        machineCode: mm.machineCode,
        machineName: mm.machineName,
        machineType: mm.machineType || '',
        unitName: mm.unitName || '',
        status: mm.status,
        issueDescription: mm.issueDescription || '',
        stoppedSince: mm.stoppedSince || '',
        estimatedReadyDate: mm.estimatedReadyDate || '',
        operatorName: mm.operatorName || '',
        notes: mm.notes || '',
        updatedAt: mm.updatedAt || '',
      })),
      unitReports: urRows.map((ur) => ({
        id: ur.id,
        period: ur.period,
        unitName: ur.unitName,
        reportCategory: ur.reportCategory || '',
        metricName: ur.metricName,
        actualValue: ur.actualValue,
        previousValue: ur.previousValue ?? 0,
        targetValue: ur.targetValue ?? 0,
        unitLabel: ur.unitLabel || '',
        status: ur.status || '',
        submittedBy: ur.submittedBy || '',
        notes: ur.notes || '',
        rawFields: (ur.rawFields as Record<string, string | number>) || {},
        updatedAt: ur.updatedAt || '',
      })),
    };
  } catch (error) {
    console.error('Database load failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function syncSnapshotToPostgres(snapshot: AppDatabaseSnapshot): Promise<void> {
  if (!isPostgresConfigured()) return;

  try {
    await ensureExtraMiningTablesExist();
    await db.transaction(async (tx) => {
      // 1. Job Groups (referenced by personnel)
      const jgList = snapshot.jobGroups || [];
      const jgIdSet = new Set(jgList.map((g) => String(g.id)));
      for (const jg of jgList) {
        await tx
          .insert(jobGroups)
          .values({
            id: String(jg.id),
            code: String(jg.code || ''),
            title: String(jg.title || ''),
            grade: Number(jg.grade || 0),
            minBaseSalary: Number(jg.minBaseSalary || 0),
            maxBaseSalary: Number(jg.maxBaseSalary || 0),
            maxKaranehCeiling: Number(jg.maxKaranehCeiling || 0),
            requiredExperienceYears: Number(jg.requiredExperienceYears || 0),
            requiredDegree: jg.requiredDegree || '',
            description: jg.description || '',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: jobGroups.id,
            set: {
              code: String(jg.code || ''),
              title: String(jg.title || ''),
              grade: Number(jg.grade || 0),
              minBaseSalary: Number(jg.minBaseSalary || 0),
              maxBaseSalary: Number(jg.maxBaseSalary || 0),
              maxKaranehCeiling: Number(jg.maxKaranehCeiling || 0),
              requiredExperienceYears: Number(jg.requiredExperienceYears || 0),
              requiredDegree: jg.requiredDegree || '',
              description: jg.description || '',
              updatedAt: new Date(),
            },
          });
      }

      // 2. Personnel (referenced by karaneh & commitments)
      const pList = snapshot.personnel || [];
      const pIdSet = new Set(pList.map((p) => String(p.id)));
      for (const p of pList) {
        const validJgId = p.jobGroupId && jgIdSet.has(String(p.jobGroupId)) ? String(p.jobGroupId) : null;
        await tx
          .insert(personnel)
          .values({
            id: String(p.id),
            personnelCode: String(p.personnelCode),
            firstName: String(p.firstName || ''),
            lastName: String(p.lastName || ''),
            fullName: String(p.fullName || ''),
            nationalId: p.nationalId || '',
            position: p.position || '',
            department: p.department || '',
            hireDate: p.hireDate || '',
            employmentType: String(p.employmentType || 'قراردادی'),
            jobGroupId: validJgId,
            jobGroupName: p.jobGroupName || '',
            education: p.education || '',
            phone: p.phone || '',
            email: p.email || '',
            status: String(p.status || 'فعال'),
            baseSalary: Number(p.baseSalary || 0),
            notes: p.notes || '',
            documents: p.documents || null,
            createdAt: p.createdAt || '',
            updatedAt: p.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: personnel.id,
            set: {
              personnelCode: String(p.personnelCode),
              firstName: String(p.firstName || ''),
              lastName: String(p.lastName || ''),
              fullName: String(p.fullName || ''),
              nationalId: p.nationalId || '',
              position: p.position || '',
              department: p.department || '',
              hireDate: p.hireDate || '',
              employmentType: String(p.employmentType || 'قراردادی'),
              jobGroupId: validJgId,
              jobGroupName: p.jobGroupName || '',
              education: p.education || '',
              phone: p.phone || '',
              email: p.email || '',
              status: String(p.status || 'فعال'),
              baseSalary: Number(p.baseSalary || 0),
              notes: p.notes || '',
              documents: p.documents || null,
              updatedAt: p.updatedAt || '',
            },
          });
      }

      // 3. Users
      const uList = snapshot.users || [];
      const uIds = uList.map((u) => String(u.id));
      for (const u of uList) {
        await tx
          .insert(users)
          .values({
            id: String(u.id),
            uid: u.uid || null,
            username: String(u.username),
            passwordHash: u.password || '',
            email: u.email || '',
            fullName: String(u.fullName || u.username),
            role: String(u.role || 'viewer'),
            roleType: u.roleType || null,
            department: u.department || '',
            permissions: u.permissions || {},
            isActive: u.isActive !== false,
            createdAt: u.createdAt || '',
            lastLogin: u.lastLogin || '',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              uid: u.uid || null,
              username: String(u.username),
              passwordHash: u.password || '',
              email: u.email || '',
              fullName: String(u.fullName || u.username),
              role: String(u.role || 'viewer'),
              roleType: u.roleType || null,
              department: u.department || '',
              permissions: u.permissions || {},
              isActive: u.isActive !== false,
              lastLogin: u.lastLogin || '',
              updatedAt: new Date(),
            },
          });
      }
      if (uIds.length > 0) {
        await tx.delete(users).where(notInArray(users.id, uIds));
      } else {
        await tx.delete(users);
      }

      // 4. Job Classifications
      const jcList = snapshot.jobClassifications || [];
      const jcIds = jcList.map((jc) => String(jc.id));
      for (const jc of jcList) {
        await tx
          .insert(jobClassifications)
          .values({
            id: String(jc.id),
            personnelCode: String(jc.personnelCode),
            firstName: jc.firstName || '',
            lastName: jc.lastName || '',
            workLocation: jc.workLocation || '',
            department: jc.department || '',
            nationalId: jc.nationalId || '',
            education: jc.education || '',
            hireDate: jc.hireDate || '',
            hireMonth: jc.hireMonth || '',
            miningExperienceDays: jc.miningExperienceDays || '',
            totalInsuranceHistory: jc.totalInsuranceHistory || '',
            miningExperience: jc.miningExperience || '',
            nonMiningExperience: jc.nonMiningExperience || '',
            jobGroup: jc.jobGroup || '',
            groupGapFrom1405: jc.groupGapFrom1405 || '',
            nextGroupGap: jc.nextGroupGap || '',
            jobTitle: jc.jobTitle || '',
            position: jc.position || '',
            updatedAt: jc.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: jobClassifications.id,
            set: {
              personnelCode: String(jc.personnelCode),
              firstName: jc.firstName || '',
              lastName: jc.lastName || '',
              workLocation: jc.workLocation || '',
              department: jc.department || '',
              nationalId: jc.nationalId || '',
              education: jc.education || '',
              hireDate: jc.hireDate || '',
              hireMonth: jc.hireMonth || '',
              miningExperienceDays: jc.miningExperienceDays || '',
              totalInsuranceHistory: jc.totalInsuranceHistory || '',
              miningExperience: jc.miningExperience || '',
              nonMiningExperience: jc.nonMiningExperience || '',
              jobGroup: jc.jobGroup || '',
              groupGapFrom1405: jc.groupGapFrom1405 || '',
              nextGroupGap: jc.nextGroupGap || '',
              jobTitle: jc.jobTitle || '',
              position: jc.position || '',
              updatedAt: jc.updatedAt || '',
            },
          });
      }
      if (jcIds.length > 0) {
        await tx.delete(jobClassifications).where(notInArray(jobClassifications.id, jcIds));
      } else {
        await tx.delete(jobClassifications);
      }

      // 5. Karaneh
      const kList = snapshot.karaneh || [];
      const kIds = kList.map((k) => String(k.id));
      for (const k of kList) {
        const validPId = k.personnelId && pIdSet.has(String(k.personnelId)) ? String(k.personnelId) : null;
        await tx
          .insert(karaneh)
          .values({
            id: String(k.id),
            personnelId: validPId,
            personnelCode: String(k.personnelCode),
            fullName: String(k.fullName || ''),
            department: k.department || '',
            position: k.position || '',
            period: String(k.period),
            score: k.score ?? null,
            performanceCoeff: k.performanceCoeff ?? null,
            baseKaraneh: Number(k.baseKaraneh || 0),
            overtimeBonus: Number(k.overtimeBonus || 0),
            deductions: Number(k.deductions || 0),
            finalKaraneh: Number(k.finalKaraneh || 0),
            notes: k.notes || '',
            updatedAt: k.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: karaneh.id,
            set: {
              personnelId: validPId,
              personnelCode: String(k.personnelCode),
              fullName: String(k.fullName || ''),
              department: k.department || '',
              position: k.position || '',
              period: String(k.period),
              score: k.score ?? null,
              performanceCoeff: k.performanceCoeff ?? null,
              baseKaraneh: Number(k.baseKaraneh || 0),
              overtimeBonus: Number(k.overtimeBonus || 0),
              deductions: Number(k.deductions || 0),
              finalKaraneh: Number(k.finalKaraneh || 0),
              notes: k.notes || '',
              updatedAt: k.updatedAt || '',
            },
          });
      }
      if (kIds.length > 0) {
        await tx.delete(karaneh).where(notInArray(karaneh.id, kIds));
      } else {
        await tx.delete(karaneh);
      }

      // 6. Commitments
      const cList = snapshot.commitments || [];
      const cIds = cList.map((c) => String(c.id));
      for (const c of cList) {
        const validPId = c.personnelId && pIdSet.has(String(c.personnelId)) ? String(c.personnelId) : null;
        await tx
          .insert(commitments)
          .values({
            id: String(c.id),
            personnelId: validPId,
            personnelCode: String(c.personnelCode),
            personnelName: String(c.personnelName || ''),
            commitmentType: String(c.commitmentType || ''),
            documentNumber: c.documentNumber || null,
            amount: Number(c.amount || 0),
            previouslyTakenAmount: Number(c.previouslyTakenAmount || 0),
            maxAllowedAmount: Number(c.maxAllowedAmount || 0),
            startDate: c.startDate || '',
            endDate: c.endDate || '',
            status: String(c.status || 'جاری و معتبر'),
            isArchived: Boolean(c.isArchived),
            archivedAt: c.archivedAt || null,
            archiveCode: c.archiveCode || null,
            guarantorName: c.guarantorName || '',
            notes: c.notes || '',
          })
          .onConflictDoUpdate({
            target: commitments.id,
            set: {
              personnelId: validPId,
              personnelCode: String(c.personnelCode),
              personnelName: String(c.personnelName || ''),
              commitmentType: String(c.commitmentType || ''),
              documentNumber: c.documentNumber || null,
              amount: Number(c.amount || 0),
              previouslyTakenAmount: Number(c.previouslyTakenAmount || 0),
              maxAllowedAmount: Number(c.maxAllowedAmount || 0),
              startDate: c.startDate || '',
              endDate: c.endDate || '',
              status: String(c.status || 'جاری و معتبر'),
              isArchived: Boolean(c.isArchived),
              archivedAt: c.archivedAt || null,
              archiveCode: c.archiveCode || null,
              guarantorName: c.guarantorName || '',
              notes: c.notes || '',
            },
          });
      }
      if (cIds.length > 0) {
        await tx.delete(commitments).where(notInArray(commitments.id, cIds));
      } else {
        await tx.delete(commitments);
      }

      // 7. Payroll
      const payList = snapshot.payroll || [];
      const payIds = payList.map((pay) => String(pay.id));
      for (const pay of payList) {
        await tx
          .insert(payroll)
          .values({
            id: String(pay.id),
            period: String(pay.period),
            yearMonthLabel: pay.yearMonthLabel || '',
            employeeId: pay.employeeId || '',
            personnelCode: String(pay.personnelCode),
            firstName: pay.firstName || '',
            lastName: pay.lastName || '',
            fullName: String(pay.fullName || ''),
            nationalId: pay.nationalId || '',
            workLocation: pay.workLocation || '',
            department: pay.department || '',
            jobTitle: pay.jobTitle || '',
            position: pay.position || '',
            jobGroupCode: pay.jobGroupCode || '',
            jobGroupTitle: pay.jobGroupTitle || '',
            employmentType: pay.employmentType || '',
            effectiveDays: Number(pay.effectiveDays || 0),
            netPayable: Number(pay.netPayable || 0),
            totalBenefits: Number(pay.totalBenefits || 0),
            overtimeAmount: Number(pay.overtimeAmount || 0),
            fridayWorkAmount: Number(pay.fridayWorkAmount || 0),
            missionAmount: Number(pay.missionAmount || 0),
            bonusAmount: Number(pay.bonusAmount || 0),
            incentiveAmount: Number(pay.incentiveAmount || 0),
            otherBenefits: Number(pay.otherBenefits || 0),
            arrearsAmount: Number(pay.arrearsAmount || 0),
            advanceAmount: Number(pay.advanceAmount || 0),
            totalDeductions: Number(pay.totalDeductions || 0),
            taxAmount: Number(pay.taxAmount || 0),
            salaryTaxAmount: Number(pay.salaryTaxAmount || 0),
            jobWage: Number(pay.jobWage || 0),
            totalOrderFactors: Number(pay.totalOrderFactors || 0),
            baseSalaryOrder: Number(pay.baseSalaryOrder || 0),
            overtimeHours: Number(pay.overtimeHours || 0),
            fridayWorkHours: Number(pay.fridayWorkHours || 0),
            costCenterCode: pay.costCenterCode || '',
            costCenterTitle: pay.costCenterTitle || '',
            projectCode: pay.projectCode || '',
            projectTitle: pay.projectTitle || '',
            bankName: pay.bankName || '',
            bankAccount: pay.bankAccount || '',
            rawFields: pay.rawFields || {},
            updatedAt: pay.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: payroll.id,
            set: {
              period: String(pay.period),
              yearMonthLabel: pay.yearMonthLabel || '',
              employeeId: pay.employeeId || '',
              personnelCode: String(pay.personnelCode),
              firstName: pay.firstName || '',
              lastName: pay.lastName || '',
              fullName: String(pay.fullName || ''),
              nationalId: pay.nationalId || '',
              workLocation: pay.workLocation || '',
              department: pay.department || '',
              jobTitle: pay.jobTitle || '',
              position: pay.position || '',
              jobGroupCode: pay.jobGroupCode || '',
              jobGroupTitle: pay.jobGroupTitle || '',
              employmentType: pay.employmentType || '',
              effectiveDays: Number(pay.effectiveDays || 0),
              netPayable: Number(pay.netPayable || 0),
              totalBenefits: Number(pay.totalBenefits || 0),
              overtimeAmount: Number(pay.overtimeAmount || 0),
              fridayWorkAmount: Number(pay.fridayWorkAmount || 0),
              missionAmount: Number(pay.missionAmount || 0),
              bonusAmount: Number(pay.bonusAmount || 0),
              incentiveAmount: Number(pay.incentiveAmount || 0),
              otherBenefits: Number(pay.otherBenefits || 0),
              arrearsAmount: Number(pay.arrearsAmount || 0),
              advanceAmount: Number(pay.advanceAmount || 0),
              totalDeductions: Number(pay.totalDeductions || 0),
              taxAmount: Number(pay.taxAmount || 0),
              salaryTaxAmount: Number(pay.salaryTaxAmount || 0),
              jobWage: Number(pay.jobWage || 0),
              totalOrderFactors: Number(pay.totalOrderFactors || 0),
              baseSalaryOrder: Number(pay.baseSalaryOrder || 0),
              overtimeHours: Number(pay.overtimeHours || 0),
              fridayWorkHours: Number(pay.fridayWorkHours || 0),
              costCenterCode: pay.costCenterCode || '',
              costCenterTitle: pay.costCenterTitle || '',
              projectCode: pay.projectCode || '',
              projectTitle: pay.projectTitle || '',
              bankName: pay.bankName || '',
              bankAccount: pay.bankAccount || '',
              rawFields: pay.rawFields || {},
              updatedAt: pay.updatedAt || '',
            },
          });
      }
      if (payIds.length > 0) {
        await tx.delete(payroll).where(notInArray(payroll.id, payIds));
      } else {
        await tx.delete(payroll);
      }

      // Cleanup deleted personnel & job groups after dependents are cleaned
      const pIds = Array.from(pIdSet);
      if (pIds.length > 0) {
        await tx.delete(personnel).where(notInArray(personnel.id, pIds));
      } else {
        await tx.delete(personnel);
      }

      const jgIds = Array.from(jgIdSet);
      if (jgIds.length > 0) {
        await tx.delete(jobGroups).where(notInArray(jobGroups.id, jgIds));
      } else {
        await tx.delete(jobGroups);
      }

      // 8. Mining Volumes
      const mvList = snapshot.miningVolumes || [];
      const mvIds = mvList.map((mv) => String(mv.id));
      for (const mv of mvList) {
        await tx
          .insert(miningVolumes)
          .values({
            id: String(mv.id),
            period: String(mv.period),
            unitName: String(mv.unitName),
            activityType: mv.activityType || '',
            metricTitle: mv.metricTitle || '',
            volumeValue: Number(mv.volumeValue || 0),
            targetVolume: Number(mv.targetVolume || 0),
            unitLabel: mv.unitLabel || 'تن',
            status: mv.status || '',
            notes: mv.notes || '',
            updatedAt: mv.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: miningVolumes.id,
            set: {
              period: String(mv.period),
              unitName: String(mv.unitName),
              activityType: mv.activityType || '',
              metricTitle: mv.metricTitle || '',
              volumeValue: Number(mv.volumeValue || 0),
              targetVolume: Number(mv.targetVolume || 0),
              unitLabel: mv.unitLabel || 'تن',
              status: mv.status || '',
              notes: mv.notes || '',
              updatedAt: mv.updatedAt || '',
            },
          });
      }
      if (mvIds.length > 0) {
        await tx.delete(miningVolumes).where(notInArray(miningVolumes.id, mvIds));
      } else {
        await tx.delete(miningVolumes);
      }

      // 9. Mining Machinery
      const mmList = snapshot.miningMachinery || [];
      const mmIds = mmList.map((mm) => String(mm.id));
      for (const mm of mmList) {
        await tx
          .insert(miningMachinery)
          .values({
            id: String(mm.id),
            machineCode: String(mm.machineCode),
            machineName: String(mm.machineName),
            machineType: mm.machineType || '',
            unitName: mm.unitName || '',
            status: String(mm.status || 'آماده به کار'),
            issueDescription: mm.issueDescription || '',
            stoppedSince: mm.stoppedSince || '',
            estimatedReadyDate: mm.estimatedReadyDate || '',
            operatorName: mm.operatorName || '',
            notes: mm.notes || '',
            updatedAt: mm.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: miningMachinery.id,
            set: {
              machineCode: String(mm.machineCode),
              machineName: String(mm.machineName),
              machineType: mm.machineType || '',
              unitName: mm.unitName || '',
              status: String(mm.status || 'آماده به کار'),
              issueDescription: mm.issueDescription || '',
              stoppedSince: mm.stoppedSince || '',
              estimatedReadyDate: mm.estimatedReadyDate || '',
              operatorName: mm.operatorName || '',
              notes: mm.notes || '',
              updatedAt: mm.updatedAt || '',
            },
          });
      }
      if (mmIds.length > 0) {
        await tx.delete(miningMachinery).where(notInArray(miningMachinery.id, mmIds));
      } else {
        await tx.delete(miningMachinery);
      }

      // 10. Unit Operational Reports
      const urList = snapshot.unitReports || [];
      const urIds = urList.map((ur) => String(ur.id));
      for (const ur of urList) {
        await tx
          .insert(unitReports)
          .values({
            id: String(ur.id),
            period: String(ur.period),
            unitName: String(ur.unitName),
            reportCategory: ur.reportCategory || '',
            metricName: String(ur.metricName || ''),
            actualValue: Number(ur.actualValue || 0),
            previousValue: Number(ur.previousValue || 0),
            targetValue: Number(ur.targetValue || 0),
            unitLabel: ur.unitLabel || '',
            status: ur.status || '',
            submittedBy: ur.submittedBy || '',
            notes: ur.notes || '',
            rawFields: ur.rawFields || {},
            updatedAt: ur.updatedAt || '',
          })
          .onConflictDoUpdate({
            target: unitReports.id,
            set: {
              period: String(ur.period),
              unitName: String(ur.unitName),
              reportCategory: ur.reportCategory || '',
              metricName: String(ur.metricName || ''),
              actualValue: Number(ur.actualValue || 0),
              previousValue: Number(ur.previousValue || 0),
              targetValue: Number(ur.targetValue || 0),
              unitLabel: ur.unitLabel || '',
              status: ur.status || '',
              submittedBy: ur.submittedBy || '',
              notes: ur.notes || '',
              rawFields: ur.rawFields || {},
              updatedAt: ur.updatedAt || '',
            },
          });
      }
      if (urIds.length > 0) {
        await tx.delete(unitReports).where(notInArray(unitReports.id, urIds));
      } else {
        await tx.delete(unitReports);
      }
    });
  } catch (error) {
    console.error('Database sync failed:', error);
    throw new Error('Database persistence failed. Please try again later.', { cause: error });
  }
}

export async function linkUserFirebaseUid(userId: string, uid: string, email: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  try {
    await db
      .update(users)
      .set({
        uid,
        email,
        lastLogin: new Date().toLocaleString('fa-IR'),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('Failed to link Firebase UID in PostgreSQL:', error);
    throw new Error('User authentication link failed. Please try again later.', { cause: error });
  }
}

export async function deletePersonnelFromPostgres(ids: string[]): Promise<void> {
  if (!isPostgresConfigured() || ids.length === 0) return;
  try {
    await db.delete(personnel).where(inArray(personnel.id, ids));
  } catch (error) {
    console.error('Failed to delete personnel from PostgreSQL:', error);
    throw new Error('Database delete failed. Please try again later.', { cause: error });
  }
}
