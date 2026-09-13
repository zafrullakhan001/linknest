import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export type ApacheMonitorPresence = {
  count: number;
  guests: number;
  signedIn: number;
};

export type ApacheMonitorRequestRow = {
  path: string;
  count: number;
};

export type ApacheMonitorHistoryPoint = {
  t: number;
  label: string;
  available: number;
  busy: number | null;
  idle: number | null;
  reqPerSec: number | null;
  bytesPerSec: number | null;
  bytesPerReq: number | null;
  accesses: number | null;
  kBytes: number | null;
};

export type ApacheMonitorScoreboard = {
  waiting: number;
  starting: number;
  reading: number;
  sending: number;
  keepalive: number;
  dns: number;
  closing: number;
  logging: number;
  graceful: number;
  idleCleanup: number;
  open: number;
  other: number;
};

export type ApacheMonitorOpcache = {
  loaded: boolean;
  active: boolean;
  message: string | null;
  memory: {
    usedBytes: number;
    freeBytes: number;
    wastedBytes: number;
    totalBytes: number;
    usedPercent: number;
    wastedPercent: number;
    usedHuman: string;
    freeHuman: string;
    totalHuman: string;
    wastedHuman: string;
  } | null;
  interned: {
    usedBytes: number;
    freeBytes: number;
    bufferBytes: number;
    usedPercent: number;
    usedHuman: string;
    bufferHuman: string;
  } | null;
  statistics: {
    hits: number;
    misses: number;
    hitRatePercent: number;
    cachedScripts: number;
    cachedKeys: number;
    maxCachedKeys: number;
    keysPercent: number;
    oomRestarts: number;
    hashRestarts: number;
    manualRestarts: number;
  } | null;
  jit: {
    enabled: boolean;
    on: boolean;
    bufferSize: number;
    bufferFree: number;
  } | null;
  config: {
    memoryConsumptionMb: number;
    maxAcceleratedFiles: number;
    validateTimestamps: boolean;
    revalidateFreq: number;
  } | null;
};

export type ApacheMonitorPhp = {
  version: string;
  sapi: string;
  memoryUsedBytes: number;
  memoryPeakBytes: number;
  memoryLimitBytes: number | null;
  memoryLimitRaw: string;
  memoryUsedPercent: number | null;
  memoryUsedHuman: string;
  memoryPeakHuman: string;
  memoryLimitHuman: string;
  load: { load1: number; load5: number; load15: number } | null;
};

export type ApacheMonitorSqlite = {
  sizeBytes: number;
  sizeHuman: string;
  walBytes: number;
  walHuman: string;
  journalMode: string | null;
  pageCount: number;
  pageSize: number;
};

export type ApacheMonitorLogFile = {
  role: string;
  path: string;
  label: string;
  sizeBytes: number;
  sizeHuman: string;
  writable: boolean;
  note: string | null;
};

export type ApacheMonitorLogs = {
  apache: ApacheMonitorLogFile[];
  php: ApacheMonitorLogFile[];
  phpNote: string | null;
};

export type ApacheMonitorDisk = {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  totalHuman: string;
  freeHuman: string;
  usedHuman: string;
};

export type ApacheMonitorDashboard = {
  available: boolean;
  availabilityPercent: number;
  lastUpdated: number;
  pollIntervalMs: number;
  statusUrl: string | null;
  error: string | null;
  setupHint: string | null;
  instance: string;
  server: {
    version: string;
    mpm: string;
    currentTime: string;
    restartTime: string;
    uptimeSeconds: number | null;
    uptimeLabel: string;
    load1: number | null;
    load5: number | null;
    load15: number | null;
  } | null;
  current: {
    totalAccesses: number;
    totalKBytes: number;
    reqPerSec: number;
    bytesPerSec: number;
    bytesPerReq: number;
    durationPerReq: number | null;
    busyWorkers: number;
    idleWorkers: number;
    gracefulWorkers: number;
    connsTotal: number | null;
    scoreboardCounts: ApacheMonitorScoreboard;
    workerUtilizationPercent: number;
    workerPool: number;
  } | null;
  history: ApacheMonitorHistoryPoint[];
  requests: {
    failedTotal: number;
    successTotal: number;
    linesParsed: number;
    logPath: string | null;
    topFailed: ApacheMonitorRequestRow[];
    topSuccess: ApacheMonitorRequestRow[];
  };
  presence: ApacheMonitorPresence;
  opcache: ApacheMonitorOpcache | null;
  php: ApacheMonitorPhp | null;
  sqlite: ApacheMonitorSqlite | null;
  disk: ApacheMonitorDisk | null;
  logs: ApacheMonitorLogs | null;
};

export async function fetchApacheMonitorDashboard(options?: {
  signal?: AbortSignal;
  fresh?: boolean;
}): Promise<ApacheMonitorDashboard> {
  const qs = options?.fresh ? '?fresh=1' : '';
  const response = await fetch(`${API_BASE}/apache-monitor${qs}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    throw new Error('Sign in as an administrator to view Apache monitoring.');
  }
  if (response.status === 403) {
    throw new Error('Apache monitoring is limited to administrators.');
  }
  if (!response.ok) {
    const err =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error || '')
        : '';
    throw new Error(err || `Failed to load Apache monitoring (${response.status})`);
  }

  return payload as ApacheMonitorDashboard;
}

export type ApacheMonitorPurgeResult = {
  success: boolean;
  target: 'apache' | 'php' | 'all';
  freedBytes: number;
  freedHuman: string;
  purged: Array<{
    path: string;
    label: string;
    bytesBefore: number;
    ok: boolean;
    error: string | null;
  }>;
};

export async function purgeApacheMonitorLogs(
  target: 'apache' | 'php' | 'all'
): Promise<ApacheMonitorPurgeResult> {
  const response = await fetch(`${API_BASE}/apache-monitor/purge-logs`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, confirm: true }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    throw new Error('Sign in as an administrator to purge logs.');
  }
  if (response.status === 403) {
    throw new Error('Purging logs is limited to administrators.');
  }
  if (!response.ok) {
    const err =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error || '')
        : '';
    throw new Error(err || `Failed to purge logs (${response.status})`);
  }

  return payload as ApacheMonitorPurgeResult;
}
