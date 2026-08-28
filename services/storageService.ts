import { Tile } from '../types';
import { resolveApiBase } from './apiHelpers';
import { hasAccessRestrictions } from './accessRestrictionService';
import { fingerprintAccessHeaders } from './fingerprintService';

const API_BASE = resolveApiBase();

function fingerprintRequestHeaders(extra?: HeadersInit): HeadersInit {
  return fingerprintAccessHeaders(extra);
}

// Transform API response to Tile format
const transformTile = (apiTile: any): Tile => {
  return {
    id: apiTile.id,
    userId: apiTile.userId !== undefined && apiTile.userId !== null ? Number(apiTile.userId) : undefined,
    title: apiTile.title,
    description: apiTile.description || '',
    htmlContent: apiTile.htmlContent || '',
    emoji: apiTile.emoji || '📁',
    showEmoji: apiTile.showEmoji === false || apiTile.showEmoji === 0 || apiTile.showEmoji === '0' ? false : true,
    showTitle: apiTile.showTitle === false || apiTile.showTitle === 0 || apiTile.showTitle === '0' ? false : true,
    showDescription: apiTile.showDescription === false || apiTile.showDescription === 0 || apiTile.showDescription === '0' ? false : true,
    showShortUrls: apiTile.showShortUrls === true || apiTile.showShortUrls === 1 || apiTile.showShortUrls === '1',
    shortUrl: typeof apiTile.shortUrl === 'string' && apiTile.shortUrl ? apiTile.shortUrl : undefined,
    emojiImage: apiTile.emojiImage || undefined,
    emojiImageOpacity: typeof apiTile.emojiImageOpacity === 'number'
      ? Math.max(0, Math.min(100, apiTile.emojiImageOpacity))
      : undefined,
    emojiImageOffsetX: typeof apiTile.emojiImageOffsetX === 'number'
      ? Math.max(-50, Math.min(50, apiTile.emojiImageOffsetX))
      : undefined,
    emojiImageOffsetY: typeof apiTile.emojiImageOffsetY === 'number'
      ? Math.max(-50, Math.min(50, apiTile.emojiImageOffsetY))
      : undefined,
    emojiImageZoom: typeof apiTile.emojiImageZoom === 'number'
      ? Math.max(50, Math.min(300, apiTile.emojiImageZoom))
      : undefined,
    headerImage: apiTile.headerImage || undefined,
    headerImageAlign: apiTile.headerImageAlign === 'left' || apiTile.headerImageAlign === 'center' || apiTile.headerImageAlign === 'right'
      ? apiTile.headerImageAlign
      : undefined,
    headerImageOpacity: typeof apiTile.headerImageOpacity === 'number'
      ? Math.max(0, Math.min(100, apiTile.headerImageOpacity))
      : undefined,
    headerImageOffsetX: typeof apiTile.headerImageOffsetX === 'number'
      ? Math.max(-300, Math.min(300, apiTile.headerImageOffsetX))
      : undefined,
    headerImageOffsetY: typeof apiTile.headerImageOffsetY === 'number'
      ? Math.max(-300, Math.min(300, apiTile.headerImageOffsetY))
      : undefined,
    headerImageZoom: typeof apiTile.headerImageZoom === 'number'
      ? Math.max(50, Math.min(300, apiTile.headerImageZoom))
      : undefined,
    headerImageFit: apiTile.headerImageFit === 'cover' || apiTile.headerImageFit === 'contain'
      ? apiTile.headerImageFit
      : undefined,
    themeColor: (apiTile.themeColor || 'blue') as any,
    group: apiTile.group || 'General',
    position: typeof apiTile.position === 'number'
      ? apiTile.position
      : (typeof apiTile.position === 'string' && apiTile.position !== '' && !Number.isNaN(Number(apiTile.position))
        ? Number(apiTile.position)
        : undefined),
    createdAt: apiTile.createdAt || Date.now(),
    tabs: apiTile.tabs || [], // Include tabs if present (with richTextContent); empty for summary lists
    sections: apiTile.sections || [], // Keep for backward compatibility (with richTextContent)
    visibility: apiTile.visibility || 'public',
    published: apiTile.published === false || apiTile.published === 0 || apiTile.published === '0' ? false : true,
    sourceTab: apiTile.sourceTab === 'staging' ? 'staging' : 'public',
    allowedUsers: apiTile.allowedUsers || undefined,
    allowedGroups: Array.isArray(apiTile.allowedGroups) && apiTile.allowedGroups.length > 0
      ? apiTile.allowedGroups
      : undefined,
    isFavorite: apiTile.isFavorite || false,
    isHyperlink: apiTile.isHyperlink || false,
    hyperlinkUrl: apiTile.hyperlinkUrl || undefined,
    openInNewTab: apiTile.openInNewTab !== undefined ? apiTile.openInNewTab : undefined,
    isVideo: apiTile.isVideo || false,
    videoUrl: apiTile.videoUrl || undefined,
    videoSource: apiTile.videoSource === 'youtube' || apiTile.videoSource === 'file' ? apiTile.videoSource : undefined,
    canView: apiTile.canView !== undefined ? apiTile.canView : true, // Default to true if not set
    canEdit: apiTile.canEdit !== undefined ? apiTile.canEdit : false, // Default to false if not set
    canDelete: apiTile.canDelete !== undefined ? apiTile.canDelete : false, // Default to false if not set
    hasRoleAccess: apiTile.hasRoleAccess === true || apiTile.has_role_access === true || apiTile.hasRoleAccess === 1,
    deletedAt: apiTile.deletedAt || undefined, // Include deletedAt if present (for recycle bin)
    archivedAt: apiTile.archivedAt || undefined, // Include archivedAt if present (for archive)
    visibleFrom: apiTile.visibleFrom || undefined,
    expiresAt: apiTile.expiresAt || undefined,
    accessRestrictions: apiTile.accessRestrictions || undefined,
    browser: apiTile.browser || undefined, // Include browser if present
    // Tile decoration properties - preserve all values including false/0, only use undefined for null/missing
    tileBackgroundColor: apiTile.tileBackgroundColor !== undefined && apiTile.tileBackgroundColor !== null && apiTile.tileBackgroundColor !== '' ? apiTile.tileBackgroundColor : undefined,
    tileGradientEnabled: apiTile.tileGradientEnabled !== undefined && apiTile.tileGradientEnabled !== null ? Boolean(apiTile.tileGradientEnabled) : undefined,
    tileGradientColors: apiTile.tileGradientColors !== undefined && apiTile.tileGradientColors !== null && Array.isArray(apiTile.tileGradientColors) && apiTile.tileGradientColors.length > 0 ? apiTile.tileGradientColors : undefined,
    tileGradientColorPositions: apiTile.tileGradientColorPositions !== undefined && apiTile.tileGradientColorPositions !== null && Array.isArray(apiTile.tileGradientColorPositions) && apiTile.tileGradientColorPositions.length > 0 ? apiTile.tileGradientColorPositions : undefined,
    tileGradientDirection: apiTile.tileGradientDirection !== undefined && apiTile.tileGradientDirection !== null ? (typeof apiTile.tileGradientDirection === 'number' ? apiTile.tileGradientDirection : Number(apiTile.tileGradientDirection) || 90) : undefined,
    tileGradientType: apiTile.tileGradientType !== undefined && apiTile.tileGradientType !== null && apiTile.tileGradientType !== '' ? apiTile.tileGradientType : undefined,
    tileBorderRadius: apiTile.tileBorderRadius !== undefined && apiTile.tileBorderRadius !== null ? Number(apiTile.tileBorderRadius) : undefined,
    tileTextColor: apiTile.tileTextColor !== undefined && apiTile.tileTextColor !== null && apiTile.tileTextColor !== '' ? apiTile.tileTextColor : undefined,
    pageAnimation: apiTile.pageAnimation && apiTile.pageAnimation !== 'none' ? apiTile.pageAnimation : undefined,
    linksAnimation: apiTile.linksAnimation && apiTile.linksAnimation !== 'none' ? apiTile.linksAnimation : undefined,
    messages: apiTile.messages || undefined, // Include scheduled messages
    linkCount: typeof apiTile.linkCount === 'number' ? apiTile.linkCount : undefined,
    searchLinks: Array.isArray(apiTile.searchLinks) ? apiTile.searchLinks : undefined,
    searchTags: Array.isArray(apiTile.searchTags) ? apiTile.searchTags : undefined,
    // Shared-with-me: when tile was shared by another user and receiver accepted
    sharedWithMeInvitationId: apiTile.sharedWithMeInvitationId ?? undefined,
    sharedWithMeSharer: apiTile.sharedWithMeSharer ?? undefined
  };
};

