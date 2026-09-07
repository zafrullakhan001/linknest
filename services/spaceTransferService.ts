import { Tile, LinkSection, Link } from '../types';
import { generateUuid } from './idService';
import { normalizeLinkTooltipStyle } from '../utils/linkTooltipPreference';
import {
  uploadTileEmojiImage,
  uploadTileHeaderImage
} from './storageService';

export type SpaceExportType = 'tile' | 'category' | 'all_categories';

export interface SpaceExportFile {
  // 1.3: logos embedded in assets, position, category order, show* flags
  // 1.2: decorations, messages (celebration + url/urlLabel), pageAnimation, linksAnimation, link animation, allowedGroups
  version: '1.2' | '1.3';
  type: SpaceExportType;
  exportedAt: number;
  tile?: Tile;
  tiles?: Tile[];
  categoryName?: string;
  categories?: string[];
  /** Map of normalized upload asset keys → base64 data URLs (emoji/header logos). */
  assets?: Record<string, string>;
}

export interface ParsedSpaceImport {
  type: SpaceExportType;
  tiles: Tile[];
  categoryName?: string;
  categories?: string[];
  assets?: Record<string, string>;
}

// Simple ID generator for imported items (client-side only)
const generateId = () => Math.random().toString(36).substring(2, 11);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'space';

const asNumberArray = (value: unknown): number[] | undefined =>
  Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number')
    : undefined;

const MESSAGE_ANIMATION_TYPES = [
  'rollover',
  'still',
  'flash',
  'flip-horizontal',
  'flip-vertical',
  'bounce',
  'pulse',
  'shake',
  'fade',
  'slide'
] as const;

const CELEBRATION_EFFECTS = [
  'none',
  'fireworks',
  'confetti',
  'snowfall',
  'hearts-rising',
  'hearts-falling',
  'bubbles',
  'butterflies',
  'birds-flying',
  'rocket-launch',
  'burst-fireworks',
  'sparkles',
  'petals',
  'shooting-stars',
  'leaves',
  'fireflies',
  'balloons',
  'stars',
  'rainbow'
] as const;

const GRADIENT_TYPES = [
  'linear',
  'radial',
  'conic',
  'repeating-linear',
  'repeating-radial',
  'repeating-conic'
] as const;

const triggerDownload = (data: unknown, filename: string) => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/** Normalize upload URL/path to a stable asset key (basename preferred). */
export const normalizeAssetKey = (urlOrPath: string | null | undefined): string | null => {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const pathPart = trimmed.includes('://')
      ? new URL(trimmed).pathname
      : trimmed.split('?')[0];
    const uploadsIdx = pathPart.toLowerCase().lastIndexOf('/uploads/');
    if (uploadsIdx >= 0) {
      const rest = pathPart.slice(uploadsIdx + '/uploads/'.length);
      const filename = rest.split('/').pop() || rest;
      return filename && /^[a-zA-Z0-9._-]+$/.test(filename) ? filename : null;
    }
    const filename = pathPart.split('/').pop() || '';
    return filename && /^[a-zA-Z0-9._-]+$/.test(filename) ? filename : null;
  } catch {
    return null;
  }
};

/** Resolve categories list preserving provided order when present. */
export const resolveExportCategories = (
  tiles: Tile[],
  categoryOrder: string[] | undefined
): string[] => {
  const categoriesFromTiles = Array.from(
    new Set(tiles.map((t) => t.group || 'General'))
  );

  if (!categoryOrder || categoryOrder.length === 0) {
    return categoriesFromTiles;
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  categoryOrder.forEach((cat) => {
    if (categoriesFromTiles.includes(cat) && !seen.has(cat)) {
      ordered.push(cat);
      seen.add(cat);
    }
  });
  categoriesFromTiles.forEach((cat) => {
    if (!seen.has(cat)) {
      ordered.push(cat);
      seen.add(cat);
    }
  });
  return ordered;
};

/** Sort tiles by category order then by position (stable for display order). */
export const sortTilesByCategoryAndPosition = (
  tiles: Tile[],
  categories: string[]
): Tile[] => {
  const catIndex = new Map<string, number>();
  categories.forEach((c, i) => catIndex.set(c, i));

  return [...tiles].sort((a, b) => {
    const ga = a.group || 'General';
    const gb = b.group || 'General';
    const ia = catIndex.has(ga) ? (catIndex.get(ga) as number) : Number.MAX_SAFE_INTEGER;
    const ib = catIndex.has(gb) ? (catIndex.get(gb) as number) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    const pa = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
    const pb = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return 0;
  });
};

const collectImageUrlsFromTiles = (tiles: Tile[]): string[] => {
  const urls = new Set<string>();
  tiles.forEach((tile) => {
    if (typeof tile.emojiImage === 'string' && tile.emojiImage.trim()) {
      urls.add(tile.emojiImage.trim());
    }
    if (typeof tile.headerImage === 'string' && tile.headerImage.trim()) {
      urls.add(tile.headerImage.trim());
    }
  });
  return Array.from(urls);
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });

