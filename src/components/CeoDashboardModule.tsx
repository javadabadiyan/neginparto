import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
} from 'recharts';
import {
  Briefcase,
  Users,
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Award,
  FileSpreadsheet,
  Printer,
  Download,
  Building2,
  Pickaxe,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  X,
  Crown,
} from 'lucide-react';
import {
  User,
  Personnel,
  KaranehRecord,
  PayrollRecord,
  JobGroup,
  JobClassificationRecord,
  PersonnelCommitment,
  MiningVolumeRecord,
  MiningMachineryRecord,
  UnitOperationalReport,
  GranularDashboardReportPermissions,
} from '../types';
import { formatRial, formatPercent, toPersianDigits, getPeriodLabel } from '../utils/persian';
import {
  classifyPayrollRoleTier,
  ROLE_TIER_ORDER,
} from '../utils/payrollAnalytics';
import { exportCeoExecutiveReportToExcel } from '../utils/excel';
import {
  CeoMiningUnitsPanel,
  MINING_UNITS_CATALOG,
  buildMiningUnitsBreakdown,
} from './CeoMiningUnitsPanel';
import { CeoVolumesPanel } from './CeoVolumesPanel';
import { CeoMachineryPanel } from './CeoMachineryPanel';

interface CeoDashboardModuleProps {
  users?: User[];
  personnel: Personnel[];
  karanehList: KaranehRecord[];
  payrollList: PayrollRecord[];
  jobGroups: JobGroup[];
  jobClassifications: JobClassificationRecord[];
  commitments: PersonnelCommitment[];
  miningVolumes: MiningVolumeRecord[];
  miningMachinery: MiningMachineryRecord[];
  unitReports?: UnitOperationalReport[];
  onSaveVolume: (record: Partial<MiningVolumeRecord>) => Promise<{ success: boolean; message?: string }>;
  onBatchImportVolumes: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDeleteVolume: (id: string) => Promise<void>;
  onBatchDeleteVolumes: (ids: string[]) => Promise<void>;
  onDeleteAllVolumes: () => Promise<void>;
  onSaveMachinery: (record: Partial<MiningMachineryRecord>) => Promise<{ success: boolean; message?: string }>;
  onBatchImportMachinery: (items: any[]) => Promise<{ success: boolean; message?: string }>;
  onDeleteMachinery: (id: string) => Promise<void>;
  onBatchDeleteMachinery: (ids: string[]) => Promise<void>;
  onDeleteAllMachinery: () => Promise<void>;
  granularPermissions?: GranularDashboardReportPermissions;
  isSuperAdmin?: boolean;
}

const CEO_CHART_PALETTE = [
  '#1e293b', // slate-800
  '#4338ca', // indigo-700
  '#0f766e', // teal-700
  '#b45309', // amber-700
  '#6d28d9', // violet-700
  '#be123c', // rose-700
  '#0369a1', // sky-700
];

const parseFirstNumber = (raw?: string | number): number => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const persianFixed = String(raw)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const match = persianFixed.match(/[\d.]+/);
  return match ? Number(match[0]) || 0 : 0;
};

const sortPeriodsDesc = (periods: string[]) =>
  [...periods].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));

const ExecutiveTooltip: React.FC<any> = ({ active, payload, label, unit = 'million' }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      dir="rtl"
      className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-lg p-3 text-xs text-slate-800 space-y-1.5 min-w-[190px]"
    >
      {label && <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">{label}</div>}
      {payload.map((entry: any, idx: number) => {
        const val = Number(entry.value || 0);
        const formatted =
          unit === 'million'
            ? formatRial(Math.round(val * 1_000_000))
            : unit === 'rial'
            ? formatRial(Math.round(val))
            : `${toPersianDigits(val)} نفر`;
        return (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color || entry.payload?.fill || '#1e293b' }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-bold text-slate-900 persian-num">{formatted}</span>
          </div>
        );
      })}
    </div>
  );
};

