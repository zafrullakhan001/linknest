import { SpeedTestResult, formatMbps, formatMs } from './speedTestService';
import { SpeedTestAlertThresholds, loadSpeedTestPreferences, patchSpeedTestPreferences } from './speedTestPreferences';

function coloredIconDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="${color}"/><path d="M20 34l8 8 16-18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function requestSpeedTestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function evaluateSpeedTestAlerts(
  result: SpeedTestResult,
  thresholds: SpeedTestAlertThresholds = loadSpeedTestPreferences().alerts
): string[] {
  if (!thresholds.enabled) return [];
  const breaches: string[] = [];
  if (result.downloadMbps != null && result.downloadMbps < thresholds.minDownloadMbps) {
    breaches.push(`Download ${formatMbps(result.downloadMbps)} below ${thresholds.minDownloadMbps} Mbps`);
  }
  if (result.uploadMbps != null && result.uploadMbps < thresholds.minUploadMbps) {
    breaches.push(`Upload ${formatMbps(result.uploadMbps)} below ${thresholds.minUploadMbps} Mbps`);
  }
  if (result.pingMs != null && result.pingMs > thresholds.maxPingMs) {
    breaches.push(`Ping ${formatMs(result.pingMs)} above ${thresholds.maxPingMs} ms`);
  }
  if (result.jitterMs != null && result.jitterMs > thresholds.maxJitterMs) {
    breaches.push(`Jitter ${formatMs(result.jitterMs)} above ${thresholds.maxJitterMs} ms`);
  }
  if (result.packetLossPct != null && result.packetLossPct > thresholds.maxLossPct) {
    breaches.push(`Loss ${result.packetLossPct.toFixed(0)}% above ${thresholds.maxLossPct}%`);
  }
  const bloat = Math.max(result.bufferbloatDownloadMs ?? 0, result.bufferbloatUploadMs ?? 0);
  if (bloat > thresholds.maxBufferbloatMs) {
    breaches.push(`Bufferbloat +${formatMs(bloat)} above ${thresholds.maxBufferbloatMs} ms`);
  }
  return breaches;
}

function fingerprint(result: SpeedTestResult, breaches: string[]): string {
  return `${result.target}|${result.executor}|${breaches.join('|')}`;
}

export function notifySpeedTestAlerts(result: SpeedTestResult): string[] {
  const prefs = loadSpeedTestPreferences();
  const breaches = evaluateSpeedTestAlerts(result, prefs.alerts);
  if (!breaches.length) return [];
  if (!prefs.browserNotifications && !prefs.alerts.enabled) return breaches;

  const fp = fingerprint(result, breaches);
  if (prefs.lastAlertFingerprint === fp) return breaches;

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('LinkNest speed alert', {
        body: breaches.slice(0, 3).join(' · '),
        icon: coloredIconDataUri('#f59e0b'),
        tag: 'linknest-speedtest-alert',
      });
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          /* ignore */
        }
        n.close();
      };
    } catch {
      /* ignore */
    }
  }

  patchSpeedTestPreferences({ lastAlertFingerprint: fp });
  return breaches;
}

export function notifySpeedTestComplete(result: SpeedTestResult): void {
  const prefs = loadSpeedTestPreferences();
  if (!prefs.browserNotifications) return;
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Speed test complete', {
      body: `${formatMbps(result.downloadMbps)} down / ${formatMbps(result.uploadMbps)} up · ${result.quality.label}`,
      icon: coloredIconDataUri('#06b6d4'),
      tag: 'linknest-speedtest-complete',
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      n.close();
    };
  } catch {
    /* ignore */
  }
}