/** Build lightweight searchLinks from a full nested tile graph. */
const extractSearchLinks = (tile: Tile): Tile['searchLinks'] => {
  if (Array.isArray(tile.searchLinks) && tile.searchLinks.length > 0) {
    return tile.searchLinks;
  }
  const links: NonNullable<Tile['searchLinks']> = [];
  const seen = new Set<string>();
  const addLinks = (sectionLinks?: { id: string; label: string; url: string; icon?: string; browser?: string; openTarget?: string; notes?: string; tooltip?: string; notesEnabled?: boolean; tooltipStyle?: 'rich' | 'classic'; richTextContent?: string; richTextEnabled?: boolean; maintenanceEnabled?: boolean; maintenanceMessage?: string; maintenanceVideoUrl?: string; health?: any }[]) => {
    sectionLinks?.forEach((link) => {
      const key = `${(link.label || '').toLowerCase()}|${(link.url || '').toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({
        id: link.id,
        label: link.label,
        url: link.url,
        icon: link.icon,
        browser: link.browser,
        openTarget: (link.openTarget as any) || undefined,
        notes: link.notes,
        tooltip: link.tooltip,
        notesEnabled: link.notesEnabled,
        tooltipStyle: link.tooltipStyle,
        richTextContent: link.richTextContent,
        richTextEnabled: link.richTextEnabled,
        maintenanceEnabled: link.maintenanceEnabled,
        maintenanceMessage: link.maintenanceMessage,
        maintenanceVideoUrl: link.maintenanceVideoUrl,
        health: link.health,
        shortUrl: (link as { shortUrl?: string }).shortUrl,
      });
    });
  };
  if (tile.tabs && tile.tabs.length > 0) {
    tile.tabs.forEach((tab) => tab.sections?.forEach((section) => addLinks(section.links)));
  } else {
    tile.sections?.forEach((section) => addLinks(section.links));
  }
  return links.length > 0 ? links : undefined;
};

/** Card-only fields for home grid state (drop nested graph after detail updates).
 * Keep messages + searchLinks — needed for banners and home-grid link search.
 */
export const toSummaryTile = (tile: Tile): Tile => {
  const searchLinks = extractSearchLinks(tile);
  return {
    ...tile,
    tabs: [],
    sections: [],
    htmlContent: undefined,
    messages: Array.isArray(tile.messages) ? tile.messages : undefined,
    searchLinks,
    linkCount: tile.linkCount ?? searchLinks?.length ?? (tile.tabs?.reduce(
      (n, tab) => n + (tab.sections?.reduce((sn, s) => sn + (s.links?.length || 0), 0) || 0),
      0
    ) ?? tile.sections?.reduce((n, s) => n + (s.links?.length || 0), 0))
  };
};

export interface GetTilesOptions {
  /** 'public' = main tab tiles (default); 'staging' = staging tab tiles (admin only) */
  sourceTab?: 'public' | 'staging';
  /**
   * When true (default), request card fields only via ?summary=1.
   * Pass false only if callers need the full nested tabs/links graph in the list.
   */
  summary?: boolean;
}

export const getTiles = async (options?: GetTilesOptions): Promise<Tile[]> => {
  const params = new URLSearchParams();
  if (options?.sourceTab === 'staging') {
    params.set('source_tab', 'staging');
  } else if (options?.sourceTab === 'public') {
    params.set('source_tab', 'public');
  }
  // Default to summary for home-grid loads; opt out with summary: false
  const useSummary = options?.summary !== false;
  if (useSummary) {
    params.set('summary', '1');
  }
  const url = params.toString() ? `${API_BASE}/tiles?${params.toString()}` : `${API_BASE}/tiles`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: fingerprintRequestHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch tiles' }));
    const error = new Error(errorData.error || 'Failed to fetch tiles') as any;
    error.response = { status: response.status };
    throw error;
  }

  const apiTiles = await response.json();
  return apiTiles.map(transformTile);
};

export const getTile = async (tileId: string): Promise<Tile | null> => {
  const response = await fetch(`${API_BASE}/tiles/${tileId}`, {
    method: 'GET',
    credentials: 'include',
    headers: fingerprintRequestHeaders(),
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch tile' }));
    throw new Error(errorData.error || 'Failed to fetch tile');
  }
  const apiTile = await response.json();
  return transformTile(apiTile);
};

export const saveTiles = async (tiles: Tile[], isFinal: boolean = false): Promise<void> => {
  // For bulk operations, we'll update/create tiles individually
  // This is a simplified version - in production, you might want batch operations
  try {
    for (const tile of tiles) {
      await saveTile(tile, isFinal);
    }
  } catch (e) {
    console.error("Failed to save tiles", e);
    throw e;
  }
};

export const saveTile = async (tile: Tile, isFinal: boolean = false): Promise<void> => {
  try {
    const hasNestedContent =
      (tile.tabs?.length ?? 0) > 0 ||
      (tile.sections?.length ?? 0) > 0 ||
      !!(tile.htmlContent && String(tile.htmlContent).trim());

    // Home-grid / card edits often have empty tabs; never send that as a full replace.
    // Still include messages so Message Board edits from the edit-space modal persist.
    const payload: Record<string, unknown> = hasNestedContent
      ? { ...tile, is_final: isFinal }
      : (() => {
          const {
            tabs: _tabs,
            sections: _sections,
            htmlContent: _html,
            ...meta
          } = tile as Tile & Record<string, unknown>;
          return {
            ...meta,
            // Explicitly keep messages (including [] to clear the board)
            messages: Array.isArray(tile.messages) ? tile.messages : undefined,
            preserve_nested: true,
            is_final: isFinal,
          };
        })();

    payload.accessRestrictions = hasAccessRestrictions(tile.accessRestrictions) ? tile.accessRestrictions : null;

    const response = await fetch(`${API_BASE}/tiles/${tile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Failed to save tile');
    }
  } catch (e) {
    console.error("Failed to save tile", e);
    throw e;
  }
};

/** Upload an image for the emoji badge; server converts to PNG (~80×80) and returns the URL. */
export const uploadTileEmojiImage = async (
  file: File | null,
  options?: {
    removeBackground?: boolean;
    bgColor?: string;
    /** Reprocess an existing tileemoji URL without uploading a new file. */
    sourceUrl?: string;
  }
): Promise<string> => {
  const formData = new FormData();
  if (file) {
    formData.append('image', file);
  }
  if (options?.sourceUrl) {
    formData.append('source_url', options.sourceUrl);
  }
  if (options?.removeBackground) {
    formData.append('remove_background', '1');
  }
  if (options?.bgColor) {
    formData.append('bg_color', options.bgColor);
  }

  const response = await fetch(`${API_BASE}/uploads/tile-emoji-image`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Failed to upload emoji image');
  }

  const url = (data as { url?: string }).url;
  if (!url) {
    throw new Error('Upload succeeded but no image URL was returned');
  }
  return url;
};

/** Upload a raster image; server converts to PNG and returns the public URL. */
export const uploadTileHeaderImage = async (
  file: File | null,
  options?: {
    removeBackground?: boolean;
    bgColor?: string;
    /** Reprocess an existing tileheader URL without uploading a new file. */
    sourceUrl?: string;
  }
): Promise<string> => {
  const formData = new FormData();
  if (file) {
    formData.append('image', file);
  }
  if (options?.sourceUrl) {
    formData.append('source_url', options.sourceUrl);
  }
  if (options?.removeBackground) {
    formData.append('remove_background', '1');
  }
  if (options?.bgColor) {
    formData.append('bg_color', options.bgColor);
  }

  const response = await fetch(`${API_BASE}/uploads/tile-header-image`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Failed to upload header image');
  }

  const url = (data as { url?: string }).url;
  if (!url) {
    throw new Error('Upload succeeded but no image URL was returned');
  }
  return url;
};

const LINK_MAINTENANCE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const uploadLinkMaintenanceVideo = async (file: Blob, filename?: string): Promise<string> => {
  if (file.size > LINK_MAINTENANCE_VIDEO_MAX_BYTES) {
    throw new Error('Video is too large. Maximum size is 50MB.');
  }

  const formData = new FormData();
  const name = filename || (file instanceof File ? file.name : 'recording.webm');
  formData.append('video', file, name);

  const response = await fetch(`${API_BASE}/uploads/link-maintenance-video`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Failed to upload maintenance video');
  }

  const url = (data as { url?: string }).url;
  if (!url) {
    throw new Error('Upload succeeded but no video URL was returned');
  }
  return url;
};

/** Persist sections/page entrance animation for one space without a full tile rewrite. */
export const updateTilePageAnimation = async (
  tileId: string,
  pageAnimation?: string | null
): Promise<{ success: boolean; pageAnimation: string | null }> => {
  const response = await fetch(`${API_BASE}/tiles/${tileId}/page-animation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      pageAnimation: pageAnimation && pageAnimation !== 'none' ? pageAnimation : null,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to save page animation' }));
    throw new Error(errorData.error || 'Failed to save page animation');
  }

  return response.json();
};

export const createTile = async (tile: Tile): Promise<Tile> => {
  try {
    const response = await fetch(`${API_BASE}/tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(tile)
    });

    if (!response.ok) {
      let errorMessage = 'Failed to create tile';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        if (errorData.details) {
          errorMessage += `: ${errorData.details}`;
        }
      } catch {
        // If response is not JSON, use status text
        errorMessage = `Failed to create tile (${response.status} ${response.statusText})`;
      }
      const error = new Error(errorMessage) as any;
      error.response = { status: response.status };
      throw error;
    }

    const data = await response.json();
    // Fetch the created tile to get full data (use same source when staging)
    const sourceTab = tile.sourceTab === 'staging' ? 'staging' : undefined;
    const tiles = await getTiles(sourceTab ? { sourceTab } : undefined);
    const created = tiles.find(t => t.id === data.id || t.id === tile.id);
    return created || { ...tile, id: data.id || tile.id };
  } catch (e) {
    console.error("Failed to create tile", e);
    throw e;
  }
};

