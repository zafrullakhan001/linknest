import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Link } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import {
  countRemovableDuplicates,
  findDuplicateLinkGroups,
  plainLinkLabel,
  type DuplicateLinkGroup,
} from '../utils/sectionDuplicateLinks';
import { getDisplayUrl } from '../utils/urlDisplay';

export type DeleteDuplicateLinksDialogProps = {
  sectionTitle?: string;
  links: Link[];
  onClose: () => void;
  /** Called with link IDs to remove from the section */
  onDelete: (linkIds: string[]) => void | Promise<void>;
};

const DEFAULT_SIZE = { width: 900, height: 640 };
const MIN_SIZE = { width: 560, height: 420 };

function getCenteredPosition(width: number, height: number) {
  if (typeof window === 'undefined') {
    return { x: 16, y: 16 };
  }
  return {
    x: Math.max(16, (window.innerWidth - width) / 2),
    y: Math.max(16, (window.innerHeight - height) / 2),
  };
}

export const DeleteDuplicateLinksDialog: React.FC<DeleteDuplicateLinksDialogProps> = ({
  sectionTitle,
  links,
  onClose,
  onDelete,
}) => {
  const groups = useMemo(() => findDuplicateLinkGroups(links), [links]);
  const removableTotal = useMemo(() => countRemovableDuplicates(groups), [groups]);

  /** Selected duplicate link IDs (never the keep row unless user explicitly swaps — we only select duplicates). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const g of findDuplicateLinkGroups(links)) {
      for (const d of g.duplicates) ids.add(d.id);
    }
    return ids;
  });

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState(() =>
    getCenteredPosition(DEFAULT_SIZE.width, DEFAULT_SIZE.height)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const [isPositionReady, setIsPositionReady] = useState(false);

  const [dialogSize, setDialogSize] = useState(DEFAULT_SIZE);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    handle: '',
  });

  useEscapeToClose(true, onClose);

  useLayoutEffect(() => {
    if (!modalRef.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    setPosition(getCenteredPosition(rect.width, rect.height));
    setIsPositionReady(true);
  }, []);

  // Re-sync selection when links prop changes (e.g. after partial delete + reopen)
  useEffect(() => {
    const next = new Set<string>();
    for (const g of groups) {
      for (const d of g.duplicates) next.add(d.id);
    }
    setSelectedIds(next);
  }, [groups]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!modalRef.current || !(e.target as HTMLElement).closest('[data-drag-handle]')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = modalRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, handle: string) => {
    if (!modalRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = modalRef.current.getBoundingClientRect();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      handle,
    });
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      const maxWidth = window.innerWidth - position.x - 16;
      const maxHeight = window.innerHeight - position.y - 16;
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      if (resizeStart.handle.includes('e')) newWidth = resizeStart.width + deltaX;
      if (resizeStart.handle.includes('s')) newHeight = resizeStart.height + deltaY;
      setDialogSize({
        width: Math.max(MIN_SIZE.width, Math.min(newWidth, maxWidth)),
        height: Math.max(MIN_SIZE.height, Math.min(newHeight, maxHeight)),
      });
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeStart, position.x, position.y]);

  const toggleId = (id: string, on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllDuplicates = () => {
    const next = new Set<string>();
    for (const g of groups) {
      for (const d of g.duplicates) next.add(d.id);
    }
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runDelete = async (ids: string[]) => {
    if (ids.length === 0) {
      setError('Select at least one duplicate to delete.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete(ids);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete duplicates');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = () => runDelete([...selectedIds]);

  const handleDeleteAllAutomatically = () => {
    const ids: string[] = [];
    for (const g of groups) {
      for (const d of g.duplicates) ids.push(d.id);
    }
    void runDelete(ids);
  };

  const renderLinkRow = (
    link: Link,
    opts: { kind: 'keep' | 'dup'; checked?: boolean; onToggle?: (on: boolean) => void }
  ) => {
    const label = plainLinkLabel(link.label) || '(untitled)';
    return (
      <div
        key={link.id}
        className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${
          opts.kind === 'keep'
            ? 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
            : 'border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/15'
        }`}
      >
        {opts.kind === 'dup' ? (
          <input
            type="checkbox"
            className="mt-1 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
            checked={!!opts.checked}
            onChange={(e) => opts.onToggle?.(e.target.checked)}
            aria-label={`Select duplicate ${label}`}
          />
        ) : (
          <span
            className="mt-1 inline-flex w-4 h-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold shrink-0"
            title="Kept"
          >
            ✓
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{label}</div>
          <div className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate" title={link.url}>
            {getDisplayUrl(link.url, 64) || link.url}
          </div>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
            opts.kind === 'keep'
              ? 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200'
              : 'bg-amber-200/80 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
          }`}
        >
          {opts.kind === 'keep' ? 'Keep' : 'Duplicate'}
        </span>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000]" style={{ backgroundColor: 'transparent' }}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dup-links-title"
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-emerald-100 dark:border-[#333] overflow-hidden flex flex-col relative"
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${dialogSize.width}px`,
          height: `${dialogSize.height}px`,
          maxWidth: '95vw',
          maxHeight: '95vh',
          minWidth: `${MIN_SIZE.width}px`,
          minHeight: `${MIN_SIZE.height}px`,
          visibility: isPositionReady ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-drag-handle
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          className="px-6 py-4 border-b border-emerald-200/80 dark:border-[#333] flex items-center justify-between bg-gradient-to-r from-emerald-100/90 via-teal-100/70 to-cyan-100/60 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 select-none [&_*:not(button):not(svg):not(path)]:cursor-[inherit]"
          onMouseDown={handleDragStart}
        >
          <div className="min-w-0 flex-1 pr-4">
            <h2
              id="delete-dup-links-title"
              className="text-lg font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-2"
            >
              <span aria-hidden="true">🧹</span>
              Delete duplicate links
            </h2>
            <p className="text-sm text-emerald-900/75 dark:text-emerald-200/70 mt-0.5">
              {sectionTitle
                ? `Section: ${sectionTitle} — same URL counted as a duplicate.`
                : 'Links with the same URL in this section are grouped below.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-emerald-900/70 dark:text-emerald-200/70 text-xs flex items-center gap-1.5 hidden sm:flex rounded-lg bg-white/50 dark:bg-black/20 px-2 py-1 border border-emerald-200/60 dark:border-emerald-800/40">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
              Drag · Resize corner
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-emerald-200/60 dark:hover:bg-[#333] text-emerald-900 dark:text-emerald-200 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50/50 to-white dark:from-[#1a1a1a] dark:to-[#1e1e1e]">
          {groups.length === 0 ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-4 py-8 text-center shadow-sm">
              <div className="text-2xl mb-2" aria-hidden="true">
                ✨
              </div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                No duplicate URLs in this section
              </p>
              <p className="text-xs text-emerald-800/70 dark:text-emerald-200/60 mt-1">
                Every link has a unique URL.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20 px-4 py-3">
                <div className="text-sm text-sky-900 dark:text-sky-100">
                  <span aria-hidden="true">📌 </span>
                  <strong>{groups.length}</strong> duplicate group
                  {groups.length === 1 ? '' : 's'} ·{' '}
                  <strong>{removableTotal}</strong> extra link
                  {removableTotal === 1 ? '' : 's'} ·{' '}
                  <strong>{selectedIds.size}</strong> selected
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllDuplicates}
                    className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-black/20 border border-sky-200/80 dark:border-sky-800/40 text-sky-800 dark:text-sky-200"
                  >
                    Select all extras
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-black/20 border border-sky-200/80 dark:border-sky-800/40 text-sky-800 dark:text-sky-200"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {groups.map((g: DuplicateLinkGroup) => (
                  <section
                    key={g.key}
                    className="rounded-xl border border-emerald-100 dark:border-[#333] bg-white/80 dark:bg-[#252525] p-4 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-emerald-100/80 dark:border-[#333]">
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80 dark:text-emerald-200/70">
                          Matching URL
                        </h3>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate" title={g.url}>
                          {g.url}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">
                        {1 + g.duplicates.length} copies
                      </span>
                    </div>
                    {renderLinkRow(g.keep, { kind: 'keep' })}
                    {g.duplicates.map((d) =>
                      renderLinkRow(d, {
                        kind: 'dup',
                        checked: selectedIds.has(d.id),
                        onToggle: (on) => toggleId(d.id, on),
                      })
                    )}
                  </section>
                ))}
              </div>
            </>
          )}

          {error && (
            <div
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300"
              role="alert"
            >
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-emerald-100 dark:border-[#333] bg-gradient-to-r from-slate-50 via-emerald-50/40 to-teal-50/30 dark:from-[#252525] dark:via-emerald-950/20 dark:to-teal-950/10 flex flex-wrap justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-[#444] text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-[#333] transition-colors"
            disabled={deleting}
          >
            Cancel
          </button>
          {groups.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDeleteAllAutomatically}
                disabled={deleting || removableTotal === 0}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
                title="Keep the first of each URL and delete all other copies"
              >
                {deleting ? '⏳ Deleting…' : `⚡ Delete all extras (${removableTotal})`}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting || selectedIds.size === 0}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
              >
                {deleting
                  ? '⏳ Deleting…'
                  : `🗑️ Delete selected (${selectedIds.size})`}
              </button>
            </>
          )}
        </div>

        <div
          onMouseDown={(e) => handleResizeStart(e, 'se')}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 rounded-br-2xl hover:bg-emerald-200/40 dark:hover:bg-emerald-800/30"
          title="Resize"
        />
        <div
          onMouseDown={(e) => handleResizeStart(e, 's')}
          className="absolute bottom-0 left-0 right-4 h-2 cursor-ns-resize z-10"
        />
        <div
          onMouseDown={(e) => handleResizeStart(e, 'e')}
          className="absolute top-0 right-0 bottom-4 w-2 cursor-ew-resize z-10"
        />
      </div>
    </div>,
    document.body
  );
};

export default DeleteDuplicateLinksDialog;
