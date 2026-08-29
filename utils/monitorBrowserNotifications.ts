/** Browser / in-app notification helpers for monitor up/down alerts. */

export const MONITOR_BROWSER_NOTIFICATIONS_KEY = 'linknest_monitor_browser_notifications';

export const MONITOR_NOTIFY_COLOR_DOWN = '#d9534f';
export const MONITOR_NOTIFY_COLOR_UP = '#5cb85c';

export type MonitorNotifyStatus = 'up' | 'down';

export type MonitorStatusSnapshot = 'up' | 'down' | 'warning' | 'unknown' | null;

export type MonitorStatusAlert = {
    id: number;
    name: string;
    status: MonitorNotifyStatus;
    details?: string | null;
    color: string;
};

export function isBrowserNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
    if (!isBrowserNotificationSupported()) return 'unsupported';
    return Notification.permission;
}

export function readBrowserNotificationsEnabled(): boolean {
    try {
        return localStorage.getItem(MONITOR_BROWSER_NOTIFICATIONS_KEY) === 'true';
    } catch {
        return false;
    }
}

export function writeBrowserNotificationsEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(MONITOR_BROWSER_NOTIFICATIONS_KEY, enabled ? 'true' : 'false');
    } catch {
        // ignore quota / private mode
    }
}

export async function requestMonitorBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!isBrowserNotificationSupported()) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
        return await Notification.requestPermission();
    } catch {
        return Notification.permission;
    }
}

function colorForStatus(status: MonitorNotifyStatus): string {
    return status === 'down' ? MONITOR_NOTIFY_COLOR_DOWN : MONITOR_NOTIFY_COLOR_UP;
}

/** Data-URI SVG circle — Notification API has no native `color` option. */
function coloredIconDataUri(color: string): string {
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
        `<circle cx="32" cy="32" r="28" fill="${color}"/>` +
        `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * OS Notification — only when the page is hidden so Windows can show a corner toast.
 * While the tab is focused, Chrome/Edge often skip the toast and only log it in
 * Notification Center; dashboards use an in-app popup instead.
 */
export function notifyMonitorStatusChange(opts: MonitorStatusAlert): void {
    if (!isBrowserNotificationSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

    const color = opts.color || colorForStatus(opts.status);
    const icon = coloredIconDataUri(color);
    const title = opts.status === 'down' ? `Monitor down: ${opts.name}` : `Monitor up: ${opts.name}`;
    const body = (opts.details || '').trim().slice(0, 120) || undefined;

    try {
        const n = new Notification(title, {
            body,
            icon,
            badge: icon,
            tag: `linknest-monitor-${opts.id}`,
            // requireInteraction left unset so the OS auto-dismisses after a few seconds
        });
        n.onclick = () => {
            try {
                window.focus();
            } catch {
                // ignore
            }
            n.close();
        };
    } catch {
        // unsupported / blocked
    }
}

export type DiffMonitorStatusesResult = {
    prev: Map<number, MonitorStatusSnapshot>;
    alerts: MonitorStatusAlert[];
};

/**
 * Diff previous vs next monitor statuses.
 * Seeds the map on first call (or when empty) without alerting.
 */
export function diffAndNotifyMonitorStatuses(
    prev: Map<number, MonitorStatusSnapshot>,
    monitors: Array<{
        id: number;
        name: string;
        last_status: MonitorStatusSnapshot;
        last_details?: string | null;
    }>,
    enabled: boolean
): DiffMonitorStatusesResult {
    const next = new Map<number, MonitorStatusSnapshot>();
    const alerts: MonitorStatusAlert[] = [];
    const isSeed = prev.size === 0;

    for (const m of monitors) {
        const newStatus = m.last_status ?? null;
        next.set(m.id, newStatus);

        if (!enabled || isSeed) continue;
        if (!prev.has(m.id)) continue; // newly added — do not notify

        const oldStatus = prev.get(m.id) ?? null;

        if (newStatus === 'down' && oldStatus !== 'down' && oldStatus != null) {
            const alert: MonitorStatusAlert = {
                id: m.id,
                name: m.name,
                status: 'down',
                details: m.last_details,
                color: MONITOR_NOTIFY_COLOR_DOWN,
            };
            alerts.push(alert);
            notifyMonitorStatusChange(alert);
        } else if (newStatus === 'up' && oldStatus === 'down') {
            const alert: MonitorStatusAlert = {
                id: m.id,
                name: m.name,
                status: 'up',
                details: m.last_details,
                color: MONITOR_NOTIFY_COLOR_UP,
            };
            alerts.push(alert);
            notifyMonitorStatusChange(alert);
        }
    }

    return { prev: next, alerts };
}