export const deleteTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to delete tile' }));
      const message = (errorData && typeof errorData.error === 'string') ? errorData.error : `Failed to delete tile (${response.status})`;
      throw new Error(message);
    }
  } catch (e) {
    console.error("Failed to delete tile", e);
    throw e;
  }
};

export const initializeTiles = (): Tile[] => {
  // This is now just for fallback/default tiles
  // In practice, tiles come from the API
  return [];
};

export const saveTileArrangement = async (
  arrangement: Array<{ tileId: string; position: number; groupName?: string }>,
  scope?: 'global' | 'private'
): Promise<void> => {
  try {
    const body: { arrangement: typeof arrangement; scope?: 'global' | 'private' } = { arrangement };
    if (scope) body.scope = scope;
    const response = await fetch(`${API_BASE}/arrangements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to save tile arrangement';
      console.error("Failed to save tile arrangement:", errorData);
      throw new Error(errorMsg);
    }
  } catch (e) {
    console.error("Failed to save tile arrangement", e);
    throw e;
  }
};

export const getTileArrangement = async (): Promise<Array<{ tileId: string; position: number; groupName?: string }>> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tile arrangement');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to load tile arrangement", e);
    return [];
  }
};

export const saveCategoryArrangement = async (categories: Array<{ categoryName: string; position: number; visibleFrom?: string | null; expiresAt?: string | null }>): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ categories })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to save category arrangement';
      console.error("Failed to save category arrangement:", errorData);
      throw new Error(errorMsg);
    }
  } catch (e) {
    console.error("Failed to save category arrangement", e);
    throw e;
  }
};

export const getCategoryArrangement = async (): Promise<Array<{ categoryName: string; position: number; visibleFrom?: string | null; expiresAt?: string | null }>> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements/categories`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch category arrangement');
    }

    return await response.json();
  } catch (e) {
    return [];
  }
};

