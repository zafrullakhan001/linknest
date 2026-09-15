import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { Monitor, MonitorSuggestion, monitoringService } from '../services/monitoringService';
import { EmailNotificationsTab } from './EmailNotificationsTab';
import { EmailLogsTab } from './EmailLogsTab';
import { useAuth } from '../contexts/AuthContext';
import { authService, UserListItem } from '../services/authService';
import { useSettings } from '../contexts/SettingsContext';
import { MONITOR_TYPE_LABELS, parseMonitorInputHint } from '../utils/monitorSuggestHeuristics';
import {
    clampMonitorIntervalMinutes,
    enrichMonitorConfigWithTiming,
    getMonitorSuggestTimingDefaults,
    sslDaysToMinutes,
    sslMinutesToDays,
} from '../utils/monitorSuggestTiming';
import { MonitorQuickToggles, MonitorTogglePill } from './MonitorTogglePill';
import { LinkUrlField } from './LinkUrlField';
import { SSL_CERTS_TAB, isSslCertsTab } from '../utils/monitorSsl';
import { MonitorBulkSpaceSearch } from './MonitorBulkSpaceSearch';

/** App applies `html { zoom }`; dialog geometry must use layout coords (Task Scheduler / float-panel fix). */
function getCssZoom(): number {
    const raw = getComputedStyle(document.documentElement).zoom;
    const z = raw && raw !== 'normal' ? Number.parseFloat(raw) : 1;
    return Number.isFinite(z) && z > 0 ? z : 1;
}

function getLayoutViewport() {
    const vv = window.visualViewport;
    const zoom = getCssZoom();
    return {
        width: (vv?.width ?? window.innerWidth) / zoom,
        height: (vv?.height ?? window.innerHeight) / zoom,
    };
}

const VIEWPORT_EDGE_PAD = 48;

function clampModalPos(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const { width: vw, height: vh } = getLayoutViewport();
    return {
        x: Math.min(vw - VIEWPORT_EDGE_PAD, Math.max(VIEWPORT_EDGE_PAD - width, x)),
        y: Math.min(vh - VIEWPORT_EDGE_PAD, Math.max(8, y)),
    };
}

interface MonitorFormProps {
    monitor?: Monitor;
    onSave: (monitor: Partial<Monitor>, opts?: { close?: boolean }) => Promise<void>;
    onCancel: () => void;
    isAddingNew?: boolean; // Track if we're adding a new monitor (even after creation)
    createdMonitorId?: number; // ID of newly created monitor for tabs
    initialType?: Monitor['type'];
    initialTab?: string;
}

interface MonitorPreset {
    name: string;
    description: string;
    type: Monitor['type'];
    target: string;
    port?: number;
    keyword?: string;
    interval: number;
    tab_name?: string;
    group_name?: string;
}

const MONITOR_PRESETS: MonitorPreset[] = [
    {
        name: 'Web Server (HTTP)',
        description: 'Monitor a standard HTTP website',
        type: 'url',
        target: 'http://example.com',
        interval: 5,
        group_name: 'Web Servers'
    },
    {
        name: 'Web Server (HTTPS)',
        description: 'Monitor a secure HTTPS website',
        type: 'url',
        target: 'https://example.com',
        interval: 5,
        group_name: 'Web Servers'
    },
    {
        name: 'API Endpoint',
        description: 'Monitor a REST API endpoint',
        type: 'url',
        target: 'https://api.example.com/health',
        interval: 5,
        group_name: 'APIs'
    },
    {
        name: 'SSH Server',
        description: 'Check if SSH port is open',
        type: 'port',
        target: 'server.example.com',
        port: 22,
        interval: 10,
        group_name: 'Servers'
    },
    {
        name: 'MySQL Database',
        description: 'Check MySQL database port',
        type: 'port',
        target: 'db.example.com',
        port: 3306,
        interval: 5,
        group_name: 'Databases'
    },
    {
        name: 'PostgreSQL Database',
        description: 'Check PostgreSQL database port',
        type: 'port',
        target: 'db.example.com',
        port: 5432,
        interval: 5,
        group_name: 'Databases'
    },
    {
        name: 'Redis Cache',
        description: 'Check Redis cache server',
        type: 'port',
        target: 'cache.example.com',
        port: 6379,
        interval: 5,
        group_name: 'Databases'
    },
    {
        name: 'MongoDB',
        description: 'Check MongoDB database port',
        type: 'port',
        target: 'mongo.example.com',
        port: 27017,
        interval: 5,
        group_name: 'Databases'
    },
    {
        name: 'SMTP Server',
        description: 'Check email SMTP server',
        type: 'port',
        target: 'mail.example.com',
        port: 25,
        interval: 10,
        group_name: 'Email Servers'
    },
    {
        name: 'IMAP Server',
        description: 'Check email IMAP server',
        type: 'port',
        target: 'mail.example.com',
        port: 143,
        interval: 10,
        group_name: 'Email Servers'
    },
    {
        name: 'HTTP Headers (curl -I)',
        description: 'Up/down from HTTP headers without downloading the page',
        type: 'headers',
        target: 'https://example.com',
        interval: 5,
        group_name: 'Web Servers'
    },
    {
        name: 'Keyword Check',
        description: 'Verify specific text appears on page',
        type: 'keyword',
        target: 'https://example.com',
        keyword: 'Welcome',
        interval: 5,
        group_name: 'Web Servers'
    }
];

const FieldHelp: React.FC<{ text: string }> = ({ text }) => (
    <p className="text-xs text-gray-600 mt-1">{text}</p>
);

