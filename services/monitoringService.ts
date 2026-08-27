export type MonitorType = 'url' | 'keyword' | 'port' | 'ping' | 'ssl' | 'dns' | 'json';

export interface Monitor {
    id: number;
    name: string;
    type: MonitorType;
    target: string;
    port?: number;
    keyword?: string;
    interval: number;
    warning_threshold?: number;
    consecutive_failures?: number;
    timeout?: number | null;
    permissions_mode?: number;
    allowed_user_ids?: number[];
    is_active: number;
    email_notification: number;
    email_rules_count?: number; // advanced notification rules count (enabled)
    last_notified_status?: 'up' | 'down' | 'unknown' | null;
    legacy_email_to?: string | null;
    legacy_email_cc?: string | null;
    legacy_email_from_name?: string | null;
    legacy_email_from_email?: string | null;
    legacy_email_subject_template?: string | null;
    legacy_email_body_template?: string | null;
    legacy_email_disabled?: number;
    last_checked_at: number;
    last_status: 'up' | 'down' | 'warning' | 'unknown' | null;
    last_response_time: number;
    created_at: number;
    updated_at: number;
    tab_name?: string;
    group_name?: string;
    maintenance_start?: number | null;
    maintenance_end?: number | null;
    history?: { status: 'up' | 'down' | 'warning'; response_time: number; checked_at: number }[];
}

export interface MonitorLog {
    id: number;
    monitor_id: number;
    status: 'up' | 'down' | 'warning';
    response_time: number;
    details: string;
    checked_at: number;
}

export interface MonitorSuggestion {
    type: MonitorType;
    confidence: number;
    reason: string;
    recommended?: boolean;
    suggested_name?: string;
    suggested_group?: string;
    config: Partial<Monitor>;
}

export interface MonitorSuggestResult {
    input: string;
    parsed: {
        host?: string | null;
        scheme?: string | null;
        port?: number | null;
        pattern?: string | null;
    };
    probe_summary: {
        http_code?: number | null;
        content_type?: string | null;
        open_ports?: number[];
        ping?: string | null;
        ssl_days_remaining?: number | null;
        dns_a?: string[];
        dns_aaaa?: string[];
    };
    suggestions: MonitorSuggestion[];
}

export interface MonitorBulkDraft {
    input: string;
    selected: boolean;
    error: string | null;
    confidence: number | null;
    reason: string | null;
    monitor: Partial<Monitor> | null;
    alternatives: MonitorSuggestion[];
    probe_summary?: MonitorSuggestResult['probe_summary'];
}

export interface MonitorBulkSuggestResult {
    success: boolean;
    drafts: MonitorBulkDraft[];
    summary: {
        total: number;
        ready: number;
        failed: number;
        fast_mode: boolean;
        default_tab: string;
    };
}

export interface MonitorBulkCreateResult {
    success: boolean;
    count: number;
    created: Monitor[];
    errors: Array<{ index: number; name?: string | null; target?: string | null; error: string }>;
}

