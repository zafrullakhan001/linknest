import { resolveApiBase } from './apiHelpers';
import {
  BufferbloatGrade,
  SpeedFinding,
  UseCaseGrade,
  buildSpeedTestFindings,
  gradeBufferbloat,
  gradeUseCases,
} from './speedTestDiagnostics';

const API_BASE = resolveApiBase();
const HISTORY_KEY = 'linknest_speedtest_history';
const MAX_HISTORY = 40;

const CF_DOWN = 'https://speed.cloudflare.com/__down';
const CF_UP = 'https://speed.cloudflare.com/__up';
const CF_TRACE = 'https://speed.cloudflare.com/cdn-cgi/trace';

export type SpeedTestTarget = 'internet' | 'server';
export type SpeedTestProfile = 'quick' | 'standard' | 'thorough';
export type SpeedTestConnectionMode = 'single' | 'multi';
export type SpeedTestExecutor = 'browser' | 'worker';
export type SpeedTestPhase =
  | 'idle'
  | 'preparing'
  | 'latency'
  | 'download'
  | 'upload'
  | 'complete'
  | 'error';

export interface SpeedSample {
  t: number;
  mbps: number;
  phase: 'download' | 'upload';
}

export interface SpeedTestProgress {
  phase: SpeedTestPhase;
  phaseLabel: string;
  percent: number;
  liveMbps: number;
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  loadedPingMs: number | null;
  loadedUploadPingMs: number | null;
  bytesTransferred: number;
  sparkline: number[];
  downloadSparkline: number[];
  uploadSparkline: number[];
  message?: string;
}

export interface SpeedTestMeta {
  ip: string | null;
  ipv4: string | null;
  ipv6: string | null;
  loc: string | null;
  colo: string | null;
  httpProtocol: string | null;
  tls: string | null;
  userAgent: string | null;
  browser: string | null;
  endpointHost: string | null;
  connectionType: string | null;
  connectionDownlink: number | null;
  connectionRtt: number | null;
}

export interface SpeedTestResult {
  id: string;
  at: number;
  target: SpeedTestTarget;
  profile: SpeedTestProfile;
  connectionMode: SpeedTestConnectionMode;
  executor: SpeedTestExecutor;
  streams: number;
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  packetLossLoadedPct: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  peakDownloadMbps: number | null;
  peakUploadMbps: number | null;
  loadedPingMs: number | null;
  loadedUploadPingMs: number | null;
  bufferbloatDownloadMs: number | null;
  bufferbloatUploadMs: number | null;
  bufferbloatDownload: BufferbloatGrade;
  bufferbloatUpload: BufferbloatGrade;
  durationMs: number;
  bytesDownloaded: number;
  bytesUploaded: number;
  quality: SpeedQuality;
  score: number;
  useCaseGrades: UseCaseGrade[];
  findings: SpeedFinding[];
  samples: SpeedSample[];
  meta: SpeedTestMeta;
  error?: string;
}

export interface SpeedQuality {
  label: 'Excellent' | 'Very good' | 'Good' | 'Fair' | 'Poor' | 'Very poor';
  hint: string;
  tone: 'emerald' | 'sky' | 'lime' | 'amber' | 'orange' | 'red';
}

interface ProfileConfig {
  pings: number;
  downloadMs: number;
  uploadMs: number;
  streams: number;
  downloadChunk: number;
  uploadChunk: number;
}

const PROFILES: Record<SpeedTestTarget, Record<SpeedTestProfile, ProfileConfig>> = {
  internet: {
    quick: { pings: 6, downloadMs: 8000, uploadMs: 6000, streams: 3, downloadChunk: 25_000_000, uploadChunk: 2_000_000 },
    standard: { pings: 10, downloadMs: 12000, uploadMs: 8000, streams: 4, downloadChunk: 50_000_000, uploadChunk: 4_000_000 },
    thorough: { pings: 15, downloadMs: 18000, uploadMs: 12000, streams: 6, downloadChunk: 75_000_000, uploadChunk: 6_000_000 },
  },
  server: {
    quick: { pings: 6, downloadMs: 6000, uploadMs: 5000, streams: 2, downloadChunk: 4_000_000, uploadChunk: 1_000_000 },
    standard: { pings: 8, downloadMs: 9000, uploadMs: 7000, streams: 3, downloadChunk: 6_000_000, uploadChunk: 1_500_000 },
    thorough: { pings: 12, downloadMs: 12000, uploadMs: 9000, streams: 4, downloadChunk: 8_000_000, uploadChunk: 2_000_000 },
  },
};

