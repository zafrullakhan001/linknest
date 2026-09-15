import React, { useEffect, useMemo, useState } from 'react';
import { Tile } from '../types';
import { getTiles } from '../services/storageService';
import {
    appendBulkMonitorLines,
    bulkLineKey,
    parseBulkMonitorLines,
} from '../utils/monitorBulkImport';
import {
    BulkSpaceLink,
    BulkSpaceSearchMode,
    collectTileBulkLinks,
} from '../utils/monitorBulkSpaceLinks';

interface MonitorBulkSpaceSearchProps {
    mode: BulkSpaceSearchMode;
    existingText?: string;
    onAddUrls?: (nextText: string) => void;
    accent?: 'emerald' | 'amber';
    /** Single-URL pick: fill Smart Setup and analyze instead of appending to a list. */
    onPickUrl?: (url: string) => void;
    pickActionLabel?: string;
    selectedUrl?: string;
    busy?: boolean;
    compact?: boolean;
}

type AccentTheme = {
    border: string;
    bg: string;
    heading: string;
    muted: string;
    input: string;
    btn: string;
    btnGhost: string;
    rowHover: string;
    added: string;
};

const THEMES: Record<'emerald' | 'amber', AccentTheme> = {
    emerald: {
        border: 'border-sky-100 dark:border-sky-900/40',
        bg: 'bg-sky-50/60 dark:bg-sky-950/20',
        heading: 'text-sky-900 dark:text-sky-100',
        muted: 'text-sky-800/70 dark:text-sky-200/60',
        input: 'border-sky-200 focus:border-sky-400 focus:ring-sky-100',
        btn: 'bg-sky-600 hover:bg-sky-700 text-white',
        btnGhost: 'text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/40',
        rowHover: 'hover:bg-sky-50/80 dark:hover:bg-sky-950/30',
        added: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    },
    amber: {
        border: 'border-orange-100 dark:border-orange-900/40',
        bg: 'bg-orange-50/50 dark:bg-orange-950/15',
        heading: 'text-amber-900 dark:text-amber-100',
        muted: 'text-amber-800/70 dark:text-amber-200/60',
        input: 'border-amber-200 focus:border-amber-400 focus:ring-amber-100',
        btn: 'bg-amber-600 hover:bg-amber-700 text-white',
        btnGhost: 'text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40',
        rowHover: 'hover:bg-amber-50/80 dark:hover:bg-amber-950/30',
        added: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    },
};

function mergeTiles(publicTiles: Tile[], stagingTiles: Tile[]): Tile[] {
    const byId = new Map<string, Tile>();
    publicTiles.forEach((tile) => byId.set(tile.id, tile));
    stagingTiles.forEach((tile) => {
        if (!byId.has(tile.id)) byId.set(tile.id, tile);
    });
    return Array.from(byId.values()).sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    );
}

