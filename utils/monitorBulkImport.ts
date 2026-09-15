/** Split pasted URLs, IPs, and host:port values (one per line, comma, or semicolon). */
export function parseBulkMonitorLines(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.split(/[\n,;]+/);
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(line);
    }
    return lines;
}

export const BULK_MONITOR_MAX_LINES = 100;

export function countBulkMonitorLines(text: string): number {
    return parseBulkMonitorLines(text).length;
}

/** Skip schemes and fragments that cannot be used as monitor/SSL targets. */
export function isSkippableBulkUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) return true;
    if (/^(mailto|tel|sms|javascript|data|file|blob):/i.test(trimmed)) return true;
    if (trimmed.startsWith('#')) return true;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
    return false;
}

export function bulkLineKey(line: string): string {
    return line.trim().toLowerCase();
}

export interface AppendBulkMonitorLinesResult {
    text: string;
    added: number;
    duplicates: number;
    capped: number;
}

/** Append unique targets onto an existing paste list, honoring the batch cap. */
export function appendBulkMonitorLines(
    existing: string,
    urls: string[],
    max = BULK_MONITOR_MAX_LINES
): AppendBulkMonitorLinesResult {
    const current = parseBulkMonitorLines(existing);
    const seen = new Set(current.map(bulkLineKey));
    const next = [...current];
    let added = 0;
    let duplicates = 0;
    let capped = 0;

    for (const raw of urls) {
        const line = raw.trim();
        if (!line) continue;
        const key = bulkLineKey(line);
        if (seen.has(key)) {
            duplicates += 1;
            continue;
        }
        if (next.length >= max) {
            capped += 1;
            continue;
        }
        seen.add(key);
        next.push(line);
        added += 1;
    }

    return {
        text: next.join('\n'),
        added,
        duplicates,
        capped,
    };
}
