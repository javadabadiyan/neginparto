import React, { useState } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  RefreshCw,
  Globe,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  Share2,
  Laptop,
  CloudLightning,
  ShieldCheck,
  Database,
  CloudUpload,
  CloudDownload,
  Chrome,
  GitBranch,
  KeyRound,
  Save,
  ShieldAlert,
  Trash2,
  PlugZap,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Sparkles,
  Shield
} from 'lucide-react';
import { DatabaseStatus } from '../types';
import { toPersianDigits } from '../utils/persian';
import { api, getDetectedEngine } from '../services/api';
import { FIREBASE_META } from '../firebase';
import {
  GitHubSyncConfig,
  GitHubConnectionTestResult,
  loadGitHubSyncConfig,
  saveGitHubSyncConfig,
  saveGitHubSyncConfigSecure,
  unlockGitHubVault,
  lockGitHubSession,
  isGitHubVaultLocked,
  evaluatePassphraseStrength,
  generateStrongPassphrase,
  clearGitHubSyncConfig,
  testGitHubConnection,
  pushDatabaseToGitHub,
  pullDatabaseFromGitHub
} from '../utils/githubSync';

interface LocalHostDatabaseModuleProps {
  dbStatus: DatabaseStatus | null;
  firebaseUserEmail?: string | null;
  firebaseSyncing?: boolean;
  onConnectGoogleFirebase?: () => Promise<boolean>;
  onSyncToFirestore?: () => Promise<boolean>;
  onPullFromFirestore?: () => Promise<boolean>;
  onRefreshStatus: () => void;
  onDataReload?: () => Promise<void>;
  onRestoreBackup: (backupData: any) => Promise<boolean>;
  onResetDemo: () => Promise<boolean>;
}

const PUBLIC_SHARED_URL = 'https://ais-pre-72pdyose4bfs767qpohz76-50203653211.europe-west2.run.app';

