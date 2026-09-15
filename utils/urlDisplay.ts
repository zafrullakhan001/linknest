/**
 * Display-only URL helper: strip protocol and path, then truncate long hosts
 * so layout stays intact. Does not change stored URL values.
 */
export function getDisplayUrl(url: string, maxLength = 48): string {
  if (!url) return '';
  let host = url;
  if (/^(ssh|auto|vnc|auto-vnc):\/\//i.test(url)) {
    host = url.replace(/^(ssh|auto|vnc|auto-vnc):\/\//i, '').split('/')[0] || url;
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

type ShortUrlInheritItem = {
  inheritShortUrls?: boolean | null;
  forceShortUrl?: boolean | null;
} | null | undefined;

/** On/omitted inherits the parent. Off overrides to original URLs. */
export function inheritsShortUrls(item?: ShortUrlInheritItem): boolean {
  return item?.inheritShortUrls !== false;
}

export function forcesShortUrl(item?: ShortUrlInheritItem): boolean {
  return item?.forceShortUrl === true;
}

export function effectiveShowShortUrls(
  spaceOn: boolean,
  ...items: ShortUrlInheritItem[]
): boolean {
  if (items.some((item) => forcesShortUrl(item))) return true;
  if (!spaceOn) return false;
  return items.every((item) => inheritsShortUrls(item));
}

/** Prefer the recyclable short URL when a space is set to show short URLs, or this link forces it. */
export function viewerLinkUrl(
  link: { url?: string; shortUrl?: string; forceShortUrl?: boolean | null } | null | undefined,
  showShortUrls?: boolean | null
): string {
  if ((showShortUrls || forcesShortUrl(link)) && link?.shortUrl) {
    return link.shortUrl;
  }
  return String(link?.url || '');
}

export function viewerLinkDisplay(
  link: { url?: string; shortUrl?: string; forceShortUrl?: boolean | null } | null | undefined,
  showShortUrls?: boolean | null,
  maxLength = 48
): string {
  return getDisplayUrl(viewerLinkUrl(link, showShortUrls), maxLength);
}

/**
 * Rich labels sometimes contain a nested <a href="original">. That inner href
 * wins the browser status-bar preview. Rewrite those hrefs to the viewer URL
 * (short URL when the space is set to show them).
 */
export function rewriteHtmlAnchorHrefs(html: string, href: string): string {
  const source = String(html || '');
  const nextHref = String(href || '');
  if (!source || !nextHref || !/<a\b/i.test(source)) return source;
  const safe = nextHref
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  return source.replace(/<a\b([^>]*?)>/gi, (_match, attrs: string) => {
    const cleaned = String(attrs)
      .replace(/\s*href\s*=\s*(["'])[\s\S]*?\1/gi, '')
      .replace(/\s*href\s*=\s*[^\s>]+/gi, '');
    return `<a${cleaned} href="${safe}">`;
  });
}
