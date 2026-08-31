import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Monitorv2 as Monitor, Monitorv2Log as MonitorLog, monitorv2Service as monitoringService } from '../services/monitorv2Service';
import { Monitorv2Form as MonitorForm } from './Monitorv2Form';
import { MonitorTargetLabel } from './MonitorTargetLabel';
import { MonitorUptimeCalendar, MonitorUptimeDayBanner } from './MonitorUptimeCalendar';
import { FaServer, FaGlobe, FaSearch, FaCheck, FaTimes, FaQuestion, FaPlus, FaRedo, FaSyncAlt, FaTrash, FaEdit, FaClock, FaThLarge, FaList, FaCopy, FaBars, FaDownload, FaUpload, FaHistory, FaCalendarAlt, FaEnvelope, FaArrowsAlt, FaPalette, FaCircle, FaExpand, FaCompress, FaBell, FaBellSlash, FaFileExport, FaFileCsv, FaStream, FaColumns, FaSortAmountUp, FaSortAmountDown, FaTachometerAlt, FaDesktop } from 'react-icons/fa';
import { useTileAnimation, getTileAnimationClass, getTileDecorationClass } from './TileAnimationSelector';
import { SMTPSettingsModal } from './SMTPSettingsModal';
import { MonitoringTileStyleModal, TileStyle } from './MonitoringTileStyleModal';
import { userPreferencesService } from '../services/userPreferencesService';
import {
    hasMonitorTileStylePreferences,
    readCachedMonitorTileStyles,
    tileStylesFromPreferences,
    writeCachedMonitorTileStyles,
} from '../utils/monitorTileStyles';
import {
    diffAndNotifyMonitorStatuses,
    MonitorStatusSnapshot,
    readBrowserNotificationsEnabled,
    requestMonitorBrowserNotificationPermission,
    writeBrowserNotificationsEnabled,
} from '../utils/monitorBrowserNotifications';
import { MonitorStatusToast, MonitorStatusToastStack } from './MonitorStatusToastStack';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush, BarChart, Bar, Cell } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { dayKeyFromUnix } from '../utils/monitorUptimeCalendar';
import { ThemeModeMenu } from './ThemeModeMenu';
import { resolveDarkMode, subscribeThemePreference } from '../services/themePreferenceService';
import { MonitorStatusBoard, StatusBoardToolbarIcon } from './MonitorStatusBoard';
import { InternetSpeedTester } from './InternetSpeedTester';

const MONITOR_SECTION_BG_LIGHT_KEY = 'linknest_monitor_section_bg_light';
const MONITOR_SECTION_BG_DARK_KEY = 'linknest_monitor_section_bg_dark';
const MONITOR_SECTION_TEXT_LIGHT_KEY = 'linknest_monitor_section_text_light';
const MONITOR_SECTION_TEXT_DARK_KEY = 'linknest_monitor_section_text_dark';
const DEFAULT_MONITOR_SECTION_BG_LIGHT = '#e8eef7';
const DEFAULT_MONITOR_SECTION_BG_DARK = '#1a2332';
const DEFAULT_MONITOR_SECTION_TEXT_LIGHT = '#334155';
const DEFAULT_MONITOR_SECTION_TEXT_DARK = '#e2e8f0';
const MONITOR_ALL_TABS_SORT_KEY = 'linknest_monitor_fullscreen_all_sort';

type AllTabsSortMode = 'name' | 'links-asc' | 'links-desc';

function parseAllTabsSortMode(value: string | null): AllTabsSortMode {
    return value === 'links-asc' || value === 'links-desc' ? value : 'name';
}

function nextAllTabsSortMode(mode: AllTabsSortMode): AllTabsSortMode {
    if (mode === 'name') return 'links-asc';
    if (mode === 'links-asc') return 'links-desc';
    return 'name';
}

function readMonitorSectionColor(key: string, fallback: string): string {
    try {
        const saved = localStorage.getItem(key);
        return saved && /^#[0-9A-Fa-f]{6}$/.test(saved) ? saved : fallback;
    } catch {
        return fallback;
    }
}

function withMonitorEntranceStyle(
    animationClass: string,
    index: number,
    extra: React.CSSProperties = {},
    groupIndex = 0,
): React.CSSProperties {
    if (!animationClass) return extra;
    return { ...extra, animationDelay: `${groupIndex * 80 + index * 50}ms` };
}

