import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../contexts/AuthContext';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';
import {
  sshConnectionService,
  type SavedSshConnection,
  SSH_CONNECTION_COLORS,
  normalizeSshColor,
} from '../services/sshConnectionService';
import {
  buildAutoTargetUrl,
  parseAutoTargetUrl,
  sshGatewayService,
} from '../services/sshGatewayService';
import type { OpenSshTerminalDetail } from '../utils/sshLink';

interface SshTerminalWidgetProps {
  onClose?: () => void;
  /** Request from App (ssh:// click) — requestId changes on every open. */
  pendingOpen?: (OpenSshTerminalDetail & { requestId: number }) | null;
  onPendingOpenConsumed?: () => void;
}

const WS_STORAGE_KEY = 'linknest.sshTerminal.wsUrl.v1';
const HOST_STORAGE_KEY = 'linknest.sshTerminal.host.v1';
const PORT_STORAGE_KEY = 'linknest.sshTerminal.port.v1';
const USER_STORAGE_KEY = 'linknest.sshTerminal.username.v1';
const MODE_STORAGE_KEY = 'linknest.sshTerminal.mode.v1';
const X11_STORAGE_KEY = 'linknest.sshTerminal.x11.v1';
const CONNECTIONS_STORAGE_KEY = 'linknest.sshTerminal.savedConnections.v1';
const PANEL_OPEN_KEY = 'linknest.sshTerminal.panelOpen.v1';
const PANEL_WIDTH_KEY = 'linknest.sshTerminal.panelWidth.v1';
const PANEL_MIN_WIDTH = 160;
const PANEL_MAX_WIDTH = 420;
const MAX_SSH_TABS = 8;

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
type ConnectMode = 'auto' | 'ws';

interface SessionTab {
  id: string;
  title: string;
  connectionId: string | null;
  status: ConnState;
  statusMessage: string;
}

interface SessionHandle {
  term: Terminal | null;
  fit: FitAddon | null;
  ws: WebSocket | null;
  gatewaySessionId: string | null;
}

const CMD = {
  OUTPUT: '0',
  SET_WINDOW_TITLE: '1',
  SET_PREFERENCES: '2',
  INPUT: '0',
  RESIZE_TERMINAL: '1',
} as const;

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^auto:\/\//i.test(trimmed)) return trimmed;
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return `wss://${trimmed.slice(8)}`;
  if (/^http:\/\//i.test(trimmed)) return `ws://${trimmed.slice(7)}`;
  return `ws://${trimmed}`;
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,#]+/)) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function loadLocalConnections(): SavedSshConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === 'string' && typeof c.wsUrl === 'string' && typeof c.name === 'string')
      .map((c) => ({
        id: c.id,
        name: String(c.name),
        wsUrl: String(c.wsUrl),
        tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        notes: typeof c.notes === 'string' && c.notes ? c.notes : undefined,
        color: normalizeSshColor(c.color),
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
        lastUsedAt: typeof c.lastUsedAt === 'number' ? c.lastUsedAt : undefined,
      }));
  } catch {
    return [];
  }
}

