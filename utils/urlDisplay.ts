/**
 * Display-only URL helper: strip protocol and path, then truncate long hosts
 * so layout stays intact. Does not change stored URL values.
 */
export function getDisplayUrl(url: string, maxLength = 48): string {
  if (!url) return '';
  const host =
    url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] || url;
  if (host.length <= maxLength) return host;
  return `${host.slice(0, Math.max(1, maxLength - 1))}…`;
}
