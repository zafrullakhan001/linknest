import React, { useState, useEffect } from 'react';
import { SecurePasswordInput } from './SecurePasswordInput';
import { resolveApiBase } from '../services/apiHelpers';
import { sshGatewayService, type SshGatewayConfigResponse, type SshGatewayStatus } from '../services/sshGatewayService';
import { vncGatewayService, type VncGatewayConfigResponse, type VncGatewayStatus } from '../services/vncGatewayService';

// Resolve API base URL once at module load
const API_BASE = resolveApiBase();

interface AnalyticsConfig {
    enabled: boolean;
    pgHost: string;
    pgPort: number;
    pgDatabase: string;
    pgUser: string;
    sampleRate: number;
    trackAnonymous: boolean;
    trackLogins: boolean;
    beaconUrls: string[];
    workerEnabled: boolean;
    retentionDays: number;
    dashboardUrl: string;
}

interface Monitorv2Config {
    enabled: boolean;
    pgHost: string;
    pgPort: number;
    pgDatabase: string;
    pgUser: string;
    retentionDays: number;
    autoCleanup: boolean;
}

interface AddonStatus {
    addon_name: string;
    is_enabled: boolean;
    is_available: boolean;
    last_check_at: number;
    error_message: string | null;
}

interface HealthStatus {
    status: 'disabled' | 'not_configured' | 'unavailable' | 'available' | 'error';
    message: string;
    metrics_count?: number;
    queue_pending?: number;
}

