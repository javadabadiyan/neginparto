export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string; // e.g., 'db-data' (separate from 'main' code branch) or 'main' inside a separate private DB repo
  filePath: string; // e.g., 'database.json'
  token: string; // Stored strictly in user's browser localStorage
  autoSync: boolean;
  lastSyncedAt?: string;
  lastCommitUrl?: string;
}

export interface GitHubConnectionTestResult {
  ok: boolean;
  repoPrivate: boolean;
  defaultBranch: string;
  branchExists: boolean;
  fileExists: boolean;
  fileSizeBytes?: number;
  message: string;
}

const LS_GH_SYNC_CONFIG = 'npn_github_sync_config_v1';

export function loadGitHubSyncConfig(): GitHubSyncConfig {
  try {
    const raw = localStorage.getItem(LS_GH_SYNC_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        owner: String(parsed.owner || '').trim(),
        repo: String(parsed.repo || '').trim(),
        branch: String(parsed.branch || 'db-data').trim() || 'db-data',
        filePath: String(parsed.filePath || 'database.json').trim() || 'database.json',
        token: String(parsed.token || '').trim(),
        autoSync: parsed.autoSync !== undefined ? Boolean(parsed.autoSync) : true,
        lastSyncedAt: parsed.lastSyncedAt ? String(parsed.lastSyncedAt) : undefined,
        lastCommitUrl: parsed.lastCommitUrl ? String(parsed.lastCommitUrl) : undefined,
      };
    }
  } catch {
    // ignore corrupted config
  }
  return {
    owner: '',
    repo: '',
    branch: 'db-data',
    filePath: 'database.json',
    token: '',
    autoSync: true,
  };
}

export function saveGitHubSyncConfig(cfg: GitHubSyncConfig): void {
  localStorage.setItem(LS_GH_SYNC_CONFIG, JSON.stringify(cfg));
}

export function clearGitHubSyncConfig(): GitHubSyncConfig {
  localStorage.removeItem(LS_GH_SYNC_CONFIG);
  return {
    owner: '',
    repo: '',
    branch: 'db-data',
    filePath: 'database.json',
    token: '',
    autoSync: true,
  };
}

export function isGitHubSyncConfigured(cfg?: GitHubSyncConfig): boolean {
  const c = cfg || loadGitHubSyncConfig();
  return Boolean(c.owner && c.repo && c.branch && c.filePath && c.token);
}

export function isGitHubAutoSyncEnabled(): boolean {
  const c = loadGitHubSyncConfig();
  return Boolean(c.autoSync && isGitHubSyncConfigured(c));
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeUtf8Base64(b64: string): string {
  const cleaned = b64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function getHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function buildContentsUrl(cfg: GitHubSyncConfig): string {
  const cleanPath = cfg.filePath
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cleanPath}`;
}

async function getRepoInfo(cfg: GitHubSyncConfig): Promise<{ isPrivate: boolean; defaultBranch: string }> {
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const repoRes = await fetch(baseUrl, { headers, cache: 'no-store' });
  if (!repoRes.ok) {
    const errBody = await repoRes.json().catch(() => ({}));
    if (repoRes.status === 401) {
      throw new Error('توکن دسترسی گیت‌هاب نامعتبر یا منقضی شده است.');
    }
    if (repoRes.status === 404) {
      throw new Error(`مخزن ${cfg.owner}/${cfg.repo} یافت نشد یا توکن دسترسی به آن را ندارد.`);
    }
    throw new Error(errBody?.message || 'امکان دسترسی به مخزن گیت‌هاب وجود ندارد.');
  }
  const repoInfo = await repoRes.json();
  return {
    isPrivate: Boolean(repoInfo.private),
    defaultBranch: repoInfo.default_branch || 'main',
  };
}

async function ensureBranchExists(cfg: GitHubSyncConfig): Promise<{ isPrivate: boolean; defaultBranch: string }> {
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const repoMeta = await getRepoInfo(cfg);

  const checkRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers,
    cache: 'no-store',
  });
  if (checkRes.ok) return repoMeta;

  const defaultRefRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(repoMeta.defaultBranch)}`, {
    headers,
    cache: 'no-store',
  });
  if (!defaultRefRes.ok) {
    throw new Error(
      `شاخه مرجع ${repoMeta.defaultBranch} در مخزن یافت نشد. ابتدا حداقل یک فایل (مثلاً README) در مخزن ایجاد کنید.`
    );
  }
  const defaultRef = await defaultRefRes.json();
  const sha = defaultRef?.object?.sha;
  if (!sha) {
    throw new Error('شناسه کامیت اولیه مخزن یافت نشد.');
  }

  const createRefRes = await fetch(`${baseUrl}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${cfg.branch}`,
      sha,
    }),
  });
  if (!createRefRes.ok && createRefRes.status !== 422) {
    const errBody = await createRefRes.json().catch(() => ({}));
    throw new Error(errBody?.message || `خطا در ایجاد شاخه مجزای ${cfg.branch}`);
  }

  return repoMeta;
}