/** Fetch upload images and return assets map (key → data URL). Best-effort; skips failures. */
export const collectSpaceExportAssets = async (
  tiles: Tile[]
): Promise<Record<string, string>> => {
  const assets: Record<string, string> = {};
  const urls = collectImageUrlsFromTiles(tiles);

  await Promise.all(
    urls.map(async (url) => {
      const key = normalizeAssetKey(url);
      if (!key || assets[key]) return;
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob || blob.size === 0) return;
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.startsWith('data:')) {
          assets[key] = dataUrl;
        }
      } catch (err) {
        console.warn('Failed to embed space export asset:', url, err);
      }
    })
  );

  return assets;
};

const dataUrlToFile = (dataUrl: string, filename: string): File | null => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const b64 = match[2];
  try {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const ext =
      mime.includes('png') ? 'png'
        : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
          : mime.includes('gif') ? 'gif'
            : mime.includes('webp') ? 'webp'
              : 'bin';
    const safeName = filename.includes('.') ? filename : `${filename}.${ext}`;
    return new File([bytes], safeName, { type: mime });
  } catch {
    return null;
  }
};

/**
 * Re-upload embedded assets and rewrite emojiImage/headerImage URLs on tiles.
 * Mutates tiles in place; returns a map of oldKey → newUrl for debugging.
 */
export const restoreImportedTileAssets = async (
  tiles: Tile[],
  assets: Record<string, string> | undefined
): Promise<Record<string, string>> => {
  const rewritten: Record<string, string> = {};
  if (!assets || Object.keys(assets).length === 0) {
    return rewritten;
  }

  const uploadCache = new Map<string, Promise<string>>();

  const resolveUpload = (
    key: string,
    kind: 'emoji' | 'header'
  ): Promise<string> => {
    const cacheKey = `${kind}:${key}`;
    const existing = uploadCache.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      const dataUrl = assets[key];
      if (!dataUrl) throw new Error(`Missing asset: ${key}`);
      const file = dataUrlToFile(dataUrl, key);
      if (!file) throw new Error(`Invalid asset data: ${key}`);
      if (kind === 'emoji') {
        return uploadTileEmojiImage(file);
      }
      return uploadTileHeaderImage(file);
    })();

    uploadCache.set(cacheKey, promise);
    return promise;
  };

  for (const tile of tiles) {
    if (typeof tile.emojiImage === 'string' && tile.emojiImage.trim()) {
      const key = normalizeAssetKey(tile.emojiImage) || (
        assets[tile.emojiImage] ? tile.emojiImage : null
      );
      if (key && assets[key]) {
        try {
          const newUrl = await resolveUpload(key, 'emoji');
          rewritten[key] = newUrl;
          tile.emojiImage = newUrl;
        } catch (err) {
          console.warn('Failed to restore emoji image asset:', key, err);
        }
      }
    }

    if (typeof tile.headerImage === 'string' && tile.headerImage.trim()) {
      const key = normalizeAssetKey(tile.headerImage) || (
        assets[tile.headerImage] ? tile.headerImage : null
      );
      if (key && assets[key]) {
        try {
          const newUrl = await resolveUpload(key, 'header');
          rewritten[key] = newUrl;
          tile.headerImage = newUrl;
        } catch (err) {
          console.warn('Failed to restore header image asset:', key, err);
        }
      }
    }
  }

  return rewritten;
};

