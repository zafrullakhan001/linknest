import { Tile, Tab, LinkSection, Link, RichTextContent, TileMessage } from '../types';
import { generateUuid } from './idService';
import {
  exportTileToFileAsync,
  parseSpaceExportObject,
  type SpaceExportFile,
} from './spaceTransferService';

export type SpaceDiffStatus = 'unchanged' | 'changed' | 'onlyA' | 'onlyB';

export type SpaceDiffKind = 'root' | 'tab' | 'section' | 'link' | 'richText' | 'message' | 'field';

export interface SpaceFieldDiff {
  field: string;
  status: SpaceDiffStatus;
  valueA: unknown;
  valueB: unknown;
}

export interface SpaceDiffNode {
  key: string;
  kind: SpaceDiffKind;
  label: string;
  status: SpaceDiffStatus;
  summaryA?: string;
  summaryB?: string;
  fields?: SpaceFieldDiff[];
  children?: SpaceDiffNode[];
}

export interface SpaceDiffResult {
  rootFields: SpaceFieldDiff[];
  tabs: SpaceDiffNode[];
  messages: SpaceDiffNode[];
  counts: {
    unchanged: number;
    changed: number;
    onlyA: number;
    onlyB: number;
  };
}

export interface SpaceCompareSide {
  tile: Tile;
  /** Live tile id when loaded from the app; null when from a JSON file only. */
  liveTileId: string | null;
  label: string;
  canEdit: boolean;
}

const ROOT_FIELDS = [
  'title',
  'description',
  'htmlContent',
  'emoji',
  'group',
  'visibility',
  'themeColor',
  'isHyperlink',
  'hyperlinkUrl',
  'openInNewTab',
  'isVideo',
  'videoUrl',
  'videoSource',
  'browser',
  'pageAnimation',
  'linksAnimation',
  'showEmoji',
  'showTitle',
  'showDescription',
  'tileBackgroundColor',
  'tileTextColor',
] as const;

const TAB_FIELDS = ['title', 'emoji', 'visibility', 'published', 'textColor'] as const;
const SECTION_FIELDS = ['title', 'emoji', 'visibility', 'published', 'textColor', 'forceStackedView'] as const;
const LINK_FIELDS = [
  'label',
  'url',
  'icon',
  'visibility',
  'published',
  'notes',
  'tooltip',
  'browser',
  'textColor',
  'richTextContent',
] as const;
const RICH_TEXT_FIELDS = ['content', 'boxed', 'boxTitle', 'visibility'] as const;
const MESSAGE_FIELDS = ['content', 'type', 'isActive', 'displayLocation', 'tabIds', 'showOnCard', 'animationType'] as const;

const normalizeTitle = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeUrl = (value: unknown): string => {
  let url = String(value ?? '').trim().toLowerCase();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return url.replace(/\/+$/, '');
  }
};

const stripHtml = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const valuesEqual = (a: unknown, b: unknown): boolean => {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a ?? '') === String(b ?? '');
};

const diffFields = (
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
  fields: readonly string[]
): SpaceFieldDiff[] => {
  const result: SpaceFieldDiff[] = [];
  for (const field of fields) {
    const valueA = a ? a[field] : undefined;
    const valueB = b ? b[field] : undefined;
    if (!a && b) {
      result.push({ field, status: 'onlyB', valueA: null, valueB });
    } else if (a && !b) {
      result.push({ field, status: 'onlyA', valueA, valueB: null });
    } else if (!valuesEqual(valueA, valueB)) {
      result.push({ field, status: 'changed', valueA, valueB });
    } else {
      result.push({ field, status: 'unchanged', valueA, valueB });
    }
  }
  return result;
};

const ensureTabs = (tile: Tile): Tab[] => {
  if (Array.isArray(tile.tabs) && tile.tabs.length > 0) return tile.tabs;
  if (Array.isArray(tile.sections) && tile.sections.length > 0) {
    return [
      {
        id: 'legacy-sections',
        title: 'Main',
        position: 0,
        sections: tile.sections,
      },
    ];
  }
  return [];
};

const tabKey = (tab: Tab): string => normalizeTitle(tab.title) || `tab:${tab.id}`;
const sectionKey = (section: LinkSection): string =>
  normalizeTitle(section.title) || `section:${section.id}`;