export async function testGitHubConnection(cfg: GitHubSyncConfig): Promise<GitHubConnectionTestResult> {
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.filePath || !cfg.token) {
    throw new Error('نام کاربری گیت‌هاب، نام مخزن، نام شاخه، مسیر فایل و توکن دسترسی (PAT) باید تکمیل شوند.');
  }
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const repoMeta = await getRepoInfo(cfg);

  const refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers,
    cache: 'no-store',
  });
  const branchExists = refRes.ok;

  let fileExists = false;
  let fileSizeBytes: number | undefined;
  if (branchExists) {
    const fileUrl = `${buildContentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
    const fileRes = await fetch(fileUrl, { headers, cache: 'no-store' });
    if (fileRes.ok) {
      const fMeta = await fileRes.json().catch(() => ({}));
      fileExists = true;
      fileSizeBytes = typeof fMeta.size === 'number' ? fMeta.size : undefined;
    }
  }

  const privacyText = repoMeta.isPrivate
    ? 'مخزن به‌صورت خصوصی (Private) است و امنیت اطلاعات حفظ می‌شود.'
    : 'هشدار امنیتی: این مخزن عمومی (Public) است! برای نگهداری داده‌های پرسنلی و حقوقی، مخزن را در گیت‌هاب به حالت Private تغییر دهید یا یک مخزن Private جداگانه برای دیتابیس بسازید.';

  const branchText = branchExists
    ? `شاخه «${cfg.branch}» آماده است.`
    : `شاخه «${cfg.branch}» هنوز ساخته نشده است و در اولین ذخیره به‌صورت خودکار ایجاد می‌شود.`;

  const fileText = fileExists
    ? `فایل ${cfg.filePath} (${((fileSizeBytes || 0) / 1024).toFixed(1)} کیلوبایت) در گیت‌هاب موجود است.`
    : `فایل ${cfg.filePath} هنوز ایجاد نشده است و در اولین ارسال ساخته می‌شود.`;

  return {
    ok: true,
    repoPrivate: repoMeta.isPrivate,
    defaultBranch: repoMeta.defaultBranch,
    branchExists,
    fileExists,
    fileSizeBytes,
    message: `${privacyText} ${branchText} ${fileText}`,
  };
}

/**
 * Commit large snapshots (>900KB) via Git Data API (Blob -> Tree -> Commit -> Update Ref)
 * so databases with scanned documents or thousands of payroll rows never hit Contents API size limits.
 */
async function pushViaGitDataApi(
  cfg: GitHubSyncConfig,
  encodedBase64Content: string,
  commitMessage: string
): Promise<{ commitUrl?: string; sha: string }> {
  const headers = getHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const cleanPath = cfg.filePath.replace(/^\/+/, '');

  // 1. Get current branch HEAD commit SHA & tree SHA
  const refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers,
    cache: 'no-store',
  });
  if (!refRes.ok) throw new Error(`شاخه ${cfg.branch} یافت نشد.`);
  const refData = await refRes.json();
  const parentCommitSha = refData?.object?.sha;

  const commitRes = await fetch(`${baseUrl}/git/commits/${parentCommitSha}`, { headers, cache: 'no-store' });
  if (!commitRes.ok) throw new Error('امکان خواندن کامیت فعلی شاخه وجود ندارد.');
  const commitData = await commitRes.json();
  const baseTreeSha = commitData?.tree?.sha;

  // 2. Create Blob
  const blobRes = await fetch(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: encodedBase64Content,
      encoding: 'base64',
    }),
  });
  const blobData = await blobRes.json().catch(() => ({}));
  if (!blobRes.ok || !blobData?.sha) {
    throw new Error(blobData?.message || 'خطا در ایجاد Blob پایگاه داده روی گیت‌هاب.');
  }

  // 3. Create Tree
  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        {
          path: cleanPath,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        },
      ],
    }),
  });
  const treeData = await treeRes.json().catch(() => ({}));
  if (!treeRes.ok || !treeData?.sha) {
    throw new Error(treeData?.message || 'خطا در ساخت ساختار درخت فایل روی گیت‌هاب.');
  }

  // 4. Create Commit
  const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: treeData.sha,
      parents: [parentCommitSha],
    }),
  });
  const newCommitData = await newCommitRes.json().catch(() => ({}));
  if (!newCommitRes.ok || !newCommitData?.sha) {
    throw new Error(newCommitData?.message || 'خطا در ثبت کامیت پایگاه داده.');
  }

  // 5. Update Branch Ref
  const updateRefRes = await fetch(`${baseUrl}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: false,
    }),
  });
  const updateRefData = await updateRefRes.json().catch(() => ({}));
  if (!updateRefRes.ok) {
    const err = new Error(updateRefData?.message || 'خطا در به‌روزرسانی شاخه دیتابیس.');
    (err as any).status = updateRefRes.status;
    throw err;
  }

  return {
    commitUrl: newCommitData.html_url || `https://github.com/${cfg.owner}/${cfg.repo}/commit/${newCommitData.sha}`,
    sha: blobData.sha,
  };
}

