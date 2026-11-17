import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import firebaseConfig from './firebase-applet-config.json';
import { isPostgresConfigured } from './src/db/index.ts';
import {
  getOrCreateUserByUid,
  loadSnapshotFromPostgres,
  syncSnapshotToPostgres,
  linkUserFirebaseUid,
} from './src/db/repository.ts';
import { verifyFirebaseBearerToken } from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Local database persistence directory & files on disk
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'hr_database.json');
const SECRET_FILE = path.join(DATA_DIR, '.server_secret');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Persistent server-side HMAC signing secret (never exposed to client)
function getServerSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SERVER_SECRET = getServerSecret();

// Secure scrypt password hashing (auto-compatible with legacy plaintext passwords on login)
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain: string, stored: string): { valid: boolean; needsMigration: boolean } {
  if (!stored) return { valid: false, needsMigration: false };
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valid: false, needsMigration: false };
    const [, salt, originalHex] = parts;
    const derived = crypto.scryptSync(plain, salt, 64);
    const original = Buffer.from(originalHex, 'hex');
    if (derived.length !== original.length) return { valid: false, needsMigration: false };
    return { valid: crypto.timingSafeEqual(derived, original), needsMigration: false };
  }
  // Legacy plaintext comparison -> auto-upgrade hash upon valid login
  return { valid: stored === plain, needsMigration: stored === plain };
}

// HMAC-SHA256 Signed Auth Token
function createAuthToken(user: any): string {
  const payload = {
    uid: user.id,
    usr: user.username,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAuthToken(token: string): { uid: string; usr: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Initial default seed database (only used if hr_database.json does NOT exist)
function getInitialDatabase() {
  return {
    users: [
      {
        id: 'u-admin-1',
        username: 'javadabadiyan',
        password: hashPassword('javad_5221157'),
        fullName: 'جواد آبادیان (مدیر ارشد سامانه)',
        role: 'super_admin',
        department: 'مدیریت منابع انسانی و کارگزینی',
        permissions: getFullAdminPermissionsServer(),
        isActive: true,
        createdAt: '1403/01/01',
        lastLogin: 'هم‌اکنون',
      },
      {
        id: 'u-officer-2',
        username: 'karaneh_admin',
        password: hashPassword('12345678'),
        fullName: 'سارا کاظمی (کارشناس ارزیابی و کارانه)',
        role: 'karaneh_officer',
        department: 'اداره جبران خدمت و کارانه',
        permissions: normalizePermissionsServer({
          personnel: { view: true, exportExcel: true, viewSalary: true },
          karaneh: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
          jobGroups: { view: true, exportExcel: true },
          payroll: { view: true, exportExcel: true },
          smartDashboard: { view: true, exportExcel: true },
          system: { dashboardStats: true },
        }),
        isActive: true,
        createdAt: '1403/03/10',
        lastLogin: '۱۴۰۳/۰۸/۰۲',
      },
      {
        id: 'u-officer-3',
        username: 'hr_expert',
        password: hashPassword('12345678'),
        fullName: 'محمد امینی (کارشناس امور اداری و پرسنلی)',
        role: 'hr_officer',
        department: 'امور کارکنان و قراردادها',
        permissions: normalizePermissionsServer({
          personnel: { view: true, create: true, edit: true, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
          karaneh: { view: true, exportExcel: true },
          jobGroups: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
          commitments: { view: true, create: true, edit: true, print: true, archive: true, importExcel: true, exportExcel: true },
          payroll: { view: true, create: true, edit: true, importExcel: true, exportExcel: true },
          smartDashboard: { view: true, exportExcel: true, print: true },
          system: { dashboardStats: true },
        }),
        isActive: true,
        createdAt: '1403/04/15',
        lastLogin: '۱۴۰۳/۰۸/۰۱',
      }
    ],
    jobGroups: [
      {
        id: 'jg-1',
        code: 'گروه ۱۶',
        title: 'مدیران ارشد و رؤسای ادارات',
        grade: 16,
        minBaseSalary: 280000000,
        maxBaseSalary: 450000000,
        maxKaranehCeiling: 120000000,
        requiredExperienceYears: 12,
        requiredDegree: 'کارشناسی ارشد یا دکتری',
        description: 'راهبری استراتژیک، مدیریت واحدهای ستادی و مسئولیت نهایی برنامه‌ها'
      },
      {
        id: 'jg-2',
        code: 'گروه ۱۴',
        title: 'کارشناسان مسئول و سرپرستان',
        grade: 14,
        minBaseSalary: 220000000,
        maxBaseSalary: 320000000,
        maxKaranehCeiling: 85000000,
        requiredExperienceYears: 8,
        requiredDegree: 'کارشناسی یا کارشناسی ارشد',
        description: 'نظارت اجرایی، هماهنگی پروژه‌ها و هدایت تیم‌های تخصصی'
      },
      {
        id: 'jg-3',
        code: 'گروه ۱۲',
        title: 'کارشناسان ارشد تخصصی',
        grade: 12,
        minBaseSalary: 180000000,
        maxBaseSalary: 260000000,
        maxKaranehCeiling: 65000000,
        requiredExperienceYears: 5,
        requiredDegree: 'کارشناسی مرتبط',
        description: 'اجرای وظایف تخصصی، تحلیل فرآیندها و توسعه سامانه‌ها'
      },
      {
        id: 'jg-4',
        code: 'گروه ۱۰',
        title: 'کارشناسان و تکنسین‌های فنی',
        grade: 10,
        minBaseSalary: 140000000,
        maxBaseSalary: 200000000,
        maxKaranehCeiling: 50000000,
        requiredExperienceYears: 3,
        requiredDegree: 'کارشناسی یا کاردانی فنی',
        description: 'پشتیبانی فنی، نگهداری تجهیزات و امور اجرایی'
      },
      {
        id: 'jg-5',
        code: 'گروه ۸',
        title: 'متصدیان اداری و پشتیبانی',
        grade: 8,
        minBaseSalary: 110000000,
        maxBaseSalary: 160000000,
        maxKaranehCeiling: 35000000,
        requiredExperienceYears: 1,
        requiredDegree: 'دیپلم یا کاردانی',
        description: 'دبیرخانه، بایگانی، خدمات دفتری و لجستیک'
      }
    ],
    jobClassifications: [],
    personnel: [
      {
        id: 'p-101',
        personnelCode: '10101',
        firstName: 'رضا',
        lastName: 'قاسمی',
        fullName: 'رضا قاسمی',
        nationalId: '0078912345',
        position: 'مدیر فناوری اطلاعات و سامانه‌ها',
        department: 'فناوری اطلاعات',
        hireDate: '1397/02/10',
        employmentType: 'رسمی',
        jobGroupId: 'jg-1',
        jobGroupName: 'گروه ۱۶ - مدیران ارشد و رؤسای ادارات',
        education: 'کارشناسی ارشد مهندسی نرم‌افزار',
        phone: '09121114567',
        email: 'r.ghasemi@org.ir',
        status: 'فعال',
        baseSalary: 340000000,
        notes: 'مسئول مستقیم تحول دیجیتال و سرورهای مرکزی',
        createdAt: '1403/01/01',
        updatedAt: '1403/08/01'
      },
      {
        id: 'p-102',
        personnelCode: '10102',
        firstName: 'زهرا',
        lastName: 'کریمی',
        fullName: 'زهرا کریمی',
        nationalId: '0065432109',
        position: 'رئیس حسابداری و بودجه',
        department: 'امور مالی و اقتصادی',
        hireDate: '1398/05/15',
        employmentType: 'رسمی',
        jobGroupId: 'jg-2',
        jobGroupName: 'گروه ۱۴ - کارشناسان مسئول و سرپرستان',
        education: 'کارشناسی ارشد حسابداری و مدیریت مالی',
        phone: '09122225678',
        email: 'z.karimi@org.ir',
        status: 'فعال',
        baseSalary: 290000000,
        notes: 'ناظر بر فرآیندهای مالیاتی و محاسبات کارانه',
        createdAt: '1403/01/01',
        updatedAt: '1403/08/01'
      },
      {
        id: 'p-103',
        personnelCode: '10103',
        firstName: 'امیرحسین',
        lastName: 'مرادی',
        fullName: 'امیرحسین مرادی',
        nationalId: '0451239876',
        position: 'کارشناس ارشد شبکه و امنیت',
        department: 'فناوری اطلاعات',
        hireDate: '1400/07/01',
        employmentType: 'پیمانی',
        jobGroupId: 'jg-3',
        jobGroupName: 'گروه ۱۲ - کارشناسان ارشد تخصصی',
        education: 'کارشناسی مهندسی فناوری اطلاعات',
        phone: '09123336789',
        email: 'a.moradi@org.ir',
        status: 'فعال',
        baseSalary: 235000000,
        notes: 'طراح معماری دیتابیس لوکال و تونل ارتباطی امن',
        createdAt: '1403/01/01',
        updatedAt: '1403/08/01'
      },
      {
        id: 'p-104',
        personnelCode: '10104',
        firstName: 'فاطمه',
        lastName: 'صادقی',
        fullName: 'فاطمه صادقی',
        nationalId: '0032165498',
        position: 'کارشناس کارگزینی و تشکیلات',
        department: 'منابع انسانی',
        hireDate: '1401/03/20',
        employmentType: 'قراردادی',
        jobGroupId: 'jg-3',
        jobGroupName: 'گروه ۱۲ - کارشناسان ارشد تخصصی',
        education: 'کارشناسی مدیریت دولتی',
        phone: '09124447890',
        email: 'f.sadeghi@org.ir',
        status: 'فعال',
        baseSalary: 195000000,
        notes: 'مسئول ثبت و پایش تعهدات پرسنلی و پرونده‌ها',
        createdAt: '1403/01/01',
        updatedAt: '1403/08/01'
      },
      {
        id: 'p-105',
        personnelCode: '10105',
        firstName: 'مهدی',
        lastName: 'نجفی',
        fullName: 'مهدی نجفی',
        nationalId: '0389874561',
        position: 'سرپرست خط تولید و تضمین کیفیت',
        department: 'تولید و عملیات',
        hireDate: '1399/11/12',
        employmentType: 'رسمی',
        jobGroupId: 'jg-2',
        jobGroupName: 'گروه ۱۴ - کارشناسان مسئول و سرپرستان',
        education: 'کارشناسی مهندسی صنایع',
        phone: '09125558901',
        email: 'm.najafi@org.ir',
        status: 'فعال',
        baseSalary: 275000000,
        notes: 'مدیریت شیفت‌های کارگاهی و راندمان خطوط',
        createdAt: '1403/01/01',
        updatedAt: '1403/08/01'
      },
      {
        id: 'p-106',
        personnelCode: '10106',
        firstName: 'سمیرا',
        lastName: 'پژمان',
        fullName: 'سمیرا پژمان',
        nationalId: '0081234567',
        position: 'مسئول دفتر مدیرعامل و دبیرخانه',
        department: 'مدیریت و پشتیبانی',
        hireDate: '1402/01/15',
        employmentType: 'قراردادی',
        jobGroupId: 'jg-5',
        jobGroupName: 'گروه ۸ - متصدیان اداری و پشتیبانی',
        education: 'کاردانی روابط عمومی',
        phone: '09126669012',
        email: 's.pezhman@org.ir',
        status: 'فعال',
        baseSalary: 145000000,
        notes: 'پیگیری مکاتبات اداری و ارجاعات کارگزینی',
        createdAt: '1403/01/01',
        updatedAt: '1403/08/01'
      }
    ],
    karaneh: [
      {
        id: 'k-101-07',
        personnelId: 'p-101',
        personnelCode: '10101',
        fullName: 'رضا قاسمی',
        department: 'فناوری اطلاعات',
        position: 'مدیر فناوری اطلاعات و سامانه‌ها',
        period: '1403-07',
        baseKaraneh: 60000000,
        overtimeBonus: 20000000,
        deductions: 0,
        finalKaraneh: 80000000,
        notes: 'تحویل فاز یک شبکه',
        updatedAt: '1403/07/28'
      },
      {
        id: 'k-102-07',
        personnelId: 'p-102',
        personnelCode: '10102',
        fullName: 'زهرا کریمی',
        department: 'امور مالی و اقتصادی',
        position: 'رئیس حسابداری و بودجه',
        period: '1403-07',
        baseKaraneh: 48000000,
        overtimeBonus: 12000000,
        deductions: 0,
        finalKaraneh: 60000000,
        notes: 'بستن حساب‌های شش‌ماهه',
        updatedAt: '1403/07/28'
      },
      {
        id: 'k-103-07',
        personnelId: 'p-103',
        personnelCode: '10103',
        fullName: 'امیرحسین مرادی',
        department: 'فناوری اطلاعات',
        position: 'کارشناس ارشد شبکه و امنیت',
        period: '1403-07',
        baseKaraneh: 38000000,
        overtimeBonus: 7000000,
        deductions: 0,
        finalKaraneh: 45000000,
        notes: 'پیکربندی فایروال',
        updatedAt: '1403/07/28'
      },
      {
        id: 'k-104-07',
        personnelId: 'p-104',
        personnelCode: '10104',
        fullName: 'فاطمه صادقی',
        department: 'منابع انسانی',
        position: 'کارشناس کارگزینی و تشکیلات',
        period: '1403-07',
        baseKaraneh: 32000000,
        overtimeBonus: 6000000,
        deductions: 0,
        finalKaraneh: 38000000,
        notes: 'ساماندهی پرونده‌های فیزیکی',
        updatedAt: '1403/07/28'
      },
      {
        id: 'k-105-07',
        personnelId: 'p-105',
        personnelCode: '10105',
        fullName: 'مهدی نجفی',
        department: 'تولید و عملیات',
        position: 'سرپرست خط تولید و تضمین کیفیت',
        period: '1403-07',
        baseKaraneh: 46000000,
        overtimeBonus: 14000000,
        deductions: 0,
        finalKaraneh: 60000000,
        notes: 'کاهش ضایعات خط A',
        updatedAt: '1403/07/28'
      },
      {
        id: 'k-106-07',
        personnelId: 'p-106',
        personnelCode: '10106',
        fullName: 'سمیرا پژمان',
        department: 'مدیریت و پشتیبانی',
        position: 'مسئول دفتر مدیرعامل و دبیرخانه',
        period: '1403-07',
        baseKaraneh: 22000000,
        overtimeBonus: 4000000,
        deductions: 0,
        finalKaraneh: 26000000,
        notes: 'نظم در مکاتبات جلسات هیئت‌مدیره',
        updatedAt: '1403/07/28'
      },
      {
        id: 'k-101-08',
        personnelId: 'p-101',
        personnelCode: '10101',
        fullName: 'رضا قاسمی',
        department: 'فناوری اطلاعات',
        position: 'مدیر فناوری اطلاعات و سامانه‌ها',
        period: '1403-08',
        baseKaraneh: 65000000,
        overtimeBonus: 28000000,
        deductions: 0,
        finalKaraneh: 93000000,
        notes: 'راه‌اندازی کامل دیتابیس لوکال و پشتیبانی ۲۴ ساعته (+۱۶.۲۵٪ رشد)',
        updatedAt: '1403/08/29'
      },
      {
        id: 'k-102-08',
        personnelId: 'p-102',
        personnelCode: '10102',
        fullName: 'زهرا کریمی',
        department: 'امور مالی و اقتصادی',
        position: 'رئیس حسابداری و بودجه',
        period: '1403-08',
        baseKaraneh: 52000000,
        overtimeBonus: 16000000,
        deductions: 0,
        finalKaraneh: 68000000,
        notes: 'ارائه گزارش تحلیلی سود و زیان واحدها (+۱۳.۳٪ رشد)',
        updatedAt: '1403/08/29'
      },
      {
        id: 'k-103-08',
        personnelId: 'p-103',
        personnelCode: '10103',
        fullName: 'امیرحسین مرادی',
        department: 'فناوری اطلاعات',
        position: 'کارشناس ارشد شبکه و امنیت',
        period: '1403-08',
        baseKaraneh: 42000000,
        overtimeBonus: 11000000,
        deductions: 0,
        finalKaraneh: 53000000,
        notes: 'پیاده‌سازی رمزنگاری اطلاعات و تونل اینترنتی (+۱۷.۸٪ رشد)',
        updatedAt: '1403/08/29'
      },
      {
        id: 'k-104-08',
        personnelId: 'p-104',
        personnelCode: '10104',
        fullName: 'فاطمه صادقی',
        department: 'منابع انسانی',
        position: 'کارشناس کارگزینی و تشکیلات',
        period: '1403-08',
        baseKaraneh: 34000000,
        overtimeBonus: 8000000,
        deductions: 0,
        finalKaraneh: 42000000,
        notes: 'ورود اطلاعات اکسل پرونده‌های پرسنلی (+۱۰.۵٪ رشد)',
        updatedAt: '1403/08/29'
      },
      {
        id: 'k-105-08',
        personnelId: 'p-105',
        personnelCode: '10105',
        fullName: 'مهدی نجفی',
        department: 'تولید و عملیات',
        position: 'سرپرست خط تولید و تضمین کیفیت',
        period: '1403-08',
        baseKaraneh: 42000000,
        overtimeBonus: 10000000,
        deductions: 4000000,
        finalKaraneh: 48000000,
        notes: 'کسر به دلیل تاخیر در تحویل محموله خط تولید (-۲۰٪ کاهش)',
        updatedAt: '1403/08/29'
      },
      {
        id: 'k-106-08',
        personnelId: 'p-106',
        personnelCode: '10106',
        fullName: 'سمیرا پژمان',
        department: 'مدیریت و پشتیبانی',
        position: 'مسئول دفتر مدیرعامل و دبیرخانه',
        period: '1403-08',
        baseKaraneh: 24000000,
        overtimeBonus: 5000000,
        deductions: 0,
        finalKaraneh: 29000000,
        notes: 'هماهنگی منظم همایش سالانه (+۱۱.۵٪ رشد)',
        updatedAt: '1403/08/29'
      }
    ],
    commitments: [
      {
        id: 'cmt-1',
        personnelId: 'p-101',
        personnelCode: '10101',
        personnelName: 'رضا قاسمی',
        commitmentType: 'تعهد خدمت',
        amount: 1500000000,
        previouslyTakenAmount: 300000000,
        maxAllowedAmount: 2500000000,
        startDate: '1397/02/10',
        endDate: '1407/02/10',
        status: 'جاری و معتبر',
        isArchived: false,
        guarantorName: 'مهندس احمد باقری',
        notes: 'تعهد خدمت ۱۰ ساله بابت بورسیه دوره‌های امنیت پیشرفته'
      },
      {
        id: 'cmt-2',
        personnelId: 'p-102',
        personnelCode: '10102',
        personnelName: 'زهرا کریمی',
        commitmentType: 'تعهد حسابداری',
        amount: 500000000,
        previouslyTakenAmount: 250000000,
        maxAllowedAmount: 1500000000,
        startDate: '1403/05/15',
        endDate: '1405/05/15',
        status: 'جاری و معتبر',
        isArchived: false,
        guarantorName: 'دکتر علیرضا کریمی',
        notes: 'تعهد حسابداری مسئول امور مالی و تنخواه گردان'
      },
      {
        id: 'cmt-3',
        personnelId: 'p-103',
        personnelCode: '10103',
        personnelName: 'امیرحسین مرادی',
        commitmentType: 'سفته حسن انجام کار',
        amount: 800000000,
        previouslyTakenAmount: 0,
        maxAllowedAmount: 1200000000,
        startDate: '1400/07/01',
        endDate: '1404/07/01',
        status: 'جاری و معتبر',
        isArchived: false,
        guarantorName: 'پدر - حسن مرادی',
        notes: 'تضمین اموال رایانه‌ای و دیتاسنتر'
      },
      {
        id: 'cmt-4',
        personnelId: 'p-104',
        personnelCode: '10104',
        personnelName: 'فاطمه صادقی',
        commitmentType: 'تعهد دوره‌های آموزشی',
        amount: 300000000,
        previouslyTakenAmount: 100000000,
        maxAllowedAmount: 600000000,
        startDate: '1402/06/01',
        endDate: '1404/06/01',
        status: 'جاری و معتبر',
        isArchived: false,
        guarantorName: '-',
        notes: 'تعهد خدمت دو ساله پس از گذراندن دوره طبقه‌بندی مشاغل'
      }
    ],
    payroll: [],
    miningVolumes: [
      { id: 'mv-140307-1', period: '1403-07', unitName: 'استخراج و معدن‌کاری', activityType: 'استخراج ماده معدنی', metricTitle: 'استخراج سینه کار اصلی', volumeValue: 44200, targetVolume: 48000, unitLabel: 'تن', status: 'تکمیل‌شده', notes: 'عملکرد مهرماه', updatedAt: '1403/07/30' },
      { id: 'mv-140307-2', period: '1403-07', unitName: 'تراش و باطله‌برداری', activityType: 'باطله‌برداری', metricTitle: 'باطله‌برداری جبهه شمالی', volumeValue: 56000, targetVolume: 58000, unitLabel: 'مترمکعب', status: 'تکمیل‌شده', notes: 'آمار بارگیری و حمل باطله', updatedAt: '1403/07/30' },
      { id: 'mv-140307-3', period: '1403-07', unitName: 'فرآوری و سنگ‌شکن', activityType: 'خردایش و دانه‌بندی', metricTitle: 'خوراک ورودی سنگ‌شکن', volumeValue: 39500, targetVolume: 42000, unitLabel: 'تن', status: 'تکمیل‌شده', notes: 'بهره‌برداری خط یک و دو', updatedAt: '1403/07/30' },
      { id: 'mv-140308-1', period: '1403-08', unitName: 'استخراج و معدن‌کاری', activityType: 'استخراج ماده معدنی', metricTitle: 'استخراج سینه کار اصلی', volumeValue: 49800, targetVolume: 50000, unitLabel: 'تن', status: 'نزدیک به هدف', notes: 'رشد ۱۲.۷ درصدی نسبت به مهرماه', updatedAt: '1403/08/29' },
      { id: 'mv-140308-2', period: '1403-08', unitName: 'تراش و باطله‌برداری', activityType: 'باطله‌برداری', metricTitle: 'باطله‌برداری جبهه شمالی', volumeValue: 63400, targetVolume: 60000, unitLabel: 'مترمکعب', status: 'فراتر از برنامه', notes: 'اضافه‌شدن یک دستگاه دامپتراک', updatedAt: '1403/08/29' },
      { id: 'mv-140308-3', period: '1403-08', unitName: 'فرآوری و سنگ‌شکن', activityType: 'خردایش و دانه‌بندی', metricTitle: 'خوراک ورودی سنگ‌شکن', volumeValue: 45100, targetVolume: 44000, unitLabel: 'تن', status: 'فراتر از برنامه', notes: 'کاهش توقفات خط سنگ‌شکن', updatedAt: '1403/08/29' },
    ],
    miningMachinery: [
      { id: 'mm-1', machineCode: 'EQ-DT-101', machineName: 'دامپتراک بلاز ۴۵ تن شماره ۱', machineType: 'دامپتراک', unitName: 'حمل و نقل و بارگیری', status: 'آماده به کار', issueDescription: 'سالم و فعال در شیفت روز و شب', stoppedSince: '-', estimatedReadyDate: '-', operatorName: 'حسین محمدی', notes: 'آماده سرویس کامل', updatedAt: '1403/08/29' },
      { id: 'mm-2', machineCode: 'EQ-DT-102', machineName: 'دامپتراک کوماتسو HD465 شماره ۲', machineType: 'دامپتراک', unitName: 'حمل و نقل و بارگیری', status: 'آماده به کار', issueDescription: 'فعال در مسیر جبهه استخراج به سنگ‌شکن', stoppedSince: '-', estimatedReadyDate: '-', operatorName: 'مجید کریمی', notes: '', updatedAt: '1403/08/29' },
      { id: 'mm-3', machineCode: 'EQ-EX-201', machineName: 'بیل مکانیکی کوماتسو PC400', machineType: 'بیل مکانیکی', unitName: 'استخراج و معدن‌کاری', status: 'خراب / در تعمیرگاه', issueDescription: 'نشتی جک بوم و تعویض پکینگ هیدرولیک در تعمیرگاه مرکزی', stoppedSince: '1403/08/22', estimatedReadyDate: '1403/08/28', operatorName: 'تیم تعمیرات سنگین', notes: 'کیت پکینگ تامین شد', updatedAt: '1403/08/29' },
      { id: 'mm-4', machineCode: 'EQ-LD-301', machineName: 'لودر کاترپیلار 966H شماره ۱', machineType: 'لودر', unitName: 'فرآوری و سنگ‌شکن', status: 'در انتظار قطعه', issueDescription: 'نیاز به تعویض پمپ گیربکس و فیلترهای فشار قوی', stoppedSince: '1403/08/19', estimatedReadyDate: '1403/09/02', operatorName: 'واحد تعمیرگاه', notes: 'درخواست خرید فوری ارسال شده', updatedAt: '1403/08/29' },
      { id: 'mm-5', machineCode: 'EQ-BD-401', machineName: 'بولدوزر کوماتسو D155A', machineType: 'بولدوزر', unitName: 'تراش و باطله‌برداری', status: 'سرویس دوره‌ای', issueDescription: 'تعویض روغن ۵۰۰ ساعته و آچارکشی زیربندی', stoppedSince: '1403/08/26', estimatedReadyDate: '1403/08/27', operatorName: 'سرویسکار سیار', notes: 'تحویل در شیفت صبح', updatedAt: '1403/08/29' },
    ],
    unitReports: [
      {
        id: 'ur-140308-1',
        period: '1403-08',
        unitName: 'واحد فرآوری و سنگ‌شکن',
        reportCategory: 'تولید و فرآوری',
        metricName: 'خوراک ورودی به سنگ‌شکن اولیه',
        actualValue: 45100,
        previousValue: 39500,
        targetValue: 44000,
        unitLabel: 'تن',
        status: 'تایید شده',
        submittedBy: 'سرپرست سنگ‌شکن',
        notes: 'افزایش راندمان خط خردایش شماره ۱ و ۲',
        rawFields: { 'شیفت فعال': '۳ شیفت', 'ساعات کارکرد مفید': 612, 'ضریب دسترسی': '۹۴٪' },
        updatedAt: '1403/08/29',
      },
      {
        id: 'ur-140308-2',
        period: '1403-08',
        unitName: 'واحد حفاری و آتشباری',
        reportCategory: 'عملیات استخراج',
        metricName: 'متراژ حفاری چال‌های انفجاری',
        actualValue: 12850,
        previousValue: 11400,
        targetValue: 12500,
        unitLabel: 'متر',
        status: 'تایید شده',
        submittedBy: 'واحد آتشباری معدن',
        notes: 'تکمیل الگوی حفاری پله ۴ و ۵ شمالی',
        rawFields: { 'تعداد چال': 1420, 'مصرف ماده منفجره (کیلوگرم)': 18400 },
        updatedAt: '1403/08/29',
      },
      {
        id: 'ur-140308-3',
        period: '1403-08',
        unitName: 'واحد ایمنی، بهداشت و محیط زیست (HSE)',
        reportCategory: 'ایمنی و بازرسی',
        metricName: 'نرخ انطباق ایمنی شیفت‌های معدن',
        actualValue: 98.5,
        previousValue: 96.2,
        targetValue: 98,
        unitLabel: 'درصد',
        status: 'تایید شده',
        submittedBy: 'مسئول HSE',
        notes: 'صفر بودن حوادث منجر به فوت یا توقف کار',
        rawFields: { 'تعداد بازرسی': 64, 'مانور ایمنی برگزارشده': 3 },
        updatedAt: '1403/08/29',
      },
      {
        id: 'ur-140308-4',
        period: '1403-08',
        unitName: 'واحد انبار، تدارکات و بازرگانی',
        reportCategory: 'پشتیبانی و تامین',
        metricName: 'نرخ تامین به‌موقع قطعات مصرفی',
        actualValue: 92,
        previousValue: 87,
        targetValue: 95,
        unitLabel: 'درصد',
        status: 'در انتظار بررسی',
        submittedBy: 'واحد انبار مرکزی',
        notes: 'سفارش‌گذاری فوری پمپ گیربکس لودر 966H',
        rawFields: { 'تعداد حواله صادره': 318, 'اقلام بحرانی در مسیر': 4 },
        updatedAt: '1403/08/29',
      },
    ],
  };
}

// Create rolling snapshot backup before destructive/major writes (never deletes primary data)
function createSafetySnapshot(reason: string) {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapPath = path.join(BACKUP_DIR, `snapshot_${reason}_${timestamp}.json`);
    fs.copyFileSync(DB_FILE, snapPath);
    // Keep only latest 10 snapshots to save disk space
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('snapshot_') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const oldFile of files.slice(10)) {
      fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
    }
  } catch (err) {
    console.error('Snapshot backup warning:', err);
  }
}

// Load database non-destructively from disk
function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.jobClassifications)) {
      parsed.jobClassifications = [];
    }
    if (!Array.isArray(parsed.commitments)) {
      parsed.commitments = [];
    }
    if (!Array.isArray(parsed.jobGroups)) {
      parsed.jobGroups = [];
    }
    if (!Array.isArray(parsed.personnel)) {
      parsed.personnel = [];
    }
    if (!Array.isArray(parsed.karaneh)) {
      parsed.karaneh = [];
    }
    if (!Array.isArray(parsed.users)) {
      parsed.users = [];
    }
    if (!Array.isArray(parsed.payroll)) {
      parsed.payroll = [];
    }
    if (!Array.isArray(parsed.miningVolumes)) {
      parsed.miningVolumes = [];
    }
    if (!Array.isArray(parsed.miningMachinery)) {
      parsed.miningMachinery = [];
    }
    if (!Array.isArray(parsed.unitReports)) {
      parsed.unitReports = [];
    }
    return parsed;
  } catch (err) {
    console.error('Error reading local database file:', err);
    return getInitialDatabase();
  }
}