function getSearchWords(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function textMatchesWords(text: string | undefined | null, words: string[]): boolean {
    if (words.length === 0) return true;
    const hay = String(text || '').toLowerCase();
    if (!hay) return false;
    return words.every((word) => hay.includes(word));
}

function fieldsMatchWords(fields: Array<string | undefined | null>, words: string[]): boolean {
    return textMatchesWords(fields.filter(Boolean).join('\n'), words);
}

function linkMatchesQuery(link: BulkSpaceLink, words: string[]): boolean {
    if (words.length === 0) return true;
    return fieldsMatchWords([link.label, link.url], words);
}

export const MonitorBulkSpaceSearch: React.FC<MonitorBulkSpaceSearchProps> = ({
    mode,
    existingText = '',
    onAddUrls,
    accent = 'emerald',
    onPickUrl,
    pickActionLabel = 'Analyze',
    selectedUrl,
    busy = false,
    compact = false,
}) => {
    const pickMode = typeof onPickUrl === 'function';
    const theme = THEMES[accent];
    const [query, setQuery] = useState('');
    const [tiles, setTiles] = useState<Tile[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
    const [status, setStatus] = useState<string | null>(null);

    const existingKeys = useMemo(
        () => new Set(parseBulkMonitorLines(existingText).map(bulkLineKey)),
        [existingText]
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            getTiles(),
            getTiles({ sourceTab: 'staging' }).catch(() => [] as Tile[]),
        ])
            .then(([publicTiles, stagingTiles]) => {
                if (cancelled) return;
                setTiles(mergeTiles(publicTiles, stagingTiles));
                setLoadError(null);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setLoadError(err instanceof Error ? err.message : 'Failed to load spaces');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const words = useMemo(() => getSearchWords(query), [query]);

    useEffect(() => {
        setExpandedIds({});
    }, [query]);

    const spaces = useMemo(() => {
        return tiles
            .map((tile) => {
                const allLinks = collectTileBulkLinks(tile, mode);
                if (allLinks.length === 0) {
                    return null;
                }
                const spaceMetaHit = fieldsMatchWords(
                    [
                        tile.title,
                        tile.description,
                        tile.emoji,
                        tile.group,
                        tile.hyperlinkUrl,
                        ...(tile.searchTags ?? []),
                    ],
                    words
                );
                const matchingLinks =
                    words.length === 0 || spaceMetaHit
                        ? allLinks
                        : allLinks.filter((link) => linkMatchesQuery(link, words));
                if (words.length > 0 && !spaceMetaHit && matchingLinks.length === 0) {
                    return null;
                }
                return { tile, allLinks, matchingLinks };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null);
    }, [tiles, mode, words]);

    const matchingUrlCount = useMemo(() => {
        const seen = new Set<string>();
        spaces.forEach((row) => {
            row.matchingLinks.forEach((link) => {
                const key = bulkLineKey(link.url);
                if (pickMode || !existingKeys.has(key)) seen.add(key);
            });
        });
        return seen.size;
    }, [spaces, existingKeys, pickMode]);

    const applyUrls = (urls: string[], emptyMessage: string) => {
        if (!onAddUrls) return;
        const result = appendBulkMonitorLines(existingText, urls);
        if (result.added === 0) {
            if (result.capped > 0) {
                setStatus(`Already at the 100-target limit (${result.capped} not added).`);
            } else {
                setStatus(emptyMessage);
            }
            return;
        }
        onAddUrls(result.text);
        const extra = [
            result.duplicates ? `${result.duplicates} already listed` : '',
            result.capped ? `${result.capped} over the 100 limit` : '',
        ].filter(Boolean);
        setStatus(
            extra.length
                ? `Added ${result.added}. ${extra.join(' · ')}.`
                : `Added ${result.added} URL${result.added === 1 ? '' : 's'}.`
        );
    };

    const pickUrl = (url: string) => {
        if (!onPickUrl || busy) return;
        setStatus(`Analyzing ${url}…`);
        onPickUrl(url);
    };

    const autoExpandedIds = useMemo(() => {
        if (words.length === 0) return new Set<string>();
        return new Set(spaces.slice(0, 8).map((row) => row.tile.id));
    }, [words.length, spaces]);

    const isExpanded = (id: string) =>
        expandedIds[id] !== undefined ? expandedIds[id] : autoExpandedIds.has(id);

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => ({
            ...prev,
            [id]: !isExpanded(id),
        }));
    };

    const noun = mode === 'ssl' ? 'HTTPS host' : 'URL';
    const selectedKey = selectedUrl ? bulkLineKey(selectedUrl) : '';

    return (
        <section
            className={
                compact
                    ? 'space-y-3'
                    : `rounded-xl border ${theme.border} ${theme.bg} p-4 space-y-3 shadow-sm`
            }
        >
            {!compact && (
                <div className="flex items-start gap-2.5 pb-2 border-b border-black/5 dark:border-white/10">
                    <span className="text-xl" aria-hidden="true">🔎</span>
                    <div className="min-w-0 flex-1">
                        <h3 className={`text-sm font-semibold ${theme.heading}`}>Search spaces</h3>
                        <p className={`text-xs ${theme.muted}`}>
                            Find a space and add its {noun}s to the list — no copy-paste needed.
                        </p>
                    </div>
                </div>
            )}

            <div className="relative">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search spaces, tags, or URLs…"
                    autoComplete="off"
                    className={`w-full rounded-lg border bg-white/90 px-3 py-2 pl-9 text-sm text-gray-900 outline-none focus:ring-2 transition-colors dark:border-[#444] dark:bg-[#252525] dark:text-white ${theme.input}`}
                />
                <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs ${theme.muted}`}>
                    {loading
                        ? 'Loading spaces…'
                        : pickMode
                          ? `${spaces.length} space${spaces.length === 1 ? '' : 's'} · ${matchingUrlCount} ${noun}${matchingUrlCount === 1 ? '' : 's'}`
                          : `${spaces.length} space${spaces.length === 1 ? '' : 's'} · ${matchingUrlCount} new ${noun}${matchingUrlCount === 1 ? '' : 's'}`}
                </p>
                {!pickMode && (
                    <button
                        type="button"
                        disabled={loading || matchingUrlCount === 0 || words.length === 0}
                        onClick={() => {
                            const urls = spaces.flatMap((row) => row.matchingLinks.map((link) => link.url));
                            applyUrls(urls, 'Those URLs are already in the list.');
                        }}
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg disabled:opacity-40 ${theme.btnGhost}`}
                        title={words.length === 0 ? 'Type a search first to add every matching URL' : undefined}
                    >
                        Add all matching
                    </button>
                )}
            </div>

            <div
                className={`rounded-lg border border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#1e1e1e] overflow-y-auto ${
                    compact ? 'max-h-[220px]' : 'max-h-[280px]'
                }`}
            >
                {loading ? (
                    <p className="px-3 py-8 text-center text-sm text-gray-500">Loading spaces…</p>
                ) : loadError ? (
                    <p className="px-3 py-8 text-center text-sm text-red-600">{loadError}</p>
                ) : spaces.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-gray-500">
                        {query.trim()
                            ? 'No spaces or URLs match that search.'
                            : 'No spaces with addable URLs yet.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-[#333]">
                        {spaces.map(({ tile, allLinks, matchingLinks }) => {
                            const expanded = isExpanded(tile.id);
                            const remaining = matchingLinks.filter(
                                (link) => !existingKeys.has(bulkLineKey(link.url))
                            ).length;
                            const singlePick = pickMode && matchingLinks.length === 1;
                            return (
                                <li key={tile.id}>
                                    <div className={`flex items-center gap-2 px-3 py-2 ${theme.rowHover}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleExpanded(tile.id)}
                                            className="min-w-0 flex-1 flex items-center gap-2 text-left"
                                            aria-expanded={expanded}
                                        >
                                            <span className="text-gray-400 text-xs w-3 shrink-0" aria-hidden="true">
                                                {expanded ? '▾' : '▸'}
                                            </span>
                                            <span className="text-base leading-none shrink-0" aria-hidden="true">
                                                {tile.emoji || '📁'}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                                                    {tile.title}
                                                </span>
                                                <span className="block truncate text-[11px] text-gray-500">
                                                    {tile.group ? `${tile.group} · ` : ''}
                                                    {matchingLinks.length}
                                                    {matchingLinks.length !== allLinks.length
                                                        ? ` of ${allLinks.length}`
                                                        : ''}{' '}
                                                    {noun}
                                                    {matchingLinks.length === 1 ? '' : 's'}
                                                    {tile.sourceTab === 'staging' ? ' · Staging' : ''}
                                                </span>
                                            </span>
                                        </button>
                                        {pickMode ? (
                                            singlePick ? (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => pickUrl(matchingLinks[0].url)}
                                                    className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md disabled:opacity-40 ${theme.btn}`}
                                                >
                                                    {pickActionLabel}
                                                </button>
                                            ) : null
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={remaining === 0}
                                                onClick={() =>
                                                    applyUrls(
                                                        matchingLinks.map((link) => link.url),
                                                        'Already added from this space.'
                                                    )
                                                }
                                                className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md disabled:opacity-40 ${theme.btn}`}
                                            >
                                                {remaining === 0 ? 'Added' : `Add ${remaining}`}
                                            </button>
                                        )}
                                    </div>
                                    {expanded && (
                                        <ul className="pb-2 px-3 space-y-1">
                                            {matchingLinks.map((link) => {
                                                const already = existingKeys.has(bulkLineKey(link.url));
                                                const selected = selectedKey !== '' && bulkLineKey(link.url) === selectedKey;
                                                return (
                                                    <li
                                                        key={link.id}
                                                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                                                            selected
                                                                ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-800'
                                                                : 'bg-gray-50/80 dark:bg-[#252525]'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">
                                                                {link.label}
                                                            </div>
                                                            <div className="truncate font-mono text-[10px] text-gray-500">
                                                                {link.url}
                                                            </div>
                                                        </div>
                                                        {pickMode ? (
                                                            selected && busy ? (
                                                                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${theme.added}`}>
                                                                    Analyzing…
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    onClick={() => pickUrl(link.url)}
                                                                    className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md disabled:opacity-40 ${theme.btnGhost}`}
                                                                >
                                                                    {selected ? 'Again' : pickActionLabel}
                                                                </button>
                                                            )
                                                        ) : already ? (
                                                            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${theme.added}`}>
                                                                Added
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    applyUrls([link.url], 'That URL is already in the list.')
                                                                }
                                                                className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md ${theme.btnGhost}`}
                                                            >
                                                                Add
                                                            </button>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {status && (
                <p className={`text-xs ${theme.muted}`} role="status">
                    {status}
                </p>
            )}
        </section>
    );
};
