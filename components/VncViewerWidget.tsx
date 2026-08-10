import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';
import { useAuth } from '../contexts/AuthContext';
import {
  VNC_CONNECTION_COLORS,
  normalizeVncColor,
  vncConnectionService,
  type SavedVncConnection,
} from '../services/vncConnectionService';
import {
  buildAutoVncTargetUrl,
  parseAutoVncTargetUrl,
  vncGatewayService,
} from '../services/vncGatewayService';
import { ZoomSafeHost } from './XtermZoomSafeHost';

interface VncViewerWidgetProps {
  onClose?: () => void;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
type ConnectMode = 'auto' | 'ws';

interface VncSessionTab {
  id: string;
  title: string;
  connectionId?: string;
  wsUrl: string;
  status: ConnState;
  statusMessage: string;
  color: string;
  viewOnly: boolean;
  scaleViewport: boolean;
}

type RfbInstance = InstanceType<typeof import('@novnc/novnc').default>;

interface SessionHandle {
  rfb: RfbInstance | null;
  gatewaySessionId: string | null;
}

const WS_STORAGE_KEY = 'linknest.vncViewer.wsUrl.v1';
const MODE_STORAGE_KEY = 'linknest.vncViewer.connectMode.v1';
const HOST_STORAGE_KEY = 'linknest.vncViewer.host.v1';
const PORT_STORAGE_KEY = 'linknest.vncViewer.port.v1';
const CONNECTIONS_STORAGE_KEY = 'linknest.vncViewer.savedConnections.v1';
const PANEL_OPEN_KEY = 'linknest.vncViewer.panelOpen.v1';
const PANEL_WIDTH_KEY = 'linknest.vncViewer.panelWidth.v1';

const PANEL_MIN_WIDTH = 160;
const PANEL_MAX_WIDTH = 420;
const PANEL_DEFAULT_WIDTH = 210;
const DEFAULT_MAX_VNC_TABS = 8;
const IDLE_NOTICE =
  'Easy mode: enter VNC host and port — LinkNest starts websockify for you. Or use Advanced WebSocket URL.';

function loadPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return PANEL_DEFAULT_WIDTH;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return PANEL_DEFAULT_WIDTH;
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, n));
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
}

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^auto-vnc:\/\//i.test(trimmed)) return trimmed;
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

function loadLocalConnections(): SavedVncConnection[] {
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
        notes: c.notes != null && String(c.notes) ? String(c.notes) : undefined,
        color: normalizeVncColor(c.color),
        viewOnly: Boolean(c.viewOnly),
        scaleViewport: c.scaleViewport !== false,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
        lastUsedAt: typeof c.lastUsedAt === 'number' ? c.lastUsedAt : undefined,
      }));
  } catch {
    return [];
  }
}

