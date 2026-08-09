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
} from '../services/sshConnectionService';

interface SshTerminalWidgetProps {
  onClose?: () => void;
}

const WS_STORAGE_KEY = 'linknest.sshTerminal.wsUrl.v1';
const CONNECTIONS_STORAGE_KEY = 'linknest.sshTerminal.savedConnections.v1';
const PANEL_OPEN_KEY = 'linknest.sshTerminal.panelOpen.v1';
const PANEL_WIDTH_KEY = 'linknest.sshTerminal.panelWidth.v1';
const PANEL_MIN_WIDTH = 160;
const PANEL_MAX_WIDTH = 420;

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

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

export const SshTerminalWidget: React.FC<SshTerminalWidgetProps> = ({ onClose }) => {
  const { isAuthenticated } = useAuth();
  const termHostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelWidthRef = useRef(loadPanelWidth());
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const encoderRef = useRef(new TextEncoder());

  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(WS_STORAGE_KEY) || 'ws://localhost:7681/ws');
  const [status, setStatus] = useState<ConnState>('idle');
  const [statusMessage, setStatusMessage] = useState('Pick a saved connection or enter a ttyd WebSocket URL.');
  const [showSettings, setShowSettings] = useState(true);
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const useServer = Boolean(isAuthenticated);

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
          c.tags.some((t) => t.includes(q))
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
          setStatus('error');
          setStatusMessage(err instanceof Error ? err.message : 'Failed to load saved connections');
          setStorageReady(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [useServer]);

  const disposeTerminal = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
    try {
      termRef.current?.dispose();
    } catch {
      // ignore
    }
    termRef.current = null;
    fitRef.current = null;
    if (termHostRef.current) {
      termHostRef.current.innerHTML = '';
    }
  }, []);

  const disconnect = useCallback(() => {
    disposeTerminal();
    setStatus((s) => (s === 'connecting' || s === 'connected' ? 'disconnected' : s));
  }, [disposeTerminal]);

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

  const sendResize = useCallback(() => {
    const term = termRef.current;
    const ws = wsRef.current;
    if (!term || !ws || ws.readyState !== WebSocket.OPEN) return;
    const msg = CMD.RESIZE_TERMINAL + JSON.stringify({ columns: term.cols, rows: term.rows });
    ws.send(encoderRef.current.encode(msg));
  }, []);

  const connectTo = useCallback(
    async (opts?: {
      wsUrl?: string;
      connectionId?: string | null;
      connectionName?: string;
    }) => {
      const url = normalizeWsUrl(opts?.wsUrl ?? wsUrl);
      if (!url) {
        setStatus('error');
        setStatusMessage('WebSocket URL is required.');
        return;
      }

      const nextConnectionId = opts?.connectionId !== undefined ? opts.connectionId : activeConnectionId;
      const nextName = opts?.connectionName;

      disposeTerminal();
      setStatus('connecting');
      setStatusMessage(`Connecting to ${nextName || url}…`);
      setShowSettings(false);

      try {
        localStorage.setItem(WS_STORAGE_KEY, url);
      } catch {
        // ignore
      }

      const host = termHostRef.current;
      if (!host) {
        setStatus('error');
        setStatusMessage('Terminal surface is not ready.');
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
      host.innerHTML = '';
      term.open(host);
      // Fit after layout settles (flex panels often report 0x0 on first paint)
      requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
      });
      termRef.current = term;
      fitRef.current = fit;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url, ['tty']);
      } catch (err) {
        disposeTerminal();
        setStatus('error');
        setStatusMessage(err instanceof Error ? err.message : 'Failed to open WebSocket');
        setShowSettings(true);
        return;
      }

      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
        // ttyd handshake: first frame must be AuthToken JSON (not RESIZE opcode)
        const cols = Math.max(term.cols || 80, 2);
        const rows = Math.max(term.rows || 24, 1);
        const hello = JSON.stringify({ AuthToken: '', columns: cols, rows });
        ws.send(encoderRef.current.encode(hello));
        term.focus();
        setStatus('connected');
        setStatusMessage(nextName ? `Connected · ${nextName}` : 'Connected');
        void markLastUsed(nextConnectionId);
        // Re-fit once more after settings panel closes
        window.setTimeout(() => {
          try {
            fit.fit();
            sendResize();
            term.focus();
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
          setStatusMessage(nextName ? `${nextName} · ${title}` : title);
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setStatusMessage('WebSocket error — check ttyd URL and CORS/TLS');
        setShowSettings(true);
      };

      ws.onclose = () => {
        wsRef.current = null;
        setStatus((s) => (s === 'connecting' ? 'error' : 'disconnected'));
        setStatusMessage((prev) =>
          prev.startsWith('Connected') || prev.includes('Connecting') ? 'Disconnected' : prev
        );
        setShowSettings(true);
      };

      term.onData((data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(encoderRef.current.encode(CMD.INPUT + data));
      });

      term.onResize(() => {
        sendResize();
      });
    },
    [wsUrl, activeConnectionId, disposeTerminal, sendResize, markLastUsed]
  );

  const connect = useCallback(() => connectTo(), [connectTo]);

  useEffect(() => {
    return () => {
      disposeTerminal();
    };
  }, [disposeTerminal]);

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
        fitRef.current?.fit();
        sendResize();
      } catch {
        // ignore
      }
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [sendResize]);

  // Refit when panel toggles / settings changes layout
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        fitRef.current?.fit();
        sendResize();
      } catch {
        // ignore
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [panelOpen, panelWidth, showSettings, sendResize]);

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

  const applyConnection = useCallback(
    (c: SavedSshConnection, autoConnect: boolean) => {
      setActiveConnectionId(c.id);
      setWsUrl(c.wsUrl);
      setDraftName(c.name);
      setDraftTags(c.tags.join(', '));
      setDraftNotes(c.notes || '');
      setEditingId(c.id);
      setShowSettings(!autoConnect);
      setStatusMessage(autoConnect ? `Connecting to “${c.name}”…` : `Loaded “${c.name}”`);
      if (autoConnect) {
        void connectTo({
          wsUrl: c.wsUrl,
          connectionId: c.id,
          connectionName: c.name,
        });
      }
    },
    [connectTo]
  );

  const saveCurrentConnection = async () => {
    const url = normalizeWsUrl(wsUrl);
    if (!url) {
      setStatus('error');
      setStatusMessage('Enter a WebSocket URL before saving.');
      return;
    }
    const name = draftName.trim() || url.replace(/^wss?:\/\//i, '').split('/')[0] || 'SSH host';
    const tags = parseTags(draftTags);
    const notes = draftNotes.trim() || undefined;

    setSaving(true);
    try {
      if (useServer) {
        if (editingId) {
          const updated = await sshConnectionService.update(editingId, { name, wsUrl: url, tags, notes: notes || '' });
          setConnections((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
          setActiveConnectionId(editingId);
          setStatusMessage(`Updated “${name}”`);
        } else {
          const created = await sshConnectionService.create({ name, wsUrl: url, tags, notes });
          setConnections((prev) => [created, ...prev]);
          setActiveConnectionId(created.id);
          setEditingId(created.id);
          setStatusMessage(`Saved “${name}”`);
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
                }
              : c
          )
        );
        setActiveConnectionId(editingId);
        setStatusMessage(`Updated “${name}”`);
      } else {
        const created: SavedSshConnection = {
          id: newId(),
          name,
          wsUrl: url,
          tags,
          notes,
          createdAt: Date.now(),
        };
        updateConnectionsLocal([created, ...connections]);
        setActiveConnectionId(created.id);
        setEditingId(created.id);
        setStatusMessage(`Saved “${name}”`);
      }
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to save connection');
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
    setShowSettings(true);
    setStatusMessage('New connection — fill URL, name, tags, then Save.');
  };

  const exportConnectionsJson = () => {
    const payload = {
      version: 1,
      type: 'linknest-ssh-connections',
      exportedAt: new Date().toISOString(),
      connections: connections.map(({ id, name, wsUrl: u, tags, notes, createdAt, lastUsedAt }) => ({
        id,
        name,
        wsUrl: u,
        tags,
        notes,
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
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          lastUsedAt: typeof item.lastUsedAt === 'number' ? item.lastUsedAt : undefined,
        });
      }

      if (incoming.length === 0) {
        setStatus('error');
        setStatusMessage('No valid connections found in that file.');
        return;
      }

      if (useServer) {
        const merged = await sshConnectionService.bulkUpsert(incoming);
        setConnections(merged);
        setStatusMessage(`Imported / merged ${incoming.length} connection(s)`);
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
            lastUsedAt: item.lastUsedAt || urlOnly.lastUsedAt,
          });
          updated += 1;
        } else if (existing) {
          byKey.set(key, {
            ...existing,
            tags: item.tags,
            notes: item.notes,
            lastUsedAt: item.lastUsedAt || existing.lastUsedAt,
          });
          updated += 1;
        } else {
          byKey.set(key, { ...item, id: newId() });
          added += 1;
        }
      }
      updateConnectionsLocal(Array.from(byKey.values()));
      setStatusMessage(`Imported ${added} new, updated ${updated}`);
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to import JSON');
    }
  };

  const deleteConnection = async (id: string) => {
    const target = connections.find((c) => c.id === id);
    if (!target) return;
    if (!window.confirm(`Delete saved connection “${target.name}”?`)) return;
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
      }
      if (activeConnectionId === id) setActiveConnectionId(null);
      setStatusMessage(`Deleted “${target.name}”`);
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to delete connection');
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
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
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
                  Saved{useServer ? ' · cloud' : ' · local'}
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
              {!storageReady ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center">Loading…</p>
              ) : filteredConnections.length === 0 ? (
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
                          onClick={() => void deleteConnection(c.id)}
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
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 space-y-2 shrink-0 bg-white dark:bg-slate-800 overflow-y-auto max-h-[45%]">
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
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                WebSocket URL (ttyd)
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://host:7681/ws"
                  className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
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
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => void saveCurrentConnection()}
                  disabled={saving}
                  className="ml-auto px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingId ? 'Update saved' : 'Save connection'}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                Connects via ttyd WebSocket protocol. Text shell only — GUI apps need X11 on Windows (VcXsrv +{' '}
                <code className="font-mono">ssh -Y</code>) or the VNC Viewer widget. Windows gateway example:{' '}
                <code className="font-mono">$env:DISPLAY=&quot;127.0.0.1:0.0&quot;; ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -Y -tt user@host</code>
                . Then use <code className="font-mono">ws://localhost:7681/ws</code>. See Help → Guides → Remote Widgets Setup.
                Passwords are never saved. {useServer ? 'Connections sync to your account.' : 'Guest connections stay in this browser.'}
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-0 bg-slate-950 overflow-hidden">
            <div ref={termHostRef} className="absolute inset-0 w-full h-full p-1 overflow-hidden [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm-viewport]:overflow-auto" />
            {status !== 'connected' && status !== 'connecting' && (
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
                      ? 'Click a saved connection to open the terminal'
                      : 'xterm ready — save ttyd gateways in the left panel for one-click access'}
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

export default SshTerminalWidget;