const linkKey = (link: Link): string => {
  const url = normalizeUrl(link.url);
  if (url) return `url:${url}`;
  return `label:${normalizeTitle(link.label)}:${link.id}`;
};
const richTextKey = (item: RichTextContent): string => {
  const text = stripHtml(String(item.content || ''));
  return text ? `rt:${text.slice(0, 120)}` : `rt:${item.id}`;
};
const messageKey = (msg: TileMessage): string => {
  const text = stripHtml(String(msg.content || ''));
  return text ? `msg:${text.slice(0, 120)}` : `msg:${msg.id || ''}`;
};

/** Assign unique keys within a list (duplicate titles get #2, #3, …). */
const uniqueKeys = <T>(list: T[], getKey: (item: T) => string): Array<{ key: string; item: T }> => {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const base = getKey(item);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base}#${count}`;
    return { key, item };
  });
};

/**
 * Pair items from A and B by semantic key.
 * Same-base duplicates pair in order (first A with first B, etc.).
 */
const pairByKey = <T>(
  listA: T[],
  listB: T[],
  getKey: (item: T) => string
): Array<{ key: string; a?: T; b?: T }> => {
  const keyedA = uniqueKeys(listA, getKey);
  const keyedB = uniqueKeys(listB, getKey);
  const mapA = new Map(keyedA.map(({ key, item }) => [key, item]));
  const mapB = new Map(keyedB.map(({ key, item }) => [key, item]));
  const order = [...new Set([...keyedA.map((x) => x.key), ...keyedB.map((x) => x.key)])];
  return order.map((key) => ({ key, a: mapA.get(key), b: mapB.get(key) }));
};

const nodeStatusFromChildren = (
  fields: SpaceFieldDiff[],
  children: SpaceDiffNode[],
  hasA: boolean,
  hasB: boolean
): SpaceDiffStatus => {
  if (hasA && !hasB) return 'onlyA';
  if (!hasA && hasB) return 'onlyB';
  const fieldChanged = fields.some((f) => f.status !== 'unchanged');
  const childChanged = children.some((c) => c.status !== 'unchanged');
  return fieldChanged || childChanged ? 'changed' : 'unchanged';
};

const countStatuses = (
  nodes: SpaceDiffNode[],
  fields: SpaceFieldDiff[],
  counts: SpaceDiffResult['counts']
) => {
  for (const f of fields) {
    if (f.status === 'unchanged') counts.unchanged++;
    else if (f.status === 'changed') counts.changed++;
    else if (f.status === 'onlyA') counts.onlyA++;
    else counts.onlyB++;
  }
  for (const node of nodes) {
    if (node.status === 'unchanged') counts.unchanged++;
    else if (node.status === 'changed') counts.changed++;
    else if (node.status === 'onlyA') counts.onlyA++;
    else counts.onlyB++;
    if (node.fields) {
      // Field-level counts already reflected in parent status for summary; skip double-count of unchanged noise
    }
    if (node.children) countStatuses(node.children, [], counts);
  }
};

const diffLinks = (a: Link[] = [], b: Link[] = []): SpaceDiffNode[] =>
  pairByKey(a, b, linkKey).map(({ key, a: linkA, b: linkB }) => {
    const fields = diffFields(
      linkA as unknown as Record<string, unknown>,
      linkB as unknown as Record<string, unknown>,
      LINK_FIELDS
    );
    const status = nodeStatusFromChildren(fields, [], !!linkA, !!linkB);
    return {
      key,
      kind: 'link' as const,
      label: linkA?.label || linkB?.label || 'Link',
      status,
      summaryA: linkA ? `${linkA.label} → ${linkA.url}` : undefined,
      summaryB: linkB ? `${linkB.label} → ${linkB.url}` : undefined,
      fields: fields.filter((f) => f.status !== 'unchanged'),
    };
  });

const diffRichText = (a: RichTextContent[] = [], b: RichTextContent[] = []): SpaceDiffNode[] =>
  pairByKey(a, b, richTextKey).map(({ key, a: itemA, b: itemB }) => {
    const fields = diffFields(
      itemA as unknown as Record<string, unknown>,
      itemB as unknown as Record<string, unknown>,
      RICH_TEXT_FIELDS
    );
    const status = nodeStatusFromChildren(fields, [], !!itemA, !!itemB);
    const preview = (item?: RichTextContent) =>
      item ? stripHtml(String(item.content || '')).slice(0, 80) || '(empty)' : undefined;
    return {
      key,
      kind: 'richText' as const,
      label: itemA?.boxTitle || itemB?.boxTitle || 'Rich text',
      status,
      summaryA: preview(itemA),
      summaryB: preview(itemB),
      fields: fields.filter((f) => f.status !== 'unchanged'),
    };
  });

