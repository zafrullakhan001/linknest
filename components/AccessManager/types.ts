export type AccessSubTab = 'hub' | 'roles' | 'groups' | 'editors';

export const ACCESS_SUB_TAB_STORAGE_KEY = 'adminPanelAccessSubTab';
export const ACCESS_ONBOARDING_DISMISSED_KEY = 'accessManagerOnboardingDismissed';

const LEGACY_TAB_MAP: Record<string, AccessSubTab> = {
  roles: 'roles',
  assign: 'roles',
  admins: 'editors',
  groups: 'groups',
  hub: 'hub',
  editors: 'editors',
};

export function migrateAccessSubTab(saved: string | null): AccessSubTab {
  if (!saved) return 'hub';
  return LEGACY_TAB_MAP[saved] ?? 'hub';
}
