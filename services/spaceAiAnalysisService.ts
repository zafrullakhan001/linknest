import { Tile, Tab, LinkSection, Link, RichTextContent } from '../types';
import { generateUuid } from './idService';
import {
  parseSpaceExportObject,
  type SpaceExportFile,
} from './spaceTransferService';

const TILE_RUNTIME_KEYS = [
  'canView',
  'canEdit',
  'canDelete',
  'hasRoleAccess',
  'canAddLinks',
  'canAddSections',
  'canAddTabs',
  'canEditLinks',
  'canDeleteLinks',
  'canDeleteSections',
  'canDeleteTabs',
  'canChangeVisibility',
  'canChangeBrowser',
  'canCloneTile',
  'canViewTileInfo',
  'canEditTile',
  'isFavorite',
  'searchLinks',
  'linkCount',
  'sharedWithMeInvitationId',
  'sharedWithMeSharer',
  'deletedAt',
  'archivedAt',
] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'space';

const omitKeys = <T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T => {
  const next = { ...obj };
  for (const key of keys) {
    delete next[key];
  }
  return next;
};

const stripLinkRuntime = (link: Link): Link => {
  const { health: _health, isFavorite: _fav, hasRoleAccess: _role, ...rest } = link;
  return rest as Link;
};

const stripSectionRuntime = (section: LinkSection): LinkSection => ({
  ...section,
  links: Array.isArray(section.links) ? section.links.map(stripLinkRuntime) : [],
  richTextContent: Array.isArray(section.richTextContent)
    ? section.richTextContent.map((item) => ({ ...item }))
    : section.richTextContent,
});

const stripTabRuntime = (tab: Tab): Tab => ({
  ...tab,
  sections: Array.isArray(tab.sections) ? tab.sections.map(stripSectionRuntime) : [],
});

export const buildSpaceAnalysisPayload = (tile: Tile): SpaceExportFile => {
  const compact = omitKeys({ ...tile } as Record<string, unknown>, TILE_RUNTIME_KEYS) as unknown as Tile;
  compact.tabs = Array.isArray(tile.tabs) ? tile.tabs.map(stripTabRuntime) : [];
  if (Array.isArray(tile.sections) && tile.sections.length > 0 && (!compact.tabs || compact.tabs.length === 0)) {
    compact.sections = tile.sections.map(stripSectionRuntime);
  } else {
    delete compact.sections;
  }
  return {
    version: '1.3',
    type: 'tile',
    exportedAt: Date.now(),
    tile: compact,
  };
};