// Atomic save to disk (writes temp file first, then renames atomically)
function saveDatabase(data: any): boolean {
  try {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
    return true;
  } catch (err) {
    console.error('Error saving database to disk:', err);
    return false;
  }
}

let postgresHydrated = false;
let postgresHydrationPromise: Promise<void> | null = null;
let postgresSyncChain: Promise<void> = Promise.resolve();

// Lazy request-time PostgreSQL hydration (never executes at startup)
async function ensurePostgresHydrated(): Promise<void> {
  if (postgresHydrated || !isPostgresConfigured()) return;
  if (!postgresHydrationPromise) {
    postgresHydrationPromise = (async () => {
      try {
        const pgSnap = await loadSnapshotFromPostgres();
        const localDb = loadDatabase();
        if (pgSnap && (pgSnap.users.length > 0 || pgSnap.personnel.length > 0)) {
          const localUserPassById = new Map<string, string>();
          for (const lu of localDb.users || []) {
            if (lu?.id && lu?.password) localUserPassById.set(String(lu.id), String(lu.password));
          }
          const mergedUsers = (pgSnap.users.length > 0 ? pgSnap.users : localDb.users).map((u: any) => ({
            ...u,
            password: u.password || localUserPassById.get(String(u.id)) || '',
          }));
          saveDatabase({
            ...localDb,
            users: mergedUsers,
            jobGroups: pgSnap.jobGroups.length > 0 ? pgSnap.jobGroups : localDb.jobGroups,
            personnel: pgSnap.personnel.length > 0 ? pgSnap.personnel : localDb.personnel,
            jobClassifications: pgSnap.jobClassifications,
            karaneh: pgSnap.karaneh,
            commitments: pgSnap.commitments,
            payroll: pgSnap.payroll,
            miningVolumes: (pgSnap.miningVolumes && pgSnap.miningVolumes.length > 0) ? pgSnap.miningVolumes : (localDb.miningVolumes || []),
            miningMachinery: (pgSnap.miningMachinery && pgSnap.miningMachinery.length > 0) ? pgSnap.miningMachinery : (localDb.miningMachinery || []),
            unitReports: (pgSnap.unitReports && pgSnap.unitReports.length > 0) ? pgSnap.unitReports : (localDb.unitReports || []),
          });
        } else {
          // Non-destructive initial migration from existing local JSON baseline into PostgreSQL
          await syncSnapshotToPostgres(localDb);
        }
        postgresHydrated = true;
      } catch (err) {
        console.error('Lazy PostgreSQL hydration failed:', err);
        postgresHydrationPromise = null;
      }
    })();
  }
  await postgresHydrationPromise;
}

// Persist atomically to disk and serialize PostgreSQL synchronization
async function persistDatabase(data: any): Promise<boolean> {
  const savedDisk = saveDatabase(data);
  if (isPostgresConfigured()) {
    const run = postgresSyncChain.then(() => syncSnapshotToPostgres(data));
    postgresSyncChain = run.catch(() => undefined);
    await run;
  }
  return savedDisk;
}

// Ensure database exists & auto-hash any legacy plaintext passwords non-destructively
function initializeDatabaseSecurity() {
  const db = loadDatabase();
  let changed = false;
  for (const u of db.users) {
    if (u.password && !String(u.password).startsWith('scrypt$')) {
      u.password = hashPassword(String(u.password));
      changed = true;
    }
  }
  if (changed) {
    createSafetySnapshot('pre_hash_migration');
    saveDatabase(db);
  }
}
initializeDatabaseSecurity();

// ================= AUTH & RBAC MIDDLEWARE =================

interface AuthenticatedRequest extends Request {
  authUser?: any;
}

function isSuperAdminUser(user: any): boolean {
  return Boolean(user && (user.role === 'super_admin' || user.username === 'javadabadiyan'));
}

function getEmptyPermissionsServer() {
  return {
    personnel: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, viewSalary: false, documents: false },
    karaneh: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    jobGroups: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
    payroll: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    system: { dashboardStats: false, backupDatabase: false, restoreDatabase: false },
    smartDashboard: { view: false, exportExcel: false, print: false },
    ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
    unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] as string[] },
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

function getFullAdminPermissionsServer() {
  return {
    personnel: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
    karaneh: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    jobGroups: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    commitments: { view: true, create: true, edit: true, delete: true, deleteAll: true, print: true, archive: true, importExcel: true, exportExcel: true },
    payroll: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    users: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
    system: { dashboardStats: true, backupDatabase: true, restoreDatabase: true },
    smartDashboard: { view: true, exportExcel: true, print: true },
    ceoDashboard: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, print: true },
    unitOperations: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, allowedUnits: [] as string[] },
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

function syncLegacyPermissionsServer(perms: any) {
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
      perms.jobGroups.exportExcel ||
      perms.commitments.exportExcel ||
      perms.payroll.exportExcel ||
      perms.users.exportExcel ||
      perms.smartDashboard.exportExcel ||
      perms.ceoDashboard.exportExcel ||
      perms.unitOperations.exportExcel
    ),
    canImportExcel: Boolean(
      perms.personnel.importExcel ||
      perms.karaneh.importExcel ||
      perms.jobGroups.importExcel ||
      perms.commitments.importExcel ||
      perms.payroll.importExcel ||
      perms.users.importExcel ||
      perms.ceoDashboard.importExcel ||
      perms.unitOperations.importExcel
    ),
    canBackupRestore: Boolean(perms.system.backupDatabase || perms.system.restoreDatabase),
  };
}

function normalizePermissionsServer(raw: any) {
  if (!raw || typeof raw !== 'object') return getEmptyPermissionsServer();

  const hasModernSchema = Boolean(
    (raw.personnel && typeof raw.personnel === 'object') ||
    (raw.karaneh && typeof raw.karaneh === 'object') ||
    (raw.jobGroups && typeof raw.jobGroups === 'object') ||
    (raw.commitments && typeof raw.commitments === 'object') ||
    (raw.payroll && typeof raw.payroll === 'object') ||
    (raw.users && typeof raw.users === 'object') ||
    (raw.system && typeof raw.system === 'object') ||
    (raw.smartDashboard && typeof raw.smartDashboard === 'object') ||
    (raw.ceoDashboard && typeof raw.ceoDashboard === 'object') ||
    (raw.unitOperations && typeof raw.unitOperations === 'object')
  );

  if (!hasModernSchema) {
    const lp = raw.canManagePersonnel === true;
    const lk = raw.canManageKaraneh === true;
    const lj = raw.canManageJobGroups === true;
    const lc = raw.canManageCommitments === true;
    const lu = raw.canManageUsers === true;
    const le = raw.canExportExcel === true;
    const li = raw.canImportExcel === true;
    const lb = raw.canBackupRestore === true;

    return syncLegacyPermissionsServer({
      personnel: { view: lp, create: lp, edit: lp, delete: lp && lu, deleteAll: false, importExcel: lp && li, exportExcel: lp && le, viewSalary: lp, documents: lp },
      karaneh: { view: lk, create: lk, edit: lk, delete: lk && lu, deleteAll: false, importExcel: lk && li, exportExcel: lk && le },
      jobGroups: { view: lj, create: lj, edit: lj, delete: lj && lu, deleteAll: false, importExcel: lj && li, exportExcel: lj && le },
      commitments: { view: lc, create: lc, edit: lc, delete: lc && lu, deleteAll: false, print: lc, archive: lc, importExcel: lc && li, exportExcel: lc && le },
      payroll: { view: lk || lp, create: lk || lp, edit: lk || lp, delete: (lk || lp) && lu, deleteAll: false, importExcel: (lk || lp) && li, exportExcel: (lk || lp) && le },
      users: { view: lu, create: lu, edit: lu, delete: lu, deleteAll: false, importExcel: lu && li, exportExcel: lu && le },
      system: { dashboardStats: lp || lk || lj || lc || lu, backupDatabase: lb, restoreDatabase: lb },
      smartDashboard: { view: false, exportExcel: false, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      unitOperations: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, allowedUnits: [] },
    });
  }

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
  const b = (v: any) => v === true;

  return syncLegacyPermissionsServer({
    personnel: { view: b(p.view), create: b(p.create), edit: b(p.edit), delete: b(p.delete), deleteAll: b(p.deleteAll), importExcel: b(p.importExcel), exportExcel: b(p.exportExcel), viewSalary: b(p.viewSalary), documents: b(p.documents) },
    karaneh: { view: b(k.view), create: b(k.create), edit: b(k.edit), delete: b(k.delete), deleteAll: b(k.deleteAll), importExcel: b(k.importExcel), exportExcel: b(k.exportExcel) },
    jobGroups: { view: b(jg.view), create: b(jg.create), edit: b(jg.edit), delete: b(jg.delete), deleteAll: b(jg.deleteAll), importExcel: b(jg.importExcel), exportExcel: b(jg.exportExcel) },
    commitments: { view: b(c.view), create: b(c.create), edit: b(c.edit), delete: b(c.delete), deleteAll: b(c.deleteAll), print: b(c.print), archive: b(c.archive), importExcel: b(c.importExcel), exportExcel: b(c.exportExcel) },
    payroll: { view: b(pr.view), create: b(pr.create), edit: b(pr.edit), delete: b(pr.delete), deleteAll: b(pr.deleteAll), importExcel: b(pr.importExcel), exportExcel: b(pr.exportExcel) },
    users: { view: b(u.view), create: b(u.create), edit: b(u.edit), delete: b(u.delete), deleteAll: b(u.deleteAll), importExcel: b(u.importExcel), exportExcel: b(u.exportExcel) },
    system: { dashboardStats: b(s.dashboardStats), backupDatabase: b(s.backupDatabase), restoreDatabase: b(s.restoreDatabase) },
    smartDashboard: { view: b(sd.view), exportExcel: b(sd.exportExcel), print: b(sd.print) },
    ceoDashboard: { view: b(cd.view), create: b(cd.create), edit: b(cd.edit), delete: b(cd.delete), deleteAll: b(cd.deleteAll), importExcel: b(cd.importExcel), exportExcel: b(cd.exportExcel), print: b(cd.print) },
    unitOperations: { view: b(uo.view), create: b(uo.create), edit: b(uo.edit), delete: b(uo.delete), deleteAll: b(uo.deleteAll), importExcel: b(uo.importExcel), exportExcel: b(uo.exportExcel), allowedUnits: Array.isArray(uo.allowedUnits) ? uo.allowedUnits.map(String) : [] },
  });
}

function sanitizeUserServer(user: any) {
  if (!user || typeof user !== 'object') return user;
  const { password: _, ...rest } = user;
  return {
    ...rest,
    permissions: isSuperAdminUser(user)
      ? getFullAdminPermissionsServer()
      : normalizePermissionsServer(user.permissions),
  };
}

function checkPermission(user: any, section: string, action: string): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdminUser(user)) return true;
  const perms: any = normalizePermissionsServer(user.permissions);
  return Boolean(perms?.[section]?.[action] === true);
}

function getAllowedUnitsForUser(user: any): string[] {
  const raw = user?.permissions?.unitOperations?.allowedUnits;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x || '').trim()).filter(Boolean);
}

