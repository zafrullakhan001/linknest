import React, { useMemo, useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaExclamationTriangle } from 'react-icons/fa';
import {
    addMonths,
    buildMonthCells,
    formatDayKey,
    formatOutageDuration,
    monthUptimePercent,
    startOfMonth,
    summarizeLogsByDay,
    UptimeCalendarLog,
    UptimeDayLevel,
} from '../utils/monitorUptimeCalendar';

type MonitorUptimeCalendarProps = {
    logs: UptimeCalendarLog[];
    intervalMinutes?: number;
    monthsToShow?: number;
    onSelectDay?: (dayKey: string) => void;
};

const LEVEL_TILE: Record<UptimeDayLevel, string> = {
    operational: 'bg-emerald-500 hover:bg-emerald-400',
    partial: 'bg-amber-400 hover:bg-amber-300',
    major: 'bg-red-500 hover:bg-red-400',
    none: 'bg-slate-200 dark:bg-slate-700/70',
    future: 'bg-slate-100 dark:bg-slate-800/80',
};

const LEVEL_LABEL: Record<UptimeDayLevel, string> = {
    operational: 'Operational',
    partial: 'Partial outage',
    major: 'Major outage',
    none: 'No data',
    future: 'No data',
};

const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const DAY_FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const RANGE_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export const MonitorUptimeCalendar: React.FC<MonitorUptimeCalendarProps> = ({
    logs,
    intervalMinutes = 5,
    monthsToShow = 3,
    onSelectDay,
}) => {
    const [anchor, setAnchor] = useState(() => startOfMonth(new Date().getFullYear(), new Date().getMonth()));
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);

    const summaries = useMemo(
        () => summarizeLogsByDay(logs, intervalMinutes),
        [logs, intervalMinutes]
    );

    const months = useMemo(() => {
        const count = Math.max(1, monthsToShow);
        const start = addMonths(anchor, -(count - 1));
        return Array.from({ length: count }, (_, i) => addMonths(start, i));
    }, [anchor, monthsToShow]);

    const rangeLabel = `${RANGE_FMT.format(months[0])} to ${RANGE_FMT.format(months[months.length - 1])}`;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-end gap-3">
                <button
                    type="button"
                    onClick={() => setAnchor((prev) => addMonths(prev, -1))}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-[#252525] text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#333] transition-colors"
                    title="Previous month"
                    aria-label="Previous month"
                >
                    <FaChevronLeft size={12} />
                </button>
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 min-w-[220px] text-center">
                    {rangeLabel}
                </span>
                <button
                    type="button"
                    onClick={() => setAnchor((prev) => addMonths(prev, 1))}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-[#252525] text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#333] transition-colors"
                    title="Next month"
                    aria-label="Next month"
                >
                    <FaChevronRight size={12} />
                </button>
            </div>

            <div className={`grid grid-cols-1 ${monthsToShow >= 3 ? 'lg:grid-cols-3' : monthsToShow === 2 ? 'md:grid-cols-2' : ''} gap-6`}>
                {months.map((monthDate) => {
                    const year = monthDate.getFullYear();
                    const monthIndex = monthDate.getMonth();
                    const cells = buildMonthCells(year, monthIndex, summaries);
                    const uptime = monthUptimePercent(year, monthIndex, summaries);
                    return (
                        <div
                            key={`${year}-${monthIndex}`}
                            className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-slate-100 dark:border-[#333] p-4"
                        >
                            <div className="flex items-baseline justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                    {MONTH_FMT.format(monthDate)}
                                </h3>
                                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                    {uptime == null ? '—' : `${uptime >= 99.95 ? '100' : uptime.toFixed(2)}%`}
                                </span>
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {cells.map((cell) => {
                                    if (!cell.inMonth || cell.day == null) {
                                        return <div key={cell.key} className="aspect-square" />;
                                    }
                                    const isHovered = hoveredKey === cell.key;
                                    const summary = cell.summary;
                                    const canOpen = cell.level === 'operational' || cell.level === 'partial' || cell.level === 'major';
                                    return (
                                        <div
                                            key={cell.key}
                                            className="relative aspect-square"
                                            onMouseEnter={() => setHoveredKey(cell.key)}
                                            onMouseLeave={() => setHoveredKey((k) => (k === cell.key ? null : k))}
                                        >
                                            <button
                                                type="button"
                                                disabled={!canOpen}
                                                onClick={() => {
                                                    if (!canOpen) return;
                                                    onSelectDay?.(cell.key);
                                                }}
                                                className={`w-full h-full rounded-md transition-all ${LEVEL_TILE[cell.level]} ${canOpen ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-white/70 dark:hover:ring-white/40' : 'cursor-default opacity-70'}`}
                                                title={
                                                    canOpen
                                                        ? `${DAY_FMT.format(new Date(year, monthIndex, cell.day))} — ${LEVEL_LABEL[cell.level]}. Click to view this day.`
                                                        : `${DAY_FMT.format(new Date(year, monthIndex, cell.day))} — ${LEVEL_LABEL[cell.level]}`
                                                }
                                                aria-label={`${DAY_FMT.format(new Date(year, monthIndex, cell.day))}: ${LEVEL_LABEL[cell.level]}${canOpen ? '. Open this day' : ''}`}
                                            />
                                            {isHovered && (
                                                <div className="absolute z-30 top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-56 pointer-events-none">
                                                    <div className="bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#444] rounded-xl shadow-xl p-3 text-left">
                                                        <p className="text-xs font-bold text-slate-800 dark:text-white mb-1.5">
                                                            {DAY_FMT.format(new Date(year, monthIndex, cell.day))}
                                                        </p>
                                                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                                            {(cell.level === 'partial' || cell.level === 'major') && (
                                                                <FaExclamationTriangle
                                                                    size={10}
                                                                    className={cell.level === 'major' ? 'text-red-500' : 'text-amber-500'}
                                                                />
                                                            )}
                                                            {LEVEL_LABEL[cell.level]}
                                                            {summary && summary.outageSeconds > 0
                                                                ? ` ${formatOutageDuration(summary.outageSeconds)}`
                                                                : ''}
                                                        </p>
                                                        {summary && summary.events.length > 0 && (
                                                            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#444]">
                                                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                                                    Related events
                                                                </p>
                                                                <ul className="space-y-0.5">
                                                                    {summary.events.map((event) => (
                                                                        <li
                                                                            key={event}
                                                                            className="text-[11px] text-slate-600 dark:text-slate-300 truncate"
                                                                            title={event}
                                                                        >
                                                                            {event}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {summary && summary.checks > 0 && (
                                                            <p className="mt-2 text-[10px] text-slate-400">
                                                                {summary.checks} check{summary.checks === 1 ? '' : 's'}
                                                                {summary.up ? ` · ${summary.up} up` : ''}
                                                                {summary.down ? ` · ${summary.down} down` : ''}
                                                            </p>
                                                        )}
                                                        {canOpen && (
                                                            <p className="mt-2 text-[10px] font-semibold text-blue-500">
                                                                Click to open Chart / List for this day
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Operational
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-400" /> Partial outage
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-red-500" /> Major outage
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-slate-200 dark:bg-slate-700" /> No data
                </span>
            </div>
        </div>
    );
};

type MonitorUptimeDayBannerProps = {
    dayKey: string;
    checkCount: number;
    onBackToCalendar: () => void;
    onShowFullRange: () => void;
};

export const MonitorUptimeDayBanner: React.FC<MonitorUptimeDayBannerProps> = ({
    dayKey,
    checkCount,
    onBackToCalendar,
    onShowFullRange,
}) => (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {formatDayKey(dayKey)}
            <span className="ml-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                {checkCount} check{checkCount === 1 ? '' : 's'}
            </span>
        </p>
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onBackToCalendar}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm hover:bg-slate-50 dark:hover:bg-[#3a3a3a] transition-colors"
            >
                Back to calendar
            </button>
            <button
                type="button"
                onClick={onShowFullRange}
                className="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
                Show full range
            </button>
        </div>
    </div>
);
