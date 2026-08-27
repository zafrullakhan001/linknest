import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Tile } from '../types';
import { FaTimes, FaCheck, FaCopy, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { ShortUrlActions } from './ShortUrlActions';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { getTileUniqueVisitors, TileUniqueVisitor } from '../services/storageService';

interface TileAdmin {
  userId: number;
  username: string;
  email: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canAddLinks?: boolean;
    canAddSections?: boolean;
    canAddTabs?: boolean;
    canEditLinks?: boolean;
    canDeleteLinks?: boolean;
    canDeleteSections?: boolean;
    canDeleteTabs?: boolean;
    canChangeVisibility?: boolean;
    canChangeBrowser?: boolean;
    canCloneTile?: boolean;
    canViewTileInfo?: boolean;
    canEditTile?: boolean;
  };
}

interface TileInfo {
  tileId: string;
  title: string;
  owner: {
    userId: number | null;
    userUuid?: string | null;
    username: string | null;
    email: string | null;
  };
  createdAt: number;
  lastModified: number;
  archivedAt: number | null;
  deletedAt: number | null;
  visibility: string;
  /** Which tab this tile comes from: "Public tab", "Staging tab", or "Private tab" */
  sourceTab?: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  tileAdmins?: TileAdmin[];
  granularPermissions?: {
    canAddLinks: boolean;
    canAddSections: boolean;
    canAddTabs: boolean;
    canEditLinks: boolean;
    canDeleteLinks: boolean;
    canDeleteSections: boolean;
    canDeleteTabs: boolean;
    canChangeVisibility: boolean;
    canChangeBrowser: boolean;
    canCloneTile: boolean;
    canViewTileInfo: boolean;
    canEditTile: boolean;
  };
  stats?: {
    hitCount: number;
    uniqueVisitors?: number;
  };
}

interface CategoryInfo {
  categoryName: string;
  tileCount: number;
  tiles: Array<{
    id: string;
    title: string;
    userId: number | null | undefined;
    createdAt: number;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
  owner?: {
    userId: number | null;
    userUuid?: string | null;
    username: string | null;
    email: string | null;
    isAdmin: boolean;
  };
}

interface TileInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tile?: Tile;
  categoryInfo?: CategoryInfo;
}

type AccentTone = 'sky' | 'amber' | 'teal' | 'emerald' | 'violet' | 'rose' | 'indigo';

const ACCENT_STYLES: Record<AccentTone, { bar: string; iconBg: string; card: string; ring: string }> = {
  sky: {
    bar: 'bg-sky-500',
    iconBg: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    card: 'bg-gradient-to-br from-sky-50 to-slate-50 dark:from-sky-950/40 dark:to-slate-900/60 border-sky-100 dark:border-sky-900/40',
    ring: 'ring-sky-200/60 dark:ring-sky-800/40',
  },
  amber: {
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    card: 'bg-gradient-to-br from-amber-50 to-slate-50 dark:from-amber-950/40 dark:to-slate-900/60 border-amber-100 dark:border-amber-900/40',
    ring: 'ring-amber-200/60 dark:ring-amber-800/40',
  },
  teal: {
    bar: 'bg-teal-500',
    iconBg: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    card: 'bg-gradient-to-br from-teal-50 to-slate-50 dark:from-teal-950/40 dark:to-slate-900/60 border-teal-100 dark:border-teal-900/40',
    ring: 'ring-teal-200/60 dark:ring-teal-800/40',
  },
  emerald: {
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    card: 'bg-gradient-to-br from-emerald-50 to-slate-50 dark:from-emerald-950/40 dark:to-slate-900/60 border-emerald-100 dark:border-emerald-900/40',
    ring: 'ring-emerald-200/60 dark:ring-emerald-800/40',
  },
  violet: {
    bar: 'bg-violet-500',
    iconBg: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    card: 'bg-gradient-to-br from-violet-50 to-slate-50 dark:from-violet-950/40 dark:to-slate-900/60 border-violet-100 dark:border-violet-900/40',
    ring: 'ring-violet-200/60 dark:ring-violet-800/40',
  },
  rose: {
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    card: 'bg-gradient-to-br from-rose-50 to-slate-50 dark:from-rose-950/40 dark:to-slate-900/60 border-rose-100 dark:border-rose-900/40',
    ring: 'ring-rose-200/60 dark:ring-rose-800/40',
  },
  indigo: {
    bar: 'bg-indigo-500',
    iconBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    card: 'bg-gradient-to-br from-indigo-50 to-slate-50 dark:from-indigo-950/40 dark:to-slate-900/60 border-indigo-100 dark:border-indigo-900/40',
    ring: 'ring-indigo-200/60 dark:ring-indigo-800/40',
  },
};

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const DIALOG_MIN_W = 360;
const DIALOG_MIN_H = 280;
const DIALOG_DEFAULT_W = 672;
const DIALOG_DEFAULT_H = 720;
const DIALOG_MIN_VISIBLE = 64;