const diffSections = (a: LinkSection[] = [], b: LinkSection[] = []): SpaceDiffNode[] =>
  pairByKey(a, b, sectionKey).map(({ key, a: secA, b: secB }) => {
    const fields = diffFields(
      secA as unknown as Record<string, unknown>,
      secB as unknown as Record<string, unknown>,
      SECTION_FIELDS
    );
    const children = [
      ...diffLinks(secA?.links || [], secB?.links || []),
      ...diffRichText(secA?.richTextContent || [], secB?.richTextContent || []),
    ];
    const status = nodeStatusFromChildren(fields, children, !!secA, !!secB);
    return {
      key,
      kind: 'section' as const,
      label: secA?.title || secB?.title || 'Section',
      status,
      summaryA: secA?.title,
      summaryB: secB?.title,
      fields: fields.filter((f) => f.status !== 'unchanged'),
      children,
    };
  });

const diffTabs = (a: Tab[] = [], b: Tab[] = []): SpaceDiffNode[] =>
  pairByKey(a, b, tabKey).map(({ key, a: tabA, b: tabB }) => {
    const fields = diffFields(
      tabA as unknown as Record<string, unknown>,
      tabB as unknown as Record<string, unknown>,
      TAB_FIELDS
    );
    const children = diffSections(tabA?.sections || [], tabB?.sections || []);
    const status = nodeStatusFromChildren(fields, children, !!tabA, !!tabB);
    return {
      key,
      kind: 'tab' as const,
      label: tabA?.title || tabB?.title || 'Tab',
      status,
      summaryA: tabA?.title,
      summaryB: tabB?.title,
      fields: fields.filter((f) => f.status !== 'unchanged'),
      children,
    };
  });

const diffMessages = (
  a: NonNullable<Tile['messages']> = [],
  b: NonNullable<Tile['messages']> = []
): SpaceDiffNode[] =>
  pairByKey(a, b, messageKey).map(({ key, a: msgA, b: msgB }) => {
    const fields = diffFields(
      msgA as unknown as Record<string, unknown>,
      msgB as unknown as Record<string, unknown>,
      MESSAGE_FIELDS
    );
    const status = nodeStatusFromChildren(fields, [], !!msgA, !!msgB);
    return {
      key,
      kind: 'message' as const,
      label: 'Message',
      status,
      summaryA: msgA ? stripHtml(String(msgA.content || '')).slice(0, 80) : undefined,
      summaryB: msgB ? stripHtml(String(msgB.content || '')).slice(0, 80) : undefined,
      fields: fields.filter((f) => f.status !== 'unchanged'),
    };
  });