/** Normalize a single link from import JSON */
const normalizeImportedLink = (link: any): Link => ({
  id: generateId(),
  label: String(link.label || ''),
  url: String(link.url || ''),
  icon: typeof link.icon === 'string' ? link.icon : undefined,
  textColor: typeof link.textColor === 'string' ? link.textColor : undefined,
  browser: typeof link.browser === 'string' ? link.browser : undefined,
  position: typeof link.position === 'number' ? link.position : undefined,
  visibility: link.visibility || 'public',
  allowedUsers: asNumberArray(link.allowedUsers),
  allowedGroups: asNumberArray(link.allowedGroups),
  notes: link.notes || undefined,
  tooltip: link.tooltip || undefined,
  tooltipStyle: normalizeLinkTooltipStyle(link.tooltipStyle),
  notesEnabled: link.notesEnabled === true,
  notesVideoUrl: typeof link.notesVideoUrl === 'string' ? link.notesVideoUrl : undefined,
    richTextContent: typeof link.richTextContent === 'string' ? link.richTextContent : undefined,
    richTextEnabled: link.richTextEnabled === true,
    infoVideoUrl: typeof link.infoVideoUrl === 'string' ? link.infoVideoUrl : undefined,
    infoShowOpenLink: link.infoShowOpenLink !== false,
    maintenanceEnabled: link.maintenanceEnabled === true,
  maintenanceMessage: typeof link.maintenanceMessage === 'string' ? link.maintenanceMessage : undefined,
  maintenanceVideoUrl: typeof link.maintenanceVideoUrl === 'string' ? link.maintenanceVideoUrl : undefined,
  mobilePreviewEmulation: link.mobilePreviewEmulation === true || undefined,
  openInEmulation: link.openInEmulation === true || undefined,
  health: link.health || undefined,
  visibleFrom: typeof link.visibleFrom === 'string' ? link.visibleFrom : undefined,
  expiresAt: typeof link.expiresAt === 'string' ? link.expiresAt : undefined,
  accessRestrictions: link.accessRestrictions && typeof link.accessRestrictions === 'object' ? link.accessRestrictions : undefined,
  animation: typeof link.animation === 'string' ? link.animation : undefined
});

/** Normalize rich text content items from import JSON */
const normalizeRichTextContent = (rtc: any) => {
  const align = (v: unknown): 'left' | 'center' | 'right' | undefined =>
    v === 'left' || v === 'center' || v === 'right' ? v : undefined;
  const weight = (v: unknown): 'normal' | 'bold' | undefined =>
    v === 'normal' || v === 'bold' ? v : undefined;
  const size = (v: unknown): 'sm' | 'md' | 'lg' | undefined =>
    v === 'sm' || v === 'md' || v === 'lg' ? v : undefined;
  const importance = (v: unknown) =>
    v === 'notes' || v === 'info' || v === 'tip' || v === 'important' || v === 'warning' || v === 'critical'
      ? v
      : undefined;

  const boxed =
    rtc.boxed === true || rtc.boxed === 1 || rtc.boxed === '1' || rtc.boxed === 'true';

  return {
    id: generateId(),
    content: String(rtc.content || ''),
    position: typeof rtc.position === 'number' ? rtc.position : 0,
    visibility: rtc.visibility || 'public',
    allowedUsers: asNumberArray(rtc.allowedUsers ?? rtc.allowed_users),
    allowedGroups: asNumberArray(rtc.allowedGroups ?? rtc.allowed_groups),
    visibleFrom: typeof rtc.visibleFrom === 'string' ? rtc.visibleFrom : (typeof rtc.visible_from === 'string' ? rtc.visible_from : undefined),
    expiresAt: typeof rtc.expiresAt === 'string' ? rtc.expiresAt : (typeof rtc.expires_at === 'string' ? rtc.expires_at : undefined),
    boxed: boxed || undefined,
    boxTitle: typeof (rtc.boxTitle ?? rtc.box_title) === 'string' ? String(rtc.boxTitle ?? rtc.box_title) : undefined,
    boxFooter: typeof (rtc.boxFooter ?? rtc.box_footer) === 'string' ? String(rtc.boxFooter ?? rtc.box_footer) : undefined,
    boxHeaderAlign: align(rtc.boxHeaderAlign ?? rtc.box_header_align),
    boxFooterAlign: align(rtc.boxFooterAlign ?? rtc.box_footer_align),
    boxHeaderBg: typeof (rtc.boxHeaderBg ?? rtc.box_header_bg) === 'string' ? String(rtc.boxHeaderBg ?? rtc.box_header_bg) : undefined,
    boxFooterBg: typeof (rtc.boxFooterBg ?? rtc.box_footer_bg) === 'string' ? String(rtc.boxFooterBg ?? rtc.box_footer_bg) : undefined,
    boxBodyBg: typeof (rtc.boxBodyBg ?? rtc.box_body_bg) === 'string' ? String(rtc.boxBodyBg ?? rtc.box_body_bg) : undefined,
    boxHeaderFontWeight: weight(rtc.boxHeaderFontWeight ?? rtc.box_header_font_weight),
    boxFooterFontWeight: weight(rtc.boxFooterFontWeight ?? rtc.box_footer_font_weight),
    boxHeaderFontSize: size(rtc.boxHeaderFontSize ?? rtc.box_header_font_size),
    boxFooterFontSize: size(rtc.boxFooterFontSize ?? rtc.box_footer_font_size),
    boxHeaderEmoji: typeof (rtc.boxHeaderEmoji ?? rtc.box_header_emoji) === 'string' ? String(rtc.boxHeaderEmoji ?? rtc.box_header_emoji) : undefined,
    boxImportance: importance(rtc.boxImportance ?? rtc.box_importance)
  };
};