export async function pushDatabaseToGitHub(
  cfg: GitHubSyncConfig,
  snapshot: Record<string, any>
): Promise<{ commitUrl?: string; sha: string; repoPrivate: boolean }> {
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.filePath || !cfg.token) {
    throw new Error('تکمیل نام کاربری گیت‌هاب، نام مخزن، نام شاخه، مسیر فایل و توکن دسترسی (PAT) الزامی است.');
  }

  const repoMeta = await ensureBranchExists(cfg);

  // Prevent accidentally committing DB over app source code branch when user sets branch = defaultBranch unless it's clearly a dedicated repo
  if ((cfg.branch === 'main' || cfg.branch === 'master') && cfg.filePath === 'package.json') {
    throw new Error('مسیر فایل دیتابیس نباید با فایل‌های کد تداخل داشته باشد.');
  }

  const headers = getHeaders(cfg.token);
  const fileUrl = buildContentsUrl(cfg);

  const payloadWithMeta = {
    ...snapshot,
    _githubSyncMeta: {
      syncedAt: new Date().toISOString(),
      branch: cfg.branch,
      company: 'شرکت نگین پرتو نصر',
      schemaVersion: '5.0-negin-parto-nasr-units-hub',
    },
  };
  const jsonText = JSON.stringify(payloadWithMeta, null, 2);
  const encodedContent = encodeUtf8Base64(jsonText);
  const commitMessage = `chore(db-sync): update Negine Parto Nasr database (${new Date().toISOString()})`;

  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Use Git Data API for large payloads (~ > 850KB base64) to bypass Contents API 1MB limit
      if (encodedContent.length > 850_000) {
        const res = await pushViaGitDataApi(cfg, encodedContent, commitMessage);
        const syncedAt = new Date().toLocaleString('fa-IR');
        saveGitHubSyncConfig({ ...cfg, lastSyncedAt: syncedAt, lastCommitUrl: res.commitUrl });
        return { ...res, repoPrivate: repoMeta.isPrivate };
      }

      // Fetch latest existing file SHA before PUT
      let existingSha: string | undefined;
      const getRes = await fetch(`${fileUrl}?ref=${encodeURIComponent(cfg.branch)}`, {
        headers,
        cache: 'no-store',
      });
      if (getRes.ok) {
        const fileMeta = await getRes.json();
        existingSha = fileMeta.sha;
      }

      const putRes = await fetch(fileUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          content: encodedContent,
          branch: cfg.branch,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });

      const putJson = await putRes.json().catch(() => ({}));
      if (putRes.status === 409 || putRes.status === 422) {
        lastError = new Error(putJson?.message || 'تداخل همزمانی ویرایش روی گیت‌هاب (SHA Conflict)');
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
      }

      if (!putRes.ok) {
        throw new Error(putJson?.message || 'خطا در ثبت فایل پایگاه داده روی گیت‌هاب.');
      }

      const commitUrl = putJson?.commit?.html_url;
      const syncedAt = new Date().toLocaleString('fa-IR');
      saveGitHubSyncConfig({ ...cfg, lastSyncedAt: syncedAt, lastCommitUrl: commitUrl });

      return {
        commitUrl,
        sha: putJson?.content?.sha || '',
        repoPrivate: repoMeta.isPrivate,
      };
    } catch (err: any) {
      lastError = err;
      if (err?.status === 409 || err?.status === 422) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
      }
      if (attempt >= maxAttempts) break;
    }
  }

  throw lastError || new Error('خطا در ذخیره فایل پایگاه داده روی گیت‌هاب.');
}

