import React, { useState, useEffect, useRef, useMemo, lazy, Suspense, memo } from 'react';
import { createPortal } from 'react-dom';
import { LinkRedirectHop } from '../types';
import { linkHealthService } from '../services/linkHealthService';
import { isHttpOrHttpsUrl } from '../utils/urlDisplay';
import { diagnoseLinkUrl, hasBlockingUrlIssues } from '../utils/urlDiagnostics';
import { UrlNeedsFixBadge } from './UrlFormDiagnostics';

const SslCheckerDialog = lazy(() => import('./ssl/SslCheckerDialog'));
const WhoisDialog = lazy(() => import('./ssl/WhoisDialog'));
const isProbableUrl = (value: string): boolean => {
    // Only probe URLs that already include http(s):// — never invent a scheme.
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed.length < 8) return false;
    if (!isHttpOrHttpsUrl(trimmed)) return false;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const formatProbeLatency = (ms?: number | null): string => {
    if (ms === undefined || ms === null) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const hopStatusColor = (code: number): string => {
    if (code >= 200 && code < 300) {
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700';
    }
    if (code >= 300 && code < 400) {
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700';
    }
    if (code >= 400) {
        return 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700';
    }
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600';
};

const PROBE_DEBOUNCE_MS = 650;
const PROBE_SERVER_TIMEOUT_MS = 12000;
const PROBE_BROWSER_TIMEOUT_MS = 8000;
const PROBE_WATCHDOG_MS = 15000;
const PROBE_CACHE_TTL_MS = 120_000;

type ProbePhase = 'idle' | 'checking' | 'done' | 'error';

type ProbeSnapshot = {
    phase: ProbePhase;
    browserPhase: ProbePhase;
    scheme: string;
    httpCode: number | null;
    latency: number | null;
    browserLatency: number | null;
    redirectCount: number;
    redirectChain: LinkRedirectHop[];
    healthStatus: string;
    error: string;
    cachedAt: number;
};

const probeCache = new Map<string, ProbeSnapshot>();

function probeCacheKey(trimmed: string, excluded?: boolean): string {
    return `${excluded ? '1' : '0'}:${trimmed}`;
}

function settleServerProbeError(
    started: number,
    message: string,
    status: 'timeout' | 'broken' = 'timeout'
) {
    return {
        httpCode: null as number | null,
        latency: Math.round(performance.now() - started),
        redirectCount: 0,
        redirectChain: [] as LinkRedirectHop[],
        healthStatus: status,
        error: message,
        phase: 'error' as const,
    };
}

const UrlProbeBadgesInner: React.FC<{ url: string; excluded?: boolean }> = ({ url, excluded }) => {
    const trimmedUrl = (url || '').trim();
    const diagnosis = useMemo(() => diagnoseLinkUrl(url), [url]);
    const blocking = hasBlockingUrlIssues(diagnosis);
    const [phase, setPhase] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
    const [scheme, setScheme] = useState<string>('');
    const [httpCode, setHttpCode] = useState<number | null>(null);
    const [latency, setLatency] = useState<number | null>(null);
    const [browserLatency, setBrowserLatency] = useState<number | null>(null);
    const [browserPhase, setBrowserPhase] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
    const [redirectCount, setRedirectCount] = useState(0);
    const [redirectChain, setRedirectChain] = useState<LinkRedirectHop[]>([]);
    const [chainOpen, setChainOpen] = useState(false);
    const [sslOpen, setSslOpen] = useState(false);
    const [whoisOpen, setWhoisOpen] = useState(false);
    const [healthStatus, setHealthStatus] = useState<string>('');
    const [error, setError] = useState<string>('');
    const abortRef = useRef<AbortController | null>(null);
    const browserAbortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        const trimmed = trimmedUrl;
        abortRef.current?.abort();
        abortRef.current = null;
        browserAbortRef.current?.abort();
        browserAbortRef.current = null;

        const blockingNow = hasBlockingUrlIssues(diagnoseLinkUrl(trimmed));

        if (excluded || blockingNow || !isProbableUrl(trimmed)) {
            setPhase('idle');
            setBrowserPhase('idle');
            setScheme('');
            setHttpCode(null);
            setLatency(null);
            setBrowserLatency(null);
            setRedirectCount(0);
            setRedirectChain([]);
            setChainOpen(false);
            setHealthStatus('');
            setError('');
            return;
        }

        const cacheKey = probeCacheKey(trimmed, excluded);
        const cached = probeCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < PROBE_CACHE_TTL_MS) {
            setPhase(cached.phase);
            setBrowserPhase(cached.browserPhase);
            setScheme(cached.scheme);
            setHttpCode(cached.httpCode);
            setLatency(cached.latency);
            setBrowserLatency(cached.browserLatency);
            setRedirectCount(cached.redirectCount);
            setRedirectChain(cached.redirectChain);
            setHealthStatus(cached.healthStatus);
            setError(cached.error);
            return;
        }

        const detectedScheme = /^http:\/\//i.test(trimmed)
            ? 'http'
            : /^https:\/\//i.test(trimmed)
                ? 'https'
                : '';
        if (!detectedScheme) {
            setPhase('idle');
            setBrowserPhase('idle');
            return;
        }
        setScheme(detectedScheme);
        setPhase('checking');
        setBrowserPhase('checking');
        setError('');
        setRedirectCount(0);
        setRedirectChain([]);
        setChainOpen(false);
        setBrowserLatency(null);

        const requestId = ++requestIdRef.current;

        const finishBrowserProbe = (started: number) => {
            if (requestId !== requestIdRef.current) return;
            setBrowserLatency(Math.round(performance.now() - started));
            setBrowserPhase('done');
        };

        const timer = window.setTimeout(async () => {
            const controller = new AbortController();
            abortRef.current = controller;
            const serverTimeout = window.setTimeout(() => controller.abort(), PROBE_SERVER_TIMEOUT_MS);
            const started = performance.now();
            try {
                const result = await linkHealthService.checkUrl(trimmed, controller.signal);
                if (requestId !== requestIdRef.current) return;
                const roundTrip = Math.round(performance.now() - started);
                setScheme(result.scheme || detectedScheme);
                setHttpCode(result.health.httpCode ?? null);
                setLatency(result.health.serverLatency ?? roundTrip);
                setRedirectCount(typeof result.health.redirectCount === 'number' ? result.health.redirectCount : 0);
                setRedirectChain(Array.isArray(result.health.redirectChain) ? result.health.redirectChain : []);
                setHealthStatus(result.health.status || '');
                setError(result.health.error || '');
                setPhase('done');
                probeCache.set(cacheKey, {
                    phase: 'done',
                    browserPhase: 'checking',
                    scheme: result.scheme || detectedScheme,
                    httpCode: result.health.httpCode ?? null,
                    latency: result.health.serverLatency ?? roundTrip,
                    browserLatency: null,
                    redirectCount: typeof result.health.redirectCount === 'number' ? result.health.redirectCount : 0,
                    redirectChain: Array.isArray(result.health.redirectChain) ? result.health.redirectChain : [],
                    healthStatus: result.health.status || '',
                    error: result.health.error || '',
                    cachedAt: Date.now(),
                });
            } catch (err: any) {
                if (requestId !== requestIdRef.current) return;
                const settled = err?.name === 'AbortError'
                    ? settleServerProbeError(started, 'Server probe timed out', 'timeout')
                    : settleServerProbeError(started, err?.message || 'Check failed', 'broken');
                setHttpCode(settled.httpCode);
                setLatency(settled.latency);
                setRedirectCount(settled.redirectCount);
                setRedirectChain(settled.redirectChain);
                setHealthStatus(settled.healthStatus);
                setError(settled.error);
                setPhase(settled.phase);
                probeCache.set(cacheKey, {
                    phase: settled.phase,
                    browserPhase: 'checking',
                    scheme: detectedScheme,
                    httpCode: settled.httpCode,
                    latency: settled.latency,
                    browserLatency: null,
                    redirectCount: settled.redirectCount,
                    redirectChain: settled.redirectChain,
                    healthStatus: settled.healthStatus,
                    error: settled.error,
                    cachedAt: Date.now(),
                });
            } finally {
                window.clearTimeout(serverTimeout);
            }
        }, PROBE_DEBOUNCE_MS);

        // Browser → URL RTT (direct from this device). Prefer HEAD so we don't download the page body.
        // no-cors: we only need timing, not status. cors mode spams the console on SSO/login
        // hosts (e.g. Workday 302) that omit Access-Control-Allow-Origin.
        let browserCancelled = false;
        const browserTimer = window.setTimeout(async () => {
            const controller = new AbortController();
            browserAbortRef.current = controller;
            const browserTimeout = window.setTimeout(() => controller.abort(), PROBE_BROWSER_TIMEOUT_MS);
            const started = performance.now();
            try {
                await fetch(trimmed, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store',
                    credentials: 'omit',
                    redirect: 'follow',
                    signal: controller.signal,
                });
            } catch {
                // Network / timeout — still record browser path timing below.
            } finally {
                window.clearTimeout(browserTimeout);
                if (!browserCancelled) {
                    finishBrowserProbe(started);
                }
            }
        }, PROBE_DEBOUNCE_MS);

        const watchdog = window.setTimeout(() => {
            if (requestId !== requestIdRef.current) return;
            setPhase((prev) => {
                if (prev !== 'checking') return prev;
                setHealthStatus('timeout');
                setError('Probe timed out');
                return 'error';
            });
            setBrowserPhase((prev) => (prev === 'checking' ? 'done' : prev));
        }, PROBE_WATCHDOG_MS);

        return () => {
            browserCancelled = true;
            window.clearTimeout(timer);
            window.clearTimeout(browserTimer);
            window.clearTimeout(watchdog);
            abortRef.current?.abort();
            browserAbortRef.current?.abort();
        };
    }, [trimmedUrl, excluded]);

    useEffect(() => {
        if (phase === 'checking' || browserPhase === 'checking') return;
        if (excluded || blocking || !isProbableUrl(trimmedUrl)) return;
        probeCache.set(probeCacheKey(trimmedUrl, excluded), {
            phase,
            browserPhase,
            scheme,
            httpCode,
            latency,
            browserLatency,
            redirectCount,
            redirectChain,
            healthStatus,
            error,
            cachedAt: Date.now(),
        });
    }, [
        phase,
        browserPhase,
        scheme,
        httpCode,
        latency,
        browserLatency,
        redirectCount,
        redirectChain,
        healthStatus,
        error,
        trimmedUrl,
        excluded,
        blocking,
    ]);

    useEffect(() => {
        if (!chainOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setChainOpen(false);
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [chainOpen]);

    if (excluded) {
        return (
            <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600"
                title="This URL is on Link Check Exceptions. Check Links will skip it and will not mark it Broken."
                role="status"
            >
                <span aria-hidden>🚫</span>
                Ignored
            </span>
        );
    }

    if (blocking) {
        const errorCount = diagnosis.issues.filter((item) => item.severity === 'error').length;
        return <UrlNeedsFixBadge count={errorCount} />;
    }

    if (phase === 'idle') return null;

    const codeColor =
        httpCode && httpCode >= 200 && httpCode < 300
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700'
            : httpCode && httpCode >= 300 && httpCode < 400
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700'
                : httpCode
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700'
                    : healthStatus === 'timeout'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700'
                        : healthStatus === 'network'
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600';

    const latencyBadgeClass = (ms: number | null) =>
        ms !== null && ms < 300
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700'
            : ms !== null && ms < 1000
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700';

    const latencyColor = latencyBadgeClass(latency);
    const browserLatencyColor = latencyBadgeClass(browserLatency);

    const schemeUpper = (scheme || 'https').toUpperCase();
    const statusLabel =
        phase === 'checking'
            ? 'Checking…'
            : httpCode
                ? String(httpCode)
                : healthStatus === 'timeout'
                    ? 'Timeout'
                    : healthStatus === 'network'
                        ? 'Unreachable'
                        : error
                            ? 'Error'
                            : '—';

    const showRedirectBadge = redirectCount > 0 || redirectChain.length > 1;
    const hopCountLabel = redirectCount > 0 ? redirectCount : Math.max(0, redirectChain.length - 1);

    const exportRedirectChainJson = () => {
        if (redirectChain.length === 0) return;
        const payload = {
            url,
            scheme: scheme || undefined,
            status: healthStatus || undefined,
            httpCode: httpCode ?? null,
            redirectCount,
            error: error || null,
            serverLatencyMs: latency,
            browserLatencyMs: browserLatency,
            exportedAt: new Date().toISOString(),
            hops: redirectChain.map((hop, idx) => ({
                hop: idx + 1,
                step: hop.step,
                url: hop.url,
                httpCode: hop.httpCode,
                ...(hop.location ? { location: hop.location } : {}),
                ...(hop.error ? { error: hop.error } : {}),
                final: idx === redirectChain.length - 1
            }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const host = (() => {
            try {
                return new URL(url).hostname.replace(/[^\w.-]+/g, '_') || 'redirect-chain';
            } catch {
                return 'redirect-chain';
            }
        })();
        a.href = objectUrl;
        a.download = `redirect-chain-${host}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
    };

    const chainDialog =
        chainOpen &&
        redirectChain.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                className="fixed inset-0 z-[100080] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                onClick={() => setChainOpen(false)}
                role="presentation"
            >
                <div
                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl max-h-[85vh] flex flex-col"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="redirect-chain-dialog-title"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                            <h3
                                id="redirect-chain-dialog-title"
                                className="text-base font-bold text-slate-900 dark:text-white"
                            >
                                Redirect chain
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {redirectChain.length} hop{redirectChain.length === 1 ? '' : 's'}
                                {error ? ` Â· ${error}` : ''}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setChainOpen(false)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
                            aria-label="Close redirect chain"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
                        <ol className="space-y-2">
                            {redirectChain.map((hop, idx) => {
                                const isLast = idx === redirectChain.length - 1;
                                return (
                                    <li key={`${hop.step}-${hop.url}`} className="flex gap-3 items-start">
                                        <div className="flex flex-col items-center pt-1 shrink-0 w-6">
                                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 text-center leading-none">
                                                {idx + 1}
                                            </span>
                                            {!isLast && (
                                                <span className="mt-1 text-slate-300 dark:text-slate-600 text-sm leading-none" aria-hidden>
                                                    ↓
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 px-3 py-2.5">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span
                                                    className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${hopStatusColor(hop.httpCode)}`}
                                                >
                                                    {hop.httpCode > 0 ? `HTTP ${hop.httpCode}` : 'No response'}
                                                </span>
                                                {isLast && (
                                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        Final
                                                    </span>
                                                )}
                                                {hop.error && (
                                                    <span className="text-[11px] text-rose-600 dark:text-rose-400" title={hop.error}>
                                                        {hop.error}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-800 dark:text-slate-100 break-all leading-relaxed" title={hop.url}>
                                                {hop.url}
                                            </p>
                                            {hop.location && !isLast && (
                                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 break-all" title={hop.location}>
                                                    → {hop.location}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                    <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-end gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={exportRedirectChainJson}
                            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                            Export as JSON
                        </button>
                        <button
                            type="button"
                            onClick={() => setChainOpen(false)}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {phase === 'checking' && browserPhase === 'checking' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700 animate-pulse">
                    <span aria-hidden>⏳</span> Checking…
                </span>
            ) : (
                <>
                    {(phase === 'done' || phase === 'error' || latency !== null) && (
                        <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${latencyColor}`}
                            title="Server RTT — LinkNest server probe latency to this URL"
                        >
                            <span aria-hidden>⚡</span>
                            RTT {formatProbeLatency(latency) || '—'}
                        </span>
                    )}
                    {(browserPhase === 'done' || browserPhase === 'error' || browserLatency !== null) && (
                        <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${browserLatencyColor}`}
                            title="Browser RTT — latency from your browser to this URL"
                        >
                            <span aria-hidden>🌐</span>
                            Browser {formatProbeLatency(browserLatency) || '—'}
                        </span>
                    )}
                    {browserPhase === 'checking' && phase !== 'checking' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700 animate-pulse">
                            <span aria-hidden>🌐</span> Browser…
                        </span>
                    )}
                    {phase === 'checking' && browserPhase !== 'checking' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700 animate-pulse">
                            <span aria-hidden>⚡</span> Server…
                        </span>
                    )}
                    {(phase === 'done' || phase === 'error') && (
                    <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${codeColor}`}
                        title={`${schemeUpper} status code${error ? `: ${error}` : ''}`}
                    >
                        <span aria-hidden>{scheme === 'http' ? '🔓' : '🔒'}</span>
                        {schemeUpper} {statusLabel}
                    </span>
                    )}
                    {showRedirectBadge && (
                        <button
                            type="button"
                            onClick={() => setChainOpen(true)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700 hover:bg-sky-200/80 dark:hover:bg-sky-800/60 cursor-pointer"
                            title={
                                redirectChain.length > 0
                                    ? 'Click to view the full redirect chain'
                                    : `Followed ${hopCountLabel} redirect${hopCountLabel === 1 ? '' : 's'} before the final status`
                            }
                            aria-haspopup="dialog"
                        >
                            <span aria-hidden>↪️</span>
                            {hopCountLabel} redirect{hopCountLabel === 1 ? '' : 's'}
                        </button>
                    )}
                </>
            )}
            {(scheme === 'http' || scheme === 'https' || isHttpOrHttpsUrl((url || '').trim())) && (
                <>
                    <button
                        type="button"
                        onClick={() => setSslOpen(true)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200 border-violet-200 dark:border-violet-700 hover:bg-violet-200/80 dark:hover:bg-violet-800/60 cursor-pointer"
                        title="Open SSL URL checker for this link (on demand)"
                        aria-haspopup="dialog"
                    >
                        <span aria-hidden>🔐</span>
                        SSL
                    </button>
                    <button
                        type="button"
                        onClick={() => setWhoisOpen(true)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-200/80 dark:hover:bg-emerald-800/60 cursor-pointer"
                        title="Look up domain ownership (WHOIS / RDAP) on demand"
                        aria-haspopup="dialog"
                    >
                        <span aria-hidden>🏢</span>
                        WHOIS
                    </button>
                </>
            )}
            {chainDialog}
            {sslOpen && (
                <Suspense fallback={null}>
                    <SslCheckerDialog
                        isOpen={sslOpen}
                        onClose={() => setSslOpen(false)}
                        url={(url || '').trim()}
                    />
                </Suspense>
            )}
            {whoisOpen && (
                <Suspense fallback={null}>
                    <WhoisDialog
                        isOpen={whoisOpen}
                        onClose={() => setWhoisOpen(false)}
                        url={(url || '').trim()}
                    />
                </Suspense>
            )}
        </div>
    );
};

export const UrlProbeBadges = memo(
    UrlProbeBadgesInner,
    (prev, next) =>
        (prev.url || '').trim() === (next.url || '').trim() &&
        !!prev.excluded === !!next.excluded
);
