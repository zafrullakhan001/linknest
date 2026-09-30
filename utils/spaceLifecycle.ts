import type { Tile } from '../types';

/**
 * Tile lifecycle timestamps arrive as Unix seconds from some endpoints (`archived_at` /
 * `deleted_at` are written with PHP `time()`) and as milliseconds from others — normalise both.
 */
export function toEpochMs(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value < 1e12 ? value * 1000 : value;
}

/** Localised date + time for an archived/deleted timestamp (empty string when missing/invalid). */
export function formatLifecycleDate(value?: number | null): string {
  const ms = toEpochMs(value);
  if (!ms) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export interface SpaceContentCounts {
  tabs: number;
  sections: number;
  links: number;
}

/** Tabs / sections / links currently inside a space (shared by the lifecycle banners). */
export function countSpaceContents(tile: Tile): SpaceContentCounts {
  const tabs = tile.tabs ?? [];
  let sections = 0;
  let links = 0;
  for (const tab of tabs) {
    const tabSections = tab.sections ?? [];
    sections += tabSections.length;
    for (const section of tabSections) {
      links += section.links?.length ?? 0;
    }
  }
  return { tabs: tabs.length, sections, links };
}