/** Semantic diff of two spaces (tabs / sections / links). */
export const diffSpaces = (left: Tile, right: Tile): SpaceDiffResult => {
  const rootFields = diffFields(
    left as unknown as Record<string, unknown>,
    right as unknown as Record<string, unknown>,
    ROOT_FIELDS
  );
  const tabs = diffTabs(ensureTabs(left), ensureTabs(right));
  const messages = diffMessages(left.messages || [], right.messages || []);
  const counts = { unchanged: 0, changed: 0, onlyA: 0, onlyB: 0 };
  countStatuses(tabs, rootFields.filter((f) => f.status !== 'unchanged'), counts);
  countStatuses(messages, [], counts);
  // Also count unchanged root fields lightly for summary
  for (const f of rootFields) {
    if (f.status === 'unchanged') counts.unchanged++;
  }
  return { rootFields, tabs, messages, counts };
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const mergeArraysByKey = <T>(
  base: T[],
  other: T[],
  getKey: (item: T) => string,
  prefer: 'base' | 'other',
  mergeMatched?: (baseItem: T, otherItem: T) => T
): T[] => {
  const pairs = pairByKey(base, other, getKey);
  const result: T[] = [];
  for (const { a, b } of pairs) {
    if (a && b) {
      if (mergeMatched) result.push(mergeMatched(a, b));
      else result.push(deepClone(prefer === 'base' ? a : b));
    } else if (a) {
      result.push(deepClone(a));
    } else if (b) {
      result.push(deepClone(b));
    }
  }
  return result;
};

const mergeSection = (
  base: LinkSection,
  other: LinkSection,
  prefer: 'base' | 'other'
): LinkSection => {
  const preferred = prefer === 'base' ? base : other;
  return {
    ...deepClone(preferred),
    id: base.id,
    links: mergeArraysByKey(base.links || [], other.links || [], linkKey, prefer),
    richTextContent: mergeArraysByKey(
      base.richTextContent || [],
      other.richTextContent || [],
      richTextKey,
      prefer
    ),
  };
};

const mergeTab = (base: Tab, other: Tab, prefer: 'base' | 'other'): Tab => {
  const preferred = prefer === 'base' ? base : other;
  return {
    ...deepClone(preferred),
    id: base.id,
    sections: mergeArraysByKey(
      base.sections || [],
      other.sections || [],
      sectionKey,
      prefer,
      (a, b) => mergeSection(a, b, prefer)
    ),
  };
};

/**
 * Destination-wins union merge.
 * `prefer: 'base'` keeps base metadata and matched item content; appends only-other items.
 */
export const mergeSpaces = (base: Tile, other: Tile, prefer: 'base' | 'other' = 'base'): Tile => {
  const preferredMeta = prefer === 'base' ? base : other;
  const merged: Tile = {
    ...deepClone(preferredMeta),
    id: base.id,
    createdAt: base.createdAt,
    userId: base.userId,
    canEdit: base.canEdit,
    canDelete: base.canDelete,
    canView: base.canView,
    tabs: mergeArraysByKey(
      ensureTabs(base),
      ensureTabs(other),
      tabKey,
      prefer,
      (a, b) => mergeTab(a, b, prefer)
    ),
    messages: mergeArraysByKey<TileMessage>(base.messages || [], other.messages || [], messageKey, prefer),
  };
  delete (merged as { sections?: LinkSection[] }).sections;
  return merged;
};

/**
 * Create-new merge: keep left metadata, then append all right tabs after left tabs
 * (no title-based tab mixing). Messages are appended the same way.
 */
export const concatenateSpaces = (left: Tile, right: Tile): Tile => {
  const leftTabs = ensureTabs(left).map((tab) => deepClone(tab));
  const rightTabs = ensureTabs(right).map((tab) => deepClone(tab));
  const tabs = [...leftTabs, ...rightTabs].map((tab, index) => ({
    ...tab,
    position: index,
  }));
  const messages = [
    ...deepClone(left.messages || []),
    ...deepClone(right.messages || []),
  ];
  const merged: Tile = {
    ...deepClone(left),
    tabs,
    messages: messages.length > 0 ? messages : undefined,
  };
  delete (merged as { sections?: LinkSection[] }).sections;
  return merged;
};

/** Assign fresh UUIDs to a tile and all nested entities (for create-new). */
export const regenerateIds = (tile: Tile): Tile => {
  const next = deepClone(tile);
  next.id = generateUuid();
  // Tab ids change here, so message tab scopes must be remapped to the new ids.
  const tabIdMap = new Map<string, string>();
  const assignTabId = (oldId: string | undefined): string => {
    const newId = generateUuid();
    if (oldId) tabIdMap.set(oldId, newId);
    return newId;
  };
  next.tabs = ensureTabs(next).map((tab, tabIndex) => ({
    ...tab,
    id: assignTabId(tab.id),
    position: typeof tab.position === 'number' ? tab.position : tabIndex,
    sections: (tab.sections || []).map((section, sectionIndex) => ({
      ...section,
      id: generateUuid(),
      position: typeof section.position === 'number' ? section.position : sectionIndex,
      links: (section.links || []).map((link, linkIndex) => ({
        ...link,
        id: generateUuid(),
        position: typeof link.position === 'number' ? link.position : linkIndex,
      })),
      richTextContent: (section.richTextContent || []).map((rt, rtIndex) => ({
        ...rt,
        id: generateUuid(),
        position: typeof rt.position === 'number' ? rt.position : rtIndex,
      })),
    })),
  }));
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map((msg) => ({
      ...msg,
      id: generateUuid(),
      tabIds: Array.isArray(msg.tabIds) && msg.tabIds.length > 0
        ? Array.from(new Set(msg.tabIds.map(id => tabIdMap.get(id) ?? id)))
        : undefined,
    }));
  }
  delete (next as { sections?: LinkSection[] }).sections;
  return next;
};