type DialogPoint = { x: number; y: number };
type DialogSize = { width: number; height: number };

function clampNum(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getCssZoom(): number {
  // App applies `html { zoom }` via styles; dialog geometry must use layout coords.
  const raw = getComputedStyle(document.documentElement).zoom;
  const z = raw && raw !== 'normal' ? Number.parseFloat(raw) : 1;
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function getLayoutViewport() {
  const { width: vvW, height: vvH } = getViewportSize();
  const zoom = getCssZoom();
  return { width: vvW / zoom, height: vvH / zoom, zoom };
}

function defaultDialogSize(): DialogSize {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    width: clampNum(Math.min(DIALOG_DEFAULT_W, layoutW - 32), DIALOG_MIN_W, Math.max(DIALOG_MIN_W, layoutW - 24)),
    height: clampNum(Math.min(DIALOG_DEFAULT_H, layoutH - 32), DIALOG_MIN_H, Math.max(DIALOG_MIN_H, layoutH - 24)),
  };
}

function centeredDialogPos(size: DialogSize): DialogPoint {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    x: Math.max(12, Math.round((layoutW - size.width) / 2)),
    y: Math.max(12, Math.round((layoutH - size.height) / 2)),
  };
}

function clampDialogPos(p: DialogPoint, size: DialogSize): DialogPoint {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    x: clampNum(p.x, -size.width + DIALOG_MIN_VISIBLE, layoutW - DIALOG_MIN_VISIBLE),
    y: clampNum(p.y, -size.height + DIALOG_MIN_VISIBLE, layoutH - DIALOG_MIN_VISIBLE),
  };
}

function clampDialogSize(size: DialogSize, pos: DialogPoint = { x: 0, y: 0 }): DialogSize {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    width: clampNum(size.width, DIALOG_MIN_W, Math.max(DIALOG_MIN_W, layoutW - Math.max(0, pos.x) - 8)),
    height: clampNum(size.height, DIALOG_MIN_H, Math.max(DIALOG_MIN_H, layoutH - Math.max(0, pos.y) - 8)),
  };
}

const InfoRow: React.FC<{
  label: string;
  labelEmoji?: string;
  hint?: string;
  children: React.ReactNode;
  stack?: boolean;
}> = ({ label, labelEmoji, hint, children, stack }) => (
  <div className={`flex gap-3 ${stack ? 'flex-col items-stretch' : 'justify-between items-center gap-4'}`}>
    <span className="text-slate-600 dark:text-slate-400 font-medium text-sm min-w-0 flex items-start gap-1.5">
      {labelEmoji && <span className="text-base leading-none shrink-0 mt-0.5" aria-hidden="true">{labelEmoji}</span>}
      <span className="leading-snug">
        <span className="block">{label}</span>
        {hint ? (
          <span className="block font-normal text-xs text-slate-500 dark:text-slate-400 mt-0.5">({hint})</span>
        ) : null}
      </span>
    </span>
    <div className={`${stack ? 'w-full' : 'text-right min-w-0 flex-1 flex justify-end items-center'} text-slate-900 dark:text-white`}>
      {children}
    </div>
  </div>
);

const SectionCard: React.FC<{
  emoji: string;
  title: string;
  accent: AccentTone;
  children: React.ReactNode;
}> = ({ emoji, title, accent, children }) => {
  const styles = ACCENT_STYLES[accent];
  return (
    <section>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2.5">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-base ${styles.iconBg}`} aria-hidden="true">
          {emoji}
        </span>
        <span className={`w-1 h-5 rounded-full ${styles.bar}`} />
        {title}
      </h3>
      <div className={`rounded-xl border p-4 space-y-3.5 ring-1 ${styles.card} ${styles.ring}`}>
        {children}
      </div>
    </section>
  );
};

const StatusBadge: React.FC<{
  allowed: boolean;
  allowLabel?: string;
  denyLabel?: string;
}> = ({ allowed, allowLabel = 'Allowed', denyLabel = 'Denied' }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
      allowed
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
    }`}
  >
    <span aria-hidden="true">{allowed ? '✅' : '🚫'}</span>
    {allowed ? allowLabel : denyLabel}
  </span>
);

const VisibilityBadge: React.FC<{ visibility: string }> = ({ visibility }) => {
  const map: Record<string, { emoji: string; className: string }> = {
    public: {
      emoji: '🌎',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    authenticated: {
      emoji: '🔐',
      className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    },
    private: {
      emoji: '🔒',
      className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    },
  };
  const style = map[visibility] || map.private;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${style.className}`}>
      <span aria-hidden="true">{style.emoji}</span>
      {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
    </span>
  );
};

