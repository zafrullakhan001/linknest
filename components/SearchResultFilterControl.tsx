import React from 'react';
import { Tile, LinkSection } from '../types';
import { fuzzyTextIncludes, scoreFieldsAgainstWords, scoreLabeledFieldsAgainstWords, matchKindLabel, type SearchMatchScore, type SearchMatchKind, type LabeledSearchField } from '../utils/fuzzySearch';

export type { SearchMatchScore };

export type SearchResultFilter = 'both' | 'tiles' | 'links';
export type SearchWordMode = 'and' | 'or';

export type SearchMatchingLink = {
  id: string;
  label: string;
  url: string;
  icon?: string;
  browser?: string | null;
  health?: any;
  richTextContent?: string;
  maintenanceEnabled?: boolean;
  maintenanceMessage?: string;
  maintenanceVideoUrl?: string;
  notes?: string;
  tooltip?: string;
  notesEnabled?: boolean;
  tooltipStyle?: 'rich' | 'classic';
  shortUrl?: string;
  match?: SearchMatchScore;
  tile: {
    id: string;
    title: string;
    emoji: string;
    themeColor: string;
    browser?: string | null;
    showShortUrls?: boolean;
  };
};

const FILTER_OPTIONS: { value: SearchResultFilter; label: string; title: string }[] = [
  { value: 'both', label: 'Both', title: 'Show matching tiles and links' },
  { value: 'tiles', label: 'Tiles', title: 'Show matching tiles only' },
  { value: 'links', label: 'Links', title: 'Show matching links only' },
];

export function parseSearchResultFilter(value: string | null | undefined): SearchResultFilter {
  if (value === 'tiles' || value === 'links' || value === 'both') return value;
  return 'both';
}

export function parseSearchWordMode(value: string | null | undefined): SearchWordMode {
  return value === 'or' ? 'or' : 'and';
}

export function parseSearchFuzzy(value: string | null | undefined): boolean {
  return value === '1' || value === 'true';
}

export function parseSearchIncludeUrls(value: string | null | undefined): boolean {
  return value !== '0' && value !== 'false';
}

function linkSearchFields(
  link: { label?: string; url?: string; notes?: string; tooltip?: string; richTextContent?: string },
  includeUrls: boolean
): Array<string | undefined | null> {
  return [link.label, includeUrls ? link.url : undefined, link.notes, link.tooltip, link.richTextContent, (link as { maintenanceMessage?: string }).maintenanceMessage];
}

export function getSearchWords(searchTerm: string): string[] {
  return searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
}

export function textMatchesSearch(
  text: string | undefined | null,
  words: string[],
  mode: SearchWordMode,
  fuzzy = false
): boolean {
  if (words.length === 0) return true;
  const hay = (text || '').toLowerCase();
  if (!hay) return false;
  const matchesWord = (word: string) => (fuzzy ? fuzzyTextIncludes(hay, word) : hay.includes(word));
  return mode === 'and' ? words.every(matchesWord) : words.some(matchesWord);
}

export function fieldsMatchSearch(
  fields: Array<string | undefined | null>,
  words: string[],
  mode: SearchWordMode,
  fuzzy = false
): boolean {
  return textMatchesSearch(fields.filter(Boolean).join('\n'), words, mode, fuzzy);
}

export function getTileSearchFields(tile: Tile, includeUrls = true): Array<string | undefined | null> {
  return getTileLabeledFields(tile, includeUrls).map((field) => field.text);
}