const SettingsSection: React.FC<{
    emoji: string;
    title: string;
    subtitle?: string;
    tone?: 'sky' | 'cyan' | 'amber' | 'violet' | 'indigo' | 'purple' | 'emerald';
    children: React.ReactNode;
}> = ({ emoji, title, subtitle, tone = 'sky', children }) => {
    const shell: Record<string, string> = {
        sky: 'bg-sky-50/90 border-sky-100',
        cyan: 'bg-cyan-50/90 border-cyan-100',
        amber: 'bg-amber-50/90 border-amber-100',
        violet: 'bg-violet-50/90 border-violet-100',
        indigo: 'bg-indigo-50/90 border-indigo-100',
        purple: 'bg-purple-50/90 border-purple-100',
        emerald: 'bg-emerald-50/90 border-emerald-100',
    };
    const titleColor: Record<string, string> = {
        sky: 'text-sky-900',
        cyan: 'text-cyan-900',
        amber: 'text-amber-900',
        violet: 'text-violet-900',
        indigo: 'text-indigo-900',
        purple: 'text-purple-900',
        emerald: 'text-emerald-900',
    };
    return (
        <section className={`rounded-xl border p-4 space-y-4 shadow-sm ${shell[tone]}`}>
            <div className="flex items-start gap-2.5 pb-2 border-b border-black/[0.06]">
                <span className="text-xl leading-none select-none" aria-hidden="true">
                    {emoji}
                </span>
                <div>
                    <h3 className={`text-sm font-semibold tracking-wide ${titleColor[tone]}`}>{title}</h3>
                    {subtitle ? <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p> : null}
                </div>
            </div>
            {children}
        </section>
    );
};

const MONITOR_INPUT_CLASS =
    'w-full bg-white/90 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors';