function nowMs(): number {
  return performance.now();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Ookla-style: drop lowest 30% and highest 10%, average the rest. */
function trimmedMean(samples: number[]): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const dropLow = Math.floor(sorted.length * 0.3);
  const dropHigh = Math.floor(sorted.length * 0.1);
  const sliced = sorted.slice(dropLow, sorted.length - dropHigh || undefined);
  const used = sliced.length ? sliced : sorted;
  return used.reduce((sum, n) => sum + n, 0) / used.length;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return values.length === 1 ? 0 : null;
  const mean = values.reduce((s, n) => s + n, 0) / values.length;
  const variance = values.reduce((s, n) => s + (n - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function rfcJitter(rtts: number[]): number | null {
  if (rtts.length < 2) return rtts.length === 1 ? 0 : null;
  let acc = 0;
  for (let i = 1; i < rtts.length; i++) {
    acc += Math.abs(rtts[i] - rtts[i - 1]);
  }
  return acc / (rtts.length - 1);
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Browser';
}

function classifyIp(ip: string | null): { ipv4: string | null; ipv6: string | null } {
  if (!ip) return { ipv4: null, ipv6: null };
  if (ip.includes(':')) return { ipv4: null, ipv6: ip };
  return { ipv4: ip, ipv6: null };
}

export function formatMbps(mbps: number | null | undefined): string {
  if (mbps == null || Number.isNaN(mbps)) return '—';
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
  if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function scoreResult(input: {
  downloadMbps: number | null;
  uploadMbps: number | null;
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  bufferbloatDownloadMs?: number | null;
}): { score: number; quality: SpeedQuality } {
  const down = input.downloadMbps ?? 0;
  const up = input.uploadMbps ?? 0;
  const ping = input.pingMs ?? 999;
  const jitter = input.jitterMs ?? 999;
  const loss = input.packetLossPct ?? 100;
  const bloat = input.bufferbloatDownloadMs ?? 0;

  const downScore = Math.max(0, Math.min(100, (Math.log10(Math.max(down, 0.1) + 1) / Math.log10(1001)) * 100));
  const upScore = Math.max(0, Math.min(100, (Math.log10(Math.max(up, 0.1) + 1) / Math.log10(501)) * 100));
  const pingScore = ping <= 10 ? 100 : ping >= 200 ? 0 : Math.max(0, 100 - (ping - 10) * (100 / 190));
  const jitterScore = jitter <= 2 ? 100 : jitter >= 40 ? 0 : Math.max(0, 100 - (jitter - 2) * (100 / 38));
  const lossScore = loss <= 0 ? 100 : loss >= 8 ? 0 : Math.max(0, 100 - loss * 12.5);
  const bloatScore = bloat <= 30 ? 100 : bloat >= 300 ? 0 : Math.max(0, 100 - (bloat - 30) * (100 / 270));

  const score = Math.round(
    downScore * 0.36 +
      upScore * 0.18 +
      pingScore * 0.18 +
      jitterScore * 0.1 +
      lossScore * 0.08 +
      bloatScore * 0.1
  );

  let quality: SpeedQuality;
  if (score >= 88 && down >= 200 && ping <= 25) {
    quality = { label: 'Excellent', hint: 'Great for 4K, large transfers, and real-time apps.', tone: 'emerald' };
  } else if (score >= 75 && down >= 100) {
    quality = { label: 'Very good', hint: 'Comfortable for HD streaming, video calls, and backups.', tone: 'sky' };
  } else if (score >= 60 && down >= 50) {
    quality = { label: 'Good', hint: 'Fine for everyday browsing, HD video, and remote work.', tone: 'lime' };
  } else if (score >= 42 && down >= 25) {
    quality = { label: 'Fair', hint: 'Usable, but large downloads and HD calls may stutter.', tone: 'amber' };
  } else if (score >= 25) {
    quality = { label: 'Poor', hint: 'Expect buffering and slow transfers. Check Wi‑Fi or ISP.', tone: 'orange' };
  } else {
    quality = { label: 'Very poor', hint: 'Connection is struggling. Try wired Ethernet or another network.', tone: 'red' };
  }

  return { score, quality };
}

function readConnectionMeta(): Pick<SpeedTestMeta, 'connectionType' | 'connectionDownlink' | 'connectionRtt'> {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; type?: string };
    mozConnection?: { effectiveType?: string; downlink?: number; rtt?: number; type?: string };
    webkitConnection?: { effectiveType?: string; downlink?: number; rtt?: number; type?: string };
  };
  const c = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!c) {
    return { connectionType: null, connectionDownlink: null, connectionRtt: null };
  }
  const type = [c.type, c.effectiveType].filter(Boolean).join(' / ') || null;
  return {
    connectionType: type,
    connectionDownlink: typeof c.downlink === 'number' ? c.downlink : null,
    connectionRtt: typeof c.rtt === 'number' ? c.rtt : null,
  };
}

function parseCloudflareTrace(text: string): Partial<SpeedTestMeta> {
  const map: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const ip = map.ip || null;
  const { ipv4, ipv6 } = classifyIp(ip);
  return {
    ip,
    ipv4,
    ipv6,
    loc: map.loc || null,
    colo: map.colo || null,
    httpProtocol: map.http || null,
    tls: map.tls || null,
    userAgent: map.uag || null,
    endpointHost: 'speed.cloudflare.com',
  };
}

async function fetchCloudflareMeta(signal: AbortSignal): Promise<Partial<SpeedTestMeta>> {
  const res = await fetch(`${CF_TRACE}?r=${Date.now()}`, { cache: 'no-store', credentials: 'omit', mode: 'cors', signal });
  if (!res.ok) throw new Error(`Cloudflare trace failed (${res.status})`);
  return parseCloudflareTrace(await res.text());
}

async function fetchServerMeta(signal: AbortSignal): Promise<Partial<SpeedTestMeta>> {
  const res = await fetch(`${API_BASE}/speedtest/info?r=${Date.now()}`, {
    cache: 'no-store',
    credentials: 'include',
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || `Server info failed (${res.status})`);
  }
  const json = await res.json();
  const data = json?.data ?? json;
  const ip = data?.ip ?? null;
  const { ipv4, ipv6 } = classifyIp(ip);
  return {
    ip,
    ipv4,
    ipv6,
    userAgent: data?.user_agent ?? navigator.userAgent,
    endpointHost: typeof window !== 'undefined' ? window.location.host : 'linknest-host',
    httpProtocol: data?.http_protocol ?? null,
    tls: null,
    loc: null,
    colo: null,
  };
}

function httpErrorMessage(kind: 'Download' | 'Upload', status: number, target: SpeedTestTarget): string {
  if (status === 429) {
    if (target === 'server') {
      return `${kind} rate-limited by LinkNest (too many chunk requests this hour). Wait a bit, use Single mode, or try again next hour.`;
    }
    return `${kind} rate-limited by Cloudflare (429). Wait ~30s and retry, or switch to This server.`;
  }
  return `${kind} failed (${status})`;
}

async function fetchThroughput(
  url: string,
  init: RequestInit,
  kind: 'Download' | 'Upload',
  target: SpeedTestTarget
): Promise<Response> {
  const attempt = async () => fetch(url, init);
  let res = await attempt();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1600));
    res = await attempt();
  }
  if (!res.ok) throw new Error(httpErrorMessage(kind, res.status, target));
  return res;
}

