/**
 * Underlying-software (runtime) status service — read-only.
 *
 * Reports the PHP / Node / npm / Apache / SQLite versions on this host, the
 * patches available from the official vendor indexes, and the copy-paste
 * command lines an operator can run. Nothing here upgrades anything.
 */

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

export type RuntimeComponentId = 'php' | 'node' | 'apache' | 'sqlite' | 'git';
export type RuntimeCommandComponent = 'php' | 'node' | 'npm' | 'apache' | 'sqlite';

export interface RuntimeStep {
  id: string;
  title: string;
  shell: 'powershell' | 'cmd' | 'bash' | string;
  code: string;
  note?: string;
  elevated?: boolean;
}

export interface RuntimeDowntime {
  requiresRestart: boolean;
  window: string;
  summary: string;
  planning: string;
}

export interface RuntimeInstructions {
  component: string;
  layout: string | null;
  layoutLabel?: string | null;
  requiresElevation?: boolean;
  steps: RuntimeStep[];
  downtime: RuntimeDowntime | null;
  docs?: Record<string, string>;
  readOnly?: boolean;
  error?: string;
}

export interface RuntimePhpInfo {
  version: string;
  line: string;
  zts: boolean;
  arch: string;
  sapi: string;
  binary: string | null;
  folder: string | null;
  iniPath: string | null;
  iniWritable: boolean;
  extensionDir: string | null;
  requiredExtensions: Record<string, boolean>;
  optionalExtensions: Record<string, boolean>;
  missingExtensions: string[];
  loadedExtensionCount: number;
  memoryLimit: string;
}

export interface RuntimeNodeInfo {
  installed: boolean;
  version: string | null;
  raw: string | null;
  line: string;
  major: number | null;
  arch: string | null;
  path: string | null;
  source: string | null;
  npmVersion: string | null;
  probeAllowed: boolean;
  error: string | null;
}

export interface RuntimeApacheInfo {
  installed: boolean;
  version: string | null;
  arch: string | null;
  path: string | null;
  service: string | null;
  control: string;
  error: string | null;
}

export interface RuntimeSqliteInfo {
  engineVersion: string | null;
  dbPath: string | null;
  dbBytes: number | null;
  journalMode: string | null;
  schemaVersion: number | null;
  walBytes: number;
  libDllPath: string | null;
  libDllArch: string | null;
  error: string | null;
}

export interface RuntimeGitInfo {
  version: string | null;
  available: boolean;
  appVersion: string | null;
  gitCommit: string | null;
  buildId: string | null;
}

export interface RuntimeSecurityHint {
  version?: string;
  status: 'security' | 'patch' | 'unknown' | string;
  source?: string;
  excerpt?: string | null;
  error?: string | null;
}

export interface RuntimePhpUpdate {
  currentVersion: string;
  line: string;
  latestForLine: string | null;
  latestAny: string | null;
  latestAnyLine: string | null;
  status: 'up-to-date' | 'patch-available' | 'minor-available' | 'unknown' | string;
  patchAvailable: boolean;
  newerMinorAvailable: boolean;
  security: boolean;
  securityHint: RuntimeSecurityHint | null;
  notesUrl: string | null;
  publishedAt: string | null;
  assetName: string | null;
  assetUrl: string | null;
  sha256: string | null;
  assetSize: string | null;
  source: string | null;
  sourceUrl: string | null;
  stale: boolean;
  error: string | null;
}

export interface RuntimeNodeRelease {
  version: string;
  date: string | null;
  security: boolean;
  lts: string | false;
  npm: string | null;
}

export interface RuntimeNodeUpdate {
  installed: boolean;
  currentVersion: string | null;
  line: string;
  path: string | null;
  pathSource: string | null;
  arch: string | null;
  npmVersion: string | null;
  latestForLine: string | null;
  latestForLineNpm: string | null;
  latestForLineDate: string | null;
  latestLts: RuntimeNodeRelease | null;
  latestCurrent: RuntimeNodeRelease | null;
  ltsName: string | false;
  status:
    | 'up-to-date'
    | 'patch-available'
    | 'security-patch-available'
    | 'lts-upgrade-available'
    | 'not-installed'
    | 'unknown'
    | string;
  patchAvailable: boolean;
  security: boolean;
  missingSecurityVersions: string[];
  ltsUpgradeAvailable: boolean;
  notesUrl: string | null;
  releaseNotesUrl: string | null;
  assetName: string | null;
  assetUrl: string | null;
  shasumsUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
  stale: boolean;
  error: string | null;
}

