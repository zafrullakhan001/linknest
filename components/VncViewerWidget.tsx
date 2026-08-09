import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';

interface VncViewerWidgetProps {
  onClose?: () => void;
}

interface SavedVncConnection {
  id: string;
  name: string;
  wsUrl: string;
  tags: string[];
  viewOnly?: boolean;
  scaleViewport?: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

const WS_STORAGE_KEY = 'linknest.vncViewer.wsUrl.v1';
const CONNECTIONS_STORAGE_KEY = 'linknest.vncViewer.savedConnections.v1';
const PANEL_OPEN_KEY = 'linknest.vncViewer.panelOpen.v1';
const PANEL_WIDTH_KEY = 'linknest.vncViewer.panelWidth.v1';

const PANEL_MIN_WIDTH = 160;
const PANEL_MAX_WIDTH = 420;
const PANEL_DEFAULT_WIDTH = 210;

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

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
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

function loadSavedConnections(): SavedVncConnection[] {
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
        viewOnly: Boolean(c.viewOnly),
        scaleViewport: c.scaleViewport !== false,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
        lastUsedAt: typeof c.lastUsedAt === 'number' ? c.lastUsedAt : undefined,
      }));
  } catch {
    return [];
  }
}

function persistConnections(list: SavedVncConnection[]) {
  try {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function newId(): string {
  return `vnc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const VncViewerWidget: React.FC<VncViewerWidgetProps> = ({ onClose }) => {
  const widgetRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rfbRef = useRef<InstanceType<typeof import('@novnc/novnc').default> | null>(null);

  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(WS_STORAGE_KEY) || 'ws://localhost:6080/websockify');
  const [password, setPassword] = useState('');
  const [viewOnly, setViewOnly] = useState(false);
  const [scaleViewport, setScaleViewport] = useState(true);
  const [status, setStatus] = useState<ConnState>('idle');
  const [statusMessage, setStatusMessage] = useState('Pick a saved connection or enter a websockify URL.');
  const [showSettings, setShowSettings] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem(PANEL_OPEN_KEY) !== 'false');
  const [panelWidth, setPanelWidth] = useState<number>(() => loadPanelWidth());
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);

  const [connections, setConnections] = useState<SavedVncConnection[]>(() => loadSavedConnections());
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

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
          c.tags.some((t) => t.includes(q))
        );
      })
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));
  }, [connections, filterQuery, filterTag]);

  const updateConnections = useCallback((next: SavedVncConnection[]) => {
    setConnections(next);
    persistConnections(next);
  }, []);

  const disconnect = useCallback(() => {
    const rfb = rfbRef.current;
    if (rfb) {
      try {
        rfb.disconnect();
      } catch {
        // ignore
      }
      rfbRef.current = null;
    }
    if (screenRef.current) {
      screenRef.current.innerHTML = '';
    }
    setStatus((s) => (s === 'connecting' || s === 'connected' ? 'disconnected' : s));
  }, []);

  const connectTo = useCallback(async (opts?: {
    wsUrl?: string;
    password?: string;
    viewOnly?: boolean;
    scaleViewport?: boolean;
    connectionId?: string | null;
    connectionName?: string;
  }) => {
    const url = normalizeWsUrl(opts?.wsUrl ?? wsUrl);
    if (!url) {
      setStatus('error');
      setStatusMessage('WebSocket URL is required.');
      return;
    }

    const nextViewOnly = opts?.viewOnly ?? viewOnly;
    const nextScale = opts?.scaleViewport ?? scaleViewport;
    const nextPassword = opts?.password ?? password;
    const nextConnectionId = opts?.connectionId !== undefined ? opts.connectionId : activeConnectionId;
    const nextName = opts?.connectionName;

    disconnect();
    setStatus('connecting');
    setStatusMessage(`Connecting to ${nextName || url}…`);
    setShowSettings(false);

    try {
      localStorage.setItem(WS_STORAGE_KEY, url);
    } catch {
      // ignore
    }

    try {
      const RFB = (await import('@novnc/novnc')).default;
      const target = screenRef.current;
      if (!target) {
        setStatus('error');
        setStatusMessage('Viewer surface is not ready.');
        return;
      }
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
        setStatus('connected');
        setStatusMessage(nextName ? `Connected · ${nextName}` : 'Connected');
        if (nextConnectionId) {
          setConnections((prev) => {
            const next = prev.map((c) =>
              c.id === nextConnectionId ? { ...c, lastUsedAt: Date.now() } : c
            );
            persistConnections(next);
            return next;
          });
        }
      });
      rfb.addEventListener('disconnect', (e: CustomEvent) => {
        const clean = Boolean((e as any)?.detail?.clean);
        rfbRef.current = null;
        setStatus(clean ? 'disconnected' : 'error');
        setStatusMessage(clean ? 'Disconnected' : 'Connection lost or failed');
        setShowSettings(true);
      });
      rfb.addEventListener('credentialsrequired', () => {
        setStatus('error');
        setStatusMessage('VNC server requires a password. Enter it and reconnect.');
        setShowSettings(true);
        try {
          rfb.disconnect();
        } catch {
          // ignore
        }
        rfbRef.current = null;
      });
      rfb.addEventListener('securityfailure', (e: CustomEvent) => {
        setStatus('error');
        setStatusMessage((e as any)?.detail?.reason || 'Security handshake failed');
        setShowSettings(true);
      });

      rfbRef.current = rfb;
    } catch (err) {
      console.error('noVNC connect failed', err);
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to load or connect noVNC');
      setShowSettings(true);
    }
  }, [wsUrl, password, scaleViewport, viewOnly, disconnect, activeConnectionId]);

  const connect = useCallback(() => connectTo(), [connectTo]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.viewOnly = viewOnly;
    rfb.scaleViewport = scaleViewport;
  }, [viewOnly, scaleViewport]);

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
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  const applyConnection = useCallback((c: SavedVncConnection, autoConnect: boolean) => {
    setActiveConnectionId(c.id);
    setWsUrl(c.wsUrl);
    setViewOnly(Boolean(c.viewOnly));
    setScaleViewport(c.scaleViewport !== false);
    setDraftName(c.name);
    setDraftTags(c.tags.join(', '));
    setEditingId(c.id);
    setPassword('');
    setShowSettings(!autoConnect);
    setStatusMessage(autoConnect ? `Connecting to “${c.name}”…` : `Loaded “${c.name}”`);
    if (autoConnect) {
      void connectTo({
        wsUrl: c.wsUrl,
        viewOnly: Boolean(c.viewOnly),
        scaleViewport: c.scaleViewport !== false,
        password: '',
        connectionId: c.id,
        connectionName: c.name,
      });
    }
  }, [connectTo]);

  const saveCurrentConnection = () => {
    const url = normalizeWsUrl(wsUrl);
    if (!url) {
      setStatus('error');
      setStatusMessage('Enter a WebSocket URL before saving.');
      return;
    }
    const name = draftName.trim() || url.replace(/^wss?:\/\//i, '').split('/')[0] || 'VNC host';
    const tags = parseTags(draftTags);

    if (editingId) {
      updateConnections(
        connections.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name,
                wsUrl: url,
                tags,
                viewOnly,
                scaleViewport,
              }
            : c
        )
      );
      setActiveConnectionId(editingId);
      setStatusMessage(`Updated “${name}”`);
      return;
    }

    const created: SavedVncConnection = {
      id: newId(),
      name,
      wsUrl: url,
      tags,
      viewOnly,
      scaleViewport,
      createdAt: Date.now(),
    };
    updateConnections([created, ...connections]);
    setActiveConnectionId(created.id);
    setEditingId(created.id);
    setStatusMessage(`Saved “${name}”`);
  };

  const startNewDraft = () => {
    setEditingId(null);
    setActiveConnectionId(null);
    setDraftName('');
    setDraftTags('');
    setShowSettings(true);
    setStatusMessage('New connection — fill URL, name, tags, then Save.');
  };

  const exportConnectionsJson = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      connections: connections.map(({ id, name, wsUrl, tags, viewOnly, scaleViewport, createdAt, lastUsedAt }) => ({
        id,
        name,
        wsUrl,
        tags,
        viewOnly: Boolean(viewOnly),
        scaleViewport: scaleViewport !== false,
        createdAt,
        lastUsedAt,
      })),
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
    setStatusMessage(`Exported ${connections.length} connection${connections.length === 1 ? '' : 's'}`);
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
        setStatus('error');
        setStatusMessage('Invalid JSON: expected { connections: [...] } or an array.');
        return;
      }

      const incoming: SavedVncConnection[] = [];
      for (const item of list) {
        if (!item || typeof item.wsUrl !== 'string') continue;
        const url = normalizeWsUrl(String(item.wsUrl));
        if (!url) continue;
        incoming.push({
          id: typeof item.id === 'string' && item.id ? item.id : newId(),
          name: typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : url.replace(/^wss?:\/\//i, '').split('/')[0] || 'VNC host',
          wsUrl: url,
          tags: Array.isArray(item.tags) ? parseTags(item.tags.join(',')) : parseTags(String(item.tags || '')),
          viewOnly: Boolean(item.viewOnly),
          scaleViewport: item.scaleViewport !== false,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          lastUsedAt: typeof item.lastUsedAt === 'number' ? item.lastUsedAt : undefined,
        });
      }

      if (incoming.length === 0) {
        setStatus('error');
        setStatusMessage('No valid connections found in that file.');
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
      updateConnections(Array.from(byUrl.values()));
      setStatusMessage(`Imported ${added} new, updated ${updated}`);
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to import JSON');
    }
  };

  const deleteConnection = (id: string) => {
    const target = connections.find((c) => c.id === id);
    if (!target) return;
    if (!window.confirm(`Delete saved connection “${target.name}”?`)) return;
    updateConnections(connections.filter((c) => c.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraftName('');
      setDraftTags('');
    }
    if (activeConnectionId === id) setActiveConnectionId(null);
    setStatusMessage(`Deleted “${target.name}”`);
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
      ref={widgetRef}
      className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
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
          {status === 'connected' && (
            <button
              type="button"
              onClick={() => rfbRef.current?.sendCtrlAltDel()}
              className="px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Send Ctrl+Alt+Del"
            >
              CAD
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Connection settings"
          >
            Settings
          </button>
          {status === 'connected' || status === 'connecting' ? (
            <button
              type="button"
              onClick={() => {
                disconnect();
                setStatus('disconnected');
                setStatusMessage('Disconnected');
                setShowSettings(true);
              }}
              className="px-2 py-1 text-[11px] font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              className="px-2 py-1 text-[11px] font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white"
            >
              Connect
            </button>
          )}
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
                  Saved
                </p>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={exportConnectionsJson}
                    disabled={connections.length === 0}
                    className="p-1 rounded-md border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
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
                    className="p-1 rounded-md border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
                    title="Import connections from JSON"
                    aria-label="Import connections from JSON"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={startNewDraft}
                    className="p-1 rounded-md bg-brand-600 hover:bg-brand-700 text-white"
                    title="New connection"
                    aria-label="New connection"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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
                </div>
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
              {filteredConnections.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center leading-relaxed">
                  No saved connections yet. Fill Settings, set a name/tags, then Save.
                </p>
              ) : (
                filteredConnections.map((c) => {
                  const active = activeConnectionId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg border p-2 transition-colors ${
                        active
                          ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-600'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => applyConnection(c, true)}
                        title={`Connect to ${c.name}`}
                      >
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
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
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          type="button"
                          onClick={() => applyConnection(c, true)}
                          className="flex-1 inline-flex items-center justify-center h-7 rounded-md bg-brand-600 hover:bg-brand-700 text-white"
                          title="Connect"
                          aria-label={`Connect to ${c.name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </button>
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
                          onClick={() => deleteConnection(c.id)}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete"
                          aria-label={`Delete ${c.name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 space-y-2 shrink-0 bg-white dark:bg-slate-800">
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
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                WebSocket URL (websockify)
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://host:6080/websockify"
                  className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                VNC password (session only — not saved)
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={viewOnly} onChange={(e) => setViewOnly(e.target.checked)} />
                  View only
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={scaleViewport} onChange={(e) => setScaleViewport(e.target.checked)} />
                  Scale to fit
                </label>
                <button
                  type="button"
                  onClick={saveCurrentConnection}
                  className="ml-auto px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900"
                >
                  {editingId ? 'Update saved' : 'Save connection'}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                Saved connections store name, URL, tags, and display options only — passwords are never written to localStorage.
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-0 bg-slate-950 overflow-hidden">
            <div ref={screenRef} className="absolute inset-0 w-full h-full [&>canvas]:max-w-full" />
            {status !== 'connected' && status !== 'connecting' && (
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
                      ? 'Click a saved connection to connect quickly'
                      : 'noVNC ready — save hosts in the left panel for one-click access'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VncViewerWidget;