export const MonitorForm: React.FC<MonitorFormProps> = ({ monitor, onSave, onCancel, isAddingNew = false, createdMonitorId, initialType, initialTab }) => {
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const { settings } = useSettings();
    const appName = settings?.app_name || 'LinkNest';

    const [name, setName] = useState(monitor?.name || '');
    const [type, setType] = useState<Monitor['type']>(monitor?.type || initialType || 'url');
    const [target, setTarget] = useState(monitor?.target || '');
    const [port, setPort] = useState(monitor?.port?.toString() || '');
    const [keyword, setKeyword] = useState(monitor?.keyword || ((monitor?.type || initialType) === 'ssl' ? '30' : ''));
    const [interval, setInterval] = useState(
        monitor?.interval?.toString()
        || ((monitor?.type || initialType) === 'ssl' ? String(getMonitorSuggestTimingDefaults('ssl').interval) : '5')
    );
    const [warningThreshold, setWarningThreshold] = useState((monitor?.warning_threshold ?? 1).toString());
    const [timeoutSec, setTimeoutSec] = useState(monitor?.timeout !== null && monitor?.timeout !== undefined ? String(monitor?.timeout) : '');
    const [tabName, setTabName] = useState(
        (monitor?.type || initialType) === 'ssl'
            ? SSL_CERTS_TAB
            : (monitor?.tab_name || initialTab || '')
    );
    const [groupName, setGroupName] = useState(monitor?.group_name || '');
    const [emailNotification, setEmailNotification] = useState(!!monitor?.email_notification);
    const [legacyEmailTo, setLegacyEmailTo] = useState(monitor?.legacy_email_to || '');
    const [legacyEmailCc, setLegacyEmailCc] = useState(monitor?.legacy_email_cc || '');
    const [legacyEmailFromName, setLegacyEmailFromName] = useState(monitor?.legacy_email_from_name || '');
    const [legacyEmailFromEmail, setLegacyEmailFromEmail] = useState(monitor?.legacy_email_from_email || '');
    const [legacyEmailDisabled, setLegacyEmailDisabled] = useState((monitor?.legacy_email_disabled ?? 0) === 1);
    const [legacyEmailSubjectTemplate, setLegacyEmailSubjectTemplate] = useState(
        monitor?.legacy_email_subject_template || `[{app_name} Monitor] {monitor_name} - {status}`
    );
    const [legacyEmailBodyTemplate, setLegacyEmailBodyTemplate] = useState(
        monitor?.legacy_email_body_template ||
        "{status}: {monitor_name}\nTarget: {monitor_target}\nDetails: {details}\nResponse: {response_time}\nTime: {time}\n"
    );
    const [showLegacyEmailAdvanced, setShowLegacyEmailAdvanced] = useState<boolean>(false);
    const [isActive, setIsActive] = useState(monitor?.is_active !== undefined ? !!monitor?.is_active : true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPresets, setShowPresets] = useState(!monitor && name === '');
    const [analyzeInput, setAnalyzeInput] = useState('');
    const [suggestions, setSuggestions] = useState<MonitorSuggestion[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [showSmartSetup, setShowSmartSetup] = useState(!monitor?.id && isAddingNew);
    const [activeTab, setActiveTab] = useState<'settings' | 'notifications' | 'logs'>('settings');
    const [pendingSubmitAfterTabSwitch, setPendingSubmitAfterTabSwitch] = useState(false);
    const [waitingForMonitorId, setWaitingForMonitorId] = useState(false);
    const monitorFormRef = useRef<HTMLFormElement>(null);

    // Permissions (admin only)
    const [usersList, setUsersList] = useState<UserListItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [allowedUsers, setAllowedUsers] = useState<number[]>(monitor?.allowed_user_ids || []);
    const [showUserSelector, setShowUserSelector] = useState(false);

    // Draggable state — zoom-aware pointer delta (same as Task Scheduler float panels)
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const posRef = useRef({ x: 0, y: 0 });
    const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const isInitialized = useRef(false);

    // Center using layout coords (not getBoundingClientRect / zoom)
    useLayoutEffect(() => {
        if (isInitialized.current || !modalRef.current) return;
        const el = modalRef.current;
        const { width: vw, height: vh } = getLayoutViewport();
        const w = el.offsetWidth || Math.min(672, vw - 40);
        const h = el.offsetHeight || Math.min(vh * 0.9, vh - 40);
        const next = clampModalPos((vw - w) / 2, (vh - h) / 2, w, h);
        posRef.current = next;
        setPosition(next);
        isInitialized.current = true;
    }, []);

    useEffect(() => {
        const reclamp = () => {
            const el = modalRef.current;
            if (!el || !isInitialized.current) return;
            const next = clampModalPos(posRef.current.x, posRef.current.y, el.offsetWidth, el.offsetHeight);
            posRef.current = next;
            setPosition(next);
        };
        window.addEventListener('resize', reclamp);
        window.visualViewport?.addEventListener('resize', reclamp);
        return () => {
            window.removeEventListener('resize', reclamp);
            window.visualViewport?.removeEventListener('resize', reclamp);
        };
    }, []);

    // Close on ESC
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onCancel]);

    // If user clicks "Update Monitor" from another tab, switch to Settings and submit.
    useEffect(() => {
        if (!pendingSubmitAfterTabSwitch) return;
        if (activeTab !== 'settings') return;
        // Wait a tick so the form is mounted.
        const t = window.setTimeout(() => {
            const form = monitorFormRef.current || (document.getElementById('monitor-form') as HTMLFormElement | null);
            if (form) {
                form.requestSubmit();
            }
            setPendingSubmitAfterTabSwitch(false);
        }, 0);
        return () => window.clearTimeout(t);
    }, [pendingSubmitAfterTabSwitch, activeTab]);

    // Watch for monitor ID changes after creation
    useEffect(() => {
        if (waitingForMonitorId && createdMonitorId) {
            setWaitingForMonitorId(false);
            // Monitor was created, we can now use the notifications tab
        }
    }, [createdMonitorId, waitingForMonitorId]);

    // Load user list (admin only, for monitor visibility assignments)
    useEffect(() => {
        if (!isAdmin) return;
        const loadUsers = async () => {
            try {
                setLoadingUsers(true);
                const users = await authService.getUsers();
                setUsersList(users);
            } catch (e) {
                // Non-fatal; permissions UI can still work without labels
                console.error('Failed to load users list for monitor permissions', e);
            } finally {
                setLoadingUsers(false);
            }
        };
        loadUsers();
    }, [isAdmin]);

    const beginDragFromPointer = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
        e.preventDefault();
        e.stopPropagation();

        dragCleanupRef.current?.();
        dragCleanupRef.current = null;

        // Use stored layout pos — not rect/zoom (that double-applies html { zoom } and jumps on pointerdown)
        const current = posRef.current;
        dragStartRef.current = { x: e.clientX, y: e.clientY, posX: current.x, posY: current.y };
        setIsDragging(true);
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
            const el = modalRef.current;
            const w = el?.offsetWidth || 672;
            const h = el?.offsetHeight || 400;
            const next = clampModalPos(
                start.posX + (ev.clientX - start.x) / z,
                start.posY + (ev.clientY - start.y) / z,
                w,
                h,
            );
            posRef.current = next;
            setPosition(next);
        };
        const onUp = () => {
            dragCleanupRef.current?.();
            dragCleanupRef.current = null;
            dragStartRef.current = null;
            setIsDragging(false);
        };

        window.addEventListener('pointermove', onMove, { capture: true, passive: false });
        window.addEventListener('pointerup', onUp, { capture: true });
        window.addEventListener('pointercancel', onUp, { capture: true });
        dragCleanupRef.current = () => {
            window.removeEventListener('pointermove', onMove, { capture: true });
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onUp, { capture: true });
        };
    }, []);

    useEffect(() => () => {
        dragCleanupRef.current?.();
    }, []);

    const applyPreset = (preset: MonitorPreset) => {
        setName(preset.name);
        setType(preset.type);
        setTarget(preset.target);
        if (preset.port) setPort(preset.port.toString());
        if (preset.keyword) setKeyword(preset.keyword);
        setInterval(preset.interval.toString());
        if (preset.tab_name) setTabName(preset.tab_name);
        if (preset.group_name) setGroupName(preset.group_name);
        setShowPresets(false);
    };

    const applySuggestion = (suggestion: MonitorSuggestion) => {
        const cfg = suggestion.config;
        const timing = enrichMonitorConfigWithTiming(suggestion.type, cfg);
        if (suggestion.suggested_name) setName(suggestion.suggested_name);
        if (suggestion.suggested_group) setGroupName(suggestion.suggested_group);
        setType(suggestion.type);
        if (cfg.target) setTarget(cfg.target);
        if (cfg.port !== undefined) setPort(String(cfg.port));
        else setPort('');
        if (cfg.keyword !== undefined) setKeyword(String(cfg.keyword));
        else if (suggestion.type !== 'ssl' && suggestion.type !== 'dns') setKeyword('');
        setInterval(String(timing.interval));
        if (timing.timeout != null) setTimeoutSec(String(timing.timeout));
        else setTimeoutSec('');
        setWarningThreshold(String(timing.warning_threshold));
        setTabName(suggestion.type === 'ssl' ? SSL_CERTS_TAB : (tabName && !isSslCertsTab(tabName) ? tabName : (initialTab || 'General')));
        setShowSmartSetup(false);
        setShowPresets(false);
        setAnalyzeError(null);
    };

    const handleAnalyzeTarget = async (raw?: string) => {
        const trimmed = (typeof raw === 'string' ? raw : analyzeInput).trim();
        if (!trimmed) {
            setAnalyzeError('Enter a URL or server address to analyze');
            return;
        }
        if (typeof raw === 'string') {
            setAnalyzeInput(raw);
        }
        setIsAnalyzing(true);
        setAnalyzeError(null);
        setSuggestions([]);
        try {
            const result = await monitoringService.suggestMonitor(trimmed);
            setSuggestions(result.suggestions || []);
            if (!result.suggestions?.length) {
                setAnalyzeError('No monitoring suggestions could be generated for this target.');
            }
        } catch (err: any) {
            setAnalyzeError(err.message || 'Failed to analyze target');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const inputHint = useMemo(() => parseMonitorInputHint(analyzeInput), [analyzeInput]);

    const getTypeHelpText = (monitorType: Monitor['type']): string => {
        switch (monitorType) {
            case 'url':
                return 'Checks if a website or API endpoint is accessible via HTTP/HTTPS request (follows redirects)';
            case 'headers':
                return 'curl -I style check: reads HTTP response headers only, does not download the page or follow redirects. Optional header text match.';
            case 'keyword':
                return 'Checks if a specific text/keyword appears in the webpage content';
            case 'port':
                return 'Checks if a network port on a server is open and accepting connections';
            case 'ping':
                return 'Checks if the host/IP responds to ping';
            case 'ssl':
                return 'Monitors HTTPS certificate expiry and alerts before it expires';
            case 'dns':
                return 'Verifies that a hostname resolves via DNS (optionally matches an expected IP)';
            case 'json':
                return 'Validates a JSON API health response (e.g. status:ok)';
            default:
                return '';
        }
    };

    const isHostTargetType = type === 'port' || type === 'ping' || type === 'dns' || type === 'ssl';

    const emptyToNull = (value: string): string | null => {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    };

    const saveMonitor = async (opts?: { close?: boolean }): Promise<boolean> => {
        if (isSubmitting) return false;

        setIsSubmitting(true);
        setError(null);

        try {
            if (!name.trim()) {
                setError('Monitor name is required');
                return false;
            }
            if (!target.trim()) {
                setError('Target is required');
                return false;
            }
            if (type === 'port' && (!port || isNaN(parseInt(port)))) {
                setError('Port number is required for port checks');
                return false;
            }
            if (type === 'keyword' && !keyword.trim()) {
                setError('Keyword is required for keyword checks');
                return false;
            }
            if (type === 'json' && !keyword.trim()) {
                setError('JSON check expression is required (e.g. status:ok)');
                return false;
            }
            if (type === 'ssl' && keyword.trim() !== '' && (isNaN(parseInt(keyword)) || parseInt(keyword) < 1 || parseInt(keyword) > 365)) {
                setError('SSL warning days must be between 1 and 365');
                return false;
            }

            const wt = type === 'ssl' ? 1 : Math.max(1, Math.min(20, parseInt(warningThreshold || '1')));
            const timeoutVal = timeoutSec.trim() === '' ? undefined : Math.max(1, Math.min(60, parseInt(timeoutSec)));
            const intervalParsed = clampMonitorIntervalMinutes(type, parseInt(interval, 10) || 0);
            if (intervalParsed.error) {
                setError(intervalParsed.error);
                return false;
            }

            const keepOpen = opts?.close === false || !!(isAddingNew && createdMonitorId && opts?.close !== true);
            await onSave({
                name: name.trim(),
                type,
                target: target.trim(),
                port: port ? parseInt(port) : undefined,
                keyword: keyword.trim() || undefined,
                interval: intervalParsed.value,
                warning_threshold: wt,
                timeout: timeoutVal,
                allowed_user_ids: isAdmin ? allowedUsers : undefined,
                tab_name: type === 'ssl' ? SSL_CERTS_TAB : (tabName.trim() || undefined),
                group_name: groupName.trim() || null,
                email_notification: emailNotification ? 1 : 0,
                is_active: isActive ? 1 : 0,
                legacy_email_disabled: legacyEmailDisabled ? 1 : 0,
                legacy_email_to: emptyToNull(legacyEmailTo),
                legacy_email_cc: emptyToNull(legacyEmailCc),
                legacy_email_from_name: emptyToNull(legacyEmailFromName),
                legacy_email_from_email: emptyToNull(legacyEmailFromEmail),
                legacy_email_subject_template: emptyToNull(legacyEmailSubjectTemplate),
                legacy_email_body_template: legacyEmailBodyTemplate.trim() === '' ? null : legacyEmailBodyTemplate,
            }, { close: keepOpen ? false : true });
            return true;
        } catch (err: any) {
            setError(err.message || 'Failed to save monitor');
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveMonitor();
    };

    const handleFooterSaveClick = () => {
        if (isSubmitting) return;
        if (activeTab !== 'settings') {
            setPendingSubmitAfterTabSwitch(true);
            setActiveTab('settings');
            return;
        }
        void saveMonitor();
    };

    const inputClass = MONITOR_INPUT_CLASS;

    const filteredPresets = MONITOR_PRESETS.filter(p => !monitor);

    return (
        <div className="fixed inset-0 z-50" style={{ backgroundColor: 'transparent' }}>
            <div
                ref={modalRef}
                className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                style={{
                    position: 'absolute',
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    cursor: isDragging ? 'grabbing' : 'default'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Draggable Header */}
                <div
                    data-drag-handle
                    className={`px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onPointerDown={beginDragFromPointer}
                    title="Drag to move"
                >
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <span aria-hidden="true">{monitor?.id && !isAddingNew ? '✏️' : '➕'}</span>
                        {(monitor?.id && !isAddingNew) ? 'Edit Monitor' : 'Add New Monitor'}
                    </h2>
                    <div className="flex items-center gap-3">
                        <div className="text-gray-500 text-xs flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                            Drag to move
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCancel();
                            }}
                            className="text-gray-500 hover:text-gray-700 rounded-md p-1 hover:bg-gray-100 transition-colors"
                            aria-label="Close"
                            title="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 bg-gradient-to-r from-slate-50 to-white px-6">
                    <div className="flex space-x-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('settings')}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'settings'
                                ? 'border-sky-600 text-sky-700 bg-sky-50/60'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                }`}
                        >
                            <span aria-hidden="true">⚙️ </span>Settings
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                const monitorIdForTabs = (isAddingNew && createdMonitorId) ? createdMonitorId : (monitor?.id);
                                if (!monitorIdForTabs && activeTab === 'settings') {
                                    setWaitingForMonitorId(true);
                                    const saved = await saveMonitor({ close: false });
                                    if (!saved) {
                                        setWaitingForMonitorId(false);
                                        return;
                                    }
                                    setActiveTab('notifications');
                                } else if (monitorIdForTabs) {
                                    if (activeTab === 'settings') {
                                        const saved = await saveMonitor({ close: false });
                                        if (!saved) return;
                                    }
                                    setActiveTab('notifications');
                                } else {
                                    setError('Please save the monitor first before configuring notifications');
                                }
                            }}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notifications'
                                ? 'border-violet-600 text-violet-700 bg-violet-50/60'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                }`}
                        >
                            <span aria-hidden="true">📧 </span>Email Notifications
                        </button>
                        {(monitor && monitor.id || createdMonitorId) && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('logs')}
                                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'logs'
                                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                    }`}
                            >
                                <span aria-hidden="true">📋 </span>Email Logs
                            </button>
                        )}
                    </div>
                </div>

                <MonitorQuickToggles
                    isActive={isActive}
                    onIsActiveChange={setIsActive}
                    emailNotification={emailNotification}
                    onEmailNotificationChange={setEmailNotification}
                    ruleBasedOnly={legacyEmailDisabled}
                />

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-6 bg-gradient-to-b from-slate-50/40 to-white">
                    {(() => {
                        // Determine the monitor ID to use for tabs
                        const monitorIdForTabs = (isAddingNew && createdMonitorId) ? createdMonitorId : (monitor?.id);
                        
                        if (activeTab === 'notifications' && monitorIdForTabs) {
                            return <EmailNotificationsTab monitorId={monitorIdForTabs} />;
                        } else if (activeTab === 'logs' && monitorIdForTabs) {
                            return <EmailLogsTab monitorId={monitorIdForTabs} />;
                        } else if (activeTab === 'notifications' && !monitorIdForTabs) {
                            return (
                                <div className="text-center py-8 text-gray-500">
                                    {isSubmitting || waitingForMonitorId ? (
                                        <>
                                            <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                                            <p className="mb-2">Saving monitor...</p>
                                            <p className="text-xs">Please wait while the monitor is being created.</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="mb-2">Monitor not saved yet</p>
                                            <p className="text-xs">Please fill in the required fields and save the monitor first.</p>
                                        </>
                                    )}
                                </div>
                            );
                        } else {
                            return (
                        <>
                            {showSmartSetup && !monitor?.id && (
                                <div className="mb-6 p-4 bg-emerald-50/90 border border-emerald-200 rounded-xl shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                                            <span aria-hidden="true">✨</span> Smart Setup
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setShowSmartSetup(false)}
                                            className="text-gray-500 hover:text-gray-700 text-sm"
                                        >
                                            Hide
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-600 mb-3">
                                        Search a space or paste a URL — we will probe it and recommend the best monitoring method.
                                    </p>
                                    <div className="mb-3">
                                        <MonitorBulkSpaceSearch
                                            mode="monitor"
                                            accent="emerald"
                                            compact
                                            busy={isAnalyzing}
                                            selectedUrl={analyzeInput}
                                            pickActionLabel="Analyze"
                                            onPickUrl={(url) => {
                                                void handleAnalyzeTarget(url);
                                            }}
                                        />
                                    </div>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={analyzeInput}
                                            onChange={(e) => setAnalyzeInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAnalyzeTarget();
                                                }
                                            }}
                                            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm"
                                            placeholder="https://example.com, db.server.com:3306, or 192.168.1.1"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAnalyzeTarget}
                                            disabled={isAnalyzing}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
                                        >
                                            {isAnalyzing ? 'Analyzing…' : 'Analyze Target'}
                                        </button>
                                    </div>
                                    {analyzeInput.trim() && (
                                        <p className="text-xs text-emerald-700 mb-2">{inputHint.hint}</p>
                                    )}
                                    {analyzeError && (
                                        <p className="text-xs text-red-600 mb-2">{analyzeError}</p>
                                    )}
                                    {isAnalyzing && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600 py-2">
                                            <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                                            Probing target…
                                        </div>
                                    )}
                                    {suggestions.length > 0 && (
                                        <div className="space-y-2 mt-3 max-h-56 overflow-y-auto">
                                            {suggestions.map((suggestion, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`p-3 bg-white border rounded-lg flex items-start justify-between gap-3 ${
                                                        suggestion.recommended ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-gray-200'
                                                    }`}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium text-sm text-gray-800">
                                                                {MONITOR_TYPE_LABELS[suggestion.type] || suggestion.type}
                                                            </span>
                                                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                                {suggestion.confidence}% match
                                                            </span>
                                                            {suggestion.recommended && (
                                                                <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                                                                    Recommended
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-600 mt-1">{suggestion.reason}</p>
                                                        {suggestion.suggested_name && (
                                                            <p className="text-xs text-gray-500 mt-0.5">Suggested name: {suggestion.suggested_name}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => applySuggestion(suggestion)}
                                                        className="shrink-0 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                                    >
                                                        Use this
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!showSmartSetup && !monitor?.id && (
                                <div className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowSmartSetup(true)}
                                        className="text-sm text-emerald-700 hover:text-emerald-800 font-medium"
                                    >
                                        <span aria-hidden="true">✨ </span>Show Smart Setup
                                    </button>
                                </div>
                            )}

                            {showPresets && filteredPresets.length > 0 && (
                                <div className="mb-6 p-4 bg-blue-50/90 border border-blue-200 rounded-xl shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                            <span aria-hidden="true">📋</span> Quick Templates
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setShowPresets(false)}
                                            className="text-gray-500 hover:text-gray-700 text-sm"
                                        >
                                            Hide
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                        {filteredPresets.map((preset, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => applyPreset(preset)}
                                                className="text-left p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                                            >
                                                <div className="font-medium text-sm text-gray-800">{preset.name}</div>
                                                <div className="text-xs text-gray-600 mt-1">{preset.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!showPresets && filteredPresets.length > 0 && (
                                <div className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowPresets(true)}
                                        className="text-sm text-blue-700 hover:text-blue-800 font-medium"
                                    >
                                        <span aria-hidden="true">📋 </span>Show Templates
                                    </button>
                                </div>
                            )}

                            <form ref={monitorFormRef} id="monitor-form" onSubmit={handleSubmit} className="space-y-5">
                                <SettingsSection emoji="📝" title="Basic Information" subtitle="Name and check type" tone="sky">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <span aria-hidden="true">🏷️ </span>Monitor Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className={inputClass}
                                            placeholder="My Server"
                                            required
                                        />
                                        <FieldHelp text="A friendly name to identify this monitor in your dashboard (e.g., 'Production Server', 'API Endpoint')" />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <span aria-hidden="true">🔍 </span>Monitor Type <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={type}
                                            onChange={(e) => {
                                                const next = e.target.value as Monitor['type'];
                                                const prev = type;
                                                setType(next);
                                                if (next === 'ssl' && prev !== 'ssl') {
                                                    const timing = getMonitorSuggestTimingDefaults('ssl');
                                                    setInterval(String(timing.interval));
                                                    setWarningThreshold(String(timing.warning_threshold));
                                                    setTabName(SSL_CERTS_TAB);
                                                    if (!keyword.trim()) setKeyword('30');
                                                } else if (prev === 'ssl' && next !== 'ssl') {
                                                    const timing = getMonitorSuggestTimingDefaults(next);
                                                    setInterval(String(timing.interval));
                                                    setWarningThreshold(String(timing.warning_threshold));
                                                    setKeyword('');
                                                    if (isSslCertsTab(tabName)) {
                                                        setTabName(initialTab && !isSslCertsTab(initialTab) ? initialTab : 'General');
                                                    }
                                                } else if (next === 'headers' && (prev === 'keyword' || prev === 'json')) {
                                                    setKeyword('');
                                                }
                                            }}
                                            className={inputClass}
                                        >
                                            <option value="url">🌐 URL Check</option>
                                            <option value="headers">📑 HTTP Headers (curl -I)</option>
                                            <option value="keyword">🔤 Keyword Check</option>
                                            <option value="port">🔌 Port Check</option>
                                            <option value="ping">📡 Ping Check</option>
                                            <option value="ssl">🔒 SSL Certificate Check</option>
                                            <option value="dns">🌍 DNS Resolution Check</option>
                                            <option value="json">📊 JSON / API Health Check</option>
                                        </select>
                                        <FieldHelp text={getTypeHelpText(type)} />
                                    </div>
                                </SettingsSection>

                                <SettingsSection emoji="🎯" title="Target Configuration" subtitle="What to check" tone="cyan">
                                    <LinkUrlField
                                        value={target}
                                        onChange={setTarget}
                                        label={
                                            <label className="block text-sm font-medium text-gray-700">
                                                <span aria-hidden="true">{isHostTargetType ? '🖥️ ' : '🔗 '}</span>
                                                {isHostTargetType ? 'Host / IP Address' : 'URL'}{' '}
                                                <span className="text-red-500">*</span>
                                            </label>
                                        }
                                        inputClassName={inputClass}
                                        inputType={isHostTargetType ? 'text' : 'url'}
                                        required
                                        showIgnoreCheckbox={false}
                                        showCopyButton
                                        placeholder={
                                            type === 'ssl'
                                                ? 'https://example.com or example.com'
                                                : type === 'dns'
                                                    ? 'example.com'
                                                    : isHostTargetType
                                                        ? '192.168.1.1 or example.com'
                                                        : 'https://example.com'
                                        }
                                        helpText={
                                            type === 'ssl'
                                                ? 'HTTPS URL or hostname whose SSL certificate should be monitored'
                                                : type === 'dns'
                                                    ? 'Hostname to resolve via DNS (without protocol)'
                                                    : isHostTargetType
                                                        ? 'The IP address or hostname of the server to check (e.g., 192.168.1.1, server.example.com)'
                                                        : type === 'headers'
                                                            ? 'The full URL to probe with a headers-only request (like curl -I). Redirects are not followed, so SSO front doors can be checked on the first hop.'
                                                            : 'The full URL to monitor, including protocol (http:// or https://). For APIs, include the full endpoint path.'
                                        }
                                    />

                                    {type === 'port' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Port Number <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                value={port}
                                                onChange={(e) => setPort(e.target.value)}
                                                className={inputClass}
                                                placeholder="80, 443, 3306, etc."
                                                min="1"
                                                max="65535"
                                                required
                                            />
                                            <FieldHelp text="The network port number to check (common ports: 80 for HTTP, 443 for HTTPS, 22 for SSH, 3306 for MySQL)" />
                                        </div>
                                    )}

                                    {type === 'headers' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Expected header text (optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={keyword}
                                                onChange={(e) => setKeyword(e.target.value)}
                                                className={inputClass}
                                                placeholder="Location: or Server: nginx"
                                            />
                                            <FieldHelp text="Leave blank to treat any HTTP 2xx/3xx header response as up. Set text to require that string in the headers (for example Location: or a known Server value)." />
                                        </div>
                                    )}

                                    {type === 'keyword' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Keyword to Search <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={keyword}
                                                onChange={(e) => setKeyword(e.target.value)}
                                                className={inputClass}
                                                placeholder="Welcome, Success, Error"
                                                required
                                            />
                                            <FieldHelp text="The text string to search for in the webpage. Monitor will be marked as 'up' if this keyword is found, 'down' if not found." />
                                        </div>
                                    )}

                                    {type === 'json' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                JSON Check Expression <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={keyword}
                                                onChange={(e) => setKeyword(e.target.value)}
                                                className={inputClass}
                                                placeholder="status:ok or healthy"
                                                required
                                            />
                                            <FieldHelp text="Use key:value (e.g. status:ok) to match a JSON field, or a plain value to search anywhere in the response." />
                                        </div>
                                    )}

                                    {type === 'ssl' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Warn When Cert Expires Within (days)
                                            </label>
                                            <input
                                                type="number"
                                                value={keyword}
                                                onChange={(e) => setKeyword(e.target.value)}
                                                className={inputClass}
                                                placeholder="30"
                                                min="1"
                                                max="365"
                                            />
                                            <FieldHelp text="When remaining days drop to this number, the tile turns amber (WARNING). After the cert actually expires, it turns red (DOWN). Default is 30." />
                                        </div>
                                    )}

                                    {type === 'dns' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Expected IP (optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={keyword}
                                                onChange={(e) => setKeyword(e.target.value)}
                                                className={inputClass}
                                                placeholder="203.0.113.10"
                                            />
                                            <FieldHelp text="Leave blank to only verify the hostname resolves. Set an expected IP to detect DNS changes." />
                                        </div>
                                    )}

                                    {(type === 'url' || type === 'headers' || type === 'keyword' || type === 'json') && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                <span aria-hidden="true">⏱️ </span>Timeout (seconds)
                                            </label>
                                            <input
                                                type="number"
                                                value={timeoutSec}
                                                onChange={(e) => setTimeoutSec(e.target.value)}
                                                className={inputClass}
                                                placeholder={type === 'url' || type === 'headers' ? '5' : type === 'json' ? '8' : '8'}
                                                min="1"
                                                max="60"
                                            />
                                            <FieldHelp text="Maximum time to wait for the HTTP request before marking the check as failed. Leave blank to use the default." />
                                        </div>
                                    )}
                                </SettingsSection>

                                <SettingsSection emoji="⏱️" title="Monitoring Settings" subtitle={type === 'ssl' ? 'How often to check the certificate' : 'Schedule and failure sensitivity'} tone="amber">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <span aria-hidden="true">🔄 </span>
                                            {type === 'ssl' ? 'Check Interval (days)' : 'Check Interval (minutes)'}{' '}
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={type === 'ssl' ? String(sslMinutesToDays(parseInt(interval, 10) || 1440)) : interval}
                                            onChange={(e) => {
                                                if (type === 'ssl') {
                                                    const days = parseInt(e.target.value, 10);
                                                    setInterval(String(sslDaysToMinutes(Number.isFinite(days) ? days : 1)));
                                                } else {
                                                    setInterval(e.target.value);
                                                }
                                            }}
                                            min="1"
                                            max={type === 'ssl' ? '30' : '1440'}
                                            className={inputClass}
                                            required
                                        />
                                        <FieldHelp
                                            text={
                                                type === 'ssl'
                                                    ? "How often to re-check the certificate. Daily is enough for expiry monitoring. 'Check Now' / 'Force refresh' still runs immediately."
                                                    : "How often the monitor should check the target on its normal schedule (cron/worker). Lower values provide faster alerts but use more resources. Note: 'Check Now' / 'Force refresh' runs immediately and does not wait for this interval."
                                            }
                                        />
                                    </div>

                                    {type !== 'ssl' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <span aria-hidden="true">⚠️ </span>Warning Threshold (failures) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={warningThreshold}
                                            onChange={(e) => setWarningThreshold(e.target.value)}
                                            min="1"
                                            max="20"
                                            className={inputClass}
                                            required
                                        />
                                        <FieldHelp text="Number of consecutive failed checks before the monitor is considered DOWN. Failures below this threshold show as WARNING." />
                                    </div>
                                    )}
                                </SettingsSection>

                                <SettingsSection emoji="📁" title="Organization" subtitle="Optional tab and group labels" tone="violet">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                <span aria-hidden="true">📂 </span>Tab Name
                                            </label>
                                            <input
                                                type="text"
                                                value={type === 'ssl' ? SSL_CERTS_TAB : tabName}
                                                onChange={(e) => setTabName(e.target.value)}
                                                className={`${inputClass} ${type === 'ssl' ? 'bg-amber-50 text-amber-900' : ''}`}
                                                placeholder="General"
                                                readOnly={type === 'ssl'}
                                            />
                                            <FieldHelp
                                                text={
                                                    type === 'ssl'
                                                        ? 'SSL expiry checks always live on the SSL Certificates tab so they stay separate from uptime monitors.'
                                                        : "Organize monitors into tabs for easier navigation (e.g., 'Production', 'Development', 'External')"
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                <span aria-hidden="true">🗂️ </span>Group Name
                                            </label>
                                            <input
                                                type="text"
                                                value={groupName}
                                                onChange={(e) => setGroupName(e.target.value)}
                                                className={inputClass}
                                                placeholder="Servers"
                                            />
                                            <FieldHelp text="Group related monitors together within a tab (e.g., 'Web Servers', 'Database Servers', 'APIs')" />
                                        </div>
                                    </div>
                                </SettingsSection>

                                {/* Permissions Section */}
                                {isAdmin && (
                                    <SettingsSection emoji="🔒" title="Permissions" subtitle="Optional — limit who can view this monitor" tone="indigo">
                                        <div className="p-4 bg-white/70 rounded-lg border border-indigo-100">
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-indigo-900">
                                                        <span aria-hidden="true">👁️ </span>Visible to selected users
                                                    </div>
                                                    <div className="text-xs text-gray-600 mt-1">If you select users, only they (and admins) will see this monitor. If none selected, only admins will see it.</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowUserSelector(v => !v)}
                                                    className="text-sm text-blue-600 hover:text-blue-700"
                                                >
                                                    {showUserSelector ? 'Hide' : 'Show'} Users
                                                </button>
                                            </div>

                                            {allowedUsers.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {allowedUsers.map(userId => {
                                                        const u = usersList.find(x => x.id === userId);
                                                        return (
                                                            <span
                                                                key={userId}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-medium border border-blue-200"
                                                            >
                                                                {u?.username || `User ${userId}`}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setAllowedUsers(allowedUsers.filter(id => id !== userId))}
                                                                    className="hover:text-red-700 transition-colors"
                                                                    title="Remove user"
                                                                >
                                                                    ×
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {showUserSelector && (
                                                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg bg-white p-3 space-y-1.5">
                                                    {loadingUsers ? (
                                                        <div className="text-xs text-gray-600 text-center py-4">Loading users...</div>
                                                    ) : usersList.length === 0 ? (
                                                        <div className="text-xs text-gray-600 text-center py-4">No users available</div>
                                                    ) : (
                                                        usersList.map(u => (
                                                            <label
                                                                key={u.id}
                                                                className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={allowedUsers.includes(u.id)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setAllowedUsers([...allowedUsers, u.id]);
                                                                        } else {
                                                                            setAllowedUsers(allowedUsers.filter(id => id !== u.id));
                                                                        }
                                                                    }}
                                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                                />
                                                                <span className="text-sm font-medium text-gray-700 flex-1">{u.username}</span>
                                                                {u.auth_source && u.auth_source !== 'local' && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                                                                        {u.auth_source.toUpperCase()}
                                                                    </span>
                                                                )}
                                                            </label>
                                                        ))
                                                    )}
                                                </div>
                                            )}

                                            {allowedUsers.length === 0 && (
                                                <p className="mt-3 text-xs text-gray-600">
                                                    👥 No users selected: this monitor will be visible to all authenticated users.
                                                </p>
                                            )}
                                        </div>
                                    </SettingsSection>
                                )}

                                <SettingsSection emoji="🔔" title="Notifications" subtitle="Legacy email options — rules live on the Email tab" tone="purple">
                                    <p className="text-xs text-purple-900/80 bg-white/60 rounded-lg px-3 py-2 border border-purple-100">
                                        <span aria-hidden="true">💡 </span>
                                        Use the <strong>Email alerts</strong> toggle at the top for legacy status-change emails. Configure rule-based notifications on the{' '}
                                        <span aria-hidden="true">📧 </span>Email Notifications tab.
                                    </p>

                                    {emailNotification && (
                                        <div className="flex items-center justify-between gap-3 p-3 bg-white/70 rounded-lg border border-purple-200">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-purple-900">
                                                    <span aria-hidden="true">📜 </span>Rule-based only (disable legacy emails)
                                                </div>
                                                <FieldHelp text="When enabled, the old built-in (legacy) email alerts will not send for this monitor. Only rule-based notifications (Email Notifications tab) will be sent." />
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span
                                                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${legacyEmailDisabled ? 'bg-purple-200 text-purple-800' : 'bg-white/80 text-purple-600'}`}
                                                >
                                                    {legacyEmailDisabled ? 'On' : 'Off'}
                                                </span>
                                                <MonitorTogglePill
                                                    enabled={legacyEmailDisabled}
                                                    onToggle={() => setLegacyEmailDisabled(!legacyEmailDisabled)}
                                                    onClassName="bg-purple-600"
                                                    labelOn="Rule-based only"
                                                    labelOff="Allow legacy emails"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Legacy Email Customization */}
                                    {emailNotification && !legacyEmailDisabled && (
                                        <div className="p-4 bg-white rounded-lg border border-gray-200 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-800">
                                                        <span aria-hidden="true">✉️ </span>Legacy Email Customization
                                                    </div>
                                                    <div className="text-xs text-gray-600 mt-1">
                                                        Customize To/From/Subject/Message for the built-in (legacy) email alerts.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowLegacyEmailAdvanced(v => !v)}
                                                    className="text-sm text-blue-600 hover:text-blue-700"
                                                >
                                                    {showLegacyEmailAdvanced ? 'Hide' : 'Show'} Advanced
                                                </button>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    To (optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={legacyEmailTo}
                                                    onChange={(e) => setLegacyEmailTo(e.target.value)}
                                                    className={inputClass}
                                                    placeholder="admin@example.com, ops@example.com"
                                                />
                                                <FieldHelp text="Comma-separated recipient emails. Leave blank to send to the admin user's email." />
                                            </div>

                                            {showLegacyEmailAdvanced && (
                                                <>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            CC (optional)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={legacyEmailCc}
                                                            onChange={(e) => setLegacyEmailCc(e.target.value)}
                                                            className={inputClass}
                                                            placeholder="cc1@example.com, cc2@example.com"
                                                        />
                                                        <FieldHelp text="Comma-separated CC emails. CC recipients will receive a copy of the alert email." />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                From Name (optional)
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={legacyEmailFromName}
                                                                onChange={(e) => setLegacyEmailFromName(e.target.value)}
                                                                className={inputClass}
                                                                placeholder={`${appName} Monitor`}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                From Email (optional)
                                                            </label>
                                                            <input
                                                                type="text"
                                                                inputMode="email"
                                                                autoComplete="email"
                                                                value={legacyEmailFromEmail}
                                                                onChange={(e) => setLegacyEmailFromEmail(e.target.value)}
                                                                className={inputClass}
                                                                placeholder="noreply@example.com"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Subject Template
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={legacyEmailSubjectTemplate}
                                                            onChange={(e) => setLegacyEmailSubjectTemplate(e.target.value)}
                                                            className={inputClass}
                                                        />
                                                        <FieldHelp text="Supports variables like {monitor_name}, {status}, {details}, {time}." />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Message Template
                                                        </label>
                                                        <textarea
                                                            value={legacyEmailBodyTemplate}
                                                            onChange={(e) => setLegacyEmailBodyTemplate(e.target.value)}
                                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors font-mono text-xs"
                                                            rows={6}
                                                        />
                                                        <FieldHelp text="Supports variables like {monitor_target}, {response_time}, {details}. One email is sent per recipient." />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </SettingsSection>

                                {error && (
                                    <div className="text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
                                        <strong>Error:</strong> {error}
                                    </div>
                                )}
                            </form>
                            </>
                        );
                    }})()}
                </div>

                {/* Footer with Actions - Only show on Settings tab */}
                {activeTab === 'settings' && (
                    <div className="px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-slate-50 to-sky-50/40 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={async () => {
                                if (isAddingNew && createdMonitorId) {
                                    const saved = await saveMonitor({ close: true });
                                    if (!saved) return;
                                }
                                onCancel();
                            }}
                            className="px-5 py-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 border border-gray-300"
                            disabled={isSubmitting}
                        >
                            {isAddingNew && createdMonitorId ? 'Done' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleFooterSaveClick}
                            disabled={isSubmitting}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {isSubmitting
                                ? 'Saving...'
                                : ((monitor?.id && !isAddingNew) || createdMonitorId)
                                    ? 'Update Monitor'
                                    : 'Create Monitor'}
                        </button>
                    </div>
                )}

                {/* Bottom drag strip — reachable if the header is off-screen */}
                <div
                    onPointerDown={beginDragFromPointer}
                    className={`shrink-0 h-7 cursor-grab active:cursor-grabbing select-none touch-none flex items-center justify-center gap-1.5 border-t border-gray-200 ${
                        isDragging
                            ? 'bg-sky-100/90'
                            : 'bg-slate-50/95 hover:bg-slate-100'
                    }`}
                    title="Drag to move"
                    role="presentation"
                >
                    <span className="w-8 h-1 rounded-full bg-slate-300" aria-hidden />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                        Drag
                    </span>
                    <span className="w-8 h-1 rounded-full bg-slate-300" aria-hidden />
                </div>
            </div>
        </div>
    );
};
