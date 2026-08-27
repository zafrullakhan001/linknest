import { Tile } from '../types';
import { isSkippableBulkUrl } from './monitorBulkImport';
import { parseSslBulkHost } from './monitorSsl';

export type BulkSpaceSearchMode = 'monitor' | 'ssl';

export interface BulkSpaceLink {
    id: string;
    label: string;
    url: string;
}

function stripLabelHtml(label: string | undefined | null): string {
    return String(label || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isEligibleBulkUrl(url: string, mode: BulkSpaceSearchMode): boolean {
    const trimmed = url.trim();
    if (isSkippableBulkUrl(trimmed)) return false;
    if (mode === 'ssl') {
        return parseSslBulkHost(trimmed).error === null;
    }
    return true;
}

function pushUniqueLink(
    out: BulkSpaceLink[],
    seen: Set<string>,
    id: string,
    label: string | undefined | null,
    url: string | undefined | null,
    mode: BulkSpaceSearchMode
): void {
    const trimmed = (url || '').trim();
    if (!isEligibleBulkUrl(trimmed, mode)) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
        id,
        label: stripLabelHtml(label) || trimmed,
        url: trimmed,
    });
}

/** Collect monitor/SSL-eligible URLs from a space (summary searchLinks or nested graph). */
export function collectTileBulkLinks(tile: Tile, mode: BulkSpaceSearchMode): BulkSpaceLink[] {
    const out: BulkSpaceLink[] = [];
    const seen = new Set<string>();

    if (tile.isHyperlink) {
        pushUniqueLink(out, seen, `${tile.id}:hyperlink`, tile.title, tile.hyperlinkUrl, mode);
    }

    (tile.searchLinks || []).forEach((link) => {
        pushUniqueLink(out, seen, link.id, link.label, link.url, mode);
    });

    if ((tile.searchLinks || []).length === 0) {
        const addFromSections = (sections?: { links?: { id: string; label: string; url: string }[] }[]) => {
            sections?.forEach((section) => {
                section.links?.forEach((link) => {
                    pushUniqueLink(out, seen, link.id, link.label, link.url, mode);
                });
            });
        };
        if (tile.tabs && tile.tabs.length > 0) {
            tile.tabs.forEach((tab) => addFromSections(tab.sections));
        } else {
            addFromSections(tile.sections);
        }
    }

    return out;
}