function isUnitAllowedForUser(user: any, unitName?: string): boolean {
  if (!user || !user.isActive) return false;
  if (isSuperAdminUser(user) || checkPermission(user, 'ceoDashboard', 'view')) return true;
  if (!checkPermission(user, 'unitOperations', 'view')) return false;
  const allowed = getAllowedUnitsForUser(user);
  if (allowed.length === 0) return true;
  if (!unitName) return false;
  const norm = normPayrollKey(unitName);
  return allowed.some((a) => {
    const na = normPayrollKey(a);
    return na === norm || norm.includes(na) || na.includes(norm);
  });
}

function isWorkshopOrUnitAllowed(user: any, unitName?: string): boolean {
  return (
    isUnitAllowedForUser(user, unitName) ||
    isUnitAllowedForUser(user, 'واحد تعمیرگاه و ماشین‌آلات سنگین') ||
    isUnitAllowedForUser(user, 'تعمیرگاه')
  );
}

function isDispatchingOrUnitAllowed(user: any, unitName?: string): boolean {
  return (
    isUnitAllowedForUser(user, unitName) ||
    isUnitAllowedForUser(user, 'واحد دیسپچینگ و کنترل تولید') ||
    isUnitAllowedForUser(user, 'دیسپچینگ')
  );
}

function hasMiningOrUnitPerm(user: any, action: string): boolean {
  return checkPermission(user, 'ceoDashboard', action) || checkPermission(user, 'unitOperations', action);
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, message: 'احراز هویت انجام نشده است. لطفاً مجدداً وارد شوید.' });
  }

  const db = loadDatabase();
  const verified = verifyAuthToken(token);
  if (verified) {
    const user = db.users.find((u: any) => u.id === verified.uid);
    if (!user || !user.isActive) {
      return res.status(403).json({ success: false, message: 'حساب کاربری یافت نشد یا غیرفعال شده است.' });
    }
    req.authUser = user;
    return next();
  }

  // Fallback verification via Firebase Admin SDK Bearer ID token
  try {
    const decoded = await verifyFirebaseBearerToken(token);
    const fbEmail = String(decoded.email || '').trim().toLowerCase();
    const user = db.users.find(
      (u: any) =>
        (u.uid && u.uid === decoded.uid) ||
        (fbEmail && u.email && String(u.email).trim().toLowerCase() === fbEmail) ||
        (fbEmail === 'javadabadiyangoshi@gmail.com' && (u.username === 'javadabadiyan' || u.role === 'super_admin'))
    );
    if (!user || !user.isActive) {
      return res.status(403).json({ success: false, message: 'حساب کاربری مجاز برای این توکن یافت نشد یا غیرفعال است.' });
    }
    req.authUser = user;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'نشست کاربری منقضی یا نامعتبر است. لطفاً مجدداً وارد شوید.' });
  }
}

function requirePerm(section: string, action: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!checkPermission(req.authUser, section, action)) {
      return res.status(403).json({ success: false, message: 'شما مجوز لازم برای انجام این عملیات را ندارید.' });
    }
    next();
  };
}

// Lazy PostgreSQL hydration triggered strictly on incoming API requests
app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
  await ensurePostgresHydrated();
  next();
});

// ================= API ROUTES =================

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ success: true, engine: 'node' });
});

// 1. Auth: Login & Session Verify
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'لطفاً نام کاربری و رمز عبور را وارد کنید.' });
  }
  const db = loadDatabase();
  const user = db.users.find((u: any) => u.username === String(username).trim());

  if (!user) {
    return res.status(401).json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' });
  }

  const check = verifyPassword(String(password), String(user.password || ''));
  if (!check.valid) {
    return res.status(401).json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر ارشد تماس بگیرید.' });
  }

  try {
    if (check.needsMigration) {
      user.password = hashPassword(String(password));
    }
    user.lastLogin = new Date().toLocaleString('fa-IR');
    await persistDatabase(db);

    return res.json({
      success: true,
      data: {
        user: sanitizeUserServer(user),
        token: createAuthToken(user)
      }
    });
  } catch (error) {
    console.error('Login persistence error:', error);
    return res.status(500).json({ success: false, message: 'خطا در برقراری ارتباط با پایگاه داده.' });
  }
});

app.post('/api/auth/firebase-login', async (req: Request, res: Response) => {
  const { idToken } = req.body || {};
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ success: false, message: 'توکن احراز هویت گوگل ارسال نشده است.' });
  }

  if (!firebaseConfig?.projectId) {
    return res.status(503).json({ success: false, message: 'پیکربندی فایربیس روی سرور یافت نشد.' });
  }

  try {
    const decoded = await verifyFirebaseBearerToken(idToken);
    if (!decoded?.email || !decoded?.email_verified) {
      return res.status(401).json({ success: false, message: 'حساب گوگل باید دارای ایمیل تأییدشده باشد.' });
    }

    const email = String(decoded.email).trim().toLowerCase();
    const db = loadDatabase();
    let user =
      email === 'javadabadiyangoshi@gmail.com'
        ? db.users.find((u: any) => u.username === 'javadabadiyan' || u.role === 'super_admin')
        : db.users.find(
            (u: any) =>
              (u.uid && u.uid === decoded.uid) ||
              (u.email && String(u.email).trim().toLowerCase() === email) ||
              String(u.username || '').trim().toLowerCase() === email.split('@')[0]
          );

    if (!user) {
      return res.status(403).json({
        success: false,
        message: `ایمیل ${email} در لیست کاربران مجاز سامانه ثبت نشده است. لطفاً ابتدا از پنل مدیریت کاربران، ایمیل را ثبت کنید یا با نام کاربری وارد شوید.`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'حساب کاربری شما غیرفعال شده است.' });
    }

    user.uid = decoded.uid;
    user.email = email;
    user.lastLogin = new Date().toLocaleString('fa-IR');
    await persistDatabase(db);
    await linkUserFirebaseUid(user.id, decoded.uid, email).catch(() =>
      getOrCreateUserByUid(decoded.uid, email, {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions || {},
      })
    );

    return res.json({
      success: true,
      data: {
        user: sanitizeUserServer(user),
        token: createAuthToken(user),
      },
    });
  } catch (err) {
    console.error('Firebase login verification error:', err);
    return res.status(401).json({ success: false, message: 'اعتبارسنجی توکن گوگل توسط فایربیس ناموفق بود.' });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: sanitizeUserServer(req.authUser) });
});

// 2. Users Management
app.get('/api/users', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'users', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  const safeUsers = db.users.map(sanitizeUserServer);
  res.json({ success: true, data: safeUsers });
});

app.post('/api/users', requireAuth, requirePerm('users', 'create'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { username, password, email, fullName, role, department, permissions } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ success: false, message: 'تکمیل نام کاربری، رمز عبور و نام الزامی است.' });
  }

  if (String(role || '').trim() === 'super_admin' && !isSuperAdminUser(req.authUser)) {
    return res.status(403).json({ success: false, message: 'فقط مدیر ارشد سامانه مجاز به ایجاد حساب با نقش super_admin است.' });
  }

  if (db.users.some((u: any) => u.username.toLowerCase() === String(username).trim().toLowerCase())) {
    return res.status(400).json({ success: false, message: 'این نام کاربری قبلاً در سامانه ثبت شده است.' });
  }

  const normalizedPermissions = role === 'super_admin'
    ? getFullAdminPermissionsServer()
    : permissions && typeof permissions === 'object'
    ? normalizePermissionsServer(permissions)
    : getEmptyPermissionsServer();

  const newUser = {
    id: `u-${Date.now()}`,
    username: String(username).trim(),
    password: hashPassword(String(password)),
    email: email ? String(email).trim().toLowerCase() : '',
    fullName,
    role: role || 'کاربر سفارشی',
    department: department || '',
    permissions: normalizedPermissions,
    isActive: true,
    createdAt: new Date().toLocaleDateString('fa-IR'),
  };

  db.users.push(newUser);
  try {
    await persistDatabase(db);
    return res.json({ success: true, data: sanitizeUserServer(newUser), message: 'کاربر جدید با موفقیت ذخیره شد.' });
  } catch (err) {
    console.error('Failed to persist new user:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی اطلاعات کاربر در پایگاه داده.' });
  }
});

app.put('/api/users/:id', requireAuth, requirePerm('users', 'edit'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const index = db.users.findIndex((u: any) => u.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
  }

  const existing = db.users[index];
  const { fullName, email, role, department, permissions, isActive, password } = req.body;

  if (!isSuperAdminUser(req.authUser) && (isSuperAdminUser(existing) || role === 'super_admin')) {
    return res.status(403).json({ success: false, message: 'تغییر مشخصات یا ارتقای سطح به مدیر ارشد فقط توسط مدیر ارشد مجاز است.' });
  }

  if (existing.username === 'javadabadiyan' && isActive === false) {
    return res.status(400).json({ success: false, message: 'حساب ادمین ارشد (javadabadiyan) قابل غیرفعال‌سازی نیست.' });
  }

  const nextRole = role ?? existing.role;
  const nextPermissions = nextRole === 'super_admin' || existing.username === 'javadabadiyan'
    ? getFullAdminPermissionsServer()
    : permissions !== undefined
    ? normalizePermissionsServer(permissions)
    : normalizePermissionsServer(existing.permissions);

  db.users[index] = {
    ...existing,
    fullName: fullName ?? existing.fullName,
    email: email !== undefined ? String(email).trim().toLowerCase() : existing.email,
    role: nextRole,
    department: department ?? existing.department,
    permissions: nextPermissions,
    isActive: isActive ?? existing.isActive,
    password: password ? hashPassword(String(password)) : existing.password,
  };

  try {
    await persistDatabase(db);
    return res.json({ success: true, data: sanitizeUserServer(db.users[index]), message: 'اطلاعات و دسترسی‌های کاربر با موفقیت به‌روزرسانی شد.' });
  } catch (err) {
    console.error('Failed to update user:', err);
    return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی اطلاعات کاربر در پایگاه داده.' });
  }
});

app.delete('/api/users/:id', requireAuth, requirePerm('users', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const user = db.users.find((u: any) => u.id === id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
  }

  if (user.username === 'javadabadiyan') {
    return res.status(400).json({ success: false, message: 'امکان حذف کاربر ارشد سامانه (javadabadiyan) وجود ندارد.' });
  }

  db.users = db.users.filter((u: any) => u.id !== id);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'کاربر با موفقیت حذف گردید.' });
  } catch (err) {
    console.error('Failed to delete user:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف کاربر از پایگاه داده.' });
  }
});

function buildPresetPermissionsServer(presetName: string) {
  const p = String(presetName || '').trim();
  if (p.includes('مدیر عامل') || p.includes('مدیرعامل')) {
    return {
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      jobGroups: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      commitments: { view: true, create: false, edit: false, delete: false, deleteAll: false, print: true, archive: false, importExcel: false, exportExcel: true },
      payroll: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: true, create: true, edit: true, delete: true, deleteAll: false, importExcel: true, exportExcel: true, print: true },
      canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false, canManageUsers: false, canExportExcel: true, canImportExcel: false, canBackupRestore: false,
    };
  }
  if (p.includes('مدیر')) {
    return {
      personnel: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
      jobGroups: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
      commitments: { view: true, create: true, edit: true, delete: true, deleteAll: true, print: true, archive: true, importExcel: true, exportExcel: true },
      payroll: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
      users: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true },
      system: { dashboardStats: true, backupDatabase: true, restoreDatabase: true },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: true, create: true, edit: true, delete: true, deleteAll: true, importExcel: true, exportExcel: true, print: true },
      canManagePersonnel: true, canManageKaraneh: true, canManageJobGroups: true, canManageCommitments: true, canManageUsers: true, canExportExcel: true, canImportExcel: true, canBackupRestore: true,
    };
  }
  if (p.includes('کارگزینی')) {
    return {
      personnel: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true, viewSalary: true, documents: true },
      karaneh: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      jobGroups: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      commitments: { view: true, create: true, edit: true, delete: false, deleteAll: false, print: true, archive: true, importExcel: true, exportExcel: true },
      payroll: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: true },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      canManagePersonnel: true, canManageKaraneh: false, canManageJobGroups: true, canManageCommitments: true, canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    };
  }
  if (p.includes('کارانه') || p.includes('حقوق')) {
    return {
      personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: true, documents: false },
      karaneh: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      jobGroups: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
      commitments: { view: false, create: false, edit: false, delete: false, deleteAll: false, print: false, archive: false, importExcel: false, exportExcel: false },
      payroll: { view: true, create: true, edit: true, delete: false, deleteAll: false, importExcel: true, exportExcel: true },
      users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
      system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
      smartDashboard: { view: true, exportExcel: true, print: false },
      ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
      canManagePersonnel: false, canManageKaraneh: true, canManageJobGroups: false, canManageCommitments: false, canManageUsers: false, canExportExcel: true, canImportExcel: true, canBackupRestore: false,
    };
  }
  return {
    personnel: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true, viewSalary: false, documents: false },
    karaneh: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
    jobGroups: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
    commitments: { view: true, create: false, edit: false, delete: false, deleteAll: false, print: true, archive: false, importExcel: false, exportExcel: true },
    payroll: { view: true, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: true },
    users: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false },
    system: { dashboardStats: true, backupDatabase: false, restoreDatabase: false },
    smartDashboard: { view: true, exportExcel: true, print: true },
    ceoDashboard: { view: false, create: false, edit: false, delete: false, deleteAll: false, importExcel: false, exportExcel: false, print: false },
    canManagePersonnel: false, canManageKaraneh: false, canManageJobGroups: false, canManageCommitments: false, canManageUsers: false, canExportExcel: true, canImportExcel: false, canBackupRestore: false,
  };
}

app.post('/api/users/batch-import', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'users', 'importExcel') && !checkPermission(req.authUser, 'users', 'create')) {
    return res.status(403).json({ success: false, message: 'شما مجوز بارگذاری اکسل کاربران را ندارید.' });
  }
  const db = loadDatabase();
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'فایل اکسل کاربران خالی است.' });
  }

  let added = 0;
  let updated = 0;
  for (const row of items) {
    const username = String(row.username || row['نام کاربری'] || '').trim();
    const fullName = String(row.fullName || row['نام و نام خانوادگی'] || '').trim();
    if (!username || !fullName) continue;
    if (username.toLowerCase() === 'javadabadiyan') continue; // never overwrite super admin via Excel

    const role = String(row.role || row['نقش سازمانی'] || 'کارشناس اداری').trim();
    if (role === 'super_admin' && !isSuperAdminUser(req.authUser)) continue;
    const department = String(row.department || row['واحد اداری'] || '').trim();
    const rawActive = String(row.isActive ?? row['وضعیت حساب'] ?? 'فعال').trim();
    const isActive = rawActive !== 'غیرفعال' && rawActive !== 'مسدود' && rawActive !== 'false' && rawActive !== '0';
    const presetLabel = String(row.preset || row['الگوی دسترسی'] || 'دسترسی صفر').trim();
    const rawPass = String(row.password || row['رمز عبور'] || '').trim();

    const idx = db.users.findIndex((u: any) => u.username.toLowerCase() === username.toLowerCase());
    if (idx >= 0) {
      const existing = db.users[idx];
      if (isSuperAdminUser(existing) && !isSuperAdminUser(req.authUser)) continue;
      db.users[idx] = {
        ...existing,
        fullName,
        role,
        department,
        isActive,
        permissions: row['الگوی دسترسی'] ? normalizePermissionsServer(buildPresetPermissionsServer(presetLabel)) : normalizePermissionsServer(existing.permissions),
        password: rawPass ? hashPassword(rawPass) : existing.password,
      };
      updated++;
    } else {
      const initialPass = rawPass || '12345678';
      db.users.push({
        id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        username,
        password: hashPassword(initialPass),
        fullName,
        role,
        department,
        isActive,
        permissions: row['الگوی دسترسی'] || row.preset ? normalizePermissionsServer(buildPresetPermissionsServer(presetLabel)) : getEmptyPermissionsServer(),
        createdAt: new Date().toLocaleDateString('fa-IR'),
      });
      added++;
    }
  }

  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      message: `بارگذاری کاربران از اکسل با موفقیت انجام شد (${added} کاربر جدید، ${updated} کاربر به‌روزرسانی شد).`
    });
  } catch (err) {
    console.error('Failed to batch import users:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی کاربران در پایگاه داده.' });
  }
});

