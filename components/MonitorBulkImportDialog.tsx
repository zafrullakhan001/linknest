import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    Monitor,
    MonitorBulkDraft,
    MonitorSuggestion,
    MonitorType,
    monitoringService,
} from '../services/monitoringService';
import { MONITOR_TYPE_LABELS } from '../utils/monitorSuggestHeuristics';
import { enrichMonitorConfigWithTiming, getMonitorSuggestTimingDefaults } from '../utils/monitorSuggestTiming';
import { countBulkMonitorLines } from '../utils/monitorBulkImport';
import { MonitorTogglePill } from './MonitorTogglePill';

interface MonitorBulkImportDialogProps {
    defaultTab?: string;
    onClose: () => void;
    onCreated: () => void;
}

const MONITOR_TYPES: MonitorType[] = ['url', 'keyword', 'port', 'ping', 'dns', 'json'];

const MONITOR_TYPE_EMOJI: Record<MonitorType, string> = {
    url: '🌐',
    keyword: '🔍',
    port: '🔌',
    ping: '📡',
    ssl: '🔒',
    dns: '🌍',
    json: '📋',
};

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

function draftKey(draft: MonitorBulkDraft, index: number): string {
    return `${index}:${draft.input}`;
}

function applySuggestionToMonitor(
    monitor: Partial<Monitor>,
    suggestion: MonitorSuggestion,
    defaultTab: string
): Partial<Monitor> {
    const config = suggestion.config || {};
    const timing = enrichMonitorConfigWithTiming(suggestion.type, config);
    return {
        ...monitor,
        name: suggestion.suggested_name || monitor.name,
        type: suggestion.type,
        target: config.target || monitor.target,
        port: config.port ?? undefined,
        keyword: config.keyword ?? undefined,
        interval: timing.interval,
        timeout: timing.timeout ?? undefined,
        warning_threshold: timing.warning_threshold,
        group_name: suggestion.suggested_group || monitor.group_name,
        tab_name: monitor.tab_name || defaultTab,
    };
}