export function getTileLabeledFields(tile: Tile, includeUrls = true): LabeledSearchField[] {
  const fields: LabeledSearchField[] = [
    { text: tile.title, sourceLabel: 'Title' },
    { text: tile.description, sourceLabel: 'Description' },
    { text: tile.emoji, sourceLabel: 'Emoji' },
    ...(tile.searchTags ?? []).map((tag) => ({ text: tag, sourceLabel: 'Tag', sourceName: tag })),
    { text: includeUrls ? tile.hyperlinkUrl : undefined, sourceLabel: 'Hyperlink URL' }
  ];

  const addLinkFields = (link: { label?: string; url?: string; notes?: string; tooltip?: string; richTextContent?: string }) => {
    const linkName = (link.label || '').replace(/<[^>]*>/g, '').trim() || 'Untitled link';
    fields.push({ text: link.label, sourceLabel: 'Link name', sourceName: linkName });
    if (includeUrls) fields.push({ text: link.url, sourceLabel: 'Link URL', sourceName: linkName });
    fields.push({ text: link.notes, sourceLabel: 'Link notes', sourceName: linkName });
    fields.push({ text: link.tooltip, sourceLabel: 'Link tooltip', sourceName: linkName });
    fields.push({ text: link.richTextContent, sourceLabel: 'Link content', sourceName: linkName });
  };

  (tile.searchLinks ?? []).forEach(addLinkFields);

  (tile.tabs ?? []).forEach((tab) => {
    fields.push({ text: tab.title, sourceLabel: 'Tab' });
    (tab.sections ?? []).forEach((section) => {
      fields.push({ text: section.title, sourceLabel: 'Section' });
      (section.links ?? []).forEach(addLinkFields);
      (section.richTextContent ?? []).forEach((rt) => {
        fields.push({ text: rt.content, sourceLabel: 'Section content', sourceName: section.title });
      });
    });
  });

  (tile.sections ?? []).forEach((section) => {
    fields.push({ text: section.title, sourceLabel: 'Section' });
    (section.links ?? []).forEach(addLinkFields);
    (section.richTextContent ?? []).forEach((rt) => {
      fields.push({ text: rt.content, sourceLabel: 'Section content', sourceName: section.title });
    });
  });

  return fields;
}

export function getLinkLabeledFields(link: SearchMatchingLink, includeUrls = true): LabeledSearchField[] {
  return [
    { text: link.label, sourceLabel: 'Link name' },
    { text: includeUrls ? link.url : undefined, sourceLabel: 'Link URL' },
    { text: link.notes, sourceLabel: 'Link notes' },
    { text: link.tooltip, sourceLabel: 'Link tooltip' },
    { text: link.richTextContent, sourceLabel: 'Link content' }
  ];
}

export function tileMatchesSearch(tile: Tile, words: string[], mode: SearchWordMode, fuzzy = false, includeUrls = true): boolean {
  if (words.length === 0) return true;
  return fieldsMatchSearch(getTileSearchFields(tile, includeUrls), words, mode, fuzzy);
}

export function scoreTileSearch(tile: Tile, words: string[], mode: SearchWordMode, fuzzy = false, includeUrls = true): SearchMatchScore {
  return scoreLabeledFieldsAgainstWords(getTileLabeledFields(tile, includeUrls), words, mode, fuzzy);
}

export function scoreLinkSearch(link: SearchMatchingLink, words: string[], mode: SearchWordMode, fuzzy = false, includeUrls = true): SearchMatchScore {
  return scoreLabeledFieldsAgainstWords(getLinkLabeledFields(link, includeUrls), words, mode, fuzzy);
}

export interface MatchingSearchTag {
  tag: string;
  tileCount: number;
  match: SearchMatchScore;
}

export function collectMatchingSearchTags(
  tiles: Tile[],
  words: string[],
  mode: SearchWordMode,
  fuzzy = false
): MatchingSearchTag[] {
  if (words.length === 0) return [];

  const byTag = new Map<string, MatchingSearchTag>();
  tiles.forEach((tile) => {
    (tile.searchTags ?? []).forEach((tag) => {
      const match = scoreFieldsAgainstWords([tag], words, mode, fuzzy);
      if (!match.matched) return;
      const key = tag.toLowerCase();
      const existing = byTag.get(key);
      if (existing) {
        existing.tileCount += 1;
        if (match.score > existing.match.score) existing.match = match;
      } else {
        byTag.set(key, { tag, tileCount: 1, match });
      }
    });
  });

  return Array.from(byTag.values()).sort((a, b) => b.match.score - a.match.score || b.tileCount - a.tileCount);
}