app.post('/api/users/batch-delete', requireAuth, requirePerm('users', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.users || []).length;
  db.users = (db.users || []).filter((u: any) => {
    if (!idSet.has(u.id)) return true;
    if (u.username === 'javadabadiyan' || u.id === req.authUser?.id) return true;
    return false;
  });
  const deletedCount = before - db.users.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} کاربر با موفقیت حذف گردید.` });
  } catch (err) {
    console.error('Failed to batch delete users:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی کاربران از پایگاه داده.' });
  }
});

app.post('/api/users/delete-all', requireAuth, requirePerm('users', 'deleteAll'), async (req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_users');
  const db = loadDatabase();
  const before = (db.users || []).length;
  db.users = (db.users || []).filter(
    (u: any) => u.username === 'javadabadiyan' || u.id === req.authUser?.id
  );
  const deletedCount = before - db.users.length;
  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      deletedCount,
      message: `${deletedCount} حساب کاربری حذف شدند (حساب مدیر ارشد و کاربر جاری حفظ گردید).`,
    });
  } catch (err) {
    console.error('Failed to delete all users:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول کاربران.' });
  }
});

// 3. Personnel Management
app.get('/api/personnel', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'personnel', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  const canViewSalary = checkPermission(req.authUser, 'personnel', 'viewSalary');
  const canViewDocs = checkPermission(req.authUser, 'personnel', 'documents');
  const list = (db.personnel || []).map((p: any) => ({
    ...p,
    baseSalary: canViewSalary ? p.baseSalary : 0,
    documents: canViewDocs ? p.documents : undefined,
  }));
  res.json({ success: true, data: list });
});

app.post('/api/personnel', requireAuth, requirePerm('personnel', 'create'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const pData = req.body;

  if (!pData.personnelCode || !pData.firstName || !pData.lastName) {
    return res.status(400).json({ success: false, message: 'کد پرسنلی، نام و نام خانوادگی الزامی هستند.' });
  }

  if (db.personnel.some((p: any) => p.personnelCode === pData.personnelCode)) {
    return res.status(400).json({ success: false, message: `کد پرسنلی ${pData.personnelCode} قبلاً برای پرسنل دیگری ثبت شده است.` });
  }

  const newPersonnel = {
    id: `p-${Date.now()}`,
    ...pData,
    fullName: `${pData.firstName} ${pData.lastName}`.trim() || String(pData.fullName || ''),
    relatives: Array.isArray(pData.relatives) ? pData.relatives : [],
    createdAt: pData.createdAt || new Date().toLocaleDateString('fa-IR'),
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };

  db.personnel.push(newPersonnel);
  try {
    await persistDatabase(db);
    return res.json({ success: true, data: newPersonnel, message: 'پرسنل جدید با موفقیت در پرونده‌های سازمانی ثبت گردید.' });
  } catch (err) {
    console.error('Failed to create personnel:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی پرونده پرسنلی در پایگاه داده.' });
  }
});

app.put('/api/personnel/:id', requireAuth, requirePerm('personnel', 'edit'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const index = db.personnel.findIndex((p: any) => p.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'پرسنل یافت نشد.' });
  }

  const pData = req.body;
  if (pData.personnelCode && pData.personnelCode !== db.personnel[index].personnelCode) {
    if (db.personnel.some((p: any) => p.id !== id && p.personnelCode === pData.personnelCode)) {
      return res.status(400).json({ success: false, message: `کد پرسنلی ${pData.personnelCode} متعلق به شخص دیگری است.` });
    }
  }

  const prev = db.personnel[index];
  db.personnel[index] = {
    ...prev,
    ...pData,
    fullName: (pData.firstName && pData.lastName) ? `${pData.firstName} ${pData.lastName}`.trim() : (pData.fullName || prev.fullName),
    relatives: pData.relatives !== undefined ? (Array.isArray(pData.relatives) ? pData.relatives : []) : (prev.relatives || []),
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };

  try {
    await persistDatabase(db);
    return res.json({ success: true, data: db.personnel[index], message: 'اطلاعات پرسنلی با موفقیت ویرایش شد.' });
  } catch (err) {
    console.error('Failed to update personnel:', err);
    return res.status(500).json({ success: false, message: 'خطا در ویرایش پرونده پرسنلی در پایگاه داده.' });
  }
});

app.delete('/api/personnel/:id', requireAuth, requirePerm('personnel', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const p = db.personnel.find((item: any) => item.id === id);

  if (!p) {
    return res.status(404).json({ success: false, message: 'پرسنل یافت نشد.' });
  }

  db.personnel = db.personnel.filter((item: any) => item.id !== id);
  db.commitments = db.commitments.filter((c: any) => c.personnelId !== id && c.personnelCode !== p.personnelCode);

  try {
    await persistDatabase(db);
    return res.json({ success: true, message: `پرسنل ${p.fullName} با موفقیت از سیستم حذف شد.` });
  } catch (err) {
    console.error('Failed to delete personnel:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف پرونده پرسنلی از پایگاه داده.' });
  }
});

app.post('/api/personnel/batch-import', requireAuth, requirePerm('personnel', 'importExcel'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'هیچ رکوردی برای بارگذاری ارسال نشده است.' });
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const row of items) {
    const code = String(getPayrollVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim();
    if (!code) continue;

    const existingIndex = db.personnel.findIndex((p: any) => String(p.personnelCode).trim() === code);
    const firstName = String(getPayrollVal(row, 'firstName', 'نام') || '').trim();
    const lastName = String(getPayrollVal(row, 'lastName', 'نام خانوادگي', 'نام خانوادگی') || '').trim();
    const fullNameRaw = String(getPayrollVal(row, 'fullName', 'نام و نام خانوادگي', 'نام و نام خانوادگی') || '').trim();
    const fullName = `${firstName} ${lastName}`.trim() || fullNameRaw || 'پرسنل';
    const existing = existingIndex >= 0 ? db.personnel[existingIndex] : undefined;

    const itemData: Record<string, any> = {
      employeeId: String(getPayrollVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') ?? existing?.employeeId ?? ''),
      personnelCode: code,
      firstName: firstName || fullName.split(' ')[0] || '',
      lastName: lastName || fullName.split(' ').slice(1).join(' ') || '',
      fullName,
      fatherName: String(getPayrollVal(row, 'fatherName', 'نام پدر') ?? existing?.fatherName ?? ''),
      shenasnamehNumber: String(getPayrollVal(row, 'shenasnamehNumber', 'شماره شناسنامه') ?? existing?.shenasnamehNumber ?? ''),
      nationalId: String(getPayrollVal(row, 'nationalId', 'كد ملي', 'کد ملی') ?? existing?.nationalId ?? ''),
      nationality: String(getPayrollVal(row, 'nationality', 'مليت', 'ملیت') ?? existing?.nationality ?? 'ایرانی'),
      citizenship: String(getPayrollVal(row, 'citizenship', 'تابعيت', 'تابعیت') ?? existing?.citizenship ?? 'جمهوری اسلامی ایران'),
      gender: String(getPayrollVal(row, 'gender', 'جنسيت', 'جنسیت') ?? existing?.gender ?? ''),
      phone: String(getPayrollVal(row, 'phone', 'تلفن همراه', 'شماره تماس', 'تلفن') ?? existing?.phone ?? ''),
      email: String(getPayrollVal(row, 'email', 'پست الكترونيك', 'پست الکترونیک', 'ایمیل') ?? existing?.email ?? ''),
      birthPlace: String(getPayrollVal(row, 'birthPlace', 'محل تولد') ?? existing?.birthPlace ?? ''),
      issuePlace: String(getPayrollVal(row, 'issuePlace', 'محل صدور') ?? existing?.issuePlace ?? ''),
      birthDate: String(getPayrollVal(row, 'birthDate', 'تاريخ تولد', 'تاریخ تولد') ?? existing?.birthDate ?? ''),
      issueDate: String(getPayrollVal(row, 'issueDate', 'تاريخ صدور', 'تاریخ صدور') ?? existing?.issueDate ?? ''),
      maritalStatus: String(getPayrollVal(row, 'maritalStatus', 'وضعيت تاهل', 'وضعیت تاهل', 'وضعیت تأهل') ?? existing?.maritalStatus ?? ''),
      militaryStatus: String(getPayrollVal(row, 'militaryStatus', 'وضعيت نظام وظيفه', 'وضعیت نظام وظیفه') ?? existing?.militaryStatus ?? ''),
      education: String(getPayrollVal(row, 'education', 'مدرك تحصيلي', 'مدرک تحصیلی', 'تحصیلات') ?? existing?.education ?? ''),
      fieldOfStudy: String(getPayrollVal(row, 'fieldOfStudy', 'رشته تحصيلي', 'رشته تحصیلی') ?? existing?.fieldOfStudy ?? ''),
      hireDate: String(getPayrollVal(row, 'hireDate', 'تاريخ استخدام', 'تاریخ استخدام') ?? existing?.hireDate ?? '1403/01/01'),
      workLocation: String(getPayrollVal(row, 'workLocation', 'محل خدمت') ?? existing?.workLocation ?? ''),
      department: String(getPayrollVal(row, 'department', 'واحد سازماني', 'واحد سازمانی', 'واحد') ?? existing?.department ?? 'عمومی'),
      jobTitle: String(getPayrollVal(row, 'jobTitle', 'شغل') ?? existing?.jobTitle ?? ''),
      jobCode: String(getPayrollVal(row, 'jobCode', 'كد شغل', 'کد شغل') ?? existing?.jobCode ?? ''),
      position: String(getPayrollVal(row, 'position', 'پست', 'پست و سمت', 'پست سازمانی') ?? existing?.position ?? 'کارشناس'),
      positionCode: String(getPayrollVal(row, 'positionCode', 'كد پست', 'کد پست') ?? existing?.positionCode ?? ''),
      employmentType: String(getPayrollVal(row, 'employmentType', 'نوع استخدام') ?? existing?.employmentType ?? 'قراردادی'),
      jobGroupId: String(getPayrollVal(row, 'jobGroupId') ?? existing?.jobGroupId ?? ''),
      status: String(getPayrollVal(row, 'status', 'وضعیت') ?? existing?.status ?? 'فعال'),
      baseSalary: Number(getPayrollVal(row, 'baseSalary', 'حقوق پایه', 'حقوق پایه (ریال)') ?? existing?.baseSalary ?? 0),
      notes: String(getPayrollVal(row, 'notes', 'یادداشت', 'توضیحات') ?? existing?.notes ?? ''),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };

    if (existingIndex >= 0) {
      db.personnel[existingIndex] = {
        ...db.personnel[existingIndex],
        ...itemData,
      };
      updatedCount++;
    } else {
      db.personnel.push({
        id: `p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...itemData,
        relatives: [],
        createdAt: new Date().toLocaleDateString('fa-IR'),
      });
      addedCount++;
    }
  }

  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      message: `ورود اطلاعات با موفقیت انجام شد: ${addedCount} نفر جدید اضافه شدند و ${updatedCount} پرونده به‌روزرسانی گردید.`
    });
  } catch (err) {
    console.error('Failed to batch import personnel:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی گروهی پرسنل در پایگاه داده.' });
  }
});

app.post('/api/personnel/batch-delete', requireAuth, requirePerm('personnel', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.personnel || []).length;
  db.personnel = (db.personnel || []).filter((p: any) => !idSet.has(p.id));
  const deletedCount = before - db.personnel.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} پرونده پرسنلی با موفقیت حذف شد.` });
  } catch (err) {
    console.error('Failed to batch delete personnel:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی پرسنل از پایگاه داده.' });
  }
});

app.post('/api/personnel/delete-all', requireAuth, requirePerm('personnel', 'deleteAll'), async (_req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_personnel');
  const db = loadDatabase();
  const deletedCount = (db.personnel || []).length;
  db.personnel = [];
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `کل جدول پرسنل (${deletedCount} پرونده) با موفقیت پاکسازی شد.` });
  } catch (err) {
    console.error('Failed to delete all personnel:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول پرسنل.' });
  }
});

app.post('/api/personnel/relatives/batch-import', requireAuth, requirePerm('personnel', 'importExcel'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'لیست بستگان جهت بارگذاری خالی است.' });
  }

  let added = 0;
  let updated = 0;
  let unmatched = 0;

  for (const row of items) {
    const pCode = String(getPayrollVal(row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') || '').trim();
    const pEmpId = String(getPayrollVal(row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') || '').trim();
    const pNatId = String(getPayrollVal(row, 'personnelNationalId', 'کد ملی کارمند', 'کد ملی پرسنل') || '').trim();
    const pName = normPayrollKey(String(getPayrollVal(row, 'personnelName', 'نام کارمند', 'نام پرسنل', 'نام و نام خانوادگی کارمند') || ''));

    const parent = (db.personnel || []).find((p: any) =>
      (pCode && String(p.personnelCode).trim() === pCode) ||
      (pEmpId && String(p.employeeId || '').trim() === pEmpId) ||
      (pNatId && String(p.nationalId || '').trim() === pNatId) ||
      (pName && normPayrollKey(String(p.fullName || '')) === pName)
    );

    if (!parent) {
      unmatched++;
      continue;
    }

    const relFullName = String(getPayrollVal(row, 'fullName', 'نام و نام خانوادگی بستگان', 'نام بستگان', 'نام و نام خانوادگی') || '').trim();
    if (!relFullName) continue;

    const relation = String(getPayrollVal(row, 'relation', 'نسبت', 'نسبت با کارمند') || 'سایر').trim();
    const relNationalId = String(getPayrollVal(row, 'nationalId', 'کد ملی بستگان', 'كد ملي', 'کد ملی') || '').trim();
    const rawDep = String(getPayrollVal(row, 'isDependent', 'تحت تکفل', 'تحت تکفل؟') || '').trim();
    const rawIns = String(getPayrollVal(row, 'insuranceCovered', 'بیمه تکمیلی', 'مشمول بیمه', 'بیمه') || '').trim();

    const isDependent = rawDep === '' ? true : !['خیر', 'نه', 'false', '0', 'ندارد'].includes(rawDep);
    const insuranceCovered = rawIns === '' ? isDependent : !['خیر', 'نه', 'false', '0', 'ندارد'].includes(rawIns);

    if (!Array.isArray(parent.relatives)) parent.relatives = [];

    const existingIdx = parent.relatives.findIndex((r: any) =>
      (relNationalId && String(r.nationalId || '').trim() === relNationalId) ||
      (normPayrollKey(String(r.fullName || '')) === normPayrollKey(relFullName) && normPayrollKey(String(r.relation || '')) === normPayrollKey(relation))
    );

    const relPayload = {
      id: existingIdx >= 0 ? parent.relatives[existingIdx].id : `rel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      personnelId: parent.id,
      personnelCode: parent.personnelCode,
      personnelName: parent.fullName,
      fullName: relFullName,
      relation,
      nationalId: relNationalId,
      shenasnamehNumber: String(getPayrollVal(row, 'shenasnamehNumber', 'شماره شناسنامه') || ''),
      fatherName: String(getPayrollVal(row, 'fatherName', 'نام پدر') || ''),
      birthDate: String(getPayrollVal(row, 'birthDate', 'تاریخ تولد', 'تاريخ تولد') || ''),
      gender: String(getPayrollVal(row, 'gender', 'جنسیت', 'جنسيت') || ''),
      phone: String(getPayrollVal(row, 'phone', 'تلفن همراه', 'شماره تماس') || ''),
      education: String(getPayrollVal(row, 'education', 'تحصیلات', 'مدرک تحصیلی') || ''),
      isDependent,
      insuranceCovered,
      notes: String(getPayrollVal(row, 'notes', 'توضیحات', 'یادداشت') || ''),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
      createdAt: existingIdx >= 0 ? parent.relatives[existingIdx].createdAt : new Date().toLocaleDateString('fa-IR'),
    };

    if (existingIdx >= 0) {
      parent.relatives[existingIdx] = { ...parent.relatives[existingIdx], ...relPayload };
      updated++;
    } else {
      parent.relatives.push(relPayload);
      added++;
    }
    parent.updatedAt = new Date().toLocaleDateString('fa-IR');
  }

  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      added,
      updated,
      unmatched,
      message: `اطلاعات بستگان با موفقیت ذخیره شد (${added} جدید، ${updated} به‌روزرسانی${unmatched > 0 ? `، ${unmatched} ردیف بدون تطابق کد پرسنلی` : ''}).`,
    });
  } catch (err) {
    console.error('Failed to batch import relatives:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی گروهی بستگان پرسنل.' });
  }
});

app.post('/api/personnel/relatives/delete-all', requireAuth, requirePerm('personnel', 'deleteAll'), async (_req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_relatives');
  const db = loadDatabase();
  let deletedCount = 0;
  for (const p of db.personnel || []) {
    if (Array.isArray(p.relatives) && p.relatives.length > 0) {
      deletedCount += p.relatives.length;
      p.relatives = [];
    }
  }
  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      deletedCount,
      message: `تمامی اطلاعات بستگان پرسنل (${deletedCount} رکورد) پاکسازی شد.`,
    });
  } catch (err) {
    console.error('Failed to delete all relatives:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی اطلاعات بستگان پرسنل.' });
  }
});

// 4. Karaneh Management & Month-over-Month Comparison
app.get('/api/karaneh', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'karaneh', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  const { period } = req.query;

  if (period) {
    const filtered = (db.karaneh || []).filter((k: any) => k.period === period);
    return res.json({ success: true, data: filtered });
  }

  res.json({ success: true, data: db.karaneh || [] });
});

app.get('/api/karaneh/comparison', requireAuth, requirePerm('karaneh', 'view'), (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const currentPeriod = (req.query.currentPeriod as string) || '1403-08';
  const previousPeriod = (req.query.previousPeriod as string) || '1403-07';

  const currentRecords = (db.karaneh || []).filter((k: any) => k.period === currentPeriod);
  const previousRecords = (db.karaneh || []).filter((k: any) => k.period === previousPeriod);

  const prevMap = new Map();
  for (const prev of previousRecords) {
    prevMap.set(String(prev.personnelCode).trim(), prev);
  }

  const comparisonRows = currentRecords.map((curr: any) => {
    const code = String(curr.personnelCode).trim();
    const prev = prevMap.get(code);

    const prevFinal = prev ? Number(prev.finalKaraneh || 0) : 0;
    const currFinal = Number(curr.finalKaraneh || 0);
    const diffAmount = currFinal - prevFinal;

    let diffPercent = 0;
    if (prevFinal > 0) {
      diffPercent = Number(((diffAmount / prevFinal) * 100).toFixed(1));
    } else if (currFinal > 0) {
      diffPercent = 100;
    }

    let trend: 'increase' | 'decrease' | 'unchanged' | 'new' = 'unchanged';
    if (!prev) {
      trend = 'new';
    } else if (diffAmount > 0) {
      trend = 'increase';
    } else if (diffAmount < 0) {
      trend = 'decrease';
    }

    return {
      id: curr.id,
      personnelId: curr.personnelId,
      personnelCode: curr.personnelCode,
      fullName: curr.fullName,
      department: curr.department,
      position: curr.position,
      currentKaraneh: currFinal,
      previousKaraneh: prevFinal,
      diffAmount,
      diffPercent,
      trend,
      notes: curr.notes || '',
    };
  });

  const totalCurrent = comparisonRows.reduce((sum: number, r: any) => sum + r.currentKaraneh, 0);
  const totalPrevious = comparisonRows.reduce((sum: number, r: any) => sum + r.previousKaraneh, 0);
  const totalDiff = totalCurrent - totalPrevious;
  const overallGrowthPercent = totalPrevious > 0 ? Number(((totalDiff / totalPrevious) * 100).toFixed(1)) : 0;

  res.json({
    success: true,
    data: {
      currentPeriod,
      previousPeriod,
      comparisonRows,
      summary: {
        totalEmployees: comparisonRows.length,
        totalCurrent,
        totalPrevious,
        totalDiff,
        overallGrowthPercent,
        countIncreased: comparisonRows.filter((r: any) => r.trend === 'increase').length,
        countDecreased: comparisonRows.filter((r: any) => r.trend === 'decrease').length,
        countUnchanged: comparisonRows.filter((r: any) => r.trend === 'unchanged').length,
        countNew: comparisonRows.filter((r: any) => r.trend === 'new').length,
      }
    }
  });
});

app.post('/api/karaneh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const kData = req.body;
  const isEdit = !!kData.id;
  if (!checkPermission(req.authUser, 'karaneh', isEdit ? 'edit' : 'create')) {
    return res.status(403).json({ success: false, message: 'شما مجوز ثبت یا ویرایش کارانه را ندارید.' });
  }

  if (!kData.personnelCode || !kData.period) {
    return res.status(400).json({ success: false, message: 'کد پرسنلی و دوره کارانه الزامی است.' });
  }

  const existingIndex = db.karaneh.findIndex(
    (k: any) => String(k.personnelCode).trim() === String(kData.personnelCode).trim() && k.period === kData.period
  );

  const baseKaraneh = Number(kData.baseKaraneh || 0);
  const overtimeBonus = Number(kData.overtimeBonus || 0);
  const deductions = Number(kData.deductions || 0);
  const finalKaraneh = kData.finalKaraneh !== undefined ? Number(kData.finalKaraneh) : (baseKaraneh + overtimeBonus - deductions);

  const record = {
    id: existingIndex >= 0 ? db.karaneh[existingIndex].id : `k-${Date.now()}`,
    personnelId: kData.personnelId || '',
    personnelCode: String(kData.personnelCode).trim(),
    fullName: kData.fullName || 'پرسنل',
    department: kData.department || 'عمومی',
    position: kData.position || '',
    period: kData.period,
    baseKaraneh,
    overtimeBonus,
    deductions,
    finalKaraneh,
    notes: kData.notes || '',
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };

  if (existingIndex >= 0) {
    db.karaneh[existingIndex] = record;
  } else {
    db.karaneh.push(record);
  }

  try {
    await persistDatabase(db);
    return res.json({ success: true, data: record, message: 'کارانه پرسنل با موفقیت ثبت شد.' });
  } catch (err) {
    console.error('Failed to save karaneh:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی کارانه در پایگاه داده.' });
  }
});

app.post('/api/karaneh/batch-import', requireAuth, requirePerm('karaneh', 'importExcel'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { period, items } = req.body;

  if (!period || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'دوره کارانه و لیست رکوردها الزامی است.' });
  }

  let count = 0;
  for (const row of items) {
    const code = String(row.personnelCode || row['کد پرسنلی'] || '').trim();
    if (!code) continue;

    const matchingPersonnel = db.personnel.find((p: any) => String(p.personnelCode).trim() === code);
    const fullName = row.fullName || row['نام و نام خانوادگی'] || row['نام'] || (matchingPersonnel ? matchingPersonnel.fullName : 'پرسنل');
    const department = row.department || row['واحد اداری'] || row['واحد سازمانی'] || row['واحد'] || (matchingPersonnel ? matchingPersonnel.department : 'عمومی');
    const position = row.position || row['پست سازمانی'] || row['پست و سمت'] || row['پست'] || row['سمت'] || (matchingPersonnel ? matchingPersonnel.position : '');

    const baseKaraneh = Number(row.baseKaraneh || row['کارانه پایه (ریال)'] || row['کارانه پایه'] || 0);
    const overtimeBonus = Number(row.overtimeBonus || row['پاداش تشویقی (ریال)'] || row['پاداش تشویقی'] || row['اضافه کاری'] || 0);
    const deductions = Number(row.deductions || row['کسورات (ریال)'] || row['کسورات'] || 0);

    const explicitFinal = row.finalKaraneh ?? row['مبلغ کارانه (ریال)'] ?? row['مبلغ کارانه'] ?? row['کارانه خالص نهایی (ریال)'] ?? row['کارانه خالص'] ?? row['کارانه'] ?? row['مبلغ'] ?? row.amount;
    const finalKaraneh = explicitFinal !== undefined ? Number(explicitFinal) : (baseKaraneh + overtimeBonus - deductions);
    const notes = row.notes || row['توضیحات'] || row['یادداشت'] || '';

    const existingIndex = db.karaneh.findIndex(
      (k: any) => String(k.personnelCode).trim() === code && k.period === period
    );

    const record = {
      id: existingIndex >= 0 ? db.karaneh[existingIndex].id : `k-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      personnelId: matchingPersonnel ? matchingPersonnel.id : '',
      personnelCode: code,
      fullName,
      department,
      position,
      period,
      baseKaraneh,
      overtimeBonus,
      deductions,
      finalKaraneh,
      notes,
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };

    if (existingIndex >= 0) {
      db.karaneh[existingIndex] = record;
    } else {
      db.karaneh.push(record);
    }
    count++;
  }

  try {
    await persistDatabase(db);
    return res.json({ success: true, message: `کارانه دوره با موفقیت بارگذاری شد (${count} رکورد ثبت و محاسبه گردید).` });
  } catch (err) {
    console.error('Failed to batch import karaneh:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی گروهی کارانه در پایگاه داده.' });
  }
});

app.delete('/api/karaneh/:id', requireAuth, requirePerm('karaneh', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.karaneh = db.karaneh.filter((k: any) => k.id !== id);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'رکورد کارانه با موفقیت حذف گردید.' });
  } catch (err) {
    console.error('Failed to delete karaneh:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف رکورد کارانه از پایگاه داده.' });
  }
});

app.post('/api/karaneh/batch-delete', requireAuth, requirePerm('karaneh', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.karaneh || []).length;
  db.karaneh = (db.karaneh || []).filter((k: any) => !idSet.has(k.id));
  const deletedCount = before - db.karaneh.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} رکورد کارانه با موفقیت حذف شد.` });
  } catch (err) {
    console.error('Failed to batch delete karaneh:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی کارانه از پایگاه داده.' });
  }
});

