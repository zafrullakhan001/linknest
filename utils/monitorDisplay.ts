/** Full monitor target string including optional port suffix. */
export function formatMonitorTargetFull(target: string, port?: number | null): string {
    const t = (target || '').trim();
    if (port != null && port > 0) {
        return `${t}:${port}`;
    }
    return t;
}

const BLOCKED_LAUNCH_SCHEME = /^(javascript|data|vbscript|file|blob|about):/i;

/**
 * Browser-openable http(s) URL for a monitor target, or null if it should not be launched.
 */
export function getMonitorLaunchUrl(target: string, port?: number | null): string | null {
    const raw = (target || '').trim();
    if (!raw || /\s/.test(raw) || BLOCKED_LAUNCH_SCHEME.test(raw)) {
        return null;
    }

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return null;
            }
            return parsed.href;
        } catch {
            return null;
        }
    }

    // Non-web schemes (ssh://, mysql://, etc.)
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        return null;
    }

    let hostAndPath = raw;
    if (port != null && port > 0 && port !== 80 && port !== 443) {
        const hostPart = raw.split('/')[0];
        if (!/:\d+$/.test(hostPart)) {
            const slash = raw.indexOf('/');
            hostAndPath = slash === -1
                ? `${raw}:${port}`
                : `${raw.slice(0, slash)}:${port}${raw.slice(slash)}`;
        }
    }

    try {
        const parsed = new URL(`https://${hostAndPath}`);
        if (parsed.protocol !== 'https:' || !parsed.hostname) {
            return null;
        }
        return parsed.href;
    } catch {
        return null;
    }
}

/** Shorten long targets for fixed-width UI (fallback when CSS ellipsis is unavailable). */
export function truncateMonitorTarget(text: string, maxLength = 56): string {
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
}