export const buildSpaceAnalysisPrompt = (tile: Tile): string => {
  const linkCount = (tile.tabs || []).reduce(
    (sum, tab) => sum + (tab.sections || []).reduce((s, sec) => s + (sec.links?.length || 0), 0),
    0
  );
  const tabCount = tile.tabs?.length || 0;
  const outputFile = spaceAnalysisOutputFilename(tile);

  return `You are optimizing a LinkNest space (bookmark collection) so it can be imported back into the app without data loss.

Space: "${tile.title}"
Tabs: ${tabCount}
Links: ${linkCount}

The user will attach or paste a JSON file/object in this exact envelope:

{
  "version": "1.3",
  "type": "tile",
  "exportedAt": <number>,
  "tile": { ...space... }
}

Hierarchy inside tile:
tile → tabs[] → sections[] → links[] (and optional richTextContent[] on sections)

Your job:
1. Keep every existing URL unless it is a true duplicate of another link in this space (same destination URL, ignoring trailing slash and http vs https). Remove only those duplicates; keep the copy with the better label/icon/notes.
2. Do not invent new URLs or placeholder links.
3. Add a single fitting emoji in the dedicated fields only:
   - tile.emoji for the space
   - tabs[].emoji for each tab
   - sections[].emoji for each section
   - links[].icon for each link (emoji character, not an image URL)
   Keep existing emojis if they already fit.
   EMOJI FORMAT — CRITICAL:
   - Each emoji field must be a plain Unicode emoji only (e.g. "📁", "🔗", "⚙️").
   - Do NOT wrap emojis in markdown or HTML: no asterisks, underscores, italics, bold, backticks, or tags.
   - Wrong: "_📁_", "*📁*", "__📁__", "<i>📁</i>", "📁 (folder)" in the emoji field.
   - Right: "📁" in sections[].emoji (and the section title stays plain text in sections[].title).
   - Never put italic/bold formatting on section emojis — they must render as normal emoji characters in JSON strings.
4. Improve titles, descriptions, tab titles, section titles, and link labels so they are clear and consistent. Do not empty them.
5. Preserve IDs (tile.id, tab.id, section.id, link.id, richTextContent.id) for items you keep so short URLs and history stay attached.
6. Preserve all other fields you are given: visibility, published, notes, tooltip, richTextContent, maintenance*, shortUrl / inheritShortUrls / forceShortUrl, openTarget, browser, accessRestrictions, decorations, animations, messages, images, allowedUsers/Groups, schedule dates.
7. You may reorder tabs, sections, and links. Update position fields to match the new order (0-based).
8. Do not add runtime permission fields (canEdit, canView, canDelete, health, isFavorite, searchLinks, linkCount, sharedWithMe*).

OUTPUT FORMAT — IMPORTANT:
This space has ${linkCount} links. The optimized JSON will be large.

You MUST deliver the result as a downloadable JSON FILE named exactly:
${outputFile}

Rules for delivery:
- Write the full optimized export to that file (valid UTF-8 JSON, MIME type application/json).
- Provide the file as a downloadable attachment the user can save.
- Do NOT paste the full JSON inline in chat — no markdown code blocks, no streaming the entire payload in the message body.
- In chat, reply with ONLY a short summary (e.g. links before/after, tabs, emoji counts) and confirm the file name ${outputFile} is ready to download.

The file content must be ONLY this envelope (no extra wrapper keys):
{ "version": "1.3", "type": "tile", "exportedAt": <unix ms>, "tile": { ... } }`;
};

export const spaceAnalysisFilename = (tile: Tile, kind: 'json' | 'txt'): string =>
  `linknest-ai-space-${slugify(tile.title)}.${kind}`;

/** Expected filename when the LLM writes a downloadable JSON file (not inline chat text). */
export const spaceAnalysisOutputFilename = (tile: Tile): string =>
  `linknest-ai-space-${slugify(tile.title)}-optimized.json`;

export const downloadTextFile = (contents: string, filename: string, mime: string): void => {
  const blob = new Blob([contents], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/** Strip markdown emphasis wrappers LLMs sometimes add around emoji fields. */
const normalizeEmojiField = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  let text = String(value).trim();
  if (!text) return undefined;
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text
      .replace(/^(\*{1,3}|_{1,3})([\s\S]+?)\1$/u, '$2')
      .replace(/^<(?:i|em|b|strong)>([\s\S]+?)<\/(?:i|em|b|strong)>$/iu, '$1')
      .trim();
  }
  return text || undefined;
};

const sanitizeTileEmojiFields = (tile: Tile): Tile => {
  const next: Tile = {
    ...tile,
    emoji: normalizeEmojiField(tile.emoji) ?? tile.emoji,
    tabs: Array.isArray(tile.tabs)
      ? tile.tabs.map((tab) => ({
          ...tab,
          emoji: normalizeEmojiField(tab.emoji) ?? tab.emoji,
          sections: Array.isArray(tab.sections)
            ? tab.sections.map((section) => ({
                ...section,
                emoji: normalizeEmojiField(section.emoji) ?? section.emoji,
                links: Array.isArray(section.links)
                  ? section.links.map((link) => ({
                      ...link,
                      icon: normalizeEmojiField(link.icon) ?? link.icon,
                    }))
                  : section.links,
              }))
            : tab.sections,
        }))
      : tile.tabs,
  };
  return next;
};

const extractJsonObject = (raw: string): unknown => {
  let text = raw.trim().replace(/^\uFEFF/, '');
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Could not find a JSON object in the pasted text.');
  }
  text = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Pasted text is not valid JSON.');
  }
};

