/**
 * Client bridge to the SSH SharedWorker.
 * Keeps ttyd WebSockets alive across page refreshes; destroy only via close/closeAll.
 */

export type SshBridgeSessionStatus = 'connecting' | 'open' | 'closed' | 'error';

export type SshBridgeSessionInfo = {
  id: string;
  status: SshBridgeSessionStatus | string;
  gatewaySessionId?: string | null;
  meta?: Record<string, unknown> | null;
  wsUrl?: string | null;
};

export type SshBridgeListener = {
  onMessage?: (data: ArrayBuffer) => void;
  onReplay?: (data: ArrayBuffer) => void;
  onStatus?: (status: SshBridgeSessionStatus | string, detail?: { code?: number; intentional?: boolean; gatewaySessionId?: string | null }) => void;
  onOpenError?: (message: string) => void;
};

type PendingOpen = {
  resolve: (info: { resumed: boolean; status: string }) => void;
  reject: (err: Error) => void;
};

function resolveWorkerUrl(): string {
  const base = String((import.meta as any)?.env?.BASE_URL || '/');
  if (base === './' || base === '.' || base === '') {
    return new URL('ssh-session-shared-worker.js', window.location.href).href;
  }
  const normalized = base.endsWith('/') ? base : `${base}/`;
  try {
    return new URL(`${normalized}ssh-session-shared-worker.js`, window.location.origin).href;
  } catch {
    return `${normalized}ssh-session-shared-worker.js`;
  }
}

/** Candidate URLs for XAMPP /linknest, dist/, portable ./ base, Vite BASE_URL. */
function candidateWorkerUrls(): string[] {
  const origin = window.location.origin;
  const path = window.location.pathname || '/';
  const dir = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
  const base = String((import.meta as any)?.env?.BASE_URL || '/');
  const out: string[] = [];
  const add = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };

  try {
    add(new URL('ssh-session-shared-worker.js', window.location.href).href);
    add(new URL('dist/ssh-session-shared-worker.js', window.location.href).href);
  } catch {
    // ignore
  }
  add(`${origin}${dir}ssh-session-shared-worker.js`);
  add(`${origin}${dir}dist/ssh-session-shared-worker.js`);

  if (base && base !== './' && base !== '.') {
    const normalized = base.endsWith('/') ? base : `${base}/`;
    try {
      add(new URL(`${normalized}ssh-session-shared-worker.js`, origin).href);
      add(new URL(`${normalized}dist/ssh-session-shared-worker.js`, origin).href);
    } catch {
      add(`${normalized}ssh-session-shared-worker.js`);
    }
  }

  // Common XAMPP folder installs
  const m = path.match(/^(\/[^/]+)\//);
  if (m) {
    add(`${origin}${m[1]}/dist/ssh-session-shared-worker.js`);
    add(`${origin}${m[1]}/ssh-session-shared-worker.js`);
  }

  add(resolveWorkerUrl());
  return out;
}

async function pickWorkingWorkerUrl(): Promise<string | null> {
  for (const url of candidateWorkerUrls()) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) continue;
      const text = await res.text();
      const trimmed = text.trimStart();
      if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) continue;
      if (
        text.includes('self.onconnect') ||
        text.includes('linknest-ssh') ||
        (text.includes('SharedWorker') && text.includes('onconnect'))
      ) {
        return url;
      }
      // Accept plain JS that looks like a worker
      if (text.includes('onconnect') && text.includes('WebSocket')) return url;
    } catch {
      // try next
    }
  }
  return null;
}

function bufferFromMessageData(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return null;
}

class SshSessionBridge {
  private worker: SharedWorker | null = null;
  private port: MessagePort | null = null;
  private ready: Promise<void> | null = null;
  private unsupported = false;
  private listeners = new Map<string, Set<SshBridgeListener>>();
  private pendingOpen = new Map<string, PendingOpen>();
  private sessionCache: SshBridgeSessionInfo[] = [];
  private keeperWin: Window | null = null;
  private resolvedWorkerUrl: string | null = null;

  isAvailable(): boolean {
    return typeof SharedWorker !== 'undefined' && !this.unsupported;
  }

