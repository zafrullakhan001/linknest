import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    FaBolt,
    FaCheck,
    FaClock,
    FaCopy,
    FaDownload,
    FaFileCsv,
    FaGlobe,
    FaHistory,
    FaImage,
    FaRedo,
    FaServer,
    FaStop,
    FaTachometerAlt,
    FaTimes,
    FaTrash,
    FaUpload,
    FaCog,
    FaNetworkWired,
} from 'react-icons/fa';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useAuth } from '../contexts/AuthContext';
import {
    SpeedTestConnectionMode,
    SpeedTestEndpoint,
    SpeedTestEndpointMode,
    SpeedTestPhase,
    SpeedTestProfile,
    SpeedTestProgress,
    SpeedTestResult,
    SpeedTestTarget,
    clearSpeedTestHistory,
    findPreviousLikeForLikeResult,
    formatBytes,
    formatMbps,
    formatMs,
    isLikeForLikeSpeedTest,
    loadSpeedTestHistory,
    normalizeSpeedTestEndpoint,
    runDualSpeedTest,
    runSpeedTest,
    saveSpeedTestResult,
    speedTestTargetLabel,
} from '../services/speedTestService';
import {
    SpeedTestCustomServerPrefs,
    loadSpeedTestPreferences,
    patchSpeedTestPreferences,
    SpeedTestPreferences,
} from '../services/speedTestPreferences';
import { notifySpeedTestAlerts, notifySpeedTestComplete } from '../services/speedTestNotifications';
import {
    copySpeedTestPng,
    copySpeedTestText,
    downloadSpeedTestPng,
    exportSpeedTestHistoryCsv,
    exportSpeedTestHistoryJson,
} from '../services/speedTestExport';
import { postSpeedTestResult } from '../services/speedTestScheduleService';
import { ensureBrowserSpeedScheduleLoop } from '../utils/speedTestBrowserSchedule';
import { BufferbloatCards, DiagnosticsPanel, NetworkDetailsPanel, UseCaseGradesPanel } from './speedtest/SpeedTestInsightPanels';
import { ComparisonPanel, LiveThroughputCharts } from './speedtest/SpeedTestCharts';
import { SpeedTestSettingsPanel } from './speedtest/SpeedTestSettingsPanel';

export interface InternetSpeedTesterProps {
    isOpen: boolean;
    onClose: () => void;
}

const PHASE_ORDER: SpeedTestPhase[] = ['preparing', 'latency', 'download', 'upload', 'complete'];

const PROFILE_LABEL: Record<SpeedTestProfile, string> = {
    quick: 'Quick',
    standard: 'Standard',
    thorough: 'Thorough',
};

const PROFILE_HINT: Record<SpeedTestProfile, string> = {
    quick: 'Shorter test — faster results, slightly less precise peak speeds.',
    standard: 'Balanced duration — good accuracy for everyday checks.',
    thorough: 'Longer test — more samples for steadier, more accurate peaks.',
};

const CONNECTION_MODE_HINT = {
    single:
        'Single: one transfer stream at a time. Closer to one browser tab or a simple download — often lower than Multi on high-speed links.',
    multi:
        'Multi: several parallel streams. Better fills your pipe and usually shows higher peak Mbps on modern broadband.',
} as const;

const QUALITY_CLASS: Record<SpeedTestResult['quality']['tone'], string> = {
    emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    lime: 'bg-lime-500/15 text-lime-800 dark:text-lime-300 border-lime-500/30',
    amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
    orange: 'bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30',
    red: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
};

const DIALOG_MIN_W = 560;
const DIALOG_MIN_H = 440;
const DIALOG_DEFAULT_W = 1040;
const DIALOG_DEFAULT_H = 760;
const DIALOG_MIN_VISIBLE = 64;

type DialogPoint = { x: number; y: number };
type DialogSize = { width: number; height: number };