export const parseLlmSpaceJson = (raw: string): Tile => {
  const data = extractJsonObject(raw) as Record<string, unknown>;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON: expected an object.');
  }

  if (data.type === 'tile' || data.type === 'category' || data.type === 'all_categories' || data.tile || data.tiles) {
    const envelope =
      data.type === 'tile' || data.type === 'category' || data.type === 'all_categories'
        ? data
        : data.tile
          ? { version: '1.3', type: 'tile' as const, exportedAt: Date.now(), tile: data.tile }
          : { version: '1.3', type: 'all_categories' as const, exportedAt: Date.now(), tiles: data.tiles };
    const parsed = parseSpaceExportObject(envelope);
    if (!parsed.tiles[0]) {
      throw new Error('JSON did not contain a space/tile.');
    }
    return sanitizeTileEmojiFields(parsed.tiles[0]);
  }

  if (typeof data.title === 'string' && (Array.isArray(data.tabs) || Array.isArray(data.sections))) {
    const parsed = parseSpaceExportObject({
      version: '1.3',
      type: 'tile',
      exportedAt: Date.now(),
      tile: data,
    });
    return sanitizeTileEmojiFields(parsed.tiles[0]);
  }

  throw new Error('JSON is not a LinkNest space export. Expected { version, type: "tile", tile }.');
};

const countLinks = (tile: Tile): number =>
  (tile.tabs || []).reduce(
    (sum, tab) => sum + (tab.sections || []).reduce((s, sec) => s + (sec.links?.length || 0), 0),
    0
  );

const countEmojis = (tile: Tile): { tabs: number; sections: number; links: number } => {
  let tabs = 0;
  let sections = 0;
  let links = 0;
  for (const tab of tile.tabs || []) {
    if (tab.emoji && String(tab.emoji).trim()) tabs += 1;
    for (const section of tab.sections || []) {
      if (section.emoji && String(section.emoji).trim()) sections += 1;
      for (const link of section.links || []) {
        if (link.icon && String(link.icon).trim()) links += 1;
      }
    }
  }
  return { tabs, sections, links };
};

export interface SpaceAnalysisSummary {
  originalLinkCount: number;
  analyzedLinkCount: number;
  originalTabCount: number;
  analyzedTabCount: number;
  tabsWithEmoji: number;
  sectionsWithEmoji: number;
  linksWithIcon: number;
  spaceEmoji: string;
}

export const summarizeAnalyzedTile = (original: Tile, analyzed: Tile): SpaceAnalysisSummary => {
  const emojis = countEmojis(analyzed);
  return {
    originalLinkCount: countLinks(original),
    analyzedLinkCount: countLinks(analyzed),
    originalTabCount: original.tabs?.length || 0,
    analyzedTabCount: analyzed.tabs?.length || 0,
    tabsWithEmoji: emojis.tabs,
    sectionsWithEmoji: emojis.sections,
    linksWithIcon: emojis.links,
    spaceEmoji: analyzed.emoji || original.emoji || '',
  };
};

const originalLinkById = (tile: Tile): Map<string, Link> => {
  const map = new Map<string, Link>();
  for (const tab of tile.tabs || []) {
    for (const section of tab.sections || []) {
      for (const link of section.links || []) {
        if (link.id) map.set(link.id, link);
      }
    }
  }
  return map;
};

const originalRtcById = (tile: Tile): Map<string, RichTextContent> => {
  const map = new Map<string, RichTextContent>();
  for (const tab of tile.tabs || []) {
    for (const section of tab.sections || []) {
      for (const item of section.richTextContent || []) {
        if (item.id) map.set(item.id, item);
      }
    }
  }
  return map;
};

const mergeLink = (src: Link, original?: Link): Link => {
  const merged: Link = {
    ...(original || {}),
    ...src,
    id: (typeof src.id === 'string' && src.id) || original?.id || generateUuid(),
    label: String(src.label || original?.label || ''),
    url: String(src.url || original?.url || ''),
  };
  if (original?.health && !src.health) {
    merged.health = original.health;
  }
  if (original?.shortUrl && !src.shortUrl) {
    merged.shortUrl = original.shortUrl;
  }
  return merged;
};