function persistLocalConnections(list: SavedSshConnection[]) {
  try {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function newId(): string {
  return `ssh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return 220;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 220;
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, n));
  } catch {
    return 220;
  }
}

function textDecoderDecode(data: ArrayBuffer | string): string {
  if (typeof data === 'string') return data;
  return new TextDecoder().decode(data);
}

function parseTtydFrame(data: ArrayBuffer | Blob | string): { cmd: string; payload: Uint8Array | string } | null {
  if (typeof data === 'string') {
    if (!data) return null;
    return { cmd: data[0], payload: data.slice(1) };
  }
  if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    if (bytes.length === 0) return null;
    return { cmd: String.fromCharCode(bytes[0]), payload: bytes.subarray(1) };
  }
  return null;
}

export const SshTerminalWidget: React.FC<SshTerminalWidgetProps> = ({
  onClose,
  pendingOpen,
  onPendingOpenConsumed,
}) => {
  const { isAuthenticated } = useAuth();
  const sessionHandlesRef = useRef<Map<string, SessionHandle>>(new Map());
  const tabHostsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const activeTabIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const widgetRootRef = useRef<HTMLDivElement>(null);
  const panelWidthRef = useRef(loadPanelWidth());
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const encoderRef = useRef(new TextEncoder());

  const [connectMode, setConnectMode] = useState<ConnectMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY) as ConnectMode | null;
    if (saved === 'auto' || saved === 'ws') return saved;
    return 'auto';
  });
  const [sshHost, setSshHost] = useState(() => localStorage.getItem(HOST_STORAGE_KEY) || '');
  const [sshPort, setSshPort] = useState(() => localStorage.getItem(PORT_STORAGE_KEY) || '22');
  const [sshUsername, setSshUsername] = useState(() => localStorage.getItem(USER_STORAGE_KEY) || '');
  const [x11Forward, setX11Forward] = useState(() => localStorage.getItem(X11_STORAGE_KEY) === 'true');
  const [gatewayAvailable, setGatewayAvailable] = useState<boolean | null>(null);
  const [guiHint, setGuiHint] = useState<string | null>(null);
  const [guiDisplayReady, setGuiDisplayReady] = useState<boolean | null>(null);

  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(WS_STORAGE_KEY) || 'ws://localhost:7681/ws');
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tileLayout, setTileLayout] = useState(false);
  const [broadcastCmd, setBroadcastCmd] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem(PANEL_OPEN_KEY) !== 'false');
  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth());
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [storageReady, setStorageReady] = useState(!isAuthenticated);
  const [saving, setSaving] = useState(false);

  const [connections, setConnections] = useState<SavedSshConnection[]>(() =>
    isAuthenticated ? [] : loadLocalConnections()
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftColor, setDraftColor] = useState<string>(SSH_CONNECTION_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState(
    'Enter host, port, and username — LinkNest starts ttyd for you.'
  );

  const useServer = Boolean(isAuthenticated);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const status: ConnState = activeTab?.status ?? 'idle';
  const statusMessage = activeTab?.statusMessage ?? notice;

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const updateTab = useCallback((tabId: string, patch: Partial<SessionTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, connectMode);
      localStorage.setItem(HOST_STORAGE_KEY, sshHost);
      localStorage.setItem(PORT_STORAGE_KEY, sshPort);
      localStorage.setItem(USER_STORAGE_KEY, sshUsername);
      localStorage.setItem(X11_STORAGE_KEY, x11Forward ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [connectMode, sshHost, sshPort, sshUsername, x11Forward]);

  useEffect(() => {
    if (!useServer) {
      setGatewayAvailable(false);
      setGuiDisplayReady(null);
      setGuiHint(null);
      return;
    }
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const st = await sshGatewayService.status();
        if (cancelled) return;
        setGatewayAvailable(Boolean(st.available));
        setGuiDisplayReady(st.gui?.displayReachable ?? null);
        setGuiHint(st.gui?.hint || null);
      } catch {
        if (!cancelled) {
          setGatewayAvailable(false);
          setGuiDisplayReady(null);
        }
      }
    };
    void loadStatus();
    const t = window.setInterval(() => {
      if (x11Forward) void loadStatus();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [useServer, x11Forward]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    connections.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return connections
      .filter((c) => {
        if (filterTag && !c.tags.includes(filterTag)) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.wsUrl.toLowerCase().includes(q) ||
          (c.notes || '').toLowerCase().includes(q) ||
          c.tags.some((t) => t.includes(q)) ||
          (() => {
            const a = parseAutoTargetUrl(c.wsUrl);
            if (!a) return false;
            return (
              a.host.toLowerCase().includes(q) ||
              a.username.toLowerCase().includes(q) ||
              String(a.port).includes(q)
            );
          })()
        );
      })
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));
  }, [connections, filterQuery, filterTag]);

  const updateConnectionsLocal = useCallback((next: SavedSshConnection[]) => {
    setConnections(next);
    persistLocalConnections(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!useServer) {
        setConnections(loadLocalConnections());
        setStorageReady(true);
        return;
      }
      setStorageReady(false);
      try {
        const list = await sshConnectionService.list();
        if (!cancelled) {
          setConnections(list);
          setStorageReady(true);
        }
      } catch (err) {
        console.error('Failed to load SSH connections', err);
        if (!cancelled) {
          setNotice(err instanceof Error ? err.message : 'Failed to load saved connections');
          setStorageReady(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [useServer]);

  const stopGatewayFor = useCallback(async (gatewaySessionId: string | null | undefined) => {
    if (!gatewaySessionId) return;
    try {
      await sshGatewayService.stop(gatewaySessionId);
    } catch {
      // ignore
    }
  }, []);

  /** Tabs whose WebSocket is being closed on purpose (UI close / reconnect) — skip auto-close-on-exit. */
  const intentionalWsCloseRef = useRef(new Set<string>());

  const disposeSessionHandle = useCallback((tabId: string, opts?: { keepHost?: boolean }) => {
    const handle = sessionHandlesRef.current.get(tabId);
    if (!handle) return;
    if (handle.ws) {
      intentionalWsCloseRef.current.add(tabId);
      try {
        handle.ws.close();
      } catch {
        // ignore
      }
    }
    handle.ws = null;
    try {
      handle.term?.dispose();
    } catch {
      // ignore
    }
    handle.term = null;
    handle.fit = null;
    const host = tabHostsRef.current.get(tabId);
    if (host && !opts?.keepHost) {
      host.innerHTML = '';
    }
    const gw = handle.gatewaySessionId;
    handle.gatewaySessionId = null;
    sessionHandlesRef.current.set(tabId, handle);
    return gw;
  }, []);

  const closeTab = useCallback(
    async (tabId: string) => {
      const handle = sessionHandlesRef.current.get(tabId);
      const gw = handle?.gatewaySessionId ?? null;
      disposeSessionHandle(tabId);
      sessionHandlesRef.current.delete(tabId);
      tabHostsRef.current.delete(tabId);
      void stopGatewayFor(gw);

      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        setActiveTabId((current) => {
          if (current !== tabId) return current;
          return next.length ? next[next.length - 1].id : null;
        });
        return next;
      });
    },
    [disposeSessionHandle, stopGatewayFor]
  );

  const toggleFullscreen = useCallback(async () => {
    const el = widgetRootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setPanelOpen(true);
        await el.requestFullscreen();
      } else {
        setPanelOpen(true);
        await el.requestFullscreen();
      }
    } catch {
      setNotice('Fullscreen is not available in this browser/context');
    }
  }, []);

  const markLastUsed = useCallback(
    async (connectionId: string | null | undefined) => {
      if (!connectionId) return;
      const now = Date.now();
      setConnections((prev) => {
        const next = prev.map((c) => (c.id === connectionId ? { ...c, lastUsedAt: now } : c));
        if (!useServer) persistLocalConnections(next);
        return next;
      });
      if (useServer) {
        try {
          await sshConnectionService.update(connectionId, { lastUsedAt: now });
        } catch {
          // non-fatal
        }
      }
    },
    [useServer]
  );

  const sendResize = useCallback((tabId?: string | null) => {
    const id = tabId ?? activeTabIdRef.current;
    if (!id) return;
    const handle = sessionHandlesRef.current.get(id);
    const term = handle?.term;
    const ws = handle?.ws;
    if (!term || !ws || ws.readyState !== WebSocket.OPEN) return;
    const msg = CMD.RESIZE_TERMINAL + JSON.stringify({ columns: term.cols, rows: term.rows });
    ws.send(encoderRef.current.encode(msg));
  }, []);

  const fitSessions = useCallback(
    (ids?: string[] | null) => {
      const list = ids && ids.length ? ids : Array.from(sessionHandlesRef.current.keys());
      for (const id of list) {
        try {
          sessionHandlesRef.current.get(id)?.fit?.fit();
          sendResize(id);
        } catch {
          // ignore
        }
      }
    },
    [sendResize]
  );

  const broadcastToAll = useCallback(
    (raw: string) => {
      const text = raw.replace(/\r\n/g, '\n');
      if (!text) return;
      const payload = text.endsWith('\n') ? text : `${text}\n`;
      const frame = encoderRef.current.encode(CMD.INPUT + payload);
      let sent = 0;
      for (const tab of tabs) {
        if (tab.status !== 'connected') continue;
        const ws = sessionHandlesRef.current.get(tab.id)?.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(frame);
          sent += 1;
        } catch {
          // ignore
        }
      }
      setNotice(
        sent > 0
          ? `Sent to ${sent} terminal${sent === 1 ? '' : 's'}`
          : 'No connected terminals to receive the command'
      );
    },
    [tabs]
  );

  const tileCols = useMemo(() => {
    const n = tabs.length;
    if (n <= 1) return 1;
    if (n === 2) return 2;
    if (n <= 4) return 2;
    if (n <= 6) return 3;
    return 4;
  }, [tabs.length]);

  useEffect(() => {
    const onFs = () => {
      const active = document.fullscreenElement === widgetRootRef.current;
      setIsFullscreen(active);
      window.setTimeout(() => fitSessions(), 80);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [fitSessions]);

  const waitForTabHost = useCallback(async (tabId: string): Promise<HTMLDivElement | null> => {
    for (let i = 0; i < 30; i++) {
      const el = tabHostsRef.current.get(tabId);
      if (el) return el;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    return tabHostsRef.current.get(tabId) ?? null;
  }, []);

  const connectTo = useCallback(
    async (opts?: {
      wsUrl?: string;
      connectionId?: string | null;
      connectionName?: string;
      host?: string;
      port?: number;
      username?: string;
      mode?: ConnectMode;
      x11?: boolean;
    }) => {
      if (sessionHandlesRef.current.size >= MAX_SSH_TABS) {
        setNotice(`Maximum of ${MAX_SSH_TABS} open sessions. Close a tab first.`);
        return;
      }

      const mode = opts?.mode ?? connectMode;
      let url = normalizeWsUrl(opts?.wsUrl ?? wsUrl);
      const nextConnectionId = opts?.connectionId !== undefined ? opts.connectionId : activeConnectionId;
      const nextName = opts?.connectionName;
      const tabId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const tabTitle = (nextName || '').trim() || (opts?.host ? `${opts.username || sshUsername}@${opts.host}` : 'Session');

      sessionHandlesRef.current.set(tabId, {
        term: null,
        fit: null,
        ws: null,
        gatewaySessionId: null,
      });
      setTabs((prev) => [
        ...prev,
        {
          id: tabId,
          title: tabTitle || 'Session',
          connectionId: nextConnectionId,
          status: 'connecting',
          statusMessage: 'Starting session…',
        },
      ]);
      setActiveTabId(tabId);
      setActiveConnectionId(nextConnectionId ?? null);
      setShowSettings(false);

      const failTab = (message: string) => {
        const handle = sessionHandlesRef.current.get(tabId);
        const gw = handle?.gatewaySessionId ?? null;
        if (handle) handle.gatewaySessionId = null;
        disposeSessionHandle(tabId);
        sessionHandlesRef.current.delete(tabId);
        tabHostsRef.current.delete(tabId);
        void stopGatewayFor(gw);
        setTabs((prev) => {
          const next = prev.filter((t) => t.id !== tabId);
          setActiveTabId((current) => {
            if (current !== tabId) return current;
            return next.length ? next[next.length - 1].id : null;
          });
          return next;
        });
        setNotice(message);
        setShowSettings(true);
      };

      const autoFromUrl = parseAutoTargetUrl(url);
      const wantAuto =
        mode === 'auto' || Boolean(autoFromUrl) || (Boolean(opts?.host) && Boolean(opts?.username));

      if (wantAuto) {
        if (!useServer) {
          failTab('Sign in to use automatic SSH (LinkNest starts ttyd for you). Or switch to WebSocket URL mode.');
          return;
        }
        const host = (opts?.host ?? autoFromUrl?.host ?? sshHost).trim();
        const username = (opts?.username ?? autoFromUrl?.username ?? sshUsername).trim();
        const port = opts?.port ?? autoFromUrl?.port ?? (Number.parseInt(sshPort, 10) || 22);
        if (!host || !username) {
          failTab('Host and username are required.');
          return;
        }
        const title = nextName?.trim() || `${username}@${host}`;
        updateTab(tabId, {
          title,
          statusMessage:
            (opts?.x11 ?? x11Forward)
              ? `Starting SSH+GUI gateway to ${username}@${host}:${port}…`
              : `Starting SSH gateway to ${username}@${host}:${port}…`,
        });
        try {
          const session = await sshGatewayService.start({
            host,
            port,
            username,
            x11: opts?.x11 ?? x11Forward,
          });
          const handle = sessionHandlesRef.current.get(tabId);
          if (handle) handle.gatewaySessionId = session.sessionId;
          url = session.wsUrl;
          setWsUrl(url);
          setSshHost(host);
          setSshPort(String(port));
          setSshUsername(username);
          setConnectMode('auto');
        } catch (err) {
          failTab(err instanceof Error ? err.message : 'Failed to start SSH gateway');
          return;
        }
      }

      if (!url || /^auto:\/\//i.test(url)) {
        failTab('WebSocket URL is required.');
        return;
      }

      updateTab(tabId, {
        status: 'connecting',
        statusMessage: `Connecting to ${nextName || url}…`,
      });

      try {
        localStorage.setItem(WS_STORAGE_KEY, url);
      } catch {
        // ignore
      }

      const hostEl = await waitForTabHost(tabId);
      if (!hostEl) {
        failTab('Terminal surface is not ready.');
        return;
      }

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        theme: {
          background: '#020617',
          foreground: '#e2e8f0',
          cursor: '#38bdf8',
          selectionBackground: '#1e3a5f',
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      hostEl.innerHTML = '';
      term.open(hostEl);
      requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
      });

      const handle = sessionHandlesRef.current.get(tabId);
      if (!handle) {
        try {
          term.dispose();
        } catch {
          // ignore
        }
        failTab('Session was closed.');
        return;
      }
      handle.term = term;
      handle.fit = fit;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url, ['tty']);
      } catch (err) {
        const gw = disposeSessionHandle(tabId);
        void stopGatewayFor(gw);
        failTab(err instanceof Error ? err.message : 'Failed to open WebSocket');
        return;
      }

      ws.binaryType = 'arraybuffer';
      handle.ws = ws;

      ws.onopen = () => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
        const cols = Math.max(term.cols || 80, 2);
        const rows = Math.max(term.rows || 24, 1);
        const hello = JSON.stringify({ AuthToken: '', columns: cols, rows });
        ws.send(encoderRef.current.encode(hello));
        if (activeTabIdRef.current === tabId) term.focus();
        updateTab(tabId, {
          status: 'connected',
          statusMessage: nextName ? `Connected · ${nextName}` : 'Connected — enter SSH password if prompted',
        });
        void markLastUsed(nextConnectionId);
        window.setTimeout(() => {
          try {
            fit.fit();
            sendResize(tabId);
            if (activeTabIdRef.current === tabId) term.focus();
          } catch {
            // ignore
          }
        }, 80);
      };

      ws.onmessage = (ev) => {
        const frame = parseTtydFrame(ev.data as ArrayBuffer | string);
        if (!frame) return;
        const { cmd, payload } = frame;
        if (cmd === CMD.OUTPUT) {
          term.write(payload);
        } else if (cmd === CMD.SET_WINDOW_TITLE) {
          const title = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
          updateTab(tabId, {
            statusMessage: nextName ? `${nextName} · ${title}` : title,
            title: nextName?.trim() || title.split(' ')[0] || 'Session',
          });
        }
      };

      ws.onerror = () => {
        // Natural close (exit / ttyd stop) follows via onclose and removes the tab.
        // Connect-time failures use failTab() which already surfaces settings.
        updateTab(tabId, {
          status: 'error',
          statusMessage: `WebSocket error — cannot reach ${url}. If Easy mode was used, ttyd may have exited; try Connect again.`,
        });
      };

      ws.onclose = () => {
        const intentional = intentionalWsCloseRef.current.delete(tabId);
        if (intentional) {
          const current = sessionHandlesRef.current.get(tabId);
          if (current) {
            current.ws = null;
            const gw = current.gatewaySessionId ?? null;
            current.gatewaySessionId = null;
            void stopGatewayFor(gw);
          }
          return;
        }
        // Shell exited / remote closed — drop the tab; do not open settings.
        if (sessionHandlesRef.current.has(tabId)) {
          void closeTab(tabId);
        }
      };

      term.onData((data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(encoderRef.current.encode(CMD.INPUT + data));
      });

      term.onResize(() => {
        sendResize(tabId);
      });
    },
    [
      connectMode,
      wsUrl,
      sshHost,
      sshPort,
      sshUsername,
      x11Forward,
      useServer,
      activeConnectionId,
      updateTab,
      disposeSessionHandle,
      stopGatewayFor,
      waitForTabHost,
      sendResize,
      markLastUsed,
      closeTab,
    ]
  );

  const connect = useCallback(() => connectTo(), [connectTo]);

  const selectTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.connectionId) setActiveConnectionId(tab.connectionId);
      requestAnimationFrame(() => {
        const handle = sessionHandlesRef.current.get(tabId);
        try {
          handle?.fit?.fit();
          sendResize(tabId);
          handle?.term?.focus();
        } catch {
          // ignore
        }
      });
    },
    [tabs, sendResize]
  );

  useEffect(() => {
    return () => {
      const ids = Array.from(sessionHandlesRef.current.keys());
      for (const id of ids) {
        const handle = sessionHandlesRef.current.get(id);
        const gw = handle?.gatewaySessionId ?? null;
        disposeSessionHandle(id);
        void stopGatewayFor(gw);
      }
      sessionHandlesRef.current.clear();
      tabHostsRef.current.clear();
    };
  }, [disposeSessionHandle, stopGatewayFor]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_OPEN_KEY, panelOpen ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [panelOpen]);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      // ignore
    }
  }, [panelWidth]);

  useEffect(() => {
    return () => {
      panelResizeCleanupRef.current?.();
      panelResizeCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onWinResize = () => {
      try {
        if (tileLayout) {
          fitSessions();
        } else {
          const id = activeTabIdRef.current;
          if (!id) return;
          sessionHandlesRef.current.get(id)?.fit?.fit();
          sendResize(id);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [sendResize, tileLayout, fitSessions]);

  // Refit when panel toggles / settings / tab switch / tile mode changes layout
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (tileLayout) {
          fitSessions();
        } else {
          const id = activeTabId;
          if (!id) return;
          sessionHandlesRef.current.get(id)?.fit?.fit();
          sendResize(id);
          sessionHandlesRef.current.get(id)?.term?.focus();
        }
      } catch {
        // ignore
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [panelOpen, panelWidth, showSettings, activeTabId, isFullscreen, tileLayout, sendResize, fitSessions]);

  const startPanelResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    panelResizeCleanupRef.current?.();
    panelResizeCleanupRef.current = null;
    setIsResizingPanel(true);

    const startX = e.clientX;
    const startWidth = panelWidthRef.current;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + dx));
      panelWidthRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      panelResizeCleanupRef.current?.();
      panelResizeCleanupRef.current = null;
      setIsResizingPanel(false);
      try {
        localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current));
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    panelResizeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
    };
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      if (isEscapeDialogOpen()) return;
      if (document.fullscreenElement) {
        // Let the browser exit fullscreen; don't also close the widget
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  const applyConnection = useCallback(
    (c: SavedSshConnection, autoConnect: boolean) => {
      setActiveConnectionId(c.id);
      setDraftName(c.name);
      setDraftTags(c.tags.join(', '));
      setDraftNotes(c.notes || '');
      setDraftColor(normalizeSshColor(c.color));
      setEditingId(c.id);
      const auto = parseAutoTargetUrl(c.wsUrl);
      if (auto) {
        setConnectMode('auto');
        setSshHost(auto.host);
        setSshPort(String(auto.port));
        setSshUsername(auto.username);
        setWsUrl(c.wsUrl);
      } else {
        setConnectMode('ws');
        setWsUrl(c.wsUrl);
      }
      setShowSettings(!autoConnect);
      setNotice(autoConnect ? `Connecting to “${c.name}”…` : `Loaded “${c.name}”`);
      if (autoConnect) {
        void connectTo({
          wsUrl: c.wsUrl,
          connectionId: c.id,
          connectionName: c.name,
          mode: auto ? 'auto' : 'ws',
          host: auto?.host,
          port: auto?.port,
          username: auto?.username,
        });
      }
    },
    [connectTo]
  );

  // Handle open from ssh:// space links (App → pendingOpen)
  useEffect(() => {
    if (!pendingOpen?.requestId || !pendingOpen.host) return;
    if (!storageReady) return;

    const req = pendingOpen;
    onPendingOpenConsumed?.();

    const port = req.port && req.port > 0 ? req.port : 22;
    const username = (req.username || '').trim();
    const name =
      (req.connectionName || '').trim() ||
      (username ? `${username}@${req.host}${port !== 22 ? `:${port}` : ''}` : req.host);

    setConnectMode('auto');
    setSshHost(req.host);
    setSshPort(String(port));
    if (username) setSshUsername(username);
    setDraftName(name);
    setEditingId(null);

    const match = connections.find((c) => {
      const a = parseAutoTargetUrl(c.wsUrl);
      if (!a) return false;
      if (a.host.toLowerCase() !== req.host.toLowerCase()) return false;
      if (a.port !== port) return false;
      if (username && a.username !== username) return false;
      return true;
    });

    const shouldConnect = req.autoConnect !== false && Boolean(username || match);
    if (match) {
      applyConnection(match, shouldConnect);
      return;
    }

    setActiveConnectionId(null);
    if (shouldConnect && username) {
      setShowSettings(false);
      setNotice(`Connecting to ${name}…`);
      void connectTo({
        mode: 'auto',
        host: req.host,
        port,
        username,
        connectionName: name,
      });
    } else {
      setShowSettings(true);
      setNotice(
        username
          ? `Ready: ${name} — click Connect`
          : `Host ${req.host} loaded — enter username and Connect`
      );
    }
  }, [
    pendingOpen?.requestId,
    storageReady,
    connections,
    applyConnection,
    connectTo,
    onPendingOpenConsumed,
    pendingOpen,
  ]);

  const saveCurrentConnection = async () => {
    let url = '';
    let name = draftName.trim();
    if (connectMode === 'auto') {
      const host = sshHost.trim();
      const username = sshUsername.trim();
      const port = Number.parseInt(sshPort, 10) || 22;
      if (!host || !username) {
        setNotice('Enter host and username before saving.');
        return;
      }
      url = buildAutoTargetUrl(username, host, port);
      if (!name) name = `${username}@${host}:${port}`;
    } else {
      url = normalizeWsUrl(wsUrl);
      if (!url || /^auto:\/\//i.test(url)) {
        setNotice('Enter a WebSocket URL before saving.');
        return;
      }
      if (!name) name = url.replace(/^wss?:\/\//i, '').split('/')[0] || 'SSH host';
    }
    const tags = parseTags(draftTags);
    const notes = draftNotes.trim() || undefined;
    const color = normalizeSshColor(draftColor);

    setSaving(true);
    try {
      if (useServer) {
        if (editingId) {
          const updated = await sshConnectionService.update(editingId, { name, wsUrl: url, tags, notes: notes || '', color });
          setConnections((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
          setActiveConnectionId(editingId);
          setNotice(`Updated “${name}”`);
        } else {
          const created = await sshConnectionService.create({ name, wsUrl: url, tags, notes, color });
          setConnections((prev) => [created, ...prev]);
          setActiveConnectionId(created.id);
          setEditingId(created.id);
          setNotice(`Saved “${name}”`);
        }
      } else if (editingId) {
        updateConnectionsLocal(
          connections.map((c) =>
            c.id === editingId
              ? {
                  ...c,
                  name,
                  wsUrl: url,
                  tags,
                  notes,
                  color,
                }
              : c
          )
        );
        setActiveConnectionId(editingId);
        setNotice(`Updated “${name}”`);
      } else {
        const created: SavedSshConnection = {
          id: newId(),
          name,
          wsUrl: url,
          tags,
          notes,
          color,
          createdAt: Date.now(),
        };
        updateConnectionsLocal([created, ...connections]);
        setActiveConnectionId(created.id);
        setEditingId(created.id);
        setNotice(`Saved “${name}”`);
      }
      setWsUrl(url);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const startNewDraft = () => {
    setEditingId(null);
    setActiveConnectionId(null);
    setDraftName('');
    setDraftTags('');
    setDraftNotes('');
    setDraftColor(SSH_CONNECTION_COLORS[Math.floor(Math.random() * SSH_CONNECTION_COLORS.length)]);
    setShowSettings(true);
    setNotice('New connection — fill URL, name, tags, then Save.');
  };

  const exportConnectionsJson = () => {
    const payload = {
      version: 1,
      type: 'linknest-ssh-connections',
      exportedAt: new Date().toISOString(),
      connections: connections.map(({ id, name, wsUrl: u, tags, notes, color, createdAt, lastUsedAt }) => ({
        id,
        name,
        wsUrl: u,
        tags,
        notes,
        color: normalizeSshColor(color),
        createdAt,
        lastUsedAt,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-ssh-connections-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${connections.length} connection${connections.length === 1 ? '' : 's'}`);
  };

  const importConnectionsJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.connections)
          ? parsed.connections
          : null;
      if (!list) {
        setNotice('Invalid JSON: expected { connections: [...] } or an array.');
        return;
      }

      const incoming: SavedSshConnection[] = [];
      for (const item of list) {
        if (!item || typeof item.wsUrl !== 'string') continue;
        const url = normalizeWsUrl(String(item.wsUrl));
        if (!url) continue;
        incoming.push({
          id: typeof item.id === 'string' && item.id ? item.id : newId(),
          name:
            typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : url.replace(/^wss?:\/\//i, '').split('/')[0] || 'SSH host',
          wsUrl: url,
          tags: Array.isArray(item.tags) ? parseTags(item.tags.join(',')) : parseTags(String(item.tags || '')),
          notes: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : undefined,
          color: normalizeSshColor(item.color),
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          lastUsedAt: typeof item.lastUsedAt === 'number' ? item.lastUsedAt : undefined,
        });
      }

      if (incoming.length === 0) {
        setNotice('No valid connections found in that file.');
        return;
      }

      if (useServer) {
        const merged = await sshConnectionService.bulkUpsert(incoming);
        setConnections(merged);
        setNotice(`Imported / merged ${incoming.length} connection(s)`);
        return;
      }

      const byKey = new Map<string, SavedSshConnection>();
      connections.forEach((c) => byKey.set(`${c.name}||${c.wsUrl}`, c));
      let added = 0;
      let updated = 0;
      for (const item of incoming) {
        const key = `${item.name}||${item.wsUrl}`;
        const existing = byKey.get(key) || byKey.get(`||${item.wsUrl}`);
        // Prefer exact name+url; also merge duplicates by wsUrl alone
        const urlOnly = Array.from(byKey.values()).find((c) => c.wsUrl === item.wsUrl);
        if (urlOnly) {
          byKey.delete(`${urlOnly.name}||${urlOnly.wsUrl}`);
          byKey.set(key, {
            ...urlOnly,
            name: item.name,
            tags: item.tags,
            notes: item.notes,
            color: normalizeSshColor(item.color || urlOnly.color),
            lastUsedAt: item.lastUsedAt || urlOnly.lastUsedAt,
          });
          updated += 1;
        } else if (existing) {
          byKey.set(key, {
            ...existing,
            tags: item.tags,
            notes: item.notes,
            color: normalizeSshColor(item.color || existing.color),
            lastUsedAt: item.lastUsedAt || existing.lastUsedAt,
          });
          updated += 1;
        } else {
          byKey.set(key, { ...item, id: newId(), color: normalizeSshColor(item.color) });
          added += 1;
        }
      }
      updateConnectionsLocal(Array.from(byKey.values()));
      setNotice(`Imported ${added} new, updated ${updated}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to import JSON');
    }
  };

  const liveTabsForConnection = useCallback(
    (connectionId: string) =>
      tabs.filter(
        (t) =>
          t.connectionId === connectionId &&
          (t.status === 'connected' || t.status === 'connecting')
      ),
    [tabs]
  );

  const tabsForConnection = useCallback(
    (connectionId: string) => tabs.filter((t) => t.connectionId === connectionId),
    [tabs]
  );

  const disconnectConnectionSessions = useCallback(
    async (connectionId: string) => {
      const ids = tabs
        .filter((t) => t.connectionId === connectionId)
        .map((t) => t.id);
      for (const tabId of ids) {
        await closeTab(tabId);
      }
      if (ids.length) {
        setNotice(
          ids.length === 1
            ? 'Disconnected session for this host'
            : `Disconnected ${ids.length} sessions for this host`
        );
      }
    },
    [tabs, closeTab]
  );

  const deleteConnection = async (id: string) => {
    const target = connections.find((c) => c.id === id);
    if (!target) return;

    const live = liveTabsForConnection(id);
    const related = tabsForConnection(id);
    if (live.length > 0) {
      const ok = window.confirm(
        `“${target.name}” has ${live.length} live terminal session${live.length === 1 ? '' : 's'}.\n\nDisconnect and delete this saved connection?`
      );
      if (!ok) return;
      await disconnectConnectionSessions(id);
    } else if (related.length > 0) {
      const ok = window.confirm(
        `“${target.name}” has ${related.length} open tab${related.length === 1 ? '' : 's'} (not connected).\n\nClose those tabs and delete this saved connection?`
      );
      if (!ok) return;
      await disconnectConnectionSessions(id);
    } else if (!window.confirm(`Delete saved connection “${target.name}”?`)) {
      return;
    }

    try {
      if (useServer) {
        await sshConnectionService.remove(id);
      }
      const next = connections.filter((c) => c.id !== id);
      if (useServer) {
        setConnections(next);
      } else {
        updateConnectionsLocal(next);
      }
      if (editingId === id) {
        setEditingId(null);
        setDraftName('');
        setDraftTags('');
        setDraftNotes('');
        setDraftColor(SSH_CONNECTION_COLORS[0]);
      }
      if (activeConnectionId === id) setActiveConnectionId(null);
      setNotice(`Deleted “${target.name}”`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to delete connection');
    }
  };

  const statusColor =
    status === 'connected'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'connecting'
        ? 'text-amber-600 dark:text-amber-400'
        : status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-500 dark:text-slate-400';

  return (
    <div
      ref={widgetRootRef}
      className={`w-full h-full flex flex-col bg-white dark:bg-slate-800 overflow-hidden ${
        isFullscreen
          ? 'rounded-none border-0 shadow-none'
          : 'rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0 bg-slate-50 dark:bg-slate-900/40">
        <div className="min-w-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 shrink-0"
            title={panelOpen ? 'Hide saved connections' : 'Show saved connections'}
            aria-label="Toggle connections panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              {panelOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 4.5l-7.5 7.5 7.5 7.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5l7.5 7.5-7.5 7.5" />
              )}
            </svg>
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">SSH Terminal</h3>
            <p className={`text-[11px] truncate ${statusColor}`}>{statusMessage}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setTileLayout((v) => !v)}
            disabled={tabs.length === 0}
            className={`p-1.5 rounded-md border transition-colors disabled:opacity-40 ${
              tileLayout
                ? 'border-sky-500 bg-sky-600 text-white hover:bg-sky-500'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={tileLayout ? 'Single tab view' : 'Tile terminals side by side'}
            aria-label={tileLayout ? 'Exit tiled view' : 'Tile terminals'}
            aria-pressed={tileLayout}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className={`p-1.5 rounded-md border transition-colors ${
              isFullscreen
                ? 'border-orange-400 bg-orange-500 text-white hover:bg-orange-600'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (panel + tabs + terminal)'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
          {!isFullscreen && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              title="Close"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {panelOpen && (
          <aside
            className={`relative shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col min-h-0 ${
              isResizingPanel ? 'select-none' : ''
            }`}
            style={{ width: panelWidth }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize saved connections panel"
              title="Drag to resize"
              onPointerDown={startPanelResize}
              className={`absolute top-0 right-0 z-20 h-full w-1.5 -mr-0.5 cursor-col-resize group ${
                isResizingPanel ? 'bg-brand-500/50' : 'bg-transparent hover:bg-brand-400/40'
              }`}
            >
              <span className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-1 h-8 rounded-full bg-slate-300 dark:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            <div className="p-2 border-b border-slate-200 dark:border-slate-700 space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Saved{useServer ? ' · cloud' : ' · local'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={startNewDraft}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                  title="New connection draft"
                  aria-label="New connection draft"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={exportConnectionsJson}
                  disabled={connections.length === 0}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
                  title="Export connections as JSON"
                  aria-label="Export connections as JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                  title="Import connections from JSON"
                  aria-label="Import connections from JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void importConnectionsJson(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={tabs.length >= MAX_SSH_TABS}
                  className="px-2 py-1 text-[10px] font-semibold rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
                  title={tabs.length >= MAX_SSH_TABS ? `Maximum ${MAX_SSH_TABS} sessions` : 'Open a new session tab'}
                >
                  {status === 'connected' || status === 'connecting' ? 'New tab' : 'Connect'}
                </button>
              </div>
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter name, URL, tag…"
                className="w-full h-7 px-2 text-[11px] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setFilterTag(null)}
                    className={`px-1.5 py-0.5 text-[10px] rounded-full border ${
                      !filterTag
                        ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500'
                    }`}
                  >
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setFilterTag((t) => (t === tag ? null : tag))}
                      className={`px-1.5 py-0.5 text-[10px] rounded-full border ${
                        filterTag === tag
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-brand-400'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1">
              {!storageReady ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center">Loading…</p>
              ) : filteredConnections.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center leading-relaxed">
                  No saved connections yet. Open Settings on a host after creating one with <strong>+</strong>, then click <strong>Save</strong> in the form.
                </p>
              ) : (
                filteredConnections.map((c) => {
                  const active = activeConnectionId === c.id;
                  const liveTabs = liveTabsForConnection(c.id);
                  const isLive = liveTabs.length > 0;
                  const color = normalizeSshColor(c.color);
                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg border overflow-hidden transition-colors ${
                        active
                          ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <div className="flex min-w-0">
                        <div className="w-1.5 shrink-0 self-stretch" style={{ backgroundColor: color }} title={color} />
                        <div className="flex-1 min-w-0 p-2">
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => applyConnection(c, false)}
                            title={`Edit ${c.name}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                              {isLive && (
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  live{liveTabs.length > 1 ? ` · ${liveTabs.length}` : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                              {(() => {
                                const a = parseAutoTargetUrl(c.wsUrl);
                                return a ? `${a.username}@${a.host}:${a.port}` : c.wsUrl;
                              })()}
                            </p>
                            {c.tags.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-1">
                                {c.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="px-1 py-0 text-[9px] rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>

                          <div className="flex items-center gap-1 mt-2">
                            <button
                              type="button"
                              onClick={() => applyConnection(c, true)}
                              disabled={tabs.length >= MAX_SSH_TABS}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
                              title={
                                tabs.length >= MAX_SSH_TABS
                                  ? `Maximum ${MAX_SSH_TABS} sessions`
                                  : `Connect to ${c.name}`
                              }
                              aria-label={`Connect to ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void disconnectConnectionSessions(c.id)}
                              disabled={!isLive && tabsForConnection(c.id).length === 0}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed"
                              title={
                                isLive
                                  ? `Disconnect live session${liveTabs.length === 1 ? '' : 's'} for ${c.name}`
                                  : `No open session for ${c.name}`
                              }
                              aria-label={`Disconnect ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6M15 9l-6 6" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => applyConnection(c, false)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                              title={`Edit ${c.name}`}
                              aria-label={`Edit ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteConnection(c.id)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title={`Delete ${c.name}`}
                              aria-label={`Delete ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => applyConnection(c, false)}
                              className={`ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors ${
                                showSettings && activeConnectionId === c.id
                                  ? 'bg-orange-500 border-orange-600 text-white shadow-sm shadow-orange-500/30'
                                  : 'border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40'
                              }`}
                              title={`Settings for ${c.name}`}
                              aria-label={`Settings for ${c.name}`}
                              aria-pressed={showSettings && activeConnectionId === c.id}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {showSettings && (
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 space-y-2 shrink-0 bg-white dark:bg-slate-800 overflow-y-auto max-h-[50%]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setConnectMode('auto')}
                    className={`px-2 py-1 text-[11px] rounded-md border ${
                      connectMode === 'auto'
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Easy (host / port)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectMode('ws')}
                    className={`px-2 py-1 text-[11px] rounded-md border ${
                      connectMode === 'ws'
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Advanced (WebSocket URL)
                  </button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void saveCurrentConnection()}
                    disabled={saving}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50"
                    title={editingId ? 'Update saved connection' : 'Save connection'}
                  >
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-red-600 hover:bg-red-700 text-white"
                    title="Close settings"
                    aria-label="Close settings"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Name
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Prod bastion"
                    className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Tags (comma-separated)
                  <input
                    type="text"
                    value={draftTags}
                    onChange={(e) => setDraftTags(e.target.value)}
                    placeholder="prod, bastion, linux"
                    className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div>
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Color</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {SSH_CONNECTION_COLORS.map((hex) => {
                    const selected = normalizeSshColor(draftColor) === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setDraftColor(hex)}
                        className={`h-6 w-6 rounded-full border-2 transition-transform ${
                          selected
                            ? 'border-slate-900 dark:border-white scale-110 ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-800'
                            : 'border-white dark:border-slate-700 shadow-sm hover:scale-105'
                        }`}
                        style={{ backgroundColor: hex }}
                        title={hex}
                        aria-label={`Color ${hex}`}
                        aria-pressed={selected}
                      />
                    );
                  })}
                </div>
              </div>

              {connectMode === 'auto' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
                      Host
                      <input
                        type="text"
                        value={sshHost}
                        onChange={(e) => setSshHost(e.target.value)}
                        placeholder="pam.example.com"
                        className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      Port
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={sshPort}
                        onChange={(e) => setSshPort(e.target.value)}
                        placeholder="22"
                        className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                      />
                    </label>
                  </div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Username
                    <input
                      type="text"
                      value={sshUsername}
                      onChange={(e) => setSshUsername(e.target.value)}
                      placeholder="user or domain\user+target…"
                      title="Supports PAM / privileged-access usernames (\, +, custom ports)."
                      className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                    PAM-friendly: long usernames with `\`, `+`, and non-22 ports (e.g. 4489) are passed verbatim to SSH.
                  </p>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-2 space-y-2 bg-slate-50 dark:bg-slate-900/40">
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Session type (via ttyd)</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setX11Forward(false)}
                        className={`px-2 py-1 text-[11px] rounded-md border ${
                          !x11Forward
                            ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                            : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Terminal only
                      </button>
                      <button
                        type="button"
                        onClick={() => setX11Forward(true)}
                        className={`px-2 py-1 text-[11px] rounded-md border ${
                          x11Forward
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Terminal + GUI (X11)
                      </button>
                    </div>
                    {x11Forward && (
                      <div className="text-[10px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                        <p className="font-medium text-slate-700 dark:text-slate-200">GUI setup (LinkNest starts ttyd with <code className="font-mono">ssh -Y</code>):</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-0.5">
                          <li>
                            Install{' '}
                            <a
                              href="https://sourceforge.net/projects/vcxsrv/"
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-600 dark:text-brand-400 underline"
                            >
                              VcXsrv
                            </a>{' '}
                            (or X410) on this Windows PC
                          </li>
                          <li>
                            Start XLaunch → Multiple windows → Start no client → enable{' '}
                            <strong>Disable access control</strong> → finish (allow firewall if prompted)
                          </li>
                          <li>
                            Docker: keep DISPLAY as <code className="font-mono">host.docker.internal:0.0</code> (Admin →
                            Add-ons → SSH Gateway). Local XAMPP uses <code className="font-mono">127.0.0.1:0.0</code>.
                          </li>
                          <li>On the Linux host: <code className="font-mono">X11Forwarding yes</code> in sshd, then restart sshd</li>
                          <li>Connect here, then run e.g. <code className="font-mono">xclock</code> — the window opens on your Windows desktop</li>
                        </ol>
                        <p
                          className={
                            guiDisplayReady
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {guiDisplayReady === true
                            ? 'X server detected on this PC — GUI forwarding is ready.'
                            : guiDisplayReady === false
                              ? guiHint || 'X server not detected yet — start VcXsrv, then Connect.'
                              : 'Checking X server…'}
                        </p>
                      </div>
                    )}
                  </div>
                  {!useServer && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      Sign in to use Easy mode (server starts ttyd). Guests can use Advanced WebSocket URL mode.
                    </p>
                  )}
                  {useServer && gatewayAvailable === false && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      ttyd was not found on this server. Install with{' '}
                      <code className="font-mono">winget install tsl0922.ttyd --source winget</code> then refresh.
                    </p>
                  )}
                </>
              ) : (
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  WebSocket URL (manual ttyd)
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="ws://localhost:7681/ws"
                    className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
              )}

              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Notes (optional)
                <input
                  type="text"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Jump host via VPN"
                  className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </label>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                Use <strong>Update</strong> / <strong>Save</strong> on the settings form to keep this connection. Easy mode starts ttyd on this
                LinkNest server. <strong>Terminal + GUI</strong> forwards X11 apps to Windows (VcXsrv). Passwords are
                never saved. {useServer ? 'Saved connections sync to your account.' : 'Guest saves stay in this browser.'}
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-0 bg-slate-950 overflow-hidden flex flex-col">
            {tabs.length > 0 && (
              <div className="shrink-0 flex items-center gap-0.5 px-1 py-1 border-b border-slate-800 bg-slate-900 overflow-x-auto">
                {tabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  const connColor = normalizeSshColor(
                    (tab.connectionId
                      ? connections.find((c) => c.id === tab.connectionId)?.color
                      : undefined) || draftColor
                  );
                  return (
                    <div
                      key={tab.id}
                      className={`group flex items-center gap-1 max-w-[11rem] shrink-0 rounded-md border overflow-hidden ${
                        active
                          ? 'bg-slate-800 text-slate-100'
                          : 'bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      }`}
                      style={{
                        borderColor: active ? connColor : `${connColor}66`,
                        boxShadow: active ? `inset 3px 0 0 ${connColor}` : undefined,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectTab(tab.id)}
                        className="flex items-center gap-1.5 min-w-0 text-left pl-1.5 py-0.5"
                        title={tab.statusMessage || tab.title}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/25 ${
                            tab.status === 'connecting' ? 'animate-pulse' : ''
                          }`}
                          style={{
                            backgroundColor: connColor,
                            outline:
                              tab.status === 'connected'
                                ? '1px solid rgba(52, 211, 153, 0.9)'
                                : tab.status === 'error'
                                  ? '1px solid rgba(248, 113, 113, 0.9)'
                                  : undefined,
                            outlineOffset: 1,
                          }}
                          aria-hidden
                        />
                        <span className="text-[11px] truncate font-medium">{tab.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void closeTab(tab.id);
                        }}
                        className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-slate-700 text-slate-300 mr-0.5"
                        title="Close tab"
                        aria-label={`Close ${tab.title}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
                <span className="ml-auto px-1.5 text-[10px] text-slate-500 shrink-0">
                  {tabs.length}/{MAX_SSH_TABS}
                </span>
              </div>
            )}

            <div
              className={
                tileLayout
                  ? 'relative flex-1 min-h-0 grid gap-1 p-1 overflow-hidden'
                  : 'relative flex-1 min-h-0 overflow-hidden'
              }
              style={
                tileLayout
                  ? {
                      gridTemplateColumns: `repeat(${tileCols}, minmax(0, 1fr))`,
                      gridAutoRows: 'minmax(0, 1fr)',
                    }
                  : undefined
              }
            >
              {tabs.map((tab) => {
                const connColor = normalizeSshColor(
                  (tab.connectionId
                    ? connections.find((c) => c.id === tab.connectionId)?.color
                    : undefined) || draftColor
                );
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={
                      tileLayout
                        ? `min-h-0 min-w-0 flex flex-col rounded-md border overflow-hidden bg-slate-950 ${
                            isActive ? 'ring-1 ring-sky-400/60' : ''
                          }`
                        : `absolute inset-0 flex flex-col overflow-hidden ${
                            isActive ? 'z-10 visible' : 'z-0 invisible pointer-events-none'
                          }`
                    }
                    style={tileLayout ? { borderColor: `${connColor}99` } : undefined}
                    aria-hidden={!tileLayout && !isActive}
                    onMouseDown={() => {
                      if (tileLayout) setActiveTabId(tab.id);
                    }}
                  >
                    {tileLayout && (
                      <div
                        className="shrink-0 flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 border-b border-slate-800"
                        style={{ boxShadow: `inset 3px 0 0 ${connColor}` }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: connColor }}
                          aria-hidden
                        />
                        <span className="truncate flex-1">{tab.title}</span>
                        <span className="text-slate-500 shrink-0">{tab.status}</span>
                      </div>
                    )}
                    <div
                      ref={(el) => {
                        if (el) tabHostsRef.current.set(tab.id, el);
                        else tabHostsRef.current.delete(tab.id);
                      }}
                      className="relative flex-1 min-h-0 p-1 overflow-hidden [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm-viewport]:overflow-auto"
                    />
                  </div>
                );
              })}
              {tabs.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center px-4">
                    <div className="mx-auto mb-2 w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-400">
                      {connections.length
                        ? 'Click a saved connection to open a session tab (up to 8)'
                        : 'Connect or pick a saved host — each session opens in its own tab'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {tabs.length > 0 && (
              <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-2 py-1.5 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-400 shrink-0">
                  All
                </span>
                <input
                  type="text"
                  value={broadcastCmd}
                  onChange={(e) => setBroadcastCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const cmd = broadcastCmd;
                      setBroadcastCmd('');
                      broadcastToAll(cmd);
                    }
                  }}
                  placeholder="Command to all connected terminals… (Enter to send)"
                  className="flex-1 min-w-0 h-7 px-2 text-xs rounded-md border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 font-mono"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => {
                    const cmd = broadcastCmd;
                    setBroadcastCmd('');
                    broadcastToAll(cmd);
                  }}
                  disabled={!broadcastCmd.trim()}
                  className="px-2.5 h-7 text-[11px] font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 shrink-0"
                  title="Send to all connected terminals"
                >
                  Send all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SshTerminalWidget;
