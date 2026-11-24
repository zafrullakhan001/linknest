import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TilePresenceViewer } from '../services/tilePresenceService';

const AVATAR_COLORS = [
  'bg-sky-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
  'bg-orange-500',
  'bg-cyan-600',
] as const;

const MAX_STACK = 5;

function viewerLabel(viewer: TilePresenceViewer): string {
  return viewer.displayName || viewer.username;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return (parts[0]?.[0] || '?').toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const TilePresence: React.FC<{
  viewers: TilePresenceViewer[];
  currentUserId?: number | null;
  variant?: 'onDark' | 'onLight';
  className?: string;
}> = ({ viewers, currentUserId, variant = 'onLight', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const updateMenuPos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 288;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setMenuPos({ top: rect.bottom + 8, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onMove = () => updateMenuPos();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  if (viewers.length === 0) return null;

  const others = viewers.filter((v) => v.userId !== currentUserId);
  const self = viewers.find((v) => v.userId === currentUserId) || null;
  const stack = viewers.slice(0, MAX_STACK);
  const overflow = viewers.length - stack.length;
  const editors = viewers.filter((v) => v.mode === 'editing').length;
  const onDark = variant === 'onDark';
  const alone = others.length === 0 && !!self;

  const summary = alone
    ? 'You are viewing this space'
    : others.length === 1
      ? `${viewerLabel(others[0])} is also here`
      : `${others.length} others here`;

  const pillClass = onDark
    ? 'bg-white/15 hover:bg-white/25 text-white border-white/20 focus-visible:ring-white/70'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border-slate-200 dark:border-slate-600 focus-visible:ring-brand-400';

  return (
    <div ref={wrapRef} className={`relative inline-flex max-w-full ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 border shadow-sm backdrop-blur-sm transition focus:outline-none focus-visible:ring-2 ${pillClass}`}
        aria-expanded={open}
        aria-controls={listId}
        title={`${summary}. Click to see who.`}
      >
        <span className="flex items-center -space-x-1.5" aria-hidden="true">
          {stack.map((viewer) => (
            <span
              key={viewer.userId}
              className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 overflow-hidden ${
                onDark ? 'ring-white/30' : 'ring-white dark:ring-slate-800'
              } ${avatarColor(viewerLabel(viewer))}`}
            >
              {initials(viewerLabel(viewer))}
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-white/80" />
            </span>
          ))}
          {overflow > 0 && (
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ${
                onDark
                  ? 'bg-white/20 text-white ring-white/30'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100 ring-white dark:ring-slate-800'
              }`}
            >
              +{overflow}
            </span>
          )}
        </span>
        <span className="text-xs font-medium whitespace-nowrap">
          {alone
            ? 'Just you'
            : `${viewers.length} here${editors > 0 ? ` · ${editors} editing` : ''}`}
        </span>
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          id={listId}
          role="dialog"
          aria-label="People in this space"
          style={{ top: menuPos.top, left: menuPos.left }}
          className={`fixed z-[80] w-72 max-w-[calc(100vw-1rem)] rounded-xl border shadow-xl p-2 ${
            onDark
              ? 'bg-slate-900 border-white/15 text-white'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
          }`}
        >
          <div className={`px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
            onDark ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'
          }`}>
            {alone ? 'In this space' : 'Also in this space'}
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {viewers.map((viewer) => {
              const isYou = viewer.userId === currentUserId;
              return (
                <li key={viewer.userId} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                  <span
                    className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white ${avatarColor(viewerLabel(viewer))}`}
                  >
                    {initials(viewerLabel(viewer))}
                    <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white/80" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate text-sm font-medium">
                        {viewerLabel(viewer)}
                        {isYou ? ' (you)' : ''}
                      </span>
                      {viewer.isAdmin && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                          Admin
                        </span>
                      )}
                    </div>
                    {viewer.displayName && viewer.displayName !== viewer.username && (
                      <div className={`text-[11px] truncate ${onDark ? 'text-white/55' : 'text-slate-500 dark:text-slate-400'}`}>
                        {viewer.username}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 text-[11px] font-medium ${
                    viewer.mode === 'editing'
                      ? 'text-amber-300'
                      : onDark ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {viewer.mode === 'editing' ? 'Editing' : 'Viewing'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};