export const tileToExportPayload = (tile: Tile): SpaceExportFile => ({
  version: '1.3',
  type: 'tile',
  exportedAt: Date.now(),
  tile,
});

export const downloadTileCompareJson = async (tile: Tile): Promise<void> => {
  await exportTileToFileAsync(tile);
};

export const parseTileFromCompareFile = async (file: File): Promise<Tile> => {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }
  // Allow raw tile object as well as SpaceExportFile
  if (data && typeof data === 'object' && 'title' in (data as object) && 'tabs' in (data as object) && !('type' in (data as object))) {
    return data as Tile;
  }
  const parsed = parseSpaceExportObject(data);
  if (!parsed.tiles.length) {
    throw new Error('No space found in that JSON file.');
  }
  return parsed.tiles[0];
};

export const buildMergedCreateTitle = (leftTitle: string, rightTitle: string): string => {
  const left = (leftTitle || 'Space').trim();
  const right = (rightTitle || 'Space').trim();
  const combined = `${left} + ${right}`;
  return combined.length > 120 ? `${combined.slice(0, 117)}...` : combined;
};

/** Filter diff tree to matching (unchanged) items only; keep parents for context. */
export const filterDiffMatches = (nodes: SpaceDiffNode[]): SpaceDiffNode[] => {
  const result: SpaceDiffNode[] = [];
  for (const node of nodes) {
    const children = node.children ? filterDiffMatches(node.children) : undefined;
    const hasMatchingChildren = !!(children && children.length > 0);
    if (node.status === 'unchanged') {
      result.push({ ...node, children });
      continue;
    }
    if (hasMatchingChildren) {
      result.push({
        ...node,
        fields: undefined,
        status: 'unchanged',
        children,
      });
    }
  }
  return result;
};