app.post('/api/karaneh/delete-all', requireAuth, requirePerm('karaneh', 'deleteAll'), async (req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_karaneh');
  const db = loadDatabase();
  const { period } = req.body || {};
  const before = (db.karaneh || []).length;
  db.karaneh = period ? (db.karaneh || []).filter((k: any) => k.period !== period) : [];
  const deletedCount = before - db.karaneh.length;
  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      deletedCount,
      message: period
        ? `تمام رکوردهای کارانه دوره ${period} (${deletedCount} رکورد) حذف شدند.`
        : `کل جدول کارانه (${deletedCount} رکورد) پاکسازی شد.`,
    });
  } catch (err) {
    console.error('Failed to delete all karaneh:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول کارانه.' });
  }
});

// 5. Job Groups & Grades Management
app.get('/api/job-groups', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'jobGroups', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  res.json({ success: true, data: db.jobGroups || [] });
});

app.post('/api/job-groups', requireAuth, requirePerm('jobGroups', 'create'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const data = req.body;

  if (!data.code || !data.title) {
    return res.status(400).json({ success: false, message: 'کد گروه و عنوان شغلی الزامی است.' });
  }

  const newGroup = {
    id: `jg-${Date.now()}`,
    ...data,
    grade: Number(data.grade || 1),
    minBaseSalary: Number(data.minBaseSalary || 0),
    maxBaseSalary: Number(data.maxBaseSalary || 0),
    maxKaranehCeiling: Number(data.maxKaranehCeiling || 0),
    requiredExperienceYears: Number(data.requiredExperienceYears || 0),
  };

  db.jobGroups.push(newGroup);
  try {
    await persistDatabase(db);
    return res.json({ success: true, data: newGroup, message: 'گروه شغلی جدید ایجاد شد.' });
  } catch (err) {
    console.error('Failed to create job group:', err);
    return res.status(500).json({ success: false, message: 'خطا در ثبت گروه شغلی در پایگاه داده.' });
  }
});

app.put('/api/job-groups/:id', requireAuth, requirePerm('jobGroups', 'edit'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const index = db.jobGroups.findIndex((g: any) => g.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'گروه شغلی یافت نشد.' });
  }

  db.jobGroups[index] = {
    ...db.jobGroups[index],
    ...req.body,
  };

  try {
    await persistDatabase(db);
    return res.json({ success: true, data: db.jobGroups[index], message: 'گروه شغلی با موفقیت ویرایش شد.' });
  } catch (err) {
    console.error('Failed to update job group:', err);
    return res.status(500).json({ success: false, message: 'خطا در ویرایش گروه شغلی در پایگاه داده.' });
  }
});

app.delete('/api/job-groups/:id', requireAuth, requirePerm('jobGroups', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.jobGroups = db.jobGroups.filter((g: any) => g.id !== id);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'گروه شغلی حذف شد.' });
  } catch (err) {
    console.error('Failed to delete job group:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروه شغلی از پایگاه داده.' });
  }
});

app.post('/api/job-groups/batch-delete', requireAuth, requirePerm('jobGroups', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.jobGroups || []).length;
  db.jobGroups = (db.jobGroups || []).filter((g: any) => !idSet.has(g.id));
  const deletedCount = before - db.jobGroups.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} گروه شغلی با موفقیت حذف شد.` });
  } catch (err) {
    console.error('Failed to batch delete job groups:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی رتبه‌های شغلی از پایگاه داده.' });
  }
});

app.post('/api/job-groups/delete-all', requireAuth, requirePerm('jobGroups', 'deleteAll'), async (_req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_job_groups');
  const db = loadDatabase();
  const deletedCount = (db.jobGroups || []).length;
  db.jobGroups = [];
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `کل جدول گروه‌های شغلی (${deletedCount} رکورد) پاکسازی شد.` });
  } catch (err) {
    console.error('Failed to delete all job groups:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول گروه‌های شغلی.' });
  }
});

// 5b. Job Classifications (18-column personnel classification table)
app.get('/api/job-classifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'jobGroups', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  res.json({ success: true, data: db.jobClassifications || [] });
});

app.post('/api/job-classifications', requireAuth, requirePerm('jobGroups', 'create'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const data = req.body;
  if (!data.personnelCode) {
    return res.status(400).json({ success: false, message: 'کد پرسنلی الزامی است.' });
  }

  const newRecord = {
    id: `jc-${Date.now()}`,
    personnelCode: String(data.personnelCode || '').trim(),
    firstName: String(data.firstName || ''),
    lastName: String(data.lastName || ''),
    workLocation: String(data.workLocation || ''),
    department: String(data.department || ''),
    nationalId: String(data.nationalId || ''),
    education: String(data.education || ''),
    hireDate: String(data.hireDate || ''),
    hireMonth: String(data.hireMonth || ''),
    miningExperienceDays: String(data.miningExperienceDays || ''),
    totalInsuranceHistory: String(data.totalInsuranceHistory || ''),
    miningExperience: String(data.miningExperience || ''),
    nonMiningExperience: String(data.nonMiningExperience || ''),
    jobGroup: String(data.jobGroup || ''),
    groupGapFrom1405: String(data.groupGapFrom1405 || ''),
    nextGroupGap: String(data.nextGroupGap || ''),
    jobTitle: String(data.jobTitle || ''),
    position: String(data.position || ''),
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };

  db.jobClassifications.push(newRecord);
  try {
    await persistDatabase(db);
    return res.json({ success: true, data: newRecord, message: 'رکورد طبقه‌بندی شغلی با موفقیت ثبت شد.' });
  } catch (err) {
    console.error('Failed to create job classification:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی طبقه‌بندی شغلی در پایگاه داده.' });
  }
});

app.put('/api/job-classifications/:id', requireAuth, requirePerm('jobGroups', 'edit'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const index = db.jobClassifications.findIndex((item: any) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'رکورد طبقه‌بندی یافت نشد.' });
  }

  db.jobClassifications[index] = {
    ...db.jobClassifications[index],
    ...req.body,
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };

  try {
    await persistDatabase(db);
    return res.json({ success: true, data: db.jobClassifications[index], message: 'رکورد طبقه‌بندی شغلی ویرایش شد.' });
  } catch (err) {
    console.error('Failed to update job classification:', err);
    return res.status(500).json({ success: false, message: 'خطا در ویرایش طبقه‌بندی شغلی در پایگاه داده.' });
  }
});

app.delete('/api/job-classifications/:id', requireAuth, requirePerm('jobGroups', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.jobClassifications = db.jobClassifications.filter((item: any) => item.id !== id);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'رکورد طبقه‌بندی شغلی حذف شد.' });
  } catch (err) {
    console.error('Failed to delete job classification:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف طبقه‌بندی شغلی از پایگاه داده.' });
  }
});

app.post('/api/job-classifications/batch-import', requireAuth, requirePerm('jobGroups', 'importExcel'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'فایل اکسل طبقه‌بندی خالی است.' });
  }

  let added = 0;
  let updated = 0;

  for (const row of items) {
    const code = String(row.personnelCode ?? row['کد پرسنلی'] ?? '').trim();
    if (!code) continue;

    const mapped = {
      personnelCode: code,
      firstName: String(row.firstName ?? row['نام'] ?? ''),
      lastName: String(row.lastName ?? row['نام خانوادگی'] ?? ''),
      workLocation: String(row.workLocation ?? row['محل خدمت'] ?? ''),
      department: String(row.department ?? row['واحد'] ?? row['واحد سازمانی'] ?? ''),
      nationalId: String(row.nationalId ?? row['کد ملی'] ?? ''),
      education: String(row.education ?? row['مدرک تحصیلی'] ?? row['تحصیلات'] ?? ''),
      hireDate: String(row.hireDate ?? row['تاریخ استخدام'] ?? ''),
      hireMonth: String(row.hireMonth ?? row['ماه استخدام'] ?? ''),
      miningExperienceDays: String(row.miningExperienceDays ?? row['سابقه معدنی به روز'] ?? row['سابقه معدنی به‌روز'] ?? ''),
      totalInsuranceHistory: String(row.totalInsuranceHistory ?? row['سابقه بیمه کلی'] ?? ''),
      miningExperience: String(row.miningExperience ?? row['سابقه معدنی'] ?? ''),
      nonMiningExperience: String(row.nonMiningExperience ?? row['سابقه غیرمعدنی'] ?? row['سابقه غیر معدنی'] ?? ''),
      jobGroup: String(row.jobGroup ?? row['گروه شغلی'] ?? ''),
      groupGapFrom1405: String(row.groupGapFrom1405 ?? row['فاصله گروه از 1405 به بعد'] ?? row['فاصله گروه از ۱۴۰۵ به بعد'] ?? ''),
      nextGroupGap: String(row.nextGroupGap ?? row['فاصله گروه بعدی'] ?? ''),
      jobTitle: String(row.jobTitle ?? row['شغل'] ?? ''),
      position: String(row.position ?? row['پست'] ?? row['پست سازمانی'] ?? ''),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };

    const idx = db.jobClassifications.findIndex((item: any) => String(item.personnelCode).trim() === code);
    if (idx >= 0) {
      db.jobClassifications[idx] = { ...db.jobClassifications[idx], ...mapped };
      updated++;
    } else {
      db.jobClassifications.push({
        id: `jc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...mapped,
      });
      added++;
    }
  }

  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      message: `جدول طبقه‌بندی با موفقیت بارگذاری شد (${added} رکورد جدید و ${updated} رکورد به‌روزرسانی گردید).`
    });
  } catch (err) {
    console.error('Failed to batch import job classifications:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی گروهی طبقه‌بندی شغلی در پایگاه داده.' });
  }
});

app.post('/api/job-classifications/batch-delete', requireAuth, requirePerm('jobGroups', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.jobClassifications || []).length;
  db.jobClassifications = (db.jobClassifications || []).filter((c: any) => !idSet.has(c.id));
  const deletedCount = before - db.jobClassifications.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} ردیف طبقه‌بندی شغلی با موفقیت حذف شد.` });
  } catch (err) {
    console.error('Failed to batch delete job classifications:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی طبقه‌بندی شغلی از پایگاه داده.' });
  }
});

app.post('/api/job-classifications/delete-all', requireAuth, requirePerm('jobGroups', 'deleteAll'), async (_req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_job_classifications');
  const db = loadDatabase();
  const deletedCount = (db.jobClassifications || []).length;
  db.jobClassifications = [];
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `کل جدول طبقه‌بندی مشاغل ۱۸ ستونی (${deletedCount} رکورد) پاکسازی شد.` });
  } catch (err) {
    console.error('Failed to delete all job classifications:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول طبقه‌بندی مشاغل.' });
  }
});

// 6. Personnel Commitments
app.get('/api/commitments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'commitments', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  res.json({ success: true, data: db.commitments || [] });
});

app.post('/api/commitments', requireAuth, requirePerm('commitments', 'create'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const data = req.body;

  if (!data.personnelCode || !data.commitmentType) {
    return res.status(400).json({ success: false, message: 'کد پرسنلی و نوع تعهد الزامی است.' });
  }

  const matchingP = db.personnel.find((p: any) => String(p.personnelCode).trim() === String(data.personnelCode).trim());

  const newCommitment = {
    id: `cmt-${Date.now()}`,
    ...data,
    personnelId: matchingP ? matchingP.id : (data.personnelId || ''),
    personnelName: matchingP ? matchingP.fullName : (data.personnelName || 'پرسنل'),
    amount: Number(data.amount || 0),
    previouslyTakenAmount: Number(data.previouslyTakenAmount || 0),
    maxAllowedAmount: Number(data.maxAllowedAmount || 0),
    isArchived: Boolean(data.isArchived),
    archivedAt: data.isArchived ? (data.archivedAt || new Date().toLocaleDateString('fa-IR')) : undefined,
    archiveCode: data.isArchived ? (data.archiveCode || `ARC-${Date.now().toString().slice(-5)}`) : undefined,
    status: data.status || 'جاری و معتبر',
  };

  db.commitments.push(newCommitment);
  try {
    await persistDatabase(db);
    return res.json({ success: true, data: newCommitment, message: 'تعهد پرسنلی جدید با موفقیت ثبت شد.' });
  } catch (err) {
    console.error('Failed to create commitment:', err);
    return res.status(500).json({ success: false, message: 'خطا در ثبت سند تعهد در پایگاه داده.' });
  }
});

app.put('/api/commitments/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  const index = db.commitments.findIndex((c: any) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'تعهد پرسنلی یافت نشد.' });
  }

  const isOnlyArchiveToggle = Object.keys(req.body).every((k) => ['isArchived', 'archivedAt', 'archiveCode'].includes(k));
  if (isOnlyArchiveToggle) {
    if (!checkPermission(req.authUser, 'commitments', 'archive') && !checkPermission(req.authUser, 'commitments', 'edit')) {
      return res.status(403).json({ success: false, message: 'شما مجوز بایگانی تعهدات را ندارید.' });
    }
  } else if (!checkPermission(req.authUser, 'commitments', 'edit')) {
    return res.status(403).json({ success: false, message: 'شما مجوز ویرایش تعهدات را ندارید.' });
  }

  const prev = db.commitments[index];
  const nextArchived = req.body.isArchived !== undefined ? Boolean(req.body.isArchived) : prev.isArchived;

  db.commitments[index] = {
    ...prev,
    ...req.body,
    amount: req.body.amount !== undefined ? Number(req.body.amount) : prev.amount,
    previouslyTakenAmount: req.body.previouslyTakenAmount !== undefined ? Number(req.body.previouslyTakenAmount) : prev.previouslyTakenAmount,
    maxAllowedAmount: req.body.maxAllowedAmount !== undefined ? Number(req.body.maxAllowedAmount) : prev.maxAllowedAmount,
    isArchived: nextArchived,
    archivedAt: nextArchived ? (req.body.archivedAt || prev.archivedAt || new Date().toLocaleDateString('fa-IR')) : undefined,
    archiveCode: nextArchived ? (req.body.archiveCode || prev.archiveCode || `ARC-${Date.now().toString().slice(-5)}`) : undefined,
  };

  try {
    await persistDatabase(db);
    return res.json({ success: true, data: db.commitments[index], message: 'تعهد پرسنلی با موفقیت به‌روزرسانی شد.' });
  } catch (err) {
    console.error('Failed to update commitment:', err);
    return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی سند تعهد در پایگاه داده.' });
  }
});

app.delete('/api/commitments/:id', requireAuth, requirePerm('commitments', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.commitments = db.commitments.filter((c: any) => c.id !== id);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'سند تعهد پرسنلی حذف شد.' });
  } catch (err) {
    console.error('Failed to delete commitment:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف سند تعهد از پایگاه داده.' });
  }
});

app.post('/api/commitments/batch-import', requireAuth, requirePerm('commitments', 'importExcel'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'لیست تعهدات جهت بارگذاری خالی است.' });
  }

  let added = 0;
  for (const row of items) {
    const code = String(row.personnelCode || row['کد پرسنلی'] || '').trim();
    if (!code) continue;

    const matchingP = db.personnel.find((p: any) => String(p.personnelCode).trim() === code);
    const archivedVal = String(row['بایگانی'] || row['وضعیت بایگانی'] || '').trim();
    const isArchived = archivedVal === 'بله' || archivedVal === 'بایگانی شده' || row.isArchived === true;

    const newCommitment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      personnelId: matchingP ? matchingP.id : '',
      personnelCode: code,
      personnelName: row.personnelName || row['نام پرسنل'] || row['نام و نام خانوادگی'] || (matchingP ? matchingP.fullName : 'پرسنل'),
      commitmentType: row.commitmentType || row['نوع تعهد یا تضمین'] || row['نوع تعهد'] || 'تعهد حسابداری',
      amount: Number(row.amount ?? row['مبلغ تعهد فعلی (ریال)'] ?? row['مبلغ تعهد (ریال)'] ?? row['مبلغ'] ?? 0),
      previouslyTakenAmount: Number(row.previouslyTakenAmount ?? row['مبلغ قبلاً دریافت شده (ریال)'] ?? row['مبلغ قبلا دریافت شده'] ?? 0),
      maxAllowedAmount: Number(row.maxAllowedAmount ?? row['سقف مجاز کل (ریال)'] ?? row['سقف مجاز'] ?? 0),
      startDate: String(row.startDate || row['تاریخ شروع'] || '1403/01/01'),
      endDate: String(row.endDate || row['تاریخ سررسید'] || '1405/01/01'),
      status: row.status || row['وضعیت'] || 'جاری و معتبر',
      isArchived,
      archivedAt: isArchived ? new Date().toLocaleDateString('fa-IR') : undefined,
      archiveCode: isArchived ? `ARC-${Date.now().toString().slice(-5)}` : undefined,
      guarantorName: row.guarantorName || row['نام ضامن'] || '',
      notes: row.notes || row['توضیحات'] || '',
    };

    db.commitments.push(newCommitment);
    added++;
  }

  try {
    await persistDatabase(db);
    return res.json({ success: true, message: `${added} فقره تعهد پرسنلی با موفقیت از اکسل ثبت گردید.` });
  } catch (err) {
    console.error('Failed to batch import commitments:', err);
    return res.status(500).json({ success: false, message: 'خطا در ثبت گروهی تعهدات در پایگاه داده.' });
  }
});

app.post('/api/commitments/batch-delete', requireAuth, requirePerm('commitments', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.commitments || []).length;
  db.commitments = (db.commitments || []).filter((c: any) => !idSet.has(c.id));
  const deletedCount = before - db.commitments.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} سند تعهد پرسنلی با موفقیت حذف شد.` });
  } catch (err) {
    console.error('Failed to batch delete commitments:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی تعهدات از پایگاه داده.' });
  }
});

app.post('/api/commitments/delete-all', requireAuth, requirePerm('commitments', 'deleteAll'), async (_req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_commitments');
  const db = loadDatabase();
  const deletedCount = (db.commitments || []).length;
  db.commitments = [];
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `کل جدول تعهدات پرسنلی (${deletedCount} سند) پاکسازی شد.` });
  } catch (err) {
    console.error('Failed to delete all commitments:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول تعهدات.' });
  }
});

