import React, { useState, useEffect } from 'react';
import { Monitor, monitoringService } from '../services/monitoringService';
import { MonitorForm } from './MonitorForm';
import { FaServer, FaGlobe, FaSearch, FaCheck, FaTimes, FaQuestion, FaPlus, FaRedo, FaTrash, FaEdit, FaClock } from 'react-icons/fa';

export const MonitoringDashboard: React.FC = () => {
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedMonitor, setSelectedMonitor] = useState<Monitor | undefined>(undefined);
    const [checkingId, setCheckingId] = useState<number | null>(null);

    const fetchMonitors = async () => {
        try {
            const data = await monitoringService.getMonitors();
            setMonitors(data);
        } catch (error) {
            console.error('Failed to load monitors', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMonitors();
        // Auto refresh every 30 seconds
        const interval = setInterval(fetchMonitors, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = async (data: Partial<Monitor>) => {
        try {
            if (selectedMonitor) {
                await monitoringService.updateMonitor(selectedMonitor.id, data);
            } else {
                await monitoringService.createMonitor(data);
            }
            setIsEditing(false);
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

    const getStatusIcon = (status: string | null) => {
        switch (status) {
            case 'up': return <FaCheck className="text-green-500" />;
            case 'down': return <FaTimes className="text-red-500" />;
            default: return <FaQuestion className="text-gray-500" />;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'url': return <FaGlobe className="text-blue-400" />;
            case 'keyword': return <FaSearch className="text-purple-400" />;
            case 'port': return <FaServer className="text-orange-400" />;
            default: return <FaGlobe />;
        }
    };

    const formatLastChecked = (timestamp: number | string | null) => {
        if (!timestamp) return 'Never';

        // Handle PHP timestamp (seconds) vs JS timestamp (milliseconds)
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

    return (
        <div className="w-full h-full p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <FaServer className="text-blue-500" />
                    Server & URL Monitoring
                </h1>
                <button
                    onClick={() => { setSelectedMonitor(undefined); setIsEditing(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20"
                >
                    <FaPlus size={14} /> Add Monitor
                </button>
            </div>

            {isLoading ? (
                <div className="text-slate-900 dark:text-white text-center py-10">Loading monitors...</div>
            ) : monitors.length === 0 ? (
                <div className="text-gray-400 text-center py-20 bg-slate-100 dark:bg-[#1e1e1e] rounded-xl border border-dashed border-slate-300 dark:border-[#444]">
                    <div className="mb-4 text-6xl">📊</div>
                    <p className="text-lg mb-4 text-slate-700 dark:text-gray-300">No monitors configured yet.</p>
                    <button
                        onClick={() => { setSelectedMonitor(undefined); setIsEditing(true); }}
                        className="text-blue-400 hover:text-blue-300 underline"
                    >
                        Create your first monitor
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {monitors.map(monitor => (
                        <div key={monitor.id} className={`border rounded-xl p-4 shadow-lg hover:shadow-xl transition-all group relative ${monitor.last_status === 'up' ? 'bg-emerald-600 border-emerald-500' : (monitor.last_status === 'down' ? 'bg-red-900/40 border-red-500/50' : 'bg-slate-50 dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]')}`}>
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleCheckNow(monitor.id)}
                                    disabled={checkingId === monitor.id}
                                    className={`p-1.5 rounded-full hover:bg-white/20 text-white transition-colors ${checkingId === monitor.id ? 'animate-spin' : ''} ${monitor.last_status === 'up' ? 'bg-black/20' : 'bg-[#333]'}`}
                                    title="Check Now"
                                >
                                    <FaRedo size={12} />
                                </button>
                                <button
                                    onClick={() => { setSelectedMonitor(monitor); setIsEditing(true); }}
                                    className={`p-1.5 rounded-full hover:bg-white/20 text-white transition-colors ${monitor.last_status === 'up' ? 'bg-black/20' : 'bg-[#333]'}`}
                                    title="Edit"
                                >
                                    <FaEdit size={12} />
                                </button>
                                <button
                                    onClick={() => handleDelete(monitor.id)}
                                    className={`p-1.5 rounded-full hover:bg-red-600 text-white transition-colors ${monitor.last_status === 'up' ? 'bg-black/20' : 'bg-[#333]'}`}
                                    title="Delete"
                                >
                                    <FaTrash size={12} />
                                </button>
                            </div>

                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${monitor.last_status === 'up' ? 'bg-white/20 text-white' : 'bg-white dark:bg-[#2a2a2a]'} ${monitor.last_status === 'down' ? 'border-2 border-red-500/50' : (monitor.last_status === 'up' ? 'border border-white/20' : 'border border-slate-200 dark:border-[#444]')}`}>
                                        {React.cloneElement(getTypeIcon(monitor.type), { className: monitor.last_status === 'up' ? 'text-white' : undefined })}
                                    </div>
                                    <div>
                                        <h3 className={`font-semibold leading-tight mb-1 truncate max-w-[150px] ${monitor.last_status === 'up' ? 'text-white' : 'text-slate-900 dark:text-white'}`} title={monitor.name}>
                                            {monitor.name}
                                        </h3>
                                        <div className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full inline-flex ${monitor.last_status === 'up' ? 'text-white bg-white/20' : 'text-slate-500 dark:text-gray-400 bg-slate-200 dark:bg-[#252525]'}`}>
                                            {React.cloneElement(getStatusIcon(monitor.last_status) as React.ReactElement, { className: monitor.last_status === 'up' ? 'text-white' : undefined })}
                                            <span className="uppercase font-bold tracking-wider">
                                                {monitor.last_status || 'UNKNOWN'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className={`text-xs break-all p-2 rounded border font-mono ${monitor.last_status === 'up' ? 'bg-black/20 border-white/10 text-white/90' : 'text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-[#252525] border-slate-200 dark:border-[#333]'}`}>
                                    {monitor.target}
                                    {monitor.port && <span className={monitor.last_status === 'up' ? 'text-white/70' : 'text-slate-400 dark:text-gray-500'}>:{monitor.port}</span>}
                                </div>
                            </div>

                            <div className={`flex flex-col gap-1 text-xs pt-3 border-t ${monitor.last_status === 'up' ? 'border-white/20 text-white/80' : 'border-slate-200 dark:border-[#333] text-slate-500 dark:text-gray-500'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1" title="Last Response Time">
                                        <FaClock size={10} />
                                        {monitor.last_response_time ? `${monitor.last_response_time}ms` : '-'}
                                    </div>
                                    <div>
                                        Every {monitor.interval}m
                                    </div>
                                </div>
                                <div className={`text-[10px] text-right ${monitor.last_status === 'up' ? 'text-white/60' : 'text-slate-400 dark:text-gray-600'}`}>
                                    Last checked: {formatLastChecked(monitor.last_checked_at)}
                                </div>
                            </div>
                        </div>))}
                </div>
            )}

            {isEditing && (
                <MonitorForm
                    monitor={selectedMonitor}
                    onSave={handleSave}
                    onCancel={() => setIsEditing(false)}
                />
            )}
        </div>
    );
};
