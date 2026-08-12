import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SSH_CONNECTION_COLORS,
  normalizeConnectionProtocol,
  normalizeSshCategory,
  normalizeSshColor,
  normalizeSshSortOrder,
  type SavedSshConnection,
} from '../services/sshConnectionService';
import { parseAutoTargetUrl } from '../services/sshGatewayService';

export type SshListViewMode = 'cards' | 'compact';
export type SshCategoryMetaMap = Record<string, { color: string }>;

const UNCATEGORIZED_KEY = '';
const UNCATEGORIZED_LABEL = 'Uncategorized';
const CAT_HDR_PREFIX = 'cathdr:';
const DEFAULT_CATEGORY_COLOR = '#64748b';

function categoryKey(raw: unknown): string {
  return normalizeSshCategory(raw);
}

function categoryLabel(key: string): string {
  return key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : key;
}

function catHdrId(cat: string): string {
  return `${CAT_HDR_PREFIX}${cat || '__uncategorized__'}`;
}

function parseCatHdr(id: string): string | null {
  if (!id.startsWith(CAT_HDR_PREFIX)) return null;
  const raw = id.slice(CAT_HDR_PREFIX.length);
  return raw === '__uncategorized__' ? UNCATEGORIZED_KEY : raw;
}

export function categoryAccentColor(cat: string, meta: SshCategoryMetaMap | undefined): string {
  const key = categoryKey(cat);
  const fromMeta = meta?.[key]?.color;
  if (fromMeta) return normalizeSshColor(fromMeta);
  if (key === UNCATEGORIZED_KEY) return DEFAULT_CATEGORY_COLOR;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return SSH_CONNECTION_COLORS[hash % SSH_CONNECTION_COLORS.length];
}

function hostLine(c: SavedSshConnection): string {
  const a = parseAutoTargetUrl(c.wsUrl);
  return a ? `${a.username}@${a.host}:${a.port}` : c.wsUrl;
}