export const bulkImportTiles = async (
  file: File,
  options?: { replaceAll?: boolean }
): Promise<{
  success: boolean;
  created: number;
  errors: number;
  deleted?: number;
  createdTiles: Array<{ id: string; title: string }>;
  errorMessages: string[];
}> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.replaceAll) {
      formData.append('replace_all', '1');
    }

    const response = await fetch(`${API_BASE}/tiles/bulk-import`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to bulk import tiles');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to bulk import tiles", e);
    throw e;
  }
};

/** Convert CSV to import-ready JSON (no DB write). Used by Staging offline workflow. */
export const csvToJson = async (file: File): Promise<unknown> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${resolveApiBase()}/tiles/csv-to-json`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((errorData && typeof errorData.error === 'string' ? errorData.error : null) || 'Failed to convert CSV to JSON');
  }
  return response.json();
};

export const toggleFavorite = async (tileId: string): Promise<{ isFavorite: boolean }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/favorite`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to toggle favorite');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to toggle favorite", e);
    throw e;
  }
};

export const getFavorites = async (): Promise<{ favoriteTileIds: string[]; favoriteLinkIds: string[] }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/favorites`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch favorites');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to fetch favorites", e);
    return { favoriteTileIds: [], favoriteLinkIds: [] };
  }
};

export const toggleLinkFavorite = async (linkId: string): Promise<{ isFavorite: boolean }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/link/${linkId}/favorite`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to toggle link favorite' }));
      throw new Error(errorData.error || 'Failed to toggle link favorite');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to toggle link favorite", e);
    throw e;
  }
};

