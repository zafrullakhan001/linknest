import { MonitorType } from '../services/monitoringService';

export interface MonitorSuggestTimingDefaults {
    timeout: number | null;
    warning_threshold: number;
    interval: number;
}

const TIMING_BY_TYPE: Record<MonitorType, MonitorSuggestTimingDefaults> = {
    url: { timeout: 5, warning_threshold: 2, interval: 5 },
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
