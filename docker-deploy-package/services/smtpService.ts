export interface SMTPSettings {
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    encryption: 'none' | 'ssl' | 'tls';
    enabled: boolean;
    pause_start?: string;
    pause_end?: string;
}

export interface SMTPServer {
    id?: number;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    encryption: 'none' | 'ssl' | 'tls';
    is_active: boolean;
    is_enabled: boolean;
    pause_start?: string;
    pause_end?: string;
    created_at?: number;
    updated_at?: number;
}

export const smtpService = {
    // Legacy methods for backward compatibility
    async getSettings(): Promise<SMTPSettings> {
        const response = await fetch('api/smtp-settings.php');
        if (!response.ok) throw new Error('Failed to fetch SMTP settings');
        const data = await response.json();
        return data.settings;
    },

    async updateSettings(settings: Partial<SMTPSettings>): Promise<SMTPSettings> {
        const response = await fetch('api/smtp-settings.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (!response.ok) throw new Error('Failed to update SMTP settings');
        const data = await response.json();
        return data.settings;
    },

    async testConnection(settings: Partial<SMTPSettings> | { server_id: number }): Promise<{ success: boolean; message: string }> {
        const response = await fetch('api/smtp-settings.php/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (!response.ok) throw new Error('Failed to test SMTP connection');
        const data = await response.json();
        return data;
    },

    // New multi-server methods
    async getAllServers(): Promise<SMTPServer[]> {
        const response = await fetch('api/smtp-settings.php/servers');
        if (!response.ok) throw new Error('Failed to fetch SMTP servers');
        const data = await response.json();
        return data.servers;
    },

    async createServer(server: Omit<SMTPServer, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; server_id: number; message: string }> {
        const response = await fetch('api/smtp-settings.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(server)
        });
        if (!response.ok) throw new Error('Failed to create SMTP server');
        const data = await response.json();
        return data;
    },

    async updateServer(serverId: number, server: Partial<SMTPServer>): Promise<{ success: boolean; server: SMTPServer }> {
        const response = await fetch(`api/smtp-settings.php/${serverId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(server)
        });
        if (!response.ok) throw new Error('Failed to update SMTP server');
        const data = await response.json();
        return data;
    },

    async deleteServer(serverId: number): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`api/smtp-settings.php/${serverId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete SMTP server');
        const data = await response.json();
        return data;
    },

    async activateServer(serverId: number): Promise<{ success: boolean; message: string }> {
        const response = await fetch('api/smtp-settings.php/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server_id: serverId })
        });
        if (!response.ok) throw new Error('Failed to activate SMTP server');
        const data = await response.json();
        return data;
    }
};