export interface FavoriteLink {
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
  openTarget?: 'same' | 'tab' | 'window' | 'private';
  richTextContent?: string;
  richTextEnabled?: boolean;
  maintenanceEnabled?: boolean;
  maintenanceMessage?: string;
  maintenanceVideoUrl?: string;
  isFavorite: boolean;
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
    showShortUrls?: boolean;
    shortUrl?: string;
  };
  shortUrl?: string;
}

export const getFavoriteLinks = async (): Promise<FavoriteLink[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/favorites/links`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error Response:', errorData);
      throw new Error('Failed to fetch favorite links');
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch favorite links", e);
    return [];
  }
};

/** Persist ordered favorite link IDs for the authenticated user (positions 0..n). */
export const saveFavoriteLinkOrder = async (linkIds: string[]): Promise<void> => {
  const response = await fetch(`${API_BASE}/tiles/favorites/links/order`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkIds })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to save favorite link order' }));
    throw new Error((errorData as { error?: string }).error || 'Failed to save favorite link order');
  }
};

/**
 * Resolve link IDs into FavoriteLink payloads (for guest/public favorites).
 * Home-grid tiles load in summary mode without nested links, so guests cannot
 * rebuild favorites from the tiles array alone.
 */
export const resolveFavoriteLinks = async (linkIds: string[]): Promise<FavoriteLink[]> => {
  const uniqueIds = Array.from(new Set((linkIds || []).filter((id) => typeof id === 'string' && id.trim() !== '')));
  if (uniqueIds.length === 0) {
    return [];
  }

  try {
    const response = await fetch(`${API_BASE}/tiles/resolve-favorite-links`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkIds: uniqueIds })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error Response (resolveFavoriteLinks):', errorData);
      throw new Error('Failed to resolve favorite links');
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Failed to resolve favorite links', e);
    return [];
  }
};

export const cloneTile = async (tileId: string): Promise<Tile> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/clone`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to clone tile' }));
      throw new Error(errorData.error || 'Failed to clone tile');
    }

    const data = await response.json();
    if (!data.success || !data.id) {
      throw new Error(data.error || 'Failed to clone tile');
    }

    // Fetch the cloned tile (by ID so it works for both public and staging)
    const cloned = await getTile(data.id);
    if (!cloned) {
      throw new Error('Cloned tile not found');
    }
    return cloned;
  } catch (e) {
    console.error("Failed to clone tile", e);
    throw e;
  }
};

