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

export type SshListViewMode = 'cards' | 'compact' | 'tree';
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

function hexToRgba(hex: string, alpha: number): string {
  const raw = (hex || '').replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(100, 116, 139, ${alpha})`;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const EmojiChip: React.FC<{
  emoji: string;
  label?: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'brand' | 'sky' | 'amber' | 'rose' | 'emerald' | 'orange' | 'violet';
  solid?: boolean;
  size?: 'sm' | 'md';
}> = ({ emoji, label, title, onClick, disabled, tone = 'neutral', solid = false, size = 'sm' }) => {
  const tones: Record<string, { solid: string; soft: string }> = {
    neutral: {
      solid: 'bg-slate-700 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900',
      soft: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700',
    },
    brand: {
      solid: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/25',
      soft: 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800',
    },
    sky: {
      solid: 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm shadow-sky-600/25',
      soft: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    },
    amber: {
      solid: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/25',
      soft: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    },
    rose: {
      solid: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/25',
      soft: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    },
    emerald: {
      solid: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/25',
      soft: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    },
    orange: {
      solid: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm shadow-orange-500/25',
      soft: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    },
    violet: {
      solid: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-600/25',
      soft: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    },
  };
  const palette = tones[tone] || tones.neutral;
  const h = size === 'md' ? 'h-7' : 'h-6';
  const px = label ? (size === 'md' ? 'px-2' : 'px-1.5') : size === 'md' ? 'w-7 px-0' : 'w-6 px-0';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center gap-0.5 ${h} ${px} rounded-lg text-[10px] font-semibold border transition-all disabled:opacity-35 disabled:pointer-events-none ${
        solid ? `${palette.solid} border-transparent` : palette.soft
      }`}
    >
      <span className="leading-none text-[12px]" aria-hidden>
        {emoji}
      </span>
      {label ? <span className="leading-none whitespace-nowrap">{label}</span> : null}
    </button>
  );
};

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
  onRestore?: () => void;
  onPurge?: () => void;
  libraryScope?: 'active' | 'archived' | 'recycle';
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
  onRestore,
  onPurge,
  libraryScope = 'active',
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
      } ${view === 'compact' || view === 'tree' ? 'h-6 w-5' : 'h-7 w-6'}`}
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
        className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold tracking-wide ${
          isRdp
            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
        }`}
      >
        <span aria-hidden>{isRdp ? '🖥️' : '💻'}</span>
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

  const sessionButton = isLive ? (
    <EmojiChip
      emoji="⏹️"
      label={view === 'tree' ? undefined : 'Stop'}
      title={`Disconnect ${c.name}`}
      onClick={onDisconnect}
      disabled={!canDisconnect}
      tone="rose"
      solid
      size={view === 'tree' ? 'sm' : 'md'}
    />
  ) : (
    <EmojiChip
      emoji="▶️"
      label={view === 'compact' ? 'Connect' : view === 'tree' ? undefined : undefined}
      title={maxReached ? 'Maximum sessions reached' : `Connect to ${c.name}`}
      onClick={onConnect}
      disabled={maxReached}
      tone="brand"
      solid
      size={view === 'tree' ? 'sm' : 'md'}
    />
  );

  const smallActions = (
    <>
      <EmojiChip emoji="✏️" title={`Edit ${c.name}`} onClick={onEdit} tone="neutral" size={view === 'tree' ? 'sm' : 'md'} />
      {sshLink && (
        <EmojiChip
          emoji="🔗"
          label="SSH"
          title={`Copy ssh:// URL for ${c.name}`}
          onClick={onCopySsh}
          tone="sky"
          solid
          size={view === 'tree' ? 'sm' : 'md'}
        />
      )}
      <EmojiChip
        emoji="📋"
        title={`Clone ${c.name}`}
        onClick={onClone}
        disabled={libraryScope !== 'active'}
        tone="violet"
        size={view === 'tree' ? 'sm' : 'md'}
      />
      {libraryScope === 'recycle' || libraryScope === 'archived' ? (
        <>
          <EmojiChip
            emoji="♻️"
            title={`Restore ${c.name}`}
            onClick={() => onRestore?.()}
            tone="emerald"
            solid
            size={view === 'tree' ? 'sm' : 'md'}
          />
          {libraryScope === 'recycle' ? (
            <EmojiChip
              emoji="💥"
              title={`Permanently delete ${c.name}`}
              onClick={() => onPurge?.()}
              tone="rose"
              size={view === 'tree' ? 'sm' : 'md'}
            />
          ) : (
            <EmojiChip
              emoji="🗑️"
              title={`Move ${c.name} to Recycle Bin`}
              onClick={onDelete}
              tone="rose"
              size={view === 'tree' ? 'sm' : 'md'}
            />
          )}
        </>
      ) : (
        <EmojiChip
          emoji="🗑️"
          title={`Move ${c.name} to Recycle Bin`}
          onClick={onDelete}
          tone="rose"
          size={view === 'tree' ? 'sm' : 'md'}
        />
      )}
      <EmojiChip
        emoji="⚙️"
        title={`Settings for ${c.name}`}
        onClick={onSettings}
        tone="orange"
        solid={Boolean(showSettings && active)}
        size={view === 'tree' ? 'sm' : 'md'}
      />
    </>
  );

  const colorAvatar = (
    <span
      className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-lg text-[13px] shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      style={{ backgroundColor: hexToRgba(color, 0.22), color }}
      title={isRdp ? 'RDP connection' : 'SSH connection'}
      aria-hidden
    >
      {isRdp ? '🖥️' : '💻'}
    </span>
  );

  if (view === 'tree') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group/tree-node relative flex items-center gap-0.5 min-w-0 py-0.5 pl-0.5 pr-1 rounded-md ${
          active
            ? 'bg-brand-50 dark:bg-brand-900/25 ring-1 ring-brand-400/60'
            : 'hover:bg-slate-100/80 dark:hover:bg-slate-700/50'
        }`}
      >
        <span className="absolute left-0 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-600 ml-[11px]" aria-hidden />
        <span className="absolute left-[11px] top-1/2 w-2.5 h-px bg-slate-200 dark:bg-slate-600" aria-hidden />
        <div className="w-4 shrink-0" aria-hidden />
        {dragHandle}
        {selectCheckbox}
        {colorAvatar}
        <button
          type="button"
          className="flex-1 min-w-0 text-left py-0.5"
          onClick={onEdit}
          onDoubleClick={onConnect}
          title={`${c.name} — ${hostLine(c)}`}
        >
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
            {badges}
          </div>
          <p className="text-[9px] font-mono text-slate-400 truncate leading-tight">{hostLine(c)}</p>
        </button>
        <div className="flex items-center gap-0.5 shrink-0 opacity-90 group-hover/tree-node:opacity-100">
          {sessionButton}
          {sshLink && (
            <EmojiChip emoji="🔗" title={`Copy ssh:// URL for ${c.name}`} onClick={onCopySsh} tone="sky" solid />
          )}
          <EmojiChip
            emoji="⚙️"
            title={`Settings for ${c.name}`}
            onClick={onSettings}
            tone="orange"
            solid={Boolean(showSettings && active)}
          />
        </div>
      </div>
    );
  }

  if (view === 'compact') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`rounded-xl border overflow-hidden shadow-sm ${
          active
            ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
            : 'border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0 py-1.5 pl-0.5 pr-1.5">
          <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
          {dragHandle}
          {selectCheckbox}
          {colorAvatar}
          <button type="button" className="flex-1 min-w-0 text-left py-0.5" onClick={onEdit} title={c.name}>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
              {badges}
            </div>
            <p className="text-[9px] font-mono text-slate-400 truncate">{hostLine(c)}</p>
          </button>
        </div>
        <div className="px-1.5 pb-1.5">
          <div className="flex items-center gap-1 flex-wrap rounded-lg bg-slate-50/90 dark:bg-slate-900/40 p-1">
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
      className={`rounded-xl border overflow-hidden transition-colors shadow-sm ${
        active
          ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
          : 'border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
      }`}
    >
      <div className="flex min-w-0">
        <div className="w-1.5 shrink-0 self-stretch" style={{ backgroundColor: color }} title={color} />
        <div className="flex-1 min-w-0 p-2">
          <div className="flex items-start gap-1">
            {dragHandle}
            {selectCheckbox}
            {colorAvatar}
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
                      className="px-1.5 py-0 text-[9px] rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
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

          <div className="mt-2 flex items-center gap-1 flex-wrap rounded-lg bg-slate-50/90 dark:bg-slate-900/40 p-1">
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
      className={`space-y-0.5 min-h-[8px] rounded-md ${isOver ? 'ring-1 ring-brand-400 bg-brand-50/40 dark:bg-brand-900/10' : ''}`}
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
  treeMode?: boolean;
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
  libraryScope?: 'active' | 'archived' | 'recycle';
  onArchiveCategory?: () => void;
  onDeleteCategory?: () => void;
  onArchiveSelected?: () => void;
  onDeleteSelected?: () => void;
  onRestoreSelected?: () => void;
  onPurgeSelected?: () => void;
  children: React.ReactNode;
}> = ({
  category,
  accent,
  itemCount,
  collapsed,
  filterActive,
  canRename,
  treeMode = false,
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
  libraryScope = 'active',
  onArchiveCategory,
  onDeleteCategory,
  onArchiveSelected,
  onDeleteSelected,
  onRestoreSelected,
  onPurgeSelected,
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
      className={
        treeMode
          ? 'rounded-xl overflow-hidden'
          : 'rounded-xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm'
      }
    >
      <div
        className={treeMode ? 'rounded-xl' : 'border-l-[3px]'}
        style={{
          borderLeftColor: treeMode ? undefined : accent,
          background: treeMode
            ? hexToRgba(accent, 0.08)
            : `linear-gradient(90deg, ${hexToRgba(accent, 0.16)} 0%, ${hexToRgba(accent, 0.04)} 55%, transparent 100%)`,
        }}
      >
        <div className="flex items-center gap-1 px-1.5 py-1.5 min-w-0">
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
              className="h-5 w-5 rounded-full border-2 border-white dark:border-slate-800 shadow-md ring-1 ring-black/10"
              style={{ backgroundColor: accent }}
              title="Category color"
              aria-label="Change category color"
              aria-expanded={colorPickerOpen}
            />
            {colorPickerOpen && (
              <div
                className="absolute left-0 top-6 z-30 p-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg grid grid-cols-4 gap-1 w-[112px]"
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
                className="flex-1 min-w-0 h-6 px-1.5 text-[11px] rounded-lg border border-brand-400 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                maxLength={64}
                aria-label="Rename category"
              />
              <button
                type="submit"
                className="h-6 px-1.5 text-[10px] font-semibold rounded-lg bg-brand-600 text-white"
              >
                Save
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex-1 min-w-0 flex items-center gap-1.5 text-left py-0.5"
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
              <span
                className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-lg text-[13px] shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                style={{ backgroundColor: hexToRgba(accent, 0.28) }}
                aria-hidden
              >
                {collapsed ? '📁' : '📂'}
              </span>
              <span className="text-[11px] font-bold truncate text-slate-800 dark:text-slate-100">
                {categoryLabel(category)}
              </span>
              <span
                className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[1.35rem] h-5 px-1.5 rounded-full text-[10px] font-bold text-white shadow-sm"
                style={{ backgroundColor: accent }}
              >
                {itemCount}
              </span>
            </button>
          )}
        </div>

        <div className={`px-1.5 ${treeMode ? 'pb-1.5' : 'pb-2'} space-y-1`}>
          <div className="flex items-center gap-1 flex-wrap">
            <label className="inline-flex items-center gap-1 h-6 px-1.5 rounded-lg bg-white/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-600 text-[9px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-white dark:hover:bg-slate-800">
              <input
                type="checkbox"
                checked={allSelected && itemCount > 0}
                disabled={itemCount === 0}
                onChange={onToggleSelectAll}
                className="h-3 w-3 rounded border-slate-300 text-brand-600"
              />
              All
            </label>
            <EmojiChip
              emoji="▶️"
              label="All"
              title="Connect all in this category"
              onClick={onRunAll}
              disabled={itemCount === 0}
              tone="brand"
              solid
            />
            <EmojiChip
              emoji="▶️"
              label={selectedCount > 0 ? `Sel ${selectedCount}` : 'Sel'}
              title="Connect selected in this category"
              onClick={onRunSelected}
              disabled={selectedCount === 0}
              tone="sky"
              solid
            />
            {canRename && !renaming && (
              <EmojiChip emoji="✏️" title="Rename category" onClick={onStartRename} tone="neutral" />
            )}
            <EmojiChip
              emoji="📋"
              title={`Clone category “${categoryLabel(category)}” and all its connections`}
              onClick={onCloneCategory}
              disabled={cloningCategory || libraryScope !== 'active'}
              tone="violet"
            />
          </div>

          {libraryScope === 'active' && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 px-0.5">
                Sel
              </span>
              <EmojiChip
                emoji="📦"
                title="Archive selected connections"
                onClick={onArchiveSelected}
                disabled={selectedCount === 0}
                tone="amber"
              />
              <EmojiChip
                emoji="🗑️"
                title="Move selected connections to Recycle Bin"
                onClick={onDeleteSelected}
                disabled={selectedCount === 0}
                tone="rose"
              />
              <span className="mx-0.5 h-4 w-px bg-slate-300/80 dark:bg-slate-600" aria-hidden />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 px-0.5">
                Cat
              </span>
              <EmojiChip
                emoji="📦"
                label="Archive"
                title="Archive entire category"
                onClick={onArchiveCategory}
                disabled={itemCount === 0}
                tone="amber"
              />
              <EmojiChip
                emoji="🗑️"
                label="Delete"
                title="Delete category (connections go to Recycle Bin)"
                onClick={onDeleteCategory}
                tone="rose"
              />
            </div>
          )}
          {libraryScope === 'archived' && (
            <div className="flex items-center gap-1 flex-wrap">
              <EmojiChip
                emoji="♻️"
                label="Restore"
                title="Restore selected from archive"
                onClick={onRestoreSelected}
                disabled={selectedCount === 0}
                tone="emerald"
                solid
              />
              <EmojiChip
                emoji="🗑️"
                label="Bin"
                title="Move selected to Recycle Bin"
                onClick={onDeleteSelected}
                disabled={selectedCount === 0}
                tone="rose"
              />
            </div>
          )}
          {libraryScope === 'recycle' && (
            <div className="flex items-center gap-1 flex-wrap">
              <EmojiChip
                emoji="♻️"
                label="Restore"
                title="Restore selected from Recycle Bin"
                onClick={onRestoreSelected}
                disabled={selectedCount === 0}
                tone="emerald"
                solid
              />
              <EmojiChip
                emoji="💥"
                label="Purge"
                title="Permanently delete selected"
                onClick={onPurgeSelected}
                disabled={selectedCount === 0}
                tone="rose"
                solid
              />
            </div>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className={treeMode ? 'pl-2 pr-0.5 pb-1 pt-0.5 border-l border-slate-200 dark:border-slate-600 ml-3' : 'p-1.5 bg-slate-50/50 dark:bg-slate-900/20'}>
          {children}
        </div>
      )}
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
  onSetCategoriesCollapsed: (categoryKeys: string[], collapsed: boolean) => void;
  onCategoryOrderChange: (next: string[]) => void;
  onCategoryColorChange: (category: string, color: string) => void;
  onCategoryRename: (from: string, to: string) => void;
  onConnectMany: (list: SavedSshConnection[]) => void;
  canCreatePrivateSpace?: boolean;
  creatingPrivateSpace?: boolean;
  cloningCategory?: boolean;
  onCloneCategory: (category: string) => void;
  onCreatePrivateSpace: (categories: string[], layout: 'sections' | 'tabs') => void;
  libraryScope?: 'active' | 'archived' | 'recycle';
  onLibraryScopeChange?: (scope: 'active' | 'archived' | 'recycle') => void;
  recycledCategories?: Array<{ name: string; color?: string; deletedAt: number; connectionIds: string[] }>;
  activeCount?: number;
  archivedCount?: number;
  recycleCount?: number;
  onArchiveCategory?: (category: string) => void;
  onDeleteCategory?: (category: string) => void;
  onArchiveSelected?: (category: string, ids: string[]) => void;
  onDeleteSelected?: (category: string, ids: string[]) => void;
  onRestoreSelected?: (ids: string[]) => void;
  onPurgeSelected?: (ids: string[]) => void;
  onRestoreCategory?: (category: string) => void;
  onPurgeCategory?: (category: string) => void;
  onRestoreConnection?: (id: string) => void;
  onPurgeConnection?: (id: string) => void;
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
  onSetCategoriesCollapsed,
  onCategoryOrderChange,
  onCategoryColorChange,
  onCategoryRename,
  onConnectMany,
  canCreatePrivateSpace = false,
  creatingPrivateSpace = false,
  cloningCategory = false,
  onCloneCategory,
  onCreatePrivateSpace,
  libraryScope = 'active',
  onLibraryScopeChange,
  recycledCategories = [],
  activeCount = 0,
  archivedCount = 0,
  recycleCount = 0,
  onArchiveCategory,
  onDeleteCategory,
  onArchiveSelected,
  onDeleteSelected,
  onRestoreSelected,
  onPurgeSelected,
  onRestoreCategory,
  onPurgeCategory,
  onRestoreConnection,
  onPurgeConnection,
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
        const keepEmpty =
          !filterActive &&
          libraryScope === 'active' &&
          categoryOrder.includes(k) &&
          k !== UNCATEGORIZED_KEY;
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
  }, [filteredConnections, categoryOrder, filterActive, libraryScope]);

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
        {onLibraryScopeChange && (
          <div className="flex items-center gap-1 flex-wrap p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700">
            {(
              [
                { id: 'active' as const, label: 'Active', emoji: '⚡', count: activeCount, tone: 'brand' },
                { id: 'archived' as const, label: 'Archived', emoji: '📦', count: archivedCount, tone: 'amber' },
                { id: 'recycle' as const, label: 'Recycle', emoji: '🗑️', count: recycleCount, tone: 'rose' },
              ] as const
            ).map((tab) => {
              const active = libraryScope === tab.id;
              const activeCls =
                tab.tone === 'amber'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : tab.tone === 'rose'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                    : 'bg-brand-600 text-white border-brand-600 shadow-sm';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onLibraryScopeChange(tab.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                    active
                      ? activeCls
                      : 'border-transparent text-slate-500 hover:bg-white/80 dark:hover:bg-slate-800'
                  }`}
                >
                  <span aria-hidden>{tab.emoji}</span>
                  {tab.label}
                  {tab.count > 0 ? (
                    <span
                      className={`min-w-[1.1rem] h-4 px-1 rounded-full text-[9px] inline-flex items-center justify-center ${
                        active ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {libraryScope === 'recycle' && recycledCategories.length > 0 && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-gradient-to-r from-rose-50 to-orange-50/40 dark:from-rose-950/30 dark:to-slate-900/20 px-2 py-1.5 space-y-1.5">
            <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">🗂️ Deleted categories</p>
            {recycledCategories.map((rc) => (
              <div
                key={`${rc.name}-${rc.deletedAt}`}
                className="flex items-center gap-1.5 min-w-0 rounded-lg bg-white/70 dark:bg-slate-900/40 px-1.5 py-1"
              >
                <span
                  className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-[12px] shrink-0"
                  style={{ backgroundColor: hexToRgba(rc.color || '#64748b', 0.28) }}
                  aria-hidden
                >
                  📁
                </span>
                <span className="flex-1 min-w-0 text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {rc.name}
                  <span className="text-slate-400 font-normal"> · {rc.connectionIds.length}</span>
                </span>
                <EmojiChip
                  emoji="♻️"
                  label="Restore"
                  title={`Restore category ${rc.name}`}
                  onClick={() => onRestoreCategory?.(rc.name)}
                  tone="emerald"
                  solid
                />
                <EmojiChip
                  emoji="💥"
                  label="Purge"
                  title={`Permanently delete category ${rc.name}`}
                  onClick={() => onPurgeCategory?.(rc.name)}
                  tone="rose"
                />
              </div>
            ))}
          </div>
        )}
        {filteredConnections.length === 0 &&
          !(libraryScope === 'recycle' && recycledCategories.length > 0) && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center">
              {libraryScope === 'archived'
                ? 'No archived connections.'
                : libraryScope === 'recycle'
                  ? 'Recycle Bin is empty.'
                  : filterActive
                    ? 'No connections match this filter.'
                    : 'No active connections in this view.'}
            </p>
          )}
        {canCreatePrivateSpace && libraryScope === 'active' && (
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
        {categories.length > 0 && (
          <div className="flex items-center gap-1 px-0.5">
            <button
              type="button"
              onClick={() => onSetCategoriesCollapsed(categories, false)}
              className="flex-1 h-6 px-1.5 text-[9px] font-semibold rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
              title="Expand all categories"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => onSetCategoriesCollapsed(categories, true)}
              className="flex-1 h-6 px-1.5 text-[9px] font-semibold rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
              title="Collapse all categories"
            >
              Collapse all
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
                treeMode={view === 'tree'}
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
                libraryScope={libraryScope}
                onArchiveCategory={() => onArchiveCategory?.(cat)}
                onDeleteCategory={() => onDeleteCategory?.(cat)}
                onArchiveSelected={() =>
                  onArchiveSelected?.(
                    cat,
                    items.filter((c) => selectedIds.has(c.id)).map((c) => c.id)
                  )
                }
                onDeleteSelected={() =>
                  onDeleteSelected?.(
                    cat,
                    items.filter((c) => selectedIds.has(c.id)).map((c) => c.id)
                  )
                }
                onRestoreSelected={() =>
                  onRestoreSelected?.(items.filter((c) => selectedIds.has(c.id)).map((c) => c.id))
                }
                onPurgeSelected={() =>
                  onPurgeSelected?.(items.filter((c) => selectedIds.has(c.id)).map((c) => c.id))
                }
              >
                <CategoryDropZone category={cat}>
                  <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {items.length === 0 ? (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5 py-2 text-center">
                        {view === 'tree' ? 'Empty folder — drop connections here' : 'Drop connections here'}
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
                            onRestore={() => onRestoreConnection?.(c.id)}
                            onPurge={() => onPurgeConnection?.(c.id)}
                            libraryScope={libraryScope}
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
