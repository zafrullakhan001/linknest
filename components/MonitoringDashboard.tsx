import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Monitor, MonitorLog, monitoringService } from '../services/monitoringService';
import { MonitorForm } from './MonitorForm';
import { FaServer, FaGlobe, FaSearch, FaCheck, FaTimes, FaQuestion, FaPlus, FaRedo, FaTrash, FaEdit, FaClock, FaThLarge, FaList, FaCopy, FaBars, FaDownload, FaUpload, FaHistory, FaCalendarAlt, FaEnvelope, FaFileCsv, FaArrowsAlt, FaPalette, FaCircle, FaExpand, FaCompress } from 'react-icons/fa';
import { useTileAnimation, getTileAnimationClass, getTileDecorationClass } from './TileAnimationSelector';
import { SMTPSettingsModal } from './SMTPSettingsModal';
import { MonitoringTileStyleModal, TileStyle } from './MonitoringTileStyleModal';
import { userPreferencesService } from '../services/userPreferencesService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush, BarChart, Bar, Cell } from 'recharts';

export const MonitoringDashboard: React.FC = () => {
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedMonitor, setSelectedMonitor] = useState<Monitor | undefined>(undefined);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [viewingLogsMonitor, setViewingLogsMonitor] = useState<Monitor | null>(null);
    const [logs, setLogs] = useState<MonitorLog[]>([]);
    const [logFilter, setLogFilter] = useState<'1d' | '1w' | '1m' | 'custom'>('1d');
    const [customRange, setCustomRange] = useState<{ from: string, to: string }>({
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        to: new Date().toISOString().slice(0, 16)
    });
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const [checkingId, setCheckingId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'tiles' | 'grid' | 'compact' | 'capsule'>(() => {
        const saved = localStorage.getItem('linknest_monitor_view_mode');
        return (saved === 'tiles' || saved === 'grid' || saved === 'compact' || saved === 'capsule') ? saved : 'tiles';
    });
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // Default 30s
    const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);
    const [refreshCountdown, setRefreshCountdown] = useState<number>(30);
    const { animation, decoration } = useTileAnimation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<string>(() => {
        const saved = localStorage.getItem('linknest_monitor_active_tab');
        return saved || 'General';
    });
    const [showSMTPSettings, setShowSMTPSettings] = useState(false);
    const [showCronModal, setShowCronModal] = useState(false);
    const [showTileStyleModal, setShowTileStyleModal] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
        const saved = localStorage.getItem('linknest_monitor_fullscreen');
        return saved === 'true';
    });
    const csvInputRef = useRef<HTMLInputElement>(null);
    
    // Tile styles state
    const defaultTileStyles: TileStyle = {
        upBackgroundColor: '#10b981',
        upTextColor: '#ffffff',
        upUseGradient: false,
        upGradientStart: '#10b981',
        upGradientEnd: '#059669',
        downBackgroundColor: '#dc2626',
        downTextColor: '#ffffff',
        downUseGradient: false,
        downGradientStart: '#dc2626',
        downGradientEnd: '#b91c1c',
    };
    
    const [tileStyles, setTileStyles] = useState<TileStyle>(defaultTileStyles);
    const [moveMenuId, setMoveMenuId] = useState<number | null>(null);
    const [editingTabName, setEditingTabName] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
    const [tempTabName, setTempTabName] = useState('');
    const [tempGroupName, setTempGroupName] = useState('');
    const [historyViewMode, setHistoryViewMode] = useState<'list' | 'chart'>('chart');
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

    const fetchMonitors = useCallback(async () => {
        try {
            const data = await monitoringService.getMonitors();
            setMonitors(data);
        } catch (error) {
            console.error('Failed to load monitors', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshAll = useCallback(async (isFullCheck = false) => {
        setIsLoading(true);
        try {
            if (isFullCheck) {
                await monitoringService.checkAllMonitors();
            }
            await fetchMonitors();
        } catch (error) {
            console.error('Failed to refresh monitors', error);
        } finally {
            setIsLoading(false);
        }
    }, [fetchMonitors]);

    useEffect(() => {
        fetchMonitors();
        loadTileStyles();
    }, [fetchMonitors]);
    
    const loadTileStyles = useCallback(async () => {
        try {
            const preferences = await userPreferencesService.getPreferences();
            const loadedStyles: TileStyle = {
                upBackgroundColor: preferences['monitor_tile_up_bg'] as string || defaultTileStyles.upBackgroundColor,
                upTextColor: preferences['monitor_tile_up_text'] as string || defaultTileStyles.upTextColor,
                upUseGradient: preferences['monitor_tile_up_gradient'] === 'true' || preferences['monitor_tile_up_gradient'] === true,
                upGradientStart: preferences['monitor_tile_up_gradient_start'] as string || defaultTileStyles.upGradientStart,
                upGradientEnd: preferences['monitor_tile_up_gradient_end'] as string || defaultTileStyles.upGradientEnd,
                downBackgroundColor: preferences['monitor_tile_down_bg'] as string || defaultTileStyles.downBackgroundColor,
                downTextColor: preferences['monitor_tile_down_text'] as string || defaultTileStyles.downTextColor,
                downUseGradient: preferences['monitor_tile_down_gradient'] === 'true' || preferences['monitor_tile_down_gradient'] === true,
                downGradientStart: preferences['monitor_tile_down_gradient_start'] as string || defaultTileStyles.downGradientStart,
                downGradientEnd: preferences['monitor_tile_down_gradient_end'] as string || defaultTileStyles.downGradientEnd,
            };
            setTileStyles(loadedStyles);
        } catch (error) {
            console.error('Failed to load tile styles:', error);
            setTileStyles(defaultTileStyles);
        }
    }, []);
    
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
                        refreshAll(true); // Auto-refresh triggers a full check
                        return autoRefreshInterval;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isAutoRefreshEnabled, autoRefreshInterval, refreshAll]);

    // Reset countdown when interval changes
    useEffect(() => {
        setRefreshCountdown(autoRefreshInterval);
    }, [autoRefreshInterval]);

    const handleSave = async (data: Partial<Monitor>) => {
        try {
            if (selectedMonitor && !isDuplicate) {
                await monitoringService.updateMonitor(selectedMonitor.id, data);
            } else {
                await monitoringService.createMonitor(data);
            }
            setIsEditing(false);
            setIsDuplicate(false);
            fetchMonitors();
        } catch (error) {
            throw error;
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this monitor?')) return;
        try {
            await monitoringService.deleteMonitor(id);
            fetchMonitors();
        } catch (error) {
            console.error('Failed to delete monitor', error);
        }
    };

    const handleDuplicate = (monitor: Monitor) => {
        setSelectedMonitor(monitor);
        setIsDuplicate(true);
        setIsEditing(true);
    };

    const handleCheckNow = async (id: number) => {
        setCheckingId(id);
        try {
            await monitoringService.checkMonitor(id);
            fetchMonitors(); // Reload to get updated status
        } catch (error) {
            console.error('Failed to check monitor', error);
        } finally {
            setCheckingId(null);
        }
    };

    const handleExportJSON = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ monitors }, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `linknest_monitors_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleExportCSV = () => {
        const headers = ['name', 'type', 'target', 'port', 'keyword', 'interval', 'tab_name', 'group_name'];
        let rows = [];

        if (monitors.length > 0) {
            rows = monitors.map(m => [
                m.name,
                m.type,
                m.target,
                m.port || '',
                m.keyword || '',
                m.interval,
                m.tab_name || 'General',
                m.group_name || 'Other'
            ]);
        } else {
            // Template
            rows = [['Sample Monitor', 'url', 'https://google.com', '', '', '5', 'General', 'Other']];
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `linknest_monitors_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

    const handleExportHistoryCSV = () => {
        if (!logs.length || !viewingLogsMonitor) return;
        const headers = ['Timestamp', 'Status', 'Latency (ms)', 'Details'];
        const rows = logs.map(log => [
            new Date(log.checked_at * 1000).toLocaleString(),
            log.status.toUpperCase(),
            log.response_time,
            log.details || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `uptime_history_${viewingLogsMonitor.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleMoveMonitor = async (id: number, updates: { tab_name?: string, group_name?: string }) => {
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
        // Reset brush range when logs change or dialog closes
        setBrushRange(null);
    }, [logs]);

    useEffect(() => {
        // Reset brush range when dialog closes
        if (!viewingLogsMonitor) {
            setBrushRange(null);
        }
    }, [viewingLogsMonitor]);

    const groupedLogs = useMemo<Record<string, MonitorLog[]>>(() => {
        const groups: { [key: string]: MonitorLog[] } = {};
        logs.forEach(log => {
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
    }, [logs]);

    const chartData = useMemo(() => {
        return [...logs].reverse().map(log => {
            const dateObj = new Date(log.checked_at * 1000);
            return {
                time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                fullTime: dateObj.toLocaleString(),
                latency: log.status === 'up' ? log.response_time : 0,
                status: log.status,
                // For histogram/status bar
                val: 1, // Constant height for status bar
                color: log.status === 'up' ? '#10b981' : '#ef4444'
            };
        });
    }, [logs]);

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

    const monitorsInActiveTab = useMemo(() => groupedByTabs[activeTab] || [], [groupedByTabs, activeTab]);

    const groupedByGroups = useMemo<Record<string, Monitor[]>>(() => {
        const groups: { [key: string]: Monitor[] } = {};
        monitorsInActiveTab.forEach(m => {
            const group = m.group_name || 'Other';
            if (!groups[group]) groups[group] = [];
            groups[group].push(m);
        });
        return groups;
    }, [monitorsInActiveTab]);

    const sortedGroups = useMemo(() => Object.keys(groupedByGroups).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
    }), [groupedByGroups]);

    const handleTileClick = (e: React.MouseEvent, monitor: Monitor) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        setViewingLogsMonitor(monitor);
    };

    const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content);
                if (data.monitors && Array.isArray(data.monitors)) {
                    setIsLoading(true);
                    await monitoringService.importMonitors(data.monitors);
                    await fetchMonitors();
                    alert('Monitors imported successfully!');
                } else {
                    alert('Invalid file format. Must contain a "monitors" array.');
                }
            } catch (err) {
                console.error('Failed to import monitors', err);
                alert('Failed to import monitors. Please check the file format.');
            } finally {
                setIsLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                setIsLoading(true);
                const count = await monitoringService.importMonitorsFromCSV(content);
                await fetchMonitors();
                alert(`Successfully imported ${count} monitors!`);
            } catch (err) {
                console.error('Failed to import monitors (CSV)', err);
                alert('Failed to import monitors from CSV. Please check the file format.');
            } finally {
                setIsLoading(false);
                if (csvInputRef.current) csvInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleTabRename = async (oldName: string) => {
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

    const getStatusIcon = (status: string | null) => {
        switch (status) {
            case 'up': return <FaCheck {...({ className: "text-green-500" } as any)} />;
            case 'down': return <FaTimes {...({ className: "text-red-500" } as any)} />;
            default: return <FaQuestion {...({ className: "text-gray-500" } as any)} />;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'url': return <FaGlobe {...({ className: "text-blue-400" } as any)} />;
            case 'keyword': return <FaSearch {...({ className: "text-purple-400" } as any)} />;
            case 'port': return <FaServer {...({ className: "text-orange-400" } as any)} />;
            default: return <FaGlobe />;
        }
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
    const getTileStyle = useCallback((status: 'up' | 'down' | 'unknown' | null): React.CSSProperties => {
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
        }
        return {};
    }, [tileStyles]);
    
    const getTileTextColor = useCallback((status: 'up' | 'down' | 'unknown' | null): string => {
        if (status === 'up') {
            return tileStyles.upTextColor;
        } else if (status === 'down') {
            return tileStyles.downTextColor;
        }
        return '';
    }, [tileStyles]);
    
    const getTileTextStyle = useCallback((status: 'up' | 'down' | 'unknown' | null): React.CSSProperties => {
        const color = getTileTextColor(status);
        if (color) {
            return { color };
        }
        return {};
    }, [getTileTextColor]);
    
    const getTileBorderColor = useCallback((status: 'up' | 'down' | 'unknown' | null): string => {
        if (status === 'up') {
            return tileStyles.upUseGradient ? tileStyles.upGradientStart : tileStyles.upBackgroundColor;
        } else if (status === 'down') {
            return tileStyles.downUseGradient ? tileStyles.downGradientStart : tileStyles.downBackgroundColor;
        }
        return '';
    }, [tileStyles]);

    const animationClass = getTileAnimationClass(animation);
    const decorationClass = getTileDecorationClass(decoration);
    const fullAnimClass = useMemo(() => `${animationClass} ${decorationClass} linknest-tile-animated`.trim(), [animationClass, decorationClass]);

    const content = (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportJSON}
                className="hidden"
                accept=".json"
            />
            <input
                type="file"
                ref={csvInputRef}
                onChange={handleImportCSV}
                className="hidden"
                accept=".csv"
            />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                        <FaServer {...({ className: "text-blue-600 dark:text-blue-400 text-xl" } as any)} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                            Monitoring Dashboard
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Real-time status tracking for your services and endpoints
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-[#1e1e1e] p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333]">
                    {/* Data Management Group */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#252525] p-1 rounded-xl">
                        <button
                            onClick={handleExportJSON}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Export Monitors (JSON)"
                        >
                            <FaUpload size={14} />
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Import Monitors (JSON)"
                        >
                            <FaDownload size={14} />
                        </button>
                        <button
                            onClick={handleExportCSV}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-[#333]"
                            title="Export Monitors (CSV)"
                        >
                            <div className="relative">
                                <FaFileCsv size={14} />
                                <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full w-2 h-2 border border-white dark:border-[#252525]"></div>
                            </div>
                        </button>
                        <button
                            onClick={() => csvInputRef.current?.click()}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-green-600 hover:bg-white dark:hover:bg-[#333]"
                            title="Import Monitors (CSV)"
                        >
                            <FaFileCsv size={14} />
                        </button>
                        <button
                            onClick={() => setShowSMTPSettings(true)}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-orange-500 hover:bg-white dark:hover:bg-[#333]"
                            title="SMTP Settings"
                        >
                            <FaEnvelope size={14} />
                        </button>
                        <button
                            onClick={() => setShowTileStyleModal(true)}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-purple-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Tile Style Settings"
                        >
                            <FaPalette size={14} />
                        </button>
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-indigo-500 hover:bg-white dark:hover:bg-[#333]"
                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        >
                            {isFullscreen ? <FaCompress size={14} /> : <FaExpand size={14} />}
                        </button>
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
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Table Mode"
                        >
                            <FaList size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('capsule')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'capsule' ? 'bg-white dark:bg-[#333] text-blue-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Capsule Mode"
                        >
                            <FaCircle size={14} />
                        </button>
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    {/* Refresh Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refreshAll(true)}
                            className="flex items-center justify-center w-9 h-9 text-slate-600 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 bg-slate-100 dark:bg-[#252525] rounded-xl transition-all"
                            title="Force refresh all monitors"
                        >
                            <FaRedo size={14} {...({ className: isLoading ? 'animate-spin' : '' } as any)} />
                        </button>

                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#252525] rounded-xl px-2 py-1">
                            <div className="relative w-7 h-7 flex items-center justify-center">
                                <svg className="w-6 h-6 rotate-[-90deg]">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-200 dark:text-slate-800" />
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 10) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 10)} className={`${isAutoRefreshEnabled ? 'text-emerald-500' : 'text-slate-400'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                                </svg>
                                <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                </button>
                            </div>
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

                    <button
                        onClick={() => { setSelectedMonitor(undefined); setIsDuplicate(false); setIsEditing(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                        <FaPlus size={12} /> Add Monitor
                    </button>
                </div>
            </div>

            {isLoading && monitors.length === 0 ? (
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
                    <button
                        onClick={() => { setSelectedMonitor(undefined); setIsDuplicate(false); setIsEditing(true); }}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                    >
                        Create your first monitor
                    </button>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Tabs Navigation */}
                    {tabNames.length > 1 && (
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

                    {sortedGroups.map((groupName) => (
                        <div key={groupName} className="space-y-4">
                            <div className="flex items-center gap-4 group/header">
                                {editingGroupName === groupName ? (
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
                                            className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 whitespace-nowrap cursor-pointer hover:text-blue-500 transition-colors"
                                            onDoubleClick={() => {
                                                setEditingGroupName(groupName);
                                                setTempGroupName(groupName);
                                            }}
                                        >
                                            {groupName}
                                        </h3>
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
                                    </div>
                                )}
                                <div className="h-px w-full bg-slate-200 dark:bg-[#252525]"></div>
                            </div>


                            {viewMode === 'capsule' ? (
                                <div className="flex flex-wrap gap-2">
                                    {groupedByGroups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={{
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileStyle(monitor.last_status) : {}),
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' ? { borderColor: getTileBorderColor(monitor.last_status) } : {})
                                            }}
                                            className={`inline-flex items-center gap-3 px-4 py-2 rounded-full border cursor-pointer transition-all hover:shadow-lg group relative ${fullAnimClass} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'bg-white dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333]'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span 
                                                    className="font-semibold text-sm truncate"
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : { color: 'inherit' }}
                                                >
                                                    {monitor.name}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                                                    <FaClock size={10} {...(monitor.last_status === 'up' || monitor.last_status === 'down' ? { style: getTileTextStyle(monitor.last_status) } : {})} />
                                                    <span style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : { color: 'inherit' }}>
                                                        {monitor.last_response_time ? `${monitor.last_response_time}ms` : '-'}
                                                    </span>
                                                </div>
                                                <span 
                                                    className="text-xs opacity-70"
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : { color: 'inherit' }}
                                                >
                                                    {formatLastChecked(monitor.last_checked_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (viewMode === 'tiles' || viewMode === 'compact') ? (
                                <div className={`grid gap-4 ${viewMode === 'tiles' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'}`}>
                                    {groupedByGroups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={{
                                                animationDelay: `${index * 50}ms`,
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileStyle(monitor.last_status) : {}),
                                                ...(monitor.last_status === 'up' || monitor.last_status === 'down' ? { borderColor: getTileBorderColor(monitor.last_status) } : {})
                                            }}
                                            className={`border rounded-2xl shadow-lg hover:shadow-xl transition-all group relative cursor-pointer ${fullAnimClass} 
                                                ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'bg-white dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]'}
                                                ${viewMode === 'tiles' ? 'p-5' : 'p-3 flex flex-col justify-between min-h-[120px]'}
                                                ${moveMenuId === monitor.id ? 'z-[60]' : 'z-10 hover:z-20'}`}
                                        >
                                            {moveMenuId === monitor.id && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMoveMenuId(null); }}></div>
                                                    <div className="absolute top-12 left-2 right-2 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333] rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in duration-150 overflow-hidden" onClick={e => e.stopPropagation()}>
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1 flex items-center justify-between">
                                                            <span>Move to Tab</span>
                                                            <button onClick={() => setMoveMenuId(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-[#333] rounded-lg">
                                                                <FaTimes size={8} />
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5 mb-5 max-h-[100px] overflow-y-auto scrollbar-hide">
                                                            {tabNames.map(t => (
                                                                <button key={t} onClick={(e) => { e.stopPropagation(); handleMoveMonitor(monitor.id, { tab_name: t }); }}
                                                                    className={`px-2.5 py-1.5 text-[10px] rounded-lg font-bold transition-all ${monitor.tab_name === t ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 dark:bg-[#252525] text-slate-500 hover:bg-slate-200 dark:hover:bg-[#333]'}`}>
                                                                    {t}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">Move to Group</div>
                                                        <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto scrollbar-hide">
                                                            {sortedGroups.map(g => (
                                                                <button key={g} onClick={(e) => { e.stopPropagation(); handleMoveMonitor(monitor.id, { group_name: g }); }}
                                                                    className={`px-2.5 py-1.5 text-[10px] rounded-lg font-bold transition-all ${monitor.group_name === g ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 dark:bg-[#252525] text-slate-500 hover:bg-slate-200 dark:hover:bg-[#333]'}`}>
                                                                    {g}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 z-10">
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMoveMenuId(moveMenuId === monitor.id ? null : monitor.id); }}
                                                        className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400'}`}
                                                        title="Move to Tab/Group"
                                                    >
                                                        <FaArrowsAlt size={10} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleCheckNow(monitor.id)}
                                                    disabled={checkingId === monitor.id}
                                                    className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${checkingId === monitor.id ? 'animate-spin' : ''} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                    title="Check Now"
                                                >
                                                    <FaRedo size={10} />
                                                </button>
                                                <button
                                                    onClick={() => handleDuplicate(monitor)}
                                                    className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                    title="Duplicate"
                                                >
                                                    <FaCopy size={10} />
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedMonitor(monitor); setIsDuplicate(false); setIsEditing(true); }}
                                                    className={`p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                    title="Edit"
                                                >
                                                    <FaEdit size={10} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(monitor.id)}
                                                    className={`p-1.5 rounded-lg hover:bg-red-800 hover:text-white transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 text-white' : 'bg-slate-100 dark:bg-[#333] text-slate-600 dark:text-slate-400'}`}
                                                    title="Delete"
                                                >
                                                    <FaTrash size={10} />
                                                </button>
                                            </div>

                                            <div className={`flex items-start gap-3 ${viewMode === 'tiles' ? 'mb-5' : 'mb-2'}`}>
                                                <div className={`${viewMode === 'tiles' ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-sm'} rounded-xl flex items-center justify-center ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-[#2a2a2a]'} ${monitor.last_status === 'down' ? 'border border-white/30' : (monitor.last_status === 'up' ? 'border border-white/20 shadow-inner' : 'border border-slate-200 dark:border-[#444]')}`}>
                                                    {React.cloneElement(getTypeIcon(monitor.type), { 
                                                        style: monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : undefined,
                                                        size: viewMode === 'tiles' ? 18 : 14 
                                                    })}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 
                                                        className={`font-bold leading-tight truncate ${viewMode === 'tiles' ? 'text-base mb-1' : 'text-xs mb-0.5'} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-900 dark:text-white'}`}
                                                        style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        title={monitor.name}
                                                    >
                                                        {monitor.name}
                                                    </h3>
                                                    {viewMode === 'tiles' ? (
                                                        <div 
                                                            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full inline-flex ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20' : 'text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-[#252525]'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        >
                                                            {React.cloneElement(getStatusIcon(monitor.last_status) as React.ReactElement, { 
                                                                style: monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : undefined,
                                                                size: 10 
                                                            })}
                                                            <span className="uppercase font-extrabold tracking-widest">
                                                                {monitor.last_status || 'UNKNOWN'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div 
                                                            className={`text-[9px] font-black uppercase tracking-tighter ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : monitor.last_status === 'up' ? 'text-emerald-500' : 'text-red-500'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        >
                                                            {monitor.last_status || 'UNKNOWN'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={`${viewMode === 'tiles' ? 'space-y-3 mb-5' : 'mb-3'}`}>
                                                <div 
                                                    className={`${viewMode === 'tiles' ? 'text-[11px] p-3' : 'text-[9px] p-1.5'} break-all rounded-xl border font-mono ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 border-white/10' : 'text-slate-600 dark:text-gray-400 bg-slate-50 dark:bg-[#252525] border-slate-100 dark:border-[#333]'}`}
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.9 } : {}}
                                                >
                                                    {monitor.target}
                                                    {monitor.port && (
                                                        <span 
                                                            className={monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-400 dark:text-gray-500'}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.7 } : {}}
                                                        >
                                                            :{monitor.port}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div 
                                                className={`flex flex-col gap-1 ${viewMode === 'tiles' ? 'pt-4 border-t' : 'pt-2'} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? (viewMode === 'tiles' ? 'border-white/20' : '') : 'border-slate-100 dark:border-[#333] text-slate-500 dark:text-gray-500'}`}
                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.8 } : {}}
                                            >
                                                <div className="flex items-center justify-between text-[10px] font-bold">
                                                    <div className="flex items-center gap-1.5" title="Last Response Time">
                                                        <FaClock size={10} style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.6 } : {}} {...({ className: monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-blue-500' } as any)} />
                                                        {monitor.last_response_time ? `${monitor.last_response_time}ms` : '-'}
                                                    </div>
                                                    <div className="opacity-70">
                                                        {monitor.interval}m
                                                    </div>
                                                </div>
                                                <div 
                                                    className={`text-[9px] text-right font-medium ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-400 dark:text-gray-600'}`}
                                                    style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.6 } : {}}
                                                >
                                                    {formatLastChecked(monitor.last_checked_at)}
                                                </div>
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
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4">Target</th>
                                                <th className="px-6 py-4">Response Time</th>
                                                <th className="px-6 py-4">Last Checked</th>
                                                <th className="px-6 py-4">Interval</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-[#333]">
                                            {groupedByGroups[groupName].map((monitor, index) => (
                                                <tr
                                                    key={monitor.id}
                                                    onClick={(e) => handleTileClick(e, monitor)}
                                                    className={`group cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252525] transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : ''} ${fullAnimClass}`}
                                                    style={{
                                                        animationDelay: `${index * 30}ms`,
                                                        ...(monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileStyle(monitor.last_status) : {})
                                                    }}
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
                                                        <div 
                                                            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${monitor.last_status === 'up' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : (monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')}`}
                                                            style={monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        >
                                                            <div className={`w-1.5 h-1.5 rounded-full ${monitor.last_status === 'up' ? 'bg-emerald-500 animate-pulse' : (monitor.last_status === 'down' ? 'bg-white animate-pulse' : 'bg-slate-400')}`}></div>
                                                            {monitor.last_status || 'UNKNOWN'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <code 
                                                            className={`text-[11px] px-2 py-1 rounded-md ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#252525]'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.9 } : {}}
                                                        >
                                                            {monitor.target}{monitor.port ? `:${monitor.port}` : ''}
                                                        </code>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div 
                                                            className={`flex items-center gap-1.5 text-sm font-medium ${monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-700 dark:text-slate-300'}`}
                                                            style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                        >
                                                            <FaClock size={12} style={monitor.last_status === 'up' || monitor.last_status === 'down' ? { ...getTileTextStyle(monitor.last_status), opacity: 0.6 } : {}} {...({ className: monitor.last_status === 'up' || monitor.last_status === 'down' ? '' : 'text-slate-400' } as any)} />
                                                            {monitor.last_response_time ? `${monitor.last_response_time}ms` : '-'}
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
                                                            <button
                                                                onClick={() => handleDuplicate(monitor)}
                                                                className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                                title="Duplicate"
                                                            >
                                                                <FaCopy size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => { setSelectedMonitor(monitor); setIsDuplicate(false); setIsEditing(true); }}
                                                                className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                            >
                                                                <FaEdit size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(monitor.id)}
                                                                className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/40 hover:bg-red-800' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-red-500'}`}
                                                                style={monitor.last_status === 'up' || monitor.last_status === 'down' ? getTileTextStyle(monitor.last_status) : {}}
                                                            >
                                                                <FaTrash size={12} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}


            {isEditing && (
                <MonitorForm
                    monitor={isDuplicate ? { ...selectedMonitor!, id: 0 } as any : selectedMonitor}
                    onSave={handleSave}
                    onCancel={() => { setIsEditing(false); setIsDuplicate(false); }}
                />
            )}

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
                                                onClick={() => setLogFilter(filter.id as any)}
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
                                        onClick={() => setHistoryViewMode('chart')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${historyViewMode === 'chart' ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <FaThLarge size={12} /> Chart
                                    </button>
                                    <button
                                        onClick={() => setHistoryViewMode('list')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${historyViewMode === 'list' ? 'bg-white dark:bg-[#333] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <FaList size={12} /> List
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => viewingLogsMonitor && fetchLogs(viewingLogsMonitor.id, logFilter)}
                                    className="p-2 bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500 hover:text-blue-500"
                                    title="Refresh History"
                                    disabled={isLogsLoading}
                                >
                                    <FaRedo size={12} {...({ className: isLogsLoading ? 'animate-spin' : '' } as any)} />
                                </button>
                                <button
                                    onClick={handleExportHistoryCSV}
                                    className="p-2 bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500 hover:text-green-600"
                                    title="Export History (CSV)"
                                    disabled={logs.length === 0}
                                >
                                    <FaFileCsv size={14} />
                                </button>
                                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-[#252525] px-3 py-1.5 rounded-lg border border-slate-100 dark:border-[#333]">
                                    {logs.length} Checks Found
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
                            ) : logs.length === 0 ? (
                                <div className="text-center py-20 bg-slate-50 dark:bg-[#202020] rounded-3xl border border-dashed border-slate-200 dark:border-[#333]">
                                    <p className="text-slate-500 dark:text-gray-400">No event logs found for this period.</p>
                                </div>
                            ) : historyViewMode === 'chart' ? (
                                <div className="flex-1 w-full bg-slate-50/50 dark:bg-[#202020]/30 rounded-3xl p-6 border border-slate-100 dark:border-[#333] flex flex-col gap-4 min-h-0 h-full">
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

            {showTileStyleModal && (
                <MonitoringTileStyleModal
                    isOpen={showTileStyleModal}
                    onClose={() => setShowTileStyleModal(false)}
                    onStylesChange={handleTileStylesChange}
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
        return (
            <div className="fixed inset-0 overflow-y-auto bg-slate-50 dark:bg-[#121212] transition-colors z-50">
                <div className="min-h-full p-4">
                    {content}
                </div>
            </div>
        );
    }

    return <>{content}</>;
};
