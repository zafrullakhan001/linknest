import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Monitor, monitoringService } from '../services/monitoringService';
import { countBulkMonitorLines } from '../utils/monitorBulkImport';
import {
    SSL_CERTS_TAB,
    SslBulkDraft,
    buildSslBulkDrafts,
} from '../utils/monitorSsl';
import { sslDaysToMinutes } from '../utils/monitorSuggestTiming';

interface MonitorSslBulkImportDialogProps {
    onClose: () => void;
    onCreated: () => void;
}

const DEFAULT_SIZE = { width: 1024, height: 720 };
const MIN_SIZE = { width: 640, height: 480 };

function getCenteredPosition(width: number, height: number) {
    if (typeof window === 'undefined') {
        return { x: 16, y: 16 };
    }
    return {
        x: Math.max(16, (window.innerWidth - width) / 2),
        y: Math.max(16, (window.innerHeight - height) / 2),
    };
}

function draftKey(draft: SslBulkDraft, index: number): string {
    return `${index}:${draft.input}`;
}

export const MonitorSslBulkImportDialog: React.FC<MonitorSslBulkImportDialogProps> = ({
    onClose,
    onCreated,
}) => {
    const [step, setStep] = useState<'paste' | 'review'>('paste');
    const [text, setText] = useState('');
    const [warnDays, setWarnDays] = useState('30');
    const [intervalDays, setIntervalDays] = useState('1');
    const [groupName, setGroupName] = useState('');
    const [drafts, setDrafts] = useState<SslBulkDraft[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [position, setPosition] = useState(() => getCenteredPosition(DEFAULT_SIZE.width, DEFAULT_SIZE.height));
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);
    const [isPositionReady, setIsPositionReady] = useState(false);

    const [dialogSize, setDialogSize] = useState(DEFAULT_SIZE);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, handle: '' });

    const lineCount = useMemo(() => countBulkMonitorLines(text), [text]);
    const selectedDrafts = useMemo(
        () => drafts.filter((d) => d.selected && d.monitor),
        [drafts]
    );

    const inputClass =
        'w-full rounded-lg border border-gray-200 bg-white/90 px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-colors dark:border-[#444] dark:bg-[#252525] dark:text-white';

    useLayoutEffect(() => {
        if (!modalRef.current) return;
        const rect = modalRef.current.getBoundingClientRect();
        setPosition(getCenteredPosition(rect.width, rect.height));
        setIsPositionReady(true);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const handleDragStart = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (!modalRef.current || !(e.target as HTMLElement).closest('[data-drag-handle]')) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = modalRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        setIsDragging(true);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y,
            });
        };
        const handleMouseUp = () => setIsDragging(false);

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, handle: string) => {
        if (!modalRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = modalRef.current.getBoundingClientRect();
        setIsResizing(true);
        setResizeStart({
            x: e.clientX,
            y: e.clientY,
            width: rect.width,
            height: rect.height,
            handle,
        });
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - resizeStart.x;
            const deltaY = e.clientY - resizeStart.y;
            const maxWidth = window.innerWidth - position.x - 16;
            const maxHeight = window.innerHeight - position.y - 16;

            let newWidth = resizeStart.width;
            let newHeight = resizeStart.height;

            if (resizeStart.handle.includes('e')) {
                newWidth = resizeStart.width + deltaX;
            }
            if (resizeStart.handle.includes('s')) {
                newHeight = resizeStart.height + deltaY;
            }

            setDialogSize({
                width: Math.max(MIN_SIZE.width, Math.min(newWidth, maxWidth)),
                height: Math.max(MIN_SIZE.height, Math.min(newHeight, maxHeight)),
            });
        };

        const handleMouseUp = () => setIsResizing(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none';

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isResizing, resizeStart, position.x, position.y]);

    const handlePreview = () => {
        if (lineCount === 0) {
            setError('Paste at least one hostname or HTTPS URL.');
            return;
        }
        if (lineCount > 100) {
            setError('Maximum 100 hosts per batch.');
            return;
        }
        setError(null);
        const next = buildSslBulkDrafts(text, {
            warnDays: parseInt(warnDays, 10) || 30,
            intervalDays: parseInt(intervalDays, 10) || 1,
            groupName,
        });
        setDrafts(next);
        setStep('review');
    };

    const updateDraft = (index: number, updater: (draft: SslBulkDraft) => SslBulkDraft) => {
        setDrafts((prev) => prev.map((d, i) => (i === index ? updater(d) : d)));
    };

    const updateMonitorField = (
        index: number,
        field: keyof Monitor,
        value: string | number | null | undefined
    ) => {
        updateDraft(index, (draft) => {
            if (!draft.monitor) return draft;
            return {
                ...draft,
                monitor: {
                    ...draft.monitor,
                    [field]: value === '' ? undefined : value,
                },
            };
        });
    };

    const handleCreate = async () => {
        if (selectedDrafts.length === 0) {
            setError('Select at least one SSL monitor to create.');
            return;
        }
        setError(null);
        setCreating(true);
        try {
            const days = Math.max(1, Math.min(30, parseInt(intervalDays, 10) || 1));
            const payloads = selectedDrafts.map((d) => ({
                ...d.monitor!,
                type: 'ssl' as const,
                tab_name: SSL_CERTS_TAB,
                interval: sslDaysToMinutes(days),
                warning_threshold: 1,
            }));
            const result = await monitoringService.bulkCreateMonitors(payloads);
            if (result.errors?.length) {
                setError(
                    `Created ${result.count} SSL monitor(s). ${result.errors.length} failed — edit and retry those rows.`
                );
            }
            if (result.count > 0) {
                onCreated();
                if (!result.errors?.length) {
                    onClose();
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to create SSL monitors');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120]" style={{ backgroundColor: 'transparent' }}>
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={modalRef}
                className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-amber-100 dark:border-[#333] overflow-hidden flex flex-col relative"
                style={{
                    position: 'absolute',
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    width: `${dialogSize.width}px`,
                    height: `${dialogSize.height}px`,
                    maxWidth: '95vw',
                    maxHeight: '95vh',
                    minWidth: `${MIN_SIZE.width}px`,
                    minHeight: `${MIN_SIZE.height}px`,
                    visibility: isPositionReady ? 'visible' : 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    data-drag-handle
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    className="px-6 py-4 border-b border-amber-200/80 dark:border-[#333] flex items-center justify-between bg-gradient-to-r from-amber-100/90 via-yellow-100/70 to-orange-100/60 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/20 select-none"
                    onMouseDown={handleDragStart}
                >
                    <div className="min-w-0 flex-1 pr-4">
                        <h2 className="text-lg font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                            <span aria-hidden="true">🔒</span>
                            Bulk Add SSL Certificate Checks
                        </h2>
                        <p className="text-sm text-amber-900/75 dark:text-amber-200/70 mt-0.5">
                            All checks go on the <strong>{SSL_CERTS_TAB}</strong> tab — separate from uptime monitors.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="text-amber-900/70 dark:text-amber-200/70 text-xs flex items-center gap-1.5 hidden sm:flex rounded-lg bg-white/50 dark:bg-black/20 px-2 py-1 border border-amber-200/60 dark:border-amber-800/40">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                            Drag · Resize corner
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-amber-200/60 dark:hover:bg-[#333] text-amber-900 dark:text-amber-200 transition-colors cursor-pointer"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="px-6 py-2.5 border-b border-gray-100 dark:border-[#333] bg-gradient-to-r from-slate-50 to-white dark:from-[#252525] dark:to-[#1e1e1e]">
                    <div className="inline-flex rounded-xl border border-gray-200 dark:border-[#444] bg-white/80 dark:bg-[#252525] p-1 gap-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setStep('paste')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                step === 'paste'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            <span aria-hidden="true">📋 </span>Paste hosts
                        </button>
                        <button
                            type="button"
                            onClick={() => drafts.length > 0 && setStep('review')}
                            disabled={drafts.length === 0}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${
                                step === 'review'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            <span aria-hidden="true">✅ </span>Review & create
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50/50 to-white dark:from-[#1a1a1a] dark:to-[#1e1e1e]">
                    {step === 'paste' ? (
                        <>
                            <section className="rounded-xl border border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 space-y-3 shadow-sm">
                                <div className="flex items-start gap-2.5 pb-2 border-b border-amber-100/80 dark:border-amber-900/30">
                                    <span className="text-xl" aria-hidden="true">🔒</span>
                                    <div>
                                        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                                            Hosts / HTTPS URLs
                                        </h3>
                                        <p className="text-xs text-amber-800/70 dark:text-amber-200/60">
                                            One per line, or comma/semicolon separated. Each becomes an SSL expiry check.
                                        </p>
                                    </div>
                                </div>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    rows={10}
                                    placeholder={`example.com\nhttps://app.example.com\nmail.example.com:8443`}
                                    className={`${inputClass} font-mono min-h-[180px] resize-y border-amber-200 focus:border-amber-400 focus:ring-amber-100`}
                                />
                                <p className="text-xs text-amber-700/80 dark:text-amber-300/70">
                                    <span aria-hidden="true">📊 </span>
                                    {lineCount} unique host{lineCount === 1 ? '' : 's'} detected (max 100)
                                </p>
                            </section>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <section className="rounded-xl border border-amber-100 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 shadow-sm">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                                        Warn within (days)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={warnDays}
                                        onChange={(e) => setWarnDays(e.target.value)}
                                        className={inputClass}
                                    />
                                    <p className="text-[11px] text-amber-800/70 dark:text-amber-200/60 mt-1.5">
                                        Marked down when the cert expires within this many days.
                                    </p>
                                </section>
                                <section className="rounded-xl border border-amber-100 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 shadow-sm">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                                        Check interval (days)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={intervalDays}
                                        onChange={(e) => setIntervalDays(e.target.value)}
                                        className={inputClass}
                                    />
                                    <p className="text-[11px] text-amber-800/70 dark:text-amber-200/60 mt-1.5">
                                        Daily is enough for expiry monitoring.
                                    </p>
                                </section>
                                <section className="rounded-xl border border-violet-100 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/20 p-4 shadow-sm">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-100 mb-2">
                                        <span aria-hidden="true">🗂️</span>
                                        Group name
                                    </label>
                                    <input
                                        type="text"
                                        value={groupName}
                                        onChange={(e) => setGroupName(e.target.value)}
                                        className={inputClass}
                                        placeholder="Production"
                                    />
                                    <p className="text-[11px] text-violet-800/70 dark:text-violet-200/60 mt-1.5">
                                        Optional grouping inside the SSL tab.
                                    </p>
                                </section>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3">
                                <div className="text-sm text-amber-900 dark:text-amber-100">
                                    <span aria-hidden="true">📌 </span>
                                    <strong>{selectedDrafts.length}</strong> of {drafts.length} selected · Tab:{' '}
                                    <strong>{SSL_CERTS_TAB}</strong>
                                    {' · '}
                                    Interval: <strong>{intervalDays || '1'}d</strong>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStep('paste')}
                                    className="text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300"
                                >
                                    ← Edit pasted list
                                </button>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-amber-100 dark:border-[#333] shadow-sm">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gradient-to-r from-amber-50 to-yellow-50/80 dark:from-[#252525] dark:to-[#2a2a2a] text-left text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                        <tr>
                                            <th className="px-3 py-2.5 w-10">✓</th>
                                            <th className="px-3 py-2.5">🏷️ Name</th>
                                            <th className="px-3 py-2.5">🎯 Host</th>
                                            <th className="px-3 py-2.5 w-28">Warn (days)</th>
                                            <th className="px-3 py-2.5">📁 Group</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-50 dark:divide-[#333] bg-white/80 dark:bg-[#1e1e1e]">
                                        {drafts.map((draft, index) => {
                                            const m = draft.monitor;
                                            const disabled = !m;
                                            return (
                                                <tr
                                                    key={draftKey(draft, index)}
                                                    className={disabled ? 'bg-red-50/60 dark:bg-red-900/10' : 'hover:bg-amber-50/40 dark:hover:bg-amber-950/10'}
                                                >
                                                    <td className="px-3 py-2 align-top">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.selected && !!m}
                                                            disabled={!m}
                                                            onChange={(e) =>
                                                                updateDraft(index, (d) => ({
                                                                    ...d,
                                                                    selected: e.target.checked,
                                                                }))
                                                            }
                                                            className="rounded border-amber-300 text-amber-600 focus:ring-amber-200"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <input
                                                                type="text"
                                                                value={m.name || ''}
                                                                onChange={(e) =>
                                                                    updateMonitorField(index, 'name', e.target.value)
                                                                }
                                                                className="w-full min-w-[140px] rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525] focus:border-amber-400"
                                                            />
                                                        ) : (
                                                            <span className="text-red-600 text-xs">❌ {draft.error}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <input
                                                                type="text"
                                                                value={m.target || ''}
                                                                onChange={(e) =>
                                                                    updateMonitorField(index, 'target', e.target.value)
                                                                }
                                                                className="w-full min-w-[160px] rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525] font-mono text-xs focus:border-amber-400"
                                                            />
                                                        ) : (
                                                            <span className="font-mono text-xs text-gray-500">
                                                                {draft.input}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={365}
                                                                value={m.keyword ?? '30'}
                                                                onChange={(e) =>
                                                                    updateMonitorField(index, 'keyword', e.target.value)
                                                                }
                                                                className="w-full rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525]"
                                                            />
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <input
                                                                type="text"
                                                                value={m.group_name || ''}
                                                                onChange={(e) =>
                                                                    updateMonitorField(index, 'group_name', e.target.value)
                                                                }
                                                                className="w-full min-w-[100px] rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525]"
                                                            />
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                            <span aria-hidden="true">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-amber-100 dark:border-[#333] bg-gradient-to-r from-slate-50 via-amber-50/40 to-yellow-50/30 dark:from-[#252525] dark:via-amber-950/20 dark:to-yellow-950/10 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-[#444] text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-[#333] transition-colors"
                    >
                        Cancel
                    </button>
                    {step === 'paste' ? (
                        <button
                            type="button"
                            onClick={handlePreview}
                            disabled={lineCount === 0}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
                        >
                            🔒 Preview SSL monitors
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={creating || selectedDrafts.length === 0}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
                        >
                            {creating
                                ? '⏳ Creating…'
                                : `🚀 Create ${selectedDrafts.length} SSL check${selectedDrafts.length === 1 ? '' : 's'}`}
                        </button>
                    )}
                </div>

                <div
                    onMouseDown={(e) => handleResizeStart(e, 'se')}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 rounded-br-2xl hover:bg-amber-200/40 dark:hover:bg-amber-800/30"
                    title="Resize"
                />
                <div
                    onMouseDown={(e) => handleResizeStart(e, 's')}
                    className="absolute bottom-0 left-0 right-4 h-2 cursor-ns-resize z-10"
                />
                <div
                    onMouseDown={(e) => handleResizeStart(e, 'e')}
                    className="absolute top-0 right-0 bottom-4 w-2 cursor-ew-resize z-10"
                />
            </div>
        </div>
    );
};