  /** Tiny companion window that keeps the SharedWorker alive during main-page refresh. */
  ensureKeeperWindow(): boolean {
    try {
      if (this.keeperWin && !this.keeperWin.closed) {
        try {
          this.keeperWin.postMessage({ source: 'linknest-ssh', type: 'ping' }, '*');
        } catch {
          // ignore
        }
        // Do not focus an existing keeper — leave it in the background.
        return true;
      }
      const url = this.resolveKeeperUrl();
      // Opened from Connect click (user gesture) so popup blockers usually allow it.
      // Place in the bottom-right and keep it small so it is less likely to be closed by accident.
      const width = 300;
      const height = 140;
      const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
      const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
      const viewportW = window.innerWidth || document.documentElement.clientWidth || screen.width;
      const viewportH = window.innerHeight || document.documentElement.clientHeight || screen.height;
      const left = Math.max(0, Math.round(dualScreenLeft + viewportW - width - 16));
      const top = Math.max(0, Math.round(dualScreenTop + viewportH - height - 16));
      const win = window.open(
        url,
        'linknest-ssh-keeper',
        `popup=yes,width=${width},height=${height},left=${left},top=${top}`
      );
      this.keeperWin = win;
      if (!win) return false;

      // Browsers do not allow scripted minimize; tuck away + return focus to the app instead.
      const tuckAway = () => {
        try {
          win.resizeTo(280, 120);
        } catch {
          // ignore
        }
        try {
          const sx = typeof screen !== 'undefined' ? screen.availWidth || screen.width || 0 : 0;
          const sy = typeof screen !== 'undefined' ? screen.availHeight || screen.height || 0 : 0;
          if (sx > 0 && sy > 0) {
            win.moveTo(Math.max(0, sx - 290), Math.max(0, sy - 130));
          }
        } catch {
          // ignore
        }
        try {
          win.blur();
        } catch {
          // ignore
        }
        try {
          win.postMessage({ source: 'linknest-ssh', type: 'go-background' }, '*');
        } catch {
          // ignore
        }
        try {
          window.focus();
        } catch {
          // ignore
        }
      };

      // Run twice: once ASAP, once after the keeper finishes loading.
      tuckAway();
      window.setTimeout(tuckAway, 120);
      window.setTimeout(tuckAway, 400);
      return true;
    } catch {
      return false;
    }
  }

