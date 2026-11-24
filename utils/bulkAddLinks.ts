import { diagnoseLinkUrl, type UrlDiagnosis } from './urlDiagnostics';
import { isHttpOrHttpsUrl } from './urlDisplay';

export const BULK_ADD_MAX_LINES = 100;
export const BULK_ADD_BATCH_SIZE = 20;

export type BulkAddParsedLine = {
  raw: string;
  url: string;
  suggestedUrl: string | null;
  diagnosis: UrlDiagnosis;
  isHttp: boolean;
  fallbackLabel: string;
};

/** Split paste text into trimmed unique lines (one URL per line). */
export function parseBulkAddUrlLines(text: string, maxLines = BULK_ADD_MAX_LINES): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of normalized.split('\n')) {
    const line = part.trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
    if (lines.length >= maxLines) break;
  }
  return lines;
}

/** Build a display name from a URL when page title cannot be fetched. */
export function fallbackLabelFromUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return 'Untitled link';

  try {
    if (/^(ssh|auto):\/\//i.test(trimmed)) {
      const rest = trimmed.replace(/^(ssh|auto):\/\//i, '');
      const host = rest.split('/')[0] || rest;
      return host.includes('@') ? host.split('@').pop() || host : host;
    }
    if (/^(vnc|auto-vnc|rdp):\/\//i.test(trimmed)) {
      return trimmed.replace(/^(vnc|auto-vnc|rdp):\/\//i, '').split('/')[0] || trimmed;
    }
    if (/^file:\/\//i.test(trimmed)) {
      const path = trimmed.replace(/^file:\/\//i, '');
      const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
      return parts[parts.length - 1] || path || 'Local file';
    }
    if (/^(ftp|sftp):\/\//i.test(trimmed)) {
      const u = new URL(trimmed.includes('://') ? trimmed : `ftp://${trimmed}`);
      return u.hostname.replace(/^www\./i, '') || trimmed;
    }
    if (/^mailto:/i.test(trimmed)) {
      return trimmed.replace(/^mailto:/i, '').split('?')[0] || trimmed;
    }
    if (/^tel:/i.test(trimmed)) {
      return trimmed.replace(/^tel:/i, '') || trimmed;
    }

    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (u.hostname) {
      return u.hostname.replace(/^www\./i, '') || trimmed;
    }
  } catch {
    // fall through
  }

  return trimmed.length > 64 ? `${trimmed.slice(0, 63)}…` : trimmed;
}

/** Diagnose each pasted line and pick a default URL (suggested when available). */
export function prepareBulkAddLines(rawLines: string[]): BulkAddParsedLine[] {
  return rawLines.map((raw) => {
    const diagnosis = diagnoseLinkUrl(raw);
    const url = (diagnosis.suggestedUrl || diagnosis.trimmed || raw).trim();
    const isHttp = isHttpOrHttpsUrl(url) || (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !!diagnosis.suggestedUrl);
    const effectiveIsHttp = isHttpOrHttpsUrl(url);
    return {
      raw,
      url,
      suggestedUrl: diagnosis.suggestedUrl,
      diagnosis,
      isHttp: effectiveIsHttp,
      fallbackLabel: fallbackLabelFromUrl(url),
    };
  });
}

export function formatProbeLatency(ms?: number | null): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