function clampNum(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

/** App applies `html { zoom }`; dialog geometry must use layout coords (monitor float-panel fix). */
function getCssZoom(): number {
    const raw = getComputedStyle(document.documentElement).zoom;
    const z = raw && raw !== 'normal' ? Number.parseFloat(raw) : 1;
    return Number.isFinite(z) && z > 0 ? z : 1;
}

function getVisualViewportSize() {
    const vv = window.visualViewport;
    return {
        width: vv?.width ?? window.innerWidth,
        height: vv?.height ?? window.innerHeight,
    };
}

function getLayoutViewport() {
    const { width: vvW, height: vvH } = getVisualViewportSize();
    const zoom = getCssZoom();
    return { width: vvW / zoom, height: vvH / zoom, zoom };
}

function defaultDialogSize(): DialogSize {
    const { width: layoutW, height: layoutH } = getLayoutViewport();
    return {
        width: clampNum(Math.min(DIALOG_DEFAULT_W, layoutW - 32), DIALOG_MIN_W, Math.max(DIALOG_MIN_W, layoutW - 24)),
        height: clampNum(Math.min(DIALOG_DEFAULT_H, layoutH - 32), DIALOG_MIN_H, Math.max(DIALOG_MIN_H, layoutH - 24)),
    };
}

function centeredDialogPos(size: DialogSize): DialogPoint {
    const { width: layoutW, height: layoutH } = getLayoutViewport();
    return {
        x: Math.max(12, Math.round((layoutW - size.width) / 2)),
        y: Math.max(12, Math.round((layoutH - size.height) / 2)),
    };
}

function clampDialogPos(p: DialogPoint, size: DialogSize): DialogPoint {
    const { width: layoutW, height: layoutH } = getLayoutViewport();
    return {
        x: clampNum(p.x, -size.width + DIALOG_MIN_VISIBLE, layoutW - DIALOG_MIN_VISIBLE),
        y: clampNum(p.y, 16, layoutH - DIALOG_MIN_VISIBLE),
    };
}

function clampDialogSize(size: DialogSize, pos: DialogPoint = { x: 0, y: 0 }): DialogSize {
    const { width: layoutW, height: layoutH } = getLayoutViewport();
    return {
        width: clampNum(size.width, DIALOG_MIN_W, Math.max(DIALOG_MIN_W, layoutW - Math.max(0, pos.x) - 8)),
        height: clampNum(size.height, DIALOG_MIN_H, Math.max(DIALOG_MIN_H, layoutH - Math.max(0, pos.y) - 8)),
    };
}

function gaugeMaxFor(mbps: number): number {
    const steps = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
    return steps.find((n) => mbps <= n * 0.86) ?? 10000;
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
    const start = polar(cx, cy, r, startDeg);
    const end = polar(cx, cy, r, endDeg);
    const sweep = endDeg - startDeg;
    const large = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

const SpeedGauge: React.FC<{
    value: number;
    max: number;
    phase: SpeedTestPhase;
    label: string;
    sublabel: string;
}> = ({ value, max, phase, label, sublabel }) => {
    // Fill the gauge card: larger dial, centered, with room for the readout under the hub.
    const start = 225;
    const sweep = 270;
    const t = Math.max(0, Math.min(1, value / Math.max(max, 1)));
    const needleAngle = start + t * sweep;
    const cx = 160;
    const cy = 132;
    const r = 118;
    const valueArc = t > 0.002 ? arcPath(cx, cy, r, start, needleAngle) : '';
    const ticks = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
    const testing = phase === 'download' || phase === 'upload' || phase === 'latency' || phase === 'preparing';

    return (
        <div className="relative mx-auto w-full max-w-[420px] aspect-square min-h-[280px] mb-2">
            {testing && (
                <div className="absolute inset-[12%] rounded-full bg-cyan-400/10 blur-2xl animate-pulse pointer-events-none" />
            )}
            <svg
                viewBox="0 0 320 300"
                data-speed-gauge="true"
                className="w-full h-full drop-shadow-sm"
                overflow="visible"
            >
                <defs>
                    <linearGradient id="ln-speed-arc" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f43f5e" />
                        <stop offset="35%" stopColor="#f59e0b" />
                        <stop offset="70%" stopColor="#22c55e" />
                        <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                </defs>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="18" className="text-slate-200 dark:text-slate-700" />
                {valueArc && (
                    <path d={valueArc} fill="none" stroke="url(#ln-speed-arc)" strokeWidth="18" strokeLinecap="round" />
                )}
                {ticks.map((deg, i) => {
                    const a = polar(cx, cy, r - 28, deg);
                    const b = polar(cx, cy, r - 14, deg);
                    return (
                        <line
                            key={i}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke="currentColor"
                            strokeWidth={i % 3 === 0 ? 2.5 : 1.25}
                            className="text-slate-400 dark:text-slate-500"
                        />
                    );
                })}
                <polygon
                    points="-12,-7 88,0 -12,7"
                    fill="currentColor"
                    className="text-white/90 dark:text-slate-900/90"
                    transform={`translate(${cx} ${cy}) rotate(${needleAngle - 90})`}
                />
                <polygon
                    points="-8,-4.5 84,0 -8,4.5"
                    fill="currentColor"
                    className="text-slate-800 dark:text-white"
                    transform={`translate(${cx} ${cy}) rotate(${needleAngle - 90})`}
                />
                <circle cx={cx} cy={cy} r="12" className="fill-slate-900 dark:fill-white" />
                <circle cx={cx} cy={cy} r="5" className="fill-cyan-400 stroke-white dark:stroke-slate-900" strokeWidth="1.5" />
            </svg>
            <div className="absolute inset-x-[18%] top-[58%] text-center pointer-events-none">
                <div className="inline-flex max-w-full flex-col items-center px-2 py-1">
                    <div className="max-w-full text-[28px] sm:text-[34px] font-extrabold tabular-nums tracking-[-0.02em] text-slate-900 dark:text-white leading-none whitespace-nowrap">
                        {label}
                    </div>
                    <div className="max-w-full text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 mt-1.5 whitespace-nowrap">
                        {sublabel}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    accent?: string;
    title?: string;
}> = ({ icon, label, value, hint, accent, title }) => (
    <div
        className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/80 dark:bg-[#1a1a1a]/80 px-3.5 py-3 shadow-sm"
        title={title}
    >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span className={accent || 'text-cyan-500'}>{icon}</span>
            {label}
        </div>
        <div className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white leading-tight">{value}</div>
        {hint && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>}
    </div>
);

function phaseIndex(phase: SpeedTestPhase): number {
    const i = PHASE_ORDER.indexOf(phase);
    return i < 0 ? -1 : i;
}

const emptyProgress: SpeedTestProgress = {
    phase: 'idle',
    phaseLabel: 'Ready',
    percent: 0,
    liveMbps: 0,
    pingMs: null,
    jitterMs: null,
    packetLossPct: null,
    downloadMbps: null,
    uploadMbps: null,
    loadedPingMs: null,
    loadedUploadPingMs: null,
    bytesTransferred: 0,
    sparkline: [],
    downloadSparkline: [],
    uploadSparkline: [],
};

export const InternetSpeedTester: React.FC<InternetSpeedTesterProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const [prefs, setPrefs] = useState<SpeedTestPreferences>(() => loadSpeedTestPreferences());
    const [target, setTarget] = useState<SpeedTestTarget>(() => loadSpeedTestPreferences().defaultTarget);
    const [profile, setProfile] = useState<SpeedTestProfile>(() => loadSpeedTestPreferences().defaultProfile);
    const [connectionMode, setConnectionMode] = useState<SpeedTestConnectionMode>(
        () => loadSpeedTestPreferences().connectionMode
    );
    const [viewTab, setViewTab] = useState<'test' | 'compare' | 'settings'>('test');
    const [customServer, setCustomServer] = useState<SpeedTestCustomServerPrefs>(
        () => loadSpeedTestPreferences().customServer
    );
    const customEndpoint = useMemo<SpeedTestEndpoint | null>(
        () =>
            normalizeSpeedTestEndpoint({
                scheme: customServer.scheme,
                host: customServer.host,
                port: customServer.port,
                path: customServer.path,
                mode: customServer.mode,
            }),
        [customServer]
    );
    const [failedEndpoint, setFailedEndpoint] = useState<SpeedTestEndpoint | null>(null);
    const [progress, setProgress] = useState<SpeedTestProgress>(emptyProgress);
    const [result, setResult] = useState<SpeedTestResult | null>(null);
    const [compareInternet, setCompareInternet] = useState<SpeedTestResult | null>(null);
    const [compareServer, setCompareServer] = useState<SpeedTestResult | null>(null);
    const [history, setHistory] = useState<SpeedTestResult[]>(() => loadSpeedTestHistory());
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const running = progress.phase !== 'idle' && progress.phase !== 'complete' && progress.phase !== 'error';

    const dialogRef = useRef<HTMLDivElement>(null);
    const posRef = useRef<DialogPoint>({ x: 0, y: 0 });
    const sizeRef = useRef<DialogSize>({ width: DIALOG_DEFAULT_W, height: DIALOG_DEFAULT_H });
    const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
    const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const rafRef = useRef<number | null>(null);
    const pendingPosRef = useRef<DialogPoint | null>(null);
    const suppressBackdropClickRef = useRef(false);
    const [pos, setPos] = useState<DialogPoint>({ x: 0, y: 0 });
    const [size, setSize] = useState<DialogSize>({ width: 0, height: 0 });
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);

    const writeDialogBox = useCallback((nextPos: DialogPoint, nextSize: DialogSize) => {
        const el = dialogRef.current;
        if (!el) return;
        el.style.left = `${nextPos.x}px`;
        el.style.top = `${nextPos.y}px`;
        el.style.width = `${nextSize.width}px`;
        el.style.height = `${nextSize.height}px`;
    }, []);

    const applyPos = useCallback((next: DialogPoint) => {
        posRef.current = next;
        writeDialogBox(next, sizeRef.current);
        pendingPosRef.current = next;
        if (rafRef.current != null) return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            const queued = pendingPosRef.current;
            if (queued) setPos(queued);
        });
    }, [writeDialogBox]);

    const applySize = useCallback((next: DialogSize) => {
        sizeRef.current = next;
        writeDialogBox(posRef.current, next);
    }, [writeDialogBox]);

    // Progress updates re-render the dialog; re-apply layout coords so React style cannot snap/offset it.
    useLayoutEffect(() => {
        if (!isOpen || size.width === 0) return;
        writeDialogBox(posRef.current, sizeRef.current);
    });

    useLayoutEffect(() => {
        if (!isOpen) {
            setSize({ width: 0, height: 0 });
            return;
        }
        const nextSize = clampDialogSize(defaultDialogSize());
        const nextPos = clampDialogPos(centeredDialogPos(nextSize), nextSize);
        sizeRef.current = nextSize;
        posRef.current = nextPos;
        setSize(nextSize);
        setPos(nextPos);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || size.width === 0) return;
        const reclamp = () => {
            const nextSize = clampDialogSize(sizeRef.current, posRef.current);
            const nextPos = clampDialogPos(posRef.current, nextSize);
            applySize(nextSize);
            applyPos(nextPos);
            setSize(nextSize);
        };
        window.addEventListener('resize', reclamp);
        window.visualViewport?.addEventListener('resize', reclamp);
        window.visualViewport?.addEventListener('scroll', reclamp);
        return () => {
            window.removeEventListener('resize', reclamp);
            window.visualViewport?.removeEventListener('resize', reclamp);
            window.visualViewport?.removeEventListener('scroll', reclamp);
        };
    }, [isOpen, size.width, applyPos, applySize]);

    const beginDragFromPointer = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragCleanupRef.current?.();
        dragCleanupRef.current = null;

        // Monitor free-panel: use stored layout pos (not rect/zoom). Rect/zoom double-applies
        // html { zoom } in this runtime and jumps the dialog on pointerdown.
        const current = posRef.current;
        dragStartRef.current = { x: e.clientX, y: e.clientY, posX: current.x, posY: current.y };
        setDragging(true);
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }

        const onMove = (ev: PointerEvent) => {
            const start = dragStartRef.current;
            if (!start) return;
            const z = getCssZoom();
            if (ev.cancelable) ev.preventDefault();
            if (Math.abs(ev.clientX - start.x) > 3 || Math.abs(ev.clientY - start.y) > 3) {
                suppressBackdropClickRef.current = true;
            }
            applyPos(clampDialogPos(
                {
                    x: start.posX + (ev.clientX - start.x) / z,
                    y: start.posY + (ev.clientY - start.y) / z,
                },
                sizeRef.current,
            ));
        };
        const onUp = () => {
            dragCleanupRef.current?.();
            dragCleanupRef.current = null;
            dragStartRef.current = null;
            setPos(posRef.current);
            setDragging(false);
            window.setTimeout(() => {
                suppressBackdropClickRef.current = false;
            }, 0);
        };
        window.addEventListener('pointermove', onMove, { capture: true, passive: false });
        window.addEventListener('pointerup', onUp, { capture: true });
        window.addEventListener('pointercancel', onUp, { capture: true });
        dragCleanupRef.current = () => {
            window.removeEventListener('pointermove', onMove, { capture: true });
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onUp, { capture: true });
        };
    }, [applyPos]);

    const onDragStart = useCallback((e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
        beginDragFromPointer(e);
    }, [beginDragFromPointer]);

    const onResizeStart = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragCleanupRef.current?.();
        dragCleanupRef.current = null;

        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: sizeRef.current.width,
            height: sizeRef.current.height,
        };
        setResizing(true);
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }

        const onMove = (ev: PointerEvent) => {
            const start = resizeStartRef.current;
            if (!start) return;
            const z = getCssZoom();
            if (ev.cancelable) ev.preventDefault();
            const next = clampDialogSize(
                {
                    width: start.width + (ev.clientX - start.x) / z,
                    height: start.height + (ev.clientY - start.y) / z,
                },
                posRef.current,
            );
            applySize(next);
        };
        const onUp = () => {
            dragCleanupRef.current?.();
            dragCleanupRef.current = null;
            resizeStartRef.current = null;
            setSize(sizeRef.current);
            setResizing(false);
        };
        window.addEventListener('pointermove', onMove, { capture: true, passive: false });
        window.addEventListener('pointerup', onUp, { capture: true });
        window.addEventListener('pointercancel', onUp, { capture: true });
        dragCleanupRef.current = () => {
            window.removeEventListener('pointermove', onMove, { capture: true });
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onUp, { capture: true });
        };
    }, [applySize]);

    useEffect(() => () => {
        dragCleanupRef.current?.();
        if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    }, []);

    useEscapeToClose(isOpen && !running, onClose);

    useEffect(() => {
        if (!isOpen) return;
        setHistory(loadSpeedTestHistory());
        const loaded = loadSpeedTestPreferences();
        setPrefs(loaded);
        setCustomServer(loaded.customServer);
        ensureBrowserSpeedScheduleLoop();
    }, [isOpen]);

    const updateCustomServer = useCallback((patch: Partial<SpeedTestCustomServerPrefs>) => {
        setCustomServer((prev) => ({ ...prev, ...patch }));
    }, []);

    /** Save the custom-server fields (plus the global defaults) and return the normalized prefs. */
    const persistCustomServer = useCallback(() => {
        const next = patchSpeedTestPreferences({
            defaultTarget: target,
            defaultProfile: profile,
            connectionMode,
            customServer,
        });
        setPrefs(next);
        setCustomServer(next.customServer);
        return next;
    }, [customServer, connectionMode, profile, target]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setProgress((p) => (p.phase === 'complete' ? p : { ...emptyProgress, phase: 'idle', phaseLabel: 'Ready' }));
    }, []);

    const close = useCallback(() => {
        if (running) stop();
        onClose();
    }, [onClose, running, stop]);

    const finalizeResult = useCallback(async (next: SpeedTestResult) => {
        setResult(next);
        setHistory(saveSpeedTestResult(next));
        notifySpeedTestComplete(next);
        notifySpeedTestAlerts(next);
        try {
            await postSpeedTestResult(next, 'manual');
        } catch {
            /* optional server mirror */
        }
    }, []);

    const start = useCallback(async (endpointOverride?: SpeedTestEndpoint | null) => {
        const endpoint = endpointOverride ?? (target === 'custom' ? customEndpoint : null);
        if (target === 'custom' && !endpoint) {
            setError('Enter the IP address (or host) of the target server first.');
            setProgress({ ...emptyProgress, phase: 'error', phaseLabel: 'Error', message: 'No endpoint address' });
            return;
        }
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setError(null);
        setFailedEndpoint(null);
        setResult(null);
        setCopied(false);
        setViewTab('test');
        patchSpeedTestPreferences({ defaultTarget: target, defaultProfile: profile, connectionMode });
        if (target === 'custom') {
            persistCustomServer();
        } else {
            setPrefs(loadSpeedTestPreferences());
        }
        setProgress({ ...emptyProgress, phase: 'preparing', phaseLabel: 'Preparing', percent: 1 });
        try {
            const next = await runSpeedTest({
                target,
                profile,
                connectionMode,
                endpoint: endpoint ?? undefined,
                signal: ac.signal,
                onProgress: setProgress,
            });
            await finalizeResult(next);
            setProgress((p) => ({ ...p, phase: 'complete', phaseLabel: 'Done', percent: 100 }));
        } catch (err) {
            if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
                setProgress(emptyProgress);
                return;
            }
            const message = err instanceof Error ? err.message : 'Speed test failed.';
            setError(message);
            // No silent auto-retry: offer the proxy path explicitly, attributed as the LinkNest host.
            if (target === 'custom' && endpoint && endpoint.mode === 'direct') {
                setFailedEndpoint(endpoint);
            }
            setProgress({ ...emptyProgress, phase: 'error', phaseLabel: 'Error', message });
        } finally {
            if (abortRef.current === ac) abortRef.current = null;
        }
    }, [profile, target, connectionMode, customEndpoint, finalizeResult, persistCustomServer]);

    const retryViaProxy = useCallback(() => {
        if (!failedEndpoint) return;
        const proxyEndpoint: SpeedTestEndpoint = { ...failedEndpoint, mode: 'proxy' };
        const next = patchSpeedTestPreferences({ customServer: { ...customServer, mode: 'proxy' } });
        setCustomServer(next.customServer);
        setError(null);
        void start(proxyEndpoint);
    }, [failedEndpoint, customServer, start]);

    const startCompare = useCallback(async () => {
        if (target === 'custom' && !customEndpoint) {
            setError('Enter the IP address (or host) of the target server first.');
            setProgress({ ...emptyProgress, phase: 'error', phaseLabel: 'Error', message: 'No endpoint address' });
            return;
        }
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setError(null);
        setViewTab('compare');
        if (target === 'custom') {
            persistCustomServer();
        }
        setProgress({ ...emptyProgress, phase: 'preparing', phaseLabel: 'Comparing', percent: 1 });
        try {
            const dual = await runDualSpeedTest({
                profile,
                connectionMode,
                endpoint: target === 'custom' ? customEndpoint ?? undefined : undefined,
                signal: ac.signal,
                onProgress: setProgress,
            });
            setCompareInternet(dual.internet);
            setCompareServer(dual.server);
            await finalizeResult(dual.internet);
            setHistory(saveSpeedTestResult(dual.server));
            setProgress((p) => ({ ...p, phase: 'complete', phaseLabel: 'Done', percent: 100 }));
        } catch (err) {
            if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
                setProgress(emptyProgress);
                return;
            }
            const message = err instanceof Error ? err.message : 'Compare failed.';
            setError(message);
            setProgress({ ...emptyProgress, phase: 'error', phaseLabel: 'Error', message });
        } finally {
            if (abortRef.current === ac) abortRef.current = null;
        }
    }, [profile, connectionMode, target, customEndpoint, finalizeResult, persistCustomServer]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const displayMbps = result?.downloadMbps ?? progress.downloadMbps ?? (running ? progress.liveMbps : 0);
    const gaugeMax = gaugeMaxFor(Math.max(displayMbps, result?.peakDownloadMbps ?? 0, 1));
    const gaugeLabel =
        progress.phase === 'idle'
            ? 'GO'
            : progress.phase === 'error'
                ? '—'
                : progress.phase === 'latency' || progress.phase === 'preparing'
                    ? formatMs(progress.pingMs)
                    : progress.phase === 'upload'
                        ? formatMbps(progress.uploadMbps ?? progress.liveMbps)
                        : formatMbps(displayMbps);
    const gaugeSub =
        progress.phase === 'idle'
            ? 'Tap GO to begin'
            : progress.phase === 'latency' || progress.phase === 'preparing'
                ? 'Ping'
                : progress.phase === 'upload'
                    ? 'Upload'
                    : progress.phase === 'complete'
                        ? 'Download'
                        : 'Live';

    const previous = result ? findPreviousLikeForLikeResult(history, result) : null;
    const deltaDown =
        result && previous?.downloadMbps != null && result.downloadMbps != null
            ? result.downloadMbps - previous.downloadMbps
            : null;

    const chartRef = result ?? (target === 'custom' ? { target, meta: { endpointHost: customEndpoint?.label ?? null, endpointMode: customServer.mode } } : null);
    const historyChartTarget = result?.target ?? target;
    const historyChartMode = result?.connectionMode ?? connectionMode;
    const historyChartHost = result?.meta.endpointHost ?? customEndpoint?.label ?? null;
    const historyChart = useMemo(
        () =>
            history
                .filter((h) =>
                    isLikeForLikeSpeedTest(
                        {
                            target: historyChartTarget,
                            connectionMode: historyChartMode,
                            executor: result?.executor || 'browser',
                            meta: chartRef?.meta ?? null,
                        },
                        h
                    )
                )
                .slice(0, 16)
                .reverse()
                .map((h) => ({
                    t: new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    down: h.downloadMbps ?? 0,
                    up: h.uploadMbps ?? 0,
                })),
        [history, historyChartTarget, historyChartMode, result?.executor, chartRef?.meta?.endpointHost, chartRef?.meta?.endpointMode]
    );

    const copyResult = async () => {
        if (!result) return;
        try {
            await copySpeedTestText(result);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setCopied(false);
        }
    };

    const exportJson = () => exportSpeedTestHistoryJson(history);
    const exportCsv = () => exportSpeedTestHistoryCsv(history);
    const exportPng = async () => {
        if (!result) return;
        try {
            await downloadSpeedTestPng(result);
        } catch {
            setError('Could not export PNG report');
        }
    };
    const copyPng = async () => {
        if (!result) return;
        const ok = await copySpeedTestPng(result);
        setCopied(ok);
        window.setTimeout(() => setCopied(false), 1600);
    };

    if (!isOpen || typeof document === 'undefined' || size.width === 0) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100080]" role="presentation">
            <button
                type="button"
                aria-label="Close speed tester"
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] border-0 cursor-default"
                onClick={() => {
                    if (suppressBackdropClickRef.current) {
                        suppressBackdropClickRef.current = false;
                        return;
                    }
                    if (!running && !dragging && !resizing) close();
                }}
            />
            <div
                ref={dialogRef}
                className={`z-10 ${dragging || resizing ? 'will-change-left will-change-top' : ''}`}
                style={{
                    position: 'fixed',
                    left: pos.x,
                    top: pos.y,
                    width: size.width,
                    height: size.height,
                    margin: 0,
                    transform: 'none',
                    right: 'auto',
                    bottom: 'auto',
                    maxHeight: 'none',
                    transition: dragging || resizing ? 'none' : undefined,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative w-full h-full">
                    <button
                        type="button"
                        className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-16 h-7 rounded-full shadow-md border border-blue-300/70 dark:border-blue-600/60 bg-blue-500/90 dark:bg-blue-600/90 backdrop-blur flex items-center justify-center text-white ${
                            dragging ? 'cursor-grabbing' : 'cursor-grab'
                        }`}
                        onPointerDown={beginDragFromPointer}
                        title="Drag speed tester (grab here)"
                        aria-label="Drag speed tester"
                    >
                        <span className="text-[16px] leading-none tracking-widest flex items-center">⋮⋮⋮</span>
                    </button>

                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ln-speedtest-title"
                        className="relative w-full h-full rounded-3xl border border-slate-200 dark:border-[#333] bg-gradient-to-b from-slate-50 to-white dark:from-[#151a22] dark:to-[#111] shadow-2xl flex flex-col overflow-hidden"
                    >
                <div
                    onPointerDown={onDragStart}
                    className={`flex items-start justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/80 shrink-0 select-none touch-none cursor-grab ${
                        dragging ? 'cursor-grabbing bg-cyan-50/80 dark:bg-cyan-950/30' : ''
                    }`}
                    title="Drag to move"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <FaTachometerAlt size={18} />
                        </div>
                        <div className="min-w-0">
                            <h2 id="ln-speedtest-title" className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                Internet speed test
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Ping, jitter, download, and upload — internet (Cloudflare) or this LinkNest host.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors cursor-pointer"
                        title="Close"
                    >
                        <FaTimes size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 min-h-0 px-4 sm:px-6 py-4 pb-10 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-xl bg-slate-100 dark:bg-[#252525] p-0.5">
                            <button
                                type="button"
                                disabled={running}
                                onClick={() => setTarget('internet')}
                                title="Measure against Cloudflare’s public speed servers (internet path from this browser)."
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                                    target === 'internet'
                                        ? 'bg-white dark:bg-[#333] text-cyan-600 dark:text-cyan-400 shadow-sm'
                                        : 'text-slate-500'
                                }`}
                            >
                                <FaGlobe size={11} /> Internet
                            </button>
                            <button
                                type="button"
                                disabled={running}
                                onClick={() => setTarget('server')}
                                title="Measure against this LinkNest host (LAN/path to your server, not the public internet)."
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                                    target === 'server'
                                        ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-slate-500'
                                }`}
                            >
                                <FaServer size={11} /> This server
                            </button>
                            <button
                                type="button"
                                disabled={running}
                                onClick={() => setTarget('custom')}
                                title="Measure a specific server by IP/host — another link/space host on the LAN or a web server you nominate."
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                                    target === 'custom'
                                        ? 'bg-white dark:bg-[#333] text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500'
                                }`}
                            >
                                <FaNetworkWired size={11} /> Custom server
                            </button>
                        </div>
                        <div className="flex rounded-xl bg-slate-100 dark:bg-[#252525] p-0.5">
                            {(Object.keys(PROFILE_LABEL) as SpeedTestProfile[]).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    disabled={running}
                                    onClick={() => setProfile(p)}
                                    title={PROFILE_HINT[p]}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                                        profile === p
                                            ? 'bg-white dark:bg-[#333] text-slate-900 dark:text-white shadow-sm'
                                            : 'text-slate-500'
                                    }`}
                                >
                                    {PROFILE_LABEL[p]}
                                </button>
                            ))}
                        </div>
                        <div
                            className="flex rounded-xl bg-slate-100 dark:bg-[#252525] p-0.5"
                            title="How many parallel transfer streams to use during download/upload."
                        >
                            <button
                                type="button"
                                disabled={running}
                                onClick={() => setConnectionMode('single')}
                                title={CONNECTION_MODE_HINT.single}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                                    connectionMode === 'single'
                                        ? 'bg-white dark:bg-[#333] text-indigo-600 dark:text-indigo-300 shadow-sm'
                                        : 'text-slate-500'
                                }`}
                            >
                                Single
                            </button>
                            <button
                                type="button"
                                disabled={running}
                                onClick={() => setConnectionMode('multi')}
                                title={CONNECTION_MODE_HINT.multi}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                                    connectionMode === 'multi'
                                        ? 'bg-white dark:bg-[#333] text-indigo-600 dark:text-indigo-300 shadow-sm'
                                        : 'text-slate-500'
                                }`}
                            >
                                Multi
                            </button>
                        </div>
                        <div className="flex rounded-xl bg-slate-100 dark:bg-[#252525] p-0.5 ml-auto">
                            {(
                                [
                                    [
                                        'test',
                                        'Test',
                                        'Run a live speed test with the gauge, metrics, and graphs.',
                                    ],
                                    [
                                        'compare',
                                        'Compare',
                                        'Run Internet and This-server tests and compare the results side by side.',
                                    ],
                                    [
                                        'settings',
                                        'Settings',
                                        'Schedules, alert thresholds, notifications, and worker jobs.',
                                    ],
                                ] as const
                            ).map(([id, label, tip]) => (
                                <button
                                    key={id}
                                    type="button"
                                    title={tip}
                                    onClick={() => setViewTab(id)}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${
                                        viewTab === id
                                            ? 'bg-white dark:bg-[#333] text-slate-900 dark:text-white shadow-sm'
                                            : 'text-slate-500'
                                    }`}
                                >
                                    {id === 'settings' ? <FaCog size={10} /> : null}
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {target === 'custom' && (
                        <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/70 dark:bg-violet-950/20 px-3 py-2.5 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                                    <FaNetworkWired size={11} /> Target server
                                </span>
                                <input
                                    type="text"
                                    value={customServer.host}
                                    disabled={running}
                                    onChange={(e) => updateCustomServer({ host: e.target.value })}
                                    onBlur={persistCustomServer}
                                    placeholder="192.168.10.20  or  fileserver.local  or  10.0.0.5:8080"
                                    spellCheck={false}
                                    autoComplete="off"
                                    className="flex-1 min-w-[220px] rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-[#111] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-60"
                                    title="IP address or hostname of the server to measure. Add :port for a non-standard port; you can paste a full http(s):// URL."
                                />
                                <div className="flex rounded-lg bg-white dark:bg-[#1a1a1a] border border-violet-200 dark:border-violet-800 p-0.5">
                                    {(['direct', 'proxy'] as SpeedTestEndpointMode[]).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            disabled={running}
                                            onClick={() => {
                                                updateCustomServer({ mode: m });
                                                setError(null);
                                                setFailedEndpoint(null);
                                            }}
                                            title={
                                                m === 'direct'
                                                    ? 'This browser connects to the endpoint directly (needs a cross-origin speed-test probe — another LinkNest with the public probe enabled).'
                                                    : 'This LinkNest host relays to the endpoint — works for any web server, but the address must be on the admin proxy allow-list.'
                                            }
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all disabled:opacity-50 ${
                                                customServer.mode === m
                                                    ? 'bg-violet-600 text-white shadow-sm'
                                                    : 'text-slate-500'
                                            }`}
                                        >
                                            {m === 'direct' ? 'Browser → endpoint' : 'Host → endpoint'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p className="text-[11px] leading-snug text-violet-800/90 dark:text-violet-200/80">
                                {customServer.mode === 'direct' ? (
                                    <>
                                        Measures <strong>this device’s</strong> path to{' '}
                                        <span className="font-semibold">{customEndpoint ? customEndpoint.label : 'the endpoint'}</span>. The
                                        endpoint must expose the speed-test probe (another LinkNest with it enabled). Needs HTTPS or a same-scheme
                                        origin.
                                    </>
                                ) : (
                                    <>
                                        Measures <strong>this LinkNest host’s</strong> path to{' '}
                                        <span className="font-semibold">{customEndpoint ? customEndpoint.label : 'the endpoint'}</span> — not this
                                        device. Results are labelled “via LinkNest host”. The address must be on the admin proxy allow-list.
                                    </>
                                )}
                            </p>
                            {customServer.host.trim() !== '' && !customEndpoint && (
                                <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                                    Address not understood — use an IP or hostname, optionally with :port.
                                </p>
                            )}
                        </div>
                    )}
                    {viewTab === 'test' && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1 mb-1 leading-snug">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">Single vs Multi:</span>{' '}
                            {connectionMode === 'multi' ? CONNECTION_MODE_HINT.multi : CONNECTION_MODE_HINT.single}
                        </p>
                    )}

                    {viewTab === 'settings' && (
                        <SpeedTestSettingsPanel
                            prefs={prefs}
                            onPrefsChange={setPrefs}
                            isAdmin={isAdmin}
                            customServer={customServer}
                            onCustomServerChange={(next) => {
                                const saved = patchSpeedTestPreferences({ customServer: next });
                                setCustomServer(saved.customServer);
                                setPrefs(saved);
                            }}
                        />
                    )}

                    {viewTab === 'compare' && (
                        <ComparisonPanel
                            internet={compareInternet}
                            server={compareServer}
                            onRunCompare={startCompare}
                            running={running}
                            serverLabel={
                                target === 'custom'
                                    ? speedTestTargetLabel('custom', customEndpoint?.label ?? null)
                                    : speedTestTargetLabel('server')
                            }
                        />
                    )}

                    {viewTab === 'test' && (
                    <>
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
                        <div className="rounded-3xl border border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 pt-6 pb-5 px-4 sm:px-5 relative overflow-visible">
                            <div
                                className="pointer-events-none absolute inset-x-0 top-0 h-1.5 overflow-hidden rounded-t-3xl bg-slate-200 dark:bg-[#333]"
                                aria-hidden
                            >
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 transition-all duration-300"
                                    style={{ width: `${Math.min(100, progress.percent)}%` }}
                                />
                            </div>
                            <SpeedGauge
                                value={
                                    progress.phase === 'latency' || progress.phase === 'preparing'
                                        ? Math.min(200, progress.pingMs ?? 0)
                                        : displayMbps
                                }
                                max={progress.phase === 'latency' || progress.phase === 'preparing' ? 200 : gaugeMax}
                                phase={progress.phase}
                                label={gaugeLabel}
                                sublabel={gaugeSub}
                            />

                            <div className="flex items-center justify-center gap-2 mt-1 mb-4">
                                {PHASE_ORDER.map((ph) => {
                                    const idx = phaseIndex(progress.phase);
                                    const mine = phaseIndex(ph);
                                    const done = idx > mine || progress.phase === 'complete';
                                    const active = progress.phase === ph;
                                    return (
                                        <div key={ph} className="flex items-center gap-2">
                                            <span
                                                className={`text-[10px] font-bold uppercase tracking-wide ${
                                                    active
                                                        ? 'text-cyan-600 dark:text-cyan-400'
                                                        : done
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-slate-400'
                                                }`}
                                            >
                                                {ph === 'preparing' ? 'Prep' : ph === 'complete' ? 'Done' : ph}
                                            </span>
                                            {ph !== 'complete' && <span className="w-4 h-px bg-slate-300 dark:bg-slate-600" />}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-center gap-2">
                                {running ? (
                                    <button
                                        type="button"
                                        onClick={stop}
                                        title="Stop the test in progress."
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-600/25 active:scale-95 transition-all"
                                    >
                                        <FaStop size={12} /> Abort
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void start()}
                                        title="Start ping, download, and upload using the selected target, profile, and Single/Multi mode."
                                        className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-lg font-black tracking-wide shadow-xl shadow-cyan-500/30 active:scale-95 transition-all"
                                    >
                                        <FaBolt size={16} /> GO
                                    </button>
                                )}
                                {result && !running && (
                                    <button
                                        type="button"
                                        onClick={() => void start()}
                                        title="Run another test with the same settings."
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-[#333] transition-all"
                                    >
                                        <FaRedo size={12} /> Retest
                                    </button>
                                )}
                            </div>
                            {progress.message && (
                                <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-3">{progress.message}</p>
                            )}
                            {error && (
                                <div className="mt-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                                    {error}
                                    {target === 'internet' && (
                                        <button
                                            type="button"
                                            className="ml-2 underline font-semibold"
                                            onClick={() => {
                                                setTarget('server');
                                                setError(null);
                                            }}
                                        >
                                            Switch to this server
                                        </button>
                                    )}
                                    {failedEndpoint && (
                                        <button
                                            type="button"
                                            className="ml-2 underline font-semibold"
                                            onClick={retryViaProxy}
                                            title="Re-run the same endpoint through this LinkNest host. The result is labelled as measured from the host, not this device."
                                        >
                                            Try via server (proxy)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2.5">
                                <MetricCard
                                    icon={<FaClock size={12} />}
                                    label="Ping"
                                    value={formatMs(result?.pingMs ?? progress.pingMs)}
                                    hint={result?.loadedPingMs != null ? `Loaded ${formatMs(result.loadedPingMs)}` : 'Idle RTT'}
                                    accent="text-violet-500"
                                    title="Round-trip time to the test endpoint when the link is idle. Lower is better for gaming and calls."
                                />
                                <MetricCard
                                    icon={<FaBolt size={12} />}
                                    label="Jitter"
                                    value={formatMs(result?.jitterMs ?? progress.jitterMs)}
                                    hint={
                                        (result?.packetLossPct ?? progress.packetLossPct) != null
                                            ? `Loss ${(result?.packetLossPct ?? progress.packetLossPct ?? 0).toFixed(0)}%`
                                            : 'Stability'
                                    }
                                    accent="text-amber-500"
                                    title="How much ping varies between samples. High jitter causes stutter in calls, games, and live video."
                                />
                                <MetricCard
                                    icon={<FaDownload size={12} />}
                                    label="Download"
                                    value={formatMbps(result?.downloadMbps ?? progress.downloadMbps)}
                                    hint={result?.peakDownloadMbps != null ? `Peak ${formatMbps(result.peakDownloadMbps)}` : 'To edge / host'}
                                    accent="text-cyan-500"
                                    title="How fast data arrives to this browser from the selected target. Multi mode usually measures higher peaks."
                                />
                                <MetricCard
                                    icon={<FaUpload size={12} />}
                                    label="Upload"
                                    value={formatMbps(result?.uploadMbps ?? progress.uploadMbps)}
                                    hint={result?.peakUploadMbps != null ? `Peak ${formatMbps(result.peakUploadMbps)}` : 'From this browser'}
                                    accent="text-blue-500"
                                    title="How fast this browser can send data to the selected target (video calls, uploads, backups)."
                                />
                            </div>

                            {result && (
                                <div className={`rounded-2xl border px-4 py-3 ${QUALITY_CLASS[result.quality.tone]}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-black uppercase tracking-wide">{result.quality.label}</div>
                                        <div className="text-lg font-black tabular-nums">{result.score}<span className="text-xs font-bold opacity-70">/100</span></div>
                                    </div>
                                    <p className="text-xs mt-1 opacity-90">{result.quality.hint}</p>
                                    {deltaDown != null && previous && (
                                        <p
                                            className="text-xs mt-1.5 font-semibold"
                                            title={`Compared with the previous ${speedTestTargetLabel(result.target)} ${previous.connectionMode} test on the same path (${previous.executor === 'worker' ? 'worker' : 'browser'}). Internet and This-server results are never mixed.`}
                                        >
                                            vs last {speedTestTargetLabel(result.target)} ({previous.connectionMode}) test:{' '}
                                            <span className={deltaDown >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}>
                                                {deltaDown >= 0 ? '+' : '−'}
                                                {formatMbps(Math.abs(deltaDown))}
                                            </span>
                                            <span className="opacity-70 font-medium">
                                                {' '}
                                                (was {formatMbps(previous.downloadMbps)})
                                            </span>
                                        </p>
                                    )}
                                </div>
                            )}

                            <BufferbloatCards
                                result={result}
                                loadedDown={result?.loadedPingMs ?? progress.loadedPingMs}
                                loadedUp={result?.loadedUploadPingMs ?? progress.loadedUploadPingMs}
                            />
                            {result?.useCaseGrades?.length ? <UseCaseGradesPanel grades={result.useCaseGrades} /> : null}
                            {result?.findings?.length ? <DiagnosticsPanel findings={result.findings} /> : null}
                            <NetworkDetailsPanel result={result} />
                            {result && (
                                <div className="text-[11px] text-slate-500">
                                    Transferred {formatBytes(result.bytesDownloaded + result.bytesUploaded)} in{' '}
                                    {(result.durationMs / 1000).toFixed(1)}s
                                </div>
                            )}

                            {result && (
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={copyResult}
                                        title="Copy a text summary of this result to the clipboard."
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333]"
                                    >
                                        {copied ? <FaCheck size={11} /> : <FaCopy size={11} />}
                                        {copied ? 'Copied' : 'Copy results'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void exportPng()}
                                        title="Download a PNG image report of the current result."
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333]"
                                    >
                                        <FaImage size={11} /> PNG report
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void copyPng()}
                                        title="Copy the PNG report image to the clipboard."
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333]"
                                    >
                                        <FaCopy size={11} /> Copy PNG
                                    </button>
                                    <button
                                        type="button"
                                        onClick={exportJson}
                                        title="Download full test history as JSON."
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333]"
                                    >
                                        <FaDownload size={11} /> JSON
                                    </button>
                                    <button
                                        type="button"
                                        onClick={exportCsv}
                                        title="Download test history as CSV for spreadsheets."
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333]"
                                    >
                                        <FaFileCsv size={11} /> CSV
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <LiveThroughputCharts progress={progress} result={result} />
                    </>
                    )}

                    <div className="rounded-3xl border border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                                    <FaHistory className="text-cyan-500" /> Test history
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Trend shows {speedTestTargetLabel(historyChartTarget, historyChartHost)} ({historyChartMode}) tests only — different targets and paths are not mixed.
                                </p>
                            </div>
                            {history.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={exportCsv}
                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-cyan-500"
                                    >
                                        <FaFileCsv size={10} /> CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            clearSpeedTestHistory();
                                            setHistory([]);
                                        }}
                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-red-500"
                                    >
                                        <FaTrash size={10} /> Clear
                                    </button>
                                </div>
                            )}
                        </div>
                        {history.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No tests yet. Run GO to save results on this device.</p>
                        ) : (
                            <>
                                {historyChart.length === 0 ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                        No {speedTestTargetLabel(historyChartTarget, historyChartHost)} ({historyChartMode}) tests yet. Run GO on that path and mode to build a like-to-like trend. Other path results stay in the list below.
                                    </p>
                                ) : (
                                <div className="h-36 mb-3">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={historyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                                            <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                                            <YAxis tick={{ fontSize: 10 }} width={42} />
                                            <Tooltip
                                                formatter={(v: number, name: string) => [formatMbps(v), name === 'down' ? 'Download' : 'Upload']}
                                                contentStyle={{
                                                    background: 'rgba(15,23,42,0.92)',
                                                    border: 'none',
                                                    borderRadius: 12,
                                                    color: '#fff',
                                                    fontSize: 12,
                                                }}
                                            />
                                            <Area type="monotone" dataKey="down" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.18} strokeWidth={2} />
                                            <Area type="monotone" dataKey="up" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                )}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                                                <th className="py-1.5 pr-3 font-bold">When</th>
                                                <th className="py-1.5 pr-3 font-bold">Where</th>
                                                <th className="py-1.5 pr-3 font-bold">Mode</th>
                                                <th className="py-1.5 pr-3 font-bold">Down</th>
                                                <th className="py-1.5 pr-3 font-bold">Up</th>
                                                <th className="py-1.5 pr-3 font-bold">Ping</th>
                                                <th className="py-1.5 font-bold">Quality</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.slice(0, 12).map((h) => {
                                                const likeForLike = result
                                                    ? isLikeForLikeSpeedTest(result, h)
                                                    : isLikeForLikeSpeedTest(
                                                          {
                                                              target,
                                                              connectionMode,
                                                              executor: 'browser',
                                                              meta: {
                                                                  endpointHost: customEndpoint?.label ?? null,
                                                                  endpointMode: customServer.mode,
                                                              },
                                                          },
                                                          h
                                                      );
                                                return (
                                                <tr
                                                    key={h.id}
                                                    className={`border-t border-slate-100 dark:border-[#2a2a2a] text-slate-700 dark:text-slate-300 ${
                                                        likeForLike ? '' : 'opacity-45'
                                                    }`}
                                                    title={
                                                        likeForLike
                                                            ? 'Same path and mode as the current result.'
                                                            : 'Different path or mode — excluded from “vs last” and from the trend for the current target.'
                                                    }
                                                >
                                                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(h.at).toLocaleString()}</td>
                                                    <td className="py-1.5 pr-3">
                                                        {h.executor === 'worker' ? 'Worker' : 'Browser'} · {h.target === 'internet' ? 'Internet' : 'Server'}
                                                    </td>
                                                    <td className="py-1.5 pr-3">{h.connectionMode || 'multi'}</td>
                                                    <td className="py-1.5 pr-3 tabular-nums font-semibold">{formatMbps(h.downloadMbps)}</td>
                                                    <td className="py-1.5 pr-3 tabular-nums">{formatMbps(h.uploadMbps)}</td>
                                                    <td className="py-1.5 pr-3 tabular-nums">{formatMs(h.pingMs)}</td>
                                                    <td className="py-1.5 font-semibold">{h.quality.label}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div
                    onPointerDown={onDragStart}
                    className={`absolute left-0 right-5 bottom-0 h-7 cursor-grab active:cursor-grabbing flex items-center justify-center gap-1.5 select-none touch-none border-t border-slate-200/80 dark:border-[#333] z-[5] ${
                        dragging
                            ? 'bg-cyan-100/90 dark:bg-cyan-950/50'
                            : 'bg-slate-50/95 dark:bg-[#1a1a1a]/95 hover:bg-slate-100 dark:hover:bg-[#252525]'
                    }`}
                    title="Drag to move"
                    role="presentation"
                >
                    <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        Drag
                    </span>
                    <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
                </div>

                <div
                    onPointerDown={onResizeStart}
                    className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 rounded-br-3xl z-10 ${
                        resizing ? 'bg-cyan-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                    }`}
                    title="Resize"
                    aria-label="Resize dialog"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-400 dark:text-slate-500" aria-hidden>
                        <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </svg>
                </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