function downloadMonitorJsonFile(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export const Monitorv2Dashboard: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedMonitor, setSelectedMonitor] = useState<Monitor | undefined>(undefined);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [isAddingNew, setIsAddingNew] = useState(false); // Track if we're adding a new monitor
    const [createdMonitorId, setCreatedMonitorId] = useState<number | undefined>(undefined); // ID of newly created monitor
    const [viewingLogsMonitor, setViewingLogsMonitor] = useState<Monitor | null>(null);
    const [logs, setLogs] = useState<MonitorLog[]>([]);
    const [logFilter, setLogFilter] = useState<'1d' | '1w' | '1m' | 'custom'>('1d');
    const [customRange, setCustomRange] = useState<{ from: string, to: string }>({
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        to: new Date().toISOString().slice(0, 16)
    });
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const [purgeKeepDays, setPurgeKeepDays] = useState<0 | 1 | 7 | 30 | 365>(30);
    const [isPurgingLogs, setIsPurgingLogs] = useState(false);
    const [checkingId, setCheckingId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'tiles' | 'grid' | 'compact' | 'capsule' | 'status-bar' | 'status-board' | 'kanban' | 'timeline'>(() => {
        const saved = localStorage.getItem('linknest_monitor_view_mode');
        return (saved === 'tiles' || saved === 'grid' || saved === 'compact' || saved === 'capsule' || saved === 'status-bar' || saved === 'status-board' || saved === 'kanban' || saved === 'timeline') ? saved : 'tiles';
    });
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // Default 30s
    const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(() => {
        const saved = localStorage.getItem('linknest_monitor_auto_refresh_enabled');
        return saved !== null ? saved === 'true' : true; // Default: enabled
    });
    const [autoRefreshMode, setAutoRefreshMode] = useState<'normal' | 'force'>(() => {
        const saved = localStorage.getItem('linknest_monitor_auto_refresh_mode');
        return saved === 'force' ? 'force' : 'normal';
    });
    const [refreshCountdown, setRefreshCountdown] = useState<number>(30);
    const { animation, decoration } = useTileAnimation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<string>(() => {
        const saved = localStorage.getItem('linknest_monitor_active_tab');
        return saved || 'General';
    });
    const [showSMTPSettings, setShowSMTPSettings] = useState(false);
    const [showCronModal, setShowCronModal] = useState(false);
    const [showSpeedTester, setShowSpeedTester] = useState(false);
    useEscapeToClose(showCronModal, () => setShowCronModal(false));
    const [showTileStyleModal, setShowTileStyleModal] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
        const saved = localStorage.getItem('linknest_monitor_fullscreen');
        return saved === 'true';
    });
    const [fullscreenShowAllTabs, setFullscreenShowAllTabs] = useState<boolean>(() => {
        const saved = localStorage.getItem('linknest_monitor_fullscreen_all_tabs');
        return saved !== 'false';
    });
    const [fullscreenAllTabsLayout, setFullscreenAllTabsLayout] = useState<'stack' | 'columns'>(() => {
        const saved = localStorage.getItem('linknest_monitor_fullscreen_all_layout');
        return saved === 'columns' ? 'columns' : 'stack';
    });
    const [allTabsSortMode, setAllTabsSortMode] = useState<AllTabsSortMode>(() => {
        try {
            return parseAllTabsSortMode(localStorage.getItem(MONITOR_ALL_TABS_SORT_KEY));
        } catch {
            return 'name';
        }
    });
    const [sectionBoxBgLight, setSectionBoxBgLight] = useState(() =>
        readMonitorSectionColor(MONITOR_SECTION_BG_LIGHT_KEY, DEFAULT_MONITOR_SECTION_BG_LIGHT)
    );
    const [sectionBoxBgDark, setSectionBoxBgDark] = useState(() =>
        readMonitorSectionColor(MONITOR_SECTION_BG_DARK_KEY, DEFAULT_MONITOR_SECTION_BG_DARK)
    );
    const [sectionBoxTextLight, setSectionBoxTextLight] = useState(() =>
        readMonitorSectionColor(MONITOR_SECTION_TEXT_LIGHT_KEY, DEFAULT_MONITOR_SECTION_TEXT_LIGHT)
    );
    const [sectionBoxTextDark, setSectionBoxTextDark] = useState(() =>
        readMonitorSectionColor(MONITOR_SECTION_TEXT_DARK_KEY, DEFAULT_MONITOR_SECTION_TEXT_DARK)
    );
    const [darkMode, setDarkMode] = useState(() => resolveDarkMode());
    const ownsBrowserFullscreenRef = useRef(false);
    const [notificationsPaused, setNotificationsPaused] = useState<boolean>(false);
    const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() => readBrowserNotificationsEnabled());
    const prevMonitorStatusByIdRef = useRef<Map<number, MonitorStatusSnapshot>>(new Map());
    const [statusToasts, setStatusToasts] = useState<MonitorStatusToast[]>([]);
    const [checkStatus, setCheckStatus] = useState<{ count: number; total: number; up: number; down: number; error: number } | null>(null);
    const [dbError, setDbError] = useState<string | null>(null);

    const exitBrowserFullscreen = useCallback(() => {
        if (!ownsBrowserFullscreenRef.current) return;
        ownsBrowserFullscreenRef.current = false;
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => { /* ignore */ });
        }
    }, []);

    const enterBrowserFullscreen = useCallback(() => {
        const el = document.documentElement;
        if (!el.requestFullscreen || document.fullscreenElement) return;
        el.requestFullscreen()
            .then(() => { ownsBrowserFullscreenRef.current = true; })
            .catch(() => { ownsBrowserFullscreenRef.current = false; });
    }, []);

    const setFullscreenMode = useCallback((next: boolean) => {
        setIsFullscreen(next);
        if (next) {
            enterBrowserFullscreen();
        } else {
            exitBrowserFullscreen();
        }
    }, [enterBrowserFullscreen, exitBrowserFullscreen]);

    // Sync kiosk mode with browser fullscreen + Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setFullscreenMode(false);
            }
        };
        const handleFsChange = () => {
            if (!document.fullscreenElement && ownsBrowserFullscreenRef.current) {
                ownsBrowserFullscreenRef.current = false;
                setIsFullscreen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('fullscreenchange', handleFsChange);
        };
    }, [isFullscreen, setFullscreenMode]);

    // If restored from localStorage as fullscreen, try browser fullscreen once
    useEffect(() => {
        if (isFullscreen) {
            enterBrowserFullscreen();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle Escape key for Logs Modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && viewingLogsMonitor) {
                setViewingLogsMonitor(null);
            }
        };
        if (viewingLogsMonitor) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewingLogsMonitor]);

    // Tile styles: hydrate from local cache so custom colors appear on first paint.
    const [tileStyles, setTileStyles] = useState<TileStyle>(readCachedMonitorTileStyles);
    const [moveMenuId, setMoveMenuId] = useState<number | null>(null);
    const [editingTabName, setEditingTabName] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
    const [tempTabName, setTempTabName] = useState('');
    const [tempGroupName, setTempGroupName] = useState('');
    const [historyViewMode, setHistoryViewMode] = useState<'list' | 'chart' | 'calendar'>('chart');
    const [lastDetailView, setLastDetailView] = useState<'list' | 'chart'>('chart');
    const [detailDayKey, setDetailDayKey] = useState<string | null>(null);
    const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
    const [modalStyle, setModalStyle] = useState({ x: 0, y: 0, width: 1000, height: 750, isMaximized: false });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isResizing, setIsResizing] = useState(false);
    const [resizeStart, setResizeStart] = useState({ w: 0, h: 0, x: 0, y: 0 });

    // Initialize/Center modal when opened
    useEffect(() => {
        if (viewingLogsMonitor) {
            const width = Math.min(window.innerWidth - 40, 1000);
            const height = Math.min(window.innerHeight - 40, 750);
            setModalStyle(prev => ({
                ...prev,
                width,
                height,
                x: (window.innerWidth - width) / 2,
                y: (window.innerHeight - height) / 2
            }));
        }
    }, [viewingLogsMonitor]);

    // Dragging Logic
    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - modalStyle.x,
            y: e.clientY - modalStyle.y
        });
    };

    // Resizing Logic
    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);
        setResizeStart({
            w: modalStyle.width,
            h: modalStyle.height,
            x: e.clientX,
            y: e.clientY
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setModalStyle(prev => ({
                    ...prev,
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                }));
            }
            if (isResizing) {
                const dw = e.clientX - resizeStart.x;
                const dh = e.clientY - resizeStart.y;
                setModalStyle(prev => ({
                    ...prev,
                    width: Math.max(600, resizeStart.w + dw),
                    height: Math.max(400, resizeStart.h + dh)
                }));
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, dragOffset, resizeStart]);

    // Persist view mode
    useEffect(() => {
        localStorage.setItem('linknest_monitor_view_mode', viewMode);
    }, [viewMode]);

    // Persist fullscreen mode
    useEffect(() => {
        localStorage.setItem('linknest_monitor_fullscreen', isFullscreen.toString());
    }, [isFullscreen]);

    useEffect(() => {
        localStorage.setItem('linknest_monitor_fullscreen_all_tabs', fullscreenShowAllTabs.toString());
    }, [fullscreenShowAllTabs]);

    useEffect(() => {
        localStorage.setItem('linknest_monitor_fullscreen_all_layout', fullscreenAllTabsLayout);
    }, [fullscreenAllTabsLayout]);

    useEffect(() => {
        localStorage.setItem(MONITOR_ALL_TABS_SORT_KEY, allTabsSortMode);
    }, [allTabsSortMode]);

    useEffect(() => {
        localStorage.setItem(MONITOR_SECTION_BG_LIGHT_KEY, sectionBoxBgLight);
    }, [sectionBoxBgLight]);

    useEffect(() => {
        localStorage.setItem(MONITOR_SECTION_BG_DARK_KEY, sectionBoxBgDark);
    }, [sectionBoxBgDark]);

    useEffect(() => {
        localStorage.setItem(MONITOR_SECTION_TEXT_LIGHT_KEY, sectionBoxTextLight);
    }, [sectionBoxTextLight]);

    useEffect(() => {
        localStorage.setItem(MONITOR_SECTION_TEXT_DARK_KEY, sectionBoxTextDark);
    }, [sectionBoxTextDark]);

    useEffect(() => subscribeThemePreference(() => setDarkMode(resolveDarkMode())), []);

    // Load notification status on mount
    useEffect(() => {
        fetchNotificationStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchMonitors = useCallback(async () => {
        setDbError(null);
        try {
            const data = await monitoringService.getMonitors();
            setMonitors(data);
        } catch (error) {
            console.error('Failed to load monitors', error);
            const msg = error instanceof Error ? error.message : 'Failed to load monitors';
            setDbError(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchNotificationStatus = useCallback(async () => {
        try {
            const response = await fetch('api/settings.php');
            if (response.ok) {
                const data = await response.json();
                const isPaused = data.settings?.notifications_paused === '1' || data.settings?.notifications_paused === 'true';
                setNotificationsPaused(isPaused);
            }
        } catch (error) {
            console.error('Failed to fetch notification status', error);
        }
    }, []);

    const toggleNotifications = useCallback(async () => {
        try {
            const response = await fetch('api/settings.php/toggle-notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                setNotificationsPaused(data.notifications_paused);
            }
        } catch (error) {
            console.error('Failed to toggle notifications', error);
        }
    }, []);

    const dismissStatusToast = useCallback((key: string) => {
        setStatusToasts((prev) => prev.filter((t) => t.key !== key));
    }, []);

    const toggleBrowserNotifications = useCallback(async () => {
        if (browserNotificationsEnabled) {
            setBrowserNotificationsEnabled(false);
            return;
        }
        // Request permission so OS browser notifications fire alongside in-app toasts.
        // In-app toasts still work if permission is denied.
        await requestMonitorBrowserNotificationPermission();
        // Re-seed so currently-down monitors do not all fire at once.
        prevMonitorStatusByIdRef.current = new Map();
        setBrowserNotificationsEnabled(true);
    }, [browserNotificationsEnabled]);

    useEffect(() => {
        writeBrowserNotificationsEnabled(browserNotificationsEnabled);
    }, [browserNotificationsEnabled]);

    useEffect(() => {
        const { prev, alerts } = diffAndNotifyMonitorStatuses(
            prevMonitorStatusByIdRef.current,
            monitors,
            browserNotificationsEnabled
        );
        prevMonitorStatusByIdRef.current = prev;
        if (alerts.length === 0) return;
        const stamp = Date.now();
        setStatusToasts((current) => [
            ...current,
            ...alerts.map((a, i) => ({
                ...a,
                key: `${a.id}-${a.status}-${stamp}-${i}`,
            })),
        ]);
    }, [monitors, browserNotificationsEnabled]);

    const refreshAll = useCallback(async (isFullCheck = false) => {
        setIsLoading(true);
        setCheckStatus(null); // Clear previous status
        try {
            if (isFullCheck) {
                const checkResult = await monitoringService.checkAllMonitors(true);
                setCheckStatus({
                    count: checkResult.count,
                    total: checkResult.total,
                    up: checkResult.up_count,
                    down: checkResult.down_count,
                    error: checkResult.error_count
                });
                // Clear status after 5 seconds
                setTimeout(() => setCheckStatus(null), 5000);
            }
            await fetchMonitors();
        } catch (error) {
            console.error('Failed to refresh monitors', error);
            setCheckStatus(null);
        } finally {
            setIsLoading(false);
        }
    }, [fetchMonitors]);

    const loadTileStyles = useCallback(async () => {
        try {
            const preferences = await userPreferencesService.getPreferences();
            if (!hasMonitorTileStylePreferences(preferences)) return;
            const loadedStyles = tileStylesFromPreferences(preferences);
            writeCachedMonitorTileStyles(loadedStyles);
            setTileStyles(loadedStyles);
        } catch (error) {
            console.error('Failed to load tile styles:', error);
        }
    }, []);

    useEffect(() => {
        fetchMonitors();
        loadTileStyles();
    }, [fetchMonitors, loadTileStyles]);

    const handleTileStylesChange = useCallback((styles: TileStyle) => {
        setTileStyles(styles);
    }, []);

    // Auto refresh logic
    useEffect(() => {
        let timer: any;
        if (isAutoRefreshEnabled) {
            timer = setInterval(() => {
                setRefreshCountdown(prev => {
                    if (prev <= 1) {
                        refreshAll(autoRefreshMode === 'force');
                        return autoRefreshInterval;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isAutoRefreshEnabled, autoRefreshInterval, autoRefreshMode, refreshAll]);

    // Reset countdown when interval changes
    useEffect(() => {
        setRefreshCountdown(autoRefreshInterval);
    }, [autoRefreshInterval]);

    // Persist auto refresh toggle
    useEffect(() => {
        localStorage.setItem('linknest_monitor_auto_refresh_enabled', isAutoRefreshEnabled.toString());
    }, [isAutoRefreshEnabled]);

    // Persist auto refresh mode
    useEffect(() => {
        localStorage.setItem('linknest_monitor_auto_refresh_mode', autoRefreshMode);
    }, [autoRefreshMode]);

    const handleSave = async (data: Partial<Monitor>) => {
        if (!isAdmin) {
            throw new Error('Admin access required');
        }
        try {
            if (selectedMonitor && !isDuplicate && !isAddingNew) {
                // Update existing monitor - close dialog after save
                await monitoringService.updateMonitor(selectedMonitor.id, data);
                setIsEditing(false);
                setIsDuplicate(false);
                setSelectedMonitor(undefined);
                setCreatedMonitorId(undefined);
            } else {
                // Create new monitor - keep dialog open so user can configure notifications
                const createdMonitor = await monitoringService.createMonitor(data);
                // Store the created monitor ID for the form to use in tabs
                setCreatedMonitorId(createdMonitor.id);
                // Keep isAddingNew true so we know we're still in "add mode"
                setIsAddingNew(true);
            }
            fetchMonitors();
        } catch (error) {
            throw error;
        }
    };

    const handleDelete = async (id: number) => {
        if (!isAdmin) return;
        if (!confirm('Are you sure you want to delete this monitor?')) return;
        try {
            await monitoringService.deleteMonitor(id);
            fetchMonitors();
        } catch (error) {
            console.error('Failed to delete monitor', error);
        }
    };

    const handleDuplicate = async (monitor: Monitor) => {
        if (!isAdmin) return;
        try {
            setIsLoading(true);
            // Call backend to duplicate monitor with all its rules and recipients
            await monitoringService.duplicateMonitor(monitor.id);
            await fetchMonitors();
        } catch (error) {
            console.error('Failed to duplicate monitor', error);
            alert('Failed to duplicate monitor. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportMonitor = async (monitor: Monitor) => {
        if (!isAdmin) return;
        try {
            setIsLoading(true);
            const data = await monitoringService.exportMonitor(monitor.id);
            downloadMonitorJsonFile(
                `monitor_${monitor.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`,
                data
            );
        } catch (error) {
            console.error('Failed to export monitor', error);
            alert(error instanceof Error ? error.message : 'Failed to export monitor. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCheckNow = async (id: number) => {
        setCheckingId(id);
        try {
            // In "force" mode, also trigger all notification rules serially (even if status is unchanged).
            await monitoringService.checkMonitor(id, { forceNotifyRules: autoRefreshMode === 'force' });
            fetchMonitors(); // Reload to get updated status
        } catch (error) {
            console.error('Failed to check monitor', error);
        } finally {
            setCheckingId(null);
        }
    };

    const handleExportJSON = async (includeLogs: boolean = false) => {
        if (!isAdmin) return;
        try {
            setIsLoading(true);
            const bundle = await monitoringService.exportMonitorsBundle(includeLogs);
            const suffix = includeLogs ? '' : '_no_history';
            downloadMonitorJsonFile(
                `linknest_monitoring_bundle${suffix}_${new Date().toISOString().split('T')[0]}.json`,
                bundle
            );
        } catch (error) {
            console.error('Failed to export monitoring bundle', error);
            alert(error instanceof Error ? error.message : 'Failed to export monitoring bundle.');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchLogs = useCallback(async (id: number, filter: '1d' | '1w' | '1m' | 'custom') => {
        setIsLogsLoading(true);
        try {
            let options: any = {};
            if (filter === 'custom') {
                options.from = Math.floor(new Date(customRange.from).getTime() / 1000);
                options.to = Math.floor(new Date(customRange.to).getTime() / 1000);
            } else {
                options.days = filter === '1d' ? 1 : filter === '1w' ? 7 : 30;
            }
            const data = await monitoringService.getMonitorLogs(id, options);
            setLogs(data);
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setIsLogsLoading(false);
        }
    }, [customRange]);

    const handleExportHistoryJSON = () => {
        if (!logs.length || !viewingLogsMonitor) return;
        const payload = {
            type: 'monitor_uptime_history',
            exported_at: Math.floor(Date.now() / 1000),
            monitor_id: viewingLogsMonitor.id,
            monitor_name: viewingLogsMonitor.name,
            logs,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute(
            'download',
            `uptime_history_${viewingLogsMonitor.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`
        );
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExportHistoryCSV = () => {
        if (!viewingLogsMonitor) return;
        const rows = detailLogs.length ? detailLogs : logs;
        if (!rows.length) return;
        const csvEscape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
        const header = ['Time', 'Status', 'Response Time (ms)', 'HTTP Code', 'Details', 'Error', 'Monitor', 'Monitor ID'];
        const body = rows.map((log) => [
            new Date(log.checked_at * 1000).toLocaleString(),
            log.status,
            String(log.response_time ?? log.response_time_ms ?? ''),
            log.http_code != null ? String(log.http_code) : '',
            log.details || '',
            log.error_message || '',
            viewingLogsMonitor.name,
            String(viewingLogsMonitor.id),
        ]);
        const csv = [header, ...body].map((cols) => cols.map((c) => csvEscape(c)).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute(
            'download',
            `uptime_history_${viewingLogsMonitor.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`
        );
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handlePurgeHistory = async () => {
        if (!viewingLogsMonitor || !isAdmin) return;
        const keepLabels: Record<number, string> = {
            0: 'ALL history',
            1: 'last 1 day',
            7: 'last 1 week',
            30: 'last 1 month',
            365: 'last 1 year',
        };
        const scopeLabel =
            purgeKeepDays === 0
                ? `Purge ALL history for "${viewingLogsMonitor.name}"`
                : `Keep ${keepLabels[purgeKeepDays]} and permanently delete older checks for "${viewingLogsMonitor.name}"`;
        if (!confirm(`${scopeLabel}?\n\nThis cannot be undone.`)) {
            return;
        }
        try {
            setIsPurgingLogs(true);
            const result = await monitoringService.purgeMonitorLogs(viewingLogsMonitor.id, purgeKeepDays);
            alert(
                `Purged ${result.deleted_count} check${result.deleted_count === 1 ? '' : 's'}.`
            );
            setDetailDayKey(null);
            await fetchLogs(viewingLogsMonitor.id, logFilter);
        } catch (error) {
            console.error('Failed to purge monitor logs', error);
            alert(error instanceof Error ? error.message : 'Failed to purge monitor logs');
        } finally {
            setIsPurgingLogs(false);
        }
    };

    const handleMoveMonitor = async (id: number, updates: { tab_name?: string, group_name?: string }) => {
        if (!isAdmin) return;
        try {
            await monitoringService.updateMonitor(id, updates);
            fetchMonitors();
            setMoveMenuId(null);
        } catch (error) {
            console.error('Failed to move monitor', error);
        }
    };

    useEffect(() => {
        if (viewingLogsMonitor) {
            fetchLogs(viewingLogsMonitor.id, logFilter);
        }
    }, [viewingLogsMonitor, logFilter, fetchLogs]);

    useEffect(() => {
        // Reset brush range when logs change, day filter changes, or dialog closes
        setBrushRange(null);
    }, [logs, detailDayKey]);

    useEffect(() => {
        // Reset brush range when dialog closes
        if (!viewingLogsMonitor) {
            setBrushRange(null);
            setDetailDayKey(null);
        }
    }, [viewingLogsMonitor]);

    const detailLogs = useMemo(() => {
        if (!detailDayKey || historyViewMode === 'calendar') return logs;
        return logs.filter((log) => dayKeyFromUnix(log.checked_at) === detailDayKey);
    }, [logs, detailDayKey, historyViewMode]);

    const groupedLogs = useMemo<Record<string, MonitorLog[]>>(() => {
        const groups: { [key: string]: MonitorLog[] } = {};
        detailLogs.forEach(log => {
            const date = new Date(log.checked_at * 1000).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            if (!groups[date]) groups[date] = [];
            groups[date].push(log);
        });
        return groups;
    }, [detailLogs]);

    const chartData = useMemo(() => {
        return [...detailLogs].reverse().map(log => {
            const dateObj = new Date(log.checked_at * 1000);
            return {
                time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                fullTime: dateObj.toLocaleString(),
                latency: log.status === 'up' ? log.response_time : 0,
                status: log.status,
                // For histogram/status bar
                val: 1, // Constant height for status bar
                color: log.status === 'up' ? '#10b981' : (log.status === 'warning' ? '#f59e0b' : '#ef4444')
            };
        });
    }, [detailLogs]);

    const filteredChartData = useMemo(() => {
        if (!brushRange) return chartData;
        const { startIndex, endIndex } = brushRange;
        return chartData.slice(startIndex, endIndex + 1);
    }, [chartData, brushRange]);

    const groupedByTabs = useMemo<Record<string, Monitor[]>>(() => {
        const tabs: { [key: string]: Monitor[] } = {};
        if (monitors.length === 0) return tabs;

        monitors.forEach(m => {
            const tab = m.tab_name || 'General';
            if (!tabs[tab]) tabs[tab] = [];
            tabs[tab].push(m);
        });
        return tabs;
    }, [monitors]);

    const tabNames = useMemo(() => Object.keys(groupedByTabs).sort((a, b) => {
        if (a === 'General') return -1;
        if (b === 'General') return 1;
        return a.localeCompare(b);
    }), [groupedByTabs]);

    useEffect(() => {
        if (isLoading) return;
        if (tabNames.length > 0 && !tabNames.includes(activeTab)) {
            setActiveTab(tabNames[0]);
        } else if (tabNames.length === 0 && activeTab !== 'General') {
            setActiveTab('General');
        }
    }, [tabNames, activeTab, isLoading]);

    useEffect(() => {
        localStorage.setItem('linknest_monitor_active_tab', activeTab);
    }, [activeTab]);

    const groupMonitorsByGroupName = useCallback((list: Monitor[]) => {
        const groups: Record<string, Monitor[]> = {};
        list.forEach((m) => {
            const group = m.group_name || 'Other';
            if (!groups[group]) groups[group] = [];
            groups[group].push(m);
        });
        return groups;
    }, []);

    const sortGroupNames = useCallback((groups: Record<string, Monitor[]>) => {
        return Object.keys(groups).sort((a, b) => {
            if (a === 'Other') return 1;
            if (b === 'Other') return -1;
            return a.localeCompare(b);
        });
    }, []);

    const displayTabSections = useMemo(() => {
        const tabs = (isFullscreen && fullscreenShowAllTabs) ? tabNames : [activeTab];
        const sections = tabs
            .map((tab) => {
                const list = groupedByTabs[tab] || [];
                const groups = groupMonitorsByGroupName(list);
                return {
                    tab,
                    groups,
                    sortedGroupNames: sortGroupNames(groups),
                    count: list.length,
                };
            })
            .filter((section) => !(isFullscreen && fullscreenShowAllTabs) || section.count > 0);
        if (!(isFullscreen && fullscreenShowAllTabs) || allTabsSortMode === 'name') {
            return sections;
        }
        const dir = allTabsSortMode === 'links-asc' ? 1 : -1;
        return [...sections].sort((a, b) => {
            const byCount = (a.count - b.count) * dir;
            if (byCount !== 0) return byCount;
            return a.tab.localeCompare(b.tab);
        });
    }, [
        isFullscreen,
        fullscreenShowAllTabs,
        tabNames,
        activeTab,
        groupedByTabs,
        groupMonitorsByGroupName,
        sortGroupNames,
        allTabsSortMode,
    ]);

    const isAllTabsColumns = isFullscreen && fullscreenShowAllTabs && fullscreenAllTabsLayout === 'columns';
    const isAllTabsStacked = isFullscreen && fullscreenShowAllTabs && fullscreenAllTabsLayout === 'stack';
    const sectionBoxBg = darkMode ? sectionBoxBgDark : sectionBoxBgLight;
    const sectionBoxText = darkMode ? sectionBoxTextDark : sectionBoxTextLight;
    const tileGridClass = viewMode === 'tiles'
        ? (isAllTabsColumns
            ? 'grid gap-2 grid-cols-1 xl:grid-cols-2'
            : 'grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4')
        : viewMode === 'compact'
            ? (isAllTabsColumns
                ? 'grid gap-2 grid-cols-1 sm:grid-cols-2'
                : 'grid gap-4 grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6')
            : '';

    const handleTileClick = (e: React.MouseEvent, monitor: Monitor) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        setViewingLogsMonitor(monitor);
    };

    const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!isAdmin) return;
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content);

                // Check if it's a single monitor or bundle
                const isSingleMonitor = data.type === 'single_monitor' && data.monitor;
                const isBundle = data.monitors && Array.isArray(data.monitors);

                if (isSingleMonitor) {
                    const logCount = Array.isArray(data.monitor_logs) ? data.monitor_logs.length : 0;
                    const ruleCount = Array.isArray(data.notification_rules) ? data.notification_rules.length : 0;
                    const emailLogCount = Array.isArray(data.email_logs) ? data.email_logs.length : 0;
                    const auditCount = Array.isArray(data.audit_logs) ? data.audit_logs.length : 0;
                    const confirmImport = confirm(
                        `Import monitor "${data.monitor.name}"?\n\nIncludes ${ruleCount} notification rule(s), ${logCount} uptime log(s), ${emailLogCount} email log(s), and ${auditCount} audit event(s).`
                    );
                    if (!confirmImport) return;
                    setIsLoading(true);
                    await monitoringService.importMonitorsBundle(data, false);
                    await fetchMonitors();
                    alert('Monitor imported successfully!');
                } else if (isBundle) {
                    const noHistory = data.include_logs === false;
                    const confirmReplace = confirm(
                        noHistory
                            ? 'This file has no history logs. Import will still replace ALL existing monitors and notification rules. Existing check history on this server will be deleted. Continue?'
                            : 'Import will replace ALL existing monitors, notification rules, permissions, uptime logs, email logs, speed-test schedules/results, and monitor audit history. Continue?'
                    );
                    if (!confirmReplace) return;
                    setIsLoading(true);
                    await monitoringService.importMonitorsBundle(data, true);
                    await fetchMonitors();
                    alert('Monitoring bundle imported successfully!');
                } else {
                    alert('Invalid file format. Must be either a single monitor export or a monitors bundle.');
                }
            } catch (err) {
                console.error('Failed to import monitors', err);
                alert('Failed to import. Please check the file format.');
            } finally {
                setIsLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleTabRename = async (oldName: string) => {
        if (!isAdmin) {
            setEditingTabName(null);
            return;
        }
        if (!tempTabName.trim() || tempTabName === oldName) {
            setEditingTabName(null);
            return;
        }
        try {
            await monitoringService.updateTabName(oldName, tempTabName.trim());
            if (activeTab === oldName) setActiveTab(tempTabName.trim());
            fetchMonitors();
        } catch (error) {
            console.error('Failed to rename tab', error);
            alert('Failed to rename tab');
        } finally {
            setEditingTabName(null);
        }
    };

    const handleGroupRename = async (groupName: string) => {
        if (!isAdmin) {
            setEditingGroupName(null);
            return;
        }
        if (!tempGroupName.trim() || tempGroupName === groupName) {
            setEditingGroupName(null);
            return;
        }
        try {
            await monitoringService.updateGroupName(activeTab, groupName, tempGroupName.trim());
            fetchMonitors();
        } catch (error) {
            console.error('Failed to rename group', error);
            alert('Failed to rename group');
        } finally {
            setEditingGroupName(null);
        }
    };

    const handleDeleteAll = async () => {
        if (!isAdmin) return;
        if (!confirm('CRITICAL ACTION: Are you sure you want to delete ALL monitoring tiles? This cannot be undone.')) return;
        setIsLoading(true);
        try {
            await monitoringService.deleteAllMonitors();
            await fetchMonitors();
        } catch (error) {
            console.error('Failed to delete all monitors', error);
        } finally {
            setIsLoading(false);
        }
    };

    const isInMaintenance = (monitor: Monitor): boolean => {
        if (!monitor.maintenance_start || !monitor.maintenance_end) {
            return false;
        }
        const now = Math.floor(Date.now() / 1000);
        return now >= monitor.maintenance_start && now <= monitor.maintenance_end;
    };

    const getStatusIcon = (status: string | null) => {
        switch (status) {
            case 'up': return <FaCheck {...({ className: "text-green-500" } as any)} />;
            case 'down': return <FaTimes {...({ className: "text-red-500" } as any)} />;
            case 'warning': return <FaQuestion {...({ className: "text-amber-500" } as any)} />;
            default: return <FaQuestion {...({ className: "text-gray-500" } as any)} />;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'url': return <FaGlobe {...({ className: "text-blue-400" } as any)} />;
            case 'keyword': return <FaSearch {...({ className: "text-purple-400" } as any)} />;
            case 'port': return <FaServer {...({ className: "text-orange-400" } as any)} />;
            case 'ping': return <FaCircle {...({ className: "text-emerald-400" } as any)} />;
            default: return <FaGlobe />;
        }
    };

    const renderEmailIndicators = (monitor: Monitor, size: number) => {
        const rulesCount = typeof monitor.email_rules_count === 'number' ? monitor.email_rules_count : 0;
        const legacyEnabled = !!monitor.email_notification;
        const hasRules = rulesCount > 0;
        const isEnabled = hasRules || legacyEnabled;
        if (!isEnabled) return null;

        // If monitor uses rule-based (business rules) notifications, show two mail icons
        const iconCount = hasRules ? 2 : 1;
        const isColored = monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning';
        const pillClass = isColored
            ? 'bg-white/20'
            : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400';
        const iconStyle = isColored ? getTileTextStyle(monitor.last_status) : undefined;
        const title = hasRules
            ? `Email notifications enabled (${rulesCount} rules)`
            : 'Email notifications enabled (1 rule)';

        return (
            <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${pillClass}`}
                title={title}
            >
                {Array.from({ length: iconCount }).map((_, idx) => (
                    <FaEnvelope key={idx} {...({ size, style: iconStyle } as any)} />
                ))}
            </span>
        );
    };

    // Memoize formatLastChecked to avoid recalculation
    const formatLastChecked = useCallback((timestamp: number | string | null) => {
        if (!timestamp) return 'Never';

        const time = typeof timestamp === 'number'
            ? timestamp * 1000
            : new Date(timestamp).getTime();

        const lastChecked = new Date(time);
        const now = new Date();
        const diff = now.getTime() - lastChecked.getTime();

        if (diff < 0) return 'Just now';

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m ago`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s ago`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
        return `${seconds}s ago`;
    }, []);

    // Memoize helper functions for performance
    const getTileStyle = useCallback((status: 'up' | 'down' | 'warning' | 'unknown' | null): React.CSSProperties => {
        if (status === 'up') {
            if (tileStyles.upUseGradient) {
                return {
                    background: `linear-gradient(135deg, ${tileStyles.upGradientStart}, ${tileStyles.upGradientEnd})`,
                };
            }
            return {
                backgroundColor: tileStyles.upBackgroundColor,
            };
        } else if (status === 'down') {
            if (tileStyles.downUseGradient) {
                return {
                    background: `linear-gradient(135deg, ${tileStyles.downGradientStart}, ${tileStyles.downGradientEnd})`,
                };
            }
            return {
                backgroundColor: tileStyles.downBackgroundColor,
            };
        } else if (status === 'warning') {
            if (tileStyles.warningUseGradient) {
                return {
                    background: `linear-gradient(135deg, ${tileStyles.warningGradientStart}, ${tileStyles.warningGradientEnd})`,
                };
            }
            return { backgroundColor: tileStyles.warningBackgroundColor };
        }
        return {};
    }, [tileStyles]);

    const getTileTextColor = useCallback((status: 'up' | 'down' | 'warning' | 'unknown' | null): string => {
        if (status === 'up') {
            return tileStyles.upTextColor;
        } else if (status === 'down') {
            return tileStyles.downTextColor;
        } else if (status === 'warning') {
            return tileStyles.warningTextColor;
        }
        return '';
    }, [tileStyles]);

    const getTileFontFamily = useCallback((status: 'up' | 'down' | 'warning' | 'unknown' | null): string => {
        if (status === 'up') return tileStyles.upFontFamily;
        if (status === 'down') return tileStyles.downFontFamily;
        if (status === 'warning') return tileStyles.warningFontFamily;
        return '';
    }, [tileStyles]);

    const getTileTextStyle = useCallback((status: 'up' | 'down' | 'warning' | 'unknown' | null): React.CSSProperties => {
        const color = getTileTextColor(status);
        if (color) {
            return { color };
        }
        return {};
    }, [getTileTextColor]);

    const getTileBorderColor = useCallback((status: 'up' | 'down' | 'warning' | 'unknown' | null): string => {
        if (status === 'up') {
            return tileStyles.upUseGradient ? tileStyles.upGradientStart : tileStyles.upBackgroundColor;
        } else if (status === 'down') {
            return tileStyles.downUseGradient ? tileStyles.downGradientStart : tileStyles.downBackgroundColor;
        } else if (status === 'warning') {
            return tileStyles.warningUseGradient ? tileStyles.warningGradientStart : tileStyles.warningBackgroundColor;
        }
        return '';
    }, [tileStyles]);

    const animationClass = getTileAnimationClass(animation);
    const decorationClass = getTileDecorationClass(decoration);
    const fullAnimClass = `${animationClass} ${decorationClass}`.trim();
    const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';
    const monitorAnimClass = `${fullAnimClass} ${tileAnimatedClass} linknest-monitor-tile`.trim();

    const content = (
        <>
            <MonitorStatusToastStack toasts={statusToasts} onDismiss={dismissStatusToast} />
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportJSON}
                className="hidden"
                accept=".json"
            />
            {isFullscreen ? (
                <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-2 py-1.5 mb-2 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md border border-slate-200 dark:border-[#333] rounded-xl shadow-sm">
                    <button
                        type="button"
                        onClick={() => setFullscreenMode(false)}
                        className="p-2 rounded-lg transition-all text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-[#333] border border-slate-200 dark:border-[#333]"
                        title="Exit Fullscreen (Esc)"
                        aria-label="Exit fullscreen"
                    >
                        <FaCompress size={14} />
                    </button>

                    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#252525] p-0.5 rounded-lg">
                        <button
                            onClick={() => setViewMode('tiles')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'tiles' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Grid Mode"
                        >
                            <FaThLarge size={13} />
                        </button>
                        <button
                            onClick={() => setViewMode('compact')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'compact' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Compact Bar Mode"
                        >
                            <FaBars size={13} />
                        </button>
                        <button
                            onClick={() => setViewMode('capsule')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'capsule' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Capsule Mode"
                        >
                            <FaCircle size={13} />
                        </button>
                        <button
                            onClick={() => setViewMode('status-bar')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'status-bar' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Status Bar Mode"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="2" y="4" width="20" height="4" rx="2" />
                                <rect x="2" y="10" width="20" height="4" rx="2" />
                                <rect x="2" y="16" width="20" height="4" rx="2" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('status-board')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'status-board' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Status Board (PHP Server Monitor style)"
                            aria-label="Status Board"
                            aria-pressed={viewMode === 'status-board'}
                        >
                            <StatusBoardToolbarIcon size={13} />
                        </button>
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Kanban Mode"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="2" y="2" width="6" height="20" rx="1" />
                                <rect x="10" y="2" width="6" height="14" rx="1" />
                                <rect x="18" y="2" width="4" height="18" rx="1" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'timeline' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Timeline Mode"
                        >
                            <FaHistory size={13} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Table Mode"
                        >
                            <FaList size={13} />
                        </button>
                    </div>

                    {tabNames.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 max-w-full">
                            <button
                                type="button"
                                onClick={() => setFullscreenShowAllTabs(true)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    fullscreenShowAllTabs
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-600 dark:bg-[#252525] dark:text-slate-400'
                                }`}
                                title="Show monitors from every tab"
                            >
                                All
                                <span className={`px-1 rounded text-[9px] ${fullscreenShowAllTabs ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                                    {monitors.length}
                                </span>
                            </button>
                            {fullscreenShowAllTabs && (
                                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#252525] p-0.5 rounded-lg" title="All-tabs layout">
                                    <button
                                        type="button"
                                        onClick={() => setFullscreenAllTabsLayout('stack')}
                                        className={`p-1.5 rounded-md transition-all ${fullscreenAllTabsLayout === 'stack' ? 'bg-white dark:bg-[#333] text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="Stack tabs vertically"
                                        aria-label="Stack tabs vertically"
                                        aria-pressed={fullscreenAllTabsLayout === 'stack'}
                                    >
                                        <FaStream size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFullscreenAllTabsLayout('columns')}
                                        className={`p-1.5 rounded-md transition-all ${fullscreenAllTabsLayout === 'columns' ? 'bg-white dark:bg-[#333] text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="Side-by-side tab columns"
                                        aria-label="Side-by-side tab columns"
                                        aria-pressed={fullscreenAllTabsLayout === 'columns'}
                                    >
                                        <FaColumns size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAllTabsSortMode(nextAllTabsSortMode)}
                                        className={`p-1.5 rounded-md transition-all ${allTabsSortMode !== 'name' ? 'bg-white dark:bg-[#333] text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        title={
                                            allTabsSortMode === 'links-asc'
                                                ? 'Sorted by link count (least to most). Click for most to least.'
                                                : allTabsSortMode === 'links-desc'
                                                    ? 'Sorted by link count (most to least). Click for tab name order.'
                                                    : 'Sort side-by-side tiles by link count (least to most)'
                                        }
                                        aria-label="Sort tab tiles by link count"
                                        aria-pressed={allTabsSortMode !== 'name'}
                                    >
                                        {allTabsSortMode === 'links-desc' ? <FaSortAmountDown size={12} /> : <FaSortAmountUp size={12} />}
                                    </button>
                                </div>
                            )}
                            {fullscreenShowAllTabs && (
                                <div
                                    className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg bg-slate-100 dark:bg-[#252525]"
                                    title={`Tab group colors (${darkMode ? 'night' : 'day'} mode)`}
                                >
                                    <label className="inline-flex items-center gap-1 cursor-pointer" title="Group box background">
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Bg</span>
                                        <input
                                            type="color"
                                            value={sectionBoxBg}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                if (darkMode) setSectionBoxBgDark(next);
                                                else setSectionBoxBgLight(next);
                                            }}
                                            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                                            aria-label="Tab group box background color"
                                        />
                                    </label>
                                    <label className="inline-flex items-center gap-1 cursor-pointer" title="Group box text">
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Tx</span>
                                        <input
                                            type="color"
                                            value={sectionBoxText}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                if (darkMode) setSectionBoxTextDark(next);
                                                else setSectionBoxTextLight(next);
                                            }}
                                            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                                            aria-label="Tab group box text color"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="px-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        title="Reset group box colors for this mode"
                                        onClick={() => {
                                            if (darkMode) {
                                                setSectionBoxBgDark(DEFAULT_MONITOR_SECTION_BG_DARK);
                                                setSectionBoxTextDark(DEFAULT_MONITOR_SECTION_TEXT_DARK);
                                            } else {
                                                setSectionBoxBgLight(DEFAULT_MONITOR_SECTION_BG_LIGHT);
                                                setSectionBoxTextLight(DEFAULT_MONITOR_SECTION_TEXT_LIGHT);
                                            }
                                        }}
                                    >
                                        Reset
                                    </button>
                                </div>
                            )}
                            {tabNames.map(tab => {
                                const isActive = !fullscreenShowAllTabs && activeTab === tab;
                                return (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => {
                                            setFullscreenShowAllTabs(false);
                                            setActiveTab(tab);
                                        }}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                            isActive
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-100 text-slate-600 dark:bg-[#252525] dark:text-slate-400'
                                        }`}
                                    >
                                        {tab}
                                        <span className={`px-1 rounded text-[9px] ${isActive ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                                            {(groupedByTabs[tab] || []).length}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                        <button
                            type="button"
                            onClick={() => void toggleBrowserNotifications()}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                                browserNotificationsEnabled
                                    ? 'text-green-500 bg-green-50 dark:bg-green-900/30'
                                    : 'text-slate-500 bg-slate-100 dark:bg-[#252525] dark:text-slate-400'
                            }`}
                            title={browserNotificationsEnabled ? 'Browser notifications on — click to turn off' : 'Browser notifications off — click to turn on'}
                            aria-label={browserNotificationsEnabled ? 'Turn off browser notifications' : 'Turn on browser notifications'}
                            aria-pressed={browserNotificationsEnabled}
                        >
                            <FaDesktop size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSpeedTester(true)}
                            className="flex items-center justify-center w-8 h-8 text-cyan-600 dark:text-cyan-400 bg-slate-100 dark:bg-[#252525] rounded-lg transition-all"
                            title="Internet speed test"
                            aria-label="Internet speed test"
                        >
                            <FaTachometerAlt size={13} />
                        </button>
                        <ThemeModeMenu darkMode={darkMode} compact />
                        <button
                            type="button"
                            onClick={() => refreshAll(false)}
                            className="flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-[#252525] rounded-lg transition-all"
                            title="Refresh list (no checks)"
                        >
                            <FaSyncAlt size={13} {...({ className: isLoading ? 'animate-spin' : '' } as any)} />
                        </button>
                        <button
                            type="button"
                            onClick={() => refreshAll(true)}
                            className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 bg-slate-100 dark:bg-[#252525] rounded-lg transition-all"
                            title="Force refresh all monitors"
                        >
                            <FaRedo size={13} {...({ className: isLoading ? 'animate-spin' : '' } as any)} />
                        </button>
                        <div
                            className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#252525] rounded-lg px-1.5 py-0.5"
                            title={isAutoRefreshEnabled ? `Auto refresh every ${autoRefreshInterval}s` : 'Auto refresh disabled'}
                        >
                            <div className="relative w-6 h-6 flex items-center justify-center">
                                <svg className="w-5 h-5 rotate-[-90deg]">
                                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-200 dark:text-slate-800" />
                                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 8} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 8) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 8)} className={`${isAutoRefreshEnabled ? (autoRefreshMode === 'force' ? 'text-red-500' : 'text-blue-500') : 'text-slate-400'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                                </svg>
                                <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? (autoRefreshMode === 'force' ? 'bg-red-500 animate-pulse' : 'bg-blue-500 animate-pulse') : 'bg-slate-400'}`}></div>
                                </button>
                            </div>
                            <button
                                onClick={() => setAutoRefreshMode(m => (m === 'normal' ? 'force' : 'normal'))}
                                disabled={!isAutoRefreshEnabled}
                                className={`flex items-center justify-center w-6 h-6 rounded-md transition-all disabled:opacity-50 ${autoRefreshMode === 'force' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}
                                title={autoRefreshMode === 'force' ? "Auto force check" : "Auto list refresh"}
                            >
                                {autoRefreshMode === 'force' ? <FaRedo size={11} /> : <FaSyncAlt size={11} />}
                            </button>
                            <select
                                value={autoRefreshInterval}
                                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                                disabled={!isAutoRefreshEnabled}
                                className="bg-transparent text-[10px] font-bold text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-1 pl-0 min-w-[2.25rem]"
                            >
                                <option value={5}>5s</option>
                                <option value={10}>10s</option>
                                <option value={30}>30s</option>
                                <option value={60}>1m</option>
                                <option value={180}>3m</option>
                                <option value={300}>5m</option>
                            </select>
                        </div>
                        {checkStatus && (
                            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-[10px] font-medium">
                                <span className="text-blue-700 dark:text-blue-300 tabular-nums">
                                    {checkStatus.count}/{checkStatus.total}
                                </span>
                                {checkStatus.up > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400">✓{checkStatus.up}</span>
                                )}
                                {checkStatus.down > 0 && (
                                    <span className="text-red-600 dark:text-red-400">✗{checkStatus.down}</span>
                                )}
                                {checkStatus.error > 0 && (
                                    <span className="text-orange-600 dark:text-orange-400">⚠{checkStatus.error}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
            <div className="flex flex-col gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                        <FaServer {...({ className: "text-blue-600 dark:text-blue-400 text-xl" } as any)} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                            Monitoring Dashboard <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#333] text-slate-600 dark:text-slate-400">v2 (PostgreSQL)</span>
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Real-time status tracking for your services and endpoints
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-[#1e1e1e] p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333] w-full">
                    {/* Data Management Group */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#252525] p-1 rounded-xl">
                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => handleExportJSON(false)}
                                    className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-[#333]"
                                    title="Export monitors without history logs (smaller file)"
                                >
                                    <FaUpload size={14} />
                                </button>
                                <button
                                    onClick={() => handleExportJSON(true)}
                                    className="p-2 rounded-lg transition-all text-slate-400 hover:text-indigo-500 hover:bg-white dark:hover:bg-[#333]"
                                    title="Export monitors with uptime history logs (large file)"
                                >
                                    <FaFileExport size={14} />
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-lg transition-all text-slate-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-[#333]"
                                    title="Import Monitors (JSON)"
                                >
                                    <FaDownload size={14} />
                                </button>
                                <button
                                    onClick={() => setShowSMTPSettings(true)}
                                    className="p-2 rounded-lg transition-all text-slate-400 hover:text-orange-500 hover:bg-white dark:hover:bg-[#333]"
                                    title="SMTP Settings"
                                >
                                    <FaEnvelope size={14} />
                                </button>
                                <button
                                    onClick={toggleNotifications}
                                    className={`p-2 rounded-lg transition-all ${notificationsPaused ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-slate-400 hover:text-green-500 hover:bg-white dark:hover:bg-[#333]'}`}
                                    title={notificationsPaused ? "Email Notifications Paused - Click to Resume" : "Email Notifications Active - Click to Pause"}
                                >
                                    {notificationsPaused ? <FaBellSlash size={14} /> : <FaBell size={14} />}
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => void toggleBrowserNotifications()}
                            className={`p-2 rounded-lg transition-all ${
                                browserNotificationsEnabled
                                    ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'text-slate-400 hover:text-green-500 hover:bg-white dark:hover:bg-[#333]'
                            }`}
                            title={browserNotificationsEnabled ? 'Browser notifications on — click to turn off' : 'Browser notifications off — click to turn on'}
                            aria-label={browserNotificationsEnabled ? 'Turn off browser notifications' : 'Turn on browser notifications'}
                            aria-pressed={browserNotificationsEnabled}
                        >
                            <FaDesktop size={14} />
                        </button>

                        <button
                            onClick={() => setShowTileStyleModal(true)}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-purple-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Tile Style Settings"
                        >
                            <FaPalette size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSpeedTester(true)}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-cyan-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Internet speed test"
                        >
                            <FaTachometerAlt size={14} />
                        </button>
                        <button
                            onClick={() => setFullscreenMode(true)}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-indigo-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Enter Fullscreen"
                        >
                            <FaExpand size={14} />
                        </button>

                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => setShowCronModal(true)}
                                    className="p-2 rounded-lg transition-all text-slate-400 hover:text-purple-500 hover:bg-white dark:hover:bg-[#333]"
                                    title="Cron Setup"
                                >
                                    <FaClock size={14} />
                                </button>
                                <button
                                    onClick={handleDeleteAll}
                                    className="p-2 rounded-lg transition-all text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-[#333]"
                                    title="Delete All Monitors"
                                >
                                    <FaTrash size={14} />
                                </button>
                            </>
                        )}
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    {/* View Controls Group */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#252525] p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('tiles')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'tiles' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Grid Mode"
                        >
                            <FaThLarge size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('compact')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'compact' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Compact Bar Mode"
                        >
                            <FaBars size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('capsule')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'capsule' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Capsule Mode"
                        >
                            <FaCircle size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('status-bar')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'status-bar' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Status Bar Mode"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="2" y="4" width="20" height="4" rx="2" />
                                <rect x="2" y="10" width="20" height="4" rx="2" />
                                <rect x="2" y="16" width="20" height="4" rx="2" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('status-board')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'status-board' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Status Board (PHP Server Monitor style)"
                            aria-label="Status Board"
                            aria-pressed={viewMode === 'status-board'}
                        >
                            <StatusBoardToolbarIcon size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Kanban Mode"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="2" y="2" width="6" height="20" rx="1" />
                                <rect x="10" y="2" width="6" height="14" rx="1" />
                                <rect x="18" y="2" width="4" height="18" rx="1" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'timeline' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Timeline Mode"
                        >
                            <FaHistory size={14} />
                        </button>
                        <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Table Mode"
                        >
                            <FaList size={14} />
                        </button>
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    {/* Refresh Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refreshAll(false)}
                            className="flex items-center justify-center w-9 h-9 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-slate-100 dark:bg-[#252525] rounded-xl transition-all"
                            title="Refresh list (no checks)"
                        >
                            <FaSyncAlt size={14} {...({ className: isLoading ? 'animate-spin' : '' } as any)} />
                        </button>

                        <button
                            onClick={() => refreshAll(true)}
                            className="flex items-center justify-center w-9 h-9 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-slate-100 dark:bg-[#252525] rounded-xl transition-all"
                            title="Force refresh all monitors"
                        >
                            <FaRedo size={14} {...({ className: isLoading ? 'animate-spin' : '' } as any)} />
                        </button>

                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#252525] rounded-xl px-2 py-1">
                            <div className="relative w-7 h-7 flex items-center justify-center">
                                <svg className="w-6 h-6 rotate-[-90deg]">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-200 dark:text-slate-800" />
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 10) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 10)} className={`${isAutoRefreshEnabled ? (autoRefreshMode === 'force' ? 'text-red-500' : 'text-blue-500') : 'text-slate-400'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                                </svg>
                                <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? (autoRefreshMode === 'force' ? 'bg-red-500 animate-pulse' : 'bg-blue-500 animate-pulse') : 'bg-slate-400'}`}></div>
                                </button>
                            </div>
                            <button
                                onClick={() => setAutoRefreshMode(m => (m === 'normal' ? 'force' : 'normal'))}
                                disabled={!isAutoRefreshEnabled}
                                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all disabled:opacity-50 ${autoRefreshMode === 'force' ? 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300' : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'}`}
                                title={autoRefreshMode === 'force' ? "Auto-refresh mode: Force check (click to switch to normal refresh)" : "Auto-refresh mode: Normal refresh (click to switch to force check)"}
                            >
                                {autoRefreshMode === 'force' ? <FaRedo size={12} /> : <FaSyncAlt size={12} />}
                            </button>
                            <select
                                value={autoRefreshInterval}
                                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                                disabled={!isAutoRefreshEnabled}
                                className="bg-transparent text-[11px] font-bold text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-2 pl-0"
                            >
                                <option value={5}>5s</option>
                                <option value={10}>10s</option>
                                <option value={30}>30s</option>
                                <option value={60}>1m</option>
                                <option value={180}>3m</option>
                                <option value={300}>5m</option>
                            </select>
                        </div>
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    {isAdmin && (
                        <button
                            onClick={() => {
                                setSelectedMonitor(undefined);
                                setIsDuplicate(false);
                                setIsAddingNew(true);
                                setCreatedMonitorId(undefined);
                                setIsEditing(true);
                            }}
                            className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                            title="Add New Monitor"
                        >
                            <FaPlus size={14} />
                        </button>
                    )}
                </div>
            </div>
            )}

            {/* Check Status Display - Below toolbar, right corner (normal mode only) */}
            {!isFullscreen && checkStatus && (
                <div className="flex justify-end mb-2 transition-opacity duration-300">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-medium shadow-sm">
                        <span className="text-blue-700 dark:text-blue-300">
                            Checked: {checkStatus.count}/{checkStatus.total}
                        </span>
                        {checkStatus.up > 0 && (
                            <>
                                <span className="text-slate-400 dark:text-slate-500">•</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                    ✓ {checkStatus.up} UP
                                </span>
                            </>
                        )}
                        {checkStatus.down > 0 && (
                            <>
                                <span className="text-slate-400 dark:text-slate-500">•</span>
                                <span className="text-red-600 dark:text-red-400">
                                    ✗ {checkStatus.down} DOWN
                                </span>
                            </>
                        )}
                        {checkStatus.error > 0 && (
                            <>
                                <span className="text-slate-400 dark:text-slate-500">•</span>
                                <span className="text-orange-600 dark:text-orange-400">
                                    ⚠ {checkStatus.error} ERROR
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {dbError ? (
                <div className="flex flex-col items-center justify-center py-20 bg-amber-50 dark:bg-amber-950/30 rounded-3xl border-2 border-amber-200 dark:border-amber-800">
                    <div className="inline-flex w-16 h-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50 mb-6 text-3xl">
                        🗄️
                    </div>
                    <h2 className="text-xl font-bold text-amber-800 dark:text-amber-200 mb-2">Database unavailable</h2>
                    <p className="text-amber-700 dark:text-amber-300 mb-6 max-w-md text-center">
                        {dbError}
                    </p>
                    <button
                        onClick={() => { setDbError(null); setIsLoading(true); fetchMonitors(); }}
                        className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-colors inline-flex items-center gap-2"
                    >
                        <FaRedo size={14} /> Retry
                    </button>
                </div>
            ) : isLoading && monitors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                    <div className="text-slate-900 dark:text-white font-medium">Loading monitors...</div>
                </div>
            ) : monitors.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-[#1e1e1e] rounded-3xl border border-dashed border-slate-200 dark:border-[#333] shadow-sm">
                    <div className="inline-flex w-20 h-20 items-center justify-center rounded-full bg-slate-50 dark:bg-[#252525] mb-6 text-4xl">
                        📊
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No monitors configured</h2>
                    <p className="text-slate-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                        Track the uptime and performance of your websites, APIs, and servers.
                    </p>
                    {isAdmin ? (
                        <button
                            onClick={() => {
                                setSelectedMonitor(undefined);
                                setIsDuplicate(false);
                                setIsAddingNew(true);
                                setCreatedMonitorId(undefined);
                                setIsEditing(true);
                            }}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                        >
                            Create your first monitor
                        </button>
                    ) : (
                        <div className="text-sm text-slate-500 dark:text-gray-400">
                            You don’t have permission to create monitors. An admin can assign monitors for you to view here.
                        </div>
                    )}
                </div>
            ) : (
                <div className={isFullscreen ? 'space-y-4' : 'space-y-8'}>
                    {/* Tabs Navigation (hidden in kiosk; tabs live in slim bar) */}
                    {!isFullscreen && tabNames.length > 1 && (
                        <div className="flex flex-wrap gap-2 p-1.5 bg-white dark:bg-[#1e1e1e] rounded-2xl border border-slate-200 dark:border-[#333] mb-6 w-fit">
                            {tabNames.map(tab => (
                                <div
                                    key={tab}
                                    className={`relative group/tab flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'}`}
                                >
                                    {editingTabName === tab ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            value={tempTabName}
                                            onChange={(e) => setTempTabName(e.target.value)}
                                            onBlur={() => handleTabRename(tab)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleTabRename(tab)}
                                            className="w-24 bg-transparent border-b border-white outline-none text-sm font-bold p-0"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => setActiveTab(tab)}
                                            onDoubleClick={() => {
                                                setEditingTabName(tab);
                                                setTempTabName(tab);
                                            }}
                                            className="text-sm font-bold cursor-pointer"
                                        >
                                            {tab}
                                        </button>
                                    )}
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-[#252525] text-slate-400'}`}>
                                        {groupedByTabs[tab].length}
                                    </span>
                                    {/* Edit icon for tab visible on hover */}
                                    {activeTab === tab && editingTabName !== tab && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingTabName(tab);
                                                setTempTabName(tab);
                                            }}
                                            className="ml-1 opacity-0 group-hover/tab:opacity-100 transition-opacity text-white/70 hover:text-white"
                                            title="Rename Tab"
                                        >
                                            <FaEdit size={10} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div
                        className={
                            isAllTabsColumns
                                ? `grid gap-2 items-start ${
                                    displayTabSections.length <= 2
                                        ? 'grid-cols-1 lg:grid-cols-2'
                                        : displayTabSections.length === 3
                                            ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                                            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                                }`
                                : isAllTabsStacked
                                    ? 'space-y-4'
                                    : undefined
                        }
                    >
                    {displayTabSections.map(({ tab: sectionTab, groups, sortedGroupNames }) => (
                    <div
                        key={sectionTab}
                        className={
                            isFullscreen && fullscreenShowAllTabs
                                ? `space-y-3 rounded-2xl border border-slate-200/80 dark:border-[#333] p-3 shadow-sm ${
                                    isAllTabsColumns ? 'min-h-0 max-h-[calc(100vh-5.5rem)] overflow-y-auto' : ''
                                }`
                                : undefined
                        }
                        style={
                            isFullscreen && fullscreenShowAllTabs
                                ? viewMode === 'status-board'
                                    ? { backgroundColor: '#000', color: '#d0d0d0' }
                                    : { backgroundColor: sectionBoxBg, color: sectionBoxText }
                                : undefined
                        }
                    >
                    {isFullscreen && fullscreenShowAllTabs && (
                        <div
                            className={`sticky ${isAllTabsColumns ? 'top-0' : 'top-14'} z-[5] flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm bg-slate-100/95 dark:bg-[#252525]/95 border-slate-200 dark:border-[#333]`}
                            style={{ color: sectionBoxText }}
                        >
                            <h2
                                className="text-sm font-black uppercase tracking-[0.15em]"
                                style={{ color: sectionBoxText }}
                            >
                                {sectionTab}
                            </h2>
                            <span
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-[#333]"
                                style={{ color: sectionBoxText }}
                            >
                                {Object.values(groups).reduce((n, g) => n + g.length, 0)}
                            </span>
                            <div className="h-px flex-1 bg-current opacity-20" />
                        </div>
                    )}

                    {viewMode === 'status-board' ? (
                        <MonitorStatusBoard
                            monitors={sortedGroupNames.flatMap((name) => groups[name] || [])}
                            tileStyles={tileStyles}
                            showTitle={!isFullscreen || !fullscreenShowAllTabs}
                            compact={isAllTabsColumns}
                            onMonitorClick={handleTileClick}
                        />
                    ) : (
                    sortedGroupNames.map((groupName, groupIndex) => (
                        <div key={`${sectionTab}::${groupName}`} className={isFullscreen ? 'space-y-2' : 'space-y-4'}>
                            <div className={`flex items-center gap-4 ${isFullscreen ? '' : 'group/header'}`}>
                                {editingGroupName === groupName && !isFullscreen ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={tempGroupName}
                                        onChange={(e) => setTempGroupName(e.target.value)}
                                        onBlur={() => handleGroupRename(groupName)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleGroupRename(groupName)}
                                        className="text-sm font-black uppercase tracking-[0.2em] bg-transparent border-b border-blue-500 outline-none w-48 text-slate-900 dark:text-white"
                                    />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <h3
                                            className={`text-sm font-black uppercase tracking-[0.2em] whitespace-nowrap ${
                                                isFullscreen && fullscreenShowAllTabs
                                                    ? ''
                                                    : `text-slate-400 dark:text-slate-500 ${isFullscreen ? '' : 'cursor-pointer hover:text-blue-500 transition-colors'}`
                                            }`}
                                            style={
                                                isFullscreen && fullscreenShowAllTabs
                                                    ? { color: sectionBoxText }
                                                    : undefined
                                            }
                                            onDoubleClick={() => {
                                                if (isFullscreen) return;
                                                setEditingGroupName(groupName);
                                                setTempGroupName(groupName);
                                            }}
                                        >
                                            {groupName}
                                        </h3>
                                        {!isFullscreen && (
                                        <button
                                            onClick={() => {
                                                setEditingGroupName(groupName);
                                                setTempGroupName(groupName);
                                            }}
                                            className="opacity-0 group-hover/header:opacity-100 transition-opacity text-slate-400 hover:text-blue-500"
                                            title="Rename Group"
                                        >
                                            <FaEdit size={12} />
                                        </button>
                                        )}
                                    </div>
                                )}
                                <div className="h-px w-full bg-slate-200 dark:bg-[#252525]"></div>
                            </div>


                            {viewMode === 'capsule' ? (
                                <div className="flex flex-wrap gap-2">
                                    {groups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={withMonitorEntranceStyle(animationClass, index, {
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileStyle(monitor.last_status) : {}),
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning'
                                                    ? { borderColor: getTileBorderColor(monitor.last_status), fontFamily: getTileFontFamily(monitor.last_status) }
                                                    : {})
                                            }, groupIndex)}
                                            className={`inline-flex items-center gap-3 px-4 py-2 rounded-full border cursor-pointer transition-all hover:shadow-lg group relative ${monitorAnimClass} ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'bg-white dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333]'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span
                                                    className="font-semibold text-sm truncate"
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : { color: 'inherit' }}
                                                >
                                                    {monitor.name}
                                                </span>
                                                {renderEmailIndicators(monitor, 11)}
                                                <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                                                    <FaClock size={10} {...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? { style: getTileTextStyle(monitor.last_status) } : {})} />
                                                    <span style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : { color: 'inherit' }}>
                                                        {monitor.last_response_time !== null && monitor.last_response_time !== undefined ? `${monitor.last_response_time}ms` : '-'}
                                                    </span>
                                                </div>
                                                <span
                                                    className="text-xs opacity-70"
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : { color: 'inherit' }}
                                                >
                                                    {formatLastChecked(monitor.last_checked_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (viewMode === 'tiles' || viewMode === 'compact') ? (
                                <div className={tileGridClass}>
                                    {groups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={withMonitorEntranceStyle(animationClass, index, {
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileStyle(monitor.last_status) : {}),
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning'
                                                    ? { borderColor: getTileBorderColor(monitor.last_status), fontFamily: getTileFontFamily(monitor.last_status) }
                                                    : {}),
                                                borderRadius: tileStyles.borderRadius,
                                            }, groupIndex)}
                                            className={`border rounded-2xl shadow-lg hover:shadow-xl transition-all group relative cursor-pointer min-w-0 ${monitorAnimClass}
                                                ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'bg-white dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]'}
                                                ${viewMode === 'tiles' ? 'p-5' : 'p-3 flex flex-col justify-between min-h-[120px]'}
                                                ${moveMenuId === monitor.id ? 'z-[60]' : 'z-10 hover:z-20'}`}
                                        >
                                            {/* Top Right Controls - Frequently Used */}
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 z-10">
                                                <button
                                                    onClick={() => handleCheckNow(monitor.id)}
                                                    disabled={checkingId === monitor.id}
                                                    className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${checkingId === monitor.id ? 'animate-spin' : ''} ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                    title="Check Now"
                                                >
                                                    <FaRedo size={10} />
                                                </button>
                                                {isAdmin && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedMonitor(monitor);
                                                                setIsDuplicate(false);
                                                                setIsAddingNew(false);
                                                                setCreatedMonitorId(undefined);
                                                                setIsEditing(true);
                                                            }}
                                                            className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                            title="Edit"
                                                        >
                                                            <FaEdit size={10} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(monitor.id)}
                                                            className={`p-1.5 rounded-lg hover:bg-red-800 hover:text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400'}`}
                                                            title="Delete"
                                                        >
                                                            <FaTrash size={10} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            {/* Bottom Left Controls - Secondary Actions */}
                                            {isAdmin && (
                                                <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform -translate-y-1 group-hover:translate-y-0 z-10">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleExportMonitor(monitor); }}
                                                        className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                        title="Export to JSON"
                                                    >
                                                        <FaFileExport size={10} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDuplicate(monitor); }}
                                                        className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                        title="Duplicate"
                                                    >
                                                        <FaCopy size={10} />
                                                    </button>
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setMoveMenuId(moveMenuId === monitor.id ? null : monitor.id); }}
                                                            className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400'}`}
                                                            title="Move to Tab/Group"
                                                        >
                                                            <FaArrowsAlt size={10} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className={`flex items-start gap-3 ${viewMode === 'tiles' ? 'mb-5' : 'mb-2'}`}>
                                                <div className={`${viewMode === 'tiles' ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-sm'} rounded-xl flex items-center justify-center ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-white/20' : 'bg-slate-100 dark:bg-[#2a2a2a]'} ${monitor.last_status === 'down' || monitor.last_status === 'warning' || monitor.last_status === 'up' ? 'border border-white/30' : 'border border-slate-200 dark:border-[#444]'}`}>
                                                    {React.cloneElement(getTypeIcon(monitor.type), {
                                                        style: monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : undefined,
                                                        size: viewMode === 'tiles' ? 18 : 14
                                                    })}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3
                                                        className={`font-bold leading-tight truncate ${viewMode === 'tiles' ? 'text-base mb-1' : 'text-xs mb-0.5'} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-900 dark:text-white'}`}
                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                        title={monitor.name}
                                                    >
                                                        {monitor.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {viewMode === 'tiles' ? (
                                                            <div
                                                                className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full inline-flex ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-white/20' : 'text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-[#252525]'}`}
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                            >
                                                                {React.cloneElement(getStatusIcon(monitor.last_status) as React.ReactElement, {
                                                                    style: monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : undefined,
                                                                    size: 10
                                                                })}
                                                                <span className="uppercase font-extrabold tracking-widest">
                                                                    {monitor.last_status || 'UNKNOWN'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className="text-[9px] font-black uppercase tracking-wider"
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                            >
                                                                {monitor.last_status || 'UNKNOWN'}
                                                            </div>
                                                        )}
                                                        {isInMaintenance(monitor) && (
                                                            <div
                                                                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-amber-500/30 text-white border border-white/30' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'}`}
                                                                title={`Maintenance until ${new Date((monitor.maintenance_end || 0) * 1000).toLocaleString()}`}
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                <span className="uppercase font-bold tracking-wider">Maintenance</span>
                                                            </div>
                                                        )}
                                                        {renderEmailIndicators(monitor, viewMode === 'tiles' ? 10 : 9)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={`${viewMode === 'tiles' ? 'mb-5' : 'mb-3'} min-w-0`}>
                                                <div
                                                    className={`${viewMode === 'tiles' ? 'text-[11px] pl-3 pr-1.5 h-9' : 'text-[9px] pl-1.5 pr-0.5 h-7'} flex items-center min-w-0 rounded-xl border ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/20 border-white/10' : 'text-slate-600 dark:text-gray-400 bg-slate-50 dark:bg-[#252525] border-slate-100 dark:border-[#333]'}`}
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.9 } : {}}
                                                >
                                                    <MonitorTargetLabel
                                                        target={monitor.target}
                                                        port={monitor.port}
                                                        variant="tile"
                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : undefined}
                                                    />
                                                </div>
                                            </div>

                                            <div
                                                className={`flex flex-col gap-1 ${viewMode === 'tiles' ? 'pt-4 border-t' : 'pt-2'} ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? (viewMode === 'tiles' ? 'border-white/20' : '') : 'border-slate-100 dark:border-[#333] text-slate-500 dark:text-gray-500'}`}
                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.8 } : {}}
                                            >
                                                <div className="flex items-center justify-between text-[10px] font-bold">
                                                    <div className="flex items-center gap-1.5" title="Last Response Time">
                                                        <FaClock size={10} style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.6 } : {}} {...({ className: monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'text-blue-500' } as any)} />
                                                        {monitor.last_response_time !== null && monitor.last_response_time !== undefined ? `${monitor.last_response_time}ms` : '-'}
                                                    </div>
                                                    <div className="opacity-70">
                                                        {monitor.interval}m
                                                    </div>
                                                </div>
                                                <div
                                                    className={`text-[9px] text-right font-medium ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'text-slate-400 dark:text-gray-600'}`}
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.6 } : {}}
                                                >
                                                    {formatLastChecked(monitor.last_checked_at)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : viewMode === 'status-bar' ? (
                                <div className="space-y-2">
                                    {groups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={withMonitorEntranceStyle(animationClass, index, {
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileStyle(monitor.last_status) : {})
                                            }, groupIndex)}
                                            className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all hover:shadow-lg group ${monitorAnimClass} ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333]'}`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-[#252525]'}`}>
                                                {React.cloneElement(getTypeIcon(monitor.type), {
                                                    size: 18,
                                                    style: monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : undefined
                                                })}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span
                                                        className={`font-bold text-sm truncate ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-900 dark:text-white'}`}
                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                    >
                                                        {monitor.name}
                                                    </span>
                                                    {renderEmailIndicators(monitor, 10)}
                                                </div>
                                                <div className="flex items-center gap-4 text-xs min-w-0">
                                                    <MonitorTargetLabel
                                                        target={monitor.target}
                                                        port={monitor.port}
                                                        variant="inline"
                                                        as="code"
                                                        className={`px-2 py-0.5 rounded ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400'}`}
                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.8 } : {}}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6 flex-shrink-0">
                                                <div className={`flex items-center gap-2 text-sm font-medium ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-700 dark:text-slate-300'}`} style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}>
                                                    <FaClock size={12} />
                                                    {monitor.last_response_time !== null && monitor.last_response_time !== undefined ? `${monitor.last_response_time}ms` : '-'}
                                                </div>
                                                <div
                                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase ${monitor.last_status === 'up' ? 'bg-white/20' : monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                >
                                                    <div className={`w-2 h-2 rounded-full ${monitor.last_status === 'up' ? 'bg-white animate-pulse' : monitor.last_status === 'down' ? 'bg-white animate-pulse' : 'bg-slate-400'}`}></div>
                                                    {monitor.last_status || 'UNKNOWN'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : viewMode === 'kanban' ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {['up', 'down', 'warning'].map((status) => {
                                        const statusMonitors = groups[groupName].filter(m => m.last_status === status || (status === 'warning' && !m.last_status));
                                        return (
                                            <div key={status} className="space-y-3">
                                                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm uppercase ${status === 'up' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : status === 'down' ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                                    <div className={`w-2 h-2 rounded-full ${status === 'up' ? 'bg-emerald-500' : status === 'down' ? 'bg-red-500' : 'bg-slate-400'}`}></div>
                                                    {status} ({statusMonitors.length})
                                                </div>
                                                <div className="space-y-2">
                                                    {statusMonitors.map((monitor, index) => (
                                                        <div
                                                            key={monitor.id}
                                                            onClick={(e) => handleTileClick(e, monitor)}
                                                            style={withMonitorEntranceStyle(animationClass, index, {
                                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileStyle(monitor.last_status) : {})
                                                            }, groupIndex)}
                                                            className={`p-3 rounded-xl cursor-pointer transition-all hover:shadow-lg ${monitorAnimClass} ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333]'}`}
                                                        >
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span
                                                                    className={`font-bold text-xs truncate ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-900 dark:text-white'}`}
                                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                                >
                                                                    {monitor.name}
                                                                </span>
                                                                {renderEmailIndicators(monitor, 9)}
                                                            </div>
                                                            <div className={`flex items-center gap-2 text-xs ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-600 dark:text-slate-400'}`} style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.8 } : {}}>
                                                                <FaClock size={10} />
                                                                {monitor.last_response_time !== null && monitor.last_response_time !== undefined ? `${monitor.last_response_time}ms` : '-'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : viewMode === 'timeline' ? (
                                <div className="space-y-1">
                                    {groups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={withMonitorEntranceStyle(animationClass, index, {}, groupIndex)}
                                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-[#252525] group ${fullAnimClass}`}
                                        >
                                            <div className="flex items-center gap-2 w-[280px] flex-shrink-0">
                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${monitor.last_status === 'up' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : monitor.last_status === 'down' ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                                    {React.cloneElement(getTypeIcon(monitor.type), { size: 12 })}
                                                </div>
                                                <span className="font-semibold text-xs text-slate-900 dark:text-white truncate" title={monitor.name}>
                                                    {monitor.name}
                                                </span>
                                                {renderEmailIndicators(monitor, 8)}
                                            </div>

                                            <div
                                                className="flex-1 h-10 px-4 min-w-[200px] opacity-50 group-hover:opacity-100 transition-opacity relative"
                                                title={monitor.history && monitor.history.length > 1 ? (() => {
                                                    const diff = monitor.history[monitor.history.length - 1].checked_at - monitor.history[0].checked_at;
                                                    const mins = Math.round(diff / 60);
                                                    return mins < 60 ? `History: Last ${mins} mins` : `History: Last ${(mins / 60).toFixed(1)} hours`;
                                                })() : 'History'}
                                            >
                                                {monitor.history && monitor.history.length > 0 ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={monitor.history}>
                                                            <defs>
                                                                <linearGradient id={`gradient-history-${monitor.id}`} x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor={monitor.last_status === 'up' ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                                                                    <stop offset="95%" stopColor={monitor.last_status === 'up' ? '#10b981' : '#ef4444'} stopOpacity={0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <Area
                                                                type="monotone"
                                                                dataKey="response_time"
                                                                stroke={monitor.last_status === 'up' ? '#10b981' : '#ef4444'}
                                                                fill={`url(#gradient-history-${monitor.id})`}
                                                                strokeWidth={2}
                                                                isAnimationActive={false}
                                                            />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div className={`w-full h-1.5 mt-4 rounded-full ${monitor.last_status === 'up' ? 'bg-emerald-500' : monitor.last_status === 'down' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 flex-shrink-0 justify-end w-[240px]">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 min-w-0">
                                                    <MonitorTargetLabel
                                                        target={monitor.target}
                                                        port={monitor.port}
                                                        variant="compact"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                    <FaClock size={10} />
                                                    {monitor.last_response_time !== null && monitor.last_response_time !== undefined ? `${monitor.last_response_time}ms` : '-'}
                                                </div>
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 w-20 text-right">
                                                    {formatLastChecked(monitor.last_checked_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-[#1e1e1e] rounded-3xl border border-slate-200 dark:border-[#333] overflow-hidden shadow-xl overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[800px]">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-[#252525] text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                                                <th className="px-6 py-4">Monitor</th>
                                                <th className="px-6 py-4">Email</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4">Target</th>
                                                <th className="px-6 py-4">Response Time</th>
                                                <th className="px-6 py-4">Last Checked</th>
                                                <th className="px-6 py-4">Interval</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-[#333]">
                                            {groups[groupName].map((monitor, index) => (
                                                <tr
                                                    key={monitor.id}
                                                    onClick={(e) => handleTileClick(e, monitor)}
                                                    className={`group cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252525] transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : ''} ${fullAnimClass}`}
                                                    style={withMonitorEntranceStyle(animationClass, index, {
                                                        ...(monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileStyle(monitor.last_status) : {})
                                                    }, groupIndex)}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-[#2a2a2a] text-slate-500'}`}>
                                                                {React.cloneElement(getTypeIcon(monitor.type), {
                                                                    size: 14,
                                                                    style: monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : undefined
                                                                })}
                                                            </div>
                                                            <span
                                                                className={`font-bold text-sm ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-900 dark:text-white'}`}
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                            >
                                                                {monitor.name}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {renderEmailIndicators(monitor, 12) || (
                                                            <span className="text-xs text-slate-400 dark:text-slate-600">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div
                                                            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${monitor.last_status === 'up' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : (monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')}`}
                                                            style={monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        >
                                                            <div className={`w-1.5 h-1.5 rounded-full ${monitor.last_status === 'up' ? 'bg-emerald-500 animate-pulse' : (monitor.last_status === 'down' ? 'bg-white animate-pulse' : 'bg-slate-400')}`}></div>
                                                            {monitor.last_status || 'UNKNOWN'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 max-w-xs">
                                                        <MonitorTargetLabel
                                                            target={monitor.target}
                                                            port={monitor.port}
                                                            variant="table"
                                                            as="code"
                                                            className={`text-[11px] px-2 py-1 rounded-md ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#252525]'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.9 } : {}}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div
                                                            className={`flex items-center gap-1.5 text-sm font-medium ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-700 dark:text-slate-300'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        >
                                                            <FaClock size={12} style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.6 } : {}} {...({ className: monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? '' : 'text-slate-400' } as any)} />
                                                            {monitor.last_response_time !== null && monitor.last_response_time !== undefined ? `${monitor.last_response_time}ms` : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span
                                                            className={`text-xs ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-500 dark:text-slate-400'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.8 } : {}}
                                                        >
                                                            {formatLastChecked(monitor.last_checked_at)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span
                                                            className={`text-xs font-bold ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-500 dark:text-slate-400'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.8 } : {}}
                                                        >
                                                            {monitor.interval}m
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleCheckNow(monitor.id)}
                                                                disabled={checkingId === monitor.id}
                                                                className={`p-2 rounded-xl transition-colors ${checkingId === monitor.id ? 'animate-spin' : ''} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                                title="Check Now"
                                                            >
                                                                <FaRedo size={12} />
                                                            </button>
                                                            {isAdmin && (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleExportMonitor(monitor); }}
                                                                        className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-green-500'}`}
                                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                                        title="Export to JSON"
                                                                    >
                                                                        <FaFileExport size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDuplicate(monitor); }}
                                                                        className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                                        title="Duplicate"
                                                                    >
                                                                        <FaCopy size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedMonitor(monitor);
                                                                            setIsDuplicate(false);
                                                                            setIsAddingNew(false);
                                                                            setCreatedMonitorId(undefined);
                                                                            setIsEditing(true);
                                                                        }}
                                                                        className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                                    >
                                                                        <FaEdit size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(monitor.id)}
                                                                        className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? 'bg-black/40 hover:bg-red-800' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-red-500'}`}
                                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' || monitor.last_status === 'warning' ? getTileTextStyle(monitor.last_status) : {}}
                                                                    >
                                                                        <FaTrash size={12} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))
                    )}
                    </div>
                    ))}
                    </div>
                </div>
            )}


            {isEditing && (
                <MonitorForm
                    monitor={isAddingNew ? undefined : selectedMonitor}
                    onSave={handleSave}
                    onCancel={() => {
                        setIsEditing(false);
                        setIsDuplicate(false);
                        setIsAddingNew(false);
                        setSelectedMonitor(undefined);
                        setCreatedMonitorId(undefined);
                    }}
                    isAddingNew={isAddingNew}
                    createdMonitorId={createdMonitorId}
                />
            )}

            {/* Move Monitor Dialog */}
            {isAdmin && moveMenuId !== null && (() => {
                const monitorToMove = monitors.find(m => m.id === moveMenuId);
                if (!monitorToMove) return null;

                // Get all unique groups from all tabs for the move dialog
                const groupSet = new Set<string>();
                monitors.forEach(m => {
                    const group = m.group_name || 'Other';
                    groupSet.add(group);
                });
                const allGroups = Array.from(groupSet).sort((a, b) => {
                    if (a === 'Other') return 1;
                    if (b === 'Other') return -1;
                    return a.localeCompare(b);
                });

                return (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setMoveMenuId(null)}>
                        <div
                            className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-[#333] flex items-center justify-between bg-slate-50 dark:bg-[#252525]">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${monitorToMove.last_status === 'up' ? 'bg-emerald-500/10 text-emerald-500' :
                                        monitorToMove.last_status === 'down' ? 'bg-red-500/10 text-red-500' :
                                            'bg-slate-500/10 text-slate-500'
                                        }`}>
                                        {getTypeIcon(monitorToMove.type)}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Move Monitor</h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{monitorToMove.name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setMoveMenuId(null)}
                                    className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-500"
                                >
                                    <FaTimes size={18} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Move to Tab Section */}
                                <div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                                        Move to Tab
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {tabNames.map(t => (
                                            <button
                                                key={t}
                                                onClick={() => {
                                                    handleMoveMonitor(monitorToMove.id, { tab_name: t });
                                                    setMoveMenuId(null);
                                                }}
                                                className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all ${monitorToMove.tab_name === t
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 ring-2 ring-blue-500'
                                                    : 'bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-200 dark:border-[#333]'
                                                    }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Move to Group Section */}
                                <div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                                        Move to Group
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {allGroups.map(g => (
                                            <button
                                                key={g}
                                                onClick={() => {
                                                    handleMoveMonitor(monitorToMove.id, { group_name: g });
                                                    setMoveMenuId(null);
                                                }}
                                                className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all ${monitorToMove.group_name === g
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 ring-2 ring-blue-500'
                                                    : 'bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-200 dark:border-[#333]'
                                                    }`}
                                            >
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#252525] flex justify-end">
                                <button
                                    onClick={() => setMoveMenuId(null)}
                                    className="px-5 py-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-300 dark:border-[#444] font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {viewingLogsMonitor && (
                <div className="fixed inset-0 z-[100] bg-transparent flex items-center justify-center overflow-hidden">
                    <div
                        style={{
                            position: 'absolute',
                            left: `${modalStyle.x}px`,
                            top: `${modalStyle.y}px`,
                            width: `${modalStyle.width}px`,
                            height: `${modalStyle.height}px`,
                        }}
                        className={`${animationClass} bg-white dark:bg-[#1a1a1a] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-[#333] select-none`}
                    >
                        {/* Header - Grabbable for dragging */}
                        <div
                            onMouseDown={handleMouseDown}
                            className="p-6 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-slate-50/50 dark:bg-[#202020]/50 cursor-grab active:cursor-grabbing"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${viewingLogsMonitor.last_status === 'up' ? 'bg-emerald-500/10 text-emerald-500' : viewingLogsMonitor.last_status === 'down' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                    <FaHistory size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Uptime History</h2>
                                    <p className="text-sm text-slate-500 dark:text-gray-400">Viewing logs for <span className="font-bold text-blue-500">{viewingLogsMonitor.name}</span></p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setViewingLogsMonitor(null)}
                                    className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-400"
                                >
                                    <FaTimes size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Filters Bar */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-white dark:bg-[#1a1a1a] flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <FaCalendarAlt {...({ className: "text-slate-400 mr-2" } as any)} />
                                    <div className="flex bg-slate-100 dark:bg-[#252525] p-1 rounded-xl">
                                        {[
                                            { id: '1d', label: 'Last 24h' },
                                            { id: '1w', label: 'Last 7 Days' },
                                            { id: '1m', label: 'Last 30 Days' },
                                            { id: 'custom', label: 'Custom' }
                                        ].map(filter => (
                                            <button
                                                key={filter.id}
                                                onClick={() => {
                                                    setDetailDayKey(null);
                                                    setLogFilter(filter.id as any);
                                                }}
                                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${logFilter === filter.id ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                            >
                                                {filter.label}
                                            </button>
                                        ))}
                                    </div>

                                    {logFilter === 'custom' && (
                                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#252525] p-1 rounded-xl animate-in fade-in slide-in-from-left-2 duration-300">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] uppercase font-black text-slate-400 px-1">From</span>
                                                <input
                                                    type="datetime-local"
                                                    value={customRange.from}
                                                    onChange={(e) => setCustomRange(prev => ({ ...prev, from: e.target.value }))}
                                                    className="bg-white dark:bg-[#333] text-[10px] font-bold text-slate-700 dark:text-slate-200 border-none rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] uppercase font-black text-slate-400 px-1">To</span>
                                                <input
                                                    type="datetime-local"
                                                    value={customRange.to}
                                                    onChange={(e) => setCustomRange(prev => ({ ...prev, to: e.target.value }))}
                                                    className="bg-white dark:bg-[#333] text-[10px] font-bold text-slate-700 dark:text-slate-200 border-none rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>

                                <div className="flex bg-slate-100 dark:bg-[#252525] p-1 rounded-xl">
                                    <button
                                        onClick={() => {
                                            setLastDetailView('chart');
                                            setHistoryViewMode('chart');
                                        }}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${historyViewMode === 'chart' ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <FaThLarge size={12} /> Chart
                                    </button>
                                    <button
                                        onClick={() => {
                                            setHistoryViewMode('calendar');
                                            setDetailDayKey(null);
                                            if (logFilter === '1d') setLogFilter('1m');
                                        }}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${historyViewMode === 'calendar' ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <FaCalendarAlt size={12} /> Calendar
                                    </button>
                                    <button
                                        onClick={() => {
                                            setLastDetailView('list');
                                            setHistoryViewMode('list');
                                        }}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${historyViewMode === 'list' ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <FaList size={12} /> List
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {isAdmin && (
                                    <>
                                        <select
                                            value={purgeKeepDays}
                                            onChange={(e) => setPurgeKeepDays(Number(e.target.value) as 0 | 1 | 7 | 30 | 365)}
                                            disabled={isPurgingLogs || isLogsLoading}
                                            className="bg-slate-100 dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
                                            title="Purge retention"
                                        >
                                            <option value={1}>Keep last 1 day</option>
                                            <option value={7}>Keep last 1 week</option>
                                            <option value={30}>Keep last 1 month</option>
                                            <option value={365}>Keep last 1 year</option>
                                            <option value={0}>Purge all</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => void handlePurgeHistory()}
                                            disabled={isPurgingLogs || isLogsLoading}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-all shadow-sm"
                                            title="Permanently delete uptime history for this monitor"
                                        >
                                            <FaTrash size={11} />
                                            {isPurgingLogs ? 'Purging…' : 'Purge'}
                                        </button>
                                        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                    </>
                                )}
                                <button
                                    onClick={() => viewingLogsMonitor && fetchLogs(viewingLogsMonitor.id, logFilter)}
                                    className="p-2 bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500 hover:text-blue-500"
                                    title="Refresh History"
                                    disabled={isLogsLoading}
                                >
                                    <FaRedo size={12} {...({ className: isLogsLoading ? 'animate-spin' : '' } as any)} />
                                </button>
                                <button
                                    onClick={handleExportHistoryJSON}
                                    className="p-2 bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500 hover:text-green-600"
                                    title="Export History (JSON)"
                                    disabled={logs.length === 0}
                                >
                                    <FaFileExport size={14} />
                                </button>
                                <button
                                    onClick={handleExportHistoryCSV}
                                    className="p-2 bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500 hover:text-teal-600"
                                    title="Export History (CSV)"
                                    disabled={(detailDayKey && historyViewMode !== 'calendar' ? detailLogs : logs).length === 0}
                                >
                                    <FaFileCsv size={14} />
                                </button>
                                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-[#252525] px-3 py-1.5 rounded-lg border border-slate-100 dark:border-[#333]">
                                    {detailDayKey && historyViewMode !== 'calendar' ? `${detailLogs.length} of ${logs.length} Checks` : `${logs.length} Checks Found`}
                                </div>
                            </div>
                        </div>

                        {/* Logs Content */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                            {isLogsLoading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-slate-500 dark:text-gray-400">Loading history...</p>
                                </div>
                            ) : logs.length === 0 && historyViewMode !== 'calendar' ? (
                                <div className="text-center py-20 bg-slate-50 dark:bg-[#202020] rounded-3xl border border-dashed border-slate-200 dark:border-[#333]">
                                    <p className="text-slate-500 dark:text-gray-400">No event logs found for this period.</p>
                                </div>
                            ) : historyViewMode === 'calendar' ? (
                                <MonitorUptimeCalendar
                                    logs={logs}
                                    intervalMinutes={viewingLogsMonitor.interval || 5}
                                    onSelectDay={(dayKey) => {
                                        setDetailDayKey(dayKey);
                                        setHistoryViewMode(lastDetailView);
                                    }}
                                />
                            ) : historyViewMode === 'chart' ? (
                                <div className="flex-1 w-full bg-slate-50/50 dark:bg-[#202020]/30 rounded-3xl p-6 border border-slate-100 dark:border-[#333] flex flex-col gap-4 min-h-0 h-full">
                                    {detailDayKey && (
                                        <MonitorUptimeDayBanner
                                            dayKey={detailDayKey}
                                            checkCount={detailLogs.length}
                                            onBackToCalendar={() => {
                                                setDetailDayKey(null);
                                                setHistoryViewMode('calendar');
                                            }}
                                            onShowFullRange={() => setDetailDayKey(null)}
                                        />
                                    )}
                                    <div className="flex-1 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={filteredChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.1} />
                                                <XAxis
                                                    dataKey="time"
                                                    hide={true}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                                                    unit="ms"
                                                />
                                                <Tooltip
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="bg-white dark:bg-[#1e1e1e] p-3 border border-slate-200 dark:border-[#333] rounded-xl shadow-xl pointer-events-none">
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{data.fullTime}</p>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-2 h-2 rounded-full ${data.status === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                                        <p className="text-sm font-bold dark:text-white">
                                                                            {data.status === 'up' ? `Latency: ${data.latency}ms` : 'SERVICE DOWN'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="latency"
                                                    stroke="#3b82f6"
                                                    strokeWidth={3}
                                                    fillOpacity={1}
                                                    fill="url(#colorLatency)"
                                                    animationDuration={1500}
                                                    connectNulls={false}
                                                />
                                                {filteredChartData.map((entry, index) => (
                                                    entry.status === 'down' ? (
                                                        <ReferenceLine
                                                            key={`down-${index}`}
                                                            x={entry.time}
                                                            stroke="#ef4444"
                                                            strokeWidth={2}
                                                            strokeDasharray="3 3"
                                                        />
                                                    ) : null
                                                ))}
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Histogram */}
                                    <div className="h-12 w-full shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={filteredChartData} margin={{ top: 0, right: 10, left: 35, bottom: 0 }}>
                                                <Tooltip
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="bg-white dark:bg-[#1e1e1e] p-2 border border-slate-200 dark:border-[#333] rounded-lg shadow-lg text-[10px] pointer-events-none">
                                                                    <p className="font-bold text-slate-400">{data.fullTime}</p>
                                                                    <p className={data.status === 'up' ? 'text-emerald-500' : 'text-red-500'}>
                                                                        Status: {data.status.toUpperCase()}
                                                                    </p>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar dataKey="val">
                                                    {filteredChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Zoom Area with Vertical Labels */}
                                    <div className="h-40 w-full shrink-0 mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData} margin={{ top: 0, right: 10, left: 35, bottom: 85 }}>
                                                <XAxis
                                                    dataKey="time"
                                                    interval={0}
                                                    angle={-90}
                                                    textAnchor="end"
                                                    dx={-5}
                                                    dy={5}
                                                    tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }}
                                                    tickFormatter={(time, index) => {
                                                        const item = chartData[index];
                                                        return item ? `${item.date} ${time}` : time;
                                                    }}
                                                />
                                                <Brush
                                                    dataKey="time"
                                                    height={30}
                                                    stroke="#3b82f6"
                                                    fill="transparent"
                                                    travellerWidth={10}
                                                    y={110}
                                                    onChange={(range: any) => {
                                                        if (range && typeof range.startIndex === 'number' && typeof range.endIndex === 'number') {
                                                            setBrushRange({
                                                                startIndex: range.startIndex,
                                                                endIndex: range.endIndex
                                                            });
                                                        } else {
                                                            setBrushRange(null);
                                                        }
                                                    }}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {detailDayKey && (
                                        <MonitorUptimeDayBanner
                                            dayKey={detailDayKey}
                                            checkCount={detailLogs.length}
                                            onBackToCalendar={() => {
                                                setDetailDayKey(null);
                                                setHistoryViewMode('calendar');
                                            }}
                                            onShowFullRange={() => setDetailDayKey(null)}
                                        />
                                    )}
                                    {(Object.entries(groupedLogs) as [string, MonitorLog[]][]).map(([date, dateLogs]) => (
                                        <div key={date} className="space-y-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="h-px flex-1 bg-slate-100 dark:bg-[#333]"></div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white dark:bg-[#1a1a1a] px-3">
                                                    {date}
                                                </span>
                                                <div className="h-px flex-1 bg-slate-100 dark:bg-[#333]"></div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2">
                                                {dateLogs.map(log => (
                                                    <div
                                                        key={log.id}
                                                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 dark:bg-[#202020]/50 border border-slate-100 dark:border-[#2a2a2a] hover:border-slate-200 dark:hover:border-[#333] transition-all"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-2.5 h-2.5 rounded-full ${log.status === 'up' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}></div>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                                                    {log.status === 'up' ? 'System Stable' : 'Service Down'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-500 dark:text-gray-500">
                                                                    {new Date(log.checked_at * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            {log.details && (
                                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#2a2a2a] text-slate-500 dark:text-gray-400 max-w-[200px] truncate">
                                                                    {log.details}
                                                                </span>
                                                            )}
                                                            <div className="flex flex-col items-end min-w-[60px]">
                                                                <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                                                                    {log.response_time}ms
                                                                </span>
                                                                <span className="text-[9px] uppercase tracking-tighter text-slate-400 font-bold">Latency</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="p-4 bg-slate-50 dark:bg-[#202020] border-t border-slate-100 dark:border-[#333] text-center relative">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                Auto-cleaning enabled: Logs older than 30 days are automatically pruned
                            </p>

                            {/* Resize Handle */}
                            <div
                                onMouseDown={handleResizeMouseDown}
                                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 group"
                            >
                                <div className="w-1.5 h-1.5 bg-slate-300 dark:bg-[#444] rounded-full group-hover:bg-blue-500 transition-colors"></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showSMTPSettings && (
                <SMTPSettingsModal onClose={() => setShowSMTPSettings(false)} />
            )}

            {showSpeedTester && (
                <InternetSpeedTester isOpen={showSpeedTester} onClose={() => setShowSpeedTester(false)} />
            )}

            {showTileStyleModal && (
                <MonitoringTileStyleModal
                    isOpen={showTileStyleModal}
                    onClose={() => setShowTileStyleModal(false)}
                    onStylesChange={handleTileStylesChange}
                    initialStyles={tileStyles}
                />
            )}

            {showCronModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e1e1e] rounded-3xl w-full max-w-2xl border border-slate-200 dark:border-[#333] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-[#333] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <FaClock size={20} {...({ className: "text-purple-500" } as any)} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Cron Setup</h2>
                                    <p className="text-sm text-slate-500">Automate your monitoring checks</p>
                                </div>
                            </div>
                            <button onClick={() => setShowCronModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500">
                                <FaTimes size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="p-4 bg-blue-50 dark:bg-blue-500/5 rounded-2xl border border-blue-100 dark:border-blue-500/20">
                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                    To keep your monitors updated automatically, you should set up a scheduled task (cron job).
                                    Run the following command every minute to execute all active monitor checks.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Linux (Cron)</h3>
                                    <div className="relative group">
                                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs overflow-x-auto break-all">
                                            {`* * * * * curl -X POST "${window.location.protocol}//${window.location.host}${window.location.pathname.replace(/\/[^/]*$/, '')}/api/monitors.php/check-all" -H "Authorization: Bearer linknest_secret_token_123"`}
                                        </div>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(`* * * * * curl -X POST "${window.location.protocol}//${window.location.host}${window.location.pathname.replace(/\/[^/]*$/, '')}/api/monitors.php/check-all" -H "Authorization: Bearer linknest_secret_token_123"`);
                                                alert('Command copied to clipboard!');
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <FaCopy size={12} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500">Add this to your crontab using <code className="bg-slate-100 dark:bg-[#333] px-1 rounded text-blue-500">crontab -e</code></p>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Windows (PowerShell)</h3>
                                    <div className="relative group">
                                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs overflow-x-auto break-all">
                                            {`$headers = @{ "Authorization" = "Bearer linknest_secret_token_123" }; Invoke-RestMethod -Method Post -Uri "${window.location.protocol}//${window.location.host}${window.location.pathname.replace(/\/[^/]*$/, '')}/api/monitors.php/check-all" -Headers $headers`}
                                        </div>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(`$headers = @{ "Authorization" = "Bearer linknest_secret_token_123" }; Invoke-RestMethod -Method Post -Uri "${window.location.protocol}//${window.location.host}${window.location.pathname.replace(/\/[^/]*$/, '')}/api/monitors.php/check-all" -Headers $headers`);
                                                alert('Command copied to clipboard!');
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <FaCopy size={12} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500">Schedule this in Task Scheduler as a PowerShell script.</p>
                                </div>
                            </div>

                            <div className="p-4 bg-amber-50 dark:bg-amber-500/5 rounded-2xl border border-amber-100 dark:border-amber-500/20">
                                <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-2">
                                    <FaQuestion size={10} /> Note on Security
                                </h4>
                                <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                                    The <code className="font-mono">linknest_secret_token_123</code> is the default system token. You should change this in <code className="font-mono">api/config.php</code> for better security if your dashboard is public.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 dark:bg-[#252525] border-t border-slate-100 dark:border-[#333] flex justify-end">
                            <button onClick={() => setShowCronModal(false)} className="px-6 py-2.5 bg-slate-200 dark:bg-[#333] hover:bg-slate-300 dark:hover:bg-[#444] text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all active:scale-95">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (isFullscreen) {
        return typeof document !== 'undefined'
            ? createPortal(
                <div className={`fixed inset-0 overflow-y-auto transition-colors z-[200] ${viewMode === 'status-board' ? 'bg-black' : 'bg-slate-50 dark:bg-[#121212]'}`}>
                    <div className="min-h-full p-2 sm:p-3">
                        {content}
                    </div>
                </div>,
                document.body
            )
            : null;
    }

    return <>{content}</>;
};
