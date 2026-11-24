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
import { SpaceModalHeader } from './SpaceFormChrome';

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
    if (!modalRef.current) return;
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
            className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
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
          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{label}</div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate" title={link.url}>
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
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100060 }}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        style={{ zIndex: 100059 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Delete duplicate links"
        className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-6 pb-8 relative shadow-2xl overflow-hidden flex flex-col ${isDragging ? 'cursor-move' : ''}`}
        style={{
          zIndex: 100060,
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${dialogSize.width}px`,
          height: `${dialogSize.height}px`,
          maxWidth: '90vw',
          maxHeight: '90vh',
          minWidth: `${MIN_SIZE.width}px`,
          minHeight: `${MIN_SIZE.height}px`,
          visibility: isPositionReady ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpaceModalHeader
          emoji="🧹"
          eyebrow="Duplicates"
          title="Delete duplicate links"
          subtitle={
            sectionTitle
              ? `Section: ${sectionTitle} — same URL counted as a duplicate`
              : 'Links with the same URL in this section are grouped below'
          }
          onClose={onClose}
          onMouseDown={handleDragStart}
        />

        <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3">
          {groups.length === 0 ? (
            <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800/50 overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-3.5 py-3 bg-sky-50 dark:bg-sky-950/35">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg bg-sky-100 dark:bg-sky-900/50" aria-hidden>
                  ✨
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">No duplicate URLs</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Every link in this section has a unique URL.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/35 px-3.5 py-3">
                <div className="text-sm text-sky-900 dark:text-sky-100">
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
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                  >
                    Select all extras
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {groups.map((g: DuplicateLinkGroup) => (
                  <section
                    key={g.key}
                    className="rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 px-3.5 py-3 bg-slate-50 dark:bg-slate-900/50">
                      <div className="min-w-0">
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Matching URL
                        </h3>
                        <p className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate" title={g.url}>
                          {g.url}
                        </p>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">
                        {1 + g.duplicates.length} copies
                      </span>
                    </div>
                    <div className="p-3.5 space-y-2 border-t border-slate-100 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40">
                      {renderLinkRow(g.keep, { kind: 'keep' })}
                      {g.duplicates.map((d) =>
                        renderLinkRow(d, {
                          kind: 'dup',
                          checked: selectedIds.has(d.id),
                          onToggle: (on) => toggleId(d.id, on),
                        })
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}

          {error && (
            <div
              className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 flex items-start gap-2"
              role="alert"
            >
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-3 mt-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
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
                className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-amber-500/30"
                title="Keep the first of each URL and delete all other copies"
              >
                {deleting ? 'Deleting…' : `Delete all extras (${removableTotal})`}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting || selectedIds.size === 0}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-rose-500/30"
              >
                {deleting ? 'Deleting…' : `Delete selected (${selectedIds.size})`}
              </button>
            </>
          )}
        </div>

        <div
          onMouseDown={handleDragStart}
          className={`absolute left-0 right-6 bottom-0 h-7 cursor-move flex items-center justify-center gap-1.5 select-none border-t border-slate-200/80 dark:border-slate-700/80 ${
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
        <div
          onMouseDown={(e) => handleResizeStart(e, 'se')}
          className={`absolute bottom-0 right-0 w-6 h-7 cursor-nwse-resize flex items-end justify-end ${isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
          title="Resize"
          aria-hidden
        >
          <div className="w-4 h-4 relative mb-0.5 mr-0.5">
            <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-br-lg" />
            <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-slate-400 dark:border-slate-500 rounded-br" />
          </div>
        </div>
        <div
          onMouseDown={(e) => handleResizeStart(e, 's')}
          className="absolute bottom-0 left-0 right-6 h-2 cursor-ns-resize z-10"
        />
        <div
          onMouseDown={(e) => handleResizeStart(e, 'e')}
          className="absolute top-0 right-0 bottom-7 w-2 cursor-ew-resize z-10"
        />
      </div>
    </div>,
    document.body
  );
};

export default DeleteDuplicateLinksDialog;
