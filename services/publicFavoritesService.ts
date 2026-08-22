import { getAppBasePath, getAppStorageScope } from './apiHelpers';

/**
 * Public Favorites Service
 * Manages favorites stored in browser localStorage for public (non-authenticated) users.
 * These favorites are completely separate from internal favorites stored in the database.
 *
 * Keys are scoped by install folder so /ArchLinks and /ERP3 (same origin) do not share lists.
 * Do not migrate or delete the old unscoped keys — that would let one instance steal the other.
 */

const STORAGE_KEY = 'linknest_public_favorites';
const LINK_STORAGE_KEY = 'linknest_public_link_favorites';
const LINK_DETAILS_STORAGE_KEY = 'linknest_public_link_favorite_details';
const ACTIVE_TAB_KEY = 'linknest_public_active_tab';
const LAYOUT_KEY = 'linknest_public_favorites_layout';
const LEGACY_FAV_LINKS_SORT_KEY = 'favLinksSort';
const LEGACY_FAVORITE_LINKS_ABOVE_KEY = 'favoriteLinksAbove';

const PUBLIC_FAVORITE_BASE_KEYS = [
  STORAGE_KEY,
  LINK_STORAGE_KEY,
  LINK_DETAILS_STORAGE_KEY,
  ACTIVE_TAB_KEY,
  LAYOUT_KEY
] as const;

export type FavLinksSort = 'default' | 'asc' | 'desc';

export interface PublicFavoritesLayout {
  favoriteLinksAbove: boolean;
  favLinksSort: FavLinksSort;
}

let didNormalizeScopeCase = false;

const canonicalKey = (baseKey: string): string => {
  const scope = getAppStorageScope();
  return `${baseKey}:${scope || '__root__'}`;
};

/**
 * Copy this folder's previous mixed-case key (e.g. :/ERP3) into the lowercase
 * canonical key. Never reads or deletes the old shared unscoped keys.
 */
const normalizeThisInstanceKeys = (): void => {
  if (didNormalizeScopeCase || typeof window === 'undefined') return;
  didNormalizeScopeCase = true;
  const path = getAppBasePath();
  if (!path) return;
  try {
    for (const baseKey of PUBLIC_FAVORITE_BASE_KEYS) {
      const canon = canonicalKey(baseKey);
      if (localStorage.getItem(canon) !== null) continue;
      const alt = `${baseKey}:${path}`;
      if (alt === canon) continue;
      const value = localStorage.getItem(alt);
      if (value !== null) {
        localStorage.setItem(canon, value);
      }
    }
  } catch {
    // localStorage may be blocked
  }
};

const storageKey = (baseKey: string): string => {
  normalizeThisInstanceKeys();
  return canonicalKey(baseKey);
};

export const getPublicFavoritesInstanceLabel = (): string => {
  const path = getAppBasePath();
  if (!path || path === '/') return 'this site';
  return path.replace(/^\//, '');
};

export const getPublicFavoritesInstanceScope = (): string => {
  return getAppStorageScope() || '__root__';
};

const normalizeInstanceScope = (value: string): string => {
  const t = value.trim().toLowerCase().replace(/\/+$/, '');
  if (t === '' || t === '/' || t === '__root__' || t === 'root') return '__root__';
  return t.startsWith('/') ? t : `/${t}`;
};

const instanceScopeFromExport = (obj: Record<string, unknown>): string | null => {
  const raw = obj.instanceScope ?? obj.instance ?? obj.appBasePath;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return normalizeInstanceScope(raw);
};

/**
 * Remove this install's public-favorite keys only (canonical + case variants).
 * Never touches another folder's keys (e.g. /ERP3) or the old shared unscoped keys.
 */
const removeThisInstanceKey = (baseKey: string): void => {
  const currentScope = getPublicFavoritesInstanceScope().toLowerCase();
  const path = (getAppBasePath() || '').toLowerCase();
  const prefix = `${baseKey}:`;
  const toRemove: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length).toLowerCase();
      if (rest === currentScope || (path && rest === path)) {
        toRemove.push(key);
      }
    }
    if (toRemove.length === 0) {
      toRemove.push(canonicalKey(baseKey));
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    try {
      localStorage.removeItem(canonicalKey(baseKey));
    } catch {
      // ignore
    }
  }
};

