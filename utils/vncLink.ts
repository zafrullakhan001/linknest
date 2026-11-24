/** In-app VNC link handling: vnc://host[:port] → open VNC Viewer widget. */

export const OPEN_VNC_VIEWER_EVENT = 'openVncViewer';

export interface OpenVncViewerDetail {
  host: string;
  port?: number;
  /** Optional label hint only (VNC auth is password-based). */
  username?: string;
  /** When true (default), start a session immediately. */
  autoConnect?: boolean;
  connectionName?: string;
  sourceUrl?: string;
}

export interface ParsedVncLink {
  host: string;
  port: number;
  username?: string;
}

/**
 * Parse vnc://[user@]host[:port] (default port 5900).
 * Also accepts auto-vnc://host:port used by saved Easy-mode connections.
 */
export function parseVncLinkUrl(raw: string): ParsedVncLink | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  if (/^vnc:\/\//i.test(s)) {
    const without = s.replace(/^vnc:\/\//i, '');
    const at = without.lastIndexOf('@');
    let userRaw = '';
    let hostPortPath = without;
    if (at > 0) {
      userRaw = without.slice(0, at);
      hostPortPath = without.slice(at + 1);
    }
    const m = /^(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?/i.exec(hostPortPath);
    if (!m) return null;
    let username: string | undefined;
    if (userRaw) {
      try {
        username = decodeURIComponent(userRaw);
      } catch {
        username = userRaw;
      }
    }
    const hostPart = m[1];
    const host = hostPart.startsWith('[') && hostPart.endsWith(']') ? hostPart.slice(1, -1) : hostPart;
    const port = m[2] ? Number.parseInt(m[2], 10) : 5900;
    if (!host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
    if (username && username.length > 256) return null;
    return { host, port, username: username || undefined };
  }

  const auto = /^auto-vnc:\/\/([^:/]+):(\d+)$/i.exec(s);
  if (auto) {
    const host = auto[1];
    const port = Number.parseInt(auto[2], 10);
    if (!host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
    return { host, port };
  }

  return null;
}

export function isVncLinkUrl(raw: string): boolean {
  return parseVncLinkUrl(raw) != null;
}

export function formatVncConnectionName(parsed: ParsedVncLink): string {
  const portSuffix = parsed.port !== 5900 ? `:${parsed.port}` : '';
  if (parsed.username) return `${parsed.username}@${parsed.host}${portSuffix}`;
  return `${parsed.host}${portSuffix}`;
}

export function requestOpenVncViewer(detail: OpenVncViewerDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_VNC_VIEWER_EVENT, { detail }));
}

/**
 * If url is a VNC link, prevent default navigation and open the VNC widget.
 * Returns true when handled.
 */
export function tryHandleVncLinkClick(
  url: string,
  e?: { preventDefault(): void; stopPropagation(): void }
): boolean {
  const parsed = parseVncLinkUrl(url);
  if (!parsed) return false;
  e?.preventDefault();
  e?.stopPropagation();
  requestOpenVncViewer({
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    autoConnect: true,
    connectionName: formatVncConnectionName(parsed),
    sourceUrl: url,
  });
  return true;
}
