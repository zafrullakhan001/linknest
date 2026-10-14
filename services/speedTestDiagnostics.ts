import {
  SpeedTestResult,
  SpeedTestTarget,
  formatMbps,
  formatMs,
} from './speedTestService';

export type UseCaseKey = 'gaming' | 'videoCall' | 'streaming' | 'download';
export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';
export type FindingSeverity = 'info' | 'ok' | 'warn' | 'bad';

export interface UseCaseGrade {
  key: UseCaseKey;
  label: string;
  grade: GradeLetter;
  score: number;
  hint: string;
}

export interface SpeedFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
}

export interface BufferbloatGrade {
  grade: GradeLetter;
  deltaMs: number | null;
  label: string;
  hint: string;
}

export function gradeBufferbloat(idleMs: number | null, loadedMs: number | null): BufferbloatGrade {
  if (idleMs == null || loadedMs == null) {
    return {
      grade: 'C',
      deltaMs: null,
      label: 'Unknown',
      hint: 'Loaded latency was not measured during this run.',
    };
  }
  const delta = Math.max(0, loadedMs - idleMs);
  if (delta < 30) {
    return { grade: 'A', deltaMs: delta, label: 'Excellent', hint: 'Queueing delay stays low under load.' };
  }
  if (delta < 75) {
    return { grade: 'B', deltaMs: delta, label: 'Good', hint: 'Mild bufferbloat under saturation.' };
  }
  if (delta < 150) {
    return { grade: 'C', deltaMs: delta, label: 'Fair', hint: 'Latency rises under load — video calls may stutter.' };
  }
  if (delta < 300) {
    return { grade: 'D', deltaMs: delta, label: 'Poor', hint: 'Heavy bufferbloat. Prefer wired or QoS if available.' };
  }
  return { grade: 'F', deltaMs: delta, label: 'Very poor', hint: 'Severe congestion under load.' };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function letterFromScore(score: number): GradeLetter {
  if (score >= 88) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 42) return 'D';
  return 'F';
}

export function gradeUseCases(result: SpeedTestResult): UseCaseGrade[] {
  const down = result.downloadMbps ?? 0;
  const up = result.uploadMbps ?? 0;
  const ping = result.pingMs ?? 999;
  const jitter = result.jitterMs ?? 999;
  const loss = result.packetLossPct ?? 100;
  const loaded = result.loadedPingMs ?? ping;
  const bloat = Math.max(0, loaded - (result.pingMs ?? loaded));

  const gamingScore = clampScore(
    (ping <= 20 ? 100 : ping >= 120 ? 0 : 100 - (ping - 20) * (100 / 100)) * 0.4 +
      (jitter <= 5 ? 100 : jitter >= 40 ? 0 : 100 - (jitter - 5) * (100 / 35)) * 0.25 +
      (loss <= 0.5 ? 100 : loss >= 5 ? 0 : 100 - loss * 20) * 0.2 +
      (bloat <= 50 ? 100 : bloat >= 250 ? 0 : 100 - (bloat - 50) * 0.5) * 0.15
  );
  const videoScore = clampScore(
    (up >= 5 ? Math.min(100, 40 + up * 4) : up * 8) * 0.35 +
      (down >= 10 ? Math.min(100, 30 + down * 2) : down * 3) * 0.2 +
      (ping <= 40 ? 100 : ping >= 180 ? 0 : 100 - (ping - 40) * (100 / 140)) * 0.25 +
      (jitter <= 15 ? 100 : jitter >= 50 ? 0 : 100 - (jitter - 15) * (100 / 35)) * 0.2
  );
  const streamScore = clampScore(
    (down >= 25 ? Math.min(100, 20 + Math.log10(down + 1) * 35) : down * 3) * 0.7 +
      (ping <= 80 ? 100 : ping >= 250 ? 0 : 100 - (ping - 80) * (100 / 170)) * 0.15 +
      (loss <= 1 ? 100 : loss >= 8 ? 0 : 100 - loss * 12) * 0.15
  );
  const downloadScore = clampScore(
    (down >= 100 ? Math.min(100, 40 + Math.log10(down + 1) * 28) : down) * 0.75 +
      (up >= 20 ? Math.min(100, 30 + up) : up * 2) * 0.15 +
      (loss <= 1 ? 100 : 60) * 0.1
  );

  return [
    {
      key: 'gaming',
      label: 'Gaming',
      grade: letterFromScore(gamingScore),
      score: gamingScore,
      hint: gamingScore >= 75 ? 'Low latency and stable jitter.' : 'Latency or bufferbloat may hurt competitive play.',
    },
    {
      key: 'videoCall',
      label: 'Video calls',
      grade: letterFromScore(videoScore),
      score: videoScore,
      hint: videoScore >= 75 ? 'Solid for HD meetings.' : 'Upload or jitter may cause freezes.',
    },
    {
      key: 'streaming',
      label: 'Streaming',
      grade: letterFromScore(streamScore),
      score: streamScore,
      hint: streamScore >= 75 ? 'Comfortable for HD / 4K.' : 'Expect buffering on higher bitrates.',
    },
    {
      key: 'download',
      label: 'Large downloads',
      grade: letterFromScore(downloadScore),
      score: downloadScore,
      hint: downloadScore >= 75 ? 'Good for big transfers and backups.' : 'Large files will take longer.',
    },
  ];
}

