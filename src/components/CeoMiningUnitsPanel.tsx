import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import {
  Pickaxe,
  Wrench,
  Factory,
  Truck,
  Flame,
  Compass,
  ShieldCheck,
  Package,
  Lock,
  Cpu,
  Landmark,
  Cog,
  Eye,
  X,
  Users,
  Wallet,
  TrendingUp,
  FileCheck,
  HeartHandshake
} from 'lucide-react';
import {
  Personnel,
  PayrollRecord,
  KaranehRecord,
  PersonnelCommitment,
  JobClassificationRecord,
  MiningVolumeRecord,
  MiningMachineryRecord,
  UnitOperationalReport
} from '../types';
import { formatRial, toPersianDigits, getPeriodLabel } from '../utils/persian';

export interface MiningUnitCatalogEntry {
  id: string;
  unitName: string;
  category: string;
  keywords: string[];
  description: string;
}

export const MINING_UNITS_CATALOG: MiningUnitCatalogEntry[] = [
  {
    id: 'dispatching',
    unitName: 'واحد دیسپچینگ و کنترل تولید',
    category: 'عملیات اصلی معدن',
    keywords: ['دیسپچینگ', 'ديسپچينگ', 'کنترل تولید', 'کنترل توليد', 'شیفت تولید', 'اعزام ناوگان', 'dispatching'],
    description: 'مانیتورینگ لحظه‌ای سیکل بارگیری و حمل، ثبت آمار حجم استخراج و باطله‌برداری ماهانه و تطبیق برنامه تولید'
  },
  {
    id: 'extraction',
    unitName: 'استخراج و معدن‌کاری',
    category: 'عملیات اصلی معدن',
    keywords: ['استخراج', 'معدن کاری', 'معدن‌کاری', 'بهره برداری', 'بهره‌برداری', 'پله', 'سینه کار', 'سینه كار'],
    description: 'مدیریت پله‌های استخراج، بارگیری کانسنگ، سرپرستی شیفت‌های استخراج و عملیات روباز/زیرزمینی'
  },
  {
    id: 'drilling-blasting',
    unitName: 'حفاری و آتشباری',
    category: 'عملیات اصلی معدن',
    keywords: ['حفاری', 'آتشباری', 'اتشباری', 'انفجار', 'چال', 'دریل'],
    description: 'طراحی الگوی چال‌زنی، عملیات دریل واگن، کنترل مواد ناریه و ایمنی انفجار'
  },
  {
    id: 'workshop',
    unitName: 'تعمیرگاه و ماشین‌آلات سنگین',
    category: 'پشتیبانی فنی و ناوگان',
    keywords: ['تعمیرگاه', 'ماشین آلات', 'ماشین‌آلات', 'ماشين آلات', 'مکانیک', 'مکانيك', 'لودر', 'دامپتراک', 'بلدوزر', 'بیل مکانیکی'],
    description: 'تعمیر و اورهال دامپتراک‌ها، لودرها، بیل‌های مکانیکی، هیدرولیک و آماده‌به‌کار ناوگان معدنی'
  },
  {
    id: 'processing',
    unitName: 'کارخانه فرآوری و سنگ‌شکن',
    category: 'تولید و فرآوری',
    keywords: ['فرآوری', 'فراوری', 'سنگ شکن', 'سنگ‌شکن', 'کارخانه', 'تولید', 'دانه بندی', 'دانه‌بندی', 'تغلیظ', 'کنسانتره'],
    description: 'خطوط سنگ‌شکن اولیه و ثانویه، سرند، آسیاب، کنسانتره و کنترل کیفیت خوراک کارخانه'
  },
  {
    id: 'haulage',
    unitName: 'حمل‌ونقل و ترابری معدنی',
    category: 'عملیات اصلی معدن',
    keywords: ['حمل و نقل', 'حمل‌ونقل', 'ترابری', 'باربری', 'راننده', 'کامیون', 'بایکول', 'باسکول'],
    description: 'حمل کانسنگ و باطله از معدن به کارخانه و دپو، مدیریت رانندگان، باسکول و لجستیک جاده‌ای'
  },
  {
    id: 'maintenance',
    unitName: 'نگهداری و تعمیرات (نت) و تاسیسات',
    category: 'پشتیبانی فنی و ناوگان',
    keywords: ['نگهداری', 'تعمیرات', 'نت', 'تاسیسات', 'تأسيسات', 'برق صنعتی', 'جوشکاری', 'ابزار دقیق'],
    description: 'نگهداری پیشگیرانه (PM) تجهیزات ثابت، پست‌های برق فشار قوی، پمپاژ آب و تاسیسات کارگاهی'
  },
  {
    id: 'geology',
    unitName: 'زمین‌شناسی، اکتشاف و نقشه‌برداری',
    category: 'مهندسی و فنی معدن',
    keywords: ['زمین شناسی', 'زمین‌شناسی', 'اکتشاف', 'نقشه برداری', 'نقشه‌برداری', 'کنترل عیار', 'آزمایشگاه', 'مغزه'],
    description: 'تخمین ذخیره، کنترل عیار سینه کار، نقشه‌برداری توپوگرافی پله‌ها و نمونه برداری مغزه'
  },
  {
    id: 'hse',
    unitName: 'ایمنی، بهداشت و محیط زیست (HSE)',
    category: 'انطباق و ایمنی',
    keywords: ['ایمنی', 'بهداشت', 'محیط زیست', 'hse', 'آتش نشانی', 'طب کار'],
    description: 'پایش ریسک‌های ایمنی معدن، تجهیزات حفاظت فردی، بهداشت حرفه‌ای و استانداردهای زیست‌محیطی'
  },
  {
    id: 'warehouse',
    unitName: 'انبار، تدارکات و بازرگانی',
    category: 'زنجیره تامین و ستاد',
    keywords: ['انبار', 'تدارکات', 'بازرگانی', 'خرید', 'فروش', 'لجستیک', 'قطعات'],
    description: 'انبار قطعات یدکی ماشین‌آلات سنگین، تامین سوخت و ملزومات، سفارشات خرید و فروش محصول'
  },
  {
    id: 'security',
    unitName: 'حراست و انتظامات معدن',
    category: 'انطباق و ایمنی',
    keywords: ['حراست', 'انتظامات', 'نگهبانی', 'کنترل تردد'],
    description: 'کنترل ورود و خروج ماشین‌آلات، حفاظت فیزیکی محوطه معدنی، انبارها و گیت باسکول'
  },
  {
    id: 'it-pmo',
    unitName: 'فناوری اطلاعات و کنترل پروژه',
    category: 'زنجیره تامین و ستاد',
    keywords: ['فناوری اطلاعات', 'فناوري اطلاعات', 'آی تی', 'کامپیوتر', 'شبکه', 'کنترل پروژه', 'برنامه ریزی', 'برنامه‌ریزی', 'سیستم'],
    description: 'زیرساخت شبکه معدن و ستاد، سامانه‌های پایش تولید و باسکول، برنامه‌ریزی و کنترل پیشرفت پروژه'
  },
  {
    id: 'finance-hr',
    unitName: 'امور مالی، اداری و منابع انسانی',
    category: 'زنجیره تامین و ستاد',
    keywords: ['مالی', 'حسابداری', 'اداری', 'منابع انسانی', 'کارگزینی', 'حقوق', 'بودجه', 'پشتیبانی اداری'],
    description: 'مدیریت بودجه و نقدینگی معدن، حسابداری بهای تمام‌شده، حقوق و دستمزد و امور اداری پرسنل'
  }
];