function persistLocalConnections(list: SavedVncConnection[]) {
  try {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function newLocalId(): string {
  return `vnc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function newTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function tileGridStyle(count: number): React.CSSProperties {
  if (count <= 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (count === 2) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' };
  if (count === 3) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
  if (count === 4) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
  const cols = count <= 6 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}

export const VncViewerWidget: React.FC<VncViewerWidgetProps> = ({ onClose }) => {
  const { isAuthenticated } = useAuth();
  const useServer = Boolean(isAuthenticated);

  const widgetRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionHandlesRef = useRef<Map<string, SessionHandle>>(new Map());
  const tabHostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeTabIdRef = useRef<string | null>(null);
  const tabsRef = useRef<VncSessionTab[]>([]);
  const closingAllRef = useRef(false);
  const intentionalDisconnectRef = useRef<Set<string>>(new Set());

  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(WS_STORAGE_KEY) || 'ws://localhost:6080/websockify');
  const [connectMode, setConnectMode] = useState<ConnectMode>(() => {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    return raw === 'ws' ? 'ws' : 'auto';
  });
  const [vncHost, setVncHost] = useState(() => localStorage.getItem(HOST_STORAGE_KEY) || '');
  const [vncPort, setVncPort] = useState(() => localStorage.getItem(PORT_STORAGE_KEY) || '5900');
  const [password, setPassword] = useState('');
  const passwordRef = useRef('');
  const [pendingCredentialsTabId, setPendingCredentialsTabId] = useState<string | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [scaleViewport, setScaleViewport] = useState(true);
  const [notice, setNotice] = useState(IDLE_NOTICE);
  const [showSettings, setShowSettings] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem(PANEL_OPEN_KEY) !== 'false');
  const [panelWidth, setPanelWidth] = useState<number>(() => loadPanelWidth());
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);

  const [storageReady, setStorageReady] = useState(!isAuthenticated);
  const [connections, setConnections] = useState<SavedVncConnection[]>(() =>
    isAuthenticated ? [] : loadLocalConnections()
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftColor, setDraftColor] = useState<string>(VNC_CONNECTION_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [tabs, setTabs] = useState<VncSessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tileLayout, setTileLayout] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [maxVncTabs, setMaxVncTabs] = useState(DEFAULT_MAX_VNC_TABS);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);
  const status: ConnState = activeTab?.status ?? 'idle';
  const statusMessage = activeTab?.statusMessage ?? notice;

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    passwordRef.current = password;
  }, [password]);

  useEffect(() => {
    if (tabs.length === 0) {
      setNotice(IDLE_NOTICE);
      setActiveTabId(null);
    }
  }, [tabs.length]);

  const updateTab = useCallback((tabId: string, patch: Partial<VncSessionTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

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
          c.tags.some((t) => t.includes(q)) ||
          (c.notes || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));
  }, [connections, filterQuery, filterTag]);

  const liveConnectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tabs) {
      if (t.connectionId && (t.status === 'connected' || t.status === 'connecting')) {
        ids.add(t.connectionId);
      }
    }
    return ids;
  }, [tabs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!useServer) {
        setConnections(loadLocalConnections());
        setStorageReady(true);
        setMaxVncTabs(DEFAULT_MAX_VNC_TABS);
        return;
      }
      setStorageReady(false);
      try {
        const [list, st] = await Promise.all([
          vncConnectionService.list(),
          vncGatewayService.status().catch(() => null),
        ]);
        if (!cancelled) {
          setConnections(list);
          if (st && typeof st.maxConnections === 'number' && st.maxConnections >= 1) {
            setMaxVncTabs(Math.floor(st.maxConnections));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setNotice(err instanceof Error ? err.message : 'Failed to load saved connections');
        }
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useServer]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, connectMode);
      localStorage.setItem(HOST_STORAGE_KEY, vncHost);
      localStorage.setItem(PORT_STORAGE_KEY, vncPort);
    } catch {
      // ignore
    }
  }, [connectMode, vncHost, vncPort]);

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
    const onFs = () => {
      const el = widgetRootRef.current;
      setIsFullscreen(Boolean(el && document.fullscreenElement === el));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

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
          await vncConnectionService.update(connectionId, { lastUsedAt: now });
        } catch {
          // non-fatal
        }
      }
    },
    [useServer]
  );

  const stopGatewayFor = useCallback(async (sessionId: string | null | undefined) => {
    if (!sessionId) return;
    try {
      await vncGatewayService.stop(sessionId);
    } catch {
      // non-fatal
    }
  }, []);

  const disposeSessionHandle = useCallback((tabId: string, opts?: { keepHost?: boolean }) => {
    intentionalDisconnectRef.current.add(tabId);
    const handle = sessionHandlesRef.current.get(tabId);
    if (!handle) return null;
    if (handle.rfb) {
      try {
        handle.rfb.disconnect();
      } catch {
        // ignore
      }
      handle.rfb = null;
    }
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
      setPendingCredentialsTabId((prev) => (prev === tabId ? null : prev));

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

  const closeAllTabs = useCallback(async () => {
    closingAllRef.current = true;
    const ids = Array.from(sessionHandlesRef.current.keys());
    for (const id of ids) {
      const handle = sessionHandlesRef.current.get(id);
      const gw = handle?.gatewaySessionId ?? null;
      disposeSessionHandle(id);
      sessionHandlesRef.current.delete(id);
      tabHostsRef.current.delete(id);
      void stopGatewayFor(gw);
    }
    setTabs([]);
    setActiveTabId(null);
    setPendingCredentialsTabId(null);
    setNotice(IDLE_NOTICE);
    closingAllRef.current = false;
  }, [disposeSessionHandle, stopGatewayFor]);

  const requestClose = useCallback(async () => {
    const live = tabsRef.current.filter((t) => t.status === 'connected' || t.status === 'connecting');
    if (live.length > 0) {
      if (!window.confirm('Kill all VNC sessions and close?')) return;
      await closeAllTabs();
    }
    onClose?.();
  }, [closeAllTabs, onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      if (isEscapeDialogOpen()) return;
      if (document.fullscreenElement) return;
      e.preventDefault();
      e.stopPropagation();
      void requestClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [requestClose]);

  useEffect(() => {
    return () => {
      closingAllRef.current = true;
      for (const id of Array.from(sessionHandlesRef.current.keys())) {
        const handle = sessionHandlesRef.current.get(id);
        const gw = handle?.gatewaySessionId ?? null;
        disposeSessionHandle(id);
        if (gw) {
          void vncGatewayService.stop(gw).catch(() => undefined);
        }
      }
      sessionHandlesRef.current.clear();
      tabHostsRef.current.clear();
    };
  }, [disposeSessionHandle]);

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

  const connectTo = useCallback(
    async (opts?: {
      wsUrl?: string;
      password?: string;
      viewOnly?: boolean;
      scaleViewport?: boolean;
      connectionId?: string | null;
      connectionName?: string;
      color?: string;
      mode?: ConnectMode;
      host?: string;
      port?: number;
    }) => {
      if (sessionHandlesRef.current.size >= maxVncTabs) {
        setNotice(`Maximum of ${maxVncTabs} open sessions. Close a tab first.`);
        return;
      }

      const rawStored = (opts?.wsUrl ?? wsUrl).trim();
      const parsedAuto = parseAutoVncTargetUrl(rawStored);
      const mode: ConnectMode =
        opts?.mode ||
        (parsedAuto ? 'auto' : undefined) ||
        (connectMode === 'auto' && (opts?.host || vncHost.trim()) ? 'auto' : connectMode);

      let gatewayHost = (opts?.host || vncHost).trim();
        let gatewayPort = opts?.port ?? (Number.parseInt(vncPort, 10) || 5900);
      if (parsedAuto) {
        gatewayHost = parsedAuto.host;
        gatewayPort = parsedAuto.port;
      }

      const wantAuto = mode === 'auto' || Boolean(parsedAuto) || (Boolean(gatewayHost) && mode !== 'ws');
      let url = '';
      let gatewaySessionId: string | null = null;

      if (wantAuto) {
        if (!useServer) {
          setNotice('Easy mode requires sign-in so LinkNest can start websockify on this server.');
          setShowSettings(true);
          return;
        }
        if (!gatewayHost) {
          setNotice('Enter VNC host (and port) for Easy mode.');
          setShowSettings(true);
          return;
        }
        if (!Number.isFinite(gatewayPort) || gatewayPort < 1 || gatewayPort > 65535) {
          setNotice('VNC port must be 1–65535.');
          setShowSettings(true);
          return;
        }

        setNotice(`Starting websockify → ${gatewayHost}:${gatewayPort}…`);
        try {
          let session;
          try {
            session = await vncGatewayService.start({ host: gatewayHost, port: gatewayPort });
          } catch (err: any) {
            if (err?.code === 'gateway_limit' && sessionHandlesRef.current.size <= 1) {
              const cleared = await vncGatewayService.stopAll();
              session = await vncGatewayService.start({ host: gatewayHost, port: gatewayPort });
              if (cleared.stopped > 0) {
                setNotice(`Cleared ${cleared.stopped} leftover gateway(s), then connected`);
              }
            } else {
              throw err;
            }
          }
          url = session.wsUrl;
          gatewaySessionId = session.sessionId;
        } catch (err) {
          setNotice(err instanceof Error ? err.message : 'Failed to start VNC gateway');
          setShowSettings(true);
          return;
        }
      } else {
        url = normalizeWsUrl(rawStored);
        if (!url || /^auto-vnc:/i.test(url)) {
          setNotice('WebSocket URL is required for Advanced mode.');
          setShowSettings(true);
          return;
        }
      }

      const nextViewOnly = opts?.viewOnly ?? viewOnly;
      const nextScale = opts?.scaleViewport ?? scaleViewport;
      const nextPassword = opts?.password ?? password;
      const nextConnectionId = opts?.connectionId !== undefined ? opts.connectionId : activeConnectionId;
      const nextName =
        opts?.connectionName ||
        draftName.trim() ||
        (wantAuto ? `${gatewayHost}:${gatewayPort}` : url.replace(/^wss?:\/\//i, '').split('/')[0]) ||
        'VNC';
      const nextColor = normalizeVncColor(
        opts?.color ||
          (nextConnectionId ? connections.find((c) => c.id === nextConnectionId)?.color : undefined) ||
          draftColor
      );

      const tabId = newTabId();
      const tab: VncSessionTab = {
        id: tabId,
        title: nextName,
        connectionId: nextConnectionId || undefined,
        wsUrl: wantAuto ? buildAutoVncTargetUrl(gatewayHost, gatewayPort) : url,
        status: 'connecting',
        statusMessage: `Connecting to ${nextName}…`,
        color: nextColor,
        viewOnly: nextViewOnly,
        scaleViewport: nextScale,
      };

      sessionHandlesRef.current.set(tabId, { rfb: null, gatewaySessionId });
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tabId);
      // Keep settings open until authenticated so the password field stays visible.
      if (!nextPassword) {
        setShowSettings(true);
      } else {
        setShowSettings(false);
      }
      setNotice(`Connecting to “${nextName}”…`);

      try {
        if (!wantAuto) localStorage.setItem(WS_STORAGE_KEY, url);
      } catch {
        // ignore
      }

      await new Promise((r) => requestAnimationFrame(() => r(undefined)));

      const target = tabHostsRef.current.get(tabId);
      if (!target) {
        updateTab(tabId, {
          status: 'error',
          statusMessage: 'Viewer surface is not ready.',
        });
        setShowSettings(true);
        setNotice('Viewer surface is not ready.');
        void stopGatewayFor(gatewaySessionId);
        return;
      }

      try {
        const RFB = (await import('@novnc/novnc')).default;
        target.innerHTML = '';

        const rfb = new RFB(target, url, {
          credentials: nextPassword ? { password: nextPassword } : undefined,
          shared: true,
        });
        rfb.scaleViewport = nextScale;
        rfb.resizeSession = false;
        rfb.clipViewport = true;
        rfb.viewOnly = nextViewOnly;

        rfb.addEventListener('connect', () => {
          setPendingCredentialsTabId((prev) => (prev === tabId ? null : prev));
          updateTab(tabId, {
            status: 'connected',
            statusMessage: `Connected · ${nextName}`,
          });
          setShowSettings(false);
          void markLastUsed(nextConnectionId);
        });

        rfb.addEventListener('disconnect', (e: CustomEvent) => {
          if (closingAllRef.current) return;
          const intentional = intentionalDisconnectRef.current.has(tabId);
          intentionalDisconnectRef.current.delete(tabId);
          const handle = sessionHandlesRef.current.get(tabId);
          if (handle) handle.rfb = null;
          if (intentional) return;
          const clean = Boolean((e as any)?.detail?.clean);
          if (clean) {
            void closeTab(tabId);
            return;
          }
          updateTab(tabId, {
            status: 'error',
            statusMessage: 'Connection lost or failed',
          });
          setShowSettings(true);
          setNotice('Connection lost or failed');
        });

        rfb.addEventListener('credentialsrequired', () => {
          // Prefer live field value (user may type after Connect) over the connect-time snapshot.
          const livePassword = passwordRef.current || nextPassword;
          if (livePassword) {
            try {
              rfb.sendCredentials({ password: livePassword });
              updateTab(tabId, {
                status: 'connecting',
                statusMessage: `Authenticating · ${nextName}…`,
              });
              setNotice(`Authenticating “${nextName}”…`);
              return;
            } catch (err) {
              console.error('sendCredentials failed', err);
            }
          }

          updateTab(tabId, {
            status: 'error',
            statusMessage: 'VNC server requires a password. Enter it below, then click Send password.',
          });
          setShowSettings(true);
          setNotice('VNC server requires a password. Enter it below, then click Send password.');
          setActiveTabId(tabId);
          setActiveConnectionId(nextConnectionId || null);
          setPendingCredentialsTabId(tabId);
          if (wantAuto) {
            setConnectMode('auto');
            setVncHost(gatewayHost);
            setVncPort(String(gatewayPort));
          } else {
            setWsUrl(url);
          }
        });

        rfb.addEventListener('securityfailure', (e: CustomEvent) => {
          updateTab(tabId, {
            status: 'error',
            statusMessage: (e as any)?.detail?.reason || 'Security handshake failed',
          });
          setShowSettings(true);
          setNotice((e as any)?.detail?.reason || 'Security handshake failed');
        });

        const handle = sessionHandlesRef.current.get(tabId);
        if (handle) {
          handle.rfb = rfb;
          handle.gatewaySessionId = gatewaySessionId;
        }
      } catch (err) {
        console.error('noVNC connect failed', err);
        updateTab(tabId, {
          status: 'error',
          statusMessage: err instanceof Error ? err.message : 'Failed to load or connect noVNC',
        });
        setShowSettings(true);
        setNotice(err instanceof Error ? err.message : 'Failed to load or connect noVNC');
        void stopGatewayFor(gatewaySessionId);
      }
    },
    [
      wsUrl,
      connectMode,
      vncHost,
      vncPort,
      password,
      scaleViewport,
      viewOnly,
      activeConnectionId,
      draftName,
      draftColor,
      connections,
      useServer,
      maxVncTabs,
      updateTab,
      markLastUsed,
      closeTab,
      stopGatewayFor,
    ]
  );

  const connect = useCallback(() => void connectTo(), [connectTo]);

  const sendPendingPassword = useCallback(() => {
    const tabId = pendingCredentialsTabId || activeTabId;
    if (!tabId) {
      setNotice('No VNC session waiting for a password. Click Connect first.');
      return;
    }
    const pw = passwordRef.current.trim();
    if (!pw) {
      setNotice('Enter the VNC password first.');
      setShowSettings(true);
      return;
    }
    const handle = sessionHandlesRef.current.get(tabId);
    if (!handle?.rfb) {
      setNotice('Session is not waiting for credentials anymore. Click Connect again with the password filled in.');
      setPendingCredentialsTabId(null);
      return;
    }
    try {
      handle.rfb.sendCredentials({ password: pw });
      updateTab(tabId, {
        status: 'connecting',
        statusMessage: 'Authenticating…',
      });
      setNotice('Authenticating…');
    } catch (err) {
      console.error('sendCredentials failed', err);
      setNotice(err instanceof Error ? err.message : 'Failed to send VNC password');
    }
  }, [pendingCredentialsTabId, activeTabId, updateTab]);

  const registerTabHost = useCallback((tabId: string, el: HTMLDivElement | null) => {
    if (el) tabHostsRef.current.set(tabId, el);
    else tabHostsRef.current.delete(tabId);
  }, []);

  const nudgeRfbLayout = useCallback((tabId: string) => {
    const handle = sessionHandlesRef.current.get(tabId);
    const rfb = handle?.rfb as
      | (RfbInstance & { _updateScale?: () => void; _requestRemoteResize?: () => void; blur?: () => void })
      | null
      | undefined;
    if (!rfb) return;
    try {
      // Re-apply public scale flag so noVNC recomputes canvas layout after zoom sync.
      const scaled = Boolean((rfb as { scaleViewport?: boolean }).scaleViewport);
      (rfb as { scaleViewport: boolean }).scaleViewport = scaled;
      rfb._updateScale?.();
      rfb._requestRemoteResize?.();
    } catch {
      // ignore
    }
  }, []);

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (tab?.connectionId) setActiveConnectionId(tab.connectionId);
  }, []);

  const disconnectConnectionSessions = useCallback(
    async (connectionId: string) => {
      const toClose = tabsRef.current.filter((t) => t.connectionId === connectionId).map((t) => t.id);
      for (const id of toClose) {
        await closeTab(id);
      }
    },
    [closeTab]
  );

  const applyConnection = useCallback(
    (c: SavedVncConnection, autoConnect: boolean) => {
      setActiveConnectionId(c.id);
      const auto = parseAutoVncTargetUrl(c.wsUrl);
      if (auto) {
        setConnectMode('auto');
        setVncHost(auto.host);
        setVncPort(String(auto.port));
        setWsUrl(c.wsUrl);
      } else {
        setConnectMode('ws');
        setWsUrl(c.wsUrl);
      }
      setViewOnly(Boolean(c.viewOnly));
      setScaleViewport(c.scaleViewport !== false);
      setDraftName(c.name);
      setDraftTags(c.tags.join(', '));
      setDraftNotes(c.notes || '');
      setDraftColor(normalizeVncColor(c.color));
      setEditingId(c.id);
      setPassword('');
      setShowSettings(!autoConnect);
      setNotice(autoConnect ? `Connecting to “${c.name}”…` : `Loaded “${c.name}”`);
      if (autoConnect) {
        void connectTo({
          wsUrl: c.wsUrl,
          viewOnly: Boolean(c.viewOnly),
          scaleViewport: c.scaleViewport !== false,
          password: '',
          connectionId: c.id,
          connectionName: c.name,
          color: c.color,
          mode: auto ? 'auto' : 'ws',
          host: auto?.host,
          port: auto?.port,
        });
      }
    },
    [connectTo]
  );

  const saveCurrentConnection = async () => {
    let url = '';
    if (connectMode === 'auto') {
      const host = vncHost.trim();
      const port = Number.parseInt(vncPort, 10) || 5900;
      if (!host) {
        setNotice('Enter host before saving.');
        setShowSettings(true);
        return;
      }
      if (!useServer) {
        setNotice('Sign in to save Easy-mode connections (auto-vnc:// needs the gateway).');
        return;
      }
      url = buildAutoVncTargetUrl(host, port);
    } else {
      url = normalizeWsUrl(wsUrl);
      if (!url || /^auto-vnc:/i.test(url)) {
        setNotice('Enter a WebSocket URL before saving.');
        setShowSettings(true);
        return;
      }
    }
    const name =
      draftName.trim() ||
      (connectMode === 'auto'
        ? `${vncHost.trim()}:${Number.parseInt(vncPort, 10) || 5900}`
        : url.replace(/^wss?:\/\//i, '').split('/')[0]) ||
      'VNC host';
    const tags = parseTags(draftTags);
    const notes = draftNotes.trim();
    const color = normalizeVncColor(draftColor);

    setSaving(true);
    try {
      if (useServer) {
        if (editingId) {
          const updated = await vncConnectionService.update(editingId, {
            name,
            wsUrl: url,
            tags,
            notes,
            color,
            viewOnly,
            scaleViewport,
          });
          setConnections((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
          setActiveConnectionId(editingId);
          setNotice(`Updated “${name}”`);
        } else {
          const created = await vncConnectionService.create({
            name,
            wsUrl: url,
            tags,
            notes,
            color,
            viewOnly,
            scaleViewport,
          });
          setConnections((prev) => [created, ...prev]);
          setActiveConnectionId(created.id);
          setEditingId(created.id);
          setNotice(`Saved “${name}”`);
        }
      } else if (editingId) {
        const next = connections.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name,
                wsUrl: url,
                tags,
                notes: notes || undefined,
                color,
                viewOnly,
                scaleViewport,
              }
            : c
        );
        setConnections(next);
        persistLocalConnections(next);
        setActiveConnectionId(editingId);
        setNotice(`Updated “${name}”`);
      } else {
        const created: SavedVncConnection = {
          id: newLocalId(),
          name,
          wsUrl: url,
          tags,
          notes: notes || undefined,
          color,
          viewOnly,
          scaleViewport,
          createdAt: Date.now(),
        };
        const next = [created, ...connections];
        setConnections(next);
        persistLocalConnections(next);
        setActiveConnectionId(created.id);
        setEditingId(created.id);
        setNotice(`Saved “${name}”`);
      }
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
    setDraftColor(VNC_CONNECTION_COLORS[Math.floor(Math.random() * VNC_CONNECTION_COLORS.length)]);
    setPassword('');
    setViewOnly(false);
    setScaleViewport(true);
    setShowSettings(true);
    setNotice('New connection — fill URL, name, tags, then Save.');
  };

  const exportConnectionsJson = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      connections: connections.map(
        ({ id, name, wsUrl: u, tags, notes, color, viewOnly: vo, scaleViewport: sv, createdAt, lastUsedAt }) => ({
          id,
          name,
          wsUrl: u,
          tags,
          notes: notes || undefined,
          color: normalizeVncColor(color),
          viewOnly: Boolean(vo),
          scaleViewport: sv !== false,
          createdAt,
          lastUsedAt,
        })
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-vnc-connections-${new Date().toISOString().slice(0, 10)}.json`;
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

      const incoming: SavedVncConnection[] = [];
      for (const item of list) {
        if (!item || typeof item.wsUrl !== 'string') continue;
        const url = normalizeWsUrl(String(item.wsUrl));
        if (!url) continue;
        incoming.push({
          id: typeof item.id === 'string' && item.id ? item.id : newLocalId(),
          name:
            typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : url.replace(/^wss?:\/\//i, '').split('/')[0] || 'VNC host',
          wsUrl: url,
          tags: Array.isArray(item.tags) ? parseTags(item.tags.join(',')) : parseTags(String(item.tags || '')),
          notes: item.notes != null && String(item.notes).trim() ? String(item.notes).trim() : undefined,
          color: normalizeVncColor(item.color),
          viewOnly: Boolean(item.viewOnly),
          scaleViewport: item.scaleViewport !== false,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          lastUsedAt: typeof item.lastUsedAt === 'number' ? item.lastUsedAt : undefined,
        });
      }

      if (incoming.length === 0) {
        setNotice('No valid connections found in that file.');
        return;
      }

      if (useServer) {
        const merged = await vncConnectionService.bulkUpsert(incoming);
        setConnections(merged);
        setNotice(`Imported / merged ${incoming.length} connection(s)`);
        return;
      }

      const byUrl = new Map<string, SavedVncConnection>();
      connections.forEach((c) => byUrl.set(c.wsUrl, c));
      let added = 0;
      let updated = 0;
      for (const item of incoming) {
        const existing = byUrl.get(item.wsUrl);
        if (existing) {
          byUrl.set(item.wsUrl, {
            ...existing,
            name: item.name,
            tags: item.tags,
            notes: item.notes,
            color: item.color,
            viewOnly: item.viewOnly,
            scaleViewport: item.scaleViewport,
            lastUsedAt: item.lastUsedAt || existing.lastUsedAt,
          });
          updated += 1;
        } else {
          byUrl.set(item.wsUrl, item);
          added += 1;
        }
      }
      const next = Array.from(byUrl.values());
      setConnections(next);
      persistLocalConnections(next);
      setNotice(`Imported ${added} new, updated ${updated}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to import JSON');
    }
  };

  const deleteConnection = async (id: string) => {
    const target = connections.find((c) => c.id === id);
    if (!target) return;

    const liveTabs = tabsRef.current.filter((t) => t.connectionId === id);
    if (liveTabs.some((t) => t.status === 'connected' || t.status === 'connecting')) {
      if (!window.confirm(`“${target.name}” has open sessions. Disconnect and delete?`)) return;
      await disconnectConnectionSessions(id);
    } else if (liveTabs.length > 0) {
      if (!window.confirm(`Delete “${target.name}” and close its tabs?`)) return;
      await disconnectConnectionSessions(id);
    } else if (!window.confirm(`Delete saved connection “${target.name}”?`)) {
      return;
    }

    try {
      if (useServer) {
        await vncConnectionService.remove(id);
      }
      setConnections((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (!useServer) persistLocalConnections(next);
        return next;
      });
      if (editingId === id) {
        setEditingId(null);
        setDraftName('');
        setDraftTags('');
        setDraftNotes('');
        setDraftColor(VNC_CONNECTION_COLORS[0]);
      }
      if (activeConnectionId === id) setActiveConnectionId(null);
      setNotice(`Deleted “${target.name}”`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to delete connection');
    }
  };

  const sendCad = useCallback(() => {
    const id = activeTabIdRef.current;
    if (!id) return;
    const handle = sessionHandlesRef.current.get(id);
    try {
      handle?.rfb?.sendCtrlAltDel();
    } catch {
      // ignore
    }
  }, []);

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
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">VNC Viewer</h3>
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
            title={tileLayout ? 'Single tab view' : 'Tile sessions side by side'}
            aria-label={tileLayout ? 'Exit tiled view' : 'Tile sessions'}
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
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
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
              onClick={() => void requestClose()}
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
                  disabled={tabs.length >= maxVncTabs}
                  className="px-2 py-1 text-[10px] font-semibold rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
                  title={tabs.length >= maxVncTabs ? `Maximum ${maxVncTabs} sessions` : 'Open a new session tab'}
                >
                  {status === 'connected' || status === 'connecting' ? 'New tab' : 'Connect'}
                </button>
              </div>
              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                VNC password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (pendingCredentialsTabId) sendPendingPassword();
                      else void connect();
                    }
                  }}
                  placeholder="Enter before Connect"
                  className="mt-1 w-full h-7 px-2 text-[11px] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  autoComplete="off"
                />
              </label>
              {pendingCredentialsTabId && (
                <button
                  type="button"
                  onClick={sendPendingPassword}
                  className="w-full h-7 rounded-md text-[10px] font-semibold bg-sky-600 hover:bg-sky-500 text-white"
                >
                  Send password
                </button>
              )}
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
                  No saved connections yet. Use <strong>+</strong>, open Settings, then <strong>Save</strong>.
                </p>
              ) : (
                filteredConnections.map((c) => {
                  const selected = activeConnectionId === c.id;
                  const live = liveConnectionIds.has(c.id);
                  const color = normalizeVncColor(c.color);
                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg border overflow-hidden transition-colors ${
                        selected
                          ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                      style={{ borderLeftWidth: 3, borderLeftColor: color }}
                    >
                      <button
                        type="button"
                        className="w-full text-left px-2 pt-2 pb-1"
                        onClick={() => applyConnection(c, false)}
                        title={`Edit ${c.name}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate flex-1">{c.name}</p>
                          {live && (
                            <span className="shrink-0 px-1 py-0 text-[9px] font-semibold rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              live
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{c.wsUrl}</p>
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
                      <div className="flex items-center gap-1 px-2 pb-2">
                        <button
                          type="button"
                          onClick={() => applyConnection(c, true)}
                          disabled={tabs.length >= maxVncTabs}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
                          title={tabs.length >= maxVncTabs ? `Maximum ${maxVncTabs} sessions` : 'Connect'}
                          aria-label={`Connect to ${c.name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </button>
                        {live && (
                          <button
                            type="button"
                            onClick={() => void disconnectConnectionSessions(c.id)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Disconnect sessions"
                            aria-label={`Disconnect ${c.name}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6z" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => applyConnection(c, false)}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="Edit"
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
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete"
                          aria-label={`Delete ${c.name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            applyConnection(c, false);
                            setShowSettings(true);
                          }}
                          className={`ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md border ${
                            showSettings && activeConnectionId === c.id
                              ? 'border-orange-400 bg-orange-500 text-white'
                              : 'border-slate-200 dark:border-slate-600 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                          }`}
                          title="Settings"
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
                    placeholder="Warehouse TC52"
                    className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Tags (comma-separated)
                  <input
                    type="text"
                    value={draftTags}
                    onChange={(e) => setDraftTags(e.target.value)}
                    placeholder="warehouse, zebra, prod"
                    className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div>
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Color</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {VNC_CONNECTION_COLORS.map((hex) => {
                    const selected = normalizeVncColor(draftColor) === hex;
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

              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Notes
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes (synced when signed in)"
                  className="mt-1 w-full px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-y min-h-[2.5rem]"
                />
              </label>

              {connectMode === 'auto' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
                    VNC host
                    <input
                      type="text"
                      value={vncHost}
                      onChange={(e) => setVncHost(e.target.value)}
                      placeholder="192.168.1.50"
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
                      value={vncPort}
                      onChange={(e) => setVncPort(e.target.value)}
                      placeholder="5900"
                      className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </label>
                </div>
              ) : (
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  WebSocket URL (websockify)
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="ws://host:6080/websockify"
                    className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
              )}
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                VNC password (session only — not saved)
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pendingCredentialsTabId) {
                      e.preventDefault();
                      sendPendingPassword();
                    }
                  }}
                  className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  autoComplete="off"
                />
              </label>
              {pendingCredentialsTabId && (
                <button
                  type="button"
                  onClick={sendPendingPassword}
                  className="w-full h-8 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white"
                >
                  Send password
                </button>
              )}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={viewOnly} onChange={(e) => setViewOnly(e.target.checked)} />
                  View only
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={scaleViewport} onChange={(e) => setScaleViewport(e.target.checked)} />
                  Scale to fit
                </label>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                {connectMode === 'auto' ? (
                  <>
                    Easy mode starts <strong>websockify</strong> on this LinkNest server (ports 19000–19999) and bridges to your VNC host.
                    Requires sign-in. Passwords stay in the browser session only.
                  </>
                ) : (
                  <>
                    Advanced mode uses an existing websockify WebSocket URL. Passwords are never stored.{' '}
                    {useServer
                      ? 'Saved connections sync to your account.'
                      : 'Guest saves stay in this browser only.'}
                  </>
                )}
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-0 bg-slate-950 overflow-hidden flex flex-col">
            {tabs.length > 0 && (
              <div className="shrink-0 flex items-center gap-0.5 px-1 py-1 border-b border-slate-800 bg-slate-900 overflow-x-auto">
                {tabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  const connColor = normalizeVncColor(tab.color);
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
                <div className="ml-auto flex items-center gap-1 shrink-0 pr-0.5">
                  {activeTab?.status === 'connected' && (
                    <button
                      type="button"
                      onClick={sendCad}
                      className="px-1.5 h-6 text-[10px] font-semibold rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                      title="Send Ctrl+Alt+Del"
                    >
                      CAD
                    </button>
                  )}
                  <span className="px-1.5 text-[10px] text-slate-500">
                    {tabs.length}/{maxVncTabs}
                  </span>
                </div>
              </div>
            )}

            <div
              className={`relative flex-1 min-h-0 ${
                tileLayout && tabs.length > 0 ? 'grid gap-1 p-1' : ''
              }`}
              style={tileLayout && tabs.length > 0 ? tileGridStyle(tabs.length) : undefined}
            >
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const connColor = normalizeVncColor(tab.color);
                return (
                  <div
                    key={tab.id}
                    className={
                      tileLayout
                        ? 'relative min-h-0 min-w-0 rounded-md border overflow-hidden bg-black'
                        : `absolute inset-0 ${isActive ? 'z-10' : 'z-0 pointer-events-none opacity-0'}`
                    }
                    style={tileLayout ? { borderColor: `${connColor}99` } : undefined}
                    aria-hidden={!tileLayout && !isActive}
                    onMouseDown={() => {
                      if (tileLayout) setActiveTabId(tab.id);
                    }}
                  >
                    {tileLayout && (
                      <div
                        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-white/90 bg-black/50 backdrop-blur-sm"
                        style={{ borderBottom: `2px solid ${connColor}` }}
                      >
                        <span className="truncate">{tab.title}</span>
                        <span className="ml-auto opacity-70">{tab.status}</span>
                      </div>
                    )}
                    <ZoomSafeHost
                      ref={(el) => registerTabHost(tab.id, el)}
                      className={`absolute inset-0 w-full h-full ${tileLayout ? 'pt-5' : ''}`}
                      innerClassName="[&>div]:h-full [&>div]:w-full [&>canvas]:max-w-full"
                      onZoomCompensated={() => nudgeRfbLayout(tab.id)}
                    />
                  </div>
                );
              })}

              {tabs.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center px-4">
                    <div className="mx-auto mb-2 w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8" />
                        <path d="M12 17v4" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-400">
                      {connections.length
                        ? `Click a saved connection to open a session tab (up to ${maxVncTabs})`
                        : 'Connect or pick a saved host — each session opens in its own tab'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VncViewerWidget;
