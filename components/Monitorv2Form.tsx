import React, { useState, useEffect, useRef } from 'react';
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
        legacy_email_subject_template: '[{app_name} Monitor] {monitor_name} - {status}',
        legacy_email_body_template: 'Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}',
        allowed_user_ids: []
    });

    const [rules, setRules] = useState<Partial<Monitorv2NotificationRule>[]>([]);
    const [activeTab, setActiveTab] = useState<'settings' | 'notifications' | 'advanced'>('settings');
    const [saving, setSaving] = useState(false);
    const [users, setUsers] = useState<{id: number, username: string, email: string}[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Draggable modal (match Monitoring tab)
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);
    const monitorFormRef = useRef<HTMLFormElement>(null);

    // Initialize position on mount
    useEffect(() => {
        if (!isInitialized.current && modalRef.current) {
            const rect = modalRef.current.getBoundingClientRect();
            setPosition({
                x: (window.innerWidth - rect.width) / 2,
                y: (window.innerHeight - rect.height) / 2
            });
            isInitialized.current = true;
        }
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

    // Handle drag start
    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (modalRef.current && (e.target as HTMLElement).closest('[data-drag-handle]')) {
            e.preventDefault();
            e.stopPropagation();
            const rect = modalRef.current.getBoundingClientRect();
            dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setPosition({ x: rect.left, y: rect.top });
            setIsDragging(true);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragOffset.current.x,
                    y: e.clientY - dragOffset.current.y
                });
            }
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
        }
    }, [isDragging]);

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

    const FieldHelp: React.FC<{ text: string }> = ({ text }) => (
        <p className="text-xs text-gray-600 mt-1">{text}</p>
    );

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
                {/* Draggable Header - match Monitoring tab */}
                <div
                    data-drag-handle
                    className={`px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                >
                    <h2 className="text-xl font-semibold text-gray-800">
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
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
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

                {/* Tabs - match Monitoring tab (Settings, Email Notifications, Advanced) */}
                <div className="border-b border-gray-200 bg-gray-50 px-6">
                    <div className="flex space-x-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('settings')}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'settings'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Settings
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('notifications')}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notifications'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Email Notifications
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('advanced')}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'advanced'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Advanced
                        </button>
                    </div>
                </div>

                {/* Scrollable Content - match Monitoring tab */}
                <div className="overflow-y-auto flex-1 p-6 bg-white">
                    {activeTab === 'settings' && (
                        <>
                            <div className="mb-4">
                                <button type="button" className="text-sm text-blue-600 hover:text-blue-700">
                                    Show Templates
                                </button>
                            </div>

                            <form ref={monitorFormRef} id="monitor-form" onSubmit={handleSubmit} className="space-y-5">
                                {/* Basic Information Section */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                                        Basic Information
                                    </h3>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Monitor Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                            placeholder="My Server"
                                            required
                                        />
                                        <FieldHelp text="A friendly name to identify this monitor in your dashboard (e.g., 'Production Server', 'API Endpoint')" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Monitor Type <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={formData.type}
                                            onChange={e => setFormData({...formData, type: e.target.value as Monitorv2['type']})}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                        >
                                            <option value="url">URL Check</option>
                                            <option value="keyword">Keyword Check</option>
                                            <option value="port">Port Check</option>
                                            <option value="ping">Ping Check</option>
                                        </select>
                                        <FieldHelp text={
                                            formData.type === 'url'
                                                ? "Checks if a website or API endpoint is accessible via HTTP/HTTPS request"
                                                : formData.type === 'keyword'
                                                    ? "Checks if a specific text/keyword appears in the webpage content"
                                                    : formData.type === 'port'
                                                        ? "Checks if a network port on a server is open and accepting connections"
                                                        : "Checks if the host/IP responds to ping"
                                        } />
                                    </div>
                                </div>

                                {/* Target Configuration Section */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                                        Target Configuration
                                    </h3>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {(formData.type === 'port' || formData.type === 'ping') ? 'Host / IP Address' : 'URL'} <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type={(formData.type === 'port' || formData.type === 'ping') ? 'text' : 'url'}
                                            value={formData.target}
                                            onChange={e => setFormData({...formData, target: e.target.value})}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                            placeholder={(formData.type === 'port' || formData.type === 'ping') ? '192.168.1.1 or example.com' : 'https://example.com'}
                                            required
                                        />
                                        <FieldHelp text={
                                            (formData.type === 'port' || formData.type === 'ping')
                                                ? "The IP address or hostname of the server to check (e.g., 192.168.1.1, server.example.com)"
                                                : "The full URL to monitor, including protocol (http:// or https://). For APIs, include the full endpoint path."
                                        } />
                                    </div>
                                    {isPortType && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Port Number <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.port ?? ''}
                                                onChange={e => setFormData({...formData, port: parseInt(e.target.value) || undefined})}
                                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                                placeholder="80, 443, 3306, etc."
                                                min={1}
                                                max={65535}
                                                required
                                            />
                                            <FieldHelp text="The network port number to check (common ports: 80 for HTTP, 443 for HTTPS, 22 for SSH, 3306 for MySQL)" />
                                        </div>
                                    )}
                                    {formData.type === 'keyword' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Keyword to Search <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.keyword || ''}
                                                onChange={e => setFormData({...formData, keyword: e.target.value})}
                                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                                placeholder="Welcome, Success, Error"
                                                required
                                            />
                                            <FieldHelp text="The text string to search for in the webpage. Monitor will be marked as 'up' if this keyword is found, 'down' if not found." />
                                        </div>
                                    )}
                                    {(isUrlType) && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Timeout (seconds)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.timeout ?? ''}
                                                onChange={e => setFormData({...formData, timeout: parseInt(e.target.value) || undefined})}
                                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                                placeholder="5"
                                                min={1}
                                                max={60}
                                            />
                                            <FieldHelp text="Maximum time to wait for the HTTP request before marking the check as failed. Leave blank to use the default." />
                                        </div>
                                    )}
                                </div>

                                {/* Monitoring Settings Section */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                                        Monitoring Settings
                                    </h3>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Check Interval (minutes) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.interval}
                                            onChange={e => setFormData({...formData, interval: parseInt(e.target.value) || 5})}
                                            min={1}
                                            max={1440}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                            required
                                        />
                                        <FieldHelp text="How often the monitor should check the target on its normal schedule (cron/worker). Lower values provide faster alerts but use more resources." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Warning Threshold (failures) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.warning_threshold}
                                            onChange={e => setFormData({...formData, warning_threshold: parseInt(e.target.value) || 1})}
                                            min={1}
                                            max={20}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                            required
                                        />
                                        <FieldHelp text="Number of consecutive failed checks before the monitor is considered DOWN. Failures below this threshold show as WARNING." />
                                    </div>
                                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <input
                                            type="checkbox"
                                            checked={!!formData.is_active}
                                            onChange={e => setFormData({...formData, is_active: e.target.checked ? 1 : 0})}
                                            id="isActive"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                                        />
                                        <div className="flex-1">
                                            <label htmlFor="isActive" className="text-sm font-medium text-gray-700 cursor-pointer">
                                                Enable this monitor
                                            </label>
                                            <FieldHelp text="When enabled, the monitor will run checks according to the interval. Disable to temporarily pause monitoring without deleting the monitor." />
                                        </div>
                                    </div>
                                </div>

                                {/* Organization Section */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                                        Organization (Optional)
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tab Name</label>
                                            <input
                                                type="text"
                                                value={formData.tab_name || ''}
                                                onChange={e => setFormData({...formData, tab_name: e.target.value})}
                                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                                placeholder="General"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                                            <input
                                                type="text"
                                                value={formData.group_name || ''}
                                                onChange={e => setFormData({...formData, group_name: e.target.value})}
                                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                                placeholder="Other"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </>
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
                </div>

                {/* Footer with Actions - Only show on Settings tab (match Monitoring tab) */}
                {activeTab === 'settings' && (
                    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
                        {isAddingNew && createdMonitorId ? (
                            <button
                                type="button"
                                onClick={onCancel}
                                className="px-5 py-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 border border-gray-300"
                            >
                                Done
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="px-5 py-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 border border-gray-300"
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const form = monitorFormRef.current || (document.getElementById('monitor-form') as HTMLFormElement | null);
                                        if (form) form.requestSubmit();
                                    }}
                                    disabled={saving}
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                    {saving ? 'Saving...' : (monitor?.id && !isAddingNew) ? 'Update Monitor' : 'Create Monitor'}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
