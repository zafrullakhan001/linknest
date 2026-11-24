import { Monitor } from '../services/monitoringService';
import { parseBulkMonitorLines } from './monitorBulkImport';
import { formatMonitorInterval, sslDaysToMinutes } from './monitorSuggestTiming';

/** Dedicated dashboard tab for SSL certificate expiry monitors. */
export const SSL_CERTS_TAB = 'SSL Certificates';

export function isSslCertsTab(name: string | undefined | null): boolean {
    return (name || '').trim().toLowerCase() === SSL_CERTS_TAB.toLowerCase();
}

export function isSslMonitor(monitor: { type?: string } | null | undefined): boolean {
    return monitor?.type === 'ssl';
}

export interface SslDaysRemaining {
    days: number;
    expired: boolean;
}

export function parseSslDaysRemaining(details: string | null | undefined): SslDaysRemaining | null {
    if (!details) return null;
    const expired = details.match(/expired\s+(\d+)\s+days?\s+ago/i);
    if (expired) {
        return { days: parseInt(expired[1], 10), expired: true };
    }
    const remaining = details.match(/(\d+)\s+days?\s+remaining/i);
    if (remaining) {
        return { days: parseInt(remaining[1], 10), expired: false };
    }
    const expiresIn = details.match(/expires in\s+(\d+)\s+days?/i);
    if (expiresIn) {
        return { days: parseInt(expiresIn[1], 10), expired: false };
    }
    return null;
}

export function formatSslExpiryLabel(details: string | null | undefined): string {
    const parsed = parseSslDaysRemaining(details);
    if (!parsed) return '—';
    if (parsed.expired) {
        return parsed.days === 0 ? 'expired' : `expired ${parsed.days}d`;
    }
    return `${parsed.days}d left`;
}

export function sslExpiryTitle(details: string | null | undefined): string {
    const parsed = parseSslDaysRemaining(details);
    if (!parsed) return 'Certificate expiry not checked yet';
    if (parsed.expired) {
        return parsed.days === 0
            ? 'Certificate expired'
            : `Certificate expired ${parsed.days} day${parsed.days === 1 ? '' : 's'} ago`;
    }
    return `Certificate expires in ${parsed.days} day${parsed.days === 1 ? '' : 's'}`;
}

export function formatMonitorCornerMetric(monitor: {
    type?: string;
    interval?: number;
    last_details?: string | null;
}): { label: string; title: string } {
    if (isSslMonitor(monitor)) {
        return {
            label: formatSslExpiryLabel(monitor.last_details),
            title: sslExpiryTitle(monitor.last_details),
        };
    }
    const label = formatMonitorInterval(monitor.type, monitor.interval);
    return { label, title: `Check interval: ${label}` };
}

export interface SslBulkDraft {
    input: string;
    selected: boolean;
    error: string | null;
    monitor: Partial<Monitor> | null;
}

export function parseSslBulkHost(raw: string): { target: string; name: string; error: string | null } {
    const input = raw.trim().replace(/^['"]+|['"]+$/g, '');
    if (!input) {
        return { target: '', name: '', error: 'Empty line' };
    }

    let host = input;
    let port: number | null = null;

    try {
        if (/^https?:\/\//i.test(input)) {
            const url = new URL(input);
            host = url.hostname;
            port = url.port ? parseInt(url.port, 10) : null;
        } else {
            host = input.replace(/^https?:\/\//i, '').split('/')[0];
            const colon = host.lastIndexOf(':');
            if (colon > 0 && host.indexOf(']') === -1) {
                const maybePort = host.slice(colon + 1);
                if (/^\d{1,5}$/.test(maybePort)) {
                    const p = parseInt(maybePort, 10);
                    if (p >= 1 && p <= 65535) {
                        host = host.slice(0, colon);
                        port = p;
                    }
                }
            }
        }
    } catch {
        return { target: input, name: '', error: 'Not a valid hostname or URL' };
    }

    host = host.replace(/^\*\./, '').replace(/^\[/, '').replace(/\]$/, '').trim();
    if (!host) {
        return { target: input, name: '', error: 'Missing hostname' };
    }

    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    const isName = /^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?$/.test(host);
    if (!isIp && !isName) {
        return { target: input, name: '', error: 'Not a valid hostname or URL' };
    }

    const target = port && port !== 443 ? `${host}:${port}` : host;
    return { target, name: host, error: null };
}

export function buildSslBulkDrafts(
    text: string,
    options: { warnDays: number; intervalDays: number; groupName: string }
): SslBulkDraft[] {
    const warnDays = Math.max(1, Math.min(365, Math.round(options.warnDays) || 30));
    const interval = sslDaysToMinutes(options.intervalDays);
    const group = options.groupName.trim() || 'Other';
    const lines = parseBulkMonitorLines(text);

    return lines.map((input) => {
        const parsed = parseSslBulkHost(input);
        if (parsed.error) {
            return {
                input,
                selected: false,
                error: parsed.error,
                monitor: null,
            };
        }
        return {
            input,
            selected: true,
            error: null,
            monitor: {
                name: parsed.name,
                type: 'ssl',
                target: parsed.target,
                keyword: String(warnDays),
                interval,
                warning_threshold: 1,
                tab_name: SSL_CERTS_TAB,
                group_name: group,
                is_active: 1,
                email_notification: 0,
            },
        };
    });
}