export interface PublicFavoriteLinkDetail {
  id: string;
  label: string;
  url: string;
  icon?: string;
  textColor?: string;
  visibility?: string;
  notes?: string;
  tooltip?: string;
  notesEnabled?: boolean;
  tooltipStyle?: 'rich' | 'classic';
  browser?: string;
  richTextContent?: string;
  richTextEnabled?: boolean;
  maintenanceEnabled?: boolean;
  maintenanceMessage?: string;
  maintenanceVideoUrl?: string;
  health?: {
    status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted' | 'accessible' | 'redirected' | 'network';
    httpCode?: number | null;
    error?: string | null;
    checkedAt?: number | null;
  };
  tile: {
    id: string;
    title: string;
    emoji: string;
    themeColor: string;
  };
}

// ============ LOCALSTORAGE AVAILABILITY CHECK ============

/**
 * Check if localStorage is available and working in the current browser
 * This handles cases where:
 * - localStorage is blocked (e.g., Safari private mode, some mobile browsers)
 * - localStorage quota is exceeded
 * - localStorage is disabled by user/browser settings
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    // localStorage is not available (blocked, quota exceeded, or disabled)
    return false;
  }
};

/**
 * Check if localStorage is available and log a warning if not
 * This helps users understand why favorites might not work
 */
export const checkLocalStorageAvailability = (): boolean => {
  const available = isLocalStorageAvailable();
  if (!available) {
    console.warn(
      '[PublicFavoritesService] localStorage is not available. ' +
      'Public favorites feature will not work. This may happen if: ' +
      '1. You are in private/incognito mode (some browsers clear localStorage), ' +
      '2. localStorage is disabled in browser settings, ' +
      '3. Storage quota is exceeded, or ' +
      '4. Your browser does not support localStorage.'
    );
  }
  return available;
};

// ============ TILE FAVORITES ============

/**
 * Get all public favorite tile IDs from localStorage
 * Returns empty array if localStorage is not available
 */
export const getPublicFavorites = (): string[] => {
  if (!isLocalStorageAvailable()) {
    return [];
  }
  
  try {
    const stored = localStorage.getItem(storageKey(STORAGE_KEY));
    if (!stored) return [];
    const favorites = JSON.parse(stored);
    return Array.isArray(favorites) ? favorites : [];
  } catch (error) {
    console.error('Failed to get public favorites:', error);
    return [];
  }
};

/**
 * Check if a tile is in public favorites
 */
export const isPublicFavorite = (tileId: string): boolean => {
  const favorites = getPublicFavorites();
  return favorites.includes(tileId);
};

/**
 * Add a tile to public favorites
 * Returns true if successful, false if localStorage is not available
 */
export const addPublicFavorite = (tileId: string): boolean => {
  if (!isLocalStorageAvailable()) {
    checkLocalStorageAvailability(); // Log warning
    return false;
  }
  
  try {
    const favorites = getPublicFavorites();
    if (!favorites.includes(tileId)) {
      favorites.push(tileId);
      localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(favorites));
      return true;
    }
    return true; // Already in favorites
  } catch (error) {
    console.error('Failed to add public favorite:', error);
    return false;
  }
};

/**
 * Remove a tile from public favorites
 * Returns true if successful, false if localStorage is not available
 */
export const removePublicFavorite = (tileId: string): boolean => {
  if (!isLocalStorageAvailable()) {
    return false;
  }
  
  try {
    const favorites = getPublicFavorites();
    const filtered = favorites.filter(id => id !== tileId);
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to remove public favorite:', error);
    return false;
  }
};

/**
 * Toggle a tile's public favorite status
 */
export const togglePublicFavorite = (tileId: string): boolean => {
  const isFavorite = isPublicFavorite(tileId);
  if (isFavorite) {
    removePublicFavorite(tileId);
    return false;
  } else {
    addPublicFavorite(tileId);
    return true;
  }
};

/**
 * Replace the public favorite tile ID list (preserves caller order).
 */
export const setPublicFavorites = (ids: string[]): boolean => {
  if (!isLocalStorageAvailable()) {
    checkLocalStorageAvailability();
    return false;
  }

  try {
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(pruneIdList(ids)));
    return true;
  } catch (error) {
    console.error('Failed to set public favorites:', error);
    return false;
  }
};

/**
 * Swap two IDs in an ordered list. Returns a new array; no-op if either ID is missing.
 */