  closeKeeperWindow() {
    try {
      if (this.keeperWin && !this.keeperWin.closed) {
        try {
          this.keeperWin.postMessage({ source: 'linknest-ssh', type: 'close-keeper' }, '*');
        } catch {
          // ignore
        }
        try {
          this.keeperWin.close();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    this.keeperWin = null;
  }

  private resolveKeeperUrl(): string {
    const origin = window.location.origin;
    const path = window.location.pathname || '/';
    const dir = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
    const candidates = [
      new URL('ssh-session-keepalive.html', window.location.href).href,
      new URL('dist/ssh-session-keepalive.html', window.location.href).href,
      `${origin}${dir}ssh-session-keepalive.html`,
      `${origin}${dir}dist/ssh-session-keepalive.html`,
    ];
    const m = path.match(/^(\/[^/]+)\//);
    if (m) {
      candidates.push(`${origin}${m[1]}/dist/ssh-session-keepalive.html`);
      candidates.push(`${origin}${m[1]}/ssh-session-keepalive.html`);
    }
    // Prefer dist when worker was resolved from dist/
    if (this.resolvedWorkerUrl && this.resolvedWorkerUrl.includes('/dist/')) {
      return (
        candidates.find((u) => u.includes('/dist/ssh-session-keepalive.html')) || candidates[0]
      );
    }
    return candidates[0];
  }

  private ensure(): Promise<void> {
    if (this.unsupported) return Promise.reject(new Error('SharedWorker unavailable'));
    if (this.ready) return this.ready;

    this.ready = (async () => {
      try {
        if (typeof SharedWorker === 'undefined') {
          this.unsupported = true;
          throw new Error('SharedWorker unavailable');
        }
        const workerUrl = await pickWorkingWorkerUrl();
        if (!workerUrl) {
          this.unsupported = true;
          throw new Error('SSH SharedWorker script not found (404). Using direct WebSocket.');
        }
        this.resolvedWorkerUrl = workerUrl;
        const worker = new SharedWorker(workerUrl, {
          name: 'linknest-ssh-sessions',
          type: 'classic',
        });
        this.worker = worker;
        this.port = worker.port;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            this.unsupported = true;
            this.ready = null;
            reject(new Error('SSH SharedWorker did not respond. Using direct WebSocket.'));
          }, 2500);

          worker.port.onmessage = (ev) => {
            this.onMessage(ev.data);
            if (ev.data?.type === 'hello-ok' && !settled) {
              settled = true;
              window.clearTimeout(timer);
              resolve();
            }
          };
          worker.port.onmessageerror = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            this.unsupported = true;
            this.ready = null;
            reject(new Error('SSH SharedWorker message error'));
          };
          try {
            worker.port.start();
            worker.port.postMessage({ type: 'hello' });
          } catch (err) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            this.unsupported = true;
            this.ready = null;
            reject(err instanceof Error ? err : new Error('Failed to start SharedWorker'));
          }
        });
      } catch (err) {
        this.unsupported = true;
        this.ready = null;
        this.worker = null;
        this.port = null;
        throw err instanceof Error ? err : new Error('Failed to start SharedWorker');
      }
    })();

    return this.ready;
  }

  /** True only after a successful worker hello (or API exists before probe). Prefer ensure()/open(). */
  async ensureReady(): Promise<boolean> {
    try {
      await this.ensure();
      return true;
    } catch {
      return false;
    }
  }

  private onMessage(msg: any) {
    if (!msg || typeof msg !== 'object') return;
    const type = msg.type;

    if (type === 'hello-ok' || type === 'list-ok') {
      this.sessionCache = Array.isArray(msg.sessions) ? msg.sessions : [];
      return;
    }

    if (type === 'open-ok') {
      const pending = this.pendingOpen.get(msg.id);
      if (pending) {
        this.pendingOpen.delete(msg.id);
        pending.resolve({ resumed: Boolean(msg.resumed), status: String(msg.status || 'connecting') });
      }
      return;
    }

    if (type === 'open-error' || type === 'attach-error') {
      const pending = this.pendingOpen.get(msg.id);
      if (pending) {
        this.pendingOpen.delete(msg.id);
        pending.reject(new Error(msg.message || 'SSH bridge error'));
      }
      this.emit(msg.id, (l) => l.onOpenError?.(String(msg.message || 'SSH bridge error')));
      return;
    }

    if (type === 'status') {
      this.emit(msg.id, (l) =>
        l.onStatus?.(String(msg.status || 'closed'), {
          code: typeof msg.code === 'number' ? msg.code : undefined,
          intentional: Boolean(msg.intentional),
          gatewaySessionId: msg.gatewaySessionId ?? null,
        })
      );
      return;
    }

    if (type === 'message') {
      const buf = bufferFromMessageData(msg.data);
      if (buf) this.emit(msg.id, (l) => l.onMessage?.(buf));
      return;
    }

    if (type === 'replay') {
      const buf = bufferFromMessageData(msg.data);
      if (buf) this.emit(msg.id, (l) => l.onReplay?.(buf));
    }
  }

  private emit(id: string, fn: (listener: SshBridgeListener) => void) {
    const set = this.listeners.get(id);
    if (!set) return;
    for (const listener of set) {
      try {
        fn(listener);
      } catch {
        // ignore
      }
    }
  }

  subscribe(id: string, listener: SshBridgeListener): () => void {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(id);
    };
  }

  async list(): Promise<SshBridgeSessionInfo[]> {
    if (!this.isAvailable()) return [];
    await this.ensure();
    this.port?.postMessage({ type: 'list' });
    // Allow worker to reply
    await new Promise((r) => setTimeout(r, 30));
    return this.sessionCache.slice();
  }

  async open(
    id: string,
    wsUrl: string,
    opts?: { gatewaySessionId?: string | null; meta?: Record<string, unknown> | null }
  ): Promise<{ resumed: boolean; status: string }> {
    await this.ensure();
    return new Promise((resolve, reject) => {
      this.pendingOpen.set(id, { resolve, reject });
      this.port?.postMessage({
        type: 'open',
        id,
        wsUrl,
        gatewaySessionId: opts?.gatewaySessionId ?? null,
        meta: opts?.meta ?? null,
      });
      window.setTimeout(() => {
        if (this.pendingOpen.has(id)) {
          this.pendingOpen.delete(id);
          reject(new Error('Timed out opening SSH bridge session'));
        }
      }, 20000);
    });
  }

  async attach(id: string): Promise<SshBridgeSessionInfo> {
    await this.ensure();
    return new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || msg.id !== id) return;
        if (msg.type === 'attach-ok') {
          this.port?.removeEventListener('message', onMsg as any);
          resolve({
            id,
            status: msg.status,
            gatewaySessionId: msg.gatewaySessionId,
            meta: msg.meta,
            wsUrl: msg.wsUrl,
          });
        } else if (msg.type === 'attach-error') {
          this.port?.removeEventListener('message', onMsg as any);
          reject(new Error(msg.message || 'Attach failed'));
        }
      };
      this.port?.addEventListener('message', onMsg as any);
      this.port?.postMessage({ type: 'attach', id });
      window.setTimeout(() => {
        this.port?.removeEventListener('message', onMsg as any);
        reject(new Error('Timed out attaching SSH bridge session'));
      }, 8000);
    });
  }

  detach(id: string) {
    try {
      this.port?.postMessage({ type: 'detach', id });
    } catch {
      // ignore
    }
    this.listeners.delete(id);
  }

  detachAll() {
    try {
      this.port?.postMessage({ type: 'detach-all' });
    } catch {
      // ignore
    }
    this.listeners.clear();
  }

  send(id: string, data: ArrayBuffer | Uint8Array | string) {
    if (!this.port) return;
    if (typeof data === 'string') {
      this.port.postMessage({ type: 'send', id, data });
      return;
    }
    if (data instanceof Uint8Array) {
      const copy = data.slice().buffer;
      this.port.postMessage({ type: 'send', id, data: copy }, [copy]);
      return;
    }
    const copy = data.slice(0);
    this.port.postMessage({ type: 'send', id, data: copy }, [copy]);
  }

  updateMeta(id: string, patch: { gatewaySessionId?: string | null; meta?: Record<string, unknown> | null }) {
    try {
      this.port?.postMessage({ type: 'update-meta', id, ...patch });
    } catch {
      // ignore
    }
  }

  close(id: string) {
    try {
      this.port?.postMessage({ type: 'close', id });
    } catch {
      // ignore
    }
    this.listeners.delete(id);
    this.pendingOpen.delete(id);
  }

  closeAll() {
    try {
      this.port?.postMessage({ type: 'close-all' });
    } catch {
      // ignore
    }
    this.listeners.clear();
    this.pendingOpen.clear();
    this.closeKeeperWindow();
  }
}

