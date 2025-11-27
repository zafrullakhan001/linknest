import { Tile, LinkSection, Link } from '../types';

export type SpaceExportType = 'tile' | 'category' | 'all_categories';

export interface SpaceExportFile {
  version: '1.0';
  type: SpaceExportType;
  exportedAt: number;
  tile?: Tile;
  tiles?: Tile[];
  categoryName?: string;
  categories?: string[];
}

export interface ParsedSpaceImport {
  type: SpaceExportType;
  tiles: Tile[];
  categoryName?: string;
  categories?: string[];
}

// Simple ID generator for imported items (client-side only)
const generateId = () => Math.random().toString(36).substring(2, 11);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'space';

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

/** Export a single space/tile to a JSON file */
export const exportTileToFile = (tile: Tile) => {
  const payload: SpaceExportFile = {
    version: '1.0',
    type: 'tile',
    exportedAt: Date.now(),
    tile
  };

  const filename = `linknest-space-${slugify(tile.title)}.json`;
  triggerDownload(payload, filename);
};

/** Export all tiles in a category (group) to a JSON file */
export const exportCategoryToFile = (categoryName: string, tiles: Tile[]) => {
  const categoryTiles = tiles.filter(
    (t) => (t.group || 'General') === categoryName
  );

  if (categoryTiles.length === 0) {
    alert(`No spaces found in category "${categoryName}".`);
    return;
  }

  const payload: SpaceExportFile = {
    version: '1.0',
    type: 'category',
    exportedAt: Date.now(),
    categoryName,
    tiles: categoryTiles
  };

  const filename = `linknest-category-${slugify(categoryName)}.json`;
  triggerDownload(payload, filename);
};

/** Export all spaces (all categories) to a JSON file */
export const exportAllCategoriesToFile = (tiles: Tile[], categoryOrder: string[] | undefined) => {
  if (!tiles.length) {
    alert('No spaces to export.');
    return;
  }

  // Derive categories from tiles, preserving the provided order if any
  const categoriesFromTiles = Array.from(
    new Set(tiles.map((t) => t.group || 'General'))
  );

  let categories: string[];
  if (categoryOrder && categoryOrder.length > 0) {
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
    categories = ordered;
  } else {
    categories = categoriesFromTiles;
  }

  const payload: SpaceExportFile = {
    version: '1.0',
    type: 'all_categories',
    exportedAt: Date.now(),
    tiles,
    categories
  };

  const filename = 'linknest-spaces-all-categories.json';
  triggerDownload(payload, filename);
};

/** Parse and lightly validate an imported JSON object */
export const parseSpaceExportObject = (data: any): ParsedSpaceImport => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }

  if (data.version !== '1.0') {
    // Be tolerant but warn
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

  return { type, tiles, categoryName, categories };
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

    const sections: LinkSection[] = Array.isArray(src.sections)
      ? src.sections.map((section) => {
          const links: Link[] = Array.isArray(section.links)
            ? section.links.map((link) => ({
                id: generateId(),
                label: String(link.label || ''),
                url: String(link.url || ''),
                visibility: (link as any).visibility || 'public',
                allowedUsers: Array.isArray((link as any).allowedUsers)
                  ? (link as any).allowedUsers
                  : undefined,
                notes: (link as any).notes || undefined,
                tooltip: (link as any).tooltip || undefined
              }))
            : [];

          return {
            id: generateId(),
            title: String(section.title || ''),
            links
          };
        })
      : [];

    const tile: Tile = {
      id: generateId(),
      title: String(src.title || `Imported Space ${index + 1}`),
      description: String(src.description || ''),
      htmlContent: src.htmlContent || '',
      emoji: src.emoji || '📁',
      themeColor: (src.themeColor as any) || 'blue',
      sections,
      group: baseGroup,
      createdAt: typeof src.createdAt === 'number' ? src.createdAt : now
    };

    return tile;
  });

  return normalized;
};






