import React, { useState, useEffect } from 'react';
import { FaTimes, FaEnvelope, FaServer, FaKey, FaCheckCircle, FaExclamationTriangle, FaBellSlash, FaClock } from 'react-icons/fa';
import { SMTPSettings, smtpService } from '../services/smtpService';

interface SMTPSettingsModalProps {
    onClose: () => void;
}

export const SMTPSettingsModal: React.FC<SMTPSettingsModalProps> = ({ onClose }) => {
    const [settings, setSettings] = useState<Partial<SMTPSettings>>({
        host: '',
        port: 587,
        username: '',
        password: '',
        from_email: '',
        from_name: 'LinkNest Monitor',
        encryption: 'tls',
        enabled: false,
        pause_start: '',
        pause_end: ''
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await smtpService.getSettings();
            setSettings(data);
        } catch (error) {
            console.error('Failed to load SMTP settings', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await smtpService.updateSettings(settings);
            alert('SMTP settings saved successfully!');
        } catch (error) {
            console.error('Failed to save SMTP settings', error);
            alert('Failed to save SMTP settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await smtpService.testConnection(settings);
            setTestResult(result);
        } catch (error) {
            console.error('Failed to test SMTP connection', error);
            setTestResult({ success: false, message: 'Failed to test connection' });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1a1a1a] w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-[#333]">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-[#333] flex items-center justify-between bg-slate-50/50 dark:bg-[#202020]/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                            <FaEnvelope {...({ className: "text-blue-500 text-xl" } as any)} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">SMTP Settings</h2>
                            <p className="text-sm text-slate-500 dark:text-gray-400">Configure email notifications for monitoring alerts</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-400"
                    >
                        <FaTimes size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500 dark:text-gray-400">Loading settings...</p>
                        </div>
                    ) : (
                        <>
                            {/* Enable/Disable Toggle */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#202020] rounded-2xl border border-slate-200 dark:border-[#333]">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Enable Email Notifications</h3>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">Send alerts when monitors go up or down</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enabled}
                                        onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* SMTP Server Settings */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                    <FaServer size={12} /> Server Configuration
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">SMTP Host</label>
                                        <input
                                            type="text"
                                            value={settings.host}
                                            onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                                            placeholder="smtp.gmail.com"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Port</label>
                                        <input
                                            type="number"
                                            value={settings.port}
                                            onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value) })}
                                            placeholder="587"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Encryption</label>
                                        <select
                                            value={settings.encryption}
                                            onChange={(e) => setSettings({ ...settings, encryption: e.target.value as any })}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="none">None</option>
                                            <option value="ssl">SSL</option>
                                            <option value="tls">TLS</option>
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
                                            value={settings.username}
                                            onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                                            placeholder="your-email@example.com"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Password</label>
                                        <input
                                            type="password"
                                            value={settings.password}
                                            onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                                            placeholder="••••••••"
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
                                            value={settings.from_email}
                                            onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
                                            placeholder="noreply@example.com"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">From Name</label>
                                        <input
                                            type="text"
                                            value={settings.from_name}
                                            onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                                            placeholder="LinkNest Monitor"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Quiet Hours / Pause Notifications */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                    <FaBellSlash size={12} /> Maintenance Window (Pause Notifications)
                                </h3>
                                <div className="p-4 bg-orange-50 dark:bg-orange-500/5 rounded-2xl border border-orange-100 dark:border-orange-500/20">
                                    <p className="text-xs text-orange-700 dark:text-orange-400 mb-4">
                                        Configure a specific period (dates and times) during which email notifications will be paused. This is useful for extended maintenance windows.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                                <FaClock size={10} /> Maintenance Start
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={settings.pause_start || ''}
                                                onChange={(e) => setSettings({ ...settings, pause_start: e.target.value })}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                                <FaClock size={10} /> Maintenance End
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={settings.pause_end || ''}
                                                onChange={(e) => setSettings({ ...settings, pause_end: e.target.value })}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    {settings.pause_start && settings.pause_end && (
                                        <p className="mt-3 text-[10px] text-slate-500 italic">
                                            Notifications will be suppressed from {new Date(settings.pause_start).toLocaleString()} to {new Date(settings.pause_end).toLocaleString()}.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Test Result */}
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
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-[#333] bg-slate-50 dark:bg-[#202020] flex gap-3">
                    <button
                        onClick={handleTest}
                        disabled={isTesting || isLoading}
                        className="flex-1 px-6 py-3 bg-slate-200 dark:bg-[#333] text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-[#444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};