export interface RuntimeSourceInfo {
  source: string | null;
  url: string | null;
  fetchedAt: number | null;
  stale: boolean;
  error: string | null;
  lineCount: number;
}

export interface RuntimeStatus {
  readOnly: boolean;
  generatedAt: number;
  generatedAtIso: string;
  host: {
    os: string;
    family: string;
    arch: string;
    phpSapi: string;
    layout: string;
    layoutLabel: string;
    docker: boolean;
    windows: boolean;
    projectRoot: string;
    dataDir: string;
    procOpenAllowed: boolean;
    curlAvailable: boolean;
  };
  layout: {
    id: string;
    label: string;
    requiresElevation: boolean;
    phpFolder: string | null;
    phpIniPath: string | null;
    phpBinary: string | null;
    apachePath: string | null;
    notes: string[];
  };
  capabilities: {
    readOnly: boolean;
    inAppUpgrade: boolean;
    reason: string;
    hostAllowlist: string[];
    cacheTtlSeconds: number;
    procOpen: boolean;
    curl: boolean;
    writes: string;
  };
  components: {
    php: { component: 'php'; info: RuntimePhpInfo; update: RuntimePhpUpdate; instructions: RuntimeInstructions };
    node: { component: 'node'; info: RuntimeNodeInfo; update: RuntimeNodeUpdate; instructions: RuntimeInstructions };
    apache: { component: 'apache'; info: RuntimeApacheInfo; update: null; instructions: RuntimeInstructions };
    sqlite: { component: 'sqlite'; info: RuntimeSqliteInfo; update: null; instructions: RuntimeInstructions };
    git: { component: 'git'; info: RuntimeGitInfo; update: null; instructions: null };
  };
  downtime: Record<string, RuntimeDowntime>;
  sources: { php: RuntimeSourceInfo; node: RuntimeSourceInfo };
  cacheFile: string;
  cacheUpdatedAt: number | null;
  checkIntervalMinutes: number;
  summary: {
    updateAvailable: boolean;
    securityAvailable: boolean;
    patchCount: number;
    php: string;
    node: string;
    message: string;
  };
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

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const res = await fetch(`${API_BASE}/runtime/status`, { credentials: 'include' });
  const data = await parseJson(res);
  return data.data as RuntimeStatus;
}

export async function checkRuntimeNow(): Promise<RuntimeStatus> {
  const res = await fetch(`${API_BASE}/runtime/check`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await parseJson(res);
  return data.data as RuntimeStatus;
}

export async function getRuntimeInstructions(
  component: RuntimeCommandComponent
): Promise<RuntimeInstructions> {
  const params = new URLSearchParams({ component });
  const res = await fetch(`${API_BASE}/runtime/instructions?${params.toString()}`, {
    credentials: 'include',
  });
  const data = await parseJson(res);
  return data.data as RuntimeInstructions;
}

/** Direct download URL for the read-only report (the browser session cookie applies). */
export function runtimeReportUrl(format: 'md' | 'json' = 'md'): string {
  return `${API_BASE}/runtime/report?format=${format}`;
}

/** Human label for a runtime status value. */
export function runtimeStatusLabel(status: string): string {
  switch (status) {
    case 'up-to-date':
      return 'Up to date';
    case 'patch-available':
      return 'Patch available';
    case 'security-patch-available':
      return 'Security patch available';
    case 'minor-available':
      return 'Newer minor available';
    case 'lts-upgrade-available':
      return 'Newer LTS available';
    case 'not-installed':
      return 'Not installed';
    default:
      return 'Check manually';
  }
}

/** Tailwind classes for a runtime status pill. */
export function runtimeStatusClass(status: string): string {
  switch (status) {
    case 'up-to-date':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'patch-available':
    case 'minor-available':
    case 'lts-upgrade-available':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
    case 'security-patch-available':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    case 'not-installed':
      return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
    default:
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
  }
}

