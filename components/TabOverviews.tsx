import React, { Suspense, lazy } from 'react';
import { Tile } from '../types';

/**
 * Non-grid tab banners (Archive / Recycle Bin / Staging / Your Apps / Private /
 * Scheduled / Expired).
 *
 * Previously these rendered only in the desktop branch of TileGrid, so phones
 * fell through to a flat tile grid on every one of these tabs. Mobile now
 * renders this component; TileGrid keeps its richer desktop block (sub-tab
 * bars, sharing/blocked panels, purge controls) alongside it.
 */

const StagingOverview = lazy(() => import('./StagingOverview').then(m => ({ default: m.StagingOverview })));
const YourAppsOverview = lazy(() => import('./YourAppsOverview').then(m => ({ default: m.YourAppsOverview })));
const PrivateOverview = lazy(() => import('./PrivateOverview').then(m => ({ default: m.PrivateOverview })));
const ScheduledOverview = lazy(() => import('./ScheduledOverview').then(m => ({ default: m.ScheduledOverview })));
const ExpiredOverview = lazy(() => import('./ExpiredOverview').then(m => ({ default: m.ExpiredOverview })));
const ArchiveOverview = lazy(() => import('./ArchiveOverview').then(m => ({ default: m.ArchiveOverview })));
const RecycleBinOverview = lazy(() => import('./RecycleBinOverview').then(m => ({ default: m.RecycleBinOverview })));

export type TabOverviewSubTab = 'spaces' | 'sharing' | 'blocked';

export interface TabOverviewsProps {
  activeTab: string;
  spaceCount: number;
  /** Archive view: number of archived spaces (falls back to spaceCount). */
  archiveCount?: number;
  /** Recycle Bin view: number of soft-deleted spaces (falls back to spaceCount). */
  recycleBinCount?: number;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  /** Private tab: pending share invitations badge. */
  pendingInvitationsCount?: number;
  privateSubTab?: TabOverviewSubTab;
  yourAppsFilter?: 'authenticated' | 'assigned';
  onSelectPrivateSubTab?: (subTab: TabOverviewSubTab) => void;
  onSelectYourAppsFilter?: (filter: 'authenticated' | 'assigned') => void;
  /** Staging: template download + AI Offline Kit focus. */
  onDownloadStagingTemplates?: () => void;
  onFocusOfflineKit?: () => void;
  /** Optional action bars (desktop supplies refresh/purge controls). */
  archiveActions?: React.ReactNode;
  recycleBinActions?: React.ReactNode;
}

export const TabOverviews: React.FC<TabOverviewsProps> = ({
  activeTab,
  spaceCount,
  archiveCount,
  recycleBinCount,
  isAuthenticated = false,
  isAdmin = false,
  pendingInvitationsCount = 0,
  privateSubTab = 'spaces',
  yourAppsFilter = 'authenticated',
  onSelectPrivateSubTab,
  onSelectYourAppsFilter,
  onDownloadStagingTemplates,
  onFocusOfflineKit,
  archiveActions,
  recycleBinActions,
}) => {
  if (!isAuthenticated) return null;

  return (
    <Suspense fallback={null}>
      {/* Staging overview (admin only) */}
      {activeTab === 'staging' && isAdmin && (
        <StagingOverview
          spaceCount={spaceCount}
          onDownloadTemplates={onDownloadStagingTemplates}
          onFocusOfflineKit={onFocusOfflineKit}
        />
      )}

      {/* Your Apps overview */}
      {activeTab === 'your-apps' && (
        <YourAppsOverview
          spaceCount={spaceCount}
          onSelectFilter={onSelectYourAppsFilter}
        />
      )}

      {/* Private overview */}
      {activeTab === 'private' && (
        <PrivateOverview
          spaceCount={privateSubTab === 'spaces' ? spaceCount : 0}
          pendingInvitationsCount={pendingInvitationsCount}
          onSelectSubTab={onSelectPrivateSubTab}
        />
      )}

      {/* Scheduled overview */}
      {activeTab === 'scheduled' && <ScheduledOverview spaceCount={spaceCount} />}

      {/* Expired overview */}
      {activeTab === 'expired' && <ExpiredOverview spaceCount={spaceCount} />}

      {/* Archive overview */}
      {activeTab === 'archive' && (
        <>
          <ArchiveOverview spaceCount={archiveCount ?? spaceCount} />
          {archiveActions}
        </>
      )}

      {/* Recycle Bin overview */}
      {activeTab === 'recycle-bin' && (
        <>
          <RecycleBinOverview spaceCount={recycleBinCount ?? spaceCount} />
          {recycleBinActions}
        </>
      )}
    </Suspense>
  );
};

/** Tabs that render a banner above their card list instead of a bare grid. */
export const NON_GRID_TABS = [
  'staging',
  'your-apps',
  'private',
  'scheduled',
  'expired',
  'archive',
  'recycle-bin',
] as const;

export type NonGridTab = typeof NON_GRID_TABS[number];

export function isNonGridTab(tab: string): tab is NonGridTab {
  return (NON_GRID_TABS as readonly string[]).includes(tab);
}

/** Which tabs a mobile user can meaningfully open from the drawer / URL. */
export const MOBILE_REACHABLE_TABS: readonly string[] = [
  'public',
  'favorites',
  'public-favorites',
  'private',
  'your-apps',
  'staging',
  'scheduled',
  'expired',
  'archive',
  'recycle-bin',
];

/** Resolve the tile list a non-grid tab should actually show. */
export function tilesForTab(
  tab: string,
  sources: { tiles: Tile[]; staging: Tile[]; archive: Tile[]; recycleBin: Tile[] }
): Tile[] {
  switch (tab) {
    case 'staging':
      return sources.staging;
    case 'archive':
      return sources.archive;
    case 'recycle-bin':
      return sources.recycleBin;
    default:
      return sources.tiles;
  }
}