export const swapPublicFavoriteIds = (list: string[], idA: string, idB: string): string[] => {
  const next = [...list];
  const i = next.indexOf(idA);
  const j = next.indexOf(idB);
  if (i === -1 || j === -1 || i === j) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

const DEFAULT_PUBLIC_FAVORITES_LAYOUT: PublicFavoritesLayout = {
  favoriteLinksAbove: true,
  favLinksSort: 'default'
};

const normalizeFavLinksSort = (value: unknown): FavLinksSort => {
  return value === 'asc' || value === 'desc' || value === 'default' ? value : 'default';
};

const normalizeLayout = (raw: unknown, fallback: PublicFavoritesLayout): PublicFavoritesLayout => {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const aboveRaw = obj.favoriteLinksAbove;
  const favoriteLinksAbove =
    typeof aboveRaw === 'boolean'
      ? aboveRaw
      : typeof aboveRaw === 'string'
        ? aboveRaw === 'true'
        : fallback.favoriteLinksAbove;
  return {
    favoriteLinksAbove,
    favLinksSort: normalizeFavLinksSort(obj.favLinksSort ?? fallback.favLinksSort)
  };
};

/**
 * Guest Favorites layout (section above/below + link sort).
 * Migrates once from the old unscoped keys without deleting them.
 */
export const getPublicFavoritesLayout = (): PublicFavoritesLayout => {
  if (!isLocalStorageAvailable()) {
    return { ...DEFAULT_PUBLIC_FAVORITES_LAYOUT };
  }

  try {
    const stored = localStorage.getItem(storageKey(LAYOUT_KEY));
    if (stored) {
      return normalizeLayout(JSON.parse(stored), DEFAULT_PUBLIC_FAVORITES_LAYOUT);
    }

    const legacySort = localStorage.getItem(LEGACY_FAV_LINKS_SORT_KEY);
    const legacyAbove = localStorage.getItem(LEGACY_FAVORITE_LINKS_ABOVE_KEY);
    if (legacySort !== null || legacyAbove !== null) {
      const layout: PublicFavoritesLayout = {
        favoriteLinksAbove: legacyAbove !== null ? legacyAbove === 'true' : true,
        favLinksSort: normalizeFavLinksSort(legacySort)
      };
      localStorage.setItem(storageKey(LAYOUT_KEY), JSON.stringify(layout));
      return layout;
    }
  } catch (error) {
    console.error('Failed to get public favorites layout:', error);
  }

  return { ...DEFAULT_PUBLIC_FAVORITES_LAYOUT };
};

export const setPublicFavoritesLayout = (partial: Partial<PublicFavoritesLayout>): PublicFavoritesLayout => {
  const current = getPublicFavoritesLayout();
  const next: PublicFavoritesLayout = {
    favoriteLinksAbove: partial.favoriteLinksAbove ?? current.favoriteLinksAbove,
    favLinksSort: partial.favLinksSort !== undefined
      ? normalizeFavLinksSort(partial.favLinksSort)
      : current.favLinksSort
  };

  try {
    if (isLocalStorageAvailable()) {
      localStorage.setItem(storageKey(LAYOUT_KEY), JSON.stringify(next));
    }
  } catch (error) {
    console.error('Failed to save public favorites layout:', error);
  }

  return next;
};

/**
 * Clear all public favorites
 */
export const clearPublicFavorites = (): void => {
  try {
    removeThisInstanceKey(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear public favorites:', error);
  }
};

/**
 * Get the active tab preference for public users
 */
export const getPublicActiveTab = (): string | null => {
  try {
    return localStorage.getItem(storageKey(ACTIVE_TAB_KEY));
  } catch (error) {
    console.error('Failed to get public active tab:', error);
    return null;
  }
};

/**
 * Save the active tab preference for public users
 */
export const setPublicActiveTab = (tab: string): void => {
  try {
    localStorage.setItem(storageKey(ACTIVE_TAB_KEY), tab);
  } catch (error) {
    console.error('Failed to save public active tab:', error);
  }
};

/**
 * Keep only string IDs that currently belong in public favorites storage.
 */
const pruneIdList = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
};

/**
 * Coerce mixed ID lists from older exports into unique non-empty strings.
 * Skips bad entries instead of failing the whole import.
 * When entries include a numeric `position`, sort by that before returning IDs.
 */
const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  type ParsedEntry = { id: string; position: number | null; index: number };
  const entries: ParsedEntry[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    let id: string | null = null;
    let position: number | null = null;
    if (typeof entry === 'string') {
      id = entry.trim();
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      id = String(entry);
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const candidate = obj.id ?? obj.tileId ?? obj.linkId;
      if (typeof candidate === 'string') id = candidate.trim();
      else if (typeof candidate === 'number' && Number.isFinite(candidate)) id = String(candidate);
      if (typeof obj.position === 'number' && Number.isFinite(obj.position)) {
        position = obj.position;
      }
    }

    if (id && !seen.has(id)) {
      seen.add(id);
      entries.push({ id, position, index });
    }
  }

  if (entries.some((entry) => entry.position !== null)) {
    entries.sort((a, b) => {
      const pa = a.position ?? a.index;
      const pb = b.position ?? b.index;
      if (pa !== pb) return pa - pb;
      return a.index - b.index;
    });
  }

  return entries.map((entry) => entry.id);
};