/** Normalize a section (links + rich text) from import JSON */
const normalizeImportedSection = (section: any): LinkSection => {
  const links: Link[] = Array.isArray(section.links)
    ? section.links.map(normalizeImportedLink)
    : [];

  const richTextContent = Array.isArray(section.richTextContent)
    ? section.richTextContent.map(normalizeRichTextContent)
    : undefined;

  return {
    id: generateId(),
    title: String(section.title || ''),
    position: typeof section.position === 'number' ? section.position : undefined,
    textColor: typeof section.textColor === 'string' ? section.textColor : undefined,
    emoji: typeof section.emoji === 'string' ? section.emoji : undefined,
    forceStackedView:
      typeof section.forceStackedView === 'boolean' ? section.forceStackedView : undefined,
    visibility: section.visibility || 'public',
    allowedUsers: asNumberArray(section.allowedUsers),
    allowedGroups: asNumberArray(section.allowedGroups),
    visibleFrom: typeof section.visibleFrom === 'string' ? section.visibleFrom : undefined,
    expiresAt: typeof section.expiresAt === 'string' ? section.expiresAt : undefined,
    links,
    richTextContent
  };
};

const asOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === '0') return false;
  if (value === 1 || value === '1') return true;
  return undefined;
};

const asOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Export a single space/tile to a JSON file (sync; no asset embed). Prefer exportTileToFileAsync. */
export const exportTileToFile = (tile: Tile) => {
  const payload: SpaceExportFile = {
    version: '1.3',
    type: 'tile',
    exportedAt: Date.now(),
    tile
  };

  const filename = `linknest-space-${slugify(tile.title)}.json`;
  triggerDownload(payload, filename);
};

/** Export a single space with embedded logo assets. */
export const exportTileToFileAsync = async (tile: Tile) => {
  const assets = await collectSpaceExportAssets([tile]);
  const payload: SpaceExportFile = {
    version: '1.3',
    type: 'tile',
    exportedAt: Date.now(),
    tile,
    ...(Object.keys(assets).length > 0 ? { assets } : {})
  };
  const filename = `linknest-space-${slugify(tile.title)}.json`;
  triggerDownload(payload, filename);
};

/** Export all tiles in a category (group) to a JSON file (sync; no asset embed). */
export const exportCategoryToFile = (categoryName: string, tiles: Tile[]) => {
  const categoryTiles = sortTilesByCategoryAndPosition(
    tiles.filter((t) => (t.group || 'General') === categoryName),
    [categoryName]
  );

  if (categoryTiles.length === 0) {
    alert(`No spaces found in category "${categoryName}".`);
    return;
  }

  const payload: SpaceExportFile = {
    version: '1.3',
    type: 'category',
    exportedAt: Date.now(),
    categoryName,
    tiles: categoryTiles
  };

  const filename = `linknest-category-${slugify(categoryName)}.json`;
  triggerDownload(payload, filename);
};

