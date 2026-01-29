import React, { useState, useEffect } from 'react';
import { Monitorv2, Monitorv2NotificationRule, monitorv2Service } from '../services/monitorv2Service';
import { FaPlus, FaTrash, FaClock, FaEnvelope, FaTimes, FaSave, FaToggleOn, FaToggleOff } from 'react-icons/fa';

interface Monitorv2FormProps {
    monitor?: Monitorv2 | null;
    onSave: (monitor: Partial<Monitorv2>) => Promise<void>;
    onCancel: () => void;
    isAddingNew?: boolean;
    createdMonitorId?: number;
}

export const Monitorv2Form: React.FC<Monitorv2FormProps> = ({ monitor, onSave, onCancel, isAddingNew = false, createdMonitorId }) => {
    const [formData, setFormData] = useState<Partial<Monitorv2>>({
        name: '',
        type: 'url',
        target: '',
        port: undefined,
        keyword: '',
        interval: 5,
        warning_threshold: 1,
        timeout: 10,
        is_active: 1,
        email_notification: 0,
        tab_name: 'General',
        group_name: 'Other',
        legacy_email_to: '',
        legacy_email_cc: '',
        legacy_email_from_name: '',
        legacy_email_from_email: '',
        legacy_email_subject_template: '[{app_name} Monitor] {monitor_name} Status: {status}',
        legacy_email_body_template: 'Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}',
        allowed_user_ids: []
    });

    const [rules, setRules] = useState<Partial<Monitorv2NotificationRule>[]>([]);
    const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'advanced'>('general');
    const [saving, setSaving] = useState(false);
    const [users, setUsers] = useState<{id: number, username: string, email: string}[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    useEffect(() => {
        if (monitor) {
            setFormData({
                ...monitor,
                interval: monitor.interval || 5,
                warning_threshold: monitor.warning_threshold || 1,
                timeout: monitor.timeout || 10,
                is_active: monitor.is_active ?? 1,
                email_notification: monitor.email_notification ?? 0,
            });
            // Load rules if editing
            loadRules(monitor.id);
        }
        loadUsers();
    }, [monitor]);

    const loadRules = async (monitorId: number) => {
        try {
            const fullMonitor = await monitorv2Service.getMonitor(monitorId);
            if (fullMonitor.notification_rules) {
                setRules(fullMonitor.notification_rules);
            }
        } catch (err) {
            console.error('Failed to load rules', err);
        }
    };

    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const response = await fetch('api/auth.php/users');
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            }
        } catch (err) {
            console.error('Failed to load users', err);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(formData);
        } finally {
            setSaving(false);
        }
    };

    const addRule = () => {
        setRules([...rules, {
            name: 'New Rule',
            status_trigger: 'down',
            is_enabled: true,
            sort_order: rules.length,
            subject_template: '[{app_name} Monitor] {monitor_name} Status: {status}',
            body_template: 'Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}'
        }]);
    };

    const removeRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const updateRule = (index: number, field: keyof Monitorv2NotificationRule, value: any) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setRules(newRules);
    };

    const toggleUserPermission = (userId: number) => {
        const currentIds = formData.allowed_user_ids || [];
        if (currentIds.includes(userId)) {
            setFormData({
                ...formData,
                allowed_user_ids: currentIds.filter(id => id !== userId)
            });
        } else {
            setFormData({
                ...formData,
                allowed_user_ids: [...currentIds, userId]
            });
        }
    };

    const isUrlType = formData.type === 'url' || formData.type === 'keyword';
    const isPortType = formData.type === 'port';
    const isPingType = formData.type === 'ping';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header - aligned with MonitorForm (gray, same wording) */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-[#333] flex items-center justify-between bg-gray-50 dark:bg-[#252525]">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                            {(monitor?.id && !isAddingNew) ? 'Edit Monitor' : 'Add New Monitor'}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            Configure your monitoring settings
                        </p>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-200 dark:hover:bg-[#333] rounded-lg transition-colors text-gray-500">
                        <FaTimes size={20} />
                    </button>
                </div>

                {/* Tabs - blue accent to match Monitoring */}
                <div className="flex border-b border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#252525]">
                    {(['general', 'notifications', 'advanced'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium capitalize transition-colors ${
                                activeTab === tab
                                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-white dark:bg-[#1e1e1e]'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Form Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Monitor Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="e.g., Google Website"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Monitor Type *
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({...formData, type: e.target.value as any})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="url">URL (HTTP/HTTPS)</option>
                                        <option value="keyword">Keyword (HTTP + Content Check)</option>
                                        <option value="port">TCP Port</option>
                                        <option value="ping">Ping (ICMP)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Target */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Target {isUrlType ? 'URL' : isPortType ? 'Host' : 'Host/IP'} *
                                </label>
                                <input
                                    type="text"
                                    value={formData.target}
                                    onChange={e => setFormData({...formData, target: e.target.value})}
                                    className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder={isUrlType ? 'https://example.com' : isPortType ? 'example.com or IP' : '192.168.1.1'}
                                    required
                                />
                            </div>

                            {/* Type-specific fields */}
                            {isPortType && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Port Number *
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.port || ''}
                                        onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="80, 443, 3306, etc."
                                        min={1}
                                        max={65535}
                                        required
                                    />
                                </div>
                            )}

                            {formData.type === 'keyword' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Keyword to Search *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.keyword || ''}
                                        onChange={e => setFormData({...formData, keyword: e.target.value})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Text to search for in the page"
                                        required
                                    />
                                </div>
                            )}

                            {/* Interval and Timeout */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Check Interval (minutes)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.interval}
                                        onChange={e => setFormData({...formData, interval: parseInt(e.target.value)})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        min={1}
                                        max={1440}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Timeout (seconds)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.timeout || ''}
                                        onChange={e => setFormData({...formData, timeout: parseInt(e.target.value)})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        min={1}
                                        max={60}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Warning Threshold
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.warning_threshold}
                                        onChange={e => setFormData({...formData, warning_threshold: parseInt(e.target.value)})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        min={1}
                                        max={20}
                                        title="Consecutive failures before declaring DOWN"
                                    />
                                </div>
                            </div>

                            {/* Organization */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Tab Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.tab_name}
                                        onChange={e => setFormData({...formData, tab_name: e.target.value})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="General"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Group Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.group_name}
                                        onChange={e => setFormData({...formData, group_name: e.target.value})}
                                        className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Other"
                                    />
                                </div>
                            </div>

                            {/* Active Toggle */}
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setFormData({...formData, is_active: formData.is_active ? 0 : 1})}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                        formData.is_active
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}
                                >
                                    {formData.is_active ? <FaToggleOn size={20} /> : <FaToggleOff size={20} />}
                                    <span className="font-medium">{formData.is_active ? 'Active' : 'Inactive'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="space-y-6">
                            {/* Legacy Email Toggle */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#252525] rounded-lg">
                                <div>
                                    <h3 className="font-medium text-slate-900 dark:text-white">Legacy Email Notifications</h3>
                                    <p className="text-sm text-slate-500">Enable basic email notifications for this monitor</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFormData({...formData, email_notification: formData.email_notification ? 0 : 1})}
                                    className={`text-2xl transition-colors ${
                                        formData.email_notification ? 'text-blue-600' : 'text-slate-400'
                                    }`}
                                >
                                    {formData.email_notification ? <FaToggleOn /> : <FaToggleOff />}
                                </button>
                            </div>

                            {formData.email_notification === 1 && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                To Email(s)
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.legacy_email_to || ''}
                                                onChange={e => setFormData({...formData, legacy_email_to: e.target.value})}
                                                className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="admin@example.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                CC Email(s)
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.legacy_email_cc || ''}
                                                onChange={e => setFormData({...formData, legacy_email_cc: e.target.value})}
                                                className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Comma-separated emails"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                From Name
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.legacy_email_from_name || ''}
                                                onChange={e => setFormData({...formData, legacy_email_from_name: e.target.value})}
                                                className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="LinkNest Monitor"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                From Email
                                            </label>
                                            <input
                                                type="email"
                                                value={formData.legacy_email_from_email || ''}
                                                onChange={e => setFormData({...formData, legacy_email_from_email: e.target.value})}
                                                className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="monitor@example.com"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Subject Template
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.legacy_email_subject_template || ''}
                                            onChange={e => setFormData({...formData, legacy_email_subject_template: e.target.value})}
                                            className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            Variables: {'{monitor_name}'}, {'{status}'}, {'{time}'}, {'{app_name}'}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Body Template
                                        </label>
                                        <textarea
                                            value={formData.legacy_email_body_template || ''}
                                            onChange={e => setFormData({...formData, legacy_email_body_template: e.target.value})}
                                            rows={4}
                                            className="w-full border border-slate-300 dark:border-[#444] rounded-lg px-3 py-2 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            Variables: {'{monitor_name}'}, {'{status}'}, {'{time}'}, {'{details}'}, {'{app_name}'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Notification Rules */}
                            <div className="border-t border-slate-200 dark:border-[#333] pt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-medium text-slate-900 dark:text-white">Advanced Notification Rules</h3>
                                    <button
                                        type="button"
                                        onClick={addRule}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                    >
                                        <FaPlus size={12} />
                                        Add Rule
                                    </button>
                                </div>

                                {rules.length === 0 ? (
                                    <p className="text-sm text-slate-500">No notification rules configured.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {rules.map((rule, index) => (
                                            <div key={index} className="p-4 bg-slate-50 dark:bg-[#252525] rounded-lg border border-slate-200 dark:border-[#333]">
                                                <div className="flex items-center justify-between mb-3">
                                                    <input
                                                        type="text"
                                                        value={rule.name || ''}
                                                        onChange={e => updateRule(index, 'name', e.target.value)}
                                                        className="font-medium bg-transparent border-b border-slate-300 dark:border-[#444] focus:border-purple-500 outline-none"
                                                        placeholder="Rule Name"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRule(index)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                    >
                                                        <FaTrash size={14} />
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-3 gap-3 mb-3">
                                                    <div>
                                                        <label className="text-xs text-slate-500">Trigger</label>
                                                        <select
                                                            value={rule.status_trigger || 'down'}
                                                            onChange={e => updateRule(index, 'status_trigger', e.target.value)}
                                                            className="w-full mt-1 border border-slate-300 dark:border-[#444] rounded px-2 py-1 text-sm bg-white dark:bg-[#1e1e1e]"
                                                        >
                                                            <option value="down">Down</option>
                                                            <option value="up">Up</option>
                                                            <option value="both">Both</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-500">Time Window Start</label>
                                                        <input
                                                            type="time"
                                                            value={rule.time_window_start || ''}
                                                            onChange={e => updateRule(index, 'time_window_start', e.target.value)}
                                                            className="w-full mt-1 border border-slate-300 dark:border-[#444] rounded px-2 py-1 text-sm bg-white dark:bg-[#1e1e1e]"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-500">Time Window End</label>
                                                        <input
                                                            type="time"
                                                            value={rule.time_window_end || ''}
                                                            onChange={e => updateRule(index, 'time_window_end', e.target.value)}
                                                            className="w-full mt-1 border border-slate-300 dark:border-[#444] rounded px-2 py-1 text-sm bg-white dark:bg-[#1e1e1e]"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.is_enabled ?? true}
                                                        onChange={e => updateRule(index, 'is_enabled', e.target.checked)}
                                                        className="rounded border-slate-300"
                                                    />
                                                    <span className="text-sm text-slate-600 dark:text-slate-400">Enabled</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'advanced' && (
                        <div className="space-y-6">
                            {/* User Permissions */}
                            <div>
                                <h3 className="font-medium text-slate-900 dark:text-white mb-3">User Permissions</h3>
                                <p className="text-sm text-slate-500 mb-3">
                                    Select users who can view this monitor. Leave empty for admin-only access.
                                </p>

                                {loadingUsers ? (
                                    <div className="text-center py-4">
                                        <div className="inline-block w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 dark:bg-[#252525] rounded-lg">
                                        {users.map(user => {
                                            const isSelected = (formData.allowed_user_ids || []).includes(user.id);
                                            return (
                                                <label
                                                    key={user.id}
                                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                                        isSelected
                                                            ? 'bg-blue-100 dark:bg-blue-900/30'
                                                            : 'hover:bg-slate-100 dark:hover:bg-[#333]'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleUserPermission(user.id)}
                                                        className="rounded border-slate-300 text-blue-600 focus:ring-purple-500"
                                                    />
                                                    <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Help Text */}
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">Template Variables</h4>
                                <div className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                                    <p><code>{'{monitor_name}'}</code> - Name of the monitor</p>
                                    <p><code>{'{status}'}</code> - Current status (UP/DOWN)</p>
                                    <p><code>{'{time}'}</code> - Current timestamp</p>
                                    <p><code>{'{details}'}</code> - Status details</p>
                                    <p><code>{'{app_name}'}</code> - Application name</p>
                                </div>
                            </div>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-[#333] flex justify-end gap-3 bg-slate-50 dark:bg-[#252525]">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                    >
                        <FaSave size={16} />
                        {saving ? 'Saving...' : (monitor?.id && !isAddingNew) ? 'Update Monitor' : 'Create Monitor'}
                    </button>
                </div>
            </div>
        </div>
    );
};