/**
 * Normalize cached link-detail snapshots from older exports.
 * Missing fields get safe defaults so Favorites can still render.
 */
const normalizeLinkFavoriteDetails = (
  value: unknown,
  linkIds: string[]
): Record<string, PublicFavoriteLinkDetail> => {
  const map: Record<string, PublicFavoriteLinkDetail> = {};
  if (!value || typeof value !== 'object') return map;

  const source = Array.isArray(value)
    ? Object.fromEntries(
        value
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => {
            const id = typeof item.id === 'string' ? item.id : '';
            return [id, item];
          })
          .filter(([id]) => !!id)
      )
    : (value as Record<string, unknown>);

  // Prefer explicit IDs; if none, fall back to detail keys that look like real snapshots
  const preferredIds = linkIds.length > 0 ? linkIds : Object.keys(source);

  for (const id of preferredIds) {
    const raw = source[id];
    if (!raw || typeof raw !== 'object') continue;
    const detail = raw as Record<string, unknown>;
    const tileRaw =
      detail.tile && typeof detail.tile === 'object'
        ? (detail.tile as Record<string, unknown>)
        : {};

    const label =
      (typeof detail.label === 'string' && detail.label) ||
      (typeof detail.title === 'string' && detail.title) ||
      (typeof detail.name === 'string' && detail.name) ||
      'Favorite Link';
    const url =
      (typeof detail.url === 'string' && detail.url) ||
      (typeof detail.href === 'string' && detail.href) ||
      '';

    // Skip empty junk snapshots that have neither label nor url
    if (!url && label === 'Favorite Link' && !detail.label && !detail.title) {
      continue;
    }

    map[id] = {
      id,
      label,
      url,
      icon: typeof detail.icon === 'string' ? detail.icon : undefined,
      textColor: typeof detail.textColor === 'string' ? detail.textColor : undefined,
      visibility: typeof detail.visibility === 'string' ? detail.visibility : undefined,
      notes: typeof detail.notes === 'string' ? detail.notes : undefined,
      tooltip: typeof detail.tooltip === 'string' ? detail.tooltip : undefined,
      notesEnabled: detail.notesEnabled === true,
      tooltipStyle: detail.tooltipStyle === 'rich' ? 'rich' : (detail.tooltipStyle === 'classic' ? 'classic' : undefined),
      browser: typeof detail.browser === 'string' ? detail.browser : undefined,
      richTextContent: typeof detail.richTextContent === 'string' ? detail.richTextContent : undefined,
      richTextEnabled: detail.richTextEnabled === true,
      maintenanceEnabled: detail.maintenanceEnabled === true,
      maintenanceMessage: typeof detail.maintenanceMessage === 'string' ? detail.maintenanceMessage : undefined,
      maintenanceVideoUrl: typeof detail.maintenanceVideoUrl === 'string' ? detail.maintenanceVideoUrl : undefined,
      health:
        detail.health && typeof detail.health === 'object'
          ? (detail.health as PublicFavoriteLinkDetail['health'])
          : undefined,
      tile: {
        id: typeof tileRaw.id === 'string' ? tileRaw.id : '',
        title: typeof tileRaw.title === 'string' ? tileRaw.title : 'Space',
        emoji: typeof tileRaw.emoji === 'string' ? tileRaw.emoji : '🔗',
        themeColor: typeof tileRaw.themeColor === 'string' ? tileRaw.themeColor : 'blue'
      }
    };
  }

  return map;
};