export const cloneCategory = async (categoryName: string, options?: { sourceTab?: 'public' | 'staging' }): Promise<{
  success: boolean;
  newCategoryName: string;
  clonedTiles: Array<{ id: string; title: string }>;
  clonedCount: number;
  errors: string[];
}> => {
  try {
    const payload: { categoryName: string; sourceTab?: 'staging' } = { categoryName };
    if (options?.sourceTab === 'staging') {
      payload.sourceTab = 'staging';
    }
    // POST body (not URL path) so names with spaces are not rejected by Apache as 403.
    const response = await fetch(`${API_BASE}/tiles/clone-category`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `Failed to clone category (${response.status})` }));
      throw new Error(errorData.error || 'Failed to clone category');
    }

    const data = await response.json();
    return data;
  } catch (e) {
    console.error("Failed to clone category", e);
    throw e;
  }
};

export const toggleCategoryFavorite = async (categoryName: string): Promise<{
  success: boolean;
  isFavorite: boolean;
  action: string;
  tilesAffected: number;
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/favorite`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to toggle category favorite' }));
      throw new Error(errorData.error || 'Failed to toggle category favorite');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to toggle category favorite", e);
    throw e;
  }
};

export const archiveCategory = async (categoryName: string, options?: { sourceTab?: 'public' | 'staging' }): Promise<{
  success: boolean;
  archivedCount: number;
  categoryName: string;
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const body = options?.sourceTab === 'staging' ? JSON.stringify({ sourceTab: 'staging' }) : undefined;
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to archive category' }));
      throw new Error(errorData.error || 'Failed to archive category');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to archive category", e);
    throw e;
  }
};

export const unarchiveCategory = async (categoryName: string): Promise<{
  success: boolean;
  unarchivedCount: number;
  categoryName: string;
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/unarchive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to unarchive category' }));
      throw new Error(errorData.error || 'Failed to unarchive category');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to unarchive category", e);
    throw e;
  }
};

export const getRecycleBin = async (): Promise<Tile[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/recycle-bin`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch recycle bin');
    }

    const apiTiles = await response.json();
    return apiTiles.map(transformTile);
  } catch (e) {
    throw e;
  }
};

