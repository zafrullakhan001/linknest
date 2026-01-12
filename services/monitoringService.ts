export interface Monitor {
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
    last_checked_at: number;
    last_status: 'up' | 'down' | 'warning' | 'unknown' | null;
    last_response_time: number;
    created_at: number;
    updated_at: number;
    tab_name?: string;
    group_name?: string;
    maintenance_start?: number | null;
    maintenance_end?: number | null;
}

export interface MonitorLog {
    id: number;
    monitor_id: number;
    status: 'up' | 'down' | 'warning';
    response_time: number;
    details: string;
    checked_at: number;
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

    async checkMonitor(id: number): Promise<any> {
        const response = await fetch(`api/monitors.php/${id}/check`, {
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

    async importMonitors(monitors: Partial<Monitor>[]): Promise<number> {
        const response = await fetch('api/monitors.php/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitors })
        });
        if (!response.ok) throw new Error('Failed to import monitors');
        const data = await response.json();
        return data.count;
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

    async importMonitorsFromCSV(csvData: string): Promise<number> {
        const response = await fetch('api/monitors.php/import-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv: csvData })
        });
        if (!response.ok) throw new Error('Failed to import monitors from CSV');
        const data = await response.json();
        return data.count;
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
    }
};