export function buildSpeedTestFindings(result: SpeedTestResult): SpeedFinding[] {
  const findings: SpeedFinding[] = [];
  const down = result.downloadMbps;
  const up = result.uploadMbps;
  const ping = result.pingMs;
  const jitter = result.jitterMs;
  const loss = result.packetLossPct;
  const bloatDl = gradeBufferbloat(result.pingMs, result.loadedPingMs);
  const bloatUl = gradeBufferbloat(result.pingMs, result.loadedUploadPingMs ?? null);

  if (down != null && down >= 200 && (ping ?? 999) <= 30 && (jitter ?? 999) <= 10) {
    findings.push({
      id: 'healthy',
      severity: 'ok',
      title: 'Healthy connection',
      detail: `${formatMbps(down)} down / ${formatMbps(up)} up with ${formatMs(ping)} ping.`,
    });
  }

  if (bloatDl.deltaMs != null && bloatDl.deltaMs >= 150) {
    findings.push({
      id: 'bufferbloat-down',
      severity: bloatDl.deltaMs >= 300 ? 'bad' : 'warn',
      title: 'Bufferbloat under download',
      detail: `Latency rose by ${formatMs(bloatDl.deltaMs)} while downloading (${bloatDl.label}).`,
    });
  }
  if (bloatUl.deltaMs != null && bloatUl.deltaMs >= 150) {
    findings.push({
      id: 'bufferbloat-up',
      severity: bloatUl.deltaMs >= 300 ? 'bad' : 'warn',
      title: 'Bufferbloat under upload',
      detail: `Latency rose by ${formatMs(bloatUl.deltaMs)} while uploading (${bloatUl.label}).`,
    });
  }

  if (jitter != null && jitter >= 25) {
    findings.push({
      id: 'jitter',
      severity: jitter >= 50 ? 'bad' : 'warn',
      title: 'Unstable latency',
      detail: `Jitter is ${formatMs(jitter)}. Wi‑Fi interference or a busy link is likely.`,
    });
  }

  if (loss != null && loss >= 2) {
    findings.push({
      id: 'loss',
      severity: loss >= 6 ? 'bad' : 'warn',
      title: 'HTTP packet loss signal',
      detail: `About ${loss.toFixed(0)}% of idle ping probes failed (HTTP-based estimate, not ICMP).`,
    });
  }

  if (result.packetLossLoadedPct != null && result.packetLossLoadedPct >= 5) {
    findings.push({
      id: 'loss-loaded',
      severity: 'warn',
      title: 'Loss under load',
      detail: `${result.packetLossLoadedPct.toFixed(0)}% of probes failed while the link was saturated.`,
    });
  }

  if (down != null && down < 25) {
    findings.push({
      id: 'slow-down',
      severity: down < 10 ? 'bad' : 'warn',
      title: 'Slow download',
      detail: `Measured ${formatMbps(down)}. Check Wi‑Fi signal, VPN, or ISP congestion.`,
    });
  }

  if (up != null && up < 5) {
    findings.push({
      id: 'slow-up',
      severity: up < 2 ? 'bad' : 'warn',
      title: 'Slow upload',
      detail: `Measured ${formatMbps(up)}. Video calls and cloud backups may struggle.`,
    });
  }

  const advertised = result.meta.connectionDownlink;
  if (advertised != null && down != null && advertised > 0 && down < advertised * 0.35) {
    findings.push({
      id: 'below-estimate',
      severity: 'info',
      title: 'Below browser estimate',
      detail: `Browser Network Information estimated ~${advertised} Mbps; measured ${formatMbps(down)}.`,
    });
  }

  if (result.connectionMode === 'single' && down != null && down < 50) {
    findings.push({
      id: 'single-mode',
      severity: 'info',
      title: 'Single-connection mode',
      detail: 'This run used one stream. Multi-connection mode often measures higher peak throughput.',
    });
  }

  if (!findings.length) {
    findings.push({
      id: 'baseline',
      severity: 'info',
      title: 'No major issues detected',
      detail: 'Latency, loss, and throughput look acceptable for this run.',
    });
  }

  return findings;
}