// 7. Payroll (حقوق و دستمزد - 226 columns + comparison)
function normPayrollKey(key: string): string {
  return String(key || '')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/أ|إ/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPayrollVal(row: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  const map = new Map<string, any>();
  for (const [rk, rv] of Object.entries(row)) {
    if (rv !== undefined && rv !== null && rv !== '') {
      const nk = normPayrollKey(rk);
      if (!map.has(nk)) map.set(nk, rv);
    }
  }
  for (const k of keys) {
    const found = map.get(normPayrollKey(k));
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseNumPayroll(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const eng = String(val)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,٬،\s]/g, '')
    .replace(/ریال/g, '');
  const n = Number(eng);
  return Number.isFinite(n) ? n : 0;
}

function parseYearMonthServer(rawYm: any, fallbackPeriod: string): string {
  const eng = String(rawYm || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
  if (!eng) return fallbackPeriod;
  const m1 = eng.match(/^(\d{4})\s*[-/]\s*(\d{1,2})$/);
  if (m1) {
    const mo = m1[2].padStart(2, '0');
    if (Number(mo) >= 1 && Number(mo) <= 12) return `${m1[1]}-${mo}`;
  }
  const m2 = eng.match(/^(\d{4})(\d{2})$/);
  if (m2 && Number(m2[2]) >= 1 && Number(m2[2]) <= 12) {
    return `${m2[1]}-${m2[2]}`;
  }
  return fallbackPeriod;
}

app.get('/api/payroll', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req.authUser, 'payroll', 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  const { period } = req.query;
  let records = db.payroll || [];
  if (period) {
    records = records.filter((r: any) => r.period === period);
  }
  res.json({ success: true, data: records });
});

app.post('/api/payroll/batch-import', requireAuth, requirePerm('payroll', 'importExcel'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { period, useRowYearMonth, items } = req.body;

  if (!period || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'دوره و لیست ردیف‌های حقوق الزامی است.' });
  }

  let added = 0;
  let updated = 0;

  for (const row of items) {
    const code = String(getPayrollVal(row, 'كد پرسنلي', 'کد پرسنلی', 'personnelCode') || '').trim();
    if (!code) continue;

    const rawYm = getPayrollVal(row, 'سال/ماه', 'yearMonthLabel');
    const targetPeriod = useRowYearMonth ? parseYearMonthServer(rawYm, String(period)) : String(period);

    const firstName = String(getPayrollVal(row, 'نام', 'firstName') || '').trim();
    const lastName = String(getPayrollVal(row, 'نام خانوادگي', 'نام خانوادگی', 'lastName') || '').trim();
    const fullNameRaw = String(getPayrollVal(row, 'نام و نام خانوادگي', 'نام و نام خانوادگی', 'fullName') || '').trim();
    const matchingP = db.personnel.find((p: any) => String(p.personnelCode).trim() === code);
    const fullName = fullNameRaw || `${firstName} ${lastName}`.trim() || (matchingP ? matchingP.fullName : 'پرسنل');

    const record = {
      period: targetPeriod,
      yearMonthLabel: String(rawYm || targetPeriod.replace('-', '/')),
      employeeId: String(getPayrollVal(row, 'شناسه كارمند', 'شناسه کارمند', 'employeeId') || ''),
      personnelCode: code,
      firstName,
      lastName,
      fullName,
      nationalId: String(getPayrollVal(row, 'كد ملي', 'کد ملی', 'nationalId') || (matchingP?.nationalId || '')),
      workLocation: String(getPayrollVal(row, 'محل خدمت', 'workLocation') || ''),
      department: String(getPayrollVal(row, 'واحد سازماني', 'واحد سازمانی', 'واحد', 'department') || (matchingP?.department || '')),
      jobTitle: String(getPayrollVal(row, 'شغل', 'jobTitle') || ''),
      position: String(getPayrollVal(row, 'پست', 'پست سازمانی', 'position') || (matchingP?.position || '')),
      jobGroupCode: String(getPayrollVal(row, 'کد گروه شغلي', 'کد گروه شغلی', 'jobGroupCode') || ''),
      jobGroupTitle: String(getPayrollVal(row, 'عنوان گروه شغلي', 'عنوان گروه شغلی', 'jobGroupTitle') || ''),
      employmentType: String(getPayrollVal(row, 'نوع استخدام', 'employmentType') || ''),
      effectiveDays: parseNumPayroll(getPayrollVal(row, 'کارکرد موثر', 'effectiveDays')),
      netPayable: parseNumPayroll(getPayrollVal(row, 'خالص پرداختی', 'netPayable')),
      totalBenefits: parseNumPayroll(getPayrollVal(row, 'جمع مزایا', 'totalBenefits')),
      overtimeAmount: parseNumPayroll(getPayrollVal(row, 'اضافه کاری', 'overtimeAmount')),
      fridayWorkAmount: parseNumPayroll(getPayrollVal(row, 'جمعه کاری', 'fridayWorkAmount')),
      missionAmount: parseNumPayroll(getPayrollVal(row, 'ماموریت ریالی', 'missionAmount')),
      bonusAmount: parseNumPayroll(getPayrollVal(row, 'پاداش', 'پاداشِ', 'bonusAmount')),
      incentiveAmount: parseNumPayroll(getPayrollVal(row, 'تشویقی', 'incentiveAmount')),
      otherBenefits: parseNumPayroll(getPayrollVal(row, 'سایر مزایا', 'otherBenefits')),
      arrearsAmount: parseNumPayroll(getPayrollVal(row, 'مابه التفاوت', 'arrearsAmount')),
      advanceAmount: parseNumPayroll(getPayrollVal(row, 'مساعده', 'advanceAmount')),
      totalDeductions: parseNumPayroll(getPayrollVal(row, 'جمع کسور', 'totalDeductions')),
      taxAmount: parseNumPayroll(getPayrollVal(row, 'مالیات', 'taxAmount')),
      salaryTaxAmount: parseNumPayroll(getPayrollVal(row, 'مالیات حقوق', 'salaryTaxAmount')),
      jobWage: parseNumPayroll(getPayrollVal(row, 'مزد شغل', 'jobWage')),
      totalOrderFactors: parseNumPayroll(getPayrollVal(row, 'جمع عوامل حکمی', 'جمع عوامل حكمي', 'totalOrderFactors')),
      baseSalaryOrder: parseNumPayroll(getPayrollVal(row, 'حقوق پایه(حكم-اصلي)', 'حقوق پایه(حکم-اصلی)', 'baseSalaryOrder')),
      overtimeHours: parseNumPayroll(getPayrollVal(row, 'ساعت اضافه کاری(کارکرد)', 'overtimeHours')),
      fridayWorkHours: parseNumPayroll(getPayrollVal(row, 'ساعت جمعه کاری(کارکرد)', 'fridayWorkHours')),
      costCenterCode: String(getPayrollVal(row, 'مرکز هزینه(كد تفصيل)', 'مرکز هزینه(کد تفصیل)') || ''),
      costCenterTitle: String(getPayrollVal(row, 'مرکز هزینه(عنوان تفصيل)', 'مرکز هزینه(عنوان تفصیل)') || ''),
      projectCode: String(getPayrollVal(row, 'پروژه(كد تفصيل)', 'پروژه(کد تفصیل)') || ''),
      projectTitle: String(getPayrollVal(row, 'پروژه(عنوان تفصيل)', 'پروژه(عنوان تفصیل)') || ''),
      bankName: String(getPayrollVal(row, 'نام بانک') || ''),
      bankAccount: String(getPayrollVal(row, 'شماره حساب') || ''),
      rawFields: row,
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };

    const existingIdx = db.payroll.findIndex(
      (r: any) => String(r.personnelCode).trim() === code && r.period === targetPeriod
    );

    if (existingIdx >= 0) {
      db.payroll[existingIdx] = { ...db.payroll[existingIdx], ...record };
      updated++;
    } else {
      db.payroll.push({
        id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...record,
      });
      added++;
    }
  }

  try {
    await persistDatabase(db);
    return res.json({
      success: true,
      message: `فایل حقوق با موفقیت در دیتابیس ذخیره شد (${added} رکورد جدید، ${updated} رکورد به‌روزرسانی گردید).`
    });
  } catch (err) {
    console.error('Failed to batch import payroll:', err);
    return res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی لیست حقوق در پایگاه داده.' });
  }
});

app.delete('/api/payroll/:id', requireAuth, requirePerm('payroll', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.payroll = (db.payroll || []).filter((r: any) => r.id !== id);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'رکورد حقوق حذف گردید.' });
  } catch (err) {
    console.error('Failed to delete payroll:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف رکورد حقوق از پایگاه داده.' });
  }
});

app.delete('/api/payroll/by-period/:period', requireAuth, requirePerm('payroll', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { period } = req.params;
  db.payroll = (db.payroll || []).filter((r: any) => r.period !== period);
  try {
    await persistDatabase(db);
    return res.json({ success: true, message: `تمام رکوردهای حقوق دوره ${period} حذف شدند.` });
  } catch (err) {
    console.error('Failed to delete payroll period:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف رکوردهای دوره حقوق از پایگاه داده.' });
  }
});

app.post('/api/payroll/batch-delete', requireAuth, requirePerm('payroll', 'delete'), async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'موردی برای حذف انتخاب نشده است.' });
  }
  const idSet = new Set(ids.map((id: any) => String(id)));
  const before = (db.payroll || []).length;
  db.payroll = (db.payroll || []).filter((r: any) => !idSet.has(r.id));
  const deletedCount = before - db.payroll.length;
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `${deletedCount} رکورد حقوقی با موفقیت حذف شد.` });
  } catch (err) {
    console.error('Failed to batch delete payroll:', err);
    return res.status(500).json({ success: false, message: 'خطا در حذف گروهی حقوق از پایگاه داده.' });
  }
});

app.post('/api/payroll/delete-all', requireAuth, requirePerm('payroll', 'deleteAll'), async (_req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('pre_delete_all_payroll');
  const db = loadDatabase();
  const deletedCount = (db.payroll || []).length;
  db.payroll = [];
  try {
    await persistDatabase(db);
    return res.json({ success: true, deletedCount, message: `کل جدول حقوق و دستمزد (${deletedCount} فیش) با موفقیت پاکسازی شد.` });
  } catch (err) {
    console.error('Failed to delete all payroll:', err);
    return res.status(500).json({ success: false, message: 'خطا در پاکسازی جدول حقوق و دستمزد.' });
  }
});

// 7B. Mining Volumes, Fleet Machinery Workshop Status & Per-Unit Operational Reports
app.get('/api/mining-volumes', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  const { period } = req.query;
  let records = db.miningVolumes || [];
  if (period) records = records.filter((v: any) => v.period === period);
  if (!isSuperAdminUser(req.authUser) && !checkPermission(req.authUser, 'ceoDashboard', 'view')) {
    records = records.filter((v: any) => isDispatchingOrUnitAllowed(req.authUser, v.unitName));
  }
  res.json({ success: true, data: records });
});

app.post('/api/mining-volumes', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const body = req.body || {};
  const action = body.id ? 'edit' : 'create';
  const hasCeoPerm = checkPermission(req.authUser, 'ceoDashboard', action);
  const hasUnitPerm = checkPermission(req.authUser, 'unitOperations', action) && isDispatchingOrUnitAllowed(req.authUser, body.unitName);
  if (!hasCeoPerm && !hasUnitPerm) {
    return res.status(403).json({ success: false, message: 'عدم دسترسی ثبت یا ویرایش آمار حجم معدن.' });
  }
  if (!body.period || !body.unitName) {
    return res.status(400).json({ success: false, message: 'دوره و نام واحد عملیاتی الزامی است.' });
  }
  if (!Array.isArray(db.miningVolumes)) db.miningVolumes = [];
  const volumeValue = Number(body.volumeValue || 0);
  const targetVolume = Number(body.targetVolume || 0);
  const idx = body.id ? db.miningVolumes.findIndex((v: any) => v.id === body.id) : -1;
  const rec = {
    id: idx >= 0 ? db.miningVolumes[idx].id : `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    period: String(body.period).trim(),
    unitName: String(body.unitName).trim(),
    activityType: String(body.activityType || 'عملیات معدنی').trim(),
    metricTitle: String(body.metricTitle || body.activityType || body.unitName).trim(),
    volumeValue: Number.isFinite(volumeValue) ? volumeValue : 0,
    targetVolume: Number.isFinite(targetVolume) ? targetVolume : 0,
    unitLabel: String(body.unitLabel || 'تن').trim(),
    status: String(body.status || (targetVolume > 0 && volumeValue >= targetVolume ? 'فراتر از برنامه' : 'در حال اجرا')).trim(),
    notes: String(body.notes || '').trim(),
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };
  if (idx >= 0) db.miningVolumes[idx] = rec; else db.miningVolumes.push(rec);
  await persistDatabase(db);
  return res.json({ success: true, data: rec, message: 'آمار حجم عملیات ماهانه با موفقیت ذخیره شد.' });
});

app.post('/api/mining-volumes/batch-import', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const canCeo = checkPermission(req.authUser, 'ceoDashboard', 'importExcel') || checkPermission(req.authUser, 'ceoDashboard', 'create');
  const canUnit = checkPermission(req.authUser, 'unitOperations', 'importExcel') || checkPermission(req.authUser, 'unitOperations', 'create');
  if (!canCeo && !canUnit) {
    return res.status(403).json({ success: false, message: 'عدم دسترسی ورود اکسل آمار حجم عملیات.' });
  }
  const db = loadDatabase();
  if (!Array.isArray(db.miningVolumes)) db.miningVolumes = [];
  const { items } = req.body;
  let added = 0; let updated = 0;
  for (const row of items || []) {
    const unitName = String(getPayrollVal(row, 'unitName', 'واحد عملیاتی معدن', 'واحد معدن', 'واحد') || '').trim();
    const rawPeriod = getPayrollVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه');
    const period = parseYearMonthServer(rawPeriod, '1403-08');
    if (!unitName) continue;
    if (!canCeo && !isDispatchingOrUnitAllowed(req.authUser, unitName)) continue;
    const activityType = String(getPayrollVal(row, 'activityType', 'نوع عملیات / فعالیت', 'نوع عملیات', 'عملیات') || 'عملیات معدنی').trim();
    const metricTitle = String(getPayrollVal(row, 'metricTitle', 'عنوان شاخص حجم', 'عنوان شاخص', 'شرح عملیات') || activityType).trim();
    const volumeValue = parseNumPayroll(getPayrollVal(row, 'volumeValue', 'حجم محقق‌شده ماه', 'حجم محقق شده', 'حجم', 'مقدار'));
    const targetVolume = parseNumPayroll(getPayrollVal(row, 'targetVolume', 'برنامه / هدف ماه', 'برنامه ماه', 'هدف ماه', 'هدف'));
    const unitLabel = String(getPayrollVal(row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') || 'تن').trim();
    const status = String(getPayrollVal(row, 'status', 'وضعیت تحقق', 'وضعیت') || (targetVolume > 0 && volumeValue >= targetVolume ? 'فراتر از برنامه' : 'در حال اجرا')).trim();
    const notes = String(getPayrollVal(row, 'notes', 'توضیحات', 'یادداشت') || '').trim();
    const idx = db.miningVolumes.findIndex((v: any) => v.period === period && normPayrollKey(v.unitName) === normPayrollKey(unitName) && normPayrollKey(v.metricTitle) === normPayrollKey(metricTitle));
    const rec = {
      id: idx >= 0 ? db.miningVolumes[idx].id : `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      period, unitName, activityType, metricTitle, volumeValue, targetVolume, unitLabel, status, notes,
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) { db.miningVolumes[idx] = rec; updated++; }
    else { db.miningVolumes.push(rec); added++; }
  }
  await persistDatabase(db);
  return res.json({ success: true, message: `آمار حجم عملیات وارد شد (${added} جدید، ${updated} به‌روزرسانی).` });
});

app.delete('/api/mining-volumes/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'delete')) {
    return res.status(403).json({ success: false, message: 'شما مجوز حذف آمار حجم عملیات را ندارید.' });
  }
  const db = loadDatabase();
  const target = (db.miningVolumes || []).find((v: any) => v.id === req.params.id);
  if (target && !checkPermission(req.authUser, 'ceoDashboard', 'delete') && !isDispatchingOrUnitAllowed(req.authUser, target.unitName)) {
    return res.status(403).json({ success: false, message: 'دسترسی حذف برای این واحد محدود شده است.' });
  }
  db.miningVolumes = (db.miningVolumes || []).filter((v: any) => v.id !== req.params.id);
  await persistDatabase(db);
  return res.json({ success: true, message: 'ردیف آمار حجم حذف شد.' });
});

app.post('/api/mining-volumes/batch-delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'delete')) {
    return res.status(403).json({ success: false, message: 'شما مجوز حذف گروهی آمار حجم را ندارید.' });
  }
  const db = loadDatabase();
  const idSet = new Set((req.body?.ids || []).map(String));
  const canAll = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'ceoDashboard', 'delete');
  const before = (db.miningVolumes || []).length;
  db.miningVolumes = (db.miningVolumes || []).filter((v: any) => {
    if (!idSet.has(v.id)) return true;
    return !canAll && !isDispatchingOrUnitAllowed(req.authUser, v.unitName);
  });
  const deletedCount = before - db.miningVolumes.length;
  await persistDatabase(db);
  return res.json({ success: true, deletedCount, message: `${deletedCount} ردیف آمار حجم حذف شد.` });
});

app.post('/api/mining-volumes/delete-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'deleteAll')) {
    return res.status(403).json({ success: false, message: 'شما مجوز پاکسازی کامل آمار حجم عملیات را ندارید.' });
  }
  createSafetySnapshot('pre_delete_all_mining_volumes');
  const db = loadDatabase();
  const canAll = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'ceoDashboard', 'deleteAll');
  const before = (db.miningVolumes || []).length;
  db.miningVolumes = canAll
    ? []
    : (db.miningVolumes || []).filter((v: any) => !isDispatchingOrUnitAllowed(req.authUser, v.unitName));
  const deletedCount = before - db.miningVolumes.length;
  await persistDatabase(db);
  return res.json({ success: true, deletedCount, message: `جدول آمار حجم عملیات (${deletedCount} ردیف) پاکسازی شد.` });
});

app.get('/api/mining-machinery', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  let records = db.miningMachinery || [];
  if (!isSuperAdminUser(req.authUser) && !checkPermission(req.authUser, 'ceoDashboard', 'view')) {
    records = records.filter((m: any) => isWorkshopOrUnitAllowed(req.authUser, m.unitName));
  }
  res.json({ success: true, data: records });
});

app.post('/api/mining-machinery', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const body = req.body || {};
  const action = body.id ? 'edit' : 'create';
  const hasCeoPerm = checkPermission(req.authUser, 'ceoDashboard', action);
  const hasUnitPerm = checkPermission(req.authUser, 'unitOperations', action) && isWorkshopOrUnitAllowed(req.authUser, body.unitName);
  if (!hasCeoPerm && !hasUnitPerm) {
    return res.status(403).json({ success: false, message: 'عدم دسترسی ثبت یا ویرایش وضعیت ماشین‌آلات.' });
  }
  if (!body.machineCode || !body.machineName) {
    return res.status(400).json({ success: false, message: 'کد دستگاه و نام تجهیز الزامی است.' });
  }
  if (!Array.isArray(db.miningMachinery)) db.miningMachinery = [];
  const idx = body.id
    ? db.miningMachinery.findIndex((m: any) => m.id === body.id)
    : db.miningMachinery.findIndex((m: any) => String(m.machineCode).trim() === String(body.machineCode).trim());
  const rawStatus = String(body.status || 'آماده به کار').trim();
  const status = rawStatus.includes('خراب') || rawStatus.includes('تعمیرگاه')
    ? 'خراب / در تعمیرگاه'
    : rawStatus.includes('قطعه')
    ? 'در انتظار قطعه'
    : rawStatus.includes('سرویس')
    ? 'سرویس دوره‌ای'
    : 'آماده به کار';
  const rec = {
    id: idx >= 0 ? db.miningMachinery[idx].id : `mm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    machineCode: String(body.machineCode).trim(),
    machineName: String(body.machineName).trim(),
    machineType: String(body.machineType || 'تجهیز معدنی').trim(),
    unitName: String(body.unitName || 'استخراج و معدن‌کاری').trim(),
    status,
    issueDescription: String(body.issueDescription || '').trim(),
    stoppedSince: String(body.stoppedSince || '').trim(),
    estimatedReadyDate: String(body.estimatedReadyDate || '').trim(),
    operatorName: String(body.operatorName || '').trim(),
    notes: String(body.notes || '').trim(),
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };
  if (idx >= 0) db.miningMachinery[idx] = rec; else db.miningMachinery.push(rec);
  await persistDatabase(db);
  return res.json({ success: true, data: rec, message: 'وضعیت دستگاه و تعمیرگاه ذخیره شد.' });
});

app.post('/api/mining-machinery/batch-import', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const canCeo = checkPermission(req.authUser, 'ceoDashboard', 'importExcel') || checkPermission(req.authUser, 'ceoDashboard', 'create');
  const canUnit = checkPermission(req.authUser, 'unitOperations', 'importExcel') || checkPermission(req.authUser, 'unitOperations', 'create');
  if (!canCeo && !canUnit) {
    return res.status(403).json({ success: false, message: 'عدم دسترسی ورود اکسل ماشین‌آلات.' });
  }
  const db = loadDatabase();
  if (!Array.isArray(db.miningMachinery)) db.miningMachinery = [];
  const { items } = req.body;
  let added = 0; let updated = 0;
  for (const row of items || []) {
    const machineCode = String(getPayrollVal(row, 'machineCode', 'کد دستگاه / پلاک', 'کد دستگاه', 'کد تجهیز', 'پلاک تجهیز') || '').trim();
    const machineName = String(getPayrollVal(row, 'machineName', 'نام و مدل دستگاه', 'نام دستگاه', 'مدل دستگاه') || '').trim();
    if (!machineCode || !machineName) continue;
    const unitName = String(getPayrollVal(row, 'unitName', 'واحد مستقر / بهره‌بردار', 'واحد مستقر', 'واحد') || 'استخراج و معدن‌کاری').trim();
    if (!canCeo && !isWorkshopOrUnitAllowed(req.authUser, unitName)) continue;
    const rawStatus = String(getPayrollVal(row, 'status', 'وضعیت دستگاه', 'وضعیت') || 'آماده به کار').trim();
    const status = rawStatus.includes('خراب') || rawStatus.includes('تعمیرگاه')
      ? 'خراب / در تعمیرگاه'
      : rawStatus.includes('قطعه')
      ? 'در انتظار قطعه'
      : rawStatus.includes('سرویس')
      ? 'سرویس دوره‌ای'
      : 'آماده به کار';
    const idx = db.miningMachinery.findIndex((m: any) => String(m.machineCode).trim() === machineCode);
    const rec = {
      id: idx >= 0 ? db.miningMachinery[idx].id : `mm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      machineCode, machineName,
      machineType: String(getPayrollVal(row, 'machineType', 'نوع ماشین‌آلات', 'نوع دستگاه') || 'تجهیز معدنی').trim(),
      unitName,
      status,
      issueDescription: String(getPayrollVal(row, 'issueDescription', 'شرح خرابی / وضعیت تعمیر', 'شرح خرابی') || '').trim(),
      stoppedSince: String(getPayrollVal(row, 'stoppedSince', 'تاریخ توقف / ورود به تعمیرگاه', 'تاریخ توقف') || '').trim(),
      estimatedReadyDate: String(getPayrollVal(row, 'estimatedReadyDate', 'تاریخ تخمینی آماده‌به‌کار', 'تاریخ آماده به کار') || '').trim(),
      operatorName: String(getPayrollVal(row, 'operatorName', 'اپراتور / مسئول تعمیر', 'اپراتور') || '').trim(),
      notes: String(getPayrollVal(row, 'notes', 'یادداشت', 'توضیحات') || '').trim(),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) { db.miningMachinery[idx] = rec; updated++; }
    else { db.miningMachinery.push(rec); added++; }
  }
  await persistDatabase(db);
  return res.json({ success: true, message: `لیست ماشین‌آلات و تعمیرگاه وارد شد (${added} جدید، ${updated} به‌روزرسانی).` });
});

