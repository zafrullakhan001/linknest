import React, { useState, useEffect } from 'react';
import { SecurePasswordInput } from './SecurePasswordInput';
import { resolveApiBase } from '../services/apiHelpers';

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
                    <div className="inline-block w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-600">Loading add-ons configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Add-ons</h1>
                <p className="text-gray-600">Manage optional features and integrations for LinkNest</p>
            </div>

            {/* Performance Analytics Add-on Card */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                            <div className="text-4xl">📊</div>
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h2 className="text-xl font-bold text-gray-800">Performance Analytics</h2>
                                    {getStatusBadge()}
                                </div>
                                <p className="text-sm text-gray-600 mb-3">
                                    Real-time URL performance monitoring with geographic insights. Track client vs server latency across different regions with bubble chart visualizations.
                                </p>

                                {healthStatus && healthStatus.status === 'available' && (
                                    <div className="flex gap-4 text-sm">
                                        <div className="px-3 py-1 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-600">Metrics:</span>
                                            <span className="font-semibold text-gray-800 ml-1">{healthStatus.metrics_count?.toLocaleString() || 0}</span>
                                        </div>
                                        <div className="px-3 py-1 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-600">Queue:</span>
                                            <span className="font-semibold text-gray-800 ml-1">{healthStatus.queue_pending || 0}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
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
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Configuration Panel */}
                {expanded && (
                    <div className="p-6 space-y-6 bg-gray-50">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        {/* Tab navigation */}
                        <div className="flex gap-1 border-b border-gray-200 bg-white rounded-t-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setAnalyticsTab('config')}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${analyticsTab === 'config' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Configuration
                            </button>
                            <button
                                type="button"
                                onClick={() => setAnalyticsTab('backup-restore')}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${analyticsTab === 'backup-restore' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Backup & Restore
                            </button>
                            <button
                                type="button"
                                onClick={() => setAnalyticsTab('geo-resources')}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${analyticsTab === 'geo-resources' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Geo-location Resources
                            </button>
                        </div>

                        {analyticsTab === 'config' && (
                            <>
                                {/* PostgreSQL Connection */}
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">PostgreSQL Connection</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Host <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={config.pgHost}
                                                onChange={(e) => setConfig({ ...config, pgHost: e.target.value })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Tracking Options</h3>

                                    <div className="space-y-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.trackAnonymous}
                                                onChange={(e) => setConfig({ ...config, trackAnonymous: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                How long to keep metrics data
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Monitored URLs */}
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Monitored URLs</h3>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            URLs to Monitor (optional)
                                        </label>
                                        <textarea
                                            value={beaconUrlsText}
                                            onChange={(e) => setBeaconUrlsText(e.target.value)}
                                            rows={5}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-mono text-sm"
                                            placeholder={'https://example.com/app1\nhttps://example.com/app2\n\nLeave empty to monitor all links'}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Enter one URL per line. Leave empty to monitor all links on the page.
                                        </p>
                                    </div>
                                </div>

                                {/* Dashboard Access */}
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Analytics Dashboard</h3>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Dashboard URL
                                        </label>
                                        <input
                                            type="url"
                                            value={config.dashboardUrl}
                                            onChange={(e) => setConfig({ ...config, dashboardUrl: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                                        >
                                            <span>Open Analytics Dashboard</span>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </a>
                                    )}
                                </div>

                                {/* Setup Actions */}
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Setup Actions</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Setup Schema */}
                                        <div className="border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-gray-800 mb-1">1. Setup Database Schema</h4>
                                                    <p className="text-xs text-gray-600">Initialize TimescaleDB tables and views</p>
                                                </div>
                                                <span className="text-2xl">🗄️</span>
                                            </div>
                                            <button
                                                onClick={() => handleSetupAction('setup-schema')}
                                                disabled={setupActions['setup-schema'] || !config.enabled}
                                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                                        <div className="border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-gray-800 mb-1">2. GeoLite2 Database</h4>
                                                    <p className="text-xs text-gray-600">Get instructions for offline geolocation</p>
                                                </div>
                                                <span className="text-2xl">🌍</span>
                                            </div>
                                            <button
                                                onClick={() => handleSetupAction('download-geolite2')}
                                                disabled={setupActions['download-geolite2']}
                                                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                            >
                                                {setupActions['download-geolite2'] ? 'Checking...' : 'Get Instructions'}
                                            </button>
                                            {setupResults['download-geolite2'] && (
                                                <div className="mt-2 p-2 rounded text-xs bg-blue-50 text-blue-700">
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
                                                                <a href={setupResults['download-geolite2'].download_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-blue-600 hover:underline">
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
                                        <div className="border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-gray-800 mb-1">3. Start Workers</h4>
                                                    <p className="text-xs text-gray-600">Run background processing workers</p>
                                                </div>
                                                <span className="text-2xl">⚙️</span>
                                            </div>
                                            <div className="space-y-2 text-xs text-gray-600">
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

                                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-sm text-blue-800">
                                            <strong>Note:</strong> Ensure PostgreSQL with TimescaleDB is running on <code className="bg-blue-100 px-1 rounded">{config.pgHost}:{config.pgPort}</code> before running setup.
                                        </p>
                                    </div>
                                </div>

                                {/* Action Buttons - only for Configuration tab */}
                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        onClick={() => {
                                            setExpanded(false);
                                            loadConfiguration(); // Reload to discard changes
                                        }}
                                        className="px-5 py-2 text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                    >
                                        {saving ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </>
                        )}

                        {analyticsTab === 'backup-restore' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Database Backup</h3>
                                    <p className="text-sm text-gray-600 mb-4">
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
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {backupLoading ? 'Creating backup...' : 'Download backup (ZIP)'}
                                    </button>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Backup uses PHP/PDO only (no <code className="bg-gray-100 px-1 rounded">pg_dump</code> required). Data-only SQL; run <code className="bg-gray-100 px-1 rounded">analytics/schema.sql</code> before restore if the database is empty.
                                    </p>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Restore from backup</h3>
                                    <p className="text-sm text-gray-600 mb-4">
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
                                        {restoreFile && <span className="text-sm text-gray-600">{restoreFile.name}</span>}
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
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Geo-location free resources</h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Use these free datasets and tools for offline reverse geocoding (latitude/longitude → country, region, city). The <code className="bg-gray-100 px-1 rounded">location_lookup</code> table is used by the analytics worker to fill in city/region when only coordinates are available.
                                    </p>
                                    <ul className="space-y-3 text-sm">
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-gray-800">SimpleMaps World Cities (free, ~40k+ cities):</strong>
                                            <a href="https://simplemaps.com/data/world-cities" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">simplemaps.com/data/world-cities</a>
                                        </li>
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-gray-800">GeoNames country dumps (free):</strong>
                                            <a href="https://www.geonames.org/export/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">geonames.org/export/</a>
                                            <span className="text-gray-500">— US: </span>
                                            <a href="https://download.geonames.org/export/dump/US.zip" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">US.zip</a>
                                        </li>
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-gray-800">MaxMind GeoLite2 (free, IP → location):</strong>
                                            <a href="https://dev.maxmind.com/geoip/geolite2-free-geolocation-data" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">MaxMind GeoLite2</a>
                                            <span className="text-gray-500">— place GeoLite2-City.mmdb in analytics/geoip/</span>
                                        </li>
                                        <li className="flex flex-wrap items-start gap-2">
                                            <strong className="text-gray-800">ip-api.com (free tier, online):</strong>
                                            <span className="text-gray-500">45 requests/minute fallback when GeoLite2 is not used</span>
                                        </li>
                                    </ul>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Populated geo region insertion (command line)</h3>
                                    <p className="text-sm text-gray-600 mb-3">
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

            {/* Future Add-ons Placeholder */}
            <div className="mt-6 bg-white rounded-xl shadow-lg border border-gray-200 p-6 opacity-60">
                <div className="flex items-center gap-4">
                    <div className="text-4xl">🔌</div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">More Add-ons Coming Soon</h3>
                        <p className="text-sm text-gray-600">CDN Integration, Advanced Caching, and more...</p>
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
            <div className="mt-6 p-6 bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-600">Loading Monitorv2 configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-6 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-200">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                        <div className="text-4xl">📡</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold text-gray-800">Monitorv2</h2>
                                {getStatusBadge()}
                            </div>
                            <p className="text-sm text-gray-600 mb-3">
                                Advanced monitoring with PostgreSQL/TimescaleDB. Store monitoring history
                                with time-series data, automatic aggregation, and high-performance queries.
                            </p>

                            {healthStatus && healthStatus.status === 'available' && (
                                <div className="flex gap-4 text-sm">
                                    <div className="px-3 py-1 bg-white rounded-lg border border-gray-200">
                                        <span className="text-gray-600">Monitors:</span>
                                        <span className="font-semibold text-gray-800 ml-1">{healthStatus.monitors || 0}</span>
                                    </div>
                                    <div className="px-3 py-1 bg-white rounded-lg border border-gray-200">
                                        <span className="text-gray-600">24h Checks:</span>
                                        <span className="font-semibold text-gray-800 ml-1">{healthStatus.checks_24h?.toLocaleString() || 0}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="px-4 py-2 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
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
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Configuration Panel */}
            {expanded && (
                <div className="p-6 space-y-6 bg-gray-50">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {/* Tabs: Configuration | Backup & Restore */}
                    <div className="flex gap-1 border-b border-gray-200">
                        <button
                            type="button"
                            onClick={() => setMonitorv2Tab('config')}
                            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${monitorv2Tab === 'config' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Configuration
                        </button>
                        <button
                            type="button"
                            onClick={() => setMonitorv2Tab('backup-restore')}
                            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${monitorv2Tab === 'backup-restore' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Backup & Restore
                        </button>
                    </div>

                    {monitorv2Tab === 'backup-restore' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Schema Backup (DDL)</h3>
                                <p className="text-sm text-gray-600 mb-4">
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
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {schemaBackupLoading ? 'Downloading...' : 'Download schema (DDL)'}
                                </button>
                                <p className="text-xs text-gray-500 mt-3">
                                    Contains full DDL for schema <code className="bg-gray-100 px-1 rounded">zmonitoring</code>. Run against your PostgreSQL database; the database is created automatically on Setup or Restore if it does not exist.
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Database Backup</h3>
                                <p className="text-sm text-gray-600 mb-4">
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
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {backupLoading ? 'Creating backup...' : 'Download backup (ZIP)'}
                                </button>
                                <p className="text-xs text-gray-500 mt-3">
                                    Backup uses PHP/PDO only (no <code className="bg-gray-100 px-1 rounded">pg_dump</code> required). Data-only SQL; run the schema (DDL) first if the database is empty, or use Setup schema / Restore (database is created automatically if missing).
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Restore from backup</h3>
                                <p className="text-sm text-gray-600 mb-4">
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
                                    {restoreFile && <span className="text-sm text-gray-600">{restoreFile.name}</span>}
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
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">PostgreSQL Connection</h3>

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
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Data Retention</h3>

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
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Setup Actions</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Create Database - show if DB doesn't exist */}
                                    {testResult && testResult.details && !testResult.details.db_exists && (
                                        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h4 className="font-semibold text-blue-800 mb-1">0. Create Database</h4>
                                                    <p className="text-xs text-blue-600">Create the "{config.pgDatabase}" database</p>
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
                                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                                        <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50">
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
                                                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                                    <div className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h4 className="font-semibold text-gray-800 mb-1">1. Setup Database Schema</h4>
                                                <p className="text-xs text-gray-600">Initialize TimescaleDB tables and hypertables</p>
                                            </div>
                                            <span className="text-2xl">🗄️</span>
                                        </div>
                                        <button
                                            onClick={() => handleSetupAction('setup-schema')}
                                            disabled={setupActions['setup-schema'] || !config.enabled}
                                            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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

                                <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                    <p className="text-sm text-purple-800">
                                        <strong>Note:</strong> Ensure PostgreSQL with TimescaleDB is running on <code className="bg-purple-100 px-1 rounded">{config.pgHost}:{config.pgPort}</code> before running setup.
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                <button
                                    onClick={() => {
                                        setExpanded(false);
                                        loadConfiguration();
                                    }}
                                    className="px-5 py-2 text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
