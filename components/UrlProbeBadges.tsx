import React, { useState, useEffect, useRef, useMemo, lazy, Suspense, memo } from 'react';
import { LinkRedirectHop, UrlSafetyResult } from '../types';
import { linkHealthService } from '../services/linkHealthService';
import {
    formatSafetyConfirmMessage,
    safetyRequiresConfirm,
    urlSafetyService,
    type UrlSafetyCheckResult,
} from '../services/urlSafetyService';
import { isHttpOrHttpsUrl } from '../utils/urlDisplay';
import { diagnoseLinkUrl, hasBlockingUrlIssues } from '../utils/urlDiagnostics';
import { urlForHealthProbe } from '../utils/redirectChain';
import { UrlNeedsFixBadge } from './UrlFormDiagnostics';
import { RedirectChainDialog } from './RedirectChainDialog';
import { useSettings } from '../contexts/SettingsContext';

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

const PROBE_DEBOUNCE_MS = 650;
const PROBE_SERVER_TIMEOUT_MS = 12000;
const PROBE_BROWSER_TIMEOUT_MS = 8000;
const PROBE_WATCHDOG_MS = 15000;
const PROBE_CACHE_TTL_MS = 120_000;
const SAFETY_CACHE_TTL_MS = 180_000;

type ProbePhase = 'idle' | 'checking' | 'done' | 'error';

const safetyCache = new Map<string, { result: UrlSafetyCheckResult; cachedAt: number }>();

function toSafetyResult(check: UrlSafetyCheckResult): UrlSafetyResult {
    const flag = check.flags?.find((f) => f.category === 'malware' || f.category === 'phishing' || f.category === 'adult');
    return {
        verdict: check.verdict,
        flags: check.flags || [],
        listsReady: check.lists_ready,
        listsPending: check.lists_pending,
        requiresConfirm: safetyRequiresConfirm(check),
        blockMalicious: !!check.blockMalicious,
        host: check.host,
        matchedDomain: flag?.matchedDomain || check.matched?.domain,
        sourceLabel: flag?.sourceLabel || flag?.source,
    };
}

function safetyBadgeMeta(verdict: string): { label: string; className: string; title: string; icon: string } | null {
    switch (verdict) {
        case 'malicious':
            return {
                label: 'Malicious',
                icon: '☠️',
                className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-300 dark:border-rose-700',
                title: 'Listed on a malware / phishing threat intelligence feed',
            };
        case 'adult':
            return {
                label: 'Adult',
                icon: '🔞',
                className: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/50 dark:text-fuchsia-200 border-fuchsia-300 dark:border-fuchsia-700',
                title: 'Listed on an adult / NSFW domain blocklist',
            };
        case 'suspicious':
            return {
                label: 'Suspicious',
                icon: '⚠️',
                className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200 border-amber-300 dark:border-amber-700',
                title: 'Local heuristics flagged anomalies on this URL',
            };
        case 'safe':
            return {
                label: 'Safe',
                icon: '🛡️',
                className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700',
                title: 'Not found on threat or adult lists',
            };
        default:
            return null;
    }
}

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

export type UrlProbeFieldStatus = 'idle' | 'ok' | 'error';

/** True when the HTTPS/HTTP status badge represents a failure the user should notice. */
export function probeIndicatesError(opts: {
    phase: ProbePhase;
    httpCode: number | null;
    healthStatus: string;
    error: string;
}): boolean {
    const { phase, httpCode, healthStatus, error } = opts;
    if (phase !== 'done' && phase !== 'error') return false;
    if (httpCode != null && httpCode >= 400) return true;
    if (phase === 'error') return true;
    if (healthStatus === 'timeout' || healthStatus === 'network' || healthStatus === 'broken') return true;
    if (!httpCode && !!error) return true;
    return false;
}

