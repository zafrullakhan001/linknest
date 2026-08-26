// Local websockify auto-start gateway (authenticated). Cookie auth like other services.

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
const GW_BASE = `${API_BASE}/vnc-gateway`;

export interface VncGatewaySession {
  sessionId: string;
  wsUrl: string;
  listenPort: number;
  host: string;
  port: number;
  pid?: number;
}

export interface VncGatewaySessionMemory {
  pid?: number | null;
  processBytes?: number | null;
  childrenBytes?: number;
  childProcessCount?: number;
  totalBytes?: number | null;
  processHuman?: string | null;
  childrenHuman?: string | null;
  totalHuman?: string | null;
}

export interface VncGatewayUsageMine {
  sessions: number;
  maxConnections: number;
  remaining: number;
  memoryBytes: number;
  memoryHuman?: string | null;
}

export interface VncGatewayUsageGlobal {
  sessions: number;
  portCapacity: number;
  remainingPorts: number;
  memoryBytes: number;
  memoryHuman?: string | null;
  note?: string;
}

export interface VncGatewayHostResources {
  memoryTotalBytes?: number | null;
  memoryAvailableBytes?: number | null;
  memoryUsedBytes?: number | null;
  memoryTotalHuman?: string | null;
  memoryAvailableHuman?: string | null;
  memoryUsedHuman?: string | null;
  cpuCount?: number | null;
  loadAverage?: { '1m': number; '5m': number; '15m': number } | null;
}

export interface VncGatewaySessionStatusRow {
  sessionId: string;
  host?: string | null;
  port?: number | null;
  listenPort?: number | null;
  wsUrl?: string | null;
  createdAt?: number | null;
  pid?: number | null;
  userId?: number | null;
  memory?: VncGatewaySessionMemory;
}

export interface VncGatewayStatus {
  available: boolean;
  /** Admin kill-switch; false when VNC Gateway add-on is disabled. */
  enabled?: boolean;
  hint?: string | null;
  pythonPath?: string | null;
  websockifyPath?: string | null;
  websockifyModule?: boolean;
  packagesDir?: string;
  platform?: string;
  maxConnections?: number;
  maxConnectionsCeiling?: number;
  portRange?: [number, number];
  usage?: {
    mine: VncGatewayUsageMine;
    global: VncGatewayUsageGlobal;
    host?: VncGatewayHostResources;
    sampledAt?: number;
  };
  sessions: VncGatewaySessionStatusRow[];
  /** Present for admins only — every active websockify on the server. */
  allSessions?: VncGatewaySessionStatusRow[];
}

export interface VncGatewayConfigResponse {
  config: {
    enabled: boolean;
    pythonPath: string;
    websockifyPath: string;
    maxConnections: number;
  };
  resolved: {
    pythonPath: string | null;
    websockifyPath: string | null;
    pythonExists: boolean;
    websockifyExists: boolean;
    packagesDir: string;
    packagesPresent: boolean;
  };
  defaults: {
    pythonCandidates: string[];
    launcherCandidates: string[];
    maxConnectionsDefault: number;
    maxConnectionsCeiling: number;
    portRange?: [number, number];
  };
}

export const vncGatewayService = {
  async status(): Promise<VncGatewayStatus> {
    const res = await fetch(`${GW_BASE}/status`, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check VNC gateway status');
    return data as VncGatewayStatus;
  },

  async getConfig(): Promise<VncGatewayConfigResponse> {
    const res = await fetch(`${GW_BASE}/config`, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load VNC gateway config');
    return data as VncGatewayConfigResponse;
  },

  async putConfig(input: {
    enabled?: boolean;
    pythonPath?: string;
    websockifyPath?: string;
    maxConnections?: number;
  }): Promise<VncGatewayConfigResponse> {
    const res = await fetch(`${GW_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save VNC gateway config');
    return data as VncGatewayConfigResponse;
  },

  async start(input: { host: string; port?: number }): Promise<VncGatewaySession> {
    const res = await fetch(`${GW_BASE}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        host: input.host,
        port: input.port ?? 5900,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to start VNC gateway') as Error & {
        code?: string;
        log?: string;
      };
      err.code = data.code;
      err.log = data.log;
      if (data.log) err.message += ` ${String(data.log).slice(0, 200)}`;
      throw err;
    }
    return data.session as VncGatewaySession;
  },

  async stop(sessionId: string): Promise<void> {
    const res = await fetch(`${GW_BASE}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to stop VNC gateway');
  },

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
    if (!res.ok) throw new Error((data as any).error || 'Failed to stop VNC gateways');
    return {
      stopped: Number((data as any).stopped) || 0,
      sweptUntracked: Number((data as any).sweptUntracked) || 0,
      scope: typeof (data as any).scope === 'string' ? (data as any).scope : undefined,
    };
  },
};

/** Encode Easy-mode target as a synthetic URL for saved connections. */
export function buildAutoVncTargetUrl(host: string, port: number): string {
  return `auto-vnc://${host}:${port}`;
}

export function parseAutoVncTargetUrl(raw: string): { host: string; port: number } | null {
  const m = /^auto-vnc:\/\/([^:\/]+):(\d+)$/i.exec(String(raw || '').trim());
  if (!m) return null;
  const host = m[1];
  const port = Number.parseInt(m[2], 10);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
  return { host, port };
}