export const LocalHostDatabaseModule: React.FC<LocalHostDatabaseModuleProps> = ({
  dbStatus,
  firebaseUserEmail,
  firebaseSyncing = false,
  onConnectGoogleFirebase,
  onSyncToFirestore,
  onPullFromFirestore,
  onRefreshStatus,
  onDataReload,
  onRestoreBackup,
  onResetDemo
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'cloud_instant' | 'pc_direct' | 'github_isolated'>('github_isolated');
  const [ghConfig, setGhConfig] = useState<GitHubSyncConfig>(() => loadGitHubSyncConfig());
  const [ghSyncing, setGhSyncing] = useState(false);
  const [ghTesting, setGhTesting] = useState(false);
  const [ghTestResult, setGhTestResult] = useState<GitHubConnectionTestResult | null>(null);
  const [ghMessage, setGhMessage] = useState<{ type: 'success' | 'error'; text: string; url?: string } | null>(null);
  const [showGhToken, setShowGhToken] = useState(false);
  const [showGhPassphrase, setShowGhPassphrase] = useState(false);
  const [vaultLocked, setVaultLocked] = useState<boolean>(() => isGitHubVaultLocked());
  const [unlockPassInput, setUnlockPassInput] = useState('');
  const [unlockingVault, setUnlockingVault] = useState(false);
  const activeEngine = getDetectedEngine();
  const serverEngine = dbStatus?.storageEngine;
  const engineBadge =
    serverEngine === 'postgres+disk'
      ? 'ذخیره‌سازی مرکزی دائمی روی دیسک سرور + PostgreSQL (مستقل از مرورگر)'
      : serverEngine === 'node-disk'
      ? 'ذخیره‌سازی دائمی روی فایل دیسک سرور Node.js (مستقل از مرورگر و قابل اجرا روی هر سیستم)'
      : activeEngine === 'php' || serverEngine === 'php-disk'
      ? 'ذخیره‌سازی دائمی روی فایل داخل پوشه سایت PHP (مستقل از مرورگر و بدون نیاز به SQL)'
      : activeEngine === 'indexeddb'
      ? 'ذخیره‌سازی دائمی داخلی مرورگر (IndexedDB)'
      : 'ذخیره‌سازی مرکزی دائمی روی دیسک سرور (بدون وابستگی به مرورگر)';

  const liveAppUrl = window.location.origin.includes('localhost')
    ? PUBLIC_SHARED_URL
    : window.location.origin;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const downloadStartBat = () => {
    const content = `@echo off
chcp 65001 > nul
title سامانه کارگزینی و امور کارکنان
color 0b
echo ========================================================
echo    در حال راه اندازی سرور سامانه کارگزینی و کارانه
echo ========================================================
echo 1. بررسی پیش نیازها و نصب کتابخانه ها...
call npm install
echo.
echo 2. اجرای سرور پایگاه داده روی پورت 3000...
start http://localhost:3000
call npm start
pause
`;
    const blob = new Blob([content], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '1-اجرای_سامانه_روی_رایانه_شما.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTunnelBat = () => {
    const content = `@echo off
chcp 65001 > nul
title اتصال اینترنتی امن کلودفلر - سامانه کارگزینی
color 0a
echo ========================================================
echo    اتصال امن سیستم شما به اینترنت جهت ورود اطلاعات توسط دیگران
echo ========================================================
npx @cloudflare/cloudflared tunnel --url http://localhost:3000
pause
`;
    const blob = new Blob([content], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '2-اتصال_اینترنتی_برای_همکاران.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadLinuxMacSh = () => {
    const content = `#!/usr/bin/env bash
set -e
echo "========================================================"
echo "  سامانه جامع راهبردی شرکت نگین پرتو نصر (Linux / macOS)"
echo "========================================================"
echo "1. Installing dependencies..."
npm install
echo "2. Starting permanent self-contained server on port 3000..."
npm start
`;
    const blob = new Blob([content], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'run_portable_linux_mac.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackupDownload = async () => {
    const ok = await api.downloadBackup();
    if (!ok) {
      setRestoreError('خطا در دریافت نسخه پشتیبان. لطفاً دسترسی مدیر ارشد را بررسی کنید.');
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError('');
    setRestoreSuccess('');
    setRestoreLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);
        if (!json.personnel || !json.users) {
          throw new Error('ساختار فایل پشتیبان معتبر نیست.');
        }
        const ok = await onRestoreBackup(json);
        if (ok) {
          setRestoreSuccess('پایگاه داده کامل (شامل پرسنل، مدارک هویتی، کارانه، حقوق ۲۲۶ ستونی، طبقه‌بندی مشاغل معدنی، تعهدات، کاربران و مجوزهای داشبورد هوشمند و مدیر عامل) با موفقیت بازگردانی شد.');
          onRefreshStatus();
        } else {
          setRestoreError('خطا در بازیابی پایگاه داده.');
        }
      } catch (err: any) {
        setRestoreError('خطا در پردازش فایل پشتیبان: ' + err.message);
      } finally {
        setRestoreLoading(false);
      }
    };
    reader.onerror = () => {
      setRestoreError('خطا در خواندن فایل.');
      setRestoreLoading(false);
    };
    reader.readAsText(file);
  };

  const handleSaveGhConfig = async () => {
    try {
      const saved = await saveGitHubSyncConfigSecure(ghConfig);
      setGhConfig(saved);
      setVaultLocked(isGitHubVaultLocked());
      setGhMessage({
        type: 'success',
        text: saved.encryptDatabase
          ? 'تنظیمات امنیتی، رمزنگاری AES-256-GCM و گاوصندوق مرورگر با موفقیت ذخیره شدند.'
          : saved.autoSync
          ? 'تنظیمات مخزن گیت‌هاب و همگام‌سازی خودکار ذخیره شد.'
          : 'تنظیمات مخزن گیت‌هاب ذخیره شد (حالت ارسال دستی).',
      });
    } catch (err: any) {
      setGhMessage({ type: 'error', text: err?.message || 'خطا در ذخیره امن تنظیمات گیت‌هاب.' });
    }
  };

  const handleUnlockVault = async () => {
    try {
      setUnlockingVault(true);
      setGhMessage(null);
      const unlocked = await unlockGitHubVault(unlockPassInput);
      setGhConfig(unlocked);
      setVaultLocked(false);
      setUnlockPassInput('');
      setGhMessage({
        type: 'success',
        text: 'گاوصندوق توکن گیت‌هاب و کلید رمزنگاری برای این نشست بازگشایی شد.',
      });
    } catch (err: any) {
      setGhMessage({ type: 'error', text: err?.message || 'کلید رمزنگاری اشتباه است.' });
    } finally {
      setUnlockingVault(false);
    }
  };

  const handlePanicLockSession = () => {
    lockGitHubSession();
    setGhConfig(loadGitHubSyncConfig());
    setVaultLocked(isGitHubVaultLocked());
    setGhTestResult(null);
    setGhMessage({
      type: 'success',
      text: 'نشست امنیتی فوراً قفل شد و توکن/کلید رمزنگاری از حافظه مرورگر پاک گردید.',
    });
  };

  const handleGenerateStrongKey = () => {
    const strongKey = generateStrongPassphrase(24);
    setGhConfig((prev) => ({ ...prev, encryptionPassphrase: strongKey, encryptDatabase: true }));
    setShowGhPassphrase(true);
    copyToClipboard(strongKey, 'gh_strong_key');
    setGhMessage({
      type: 'success',
      text: 'کلید فوق‌امن ۲۴ کاراکتری تولید و در کلیپ‌بورد کپی شد! حتماً این کلید را در جای امن (مثلاً گوشی یا یادداشت رمزدار) ذخیره کنید؛ بدون این کلید هیچ‌کس (حتی مدیر سیستم) قادر به باز کردن فایل دیتابیس نخواهد بود.',
    });
  };

  const handleTestGhConnection = async () => {
    try {
      setGhTesting(true);
      setGhTestResult(null);
      setGhMessage(null);
      const saved = await saveGitHubSyncConfigSecure(ghConfig);
      setGhConfig(saved);
      const res = await testGitHubConnection(saved);
      setGhTestResult(res);
    } catch (err: any) {
      setGhMessage({ type: 'error', text: err?.message || 'خطا در بررسی اتصال به مخزن گیت‌هاب.' });
    } finally {
      setGhTesting(false);
    }
  };

  const handleClearGhConfig = () => {
    const empty = clearGitHubSyncConfig();
    setGhConfig(empty);
    setVaultLocked(false);
    setGhTestResult(null);
    setGhMessage({ type: 'success', text: 'توکن، کلید رمزنگاری و تنظیمات گیت‌هاب به‌صورت کامل از این مرورگر پاک شد.' });
  };

  const handlePushToGitHub = async () => {
    try {
      setGhSyncing(true);
      setGhMessage(null);
      const saved = await saveGitHubSyncConfigSecure(ghConfig);
      setGhConfig(saved);
      const snapRes = await api.exportDatabaseSnapshot();
      if (!snapRes?.success || !snapRes.data) {
        throw new Error('امکان دریافت اسنپ‌شات دیتابیس فراهم نشد.');
      }
      const res = await pushDatabaseToGitHub(saved, snapRes.data);
      setGhConfig(loadGitHubSyncConfig());
      const encText = res.encrypted
        ? 'به‌صورت رمزنگاری‌شده (AES-256-GCM + SHA-256)'
        : 'بدون رمزنگاری';
      setGhMessage({
        type: 'success',
        text: `پایگاه داده کامل شرکت نگین پرتو نصر ${encText} در مخزن خصوصی «${saved.owner}/${saved.repo}» (شاخه ${saved.branch} / فایل ${saved.filePath}) ثبت شد.`,
        url: res.commitUrl,
      });
    } catch (err: any) {
      setGhMessage({ type: 'error', text: err?.message || 'خطا در ارسال دیتابیس به گیت‌هاب.' });
    } finally {
      setGhSyncing(false);
    }
  };

  const handlePullFromGitHub = async () => {
    try {
      setGhSyncing(true);
      setGhMessage(null);
      const saved = await saveGitHubSyncConfigSecure(ghConfig);
      setGhConfig(saved);
      const pulled = await pullDatabaseFromGitHub(saved);
      const res = await api.mergeFirestoreSnapshot(pulled);
      if (!res?.success) {
        throw new Error(res?.message || 'خطا در ادغام فایل دریافتی از گیت‌هاب.');
      }
      onRefreshStatus();
      if (onDataReload) await onDataReload();
      setGhMessage({
        type: 'success',
        text: `اطلاعات ذخیره شده از شاخه «${saved.branch}» گیت‌هاب با موفقیت رمزگشایی، اعتبارسنجی (SHA-256) و در سامانه بارگذاری شد.`,
      });
    } catch (err: any) {
      setGhMessage({ type: 'error', text: err?.message || 'خطا در دریافت دیتابیس از گیت‌هاب.' });
    } finally {
      setGhSyncing(false);
    }
  };

  const fileSizeKb = dbStatus ? (dbStatus.fileSizeBytes / 1024).toFixed(1) : '۰';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              مرکز پشتیبان‌گیری جامع، پایگاه داده دائمی و استقرار آنلاین
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            پشتیبان‌گیری و همگام‌سازی کامل از تمامی ماژول‌های سامانه (نسخه {dbStatus?.schemaVersion || '5.0-negin-parto-nasr-units-hub'}) شامل پرونده ۲۸ ستونی پرسنل، بستگان، مدارک هویتی، کارانه، حقوق ۲۲۶ ستونی، دیسپچینگ حجم عملیات، تعمیرگاه ماشین‌آلات، گزارش‌های اکسل واحدها، تعهدات و مجوزهای کاربری
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefreshStatus}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>بررسی وضعیت دیتابیس</span>
          </button>

          <button
            onClick={handleBackupDownload}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود نسخه پشتیبان امن (JSON)</span>
          </button>
        </div>
      </div>

      {/* Firebase Cloud Firestore Status & Sync Panel */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 text-white rounded-2xl border border-indigo-800/60 p-5 sm:p-6 shadow-md space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-400/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Firebase Firestore راه‌اندازی و قوانین امنیتی مستقر شد</span>
                </span>
                {firebaseUserEmail ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/25 text-indigo-200 text-[11px] font-bold border border-indigo-400/30" dir="ltr">
                    {firebaseUserEmail}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[11px] font-bold border border-amber-400/30">
                    حساب گوگل در این مرورگر متصل نیست
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold">
                دیتابیس ابری دائمی Firebase (ماندگاری همیشگی بدون پاک شدن اطلاعات)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                پروژه: <span className="text-indigo-300 font-bold" dir="ltr">{FIREBASE_META.projectId}</span> | دیتابیس:{' '}
                <span className="text-indigo-300 font-bold" dir="ltr">{FIREBASE_META.databaseId}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!firebaseUserEmail && onConnectGoogleFirebase && (
              <button
                onClick={onConnectGoogleFirebase}
                disabled={firebaseSyncing}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white text-slate-900 hover:bg-indigo-50 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                <Chrome className="w-4 h-4 text-indigo-600" />
                <span>اتصال حساب گوگل به فایربیس</span>
              </button>
            )}

            {onSyncToFirestore && (
              <button
                onClick={onSyncToFirestore}
                disabled={firebaseSyncing}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" />
                <span>{firebaseSyncing ? 'در حال همگام‌سازی...' : 'ارسال و ذخیره دائمی در Firestore'}</span>
              </button>
            )}

            {onPullFromFirestore && (
              <button
                onClick={onPullFromFirestore}
                disabled={firebaseSyncing}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <CloudDownload className="w-4 h-4" />
                <span>دریافت و بازیابی از Firestore</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-1">
            <div className="font-bold text-indigo-200">امنیت و قوانین دسترسی (Firestore Rules)</div>
            <p className="text-slate-300 leading-relaxed">
              قوانین امنیتی سخت‌گیرانه (Zero-Trust) روی پروژه مستقر شده و حساب مدیر ارشد (<span dir="ltr">{FIREBASE_META.superAdminEmail}</span>) به‌صورت پیش‌فرض با تأیید ایمیل گوگل مجاز است. مدارک اسکن‌شده پرسنل نیز در زیرمجموعه جداگانه ذخیره می‌شوند تا محدودیت ۱ مگابایتی اسناد Firestore نقض نشود.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-1">
            <div className="font-bold text-amber-200">نکته مهم دسترسی از داخل ایران بدون فیلترشکن</div>
            <p className="text-slate-300 leading-relaxed">
              ورود با نام کاربری و رمز عبور از طریق سرور میانی (بدون تماس مستقیم مرورگر با دامنه‌های گوگل) انجام می‌شود. اگر اینترنت برخی کاربران در ایران دامنه‌های <span dir="ltr">*.run.app</span> یا <span dir="ltr">firestore.googleapis.com</span> را محدود کند، اجرای همین پروژه روی یک سرور یا رایانه داخل ایران (روش ۲) دسترسی ۱۰۰٪ بدون فیلترشکن را تضمین می‌کند.
            </p>
          </div>
        </div>
      </div>

      {/* Method Selection Tabs */}
      <div className="flex flex-col lg:flex-row border border-slate-200 bg-white p-1.5 rounded-2xl shadow-xs gap-1.5">
        <button
          onClick={() => setActiveTab('github_isolated')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'github_isolated'
              ? 'bg-slate-900 text-amber-300 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <GitBranch className="w-4 h-4 shrink-0" />
          <span>روش ۱: استقرار روی گیت‌هاب (GitHub Pages) + دیتابیس دائمی در شاخه مجزا (db-data)</span>
        </button>

        <button
          onClick={() => setActiveTab('cloud_instant')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'cloud_instant'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CloudLightning className="w-4 h-4 shrink-0" />
          <span>روش ۲: لینک آنلاین مستقیم سامانه ابری</span>
        </button>

        <button
          onClick={() => setActiveTab('pc_direct')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'pc_direct'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Laptop className="w-4 h-4 shrink-0" />
          <span>روش ۳: آپلود با WinSCP روی هاست شخصی</span>
        </button>
      </div>

      {/* METHOD GITHUB ISOLATED */}
      {activeTab === 'github_isolated' && (
        <div className="bg-white rounded-2xl border border-slate-300 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-300 flex items-center justify-center shrink-0">
              <GitBranch className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تضمین عدم پاک‌شدن دیتابیس هنگام ویرایش آنلاین کد سایت روی GitHub</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                میزبانی رایگان روی GitHub Pages + نگهداری امن دیتابیس روی شاخه مجزای <span dir="ltr" className="text-indigo-700">db-data</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                کد سایت شما روی شاخه <b dir="ltr">main</b> قرار می‌گیرد و از طریق گردش‌کار GitHub Actions داخل گیت‌هاب ساخته و منتشر می‌شود.
                برای اینکه تغییرات کد هرگز اطلاعات دیتابیس را پاک یا خراب نکند، فایل پایگاه داده (<span dir="ltr">database.json</span>) روی یک شاخه کاملاً جداگانه به نام <b dir="ltr" className="text-indigo-700">db-data</b> یا یک مخزن خصوصی (Private) جداگانه (و به‌صورت موازی در Firebase Firestore و حافظه داخلی IndexedDB) ذخیره می‌شود.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-slate-900">۱. شاخه <span dir="ltr">main</span> (فقط کد سایت)</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                هر تغییر ظاهری یا کدنویسی آنلاین در گیت‌هاب روی شاخه <span dir="ltr">main</span> انجام می‌شود و خروجی آن خودکار روی آدرس <span dir="ltr">username.github.io/repo</span> منتشر می‌شود.
              </p>
            </div>
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1">
              <div className="font-bold text-indigo-900">۲. شاخه <span dir="ltr">db-data</span> (دیتابیس دائمی)</div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                فایل <span dir="ltr">database.json</span> در شاخه‌ای مجزا نگهداری می‌شود؛ بنابراین با هر آپدیت روی شاخه اصلی، داده‌های پرسنلی، حقوق، حجم عملیات و تعمیرگاه دست‌نخورده باقی می‌مانند.
              </p>
            </div>
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
              <div className="font-bold text-emerald-900">۳. پشتیبان سه‌لایه همزمان</div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                علاوه بر شاخه <span dir="ltr">db-data</span> گیت‌هاب، اطلاعات در <b>Firebase Firestore</b> و <b>IndexedDB</b> نیز ماندگار هستند و از هر کامپیوتر و گوشی با یک کلیک قابل بازیابی‌اند.
              </p>
            </div>
          </div>

          {/* Interactive GitHub Sync Configuration */}
          <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>اتصال مستقیم به مخزن گیت‌هاب شرکت (ذخیره تنظیمات فقط در مرورگر خودتان)</span>
              </h4>
              <span className="text-[11px] text-slate-500">
                توکن دسترسی (<span dir="ltr">PAT</span>) با مجوز <span dir="ltr">Contents: Read &amp; Write</span> نیاز است
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام کاربری گیت‌هاب (Owner)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={ghConfig.owner}
                  onChange={(e) => setGhConfig({ ...ghConfig, owner: e.target.value })}
                  placeholder="javadabadiyan"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام مخزن (Repository)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={ghConfig.repo}
                  onChange={(e) => setGhConfig({ ...ghConfig, repo: e.target.value })}
                  placeholder="npn-private-db"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">شاخه مجزای دیتابیس</label>
                <input
                  type="text"
                  dir="ltr"
                  value={ghConfig.branch}
                  onChange={(e) => setGhConfig({ ...ghConfig, branch: e.target.value })}
                  placeholder="db-data"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">مسیر فایل دیتابیس</label>
                <input
                  type="text"
                  dir="ltr"
                  value={ghConfig.filePath}
                  onChange={(e) => setGhConfig({ ...ghConfig, filePath: e.target.value })}
                  placeholder="database.json"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">توکن دسترسی (GitHub PAT)</label>
                <div className="relative">
                  <input
                    type={showGhToken ? 'text' : 'password'}
                    dir="ltr"
                    value={ghConfig.token}
                    onChange={(e) => setGhConfig({ ...ghConfig, token: e.target.value })}
                    placeholder="github_pat_..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGhToken(!showGhToken)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={showGhToken ? 'مخفی کردن توکن' : 'نمایش توکن'}
                  >
                    {showGhToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Vault Unlock Banner when Encrypted Token Vault is locked in a new browser session */}
            {vaultLocked && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>گاوصندوق امنیتی توکن و دیتابیس گیت‌هاب قفل است</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  برای جلوگیری از سرقت توکن گیت‌هاب از حافظه مرورگر، توکن شما به‌صورت رمزنگاری‌شده نگهداری می‌شود. لطفاً کلید رمزنگاری خود را وارد کنید تا هم توکن و هم فایل دیتابیس بازگشایی شوند:
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    dir="ltr"
                    value={unlockPassInput}
                    onChange={(e) => setUnlockPassInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockVault()}
                    placeholder="کلید رمزنگاری دیتابیس را وارد کنید..."
                    className="flex-1 min-w-[220px] px-3 py-2 bg-white border border-amber-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    disabled={unlockingVault || !unlockPassInput}
                    onClick={handleUnlockVault}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold disabled:opacity-50 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{unlockingVault ? 'در حال بازگشایی...' : 'بازگشایی گاوصندوق'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Zero-Knowledge Security Shield Panel */}
            <div className="p-4 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl border border-slate-700 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white">
                      سپر امنیتی ضدنفوذ و رمزنگاری سرتاسری (Zero-Knowledge AES-256-GCM)
                    </h5>
                    <p className="text-[11px] text-slate-300">
                      اطلاعات قبل از خروج از مرورگر با الگوریتم نظامی رمزنگاری و با امضای SHA-256 ضدتغییر می‌شوند؛ بدون کلید، فایل گیت‌هاب کاملاً غیرقابل خواندن است.
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold shrink-0 ${
                    evaluatePassphraseStrength(ghConfig.encryptionPassphrase).colorClass
                  }`}
                >
                  قدرت کلید: {evaluatePassphraseStrength(ghConfig.encryptionPassphrase).label}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-bold text-indigo-200">
                    کلید رمزنگاری دیتابیس (هرگز در گیت‌هاب ذخیره نمی‌شود)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showGhPassphrase ? 'text' : 'password'}
                        dir="ltr"
                        value={ghConfig.encryptionPassphrase}
                        onChange={(e) => setGhConfig({ ...ghConfig, encryptionPassphrase: e.target.value })}
                        placeholder="حداقل ۸ کاراکتر پیچیده یا کلید ۲۴ رقمی تولیدی..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-600 text-white placeholder-slate-400 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGhPassphrase(!showGhPassphrase)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        title={showGhPassphrase ? 'مخفی کردن کلید' : 'نمایش کلید'}
                      >
                        {showGhPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateStrongKey}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-[11px] shrink-0 cursor-pointer"
                      title="تولید خودکار کلید فوق‌امن تصادفی و کپی در حافظه"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>تولید کلید فوق‌امن</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-indigo-200">
                    نحوه نگهداری توکن گیت‌هاب در این مرورگر
                  </label>
                  <select
                    value={ghConfig.credentialStorageMode}
                    onChange={(e) =>
                      setGhConfig({
                        ...ghConfig,
                        credentialStorageMode: e.target.value as 'session_only' | 'encrypted_vault',
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 text-xs"
                  >
                    <option value="encrypted_vault">
                      گاوصندوق رمزنگاری‌شده (توکن با کلید شما در مرورگر قفل می‌شود — پیشنهادی)
                    </option>
                    <option value="session_only">
                      فقط در همین نشست مرورگر (پاک شدن خودکار توکن با بستن تب — صفر ردپا روی سیستم)
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ghConfig.encryptDatabase}
                    onChange={(e) => setGhConfig({ ...ghConfig, encryptDatabase: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded text-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-emerald-300">رمزنگاری اجباری سرتاسری AES-256-GCM + امضای SHA-256</div>
                    <div className="text-slate-300 mt-0.5">
                      تمام جداول پرسنل، حقوق و گزارش‌ها قبل از ارسال رمز می‌شوند تا در صورت سرقت مخزن هم قابل خواندن نباشند.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ghConfig.requirePrivateRepo}
                    onChange={(e) => setGhConfig({ ...ghConfig, requirePrivateRepo: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded text-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-amber-300">مسدودسازی اجباری مخزن‌های عمومی (Public Repo Blocker)</div>
                    <div className="text-slate-300 mt-0.5">
                      اگر مخزن گیت‌هاب به اشتباه عمومی (Public) باشد، ارسال داده‌ها به‌طور خودکار مسدود می‌شود.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Auto Sync Toggle & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ghConfig.autoSync}
                  onChange={(e) => {
                    const updated = { ...ghConfig, autoSync: e.target.checked };
                    setGhConfig(updated);
                    saveGitHubSyncConfig(updated);
                  }}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    همگام‌سازی خودکار با فایل دیتابیس گیت‌هاب (Auto-Sync)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    پس از هر ثبت، ویرایش، حذف یا آپلود اکسل به‌صورت خودکار و رمزنگاری‌شده در فایل گیت‌هاب ذخیره می‌شود و هنگام ورود، آخرین اطلاعات دریافت می‌گردد.
                  </span>
                </div>
              </label>

              {ghConfig.lastSyncedAt && (
                <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold shrink-0 persian-num">
                  آخرین ثبت گیت‌هاب: {toPersianDigits(ghConfig.lastSyncedAt)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveGhConfig}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-indigo-600" />
                <span>ذخیره امن تنظیمات</span>
              </button>

              <button
                type="button"
                disabled={ghTesting || ghSyncing}
                onClick={handleTestGhConnection}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                <PlugZap className="w-3.5 h-3.5 text-amber-300" />
                <span>{ghTesting ? 'در حال بررسی...' : 'تست اتصال و بررسی امنیت مخزن'}</span>
              </button>

              <button
                type="button"
                disabled={ghSyncing || ghTesting}
                onClick={handlePushToGitHub}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" />
                <span>{ghSyncing ? 'در حال رمزنگاری و ثبت...' : `ذخیره رمزنگاری‌شده در ${ghConfig.branch || 'db-data'}`}</span>
              </button>

              <button
                type="button"
                disabled={ghSyncing || ghTesting}
                onClick={handlePullFromGitHub}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <CloudDownload className="w-4 h-4" />
                <span>{ghSyncing ? 'در حال دریافت و رمزگشایی...' : `دریافت و رمزگشایی از ${ghConfig.branch || 'db-data'}`}</span>
              </button>

              {(ghConfig.token || ghConfig.encryptionPassphrase) && (
                <button
                  type="button"
                  onClick={handlePanicLockSession}
                  className="flex items-center gap-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold cursor-pointer"
                  title="پاک‌سازی فوری کلید و توکن از حافظه نشست بدون حذف تنظیمات مخزن"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>قفل فوری نشست</span>
                </button>
              )}

              {(ghConfig.token || ghConfig.repo || ghConfig.hasEncryptedTokenVault) && (
                <button
                  type="button"
                  onClick={handleClearGhConfig}
                  className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold cursor-pointer mr-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>پاک کردن کامل تنظیمات مرورگر</span>
                </button>
              )}
            </div>

            {ghTestResult && (
              <div
                className={`p-3.5 rounded-xl text-xs border flex items-start gap-2.5 ${
                  ghTestResult.repoPrivate
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {ghTestResult.repoPrivate ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold flex flex-wrap items-center gap-2">
                    <span>
                      {ghTestResult.repoPrivate
                        ? 'اتصال امن به مخزن خصوصی (Private) برقرار است'
                        : 'هشدار بحرانی: مخزن عمومی (Public) است — ارسال مسدود می‌شود!'}
                    </span>
                    {ghTestResult.fileEncrypted === true && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">
                        رمزنگاری AES-256-GCM فعال 🔒
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed">{ghTestResult.message}</p>
                </div>
              </div>
            )}

            {ghMessage && (
              <div
                className={`p-3 rounded-xl text-xs border flex items-center justify-between gap-2 ${
                  ghMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <span>{ghMessage.text}</span>
                {ghMessage.url && (
                  <a
                    href={ghMessage.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline shrink-0"
                  >
                    مشاهده کامیت در گیت‌هاب
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Step-by-Step GitHub Setup Guide */}
          <div className="p-4 sm:p-5 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>راهنمای گام‌به‌گام راه‌اندازی سایت روی GitHub Pages + دیتابیس فایل روی مخزن خصوصی گیت‌هاب</span>
            </h4>
            <ol className="list-decimal pr-5 space-y-2 text-[11px] text-slate-700 leading-relaxed">
              <li>
                <b>بالا آوردن سایت (GitHub Pages):</b> کل پروژه را روی یک مخزن گیت‌هاب Push کنید. سپس داخل خود سایت گیت‌هاب وارد تب <span dir="ltr" className="font-bold">Actions</span> شوید ← گزینه <span dir="ltr" className="font-bold">set up a workflow yourself</span> را بزنید، فایل <span dir="ltr" className="font-bold">deploy-gh-pages.yml</span> را با کد آماده زیر ایجاد و Commit کنید و در <span dir="ltr" className="font-bold">Settings → Pages</span> گزینه <span dir="ltr" className="font-bold">Source</span> را روی <span dir="ltr" className="font-bold">GitHub Actions</span> بگذارید.
              </li>
              <li>
                <b>ایجاد مخزن امن برای فایل دیتابیس:</b> برای اینکه اطلاعات محرمانه پرسنل و حقوق توسط افراد متفرقه در اینترنت دیده نشود، یک مخزن جدید و حتماً <b>Private (خصوصی)</b> بسازید (مثلاً <span dir="ltr" className="font-bold">npn-private-db</span> و یک فایل خالی <span dir="ltr" className="font-bold">README.md</span> داخلش بسازید) و نام آن را در فیلدهای بالا وارد کنید (یا اگر کل مخزن اصلی Private است، از شاخه <span dir="ltr" className="font-bold">db-data</span> استفاده کنید).
              </li>
              <li>
                <b>ساخت توکن دسترسی (Fine-Grained PAT):</b> در گیت‌هاب وارد <span dir="ltr" className="font-bold">Settings → Developer settings → Personal access tokens → Fine-grained tokens</span> شوید، دسترسی را فقط به مخزن دیتابیس محدود کرده و مجوز <span dir="ltr" className="font-bold">Repository permissions → Contents: Read and write</span> را فعال کنید و توکن را در کادر بالا وارد نمایید.
              </li>
              <li>
                <b>تضمین عدم پاک‌شدن داده‌ها:</b> توکن فقط در مرورگر خودتان نگهداری می‌شود و فایل <span dir="ltr" className="font-bold">database.json</span> همراه با تاریخچه کامل تغییرات (Git History) در مخزن خصوصی گیت‌هاب ذخیره می‌گردد؛ بنابراین هر تغییری در کدهای سایت دهید، فایل دیتابیس شما کاملاً محفوظ می‌ماند.
              </li>
            </ol>

            <div className="pt-2">
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `name: Deploy to GitHub Pages\n\non:\n  push:\n    branches:\n      - main\n  workflow_dispatch:\n\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\nconcurrency:\n  group: pages\n  cancel-in-progress: false\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: |\n          if [ -f package-lock.json ]; then\n            npm ci --legacy-peer-deps\n          else\n            npm install --legacy-peer-deps\n          fi\n          npm install --no-save --legacy-peer-deps react-is@^19.0.0\n      - run: npm run build\n      - uses: actions/configure-pages@v5\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: dist\n\n  deploy:\n    environment:\n      name: github-pages\n      url: \${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    needs: build\n    steps:\n      - id: deployment\n        uses: actions/deploy-pages@v4\n`,
                    'gh_workflow'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold cursor-pointer"
              >
                {copiedCmd === 'gh_workflow' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd === 'gh_workflow' ? 'کد deploy-gh-pages.yml کپی شد!' : 'کپی کد آماده deploy-gh-pages.yml برای تب Actions گیت‌هاب'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* METHOD 1 */}
      {activeTab === 'cloud_instant' && (
        <div className="bg-white rounded-2xl border border-indigo-100 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>سامانه آنلاین و آماده بهره‌برداری</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                آدرس مستقیم ورود آنلاین به سامانه
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                لینک زیر را در مرورگر گوشی یا کامپیوتر باز کرده و با نام کاربری و رمز عبور خود یا حساب گوگل وارد شوید. اطلاعات قبلی حفظ شده و با دکمه «ارسال و ذخیره دائمی در Firestore» در فضای ابری همگام‌سازی می‌شوند.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">لینک مستقیم سایت آنلاین:</span>
              <span className="text-indigo-600 text-[11px]">سازگار با موبایل، تبلت و ویندوز</span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={liveAppUrl}
                className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-bold"
              />
              <button
                onClick={() => copyToClipboard(liveAppUrl, 'link1')}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow-xs cursor-pointer"
              >
                {copiedCmd === 'link1' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>کپی شد!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>کپی لینک</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs persian-num">۱</div>
              <h4 className="font-bold text-xs text-slate-900">ورود دوگانه (سرور + گوگل)</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                همکاران می‌توانند با نام کاربری و رمز عبور وارد شوند و مدیر ارشد نیز می‌تواند مستقیماً با حساب گوگل وارد Firebase شود.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs persian-num">۲</div>
              <h4 className="font-bold text-xs text-slate-900">همگام‌سازی خودکار و دستی</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                وقتی حساب گوگل متصل باشد، هر ثبت، ویرایش یا حذف به‌صورت خودکار در Firestore نیز ذخیره می‌شود.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-xs persian-num">۳</div>
              <h4 className="font-bold text-xs text-slate-900">پشتیبان‌گیری خودکار و دستی</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                پیش از هر بازیابی، یک کپی امن خودکار در سرور ذخیره می‌شود و فایل کامل پشتیبان JSON نیز در هر زمان قابل دریافت است.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* METHOD 2 */}
      {activeTab === 'pc_direct' && (
        <div className="bg-white rounded-2xl border border-emerald-100 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-200 mb-1">
                <span>آپلود مستقیم با WinSCP — ۱۰۰٪ بدون فیلترشکن و بدون نیاز به دسترسی SSH</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                استقرار مستقل روی هاست شخصی با پایگاه داده خودکار داخل پوشه سایت
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                این سامانه دارای پایگاه داده داخلی خودکار است؛ یعنی اگر دسترسی مدیریتی به سرور ندارید و فقط می‌توانید با نرم‌افزار <b>WinSCP</b> فایل‌ها را در پوشه سایت قرار دهید، کافیست محتویات خروجی ساخته‌شده (<span dir="ltr" className="font-bold">dist</span>) را مستقیماً در پوشه سایت (<span dir="ltr">public_html</span>) کپی کنید تا اطلاعات به‌صورت دائمی داخل خود سایت ذخیره شوند و هرگز پاک نشوند.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-indigo-700">۱. آماده بودن بسته‌بندی سایت</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                هنگام ساخت خروجی پروژه (<span dir="ltr">npm run build</span>)، فایل‌های سایت و موتور پایگاه داده خودکار (<span dir="ltr">api.php</span>) در پوشه خروجی آماده می‌شوند.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-emerald-700">۲. آپلود تنها با WinSCP</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                فایل‌های داخل پوشه خروجی را با WinSCP به مسیر <span dir="ltr">public_html</span> (یا پوشه دلخواه) منتقل کنید؛ بدون نیاز به نصب دیتابیس جداگانه یا اجرای دستور روی سرور.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-purple-700">۳. ماندگاری دائمی اطلاعات</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                تمامی پرسنل، مدارک اسکن‌شده، کارانه، حقوق و تعهدات با قفل‌گذاری همزمان و بکاپ‌های امن داخلی در خود پوشه سایت (و در هاست‌های بدون PHP در حافظه دائمی IndexedDB) نگه داشته می‌شوند.
              </p>
            </div>
          </div>

          <div className="p-4 bg-gradient-to-r from-emerald-50 to-indigo-50 border border-emerald-200 rounded-xl space-y-3">
            <h4 className="font-bold text-xs text-slate-900">فایل‌های راه‌انداز خودکار پرتابل (قابل اجرا روی ویندوز، لینوکس و مک):</h4>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={downloadStartBat}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-indigo-200" />
                <span>۱. اجرای سرور ویندوز (run_server.bat)</span>
              </button>

              <button
                onClick={downloadLinuxMacSh}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-slate-300" />
                <span>۲. اجرای سرور لینوکس / مک (run_portable_linux_mac.sh)</span>
              </button>

              <button
                onClick={downloadTunnelBat}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-200" />
                <span>۳. ایجاد لینک اینترنتی (start_tunnel.bat)</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="font-bold text-slate-900">دستور ساخت بسته قابل آپلود با WinSCP (روی رایانه شخصی پیش از انتقال):</div>
              <div className="bg-slate-950 p-2.5 rounded-lg text-[11px] text-emerald-400 flex items-center justify-between" dir="ltr">
                <span>npm install && npm run build</span>
                <button onClick={() => copyToClipboard('npm install && npm run build', 'c1')} className="text-slate-400 hover:text-white cursor-pointer">
                  {copiedCmd === 'c1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database Disk Status Monitor */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900">وضعیت فعلی پایگاه داده و امنیت سامانه</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{dbStatus?.storageLocation || engineBadge}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <ShieldCheck className="w-4 h-4" />
            <span>{engineBadge}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-600 block">حجم دیتابیس فعلی:</span>
            <span className="text-sm font-bold text-indigo-700 block mt-1 persian-num">
              {toPersianDigits(fileSizeKb)} کیلوبایت
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-600 block">پرسنل، بستگان و مدارک:</span>
            <span className="text-sm font-bold text-slate-900 block mt-1 persian-num">
              {toPersianDigits(dbStatus?.totalPersonnel || 0)} پرونده / {toPersianDigits(dbStatus?.totalRelatives || 0)} بستگان ({toPersianDigits(dbStatus?.totalPersonnelWithDocs || 0)} با مدرک)
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-600 block">کارانه و حقوق ۲۲۶ ستونی:</span>
            <span className="text-sm font-bold text-emerald-700 block mt-1 persian-num">
              {toPersianDigits(dbStatus?.totalKaranehRecords || 0)} کارانه ({toPersianDigits(dbStatus?.karanehPeriodsCount || 0)} دوره) / {toPersianDigits(dbStatus?.totalPayrollRecords || 0)} حقوق ({toPersianDigits(dbStatus?.payrollPeriodsCount || 0)} دوره)
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-600 block">دیسپچینگ، تعمیرگاه و گزارش واحدها:</span>
            <span className="text-sm font-bold text-cyan-700 block mt-1 persian-num">
              {toPersianDigits(dbStatus?.totalMiningVolumes || 0)} حجم / {toPersianDigits(dbStatus?.totalMiningMachinery || 0)} دستگاه / {toPersianDigits(dbStatus?.totalUnitReports || 0)} گزارش واحد
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-600 block">گروه‌ها و طبقه‌بندی مشاغل:</span>
            <span className="text-sm font-bold text-purple-700 block mt-1 persian-num">
              {toPersianDigits(dbStatus?.totalJobGroups || 0)} گروه / {toPersianDigits(dbStatus?.totalJobClassifications || 0)} ردیف ۱۸ ستونی
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-600 block">تعهدات و بایگانی:</span>
            <span className="text-sm font-bold text-amber-700 block mt-1 persian-num">
              {toPersianDigits(dbStatus?.totalCommitments || 0)} فقره ({toPersianDigits(dbStatus?.totalArchivedCommitments || 0)} بایگانی)
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 sm:col-span-2">
            <span className="text-[11px] text-slate-600 block">کاربران و دسترسی‌ها:</span>
            <span className="text-sm font-bold text-slate-800 block mt-1 persian-num">
              {toPersianDigits(dbStatus?.totalUsers || 0)} کاربر ({toPersianDigits(dbStatus?.totalActiveUsers ?? dbStatus?.totalUsers ?? 0)} فعال)
            </span>
          </div>
        </div>

        {/* Updated Backup Coverage Matrix */}
        <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-slate-700 leading-relaxed">
          <b className="text-indigo-900">پوشش کامل نسخه پشتیبان، دیتابیس مستقل از مرورگر و همگام‌سازی گیت‌هاب/ابری (نگین پرتو نصر):</b>{' '}
          فایل پشتیبان JSON، دیتابیس داخلی خودکار فایل-محور (در <span dir="ltr" className="font-bold">data/hr-database.json</span> / PHP / PostgreSQL مستقل از مرورگر)، اسنپ‌شات شاخه <span dir="ltr" className="font-bold">db-data</span> گیت‌هاب و Firestore شامل تمامی اطلاعات <b>پرونده‌های ۲۸ ستونی پرسنلی، بستگان و اسکن مدارک</b>، <b>آمار حجم دیسپچینگ، ماشین‌آلات تعمیرگاه و گزارش‌های اکسل تمام واحدهای معدن</b>، <b>گروه‌های شغلی و جدول ۱۸ ستونی طبقه‌بندی مشاغل</b>، <b>کارانه و حقوق ۲۲۶ ستونی</b>، <b>اسناد تعهدات</b> و <b>مجوزهای واحدها و مدیرعامل</b> می‌باشد.
        </div>

        {/* Restore and Reset */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold border border-slate-300">
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>{restoreLoading ? 'در حال بازیابی...' : 'بازیابی پایگاه داده از فایل JSON'}</span>
              </span>
              <input
                type="file"
                accept=".json"
                onChange={handleBackupFileSelect}
                className="hidden"
              />
            </label>

            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold border border-red-200 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>بازنشانی به داده‌های اولیه</span>
            </button>
          </div>

          <span className="text-slate-600 text-[11px] persian-num">
            آخرین به‌روزرسانی: <b>{toPersianDigits(dbStatus?.lastSaved || 'هم‌اکنون')}</b>
          </span>
        </div>

        {restoreSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{restoreSuccess}</span>
          </div>
        )}

        {restoreError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{restoreError}</span>
          </div>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">تأیید بازنشانی پایگاه داده</h3>
            <p className="text-slate-600 leading-relaxed">
              آیا از بازنشانی پایگاه داده به داده‌های نمونه اولیه اطمینان دارید؟ پیش از بازنشانی، یک نسخه پشتیبان خودکار در سرور ذخیره می‌شود.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={async () => {
                  await onResetDemo();
                  onRefreshStatus();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold cursor-pointer"
              >
                تأیید بازنشانی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