export const MonitorBulkImportDialog: React.FC<MonitorBulkImportDialogProps> = ({
    defaultTab = 'General',
    onClose,
    onCreated,
}) => {
    const [step, setStep] = useState<'paste' | 'review'>('paste');
    const [text, setText] = useState('');
    const [tabName, setTabName] = useState(defaultTab);
    const [fastMode, setFastMode] = useState(false);
    const [drafts, setDrafts] = useState<MonitorBulkDraft[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
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
        'w-full rounded-lg border border-gray-200 bg-white/90 px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors dark:border-[#444] dark:bg-[#252525] dark:text-white';

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

    const handleAnalyze = async () => {
        if (lineCount === 0) {
            setError('Paste at least one URL, IP address, or host:port.');
            return;
        }
        if (lineCount > 100) {
            setError('Maximum 100 targets per batch.');
            return;
        }
        setError(null);
        setAnalyzing(true);
        try {
            const result = await monitoringService.suggestMonitorsBulk({
                text,
                tab_name: tabName.trim() || 'General',
                fast: fastMode,
                exclude_ssl: true,
            });
            setDrafts(result.drafts);
            setStep('review');
        } catch (err: any) {
            setError(err.message || 'Analysis failed');
        } finally {
            setAnalyzing(false);
        }
    };

    const updateDraft = (index: number, updater: (draft: MonitorBulkDraft) => MonitorBulkDraft) => {
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

    const applyAlternative = (index: number, suggestion: MonitorSuggestion) => {
        updateDraft(index, (draft) => {
            if (!draft.monitor) return draft;
            return {
                ...draft,
                confidence: suggestion.confidence,
                reason: suggestion.reason,
                monitor: applySuggestionToMonitor(draft.monitor, suggestion, tabName.trim() || 'General'),
            };
        });
    };

    const handleCreate = async () => {
        if (selectedDrafts.length === 0) {
            setError('Select at least one draft monitor to create.');
            return;
        }
        setError(null);
        setCreating(true);
        try {
            const payloads = selectedDrafts.map((d) => d.monitor!).map((m) => ({
                ...m,
                tab_name: m.tab_name || tabName.trim() || 'General',
            }));
            const result = await monitoringService.bulkCreateMonitors(payloads);
            if (result.errors?.length) {
                setError(
                    `Created ${result.count} monitor(s). ${result.errors.length} failed — edit and retry those rows.`
                );
            }
            if (result.count > 0) {
                onCreated();
                if (!result.errors?.length) {
                    onClose();
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to create monitors');
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
                className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-emerald-100 dark:border-[#333] overflow-hidden flex flex-col relative"
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
                {/* Draggable header */}
                <div
                    data-drag-handle
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    className={`px-6 py-4 border-b border-emerald-200/80 dark:border-[#333] flex items-center justify-between bg-gradient-to-r from-emerald-100/90 via-teal-100/70 to-cyan-100/60 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 select-none [&_*:not(button):not(svg):not(path)]:cursor-[inherit]`}
                    onMouseDown={handleDragStart}
                >
                    <div className="min-w-0 flex-1 pr-4">
                        <h2 className="text-lg font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-2">
                            <span aria-hidden="true">✨</span>
                            Bulk Add Monitors
                        </h2>
                        <p className="text-sm text-emerald-900/75 dark:text-emerald-200/70 mt-0.5">
                            Paste URLs and IPs — we pick the best uptime check for each. SSL expiry has its own bulk loader.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="text-emerald-900/70 dark:text-emerald-200/70 text-xs flex items-center gap-1.5 hidden sm:flex rounded-lg bg-white/50 dark:bg-black/20 px-2 py-1 border border-emerald-200/60 dark:border-emerald-800/40">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                            Drag · Resize corner
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-emerald-200/60 dark:hover:bg-[#333] text-emerald-900 dark:text-emerald-200 transition-colors cursor-pointer"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Step pills */}
                <div className="px-6 py-2.5 border-b border-gray-100 dark:border-[#333] bg-gradient-to-r from-slate-50 to-white dark:from-[#252525] dark:to-[#1e1e1e]">
                    <div className="inline-flex rounded-xl border border-gray-200 dark:border-[#444] bg-white/80 dark:bg-[#252525] p-1 gap-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setStep('paste')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                step === 'paste'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            <span aria-hidden="true">📋 </span>Paste targets
                        </button>
                        <button
                            type="button"
                            onClick={() => drafts.length > 0 && setStep('review')}
                            disabled={drafts.length === 0}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${
                                step === 'review'
                                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
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
                            <section className="rounded-xl border border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 space-y-3 shadow-sm">
                                <div className="flex items-start gap-2.5 pb-2 border-b border-emerald-100/80 dark:border-emerald-900/30">
                                    <span className="text-xl" aria-hidden="true">🎯</span>
                                    <div>
                                        <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                                            Targets
                                        </h3>
                                        <p className="text-xs text-emerald-800/70 dark:text-emerald-200/60">
                                            One per line, or comma/semicolon separated
                                        </p>
                                    </div>
                                </div>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    rows={10}
                                    placeholder={`https://app.example.com\nhttps://api.example.com/health\n192.168.1.10\nserver.example.com:443\nmysql://db.internal`}
                                    className={`${inputClass} font-mono min-h-[180px] resize-y border-emerald-200 focus:border-emerald-400 focus:ring-emerald-100`}
                                />
                                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70">
                                    <span aria-hidden="true">📊 </span>
                                    {lineCount} unique target{lineCount === 1 ? '' : 's'} detected (max 100)
                                </p>
                            </section>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <section className="rounded-xl border border-violet-100 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/20 p-4 shadow-sm">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-100 mb-2">
                                        <span aria-hidden="true">📁</span>
                                        Default tab name
                                    </label>
                                    <input
                                        type="text"
                                        value={tabName}
                                        onChange={(e) => setTabName(e.target.value)}
                                        className={inputClass}
                                        placeholder="General"
                                    />
                                </section>

                                <section
                                    className={`rounded-xl border p-4 shadow-sm transition-colors ${
                                        fastMode
                                            ? 'border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/30'
                                            : 'border-gray-200 bg-white/80 dark:border-[#444] dark:bg-[#252525]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex items-start gap-2">
                                            <span className="text-xl leading-none" aria-hidden="true">⚡</span>
                                            <div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    Fast mode
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                                    {fastMode
                                                        ? 'Heuristics only — instant drafts, no live probes'
                                                        : 'Live probes for smarter type recommendations'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span
                                                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                                    fastMode
                                                        ? 'bg-amber-200 text-amber-900'
                                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                                                }`}
                                            >
                                                {fastMode ? 'On' : 'Off'}
                                            </span>
                                            <MonitorTogglePill
                                                enabled={fastMode}
                                                onToggle={() => setFastMode((v) => !v)}
                                                onClassName="bg-amber-500"
                                                labelOn="Enable fast mode"
                                                labelOff="Disable fast mode"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20 px-4 py-3">
                                <div className="text-sm text-sky-900 dark:text-sky-100">
                                    <span aria-hidden="true">📌 </span>
                                    <strong>{selectedDrafts.length}</strong> of {drafts.length} selected · Tab:{' '}
                                    <strong>{tabName.trim() || 'General'}</strong>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStep('paste')}
                                    className="text-sm font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300"
                                >
                                    ← Edit pasted list
                                </button>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-[#333] shadow-sm">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gradient-to-r from-sky-50 to-cyan-50/80 dark:from-[#252525] dark:to-[#2a2a2a] text-left text-xs uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                        <tr>
                                            <th className="px-3 py-2.5 w-10">✓</th>
                                            <th className="px-3 py-2.5">🏷️ Name</th>
                                            <th className="px-3 py-2.5">Type</th>
                                            <th className="px-3 py-2.5">🎯 Target</th>
                                            <th className="px-3 py-2.5 w-20">Port</th>
                                            <th className="px-3 py-2.5">📁 Group</th>
                                            <th className="px-3 py-2.5 w-16" title="Check timeout in seconds">⏱️</th>
                                            <th className="px-3 py-2.5 w-16" title="Consecutive failures before DOWN">⚠️</th>
                                            <th className="px-3 py-2.5 w-24">Match</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-sky-50 dark:divide-[#333] bg-white/80 dark:bg-[#1e1e1e]">
                                        {drafts.map((draft, index) => {
                                            const m = draft.monitor;
                                            const disabled = !m;
                                            return (
                                                <tr
                                                    key={draftKey(draft, index)}
                                                    className={disabled ? 'bg-red-50/60 dark:bg-red-900/10' : 'hover:bg-sky-50/40 dark:hover:bg-sky-950/10'}
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
                                                            className="rounded border-sky-300 text-emerald-600 focus:ring-emerald-200"
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
                                                                className="w-full min-w-[140px] rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525] focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                                                            />
                                                        ) : (
                                                            <span className="text-red-600 text-xs">❌ {draft.error}</span>
                                                        )}
                                                        {draft.reason && (
                                                            <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">
                                                                💡 {draft.reason}
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <select
                                                                value={m.type}
                                                                onChange={(e) => {
                                                                    const newType = e.target.value as MonitorType;
                                                                    const alt = draft.alternatives.find(
                                                                        (a) => a.type === newType
                                                                    );
                                                                    if (alt) {
                                                                        applyAlternative(index, alt);
                                                                    } else {
                                                                        const timing = getMonitorSuggestTimingDefaults(newType);
                                                                        updateDraft(index, (d) => {
                                                                            if (!d.monitor) return d;
                                                                            return {
                                                                                ...d,
                                                                                monitor: {
                                                                                    ...d.monitor,
                                                                                    type: newType,
                                                                                    interval: timing.interval,
                                                                                    timeout: timing.timeout ?? undefined,
                                                                                    warning_threshold: timing.warning_threshold,
                                                                                },
                                                                            };
                                                                        });
                                                                    }
                                                                }}
                                                                className="w-full rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525] focus:border-sky-400"
                                                            >
                                                                {MONITOR_TYPES.map((t) => (
                                                                    <option key={t} value={t}>
                                                                        {MONITOR_TYPE_EMOJI[t]} {MONITOR_TYPE_LABELS[t]}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            '—'
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
                                                                className="w-full min-w-[160px] rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525] font-mono text-xs focus:border-sky-400"
                                                            />
                                                        ) : (
                                                            <span className="font-mono text-xs text-gray-500">
                                                                {draft.input}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m && (m.type === 'port' || m.port) ? (
                                                            <input
                                                                type="number"
                                                                value={m.port ?? ''}
                                                                onChange={(e) =>
                                                                    updateMonitorField(
                                                                        index,
                                                                        'port',
                                                                        e.target.value ? parseInt(e.target.value, 10) : undefined
                                                                    )
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
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={60}
                                                                value={m.timeout ?? ''}
                                                                onChange={(e) =>
                                                                    updateMonitorField(
                                                                        index,
                                                                        'timeout',
                                                                        e.target.value ? parseInt(e.target.value, 10) : null
                                                                    )
                                                                }
                                                                className="w-full rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525]"
                                                                title="Timeout (seconds)"
                                                            />
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {m ? (
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={20}
                                                                value={m.warning_threshold ?? 1}
                                                                onChange={(e) =>
                                                                    updateMonitorField(
                                                                        index,
                                                                        'warning_threshold',
                                                                        e.target.value ? parseInt(e.target.value, 10) : 1
                                                                    )
                                                                }
                                                                className="w-full rounded-lg border border-gray-200 dark:border-[#444] px-2 py-1 bg-white dark:bg-[#252525]"
                                                                title="Warning threshold (failures)"
                                                            />
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 align-top">
                                                        {draft.confidence != null ? (
                                                            <span
                                                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    draft.confidence >= 80
                                                                        ? 'bg-emerald-100 text-emerald-700'
                                                                        : draft.confidence >= 50
                                                                          ? 'bg-amber-100 text-amber-700'
                                                                          : 'bg-orange-100 text-orange-700'
                                                                }`}
                                                            >
                                                                {draft.confidence}%
                                                            </span>
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

                <div className="px-6 py-4 border-t border-emerald-100 dark:border-[#333] bg-gradient-to-r from-slate-50 via-emerald-50/40 to-teal-50/30 dark:from-[#252525] dark:via-emerald-950/20 dark:to-teal-950/10 flex justify-end gap-3 shrink-0">
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
                            onClick={handleAnalyze}
                            disabled={analyzing || lineCount === 0}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
                        >
                            {analyzing ? '🔮 Analyzing…' : '✨ Analyze & draft monitors'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={creating || selectedDrafts.length === 0}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
                        >
                            {creating
                                ? '⏳ Creating…'
                                : `🚀 Create ${selectedDrafts.length} monitor${selectedDrafts.length === 1 ? '' : 's'}`}
                        </button>
                    )}
                </div>

                {/* Resize handles */}
                <div
                    onMouseDown={(e) => handleResizeStart(e, 'se')}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 rounded-br-2xl hover:bg-emerald-200/40 dark:hover:bg-emerald-800/30"
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
