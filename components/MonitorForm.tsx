import React, { useState, useEffect, useRef } from 'react';
import { Monitor } from '../services/monitoringService';
import { EmailNotificationsTab } from './EmailNotificationsTab';
import { EmailLogsTab } from './EmailLogsTab';
import { useAuth } from '../contexts/AuthContext';
import { authService, UserListItem } from '../services/authService';

interface MonitorFormProps {
    monitor?: Monitor;
    onSave: (monitor: Partial<Monitor>) => Promise<void>;
    onCancel: () => void;
}

interface MonitorPreset {
    name: string;
    description: string;
    type: 'url' | 'keyword' | 'port' | 'ping';
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
        name: 'Keyword Check',
        description: 'Verify specific text appears on page',
        type: 'keyword',
        target: 'https://example.com',
        keyword: 'Welcome',
        interval: 5,
        group_name: 'Web Servers'
    }
];

export const MonitorForm: React.FC<MonitorFormProps> = ({ monitor, onSave, onCancel }) => {
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;

    const [name, setName] = useState(monitor?.name || '');
    const [type, setType] = useState<Monitor['type']>(monitor?.type || 'url');
    const [target, setTarget] = useState(monitor?.target || '');
    const [port, setPort] = useState(monitor?.port?.toString() || '');
    const [keyword, setKeyword] = useState(monitor?.keyword || '');
    const [interval, setInterval] = useState(monitor?.interval?.toString() || '5');
    const [warningThreshold, setWarningThreshold] = useState((monitor?.warning_threshold ?? 1).toString());
    const [timeoutSec, setTimeoutSec] = useState(monitor?.timeout !== null && monitor?.timeout !== undefined ? String(monitor?.timeout) : '');
    const [tabName, setTabName] = useState(monitor?.tab_name || '');
    const [groupName, setGroupName] = useState(monitor?.group_name || '');
    const [emailNotification, setEmailNotification] = useState(!!monitor?.email_notification);
    const [legacyEmailTo, setLegacyEmailTo] = useState(monitor?.legacy_email_to || '');
    const [legacyEmailCc, setLegacyEmailCc] = useState(monitor?.legacy_email_cc || '');
    const [legacyEmailFromName, setLegacyEmailFromName] = useState(monitor?.legacy_email_from_name || '');
    const [legacyEmailFromEmail, setLegacyEmailFromEmail] = useState(monitor?.legacy_email_from_email || '');
    const [legacyEmailDisabled, setLegacyEmailDisabled] = useState((monitor?.legacy_email_disabled ?? 0) === 1);
    const [legacyEmailSubjectTemplate, setLegacyEmailSubjectTemplate] = useState(
        monitor?.legacy_email_subject_template || '[LinkNest Monitor] {monitor_name} Status Update'
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
    const [activeTab, setActiveTab] = useState<'settings' | 'notifications' | 'logs'>('settings');
    const [pendingSubmitAfterTabSwitch, setPendingSubmitAfterTabSwitch] = useState(false);
    const monitorFormRef = useRef<HTMLFormElement>(null);

    // Permissions (admin only)
    const [usersList, setUsersList] = useState<UserListItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [allowedUsers, setAllowedUsers] = useState<number[]>(monitor?.allowed_user_ids || []);
    const [showUserSelector, setShowUserSelector] = useState(false);

    // Draggable state
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);

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

    // Handle drag start
    const handleMouseDown = (e: React.MouseEvent) => {
        if (modalRef.current && (e.target as HTMLElement).closest('[data-drag-handle]')) {
            e.preventDefault();
            e.stopPropagation();
            // Get the actual current position of the modal from the DOM
            const rect = modalRef.current.getBoundingClientRect();
            // Calculate offset from mouse position to modal's top-left corner
            dragOffset.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            setIsDragging(true);
        }
    };

    // Handle dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                // Calculate new position: mouse position minus the stored offset
                const newX = e.clientX - dragOffset.current.x;
                const newY = e.clientY - dragOffset.current.y;
                
                // Allow free movement - no viewport constraints
                setPosition({
                    x: newX,
                    y: newY
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const wt = Math.max(1, Math.min(20, parseInt(warningThreshold || '1')));
            const timeoutVal = timeoutSec.trim() === '' ? undefined : Math.max(1, Math.min(60, parseInt(timeoutSec)));
            await onSave({
                name,
                type,
                target,
                port: port ? parseInt(port) : undefined,
                keyword,
                interval: parseInt(interval),
                warning_threshold: wt,
                timeout: timeoutVal,
                allowed_user_ids: isAdmin ? allowedUsers : undefined,
                tab_name: tabName || undefined,
                group_name: groupName || undefined,
                email_notification: emailNotification ? 1 : 0,
                is_active: isActive ? 1 : 0,
                legacy_email_disabled: legacyEmailDisabled ? 1 : 0,
                legacy_email_to: legacyEmailTo.trim() || undefined,
                legacy_email_cc: legacyEmailCc.trim() || undefined,
                legacy_email_from_name: legacyEmailFromName.trim() || undefined,
                legacy_email_from_email: legacyEmailFromEmail.trim() || undefined,
                legacy_email_subject_template: legacyEmailSubjectTemplate.trim() || undefined,
                legacy_email_body_template: legacyEmailBodyTemplate || undefined
            });
        } catch (err: any) {
            setError(err.message || 'Failed to save monitor');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFooterSaveClick = () => {
        if (isSubmitting) return;
        if (activeTab !== 'settings') {
            setPendingSubmitAfterTabSwitch(true);
            setActiveTab('settings');
            return;
        }
        const form = monitorFormRef.current || (document.getElementById('monitor-form') as HTMLFormElement | null);
        form?.requestSubmit();
    };

    const FieldHelp: React.FC<{ text: string }> = ({ text }) => (
        <p className="text-xs text-gray-600 mt-1">{text}</p>
    );

    const filteredPresets = MONITOR_PRESETS.filter(p => !monitor);

    return (
        <div className="fixed inset-0 z-50" onClick={onCancel} style={{ backgroundColor: 'transparent' }}>
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
                    className={`px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                >
                    <h2 className="text-xl font-semibold text-gray-800">
                        {monitor ? 'Edit Monitor' : 'Add New Monitor'}
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
                            onClick={onCancel}
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
                {monitor && monitor.id && (
                    <div className="border-b border-gray-200 bg-gray-50 px-6">
                        <div className="flex space-x-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab('settings')}
                                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                                    activeTab === 'settings'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Settings
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('notifications')}
                                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                                    activeTab === 'notifications'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Email Notifications
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('logs')}
                                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                                    activeTab === 'logs'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Email Logs
                            </button>
                        </div>
                    </div>
                )}

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-6 bg-white">
                    {activeTab === 'notifications' && monitor && monitor.id ? (
                        <EmailNotificationsTab monitorId={monitor.id} />
                    ) : activeTab === 'logs' && monitor && monitor.id ? (
                        <EmailLogsTab monitorId={monitor.id} />
                    ) : (
                        <>
                            {showPresets && filteredPresets.length > 0 && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-gray-800">Quick Templates</h3>
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
                                className="text-sm text-blue-600 hover:text-blue-700"
                            >
                                Show Templates
                            </button>
                        </div>
                    )}

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
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
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
                                    value={type}
                                    onChange={(e) => setType(e.target.value as Monitor['type'])}
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                >
                                    <option value="url">URL Check</option>
                                    <option value="keyword">Keyword Check</option>
                                    <option value="port">Port Check</option>
                                    <option value="ping">Ping Check</option>
                                </select>
                                <FieldHelp text={
                                    type === 'url' 
                                        ? "Checks if a website or API endpoint is accessible via HTTP/HTTPS request"
                                        : type === 'keyword'
                                        ? "Checks if a specific text/keyword appears in the webpage content"
                                        : type === 'port'
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
                                    {(type === 'port' || type === 'ping') ? 'Host / IP Address' : 'URL'} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type={(type === 'port' || type === 'ping') ? 'text' : 'url'}
                                    value={target}
                                    onChange={(e) => setTarget(e.target.value)}
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                    placeholder={(type === 'port' || type === 'ping') ? '192.168.1.1 or example.com' : 'https://example.com'}
                                    required
                                />
                                <FieldHelp text={
                                    (type === 'port' || type === 'ping')
                                        ? "The IP address or hostname of the server to check (e.g., 192.168.1.1, server.example.com)"
                                        : "The full URL to monitor, including protocol (http:// or https://). For APIs, include the full endpoint path."
                                } />
                            </div>

                            {type === 'port' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Port Number <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={port}
                                        onChange={(e) => setPort(e.target.value)}
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                        placeholder="80, 443, 3306, etc."
                                        min="1"
                                        max="65535"
                                        required
                                    />
                                    <FieldHelp text="The network port number to check (common ports: 80 for HTTP, 443 for HTTPS, 22 for SSH, 3306 for MySQL)" />
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
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                        placeholder="Welcome, Success, Error"
                                        required
                                    />
                                    <FieldHelp text="The text string to search for in the webpage. Monitor will be marked as 'up' if this keyword is found, 'down' if not found." />
                                </div>
                            )}

                            {(type === 'url' || type === 'keyword') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Timeout (seconds)
                                    </label>
                                    <input
                                        type="number"
                                        value={timeoutSec}
                                        onChange={(e) => setTimeoutSec(e.target.value)}
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                        placeholder={type === 'url' ? '5' : '8'}
                                        min="1"
                                        max="60"
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
                                    value={interval}
                                    onChange={(e) => setInterval(e.target.value)}
                                    min="1"
                                    max="1440"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                    required
                                />
                                <FieldHelp text="How often the monitor should check the target on its normal schedule (cron/worker). Lower values provide faster alerts but use more resources. Note: 'Check Now' / 'Force refresh' runs immediately and does not wait for this interval." />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Warning Threshold (failures) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    value={warningThreshold}
                                    onChange={(e) => setWarningThreshold(e.target.value)}
                                    min="1"
                                    max="20"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                    required
                                />
                                <FieldHelp text="Number of consecutive failed checks before the monitor is considered DOWN. Failures below this threshold show as WARNING." />
                            </div>

                            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
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
                                        value={tabName}
                                        onChange={(e) => setTabName(e.target.value)}
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                        placeholder="General"
                                    />
                                    <FieldHelp text="Organize monitors into tabs for easier navigation (e.g., 'Production', 'Development', 'External')" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                                    <input
                                        type="text"
                                        value={groupName}
                                        onChange={(e) => setGroupName(e.target.value)}
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                        placeholder="Servers"
                                    />
                                    <FieldHelp text="Group related monitors together within a tab (e.g., 'Web Servers', 'Database Servers', 'APIs')" />
                                </div>
                            </div>
                        </div>

                        {/* Permissions Section */}
                        {isAdmin && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                                    Permissions (Optional)
                                </h3>

                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">Visible to selected users</div>
                                            <div className="text-xs text-gray-600 mt-1">If you select users, only they (and admins) will see this monitor.</div>
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
                                            No users selected: this monitor will be visible to all authenticated users.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Notifications Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                                Notifications
                            </h3>

                            <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <input
                                    type="checkbox"
                                    checked={emailNotification}
                                    onChange={(e) => setEmailNotification(e.target.checked)}
                                    id="emailNotif"
                                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                                />
                                <div className="flex-1">
                                    <label htmlFor="emailNotif" className="text-sm font-medium text-gray-700 cursor-pointer block">
                                        Send email notification on status change
                                    </label>
                                    <FieldHelp text="Receive email alerts when the monitor status changes from 'up' to 'down' or vice versa. Make sure SMTP settings are configured in the admin panel." />
                                </div>
                            </div>

                            {emailNotification && (
                                <div className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <input
                                        type="checkbox"
                                        checked={legacyEmailDisabled}
                                        onChange={(e) => setLegacyEmailDisabled(e.target.checked)}
                                        id="legacyEmailDisabled"
                                        className="w-4 h-4 mt-0.5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <div className="flex-1">
                                        <label htmlFor="legacyEmailDisabled" className="text-sm font-semibold text-purple-900 cursor-pointer block">
                                            Rule-based only (disable legacy emails)
                                        </label>
                                        <FieldHelp text="When enabled, the old built-in (legacy) email alerts will not send for this monitor. Only rule-based notifications (Email Notifications tab) will be sent." />
                                    </div>
                                </div>
                            )}

                            {/* Legacy Email Customization */}
                            {emailNotification && !legacyEmailDisabled && (
                                <div className="p-4 bg-white rounded-lg border border-gray-200 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">Legacy Email Customization</div>
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
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
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
                                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
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
                                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                                                        placeholder="LinkNest Monitor"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        From Email (optional)
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={legacyEmailFromEmail}
                                                        onChange={(e) => setLegacyEmailFromEmail(e.target.value)}
                                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
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
                                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
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
                        </div>

                        {error && (
                            <div className="text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
                                <strong>Error:</strong> {error}
                            </div>
                        )}
                    </form>
                        </>
                    )}
                </div>

                {/* Footer with Actions */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-5 py-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 border border-gray-300"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleFooterSaveClick}
                        disabled={isSubmitting}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        {isSubmitting ? 'Saving...' : monitor ? 'Update Monitor' : 'Create Monitor'}
                    </button>
                </div>
            </div>
        </div>
    );
};
