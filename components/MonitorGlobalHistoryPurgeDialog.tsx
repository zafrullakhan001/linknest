import React, { useState } from 'react';
import { FaHistory, FaTimes, FaTrash } from 'react-icons/fa';

export type UptimePurgeKeepDays = 0 | 1 | 7 | 30 | 365;

export interface UptimePurgeMaintenanceOptions {
    reindex: boolean;
    runChecks: boolean;
    vacuum: boolean;
}

export interface UptimePurgeMaintenanceResult {
    reindex?: {
        ok?: boolean;
        indexes?: string[];
        analyzed?: string[];
        elapsed_ms?: number;
    } | null;
    checks?: {
        ok?: boolean;
        quick_check?: string;
        result?: string[];
        elapsed_ms?: number;
    } | null;
    vacuum?: {
        ok?: boolean;
        message?: string;
        reclaimed?: { disk_human?: string; disk_bytes?: number } | null;
        elapsed_ms?: number;
    } | null;
}

export interface UptimePurgeAllResult {
    deleted_count: number;
    keep_days?: number;
    maintenance?: UptimePurgeMaintenanceResult;
}

const KEEP_LABELS: Record<UptimePurgeKeepDays, string> = {
    0: 'ALL history',
    1: 'last 1 day',
    7: 'last 1 week',
    30: 'last 1 month',
    365: 'last 1 year',
};

export function formatGlobalUptimePurgeMessage(
    keepDays: UptimePurgeKeepDays,
    deletedCount: number,
    maintenance?: UptimePurgeMaintenanceResult
): string {
    const n = deletedCount;
    let message: string;
    if (keepDays === 0) {
        message =
            n === 0
                ? 'No uptime checks found across any monitors. History was already empty.'
                : `Purged all uptime history for every monitor: removed ${n} check${n === 1 ? '' : 's'}.`;
    } else if (n === 0) {
        message =
            `No checks removed across monitors.\n\n` +
            `Everything already falls within the ${KEEP_LABELS[keepDays]} retention window, so there was nothing older to delete.`;
    } else {
        message = `Kept ${KEEP_LABELS[keepDays]} for all monitors and removed ${n} older check${n === 1 ? '' : 's'}.`;
    }

    if (!maintenance) {
        return message;
    }

    const parts: string[] = [];
    if (maintenance.reindex) {
        const idxCount = maintenance.reindex.indexes?.length ?? 0;
        parts.push(
            maintenance.reindex.ok === false
                ? 'Rebuild indexes: failed'
                : `Rebuild indexes: rebuilt ${idxCount} index${idxCount === 1 ? '' : 'es'} and refreshed planner stats`
        );
    }
    if (maintenance.checks) {
        parts.push(
            maintenance.checks.ok
                ? 'Database check: ok'
                : `Database check: failed${maintenance.checks.quick_check ? ` (${maintenance.checks.quick_check})` : ''}`
        );
    }
    if (maintenance.vacuum) {
        if (maintenance.vacuum.ok === false) {
            parts.push(`Vacuum / reclaim: failed — ${maintenance.vacuum.message || 'unknown error'}`);
        } else {
            const reclaimed = maintenance.vacuum.reclaimed?.disk_human;
            parts.push(
                reclaimed && reclaimed !== '0 B'
                    ? `Vacuum / reclaim: ${reclaimed} reclaimed on disk`
                    : maintenance.vacuum.message || 'Vacuum / reclaim: completed'
            );
        }
    }

    if (parts.length) {
        message += '\n\nMaintenance:\n• ' + parts.join('\n• ');
    }
    return message;
}

interface MonitorGlobalHistoryPurgeDialogProps {
    onClose: () => void;
    onPurge: (
        keepDays: UptimePurgeKeepDays,
        options: UptimePurgeMaintenanceOptions
    ) => Promise<UptimePurgeAllResult>;
}

