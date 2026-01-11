import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Monitor, MonitorLog, monitoringService } from '../services/monitoringService';
import { MonitorForm } from './MonitorForm';
import { FaServer, FaGlobe, FaSearch, FaCheck, FaTimes, FaQuestion, FaPlus, FaRedo, FaTrash, FaEdit, FaClock, FaThLarge, FaList, FaCopy, FaBars, FaDownload, FaUpload, FaHistory, FaCalendarAlt } from 'react-icons/fa';
import { useTileAnimation, getTileAnimationClass, getTileDecorationClass } from './TileAnimationSelector';

export const MonitoringDashboard: React.FC = () => {
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedMonitor, setSelectedMonitor] = useState<Monitor | undefined>(undefined);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [viewingLogsMonitor, setViewingLogsMonitor] = useState<Monitor | null>(null);
    const [logs, setLogs] = useState<MonitorLog[]>([]);
    const [logFilter, setLogFilter] = useState<'1d' | '1w' | '1m'>('1d');
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const [checkingId, setCheckingId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'tiles' | 'grid' | 'compact'>(() => {
        const saved = localStorage.getItem('linknest_monitor_view_mode');
        return (saved === 'tiles' || saved === 'grid' || saved === 'compact') ? saved : 'tiles';
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

    // Persist view mode
    useEffect(() => {
        localStorage.setItem('linknest_monitor_view_mode', viewMode);
    }, [viewMode]);

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
    }, [fetchMonitors]);

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

    const fetchLogs = useCallback(async (id: number, filter: '1d' | '1w' | '1m') => {
        setIsLogsLoading(true);
        try {
            const days = filter === '1d' ? 1 : filter === '1w' ? 7 : 30;
            const data = await monitoringService.getMonitorLogs(id, { days });
            setLogs(data);
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setIsLogsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewingLogsMonitor) {
            fetchLogs(viewingLogsMonitor.id, logFilter);
        }
    }, [viewingLogsMonitor, logFilter, fetchLogs]);

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
        if (tabNames.length > 0 && !tabNames.includes(activeTab)) {
            setActiveTab(tabNames[0]);
        } else if (tabNames.length === 0) {
            setActiveTab('General');
        }
    }, [tabNames, activeTab]);

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

    const formatLastChecked = (timestamp: number | string | null) => {
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
    };

    const animationClass = getTileAnimationClass(animation);
    const decorationClass = getTileDecorationClass(decoration);
    const fullAnimClass = `${animationClass} ${decorationClass} linknest-tile-animated`.trim();

    return (
        <div className="w-full h-full p-6 overflow-y-auto bg-slate-50 dark:bg-[#121212] transition-colors">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportJSON}
                className="hidden"
                accept=".json"
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
                            <FaDownload size={14} />
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-lg transition-all text-slate-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-[#333]"
                            title="Import Monitors (JSON)"
                        >
                            <FaUpload size={14} />
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
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'}`}
                                >
                                    {tab}
                                    <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-[#252525] text-slate-400'}`}>
                                        {groupedByTabs[tab].length}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {sortedGroups.map((groupName) => (
                        <div key={groupName} className="space-y-4">
                            <div className="flex items-center gap-4">
                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                    {groupName}
                                </h3>
                                <div className="h-px w-full bg-slate-200 dark:bg-[#252525]"></div>
                            </div>

                            {(viewMode === 'tiles' || viewMode === 'compact') ? (
                                <div className={`grid gap-4 ${viewMode === 'tiles' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'}`}>
                                    {groupedByGroups[groupName].map((monitor, index) => (
                                        <div
                                            key={monitor.id}
                                            onClick={(e) => handleTileClick(e, monitor)}
                                            style={{ animationDelay: `${index * 50}ms` }}
                                            className={`border rounded-2xl shadow-lg hover:shadow-xl transition-all group relative cursor-pointer ${fullAnimClass} 
                                                ${monitor.last_status === 'up' ? 'bg-emerald-600 border-emerald-500' : (monitor.last_status === 'down' ? 'bg-red-600 border-red-500' : 'bg-white dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]')}
                                                ${viewMode === 'tiles' ? 'p-5' : 'p-3 flex flex-col justify-between min-h-[120px]'}`}
                                        >
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 z-10">
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
                                                <div className={`${viewMode === 'tiles' ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-sm'} rounded-xl flex items-center justify-center ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-[#2a2a2a]'} ${monitor.last_status === 'down' ? 'border border-white/30' : (monitor.last_status === 'up' ? 'border border-white/20 shadow-inner' : 'border border-slate-200 dark:border-[#444]')}`}>
                                                    {React.cloneElement(getTypeIcon(monitor.type), { className: (monitor.last_status === 'up' || monitor.last_status === 'down') ? 'text-white' : undefined, size: viewMode === 'tiles' ? 18 : 14 })}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className={`font-bold leading-tight truncate ${viewMode === 'tiles' ? 'text-base mb-1' : 'text-xs mb-0.5'} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'text-white' : 'text-slate-900 dark:text-white'}`} title={monitor.name}>
                                                        {monitor.name}
                                                    </h3>
                                                    {viewMode === 'tiles' ? (
                                                        <div className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full inline-flex ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'text-white bg-white/20' : 'text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-[#252525]'}`}>
                                                            {React.cloneElement(getStatusIcon(monitor.last_status) as React.ReactElement, { className: (monitor.last_status === 'up' || monitor.last_status === 'down') ? 'text-white' : undefined, size: 10 })}
                                                            <span className="uppercase font-extrabold tracking-widest">
                                                                {monitor.last_status || 'UNKNOWN'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className={`text-[9px] font-black uppercase tracking-tighter ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'text-white/80' : monitor.last_status === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                            {monitor.last_status || 'UNKNOWN'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={`${viewMode === 'tiles' ? 'space-y-3 mb-5' : 'mb-3'}`}>
                                                <div className={`${viewMode === 'tiles' ? 'text-[11px] p-3' : 'text-[9px] p-1.5'} break-all rounded-xl border font-mono ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'bg-black/20 border-white/10 text-white/90' : 'text-slate-600 dark:text-gray-400 bg-slate-50 dark:bg-[#252525] border-slate-100 dark:border-[#333]'}`}>
                                                    {monitor.target}
                                                    {monitor.port && <span className={monitor.last_status === 'up' || monitor.last_status === 'down' ? 'text-white/70' : 'text-slate-400 dark:text-gray-500'}>:{monitor.port}</span>}
                                                </div>
                                            </div>

                                            <div className={`flex flex-col gap-1 ${viewMode === 'tiles' ? 'pt-4 border-t' : 'pt-2'} ${monitor.last_status === 'up' || monitor.last_status === 'down' ? (viewMode === 'tiles' ? 'border-white/20' : '') + ' text-white/80' : 'border-slate-100 dark:border-[#333] text-slate-500 dark:text-gray-500'}`}>
                                                <div className="flex items-center justify-between text-[10px] font-bold">
                                                    <div className="flex items-center gap-1.5" title="Last Response Time">
                                                        <FaClock size={10} {...({ className: monitor.last_status === 'up' || monitor.last_status === 'down' ? 'text-white/60' : 'text-blue-500' } as any)} />
                                                        {monitor.last_response_time ? `${monitor.last_response_time}ms` : '-'}
                                                    </div>
                                                    <div className="opacity-70">
                                                        {monitor.interval}m
                                                    </div>
                                                </div>
                                                <div className={`text-[9px] text-right font-medium ${monitor.last_status === 'up' || monitor.last_status === 'down' ? 'text-white/60' : 'text-slate-400 dark:text-gray-600'}`}>
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
                                                    className={`group cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252525] transition-colors ${monitor.last_status === 'down' ? 'bg-red-600 text-white' : ''} ${fullAnimClass}`}
                                                    style={{ animationDelay: `${index * 30}ms` }}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${monitor.last_status === 'down' ? 'bg-white/20' : 'bg-slate-100 dark:bg-[#2a2a2a] text-slate-500'}`}>
                                                                {React.cloneElement(getTypeIcon(monitor.type), { size: 14, className: monitor.last_status === 'down' ? 'text-white' : undefined })}
                                                            </div>
                                                            <span className={`font-bold text-sm ${monitor.last_status === 'down' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{monitor.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${monitor.last_status === 'up' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : (monitor.last_status === 'down' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')}`}>
                                                            <div className={`w-1.5 h-1.5 rounded-full ${monitor.last_status === 'up' ? 'bg-emerald-500 animate-pulse' : (monitor.last_status === 'down' ? 'bg-white animate-pulse' : 'bg-slate-400')}`}></div>
                                                            {monitor.last_status || 'UNKNOWN'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <code className={`text-[11px] px-2 py-1 rounded-md ${monitor.last_status === 'down' ? 'bg-black/20 text-white/90' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#252525]'}`}>
                                                            {monitor.target}{monitor.port ? `:${monitor.port}` : ''}
                                                        </code>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className={`flex items-center gap-1.5 text-sm font-medium ${monitor.last_status === 'down' ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                            <FaClock size={12} {...({ className: monitor.last_status === 'down' ? 'text-white/60' : 'text-slate-400' } as any)} />
                                                            {monitor.last_response_time ? `${monitor.last_response_time}ms` : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-xs ${monitor.last_status === 'down' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{formatLastChecked(monitor.last_checked_at)}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-xs font-bold ${monitor.last_status === 'down' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{monitor.interval}m</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleCheckNow(monitor.id)}
                                                                disabled={checkingId === monitor.id}
                                                                className={`p-2 rounded-xl transition-colors ${checkingId === monitor.id ? 'animate-spin' : ''} ${monitor.last_status === 'down' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                title="Check Now"
                                                            >
                                                                <FaRedo size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDuplicate(monitor)}
                                                                className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'down' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                                title="Duplicate"
                                                            >
                                                                <FaCopy size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => { setSelectedMonitor(monitor); setIsDuplicate(false); setIsEditing(true); }}
                                                                className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'down' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-blue-500'}`}
                                                            >
                                                                <FaEdit size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(monitor.id)}
                                                                className={`p-2 rounded-xl transition-colors ${monitor.last_status === 'down' ? 'bg-black/40 text-white hover:bg-red-800' : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-400 hover:text-red-500'}`}
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className={`${animationClass} bg-white dark:bg-[#1a1a1a] w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-[#333]`}>
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-slate-50/50 dark:bg-[#202020]/50">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${viewingLogsMonitor.last_status === 'up' ? 'bg-emerald-500/10 text-emerald-500' : viewingLogsMonitor.last_status === 'down' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                    <FaHistory size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Uptime History</h2>
                                    <p className="text-sm text-slate-500 dark:text-gray-400">Viewing logs for <span className="font-bold text-blue-500">{viewingLogsMonitor.name}</span></p>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingLogsMonitor(null)}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-400"
                            >
                                <FaTimes size={20} />
                            </button>
                        </div>

                        {/* Filters Bar */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-white dark:bg-[#1a1a1a]">
                            <div className="flex items-center gap-2">
                                <FaCalendarAlt {...({ className: "text-slate-400 mr-2" } as any)} />
                                <div className="flex bg-slate-100 dark:bg-[#252525] p-1 rounded-xl">
                                    {[
                                        { id: '1d', label: 'Last 24h' },
                                        { id: '1w', label: 'Last 7 Days' },
                                        { id: '1m', label: 'Last 30 Days' }
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
                            </div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                {logs.length} Checks Found
                            </div>
                        </div>

                        {/* Logs List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {isLogsLoading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-slate-500 dark:text-gray-400">Loading history...</p>
                                </div>
                            ) : Object.keys(groupedLogs).length === 0 ? (
                                <div className="text-center py-20 bg-slate-50 dark:bg-[#202020] rounded-3xl border border-dashed border-slate-200 dark:border-[#333]">
                                    <p className="text-slate-500 dark:text-gray-400">No event logs found for this period.</p>
                                </div>
                            ) : (
                                (Object.entries(groupedLogs) as [string, MonitorLog[]][]).map(([date, dateLogs]) => (
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
                                ))
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="p-4 bg-slate-50 dark:bg-[#202020] border-t border-slate-100 dark:border-[#333] text-center">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                Auto-cleaning enabled: Logs older than 30 days are automatically pruned
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