export const CeoDashboardModule: React.FC<CeoDashboardModuleProps> = ({
  users = [],
  personnel,
  karanehList,
  payrollList,
  jobGroups,
  jobClassifications,
  commitments,
  miningVolumes,
  miningMachinery,
  unitReports = [],
  onSaveVolume,
  onBatchImportVolumes,
  onDeleteVolume,
  onBatchDeleteVolumes,
  onDeleteAllVolumes,
  onSaveMachinery,
  onBatchImportMachinery,
  onDeleteMachinery,
  onBatchDeleteMachinery,
  onDeleteAllMachinery,
  granularPermissions,
  isSuperAdmin = false,
}) => {
  const canCreate = isSuperAdmin || (granularPermissions?.create ?? false);
  const canEdit = isSuperAdmin || (granularPermissions?.edit ?? false);
  const canDelete = isSuperAdmin || (granularPermissions?.delete ?? false);
  const canDeleteAll = isSuperAdmin || (granularPermissions?.deleteAll ?? false);
  const canImportExcel = isSuperAdmin || (granularPermissions?.importExcel ?? false);
  const canExport = isSuperAdmin || (granularPermissions?.exportExcel ?? false);
  const canPrint = isSuperAdmin || (granularPermissions?.print ?? false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const ceoDisplayName = useMemo(() => {
    const candidates = (users || []).filter((u) => u.isActive !== false);
    const byRoleNonAdmin = candidates.find(
      (u) =>
        u.role !== 'super_admin' &&
        (u.role?.includes('مدیر عامل') || u.role?.includes('مدیرعامل'))
    );
    const byRoleAny = candidates.find(
      (u) => u.role?.includes('مدیر عامل') || u.role?.includes('مدیرعامل')
    );
    const byPermission = candidates.find(
      (u) =>
        u.username !== 'javadabadiyan' &&
        u.role !== 'super_admin' &&
        Boolean(u.permissions?.ceoDashboard?.view)
    );
    const matched = byRoleNonAdmin || byRoleAny || byPermission;
    if (matched?.fullName?.trim()) {
      const cleanName = matched.fullName
        .replace(/^(جناب\s+آقای\s+)?(مهندس\s+)?/u, '')
        .trim();
      return `جناب آقای مهندس ${cleanName}`;
    }
    return 'جناب آقای مهندس مدیر عامل محترم شرکت نگین پرتو نصر';
  }, [users]);

  const payrollPeriods = useMemo(() => {
    const s = new Set<string>();
    payrollList.forEach((p) => {
      if (p.period) s.add(p.period);
    });
    return sortPeriodsDesc(Array.from(s));
  }, [payrollList]);

  const karanehPeriods = useMemo(() => {
    const s = new Set<string>();
    karanehList.forEach((k) => {
      if (k.period) s.add(k.period);
    });
    return sortPeriodsDesc(Array.from(s));
  }, [karanehList]);

  const [selectedPayrollPeriod, setSelectedPayrollPeriod] = useState<string>(() => payrollPeriods[0] || '');
  const [selectedKaranehPeriod, setSelectedKaranehPeriod] = useState<string>(() => karanehPeriods[0] || '');
  const [siteOrDeptFilter, setSiteOrDeptFilter] = useState<string>('all');
  const [activeRegisterTab, setActiveRegisterTab] = useState<'alerts' | 'sites' | 'mining'>('alerts');

  const activePayrollPeriod =
    selectedPayrollPeriod && payrollPeriods.includes(selectedPayrollPeriod)
      ? selectedPayrollPeriod
      : payrollPeriods[0] || '';
  const prevPayrollPeriod = useMemo(() => {
    const idx = payrollPeriods.indexOf(activePayrollPeriod);
    return idx >= 0 && idx + 1 < payrollPeriods.length ? payrollPeriods[idx + 1] : '';
  }, [payrollPeriods, activePayrollPeriod]);

  const activeKaranehPeriod =
    selectedKaranehPeriod && karanehPeriods.includes(selectedKaranehPeriod)
      ? selectedKaranehPeriod
      : karanehPeriods[0] || '';
  const prevKaranehPeriod = useMemo(() => {
    const idx = karanehPeriods.indexOf(activeKaranehPeriod);
    return idx >= 0 && idx + 1 < karanehPeriods.length ? karanehPeriods[idx + 1] : '';
  }, [karanehPeriods, activeKaranehPeriod]);

  // Distinct work locations + departments for executive filter
  const siteAndDeptOptions = useMemo(() => {
    const locations = new Set<string>();
    const depts = new Set<string>();
    payrollList.forEach((p) => {
      if (p.workLocation) locations.add(p.workLocation.trim());
      if (p.department) depts.add(p.department.trim());
    });
    jobClassifications.forEach((jc) => {
      if (jc.workLocation) locations.add(jc.workLocation.trim());
      if (jc.department) depts.add(jc.department.trim());
    });
    personnel.forEach((p) => {
      if (p.department) depts.add(p.department.trim());
    });
    return {
      locations: Array.from(locations).sort((a, b) => a.localeCompare(b, 'fa')),
      departments: Array.from(depts).sort((a, b) => a.localeCompare(b, 'fa')),
    };
  }, [payrollList, jobClassifications, personnel]);

  const matchesSiteFilter = (workLocation?: string, dept?: string) => {
    if (siteOrDeptFilter === 'all') return true;
    if (siteOrDeptFilter.startsWith('loc:')) {
      return (workLocation || '').trim() === siteOrDeptFilter.slice(4);
    }
    if (siteOrDeptFilter.startsWith('dept:')) {
      return (dept || '').trim() === siteOrDeptFilter.slice(5);
    }
    return true;
  };

  const classificationByCode = useMemo(() => {
    const m = new Map<string, JobClassificationRecord>();
    jobClassifications.forEach((jc) => {
      if (jc.personnelCode) m.set(String(jc.personnelCode).trim(), jc);
    });
    return m;
  }, [jobClassifications]);

  const filteredPersonnel = useMemo(() => {
    return personnel.filter((p) => {
      const jc = classificationByCode.get(String(p.personnelCode || '').trim());
      return matchesSiteFilter(jc?.workLocation, p.department);
    });
  }, [personnel, classificationByCode, siteOrDeptFilter]);

  const filteredPersonnelCodes = useMemo(
    () => new Set(filteredPersonnel.map((p) => String(p.personnelCode || '').trim())),
    [filteredPersonnel]
  );

  const currPayrollRecords = useMemo(
    () =>
      payrollList.filter(
        (r) => r.period === activePayrollPeriod && matchesSiteFilter(r.workLocation, r.department)
      ),
    [payrollList, activePayrollPeriod, siteOrDeptFilter]
  );

  const prevPayrollRecords = useMemo(
    () =>
      payrollList.filter(
        (r) => r.period === prevPayrollPeriod && matchesSiteFilter(r.workLocation, r.department)
      ),
    [payrollList, prevPayrollPeriod, siteOrDeptFilter]
  );

  const currKaranehRecords = useMemo(
    () =>
      karanehList.filter((k) => {
        if (k.period !== activeKaranehPeriod) return false;
        const jc = classificationByCode.get(String(k.personnelCode || '').trim());
        return matchesSiteFilter(jc?.workLocation, k.department);
      }),
    [karanehList, activeKaranehPeriod, classificationByCode, siteOrDeptFilter]
  );

  const prevKaranehRecords = useMemo(
    () =>
      karanehList.filter((k) => {
        if (k.period !== prevKaranehPeriod) return false;
        const jc = classificationByCode.get(String(k.personnelCode || '').trim());
        return matchesSiteFilter(jc?.workLocation, k.department);
      }),
    [karanehList, prevKaranehPeriod, classificationByCode, siteOrDeptFilter]
  );

  const filteredCommitments = useMemo(() => {
    if (siteOrDeptFilter === 'all') return commitments;
    return commitments.filter((c) => filteredPersonnelCodes.has(String(c.personnelCode || '').trim()));
  }, [commitments, siteOrDeptFilter, filteredPersonnelCodes]);

  const filteredClassifications = useMemo(
    () => jobClassifications.filter((jc) => matchesSiteFilter(jc.workLocation, jc.department)),
    [jobClassifications, siteOrDeptFilter]
  );

  // Financial & Executive KPIs
  const payrollTotals = useMemo(() => {
    const net = currPayrollRecords.reduce((s, r) => s + Number(r.netPayable || 0), 0);
    const prevNet = prevPayrollRecords.reduce((s, r) => s + Number(r.netPayable || 0), 0);
    const benefits = currPayrollRecords.reduce((s, r) => s + Number(r.totalBenefits || 0), 0);
    const deductions = currPayrollRecords.reduce((s, r) => s + Number(r.totalDeductions || 0), 0);
    const tax = currPayrollRecords.reduce((s, r) => s + Number(r.taxAmount || 0), 0);
    const overtime = currPayrollRecords.reduce((s, r) => s + Number(r.overtimeAmount || 0), 0);
    const growthPct = prevNet > 0 ? ((net - prevNet) / prevNet) * 100 : 0;
    const avgNet = currPayrollRecords.length > 0 ? Math.round(net / currPayrollRecords.length) : 0;
    return { net, prevNet, benefits, deductions, tax, overtime, growthPct, avgNet };
  }, [currPayrollRecords, prevPayrollRecords]);

  const karanehTotals = useMemo(() => {
    const total = currKaranehRecords.reduce((s, k) => s + Number(k.finalKaraneh || 0), 0);
    const prevTotal = prevKaranehRecords.reduce((s, k) => s + Number(k.finalKaraneh || 0), 0);
    const overtimeBonus = currKaranehRecords.reduce((s, k) => s + Number(k.overtimeBonus || 0), 0);
    const growthPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const avg = currKaranehRecords.length > 0 ? Math.round(total / currKaranehRecords.length) : 0;
    return { total, prevTotal, overtimeBonus, growthPct, avg };
  }, [currKaranehRecords, prevKaranehRecords]);

  const activeWorkforce = useMemo(
    () => filteredPersonnel.filter((p) => p.status === 'فعال').length,
    [filteredPersonnel]
  );
  const docsCompletedCount = useMemo(
    () =>
      filteredPersonnel.filter(
        (p) =>
          Boolean(p.documents?.nationalCardImage) ||
          Boolean(p.documents?.shenasnamehPages && p.documents.shenasnamehPages.length > 0)
      ).length,
    [filteredPersonnel]
  );
  const totalBaseSalaryOrder = useMemo(
    () => filteredPersonnel.reduce((s, p) => s + Number(p.baseSalary || 0), 0),
    [filteredPersonnel]
  );

  // Commitment financial exposure & alerts
  const commitmentAnalysis = useMemo(() => {
    const active = filteredCommitments.filter((c) => !c.isArchived && c.status === 'جاری و معتبر');
    const totalCurrentAmount = active.reduce((s, c) => s + Number(c.amount || 0), 0);
    const totalTaken = active.reduce((s, c) => s + Number(c.previouslyTakenAmount || 0), 0);
    const totalCeiling = active.reduce((s, c) => s + Number(c.maxAllowedAmount || c.amount || 0), 0);
    const utilizationPct = totalCeiling > 0 ? ((totalCurrentAmount + totalTaken) / totalCeiling) * 100 : 0;

    const riskRows = active.map((c) => {
      const ceiling = Number(c.maxAllowedAmount || c.amount || 0);
      const used = Number(c.amount || 0) + Number(c.previouslyTakenAmount || 0);
      const util = ceiling > 0 ? (used / ceiling) * 100 : 0;
      let riskNote = 'وضعیت عادی';
      if (util > 100) riskNote = 'تجاوز از سقف مجاز تعهد';
      else if (util >= 85) riskNote = 'نزدیک به سقف مجاز (بالای ۸۵٪)';
      else if (!c.guarantorName) riskNote = 'بدون ضامن ثبت‌شده';
      return {
        personnelCode: c.personnelCode,
        personnelName: c.personnelName,
        commitmentType: c.commitmentType,
        status: c.status,
        amount: Number(c.amount || 0),
        previouslyTaken: Number(c.previouslyTakenAmount || 0),
        maxAllowed: ceiling,
        utilizationPercent: util,
        endDate: c.endDate || 'نامشخص',
        riskNote,
        isHighRisk: util >= 85 || !c.guarantorName,
      };
    });

    return {
      activeCount: active.length,
      archivedCount: filteredCommitments.filter((c) => c.isArchived).length,
      totalCurrentAmount,
      totalCeiling,
      utilizationPct,
      riskRows,
      highRiskCount: riskRows.filter((r) => r.isHighRisk).length,
    };
  }, [filteredCommitments]);

  // Mining Classification Metrics
  const miningMetrics = useMemo(() => {
    const total = filteredClassifications.length;
    const totalMiningDays = filteredClassifications.reduce(
      (s, jc) => s + parseFirstNumber(jc.miningExperienceDays),
      0
    );
    const avgMiningDays = total > 0 ? Math.round(totalMiningDays / total) : 0;
    const nearUpgradeCount = filteredClassifications.filter((jc) => {
      const gap = (jc.nextGroupGap || '').trim();
      if (!gap) return false;
      const num = parseFirstNumber(gap);
      return gap.includes('آماده') || gap.includes('ماه') || (num > 0 && num <= 1);
    }).length;

    return { total, avgMiningDays, nearUpgradeCount };
  }, [filteredClassifications]);

  // Site / Department Consolidated Cost Breakdown
  const siteAndDeptCosts = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        personnelCount: number;
        payrollRecordsCount: number;
        totalNetPayroll: number;
        totalBenefits: number;
        totalTax: number;
        overtimeCost: number;
        totalKaraneh: number;
      }
    >();

    const ensure = (name: string) => {
      const key = (name || 'تعیین نشده').trim();
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          personnelCount: 0,
          payrollRecordsCount: 0,
          totalNetPayroll: 0,
          totalBenefits: 0,
          totalTax: 0,
          overtimeCost: 0,
          totalKaraneh: 0,
        });
      }
      return map.get(key)!;
    };

    filteredPersonnel.forEach((p) => {
      const jc = classificationByCode.get(String(p.personnelCode || '').trim());
      const bucketName = jc?.workLocation || p.department || 'ستاد و نامشخص';
      ensure(bucketName).personnelCount += 1;
    });

    currPayrollRecords.forEach((r) => {
      const bucketName = r.workLocation || r.department || 'ستاد و نامشخص';
      const b = ensure(bucketName);
      b.payrollRecordsCount += 1;
      b.totalNetPayroll += Number(r.netPayable || 0);
      b.totalBenefits += Number(r.totalBenefits || 0);
      b.totalTax += Number(r.taxAmount || 0);
      b.overtimeCost += Number(r.overtimeAmount || 0);
    });

    currKaranehRecords.forEach((k) => {
      const jc = classificationByCode.get(String(k.personnelCode || '').trim());
      const bucketName = jc?.workLocation || k.department || 'ستاد و نامشخص';
      ensure(bucketName).totalKaraneh += Number(k.finalKaraneh || 0);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgNetPayroll:
          item.payrollRecordsCount > 0 ? Math.round(item.totalNetPayroll / item.payrollRecordsCount) : 0,
        netMillion: Number((item.totalNetPayroll / 1_000_000).toFixed(1)),
        karanehMillion: Number((item.totalKaraneh / 1_000_000).toFixed(1)),
        overtimeMillion: Number((item.overtimeCost / 1_000_000).toFixed(1)),
      }))
      .sort((a, b) => b.totalNetPayroll + b.totalKaraneh - (a.totalNetPayroll + a.totalKaraneh));
  }, [filteredPersonnel, currPayrollRecords, currKaranehRecords, classificationByCode]);

  // Multi-Period Trend (Payroll Net + Karaneh across periods)
  const monthlyTrendData = useMemo(() => {
    const allPeriods = Array.from(
      new Set([
        ...payrollList.map((p) => p.period).filter(Boolean),
        ...karanehList.map((k) => k.period).filter(Boolean),
      ])
    ).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

    return allPeriods.slice(-8).map((period) => {
      const prRows = payrollList.filter(
        (r) => r.period === period && matchesSiteFilter(r.workLocation, r.department)
      );
      const krRows = karanehList.filter((k) => {
        if (k.period !== period) return false;
        const jc = classificationByCode.get(String(k.personnelCode || '').trim());
        return matchesSiteFilter(jc?.workLocation, k.department);
      });
      const prTotal = prRows.reduce((s, r) => s + Number(r.netPayable || 0), 0);
      const krTotal = krRows.reduce((s, k) => s + Number(k.finalKaraneh || 0), 0);
      return {
        period: toPersianDigits(period),
        payrollMillion: Number((prTotal / 1_000_000).toFixed(1)),
        karanehMillion: Number((krTotal / 1_000_000).toFixed(1)),
        headcount: Math.max(prRows.length, krRows.length),
      };
    });
  }, [payrollList, karanehList, classificationByCode, siteOrDeptFilter]);

  // Role Tier Analysis (مدیر / رئیس / مسئول / کارشناس / اپراتور / سایر)
  const roleTierStats = useMemo(() => {
    const map = new Map<string, { tier: string; count: number; totalNet: number; values: number[] }>();
    ROLE_TIER_ORDER.forEach((t) => map.set(t, { tier: t, count: 0, totalNet: 0, values: [] }));

    if (currPayrollRecords.length > 0) {
      currPayrollRecords.forEach((r) => {
        const tier = classifyPayrollRoleTier(r.position, r.jobTitle);
        const entry = map.get(tier)!;
        const net = Number(r.netPayable || 0);
        entry.count += 1;
        entry.totalNet += net;
        entry.values.push(net);
      });
    } else {
      // Fallback to Personnel base salary when Payroll is not yet imported
      filteredPersonnel.forEach((p) => {
        const tier = classifyPayrollRoleTier(p.position, '');
        const entry = map.get(tier)!;
        const sal = Number(p.baseSalary || 0);
        entry.count += 1;
        entry.totalNet += sal;
        entry.values.push(sal);
      });
    }

    return Array.from(map.values())
      .filter((x) => x.count > 0)
      .map((x, idx) => ({
        tier: x.tier,
        count: x.count,
        totalNet: x.totalNet,
        avgNet: x.count > 0 ? Math.round(x.totalNet / x.count) : 0,
        maxNet: x.values.length > 0 ? Math.max(...x.values) : 0,
        minNet: x.values.length > 0 ? Math.min(...x.values) : 0,
        totalMillion: Number((x.totalNet / 1_000_000).toFixed(1)),
        avgMillion: x.count > 0 ? Number((x.totalNet / x.count / 1_000_000).toFixed(1)) : 0,
        color: CEO_CHART_PALETTE[idx % CEO_CHART_PALETTE.length],
      }));
  }, [currPayrollRecords, filteredPersonnel]);

  // Job Groups Distribution for CEO View
  const ceoJobGroupStats = useMemo(() => {
    const map = new Map<string, { label: string; count: number; totalSalary: number }>();
    filteredPersonnel.forEach((p) => {
      const matched = jobGroups.find((g) => g.id === p.jobGroupId);
      const jc = classificationByCode.get(String(p.personnelCode || '').trim());
      const label = matched ? matched.code : jc?.jobGroup || p.jobGroupName || 'سایر';
      const cur = map.get(label) || { label, count: 0, totalSalary: 0 };
      cur.count += 1;
      cur.totalSalary += Number(p.baseSalary || 0);
      map.set(label, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map((item, idx) => ({
        ...item,
        avgSalary: item.count > 0 ? Math.round(item.totalSalary / item.count) : 0,
        color: CEO_CHART_PALETTE[idx % CEO_CHART_PALETTE.length],
      }));
  }, [filteredPersonnel, jobGroups, classificationByCode]);

  // Executive Risk & Action Alerts
  const executiveAlerts = useMemo(() => {
    const alerts: { severity: 'high' | 'medium' | 'info'; category: string; title: string; detail: string }[] = [];

    const overCeiling = commitmentAnalysis.riskRows.filter((r) => r.utilizationPercent >= 85);
    if (overCeiling.length > 0) {
      alerts.push({
        severity: 'high',
        category: 'ریسک مالی تعهدات',
        title: `${toPersianDigits(overCeiling.length)} فقره تعهد پرسنلی در آستانه یا بالاتر از سقف مجاز`,
        detail: `بالاترین مورد: ${overCeiling[0].personnelName} (${formatPercent(overCeiling[0].utilizationPercent)} مصرف سقف)`,
      });
    }

    const missingDocs = filteredPersonnel.filter(
      (p) => !p.documents?.nationalCardImage && !(p.documents?.shenasnamehPages && p.documents.shenasnamehPages.length > 0)
    );
    if (missingDocs.length > 0) {
      alerts.push({
        severity: 'medium',
        category: 'انطباق پرونده پرسنلی',
        title: `${toPersianDigits(missingDocs.length)} پرونده پرسنلی فاقد تصویر کارت ملی یا شناسنامه اسکن‌شده`,
        detail: `پوشش مدارک فعلی: ${formatPercent(
          filteredPersonnel.length > 0 ? (docsCompletedCount / filteredPersonnel.length) * 100 : 0
        )}`,
      });
    }

    if (miningMetrics.nearUpgradeCount > 0) {
      alerts.push({
        severity: 'info',
        category: 'طبقه‌بندی مشاغل معدنی',
        title: `${toPersianDigits(miningMetrics.nearUpgradeCount)} نفر از کارکنان در آستانه ارتقای گروه شغلی`,
        detail: 'نیازمند پیش‌بینی بودجه اصلاح احکام و سابقه معدنی در دوره آتی',
      });
    }

    if (payrollTotals.overtime > 0 && payrollTotals.net > 0) {
      const overtimeRatio = (payrollTotals.overtime / payrollTotals.net) * 100;
      if (overtimeRatio >= 12) {
        alerts.push({
          severity: 'medium',
          category: 'هزینه اضافه‌کاری',
          title: `سهم اضافه‌کاری ${formatPercent(overtimeRatio)} از خالص پرداختی دوره است`,
          detail: `مجموع اضافه‌کار دوره: ${formatRial(payrollTotals.overtime)}`,
        });
      }
    }

    if (prevPayrollRecords.length > 0 && currPayrollRecords.length > 0) {
      const prevMap = new Map(prevPayrollRecords.map((r) => [String(r.personnelCode).trim(), r]));
      const jumps = currPayrollRecords.filter((r) => {
        const prev = prevMap.get(String(r.personnelCode).trim());
        if (!prev || prev.netPayable <= 0) return false;
        return Math.abs((r.netPayable - prev.netPayable) / prev.netPayable) >= 0.25;
      });
      if (jumps.length > 0) {
        alerts.push({
          severity: 'high',
          category: 'نوسان حقوقی بالای ۲۵٪',
          title: `${toPersianDigits(jumps.length)} فیش حقوقی دارای جهش یا افت بیش از ۲۵٪ نسبت به ماه قبل`,
          detail: `نمونه: ${jumps[0].fullName} (${jumps[0].workLocation || jumps[0].department || 'ستاد'})`,
        });
      }
    }

    return alerts;
  }, [
    commitmentAnalysis.riskRows,
    filteredPersonnel,
    docsCompletedCount,
    miningMetrics.nearUpgradeCount,
    payrollTotals,
    prevPayrollRecords,
    currPayrollRecords,
  ]);

  const miningUnitsBreakdown = useMemo(
    () =>
      buildMiningUnitsBreakdown({
        personnel: filteredPersonnel,
        currPayrollRecords,
        currKaranehRecords,
        commitments: filteredCommitments,
        classifications: filteredClassifications,
        miningVolumes,
        miningMachinery,
        unitReports,
      }),
    [filteredPersonnel, currPayrollRecords, currKaranehRecords, filteredCommitments, filteredClassifications, miningVolumes, miningMachinery, unitReports]
  );

  const unitReportsSummaryByUnit = useMemo(() => {
    const map = new Map<string, { unitName: string; reportsCount: number; actualSum: number; prevSum: number; targetSum: number; latestPeriod: string }>();
    unitReports.forEach((r) => {
      const key = (r.unitName || 'نامشخص').trim();
      if (!map.has(key)) {
        map.set(key, {
          unitName: key,
          reportsCount: 0,
          actualSum: 0,
          prevSum: 0,
          targetSum: 0,
          latestPeriod: r.period || '',
        });
      }
      const bucket = map.get(key)!;
      bucket.reportsCount += 1;
      bucket.actualSum += Number(r.actualValue || 0);
      bucket.prevSum += Number(r.previousValue || 0);
      bucket.targetSum += Number(r.targetValue || 0);
      if ((r.period || '').localeCompare(bucket.latestPeriod) > 0) {
        bucket.latestPeriod = r.period;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.actualSum - a.actualSum);
  }, [unitReports]);

  const selectedFilterLabel =
    siteOrDeptFilter === 'all'
      ? 'کل شرکت و تمام مجتمع‌های معدنی'
      : siteOrDeptFilter.startsWith('loc:')
      ? `محل خدمت: ${siteOrDeptFilter.slice(4)}`
      : `واحد: ${siteOrDeptFilter.slice(5)}`;

  const handleExportExcel = () => {
    exportCeoExecutiveReportToExcel({
      reportTitle: 'گزارش جامع راهبردی مدیر عامل شرکت نگین پرتو نصر',
      companyName: 'شرکت نگین پرتو نصر',
      ceoDisplayName,
      payrollPeriodLabel: activePayrollPeriod || 'ثبت نشده',
      karanehPeriodLabel: activeKaranehPeriod || 'ثبت نشده',
      selectedSiteOrDept: selectedFilterLabel,
      volumeRecords: miningVolumes.map((v) => ({
        period: v.period,
        unitName: v.unitName,
        activityType: v.activityType,
        metricTitle: v.metricTitle,
        volumeValue: v.volumeValue,
        targetVolume: v.targetVolume,
        unitLabel: v.unitLabel,
        status: v.status,
        notes: v.notes,
      })),
      machineryRecords: miningMachinery.map((m) => ({
        machineCode: m.machineCode,
        machineName: m.machineName,
        machineType: m.machineType,
        unitName: m.unitName,
        status: m.status,
        issueDescription: m.issueDescription,
        stoppedSince: m.stoppedSince,
        estimatedReadyDate: m.estimatedReadyDate,
        operatorName: m.operatorName,
        notes: m.notes,
      })),
      unitReports: unitReports.map((r) => ({
        period: r.period,
        unitName: r.unitName,
        reportCategory: r.reportCategory,
        metricName: r.metricName,
        actualValue: r.actualValue,
        previousValue: r.previousValue,
        targetValue: r.targetValue,
        unitLabel: r.unitLabel,
        status: r.status,
        submittedBy: r.submittedBy,
        notes: r.notes,
      })),
      kpis: [
        { label: 'کل پرسنل محدوده', value: `${filteredPersonnel.length} نفر (${activeWorkforce} فعال)`, note: `تکمیل مدارک: ${docsCompletedCount} نفر` },
        { label: 'جمع خالص پرداختی حقوق دوره', value: payrollTotals.net, note: `تغییر نسبت به ماه قبل: ${payrollTotals.growthPct.toFixed(1)}%` },
        { label: 'جمع مزایا / مالیات / اضافه‌کار دوره', value: `${formatRial(payrollTotals.benefits)} / ${formatRial(payrollTotals.tax)} / ${formatRial(payrollTotals.overtime)}`, note: 'ارقام ریالی دوره مبنا' },
        { label: 'بودجه کارانه دوره', value: karanehTotals.total, note: `میانگین کارانه هر نفر: ${formatRial(karanehTotals.avg)}` },
        { label: 'مجموع حقوق پایه احکام کارگزینی', value: totalBaseSalaryOrder, note: 'جمع کل پایه‌های ثبت‌شده' },
        { label: 'سقف و ریسک تعهدات جاری', value: commitmentAnalysis.totalCurrentAmount, note: `نرخ مصرف سقف: ${commitmentAnalysis.utilizationPct.toFixed(1)}% | موارد پرریسک: ${commitmentAnalysis.highRiskCount}` },
        { label: 'میانگین سابقه معدنی (روز)', value: `${miningMetrics.avgMiningDays} روز`, note: `نفرات در آستانه ارتقای گروه: ${miningMetrics.nearUpgradeCount} نفر` },
      ],
      siteAndDeptCosts: siteAndDeptCosts.map((s) => ({
        name: s.name,
        personnelCount: s.personnelCount,
        payrollRecordsCount: s.payrollRecordsCount,
        totalNetPayroll: s.totalNetPayroll,
        totalBenefits: s.totalBenefits,
        totalTax: s.totalTax,
        overtimeCost: s.overtimeCost,
        totalKaraneh: s.totalKaraneh,
        avgNetPayroll: s.avgNetPayroll,
      })),
      roleTierSummary: roleTierStats.map((r) => ({
        tier: r.tier,
        count: r.count,
        totalNet: r.totalNet,
        avgNet: r.avgNet,
        maxNet: r.maxNet,
        minNet: r.minNet,
      })),
      jobGroupDistribution: ceoJobGroupStats.map((g) => ({
        label: g.label,
        count: g.count,
        avgSalary: g.avgSalary,
        totalSalary: g.totalSalary,
      })),
      commitmentsRiskRows: commitmentAnalysis.riskRows,
      miningClassificationRows: filteredClassifications.map((jc) => ({
        personnelCode: jc.personnelCode,
        fullName: `${jc.firstName} ${jc.lastName}`.trim(),
        workLocation: jc.workLocation,
        department: jc.department,
        jobTitle: jc.jobTitle,
        position: jc.position,
        jobGroup: jc.jobGroup,
        miningExperienceDays: jc.miningExperienceDays,
        miningExperience: jc.miningExperience,
        nonMiningExperience: jc.nonMiningExperience,
        groupGapFrom1405: jc.groupGapFrom1405,
        nextGroupGap: jc.nextGroupGap,
      })),
      miningUnitsBreakdown: miningUnitsBreakdown.map((u) => ({
        unitName: u.unitName,
        category: u.category,
        personnelCount: u.personnelCount,
        activeCount: u.activeCount,
        relativesCount: u.relativesCount,
        payrollCount: u.payrollCount,
        totalNetPayroll: u.totalNetPayroll,
        totalBenefits: u.totalBenefits,
        overtimeCost: u.overtimeCost,
        totalKaraneh: u.totalKaraneh,
        avgNetPayroll: u.avgNetPayroll,
        commitmentsCount: u.commitmentsCount,
        commitmentsAmount: u.commitmentsAmount,
        classificationsCount: u.classificationsCount,
      })),
    });
  };

  const latestVolPeriod = useMemo(() => {
    const ps = Array.from(new Set(miningVolumes.map((v) => v.period).filter(Boolean))).sort((a, b) =>
      b.localeCompare(a)
    );
    return ps[0] || '';
  }, [miningVolumes]);

  const prevVolPeriod = useMemo(() => {
    const ps = Array.from(new Set(miningVolumes.map((v) => v.period).filter(Boolean))).sort((a, b) =>
      b.localeCompare(a)
    );
    return ps[1] || '';
  }, [miningVolumes]);

  const buildCeoPrintableHtml = () => {
    const siteRowsHtml = siteAndDeptCosts
      .slice(0, 14)
      .map(
        (s, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${s.name}</b></td>
        <td>${toPersianDigits(s.personnelCount)}</td>
        <td>${toPersianDigits(s.payrollRecordsCount)}</td>
        <td>${formatRial(s.totalNetPayroll)}</td>
        <td>${formatRial(s.overtimeCost)}</td>
        <td>${formatRial(s.totalKaraneh)}</td>
      </tr>`
      )
      .join('');

    const tierRowsHtml = roleTierStats
      .map(
        (r, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${r.tier}</b></td>
        <td>${toPersianDigits(r.count)} نفر</td>
        <td>${formatRial(r.totalNet)}</td>
        <td>${formatRial(r.avgNet)}</td>
        <td>${formatRial(r.maxNet)}</td>
        <td>${formatRial(r.minNet)}</td>
      </tr>`
      )
      .join('');

    const alertsHtml = executiveAlerts
      .map(
        (a) => `
      <tr>
        <td><b>${a.category}</b></td>
        <td>${a.title}</td>
        <td>${a.detail}</td>
      </tr>`
      )
      .join('');

    const miningUnitRowsHtml = miningUnitsBreakdown
      .filter((u) => u.personnelCount > 0 || u.payrollCount > 0 || u.totalKaraneh > 0 || u.isStandardCatalog)
      .map(
        (u, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${u.unitName}</b> <span style="color:#64748b;font-size:8.5px;">(${u.category})</span></td>
        <td>${toPersianDigits(u.personnelCount)} (${toPersianDigits(u.activeCount)} فعال)</td>
        <td>${toPersianDigits(u.relativesCount)}</td>
        <td>${formatRial(u.totalNetPayroll)}</td>
        <td>${formatRial(u.overtimeCost)}</td>
        <td>${formatRial(u.totalKaraneh)}</td>
        <td>${toPersianDigits(u.commitmentsCount)} فقره</td>
      </tr>`
      )
      .join('');

    const volCurrList = miningVolumes.filter((v) => v.period === latestVolPeriod);
    const volPrevList = miningVolumes.filter((v) => v.period === prevVolPeriod);
    const volumeRowsHtml = volCurrList
      .map((v, idx) => {
        const matchPrev = volPrevList.find(
          (p) => p.unitName === v.unitName && (p.metricTitle || p.activityType) === (v.metricTitle || v.activityType)
        );
        const prevVal = matchPrev ? Number(matchPrev.volumeValue || 0) : 0;
        const diff = Number(v.volumeValue || 0) - prevVal;
        return `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${v.unitName}</b></td>
        <td>${v.metricTitle || v.activityType}</td>
        <td>${toPersianDigits(prevVal.toLocaleString('en-US'))} ${v.unitLabel}</td>
        <td><b>${toPersianDigits(Number(v.volumeValue || 0).toLocaleString('en-US'))} ${v.unitLabel}</b></td>
        <td>${diff >= 0 ? '+' : ''}${toPersianDigits(diff.toLocaleString('en-US'))}</td>
        <td>${toPersianDigits(Number(v.targetVolume || 0).toLocaleString('en-US'))} ${v.unitLabel}</td>
      </tr>`;
      })
      .join('');

    const machineryRowsHtml = miningMachinery
      .map(
        (m, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><b>${toPersianDigits(m.machineCode)}</b></td>
        <td>${m.machineName} (${m.machineType})</td>
        <td>${m.unitName}</td>
        <td><b>${m.status}</b></td>
        <td>${m.issueDescription || '-'}</td>
        <td>${toPersianDigits(m.stoppedSince || '-')} / تحویل: ${toPersianDigits(m.estimatedReadyDate || '-')}</td>
      </tr>`
      )
      .join('');

    const unitReportRowsHtml = unitReports
      .slice(0, 35)
      .map(
        (r, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td>${getPeriodLabel(r.period)}</td>
        <td><b>${r.unitName}</b></td>
        <td>${r.metricName}</td>
        <td>${toPersianDigits(Number(r.previousValue || 0).toLocaleString('en-US'))} ${r.unitLabel}</td>
        <td><b>${toPersianDigits(Number(r.actualValue || 0).toLocaleString('en-US'))} ${r.unitLabel}</b></td>
        <td>${toPersianDigits(Number(r.targetValue || 0).toLocaleString('en-US'))} ${r.unitLabel}</td>
        <td>${r.submittedBy || '-'}</td>
      </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>گزارش رسمی مدیر عامل شرکت نگین پرتو نصر</title>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Vazirmatn', Tahoma, sans-serif; }
    body { margin: 0; padding: 14px; color: #0f172a; background: #fff; font-size: 10.5px; direction: rtl; font-feature-settings: "ss01" 1, "tnum" 1; }
    .hdr { border-bottom: 2.5px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
    .hdr h1 { margin: 0; font-size: 16px; font-weight: 800; }
    .hdr p { margin: 3px 0 0; font-size: 10px; color: #475569; }
    .ceo-badge { font-size: 11.5px; font-weight: 800; color: #b45309; margin-top: 4px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
    .kpi span { display: block; font-size: 9px; color: #475569; }
    .kpi b { display: block; font-size: 12px; margin-top: 2px; color: #0f172a; }
    h2 { font-size: 12px; margin: 12px 0 6px; padding-right: 6px; border-right: 3px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 4.5px 6px; text-align: right; font-size: 9.5px; }
    th { background: #f1f5f9; font-weight: 700; }
    .sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 24px; text-align: center; }
    .sign-box { border-top: 1px solid #64748b; padding-top: 6px; font-size: 10px; font-weight: bold; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>گزارش راهبردی مدیر عامل شرکت نگین پرتو نصر</h1>
      <div class="ceo-badge">${ceoDisplayName} — مدیرعامل محترم شرکت</div>
      <p>محدوده: ${selectedFilterLabel} | دوره حقوق: ${toPersianDigits(activePayrollPeriod || '—')} | دوره کارانه: ${toPersianDigits(activeKaranehPeriod || '—')}</p>
    </div>
    <div style="text-align:left; font-size:9.5px;">
      <div>تاریخ تهیه گزارش: <b>${new Date().toLocaleDateString('fa-IR')}</b></div>
      <div>سطح محرمانگی: <b>گزارش رسمی مدیریت عامل نگین پرتو نصر</b></div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><span>نیروی انسانی کل / فعال</span><b>${toPersianDigits(filteredPersonnel.length)} نفر (${toPersianDigits(activeWorkforce)} فعال)</b></div>
    <div class="kpi"><span>جمع خالص حقوق دوره</span><b>${formatRial(payrollTotals.net)}</b></div>
    <div class="kpi"><span>بودجه کارانه دوره</span><b>${formatRial(karanehTotals.total)}</b></div>
    <div class="kpi"><span>تعهدات جاری / مصرف سقف</span><b>${formatRial(commitmentAnalysis.totalCurrentAmount)} (${formatPercent(commitmentAnalysis.utilizationPct)})</b></div>
    <div class="kpi"><span>دستگاه‌های آماده / در تعمیرگاه</span><b>${toPersianDigits(miningMachinery.filter((m) => m.status === 'آماده به کار').length)} آماده / ${toPersianDigits(miningMachinery.filter((m) => m.status !== 'آماده به کار').length)} متوقف</b></div>
    <div class="kpi"><span>تکمیل مدارک هویتی پرسنل</span><b>${toPersianDigits(docsCompletedCount)} از ${toPersianDigits(filteredPersonnel.length)} پرونده</b></div>
  </div>

  <h2>۱. مقایسه آمار حجم عملیات ماه جاری (${getPeriodLabel(latestVolPeriod || '-')}) نسبت به ماه قبل (${getPeriodLabel(prevVolPeriod || '-')})</h2>
  <table>
    <thead><tr><th>ردیف</th><th>واحد معدن</th><th>شاخص / عملیات</th><th>حجم ماه قبل</th><th>حجم ماه جاری</th><th>اختلاف</th><th>هدف مصوب</th></tr></thead>
    <tbody>${volumeRowsHtml || '<tr><td colspan="7">آمار حجم عملیاتی ثبت نشده است</td></tr>'}</tbody>
  </table>

  <h2>۲. وضعیت ماشین‌آلات آماده به کار و دستگاه‌های خراب در تعمیرگاه</h2>
  <table>
    <thead><tr><th>ردیف</th><th>کد دستگاه</th><th>نام و نوع</th><th>واحد مستقر</th><th>وضعیت</th><th>شرح خرابی / سرویس</th><th>توقف / تخمین تحویل</th></tr></thead>
    <tbody>${machineryRowsHtml || '<tr><td colspan="7">ماشین‌آلاتی ثبت نشده است</td></tr>'}</tbody>
  </table>

  <h2>۳. پایش واحدهای عملیاتی و پشتیبانی شرکت نگین پرتو نصر</h2>
  <table>
    <thead><tr><th>ردیف</th><th>واحد معدنی</th><th>پرسنل</th><th>بستگان</th><th>خالص حقوق</th><th>اضافه‌کاری</th><th>کارانه مصوب</th><th>تعهدات</th></tr></thead>
    <tbody>${miningUnitRowsHtml}</tbody>
  </table>

  <h2>۴. تحلیل هزینه‌های حقوق، اضافه‌کار و کارانه مراکز معدنی و واحدها</h2>
  <table>
    <thead><tr><th>ردیف</th><th>مرکز / واحد</th><th>پرسنل</th><th>فیش حقوقی</th><th>خالص پرداختی</th><th>اضافه‌کاری</th><th>کارانه مصوب</th></tr></thead>
    <tbody>${siteRowsHtml || '<tr><td colspan="7">داده‌ای ثبت نشده است</td></tr>'}</tbody>
  </table>

  <h2>۵. تحلیل جبران خدمت بر اساس رده‌های شغلی</h2>
  <table>
    <thead><tr><th>ردیف</th><th>رده سازمانی</th><th>تعداد</th><th>مجموع پرداختی</th><th>میانگین</th><th>بیشترین</th><th>کمترین</th></tr></thead>
    <tbody>${tierRowsHtml || '<tr><td colspan="7">داده‌ای ثبت نشده است</td></tr>'}</tbody>
  </table>

  ${alertsHtml ? `
  <h2>۶. کارتابل ریسک‌ها و هشدارهای راهبردی مدیریت عامل</h2>
  <table>
    <thead><tr><th>حوزه</th><th>شرح هشدار</th><th>جزئیات</th></tr></thead>
    <tbody>${alertsHtml}</tbody>
  </table>` : ''}

  ${unitReportRowsHtml ? `
  <h2>۷. تجمیع گزارش‌های بارگذاری‌شده واحدهای عملیاتی معدن</h2>
  <table>
    <thead><tr><th>ردیف</th><th>دوره</th><th>واحد</th><th>عنوان شاخص</th><th>ماه قبل</th><th>ماه جاری</th><th>هدف</th><th>مسئول ثبت</th></tr></thead>
    <tbody>${unitReportRowsHtml}</tbody>
  </table>` : ''}

  <div class="sign-grid">
    <div class="sign-box">تهیه و تنظیم: امور اداری و منابع انسانی</div>
    <div class="sign-box">تایید معاونت مالی و فنی معدن</div>
    <div class="sign-box">ملاحظه و دستور ${ceoDisplayName}</div>
  </div>
</body>
</html>`;
  };

  const handlePrintExecutiveReport = () => {
    setShowPrintPreview(true);
  };

  const handleTriggerBrowserPrint = () => {
    try {
      window.focus();
      window.print();
    } catch {
      handleDownloadExecutiveHtml();
    }
  };

  const handleDownloadExecutiveHtml = () => {
    const html = buildCeoPrintableHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش_رسمی_مدیرعامل_نگین_پرتو_نصر_${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderOfficialA4PrintContent = () => {
    const volCurrList = miningVolumes.filter((v) => v.period === latestVolPeriod);
    const volPrevList = miningVolumes.filter((v) => v.period === prevVolPeriod);
    const readyMach = miningMachinery.filter((m) => m.status === 'آماده به کار').length;
    const stoppedMach = miningMachinery.length - readyMach;

    return (
      <div className="space-y-4 text-[11px] text-slate-900">
        <div className="border-b-2 border-slate-900 pb-3 flex flex-wrap justify-between items-end gap-3">
          <div>
            <h1 className="text-base font-black text-slate-900">
              گزارش راهبردی مدیر عامل شرکت نگین پرتو نصر
            </h1>
            <div className="text-xs font-extrabold text-amber-700 mt-1">
              {ceoDisplayName} — مدیرعامل محترم شرکت
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              محدوده: {selectedFilterLabel} | دوره حقوق: {toPersianDigits(activePayrollPeriod || '—')} | دوره کارانه: {toPersianDigits(activeKaranehPeriod || '—')}
            </p>
          </div>
          <div className="text-left text-[10px] text-slate-700">
            <div>تاریخ تهیه گزارش: <b>{new Date().toLocaleDateString('fa-IR')}</b></div>
            <div>سطح محرمانگی: <b>گزارش رسمی مدیریت عامل</b></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <span className="block text-[9px] text-slate-500">نیروی انسانی کل / فعال</span>
            <b className="text-xs">{toPersianDigits(filteredPersonnel.length)} نفر ({toPersianDigits(activeWorkforce)} فعال)</b>
          </div>
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <span className="block text-[9px] text-slate-500">جمع خالص حقوق دوره</span>
            <b className="text-xs">{formatRial(payrollTotals.net)}</b>
          </div>
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <span className="block text-[9px] text-slate-500">بودجه کارانه دوره</span>
            <b className="text-xs">{formatRial(karanehTotals.total)}</b>
          </div>
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <span className="block text-[9px] text-slate-500">تعهدات جاری / مصرف سقف</span>
            <b className="text-xs">{formatRial(commitmentAnalysis.totalCurrentAmount)} ({formatPercent(commitmentAnalysis.utilizationPct)})</b>
          </div>
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <span className="block text-[9px] text-slate-500">ناوگان آماده به کار / در تعمیرگاه</span>
            <b className="text-xs">{toPersianDigits(readyMach)} آماده / {toPersianDigits(stoppedMach)} متوقف</b>
          </div>
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <span className="block text-[9px] text-slate-500">میانگین سابقه معدنی</span>
            <b className="text-xs">{toPersianDigits(miningMetrics.avgMiningDays)} روز</b>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-xs border-r-4 border-slate-900 pr-2 mb-1.5">
            ۱. مقایسه آمار حجم عملیات ماه جاری ({getPeriodLabel(latestVolPeriod || '-')}) با ماه قبل ({getPeriodLabel(prevVolPeriod || '-')})
          </h3>
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">ردیف</th>
                <th className="border border-slate-300 p-1">واحد معدن</th>
                <th className="border border-slate-300 p-1">شرح شاخص</th>
                <th className="border border-slate-300 p-1">حجم ماه قبل</th>
                <th className="border border-slate-300 p-1">حجم ماه جاری</th>
                <th className="border border-slate-300 p-1">اختلاف</th>
                <th className="border border-slate-300 p-1">برنامه هدف</th>
              </tr>
            </thead>
            <tbody>
              {volCurrList.length === 0 ? (
                <tr><td colSpan={7} className="border border-slate-300 p-2 text-center text-slate-500">آمار حجم عملیات ثبت نشده است</td></tr>
              ) : (
                volCurrList.map((v, idx) => {
                  const mp = volPrevList.find(
                    (p) => p.unitName === v.unitName && (p.metricTitle || p.activityType) === (v.metricTitle || v.activityType)
                  );
                  const prevVal = mp ? Number(mp.volumeValue || 0) : 0;
                  const diff = Number(v.volumeValue || 0) - prevVal;
                  return (
                    <tr key={v.id}>
                      <td className="border border-slate-300 p-1">{toPersianDigits(idx + 1)}</td>
                      <td className="border border-slate-300 p-1 font-bold">{v.unitName}</td>
                      <td className="border border-slate-300 p-1">{v.metricTitle || v.activityType}</td>
                      <td className="border border-slate-300 p-1">{toPersianDigits(prevVal.toLocaleString('en-US'))} {v.unitLabel}</td>
                      <td className="border border-slate-300 p-1 font-bold">{toPersianDigits(Number(v.volumeValue || 0).toLocaleString('en-US'))} {v.unitLabel}</td>
                      <td className="border border-slate-300 p-1">{diff >= 0 ? '+' : ''}{toPersianDigits(diff.toLocaleString('en-US'))}</td>
                      <td className="border border-slate-300 p-1">{toPersianDigits(Number(v.targetVolume || 0).toLocaleString('en-US'))} {v.unitLabel}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="font-bold text-xs border-r-4 border-slate-900 pr-2 mb-1.5">
            ۲. وضعیت ماشین‌آلات آماده به کار و دستگاه‌های تعمیرگاه
          </h3>
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">ردیف</th>
                <th className="border border-slate-300 p-1">کد</th>
                <th className="border border-slate-300 p-1">نام دستگاه</th>
                <th className="border border-slate-300 p-1">واحد</th>
                <th className="border border-slate-300 p-1">وضعیت</th>
                <th className="border border-slate-300 p-1">شرح خرابی / وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {miningMachinery.length === 0 ? (
                <tr><td colSpan={6} className="border border-slate-300 p-2 text-center text-slate-500">دستگاهی ثبت نشده است</td></tr>
              ) : (
                miningMachinery.map((m, idx) => (
                  <tr key={m.id}>
                    <td className="border border-slate-300 p-1">{toPersianDigits(idx + 1)}</td>
                    <td className="border border-slate-300 p-1 font-bold">{toPersianDigits(m.machineCode)}</td>
                    <td className="border border-slate-300 p-1">{m.machineName}</td>
                    <td className="border border-slate-300 p-1">{m.unitName}</td>
                    <td className="border border-slate-300 p-1 font-bold">{m.status}</td>
                    <td className="border border-slate-300 p-1">{m.issueDescription || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="font-bold text-xs border-r-4 border-slate-900 pr-2 mb-1.5">
            ۳. پایش واحدهای عملیاتی و پشتیبانی شرکت نگین پرتو نصر
          </h3>
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">ردیف</th>
                <th className="border border-slate-300 p-1">واحد</th>
                <th className="border border-slate-300 p-1">پرسنل</th>
                <th className="border border-slate-300 p-1">خالص حقوق</th>
                <th className="border border-slate-300 p-1">کارانه</th>
                <th className="border border-slate-300 p-1">تعهدات</th>
              </tr>
            </thead>
            <tbody>
              {miningUnitsBreakdown
                .filter((u) => u.personnelCount > 0 || u.payrollCount > 0 || u.totalKaraneh > 0 || u.isStandardCatalog)
                .map((u, idx) => (
                  <tr key={u.unitName}>
                    <td className="border border-slate-300 p-1">{toPersianDigits(idx + 1)}</td>
                    <td className="border border-slate-300 p-1 font-bold">{u.unitName}</td>
                    <td className="border border-slate-300 p-1">{toPersianDigits(u.personnelCount)} ({toPersianDigits(u.activeCount)} فعال)</td>
                    <td className="border border-slate-300 p-1">{formatRial(u.totalNetPayroll)}</td>
                    <td className="border border-slate-300 p-1">{formatRial(u.totalKaraneh)}</td>
                    <td className="border border-slate-300 p-1">{toPersianDigits(u.commitmentsCount)} فقره</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {unitReports.length > 0 && (
          <div>
            <h3 className="font-bold text-xs border-r-4 border-slate-900 pr-2 mb-1.5">
              ۴. تجمیع گزارش‌های عملکردی و اکسل واحدهای عملیاتی معدن
            </h3>
            <table className="w-full border-collapse border border-slate-300 text-[10px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-1">ردیف</th>
                  <th className="border border-slate-300 p-1">دوره</th>
                  <th className="border border-slate-300 p-1">واحد</th>
                  <th className="border border-slate-300 p-1">شاخص</th>
                  <th className="border border-slate-300 p-1">ماه قبل</th>
                  <th className="border border-slate-300 p-1">ماه جاری</th>
                  <th className="border border-slate-300 p-1">هدف</th>
                </tr>
              </thead>
              <tbody>
                {unitReports.slice(0, 30).map((ur, idx) => (
                  <tr key={ur.id}>
                    <td className="border border-slate-300 p-1">{toPersianDigits(idx + 1)}</td>
                    <td className="border border-slate-300 p-1">{getPeriodLabel(ur.period)}</td>
                    <td className="border border-slate-300 p-1 font-bold">{ur.unitName}</td>
                    <td className="border border-slate-300 p-1">{ur.metricName}</td>
                    <td className="border border-slate-300 p-1">{toPersianDigits(Number(ur.previousValue || 0).toLocaleString('en-US'))} {ur.unitLabel}</td>
                    <td className="border border-slate-300 p-1 font-bold">{toPersianDigits(Number(ur.actualValue || 0).toLocaleString('en-US'))} {ur.unitLabel}</td>
                    <td className="border border-slate-300 p-1">{toPersianDigits(Number(ur.targetValue || 0).toLocaleString('en-US'))} {ur.unitLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 pt-8 text-center text-[10px] font-bold">
          <div className="border-t border-slate-500 pt-2">تهیه و تنظیم: امور اداری و منابع انسانی</div>
          <div className="border-t border-slate-500 pt-2">تایید معاونت مالی و فنی معدن</div>
          <div className="border-t border-slate-500 pt-2">ملاحظه و دستور {ceoDisplayName}</div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6 no-print">
      {/* Executive Header & Filter Control Strip */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center justify-center shrink-0">
              <Pickaxe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                داشبورد راهبردی مدیر عامل شرکت نگین پرتو نصر
              </h2>
              <div className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-extrabold">
                <Crown className="w-3.5 h-3.5 shrink-0" />
                <span>{ceoDisplayName} — مدیرعامل محترم شرکت</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5">
                پایش یکپارچه عملیات و حجم استخراج، ناوگان و دستگاه‌های تعمیرگاه، واحدهای معدنی و سرمایه انسانی شرکت نگین پرتو نصر
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>خروجی اکسل جامع مدیرعامل</span>
              </button>
            )}
            {canPrint && (
              <>
                <button
                  onClick={handlePrintExecutiveReport}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-800" />
                  <span>چاپ رسمی گزارش (A4)</span>
                </button>
                <button
                  onClick={handleDownloadExecutiveHtml}
                  title="دانلود نسخه آماده چاپ مستقل A4"
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>فایل چاپی</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Executive Slice Filters */}
        <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">محل خدمت / مجتمع معدنی یا واحد:</label>
            <select
              value={siteOrDeptFilter}
              onChange={(e) => setSiteOrDeptFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-400"
            >
              <option value="all">کل شرکت (ستاد + کلیه مجتمع‌های معدنی)</option>
              {siteAndDeptOptions.locations.length > 0 && (
                <optgroup label="مراکز و مجتمع‌های محل خدمت">
                  {siteAndDeptOptions.locations.map((loc) => (
                    <option key={`loc:${loc}`} value={`loc:${loc}`}>
                      محل خدمت: {loc}
                    </option>
                  ))}
                </optgroup>
              )}
              {siteAndDeptOptions.departments.length > 0 && (
                <optgroup label="واحدهای سازمانی">
                  {siteAndDeptOptions.departments.map((d) => (
                    <option key={`dept:${d}`} value={`dept:${d}`}>
                      واحد: {d}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">دوره حقوق و دستمزد مبنا:</label>
            <select
              value={activePayrollPeriod}
              onChange={(e) => setSelectedPayrollPeriod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-400 persian-num"
            >
              {payrollPeriods.length === 0 ? (
                <option value="">دوره حقوقی بارگذاری نشده</option>
              ) : (
                payrollPeriods.map((p) => (
                  <option key={p} value={p}>
                    دوره {toPersianDigits(p)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">دوره کارانه و بهره‌وری مبنا:</label>
            <select
              value={activeKaranehPeriod}
              onChange={(e) => setSelectedKaranehPeriod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-400 persian-num"
            >
              {karanehPeriods.length === 0 ? (
                <option value="">دوره کارانه ثبت نشده</option>
              ) : (
                karanehPeriods.map((p) => (
                  <option key={p} value={p}>
                    دوره {toPersianDigits(p)}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* 6 Mining CEO KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Workforce & Sites */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>نیروی انسانی کل و مراکز معدنی</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 persian-num">
            {toPersianDigits(filteredPersonnel.length)}{' '}
            <span className="text-xs font-semibold text-slate-500">نفر</span>
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            {toPersianDigits(activeWorkforce)} شاغل فعال · تکمیل مدارک هویتی: {toPersianDigits(docsCompletedCount)} پرونده
          </div>
        </div>

        {/* 2. Payroll Commitment */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>جمع خالص پرداختی حقوق ({toPersianDigits(activePayrollPeriod || 'مبنا')})</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 persian-num">
            {currPayrollRecords.length > 0 ? formatRial(payrollTotals.net) : formatRial(totalBaseSalaryOrder)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 persian-num">
            <span>
              {currPayrollRecords.length > 0
                ? `میانگین سرانه: ${formatRial(payrollTotals.avgNet)}`
                : 'مبنا: جمع حقوق پایه کارگزینی'}
            </span>
            {prevPayrollPeriod && payrollTotals.prevNet > 0 && (
              <span
                className={`font-bold flex items-center gap-0.5 ${
                  payrollTotals.growthPct >= 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {payrollTotals.growthPct >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {formatPercent(Math.abs(payrollTotals.growthPct))}
              </span>
            )}
          </div>
        </div>

        {/* 3. Karaneh & Overtime */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>بودجه کارانه و اضافه‌کار ({toPersianDigits(activeKaranehPeriod || 'دوره')})</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 persian-num">
            {formatRial(karanehTotals.total)}
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            اضافه‌کار حقوق دوره: {formatRial(payrollTotals.overtime)} · مالیات: {formatRial(payrollTotals.tax)}
          </div>
        </div>

        {/* 4. Commitments & Guarantee Risk */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>اعتبار و ریسک تعهدات و تضامین جاری</span>
            <FileCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 persian-num">
            {formatRial(commitmentAnalysis.totalCurrentAmount)}
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            نرخ مصرف سقف مجاز: <b>{formatPercent(commitmentAnalysis.utilizationPct)}</b> ·{' '}
            <span className={commitmentAnalysis.highRiskCount > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
              {toPersianDigits(commitmentAnalysis.highRiskCount)} مورد نیازمند بررسی
            </span>
          </div>
        </div>

        {/* 5. Mining Job Classification & Experience */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>سوابق معدنی و طبقه‌بندی مشاغل</span>
            <Pickaxe className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 persian-num">
            {toPersianDigits(miningMetrics.avgMiningDays)}{' '}
            <span className="text-xs font-semibold text-slate-500">روز میانگین سابقه معدنی</span>
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            {toPersianDigits(miningMetrics.total)} پرونده طبقه‌بندی‌شده · {toPersianDigits(miningMetrics.nearUpgradeCount)} نفر نزدیک ارتقای گروه
          </div>
        </div>

        {/* 6. Executive Control Alerts Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>شاخص انطباق و هشدارهای مدیریتی</span>
            <ShieldAlert className={`w-4 h-4 ${executiveAlerts.some((a) => a.severity === 'high') ? 'text-rose-600' : 'text-emerald-600'}`} />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 persian-num">
            {toPersianDigits(executiveAlerts.length)}{' '}
            <span className="text-xs font-semibold text-slate-500">مورد فعال</span>
          </div>
          <div className="text-[11px] text-slate-600 persian-num">
            {toPersianDigits(executiveAlerts.filter((a) => a.severity === 'high').length)} اولویت بالا · {toPersianDigits(siteAndDeptCosts.length)} مرکز هزینه و معدن
          </div>
        </div>
      </div>

      {/* Monthly Operational Volumes Comparison + Excel Input */}
      <CeoVolumesPanel
        records={miningVolumes}
        unitNames={MINING_UNITS_CATALOG.map((u) => u.unitName)}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        canDeleteAll={canDeleteAll}
        canImportExcel={canImportExcel}
        canExportExcel={canExport}
        onSave={onSaveVolume}
        onBatchImport={onBatchImportVolumes}
        onDelete={onDeleteVolume}
        onBatchDelete={onBatchDeleteVolumes}
        onDeleteAll={onDeleteAllVolumes}
      />

      {/* Workshop & Fleet Machinery Readiness + Excel Input */}
      <CeoMachineryPanel
        records={miningMachinery}
        unitNames={MINING_UNITS_CATALOG.map((u) => u.unitName)}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        canDeleteAll={canDeleteAll}
        canImportExcel={canImportExcel}
        canExportExcel={canExport}
        onSave={onSaveMachinery}
        onBatchImport={onBatchImportMachinery}
        onDelete={onDeleteMachinery}
        onBatchDelete={onBatchDeleteMachinery}
        onDeleteAll={onDeleteAllMachinery}
      />

      {/* 12 Mining Operational & Support Units Monitoring Panel */}
      <CeoMiningUnitsPanel
        units={miningUnitsBreakdown}
        payrollPeriodLabel={activePayrollPeriod}
        karanehPeriodLabel={activeKaranehPeriod}
      />

      {/* Aggregated Per-Unit Excel Reports Analytics Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              تجمیع، پایش و مقایسه گزارش‌های اکسل ارسالی واحدهای عملیاتی معدن
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              داده‌هایی که سرپرستان واحدهای معدن از پنل عملیات واحدها بارگذاری می‌کنند، به‌صورت لحظه‌ای در این نمودار و جدول برای مدیرعامل مقایسه و رصد می‌شوند.
            </p>
          </div>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl border border-indigo-200 persian-num shrink-0">
            کل گزارش‌های تجمیع‌شده: {toPersianDigits(unitReports.length)} ردیف
          </span>
        </div>

        {unitReportsSummaryByUnit.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 h-64 min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={unitReportsSummaryByUnit} margin={{ top: 10, right: 12, left: 4, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="unitName"
                    tick={{ fill: '#334155', fontSize: 10, fontFamily: 'Vazirmatn' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 10.5, fontFamily: 'Vazirmatn' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => toPersianDigits(v)}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [toPersianDigits(Math.round(Number(val || 0))), name]}
                    contentStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: '11px', borderRadius: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                  <Bar dataKey="prevSum" name="جمع ماه قبل" fill="#94a3b8" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="actualSum" name="عملکرد محقق‌شده" fill="#4338ca" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="targetSum" name="هدف مصوب" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-6 overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <th className="p-2.5">واحد معدن</th>
                    <th className="p-2.5 text-center">تعداد گزارش</th>
                    <th className="p-2.5">جمع ماه قبل</th>
                    <th className="p-2.5">جمع عملکرد</th>
                    <th className="p-2.5">تحقق هدف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 persian-num">
                  {unitReportsSummaryByUnit.map((row) => {
                    const pct = row.targetSum > 0 ? Math.round((row.actualSum / row.targetSum) * 100) : 0;
                    return (
                      <tr key={row.unitName} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{row.unitName}</td>
                        <td className="p-2.5 text-center">{toPersianDigits(row.reportsCount)}</td>
                        <td className="p-2.5 text-slate-600">{toPersianDigits(Math.round(row.prevSum))}</td>
                        <td className="p-2.5 font-bold text-indigo-700">{toPersianDigits(Math.round(row.actualSum))}</td>
                        <td className="p-2.5 font-bold text-teal-700">{toPersianDigits(pct)}٪</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
            هنوز گزارش اکسل/عملکردی از پنل واحدها ثبت نشده است. با آپلود فایل اکسل در بخش «عملیات واحدها، دیسپچینگ و تعمیرگاه»، گزارش‌ها بلافاصله در این بخش تجمیع می‌شوند.
          </div>
        )}
      </div>

      {/* Charts Row 1: Cost Centers / Mining Sites & Multi-Period Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              مقایسه بهای تمام‌شده حقوق، اضافه‌کار و کارانه در مراکز معدنی و واحدها
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              توزیع هزینه نیروی انسانی بر حسب میلیون ریال به تفکیک محل خدمت / واحد
            </p>
          </div>
          <div className="h-72 w-full min-w-0" dir="ltr">
            {siteAndDeptCosts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={siteAndDeptCosts.slice(0, 8)}
                  margin={{ top: 10, right: 16, left: 4, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#334155', fontSize: 10, fontFamily: 'Vazirmatn' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => toPersianDigits(v)}
                  />
                  <Tooltip content={<ExecutiveTooltip unit="million" />} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                  <Bar dataKey="netMillion" name="خالص حقوق (م.ر)" fill="#1e293b" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="karanehMillion" name="کارانه مصوب (م.ر)" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="overtimeMillion" name="اضافه‌کار (م.ر)" fill="#b45309" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                اطلاعات مالی مراکز و واحدها در این محدوده موجود نیست.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              روند دوره‌ای هزینه حقوق و کارانه شرکت
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              پایش تغییرات ماهانه مجموع خالص پرداختی حقوق در برابر بودجه کارانه (میلیون ریال)
            </p>
          </div>
          <div className="h-72 w-full min-w-0" dir="ltr">
            {monthlyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrendData} margin={{ top: 10, right: 16, left: 4, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: '#334155', fontSize: 10.5, fontFamily: 'Vazirmatn' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => toPersianDigits(v)}
                  />
                  <Tooltip content={<ExecutiveTooltip unit="million" />} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                  <Bar dataKey="payrollMillion" name="خالص حقوق (م.ر)" fill="#4338ca" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Line type="monotone" dataKey="karanehMillion" name="کارانه دوره (م.ر)" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                برای نمایش روند ماهانه حداقل یک دوره حقوق یا کارانه لازم است.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2: Role Tier Analysis + Job Groups Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-violet-600" />
              ساختار هزینه‌ای رده‌های سازمانی (مدیر، رئیس، مسئول، کارشناس، اپراتور)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              مقایسه میانگین و مجموع پرداختی هر رده سازمانی به میلیون ریال
            </p>
          </div>
          <div className="h-72 w-full min-w-0" dir="ltr">
            {roleTierStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleTierStats} margin={{ top: 10, right: 16, left: 4, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="tier"
                    tick={{ fill: '#334155', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Vazirmatn' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => toPersianDigits(v)}
                  />
                  <Tooltip content={<ExecutiveTooltip unit="million" />} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                  <Bar dataKey="totalMillion" name="مجموع پرداختی رده (م.ر)" fill="#4338ca" radius={[6, 6, 0, 0]} maxBarSize={38} />
                  <Bar dataKey="avgMillion" name="میانگین سرانه رده (م.ر)" fill="#b45309" radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                داده رده‌های شغلی یافت نشد.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-600" />
              هرم نیروی انسانی بر اساس گروه شغلی
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              پراکندگی ترکیب پرسنل در گروه‌های شغلی ثبت‌شده
            </p>
          </div>
          <div className="h-52 w-full min-w-0" dir="ltr">
            {ceoJobGroupStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ceoJobGroupStats}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {ceoJobGroupStats.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<ExecutiveTooltip unit="count" />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                گروه شغلی ثبت نشده است.
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {ceoJobGroupStats.slice(0, 6).map((g, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                <span className="flex items-center gap-1.5 text-slate-700 truncate">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="truncate">{g.label}</span>
                </span>
                <span className="font-bold text-slate-900 persian-num">{toPersianDigits(g.count)} نفر</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Executive Registers (Alerts, Site Financial Matrix, Mining Classification Readiness) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-800" />
            <h3 className="text-sm font-bold text-slate-900">کارتابل مدیریتی و ریسک عملیاتی معدن</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs no-print">
            <button
              onClick={() => setActiveRegisterTab('alerts')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeRegisterTab === 'alerts' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              هشدارها و ریسک‌ها ({toPersianDigits(executiveAlerts.length)})
            </button>
            <button
              onClick={() => setActiveRegisterTab('sites')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeRegisterTab === 'sites' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              عملکرد مراکز معدنی ({toPersianDigits(siteAndDeptCosts.length)})
            </button>
            <button
              onClick={() => setActiveRegisterTab('mining')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeRegisterTab === 'mining' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              طبقه‌بندی مشاغل معدنی ({toPersianDigits(filteredClassifications.length)})
            </button>
          </div>
        </div>

        {activeRegisterTab === 'alerts' && (
          <div className="p-4 space-y-3">
            {executiveAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>در محدوده انتخاب‌شده هیچ هشدار بحرانی یا انحراف پرریسک شناسایی نشد.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {executiveAlerts.map((al, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-xl border space-y-1 text-xs ${
                      al.severity === 'high'
                        ? 'bg-rose-50/70 border-rose-200'
                        : al.severity === 'medium'
                        ? 'bg-amber-50/70 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-bold flex items-center gap-1.5 ${
                          al.severity === 'high'
                            ? 'text-rose-800'
                            : al.severity === 'medium'
                            ? 'text-amber-800'
                            : 'text-slate-800'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{al.category}</span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {al.severity === 'high' ? 'اولویت فوری' : al.severity === 'medium' ? 'نیازمند پیگیری' : 'اطلاعات راهبردی'}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900">{al.title}</div>
                    <div className="text-[11px] text-slate-600">{al.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeRegisterTab === 'sites' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">مرکز / محل خدمت / واحد</th>
                  <th className="py-2.5 px-3 text-center">پرسنل</th>
                  <th className="py-2.5 px-3 text-center">فیش حقوقی</th>
                  <th className="py-2.5 px-3">خالص پرداختی حقوق</th>
                  <th className="py-2.5 px-3">اضافه‌کار</th>
                  <th className="py-2.5 px-3">مالیات</th>
                  <th className="py-2.5 px-3">کارانه دوره</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siteAndDeptCosts.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{s.name}</td>
                    <td className="py-2.5 px-3 text-center persian-num">{toPersianDigits(s.personnelCount)}</td>
                    <td className="py-2.5 px-3 text-center persian-num">{toPersianDigits(s.payrollRecordsCount)}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 persian-num">{formatRial(s.totalNetPayroll)}</td>
                    <td className="py-2.5 px-3 text-amber-700 font-semibold persian-num">{formatRial(s.overtimeCost)}</td>
                    <td className="py-2.5 px-3 text-slate-600 persian-num">{formatRial(s.totalTax)}</td>
                    <td className="py-2.5 px-3 font-bold text-teal-700 persian-num">{formatRial(s.totalKaraneh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeRegisterTab === 'mining' && (
          <div className="overflow-x-auto">
            {filteredClassifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                هنوز اطلاعات ۱۸ ستونی طبقه‌بندی مشاغل معدنی ثبت یا آپلود نشده است.
              </div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2.5 px-3">کد</th>
                    <th className="py-2.5 px-3">نام و نام خانوادگی</th>
                    <th className="py-2.5 px-3">محل خدمت / واحد</th>
                    <th className="py-2.5 px-3">شغل / پست</th>
                    <th className="py-2.5 px-3">گروه شغلی</th>
                    <th className="py-2.5 px-3">سابقه معدنی</th>
                    <th className="py-2.5 px-3">فاصله از ۱۴۰۵</th>
                    <th className="py-2.5 px-3">فاصله گروه بعدی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClassifications.slice(0, 25).map((jc, i) => (
                    <tr key={jc.id || i} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold persian-num">{toPersianDigits(jc.personnelCode)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {`${jc.firstName} ${jc.lastName}`.trim()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {jc.workLocation || '—'} · {jc.department || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {jc.jobTitle || '—'} / {jc.position || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-indigo-700">{jc.jobGroup || '—'}</td>
                      <td className="py-2.5 px-3 persian-num">
                        {jc.miningExperience || jc.miningExperienceDays || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 persian-num">{jc.groupGapFrom1405 || '—'}</td>
                      <td className="py-2.5 px-3 font-semibold text-amber-700 persian-num">
                        {jc.nextGroupGap || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      </div>

      {/* A4 Official Print Preview Modal (Interactive, hidden during actual print) */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 no-print">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-bold">
                  پیش‌نمایش چاپ رسمی گزارش مدیر عامل (قطع A4)
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">{ceoDisplayName} · شرکت نگین پرتو نصر</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleTriggerBrowserPrint}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-extrabold cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ مستقیم / ذخیره PDF (A4)</span>
                </button>
                <button
                  onClick={handleDownloadExecutiveHtml}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود نسخه HTML</span>
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-7 overflow-y-auto flex-1 bg-slate-100">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-[210mm] mx-auto">
                {renderOfficialA4PrintContent()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official In-DOM A4 Print Sheet (Only visible during browser Ctrl+P / window.print()) */}
      <div className="hidden print:block print-sheet bg-white text-slate-900 p-2">
        {renderOfficialA4PrintContent()}
      </div>
    </>
  );
};
