import type { AppSettings } from './settingsService';

export type AppTabId =
  | 'public'
  | 'favorites'
  | 'private'
  | 'scheduled'
  | 'expired'
  | 'archive'
  | 'recycle-bin'
  | 'monitoring'
  | 'admin'
  | 'style';

export const APP_TABS: Array<{
  id: AppTabId;
  label: string;
  description: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}> = [
  { id: 'public', label: 'Public', description: 'Public spaces visible to everyone.' },
  { id: 'favorites', label: 'Favorites', description: 'Favorites tab (includes Public Favorites for guests).' },
  { id: 'private', label: 'Private', description: 'Private spaces (requires login).', requiresAuth: true },
  { id: 'scheduled', label: 'Scheduled', description: 'Spaces scheduled for the future (requires login).', requiresAuth: true },
  { id: 'expired', label: 'Expired', description: 'Expired spaces (requires login).', requiresAuth: true },
  { id: 'archive', label: 'Archive', description: 'Archived spaces (requires login).', requiresAuth: true },
  { id: 'recycle-bin', label: 'Recycle Bin', description: 'Deleted spaces (requires login).', requiresAuth: true },
  { id: 'monitoring', label: 'Monitoring', description: 'Monitoring dashboard (admin only).', requiresAdmin: true },
  { id: 'admin', label: 'Admin', description: 'Admin Panel button in the top navigation (admin only).', requiresAdmin: true },
  { id: 'style', label: 'Style', description: 'Style Manager button in the top navigation (admin only).', requiresAdmin: true }
];

const VALID_TAB_IDS: Set<string> = new Set(APP_TABS.map(t => t.id));

function normalizeTabId(input: string): string {
  return String(input || '').trim().toLowerCase();
}

function safeParseStringArray(value: unknown): string[] | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(v => String(v));
    }
    return null;
  } catch {
    return null;
  }
}

export function getDisabledTabsFromSettings(settings: AppSettings | null | undefined): Set<AppTabId> {
  const raw = settings?.disabled_tabs;
  // Prefer JSON array string (recommended)
  const parsed = safeParseStringArray(raw);
  let items: string[] = [];

  if (parsed !== null) {
    items = parsed;
  } else if (typeof raw === 'string' && raw.trim()) {
    // Backward/forgiving parsing: comma-separated list
    items = raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  const disabled = new Set<AppTabId>();
  for (const item of items) {
    const id = normalizeTabId(item);
    if (VALID_TAB_IDS.has(id)) {
      disabled.add(id as AppTabId);
    }
  }
  return disabled;
}

export function isTabDisabled(settings: AppSettings | null | undefined, tabId: AppTabId): boolean {
  return getDisabledTabsFromSettings(settings).has(tabId);
}

export function setToSortedJsonArray<T extends string>(set: Set<T>): string {
  return JSON.stringify(Array.from(set).sort());
}