const mergeRichText = (src: RichTextContent, original?: RichTextContent): RichTextContent => ({
  ...(original || {}),
  ...src,
  id: (typeof src.id === 'string' && src.id) || original?.id || generateUuid(),
  content: String(src.content ?? original?.content ?? ''),
  position: typeof src.position === 'number' ? src.position : original?.position ?? 0,
});

const mergeSection = (
  src: LinkSection,
  original: LinkSection | undefined,
  linksById: Map<string, Link>,
  rtcById: Map<string, RichTextContent>
): LinkSection => ({
  ...(original || {}),
  ...src,
  id: (typeof src.id === 'string' && src.id) || original?.id || generateUuid(),
  title: String(src.title || original?.title || ''),
  links: Array.isArray(src.links)
    ? src.links.map((link) => mergeLink(link, (link.id && linksById.get(link.id)) || undefined))
    : original?.links || [],
  richTextContent: Array.isArray(src.richTextContent)
    ? src.richTextContent.map((item) => mergeRichText(item, (item.id && rtcById.get(item.id)) || undefined))
    : original?.richTextContent,
});

const mergeTab = (
  src: Tab,
  original: Tab | undefined,
  linksById: Map<string, Link>,
  rtcById: Map<string, RichTextContent>
): Tab => {
  const originalSections = new Map((original?.sections || []).map((s) => [s.id, s]));
  return {
    ...(original || {}),
    ...src,
    id: (typeof src.id === 'string' && src.id) || original?.id || generateUuid(),
    title: String(src.title || original?.title || 'Tab'),
    position: typeof src.position === 'number' ? src.position : original?.position ?? 0,
    sections: Array.isArray(src.sections)
      ? src.sections.map((section) =>
          mergeSection(section, (section.id && originalSections.get(section.id)) || undefined, linksById, rtcById)
        )
      : original?.sections || [],
  };
};

/** Apply LLM content onto the live space, keeping ids, ACL flags, and short URLs. */
export const mergeAnalyzedTile = (original: Tile, analyzed: Tile): Tile => {
  const linksById = originalLinkById(original);
  const rtcById = originalRtcById(original);
  const originalTabs = new Map((original.tabs || []).map((t) => [t.id, t]));

  const tabs = Array.isArray(analyzed.tabs) && analyzed.tabs.length > 0
    ? analyzed.tabs.map((tab) => mergeTab(tab, (tab.id && originalTabs.get(tab.id)) || undefined, linksById, rtcById))
    : original.tabs;

  const {
    canView,
    canEdit,
    canDelete,
    hasRoleAccess,
    canAddLinks,
    canAddSections,
    canAddTabs,
    canEditLinks,
    canDeleteLinks,
    canDeleteSections,
    canDeleteTabs,
    canChangeVisibility,
    canChangeBrowser,
    canCloneTile,
    canViewTileInfo,
    canEditTile,
    isFavorite,
    searchLinks,
    linkCount,
    sharedWithMeInvitationId,
    sharedWithMeSharer,
    deletedAt,
    archivedAt,
    userId,
    createdAt,
  } = original;

  return {
    ...original,
    ...analyzed,
    id: original.id,
    userId,
    createdAt,
    shortUrl: original.shortUrl || analyzed.shortUrl,
    canView,
    canEdit,
    canDelete,
    hasRoleAccess,
    canAddLinks,
    canAddSections,
    canAddTabs,
    canEditLinks,
    canDeleteLinks,
    canDeleteSections,
    canDeleteTabs,
    canChangeVisibility,
    canChangeBrowser,
    canCloneTile,
    canViewTileInfo,
    canEditTile,
    isFavorite,
    searchLinks,
    linkCount,
    sharedWithMeInvitationId,
    sharedWithMeSharer,
    deletedAt,
    archivedAt,
    tabs,
    sections: undefined,
  };
};