export const monitoringService = {
    async getMonitors(): Promise<Monitor[]> {
        const response = await fetch('api/monitors.php');
        if (!response.ok) throw new Error('Failed to fetch monitors');
        const data = await response.json();
        return data.monitors;
    },

    async getMonitor(id: number): Promise<Monitor> {
        const response = await fetch(`api/monitors.php/${id}`);
        if (!response.ok) throw new Error('Failed to fetch monitor');
        const data = await response.json();
        return data.monitor;
    },

    async createMonitor(monitor: Partial<Monitor>): Promise<Monitor> {
        const response = await fetch('api/monitors.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monitor)
        });
        if (!response.ok) throw new Error('Failed to create monitor');
        const data = await response.json();
        return data.monitor;
    },

    async updateMonitor(id: number, monitor: Partial<Monitor>): Promise<Monitor> {
        const response = await fetch(`api/monitors.php/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monitor)
        });
        if (!response.ok) throw new Error('Failed to update monitor');
        const data = await response.json();
        return data.monitor;
    },

    async deleteMonitor(id: number): Promise<void> {
        const response = await fetch(`api/monitors.php/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete monitor');
    },

    async duplicateMonitor(id: number): Promise<Monitor> {
        const response = await fetch(`api/monitors.php/${id}/duplicate`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to duplicate monitor');
        const data = await response.json();
        return data.monitor;
    },

    async exportMonitor(id: number): Promise<any> {
        const response = await fetch(`api/monitors.php/${id}/export`);
        if (!response.ok) throw new Error('Failed to export monitor');
        return await response.json();
    },

    async getMonitorLogs(id: number, options?: { days?: number, limit?: number, from?: number, to?: number }): Promise<MonitorLog[]> {
        let url = `api/monitors.php/${id}/logs`;
        if (options) {
            const params = new URLSearchParams();
            if (options.days) params.append('days', options.days.toString());
            if (options.limit) params.append('limit', options.limit.toString());
            if (options.from) params.append('from', options.from.toString());
            if (options.to) params.append('to', options.to.toString());
            if (params.toString()) url += `?${params.toString()}`;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch monitor logs');
        const data = await response.json();
        return data.logs;
    },

    async checkMonitor(id: number, options?: { forceNotifyRules?: boolean }): Promise<any> {
        const qs = options?.forceNotifyRules ? '?force_notify_rules=1' : '';
        const response = await fetch(`api/monitors.php/${id}/check${qs}`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to check monitor');
        const data = await response.json();
        return data.result;
    },

    async checkAllMonitors(): Promise<{ count: number; total: number; up_count: number; down_count: number; error_count: number }> {
        try {
            const response = await fetch('api/monitors.php/check-all', {
                method: 'POST'
            });

            if (!response.ok) {
                let errorMessage = 'Failed to check all monitors';
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    } else if (errorData.message) {
                        errorMessage = errorData.message;
                    }
                } catch (e) {
                    // If response isn't JSON, use status text
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();

            // Check if the response indicates failure
            if (data.success === false) {
                throw new Error(data.error || 'Failed to check all monitors');
            }

            return {
                count: data.count || 0,
                total: data.total || 0,
                up_count: data.up_count || 0,
                down_count: data.down_count || 0,
                error_count: data.error_count || 0
            };
        } catch (error: any) {
            console.error('Error in checkAllMonitors:', error);
            throw error;
        }
    },

    async deleteAllMonitors(): Promise<void> {
        const response = await fetch('api/monitors.php/all', {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete all monitors');
    },

    async exportMonitorsBundle(): Promise<any> {
        const response = await fetch('api/monitors.php/export-bundle');
        if (!response.ok) throw new Error('Failed to export monitors bundle');
        return await response.json();
    },

    async importMonitorsBundle(bundle: any, replace: boolean = true): Promise<number> {
        const response = await fetch('api/monitors.php/import-bundle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bundle, replace })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to import monitors bundle');
        }
        const data = await response.json();
        return data.count || 0;
    },

    async updateTabName(oldName: string, newName: string): Promise<void> {
        const response = await fetch('api/monitors.php/update-tab', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_name: oldName, new_name: newName })
        });
        if (!response.ok) throw new Error('Failed to update tab name');
    },

    async updateGroupName(tabName: string, oldName: string, newName: string): Promise<void> {
        const response = await fetch('api/monitors.php/update-group', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab_name: tabName, old_name: oldName, new_name: newName })
        });
        if (!response.ok) throw new Error('Failed to update group name');
    },

    async suggestMonitor(target: string): Promise<MonitorSuggestResult> {
        const response = await fetch('api/monitors.php/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: target.trim() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze target');
        }
        return data as MonitorSuggestResult;
    },

    async suggestMonitorsBulk(options: {
        text?: string;
        targets?: string[];
        tab_name?: string;
        fast?: boolean;
    }): Promise<MonitorBulkSuggestResult> {
        const response = await fetch('api/monitors.php/suggest-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze targets');
        }
        return data as MonitorBulkSuggestResult;
    },

    async bulkCreateMonitors(monitors: Partial<Monitor>[]): Promise<MonitorBulkCreateResult> {
        const response = await fetch('api/monitors.php/bulk-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitors }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create monitors');
        }
        return data as MonitorBulkCreateResult;
    },
};
