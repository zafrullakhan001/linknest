import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tile } from '../types';
import { User } from '../services/authService';
import {
  archiveTile,
  cloneTile,
  deleteTile,
  getTiles,
  saveTile,
  toggleFavorite,
  updateTilePageAnimation,
} from '../services/storageService';
import { exportTileToFileAsync } from '../services/spaceTransferService';
import { removeSharedTile } from '../services/tileShareService';
import { isPublicFavorite, togglePublicFavorite } from '../services/publicFavoritesService';
import { TileAnimationSelector, getAnimationOption, type TileAnimation } from './TileAnimationSelector';
import { HeaderIcons, SpaceHeaderDrawerButton, SpaceHeaderIconButton } from './SpaceHeaderIconButton';
import { SpaceHeaderDock } from './SpaceHeaderDock';

const TileInfoDialog = lazy(() => import('./TileInfoDialog').then((m) => ({ default: m.TileInfoDialog })));
const ShareTileDialog = lazy(() => import('./ShareTileDialog').then((m) => ({ default: m.ShareTileDialog })));
const DeleteSharedSpaceDialog = lazy(() =>
  import('./DeleteSharedSpaceDialog').then((m) => ({ default: m.DeleteSharedSpaceDialog }))
);
const SpaceAiAnalysisDialog = lazy(() =>
  import('./SpaceAiAnalysisDialog').then((m) => ({ default: m.SpaceAiAnalysisDialog }))
);

export interface SpaceViewHeaderActionsProps {
  tile: Tile;
  allTiles: Tile[];
  user?: User | null;
  isAuthenticated?: boolean;
  sourceTab?: 'public' | 'your-apps' | 'staging' | 'private' | 'favorites' | 'public-favorites' | null;
  showShortUrls: boolean;
  persistShowShortUrls: (enabled: boolean) => void | Promise<void>;
  checkingHealth: boolean;
  onCheckLinks: (e?: React.MouseEvent) => void;
  onUpdateTiles: (tiles: Tile[], skipReload?: boolean, isFinal?: boolean, localOnly?: boolean) => void;
  onAuthRequired?: () => void;
  onEdit: () => void;
  onCompare: () => void;
  onBack: () => void;
  pageAnimOpen: boolean;
  setPageAnimOpen: (open: boolean) => void;
  mobilePageAnimOpen: boolean;
  setMobilePageAnimOpen: (open: boolean) => void;
  showHeaderActionsMenu: boolean;
  setShowHeaderActionsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  headerActionsMenuRef: React.RefObject<HTMLDivElement | null>;
}

