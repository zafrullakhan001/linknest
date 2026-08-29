export interface TileStyle {
    upBackgroundColor: string;
    upTextColor: string;
    upUseGradient: boolean;
    upGradientStart: string;
    upGradientEnd: string;
    upFontFamily: string;
    downBackgroundColor: string;
    downTextColor: string;
    downUseGradient: boolean;
    downGradientStart: string;
    downGradientEnd: string;
    downFontFamily: string;
    warningBackgroundColor: string;
    warningTextColor: string;
    warningUseGradient: boolean;
    warningGradientStart: string;
    warningGradientEnd: string;
    warningFontFamily: string;
    borderRadius: number;
}

export const DEFAULT_FONT_FAMILY = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

export const DEFAULT_MONITOR_TILE_STYLES: TileStyle = {
    upBackgroundColor: '#10b981',
    upTextColor: '#ffffff',
    upUseGradient: false,
    upGradientStart: '#10b981',
    upGradientEnd: '#059669',
    upFontFamily: DEFAULT_FONT_FAMILY,
    downBackgroundColor: '#dc2626',
    downTextColor: '#ffffff',
    downUseGradient: false,
    downGradientStart: '#dc2626',
    downGradientEnd: '#b91c1c',
    downFontFamily: DEFAULT_FONT_FAMILY,
    warningBackgroundColor: '#f59e0b',
    warningTextColor: '#ffffff',
    warningUseGradient: true,
    warningGradientStart: '#f59e0b',
    warningGradientEnd: '#d97706',
    warningFontFamily: DEFAULT_FONT_FAMILY,
    borderRadius: 16,
};

/** Classic PHP Server Monitor homepage (Bootstrap 3 success / danger / warning). */
export const PHP_SERVER_MONITOR_TILE_STYLES: TileStyle = {
    upBackgroundColor: '#5cb85c',
    upTextColor: '#ffffff',
    upUseGradient: false,
    upGradientStart: '#5cb85c',
    upGradientEnd: '#449d44',
    upFontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    downBackgroundColor: '#d9534f',
    downTextColor: '#ffffff',
    downUseGradient: false,
    downGradientStart: '#d9534f',
    downGradientEnd: '#c9302c',
    downFontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    warningBackgroundColor: '#f0ad4e',
    warningTextColor: '#ffffff',
    warningUseGradient: false,
    warningGradientStart: '#f0ad4e',
    warningGradientEnd: '#ec971f',
    warningFontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    borderRadius: 4,
};

export function tileBackgroundStyle(
    styles: TileStyle,
    status: 'up' | 'down' | 'warning' | 'unknown' | null
): { background?: string; backgroundColor?: string } {
    if (status === 'up') {
        if (styles.upUseGradient) {
            return { background: `linear-gradient(135deg, ${styles.upGradientStart}, ${styles.upGradientEnd})` };
        }
        return { backgroundColor: styles.upBackgroundColor };
    }
    if (status === 'down') {
        if (styles.downUseGradient) {
            return { background: `linear-gradient(135deg, ${styles.downGradientStart}, ${styles.downGradientEnd})` };
        }
        return { backgroundColor: styles.downBackgroundColor };
    }
    if (status === 'warning') {
        if (styles.warningUseGradient) {
            return { background: `linear-gradient(135deg, ${styles.warningGradientStart}, ${styles.warningGradientEnd})` };
        }
        return { backgroundColor: styles.warningBackgroundColor };
    }
    return { backgroundColor: '#777777' };
}

export function tileTextColor(
    styles: TileStyle,
    status: 'up' | 'down' | 'warning' | 'unknown' | null
): string {
    if (status === 'up') return styles.upTextColor;
    if (status === 'down') return styles.downTextColor;
    if (status === 'warning') return styles.warningTextColor;
    return '#ffffff';
}

export function tileFontFamily(
    styles: TileStyle,
    status: 'up' | 'down' | 'warning' | 'unknown' | null
): string {
    if (status === 'up') return styles.upFontFamily;
    if (status === 'down') return styles.downFontFamily;
    if (status === 'warning') return styles.warningFontFamily;
    return styles.upFontFamily || DEFAULT_FONT_FAMILY;
}

const STORAGE_KEY = 'linknest_monitor_tile_styles';

function asBool(value: unknown): boolean {
    return value === true || value === 'true';
}

export function hasMonitorTileStylePreferences(
    preferences: Record<string, string | number | boolean | null | undefined> | null | undefined
): boolean {
    if (!preferences) return false;
    return Object.keys(preferences).some((key) => key.startsWith('monitor_tile_'));
}

