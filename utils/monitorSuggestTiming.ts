import { MonitorType } from '../services/monitoringService';

export interface MonitorSuggestTimingDefaults {
    timeout: number | null;
    warning_threshold: number;
    interval: number;
}

/** Worker/API interval is always stored in minutes. SSL cert checks use whole days. */
export const MINUTES_PER_DAY = 1440;
export const SSL_INTERVAL_MIN_DAYS = 1;
export const SSL_INTERVAL_MAX_DAYS = 30;
export const SSL_INTERVAL_DEFAULT_MINUTES = MINUTES_PER_DAY;

export function sslDaysToMinutes(days: number): number {
    const n = Number.isFinite(days) ? Math.round(days) : SSL_INTERVAL_MIN_DAYS;
    const clamped = Math.max(SSL_INTERVAL_MIN_DAYS, Math.min(SSL_INTERVAL_MAX_DAYS, n || SSL_INTERVAL_MIN_DAYS));
    return clamped * MINUTES_PER_DAY;
}

export function sslMinutesToDays(minutes: number): number {
    const m = Number.isFinite(minutes) && minutes > 0 ? minutes : SSL_INTERVAL_DEFAULT_MINUTES;
    const days = Math.round(m / MINUTES_PER_DAY);
    return Math.max(SSL_INTERVAL_MIN_DAYS, Math.min(SSL_INTERVAL_MAX_DAYS, days || SSL_INTERVAL_MIN_DAYS));
}

export function formatMonitorInterval(type: string | undefined, intervalMinutes: number | undefined): string {
    const minutes = typeof intervalMinutes === 'number' && Number.isFinite(intervalMinutes) ? intervalMinutes : 0;
    if (type === 'ssl') {
        const days = sslMinutesToDays(minutes);
        return `${days}d`;
    }
    return `${minutes}m`;
}

export function clampMonitorIntervalMinutes(
    type: string,
    minutes: number
): { value: number; error: string | null } {
    if (type === 'ssl') {
        const days = sslMinutesToDays(minutes);
        return { value: sslDaysToMinutes(days), error: null };
    }
    const m = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 5;
    if (m < 1 || m > 1440) {
        return { value: 0, error: 'Interval must be between 1 and 1440 minutes' };
    }
    return { value: m, error: null };
}

const TIMING_BY_TYPE: Record<MonitorType, MonitorSuggestTimingDefaults> = {
    url: { timeout: 5, warning_threshold: 2, interval: 5 },
    headers: { timeout: 5, warning_threshold: 2, interval: 5 },
    keyword: { timeout: 8, warning_threshold: 2, interval: 5 },
    json: { timeout: 8, warning_threshold: 2, interval: 5 },
    port: { timeout: 5, warning_threshold: 2, interval: 10 },
    ping: { timeout: 3, warning_threshold: 3, interval: 5 },
    ssl: { timeout: 10, warning_threshold: 1, interval: 1440 },
    dns: { timeout: 5, warning_threshold: 2, interval: 15 },
};

export function getMonitorSuggestTimingDefaults(type: MonitorType): MonitorSuggestTimingDefaults {
    return TIMING_BY_TYPE[type] ?? { timeout: 5, warning_threshold: 1, interval: 5 };
}

export function enrichMonitorConfigWithTiming(
    type: MonitorType,
    config: Partial<{ timeout?: number | null; warning_threshold?: number; interval?: number }> = {}
): { timeout?: number | null; warning_threshold: number; interval: number } {
    const defaults = getMonitorSuggestTimingDefaults(type);
    return {
        interval: config.interval ?? defaults.interval,
        timeout: config.timeout !== undefined ? config.timeout : defaults.timeout,
        warning_threshold: config.warning_threshold ?? defaults.warning_threshold,
    };
}