export function scoreTagSearch(tag: string, words: string[], mode: SearchWordMode, fuzzy = false): SearchMatchScore {
  return scoreFieldsAgainstWords([tag], words, mode, fuzzy);
}

export function collectMatchingSearchLinks(
  groups: Record<string, Tile[]>,
  searchTerm: string,
  wordMode: SearchWordMode = 'and',
  fuzzy = false,
  includeUrls = true
): SearchMatchingLink[] {
  const words = getSearchWords(searchTerm);
  if (words.length === 0) return [];

  const uniqueLinksMap = new Map<string, SearchMatchingLink>();

  Object.values(groups).forEach((groupTiles: Tile[]) => {
    groupTiles.forEach((tile) => {
      const addMatchingLink = (link: {
        id: string;
        label: string;
        url: string;
        icon?: string;
        browser?: string | null;
        health?: unknown;
        richTextContent?: string;
        maintenanceEnabled?: boolean;
        maintenanceMessage?: string;
        maintenanceVideoUrl?: string;
        notes?: string;
        tooltip?: string;
        notesEnabled?: boolean;
        tooltipStyle?: 'rich' | 'classic';
        shortUrl?: string;
      }) => {
        const uniqueKey = `${(link.label || '').toLowerCase()}|${(link.url || '').toLowerCase()}`;
        if (uniqueLinksMap.has(uniqueKey)) return;

        const matches = fieldsMatchSearch(
          linkSearchFields(link, includeUrls),
          words,
          wordMode,
          fuzzy
        );

        if (!matches) return;

        uniqueLinksMap.set(uniqueKey, {
          id: link.id,
          label: link.label,
          url: link.url,
          icon: link.icon,
          browser: link.browser,
          health: link.health,
          richTextContent: link.richTextContent,
          maintenanceEnabled: link.maintenanceEnabled,
          maintenanceMessage: link.maintenanceMessage,
          maintenanceVideoUrl: link.maintenanceVideoUrl,
          notes: link.notes,
          tooltip: link.tooltip,
          notesEnabled: link.notesEnabled,
          tooltipStyle: link.tooltipStyle,
          shortUrl: link.shortUrl,
          tile: {
            id: tile.id,
            title: tile.title,
            emoji: tile.emoji || '✨',
            themeColor: tile.themeColor || 'blue',
            browser: tile.browser,
            showShortUrls: tile.showShortUrls === true,
          }
        });
      };

      const processSections = (sections: LinkSection[]) => {
        sections.forEach((section) => {
          section.links?.forEach(addMatchingLink);
        });
      };

      if (tile.searchLinks && tile.searchLinks.length > 0) {
        tile.searchLinks.forEach(addMatchingLink);
      }

      if (tile.sections) {
        processSections(tile.sections);
      }

      if (tile.tabs) {
        tile.tabs.forEach((tab) => {
          if (tab.sections) {
            processSections(tab.sections);
          }
        });
      }
    });
  });

  return Array.from(uniqueLinksMap.values());
}

export function filterGroupedTilesBySearch(
  groups: Record<string, Tile[]>,
  searchTerm: string,
  mode: SearchWordMode,
  fuzzy = false,
  includeUrls = true
): Record<string, Tile[]> {
  const words = getSearchWords(searchTerm);
  if (words.length === 0) return groups;

  const next: Record<string, Tile[]> = {};
  Object.entries(groups).forEach(([name, groupTiles]) => {
    const matched = groupTiles.filter((tile) => tileMatchesSearch(tile, words, mode, fuzzy, includeUrls));
    if (matched.length > 0) next[name] = matched;
  });
  return next;
}

export function matchingLinkMatchesSearch(
  link: SearchMatchingLink,
  words: string[],
  mode: SearchWordMode,
  fuzzy = false,
  includeUrls = true
): boolean {
  return fieldsMatchSearch(linkSearchFields(link, includeUrls), words, mode, fuzzy);
}