app.delete('/api/mining-machinery/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'delete')) {
    return res.status(403).json({ success: false, message: 'شما مجوز حذف ماشین‌آلات را ندارید.' });
  }
  const db = loadDatabase();
  const target = (db.miningMachinery || []).find((m: any) => m.id === req.params.id);
  if (target && !checkPermission(req.authUser, 'ceoDashboard', 'delete') && !isWorkshopOrUnitAllowed(req.authUser, target.unitName)) {
    return res.status(403).json({ success: false, message: 'دسترسی حذف برای این واحد محدود شده است.' });
  }
  db.miningMachinery = (db.miningMachinery || []).filter((m: any) => m.id !== req.params.id);
  await persistDatabase(db);
  return res.json({ success: true, message: 'دستگاه از فهرست حذف شد.' });
});

app.post('/api/mining-machinery/batch-delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'delete')) {
    return res.status(403).json({ success: false, message: 'شما مجوز حذف گروهی ماشین‌آلات را ندارید.' });
  }
  const db = loadDatabase();
  const idSet = new Set((req.body?.ids || []).map(String));
  const canAll = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'ceoDashboard', 'delete');
  const before = (db.miningMachinery || []).length;
  db.miningMachinery = (db.miningMachinery || []).filter((m: any) => {
    if (!idSet.has(m.id)) return true;
    return !canAll && !isWorkshopOrUnitAllowed(req.authUser, m.unitName);
  });
  const deletedCount = before - db.miningMachinery.length;
  await persistDatabase(db);
  return res.json({ success: true, deletedCount, message: `${deletedCount} دستگاه حذف شد.` });
});

app.post('/api/mining-machinery/delete-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'deleteAll')) {
    return res.status(403).json({ success: false, message: 'شما مجوز پاکسازی لیست ماشین‌آلات را ندارید.' });
  }
  createSafetySnapshot('pre_delete_all_mining_machinery');
  const db = loadDatabase();
  const canAll = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'ceoDashboard', 'deleteAll');
  const before = (db.miningMachinery || []).length;
  db.miningMachinery = canAll
    ? []
    : (db.miningMachinery || []).filter((m: any) => !isWorkshopOrUnitAllowed(req.authUser, m.unitName));
  const deletedCount = before - db.miningMachinery.length;
  await persistDatabase(db);
  return res.json({ success: true, deletedCount, message: `لیست ماشین‌آلات و تعمیرگاه (${deletedCount} دستگاه) پاکسازی شد.` });
});

// 7C. Per-Unit Operational Reports & Excel Uploads (گزارش‌های عملیاتی واحدهای معدن)
app.get('/api/unit-reports', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'view')) {
    return res.json({ success: true, data: [] });
  }
  const db = loadDatabase();
  const { period, unitName } = req.query;
  let records = db.unitReports || [];
  if (period) records = records.filter((r: any) => r.period === period);
  if (unitName) records = records.filter((r: any) => normPayrollKey(String(r.unitName || '')) === normPayrollKey(String(unitName)));
  if (!isSuperAdminUser(req.authUser) && !checkPermission(req.authUser, 'ceoDashboard', 'view')) {
    records = records.filter((r: any) => isUnitAllowedForUser(req.authUser, r.unitName));
  }
  res.json({ success: true, data: records });
});

app.post('/api/unit-reports', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const body = req.body || {};
  const action = body.id ? 'edit' : 'create';
  const hasCeoPerm = checkPermission(req.authUser, 'ceoDashboard', action);
  const hasUnitPerm = checkPermission(req.authUser, 'unitOperations', action) && isUnitAllowedForUser(req.authUser, body.unitName);
  if (!hasCeoPerm && !hasUnitPerm) {
    return res.status(403).json({ success: false, message: 'عدم دسترسی ثبت یا ویرایش گزارش عملیاتی واحد.' });
  }
  if (!body.period || !body.unitName || !body.metricName) {
    return res.status(400).json({ success: false, message: 'دوره، نام واحد و عنوان شاخص / فعالیت الزامی است.' });
  }
  if (!Array.isArray(db.unitReports)) db.unitReports = [];
  const actualValue = Number(body.actualValue || 0);
  const previousValue = Number(body.previousValue || 0);
  const targetValue = Number(body.targetValue || 0);
  const idx = body.id ? db.unitReports.findIndex((r: any) => r.id === body.id) : -1;
  const sanitizedRaw: Record<string, string | number> = {};
  if (body.rawFields && typeof body.rawFields === 'object') {
    for (const [k, v] of Object.entries(body.rawFields).slice(0, 100)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        sanitizedRaw[String(k).slice(0, 120)] = typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : String(v).slice(0, 300);
      }
    }
  }
  const rec = {
    id: idx >= 0 ? db.unitReports[idx].id : `ur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    period: String(body.period).trim(),
    unitName: String(body.unitName).trim(),
    reportCategory: String(body.reportCategory || 'گزارش عملیاتی واحد').trim(),
    metricName: String(body.metricName).trim(),
    actualValue: Number.isFinite(actualValue) ? actualValue : 0,
    previousValue: Number.isFinite(previousValue) ? previousValue : 0,
    targetValue: Number.isFinite(targetValue) ? targetValue : 0,
    unitLabel: String(body.unitLabel || 'عدد').trim(),
    status: String(body.status || 'تایید شده').trim(),
    submittedBy: String(body.submittedBy || req.authUser?.fullName || '').trim(),
    notes: String(body.notes || '').trim(),
    rawFields: sanitizedRaw,
    updatedAt: new Date().toLocaleDateString('fa-IR'),
  };
  if (idx >= 0) db.unitReports[idx] = rec; else db.unitReports.push(rec);
  await persistDatabase(db);
  return res.json({ success: true, data: rec, message: 'گزارش عملیاتی واحد با موفقیت ذخیره شد.' });
});

app.post('/api/unit-reports/batch-import', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const canCeo = checkPermission(req.authUser, 'ceoDashboard', 'importExcel') || checkPermission(req.authUser, 'ceoDashboard', 'create');
  const canUnit = checkPermission(req.authUser, 'unitOperations', 'importExcel') || checkPermission(req.authUser, 'unitOperations', 'create');
  if (!canCeo && !canUnit) {
    return res.status(403).json({ success: false, message: 'عدم دسترسی ورود اکسل گزارش واحدها.' });
  }
  const db = loadDatabase();
  if (!Array.isArray(db.unitReports)) db.unitReports = [];
  const { items, unitName: defaultUnitName, period: defaultPeriod, reportCategory: defaultCategory } = req.body || {};
  let added = 0; let updated = 0;
  for (const row of items || []) {
    if (!row || typeof row !== 'object') continue;
    const unitName = String(getPayrollVal(row, 'unitName', 'واحد عملیاتی معدن', 'نام واحد', 'واحد', 'بخش') || defaultUnitName || '').trim();
    const rawPeriod = getPayrollVal(row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه');
    const period = parseYearMonthServer(rawPeriod || defaultPeriod || '1403-08', '1403-08');
    const metricName = String(getPayrollVal(row, 'metricName', 'عنوان شاخص / فعالیت', 'شرح شاخص', 'فعالیت', 'عنوان', 'موضوع') || '').trim();
    if (!unitName || !metricName) continue;
    if (!canCeo && !isUnitAllowedForUser(req.authUser, unitName)) continue;

    const reportCategory = String(getPayrollVal(row, 'reportCategory', 'دسته‌بندی گزارش', 'نوع گزارش', 'گروه فعالیت') || defaultCategory || 'گزارش عملیاتی واحد').trim();
    const actualValue = parseNumPayroll(getPayrollVal(row, 'actualValue', 'مقدار محقق‌شده', 'عملکرد ماه جاری', 'عملکرد', 'مقدار', 'مقدار فعلی'));
    const previousValue = parseNumPayroll(getPayrollVal(row, 'previousValue', 'مقدار ماه قبل', 'عملکرد ماه قبل', 'دوره قبل'));
    const targetValue = parseNumPayroll(getPayrollVal(row, 'targetValue', 'هدف / برنامه', 'برنامه ماه', 'هدف'));
    const unitLabel = String(getPayrollVal(row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') || 'عدد').trim();
    const status = String(getPayrollVal(row, 'status', 'وضعیت گزارش', 'وضعیت') || 'تایید شده').trim();
    const submittedBy = String(getPayrollVal(row, 'submittedBy', 'ثبت‌کننده / مسئول واحد', 'مسئول واحد', 'ثبت‌کننده') || req.authUser?.fullName || '').trim();
    const notes = String(getPayrollVal(row, 'notes', 'توضیحات / تحلیل واحد', 'توضیحات', 'یادداشت') || '').trim();

    const rawFields: Record<string, string | number> = {};
    const incomingRaw = (row.rawFields && typeof row.rawFields === 'object') ? row.rawFields : row;
    for (const [k, v] of Object.entries(incomingRaw).slice(0, 100)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        rawFields[String(k).slice(0, 120)] = typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : String(v).slice(0, 300);
      }
    }

    const idx = db.unitReports.findIndex(
      (r: any) => r.period === period && normPayrollKey(r.unitName) === normPayrollKey(unitName) && normPayrollKey(r.metricName) === normPayrollKey(metricName)
    );
    const rec = {
      id: idx >= 0 ? db.unitReports[idx].id : `ur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      period, unitName, reportCategory, metricName, actualValue, previousValue, targetValue, unitLabel, status, submittedBy, notes, rawFields,
      updatedAt: new Date().toLocaleDateString('fa-IR'),
    };
    if (idx >= 0) { db.unitReports[idx] = rec; updated++; }
    else { db.unitReports.push(rec); added++; }
  }
  await persistDatabase(db);
  return res.json({ success: true, message: `گزارش اکسل واحدها با موفقیت ثبت شد (${added} جدید، ${updated} به‌روزرسانی).` });
});

app.delete('/api/unit-reports/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'delete')) {
    return res.status(403).json({ success: false, message: 'شما مجوز حذف گزارش واحد را ندارید.' });
  }
  const db = loadDatabase();
  const target = (db.unitReports || []).find((r: any) => r.id === req.params.id);
  if (target && !checkPermission(req.authUser, 'ceoDashboard', 'delete') && !isUnitAllowedForUser(req.authUser, target.unitName)) {
    return res.status(403).json({ success: false, message: 'دسترسی حذف برای این واحد محدود شده است.' });
  }
  db.unitReports = (db.unitReports || []).filter((r: any) => r.id !== req.params.id);
  await persistDatabase(db);
  return res.json({ success: true, message: 'ردیف گزارش عملیاتی واحد حذف شد.' });
});

app.post('/api/unit-reports/batch-delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'delete')) {
    return res.status(403).json({ success: false, message: 'شما مجوز حذف گروهی گزارش واحدها را ندارید.' });
  }
  const db = loadDatabase();
  const idSet = new Set((req.body?.ids || []).map(String));
  const canAll = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'ceoDashboard', 'delete');
  const before = (db.unitReports || []).length;
  db.unitReports = (db.unitReports || []).filter((r: any) => {
    if (!idSet.has(r.id)) return true;
    return !canAll && !isUnitAllowedForUser(req.authUser, r.unitName);
  });
  const deletedCount = before - db.unitReports.length;
  await persistDatabase(db);
  return res.json({ success: true, deletedCount, message: `${deletedCount} ردیف گزارش واحد حذف شد.` });
});

app.post('/api/unit-reports/delete-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!hasMiningOrUnitPerm(req.authUser, 'deleteAll')) {
    return res.status(403).json({ success: false, message: 'شما مجوز پاکسازی کامل گزارش واحدها را ندارید.' });
  }
  createSafetySnapshot('pre_delete_all_unit_reports');
  const db = loadDatabase();
  const canAll = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'ceoDashboard', 'deleteAll');
  const before = (db.unitReports || []).length;
  db.unitReports = canAll
    ? []
    : (db.unitReports || []).filter((r: any) => !isUnitAllowedForUser(req.authUser, r.unitName));
  const deletedCount = before - db.unitReports.length;
  await persistDatabase(db);
  return res.json({ success: true, deletedCount, message: `گزارش‌های واحدهای عملیاتی (${deletedCount} ردیف) پاکسازی شد.` });
});

// 8. Database Status, Backup & Restore
app.get('/api/database/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  let fileSize = 0;
  let lastSaved = 'ثبت نشده';

  try {
    if (fs.existsSync(DB_FILE)) {
      const stats = fs.statSync(DB_FILE);
      fileSize = stats.size;
      lastSaved = new Date(stats.mtime).toLocaleString('fa-IR');
    }
  } catch {
    // ignore
  }

  const payrollPeriodsCount = new Set((db.payroll || []).map((p: any) => p.period).filter(Boolean)).size;
  const karanehPeriodsCount = new Set((db.karaneh || []).map((k: any) => k.period).filter(Boolean)).size;
  const totalPersonnelWithDocs = (db.personnel || []).filter((p: any) => {
    const d = p.documents || {};
    return Boolean(d.nationalCardImage || (d.shenasnamehPages && d.shenasnamehPages.length > 0));
  }).length;
  const totalActiveUsers = (db.users || []).filter((u: any) => u.isActive !== false).length;
  const totalRelatives = (db.personnel || []).reduce((sum: number, p: any) => sum + (Array.isArray(p.relatives) ? p.relatives.length : 0), 0);

  const canStats = isSuperAdminUser(req.authUser) || checkPermission(req.authUser, 'system', 'dashboardStats') || checkPermission(req.authUser, 'system', 'backupDatabase') || checkPermission(req.authUser, 'system', 'restoreDatabase');
  const canPers = canStats || checkPermission(req.authUser, 'personnel', 'view');
  const canKar = canStats || checkPermission(req.authUser, 'karaneh', 'view');
  const canPay = canStats || checkPermission(req.authUser, 'payroll', 'view');
  const canUsers = canStats || checkPermission(req.authUser, 'users', 'view');
  const canJg = canStats || checkPermission(req.authUser, 'jobGroups', 'view');
  const canCmt = canStats || checkPermission(req.authUser, 'commitments', 'view');
  const canMining = canStats || hasMiningOrUnitPerm(req.authUser, 'view');

  res.json({
    success: true,
    data: {
      storageLocation: 'سرور ابری و پایگاه داده مرکزی',
      totalPersonnel: canPers ? (db.personnel || []).length : 0,
      totalRelatives: canPers ? totalRelatives : 0,
      totalKaranehRecords: canKar ? (db.karaneh || []).length : 0,
      totalPayrollRecords: canPay ? (db.payroll || []).length : 0,
      totalUsers: canUsers ? (db.users || []).length : 0,
      totalActiveUsers: canUsers ? totalActiveUsers : 0,
      totalPersonnelWithDocs: canPers ? totalPersonnelWithDocs : 0,
      payrollPeriodsCount: canPay ? payrollPeriodsCount : 0,
      karanehPeriodsCount: canKar ? karanehPeriodsCount : 0,
      totalJobGroups: canJg ? (db.jobGroups || []).length : 0,
      totalJobClassifications: canJg ? (db.jobClassifications || []).length : 0,
      totalCommitments: canCmt ? (db.commitments || []).length : 0,
      totalArchivedCommitments: canCmt ? (db.commitments || []).filter((c: any) => c.isArchived).length : 0,
      totalMiningVolumes: canMining ? (db.miningVolumes || []).length : 0,
      totalMiningMachinery: canMining ? (db.miningMachinery || []).length : 0,
      totalUnitReports: canMining ? (db.unitReports || []).length : 0,
      storageEngine: isPostgresConfigured() ? 'postgres+disk' : 'node-disk',
      fileSizeBytes: canStats ? fileSize : 0,
      lastSaved,
      isLocalHost: true,
      hostPlatform: process.platform,
      authProtected: true,
      firebaseProjectId: firebaseConfig.projectId || '',
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '',
      schemaVersion: '5.0-negin-parto-nasr-units-hub',
    }
  });
});

app.get('/api/database/export-snapshot', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!isSuperAdminUser(req.authUser) && !checkPermission(req.authUser, 'system', 'backupDatabase')) {
    return res.status(403).json({ success: false, message: 'شما مجوز دریافت اسنپ‌شات همگام‌سازی را ندارید.' });
  }
  const db = loadDatabase();
  const safeUsers = (db.users || []).map(sanitizeUserServer);
  res.json({
    success: true,
    data: {
      users: safeUsers,
      personnel: db.personnel || [],
      karaneh: db.karaneh || [],
      jobGroups: db.jobGroups || [],
      jobClassifications: db.jobClassifications || [],
      commitments: db.commitments || [],
      payroll: db.payroll || [],
      miningVolumes: db.miningVolumes || [],
      miningMachinery: db.miningMachinery || [],
      unitReports: db.unitReports || [],
    },
  });
});

