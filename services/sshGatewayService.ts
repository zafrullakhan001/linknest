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

export interface SshGatewaySessionMemory {
  pid?: number | null;
  ttydBytes?: number | null;
  childrenBytes?: number;
  childProcessCount?: number;
  totalBytes?: number | null;
  ttydHuman?: string | null;
  childrenHuman?: string | null;
  totalHuman?: string | null;
}

export interface SshGatewayUsageMine {
  sessions: number;
  maxConnections: number;
  remaining: number;
  memoryBytes: number;
  memoryHuman?: string | null;
  clientless?: number;
}

export interface SshGatewayUsageGlobal {
  sessions: number;
  portCapacity: number;
  remainingPorts: number;
  memoryBytes: number;
  memoryHuman?: string | null;
  clientless?: number;
  note?: string;
}

export interface SshGatewayHostResources {
  memoryTotalBytes?: number | null;
  memoryAvailableBytes?: number | null;
  memoryUsedBytes?: number | null;
  memoryTotalHuman?: string | null;
  memoryAvailableHuman?: string | null;
  memoryUsedHuman?: string | null;
  cpuCount?: number | null;
  loadAverage?: { '1m': number; '5m': number; '15m': number } | null;
}

export interface SshGatewaySessionStatusRow {
  sessionId: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  listenPort?: number | null;
  wsUrl?: string | null;
  x11?: boolean;
  createdAt?: number | null;
  lastClientAt?: number | null;
  clientCount?: number;
  orphan?: boolean;
  pid?: number | null;
  userId?: number | null;
  memory?: SshGatewaySessionMemory;
}

export interface SshGatewayStatus {
  available: boolean;
  /** Admin kill-switch; false when SSH Gateway add-on is disabled. */
  enabled?: boolean;
  ttydPath?: string | null;
  sshPath?: string | null;
  ttydFound?: boolean;
  sshFound?: boolean;
  missing?: string[];
  hint?: string | null;
  platform?: string;
  docker?: boolean;
  maxConnections?: number;
  maxConnectionsCeiling?: number;
  portRange?: [number, number];
  gui?: {
    supported?: boolean;
    display?: string;
    displayReachable?: boolean;
    hint?: string;
  };
  usage?: {
    mine: SshGatewayUsageMine;
    global: SshGatewayUsageGlobal;
    host?: SshGatewayHostResources;
    idleSec?: number;
    sampledAt?: number;
  };
  sessions: SshGatewaySessionStatusRow[];
  /** Present for admins only — every active ttyd on the server. */
  allSessions?: SshGatewaySessionStatusRow[];
  proxy?: {
    preferHttpProxy?: boolean;
    basePath?: string;
    exampleWsUrl?: string;
  };
}

export interface SshGatewayConfigResponse {
  config: {
    enabled: boolean;
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
    enabled?: boolean;
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
    /** TERM for ttyd -T / remote PTY (allowlisted modern values) */
    termType?: string;
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
        termType: input.termType || undefined,
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

  /** Kill all ttyd gateways for the signed-in user (orphans left after UI closed).
   *  Admins may pass scope: 'all' to kill every gateway on the server. */
  async stopAll(opts?: { scope?: 'mine' | 'all' }): Promise<{
    stopped: number;
    sweptUntracked?: number;
    scope?: string;
  }> {
    const res = await fetch(`${GW_BASE}/stop-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(opts?.scope === 'all' ? { scope: 'all' } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to stop SSH gateways');
    return {
      stopped: Number((data as any).stopped) || 0,
      sweptUntracked: Number((data as any).sweptUntracked) || 0,
      scope: typeof (data as any).scope === 'string' ? (data as any).scope : undefined,
    };
  },
};

/** Encode auto-connect target as a synthetic URL for saved connections. */
export function buildAutoTargetUrl(username: string, host: string, port: number): string {
  // Percent-encode username so PAM chars (\ + @ /) survive storage and restore.
  return `auto://${encodeURIComponent(username)}@${host}:${port}`;
}

export function parseAutoTargetUrl(raw: string): { username: string; host: string; port: number } | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  // ssh:// and auto:// — username may contain @ (PAM); split on the last @ before host:port
  if (/^(ssh|auto):\/\//i.test(s)) {
    const without = s.replace(/^(ssh|auto):\/\//i, '');
    const at = without.lastIndexOf('@');
    if (at <= 0) return null;
    let username: string;
    try {
      username = decodeURIComponent(without.slice(0, at));
    } catch {
      username = without.slice(0, at);
    }
    const hostPort = without.slice(at + 1);
    const m = /^(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?/i.exec(hostPort);
    if (!m) return null;
    const hostPart = m[1];
    const host = hostPart.startsWith('[') && hostPart.endsWith(']') ? hostPart.slice(1, -1) : hostPart;
    const port = m[2] ? Number.parseInt(m[2], 10) : 22;
    if (!username || !host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
    if (username.length > 256) return null;
    return { username, host, port };
  }

  return null;
}