export const restoreTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/restore`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to restore tile');
    }
  } catch (e) {
    console.error("Failed to restore tile", e);
    throw e;
  }
};

export const getArchive = async (): Promise<Tile[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/archive`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to fetch archive';
      throw new Error(errorMsg);
    }

    const apiTiles = await response.json();
    return apiTiles.map(transformTile);
  } catch (e) {
    throw e;
  }
};

export const archiveTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/archive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to archive tile';
      console.error("Failed to archive tile:", errorData);
      throw new Error(errorMsg);
    }
  } catch (e) {
    console.error("Failed to archive tile", e);
    throw e;
  }
};

export const unarchiveTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/unarchive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to unarchive tile');
    }
  } catch (e) {
    console.error("Failed to unarchive tile", e);
    throw e;
  }
};

export const purgeRecycleBin = async (): Promise<{ success: boolean; purgedCount: number }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/purge-recycle-bin`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to purge recycle bin');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to purge recycle bin", e);
    throw e;
  }
};

export const permanentDeleteTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/permanent`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to permanently delete tile');
    }
  } catch (e) {
    console.error("Failed to permanently delete tile", e);
    throw e;
  }
};

export const permanentDeleteCategory = async (categoryName: string): Promise<{ success: boolean; purgedCount: number; categoryName: string }> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/permanent`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to permanently delete category');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to permanently delete category", e);
    throw e;
  }
};

export const createTempVersion = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/create-temp-version`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('Failed to create temp version');
    }
  } catch (e) {
    console.error("Failed to create temp version", e);
  }
};

const VISITOR_KEY_STORAGE = 'linknest_visitor_key';