interface SearchResultFilterControlProps {
  value: SearchResultFilter;
  onChange: (value: SearchResultFilter) => void;
  className?: string;
}

export const SearchResultFilterControl: React.FC<SearchResultFilterControlProps> = ({
  value,
  onChange,
  className = ''
}) => {
  return (
    <div
      className={`flex bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 shadow-sm flex-shrink-0 ${className}`}
      role="group"
      aria-label="Filter search results"
    >
      {FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
            value === option.value
              ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          title={option.title}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const WORD_MODE_OPTIONS: { value: SearchWordMode; label: string; title: string }[] = [
  { value: 'and', label: 'AND', title: 'Match only when every word is found' },
  { value: 'or', label: 'OR', title: 'Match when any word is found' },
];

interface SearchWordModeControlProps {
  value: SearchWordMode;
  onChange: (value: SearchWordMode) => void;
  className?: string;
}

export const SearchWordModeControl: React.FC<SearchWordModeControlProps> = ({
  value,
  onChange,
  className = ''
}) => {
  return (
    <div
      className={`flex bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 shadow-sm flex-shrink-0 ${className}`}
      role="group"
      aria-label="Match spaced words with AND or OR"
    >
      {WORD_MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
            value === option.value
              ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          title={option.title}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

interface FuzzySearchControlProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}

export const FuzzySearchControl: React.FC<FuzzySearchControlProps> = ({
  enabled,
  onChange,
  className = ''
}) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap flex-shrink-0 ${
        enabled
          ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-800 shadow-sm'
          : 'bg-white/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
      } ${className}`}
      title="Match similar-sounding words and common misspellings"
      aria-pressed={enabled}
    >
      Fuzzy
    </button>
  );
};

interface SearchIncludeUrlsControlProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}

export const SearchIncludeUrlsControl: React.FC<SearchIncludeUrlsControlProps> = ({
  enabled,
  onChange,
  className = ''
}) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap flex-shrink-0 ${
        enabled
          ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-800 shadow-sm'
          : 'bg-white/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
      } ${className}`}
      title={enabled ? 'URLs are included in search. Click to ignore URLs.' : 'URLs are ignored. Click to include URLs in search.'}
      aria-pressed={enabled}
    >
      {enabled ? 'URLs on' : 'URLs off'}
    </button>
  );
};

interface RefineSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export interface SearchStatsSummary {
  query: string;
  refineQuery: string;
  categoryCount: number;
  tileCount: number;
  linkCount: number;
  exactCount: number;
  similarCount: number;
  avgScore: number;
  bestScore: number;
  tagCount: number;
  tagTileCount: number;
  tagExactCount: number;
  tagSimilarCount: number;
  tagAvgScore: number;
  tagBestScore: number;
  matchedTags: Array<{ tag: string; score: number; kind: SearchMatchKind; tileCount: number }>;
}

export function combineSearchScores(primary: SearchMatchScore, refine?: SearchMatchScore): SearchMatchScore {
  if (!refine || !refine.matched) return primary;
  if (!primary.matched) return primary;
  const weaker = refine.score < primary.score ? refine : primary;
  return {
    matched: true,
    score: Math.round((primary.score + refine.score) / 2),
    kind: weaker.kind,
    token: weaker.token,
    source: primary.source,
    sourceName: primary.sourceName,
    snippet: primary.snippet,
    extraCount: (primary.extraCount || 0) + (refine.source && refine.source !== primary.source ? 1 : 0)
  };
}

export function formatMatchReason(match?: SearchMatchScore): string {
  if (!match?.matched || !match.source) return '';
  const name = match.sourceName ? ` in “${match.sourceName}”` : '';
  const extra = match.extraCount ? ` +${match.extraCount} more` : '';
  return `${match.source}${name}${extra}`;
}

function scoreBadgeClasses(score: number): string {
  if (score >= 90) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (score >= 75) return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
}

export const MatchScoreBadge: React.FC<{ match?: SearchMatchScore; className?: string; showReason?: boolean }> = ({
  match,
  className = '',
  showReason = true
}) => {
  if (!match?.matched) return null;
  const label = matchKindLabel(match.kind);
  const reason = formatMatchReason(match);
  const title = [
    `${label} match${match.token ? ` for “${match.token}”` : ''}`,
    `${match.score}% probability`,
    reason,
    match.snippet
  ].filter(Boolean).join(' · ');

  return (
    <span
      className={`inline-flex flex-col items-start gap-0.5 max-w-full ${className}`}
      title={title}
    >
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${scoreBadgeClasses(match.score)}`}>
        {match.score}%
        <span className="font-medium opacity-80 hidden sm:inline">{label}</span>
      </span>
      {showReason && reason && (
        <span className={`text-[10px] leading-snug line-clamp-3 ${
          /notes|tooltip|content|tag/i.test(match.source || '')
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-slate-500 dark:text-slate-400'
        }`}>
          <span className="font-medium">Matched: {reason}</span>
          {match.snippet ? <span className="block mt-0.5 opacity-90">“{match.snippet}”</span> : null}
        </span>
      )}
    </span>
  );
};

export const SearchStatsBar: React.FC<{ stats: SearchStatsSummary }> = ({ stats }) => {
  const barColor = stats.avgScore >= 90 ? 'bg-emerald-500' : stats.avgScore >= 75 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-slate-800 dark:text-slate-100">Search stats</span>
        <span>{stats.tileCount} {stats.tileCount === 1 ? 'tile' : 'tiles'}</span>
        <span>{stats.linkCount} matching {stats.linkCount === 1 ? 'link' : 'links'}</span>
        <span>{stats.categoryCount} {stats.categoryCount === 1 ? 'category' : 'categories'}</span>
        <span className="text-emerald-600 dark:text-emerald-400">{stats.exactCount} exact</span>
        <span className="text-amber-600 dark:text-amber-400">{stats.similarCount} similar</span>
        <span className="font-semibold text-brand-600 dark:text-brand-400">Avg {stats.avgScore}%</span>
        <span>Best {stats.bestScore}%</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-violet-700 dark:text-violet-300">Tags</span>
        <span>{stats.tagCount} matching {stats.tagCount === 1 ? 'tag' : 'tags'}</span>
        <span>{stats.tagTileCount} {stats.tagTileCount === 1 ? 'tile' : 'tiles'} with tags</span>
        <span className="text-emerald-600 dark:text-emerald-400">{stats.tagExactCount} exact</span>
        <span className="text-amber-600 dark:text-amber-400">{stats.tagSimilarCount} similar</span>
        <span className="font-semibold text-violet-600 dark:text-violet-300">Avg {stats.tagAvgScore}%</span>
        <span>Best {stats.tagBestScore}%</span>
      </div>
      {stats.matchedTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {stats.matchedTags.map((item) => (
            <span
              key={item.tag}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${scoreBadgeClasses(item.score)}`}
              title={`${item.tag} · ${matchKindLabel(item.kind)} · ${item.score}% · ${item.tileCount} ${item.tileCount === 1 ? 'tile' : 'tiles'}`}
            >
              {item.tag}
              <span className="opacity-70">{item.score}%</span>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(stats.avgScore, 4)}%` }} />
        </div>
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {stats.avgScore}% match probability
        </span>
      </div>
      {stats.refineQuery && (
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
          Refined with “{stats.refineQuery}”
        </p>
      )}
    </div>
  );
};

export const RefineSearchInput: React.FC<RefineSearchInputProps> = ({
  value,
  onChange,
  className = ''
}) => {
  return (
    <div className={`relative flex-shrink-0 ${className || 'w-40 sm:w-52'}`}>
      <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-slate-400">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Refine results..."
        aria-label="Search within current results"
        title="Search within the current results"
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          title="Clear refine search"
          aria-label="Clear refine search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
};