function downloadUrl(target: SpeedTestTarget, bytes: number): string {
  const bust = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (target === 'internet') {
    return `${CF_DOWN}?bytes=${bytes}&r=${bust}`;
  }
  return `${API_BASE}/speedtest/download?bytes=${bytes}&r=${bust}`;
}

function pingUrl(target: SpeedTestTarget): string {
  const bust = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (target === 'internet') {
    return `${CF_DOWN}?bytes=500&r=${bust}`;
  }
  return `${API_BASE}/speedtest/ping?r=${bust}`;
}

function fetchOpts(target: SpeedTestTarget, signal: AbortSignal, init?: RequestInit): RequestInit {
  return {
    cache: 'no-store',
    credentials: target === 'server' ? 'include' : 'omit',
    mode: 'cors',
    signal,
    ...init,
  };
}

async function pingOnce(target: SpeedTestTarget, signal: AbortSignal): Promise<number> {
  const t0 = nowMs();
  const res = await fetch(pingUrl(target), fetchOpts(target, signal, { method: 'GET' }));
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`Ping failed (${res.status})`);
  return nowMs() - t0;
}

function createRandomBlob(bytes: number): Blob {
  const chunk = 65536;
  const parts: BlobPart[] = [];
  let remaining = bytes;
  while (remaining > 0) {
    const n = Math.min(chunk, remaining);
    const buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    parts.push(buf);
    remaining -= n;
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

async function measureLatency(
  target: SpeedTestTarget,
  count: number,
  signal: AbortSignal,
  onEach: (rtt: number, done: number, total: number) => void
): Promise<{ rtts: number[]; failed: number }> {
  const rtts: number[] = [];
  let failed = 0;
  for (let i = 0; i < count; i++) {
    if (signal.aborted) break;
    try {
      const rtt = await pingOnce(target, signal);
      rtts.push(rtt);
      onEach(rtt, i + 1, count);
    } catch (err) {
      if (signal.aborted) break;
      failed += 1;
      onEach(rtts[rtts.length - 1] ?? 0, i + 1, count);
      if (i === 0 && failed === 1) {
        throw err;
      }
    }
  }
  return { rtts, failed };
}

/** Concurrent HTTP latency probes while throughput is saturating. */
async function runLoadedLatencyProbe(
  target: SpeedTestTarget,
  durationMs: number,
  signal: AbortSignal,
  onSample: (rtt: number | null) => void
): Promise<{ medianMs: number | null; failedPct: number; samples: number[] }> {
  const started = nowMs();
  const rtts: number[] = [];
  let failed = 0;
  let attempts = 0;
  while (nowMs() - started < durationMs && !signal.aborted) {
    attempts += 1;
    try {
      const rtt = await pingOnce(target, signal);
      rtts.push(rtt);
      onSample(rtt);
    } catch {
      if (signal.aborted) break;
      failed += 1;
      onSample(null);
    }
    await new Promise((r) => setTimeout(r, 280));
  }
  const medianMs = percentile([...rtts].sort((a, b) => a - b), 50);
  const failedPct = attempts ? (failed / attempts) * 100 : 0;
  return { medianMs, failedPct, samples: rtts };
}

interface ThroughputSample {
  at: number;
  bytes: number;
}

async function runDownloadStream(
  target: SpeedTestTarget,
  cfg: ProfileConfig,
  signal: AbortSignal,
  onBytes: (delta: number, total: number, sampleMbps: number | null) => void
): Promise<{ bytes: number; samples: number[]; peak: number; timedSamples: SpeedSample[] }> {
  const started = nowMs();
  const deadline = started + cfg.downloadMs;
  let total = 0;
  const samples: ThroughputSample[] = [];
  const timedSamples: SpeedSample[] = [];
  let lastSampleAt = started;
  let lastSampleBytes = 0;

  const bump = (delta: number) => {
    total += delta;
    const t = nowMs();
    let sampleMbps: number | null = null;
    if (t - lastSampleAt >= 200) {
      const windowBytes = total - lastSampleBytes;
      const windowSec = (t - lastSampleAt) / 1000;
      const bps = windowBytes / Math.max(windowSec, 0.001);
      samples.push({ at: t, bytes: bps });
      sampleMbps = (bps * 8) / 1_000_000;
      timedSamples.push({ t: Math.round(t - started), mbps: sampleMbps, phase: 'download' });
      lastSampleAt = t;
      lastSampleBytes = total;
    }
    onBytes(delta, total, sampleMbps);
  };

  const worker = async () => {
    while (nowMs() < deadline && !signal.aborted) {
      const res = await fetchThroughput(
        downloadUrl(target, cfg.downloadChunk),
        fetchOpts(target, signal),
        'Download',
        target
      );
      if (!res.body) {
        const buf = await res.arrayBuffer();
        bump(buf.byteLength);
        continue;
      }
      const reader = res.body.getReader();
      try {
        while (nowMs() < deadline && !signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.byteLength) bump(value.byteLength);
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
      }
    }
  };

  const runners = Array.from({ length: cfg.streams }, () =>
    worker().catch((err) => {
      if (signal.aborted) return;
      throw err;
    })
  );
  const results = await Promise.allSettled(runners);
  const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (total === 0 && firstError) {
    throw firstError.reason;
  }

  const elapsed = Math.max((nowMs() - started) / 1000, 0.001);
  const warmupUntil = started + cfg.downloadMs * 0.18;
  const mbpsSamples = samples
    .filter((s) => s.at >= warmupUntil)
    .map((s) => (s.bytes * 8) / 1_000_000);
  const fallback = [(total * 8) / 1_000_000 / elapsed];
  const used = mbpsSamples.length ? mbpsSamples : fallback;
  const peak = Math.max(...used);
  return { bytes: total, samples: used, peak, timedSamples };
}

async function runUploadStream(
  target: SpeedTestTarget,
  cfg: ProfileConfig,
  signal: AbortSignal,
  onBytes: (delta: number, total: number, sampleMbps: number | null) => void
): Promise<{ bytes: number; samples: number[]; peak: number; timedSamples: SpeedSample[] }> {
  const blob = createRandomBlob(cfg.uploadChunk);
  const started = nowMs();
  const deadline = started + cfg.uploadMs;
  let total = 0;
  const samples: ThroughputSample[] = [];
  const timedSamples: SpeedSample[] = [];
  let lastSampleAt = started;
  let lastSampleBytes = 0;

  const bump = (delta: number) => {
    total += delta;
    const t = nowMs();
    let sampleMbps: number | null = null;
    if (t - lastSampleAt >= 200) {
      const windowBytes = total - lastSampleBytes;
      const windowSec = (t - lastSampleAt) / 1000;
      const bps = windowBytes / Math.max(windowSec, 0.001);
      samples.push({ at: t, bytes: bps });
      sampleMbps = (bps * 8) / 1_000_000;
      timedSamples.push({ t: Math.round(t - started), mbps: sampleMbps, phase: 'upload' });
      lastSampleAt = t;
      lastSampleBytes = total;
    }
    onBytes(delta, total, sampleMbps);
  };

  const worker = async () => {
    while (nowMs() < deadline && !signal.aborted) {
      const url =
        target === 'internet'
          ? `${CF_UP}?r=${Date.now().toString(36)}`
          : `${API_BASE}/speedtest/upload?r=${Date.now().toString(36)}`;
      const res = await fetchThroughput(
        url,
        fetchOpts(target, signal, {
          method: 'POST',
          body: blob,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
        'Upload',
        target
      );
      await res.arrayBuffer();
      bump(blob.size);
    }
  };

  const runners = Array.from({ length: Math.max(1, Math.min(cfg.streams, 4)) }, () =>
    worker().catch((err) => {
      if (signal.aborted) return;
      throw err;
    })
  );
  const results = await Promise.allSettled(runners);
  const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (total === 0 && firstError) {
    throw firstError.reason;
  }

  const elapsed = Math.max((nowMs() - started) / 1000, 0.001);
  const warmupUntil = started + cfg.uploadMs * 0.15;
  const mbpsSamples = samples
    .filter((s) => s.at >= warmupUntil)
    .map((s) => (s.bytes * 8) / 1_000_000);
  const fallback = [(total * 8) / 1_000_000 / elapsed];
  const used = mbpsSamples.length ? mbpsSamples : fallback;
  const peak = Math.max(...used);
  return { bytes: total, samples: used, peak, timedSamples };
}

function resolveStreams(
  target: SpeedTestTarget,
  profile: SpeedTestProfile,
  connectionMode: SpeedTestConnectionMode
): number {
  if (connectionMode === 'single') return 1;
  return PROFILES[target][profile].streams;
}

export async function runSpeedTest(options: {
  target: SpeedTestTarget;
  profile: SpeedTestProfile;
  connectionMode?: SpeedTestConnectionMode;
  signal: AbortSignal;
  onProgress: (progress: SpeedTestProgress) => void;
}): Promise<SpeedTestResult> {
  const { target, profile, signal, onProgress } = options;
  const connectionMode: SpeedTestConnectionMode = options.connectionMode ?? 'multi';
  const baseCfg = PROFILES[target][profile];
  const streams = resolveStreams(target, profile, connectionMode);
  const cfg: ProfileConfig = { ...baseCfg, streams };
  const startedAt = Date.now();
  const t0 = nowMs();
  const sparkline: number[] = [];
  const downloadSparkline: number[] = [];
  const uploadSparkline: number[] = [];
  const allSamples: SpeedSample[] = [];
  const conn = readConnectionMeta();
  let meta: SpeedTestMeta = {
    ip: null,
    ipv4: null,
    ipv6: null,
    loc: null,
    colo: null,
    httpProtocol: null,
    tls: null,
    userAgent: navigator.userAgent,
    browser: detectBrowser(navigator.userAgent),
    endpointHost: target === 'internet' ? 'speed.cloudflare.com' : typeof window !== 'undefined' ? window.location.host : null,
    ...conn,
  };

  const emit = (partial: Partial<SpeedTestProgress> & { phase: SpeedTestPhase; phaseLabel: string }) => {
    onProgress({
      percent: 0,
      liveMbps: 0,
      pingMs: null,
      jitterMs: null,
      packetLossPct: null,
      downloadMbps: null,
      uploadMbps: null,
      loadedPingMs: null,
      loadedUploadPingMs: null,
      bytesTransferred: 0,
      sparkline: [...sparkline],
      downloadSparkline: [...downloadSparkline],
      uploadSparkline: [...uploadSparkline],
      ...partial,
    });
  };

  emit({
    phase: 'preparing',
    phaseLabel: 'Preparing',
    percent: 2,
    message: target === 'internet' ? 'Reaching Cloudflare…' : 'Contacting this server…',
  });

  try {
    const extra = target === 'internet' ? await fetchCloudflareMeta(signal) : await fetchServerMeta(signal);
    meta = { ...meta, ...extra, browser: detectBrowser(extra.userAgent || navigator.userAgent) };
  } catch (err) {
    if (signal.aborted) throw err;
    if (target === 'internet') {
      throw new Error(
        'Could not reach Cloudflare speed servers. Try “This server”, disable an ad blocker, or check outbound HTTPS.'
      );
    }
    throw err instanceof Error ? err : new Error('Could not reach the LinkNest speed-test endpoint.');
  }

  emit({ phase: 'latency', phaseLabel: 'Latency', percent: 8, message: 'Measuring ping and jitter…' });

  const { rtts, failed } = await measureLatency(target, cfg.pings, signal, (rtt, done, total) => {
    emit({
      phase: 'latency',
      phaseLabel: 'Latency',
      percent: 8 + (done / total) * 12,
      pingMs: rtt,
      liveMbps: 0,
      message: `Ping sample ${done}/${total}`,
    });
  });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const pingMs = percentile([...rtts].sort((a, b) => a - b), 50) ?? rtts[0] ?? null;
  const jitterMs = rfcJitter(rtts) ?? stddev(rtts);
  const packetLossPct = (failed / Math.max(cfg.pings, 1)) * 100;

  emit({
    phase: 'download',
    phaseLabel: 'Download',
    percent: 22,
    pingMs,
    jitterMs,
    packetLossPct,
    message: connectionMode === 'single' ? 'Single-stream download…' : 'Saturating download…',
  });

  let downloadMbps: number | null = null;
  let peakDownloadMbps: number | null = null;
  let bytesDownloaded = 0;
  let loadedPingMs: number | null = null;
  let loadedUploadPingMs: number | null = null;
  let packetLossLoadedPct: number | null = null;

  const loadedDownPromise = runLoadedLatencyProbe(target, cfg.downloadMs, signal, (rtt) => {
    if (rtt != null) {
      loadedPingMs = rtt;
    }
  });

  const down = await runDownloadStream(target, cfg, signal, (_delta, total, sampleMbps) => {
    bytesDownloaded = total;
    const live =
      sampleMbps ??
      (total * 8) / 1_000_000 / Math.max((nowMs() - (t0 + 400)) / 1000, 0.2);
    sparkline.push(live);
    downloadSparkline.push(live);
    if (sparkline.length > 48) sparkline.shift();
    if (downloadSparkline.length > 64) downloadSparkline.shift();
    emit({
      phase: 'download',
      phaseLabel: 'Download',
      percent: 22 + Math.min(38, ((nowMs() - t0) / (cfg.downloadMs + 800)) * 38),
      liveMbps: live,
      pingMs,
      jitterMs,
      packetLossPct,
      loadedPingMs,
      downloadMbps: live,
      bytesTransferred: total,
      message: `Downloaded ${formatBytes(total)}`,
    });
  });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const loadedDown = await loadedDownPromise;
  downloadMbps = trimmedMean(down.samples);
  peakDownloadMbps = down.peak;
  bytesDownloaded = down.bytes;
  allSamples.push(...down.timedSamples);
  loadedPingMs = loadedDown.medianMs ?? loadedPingMs;
  packetLossLoadedPct = loadedDown.failedPct;

  if (loadedPingMs == null) {
    try {
      loadedPingMs = await pingOnce(target, signal);
    } catch {
      loadedPingMs = null;
    }
  }

  emit({
    phase: 'upload',
    phaseLabel: 'Upload',
    percent: 62,
    pingMs,
    jitterMs,
    packetLossPct,
    downloadMbps,
    loadedPingMs,
    liveMbps: 0,
    message: 'Saturating upload…',
  });

  let uploadMbps: number | null = null;
  let peakUploadMbps: number | null = null;
  let bytesUploaded = 0;
  const upStarted = nowMs();

  const loadedUpPromise = runLoadedLatencyProbe(target, cfg.uploadMs, signal, (rtt) => {
    if (rtt != null) loadedUploadPingMs = rtt;
  });

  const up = await runUploadStream(target, cfg, signal, (_delta, total, sampleMbps) => {
    bytesUploaded = total;
    const live = sampleMbps ?? (total * 8) / 1_000_000 / Math.max((nowMs() - upStarted) / 1000, 0.2);
    sparkline.push(live);
    uploadSparkline.push(live);
    if (sparkline.length > 48) sparkline.shift();
    if (uploadSparkline.length > 64) uploadSparkline.shift();
    emit({
      phase: 'upload',
      phaseLabel: 'Upload',
      percent: 62 + Math.min(32, ((nowMs() - upStarted) / cfg.uploadMs) * 32),
      liveMbps: live,
      pingMs,
      jitterMs,
      packetLossPct,
      loadedPingMs,
      loadedUploadPingMs,
      downloadMbps,
      uploadMbps: live,
      bytesTransferred: bytesDownloaded + total,
      message: `Uploaded ${formatBytes(total)}`,
    });
  });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const loadedUp = await loadedUpPromise;
  uploadMbps = trimmedMean(up.samples);
  peakUploadMbps = up.peak;
  bytesUploaded = up.bytes;
  allSamples.push(
    ...up.timedSamples.map((s) => ({
      ...s,
      t: s.t + Math.round(cfg.downloadMs),
    }))
  );
  loadedUploadPingMs = loadedUp.medianMs ?? loadedUploadPingMs;
  if (packetLossLoadedPct == null) {
    packetLossLoadedPct = loadedUp.failedPct;
  } else {
    packetLossLoadedPct = (packetLossLoadedPct + loadedUp.failedPct) / 2;
  }

  const bufferbloatDownload = gradeBufferbloat(pingMs, loadedPingMs);
  const bufferbloatUpload = gradeBufferbloat(pingMs, loadedUploadPingMs);
  const { score, quality } = scoreResult({
    downloadMbps,
    uploadMbps,
    pingMs,
    jitterMs,
    packetLossPct,
    bufferbloatDownloadMs: bufferbloatDownload.deltaMs,
  });

  const result: SpeedTestResult = {
    id: newId(),
    at: startedAt,
    target,
    profile,
    connectionMode,
    executor: 'browser',
    streams,
    pingMs,
    jitterMs,
    packetLossPct,
    packetLossLoadedPct,
    downloadMbps,
    uploadMbps,
    peakDownloadMbps,
    peakUploadMbps,
    loadedPingMs,
    loadedUploadPingMs,
    bufferbloatDownloadMs: bufferbloatDownload.deltaMs,
    bufferbloatUploadMs: bufferbloatUpload.deltaMs,
    bufferbloatDownload,
    bufferbloatUpload,
    durationMs: Math.round(nowMs() - t0),
    bytesDownloaded,
    bytesUploaded,
    quality,
    score,
    useCaseGrades: [],
    findings: [],
    samples: allSamples,
    meta,
  };
  result.useCaseGrades = gradeUseCases(result);
  result.findings = buildSpeedTestFindings(result);

  emit({
    phase: 'complete',
    phaseLabel: 'Done',
    percent: 100,
    liveMbps: downloadMbps ?? 0,
    pingMs,
    jitterMs,
    packetLossPct,
    loadedPingMs,
    loadedUploadPingMs,
    downloadMbps,
    uploadMbps,
    bytesTransferred: bytesDownloaded + bytesUploaded,
    message: quality.label,
  });

  return result;
}

export async function runDualSpeedTest(options: {
  profile: SpeedTestProfile;
  connectionMode?: SpeedTestConnectionMode;
  signal: AbortSignal;
  onProgress: (progress: SpeedTestProgress & { compareTarget?: SpeedTestTarget }) => void;
}): Promise<{ internet: SpeedTestResult; server: SpeedTestResult }> {
  const internet = await runSpeedTest({
    target: 'internet',
    profile: options.profile,
    connectionMode: options.connectionMode,
    signal: options.signal,
    onProgress: (p) => options.onProgress({ ...p, compareTarget: 'internet' }),
  });
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const server = await runSpeedTest({
    target: 'server',
    profile: options.profile,
    connectionMode: options.connectionMode,
    signal: options.signal,
    onProgress: (p) => options.onProgress({ ...p, compareTarget: 'server' }),
  });
  return { internet, server };
}

function normalizeHistoryItem(raw: unknown): SpeedTestResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SpeedTestResult>;
  if (!r.id || !r.at || !r.target || !r.profile) return null;
  const pingMs = r.pingMs ?? null;
  const loadedPingMs = r.loadedPingMs ?? null;
  const loadedUploadPingMs = r.loadedUploadPingMs ?? null;
  const bufferbloatDownload = r.bufferbloatDownload ?? gradeBufferbloat(pingMs, loadedPingMs);
  const bufferbloatUpload = r.bufferbloatUpload ?? gradeBufferbloat(pingMs, loadedUploadPingMs);
  const base: SpeedTestResult = {
    id: String(r.id),
    at: Number(r.at),
    target: r.target,
    profile: r.profile,
    connectionMode: r.connectionMode === 'single' ? 'single' : 'multi',
    executor: r.executor === 'worker' ? 'worker' : 'browser',
    streams: typeof r.streams === 'number' ? r.streams : r.connectionMode === 'single' ? 1 : 4,
    pingMs,
    jitterMs: r.jitterMs ?? null,
    packetLossPct: r.packetLossPct ?? null,
    packetLossLoadedPct: r.packetLossLoadedPct ?? null,
    downloadMbps: r.downloadMbps ?? null,
    uploadMbps: r.uploadMbps ?? null,
    peakDownloadMbps: r.peakDownloadMbps ?? null,
    peakUploadMbps: r.peakUploadMbps ?? null,
    loadedPingMs,
    loadedUploadPingMs,
    bufferbloatDownloadMs: r.bufferbloatDownloadMs ?? bufferbloatDownload.deltaMs,
    bufferbloatUploadMs: r.bufferbloatUploadMs ?? bufferbloatUpload.deltaMs,
    bufferbloatDownload,
    bufferbloatUpload,
    durationMs: r.durationMs ?? 0,
    bytesDownloaded: r.bytesDownloaded ?? 0,
    bytesUploaded: r.bytesUploaded ?? 0,
    quality: r.quality ?? { label: 'Fair', hint: '', tone: 'amber' },
    score: r.score ?? 0,
    useCaseGrades: Array.isArray(r.useCaseGrades) ? r.useCaseGrades : [],
    findings: Array.isArray(r.findings) ? r.findings : [],
    samples: Array.isArray(r.samples) ? r.samples : [],
    meta: {
      ip: r.meta?.ip ?? null,
      ipv4: r.meta?.ipv4 ?? null,
      ipv6: r.meta?.ipv6 ?? null,
      loc: r.meta?.loc ?? null,
      colo: r.meta?.colo ?? null,
      httpProtocol: r.meta?.httpProtocol ?? null,
      tls: r.meta?.tls ?? null,
      userAgent: r.meta?.userAgent ?? null,
      browser: r.meta?.browser ?? null,
      endpointHost: r.meta?.endpointHost ?? null,
      connectionType: r.meta?.connectionType ?? null,
      connectionDownlink: r.meta?.connectionDownlink ?? null,
      connectionRtt: r.meta?.connectionRtt ?? null,
    },
    error: r.error,
  };
  if (!base.useCaseGrades.length) base.useCaseGrades = gradeUseCases(base);
  if (!base.findings.length) base.findings = buildSpeedTestFindings(base);
  return base;
}

export function loadSpeedTestHistory(): SpeedTestResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHistoryItem).filter((x): x is SpeedTestResult => !!x);
  } catch {
    return [];
  }
}