export const MonitorGlobalHistoryPurgeDialog: React.FC<MonitorGlobalHistoryPurgeDialogProps> = ({
    onClose,
    onPurge,
}) => {
    const [keepDays, setKeepDays] = useState<UptimePurgeKeepDays>(30);
    const [reindex, setReindex] = useState(true);
    const [runChecks, setRunChecks] = useState(true);
    const [vacuum, setVacuum] = useState(true);
    const [purging, setPurging] = useState(false);
    const [error, setError] = useState('');

    const handlePurge = async () => {
        const scopeLabel =
            keepDays === 0
                ? 'Purge ALL uptime history for EVERY monitor'
                : `Keep ${KEEP_LABELS[keepDays]} and permanently delete older checks for EVERY monitor`;
        const maintenanceBits: string[] = [];
        if (reindex) maintenanceBits.push('rebuild indexes');
        if (runChecks) maintenanceBits.push('run database checks');
        if (vacuum) maintenanceBits.push('optimize / vacuum to reclaim space');
        const maintenanceNote = maintenanceBits.length
            ? `\n\nAfter purge: ${maintenanceBits.join(', ')}. Vacuum may briefly lock the database.`
            : '';
        if (
            !confirm(
                `${scopeLabel}?${maintenanceNote}\n\nMonitors themselves are not deleted — only check history. This cannot be undone.`
            )
        ) {
            return;
        }
        try {
            setPurging(true);
            setError('');
            const result = await onPurge(keepDays, { reindex, runChecks, vacuum });
            alert(formatGlobalUptimePurgeMessage(keepDays, result.deleted_count, result.maintenance));
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to purge uptime history');
        } finally {
            setPurging(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[110] bg-black/40 dark:bg-black/60 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-rose-200/70 dark:border-rose-900/40 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-slate-50/80 dark:bg-[#202020]/80">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <FaHistory size={18} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Purge Uptime History</h2>
                            <p className="text-xs text-slate-500 dark:text-gray-400">All monitors — retention filter</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={purging}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-400 disabled:opacity-50"
                        title="Close"
                    >
                        <FaTimes size={16} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Choose how much check history to keep. Older records are deleted for{' '}
                        <span className="font-semibold">every monitor</span>. Monitor tiles and settings are not affected.
                    </p>

                    <label className="block">
                        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1.5 block">
                            Retention
                        </span>
                        <select
                            value={keepDays}
                            onChange={(e) => setKeepDays(Number(e.target.value) as UptimePurgeKeepDays)}
                            disabled={purging}
                            className="w-full bg-slate-100 dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
                        >
                            <option value={1}>Keep last 1 day</option>
                            <option value={7}>Keep last 1 week</option>
                            <option value={30}>Keep last 1 month</option>
                            <option value={365}>Keep last 1 year</option>
                            <option value={0}>Purge all history</option>
                        </select>
                    </label>

                    <div className="rounded-xl border border-slate-200 dark:border-[#333] bg-slate-50/80 dark:bg-[#252525]/80 p-3 space-y-2.5">
                        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">
                            After purge (performance)
                        </span>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={reindex}
                                onChange={(e) => setReindex(e.target.checked)}
                                disabled={purging}
                                className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-200">
                                <span className="font-semibold">Rebuild indexes</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    Drop/recreate monitor history indexes and refresh query planner stats
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={runChecks}
                                onChange={(e) => setRunChecks(e.target.checked)}
                                disabled={purging}
                                className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-200">
                                <span className="font-semibold">Run database checks</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    Verify database health after the purge
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={vacuum}
                                onChange={(e) => setVacuum(e.target.checked)}
                                disabled={purging}
                                className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-200">
                                <span className="font-semibold">Optimize, vacuum & reclaim space</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    Compact the database file and free disk used by deleted history (may briefly lock writes)
                                </span>
                            </span>
                        </label>
                    </div>

                    {error && (
                        <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 dark:border-[#333] flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-[#202020]/50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={purging}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] disabled:opacity-50 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handlePurge()}
                        disabled={purging}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-all shadow-sm"
                    >
                        <FaTrash size={12} />
                        {purging ? 'Working…' : 'Purge'}
                    </button>
                </div>
            </div>
        </div>
    );
};