const SourceTabBadge: React.FC<{ sourceTab: string }> = ({ sourceTab }) => {
  const className =
    sourceTab === 'Staging tab'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : sourceTab === 'Private tab'
        ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  const emoji = sourceTab === 'Staging tab' ? '🚧' : sourceTab === 'Private tab' ? '🔑' : '📢';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      <span aria-hidden="true">{emoji}</span>
      {sourceTab}
    </span>
  );
};

const CopyableId: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 max-w-full min-w-0">
      <code className="font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 break-all text-left leading-snug">
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-md text-slate-500 hover:text-brand-600 hover:bg-white dark:hover:bg-slate-700 dark:hover:text-brand-300 transition-colors"
        title={copied ? 'Copied' : 'Copy ID'}
        aria-label={copied ? 'Copied' : 'Copy ID'}
      >
        {copied ? <FaCheck className="w-3.5 h-3.5 text-emerald-500" /> : <FaCopy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

const UniqueVisitorsRow: React.FC<{
  tileId: string;
  count: number;
  isAdmin: boolean;
  formatDate: (ts: number) => string;
  formatRelativeTime: (ts: number) => string;
}> = ({ tileId, count, isAdmin, formatDate, formatRelativeTime }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitors, setVisitors] = useState<TileUniqueVisitor[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const canOpen = isAdmin && count > 0;

  useEffect(() => {
    setOpen(false);
    setVisitors(null);
    setError(null);
    setLoading(false);
    setTruncated(false);
  }, [tileId]);

  const loadVisitors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTileUniqueVisitors(tileId);
      setVisitors(result.visitors);
      setTruncated(result.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load unique visitors');
    } finally {
      setLoading(false);
    }
  }, [tileId]);

  const handleToggle = () => {
    if (!canOpen) return;
    const next = !open;
    setOpen(next);
    if (next && visitors === null && !loading) {
      void loadVisitors();
    }
  };

  const countBadge = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
      {count.toLocaleString()}
      {canOpen ? (open ? <FaChevronUp className="w-2.5 h-2.5 opacity-80" aria-hidden /> : <FaChevronDown className="w-2.5 h-2.5 opacity-80" aria-hidden />) : null}
    </span>
  );

  return (
    <div>
      <InfoRow
        label="Unique Visitors"
        labelEmoji="👥"
        hint={
          canOpen
            ? 'how many different people opened it — click the count to see who'
            : 'how many different people opened it — logged-in users and guests, each counted once'
        }
      >
        {canOpen ? (
          <button
            type="button"
            onClick={handleToggle}
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:focus-visible:ring-rose-500 hover:brightness-95 transition"
            aria-expanded={open}
            aria-controls={`unique-visitors-list-${tileId}`}
            title={open ? 'Hide unique visitors' : 'View unique visitors'}
          >
            {countBadge}
          </button>
        ) : (
          countBadge
        )}
      </InfoRow>

      {open && (
        <div
          id={`unique-visitors-list-${tileId}`}
          className="mt-3 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-white/70 dark:bg-slate-950/40 overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-rose-200 border-t-rose-600 animate-spin" />
              Loading visitors…
            </div>
          ) : error ? (
            <div className="px-3 py-3 text-xs text-rose-700 dark:text-rose-300">{error}</div>
          ) : !visitors || visitors.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">No unique visitors recorded yet.</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-rose-100 dark:divide-rose-900/40">
              {visitors.map((visitor, index) => {
                const isUser = visitor.type === 'user';
                const name = isUser
                  ? (visitor.username || 'Former user')
                  : `Guest${visitor.guestNumber ? ` ${visitor.guestNumber}` : ''}`;
                const key = isUser
                  ? `user-${visitor.userId ?? visitor.username ?? index}`
                  : `guest-${visitor.guestNumber ?? index}`;
                return (
                  <li key={key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0 text-left">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                        <span aria-hidden="true">{isUser ? '👤' : '👻'}</span>
                        <span className="truncate">{name}</span>
                      </div>
                      {visitor.email ? (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{visitor.email}</div>
                      ) : (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {isUser ? 'Logged-in user' : 'Anonymous guest (browser)'}
                        </div>
                      )}
                      {visitor.lastVisit > 0 && (
                        <div className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-0.5" title={formatDate(visitor.lastVisit)}>
                          Last visit {formatRelativeTime(visitor.lastVisit)}
                          {visitor.firstVisit > 0 && visitor.firstVisit !== visitor.lastVisit
                            ? ` · first ${formatRelativeTime(visitor.firstVisit)}`
                            : ''}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                      {visitor.hitCount.toLocaleString()} {visitor.hitCount === 1 ? 'hit' : 'hits'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {truncated && !loading && !error && (
            <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-rose-100 dark:border-rose-900/40">
              Showing the 500 most recent unique visitors.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PermCheck: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <div className="flex justify-between items-center gap-2 rounded-lg bg-white/60 dark:bg-slate-950/30 px-2.5 py-1.5">
    <span className="text-slate-600 dark:text-slate-400 text-xs">{label}</span>
    <span className={`text-xs font-semibold ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      {ok ? '✓' : '✗'}
    </span>
  </div>
);

export const TileInfoDialog: React.FC<TileInfoDialogProps> = ({
  isOpen,
  onClose,
  tile,
  categoryInfo
}) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isAdmin = !!user?.is_admin;
  const showUniqueVisitors = !!user || settings.hide_unique_visitors_public !== '1';
  const [tileInfo, setTileInfo] = useState<TileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spaceShortUrl, setSpaceShortUrl] = useState(tile?.shortUrl || '');

  const [modalPosition, setModalPosition] = useState<DialogPoint>({ x: 0, y: 0 });
  const [modalSize, setModalSize] = useState<DialogSize>({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const modalPositionRef = useRef<DialogPoint>({ x: 0, y: 0 });
  const modalSizeRef = useRef<DialogSize>({ width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSpaceShortUrl(tile?.shortUrl || '');
  }, [tile?.id, tile?.shortUrl]);

  useEffect(() => {
    if (isOpen && tile && !categoryInfo) {
      fetchTileInfo();
    } else if (isOpen && categoryInfo) {
      setTileInfo(null);
      setError(null);
    }
  }, [isOpen, tile?.id, categoryInfo]);

  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  // Center using zoom-aware layout viewport (html { zoom } breaks window.innerWidth math)
  useEffect(() => {
    if (!isOpen) {
      setModalPosition({ x: 0, y: 0 });
      setModalSize({ width: 0, height: 0 });
      modalPositionRef.current = { x: 0, y: 0 };
      modalSizeRef.current = { width: 0, height: 0 };
      return;
    }

    const nextSize = clampDialogSize(defaultDialogSize());
    const nextPos = clampDialogPos(centeredDialogPos(nextSize), nextSize);
    setModalSize(nextSize);
    setModalPosition(nextPos);
    modalSizeRef.current = nextSize;
    modalPositionRef.current = nextPos;
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      modalPositionRef.current = modalPosition;
      modalSizeRef.current = modalSize;
    }
  }, [modalPosition, modalSize, isDragging, isResizing]);

  // Keep dialog on-screen when the viewport or page zoom changes
  useEffect(() => {
    if (!isOpen || modalSize.width === 0) return;

    const reclamp = () => {
      const nextSize = clampDialogSize(modalSizeRef.current, modalPositionRef.current);
      const nextPos = clampDialogPos(modalPositionRef.current, nextSize);
      modalSizeRef.current = nextSize;
      modalPositionRef.current = nextPos;
      setModalSize(nextSize);
      setModalPosition(nextPos);
      if (modalRef.current) {
        modalRef.current.style.left = `${nextPos.x}px`;
        modalRef.current.style.top = `${nextPos.y}px`;
        modalRef.current.style.width = `${nextSize.width}px`;
        modalRef.current.style.height = `${nextSize.height}px`;
      }
    };

    window.addEventListener('resize', reclamp);
    window.visualViewport?.addEventListener('resize', reclamp);
    window.visualViewport?.addEventListener('scroll', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.visualViewport?.removeEventListener('resize', reclamp);
      window.visualViewport?.removeEventListener('scroll', reclamp);
    };
  }, [isOpen, modalSize.width]);

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: modalPositionRef.current.x,
      posY: modalPositionRef.current.y,
    };
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!modalRef.current) return;
    const zoom = getCssZoom();
    const next = clampDialogPos(
      {
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x) / zoom,
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y) / zoom,
      },
      modalSizeRef.current
    );
    modalPositionRef.current = next;
    modalRef.current.style.left = `${next.x}px`;
    modalRef.current.style.top = `${next.y}px`;
  }, []);

  const handleDragEnd = useCallback(() => {
    setModalPosition(modalPositionRef.current);
    setIsDragging(false);
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!modalRef.current) return;
    setIsResizing(true);
    const rect = modalRef.current.getBoundingClientRect();
    const zoom = getCssZoom();
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width / zoom,
      height: rect.height / zoom,
    };
  };

  const handleResize = useCallback((e: MouseEvent) => {
    if (!modalRef.current) return;
    const zoom = getCssZoom();
    const dx = (e.clientX - resizeStartRef.current.x) / zoom;
    const dy = (e.clientY - resizeStartRef.current.y) / zoom;
    const nextSize = clampDialogSize(
      {
        width: resizeStartRef.current.width + dx,
        height: resizeStartRef.current.height + dy,
      },
      modalPositionRef.current
    );
    modalSizeRef.current = nextSize;
    modalRef.current.style.width = `${nextSize.width}px`;
    modalRef.current.style.height = `${nextSize.height}px`;
  }, []);

  const handleResizeEnd = useCallback(() => {
    setModalSize(modalSizeRef.current);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isDragging ? 'move' : 'nwse-resize';
    document.addEventListener('mousemove', isDragging ? handleDrag : handleResize);
    document.addEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', isDragging ? handleDrag : handleResize);
      document.removeEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isResizing, handleDrag, handleResize, handleDragEnd, handleResizeEnd]);

  const fetchTileInfo = async () => {
    if (!tile) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tiles/${tile.id}/info`, {
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (data && typeof data.error === 'string' && data.error) ||
          'Failed to fetch tile information'
        );
      }

      setTileInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tile information');
    } finally {
      setLoading(false);
    }
  };

  // Tile created_at is stored as ms (Date.now()); version/archive times often use PHP time() (seconds).
  const toEpochMs = (timestamp: number): number =>
    timestamp > 1e12 ? timestamp : timestamp * 1000;

  const formatDate = (timestamp: number): string => {
    const date = new Date(toEpochMs(timestamp));
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatRelativeTime = (timestamp: number): string => {
    const diff = Math.floor((Date.now() - toEpochMs(timestamp)) / 1000);

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
  };

  if (!isOpen || typeof document === 'undefined' || modalSize.width === 0) return null;

  const headerTitle = categoryInfo ? categoryInfo.categoryName : (tileInfo?.title || tile?.title || 'Tile');
  const headerEmoji = categoryInfo ? '📂' : '🧩';
  const headerSubtitle = categoryInfo ? 'Category details & permissions' : 'Space metadata, ownership & access';

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tile-info-dialog-title"
        className={`absolute bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-slate-700 flex flex-col ${
          isDragging || isResizing ? 'will-change-transform' : ''
        }`}
        style={{
          left: modalPosition.x,
          top: modalPosition.y,
          width: modalSize.width,
          height: modalSize.height,
          transition: isDragging || isResizing ? 'none' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleDragStart}
          className={`shrink-0 z-10 border-b border-sky-100 dark:border-slate-700 bg-gradient-to-r from-sky-50 via-white to-indigo-50 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-950/40 px-5 sm:px-6 py-4 flex items-start justify-between gap-3 select-none cursor-move ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20 flex items-center justify-center text-xl shrink-0" aria-hidden="true">
              {headerEmoji}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-sky-700/80 dark:text-sky-300/80">
                {categoryInfo ? 'Category Information' : 'Tile Information'}
              </p>
              <h2 id="tile-info-dialog-title" className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                {headerTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{headerSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/80 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <FaTimes className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-5 sm:p-6 pb-10 overflow-y-auto">
          {categoryInfo ? (
            <CategoryInfoView categoryInfo={categoryInfo} formatDate={formatDate} formatRelativeTime={formatRelativeTime} />
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="animate-spin rounded-full h-9 w-9 border-2 border-sky-200 border-t-sky-600 dark:border-sky-900 dark:border-t-sky-400"></div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading tile details…</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4">
              <div className="text-3xl mb-2" aria-hidden="true">⚠️</div>
              <p className="text-rose-700 dark:text-rose-300 font-medium">{error}</p>
            </div>
          ) : tileInfo ? (
            <TileInfoView
              tileInfo={tileInfo}
              formatDate={formatDate}
              formatRelativeTime={formatRelativeTime}
              spaceShortUrl={spaceShortUrl}
              setSpaceShortUrl={setSpaceShortUrl}
              canRecycleShortUrl={tile?.canEdit === true}
              isAdmin={isAdmin}
              showUniqueVisitors={showUniqueVisitors}
            />
          ) : null}
        </div>

        {/* Bottom drag strip — reachable if the header is off-screen */}
        <div
          onMouseDown={handleDragStart}
          className={`absolute left-0 right-5 bottom-0 h-7 cursor-move flex items-center justify-center gap-1.5 select-none border-t border-slate-200/80 dark:border-slate-700/80 z-[5] ${
            isDragging
              ? 'bg-sky-100/90 dark:bg-sky-950/50'
              : 'bg-slate-50/95 dark:bg-slate-800/95 hover:bg-slate-100 dark:hover:bg-slate-700/80'
          }`}
          title="Drag to move"
          role="presentation"
        >
          <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Drag
          </span>
          <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
        </div>

        {/* Resize handle — overlay only; does not affect layout size */}
        <div
          onMouseDown={handleResizeStart}
          className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 rounded-br-2xl z-10 ${
            isResizing ? 'bg-sky-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
          }`}
          title="Resize"
          aria-label="Resize dialog"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-400 dark:text-slate-500" aria-hidden>
            <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>
    </div>,
    document.body
  );
};

const TileInfoView: React.FC<{
  tileInfo: TileInfo;
  formatDate: (ts: number) => string;
  formatRelativeTime: (ts: number) => string;
  spaceShortUrl?: string;
  setSpaceShortUrl?: (url: string) => void;
  canRecycleShortUrl?: boolean;
  isAdmin?: boolean;
  showUniqueVisitors?: boolean;
}> = ({ tileInfo, formatDate, formatRelativeTime, spaceShortUrl, setSpaceShortUrl, canRecycleShortUrl, isAdmin, showUniqueVisitors }) => {
  return (
    <div className="space-y-5">
      <SectionCard emoji="📋" title="Basic Information" accent="sky">
        <InfoRow label="Title" labelEmoji="🏷️">
          <span className="font-semibold">{tileInfo.title}</span>
        </InfoRow>
        <InfoRow label="ID" labelEmoji="🆔">
          <CopyableId value={tileInfo.tileId} />
        </InfoRow>
        {spaceShortUrl || canRecycleShortUrl ? (
          <InfoRow label="Short URL" labelEmoji="🔗">
            <div className="flex items-center gap-2 min-w-0">
              {spaceShortUrl ? <CopyableId value={spaceShortUrl} /> : <span className="text-xs text-slate-500">Not generated yet</span>}
              {canRecycleShortUrl ? (
                <ShortUrlActions
                  targetType="tile"
                  targetId={tileInfo.tileId}
                  shortUrl={spaceShortUrl}
                  canRecycle
                  compact
                  onRecycled={({ shortUrl }) => setSpaceShortUrl?.(shortUrl)}
                />
              ) : null}
            </div>
          </InfoRow>
        ) : null}
        <InfoRow label="Visibility" labelEmoji="👁️">
          <VisibilityBadge visibility={tileInfo.visibility} />
        </InfoRow>
        {tileInfo.sourceTab && (
          <InfoRow label="Source tab" labelEmoji="📑">
            <SourceTabBadge sourceTab={tileInfo.sourceTab} />
          </InfoRow>
        )}
      </SectionCard>

      <SectionCard emoji="👤" title="Ownership" accent="amber">
        {tileInfo.owner.userId ? (
          <>
            <InfoRow label="Owner" labelEmoji="✨">
              <span className="font-semibold">{tileInfo.owner.username || 'Unknown'}</span>
            </InfoRow>
            {tileInfo.owner.email && (
              <InfoRow label="Email" labelEmoji="📧">
                <span className="break-all">{tileInfo.owner.email}</span>
              </InfoRow>
            )}
            <InfoRow label="User ID" labelEmoji="🔑">
              <CopyableId value={String(tileInfo.owner.userUuid || tileInfo.owner.userId)} />
            </InfoRow>
          </>
        ) : (
          <div className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
            <span aria-hidden="true">📭</span> No owner assigned
          </div>
        )}
      </SectionCard>

      <SectionCard emoji="⏱️" title="Timestamps" accent="teal">
        <InfoRow label="Created" labelEmoji="🌱">
          <div>
            <div className="font-medium text-sm">{formatDate(tileInfo.createdAt)}</div>
            <div className="text-xs text-teal-700/80 dark:text-teal-300/80">{formatRelativeTime(tileInfo.createdAt)}</div>
          </div>
        </InfoRow>
        <InfoRow label="Last Modified" labelEmoji="✏️">
          <div>
            <div className="font-medium text-sm">{formatDate(tileInfo.lastModified)}</div>
            <div className="text-xs text-teal-700/80 dark:text-teal-300/80">{formatRelativeTime(tileInfo.lastModified)}</div>
          </div>
        </InfoRow>
        {tileInfo.archivedAt && (
          <InfoRow label="Archived" labelEmoji="📦">
            <div>
              <div className="font-medium text-sm">{formatDate(tileInfo.archivedAt)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(tileInfo.archivedAt)}</div>
            </div>
          </InfoRow>
        )}
        {tileInfo.deletedAt && (
          <InfoRow label="Deleted" labelEmoji="🗑️">
            <div>
              <div className="font-medium text-sm text-rose-700 dark:text-rose-300">{formatDate(tileInfo.deletedAt)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(tileInfo.deletedAt)}</div>
            </div>
          </InfoRow>
        )}
      </SectionCard>

      <SectionCard emoji="📈" title="Visitors" accent="rose">
        <InfoRow label="Total Hits" labelEmoji="👆" hint="all times this space was opened — the same person can count more than once">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
            {(tileInfo.stats?.hitCount ?? 0).toLocaleString()}
          </span>
        </InfoRow>
        {showUniqueVisitors !== false && typeof tileInfo.stats?.uniqueVisitors === 'number' && (
          <UniqueVisitorsRow
            tileId={tileInfo.tileId}
            count={tileInfo.stats.uniqueVisitors}
            isAdmin={!!isAdmin}
            formatDate={formatDate}
            formatRelativeTime={formatRelativeTime}
          />
        )}
      </SectionCard>

      <SectionCard emoji="🛡️" title="Your Permissions" accent="emerald">
        <InfoRow label="View" labelEmoji="👀">
          <StatusBadge allowed={tileInfo.permissions.canView} />
        </InfoRow>
        <InfoRow label="Edit" labelEmoji="🖊️">
          <StatusBadge allowed={tileInfo.permissions.canEdit} />
        </InfoRow>
        <InfoRow label="Delete" labelEmoji="🗑️">
          <StatusBadge allowed={tileInfo.permissions.canDelete} />
        </InfoRow>

        {tileInfo.granularPermissions && (
          <div className="mt-2 pt-3 border-t border-emerald-200/70 dark:border-emerald-900/50">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
              <span aria-hidden="true">🎛️</span> Granular permissions
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PermCheck ok={tileInfo.granularPermissions.canAddLinks} label="Add Links" />
              <PermCheck ok={tileInfo.granularPermissions.canAddSections} label="Add Sections" />
              <PermCheck ok={tileInfo.granularPermissions.canAddTabs} label="Add Tabs" />
              <PermCheck ok={tileInfo.granularPermissions.canEditLinks} label="Edit Links" />
              <PermCheck ok={tileInfo.granularPermissions.canDeleteLinks} label="Delete Links" />
              <PermCheck ok={tileInfo.granularPermissions.canDeleteSections} label="Delete Sections" />
              <PermCheck ok={tileInfo.granularPermissions.canDeleteTabs} label="Delete Tabs" />
              <PermCheck ok={tileInfo.granularPermissions.canChangeVisibility} label="Change Visibility" />
              <PermCheck ok={tileInfo.granularPermissions.canChangeBrowser} label="Change Browser" />
              <PermCheck ok={tileInfo.granularPermissions.canCloneTile} label="Clone Tile" />
              <PermCheck ok={tileInfo.granularPermissions.canViewTileInfo} label="Tile Card Info" />
              <PermCheck ok={tileInfo.granularPermissions.canEditTile} label="Edit Tile Settings" />
            </div>
          </div>
        )}
      </SectionCard>

      {tileInfo.tileAdmins && tileInfo.tileAdmins.length > 0 && (
        <SectionCard emoji="👥" title={`Tile Administrators (${tileInfo.tileAdmins.length})`} accent="violet">
          <div className="space-y-3">
            {tileInfo.tileAdmins.map((admin) => (
              <div key={admin.userId} className="rounded-xl bg-white/70 dark:bg-slate-950/35 border border-violet-100 dark:border-violet-900/40 p-3.5">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span aria-hidden="true">⭐</span>
                      {admin.username}
                    </div>
                    {admin.email && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {admin.email}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] px-2 py-1 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded-full font-semibold shrink-0">
                    Tile Admin
                  </div>
                </div>

                <div className="mb-3 pb-3 border-b border-violet-100 dark:border-violet-900/40">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Basic</div>
                  <div className="grid grid-cols-3 gap-2">
                    <PermCheck ok={admin.permissions.canView} label="View" />
                    <PermCheck ok={admin.permissions.canEdit} label="Edit" />
                    <PermCheck ok={admin.permissions.canDelete} label="Delete" />
                  </div>
                </div>

                {admin.permissions.canAddLinks !== undefined && (
                  <div>
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Granular</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <PermCheck ok={!!admin.permissions.canAddLinks} label="Add Links" />
                      <PermCheck ok={!!admin.permissions.canAddSections} label="Add Sections" />
                      <PermCheck ok={!!admin.permissions.canAddTabs} label="Add Tabs" />
                      <PermCheck ok={!!admin.permissions.canEditLinks} label="Edit Links" />
                      <PermCheck ok={!!admin.permissions.canDeleteLinks} label="Delete Links" />
                      <PermCheck ok={!!admin.permissions.canDeleteSections} label="Delete Sections" />
                      <PermCheck ok={!!admin.permissions.canDeleteTabs} label="Delete Tabs" />
                      <PermCheck ok={!!admin.permissions.canChangeVisibility} label="Change Visibility" />
                      <PermCheck ok={!!admin.permissions.canChangeBrowser} label="Change Browser" />
                      <PermCheck ok={!!admin.permissions.canCloneTile} label="Clone Tile" />
                      <PermCheck ok={!!admin.permissions.canViewTileInfo} label="Tile Card Info" />
                      <PermCheck ok={!!admin.permissions.canEditTile} label="Edit Tile Settings" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

const CategoryInfoView: React.FC<{
  categoryInfo: CategoryInfo;
  formatDate: (ts: number) => string;
  formatRelativeTime: (ts: number) => string;
}> = ({ categoryInfo, formatDate, formatRelativeTime }) => {
  const ownerCounts: Record<number, { username: string; count: number }> = {};
  let oldestTile: typeof categoryInfo.tiles[0] | null = null;
  let newestTile: typeof categoryInfo.tiles[0] | null = null;
  let totalCanView = 0;
  let totalCanEdit = 0;
  let totalCanDelete = 0;

  categoryInfo.tiles.forEach(tile => {
    if (tile.userId) {
      if (!ownerCounts[tile.userId]) {
        ownerCounts[tile.userId] = { username: `User ${tile.userId}`, count: 0 };
      }
      ownerCounts[tile.userId].count++;
    }

    if (!oldestTile || tile.createdAt < oldestTile.createdAt) {
      oldestTile = tile;
    }
    if (!newestTile || tile.createdAt > newestTile.createdAt) {
      newestTile = tile;
    }

    if (tile.canView) totalCanView++;
    if (tile.canEdit) totalCanEdit++;
    if (tile.canDelete) totalCanDelete++;
  });

  return (
    <div className="space-y-5">
      <SectionCard emoji="📂" title="Category Information" accent="indigo">
        <InfoRow label="Category Name" labelEmoji="🏷️">
          <span className="font-semibold">{categoryInfo.categoryName}</span>
        </InfoRow>
        <InfoRow label="Total Tiles" labelEmoji="🧱">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
            {categoryInfo.tileCount} tile{categoryInfo.tileCount !== 1 ? 's' : ''}
          </span>
        </InfoRow>
      </SectionCard>

      {categoryInfo.owner && (
        <SectionCard emoji="👤" title="Category Ownership" accent="amber">
          {categoryInfo.owner.userId ? (
            <>
              <InfoRow label="Owner" labelEmoji="✨">
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <span className="font-semibold">{categoryInfo.owner.username || `User ${categoryInfo.owner.userId}`}</span>
                  {categoryInfo.owner.isAdmin && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                      👑 Admin
                    </span>
                  )}
                </div>
              </InfoRow>
              {categoryInfo.owner.email && (
                <InfoRow label="Email" labelEmoji="📧">
                  <span className="break-all">{categoryInfo.owner.email}</span>
                </InfoRow>
              )}
              <InfoRow label="User ID" labelEmoji="🔑">
                <CopyableId value={String(categoryInfo.owner.userUuid || categoryInfo.owner.userId)} />
              </InfoRow>
              {categoryInfo.owner.isAdmin && (
                <div className="mt-1 pt-3 border-t border-amber-200/70 dark:border-amber-900/40">
                  <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-base" aria-hidden="true">ℹ️</span>
                    <span>This category was created by an administrator.</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
              <span aria-hidden="true">📭</span> No owner assigned
            </div>
          )}
        </SectionCard>
      )}

      {Object.keys(ownerCounts).length > 0 && (
        <SectionCard emoji="📊" title="Ownership Summary" accent="sky">
          {Object.entries(ownerCounts).map(([userId, info]) => (
            <InfoRow key={userId} label={`User ${userId}`} labelEmoji="👤">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                {info.count} tile{info.count !== 1 ? 's' : ''}
              </span>
            </InfoRow>
          ))}
        </SectionCard>
      )}

      {oldestTile && newestTile && (
        <SectionCard emoji="⏱️" title="Timestamps" accent="teal">
          <InfoRow label="Oldest Tile" labelEmoji="🕰️">
            <div>
              <div className="font-medium text-sm">{formatDate(oldestTile.createdAt)}</div>
              <div className="text-xs text-teal-700/80 dark:text-teal-300/80">{formatRelativeTime(oldestTile.createdAt)}</div>
            </div>
          </InfoRow>
          <InfoRow label="Newest Tile" labelEmoji="🆕">
            <div>
              <div className="font-medium text-sm">{formatDate(newestTile.createdAt)}</div>
              <div className="text-xs text-teal-700/80 dark:text-teal-300/80">{formatRelativeTime(newestTile.createdAt)}</div>
            </div>
          </InfoRow>
        </SectionCard>
      )}

      <SectionCard emoji="🛡️" title="Your Permissions Summary" accent="emerald">
        <InfoRow label="Can View" labelEmoji="👀">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{totalCanView} / {categoryInfo.tileCount}</span>
        </InfoRow>
        <InfoRow label="Can Edit" labelEmoji="🖊️">
          <span className="font-semibold text-sky-700 dark:text-sky-300">{totalCanEdit} / {categoryInfo.tileCount}</span>
        </InfoRow>
        <InfoRow label="Can Delete" labelEmoji="🗑️">
          <span className="font-semibold text-rose-700 dark:text-rose-300">{totalCanDelete} / {categoryInfo.tileCount}</span>
        </InfoRow>
      </SectionCard>
    </div>
  );
};
