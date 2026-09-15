export type UptimeCalendarLog = {
    status: string;
    checked_at: number;
    details?: string | null;
};

export type UptimeDayLevel = 'operational' | 'partial' | 'major' | 'none' | 'future';

export type UptimeDaySummary = {
    key: string;
    year: number;
    month: number;
    day: number;
    level: UptimeDayLevel;
    checks: number;
    up: number;
    down: number;
    warning: number;
    outageSeconds: number;
    events: string[];
};

export function toLocalDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function dayKeyFromUnix(ts: number): string {
    return toLocalDayKey(new Date(ts * 1000));
}

export function formatDayKey(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return key;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export function startOfMonth(year: number, monthIndex: number): Date {
    return new Date(year, monthIndex, 1);
}

export function addMonths(date: Date, delta: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function formatOutageDuration(seconds: number): string {
    if (seconds <= 0) return '0 mins';
    let h = Math.floor(seconds / 3600);
    let m = Math.round((seconds % 3600) / 60);
    if (m === 60) {
        h += 1;
        m = 0;
    }
    if (h > 0 && m > 0) return `${h} hrs ${m} mins`;
    if (h > 0) return `${h} hrs`;
    return `${Math.max(1, m)} mins`;
}

function outageSecondsForDay(dayLogs: UptimeCalendarLog[], intervalSeconds: number): number {
    const sorted = [...dayLogs].sort((a, b) => a.checked_at - b.checked_at);
    let total = 0;
    let stretchStart: number | null = null;
    let stretchEnd: number | null = null;

    const closeStretch = () => {
        if (stretchStart == null) return;
        const end = stretchEnd ?? stretchStart;
        total += Math.max(intervalSeconds, end - stretchStart + intervalSeconds);
        stretchStart = null;
        stretchEnd = null;
    };

    for (const log of sorted) {
        const down = log.status !== 'up';
        if (down) {
            if (stretchStart == null) stretchStart = log.checked_at;
            stretchEnd = log.checked_at;
        } else {
            closeStretch();
        }
    }
    closeStretch();
    return total;
}

export function summarizeLogsByDay(
    logs: UptimeCalendarLog[],
    intervalMinutes = 5
): Map<string, UptimeDaySummary> {
    const intervalSeconds = Math.max(60, Math.round(intervalMinutes * 60));
    const grouped = new Map<string, UptimeCalendarLog[]>();

    for (const log of logs) {
        if (!log?.checked_at) continue;
        const key = dayKeyFromUnix(log.checked_at);
        const bucket = grouped.get(key);
        if (bucket) bucket.push(log);
        else grouped.set(key, [log]);
    }

    const now = new Date();
    const todayKey = toLocalDayKey(now);
    const summaries = new Map<string, UptimeDaySummary>();

    grouped.forEach((dayLogs, key) => {
        const [y, m, d] = key.split('-').map(Number);
        const up = dayLogs.filter((l) => l.status === 'up').length;
        const down = dayLogs.filter((l) => l.status === 'down').length;
        const warning = dayLogs.filter((l) => l.status === 'warning').length;
        const outage = outageSecondsForDay(dayLogs, intervalSeconds);
        const events = Array.from(
            new Set(
                dayLogs
                    .filter((l) => l.status !== 'up' && (l.details || '').trim())
                    .map((l) => String(l.details).trim())
            )
        ).slice(0, 4);

        let level: UptimeDayLevel = 'none';
        if (key > todayKey) {
            level = 'future';
        } else if (down > 0 && up > 0) {
            level = 'partial';
        } else if (warning > 0 && down === 0) {
            level = 'partial';
        } else if (down > 0 && up === 0) {
            level = 'major';
        } else if (up > 0) {
            level = 'operational';
        }

        summaries.set(key, {
            key,
            year: y,
            month: m,
            day: d,
            level,
            checks: dayLogs.length,
            up,
            down,
            warning,
            outageSeconds: outage,
            events,
        });
    });

    return summaries;
}

export function monthUptimePercent(
    year: number,
    monthIndex: number,
    summaries: Map<string, UptimeDaySummary>
): number | null {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    let checks = 0;
    let up = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const summary = summaries.get(key);
        if (!summary || summary.checks === 0) continue;
        checks += summary.checks;
        up += summary.up;
    }
    if (checks === 0) return null;
    return (up / checks) * 100;
}

export type MonthCell = {
    key: string;
    day: number | null;
    inMonth: boolean;
    summary: UptimeDaySummary | null;
    level: UptimeDayLevel;
};

export function buildMonthCells(
    year: number,
    monthIndex: number,
    summaries: Map<string, UptimeDaySummary>
): MonthCell[] {
    const first = startOfMonth(year, monthIndex);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const leading = first.getDay();
    const todayKey = toLocalDayKey(new Date());
    const cells: MonthCell[] = [];

    for (let i = 0; i < leading; i++) {
        cells.push({ key: `pad-${year}-${monthIndex}-l${i}`, day: null, inMonth: false, summary: null, level: 'none' });
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const summary = summaries.get(key) || null;
        let level: UptimeDayLevel = summary?.level || 'none';
        if (key > todayKey) level = 'future';
        cells.push({ key, day, inMonth: true, summary, level });
    }

    while (cells.length % 7 !== 0) {
        cells.push({
            key: `pad-${year}-${monthIndex}-t${cells.length}`,
            day: null,
            inMonth: false,
            summary: null,
            level: 'none',
        });
    }

    return cells;
}