export function tileStylesFromPreferences(
    preferences: Record<string, string | number | boolean | null | undefined> | null | undefined
): TileStyle {
    const prefs = preferences || {};
    const radius = parseFloat(String(prefs['monitor_tile_radius'] ?? ''));
    return {
        upBackgroundColor: (prefs['monitor_tile_up_bg'] as string) || DEFAULT_MONITOR_TILE_STYLES.upBackgroundColor,
        upTextColor: (prefs['monitor_tile_up_text'] as string) || DEFAULT_MONITOR_TILE_STYLES.upTextColor,
        upUseGradient: asBool(prefs['monitor_tile_up_gradient']),
        upGradientStart: (prefs['monitor_tile_up_gradient_start'] as string) || DEFAULT_MONITOR_TILE_STYLES.upGradientStart,
        upGradientEnd: (prefs['monitor_tile_up_gradient_end'] as string) || DEFAULT_MONITOR_TILE_STYLES.upGradientEnd,
        upFontFamily: (prefs['monitor_tile_up_font'] as string) || DEFAULT_MONITOR_TILE_STYLES.upFontFamily,
        downBackgroundColor: (prefs['monitor_tile_down_bg'] as string) || DEFAULT_MONITOR_TILE_STYLES.downBackgroundColor,
        downTextColor: (prefs['monitor_tile_down_text'] as string) || DEFAULT_MONITOR_TILE_STYLES.downTextColor,
        downUseGradient: asBool(prefs['monitor_tile_down_gradient']),
        downGradientStart: (prefs['monitor_tile_down_gradient_start'] as string) || DEFAULT_MONITOR_TILE_STYLES.downGradientStart,
        downGradientEnd: (prefs['monitor_tile_down_gradient_end'] as string) || DEFAULT_MONITOR_TILE_STYLES.downGradientEnd,
        downFontFamily: (prefs['monitor_tile_down_font'] as string) || DEFAULT_MONITOR_TILE_STYLES.downFontFamily,
        warningBackgroundColor: (prefs['monitor_tile_warning_bg'] as string) || DEFAULT_MONITOR_TILE_STYLES.warningBackgroundColor,
        warningTextColor: (prefs['monitor_tile_warning_text'] as string) || DEFAULT_MONITOR_TILE_STYLES.warningTextColor,
        warningUseGradient: prefs['monitor_tile_warning_gradient'] == null
            ? DEFAULT_MONITOR_TILE_STYLES.warningUseGradient
            : asBool(prefs['monitor_tile_warning_gradient']),
        warningGradientStart: (prefs['monitor_tile_warning_gradient_start'] as string) || DEFAULT_MONITOR_TILE_STYLES.warningGradientStart,
        warningGradientEnd: (prefs['monitor_tile_warning_gradient_end'] as string) || DEFAULT_MONITOR_TILE_STYLES.warningGradientEnd,
        warningFontFamily: (prefs['monitor_tile_warning_font'] as string) || DEFAULT_MONITOR_TILE_STYLES.warningFontFamily,
        borderRadius: Number.isFinite(radius) ? Math.max(0, Math.min(48, radius)) : DEFAULT_MONITOR_TILE_STYLES.borderRadius,
    };
}

export function tileStylesToPreferences(styles: TileStyle): Record<string, string> {
    return {
        monitor_tile_up_bg: styles.upBackgroundColor,
        monitor_tile_up_text: styles.upTextColor,
        monitor_tile_up_gradient: styles.upUseGradient ? 'true' : 'false',
        monitor_tile_up_gradient_start: styles.upGradientStart,
        monitor_tile_up_gradient_end: styles.upGradientEnd,
        monitor_tile_up_font: styles.upFontFamily,
        monitor_tile_down_bg: styles.downBackgroundColor,
        monitor_tile_down_text: styles.downTextColor,
        monitor_tile_down_gradient: styles.downUseGradient ? 'true' : 'false',
        monitor_tile_down_gradient_start: styles.downGradientStart,
        monitor_tile_down_gradient_end: styles.downGradientEnd,
        monitor_tile_down_font: styles.downFontFamily,
        monitor_tile_warning_bg: styles.warningBackgroundColor,
        monitor_tile_warning_text: styles.warningTextColor,
        monitor_tile_warning_gradient: styles.warningUseGradient ? 'true' : 'false',
        monitor_tile_warning_gradient_start: styles.warningGradientStart,
        monitor_tile_warning_gradient_end: styles.warningGradientEnd,
        monitor_tile_warning_font: styles.warningFontFamily,
        monitor_tile_radius: String(styles.borderRadius),
    };
}

export function readCachedMonitorTileStyles(): TileStyle {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_MONITOR_TILE_STYLES;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_MONITOR_TILE_STYLES;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return DEFAULT_MONITOR_TILE_STYLES;
        return { ...DEFAULT_MONITOR_TILE_STYLES, ...parsed };
    } catch {
        return DEFAULT_MONITOR_TILE_STYLES;
    }
}

export function writeCachedMonitorTileStyles(styles: TileStyle): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
    } catch {
        // ignore quota / private mode
    }
}
