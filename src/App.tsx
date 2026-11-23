/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardOverview } from './components/DashboardOverview';

const PersonnelModule = lazy(() => import('./components/PersonnelModule').then((m) => ({ default: m.PersonnelModule })));
const KaranehModule = lazy(() => import('./components/KaranehModule').then((m) => ({ default: m.KaranehModule })));
const FinalKaranehModule = lazy(() => import('./components/FinalKaranehModule').then((m) => ({ default: m.FinalKaranehModule })));
const JobGroupsModule = lazy(() => import('./components/JobGroupsModule').then((m) => ({ default: m.JobGroupsModule })));
const CommitmentsModule = lazy(() => import('./components/CommitmentsModule').then((m) => ({ default: m.CommitmentsModule })));
const UsersModule = lazy(() => import('./components/UsersModule').then((m) => ({ default: m.UsersModule })));
const PayrollModule = lazy(() => import('./components/PayrollModule').then((m) => ({ default: m.PayrollModule })));
const LocalHostDatabaseModule = lazy(() => import('./components/LocalHostDatabaseModule').then((m) => ({ default: m.LocalHostDatabaseModule })));
const SmartPersonnelDashboard = lazy(() => import('./components/SmartPersonnelDashboard').then((m) => ({ default: m.SmartPersonnelDashboard })));
const CeoDashboardModule = lazy(() => import('./components/CeoDashboardModule').then((m) => ({ default: m.CeoDashboardModule })));
const UnitOperationsModule = lazy(() => import('./components/UnitOperationsModule').then((m) => ({ default: m.UnitOperationsModule })));
import { api } from './services/api';
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
  DatabaseStatus
} from './types';
import { normalizePermissions, getFullAdminPermissions, getFirstAccessibleTab } from './utils/permissions';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { onAuthStateChanged, signOut, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import {
  ensureAdminRoleDoc,
  syncSnapshotToFirestore,
  pullSnapshotFromFirestore,
  syncSingleRecordToFirestore,
  deleteSingleFromFirestore,
  deleteIdsFromFirestore,
} from './services/firebaseSync';
import {
  GitHubSecurityError,
  isGitHubAutoSyncEnabled,
  isGitHubVaultLocked,
  loadGitHubSyncConfig,
  lockGitHubSession,
  pullDatabaseFromGitHub,
  scheduleBackgroundGitHubPush,
} from './utils/githubSync';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      return sessionStorage.getItem('npn_active_tab') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [syncingData, setSyncingData] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Core Data Lists
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [karanehUnitPersonnel, setKaranehUnitPersonnel] = useState<Personnel[]>([]);
  const [karanehList, setKaranehList] = useState<KaranehRecord[]>([]);
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [jobClassifications, setJobClassifications] = useState<JobClassificationRecord[]>([]);
  const [commitments, setCommitments] = useState<PersonnelCommitment[]>([]);
  const [miningVolumes, setMiningVolumes] = useState<MiningVolumeRecord[]>([]);
  const [miningMachinery, setMiningMachinery] = useState<MiningMachineryRecord[]>([]);
  const [unitReports, setUnitReports] = useState<UnitOperationalReport[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseSyncing, setFirebaseSyncing] = useState<boolean>(false);
  const githubAutoPulledRef = useRef<boolean>(false);
  const loadedForUserIdRef = useRef<string | null>(null);
  const lastSyncVersionRef = useRef<string | null>(null);
  const isReloadingDataRef = useRef<boolean>(false);

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDbStatusAsync = () => {
    api.getDatabaseStatus().then(setDbStatus).catch(() => {});
  };

  const afterUploadRefresh = async () => {
    await loadAllData({ silent: true, force: true });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    try {
      sessionStorage.setItem('npn_active_tab', activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    if (notifTimerRef.current) {
      clearTimeout(notifTimerRef.current);
    }
    setNotification({ message, type });
    notifTimerRef.current = setTimeout(() => {
      setNotification(null);
    }, type === 'error' ? 7500 : 4500);
  };

  const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

  const getStoredSessionExpiresAt = (): number => {
    try {
      const candidates: number[] = [];
      const storedExp = Number(localStorage.getItem('hr_auth_expires_at') || 0);
      if (Number.isFinite(storedExp) && storedExp > 0) {
        candidates.push(storedExp);
      }
      const token = localStorage.getItem('hr_auth_token') || '';
      if (token.startsWith('emb.')) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const parsed = JSON.parse(atob(parts[1]));
          const exp = Number(parsed?.exp || 0);
          if (Number.isFinite(exp) && exp > 0) {
            candidates.push(exp < 1e12 ? exp * 1000 : exp);
          }
        }
      } else if (token.includes('.')) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
          const parsed = JSON.parse(atob(padded));
          const exp = Number(parsed?.exp || 0);
          if (Number.isFinite(exp) && exp > 0) {
            candidates.push(exp < 1e12 ? exp * 1000 : exp);
          }
        }
      }
      if (candidates.length === 0) return 0;
      return Math.min(...candidates);
    } catch {
      return 0;
    }
  };

  const forceSessionExpire = (reason?: string) => {
    const msg =
      reason ||
      'به دلیل اتمام مهلت امنیتی ۲ ساعته، نشست کاربری شما بسته شد. لطفاً مجدداً وارد شوید.';
    try {
      localStorage.removeItem('hr_auth_token');
      localStorage.removeItem('hr_current_user');
      localStorage.removeItem('hr_auth_expires_at');
      sessionStorage.setItem('hr_logout_reason', msg);
    } catch {
      // ignore storage errors
    }
    loadedForUserIdRef.current = null;
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  // Check stored auth session & listen for 401 unauthorized events
  useEffect(() => {
    const storedUser = localStorage.getItem('hr_current_user');
    const token = localStorage.getItem('hr_auth_token');
    if (storedUser && token) {
      const expAt = getStoredSessionExpiresAt();
      if (expAt > 0 && Date.now() >= expAt) {
        forceSessionExpire();
      } else {
        try {
          if (expAt <= 0) {
            localStorage.setItem('hr_auth_expires_at', String(Date.now() + SESSION_TTL_MS));
          }
          setCurrentUser(JSON.parse(storedUser));
          api.verifySession().then((res) => {
            if (res && res.success && res.data) {
              setCurrentUser(res.data);
              localStorage.setItem('hr_current_user', JSON.stringify(res.data));
            } else if (res && (res.status === 401 || res.status === 403)) {
              forceSessionExpire((res as any)?.message);
            }
          }).catch(() => {
            // Keep cached state if offline, server check will run on API requests
          });
        } catch {
          localStorage.removeItem('hr_current_user');
          localStorage.removeItem('hr_auth_token');
          localStorage.removeItem('hr_auth_expires_at');
        }
      }
    }

    const onUnauthorized = (ev: Event) => {
      const customMsg = (ev as CustomEvent<{ message?: string }>)?.detail?.message;
      const reason =
        customMsg || 'نشست کاربری شما منقضی شده است (حداکثر زمان مجاز: ۲ ساعت). لطفاً مجدداً وارد شوید.';
      forceSessionExpire(reason);
      showNotification(reason, 'error');
    };

    window.addEventListener('hr:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hr:unauthorized', onUnauthorized);
  }, []);

  // Strict 2-hour client-side security auto-logout watcher (timer + focus + tab visibility)
  useEffect(() => {
    if (!currentUser?.id) return;
    let expiresAt = getStoredSessionExpiresAt();
    if (!expiresAt || expiresAt <= 0) {
      expiresAt = Date.now() + SESSION_TTL_MS;
      try {
        localStorage.setItem('hr_auth_expires_at', String(expiresAt));
      } catch {
        // ignore storage errors
      }
    }

    const checkExpiry = () => {
      const currentExp = getStoredSessionExpiresAt() || expiresAt;
      if (Date.now() >= currentExp) {
        forceSessionExpire();
      }
    };

    const remainingMs = Math.max(1000, expiresAt - Date.now());
    const timeoutId = setTimeout(checkExpiry, remainingMs + 250);
    const intervalId = setInterval(checkExpiry, 30000);
    const onFocusOrVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        checkExpiry();
      }
    };

    window.addEventListener('focus', onFocusOrVisibility);
    document.addEventListener('visibilitychange', onFocusOrVisibility);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocusOrVisibility);
      document.removeEventListener('visibilitychange', onFocusOrVisibility);
    };
  }, [currentUser?.id]);

  // Keep lastSyncVersionRef aligned whenever dbStatus refreshes from any local mutation
  useEffect(() => {
    const sv = (dbStatus as any)?.syncVersion;
    if (sv) {
      lastSyncVersionRef.current = String(sv);
    }
  }, [dbStatus]);

  // Fetch data via fast Two-Phase Cloudflare D1 Bootstrap (never blocks UI render)
  const applyBundleToState = (bundle: Awaited<ReturnType<typeof api.getBootstrapData>>, preserveHeavyOnLite = false) => {
    if (!(preserveHeavyOnLite && bundle.isLite)) {
      setPersonnelList(bundle.personnel || []);
      setPayrollList(bundle.payroll || []);
    } else if ((bundle.personnel || []).length > 0) {
      setPersonnelList(bundle.personnel || []);
    }
    setKaranehList(bundle.karaneh || []);
    if (Array.isArray(bundle.karanehPersonnel)) {
      setKaranehUnitPersonnel(bundle.karanehPersonnel);
    }
    setJobGroups(bundle.jobGroups || []);
    setJobClassifications(bundle.jobClassifications || []);
    setCommitments(bundle.commitments || []);
    setMiningVolumes(bundle.miningVolumes || []);
    setMiningMachinery(bundle.miningMachinery || []);
    setUnitReports(bundle.unitReports || []);
    setUsers(bundle.users || []);
    setDbStatus(bundle.dbStatus || null);

    const nextSync = bundle.syncVersion || (bundle.dbStatus as any)?.syncVersion;
    if (nextSync) {
      lastSyncVersionRef.current = String(nextSync);
    }
  };

  const loadAllData = async (options?: { silent?: boolean; retryAttempt?: number; force?: boolean }) => {
    const silent = Boolean(options?.silent);
    const force = Boolean(options?.force);
    const retryAttempt = Number(options?.retryAttempt || 0);
    if (isReloadingDataRef.current && silent && !force) return;
    isReloadingDataRef.current = true;
    const activeUserId = loadedForUserIdRef.current;
    try {
      if (!silent) {
        setSyncingData(true);
        setSyncError(null);
      }

      const useLiteFirst = activeTab !== 'payroll' && activeTab !== 'ceo-dashboard';
      const bundle = await api.getBootstrapData({ lite: useLiteFirst });
      if (loadedForUserIdRef.current !== activeUserId) return;

      applyBundleToState(bundle, useLiteFirst && payrollList.length > 0);
      setSyncError(null);
      if (!silent) {
        setSyncingData(false);
      }

      // Phase 2: Hydrate ONLY skipped heavy slices (payroll / scanned docs) in background without re-downloading all tables
      if (bundle.isLite) {
        const isAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'javadabadiyan';
        const perms = currentUser
          ? isAdmin
            ? getFullAdminPermissions()
            : normalizePermissions(currentUser.permissions)
          : null;
        const needPayroll =
          Number(bundle.dbStatus?.totalPayrollRecords || 0) > 0 && Boolean(isAdmin || perms?.payroll?.view);
        const needDocs =
          Number(bundle.dbStatus?.totalPersonnelWithDocs || 0) > 0 && Boolean(isAdmin || perms?.personnel?.documents);

        if (needPayroll || needDocs) {
          Promise.all([
            needPayroll ? api.getPayroll() : Promise.resolve(null),
            needDocs ? api.getPersonnel({ lite: false }) : Promise.resolve(null),
          ])
            .then(([payData, fullPersData]) => {
              if (loadedForUserIdRef.current !== activeUserId) return;
              if (Array.isArray(payData)) setPayrollList(payData);
              if (Array.isArray(fullPersData) && fullPersData.length > 0) setPersonnelList(fullPersData);
            })
            .catch(() => {
              // Non-fatal; payroll/documents will refresh on next sync or tab visit
            });
        }
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      if (!silent) {
        if (retryAttempt < 1 && loadedForUserIdRef.current === activeUserId) {
          setTimeout(() => {
            if (loadedForUserIdRef.current === activeUserId) {
              void loadAllData({ silent: false, retryAttempt: retryAttempt + 1 });
            }
          }, 2500);
          return;
        }
        const msg = err?.message || 'خطا در بارگذاری اطلاعات از پایگاه داده سرور';
        setSyncError(msg);
        showNotification(msg, 'error');
      }
    } finally {
      isReloadingDataRef.current = false;
      if (!silent) {
        setSyncingData(false);
      }
    }
  };

  // Listen to Firebase Auth state and bootstrap admin registry when verified
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser && fbUser.emailVerified) {
        ensureAdminRoleDoc().catch((err) => {
          console.warn('Admin bootstrap check deferred:', err);
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'super_admin' || currentUser.username === 'javadabadiyan';
    const perms = isAdmin ? getFullAdminPermissions() : normalizePermissions(currentUser.permissions);
    const isPermitted =
      isAdmin ||
      (activeTab === 'dashboard' && perms.system?.dashboardStats) ||
      (activeTab === 'smart-dashboard' && perms.smartDashboard?.view) ||
      (activeTab === 'ceo-dashboard' && perms.ceoDashboard?.view) ||
      (activeTab === 'unit-operations' && perms.unitOperations?.view) ||
      (activeTab === 'personnel' && perms.personnel?.view) ||
      (activeTab === 'karaneh' && perms.karaneh?.view) ||
      (activeTab === 'final-karaneh' && perms.finalKaraneh?.view) ||
      (activeTab === 'payroll' && perms.payroll?.view) ||
      (activeTab === 'job-groups' && perms.jobGroups?.view) ||
      (activeTab === 'commitments' && perms.commitments?.view) ||
      (activeTab === 'users' && perms.users?.view) ||
      (activeTab === 'database' && (perms.system?.backupDatabase || perms.system?.restoreDatabase));
    if (!isPermitted) {
      const nextTab = getFirstAccessibleTab(perms, isAdmin);
      if (nextTab !== activeTab) {
        setActiveTab(nextTab);
      }
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) {
      loadedForUserIdRef.current = null;
      return;
    }
    if (loadedForUserIdRef.current === uid) return;
    loadedForUserIdRef.current = uid;

    loadAllData().then(async () => {
      if (githubAutoPulledRef.current) return;
      // Cloudflare D1 is the single authoritative multi-browser/multi-device database;
      // never auto-overwrite D1 records on startup with an older GitHub snapshot.
      const activeEngine = await api.detectEngine().catch(() => null);
      if (activeEngine === 'cloudflare') {
        githubAutoPulledRef.current = true;
        return;
      }
      const canRestore =
        currentUser.role === 'super_admin' ||
        currentUser.username === 'javadabadiyan' ||
        Boolean(normalizePermissions(currentUser.permissions).system?.restoreDatabase);
      if (!canRestore) return;

      if (isGitHubVaultLocked()) {
        githubAutoPulledRef.current = true;
        showNotification('گاوصندوق دیتابیس گیت‌هاب قفل است؛ برای همگام‌سازی خودکار، در بخش «دیتابیس و گیت‌هاب» رمز رمزنگاری را وارد کنید.');
        return;
      }

      if (!isGitHubAutoSyncEnabled()) return;
      githubAutoPulledRef.current = true;
      try {
        const cfg = loadGitHubSyncConfig();
        const pulled = await pullDatabaseFromGitHub(cfg);
        const merged = await api.mergeFirestoreSnapshot(pulled);
        if (merged?.success) {
          await loadAllData({ silent: true });
          showNotification(`دیتابیس از فایل گیت‌هاب (${cfg.repo}/${cfg.filePath}) همگام‌سازی شد.`);
        }
      } catch (err: any) {
        if (err instanceof GitHubSecurityError && err.code === 'E2E_LOCKED') {
          showNotification('دیتابیس گیت‌هاب با رمزنگاری AES-256 قفل است؛ در بخش «دیتابیس و گیت‌هاب» کلید را وارد کنید.');
        }
        // Silent if GitHub DB file has not been created yet or offline
      }
    });
  }, [currentUser?.id]);

  // Live Cloudflare D1 Cross-Browser / Cross-Device Sync Watcher
  useEffect(() => {
    if (!currentUser?.id) return;
    let disposed = false;
    let checking = false;

    const checkCloudChanges = async () => {
      if (disposed || checking || isReloadingDataRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const meta = await api.getSyncVersion();
        if (disposed || !meta?.syncVersion) return;
        const incoming = String(meta.syncVersion);
        if (lastSyncVersionRef.current === null) {
          lastSyncVersionRef.current = incoming;
          return;
        }
        if (incoming !== lastSyncVersionRef.current) {
          lastSyncVersionRef.current = incoming;
          await loadAllData({ silent: true });
          if (!disposed) {
            showNotification('تغییرات جدید از پایگاه داده ابری کلودفلر همگام‌سازی شد.');
          }
        }
      } catch {
        // Ignore transient network polling glitches
      } finally {
        checking = false;
      }
    };

    const onVisibleOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void checkCloudChanges();
      }
    };

    window.addEventListener('focus', onVisibleOrFocus);
    window.addEventListener('online', onVisibleOrFocus);
    document.addEventListener('visibilitychange', onVisibleOrFocus);
    const intervalId = setInterval(() => {
      void checkCloudChanges();
    }, 12000);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onVisibleOrFocus);
      window.removeEventListener('online', onVisibleOrFocus);
      document.removeEventListener('visibilitychange', onVisibleOrFocus);
      clearInterval(intervalId);
    };
  }, [currentUser?.id]);

  // Automatic Frontend Deploy Version Watcher (auto-refreshes mobile/desktop after GitHub Pages push)
  useEffect(() => {
    if (!import.meta.env.PROD || typeof __APP_BUILD_ID__ !== 'string') return;
    let disposed = false;
    let triggeredReload = false;

    const checkBuildVersion = async () => {
      if (disposed || triggeredReload) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const remoteVersion = data?.version ? String(data.version) : '';
        if (remoteVersion && remoteVersion !== String(__APP_BUILD_ID__)) {
          triggeredReload = true;
          showNotification('نسخه جدید سامانه منتشر شد؛ در حال بروزرسانی خودکار...');
          setTimeout(() => {
            window.location.reload();
          }, 900);
        }
      } catch {
        // Ignore transient offline errors
      }
    };

    const onVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void checkBuildVersion();
      }
    };

    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => {
      void checkBuildVersion();
    }, 45000);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, []);

  // Helper: non-blocking debounced push to GitHub file database when configured & enabled
  const triggerGitHubAutoSync = () => {
    api.getSyncVersion().then((meta) => {
      if (meta?.syncVersion) {
        lastSyncVersionRef.current = String(meta.syncVersion);
      }
    }).catch(() => {});
    scheduleBackgroundGitHubPush(
      () => api.exportDatabaseSnapshot(),
      undefined,
      (msg) => console.warn('Background GitHub DB sync skipped:', msg)
    );
  };

  // Helper: non-blocking mirror to Firestore + GitHub file DB
  const mirrorSnapshotInBackground = async () => {
    triggerGitHubAutoSync();
    if (!auth.currentUser || !auth.currentUser.emailVerified) return;
    try {
      const snapRes = await api.exportDatabaseSnapshot();
      if (snapRes?.success && snapRes.data) {
        await syncSnapshotToFirestore(snapRes.data);
      }
    } catch (err) {
      console.warn('Background Firestore sync skipped:', err);
    }
  };

  const handleConnectGoogleFirebase = async (): Promise<boolean> => {
    try {
      setFirebaseSyncing(true);
      const cred = await signInWithPopup(auth, googleProvider);
      setFirebaseUser(cred.user);
      await ensureAdminRoleDoc();
      showNotification(`حساب گوگل (${cred.user.email}) با موفقیت به Firebase متصل شد.`);
      return true;
    } catch (err: any) {
      showNotification('اتصال به حساب گوگل انجام نشد: ' + (err?.message || 'خطای شبکه'), 'error');
      return false;
    } finally {
      setFirebaseSyncing(false);
    }
  };

  const handleSyncToFirestore = async (): Promise<boolean> => {
    try {
      setFirebaseSyncing(true);
      if (!auth.currentUser || !auth.currentUser.emailVerified) {
        const connected = await handleConnectGoogleFirebase();
        if (!connected) return false;
      }
      const snapRes = await api.exportDatabaseSnapshot();
      if (!snapRes?.success || !snapRes.data) {
        showNotification('امکان دریافت اسنپ‌شات سرور برای همگام‌سازی وجود ندارد.', 'error');
        return false;
      }
      const summary = await syncSnapshotToFirestore(snapRes.data);
      showNotification(
        `همگام‌سازی کامل با Firestore انجام شد (${summary.personnel} پرسنل، ${summary.karaneh} کارانه، ${summary.payroll} حقوق، ${summary.commitments} تعهد، ${summary.unitReports} گزارش واحد).`
      );
      return true;
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Quota exceeded')) {
        showNotification('سقف سهمیه روزانه رایگان Firestore پر شده است (فردا مجدداً بازنشانی می‌شود).', 'error');
      } else {
        showNotification('خطا در همگام‌سازی با Firestore: ' + msg, 'error');
      }
      return false;
    } finally {
      setFirebaseSyncing(false);
    }
  };

  const handlePullFromFirestore = async (): Promise<boolean> => {
    try {
      setFirebaseSyncing(true);
      if (!auth.currentUser || !auth.currentUser.emailVerified) {
        const connected = await handleConnectGoogleFirebase();
        if (!connected) return false;
      }
      const cloudSnapshot = await pullSnapshotFromFirestore();
      const res = await api.mergeFirestoreSnapshot(cloudSnapshot);
      if (res.success) {
        showNotification(res.message || 'اطلاعات ابری Firestore با موفقیت دریافت و ادغام شد.');
        await loadAllData();
        return true;
      }
      showNotification(res.message || 'خطا در ادغام داده‌های ابری.', 'error');
      return false;
    } catch (err: any) {
      showNotification('خطا در دریافت اطلاعات از Firestore: ' + (err?.message || ''), 'error');
      return false;
    } finally {
      setFirebaseSyncing(false);
    }
  };

  // Auth handlers
  const handleLoginSuccess = (user: User) => {
    const isAdmin = user.role === 'super_admin' || user.username === 'javadabadiyan';
    const perms = isAdmin ? getFullAdminPermissions() : normalizePermissions(user.permissions);
    try {
      if (!localStorage.getItem('hr_auth_expires_at')) {
        localStorage.setItem('hr_auth_expires_at', String(Date.now() + SESSION_TTL_MS));
      }
      sessionStorage.removeItem('hr_logout_reason');
    } catch {
      // ignore storage errors
    }
    setCurrentUser(user);
    setActiveTab(getFirstAccessibleTab(perms, isAdmin));
    showNotification(`خوش آمدید، جناب ${user.fullName}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('hr_auth_token');
    localStorage.removeItem('hr_current_user');
    localStorage.removeItem('hr_auth_expires_at');
    try {
      sessionStorage.removeItem('hr_logout_reason');
    } catch {
      // ignore storage errors
    }
    lockGitHubSession();
    githubAutoPulledRef.current = false;
    loadedForUserIdRef.current = null;
    signOut(auth).catch(() => {});
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  // Personnel handlers
  const handleSavePersonnel = async (pData: Partial<Personnel>): Promise<boolean> => {
    try {
      let res;
      if (pData.id) {
        res = await api.updatePersonnel(pData.id, pData);
      } else {
        res = await api.createPersonnel(pData);
      }

      if (res.success) {
        showNotification(res.message || 'اطلاعات پرسنلی با موفقیت در دیتابیس ثبت شد.');
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('personnel', res.data).catch(() => {});
        }
        const updated = await api.getPersonnel();
        setPersonnelList(updated);
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در ثبت پرسنل.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification('خطای شبکه در ثبت پرسنل.', 'error');
      return false;
    }
  };

  const handleDeletePersonnel = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deletePersonnel(id);
      if (res.success) {
        showNotification(res.message || 'پرونده پرسنلی حذف شد.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('personnel', id).catch(() => {});
        }
        setPersonnelList(prev => prev.filter(p => p.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف پرسنل.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در حذف پرسنل.', 'error');
      return false;
    }
  };

  const handleBatchImportPersonnel = async (items: any[]): Promise<boolean> => {
    try {
      const res = await api.batchImportPersonnel(items);
      if (res.success) {
        showNotification(res.message || 'بارگذاری پرونده‌ها از اکسل انجام شد.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در ورود اکسل.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification(e?.message || 'خطا در ارسال فایل اکسل.', 'error');
      return false;
    }
  };

  // Karaneh handlers
  const handleSaveKaraneh = async (record: Partial<KaranehRecord>): Promise<boolean> => {
    try {
      const res = await api.saveKaraneh(record);
      if (res.success) {
        showNotification(res.message || 'کارانه پرسنل با موفقیت ثبت شد.');
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('karaneh', res.data).catch(() => {});
        }
        const updated = await api.getKaraneh();
        setKaranehList(updated);
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در ذخیره کارانه.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در ذخیره کارانه.', 'error');
      return false;
    }
  };

  const handleDeleteKaraneh = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteKaraneh(id);
      if (res.success) {
        showNotification('رکورد کارانه با موفقیت حذف شد.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('karaneh', id).catch(() => {});
        }
        setKaranehList(prev => prev.filter(k => k.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف کارانه.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در حذف کارانه.', 'error');
      return false;
    }
  };

  const handleBatchImportKaraneh = async (period: string, items: any[]): Promise<boolean> => {
    try {
      const res = await api.batchImportKaraneh(period, items);
      if (res.success) {
        showNotification(res.message || 'کارانه ماهانه با موفقیت از اکسل بارگذاری گردید.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در بارگذاری کارانه.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification(e?.message || 'خطا در پردازش فایل اکسل کارانه.', 'error');
      return false;
    }
  };

  const handleSubmitKaraneh = async (period: string, department?: string): Promise<boolean> => {
    try {
      const res = await api.submitKaraneh(period, department);
      if (res.success) {
        showNotification(res.message || 'کارانه این دوره با موفقیت تأیید و به کارانه نهایی ارسالی ارسال شد.');
        await afterUploadRefresh();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در ارسال کارانه به کارانه نهایی.', 'error');
      return false;
    } catch (e: any) {
      showNotification(e?.message || 'خطا در ارسال کارانه به کارانه نهایی.', 'error');
      return false;
    }
  };

  const handleReopenKaraneh = async (period: string, department?: string): Promise<boolean> => {
    try {
      const res = await api.reopenKaraneh(period, department);
      if (res.success) {
        showNotification(res.message || 'کارانه واحد با موفقیت به وضعیت پیش‌نویس بازگردانده شد.');
        await afterUploadRefresh();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در بازگرداندن کارانه به پیش‌نویس.', 'error');
      return false;
    } catch (e: any) {
      showNotification(e?.message || 'خطا در بازگرداندن کارانه به پیش‌نویس.', 'error');
      return false;
    }
  };

  // Job Group handlers
  const handleSaveJobGroup = async (group: Partial<JobGroup>): Promise<boolean> => {
    try {
      let res;
      if (group.id) {
        res = await api.updateJobGroup(group.id, group);
      } else {
        res = await api.createJobGroup(group);
      }
      if (res.success) {
        showNotification(res.message || 'رتبه شغلی ذخیره شد.');
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('jobGroups', res.data).catch(() => {});
        }
        const updated = await api.getJobGroups();
        setJobGroups(updated);
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در ثبت رتبه شغلی.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در ثبت رتبه شغلی.', 'error');
      return false;
    }
  };

  const handleDeleteJobGroup = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteJobGroup(id);
      if (res.success) {
        showNotification('رتبه شغلی حذف شد.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('jobGroups', id).catch(() => {});
        }
        setJobGroups(prev => prev.filter(g => g.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف رتبه.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در حذف رتبه.', 'error');
      return false;
    }
  };

  // Job Classifications (18-column table) handlers
  const handleSaveClassification = async (record: Partial<JobClassificationRecord>): Promise<boolean> => {
    try {
      const res = record.id
        ? await api.updateJobClassification(record.id, record)
        : await api.createJobClassification(record);
      if (res.success) {
        showNotification(res.message || 'اطلاعات طبقه‌بندی شغلی پرسنل ذخیره شد.');
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('jobClassifications', res.data).catch(() => {});
        }
        const updated = await api.getJobClassifications();
        setJobClassifications(updated);
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در ثبت طبقه‌بندی شغلی.', 'error');
        return false;
      }
    } catch {
      showNotification('خطا در ذخیره طبقه‌بندی شغلی.', 'error');
      return false;
    }
  };

  const handleDeleteClassification = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteJobClassification(id);
      if (res.success) {
        showNotification('ردیف طبقه‌بندی شغلی حذف شد.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('jobClassifications', id).catch(() => {});
        }
        setJobClassifications(prev => prev.filter(item => item.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف ردیف طبقه‌بندی.', 'error');
        return false;
      }
    } catch {
      showNotification('خطا در حذف ردیف طبقه‌بندی.', 'error');
      return false;
    }
  };

  const handleBatchImportClassifications = async (items: any[]): Promise<boolean> => {
    try {
      const res = await api.batchImportJobClassifications(items);
      if (res.success) {
        showNotification(res.message || 'فایل اکسل طبقه‌بندی مشاغل با موفقیت بارگذاری شد.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در ورود اکسل طبقه‌بندی مشاغل.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification(e?.message || 'خطا در ارسال فایل اکسل طبقه‌بندی مشاغل.', 'error');
      return false;
    }
  };

  // Commitment handlers
  const handleSaveCommitment = async (c: Partial<PersonnelCommitment>): Promise<boolean> => {
    try {
      let res;
      if (c.id) {
        res = await api.updateCommitment(c.id, c);
      } else {
        res = await api.createCommitment(c);
      }
      if (res.success) {
        showNotification(res.message || 'سند تعهد با موفقیت ثبت شد.');
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('commitments', res.data).catch(() => {});
        }
        const updated = await api.getCommitments();
        setCommitments(updated);
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در ثبت سند.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در ثبت سند.', 'error');
      return false;
    }
  };

  const handleDeleteCommitment = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteCommitment(id);
      if (res.success) {
        showNotification('سند تعهد حذف شد.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('commitments', id).catch(() => {});
        }
        setCommitments(prev => prev.filter(c => c.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف سند.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در حذف سند.', 'error');
      return false;
    }
  };

  const handleBatchImportCommitments = async (items: any[]): Promise<boolean> => {
    try {
      const res = await api.batchImportCommitments(items);
      if (res.success) {
        showNotification(res.message || 'اسناد تعهدات از فایل اکسل با موفقیت ثبت شد.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در بارگذاری اکسل تعهدات.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification(e?.message || 'خطا در ارسال فایل اکسل تعهدات.', 'error');
      return false;
    }
  };

  // User management handlers
  const handleSaveUser = async (uData: Partial<User> & { password?: string }): Promise<boolean> => {
    try {
      let res;
      if (uData.id) {
        res = await api.updateUser(uData.id, uData);
      } else {
        res = await api.createUser(uData);
      }
      if (res.success) {
        showNotification(res.message || 'کاربر با موفقیت ذخیره شد.');
        if (res.data && currentUser && res.data.id === currentUser.id) {
          setCurrentUser(res.data);
          localStorage.setItem('hr_current_user', JSON.stringify(res.data));
        }
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('users', res.data).catch(() => {});
        }
        const updated = await api.getUsers();
        setUsers(updated);
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در ثبت کاربر.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در ثبت اطلاعات کاربر.', 'error');
      return false;
    }
  };

  const handleDeleteUser = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteUser(id);
      if (res.success) {
        showNotification('کاربر با موفقیت حذف گردید.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('users', id).catch(() => {});
        }
        setUsers(prev => prev.filter(u => u.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف کاربر.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در حذف کاربر.', 'error');
      return false;
    }
  };

  const handleBatchImportUsers = async (items: any[]): Promise<boolean> => {
    try {
      const res = await api.batchImportUsers(items);
      if (res.success) {
        showNotification(res.message || 'کاربران با موفقیت از اکسل تعریف/به‌روزرسانی شدند.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در ورود گروهی کاربران.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification(e?.message || 'خطا در ارسال فایل اکسل کاربران.', 'error');
      return false;
    }
  };

  // Payroll handlers
  const handleBatchImportPayroll = async (
    period: string,
    items: any[],
    useRowYearMonth: boolean
  ): Promise<boolean> => {
    try {
      const res = await api.batchImportPayroll(period, items, useRowYearMonth);
      if (res.success) {
        showNotification(res.message || 'فایل اکسل حقوق با موفقیت در پایگاه داده ثبت شد.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در بارگذاری فایل حقوق.', 'error');
        return false;
      }
    } catch (e: any) {
      showNotification(e?.message || 'خطا در پردازش فایل اکسل حقوق.', 'error');
      return false;
    }
  };

  const handleDeletePayrollRecord = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deletePayrollRecord(id);
      if (res.success) {
        showNotification(res.message || 'رکورد حقوقی حذف شد.');
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('payroll', id).catch(() => {});
        }
        setPayrollList(prev => prev.filter(p => p.id !== id));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف رکورد حقوق.', 'error');
        return false;
      }
    } catch {
      showNotification('خطا در حذف رکورد حقوق.', 'error');
      return false;
    }
  };

  const handleDeletePayrollPeriod = async (period: string): Promise<boolean> => {
    try {
      const matchingIds = payrollList.filter(p => p.period === period).map(p => p.id);
      const res = await api.deletePayrollPeriod(period);
      if (res.success) {
        showNotification(res.message || `اطلاعات حقوق دوره ${period} حذف شد.`);
        if (auth.currentUser?.emailVerified && matchingIds.length > 0) {
          deleteIdsFromFirestore('payroll', matchingIds).catch(() => {});
        }
        setPayrollList(prev => prev.filter(p => p.period !== period));
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      } else {
        showNotification(res.message || 'خطا در حذف دوره حقوقی.', 'error');
        return false;
      }
    } catch {
      showNotification('خطا در حذف دوره حقوقی.', 'error');
      return false;
    }
  };

  // Batch Delete Handlers (حذف گروهی انتخاب‌شده‌ها در تمام جداول)
  const handleBatchDeletePersonnel = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeletePersonnel(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setPersonnelList(prev => prev.filter(p => !idSet.has(p.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('personnel', ids).catch(() => {});
        }
        showNotification(res.message || 'پرونده‌های انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی پرسنل.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی پرسنل.', 'error');
      return false;
    }
  };

  const handleBatchDeleteKaraneh = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeleteKaraneh(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setKaranehList(prev => prev.filter(k => !idSet.has(k.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('karaneh', ids).catch(() => {});
        }
        showNotification(res.message || 'رکوردهای کارانه انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی کارانه.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی کارانه.', 'error');
      return false;
    }
  };

  const handleBatchDeletePayroll = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeletePayroll(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setPayrollList(prev => prev.filter(r => !idSet.has(r.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('payroll', ids).catch(() => {});
        }
        showNotification(res.message || 'رکوردهای حقوق انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی حقوق.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی حقوق.', 'error');
      return false;
    }
  };

  const handleBatchDeleteJobGroups = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeleteJobGroups(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setJobGroups(prev => prev.filter(g => !idSet.has(g.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('jobGroups', ids).catch(() => {});
        }
        showNotification(res.message || 'گروه‌های شغلی انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی رتبه‌ها.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی رتبه‌ها.', 'error');
      return false;
    }
  };

  const handleBatchDeleteClassifications = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeleteJobClassifications(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setJobClassifications(prev => prev.filter(c => !idSet.has(c.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('jobClassifications', ids).catch(() => {});
        }
        showNotification(res.message || 'ردیف‌های طبقه‌بندی انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی طبقه‌بندی مشاغل.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی طبقه‌بندی مشاغل.', 'error');
      return false;
    }
  };

  const handleBatchDeleteCommitments = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeleteCommitments(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setCommitments(prev => prev.filter(c => !idSet.has(c.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('commitments', ids).catch(() => {});
        }
        showNotification(res.message || 'اسناد تعهد انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی تعهدات.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی تعهدات.', 'error');
      return false;
    }
  };

  const handleBatchDeleteUsers = async (ids: string[]): Promise<boolean> => {
    try {
      const res = await api.batchDeleteUsers(ids);
      if (res.success) {
        const updated = await api.getUsers();
        setUsers(updated);
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('users', ids).catch(() => {});
        }
        showNotification(res.message || 'کاربران انتخاب‌شده حذف شدند.');
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        return true;
      }
      showNotification(res.message || 'خطا در حذف گروهی کاربران.', 'error');
      return false;
    } catch {
      showNotification('خطا در حذف گروهی کاربران.', 'error');
      return false;
    }
  };

  // Relatives & Clear-All Table Handlers (حذف کامل جداول + ورود بستگان)
  const handleBatchImportRelatives = async (items: any[]): Promise<boolean> => {
    try {
      const res = await api.batchImportRelatives(items);
      if (res.success) {
        showNotification(res.message || 'اطلاعات بستگان با موفقیت در پرونده پرسنل ثبت شد.');
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        return true;
      }
      showNotification(res.message || 'خطا در ورود اطلاعات بستگان.', 'error');
      return false;
    } catch (e: any) {
      showNotification(e?.message || 'خطا در ارسال اطلاعات بستگان.', 'error');
      return false;
    }
  };

  const handleDeleteAllRelatives = async (): Promise<boolean> => {
    try {
      const res = await api.deleteAllRelatives();
      if (res.success) {
        const updated = await api.getPersonnel();
        setPersonnelList(updated);
        refreshDbStatusAsync();
        mirrorSnapshotInBackground();
        showNotification(res.message || 'کلیه اطلاعات بستگان از پرونده‌ها پاک شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی اطلاعات بستگان.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی اطلاعات بستگان.', 'error');
      return false;
    }
  };

  const handleDeleteAllPersonnel = async (): Promise<boolean> => {
    try {
      const existingIds = personnelList.map(p => p.id);
      const res = await api.deleteAllPersonnel();
      if (res.success) {
        setPersonnelList([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('personnel', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'کلیه اطلاعات جدول پرسنل پاک شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی جدول پرسنل.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی جدول پرسنل.', 'error');
      return false;
    }
  };

  const handleDeleteAllKaraneh = async (period?: string, scope?: 'all' | 'submitted'): Promise<boolean> => {
    try {
      const matchesTarget = (k: KaranehRecord) => {
        if (period && k.period !== period) return false;
        if (scope === 'submitted' && k.status !== 'submitted') return false;
        return true;
      };
      const matchingIds = karanehList.filter(matchesTarget).map(k => k.id);
      const res = await api.deleteAllKaraneh(period, scope);
      if (res.success) {
        setKaranehList(prev => prev.filter(k => !matchesTarget(k)));
        if (auth.currentUser?.emailVerified && matchingIds.length > 0) {
          deleteIdsFromFirestore('karaneh', matchingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'اطلاعات کارانه پاکسازی شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی جدول کارانه.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی جدول کارانه.', 'error');
      return false;
    }
  };

  const handleDeleteAllPayroll = async (): Promise<boolean> => {
    try {
      const existingIds = payrollList.map(r => r.id);
      const res = await api.deleteAllPayroll();
      if (res.success) {
        setPayrollList([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('payroll', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'کلیه فیش‌های حقوق و دستمزد پاکسازی شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی جدول حقوق.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی جدول حقوق.', 'error');
      return false;
    }
  };

  const handleDeleteAllJobGroups = async (): Promise<boolean> => {
    try {
      const existingIds = jobGroups.map(g => g.id);
      const res = await api.deleteAllJobGroups();
      if (res.success) {
        setJobGroups([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('jobGroups', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'کلیه گروه‌های شغلی پاکسازی شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی گروه‌های شغلی.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی گروه‌های شغلی.', 'error');
      return false;
    }
  };

  const handleDeleteAllClassifications = async (): Promise<boolean> => {
    try {
      const existingIds = jobClassifications.map(c => c.id);
      const res = await api.deleteAllJobClassifications();
      if (res.success) {
        setJobClassifications([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('jobClassifications', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'کلیه ردیف‌های جدول ۱۸ ستونی طبقه‌بندی مشاغل پاکسازی شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی جدول طبقه‌بندی مشاغل.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی جدول طبقه‌بندی مشاغل.', 'error');
      return false;
    }
  };

  const handleDeleteAllCommitments = async (): Promise<boolean> => {
    try {
      const existingIds = commitments.map(c => c.id);
      const res = await api.deleteAllCommitments();
      if (res.success) {
        setCommitments([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('commitments', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'کلیه اسناد تعهدات پاکسازی شد.');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی جدول تعهدات.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی جدول تعهدات.', 'error');
      return false;
    }
  };

  const handleDeleteAllUsers = async (): Promise<boolean> => {
    try {
      const protectedUserIds = new Set(
        users.filter(u => u.username === 'javadabadiyan' || u.id === currentUser?.id).map(u => u.id)
      );
      const deletedIds = users.filter(u => !protectedUserIds.has(u.id)).map(u => u.id);
      const res = await api.deleteAllUsers();
      if (res.success) {
        const updated = await api.getUsers();
        setUsers(updated);
        if (auth.currentUser?.emailVerified && deletedIds.length > 0) {
          deleteIdsFromFirestore('users', deletedIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'سایر کاربران جدول حذف شدند (مدیر ارشد و کاربر فعلی محفوظ ماندند).');
        return true;
      }
      showNotification(res.message || 'خطا در پاکسازی جدول کاربران.', 'error');
      return false;
    } catch {
      showNotification('خطا در پاکسازی جدول کاربران.', 'error');
      return false;
    }
  };

  // Mining Operational Volumes & Workshop Machinery Handlers (داشبورد مدیر عامل نگین پرتو نصر)
  const handleSaveMiningVolume = async (record: Partial<MiningVolumeRecord>): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.saveMiningVolume(record);
      if (res.success) {
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('miningVolumes', res.data).catch(() => {});
        }
        setMiningVolumes(await api.getMiningVolumes());
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'آمار حجم عملیات ماهانه ذخیره شد.');
        return { success: true, message: res.message };
      }
      showNotification(res.message || 'خطا در ذخیره آمار حجم عملیات.', 'error');
      return { success: false, message: res.message };
    } catch {
      showNotification('خطا در ذخیره آمار حجم عملیات.', 'error');
      return { success: false, message: 'خطای شبکه' };
    }
  };

  const handleBatchImportMiningVolumes = async (items: any[]): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.batchImportMiningVolumes(items);
      if (res.success) {
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        showNotification(res.message || 'آمار حجم عملیات از اکسل بارگذاری شد.');
        return { success: true, message: res.message };
      }
      showNotification(res.message || 'خطا در ورود اکسل آمار حجم.', 'error');
      return { success: false, message: res.message };
    } catch (e: any) {
      const msg = e?.message || 'خطا در ورود اکسل آمار حجم.';
      showNotification(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const handleDeleteMiningVolume = async (id: string): Promise<void> => {
    try {
      const res = await api.deleteMiningVolume(id);
      if (res.success) {
        setMiningVolumes(prev => prev.filter(v => v.id !== id));
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('miningVolumes', id).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('ردیف آمار حجم حذف شد.');
      }
    } catch {
      showNotification('خطا در حذف ردیف آمار حجم.', 'error');
    }
  };

  const handleBatchDeleteMiningVolumes = async (ids: string[]): Promise<void> => {
    try {
      const res = await api.batchDeleteMiningVolumes(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setMiningVolumes(prev => prev.filter(v => !idSet.has(v.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('miningVolumes', ids).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('ردیف‌های انتخاب‌شده آمار حجم حذف شدند.');
      }
    } catch {
      showNotification('خطا در حذف گروهی آمار حجم.', 'error');
    }
  };

  const handleDeleteAllMiningVolumes = async (): Promise<void> => {
    try {
      const existingIds = miningVolumes.map(v => v.id);
      const res = await api.deleteAllMiningVolumes();
      if (res.success) {
        setMiningVolumes([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('miningVolumes', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('کلیه آمار حجم عملیات پاکسازی شد.');
      }
    } catch {
      showNotification('خطا در پاکسازی آمار حجم.', 'error');
    }
  };

  const handleSaveMiningMachinery = async (record: Partial<MiningMachineryRecord>): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.saveMiningMachinery(record);
      if (res.success) {
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('miningMachinery', res.data).catch(() => {});
        }
        setMiningMachinery(await api.getMiningMachinery());
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'وضعیت دستگاه و تعمیرگاه ثبت شد.');
        return { success: true, message: res.message };
      }
      showNotification(res.message || 'خطا در ثبت اطلاعات دستگاه.', 'error');
      return { success: false, message: res.message };
    } catch {
      showNotification('خطا در ثبت اطلاعات دستگاه.', 'error');
      return { success: false, message: 'خطای شبکه' };
    }
  };

  const handleBatchImportMiningMachinery = async (items: any[]): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.batchImportMiningMachinery(items);
      if (res.success) {
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        showNotification(res.message || 'لیست ماشین‌آلات از اکسل وارد شد.');
        return { success: true, message: res.message };
      }
      showNotification(res.message || 'خطا در ورود اکسل ماشین‌آلات.', 'error');
      return { success: false, message: res.message };
    } catch (e: any) {
      const msg = e?.message || 'خطا در ورود اکسل ماشین‌آلات.';
      showNotification(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const handleDeleteMiningMachinery = async (id: string): Promise<void> => {
    try {
      const res = await api.deleteMiningMachinery(id);
      if (res.success) {
        setMiningMachinery(prev => prev.filter(m => m.id !== id));
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('miningMachinery', id).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('دستگاه از لیست ناوگان حذف شد.');
      }
    } catch {
      showNotification('خطا در حذف دستگاه.', 'error');
    }
  };

  const handleBatchDeleteMiningMachinery = async (ids: string[]): Promise<void> => {
    try {
      const res = await api.batchDeleteMiningMachinery(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setMiningMachinery(prev => prev.filter(m => !idSet.has(m.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('miningMachinery', ids).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('دستگاه‌های انتخاب‌شده حذف شدند.');
      }
    } catch {
      showNotification('خطا در حذف گروهی ماشین‌آلات.', 'error');
    }
  };

  const handleDeleteAllMiningMachinery = async (): Promise<void> => {
    try {
      const existingIds = miningMachinery.map(m => m.id);
      const res = await api.deleteAllMiningMachinery();
      if (res.success) {
        setMiningMachinery([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('miningMachinery', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('کلیه لیست ماشین‌آلات و تعمیرگاه پاکسازی شد.');
      }
    } catch {
      showNotification('خطا در پاکسازی جدول ماشین‌آلات.', 'error');
    }
  };

  // Per-Unit Operational Reports Handlers (دیسپچینگ، تعمیرگاه و کلیه واحدهای معدن)
  const handleSaveUnitReport = async (record: Partial<UnitOperationalReport>): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.saveUnitReport(record);
      if (res.success) {
        if (auth.currentUser?.emailVerified && res.data) {
          syncSingleRecordToFirestore('unitReports', res.data).catch(() => {});
        }
        setUnitReports(await api.getUnitReports());
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification(res.message || 'گزارش عملیاتی واحد با موفقیت در دیتابیس ثبت شد.');
        return { success: true, message: res.message };
      }
      showNotification(res.message || 'خطا در ثبت گزارش واحد.', 'error');
      return { success: false, message: res.message };
    } catch {
      showNotification('خطا در ثبت گزارش واحد.', 'error');
      return { success: false, message: 'خطای شبکه' };
    }
  };

  const handleBatchImportUnitReports = async (items: any[]): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.batchImportUnitReports({ items });
      if (res.success) {
        await afterUploadRefresh();
        mirrorSnapshotInBackground();
        showNotification(res.message || 'گزارش اکسل واحد با موفقیت بارگذاری و به داشبورد مدیرعامل ارسال شد.');
        return { success: true, message: res.message };
      }
      showNotification(res.message || 'خطا در ورود اکسل گزارش واحد.', 'error');
      return { success: false, message: res.message };
    } catch (e: any) {
      const msg = e?.message || 'خطا در ورود اکسل گزارش واحد.';
      showNotification(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const handleDeleteUnitReport = async (id: string): Promise<void> => {
    try {
      const res = await api.deleteUnitReport(id);
      if (res.success) {
        setUnitReports(prev => prev.filter(r => r.id !== id));
        if (auth.currentUser?.emailVerified) {
          deleteSingleFromFirestore('unitReports', id).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('ردیف گزارش عملیاتی واحد حذف شد.');
      }
    } catch {
      showNotification('خطا در حذف گزارش واحد.', 'error');
    }
  };

  const handleBatchDeleteUnitReports = async (ids: string[]): Promise<void> => {
    try {
      const res = await api.batchDeleteUnitReports(ids);
      if (res.success) {
        const idSet = new Set(ids);
        setUnitReports(prev => prev.filter(r => !idSet.has(r.id)));
        if (auth.currentUser?.emailVerified) {
          deleteIdsFromFirestore('unitReports', ids).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('ردیف‌های انتخاب‌شده گزارش واحد حذف شدند.');
      }
    } catch {
      showNotification('خطا در حذف گروهی گزارش‌های واحد.', 'error');
    }
  };

  const handleDeleteAllUnitReports = async (): Promise<void> => {
    try {
      const existingIds = unitReports.map(r => r.id);
      const res = await api.deleteAllUnitReports();
      if (res.success) {
        setUnitReports([]);
        if (auth.currentUser?.emailVerified && existingIds.length > 0) {
          deleteIdsFromFirestore('unitReports', existingIds).catch(() => {});
        }
        refreshDbStatusAsync();
        triggerGitHubAutoSync();
        showNotification('کلیه گزارش‌های عملیاتی واحدها پاکسازی شد.');
      }
    } catch {
      showNotification('خطا در پاکسازی گزارش‌های واحدها.', 'error');
    }
  };

  // Database tools
  const handleRestoreBackup = async (backupData: any): Promise<boolean> => {
    try {
      const res = await api.restoreDatabase(backupData);
      if (res.success) {
        showNotification('پایگاه داده با موفقیت بازگردانی شد.');
        await loadAllData();
        mirrorSnapshotInBackground();
        return true;
      } else {
        showNotification(res.message || 'خطا در بازیابی دیتابیس.', 'error');
        return false;
      }
    } catch (e) {
      showNotification('خطا در بازیابی.', 'error');
      return false;
    }
  };

  const handleResetDemo = async (): Promise<boolean> => {
    try {
      const res = await api.resetDemo();
      if (res.success) {
        showNotification('اطلاعات پیش‌فرض دمو بازنشانی گردید.');
        await loadAllData();
        return true;
      }
      return false;
    } catch (e) {
      showNotification('خطا در بازنشانی.', 'error');
      return false;
    }
  };

  // If not logged in, show Login Screen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Permissions check
  const isSuperAdmin = currentUser.role === 'super_admin' || currentUser.username === 'javadabadiyan';
  const userPerms = isSuperAdmin ? getFullAdminPermissions() : normalizePermissions(currentUser.permissions);

  const canManagePersonnel = isSuperAdmin || (userPerms.personnel.create || userPerms.personnel.edit);
  const canManageKaraneh = isSuperAdmin || (userPerms.karaneh.create || userPerms.karaneh.edit);
  const canManagePayroll = isSuperAdmin || (userPerms.payroll.create || userPerms.payroll.edit);
  const canManageJobGroups = isSuperAdmin || (userPerms.jobGroups.create || userPerms.jobGroups.edit);
  const canManageCommitments = isSuperAdmin || (userPerms.commitments.create || userPerms.commitments.edit);

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col font-sans overflow-x-hidden">
      
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
        onOpenDatabaseModal={() => setActiveTab('database')}
      />

      {/* Responsive Toast Notification */}
      {notification && (
        <div className="fixed bottom-3 left-3 right-3 sm:right-auto sm:left-5 sm:max-w-lg z-50 transition-all no-print">
          <div className={`p-3.5 sm:p-4 rounded-xl shadow-lg border flex items-center justify-between gap-3 text-xs font-bold ${
            notification.type === 'success'
              ? 'bg-slate-900 text-white border-slate-700'
              : 'bg-red-600 text-white border-red-700'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-white shrink-0" />
              )}
              <span className="leading-relaxed break-words">{notification.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              aria-label="بستن پیام"
              className="p-1 text-slate-300 hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-2.5 sm:px-5 lg:px-6 py-3.5 sm:py-5 min-w-0">
        {syncingData && (
          <div className="mb-3 px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-between gap-2 text-xs text-indigo-700 font-semibold">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span>در حال دریافت آخرین اطلاعات از پایگاه داده ابری کلودفلر...</span>
            </div>
          </div>
        )}

        {syncError && !syncingData && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 font-semibold">
            <span>{syncError}</span>
            <button
              type="button"
              onClick={() => loadAllData()}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition cursor-pointer"
            >
              تلاش مجدد دریافت اطلاعات
            </button>
          </div>
        )}

        <Suspense
          fallback={
            <div className="py-12 text-center text-xs text-slate-500 font-semibold">
              در حال باز کردن صفحه...
            </div>
          }
        >
            {activeTab === 'dashboard' && (
              <DashboardOverview
                personnel={personnelList}
                karaneh={karanehList}
                commitments={commitments}
                dbStatus={dbStatus}
                isAdmin={isSuperAdmin}
                canViewDashboardStats={isSuperAdmin || Boolean(userPerms.system?.dashboardStats)}
                canViewSmartDashboard={isSuperAdmin || Boolean(userPerms.smartDashboard?.view)}
                canViewCeoDashboard={isSuperAdmin || Boolean(userPerms.ceoDashboard?.view)}
                canViewUnitOperations={isSuperAdmin || Boolean(userPerms.unitOperations?.view)}
                canViewPersonnel={isSuperAdmin || Boolean(userPerms.personnel?.view)}
                canCreatePersonnel={isSuperAdmin || Boolean(userPerms.personnel?.create)}
                canViewKaraneh={isSuperAdmin || Boolean(userPerms.karaneh?.view)}
                canImportKaraneh={isSuperAdmin || Boolean(userPerms.karaneh?.importExcel)}
                canViewFinalKaraneh={isSuperAdmin || Boolean(userPerms.finalKaraneh?.view)}
                canViewCommitments={isSuperAdmin || Boolean(userPerms.commitments?.view)}
                canViewJobGroups={isSuperAdmin || Boolean(userPerms.jobGroups?.view)}
                canViewPayroll={isSuperAdmin || Boolean(userPerms.payroll?.view)}
                canViewUsers={isSuperAdmin || Boolean(userPerms.users?.view)}
                canBackupDatabase={isSuperAdmin || Boolean(userPerms.system?.backupDatabase)}
                canRestoreDatabase={isSuperAdmin || Boolean(userPerms.system?.restoreDatabase)}
                onNavigate={setActiveTab}
                onOpenAddPersonnel={() => setActiveTab('personnel')}
                onOpenUploadKaraneh={() => setActiveTab('karaneh')}
              />
            )}

            {activeTab === 'smart-dashboard' && (
              (isSuperAdmin || userPerms.smartDashboard?.view) ? (
                <SmartPersonnelDashboard
                  personnel={personnelList}
                  jobGroups={jobGroups}
                  jobClassifications={jobClassifications}
                  commitments={commitments}
                  granularPermissions={userPerms.smartDashboard}
                  isSuperAdmin={isSuperAdmin}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به داشبورد گزارش‌گیری هوشمند</div>
                  <p>مجوز مشاهده نمودارها و گزارش‌های هوشمند پرسنل برای نقش کاربری شما فعال نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'ceo-dashboard' && (
              (isSuperAdmin || userPerms.ceoDashboard?.view) ? (
                <CeoDashboardModule
                  users={users}
                  personnel={personnelList}
                  karanehList={karanehList}
                  payrollList={payrollList}
                  jobGroups={jobGroups}
                  jobClassifications={jobClassifications}
                  commitments={commitments}
                  miningVolumes={miningVolumes}
                  miningMachinery={miningMachinery}
                  unitReports={unitReports}
                  onSaveVolume={handleSaveMiningVolume}
                  onBatchImportVolumes={handleBatchImportMiningVolumes}
                  onDeleteVolume={handleDeleteMiningVolume}
                  onBatchDeleteVolumes={handleBatchDeleteMiningVolumes}
                  onDeleteAllVolumes={handleDeleteAllMiningVolumes}
                  onSaveMachinery={handleSaveMiningMachinery}
                  onBatchImportMachinery={handleBatchImportMiningMachinery}
                  onDeleteMachinery={handleDeleteMiningMachinery}
                  onBatchDeleteMachinery={handleBatchDeleteMiningMachinery}
                  onDeleteAllMachinery={handleDeleteAllMiningMachinery}
                  granularPermissions={userPerms.ceoDashboard}
                  isSuperAdmin={isSuperAdmin}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">دسترسی اختصاصی مدیر عامل</div>
                  <p>مجوز مشاهده داشبورد راهبردی مدیر عامل شرکت نگین پرتو نصر برای حساب کاربری شما تعریف نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'unit-operations' && (
              (isSuperAdmin || userPerms.unitOperations?.view) ? (
                <UnitOperationsModule
                  currentUser={currentUser}
                  miningVolumes={miningVolumes}
                  miningMachinery={miningMachinery}
                  unitReports={unitReports}
                  granularPermissions={userPerms.unitOperations}
                  isSuperAdmin={isSuperAdmin}
                  onSaveVolume={handleSaveMiningVolume}
                  onBatchImportVolumes={handleBatchImportMiningVolumes}
                  onDeleteVolume={handleDeleteMiningVolume}
                  onBatchDeleteVolumes={handleBatchDeleteMiningVolumes}
                  onDeleteAllVolumes={handleDeleteAllMiningVolumes}
                  onSaveMachinery={handleSaveMiningMachinery}
                  onBatchImportMachinery={handleBatchImportMiningMachinery}
                  onDeleteMachinery={handleDeleteMiningMachinery}
                  onBatchDeleteMachinery={handleBatchDeleteMiningMachinery}
                  onDeleteAllMachinery={handleDeleteAllMiningMachinery}
                  onSaveUnitReport={handleSaveUnitReport}
                  onBatchImportUnitReports={handleBatchImportUnitReports}
                  onDeleteUnitReport={handleDeleteUnitReport}
                  onBatchDeleteUnitReports={handleBatchDeleteUnitReports}
                  onDeleteAllUnitReports={handleDeleteAllUnitReports}
                  onNavigateToCeoDashboard={() => setActiveTab('ceo-dashboard')}
                  canViewCeoDashboard={isSuperAdmin || Boolean(userPerms.ceoDashboard?.view)}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به پنل عملیات واحدهای معدن</div>
                  <p>مجوز مشاهده و بارگذاری اطلاعات واحدهای عملیاتی، دیسپچینگ و تعمیرگاه برای حساب کاربری شما فعال نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'personnel' && (
              (isSuperAdmin || userPerms.personnel.view) ? (
                <PersonnelModule
                  personnelList={personnelList}
                  jobGroups={jobGroups}
                  onSavePersonnel={handleSavePersonnel}
                  onDeletePersonnel={handleDeletePersonnel}
                  onBatchDeletePersonnel={handleBatchDeletePersonnel}
                  onDeleteAllPersonnel={handleDeleteAllPersonnel}
                  onBatchImportPersonnel={handleBatchImportPersonnel}
                  onBatchImportRelatives={handleBatchImportRelatives}
                  onDeleteAllRelatives={handleDeleteAllRelatives}
                  canManage={canManagePersonnel}
                  canExport={isSuperAdmin || Boolean(userPerms.personnel.exportExcel)}
                  canImport={isSuperAdmin || Boolean(userPerms.personnel.importExcel)}
                  granularPermissions={userPerms.personnel}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به ماژول پرونده پرسنلی</div>
                  <p>مجوز مشاهده پرونده‌های پرسنلی برای نقش کاربری شما فعال نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'karaneh' && (
              (isSuperAdmin || userPerms.karaneh.view) ? (
                <KaranehModule
                  personnelList={personnelList.length > 0 ? personnelList : karanehUnitPersonnel}
                  karanehList={karanehList}
                  onSaveKaraneh={handleSaveKaraneh}
                  onDeleteKaraneh={handleDeleteKaraneh}
                  onBatchDeleteKaraneh={handleBatchDeleteKaraneh}
                  onDeleteAllKaraneh={handleDeleteAllKaraneh}
                  onBatchImportKaraneh={handleBatchImportKaraneh}
                  onSubmitKaraneh={handleSubmitKaraneh}
                  canManage={canManageKaraneh}
                  canExport={isSuperAdmin || Boolean(userPerms.karaneh.exportExcel)}
                  canImport={isSuperAdmin || Boolean(userPerms.karaneh.importExcel)}
                  granularPermissions={userPerms.karaneh}
                  userPermissions={userPerms}
                  isAdmin={isSuperAdmin}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به سامانه کارانه</div>
                  <p>مجوز مشاهده و تحلیل کارانه پرسنل برای شما تعریف نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'final-karaneh' && (
              (isSuperAdmin || userPerms.finalKaraneh?.view) ? (
                <FinalKaranehModule
                  karanehList={karanehList}
                  onSaveKaraneh={handleSaveKaraneh}
                  onDeleteKaraneh={handleDeleteKaraneh}
                  onBatchDeleteKaraneh={handleBatchDeleteKaraneh}
                  onDeleteAllKaraneh={handleDeleteAllKaraneh}
                  onReopenKaraneh={handleReopenKaraneh}
                  canEdit={isSuperAdmin || Boolean(userPerms.finalKaraneh?.edit)}
                  canDelete={isSuperAdmin || Boolean(userPerms.finalKaraneh?.delete)}
                  canDeleteAll={isSuperAdmin || Boolean(userPerms.finalKaraneh?.deleteAll)}
                  canExportExcel={isSuperAdmin || Boolean(userPerms.finalKaraneh?.exportExcel)}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به کارانه نهایی ارسالی</div>
                  <p>مجوز مشاهده کارانه نهایی ارسالی واحدها برای حساب کاربری شما فعال نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'payroll' && (
              userPerms.payroll.view ? (
                <PayrollModule
                  payrollList={payrollList}
                  onBatchImportPayroll={handleBatchImportPayroll}
                  onDeletePayrollRecord={handleDeletePayrollRecord}
                  onBatchDeletePayroll={handleBatchDeletePayroll}
                  onDeleteAllPayroll={handleDeleteAllPayroll}
                  onDeletePayrollPeriod={handleDeletePayrollPeriod}
                  canManage={canManagePayroll}
                  granularPermissions={userPerms.payroll}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به سامانه حقوق و دستمزد</div>
                  <p>مجوز مشاهده و تحلیل فیش‌های حقوقی برای حساب کاربری شما فعال نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'job-groups' && (
              userPerms.jobGroups.view ? (
                <JobGroupsModule
                  jobGroups={jobGroups}
                  classifications={jobClassifications}
                  personnelList={personnelList}
                  onSaveJobGroup={handleSaveJobGroup}
                  onDeleteJobGroup={handleDeleteJobGroup}
                  onBatchDeleteJobGroups={handleBatchDeleteJobGroups}
                  onDeleteAllJobGroups={handleDeleteAllJobGroups}
                  onSaveClassification={handleSaveClassification}
                  onDeleteClassification={handleDeleteClassification}
                  onBatchDeleteClassifications={handleBatchDeleteClassifications}
                  onDeleteAllClassifications={handleDeleteAllClassifications}
                  onBatchImportClassifications={handleBatchImportClassifications}
                  canManage={canManageJobGroups}
                  granularPermissions={userPerms.jobGroups}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به رتبه‌های شغلی</div>
                  <p>مجوز مشاهده و تنظیم گروه‌های شغلی برای حساب کاربری شما محدود شده است.</p>
                </div>
              )
            )}

            {activeTab === 'commitments' && (
              userPerms.commitments.view ? (
                <CommitmentsModule
                  commitments={commitments}
                  personnelList={personnelList}
                  onSaveCommitment={handleSaveCommitment}
                  onDeleteCommitment={handleDeleteCommitment}
                  onBatchDeleteCommitments={handleBatchDeleteCommitments}
                  onDeleteAllCommitments={handleDeleteAllCommitments}
                  onBatchImportCommitments={handleBatchImportCommitments}
                  canManage={canManageCommitments}
                  granularPermissions={userPerms.commitments}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">عدم دسترسی به اسناد تعهدات</div>
                  <p>مجوز دسترسی به بخش اسناد و تضامین پرسنلی برای شما تعریف نشده است.</p>
                </div>
              )
            )}

            {activeTab === 'database' && (
              (isSuperAdmin || userPerms.system.backupDatabase || userPerms.system.restoreDatabase) ? (
                <LocalHostDatabaseModule
                  dbStatus={dbStatus}
                  firebaseUserEmail={firebaseUser?.email || null}
                  firebaseSyncing={firebaseSyncing}
                  canBackup={isSuperAdmin || Boolean(userPerms.system.backupDatabase)}
                  canRestore={isSuperAdmin || Boolean(userPerms.system.restoreDatabase)}
                  onConnectGoogleFirebase={handleConnectGoogleFirebase}
                  onSyncToFirestore={handleSyncToFirestore}
                  onPullFromFirestore={handlePullFromFirestore}
                  onRefreshStatus={async () => {
                    const s = await api.getDatabaseStatus();
                    setDbStatus(s);
                  }}
                  onDataReload={() => loadAllData()}
                  onRestoreBackup={handleRestoreBackup}
                  onResetDemo={handleResetDemo}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">دسترسی محدود شده</div>
                  <p>بخش پشتیبان‌گیری، بازیابی و راهنمای پایگاه داده منحصراً در اختیار کاربران مجاز و مدیر ارشد سامانه است.</p>
                </div>
              )
            )}

            {activeTab === 'users' && (
              (isSuperAdmin || userPerms.users.view) ? (
                <UsersModule
                  users={users}
                  currentUser={currentUser}
                  onSaveUser={handleSaveUser}
                  onDeleteUser={handleDeleteUser}
                  onBatchDeleteUsers={handleBatchDeleteUsers}
                  onDeleteAllUsers={handleDeleteAllUsers}
                  onBatchImportUsers={handleBatchImportUsers}
                  granularPermissions={userPerms.users}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">دسترسی محدود شده</div>
                  <p>مدیریت کاربران و سطوح دسترسی منحصراً در اختیار کاربران مجاز و مدیر ارشد می‌باشد.</p>
                </div>
              )
            )}
          </Suspense>
      </main>

      {/* Footer */}
      <footer className="no-print border-t border-slate-200 bg-white py-3.5 text-center text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto px-4 text-center font-medium">
          طراحی و کد نویسی جواد آبادیان
        </div>
      </footer>

    </div>
  );
}