export function saveSpeedTestResult(result: SpeedTestResult): SpeedTestResult[] {
  const next = [result, ...loadSpeedTestHistory()].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function clearSpeedTestHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

export function resultToShareText(result: SpeedTestResult): string {
  const when = new Date(result.at).toLocaleString();
  const target = result.target === 'internet' ? 'Internet (Cloudflare)' : 'This LinkNest server';
  const loc = [result.meta.loc, result.meta.colo].filter(Boolean).join(' / ');
  const grades = result.useCaseGrades.map((g) => `${g.label} ${g.grade}`).join(', ');
  return [
    'LinkNest Speed Test',
    when,
    `Target: ${target}`,
    `Mode: ${result.connectionMode} (${result.streams} stream${result.streams === 1 ? '' : 's'})`,
    `Executor: ${result.executor}`,
    loc ? `PoP: ${loc}` : null,
    result.meta.ip ? `IP: ${result.meta.ip}` : null,
    result.meta.browser ? `Browser: ${result.meta.browser}` : null,
    `Download: ${formatMbps(result.downloadMbps)} (peak ${formatMbps(result.peakDownloadMbps)})`,
    `Upload: ${formatMbps(result.uploadMbps)} (peak ${formatMbps(result.peakUploadMbps)})`,
    `Ping: ${formatMs(result.pingMs)}   Jitter: ${formatMs(result.jitterMs)}   Loss: ${result.packetLossPct?.toFixed(0) ?? '—'}%`,
    result.loadedPingMs != null ? `Loaded ping (down): ${formatMs(result.loadedPingMs)} (+${formatMs(result.bufferbloatDownloadMs)})` : null,
    result.loadedUploadPingMs != null
      ? `Loaded ping (up): ${formatMs(result.loadedUploadPingMs)} (+${formatMs(result.bufferbloatUploadMs)})`
      : null,
    grades ? `Use cases: ${grades}` : null,
    `Quality: ${result.quality.label} (${result.score}/100)`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function historyToCsv(history: SpeedTestResult[]): string {
  const header = [
    'at',
    'executor',
    'target',
    'profile',
    'connectionMode',
    'streams',
    'downloadMbps',
    'uploadMbps',
    'pingMs',
    'jitterMs',
    'packetLossPct',
    'loadedPingMs',
    'loadedUploadPingMs',
    'bufferbloatDownloadMs',
    'bufferbloatUploadMs',
    'score',
    'quality',
    'ip',
    'browser',
  ];
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = history.map((h) =>
    [
      new Date(h.at).toISOString(),
      h.executor,
      h.target,
      h.profile,
      h.connectionMode,
      h.streams,
      h.downloadMbps,
      h.uploadMbps,
      h.pingMs,
      h.jitterMs,
      h.packetLossPct,
      h.loadedPingMs,
      h.loadedUploadPingMs,
      h.bufferbloatDownloadMs,
      h.bufferbloatUploadMs,
      h.score,
      h.quality.label,
      h.meta.ip,
      h.meta.browser,
    ]
      .map(escape)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export { PROFILES };
