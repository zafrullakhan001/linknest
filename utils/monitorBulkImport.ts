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

export function countBulkMonitorLines(text: string): number {
    return parseBulkMonitorLines(text).length;
}