export const SpaceViewHeaderActions: React.FC<SpaceViewHeaderActionsProps> = ({
  tile,
  allTiles,
  user,
  isAuthenticated,
  sourceTab,
  showShortUrls,
  persistShowShortUrls,
  checkingHealth,
  onCheckLinks,
  onUpdateTiles,
  onAuthRequired,
  onEdit,
  onCompare,
  onBack,
  pageAnimOpen,
  setPageAnimOpen,
  setMobilePageAnimOpen,
  showHeaderActionsMenu,
  setShowHeaderActionsMenu,
  headerActionsMenuRef,
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAi, setShowAi] = useState(false);
  /** Delete confirmation for a space that is shared with other users. */
  const [showDeleteShared, setShowDeleteShared] = useState(false);
  const [guestFavorite, setGuestFavorite] = useState(() => isPublicFavorite(tile.id));

  useEffect(() => {
    setGuestFavorite(isPublicFavorite(tile.id));
  }, [tile.id]);

  const canEdit = tile.canEdit === true;
  const canEditTile = tile.canEditTile === undefined || tile.canEditTile === true;
  const canClone = !!(user?.is_admin || tile.canCloneTile === true);
  const canInfo = tile.canViewTileInfo !== false && (tile.canViewTileInfo === true || tile.canView === true);
  const canShare = canEdit && !tile.sharedWithMeInvitationId;
  const canDelete = tile.canDelete === true;
  /**
   * Deleting a space that other users can still open needs an explicit decision about their
   * access. `shareCount` covers share invitations (pending + accepted); `allowedUsers` also
   * covers legacy recipients without an invitation row.
   */
  const isSharedWithOthers = !tile.sharedWithMeInvitationId &&
    ((tile.shareCount ?? 0) > 0 || (tile.visibility === 'private' && (tile.allowedUsers?.length ?? 0) > 1));
  const isFavorited = isAuthenticated ? !!tile.isFavorite : guestFavorite;
  const animOption = getAnimationOption((tile.pageAnimation as TileAnimation) || 'none');

  const closeMenu = () => setShowHeaderActionsMenu(false);

  const handleFavorite = useCallback(async () => {
    if (!isAuthenticated) {
      togglePublicFavorite(tile.id);
      setGuestFavorite(isPublicFavorite(tile.id));
      return;
    }
    try {
      const result = await toggleFavorite(tile.id);
      const updatedTiles = allTiles.map((t) => (t.id === tile.id ? { ...t, isFavorite: result.isFavorite } : t));
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      alert('Failed to update favorite. Please try again.');
    }
  }, [allTiles, isAuthenticated, onUpdateTiles, tile.id]);

  const handleClone = useCallback(async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }
    if (!tile.canEdit && !user?.is_admin) {
      alert('You do not have permission to clone this space.');
      return;
    }
    try {
      await cloneTile(tile.id);
      const freshTiles = await getTiles();
      onUpdateTiles(freshTiles);
      alert('Space cloned successfully!');
    } catch (error) {
      console.error('Failed to clone tile:', error);
      alert('Failed to clone space. Please try again.');
    }
  }, [isAuthenticated, onAuthRequired, onUpdateTiles, tile.canEdit, tile.id, user?.is_admin]);

  const handleDelete = useCallback(async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }
    // A space shared with other users asks what should happen to their access first
    // (revoke & delete, or delete without revoking) — docs/PRIVATE_SPACE_SHARING.md
    if (isSharedWithOthers) {
      setShowDeleteShared(true);
      return;
    }
    if (!confirm('Are you sure you want to delete this space? It will be moved to the recycle bin.')) return;
    try {
      await deleteTile(tile.id);
      onUpdateTiles(allTiles.filter((t) => t.id !== tile.id));
      window.location.hash = '#/';
    } catch (error) {
      console.error('Failed to delete tile:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete space.');
    }
  }, [allTiles, isAuthenticated, isSharedWithOthers, onAuthRequired, onUpdateTiles, tile.id]);

  /** Runs after the shared-space dialog: the delete itself (recipients already handled). */
  const handleDeleteSharedSpace = useCallback(async () => {
    await deleteTile(tile.id);
    onUpdateTiles(allTiles.filter((t) => t.id !== tile.id));
    setShowDeleteShared(false);
    window.location.hash = '#/';
  }, [allTiles, onUpdateTiles, tile.id]);

  const handleArchive = useCallback(async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }
    if (!confirm('Are you sure you want to archive this space? It will be moved to the archive.')) return;
    try {
      await archiveTile(tile.id);
      const freshTiles = await getTiles();
      onUpdateTiles(freshTiles);
      window.location.hash = '#/';
    } catch (error) {
      console.error('Failed to archive tile:', error);
      alert(error instanceof Error ? error.message : 'Failed to archive space.');
    }
  }, [isAuthenticated, onAuthRequired, onUpdateTiles, tile.id]);

  const handleRemoveShared = useCallback(async () => {
    if (!tile.sharedWithMeInvitationId) return;
    if (!confirm('Remove this shared tile from your Private tab? You can accept it again if the owner shares it with you later.')) {
      return;
    }
    try {
      await removeSharedTile(tile.sharedWithMeInvitationId);
      const freshTiles = await getTiles();
      onUpdateTiles(freshTiles);
      window.location.hash = '#/';
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('switchTab', { detail: 'private' }));
      }, 100);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove');
    }
  }, [onUpdateTiles, tile.sharedWithMeInvitationId]);

  const handleMoveTab = useCallback(
    async (next: 'public' | 'staging') => {
      try {
        const updatedTile = { ...tile, sourceTab: next };
        await saveTile(updatedTile);
        if (next === 'staging') {
          onUpdateTiles(allTiles.filter((t) => t.id !== tile.id));
        } else {
          const updatedTilesArray = allTiles.map((t) => (t.id === tile.id ? updatedTile : t));
          if (allTiles.every((t) => t.id !== tile.id)) {
            updatedTilesArray.push(updatedTile);
          }
          onUpdateTiles(updatedTilesArray);
        }
        window.location.hash = '#/';
      } catch (e) {
        console.error(`Failed to move tile to ${next}`, e);
        alert(`Failed to move tile to ${next}. Please try again.`);
      }
    },
    [allTiles, onUpdateTiles, tile]
  );

  const handleAnimationChange = useCallback(
    async (animation: TileAnimation) => {
      const next = animation && animation !== 'none' ? animation : undefined;
      const updatedTile: Tile = { ...tile, pageAnimation: next };
      const updatedTiles = allTiles.map((t) => (t.id === updatedTile.id ? updatedTile : t));
      try {
        await updateTilePageAnimation(tile.id, next ?? null);
        onUpdateTiles(updatedTiles, true, false, true);
      } catch (e) {
        console.error('Failed to save page animation:', e);
        alert(e instanceof Error ? e.message : 'Failed to save page animation');
      }
    },
    [allTiles, onUpdateTiles, tile]
  );

  const handleAppliedAi = useCallback(
    async (updated: Tile) => {
      const nextTiles = allTiles.map((t) => (t.id === updated.id ? updated : t));
      onUpdateTiles(nextTiles, true, true, true);
    },
    [allTiles, onUpdateTiles]
  );

  const handleImportedAi = useCallback(async () => {
    const freshTiles = await getTiles();
    onUpdateTiles(freshTiles);
  }, [onUpdateTiles]);

  const favoriteTitle = isFavorited ? 'Remove from favorites' : 'Add to favorites';
  const shortUrlTitle = 'Show LinkNest short URLs instead of original destinations (hover, copy, and QR)';
  const animTitle = `Sections animation: ${animOption.name}`;

  return (
    <>
      <div className="flex items-center gap-2 justify-center md:justify-end w-full md:w-auto">
        <SpaceHeaderDock className="hidden md:flex items-end gap-1.5 flex-wrap justify-end py-1">
          {canEdit && (
            <SpaceHeaderIconButton
              title={shortUrlTitle}
              label="Short"
              active={showShortUrls}
              onClick={() => {
                void persistShowShortUrls(!showShortUrls);
              }}
            >
              {HeaderIcons.shortUrls}
            </SpaceHeaderIconButton>
          )}
          {canEdit && (
            <div className="relative flex items-end">
              <SpaceHeaderIconButton title={animTitle} label="Anim" onClick={() => setPageAnimOpen(!pageAnimOpen)}>
                <span className="text-base leading-none" aria-hidden="true">{animOption.icon}</span>
              </SpaceHeaderIconButton>
              <TileAnimationSelector
                key={`page-anim-${tile.id}`}
                animationsOnly
                persistGlobal={false}
                hideTrigger
                open={pageAnimOpen}
                onOpenChange={setPageAnimOpen}
                value={(tile.pageAnimation as TileAnimation) || 'none'}
                onAnimationChange={handleAnimationChange}
                scopeLabel="SECTIONS ANIMATION"
                scopeHint="Animates whole link sections on this page"
                buttonTitle={animTitle}
              />
            </div>
          )}
          <SpaceHeaderIconButton title={favoriteTitle} label="Fav" active={isFavorited} onClick={() => void handleFavorite()}>
            {HeaderIcons.favorite(isFavorited)}
          </SpaceHeaderIconButton>
          {canInfo && (
            <SpaceHeaderIconButton title="Show tile information" label="Info" onClick={() => setShowInfo(true)}>
              {HeaderIcons.info}
            </SpaceHeaderIconButton>
          )}
          <SpaceHeaderIconButton
            title={checkingHealth ? 'Checking links…' : 'Check all links in this tile'}
            label={checkingHealth ? 'Wait' : 'Check'}
            disabled={checkingHealth}
            onClick={(e) => onCheckLinks(e)}
          >
            {checkingHealth ? HeaderIcons.spinner : HeaderIcons.checkLinks}
          </SpaceHeaderIconButton>
          {canEdit && canEditTile && (
            <SpaceHeaderIconButton title="Compare & merge with another space" label="Merge" onClick={onCompare}>
              {HeaderIcons.compare}
            </SpaceHeaderIconButton>
          )}
          <SpaceHeaderIconButton title="Export this space as JSON" label="Export" onClick={() => void exportTileToFileAsync(tile)}>
            {HeaderIcons.export}
          </SpaceHeaderIconButton>
          {canEdit && (
            <SpaceHeaderIconButton title="AI space analysis" label="AI" onClick={() => setShowAi(true)}>
              {HeaderIcons.ai}
            </SpaceHeaderIconButton>
          )}
          {canShare && (
            <SpaceHeaderIconButton title="Share with user" label="Share" onClick={() => setShowShare(true)}>
              {HeaderIcons.share}
            </SpaceHeaderIconButton>
          )}
          {isAuthenticated && canEdit && (
            <SpaceHeaderIconButton title="Edit" label="Edit" onClick={onEdit}>
              {HeaderIcons.edit}
            </SpaceHeaderIconButton>
          )}
          {isAuthenticated && canEdit && canClone && (
            <SpaceHeaderIconButton title="Clone this space" label="Clone" onClick={() => void handleClone()}>
              {HeaderIcons.clone}
            </SpaceHeaderIconButton>
          )}
          {canDelete && (
            <SpaceHeaderIconButton title="Archive" label="Archive" onClick={() => void handleArchive()}>
              {HeaderIcons.archive}
            </SpaceHeaderIconButton>
          )}
          {canDelete && (
            <SpaceHeaderIconButton title="Delete" label="Delete" onClick={() => void handleDelete()}>
              {HeaderIcons.trash}
            </SpaceHeaderIconButton>
          )}
          {tile.sharedWithMeInvitationId && isAuthenticated && (
            <SpaceHeaderIconButton title="Remove from my Private tab" label="Remove" onClick={() => void handleRemoveShared()}>
              {HeaderIcons.close}
            </SpaceHeaderIconButton>
          )}
          {(sourceTab === 'public' || sourceTab === null) && user?.is_admin && (
            <SpaceHeaderIconButton title="Move to Staging tab" label="Stage" onClick={() => void handleMoveTab('staging')}>
              {HeaderIcons.plus}
            </SpaceHeaderIconButton>
          )}
          {sourceTab === 'staging' && user?.is_admin && (
            <SpaceHeaderIconButton title="Move to Public tab" label="Public" onClick={() => void handleMoveTab('public')}>
              {HeaderIcons.plus}
            </SpaceHeaderIconButton>
          )}
          <SpaceHeaderIconButton title="Back to Dashboard (Esc)" label="Back" onClick={onBack}>
            {HeaderIcons.back}
          </SpaceHeaderIconButton>
        </SpaceHeaderDock>

        <div className="md:hidden flex items-center gap-2" ref={headerActionsMenuRef}>
          <SpaceHeaderIconButton
            title="Open menu"
            onClick={() => setShowHeaderActionsMenu((prev) => !prev)}
          >
            {HeaderIcons.menu}
          </SpaceHeaderIconButton>

          {showHeaderActionsMenu &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 bg-black/50 z-[10040] transition-opacity duration-300 md:hidden"
                  aria-hidden="true"
                  onClick={closeMenu}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Space actions"
                  className="fixed left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-[10050] shadow-2xl transform transition-transform duration-300 ease-out translate-x-0 md:hidden flex flex-col"
                  style={{ boxShadow: '4px 0 24px rgba(0, 0, 0, 0.15)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{tile.title}</h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide font-semibold">
                        Actions
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeMenu}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                      aria-label="Close menu"
                    >
                      {HeaderIcons.close}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto py-3">
                    {canEdit && (
                      <div className="px-4 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800 space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu();
                            setMobilePageAnimOpen(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all shadow-sm"
                          title={animTitle}
                        >
                          <span className="text-lg">{animOption.icon}</span>
                          <div className="flex flex-col items-start min-w-0 flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Animation
                            </span>
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                              {animOption.name}
                            </span>
                          </div>
                        </button>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={showShortUrls}
                            onChange={(e) => {
                              void persistShowShortUrls(e.target.checked);
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Show short URLs instead of original URLs
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="space-y-1 px-2">
                      <SpaceHeaderDrawerButton
                        label={favoriteTitle}
                        icon={HeaderIcons.favorite(isFavorited)}
                        onClick={() => {
                          closeMenu();
                          void handleFavorite();
                        }}
                      />
                      {canInfo && (
                        <SpaceHeaderDrawerButton
                          label="Space information"
                          icon={HeaderIcons.info}
                          onClick={() => {
                            closeMenu();
                            setShowInfo(true);
                          }}
                        />
                      )}
                      <SpaceHeaderDrawerButton
                        label="Export"
                        icon={HeaderIcons.export}
                        onClick={() => {
                          closeMenu();
                          void exportTileToFileAsync(tile);
                        }}
                      />
                      {canEdit && canEditTile && (
                        <SpaceHeaderDrawerButton
                          label="Compare & merge"
                          icon={HeaderIcons.compare}
                          onClick={() => {
                            closeMenu();
                            onCompare();
                          }}
                        />
                      )}
                      {canEdit && (
                        <SpaceHeaderDrawerButton
                          label="AI space analysis"
                          icon={HeaderIcons.ai}
                          onClick={() => {
                            closeMenu();
                            setShowAi(true);
                          }}
                        />
                      )}
                      <SpaceHeaderDrawerButton
                        label={checkingHealth ? 'Checking...' : 'Check Links'}
                        icon={checkingHealth ? HeaderIcons.spinner : HeaderIcons.checkLinks}
                        disabled={checkingHealth}
                        onClick={(e) => {
                          closeMenu();
                          onCheckLinks(e);
                        }}
                      />
                      {tile.sharedWithMeInvitationId && isAuthenticated && (
                        <SpaceHeaderDrawerButton
                          label="Remove from Private"
                          icon={HeaderIcons.close}
                          className="text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          onClick={() => {
                            closeMenu();
                            void handleRemoveShared();
                          }}
                        />
                      )}
                      {canShare && (
                        <SpaceHeaderDrawerButton
                          label="Share with user"
                          icon={HeaderIcons.share}
                          onClick={() => {
                            closeMenu();
                            setShowShare(true);
                          }}
                        />
                      )}
                      {isAuthenticated && canEdit && (
                        <SpaceHeaderDrawerButton
                          label="Edit"
                          icon={HeaderIcons.edit}
                          onClick={() => {
                            closeMenu();
                            onEdit();
                          }}
                        />
                      )}
                      {isAuthenticated && canEdit && canClone && (
                        <SpaceHeaderDrawerButton
                          label="Clone"
                          icon={HeaderIcons.clone}
                          onClick={() => {
                            closeMenu();
                            void handleClone();
                          }}
                        />
                      )}
                      {canDelete && (
                        <SpaceHeaderDrawerButton
                          label="Archive"
                          icon={HeaderIcons.archive}
                          onClick={() => {
                            closeMenu();
                            void handleArchive();
                          }}
                        />
                      )}
                      {canDelete && (
                        <SpaceHeaderDrawerButton
                          label="Delete"
                          icon={HeaderIcons.trash}
                          className="text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => {
                            closeMenu();
                            void handleDelete();
                          }}
                        />
                      )}
                      {(sourceTab === 'public' || sourceTab === null) && user?.is_admin && (
                        <SpaceHeaderDrawerButton
                          label="Move to Staging"
                          icon={HeaderIcons.plus}
                          onClick={() => {
                            closeMenu();
                            void handleMoveTab('staging');
                          }}
                        />
                      )}
                      {sourceTab === 'staging' && user?.is_admin && (
                        <SpaceHeaderDrawerButton
                          label="Move to Public"
                          icon={HeaderIcons.plus}
                          onClick={() => {
                            closeMenu();
                            void handleMoveTab('public');
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </>,
              document.body
            )}
        </div>

        <div className="md:hidden">
          <SpaceHeaderIconButton title="Back to Dashboard (Esc)" onClick={onBack}>
            {HeaderIcons.back}
          </SpaceHeaderIconButton>
        </div>
      </div>

      {showInfo && (
        <Suspense fallback={null}>
          <TileInfoDialog isOpen={showInfo} onClose={() => setShowInfo(false)} tile={tile} />
        </Suspense>
      )}
      {showShare && (
        <Suspense fallback={null}>
          <ShareTileDialog
            tile={tile}
            onClose={() => setShowShare(false)}
            onShared={() => {
              getTiles().then((t) => onUpdateTiles(t, false));
            }}
          />
        </Suspense>
      )}
      {showDeleteShared && (
        <Suspense fallback={null}>
          <DeleteSharedSpaceDialog
            tile={tile}
            onClose={() => setShowDeleteShared(false)}
            onDelete={handleDeleteSharedSpace}
          />
        </Suspense>
      )}
      {showAi && (
        <Suspense fallback={null}>
          <SpaceAiAnalysisDialog
            open={showAi}
            tile={tile}
            onClose={() => setShowAi(false)}
            onApplied={handleAppliedAi}
            onImported={handleImportedAi}
          />
        </Suspense>
      )}
    </>
  );
};
