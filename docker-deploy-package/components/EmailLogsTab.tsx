import React, { useState, useEffect } from 'react';
import { getEmailLogs, clearEmailLogs, EmailLog } from '../services/monitorNotificationService';

interface EmailLogsTabProps {
    monitorId: number;
}

export const EmailLogsTab: React.FC<EmailLogsTabProps> = ({ monitorId }) => {
    const [logs, setLogs] = useState<EmailLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
    const [daysFilter, setDaysFilter] = useState<number>(7);

    useEffect(() => {
        loadLogs();
    }, [monitorId, daysFilter]);

    const loadLogs = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getEmailLogs(monitorId, daysFilter);
            setLogs(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load email logs');
        } finally {
            setLoading(false);
        }
    };

    const handleClearLogs = async () => {
        if (!confirm('Clear all email logs for this monitor? This cannot be undone.')) return;
        try {
            setLoading(true);
            setError(null);
            await clearEmailLogs(monitorId);
            await loadLogs();
        } catch (err: any) {
            setError(err.message || 'Failed to clear email logs');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    };

    const downloadFile = (filename: string, content: BlobPart, mime: string) => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const toCsv = (rows: string[][]) => {
        const esc = (v: string) => {
            const s = (v ?? '').toString();
            if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        return rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';
    };

    const handleExportCsv = () => {
        const rows: string[][] = [];
        rows.push(['id', 'rule_id', 'monitor_id', 'recipient_email', 'status_trigger', 'sent_at', 'subject', 'success', 'error_message']);
        for (const log of filteredLogs) {
            rows.push([
                String(log.id),
                log.rule_id === null || log.rule_id === undefined ? '' : String(log.rule_id),
                String(log.monitor_id),
                String(log.recipient_email || ''),
                String(log.status_trigger || ''),
                new Date((log.sent_at || 0) * 1000).toISOString(),
                String(log.subject || ''),
                String(log.success ?? ''),
                String(log.error_message || ''),
            ]);
        }
        const csv = toCsv(rows);
        downloadFile(`email-logs-monitor-${monitorId}-last-${daysFilter}d.csv`, csv, 'text/csv;charset=utf-8');
    };

    const filteredLogs = logs.filter(log => {
        if (filter === 'success') return log.success === 1;
        if (filter === 'failed') return log.success === 0;
        return true;
    });

    const successCount = logs.filter(log => log.success === 1).length;
    const failedCount = logs.filter(log => log.success === 0).length;

    if (loading) {
        return <div className="text-center py-8 text-gray-500">Loading email logs...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Email Sent Logs
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                        View email notification history and delivery status for this monitor.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCsv}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors border border-blue-200"
                        title="Export logs to CSV"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={handleClearLogs}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors border border-red-200"
                        title="Clear email logs"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                    <button
                        onClick={loadLogs}
                        className="p-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 border border-gray-300"
                        title="Refresh logs"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="text-xs text-gray-600">Total Sent</div>
                    <div className="text-lg font-semibold text-gray-900">{logs.length}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="text-xs text-green-600">Successful</div>
                    <div className="text-lg font-semibold text-green-700">{successCount}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                    <div className="text-xs text-red-600">Failed</div>
                    <div className="text-lg font-semibold text-red-700">{failedCount}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Filter:</label>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as 'all' | 'success' | 'failed')}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    >
                        <option value="all">All ({logs.length})</option>
                        <option value="success">Successful ({successCount})</option>
                        <option value="failed">Failed ({failedCount})</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Time Range:</label>
                    <select
                        value={daysFilter}
                        onChange={(e) => setDaysFilter(parseInt(e.target.value))}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    >
                        <option value="1">Last 24 hours</option>
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="mb-2">No email logs found.</p>
                    <p className="text-xs">
                        {filter === 'all' 
                            ? 'Email notifications will appear here once they are sent.'
                            : filter === 'success'
                            ? 'No successful email notifications found.'
                            : 'No failed email notifications found.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredLogs.map((log) => (
                        <div
                            key={log.id}
                            className={`border rounded-lg p-4 ${
                                log.success === 1
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-red-50 border-red-200'
                            }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-medium ${
                                                log.success === 1
                                                    ? 'bg-green-200 text-green-800'
                                                    : 'bg-red-200 text-red-800'
                                            }`}
                                        >
                                            {log.success === 1 ? '✓ Sent Successfully' : '✗ Failed'}
                                        </span>
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-medium ${
                                                log.status_trigger === 'up'
                                                    ? 'bg-blue-100 text-blue-800'
                                                    : log.status_trigger === 'down'
                                                    ? 'bg-orange-100 text-orange-800'
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}
                                        >
                                            {log.status_trigger.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="space-y-1 text-sm">
                                        <div>
                                            <strong>To:</strong> {log.recipient_email}
                                        </div>
                                        <div>
                                            <strong>Subject:</strong> {log.subject}
                                        </div>
                                        <div>
                                            <strong>Sent At:</strong> {formatDate(log.sent_at)}
                                        </div>
                                        {log.error_message && (
                                            <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-800">
                                                <strong>Error:</strong> {log.error_message}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
