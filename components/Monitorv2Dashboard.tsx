import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { monitorv2Service, Monitorv2, MonitorCheck } from '../services/monitorv2Service';
import { 
    FaSync, FaPlus, FaEdit, FaTrash, FaSpinner, FaServer, 
    FaGlobe, FaSearch, FaEthernet, FaClock, FaCheckCircle,
    FaTimesCircle, FaExclamationTriangle, FaBars, FaTh, 
    FaThLarge, FaList, FaChartBar, FaHistory, FaDownload,
    FaUpload, FaToggleOn, FaToggleOff, FaBell, FaFilter,
    FaEnvelope, FaCog, FaPlay, FaPause, FaFileImport, FaFileExport
} from 'react-icons/fa';
import { Monitorv2Form } from './Monitorv2Form';
import { RechartsAreaChart, RechartsBarChart, RechartsLineChart } from './RechartsCharts';
import { toast } from '../components/Toast';

// View mode types
type ViewMode = 'tiles' | 'compact' | 'grid' | 'status-bar' | 'kanban' | 'timeline';

interface GroupedMonitors {
    [tabName: string]: {
        [groupName: string]: Monitorv2[];
    };
}

export const Monitorv2Dashboard: React.FC = () => {
    // State
    const [monitors, setMonitors] = useState<Monitorv2[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTab, setSelectedTab] = useState<string>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('tiles');
    const [showInactive, setShowInactive] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMonitor, setSelectedMonitor] = useState<Monitorv2 | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingMonitor, setEditingMonitor] = useState<Monitorv2 | null>(null);
    const [logs, setLogs] = useState<MonitorCheck[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Load monitors
    const loadMonitors = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        setRefreshing(true);
        try {
            const data = await monitorv2Service.getMonitors();
            setMonitors(data);
        } catch (err) {
            console.error('Failed to load monitors:', err);
            toast.error('Failed to load monitors');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadMonitors(true);
    }, [loadMonitors]);

    // Auto refresh
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => loadMonitors(false), 30000); // 30 seconds
        return () => clearInterval(interval);
    }, [autoRefresh, loadMonitors]);

    // Grouped data
    const groupedData = useMemo(() => {
        const filtered = monitors.filter(m => {
            if (!showInactive && !m.is_active) return false;
            if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });

        const grouped: GroupedMonitors = {};
        filtered.forEach(m => {
            const tab = m.tab_name || 'General';
            const group = m.group_name || 'Other';
            if (!grouped[tab]) grouped[tab] = {};
            if (!grouped[tab][group]) grouped[tab][group] = [];
            grouped[tab][group].push(m);
        });
        return grouped;
    }, [monitors, showInactive, searchQuery]);

    // Get all tabs
    const tabs = useMemo(() => {
        const tabSet = new Set<string>();
        monitors.forEach(m => tabSet.add(m.tab_name || 'General'));
        return Array.from(tabSet).sort();
    }, [monitors]);

    // Actions
    const handleCreate = async (data: Partial<Monitorv2>) => {
        try {
            await monitorv2Service.createMonitor(data);
            toast.success('Monitor created successfully');
            setShowForm(false);
            loadMonitors(false);
        } catch (err) {
            console.error('Failed to create monitor:', err);
            toast.error('Failed to create monitor');
            throw err;
        }
    };

    const handleUpdate = async (data: Partial<Monitorv2>) => {
        if (!editingMonitor) return;
        try {
            await monitorv2Service.updateMonitor(editingMonitor.id, data);
            toast.success('Monitor updated successfully');
            setShowForm(false);
            setEditingMonitor(null);
            loadMonitors(false);
        } catch (err) {
            console.error('Failed to update monitor:', err);
            toast.error('Failed to update monitor');
            throw err;
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this monitor?')) return;
        try {
            await monitorv2Service.deleteMonitor(id);
            toast.success('Monitor deleted successfully');
            loadMonitors(false);
        } catch (err) {
            console.error('Failed to delete monitor:', err);
            toast.error('Failed to delete monitor');
        }
    };

    const handleToggleActive = async (monitor: Monitorv2) => {
        try {
            await monitorv2Service.updateMonitor(monitor.id, { is_active: monitor.is_active ? 0 : 1 });
            toast.success(monitor.is_active ? 'Monitor paused' : 'Monitor activated');
            loadMonitors(false);
        } catch (err) {
            console.error('Failed to toggle monitor:', err);
            toast.error('Failed to update monitor');
        }
    };

    const handleRunCheck = async (id: number) => {
        try {
            const result = await monitorv2Service.runCheck(id);
            toast.success(`Check completed: ${result.check.status}`);
            loadMonitors(false);
        } catch (err) {
            console.error('Failed to run check:', err);
            toast.error('Failed to run check');
        }
    };

    const handleViewLogs = async (monitor: Monitorv2) => {
        setSelectedMonitor(monitor);
        setShowLogs(true);
        try {
            const data = await monitorv2Service.getMonitorLogs(monitor.id, { limit: 100 });
            setLogs(data);
        } catch (err) {
            console.error('Failed to load logs:', err);
            toast.error('Failed to load logs');
        }
    };

    // Import/Export
    const handleExport = async () => {
        setExporting(true);
        try {
            const data = await monitorv2Service.exportMonitors();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `monitorv2-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Monitors exported successfully');
        } catch (err) {
            console.error('Failed to export:', err);
            toast.error('Failed to export monitors');
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        try {
            const content = await file.text();
            const data = JSON.parse(content);
            await monitorv2Service.importMonitors(data);
            toast.success('Monitors imported successfully');
            loadMonitors(false);
        } catch (err) {
            console.error('Failed to import:', err);
            toast.error('Failed to import monitors');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    // Status helpers
    const getStatusIcon = (status: string, size: number = 16) => {
        switch (status) {
            case 'up': return <FaCheckCircle size={size} className="text-emerald-500" />;
            case 'down': return <FaTimesCircle size={size} className="text-red-500" />;
            case 'warning': return <FaExclamationTriangle size={size} className="text-amber-500" />;
            default: return <FaClock size={size} className="text-slate-400" />;
        }
    };

    const getStatusBg = (status: string) => {
        switch (status) {
            case 'up': return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
            case 'down': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
            case 'warning': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
            default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'url': return <FaGlobe />;
            case 'keyword': return <FaSearch />;
            case 'port': return <FaEthernet />;
            case 'ping': return <FaServer />;
            default: return <FaServer />;
        }
    };

    // Render monitor card based on view mode
    const renderMonitorCard = (monitor: Monitorv2) => {
        const history = monitor.history || [];
        const lastCheck = monitor.last_check_at 
            ? new Date(monitor.last_check_at).toLocaleString() 
            : 'Never';

        if (viewMode === 'tiles') {
            return (
                <div 
                    key={monitor.id} 
                    className={`p-4 rounded-xl border transition-all hover:shadow-lg ${getStatusBg(monitor.status || 'unknown')} ${!monitor.is_active ? 'opacity-60' : ''}`}
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white dark:bg-[#1e1e1e] rounded-lg shadow-sm">
                                {getTypeIcon(monitor.type)}
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">{monitor.name}</h3>
                                <p className="text-xs text-slate-500">{monitor.type.toUpperCase()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {getStatusIcon(monitor.status || 'unknown')}
                        </div>
                    </div>

                    <div className="mb-3">
                        <div className="h-8 flex items-end gap-0.5">
                            {history.map((h, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 rounded-t ${
                                        h.status === 'up' ? 'bg-emerald-500' : 
                                        h.status === 'down' ? 'bg-red-500' : 'bg-amber-500'
                                    }`}
                                    style={{ height: `${Math.min(100, (h.response_time_ms || 0) / 10)}%`, minHeight: '4px' }}
                                    title={`${h.status} - ${h.response_time_ms}ms`}
                                />
                            ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Last 20 checks</p>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                        <span>Uptime: {monitor.uptime_percentage?.toFixed(1) || 0}%</span>
                        <span>Response: {monitor.avg_response_ms || 0}ms</span>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleRunCheck(monitor.id)}
                            className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="Run check now"
                        >
                            <FaSync size={14} />
                        </button>
                        <button
                            onClick={() => handleViewLogs(monitor)}
                            className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="View logs"
                        >
                            <FaHistory size={14} />
                        </button>
                        <button
                            onClick={() => handleToggleActive(monitor)}
                            className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title={monitor.is_active ? 'Pause' : 'Activate'}
                        >
                            {monitor.is_active ? <FaPause size={14} /> : <FaPlay size={14} />}
                        </button>
                        <button
                            onClick={() => { setEditingMonitor(monitor); setShowForm(true); }}
                            className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="Edit"
                        >
                            <FaEdit size={14} />
                        </button>
                        <button
                            onClick={() => handleDelete(monitor.id)}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition-colors"
                            title="Delete"
                        >
                            <FaTrash size={14} />
                        </button>
                    </div>
                </div>
            );
        }

        if (viewMode === 'compact') {
            return (
                <div 
                    key={monitor.id} 
                    className={`flex items-center gap-3 p-3 rounded-lg border ${getStatusBg(monitor.status || 'unknown')} ${!monitor.is_active ? 'opacity-60' : ''}`}
                >
                    {getStatusIcon(monitor.status || 'unknown')}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900 dark:text-white truncate">{monitor.name}</h3>
                        <p className="text-xs text-slate-500">{monitor.type.toUpperCase()} • {lastCheck}</p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleToggleActive(monitor)} className="p-1.5 hover:bg-white/50 rounded">
                            {monitor.is_active ? <FaPause size={12} /> : <FaPlay size={12} />}
                        </button>
                        <button onClick={() => { setEditingMonitor(monitor); setShowForm(true); }} className="p-1.5 hover:bg-white/50 rounded">
                            <FaEdit size={12} />
                        </button>
                        <button onClick={() => handleDelete(monitor.id)} className="p-1.5 hover:bg-red-100 text-red-500 rounded">
                            <FaTrash size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        if (viewMode === 'grid') {
            return (
                <div 
                    key={monitor.id} 
                    className={`p-3 rounded-lg border flex flex-col items-center text-center ${getStatusBg(monitor.status || 'unknown')} ${!monitor.is_active ? 'opacity-60' : ''}`}
                >
                    <div className="text-2xl mb-2">{getStatusIcon(monitor.status || 'unknown', 24)}</div>
                    <h3 className="font-medium text-slate-900 dark:text-white text-sm truncate w-full">{monitor.name}</h3>
                    <p className="text-xs text-slate-500">{monitor.type.toUpperCase()}</p>
                    <div className="flex gap-1 mt-2">
                        <button onClick={() => handleToggleActive(monitor)} className="p-1 hover:bg-white/50 rounded">
                            {monitor.is_active ? <FaPause size={10} /> : <FaPlay size={10} />}
                        </button>
                        <button onClick={() => { setEditingMonitor(monitor); setShowForm(true); }} className="p-1 hover:bg-white/50 rounded">
                            <FaEdit size={10} />
                        </button>
                    </div>
                </div>
            );
        }

        if (viewMode === 'status-bar') {
            return (
                <div 
                    key={monitor.id}
                    className={`h-3 rounded-full ${!monitor.is_active ? 'bg-slate-300' : monitor.status === 'up' ? 'bg-emerald-500' : monitor.status === 'down' ? 'bg-red-500' : 'bg-amber-500'} cursor-pointer hover:opacity-80 transition-opacity`}
                    title={`${monitor.name}: ${monitor.status}`}
                    onClick={() => { setEditingMonitor(monitor); setShowForm(true); }}
                />
            );
        }

        return null;
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0a0a0a]">
            {/* Header */}
            <div className="bg-white dark:bg-[#1e1e1e] border-b border-slate-200 dark:border-[#333] px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                            <FaServer className="text-white" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Monitor v2</h1>
                            <p className="text-sm text-slate-500">
                                {monitors.length} monitors • {monitors.filter(m => m.status === 'up').length} up • {monitors.filter(m => m.status === 'down').length} down
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View Mode Toggle */}
                        <div className="flex items-center bg-slate-100 dark:bg-[#252525] rounded-lg p-1">
                            {(['tiles', 'compact', 'grid', 'status-bar'] as ViewMode[]).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    className={`p-2 rounded-md transition-colors ${
                                        viewMode === mode 
                                            ? 'bg-white dark:bg-[#333] text-purple-600 shadow-sm' 
                                            : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                    title={mode}
                                >
                                    {mode === 'tiles' && <FaThLarge size={16} />}
                                    {mode === 'compact' && <FaList size={16} />}
                                    {mode === 'grid' && <FaTh size={16} />}
                                    {mode === 'status-bar' && <FaBars size={16} />}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                            <FaPlus size={16} />
                            Add Monitor
                        </button>

                        <button
                            onClick={() => loadMonitors(false)}
                            disabled={refreshing}
                            className="p-2 bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#333] rounded-lg transition-colors"
                        >
                            <FaSync size={18} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-4 mt-4">
                    <div className="flex items-center gap-2">
                        <FaFilter size={14} className="text-slate-400" />
                        <span className="text-sm text-slate-500">Filter:</span>
                    </div>

                    {/* Tabs */}
                    <select
                        value={selectedTab}
                        onChange={e => setSelectedTab(e.target.value)}
                        className="px-3 py-1.5 bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-lg text-sm"
                    >
                        <option value="all">All Tabs</option>
                        {tabs.map(tab => (
                            <option key={tab} value={tab}>{tab}</option>
                        ))}
                    </select>

                    {/* Search */}
                    <div className="flex-1 max-w-md relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search monitors..."
                            className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-lg text-sm"
                        />
                    </div>

                    {/* Toggles */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={e => setShowInactive(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">Show inactive</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={e => setAutoRefresh(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">Auto-refresh</span>
                    </label>

                    {/* Import/Export */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            <FaFileExport size={14} />
                            Export
                        </button>
                        <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <FaFileImport size={14} />
                            Import
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                className="hidden"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <FaSpinner size={32} className="animate-spin text-purple-600" />
                    </div>
                ) : Object.keys(groupedData).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <FaServer size={64} className="mb-4 opacity-30" />
                        <p className="text-lg">No monitors configured</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-4 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                        >
                            <FaPlus size={16} />
                            Add Your First Monitor
                        </button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {Object.entries(groupedData).map(([tabName, groups]) => {
                            if (selectedTab !== 'all' && tabName !== selectedTab) return null;
                            
                            return (
                                <div key={tabName}>
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                                        {tabName}
                                    </h2>
                                    
                                    {Object.entries(groups).map(([groupName, groupMonitors]) => (
                                        <div key={groupName} className="mb-6">
                                            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">
                                                {groupName}
                                            </h3>
                                            
                                            {viewMode === 'tiles' && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                    {groupMonitors.map(renderMonitorCard)}
                                                </div>
                                            )}
                                            
                                            {viewMode === 'compact' && (
                                                <div className="space-y-2">
                                                    {groupMonitors.map(renderMonitorCard)}
                                                </div>
                                            )}
                                            
                                            {viewMode === 'grid' && (
                                                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                                    {groupMonitors.map(renderMonitorCard)}
                                                </div>
                                            )}
                                            
                                            {viewMode === 'status-bar' && (
                                                <div className="flex gap-1 flex-wrap">
                                                    {groupMonitors.map(renderMonitorCard)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {showForm && (
                <Monitorv2Form
                    monitor={editingMonitor}
                    onSave={editingMonitor ? handleUpdate : handleCreate}
                    onCancel={() => { setShowForm(false); setEditingMonitor(null); }}
                />
            )}

            {/* Logs Modal */}
            {showLogs && selectedMonitor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333] w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#333] flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                    {selectedMonitor.name} - Logs
                                </h2>
                                <p className="text-sm text-slate-500">
                                    Last {logs.length} checks
                                </p>
                            </div>
                            <button onClick={() => setShowLogs(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#333] rounded-lg">
                                <FaTimesCircle size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6">
                            {logs.length > 0 && (
                                <div className="mb-6 h-64">
                                    <RechartsAreaChart
                                        data={logs.map(l => ({
                                            time: new Date(l.checked_at).toLocaleTimeString(),
                                            response_time: l.response_time_ms || 0
                                        })).reverse()}
                                        dataKey="time"
                                        seriesKey="response_time"
                                        seriesName="Response Time (ms)"
                                        color="#8b5cf6"
                                    />
                                </div>
                            )}

                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-[#252525]">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Time</th>
                                        <th className="px-4 py-2 text-left">Status</th>
                                        <th className="px-4 py-2 text-left">Response</th>
                                        <th className="px-4 py-2 text-left">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log, i) => (
                                        <tr key={i} className="border-t border-slate-200 dark:border-[#333]">
                                            <td className="px-4 py-2">{new Date(log.checked_at).toLocaleString()}</td>
                                            <td className="px-4 py-2">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                                                    log.status === 'up' ? 'bg-emerald-100 text-emerald-700' :
                                                    log.status === 'down' ? 'bg-red-100 text-red-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {getStatusIcon(log.status)}
                                                    {log.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">{log.response_time_ms}ms</td>
                                            <td className="px-4 py-2 text-slate-500 truncate max-w-xs">{log.status_message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
