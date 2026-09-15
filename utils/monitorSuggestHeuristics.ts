export type MonitorTypeHint = 'url' | 'headers' | 'keyword' | 'port' | 'ping' | 'ssl' | 'dns' | 'json' | 'unknown';

export interface MonitorInputHint {
    pattern: 'url' | 'host_port' | 'host' | 'scheme_service' | 'unknown';
    hint: string;
    likelyType?: MonitorTypeHint;
}

const SERVICE_SCHEMES = ['ssh', 'mysql', 'mariadb', 'postgresql', 'postgres', 'redis', 'mongodb', 'mongo', 'smtp', 'imap'];

export function parseMonitorInputHint(input: string): MonitorInputHint {
    const trimmed = input.trim();
    if (!trimmed) {
        return { pattern: 'unknown', hint: 'Enter a URL, hostname, IP, or host:port to analyze.' };
    }

    const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        if (SERVICE_SCHEMES.includes(scheme)) {
            return {
                pattern: 'scheme_service',
                hint: `Looks like a ${scheme.toUpperCase()} service URL — click Analyze for port monitor suggestions.`,
                likelyType: 'port',
            };
        }
    }

    if (/^https?:\/\//i.test(trimmed)) {
        const isHttps = /^https:\/\//i.test(trimmed);
        const isHealthPath = /\/(health|status|ready|alive|ping|api)/i.test(trimmed);
        return {
            pattern: 'url',
            hint: isHealthPath
                ? 'Looks like an API/health URL — click Analyze to detect JSON or URL monitoring.'
                : isHttps
                    ? 'Looks like an HTTPS URL — click Analyze for URL, HTTP Headers, SSL, or keyword suggestions.'
                    : 'Looks like an HTTP URL — click Analyze for URL or HTTP Headers monitoring.',
            likelyType: isHealthPath ? 'json' : 'url',
        };
    }

    const hostPortMatch = trimmed.match(/^(.+):(\d{1,5})$/);
    if (hostPortMatch) {
        const port = parseInt(hostPortMatch[2], 10);
        if (port >= 1 && port <= 65535) {
            return {
                pattern: 'host_port',
                hint: `Looks like host:port (${port}) — click Analyze to verify and suggest a port monitor.`,
                likelyType: 'port',
            };
        }
    }

    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed) || /^[a-f0-9:]+$/i.test(trimmed)) {
        return {
            pattern: 'host',
            hint: 'Looks like an IP address — click Analyze for ping and port suggestions.',
            likelyType: 'ping',
        };
    }

    if (/^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?$/.test(trimmed)) {
        return {
            pattern: 'host',
            hint: 'Looks like a hostname — click Analyze for DNS, ping, and port suggestions.',
            likelyType: 'dns',
        };
    }

    return {
        pattern: 'unknown',
        hint: 'Enter a valid URL, hostname, IP, or host:port, then click Analyze.',
    };
}

export const MONITOR_TYPE_LABELS: Record<MonitorTypeHint, string> = {
    url: 'URL Check',
    headers: 'HTTP Headers',
    keyword: 'Keyword Check',
    port: 'Port Check',
    ping: 'Ping Check',
    ssl: 'SSL Certificate',
    dns: 'DNS Resolution',
    json: 'JSON / API Health',
    unknown: 'Unknown',
};
