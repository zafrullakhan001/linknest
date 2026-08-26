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

/** Built-in SMTP provider presets (fills host/port/encryption; credentials stay user-entered). */
export type SmtpProviderId = 'custom' | 'office365' | 'gmail' | 'mailpit';

export interface SmtpProviderPreset {
    id: SmtpProviderId;
    label: string;
    host: string;
    port: number;
    encryption: 'none' | 'ssl' | 'tls';
    nameHint: string;
    usernamePlaceholder: string;
    passwordHint: string;
    help: string;
}

export const SMTP_PROVIDER_PRESETS: SmtpProviderPreset[] = [
    {
        id: 'custom',
        label: 'Custom SMTP',
        host: '',
        port: 587,
        encryption: 'tls',
        nameHint: 'Primary SMTP',
        usernamePlaceholder: 'smtp-user',
        passwordHint: 'SMTP password',
        help: 'Enter your mail server host, port, and credentials manually.',
    },
    {
        id: 'office365',
        label: 'Office 365 / Microsoft 365',
        host: 'smtp.office365.com',
        port: 587,
        encryption: 'tls',
        nameHint: 'Office 365',
        usernamePlaceholder: 'user@yourdomain.com',
        passwordHint: 'Mailbox password or app password',
        help: 'Uses smtp.office365.com on port 587 with STARTTLS. Username must be the full mailbox email. SMTP AUTH must be enabled for that mailbox in the Microsoft 365 admin center. If MFA is on, use an app password (or a mailbox with SMTP AUTH allowed). From address should match the authenticated mailbox (or an allowed send-as address).',
    },
    {
        id: 'gmail',
        label: 'Gmail / Google Workspace',
        host: 'smtp.gmail.com',
        port: 587,
        encryption: 'tls',
        nameHint: 'Gmail',
        usernamePlaceholder: 'you@gmail.com',
        passwordHint: 'App password (not account password)',
        help: 'Uses smtp.gmail.com on port 587 with STARTTLS. Google accounts with 2FA need an App Password.',
    },
    {
        id: 'mailpit',
        label: 'Mailpit (local / Docker)',
        host: 'localhost',
        port: 1025,
        encryption: 'none',
        nameHint: 'Mailpit',
        usernamePlaceholder: '(optional)',
        passwordHint: '(usually blank)',
        help: 'Local Mailpit catch-all (Docker: host mailpit, port 1025). No auth by default.',
    },
];

export function detectSmtpProvider(host: string, port?: number, encryption?: string): SmtpProviderId {
    const h = (host || '').trim().toLowerCase();
    const p = port ?? 0;
    const enc = (encryption || '').toLowerCase();
    if (h === 'smtp.office365.com' || h === 'smtp-mail.outlook.com') {
        return 'office365';
    }
    if (h === 'smtp.gmail.com') {
        return 'gmail';
    }
    if ((h === 'localhost' || h === '127.0.0.1' || h === 'mailpit') && (p === 1025 || enc === 'none')) {
        return 'mailpit';
    }
    return 'custom';
}

export function getSmtpProviderPreset(id: SmtpProviderId): SmtpProviderPreset {
    return SMTP_PROVIDER_PRESETS.find((p) => p.id === id) || SMTP_PROVIDER_PRESETS[0];
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

    async testConnection(
        settings: (Partial<SMTPSettings> | Partial<SMTPServer> | { server_id: number }) & { to?: string }
    ): Promise<{ success: boolean; message: string }> {
        const response = await fetch('api/smtp-settings.php/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
            credentials: 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok && data?.message == null && data?.error == null) {
            throw new Error('Failed to test SMTP connection');
        }
        return {
            success: !!data.success,
            message: data.message || data.error || (data.success ? 'Sent' : 'Failed'),
        };
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