/** Export a category with embedded logo assets. */
export const exportCategoryToFileAsync = async (categoryName: string, tiles: Tile[]) => {
  const categoryTiles = sortTilesByCategoryAndPosition(
    tiles.filter((t) => (t.group || 'General') === categoryName),
    [categoryName]
  );

  if (categoryTiles.length === 0) {
    alert(`No spaces found in category "${categoryName}".`);
    return;
  }

  const assets = await collectSpaceExportAssets(categoryTiles);
  const payload: SpaceExportFile = {
    version: '1.3',
    type: 'category',
    exportedAt: Date.now(),
    categoryName,
    tiles: categoryTiles,
    ...(Object.keys(assets).length > 0 ? { assets } : {})
  };
  const filename = `linknest-category-${slugify(categoryName)}.json`;
  triggerDownload(payload, filename);
};

/** Export all spaces (all categories) to a JSON file (sync; no asset embed). Prefer async. */
export const exportAllCategoriesToFile = (tiles: Tile[], categoryOrder: string[] | undefined) => {
  if (!tiles.length) {
    alert('No spaces to export.');
    return;
  }

  const categories = resolveExportCategories(tiles, categoryOrder);
  const orderedTiles = sortTilesByCategoryAndPosition(tiles, categories);

  const payload: SpaceExportFile = {
    version: '1.3',
    type: 'all_categories',
    exportedAt: Date.now(),
    tiles: orderedTiles,
    categories
  };

  const filename = 'linknest-spaces-all-categories.json';
  triggerDownload(payload, filename);
};

/** Export all spaces with full order + embedded logo assets (v1.3). */
export const exportAllCategoriesToFileAsync = async (
  tiles: Tile[],
  categoryOrder: string[] | undefined
) => {
  if (!tiles.length) {
    alert('No spaces to export.');
    return;
  }

  const categories = resolveExportCategories(tiles, categoryOrder);
  const orderedTiles = sortTilesByCategoryAndPosition(tiles, categories);
  const assets = await collectSpaceExportAssets(orderedTiles);

  const payload: SpaceExportFile = {
    version: '1.3',
    type: 'all_categories',
    exportedAt: Date.now(),
    tiles: orderedTiles,
    categories,
    ...(Object.keys(assets).length > 0 ? { assets } : {})
  };

  const filename = 'linknest-spaces-all-categories.json';
  triggerDownload(payload, filename);
};

/** Parse and lightly validate an imported JSON object */
export const parseSpaceExportObject = (data: any): ParsedSpaceImport => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }

  // Support 1.0–1.3 for backward compatibility
  if (
    data.version !== '1.0' &&
    data.version !== '1.1' &&
    data.version !== '1.2' &&
    data.version !== '1.3'
  ) {
    console.warn('Unknown space export version, proceeding anyway:', data.version);
  }

  const type: SpaceExportType = data.type;
  if (type !== 'tile' && type !== 'category' && type !== 'all_categories') {
    throw new Error('Invalid export type. Expected "tile", "category", or "all_categories".');
  }

  let tiles: Tile[] = [];
  if (type === 'tile') {
    if (!data.tile || typeof data.tile !== 'object') {
      throw new Error('Invalid tile export: missing "tile" object.');
    }
    tiles = [data.tile as Tile];
  } else {
    if (!Array.isArray(data.tiles)) {
      throw new Error('Invalid export: missing "tiles" array.');
    }
    tiles = data.tiles as Tile[];
  }

  const categoryName: string | undefined =
    typeof data.categoryName === 'string' ? data.categoryName : undefined;

  const categories: string[] | undefined = Array.isArray(data.categories)
    ? data.categories.filter((c: unknown) => typeof c === 'string')
    : undefined;

  const assets: Record<string, string> | undefined =
    data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets)
      ? Object.fromEntries(
          Object.entries(data.assets as Record<string, unknown>).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'string' && (v as string).startsWith('data:')
          ) as [string, string][]
        )
      : undefined;

  // Prefer file display order: by categories + position when available
  const orderedCategories = resolveExportCategories(tiles, categories);
  const orderedTiles = sortTilesByCategoryAndPosition(tiles, orderedCategories);

  return {
    type,
    tiles: orderedTiles,
    categoryName,
    categories: categories || orderedCategories,
    assets: assets && Object.keys(assets).length > 0 ? assets : undefined
  };
};