app.post('/api/database/merge-firestore', requireAuth, requirePerm('system', 'restoreDatabase'), async (req: AuthenticatedRequest, res: Response) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ success: false, message: 'ساختار داده‌های ارسالی نامعتبر است.' });
  }

  createSafetySnapshot('before_firestore_merge');
  const db = loadDatabase();

  const mergeById = (existingArr: any[], incomingArr: any[]) => {
    const map = new Map<string, any>();
    for (const item of existingArr || []) {
      if (item && item.id) map.set(String(item.id), item);
    }
    for (const item of incomingArr || []) {
      if (!item || !item.id) continue;
      const prev = map.get(String(item.id)) || {};
      map.set(String(item.id), { ...prev, ...item });
    }
    return Array.from(map.values());
  };

  if (Array.isArray(incoming.personnel)) db.personnel = mergeById(db.personnel, incoming.personnel);
  if (Array.isArray(incoming.karaneh)) db.karaneh = mergeById(db.karaneh, incoming.karaneh);
  if (Array.isArray(incoming.jobGroups)) db.jobGroups = mergeById(db.jobGroups, incoming.jobGroups);
  if (Array.isArray(incoming.jobClassifications)) db.jobClassifications = mergeById(db.jobClassifications, incoming.jobClassifications);
  if (Array.isArray(incoming.commitments)) db.commitments = mergeById(db.commitments, incoming.commitments);
  if (Array.isArray(incoming.payroll)) db.payroll = mergeById(db.payroll, incoming.payroll);
  if (Array.isArray(incoming.miningVolumes)) db.miningVolumes = mergeById(db.miningVolumes || [], incoming.miningVolumes);
  if (Array.isArray(incoming.miningMachinery)) db.miningMachinery = mergeById(db.miningMachinery || [], incoming.miningMachinery);
  if (Array.isArray(incoming.unitReports)) db.unitReports = mergeById(db.unitReports || [], incoming.unitReports);

  if (Array.isArray(incoming.users)) {
    const userMap = new Map<string, any>();
    for (const u of db.users || []) {
      if (u && u.id) userMap.set(String(u.id), u);
    }
    for (const u of incoming.users) {
      if (!u || !u.id || u.username === 'javadabadiyan') continue;
      const prev = userMap.get(String(u.id));
      userMap.set(
        String(u.id),
        prev
          ? { ...prev, ...u, password: prev.password }
          : { ...u, password: hashPassword('12345678') }
      );
    }
    db.users = Array.from(userMap.values());
  }

  try {
    await persistDatabase(db);
    return res.json({ success: true, message: 'اطلاعات ابری با موفقیت در پایگاه داده ادغام و ذخیره شد.' });
  } catch (err) {
    console.error('Failed to merge Firestore snapshot:', err);
    return res.status(500).json({ success: false, message: 'خطا در ادغام و ذخیره‌سازی اطلاعات در پایگاه داده.' });
  }
});

app.get('/api/database/backup', requireAuth, requirePerm('system', 'backupDatabase'), (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const totalRelatives = (db.personnel || []).reduce((sum: number, p: any) => sum + (Array.isArray(p.relatives) ? p.relatives.length : 0), 0);
  const backupPayload = {
    ...db,
    _backupMetadata: {
      version: '5.0-negin-parto-nasr-units-hub',
      exportedAt: new Date().toISOString(),
      modules: ['personnel', 'relatives', 'documents', 'karaneh', 'payroll', 'jobGroups', 'jobClassifications', 'commitments', 'users', 'smartDashboard', 'ceoDashboard', 'unitOperations', 'miningVolumes', 'miningMachinery', 'unitReports', 'smartExcel'],
      counts: {
        users: (db.users || []).length,
        personnel: (db.personnel || []).length,
        relatives: totalRelatives,
        karaneh: (db.karaneh || []).length,
        payroll: (db.payroll || []).length,
        jobGroups: (db.jobGroups || []).length,
        jobClassifications: (db.jobClassifications || []).length,
        commitments: (db.commitments || []).length,
        miningVolumes: (db.miningVolumes || []).length,
        miningMachinery: (db.miningMachinery || []).length,
        unitReports: (db.unitReports || []).length,
      },
    },
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=hr_database_backup_${Date.now()}.json`);
  res.send(JSON.stringify(backupPayload, null, 2));
});

app.post('/api/database/restore', requireAuth, requirePerm('system', 'restoreDatabase'), async (req: AuthenticatedRequest, res: Response) => {
  const incomingBackup = req.body;
  if (!incomingBackup || !Array.isArray(incomingBackup.users) || !Array.isArray(incomingBackup.personnel)) {
    return res.status(400).json({ success: false, message: 'ساختار فایل پشتیبان معتبر نیست.' });
  }

  createSafetySnapshot('before_restore');
  const { _backupMetadata: _meta, ...backup } = incomingBackup;
  // Re-hash any legacy plaintext passwords inside restored backup
  for (const u of backup.users) {
    if (u.password && !String(u.password).startsWith('scrypt$')) {
      u.password = hashPassword(String(u.password));
    }
  }
  try {
    await persistDatabase(backup);
    return res.json({ success: true, message: 'پایگاه داده سیستم (تمامی ماژول‌ها، مجوزها و اسناد) با موفقیت بازیابی گردید.' });
  } catch (err) {
    console.error('Failed to restore database:', err);
    return res.status(500).json({ success: false, message: 'خطا در بازیابی پایگاه داده.' });
  }
});

app.post('/api/database/reset-demo', requireAuth, requirePerm('system', 'restoreDatabase'), async (req: AuthenticatedRequest, res: Response) => {
  createSafetySnapshot('before_reset_demo');
  const initial = getInitialDatabase();
  try {
    await persistDatabase(initial);
    return res.json({ success: true, message: 'داده‌های اولیه و دمو با موفقیت بازنشانی شدند (بکاپ خودکار از اطلاعات قبلی ذخیره شد).' });
  } catch (err) {
    console.error('Failed to reset demo database:', err);
    return res.status(500).json({ success: false, message: 'خطا در بازنشانی پایگاه داده.' });
  }
});

const EMAIL_BACKUP_CONFIG_FILE = path.join(DATA_DIR, 'email_backup_config.json');

interface EmailBackupConfig {
  enabled: boolean;
  recipientEmail: string;
  dailyHour: number;
  dailyMinute: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  lastSentDateKey: string;
  lastSentAt: string;
  lastAutoAttemptDateKey?: string;
  lastStatus: '' | 'success' | 'error';
  lastError: string;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:'"]+@[^\s@<>()[\]\\,;:'"]+\.[^\s@<>()[\]\\,;:'"]{2,}$/;
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$|^localhost$|^(?:\d{1,3}\.){3}\d{1,3}$/;

function isValidEmailAddress(value: string): boolean {
  return EMAIL_RE.test(String(value || '').trim());
}

function isValidSmtpHost(value: string): boolean {
  const host = String(value || '').trim();
  return Boolean(host) && HOSTNAME_RE.test(host);
}

function isValidSmtpPort(value: unknown): boolean {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function loadEmailBackupConfig(): EmailBackupConfig {
  const defaultHost = isValidSmtpHost(process.env.SMTP_HOST || '')
    ? String(process.env.SMTP_HOST).trim()
    : 'smtp.gmail.com';
  const defaultPort = isValidSmtpPort(process.env.SMTP_PORT)
    ? Number(process.env.SMTP_PORT)
    : 465;
  const defaultRecipient = isValidEmailAddress(process.env.BACKUP_RECIPIENT_EMAIL || '')
    ? String(process.env.BACKUP_RECIPIENT_EMAIL).trim()
    : 'abadiyanjavad@gmail.com';
  const defaultSmtpUser = isValidEmailAddress(process.env.SMTP_USER || '')
    ? String(process.env.SMTP_USER).trim()
    : '';

  const defaults: EmailBackupConfig = {
    enabled: true,
    recipientEmail: defaultRecipient,
    dailyHour: 8,
    dailyMinute: 0,
    smtpHost: defaultHost,
    smtpPort: defaultPort,
    smtpSecure: process.env.SMTP_SECURE !== 'false',
    smtpUser: defaultSmtpUser,
    smtpPass: process.env.SMTP_PASS || '',
    lastSentDateKey: '',
    lastSentAt: '',
    lastAutoAttemptDateKey: '',
    lastStatus: '',
    lastError: '',
  };
  try {
    if (fs.existsSync(EMAIL_BACKUP_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(EMAIL_BACKUP_CONFIG_FILE, 'utf-8'));
      const rawRecipient = String(raw.recipientEmail || '').trim();
      const rawHost = String(raw.smtpHost || '').trim();
      const rawUser = String(raw.smtpUser || '').trim();
      const hasCorruptedFields =
        (rawRecipient && !isValidEmailAddress(rawRecipient)) ||
        (rawHost && !isValidSmtpHost(rawHost)) ||
        (raw.smtpPort !== undefined && !isValidSmtpPort(raw.smtpPort)) ||
        (rawUser && !isValidEmailAddress(rawUser));

      const sanitized: EmailBackupConfig = {
        ...defaults,
        ...raw,
        recipientEmail: isValidEmailAddress(rawRecipient) ? rawRecipient : defaults.recipientEmail,
        dailyHour: Number.isFinite(Number(raw.dailyHour)) ? Math.max(0, Math.min(23, Math.trunc(Number(raw.dailyHour)))) : 8,
        dailyMinute: Number.isFinite(Number(raw.dailyMinute)) ? Math.max(0, Math.min(59, Math.trunc(Number(raw.dailyMinute)))) : 0,
        smtpHost: isValidSmtpHost(rawHost) ? rawHost : defaults.smtpHost,
        smtpPort: isValidSmtpPort(raw.smtpPort) ? Number(raw.smtpPort) : defaults.smtpPort,
        smtpSecure: typeof raw.smtpSecure === 'boolean' ? raw.smtpSecure : defaults.smtpSecure,
        smtpUser: isValidEmailAddress(rawUser) ? rawUser : '',
        smtpPass: isValidEmailAddress(rawUser) && typeof raw.smtpPass === 'string' ? raw.smtpPass : '',
        lastStatus: hasCorruptedFields ? '' : (raw.lastStatus || ''),
        lastError: hasCorruptedFields ? '' : String(raw.lastError || ''),
      };

      if (hasCorruptedFields) {
        saveEmailBackupConfig(sanitized);
      }
      return sanitized;
    }
  } catch {
    // fallback to defaults
  }
  return defaults;
}

function saveEmailBackupConfig(cfg: EmailBackupConfig): void {
  fs.writeFileSync(EMAIL_BACKUP_CONFIG_FILE, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

function getTehranDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = parseInt(pick('hour'), 10);
  const minute = parseInt(pick('minute'), 10);
  return { dateKey, hour, minute };
}

function buildFullBackupPayload() {
  const db = loadDatabase();
  const totalRelatives = (db.personnel || []).reduce(
    (sum: number, p: any) => sum + (Array.isArray(p.relatives) ? p.relatives.length : 0),
    0
  );
  return {
    ...db,
    _backupMetadata: {
      version: '5.0-negin-parto-nasr-units-hub',
      exportedAt: new Date().toISOString(),
      modules: [
        'personnel', 'relatives', 'documents', 'karaneh', 'payroll',
        'jobGroups', 'jobClassifications', 'commitments', 'users',
        'smartDashboard', 'ceoDashboard', 'unitOperations',
        'miningVolumes', 'miningMachinery', 'unitReports', 'smartExcel',
      ],
      counts: {
        users: (db.users || []).length,
        personnel: (db.personnel || []).length,
        relatives: totalRelatives,
        karaneh: (db.karaneh || []).length,
        payroll: (db.payroll || []).length,
        jobGroups: (db.jobGroups || []).length,
        jobClassifications: (db.jobClassifications || []).length,
        commitments: (db.commitments || []).length,
        miningVolumes: (db.miningVolumes || []).length,
        miningMachinery: (db.miningMachinery || []).length,
        unitReports: (db.unitReports || []).length,
      },
    },
  };
}

let emailSendInProgress = false;

async function sendBackupEmailNow(trigger: 'manual' | 'daily_auto'): Promise<{ sentAt: string; recipientEmail: string }> {
  if (emailSendInProgress) {
    throw new Error('ارسال ایمیل پشتیبان در حال انجام است؛ چند ثانیه صبر کنید.');
  }
  const cfg = loadEmailBackupConfig();
  if (!cfg.recipientEmail || !isValidEmailAddress(cfg.recipientEmail)) {
    throw new Error('نشانی ایمیل گیرنده معتبر نیست.');
  }
  if (!cfg.smtpHost || !isValidSmtpHost(cfg.smtpHost) || !isValidSmtpPort(cfg.smtpPort)) {
    throw new Error('آدرس یا پورت سرور ارسال ایمیل (SMTP) معتبر نیست.');
  }
  if (!cfg.smtpUser || !isValidEmailAddress(cfg.smtpUser) || !cfg.smtpPass) {
    throw new Error('تنظیمات سرور ارسال ایمیل (SMTP User / App Password) هنوز تکمیل نشده است.');
  }

  emailSendInProgress = true;
  const { dateKey } = getTehranDateParts();
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: {
        user: cfg.smtpUser,
        pass: cfg.smtpPass,
      },
    });

    const payload = buildFullBackupPayload();
    const counts = payload._backupMetadata.counts;
    const jsonString = JSON.stringify(payload, null, 2);
    const sizeKb = (Buffer.byteLength(jsonString, 'utf-8') / 1024).toFixed(1);
    const faTime = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

    await transporter.sendMail({
      from: `"سامانه جامع شرکت نگین پرتو نصر" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `پشتیبان ${trigger === 'daily_auto' ? 'خودکار روزانه' : 'فوری'} سامانه نگین پرتو نصر — ${dateKey}`,
      html: `
        <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; line-height: 1.8; color: #0f172a; background: #f8fafc; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
            <h2 style="margin: 0 0 8px; color: #1e293b;">نسخه پشتیبان کامل سامانه جامع شرکت نگین پرتو نصر</h2>
            <p style="margin: 0 0 16px; color: #475569; font-size: 13px;">
              زمان ارسال (تهران): <b>${faTime}</b> | نوع ارسال: <b>${trigger === 'daily_auto' ? 'اتوماتیک روزانه' : 'ارسال دستی'}</b>
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;">تعداد پرسنل</td><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;"><b>${counts.personnel}</b></td></tr>
              <tr><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;">رکوردهای حقوق ۲۲۶ ستونی</td><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;"><b>${counts.payroll}</b></td></tr>
              <tr><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;">رکوردهای کارانه</td><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;"><b>${counts.karaneh}</b></td></tr>
              <tr><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;">آمار حجم عملیات و دیسپچینگ</td><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;"><b>${counts.miningVolumes}</b></td></tr>
              <tr><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;">ناوگان و تعمیرگاه</td><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;"><b>${counts.miningMachinery}</b></td></tr>
              <tr><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;">گزارش واحدهای معدن</td><td style="padding: 6px; border-bottom: 1px solid #f1f5f9;"><b>${counts.unitReports}</b></td></tr>
              <tr><td style="padding: 6px;">حجم فایل پیوست</td><td style="padding: 6px;"><b>${sizeKb} کیلوبایت</b></td></tr>
            </table>
            <p style="margin: 16px 0 0; font-size: 12px; color: #64748b;">
              فایل JSON کامل پایگاه داده در پیوست همین ایمیل قرار دارد و در صورت نیاز از بخش «پشتیبان‌گیری و بازیابی» قابل بازگردانی است.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `negin_parto_nasr_backup_${dateKey}.json`,
          content: jsonString,
          contentType: 'application/json',
        },
      ],
    });

    const updated: EmailBackupConfig = {
      ...cfg,
      lastSentDateKey: dateKey,
      lastSentAt: faTime,
      lastAutoAttemptDateKey: dateKey,
      lastStatus: 'success',
      lastError: '',
    };
    saveEmailBackupConfig(updated);
    return { sentAt: faTime, recipientEmail: cfg.recipientEmail };
  } catch (err: any) {
    const failed: EmailBackupConfig = {
      ...cfg,
      lastAutoAttemptDateKey: trigger === 'daily_auto' ? dateKey : cfg.lastAutoAttemptDateKey,
      lastStatus: 'error',
      lastError: err?.message || 'خطا در ارسال ایمیل SMTP',
    };
    saveEmailBackupConfig(failed);
    throw err;
  } finally {
    emailSendInProgress = false;
  }
}

app.get('/api/backup/email-config', requireAuth, requirePerm('system', 'backupDatabase'), (_req: AuthenticatedRequest, res: Response) => {
  const cfg = loadEmailBackupConfig();
  const { smtpPass, ...safeCfg } = cfg;
  res.json({
    success: true,
    data: {
      ...safeCfg,
      hasSmtpPass: Boolean(smtpPass),
    },
  });
});

app.post('/api/backup/email-config', requireAuth, requirePerm('system', 'backupDatabase'), (req: AuthenticatedRequest, res: Response) => {
  const current = loadEmailBackupConfig();
  const body = req.body || {};

  const recipientEmail = body.recipientEmail !== undefined
    ? String(body.recipientEmail).trim()
    : current.recipientEmail;
  if (!isValidEmailAddress(recipientEmail)) {
    return res.status(400).json({
      success: false,
      message: 'نشانی ایمیل گیرنده نامعتبر است.',
    });
  }

  const smtpHost = body.smtpHost !== undefined
    ? (String(body.smtpHost).trim() || 'smtp.gmail.com')
    : current.smtpHost;
  if (!isValidSmtpHost(smtpHost)) {
    return res.status(400).json({
      success: false,
      message: 'آدرس سرور SMTP نامعتبر است (مثال: smtp.gmail.com).',
    });
  }

  const rawPort = body.smtpPort !== undefined ? Number(body.smtpPort) : current.smtpPort;
  if (!isValidSmtpPort(rawPort)) {
    return res.status(400).json({
      success: false,
      message: 'شماره پورت SMTP باید بین ۱ تا ۶۵۵۳۵ باشد (مثال: ۴۶۵).',
    });
  }

  const smtpUser = body.smtpUser !== undefined
    ? String(body.smtpUser).trim()
    : current.smtpUser;
  if (smtpUser && !isValidEmailAddress(smtpUser)) {
    return res.status(400).json({
      success: false,
      message: 'نشانی ایمیل فرستنده (SMTP User) معتبر نیست.',
    });
  }

  const next: EmailBackupConfig = {
    ...current,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : current.enabled,
    recipientEmail,
    dailyHour: Number.isFinite(Number(body.dailyHour)) ? Math.max(0, Math.min(23, Math.trunc(Number(body.dailyHour)))) : current.dailyHour,
    dailyMinute: Number.isFinite(Number(body.dailyMinute)) ? Math.max(0, Math.min(59, Math.trunc(Number(body.dailyMinute)))) : current.dailyMinute,
    smtpHost,
    smtpPort: rawPort,
    smtpSecure: body.smtpSecure !== undefined ? Boolean(body.smtpSecure) : current.smtpSecure,
    smtpUser,
    smtpPass: body.smtpPass && String(body.smtpPass).trim() ? String(body.smtpPass).trim() : current.smtpPass,
    lastStatus: '',
    lastError: '',
  };
  saveEmailBackupConfig(next);
  const { smtpPass, ...safeNext } = next;
  res.json({
    success: true,
    message: 'تنظیمات ارسال خودکار روزانه بک‌آپ به ایمیل ذخیره شد.',
    data: { ...safeNext, hasSmtpPass: Boolean(smtpPass) },
  });
});

app.post('/api/backup/send-email-now', requireAuth, requirePerm('system', 'backupDatabase'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await sendBackupEmailNow('manual');
    res.json({
      success: true,
      message: `فایل پشتیبان کامل سامانه با موفقیت به ایمیل ${result.recipientEmail} ارسال شد.`,
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err?.message || 'خطا در ارسال ایمیل پشتیبان.',
    });
  }
});

function startDailyEmailBackupScheduler() {
  const checkAndSend = async () => {
    try {
      const cfg = loadEmailBackupConfig();
      if (
        !cfg.enabled ||
        !isValidEmailAddress(cfg.smtpUser) ||
        !cfg.smtpPass ||
        !isValidEmailAddress(cfg.recipientEmail) ||
        !isValidSmtpHost(cfg.smtpHost) ||
        !isValidSmtpPort(cfg.smtpPort)
      ) {
        return;
      }
      const { dateKey, hour, minute } = getTehranDateParts();
      if (cfg.lastSentDateKey === dateKey || cfg.lastAutoAttemptDateKey === dateKey) return;
      const currentTotalMinutes = hour * 60 + minute;
      const targetTotalMinutes = cfg.dailyHour * 60 + cfg.dailyMinute;
      if (currentTotalMinutes >= targetTotalMinutes) {
        await sendBackupEmailNow('daily_auto');
        console.log(`📧 Automated daily backup sent to ${cfg.recipientEmail} for ${dateKey}`);
      }
    } catch (err: any) {
      console.info('Daily auto-email backup skipped:', err?.message || err);
    }
  };
  // Check every 5 minutes
  setInterval(checkAndSend, 5 * 60 * 1000);
}

// Start server
async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  const hasBuiltClient = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV === 'production' && hasBuiltClient) {
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    if (process.env.NODE_ENV === 'production' && !hasBuiltClient) {
      console.warn('⚠️ dist/index.html not found; falling back to Vite middleware. Run "npm run build" for optimized production serving.');
    }
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  startDailyEmailBackupScheduler();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Persian HR & Karaneh Server running on http://0.0.0.0:${PORT}`);
    console.log(`📁 Local Database Disk File: ${DB_FILE}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
