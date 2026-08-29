import React from 'react';
import type { TileStyle } from '../utils/monitorTileStyles';
import {
    PHP_SERVER_MONITOR_TILE_STYLES,
    tileBackgroundStyle,
    tileFontFamily,
    tileTextColor,
} from '../utils/monitorTileStyles';

export type StatusBoardMonitor = {
    id: number;
    name: string;
    last_status: 'up' | 'down' | 'warning' | 'unknown' | null;
    last_checked_at: number | string | null;
    last_response_time?: number | null;
    history?: Array<{
        status: 'up' | 'down' | 'warning';
        checked_at: number | string;
    }>;
};

type MonitorStatusBoardProps<T extends StatusBoardMonitor> = {
    monitors: T[];
    tileStyles?: TileStyle;
    showTitle?: boolean;
    compact?: boolean;
    highlightedId?: number | null;
    onMonitorClick: (e: React.MouseEvent, monitor: T) => void;
};

const BOARD_GREEN = '#5cb85c';
const BOARD_RED = '#d9534f';

function toMs(value: number | string | null | undefined): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return null;
        return value < 1e12 ? value * 1000 : value;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && numeric > 0) {
        return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? null : parsed;
}

function formatAgo(value: number | string | null | undefined): string {
    const ms = toMs(value);
    if (ms == null) return 'unknown';
    const diff = Date.now() - ms;
    if (diff < 1000) return 'just now';
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? '' : 's'} ago`;
    if (days > 0) return unit(days, 'day');
    if (hours > 0) return unit(hours, 'hour');
    if (minutes > 0) return unit(minutes, 'minute');
    return unit(seconds, 'second');
}

function lastOnlineAt(monitor: StatusBoardMonitor): number | string | null {
    if (monitor.last_status === 'up' || monitor.last_status === 'warning') {
        return monitor.last_checked_at;
    }
    const lastUp = [...(monitor.history || [])]
        .reverse()
        .find((entry) => entry.status === 'up');
    return lastUp?.checked_at ?? null;
}

function formatLatency(ms: number | null | undefined): string | null {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
    return `${(ms / 1000).toFixed(7)}s`;
}

export function MonitorStatusBoard<T extends StatusBoardMonitor>({
    monitors,
    tileStyles = PHP_SERVER_MONITOR_TILE_STYLES,
    showTitle = true,
    compact = false,
    highlightedId = null,
    onMonitorClick,
}: MonitorStatusBoardProps<T>) {
    return (
        <div className="bg-black text-[#d0d0d0] rounded-xl px-3 py-3 sm:px-4 sm:py-4">
            {showTitle && (
                <h2 className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-[#c8c8c8] mb-3">
                    Status
                </h2>
            )}
            <div
                className={`grid gap-2 ${
                    compact
                        ? 'grid-cols-1'
                        : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                }`}
            >
                {monitors.map((monitor) => {
                    const up = monitor.last_status === 'up' || monitor.last_status === 'warning';
                    const latency = up ? formatLatency(monitor.last_response_time) : null;
                    const status = monitor.last_status;
                    const color = tileTextColor(tileStyles, status);
                    return (
                        <div
                            key={monitor.id}
                            role="button"
                            tabIndex={0}
                            data-monitor-id={monitor.id}
                            onClick={(e) => onMonitorClick(e, monitor)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onMonitorClick(e as unknown as React.MouseEvent, monitor);
                                }
                            }}
                            className={`text-left border border-white min-h-[92px] cursor-pointer transition-opacity hover:opacity-90 px-4 py-3 ${
                                highlightedId === monitor.id ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                            }`}
                            style={{
                                ...tileBackgroundStyle(tileStyles, status),
                                color,
                                fontFamily: tileFontFamily(tileStyles, status),
                                borderRadius: tileStyles.borderRadius,
                            }}
                            title={monitor.name}
                        >
                            <div className="text-lg sm:text-xl font-bold leading-tight truncate">
                                {monitor.name}
                            </div>
                            <div className="mt-2 text-[13px] sm:text-sm leading-snug font-normal">
                                <div>Last online: {formatAgo(lastOnlineAt(monitor))}</div>
                                {up && latency ? (
                                    <div>Latency: {latency}</div>
                                ) : (
                                    <div>Last check: {formatAgo(monitor.last_checked_at)}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const StatusBoardToolbarIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1.5" y="1.5" width="9.5" height="9.5" rx="1.5" fill="#5cb85c" />
        <rect x="13" y="1.5" width="9.5" height="9.5" rx="1.5" fill="#d9534f" />
        <rect x="1.5" y="13" width="9.5" height="9.5" rx="1.5" fill="#5cb85c" />
        <rect x="13" y="13" width="9.5" height="9.5" rx="1.5" fill="#5cb85c" />
    </svg>
);