export interface PublicFavoritesExportOptions {
  /** Space IDs currently visible on the Favorites tab (preferred over raw localStorage). */
  spaceIds?: string[];
  /** Link snapshots currently shown on the Favorites tab. */
  links?: PublicFavoriteLinkDetail[];
  /** Guest layout prefs (section position + link sort). */
  layout?: PublicFavoritesLayout;
}

/**
 * Build a clean export payload from what the user actually has favorited,
 * not stale/orphan IDs left in localStorage.
 */
export const buildPublicFavoritesExportData = (
  options?: PublicFavoritesExportOptions
): {
  version: string;
  instance: string;
  instanceScope: string;
  instanceLabel: string;
  exportDate: string;
  favorites: string[];
  linkFavorites: string[];
  linkFavoriteDetails: Record<string, PublicFavoriteLinkDetail>;
  activeTab: string;
  layout: PublicFavoritesLayout;
} => {
  const storedSpaceIds = pruneIdList(getPublicFavorites());
  const storedLinkIds = pruneIdList(getPublicLinkFavorites());
  const storedDetails = getPublicLinkFavoriteDetailsMap();

  // When the UI passes live Favorites-tab data, that is authoritative
  // (including empty lists — do not fall back to stale localStorage junk).
  const favorites = pruneIdList(
    options?.spaceIds !== undefined ? options.spaceIds : storedSpaceIds
  );

  let linkFavorites: string[];
  let linkFavoriteDetails: Record<string, PublicFavoriteLinkDetail> = {};

  if (options?.links !== undefined) {
    linkFavorites = [];
    for (const link of options.links) {
      if (!link?.id || typeof link.id !== 'string') continue;
      const id = link.id.trim();
      if (!id || linkFavorites.includes(id)) continue;
      linkFavorites.push(id);
      linkFavoriteDetails[id] = {
        id,
        label: link.label || 'Favorite Link',
        url: link.url || '',
        icon: link.icon,
        textColor: link.textColor,
        visibility: link.visibility,
        notes: link.notes,
        tooltip: link.tooltip,
        notesEnabled: link.notesEnabled,
        tooltipStyle: link.tooltipStyle,
        browser: link.browser,
        richTextContent: link.richTextContent,
        richTextEnabled: link.richTextEnabled,
        maintenanceEnabled: link.maintenanceEnabled,
        maintenanceMessage: link.maintenanceMessage,
        maintenanceVideoUrl: link.maintenanceVideoUrl,
        health: link.health,
        tile: {
          id: link.tile?.id || '',
          title: link.tile?.title || 'Space',
          emoji: link.tile?.emoji || '🔗',
          themeColor: link.tile?.themeColor || 'blue'
        }
      };
    }
  } else {
    // Fall back to storage, but only keep details that match current link IDs
    linkFavorites = storedLinkIds;
    for (const id of linkFavorites) {
      if (storedDetails[id]) {
        linkFavoriteDetails[id] = storedDetails[id];
      }
    }
  }

  // Persist the cleaned lists so future exports/imports stay accurate
  try {
    if (isLocalStorageAvailable()) {
      localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(favorites));
      localStorage.setItem(storageKey(LINK_STORAGE_KEY), JSON.stringify(linkFavorites));
      localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(linkFavoriteDetails));
    }
  } catch (error) {
    console.error('Failed to prune public favorites during export:', error);
  }

  const layout = options?.layout
    ? normalizeLayout(options.layout, getPublicFavoritesLayout())
    : getPublicFavoritesLayout();

  try {
    if (isLocalStorageAvailable()) {
      localStorage.setItem(storageKey(LAYOUT_KEY), JSON.stringify(layout));
    }
  } catch (error) {
    console.error('Failed to persist public favorites layout during export:', error);
  }

  return {
    version: '1.4',
    instance: getAppBasePath() || '/',
    instanceScope: getPublicFavoritesInstanceScope(),
    instanceLabel: getPublicFavoritesInstanceLabel(),
    exportDate: new Date().toISOString(),
    favorites,
    linkFavorites,
    linkFavoriteDetails,
    activeTab: getPublicActiveTab() || 'public-favorites',
    layout
  };
};

/**
 * Export public favorites to a JSON file
 */
