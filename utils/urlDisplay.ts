/**
 * Display-only URL helper: strip protocol and path, then truncate long hosts
 * so layout stays intact. Does not change stored URL values.
 */
export function getDisplayUrl(url: string, maxLength = 48): string {
  if (!url) return '';
  let host = url;
  if (/^(ssh|auto):\/\//i.test(url)) {
    host = url.replace(/^(ssh|auto):\/\//i, '').split('/')[0] || url;
  } else {
    host = url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] || url;
  }
  if (host.length <= maxLength) return host;
  return `${host.slice(0, Math.max(1, maxLength - 1))}…`;
}

/** Persist link URLs exactly as typed (trimmed). Never auto-prefix https://. */
export function normalizeStoredLinkUrl(url: string): string {
  return String(url || '').trim();
}

/** True only when the URL has an explicit http(s) scheme (for health checks). */
export function isHttpOrHttpsUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || '').trim());
}
