/** Full monitor target string including optional port suffix. */
export function formatMonitorTargetFull(target: string, port?: number | null): string {
    const t = (target || '').trim();
    if (port != null && port > 0) {
        return `${t}:${port}`;
    }
    return t;
}

/** Shorten long targets for fixed-width UI (fallback when CSS ellipsis is unavailable). */
export function truncateMonitorTarget(text: string, maxLength = 56): string {
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
}