function getOrCreateVisitorKey(): string {
  try {
    let key = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (!key || !/^[a-zA-Z0-9_-]{8,64}$/.test(key)) {
      key = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(VISITOR_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return `tmp${Date.now().toString(36)}`;
  }
}

export type TileVisitStats = {
  hitCount: number;
  uniqueVisitors: number;
};

export type TileUniqueVisitor = {
  type: 'user' | 'guest';
  userId: number | null;
  username: string | null;
  email: string | null;
  guestNumber?: number | null;
  hitCount: number;
  firstVisit: number;
  lastVisit: number;
};

export type TileUniqueVisitorsResult = {
  visitors: TileUniqueVisitor[];
  total: number;
  truncated: boolean;
};

function parseTileVisitStats(data: unknown): TileVisitStats | null {
  const stats = (data as { stats?: { hitCount?: unknown; uniqueVisitors?: unknown } })?.stats;
  if (!stats) return null;
  const hitCount = typeof stats.hitCount === 'number' ? stats.hitCount : Number(stats.hitCount);
  const uniqueVisitors = typeof stats.uniqueVisitors === 'number' ? stats.uniqueVisitors : Number(stats.uniqueVisitors);
  if (!Number.isFinite(hitCount)) return null;
  return {
    hitCount,
    uniqueVisitors: Number.isFinite(uniqueVisitors) ? uniqueVisitors : 0,
  };
}

/** Record a tile open for hit / unique-visitor stats. Returns stats; never throws. */
export const recordTileVisit = async (tileId: string): Promise<TileVisitStats | null> => {
  if (!tileId) return null;
  try {
    // Avoid double-count from React Strict Mode remounts in the same tab
    const debounceKey = `tile_visit_sent_${tileId}`;
    let shouldRecord = true;
    try {
      const last = sessionStorage.getItem(debounceKey);
      if (last && Date.now() - Number(last) < 15000) {
        shouldRecord = false;
      } else {
        sessionStorage.setItem(debounceKey, String(Date.now()));
      }
    } catch {
      // sessionStorage unavailable — continue
    }

    if (shouldRecord) {
      const response = await fetch(`${API_BASE}/tiles/${encodeURIComponent(tileId)}/visit`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorKey: getOrCreateVisitorKey() }),
      });
      if (!response.ok) return null;
      return parseTileVisitStats(await response.json());
    }

    const response = await fetch(`${API_BASE}/tiles/${encodeURIComponent(tileId)}/visit`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return null;
    return parseTileVisitStats(await response.json());
  } catch (e) {
    console.debug('Tile visit recording skipped:', e);
    return null;
  }
};

/** Admin-only unique visitor identities for a tile. Throws on auth/permission errors. */
export const getTileUniqueVisitors = async (tileId: string): Promise<TileUniqueVisitorsResult> => {
  if (!tileId) {
    throw new Error('Tile id is required');
  }
  const response = await fetch(`${API_BASE}/tiles/${encodeURIComponent(tileId)}/visitors`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data && typeof data.error === 'string' && data.error) || 'Failed to load unique visitors'
    );
  }
  const rawList = Array.isArray((data as { visitors?: unknown }).visitors)
    ? (data as { visitors: unknown[] }).visitors
    : [];
  const visitors: TileUniqueVisitor[] = rawList.map((item) => {
    const row = item as Partial<TileUniqueVisitor>;
    return {
      type: row.type === 'user' ? 'user' : 'guest',
      userId: typeof row.userId === 'number' ? row.userId : null,
      username: typeof row.username === 'string' ? row.username : null,
      email: typeof row.email === 'string' ? row.email : null,
      guestNumber: typeof row.guestNumber === 'number' ? row.guestNumber : null,
      hitCount: Number.isFinite(Number(row.hitCount)) ? Number(row.hitCount) : 0,
      firstVisit: Number.isFinite(Number(row.firstVisit)) ? Number(row.firstVisit) : 0,
      lastVisit: Number.isFinite(Number(row.lastVisit)) ? Number(row.lastVisit) : 0,
    };
  });
  const total = Number((data as { total?: unknown }).total);
  return {
    visitors,
    total: Number.isFinite(total) ? total : visitors.length,
    truncated: (data as { truncated?: unknown }).truncated === true,
  };
};

export const purgeArchive = async (): Promise<{ success: boolean; purgedCount: number }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/purge-archive`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to purge archive');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to purge archive", e);
    throw e;
  }
};