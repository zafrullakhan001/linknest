/**
 * Monitorv2 Service - Advanced Monitoring with PostgreSQL/TimescaleDB
 */

export interface Monitorv2 {
    id: number;
    name: string;
    type: 'url' | 'keyword' | 'port' | 'ping';
    target: string;
    port?: number;
    keyword?: string;
    interval: number;
    warning_threshold?: number;
    consecutive_failures?: number;
    timeout?: number | null;
    is_active: number;
    email_notification: number;
    email_rules_count?: number;
    last_notified_status?: 'up' | 'down' | 'unknown' | null;
    legacy_email_to?: string | null;
    legacy_email_cc?: string | null;
    legacy_email_from_name?: string | null;
    legacy_email_from_email?: string | null;
    legacy_email_subject_template?: string | null;
    legacy_email_body_template?: string | null;
    legacy_email_disabled?: number;
    last_checked_at: number | null;
    last_status: 'up' | 'down' | 'warning' | 'unknown' | null;
    last_response_time: number | null;
    uptime_percentage?: number;
    total_checks?: number;
    failed_checks?: number;
    tab_name?: string;
    group_name?: string;
    maintenance_start?: number | null;
    maintenance_end?: number | null;
    allowed_user_ids?: number[];
    history?: { status: 'up' | 'down' | 'warning'; response_time_ms: number; checked_at: string }[];
    created_at: number;
    updated_at: number;
}

export interface Monitorv2Log {
    id: number;
    monitor_id: number;
    status: 'up' | 'down' | 'warning';
    response_time: number;
    response_time_ms?: number;
    details: string;
    checked_at: number;
    http_code?: number;
    error_message?: string;
}

export interface MonitorCheck {
    id: number;
    monitor_id: number;
    status: 'up' | 'down' | 'warning';
    response_time_ms: number;
    status_message?: string;
    http_code?: number;
    error_message?: string;
    checked_at: string;
}

export interface Monitorv2Stats {
    '24h': {
        total: number;
        up_count: number;
        down_count: number;
        warning_count: number;
        uptime: number;
        avg_response: number;
        min_response: number;
        max_response: number;
    };
    '7d': {
        total: number;
        up_count: number;
        down_count: number;
        warning_count: number;
        uptime: number;
        avg_response: number;
        min_response: number;
        max_response: number;
    };
    '30d': {
        total: number;
        up_count: number;
        down_count: number;
        warning_count: number;
        uptime: number;
        avg_response: number;
        min_response: number;
        max_response: number;
    };
    '90d': {
        total: number;
        up_count: number;
        down_count: number;
        warning_count: number;
        uptime: number;
        avg_response: number;
        min_response: number;
        max_response: number;
    };
}

export interface Monitorv2NotificationRule {
    id: number;
    monitor_id: number;
    name: string;
    sort_order: number;
    status_trigger: 'up' | 'down' | 'both';
    time_window_start?: string;
    time_window_end?: string;
    days_of_week?: string;
    subject_template: string;
    body_template: string;
    from_name?: string;
    from_email?: string;
    cc_emails?: string;
    is_enabled: boolean;
    recipients?: string[];
    created_at?: string;
    updated_at?: string;
}

export interface Monitorv2Incident {
    id: number;
    monitor_id: number;
    started_at: string;
    ended_at?: string;
    duration_seconds?: number;
    initial_status: string;
    root_cause?: string;
    acknowledged: boolean;
    acknowledged_by?: number;
    acknowledged_at?: string;
    notes?: string;
}

export interface Monitorv2Config {
    enabled: boolean;
    pgHost: string;
    pgPort: number;
    pgDatabase: string;
    pgUser: string;
    pgPassword?: string;
    retentionDays: number;
    autoCleanup: boolean;
}

const API_BASE = 'api/monitorv2.php';