export const AddonsManagement: React.FC = () => {
    const [config, setConfig] = useState<AnalyticsConfig>({
        enabled: false,
        pgHost: 'localhost',
        pgPort: 5433,
        pgDatabase: 'linknest_analytics',
        pgUser: 'postgres',
        sampleRate: 0.1,
        trackAnonymous: true,
        trackLogins: true,
        beaconUrls: [],
        workerEnabled: false,
        retentionDays: 90,
        dashboardUrl: 'http://localhost:9333'
    });

    const [pgPassword, setPgPassword] = useState('');
    const [status, setStatus] = useState<AddonStatus | null>(null);
    const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [beaconUrlsText, setBeaconUrlsText] = useState('');
    const [setupActions, setSetupActions] = useState<{ [key: string]: boolean }>({});
    const [setupResults, setSetupResults] = useState<{ [key: string]: any }>({});
    const [analyticsTab, setAnalyticsTab] = useState<'config' | 'backup-restore' | 'geo-resources'>('config');
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null);

    // Load configuration on mount
    useEffect(() => {
        loadConfiguration();
        checkHealth();
    }, []);

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/addons/performance-analytics`);
            if (!response.ok) throw new Error('Failed to load configuration');

            const data = await response.json();
            setConfig(data.config);
            setStatus(data.status);
            setBeaconUrlsText(data.config.beaconUrls.join('\n'));

            if (data.config.enabled) {
                setExpanded(true);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const checkHealth = async () => {
        try {
            const response = await fetch(`${API_BASE}/addons/performance-analytics/status`);
            if (!response.ok) return;

            const data = await response.json();
            setHealthStatus(data);
        } catch (err) {
            console.error('Health check failed:', err);
        }
    };

    const handleTestConnection = async () => {
        try {
            setTesting(true);
            setTestResult(null);
            setError(null);

            const response = await fetch(`${API_BASE}/addons/performance-analytics/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pgHost: config.pgHost,
                    pgPort: config.pgPort,
                    pgDatabase: config.pgDatabase,
                    pgUser: config.pgUser,
                    pgPassword: pgPassword
                })
            });

            const data = await response.json();
            setTestResult(data);

            if (!data.success) {
                setError(data.error || 'Connection test failed');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            // Parse beacon URLs from textarea
            const urls = beaconUrlsText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const payload = {
                ...config,
                beaconUrls: urls,
                pgPassword: pgPassword || undefined // Only send if provided
            };

            const response = await fetch(`${API_BASE}/addons/performance-analytics`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save configuration');
            }

            // Reload configuration and check health
            await loadConfiguration();
            await checkHealth();

            // Show success message
            alert('Configuration saved successfully!');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSetupAction = async (action: string) => {
        try {
            setSetupActions(prev => ({ ...prev, [action]: true }));
            setError(null);

            let endpoint = '';
            let method = 'POST';
            let body: any = {};

            switch (action) {
                case 'setup-schema':
                    endpoint = `${API_BASE}/addons/performance-analytics/setup-schema`;
                    break;
                case 'purge-database':
                    endpoint = `${API_BASE}/addons/performance-analytics/purge-database`;
                    body = { confirm: 'DELETE_ALL_DATA' };
                    break;
                case 'download-geolite2':
                    endpoint = `${API_BASE}/addons/performance-analytics/download-geolite2`;
                    break;
                default:
                    throw new Error('Unknown action');
            }

            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
            });

            const data = await response.json();
            setSetupResults(prev => ({ ...prev, [action]: data }));

            if (!response.ok || !data.success) {
                throw new Error(data.error || data.message || 'Action failed');
            }

            // Refresh health status after successful actions
            if (action === 'setup-schema' || action === 'purge-database') {
                await checkHealth();
            }

        } catch (err: any) {
            setError(err.message);
            setSetupResults(prev => ({ ...prev, [action]: { success: false, error: err.message } }));
        } finally {
            setSetupActions(prev => ({ ...prev, [action]: false }));
        }
    };

    const getStatusBadge = () => {
        if (!healthStatus) return null;

        const badges = {
            disabled: { text: 'Disabled', class: 'bg-gray-100 text-gray-700' },
            not_configured: { text: 'Not Configured', class: 'bg-yellow-100 text-yellow-700' },
            unavailable: { text: 'Unavailable', class: 'bg-red-100 text-red-700' },
            available: { text: 'Active', class: 'bg-green-100 text-green-700' },
            error: { text: 'Error', class: 'bg-red-100 text-red-700' }
        };

        const badge = badges[healthStatus.status] || badges.disabled;

        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.class}`}>
                {badge.text}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div>
                    <p className="mt-4 text-slate-600 dark:text-slate-400">Loading add-ons configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6">
            <div className="bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5">
                <div className="bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span aria-hidden>🔌</span> Add-ons
                    </h1>
                    <p className="text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5">Manage optional features and integrations for LinkNest</p>
                </div>
            </div>

            {/* Performance Analytics Add-on Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-sky-200/70 dark:border-sky-800/40 overflow-hidden shadow-sky-500/5">
                <div className="p-6 bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                            <div className="text-4xl" aria-hidden>📊</div>
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Performance Analytics</h2>
                                    {getStatusBadge()}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                    Real-time URL performance monitoring with geographic insights. Track client vs server latency across different regions with bubble chart visualizations.
                                </p>

                                {healthStatus && healthStatus.status === 'available' && (
                                    <div className="flex gap-4 text-sm">
                                        <div className="px-3 py-1 bg-white rounded-lg border border-sky-100 dark:border-sky-900/40">
                                            <span className="text-slate-600 dark:text-slate-400">Metrics:</span>
                                            <span className="font-semibold text-slate-900 dark:text-white ml-1">{healthStatus.metrics_count?.toLocaleString() || 0}</span>
                                        </div>
                                        <div className="px-3 py-1 bg-white rounded-lg border border-sky-100 dark:border-sky-900/40">
                                            <span className="text-slate-600 dark:text-slate-400">Queue:</span>
                                            <span className="font-semibold text-slate-900 dark:text-white ml-1">{healthStatus.queue_pending || 0}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="px-4 py-2 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg transition-colors"
                            >
                                {expanded ? 'Hide' : 'Configure'}
                            </button>

                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.enabled}
                                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 dark:peer-focus:ring-sky-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Configuration Panel */}
                {expanded && (
                    <div className="p-6 space-y-6 bg-sky-50/40 dark:bg-sky-950/20">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        {/* Tab navigation */}
                        <div className="flex gap-1 border-b border-sky-100 dark:border-sky-900/40 bg-white rounded-t-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setAnalyticsTab('config')}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${analyticsTab === 'config' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100'}`}
                            >
                                Configuration
                            </button>
                            <button
                                type="button"
                                onClick={() => setAnalyticsTab('backup-restore')}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${analyticsTab === 'backup-restore' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100'}`}
                            >
                                Backup & Restore
                            </button>
                            <button
                                type="button"
                                onClick={() => setAnalyticsTab('geo-resources')}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${analyticsTab === 'geo-resources' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100'}`}
                            >
                                Geo-location Resources
                            </button>
                        </div>

                        {analyticsTab === 'config' && (
                            <>
                                {/* PostgreSQL Connection */}
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">PostgreSQL Connection</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Host <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={config.pgHost}
                                                onChange={(e) => setConfig({ ...config, pgHost: e.target.value })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                                placeholder="localhost"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Port <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                value={config.pgPort}
                                                onChange={(e) => setConfig({ ...config, pgPort: parseInt(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                                placeholder="5433"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Database <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={config.pgDatabase}
                                                onChange={(e) => setConfig({ ...config, pgDatabase: e.target.value })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                                placeholder="linknest_analytics"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Username <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={config.pgUser}
                                                onChange={(e) => setConfig({ ...config, pgUser: e.target.value })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                                placeholder="postgres"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Password <span className="text-red-500">*</span>
                                        </label>
                                        <SecurePasswordInput
                                            value={pgPassword}
                                            onChange={(e) => setPgPassword(e.target.value)}
                                            placeholder="Enter PostgreSQL password"
                                            className="w-full"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Password is encrypted when saved. Leave blank to keep existing password.
                                        </p>
                                    </div>

                                    <div className="mt-4">
                                        <button
                                            onClick={handleTestConnection}
                                            disabled={testing || !config.pgHost || !config.pgDatabase}
                                            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {testing ? 'Testing...' : 'Test Connection'}
                                        </button>

                                        {testResult && (
                                            <div className={`mt-3 p-3 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                                <p className={`font-semibold ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                                    {testResult.message}
                                                </p>
                                                {testResult.details && (
                                                    <div className="mt-2 text-sm text-gray-700 space-y-1">
                                                        <p>✓ PostgreSQL: {testResult.details.postgres_version}</p>
                                                        {testResult.details.timescaledb_installed ? (
                                                            <p>✓ TimescaleDB: {testResult.details.timescaledb_version}</p>
                                                        ) : (
                                                            <p className="text-yellow-700">⚠ TimescaleDB not installed</p>
                                                        )}
                                                        <p>✓ Tables: {testResult.details.tables_exist?.join(', ') || 'None'}</p>
                                                        {testResult.details.schema_ready ? (
                                                            <p className="text-green-700 font-semibold">✓ Schema ready</p>
                                                        ) : (
                                                            <p className="text-yellow-700">⚠ Schema not initialized. Run: php scripts/setup-analytics-addon.php</p>
                                                        )}
                                                    </div>
                                                )}
                                                {testResult.error && (
                                                    <p className="mt-2 text-sm text-red-700">{testResult.error}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Tracking Options */}
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Tracking Options</h3>

                                    <div className="space-y-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.trackAnonymous}
                                                onChange={(e) => setConfig({ ...config, trackAnonymous: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-300 text-sky-600 dark:text-sky-400 focus:ring-sky-500"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-gray-700">Track anonymous visitors</span>
                                                <p className="text-xs text-gray-500">Collect performance data from non-logged-in users</p>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.trackLogins}
                                                onChange={(e) => setConfig({ ...config, trackLogins: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-300 text-sky-600 dark:text-sky-400 focus:ring-sky-500"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-gray-700">Track user logins</span>
                                                <p className="text-xs text-gray-500">Capture geographic location when users log in</p>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.workerEnabled}
                                                onChange={(e) => setConfig({ ...config, workerEnabled: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-300 text-sky-600 dark:text-sky-400 focus:ring-sky-500"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-gray-700">Enable background worker</span>
                                                <p className="text-xs text-gray-500">Process metrics asynchronously (requires PHP CLI access)</p>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Sample Rate
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={config.sampleRate}
                                                onChange={(e) => setConfig({ ...config, sampleRate: parseFloat(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                0.1 = 10% of traffic (reduces load)
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Data Retention (days)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="365"
                                                value={config.retentionDays}
                                                onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                How long to keep metrics data
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Monitored URLs */}
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Monitored URLs</h3>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            URLs to Monitor (optional)
                                        </label>
                                        <textarea
                                            value={beaconUrlsText}
                                            onChange={(e) => setBeaconUrlsText(e.target.value)}
                                            rows={5}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 font-mono text-sm"
                                            placeholder={'https://example.com/app1\nhttps://example.com/app2\n\nLeave empty to monitor all links'}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Enter one URL per line. Leave empty to monitor all links on the page.
                                        </p>
                                    </div>
                                </div>

                                {/* Dashboard Access */}
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Analytics Dashboard</h3>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Dashboard URL
                                        </label>
                                        <input
                                            type="url"
                                            value={config.dashboardUrl}
                                            onChange={(e) => setConfig({ ...config, dashboardUrl: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800"
                                            placeholder="http://localhost:9333"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            URL where the analytics dashboard is hosted (typically port 9333)
                                        </p>
                                    </div>

                                    {config.dashboardUrl && config.enabled && healthStatus?.status === 'available' && (
                                        <a
                                            href={config.dashboardUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors"
                                        >
                                            <span>Open Analytics Dashboard</span>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </a>
                                    )}
                                </div>

                                {/* Setup Actions */}
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Setup Actions</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Setup Schema */}
                                        <div className="border border-sky-100 dark:border-sky-900/40 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-1">1. Setup Database Schema</h4>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400">Initialize TimescaleDB tables and views</p>
                                                </div>
                                                <span className="text-2xl">🗄️</span>
                                            </div>
                                            <button
                                                onClick={() => handleSetupAction('setup-schema')}
                                                disabled={setupActions['setup-schema'] || !config.enabled}
                                                className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                            >
                                                {setupActions['setup-schema'] ? 'Setting up...' : 'Setup Schema'}
                                            </button>
                                            {setupResults['setup-schema'] && (
                                                <div className={`mt-2 p-2 rounded text-xs ${setupResults['setup-schema'].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {setupResults['setup-schema'].message || setupResults['setup-schema'].error}
                                                </div>
                                            )}
                                        </div>

                                        {/* Download GeoLite2 */}
                                        <div className="border border-sky-100 dark:border-sky-900/40 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-1">2. GeoLite2 Database</h4>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400">Get instructions for offline geolocation</p>
                                                </div>
                                                <span className="text-2xl">🌍</span>
                                            </div>
                                            <button
                                                onClick={() => handleSetupAction('download-geolite2')}
                                                disabled={setupActions['download-geolite2']}
                                                className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                            >
                                                {setupActions['download-geolite2'] ? 'Checking...' : 'Get Instructions'}
                                            </button>
                                            {setupResults['download-geolite2'] && (
                                                <div className="mt-2 p-2 rounded text-xs bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300">
                                                    {setupResults['download-geolite2'].already_exists ? (
                                                        <p>✓ Database already exists</p>
                                                    ) : (
                                                        <div>
                                                            <p className="font-semibold mb-1">Download Instructions:</p>
                                                            <ol className="list-decimal list-inside space-y-1 text-xs">
                                                                {setupResults['download-geolite2'].instructions?.map((inst: string, i: number) => (
                                                                    <li key={i}>{inst.replace(/^\d+\.\s*/, '')}</li>
                                                                ))}
                                                            </ol>
                                                            {setupResults['download-geolite2'].download_url && (
                                                                <a href={setupResults['download-geolite2'].download_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sky-600 dark:text-sky-400 hover:underline">
                                                                    Open MaxMind Downloads →
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Purge Database */}
                                        <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-red-800 mb-1">⚠️ Purge Database</h4>
                                                    <p className="text-xs text-red-600">Delete all analytics data (irreversible)</p>
                                                </div>
                                                <span className="text-2xl">🗑️</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (confirm('⚠️ WARNING: This will delete ALL analytics data. This action cannot be undone!\n\nType "DELETE" to confirm.')) {
                                                        const confirmText = prompt('Type "DELETE_ALL_DATA" to confirm:');
                                                        if (confirmText === 'DELETE_ALL_DATA') {
                                                            handleSetupAction('purge-database');
                                                        }
                                                    }
                                                }}
                                                disabled={setupActions['purge-database'] || !config.enabled}
                                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                            >
                                                {setupActions['purge-database'] ? 'Purging...' : 'Purge All Data'}
                                            </button>
                                            {setupResults['purge-database'] && (
                                                <div className={`mt-2 p-2 rounded text-xs ${setupResults['purge-database'].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {setupResults['purge-database'].message || setupResults['purge-database'].error}
                                                </div>
                                            )}
                                        </div>

                                        {/* Worker Instructions */}
                                        <div className="border border-sky-100 dark:border-sky-900/40 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-1">3. Start Workers</h4>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400">Run background processing workers</p>
                                                </div>
                                                <span className="text-2xl">⚙️</span>
                                            </div>
                                            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                                                <p><strong>Option 1: Use Batch File (Recommended for XAMPP)</strong></p>
                                                <code className="block bg-gray-100 px-2 py-1 rounded">analytics\start-workers-xampp.bat</code>
                                                <p className="mt-2"><strong>Option 2: Manual Commands</strong></p>
                                                <p className="mt-1"><strong>From project root:</strong></p>
                                                <code className="block bg-gray-100 px-2 py-1 rounded">cd C:\xampp\htdocs\linknest</code>
                                                <code className="block bg-gray-100 px-2 py-1 rounded mt-1">C:\xampp\php\php.exe analytics\worker.php</code>
                                                <code className="block bg-gray-100 px-2 py-1 rounded mt-1">C:\xampp\php\php.exe analytics\server-checker-worker.php</code>
                                                <p className="mt-2 text-gray-500">Or if PHP is in PATH: <code className="bg-gray-100 px-1 rounded">php analytics/worker.php</code></p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg">
                                        <p className="text-sm text-blue-800">
                                            <strong>Note:</strong> Ensure PostgreSQL with TimescaleDB is running on <code className="bg-sky-100 dark:bg-sky-900/40 px-1 rounded">{config.pgHost}:{config.pgPort}</code> before running setup.
                                        </p>
                                    </div>
                                </div>

                                {/* Action Buttons - only for Configuration tab */}
                                <div className="flex justify-end gap-3 pt-4 border-t border-sky-100 dark:border-sky-900/40">
                                    <button
                                        onClick={() => {
                                            setExpanded(false);
                                            loadConfiguration(); // Reload to discard changes
                                        }}
                                        className="px-5 py-2 text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-sky-50/40 dark:bg-sky-950/20 transition-colors"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                    >
                                        {saving ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </>
                        )}

                        {analyticsTab === 'backup-restore' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Database Backup</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                        Download a full backup of the Analytics PostgreSQL database as a ZIP file (contains a plain SQL dump). Use the same connection settings configured above.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setBackupLoading(true);
                                            setError(null);
                                            try {
                                                const base = API_BASE.replace(/\/$/, '');
                                                const url = `${base}/addons/performance-analytics/backup`;
                                                const res = await fetch(url, { credentials: 'include' });
                                                if (!res.ok) {
                                                    const data = await res.json().catch(() => ({}));
                                                    throw new Error(data.error || data.hint || `Backup failed (${res.status})`);
                                                }
                                                const blob = await res.blob();
                                                const disp = res.headers.get('Content-Disposition');
                                                const match = disp && /filename="?([^";\n]+)"?/.exec(disp);
                                                const name = match ? match[1] : `analytics_backup_${new Date().toISOString().slice(0, 10)}.zip`;
                                                const a = document.createElement('a');
                                                a.href = URL.createObjectURL(blob);
                                                a.download = name;
                                                a.click();
                                                URL.revokeObjectURL(a.href);
                                            } catch (err: any) {
                                                setError(err.message);
                                            } finally {
                                                setBackupLoading(false);
                                            }
                                        }}
                                        disabled={backupLoading || !config.pgHost || !config.pgDatabase}
                                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {backupLoading ? 'Creating backup...' : 'Download backup (ZIP)'}
                                    </button>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Backup uses PHP/PDO only (no <code className="bg-gray-100 px-1 rounded">pg_dump</code> required). Data-only SQL; run <code className="bg-gray-100 px-1 rounded">analytics/schema.sql</code> before restore if the database is empty.
                                    </p>
                                </div>
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Restore from backup</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                        Upload a previously downloaded .sql or .zip backup to restore the analytics database. This will run the SQL against the configured database (existing data may be affected).
                                    </p>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <label className="cursor-pointer">
                                            <span className="inline-block px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700">Choose file</span>
                                            <input
                                                type="file"
                                                accept=".sql,.zip"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    setRestoreFile(f || null);
                                                    setRestoreResult(null);
                                                    setError(null);
                                                }}
                                            />
                                        </label>
                                        {restoreFile && <span className="text-sm text-slate-600 dark:text-slate-400">{restoreFile.name}</span>}
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!restoreFile) return;
                                                setRestoreLoading(true);
                                                setError(null);
                                                setRestoreResult(null);
                                                try {
                                                    const form = new FormData();
                                                    form.append('file', restoreFile);
                                                    const base = API_BASE.replace(/\/$/, '');
                                                    const res = await fetch(`${base}/addons/performance-analytics/restore`, {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                        body: form
                                                    });
                                                    const data = await res.json().catch(() => ({}));
                                                    if (res.ok && data.success) {
                                                        setRestoreResult({ success: true, message: data.message || 'Restored successfully.' });
                                                        setRestoreFile(null);
                                                        checkHealth();
                                                    } else {
                                                        setRestoreResult({ success: false, message: data.error || 'Restore failed' });
                                                    }
                                                } catch (err: any) {
                                                    setRestoreResult({ success: false, message: err.message });
                                                } finally {
                                                    setRestoreLoading(false);
                                                }
                                            }}
                                            disabled={restoreLoading || !restoreFile}
                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {restoreLoading ? 'Restoring...' : 'Restore'}
                                        </button>
                                    </div>
                                    {restoreResult && (
                                        <div className={`mt-3 p-3 rounded-lg text-sm ${restoreResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                                            {restoreResult.message}
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-500 mt-2">
                                        Restore uses <code className="bg-gray-100 px-1 rounded">psql</code> if available, otherwise runs the SQL via PHP (no CLI tools required).
                                    </p>
                                </div>
                            </div>
                        )}

                        {analyticsTab === 'geo-resources' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Geo-location free resources</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                        Use these free datasets and tools for offline reverse geocoding (latitude/longitude → country, region, city). The <code className="bg-gray-100 px-1 rounded">location_lookup</code> table is used by the analytics worker to fill in city/region when only coordinates are available.
                                    </p>
                                    <ul className="space-y-3 text-sm">
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-slate-900 dark:text-white">SimpleMaps World Cities (free, ~40k+ cities):</strong>
                                            <a href="https://simplemaps.com/data/world-cities" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">simplemaps.com/data/world-cities</a>
                                        </li>
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-slate-900 dark:text-white">GeoNames country dumps (free):</strong>
                                            <a href="https://www.geonames.org/export/" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">geonames.org/export/</a>
                                            <span className="text-gray-500">— US: </span>
                                            <a href="https://download.geonames.org/export/dump/US.zip" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">US.zip</a>
                                        </li>
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-slate-900 dark:text-white">MaxMind GeoLite2 (free, IP → location):</strong>
                                            <a href="https://dev.maxmind.com/geoip/geolite2-free-geolocation-data" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">MaxMind GeoLite2</a>
                                            <span className="text-gray-500">— place GeoLite2-City.mmdb in analytics/geoip/</span>
                                        </li>
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-slate-900 dark:text-white">ip-api.com (free tier, online):</strong>
                                            <span className="text-gray-500">45 requests/minute fallback when GeoLite2 is not used</span>
                                        </li>
                                    </ul>
                                </div>
                                <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Populated geo region insertion (command line)</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                        Run these from the <strong>project root</strong> (e.g. <code className="bg-gray-100 px-1 rounded">c:\xampp\htdocs\linknest</code>). Ensure Analytics PostgreSQL is configured in Add-ons first.
                                    </p>
                                    <div className="space-y-4 font-mono text-sm bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                                        <div>
                                            <p className="text-gray-400 mb-1"># Small built-in sample</p>
                                            <p className="text-green-300">php analytics/geoip/setup-location-lookup-table.php</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 mb-1"># World cities CSV (SimpleMaps) – replace path with your CSV</p>
                                            <p className="text-green-300">php analytics/geoip/import-world-cities.php "C:\path\to\worldcities.csv"</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 mb-1"># GeoNames US.txt – full file, populated places only (~194k)</p>
                                            <p className="text-green-300">php analytics/geoip/import-geonames-us.php "C:\...\US.txt" --truncate --populated --all</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 mb-1"># Sampled: 40k populated places (fast, good coverage)</p>
                                            <p className="text-green-300">php analytics/geoip/import-geonames-us.php "C:\...\US.txt" --populated --limit=40000</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 mb-1"># Append 40k populated (no truncate)</p>
                                            <p className="text-green-300">php analytics/geoip/import-geonames-us.php "C:\...\US.txt" --populated --limit=40000</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 mb-1"># Lighter: every 10th populated place (~19k)</p>
                                            <p className="text-green-300">php analytics/geoip/import-geonames-us.php "C:\...\US.txt" --populated --sample=10 --limit=20000</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-3">
                                        Options: <code className="bg-gray-100 px-1 rounded">--truncate</code> clear before import; <code className="bg-gray-100 px-1 rounded">--all</code> no row limit; <code className="bg-gray-100 px-1 rounded">--populated</code> only cities/towns; <code className="bg-gray-100 px-1 rounded">--limit=N</code> <code className="bg-gray-100 px-1 rounded">--sample=N</code> every Nth row.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Monitorv2 Add-on Card */}
            <Monitorv2AddonCard />

            {/* System Email (SMTP) */}
            <SystemEmailAddonCard />

            {/* SSH Gateway paths */}
            <SshGatewayAddonCard />

            {/* VNC Gateway (websockify) */}
            <VncGatewayAddonCard />

            {/* Future Add-ons Placeholder */}
            <div className="mt-6 bg-white rounded-xl shadow-lg border border-sky-100 dark:border-sky-900/40 p-6 opacity-60">
                <div className="flex items-center gap-4">
                    <div className="text-4xl">🔌</div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">More Add-ons Coming Soon</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">CDN Integration, Advanced Caching, and more...</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================
// Monitorv2 Addon Card Component
// ============================================
const Monitorv2AddonCard: React.FC = () => {
    const [config, setConfig] = useState<Monitorv2Config>({
        enabled: false,
        pgHost: 'localhost',
        pgPort: 5433,
        pgDatabase: 'postgres',
        pgUser: 'postgres',
        retentionDays: 90,
        autoCleanup: true
    });

    const [pgPassword, setPgPassword] = useState('');
    const [status, setStatus] = useState<AddonStatus | null>(null);
    const [healthStatus, setHealthStatus] = useState<{ status: string; message: string; monitors?: number; checks_24h?: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [setupActions, setSetupActions] = useState<{ [key: string]: boolean }>({});
    const [setupResults, setSetupResults] = useState<{ [key: string]: any }>({});
    const [monitorv2Tab, setMonitorv2Tab] = useState<'config' | 'backup-restore'>('config');
    const [schemaBackupLoading, setSchemaBackupLoading] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null);

    // Load configuration on mount
    useEffect(() => {
        loadConfiguration();
        checkHealth();
    }, []);

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/addons/monitorv2`);
            if (!response.ok) throw new Error('Failed to load configuration');

            const data = await response.json();
            setConfig(data.config);
            setStatus(data.status);

            if (data.config.enabled) {
                setExpanded(true);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const checkHealth = async () => {
        try {
            const response = await fetch(`${API_BASE}/addons/monitorv2/status`);
            if (!response.ok) return;

            const data = await response.json();
            setHealthStatus(data);
        } catch (err) {
            console.error('Health check failed:', err);
        }
    };

    const handleTestConnection = async () => {
        try {
            setTesting(true);
            setTestResult(null);
            setError(null);

            const response = await fetch(`${API_BASE}/addons/monitorv2/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pgHost: config.pgHost,
                    pgPort: config.pgPort,
                    pgDatabase: config.pgDatabase,
                    pgUser: config.pgUser,
                    pgPassword: pgPassword
                })
            });

            const data = await response.json();
            setTestResult(data);

            if (!data.success) {
                setError(data.error || 'Connection test failed');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            const payload = {
                ...config,
                pgPassword: pgPassword || undefined
            };

            const response = await fetch(`${API_BASE}/addons/monitorv2`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save configuration');
            }

            await loadConfiguration();
            await checkHealth();

            alert('Configuration saved successfully!');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSetupAction = async (action: string) => {
        try {
            setSetupActions(prev => ({ ...prev, [action]: true }));
            setError(null);

            let endpoint = '';
            let method = 'POST';
            let body: any = {};

            switch (action) {
                case 'setup-schema':
                    endpoint = `${API_BASE}/addons/monitorv2/setup-schema`;
                    break;
                case 'purge-data':
                    endpoint = `${API_BASE}/addons/monitorv2/purge-data`;
                    body = { confirm: 'DELETE_ALL_DATA' };
                    break;
                default:
                    throw new Error('Unknown action');
            }

            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
            });

            const data = await response.json();
            setSetupResults(prev => ({ ...prev, [action]: data }));

            if (!response.ok || !data.success) {
                throw new Error(data.error || data.message || 'Action failed');
            }

            if (action === 'setup-schema' || action === 'purge-data') {
                await checkHealth();
            }

        } catch (err: any) {
            setError(err.message);
            setSetupResults(prev => ({ ...prev, [action]: { success: false, error: err.message } }));
        } finally {
            setSetupActions(prev => ({ ...prev, [action]: false }));
        }
    };

    const getStatusBadge = () => {
        if (!healthStatus) return null;

        const badges: Record<string, { text: string; class: string }> = {
            disabled: { text: 'Disabled', class: 'bg-gray-100 text-gray-700' },
            not_configured: { text: 'Not Configured', class: 'bg-yellow-100 text-yellow-700' },
            unavailable: { text: 'Unavailable', class: 'bg-red-100 text-red-700' },
            available: { text: 'Active', class: 'bg-green-100 text-green-700' },
            error: { text: 'Error', class: 'bg-red-100 text-red-700' }
        };

        const badge = badges[healthStatus.status] || badges.disabled;

        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.class}`}>
                {badge.text}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="mt-6 p-6 bg-white rounded-xl shadow-lg border border-sky-100 dark:border-sky-900/40">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    <p className="mt-4 text-slate-600 dark:text-slate-400">Loading Monitorv2 configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-6 bg-white rounded-xl shadow-lg border border-sky-100 dark:border-sky-900/40 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-900/40">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                        <div className="text-4xl">📡</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Monitorv2</h2>
                                {getStatusBadge()}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                Advanced monitoring with PostgreSQL/TimescaleDB. Store monitoring history
                                with time-series data, automatic aggregation, and high-performance queries.
                            </p>

                            {healthStatus && healthStatus.status === 'available' && (
                                <div className="flex gap-4 text-sm">
                                    <div className="px-3 py-1 bg-white rounded-lg border border-sky-100 dark:border-sky-900/40">
                                        <span className="text-slate-600 dark:text-slate-400">Monitors:</span>
                                        <span className="font-semibold text-slate-900 dark:text-white ml-1">{healthStatus.monitors || 0}</span>
                                    </div>
                                    <div className="px-3 py-1 bg-white rounded-lg border border-sky-100 dark:border-sky-900/40">
                                        <span className="text-slate-600 dark:text-slate-400">24h Checks:</span>
                                        <span className="font-semibold text-slate-900 dark:text-white ml-1">{healthStatus.checks_24h?.toLocaleString() || 0}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="px-4 py-2 text-sm text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg transition-colors"
                        >
                            {expanded ? 'Hide' : 'Configure'}
                        </button>

                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 dark:peer-focus:ring-sky-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-sky-600"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Configuration Panel */}
            {expanded && (
                <div className="p-6 space-y-6 bg-sky-50/40 dark:bg-sky-950/20">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {/* Tabs: Configuration | Backup & Restore */}
                    <div className="flex gap-1 border-b border-sky-100 dark:border-sky-900/40">
                        <button
                            type="button"
                            onClick={() => setMonitorv2Tab('config')}
                            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${monitorv2Tab === 'config' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100'}`}
                        >
                            Configuration
                        </button>
                        <button
                            type="button"
                            onClick={() => setMonitorv2Tab('backup-restore')}
                            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${monitorv2Tab === 'backup-restore' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100'}`}
                        >
                            Backup & Restore
                        </button>
                    </div>

                    {monitorv2Tab === 'backup-restore' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Schema Backup (DDL)</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                    Download the full DDL of all Monitorv2 tables, views, functions, and triggers. Use this to create or recreate the database structure. Setup and Restore will create the database if it does not exist.
                                </p>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setSchemaBackupLoading(true);
                                        try {
                                            const url = `${API_BASE}/addons/monitorv2/schema-backup`;
                                            const res = await fetch(url, { credentials: 'include' });
                                            if (!res.ok) {
                                                const data = await res.json().catch(() => ({}));
                                                throw new Error(data.error || `Schema backup failed (${res.status})`);
                                            }
                                            const blob = await res.blob();
                                            const disp = res.headers.get('Content-Disposition');
                                            const match = disp && disp.match(/filename="?([^";]+)"?/);
                                            const name = match ? match[1] : `monitorv2_schema_${new Date().toISOString().slice(0, 10)}.sql`;
                                            const a = document.createElement('a');
                                            a.href = URL.createObjectURL(blob);
                                            a.download = name;
                                            a.click();
                                            URL.revokeObjectURL(a.href);
                                        } catch (err: any) {
                                            setError(err.message);
                                        } finally {
                                            setSchemaBackupLoading(false);
                                        }
                                    }}
                                    disabled={schemaBackupLoading}
                                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {schemaBackupLoading ? 'Downloading...' : 'Download schema (DDL)'}
                                </button>
                                <p className="text-xs text-gray-500 mt-3">
                                    Contains full DDL for schema <code className="bg-gray-100 px-1 rounded">zmonitoring</code>. Run against your PostgreSQL database; the database is created automatically on Setup or Restore if it does not exist.
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Database Backup</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                    Download a full backup of the Monitorv2 PostgreSQL database as a ZIP file (contains a plain SQL dump). Use the same connection settings configured in the Configuration tab.
                                </p>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setBackupLoading(true);
                                        try {
                                            const url = `${API_BASE}/addons/monitorv2/backup`;
                                            const res = await fetch(url, { credentials: 'include' });
                                            const contentType = res.headers.get('Content-Type') || '';
                                            if (!res.ok) {
                                                const data = await res.json().catch(() => ({}));
                                                throw new Error(data.error || data.hint || `Backup failed (${res.status})`);
                                            }
                                            const blob = await res.blob();
                                            const disp = res.headers.get('Content-Disposition');
                                            const match = disp && disp.match(/filename="?([^";]+)"?/);
                                            const name = match ? match[1] : `monitorv2_backup_${new Date().toISOString().slice(0, 10)}.zip`;
                                            const a = document.createElement('a');
                                            a.href = URL.createObjectURL(blob);
                                            a.download = name;
                                            a.click();
                                            URL.revokeObjectURL(a.href);
                                        } catch (err: any) {
                                            setError(err.message);
                                        } finally {
                                            setBackupLoading(false);
                                        }
                                    }}
                                    disabled={backupLoading || !config.pgHost || !config.pgDatabase}
                                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {backupLoading ? 'Creating backup...' : 'Download backup (ZIP)'}
                                </button>
                                <p className="text-xs text-gray-500 mt-3">
                                    Backup uses PHP/PDO only (no <code className="bg-gray-100 px-1 rounded">pg_dump</code> required). Data-only SQL; run the schema (DDL) first if the database is empty, or use Setup schema / Restore (database is created automatically if missing).
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Restore from backup</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                    Upload a previously downloaded .sql or .zip backup to restore the Monitorv2 database. This will run the SQL against the configured database (existing data may be affected).
                                </p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="cursor-pointer">
                                        <span className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 inline-block">Choose file</span>
                                        <input
                                            type="file"
                                            accept=".sql,.zip"
                                            className="hidden"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                setRestoreFile(f || null);
                                                setRestoreResult(null);
                                            }}
                                        />
                                    </label>
                                    {restoreFile && <span className="text-sm text-slate-600 dark:text-slate-400">{restoreFile.name}</span>}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!restoreFile) return;
                                            setRestoreLoading(true);
                                            setError(null);
                                            setRestoreResult(null);
                                            try {
                                                const form = new FormData();
                                                form.append('file', restoreFile);
                                                const res = await fetch(`${API_BASE}/addons/monitorv2/restore`, {
                                                    method: 'POST',
                                                    credentials: 'include',
                                                    body: form
                                                });
                                                const data = await res.json().catch(() => ({}));
                                                if (res.ok && data.success) {
                                                    setRestoreResult({ success: true, message: data.message || 'Restored successfully.' });
                                                    setRestoreFile(null);
                                                } else {
                                                    setRestoreResult({ success: false, message: data.error || 'Restore failed' });
                                                }
                                            } catch (err: any) {
                                                setRestoreResult({ success: false, message: err.message });
                                            } finally {
                                                setRestoreLoading(false);
                                            }
                                        }}
                                        disabled={restoreLoading || !restoreFile}
                                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {restoreLoading ? 'Restoring...' : 'Restore'}
                                    </button>
                                </div>
                                {restoreResult && (
                                    <div className={`mt-3 p-3 rounded-lg text-sm ${restoreResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                                        {restoreResult.message}
                                    </div>
                                )}
                                <p className="text-xs text-gray-500 mt-3">
                                    Restore uses <code className="bg-gray-100 px-1 rounded">psql</code> if available, otherwise runs the SQL via PHP (no CLI tools required).
                                </p>
                            </div>
                        </div>
                    )}

                    {monitorv2Tab === 'config' && (
                        <>
                            {/* PostgreSQL Connection */}
                            <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">PostgreSQL Connection</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Host <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={config.pgHost}
                                            onChange={(e) => setConfig({ ...config, pgHost: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                            placeholder="localhost"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Port <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={config.pgPort}
                                            onChange={(e) => setConfig({ ...config, pgPort: parseInt(e.target.value) })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                            placeholder="5433"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Database <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={config.pgDatabase}
                                            onChange={(e) => setConfig({ ...config, pgDatabase: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                            placeholder="postgres"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Username <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={config.pgUser}
                                            onChange={(e) => setConfig({ ...config, pgUser: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                            placeholder="postgres"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Password <span className="text-red-500">*</span>
                                    </label>
                                    <SecurePasswordInput
                                        value={pgPassword}
                                        onChange={(e) => setPgPassword(e.target.value)}
                                        placeholder="Enter PostgreSQL password"
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Password is encrypted when saved. Leave blank to keep existing password.
                                    </p>
                                </div>

                                <div className="mt-4">
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testing || !config.pgHost || !config.pgDatabase}
                                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {testing ? 'Testing...' : 'Test Connection'}
                                    </button>

                                    {testResult && (
                                        <div className={`mt-3 p-3 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                            <p className={`font-semibold ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                                {testResult.message}
                                            </p>
                                            {testResult.details && (
                                                <div className="mt-2 text-sm text-gray-700 space-y-1">
                                                    <p>✓ PostgreSQL: {testResult.details.postgres_version}</p>
                                                    {testResult.details.timescaledb_installed ? (
                                                        <p>✓ TimescaleDB: {testResult.details.timescaledb_version}</p>
                                                    ) : (
                                                        <p className="text-yellow-700">⚠ TimescaleDB not installed</p>
                                                    )}
                                                    {testResult.details.schema_exists && (
                                                        <p>✓ Schema exists: zmonitoring</p>
                                                    )}
                                                    {testResult.details.schema_ready ? (
                                                        <p className="text-green-700 font-semibold">✓ Schema ready</p>
                                                    ) : (
                                                        <p className="text-yellow-700">⚠ Schema not initialized. Click "Setup Schema" below.</p>
                                                    )}
                                                </div>
                                            )}
                                            {testResult.error && (
                                                <p className="mt-2 text-sm text-red-700">{testResult.error}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Data Retention */}
                            <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Data Retention</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Retention Period (days)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="3650"
                                            value={config.retentionDays}
                                            onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            How long to keep detailed check history
                                        </p>
                                    </div>

                                    <div className="flex items-center">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.autoCleanup}
                                                onChange={(e) => setConfig({ ...config, autoCleanup: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-gray-700">Auto-cleanup old data</span>
                                                <p className="text-xs text-gray-500">Automatically delete data older than retention period</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Setup Actions */}
                            <div className="bg-white rounded-lg border border-sky-100 dark:border-sky-900/40 p-5">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Setup Actions</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Create Database - show if DB doesn't exist */}
                                    {testResult && testResult.details && !testResult.details.db_exists && (
                                        <div className="border border-sky-200 dark:border-sky-800 rounded-lg p-4 bg-sky-50 dark:bg-sky-950/30">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-blue-800 mb-1">0. Create Database</h4>
                                                    <p className="text-xs text-sky-600 dark:text-sky-400">Create the "{config.pgDatabase}" database</p>
                                                </div>
                                                <span className="text-2xl">🔧</span>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const action = 'create-database';
                                                    try {
                                                        setSetupActions(prev => ({ ...prev, [action]: true }));
                                                        setError(null);

                                                        const response = await fetch(`${API_BASE}/addons/monitorv2/create-database`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                pgHost: config.pgHost,
                                                                pgPort: config.pgPort,
                                                                pgDatabase: config.pgDatabase,
                                                                pgUser: config.pgUser,
                                                                pgPassword: pgPassword
                                                            })
                                                        });

                                                        const data = await response.json();
                                                        setSetupResults(prev => ({ ...prev, [action]: data }));

                                                        if (!response.ok || !data.success) {
                                                            throw new Error(data.error || data.message || 'Action failed');
                                                        }

                                                        // Re-test connection after creating database
                                                        await handleTestConnection();

                                                    } catch (err: any) {
                                                        setError(err.message);
                                                        setSetupResults(prev => ({ ...prev, [action]: { success: false, error: err.message } }));
                                                    } finally {
                                                        setSetupActions(prev => ({ ...prev, [action]: false }));
                                                    }
                                                }}
                                                disabled={setupActions['create-database'] || !config.enabled}
                                                className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                            >
                                                {setupActions['create-database'] ? 'Creating...' : 'Create Database'}
                                            </button>
                                            {setupResults['create-database'] && (
                                                <div className={`mt-2 p-2 rounded text-xs ${setupResults['create-database'].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {setupResults['create-database'].message || setupResults['create-database'].error}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Install Extensions - show if extensions needed */}
                                    {testResult && testResult.details && testResult.details.db_exists && (!testResult.details.timescaledb_installed || !testResult.details.pg_cron_installed) && (
                                        <div className="border border-sky-200 dark:border-sky-800 rounded-lg p-4 bg-sky-50 dark:bg-sky-950/30">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-indigo-800 mb-1">0. Install Extensions</h4>
                                                    <p className="text-xs text-indigo-600">Install TimescaleDB and pg_cron extensions</p>
                                                </div>
                                                <span className="text-2xl">🔌</span>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const action = 'install-extensions';
                                                    try {
                                                        setSetupActions(prev => ({ ...prev, [action]: true }));
                                                        setError(null);

                                                        const response = await fetch(`${API_BASE}/addons/monitorv2/install-extensions`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                pgHost: config.pgHost,
                                                                pgPort: config.pgPort,
                                                                pgDatabase: config.pgDatabase,
                                                                pgUser: config.pgUser,
                                                                pgPassword: pgPassword
                                                            })
                                                        });

                                                        const data = await response.json();
                                                        setSetupResults(prev => ({ ...prev, [action]: data }));

                                                        if (!response.ok || !data.success) {
                                                            throw new Error(data.error || data.message || 'Action failed');
                                                        }

                                                        // Re-test connection after installing extensions
                                                        await handleTestConnection();

                                                    } catch (err: any) {
                                                        setError(err.message);
                                                        setSetupResults(prev => ({ ...prev, [action]: { success: false, error: err.message } }));
                                                    } finally {
                                                        setSetupActions(prev => ({ ...prev, [action]: false }));
                                                    }
                                                }}
                                                disabled={setupActions['install-extensions'] || !config.enabled}
                                                className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                            >
                                                {setupActions['install-extensions'] ? 'Installing...' : 'Install Extensions'}
                                            </button>
                                            {setupResults['install-extensions'] && (
                                                <div className={`mt-2 p-2 rounded text-xs ${setupResults['install-extensions'].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {setupResults['install-extensions'].message || setupResults['install-extensions'].error}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Setup Schema */}
                                    <div className="border border-sky-100 dark:border-sky-900/40 rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h4 className="font-semibold text-slate-900 dark:text-white mb-1">1. Setup Database Schema</h4>
                                                <p className="text-xs text-slate-600 dark:text-slate-400">Initialize TimescaleDB tables and hypertables</p>
                                            </div>
                                            <span className="text-2xl">🗄️</span>
                                        </div>
                                        <button
                                            onClick={() => handleSetupAction('setup-schema')}
                                            disabled={setupActions['setup-schema'] || !config.enabled}
                                            className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                        >
                                            {setupActions['setup-schema'] ? 'Setting up...' : 'Setup Schema'}
                                        </button>
                                        {setupResults['setup-schema'] && (
                                            <div className={`mt-2 p-2 rounded text-xs ${setupResults['setup-schema'].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                {setupResults['setup-schema'].message || setupResults['setup-schema'].error}
                                            </div>
                                        )}
                                    </div>

                                    {/* Purge Data */}
                                    <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h4 className="font-semibold text-red-800 mb-1">⚠️ Purge All Data</h4>
                                                <p className="text-xs text-red-600">Delete all Monitorv2 data (irreversible)</p>
                                            </div>
                                            <span className="text-2xl">🗑️</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (confirm('⚠️ WARNING: This will delete ALL Monitorv2 data. This action cannot be undone!\\n\\nType "DELETE" to confirm.')) {
                                                    const confirmText = prompt('Type "DELETE_ALL_DATA" to confirm:');
                                                    if (confirmText === 'DELETE_ALL_DATA') {
                                                        handleSetupAction('purge-data');
                                                    }
                                                }
                                            }}
                                            disabled={setupActions['purge-data'] || !config.enabled}
                                            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                        >
                                            {setupActions['purge-data'] ? 'Purging...' : 'Purge All Data'}
                                        </button>
                                        {setupResults['purge-data'] && (
                                            <div className={`mt-2 p-2 rounded text-xs ${setupResults['purge-data'].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                {setupResults['purge-data'].message || setupResults['purge-data'].error}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg">
                                    <p className="text-sm text-purple-800">
                                        <strong>Note:</strong> Ensure PostgreSQL with TimescaleDB is running on <code className="bg-sky-100 dark:bg-sky-900/40 px-1 rounded">{config.pgHost}:{config.pgPort}</code> before running setup.
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-sky-100 dark:border-sky-900/40">
                                <button
                                    onClick={() => {
                                        setExpanded(false);
                                        loadConfiguration();
                                    }}
                                    className="px-5 py-2 text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-sky-50/40 dark:bg-sky-950/20 transition-colors"
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                    {saving ? 'Saving...' : 'Save Configuration'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================
// SSH Gateway Addon Card Component
// ============================================
const SshGatewayAddonCard: React.FC = () => {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [ttydPath, setTtydPath] = useState('');
    const [sshPath, setSshPath] = useState('');
    const [x11Display, setX11Display] = useState('127.0.0.1:0.0');
    const [maxConnections, setMaxConnections] = useState(8);
    const [maxCeiling, setMaxCeiling] = useState(1000);
    const [resolved, setResolved] = useState<SshGatewayConfigResponse['resolved'] | null>(null);
    const [defaults, setDefaults] = useState<SshGatewayConfigResponse['defaults'] | null>(null);
    const [usageStatus, setUsageStatus] = useState<SshGatewayStatus | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState<string | null>(null);

    const applyResponse = (data: SshGatewayConfigResponse) => {
        setTtydPath(data.config.ttydPath || '');
        setSshPath(data.config.sshPath || '');
        setX11Display(data.config.x11Display || '127.0.0.1:0.0');
        setMaxConnections(Math.max(1, Number(data.config.maxConnections) || 8));
        setMaxCeiling(Math.max(1, Number(data.defaults.maxConnectionsCeiling) || 1000));
        setResolved(data.resolved);
        setDefaults(data.defaults);
    };

    const loadUsage = async () => {
        try {
            setUsageLoading(true);
            setUsageError(null);
            const st = await sshGatewayService.status();
            setUsageStatus(st);
        } catch (err: any) {
            setUsageError(err.message || 'Failed to load ttyd usage');
        } finally {
            setUsageLoading(false);
        }
    };

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await sshGatewayService.getConfig();
            applyResponse(data);
            void loadUsage();
        } catch (err: any) {
            setError(err.message || 'Failed to load SSH gateway config');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfiguration();
    }, []);

    useEffect(() => {
        if (!expanded) return;
        void loadUsage();
        const t = window.setInterval(() => {
            void loadUsage();
        }, 15000);
        return () => window.clearInterval(t);
    }, [expanded]);

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSavedMsg(null);
            const clamped = Math.min(maxCeiling, Math.max(1, Math.floor(Number(maxConnections) || 1)));
            const data = await sshGatewayService.putConfig({
                ttydPath: ttydPath.trim(),
                sshPath: sshPath.trim(),
                x11Display: x11Display.trim(),
                maxConnections: clamped,
            });
            applyResponse(data);
            setSavedMsg('SSH gateway settings saved.');
            void loadUsage();
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const ready = Boolean(resolved?.ttydExists && resolved?.sshExists);
    const usage = usageStatus?.usage;
    const sessionRows = usageStatus?.allSessions ?? usageStatus?.sessions ?? [];

    const stopMyLeftovers = async () => {
        if (!window.confirm('Stop all of your leftover ttyd gateways? Open SSH tabs will disconnect.')) {
            return;
        }
        try {
            setUsageLoading(true);
            setUsageError(null);
            const r = await sshGatewayService.stopAll();
            setSavedMsg(
                `Stopped ${r.stopped} gateway(s)` +
                    (r.sweptUntracked ? ` and swept ${r.sweptUntracked} untracked listener(s)` : '') +
                    '.'
            );
            await loadUsage();
        } catch (err: any) {
            setUsageError(err.message || 'Failed to stop gateways');
            setError(err.message || 'Failed to stop gateways');
        } finally {
            setUsageLoading(false);
        }
    };

    const stopAllOnServer = async () => {
        if (
            !window.confirm(
                'ADMIN: Stop ALL ttyd gateways on this server for every user? This kills every Easy-mode SSH process.'
            )
        ) {
            return;
        }
        try {
            setUsageLoading(true);
            setUsageError(null);
            const r = await sshGatewayService.stopAll({ scope: 'all' });
            setSavedMsg(
                `Stopped ${r.stopped} gateway(s) (server-wide)` +
                    (r.sweptUntracked ? `, swept ${r.sweptUntracked} untracked` : '') +
                    '.'
            );
            await loadUsage();
        } catch (err: any) {
            setUsageError(err.message || 'Failed to stop all gateways');
            setError(err.message || 'Failed to stop all gateways');
        } finally {
            setUsageLoading(false);
        }
    };

    return (
        <div className="mt-6 bg-white rounded-xl shadow-lg border border-sky-100 dark:border-sky-900/40 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-emerald-50 via-teal-50/80 to-cyan-50/60 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-900/40">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                        <div className="text-4xl">🖥️</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">SSH Gateway</h2>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        ready
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                    }`}
                                >
                                    {loading ? 'Checking…' : ready ? 'Ready' : 'Needs paths'}
                                </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                Configure full paths to <code className="text-xs bg-white/70 dark:bg-slate-900 px-1 rounded">ttyd</code> and
                                OpenSSH <code className="text-xs bg-white/70 dark:bg-slate-900 px-1 rounded">ssh</code> when they are not on
                                Apache/PHP PATH (common on Windows). Used by SSH Terminal Easy mode.
                            </p>
                            {resolved && !loading && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        ttyd: {resolved.ttydExists ? 'found' : 'missing'}
                                    </span>
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        ssh: {resolved.sshExists ? 'found' : 'missing'}
                                    </span>
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        VcXsrv: {resolved.vcxsrvPath ? 'found' : 'not detected'}
                                    </span>
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        max sessions: {maxConnections}/{maxCeiling}
                                    </span>
                                    {usage && (
                                        <>
                                            <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                                your ttyd: {usage.mine.sessions}/{usage.mine.maxConnections}
                                                {usage.mine.memoryHuman ? ` · ${usage.mine.memoryHuman}` : ''}
                                            </span>
                                            <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                                global ttyd: {usage.global.sessions}/{usage.global.portCapacity}
                                                {usage.global.memoryHuman ? ` · ${usage.global.memoryHuman}` : ''}
                                            </span>
                                            {usage.host?.memoryUsedHuman && usage.host?.memoryTotalHuman && (
                                                <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                                    host RAM: {usage.host.memoryUsedHuman}/{usage.host.memoryTotalHuman}
                                                    {usage.host.cpuCount ? ` · ${usage.host.cpuCount} CPU` : ''}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void loadUsage()}
                                    disabled={usageLoading}
                                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                                >
                                    {usageLoading ? 'Refreshing…' : 'Refresh usage'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void stopMyLeftovers()}
                                    disabled={usageLoading}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                                >
                                    Stop my leftovers
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void stopAllOnServer()}
                                    disabled={usageLoading}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-400 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50"
                                >
                                    Stop all on server
                                </button>
                            </div>
                            {usageError && !expanded && (
                                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{usageError}</p>
                            )}
                            {savedMsg && !expanded && (
                                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{savedMsg}</p>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                    >
                        {expanded ? 'Hide' : 'Configure'}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="p-6 space-y-5 bg-emerald-50/30 dark:bg-emerald-950/10">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            <strong>Error:</strong> {error}
                        </div>
                    )}
                    {savedMsg && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
                            {savedMsg}
                        </div>
                    )}

                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-slate-900 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live ttyd usage</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Per-user quota, global port capacity, and working-set memory (ttyd + child ssh). Use this when deciding to raise max sessions or host RAM/CPU.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => void loadUsage()}
                                disabled={usageLoading}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                                {usageLoading ? 'Refreshing…' : 'Refresh usage'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void stopMyLeftovers()}
                                disabled={usageLoading}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50"
                            >
                                Stop my leftovers
                            </button>
                            <button
                                type="button"
                                onClick={() => void stopAllOnServer()}
                                disabled={usageLoading}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                            >
                                Stop all on server
                            </button>
                            </div>
                        </div>
                        {usageError && <p className="text-xs text-red-600 dark:text-red-400">{usageError}</p>}
                        {usage && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2">
                                    <div className="text-slate-500 dark:text-slate-400">Your quota</div>
                                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                        {usage.mine.sessions} / {usage.mine.maxConnections}
                                    </div>
                                    <div className="text-slate-500">
                                        {usage.mine.remaining} remaining · {usage.mine.memoryHuman || '0 B'}
                                        {typeof usage.mine.clientless === 'number' && usage.mine.clientless > 0
                                            ? ` · ${usage.mine.clientless} clientless`
                                            : ''}
                                    </div>
                                </div>
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2">
                                    <div className="text-slate-500 dark:text-slate-400">Global (all users)</div>
                                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                        {usage.global.sessions} / {usage.global.portCapacity}
                                    </div>
                                    <div className="text-slate-500">
                                        {usage.global.remainingPorts} ports free · {usage.global.memoryHuman || '0 B'}
                                    </div>
                                </div>
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2">
                                    <div className="text-slate-500 dark:text-slate-400">Host resources</div>
                                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                        {usage.host?.memoryUsedHuman || '—'} / {usage.host?.memoryTotalHuman || '—'}
                                    </div>
                                    <div className="text-slate-500">
                                        {usage.host?.memoryAvailableHuman
                                            ? `${usage.host.memoryAvailableHuman} free`
                                            : 'RAM n/a'}
                                        {usage.host?.cpuCount ? ` · ${usage.host.cpuCount} logical CPU` : ''}
                                        {usage.host?.loadAverage
                                            ? ` · load ${usage.host.loadAverage['1m']} / ${usage.host.loadAverage['5m']} / ${usage.host.loadAverage['15m']}`
                                            : ''}
                                    </div>
                                </div>
                            </div>
                        )}
                        {sessionRows.length > 0 ? (
                            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        <tr>
                                            <th className="text-left px-2 py-1.5 font-medium">Target</th>
                                            <th className="text-left px-2 py-1.5 font-medium">Clients</th>
                                            <th className="text-left px-2 py-1.5 font-medium">Port</th>
                                            <th className="text-left px-2 py-1.5 font-medium">PID</th>
                                            <th className="text-right px-2 py-1.5 font-medium">ttyd</th>
                                            <th className="text-right px-2 py-1.5 font-medium">Children</th>
                                            <th className="text-right px-2 py-1.5 font-medium">Total</th>
                                            {sessionRows.some((r) => r.userId != null) && (
                                                <th className="text-right px-2 py-1.5 font-medium">User</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                                        {sessionRows.map((row) => (
                                            <tr key={row.sessionId}>
                                                <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">
                                                    {(row.username || '?') + '@' + (row.host || '?') + ':' + (row.port ?? 22)}
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    {row.orphan || (row.clientCount ?? 0) < 1 ? (
                                                        <span className="text-amber-700 dark:text-amber-300">none</span>
                                                    ) : (
                                                        <span className="text-emerald-700 dark:text-emerald-300">{row.clientCount}</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">
                                                    {row.listenPort ?? '—'}
                                                </td>
                                                <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">
                                                    {row.pid ?? row.memory?.pid ?? '—'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">{row.memory?.ttydHuman || '—'}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">
                                                    {row.memory?.childrenHuman || '0 B'}
                                                    {row.memory?.childProcessCount
                                                        ? ` (${row.memory.childProcessCount})`
                                                        : ''}
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                                                    {row.memory?.totalHuman || '—'}
                                                </td>
                                                {sessionRows.some((r) => r.userId != null) && (
                                                    <td className="px-2 py-1.5 text-right text-slate-500">{row.userId ?? '—'}</td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            !usageLoading && <p className="text-xs text-slate-500">No active ttyd sessions right now.</p>
                        )}
                    </div>

                    {loading ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                                    ttyd executable path
                                </label>
                                <input
                                    type="text"
                                    value={ttydPath}
                                    onChange={(e) => setTtydPath(e.target.value)}
                                    placeholder="e.g. C:\xampp\htdocs\linknest\bin\ttyd.exe"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono"
                                />
                                {resolved?.ttydPath && (
                                    <p className="mt-1 text-xs text-slate-500">Resolved: {resolved.ttydPath}</p>
                                )}
                                {defaults?.ttydCandidates && defaults.ttydCandidates.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {defaults.ttydCandidates.slice(0, 4).map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => setTtydPath(p)}
                                                className="text-[11px] px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 truncate max-w-full"
                                                title={p}
                                            >
                                                Use detected ttyd
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                                    OpenSSH ssh.exe path
                                </label>
                                <input
                                    type="text"
                                    value={sshPath}
                                    onChange={(e) => setSshPath(e.target.value)}
                                    placeholder="e.g. C:\xampp\htdocs\linknest\bin\OpenSSH\ssh.exe"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono"
                                />
                                {resolved?.sshPath && (
                                    <p className="mt-1 text-xs text-slate-500">Resolved: {resolved.sshPath}</p>
                                )}
                                {defaults?.sshCandidates && defaults.sshCandidates.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {defaults.sshCandidates.slice(0, 3).map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => setSshPath(p)}
                                                className="text-[11px] px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 truncate max-w-full"
                                                title={p}
                                            >
                                                Use detected ssh
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                                    Default X11 display (GUI mode)
                                </label>
                                <input
                                    type="text"
                                    value={x11Display}
                                    onChange={(e) => setX11Display(e.target.value)}
                                    placeholder="127.0.0.1:0.0"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono max-w-xs"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    Local XAMPP: <code className="font-mono">127.0.0.1:0.0</code>. Docker:{' '}
                                    <code className="font-mono">host.docker.internal:0.0</code> (VcXsrv on the host with
                                    “Disable access control”).
                                </p>
                                {resolved?.vcxsrvPath && (
                                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">VcXsrv: {resolved.vcxsrvPath}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                                    Max concurrent connections per user
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={maxCeiling}
                                    step={1}
                                    value={maxConnections}
                                    onChange={(e) => {
                                        const n = Number.parseInt(e.target.value, 10);
                                        if (!Number.isFinite(n)) {
                                            setMaxConnections(1);
                                            return;
                                        }
                                        setMaxConnections(Math.min(maxCeiling, Math.max(1, n)));
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm max-w-xs"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    Limits open SSH Easy-mode sessions at once (default {defaults?.maxConnectionsDefault ?? 8},
                                    maximum {maxCeiling}). The SSH Terminal widget enforces the same limit.
                                    {defaults?.portRange && (
                                        <> Gateway ports: {defaults.portRange[0]}–{defaults.portRange[1]}.</>
                                    )}
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-2 border-t border-emerald-100 dark:border-emerald-900/40">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExpanded(false);
                                        loadConfiguration();
                                        setSavedMsg(null);
                                    }}
                                    className="px-5 py-2 text-slate-700 dark:text-slate-200 bg-white border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                                >
                                    {saving ? 'Saving…' : 'Save Settings'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const VncGatewayAddonCard: React.FC = () => {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [pythonPath, setPythonPath] = useState('');
    const [websockifyPath, setWebsockifyPath] = useState('');
    const [maxConnections, setMaxConnections] = useState(8);
    const [maxCeiling, setMaxCeiling] = useState(1000);
    const [resolved, setResolved] = useState<VncGatewayConfigResponse['resolved'] | null>(null);
    const [defaults, setDefaults] = useState<VncGatewayConfigResponse['defaults'] | null>(null);
    const [usageStatus, setUsageStatus] = useState<VncGatewayStatus | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState<string | null>(null);

    const applyResponse = (data: VncGatewayConfigResponse) => {
        setPythonPath(data.config.pythonPath || '');
        setWebsockifyPath(data.config.websockifyPath || '');
        setMaxConnections(Math.max(1, Number(data.config.maxConnections) || 8));
        setMaxCeiling(Math.max(1, Number(data.defaults.maxConnectionsCeiling) || 1000));
        setResolved(data.resolved);
        setDefaults(data.defaults);
    };

    const loadUsage = async () => {
        try {
            setUsageLoading(true);
            setUsageError(null);
            const st = await vncGatewayService.status();
            setUsageStatus(st);
        } catch (err: any) {
            setUsageError(err.message || 'Failed to load websockify usage');
        } finally {
            setUsageLoading(false);
        }
    };

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await vncGatewayService.getConfig();
            applyResponse(data);
            void loadUsage();
        } catch (err: any) {
            setError(err.message || 'Failed to load VNC gateway config');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfiguration();
    }, []);

    useEffect(() => {
        if (!expanded) return;
        void loadUsage();
        const t = window.setInterval(() => {
            void loadUsage();
        }, 15000);
        return () => window.clearInterval(t);
    }, [expanded]);

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSavedMsg(null);
            const clamped = Math.min(maxCeiling, Math.max(1, Math.floor(Number(maxConnections) || 1)));
            const data = await vncGatewayService.putConfig({
                pythonPath: pythonPath.trim(),
                websockifyPath: websockifyPath.trim(),
                maxConnections: clamped,
            });
            applyResponse(data);
            setSavedMsg('VNC gateway settings saved.');
            void loadUsage();
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const ready = Boolean(resolved?.websockifyExists && resolved?.pythonExists);
    const usage = usageStatus?.usage;
    const sessionRows = usageStatus?.allSessions ?? usageStatus?.sessions ?? [];

    const stopMyLeftovers = async () => {
        if (!window.confirm('Stop all of your leftover websockify gateways? Open VNC tabs will disconnect.')) {
            return;
        }
        try {
            setUsageLoading(true);
            setUsageError(null);
            const r = await vncGatewayService.stopAll();
            setSavedMsg(
                `Stopped ${r.stopped} gateway(s)` +
                    (r.sweptUntracked ? ` and swept ${r.sweptUntracked} untracked listener(s)` : '') +
                    '.'
            );
            await loadUsage();
        } catch (err: any) {
            setUsageError(err.message || 'Failed to stop gateways');
            setError(err.message || 'Failed to stop gateways');
        } finally {
            setUsageLoading(false);
        }
    };

    const stopAllOnServer = async () => {
        if (
            !window.confirm(
                'ADMIN: Stop ALL websockify gateways on this server for every user? This kills every Easy-mode VNC process.'
            )
        ) {
            return;
        }
        try {
            setUsageLoading(true);
            setUsageError(null);
            const r = await vncGatewayService.stopAll({ scope: 'all' });
            setSavedMsg(
                `Stopped ${r.stopped} gateway(s) (server-wide)` +
                    (r.sweptUntracked ? `, swept ${r.sweptUntracked} untracked` : '') +
                    '.'
            );
            await loadUsage();
        } catch (err: any) {
            setUsageError(err.message || 'Failed to stop all gateways');
            setError(err.message || 'Failed to stop all gateways');
        } finally {
            setUsageLoading(false);
        }
    };

    return (
        <div className="mt-6 bg-white rounded-xl shadow-lg border border-sky-100 dark:border-sky-900/40 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-violet-50 via-fuchsia-50/70 to-sky-50/60 dark:from-violet-950/40 dark:via-fuchsia-950/30 dark:to-sky-950/20 border-b border-sky-100 dark:border-sky-900/40">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                        <div className="text-4xl">🖥️</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">VNC Gateway</h2>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        ready
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                    }`}
                                >
                                    {loading ? 'Checking…' : ready ? 'Ready' : 'Needs setup'}
                                </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                Easy mode starts <code className="text-xs bg-white/70 dark:bg-slate-900 px-1 rounded">websockify</code> on
                                this server so the VNC Viewer only needs host + port (like SSH Easy mode).
                            </p>
                            {resolved && !loading && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        Python: {resolved.pythonExists ? 'found' : 'missing'}
                                    </span>
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        websockify: {resolved.websockifyExists ? 'ready' : 'missing'}
                                    </span>
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        packages: {resolved.packagesPresent ? 'vendored' : 'run install script'}
                                    </span>
                                    <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                        max sessions: {maxConnections}/{maxCeiling}
                                    </span>
                                    {usage && (
                                        <>
                                            <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                                your websockify: {usage.mine.sessions}/{usage.mine.maxConnections}
                                                {usage.mine.memoryHuman ? ` · ${usage.mine.memoryHuman}` : ''}
                                            </span>
                                            <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                                global websockify: {usage.global.sessions}/{usage.global.portCapacity}
                                                {usage.global.memoryHuman ? ` · ${usage.global.memoryHuman}` : ''}
                                            </span>
                                            {usage.host?.memoryUsedHuman && usage.host?.memoryTotalHuman && (
                                                <span className="px-2 py-1 bg-white rounded border border-sky-100 dark:border-sky-900/40 dark:bg-slate-900/40">
                                                    host RAM: {usage.host.memoryUsedHuman}/{usage.host.memoryTotalHuman}
                                                    {usage.host.cpuCount ? ` · ${usage.host.cpuCount} CPU` : ''}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void loadUsage()}
                                    disabled={usageLoading}
                                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                                >
                                    {usageLoading ? 'Refreshing…' : 'Refresh usage'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void stopMyLeftovers()}
                                    disabled={usageLoading}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                                >
                                    Stop my leftovers
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void stopAllOnServer()}
                                    disabled={usageLoading}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-400 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50"
                                >
                                    Stop all on server
                                </button>
                            </div>
                            {usageError && !expanded && (
                                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{usageError}</p>
                            )}
                            {savedMsg && !expanded && (
                                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{savedMsg}</p>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="px-4 py-2 text-sm text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 rounded-lg transition-colors"
                    >
                        {expanded ? 'Hide' : 'Configure'}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="p-6 space-y-5 bg-violet-50/30 dark:bg-violet-950/10">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            <strong>Error:</strong> {error}
                        </div>
                    )}
                    {savedMsg && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
                            {savedMsg}
                        </div>
                    )}

                    <div className="rounded-lg border border-violet-200 dark:border-violet-900/40 bg-white dark:bg-slate-900 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live websockify usage</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Per-user quota, global port capacity, and working-set memory (python + websockify). Use this when deciding to raise max sessions or host RAM/CPU.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => void loadUsage()}
                                disabled={usageLoading}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                                {usageLoading ? 'Refreshing…' : 'Refresh usage'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void stopMyLeftovers()}
                                disabled={usageLoading}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50"
                            >
                                Stop my leftovers
                            </button>
                            <button
                                type="button"
                                onClick={() => void stopAllOnServer()}
                                disabled={usageLoading}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                            >
                                Stop all on server
                            </button>
                            </div>
                        </div>
                        {usageError && <p className="text-xs text-red-600 dark:text-red-400">{usageError}</p>}
                        {usage && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2">
                                    <div className="text-slate-500 dark:text-slate-400">Your quota</div>
                                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                        {usage.mine.sessions} / {usage.mine.maxConnections}
                                    </div>
                                    <div className="text-slate-500">
                                        {usage.mine.remaining} remaining · {usage.mine.memoryHuman || '0 B'}
                                    </div>
                                </div>
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2">
                                    <div className="text-slate-500 dark:text-slate-400">Global (all users)</div>
                                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                        {usage.global.sessions} / {usage.global.portCapacity}
                                    </div>
                                    <div className="text-slate-500">
                                        {usage.global.remainingPorts} ports free · {usage.global.memoryHuman || '0 B'}
                                    </div>
                                </div>
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2">
                                    <div className="text-slate-500 dark:text-slate-400">Host resources</div>
                                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                        {usage.host?.memoryUsedHuman || '—'} / {usage.host?.memoryTotalHuman || '—'}
                                    </div>
                                    <div className="text-slate-500">
                                        {usage.host?.memoryAvailableHuman
                                            ? `${usage.host.memoryAvailableHuman} free`
                                            : 'RAM n/a'}
                                        {usage.host?.cpuCount ? ` · ${usage.host.cpuCount} logical CPU` : ''}
                                        {usage.host?.loadAverage
                                            ? ` · load ${usage.host.loadAverage['1m']} / ${usage.host.loadAverage['5m']} / ${usage.host.loadAverage['15m']}`
                                            : ''}
                                    </div>
                                </div>
                            </div>
                        )}
                        {sessionRows.length > 0 ? (
                            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        <tr>
                                            <th className="text-left px-2 py-1.5 font-medium">Target</th>
                                            <th className="text-left px-2 py-1.5 font-medium">Port</th>
                                            <th className="text-left px-2 py-1.5 font-medium">PID</th>
                                            <th className="text-right px-2 py-1.5 font-medium">Process</th>
                                            <th className="text-right px-2 py-1.5 font-medium">Children</th>
                                            <th className="text-right px-2 py-1.5 font-medium">Total</th>
                                            {sessionRows.some((r) => r.userId != null) && (
                                                <th className="text-right px-2 py-1.5 font-medium">User</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                                        {sessionRows.map((row) => (
                                            <tr key={row.sessionId}>
                                                <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">
                                                    {(row.host || '?') + ':' + (row.port ?? 5900)}
                                                </td>
                                                <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">
                                                    {row.listenPort ?? '—'}
                                                </td>
                                                <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">
                                                    {row.pid ?? row.memory?.pid ?? '—'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">{row.memory?.processHuman || '—'}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">
                                                    {row.memory?.childrenHuman || '0 B'}
                                                    {row.memory?.childProcessCount
                                                        ? ` (${row.memory.childProcessCount})`
                                                        : ''}
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                                                    {row.memory?.totalHuman || '—'}
                                                </td>
                                                {sessionRows.some((r) => r.userId != null) && (
                                                    <td className="px-2 py-1.5 text-right text-slate-500">{row.userId ?? '—'}</td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            !usageLoading && <p className="text-xs text-slate-500">No active websockify sessions right now.</p>
                        )}
                    </div>

                    {loading ? (
                        <p className="text-sm text-slate-500">Loading…</p>
                    ) : (
                        <>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Deploy packages ship embeddable Python under{' '}
                                <code className="text-xs bg-white dark:bg-slate-900 px-1 rounded">bin/python</code> plus vendored
                                websockify in <code className="text-xs">bin/python-packages</code>. Leave paths blank to auto-detect.
                            </p>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Python path</label>
                                <input
                                    type="text"
                                    value={pythonPath}
                                    onChange={(e) => setPythonPath(e.target.value)}
                                    placeholder={resolved?.pythonPath || 'bin\\python\\python.exe'}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono"
                                />
                                {resolved?.pythonPath && (
                                    <p className="mt-1 text-xs text-slate-500">Resolved: {resolved.pythonPath}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                                    websockify launcher (optional)
                                </label>
                                <input
                                    type="text"
                                    value={websockifyPath}
                                    onChange={(e) => setWebsockifyPath(e.target.value)}
                                    placeholder={resolved?.websockifyPath || 'bin\\run-websockify.cmd'}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono"
                                />
                                {resolved?.websockifyPath && (
                                    <p className="mt-1 text-xs text-slate-500">Resolved: {resolved.websockifyPath}</p>
                                )}
                                {resolved?.packagesDir && (
                                    <p className="mt-1 text-xs text-slate-500">Packages dir: {resolved.packagesDir}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                                    Max concurrent connections per user
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={maxCeiling}
                                    step={1}
                                    value={maxConnections}
                                    onChange={(e) => {
                                        const n = Number.parseInt(e.target.value, 10);
                                        if (!Number.isFinite(n)) {
                                            setMaxConnections(1);
                                            return;
                                        }
                                        setMaxConnections(Math.min(maxCeiling, Math.max(1, n)));
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm max-w-xs"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    Limits open VNC Easy-mode sessions at once (default {defaults?.maxConnectionsDefault ?? 8},
                                    maximum {maxCeiling}). The VNC Viewer widget enforces the same limit.
                                    {defaults?.portRange && (
                                        <> Gateway ports: {defaults.portRange[0]}–{defaults.portRange[1]}.</>
                                    )}
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-2 border-t border-violet-100 dark:border-violet-900/40">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExpanded(false);
                                        loadConfiguration();
                                        setSavedMsg(null);
                                    }}
                                    className="px-5 py-2 text-slate-700 dark:text-slate-200 bg-white border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                                >
                                    {saving ? 'Saving…' : 'Save Settings'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================
// System Email (SMTP) Addon Card
// ============================================
interface SystemEmailSmtpForm {
    id: number | null;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    encryption: 'none' | 'ssl' | 'tls';
    is_enabled: boolean;
    has_password: boolean;
}

interface SystemEmailConfig {
    enabled: boolean;
    publicUrl: string;
    notifyRegistration: boolean;
    notifyApproval: boolean;
    passwordRecovery: boolean;
    smtp: SystemEmailSmtpForm;
}

const SystemEmailAddonCard: React.FC = () => {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [testTo, setTestTo] = useState('');
    const [detectedPublicUrl, setDetectedPublicUrl] = useState('');
    const [healthStatus, setHealthStatus] = useState<{ status: string; message: string } | null>(null);
    const [config, setConfig] = useState<SystemEmailConfig>({
        enabled: false,
        publicUrl: '',
        notifyRegistration: true,
        notifyApproval: true,
        passwordRecovery: true,
        smtp: {
            id: null,
            name: 'Primary SMTP',
            host: '',
            port: 587,
            username: '',
            password: '',
            from_email: '',
            from_name: '{app_name}',
            encryption: 'tls',
            is_enabled: true,
            has_password: false,
        },
    });

    const getStatusBadge = () => {
        const status = healthStatus?.status || (config.enabled ? 'not_configured' : 'disabled');
        const badges: Record<string, { text: string; class: string }> = {
            disabled: { text: 'Disabled', class: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200' },
            not_configured: { text: 'Not Configured', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200' },
            unavailable: { text: 'SMTP Off', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
            available: { text: 'Active', class: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
            error: { text: 'Error', class: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
        };
        const badge = badges[status] || badges.disabled;
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.class}`}>
                {badge.text}
            </span>
        );
    };

    const checkHealth = async () => {
        try {
            const response = await fetch(`${API_BASE}/addons/system-email/status`, { credentials: 'include' });
            if (!response.ok) return;
            const data = await response.json();
            setHealthStatus({ status: data.status, message: data.message });
        } catch {
            // ignore
        }
    };

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/addons/system-email`, { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load System Email configuration');
            const data = await response.json();
            setConfig({
                enabled: !!data.config?.enabled,
                publicUrl: data.config?.publicUrl || '',
                notifyRegistration: data.config?.notifyRegistration !== false,
                notifyApproval: data.config?.notifyApproval !== false,
                passwordRecovery: data.config?.passwordRecovery !== false,
                smtp: {
                    id: data.config?.smtp?.id ?? null,
                    name: data.config?.smtp?.name || 'Primary SMTP',
                    host: data.config?.smtp?.host || '',
                    port: Number(data.config?.smtp?.port) || 587,
                    username: data.config?.smtp?.username || '',
                    password: '',
                    from_email: data.config?.smtp?.from_email || '',
                    from_name: data.config?.smtp?.from_name || '{app_name}',
                    encryption: (data.config?.smtp?.encryption || 'tls') as 'none' | 'ssl' | 'tls',
                    is_enabled: data.config?.smtp?.is_enabled !== false,
                    has_password: !!data.config?.smtp?.has_password,
                },
            });
            setDetectedPublicUrl(data.detectedPublicUrl || '');
            if (data.config?.enabled) setExpanded(true);
            await checkHealth();
        } catch (err: any) {
            setError(err.message || 'Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfiguration();
    }, []);

    const updateSmtp = <K extends keyof SystemEmailSmtpForm>(key: K, value: SystemEmailSmtpForm[K]) => {
        setConfig((prev) => ({ ...prev, smtp: { ...prev.smtp, [key]: value } }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSavedMsg(null);
            const response = await fetch(`${API_BASE}/addons/system-email`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: config.enabled,
                    publicUrl: config.publicUrl,
                    notifyRegistration: config.notifyRegistration,
                    notifyApproval: config.notifyApproval,
                    passwordRecovery: config.passwordRecovery,
                    smtp: {
                        name: config.smtp.name,
                        host: config.smtp.host,
                        port: config.smtp.port,
                        username: config.smtp.username,
                        password: config.smtp.password || undefined,
                        from_email: config.smtp.from_email,
                        from_name: config.smtp.from_name,
                        encryption: config.smtp.encryption,
                        is_enabled: config.smtp.is_enabled,
                    },
                }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to save');
            }
            const data = await response.json();
            setConfig((prev) => ({
                ...prev,
                enabled: !!data.config?.enabled,
                publicUrl: data.config?.publicUrl || '',
                notifyRegistration: data.config?.notifyRegistration !== false,
                notifyApproval: data.config?.notifyApproval !== false,
                passwordRecovery: data.config?.passwordRecovery !== false,
                smtp: {
                    ...prev.smtp,
                    id: data.config?.smtp?.id ?? prev.smtp.id,
                    name: data.config?.smtp?.name || prev.smtp.name,
                    host: data.config?.smtp?.host || '',
                    port: Number(data.config?.smtp?.port) || 587,
                    username: data.config?.smtp?.username || '',
                    password: '',
                    from_email: data.config?.smtp?.from_email || '',
                    from_name: data.config?.smtp?.from_name || '{app_name}',
                    encryption: (data.config?.smtp?.encryption || 'tls') as 'none' | 'ssl' | 'tls',
                    is_enabled: data.config?.smtp?.is_enabled !== false,
                    has_password: !!data.config?.smtp?.has_password,
                },
            }));
            setSavedMsg('System Email settings saved');
            await checkHealth();
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        try {
            setTesting(true);
            setTestResult(null);
            setError(null);
            const response = await fetch(`${API_BASE}/addons/system-email/test`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: testTo.trim() || undefined }),
            });
            const data = await response.json().catch(() => ({}));
            setTestResult({
                success: !!data.success,
                message: data.message || (data.success ? 'Sent' : 'Failed'),
            });
            await checkHealth();
        } catch (err: any) {
            setTestResult({ success: false, message: err.message || 'Test failed' });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-sky-200/70 dark:border-sky-800/40 p-6">
                <div className="text-sm text-slate-500">Loading System Email…</div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-sky-200/70 dark:border-sky-800/40 overflow-hidden shadow-sky-500/5">
            <div className="p-6 bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                        <div className="text-4xl" aria-hidden>✉️</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">System Email (SMTP)</h2>
                                {getStatusBadge()}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                                Configure SMTP for registration, admin approval, and local password recovery emails. Uses the same SMTP servers as Monitoring.
                            </p>
                            {healthStatus?.message && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{healthStatus.message}</p>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                    >
                        {expanded ? 'Collapse' : 'Configure'}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="p-6 space-y-5">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                            {error}
                        </div>
                    )}
                    {savedMsg && (
                        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-200">
                            {savedMsg}
                        </div>
                    )}

                    <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                        <div>
                            <div className="font-semibold text-slate-900 dark:text-white">Enable System Email</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">Send branded auth emails when SMTP is enabled</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
                            className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                    </label>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={config.notifyRegistration} onChange={(e) => setConfig((p) => ({ ...p, notifyRegistration: e.target.checked }))} className="rounded border-slate-300 text-sky-600" />
                            Registration emails
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={config.notifyApproval} onChange={(e) => setConfig((p) => ({ ...p, notifyApproval: e.target.checked }))} className="rounded border-slate-300 text-sky-600" />
                            Approval emails
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={config.passwordRecovery} onChange={(e) => setConfig((p) => ({ ...p, passwordRecovery: e.target.checked }))} className="rounded border-slate-300 text-sky-600" />
                            Password recovery
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Public app URL (for email links)</label>
                        <input
                            type="url"
                            value={config.publicUrl}
                            onChange={(e) => setConfig((p) => ({ ...p, publicUrl: e.target.value }))}
                            placeholder={detectedPublicUrl || 'https://example.com/linknest'}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                        />
                        {detectedPublicUrl && (
                            <p className="mt-1 text-xs text-slate-500">Detected: {detectedPublicUrl}</p>
                        )}
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-900 dark:text-white">SMTP server</h3>
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={config.smtp.is_enabled} onChange={(e) => updateSmtp('is_enabled', e.target.checked)} className="rounded border-slate-300 text-sky-600" />
                                SMTP enabled
                            </label>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Host</label>
                                <input value={config.smtp.host} onChange={(e) => updateSmtp('host', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" placeholder="smtp.example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Port</label>
                                <input type="number" value={config.smtp.port} onChange={(e) => updateSmtp('port', Number(e.target.value) || 587)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Encryption</label>
                                <select value={config.smtp.encryption} onChange={(e) => updateSmtp('encryption', e.target.value as 'none' | 'ssl' | 'tls')} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm">
                                    <option value="none">None</option>
                                    <option value="tls">TLS (STARTTLS)</option>
                                    <option value="ssl">SSL</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Username</label>
                                <input value={config.smtp.username} onChange={(e) => updateSmtp('username', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" autoComplete="off" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Password {config.smtp.has_password ? '(leave blank to keep current)' : ''}</label>
                                <SecurePasswordInput
                                    value={config.smtp.password}
                                    onChange={(e) => updateSmtp('password', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                                    autoComplete="new-password"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">From email</label>
                                <input type="email" value={config.smtp.from_email} onChange={(e) => updateSmtp('from_email', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" placeholder="noreply@example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">From name</label>
                                <input value={config.smtp.from_name} onChange={(e) => updateSmtp('from_name', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" placeholder="{app_name}" />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
                        <h3 className="font-semibold text-slate-900 dark:text-white">Send test email</h3>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="email"
                                value={testTo}
                                onChange={(e) => setTestTo(e.target.value)}
                                placeholder="recipient@example.com (defaults to your admin email)"
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                            />
                            <button
                                type="button"
                                onClick={handleTest}
                                disabled={testing}
                                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium disabled:opacity-50"
                            >
                                {testing ? 'Sending…' : 'Send test'}
                            </button>
                        </div>
                        {testResult && (
                            <div className={`rounded-lg px-4 py-3 text-sm ${testResult.success ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800' : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800'}`}>
                                {testResult.message}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={() => {
                                setExpanded(false);
                                loadConfiguration();
                                setSavedMsg(null);
                                setTestResult(null);
                            }}
                            className="px-5 py-2 text-slate-700 dark:text-slate-200 bg-white border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                        >
                            {saving ? 'Saving…' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