/** Create fresh Tile objects from imported data with new IDs to avoid collisions */
export const normalizeImportedTiles = (
  parsed: ParsedSpaceImport
): Tile[] => {
  const now = Date.now();

  const normalized: Tile[] = parsed.tiles.map((src, index) => {
    const baseGroup =
      (src.group && typeof src.group === 'string'
        ? src.group
        : parsed.categoryName) || 'Imported';

    // Handle tabs structure (new structure)
    const tabs = Array.isArray(src.tabs) && src.tabs.length > 0
      ? src.tabs.map((tab: any) => ({
          id: generateId(),
          title: String(tab.title || 'New Tab'),
          position: typeof tab.position === 'number' ? tab.position : 0,
          textColor: typeof tab.textColor === 'string' ? tab.textColor : undefined,
          emoji: typeof tab.emoji === 'string' ? tab.emoji : undefined,
          visibility: tab.visibility || 'public',
          allowedUsers: asNumberArray(tab.allowedUsers),
          allowedGroups: asNumberArray(tab.allowedGroups),
          visibleFrom: typeof tab.visibleFrom === 'string' ? tab.visibleFrom : undefined,
          expiresAt: typeof tab.expiresAt === 'string' ? tab.expiresAt : undefined,
          accessRestrictions: tab.accessRestrictions && typeof tab.accessRestrictions === 'object' ? tab.accessRestrictions : undefined,
          sections: Array.isArray(tab.sections)
            ? tab.sections.map(normalizeImportedSection)
            : []
        }))
      : [];

    // Handle sections structure (backward compatibility)
    const sections: LinkSection[] = Array.isArray(src.sections)
      ? src.sections.map(normalizeImportedSection)
      : [];

    const showEmoji = asOptionalBoolean(src.showEmoji);
    const showTitle = asOptionalBoolean(src.showTitle);
    const showDescription = asOptionalBoolean(src.showDescription);

    const tile: Tile = {
      id: generateUuid(),
      title: String(src.title || `Imported Space ${index + 1}`),
      description: String(src.description || ''),
      searchTags: Array.isArray(src.searchTags)
        ? (src.searchTags as unknown[])
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 100)
        : [],
      htmlContent: src.htmlContent || '',
      emoji: src.emoji || '📁',
      showEmoji: showEmoji !== undefined ? showEmoji : undefined,
      showTitle: showTitle !== undefined ? showTitle : undefined,
      showDescription: showDescription !== undefined ? showDescription : undefined,
      emojiImage: typeof src.emojiImage === 'string' && src.emojiImage.trim()
        ? src.emojiImage.trim()
        : undefined,
      emojiImageOpacity: asOptionalNumber(src.emojiImageOpacity),
      emojiImageOffsetX: asOptionalNumber(src.emojiImageOffsetX),
      emojiImageOffsetY: asOptionalNumber(src.emojiImageOffsetY),
      emojiImageZoom: asOptionalNumber(src.emojiImageZoom),
      headerImage: typeof src.headerImage === 'string' && src.headerImage.trim()
        ? src.headerImage.trim()
        : undefined,
      headerImageAlign:
        src.headerImageAlign === 'left' ||
        src.headerImageAlign === 'center' ||
        src.headerImageAlign === 'right'
          ? src.headerImageAlign
          : undefined,
      headerImageOpacity: asOptionalNumber(src.headerImageOpacity),
      headerImageOffsetX: asOptionalNumber(src.headerImageOffsetX),
      headerImageOffsetY: asOptionalNumber(src.headerImageOffsetY),
      headerImageZoom: asOptionalNumber(src.headerImageZoom),
      headerImageFit:
        src.headerImageFit === 'cover' || src.headerImageFit === 'contain'
          ? src.headerImageFit
          : undefined,
      themeColor: (src.themeColor as any) || 'blue',
      tabs: tabs.length > 0 ? tabs : undefined,
      sections: sections.length > 0 ? sections : [],
      group: baseGroup,
      position: asOptionalNumber(src.position),
      createdAt: typeof src.createdAt === 'number' ? src.createdAt : now,
      visibility: src.visibility || 'public',
      published: asOptionalBoolean(src.published),
      sourceTab: src.sourceTab === 'staging' ? 'staging' : 'public',
      allowedUsers: asNumberArray(src.allowedUsers),
      allowedGroups: asNumberArray(src.allowedGroups),
      isHyperlink: src.isHyperlink || false,
      hyperlinkUrl: src.hyperlinkUrl || undefined,
      openInNewTab: src.openInNewTab !== undefined ? src.openInNewTab : undefined,
      isVideo: src.isVideo || false,
      videoUrl: src.videoUrl || undefined,
      videoSource: src.videoSource === 'youtube' || src.videoSource === 'file' ? src.videoSource : undefined,
      browser: typeof src.browser === 'string' ? src.browser : undefined,
      visibleFrom: typeof src.visibleFrom === 'string' ? src.visibleFrom : undefined,
      expiresAt: typeof src.expiresAt === 'string' ? src.expiresAt : undefined,
      accessRestrictions: src.accessRestrictions && typeof src.accessRestrictions === 'object' ? src.accessRestrictions : undefined,
      // Preserve tile decoration properties
      tileBackgroundColor: typeof src.tileBackgroundColor === 'string' ? src.tileBackgroundColor : undefined,
      tileGradientEnabled: typeof src.tileGradientEnabled === 'boolean' ? src.tileGradientEnabled : undefined,
      tileGradientColors: Array.isArray(src.tileGradientColors) ? src.tileGradientColors : undefined,
      tileGradientDirection:
        typeof src.tileGradientDirection === 'string' || typeof src.tileGradientDirection === 'number'
          ? src.tileGradientDirection
          : undefined,
      tileGradientType:
        typeof src.tileGradientType === 'string' &&
        (GRADIENT_TYPES as readonly string[]).includes(src.tileGradientType)
          ? (src.tileGradientType as Tile['tileGradientType'])
          : undefined,
      tileGradientColorPositions: Array.isArray(src.tileGradientColorPositions)
        ? src.tileGradientColorPositions
        : undefined,
      tileBorderRadius: typeof src.tileBorderRadius === 'number' ? src.tileBorderRadius : undefined,
      tileTextColor: typeof src.tileTextColor === 'string' ? src.tileTextColor : undefined,
      // Space page entrance animation (link sections)
      pageAnimation: typeof src.pageAnimation === 'string' ? src.pageAnimation : undefined,
      // Default entrance animation for all links on this space
      linksAnimation: typeof src.linksAnimation === 'string' ? src.linksAnimation : undefined,
      // Preserve tile messages (message board + celebration effects)
      messages: Array.isArray(src.messages) && src.messages.length > 0
        ? src.messages.map((msg: any) => ({
            id: generateId(),
            content: String(msg.content || ''),
            type:
              typeof msg.type === 'string' &&
              ['info', 'warning', 'celebration', 'alert', 'custom'].includes(msg.type)
                ? (msg.type as any)
                : 'info',
            startDate: typeof msg.startDate === 'string' ? msg.startDate : new Date().toISOString(),
            endDate: typeof msg.endDate === 'string' ? msg.endDate : new Date().toISOString(),
            isActive: typeof msg.isActive === 'boolean' ? msg.isActive : true,
            priority: typeof msg.priority === 'number' ? msg.priority : undefined,
            textColor: typeof msg.textColor === 'string' ? msg.textColor : undefined,
            fontStyle: typeof msg.fontStyle === 'string' ? msg.fontStyle : undefined,
            displayLocation:
              typeof msg.displayLocation === 'string' &&
              ['tile', 'detail', 'both'].includes(msg.displayLocation)
                ? (msg.displayLocation as any)
                : 'both',
            animationType:
              typeof msg.animationType === 'string' &&
              (MESSAGE_ANIMATION_TYPES as readonly string[]).includes(msg.animationType)
                ? (msg.animationType as any)
                : 'rollover',
            delayBefore: typeof msg.delayBefore === 'number' ? msg.delayBefore : undefined,
            // Default to none so import never invents fireworks
            celebrationEffect:
              typeof msg.celebrationEffect === 'string' &&
              (CELEBRATION_EFFECTS as readonly string[]).includes(msg.celebrationEffect)
                ? (msg.celebrationEffect as any)
                : 'none',
            celebrationConfig:
              typeof msg.celebrationConfig === 'object' && msg.celebrationConfig !== null
                ? msg.celebrationConfig
                : undefined,
            url: (() => {
              if (typeof msg.url !== 'string' || !msg.url.trim()) return undefined;
              const trimmed = msg.url.trim();
              if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(trimmed)) return trimmed;
              if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
              if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
              return undefined;
            })(),
            urlLabel:
              typeof msg.urlLabel === 'string' && msg.urlLabel.trim()
                ? msg.urlLabel.trim()
                : undefined
          }))
        : undefined
    };

    return tile;
  });

  return normalized;
};