export const monitorv2Service = {
    // Monitors
    async getMonitors(): Promise<Monitorv2[]> {
        const response = await fetch(API_BASE, { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const msg = (data && typeof data.error === 'string') ? data.error : 'Failed to fetch monitors';
            throw new Error(msg);
        }
        return data.monitors || [];
    },

    async getMonitor(id: number): Promise<Monitorv2> {
        const response = await fetch(`${API_BASE}/${id}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch monitor');
        const data = await response.json();
        return data.monitor;
    },

    async createMonitor(monitor: Partial<Monitorv2>): Promise<Monitorv2> {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monitor),
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to create monitor');
        const data = await response.json();
        return data.monitor;
    },

    async updateMonitor(id: number, monitor: Partial<Monitorv2>): Promise<Monitorv2> {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monitor),
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to update monitor');
        const data = await response.json();
        return data.monitor;
    },

    async deleteMonitor(id: number): Promise<void> {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to delete monitor');
    },

    async deleteAllMonitors(): Promise<void> {
        const response = await fetch(`${API_BASE}/all`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to delete all monitors');
    },

    // Monitor Operations
    async checkMonitor(id: number, p0: { forceNotifyRules: boolean; }): Promise<{ status: string; response_time: number; details: string }> {
        const response = await fetch(`${API_BASE}/${id}/check`, {
            method: 'POST',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to check monitor');
        const data = await response.json();
        return data.result;
    },

    async checkAllMonitors(force = false): Promise<{
        count: number;
        total: number;
        up_count: number;
        down_count: number;
        error_count: number;
        results: Record<number, any>;
    }> {
        const response = await fetch(`${API_BASE}/check-all`, {
            method: 'POST',
            credentials: 'include',
            ...(force ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) } : {})
        });
        if (!response.ok) throw new Error('Failed to check all monitors');
        return await response.json();
    },

    async duplicateMonitor(id: number): Promise<Monitorv2> {
        const response = await fetch(`${API_BASE}/${id}/duplicate`, {
            method: 'POST',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to duplicate monitor');
        const data = await response.json();
        return data.monitor;
    },

    // Logs
    async getMonitorLogs(
        id: number,
        options?: { days?: number; limit?: number; from?: number; to?: number }
    ): Promise<Monitorv2Log[]> {
        const params = new URLSearchParams();
        if (options?.days) params.append('days', options.days.toString());
        if (options?.limit) params.append('limit', options.limit.toString());
        if (options?.from) params.append('from', options.from.toString());
        if (options?.to) params.append('to', options.to.toString());

        const url = `${API_BASE}/${id}/logs${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch monitor logs');
        const data = await response.json();
        return data.logs;
    },

    // Stats
    async getMonitorStats(id: number, period?: string): Promise<{
        stats: Monitorv2Stats;
        hourly: { hour: string; total: number; up_count: number; avg_response: number }[];
    }> {
        const params = period ? `?period=${period}` : '';
        const response = await fetch(`${API_BASE}/${id}/stats${params}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch monitor stats');
        return await response.json();
    },

    // Incidents
    async getMonitorIncidents(id: number, limit: number = 50): Promise<Monitorv2Incident[]> {
        const response = await fetch(`${API_BASE}/${id}/incidents?limit=${limit}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch incidents');
        const data = await response.json();
        return data.incidents;
    },

    // Import/Export
    async exportBundle(includeLogs: boolean = true): Promise<any> {
        const qs = includeLogs ? '' : '?include_logs=0';
        const response = await fetch(`${API_BASE}/export-bundle${qs}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to export bundle');
        return await response.json();
    },

    async importBundle(bundle: any, replace: boolean = true): Promise<number> {
        const response = await fetch(`${API_BASE}/import-bundle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bundle, replace }),
            credentials: 'include'
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to import bundle');
        }
        const data = await response.json();
        return data.count;
    },

    // Tab/Group Management
    async updateTabName(oldName: string, newName: string): Promise<void> {
        const response = await fetch(`${API_BASE}/update-tab`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_name: oldName, new_name: newName }),
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to update tab name');
    },

    async updateGroupName(tabName: string, oldName: string, newName: string): Promise<void> {
        const response = await fetch(`${API_BASE}/update-group`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab_name: tabName, old_name: oldName, new_name: newName }),
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to update group name');
    },

    // Health
    async healthCheck(): Promise<{ status: string; monitors: number; checks_24h: number }> {
        const response = await fetch(`${API_BASE}/health`, { credentials: 'include' });
        if (!response.ok) throw new Error('Health check failed');
        return await response.json();
    },

    // Configuration (through settings API)
    async getConfig(): Promise<Monitorv2Config> {
        const response = await fetch('api/addons/monitorv2', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch config');
        const data = await response.json();
        return data.config;
    },

    async saveConfig(config: Partial<Monitorv2Config>): Promise<void> {
        const response = await fetch('api/addons/monitorv2', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to save config');
    },

    async testConnection(config: Partial<Monitorv2Config>): Promise<{
        success: boolean;
        message: string;
        details?: {
            postgres_version: string;
            timescaledb_version: string;
            timescaledb_installed: boolean;
            tables_exist: string[];
            schema_ready: boolean;
        };
    }> {
        const response = await fetch(`${API_BASE}/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pgHost: config.pgHost,
                pgPort: config.pgPort,
                pgDatabase: config.pgDatabase,
                pgUser: config.pgUser,
                pgPassword: config.pgPassword
            }),
            credentials: 'include'
        });
        return await response.json();
    },

    async setupSchema(): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/setup-schema`, {
            method: 'POST',
            credentials: 'include'
        });
        return await response.json();
    },

    // Simple Import/Export (alias for bundle)
    async exportMonitors(): Promise<any> {
        return this.exportBundle();
    },

    async importMonitors(data: any, replace: boolean = true): Promise<number> {
        return this.importBundle(data, replace);
    },

    // Single monitor export (for UI parity with monitoring)
    async exportMonitor(id: number): Promise<any> {
        const monitor = await this.getMonitor(id);
        return { type: 'single_monitor', monitor };
    },

    // Run Check (manual)
    async runCheck(id: number): Promise<{ check: MonitorCheck }> {
        const result = await this.checkMonitor(id);
        return { check: { status: result.status, response_time_ms: result.response_time, status_message: result.details, checked_at: new Date().toISOString() } as MonitorCheck };
    },

    // Fixed export/import bundle methods
    async exportMonitorsBundle(includeLogs: boolean = true): Promise<any> {
        const qs = includeLogs ? '' : '?include_logs=0';
        const response = await fetch(`${API_BASE}/export-bundle${qs}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to export monitoring bundle');
        return await response.json();
    },

    async importMonitorsBundle(bundle: any, replace: boolean = false): Promise<number> {
        const response = await fetch(`${API_BASE}/import-bundle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bundle, replace }),
            credentials: 'include'
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to import monitoring bundle');
        }
        const data = await response.json();
        return data.count;
    },

    // Database management
    async createDatabase(config: Partial<Monitorv2Config>): Promise<{
        success: boolean;
        message: string;
        database_name?: string;
        already_exists?: boolean;
    }> {
        const response = await fetch(`${API_BASE}/create-database`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pgHost: config.pgHost,
                pgPort: config.pgPort,
                pgDatabase: config.pgDatabase,
                pgUser: config.pgUser,
                pgPassword: config.pgPassword
            }),
            credentials: 'include'
        });
        return await response.json();
    },

    async installExtensions(config: Partial<Monitorv2Config>, extensions: string[] = ['timescaledb', 'pg_cron']): Promise<{
        success: boolean;
        message: string;
        installed: string[];
        errors: string[];
    }> {
        const response = await fetch(`${API_BASE}/install-extensions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pgHost: config.pgHost,
                pgPort: config.pgPort,
                pgDatabase: config.pgDatabase,
                pgUser: config.pgUser,
                pgPassword: config.pgPassword,
                extensions
            }),
            credentials: 'include'
        });
        return await response.json();
    }
};
