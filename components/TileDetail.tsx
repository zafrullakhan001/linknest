import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Tile, Link, LinkSection, Tab, LinkVisibility, TileVisibility, COLOR_STYLES, THEME_COLORS, ThemeColor, TileMessage, AccessRestrictions, LinkRedirectHop } from '../types';
import { linkHealthService, LinkHealthMap } from '../services/linkHealthService';
import { performanceAnalyticsService, type AnalyticsMetric } from '../services/performanceAnalyticsService';
import { authService, UserListItem, User } from '../services/authService';
import { exportTileToFileAsync } from '../services/spaceTransferService';
import {
    exportSectionLinksToFile,
    exportTabToFile,
    parseSectionLinksExport,
    parseTabExport
} from '../services/sectionTabTransferService';
import { cloneTile, createTile, getTiles, saveTile, toggleLinkFavorite, createTempVersion, updateTilePageAnimation, recordTileVisit } from '../services/storageService';
import { generateUuid } from '../services/idService';
import { removeSharedTile } from '../services/tileShareService';
import { useSettings } from '../contexts/SettingsContext';
import { useAccessRestrictionGate } from '../contexts/AccessRestrictionContext';
import { hasAccessRestrictions } from '../services/accessRestrictionService';
import { AccessRestrictionsEditor, AccessRestrictionsBadge } from './AccessRestrictionsEditor';
import { ShortUrlActions } from './ShortUrlActions';
import { isEscapeDialogOpen, useEscapeToClose } from '../hooks/useEscapeToClose';
import { SelectableRichTextEditor } from './SelectableRichTextEditor';
import { LinkLabelField } from './LinkLabelField';
import { RichTextContentItem, type RichTextContentItemHandle } from './RichTextContentItem';
import { RichTextBoxedView } from './RichTextBoxedView';
import {
    RichTextBoxOptionsFields,
    buildBoxMetaFromFields,
    DEFAULT_HEADER_BG,
    DEFAULT_FOOTER_BG,
    DEFAULT_BODY_BG,
    type RichTextBoxMeta,
    type BoxFontWeight,
    type BoxFontSize,
    type BoxImportance,
} from './RichTextBoxOptionsFields';
import type { BoxAlign } from './RichTextBoxedView';
import { RichTextContent } from '../types';
import { isPublicLinkFavorite, togglePublicLinkFavorite, upsertPublicLinkFavoriteDetail, removePublicLinkFavoriteDetail } from '../services/publicFavoritesService';
import { LinkInfoDialog } from './LinkInfoDialog';
import { LinkMaintenanceDialog } from './LinkMaintenanceDialog';
import { LinkMaintenanceVideoField } from './LinkMaintenanceVideoField';
import { LinkMaintenanceBadge } from './LinkMaintenanceBadge';
import { isLinkInMaintenance } from '../utils/linkMaintenance';
import { hasVisibleRichText, looksLikeHtml, plainNotesToHtml, prepareViewerHtml } from '../utils/richTextDisplay';
import { isInfoContentEnabled, isNotesTooltipEnabled, linkHoverTitle, shouldOpenInfoDialog, shouldShowLinkNotes } from '../utils/linkFeatureToggles';
import { LinkNotesDialog } from './LinkNotesDialog';
import { QRCodeDialog } from './QRCodeDialog';
import { MobilePreviewDialog } from './MobilePreviewDialog';
import { BrandedQRCode } from './BrandedQRCode';
import { TitleEmojiPicker } from './TitleEmojiPicker';
import { EmojiPickerPanel } from './EmojiPickerPanel';
import { MobileTileEdit } from './MobileTileEdit';
import { useMobile } from '../hooks/useMobile';
import {
    HierarchyExpandControls,
    HierarchyViewSwitcher,
    TileHierarchyViews,
    readHierarchyViewPreference,
    writeHierarchyViewPreference,
    readTileEditExpandPreference,
    writeTileEditExpandPreference,
    type HierarchyViewMode,
} from './TileHierarchyViews';
import { VersionDiffViewer } from './VersionDiffViewer';
import { TileAnimationSelector, getTileAnimationClass, TileAnimation, getAnimationOption, resolveLinkAnimation } from './TileAnimationSelector';
import { AuthSourceBadge } from './AuthSourceBadge';
import { getDisplayUrl, isHttpOrHttpsUrl, normalizeStoredLinkUrl, rewriteHtmlAnchorHrefs, viewerLinkDisplay, viewerLinkUrl, effectiveShowShortUrls } from '../utils/urlDisplay';
import { tryHandleSshLinkClick, isSshLinkUrl } from '../utils/sshLink';
import { tryHandleVncLinkClick, isVncLinkUrl } from '../utils/vncLink';
import { printQrView } from '../utils/printQrView';
import { rolesService, LINK_ACTION_IDS, type LinkActionId } from '../services/rolesService';

const SslCheckerDialog = lazy(() => import('./ssl/SslCheckerDialog'));
const WhoisDialog = lazy(() => import('./ssl/WhoisDialog'));

type ViewLayoutMode = 'stacked' | 'side-by-side' | 'grid' | 'compact' | 'qr';

const isViewLayoutMode = (value: string | null | undefined): value is ViewLayoutMode =>
    value === 'stacked' || value === 'side-by-side' || value === 'grid' || value === 'compact' || value === 'qr';

const sectionLinkLayoutsStorageKey = (tileId: string) => `linknest_section_link_layouts_${tileId}`;
const GENERAL_SETTINGS_EXPANDED_KEY = 'linknest_edit_general_settings_expanded';

const readGeneralSettingsExpanded = (): boolean => {
    try {
        const saved = localStorage.getItem(GENERAL_SETTINGS_EXPANDED_KEY);
        if (saved === '0') return false;
        if (saved === '1') return true;
    } catch {
        /* ignore quota / private mode */
    }
    return true;
};

const loadSectionLinkLayouts = (tileId: string): Record<string, ViewLayoutMode> => {
    try {
        const raw = localStorage.getItem(sectionLinkLayoutsStorageKey(tileId));
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const result: Record<string, ViewLayoutMode> = {};
        Object.entries(parsed).forEach(([sectionId, layout]) => {
            if (typeof layout === 'string' && isViewLayoutMode(layout)) {
                result[sectionId] = layout;
            }
        });
        return result;
    } catch {
        return {};
    }
};

/** Persist link animation: inherit/empty → omit; 'none' and others → store as-is. */
const linkAnimationForSave = (animation?: string): string | undefined => {
    if (!animation || animation === 'inherit') return undefined;
    return animation;
};

/** UI value for link animation picker (missing → inherit space default). */
const linkAnimationForEdit = (animation?: string): TileAnimation =>
    (animation as TileAnimation) || 'inherit';

// Resolve API base dynamically
function resolveApiBase(): string {
    const envBase = (import.meta as any)?.env?.VITE_API_BASE;
    if (envBase) {
        return envBase;
    }

    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '';
        if (path !== '/' && path.length > 1) {
            const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
            if (cleanPath && cleanPath !== '/') {
                return `${cleanPath}/api`;
            }
        }
    }

    return '/api';
}

function getTileHashParts(): { path: string; params: URLSearchParams } | null {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash || '';
    const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!withoutHash.startsWith('/tile/')) return null;
    const q = withoutHash.indexOf('?');
    const path = q === -1 ? withoutHash : withoutHash.slice(0, q);
    const params = new URLSearchParams(q === -1 ? '' : withoutHash.slice(q + 1));
    return { path, params };
}

function getTabParamFromHash(): string | null {
    const tab = getTileHashParts()?.params.get('tab');
    return tab && tab.trim() ? tab.trim() : null;
}

function getSectionParamFromHash(): string | null {
    const section = getTileHashParts()?.params.get('section');
    return section && section.trim() ? section.trim() : null;
}

function slugifyTabTitle(title: string): string {
    return (title || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function resolveTabId(tabs: Tab[], candidate: string | null | undefined): string | null {
    if (!candidate || !tabs.length) return null;
    const trimmed = candidate.trim();
    if (tabs.some(t => t.id === trimmed)) return trimmed;
    const slug = trimmed.toLowerCase();
    const bySlug = tabs.find(t => slugifyTabTitle(t.title) === slug);
    return bySlug?.id ?? null;
}

function tabParamFor(tab: Tab, allTabs: Tab[]): string {
    const slug = slugifyTabTitle(tab.title);
    if (slug) {
        const clashes = allTabs.filter(t => slugifyTabTitle(t.title) === slug);
        if (clashes.length <= 1) return slug;
    }
    return tab.id;
}

function writeTileHashTab(tabParam: string, mode: 'push' | 'replace', sectionId?: string | null): void {
    const parts = getTileHashParts();
    if (!parts) return;
    parts.params.set('tab', tabParam);
    if (sectionId === undefined) {
        // keep existing section
    } else if (sectionId) {
        parts.params.set('section', sectionId);
    } else {
        parts.params.delete('section');
    }
    const qs = parts.params.toString();
    const nextHash = qs ? `#${parts.path}?${qs}` : `#${parts.path}`;
    if (window.location.hash === nextHash) return;
    if (mode === 'replace') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
        return;
    }
    window.location.hash = nextHash;
}

function getEditParamFromHash(): boolean {
    const raw = getTileHashParts()?.params.get('edit');
    if (!raw) return false;
    const v = raw.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function writeTileHashEdit(editing: boolean): void {
    const parts = getTileHashParts();
    if (!parts) return;
    if (editing) {
        parts.params.set('edit', '1');
    } else {
        parts.params.delete('edit');
    }
    const qs = parts.params.toString();
    const nextHash = qs ? `#${parts.path}?${qs}` : `#${parts.path}`;
    if (window.location.hash === nextHash) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
}

interface TileVersion {
    id: number;
    version_number: number;
    created_at: number;
    user_id: number;
    username: string;
    changelog_summary: string | null;
    is_locked: boolean;
    tags?: string[] | null;
    comments?: string | null;
}

interface TileDetailProps {
    tile: Tile;
    allTiles: Tile[];
    onUpdateTiles: (tiles: Tile[], skipReload?: boolean, isFinal?: boolean, localOnly?: boolean) => void;
    isAuthenticated?: boolean;
    onAuthRequired?: () => void;
    sourceTab?: 'public' | 'your-apps' | 'staging' | 'private' | 'favorites' | 'public-favorites' | null;
    user?: User | null;
}
// Enhanced emoji categories with more emojis
const EmojiPickerTabs: React.FC<{
    linkId: string;
    editLinkState: any;
    updateEditLinkState: (linkId: string, field: string, value: any) => void;
    setShowLinkEmojiPicker: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ linkId, editLinkState, updateEditLinkState, setShowLinkEmojiPicker }) => {
    return (
        <EmojiPickerPanel
            currentValue={editLinkState?.icon || ''}
            onSelect={(emoji) => {
                updateEditLinkState(linkId, 'icon', emoji);
                setShowLinkEmojiPicker(prev => ({ ...prev, [linkId]: false }));
            }}
        />
    );
};

const LINK_EDIT_SECTION_ACCENTS = {
    sky: {
        border: 'border-sky-200 dark:border-sky-800/50',
        header: 'bg-sky-50 dark:bg-sky-950/35 hover:bg-sky-100/90 dark:hover:bg-sky-900/40',
        emoji: 'bg-sky-100 dark:bg-sky-900/50',
        title: 'text-sky-900 dark:text-sky-100',
        body: 'border-sky-100 dark:border-sky-900/40 bg-white/80 dark:bg-slate-900/40',
    },
    amber: {
        border: 'border-amber-200 dark:border-amber-800/50',
        header: 'bg-amber-50 dark:bg-amber-950/35 hover:bg-amber-100/90 dark:hover:bg-amber-900/40',
        emoji: 'bg-amber-100 dark:bg-amber-900/50',
        title: 'text-amber-900 dark:text-amber-100',
        body: 'border-amber-100 dark:border-amber-900/40 bg-white/80 dark:bg-slate-900/40',
    },
    violet: {
        border: 'border-violet-200 dark:border-violet-800/50',
        header: 'bg-violet-50 dark:bg-violet-950/35 hover:bg-violet-100/90 dark:hover:bg-violet-900/40',
        emoji: 'bg-violet-100 dark:bg-violet-900/50',
        title: 'text-violet-900 dark:text-violet-100',
        body: 'border-violet-100 dark:border-violet-900/40 bg-white/80 dark:bg-slate-900/40',
    },
    slate: {
        border: 'border-slate-200 dark:border-slate-700',
        header: 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800',
        emoji: 'bg-slate-200/80 dark:bg-slate-700',
        title: 'text-slate-800 dark:text-slate-100',
        body: 'border-slate-100 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40',
    },
} as const;

type LinkEditSectionAccent = keyof typeof LINK_EDIT_SECTION_ACCENTS;

const LinkEditSection: React.FC<{
    emoji: string;
    title: string;
    subtitle?: string;
    accent?: LinkEditSectionAccent;
    defaultOpen?: boolean;
    badge?: React.ReactNode;
    headerAction?: React.ReactNode;
    children: React.ReactNode;
}> = ({ emoji, title, subtitle, accent = 'slate', defaultOpen = false, badge, headerAction, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    const styles = LINK_EDIT_SECTION_ACCENTS[accent];

    return (
        <div className={`rounded-xl border-2 overflow-hidden shadow-sm ${styles.border}`}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${styles.header}`}
            >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${styles.emoji}`} aria-hidden>
                    {emoji}
                </span>
                <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${styles.title}`}>{title}</span>
                    {subtitle && (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</span>
                    )}
                </span>
                {badge}
                {headerAction && (
                    <span
                        className="shrink-0"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {headerAction}
                    </span>
                )}
                <svg
                    className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                >
                    <path
                        fillRule="evenodd"
                        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                        clipRule="evenodd"
                    />
                </svg>
            </button>
            {open && (
                <div className={`px-3.5 py-3.5 space-y-3 border-t ${styles.body}`}>
                    {children}
                </div>
            )}
        </div>
    );
};

const LinkEditHeaderSwitch: React.FC<{
    enabled: boolean;
    onToggle: () => void;
    onClassName: string;
    labelOn: string;
    labelOff: string;
}> = ({ enabled, onToggle, onClassName, labelOn, labelOff }) => (
    <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? labelOn : labelOff}
        title={enabled ? labelOn : labelOff}
        onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
        }}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enabled ? onClassName : 'bg-slate-400 dark:bg-slate-600'}`}
    >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

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

const UrlProbeBadges: React.FC<{ url: string }> = ({ url }) => {
    const [phase, setPhase] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
    const [scheme, setScheme] = useState<string>('');
    const [httpCode, setHttpCode] = useState<number | null>(null);
    const [latency, setLatency] = useState<number | null>(null);
    const [redirectCount, setRedirectCount] = useState(0);
    const [redirectChain, setRedirectChain] = useState<LinkRedirectHop[]>([]);
    const [chainOpen, setChainOpen] = useState(false);
    const [sslOpen, setSslOpen] = useState(false);
    const [whoisOpen, setWhoisOpen] = useState(false);
    const [healthStatus, setHealthStatus] = useState<string>('');
    const [error, setError] = useState<string>('');
    const abortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        const trimmed = (url || '').trim();
        abortRef.current?.abort();
        abortRef.current = null;

        if (!isProbableUrl(trimmed)) {
            setPhase('idle');
            setScheme('');
            setHttpCode(null);
            setLatency(null);
            setRedirectCount(0);
            setRedirectChain([]);
            setChainOpen(false);
            setHealthStatus('');
            setError('');
            return;
        }

        const detectedScheme = /^http:\/\//i.test(trimmed)
            ? 'http'
            : /^https:\/\//i.test(trimmed)
                ? 'https'
                : '';
        if (!detectedScheme) {
            setPhase('idle');
            return;
        }
        setScheme(detectedScheme);
        setPhase('checking');
        setError('');
        setRedirectCount(0);
        setRedirectChain([]);
        setChainOpen(false);

        const requestId = ++requestIdRef.current;
        const timer = window.setTimeout(async () => {
            const controller = new AbortController();
            abortRef.current = controller;
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
            } catch (err: any) {
                if (controller.signal.aborted || requestId !== requestIdRef.current) return;
                if (err?.name === 'AbortError') return;
                setHttpCode(null);
                setLatency(Math.round(performance.now() - started));
                setRedirectCount(0);
                setRedirectChain([]);
                setHealthStatus('broken');
                setError(err?.message || 'Check failed');
                setPhase('error');
            }
        }, 650);

        return () => {
            window.clearTimeout(timer);
            abortRef.current?.abort();
        };
    }, [url]);

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
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600';

    const latencyColor =
        latency !== null && latency < 300
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700'
            : latency !== null && latency < 1000
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700';

    const schemeUpper = (scheme || 'https').toUpperCase();
    const statusLabel =
        phase === 'checking'
            ? 'Checking…'
            : httpCode
                ? String(httpCode)
                : healthStatus === 'timeout'
                    ? 'Timeout'
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
                className="fixed inset-0 z-[100050] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
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
                                {error ? ` · ${error}` : ''}
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
            {phase === 'checking' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700 animate-pulse">
                    <span aria-hidden>⏳</span> Checking…
                </span>
            ) : (
                <>
                    <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${latencyColor}`}
                        title="Round-trip time (server probe latency)"
                    >
                        <span aria-hidden>⚡</span>
                        RTT {formatProbeLatency(latency) || '—'}
                    </span>
                    <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${codeColor}`}
                        title={`${schemeUpper} status code${error ? `: ${error}` : ''}`}
                    >
                        <span aria-hidden>{scheme === 'http' ? '🔓' : '🔒'}</span>
                        {schemeUpper} {statusLabel}
                    </span>
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

const generateId = () => Math.random().toString(36).substring(2, 9);

/** Deep-clone a link with a fresh id (all fields preserved). */
const cloneLinkItem = (link: Link, opts?: { appendCopyLabel?: boolean }): Link => ({
    id: generateId(),
    label: opts?.appendCopyLabel ? `${link.label} (Copy)` : link.label,
    url: link.url,
    icon: link.icon,
    textColor: link.textColor,
    health: link.health ? { ...link.health } : undefined,
    visibility: link.visibility,
    published: link.published,
    allowedUsers: link.allowedUsers ? [...link.allowedUsers] : undefined,
    allowedGroups: link.allowedGroups ? [...link.allowedGroups] : undefined,
    notes: link.notes,
    tooltip: link.tooltip,
    notesEnabled: link.notesEnabled,
    richTextContent: link.richTextContent,
    richTextEnabled: link.richTextEnabled,
    maintenanceEnabled: link.maintenanceEnabled,
    maintenanceMessage: link.maintenanceMessage,
    maintenanceVideoUrl: link.maintenanceVideoUrl,
    visibleFrom: link.visibleFrom,
    expiresAt: link.expiresAt,
    accessRestrictions: link.accessRestrictions
        ? { ...link.accessRestrictions, timeRules: link.accessRestrictions.timeRules ? [...link.accessRestrictions.timeRules] : undefined, hostRules: link.accessRestrictions.hostRules ? [...link.accessRestrictions.hostRules] : undefined, browsers: link.accessRestrictions.browsers ? [...link.accessRestrictions.browsers] : undefined, osAllow: link.accessRestrictions.osAllow ? [...link.accessRestrictions.osAllow] : undefined, countryAllow: link.accessRestrictions.countryAllow ? [...link.accessRestrictions.countryAllow] : undefined, countryDeny: link.accessRestrictions.countryDeny ? [...link.accessRestrictions.countryDeny] : undefined, referrerPatterns: link.accessRestrictions.referrerPatterns ? [...link.accessRestrictions.referrerPatterns] : undefined, vpn: link.accessRestrictions.vpn ? { ...link.accessRestrictions.vpn } : undefined }
        : undefined,
    browser: link.browser,
    hasRoleAccess: link.hasRoleAccess === true ? true : undefined,
    position: link.position,
    animation: link.animation,
    inheritShortUrls: link.inheritShortUrls,
});

/** Deep-clone a rich text block with a fresh id (all box/meta fields preserved). */
const cloneRichTextItem = (source: RichTextContent): RichTextContent => ({
    id: generateId(),
    content: source.content,
    position: source.position,
    visibility: source.visibility,
    allowedUsers: source.allowedUsers ? [...source.allowedUsers] : undefined,
    allowedGroups: source.allowedGroups ? [...source.allowedGroups] : undefined,
    visibleFrom: source.visibleFrom,
    expiresAt: source.expiresAt,
    boxed: source.boxed,
    boxTitle: source.boxTitle,
    boxFooter: source.boxFooter,
    boxHeaderAlign: source.boxHeaderAlign,
    boxFooterAlign: source.boxFooterAlign,
    boxHeaderBg: source.boxHeaderBg,
    boxFooterBg: source.boxFooterBg,
    boxBodyBg: source.boxBodyBg,
    boxHeaderFontWeight: source.boxHeaderFontWeight,
    boxFooterFontWeight: source.boxFooterFontWeight,
    boxHeaderFontSize: source.boxHeaderFontSize,
    boxFooterFontSize: source.boxFooterFontSize,
    boxHeaderEmoji: source.boxHeaderEmoji,
    boxImportance: source.boxImportance,
});

/** Deep-clone a section including every link and rich text item. */
const cloneSectionItem = (
    section: LinkSection,
    opts?: { appendCopyTitle?: boolean; position?: number }
): LinkSection => {
    const links = Array.isArray(section.links) ? section.links : [];
    const richTextContent = Array.isArray(section.richTextContent) ? section.richTextContent : [];

    return {
        id: generateId(),
        title: opts?.appendCopyTitle ? `${section.title} (Copy)` : section.title,
        emoji: section.emoji,
        textColor: section.textColor,
        visibility: section.visibility,
        published: section.published,
        allowedUsers: section.allowedUsers ? [...section.allowedUsers] : undefined,
        allowedGroups: section.allowedGroups ? [...section.allowedGroups] : undefined,
        visibleFrom: section.visibleFrom,
        expiresAt: section.expiresAt,
        forceStackedView: section.forceStackedView,
        inheritShortUrls: section.inheritShortUrls,
        position: opts?.position ?? section.position ?? 0,
        links: links.map((link) => cloneLinkItem(link)),
        richTextContent: richTextContent.map((rt) => cloneRichTextItem(rt)),
    };
};

/** Deep-clone an entire tab with all sections, links, and rich text. */
const cloneTabItem = (
    tab: Tab,
    opts?: { appendCopyTitle?: boolean; position?: number }
): Tab => {
    const sortedSections = [...(tab.sections || [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0)
    );

    return {
        id: generateId(),
        title: opts?.appendCopyTitle === false ? tab.title : `${tab.title} (Copy)`,
        emoji: tab.emoji,
        textColor: tab.textColor,
        visibility: tab.visibility,
        published: tab.published,
        allowedUsers: tab.allowedUsers ? [...tab.allowedUsers] : undefined,
        allowedGroups: tab.allowedGroups ? [...tab.allowedGroups] : undefined,
        visibleFrom: tab.visibleFrom,
        expiresAt: tab.expiresAt,
        accessRestrictions: tab.accessRestrictions
            ? JSON.parse(JSON.stringify(tab.accessRestrictions))
            : undefined,
        inheritShortUrls: tab.inheritShortUrls,
        position: opts?.position ?? tab.position,
        sections: sortedSections.map((section, index) =>
            cloneSectionItem(section, { position: section.position ?? index })
        ),
    };
};

/** Yellow = Authenticated, orange = specific users/groups. Shown to editors/admins only. */
const VisibilityProtectionBadge: React.FC<{
  visibility?: LinkVisibility | string | null;
  size?: 'sm' | 'md';
}> = ({ visibility, size = 'sm' }) => {
  if (!visibility || visibility === 'public') return null;
  const isAuth = visibility === 'authenticated';
  const label = isAuth ? 'Auth' : 'Restricted';
  const title = isAuth
    ? 'Authenticated users only — not public'
    : 'Restricted to specific users/groups — not public';
  const colorClass = isAuth
    ? 'bg-yellow-100 text-yellow-800 ring-yellow-300/70 dark:bg-yellow-900/40 dark:text-yellow-200 dark:ring-yellow-700/50'
    : 'bg-orange-100 text-orange-800 ring-orange-300/70 dark:bg-orange-900/40 dark:text-orange-200 dark:ring-orange-700/50';
  const pad = size === 'md' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px] sm:text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-md shrink-0 ring-1 ring-inset ${pad} ${colorClass}`}
      title={title}
      aria-label={title}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} aria-hidden>
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
      </svg>
      {label}
    </span>
  );
};

const ShortUrlInheritToggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  title?: string;
}> = ({ checked, onChange, title }) => (
  <label
    className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 select-none"
    title={title || 'On: inherit short URLs from the parent. Off: show original URLs for this item.'}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 text-orange-500 bg-slate-100 border-slate-300 rounded focus:ring-orange-500 dark:bg-slate-700 dark:border-slate-600"
    />
    <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Short URLs</span>
  </label>
);

export const TileDetail: React.FC<TileDetailProps> = ({
    tile,
    allTiles,
    onUpdateTiles,
    isAuthenticated = false,
    onAuthRequired,
    sourceTab = null,
    user
}) => {
    const { assertCanOpen } = useAccessRestrictionGate();
    const canRecycleShortUrl = tile.canEdit === true || !!user?.is_admin;
    const showShortUrls = tile.showShortUrls === true;
    const [shortUrlOverrides, setShortUrlOverrides] = useState<Record<string, string>>({});

    const shortOf = useCallback((type: 'tile' | 'tab' | 'section' | 'link', id: string, current?: string) => {
        return shortUrlOverrides[`${type}:${id}`] || current;
    }, [shortUrlOverrides]);

    const applyRecycledShortUrl = useCallback((targetType: 'tile' | 'tab' | 'section' | 'link', targetId: string, shortUrl: string) => {
        setShortUrlOverrides((prev) => ({ ...prev, [`${targetType}:${targetId}`]: shortUrl }));
    }, []);

    const linkViewerHref = useCallback((link: Link, show?: boolean) => {
        return viewerLinkUrl({ ...link, shortUrl: shortOf('link', link.id, link.shortUrl) }, show ?? showShortUrls) || link.url;
    }, [showShortUrls, shortOf]);

    const persistShowShortUrls = useCallback(async (enabled: boolean) => {
        const updatedTile: Tile = { ...tile, showShortUrls: enabled };
        const updatedTiles = allTiles.map((t) => (t.id === tile.id ? updatedTile : t));
        try {
            await saveTile(updatedTile);
            onUpdateTiles(updatedTiles, true, false, true);
        } catch (e) {
            console.error('Failed to save short URL display setting', e);
            alert(e instanceof Error ? e.message : 'Failed to save short URL display setting');
        }
    }, [tile, allTiles, onUpdateTiles]);

    useEffect(() => {
        setShortUrlOverrides({});
    }, [tile.id]);

    const [isEditing, setIsEditing] = useState(() => getEditParamFromHash());
    const setEditingMode = useCallback((editing: boolean) => {
        setIsEditing(editing);
        writeTileHashEdit(editing);
    }, []);
    const autoSavingRef = useRef(false);
    const tempVersionCreatedRef = useRef<{ tileId: string | null; active: boolean }>({ tileId: null, active: false });
    const sectionLinksImportInputRef = useRef<HTMLInputElement>(null);
    const tabJsonInputRef = useRef<HTMLInputElement>(null);
    const pendingSectionImportRef = useRef<{ tabId: string; sectionId: string } | null>(null);
    const pendingTabJsonImportAfterRef = useRef<string | null>(null);

    // Edit State
    const [editTitle, setEditTitle] = useState(tile.title);
    const [editDesc, setEditDesc] = useState(tile.description);
    const [editHtml, setEditHtml] = useState(tile.htmlContent || '');
    const [editingIntro, setEditingIntro] = useState(false);
    const [generalSettingsExpanded, setGeneralSettingsExpanded] = useState<boolean>(readGeneralSettingsExpanded);
    const [generalSettingsSparkleKey, setGeneralSettingsSparkleKey] = useState(0);
    const [expandedTabs, setExpandedTabs] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [hierarchyView, setHierarchyView] = useState<HierarchyViewMode>(() => readHierarchyViewPreference());
    const skipNextExpandPersistRef = useRef(false);

    const changeHierarchyView = (mode: HierarchyViewMode) => {
        setHierarchyView(mode);
        writeHierarchyViewPreference(mode);
        if (mode !== 'cards' && editTabs.length > 0) {
            setExpandedTabs(new Set(editTabs.map(t => t.id)));
        }
    };
    const [editEmoji, setEditEmoji] = useState(tile.emoji);
    const [editColor, setEditColor] = useState<ThemeColor>(tile.themeColor);
    const [editVisibility, setEditVisibility] = useState<TileVisibility>(tile.visibility || 'public');
    const [editAccessRestrictions, setEditAccessRestrictions] = useState<AccessRestrictions | null | undefined>(tile.accessRestrictions);
    const [editPublished, setEditPublished] = useState<boolean>(tile.published !== false);
    const [editAllowedUsers, setEditAllowedUsers] = useState<number[]>(() => {
        // Always include owner in allowed users list for initialization
        const allowedUsers = tile.allowedUsers || [];
        if (tile.userId) {
            const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
            if (!allowedUsers.includes(ownerIdNum)) {
                return [...allowedUsers, ownerIdNum];
            }
        }
        return allowedUsers;
    });
    const [editAllowedGroups, setEditAllowedGroups] = useState<number[]>(tile.allowedGroups || []);
    const [availableGroups, setAvailableGroups] = useState<Array<{ id: number; name: string; description: string | null; memberCount: number }>>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [editBrowser, setEditBrowser] = useState<string>(tile.browser || 'default');
    const [editLinksAnimation, setEditLinksAnimation] = useState<TileAnimation>((tile.linksAnimation as TileAnimation) || 'none');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showTileUserSelector, setShowTileUserSelector] = useState(false);
    const [visibilitySearchTerm, setVisibilitySearchTerm] = useState('');
    const [visibilityActiveTab, setVisibilityActiveTab] = useState<'users' | 'groups'>('users');

    const { settings } = useSettings();
    const isMobile = useMobile(768); // Use mobile layout below 768px

    // Tabs State (new structure)
    const [editTabs, setEditTabs] = useState<Tab[]>(() => {
        const tabs = tile.tabs || [];
        // Ensure all sections are sorted by position
        return tabs.map(tab => ({
            ...tab,
            sections: tab.sections ? [...tab.sections]
                .sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA - posB;
                })
                .map((section, idx) => ({
                    ...section,
                    position: section.position ?? idx
                })) : []
        }));
    });
    // Sections State (for backward compatibility)
    const [editSections, setEditSections] = useState<LinkSection[]>(tile.sections || []);

    // Temporary State for Adding Links (keyed by section ID)
    const [newLinkState, setNewLinkState] = useState<Record<string, { label: string, url: string, icon: string, textColor: string, visibility: LinkVisibility, published: boolean, inheritShortUrls: boolean, allowedUsers: number[], allowedGroups: number[], notes: string, tooltip: string, notesEnabled: boolean, browser: string, richTextContent: string, richTextEnabled: boolean, animation: string, accessRestrictions?: AccessRestrictions, maintenanceEnabled: boolean, maintenanceMessage: string, maintenanceVideoUrl: string }>>({});

    // Selection State for Bulk Actions
    const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
    const [selectedRichTextIds, setSelectedRichTextIds] = useState<string[]>([]);
    const selectedItemCount = selectedLinkIds.length + selectedRichTextIds.length;

    // State for Editing Links (keyed by link ID)
    const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
    const [convertLinkDialog, setConvertLinkDialog] = useState<{ tabId: string; sectionId: string; link: Link } | null>(null);
    const [convertingLinkToTile, setConvertingLinkToTile] = useState(false);
    const [convertTabSectionDialog, setConvertTabSectionDialog] = useState<
        | { kind: 'tab'; tabId: string }
        | { kind: 'section'; tabId: string; sectionId: string }
        | null
    >(null);
    const [convertingTabSectionToSpace, setConvertingTabSectionToSpace] = useState(false);
    const [editLinkState, setEditLinkState] = useState<Record<string, { label: string, url: string, icon: string, textColor: string, visibility: LinkVisibility, published: boolean, inheritShortUrls: boolean, allowedUsers: number[], allowedGroups: number[], notes: string, tooltip: string, notesEnabled: boolean, browser: string, richTextContent: string, richTextEnabled: boolean, animation: string, accessRestrictions?: AccessRestrictions, maintenanceEnabled: boolean, maintenanceMessage: string, maintenanceVideoUrl: string }>>({});

    // Available browsers from BrowserLauncher API
    const [availableBrowsers, setAvailableBrowsers] = useState<string[]>([]);

    // State for browser selection menu (keyed by link ID)
    const [showBrowserMenu, setShowBrowserMenu] = useState<Record<string, boolean>>({});
    const [browserMenuPosition, setBrowserMenuPosition] = useState<Record<string, { x: number; y: number }>>({});
    const [saveBrowserForLink, setSaveBrowserForLink] = useState<Record<string, boolean>>({});
    const [selectedBrowserForLink, setSelectedBrowserForLink] = useState<Record<string, string>>({});

    // State for link emoji picker visibility (keyed by section ID or link ID)
    const [showLinkEmojiPicker, setShowLinkEmojiPicker] = useState<Record<string, boolean>>({});

    // Users list for private link selection
    const [usersList, setUsersList] = useState<UserListItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [showUserPicker, setShowUserPicker] = useState<Record<string, boolean>>({});
    const [linkUserSearch, setLinkUserSearch] = useState<Record<string, string>>({});
    const [linkGroupSearch, setLinkGroupSearch] = useState<Record<string, string>>({});

    // View State
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    // Initialize selectedTabId from the URL (shareable) then localStorage, keyed by tile ID
    const [selectedTabId, setSelectedTabId] = useState<string | null>(() => {
        const fromUrl = getTabParamFromHash();
        if (fromUrl) return fromUrl;
        try {
            const savedTabId = localStorage.getItem(`tile_selected_tab_${tile.id}`);
            return savedTabId || null;
        } catch {
            return null;
        }
    });
    const selectedTabIdRef = useRef<string | null>(selectedTabId);
    selectedTabIdRef.current = selectedTabId;

    // Save selectedTabId to localStorage whenever it changes
    useEffect(() => {
        if (selectedTabId) {
            try {
                localStorage.setItem(`tile_selected_tab_${tile.id}`, selectedTabId);
            } catch (error) {
                console.error('Failed to save selected tab to localStorage:', error);
            }
        }
    }, [selectedTabId, tile.id]);

    // Reload selected tab from URL or localStorage when tile changes (when viewing a different tile)
    // This needs to run before the tab initialization useEffect
    useEffect(() => {
        const fromUrl = getTabParamFromHash();
        if (fromUrl) {
            setSelectedTabId(fromUrl);
            return;
        }
        try {
            const savedTabId = localStorage.getItem(`tile_selected_tab_${tile.id}`);
            // Set to null first, then the initialization useEffect will validate and set it properly
            setSelectedTabId(savedTabId || null);
        } catch (error) {
            console.error('Failed to load selected tab from localStorage:', error);
            setSelectedTabId(null);
        }
    }, [tile.id]);
    const [viewLayout, setViewLayout] = useState<ViewLayoutMode>(() => {
        // Load saved preference from localStorage
        try {
            const saved = localStorage.getItem('linknest_view_layout');
            return isViewLayoutMode(saved) ? saved : 'side-by-side';
        } catch {
            return 'side-by-side';
        }
    });
    /**
     * Independent of link view mode (stacked/grid/compact/qr/columns).
     * When true, section cards sit in a multi-column grid; can stay ON while other views are selected.
     */
    const [sectionsSideBySide, setSectionsSideBySide] = useState(() => {
        try {
            const saved = localStorage.getItem('linknest_sections_side_by_side');
            if (saved === '1' || saved === 'true') return true;
            if (saved === '0' || saved === 'false') return false;
            // Migrate: previous exclusive "side-by-side" view meant sections were side-by-side
            const layout = localStorage.getItem('linknest_view_layout');
            return layout === null || layout === 'side-by-side';
        } catch {
            return true;
        }
    });
    const [sectionLinkLayouts, setSectionLinkLayouts] = useState<Record<string, ViewLayoutMode>>(() =>
        loadSectionLinkLayouts(tile.id)
    );
    /** When true, top View controls every section (ignores per-section overrides). */
    const [syncSectionViews, setSyncSectionViews] = useState(() => {
        try {
            const saved = localStorage.getItem('linknest_sync_section_views');
            // Default on so the top View control actually applies everywhere.
            if (saved === null) return true;
            return saved === '1' || saved === 'true';
        } catch {
            return true;
        }
    });

    // Visibility Dialog State
    const [visibilityDialogTab, setVisibilityDialogTab] = useState<string | null>(null);
    const [visibilityDialogSection, setVisibilityDialogSection] = useState<{ tabId: string; sectionId: string } | null>(null);

    // Scheduling Dialog State
    const [schedulingDialogTab, setSchedulingDialogTab] = useState<string | null>(null);
    const [schedulingDialogSection, setSchedulingDialogSection] = useState<{ tabId: string; sectionId: string } | null>(null);
    const [restrictionsDialogTab, setRestrictionsDialogTab] = useState<string | null>(null);
    const [schedulingDialogLink, setSchedulingDialogLink] = useState<{ tabId: string; sectionId: string; linkId: string } | null>(null);
    const [schedulingDialogRichText, setSchedulingDialogRichText] = useState<{ tabId: string; sectionId: string; richTextId: string } | null>(null);

    // Health Check State
    const [linkHealth, setLinkHealth] = useState<LinkHealthMap>({});
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [checkingLinkId, setCheckingLinkId] = useState<string | null>(null);
    const healthCheckAbortRef = useRef<AbortController | null>(null);

    // Mobile header actions menu (view mode)
    const [showHeaderActionsMenu, setShowHeaderActionsMenu] = useState(false);
    const [mobilePageAnimOpen, setMobilePageAnimOpen] = useState(false);
    const headerActionsMenuRef = useRef<HTMLDivElement>(null);
    const qrPrintRootRef = useRef<HTMLDivElement>(null);

    // CSV Import State
    const [importingSectionLinks, setImportingSectionLinks] = useState<Record<string, boolean>>({});

    // Add Link Form Visibility State
    const [showAddLinkForm, setShowAddLinkForm] = useState<Record<string, boolean>>({});

    // Rich Text Content State
    const [editingRichTextId, setEditingRichTextId] = useState<Record<string, string | null>>({}); // sectionId -> richTextId
    const [showAddRichTextForm, setShowAddRichTextForm] = useState<Record<string, boolean>>({});
    const [newRichTextContent, setNewRichTextContent] = useState<Record<string, string>>({}); // sectionId -> content
    const [newRichTextBoxed, setNewRichTextBoxed] = useState<Record<string, boolean>>({});
    const [newRichTextBoxTitle, setNewRichTextBoxTitle] = useState<Record<string, string>>({});
    const [newRichTextBoxFooter, setNewRichTextBoxFooter] = useState<Record<string, string>>({});
    const [newRichTextHeaderAlign, setNewRichTextHeaderAlign] = useState<Record<string, BoxAlign>>({});
    const [newRichTextFooterAlign, setNewRichTextFooterAlign] = useState<Record<string, BoxAlign>>({});
    const [newRichTextHeaderBg, setNewRichTextHeaderBg] = useState<Record<string, string>>({});
    const [newRichTextFooterBg, setNewRichTextFooterBg] = useState<Record<string, string>>({});
    const [newRichTextBodyBg, setNewRichTextBodyBg] = useState<Record<string, string>>({});
    const [newRichTextHeaderWeight, setNewRichTextHeaderWeight] = useState<Record<string, BoxFontWeight>>({});
    const [newRichTextFooterWeight, setNewRichTextFooterWeight] = useState<Record<string, BoxFontWeight>>({});
    const [newRichTextHeaderSize, setNewRichTextHeaderSize] = useState<Record<string, BoxFontSize>>({});
    const [newRichTextFooterSize, setNewRichTextFooterSize] = useState<Record<string, BoxFontSize>>({});
    const [newRichTextHeaderEmoji, setNewRichTextHeaderEmoji] = useState<Record<string, string>>({});
    const [newRichTextImportance, setNewRichTextImportance] = useState<Record<string, BoxImportance>>({});
    const richTextItemRefs = useRef<Map<string, RichTextContentItemHandle>>(new Map());
    const setRichTextItemRef = (sectionId: string, richTextId: string, handle: RichTextContentItemHandle | null) => {
        const key = `${sectionId}:${richTextId}`;
        if (handle) {
            richTextItemRefs.current.set(key, handle);
        } else {
            richTextItemRefs.current.delete(key);
        }
    };

    // Link Search State (for edit mode)
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
    const [notesDialogState, setNotesDialogState] = useState<{ linkId: string; notes: string; linkLabel: string } | null>(null);
    const [linkInfoDialog, setLinkInfoDialog] = useState<{ link: Link } | null>(null);
    const [linkMaintenanceDialog, setLinkMaintenanceDialog] = useState<{ link: Link } | null>(null);
    const [qrDialogState, setQrDialogState] = useState<{ url: string; label: string } | null>(null);
    const [mobilePreviewState, setMobilePreviewState] = useState<{ url: string; label: string } | null>(null);
    const [allowedLinkActions, setAllowedLinkActions] = useState<Set<string>>(
        () => new Set(LINK_ACTION_IDS)
    );

    // Version Control State
    const [showVersions, setShowVersions] = useState(false);
    const [tileVersions, setTileVersions] = useState<TileVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [versionActionLoading, setVersionActionLoading] = useState<number | null>(null);

    // Version Filter/Search State
    const [versionSearchTerm, setVersionSearchTerm] = useState('');
    const [versionFilterUser, setVersionFilterUser] = useState<string>('');
    const [versionFilterDateFrom, setVersionFilterDateFrom] = useState<string>('');
    const [versionFilterDateTo, setVersionFilterDateTo] = useState<string>('');
    const [versionFilterTag, setVersionFilterTag] = useState<string>('');

    // Version Compare State
    const [selectedVersionsForCompare, setSelectedVersionsForCompare] = useState<number[]>([]);
    const [isDiffLoading, setIsDiffLoading] = useState(false);

    // Version Edit State (tags/comments)
    const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
    const [editingVersionTags, setEditingVersionTags] = useState<string[]>([]);
    const [editingVersionComments, setEditingVersionComments] = useState<string>('');
    const [newTagInput, setNewTagInput] = useState('');

    // Restore Preview State
    const [restorePreviewVersion, setRestorePreviewVersion] = useState<number | null>(null);

    // Diff Viewer State
    const [diffViewerOpen, setDiffViewerOpen] = useState(false);
    const [diffOriginalTile, setDiffOriginalTile] = useState<any | null>(null);
    const [diffModifiedTile, setDiffModifiedTile] = useState<any | null>(null);
    const [diffTitle, setDiffTitle] = useState('');
    const [diffOriginalVersionMeta, setDiffOriginalVersionMeta] = useState<{
        versionNumber: number;
        createdAt: number;
        username: string;
        changelogSummary?: string | null;
    } | null>(null);
    const [diffModifiedVersionMeta, setDiffModifiedVersionMeta] = useState<{
        versionNumber?: number;
        createdAt?: number;
        username?: string;
        changelogSummary?: string | null;
    } | null>(null);


    const [notesPresetFormState, setNotesPresetFormState] = useState<{ linkId: string } | null>(null);
    useEscapeToClose(!!notesPresetFormState, () => setNotesPresetFormState(null));
    const [notesPresetForm, setNotesPresetForm] = useState({
        ownerInfo: '',
        supportTeamInfo: '',
        serviceNowGroupInfo: '',
        businessOwner: '',
        productOwner: '',
        architect: '',
        vendorDetails: '',
        serviceNowDemand: '',
        serviceNowProject: '',
        serviceNowTask: '',
        goLiveInfo: '',
        majorUpgradeInfo: '',
        serviceDeliveryManager: '',
        businessRelationshipManager: '',
        technologyRelationshipManager: ''
    });

    // Auto-scroll to first matching link when search changes
    useEffect(() => {
        if (linkSearchTerm) {
            const allLinks = editTabs.flatMap(tab => tab.sections.flatMap(section => section.links));
            const allRichText = editTabs.flatMap(tab => tab.sections.flatMap(section => section.richTextContent || []));

            const firstLinkMatch = allLinks.find(link =>
                link.label.toLowerCase().includes(linkSearchTerm.toLowerCase())
            );

            const firstRichTextMatch = allRichText.find(rt =>
                rt.content.toLowerCase().includes(linkSearchTerm.toLowerCase())
            );

            // Prioritize link match if both exist, or use whichever comes first in the document would be better but let's just pick one
            const firstMatch = firstLinkMatch || firstRichTextMatch;
            if (firstMatch) {
                setTimeout(() => {
                    const element = document.getElementById(`link-${firstMatch.id}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        }
    }, [linkSearchTerm, editTabs]);

    // Record visitor hit when tile detail is opened
    useEffect(() => {
        if (tile?.id) {
            void recordTileVisit(tile.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tile?.id]);

    // Abort in-flight health checks when leaving this tile (prevents hung UI / blocked navigation)
    useEffect(() => {
        return () => {
            healthCheckAbortRef.current?.abort();
            healthCheckAbortRef.current = null;
        };
    }, [tile.id]);

    const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];

    // Helper function to get active messages
    const getActiveMessages = (): TileMessage[] => {
        return (tile.messages?.filter(m =>
            m.isActive &&
            (!m.startDate || new Date(m.startDate) <= new Date()) &&
            (!m.endDate || new Date(m.endDate) >= new Date()) &&
            (m.displayLocation === 'detail' || m.displayLocation === 'both' || !m.displayLocation)
        ) || []).sort((a, b) => (a.priority || 0) - (b.priority || 0));
    };

    // Helper function to strip formatting characters for plain text display
    const stripFormatting = (content: string): string => {
        let plainText = content.replace(/\*\*(.*?)\*\*/g, '$1');
        plainText = plainText.replace(/\*([^*]+)\*/g, '$1');
        plainText = plainText.replace(/_([^_]+)_/g, '$1');
        return plainText;
    };

    // Helper function to strip HTML tags from content for plain text display
    const stripHtmlTags = (content: string): string => {
        if (!content) return '';
        // Remove HTML tags using regex
        let plainText = content.replace(/<[^>]*>/g, '');
        // Decode HTML entities
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = plainText;
        return tempDiv.textContent || tempDiv.innerText || '';
    };

    // Helper function to parse URLs and render clickable links with formatting
    const renderMessageContent = (content: string) => {
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const boldPattern = /(\*\*)(.*?)\1/g;
        const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

        let processedContent = content;
        processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');
        processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

        const parts = processedContent.split(urlPattern);

        return parts.map((part, index) => {
            if (urlPattern.test(part)) {
                return (
                    <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold hover:opacity-80 transition-opacity inherit"
                        style={{ color: 'inherit' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                );
            }
            return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
        });
    };

    const activeMessages = getActiveMessages();
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

    // Helper function to get animation class based on animation type
    const getMessageAnimationClass = (animationType?: string) => {
        if (!animationType || animationType === 'rollover' || animationType === 'still') return '';
        return `message-animate-${animationType}`;
    };

    // Get animation duration in seconds based on animation type
    const getAnimationDuration = (animationType?: string): number => {
        if (animationType === 'still') return 0; // No animation duration for still
        const durations: Record<string, number> = {
            'flash': 1.5,
            'flip-horizontal': 2,
            'flip-vertical': 2,
            'bounce': 2,
            'pulse': 2,
            'shake': 1,
            'fade': 2,
            'slide': 3
        };
        return durations[animationType || ''] || 2;
    };

    // Cycle through messages sequentially for non-rollover animations
    useEffect(() => {
        if (activeMessages.length <= 1) {
            setCurrentMessageIndex(0);
            return;
        }

        // Check if any message uses non-rollover animation
        const hasNonRollover = activeMessages.some(msg => msg.animationType && msg.animationType !== 'rollover');
        if (!hasNonRollover) {
            // All messages are rollover - don't cycle
            setCurrentMessageIndex(0);
            return;
        }

        // Get current message
        const currentMsg = activeMessages[currentMessageIndex];
        if (!currentMsg || currentMessageIndex >= activeMessages.length) {
            setCurrentMessageIndex(0);
            return;
        }

        const animationType = currentMsg.animationType || 'rollover';

        // Calculate duration: animation duration + delay before next message
        const animationDuration = animationType === 'rollover' ? 0 : getAnimationDuration(animationType);
        const delayBefore = currentMsg.delayBefore || 0;
        // For 'still' messages with no delay, use a default display duration (3 seconds)
        const displayDuration = animationType === 'still' && delayBefore === 0 ? 3 : (animationDuration + delayBefore);
        const totalDuration = displayDuration * 1000; // Convert to milliseconds

        // Only set timer if we have a duration (non-rollover)
        if (animationType === 'rollover' && totalDuration <= 0) {
            // Skip rollover messages immediately
            setCurrentMessageIndex((prevIndex) => {
                const nextIndex = (prevIndex + 1) % activeMessages.length;
                return nextIndex;
            });
            return;
        }

        const timer = setTimeout(() => {
            setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % activeMessages.length);
        }, totalDuration);

        return () => clearTimeout(timer);
    }, [currentMessageIndex, activeMessages]);

    // Sync state when tile changes, but only when not editing to prevent losing unsaved changes.
    // IMPORTANT: We only depend on `tile` and `isEditing` so that local edits
    // to `editTabs` (like deleting a tab) are not immediately overwritten by
    // the current `tile` prop until the user actually saves.
    useEffect(() => {
        // CRITICAL: Don't sync ANYTHING if we're currently editing - user might have unsaved changes
        // This prevents overwriting deletions or other edits while user is working
        if (isEditing) {
            return;
        }

        // Basic fields
        setEditTitle(tile.title);
        setEditDesc(tile.description);
        setEditHtml(tile.htmlContent || '');
        setEditingIntro(false);
        setExpandedTabs(new Set());
        setExpandedSections(new Set());
        setEditEmoji(tile.emoji);
        setEditColor(tile.themeColor);
        setEditVisibility(tile.visibility || 'public');
        setEditAccessRestrictions(tile.accessRestrictions);
        setEditPublished(tile.published !== false);

        // Always include owner in allowed users list
        const allowedUsers = tile.allowedUsers || [];
        if (tile.userId) {
            const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
            if (!allowedUsers.includes(ownerIdNum)) {
                setEditAllowedUsers([...allowedUsers, ownerIdNum]);
            } else {
                setEditAllowedUsers(allowedUsers);
            }
        } else {
            setEditAllowedUsers(allowedUsers);
        }

        // Load allowed groups
        setEditAllowedGroups(tile.allowedGroups || []);

        setEditBrowser(tile.browser || 'default');
        setEditLinksAnimation((tile.linksAnimation as TileAnimation) || 'none');

        // Tabs / sections: always reflect the latest tile data when
        // we're *not* editing. While editing, `editTabs` is the source
        // of truth and won't be touched by this effect.
        if (tile.tabs && tile.tabs.length > 0) {
            // Deep clone tabs to ensure all properties including textColor and richTextContent are preserved
            const clonedTabs = tile.tabs.map(tab => ({
                ...tab,
                sections: tab.sections ? [...tab.sections]
                    .sort((a, b) => {
                        const posA = a.position ?? 0;
                        const posB = b.position ?? 0;
                        return posA - posB;
                    })
                    .map((section, idx) => ({
                        ...section,
                        position: section.position ?? idx,
                        links: section.links ? section.links.map(link => ({ ...link })) : [],
                        richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
                    })) : []
            }));

            // Debug: Log richTextContent when loading
            clonedTabs.forEach(tab => {
                tab.sections.forEach(section => {
                });
            });

            setEditTabs(clonedTabs);
            const allSections: LinkSection[] = [];
            clonedTabs.forEach(tab => {
                allSections.push(...tab.sections);
            });
            setEditSections(allSections);
        } else {
            // Also clone sections to preserve richTextContent
            const clonedSections = (tile.sections || []).map(section => ({
                ...section,
                links: section.links ? section.links.map(link => ({ ...link })) : [],
                richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
            }));
            setEditTabs([]);
            setEditSections(clonedSections);
        }

        // Load health status from tile data (skip ssh:// / vnc:// — not HTTP-probed)
        const healthMap: LinkHealthMap = {};
        const sectionsToCheck = tile.tabs ? tile.tabs.flatMap(tab => tab.sections) : (tile.sections || []);
        sectionsToCheck.forEach(section => {
            section.links?.forEach(link => {
                if (link.health && !isSshLinkUrl(link.url || '') && !isVncLinkUrl(link.url || '')) {
                    healthMap[link.id] = link.health;
                }
            });
        });
        setLinkHealth(healthMap);
    }, [tile, isEditing]);

    // Keep edit mode active during auto-save operations
    useEffect(() => {
        if (autoSavingRef.current && !isEditing) {
            console.log('Auto-save: Detected edit mode was reset, restoring it');
            setEditingMode(true);
        }
    }, [isEditing, setEditingMode]);

    // Restore Cards/Tree/Compact + expand/collapse when entering edit (and undo temporary Cards switches)
    useEffect(() => {
        if (!isEditing) return;

        setHierarchyView(readHierarchyViewPreference());

        const saved = readTileEditExpandPreference(tile.id);
        if (!saved) return;

        const validTabIds = new Set((tile.tabs || []).map((t) => t.id));
        const validSectionIds = new Set([
            ...(tile.tabs || []).flatMap((t) => (t.sections || []).map((s) => s.id)),
            ...(tile.sections || []).map((s) => s.id),
        ]);

        skipNextExpandPersistRef.current = true;
        setExpandedTabs(new Set(saved.tabs.filter((id) => validTabIds.has(id))));
        setExpandedSections(new Set(saved.sections.filter((id) => validSectionIds.has(id))));
    }, [isEditing, tile.id]);

    // Persist expand/collapse while editing (skip initial empty write so first-time tree auto-expand still works)
    useEffect(() => {
        if (!isEditing) return;
        if (skipNextExpandPersistRef.current) {
            skipNextExpandPersistRef.current = false;
            return;
        }
        const hasExpanded = expandedTabs.size > 0 || expandedSections.size > 0;
        const hadSaved = readTileEditExpandPreference(tile.id) !== null;
        if (!hasExpanded && !hadSaved) return;
        writeTileEditExpandPreference(tile.id, expandedTabs, expandedSections);
    }, [isEditing, tile.id, expandedTabs, expandedSections]);

    // Tree/Compact: expand all tabs once when entering those views with none expanded (and no saved preference)
    useEffect(() => {
        if (!isEditing || hierarchyView === 'cards' || editTabs.length === 0) return;
        if (readTileEditExpandPreference(tile.id)) return;
        setExpandedTabs(prev => {
            if (prev.size > 0) return prev;
            return new Set(editTabs.map(t => t.id));
        });
    }, [isEditing, hierarchyView, editTabs.length, tile.id]);

    // Refresh editTabs when entering edit mode to ensure we have the latest data
    // AND create a temp version snapshot once per edit session
    useEffect(() => {
        if (isEditing && tile.canEdit) {
            if (!tempVersionCreatedRef.current.active || tempVersionCreatedRef.current.tileId !== tile.id) {
                tempVersionCreatedRef.current = { tileId: tile.id, active: true };
                createTempVersion(tile.id);
            }

            if (tile.tabs && tile.tabs.length > 0) {
                const clonedTabs = tile.tabs.map(tab => ({
                    ...tab,
                    sections: tab.sections ? tab.sections.map(section => ({
                        ...section,
                        links: section.links ? section.links.map(link => ({ ...link })) : [],
                        richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
                    })) : []
                }));

                setEditTabs(clonedTabs);
                const allSections: LinkSection[] = [];
                clonedTabs.forEach(tab => {
                    allSections.push(...tab.sections);
                });
                setEditSections(allSections);
            } else {
                const clonedSections = (tile.sections || []).map(section => ({
                    ...section,
                    links: section.links ? section.links.map(link => ({ ...link })) : [],
                    richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
                }));
                setEditTabs([]);
                setEditSections(clonedSections);
            }
        }

        if (!isEditing && !autoSavingRef.current && tempVersionCreatedRef.current.active) {
            tempVersionCreatedRef.current = { tileId: null, active: false };
        }
    }, [isEditing, tile.id, tile.canEdit]); // Run when isEditing becomes true or tile changes

    // Load stored health on open, then auto-check links when exploring (view mode)
    useEffect(() => {
        let cancelled = false;
        const tileId = tile.id;
        const abortController = new AbortController();
        healthCheckAbortRef.current?.abort();
        healthCheckAbortRef.current = abortController;

        const loadAndAutoCheckHealth = async () => {
            try {
                const health = await linkHealthService.getAllHealth();
                if (cancelled || abortController.signal.aborted) return;
                // Drop any stored health for SSH / non-HTTP links in this tile
                const sectionsForFilter = tile.tabs
                    ? tile.tabs.flatMap(tab => tab.sections || [])
                    : (tile.sections || []);
                const cleaned = { ...health };
                sectionsForFilter.flatMap(s => s.links || []).forEach(l => {
                    if (isSshLinkUrl(l.url || '') || isVncLinkUrl(l.url || '')) delete cleaned[l.id];
                });
                setLinkHealth(cleaned);
            } catch (error) {
                console.error('Failed to load link health:', error);
            }

            // Only auto-check when viewing/exploring the space (not while editing)
            if (isEditing || cancelled || abortController.signal.aborted) return;

            const sections = tile.tabs
                ? tile.tabs.flatMap(tab => tab.sections || [])
                : (tile.sections || []);
            const checkableLinks = sections.flatMap(s => (s.links || [])).filter(l => !isSshLinkUrl(l.url || '') && !isVncLinkUrl(l.url || ''));
            const linkIds = checkableLinks.map(l => l.id);
            if (!linkIds.length) return;

            setCheckingHealth(true);
            setLinkHealth(prev => {
                const next = { ...prev };
                // Clear any stale health on SSH/VNC links; mark HTTP links as checking
                sections.flatMap(s => s.links || []).forEach(l => {
                    if (isSshLinkUrl(l.url || '') || isVncLinkUrl(l.url || '')) {
                        delete next[l.id];
                    } else if (linkIds.includes(l.id)) {
                        next[l.id] = { ...(next[l.id] || {}), status: 'checking' };
                    }
                });
                return next;
            });

            try {
                // force=false: skip links checked in the last 5 minutes (much faster on reopen)
                const results = await linkHealthService.checkTileLinks(tileId, false, abortController.signal);
                if (cancelled || abortController.signal.aborted) return;
                if (results && typeof results === 'object') {
                    setLinkHealth(prev => linkHealthService.mergeResults(prev, results));
                }
            } catch (error) {
                if (abortController.signal.aborted || cancelled) return;
                console.error('Failed to auto-check tile link health:', error);
                // Fall back to last stored health so dots are not stuck on "checking"
                try {
                    const health = await linkHealthService.getAllHealth();
                    if (!cancelled && !abortController.signal.aborted) setLinkHealth(health);
                } catch {
                    setLinkHealth(prev => {
                        const next = { ...prev };
                        linkIds.forEach(id => {
                            if (next[id]?.status === 'checking') {
                                next[id] = { ...next[id], status: 'unknown', error: 'Check failed' };
                            }
                        });
                        return next;
                    });
                }
            } finally {
                if (!cancelled && !abortController.signal.aborted) {
                    setCheckingHealth(false);
                }
            }
        };

        loadAndAutoCheckHealth();
        return () => {
            cancelled = true;
            abortController.abort();
            if (healthCheckAbortRef.current === abortController) {
                healthCheckAbortRef.current = null;
            }
        };
    }, [tile.id, isEditing]);

    useEffect(() => {
        try {
            localStorage.setItem(GENERAL_SETTINGS_EXPANDED_KEY, generalSettingsExpanded ? '1' : '0');
        } catch (error) {
            console.error('Failed to save general settings expanded preference:', error);
        }
    }, [generalSettingsExpanded]);

    // Save view layout preference to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('linknest_view_layout', viewLayout);
        } catch (error) {
            console.error('Failed to save view layout preference:', error);
        }
    }, [viewLayout]);

    useEffect(() => {
        try {
            localStorage.setItem('linknest_sections_side_by_side', sectionsSideBySide ? '1' : '0');
        } catch (error) {
            console.error('Failed to save sections side-by-side preference:', error);
        }
    }, [sectionsSideBySide]);

    useEffect(() => {
        try {
            localStorage.setItem('linknest_sync_section_views', syncSectionViews ? '1' : '0');
        } catch (error) {
            console.error('Failed to save sync section views preference:', error);
        }
    }, [syncSectionViews]);

    // Reload per-section link layouts when switching tiles
    useEffect(() => {
        setSectionLinkLayouts(loadSectionLinkLayouts(tile.id));
    }, [tile.id]);

    // Persist per-section link layouts for this tile
    useEffect(() => {
        try {
            localStorage.setItem(sectionLinkLayoutsStorageKey(tile.id), JSON.stringify(sectionLinkLayouts));
        } catch (error) {
            console.error('Failed to save section link layout preferences:', error);
        }
    }, [tile.id, sectionLinkLayouts]);

    const getSectionLinkLayout = (section: { id: string; forceStackedView?: boolean }): ViewLayoutMode => {
        if (section.forceStackedView) return 'stacked';
        const layout = syncSectionViews ? viewLayout : (sectionLinkLayouts[section.id] || viewLayout);
        if (layout === 'qr' && !isLinkActionAllowed('qr')) {
            return 'side-by-side';
        }
        return layout;
    };

    const setSectionLinkLayout = (sectionId: string, layout: ViewLayoutMode) => {
        // Choosing a per-section layout turns off global sync so overrides can stick.
        if (layout === 'qr' && !isLinkActionAllowed('qr')) {
            return;
        }
        if (syncSectionViews) {
            setSyncSectionViews(false);
        }
        setSectionLinkLayouts(prev => ({ ...prev, [sectionId]: layout }));
    };

    const handlePrintAllQrCodes = useCallback(async () => {
        const root = qrPrintRootRef.current;
        if (!root) return;
        try {
            await printQrView({
                title: stripHtmlTags(tile.title || '') || 'QR Codes',
                subtitle: 'All QR codes on this page',
                root,
                brandName: settings.app_name || 'LinkNest',
                brandLogoUrl: settings.favicon || undefined,
            });
        } catch (err) {
            console.warn('QR print failed:', err);
            window.alert(err instanceof Error ? err.message : 'Failed to print QR codes');
        }
    }, [settings.app_name, settings.favicon, tile.title]);

    const handlePrintSectionQrCodes = useCallback(async (sectionId: string, sectionTitle?: string) => {
        const root = qrPrintRootRef.current?.querySelector(
            `[data-qr-print-section="${CSS.escape(sectionId)}"]`
        ) as HTMLElement | null;
        if (!root) return;
        try {
            await printQrView({
                title: stripHtmlTags(tile.title || '') || 'QR Codes',
                subtitle: sectionTitle?.trim() || 'Section QR codes',
                root,
                brandName: settings.app_name || 'LinkNest',
                brandLogoUrl: settings.favicon || undefined,
            });
        } catch (err) {
            console.warn('QR section print failed:', err);
            window.alert(err instanceof Error ? err.message : 'Failed to print QR codes');
        }
    }, [settings.app_name, settings.favicon, tile.title]);

    // Handle ESC key to close visibility and scheduling dialogs
    useEffect(() => {
        const handleEscKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (visibilityDialogTab) {
                    setVisibilityDialogTab(null);
                } else if (visibilityDialogSection) {
                    setVisibilityDialogSection(null);
                } else if (schedulingDialogTab) {
                    setSchedulingDialogTab(null);
                } else if (schedulingDialogSection) {
                    setSchedulingDialogSection(null);
                } else if (schedulingDialogLink) {
                    setSchedulingDialogLink(null);
                } else if (schedulingDialogRichText) {
                    setSchedulingDialogRichText(null);
                }
            }
        };

        if (visibilityDialogTab || visibilityDialogSection || schedulingDialogTab || schedulingDialogSection || schedulingDialogLink || schedulingDialogRichText) {
            document.addEventListener('keydown', handleEscKey);
            return () => document.removeEventListener('keydown', handleEscKey);
        }
    }, [visibilityDialogTab, visibilityDialogSection, schedulingDialogTab, schedulingDialogSection, schedulingDialogLink, schedulingDialogRichText]);

    // Load Access Manager link action allowlist (guest-aware via Public role)
    useEffect(() => {
        let cancelled = false;
        const loadAllowedLinkActions = async () => {
            if (user?.is_admin) {
                if (!cancelled) {
                    setAllowedLinkActions(new Set(LINK_ACTION_IDS));
                }
                return;
            }
            try {
                const actionIds = await rolesService.getAllowedLinkActions();
                if (!cancelled) {
                    setAllowedLinkActions(new Set(actionIds));
                }
            } catch (error) {
                console.error('Failed to load link action permissions:', error);
                if (!cancelled) {
                    setAllowedLinkActions(new Set(LINK_ACTION_IDS));
                }
            }
        };
        void loadAllowedLinkActions();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, user?.id, user?.is_admin]);

    const isLinkActionAllowed = useCallback((actionId: LinkActionId): boolean => {
        if (user?.is_admin) return true;
        return allowedLinkActions.has(actionId);
    }, [allowedLinkActions, user?.is_admin]);

    // If QR view permission is revoked, leave QR layout so content stays usable
    useEffect(() => {
        if (viewLayout === 'qr' && !isLinkActionAllowed('qr')) {
            setViewLayout('side-by-side');
        }
    }, [viewLayout, isLinkActionAllowed]);

    // Load users list when editing and authenticated
    useEffect(() => {
        if (isEditing && isAuthenticated && tile.canEdit) {
            const loadUsers = async () => {
                try {
                    setLoadingUsers(true);
                    const users = await authService.getUsers();
                    setUsersList(users);
                } catch (error) {
                    console.error('Failed to load users:', error);
                } finally {
                    setLoadingUsers(false);
                }
            };
            const loadGroups = async () => {
                try {
                    setIsLoadingGroups(true);
                    const response = await fetch(`${resolveApiBase()}/user-groups`, {
                        method: 'GET',
                        credentials: 'include',
                    });
                    if (response.ok) {
                        const groups = await response.json();
                        setAvailableGroups(groups);
                    }
                } catch (error) {
                    console.error('Failed to load groups:', error);
                } finally {
                    setIsLoadingGroups(false);
                }
            };
            loadUsers();
            loadGroups();
        }
    }, [isEditing, isAuthenticated, tile.canEdit]);

    // Load available browsers from database when feature is enabled (auth required)
    useEffect(() => {
        if (settings.browser_specific_links_enabled === '1') {
            const applyLauncherFallback = () => {
                if (typeof (window as any).BrowserLauncher !== 'undefined') {
                    const BrowserLauncher = (window as any).BrowserLauncher;
                    const browsers = BrowserLauncher.getBrowsers();
                    if (browsers && browsers.length > 0) {
                        setAvailableBrowsers(browsers);
                    }
                }
            };
            if (!isAuthenticated) {
                applyLauncherFallback();
                return;
            }
            const loadBrowsersFromDatabase = async () => {
                try {
                    const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
                    const response = await fetch(`${API_BASE}/browsers`, {
                        credentials: 'include',
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.browsers && data.browsers.length > 0) {
                            const browserIds = data.browsers.map((b: any) => b.browser_id);
                            console.log('Loaded browsers from database:', browserIds);
                            setAvailableBrowsers(browserIds);
                        } else {
                            console.log('No browsers found in database, using fallback');
                            // Fallback to BrowserLauncher static list if database is empty
                            if (typeof (window as any).BrowserLauncher !== 'undefined') {
                                const BrowserLauncher = (window as any).BrowserLauncher;
                                const browsers = BrowserLauncher.getBrowsers();
                                if (browsers && browsers.length > 0) {
                                    setAvailableBrowsers(browsers);
                                }
                            }
                        }
                    }
                } catch {
                    // Browsers from database optional; ignore errors
                }
            };

            loadBrowsersFromDatabase();
        } else {
            setAvailableBrowsers([]);
        }
    }, [settings.browser_specific_links_enabled, isAuthenticated]);

    const goBackToDashboard = useCallback(() => {
        window.location.hash = '#/';
    }, []);

    // Escape: close menus/overlays first; otherwise go back (same as header Back button)
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' && e.key !== 'Esc') return;
            if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
            // Dialogs that register via useEscapeToClose (and similar) handle Escape themselves
            if (isEscapeDialogOpen()) return;
            // Local dialogs with their own Escape handlers
            if (notesDialogState || linkInfoDialog || qrDialogState || mobilePreviewState || notesPresetFormState || diffViewerOpen) return;
            if (
                visibilityDialogTab ||
                visibilityDialogSection ||
                schedulingDialogTab ||
                schedulingDialogSection ||
                schedulingDialogLink ||
                schedulingDialogRichText
            ) {
                return;
            }

            const anyBrowserMenuOpen = Object.values(showBrowserMenu).some(Boolean);
            if (anyBrowserMenuOpen) {
                setShowBrowserMenu({});
                setSaveBrowserForLink({});
                setSelectedBrowserForLink({});
                e.preventDefault();
                return;
            }
            if (mobilePageAnimOpen) {
                setMobilePageAnimOpen(false);
                e.preventDefault();
                return;
            }
            if (showHeaderActionsMenu) {
                setShowHeaderActionsMenu(false);
                e.preventDefault();
                return;
            }

            // Don't navigate away while editing (Cancel uses a confirm dialog)
            if (isEditing) return;

            e.preventDefault();
            goBackToDashboard();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [
        mobilePageAnimOpen,
        showHeaderActionsMenu,
        showBrowserMenu,
        notesDialogState,
        linkInfoDialog,
        qrDialogState,
        mobilePreviewState,
        notesPresetFormState,
        diffViewerOpen,
        visibilityDialogTab,
        visibilityDialogSection,
        schedulingDialogTab,
        schedulingDialogSection,
        schedulingDialogLink,
        schedulingDialogRichText,
        isEditing,
        goBackToDashboard,
    ]);

    // Close header actions menu when leaving mobile
    useEffect(() => {
        if (!isMobile) {
            if (showHeaderActionsMenu) setShowHeaderActionsMenu(false);
            if (mobilePageAnimOpen) setMobilePageAnimOpen(false);
        }
    }, [isMobile, showHeaderActionsMenu, mobilePageAnimOpen]);

    // Version Control Handlers
    const fetchVersions = async () => {
        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.versions) {
                    setTileVersions(data.versions);
                }
            } else {
                console.error('Failed to fetch versions');
            }
        } catch (err) {
            console.error('Error fetching versions:', err);
        } finally {
            setLoadingVersions(false);
        }
    };

    const handleToggleVersionLock = async (versionId: number, isLocked: boolean) => {
        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isLocked: !isLocked }),
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.map(v =>
                    v.id === versionId ? { ...v, is_locked: !isLocked } : v
                ));
            }
        } catch (err) {
            console.error('Error toggling lock:', err);
        } finally {
            setVersionActionLoading(null);
        }
    };

    const handleRestoreVersion = async (versionId: number) => {
        if (!window.confirm('Are you sure you want to restore this version? Current changes will be overwritten.')) return;

        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/restore`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                // Reload tiles to reflect changes
                if (onUpdateTiles) {
                    // Force reload everything
                    const updatedTiles = await getTiles();
                    onUpdateTiles(updatedTiles);
                    setEditingMode(false); // Exit edit mode on restore
                    alert('Version restored successfully.');
                }
            } else {
                alert('Failed to restore version.');
            }
        } catch (err) {
            console.error('Error restoring version:', err);
            alert('Error restoring version.');
        } finally {
            setVersionActionLoading(null);
        }
    };

    const handleCompareWithCurrent = async (version: TileVersion) => {
        try {
            setIsDiffLoading(true);
            setVersionActionLoading(version.id);

            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const res = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${version.id}`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error('Failed to fetch version details');
            const data = await res.json();

            if (data.version && data.version.tile_data) {
                const versionParams = JSON.parse(data.version.tile_data);

                setDiffOriginalTile(versionParams);
                setDiffModifiedTile(tile); // Current state
                setDiffTitle(`Comparing Version ${version.version_number} vs Current`);

                // Set version metadata for display
                setDiffOriginalVersionMeta({
                    versionNumber: version.version_number,
                    createdAt: version.created_at,
                    username: version.username,
                    changelogSummary: version.changelog_summary
                });

                // For current state, we don't have version metadata, but we can show it's current
                setDiffModifiedVersionMeta({
                    changelogSummary: null // Current state doesn't have a changelog summary
                });

                setDiffViewerOpen(true);
            }
        } catch (error) {
            console.error('Error preparing comparison:', error);
            alert('Failed to load version details for comparison');
        } finally {
            setIsDiffLoading(false);
            setVersionActionLoading(null);
        }
    };

    const handleDeleteVersion = async (versionId: number) => {
        if (!window.confirm('Are you sure you want to delete this version?')) return;

        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.filter(v => v.id !== versionId));
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete version.');
            }
        } catch (err) {
            console.error('Error deleting version:', err);
        } finally {
            setVersionActionLoading(null);
        }
    };

    const handleDeleteAllVersions = async () => {
        if (!window.confirm('Are you sure you want to delete ALL unlocked versions? This cannot be undone!')) return;

        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/delete-all`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                alert(`Successfully deleted ${data.deleted} version(s).`);
                fetchVersions(); // Refresh the list
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete versions.');
            }
        } catch (err) {
            console.error('Error deleting all versions:', err);
            alert('Error deleting versions.');
        } finally {
            setLoadingVersions(false);
        }
    };

    const handleDeleteEmptyVersions = async () => {
        if (!window.confirm('Delete all versions with no differences from the previous version? This cannot be undone!')) return;

        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/delete-empty`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.deleted > 0) {
                    alert(`Successfully deleted ${data.deleted} empty version(s).`);
                    fetchVersions(); // Refresh the list
                } else {
                    alert('No empty versions found.');
                }
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete empty versions.');
            }
        } catch (err) {
            console.error('Error deleting empty versions:', err);
            alert('Error deleting empty versions.');
        } finally {
            setLoadingVersions(false);
        }
    };

    const handleDeleteDuplicateVersions = async () => {
        if (!window.confirm('Delete all duplicate versions (identical to any previous version)? This cannot be undone!')) return;

        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/delete-duplicate`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.deleted > 0) {
                    alert(`Successfully deleted ${data.deleted} duplicate version(s).`);
                    fetchVersions(); // Refresh the list
                } else {
                    alert('No duplicate versions found.');
                }
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete duplicate versions.');
            }
        } catch (err) {
            console.error('Error deleting duplicate versions:', err);
            alert('Error deleting duplicate versions.');
        } finally {
            setLoadingVersions(false);
        }
    };

    // Compare any two versions
    const handleCompareTwoVersions = async (versionId1: number, versionId2: number) => {
        try {
            setIsDiffLoading(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const res = await fetch(`${API_BASE}/tiles/${tile.id}/versions/compare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId1, versionId2 }),
                credentials: 'include'
            });

            if (!res.ok) throw new Error('Failed to compare versions');
            const data = await res.json();

            if (data.version1 && data.version2) {
                setDiffOriginalTile(data.version1.data);
                setDiffModifiedTile(data.version2.data);
                setDiffTitle(`Comparing Version ${data.version1.version_number} vs Version ${data.version2.version_number}`);

                setDiffOriginalVersionMeta({
                    versionNumber: data.version1.version_number,
                    createdAt: data.version1.created_at,
                    username: tileVersions.find(v => v.id === versionId1)?.username || 'Unknown',
                    changelogSummary: data.version1.changelog_summary
                });

                setDiffModifiedVersionMeta({
                    versionNumber: data.version2.version_number,
                    createdAt: data.version2.created_at,
                    username: tileVersions.find(v => v.id === versionId2)?.username || 'Unknown',
                    changelogSummary: data.version2.changelog_summary
                });

                setDiffViewerOpen(true);
                setSelectedVersionsForCompare([]);
            }
        } catch (error) {
            console.error('Error comparing versions:', error);
            alert('Failed to compare versions.');
        } finally {
            setIsDiffLoading(false);
        }
    };

    // Toggle version selection for comparison
    const handleToggleVersionSelect = (versionId: number) => {
        setSelectedVersionsForCompare(prev => {
            if (prev.includes(versionId)) {
                return prev.filter(id => id !== versionId);
            } else if (prev.length < 2) {
                return [...prev, versionId];
            } else {
                return [prev[1], versionId]; // Replace oldest selection
            }
        });
    };

    // Update version tags
    const handleUpdateVersionTags = async (versionId: number) => {
        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: editingVersionTags }),
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.map(v =>
                    v.id === versionId ? { ...v, tags: editingVersionTags } : v
                ));
                setEditingVersionId(null);
                setEditingVersionTags([]);
                setNewTagInput('');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update tags.');
            }
        } catch (err) {
            console.error('Error updating tags:', err);
            alert('Error updating tags.');
        } finally {
            setVersionActionLoading(null);
        }
    };

    // Update version comments
    const handleUpdateVersionComments = async (versionId: number) => {
        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comments: editingVersionComments }),
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.map(v =>
                    v.id === versionId ? { ...v, comments: editingVersionComments } : v
                ));
                setEditingVersionId(null);
                setEditingVersionComments('');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update comments.');
            }
        } catch (err) {
            console.error('Error updating comments:', err);
            alert('Error updating comments.');
        } finally {
            setVersionActionLoading(null);
        }
    };

    // Start editing version tags/comments
    const handleStartEditVersion = (version: TileVersion) => {
        setEditingVersionId(version.id);
        setEditingVersionTags(version.tags || []);
        setEditingVersionComments(version.comments || '');
    };

    // Cancel editing
    const handleCancelEditVersion = () => {
        setEditingVersionId(null);
        setEditingVersionTags([]);
        setEditingVersionComments('');
        setNewTagInput('');
    };

    // Add tag to editing list
    const handleAddTag = () => {
        if (newTagInput.trim() && !editingVersionTags.includes(newTagInput.trim())) {
            setEditingVersionTags([...editingVersionTags, newTagInput.trim()]);
            setNewTagInput('');
        }
    };

    // Remove tag from editing list
    const handleRemoveTag = (tag: string) => {
        setEditingVersionTags(editingVersionTags.filter(t => t !== tag));
    };

    // Restore with preview
    const handleRestoreWithPreview = async (versionId: number) => {
        setRestorePreviewVersion(versionId);
        // Load version data and show diff
        try {
            setIsDiffLoading(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const res = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error('Failed to fetch version details');
            const data = await res.json();

            if (data.version && data.version.tile_data) {
                const versionParams = JSON.parse(data.version.tile_data);
                const version = tileVersions.find(v => v.id === versionId);

                setDiffOriginalTile(tile); // Current state
                setDiffModifiedTile(versionParams); // Version to restore
                setDiffTitle(`Restore Preview: Version ${version?.version_number || versionId}`);

                setDiffOriginalVersionMeta({
                    versionNumber: 0, // Current
                    createdAt: Date.now() / 1000,
                    username: 'Current State',
                    changelogSummary: null
                });

                setDiffModifiedVersionMeta({
                    versionNumber: version?.version_number || 0,
                    createdAt: version?.created_at || 0,
                    username: version?.username || 'Unknown',
                    changelogSummary: version?.changelog_summary || null
                });

                setDiffViewerOpen(true);
            }
        } catch (error) {
            console.error('Error loading restore preview:', error);
            alert('Failed to load restore preview.');
        } finally {
            setIsDiffLoading(false);
        }
    };

    // Confirm restore after preview
    const handleConfirmRestore = async () => {
        if (restorePreviewVersion) {
            setDiffViewerOpen(false);
            await handleRestoreVersion(restorePreviewVersion);
            setRestorePreviewVersion(null);
        }
    };

    // Filter versions
    const filteredVersions = tileVersions.filter(version => {
        // Search term filter
        if (versionSearchTerm) {
            const searchLower = versionSearchTerm.toLowerCase();
            const matchesSearch =
                version.changelog_summary?.toLowerCase().includes(searchLower) ||
                version.username?.toLowerCase().includes(searchLower) ||
                version.comments?.toLowerCase().includes(searchLower) ||
                version.tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
                `v${version.version_number}`.includes(searchLower);
            if (!matchesSearch) return false;
        }

        // User filter
        if (versionFilterUser && version.username !== versionFilterUser) {
            return false;
        }

        // Date range filter
        if (versionFilterDateFrom) {
            const fromDate = new Date(versionFilterDateFrom).getTime() / 1000;
            if (version.created_at < fromDate) return false;
        }
        if (versionFilterDateTo) {
            const toDate = new Date(versionFilterDateTo).getTime() / 1000 + 86400; // Add 1 day
            if (version.created_at > toDate) return false;
        }

        // Tag filter
        if (versionFilterTag && (!version.tags || !version.tags.includes(versionFilterTag))) {
            return false;
        }

        return true;
    });

    // Get all unique tags and users for filters
    const allTags = Array.from(new Set(tileVersions.flatMap(v => v.tags || []))).sort();
    const allUsers = Array.from(new Set(tileVersions.map(v => v.username))).sort();

    const cleanupEmptyVersions = async () => {
        if (!isAuthenticated || !tile.canEdit) {
            return;
        }
        try {
            const API_BASE = resolveApiBase();
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/cleanup-empty`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.deleted > 0) {
                    console.log(`Auto-cleaned ${data.deleted} empty version(s)`);
                    // Silently refresh versions if we're showing them
                    if (showVersions) {
                        fetchVersions();
                    }
                }
            }
        } catch {
            // Ignore auto-clean errors
        }
    };

    useEffect(() => {
        if (showVersions && isEditing) {
            fetchVersions();
        }
    }, [showVersions, isEditing]);

    // Auto-cleanup empty versions only for editors (guests must not POST this)
    useEffect(() => {
        if (tile.id && isAuthenticated && tile.canEdit) {
            cleanupEmptyVersions();
        }
    }, [tile.id, isAuthenticated, tile.canEdit]);

    // Function to update link browser for admin users
    const handleUpdateLinkBrowser = async (linkId: string, browserId: string) => {
        if (!isAuthenticated || !tile.canEdit) {
            alert('You do not have permission to update link settings.');
            return;
        }

        // Find the link in the tile structure
        const findAndUpdateLink = (tabs: Tab[] | undefined, sections: LinkSection[] | undefined): Tile | null => {
            if (tabs && tabs.length > 0) {
                for (const tab of tabs) {
                    for (const section of tab.sections) {
                        const linkIndex = section.links.findIndex(l => l.id === linkId);
                        if (linkIndex !== -1) {
                            const updatedLinks = [...section.links];
                            updatedLinks[linkIndex] = {
                                ...updatedLinks[linkIndex],
                                browser: browserId && browserId !== 'default' ? browserId : undefined
                            };
                            const updatedSections = tab.sections.map(s =>
                                s.id === section.id ? { ...s, links: updatedLinks } : s
                            );
                            const updatedTabs = tabs.map(t =>
                                t.id === tab.id ? { ...t, sections: updatedSections } : t
                            );
                            return {
                                ...tile,
                                tabs: updatedTabs
                            };
                        }
                    }
                }
            } else if (sections && sections.length > 0) {
                for (const section of sections) {
                    const linkIndex = section.links.findIndex(l => l.id === linkId);
                    if (linkIndex !== -1) {
                        const updatedLinks = [...section.links];
                        updatedLinks[linkIndex] = {
                            ...updatedLinks[linkIndex],
                            browser: browserId && browserId !== 'default' ? browserId : undefined
                        };
                        const updatedSections = sections.map(s =>
                            s.id === section.id ? { ...s, links: updatedLinks } : s
                        );
                        return {
                            ...tile,
                            sections: updatedSections
                        };
                    }
                }
            }
            return null;
        };

        const updatedTile = findAndUpdateLink(tile.tabs, tile.sections);
        if (updatedTile) {
            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
            onUpdateTiles(updatedTiles);
            setShowBrowserMenu(prev => ({ ...prev, [linkId]: false }));
            setSaveBrowserForLink(prev => ({ ...prev, [linkId]: false }));
            setSelectedBrowserForLink(prev => ({ ...prev, [linkId]: '' }));
        }
    };

    // Function to update all links' browser settings in this tile
    const handleUpdateLinksBrowser = async () => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }

        try {
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/update-links-browser`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    browser: editBrowser
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to update links browser' }));
                throw new Error(errorData.error || 'Failed to update links browser');
            }

            const result = await response.json();

            // Update the tile's browser setting in local state
            const updatedTile: Tile = {
                ...tile,
                browser: editBrowser !== 'default' ? editBrowser : undefined,
            };
            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
            onUpdateTiles(updatedTiles, true); // Skip reload since we're just updating browser

            // Show success message
            alert(`Successfully updated default browser for ${result.updatedLinks || 0} link(s) in this tile.`);
        } catch (error) {
            console.error('Failed to update links browser:', error);
            alert(`Failed to update links browser: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const applyEditLinkFormToLink = (link: Link, state: NonNullable<(typeof editLinkState)[string]>): Link => ({
        ...link,
        label: state.label,
        url: normalizeStoredLinkUrl(state.url),
        icon: state.icon?.trim() || undefined,
        textColor: state.textColor?.trim() || undefined,
        visibility: state.visibility || 'public',
        published: state.published !== false,
        allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
        allowedGroups: state.allowedGroups && state.allowedGroups.length > 0 ? state.allowedGroups : undefined,
        notes: hasVisibleRichText(state.notes) ? state.notes?.trim() : undefined,
        tooltip: hasVisibleRichText(state.tooltip) ? state.tooltip?.trim() : (stripHtmlTags(state.label).trim() || undefined),
        notesEnabled: state.notesEnabled === true,
        browser: state.browser && state.browser !== 'default' ? state.browser : undefined,
        richTextContent: state.richTextContent?.trim() || undefined,
        richTextEnabled: state.richTextEnabled === true,
        maintenanceEnabled: state.maintenanceEnabled === true,
        maintenanceMessage: state.maintenanceMessage?.trim() || undefined,
        maintenanceVideoUrl: state.maintenanceVideoUrl?.trim() || undefined,
        animation: linkAnimationForSave(state.animation),
        accessRestrictions: state.accessRestrictions,
        inheritShortUrls: state.inheritShortUrls !== false
    });

    const buildLinkFromNewLinkState = (state: NonNullable<(typeof newLinkState)[string]>): Link => ({
        id: generateId(),
        label: state.label,
        url: normalizeStoredLinkUrl(state.url),
        icon: state.icon?.trim() || undefined,
        textColor: state.textColor?.trim() || undefined,
        visibility: state.visibility || 'public',
        published: state.published !== false,
        allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
        allowedGroups: state.allowedGroups && state.allowedGroups.length > 0 ? state.allowedGroups : undefined,
        notes: hasVisibleRichText(state.notes) ? state.notes?.trim() : undefined,
        tooltip: hasVisibleRichText(state.tooltip) ? state.tooltip?.trim() : (stripHtmlTags(state.label).trim() || undefined),
        notesEnabled: state.notesEnabled === true,
        browser: state.browser && state.browser !== 'default' ? state.browser : undefined,
        richTextContent: state.richTextContent?.trim() || undefined,
        richTextEnabled: state.richTextEnabled === true,
        maintenanceEnabled: state.maintenanceEnabled === true,
        maintenanceMessage: state.maintenanceMessage?.trim() || undefined,
        maintenanceVideoUrl: state.maintenanceVideoUrl?.trim() || undefined,
        animation: linkAnimationForSave(state.animation),
        hasRoleAccess: tile.hasRoleAccess === true || undefined,
        accessRestrictions: state.accessRestrictions,
        inheritShortUrls: state.inheritShortUrls !== false,
    });

    const emptyNewLinkFormState = (): NonNullable<(typeof newLinkState)[string]> => ({
        label: '',
        url: '',
        icon: '',
        textColor: '',
        visibility: 'public',
        published: true,
        inheritShortUrls: true,
        allowedUsers: [],
        allowedGroups: [],
        notes: '',
        tooltip: '',
        notesEnabled: false,
        browser: 'default',
        richTextContent: '',
        richTextEnabled: false,
        animation: 'inherit',
        accessRestrictions: undefined,
        maintenanceEnabled: false,
        maintenanceMessage: '',
        maintenanceVideoUrl: ''
    });

    const applyRichTextDraftToItem = (rt: RichTextContent, content: string, meta?: RichTextBoxMeta): RichTextContent => {
        if (!meta) {
            return { ...rt, content };
        }
        if (!meta.boxed) {
            return {
                ...rt,
                content,
                boxed: false,
                boxTitle: undefined,
                boxFooter: undefined,
                boxHeaderAlign: undefined,
                boxFooterAlign: undefined,
                boxHeaderBg: undefined,
                boxFooterBg: undefined,
                boxBodyBg: undefined,
                boxHeaderFontWeight: undefined,
                boxFooterFontWeight: undefined,
                boxHeaderFontSize: undefined,
                boxFooterFontSize: undefined,
                boxHeaderEmoji: undefined,
                boxImportance: undefined,
            };
        }
        return {
            ...rt,
            content,
            boxed: true,
            boxTitle: meta.boxTitle,
            boxFooter: meta.boxFooter,
            boxHeaderAlign: meta.boxHeaderAlign || 'left',
            boxFooterAlign: meta.boxFooterAlign || 'left',
            boxHeaderBg: meta.boxHeaderBg || DEFAULT_HEADER_BG,
            boxFooterBg: meta.boxFooterBg || DEFAULT_FOOTER_BG,
            boxBodyBg: meta.boxBodyBg || DEFAULT_BODY_BG,
            boxHeaderFontWeight: meta.boxHeaderFontWeight || 'bold',
            boxFooterFontWeight: meta.boxFooterFontWeight || 'normal',
            boxHeaderFontSize: meta.boxHeaderFontSize || 'md',
            boxFooterFontSize: meta.boxFooterFontSize || 'sm',
            boxHeaderEmoji: meta.boxHeaderEmoji,
            boxImportance: meta.boxImportance || 'notes',
        };
    };

    const commitPendingRichTextForms = (tabs: Tab[], sections: LinkSection[]): { tabs: Tab[]; sections: LinkSection[]; didChange: boolean } => {
        const openEdits = Object.entries(editingRichTextId).filter(([, id]) => !!id) as [string, string][];
        const pendingNewSectionIds = Object.entries(newRichTextContent)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim())
            .map(([sectionId]) => sectionId);

        if (openEdits.length === 0 && pendingNewSectionIds.length === 0) {
            return { tabs, sections, didChange: false };
        }

        const pendingNewSet = new Set(pendingNewSectionIds);
        let didChange = false;

        const patchSection = (s: LinkSection): LinkSection => {
            let richTextContent = [...(s.richTextContent || [])];
            let sectionChanged = false;

            const editingId = editingRichTextId[s.id];
            if (editingId) {
                const handle = richTextItemRefs.current.get(`${s.id}:${editingId}`);
                const draft = handle?.getDraft();
                if (draft) {
                    richTextContent = richTextContent.map(rt =>
                        rt.id === editingId ? applyRichTextDraftToItem(rt, draft.content, draft.meta) : rt
                    );
                    sectionChanged = true;
                }
            }

            if (pendingNewSet.has(s.id)) {
                const content = newRichTextContent[s.id]?.trim();
                if (content) {
                    const meta = buildBoxMetaFromFields({
                        boxed: !!newRichTextBoxed[s.id],
                        boxTitle: newRichTextBoxTitle[s.id] || '',
                        boxFooter: newRichTextBoxFooter[s.id] || '',
                        boxHeaderAlign: newRichTextHeaderAlign[s.id] || 'left',
                        boxFooterAlign: newRichTextFooterAlign[s.id] || 'left',
                        boxHeaderBg: newRichTextHeaderBg[s.id] || DEFAULT_HEADER_BG,
                        boxFooterBg: newRichTextFooterBg[s.id] || DEFAULT_FOOTER_BG,
                        boxBodyBg: newRichTextBodyBg[s.id] || DEFAULT_BODY_BG,
                        boxHeaderFontWeight: newRichTextHeaderWeight[s.id] || 'bold',
                        boxFooterFontWeight: newRichTextFooterWeight[s.id] || 'normal',
                        boxHeaderFontSize: newRichTextHeaderSize[s.id] || 'md',
                        boxFooterFontSize: newRichTextFooterSize[s.id] || 'sm',
                        boxHeaderEmoji: newRichTextHeaderEmoji[s.id] || '',
                        boxImportance: newRichTextImportance[s.id] || 'notes',
                    });
                    const maxPosition = Math.max(
                        -1,
                        ...(s.links || []).map(i => i.position || 0),
                        ...richTextContent.map(i => i.position || 0)
                    );
                    richTextContent = [
                        ...richTextContent,
                        {
                            id: generateId(),
                            content,
                            position: maxPosition + 1,
                            ...meta,
                        },
                    ];
                    sectionChanged = true;
                }
            }

            if (sectionChanged) {
                didChange = true;
                return { ...s, richTextContent };
            }
            return s;
        };

        if (tabs.length > 0) {
            return {
                tabs: tabs.map(tab => ({
                    ...tab,
                    sections: (tab.sections || []).map(patchSection),
                })),
                sections,
                didChange,
            };
        }

        return {
            tabs,
            sections: sections.map(patchSection),
            didChange,
        };
    };

    const commitPendingLinkForms = (tabs: Tab[], sections: LinkSection[]): { tabs: Tab[]; sections: LinkSection[]; didChange: boolean } => {
        const pendingEdits = Object.entries(editLinkState).filter(([, state]) =>
            !!state && !!state.label?.trim() && !!state.url?.trim()
        );
        const pendingNewBySection = Object.fromEntries(
            Object.entries(newLinkState).filter(([, state]) =>
                !!state && !!state.label?.trim() && !!state.url?.trim()
            )
        );

        if (pendingEdits.length === 0 && Object.keys(pendingNewBySection).length === 0) {
            return { tabs, sections, didChange: false };
        }

        const pendingByLinkId: Record<string, NonNullable<(typeof editLinkState)[string]>> = {};
        for (const [linkId, state] of pendingEdits) {
            pendingByLinkId[linkId] = state;
        }

        const patchSection = (s: LinkSection): LinkSection => {
            let links = (s.links || []).map(l => {
                const state = pendingByLinkId[l.id];
                return state ? applyEditLinkFormToLink(l, state) : l;
            });
            const newState = pendingNewBySection[s.id];
            if (newState) {
                const maxPosition = Math.max(
                    -1,
                    ...links.map(i => i.position || 0),
                    ...(s.richTextContent || []).map(i => i.position || 0)
                );
                links = [...links, { ...buildLinkFromNewLinkState(newState), position: maxPosition + 1 }];
            }
            return { ...s, links, richTextContent: s.richTextContent || [] };
        };

        if (tabs.length > 0) {
            return {
                tabs: tabs.map(tab => ({
                    ...tab,
                    sections: (tab.sections || []).map(patchSection)
                })),
                sections,
                didChange: true
            };
        }

        return {
            tabs,
            sections: sections.map(patchSection),
            didChange: true
        };
    };

    const handleSaveChanges = (tabsOverride?: Tab[]) => {

        // Check if user has edit permission
        if (!tile.canEdit) {
            console.log('ERROR: No edit permission');
            alert('You do not have permission to edit this tile.');
            setEditingMode(false);
            return;
        }

        const incomingTabs = Array.isArray(tabsOverride) ? tabsOverride : editTabs;
        const richFlush = commitPendingRichTextForms(incomingTabs, editSections);
        const { tabs: tabsToSave, sections: sectionsToSave, didChange } = commitPendingLinkForms(
            richFlush.tabs,
            richFlush.sections
        );

        if (richFlush.didChange) {
            if (richFlush.tabs.length > 0) {
                setEditTabs(richFlush.tabs);
            } else {
                setEditSections(richFlush.sections);
            }
            setEditingRichTextId(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(sectionId => {
                    if (next[sectionId]) next[sectionId] = null;
                });
                return next;
            });
            const pendingNewSectionIds = Object.entries(newRichTextContent)
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim())
                .map(([sectionId]) => sectionId);
            if (pendingNewSectionIds.length > 0) {
                setNewRichTextContent(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = ''; });
                    return next;
                });
                setNewRichTextBoxed(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = false; });
                    return next;
                });
                setNewRichTextBoxTitle(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = ''; });
                    return next;
                });
                setNewRichTextBoxFooter(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = ''; });
                    return next;
                });
                setNewRichTextHeaderAlign(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'left'; });
                    return next;
                });
                setNewRichTextFooterAlign(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'left'; });
                    return next;
                });
                setNewRichTextHeaderBg(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = DEFAULT_HEADER_BG; });
                    return next;
                });
                setNewRichTextFooterBg(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = DEFAULT_FOOTER_BG; });
                    return next;
                });
                setNewRichTextBodyBg(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = DEFAULT_BODY_BG; });
                    return next;
                });
                setNewRichTextHeaderWeight(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'bold'; });
                    return next;
                });
                setNewRichTextFooterWeight(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'normal'; });
                    return next;
                });
                setNewRichTextHeaderSize(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'md'; });
                    return next;
                });
                setNewRichTextFooterSize(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'sm'; });
                    return next;
                });
                setNewRichTextHeaderEmoji(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = ''; });
                    return next;
                });
                setNewRichTextImportance(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = 'notes'; });
                    return next;
                });
                setShowAddRichTextForm(prev => {
                    const next = { ...prev };
                    pendingNewSectionIds.forEach(id => { next[id] = false; });
                    return next;
                });
            }
        }

        if (didChange) {
            if (tabsToSave.length > 0) {
                setEditTabs(tabsToSave);
            } else {
                setEditSections(sectionsToSave);
            }
            setEditingLinkId(null);
            setEditLinkState({});
            setNewLinkState(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(sectionId => {
                    const state = next[sectionId];
                    if (state?.label?.trim() && state?.url?.trim()) {
                        next[sectionId] = emptyNewLinkFormState();
                    }
                });
                return next;
            });
            setShowAddLinkForm(prev => {
                const next = { ...prev };
                Object.entries(newLinkState).forEach(([sectionId, state]) => {
                    if (state?.label?.trim() && state?.url?.trim()) {
                        next[sectionId] = false;
                    }
                });
                return next;
            });
        }

        // Use tabs if we have them, otherwise use sections (backward compatibility)
        // Deep clone to ensure richTextContent and positions are included
        const clonedTabs = tabsToSave.length > 0 ? tabsToSave.map(tab => ({
            ...tab,
            sections: tab.sections.map(section => ({
                ...section,
                position: section.position ?? 0, // Ensure position is included
                links: section.links ? [...section.links] : [],
                richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
            }))
        })) : undefined;

        const clonedSections = tabsToSave.length === 0 ? sectionsToSave.map(section => ({
            ...section,
            links: section.links ? [...section.links] : [],
            richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
        })) : undefined;

        // Ensure owner is always included in allowed users for private tiles
        let finalAllowedUsers = editAllowedUsers;
        if (editVisibility === 'private' && tile.userId) {
            const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
            if (!finalAllowedUsers.includes(ownerIdNum)) {
                finalAllowedUsers = [...finalAllowedUsers, ownerIdNum];
            }
        }

        const updatedTile: Tile = {
            ...tile,
            title: editTitle,
            description: editDesc,
            htmlContent: editHtml,
            emoji: editEmoji,
            themeColor: editColor,
            tabs: clonedTabs,
            sections: clonedSections, // Only include sections if no tabs
            visibility: editVisibility,
            published: editPublished,
            allowedUsers: editVisibility === 'private' ? finalAllowedUsers : undefined,
            allowedGroups: editVisibility === 'private' ? editAllowedGroups : undefined,
            accessRestrictions: editAccessRestrictions ?? null,
            browser: editBrowser !== 'default' ? editBrowser : undefined,
            // Preserve section animation from tile (edited via view header); save links default from edit panel
            // Send null (not undefined) so JSON includes the key and the API clears links_animation
            pageAnimation: tile.pageAnimation && tile.pageAnimation !== 'none' ? tile.pageAnimation : undefined,
            linksAnimation: editLinksAnimation && editLinksAnimation !== 'none' ? editLinksAnimation : null,
        };

        const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);

        // Push the updated tiles up; App will persist them and re‑pass
        // the updated `tile` prop back down.
        // Note: onUpdateTiles will reload from server, which should include richTextContent
        // The backend will handle change detection via temp version comparison
        onUpdateTiles(updatedTiles, false, true);

        // Only exit edit mode if this is NOT an auto-save
        if (!autoSavingRef.current) {
            setEditingMode(false);
        }
    };

    const toggleTab = (tabId: string) => {
        setExpandedTabs(prev => {
            const next = new Set(prev);
            if (next.has(tabId)) {
                next.delete(tabId);
            } else {
                next.add(tabId);
            }
            return next;
        });
    };

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
            }
            return next;
        });
    };

    const allSectionIds = editTabs.length > 0
        ? editTabs.flatMap((t) => (t.sections || []).map((s) => s.id))
        : editSections.map((s) => s.id);

    const expandAllToSections = () => {
        if (editTabs.length > 0) {
            setExpandedTabs(new Set(editTabs.map((t) => t.id)));
        }
        setExpandedSections(new Set(allSectionIds));
    };

    const collapseAllTabsAndSections = () => {
        setExpandedTabs(new Set());
        setExpandedSections(new Set());
    };

    const allTabsExpandedToSections =
        (editTabs.length === 0 || editTabs.every((t) => expandedTabs.has(t.id))) &&
        (allSectionIds.length === 0 || allSectionIds.every((id) => expandedSections.has(id))) &&
        (editTabs.length > 0 || allSectionIds.length > 0);
    const canExpandAllToSections =
        (editTabs.length > 0 || allSectionIds.length > 0) && !allTabsExpandedToSections;
    const canCollapseAll = expandedTabs.size > 0 || expandedSections.size > 0;

    // Tab Management
    const handleAddTab = () => {
        const newTab: Tab = {
            id: generateId(),
            title: 'New Tab',
            position: editTabs.length,
            sections: []
        };
        setEditTabs([...editTabs, newTab]);

        // If this is the first tab and we have sections, migrate them to this tab
        if (editTabs.length === 0 && editSections.length > 0) {
            newTab.sections = [...editSections];
            setEditTabs([newTab]);
            setEditSections([]);
        }
        setExpandedTabs(prev => new Set(prev).add(newTab.id));
    };

    const handleRemoveTab = (tabId: string) => {
        console.log('=== TAB DELETION START ===');
        console.log('Tab ID to delete:', tabId);
        console.log('isEditing:', isEditing);
        console.log('Current editTabs before deletion:', editTabs.map(t => ({ id: t.id, title: t.title, position: t.position })));
        console.log('Current editTabs count:', editTabs.length);

        // Ensure we're in edit mode
        if (!isEditing) {
            console.error('ERROR: Not in edit mode!');
            alert('Please enter edit mode first before deleting tabs.');
            return;
        }

        if (!tile.canEdit) {
            console.log('ERROR: No edit permission');
            alert('You do not have permission to edit this tile.');
            return;
        }

        // Check tab count before showing confirm dialog
        if (editTabs.length <= 1) {
            console.log('ERROR: Cannot delete last tab');
            alert('Cannot delete the last tab. A tile must have at least one tab.');
            return;
        }

        // Verify the tab exists
        const tabExists = editTabs.some(t => t.id === tabId);
        console.log('Tab exists in editTabs:', tabExists);
        if (!tabExists) {
            console.error('ERROR: Tab not found in editTabs!', { tabId, availableIds: editTabs.map(t => t.id) });
            alert('Tab not found. This may be a synchronization issue.');
            return;
        }

        // Ask for confirmation
        const confirmed = window.confirm('Delete this tab and all its sections and links?');
        if (!confirmed) {
            console.log('User cancelled deletion');
            return;
        }

        console.log('Proceeding with deletion...');

        // Calculate the updated tabs first
        const filteredTabs = editTabs.filter(t => t.id !== tabId);
        const reorderedTabs = filteredTabs.map((t, idx) => ({ ...t, position: idx }));

        console.log('After filter - remaining tabs:', reorderedTabs.map(t => ({ id: t.id, title: t.title })));
        console.log('After reorder - final tabs:', reorderedTabs.map(t => ({ id: t.id, title: t.title, position: t.position })));
        console.log('=== TAB DELETION COMPLETE ===');

        // Update state
        setEditTabs(reorderedTabs);

        // Automatically save after deletion
        // Mark that we're auto-saving to prevent edit mode from exiting
        autoSavingRef.current = true;

        // Use setTimeout to ensure state update is processed first
        setTimeout(() => {
            console.log('Auto-saving after tab deletion...');
            console.log('Tabs to save:', reorderedTabs.length);
            console.log('Current isEditing state:', isEditing);

            // Ensure we're still in edit mode before saving
            if (!isEditing) {
                console.log('WARNING: Not in edit mode anymore, skipping auto-save');
                autoSavingRef.current = false;
                return;
            }

            // Build updated tile with the new tabs
            const updatedTile: Tile = {
                ...tile,
                title: editTitle,
                description: editDesc,
                htmlContent: editHtml,
                emoji: editEmoji,
                themeColor: editColor,
                tabs: reorderedTabs.length > 0 ? reorderedTabs : undefined,
                sections: reorderedTabs.length > 0 ? undefined : editSections,
                visibility: editVisibility,
                published: editPublished,
                allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
            };

            console.log('Auto-save: Updated tile tabs:', updatedTile.tabs?.length || 0);
            console.log('Auto-save: Tab IDs:', updatedTile.tabs?.map(t => ({ id: t.id, title: t.title })) || []);

            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
            console.log('Auto-save: Calling onUpdateTiles with skipReload=true');

            // Call onUpdateTiles with skipReload=true to prevent reload that resets edit mode
            try {
                // This will save to server but skip the reload
                onUpdateTiles(updatedTiles, true);
                console.log('Auto-save: Tab deletion saved successfully - staying in edit mode');

                // Reset the flag after a delay
                setTimeout(() => {
                    autoSavingRef.current = false;
                    console.log('Auto-save: Flag reset');
                }, 1000);
            } catch (error) {
                console.error('Auto-save: Failed to save:', error);
                alert('Failed to save tab deletion. Please try saving manually.');
                autoSavingRef.current = false;
            }
        }, 150);
    };

    const handleUpdateTabTitle = (tabId: string, newTitle: string) => {
        setEditTabs(editTabs.map(t => t.id === tabId ? { ...t, title: newTitle } : t));
    };

    const handleUpdateTabColor = (tabId: string, textColor: string) => {
        // Convert empty string to undefined to properly clear the color
        const normalizedColor = textColor && textColor.trim() ? textColor : undefined;
        setEditTabs(editTabs.map(t => t.id === tabId ? { ...t, textColor: normalizedColor } : t));
    };

    const handleUpdateTabEmoji = (tabId: string, emoji: string) => {
        const normalized = emoji.trim() || undefined;
        setEditTabs(editTabs.map(t => t.id === tabId ? { ...t, emoji: normalized } : t));
    };

    const handleUpdateSectionEmoji = (tabId: string, sectionId: string, emoji: string) => {
        const normalized = emoji.trim() || undefined;
        setEditTabs(editTabs.map(t => {
            if (t.id !== tabId) return t;
            return {
                ...t,
                sections: t.sections.map(s =>
                    s.id === sectionId ? { ...s, emoji: normalized } : s
                )
            };
        }));
    };

    const handleUpdateSectionColor = (tabId: string, sectionId: string, textColor: string) => {
        const normalizedColor = textColor && textColor.trim() ? textColor : undefined;
        setEditTabs(editTabs.map(t => {
            if (t.id !== tabId) return t;
            return {
                ...t,
                sections: t.sections.map(s =>
                    s.id === sectionId ? { ...s, textColor: normalizedColor } : s
                )
            };
        }));
    };

    const handleToggleForceStacked = (tabId: string, sectionId: string, value: boolean) => {
        setEditTabs(editTabs.map(t => {
            if (t.id !== tabId) return t;
            return {
                ...t,
                sections: t.sections.map(s =>
                    s.id === sectionId ? { ...s, forceStackedView: value } : s
                )
            };
        }));
    };

    const expandTabAndSection = (tabId: string, sectionId: string) => {
        setExpandedTabs(prev => new Set(prev).add(tabId));
        setExpandedSections(prev => new Set(prev).add(sectionId));
    };

    /** Open Cards editor for a deep form without overwriting the saved view preference. */
    const openCardsForEditing = (anchorId?: string) => {
        setHierarchyView('cards');
        if (anchorId) {
            window.setTimeout(() => {
                document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
        }
    };

    const handleMoveTab = (tabId: string, direction: 'up' | 'down') => {
        const index = editTabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= editTabs.length) return;

        const newTabs = [...editTabs];
        [newTabs[index], newTabs[newIndex]] = [newTabs[newIndex], newTabs[index]];
        // Update positions
        newTabs.forEach((t, idx) => { t.position = idx; });
        setEditTabs(newTabs);
    };

    const handleCloneTab = (tabId: string) => {
        const tabToClone = editTabs.find(t => t.id === tabId);
        if (!tabToClone) return;

        const index = editTabs.findIndex(t => t.id === tabId);
        const clonedTab = cloneTabItem(tabToClone, {
            appendCopyTitle: true,
            position: (tabToClone.position ?? index) + 1,
        });

        // Insert cloned tab after the original
        const newTabs = [
            ...editTabs.slice(0, index + 1),
            clonedTab,
            ...editTabs.slice(index + 1)
        ];

        // Update positions
        newTabs.forEach((t, idx) => { t.position = idx; });
        setEditTabs(newTabs);
        setExpandedTabs(prev => new Set(prev).add(clonedTab.id));
        // Expand all cloned sections so the full copy is visible immediately
        setExpandedSections(prev => {
            const next = new Set(prev);
            clonedTab.sections.forEach((s) => next.add(s.id));
            return next;
        });
    };

    const handleUpdateTabVisibility = (tabId: string, visibility: LinkVisibility, allowedUsers?: number[], allowedGroups?: number[]) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId
                ? { ...t, visibility, allowedUsers: visibility === 'private' ? allowedUsers : undefined, allowedGroups: visibility === 'private' ? allowedGroups : undefined }
                : t
        ));
    };

    const handleUpdateTabPublished = (tabId: string, published: boolean) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId ? { ...t, published } : t
        ));
    };

    const handleUpdateTabScheduling = (tabId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId
                ? {
                    ...t,
                    visibleFrom: visibleFrom || undefined,
                    expiresAt: expiresAt || undefined
                }
                : t
        ));
    };

    const handleUpdateTabAccessRestrictions = (tabId: string, accessRestrictions?: AccessRestrictions | null) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId ? { ...t, accessRestrictions: accessRestrictions ?? undefined } : t
        ));
    };

    const handleUpdateSectionScheduling = (tabId: string, sectionId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                visibleFrom: visibleFrom || undefined,
                                expiresAt: expiresAt || undefined
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    const handleUpdateLinkScheduling = (tabId: string, sectionId: string, linkId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                links: section.links.map(link =>
                                    link.id === linkId
                                        ? {
                                            ...link,
                                            visibleFrom: visibleFrom || undefined,
                                            expiresAt: expiresAt || undefined
                                        }
                                        : link
                                )
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    const handleToggleLinkFavorite = async (linkId: string) => {
        if (!isAuthenticated) {
            onAuthRequired?.();
            return;
        }

        try {
            const { isFavorite } = await toggleLinkFavorite(linkId);

            const updateLinkInTabs = (tabs: Tab[]): Tab[] => {
                return tabs.map(tab => ({
                    ...tab,
                    sections: tab.sections.map(section => ({
                        ...section,
                        links: (section.links || []).map(link =>
                            link.id === linkId ? { ...link, isFavorite } : link
                        )
                    }))
                }));
            };

            const updateLinkInSections = (sections: LinkSection[]): LinkSection[] => {
                return sections.map(section => ({
                    ...section,
                    links: (section.links || []).map(link =>
                        link.id === linkId ? { ...link, isFavorite } : link
                    )
                }));
            };

            // Update local edit state if needed
            if (editTabs.length > 0) {
                setEditTabs(updateLinkInTabs(editTabs));
            }
            if (editSections.length > 0) {
                setEditSections(updateLinkInSections(editSections));
            }

            // Create updated tile to notify parent
            const updatedTile: Tile = {
                ...tile,
                tabs: tile.tabs ? updateLinkInTabs(tile.tabs) : undefined,
                sections: tile.sections ? updateLinkInSections(tile.sections) : undefined
            };

            const updatedTiles = allTiles.map(t => t.id === tile.id ? updatedTile : t);
            onUpdateTiles(updatedTiles, true); // skipReload: true to prevent UI flash

        } catch (error) {
            console.error('Failed to toggle link favorite:', error);
        }
    };

    // Section Management (within tabs)
    const handleAddSection = (tabId: string) => {
        const newSectionId = generateId();
        setEditTabs(editTabs.map(tab => {
            if (tab.id === tabId) {
                // Sort sections first to get accurate max position
                const sortedSections = [...tab.sections].sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA - posB;
                });
                const maxPosition = Math.max(...sortedSections.map(s => s.position ?? 0), -1);
                const newSection = { id: newSectionId, title: 'New Section', links: [], position: maxPosition + 1 };
                // Add new section and keep sorted
                const newSections = [...sortedSections, newSection].sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA - posB;
                });
                return {
                    ...tab,
                    sections: newSections
                };
            }
            return tab;
        }));
        setExpandedTabs(prev => new Set(prev).add(tabId));
        setExpandedSections(prev => new Set(prev).add(newSectionId));
    };

    const handleRemoveSection = (tabId: string, sectionId: string) => {
        console.log('=== SECTION DELETION START ===');
        console.log('Tab ID:', tabId, 'Section ID:', sectionId);

        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }

        // Ensure we're in edit mode
        if (!isEditing) {
            console.error('ERROR: Not in edit mode!');
            alert('Please enter edit mode first before deleting sections.');
            return;
        }

        const confirmed = window.confirm('Delete this section and all its links?');
        if (!confirmed) {
            console.log('User cancelled section deletion');
            return;
        }

        console.log('Proceeding with section deletion...');
        console.log('Current editTabs:', editTabs.map(t => ({ id: t.id, title: t.title, sectionsCount: t.sections.length })));

        // Find the tab and section
        const tab = editTabs.find(t => t.id === tabId);
        if (!tab) {
            console.error('ERROR: Tab not found!', tabId);
            alert('Tab not found. This may be a synchronization issue.');
            return;
        }

        const section = tab.sections.find(s => s.id === sectionId);
        if (!section) {
            console.error('ERROR: Section not found!', sectionId);
            alert('Section not found. This may be a synchronization issue.');
            return;
        }

        console.log('Found tab:', tab.title, 'Found section:', section.title);
        console.log('Tab sections before deletion:', tab.sections.map(s => ({ id: s.id, title: s.title })));

        // Calculate the updated tabs with section removed
        const updatedTabs = editTabs.map(tab => {
            if (tab.id === tabId) {
                const filteredSections = tab.sections.filter(s => s.id !== sectionId);
                // Reorder positions after deletion
                const reorderedSections = filteredSections.map((s, idx) => ({ ...s, position: idx }));
                console.log('Tab', tabId, '- sections before:', tab.sections.length, 'after:', filteredSections.length);
                console.log('Filtered sections:', filteredSections.map(s => ({ id: s.id, title: s.title })));
                return {
                    ...tab,
                    sections: reorderedSections
                };
            }
            return tab;
        });

        console.log('=== SECTION DELETION COMPLETE ===');
        console.log('Updated tabs:', updatedTabs.map(t => ({ id: t.id, title: t.title, sectionsCount: t.sections.length })));

        // Update state using functional update to ensure we have latest state
        setEditTabs(prevTabs => {
            console.log('Inside setEditTabs for section deletion - prevTabs:', prevTabs.map(t => ({ id: t.id, sectionsCount: t.sections.length })));
            const result = prevTabs.map(tab => {
                if (tab.id === tabId) {
                    const filtered = tab.sections.filter(s => s.id !== sectionId);
                    // Reorder positions after deletion
                    const reordered = filtered.map((s, idx) => ({ ...s, position: idx }));
                    console.log('Filtering sections for tab', tabId, '- before:', tab.sections.length, 'after:', filtered.length);
                    return {
                        ...tab,
                        sections: reordered
                    };
                }
                return tab;
            });
            console.log('setEditTabs result:', result.map(t => ({ id: t.id, sectionsCount: t.sections.length })));
            return result;
        });

        // Automatically save after deletion
        autoSavingRef.current = true;

        // Use setTimeout to ensure state update is processed first
        setTimeout(() => {
            console.log('Auto-saving after section deletion...');

            // Get the latest tabs state for saving
            setEditTabs(currentTabs => {
                // Build updated tile with the current tabs (which should have section removed)
                const updatedTile: Tile = {
                    ...tile,
                    title: editTitle,
                    description: editDesc,
                    htmlContent: editHtml,
                    emoji: editEmoji,
                    themeColor: editColor,
                    tabs: currentTabs.length > 0 ? currentTabs : undefined,
                    sections: currentTabs.length > 0 ? undefined : editSections,
                    visibility: editVisibility,
                    published: editPublished,
                    allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
                };

                console.log('Auto-save: Updated tile with section removed');
                console.log('Auto-save: Tabs to save:', currentTabs.map(t => ({ id: t.id, title: t.title, sectionsCount: t.sections.length })));

                const updatedTilesArray = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
                console.log('Auto-save: Calling onUpdateTiles with skipReload=true');

                // Call onUpdateTiles with skipReload=true to prevent reload that resets edit mode
                // Do this outside the setState callback to avoid issues
                setTimeout(() => {
                    try {
                        onUpdateTiles(updatedTilesArray, true);
                        console.log('Auto-save: Section deletion saved successfully - staying in edit mode');

                        // Reset the flag after a delay
                        setTimeout(() => {
                            autoSavingRef.current = false;
                            console.log('Auto-save: Flag reset');
                        }, 1000);
                    } catch (error) {
                        console.error('Auto-save: Failed to save:', error);
                        alert('Failed to save section deletion. Please try saving manually.');
                        autoSavingRef.current = false;
                    }
                }, 50);

                // Return current tabs unchanged (state already updated above)
                return currentTabs;
            });
        }, 150);
    };

    const handleUpdateSectionTitle = (tabId: string, sectionId: string, newTitle: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id === tabId) {
                return {
                    ...tab,
                    sections: tab.sections.map(s => s.id === sectionId ? { ...s, title: newTitle } : s)
                };
            }
            return tab;
        }));
    };

    const handleMoveSection = (tabId: string, sectionId: string, direction: 'up' | 'down') => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            // Sort sections by position first to ensure we're working with the correct order
            const sortedSections = [...tab.sections].sort((a, b) => {
                const posA = a.position ?? 0;
                const posB = b.position ?? 0;
                return posA - posB;
            });

            const index = sortedSections.findIndex(s => s.id === sectionId);
            if (index === -1) return tab;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= sortedSections.length) return tab;

            // Swap sections
            const newSections = [...sortedSections];
            [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];

            // Update positions after reordering
            newSections.forEach((section, idx) => {
                section.position = idx;
            });

            return { ...tab, sections: newSections };
        }));
    };

    const handleCloneSection = (tabId: string, sectionId: string) => {
        let clonedSectionId: string | null = null;

        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            const sectionToClone = tab.sections.find(s => s.id === sectionId);
            if (!sectionToClone) return tab;

            // Sort sections first to find correct index
            const sortedSections = [...tab.sections].sort((a, b) => {
                const posA = a.position ?? 0;
                const posB = b.position ?? 0;
                return posA - posB;
            });

            const index = sortedSections.findIndex(s => s.id === sectionId);
            if (index === -1) return tab;

            const clonedSection = cloneSectionItem(sectionToClone, {
                appendCopyTitle: true,
                position: (sectionToClone.position ?? index) + 1,
            });
            clonedSectionId = clonedSection.id;

            // Insert cloned section after the original
            const newSections = [
                ...sortedSections.slice(0, index + 1),
                clonedSection,
                ...sortedSections.slice(index + 1)
            ];

            // Reorder positions after insertion
            newSections.forEach((section, idx) => {
                section.position = idx;
            });

            return { ...tab, sections: newSections };
        }));

        if (clonedSectionId) {
            setExpandedSections(prev => new Set(prev).add(clonedSectionId!));
        }
    };

    const handleUpdateSectionVisibility = (tabId: string, sectionId: string, visibility: LinkVisibility, allowedUsers?: number[], allowedGroups?: number[]) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(s =>
                    s.id === sectionId
                        ? { ...s, visibility, allowedUsers: visibility === 'private' ? allowedUsers : undefined, allowedGroups: visibility === 'private' ? allowedGroups : undefined }
                        : s
                )
            };
        }));
    };

    const handleUpdateSectionPublished = (tabId: string, sectionId: string, published: boolean) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;
            return {
                ...tab,
                sections: tab.sections.map(s =>
                    s.id === sectionId ? { ...s, published } : s
                )
            };
        }));
    };

    // Link Management
    const updateNewLinkState = (sectionId: string, field: 'label' | 'url' | 'icon' | 'textColor' | 'visibility' | 'allowedUsers' | 'allowedGroups' | 'notes' | 'tooltip' | 'notesEnabled' | 'browser' | 'richTextContent' | 'richTextEnabled' | 'animation' | 'published' | 'inheritShortUrls' | 'maintenanceEnabled' | 'maintenanceMessage' | 'maintenanceVideoUrl', value: string | LinkVisibility | number[] | boolean) => {
        setNewLinkState(prev => ({
            ...prev,
            [sectionId]: {
                ...(prev[sectionId] || { label: '', url: '', icon: '', textColor: '', visibility: 'public' as LinkVisibility, published: true, inheritShortUrls: true, allowedUsers: [], allowedGroups: [], notes: '', tooltip: '', notesEnabled: false, browser: 'default', richTextContent: '', richTextEnabled: false, animation: 'inherit', maintenanceEnabled: false, maintenanceMessage: '', maintenanceVideoUrl: '' }),
                [field]: value
            }
        }));
    };

    const toggleUserSelection = (sectionId: string, userId: number) => {
        const currentUsers = newLinkState[sectionId]?.allowedUsers || [];
        const newUsers = currentUsers.includes(userId)
            ? currentUsers.filter(id => id !== userId)
            : [...currentUsers, userId];
        updateNewLinkState(sectionId, 'allowedUsers', newUsers);
    };

    const toggleGroupSelection = (sectionId: string, groupId: number) => {
        const currentGroups = newLinkState[sectionId]?.allowedGroups || [];
        const newGroups = currentGroups.includes(groupId)
            ? currentGroups.filter(id => id !== groupId)
            : [...currentGroups, groupId];
        updateNewLinkState(sectionId, 'allowedGroups', newGroups);
    };

    const handleAddLinkToSection = (tabId: string, sectionId: string) => {
        const state = newLinkState[sectionId];
        if (!state || !state.label.trim() || !state.url.trim()) return;

        const newLink: Link = {
            id: generateId(),
            label: state.label,
            url: normalizeStoredLinkUrl(state.url),
            icon: state.icon?.trim() || undefined,
            textColor: state.textColor?.trim() || undefined,
            visibility: state.visibility || 'public',
            published: state.published !== false,
            allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
            allowedGroups: state.allowedGroups && state.allowedGroups.length > 0 ? state.allowedGroups : undefined,
            notes: hasVisibleRichText(state.notes) ? state.notes?.trim() : undefined,
            tooltip: hasVisibleRichText(state.tooltip) ? state.tooltip?.trim() : (stripHtmlTags(state.label).trim() || undefined),
            notesEnabled: state.notesEnabled === true,
            browser: state.browser && state.browser !== 'default' ? state.browser : undefined,
            richTextContent: state.richTextContent?.trim() || undefined,
            richTextEnabled: state.richTextEnabled === true,
            maintenanceEnabled: state.maintenanceEnabled === true,
            maintenanceMessage: state.maintenanceMessage?.trim() || undefined,
            maintenanceVideoUrl: state.maintenanceVideoUrl?.trim() || undefined,
            animation: linkAnimationForSave(state.animation),
            // Role-assigned spaces: mark new links as role-visible so Your Apps keeps them after save
            hasRoleAccess: tile.hasRoleAccess === true || undefined,
            accessRestrictions: state.accessRestrictions,
            inheritShortUrls: state.inheritShortUrls !== false,
        };

        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id === tabId) {
                    return {
                        ...tab,
                        sections: tab.sections.map(s => {
                            if (s.id === sectionId) {
                                // Calculate position
                                const items = getSortedItems(s);
                                const maxPosition = Math.max(...items.map(i => i.position || 0), -1);
                                const linkWithPos = { ...newLink, position: maxPosition + 1 };
                                return { ...s, links: [...s.links, linkWithPos], richTextContent: s.richTextContent || [] };
                            }
                            return s;
                        })
                    };
                }
                return tab;
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id === sectionId) {
                    // Calculate position
                    const items = getSortedItems(s);
                    const maxPosition = Math.max(...items.map(i => i.position || 0), -1);
                    const linkWithPos = { ...newLink, position: maxPosition + 1 };
                    return { ...s, links: [...s.links, linkWithPos], richTextContent: s.richTextContent || [] };
                }
                return s;
            }));
        }

        // Clear form and hide it
        setNewLinkState(prev => ({ ...prev, [sectionId]: emptyNewLinkFormState() }));
        setShowUserPicker(prev => ({ ...prev, [sectionId]: false }));
        setLinkUserSearch(prev => ({ ...prev, [sectionId]: '' }));
        setLinkGroupSearch(prev => ({ ...prev, [sectionId]: '' }));
        setShowLinkEmojiPicker(prev => ({ ...prev, [sectionId]: false }));
        setShowAddLinkForm(prev => ({ ...prev, [sectionId]: false }));
    };

    const handleRemoveLinkFromSection = (tabId: string, sectionId: string, linkId: string) => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }
        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id === tabId) {
                    return {
                        ...tab,
                        sections: tab.sections.map(s => {
                            if (s.id === sectionId) {
                                return { ...s, links: s.links.filter(l => l.id !== linkId), richTextContent: s.richTextContent || [] };
                            }
                            return s;
                        })
                    };
                }
                return tab;
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id === sectionId) {
                    return { ...s, links: s.links.filter(l => l.id !== linkId), richTextContent: s.richTextContent || [] };
                }
                return s;
            }));
        }
    };

    const appendLinksToSection = (tabId: string, sectionId: string, newLinks: Link[]) => {
        if (editTabs.length > 0) {
            setEditTabs(prev =>
                prev.map(tab => {
                    if (tab.id !== tabId) return tab;
                    return {
                        ...tab,
                        sections: tab.sections.map(s => {
                            if (s.id !== sectionId) return s;
                            const linkPos = (s.links || []).map(l => l.position ?? 0);
                            const rtPos = (s.richTextContent || []).map(r => r.position ?? 0);
                            const maxPosition = Math.max(...linkPos, ...rtPos, -1);
                            const withPos = newLinks.map((link, i) => ({
                                ...link,
                                position: maxPosition + 1 + i
                            }));
                            return {
                                ...s,
                                links: [...s.links, ...withPos],
                                richTextContent: s.richTextContent || []
                            };
                        })
                    };
                })
            );
        } else {
            setEditSections(prev =>
                prev.map(s => {
                    if (s.id !== sectionId) return s;
                    return { ...s, links: [...s.links, ...newLinks], richTextContent: s.richTextContent || [] };
                })
            );
        }
    };

    const importLinksFromCsvFile = async (file: File): Promise<Link[]> => {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
        }

        const headerLine = lines[0];
        const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

        const labelIndex = headers.findIndex(h =>
            h === 'link name' || h === 'linkname' || h === 'name' || h === 'label' || h === 'title'
        );
        const urlIndex = headers.findIndex(h =>
            h === 'link' || h === 'url' || h === 'link url' || h === 'linkurl' || h === 'href'
        );

        if (labelIndex === -1 || urlIndex === -1) {
            throw new Error('CSV file must contain "Link Name" and "Link" (or URL) columns');
        }

        const newLinks: Link[] = [];
        let skippedCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values: string[] = [];
            let current = '';
            let inQuotes = false;

            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    if (j + 1 < line.length && line[j + 1] === '"' && inQuotes) {
                        current += '"';
                        j++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());

            if (values.length <= Math.max(labelIndex, urlIndex)) {
                skippedCount++;
                continue;
            }

            const label = values[labelIndex]?.trim().replace(/^["']|["']$/g, '') || '';
            const url = values[urlIndex]?.trim().replace(/^["']|["']$/g, '') || '';

            if (label && url) {
                newLinks.push({
                    id: generateId(),
                    label,
                    url: normalizeStoredLinkUrl(url),
                    visibility: 'public',
                    notes: undefined,
                    tooltip: undefined
                });
            } else {
                skippedCount++;
            }
        }

        if (newLinks.length === 0) {
            throw new Error('No valid links found in CSV file');
        }

        return newLinks;
    };

    const openSectionLinksImport = (tabId: string, sectionId: string) => {
        pendingSectionImportRef.current = { tabId, sectionId };
        sectionLinksImportInputRef.current?.click();
    };

    const handleSectionLinksImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        const pending = pendingSectionImportRef.current;
        pendingSectionImportRef.current = null;
        if (!file || !pending) return;

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        setImportingSectionLinks(prev => ({ ...prev, [pending.sectionId]: true }));

        try {
            if (ext === 'json') {
                const text = await file.text();
                const data = JSON.parse(text);
                const newLinks = parseSectionLinksExport(data);
                if (newLinks.length === 0) {
                    alert('No links found in this file.');
                    return;
                }
                appendLinksToSection(pending.tabId, pending.sectionId, newLinks);
                alert(`Imported ${newLinks.length} link(s) from JSON.`);
            } else if (ext === 'csv') {
                const newLinks = await importLinksFromCsvFile(file);
                appendLinksToSection(pending.tabId, pending.sectionId, newLinks);
                alert(`Successfully imported ${newLinks.length} link(s) from CSV.`);
            } else {
                alert('Unsupported file type. Please choose a .json or .csv file.');
            }
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to import links.');
        } finally {
            setImportingSectionLinks(prev => ({ ...prev, [pending.sectionId]: false }));
        }
    };

    const openTabJsonImport = (afterTabId: string) => {
        pendingTabJsonImportAfterRef.current = afterTabId;
        tabJsonInputRef.current?.click();
    };

    const handleTabJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        const afterId = pendingTabJsonImportAfterRef.current;
        pendingTabJsonImportAfterRef.current = null;
        if (!file || !afterId) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const importedTab = parseTabExport(data);
            setEditTabs(prev => {
                const idx = prev.findIndex(t => t.id === afterId);
                if (idx === -1) {
                    return [...prev, { ...importedTab, position: prev.length }].map((t, i) => ({ ...t, position: i }));
                }
                const next = [...prev.slice(0, idx + 1), importedTab, ...prev.slice(idx + 1)];
                return next.map((t, i) => ({ ...t, position: i }));
            });
            alert(`Imported tab "${importedTab.title}" with ${importedTab.sections.length} section(s).`);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to import tab JSON.');
        }
    };

    const handleStartEditLink = (link: Link) => {
        setEditingLinkId(link.id);
        setEditLinkState({
            [link.id]: {
                label: link.label,
                url: link.url,
                icon: link.icon || '',
                textColor: link.textColor || '',
                visibility: link.visibility || 'public',
                published: link.published !== false,
                allowedUsers: link.allowedUsers || [],
                allowedGroups: link.allowedGroups || [],
                notes: link.notes || '',
                tooltip: link.tooltip || '',
                notesEnabled: isNotesTooltipEnabled(link),
                browser: link.browser || 'default',
                richTextContent: link.richTextContent || '',
                richTextEnabled: isInfoContentEnabled(link),
                animation: linkAnimationForEdit(link.animation),
                accessRestrictions: link.accessRestrictions,
                inheritShortUrls: link.inheritShortUrls !== false,
                maintenanceEnabled: link.maintenanceEnabled === true,
                maintenanceMessage: link.maintenanceMessage || '',
                maintenanceVideoUrl: link.maintenanceVideoUrl || ''
            }
        });
        setShowUserPicker(prev => ({ ...prev, [link.id]: false }));
        setLinkUserSearch(prev => ({ ...prev, [link.id]: '' }));
        setLinkGroupSearch(prev => ({ ...prev, [link.id]: '' }));
        console.log('Starting to edit link:', link.id, 'browser:', link.browser || 'default');
    };

    const handleCancelEditLink = () => {
        if (editingLinkId) {
            setLinkUserSearch(prev => ({ ...prev, [editingLinkId]: '' }));
            setLinkGroupSearch(prev => ({ ...prev, [editingLinkId]: '' }));
        }
        setEditingLinkId(null);
        setEditLinkState({});
    };

    const handleUpdateLink = (tabId: string, sectionId: string, linkId: string) => {
        const state = editLinkState[linkId];
        if (!state || !state.label.trim() || !state.url.trim()) return;

        console.log('Updating link:', linkId, 'browser state:', state.browser, 'full state:', state);

        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;

                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;

                        return {
                            ...s,
                            links: s.links.map(l =>
                                l.id === linkId ? applyEditLinkFormToLink(l, state) : l
                            ),
                            richTextContent: s.richTextContent || [] // Preserve richTextContent
                        };
                    })
                };
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id !== sectionId) return s;

                return {
                    ...s,
                    links: s.links.map(l =>
                        l.id === linkId ? applyEditLinkFormToLink(l, state) : l
                    ),
                    richTextContent: s.richTextContent || [] // Preserve richTextContent
                };
            }));
        }

        setEditingLinkId(null);
        setEditLinkState({});
        setShowUserPicker(prev => ({ ...prev, [linkId]: false }));
        setLinkUserSearch(prev => ({ ...prev, [linkId]: '' }));
        setLinkGroupSearch(prev => ({ ...prev, [linkId]: '' }));
    };

    const updateEditLinkState = (linkId: string, field: 'label' | 'url' | 'icon' | 'textColor' | 'visibility' | 'allowedUsers' | 'allowedGroups' | 'notes' | 'tooltip' | 'notesEnabled' | 'browser' | 'richTextContent' | 'richTextEnabled' | 'animation' | 'published' | 'inheritShortUrls' | 'maintenanceEnabled' | 'maintenanceMessage' | 'maintenanceVideoUrl', value: string | LinkVisibility | number[] | boolean) => {
        setEditLinkState(prev => ({
            ...prev,
            [linkId]: { ...prev[linkId], [field]: value }
        }));
    };

    const toggleEditUserSelection = (linkId: string, userId: number) => {
        const currentUsers = editLinkState[linkId]?.allowedUsers || [];
        const newUsers = currentUsers.includes(userId)
            ? currentUsers.filter(id => id !== userId)
            : [...currentUsers, userId];
        updateEditLinkState(linkId, 'allowedUsers', newUsers);
    };

    const toggleEditGroupSelection = (linkId: string, groupId: number) => {
        const currentGroups = editLinkState[linkId]?.allowedGroups || [];
        const newGroups = currentGroups.includes(groupId)
            ? currentGroups.filter(id => id !== groupId)
            : [...currentGroups, groupId];
        updateEditLinkState(linkId, 'allowedGroups', newGroups);
    };

    // Helper to get normalized sorted items
    const getSortedItems = (section: LinkSection) => {
        const links = (section.links || []).map(l => ({ ...l, type: 'link' as const }));
        const richText = (section.richTextContent || []).map(r => ({ ...r, type: 'rich-text' as const }));
        return [...links, ...richText].sort((a, b) => {
            const posA = a.position !== undefined ? a.position : 0;
            const posB = b.position !== undefined ? b.position : 0;
            return posA - posB;
        });
    };

    const handleMoveItem = (tabId: string, sectionId: string, itemId: string, direction: 'up' | 'down') => {
        const updateSection = (s: LinkSection) => {
            if (s.id !== sectionId) return s;

            // 1. Get all items sorted and normalized
            let items = getSortedItems(s);

            // 2. Find index of item to move
            const index = items.findIndex(i => i.id === itemId);
            if (index === -1) return s;

            // 3. Calculate target index
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= items.length) return s;

            // 4. Swap in the array
            const newItems = [...items];
            [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];

            // 5. Re-assign strict positions
            newItems.forEach((item, idx) => {
                item.position = idx;
            });

            // 6. Split back into links and richTextContent
            const newLinks = newItems.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link);
            const newRichText = newItems.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent);

            return { ...s, links: newLinks, richTextContent: newRichText };
        };

        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(updateSection)
                };
            }));
        } else {
            setEditSections(editSections.map(updateSection));
        }
    };

    // Rich Text Content Handlers
    const clearAddRichTextForm = (sectionId: string) => {
        setNewRichTextContent(prev => ({ ...prev, [sectionId]: '' }));
        setNewRichTextBoxed(prev => ({ ...prev, [sectionId]: false }));
        setNewRichTextBoxTitle(prev => ({ ...prev, [sectionId]: '' }));
        setNewRichTextBoxFooter(prev => ({ ...prev, [sectionId]: '' }));
        setNewRichTextHeaderAlign(prev => ({ ...prev, [sectionId]: 'left' }));
        setNewRichTextFooterAlign(prev => ({ ...prev, [sectionId]: 'left' }));
        setNewRichTextHeaderBg(prev => ({ ...prev, [sectionId]: DEFAULT_HEADER_BG }));
        setNewRichTextFooterBg(prev => ({ ...prev, [sectionId]: DEFAULT_FOOTER_BG }));
        setNewRichTextBodyBg(prev => ({ ...prev, [sectionId]: DEFAULT_BODY_BG }));
        setNewRichTextHeaderWeight(prev => ({ ...prev, [sectionId]: 'bold' }));
        setNewRichTextFooterWeight(prev => ({ ...prev, [sectionId]: 'normal' }));
        setNewRichTextHeaderSize(prev => ({ ...prev, [sectionId]: 'md' }));
        setNewRichTextFooterSize(prev => ({ ...prev, [sectionId]: 'sm' }));
        setNewRichTextHeaderEmoji(prev => ({ ...prev, [sectionId]: '' }));
        setNewRichTextImportance(prev => ({ ...prev, [sectionId]: 'notes' }));
        setShowAddRichTextForm(prev => ({ ...prev, [sectionId]: false }));
    };

    const handleAddRichTextToSection = (tabId: string, sectionId: string) => {
        const content = newRichTextContent[sectionId]?.trim();
        if (!content) return;

        const meta = buildBoxMetaFromFields({
            boxed: !!newRichTextBoxed[sectionId],
            boxTitle: newRichTextBoxTitle[sectionId] || '',
            boxFooter: newRichTextBoxFooter[sectionId] || '',
            boxHeaderAlign: newRichTextHeaderAlign[sectionId] || 'left',
            boxFooterAlign: newRichTextFooterAlign[sectionId] || 'left',
            boxHeaderBg: newRichTextHeaderBg[sectionId] || DEFAULT_HEADER_BG,
            boxFooterBg: newRichTextFooterBg[sectionId] || DEFAULT_FOOTER_BG,
            boxBodyBg: newRichTextBodyBg[sectionId] || DEFAULT_BODY_BG,
            boxHeaderFontWeight: newRichTextHeaderWeight[sectionId] || 'bold',
            boxFooterFontWeight: newRichTextFooterWeight[sectionId] || 'normal',
            boxHeaderFontSize: newRichTextHeaderSize[sectionId] || 'md',
            boxFooterFontSize: newRichTextFooterSize[sectionId] || 'sm',
            boxHeaderEmoji: newRichTextHeaderEmoji[sectionId] || '',
            boxImportance: newRichTextImportance[sectionId] || 'notes',
        });

        const newRichText: RichTextContent = {
            id: generateId(),
            content,
            position: 0,
            ...meta,
        };

        const updateSection = (s: LinkSection) => {
            if (s.id !== sectionId) return s;
            const items = getSortedItems(s);
            const maxPosition = Math.max(...items.map(i => i.position || 0), -1);
            newRichText.position = maxPosition + 1;
            const richTextItems = s.richTextContent || [];
            return {
                ...s,
                richTextContent: [...richTextItems, newRichText]
            };
        };

        if (editTabs.length > 0) {
            setEditTabs(prev => prev.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(updateSection)
                };
            }));
        } else {
            setEditSections(prev => prev.map(updateSection));
        }

        clearAddRichTextForm(sectionId);
    };

    const handleUpdateRichText = (tabId: string, sectionId: string, richTextId: string, content: string, meta?: RichTextBoxMeta) => {
        const applyUpdate = (rt: RichTextContent) =>
            rt.id !== richTextId ? rt : applyRichTextDraftToItem(rt, content, meta);

        if (editTabs.length > 0) {
            setEditTabs(prev => prev.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;
                        return {
                            ...s,
                            richTextContent: (s.richTextContent || []).map(applyUpdate)
                        };
                    })
                };
            }));
        } else {
            setEditSections(prev => prev.map(s => {
                if (s.id !== sectionId) return s;
                return {
                    ...s,
                    richTextContent: (s.richTextContent || []).map(applyUpdate)
                };
            }));
        }
    };

    const handleDeleteRichText = (tabId: string, sectionId: string, richTextId: string) => {
        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;
                        return {
                            ...s,
                            richTextContent: (s.richTextContent || []).filter(rt => rt.id !== richTextId)
                        };
                    })
                };
            }));
        } else {
            setEditSections(editSections.map(s => {
                if (s.id !== sectionId) return s;
                return {
                    ...s,
                    richTextContent: (s.richTextContent || []).filter(rt => rt.id !== richTextId)
                };
            }));
        }
        setEditingRichTextId(prev => ({ ...prev, [sectionId]: null }));
    };

    const handleMoveRichText = (tabId: string, sectionId: string, richTextId: string, direction: 'up' | 'down') => {
        handleMoveItem(tabId, sectionId, richTextId, direction);
    };

    const toggleLinkSelection = (linkId: string) => {
        setSelectedLinkIds(prev =>
            prev.includes(linkId)
                ? prev.filter(id => id !== linkId)
                : [...prev, linkId]
        );
    };

    const toggleRichTextSelection = (richTextId: string) => {
        setSelectedRichTextIds(prev =>
            prev.includes(richTextId)
                ? prev.filter(id => id !== richTextId)
                : [...prev, richTextId]
        );
    };

    const clearItemSelection = () => {
        setSelectedLinkIds([]);
        setSelectedRichTextIds([]);
    };

    const toggleAllLinksInSectionSelection = (section: LinkSection) => {
        const sectionLinkIds = (section.links || []).map(l => l.id);
        const sectionRichTextIds = (section.richTextContent || []).map(r => r.id);
        const hasItems = sectionLinkIds.length > 0 || sectionRichTextIds.length > 0;
        const allSelected = hasItems
            && sectionLinkIds.every(id => selectedLinkIds.includes(id))
            && sectionRichTextIds.every(id => selectedRichTextIds.includes(id));

        if (allSelected) {
            setSelectedLinkIds(prev => prev.filter(id => !sectionLinkIds.includes(id)));
            setSelectedRichTextIds(prev => prev.filter(id => !sectionRichTextIds.includes(id)));
        } else {
            setSelectedLinkIds(prev => [...new Set([...prev, ...sectionLinkIds])]);
            setSelectedRichTextIds(prev => [...new Set([...prev, ...sectionRichTextIds])]);
        }
    };

    const cloneRichTextForBulk = (source: RichTextContent): RichTextContent => cloneRichTextItem(source);

    const handleBulkMove = (targetTabId: string, targetSectionId: string) => {
        if (selectedLinkIds.length === 0 && selectedRichTextIds.length === 0) return;

        // 1. Find and extract all selected links and rich text from the appropriate source
        const selectedLinks: Link[] = [];
        const selectedRichTexts: RichTextContent[] = [];

        const processSection = (section: LinkSection) => {
            const preservedLinks: Link[] = [];
            const preservedRichText: RichTextContent[] = [];
            (section.links || []).forEach(link => {
                if (selectedLinkIds.includes(link.id)) {
                    selectedLinks.push({ ...link });
                } else {
                    preservedLinks.push(link);
                }
            });
            (section.richTextContent || []).forEach(rt => {
                if (selectedRichTextIds.includes(rt.id)) {
                    selectedRichTexts.push({ ...rt });
                } else {
                    preservedRichText.push(rt);
                }
            });

            return {
                ...section,
                links: preservedLinks,
                richTextContent: preservedRichText
            };
        };

        // 2. Define finalization logic for a section
        const finalizeSection = (section: LinkSection) => {
            if (section.id !== targetSectionId) {
                // Just re-index to ensure no gaps
                const items = getSortedItems(section);
                items.forEach((item, idx) => { item.position = idx; });
                return {
                    ...section,
                    links: items.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link),
                    richTextContent: items.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent)
                };
            }

            // Target section: add selected items to the end
            const currentItems = getSortedItems(section);
            const nextPos = currentItems.length;
            const linksToAdd = selectedLinks.map((link, idx) => ({
                ...link,
                position: nextPos + idx,
                type: 'link' as const
            }));
            const richTextToAdd = selectedRichTexts.map((rt, idx) => ({
                ...rt,
                position: nextPos + selectedLinks.length + idx,
                type: 'rich-text' as const
            }));

            const finalItems = [...currentItems, ...linksToAdd, ...richTextToAdd];
            // Ensure strict positions
            finalItems.forEach((item, idx) => { item.position = idx; });

            return {
                ...section,
                links: finalItems.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link),
                richTextContent: finalItems.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent)
            };
        };

        // 3. Apply changes to the relevant state
        if (editTabs.length > 0) {
            // First pass: remove selected items
            const updatedTabs = editTabs.map(tab => ({
                ...tab,
                sections: tab.sections.map(processSection)
            }));

            if (selectedLinks.length === 0 && selectedRichTexts.length === 0) return;

            // Second pass: add to target
            setEditTabs(updatedTabs.map(tab => ({
                ...tab,
                sections: tab.sections.map(finalizeSection)
            })));
        } else if (editSections.length > 0) {
            // First pass: remove selected items
            const updatedSections = editSections.map(processSection);

            if (selectedLinks.length === 0 && selectedRichTexts.length === 0) return;

            // Second pass: add to target
            setEditSections(updatedSections.map(finalizeSection));
        }

        clearItemSelection();
    };

    const handleBulkCopy = (targetTabId: string, targetSectionId: string) => {
        if (selectedLinkIds.length === 0 && selectedRichTextIds.length === 0) return;

        // 1. Find all selected links and rich text (don't remove them)
        const linksToCopy: Link[] = [];
        const richTextToCopy: RichTextContent[] = [];
        const allSections = editTabs.length > 0
            ? editTabs.flatMap(t => t.sections)
            : editSections;

        allSections.forEach(section => {
            (section.links || []).forEach(link => {
                if (selectedLinkIds.includes(link.id)) {
                    linksToCopy.push({
                        ...link,
                        id: generateId(),
                        label: `${link.label} (Copy)`
                    });
                }
            });
            (section.richTextContent || []).forEach(rt => {
                if (selectedRichTextIds.includes(rt.id)) {
                    richTextToCopy.push(cloneRichTextForBulk(rt));
                }
            });
        });

        if (linksToCopy.length === 0 && richTextToCopy.length === 0) return;

        // 2. Add copies to target section
        const addToSection = (section: LinkSection) => {
            if (section.id !== targetSectionId) return section;

            const currentItems = getSortedItems(section);
            const nextPos = currentItems.length;

            const newLinks = linksToCopy.map((link, idx) => ({
                ...link,
                position: nextPos + idx,
                type: 'link' as const
            }));
            const newRichText = richTextToCopy.map((rt, idx) => ({
                ...rt,
                position: nextPos + linksToCopy.length + idx,
                type: 'rich-text' as const
            }));

            const finalItems = [...currentItems, ...newLinks, ...newRichText];
            finalItems.forEach((item, idx) => { item.position = idx; });

            return {
                ...section,
                links: finalItems.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link),
                richTextContent: finalItems.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent)
            };
        };

        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => ({
                ...tab,
                sections: tab.sections.map(addToSection)
            })));
        } else {
            setEditSections(editSections.map(addToSection));
        }

        clearItemSelection();
    };

    const handleCloneLink = (tabId: string, sectionId: string, linkId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(section => {
                    if (section.id !== sectionId) return section;

                    const items = getSortedItems(section);
                    const sourceIndex = items.findIndex(i => i.id === linkId && i.type === 'link');

                    if (sourceIndex === -1) return section;

                    const linkToClone = items[sourceIndex] as Link;

                    // Clone the link with a new ID (inherit role visibility so Assigned Apps keeps showing it after save)
                    const clonedLink: Link = {
                        id: generateId(),
                        label: `${linkToClone.label} (Copy)`,
                        url: linkToClone.url,
                        icon: linkToClone.icon,
                        textColor: linkToClone.textColor,
                        visibility: linkToClone.visibility,
                        allowedUsers: linkToClone.allowedUsers ? [...linkToClone.allowedUsers] : undefined,
                        allowedGroups: linkToClone.allowedGroups ? [...linkToClone.allowedGroups] : undefined,
                        notes: linkToClone.notes,
                        tooltip: linkToClone.tooltip,
                        health: linkToClone.health,
                        browser: linkToClone.browser,
                        hasRoleAccess: linkToClone.hasRoleAccess === true,
                        published: linkToClone.published,
                        animation: linkToClone.animation,
                        richTextContent: linkToClone.richTextContent,
                        notesEnabled: linkToClone.notesEnabled,
                        richTextEnabled: linkToClone.richTextEnabled,
                        maintenanceEnabled: linkToClone.maintenanceEnabled,
                        maintenanceMessage: linkToClone.maintenanceMessage,
                        maintenanceVideoUrl: linkToClone.maintenanceVideoUrl,
                    };

                    // Insert cloned link after the original in the sorted list
                    const updatedItems = [
                        ...items.slice(0, sourceIndex + 1),
                        { ...clonedLink, type: 'link' as const },
                        ...items.slice(sourceIndex + 1)
                    ];

                    // Re-assign positions and separate back into links and rich text
                    const finalLinks: Link[] = [];
                    const finalRichText: RichTextContent[] = [];

                    updatedItems.forEach((item, index) => {
                        // Extract strictly the properties needed, excluding the temporary 'type'
                        const { type, ...rest } = item;
                        const itemWithPos = { ...rest, position: index };

                        if (type === 'link') {
                            finalLinks.push(itemWithPos as Link);
                        } else {
                            finalRichText.push(itemWithPos as RichTextContent);
                        }
                    });

                    return { ...section, links: finalLinks, richTextContent: finalRichText };
                })
            };
        }));
    };

    const openConvertLinkDialog = (tabId: string, sectionId: string, link: Link) => {
        const edited = editLinkState[link.id];
        const liveLink: Link = edited
            ? {
                ...link,
                label: edited.label || link.label,
                url: (edited.url || link.url || '').trim(),
                icon: edited.icon || link.icon,
                notes: edited.notes || link.notes,
                tooltip: edited.tooltip || link.tooltip,
                visibility: edited.visibility || link.visibility,
                published: edited.published,
                allowedUsers: edited.allowedUsers || link.allowedUsers,
                allowedGroups: edited.allowedGroups || link.allowedGroups,
                browser: edited.browser || link.browser,
                animation: edited.animation || link.animation,
            }
            : { ...link, url: (link.url || '').trim() };
        if (!liveLink.url) {
            alert('This link needs a URL before it can be converted to a tile.');
            return;
        }
        setConvertLinkDialog({ tabId, sectionId, link: liveLink });
    };

    const handleConvertLinkToIndependentTile = async (asHyperlink: boolean) => {
        if (!convertLinkDialog) return;
        if (!isAuthenticated) {
            onAuthRequired?.();
            return;
        }

        const { link } = convertLinkDialog;
        const title = stripHtmlTags(link.label || '').trim() || getDisplayUrl(link.url) || 'Untitled';
        const isAdmin = !!user?.is_admin;
        let visibility: TileVisibility = tile.visibility || 'public';
        let allowedUsers = tile.allowedUsers ? [...tile.allowedUsers] : [];
        let allowedGroups = tile.allowedGroups ? [...tile.allowedGroups] : [];

        if (link.visibility === 'private') {
            visibility = 'private';
            if (link.allowedUsers?.length) allowedUsers = [...link.allowedUsers];
            if (link.allowedGroups?.length) allowedGroups = [...link.allowedGroups];
        } else if (link.visibility === 'authenticated' && visibility === 'public') {
            visibility = 'authenticated';
        }

        if (!isAdmin) {
            visibility = 'private';
        }
        if (visibility === 'private' && user && !allowedUsers.includes(user.id)) {
            allowedUsers = [...allowedUsers, user.id];
        }

        const emoji = (link.icon && link.icon.length <= 8) ? link.icon : (tile.emoji || '🔗');
        const newLink: Link = {
            id: generateId(),
            label: link.label || title,
            url: link.url,
            icon: link.icon,
            textColor: link.textColor,
            visibility: link.visibility,
            published: link.published,
            allowedUsers: link.allowedUsers ? [...link.allowedUsers] : undefined,
            allowedGroups: link.allowedGroups ? [...link.allowedGroups] : undefined,
            notes: link.notes,
            tooltip: link.tooltip,
            browser: link.browser,
            animation: link.animation,
        };

        const newTile: Tile = {
            id: generateUuid(),
            title,
            description: '',
            emoji,
            themeColor: tile.themeColor,
            group: tile.group || 'General',
            tabs: asHyperlink
                ? []
                : [{
                    id: generateId(),
                    title: 'General',
                    position: 0,
                    sections: [{
                        id: generateId(),
                        title: 'General',
                        links: [newLink],
                    }],
                }],
            createdAt: Date.now(),
            visibility,
            allowedUsers: visibility === 'private' ? allowedUsers : undefined,
            allowedGroups: visibility === 'private' ? allowedGroups : undefined,
            isHyperlink: asHyperlink,
            hyperlinkUrl: asHyperlink ? link.url : undefined,
            openInNewTab: asHyperlink ? true : undefined,
            sourceTab: (tile.sourceTab === 'staging' || sourceTab === 'staging') ? 'staging' : 'public',
            browser: (link.browser && link.browser !== 'default') ? link.browser : tile.browser,
        };

        setConvertingLinkToTile(true);
        try {
            await createTile(newTile);
            if (newTile.sourceTab !== 'staging') {
                const updatedTiles = await getTiles();
                onUpdateTiles(updatedTiles, true);
            }
            setConvertLinkDialog(null);
            alert(`Created independent ${asHyperlink ? 'hyperlink tile' : 'space'} “${title}”. You’ll find it on the dashboard. The original link is still in this space.`);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to create tile from this link.');
        } finally {
            setConvertingLinkToTile(false);
        }
    };

    const openConvertTabToSpaceDialog = (tabId: string) => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }
        if (!editTabs.some((t) => t.id === tabId)) {
            alert('Tab not found.');
            return;
        }
        setConvertTabSectionDialog({ kind: 'tab', tabId });
    };

    const openConvertSectionToSpaceDialog = (tabId: string, sectionId: string) => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }
        const tab = editTabs.find((t) => t.id === tabId);
        if (!tab || !tab.sections.some((s) => s.id === sectionId)) {
            alert('Section not found.');
            return;
        }
        setConvertTabSectionDialog({ kind: 'section', tabId, sectionId });
    };

    const resolveConvertedSpaceVisibility = (
        sourceVisibility?: LinkVisibility,
        sourceAllowedUsers?: number[],
        sourceAllowedGroups?: number[]
    ): { visibility: TileVisibility; allowedUsers: number[]; allowedGroups: number[] } => {
        const isAdmin = !!user?.is_admin;
        let visibility: TileVisibility = tile.visibility || 'public';
        let allowedUsers = tile.allowedUsers ? [...tile.allowedUsers] : [];
        let allowedGroups = tile.allowedGroups ? [...tile.allowedGroups] : [];

        if (sourceVisibility === 'private') {
            visibility = 'private';
            if (sourceAllowedUsers?.length) allowedUsers = [...sourceAllowedUsers];
            if (sourceAllowedGroups?.length) allowedGroups = [...sourceAllowedGroups];
        } else if (sourceVisibility === 'authenticated' && visibility === 'public') {
            visibility = 'authenticated';
        }

        if (!isAdmin) {
            visibility = 'private';
        }
        if (visibility === 'private' && user && !allowedUsers.includes(user.id)) {
            allowedUsers = [...allowedUsers, user.id];
        }

        return { visibility, allowedUsers, allowedGroups };
    };

    const persistParentAfterConvertMove = async (nextTabs: Tab[], createdTile: Tile) => {
        const updatedParent: Tile = {
            ...tile,
            title: editTitle,
            description: editDesc,
            htmlContent: editHtml,
            emoji: editEmoji,
            themeColor: editColor,
            tabs: nextTabs.length > 0 ? nextTabs : undefined,
            sections: nextTabs.length > 0 ? undefined : editSections,
            visibility: editVisibility,
            published: editPublished,
            allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
        };

        autoSavingRef.current = true;
        try {
            let list: Tile[];
            if (createdTile.sourceTab !== 'staging') {
                list = await getTiles();
                list = list.map((t) => (t.id === updatedParent.id ? updatedParent : t));
                if (!list.some((t) => t.id === createdTile.id)) {
                    list = [...list, createdTile];
                }
            } else {
                list = allTiles.map((t) => (t.id === updatedParent.id ? updatedParent : t));
                if (!list.some((t) => t.id === createdTile.id)) {
                    list = [...list, createdTile];
                }
            }
            onUpdateTiles(list, true);
            setTimeout(() => {
                autoSavingRef.current = false;
            }, 1000);
        } catch (error) {
            console.error('Auto-save after convert move failed:', error);
            autoSavingRef.current = false;
            throw error;
        }
    };

    const handleConvertTabOrSectionToSpace = async (mode: 'copy' | 'move') => {
        if (!convertTabSectionDialog) return;
        if (!isAuthenticated) {
            onAuthRequired?.();
            return;
        }
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }

        const dialog = convertTabSectionDialog;

        if (dialog.kind === 'tab') {
            if (mode === 'move' && editTabs.length <= 1) {
                alert('Cannot move the last tab. A space must have at least one tab. Use Copy instead.');
                return;
            }
            const tab = editTabs.find((t) => t.id === dialog.tabId);
            if (!tab) {
                alert('Tab not found.');
                return;
            }
            const title = stripHtmlTags(tab.title || '').trim() || 'Untitled';
            const emoji = (tab.emoji && tab.emoji.trim()) ? tab.emoji : (tile.emoji || '📁');
            const sourceLabel = `tab “${title}”`;
            const { visibility, allowedUsers, allowedGroups } = resolveConvertedSpaceVisibility(
                tab.visibility,
                tab.allowedUsers,
                tab.allowedGroups
            );
            const clonedTab = cloneTabItem(tab, { appendCopyTitle: false, position: 0 });

            const newTile: Tile = {
                id: generateUuid(),
                title,
                description: '',
                emoji,
                themeColor: tile.themeColor,
                group: tile.group || 'General',
                tabs: [clonedTab],
                createdAt: Date.now(),
                visibility,
                allowedUsers: visibility === 'private' ? allowedUsers : undefined,
                allowedGroups: visibility === 'private' ? allowedGroups : undefined,
                showShortUrls: tile.showShortUrls,
                sourceTab: (tile.sourceTab === 'staging' || sourceTab === 'staging') ? 'staging' : 'public',
            };

            setConvertingTabSectionToSpace(true);
            try {
                await createTile(newTile);
                if (mode === 'move') {
                    const reorderedTabs = editTabs
                        .filter((t) => t.id !== dialog.tabId)
                        .map((t, idx) => ({ ...t, position: idx }));
                    setEditTabs(reorderedTabs);
                    await persistParentAfterConvertMove(reorderedTabs, newTile);
                    setConvertTabSectionDialog(null);
                    alert(`Moved ${sourceLabel} into a new space on the dashboard.`);
                } else {
                    if (newTile.sourceTab !== 'staging') {
                        const updatedTiles = await getTiles();
                        onUpdateTiles(updatedTiles, true);
                    }
                    setConvertTabSectionDialog(null);
                    alert(`Created a new space from ${sourceLabel}. You’ll find it on the dashboard. The original tab is still in this space.`);
                }
            } catch (err) {
                console.error(err);
                alert(err instanceof Error ? err.message : 'Failed to convert tab to a space.');
            } finally {
                setConvertingTabSectionToSpace(false);
            }
            return;
        }

        // Section → space
        const parentTab = editTabs.find((t) => t.id === dialog.tabId);
        const section = parentTab?.sections.find((s) => s.id === dialog.sectionId);
        if (!parentTab || !section) {
            alert('Section not found.');
            return;
        }
        const title = stripHtmlTags(section.title || '').trim() || 'Untitled';
        const emoji = (section.emoji && section.emoji.trim()) ? section.emoji : (tile.emoji || '📁');
        const sourceLabel = `section “${title}”`;
        const { visibility, allowedUsers, allowedGroups } = resolveConvertedSpaceVisibility(
            section.visibility,
            section.allowedUsers,
            section.allowedGroups
        );
        const clonedSection = cloneSectionItem(section, { position: 0 });
        const tabsForNewSpace: Tab[] = [{
            id: generateId(),
            title: stripHtmlTags(parentTab.title || '').trim() || 'General',
            emoji: parentTab.emoji,
            position: 0,
            sections: [clonedSection],
        }];

        const newTile: Tile = {
            id: generateUuid(),
            title,
            description: '',
            emoji,
            themeColor: tile.themeColor,
            group: tile.group || 'General',
            tabs: tabsForNewSpace,
            createdAt: Date.now(),
            visibility,
            allowedUsers: visibility === 'private' ? allowedUsers : undefined,
            allowedGroups: visibility === 'private' ? allowedGroups : undefined,
            showShortUrls: tile.showShortUrls,
            sourceTab: (tile.sourceTab === 'staging' || sourceTab === 'staging') ? 'staging' : 'public',
        };

        setConvertingTabSectionToSpace(true);
        try {
            await createTile(newTile);
            if (mode === 'move') {
                const nextTabs = editTabs.map((t) => {
                    if (t.id !== dialog.tabId) return t;
                    const reordered = t.sections
                        .filter((s) => s.id !== dialog.sectionId)
                        .map((s, idx) => ({ ...s, position: idx }));
                    return { ...t, sections: reordered };
                });
                setEditTabs(nextTabs);
                await persistParentAfterConvertMove(nextTabs, newTile);
                setConvertTabSectionDialog(null);
                alert(`Moved ${sourceLabel} into a new space on the dashboard.`);
            } else {
                if (newTile.sourceTab !== 'staging') {
                    const updatedTiles = await getTiles();
                    onUpdateTiles(updatedTiles, true);
                }
                setConvertTabSectionDialog(null);
                alert(`Created a new space from ${sourceLabel}. You’ll find it on the dashboard. The original section is still in this space.`);
            }
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to convert section to a space.');
        } finally {
            setConvertingTabSectionToSpace(false);
        }
    };

    const handleCloneRichText = (tabId: string, sectionId: string, richTextId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(section => {
                    if (section.id !== sectionId) return section;

                    const items = getSortedItems(section);
                    const sourceIndex = items.findIndex(i => i.id === richTextId && i.type === 'rich-text');

                    if (sourceIndex === -1) return section;

                    const richTextToClone = items[sourceIndex] as RichTextContent;

                    // Clone the rich text with a new ID
                    const clonedRichText: RichTextContent = {
                        id: generateId(),
                        content: richTextToClone.content,
                        position: richTextToClone.position,
                        visibility: richTextToClone.visibility,
                        allowedUsers: richTextToClone.allowedUsers ? [...richTextToClone.allowedUsers] : undefined,
                        visibleFrom: richTextToClone.visibleFrom,
                        expiresAt: richTextToClone.expiresAt,
                        boxed: richTextToClone.boxed,
                        boxTitle: richTextToClone.boxTitle,
                        boxFooter: richTextToClone.boxFooter,
                        boxHeaderAlign: richTextToClone.boxHeaderAlign,
                        boxFooterAlign: richTextToClone.boxFooterAlign,
                        boxHeaderBg: richTextToClone.boxHeaderBg,
                        boxFooterBg: richTextToClone.boxFooterBg,
                        boxBodyBg: richTextToClone.boxBodyBg,
                        boxHeaderFontWeight: richTextToClone.boxHeaderFontWeight,
                        boxFooterFontWeight: richTextToClone.boxFooterFontWeight,
                        boxHeaderFontSize: richTextToClone.boxHeaderFontSize,
                        boxFooterFontSize: richTextToClone.boxFooterFontSize,
                        boxHeaderEmoji: richTextToClone.boxHeaderEmoji,
                        boxImportance: richTextToClone.boxImportance,
                    };

                    // Insert cloned rich text after the original in the sorted list
                    const updatedItems = [
                        ...items.slice(0, sourceIndex + 1),
                        { ...clonedRichText, type: 'rich-text' as const },
                        ...items.slice(sourceIndex + 1)
                    ];

                    // Re-assign positions and separate back into links and rich text
                    const finalLinks: Link[] = [];
                    const finalRichText: RichTextContent[] = [];

                    updatedItems.forEach((item, index) => {
                        const { type, ...rest } = item;
                        const itemWithPos = { ...rest, position: index };

                        if (type === 'link') {
                            finalLinks.push(itemWithPos as Link);
                        } else {
                            finalRichText.push(itemWithPos as RichTextContent);
                        }
                    });

                    return { ...section, links: finalLinks, richTextContent: finalRichText };
                })
            };
        }));
    };

    const handleUpdateRichTextScheduling = (tabId: string, sectionId: string, richTextId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                richTextContent: section.richTextContent?.map(richText =>
                                    richText.id === richTextId
                                        ? {
                                            ...richText,
                                            visibleFrom: visibleFrom || undefined,
                                            expiresAt: expiresAt || undefined
                                        }
                                        : richText
                                ) || []
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    const handleUpdateRichTextVisibility = (tabId: string, sectionId: string, richTextId: string, visibility: LinkVisibility) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                richTextContent: section.richTextContent?.map(richText =>
                                    richText.id === richTextId
                                        ? {
                                            ...richText,
                                            visibility: visibility,
                                            allowedUsers: visibility === 'private' ? richText.allowedUsers : undefined
                                        }
                                        : richText
                                ) || []
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    // Helper function to format browser name for display
    const formatBrowserName = (browserId: string | null | undefined): string => {
        if (!browserId || browserId === 'default') return '';
        return browserId
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase())
            .replace('Wsl', '(WSL)')
            .trim();
    };

    // Helper function to normalize browser ID (map aliases to full IDs)
    // IMPORTANT: We should NOT remove -wsl suffix - the extension's normalizeBrowserId handles that
    // The extension maps: edge-stable-wsl -> edge-stable (WSL), edge-stable -> edge-stable-local (Local)
    // So we must pass WSL browsers WITH the -wsl suffix to the extension
    const normalizeBrowserId = (browserId: string): string => {
        if (!browserId) return browserId;

        const normalized = browserId.toLowerCase().trim();

        // DO NOT remove -wsl suffix - pass it to the extension as-is
        // The extension's normalizeBrowserId will correctly map:
        // - edge-stable-wsl -> edge-stable (WSL browser)
        // - edge-stable -> edge-stable-local (Local browser)

        // Only handle short aliases that need mapping
        const shortAliases: Record<string, string> = {
            'edge': 'edge-stable-local',
            'chrome': 'chrome-stable-local'
        };

        if (shortAliases[normalized]) {
            return shortAliases[normalized];
        }

        // Return as-is - let the extension's normalizeBrowserId handle all WSL/local mapping
        // This is critical: WSL browsers must keep their -wsl suffix
        return browserId;
    };

    // Function to open link in a specific browser
    const openLinkInBrowser = (url: string, browserId: string) => {
        if (typeof window !== 'undefined' && (window as any).BrowserLauncher) {
            const BrowserLauncher = (window as any).BrowserLauncher;

            // Configure extension ID if provided
            if (settings.browser_extension_id) {
                BrowserLauncher.setExtensionId(settings.browser_extension_id);
            }

            // Normalize browser ID before opening
            const normalizedBrowserId = normalizeBrowserId(browserId);
            console.log('Opening link in browser:', url, 'browserId:', browserId, 'normalized:', normalizedBrowserId);

            // Open link in specified browser
            BrowserLauncher.open(url, normalizedBrowserId, { fallback: true }, (response: any) => {
                if (response && response.success !== false) {
                    console.log('Link opened successfully in browser:', normalizedBrowserId);
                } else {
                    // Fallback to default behavior if extension fails
                    console.warn('Browser extension failed, falling back to default:', response?.error);
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            }).catch((error: any) => {
                // Fallback to default behavior on error
                console.warn('Browser extension error, falling back to default:', error);
                window.open(url, '_blank', 'noopener,noreferrer');
            });
        } else {
            // Fallback to default behavior if BrowserLauncher is not available
            console.warn('BrowserLauncher not available, using default browser');
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCopy = async (e: React.MouseEvent, text: string, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            // Try modern Clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                setCopiedId(id);
                setTimeout(() => setCopiedId(null), 2000);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        setCopiedId(id);
                        setTimeout(() => setCopiedId(null), 2000);
                    } else {
                        console.error('Copy command failed');
                    }
                } catch (err) {
                    console.error('Fallback copy failed:', err);
                } finally {
                    document.body.removeChild(textArea);
                }
            }
        } catch (err) {
            console.error('Failed to copy text:', err);
            // Still show feedback even if copy fails
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    // Health Check Handlers
    const handleCheckTileHealth = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Cancel any in-flight auto/manual check before starting a fresh forced check
        healthCheckAbortRef.current?.abort();
        const abortController = new AbortController();
        healthCheckAbortRef.current = abortController;

        setCheckingHealth(true);
        try {
            const results = await linkHealthService.checkTileLinks(tile.id, true, abortController.signal);
            if (abortController.signal.aborted) return;
            if (results && typeof results === 'object') {
                setLinkHealth(prev => linkHealthService.mergeResults(prev, results));

                // Best-effort: also record per-URL client/server latency into Performance Analytics (if enabled).
                // This is intentionally fire-and-forget: health check UX must remain fast.
                void (async () => {
                    try {
                        if (abortController.signal.aborted) return;
                        const cfg = await performanceAnalyticsService.ensureLocation(undefined, { allowPrompt: true });
                        if (!cfg.enabled || abortController.signal.aborted) return;

                        const sections = getAllSections();
                        const allLinks = sections.flatMap(s => (s?.links || []));

                        const shouldTest = (url: string) => {
                            const patterns = cfg.beaconUrls || [];
                            if (!patterns.length) return true;
                            return patterns.some(p => url.includes(p));
                        };

                        const targets = allLinks
                            .filter(l => typeof l?.url === 'string' && (l.url.startsWith('http://') || l.url.startsWith('https://')))
                            .filter(l => shouldTest(l.url));

                        if (!targets.length) return;

                        const batchSize = 4;
                        const metrics: AnalyticsMetric[] = [];

                        for (let i = 0; i < targets.length; i += batchSize) {
                            if (abortController.signal.aborted) return;
                            const batch = targets.slice(i, i + batchSize);
                            const measured = await Promise.all(
                                batch.map(async (l) => {
                                    const m = await performanceAnalyticsService.measureUrlLatency(l.url);
                                    return { link: l, measured: m };
                                })
                            );

                            for (const item of measured) {
                                const linkId = item.link.id;
                                const health = (results as LinkHealthMap)[linkId];

                                // Client metric: always record (even if request failed or URL is invalid)
                                metrics.push({
                                    url: item.link.url,
                                    measurement_type: 'client',
                                    full_response_time: item.measured.durationMs,
                                    http_status_code: item.measured.httpStatus ?? 0,
                                    error_message: item.measured.error ?? null,
                                    ok: item.measured.ok,
                                    error_category: item.measured.errorCategory,
                                    response_type: item.measured.responseType,
                                    redirected: item.measured.redirected,
                                    final_url: item.measured.finalUrl,
                                    method: item.measured.method,
                                    cache_mode: item.measured.cacheMode,
                                    timeout_ms: item.measured.timeoutMs,
                                    attempted_at: item.measured.attemptedAt,
                                    tile_id: tile.id,
                                    link_id: item.link.id
                                });
                            }
                        }

                        if (abortController.signal.aborted) return;
                        // Force send on explicit user action ("Check Links") so it never gets skipped by sampling.
                        await performanceAnalyticsService.sendMetrics(metrics, { force: true });
                    } catch (err) {
                        // Never let analytics failures affect the user experience
                        console.debug('Performance analytics capture skipped:', err);
                    }
                })();
            } else {
                console.warn('Unexpected results format:', results);
            }
        } catch (error) {
            if (abortController.signal.aborted) return;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            // Don't alert on abort/navigation away
            if (error instanceof DOMException && error.name === 'AbortError') return;
            if (errorMessage.toLowerCase().includes('abort')) return;
            alert(`Failed to check link health: ${errorMessage}. Please try again.`);
        } finally {
            if (healthCheckAbortRef.current === abortController) {
                healthCheckAbortRef.current = null;
            }
            if (!abortController.signal.aborted) {
                setCheckingHealth(false);
            }
        }
    };

    const handleCheckSingleLink = async (linkId: string) => {
        setCheckingLinkId(linkId);
        setLinkHealth(prev => ({
            ...prev,
            [linkId]: { ...prev[linkId], status: 'checking' }
        }));

        try {
            const health = await linkHealthService.checkLink(linkId);
            if (!health || (health as any).skipped) {
                setLinkHealth(prev => {
                    const next = { ...prev };
                    delete next[linkId];
                    return next;
                });
                return;
            }
            setLinkHealth(prev => ({ ...prev, [linkId]: health }));
        } catch (error) {
            console.error('Failed to check link:', error);
            setLinkHealth(prev => ({
                ...prev,
                [linkId]: { ...prev[linkId], status: 'unknown', error: 'Check failed' }
            }));
        } finally {
            setCheckingLinkId(null);
        }
    };

    // Helper to get health indicator
    const getHealthIndicator = (linkId: string) => {
        const health = linkHealth[linkId];
        const status = health?.status || 'unknown';
        const colorClass = linkHealthService.getHealthColor(status);
        const label = linkHealthService.getHealthLabel(status);
        const errorText = health?.error ? `: ${health.error}` : '';

        return (
            <div
                className={`w-2 h-2 rounded-full ${colorClass} shrink-0`}
                title={`${label}${errorText}`}
            />
        );
    };

    // Filter links logic for View Mode
    // Get sections from tabs or directly (backward compatibility)
    const getAllSections = () => {
        if (tile.tabs && tile.tabs.length > 0) {
            // Flatten sections from all tabs
            return tile.tabs.flatMap(tab => tab.sections);
        }
        return tile.sections || [];
    };

    // Performance Analytics: automatic (sampled) scan when opening a tile with links.
    // This seeds URLs into analytics even if they fail/are invalid.
    const lastAutoScanRef = useRef<number>(0);
    useEffect(() => {
        void (async () => {
            try {
                const now = Date.now();
                // Avoid spamming if user navigates quickly
                if (now - lastAutoScanRef.current < 60_000) return;
                lastAutoScanRef.current = now;

                const cfg = await performanceAnalyticsService.getConfig();
                if (!cfg.enabled) return;

                const sections = getAllSections();
                const allLinks = sections.flatMap(s => (s?.links || []));
                if (!allLinks.length) return;

                const shouldTest = (url: string) => {
                    const patterns = cfg.beaconUrls || [];
                    if (!patterns.length) return true;
                    return patterns.some(p => url.includes(p));
                };

                const targets = allLinks
                    .filter(l => typeof l?.url === 'string' && l.url.trim().length > 0)
                    .filter(l => shouldTest(l.url));

                if (!targets.length) return;

                // Try to ensure location for accurate geographic performance data
                const cfgWithLoc = await performanceAnalyticsService.ensureLocation(cfg, { allowPrompt: true });
                if (!cfgWithLoc.enabled) return;

                const batchSize = 4;
                const metrics: AnalyticsMetric[] = [];

                for (let i = 0; i < targets.length; i += batchSize) {
                    const batch = targets.slice(i, i + batchSize);
                    const measured = await Promise.all(
                        batch.map(async (l) => {
                            const url = l.url;
                            if (url.startsWith('http://') || url.startsWith('https://')) {
                                const m = await performanceAnalyticsService.measureUrlLatency(url);
                                return { link: l, measured: m };
                            }
                            // Non-http(s): record as failure (0ms, status 0)
                            return {
                                link: l,
                                measured: {
                                    ok: false,
                                    durationMs: 0,
                                    httpStatus: 0,
                                    responseType: null,
                                    redirected: false,
                                    finalUrl: null,
                                    errorCategory: 'invalid_url',
                                    error: 'Non-http(s) URL',
                                    attemptedAt: Date.now(),
                                    method: 'HEAD',
                                    cacheMode: 'no-store',
                                    timeoutMs: 0
                                }
                            };
                        })
                    );

                    measured.forEach(item => {
                        metrics.push({
                            url: item.link.url,
                            measurement_type: 'client',
                            full_response_time: item.measured.durationMs,
                            http_status_code: item.measured.httpStatus ?? 0,
                            error_message: item.measured.error ?? null,
                            ok: item.measured.ok,
                            error_category: item.measured.errorCategory,
                            response_type: item.measured.responseType,
                            redirected: item.measured.redirected,
                            final_url: item.measured.finalUrl,
                            method: item.measured.method,
                            cache_mode: item.measured.cacheMode,
                            timeout_ms: item.measured.timeoutMs,
                            attempted_at: item.measured.attemptedAt,
                            tile_id: tile.id,
                            link_id: item.link.id
                        });
                    });
                }

                // Sampled send for background scans (respects sampleRate).
                await performanceAnalyticsService.sendMetrics(metrics);
            } catch {
                // ignore
            }
        })();
        // Intentionally only rescan when tile changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tile.id]);

    // Helper to check if content is visible based on schedule
    const isContentVisible = (item: { visibleFrom?: string; expiresAt?: string }) => {
        if (!item.visibleFrom && !item.expiresAt) return true;

        const now = new Date();

        if (item.visibleFrom) {
            const visibleFrom = new Date(item.visibleFrom);
            if (now < visibleFrom) return false;
        }

        if (item.expiresAt) {
            const expiresAt = new Date(item.expiresAt);
            if (now > expiresAt) return false;
        }

        return true;
    };

    // Helper to enforce public / authenticated / private visibility for the current viewer
    const canViewerSeeByVisibility = (item: {
        visibility?: LinkVisibility;
        allowedUsers?: number[];
        allowedGroups?: number[];
        hasRoleAccess?: boolean;
    }) => {
        const visibility = item.visibility || 'public';
        if (user?.is_admin) return true;
        if (visibility === 'public') return true;
        if (visibility === 'authenticated') return !!isAuthenticated && !!user;
        if (visibility === 'private') {
            if (!user) return false;
            const allowedUsers = item.allowedUsers || [];
            const allowedGroups = item.allowedGroups || [];
            if (allowedUsers.includes(user.id)) return true;
            if (item.hasRoleAccess === true) return true;
            // Group membership isn't available on the client; when groups are configured,
            // trust that the API already filtered and keep the item for authenticated users.
            if (allowedGroups.length > 0) return true;
            return false;
        }
        return true;
    };

    // Initialize selected tab: URL (shareable) > current/localStorage if valid > first visible tab
    useEffect(() => {
        if (tile.tabs && tile.tabs.length > 0) {
            // Sort tabs by position and filter visible ones
            const sortedTabs = [...tile.tabs]
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .filter(tab => isEditing || (isContentVisible(tab) && canViewerSeeByVisibility(tab))); // Show all in edit mode

            if (sortedTabs.length > 0) {
                const fromUrl = resolveTabId(sortedTabs, getTabParamFromHash());
                if (fromUrl) {
                    if (selectedTabId !== fromUrl) {
                        setSelectedTabId(fromUrl);
                    }
                    return;
                }

                const resolvedCurrent = resolveTabId(sortedTabs, selectedTabId);
                if (resolvedCurrent) {
                    if (selectedTabId !== resolvedCurrent) {
                        setSelectedTabId(resolvedCurrent);
                    }
                    return;
                }

                if (selectedTabId) {
                    try {
                        localStorage.removeItem(`tile_selected_tab_${tile.id}`);
                    } catch (error) {
                        console.error('Failed to remove invalid tab from localStorage:', error);
                    }
                }

                // No valid saved tab, select the first visible one
                setSelectedTabId(sortedTabs[0].id);
            }
        } else if (!tile.tabs || tile.tabs.length === 0) {
            // No tabs exist, clear the saved selection
            try {
                localStorage.removeItem(`tile_selected_tab_${tile.id}`);
            } catch (error) {
                console.error('Failed to clear tab selection from localStorage:', error);
            }
            setSelectedTabId(null);
        }
    }, [tile.tabs, selectedTabId, isEditing, tile.id]);

    // Keep the address bar in sync so the current tab can be shared
    useEffect(() => {
        if (!selectedTabId || !tile.tabs?.length) return;
        const tab = tile.tabs.find(t => t.id === selectedTabId);
        if (!tab) return;
        const param = tabParamFor(tab, tile.tabs);
        if (getTabParamFromHash() !== param) {
            writeTileHashTab(param, 'replace');
        }
    }, [selectedTabId, tile.id, tile.tabs]);

    useEffect(() => {
        const sectionId = getSectionParamFromHash();
        if (!sectionId) return;
        const timer = window.setTimeout(() => {
            const el = document.getElementById(`section-${sectionId}`);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('ring-2', 'ring-brand-400');
            window.setTimeout(() => {
                el.classList.remove('ring-2', 'ring-brand-400');
            }, 2500);
        }, 80);
        return () => window.clearTimeout(timer);
    }, [selectedTabId, tile.id]);

    // Browser back/forward (and hash edits) should change the visible tab
    useEffect(() => {
        const onHashChange = () => {
            if (!tile.tabs?.length) return;
            const resolved = resolveTabId(tile.tabs, getTabParamFromHash());
            if (resolved && resolved !== selectedTabIdRef.current) {
                setSelectedTabId(resolved);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [tile.tabs]);

    const getFilteredSections = () => {
        let sectionsToFilter = [];

        // If tabs exist, show sections from selected tab (or first visible tab if none selected yet)
        if (tile.tabs && tile.tabs.length > 0) {
            const sortedTabs = [...tile.tabs]
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .filter(tab => isEditing || (isContentVisible(tab) && canViewerSeeByVisibility(tab))); // Show all in edit mode

            // If selected tab is not visible (e.g. expired while viewing), switch to first visible
            let tabIdToUse = resolveTabId(sortedTabs, selectedTabId) || selectedTabId;
            if (tabIdToUse && !isEditing) {
                const selectedTab = tile.tabs.find(t => t.id === tabIdToUse);
                if (selectedTab && (!isContentVisible(selectedTab) || !canViewerSeeByVisibility(selectedTab))) {
                    tabIdToUse = null;
                }
            }

            tabIdToUse = tabIdToUse || (sortedTabs.length > 0 ? sortedTabs[0].id : null);

            if (tabIdToUse) {
                const selectedTab = tile.tabs.find(tab => tab.id === tabIdToUse);
                if (selectedTab && selectedTab.sections) {
                    // Sort sections by position
                    sectionsToFilter = [...selectedTab.sections].sort((a, b) => {
                        const posA = a.position ?? 0;
                        const posB = b.position ?? 0;
                        return posA - posB;
                    });
                } else {
                    sectionsToFilter = [];
                }
            }
        } else {
            // Otherwise, get all sections (backward compatibility - no tabs)
            sectionsToFilter = getAllSections();
        }

        // Filter sections and links by schedule + visibility in view mode
        // Apply role-based filtering ONLY if sourceTab is "your-apps"
        // For all other tabs (public, private, etc.), show all links based on their own visibility settings
        if (!isEditing) {
            // Only apply role-based filtering if we came from "Your Apps" tab
            // BUT for 'authenticated' tiles (which are now in Your Apps), we show full content
            // Tile admins/editors must see every link they manage (including newly added ones)
            const shouldApplyRoleFiltering =
                sourceTab === 'your-apps' &&
                tile.visibility !== 'authenticated' &&
                tile.canEdit !== true &&
                !user?.is_admin;

            sectionsToFilter = sectionsToFilter
                .filter(section => isContentVisible(section) && canViewerSeeByVisibility(section))
                .map(section => ({
                    ...section,
                    links: section.links.filter(link => {
                        // Always filter by schedule
                        if (!isContentVisible(link)) return false;
                        // Hide authenticated / private links from guests and unauthorized users
                        if (!canViewerSeeByVisibility(link)) return false;
                        // Only apply role-based filtering if source is "Your Apps" tab
                        // For all other tabs (public, private, authenticated), show all links based on their visibility
                        if (shouldApplyRoleFiltering) {
                            return link.hasRoleAccess === true;
                        }
                        return true;
                    }),
                    richTextContent: (section.richTextContent || []).filter(rt =>
                        isContentVisible(rt) && canViewerSeeByVisibility(rt)
                    )
                }))
                .filter(section =>
                    section.links.length > 0 ||
                    (section.richTextContent?.length ?? 0) > 0
                );
        }

        // Apply search filter if search term exists
        if (!searchTerm) return sectionsToFilter;

        const lowerSearch = searchTerm.toLowerCase();
        return sectionsToFilter.map(section => ({
            ...section,
            links: section.links.filter(link =>
                link.label.toLowerCase().includes(lowerSearch) ||
                link.url.toLowerCase().includes(lowerSearch)
            ),
            richTextContent: (section.richTextContent || []).filter(rt =>
                rt.content.toLowerCase().includes(lowerSearch)
            )
        })).filter(section =>
            section.links.length > 0 ||
            (section.richTextContent?.length ?? 0) > 0
        );
    };

    const filteredSections = getFilteredSections();
    const allSections = getAllSections();
    const totalLinks = allSections?.reduce((acc, s) => acc + (s.links?.length || 0), 0) || 0;

    // Get tabs for view mode (for tab navigation) - sort by position and filter by schedule + visibility
    const displayTabs = tile.tabs && tile.tabs.length > 0
        ? [...tile.tabs]
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .filter(tab => isEditing || (isContentVisible(tab) && canViewerSeeByVisibility(tab))) // Show all in edit mode
        : [];
    const activeViewTab = displayTabs.find((tab) => tab.id === selectedTabId || tab.id === resolveTabId(displayTabs, selectedTabId));


    // VIEW MODE (also used when the URL asked for edit but this session cannot edit)
    if (!isEditing || !tile.canEdit) {
        return (
            <>
                {/* Mobile page-animation picker lives outside the sidebar so closing the drawer keeps the dialog open */}
                {tile.canEdit && (
                    <TileAnimationSelector
                        key={`page-anim-mobile-persistent-${tile.id}-${tile.pageAnimation || 'none'}`}
                        animationsOnly
                        persistGlobal={false}
                        hideTrigger
                        open={mobilePageAnimOpen}
                        onOpenChange={setMobilePageAnimOpen}
                        value={(tile.pageAnimation as TileAnimation) || 'none'}
                        onAnimationChange={async (animation) => {
                            const next = animation && animation !== 'none' ? animation : undefined;
                            const updatedTile: Tile = {
                                ...tile,
                                pageAnimation: next,
                            };
                            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
                            try {
                                await updateTilePageAnimation(tile.id, next ?? null);
                                onUpdateTiles(updatedTiles, true, false, true);
                            } catch (e) {
                                console.error('Failed to save page animation:', e);
                                alert(e instanceof Error ? e.message : 'Failed to save page animation');
                            }
                        }}
                        scopeLabel="SECTIONS ANIMATION"
                        scopeHint="Animates whole link sections on this page"
                        buttonTitle="Choose entrance animation for link sections"
                    />
                )}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 min-h-[80vh] flex flex-col w-full pb-10">

                    {/* Compact Modern Header */}
                    <div className="linknest-content-header relative rounded-2xl overflow-hidden mb-6 group border border-slate-200 dark:border-slate-700/50 shadow-lg dark:shadow-none isolate">
                        {/* Ambient Background - rounded to match parent and avoid corner artifacts */}
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${styles.gradient} opacity-90 dark:opacity-20`}></div>
                        {/* Light mode overlay - solid overlay instead of backdrop-blur to avoid corner notch artifacts */}
                        <div className="absolute inset-0 rounded-2xl bg-white/10 dark:bg-slate-900/60"></div>

                        <div className="relative z-10 px-6 py-6 flex flex-col md:flex-row items-center gap-6">

                            {/* Icon Box */}
                            <div className={`
                    linknest-content-link-icon w-16 h-16 rounded-2xl ${styles.base} shadow-xl shadow-black/10 dark:shadow-black/20 
                    flex items-center justify-center text-3xl shrink-0 border-t border-white/20 text-white
                `}>
                                {tile.emoji}
                            </div>

                            {/* Title & Meta */}
                            <div className="flex-1 min-w-0 text-center md:text-left">
                                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                                    <h1 className="linknest-content-title text-2xl md:text-3xl font-bold text-white tracking-tight">
                                        {tile.title}
                                    </h1>
                                    {showShortUrls ? (
                                    <ShortUrlActions
                                        targetType="tile"
                                        targetId={tile.id}
                                        shortUrl={shortOf('tile', tile.id, tile.shortUrl)}
                                        canRecycle={canRecycleShortUrl}
                                        onRecycled={({ shortUrl }) => applyRecycledShortUrl('tile', tile.id, shortUrl)}
                                    />
                                    ) : null}
                                </div>
                                <p className="text-white/80 dark:text-slate-400 text-sm font-medium dark:font-normal">{tile.description}</p>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-3 justify-center md:justify-end w-full md:w-auto">
                                {/* Desktop controls */}
                                <div className="hidden md:flex items-center gap-3 flex-wrap justify-end">
                                    {tile.canEdit && (
                                        <label
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium border border-white/20 cursor-pointer backdrop-blur-sm select-none"
                                            title="Show LinkNest short URLs instead of original destinations (hover, copy, and QR)"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={showShortUrls}
                                                onChange={(e) => { void persistShowShortUrls(e.target.checked); }}
                                                className="rounded border-white/40 text-brand-600 focus:ring-white/50"
                                            />
                                            <span>Short URLs</span>
                                        </label>
                                    )}
                                    {/* Space page entrance animation — applies to whole link sections */}
                                    {tile.canEdit && (
                                        <div className="relative flex items-center">
                                            <TileAnimationSelector
                                                key={`page-anim-${tile.id}-${tile.pageAnimation || 'none'}`}
                                                animationsOnly
                                                persistGlobal={false}
                                                value={(tile.pageAnimation as TileAnimation) || 'none'}
                                                onAnimationChange={async (animation) => {
                                                    const next = animation && animation !== 'none' ? animation : undefined;
                                                    const updatedTile: Tile = {
                                                        ...tile,
                                                        pageAnimation: next,
                                                    };
                                                    const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
                                                    try {
                                                        await updateTilePageAnimation(tile.id, next ?? null);
                                                        onUpdateTiles(updatedTiles, true, false, true);
                                                    } catch (e) {
                                                        console.error('Failed to save page animation:', e);
                                                        alert(e instanceof Error ? e.message : 'Failed to save page animation');
                                                    }
                                                }}
                                                scopeLabel="SECTIONS ANIMATION"
                                                scopeHint="Animates whole link sections on this page"
                                                buttonTitle="Choose entrance animation for link sections"
                                            />
                                        </div>
                                    )}
                                    {/* Export single space */}
                                    <button
                                        onClick={() => exportTileToFileAsync(tile)}
                                        className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center justify-center gap-2 backdrop-blur-sm"
                                        title="Export this space as JSON"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                                            <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
                                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                        </svg>
                                        <span>Export</span>
                                    </button>
                                    {/* Check All Links Button */}
                                    <button
                                        onClick={(e) => handleCheckTileHealth(e)}
                                        disabled={checkingHealth}
                                        className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center justify-center gap-2 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Check all links in this tile"
                                        type="button"
                                    >
                                        {checkingHealth ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span>Checking...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                                </svg>
                                                <span>Check Links</span>
                                            </>
                                        )}
                                    </button>

                                    {tile.sharedWithMeInvitationId && isAuthenticated && (
                                        <button
                                            onClick={async () => {
                                                if (!confirm('Remove this shared tile from your Private tab? You can accept it again if the owner shares it with you later.')) return;
                                                try {
                                                    await removeSharedTile(tile.sharedWithMeInvitationId!);
                                                    const freshTiles = await getTiles();
                                                    onUpdateTiles(freshTiles);
                                                    window.location.hash = '#/';
                                                    setTimeout(() => {
                                                        window.dispatchEvent(new CustomEvent('switchTab', { detail: 'private' }));
                                                    }, 100);
                                                } catch (e) {
                                                    alert(e instanceof Error ? e.message : 'Failed to remove');
                                                }
                                            }}
                                            className="px-4 py-2 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-white text-sm font-medium border border-amber-400/50 transition-all shadow-sm flex items-center justify-center gap-2 backdrop-blur-sm"
                                            title="Remove from my Private tab"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                            </svg>
                                            <span>Remove from my Private tab</span>
                                        </button>
                                    )}
                                    {isAuthenticated && tile.canEdit === true && (
                                        <>
                                            <button
                                                onClick={async () => {
                                                    if (tile.canEdit !== true) {
                                                        alert('You do not have permission to edit this tile.');
                                                        return;
                                                    }
                                                    setEditingMode(true);
                                                }}
                                                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center justify-center gap-2 backdrop-blur-sm"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                                </svg>
                                                <span>Edit</span>
                                            </button>
                                            {(user?.is_admin || tile.canCloneTile === true) && (
                                                <button
                                                    onClick={async () => {
                                                        if (!isAuthenticated) {
                                                            if (onAuthRequired) onAuthRequired();
                                                            return;
                                                        }
                                                        if (!tile.canEdit && !user?.is_admin) {
                                                            alert('You do not have permission to clone this space.');
                                                            return;
                                                        }
                                                        try {
                                                            await cloneTile(tile.id);
                                                            const freshTiles = await getTiles();
                                                            onUpdateTiles(freshTiles);
                                                            alert('Space cloned successfully!');
                                                        } catch (error) {
                                                            console.error('Failed to clone tile:', error);
                                                            alert('Failed to clone space. Please try again.');
                                                        }
                                                    }}
                                                    className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center justify-center gap-2 backdrop-blur-sm"
                                                    title="Clone this space"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                                    </svg>
                                                    <span>Clone</span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {(sourceTab === 'public' || sourceTab === null) && user?.is_admin && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const updatedTile = { ...tile, sourceTab: 'staging' as const };
                                                    await saveTile(updatedTile);
                                                    onUpdateTiles(allTiles.filter(t => t.id !== tile.id));
                                                    window.location.hash = '#/';
                                                } catch (e) {
                                                    console.error('Failed to move tile to staging', e);
                                                    alert('Failed to move tile to staging. Please try again.');
                                                }
                                            }}
                                            className="p-2 rounded-lg bg-slate-500/80 hover:bg-slate-600 text-white border border-slate-400/50 transition-all backdrop-blur-sm flex items-center justify-center gap-1.5"
                                            title="Move to Staging tab"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                            </svg>
                                            <span className="text-sm font-medium">Move to Staging</span>
                                        </button>
                                    )}
                                    {sourceTab === 'staging' && user?.is_admin && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const updatedTile = { ...tile, sourceTab: 'public' as const };
                                                    await saveTile(updatedTile);
                                                    const updatedTilesArray = allTiles.map(t => t.id === tile.id ? updatedTile : t);
                                                    if (allTiles.every(t => t.id !== tile.id)) {
                                                        updatedTilesArray.push(updatedTile);
                                                    }
                                                    onUpdateTiles(updatedTilesArray);
                                                    window.location.hash = '#/';
                                                } catch (e) {
                                                    console.error('Failed to move tile to public', e);
                                                    alert('Failed to move tile to public. Please try again.');
                                                }
                                            }}
                                            className="p-2 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-white border border-amber-400/50 transition-all backdrop-blur-sm flex items-center justify-center gap-1.5"
                                            title="Move to Public tab"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                            </svg>
                                            <span className="text-sm font-medium">Move to Public</span>
                                        </button>
                                    )}
                                </div>

                                {/* Mobile: hamburger opens slide-out sidebar */}
                                <div className="md:hidden flex items-center gap-2" ref={headerActionsMenuRef}>
                                    <button
                                        type="button"
                                        onClick={() => setShowHeaderActionsMenu(prev => !prev)}
                                        className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all shadow-sm flex items-center justify-center backdrop-blur-sm"
                                        title="Open menu"
                                        aria-expanded={showHeaderActionsMenu}
                                        aria-haspopup="dialog"
                                        aria-label="Open actions menu"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                            <path d="M3 12h18M3 6h18M3 18h18" />
                                        </svg>
                                    </button>

                                    {showHeaderActionsMenu && createPortal(
                                        <>
                                            {/* Overlay */}
                                            <div
                                                className="fixed inset-0 bg-black/50 z-[10040] transition-opacity duration-300 md:hidden"
                                                aria-hidden="true"
                                                onClick={() => setShowHeaderActionsMenu(false)}
                                            />
                                            {/* Sidebar drawer */}
                                            <div
                                                role="dialog"
                                                aria-modal="true"
                                                aria-label="Space actions"
                                                className="fixed left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-[10050] shadow-2xl transform transition-transform duration-300 ease-out translate-x-0 md:hidden flex flex-col"
                                                style={{ boxShadow: '4px 0 24px rgba(0, 0, 0, 0.15)' }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {/* Drawer header */}
                                                <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                                                    <div className="min-w-0 flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl ${styles.base} flex items-center justify-center text-xl text-white shrink-0`}>
                                                            {tile.emoji}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{tile.title}</h2>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide font-semibold">Actions</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowHeaderActionsMenu(false)}
                                                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                                                        aria-label="Close menu"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                        </svg>
                                                    </button>
                                                </div>

                                                <div className="flex-1 overflow-y-auto py-3">
                                                    {tile.canEdit && (
                                                        <div className="px-4 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Animation</p>
                                                            <button
                                                                type="button"
                                                                onClick={() => setMobilePageAnimOpen(true)}
                                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all shadow-sm"
                                                                title="Choose entrance animation for link sections"
                                                            >
                                                                <span className="text-lg">{getAnimationOption((tile.pageAnimation as TileAnimation) || 'none').icon}</span>
                                                                <div className="flex flex-col items-start min-w-0 flex-1">
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Animation</span>
                                                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                                                        {getAnimationOption((tile.pageAnimation as TileAnimation) || 'none').name}
                                                                    </span>
                                                                </div>
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
                                                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {tile.canEdit && (
                                                        <div className="px-4 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
                                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={showShortUrls}
                                                                    onChange={(e) => { void persistShowShortUrls(e.target.checked); }}
                                                                    className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                                                                />
                                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show short URLs instead of original URLs</span>
                                                            </label>
                                                        </div>
                                                    )}

                                                    <div className="space-y-1 px-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowHeaderActionsMenu(false);
                                                                exportTileToFileAsync(tile);
                                                            }}
                                                            className="w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true">
                                                                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
                                                                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                                            </svg>
                                                            Export
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={checkingHealth}
                                                            onClick={(e) => {
                                                                setShowHeaderActionsMenu(false);
                                                                handleCheckTileHealth(e);
                                                            }}
                                                            className="w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 disabled:opacity-50"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0">
                                                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                                            </svg>
                                                            {checkingHealth ? 'Checking...' : 'Check Links'}
                                                        </button>
                                                        {tile.sharedWithMeInvitationId && isAuthenticated && (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    setShowHeaderActionsMenu(false);
                                                                    if (!confirm('Remove this shared tile from your Private tab? You can accept it again if the owner shares it with you later.')) return;
                                                                    try {
                                                                        await removeSharedTile(tile.sharedWithMeInvitationId!);
                                                                        const freshTiles = await getTiles();
                                                                        onUpdateTiles(freshTiles);
                                                                        window.location.hash = '#/';
                                                                        setTimeout(() => {
                                                                            window.dispatchEvent(new CustomEvent('switchTab', { detail: 'private' }));
                                                                        }, 100);
                                                                    } catch (e) {
                                                                        alert(e instanceof Error ? e.message : 'Failed to remove');
                                                                    }
                                                                }}
                                                                className="w-full px-3 py-3 text-left text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg flex items-center gap-3"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
                                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                </svg>
                                                                Remove from Private
                                                            </button>
                                                        )}
                                                        {isAuthenticated && tile.canEdit === true && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setShowHeaderActionsMenu(false);
                                                                        if (tile.canEdit !== true) {
                                                                            alert('You do not have permission to edit this tile.');
                                                                            return;
                                                                        }
                                                                        setEditingMode(true);
                                                                    }}
                                                                    className="w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0">
                                                                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                                                    </svg>
                                                                    Edit
                                                                </button>
                                                                {(user?.is_admin || tile.canCloneTile === true) && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={async () => {
                                                                            setShowHeaderActionsMenu(false);
                                                                            if (!isAuthenticated) {
                                                                                if (onAuthRequired) onAuthRequired();
                                                                                return;
                                                                            }
                                                                            if (!tile.canEdit && !user?.is_admin) {
                                                                                alert('You do not have permission to clone this space.');
                                                                                return;
                                                                            }
                                                                            try {
                                                                                await cloneTile(tile.id);
                                                                                const freshTiles = await getTiles();
                                                                                onUpdateTiles(freshTiles);
                                                                                alert('Space cloned successfully!');
                                                                            } catch (error) {
                                                                                console.error('Failed to clone tile:', error);
                                                                                alert('Failed to clone space. Please try again.');
                                                                            }
                                                                        }}
                                                                        className="w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0">
                                                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                                                        </svg>
                                                                        Clone
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        {(sourceTab === 'public' || sourceTab === null) && user?.is_admin && (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    setShowHeaderActionsMenu(false);
                                                                    try {
                                                                        const updatedTile = { ...tile, sourceTab: 'staging' as const };
                                                                        await saveTile(updatedTile);
                                                                        onUpdateTiles(allTiles.filter(t => t.id !== tile.id));
                                                                        window.location.hash = '#/';
                                                                    } catch (e) {
                                                                        console.error('Failed to move tile to staging', e);
                                                                        alert('Failed to move tile to staging. Please try again.');
                                                                    }
                                                                }}
                                                                className="w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0">
                                                                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                                                </svg>
                                                                Move to Staging
                                                            </button>
                                                        )}
                                                        {sourceTab === 'staging' && user?.is_admin && (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    setShowHeaderActionsMenu(false);
                                                                    try {
                                                                        const updatedTile = { ...tile, sourceTab: 'public' as const };
                                                                        await saveTile(updatedTile);
                                                                        const updatedTilesArray = allTiles.map(t => t.id === tile.id ? updatedTile : t);
                                                                        if (allTiles.every(t => t.id !== tile.id)) {
                                                                            updatedTilesArray.push(updatedTile);
                                                                        }
                                                                        onUpdateTiles(updatedTilesArray);
                                                                        window.location.hash = '#/';
                                                                    } catch (e) {
                                                                        console.error('Failed to move tile to public', e);
                                                                        alert('Failed to move tile to public. Please try again.');
                                                                    }
                                                                }}
                                                                className="w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0">
                                                                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                                                </svg>
                                                                Move to Public
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </>,
                                        document.body
                                    )}
                                </div>

                                {/* Back stays visible on all screen sizes */}
                                <button
                                    onClick={goBackToDashboard}
                                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all backdrop-blur-sm flex items-center justify-center"
                                    title="Back to Dashboard (Esc)"
                                    aria-label="Back to Dashboard"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar - Now at the top */}
                    <div className="mb-6">
                        <div className="bg-white dark:bg-slate-900/50 backdrop-blur border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <div className="relative flex-1 w-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Find link..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-slate-600 focus:border-brand-500 rounded-lg pl-10 pr-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none transition-all"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium uppercase tracking-wider">
                                        <span>Total Links</span>
                                        <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 font-semibold">{totalLinks}</span>
                                    </div>

                                    {/* View Layout Toggle */}
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">View:</span>
                                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                            <button
                                                type="button"
                                                onClick={() => setViewLayout('stacked')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewLayout === 'stacked'
                                                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                                title="Stacked list — links appear vertically (combine with side-by-side sections)"
                                                aria-label="Stacked list view"
                                                aria-pressed={viewLayout === 'stacked'}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 4.5zM2 10a2.5 2.5 0 012.5-2.5h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 10zM4.5 13.5A2.5 2.5 0 002 16a2.5 2.5 0 002.5 2.5h11a2.5 2.5 0 000-5h-11z" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Independent toggle: keep stacked/grid/compact/qr (or columns) link mode as-is
                                                    setSectionsSideBySide((prev) => !prev);
                                                }}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sectionsSideBySide
                                                    ? 'bg-orange-500 text-white shadow-sm ring-1 ring-orange-600/40 dark:bg-orange-500 dark:text-white dark:ring-orange-400/50'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400'
                                                    }`}
                                                title="Side-by-side sections — sticky toggle (orange when on); works with any link view"
                                                aria-label="Toggle side-by-side sections"
                                                aria-pressed={sectionsSideBySide}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M2 4.5A2.5 2.5 0 014.5 2h3A2.5 2.5 0 0110 4.5v11A2.5 2.5 0 017.5 18h-3A2.5 2.5 0 012 15.5v-11zM10.5 2A2.5 2.5 0 0013 4.5v11a2.5 2.5 0 01-2.5 2.5H13a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0013 2h-.5z" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewLayout('grid')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewLayout === 'grid'
                                                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                                title="Grid cards - links as compact visual cards"
                                                aria-label="Grid cards view"
                                                aria-pressed={viewLayout === 'grid'}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewLayout('compact')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewLayout === 'compact'
                                                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                                title="Compact list - dense single-line links"
                                                aria-label="Compact list view"
                                                aria-pressed={viewLayout === 'compact'}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            {isLinkActionAllowed('qr') && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // QR needs full-width section cards — sync top view so section icons match content
                                                    setSyncSectionViews(true);
                                                    setViewLayout('qr');
                                                }}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewLayout === 'qr'
                                                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                                title="QR codes - scannable codes for each link"
                                                aria-label="QR code view"
                                                aria-pressed={viewLayout === 'qr'}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 014.5 2h3A1.5 1.5 0 019 3.5v3A1.5 1.5 0 017.5 8h-3A1.5 1.5 0 013 6.5v-3zM4.5 3.5v3h3v-3h-3zM11 3.5A1.5 1.5 0 0112.5 2h3A1.5 1.5 0 0117 3.5v3A1.5 1.5 0 0115.5 8h-3A1.5 1.5 0 0111 6.5v-3zm1.5 0v3h3v-3h-3zM3 12.5A1.5 1.5 0 014.5 11h3A1.5 1.5 0 019 12.5v3A1.5 1.5 0 017.5 17h-3A1.5 1.5 0 013 15.5v-3zm1.5 0v3h3v-3h-3zM12.5 11a.75.75 0 01.75-.75h1a.75.75 0 01.75.75v1a.75.75 0 01-.75.75h-1a.75.75 0 01-.75-.75v-1zM11 14.25a.75.75 0 01.75-.75H13a.75.75 0 010 1.5h-1.25a.75.75 0 01-.75-.75zM14.25 14a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zM11 16.75a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zM15.5 11.75a.75.75 0 01.75-.75H17a.75.75 0 010 1.5h-.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            )}
                                        </div>
                                        {viewLayout === 'qr' && isLinkActionAllowed('qr') && (
                                            <button
                                                type="button"
                                                onClick={() => void handlePrintAllQrCodes()}
                                                className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
                                                title="Print all QR codes on this page"
                                                aria-label="Print all QR codes"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4" aria-hidden>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0H6.34m11.318 0h1.152c.95 0 1.745-.695 1.885-1.63l.583-4.083A1.876 1.876 0 0019.25 9.75H4.75a1.875 1.875 0 00-1.863 2.114l.583 4.083c.14.935.935 1.63 1.885 1.63H6.34" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75V6A2.25 2.25 0 0110.5 3.75h3A2.25 2.25 0 0115.75 6v3.75" />
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setSyncSectionViews((prev) => !prev)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                                syncSectionViews
                                                    ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                            }`}
                                            title={syncSectionViews
                                                ? 'Top View controls all sections. Click to allow per-section layouts.'
                                                : 'Sections use their own layouts. Click so top View controls all sections.'}
                                            aria-pressed={syncSectionViews}
                                            aria-label="Apply top view to all sections"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                {syncSectionViews ? (
                                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                ) : (
                                                    <path d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z" />
                                                )}
                                            </svg>
                                            <span className="hidden sm:inline">{syncSectionViews ? 'Sections follow top' : 'Per-section views'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rolling Messages Display - Below Search Bar */}
                    {activeMessages.length > 0 && (
                        <div className="mb-2 w-full group/message relative cursor-help">
                            {/* Custom Instant Tooltip - Optimized for Large Detail View */}
                            <div
                                className="tooltip-force-black absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-yellow-400 text-[10px] rounded-lg shadow-xl opacity-0 translate-y-2 group-hover/message:opacity-100 group-hover/message:translate-y-0 transition-all duration-200 pointer-events-none z-[100] border border-yellow-500 w-max max-w-[400px] text-left"
                            >
                                {activeMessages.map((m, idx) => (
                                    <div key={m.id} className="last:mb-0 mb-1 leading-tight">
                                        {activeMessages.length > 1 && <span className="opacity-50 mr-1">{idx + 1}.</span>}
                                        {stripFormatting(m.content)}
                                    </div>
                                ))}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-yellow-400"></div>
                            </div>

                            <div className={`relative h-6 flex items-center overflow-hidden ${!activeMessages[0].textColor ? (
                                activeMessages[0].type === 'alert' ? 'text-amber-600 dark:text-amber-400' :
                                    activeMessages[0].type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                                        activeMessages[0].type === 'celebration' ? 'text-pink-600 dark:text-pink-400' :
                                            'text-brand-600 dark:text-brand-400'
                            ) : ''}`}
                                style={activeMessages[0].textColor ? {
                                    // Only set color on parent if custom color is set, to override tile text color
                                    color: activeMessages[0].textColor
                                } : undefined}
                            >
                                {(() => {
                                    // Check if all messages use rollover animation
                                    const allRollover = activeMessages.length > 0 && activeMessages.every(msg => !msg.animationType || msg.animationType === 'rollover');

                                    if (allRollover) {
                                        // Rollover animation - stock ticker style: single copy, right-to-left, pause when fully gone
                                        return (
                                            <div className="animate-rolling-detail flex items-center gap-10 text-sm font-semibold">
                                                {activeMessages.map((msg, idx) => (
                                                    <div
                                                        key={`${msg.id}-${idx}`}
                                                        className="flex items-center gap-2 shrink-0"
                                                        style={{
                                                            ...(msg.textColor ? { '--message-text-color': msg.textColor, color: msg.textColor } : {}),
                                                            fontStyle: msg.fontStyle === 'italic' || msg.fontStyle === 'bold italic' ? 'italic' : undefined,
                                                            fontWeight: msg.fontStyle === 'bold' || msg.fontStyle === 'bold italic' ? 'bold' : undefined
                                                        } as React.CSSProperties}
                                                        data-message-color={msg.textColor || ''}
                                                    >
                                                        {renderMessageContent(msg.content)}
                                                        {msg.url && (
                                                            <a
                                                                href={msg.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                                                                onClick={(e) => e.stopPropagation()}
                                                                title={msg.urlLabel || 'Click for more info'}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                                                    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                                                </svg>
                                                                {msg.urlLabel || 'Info'}
                                                            </a>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    } else {
                                        // Other animations - show one message at a time, cycle through them
                                        const currentMsg = activeMessages[currentMessageIndex] || activeMessages[0];

                                        if (!currentMsg) {
                                            return null;
                                        }

                                        const currentAnimationType = currentMsg.animationType || 'rollover';
                                        const animationClass = getMessageAnimationClass(currentAnimationType);

                                        return (
                                            <div className={`flex items-center gap-2 text-sm font-semibold ${animationClass}`}>
                                                <div
                                                    key={`${currentMsg.id}-current`}
                                                    className="flex items-center gap-1"
                                                    style={{
                                                        ...(currentMsg.textColor ? { '--message-text-color': currentMsg.textColor, color: currentMsg.textColor } : {}),
                                                        fontStyle: currentMsg.fontStyle === 'italic' || currentMsg.fontStyle === 'bold italic' ? 'italic' : undefined,
                                                        fontWeight: currentMsg.fontStyle === 'bold' || currentMsg.fontStyle === 'bold italic' ? 'bold' : undefined
                                                    } as React.CSSProperties}
                                                    data-message-color={currentMsg.textColor || ''}
                                                >
                                                    {renderMessageContent(currentMsg.content)}
                                                    {currentMsg.url && (
                                                        <a
                                                            href={currentMsg.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title={currentMsg.urlLabel || 'Click for more info'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                                                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                                            </svg>
                                                            {currentMsg.urlLabel || 'Info'}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Main Content Area - Full Width */}
                    <div className="flex flex-col gap-8">
                        {/* Mobile HTML Content */}
                        {tile.htmlContent && (
                            <div className="lg:hidden bg-white dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm">
                                <div
                                    className="ln-tinymce-content text-slate-700 dark:text-slate-200"
                                    dangerouslySetInnerHTML={{ __html: prepareViewerHtml(tile.htmlContent) }}
                                />
                            </div>
                        )}

                        {/* Desktop HTML Content - Now above tabs */}
                        {tile.htmlContent && (
                            <div className="hidden lg:block bg-white dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                                <div
                                    className="ln-tinymce-content text-slate-700 dark:text-slate-200"
                                    dangerouslySetInnerHTML={{ __html: prepareViewerHtml(tile.htmlContent) }}
                                />
                            </div>
                        )}

                        {/* Tab Navigation */}
                        {displayTabs && displayTabs.length > 0 && (
                            <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-sm rounded-t-xl">
                                <div className="flex gap-2 min-w-max py-1 px-2">
                                    {displayTabs.map((tab) => {
                                        const isActive = tab.id === selectedTabId || tab.id === resolveTabId(displayTabs, selectedTabId);
                                        const tabSections = tab.sections || [];
                                        // Only apply role-based filtering if source is "Your Apps" tab
                                        // Tile editors see all links (including newly added ones not yet role-filtered in UI)
                                        const shouldApplyRoleFiltering =
                                            sourceTab === 'your-apps' &&
                                            tile.canEdit !== true &&
                                            !user?.is_admin;
                                        // Count links, filtering by role access if needed
                                        const tabLinksCount = tabSections.reduce((acc, s) => {
                                            const links = s.links || [];
                                            const filteredLinks = shouldApplyRoleFiltering
                                                ? links.filter(link => link.hasRoleAccess === true)
                                                : links;
                                            return acc + filteredLinks.length;
                                        }, 0);

                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={async () => {
                                                    if (!isEditing) {
                                                        const allowed = await assertCanOpen('tab', tab.id, {
                                                            rules: [tile.accessRestrictions, tab.accessRestrictions],
                                                        });
                                                        if (!allowed) return;
                                                    }
                                                    setSelectedTabId(tab.id);
                                                    writeTileHashTab(tabParamFor(tab, displayTabs), 'push', null);
                                                }}
                                                data-active={isActive}
                                                className={`linknest-content-tab relative px-5 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap rounded-lg ${isActive
                                                    ? `${styles.text} font-semibold`
                                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                                    }`}
                                                style={tab.textColor && isActive ? { color: tab.textColor } : undefined}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {tab.emoji ? (
                                                        <span className="shrink-0 leading-none" aria-hidden>{tab.emoji}</span>
                                                    ) : null}
                                                    {tab.title}
                                                    <AccessRestrictionsBadge rules={tab.accessRestrictions} />
                                                    {(tile.canEdit === true || !!user?.is_admin) && (
                                                        <VisibilityProtectionBadge visibility={tab.visibility} />
                                                    )}
                                                    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                                                        {effectiveShowShortUrls(showShortUrls, tab) ? (
                                                        <ShortUrlActions
                                                            targetType="tab"
                                                            targetId={tab.id}
                                                            shortUrl={shortOf('tab', tab.id, tab.shortUrl)}
                                                            canRecycle={canRecycleShortUrl}
                                                            compact
                                                            onRecycled={({ shortUrl }) => applyRecycledShortUrl('tab', tab.id, shortUrl)}
                                                        />
                                                        ) : null}
                                                    </span>
                                                    {tabLinksCount > 0 && (
                                                        <span className={`px-2 py-0.5 text-xs rounded-full font-semibold transition-colors ${isActive
                                                            ? `${styles.iconBg} ${styles.text}`
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                            }`}>
                                                            {tabLinksCount}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {filteredSections.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-600 mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                </div>
                                <p className="text-slate-500 font-medium">No links found</p>
                            </div>
                        ) : (
                            <div
                                ref={qrPrintRootRef}
                                className={sectionsSideBySide ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-8'}
                                data-sections-layout={sectionsSideBySide ? 'side-by-side' : 'stacked'}
                                data-view-layout={viewLayout}
                                data-qr-print-all=""
                            >
                                {filteredSections.map((section, sectionIndex) => {
                                    // Per-section link layout: saved preference > forceStackedView > global view
                                    const shouldForceStacked = section.forceStackedView === true;
                                    const sectionLinkLayout = getSectionLinkLayout(section);
                                    const isQrLayout = sectionLinkLayout === 'qr';
                                    const resolvedLinkContainerClass =
                                        sectionLinkLayout === 'grid'
                                            ? 'linknest-content-link-grid-cards'
                                            : sectionLinkLayout === 'compact'
                                                ? 'linknest-content-link-list-compact'
                                                : isQrLayout
                                                    ? 'linknest-qr-grid'
                                                    : sectionLinkLayout === 'stacked'
                                                        ? 'space-y-4'
                                                        : 'linknest-content-link-grid';

                                    return (
                                        <div
                                            key={section.id}
                                            id={`section-${section.id}`}
                                            style={{ animationDelay: isQrLayout ? undefined : `${sectionIndex * 120}ms` }}
                                            data-view-layout={sectionLinkLayout}
                                            data-qr-print-section={isQrLayout ? section.id : undefined}
                                            data-qr-print-title={isQrLayout ? (`${section.emoji ? `${section.emoji} ` : ''}${section.title || ''}`) : undefined}
                                            className={`linknest-content-section bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm relative ${
                                                isQrLayout
                                                    ? 'p-4 overflow-hidden col-span-full'
                                                    : sectionLinkLayout === 'compact'
                                                        ? 'p-4'
                                                        : 'p-6'
                                            } ${
                                                !isQrLayout && tile.pageAnimation && tile.pageAnimation !== 'none'
                                                    ? getTileAnimationClass(tile.pageAnimation as TileAnimation)
                                                    : isQrLayout
                                                        ? ''
                                                        : 'animate-in fade-in slide-in-from-bottom-2'
                                            }`}
                                        >
                                            {/* Section Title + per-section link view toggle */}
                                            <div className={`flex items-start justify-between gap-3 ${sectionLinkLayout === 'compact' || isQrLayout ? 'mb-3' : 'mb-5'}`}>
                                                {section.title ? (
                                                    <h3
                                                        className={`linknest-content-section-title font-bold flex items-center gap-3 min-w-0 ${sectionLinkLayout === 'compact' ? 'text-base' : 'text-lg'} ${!section.textColor ? 'text-slate-800 dark:text-white' : ''}`}
                                                        style={section.textColor ? { color: section.textColor } : undefined}
                                                    >
                                                        <span className={`w-1.5 rounded-full shrink-0 ${styles.base} shadow-sm ${sectionLinkLayout === 'compact' ? 'h-5' : 'h-7'}`}></span>
                                                        {section.emoji ? (
                                                            <span className="shrink-0 leading-none" aria-hidden>{section.emoji}</span>
                                                        ) : null}
                                                        <span className="truncate">{section.title}</span>
                                                        {effectiveShowShortUrls(showShortUrls, activeViewTab, section) ? (
                                                        <ShortUrlActions
                                                            targetType="section"
                                                            targetId={section.id}
                                                            shortUrl={shortOf('section', section.id, section.shortUrl)}
                                                            canRecycle={canRecycleShortUrl}
                                                            compact
                                                            onRecycled={({ shortUrl }) => applyRecycledShortUrl('section', section.id, shortUrl)}
                                                        />
                                                        ) : null}
                                                        {(tile.canEdit === true || !!user?.is_admin) && (
                                                            <VisibilityProtectionBadge visibility={section.visibility} />
                                                        )}
                                                    </h3>
                                                ) : (
                                                    <div />
                                                )}
                                                {!shouldForceStacked && (
                                                    <div
                                                        className={`flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 shrink-0 ${
                                                            syncSectionViews ? 'opacity-60' : ''
                                                        }`}
                                                        title={syncSectionViews
                                                            ? 'Following top View — click a layout to unlock per-section control'
                                                            : 'Link layout for this section'}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => setSectionLinkLayout(section.id, 'stacked')}
                                                            className={`p-1.5 rounded-md transition-all ${sectionLinkLayout === 'stacked'
                                                                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                                                }`}
                                                            title="Stacked list"
                                                            aria-label="Stacked list"
                                                            aria-pressed={sectionLinkLayout === 'stacked'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 4.5zM2 10a2.5 2.5 0 012.5-2.5h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 10zM4.5 13.5A2.5 2.5 0 002 16a2.5 2.5 0 002.5 2.5h11a2.5 2.5 0 000-5h-11z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSectionLinkLayout(section.id, 'side-by-side')}
                                                            className={`p-1.5 rounded-md transition-all ${sectionLinkLayout === 'side-by-side'
                                                                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                                                }`}
                                                            title="Columns"
                                                            aria-label="Columns"
                                                            aria-pressed={sectionLinkLayout === 'side-by-side'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                <path d="M2 4.5A2.5 2.5 0 014.5 2h3A2.5 2.5 0 0110 4.5v11A2.5 2.5 0 017.5 18h-3A2.5 2.5 0 012 15.5v-11zM10.5 2A2.5 2.5 0 0013 4.5v11a2.5 2.5 0 01-2.5 2.5H13a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0013 2h-.5z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSectionLinkLayout(section.id, 'grid')}
                                                            className={`p-1.5 rounded-md transition-all ${sectionLinkLayout === 'grid'
                                                                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                                                }`}
                                                            title="Grid cards"
                                                            aria-label="Grid cards"
                                                            aria-pressed={sectionLinkLayout === 'grid'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSectionLinkLayout(section.id, 'compact')}
                                                            className={`p-1.5 rounded-md transition-all ${sectionLinkLayout === 'compact'
                                                                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                                                }`}
                                                            title="Compact list"
                                                            aria-label="Compact list"
                                                            aria-pressed={sectionLinkLayout === 'compact'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        {isLinkActionAllowed('qr') && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSectionLinkLayout(section.id, 'qr')}
                                                            className={`p-1.5 rounded-md transition-all ${sectionLinkLayout === 'qr'
                                                                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                                                }`}
                                                            title="QR codes"
                                                            aria-label="QR codes"
                                                            aria-pressed={sectionLinkLayout === 'qr'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                <path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 014.5 2h3A1.5 1.5 0 019 3.5v3A1.5 1.5 0 017.5 8h-3A1.5 1.5 0 013 6.5v-3zM4.5 3.5v3h3v-3h-3zM11 3.5A1.5 1.5 0 0112.5 2h3A1.5 1.5 0 0117 3.5v3A1.5 1.5 0 0115.5 8h-3A1.5 1.5 0 0111 6.5v-3zm1.5 0v3h3v-3h-3zM3 12.5A1.5 1.5 0 014.5 11h3A1.5 1.5 0 019 12.5v3A1.5 1.5 0 017.5 17h-3A1.5 1.5 0 013 15.5v-3zm1.5 0v3h3v-3h-3zM12.5 11a.75.75 0 01.75-.75h1a.75.75 0 01.75.75v1a.75.75 0 01-.75.75h-1a.75.75 0 01-.75-.75v-1zM11 14.25a.75.75 0 01.75-.75H13a.75.75 0 010 1.5h-1.25a.75.75 0 01-.75-.75zM14.25 14a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zM11 16.75a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zM15.5 11.75a.75.75 0 01.75-.75H17a.75.75 0 010 1.5h-.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        )}
                                                        {isQrLayout && isLinkActionAllowed('qr') && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    void handlePrintSectionQrCodes(section.id, section.title);
                                                                }}
                                                                className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-white dark:hover:bg-slate-700 transition-all"
                                                                title="Print this section's QR codes"
                                                                aria-label="Print section QR codes"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-3.5 h-3.5" aria-hidden>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0H6.34m11.318 0h1.152c.95 0 1.745-.695 1.885-1.63l.583-4.083A1.876 1.876 0 0019.25 9.75H4.75a1.875 1.875 0 00-1.863 2.114l.583 4.083c.14.935.935 1.63 1.885 1.63H6.34" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75V6A2.25 2.25 0 0110.5 3.75h3A2.25 2.25 0 0115.75 6v3.75" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Links and Rich Text */}
                                            <div
                                                className={resolvedLinkContainerClass}
                                                style={
                                                    isQrLayout
                                                        ? {
                                                              display: 'grid',
                                                              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
                                                              gap: '1.25rem',
                                                              width: '100%',
                                                              alignItems: 'stretch',
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {(() => {
                                                    // Merge links and rich text, sort by position
                                                    const sortedItems = [
                                                        ...(section.links || []).map(l => ({ ...l, itemType: 'link' as const })),
                                                        ...(section.richTextContent || []).map(rt => ({ ...rt, itemType: 'rich-text' as const }))
                                                    ].sort((a, b) => {
                                                        const posA = a.position ?? 0;
                                                        const posB = b.position ?? 0;
                                                        return posA - posB;
                                                    });

                                                    return sortedItems.map((item, itemIndex) => {
                                                        const animationDelay = (sectionIndex * 100) + (itemIndex * 30);

                                                        // Render rich text content
                                                        if (item.itemType === 'rich-text') {
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    style={{ animationDelay: `${animationDelay}ms` }}
                                                                    className={`linknest-content-rich-text rich-text-content-item animate-in fade-in slide-in-from-bottom-2 ${
                                                                        sectionLinkLayout === 'grid' || sectionLinkLayout === 'qr' ? 'col-span-full' : ''
                                                                    }`}
                                                                >
                                                                    <RichTextBoxedView
                                                                        content={item.content || ''}
                                                                        boxed={!!item.boxed}
                                                                        boxTitle={item.boxTitle}
                                                                        boxFooter={item.boxFooter}
                                                                        boxHeaderAlign={item.boxHeaderAlign}
                                                                        boxFooterAlign={item.boxFooterAlign}
                                                                        boxHeaderBg={item.boxHeaderBg}
                                                                        boxFooterBg={item.boxFooterBg}
                                                                        boxBodyBg={item.boxBodyBg}
                                                                        boxHeaderFontWeight={item.boxHeaderFontWeight}
                                                                        boxFooterFontWeight={item.boxFooterFontWeight}
                                                                        boxHeaderFontSize={item.boxHeaderFontSize}
                                                                        boxFooterFontSize={item.boxFooterFontSize}
                                                                        boxHeaderEmoji={item.boxHeaderEmoji}
                                                                        boxImportance={item.boxImportance}
                                                                    />
                                                                </div>
                                                            );
                                                        }

                                                        // Render link (itemType === 'link')
                                                        const link = item as Link;
                                                        const skipHealth =
                                                            isSshLinkUrl(link.url || '') || isVncLinkUrl(link.url || '');
                                                        const health = skipHealth ? undefined : linkHealth[link.id];
                                                        const isBroken = !skipHealth && health?.status === 'broken';
                                                        const isGridCards = sectionLinkLayout === 'grid';
                                                        const isCompact = sectionLinkLayout === 'compact';
                                                        const isQrView = sectionLinkLayout === 'qr';
                                                        const showNotesAction = isLinkActionAllowed('notes') && shouldShowLinkNotes(link);
                                                        const showFavoriteAction = isLinkActionAllowed('favorite');
                                                        const showHealthAction = isLinkActionAllowed('health') && !skipHealth;
                                                        const showCopyAction = isLinkActionAllowed('copy');
                                                        const showMobileAction = isLinkActionAllowed('mobile') && !!link.url;
                                                        const showQrAction = isLinkActionAllowed('qr');
                                                        const showBrowserAction =
                                                            isLinkActionAllowed('browser') &&
                                                            settings.browser_specific_links_enabled === '1' &&
                                                            isAuthenticated &&
                                                            tile.canChangeBrowser === true &&
                                                            typeof window !== 'undefined' &&
                                                            !!(window as any).BrowserLauncher;
                                                        const showLinkActionBar =
                                                            showNotesAction ||
                                                            showFavoriteAction ||
                                                            showHealthAction ||
                                                            showCopyAction ||
                                                            showMobileAction ||
                                                            showQrAction ||
                                                            showBrowserAction ||
                                                            canRecycleShortUrl;
                                                        const viewerHref = linkViewerHref(link, effectiveShowShortUrls(showShortUrls, activeViewTab, section, link));
                                                        const labelHtml = rewriteHtmlAnchorHrefs(link.label || '', viewerHref);
                                                        const linkShowShortUrls = effectiveShowShortUrls(showShortUrls, activeViewTab, section, link);

                                                        if (isQrView) {
                                                            const plainQrLabel = stripHtmlTags(link.label || '');
                                                            return (
                                                                <div
                                                                    key={link.id}
                                                                    className="linknest-qr-card flex flex-col items-center text-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm w-full min-w-0 max-w-full overflow-hidden"
                                                                    style={{ opacity: 1, position: 'relative', zIndex: 0 }}
                                                                    title={linkHoverTitle(link, plainQrLabel)}
                                                                >
                                                                    <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm w-full flex justify-center max-w-[280px]">
                                                                        <BrandedQRCode
                                                                            value={viewerHref || ''}
                                                                            size={isMobile ? 220 : 200}
                                                                            title={`QR code for ${plainQrLabel}`}
                                                                            className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
                                                                        />
                                                                    </div>
                                                                    <div className="min-w-0 w-full space-y-1 px-1">
                                                                        <div className="flex items-center justify-center gap-1.5">
                                                                            {link.icon ? (
                                                                                <span className="text-base leading-none shrink-0" aria-hidden>{link.icon}</span>
                                                                            ) : null}
                                                                            <p
                                                                                className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white truncate [&_a]:pointer-events-none"
                                                                                title={plainQrLabel}
                                                                                dangerouslySetInnerHTML={{ __html: labelHtml }}
                                                                            />
                                                                        </div>
                                                                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono truncate" title={viewerHref}>
                                                                            {viewerLinkDisplay({ ...link, shortUrl: shortOf('link', link.id, link.shortUrl) }, linkShowShortUrls)}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                                                        {link.url ? (
                                                                            <a
                                                                                href={viewerHref}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                                                                                onClick={async (e) => {
                                                                                    if (tryHandleSshLinkClick(link.url, e)) return;
                                                                                    if (tryHandleVncLinkClick(link.url, e)) return;
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    const allowed = await assertCanOpen('link', link.id, {
                                                                                        rules: [tile.accessRestrictions, activeViewTab?.accessRestrictions, link.accessRestrictions],
                                                                                    });
                                                                                    if (!allowed) return;
                                                                                    if (isLinkInMaintenance(link)) {
                                                                                        setLinkMaintenanceDialog({ link });
                                                                                        return;
                                                                                    }
                                                                                    window.open(link.url, '_blank', 'noopener,noreferrer');
                                                                                }}
                                                                            >
                                                                                Open link
                                                                            </a>
                                                                        ) : (
                                                                            <span className="text-xs text-slate-400">No URL</span>
                                                                        )}
                                                                        {link.url ? (
                                                                            <>
                                                                                <span className="text-slate-300 dark:text-slate-600" aria-hidden>·</span>
                                                                                <button
                                                                                    type="button"
                                                                                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        setQrDialogState({ url: viewerHref || link.url, label: link.label });
                                                                                    }}
                                                                                >
                                                                                    Enlarge
                                                                                </button>
                                                                            </>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div
                                                                key={link.id}
                                                                style={{ animationDelay: `${animationDelay}ms` }}
                                                                className={`
                                                    linknest-content-link group relative rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60
                                                    hover:border-brand-300 dark:hover:border-brand-500/50 transition-all duration-300 shadow-sm
                                                    ${isBroken ? 'border-red-300 dark:border-red-500/50 bg-red-50/50 dark:bg-red-900/10' : ''}
                                                    ${isGridCards
                                                        ? 'flex flex-col items-center text-center gap-2 p-4 pt-5'
                                                        : isCompact
                                                            ? 'flex items-center gap-2 px-2.5 py-1.5 rounded-lg'
                                                            : 'flex items-center gap-4 p-4'}
                                                    ${getTileAnimationClass(resolveLinkAnimation(link.animation, tile.linksAnimation))}
                                                `}
                                                                title={linkHoverTitle(link, stripHtmlTags(link.label || ''))}
                                                            >
                                                                {/* Icon + health (grid: alive dot centered above icon) */}
                                                                <div className={`relative shrink-0 ${
                                                                    isGridCards
                                                                        ? 'mb-0.5'
                                                                        : isCompact
                                                                            ? 'flex items-center gap-1.5'
                                                                            : 'flex items-center gap-2'
                                                                }`}>
                                                                    <div className={`linknest-content-link-health flex flex-col items-center gap-1 shrink-0 ${
                                                                        isGridCards
                                                                            ? 'absolute bottom-full left-1/2 -translate-x-1/2 mb-[5px] z-10'
                                                                            : ''
                                                                    }`}>
                                                                        {!skipHealth && getHealthIndicator(link.id)}
                                                                    </div>

                                                                    <div className={`linknest-content-link-icon rounded-xl ${styles.iconBg} flex items-center justify-center select-none shadow-sm border border-white/20 ${
                                                                        isGridCards
                                                                            ? 'w-14 h-14 text-2xl rounded-2xl'
                                                                            : isCompact
                                                                                ? 'w-7 h-7 text-sm rounded-lg'
                                                                                : 'w-11 h-11 text-lg'
                                                                    }`}>
                                                                        {link.icon || '🔗'}
                                                                    </div>
                                                                </div>

                                                                <a
                                                                    href={viewerHref}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={`min-w-0 block focus:outline-none overflow-hidden [&_a]:pointer-events-none ${
                                                                        isGridCards
                                                                            ? 'w-full px-1 pb-1'
                                                                            : isCompact
                                                                                ? 'flex-1 pr-20'
                                                                                : 'flex-1 pr-32'
                                                                    }`}
                                                                    onClick={async (e) => {
                                                                        if (tryHandleSshLinkClick(link.url, e)) return;
                                                                        if (tryHandleVncLinkClick(link.url, e)) return;
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        const allowed = await assertCanOpen('link', link.id, {
                                                                            rules: [tile.accessRestrictions, activeViewTab?.accessRestrictions, link.accessRestrictions],
                                                                        });
                                                                        if (!allowed) return;
                                                                        if (isLinkInMaintenance(link)) {
                                                                            setLinkMaintenanceDialog({ link });
                                                                            return;
                                                                        }

                                                                        // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                                                                        if (e.ctrlKey || e.metaKey) {
                                                                            // If rich text content exists, still show dialog on Ctrl/Cmd
                                                                            if (shouldOpenInfoDialog(link)) {
                                                                                setLinkInfoDialog({ link });
                                                                                return;
                                                                            }
                                                                            const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                                                                            if (newWindow) {
                                                                                newWindow.focus();
                                                                            }
                                                                            return;
                                                                        }

                                                                        // If link has rich text content, show dialog instead of opening URL
                                                                        if (shouldOpenInfoDialog(link)) {
                                                                            setLinkInfoDialog({ link });
                                                                            return;
                                                                        }

                                                                        // If browser extension is enabled, check for browser configuration
                                                                        if (settings.browser_specific_links_enabled === '1') {
                                                                            // Priority: link-specific browser > tile default browser > default browser
                                                                            const browserToUse = link.browser && link.browser !== 'default'
                                                                                ? link.browser
                                                                                : (tile.browser && tile.browser !== 'default' ? tile.browser : null);

                                                                            if (browserToUse && typeof window !== 'undefined' && (window as any).BrowserLauncher) {
                                                                                openLinkInBrowser(link.url, browserToUse);
                                                                                return;
                                                                            }
                                                                        }
                                                                        window.open(link.url, '_blank', 'noopener,noreferrer');
                                                                    }}
                                                                >
                                                                    <div className={`flex items-center gap-2 ${isGridCards ? 'justify-center' : ''}`}>
                                                                        <h4
                                                                            className={`linknest-content-link-title font-semibold ${styles.text} group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors [&_a]:pointer-events-none ${
                                                                                isCompact
                                                                                    ? 'text-xs truncate'
                                                                                    : isGridCards
                                                                                        ? 'text-sm text-center line-clamp-2 break-words'
                                                                                        : 'text-sm break-words'
                                                                            }`}
                                                                            style={{
                                                                                wordBreak: isCompact ? 'normal' : 'break-word',
                                                                                overflowWrap: isCompact ? 'normal' : 'anywhere',
                                                                                ...(link.textColor ? {
                                                                                    color: link.textColor,
                                                                                    // Add text shadow for better visibility
                                                                                    textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                                                                    fontWeight: '700'
                                                                                } : {})
                                                                            }}
                                                                            dangerouslySetInnerHTML={{ __html: labelHtml }}
                                                                        />
                                                                        <AccessRestrictionsBadge rules={link.accessRestrictions} />
                                                                        <LinkMaintenanceBadge link={link} compact={isCompact} />
                                                                    </div>
                                                                    <div className={`flex flex-col gap-0.5 overflow-hidden ${
                                                                        isCompact ? 'hidden' : isGridCards ? 'mt-0.5 items-center' : 'mt-0.5'
                                                                    }`}>
                                                                        <div className="linknest-content-link-domain flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors overflow-hidden">
                                                                            <span className="truncate max-w-full" title={viewerHref}>
                                                                                {viewerLinkDisplay({ ...link, shortUrl: shortOf('link', link.id, link.shortUrl) }, linkShowShortUrls)}
                                                                            </span>
                                                                            {link.visibility && link.visibility !== 'public' && (
                                                                                <span
                                                                                    className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${link.visibility === 'authenticated'
                                                                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                                                                        : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                                                                                        }`}
                                                                                    title={link.visibility === 'authenticated' ? 'Authenticated users only' : 'Private - specific users only'}
                                                                                >
                                                                                    {link.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                                </span>
                                                                            )}
                                                                            {isBroken && (
                                                                                <span className="text-red-500 text-xs font-medium flex items-center gap-1 shrink-0">
                                                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                                                                    Broken
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {settings.browser_specific_links_enabled === '1' && (() => {
                                                                            // Determine which browser is being used for this link
                                                                            // Priority: link-specific browser > tile default browser > system default
                                                                            const browserToUse = link.browser && link.browser !== 'default'
                                                                                ? link.browser
                                                                                : (tile.browser && tile.browser !== 'default' ? tile.browser : null);

                                                                            // Only show browser indicator if it's not the system default
                                                                            if (browserToUse) {
                                                                                return (
                                                                                    <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                                                                        ({formatBrowserName(browserToUse)} browser)
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                    </div>
                                                                </a>

                                                                {/* Browser Selection Menu - Rendered via Portal */}
                                                                {showBrowserMenu[link.id] && settings.browser_specific_links_enabled === '1' && typeof document !== 'undefined' && createPortal(
                                                                    <>
                                                                        <div
                                                                            className="fixed inset-0 z-[99998] bg-transparent"
                                                                            onClick={() => {
                                                                                setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                setSaveBrowserForLink(prev => ({ ...prev, [link.id]: false }));
                                                                                setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: '' }));
                                                                            }}
                                                                            style={{ pointerEvents: 'auto' }}
                                                                        ></div>
                                                                        <div
                                                                            className="fixed z-[99999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-[300px] overflow-y-auto"
                                                                            style={{
                                                                                top: `${browserMenuPosition[link.id]?.y || 0}px`,
                                                                                left: `${browserMenuPosition[link.id]?.x || 0}px`,
                                                                                width: '180px',
                                                                                maxWidth: '180px',
                                                                                pointerEvents: 'auto',
                                                                                position: 'fixed'
                                                                            }}
                                                                        >
                                                                            <div className="py-1">
                                                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2 py-1.5 mb-0.5">
                                                                                    Open in Browser
                                                                                </div>
                                                                                <button
                                                                                    onClick={async (e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        const allowed = await assertCanOpen('link', link.id, {
                                                                                        rules: [tile.accessRestrictions, activeViewTab?.accessRestrictions, link.accessRestrictions],
                                                                                    });
                                                                                        if (!allowed) return;
                                                                                        if (isLinkInMaintenance(link)) {
                                                                                            setLinkMaintenanceDialog({ link });
                                                                                            setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                            return;
                                                                                        }
                                                                                        setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: 'default' }));
                                                                                        if (!saveBrowserForLink[link.id]) {
                                                                                            // If not saving, just open the link
                                                                                            setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                            window.open(link.url, '_blank', 'noopener,noreferrer');
                                                                                        }
                                                                                    }}
                                                                                    className={`w-full text-left px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${(!link.browser || link.browser === 'default') && !selectedBrowserForLink[link.id]
                                                                                        ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                                                                                        : selectedBrowserForLink[link.id] === 'default'
                                                                                            ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                                                                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                                        }`}
                                                                                >
                                                                                    <span className="text-xs">🌐</span>
                                                                                    <span>Default Browser</span>
                                                                                </button>
                                                                                {availableBrowsers.length > 0 ? (
                                                                                    availableBrowsers.map((browserId) => {
                                                                                        const displayName = formatBrowserName(browserId);
                                                                                        const isSelected = link.browser === browserId;
                                                                                        const isCurrentlySelected = selectedBrowserForLink[link.id] === browserId || (!selectedBrowserForLink[link.id] && isSelected);
                                                                                        return (
                                                                                            <button
                                                                                                key={browserId}
                                                                                                onClick={async (e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    const allowed = await assertCanOpen('link', link.id, {
                                                                                        rules: [tile.accessRestrictions, activeViewTab?.accessRestrictions, link.accessRestrictions],
                                                                                    });
                                                                                                    if (!allowed) return;
                                                                                                    if (isLinkInMaintenance(link)) {
                                                                                                        setLinkMaintenanceDialog({ link });
                                                                                                        setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                                        return;
                                                                                                    }
                                                                                                    setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: browserId }));
                                                                                                    if (!saveBrowserForLink[link.id]) {
                                                                                                        // If not saving, just open the link
                                                                                                        setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                                        openLinkInBrowser(link.url, browserId);
                                                                                                    }
                                                                                                }}
                                                                                                className={`w-full text-left px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${isCurrentlySelected
                                                                                                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                                                                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                                                    }`}
                                                                                            >
                                                                                                <span className="text-xs">{isCurrentlySelected ? '✓' : '○'}</span>
                                                                                                <span className="truncate">{displayName || browserId}</span>
                                                                                            </button>
                                                                                        );
                                                                                    })
                                                                                ) : (
                                                                                    <div className="px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400">
                                                                                        No browsers available
                                                                                    </div>
                                                                                )}
                                                                                {/* Admin controls - only show when user has canChangeBrowser */}
                                                                                {isAuthenticated && tile.canEdit && tile.canChangeBrowser === true && (
                                                                                    <>
                                                                                        <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                                                                        <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={saveBrowserForLink[link.id] || false}
                                                                                                onChange={(e) => {
                                                                                                    setSaveBrowserForLink(prev => ({ ...prev, [link.id]: e.target.checked }));
                                                                                                    if (!e.target.checked) {
                                                                                                        setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: '' }));
                                                                                                    } else {
                                                                                                        setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: link.browser || 'default' }));
                                                                                                    }
                                                                                                }}
                                                                                                className="w-3 h-3 text-brand-600 rounded focus:ring-brand-500"
                                                                                            />
                                                                                            <span>Save as default</span>
                                                                                        </label>
                                                                                        {saveBrowserForLink[link.id] && (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    const browserToSave = selectedBrowserForLink[link.id] || link.browser || 'default';
                                                                                                    handleUpdateLinkBrowser(link.id, browserToSave);
                                                                                                }}
                                                                                                className="w-full mx-2 mb-1 px-2 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded transition-colors"
                                                                                            >
                                                                                                Save
                                                                                            </button>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </>,
                                                                    document.body
                                                                )}

                                                                {showLinkActionBar && (
                                                                <div className={`absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 z-20 pointer-events-none group-hover:pointer-events-auto ${
                                                                    isGridCards || isCompact ? 'top-1 right-1' : 'top-1.5 right-1.5'
                                                                }`}>
                                                                    {/* Notes info button - only show if link has notes */}
                                                                    {showNotesAction && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                setNotesDialogState({
                                                                                    linkId: link.id,
                                                                                    notes: link.notes || '',
                                                                                    linkLabel: link.label || ''
                                                                                });
                                                                            }}
                                                                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                                                                            title="View notes"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    {/* Favorite button - available for all users */}
                                                                    {showFavoriteAction && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (isAuthenticated) {
                                                                                handleToggleLinkFavorite(link.id);
                                                                            } else {
                                                                                // For guest users, use localStorage + snapshot for Favorites tab
                                                                                const nowFavorite = togglePublicLinkFavorite(link.id);
                                                                                if (nowFavorite) {
                                                                                    upsertPublicLinkFavoriteDetail({
                                                                                        id: link.id,
                                                                                        label: link.label,
                                                                                        url: link.url,
                                                                                        icon: link.icon,
                                                                                        textColor: link.textColor,
                                                                                        visibility: link.visibility,
                                                                                        notes: link.notes,
                                                                                        tooltip: link.tooltip,
                                                                                        notesEnabled: link.notesEnabled,
                                                                                        browser: link.browser,
                                                                                        richTextContent: link.richTextContent,
                                                                                        richTextEnabled: link.richTextEnabled,
                                                                                        maintenanceEnabled: link.maintenanceEnabled,
                                                                                        maintenanceMessage: link.maintenanceMessage,
                                                                                        maintenanceVideoUrl: link.maintenanceVideoUrl,
                                                                                        health: link.health,
                                                                                        tile: {
                                                                                            id: tile.id,
                                                                                            title: tile.title,
                                                                                            emoji: tile.emoji || '✨',
                                                                                            themeColor: tile.themeColor || 'blue'
                                                                                        }
                                                                                    });
                                                                                } else {
                                                                                    removePublicLinkFavoriteDetail(link.id);
                                                                                }
                                                                                // Force re-render by updating parent
                                                                                onUpdateTiles([...allTiles], true);
                                                                            }
                                                                        }}
                                                                        className={`p-1 rounded-md transition-all ${isAuthenticated
                                                                            ? (link.isFavorite
                                                                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                                                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700')
                                                                            : (isPublicLinkFavorite(link.id)
                                                                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                                                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700')
                                                                            }`}
                                                                        title={
                                                                            isAuthenticated
                                                                                ? (link.isFavorite ? "Unfavorite" : "Favorite")
                                                                                : (isPublicLinkFavorite(link.id) ? "Unfavorite" : "Favorite")
                                                                        }
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>
                                                                    )}

                                                                    {/* Re-check button (HTTP(S) only — SSH/VNC are not HTTP-probed) */}
                                                                    {showHealthAction && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            handleCheckSingleLink(link.id);
                                                                        }}
                                                                        disabled={checkingLinkId === link.id}
                                                                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                                                                        title="Check link health"
                                                                    >
                                                                        {checkingLinkId === link.id ? (
                                                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                                                            </svg>
                                                                        )}
                                                                    </button>
                                                                    )}

                                                                    {/* Copy URL: original when editors also have a short-URL copy; otherwise the displayed URL */}
                                                                    {showCopyAction && (
                                                                    <button
                                                                        onClick={(e) => handleCopy(
                                                                            e,
                                                                            (linkShowShortUrls && canRecycleShortUrl) ? link.url : (linkViewerHref(link, linkShowShortUrls) || link.url),
                                                                            link.id
                                                                        )}
                                                                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all relative"
                                                                        title={
                                                                            linkShowShortUrls && canRecycleShortUrl
                                                                                ? 'Copy original URL'
                                                                                : (linkShowShortUrls ? 'Copy short URL' : 'Copy URL')
                                                                        }
                                                                    >
                                                                        {copiedId === link.id ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                                                                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                            </svg>
                                                                        )}
                                                                    </button>
                                                                    )}

                                                                    {linkShowShortUrls && canRecycleShortUrl && (
                                                                        <span onClick={(e) => e.stopPropagation()}>
                                                                            <ShortUrlActions
                                                                                targetType="link"
                                                                                targetId={link.id}
                                                                                shortUrl={shortOf('link', link.id, link.shortUrl)}
                                                                                canRecycle={canRecycleShortUrl}
                                                                                showCopy
                                                                                compact
                                                                                onRecycled={({ shortUrl }) => applyRecycledShortUrl('link', link.id, shortUrl)}
                                                                            />
                                                                        </span>
                                                                    )}

                                                                    {/* Mobile / tablet preview button */}
                                                                    {showMobileAction ? (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                const tempDiv = document.createElement('div');
                                                                                tempDiv.innerHTML = link.label || '';
                                                                                const plainLabel = tempDiv.textContent || tempDiv.innerText || link.label || link.url;
                                                                                setMobilePreviewState({
                                                                                    url: link.url,
                                                                                    label: plainLabel
                                                                                });
                                                                            }}
                                                                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                                                                            title="Preview on mobile"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path d="M8 16.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
                                                                                <path fillRule="evenodd" d="M4 4a3 3 0 013-3h6a3 3 0 013 3v12a3 3 0 01-3 3H7a3 3 0 01-3-3V4zm4-1.5v.75c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V2.5h1A1.5 1.5 0 0114.5 4v12a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16V4A1.5 1.5 0 017 2.5h1z" clipRule="evenodd" />
                                                                            </svg>
                                                                        </button>
                                                                    ) : null}

                                                                    {/* QR code button */}
                                                                    {showQrAction && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            const tempDiv = document.createElement('div');
                                                                            tempDiv.innerHTML = link.label || '';
                                                                            const plainLabel = tempDiv.textContent || tempDiv.innerText || link.label || link.url;
                                                                            setQrDialogState({
                                                                                url: viewerHref || link.url,
                                                                                label: plainLabel
                                                                            });
                                                                        }}
                                                                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                                                                        title="Show QR code"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v1h1V5H5zm8-2a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 1v1h1v-1H5zm5-1a1 1 0 011-1h.01a1 1 0 110 2H11a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H14a1 1 0 01-1-1zm-3 3a1 1 0 011-1h.01a1 1 0 110 2H11a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H14a1 1 0 01-1-1zm3-3a1 1 0 011-1h.01a1 1 0 110 2H17a1 1 0 01-1-1zm0 3a1 1 0 011-1h.01a1 1 0 110 2H17a1 1 0 01-1-1z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>
                                                                    )}

                                                                    {/* Browser selection button - only show when extension is enabled, user is authenticated, and has canChangeBrowser */}
                                                                    {showBrowserAction && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();

                                                                                // Show browser selection menu with smart positioning
                                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                                const menuWidth = 180;
                                                                                const menuHeight = Math.min(300, (availableBrowsers.length + 1) * 28 + 40);
                                                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                                                const spaceAbove = rect.top;
                                                                                const spaceRight = window.innerWidth - rect.right;
                                                                                const spaceLeft = rect.left;

                                                                                // Calculate vertical position - align with button top
                                                                                let menuY = rect.top;
                                                                                // If not enough space below, align with button bottom
                                                                                if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                                                                                    menuY = rect.bottom - menuHeight;
                                                                                }
                                                                                menuY = Math.max(10, Math.min(menuY, window.innerHeight - menuHeight - 10));

                                                                                // Calculate horizontal position - prefer right side of button, fallback to left
                                                                                let menuX = rect.right + 8;
                                                                                if (spaceRight < menuWidth && spaceLeft > spaceRight) {
                                                                                    menuX = rect.left - menuWidth - 8;
                                                                                }
                                                                                menuX = Math.max(10, Math.min(menuX, window.innerWidth - menuWidth - 10));

                                                                                setBrowserMenuPosition(prev => ({
                                                                                    ...prev,
                                                                                    [link.id]: {
                                                                                        x: menuX,
                                                                                        y: menuY
                                                                                    }
                                                                                }));
                                                                                setShowBrowserMenu(prev => ({ ...prev, [link.id]: true }));
                                                                            }}
                                                                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                                                                            title="Open in browser"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM9 8a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1zm-3 4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                )}
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Notes Dialog */}
                <LinkNotesDialog
                    isOpen={!!notesDialogState}
                    onClose={() => setNotesDialogState(null)}
                    linkLabel={notesDialogState?.linkLabel || ''}
                    notes={notesDialogState?.notes || ''}
                />

                {/* Link Info Dialog */}
                {linkInfoDialog && (
                    <LinkInfoDialog
                        isOpen={!!linkInfoDialog}
                        onClose={() => setLinkInfoDialog(null)}
                        linkId={linkInfoDialog.link.id}
                        linkLabel={linkInfoDialog.link.label}
                        linkIcon={linkInfoDialog.link.icon}
                        richTextContent={linkInfoDialog.link.richTextContent || ''}
                        linkUrl={viewerLinkUrl({ ...linkInfoDialog.link, shortUrl: shortOf('link', linkInfoDialog.link.id, linkInfoDialog.link.shortUrl) }, effectiveShowShortUrls(showShortUrls, activeViewTab, linkInfoDialog.link)) || linkInfoDialog.link.url}
                        browser={linkInfoDialog.link.browser}
                    />
                )}

                {linkMaintenanceDialog && (
                    <LinkMaintenanceDialog
                        isOpen={!!linkMaintenanceDialog}
                        onClose={() => setLinkMaintenanceDialog(null)}
                        linkLabel={linkMaintenanceDialog.link.label}
                        linkIcon={linkMaintenanceDialog.link.icon}
                        maintenanceMessage={linkMaintenanceDialog.link.maintenanceMessage}
                        maintenanceVideoUrl={linkMaintenanceDialog.link.maintenanceVideoUrl}
                    />
                )}

                {/* QR Code Dialog */}
                <QRCodeDialog
                    isOpen={!!qrDialogState}
                    onClose={() => setQrDialogState(null)}
                    url={qrDialogState?.url || ''}
                    label={qrDialogState?.label || ''}
                />

                {/* Mobile / tablet preview dialog */}
                <MobilePreviewDialog
                    isOpen={!!mobilePreviewState}
                    onClose={() => setMobilePreviewState(null)}
                    url={mobilePreviewState?.url || ''}
                    label={mobilePreviewState?.label || ''}
                />
            </>
        );
    }

    // EDIT MODE - Only show if user has edit permission
    if (isEditing && tile.canEdit) {
        const hierarchyToolbar = {
            showShortUrls,
            canRecycleShortUrl,
            canConvert: tile.canEdit === true,
            canDeleteTabs: tile.canDeleteTabs !== false && (tile.canDeleteTabs !== undefined || tile.canEdit),
            canDeleteSections: tile.canDeleteSections !== false && (tile.canDeleteSections !== undefined || tile.canEdit),
            shortOf: (type: 'tab' | 'section', id: string, current?: string) => shortOf(type, id, current),
            onRecycledShortUrl: (type: 'tab' | 'section', id: string, shortUrl: string) => applyRecycledShortUrl(type, id, shortUrl),
            onConvertTabToSpace: openConvertTabToSpaceDialog,
            onConvertSectionToSpace: openConvertSectionToSpaceDialog,
            onCloneTab: handleCloneTab,
            onCloneSection: handleCloneSection,
            onRemoveTab: handleRemoveTab,
            onRemoveSection: handleRemoveSection,
            onImportTab: openTabJsonImport,
            onImportSection: openSectionLinksImport,
            onScheduleTab: (tabId: string) => setSchedulingDialogTab(tabId),
            onScheduleSection: (tabId: string, sectionId: string) => setSchedulingDialogSection({ tabId, sectionId }),
            onVisibilityTab: (tabId: string) => setVisibilityDialogTab(tabId),
            onVisibilitySection: (tabId: string, sectionId: string) => setVisibilityDialogSection({ tabId, sectionId }),
            onRestrictionsTab: (tabId: string) => setRestrictionsDialogTab(tabId),
            importingSectionLinks,
        };

        return (
            <>
                {isMobile && (
                    <MobileTileEdit
                        tile={tile}
                        editTitle={editTitle}
                        editDesc={editDesc}
                        editHtml={editHtml}
                        editEmoji={editEmoji}
                        editColor={editColor}
                        editVisibility={editVisibility}
                        editPublished={editPublished}
                        editAllowedUsers={editAllowedUsers}
                        editAccessRestrictions={editAccessRestrictions}
                        editTabs={editTabs}
                        onTitleChange={setEditTitle}
                        onDescChange={setEditDesc}
                        onHtmlChange={setEditHtml}
                        onEmojiChange={setEditEmoji}
                        onColorChange={setEditColor}
                        onVisibilityChange={setEditVisibility}
                        onPublishedChange={setEditPublished}
                        onAllowedUsersChange={setEditAllowedUsers}
                        onAccessRestrictionsChange={setEditAccessRestrictions}
                        onTabsChange={setEditTabs}
                        onSave={(tabs) => handleSaveChanges(tabs)}
                        onCancel={() => {
                            const confirmed = window.confirm('Are you sure you want to cancel? All unsaved changes will be lost.');
                            if (confirmed) {
                                setEditingMode(false);
                            }
                        }}
                        isAuthenticated={isAuthenticated}
                        usersList={usersList}
                        loadingUsers={loadingUsers}
                        showEmojiPicker={showEmojiPicker}
                        setShowEmojiPicker={setShowEmojiPicker}
                        showTileUserSelector={showTileUserSelector}
                        setShowTileUserSelector={setShowTileUserSelector}
                        settings={settings}
                        availableBrowsers={availableBrowsers}
                        user={user}
                        hierarchyToolbar={hierarchyToolbar}
                    />
                )}
                {!isMobile && (
                <div className="animate-in fade-in zoom-in duration-300 w-full">
                    {/* Enhanced Header */}
                    <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-700 -mx-6 px-6 py-5 mb-8 rounded-b-xl shadow-sm">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">Edit Page</h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span className="text-lg">{editEmoji || '✨'}</span>
                                    <span className="font-medium">{editTitle || 'Untitled Page'}</span>
                                </p>
                            </div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <button
                                    onClick={() => {
                                        const confirmed = window.confirm('Are you sure you want to cancel? All unsaved changes will be lost.');
                                        if (confirmed) {
                                            console.log('Cancel clicked - exiting edit mode');
                                            setEditingMode(false);
                                        } else {
                                            console.log('Cancel cancelled - staying in edit mode');
                                        }
                                    }}
                                    className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-all font-medium rounded-lg border border-slate-200 dark:border-slate-600 flex-1 sm:flex-none"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        console.log('=== SAVE BUTTON CLICKED ===');
                                        console.log('Current editTabs count:', editTabs.length);
                                        console.log('editVisibility:', editVisibility);
                                        console.log('editAllowedUsers.length:', editAllowedUsers.length);
                                        console.log('editAllowedGroups.length:', editAllowedGroups.length);
                                        handleSaveChanges();
                                    }}
                                    className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center gap-2 flex-1 sm:flex-none"
                                    title="Save all changes"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Save Changes {editTabs.length !== (tile.tabs?.length || 0) ? '⚠️' : ''}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">

                        {/* LEFT COLUMN: General Settings & HTML Editor */}
                        <div className={`w-full shrink-0 space-y-6 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${generalSettingsExpanded ? 'lg:w-1/3' : 'lg:w-[4.25rem]'}`}>
                            {/* Basic Info Card */}
                            <div className={`relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-black/20 transition-[padding,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${generalSettingsExpanded ? 'p-6' : 'p-4 lg:p-3 sticky top-6 ln-gs-rail-settle'}`}>
                                <button
                                    type="button"
                                    onClick={() => setGeneralSettingsExpanded((open) => {
                                        if (open) setGeneralSettingsSparkleKey((key) => key + 1);
                                        return !open;
                                    })}
                                    className={`relative flex items-center gap-3 text-left rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${
                                        generalSettingsExpanded
                                            ? 'w-full pb-4 border-b border-slate-200 dark:border-slate-700'
                                            : 'w-full lg:w-auto lg:flex-col lg:py-2'
                                    }`}
                                    aria-expanded={generalSettingsExpanded}
                                    title={generalSettingsExpanded ? 'Collapse general settings' : 'Expand general settings'}
                                >
                                    {!generalSettingsExpanded && (
                                        <span key={generalSettingsSparkleKey} className="ln-gs-sparkles hidden lg:block" aria-hidden>
                                            <span className="ln-gs-sparkle" />
                                            <span className="ln-gs-sparkle" />
                                            <span className="ln-gs-sparkle" />
                                            <span className="ln-gs-sparkle" />
                                            <span className="ln-gs-sparkle" />
                                            <span className="ln-gs-sparkle" />
                                        </span>
                                    )}
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${generalSettingsExpanded ? 'rotate-180' : 'lg:-rotate-90'}`}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                    </svg>
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.128.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.128c-.355-.196-.75-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div className={`min-w-0 ${generalSettingsExpanded ? 'flex-1' : 'flex-1 lg:flex-none lg:flex lg:flex-col lg:items-center lg:gap-3'}`}>
                                        <h3 className={`text-lg font-bold text-slate-800 dark:text-white ${generalSettingsExpanded ? '' : 'lg:[writing-mode:vertical-rl] lg:rotate-180 lg:whitespace-nowrap'}`}>
                                            General Settings
                                        </h3>
                                        {!generalSettingsExpanded && (
                                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate lg:hidden">
                                                {editEmoji ? `${editEmoji} ` : ''}{editTitle || 'Untitled'}
                                            </p>
                                        )}
                                    </div>
                                    {!generalSettingsExpanded && editEmoji ? (
                                        <span className="hidden lg:inline text-xl leading-none" aria-hidden>{editEmoji}</span>
                                    ) : null}
                                </button>

                                <div
                                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                                        generalSettingsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                                    }`}
                                >
                                <div className="overflow-hidden min-h-0">
                                <div className="space-y-6 pt-4">
                                {/* Emoji & Title */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2.5">Emoji & Page Title</label>
                                        <div className="flex gap-3">
                                            <TitleEmojiPicker
                                                value={editEmoji}
                                                onChange={setEditEmoji}
                                                size="lg"
                                                title="Choose page emoji"
                                            />
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    className="w-full h-14 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-semibold text-base transition-all"
                                                    placeholder="Enter page title..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Theme Color */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Theme Color</label>
                                    <div className="flex gap-2.5 flex-wrap p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                        {THEME_COLORS.map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setEditColor(color)}
                                                className={`
                                                w-10 h-10 rounded-full border-3 transition-all relative overflow-hidden shadow-sm hover:shadow-md
                                                ${editColor === color ? 'border-brand-500 dark:border-brand-400 scale-110 ring-2 ring-brand-200 dark:ring-brand-900/50' : 'border-slate-300 dark:border-slate-600 hover:scale-105'} 
                                            `}
                                                title={color.charAt(0).toUpperCase() + color.slice(1)}
                                            >
                                                <div className={`absolute inset-0 ${COLOR_STYLES[color].base}`}></div>
                                                {editColor === color && (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white drop-shadow-lg">
                                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Card Description */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2.5">Card Description</label>
                                    <textarea
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        rows={3}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-700 dark:text-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none transition-all"
                                        placeholder="Brief summary of this page..."
                                    />
                                </div>

                                {/* Intro Content */}
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-2.5">
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Intro Content</label>
                                        {editingIntro ? (
                                            <button
                                                type="button"
                                                onClick={() => setEditingIntro(false)}
                                                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-500 dark:hover:text-brand-300 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                                            >
                                                Done
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingIntro(true)}
                                                className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                                title="Edit intro content"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                    {editingIntro && (
                                        <SelectableRichTextEditor
                                            value={editHtml}
                                            onChange={setEditHtml}
                                            placeholder="Enter intro content with formatting..."
                                            className="min-h-[160px]"
                                            startOpen
                                        />
                                    )}
                                </div>

                                {/* Publish Status (admin only) */}
                                {user?.is_admin && (
                                    <div className="mb-6">
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Publish Status</label>
                                        <div className="flex items-center justify-between gap-4 p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                    {editPublished ? 'Published' : 'Unpublished'}
                                                </div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                                    {editPublished
                                                        ? 'Visible according to Visibility settings below'
                                                        : 'Hidden from everyone except platform admins'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={editPublished}
                                                onClick={() => setEditPublished(!editPublished)}
                                                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${editPublished ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                title={editPublished ? 'Click to unpublish' : 'Click to publish'}
                                            >
                                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${editPublished ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Visibility Settings */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Visibility</label>
                                    <div className="space-y-2.5">
                                        {user?.is_admin && (
                                            <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${editVisibility === 'public'
                                                ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                                }`}>
                                                <input
                                                    type="radio"
                                                    name="tileVisibility"
                                                    value="public"
                                                    checked={editVisibility === 'public'}
                                                    onChange={(e) => {
                                                        setEditVisibility(e.target.value as TileVisibility);
                                                        setShowTileUserSelector(false);
                                                    }}
                                                    className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                                />
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Public</div>
                                                    <div className="text-xs text-slate-600 dark:text-slate-400">Available for everyone (guests and logged in users)</div>
                                                </div>
                                                {editVisibility === 'public' && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </label>
                                        )}
                                        {user?.is_admin && (
                                            <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${editVisibility === 'authenticated'
                                                ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                                }`}>
                                                <input
                                                    type="radio"
                                                    name="tileVisibility"
                                                    value="authenticated"
                                                    checked={editVisibility === 'authenticated'}
                                                    onChange={(e) => {
                                                        setEditVisibility(e.target.value as TileVisibility);
                                                        setShowTileUserSelector(false);
                                                    }}
                                                    className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                                />
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Authenticated</div>
                                                    <div className="text-xs text-slate-600 dark:text-slate-400">Available for logged in users only</div>
                                                </div>
                                                {editVisibility === 'authenticated' && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </label>
                                        )}
                                        <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${editVisibility === 'private'
                                            ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                            }`}>
                                            <input
                                                type="radio"
                                                name="tileVisibility"
                                                value="private"
                                                checked={editVisibility === 'private'}
                                                onChange={(e) => {
                                                    setEditVisibility(e.target.value as TileVisibility);
                                                    setShowTileUserSelector(true);
                                                }}
                                                className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Private</div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400">Available for specific users only</div>
                                            </div>
                                            {editVisibility === 'private' && (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </label>
                                    </div>

                                    {/* User and Group Selector for Private Visibility */}
                                    {editVisibility === 'private' && isAuthenticated && (
                                        <div className="mt-4 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                            {/* Tabs */}
                                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                                <button
                                                    type="button"
                                                    onClick={() => setVisibilityActiveTab('users')}
                                                    className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${visibilityActiveTab === 'users'
                                                        ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                        }`}
                                                >
                                                    Users ({editAllowedUsers.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setVisibilityActiveTab('groups')}
                                                    className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${visibilityActiveTab === 'groups'
                                                        ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                        }`}
                                                >
                                                    Groups ({editAllowedGroups.length})
                                                </button>
                                            </div>

                                            {/* Search Input */}
                                            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={visibilitySearchTerm}
                                                        onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                                        placeholder={`Search ${visibilityActiveTab}...`}
                                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                                    />
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                    {visibilitySearchTerm && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setVisibilitySearchTerm('')}
                                                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Selected Items Display */}
                                            {(editAllowedUsers.length > 0 || editAllowedGroups.length > 0) && (
                                                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                                                    <div className="flex flex-wrap gap-2">
                                                        {editAllowedUsers.map(userId => {
                                                            const user = usersList.find(u => u.id === userId);
                                                            const isOwner = tile.userId && userId === (typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId);
                                                            return (
                                                                <span
                                                                    key={`user-${userId}`}
                                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${isOwner
                                                                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700'
                                                                        : 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800'
                                                                        }`}
                                                                >
                                                                    {user?.username || `User ${userId}`}
                                                                    {isOwner && (
                                                                        <span className="text-[9px] font-bold uppercase">Owner</span>
                                                                    )}
                                                                    {!isOwner && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditAllowedUsers(editAllowedUsers.filter(id => id !== userId))}
                                                                            className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                            title="Remove user"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </span>
                                                            );
                                                        })}
                                                        {editAllowedGroups.map(groupId => {
                                                            const group = availableGroups.find(g => g.id === groupId);
                                                            return (
                                                                <span
                                                                    key={`group-${groupId}`}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM16 8a2 2 0 11-4 0 2 2 0 014 0zm-1.615 8.428a1.224 1.224 0 00.569-1.175 5.966 5.966 0 00-2.081-.416 5.967 5.967 0 00-1.788.27A9.953 9.953 0 0013 18a9.953 9.953 0 003.385-.572z" />
                                                                    </svg>
                                                                    {group?.name || `Group ${groupId}`}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setEditAllowedGroups(editAllowedGroups.filter(id => id !== groupId))}
                                                                        className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                        title="Remove group"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                        </svg>
                                                                    </button>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Content */}
                                            <div className="max-h-80 overflow-y-auto p-3 bg-white dark:bg-slate-800">
                                                {visibilityActiveTab === 'users' && (
                                                    loadingUsers ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8 flex items-center justify-center gap-2">
                                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Loading users...
                                                        </div>
                                                    ) : usersList.length === 0 ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {usersList
                                                                .filter(u => {
                                                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                                                    return u.username.toLowerCase().includes(searchLower) ||
                                                                        u.email?.toLowerCase().includes(searchLower);
                                                                })
                                                                .map(user => {
                                                                    const isOwner = tile.userId && user.id === (typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId);
                                                                    return (
                                                                        <label
                                                                            key={user.id}
                                                                            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isOwner
                                                                                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer'
                                                                                }`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={editAllowedUsers.includes(user.id) || isOwner}
                                                                                onChange={(e) => {
                                                                                    if (isOwner) return;
                                                                                    if (e.target.checked) {
                                                                                        setEditAllowedUsers([...editAllowedUsers, user.id]);
                                                                                    } else {
                                                                                        setEditAllowedUsers(editAllowedUsers.filter(id => id !== user.id));
                                                                                    }
                                                                                }}
                                                                                disabled={isOwner}
                                                                                className={`rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 w-4 h-4 ${isOwner ? 'opacity-50 cursor-not-allowed' : ''
                                                                                    }`}
                                                                            />
                                                                            <span className={`text-sm font-medium flex-1 ${isOwner
                                                                                ? 'text-amber-800 dark:text-amber-200'
                                                                                : 'text-slate-700 dark:text-slate-300'
                                                                                }`}>
                                                                                {user.username}
                                                                            </span>
                                                                            {isOwner && (
                                                                                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                                                    Owner
                                                                                </span>
                                                                            )}
                                                                            <AuthSourceBadge source={user.auth_source} />
                                                                        </label>
                                                                    );
                                                                })}
                                                            {usersList.filter(u => {
                                                                const searchLower = visibilitySearchTerm.toLowerCase();
                                                                return u.username.toLowerCase().includes(searchLower) ||
                                                                    u.email?.toLowerCase().includes(searchLower);
                                                            }).length === 0 && (
                                                                    <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                                                )}
                                                        </div>
                                                    )
                                                )}

                                                {visibilityActiveTab === 'groups' && (
                                                    isLoadingGroups ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8 flex items-center justify-center gap-2">
                                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Loading groups...
                                                        </div>
                                                    ) : availableGroups.length === 0 ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {availableGroups
                                                                .filter(g => {
                                                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                                                    return g.name.toLowerCase().includes(searchLower) ||
                                                                        (g.description || '').toLowerCase().includes(searchLower);
                                                                })
                                                                .map(g => (
                                                                    <label
                                                                        key={g.id}
                                                                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={editAllowedGroups.includes(g.id)}
                                                                            onChange={(e) => {
                                                                                if (e.target.checked) {
                                                                                    setEditAllowedGroups([...editAllowedGroups, g.id]);
                                                                                } else {
                                                                                    setEditAllowedGroups(editAllowedGroups.filter(id => id !== g.id));
                                                                                }
                                                                            }}
                                                                            className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 w-4 h-4"
                                                                        />
                                                                        <div className="flex-1">
                                                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                                                            {g.description && (
                                                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{g.description}</div>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                                                        </span>
                                                                    </label>
                                                                ))}
                                                            {availableGroups.filter(g => {
                                                                const searchLower = visibilitySearchTerm.toLowerCase();
                                                                return g.name.toLowerCase().includes(searchLower) ||
                                                                    (g.description || '').toLowerCase().includes(searchLower);
                                                            }).length === 0 && (
                                                                    <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                                                )}
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            {editVisibility === 'private' && editAllowedUsers.length === 0 && editAllowedGroups.length === 0 && (
                                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20">
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
                                                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                                        </svg>
                                                        <span>No users or groups selected. Access can still come from role assignments (Your Assigned Apps), tile admins, or the space owner.</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {(tile.canChangeVisibility !== false) && (
                                    <div className="mt-6">
                                        <AccessRestrictionsEditor
                                            value={editAccessRestrictions}
                                            onChange={setEditAccessRestrictions}
                                            disabled={tile.canChangeVisibility === false}
                                        />
                                    </div>
                                )}

                                {/* Browser Selection - Only show if feature is enabled and user has canChangeBrowser or is admin */}
                                {settings.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Default Browser for All Links</label>
                                        <select
                                            value={editBrowser}
                                            onChange={(e) => setEditBrowser(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm transition-all"
                                        >
                                            <option value="default">Default Browser</option>
                                            {availableBrowsers.length > 0 ? (
                                                availableBrowsers.map((browserId) => {
                                                    // Format browser ID for display
                                                    const displayName = browserId
                                                        .replace(/-/g, ' ')
                                                        .replace(/\b\w/g, (l) => l.toUpperCase())
                                                        .replace('Wsl', '(WSL)')
                                                        .replace('Stable', 'Stable')
                                                        .replace('Beta', 'Beta')
                                                        .replace('Dev', 'Dev');
                                                    return (
                                                        <option key={browserId} value={browserId}>
                                                            {displayName}
                                                        </option>
                                                    );
                                                })
                                            ) : (
                                                <>
                                                    <option value="chrome-stable">Chrome Stable</option>
                                                    <option value="chrome-beta">Chrome Beta</option>
                                                    <option value="chrome-dev">Chrome Dev</option>
                                                    <option value="edge-stable">Edge Stable</option>
                                                    <option value="edge-beta">Edge Beta</option>
                                                    <option value="edge-dev">Edge Dev</option>
                                                    <option value="firefox-wsl">Firefox (WSL)</option>
                                                    <option value="chrome-stable-wsl">Chrome Stable (WSL)</option>
                                                    <option value="edge-stable-wsl">Edge Stable (WSL)</option>
                                                </>
                                            )}
                                        </select>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 mb-3">
                                            Select which browser should open links from this tile. This will apply to all links unless they have a specific browser override. Requires browser extension to be installed.
                                        </p>
                                        <button
                                            onClick={handleUpdateLinksBrowser}
                                            className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center justify-center gap-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Save Default Browser for All Links
                                        </button>
                                    </div>
                                )}

                                {/* Links entrance animation (space default for all links) */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                                        Links Animation
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <TileAnimationSelector
                                            animationsOnly
                                            persistGlobal={false}
                                            value={editLinksAnimation}
                                            onAnimationChange={setEditLinksAnimation}
                                            scopeLabel="LINKS ANIMATION"
                                            scopeHint="Default for all links — each link can inherit, disable, or override"
                                            buttonTitle="Choose default entrance animation for all links"
                                        />
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {getAnimationOption(editLinksAnimation).name}
                                            <span className="block text-[10px] mt-0.5">Applies to all links — each link can inherit, disable, or override</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Version History Section */}
                                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm mt-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                            </svg>
                                            Version History
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            {showVersions && tileVersions.length > 0 && (
                                                <>
                                                    <button
                                                        onClick={handleDeleteEmptyVersions}
                                                        disabled={loadingVersions}
                                                        className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete versions with no differences from previous version"
                                                    >
                                                        Delete Empty
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteDuplicateVersions}
                                                        disabled={loadingVersions}
                                                        className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete duplicate versions (identical to any previous version)"
                                                    >
                                                        Delete Duplicate
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteAllVersions}
                                                        disabled={loadingVersions}
                                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete all unlocked versions"
                                                    >
                                                        Delete All
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => setShowVersions(!showVersions)}
                                                className="text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 text-xs font-semibold"
                                            >
                                                {showVersions ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </div>

                                    {showVersions && (
                                        <div className="space-y-3">
                                            {/* Search and Filter Controls */}
                                            {tileVersions.length > 0 && (
                                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 space-y-2 border border-slate-200 dark:border-slate-700">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Search versions..."
                                                            value={versionSearchTerm}
                                                            onChange={(e) => setVersionSearchTerm(e.target.value)}
                                                            className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        />
                                                        {selectedVersionsForCompare.length === 2 && (
                                                            <button
                                                                onClick={() => handleCompareTwoVersions(selectedVersionsForCompare[0], selectedVersionsForCompare[1])}
                                                                disabled={isDiffLoading}
                                                                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                            >
                                                                Compare Selected
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <select
                                                            value={versionFilterUser}
                                                            onChange={(e) => setVersionFilterUser(e.target.value)}
                                                            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        >
                                                            <option value="">All Users</option>
                                                            {allUsers.map(user => (
                                                                <option key={user} value={user}>{user}</option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            type="date"
                                                            value={versionFilterDateFrom}
                                                            onChange={(e) => setVersionFilterDateFrom(e.target.value)}
                                                            placeholder="From Date"
                                                            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        />
                                                        <input
                                                            type="date"
                                                            value={versionFilterDateTo}
                                                            onChange={(e) => setVersionFilterDateTo(e.target.value)}
                                                            placeholder="To Date"
                                                            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        />
                                                    </div>
                                                    {allTags.length > 0 && (
                                                        <select
                                                            value={versionFilterTag}
                                                            onChange={(e) => setVersionFilterTag(e.target.value)}
                                                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        >
                                                            <option value="">All Tags</option>
                                                            {allTags.map(tag => (
                                                                <option key={tag} value={tag}>{tag}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )}

                                            {loadingVersions ? (
                                                <div className="text-center py-4 text-slate-500 text-sm">Loading versions...</div>
                                            ) : tileVersions.length === 0 ? (
                                                <div className="text-center py-4 text-slate-500 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                                    No previous versions saved.
                                                </div>
                                            ) : filteredVersions.length === 0 ? (
                                                <div className="text-center py-4 text-slate-500 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                                    No versions match your filters.
                                                </div>
                                            ) : (
                                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                                    {filteredVersions.map((version) => (
                                                        <div key={version.id} className={`bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border ${version.is_locked ? 'border-amber-400 dark:border-amber-600' : selectedVersionsForCompare.includes(version.id) ? 'border-brand-500 dark:border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200 dark:border-slate-700'} relative group`}>
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={selectedVersionsForCompare.includes(version.id)}
                                                                                onChange={() => handleToggleVersionSelect(version.id)}
                                                                                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                                                                                title="Select for comparison"
                                                                            />
                                                                            <span className="font-bold text-sm text-slate-700 dark:text-slate-200">v{version.version_number}</span>
                                                                        </label>
                                                                        {version.is_locked && (
                                                                            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                                                </svg>
                                                                                Locked
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                                        {new Date(version.created_at * 1000).toLocaleString()}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500">
                                                                        by <span className="font-medium text-slate-700 dark:text-slate-300">{version.username}</span>
                                                                    </div>
                                                                    {version.changelog_summary && (
                                                                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                                                                            {version.changelog_summary}
                                                                        </div>
                                                                    )}
                                                                    {/* Tags */}
                                                                    {version.tags && version.tags.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                                            {version.tags.map((tag, idx) => (
                                                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-[10px] font-medium">
                                                                                    {tag}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {/* Comments */}
                                                                    {version.comments && (
                                                                        <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-600 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-slate-600">
                                                                            {version.comments}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <button
                                                                        onClick={() => handleToggleVersionLock(version.id, version.is_locked)}
                                                                        disabled={versionActionLoading === version.id}
                                                                        className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${version.is_locked ? 'text-amber-500' : 'text-slate-400'}`}
                                                                        title={version.is_locked ? "Unlock Version" : "Lock Version (Prevent Deletion)"}
                                                                    >
                                                                        {version.is_locked ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                                            </svg>
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleStartEditVersion(version)}
                                                                        disabled={versionActionLoading === version.id}
                                                                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-400"
                                                                        title="Edit Tags/Comments"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Edit Tags/Comments UI */}
                                                            {editingVersionId === version.id && (
                                                                <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-600 space-y-3">
                                                                    <div>
                                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tags</label>
                                                                        <div className="flex flex-wrap gap-1 mb-2">
                                                                            {editingVersionTags.map((tag, idx) => (
                                                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                                                                                    {tag}
                                                                                    <button
                                                                                        onClick={() => handleRemoveTag(tag)}
                                                                                        className="hover:text-red-600"
                                                                                    >
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                        </svg>
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                        <div className="flex gap-2">
                                                                            <input
                                                                                type="text"
                                                                                value={newTagInput}
                                                                                onChange={(e) => setNewTagInput(e.target.value)}
                                                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                                                                placeholder="Add tag..."
                                                                                className="flex-1 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                                                            />
                                                                            <button
                                                                                onClick={handleAddTag}
                                                                                className="px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white text-xs rounded"
                                                                            >
                                                                                Add
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Comments</label>
                                                                        <textarea
                                                                            value={editingVersionComments}
                                                                            onChange={(e) => setEditingVersionComments(e.target.value)}
                                                                            placeholder="Add notes about this version..."
                                                                            rows={3}
                                                                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                                                        />
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handleUpdateVersionTags(version.id)}
                                                                            disabled={versionActionLoading === version.id}
                                                                            className="flex-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded"
                                                                        >
                                                                            Save Tags
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateVersionComments(version.id)}
                                                                            disabled={versionActionLoading === version.id}
                                                                            className="flex-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded"
                                                                        >
                                                                            Save Comments
                                                                        </button>
                                                                        <button
                                                                            onClick={handleCancelEditVersion}
                                                                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                                                <button
                                                                    onClick={() => handleCompareWithCurrent(version)}
                                                                    disabled={versionActionLoading === version.id || isDiffLoading}
                                                                    className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1"
                                                                    title="Compare with Current State"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                                                    </svg>
                                                                    Diff
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRestoreWithPreview(version.id)}
                                                                    disabled={versionActionLoading === version.id || isDiffLoading}
                                                                    className="flex-1 py-1.5 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1"
                                                                    title="Preview restore before confirming"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                    Preview
                                                                </button>
                                                                {!version.is_locked && (
                                                                    <button
                                                                        onClick={() => handleDeleteVersion(version.id)}
                                                                        disabled={versionActionLoading === version.id}
                                                                        className="px-2 py-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                        title="Delete Version"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-slate-400 text-center pt-2">
                                                Automatically keeps last 10 versions. Lock versions to prevent auto-deletion.
                                            </div>
                                        </div>
                                    )}
                                </div>
                                </div>
                                </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tab and Section Manager */}
                        <div className="w-full min-w-0 flex-1 space-y-6">
                            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white truncate">Manage Tabs & Sections</h3>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                    <HierarchyExpandControls
                                        canExpand={canExpandAllToSections}
                                        canCollapse={canCollapseAll}
                                        onExpandAll={expandAllToSections}
                                        onCollapseAll={collapseAllTabsAndSections}
                                    />
                                    <HierarchyViewSwitcher value={hierarchyView} onChange={changeHierarchyView} />
                                    <button
                                        onClick={handleAddTab}
                                        className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                        </svg>
                                        Add Tab
                                    </button>
                                </div>
                            </div>

                            {/* Link Search Box */}
                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                                <div className="relative">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={linkSearchTerm}
                                        onChange={(e) => setLinkSearchTerm(e.target.value)}
                                        placeholder="Search links by name or URL..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                    />
                                    {linkSearchTerm && (
                                        <button
                                            onClick={() => setLinkSearchTerm('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                            title="Clear search"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                {linkSearchTerm && (
                                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        {(() => {
                                            const allLinks = editTabs.flatMap(tab => tab.sections.flatMap(section => section.links));
                                            const matchedLinks = allLinks.filter(link =>
                                                link.label.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                                                link.url.toLowerCase().includes(linkSearchTerm.toLowerCase())
                                            );
                                            return (
                                                <>
                                                    {matchedLinks.length} link{matchedLinks.length !== 1 ? 's' : ''} found
                                                    {selectedItemCount > 0 && (
                                                        <button
                                                            onClick={clearItemSelection}
                                                            className="text-xs text-red-500 hover:text-red-600 font-semibold underline underline-offset-2 transition-colors ml-4"
                                                        >
                                                            Clear selection ({selectedItemCount})
                                                        </button>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                                {!linkSearchTerm && selectedItemCount > 0 && (
                                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        {selectedItemCount} item{selectedItemCount !== 1 ? 's' : ''} selected
                                        {selectedLinkIds.length > 0 && selectedRichTextIds.length > 0 && (
                                            <span className="text-slate-400"> ({selectedLinkIds.length} link{selectedLinkIds.length !== 1 ? 's' : ''}, {selectedRichTextIds.length} rich text)</span>
                                        )}
                                        <button
                                            onClick={clearItemSelection}
                                            className="text-xs text-red-500 hover:text-red-600 font-semibold underline underline-offset-2 transition-colors ml-4"
                                        >
                                            Clear selection
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Tab Navigation Bar - Sticky */}
                            {editTabs.length > 1 && (
                                <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                                    <div className="flex items-center gap-2 overflow-x-auto">
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Quick Nav:</span>
                                        <div className="flex gap-2">
                                            {editTabs.map((tab, index) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => {
                                                        const element = document.getElementById(`tab-${tab.id}`);
                                                        if (element) {
                                                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-brand-100 dark:hover:bg-brand-900/30 text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors whitespace-nowrap flex items-center gap-1.5"
                                                >
                                                    <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold flex items-center justify-center">
                                                        {index + 1}
                                                    </span>
                                                    {tab.emoji ? <span aria-hidden>{tab.emoji}</span> : null}
                                                    {tab.title || 'Untitled'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-6">
                                {/* Render tabs if available, otherwise fall back to sections (backward compatibility) */}
                                {editTabs.length > 0 ? (
                                    hierarchyView !== 'cards' ? (
                                        <div className="space-y-3">
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {hierarchyView === 'tree' ? 'Tree' : 'Compact'} view — use the ⋯ menu for actions. Opening Edit / Add switches to Cards for the full form (your preferred view stays saved).
                                            </p>
                                            <TileHierarchyViews
                                                mode={hierarchyView}
                                                tabs={editTabs}
                                                expandedTabs={expandedTabs}
                                                expandedSections={expandedSections}
                                                selectedLinkIds={selectedLinkIds}
                                                selectedRichTextIds={selectedRichTextIds}
                                                linkSearchTerm={linkSearchTerm}
                                                canDeleteTabs={tile.canDeleteTabs !== false && (tile.canDeleteTabs !== undefined || !!tile.canEdit)}
                                                onToggleTab={toggleTab}
                                                onToggleSection={toggleSection}
                                                onAddSection={handleAddSection}
                                                onRemoveTab={handleRemoveTab}
                                                onRemoveSection={handleRemoveSection}
                                                onCloneTab={handleCloneTab}
                                                onCloneSection={handleCloneSection}
                                                onCloneLink={handleCloneLink}
                                                onConvertLinkToTile={openConvertLinkDialog}
                                                onConvertTabToSpace={openConvertTabToSpaceDialog}
                                                onConvertSectionToSpace={openConvertSectionToSpaceDialog}
                                                onRemoveLink={handleRemoveLinkFromSection}
                                                onMoveTab={handleMoveTab}
                                                onMoveSection={handleMoveSection}
                                                onMoveItem={handleMoveItem}
                                                onUpdateTabColor={handleUpdateTabColor}
                                                onUpdateTabEmoji={handleUpdateTabEmoji}
                                                onUpdateSectionColor={handleUpdateSectionColor}
                                                onUpdateSectionEmoji={handleUpdateSectionEmoji}
                                                onToggleForceStacked={handleToggleForceStacked}
                                                onImportTab={openTabJsonImport}
                                                onImportSection={openSectionLinksImport}
                                                onScheduleTab={(tabId) => setSchedulingDialogTab(tabId)}
                                                onScheduleSection={(tabId, sectionId) => setSchedulingDialogSection({ tabId, sectionId })}
                                                onScheduleLink={(tabId, sectionId, linkId) => setSchedulingDialogLink({ tabId, sectionId, linkId })}
                                                onVisibilityTab={(tabId) => setVisibilityDialogTab(tabId)}
                                                onVisibilitySection={(tabId, sectionId) => setVisibilityDialogSection({ tabId, sectionId })}
                                                onEditLink={(tabId, sectionId, link) => {
                                                    expandTabAndSection(tabId, sectionId);
                                                    handleStartEditLink(link);
                                                    openCardsForEditing(`link-${link.id}`);
                                                }}
                                                onEditRichText={(tabId, sectionId, richTextId) => {
                                                    expandTabAndSection(tabId, sectionId);
                                                    setEditingRichTextId(prev => ({ ...prev, [sectionId]: richTextId }));
                                                    openCardsForEditing(`link-${richTextId}`);
                                                }}
                                                onDeleteRichText={handleDeleteRichText}
                                                onCloneRichText={handleCloneRichText}
                                                onAddLink={(tabId, sectionId) => {
                                                    expandTabAndSection(tabId, sectionId);
                                                    setShowAddLinkForm(prev => ({ ...prev, [sectionId]: true }));
                                                    openCardsForEditing(`tab-${tabId}`);
                                                }}
                                                onAddRichText={(tabId, sectionId) => {
                                                    expandTabAndSection(tabId, sectionId);
                                                    setShowAddRichTextForm(prev => ({ ...prev, [sectionId]: true }));
                                                    openCardsForEditing(`tab-${tabId}`);
                                                }}
                                                onToggleLinkSelection={toggleLinkSelection}
                                                onToggleRichTextSelection={toggleRichTextSelection}
                                                onToggleFavorite={handleToggleLinkFavorite}
                                            />
                                        </div>
                                    ) : (
                                    editTabs.map((tab, tabIndex) => {
                                        // Generate a color for visual identification based on tab index
                                        const tabColorIndex = tabIndex % 6;
                                        const tabBorderColors = [
                                            'border-l-4 border-l-blue-600',
                                            'border-l-4 border-l-green-600',
                                            'border-l-4 border-l-purple-600',
                                            'border-l-4 border-l-orange-600',
                                            'border-l-4 border-l-pink-600',
                                            'border-l-4 border-l-teal-600'
                                        ];
                                        const tabBgColors = [
                                            'bg-gradient-to-r from-blue-50 via-white to-slate-50 dark:from-blue-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-green-50 via-white to-slate-50 dark:from-green-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-purple-50 via-white to-slate-50 dark:from-purple-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-orange-50 via-white to-slate-50 dark:from-orange-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-pink-50 via-white to-slate-50 dark:from-pink-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-teal-50 via-white to-slate-50 dark:from-teal-900/20 dark:via-slate-800/50 dark:to-slate-900/50'
                                        ];
                                        const tabColorClass = tabBorderColors[tabColorIndex];
                                        const tabBgClass = tabBgColors[tabColorIndex];

                                        return (
                                            <div id={`tab-${tab.id}`} key={tab.id} className={`bg-white dark:bg-slate-800 border-2 border-t-2 border-r-2 border-b-2 border-slate-200 dark:border-slate-700 ${tabColorClass} rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-black/20 scroll-mt-24 hover:shadow-xl transition-shadow`}>
                                                {/* Tab Header */}
                                                <div className={`p-5 ${expandedTabs.has(tab.id) ? 'border-b-2 border-slate-200 dark:border-slate-700' : ''} ${tabBgClass} flex flex-wrap gap-x-3 gap-y-2 items-center`}>
                                                    <div className="flex items-center gap-3 min-w-[10rem] grow">
                                                    {/* Collapse Toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleTab(tab.id)}
                                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                                                        title={expandedTabs.has(tab.id) ? 'Collapse tab' : 'Expand tab'}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 transition-transform ${expandedTabs.has(tab.id) ? 'rotate-180' : ''}`}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                        </svg>
                                                    </button>
                                                    {/* Tab Reorder Buttons */}
                                                    <div className="flex flex-col gap-0.5">
                                                        <button
                                                            onClick={() => handleMoveTab(tab.id, 'up')}
                                                            disabled={tabIndex === 0}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                            title="Move Tab Up"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleMoveTab(tab.id, 'down')}
                                                            disabled={tabIndex === editTabs.length - 1}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                            title="Move Tab Down"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <div className="text-slate-400 dark:text-slate-500 font-mono text-sm">Tab #{tabIndex + 1}</div>
                                                    <TitleEmojiPicker
                                                        value={tab.emoji || ''}
                                                        onChange={(emoji) => handleUpdateTabEmoji(tab.id, emoji)}
                                                        title="Tab emoji"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={tab.title}
                                                        onChange={(e) => handleUpdateTabTitle(tab.id, e.target.value)}
                                                        placeholder="Tab Title (e.g. Resources)"
                                                        className="flex-1 min-w-0 bg-transparent border-none font-bold text-lg focus:ring-0 placeholder-slate-400"
                                                        style={tab.textColor ? { color: tab.textColor } : { color: 'inherit' }}
                                                    />
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-wrap justify-end w-full min-w-0 flex-[1_1_18rem] [&>*]:shrink-0">
                                                    {tile.canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openConvertTabToSpaceDialog(tab.id)}
                                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2"
                                                        title="Convert tab to independent space"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path d="M2 4.25A2.25 2.25 0 014.25 2h2.5A2.25 2.25 0 019 4.25v2.5A2.25 2.25 0 016.75 9h-2.5A2.25 2.25 0 012 6.75v-2.5zM11 4.25A2.25 2.25 0 0113.25 2h2.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9h-2.5A2.25 2.25 0 0111 6.75v-2.5zM2 13.25A2.25 2.25 0 014.25 11h2.5A2.25 2.25 0 019 13.25v2.5A2.25 2.25 0 016.75 18h-2.5A2.25 2.25 0 012 15.75v-2.5zM12.25 11.75a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2a.75.75 0 00-1.5 0v2h-2z" />
                                                        </svg>
                                                    </button>
                                                    )}
                                                    <ShortUrlInheritToggle
                                                        checked={tab.inheritShortUrls !== false}
                                                        title="On: inherit short URLs from the space. Off: show original URLs for this tab."
                                                        onChange={(inherit) => {
                                                            setEditTabs(editTabs.map((t) => t.id === tab.id ? { ...t, inheritShortUrls: inherit } : t));
                                                        }}
                                                    />
                                                    {effectiveShowShortUrls(showShortUrls, tab) ? (
                                                    <ShortUrlActions
                                                        targetType="tab"
                                                        targetId={tab.id}
                                                        shortUrl={shortOf('tab', tab.id, tab.shortUrl)}
                                                        canRecycle={canRecycleShortUrl}
                                                        compact
                                                        onRecycled={({ shortUrl }) => applyRecycledShortUrl('tab', tab.id, shortUrl)}
                                                    />
                                                    ) : null}
                                                    {/* Color Picker for Tab Title */}
                                                    <div className="flex items-center gap-1">
                                                        <label
                                                            className="cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                                                            title="Choose text color for this tab"
                                                        >
                                                            <input
                                                                type="color"
                                                                value={tab.textColor && tab.textColor.trim() ? tab.textColor : '#000000'}
                                                                onChange={(e) => handleUpdateTabColor(tab.id, e.target.value)}
                                                                className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                                                            />
                                                            <span className="text-xs text-slate-500 dark:text-slate-400">Color</span>
                                                        </label>
                                                        {tab.textColor && (
                                                            <button
                                                                onClick={() => handleUpdateTabColor(tab.id, '')}
                                                                className="text-slate-400 hover:text-red-500 p-1"
                                                                title="Remove color"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleCloneTab(tab.id)}
                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2"
                                                        title="Clone Tab"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openTabJsonImport(tab.id)}
                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2"
                                                        title="Import tab from JSON (inserts after this tab)"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => exportTabToFile(tab)}
                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2"
                                                        title="Export tab as JSON (all sections, links, and rich text)"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => setSchedulingDialogTab(tab.id)}
                                                        className="text-slate-400 hover:text-green-600 dark:hover:text-green-400 p-2"
                                                        title="Schedule Tab"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                    {(tab.visibleFrom || tab.expiresAt) && (
                                                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                            📅 Scheduled
                                                        </span>
                                                    )}
                                                    {tab.visibility && tab.visibility !== 'public' && (
                                                        <VisibilityProtectionBadge visibility={tab.visibility} size="md" />
                                                    )}
                                                    {user?.is_admin && tab.published === false && (
                                                        <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                                                            Unpublished
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => setVisibilityDialogTab(tab.id)}
                                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-2"
                                                        title="Set Tab Visibility"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => setRestrictionsDialogTab(tab.id)}
                                                        className="text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 p-2"
                                                        title="Tab access restrictions"
                                                    >
                                                        <span className="text-base leading-none">🛡️</span>
                                                    </button>
                                                    <AccessRestrictionsBadge rules={tab.accessRestrictions} />
                                                    {(tile.canDeleteTabs !== false && (tile.canDeleteTabs !== undefined || tile.canEdit)) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (tile.canDeleteTabs !== false && (tile.canDeleteTabs !== undefined || tile.canEdit)) {
                                                                    console.log('Delete button clicked for tab:', { id: tab.id, title: tab.title });
                                                                    handleRemoveTab(tab.id);
                                                                }
                                                            }}
                                                            disabled={editTabs.length <= 1}
                                                            className="text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed p-2"
                                                            title={editTabs.length <= 1 ? "Cannot delete the last tab" : "Delete Tab"}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    </div>
                                                </div>

                                                {/* Tab Sections */}
                                                {expandedTabs.has(tab.id) && (
                                                <div className="p-4 space-y-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Sections in this tab</h4>
                                                        <button
                                                            onClick={() => handleAddSection(tab.id)}
                                                            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center gap-2"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                            </svg>
                                                            Add Section
                                                        </button>
                                                    </div>

                                                    {[...tab.sections].sort((a, b) => {
                                                        const posA = a.position ?? 0;
                                                        const posB = b.position ?? 0;
                                                        return posA - posB;
                                                    }).map((section, sectionIndex) => {
                                                        // Generate a color for visual identification based on section index
                                                        const colorIndex = sectionIndex % 6;
                                                        const borderColors = [
                                                            'border-r-4 border-r-blue-500',
                                                            'border-r-4 border-r-green-500',
                                                            'border-r-4 border-r-purple-500',
                                                            'border-r-4 border-r-orange-500',
                                                            'border-r-4 border-r-pink-500',
                                                            'border-r-4 border-r-teal-500'
                                                        ];
                                                        const bgColors = [
                                                            'bg-blue-50 dark:bg-blue-900/10',
                                                            'bg-green-50 dark:bg-green-900/10',
                                                            'bg-purple-50 dark:bg-purple-900/10',
                                                            'bg-orange-50 dark:bg-orange-900/10',
                                                            'bg-pink-50 dark:bg-pink-900/10',
                                                            'bg-teal-50 dark:bg-teal-900/10'
                                                        ];
                                                        const sectionColorClass = borderColors[colorIndex];
                                                        const sectionBgClass = bgColors[colorIndex];

                                                        return (
                                                            <div key={section.id} className={`bg-slate-50 dark:bg-slate-900/50 border-2 border-l-2 border-t-2 border-b-2 border-slate-200 dark:border-slate-700 ${sectionColorClass} rounded-xl overflow-hidden shadow-sm`}>
                                                                {/* Section Header */}
                                                                <div className={`p-4 ${expandedSections.has(section.id) ? 'border-b-2 border-slate-200 dark:border-slate-700' : ''} bg-white dark:bg-slate-800 ${sectionBgClass} flex flex-wrap gap-x-3 gap-y-2 items-center`}>
                                                                    <div className="flex items-center gap-3 min-w-[10rem] grow">
                                                                    {/* Collapse Toggle */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleSection(section.id)}
                                                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                                                                        title={expandedSections.has(section.id) ? 'Collapse section' : 'Expand section'}
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform ${expandedSections.has(section.id) ? 'rotate-180' : ''}`}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                        </svg>
                                                                    </button>
                                                                    {/* Reorder Buttons */}
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <button
                                                                            onClick={() => handleMoveSection(tab.id, section.id, 'up')}
                                                                            disabled={sectionIndex === 0}
                                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                                            title="Move Up"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleMoveSection(tab.id, section.id, 'down')}
                                                                            disabled={sectionIndex === tab.sections.length - 1}
                                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                                            title="Move Down"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                    <div className="text-slate-400 dark:text-slate-500 font-mono text-xs">#{sectionIndex + 1}</div>
                                                                    {/* Select All Checkbox */}
                                                                    <div className="flex items-center px-1" title="Select all links and rich text in this section">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={
                                                                                ((section.links || []).length > 0 || (section.richTextContent || []).length > 0)
                                                                                && (section.links || []).every(l => selectedLinkIds.includes(l.id))
                                                                                && (section.richTextContent || []).every(r => selectedRichTextIds.includes(r.id))
                                                                            }
                                                                            onChange={() => toggleAllLinksInSectionSelection(section)}
                                                                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                                                        />
                                                                    </div>
                                                                    <TitleEmojiPicker
                                                                        value={section.emoji || ''}
                                                                        onChange={(emoji) => handleUpdateSectionEmoji(tab.id, section.id, emoji)}
                                                                        size="sm"
                                                                        title="Section emoji"
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        value={section.title}
                                                                        onChange={(e) => handleUpdateSectionTitle(tab.id, section.id, e.target.value)}
                                                                        placeholder="Section Header (e.g. Resources)"
                                                                        className="flex-1 min-w-0 bg-transparent border-none text-slate-900 dark:text-white font-semibold focus:ring-0 placeholder-slate-400"
                                                                    />
                                                                    </div>
                                                                    <div className="flex items-center gap-1 flex-wrap justify-end w-full min-w-0 flex-[1_1_18rem] [&>*]:shrink-0">
                                                                    {tile.canEdit && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openConvertSectionToSpaceDialog(tab.id, section.id)}
                                                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2"
                                                                        title="Convert section to independent space"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                                            <path d="M2 4.25A2.25 2.25 0 014.25 2h2.5A2.25 2.25 0 019 4.25v2.5A2.25 2.25 0 016.75 9h-2.5A2.25 2.25 0 012 6.75v-2.5zM11 4.25A2.25 2.25 0 0113.25 2h2.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9h-2.5A2.25 2.25 0 0111 6.75v-2.5zM2 13.25A2.25 2.25 0 014.25 11h2.5A2.25 2.25 0 019 13.25v2.5A2.25 2.25 0 016.75 18h-2.5A2.25 2.25 0 012 15.75v-2.5zM12.25 11.75a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2a.75.75 0 00-1.5 0v2h-2z" />
                                                                        </svg>
                                                                    </button>
                                                                    )}
                                                                    <ShortUrlInheritToggle
                                                                        checked={section.inheritShortUrls !== false}
                                                                        title="On: inherit short URLs from the tab/space. Off: show original URLs for this section."
                                                                        onChange={(inherit) => {
                                                                            setEditTabs(editTabs.map((t) => {
                                                                                if (t.id !== tab.id) return t;
                                                                                return {
                                                                                    ...t,
                                                                                    sections: t.sections.map((s) =>
                                                                                        s.id === section.id ? { ...s, inheritShortUrls: inherit } : s
                                                                                    )
                                                                                };
                                                                            }));
                                                                        }}
                                                                    />
                                                                    {effectiveShowShortUrls(showShortUrls, tab, section) ? (
                                                                    <ShortUrlActions
                                                                        targetType="section"
                                                                        targetId={section.id}
                                                                        shortUrl={shortOf('section', section.id, section.shortUrl)}
                                                                        canRecycle={canRecycleShortUrl}
                                                                        compact
                                                                        onRecycled={({ shortUrl }) => applyRecycledShortUrl('section', section.id, shortUrl)}
                                                                    />
                                                                    ) : null}
                                                                    {/* Bulk Action Buttons */}
                                                                    {selectedItemCount > 0 && (
                                                                        <div className="flex gap-1.5 animate-in fade-in slide-in-from-right-2">
                                                                            <button
                                                                                onClick={() => handleBulkMove(tab.id, section.id)}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-[10px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 whitespace-nowrap"
                                                                                title="Move selected links and rich text to this section"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                                                                </svg>
                                                                                MOVE ({selectedItemCount})
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleBulkCopy(tab.id, section.id)}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 whitespace-nowrap"
                                                                                title="Copy selected links and rich text to this section"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v2.25a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 19.5V6.25a2.25 2.25 0 0 1 2.25-2.25h9a2.25 2.25 0 0 1 2.25 2.25v2.25m-6.75 2.25h13.5m-3 0-3 3m3-3-3-3" />
                                                                                </svg>
                                                                                COPY
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    {/* Color Picker for Section Title */}
                                                                    <div className="flex items-center gap-1">
                                                                        <label
                                                                            className="cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                                                                            title="Choose text color for this section"
                                                                        >
                                                                            <input
                                                                                type="color"
                                                                                value={section.textColor || '#000000'}
                                                                                onChange={(e) => {
                                                                                    const newTabs = editTabs.map(t => {
                                                                                        if (t.id === tab.id) {
                                                                                            return {
                                                                                                ...t,
                                                                                                sections: t.sections.map(s =>
                                                                                                    s.id === section.id
                                                                                                        ? { ...s, textColor: e.target.value }
                                                                                                        : s
                                                                                                )
                                                                                            };
                                                                                        }
                                                                                        return t;
                                                                                    });
                                                                                    setEditTabs(newTabs);
                                                                                }}
                                                                                className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                                                                            />
                                                                            <span className="text-xs text-slate-500 dark:text-slate-400">Color</span>
                                                                        </label>
                                                                        {section.textColor && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    const newTabs = editTabs.map(t => {
                                                                                        if (t.id === tab.id) {
                                                                                            return {
                                                                                                ...t,
                                                                                                sections: t.sections.map(s =>
                                                                                                    s.id === section.id
                                                                                                        ? { ...s, textColor: undefined }
                                                                                                        : s
                                                                                                )
                                                                                            };
                                                                                        }
                                                                                        return t;
                                                                                    });
                                                                                    setEditTabs(newTabs);
                                                                                }}
                                                                                className="text-slate-400 hover:text-red-500 p-1"
                                                                                title="Reset to default color"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                </svg>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {/* Force Stacked View Checkbox */}
                                                                    <div className="flex items-center gap-1">
                                                                        <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Force stacked view for this section">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={section.forceStackedView || false}
                                                                                onChange={(e) => {
                                                                                    const newTabs = editTabs.map(t => {
                                                                                        if (t.id === tab.id) {
                                                                                            return {
                                                                                                ...t,
                                                                                                sections: t.sections.map(s =>
                                                                                                    s.id === section.id
                                                                                                        ? { ...s, forceStackedView: e.target.checked }
                                                                                                        : s
                                                                                                )
                                                                                            };
                                                                                        }
                                                                                        return t;
                                                                                    });
                                                                                    setEditTabs(newTabs);
                                                                                }}
                                                                                className="w-4 h-4 text-brand-600 bg-slate-100 border-slate-300 rounded focus:ring-brand-500 dark:focus:ring-brand-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                                                                            />
                                                                            <span className="text-xs text-slate-600 dark:text-slate-400">Force Stacked</span>
                                                                        </label>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openSectionLinksImport(tab.id, section.id)}
                                                                        disabled={!!importingSectionLinks[section.id]}
                                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2 shrink-0 disabled:opacity-50"
                                                                        title="Import links from JSON or CSV (detected by file extension)"
                                                                    >
                                                                        {importingSectionLinks[section.id] ? (
                                                                            <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                                            </svg>
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => exportSectionLinksToFile(section)}
                                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2 shrink-0"
                                                                        title="Export links in this section as JSON"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleCloneSection(tab.id, section.id)}
                                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2"
                                                                        title="Clone Section"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setSchedulingDialogSection({ tabId: tab.id, sectionId: section.id })}
                                                                        className="text-slate-400 hover:text-green-600 dark:hover:text-green-400 p-2"
                                                                        title="Schedule Section"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>
                                                                    {(section.visibleFrom || section.expiresAt) && (
                                                                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                                            📅 Scheduled
                                                                        </span>
                                                                    )}
                                                                    {section.visibility && section.visibility !== 'public' && (
                                                                        <VisibilityProtectionBadge visibility={section.visibility} size="md" />
                                                                    )}
                                                                    {user?.is_admin && section.published === false && (
                                                                        <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                                                                            Unpublished
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        onClick={() => setVisibilityDialogSection({ tabId: tab.id, sectionId: section.id })}
                                                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-2"
                                                                        title="Set Section Visibility"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                                                        </svg>
                                                                    </button>
                                                                    {(tile.canDeleteSections !== false && (tile.canDeleteSections !== undefined || tile.canEdit)) && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (tile.canDeleteSections !== false && (tile.canDeleteSections !== undefined || tile.canEdit)) {
                                                                                    console.log('Delete section button clicked:', { tabId: tab.id, sectionId: section.id });
                                                                                    handleRemoveSection(tab.id, section.id);
                                                                                }
                                                                            }}
                                                                            className="text-slate-400 hover:text-red-500 p-2"
                                                                            title="Delete Section"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    </div>
                                                                </div>

                                                                {/* Section Links */}
                                                                {expandedSections.has(section.id) && (
                                                                <div className="p-4 bg-white dark:bg-slate-800">
                                                                    <div className="space-y-2 mb-4">
                                                                        {/* Merged Content Rendering */}
                                                                        {(() => {
                                                                            const sortedItems = [
                                                                                ...(section.links || []).map(l => ({ ...l, itemType: 'link' as const })),
                                                                                ...(section.richTextContent || []).map(rt => ({ ...rt, itemType: 'rich-text' as const }))
                                                                            ].sort((a, b) => {
                                                                                const posA = a.position ?? 0;
                                                                                const posB = b.position ?? 0;
                                                                                return posA - posB;
                                                                            });

                                                                            if (sortedItems.length === 0) {
                                                                                return <p className="text-slate-400 dark:text-slate-600 text-sm italic py-2">No content in this section yet.</p>;
                                                                            }

                                                                            return sortedItems.map((item, index) => {
                                                                                const isFirst = index === 0;
                                                                                const isLast = index === sortedItems.length - 1;

                                                                                if (item.itemType === 'rich-text') {
                                                                                    const richText = item;
                                                                                    const isEditing = editingRichTextId[section.id] === richText.id;
                                                                                    const matchesSearch = linkSearchTerm
                                                                                        ? richText.content.toLowerCase().includes(linkSearchTerm.toLowerCase())
                                                                                        : true;

                                                                                    return (
                                                                                        <div
                                                                                            key={richText.id}
                                                                                            id={`link-${richText.id}`} // Using link- prefix for scroll compatibility
                                                                                            className={`transition-opacity duration-200 ${matchesSearch ? 'opacity-100' : 'opacity-40'}`}
                                                                                        >
                                                                                            <RichTextContentItem
                                                                                                ref={(handle) => setRichTextItemRef(section.id, richText.id, handle)}
                                                                                                content={richText}
                                                                                                sectionId={section.id}
                                                                                                tabId={tab.id}
                                                                                                onUpdate={(id, content, meta) => handleUpdateRichText(tab.id, section.id, id, content, meta)}
                                                                                                onDelete={(id) => handleDeleteRichText(tab.id, section.id, id)}
                                                                                                onMoveUp={() => handleMoveItem(tab.id, section.id, richText.id, 'up')}
                                                                                                onMoveDown={() => handleMoveItem(tab.id, section.id, richText.id, 'down')}
                                                                                                canMoveUp={!isFirst}
                                                                                                canMoveDown={!isLast}
                                                                                                isEditing={isEditing}
                                                                                                onEdit={() => setEditingRichTextId(prev => ({ ...prev, [section.id]: richText.id }))}
                                                                                                onCancel={() => setEditingRichTextId(prev => ({ ...prev, [section.id]: null }))}
                                                                                                onSave={() => setEditingRichTextId(prev => ({ ...prev, [section.id]: null }))}
                                                                                                onClone={() => handleCloneRichText(tab.id, section.id, richText.id)}
                                                                                                onSchedule={() => setSchedulingDialogRichText({ tabId: tab.id, sectionId: section.id, richTextId: richText.id })}
                                                                                                onVisibilityChange={(visibility) => handleUpdateRichTextVisibility(tab.id, section.id, richText.id, visibility)}
                                                                                                visibility={richText.visibility || 'public'}
                                                                                                visibleFrom={richText.visibleFrom}
                                                                                                expiresAt={richText.expiresAt}
                                                                                                isSelected={selectedRichTextIds.includes(richText.id)}
                                                                                                onToggleSelect={() => toggleRichTextSelection(richText.id)}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                const link = item as Link;
                                                                                const matchesSearch = linkSearchTerm
                                                                                    ? link.label.toLowerCase().includes(linkSearchTerm.toLowerCase())
                                                                                    : true;
                                                                                const isHovered = hoveredLinkId === link.id;

                                                                                return editingLinkId === link.id ? (
                                                                                    // Edit Mode — organized & collapsible
                                                                                    <div key={link.id} className="bg-gradient-to-br from-white via-slate-50 to-brand-50/40 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 border-2 border-brand-500 dark:border-brand-500/50 rounded-xl p-4 shadow-lg space-y-3">
                                                                                        <div className="flex items-center justify-between gap-2 pb-1">
                                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                                <span className="text-xl shrink-0" aria-hidden>✏️</span>
                                                                                                <div className="min-w-0">
                                                                                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Edit Link</h4>
                                                                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                                                                        Organize access, content, and display options below
                                                                                                    </p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={handleCancelEditLink}
                                                                                                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                                                                                                >
                                                                                                    Cancel
                                                                                                </button>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleUpdateLink(tab.id, section.id, link.id)}
                                                                                                    disabled={!editLinkState[link.id]?.label?.trim() || !editLinkState[link.id]?.url?.trim()}
                                                                                                    className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                                    </svg>
                                                                                                    Save
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Access row — Publish + Visibility always on top */}
                                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                                            {user?.is_admin && (
                                                                                                <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
                                                                                                    (editLinkState[link.id]?.published !== false)
                                                                                                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40'
                                                                                                        : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/60'
                                                                                                }`}>
                                                                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                                                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-slate-800 text-lg shadow-sm" aria-hidden>
                                                                                                            {(editLinkState[link.id]?.published !== false) ? '🚀' : '⏸️'}
                                                                                                        </span>
                                                                                                        <div className="min-w-0">
                                                                                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Publish</div>
                                                                                                            <div className={`text-sm font-semibold ${
                                                                                                                (editLinkState[link.id]?.published !== false)
                                                                                                                    ? 'text-emerald-700 dark:text-emerald-300'
                                                                                                                    : 'text-slate-600 dark:text-slate-300'
                                                                                                            }`}>
                                                                                                                {(editLinkState[link.id]?.published !== false) ? 'Published' : 'Unpublished'}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        role="switch"
                                                                                                        aria-checked={editLinkState[link.id]?.published !== false}
                                                                                                        onClick={() => updateEditLinkState(link.id, 'published', editLinkState[link.id]?.published === false)}
                                                                                                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(editLinkState[link.id]?.published !== false) ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                                    >
                                                                                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(editLinkState[link.id]?.published !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                                    </button>
                                                                                                </div>
                                                                                            )}
                                                                                            <div className={`p-3.5 rounded-xl border-2 ${
                                                                                                editLinkState[link.id]?.visibility === 'private'
                                                                                                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30'
                                                                                                    : editLinkState[link.id]?.visibility === 'authenticated'
                                                                                                        ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
                                                                                                        : 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30'
                                                                                            } ${!user?.is_admin ? 'sm:col-span-2' : ''}`}>
                                                                                                <div className="flex items-center gap-2.5 mb-2">
                                                                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-slate-800 text-lg shadow-sm" aria-hidden>
                                                                                                        {editLinkState[link.id]?.visibility === 'private' ? '🔒' : editLinkState[link.id]?.visibility === 'authenticated' ? '👤' : '🌍'}
                                                                                                    </span>
                                                                                                    <div>
                                                                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Visibility</div>
                                                                                                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Who can see this link</div>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <select
                                                                                                    value={editLinkState[link.id]?.visibility || 'public'}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'visibility', e.target.value as LinkVisibility)}
                                                                                                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium"
                                                                                                >
                                                                                                    {user?.is_admin && <option value="public">🌍 Public (visible to everyone)</option>}
                                                                                                    {user?.is_admin && <option value="authenticated">👤 Authenticated (logged-in users only)</option>}
                                                                                                    <option value="private">🔒 Private (specific users only)</option>
                                                                                                </select>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Private access pickers */}
                                                                                        {editLinkState[link.id]?.visibility === 'private' && (
                                                                                            <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/20 rounded-xl border-2 border-rose-200 dark:border-rose-800/60 space-y-3">
                                                                                                <div className="flex items-center gap-2 text-sm font-semibold text-rose-800 dark:text-rose-200">
                                                                                                    <span aria-hidden>👥</span>
                                                                                                    Allowed users & groups
                                                                                                </div>
                                                                                                <div>
                                                                                                    <div className="flex items-center justify-between mb-2">
                                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Select Users</label>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setShowUserPicker(prev => ({ ...prev, [link.id]: !prev[link.id] }))}
                                                                                                            className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium flex items-center gap-1"
                                                                                                        >
                                                                                                            {showUserPicker[link.id] ? 'Hide' : 'Show'}
                                                                                                        </button>
                                                                                                    </div>
                                                                                                    {editLinkState[link.id]?.allowedUsers && editLinkState[link.id]!.allowedUsers.length > 0 && (
                                                                                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                            {editLinkState[link.id]!.allowedUsers.map(userId => {
                                                                                                                const user = usersList.find(u => u.id === userId);
                                                                                                                return (
                                                                                                                    <span
                                                                                                                        key={userId}
                                                                                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs font-medium"
                                                                                                                    >
                                                                                                                        {user?.username || `User ${userId}`}
                                                                                                                        <AuthSourceBadge source={user?.auth_source} />
                                                                                                                        <button
                                                                                                                            type="button"
                                                                                                                            onClick={() => toggleEditUserSelection(link.id, userId)}
                                                                                                                            className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                                                                            title="Remove user"
                                                                                                                        >
                                                                                                                            ×
                                                                                                                        </button>
                                                                                                                    </span>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {showUserPicker[link.id] && (
                                                                                                        <div className="space-y-1.5">
                                                                                                            <div className="relative">
                                                                                                                <input
                                                                                                                    type="text"
                                                                                                                    value={linkUserSearch[link.id] || ''}
                                                                                                                    onChange={(e) => setLinkUserSearch(prev => ({ ...prev, [link.id]: e.target.value }))}
                                                                                                                    placeholder="Search users..."
                                                                                                                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pl-7 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                                                />
                                                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                                                                </svg>
                                                                                                                {linkUserSearch[link.id] && (
                                                                                                                    <button
                                                                                                                        type="button"
                                                                                                                        onClick={() => setLinkUserSearch(prev => ({ ...prev, [link.id]: '' }))}
                                                                                                                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                                                                                    >
                                                                                                                        ×
                                                                                                                    </button>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                                {loadingUsers ? (
                                                                                                                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">Loading...</div>
                                                                                                                ) : usersList.length === 0 ? (
                                                                                                                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No users available</div>
                                                                                                                ) : (() => {
                                                                                                                    const q = (linkUserSearch[link.id] || '').trim().toLowerCase();
                                                                                                                    const filtered = !q
                                                                                                                        ? usersList
                                                                                                                        : usersList.filter(u =>
                                                                                                                            u.username.toLowerCase().includes(q) ||
                                                                                                                            (u.email || '').toLowerCase().includes(q) ||
                                                                                                                            (u.auth_source || 'local').toLowerCase().includes(q)
                                                                                                                        );
                                                                                                                    if (filtered.length === 0) {
                                                                                                                        return <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No users found</div>;
                                                                                                                    }
                                                                                                                    return filtered.map(user => (
                                                                                                                        <label key={user.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                                            <input type="checkbox" checked={editLinkState[link.id]?.allowedUsers?.includes(user.id) || false} onChange={() => toggleEditUserSelection(link.id, user.id)} className="rounded w-3.5 h-3.5" />
                                                                                                                            <span className="text-xs font-medium">{user.username}</span>
                                                                                                                            <AuthSourceBadge source={user.auth_source} />
                                                                                                                        </label>
                                                                                                                    ));
                                                                                                                })()}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div>
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Select Groups</label>
                                                                                                    {editLinkState[link.id]?.allowedGroups && editLinkState[link.id]!.allowedGroups.length > 0 && (
                                                                                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                            {editLinkState[link.id]!.allowedGroups.map(groupId => {
                                                                                                                const group = availableGroups.find(g => g.id === groupId);
                                                                                                                return (
                                                                                                                    <span key={groupId} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                                                                                                        {group?.name || `Group ${groupId}`}
                                                                                                                        <button type="button" onClick={() => toggleEditGroupSelection(link.id, groupId)} className="hover:text-red-600 dark:hover:text-red-400">×</button>
                                                                                                                    </span>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    <div className="space-y-1.5">
                                                                                                        <div className="relative">
                                                                                                            <input
                                                                                                                type="text"
                                                                                                                value={linkGroupSearch[link.id] || ''}
                                                                                                                onChange={(e) => setLinkGroupSearch(prev => ({ ...prev, [link.id]: e.target.value }))}
                                                                                                                placeholder="Search groups..."
                                                                                                                className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pl-7 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                                            />
                                                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                                                            </svg>
                                                                                                            {linkGroupSearch[link.id] && (
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => setLinkGroupSearch(prev => ({ ...prev, [link.id]: '' }))}
                                                                                                                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                                                                                >
                                                                                                                    ×
                                                                                                                </button>
                                                                                                            )}
                                                                                                        </div>
                                                                                                        <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                            {availableGroups.length === 0 ? (
                                                                                                                <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No groups available</div>
                                                                                                            ) : (() => {
                                                                                                                const q = (linkGroupSearch[link.id] || '').trim().toLowerCase();
                                                                                                                const filtered = !q
                                                                                                                    ? availableGroups
                                                                                                                    : availableGroups.filter(g =>
                                                                                                                        g.name.toLowerCase().includes(q) ||
                                                                                                                        (g.description || '').toLowerCase().includes(q)
                                                                                                                    );
                                                                                                                if (filtered.length === 0) {
                                                                                                                    return <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No groups found</div>;
                                                                                                                }
                                                                                                                return filtered.map(group => (
                                                                                                                    <label key={group.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                                        <input type="checkbox" checked={editLinkState[link.id]?.allowedGroups?.includes(group.id) || false} onChange={() => toggleEditGroupSelection(link.id, group.id)} className="rounded w-3.5 h-3.5" />
                                                                                                                        <span className="text-xs font-medium">{group.name}</span>
                                                                                                                        <span className="text-[10px] text-slate-500">({group.memberCount})</span>
                                                                                                                    </label>
                                                                                                                ));
                                                                                                            })()}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}

                                                                                        <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
                                                                                            (editLinkState[link.id]?.inheritShortUrls !== false)
                                                                                                ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30'
                                                                                                : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/60'
                                                                                        }`}>
                                                                                            <div className="min-w-0">
                                                                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Short URLs</div>
                                                                                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                                                                    {(editLinkState[link.id]?.inheritShortUrls !== false) ? 'Inherit from parent' : 'Override — original URL'}
                                                                                                </div>
                                                                                            </div>
                                                                                            <button
                                                                                                type="button"
                                                                                                role="switch"
                                                                                                aria-checked={editLinkState[link.id]?.inheritShortUrls !== false}
                                                                                                onClick={() => updateEditLinkState(link.id, 'inheritShortUrls', editLinkState[link.id]?.inheritShortUrls === false)}
                                                                                                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(editLinkState[link.id]?.inheritShortUrls !== false) ? 'bg-orange-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                                title="On: inherit short URLs from the section/tab/space. Off: show the original URL."
                                                                                            >
                                                                                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(editLinkState[link.id]?.inheritShortUrls !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                            </button>
                                                                                        </div>

                                                                                        {/* Basics */}
                                                                                        <LinkEditSection
                                                                                            emoji="🔗"
                                                                                            title="Basics"
                                                                                            subtitle="Label, URL, emoji & color"
                                                                                            accent="sky"
                                                                                            defaultOpen
                                                                                        >
                                                                                            <LinkLabelField
                                                                                                key={link.id}
                                                                                                value={editLinkState[link.id]?.label || ''}
                                                                                                onChange={(value) => updateEditLinkState(link.id, 'label', value)}
                                                                                            />
                                                                                            <div>
                                                                                                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">URL</label>
                                                                                                    <UrlProbeBadges url={editLinkState[link.id]?.url || ''} />
                                                                                                </div>
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={editLinkState[link.id]?.url || ''}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'url', e.target.value)}
                                                                                                    placeholder="https://…  http://…  ssh://user@host:22  or vnc://host:5900"
                                                                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                                />
                                                                                            </div>
                                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                                                <div className="relative">
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Emoji</label>
                                                                                                    <div className="flex gap-2 items-center">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [link.id]: !prev[link.id] }))}
                                                                                                            className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                                                                                            title="Select emoji"
                                                                                                        >
                                                                                                            <span className="text-xl">
                                                                                                                {editLinkState[link.id]?.icon || '😀'}
                                                                                                            </span>
                                                                                                        </button>
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={editLinkState[link.id]?.icon || ''}
                                                                                                            onChange={(e) => updateEditLinkState(link.id, 'icon', e.target.value)}
                                                                                                            placeholder="Or type emoji..."
                                                                                                            className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                                        />
                                                                                                    </div>
                                                                                                    {showLinkEmojiPicker[link.id] && (
                                                                                                        <>
                                                                                                            <div className="fixed inset-0 z-[9998]" onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [link.id]: false }))}></div>
                                                                                                            <div className="fixed z-[10051] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-[26rem] max-w-[calc(100vw-1.5rem)] h-[min(420px,72vh)] flex flex-col overflow-hidden" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                                                                                                <EmojiPickerTabs linkId={link.id} editLinkState={editLinkState[link.id]} updateEditLinkState={updateEditLinkState} setShowLinkEmojiPicker={setShowLinkEmojiPicker} />
                                                                                                            </div>
                                                                                                        </>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div>
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Text Color</label>
                                                                                                    <div className="flex gap-2 items-center">
                                                                                                        <input
                                                                                                            type="color"
                                                                                                            value={editLinkState[link.id]?.textColor && editLinkState[link.id]!.textColor.trim() ? editLinkState[link.id]!.textColor : '#000000'}
                                                                                                            onChange={(e) => updateEditLinkState(link.id, 'textColor', e.target.value)}
                                                                                                            className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 transition-all"
                                                                                                            title="Select text color"
                                                                                                        />
                                                                                                        <div className="flex-1 flex gap-1.5">
                                                                                                            <input
                                                                                                                type="text"
                                                                                                                value={editLinkState[link.id]?.textColor || ''}
                                                                                                                onChange={(e) => updateEditLinkState(link.id, 'textColor', e.target.value)}
                                                                                                                placeholder="#000000"
                                                                                                                className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                                            />
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={() => updateEditLinkState(link.id, 'textColor', '')}
                                                                                                                className="px-2.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium"
                                                                                                                title="Clear color"
                                                                                                            >
                                                                                                                Clear
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </LinkEditSection>

                                                                                        {/* Notes & Tooltip */}
                                                                                        <LinkEditSection
                                                                                            emoji="📝"
                                                                                            title="Notes & Tooltip"
                                                                                            subtitle="Owner info, support details, hover text"
                                                                                            accent="amber"
                                                                                            defaultOpen={!!(editLinkState[link.id]?.notesEnabled || hasVisibleRichText(editLinkState[link.id]?.notes) || hasVisibleRichText(editLinkState[link.id]?.tooltip) || hasVisibleRichText(link.notes) || hasVisibleRichText(link.tooltip))}
                                                                                            badge={
                                                                                                (editLinkState[link.id]?.notesEnabled ?? isNotesTooltipEnabled(link)) ? (
                                                                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200 font-medium shrink-0">On</span>
                                                                                                ) : undefined
                                                                                            }
                                                                                            headerAction={
                                                                                                <LinkEditHeaderSwitch
                                                                                                    enabled={!!(editLinkState[link.id]?.notesEnabled ?? isNotesTooltipEnabled(link))}
                                                                                                    onToggle={() => updateEditLinkState(link.id, 'notesEnabled', !(editLinkState[link.id]?.notesEnabled ?? isNotesTooltipEnabled(link)))}
                                                                                                    onClassName="bg-amber-500"
                                                                                                    labelOn="Disable notes and tooltip"
                                                                                                    labelOff="Enable notes and tooltip"
                                                                                                />
                                                                                            }
                                                                                        >
                                                                                            <div>
                                                                                                <div className="flex items-center justify-between mb-1.5">
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Notes (Rich Text)</label>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => {
                                                                                                            setNotesPresetFormState({ linkId: link.id });
                                                                                                        }}
                                                                                                        className="text-[10px] px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 hover:bg-brand-200 dark:hover:bg-brand-900/50 rounded transition-colors flex items-center gap-1"
                                                                                                        title="Use preset form"
                                                                                                    >
                                                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                                                        </svg>
                                                                                                        Preset Form
                                                                                                    </button>
                                                                                                </div>
                                                                                                <SelectableRichTextEditor
                                                                                                    value={editLinkState[link.id]?.notes || ''}
                                                                                                    onChange={(html) => updateEditLinkState(link.id, 'notes', html)}
                                                                                                    placeholder="Add notes... or use Preset Form button above"
                                                                                                    className="min-h-[200px]"
                                                                                                />
                                                                                            </div>
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Hover Tooltip (Rich Text)</label>
                                                                                                <SelectableRichTextEditor
                                                                                                    value={editLinkState[link.id]?.tooltip || ''}
                                                                                                    onChange={(html) => updateEditLinkState(link.id, 'tooltip', html)}
                                                                                                    placeholder="Text shown on hover..."
                                                                                                    className="min-h-[80px]"
                                                                                                />
                                                                                            </div>
                                                                                        </LinkEditSection>

                                                                                        {/* Information Content */}
                                                                                        <LinkEditSection
                                                                                            emoji="📄"
                                                                                            title="Information Content"
                                                                                            subtitle="Rich text dialog instead of opening the URL"
                                                                                            accent="violet"
                                                                                            defaultOpen={!!(editLinkState[link.id]?.richTextEnabled || editLinkState[link.id]?.richTextContent || link.richTextContent)}
                                                                                            badge={
                                                                                                (editLinkState[link.id]?.richTextEnabled ?? isInfoContentEnabled(link)) ? (
                                                                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-200/80 dark:bg-violet-800/50 text-violet-800 dark:text-violet-200 font-medium shrink-0">On</span>
                                                                                                ) : undefined
                                                                                            }
                                                                                            headerAction={
                                                                                                <LinkEditHeaderSwitch
                                                                                                    enabled={!!(editLinkState[link.id]?.richTextEnabled ?? isInfoContentEnabled(link))}
                                                                                                    onToggle={() => updateEditLinkState(link.id, 'richTextEnabled', !(editLinkState[link.id]?.richTextEnabled ?? isInfoContentEnabled(link)))}
                                                                                                    onClassName="bg-violet-500"
                                                                                                    labelOn="Disable information content"
                                                                                                    labelOff="Enable information content"
                                                                                                />
                                                                                            }
                                                                                        >
                                                                                            <div className="flex items-center justify-between gap-2">
                                                                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                                                    If provided, clicking this link opens a rich text dialog instead of navigating to the URL.
                                                                                                </p>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        const demoContent = '<h2>Welcome to Information Content</h2><p>This is a <strong>sample rich text content</strong> that demonstrates various formatting options available in the editor.</p><h3>Key Features</h3><ul><li>Rich text formatting with <em>bold</em> and <u>underline</u></li><li>Lists and structured content</li><li>Links and embedded content</li><li>Custom styling options</li></ul><h3>Contact Information</h3><p>For more information, please contact:</p><p><strong>Support Team:</strong> support@company.com<br/><strong>Phone:</strong> +1-555-0100</p><blockquote><p>This is an important note or quote that stands out from the regular content.</p></blockquote><p>You can edit this content using the rich text editor toolbar above.</p>';
                                                                                                        const currentState = editLinkState[link.id] || {
                                                                                                            label: link.label,
                                                                                                            url: link.url,
                                                                                                            icon: link.icon || '',
                                                                                                            textColor: link.textColor || '',
                                                                                                            visibility: link.visibility || 'public',
                                                                                                            published: link.published !== false,
                                                                                                            inheritShortUrls: link.inheritShortUrls !== false,
                                                                                                            allowedUsers: link.allowedUsers || [],
                                                                                                            allowedGroups: link.allowedGroups || [],
                                                                                                            notes: link.notes || '',
                                                                                                            tooltip: link.tooltip || '',
                                                                                                            notesEnabled: isNotesTooltipEnabled(link),
                                                                                                            browser: link.browser || 'default',
                                                                                                            richTextContent: '',
                                                                                                            richTextEnabled: isInfoContentEnabled(link),
                                                                                                            animation: linkAnimationForEdit(link.animation),
                                                                                                            maintenanceEnabled: link.maintenanceEnabled === true,
                                                                                                            maintenanceMessage: link.maintenanceMessage || '',
                                                                                                            maintenanceVideoUrl: link.maintenanceVideoUrl || ''
                                                                                                        };
                                                                                                        setEditLinkState({
                                                                                                            ...editLinkState,
                                                                                                            [link.id]: {
                                                                                                                ...currentState,
                                                                                                                richTextContent: demoContent,
                                                                                                                richTextEnabled: true
                                                                                                            }
                                                                                                        });
                                                                                                    }}
                                                                                                    className="px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors shrink-0"
                                                                                                >
                                                                                                    Demo Fill
                                                                                                </button>
                                                                                            </div>
                                                                                            <SelectableRichTextEditor
                                                                                                value={editLinkState[link.id]?.richTextContent || ''}
                                                                                                onChange={(html) => {
                                                                                                    const currentState = editLinkState[link.id] || {
                                                                                                        label: link.label,
                                                                                                        url: link.url,
                                                                                                        icon: link.icon || '',
                                                                                                        textColor: link.textColor || '',
                                                                                                        visibility: link.visibility || 'public',
                                                                                                        published: link.published !== false,
                                                                                                        inheritShortUrls: link.inheritShortUrls !== false,
                                                                                                        allowedUsers: link.allowedUsers || [],
                                                                                                        allowedGroups: link.allowedGroups || [],
                                                                                                        notes: link.notes || '',
                                                                                                        tooltip: link.tooltip || '',
                                                                                                        notesEnabled: isNotesTooltipEnabled(link),
                                                                                                        browser: link.browser || 'default',
                                                                                                        richTextContent: '',
                                                                                                        richTextEnabled: isInfoContentEnabled(link),
                                                                                                        animation: linkAnimationForEdit(link.animation),
                                                                                                        maintenanceEnabled: link.maintenanceEnabled === true,
                                                                                                        maintenanceMessage: link.maintenanceMessage || '',
                                                                                                        maintenanceVideoUrl: link.maintenanceVideoUrl || ''
                                                                                                    };
                                                                                                    setEditLinkState({
                                                                                                        ...editLinkState,
                                                                                                        [link.id]: {
                                                                                                            ...currentState,
                                                                                                            richTextContent: html
                                                                                                        }
                                                                                                    });
                                                                                                }}
                                                                                                placeholder="Enter rich text content that will be displayed in a dialog when the link is clicked..."
                                                                                                className="min-h-[200px]"
                                                                                            />
                                                                                        </LinkEditSection>

                                                                                        <LinkEditSection
                                                                                            emoji="🔧"
                                                                                            title="Maintenance"
                                                                                            subtitle="Show a maintenance dialog instead of opening the URL"
                                                                                            accent="amber"
                                                                                            defaultOpen={!!(editLinkState[link.id]?.maintenanceEnabled || editLinkState[link.id]?.maintenanceMessage || editLinkState[link.id]?.maintenanceVideoUrl)}
                                                                                            badge={
                                                                                                editLinkState[link.id]?.maintenanceEnabled ? (
                                                                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200 font-medium shrink-0">On</span>
                                                                                                ) : undefined
                                                                                            }
                                                                                        >
                                                                                            <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
                                                                                                editLinkState[link.id]?.maintenanceEnabled
                                                                                                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                                                                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
                                                                                            }`}>
                                                                                                <div>
                                                                                                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Maintenance window</div>
                                                                                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                                                        {editLinkState[link.id]?.maintenanceEnabled ? 'Clicks show the maintenance message' : 'Off — link opens normally'}
                                                                                                    </div>
                                                                                                </div>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    role="switch"
                                                                                                    aria-checked={!!editLinkState[link.id]?.maintenanceEnabled}
                                                                                                    onClick={() => updateEditLinkState(link.id, 'maintenanceEnabled', !editLinkState[link.id]?.maintenanceEnabled)}
                                                                                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${editLinkState[link.id]?.maintenanceEnabled ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                                >
                                                                                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${editLinkState[link.id]?.maintenanceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                                </button>
                                                                                            </div>
                                                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                                                Message and video are kept when the toggle is off so you can reuse them later.
                                                                                            </p>
                                                                                            <SelectableRichTextEditor
                                                                                                value={editLinkState[link.id]?.maintenanceMessage || ''}
                                                                                                onChange={(html) => updateEditLinkState(link.id, 'maintenanceMessage', html)}
                                                                                                placeholder="Describe the maintenance window..."
                                                                                                className="min-h-[160px]"
                                                                                            />
                                                                                            <LinkMaintenanceVideoField
                                                                                                value={editLinkState[link.id]?.maintenanceVideoUrl || ''}
                                                                                                onChange={(url) => updateEditLinkState(link.id, 'maintenanceVideoUrl', url)}
                                                                                            />
                                                                                        </LinkEditSection>

                                                                                        {/* Advanced */}
                                                                                        <LinkEditSection
                                                                                            emoji="⚙️"
                                                                                            title="Advanced"
                                                                                            subtitle="Browser target & entrance animation"
                                                                                            accent="slate"
                                                                                            defaultOpen={false}
                                                                                        >
                                                                                            {settings.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                                                                                <div>
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Open link in</label>
                                                                                                    <select
                                                                                                        value={editLinkState[link.id]?.browser || 'default'}
                                                                                                        onChange={(e) => updateEditLinkState(link.id, 'browser', e.target.value)}
                                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                                    >
                                                                                                        <option value="default">Default Browser</option>
                                                                                                        {availableBrowsers.length > 0 ? (
                                                                                                            availableBrowsers.map((browserId) => {
                                                                                                                const displayName = browserId
                                                                                                                    .replace(/-/g, ' ')
                                                                                                                    .replace(/\b\w/g, (l) => l.toUpperCase())
                                                                                                                    .replace('Wsl', '(WSL)')
                                                                                                                    .replace('Stable', 'Stable')
                                                                                                                    .replace('Beta', 'Beta')
                                                                                                                    .replace('Dev', 'Dev');
                                                                                                                return (
                                                                                                                    <option key={browserId} value={browserId}>
                                                                                                                        {displayName}
                                                                                                                    </option>
                                                                                                                );
                                                                                                            })
                                                                                                        ) : (
                                                                                                            <>
                                                                                                                <option value="chrome-stable">Chrome Stable</option>
                                                                                                                <option value="chrome-beta">Chrome Beta</option>
                                                                                                                <option value="chrome-dev">Chrome Dev</option>
                                                                                                                <option value="edge-stable">Edge Stable</option>
                                                                                                                <option value="edge-beta">Edge Beta</option>
                                                                                                                <option value="edge-dev">Edge Dev</option>
                                                                                                                <option value="firefox">Firefox (WSL)</option>
                                                                                                            </>
                                                                                                        )}
                                                                                                    </select>
                                                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                                                                                        Select which browser should open this link. Requires browser extension to be installed.
                                                                                                    </p>
                                                                                                </div>
                                                                                            )}
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                                    Entrance Animation
                                                                                                </label>
                                                                                                <div className="flex items-center gap-3">
                                                                                                    <TileAnimationSelector
                                                                                                        persistGlobal={false}
                                                                                                        animationsOnly
                                                                                                        includeInherit
                                                                                                        value={linkAnimationForEdit(editLinkState[link.id]?.animation)}
                                                                                                        onAnimationChange={(animation) => updateEditLinkState(link.id, 'animation', animation)}
                                                                                                        scopeLabel="Link Animation"
                                                                                                        scopeHint="Overrides space Links Animation when not Inherit"
                                                                                                        buttonTitle="Choose entrance animation for this link (or inherit space default)"
                                                                                                    />
                                                                                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                                                        {getAnimationOption(linkAnimationForEdit(editLinkState[link.id]?.animation)).name}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </LinkEditSection>

                                                                                        <LinkEditSection
                                                                                            emoji="🛡️"
                                                                                            title="Additional access restrictions"
                                                                                            subtitle="Optional extra gate when opening this link"
                                                                                            accent="slate"
                                                                                            defaultOpen={hasAccessRestrictions(editLinkState[link.id]?.accessRestrictions)}
                                                                                            badge={<AccessRestrictionsBadge rules={editLinkState[link.id]?.accessRestrictions} />}
                                                                                        >
                                                                                            <AccessRestrictionsEditor
                                                                                                compact
                                                                                                embedded
                                                                                                value={editLinkState[link.id]?.accessRestrictions}
                                                                                                disabled={tile.canChangeVisibility === false}
                                                                                                onChange={(next) => {
                                                                                                    setEditLinkState(prev => ({
                                                                                                        ...prev,
                                                                                                        [link.id]: { ...prev[link.id], accessRestrictions: next }
                                                                                                    }));
                                                                                                }}
                                                                                            />
                                                                                        </LinkEditSection>

                                                                                        {/* Action Buttons */}
                                                                                        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => openConvertLinkDialog(tab.id, section.id, link)}
                                                                                                className="mr-auto px-4 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-all"
                                                                                            >
                                                                                                Convert to tile/space
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={handleCancelEditLink}
                                                                                                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                                                                                            >
                                                                                                Cancel
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleUpdateLink(tab.id, section.id, link.id)}
                                                                                                disabled={!editLinkState[link.id]?.label?.trim() || !editLinkState[link.id]?.url?.trim()}
                                                                                                className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                                </svg>
                                                                                                Save
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                ) : (
                                                                                    // View Mode
                                                                                    <div
                                                                                        key={link.id}
                                                                                        id={`link-${link.id}`}
                                                                                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 cursor-pointer ${matchesSearch
                                                                                            ? linkSearchTerm
                                                                                                ? isHovered
                                                                                                    ? 'bg-yellow-300 dark:bg-yellow-600/40 border-yellow-400 dark:border-yellow-500 shadow-lg scale-[1.02]'
                                                                                                    : 'bg-yellow-200 dark:bg-yellow-600/30 border-yellow-300 dark:border-yellow-500 hover:bg-yellow-300 dark:hover:bg-yellow-600/40 hover:border-yellow-400 dark:hover:border-yellow-500 hover:shadow-md'
                                                                                                : isHovered
                                                                                                    ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 shadow-md scale-[1.02]'
                                                                                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-brand-200 dark:hover:border-brand-700 hover:shadow-sm'
                                                                                            : 'bg-slate-50 dark:bg-slate-900 opacity-40 border-slate-100 dark:border-slate-800'
                                                                                            }`}
                                                                                        onMouseEnter={() => setHoveredLinkId(link.id)}
                                                                                        onMouseLeave={() => setHoveredLinkId(null)}
                                                                                        onClick={() => {
                                                                                            if (linkSearchTerm && matchesSearch) {
                                                                                                document.getElementById(`link-${link.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        {/* Link Reorder Buttons */}
                                                                                        <div className="flex flex-col gap-0.5">
                                                                                            <button
                                                                                                onClick={(e) => { e.stopPropagation(); handleMoveItem(tab.id, section.id, link.id, 'up'); }}
                                                                                                disabled={isFirst}
                                                                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                                                                title="Move Up"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={(e) => { e.stopPropagation(); handleMoveItem(tab.id, section.id, link.id, 'down'); }}
                                                                                                disabled={isLast}
                                                                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                                                                title="Move Down"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                                                </svg>
                                                                                            </button>
                                                                                        </div>
                                                                                        {/* Selection Checkbox */}
                                                                                        <div className="flex items-center px-1" onClick={(e) => e.stopPropagation()}>
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selectedLinkIds.includes(link.id)}
                                                                                                onChange={() => toggleLinkSelection(link.id)}
                                                                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                                                                            />
                                                                                        </div>
                                                                                        <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">{link.icon || '🔗'}</div>
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <div
                                                                                                    className={`text-sm font-medium truncate transition-colors duration-200 ${!link.textColor
                                                                                                        ? 'text-slate-700 dark:text-slate-200'
                                                                                                        : isHovered
                                                                                                            ? ''
                                                                                                            : ''
                                                                                                        }`}
                                                                                                    style={link.textColor ? {
                                                                                                        color: isHovered ? link.textColor : link.textColor,
                                                                                                        // Add text shadow for better visibility on light backgrounds
                                                                                                        textShadow: isHovered ? '0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)',
                                                                                                        fontWeight: isHovered ? '700' : '600',
                                                                                                        filter: isHovered ? 'brightness(1.1)' : 'none',
                                                                                                        transition: 'all 0.2s ease'
                                                                                                    } : undefined}
                                                                                                    dangerouslySetInnerHTML={{ __html: link.label || '' }}
                                                                                                />
                                                                                                {link.visibility && link.visibility !== 'public' && (
                                                                                                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${link.visibility === 'authenticated'
                                                                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                                                                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                                                                                        }`}>
                                                                                                        {link.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                                                    </span>
                                                                                                )}
                                                                                                {user?.is_admin && link.published === false && (
                                                                                                    <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium" title="Unpublished">
                                                                                                        Unpublished
                                                                                                    </span>
                                                                                                )}
                                                                                                {(link.visibleFrom || link.expiresAt) && (
                                                                                                    <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                                                                        📅
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="text-xs text-slate-500 truncate font-mono" title={effectiveShowShortUrls(showShortUrls, tab, section, link) ? viewerLinkUrl({ ...link, shortUrl: shortOf('link', link.id, link.shortUrl) }, true) : link.url}>{effectiveShowShortUrls(showShortUrls, tab, section, link) ? viewerLinkDisplay({ ...link, shortUrl: shortOf('link', link.id, link.shortUrl) }, true) : getDisplayUrl(link.url)}</div>
                                                                                            {settings.browser_specific_links_enabled === '1' && (() => {
                                                                                                // Determine which browser is being used for this link
                                                                                                // Priority: link-specific browser > tile default browser > system default
                                                                                                const browserToUse = link.browser && link.browser !== 'default'
                                                                                                    ? link.browser
                                                                                                    : (tile.browser && tile.browser !== 'default' ? tile.browser : null);

                                                                                                // Only show browser indicator if it's not the system default
                                                                                                if (browserToUse) {
                                                                                                    return (
                                                                                                        <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                                                                                            ({formatBrowserName(browserToUse)} browser)
                                                                                                        </div>
                                                                                                    );
                                                                                                }
                                                                                                return null;
                                                                                            })()}
                                                                                        </div>
                                                                                        <div className="flex gap-1">
                                                                                            {/* Favorite button (in edit mode list) */}
                                                                                            {isAuthenticated && (
                                                                                                <button
                                                                                                    onClick={() => handleToggleLinkFavorite(link.id)}
                                                                                                    className={`p-1.5 rounded transition-all ${link.isFavorite
                                                                                                        ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                                                                        : 'text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                                                                        }`}
                                                                                                    title={link.isFavorite ? "Unfavorite" : "Favorite"}
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                        <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9c-2.436-2.147-4.134-4.194-4.134-6.32 0-2.205 1.795-4 4-4a4.002 4.002 0 013.235 1.643 4.002 4.002 0 013.235-1.643 4 4 0 014 4c0 2.126-1.698 4.173-4.134 6.32a22.037 22.037 0 01-2.582 1.9 20.271 20.271 0 01-1.162.682l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            )}
                                                                                            <button
                                                                                                onClick={() => handleStartEditLink(link)}
                                                                                                className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Edit Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleCloneLink(tab.id, section.id, link.id)}
                                                                                                className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Clone Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                                                    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => openConvertLinkDialog(tab.id, section.id, link)}
                                                                                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Convert to independent tile/space"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                    <path d="M2 4.25A2.25 2.25 0 014.25 2h2.5A2.25 2.25 0 019 4.25v2.5A2.25 2.25 0 016.75 9h-2.5A2.25 2.25 0 012 6.75v-2.5zM11 4.25A2.25 2.25 0 0113.25 2h2.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9h-2.5A2.25 2.25 0 0111 6.75v-2.5zM2 13.25A2.25 2.25 0 014.25 11h2.5A2.25 2.25 0 019 13.25v2.5A2.25 2.25 0 016.75 18h-2.5A2.25 2.25 0 012 15.75v-2.5zM12.25 11.75a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2a.75.75 0 00-1.5 0v2h-2z" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => setSchedulingDialogLink({ tabId: tab.id, sectionId: section.id, linkId: link.id })}
                                                                                                className="p-1.5 text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Schedule Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            {(tile.canDeleteLinks !== false && (tile.canDeleteLinks !== undefined || tile.canEdit)) && (
                                                                                                <button
                                                                                                    onClick={() => handleRemoveLinkFromSection(tab.id, section.id, link.id)}
                                                                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                    title="Delete Link"
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </div>

                                                                    {/* Inline Add Form - Compact Design - Only show when expanded */}
                                                                    {showAddLinkForm[section.id] && (
                                                                        <div className="mt-3 bg-white dark:bg-slate-800 border-2 border-brand-500 dark:border-brand-500/50 rounded-xl p-4 shadow-lg space-y-3">
                                                                            {/* Form Header with Close Button */}
                                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                                                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add New Link</h4>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setShowAddLinkForm(prev => ({ ...prev, [section.id]: false }));
                                                                                        // Clear form when closing
                                                                                        setNewLinkState(prev => ({ ...prev, [section.id]: emptyNewLinkFormState() }));
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                                                                    title="Close form"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                            {/* Link Label & URL */}
                                                                            <div className="space-y-3">
                                                                                <LinkLabelField
                                                                                    key={`new-${section.id}`}
                                                                                    value={newLinkState[section.id]?.label || ''}
                                                                                    onChange={(value) => updateNewLinkState(section.id, 'label', value)}
                                                                                />
                                                                                <div>
                                                                                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">URL</label>
                                                                                        <UrlProbeBadges url={newLinkState[section.id]?.url || ''} />
                                                                                    </div>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={newLinkState[section.id]?.url || ''}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'url', e.target.value)}
                                                                                        placeholder="https://…  http://…  ssh://user@host:22  or vnc://host:5900"
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {/* Emoji Selection */}
                                                                            <div className="relative">
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Emoji</label>
                                                                                <div className="flex gap-2 items-center">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                                                                        className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                                                                        title="Select emoji"
                                                                                    >
                                                                                        <span className="text-xl">
                                                                                            {newLinkState[section.id]?.icon || '😀'}
                                                                                        </span>
                                                                                    </button>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={newLinkState[section.id]?.icon || ''}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'icon', e.target.value)}
                                                                                        placeholder="Or type emoji..."
                                                                                        className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                    />
                                                                                </div>
                                                                                {showLinkEmojiPicker[section.id] && (
                                                                                    <>
                                                                                        <div className="fixed inset-0 z-[9998]" onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [section.id]: false }))}></div>
                                                                                        <div className="fixed z-[10051] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-[26rem] max-w-[calc(100vw-1.5rem)] h-[min(420px,72vh)] flex flex-col overflow-hidden" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                                                                            <EmojiPickerTabs linkId={section.id} editLinkState={newLinkState[section.id]} updateEditLinkState={(id, field, value) => updateNewLinkState(id, field, value)} setShowLinkEmojiPicker={setShowLinkEmojiPicker} />
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>

                                                                            {/* Text Color & Visibility - Side by Side */}
                                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Text Color</label>
                                                                                    <div className="flex gap-2 items-center">
                                                                                        <input
                                                                                            type="color"
                                                                                            value={newLinkState[section.id]?.textColor && newLinkState[section.id]!.textColor.trim() ? newLinkState[section.id]!.textColor : '#000000'}
                                                                                            onChange={(e) => updateNewLinkState(section.id, 'textColor', e.target.value)}
                                                                                            className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 transition-all"
                                                                                            title="Select text color"
                                                                                        />
                                                                                        <div className="flex-1 flex gap-1.5">
                                                                                            <input
                                                                                                type="text"
                                                                                                value={newLinkState[section.id]?.textColor || ''}
                                                                                                onChange={(e) => updateNewLinkState(section.id, 'textColor', e.target.value)}
                                                                                                placeholder="#000000"
                                                                                                className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                            />
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => updateNewLinkState(section.id, 'textColor', '')}
                                                                                                className="px-2.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium"
                                                                                                title="Clear color"
                                                                                            >
                                                                                                Clear
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Visibility</label>
                                                                                    <select
                                                                                        value={newLinkState[section.id]?.visibility || 'public'}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'visibility', e.target.value as LinkVisibility)}
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium"
                                                                                    >
                                                                                        {user?.is_admin && <option value="public">Public (visible to everyone)</option>}
                                                                                        {user?.is_admin && <option value="authenticated">Authenticated (logged-in users only)</option>}
                                                                                        <option value="private">Private (specific users only)</option>
                                                                                    </select>
                                                                                </div>
                                                                            </div>

                                                                            {/* User and Group Selector for Private Visibility */}
                                                                            {(newLinkState[section.id]?.visibility || 'public') === 'private' && (
                                                                                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border-2 border-slate-200 dark:border-slate-700 space-y-3">
                                                                                    <div>
                                                                                        <div className="flex items-center justify-between mb-2">
                                                                                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Select Users</label>
                                                                                            <button type="button" onClick={() => setShowUserPicker(prev => ({ ...prev, [section.id]: !prev[section.id] }))} className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium">
                                                                                                {showUserPicker[section.id] ? 'Hide' : 'Show'}
                                                                                            </button>
                                                                                        </div>
                                                                                        {newLinkState[section.id]?.allowedUsers && newLinkState[section.id]!.allowedUsers.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                {newLinkState[section.id]!.allowedUsers.map(userId => {
                                                                                                    const user = usersList.find(u => u.id === userId);
                                                                                                    return (
                                                                                                        <span key={userId} className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs font-medium">
                                                                                                            {user?.username || `User ${userId}`}
                                                                                                            <AuthSourceBadge source={user?.auth_source} />
                                                                                                            <button type="button" onClick={() => toggleUserSelection(section.id, userId)} className="hover:text-red-600">×</button>
                                                                                                        </span>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                        {showUserPicker[section.id] && (
                                                                                            <div className="space-y-1.5">
                                                                                                <div className="relative">
                                                                                                    <input
                                                                                                        type="text"
                                                                                                        value={linkUserSearch[section.id] || ''}
                                                                                                        onChange={(e) => setLinkUserSearch(prev => ({ ...prev, [section.id]: e.target.value }))}
                                                                                                        placeholder="Search users..."
                                                                                                        className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pl-7 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                                    />
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                                                    </svg>
                                                                                                    {linkUserSearch[section.id] && (
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setLinkUserSearch(prev => ({ ...prev, [section.id]: '' }))}
                                                                                                            className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                                                                        >
                                                                                                            ×
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                    {loadingUsers ? <div className="text-xs text-slate-500 text-center py-2">Loading...</div> : usersList.length === 0 ? <div className="text-xs text-slate-500 text-center py-2">No users available</div> : (() => {
                                                                                                        const q = (linkUserSearch[section.id] || '').trim().toLowerCase();
                                                                                                        const filtered = !q
                                                                                                            ? usersList
                                                                                                            : usersList.filter(u =>
                                                                                                                u.username.toLowerCase().includes(q) ||
                                                                                                                (u.email || '').toLowerCase().includes(q) ||
                                                                                                                (u.auth_source || 'local').toLowerCase().includes(q)
                                                                                                            );
                                                                                                        if (filtered.length === 0) {
                                                                                                            return <div className="text-xs text-slate-500 text-center py-2">No users found</div>;
                                                                                                        }
                                                                                                        return filtered.map(user => (
                                                                                                            <label key={user.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                                <input type="checkbox" checked={newLinkState[section.id]?.allowedUsers?.includes(user.id) || false} onChange={() => toggleUserSelection(section.id, user.id)} className="rounded w-3.5 h-3.5" />
                                                                                                                <span className="text-xs font-medium">{user.username}</span>
                                                                                                                <AuthSourceBadge source={user.auth_source} />
                                                                                                            </label>
                                                                                                        ));
                                                                                                    })()}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Select Groups</label>
                                                                                        {newLinkState[section.id]?.allowedGroups && newLinkState[section.id]!.allowedGroups.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                {newLinkState[section.id]!.allowedGroups.map(groupId => {
                                                                                                    const group = availableGroups.find(g => g.id === groupId);
                                                                                                    return (
                                                                                                        <span key={groupId} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                                                                                            {group?.name || `Group ${groupId}`}
                                                                                                            <button type="button" onClick={() => toggleGroupSelection(section.id, groupId)} className="hover:text-red-600">×</button>
                                                                                                        </span>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="space-y-1.5">
                                                                                            <div className="relative">
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={linkGroupSearch[section.id] || ''}
                                                                                                    onChange={(e) => setLinkGroupSearch(prev => ({ ...prev, [section.id]: e.target.value }))}
                                                                                                    placeholder="Search groups..."
                                                                                                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pl-7 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                                />
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                                                </svg>
                                                                                                {linkGroupSearch[section.id] && (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => setLinkGroupSearch(prev => ({ ...prev, [section.id]: '' }))}
                                                                                                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                                                                    >
                                                                                                        ×
                                                                                                    </button>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                {availableGroups.length === 0 ? <div className="text-xs text-slate-500 text-center py-2">No groups available</div> : (() => {
                                                                                                    const q = (linkGroupSearch[section.id] || '').trim().toLowerCase();
                                                                                                    const filtered = !q
                                                                                                        ? availableGroups
                                                                                                        : availableGroups.filter(g =>
                                                                                                            g.name.toLowerCase().includes(q) ||
                                                                                                            (g.description || '').toLowerCase().includes(q)
                                                                                                        );
                                                                                                    if (filtered.length === 0) {
                                                                                                        return <div className="text-xs text-slate-500 text-center py-2">No groups found</div>;
                                                                                                    }
                                                                                                    return filtered.map(group => (
                                                                                                        <label key={group.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                            <input type="checkbox" checked={newLinkState[section.id]?.allowedGroups?.includes(group.id) || false} onChange={() => toggleGroupSelection(section.id, group.id)} className="rounded w-3.5 h-3.5" />
                                                                                                            <span className="text-xs font-medium">{group.name}</span>
                                                                                                            <span className="text-[10px] text-slate-500">({group.memberCount})</span>
                                                                                                        </label>
                                                                                                    ));
                                                                                                })()}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            {user?.is_admin && (
                                                                                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                                                                    <div>
                                                                                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Publish Status</div>
                                                                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                                            {(newLinkState[section.id]?.published !== false) ? 'Published' : 'Unpublished'}
                                                                                        </div>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        role="switch"
                                                                                        aria-checked={newLinkState[section.id]?.published !== false}
                                                                                        onClick={() => updateNewLinkState(section.id, 'published', newLinkState[section.id]?.published === false)}
                                                                                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(newLinkState[section.id]?.published !== false) ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                    >
                                                                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(newLinkState[section.id]?.published !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                    </button>
                                                                                </div>
                                                                            )}

                                                                            <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border-2 ${
                                                                                (newLinkState[section.id]?.inheritShortUrls !== false)
                                                                                    ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30'
                                                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
                                                                            }`}>
                                                                                <div>
                                                                                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Short URLs</div>
                                                                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                                        {(newLinkState[section.id]?.inheritShortUrls !== false) ? 'Inherit from parent' : 'Override — original URL'}
                                                                                    </div>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    role="switch"
                                                                                    aria-checked={newLinkState[section.id]?.inheritShortUrls !== false}
                                                                                    onClick={() => updateNewLinkState(section.id, 'inheritShortUrls', newLinkState[section.id]?.inheritShortUrls === false)}
                                                                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(newLinkState[section.id]?.inheritShortUrls !== false) ? 'bg-orange-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                    title="On: inherit short URLs from the section/tab/space. Off: show the original URL."
                                                                                >
                                                                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(newLinkState[section.id]?.inheritShortUrls !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                </button>
                                                                            </div>

                                                                            {/* Notes - full width for readability */}
                                                                            <div className="flex items-center justify-between gap-3">
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Notes & Tooltip</label>
                                                                                <LinkEditHeaderSwitch
                                                                                    enabled={!!newLinkState[section.id]?.notesEnabled}
                                                                                    onToggle={() => updateNewLinkState(section.id, 'notesEnabled', !newLinkState[section.id]?.notesEnabled)}
                                                                                    onClassName="bg-amber-500"
                                                                                    labelOn="Disable notes and tooltip"
                                                                                    labelOff="Enable notes and tooltip"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Notes (Rich Text)</label>
                                                                                <SelectableRichTextEditor
                                                                                    value={newLinkState[section.id]?.notes || ''}
                                                                                    onChange={(html) => updateNewLinkState(section.id, 'notes', html)}
                                                                                    placeholder="Add notes..."
                                                                                    className="min-h-[160px]"
                                                                                />
                                                                            </div>

                                                                            {/* Hover Tooltip */}
                                                                            <div>
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Hover Tooltip (Rich Text)</label>
                                                                                <SelectableRichTextEditor
                                                                                    value={newLinkState[section.id]?.tooltip || ''}
                                                                                    onChange={(html) => updateNewLinkState(section.id, 'tooltip', html)}
                                                                                    placeholder="Text shown on hover..."
                                                                                    className="min-h-[80px]"
                                                                                />
                                                                            </div>

                                                                            {/* Rich Text Content */}
                                                                            <div>
                                                                                <div className="flex items-center justify-between mb-1.5">
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                                                        Information Content (Rich Text)
                                                                                    </label>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <LinkEditHeaderSwitch
                                                                                            enabled={!!newLinkState[section.id]?.richTextEnabled}
                                                                                            onToggle={() => updateNewLinkState(section.id, 'richTextEnabled', !newLinkState[section.id]?.richTextEnabled)}
                                                                                            onClassName="bg-violet-500"
                                                                                            labelOn="Disable information content"
                                                                                            labelOff="Enable information content"
                                                                                        />
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const demoContent = '<h2>Welcome to Information Content</h2><p>This is a <strong>sample rich text content</strong> that demonstrates various formatting options available in the editor.</p><h3>Key Features</h3><ul><li>Rich text formatting with <em>bold</em> and <u>underline</u></li><li>Lists and structured content</li><li>Links and embedded content</li><li>Custom styling options</li></ul><h3>Contact Information</h3><p>For more information, please contact:</p><p><strong>Support Team:</strong> support@company.com<br/><strong>Phone:</strong> +1-555-0100</p><blockquote><p>This is an important note or quote that stands out from the regular content.</p></blockquote><p>You can edit this content using the rich text editor toolbar above.</p>';
                                                                                                updateNewLinkState(section.id, 'richTextContent', demoContent);
                                                                                                updateNewLinkState(section.id, 'richTextEnabled', true);
                                                                                            }}
                                                                                            className="px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                                                                                        >
                                                                                            Demo Fill
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                                    If provided, clicking this link will open a rich text dialog instead of navigating to the URL. Leave empty to open the URL normally.
                                                                                </p>
                                                                                <SelectableRichTextEditor
                                                                                    value={newLinkState[section.id]?.richTextContent || ''}
                                                                                    onChange={(html) => updateNewLinkState(section.id, 'richTextContent', html)}
                                                                                    placeholder="Enter rich text content that will be displayed in a dialog when the link is clicked..."
                                                                                    className="min-h-[200px]"
                                                                                />
                                                                            </div>

                                                                            <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border-2 ${
                                                                                newLinkState[section.id]?.maintenanceEnabled
                                                                                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                                                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
                                                                            }`}>
                                                                                <div>
                                                                                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Maintenance window</div>
                                                                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                                        {newLinkState[section.id]?.maintenanceEnabled ? 'Clicks show the maintenance message' : 'Off — link opens normally'}
                                                                                    </div>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    role="switch"
                                                                                    aria-checked={!!newLinkState[section.id]?.maintenanceEnabled}
                                                                                    onClick={() => updateNewLinkState(section.id, 'maintenanceEnabled', !newLinkState[section.id]?.maintenanceEnabled)}
                                                                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${newLinkState[section.id]?.maintenanceEnabled ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                >
                                                                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${newLinkState[section.id]?.maintenanceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                </button>
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Maintenance message (Rich Text)</label>
                                                                                <SelectableRichTextEditor
                                                                                    value={newLinkState[section.id]?.maintenanceMessage || ''}
                                                                                    onChange={(html) => updateNewLinkState(section.id, 'maintenanceMessage', html)}
                                                                                    placeholder="Describe the maintenance window..."
                                                                                    className="min-h-[160px]"
                                                                                />
                                                                            </div>
                                                                            <LinkMaintenanceVideoField
                                                                                value={newLinkState[section.id]?.maintenanceVideoUrl || ''}
                                                                                onChange={(url) => updateNewLinkState(section.id, 'maintenanceVideoUrl', url)}
                                                                            />

                                                                            {/* Browser Selection - Only show if feature is enabled and user has canChangeBrowser or is admin */}
                                                                            {settings.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Open link in</label>
                                                                                    <select
                                                                                        value={newLinkState[section.id]?.browser || 'default'}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'browser', e.target.value)}
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                    >
                                                                                        <option value="default">Default Browser</option>
                                                                                        {availableBrowsers.length > 0 ? (
                                                                                            availableBrowsers.map((browserId) => {
                                                                                                // Format browser ID for display
                                                                                                const displayName = browserId
                                                                                                    .replace(/-/g, ' ')
                                                                                                    .replace(/\b\w/g, (l) => l.toUpperCase())
                                                                                                    .replace('Wsl', '(WSL)')
                                                                                                    .replace('Stable', 'Stable')
                                                                                                    .replace('Beta', 'Beta')
                                                                                                    .replace('Dev', 'Dev');
                                                                                                return (
                                                                                                    <option key={browserId} value={browserId}>
                                                                                                        {displayName}
                                                                                                    </option>
                                                                                                );
                                                                                            })
                                                                                        ) : (
                                                                                            <>
                                                                                                <option value="chrome-stable">Chrome Stable</option>
                                                                                                <option value="chrome-beta">Chrome Beta</option>
                                                                                                <option value="chrome-dev">Chrome Dev</option>
                                                                                                <option value="edge-stable">Edge Stable</option>
                                                                                                <option value="edge-beta">Edge Beta</option>
                                                                                                <option value="edge-dev">Edge Dev</option>
                                                                                                <option value="firefox">Firefox (WSL)</option>
                                                                                            </>
                                                                                        )}
                                                                                    </select>
                                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                                                                        Select which browser should open this link. Requires browser extension to be installed.
                                                                                    </p>
                                                                                </div>
                                                                            )}

                                                                            {/* Link entrance animation */}
                                                                            <div>
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                    Entrance Animation
                                                                                </label>
                                                                                <div className="flex items-center gap-3">
                                                                                    <TileAnimationSelector
                                                                                        persistGlobal={false}
                                                                                        animationsOnly
                                                                                        includeInherit
                                                                                        value={linkAnimationForEdit(newLinkState[section.id]?.animation)}
                                                                                        onAnimationChange={(animation) => updateNewLinkState(section.id, 'animation', animation)}
                                                                                        scopeLabel="Link Animation"
                                                                                        scopeHint="Overrides space Links Animation when not Inherit"
                                                                                        buttonTitle="Choose entrance animation for this link (or inherit space default)"
                                                                                    />
                                                                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                                        {getAnimationOption(linkAnimationForEdit(newLinkState[section.id]?.animation)).name}
                                                                                    </span>
                                                                                </div>
                                                                            </div>

                                                                            <LinkEditSection
                                                                                emoji="🛡️"
                                                                                title="Additional access restrictions"
                                                                                subtitle="Optional extra gate when opening this link"
                                                                                accent="slate"
                                                                                defaultOpen={false}
                                                                                badge={<AccessRestrictionsBadge rules={newLinkState[section.id]?.accessRestrictions} />}
                                                                            >
                                                                                <AccessRestrictionsEditor
                                                                                    compact
                                                                                    embedded
                                                                                    value={newLinkState[section.id]?.accessRestrictions}
                                                                                    disabled={tile.canChangeVisibility === false}
                                                                                    onChange={(next) => {
                                                                                        setNewLinkState(prev => ({
                                                                                            ...prev,
                                                                                            [section.id]: { ...prev[section.id], accessRestrictions: next }
                                                                                        }));
                                                                                    }}
                                                                                />
                                                                            </LinkEditSection>

                                                                            {/* Action Button */}
                                                                            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                                <button
                                                                                    onClick={() => handleAddLinkToSection(tab.id, section.id)}
                                                                                    disabled={!newLinkState[section.id]?.label || !newLinkState[section.id]?.url}
                                                                                    className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                                    </svg>
                                                                                    Save Link
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Add Rich Text Form */}
                                                                    {showAddRichTextForm[section.id] && (
                                                                        <div className="mt-3 bg-white dark:bg-slate-800 border-2 border-emerald-500 dark:border-emerald-500/50 rounded-xl p-4 shadow-lg space-y-3">
                                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                                                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add Rich Text Content</h4>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        clearAddRichTextForm(section.id);
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                                                                    title="Close form"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                            <SelectableRichTextEditor
                                                                                value={newRichTextContent[section.id] || ''}
                                                                                onChange={(value) => setNewRichTextContent(prev => ({ ...prev, [section.id]: value }))}
                                                                                placeholder="Enter rich text content with formatting..."
                                                                            />
                                                                            <RichTextBoxOptionsFields
                                                                                boxed={!!newRichTextBoxed[section.id]}
                                                                                onBoxedChange={(boxed) => setNewRichTextBoxed(prev => ({ ...prev, [section.id]: boxed }))}
                                                                                boxTitle={newRichTextBoxTitle[section.id] || ''}
                                                                                onBoxTitleChange={(value) => setNewRichTextBoxTitle(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxFooter={newRichTextBoxFooter[section.id] || ''}
                                                                                onBoxFooterChange={(value) => setNewRichTextBoxFooter(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxHeaderAlign={newRichTextHeaderAlign[section.id] || 'left'}
                                                                                onBoxHeaderAlignChange={(value) => setNewRichTextHeaderAlign(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxFooterAlign={newRichTextFooterAlign[section.id] || 'left'}
                                                                                onBoxFooterAlignChange={(value) => setNewRichTextFooterAlign(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxHeaderBg={newRichTextHeaderBg[section.id] || DEFAULT_HEADER_BG}
                                                                                onBoxHeaderBgChange={(value) => setNewRichTextHeaderBg(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxFooterBg={newRichTextFooterBg[section.id] || DEFAULT_FOOTER_BG}
                                                                                onBoxFooterBgChange={(value) => setNewRichTextFooterBg(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxBodyBg={newRichTextBodyBg[section.id] || DEFAULT_BODY_BG}
                                                                                onBoxBodyBgChange={(value) => setNewRichTextBodyBg(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxHeaderFontWeight={newRichTextHeaderWeight[section.id] || 'bold'}
                                                                                onBoxHeaderFontWeightChange={(value) => setNewRichTextHeaderWeight(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxFooterFontWeight={newRichTextFooterWeight[section.id] || 'normal'}
                                                                                onBoxFooterFontWeightChange={(value) => setNewRichTextFooterWeight(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxHeaderFontSize={newRichTextHeaderSize[section.id] || 'md'}
                                                                                onBoxHeaderFontSizeChange={(value) => setNewRichTextHeaderSize(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxFooterFontSize={newRichTextFooterSize[section.id] || 'sm'}
                                                                                onBoxFooterFontSizeChange={(value) => setNewRichTextFooterSize(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxHeaderEmoji={newRichTextHeaderEmoji[section.id] || ''}
                                                                                onBoxHeaderEmojiChange={(value) => setNewRichTextHeaderEmoji(prev => ({ ...prev, [section.id]: value }))}
                                                                                boxImportance={newRichTextImportance[section.id] || 'notes'}
                                                                                onBoxImportanceChange={(value) => setNewRichTextImportance(prev => ({ ...prev, [section.id]: value }))}
                                                                                accent="emerald"
                                                                            />
                                                                            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                                <button
                                                                                    onClick={() => handleAddRichTextToSection(tab.id, section.id)}
                                                                                    disabled={!newRichTextContent[section.id]?.trim()}
                                                                                    className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-emerald-500/30 flex items-center gap-1.5"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                                    </svg>
                                                                                    Save Rich Text
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Add Link and Rich Text Buttons - Show when forms are collapsed - At bottom of section */}
                                                                    {!showAddLinkForm[section.id] && !showAddRichTextForm[section.id] && (
                                                                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                                                                            <button
                                                                                onClick={() => {
                                                                                    setShowAddRichTextForm(prev => ({ ...prev, [section.id]: true }));
                                                                                    setNewRichTextHeaderAlign(prev => ({ ...prev, [section.id]: prev[section.id] || 'left' }));
                                                                                    setNewRichTextFooterAlign(prev => ({ ...prev, [section.id]: prev[section.id] || 'left' }));
                                                                                    setNewRichTextHeaderBg(prev => ({ ...prev, [section.id]: prev[section.id] || DEFAULT_HEADER_BG }));
                                                                                    setNewRichTextFooterBg(prev => ({ ...prev, [section.id]: prev[section.id] || DEFAULT_FOOTER_BG }));
                                                                                    setNewRichTextBodyBg(prev => ({ ...prev, [section.id]: prev[section.id] || DEFAULT_BODY_BG }));
                                                                                    setNewRichTextHeaderWeight(prev => ({ ...prev, [section.id]: prev[section.id] || 'bold' }));
                                                                                    setNewRichTextFooterWeight(prev => ({ ...prev, [section.id]: prev[section.id] || 'normal' }));
                                                                                    setNewRichTextHeaderSize(prev => ({ ...prev, [section.id]: prev[section.id] || 'md' }));
                                                                                    setNewRichTextFooterSize(prev => ({ ...prev, [section.id]: prev[section.id] || 'sm' }));
                                                                                    setNewRichTextHeaderEmoji(prev => ({ ...prev, [section.id]: prev[section.id] || '' }));
                                                                                    setNewRichTextImportance(prev => ({ ...prev, [section.id]: prev[section.id] || 'notes' }));
                                                                                }}
                                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 flex items-center justify-center gap-2"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                                                </svg>
                                                                                Add Rich Text
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setShowAddLinkForm(prev => ({ ...prev, [section.id]: true }));
                                                                                }}
                                                                                className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center justify-center gap-2"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                                </svg>
                                                                                Add Link
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}

                                                    {tab.sections.length === 0 && (
                                                        <div className="text-center py-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 text-sm">
                                                            <p>No sections in this tab. Click "Add Section" to get started.</p>
                                                        </div>
                                                    )}
                                                </div>
                                                )}
                                            </div>
                                        );
                                    })
                                    )
                                ) : (
                                    // Backward compatibility: Render sections without tabs
                                    editSections.map((section, index) => {
                                        // Generate a color for visual identification based on section index
                                        const colorIndex = index % 6;
                                        const borderColors = [
                                            'border-r-4 border-r-blue-500',
                                            'border-r-4 border-r-green-500',
                                            'border-r-4 border-r-purple-500',
                                            'border-r-4 border-r-orange-500',
                                            'border-r-4 border-r-pink-500',
                                            'border-r-4 border-r-teal-500'
                                        ];
                                        const bgColors = [
                                            'bg-blue-50 dark:bg-blue-900/10',
                                            'bg-green-50 dark:bg-green-900/10',
                                            'bg-purple-50 dark:bg-purple-900/10',
                                            'bg-orange-50 dark:bg-orange-900/10',
                                            'bg-pink-50 dark:bg-pink-900/10',
                                            'bg-teal-50 dark:bg-teal-900/10'
                                        ];
                                        const sectionColorClass = borderColors[colorIndex];
                                        const sectionBgClass = bgColors[colorIndex];

                                        return (
                                            <div key={section.id} className={`bg-white dark:bg-slate-800 border border-l-2 border-t-2 border-b-2 border-slate-200 dark:border-slate-700 ${sectionColorClass} rounded-2xl overflow-hidden shadow-sm dark:shadow-black/20`}>
                                                {/* Section Header */}
                                                <div className={`p-4 ${expandedSections.has(section.id) ? 'border-b border-slate-200 dark:border-slate-700' : ''} ${sectionBgClass} flex gap-2 items-center`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSection(section.id)}
                                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                                                        title={expandedSections.has(section.id) ? 'Collapse section' : 'Expand section'}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform ${expandedSections.has(section.id) ? 'rotate-180' : ''}`}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                        </svg>
                                                    </button>
                                                    <div className="text-slate-400 dark:text-slate-500 font-mono text-sm">#{index + 1}</div>
                                                    <TitleEmojiPicker
                                                        value={section.emoji || ''}
                                                        onChange={(emoji) => {
                                                            const newSections = editSections.map(s => s.id === section.id ? { ...s, emoji: emoji.trim() || undefined } : s);
                                                            setEditSections(newSections);
                                                        }}
                                                        size="sm"
                                                        title="Section emoji"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={section.title}
                                                        onChange={(e) => {
                                                            // For backward compatibility, update sections directly
                                                            const newSections = editSections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s);
                                                            setEditSections(newSections);
                                                        }}
                                                        placeholder="Section Header (e.g. Resources)"
                                                        className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-bold focus:ring-0 placeholder-slate-400"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            console.log('=== LEGACY SECTION DELETION START ===');
                                                            console.log('Section ID:', section.id);

                                                            if (!isEditing) {
                                                                alert('Please enter edit mode first before deleting sections.');
                                                                return;
                                                            }

                                                            const confirmed = window.confirm('Delete this section and all its links?');
                                                            if (!confirmed) {
                                                                return;
                                                            }

                                                            console.log('Proceeding with legacy section deletion...');
                                                            const filteredSections = editSections.filter(s => s.id !== section.id);
                                                            console.log('Sections before:', editSections.length, 'after:', filteredSections.length);

                                                            setEditSections(filteredSections);

                                                            // Automatically save after deletion
                                                            autoSavingRef.current = true;

                                                            setTimeout(() => {
                                                                console.log('Auto-saving after legacy section deletion...');

                                                                const updatedTile: Tile = {
                                                                    ...tile,
                                                                    title: editTitle,
                                                                    description: editDesc,
                                                                    htmlContent: editHtml,
                                                                    emoji: editEmoji,
                                                                    themeColor: editColor,
                                                                    tabs: editTabs.length > 0 ? editTabs : undefined,
                                                                    sections: editTabs.length > 0 ? undefined : filteredSections,
                                                                    visibility: editVisibility,
                                                                    published: editPublished,
                                                                    allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
                                                                };

                                                                const updatedTilesArray = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);

                                                                try {
                                                                    onUpdateTiles(updatedTilesArray, true);
                                                                    console.log('Auto-save: Legacy section deletion saved successfully');

                                                                    setTimeout(() => {
                                                                        autoSavingRef.current = false;
                                                                    }, 1000);
                                                                } catch (error) {
                                                                    console.error('Auto-save: Failed to save:', error);
                                                                    alert('Failed to save section deletion. Please try saving manually.');
                                                                    autoSavingRef.current = false;
                                                                }
                                                            }, 150);
                                                        }}
                                                        className="text-slate-400 hover:text-red-500 p-2"
                                                        title="Delete Section"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {expandedSections.has(section.id) && (
                                                <div className="p-4 bg-white dark:bg-slate-800">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 italic mb-4">This section uses the old structure. Add a tab to use the new tab-based organization.</p>
                                                    <p className="text-xs text-slate-400 dark:text-slate-600">Links: {section.links?.length || 0}</p>
                                                </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}

                                {editTabs.length === 0 && editSections.length === 0 && (
                                    <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-500">
                                        <p>No tabs yet. Click "Add Tab" to get started.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                )}

                <div className="relative z-[80]">
                <input
                    ref={sectionLinksImportInputRef}
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    className="hidden"
                    aria-hidden={true}
                    onChange={handleSectionLinksImportFile}
                />
                <input
                    ref={tabJsonInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    aria-hidden={true}
                    onChange={handleTabJsonFile}
                />

                        {/* Tab Visibility Dialog */}
                        {visibilityDialogTab && (() => {
                            const tab = editTabs.find(t => t.id === visibilityDialogTab);
                            if (!tab) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setVisibilityDialogTab(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tab Visibility: {tab.title}</h3>
                                            <button
                                                onClick={() => setVisibilityDialogTab(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {user?.is_admin && (
                                            <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                        {tab.published !== false ? 'Published' : 'Unpublished'}
                                                    </div>
                                                    <div className="text-xs text-slate-500">Admin-only when unpublished</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={tab.published !== false}
                                                    onClick={() => handleUpdateTabPublished(tab.id, tab.published === false)}
                                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(tab.published !== false) ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                >
                                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(tab.published !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>
                                        )}

                                        <div className="space-y-3 mb-6">
                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="tabVisibility"
                                                        checked={!tab.visibility || tab.visibility === 'public'}
                                                        onChange={() => handleUpdateTabVisibility(tab.id, 'public')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🌐 Public</div>
                                                        <div className="text-xs text-slate-500">Available for everyone</div>
                                                    </div>
                                                </label>
                                            )}

                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="tabVisibility"
                                                        checked={tab.visibility === 'authenticated'}
                                                        onChange={() => handleUpdateTabVisibility(tab.id, 'authenticated')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🔒 Authenticated</div>
                                                        <div className="text-xs text-slate-500">Logged in users only</div>
                                                    </div>
                                                </label>
                                            )}

                                            <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                <input
                                                    type="radio"
                                                    name="tabVisibility"
                                                    checked={tab.visibility === 'private'}
                                                    onChange={() => handleUpdateTabVisibility(tab.id, 'private', tab.allowedUsers || [], tab.allowedGroups || [])}
                                                    className="w-4 h-4"
                                                />
                                                <div>
                                                    <div className="font-semibold text-slate-900 dark:text-white">🔐 Private</div>
                                                    <div className="text-xs text-slate-500">Specific users and/or groups only</div>
                                                </div>
                                            </label>
                                        </div>

                                        {tab.visibility === 'private' && (
                                            <div className="mb-6 space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Users:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {usersList.map(user => (
                                                            <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={tab.allowedUsers?.includes(user.id) || false}
                                                                    onChange={(e) => {
                                                                        const currentUsers = tab.allowedUsers || [];
                                                                        const newUsers = e.target.checked
                                                                            ? [...currentUsers, user.id]
                                                                            : currentUsers.filter(id => id !== user.id);
                                                                        handleUpdateTabVisibility(tab.id, 'private', newUsers, tab.allowedGroups || []);
                                                                    }}
                                                                    className="rounded"
                                                                />
                                                                <span className="text-sm">{user.username}</span>
                                                                <AuthSourceBadge source={user.auth_source} />
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Groups:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {availableGroups.length === 0 ? (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">No groups available</p>
                                                        ) : (
                                                            availableGroups.map(group => (
                                                                <label key={group.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={tab.allowedGroups?.includes(group.id) || false}
                                                                        onChange={(e) => {
                                                                            const currentGroups = tab.allowedGroups || [];
                                                                            const newGroups = e.target.checked
                                                                                ? [...currentGroups, group.id]
                                                                                : currentGroups.filter(id => id !== group.id);
                                                                            handleUpdateTabVisibility(tab.id, 'private', tab.allowedUsers || [], newGroups);
                                                                        }}
                                                                        className="rounded"
                                                                    />
                                                                    <span className="text-sm">{group.name}</span>
                                                                    <span className="text-xs text-slate-500">({group.memberCount} members)</span>
                                                                </label>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => setVisibilityDialogTab(null)}
                                            className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {restrictionsDialogTab && (() => {
                            const tab = editTabs.find(t => t.id === restrictionsDialogTab);
                            if (!tab) return null;
                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRestrictionsDialogTab(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tab restrictions: {tab.title}</h3>
                                            <button
                                                onClick={() => setRestrictionsDialogTab(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <AccessRestrictionsEditor
                                            collapsible={false}
                                            value={tab.accessRestrictions}
                                            disabled={tile.canChangeVisibility === false}
                                            onChange={(next) => handleUpdateTabAccessRestrictions(tab.id, next)}
                                        />
                                        <button
                                            onClick={() => setRestrictionsDialogTab(null)}
                                            className="mt-4 w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Section Visibility Dialog */}
                        {visibilityDialogSection && (() => {
                            const tab = editTabs.find(t => t.id === visibilityDialogSection.tabId);
                            const section = tab?.sections.find(s => s.id === visibilityDialogSection.sectionId);
                            if (!section) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setVisibilityDialogSection(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Section Visibility: {section.title}</h3>
                                            <button
                                                onClick={() => setVisibilityDialogSection(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {user?.is_admin && (
                                            <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                        {section.published !== false ? 'Published' : 'Unpublished'}
                                                    </div>
                                                    <div className="text-xs text-slate-500">Admin-only when unpublished</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={section.published !== false}
                                                    onClick={() => handleUpdateSectionPublished(visibilityDialogSection.tabId, section.id, section.published === false)}
                                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(section.published !== false) ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                >
                                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(section.published !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>
                                        )}

                                        <div className="space-y-3 mb-6">
                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="sectionVisibility"
                                                        checked={!section.visibility || section.visibility === 'public'}
                                                        onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'public')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🌐 Public</div>
                                                        <div className="text-xs text-slate-500">Available for everyone</div>
                                                    </div>
                                                </label>
                                            )}

                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="sectionVisibility"
                                                        checked={section.visibility === 'authenticated'}
                                                        onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'authenticated')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🔒 Authenticated</div>
                                                        <div className="text-xs text-slate-500">Logged in users only</div>
                                                    </div>
                                                </label>
                                            )}

                                            <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                <input
                                                    type="radio"
                                                    name="sectionVisibility"
                                                    checked={section.visibility === 'private'}
                                                    onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', section.allowedUsers || [], section.allowedGroups || [])}
                                                    className="w-4 h-4"
                                                />
                                                <div>
                                                    <div className="font-semibold text-slate-900 dark:text-white">🔐 Private</div>
                                                    <div className="text-xs text-slate-500">Specific users and/or groups only</div>
                                                </div>
                                            </label>
                                        </div>

                                        {section.visibility === 'private' && (
                                            <div className="mb-6 space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Users:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {usersList.map(user => (
                                                            <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={section.allowedUsers?.includes(user.id) || false}
                                                                    onChange={(e) => {
                                                                        const currentUsers = section.allowedUsers || [];
                                                                        const newUsers = e.target.checked
                                                                            ? [...currentUsers, user.id]
                                                                            : currentUsers.filter(id => id !== user.id);
                                                                        handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', newUsers, section.allowedGroups || []);
                                                                    }}
                                                                    className="rounded"
                                                                />
                                                                <span className="text-sm">{user.username}</span>
                                                                <AuthSourceBadge source={user.auth_source} />
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Groups:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {availableGroups.length === 0 ? (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">No groups available</p>
                                                        ) : (
                                                            availableGroups.map(group => (
                                                                <label key={group.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={section.allowedGroups?.includes(group.id) || false}
                                                                        onChange={(e) => {
                                                                            const currentGroups = section.allowedGroups || [];
                                                                            const newGroups = e.target.checked
                                                                                ? [...currentGroups, group.id]
                                                                                : currentGroups.filter(id => id !== group.id);
                                                                            handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', section.allowedUsers || [], newGroups);
                                                                        }}
                                                                        className="rounded"
                                                                    />
                                                                    <span className="text-sm">{group.name}</span>
                                                                    <span className="text-xs text-slate-500">({group.memberCount} members)</span>
                                                                </label>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => setVisibilityDialogSection(null)}
                                            className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Tab Scheduling Dialog */}
                        {schedulingDialogTab && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogTab);
                            if (!tab) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogTab(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Tab: {tab.title}</h3>
                                            <button
                                                onClick={() => setSchedulingDialogTab(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={tab.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateTabScheduling(tab.id, e.target.value, tab.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tab becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={tab.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateTabScheduling(tab.id, tab.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tab expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration"
                                                    checked={!tab.visibleFrom && !tab.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateTabScheduling(tab.id, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(tab.visibleFrom || tab.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The tab will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateTabScheduling(tab.id, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogTab(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Section Scheduling Dialog */}
                        {schedulingDialogSection && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogSection.tabId);
                            const section = tab?.sections.find(s => s.id === schedulingDialogSection.sectionId);
                            if (!section) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogSection(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Section: {section.title}</h3>
                                            <button
                                                onClick={() => setSchedulingDialogSection(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={section.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, e.target.value, section.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Section becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={section.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, section.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Section expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration-section"
                                                    checked={!section.visibleFrom && !section.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration-section" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(section.visibleFrom || section.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The section will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogSection(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Convert link to independent tile/space */}
                        {convertLinkDialog && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !convertingLinkToTile && setConvertLinkDialog(null)}>
                                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Convert to independent tile</h3>
                                        <button
                                            type="button"
                                            onClick={() => !convertingLinkToTile && setConvertLinkDialog(null)}
                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            title="Close"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                            </svg>
                                        </button>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                        Create a dashboard tile from <span className="font-semibold text-slate-800 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: convertLinkDialog.link.label || 'this link' }} />. The original link stays in this space.
                                    </p>
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            disabled={convertingLinkToTile}
                                            onClick={() => void handleConvertLinkToIndependentTile(false)}
                                            className="w-full text-left rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/30 hover:border-sky-400 px-4 py-3 transition-colors disabled:opacity-50"
                                        >
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white">📁 Space</div>
                                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">New space with this URL in a General section — you can add more links later</div>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={convertingLinkToTile}
                                            onClick={() => void handleConvertLinkToIndependentTile(true)}
                                            className="w-full text-left rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 hover:border-indigo-400 px-4 py-3 transition-colors disabled:opacity-50"
                                        >
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white">🔗 Hyperlink tile</div>
                                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Direct click-through to this URL from the dashboard</div>
                                        </button>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            type="button"
                                            disabled={convertingLinkToTile}
                                            onClick={() => setConvertLinkDialog(null)}
                                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                                        >
                                            {convertingLinkToTile ? 'Creating…' : 'Cancel'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Convert tab or section to its own space */}
                        {convertTabSectionDialog && (() => {
                            const isTab = convertTabSectionDialog.kind === 'tab';
                            const dialogTab = editTabs.find((t) => t.id === convertTabSectionDialog.tabId);
                            const dialogSection = !isTab && dialogTab
                                ? dialogTab.sections.find((s) => s.id === convertTabSectionDialog.sectionId)
                                : null;
                            const sourceName = isTab
                                ? (dialogTab?.title || 'Untitled tab')
                                : (dialogSection?.title || 'Untitled section');
                            const moveDisabled = isTab && editTabs.length <= 1;

                            return (
                                <div
                                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                                    onClick={() => !convertingTabSectionToSpace && setConvertTabSectionDialog(null)}
                                >
                                    <div
                                        className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                                {isTab ? 'Convert tab to space' : 'Convert section to space'}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() => !convertingTabSectionToSpace && setConvertTabSectionDialog(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                            Create a dashboard space from{' '}
                                            <span className="font-semibold text-slate-800 dark:text-slate-200">{sourceName}</span>.
                                            Choose whether to keep or remove the original in this space.
                                        </p>
                                        <div className="space-y-2">
                                            <button
                                                type="button"
                                                disabled={convertingTabSectionToSpace}
                                                onClick={() => void handleConvertTabOrSectionToSpace('copy')}
                                                className="w-full text-left rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/30 hover:border-sky-400 px-4 py-3 transition-colors disabled:opacity-50"
                                            >
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">Copy into new space</div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                                    New space on the dashboard — original {isTab ? 'tab' : 'section'} stays here
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={convertingTabSectionToSpace || moveDisabled}
                                                onClick={() => void handleConvertTabOrSectionToSpace('move')}
                                                className="w-full text-left rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 hover:border-amber-400 px-4 py-3 transition-colors disabled:opacity-50"
                                                title={moveDisabled ? 'Cannot move the last tab — a space must keep at least one tab' : undefined}
                                            >
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">Move into new space</div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                                    {moveDisabled
                                                        ? 'Unavailable — this is the only tab in this space'
                                                        : `New space on the dashboard — remove original ${isTab ? 'tab' : 'section'} from here`}
                                                </div>
                                            </button>
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                            <button
                                                type="button"
                                                disabled={convertingTabSectionToSpace}
                                                onClick={() => setConvertTabSectionDialog(null)}
                                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                                            >
                                                {convertingTabSectionToSpace ? 'Creating…' : 'Cancel'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Link Scheduling Dialog */}
                        {schedulingDialogLink && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogLink.tabId);
                            const section = tab?.sections.find(s => s.id === schedulingDialogLink.sectionId);
                            const link = section?.links.find(l => l.id === schedulingDialogLink.linkId);
                            if (!link) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogLink(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Link: <span dangerouslySetInnerHTML={{ __html: link.label || '' }} /></h3>
                                            <button
                                                onClick={() => setSchedulingDialogLink(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={link.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, e.target.value, link.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Link becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={link.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, link.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Link expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration-link"
                                                    checked={!link.visibleFrom && !link.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration-link" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(link.visibleFrom || link.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The link will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogLink(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Rich Text Scheduling Dialog */}
                        {schedulingDialogRichText && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogRichText.tabId);
                            const section = tab?.sections.find(s => s.id === schedulingDialogRichText.sectionId);
                            const richText = section?.richTextContent?.find(r => r.id === schedulingDialogRichText.richTextId);
                            if (!richText) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogRichText(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Rich Text Content</h3>
                                            <button
                                                onClick={() => setSchedulingDialogRichText(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={richText.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, e.target.value, richText.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Content becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={richText.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, richText.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Content expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration-richtext"
                                                    checked={!richText.visibleFrom && !richText.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration-richtext" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(richText.visibleFrom || richText.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The content will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogRichText(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                </div>

                {/* Notes Preset Form Dialog */}
                {notesPresetFormState && (
                    <>
                        {typeof document !== 'undefined' && createPortal(
                            <div
                                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
                            >
                                <div
                                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-3xl w-full max-h-[90vh] flex flex-col my-8"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Dialog Header */}
                                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notes Preset Form</h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Fill in the fields below (all optional)</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setNotesPresetFormState(null);
                                                setNotesPresetForm({
                                                    ownerInfo: '',
                                                    supportTeamInfo: '',
                                                    serviceNowGroupInfo: '',
                                                    businessOwner: '',
                                                    productOwner: '',
                                                    architect: '',
                                                    vendorDetails: '',
                                                    serviceNowDemand: '',
                                                    serviceNowProject: '',
                                                    serviceNowTask: '',
                                                    goLiveInfo: '',
                                                    majorUpgradeInfo: '',
                                                    serviceDeliveryManager: '',
                                                    businessRelationshipManager: '',
                                                    technologyRelationshipManager: ''
                                                });
                                            }}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Dialog Content - Scrollable Form */}
                                    <div className="px-6 py-4 flex-1 overflow-y-auto">
                                        <div className="space-y-4">
                                            {/* Owner Information */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Owner Information</label>
                                                <input
                                                    type="text"
                                                    value={notesPresetForm.ownerInfo}
                                                    onChange={(e) => setNotesPresetForm(prev => ({ ...prev, ownerInfo: e.target.value }))}
                                                    placeholder="Enter owner information..."
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                />
                                            </div>

                                            {/* Support Team Information */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Support Team Information</label>
                                                <input
                                                    type="text"
                                                    value={notesPresetForm.supportTeamInfo}
                                                    onChange={(e) => setNotesPresetForm(prev => ({ ...prev, supportTeamInfo: e.target.value }))}
                                                    placeholder="Enter support team information..."
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                />
                                            </div>

                                            {/* Service Now Group Information */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Service Now Group Information</label>
                                                <input
                                                    type="text"
                                                    value={notesPresetForm.serviceNowGroupInfo}
                                                    onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowGroupInfo: e.target.value }))}
                                                    placeholder="Enter Service Now group information..."
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                />
                                            </div>

                                            {/* Contact Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Contact Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Owner</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.businessOwner}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, businessOwner: e.target.value }))}
                                                            placeholder="Business owner details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Product Owner</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.productOwner}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, productOwner: e.target.value }))}
                                                            placeholder="Product owner details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Architect</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.architect}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, architect: e.target.value }))}
                                                            placeholder="Architect details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Vendor Details</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.vendorDetails}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, vendorDetails: e.target.value }))}
                                                            placeholder="Vendor details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Service Now Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Service Now Ticket Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Demand Ticket</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceNowDemand}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowDemand: e.target.value }))}
                                                            placeholder="Service Now demand ticket..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Project Ticket</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceNowProject}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowProject: e.target.value }))}
                                                            placeholder="Service Now project ticket..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Task Ticket</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceNowTask}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowTask: e.target.value }))}
                                                            placeholder="Service Now task ticket..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Project Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Project Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Go-Live Information</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.goLiveInfo}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, goLiveInfo: e.target.value }))}
                                                            placeholder="Go-live date and details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Major Upgrade Information</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.majorUpgradeInfo}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, majorUpgradeInfo: e.target.value }))}
                                                            placeholder="Major upgrade information..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Manager Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Manager Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Service Delivery Manager</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceDeliveryManager}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceDeliveryManager: e.target.value }))}
                                                            placeholder="Service Delivery Manager details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Relationship Manager</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.businessRelationshipManager}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, businessRelationshipManager: e.target.value }))}
                                                            placeholder="Business Relationship Manager details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Technology Relationship Manager</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.technologyRelationshipManager}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, technologyRelationshipManager: e.target.value }))}
                                                            placeholder="Technology Relationship Manager details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dialog Footer */}
                                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
                                        <button
                                            onClick={() => {
                                                setNotesPresetFormState(null);
                                                setNotesPresetForm({
                                                    ownerInfo: '',
                                                    supportTeamInfo: '',
                                                    serviceNowGroupInfo: '',
                                                    businessOwner: '',
                                                    productOwner: '',
                                                    architect: '',
                                                    vendorDetails: '',
                                                    serviceNowDemand: '',
                                                    serviceNowProject: '',
                                                    serviceNowTask: '',
                                                    goLiveInfo: '',
                                                    majorUpgradeInfo: '',
                                                    serviceDeliveryManager: '',
                                                    businessRelationshipManager: '',
                                                    technologyRelationshipManager: ''
                                                });
                                            }}
                                            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Fill form with demo data
                                                setNotesPresetForm({
                                                    ownerInfo: 'IT Operations Team - John Smith (john.smith@company.com)',
                                                    supportTeamInfo: 'Level 1 Support - support@company.com | Level 2 Support - l2support@company.com',
                                                    serviceNowGroupInfo: 'IT Operations Group (it-ops-group@company.com)',
                                                    businessOwner: 'Sarah Johnson - Director of IT Operations (sarah.johnson@company.com, ext. 1234)',
                                                    productOwner: 'Michael Chen - Senior Product Manager (michael.chen@company.com, ext. 5678)',
                                                    architect: 'David Williams - Solutions Architect (david.williams@company.com, ext. 9012)',
                                                    vendorDetails: 'TechCorp Solutions - Vendor Contact: vendor@techcorp.com | Support: support@techcorp.com | Phone: +1-555-0100',
                                                    serviceNowDemand: 'DEM-2024-001234',
                                                    serviceNowProject: 'PROJ-2024-005678',
                                                    serviceNowTask: 'TASK-2024-009012',
                                                    goLiveInfo: 'Planned Go-Live: Q2 2024 | Target Date: June 15, 2024 | Status: On Track',
                                                    majorUpgradeInfo: 'Next Major Upgrade: Version 3.0 | Scheduled: Q3 2024 | Upgrade Window: September 2024',
                                                    serviceDeliveryManager: 'Emily Davis - SDM (emily.davis@company.com, ext. 3456)',
                                                    businessRelationshipManager: 'Robert Martinez - BRM (robert.martinez@company.com, ext. 7890)',
                                                    technologyRelationshipManager: 'Jennifer Lee - TRM (jennifer.lee@company.com, ext. 2468)'
                                                });
                                            }}
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Demo Fill
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Format the notes with proper headings
                                                const sections: string[] = [];

                                                if (notesPresetForm.ownerInfo) sections.push(`Owner Information:\n${notesPresetForm.ownerInfo}`);
                                                if (notesPresetForm.supportTeamInfo) sections.push(`Support Team Information:\n${notesPresetForm.supportTeamInfo}`);
                                                if (notesPresetForm.serviceNowGroupInfo) sections.push(`Service Now Group Information:\n${notesPresetForm.serviceNowGroupInfo}`);

                                                const contacts: string[] = [];
                                                if (notesPresetForm.businessOwner) contacts.push(`Business Owner: ${notesPresetForm.businessOwner}`);
                                                if (notesPresetForm.productOwner) contacts.push(`Product Owner: ${notesPresetForm.productOwner}`);
                                                if (notesPresetForm.architect) contacts.push(`Architect: ${notesPresetForm.architect}`);
                                                if (notesPresetForm.vendorDetails) contacts.push(`Vendor Details: ${notesPresetForm.vendorDetails}`);
                                                if (contacts.length > 0) sections.push(`Contact Information:\n${contacts.join('\n')}`);

                                                const tickets: string[] = [];
                                                if (notesPresetForm.serviceNowDemand) tickets.push(`Demand: ${notesPresetForm.serviceNowDemand}`);
                                                if (notesPresetForm.serviceNowProject) tickets.push(`Project: ${notesPresetForm.serviceNowProject}`);
                                                if (notesPresetForm.serviceNowTask) tickets.push(`Task: ${notesPresetForm.serviceNowTask}`);
                                                if (tickets.length > 0) sections.push(`Service Now Ticket Information:\n${tickets.join('\n')}`);

                                                if (notesPresetForm.goLiveInfo) sections.push(`Go-Live Information:\n${notesPresetForm.goLiveInfo}`);
                                                if (notesPresetForm.majorUpgradeInfo) sections.push(`Major Upgrade Information:\n${notesPresetForm.majorUpgradeInfo}`);

                                                const managers: string[] = [];
                                                if (notesPresetForm.serviceDeliveryManager) managers.push(`Service Delivery Manager: ${notesPresetForm.serviceDeliveryManager}`);
                                                if (notesPresetForm.businessRelationshipManager) managers.push(`Business Relationship Manager: ${notesPresetForm.businessRelationshipManager}`);
                                                if (notesPresetForm.technologyRelationshipManager) managers.push(`Technology Relationship Manager: ${notesPresetForm.technologyRelationshipManager}`);
                                                if (managers.length > 0) sections.push(`Manager Information:\n${managers.join('\n')}`);

                                                const formattedNotes = sections.join('\n\n');
                                                const additionHtml = plainNotesToHtml(formattedNotes);

                                                // Update the notes field for this link
                                                if (notesPresetFormState.linkId) {
                                                    const currentNotes = editLinkState[notesPresetFormState.linkId]?.notes || '';
                                                    const currentHtml = looksLikeHtml(currentNotes)
                                                        ? currentNotes
                                                        : plainNotesToHtml(currentNotes);
                                                    const combinedNotes = hasVisibleRichText(currentNotes)
                                                        ? `${currentHtml}${additionHtml}`
                                                        : additionHtml;
                                                    updateEditLinkState(notesPresetFormState.linkId, 'notes', combinedNotes);
                                                    updateEditLinkState(notesPresetFormState.linkId, 'notesEnabled', true);
                                                }

                                                // Reset form and close dialog
                                                setNotesPresetFormState(null);
                                                setNotesPresetForm({
                                                    ownerInfo: '',
                                                    supportTeamInfo: '',
                                                    serviceNowGroupInfo: '',
                                                    businessOwner: '',
                                                    productOwner: '',
                                                    architect: '',
                                                    vendorDetails: '',
                                                    serviceNowDemand: '',
                                                    serviceNowProject: '',
                                                    serviceNowTask: '',
                                                    goLiveInfo: '',
                                                    majorUpgradeInfo: '',
                                                    serviceDeliveryManager: '',
                                                    businessRelationshipManager: '',
                                                    technologyRelationshipManager: ''
                                                });
                                            }}
                                            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Add to Notes
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </>
                )}

                {/* Version Diff Viewer */}
                {diffViewerOpen && diffOriginalTile && diffModifiedTile && (
                    <VersionDiffViewer
                        originalData={diffOriginalTile}
                        modifiedData={diffModifiedTile}
                        originalTitle={restorePreviewVersion ? `Current State` : `Version ${diffOriginalVersionMeta?.versionNumber || 'N/A'}`}
                        modifiedTitle={restorePreviewVersion ? `Version ${diffModifiedVersionMeta?.versionNumber || 'N/A'}` : `Current State`}
                        onClose={() => {
                            setDiffViewerOpen(false);
                            setDiffOriginalVersionMeta(null);
                            setDiffModifiedVersionMeta(null);
                            setRestorePreviewVersion(null);
                        }}
                        originalVersionMeta={restorePreviewVersion ? diffModifiedVersionMeta || undefined : diffOriginalVersionMeta || undefined}
                        modifiedVersionMeta={restorePreviewVersion ? diffOriginalVersionMeta || undefined : diffModifiedVersionMeta || undefined}
                        isRestorePreview={!!restorePreviewVersion}
                        onConfirmRestore={restorePreviewVersion ? handleConfirmRestore : undefined}
                    />
                )}
            </>
        );
    }


    // Fallback: if somehow in edit mode without permission, return view mode
    // (useEffect will handle resetting isEditing state)
    return null;
};