export const sshSessionBridge = new SshSessionBridge();

export const SSH_LIVE_TABS_KEY = 'linknest.sshTerminal.liveTabs.v1';

export type PersistedLiveTab = {
  id: string;
  title: string;
  connectionId: string | null;
  status: string;
  statusMessage?: string;
  kind?: 'ssh' | 'rdp';
  rdpUrl?: string;
  excludeFromMulti?: boolean;
  gatewaySessionId?: string | null;
  wsUrl?: string | null;
  duplicateSource?: {
    kind: 'ssh' | 'rdp';
    connectionId: string | null;
    wsUrl?: string;
    rdpUrl?: string;
    mode?: string;
    host?: string;
    port?: number;
    username?: string;
    x11?: boolean;
  };
};

export type PersistedLiveTabsState = {
  tabs: PersistedLiveTab[];
  activeTabId: string | null;
  savedAt: number;
};

export function loadPersistedLiveTabs(): PersistedLiveTabsState | null {
  try {
    const raw = sessionStorage.getItem(SSH_LIVE_TABS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    return {
      tabs: parsed.tabs,
      activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function savePersistedLiveTabs(state: PersistedLiveTabsState | null) {
  try {
    if (!state || state.tabs.length === 0) {
      sessionStorage.removeItem(SSH_LIVE_TABS_KEY);
      return;
    }
    sessionStorage.setItem(SSH_LIVE_TABS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearPersistedLiveTabs() {
  try {
    sessionStorage.removeItem(SSH_LIVE_TABS_KEY);
  } catch {
    // ignore
  }
}