/** True when the URL is reachable — 2xx success or 3xx redirect both count. */
export function probeIndicatesReachable(opts: {
    phase: ProbePhase;
    httpCode: number | null;
}): boolean {
    const { phase, httpCode } = opts;
    if (phase !== 'done' && phase !== 'error') return false;
    return httpCode != null && httpCode >= 200 && httpCode < 400;
}

export function probeFieldStatus(opts: {
    excluded?: boolean;
    blocking?: boolean;
    phase: ProbePhase;
    httpCode: number | null;
    healthStatus: string;
    error: string;
}): UrlProbeFieldStatus {
    if (opts.excluded || opts.blocking) return 'idle';
    if (probeIndicatesError(opts)) return 'error';
    if (probeIndicatesReachable(opts)) return 'ok';
    return 'idle';
}

export type UrlProbeBadgesProps = {
    url: string;
    excluded?: boolean;
    onAdoptUrl?: (url: string) => void;
    onSafetyResult?: (result: UrlSafetyResult | null) => void;
    /** idle while checking, ok when reachable (including redirects), error on 4xx/5xx/timeout/unreachable. */
    onProbeStatus?: (status: UrlProbeFieldStatus) => void;
};

const UrlProbeBadgesInner: React.FC<UrlProbeBadgesProps> = ({
    url,
    excluded,
    onAdoptUrl,
    onSafetyResult,
    onProbeStatus,
}) => {
    const { settings } = useSettings();
    const safetyEnabled = settings.url_safety_enabled !== '0';
    const trimmedUrl = (url || '').trim();
    const diagnosis = useMemo(() => diagnoseLinkUrl(url), [url]);
    const blocking = hasBlockingUrlIssues(diagnosis);
    const onAdoptUrlRef = useRef(onAdoptUrl);
    onAdoptUrlRef.current = onAdoptUrl;
    const onSafetyResultRef = useRef(onSafetyResult);
    onSafetyResultRef.current = onSafetyResult;
    const onProbeStatusRef = useRef(onProbeStatus);
    onProbeStatusRef.current = onProbeStatus;
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
    const [sslTargetUrl, setSslTargetUrl] = useState('');
    const [whoisOpen, setWhoisOpen] = useState(false);
    const [healthStatus, setHealthStatus] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [safetyPhase, setSafetyPhase] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
    const [safetyResult, setSafetyResult] = useState<UrlSafetyCheckResult | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const browserAbortRef = useRef<AbortController | null>(null);
    const safetyAbortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);
    const safetyRequestIdRef = useRef(0);

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

        // Probe the cleaned target (Teams/SharePoint tracking stripped) so long paste URLs still get badges.
        const probeUrl = urlForHealthProbe(trimmed);
        const cacheKey = probeCacheKey(probeUrl, excluded);
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

        const detectedScheme = /^http:\/\//i.test(probeUrl)
            ? 'http'
            : /^https:\/\//i.test(probeUrl)
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
                const result = await linkHealthService.checkUrl(probeUrl, controller.signal);
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
                await fetch(probeUrl, {
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

    // URL Safety Intelligence — independent of reachability (works when firewall blocks the host).
    useEffect(() => {
        safetyAbortRef.current?.abort();
        safetyAbortRef.current = null;

        const blockingNow = hasBlockingUrlIssues(diagnoseLinkUrl(trimmedUrl));
        if (!safetyEnabled || excluded || blockingNow || !isProbableUrl(trimmedUrl)) {
            setSafetyPhase('idle');
            setSafetyResult(null);
            onSafetyResultRef.current?.(null);
            return;
        }

        const cached = safetyCache.get(trimmedUrl);
        if (cached && Date.now() - cached.cachedAt < SAFETY_CACHE_TTL_MS) {
            setSafetyResult(cached.result);
            setSafetyPhase('done');
            onSafetyResultRef.current?.(toSafetyResult(cached.result));
            return;
        }

        const requestId = ++safetyRequestIdRef.current;
        setSafetyPhase('checking');
        const controller = new AbortController();
        safetyAbortRef.current = controller;

        const timer = window.setTimeout(async () => {
            try {
                const result = await urlSafetyService.checkUrl(trimmedUrl, controller.signal);
                if (requestId !== safetyRequestIdRef.current) return;
                safetyCache.set(trimmedUrl, { result, cachedAt: Date.now() });
                setSafetyResult(result);
                setSafetyPhase('done');
                onSafetyResultRef.current?.(toSafetyResult(result));
            } catch (e) {
                if (requestId !== safetyRequestIdRef.current) return;
                if ((e as Error)?.name === 'AbortError') return;
                setSafetyPhase('error');
                setSafetyResult(null);
                onSafetyResultRef.current?.(null);
            }
        }, PROBE_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
            safetyAbortRef.current?.abort();
        };
    }, [trimmedUrl, excluded, safetyEnabled]);

    useEffect(() => {
        if (phase === 'checking' || browserPhase === 'checking') return;
        if (excluded || blocking || !isProbableUrl(trimmedUrl)) return;
        probeCache.set(probeCacheKey(urlForHealthProbe(trimmedUrl), excluded), {
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

    const hasProbeError =
        !excluded &&
        !blocking &&
        probeIndicatesError({ phase, httpCode, healthStatus, error });
    const fieldStatus = probeFieldStatus({
        excluded,
        blocking,
        phase,
        httpCode,
        healthStatus,
        error,
    });

    useEffect(() => {
        onProbeStatusRef.current?.(fieldStatus);
    }, [fieldStatus]);

    useEffect(() => {
        return () => {
            onProbeStatusRef.current?.('idle');
        };
    }, []);

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

    if (phase === 'idle' && safetyPhase === 'idle') return null;

    const codeColor =
        httpCode && httpCode >= 200 && httpCode < 400
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700'
            : httpCode || (hasProbeError && healthStatus !== 'timeout')
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

    const openSslFor = (target: string) => {
        setSslTargetUrl(target);
        setSslOpen(true);
    };

    const chainDialog =
        chainOpen && redirectChain.length > 0 ? (
            <RedirectChainDialog
                originalUrl={trimmedUrl}
                hops={redirectChain}
                error={error}
                serverLatencyMs={latency}
                browserLatencyMs={browserLatency}
                onClose={() => setChainOpen(false)}
                onAdoptUrl={onAdoptUrlRef.current ? (next) => onAdoptUrlRef.current?.(next) : undefined}
                onCheckSsl={openSslFor}
            />
        ) : null;

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
                        onClick={() => openSslFor((url || '').trim())}
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
            {safetyEnabled && safetyPhase === 'checking' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700 animate-pulse">
                    <span aria-hidden>🛡️</span> Safety…
                </span>
            )}
            {safetyEnabled && safetyPhase === 'done' && safetyResult && (() => {
                const meta = safetyBadgeMeta(safetyResult.verdict);
                if (!meta) return null;
                const extra =
                    safetyRequiresConfirm(safetyResult)
                        ? ` — ${formatSafetyConfirmMessage(safetyResult)}`
                        : safetyResult.flags?.[0]?.detail
                          ? ` — ${safetyResult.flags[0].detail}`
                          : '';
                return (
                    <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.className}`}
                        title={`${meta.title}${extra}`}
                        role="status"
                    >
                        <span aria-hidden>{meta.icon}</span>
                        {meta.label}
                    </span>
                );
            })()}
            {chainDialog}
            {sslOpen && (
                <Suspense fallback={null}>
                    <SslCheckerDialog
                        isOpen={sslOpen}
                        onClose={() => setSslOpen(false)}
                        url={sslTargetUrl || (url || '').trim()}
                        overlayClassName="z-[100090]"
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
        !!prev.excluded === !!next.excluded &&
        prev.onSafetyResult === next.onSafetyResult &&
        prev.onProbeStatus === next.onProbeStatus
);
