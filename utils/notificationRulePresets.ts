export interface PresetColorTheme {
    emoji: string;
    /** Collapsible section header */
    headerBg: string;
    headerBorder: string;
    headerText: string;
    /** Preset card — idle */
    cardBorder: string;
    cardBg: string;
    cardHoverBorder: string;
    cardHoverBg: string;
    /** Preset card — selected */
    cardActiveBorder: string;
    cardActiveBg: string;
    cardActiveRing: string;
    titleText: string;
    descriptionText: string;
    activeSummaryText: string;
}

export interface NotificationSchedulePreset {
    id: string;
    name: string;
    description: string;
    time_window_start: string | null;
    time_window_end: string | null;
    /** Empty = all days. 0=Sunday … 6=Saturday (matches backend). */
    days: number[];
    suggestedRuleName?: string;
    theme: PresetColorTheme;
}

export const NOTIFICATION_SCHEDULE_PRESETS: NotificationSchedulePreset[] = [
    {
        id: 'always',
        name: '24/7 — Always',
        description: 'Notify any time, any day',
        time_window_start: null,
        time_window_end: null,
        days: [],
        suggestedRuleName: 'Always-On Alerts',
        theme: {
            emoji: '🌐',
            headerBg: 'bg-slate-100',
            headerBorder: 'border-slate-300',
            headerText: 'text-slate-800',
            cardBorder: 'border-slate-200',
            cardBg: 'bg-slate-50',
            cardHoverBorder: 'hover:border-slate-400',
            cardHoverBg: 'hover:bg-slate-100',
            cardActiveBorder: 'border-slate-500',
            cardActiveBg: 'bg-slate-200',
            cardActiveRing: 'ring-slate-400',
            titleText: 'text-slate-900',
            descriptionText: 'text-slate-600',
            activeSummaryText: 'text-slate-700',
        },
    },
    {
        id: 'business_hours',
        name: 'Business Hours',
        description: 'Mon–Fri, 9:00 AM – 5:00 PM',
        time_window_start: '09:00',
        time_window_end: '17:00',
        days: [1, 2, 3, 4, 5],
        suggestedRuleName: 'Business Hours Alerts',
        theme: {
            emoji: '💼',
            headerBg: 'bg-blue-100',
            headerBorder: 'border-blue-300',
            headerText: 'text-blue-900',
            cardBorder: 'border-blue-200',
            cardBg: 'bg-blue-50',
            cardHoverBorder: 'hover:border-blue-400',
            cardHoverBg: 'hover:bg-blue-100',
            cardActiveBorder: 'border-blue-500',
            cardActiveBg: 'bg-blue-200',
            cardActiveRing: 'ring-blue-400',
            titleText: 'text-blue-900',
            descriptionText: 'text-blue-700',
            activeSummaryText: 'text-blue-800',
        },
    },
    {
        id: 'extended_business',
        name: 'Extended Business Hours',
        description: 'Mon–Fri, 8:00 AM – 6:00 PM',
        time_window_start: '08:00',
        time_window_end: '18:00',
        days: [1, 2, 3, 4, 5],
        suggestedRuleName: 'Extended Hours Alerts',
        theme: {
            emoji: '🕗',
            headerBg: 'bg-cyan-100',
            headerBorder: 'border-cyan-300',
            headerText: 'text-cyan-900',
            cardBorder: 'border-cyan-200',
            cardBg: 'bg-cyan-50',
            cardHoverBorder: 'hover:border-cyan-400',
            cardHoverBg: 'hover:bg-cyan-100',
            cardActiveBorder: 'border-cyan-500',
            cardActiveBg: 'bg-cyan-200',
            cardActiveRing: 'ring-cyan-400',
            titleText: 'text-cyan-900',
            descriptionText: 'text-cyan-700',
            activeSummaryText: 'text-cyan-800',
        },
    },
    {
        id: 'off_business_hours',
        name: 'Off Business Hours',
        description: 'Mon–Fri, 5:00 PM – 9:00 AM (overnight)',
        time_window_start: '17:00',
        time_window_end: '09:00',
        days: [1, 2, 3, 4, 5],
        suggestedRuleName: 'After Hours Alerts',
        theme: {
            emoji: '🌙',
            headerBg: 'bg-indigo-100',
            headerBorder: 'border-indigo-300',
            headerText: 'text-indigo-900',
            cardBorder: 'border-indigo-200',
            cardBg: 'bg-indigo-50',
            cardHoverBorder: 'hover:border-indigo-400',
            cardHoverBg: 'hover:bg-indigo-100',
            cardActiveBorder: 'border-indigo-500',
            cardActiveBg: 'bg-indigo-200',
            cardActiveRing: 'ring-indigo-400',
            titleText: 'text-indigo-900',
            descriptionText: 'text-indigo-700',
            activeSummaryText: 'text-indigo-800',
        },
    },
    {
        id: 'evenings_weekdays',
        name: 'Evenings (Weekdays)',
        description: 'Mon–Fri, 6:00 PM – 11:59 PM',
        time_window_start: '18:00',
        time_window_end: '23:59',
        days: [1, 2, 3, 4, 5],
        suggestedRuleName: 'Evening Alerts',
        theme: {
            emoji: '🌆',
            headerBg: 'bg-amber-100',
            headerBorder: 'border-amber-300',
            headerText: 'text-amber-900',
            cardBorder: 'border-amber-200',
            cardBg: 'bg-amber-50',
            cardHoverBorder: 'hover:border-amber-400',
            cardHoverBg: 'hover:bg-amber-100',
            cardActiveBorder: 'border-amber-500',
            cardActiveBg: 'bg-amber-200',
            cardActiveRing: 'ring-amber-400',
            titleText: 'text-amber-900',
            descriptionText: 'text-amber-700',
            activeSummaryText: 'text-amber-800',
        },
    },
    {
        id: 'weekends',
        name: 'Weekends',
        description: 'Saturday & Sunday, all day',
        time_window_start: null,
        time_window_end: null,
        days: [0, 6],
        suggestedRuleName: 'Weekend Alerts',
        theme: {
            emoji: '🏖️',
            headerBg: 'bg-emerald-100',
            headerBorder: 'border-emerald-300',
            headerText: 'text-emerald-900',
            cardBorder: 'border-emerald-200',
            cardBg: 'bg-emerald-50',
            cardHoverBorder: 'hover:border-emerald-400',
            cardHoverBg: 'hover:bg-emerald-100',
            cardActiveBorder: 'border-emerald-500',
            cardActiveBg: 'bg-emerald-200',
            cardActiveRing: 'ring-emerald-400',
            titleText: 'text-emerald-900',
            descriptionText: 'text-emerald-700',
            activeSummaryText: 'text-emerald-800',
        },
    },
    {
        id: 'weekdays',
        name: 'Weekdays',
        description: 'Monday – Friday, all day',
        time_window_start: null,
        time_window_end: null,
        days: [1, 2, 3, 4, 5],
        suggestedRuleName: 'Weekday Alerts',
        theme: {
            emoji: '📅',
            headerBg: 'bg-teal-100',
            headerBorder: 'border-teal-300',
            headerText: 'text-teal-900',
            cardBorder: 'border-teal-200',
            cardBg: 'bg-teal-50',
            cardHoverBorder: 'hover:border-teal-400',
            cardHoverBg: 'hover:bg-teal-100',
            cardActiveBorder: 'border-teal-500',
            cardActiveBg: 'bg-teal-200',
            cardActiveRing: 'ring-teal-400',
            titleText: 'text-teal-900',
            descriptionText: 'text-teal-700',
            activeSummaryText: 'text-teal-800',
        },
    },
];

function daysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x - y);
    const sb = [...b].sort((x, y) => x - y);
    return sa.every((v, i) => v === sb[i]);
}

export function matchNotificationSchedulePreset(
    timeStart: string | null | undefined,
    timeEnd: string | null | undefined,
    selectedDays: number[]
): NotificationSchedulePreset | null {
    const start = timeStart?.trim() || null;
    const end = timeEnd?.trim() || null;
    for (const preset of NOTIFICATION_SCHEDULE_PRESETS) {
        if (preset.time_window_start !== start || preset.time_window_end !== end) continue;
        if (!daysEqual(preset.days, selectedDays)) continue;
        return preset;
    }
    return null;
}

export function formatPresetScheduleSummary(preset: NotificationSchedulePreset): string {
    const dayLabels =
        preset.days.length === 0
            ? 'Every day'
            : preset.days.length === 5 && preset.days.every((d) => d >= 1 && d <= 5)
              ? 'Mon–Fri'
              : preset.days.length === 2 && preset.days.includes(0) && preset.days.includes(6)
                ? 'Sat–Sun'
                : `Days: ${preset.days.join(', ')}`;
    if (preset.time_window_start && preset.time_window_end) {
        return `${dayLabels}, ${preset.time_window_start}–${preset.time_window_end}`;
    }
    return `${dayLabels}, all day`;
}