export function compareTargets(
  internet: SpeedTestResult | null,
  server: SpeedTestResult | null
): SpeedFinding[] {
  if (!internet || !server) {
    return [
      {
        id: 'compare-need-both',
        severity: 'info',
        title: 'Run both targets',
        detail: 'Compare Internet (Cloudflare) with This server to estimate VPN/LAN impact.',
      },
    ];
  }
  const findings: SpeedFinding[] = [];
  const iDown = internet.downloadMbps ?? 0;
  const sDown = server.downloadMbps ?? 0;
  const iPing = internet.pingMs ?? 999;
  const sPing = server.pingMs ?? 999;

  if (sDown > iDown * 1.4 && sPing + 15 < iPing) {
    findings.push({
      id: 'vpn-heuristic',
      severity: 'warn',
      title: 'Possible VPN / WAN bottleneck',
      detail:
        'This host is much faster/lower-latency than Cloudflare. Your path to the public internet may be constrained (VPN, ISP, or Wi‑Fi). Heuristic only — browsers cannot read VPN adapters.',
    });
  } else if (iDown > sDown * 1.4 && iPing + 15 < sPing) {
    findings.push({
      id: 'lan-heuristic',
      severity: 'info',
      title: 'Internet path looks stronger',
      detail:
        'Cloudflare throughput beats this LinkNest host. The host path may be LAN-limited, busy, or farther than the nearest Cloudflare PoP.',
    });
  } else {
    findings.push({
      id: 'paths-similar',
      severity: 'ok',
      title: 'Similar paths',
      detail: `Internet ${formatMbps(iDown)} vs host ${formatMbps(sDown)}; pings ${formatMs(iPing)} / ${formatMs(sPing)}.`,
    });
  }

  return findings;
}

export function describeExecutor(target: SpeedTestTarget, executor: 'browser' | 'worker' = 'browser'): string {
  if (executor === 'worker') {
    return target === 'internet'
      ? 'Server worker → Cloudflare (measures this host’s internet path)'
      : 'Server worker → LinkNest loopback (measures this host locally)';
  }
  if (target === 'custom') {
    return 'This browser → custom endpoint (or LinkNest host when proxied)';
  }
  return target === 'internet'
    ? 'This browser → Cloudflare (your device’s internet path)'
    : 'This browser → LinkNest host (LAN/VPN if you are local)';
}