export async function pullDatabaseFromGitHub(cfg: GitHubSyncConfig): Promise<Record<string, any>> {
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.filePath || !cfg.token) {
    throw new Error('مشخصات مخزن و توکن دسترسی (PAT) گیت‌هاب کامل نیست.');
  }

  const headers = getHeaders(cfg.token);
  const fileUrl = `${buildContentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;

  const res = await fetch(fileUrl, { headers, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `فایل ${cfg.filePath} در شاخه ${cfg.branch} یافت نشد.`);
  }

  let rawJsonText = '';
  if (data.content) {
    rawJsonText = decodeUtf8Base64(data.content);
  } else if (data.git_url) {
    const blobRes = await fetch(data.git_url, { headers, cache: 'no-store' });
    const blobData = await blobRes.json();
    rawJsonText = decodeUtf8Base64(blobData.content || '');
  } else if (data.sha) {
    const blobRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/blobs/${encodeURIComponent(data.sha)}`,
      { headers, cache: 'no-store' }
    );
    const blobData = await blobRes.json();
    rawJsonText = decodeUtf8Base64(blobData.content || '');
  } else {
    throw new Error('محتوای فایل پایگاه داده از گیت‌هاب قابل دریافت نبود.');
  }

  const parsed = JSON.parse(rawJsonText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ساختار فایل JSON دریافتی از گیت‌هاب نامعتبر است.');
  }
  return parsed;
}

// Debounced automatic background sync to GitHub file database
let ghPushTimer: ReturnType<typeof setTimeout> | null = null;
let ghPushInFlight = false;
let ghPushQueued = false;

export function scheduleBackgroundGitHubPush(
  fetchSnapshot: () => Promise<{ success?: boolean; data?: Record<string, any> }>,
  onSynced?: (result: { commitUrl?: string; syncedAt: string }) => void,
  onError?: (message: string) => void
): void {
  if (!isGitHubAutoSyncEnabled()) return;

  if (ghPushTimer) {
    clearTimeout(ghPushTimer);
  }

  ghPushTimer = setTimeout(async () => {
    if (ghPushInFlight) {
      ghPushQueued = true;
      return;
    }

    const executePush = async () => {
      const cfg = loadGitHubSyncConfig();
      if (!cfg.autoSync || !isGitHubSyncConfigured(cfg)) return;
      ghPushInFlight = true;
      try {
        const snapRes = await fetchSnapshot();
        if (snapRes?.success && snapRes.data) {
          const result = await pushDatabaseToGitHub(cfg, snapRes.data);
          onSynced?.({
            commitUrl: result.commitUrl,
            syncedAt: new Date().toLocaleString('fa-IR'),
          });
        }
      } catch (err: any) {
        console.warn('Background GitHub DB sync skipped:', err);
        onError?.(err?.message || 'خطا در همگام‌سازی خودکار با گیت‌هاب');
      } finally {
        ghPushInFlight = false;
        if (ghPushQueued) {
          ghPushQueued = false;
          await executePush();
        }
      }
    };

    await executePush();
  }, 1600);
}