export const countMatchesByKind = (
  nodes: SpaceDiffNode[]
): { tabs: number; sections: number; links: number } => {
  const counts = { tabs: 0, sections: 0, links: 0 };
  const walk = (list: SpaceDiffNode[]) => {
    for (const node of list) {
      if (node.status === 'unchanged') {
        if (node.kind === 'tab') counts.tabs++;
        else if (node.kind === 'section') counts.sections++;
        else if (node.kind === 'link' || node.kind === 'richText') counts.links++;
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return counts;
};

/** Filter diff tree to differences only (keep parents that have differing descendants). */
export const filterDiffDifferences = (nodes: SpaceDiffNode[]): SpaceDiffNode[] => {
  const result: SpaceDiffNode[] = [];
  for (const node of nodes) {
    const children = node.children ? filterDiffDifferences(node.children) : undefined;
    if (node.status === 'unchanged' && (!children || children.length === 0)) {
      continue;
    }
    if (node.status === 'unchanged' && children && children.length > 0) {
      result.push({ ...node, status: 'changed', children });
    } else {
      result.push({ ...node, children });
    }
  }
  return result;
};

export type SpaceDiffKindFilter = {
  tabs: boolean;
  sections: boolean;
  links: boolean;
};

const nodeMatchesKindFilter = (node: SpaceDiffNode, kinds: SpaceDiffKindFilter): boolean => {
  if (node.kind === 'tab') return kinds.tabs;
  if (node.kind === 'section') return kinds.sections;
  if (node.kind === 'link' || node.kind === 'richText') return kinds.links;
  return true;
};

/**
 * Keep ancestors when a descendant matches the kind filter.
 * Tab/section field diffs only show when that kind is enabled.
 */
export const filterDiffByKinds = (
  nodes: SpaceDiffNode[],
  kinds: SpaceDiffKindFilter
): SpaceDiffNode[] => {
  const anyKind = kinds.tabs || kinds.sections || kinds.links;
  if (!anyKind) return [];

  const walk = (list: SpaceDiffNode[]): SpaceDiffNode[] => {
    const out: SpaceDiffNode[] = [];
    for (const node of list) {
      const filteredChildren = node.children ? walk(node.children) : undefined;
      const selfMatch = nodeMatchesKindFilter(node, kinds);
      const hasMatchingChildren = !!(filteredChildren && filteredChildren.length > 0);
      const hasOwnSignal =
        node.status === 'unchanged' ||
        node.status === 'onlyA' ||
        node.status === 'onlyB' ||
        !!(node.fields && node.fields.length > 0);

      if (!selfMatch && !hasMatchingChildren) continue;

      // Kind off: keep only as a structural parent for matches below.
      if (!selfMatch && hasMatchingChildren) {
        out.push({
          ...node,
          fields: undefined,
          status: node.status === 'unchanged' ? 'unchanged' : node.status === 'changed' ? 'changed' : node.status,
          children: filteredChildren,
        });
        continue;
      }

      // Kind on: skip containers whose only signals were in filtered-out descendants.
      if (selfMatch && !hasOwnSignal && !hasMatchingChildren) continue;

      out.push({
        ...node,
        children: filteredChildren,
      });
    }
    return out;
  };

  return walk(nodes);
};

export const countDiffByKind = (
  nodes: SpaceDiffNode[]
): { tabs: number; sections: number; links: number } => {
  const counts = { tabs: 0, sections: 0, links: 0 };
  const walk = (list: SpaceDiffNode[]) => {
    for (const node of list) {
      if (node.status !== 'unchanged') {
        if (node.kind === 'tab') counts.tabs++;
        else if (node.kind === 'section') counts.sections++;
        else if (node.kind === 'link' || node.kind === 'richText') counts.links++;
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return counts;
};

export type SpaceSimilarityBucket = {
  same: number;
  total: number;
  percent: number;
};

export type SpaceSimilarity = {
  /** Overall alike score 0–100 (same items / all compared items). */
  percent: number;
  same: number;
  total: number;
  label: string;
  byKind: {
    tabs: SpaceSimilarityBucket;
    sections: SpaceSimilarityBucket;
    links: SpaceSimilarityBucket;
    properties: SpaceSimilarityBucket;
  };
};

const bucketFrom = (same: number, total: number): SpaceSimilarityBucket => ({
  same,
  total,
  percent: total <= 0 ? 100 : Math.round((same / total) * 100),
});

const alikeLabel = (percent: number): string => {
  if (percent >= 95) return 'Nearly identical';
  if (percent >= 80) return 'Very similar';
  if (percent >= 60) return 'Mostly alike';
  if (percent >= 40) return 'Partly alike';
  if (percent >= 20) return 'Mostly different';
  return 'Very different';
};

/** How much two spaces look alike (equal/same items vs all compared items). */
export const computeSpaceSimilarity = (diff: SpaceDiffResult): SpaceSimilarity => {
  const byKind = {
    tabs: { same: 0, total: 0 },
    sections: { same: 0, total: 0 },
    links: { same: 0, total: 0 },
    properties: { same: 0, total: 0 },
  };

  for (const field of diff.rootFields) {
    byKind.properties.total++;
    if (field.status === 'unchanged') byKind.properties.same++;
  }

  const walk = (nodes: SpaceDiffNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'tab') {
        byKind.tabs.total++;
        if (node.status === 'unchanged') byKind.tabs.same++;
      } else if (node.kind === 'section') {
        byKind.sections.total++;
        if (node.status === 'unchanged') byKind.sections.same++;
      } else if (node.kind === 'link' || node.kind === 'richText') {
        byKind.links.total++;
        if (node.status === 'unchanged') byKind.links.same++;
      }
      if (node.children) walk(node.children);
    }
  };
  walk(diff.tabs);

  const tabs = bucketFrom(byKind.tabs.same, byKind.tabs.total);
  const sections = bucketFrom(byKind.sections.same, byKind.sections.total);
  const links = bucketFrom(byKind.links.same, byKind.links.total);
  const properties = bucketFrom(byKind.properties.same, byKind.properties.total);

  const same = tabs.same + sections.same + links.same + properties.same;
  const total = tabs.total + sections.total + links.total + properties.total;
  const percent = total <= 0 ? 100 : Math.round((same / total) * 100);

  return {
    percent,
    same,
    total,
    label: alikeLabel(percent),
    byKind: { tabs, sections, links, properties },
  };
};
