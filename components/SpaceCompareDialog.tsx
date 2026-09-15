import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tile } from '../types';
import { createTile, getTile, saveTile } from '../services/storageService';
import {
  buildMergedCreateTitle,
  concatenateSpaces,
  computeSpaceSimilarity,
  countDiffByKind,
  countMatchesByKind,
  diffSpaces,
  downloadTileCompareJson,
  filterDiffByKinds,
  filterDiffDifferences,
  filterDiffMatches,
  mergeSpaces,
  parseTileFromCompareFile,
  regenerateIds,
  type SpaceCompareSide,
  type SpaceDiffKindFilter,
  type SpaceDiffNode,
  type SpaceDiffStatus,
  type SpaceFieldDiff,
} from '../services/spaceCompareService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

type DiffViewMode = 'diff' | 'matches' | 'all';

export interface SpaceCompareCandidate {
  id: string;
  title: string;
  emoji?: string;
  group?: string;
  visibility?: string;
  sourceTab?: string;
  canEdit?: boolean;
}

interface SpaceCompareDialogProps {
  open: boolean;
  leftTileId: string;
  availableTiles: SpaceCompareCandidate[];
  onClose: () => void;
  /** Called after a successful merge or create with a hint for the parent to refresh. */
  onCompleted: (result: {
    action: 'merge-left' | 'merge-right' | 'create';
    tile: Tile;
  }) => void | Promise<void>;
}

const ROW_CLASS: Record<SpaceDiffStatus, string> = {
  unchanged: 'bg-white/80 dark:bg-slate-900/30',
  changed: 'bg-amber-100/80 dark:bg-amber-950/40',
  onlyA: 'bg-sky-100/80 dark:bg-sky-950/40',
  onlyB: 'bg-fuchsia-100/70 dark:bg-fuchsia-950/35',
};

const STATUS_LABEL: Record<SpaceDiffStatus, string> = {
  unchanged: 'same',
  changed: 'changed',
  onlyA: 'only left',
  onlyB: 'only right',
};

const formatFieldValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const s = String(value);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
};

