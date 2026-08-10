// Local ttyd auto-start gateway (authenticated). Cookie auth like other services.

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) return envBase;

  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }
  return '/api';
}

const API_BASE = resolveApiBase();
const GW_BASE = `${API_BASE}/ssh-gateway`;

export interface SshGatewaySession {
  sessionId: string;
  wsUrl: string;
  listenPort: number;
  host: string;
  port: number;
  username: string;
  pid?: number;
  x11?: boolean;
  x11Display?: string | null;
}

export interface SshGatewayStatus {
  available: boolean;
  ttydPath?: string | null;
  sshPath?: string | null;
  ttydFound?: boolean;
  sshFound?: boolean;
  missing?: string[];
  hint?: string | null;
  platform?: string;
  maxConnections?: number;
  maxConnectionsCeiling?: number;
  portRange?: [number, number];
  gui?: {
    supported?: boolean;
    display?: string;
    displayReachable?: boolean;
    hint?: string;
  };
  sessions: Array<{
    sessionId: string;
    host?: string;
    port?: number;
    username?: string;
    listenPort?: number;
    wsUrl?: string;
    x11?: boolean;
    createdAt?: number;
  }>;
}

export interface SshGatewayConfigResponse {
  config: {
    ttydPath: string;
    sshPath: string;
    x11Display: string;
    maxConnections: number;
  };
  resolved: {
    ttydPath: string | null;
    sshPath: string | null;
    ttydExists: boolean;
    sshExists: boolean;
    vcxsrvPath: string | null;
  };
  defaults: {
    ttydCandidates: string[];
    sshCandidates: string[];
    maxConnectionsDefault: number;
    maxConnectionsCeiling: number;
    portRange?: [number, number];
  };
}

export const sshGatewayService = {
  async status(): Promise<SshGatewayStatus> {
    const res = await fetch(`${GW_BASE}/status`, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check SSH gateway status');
    return data as SshGatewayStatus;
  },

  async getConfig(): Promise<SshGatewayConfigResponse> {
    const res = await fetch(`${GW_BASE}/config`, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load SSH gateway config');
    return data as SshGatewayConfigResponse;
  },

  async putConfig(input: {
    ttydPath?: string;
    sshPath?: string;
    x11Display?: string;
    maxConnections?: number;
  }): Promise<SshGatewayConfigResponse> {
    const res = await fetch(`${GW_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save SSH gateway config');
    return data as SshGatewayConfigResponse;
  },

  async start(input: {
    host: string;
    port?: number;
    username: string;
    x11?: boolean;
    x11Display?: string;
  }): Promise<SshGatewaySession> {
    const res = await fetch(`${GW_BASE}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        host: input.host,
        port: input.port ?? 22,
        username: input.username,
        x11: Boolean(input.x11),
        x11Display: input.x11Display || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.log ? ` ${String(data.log).slice(0, 200)}` : '';
      throw new Error((data.error || 'Failed to start SSH gateway') + detail);
    }
    return data.session as SshGatewaySession;
  },

  async stop(sessionId: string): Promise<void> {
    const res = await fetch(`${GW_BASE}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to stop SSH gateway');
  },

  /** Kill all ttyd gateways for the signed-in user (orphans left after UI closed). */
  async stopAll(): Promise<{ stopped: number }> {
    const res = await fetch(`${GW_BASE}/stop-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to stop SSH gateways');
    return { stopped: Number((data as any).stopped) || 0 };
  },
};

/** Encode auto-connect target as a synthetic URL for saved connections. */
export function buildAutoTargetUrl(username: string, host: string, port: number): string {
  // Percent-encode username so PAM chars (\ + @ /) survive storage and restore.
  return `auto://${encodeURIComponent(username)}@${host}:${port}`;
}

export function parseAutoTargetUrl(raw: string): { username: string; host: string; port: number } | null {
  const m = /^auto:\/\/([^@]+)@([^:\/]+):(\d+)$/i.exec(String(raw || '').trim());
  if (!m) return null;
  let username: string;
  try {
    username = decodeURIComponent(m[1]);
  } catch {
    username = m[1];
  }
  const host = m[2];
  const port = Number.parseInt(m[3], 10);
  if (!username || !host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
  if (username.length > 256) return null;
  return { username, host, port };
}
