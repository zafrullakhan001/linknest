export interface NotificationRule {
    id?: number;
    name: string;
    monitor_id: number;
    status_trigger: 'up' | 'down' | 'both';
    time_window_start?: string | null; // HH:MM format
    time_window_end?: string | null; // HH:MM format
    days_of_week?: string | null; // comma-separated: 0=Sunday, 1=Monday, etc.
    subject_template: string;
    body_template: string;
    from_name?: string | null;
    from_email?: string | null;
    is_enabled: number;
    created_at?: number;
    updated_at?: number;
    recipients?: string[];
    cc?: string[]; // CC recipients (optional)
}

// Resolve API base dynamically based on current location (matches other services)
function resolveApiBase(): string {
    const envBase = (import.meta as any)?.env?.VITE_API_BASE;
    if (envBase) return envBase;

    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '';
        if (path !== '/' && path.length > 1) {
            const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
            if (cleanPath && cleanPath !== '/') {
                return `${cleanPath}/api`;
            }
        }
    }
    return '/api';
}

const API_BASE = `${resolveApiBase()}/monitor-notifications`;

export async function getNotificationRules(monitorId: number): Promise<NotificationRule[]> {
    const response = await fetch(`${API_BASE}/monitor/${monitorId}`);
    if (!response.ok) {
        let errorMessage = `Failed to fetch notification rules: ${response.statusText}`;
        try {
            const errorData = await response.json();
            if (errorData.error) {
                errorMessage = errorData.error;
                // Include debug info if available
                if (errorData.received_path) {
                    errorMessage += ` (received path: ${errorData.received_path})`;
                }
            }
        } catch (e) {
            // If response isn't JSON, use status text
        }
        throw new Error(errorMessage);
    }
    const data = await response.json();
    return data.rules || [];
}

export async function getNotificationRule(ruleId: number): Promise<NotificationRule> {
    const response = await fetch(`${API_BASE}/rule/${ruleId}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch notification rule: ${response.statusText}`);
    }
    const data = await response.json();
    return data.rule;
}

export async function createNotificationRule(rule: Omit<NotificationRule, 'id' | 'created_at' | 'updated_at'>): Promise<NotificationRule> {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(rule),
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to create notification rule: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.rule;
}

export async function updateNotificationRule(ruleId: number, updates: Partial<NotificationRule>): Promise<NotificationRule> {
    const response = await fetch(`${API_BASE}/${ruleId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to update notification rule: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.rule;
}

export async function deleteNotificationRule(ruleId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/${ruleId}`, {
        method: 'DELETE',
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to delete notification rule: ${response.statusText}`);
    }
}

// Helper function to parse days of week
export function parseDaysOfWeek(daysStr: string | null | undefined): number[] {
    if (!daysStr) return [];
    return daysStr.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
}

// Helper function to format days of week
export function formatDaysOfWeek(days: number[]): string {
    return days.join(',');
}

// Helper function to get day name
export function getDayName(day: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || '';
}

export interface EmailLog {
    id: number;
    rule_id: number | null; // NULL for legacy notifications
    monitor_id: number;
    recipient_email: string;
    status_trigger: 'up' | 'down' | 'both';
    sent_at: number;
    subject: string;
    success: number; // 1 for success, 0 for failure
    error_message?: string | null;
}

export async function getEmailLogs(monitorId: number, days: number = 7): Promise<EmailLog[]> {
    const response = await fetch(`${API_BASE}/monitor/${monitorId}/logs?days=${days}`);
    if (!response.ok) {
        let errorMessage = `Failed to fetch email logs: ${response.statusText}`;
        try {
            const errorData = await response.json();
            if (errorData.error) {
                errorMessage = errorData.error;
            }
        } catch (e) {
            // If response isn't JSON, use status text
        }
        throw new Error(errorMessage);
    }
    const data = await response.json();
    return data.logs || [];
}

export async function clearEmailLogs(monitorId: number): Promise<number> {
    const response = await fetch(`${API_BASE}/monitor/${monitorId}/logs`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Failed to clear email logs: ${response.statusText}`);
    }
    const data = await response.json();
    return data.deleted || 0;
}