export interface SMTPSettings {
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    encryption: 'none' | 'ssl' | 'tls';
    enabled: boolean;
}

export const smtpService = {
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

    async testConnection(settings: Partial<SMTPSettings>): Promise<{ success: boolean; message: string }> {
        const response = await fetch('api/smtp-settings.php/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (!response.ok) throw new Error('Failed to test SMTP connection');
        const data = await response.json();
        return data;
    }
};