function sortConnections(list: SavedSshConnection[]): SavedSshConnection[] {
  return [...list].sort((a, b) => {
    const so = normalizeSshSortOrder(a.sortOrder) - normalizeSshSortOrder(b.sortOrder);
    if (so !== 0) return so;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function reindexCategory(
  list: SavedSshConnection[],
  category: string,
  orderedIds: string[]
): SavedSshConnection[] {
  const cat = categoryKey(category);
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  return list.map((c) => {
    if (categoryKey(c.category) !== cat) return c;
    const idx = orderMap.get(c.id);
    if (idx === undefined) return c;
    return { ...c, category: cat, sortOrder: idx };
  });
}

function applyCategoryOrders(
  list: SavedSshConnection[],
  byCategory: Record<string, string[]>
): SavedSshConnection[] {
  let next = list;
  for (const [cat, ids] of Object.entries(byCategory)) {
    next = reindexCategory(next, cat, ids);
  }
  return next;
}

interface SortableConnectionProps {
  connection: SavedSshConnection;
  view: SshListViewMode;
  active: boolean;
  isLive: boolean;
  liveCount: number;
  canDisconnect: boolean;
  maxReached: boolean;
  sshLink: string | null;
  dragDisabled: boolean;
  showSettings: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onClone: () => void;
  onCopySsh: () => void;
  onDelete: () => void;
  onSettings: () => void;
}

const SortableConnectionCard: React.FC<SortableConnectionProps> = ({
  connection: c,
  view,
  active,
  isLive,
  liveCount,
  canDisconnect,
  maxReached,
  sshLink,
  dragDisabled,
  showSettings,
  selected,
  onToggleSelect,
  onConnect,
  onDisconnect,
  onEdit,
  onClone,
  onCopySsh,
  onDelete,
  onSettings,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
    disabled: dragDisabled,
    data: { type: 'connection', category: categoryKey(c.category) },
  });
  const color = normalizeSshColor(c.color);
  const isRdp = normalizeConnectionProtocol(c.protocol) === 'rdp';
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const dragHandle = (
    <button
      type="button"
      className={`shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 touch-none ${
        dragDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      } ${view === 'compact' ? 'h-6 w-5' : 'h-7 w-6'}`}
      title={dragDisabled ? 'Clear filter to rearrange' : 'Drag to reorder'}
      aria-label="Drag to reorder"
      disabled={dragDisabled}
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm8-12a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
    </button>
  );

  const selectCheckbox = (
    <input
      type="checkbox"
      checked={selected}
      onChange={(e) => {
        e.stopPropagation();
        onToggleSelect();
      }}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
      title={selected ? `Deselect ${c.name}` : `Select ${c.name}`}
      aria-label={selected ? `Deselect ${c.name}` : `Select ${c.name}`}
    />
  );

  const badges = (
    <>
      <span
        className={`shrink-0 px-1 py-0 rounded text-[9px] font-semibold uppercase tracking-wide ${
          isRdp
            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
        }`}
      >
        {isRdp ? 'RDP' : 'SSH'}
      </span>
      {isLive && (
        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live{liveCount > 1 ? ` · ${liveCount}` : ''}
        </span>
      )}
    </>
  );

  const btnSm =
    'inline-flex items-center justify-center h-7 w-7 rounded-md border shrink-0';

  const sessionButton = isLive ? (
    <button
      type="button"
      onClick={onDisconnect}
      disabled={!canDisconnect}
      className={
        view === 'compact'
          ? 'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold shadow-sm disabled:opacity-40 shrink-0'
          : 'inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold shadow-sm disabled:opacity-40 shrink-0'
      }
      title={`Disconnect ${c.name}`}
      aria-label={`Disconnect ${c.name}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={view === 'compact' ? 'w-4 h-4' : 'w-3.5 h-3.5'} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6M15 9l-6 6" />
      </svg>
      <span>Disconnect</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={onConnect}
      disabled={maxReached}
      className={
        view === 'compact'
          ? 'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-semibold shadow-sm disabled:opacity-40 shrink-0'
          : 'inline-flex items-center justify-center h-7 w-7 rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 shrink-0'
      }
      title={maxReached ? 'Maximum sessions reached' : `Connect to ${c.name}`}
      aria-label={`Connect to ${c.name}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={view === 'compact' ? 'w-4 h-4' : 'w-3.5 h-3.5'}
        aria-hidden
      >
        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
      </svg>
      {view === 'compact' && <span>Connect</span>}
    </button>
  );

  const smallActions = (
    <>
      <button
        type="button"
        onClick={onEdit}
        className={`${btnSm} border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700`}
        title={`Edit ${c.name}`}
        aria-label={`Edit ${c.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
        </svg>
      </button>
      {sshLink && (
        <button
          type="button"
          onClick={onCopySsh}
          className="inline-flex items-center justify-center h-7 min-w-[2.1rem] px-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white shadow-sm shrink-0"
          title={`Copy ssh:// URL for ${c.name}`}
          aria-label={`Copy ssh:// for ${c.name}`}
        >
          <span className="text-[9px] font-bold tracking-wide leading-none">SSH</span>
        </button>
      )}
      <button
        type="button"
        onClick={onClone}
        className={`${btnSm} border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700`}
        title={`Clone ${c.name}`}
        aria-label={`Clone ${c.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6.75A2.25 2.25 0 0014.25 4.5h-7.5A2.25 2.25 0 004.5 6.75v7.5A2.25 2.25 0 006.75 16.5h1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75h7.5A2.25 2.25 0 0119.5 12v7.5a2.25 2.25 0 01-2.25 2.25h-7.5A2.25 2.25 0 017.5 19.5V12a2.25 2.25 0 012.25-2.25z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`${btnSm} border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
        title={`Delete ${c.name}`}
        aria-label={`Delete ${c.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onSettings}
        className={`${btnSm} ml-auto transition-colors ${
          showSettings && active
            ? 'bg-orange-500 border-orange-600 text-white shadow-sm shadow-orange-500/30'
            : 'border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40'
        }`}
        title={`Settings for ${c.name}`}
        aria-label={`Settings for ${c.name}`}
        aria-pressed={showSettings && active}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </>
  );

  if (view === 'compact') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`rounded-md border overflow-hidden ${
          active
            ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0 py-1 pl-0.5 pr-1.5">
          <div className="w-1 self-stretch rounded-sm shrink-0" style={{ backgroundColor: color }} />
          {dragHandle}
          {selectCheckbox}
          <button type="button" className="flex-1 min-w-0 text-left py-0.5" onClick={onEdit} title={c.name}>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
              {badges}
            </div>
            <p className="text-[9px] font-mono text-slate-400 truncate">{hostLine(c)}</p>
          </button>
        </div>
        <div className="px-1.5 pb-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {sessionButton}
            {smallActions}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border overflow-hidden transition-colors ${
        active
          ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
      }`}
    >
      <div className="flex min-w-0">
        <div className="w-1.5 shrink-0 self-stretch" style={{ backgroundColor: color }} title={color} />
        <div className="flex-1 min-w-0 p-2">
          <div className="flex items-start gap-0.5">
            {dragHandle}
            {selectCheckbox}
            <button type="button" className="flex-1 min-w-0 text-left" onClick={onEdit} title={`Edit ${c.name}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                {badges}
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{hostLine(c)}</p>
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
          </div>

          {!isRdp && sshLink && (
            <p className="mt-1.5 text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate" title={sshLink}>
              {sshLink}
            </p>
          )}

          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {sessionButton}
            {smallActions}
          </div>
        </div>
      </div>
    </div>
  );
};

const CategoryDropZone: React.FC<{
  category: string;
  children: React.ReactNode;
}> = ({ category, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `cat:${category || '__uncategorized__'}`,
    data: { type: 'category', category },
  });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-1 min-h-[8px] rounded-md ${isOver ? 'ring-1 ring-brand-400 bg-brand-50/40 dark:bg-brand-900/10' : ''}`}
    >
      {children}
    </div>
  );
};

const SortableCategorySection: React.FC<{
  category: string;
  accent: string;
  itemCount: number;
  collapsed: boolean;
  filterActive: boolean;
  canRename: boolean;
  selectedCount: number;
  allSelected: boolean;
  spaceSelected: boolean;
  colorPickerOpen: boolean;
  renaming: boolean;
  renameDraft: string;
  onToggleCollapse: () => void;
  onToggleSpaceSelect: () => void;
  onToggleColorPicker: () => void;
  onPickColor: (color: string) => void;
  onStartRename: () => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleSelectAll: () => void;
  onRunAll: () => void;
  onRunSelected: () => void;
  onCloneCategory: () => void;
  cloningCategory?: boolean;
  children: React.ReactNode;
}> = ({
  category,
  accent,
  itemCount,
  collapsed,
  filterActive,
  canRename,
  selectedCount,
  allSelected,
  spaceSelected,
  colorPickerOpen,
  renaming,
  renameDraft,
  onToggleCollapse,
  onToggleSpaceSelect,
  onToggleColorPicker,
  onPickColor,
  onStartRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onToggleSelectAll,
  onRunAll,
  onRunSelected,
  onCloneCategory,
  cloningCategory = false,
  children,
}) => {
  const sortable = useSortable({
    id: catHdrId(category),
    disabled: category === UNCATEGORIZED_KEY || filterActive,
    data: { type: 'category-header', category },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 overflow-hidden"
    >
      <div
        className="bg-slate-100/90 dark:bg-slate-900/60 border-l-[3px]"
        style={{ borderLeftColor: accent }}
      >
        <div className="flex items-center gap-1 px-1.5 py-1 min-w-0">
          <button
            type="button"
            className={`shrink-0 inline-flex items-center justify-center h-6 w-5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 touch-none ${
              category === UNCATEGORIZED_KEY || filterActive
                ? 'opacity-30 cursor-not-allowed'
                : 'cursor-grab active:cursor-grabbing'
            }`}
            title={
              category === UNCATEGORIZED_KEY
                ? 'Uncategorized stays at the top'
                : filterActive
                  ? 'Clear filter to rearrange categories'
                  : 'Drag to reorder category'
            }
            aria-label="Reorder category"
            disabled={category === UNCATEGORIZED_KEY || filterActive}
            {...sortable.attributes}
            {...sortable.listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm8-12a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleColorPicker();
              }}
              className="h-4 w-4 rounded-full border border-white/80 dark:border-slate-700 shadow-sm ring-1 ring-black/10"
              style={{ backgroundColor: accent }}
              title="Category color"
              aria-label="Change category color"
              aria-expanded={colorPickerOpen}
            />
            {colorPickerOpen && (
              <div
                className="absolute left-0 top-5 z-30 p-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg grid grid-cols-4 gap-1 w-[104px]"
                onClick={(e) => e.stopPropagation()}
              >
                {SSH_CONNECTION_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => onPickColor(swatch)}
                    className={`h-5 w-5 rounded-full border ${
                      accent.toLowerCase() === swatch.toLowerCase()
                        ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-slate-200'
                        : 'border-black/10'
                    }`}
                    style={{ backgroundColor: swatch }}
                    title={swatch}
                    aria-label={`Set color ${swatch}`}
                  />
                ))}
              </div>
            )}
          </div>

          <input
            type="checkbox"
            checked={spaceSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSpaceSelect();
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 cursor-pointer"
            title="Select category to create a private space"
            aria-label={`Select category ${categoryLabel(category)} for private space`}
          />

          {renaming ? (
            <form
              className="flex-1 min-w-0 flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                onCommitRename();
              }}
            >
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => onRenameDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelRename();
                  }
                }}
                className="flex-1 min-w-0 h-6 px-1.5 text-[11px] rounded border border-brand-400 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                maxLength={64}
                aria-label="Rename category"
              />
              <button
                type="submit"
                className="h-6 px-1.5 text-[10px] font-semibold rounded bg-brand-600 text-white"
              >
                Save
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex-1 min-w-0 flex items-center gap-1 text-left py-0.5"
              aria-expanded={!collapsed}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-3 h-3 text-slate-500 transition-transform shrink-0 ${collapsed ? '' : 'rotate-90'}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                {categoryLabel(category)}
              </span>
              <span className="ml-auto text-[10px] tabular-nums text-slate-400 shrink-0">{itemCount}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 px-1.5 pb-1.5 flex-wrap">
          <label className="inline-flex items-center gap-1 h-6 px-1 rounded border border-slate-200 dark:border-slate-600 text-[9px] text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-white/70 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              checked={allSelected && itemCount > 0}
              disabled={itemCount === 0}
              onChange={onToggleSelectAll}
              className="h-3 w-3 rounded border-slate-300 text-brand-600"
            />
            All
          </label>
          <button
            type="button"
            onClick={onRunAll}
            disabled={itemCount === 0}
            className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-[9px] font-semibold disabled:opacity-40"
            title="Connect all in this category"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3" aria-hidden>
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Run all
          </button>
          <button
            type="button"
            onClick={onRunSelected}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded-md border border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 text-[9px] font-semibold hover:bg-brand-50 dark:hover:bg-brand-950/40 disabled:opacity-40"
            title="Connect selected in this category"
          >
            Run selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
          {canRename && !renaming && (
            <button
              type="button"
              onClick={onStartRename}
              className="inline-flex items-center justify-center h-6 w-6 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-white dark:hover:bg-slate-800"
              title="Rename category"
              aria-label="Rename category"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onCloneCategory}
            disabled={cloningCategory}
            className="inline-flex items-center justify-center h-6 w-6 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
            title={`Clone category “${categoryLabel(category)}” and all its connections`}
            aria-label={`Clone category ${categoryLabel(category)}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6.75A2.25 2.25 0 0014.25 4.5h-7.5A2.25 2.25 0 004.5 6.75v7.5A2.25 2.25 0 006.75 16.5h1.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75h7.5A2.25 2.25 0 0119.5 12v7.5a2.25 2.25 0 01-2.25 2.25h-7.5A2.25 2.25 0 017.5 19.5V12a2.25 2.25 0 012.25-2.25z" />
            </svg>
          </button>
        </div>
      </div>
      {!collapsed && <div className="p-1">{children}</div>}
    </div>
  );
};

export interface SshConnectionSidebarListProps {
  connections: SavedSshConnection[];
  filteredConnections: SavedSshConnection[];
  view: SshListViewMode;
  activeConnectionId: string | null;
  showSettings: boolean;
  maxSshTabs: number;
  tabsCount: number;
  filterActive: boolean;
  categoryOrder: string[];
  categoryMeta: SshCategoryMetaMap;
  collapsedCategories: Record<string, boolean>;
  onToggleCategory: (category: string) => void;
  onCategoryOrderChange: (next: string[]) => void;
  onCategoryColorChange: (category: string, color: string) => void;
  onCategoryRename: (from: string, to: string) => void;
  onConnectMany: (list: SavedSshConnection[]) => void;
  canCreatePrivateSpace?: boolean;
  creatingPrivateSpace?: boolean;
  cloningCategory?: boolean;
  onCloneCategory: (category: string) => void;
  onCreatePrivateSpace: (categories: string[], layout: 'sections' | 'tabs') => void;
  /** Optimistic local update while dragging */
  onConnectionsChange: (next: SavedSshConnection[]) => void;
  /** Persist category/sort after a drag completes */
  onReorderCommit: (next: SavedSshConnection[]) => void;
  liveCountFor: (id: string) => number;
  canDisconnect: (id: string) => boolean;
  sshUrlFor: (c: SavedSshConnection) => string | null;
  onConnect: (c: SavedSshConnection) => void;
  onDisconnect: (id: string) => void;
  onEdit: (c: SavedSshConnection) => void;
  onClone: (c: SavedSshConnection) => void;
  onCopySsh: (c: SavedSshConnection) => void;
  onDelete: (id: string) => void;
  onSettings: (c: SavedSshConnection) => void;
}

export const SshConnectionSidebarList: React.FC<SshConnectionSidebarListProps> = ({
  connections,
  filteredConnections,
  view,
  activeConnectionId,
  showSettings,
  maxSshTabs,
  tabsCount,
  filterActive,
  categoryOrder,
  categoryMeta,
  collapsedCategories,
  onToggleCategory,
  onCategoryOrderChange,
  onCategoryColorChange,
  onCategoryRename,
  onConnectMany,
  canCreatePrivateSpace = false,
  creatingPrivateSpace = false,
  cloningCategory = false,
  onCloneCategory,
  onCreatePrivateSpace,
  onConnectionsChange,
  onReorderCommit,
  liveCountFor,
  canDisconnect,
  sshUrlFor,
  onConnect,
  onDisconnect,
  onEdit,
  onClone,
  onCopySsh,
  onDelete,
  onSettings,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [spaceCategoryIds, setSpaceCategoryIds] = useState<Set<string>>(() => new Set());
  const [categoriesAsTabs, setCategoriesAsTabs] = useState(false);
  const [colorPickerCat, setColorPickerCat] = useState<string | null>(null);
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const fromConns = filteredConnections.map((c) => categoryKey(c.category));
    const ordered: string[] = [];
    for (const key of categoryOrder) {
      const k = categoryKey(key);
      if (seen.has(k)) continue;
      if (!filterActive || fromConns.includes(k) || k === UNCATEGORIZED_KEY) {
        const hasFiltered = filteredConnections.some((c) => categoryKey(c.category) === k);
        const keepEmpty = !filterActive && categoryOrder.includes(k) && k !== UNCATEGORIZED_KEY;
        if (hasFiltered || keepEmpty) {
          seen.add(k);
          ordered.push(k);
        }
      }
    }
    for (const k of fromConns) {
      if (seen.has(k)) continue;
      seen.add(k);
      ordered.push(k);
    }
    const uncatIdx = ordered.indexOf(UNCATEGORIZED_KEY);
    if (uncatIdx > 0) {
      ordered.splice(uncatIdx, 1);
      ordered.unshift(UNCATEGORIZED_KEY);
    }
    return ordered;
  }, [filteredConnections, categoryOrder, filterActive]);

  const itemsByCategory = useMemo(() => {
    const map: Record<string, SavedSshConnection[]> = {};
    for (const cat of categories) map[cat] = [];
    for (const c of filteredConnections) {
      const k = categoryKey(c.category);
      if (!map[k]) map[k] = [];
      map[k].push(c);
    }
    for (const cat of Object.keys(map)) {
      map[cat] = sortConnections(map[cat]);
    }
    return map;
  }, [categories, filteredConnections]);

  const namedCategoryIds = useMemo(
    () => categories.map((c) => catHdrId(c)),
    [categories]
  );

  const findContainer = (id: string): string | null => {
    const hdr = parseCatHdr(id);
    if (hdr != null) return hdr;
    if (id.startsWith('cat:')) {
      const raw = id.slice(4);
      return raw === '__uncategorized__' ? UNCATEGORIZED_KEY : raw;
    }
    for (const [cat, items] of Object.entries(itemsByCategory) as Array<[string, SavedSshConnection[]]>) {
      if (items.some((c) => c.id === id)) return cat;
    }
    const full = connections.find((c) => c.id === id);
    return full ? categoryKey(full.category) : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setColorPickerCat(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || filterActive) return;
    if (parseCatHdr(String(active.id)) != null) return;

    const activeCat = findContainer(String(active.id));
    const overCat = findContainer(String(over.id));
    if (activeCat == null || overCat == null || activeCat === overCat) return;

    const activeItems = (itemsByCategory[activeCat] || []).map((c) => c.id);
    const overItems = (itemsByCategory[overCat] || []).map((c) => c.id);
    const activeIndex = activeItems.indexOf(String(active.id));
    if (activeIndex < 0) return;

    let overIndex = overItems.indexOf(String(over.id));
    if (String(over.id).startsWith('cat:') || parseCatHdr(String(over.id)) != null) {
      overIndex = overItems.length;
    }
    if (overIndex < 0) overIndex = overItems.length;

    const movedId = activeItems[activeIndex];
    const nextActive = activeItems.filter((id) => id !== movedId);
    const nextOver = [...overItems];
    nextOver.splice(overIndex, 0, movedId);

    const moved = connections.map((c) =>
      c.id === movedId ? { ...c, category: overCat } : c
    );
    onConnectionsChange(
      applyCategoryOrders(moved, {
        [activeCat]: nextActive,
        [overCat]: nextOver,
      })
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    const activeHdr = parseCatHdr(String(active.id));
    if (activeHdr != null) {
      if (!over || filterActive || activeHdr === UNCATEGORIZED_KEY) return;
      const overHdr =
        parseCatHdr(String(over.id)) ??
        (String(over.id).startsWith('cat:') ? findContainer(String(over.id)) : findContainer(String(over.id)));
      if (overHdr == null || overHdr === UNCATEGORIZED_KEY) return;
      const named = categories.filter((c) => c !== UNCATEGORIZED_KEY);
      const oldIndex = named.indexOf(activeHdr);
      const newIndex = named.indexOf(overHdr);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      onCategoryOrderChange(arrayMove(named, oldIndex, newIndex));
      return;
    }

    if (!over || filterActive) {
      onReorderCommit(connections);
      return;
    }

    const activeCat = findContainer(String(active.id));
    const overCat = findContainer(String(over.id));
    if (activeCat == null || overCat == null) {
      onReorderCommit(connections);
      return;
    }

    const ids = (itemsByCategory[activeCat] || []).map((c) => c.id);
    if (activeCat === overCat) {
      const oldIndex = ids.indexOf(String(active.id));
      let newIndex = ids.indexOf(String(over.id));
      if (String(over.id).startsWith('cat:') || parseCatHdr(String(over.id)) != null) {
        newIndex = ids.length - 1;
      }
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        onReorderCommit(reindexCategory(connections, activeCat, ids));
        return;
      }
      const next = reindexCategory(connections, activeCat, arrayMove(ids, oldIndex, newIndex));
      onConnectionsChange(next);
      onReorderCommit(next);
      return;
    }

    const fromIds = (itemsByCategory[activeCat] || []).map((c) => c.id).filter((id) => id !== String(active.id));
    const toIds = (itemsByCategory[overCat] || []).map((c) => c.id);
    let insertAt = toIds.indexOf(String(over.id));
    if (String(over.id).startsWith('cat:') || parseCatHdr(String(over.id)) != null) insertAt = toIds.length;
    if (insertAt < 0) insertAt = toIds.length;
    const nextTo = [...toIds];
    nextTo.splice(insertAt, 0, String(active.id));
    const moved = connections.map((c) =>
      c.id === String(active.id) ? { ...c, category: overCat } : c
    );
    const next = applyCategoryOrders(moved, {
      [activeCat]: fromIds,
      [overCat]: nextTo,
    });
    onConnectionsChange(next);
    onReorderCommit(next);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectCategory = (cat: string) => {
    const items = itemsByCategory[cat] || [];
    const ids = items.map((c) => c.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleSpaceCategory = (cat: string) => {
    setSpaceCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const commitRename = (from: string) => {
    const to = normalizeSshCategory(renameDraft);
    setRenamingCat(null);
    setRenameDraft('');
    if (!to || to === from) return;
    onCategoryRename(from, to);
  };

  const activeConnection = activeId && !activeId.startsWith(CAT_HDR_PREFIX)
    ? connections.find((c) => c.id === activeId)
    : null;
  const activeCategoryDrag = activeId ? parseCatHdr(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-1.5" onClick={() => setColorPickerCat(null)}>
        {filterActive && (
          <p className="text-[9px] text-slate-400 dark:text-slate-500 px-1">
            Clear filter to drag-and-drop rearrange.
          </p>
        )}
        {canCreatePrivateSpace && (
          <div className="rounded-md border border-violet-200 dark:border-violet-900/50 bg-violet-50/80 dark:bg-violet-950/30 px-1.5 py-1.5 space-y-1">
            <p className="text-[9px] text-violet-700 dark:text-violet-300 leading-snug">
              Check categories below, then create a private space with their SSH links.
            </p>
            {spaceCategoryIds.size > 1 && (
              <label className="flex items-start gap-1.5 text-[10px] text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={categoriesAsTabs}
                  onChange={(e) => setCategoriesAsTabs(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-violet-600"
                />
                <span>
                  Use <strong>tabs</strong> per category
                  <span className="block text-[9px] text-slate-500 dark:text-slate-400">
                    Off = each category becomes a section in one tab
                  </span>
                </span>
              </label>
            )}
            <button
              type="button"
              disabled={creatingPrivateSpace || spaceCategoryIds.size === 0}
              onClick={() => {
                const ordered = categories.filter((c) => spaceCategoryIds.has(c));
                onCreatePrivateSpace(ordered, categoriesAsTabs ? 'tabs' : 'sections');
              }}
              className="w-full h-7 px-2 text-[10px] font-semibold rounded-md bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
            >
              {creatingPrivateSpace
                ? 'Creating…'
                : spaceCategoryIds.size === 0
                  ? 'Create private space'
                  : `Create private space (${spaceCategoryIds.size})`}
            </button>
          </div>
        )}
        <SortableContext items={namedCategoryIds} strategy={verticalListSortingStrategy}>
          {categories.map((cat) => {
            const items = itemsByCategory[cat] || [];
            const collapsed = !!collapsedCategories[cat || '__uncategorized__'];
            const dropId = `cat:${cat || '__uncategorized__'}`;
            const accent = categoryAccentColor(cat, categoryMeta);
            const selectedInCat = items.filter((c) => selectedIds.has(c.id));
            const allSelected = items.length > 0 && selectedInCat.length === items.length;
            return (
              <SortableCategorySection
                key={dropId}
                category={cat}
                accent={accent}
                itemCount={items.length}
                collapsed={collapsed}
                filterActive={filterActive}
                canRename={cat !== UNCATEGORIZED_KEY}
                selectedCount={selectedInCat.length}
                allSelected={allSelected}
                spaceSelected={spaceCategoryIds.has(cat)}
                colorPickerOpen={colorPickerCat === cat}
                renaming={renamingCat === cat}
                renameDraft={renameDraft}
                onToggleCollapse={() => onToggleCategory(cat)}
                onToggleSpaceSelect={() => toggleSpaceCategory(cat)}
                onToggleColorPicker={() =>
                  setColorPickerCat((prev) => (prev === cat ? null : cat))
                }
                onPickColor={(color) => {
                  onCategoryColorChange(cat, color);
                  setColorPickerCat(null);
                }}
                onStartRename={() => {
                  setRenamingCat(cat);
                  setRenameDraft(cat);
                  setColorPickerCat(null);
                }}
                onRenameDraftChange={setRenameDraft}
                onCommitRename={() => commitRename(cat)}
                onCancelRename={() => {
                  setRenamingCat(null);
                  setRenameDraft('');
                }}
                onToggleSelectAll={() => toggleSelectCategory(cat)}
                onRunAll={() => onConnectMany(items)}
                onRunSelected={() => onConnectMany(selectedInCat)}
                onCloneCategory={() => onCloneCategory(cat)}
                cloningCategory={cloningCategory}
              >
                <CategoryDropZone category={cat}>
                  <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {items.length === 0 ? (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5 py-2 text-center">
                        Drop connections here
                      </p>
                    ) : (
                      items.map((c) => {
                        const liveCount = liveCountFor(c.id);
                        return (
                          <SortableConnectionCard
                            key={c.id}
                            connection={c}
                            view={view}
                            active={activeConnectionId === c.id}
                            isLive={liveCount > 0}
                            liveCount={liveCount}
                            canDisconnect={canDisconnect(c.id)}
                            maxReached={tabsCount >= maxSshTabs}
                            sshLink={sshUrlFor(c)}
                            dragDisabled={filterActive}
                            showSettings={showSettings}
                            selected={selectedIds.has(c.id)}
                            onToggleSelect={() => toggleSelect(c.id)}
                            onConnect={() => onConnect(c)}
                            onDisconnect={() => onDisconnect(c.id)}
                            onEdit={() => onEdit(c)}
                            onClone={() => onClone(c)}
                            onCopySsh={() => onCopySsh(c)}
                            onDelete={() => onDelete(c.id)}
                            onSettings={() => onSettings(c)}
                          />
                        );
                      })
                    )}
                  </SortableContext>
                </CategoryDropZone>
              </SortableCategorySection>
            );
          })}
        </SortableContext>
      </div>
      <DragOverlay>
        {activeConnection ? (
          <div className="rounded-md border border-brand-400 bg-white dark:bg-slate-800 shadow-lg px-2 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100 max-w-[200px] truncate">
            {activeConnection.name}
          </div>
        ) : activeCategoryDrag != null ? (
          <div
            className="rounded-md border border-brand-400 bg-white dark:bg-slate-800 shadow-lg px-2 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100 max-w-[200px] truncate border-l-[3px]"
            style={{ borderLeftColor: categoryAccentColor(activeCategoryDrag, categoryMeta) }}
          >
            {categoryLabel(activeCategoryDrag)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export function mergeCategoryOrder(existing: string[], fromConnections: SavedSshConnection[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of existing) {
    const k = categoryKey(raw);
    if (k === UNCATEGORIZED_KEY || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  for (const c of fromConnections) {
    const k = categoryKey(c.category);
    if (k === UNCATEGORIZED_KEY || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export { UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL, categoryKey, categoryLabel };