export interface AggregatedMiningUnit {
  id: string;
  unitName: string;
  category: string;
  description: string;
  isStandardCatalog: boolean;
  personnel: Personnel[];
  payrollRecords: PayrollRecord[];
  karanehRecords: KaranehRecord[];
  commitments: PersonnelCommitment[];
  classifications: JobClassificationRecord[];
  volumeRecords: MiningVolumeRecord[];
  machineryRecords: MiningMachineryRecord[];
  unitReports: UnitOperationalReport[];
  personnelCount: number;
  activeCount: number;
  relativesCount: number;
  payrollCount: number;
  totalNetPayroll: number;
  totalBenefits: number;
  overtimeCost: number;
  totalKaraneh: number;
  avgNetPayroll: number;
  commitmentsCount: number;
  commitmentsAmount: number;
  classificationsCount: number;
  totalVolumeCurr: number;
  totalVolumeTarget: number;
  readyMachineryCount: number;
  brokenMachineryCount: number;
  unitReportsCount: number;
  unitReportsActualSum: number;
  unitReportsPrevSum: number;
  unitReportsTargetSum: number;
  netMillion: number;
  karanehMillion: number;
  overtimeMillion: number;
}

const normalizeMatchText = (val?: string) =>
  String(val || '')
    .replace(/\u200c/g, ' ')
    .replace(/[يی]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .trim()
    .toLowerCase();

export function resolveMiningUnitCatalog(department?: string, workLocation?: string, jobTitle?: string): MiningUnitCatalogEntry | null {
  const combined = normalizeMatchText(`${department || ''} ${workLocation || ''} ${jobTitle || ''}`);
  if (!combined) return null;
  for (const unit of MINING_UNITS_CATALOG) {
    if (unit.keywords.some(kw => combined.includes(normalizeMatchText(kw)))) {
      return unit;
    }
  }
  return null;
}

export function buildMiningUnitsBreakdown(params: {
  personnel: Personnel[];
  currPayrollRecords: PayrollRecord[];
  currKaranehRecords: KaranehRecord[];
  commitments: PersonnelCommitment[];
  classifications: JobClassificationRecord[];
  miningVolumes?: MiningVolumeRecord[];
  miningMachinery?: MiningMachineryRecord[];
  unitReports?: UnitOperationalReport[];
}): AggregatedMiningUnit[] {
  const {
    personnel,
    currPayrollRecords,
    currKaranehRecords,
    commitments,
    classifications,
    miningVolumes = [],
    miningMachinery = [],
    unitReports = [],
  } = params;

  const map = new Map<string, AggregatedMiningUnit>();

  MINING_UNITS_CATALOG.forEach(cat => {
    map.set(cat.id, {
      id: cat.id,
      unitName: cat.unitName,
      category: cat.category,
      description: cat.description,
      isStandardCatalog: true,
      personnel: [],
      payrollRecords: [],
      karanehRecords: [],
      commitments: [],
      classifications: [],
      volumeRecords: [],
      machineryRecords: [],
      unitReports: [],
      personnelCount: 0,
      activeCount: 0,
      relativesCount: 0,
      payrollCount: 0,
      totalNetPayroll: 0,
      totalBenefits: 0,
      overtimeCost: 0,
      totalKaraneh: 0,
      avgNetPayroll: 0,
      commitmentsCount: 0,
      commitmentsAmount: 0,
      classificationsCount: 0,
      totalVolumeCurr: 0,
      totalVolumeTarget: 0,
      readyMachineryCount: 0,
      brokenMachineryCount: 0,
      unitReportsCount: 0,
      unitReportsActualSum: 0,
      unitReportsPrevSum: 0,
      unitReportsTargetSum: 0,
      netMillion: 0,
      karanehMillion: 0,
      overtimeMillion: 0
    });
  });

  const ensureDynamicUnit = (deptName: string): AggregatedMiningUnit => {
    const key = `custom:${normalizeMatchText(deptName)}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        unitName: deptName.trim(),
        category: 'سایر واحدهای ثبت‌شده در پایگاه داده',
        description: `واحد سازمانی ثبت‌شده با عنوان «${deptName.trim()}» در پرونده پرسنل، فیش‌های حقوقی یا گزارش‌های اکسل واحدها`,
        isStandardCatalog: false,
        personnel: [],
        payrollRecords: [],
        karanehRecords: [],
        commitments: [],
        classifications: [],
        volumeRecords: [],
        machineryRecords: [],
        unitReports: [],
        personnelCount: 0,
        activeCount: 0,
        relativesCount: 0,
        payrollCount: 0,
        totalNetPayroll: 0,
        totalBenefits: 0,
        overtimeCost: 0,
        totalKaraneh: 0,
        avgNetPayroll: 0,
        commitmentsCount: 0,
        commitmentsAmount: 0,
        classificationsCount: 0,
        totalVolumeCurr: 0,
        totalVolumeTarget: 0,
        readyMachineryCount: 0,
        brokenMachineryCount: 0,
        unitReportsCount: 0,
        unitReportsActualSum: 0,
        unitReportsPrevSum: 0,
        unitReportsTargetSum: 0,
        netMillion: 0,
        karanehMillion: 0,
        overtimeMillion: 0
      });
    }
    return map.get(key)!;
  };

  const resolveBucket = (dept?: string, loc?: string, job?: string): AggregatedMiningUnit | null => {
    const matched = resolveMiningUnitCatalog(dept, loc, job);
    if (matched) return map.get(matched.id)!;
    const fallbackName = (dept || loc || '').trim();
    if (!fallbackName) return null;
    return ensureDynamicUnit(fallbackName);
  };

  const personnelByCode = new Map<string, Personnel>();
  personnel.forEach(p => {
    if (p.personnelCode) personnelByCode.set(String(p.personnelCode).trim(), p);
    const bucket = resolveBucket(p.department, p.workLocation, p.jobTitle || p.position);
    if (bucket) {
      bucket.personnel.push(p);
      bucket.personnelCount += 1;
      if (p.status === 'فعال') bucket.activeCount += 1;
      bucket.relativesCount += Array.isArray(p.relatives) ? p.relatives.length : 0;
    }
  });

  currPayrollRecords.forEach(r => {
    const linkedP = personnelByCode.get(String(r.personnelCode || '').trim());
    const bucket = resolveBucket(
      r.department || linkedP?.department,
      r.workLocation || linkedP?.workLocation,
      r.jobTitle || r.position
    );
    if (bucket) {
      bucket.payrollRecords.push(r);
      bucket.payrollCount += 1;
      bucket.totalNetPayroll += Number(r.netPayable || 0);
      bucket.totalBenefits += Number(r.totalBenefits || 0);
      bucket.overtimeCost += Number(r.overtimeAmount || 0);
    }
  });

  currKaranehRecords.forEach(k => {
    const linkedP = personnelByCode.get(String(k.personnelCode || '').trim());
    const bucket = resolveBucket(
      k.department || linkedP?.department,
      linkedP?.workLocation,
      k.position || linkedP?.jobTitle
    );
    if (bucket) {
      bucket.karanehRecords.push(k);
      bucket.totalKaraneh += Number(k.finalKaraneh || 0);
    }
  });

  commitments.forEach(c => {
    const linkedP = personnelByCode.get(String(c.personnelCode || '').trim());
    if (!linkedP) return;
    const bucket = resolveBucket(linkedP.department, linkedP.workLocation, linkedP.jobTitle || linkedP.position);
    if (bucket) {
      bucket.commitments.push(c);
      bucket.commitmentsCount += 1;
      bucket.commitmentsAmount += Number(c.amount || 0);
    }
  });

  classifications.forEach(jc => {
    const bucket = resolveBucket(jc.department, jc.workLocation, jc.jobTitle || jc.position);
    if (bucket) {
      bucket.classifications.push(jc);
      bucket.classificationsCount += 1;
    }
  });

  const latestVolPeriod = miningVolumes
    .map(v => v.period)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || '';

  miningVolumes.forEach(v => {
    const bucket = resolveBucket(v.unitName, '', v.activityType);
    if (bucket) {
      bucket.volumeRecords.push(v);
      if (!latestVolPeriod || v.period === latestVolPeriod) {
        bucket.totalVolumeCurr += Number(v.volumeValue || 0);
        bucket.totalVolumeTarget += Number(v.targetVolume || 0);
      }
    }
  });

  miningMachinery.forEach(m => {
    const bucket = resolveBucket(m.unitName, '', m.machineType);
    if (bucket) {
      bucket.machineryRecords.push(m);
      if (m.status === 'آماده به کار') bucket.readyMachineryCount += 1;
      else bucket.brokenMachineryCount += 1;
    }
  });

  unitReports.forEach(ur => {
    const bucket = resolveBucket(ur.unitName, '', ur.reportCategory);
    if (bucket) {
      bucket.unitReports.push(ur);
      bucket.unitReportsCount += 1;
      bucket.unitReportsActualSum += Number(ur.actualValue || 0);
      bucket.unitReportsPrevSum += Number(ur.previousValue || 0);
      bucket.unitReportsTargetSum += Number(ur.targetValue || 0);
    }
  });

  return Array.from(map.values())
    .map(u => ({
      ...u,
      avgNetPayroll: u.payrollCount > 0 ? Math.round(u.totalNetPayroll / u.payrollCount) : 0,
      netMillion: Number((u.totalNetPayroll / 1_000_000).toFixed(1)),
      karanehMillion: Number((u.totalKaraneh / 1_000_000).toFixed(1)),
      overtimeMillion: Number((u.overtimeCost / 1_000_000).toFixed(1))
    }))
    .sort((a, b) => {
      const aActivity = a.totalNetPayroll + a.totalKaraneh + a.personnelCount * 1000 + a.unitReportsCount * 500 + a.volumeRecords.length * 500;
      const bActivity = b.totalNetPayroll + b.totalKaraneh + b.personnelCount * 1000 + b.unitReportsCount * 500 + b.volumeRecords.length * 500;
      return bActivity - aActivity;
    });
}

const getUnitIcon = (unitId: string) => {
  switch (unitId) {
    case 'dispatching': return <TrendingUp className="w-4 h-4 text-emerald-700" />;
    case 'extraction': return <Pickaxe className="w-4 h-4 text-amber-600" />;
    case 'drilling-blasting': return <Flame className="w-4 h-4 text-orange-600" />;
    case 'workshop': return <Wrench className="w-4 h-4 text-indigo-600" />;
    case 'processing': return <Factory className="w-4 h-4 text-emerald-600" />;
    case 'haulage': return <Truck className="w-4 h-4 text-sky-600" />;
    case 'maintenance': return <Cog className="w-4 h-4 text-violet-600" />;
    case 'geology': return <Compass className="w-4 h-4 text-teal-600" />;
    case 'hse': return <ShieldCheck className="w-4 h-4 text-rose-600" />;
    case 'warehouse': return <Package className="w-4 h-4 text-amber-700" />;
    case 'security': return <Lock className="w-4 h-4 text-slate-700" />;
    case 'it-pmo': return <Cpu className="w-4 h-4 text-cyan-600" />;
    case 'finance-hr': return <Landmark className="w-4 h-4 text-slate-800" />;
    default: return <Pickaxe className="w-4 h-4 text-slate-600" />;
  }
};

interface CeoMiningUnitsPanelProps {
  units: AggregatedMiningUnit[];
  payrollPeriodLabel: string;
  karanehPeriodLabel: string;
}

export const CeoMiningUnitsPanel: React.FC<CeoMiningUnitsPanelProps> = ({
  units,
  payrollPeriodLabel,
  karanehPeriodLabel
}) => {
  const [showOnlyActiveUnits, setShowOnlyActiveUnits] = useState(false);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<AggregatedMiningUnit | null>(null);
  const [drillTab, setDrillTab] = useState<'summary' | 'reports' | 'personnel' | 'payroll' | 'karaneh' | 'commitments'>('summary');

  const visibleUnits = useMemo(
    () =>
      showOnlyActiveUnits
        ? units.filter(
            u =>
              u.personnelCount > 0 ||
              u.payrollCount > 0 ||
              u.karanehRecords.length > 0 ||
              u.classificationsCount > 0 ||
              u.unitReportsCount > 0 ||
              u.volumeRecords.length > 0 ||
              u.machineryRecords.length > 0
          )
        : units,
    [units, showOnlyActiveUnits]
  );

  const chartUnits = useMemo(
    () =>
      units.filter(
        u =>
          u.totalNetPayroll > 0 ||
          u.totalKaraneh > 0 ||
          u.overtimeCost > 0 ||
          u.personnelCount > 0 ||
          u.unitReportsCount > 0 ||
          u.volumeRecords.length > 0
      ),
    [units]
  );

  const hoveredUnit = useMemo(
    () => units.find(u => u.id === hoveredUnitId) || null,
    [units, hoveredUnitId]
  );

  const openDrillDown = (unit: AggregatedMiningUnit) => {
    setSelectedUnit(unit);
    setDrillTab('summary');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Pickaxe className="w-5 h-5 text-amber-600" />
            پایش و آنالیز جامع واحدهای عملیاتی و پشتیبانی شرکت معدنی
          </h3>
          <p className="text-[11px] text-slate-600 mt-1">
            رصد هم‌زمان استخراج، حفاری و آتشباری، تعمیرگاه ماشین‌آلات سنگین، کارخانه فرآوری، ترابری، نت، زمین‌شناسی، HSE، انبار، حراست، IT و مالی/اداری — با رفتن ماوس پیش‌نمایش زنده و با کلیک جزئیات کامل پرسنلی نمایش داده می‌شود.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs shrink-0 no-print">
          <button
            type="button"
            onClick={() => setShowOnlyActiveUnits(false)}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer persian-num ${
              !showOnlyActiveUnits ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            همه واحدهای معدن ({toPersianDigits(units.length)})
          </button>
          <button
            type="button"
            onClick={() => setShowOnlyActiveUnits(true)}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer persian-num ${
              showOnlyActiveUnits ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            واحدهای دارای رکورد ({toPersianDigits(chartUnits.length)})
          </button>
        </div>
      </div>

      {/* Interactive Chart comparing units with records */}
      <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">
            مقایسه بهای تمام‌شده حقوق، کارانه و اضافه‌کاری در واحدهای معدنی دارای داده (میلیون ریال)
          </span>
          <span className="text-[11px] text-slate-500 persian-num">
            دوره حقوق: {toPersianDigits(payrollPeriodLabel || 'ثبت نشده')} · دوره کارانه: {toPersianDigits(karanehPeriodLabel || 'ثبت نشده')}
          </span>
        </div>
        <div className="h-64 w-full min-w-0" dir="ltr">
          {chartUnits.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartUnits} margin={{ top: 10, right: 12, left: 4, bottom: 20 }}>
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
                  formatter={(value: any, name: any) => [
                    formatRial(Math.round(Number(value || 0) * 1_000_000)),
                    name
                  ]}
                  contentStyle={{
                    direction: 'rtl',
                    fontFamily: 'Vazirmatn',
                    fontSize: '11px',
                    borderRadius: '12px',
                    borderColor: '#cbd5e1'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                <Bar dataKey="netMillion" name="خالص حقوق (م.ر)" fill="#1e293b" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="karanehMillion" name="کارانه مصوب (م.ر)" fill="#0f766e" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="overtimeMillion" name="اضافه‌کار (م.ر)" fill="#d97706" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              هنوز پرسنل یا فیش حقوقی برای واحدهای معدنی ثبت نشده است. با ورود اطلاعات پرسنل و حقوق، نمودار واحدها به‌صورت خودکار ترسیم می‌شود.
            </div>
          )}
        </div>
      </div>

      {/* Hover Live Preview Strip */}
      <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 text-xs transition-all">
        {hoveredUnit ? (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-bold text-indigo-950">
                {getUnitIcon(hoveredUnit.id)}
                <span>پیش‌نمایش زنده واحد: {hoveredUnit.unitName}</span>
                <span className="text-[10px] px-2 py-0.5 bg-white text-indigo-700 rounded-md border border-indigo-200">
                  {hoveredUnit.category}
                </span>
              </div>
              <p className="text-[11px] text-indigo-800">{hoveredUnit.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] persian-num shrink-0">
              <span>پرسنل: <b>{toPersianDigits(hoveredUnit.personnelCount)} نفر</b></span>
              <span>خالص حقوق: <b className="text-slate-900">{formatRial(hoveredUnit.totalNetPayroll)}</b></span>
              <span>کارانه: <b className="text-teal-700">{formatRial(hoveredUnit.totalKaraneh)}</b></span>
              <span>بستگان: <b>{toPersianDigits(hoveredUnit.relativesCount)} نفر</b></span>
              <span>گزارش‌های اکسل واحد: <b>{toPersianDigits(hoveredUnit.unitReportsCount)} مورد</b></span>
              <span>ناوگان: <b>{toPersianDigits(hoveredUnit.readyMachineryCount)} آماده / {toPersianDigits(hoveredUnit.brokenMachineryCount)} متوقف</b></span>
              <span className="text-indigo-700 font-bold">برای جزئیات کلیک کنید ←</span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-indigo-900 font-medium">
            نشانگر ماوس را روی کارت هر واحد معدنی ببرید تا خلاصه آنی آن نمایش داده شود، یا برای مشاهده فهرست کامل پرسنل، گزارش‌های بارگذاری‌شده واحد، حقوق، کارانه و تعهدات روی آن کلیک کنید.
          </div>
        )}
      </div>

      {/* Mining Units Interactive Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {visibleUnits.map(u => {
          const hasData =
            u.personnelCount > 0 ||
            u.payrollCount > 0 ||
            u.totalKaraneh > 0 ||
            u.classificationsCount > 0 ||
            u.unitReportsCount > 0 ||
            u.volumeRecords.length > 0 ||
            u.machineryRecords.length > 0;
          return (
            <button
              key={u.id}
              type="button"
              onMouseEnter={() => setHoveredUnitId(u.id)}
              onMouseLeave={() => setHoveredUnitId(null)}
              onClick={() => openDrillDown(u)}
              className={`text-right p-4 rounded-2xl border transition-all cursor-pointer space-y-3 group ${
                hasData
                  ? 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                  : 'bg-slate-50/60 border-slate-200/70 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-indigo-50 border border-slate-200 flex items-center justify-center shrink-0">
                    {getUnitIcon(u.id)}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-700">
                      {u.unitName}
                    </h4>
                    <span className="text-[10px] text-slate-500 block">{u.category}</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                  <Eye className="w-3 h-3" />
                  جزئیات
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100 persian-num">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">نیروی انسانی</span>
                  <b className="text-slate-900">
                    {toPersianDigits(u.personnelCount)} نفر ({toPersianDigits(u.activeCount)} فعال)
                  </b>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">گزارش‌های اکسل / حجم</span>
                  <b className="text-indigo-800">
                    {toPersianDigits(u.unitReportsCount)} گزارش / {toPersianDigits(u.volumeRecords.length)} آمار
                  </b>
                </div>
                <div className="bg-emerald-50/60 p-2 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">جمع خالص حقوق</span>
                  <b className="text-emerald-800">{formatRial(u.totalNetPayroll)}</b>
                </div>
                <div className="bg-teal-50/60 p-2 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">جمع کارانه دوره</span>
                  <b className="text-teal-800">{formatRial(u.totalKaraneh)}</b>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 persian-num">
                <span>ناوگان: {toPersianDigits(u.readyMachineryCount)} آماده / {toPersianDigits(u.brokenMachineryCount)} متوقف</span>
                <span>تعهدات: {toPersianDigits(u.commitmentsCount)} فقره</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Drill-Down Modal for Selected Mining Unit */}
      {selectedUnit && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden my-4">
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                  {getUnitIcon(selectedUnit.id)}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">{selectedUnit.unitName}</h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {selectedUnit.category} · {selectedUnit.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUnit(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drill-down sub-tabs */}
            <div className="px-4 pt-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-1.5 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setDrillTab('summary')}
                className={`px-3 py-2 rounded-t-xl font-bold border-b-2 transition-colors cursor-pointer ${
                  drillTab === 'summary' ? 'bg-white border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600'
                }`}
              >
                خلاصه شاخص‌های واحد
              </button>
              <button
                type="button"
                onClick={() => setDrillTab('reports')}
                className={`px-3 py-2 rounded-t-xl font-bold border-b-2 transition-colors cursor-pointer persian-num ${
                  drillTab === 'reports' ? 'bg-white border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600'
                }`}
              >
                گزارش‌های اکسل و عملیات واحد ({toPersianDigits(selectedUnit.unitReportsCount + selectedUnit.volumeRecords.length + selectedUnit.machineryRecords.length)})
              </button>
              <button
                type="button"
                onClick={() => setDrillTab('personnel')}
                className={`px-3 py-2 rounded-t-xl font-bold border-b-2 transition-colors cursor-pointer persian-num ${
                  drillTab === 'personnel' ? 'bg-white border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600'
                }`}
              >
                پرسنل واحد ({toPersianDigits(selectedUnit.personnelCount)})
              </button>
              <button
                type="button"
                onClick={() => setDrillTab('payroll')}
                className={`px-3 py-2 rounded-t-xl font-bold border-b-2 transition-colors cursor-pointer persian-num ${
                  drillTab === 'payroll' ? 'bg-white border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600'
                }`}
              >
                حقوق و دستمزد ({toPersianDigits(selectedUnit.payrollCount)})
              </button>
              <button
                type="button"
                onClick={() => setDrillTab('karaneh')}
                className={`px-3 py-2 rounded-t-xl font-bold border-b-2 transition-colors cursor-pointer persian-num ${
                  drillTab === 'karaneh' ? 'bg-white border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600'
                }`}
              >
                کارانه ({toPersianDigits(selectedUnit.karanehRecords.length)})
              </button>
              <button
                type="button"
                onClick={() => setDrillTab('commitments')}
                className={`px-3 py-2 rounded-t-xl font-bold border-b-2 transition-colors cursor-pointer persian-num ${
                  drillTab === 'commitments' ? 'bg-white border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600'
                }`}
              >
                تعهدات و تضامین ({toPersianDigits(selectedUnit.commitmentsCount)})
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 text-xs space-y-4">
              {drillTab === 'reports' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900">گزارش‌های ارسالی و اکسل واحد ({toPersianDigits(selectedUnit.unitReports.length)} مورد):</h4>
                    {selectedUnit.unitReports.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl">گزارش اکسل/عملیاتی برای این واحد ثبت نشده است.</div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-right">
                          <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                            <tr>
                              <th className="p-2.5">دوره</th>
                              <th className="p-2.5">عنوان شاخص / موضوع</th>
                              <th className="p-2.5">مقدار ماه جاری</th>
                              <th className="p-2.5">ماه قبل</th>
                              <th className="p-2.5">هدف مصوب</th>
                              <th className="p-2.5">مسئول ثبت</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedUnit.unitReports.map((ur) => (
                              <tr key={ur.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-bold persian-num">{getPeriodLabel(ur.period)}</td>
                                <td className="p-2.5 font-bold text-slate-900">{ur.metricName}</td>
                                <td className="p-2.5 font-extrabold text-indigo-700 persian-num">{toPersianDigits(ur.actualValue)} {ur.unitLabel}</td>
                                <td className="p-2.5 persian-num">{toPersianDigits(ur.previousValue || 0)} {ur.unitLabel}</td>
                                <td className="p-2.5 persian-num">{toPersianDigits(ur.targetValue || 0)} {ur.unitLabel}</td>
                                <td className="p-2.5 text-slate-600">{ur.submittedBy || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {selectedUnit.volumeRecords.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-900">آمار حجم عملیات ثبت‌شده ({toPersianDigits(selectedUnit.volumeRecords.length)} مورد):</h4>
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-right">
                          <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                            <tr>
                              <th className="p-2.5">دوره</th>
                              <th className="p-2.5">عملیات / شاخص</th>
                              <th className="p-2.5">حجم محقق‌شده</th>
                              <th className="p-2.5">هدف ماه</th>
                              <th className="p-2.5">وضعیت</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedUnit.volumeRecords.map((v) => (
                              <tr key={v.id}>
                                <td className="p-2.5 font-bold persian-num">{getPeriodLabel(v.period)}</td>
                                <td className="p-2.5 font-bold">{v.metricTitle || v.activityType}</td>
                                <td className="p-2.5 font-bold text-emerald-700 persian-num">{toPersianDigits(v.volumeValue)} {v.unitLabel}</td>
                                <td className="p-2.5 persian-num">{toPersianDigits(v.targetVolume)} {v.unitLabel}</td>
                                <td className="p-2.5">{v.status || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {selectedUnit.machineryRecords.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-900">ماشین‌آلات مستقر یا مرتبط با واحد ({toPersianDigits(selectedUnit.machineryRecords.length)} دستگاه):</h4>
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-right">
                          <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                            <tr>
                              <th className="p-2.5">کد</th>
                              <th className="p-2.5">نام دستگاه</th>
                              <th className="p-2.5">وضعیت</th>
                              <th className="p-2.5">شرح تعمیر / خرابی</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedUnit.machineryRecords.map((m) => (
                              <tr key={m.id}>
                                <td className="p-2.5 font-bold persian-num">{toPersianDigits(m.machineCode)}</td>
                                <td className="p-2.5 font-bold">{m.machineName}</td>
                                <td className="p-2.5 font-bold">{m.status}</td>
                                <td className="p-2.5">{m.issueDescription || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {drillTab === 'summary' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 persian-num">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <span className="text-slate-500 flex items-center gap-1.5"><Users className="w-4 h-4 text-indigo-600" />نیروی انسانی کارگزینی</span>
                    <div className="text-lg font-extrabold text-slate-900">{toPersianDigits(selectedUnit.personnelCount)} نفر</div>
                    <div className="text-[11px] text-slate-600">{toPersianDigits(selectedUnit.activeCount)} شاغل فعال</div>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                    <span className="text-emerald-800 flex items-center gap-1.5"><Wallet className="w-4 h-4" />جمع خالص پرداختی حقوق</span>
                    <div className="text-lg font-extrabold text-emerald-950">{formatRial(selectedUnit.totalNetPayroll)}</div>
                    <div className="text-[11px] text-emerald-800">میانگین سرانه: {formatRial(selectedUnit.avgNetPayroll)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-1">
                    <span className="text-teal-800 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" />بودجه کارانه و اضافه‌کاری</span>
                    <div className="text-lg font-extrabold text-teal-950">{formatRial(selectedUnit.totalKaraneh)}</div>
                    <div className="text-[11px] text-teal-800">اضافه‌کار حقوق: {formatRial(selectedUnit.overtimeCost)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                    <span className="text-amber-800 flex items-center gap-1.5"><FileCheck className="w-4 h-4" />تعهدات و تضامین پرسنل واحد</span>
                    <div className="text-lg font-extrabold text-amber-950">{formatRial(selectedUnit.commitmentsAmount)}</div>
                    <div className="text-[11px] text-amber-800">{toPersianDigits(selectedUnit.commitmentsCount)} فقره تعهد ثبت‌شده</div>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
                    <span className="text-rose-800 flex items-center gap-1.5"><HeartHandshake className="w-4 h-4" />بستگان و افراد تحت تکفل</span>
                    <div className="text-lg font-extrabold text-rose-950">{toPersianDigits(selectedUnit.relativesCount)} نفر</div>
                    <div className="text-[11px] text-rose-800">ثبت‌شده در پرونده پرسنل واحد</div>
                  </div>
                  <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 space-y-1">
                    <span className="text-violet-800 flex items-center gap-1.5"><Pickaxe className="w-4 h-4" />طبقه‌بندی مشاغل معدنی</span>
                    <div className="text-lg font-extrabold text-violet-950">{toPersianDigits(selectedUnit.classificationsCount)} پرونده</div>
                    <div className="text-[11px] text-violet-800">سوابق ۱۸ ستونی ثبت‌شده</div>
                  </div>
                </div>
              )}

              {drillTab === 'personnel' && (
                selectedUnit.personnel.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl">پرسنلی در این واحد ثبت نشده است.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5">کد پرسنلی</th>
                          <th className="p-2.5">نام و نام خانوادگی</th>
                          <th className="p-2.5">کد ملی</th>
                          <th className="p-2.5">شغل / پست</th>
                          <th className="p-2.5">محل خدمت</th>
                          <th className="p-2.5">بستگان</th>
                          <th className="p-2.5">وضعیت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedUnit.personnel.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-indigo-700 persian-num">{toPersianDigits(p.personnelCode)}</td>
                            <td className="p-2.5 font-bold">{p.fullName}</td>
                            <td className="p-2.5 persian-num">{toPersianDigits(p.nationalId)}</td>
                            <td className="p-2.5">{p.jobTitle || '—'} / {p.position}</td>
                            <td className="p-2.5">{p.workLocation || p.department}</td>
                            <td className="p-2.5 persian-num">{toPersianDigits((p.relatives || []).length)} نفر</td>
                            <td className="p-2.5">{p.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {drillTab === 'payroll' && (
                selectedUnit.payrollRecords.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl">فیش حقوقی در دوره فعال برای این واحد ثبت نشده است.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5">کد پرسنلی</th>
                          <th className="p-2.5">نام و نام خانوادگی</th>
                          <th className="p-2.5">پست</th>
                          <th className="p-2.5">جمع مزایا</th>
                          <th className="p-2.5">اضافه‌کار</th>
                          <th className="p-2.5">جمع کسور</th>
                          <th className="p-2.5">خالص پرداختی</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedUnit.payrollRecords.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-indigo-700 persian-num">{toPersianDigits(r.personnelCode)}</td>
                            <td className="p-2.5 font-bold">{r.fullName}</td>
                            <td className="p-2.5">{r.position || r.jobTitle || '—'}</td>
                            <td className="p-2.5 persian-num">{formatRial(r.totalBenefits)}</td>
                            <td className="p-2.5 persian-num text-amber-700">{formatRial(r.overtimeAmount)}</td>
                            <td className="p-2.5 persian-num text-rose-700">{formatRial(r.totalDeductions)}</td>
                            <td className="p-2.5 font-bold persian-num text-emerald-700">{formatRial(r.netPayable)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {drillTab === 'karaneh' && (
                selectedUnit.karanehRecords.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl">رکورد کارانه در دوره فعال برای این واحد ثبت نشده است.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5">کد پرسنلی</th>
                          <th className="p-2.5">نام و نام خانوادگی</th>
                          <th className="p-2.5">پست</th>
                          <th className="p-2.5">کارانه پایه</th>
                          <th className="p-2.5">کارانه نهایی</th>
                          <th className="p-2.5">توضیحات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedUnit.karanehRecords.map(k => (
                          <tr key={k.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-indigo-700 persian-num">{toPersianDigits(k.personnelCode)}</td>
                            <td className="p-2.5 font-bold">{k.fullName}</td>
                            <td className="p-2.5">{k.position || '—'}</td>
                            <td className="p-2.5 persian-num">{formatRial(k.baseKaraneh)}</td>
                            <td className="p-2.5 font-bold persian-num text-teal-700">{formatRial(k.finalKaraneh)}</td>
                            <td className="p-2.5 text-slate-600">{k.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {drillTab === 'commitments' && (
                selectedUnit.commitments.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl">تعهد یا تضمینی برای پرسنل این واحد ثبت نشده است.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5">کد پرسنلی</th>
                          <th className="p-2.5">نام پرسنل</th>
                          <th className="p-2.5">نوع تعهد</th>
                          <th className="p-2.5">مبلغ فعلی</th>
                          <th className="p-2.5">سقف مجاز</th>
                          <th className="p-2.5">سررسید</th>
                          <th className="p-2.5">وضعیت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedUnit.commitments.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-indigo-700 persian-num">{toPersianDigits(c.personnelCode)}</td>
                            <td className="p-2.5 font-bold">{c.personnelName}</td>
                            <td className="p-2.5">{c.commitmentType}</td>
                            <td className="p-2.5 font-bold persian-num">{formatRial(c.amount)}</td>
                            <td className="p-2.5 persian-num">{formatRial(c.maxAllowedAmount || c.amount)}</td>
                            <td className="p-2.5 persian-num">{toPersianDigits(c.endDate || '—')}</td>
                            <td className="p-2.5">{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