export const SpaceCompareDialog: React.FC<SpaceCompareDialogProps> = ({
  open,
  leftTileId,
  availableTiles,
  onClose,
  onCompleted,
}) => {
  useEscapeToClose(open, onClose);

  const [left, setLeft] = useState<SpaceCompareSide | null>(null);
  const [right, setRight] = useState<SpaceCompareSide | null>(null);
  const [errorLeft, setErrorLeft] = useState<string | null>(null);
  const [errorRight, setErrorRight] = useState<string | null>(null);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<DiffViewMode>('diff');
  const [kindFilters, setKindFilters] = useState<SpaceDiffKindFilter>({
    tabs: true,
    sections: true,
    links: true,
  });
  const [pickerQuery, setPickerQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileLeftRef = useRef<HTMLInputElement>(null);
  const fileRightRef = useRef<HTMLInputElement>(null);

  const loadLeftFromId = useCallback(async (tileId: string) => {
    setLoadingLeft(true);
    setErrorLeft(null);
    try {
      const full = await getTile(tileId);
      if (!full) throw new Error('Could not load this space.');
      setLeft({
        tile: full,
        liveTileId: full.id,
        label: full.title,
        canEdit: full.canEdit === true,
      });
    } catch (e) {
      setLeft(null);
      setErrorLeft(e instanceof Error ? e.message : 'Failed to load left space.');
    } finally {
      setLoadingLeft(false);
    }
  }, []);

  const loadRightFromId = useCallback(async (tileId: string) => {
    setLoadingRight(true);
    setErrorRight(null);
    try {
      const full = await getTile(tileId);
      if (!full) throw new Error('Could not load that space.');
      setRight({
        tile: full,
        liveTileId: full.id,
        label: full.title,
        canEdit: full.canEdit === true,
      });
      if (fileRightRef.current) fileRightRef.current.value = '';
    } catch (e) {
      setRight(null);
      setErrorRight(e instanceof Error ? e.message : 'Failed to load right space.');
    } finally {
      setLoadingRight(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !leftTileId) return;
    setRight(null);
    setErrorRight(null);
    setPickerQuery('');
    setViewMode('diff');
    setKindFilters({ tabs: true, sections: true, links: true });
    setExpanded({});
    void loadLeftFromId(leftTileId);
  }, [open, leftTileId, loadLeftFromId]);

  const loadFile = async (side: 'left' | 'right', file: File | undefined) => {
    if (!file) return;
    const setErr = side === 'left' ? setErrorLeft : setErrorRight;
    const setSide = side === 'left' ? setLeft : setRight;
    const setLoading = side === 'left' ? setLoadingLeft : setLoadingRight;
    setLoading(true);
    setErr(null);
    try {
      const tile = await parseTileFromCompareFile(file);
      setSide({
        tile,
        liveTileId: null,
        label: file.name,
        canEdit: false,
      });
    } catch (e) {
      setSide(null);
      setErr(e instanceof Error ? e.message : 'Could not read that JSON file.');
    } finally {
      setLoading(false);
    }
  };

  const clearRight = () => {
    setRight(null);
    setErrorRight(null);
    setPickerQuery('');
    if (fileRightRef.current) fileRightRef.current.value = '';
  };

  const swapPanels = () => {
    const nextLeft = right;
    const nextRight = left;
    setLeft(nextLeft);
    setRight(nextRight);
    setErrorLeft(errorRight);
    setErrorRight(errorLeft);
    if (fileLeftRef.current) fileLeftRef.current.value = '';
    if (fileRightRef.current) fileRightRef.current.value = '';
  };

  const diff = useMemo(() => {
    if (!left?.tile || !right?.tile) return null;
    return diffSpaces(left.tile, right.tile);
  }, [left, right]);

  const visibleRootFields = useMemo(() => {
    if (!diff) return [];
    if (viewMode === 'all') return diff.rootFields;
    if (viewMode === 'matches') return diff.rootFields.filter((f) => f.status === 'unchanged');
    return diff.rootFields.filter((f) => f.status !== 'unchanged');
  }, [diff, viewMode]);

  const visibleTabs = useMemo(() => {
    if (!diff) return [];
    let base = diff.tabs;
    if (viewMode === 'diff') base = filterDiffDifferences(diff.tabs);
    else if (viewMode === 'matches') base = filterDiffMatches(diff.tabs);
    return filterDiffByKinds(base, kindFilters);
  }, [diff, viewMode, kindFilters]);

  const kindCounts = useMemo(() => {
    if (!diff) return { tabs: 0, sections: 0, links: 0 };
    if (viewMode === 'matches') return countMatchesByKind(diff.tabs);
    if (viewMode === 'diff') return countDiffByKind(filterDiffDifferences(diff.tabs));
    // All items: show diff counts on badges so filters stay useful
    return countDiffByKind(diff.tabs);
  }, [diff, viewMode]);

  const similarity = useMemo(() => {
    if (!diff) return null;
    return computeSpaceSimilarity(diff);
  }, [diff]);

  const toggleKindFilter = (key: keyof SpaceDiffKindFilter) => {
    setKindFilters((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.tabs && !next.sections && !next.links) return prev;
      return next;
    });
  };

  const visibleMessages = useMemo(() => {
    if (!diff) return [];
    if (viewMode === 'all') return diff.messages;
    if (viewMode === 'matches') return filterDiffMatches(diff.messages);
    return filterDiffDifferences(diff.messages);
  }, [diff, viewMode]);

  const pickerTiles = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const excludeId = left?.liveTileId || leftTileId;
    return availableTiles
      .filter((t) => t.id !== excludeId)
      .filter((t) => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          (t.group || '').toLowerCase().includes(q) ||
          (t.emoji || '').includes(q)
        );
      })
      .slice(0, 80);
  }, [availableTiles, pickerQuery, left?.liveTileId, leftTileId]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const canMergeLeft = !!(left?.liveTileId && left.canEdit && left.tile && right?.tile && !busy);
  const canMergeRight = !!(right?.liveTileId && right.canEdit && left?.tile && right.tile && !busy);
  const canCreate = !!(left?.tile && right?.tile && !busy);

  const handleMergeLeft = async () => {
    if (!left?.liveTileId || !left.tile || !right?.tile) return;
    if (!confirm(`Merge into "${left.tile.title}"? Matched items keep the left version; items only on the right are added.`)) {
      return;
    }
    setBusy(true);
    try {
      const merged = mergeSpaces(left.tile, right.tile, 'base');
      merged.id = left.liveTileId;
      await saveTile(merged, true);
      await onCompleted({ action: 'merge-left', tile: merged });
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Merge to left failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleMergeRight = async () => {
    if (!right?.liveTileId || !left?.tile || !right.tile) return;
    if (!confirm(`Merge into "${right.tile.title}"? Matched items keep the right version; items only on the left are added.`)) {
      return;
    }
    setBusy(true);
    try {
      const merged = mergeSpaces(right.tile, left.tile, 'base');
      merged.id = right.liveTileId;
      await saveTile(merged, true);
      await onCompleted({ action: 'merge-right', tile: merged });
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Merge to right failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNew = async () => {
    if (!left?.tile || !right?.tile) return;
    setBusy(true);
    try {
      // Keep left tabs intact, then append all right tabs (no title-based mixing).
      const merged = concatenateSpaces(left.tile, right.tile);
      const created = regenerateIds(merged);
      created.title = buildMergedCreateTitle(left.tile.title, right.tile.title);
      created.sourceTab = left.tile.sourceTab === 'staging' ? 'staging' : 'public';
      created.group = left.tile.group || 'General';
      created.createdAt = Date.now();
      const saved = await createTile(created);
      await onCompleted({ action: 'create', tile: saved });
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Create merged space failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="space-compare-title"
    >
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-br from-sky-50/90 via-white to-fuchsia-50/70 dark:from-sky-950/40 dark:via-slate-900 dark:to-fuchsia-950/30">
          <div>
            <h2 id="space-compare-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Compare & merge spaces
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Diff tabs, sections, and links. Merge to left/right (destination wins), or create a new space with left tabs then right tabs appended.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={swapPanels}
              disabled={(!left && !right) || busy}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50"
            >
              Swap panels
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SidePanel
              title="Left (this space)"
              side={left}
              error={errorLeft}
              loading={loadingLeft}
              fileRef={fileLeftRef}
              onFile={(f) => void loadFile('left', f)}
              onExport={
                left?.tile
                  ? () => void downloadTileCompareJson(left.tile)
                  : undefined
              }
              onReloadLive={
                left?.liveTileId || leftTileId
                  ? () => void loadLeftFromId(left?.liveTileId || leftTileId)
                  : undefined
              }
              extra={
                leftTileId ? (
                  <button
                    type="button"
                    onClick={() => void loadLeftFromId(leftTileId)}
                    disabled={loadingLeft || busy}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 disabled:opacity-50"
                  >
                    Use this space
                  </button>
                ) : null
              }
            />

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Right (compare to)</h3>
                <div className="flex flex-wrap gap-2">
                  {right ? (
                    <button
                      type="button"
                      onClick={clearRight}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                    >
                      Clear
                    </button>
                  ) : null}
                  {right?.tile ? (
                    <button
                      type="button"
                      onClick={() => void downloadTileCompareJson(right.tile)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
                    >
                      Export JSON
                    </button>
                  ) : null}
                </div>
              </div>

              {right ? (
                <SideSummary side={right} error={errorRight} loading={loadingRight} />
              ) : (
                <>
                  <input
                    type="search"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search spaces…"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingRight ? (
                      <p className="p-3 text-xs text-slate-500">Loading…</p>
                    ) : pickerTiles.length === 0 ? (
                      <p className="p-3 text-xs text-slate-500">No other spaces found.</p>
                    ) : (
                      pickerTiles.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => void loadRightFromId(t.id)}
                          className="w-full text-left px-3 py-2 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">{t.emoji || '📁'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                {t.title}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {[t.group || 'General', t.visibility, t.sourceTab === 'staging' ? 'staging' : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Or load a space JSON export</p>
                <input
                  ref={fileRightRef}
                  type="file"
                  accept="application/json,.json"
                  className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-slate-200 dark:file:border-slate-600 file:bg-slate-50 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
                  onChange={(e) => void loadFile('right', e.target.files?.[0])}
                />
                {errorRight && !right ? (
                  <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{errorRight}</p>
                ) : null}
              </div>
            </div>
          </div>

          {diff ? (
            <div
              className={`rounded-xl border p-4 space-y-3 ${
                diff.counts.changed === 0 && diff.counts.onlyA === 0 && diff.counts.onlyB === 0
                  ? 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/70 dark:bg-emerald-950/25'
                  : 'border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/25'
              }`}
            >
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Difference summary</h3>
              {similarity ? (
                <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-800/50 bg-white/70 dark:bg-slate-900/40 p-3 space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        How alike
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {similarity.percent}%
                        </span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {similarity.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">{similarity.same}</span>
                      {' of '}
                      <span className="font-semibold">{similarity.total}</span>
                      {' items match (same)'}
                    </p>
                  </div>
                  <div
                    className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={similarity.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Space similarity"
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        similarity.percent >= 80
                          ? 'bg-emerald-500'
                          : similarity.percent >= 50
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${similarity.percent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    {(
                      [
                        { label: 'Tabs', bucket: similarity.byKind.tabs },
                        { label: 'Sections', bucket: similarity.byKind.sections },
                        { label: 'Links', bucket: similarity.byKind.links },
                        { label: 'Properties', bucket: similarity.byKind.properties },
                      ] as const
                    ).map(({ label, bucket }) => (
                      <div
                        key={label}
                        className="rounded-lg border border-slate-200/80 dark:border-slate-700 px-2 py-1.5 bg-slate-50/80 dark:bg-slate-800/40"
                      >
                        <div className="font-semibold text-slate-600 dark:text-slate-300">{label}</div>
                        <div className="tabular-nums text-slate-800 dark:text-slate-100">
                          {bucket.percent}% same
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {bucket.same}/{bucket.total}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('matches')}
                    className={`w-full sm:w-auto px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                      viewMode === 'matches'
                        ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100'
                        : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                    }`}
                  >
                    See what matches ({similarity.same})
                  </button>
                </div>
              ) : null}
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {diff.counts.changed} changed · {diff.counts.onlyA} only left · {diff.counts.onlyB} only right ·{' '}
                {diff.counts.unchanged} same
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {kindCounts.tabs} tab(s) · {kindCounts.sections} section(s) · {kindCounts.links} link(s)
                {viewMode === 'matches'
                  ? ' matching'
                  : viewMode === 'diff'
                    ? ' with differences'
                    : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('diff')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${
                    viewMode === 'diff'
                      ? 'border-sky-400 bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Differences only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('matches')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${
                    viewMode === 'matches'
                      ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Matches only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${
                    viewMode === 'all'
                      ? 'border-sky-400 bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  All items
                </button>
                <span
                  className="hidden sm:inline-block w-px h-4 bg-amber-300/80 dark:bg-amber-700/60 mx-0.5"
                  aria-hidden="true"
                />
                {(
                  [
                    { key: 'tabs' as const, label: 'Tabs', count: kindCounts.tabs },
                    { key: 'sections' as const, label: 'Sections', count: kindCounts.sections },
                    { key: 'links' as const, label: 'Links', count: kindCounts.links },
                  ] as const
                ).map(({ key, label, count }) => {
                  const on = kindFilters[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleKindFilter(key)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                        on
                          ? 'border-violet-400 bg-violet-100 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100'
                          : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 opacity-70'
                      }`}
                      title={on ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                    >
                      {label}
                      <span className="ml-1 tabular-nums opacity-80">({count})</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setKindFilters({ tabs: true, sections: true, links: true })}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                >
                  All kinds
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Load a second space (from the list or a JSON file) to see differences.
            </p>
          )}

          {diff && visibleRootFields.length > 0 ? (
            <section>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                {viewMode === 'matches' ? 'Matching space properties' : 'Space properties'}
              </h4>
              <FieldTable fields={visibleRootFields} />
            </section>
          ) : null}

          {diff
            ? visibleTabs.map((tab) => (
                <DiffTreeNode
                  key={`tab-${tab.key}`}
                  node={tab}
                  path={`tab:${tab.key}`}
                  expanded={expanded}
                  onToggle={toggleExpand}
                />
              ))
            : null}

          {diff && visibleMessages.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Messages</h4>
              {visibleMessages.map((msg) => (
                <DiffTreeNode
                  key={`msg-${msg.key}`}
                  node={msg}
                  path={`msg:${msg.key}`}
                  expanded={expanded}
                  onToggle={toggleExpand}
                />
              ))}
            </section>
          ) : null}

          {diff &&
          visibleRootFields.length === 0 &&
          visibleTabs.length === 0 &&
          visibleMessages.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {!kindFilters.tabs || !kindFilters.sections || !kindFilters.links
                ? 'Nothing to show for the selected kinds. Turn on Tabs, Sections, or Links above.'
                : viewMode === 'matches'
                  ? 'No matching tabs, sections, or links between these spaces.'
                  : viewMode === 'diff'
                    ? 'These spaces look the same for compared fields, tabs, sections, and links.'
                    : 'Nothing to show.'}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            Close
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleMergeLeft()}
              disabled={!canMergeLeft}
              title={
                !left?.liveTileId
                  ? 'Left must be a live space (not file-only)'
                  : !left.canEdit
                    ? 'You need edit permission on the left space'
                    : 'Merge into left space'
              }
              className="px-3 py-2 text-sm font-medium rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Merge to left'}
            </button>
            <button
              type="button"
              onClick={() => void handleMergeRight()}
              disabled={!canMergeRight}
              title={
                !right?.liveTileId
                  ? 'Right must be a live space (not a JSON file only)'
                  : !right.canEdit
                    ? 'You need edit permission on the right space'
                    : 'Merge into right space'
              }
              className="px-3 py-2 text-sm font-medium rounded-lg border border-fuchsia-300 dark:border-fuchsia-700 bg-fuchsia-600 text-white hover:bg-fuchsia-700 disabled:opacity-40"
            >
              Merge to right
            </button>
            <button
              type="button"
              onClick={() => void handleCreateNew()}
              disabled={!canCreate}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Create new space
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const SidePanel: React.FC<{
  title: string;
  side: SpaceCompareSide | null;
  error: string | null;
  loading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File | undefined) => void;
  onExport?: () => void;
  onReloadLive?: () => void;
  extra?: React.ReactNode;
}> = ({ title, side, error, loading, fileRef, onFile, onExport, onReloadLive, extra }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-4 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {extra}
        {onReloadLive ? (
          <button
            type="button"
            onClick={onReloadLive}
            className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
          >
            Reload
          </button>
        ) : null}
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
          >
            Export JSON
          </button>
        ) : null}
      </div>
    </div>
    {loading ? <p className="text-xs text-slate-500">Loading…</p> : null}
    <SideSummary side={side} error={error} loading={false} />
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-slate-200 dark:file:border-slate-600 file:bg-slate-50 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
      onChange={(e) => onFile(e.target.files?.[0])}
    />
  </div>
);

const SideSummary: React.FC<{
  side: SpaceCompareSide | null;
  error: string | null;
  loading: boolean;
}> = ({ side, error, loading }) => {
  if (loading) return <p className="text-xs text-slate-500">Loading…</p>;
  if (error) return <p className="text-xs text-rose-700 dark:text-rose-400">{error}</p>;
  if (!side) return <p className="text-xs text-slate-500">No space loaded.</p>;
  const tabs = side.tile.tabs?.length ?? 0;
  const sections = (side.tile.tabs || []).reduce((n, t) => n + (t.sections?.length || 0), 0);
  const links = (side.tile.tabs || []).reduce(
    (n, t) => n + (t.sections || []).reduce((m, s) => m + (s.links?.length || 0), 0),
    0
  );
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
        {side.tile.emoji || '📁'} {side.tile.title}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {side.label}
        {side.liveTileId ? ' · live space' : ' · from JSON file'}
        {side.canEdit ? ' · editable' : ''}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {tabs} tab(s) · {sections} section(s) · {links} link(s)
      </p>
    </div>
  );
};

const FieldTable: React.FC<{ fields: SpaceFieldDiff[] }> = ({ fields }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <th className="text-left px-3 py-2 font-medium w-[22%]">Field</th>
          <th className="text-left px-3 py-2 font-medium">Left</th>
          <th className="text-left px-3 py-2 font-medium">Right</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.field} className={ROW_CLASS[f.status]}>
            <td className="align-top px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
              {f.field}
              <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100/90 dark:bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-normal text-slate-600 dark:text-slate-300">
                {STATUS_LABEL[f.status]}
              </span>
            </td>
            <td className="align-top px-3 py-2 whitespace-pre-wrap break-all font-mono text-xs text-slate-800 dark:text-slate-100">
              {formatFieldValue(f.valueA)}
            </td>
            <td className="align-top px-3 py-2 whitespace-pre-wrap break-all font-mono text-xs text-slate-800 dark:text-slate-100">
              {formatFieldValue(f.valueB)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DiffTreeNode: React.FC<{
  node: SpaceDiffNode;
  path: string;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
}> = ({ node, path, expanded, onToggle }) => {
  const hasChildren = !!(node.children && node.children.length) || !!(node.fields && node.fields.length);
  const isOpen = expanded[path] ?? true;
  const kindLabel =
    node.kind === 'tab'
      ? 'Tab'
      : node.kind === 'section'
        ? 'Section'
        : node.kind === 'link'
          ? 'Link'
          : node.kind === 'richText'
            ? 'Rich text'
            : node.kind === 'message'
              ? 'Message'
              : 'Item';

  return (
    <div className={`rounded-xl border border-slate-200/80 dark:border-slate-700 overflow-hidden ${ROW_CLASS[node.status]}`}>
      <button
        type="button"
        onClick={() => hasChildren && onToggle(path)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px] uppercase tracking-wide text-slate-500 w-16 shrink-0">{kindLabel}</span>
        <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {node.label}
        </span>
        <span className="inline-flex items-center rounded-full bg-white/70 dark:bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
          {STATUS_LABEL[node.status]}
        </span>
        {hasChildren ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        ) : null}
      </button>
      {isOpen && (node.summaryA || node.summaryB) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-3 pb-2 text-[11px] text-slate-600 dark:text-slate-300">
          <div>
            <span className="font-semibold text-sky-700 dark:text-sky-300">Left: </span>
            {node.summaryA || '—'}
          </div>
          <div>
            <span className="font-semibold text-fuchsia-700 dark:text-fuchsia-300">Right: </span>
            {node.summaryB || '—'}
          </div>
        </div>
      ) : null}
      {isOpen && node.fields && node.fields.length > 0 ? (
        <div className="px-3 pb-3">
          <FieldTable fields={node.fields} />
        </div>
      ) : null}
      {isOpen && node.children && node.children.length > 0 ? (
        <div className="px-3 pb-3 space-y-2">
          {node.children.map((child) => (
            <DiffTreeNode
              key={`${path}/${child.kind}-${child.key}`}
              node={child}
              path={`${path}/${child.kind}:${child.key}`}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default SpaceCompareDialog;
