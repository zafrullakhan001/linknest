/** In-app GitHub commits + Releases updater service (admin only). */

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }
  return '/api';
}

const API_BASE = resolveApiBase();

export interface UpdaterRelease {
  tag: string;
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  assetName: string | null;
  assetUrl: string | null;
  assetId: number | null;
}

export interface UpdaterCommit {
  sha: string;
  shortSha: string;
  message: string;
  body: string;
  author: string;
  date: string;
  htmlUrl: string;
  kind: 'commit';
}

export interface UpdaterJob {
  status: 'running' | 'success' | 'error' | 'idle' | string;
  percent?: number;
  message?: string;
  log?: string[];
  tag?: string;
  sha?: string;
  version?: string;
  mode?: string;
  rollback?: boolean;
  backupDatabase?: boolean;
  restoreDatabase?: boolean;
  historyId?: string;
  error?: string | null;
  newVersion?: string;
  startedAt?: number;
  finishedAt?: number;
  updatedAt?: number;
}

export interface UpdaterHistoryEntry {
  id?: string;
  capturedAt: number;
  capturedAtIso?: string | null;
  label: string;
  gitCommit: string | null;
  appVersion: string;
  releaseTag?: string | null;
  message?: string | null;
  dbSnapshotId?: string | null;
  dbBytes?: number | null;
  filesChanged?: number | null;
  approxBytes?: number | null;
  hasDbBackup?: boolean;
}

export interface UpdaterDbSnapshot {
  id: string;
  createdAt: number;
  createdAtIso?: string;
  gitCommit?: string | null;
  appVersion?: string | null;
  label?: string;
  reason?: string | null;
  dbBytes?: number;
  dbSizeLabel?: string;
}

export interface UpdaterPreviewFile {
  path: string;
  status: string;
  fromPath?: string | null;
  additions: number;
  deletions: number;
  approxBytes: number;
  binary?: boolean;
}

export interface UpdaterPreview {
  base: string | null;
  target: {
    type: string;
    ref: string;
    tag?: string | null;
    version?: string | null;
    message?: string | null;
  };
  source: string;
  files: UpdaterPreviewFile[];
  filesChanged: number;
  additions: number;
  deletions: number;
  approxBytes: number;
  approxSizeLabel: string;
  needsRebuild: boolean;
  estimateSeconds: number;
  estimateLabel: string;
  commits: { sha?: string; shortSha: string; message: string }[];
  commitCount: number;
  note?: string;
}

export interface UpdaterStatus {
  currentVersion: string;
  releaseTag?: string | null;
  gitCommit?: string | null;
  commitMessage?: string | null;
  trackBranch?: string;
  mode: 'git' | 'zip' | string;
  capabilities: {
    gitAvailable: boolean;
    nodeAvailable: boolean;
    zipAvailable: boolean;
    mode: string;
    projectRoot?: string;
  };
  updateAvailable: boolean;
  updateCount: number;
  aheadBy?: number;
  commitUpdates?: UpdaterCommit[];
  latestCommit?: UpdaterCommit | null;
  releases?: UpdaterRelease[];
  latest: UpdaterRelease | null;
  canApply: boolean;
  canRollback?: boolean;
  rollbackTarget?: UpdaterHistoryEntry | null;
  history?: UpdaterHistoryEntry[];
  historyCount?: number;
  dbSnapshots?: UpdaterDbSnapshot[];
  repo: string;
  tokenConfigured?: boolean;
  checkedAt: number | null;
  checkIntervalMinutes: number;
  job: UpdaterJob | null;
  error?: string | null;
}

export interface UpdaterReleasesPayload {
  currentVersion: string;
  releases: UpdaterRelease[];
  allReleases: UpdaterRelease[];
  fetchedAt: number | null;
  repo: string;
}

export interface UpdaterCommitsPayload {
  branch: string;
  base: string | null;
  aheadBy: number;
  commits: UpdaterCommit[];
  fetchedAt: number | null;
  repo: string;
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function getUpdaterStatus(): Promise<UpdaterStatus> {
  const res = await fetch(`${API_BASE}/updater/status`, { credentials: 'include' });
  const data = await parseJson(res);
  return data.data as UpdaterStatus;
}

export async function getUpdaterReleases(): Promise<UpdaterReleasesPayload> {
  const res = await fetch(`${API_BASE}/updater/releases`, { credentials: 'include' });
  const data = await parseJson(res);
  return data.data as UpdaterReleasesPayload;
}

export async function getUpdaterCommits(): Promise<UpdaterCommitsPayload> {
  const res = await fetch(`${API_BASE}/updater/commits`, { credentials: 'include' });
  const data = await parseJson(res);
  return data.data as UpdaterCommitsPayload;
}

export async function getUpdaterPreview(opts: {
  sha?: string;
  tag?: string;
}): Promise<UpdaterPreview> {
  const params = new URLSearchParams();
  if (opts.sha) params.set('sha', opts.sha);
  if (opts.tag) params.set('tag', opts.tag);
  const res = await fetch(`${API_BASE}/updater/preview?${params.toString()}`, {
    credentials: 'include',
  });
  const data = await parseJson(res);
  return data.data as UpdaterPreview;
}

export async function checkUpdaterReleases(): Promise<UpdaterStatus> {
  const res = await fetch(`${API_BASE}/updater/check`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await parseJson(res);
  return data.data as UpdaterStatus;
}

export async function applyUpdaterRelease(opts?: {
  tag?: string;
  sha?: string;
  backupDatabase?: boolean;
  previewFilesChanged?: number;
  previewApproxBytes?: number;
}): Promise<{
  started: boolean;
  async: boolean;
  tag?: string | null;
  sha?: string;
  mode?: string;
  backupDatabase?: boolean;
  job: UpdaterJob | null;
}> {
  const res = await fetch(`${API_BASE}/updater/apply`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts || {}),
  });
  const data = await parseJson(res);
  return data.data;
}

export async function rollbackUpdater(opts?: {
  historyId?: string;
  restoreDatabase?: boolean;
}): Promise<{
  started: boolean;
  async: boolean;
  job: UpdaterJob | null;
  restoreDatabase?: boolean;
}> {
  const res = await fetch(`${API_BASE}/updater/rollback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts || {}),
  });
  const data = await parseJson(res);
  return data.data;
}

export async function getUpdaterJob(): Promise<UpdaterJob | null> {
  const res = await fetch(`${API_BASE}/updater/job`, { credentials: 'include' });
  const data = await parseJson(res);
  return (data.data as UpdaterJob | null) ?? null;
}

export async function getUpdaterHistory(): Promise<{
  entries: UpdaterHistoryEntry[];
  dbSnapshots: UpdaterDbSnapshot[];
}> {
  const res = await fetch(`${API_BASE}/updater/history`, { credentials: 'include' });
  const data = await parseJson(res);
  return {
    entries: (data.data?.entries as UpdaterHistoryEntry[]) || [],
    dbSnapshots: (data.data?.dbSnapshots as UpdaterDbSnapshot[]) || [],
  };
}
