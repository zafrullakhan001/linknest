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

export interface VncGatewayStatus {
  available: boolean;
  pythonPath?: string | null;
  websockifyPath?: string | null;
  websockifyModule?: boolean;
  packagesDir?: string;
  platform?: string;
  portRange?: [number, number];
  sessions: Array<{
    sessionId: string;
    host?: string;
    port?: number;
    listenPort?: number;
    wsUrl?: string;
    createdAt?: number;
  }>;
}

export interface VncGatewayConfigResponse {
  config: {
    pythonPath: string;
    websockifyPath: string;
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
    pythonPath?: string;
    websockifyPath?: string;
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

  async stopAll(): Promise<{ stopped: number }> {
    const res = await fetch(`${GW_BASE}/stop-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to stop VNC gateways');
    return { stopped: Number((data as any).stopped) || 0 };
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
