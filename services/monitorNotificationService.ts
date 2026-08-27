export interface NotificationRule {
    id?: number;
    name: string;
    monitor_id: number;
    sort_order?: number;
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
    // Bust any intermediary/browser caching (important after reordering)
    const response = await fetch(`${API_BASE}/monitor/${monitorId}?t=${Date.now()}`, { cache: 'no-store' });
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

export async function importNotificationRules(
    monitorId: number,
    payload: { replace?: boolean; rules: Array<Omit<NotificationRule, 'id' | 'monitor_id' | 'created_at' | 'updated_at'> & { recipients?: string[]; cc?: string[] }> }
): Promise<{ success: true; imported: number; replaced: boolean }> {
    const response = await fetch(`${API_BASE}/monitor/${monitorId}/import`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Failed to import notification rules: ${response.statusText}`);
    }

    const data = await response.json();
    return {
        success: true,
        imported: data.imported || 0,
        replaced: !!data.replaced,
    };
}

export async function moveNotificationRule(
    ruleId: number,
    direction: 'up' | 'down'
): Promise<{
    moved: boolean;
    current_rule?: { id: number; sort_order: number };
    target_rule?: { id: number; sort_order: number };
    order_after?: Array<{ id: number; sort_order: number }>;
    debug?: any;
}> {
    const url = `${API_BASE}/rule/${ruleId}/move`;
    console.log('[moveNotificationRule] Calling:', url, 'Direction:', direction);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ direction }),
    });

    console.log('[moveNotificationRule] Response status:', response.status, response.statusText);

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[moveNotificationRule] Error response:', error);
        throw new Error(error.error || `Failed to move notification rule: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[moveNotificationRule] Success response:', JSON.stringify(data, null, 2));
    return {
        moved: !!data.moved,
        current_rule: data.current_rule,
        target_rule: data.target_rule,
        order_after: data.order_after,
        debug: data.debug
    };
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

export interface MonitorNotificationTimezoneOption {
    value: string;
    label: string;
}

export interface MonitorNotificationTimezoneInfo {
    configured_timezone: string | null;
    effective_timezone: string;
    server_php_timezone: string;
    uses_custom_timezone: boolean;
    current_local_time: string;
    utc_offset: string;
    day_of_week: number;
    options: MonitorNotificationTimezoneOption[];
    dst_correction_enabled: boolean;
    dst_active: boolean;
    dst_aware: boolean;
    timezone_abbreviation: string;
    standard_utc_offset: string;
    next_dst_transition: {
        at: string;
        is_dst: boolean;
        label: string;
    } | null;
}

export async function getMonitorNotificationTimezone(): Promise<MonitorNotificationTimezoneInfo> {
    const response = await fetch(`${API_BASE}/timezone?t=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Failed to load notification timezone');
    }
    return data.timezone as MonitorNotificationTimezoneInfo;
}

export async function updateMonitorNotificationTimezone(
    timezone: string,
    dstCorrection?: boolean
): Promise<MonitorNotificationTimezoneInfo> {
    const response = await fetch(`${API_BASE}/timezone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            timezone,
            ...(dstCorrection !== undefined ? { dst_correction: dstCorrection } : {}),
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Failed to update notification timezone');
    }
    return data.timezone as MonitorNotificationTimezoneInfo;
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