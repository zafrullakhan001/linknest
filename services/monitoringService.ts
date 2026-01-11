export interface Monitor {
    id: number;
    name: string;
    type: 'url' | 'keyword' | 'port';
    target: string;
    port?: number;
    keyword?: string;
    interval: number;
    is_active: number;
    email_notification: number;
    last_checked_at: number;
    last_status: 'up' | 'down' | 'unknown' | null;
    last_response_time: number;
    created_at: number;
    updated_at: number;
}

export interface MonitorLog {
    id: number;
    monitor_id: number;
    status: 'up' | 'down';
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

    async getMonitorLogs(id: number): Promise<MonitorLog[]> {
        const response = await fetch(`api/monitors.php/${id}/logs`);
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

    async checkAllMonitors(): Promise<void> {
        const response = await fetch('api/monitors.php/check-all', {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to check all monitors');
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
    }
};
