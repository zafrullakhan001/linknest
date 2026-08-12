/** In-app SSH link handling: ssh://user@host[:port] → open SSH Terminal widget. */

export const OPEN_SSH_TERMINAL_EVENT = 'openSshTerminal';

export interface OpenSshTerminalDetail {
  host: string;
  port?: number;
  username?: string;
  /** When true (default if username present), start a session immediately. */
  autoConnect?: boolean;
  connectionName?: string;
  sourceUrl?: string;
}

export interface ParsedSshLink {
  host: string;
  port: number;
  username?: string;
}

/**
 * Parse ssh://user@host:port (and auto://user@host:port used by saved connections).
 * Username may be percent-encoded (recommended for PAM: \ → %5C, + → %2B).
 */
export function parseSshLinkUrl(raw: string): ParsedSshLink | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  if (/^ssh:\/\//i.test(s)) {
    const without = s.replace(/^ssh:\/\//i, '');
    // Allow PAM usernames with \, +, etc. Stop username at the last @ before host.
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
    const port = m[2] ? Number.parseInt(m[2], 10) : 22;
    if (!host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
    if (username && username.length > 256) return null;
    return { host, port, username: username || undefined };
  }

  const auto = /^auto:\/\/([^@]+)@([^:/]+):(\d+)$/i.exec(s);
  if (auto) {
    let username: string;
    try {
      username = decodeURIComponent(auto[1]);
    } catch {
      username = auto[1];
    }
    const host = auto[2];
    const port = Number.parseInt(auto[3], 10);
    if (!username || !host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
    if (username.length > 256) return null;
    return { host, port, username };
  }

  return null;
}

export function isSshLinkUrl(raw: string): boolean {
  return parseSshLinkUrl(raw) != null;
}

export function formatSshConnectionName(parsed: ParsedSshLink): string {
  const portSuffix = parsed.port !== 22 ? `:${parsed.port}` : '';
  if (parsed.username) return `${parsed.username}@${parsed.host}${portSuffix}`;
  return `${parsed.host}${portSuffix}`;
}

/** Build a pasteable ssh:// URL (PAM usernames are percent-encoded). */
export function buildSshLinkUrl(username: string, host: string, port: number): string {
  const user = encodeURIComponent(String(username || '').trim());
  const h = String(host || '').trim();
  const p = Number(port) || 22;
  if (!user || !h) return '';
  return `ssh://${user}@${h}:${p}`;
}

export function requestOpenSshTerminal(detail: OpenSshTerminalDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_SSH_TERMINAL_EVENT, { detail }));
}

/**
 * If url is an SSH link, prevent default navigation and open the SSH widget.
 * Returns true when handled.
 */
export function tryHandleSshLinkClick(
  url: string,
  e?: { preventDefault(): void; stopPropagation(): void }
): boolean {
  const parsed = parseSshLinkUrl(url);
  if (!parsed) return false;
  e?.preventDefault();
  e?.stopPropagation();
  const hasUser = Boolean(parsed.username);
  requestOpenSshTerminal({
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    autoConnect: hasUser,
    connectionName: formatSshConnectionName(parsed),
    sourceUrl: url,
  });
  return true;
}
