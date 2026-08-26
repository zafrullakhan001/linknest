import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaEnvelope, FaServer, FaKey, FaCheckCircle, FaExclamationTriangle, FaBellSlash, FaClock, FaPlus, FaTrash, FaEdit, FaCheck, FaVial } from 'react-icons/fa';
import { SMTPServer, smtpService, SMTP_PROVIDER_PRESETS, detectSmtpProvider, getSmtpProviderPreset, type SmtpProviderId } from '../services/smtpService';
import { useSettings } from '../contexts/SettingsContext';

interface SMTPSettingsModalProps {
    onClose: () => void;
}

export const SMTPSettingsModal: React.FC<SMTPSettingsModalProps> = ({ onClose }) => {
    const { settings } = useSettings();
    const appName = settings?.app_name || 'LinkNest';
    const [servers, setServers] = useState<SMTPServer[]>([]);
    const [selectedServer, setSelectedServer] = useState<SMTPServer | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [smtpProvider, setSmtpProvider] = useState<SmtpProviderId>('custom');

    const [formData, setFormData] = useState<Partial<SMTPServer>>({
        name: '',
        host: '',
        port: 587,
        username: '',
        password: '',
        from_email: '',
        from_name: `${appName} Monitor`,
        encryption: 'tls',
        is_enabled: true,
        is_active: false,
        pause_start: '',
        pause_end: ''
    });

    const applySmtpProvider = (id: SmtpProviderId) => {
        setSmtpProvider(id);
        const preset = getSmtpProviderPreset(id);
        setFormData((prev) => ({
            ...prev,
            name: id === 'custom' ? (prev.name || '') : preset.nameHint,
            host: id === 'custom' ? (prev.host || '') : preset.host,
            port: id === 'custom' ? (prev.port || 587) : preset.port,
            encryption: id === 'custom' ? (prev.encryption || 'tls') : preset.encryption,
        }));
    };

    const updateFormField = <K extends keyof SMTPServer>(key: K, value: SMTPServer[K]) => {
        setFormData((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'host' || key === 'port' || key === 'encryption') {
                setSmtpProvider(detectSmtpProvider(String(next.host || ''), Number(next.port) || 587, String(next.encryption || 'tls')));
            }
            return next;
        });
    };

    // Dragging logic
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<{ offsetX: number, offsetY: number } | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (modalRef.current) {
            const rect = modalRef.current.getBoundingClientRect();

            // If this is the first drag, initialize position to current centered coordinates
            // to prevent the jump to (0,0) when switching to position: fixed
            if (position.x === 0 && position.y === 0) {
                setPosition({ x: rect.left, y: rect.top });
            }

            dragRef.current = {
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top
            };
            setIsDragging(true);
            document.body.style.userSelect = 'none'; // Prevent text selection while dragging
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && dragRef.current) {
                setPosition({
                    x: e.clientX - dragRef.current.offsetX,
                    y: e.clientY - dragRef.current.offsetY
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            dragRef.current = null;
            document.body.style.userSelect = ''; // Re-enable text selection
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        try {
            const data = await smtpService.getAllServers();
            setServers(data);

            // Select the active server by default
            const activeServer = data.find(s => s.is_active);
            if (activeServer) {
                setSelectedServer(activeServer);
            }
        } catch (error) {
            console.error('Failed to load SMTP servers', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNew = () => {
        setIsCreating(true);
        setIsEditing(true);
        setSelectedServer(null);
        setSmtpProvider('custom');
        setFormData({
            name: '',
            host: '',
            port: 587,
            username: '',
            password: '',
            from_email: '',
            from_name: `${appName} Monitor`,
            encryption: 'tls',
            is_enabled: true,
            is_active: false,
            pause_start: '',
            pause_end: ''
        });
        setTestResult(null);
    };

    const handleEdit = (server: SMTPServer) => {
        setIsCreating(false);
        setIsEditing(true);
        setSelectedServer(server);
        setSmtpProvider(detectSmtpProvider(server.host, server.port, server.encryption));
        setFormData({
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            password: '', // Don't populate password
            from_email: server.from_email,
            from_name: server.from_name,
            encryption: server.encryption,
            is_enabled: server.is_enabled,
            is_active: server.is_active,
            pause_start: server.pause_start,
            pause_end: server.pause_end
        });
        setTestResult(null);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setIsCreating(false);
        setFormData({});
        setTestResult(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (isCreating) {
                await smtpService.createServer(formData as Omit<SMTPServer, 'id' | 'created_at' | 'updated_at'>);
                alert('SMTP server created successfully!');
            } else if (selectedServer) {
                await smtpService.updateServer(selectedServer.id!, formData);
                alert('SMTP server updated successfully!');
            }

            await loadServers();
            handleCancelEdit();
        } catch (error) {
            console.error('Failed to save SMTP server', error);
            alert('Failed to save SMTP server');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (serverId: number) => {
        if (!confirm('Are you sure you want to delete this SMTP server?')) {
            return;
        }

        try {
            await smtpService.deleteServer(serverId);
            await loadServers();
            setSelectedServer(null);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to delete SMTP server', error);
            alert('Failed to delete SMTP server');
        }
    };

    const handleActivate = async (serverId: number) => {
        try {
            await smtpService.activateServer(serverId);
            await loadServers();
        } catch (error) {
            console.error('Failed to activate SMTP server', error);
            alert('Failed to activate SMTP server');
        }
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            let result;
            if (isCreating || isEditing) {
                // Test with form data
                result = await smtpService.testConnection(formData);
            } else if (selectedServer) {
                // Test existing server
                result = await smtpService.testConnection({ server_id: selectedServer.id! });
            }
            setTestResult(result!);
        } catch (error) {
            console.error('Failed to test SMTP connection', error);
            setTestResult({ success: false, message: 'Failed to test connection' });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-hidden">
            <div
                ref={modalRef}
                style={isDragging || position.x !== 0 ? {
                    position: 'fixed',
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    margin: 0
                } : {}}
                className="bg-white dark:bg-[#1a1a1a] w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex border border-slate-200 dark:border-[#333]"
            >
                {/* Left Sidebar - Server List */}
                <div className="w-80 border-r border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#202020] flex flex-col">
                    <div className="p-4 border-b border-slate-200 dark:border-[#333]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <FaEnvelope {...({ className: "text-blue-500 text-lg" } as any)} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">SMTP Servers</h2>
                                <p className="text-xs text-slate-500 dark:text-gray-400">Manage email servers</p>
                            </div>
                        </div>
                        <button
                            onClick={handleCreateNew}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <FaPlus size={14} /> Add Server
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                            </div>
                        ) : servers.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 dark:text-gray-400 text-sm">
                                No SMTP servers configured
                            </div>
                        ) : (
                            servers.map((server) => (
                                <div
                                    key={server.id}
                                    onClick={() => {
                                        setSelectedServer(server);
                                        setIsEditing(false);
                                        setIsCreating(false);
                                    }}
                                    className={`p-3 rounded-xl cursor-pointer transition-all ${selectedServer?.id === server.id
                                        ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                                        : 'bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] hover:border-blue-300 dark:hover:border-blue-700'
                                        }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">{server.name}</h3>
                                            <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{server.host}</p>
                                        </div>
                                        {server.is_active && (
                                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                                                ACTIVE
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${server.is_enabled
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                            }`}>
                                            {server.is_enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Panel - Server Details/Edit */}
                <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div
                        onMouseDown={handleMouseDown}
                        className="p-6 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-slate-50 dark:bg-[#202020] cursor-move"
                    >
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                {isCreating ? 'New SMTP Server' : isEditing ? 'Edit Server' : selectedServer ? selectedServer.name : 'Select a Server'}
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-gray-400">
                                {isCreating ? 'Configure a new email server' : isEditing ? 'Update server configuration' : 'View and manage server'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-400"
                        >
                            <FaTimes size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {!selectedServer && !isCreating ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-gray-400">
                                <FaServer size={48} {...({ className: "mb-4 opacity-50" } as any)} />
                                <p>Select a server from the list or create a new one</p>
                            </div>
                        ) : isEditing || isCreating ? (
                            <>
                                {/* Provider preset */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Provider</label>
                                    <select
                                        value={smtpProvider}
                                        onChange={(e) => applySmtpProvider(e.target.value as SmtpProviderId)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        {SMTP_PROVIDER_PRESETS.map((p) => (
                                            <option key={p.id} value={p.id}>{p.label}</option>
                                        ))}
                                    </select>
                                    <p className="mt-2 text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
                                        {getSmtpProviderPreset(smtpProvider).help}
                                    </p>
                                    {smtpProvider === 'office365' && (
                                        <div className="mt-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-xs text-sky-900 dark:text-sky-100 leading-relaxed">
                                            <strong>Office 365:</strong> Enable Authenticated SMTP for the mailbox in Microsoft 365 admin.
                                            Username = full email. Use an app password if MFA is enabled. From address should match that mailbox.
                                        </div>
                                    )}
                                </div>

                                {/* Server Name */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Server Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => updateFormField('name', e.target.value)}
                                        placeholder="e.g., Primary SMTP, Office 365"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                {/* Server Configuration */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <FaServer size={12} /> Server Configuration
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">SMTP Host</label>
                                            <input
                                                type="text"
                                                value={formData.host}
                                                onChange={(e) => updateFormField('host', e.target.value)}
                                                placeholder="smtp.office365.com"
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Port</label>
                                            <input
                                                type="number"
                                                value={formData.port}
                                                onChange={(e) => updateFormField('port', parseInt(e.target.value) || 587)}
                                                placeholder="587"
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Encryption</label>
                                            <select
                                                value={formData.encryption}
                                                onChange={(e) => updateFormField('encryption', e.target.value as 'none' | 'ssl' | 'tls')}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="none">None</option>
                                                <option value="ssl">SSL</option>
                                                <option value="tls">TLS (STARTTLS)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Authentication */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <FaKey size={12} /> Authentication
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Username</label>
                                            <input
                                                type="text"
                                                value={formData.username}
                                                onChange={(e) => updateFormField('username', e.target.value)}
                                                placeholder={getSmtpProviderPreset(smtpProvider).usernamePlaceholder}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Password</label>
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => updateFormField('password', e.target.value)}
                                                placeholder={getSmtpProviderPreset(smtpProvider).passwordHint}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Sender Information */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <FaEnvelope size={12} /> Sender Information
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">From Email</label>
                                            <input
                                                type="email"
                                                value={formData.from_email}
                                                onChange={(e) => updateFormField('from_email', e.target.value)}
                                                placeholder={smtpProvider === 'office365' ? 'user@yourdomain.com' : 'noreply@example.com'}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">From Name</label>
                                            <input
                                                type="text"
                                                value={formData.from_name}
                                                onChange={(e) => updateFormField('from_name', e.target.value)}
                                                placeholder={`${appName} Monitor`}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Server Status */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Server Status</h3>

                                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#202020] rounded-2xl border border-slate-200 dark:border-[#333]">
                                        <div>
                                            <h4 className="font-bold text-slate-900 dark:text-white">Enable Email Notifications</h4>
                                            <p className="text-xs text-slate-500 dark:text-gray-400">Allow this server to send emails</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_enabled}
                                                onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                </div>

                                {/* Maintenance Window */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <FaBellSlash size={12} /> Maintenance Window
                                    </h3>
                                    <div className="p-4 bg-orange-50 dark:bg-orange-500/5 rounded-2xl border border-orange-100 dark:border-orange-500/20">
                                        <p className="text-xs text-orange-700 dark:text-orange-400 mb-4">
                                            Pause notifications during maintenance
                                        </p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                                    <FaClock size={10} /> Start
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={formData.pause_start || ''}
                                                    onChange={(e) => setFormData({ ...formData, pause_start: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                                    <FaClock size={10} /> End
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={formData.pause_end || ''}
                                                    onChange={(e) => setFormData({ ...formData, pause_end: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : selectedServer ? (
                            <>
                                {/* View Mode */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {selectedServer.is_active && (
                                                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-bold rounded-full flex items-center gap-2">
                                                    <FaCheck size={12} /> Active Server
                                                </span>
                                            )}
                                            <span className={`px-3 py-1 text-sm font-bold rounded-full ${selectedServer.is_enabled
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                }`}>
                                                {selectedServer.is_enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {!selectedServer.is_active && (
                                                <button
                                                    onClick={() => handleActivate(selectedServer.id!)}
                                                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors text-sm"
                                                >
                                                    Set as Active
                                                </button>
                                            )}
                                            <button
                                                onClick={handleTest}
                                                disabled={isTesting}
                                                className="px-4 py-2 bg-slate-600 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isTesting ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <FaVial size={14} />}
                                                {isTesting ? 'Testing...' : 'Test Connection'}
                                            </button>
                                            <button
                                                onClick={() => handleEdit(selectedServer)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors text-sm flex items-center gap-2"
                                            >
                                                <FaEdit size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(selectedServer.id!)}
                                                className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors text-sm flex items-center gap-2"
                                            >
                                                <FaTrash size={14} /> Delete
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-50 dark:bg-[#202020] rounded-xl">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-400 block mb-1">Host</label>
                                            <p className="text-slate-900 dark:text-white font-mono">{selectedServer.host}</p>
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-[#202020] rounded-xl">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-400 block mb-1">Port</label>
                                            <p className="text-slate-900 dark:text-white font-mono">{selectedServer.port}</p>
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-[#202020] rounded-xl">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-400 block mb-1">Encryption</label>
                                            <p className="text-slate-900 dark:text-white uppercase">{selectedServer.encryption}</p>
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-[#202020] rounded-xl">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-400 block mb-1">Username</label>
                                            <p className="text-slate-900 dark:text-white truncate">{selectedServer.username}</p>
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-[#202020] rounded-xl col-span-2">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-400 block mb-1">From Email</label>
                                            <p className="text-slate-900 dark:text-white">{selectedServer.from_email}</p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : null}

                        {/* Test Result Display (Visible in both modes) */}
                        {testResult && (
                            <div className={`p-4 rounded-2xl border ${testResult.success ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'}`}>
                                <div className="flex items-center gap-3">
                                    {testResult.success ? (
                                        <FaCheckCircle {...({ className: "text-emerald-500 text-xl" } as any)} />
                                    ) : (
                                        <FaExclamationTriangle {...({ className: "text-red-500 text-xl" } as any)} />
                                    )}
                                    <div>
                                        <h4 className={`font-bold ${testResult.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                            {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                                        </h4>
                                        <p className={`text-sm ${testResult.success ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                                            {testResult.message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {(isEditing || isCreating) && (
                        <div className="p-6 border-t border-slate-100 dark:border-[#333] bg-slate-50 dark:bg-[#202020] flex gap-3">
                            <button
                                onClick={handleCancelEdit}
                                className="flex-1 px-6 py-3 bg-slate-200 dark:bg-[#333] text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-[#444] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleTest}
                                disabled={isTesting}
                                className="flex-1 px-6 py-3 bg-slate-200 dark:bg-[#333] text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-[#444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isTesting ? 'Testing...' : 'Test Connection'}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'Saving...' : isCreating ? 'Create Server' : 'Save Changes'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