export const exportPublicFavorites = (options?: PublicFavoritesExportOptions): void => {
  try {
    const exportData = buildPublicFavoritesExportData(options);

    if (exportData.favorites.length === 0 && exportData.linkFavorites.length === 0) {
      throw new Error('No public favorites to export.');
    }

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = getPublicFavoritesInstanceScope().replace(/^\//, '') || 'root';
    a.download = `linknest-public-favorites-${slug}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export public favorites:', error);
    throw error;
  }
};

/**
 * Import public favorites from a JSON file.
 * Tolerant of older app versions and incomplete JSON: missing fields are skipped
 * or defaulted, and invalid entries are filtered out instead of failing import.
 * Empty arrays do not wipe existing favorites unless the file clearly replaces that list
 * with real content in the paired field / details.
 */
export const importPublicFavorites = async (file: File): Promise<{
  success: boolean;
  message: string;
  importedCount: number;
}> => {
  try {
    if (!isLocalStorageAvailable()) {
      checkLocalStorageAvailability();
      throw new Error('localStorage is not available. Cannot import favorites in this browser.');
    }

    const fileText = await file.text();

    let data: unknown;
    try {
      data = JSON.parse(fileText);
    } catch {
      throw new Error('Invalid JSON file. Please ensure the file is a valid public favorites export.');
    }

    let favoritesRaw: unknown = undefined;
    let linkFavoritesRaw: unknown = undefined;
    let linkDetailsRaw: unknown = undefined;
    let activeTabRaw: unknown = undefined;
    let layoutRaw: unknown = undefined;

    if (Array.isArray(data)) {
      // Legacy: bare array of space IDs
      favoritesRaw = data;
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      const fileScope = instanceScopeFromExport(obj);
      const currentScope = getPublicFavoritesInstanceScope();
      if (fileScope && fileScope !== currentScope) {
        const fromLabel =
          (typeof obj.instanceLabel === 'string' && obj.instanceLabel.trim())
            ? obj.instanceLabel.trim()
            : fileScope.replace(/^\//, '');
        throw new Error(
          `This file was exported from ${fromLabel}. Import it on that instance only — not on ${getPublicFavoritesInstanceLabel()}.`
        );
      }

      // Only accept known favorites export keys (avoid accidental picks like "tiles"/"links")
      if ('favorites' in obj) favoritesRaw = obj.favorites;
      else if ('tileFavorites' in obj) favoritesRaw = obj.tileFavorites;
      else if ('favoriteTiles' in obj) favoritesRaw = obj.favoriteTiles;

      if ('linkFavorites' in obj) linkFavoritesRaw = obj.linkFavorites;
      else if ('favoriteLinks' in obj) linkFavoritesRaw = obj.favoriteLinks;
      else if ('linkIds' in obj) linkFavoritesRaw = obj.linkIds;

      if ('linkFavoriteDetails' in obj) linkDetailsRaw = obj.linkFavoriteDetails;
      else if ('favoriteLinkDetails' in obj) linkDetailsRaw = obj.favoriteLinkDetails;
      else if ('linkFavoriteSnapshots' in obj) linkDetailsRaw = obj.linkFavoriteSnapshots;

      activeTabRaw = obj.activeTab;
      layoutRaw = obj.layout ?? {
        favoriteLinksAbove: obj.favoriteLinksAbove,
        favLinksSort: obj.favLinksSort
      };
    } else {
      throw new Error('Invalid export format. Expected a JSON object or array of favorite IDs.');
    }

    const hasFavoritesField = favoritesRaw !== undefined;
    const hasLinkFavoritesField = linkFavoritesRaw !== undefined;
    const hasLinkDetailsField = linkDetailsRaw !== undefined;

    let favorites = hasFavoritesField ? normalizeIdList(favoritesRaw) : null;
    let linkFavorites = hasLinkFavoritesField ? normalizeIdList(linkFavoritesRaw) : null;

    // Build details early so we can recover IDs from snapshots when the ID list is missing/empty
    let detailsMap: Record<string, PublicFavoriteLinkDetail> = {};
    if (hasLinkDetailsField) {
      detailsMap = normalizeLinkFavoriteDetails(
        linkDetailsRaw,
        linkFavorites && linkFavorites.length > 0 ? linkFavorites : []
      );
    }

    // Recover link IDs from detail snapshots when the ID list is absent or empty
    if ((linkFavorites === null || linkFavorites.length === 0) && Object.keys(detailsMap).length > 0) {
      linkFavorites = Object.keys(detailsMap);
    }

    const importingSpaces = favorites !== null && favorites.length > 0;
    const importingLinks =
      (linkFavorites !== null && linkFavorites.length > 0) ||
      Object.keys(detailsMap).length > 0;

    if (!importingSpaces && !importingLinks) {
      throw new Error('No favorites found in this file. Existing favorites were left unchanged.');
    }

    // Apply space favorites only when the file has real space IDs
    // (never wipe spaces just because an old/partial file had favorites: [])
    if (importingSpaces && favorites) {
      localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(favorites));
    }

    let importedLinks = 0;
    if (linkFavorites !== null && linkFavorites.length > 0) {
      localStorage.setItem(storageKey(LINK_STORAGE_KEY), JSON.stringify(linkFavorites));
      importedLinks = linkFavorites.length;

      if (Object.keys(detailsMap).length > 0) {
        // Keep only details for imported IDs
        const kept: Record<string, PublicFavoriteLinkDetail> = {};
        for (const id of linkFavorites) {
          if (detailsMap[id]) kept[id] = detailsMap[id];
        }
        // If normalize filtered by empty preferredIds earlier, rebuild from all details for these IDs
        if (Object.keys(kept).length === 0 && hasLinkDetailsField) {
          const rebuilt = normalizeLinkFavoriteDetails(linkDetailsRaw, linkFavorites);
          localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(rebuilt));
        } else {
          localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(kept));
        }
      } else {
        // Keep any existing snapshots that still match imported IDs
        const existing = getPublicLinkFavoriteDetailsMap();
        const kept: Record<string, PublicFavoriteLinkDetail> = {};
        for (const id of linkFavorites) {
          if (existing[id]) kept[id] = existing[id];
        }
        localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(kept));
      }
    } else if (Object.keys(detailsMap).length > 0) {
      const inferredIds = Object.keys(detailsMap);
      localStorage.setItem(storageKey(LINK_STORAGE_KEY), JSON.stringify(inferredIds));
      localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(detailsMap));
      importedLinks = inferredIds.length;
    }

    if (typeof activeTabRaw === 'string') {
      const validTabs = ['public', 'public-favorites'];
      if (validTabs.includes(activeTabRaw)) {
        setPublicActiveTab(activeTabRaw);
      } else {
        setPublicActiveTab('public-favorites');
      }
    } else {
      setPublicActiveTab('public-favorites');
    }

    if (layoutRaw && typeof layoutRaw === 'object') {
      const importedLayout = layoutRaw as Record<string, unknown>;
      const hasAbove = importedLayout.favoriteLinksAbove !== undefined;
      const hasSort = importedLayout.favLinksSort !== undefined;
      if (hasAbove || hasSort) {
        setPublicFavoritesLayout({
          ...(hasAbove ? { favoriteLinksAbove: importedLayout.favoriteLinksAbove === true || importedLayout.favoriteLinksAbove === 'true' } : {}),
          ...(hasSort ? { favLinksSort: normalizeFavLinksSort(importedLayout.favLinksSort) } : {})
        });
      }
    }

    const parts: string[] = [];
    if (importingSpaces && favorites) {
      parts.push(`${favorites.length} space favorite(s)`);
    }
    if (importedLinks > 0) {
      parts.push(`${importedLinks} link favorite(s)`);
    }

    return {
      success: true,
      message: `Imported ${parts.join(' and ')} into ${getPublicFavoritesInstanceLabel()} only.`,
      importedCount: (importingSpaces && favorites ? favorites.length : 0) + importedLinks
    };
  } catch (error) {
    console.error('Failed to import public favorites:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to import public favorites';
    return {
      success: false,
      message: errorMessage,
      importedCount: 0
    };
  }
};

// ============ LINK FAVORITES ============

/**
 * Get all public favorite link IDs from localStorage
 */
export const getPublicLinkFavorites = (): string[] => {
  try {
    const stored = localStorage.getItem(storageKey(LINK_STORAGE_KEY));
    if (!stored) return [];
    const favorites = JSON.parse(stored);
    return Array.isArray(favorites) ? favorites : [];
  } catch (error) {
    console.error('Failed to get public link favorites:', error);
    return [];
  }
};

/**
 * Replace the public favorite link ID list (preserves caller order).
 */
export const setPublicLinkFavorites = (ids: string[]): boolean => {
  if (!isLocalStorageAvailable()) {
    checkLocalStorageAvailability();
    return false;
  }

  try {
    localStorage.setItem(storageKey(LINK_STORAGE_KEY), JSON.stringify(pruneIdList(ids)));
    return true;
  } catch (error) {
    console.error('Failed to set public link favorites:', error);
    return false;
  }
};

/**
 * Check if a link is in public favorites
 */
export const isPublicLinkFavorite = (linkId: string): boolean => {
  const favorites = getPublicLinkFavorites();
  return favorites.includes(linkId);
};

/**
 * Add a link to public favorites
 */
export const addPublicLinkFavorite = (linkId: string): void => {
  try {
    const favorites = getPublicLinkFavorites();
    if (!favorites.includes(linkId)) {
      favorites.push(linkId);
      localStorage.setItem(storageKey(LINK_STORAGE_KEY), JSON.stringify(favorites));
    }
  } catch (error) {
    console.error('Failed to add public link favorite:', error);
  }
};

/**
 * Remove a link from public favorites
 */
export const removePublicLinkFavorite = (linkId: string): void => {
  try {
    const favorites = getPublicLinkFavorites();
    const filtered = favorites.filter(id => id !== linkId);
    localStorage.setItem(storageKey(LINK_STORAGE_KEY), JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove public link favorite:', error);
  }
};

/**
 * Toggle a link's public favorite status
 */
export const togglePublicLinkFavorite = (linkId: string): boolean => {
  const isFavorite = isPublicLinkFavorite(linkId);
  if (isFavorite) {
    removePublicLinkFavorite(linkId);
    removePublicLinkFavoriteDetail(linkId);
    return false;
  } else {
    addPublicLinkFavorite(linkId);
    return true;
  }
};

/**
 * Get cached public favorite link details (snapshots saved when favoriting).
 */
export const getPublicLinkFavoriteDetailsMap = (): Record<string, PublicFavoriteLinkDetail> => {
  try {
    const stored = localStorage.getItem(storageKey(LINK_DETAILS_STORAGE_KEY));
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('Failed to get public link favorite details:', error);
    return {};
  }
};

/**
 * Ordered list of cached public favorite link details for current IDs.
 */
export const getPublicLinkFavoriteDetails = (): PublicFavoriteLinkDetail[] => {
  const ids = getPublicLinkFavorites();
  const map = getPublicLinkFavoriteDetailsMap();
  return ids.map((id) => map[id]).filter(Boolean) as PublicFavoriteLinkDetail[];
};

/**
 * Store/update a snapshot for a public favorite link so the Favorites tab
 * can render even when home-grid tiles are loaded in summary mode.
 */
export const upsertPublicLinkFavoriteDetail = (detail: PublicFavoriteLinkDetail): void => {
  if (!detail?.id) return;
  try {
    const map = getPublicLinkFavoriteDetailsMap();
    map[detail.id] = detail;
    localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(map));
  } catch (error) {
    console.error('Failed to save public link favorite detail:', error);
  }
};

export const removePublicLinkFavoriteDetail = (linkId: string): void => {
  try {
    const map = getPublicLinkFavoriteDetailsMap();
    if (map[linkId]) {
      delete map[linkId];
      localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(map));
    }
  } catch (error) {
    console.error('Failed to remove public link favorite detail:', error);
  }
};

/**
 * Replace cached details with a freshly resolved list (keeps only current IDs).
 */
export const syncPublicLinkFavoriteDetails = (details: PublicFavoriteLinkDetail[]): void => {
  try {
    const ids = new Set(getPublicLinkFavorites());
    const map: Record<string, PublicFavoriteLinkDetail> = {};
    details.forEach((detail) => {
      if (detail?.id && ids.has(detail.id)) {
        map[detail.id] = detail;
      }
    });
    localStorage.setItem(storageKey(LINK_DETAILS_STORAGE_KEY), JSON.stringify(map));
  } catch (error) {
    console.error('Failed to sync public link favorite details:', error);
  }
};

/**
 * Clear all public link favorites
 */
export const clearPublicLinkFavorites = (): void => {
  try {
    removeThisInstanceKey(LINK_STORAGE_KEY);
    removeThisInstanceKey(LINK_DETAILS_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear public link favorites:', error);
  }
};

