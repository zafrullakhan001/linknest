import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tile, LinkSection, ThemeColor, THEME_COLORS, COLOR_STYLES, POPULAR_EMOJIS, TileVisibility, TileMessage, Link } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { saveTileArrangement, saveCategoryArrangement, getCategoryArrangement, toggleFavorite, saveTile, createTile, getTiles, cloneCategory, toggleCategoryFavorite, getRecycleBin, restoreTile, purgeRecycleBin, permanentDeleteTile, permanentDeleteCategory, deleteTile, getArchive, archiveTile, unarchiveTile, purgeArchive, archiveCategory, unarchiveCategory, getFavoriteLinks, FavoriteLink } from '../services/storageService';
import {
  exportCategoryToFile,
  exportTileToFile,
  parseSpaceExportObject,
  normalizeImportedTiles
} from '../services/spaceTransferService';
import { authService, UserListItem } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { userPreferencesService } from '../services/userPreferencesService';
import { getPublicFavorites, togglePublicFavorite, isPublicFavorite, getPublicActiveTab, setPublicActiveTab, exportPublicFavorites, importPublicFavorites, clearPublicFavorites, getPublicLinkFavorites, togglePublicLinkFavorite, clearPublicLinkFavorites } from '../services/publicFavoritesService';
import { linkHealthService } from '../services/linkHealthService';
import { favoriteLinkHealthService, LinkHealthCheckResult } from '../services/favoriteLinkHealthService';
import { TileAnimationSelector, useTileAnimation, getTileAnimationClass, getTileDecorationClass, TileAnimation, TileDecoration } from './TileAnimationSelector';
import { MonitoringDashboard } from './MonitoringDashboard';
import { getDisabledTabsFromSettings } from '../services/tabVisibilityService';
import { rolesService } from '../services/rolesService';
import { FaTimes } from 'react-icons/fa';
import { LinkInfoDialog } from './LinkInfoDialog';
import { useMobile } from '../hooks/useMobile';
import { MobileTileView } from './MobileTileView';
import { TileInfoDialog } from './TileInfoDialog';


interface TileGridProps {
  tiles: Tile[];
  onUpdateTiles: (tiles: Tile[], skipReload?: boolean, isFinal?: boolean) => void;
  onCreateTile?: (tile: Tile) => Promise<void>;
  onDeleteTile?: (tileId: string) => Promise<void>;
  onCloneTile?: (tileId: string) => Promise<void>;
  isAuthenticated?: boolean;
  onAuthRequired?: () => void;
  darkMode?: boolean;
  toggleTheme?: () => void;
  onHelpClick?: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// Resolve API base dynamically
function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

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

// Category Visibility Management Dialog
interface CategoryVisibilityDialogProps {
  categoryName: string;
  tiles: Tile[];
  users: Array<{ id: number; username: string }>;
  onClose: () => void;
  onSave: (changes: Record<string, { visibility: TileVisibility; allowedUsers: number[] }>) => Promise<void>;
}

const CategoryVisibilityDialog: React.FC<CategoryVisibilityDialogProps> = ({
  categoryName,
  tiles,
  users,
  onClose,
  onSave
}) => {
  const [tileVisibility, setTileVisibility] = useState<Record<string, { visibility: TileVisibility; allowedUsers: number[] }>>(() => {
    const initial: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      initial[tile.id] = {
        visibility: tile.visibility || 'public',
        allowedUsers: tile.allowedUsers || []
      };
    });
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [bulkPrivateSelectedUsers, setBulkPrivateSelectedUsers] = useState<number[]>(users.map(u => u.id));
  const [showBulkUserSelection, setShowBulkUserSelection] = useState(false);

  const publicTiles = tiles.filter(t => (tileVisibility[t.id]?.visibility || 'public') === 'public');
  const authenticatedTiles = tiles.filter(t => tileVisibility[t.id]?.visibility === 'authenticated');
  const privateTiles = tiles.filter(t => tileVisibility[t.id]?.visibility === 'private');

  const handleVisibilityChange = (tileId: string, visibility: TileVisibility) => {
    setTileVisibility(prev => ({
      ...prev,
      [tileId]: {
        visibility,
        allowedUsers: visibility === 'private' ? (prev[tileId]?.allowedUsers || []) : []
      }
    }));
  };

  const handleUserToggle = (tileId: string, userId: number) => {
    setTileVisibility(prev => {
      const currentUsers = prev[tileId]?.allowedUsers || [];
      const newUsers = currentUsers.includes(userId)
        ? currentUsers.filter(id => id !== userId)
        : [...currentUsers, userId];
      return {
        ...prev,
        [tileId]: {
          ...prev[tileId],
          visibility: prev[tileId]?.visibility || 'public',
          allowedUsers: newUsers
        }
      };
    });
  };

  const handleMakeAllPublic = () => {
    const updates: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      updates[tile.id] = { visibility: 'public', allowedUsers: [] };
    });
    setTileVisibility(updates);
  };

  const handleMakeAllProtected = () => {
    const updates: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      updates[tile.id] = { visibility: 'authenticated', allowedUsers: [] };
    });
    setTileVisibility(updates);
  };

  const handleMakeAllPrivate = () => {
    const updates: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      // Use selected users from bulk selection
      updates[tile.id] = { visibility: 'private', allowedUsers: bulkPrivateSelectedUsers };
    });
    setTileVisibility(updates);
    setShowBulkUserSelection(false);
  };

  const handleBulkUserToggle = (userId: number) => {
    setBulkPrivateSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(tileVisibility);
      onClose();
    } catch (error) {
      console.error('Failed to save visibility changes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Manage Tile Visibility</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{categoryName}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Left Side - All Tiles */}
        <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">All Tiles ({tiles.length})</h3>
            <button
              onClick={handleMakeAllPublic}
              className="px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            >
              Make All Public
            </button>
          </div>
          <div className="space-y-2">
            {tiles.map(tile => {
              const currentVisibility = tileVisibility[tile.id]?.visibility || 'public';
              return (
                <div
                  key={tile.id}
                  className={`p-3 rounded-lg border transition-all ${currentVisibility === 'public' ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50' :
                    currentVisibility === 'authenticated' ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' :
                      'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{tile.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{tile.title}</p>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => handleVisibilityChange(tile.id, 'public')}
                          className={`px-2 py-1 text-xs rounded ${currentVisibility === 'public'
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                        >
                          Public
                        </button>
                        <button
                          onClick={() => handleVisibilityChange(tile.id, 'authenticated')}
                          className={`px-2 py-1 text-xs rounded ${currentVisibility === 'authenticated'
                            ? 'bg-blue-200 dark:bg-blue-700 text-blue-900 dark:text-blue-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                            }`}
                        >
                          Protected
                        </button>
                        <button
                          onClick={() => handleVisibilityChange(tile.id, 'private')}
                          className={`px-2 py-1 text-xs rounded ${currentVisibility === 'private'
                            ? 'bg-red-200 dark:bg-red-700 text-red-900 dark:text-red-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30'
                            }`}
                        >
                          Private
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side - Private and Protected Sections */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Protected (Authenticated) Section */}
          <div className="flex-1 border-b border-slate-200 dark:border-slate-700 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                Protected (Authenticated) - {authenticatedTiles.length} tile(s)
              </h3>
              <button
                onClick={handleMakeAllProtected}
                className="px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                Make All Protected
              </button>
            </div>
            <div className="space-y-3">
              {authenticatedTiles.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No protected tiles</p>
              ) : (
                authenticatedTiles.map(tile => (
                  <div key={tile.id} className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">{tile.emoji}</span>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{tile.title}</p>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Visible to all authenticated users
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Private Section */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Private - {privateTiles.length} tile(s)
                </h3>
                <div className="relative">
                  <button
                    onClick={() => setShowBulkUserSelection(!showBulkUserSelection)}
                    className="px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    Make All Private
                  </button>
                  {showBulkUserSelection && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 min-w-[200px] max-h-64 overflow-y-auto">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Select Users:</p>
                      <div className="space-y-1 mb-3">
                        {users.map(user => (
                          <label key={user.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={bulkPrivateSelectedUsers.includes(user.id)}
                              onChange={() => handleBulkUserToggle(user.id)}
                              className="rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500"
                            />
                            <span>{user.username}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          onClick={handleMakeAllPrivate}
                          disabled={bulkPrivateSelectedUsers.length === 0}
                          className="flex-1 px-2 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => setShowBulkUserSelection(false)}
                          className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {privateTiles.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No private tiles</p>
              ) : (
                privateTiles.map(tile => {
                  const allowedUsers = tileVisibility[tile.id]?.allowedUsers || [];
                  return (
                    <div key={tile.id} className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-lg">{tile.emoji}</span>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{tile.title}</p>
                      </div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Allowed Users:</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {users.map(user => (
                          <label key={user.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-white dark:hover:bg-slate-800 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={allowedUsers.includes(user.id)}
                              onChange={() => handleUserToggle(tile.id, user.id)}
                              className="rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500"
                            />
                            <span>{user.username}</span>
                          </label>
                        ))}
                      </div>
                      {allowedUsers.length === 0 && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2 italic">
                          ⚠️ No users selected - tile will not be visible to anyone
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

// Category Component (no longer sortable via drag)
interface CategoryProps {
  categoryName: string;
  tileCount: number;
  isAuthenticated: boolean;
  groupIndex: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: React.ReactNode;
  onDeleteCategory?: (categoryName: string) => void;
  onArchiveCategory?: (categoryName: string) => void;
  onSaveCategoryOrder?: () => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  onExportCategory?: (categoryName: string) => void;
  onImportCategory?: (categoryName: string) => void;
  onCloneCategory?: (categoryName: string) => void;
  onToggleCategoryFavorite?: (categoryName: string) => void;
  isCategoryFavorited?: boolean;
  onPermanentDeleteCategory?: (categoryName: string) => void;
  isRecycleBin?: boolean;
  isArchive?: boolean;
  onScheduleCategory?: (categoryName: string) => void;
  onUnarchiveCategory?: (categoryName: string) => void;
  onManageVisibility?: (categoryName: string) => void;
  onShowCategoryInfo?: (categoryName: string, tiles: Tile[]) => void;
  categoryTiles?: Tile[];
  animationClass?: string;
}

const Category: React.FC<CategoryProps> = ({
  categoryName,
  tileCount,
  isAuthenticated,
  groupIndex,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  children,
  onDeleteCategory,
  onArchiveCategory,
  onSaveCategoryOrder,
  onRenameCategory,
  onExportCategory,
  onImportCategory,
  onCloneCategory,
  onToggleCategoryFavorite,
  isCategoryFavorited = false,
  onPermanentDeleteCategory,
  isRecycleBin = false,
  isArchive = false,
  onScheduleCategory,
  onUnarchiveCategory,
  onManageVisibility,
  onShowCategoryInfo,
  categoryTiles = [],
  animationClass
}) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(categoryName);

  // Update editedName when categoryName changes (e.g., after rename)
  useEffect(() => {
    setEditedName(categoryName);
  }, [categoryName]);

  const handleSave = () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== categoryName && onRenameCategory) {
      onRenameCategory(categoryName, trimmedName);
    }
    setIsEditing(false);
    setEditedName(categoryName);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedName(categoryName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const categoryAnimationDelay = groupIndex * 100;

  return (
    <div
      className={`linknest-category linknest-category-animated ${animationClass}`}
      style={{ animationDelay: `${categoryAnimationDelay}ms` }}
    >
      {/* Category Header with Arrow Buttons */}
      <div className="flex items-center gap-2 mb-3 group/category rounded-lg transition-colors">
        {isAuthenticated && (onMoveUp || onMoveDown) && (
          <div className="opacity-0 group-hover/category:opacity-100 transition-opacity flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveUp && canMoveUp) {
                  onMoveUp();
                }
              }}
              disabled={!canMoveUp}
              className={`p-1 rounded-md transition-all ${canMoveUp
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move category up"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveDown && canMoveDown) {
                  onMoveDown();
                }
              }}
              disabled={!canMoveDown}
              className={`p-1 rounded-md transition-all ${canMoveDown
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move category down"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              autoFocus
              className="flex-1 px-2 py-1 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide bg-white dark:bg-slate-800 border border-brand-500 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              className="p-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Save"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
              }}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
              title="Cancel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <h2 className="linknest-category-header text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{categoryName}</h2>
            {isAuthenticated && onRenameCategory && user?.is_admin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
                title="Edit category name"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
              </button>
            )}
          </>
        )}
        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {tileCount}
        </span>
        {onShowCategoryInfo && categoryTiles.length > 0 && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowCategoryInfo(categoryName, categoryTiles);
            }}
            className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all ml-1"
            title="Show category information"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <div className="h-px bg-slate-200 dark:border-slate-700 flex-1"></div>

        {/* Save Order Button (only visible for authenticated users) */}
        {isAuthenticated && onSaveCategoryOrder && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSaveCategoryOrder();
            }}
            className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded-md transition-all ml-2 flex items-center gap-1"
            title="Save tile order"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium hidden sm:inline">Save Order</span>
          </button>
        )}

        {isAuthenticated && (
          <>
            {isRecycleBin && onPermanentDeleteCategory ? (
              // Show permanent delete button in recycle bin
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPermanentDeleteCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all ml-2"
                title="Permanently delete category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
            ) : onDeleteCategory ? (
              // Show regular delete button (moves to recycle bin)
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to delete the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will move ${tileCount} tile(s) to the recycle bin.` : ''}`)) {
                    onDeleteCategory(categoryName);
                  }
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all ml-2"
                title="Delete category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}
            {isArchive && onUnarchiveCategory && (
              // Show restore category button in archive
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to restore the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will restore ${tileCount} tile(s) from the archive.` : ''}`)) {
                    onUnarchiveCategory(categoryName);
                  }
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-all ml-2"
                title="Restore category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onArchiveCategory && !isRecycleBin && !isArchive && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to archive the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will move ${tileCount} tile(s) to the archive.` : ''}`)) {
                    onArchiveCategory(categoryName);
                  }
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-md transition-all ml-2"
                title="Archive category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                  <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.22a.75.75 0 011.06 0L10 10.94l1.72-1.22a.75.75 0 111.06 1.06L11 12.06l1.72 1.22a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.22a.75.75 0 01-1.06-1.06L9 12.06l-1.72-1.22a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onExportCategory && user?.is_admin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onExportCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-all ml-1"
                title="Export this category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3.75 2.75A.75.75 0 014.5 2h11a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0V4.56l-4.72 4.72a.75.75 0 01-1.06 0L5.25 4.56v9.69h3.5a.75.75 0 010 1.5h-4.25a.75.75 0 01-.75-.75v-12z" />
                  <path d="M12.75 10.75a.75.75 0 00-1.5 0v3.44l-1.72-1.72a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25a.75.75 0 10-1.06-1.06l-1.72 1.72v-3.44z" />
                </svg>
              </button>
            )}
            {onImportCategory && user?.is_admin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onImportCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-all ml-1"
                title="Import tiles/spaces to this category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M9.25 3.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  <path fillRule="evenodd" d="M2 9a7 7 0 0112.452-4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9zm14.25 0a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onCloneCategory && user?.is_admin && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloneCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-md transition-all ml-1"
                title="Clone this category with all tiles/spaces"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                  <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                </svg>
              </button>
            )}
            {onScheduleCategory && user?.is_admin && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onScheduleCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-md transition-all ml-1"
                title="Schedule category availability"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onManageVisibility && user?.is_admin && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onManageVisibility(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-all ml-1"
                title="Manage tile visibility (private/authenticated)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onToggleCategoryFavorite && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCategoryFavorite(categoryName);
                }}
                className={`opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 rounded-md transition-all ml-1 ${isCategoryFavorited
                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                  : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                  }`}
                title={isCategoryFavorited ? 'Remove all tiles from favorites' : 'Add all tiles to favorites'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={isCategoryFavorited ? 'currentColor' : 'none'} stroke="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Category Content (tiles grid) */}
      {children}
    </div>
  );
};

// Sortable Tile Component
interface SortableTileProps {
  tile: Tile;
  isAuthenticated: boolean;
  onTileClick: (tileId: string) => void;
  onDeleteTile: (e: React.MouseEvent, tileId: string) => void;
  onEditTile?: (tile: Tile) => void;
  onCloneTile?: (e: React.MouseEvent, tileId: string) => void;
  onToggleFavorite?: (tileId: string) => void;
  onMoveToCategory?: (tileId: string, categoryName: string) => void;
  onMoveLeft?: (tileId: string) => void;
  onMoveRight?: (tileId: string) => void;
  onExportTile?: (tile: Tile) => void;
  onRestoreTile?: (e: React.MouseEvent, tileId: string) => void;
  onPermanentDeleteTile?: (e: React.MouseEvent, tileId: string) => void;
  onArchiveTile?: (e: React.MouseEvent, tileId: string) => void;
  onUnarchiveTile?: (e: React.MouseEvent, tileId: string) => void;
  onShowTileInfo?: (tile: Tile) => void;
  isRecycleBin?: boolean;
  isArchive?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  availableCategories: string[];
  groupIndex: number;
  tileIndex: number;
  animationClass?: string;
}

const SortableTile: React.FC<SortableTileProps> = ({
  tile,
  isAuthenticated,
  onTileClick,
  onDeleteTile,
  onEditTile,
  onCloneTile,
  onToggleFavorite,
  onMoveToCategory,
  onMoveLeft,
  onMoveRight,
  onExportTile,
  onRestoreTile,
  onPermanentDeleteTile,
  onArchiveTile,
  onUnarchiveTile,
  onShowTileInfo,
  isRecycleBin = false,
  isArchive = false,
  canMoveLeft = false,
  canMoveRight = false,
  availableCategories,
  groupIndex,
  tileIndex,
  animationClass = ''
}) => {
  const { user } = useAuth();
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  // Helper function to strip formatting characters for plain text display (tooltips, etc.)
  const stripFormatting = (content: string): string => {
    // Remove bold markers: **text** or *text*
    let plainText = content.replace(/\*\*(.*?)\*\*/g, '$1');
    plainText = plainText.replace(/\*([^*]+)\*/g, '$1');
    // Remove italic markers: _text_
    plainText = plainText.replace(/_([^_]+)_/g, '$1');
    return plainText;
  };

  // Helper function to parse URLs and render clickable links with formatting
  const renderMessageContent = (content: string) => {
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    // Bold pattern: **text**
    const boldPattern = /(\*\*)(.*?)\1/g;
    // Italic pattern: _text_ (not already part of bold)
    const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

    let processedContent = content;

    // Process bold text first
    processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');

    // Process italic text (avoid conflicts with bold)
    processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

    // Split by URLs to process them separately
    const parts = processedContent.split(urlPattern);

    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold hover:opacity-80 transition-opacity inherit"
            style={{ color: 'inherit' }}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];
  const linkCount = tile.isHyperlink ? 0 : (() => {
    const uniqueLinks = new Set<string>();
    const processLink = (link: any) => {
      const key = `${(link.label || '').toLowerCase()}|${(link.url || '').toLowerCase()}`;
      uniqueLinks.add(key);
    };

    if (tile.tabs && tile.tabs.length > 0) {
      tile.tabs.forEach(tab => {
        tab.sections?.forEach(section => {
          section.links?.forEach(processLink);
        });
      });
    } else {
      tile.sections?.forEach(section => {
        section.links?.forEach(processLink);
      });
    }
    return uniqueLinks.size;
  })();

  const activeMessages = (tile.messages?.filter(m => m.isActive && (!m.startDate || new Date(m.startDate) <= new Date()) && (!m.endDate || new Date(m.endDate) >= new Date()) && (m.displayLocation === 'tile' || m.displayLocation === 'both' || !m.displayLocation)) || []).sort((a, b) => (a.priority || 0) - (b.priority || 0));

  // Helper function to get animation class based on animation type
  const getMessageAnimationClass = (animationType?: string) => {
    if (!animationType || animationType === 'rollover' || animationType === 'still') return '';
    return `message-animate-${animationType}`;
  };

  // Get animation duration in seconds based on animation type
  const getAnimationDuration = (animationType?: string): number => {
    if (animationType === 'still') return 0; // No animation duration for still
    const durations: Record<string, number> = {
      'flash': 1.5,
      'flip-horizontal': 2,
      'flip-vertical': 2,
      'bounce': 2,
      'pulse': 2,
      'shake': 1,
      'fade': 2,
      'slide': 3
    };
    return durations[animationType || ''] || 2;
  };

  // Cycle through messages sequentially for non-rollover animations
  useEffect(() => {
    if (activeMessages.length <= 1) {
      setCurrentMessageIndex(0);
      return;
    }

    // Check if any message uses non-rollover animation (including 'still')
    const hasNonRollover = activeMessages.some(msg => msg.animationType && msg.animationType !== 'rollover');
    if (!hasNonRollover) {
      // All messages are rollover - don't cycle
      setCurrentMessageIndex(0);
      return;
    }

    // Get current message
    const currentMsg = activeMessages[currentMessageIndex];
    if (!currentMsg || currentMessageIndex >= activeMessages.length) {
      setCurrentMessageIndex(0);
      return;
    }

    const animationType = currentMsg.animationType || 'rollover';

    // Calculate duration: animation duration + delay before next message
    const animationDuration = animationType === 'rollover' ? 0 : getAnimationDuration(animationType);
    const delayBefore = currentMsg.delayBefore || 0;
    // For 'still' messages with no delay, use a default display duration (3 seconds)
    const displayDuration = animationType === 'still' && delayBefore === 0 ? 3 : (animationDuration + delayBefore);
    const totalDuration = displayDuration * 1000; // Convert to milliseconds

    // Only set timer if we have a duration (non-rollover)
    if (animationType === 'rollover' && totalDuration <= 0) {
      // Skip rollover messages immediately
      setCurrentMessageIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % activeMessages.length;
        return nextIndex;
      });
      return;
    }

    const timer = setTimeout(() => {
      setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % activeMessages.length);
    }, totalDuration);

    return () => clearTimeout(timer);
  }, [currentMessageIndex, activeMessages]);
  const activeMessagesCount = activeMessages.length;

  const currentCategory = tile.group || 'General';

  const animationDelay = (groupIndex * 80) + (tileIndex * 50);

  // Check if tile has local decoration (takes precedence over global)
  const hasLocalDecoration = !!(
    tile.tileBackgroundColor ||
    (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) ||
    (tile.tileBorderRadius !== undefined && tile.tileBorderRadius >= 0) ||
    tile.tileTextColor
  );

  // Build decoration styles (local decoration takes precedence)
  const decorationStyles: React.CSSProperties = {
    animationDelay: `${animationDelay}ms`,
  };

  // Apply local decoration if it exists, using CSS custom properties for !important override
  if (hasLocalDecoration) {
    // Background color or gradient (local takes precedence - use CSS variables)
    if (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) {
      // Build gradient with color positions
      const hasPositions = tile.tileGradientColorPositions && tile.tileGradientColorPositions.length === tile.tileGradientColors.length;
      const gradientStops = tile.tileGradientColors.map((color, i) => {
        if (hasPositions) {
          return `${color} ${tile.tileGradientColorPositions![i]}%`;
        }
        return color;
      }).join(', ');

      let gradientValue = '';
      const angle = typeof tile.tileGradientDirection === 'number' ? tile.tileGradientDirection : (typeof tile.tileGradientDirection === 'string' ? parseInt(tile.tileGradientDirection.replace('deg', '')) || 90 : 90);

      if (tile.tileGradientType === 'linear' || tile.tileGradientType === 'repeating-linear') {
        const prefix = tile.tileGradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
        gradientValue = `${prefix}(${angle}deg, ${gradientStops})`;
      } else if (tile.tileGradientType === 'radial' || tile.tileGradientType === 'repeating-radial') {
        const prefix = tile.tileGradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
        gradientValue = `${prefix}(circle, ${gradientStops})`;
      } else if (tile.tileGradientType === 'conic' || tile.tileGradientType === 'repeating-conic') {
        const prefix = tile.tileGradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
        gradientValue = `${prefix}(from ${angle}deg, ${gradientStops})`;
      }
      // Set as CSS custom property so it can override !important rules
      decorationStyles['--tile-local-background-image' as any] = gradientValue;
      decorationStyles.backgroundImage = gradientValue;
      decorationStyles.background = gradientValue;
      decorationStyles.backgroundColor = 'transparent';
    } else if (tile.tileBackgroundColor) {
      decorationStyles['--tile-local-background' as any] = tile.tileBackgroundColor;
      decorationStyles.backgroundColor = tile.tileBackgroundColor;
      decorationStyles.background = tile.tileBackgroundColor;
      decorationStyles.backgroundImage = 'none'; // Explicitly clear any background images
    } else {
      // If no background is set locally, don't set CSS variables (let global styles apply)
      // But we still mark it as having local decoration if other properties are set
    }

    // Border radius (local takes precedence) - always apply if defined
    if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius !== null) {
      decorationStyles['--tile-local-border-radius' as any] = `${tile.tileBorderRadius}px`;
      decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
    }

    // Text color (local takes precedence) - always apply if defined
    if (tile.tileTextColor) {
      decorationStyles['--tile-local-text-color' as any] = tile.tileTextColor;
      decorationStyles.color = tile.tileTextColor;
    }
  }

  // Split animation class - only apply decoration class if no local decoration
  // Extract just the animation class (remove decoration class if local decoration exists)
  let finalAnimationClass = animationClass || '';
  if (hasLocalDecoration && animationClass) {
    // Remove decoration classes from animationClass, keep only animation classes
    const decorationClasses = ['tile-decor-christmas', 'tile-decor-thanksgiving', 'tile-decor-veterans',
      'tile-decor-halloween', 'tile-decor-new-year', 'tile-decor-valentine', 'tile-decor-st-patrick',
      'tile-decor-easter', 'tile-decor-birthday', 'tile-decor-party', 'tile-decor-snow',
      'tile-decor-autumn', 'tile-decor-spring', 'tile-decor-summer'];

    const classParts = animationClass.split(' ').filter(cls => {
      // Keep animation classes, remove decoration classes
      return !decorationClasses.some(decClass => cls.includes(decClass));
    });
    finalAnimationClass = classParts.join(' ');
  }

  const tileAnimatedClass = finalAnimationClass ? 'linknest-tile-animated' : '';

  // Use default border class
  const borderClass = 'border border-slate-200 dark:border-slate-700/50 hover:border-brand-300 dark:hover:border-brand-500/50';

  return (
    <div
      style={decorationStyles}
      onClick={() => onTileClick(tile.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTileClick(tile.id);
        }
      }}
      className={`
        linknest-tile ${hasLocalDecoration ? 'has-local-decoration' : ''} ${tileAnimatedClass} ${finalAnimationClass} group relative ${!hasLocalDecoration || (tile.tileBorderRadius === undefined) ? 'rounded-xl' : ''} ${borderClass}
        transition-all duration-200 
        flex flex-col h-full min-h-[140px] cursor-pointer
      `}
    >

      {/* Compact Header */}
      <div className="flex items-start justify-between mb-3">
        <div className={`
          w-10 h-10 rounded-lg ${styles.soft} flex items-center justify-center text-lg 
          border ${styles.border} group-hover:scale-105 transition-transform duration-200
        `}>
          {tile.emoji}
        </div>
        <div className={`${isAuthenticated ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity flex items-center gap-1`}>
          {isAuthenticated && (
            <>
              {/* Category Selector */}
              {onMoveToCategory && (user?.is_admin || tile.visibility === 'private') && (
                <>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowCategoryDialog(true);
                    }}
                    className="p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
                    title="Move to category"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zm0-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM9 12a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0V12z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Move to Category Dialog */}
                  {showCategoryDialog && createPortal(
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCategoryDialog(false)}>
                      <div
                        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#333] flex items-center justify-between bg-slate-50 dark:bg-[#252525]">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-500/10 text-brand-500">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zm0-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM9 12a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0V12z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div>
                              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Move to Category</h2>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{tile.title || 'Untitled Tile'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowCategoryDialog(false)}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-500"
                          >
                            <FaTimes size={18} />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                            Select Category
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {availableCategories.map((category) => (
                              <button
                                key={category}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (category !== currentCategory && onMoveToCategory) {
                                    onMoveToCategory(tile.id, category);
                                  }
                                  setShowCategoryDialog(false);
                                }}
                                className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all ${category === currentCategory
                                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 ring-2 ring-blue-500'
                                  : 'bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-200 dark:border-[#333]'
                                  }`}
                              >
                                {category}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#252525] flex justify-end">
                          <button
                            onClick={() => setShowCategoryDialog(false)}
                            className="px-5 py-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-300 dark:border-[#444] font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </>
              )}

              {/* Favorite Button - Hide in recycle bin */}
              {onToggleFavorite && !isRecycleBin && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(tile.id);
                  }}
                  className={`p-1 rounded transition-all ${tile.isFavorite
                    ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                    : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                    }`}
                  title={tile.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={tile.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          )}
          {/* Favorite Button for Public Users - Always visible */}
          {!isAuthenticated && onToggleFavorite && !isRecycleBin && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(tile.id);
              }}
              className={`p-1 rounded transition-all ${isPublicFavorite(tile.id)
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                }`}
              title={isPublicFavorite(tile.id) ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={isPublicFavorite(tile.id) ? 'currentColor' : 'none'} stroke="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Info Button - Show if user has canViewTileInfo permission (tile admins) or can view tile (non-admins) */}
          {onShowTileInfo && (tile.canViewTileInfo !== false && (tile.canViewTileInfo === true || tile.canView === true)) && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShowTileInfo(tile);
              }}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all"
              title="Show tile information"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Edit Button - Only show if user has explicit edit permission AND canEditTile permission */}
          {onEditTile && tile.canEdit === true && (tile.canEditTile === undefined || tile.canEditTile === true) && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEditTile(tile);
              }}
              className="p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
              title="Edit"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
            </button>
          )}


          {/* Clone Button - Only show if user has edit permission and canCloneTile permission */}
          {onCloneTile && tile.canEdit && tile.canCloneTile === true && (
            <button
              onClick={(e) => onCloneTile(e, tile.id)}
              className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Clone"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            </button>
          )}


          {/* Export Button - Only show if user is admin */}
          {onExportTile && user?.is_admin && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onExportTile(tile);
              }}
              className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Export this tile/space"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.75 2.75A.75.75 0 014.5 2h11a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0V4.56l-4.72 4.72a.75.75 0 01-1.06 0L5.25 4.56v9.69h3.5a.75.75 0 010 1.5h-4.25a.75.75 0 01-.75-.75v-12z" />
                <path d="M12.75 10.75a.75.75 0 00-1.5 0v3.44l-1.72-1.72a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25a.75.75 0 10-1.06-1.06l-1.72 1.72v-3.44z" />
              </svg>
            </button>
          )}


          {/* Delete/Restore Button */}
          {isRecycleBin && onRestoreTile ? (
            // Show restore and permanent delete buttons in recycle bin
            <>
              <button
                onClick={(e) => onRestoreTile(e, tile.id)}
                className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
                title="Restore"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                </svg>
              </button>
              {onPermanentDeleteTile && (
                <button
                  onClick={(e) => onPermanentDeleteTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title="Permanently Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          ) : isArchive ? (
            // Show restore, delete, and remove favorite buttons in archive
            <>
              {onUnarchiveTile && (
                <button
                  onClick={(e) => onUnarchiveTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
                  title="Restore"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {tile.canDelete === true && onDeleteTile && (
                <button
                  onClick={(e) => onDeleteTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title="Delete (Move to Recycle Bin)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {onToggleFavorite && tile.isFavorite && (
                <button
                  onClick={() => onToggleFavorite(tile.id)}
                  className="p-1 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-all"
                  title="Remove Favorite"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          ) : tile.canDelete === true ? (
            // Show delete and archive buttons if user has explicit delete permission
            <>
              {onDeleteTile && (
                <button
                  onClick={(e) => onDeleteTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {onArchiveTile && (
                <button
                  onClick={(e) => onArchiveTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-all"
                  title="Archive"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                    <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.22a.75.75 0 011.06 0L10 10.94l1.72-1.22a.75.75 0 111.06 1.06L11 12.06l1.72 1.22a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.22a.75.75 0 01-1.06-1.06L9 12.06l-1.72-1.22a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Compact Title and Description */}
      <div className="flex-1 mb-3">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 mb-1.5 ${styles.text} group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors`}>
          {tile.title}
        </h3>
        <p className="text-slate-600 dark:text-slate-400 text-xs line-clamp-2 leading-snug">
          {tile.description || 'No description'}
        </p>
      </div>

      {/* Compact Footer */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
        {!tile.isHyperlink && (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${styles.text}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
              <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
            </svg>
            <span>{linkCount}</span>
          </div>
        )}
        {tile.isHyperlink && <div></div>}

        {/* Center Rolling Message */}
        {activeMessages.length > 0 && (
          <div
            className={`group/message absolute bottom-1 left-0 right-0 transition-all cursor-help ${!tile.isHyperlink ? 'pl-[60px]' : ''} ${!activeMessages[0].textColor ? (
              activeMessages[0].type === 'alert' ? 'text-amber-600 dark:text-amber-400' :
                activeMessages[0].type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                  activeMessages[0].type === 'celebration' ? 'text-pink-600 dark:text-pink-400' :
                    'text-brand-600 dark:text-brand-400'
            ) : ''}`}
            style={activeMessages[0].textColor ? {
              // Only set color on parent if custom color is set, to override tile text color
              color: activeMessages[0].textColor
            } : undefined}
          >
            {/* Custom Instant Tooltip - Optimized for Small Tiles */}
            <div
              className="tooltip-force-black absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-yellow-400 text-[10px] rounded-lg shadow-xl opacity-0 translate-y-2 group-hover/message:opacity-100 group-hover/message:translate-y-0 transition-all duration-200 pointer-events-none z-[100] border border-yellow-500 w-max max-w-[180px] text-left"
            >
              {activeMessages.map((m, idx) => (
                <div key={m.id} className="last:mb-0 mb-1 leading-tight">
                  {activeMessages.length > 1 && <span className="opacity-50 mr-1">{idx + 1}.</span>}
                  {stripFormatting(m.content)}
                </div>
              ))}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-yellow-400"></div>
            </div>

            {(() => {
              // Check if all messages use rollover animation
              const allRollover = activeMessages.length > 0 && activeMessages.every(msg => !msg.animationType || msg.animationType === 'rollover');

              if (allRollover) {
                // Rollover animation - use marquee with seamless duplication
                // Note: Delays are not applied in rollover mode to maintain seamless loop
                return (
                  <div className="overflow-hidden">
                    <div className="animate-rolling-tile flex items-center gap-10 text-[10px] sm:text-xs font-semibold">
                      {/* First set of messages */}
                      {activeMessages.map((msg, idx) => (
                        <div
                          key={`${msg.id}-${idx}`}
                          className="flex items-center gap-2 shrink-0"
                          style={{
                            ...(msg.textColor ? { '--message-text-color': msg.textColor, color: msg.textColor } : {}),
                            fontStyle: msg.fontStyle === 'italic' || msg.fontStyle === 'bold italic' ? 'italic' : undefined,
                            fontWeight: msg.fontStyle === 'bold' || msg.fontStyle === 'bold italic' ? 'bold' : undefined
                          } as React.CSSProperties}
                          data-message-color={msg.textColor || ''}
                        >
                          {renderMessageContent(msg.content)}
                        </div>
                      ))}
                      {/* Duplicate set for seamless loop - no delays, exact copy */}
                      {activeMessages.map((msg, idx) => (
                        <div
                          key={`${msg.id}-dup-${idx}`}
                          className="flex items-center gap-2 shrink-0"
                          style={{
                            ...(msg.textColor ? { '--message-text-color': msg.textColor, color: msg.textColor } : {}),
                            fontStyle: msg.fontStyle === 'italic' || msg.fontStyle === 'bold italic' ? 'italic' : undefined,
                            fontWeight: msg.fontStyle === 'bold' || msg.fontStyle === 'bold italic' ? 'bold' : undefined
                          } as React.CSSProperties}
                          data-message-color={msg.textColor || ''}
                        >
                          {renderMessageContent(msg.content)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } else {
                // Other animations - show one message at a time, cycle through them
                const currentMsg = activeMessages[currentMessageIndex] || activeMessages[0];

                if (!currentMsg) {
                  return null;
                }

                const currentAnimationType = currentMsg.animationType || 'rollover';
                const animationClass = getMessageAnimationClass(currentAnimationType);

                return (
                  <div className={`flex items-center gap-2 text-[10px] sm:text-xs font-semibold ${animationClass}`}>
                    <div
                      key={`${currentMsg.id}-current`}
                      style={{
                        ...(currentMsg.textColor ? { '--message-text-color': currentMsg.textColor, color: currentMsg.textColor } : {}),
                        fontStyle: currentMsg.fontStyle === 'italic' || currentMsg.fontStyle === 'bold italic' ? 'italic' : undefined,
                        fontWeight: currentMsg.fontStyle === 'bold' || currentMsg.fontStyle === 'bold italic' ? 'bold' : undefined
                      } as React.CSSProperties}
                      data-message-color={currentMsg.textColor || ''}
                    >
                      {renderMessageContent(currentMsg.content)}
                    </div>
                  </div>
                );
              }
            })()}
          </div>
        )}

        {/* Reorder Buttons */}

        {/* Arrow Buttons for Reordering - Centered at bottom, only visible for authenticated users */}
        {isAuthenticated && (onMoveLeft || onMoveRight) ? (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-10">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveLeft && canMoveLeft) {
                  onMoveLeft(tile.id);
                }
              }}
              disabled={!canMoveLeft}
              className={`p-1 rounded-md transition-all ${canMoveLeft
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveRight && canMoveRight) {
                  onMoveRight(tile.id);
                }
              }}
              disabled={!canMoveRight}
              className={`p-1 rounded-md transition-all ${canMoveRight
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move right"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="text-slate-300 dark:text-slate-600 group-hover:text-brand-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

type TabType = 'favorites' | 'public' | 'public-favorites' | 'your-apps' | 'private' | 'scheduled' | 'expired' | 'archive' | 'recycle-bin' | 'monitoring';

export const TileGrid: React.FC<TileGridProps> = ({
  tiles,
  onUpdateTiles,
  onCreateTile,
  onDeleteTile,
  onCloneTile,
  isAuthenticated = false,
  onAuthRequired,
  darkMode = false,
  toggleTheme = () => { },
  onHelpClick = () => { }
}) => {
  const { settings } = useSettings();
  const { user } = useAuth();
  const isMobile = useMobile(768); // Use mobile view below 768px width

  // Store allowed tabs based on user's roles
  const [allowedTabsByRole, setAllowedTabsByRole] = useState<Set<string>>(new Set());
  const [allowedTabsLoading, setAllowedTabsLoading] = useState(false);

  const disabledAppTabs = useMemo(() => getDisabledTabsFromSettings(settings), [settings?.disabled_tabs]);

  // Check if user has roles - if yes, check role permissions; if no, use global settings only
  const isTabDisabledBySettings = useCallback((tab: TabType) => {
    // First check global settings - if disabled globally, hide from everyone
    const disabledGlobally = (() => {
      if (tab === 'favorites' || tab === 'public-favorites') return disabledAppTabs.has('favorites');
      if (tab === 'public') return disabledAppTabs.has('public');
      if (tab === 'your-apps') return disabledAppTabs.has('your-apps');
      if (tab === 'private') return disabledAppTabs.has('private');
      if (tab === 'scheduled') return disabledAppTabs.has('scheduled');
      if (tab === 'expired') return disabledAppTabs.has('expired');
      if (tab === 'archive') return disabledAppTabs.has('archive');
      if (tab === 'recycle-bin') return disabledAppTabs.has('recycle-bin');
      if (tab === 'monitoring') return disabledAppTabs.has('monitoring');
      return false;
    })();

    if (disabledGlobally) return true;

    // If user has roles, check role permissions
    if (isAuthenticated && user && allowedTabsByRole.size > 0) {
      // Convert TabType to the format stored in role_tab_permissions
      const tabIdMap: Record<TabType, string> = {
        'favorites': 'favorites',
        'public-favorites': 'favorites',
        'public': 'public',
        'your-apps': 'your-apps',
        'private': 'private',
        'scheduled': 'scheduled',
        'expired': 'expired',
        'archive': 'archive',
        'recycle-bin': 'recycle-bin',
        'monitoring': 'monitoring'
      };

      const tabId = tabIdMap[tab];
      // If tab not in allowedTabsByRole, hide it (role-based restriction)
      return !allowedTabsByRole.has(tabId);
    }

    // User has no roles or not authenticated - use global settings only
    return false;
  }, [disabledAppTabs, isAuthenticated, user, allowedTabsByRole]);

  const getFallbackTab = useCallback((): TabType | null => {
    const candidates: TabType[] = isAuthenticated
      ? ([
        'public',
        'your-apps',
        'favorites',
        'private',
        'scheduled',
        'expired',
        'archive',
        'recycle-bin',
        ...(isAuthenticated ? (['monitoring'] as TabType[]) : [])
      ] as TabType[])
      : (['public', 'public-favorites'] as TabType[]);

    for (const c of candidates) {
      // Auth restrictions
      const restrictedTabs: TabType[] = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
      if (!isAuthenticated && restrictedTabs.includes(c)) continue;
      if (isTabDisabledBySettings(c)) continue;
      return c;
    }
    return null;
  }, [isAuthenticated, user, isTabDisabledBySettings]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<Tile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [linkInfoDialog, setLinkInfoDialog] = useState<{ link: Link } | null>(null);
  const [tileInfoDialog, setTileInfoDialog] = useState<{ tile?: Tile; categoryInfo?: { categoryName: string; tiles: Tile[] } } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const saved = localStorage.getItem('linknest_active_tab');
      const validTabs = ['favorites', 'public', 'public-favorites', 'your-apps', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];

      if (saved && validTabs.includes(saved)) {
        // If not authenticated, force public-accessible tabs only
        // monitoring tab is admin only (checked in useEffect)
        const restrictedTabs = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
        if (!isAuthenticated && restrictedTabs.includes(saved)) {
          return 'public';
        }
        return saved as TabType;
      }
    } catch (e) {
      console.error('Failed to load active tab', e);
    }
    return 'public';
  });

  const requestTab = useCallback((tab: TabType) => {
    if (isTabDisabledBySettings(tab)) {
      const fallback = getFallbackTab();
      if (fallback) setActiveTab(fallback);
      return;
    }
    // Preserve existing auth rules
    const restrictedTabs: TabType[] = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
    if (!isAuthenticated && restrictedTabs.includes(tab)) {
      setActiveTab('public');
      return;
    }
    setActiveTab(tab);
  }, [getFallbackTab, isAuthenticated, isTabDisabledBySettings, user]);

  // If the current tab becomes disabled (or unauthorized), fall back to the first allowed tab
  useEffect(() => {
    const restrictedTabs: TabType[] = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
    const unauthorized = (!isAuthenticated && restrictedTabs.includes(activeTab));
    const disabled = isTabDisabledBySettings(activeTab);

    if (unauthorized || disabled) {
      const fallback = getFallbackTab();
      if (fallback && fallback !== activeTab) {
        setActiveTab(fallback);
      }
    }
  }, [activeTab, getFallbackTab, isAuthenticated, isTabDisabledBySettings, user]);

  // Persist active tab changes
  useEffect(() => {
    try {
      localStorage.setItem('linknest_active_tab', activeTab);
    } catch (e) {
      console.error('Failed to save active tab', e);
    }
  }, [activeTab]);

  // Listen for external tab switch events (e.g. from footer)
  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      const tab = e.detail as TabType;
      const validTabs: TabType[] = ['favorites', 'public', 'public-favorites', 'your-apps', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];

      if (tab && validTabs.includes(tab)) {
        if (isTabDisabledBySettings(tab)) {
          const fallback = getFallbackTab();
          if (fallback) setActiveTab(fallback);
          return;
        }
        // Handle guest vs auth favorites
        if (tab === 'favorites' && !isAuthenticated) {
          setActiveTab('public-favorites');
        } else if (tab === 'public-favorites' && isAuthenticated) {
          setActiveTab('favorites');
        } else {
          // Check restricted tabs
          const restrictedTabs = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
          if (!isAuthenticated && restrictedTabs.includes(tab)) {
            setActiveTab('public');
          } else {
            setActiveTab(tab);
          }
        }
        // Scroll to top when switching tabs
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener('switchTab', handleSwitchTab);
    return () => window.removeEventListener('switchTab', handleSwitchTab);
  }, [getFallbackTab, isAuthenticated, isTabDisabledBySettings, user]);

  // Fetch allowed tabs based on user's roles when authenticated
  useEffect(() => {
    if (isAuthenticated && user && !user.is_admin) {
      // Only check role permissions for non-admin users
      // Admins can see all tabs (unless disabled globally)
      setAllowedTabsLoading(true);
      rolesService.getCurrentUserAllowedTabs()
        .then(tabs => {
          setAllowedTabsByRole(new Set(tabs));
        })
        .catch(err => {
          console.error('Failed to fetch allowed tabs:', err);
          // If fetch fails, allow all tabs (fallback to global settings)
          setAllowedTabsByRole(new Set());
        })
        .finally(() => {
          setAllowedTabsLoading(false);
        });
    } else {
      // Not authenticated, admin, or no user - clear role-based restrictions
      setAllowedTabsByRole(new Set());
    }
  }, [isAuthenticated, user]);

  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [publicFavorites, setPublicFavorites] = useState<string[]>([]);
  const [recycleBinTiles, setRecycleBinTiles] = useState<Tile[]>([]);
  const [isLoadingRecycleBin, setIsLoadingRecycleBin] = useState(false);
  const [archiveTiles, setArchiveTiles] = useState<Tile[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [favoriteLinks, setFavoriteLinks] = useState<FavoriteLink[]>([]);
  const [isLoadingFavoriteLinks, setIsLoadingFavoriteLinks] = useState(false);
  const [favLinksSort, setFavLinksSort] = useState<'default' | 'asc'>('default');
  const [linkHealthResults, setLinkHealthResults] = useState<Map<string, LinkHealthCheckResult>>(new Map());
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // Default 30s
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState<number>(30);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import progress state
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
    errors: string[];
  } | null>(null);

  // Export progress state
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
    status: string;
    errors: string[];
  } | null>(null);

  // Delete category progress state
  const [deleteCategoryProgress, setDeleteCategoryProgress] = useState<{
    current: number;
    total: number;
    status: string;
    categoryName: string;
  } | null>(null);

  // New Tile Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newEmoji, setNewEmoji] = useState('📁');
  const [newColor, setNewColor] = useState<ThemeColor>('blue');
  const [newVisibility, setNewVisibility] = useState<TileVisibility>('public');
  const [visibleFrom, setVisibleFrom] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [newAllowedUsers, setNewAllowedUsers] = useState<number[]>([]);
  const [newAllowedGroups, setNewAllowedGroups] = useState<number[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserListItem[]>([]);
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: number; name: string; description: string | null; memberCount: number }>>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [visibilitySearchTerm, setVisibilitySearchTerm] = useState('');
  const [visibilityActiveTab, setVisibilityActiveTab] = useState<'users' | 'groups'>('users');

  // Hyperlink state
  const [tileType, setTileType] = useState<'space' | 'hyperlink'>('space');
  const [hyperlinkUrl, setHyperlinkUrl] = useState('');
  const [openInNewTab, setOpenInNewTab] = useState(true);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // View Mode State
  const [viewMode, setViewMode] = useState<'grid' | 'categories'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('viewMode');
      return (saved === 'grid' || saved === 'categories') ? saved : 'grid';
    }
    return 'grid';
  });

  // Persist viewMode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('viewMode', viewMode);
    }
  }, [viewMode]);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Edit Modal Tab State
  const [editModalActiveTab, setEditModalActiveTab] = useState<'general' | 'decoration' | 'messages'>('general');

  // Tile Decoration State
  const [tileBackgroundColor, setTileBackgroundColor] = useState<string>('');
  const [tileGradientEnabled, setTileGradientEnabled] = useState<boolean>(false);
  const [tileGradientColors, setTileGradientColors] = useState<string[]>(['#3b82f6', '#8b5cf6']);
  const [tileGradientColorPositions, setTileGradientColorPositions] = useState<number[]>([0, 100]);
  const [tileGradientDirection, setTileGradientDirection] = useState<number>(90); // Angle in degrees (0-360)
  const [tileGradientType, setTileGradientType] = useState<'linear' | 'radial' | 'conic' | 'repeating-linear' | 'repeating-radial' | 'repeating-conic'>('linear');
  const [tileBorderRadius, setTileBorderRadius] = useState<number>(12);
  const [tileTextColor, setTileTextColor] = useState<string>('');

  // Messages State
  const [messages, setMessages] = useState<TileMessage[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'warning' | 'celebration' | 'alert' | 'custom'>('info');
  const [messageStartDate, setMessageStartDate] = useState('');
  const [messageEndDate, setMessageEndDate] = useState('');
  const [messageIsActive, setMessageIsActive] = useState(true);
  const [messagePriority, setMessagePriority] = useState<number>(0);
  const [messageTextColor, setMessageTextColor] = useState<string>('');
  const [messageFontStyle, setMessageFontStyle] = useState<string>('normal');
  const [messageDisplayLocation, setMessageDisplayLocation] = useState<'tile' | 'detail' | 'both'>('both');
  const [messageAnimationType, setMessageAnimationType] = useState<'rollover' | 'still' | 'flash' | 'flip-horizontal' | 'flip-vertical' | 'bounce' | 'pulse' | 'shake' | 'fade' | 'slide'>('rollover');
  const [messageDelayBefore, setMessageDelayBefore] = useState<number>(0);

  // Helper function to get message status
  const getMessageStatus = (msg: TileMessage): 'active' | 'upcoming' | 'expired' => {
    const now = new Date();
    const startDate = msg.startDate ? new Date(msg.startDate) : null;
    const endDate = msg.endDate ? new Date(msg.endDate) : null;

    if (!msg.isActive) return 'expired';
    if (endDate && now > endDate) return 'expired';
    if (startDate && now < startDate) return 'upcoming';
    return 'active';
  };

  // Helper function to format date for datetime-local input
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Quick date preset handlers
  const setDatePreset = (preset: 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'thisMonth' | 'nextMonth', type: 'start' | 'end') => {
    const now = new Date();
    let targetDate = new Date();

    switch (preset) {
      case 'today':
        targetDate = new Date(now);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'tomorrow':
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'thisWeek':
        targetDate = new Date(now);
        const dayOfWeek = targetDate.getDay();
        const daysUntilMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        targetDate.setDate(targetDate.getDate() - daysUntilMonday);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'nextWeek':
        targetDate = new Date(now);
        const currentDayOfWeek = targetDate.getDay();
        const daysUntilNextMonday = currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
        targetDate.setDate(targetDate.getDate() + daysUntilNextMonday);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'thisMonth':
        targetDate = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0, 0);
        break;
      case 'nextMonth':
        targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);
        break;
    }

    if (type === 'start') {
      setMessageStartDate(formatDateForInput(targetDate));
    } else {
      // For end dates, set to end of day
      targetDate.setHours(23, 59, 0, 0);
      setMessageEndDate(formatDateForInput(targetDate));
    }
  };

  // Helper function to parse URLs and render clickable links
  const renderMessageContent = (content: string) => {
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    // Bold pattern: **text** or *text*
    const boldPattern = /(\*\*)(.*?)\1/g;
    // Italic pattern: _text_ or *text* (not already bold)
    const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

    let processedContent = content;

    // Process bold text
    processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');

    // Process italic text (avoid conflicts with bold)
    processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

    // Process URLs
    const parts = processedContent.split(urlPattern);

    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  // Tile Animation & Decoration State
  const { animation: initialAnimation, decoration: initialDecoration } = useTileAnimation();
  const [currentAnimation, setCurrentAnimation] = useState<TileAnimation>(initialAnimation);
  const [currentDecoration, setCurrentDecoration] = useState<TileDecoration>(initialDecoration);

  // Sync with initial values when they load
  useEffect(() => {
    setCurrentAnimation(initialAnimation);
    setCurrentDecoration(initialDecoration);
  }, [initialAnimation, initialDecoration]);


  // Modal drag and resize state
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [modalSize, setModalSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const modalPositionRef = useRef({ x: 0, y: 0 });
  const modalSizeRef = useRef({ width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize modal size when it opens
  useEffect(() => {
    if (isModalOpen) {
      // Use a timeout to ensure the modal is rendered before measuring
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const rect = modalRef.current.getBoundingClientRect();
          if (modalSize.width === 0 && modalSize.height === 0) {
            // Set default size if not set
            const defaultWidth = Math.min(600, window.innerWidth - 40);
            const defaultHeight = Math.min(700, window.innerHeight - 40);
            const newSize = { width: defaultWidth, height: defaultHeight };
            setModalSize(newSize);
            modalSizeRef.current = newSize;
            // Center the modal
            const centerX = (window.innerWidth - defaultWidth) / 2;
            const centerY = (window.innerHeight - defaultHeight) / 2;
            const newPos = { x: centerX, y: centerY };
            setModalPosition(newPos);
            modalPositionRef.current = newPos;
          }
        }
      }, 10);
      return () => clearTimeout(timer);
    } else {
      // Reset position and size when modal closes
      setModalPosition({ x: 0, y: 0 });
      setModalSize({ width: 0, height: 0 });
      modalPositionRef.current = { x: 0, y: 0 };
      modalSizeRef.current = { width: 0, height: 0 };
    }
  }, [isModalOpen, modalSize.width, modalSize.height]);

  // Sync refs when state changes (when not dragging/resizing)
  useEffect(() => {
    if (!isDragging && !isResizing) {
      modalPositionRef.current = modalPosition;
      modalSizeRef.current = modalSize;
    }
  }, [modalPosition, modalSize, isDragging, isResizing]);

  // Drag handlers - optimized for smooth performance
  const handleDragStart = (e: React.MouseEvent) => {
    // Don't start dragging if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }
    e.stopPropagation();
    if (modalRef.current) {
      setIsDragging(true);
      // Calculate offset from mouse to current modal position
      // Use the current position from state/ref, not getBoundingClientRect
      const currentX = modalPositionRef.current.x || 0;
      const currentY = modalPositionRef.current.y || 0;

      dragStartRef.current = {
        x: e.clientX - currentX,
        y: e.clientY - currentY
      };
      modalSizeRef.current = { width: modalSize.width, height: modalSize.height };
    }
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !modalRef.current) return;

    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;

    // Update ref immediately
    modalPositionRef.current = { x: newX, y: newY };

    // Update DOM directly for smooth performance
    modalRef.current.style.left = `${newX}px`;
    modalRef.current.style.top = `${newY}px`;
    modalRef.current.style.position = 'absolute';
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    // Update state with final position
    setModalPosition(modalPositionRef.current);
    setIsDragging(false);
  }, []);

  // Resize handlers - optimized for smooth performance
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (modalRef.current) {
      setIsResizing(true);
      const rect = modalRef.current.getBoundingClientRect();
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height
      };
      modalPositionRef.current = { x: modalPosition.x, y: modalPosition.y };
    }
  };

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing || !modalRef.current) return;

    const deltaX = e.clientX - resizeStartRef.current.x;
    const deltaY = e.clientY - resizeStartRef.current.y;

    const minWidth = 400;
    const minHeight = 300;
    const maxWidth = window.innerWidth - modalPositionRef.current.x;
    const maxHeight = window.innerHeight - modalPositionRef.current.y;

    const newWidth = Math.max(minWidth, Math.min(resizeStartRef.current.width + deltaX, maxWidth));
    const newHeight = Math.max(minHeight, Math.min(resizeStartRef.current.height + deltaY, maxHeight));

    // Update ref immediately
    modalSizeRef.current = { width: newWidth, height: newHeight };

    // Update DOM directly for smooth performance
    modalRef.current.style.width = `${newWidth}px`;
    modalRef.current.style.height = `${newHeight}px`;
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    // Update state with final size
    setModalSize(modalSizeRef.current);
    setIsResizing(false);
  }, []);

  // Global mouse event listeners for drag and resize
  useEffect(() => {
    if (isDragging || isResizing) {
      // Prevent text selection during drag/resize
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging ? 'move' : 'nwse-resize';

      document.addEventListener('mousemove', isDragging ? handleDrag : handleResize);
      document.addEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', isDragging ? handleDrag : handleResize);
        document.removeEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, isResizing, handleDrag, handleResize, handleDragEnd, handleResizeEnd]);

  // Category order state
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [categoryMetadata, setCategoryMetadata] = useState<Record<string, { visibleFrom?: string | null; expiresAt?: string | null }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategorySchedule, setEditingCategorySchedule] = useState<string | null>(null);
  const [categoryVisibleFrom, setCategoryVisibleFrom] = useState<string>('');
  const [categoryExpiresAt, setCategoryExpiresAt] = useState<string>('');
  const [editingCategoryVisibility, setEditingCategoryVisibility] = useState<string | null>(null);
  const [visibilityUsers, setVisibilityUsers] = useState<Array<{ id: number; username: string }>>([]);

  // Load global category arrangement on mount (works for all users)
  useEffect(() => {
    const loadCategoryOrder = async () => {
      try {
        const arrangement = await getCategoryArrangement();
        if (arrangement.length > 0) {
          // Read categories in saved order (already sorted by position from API)
          const ordered = arrangement.map(c => c.categoryName);
          setCategoryOrder(ordered);
          // Store category metadata (scheduling)
          const metadata: Record<string, { visibleFrom?: string | null; expiresAt?: string | null }> = {};
          arrangement.forEach(c => {
            if (c.visibleFrom || c.expiresAt) {
              metadata[c.categoryName] = {
                visibleFrom: c.visibleFrom || null,
                expiresAt: c.expiresAt || null
              };
            }
          });
          setCategoryMetadata(metadata);
        } else {
          // Reset to empty if no arrangement found
          setCategoryOrder([]);
          setCategoryMetadata({});
        }
      } catch (error) {
        console.error('Failed to load category arrangement:', error);
        // On error, reset to empty to avoid stale data
        setCategoryOrder([]);
        setCategoryMetadata({});
      }
    };
    loadCategoryOrder();
  }, []); // Load once on mount, not dependent on authentication

  // Get unique existing groups for suggestions (preserve order from tiles)
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    tiles.forEach(t => groups.add(t.group || 'General'));
    return Array.from(groups);
  }, [tiles]);

  // Get all available categories (preserve order from categoryOrder and tiles)
  const allCategories = useMemo(() => {
    const categoriesFromTiles = new Set<string>();
    tiles.forEach(t => categoriesFromTiles.add(t.group || 'General'));

    // Start with saved category order
    const result: string[] = [];
    const seen = new Set<string>();

    // Add categories from saved order first
    if (categoryOrder.length > 0) {
      categoryOrder.forEach(cat => {
        if (categoriesFromTiles.has(cat) && !seen.has(cat)) {
          result.push(cat);
          seen.add(cat);
        }
      });
    }

    // Add any remaining categories from tiles in their order of appearance
    tiles.forEach(t => {
      const cat = t.group || 'General';
      if (!seen.has(cat)) {
        result.push(cat);
        seen.add(cat);
      }
    });

    return result;
  }, [tiles, categoryOrder, isAuthenticated]);

  // Get categories that belong to the current user (user owns at least one tile in that category)
  const userOwnedCategories = useMemo(() => {
    if (!isAuthenticated || !user) {
      return allCategories; // For non-authenticated users, return all categories
    }
    
    // If user is admin, return all categories
    if (user.is_admin) {
      return allCategories;
    }
    
    // Filter to only categories where user owns at least one tile
    const userOwnedCategorySet = new Set<string>();
    tiles.forEach(t => {
      const tileUserId = t.userId ?? (t as { user_id?: number }).user_id;
      if (tileUserId === user.id) {
        userOwnedCategorySet.add(t.group || 'General');
      }
    });
    
    // Return categories in the same order as allCategories, but filtered
    return allCategories.filter(cat => userOwnedCategorySet.has(cat));
  }, [allCategories, tiles, isAuthenticated, user]);

  // Load recycle bin count on mount and when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      getRecycleBin()
        .then(tiles => {
          setRecycleBinTiles(tiles);
        })
        .catch(error => {
          console.error('Failed to load recycle bin:', error);
        });

      // Also load archive count on mount
      getArchive()
        .then(tiles => {
          setArchiveTiles(tiles);
        })
        .catch(error => {
          console.error('Failed to load archive:', error);
        });
    }
  }, [isAuthenticated]);

  // Reload recycle bin when tab is active
  useEffect(() => {
    if (activeTab === 'recycle-bin' && isAuthenticated) {
      setIsLoadingRecycleBin(true);
      getRecycleBin()
        .then(tiles => {
          setRecycleBinTiles(tiles);
          setIsLoadingRecycleBin(false);
        })
        .catch(error => {
          console.error('Failed to load recycle bin:', error);
          setIsLoadingRecycleBin(false);
        });
    }
  }, [activeTab, isAuthenticated]);

  // Reload archive when tab is active
  useEffect(() => {
    if (activeTab === 'archive' && isAuthenticated) {
      setIsLoadingArchive(true);
      getArchive()
        .then(tiles => {
          setArchiveTiles(tiles);
          setIsLoadingArchive(false);
        })
        .catch(error => {
          console.error('Failed to load archive:', error);
          setIsLoadingArchive(false);
        });
    }
  }, [activeTab, isAuthenticated]);

  // Load favorite links when favorites tab is active
  useEffect(() => {
    if (activeTab === 'favorites' || activeTab === 'public-favorites') {
      console.log('Fetching favorite links...');

      if (isAuthenticated) {
        // For authenticated users, fetch from API
        setIsLoadingFavoriteLinks(true);
        getFavoriteLinks()
          .then(links => {
            console.log('Favorite links fetched from API:', links);
            setFavoriteLinks(links);
            setIsLoadingFavoriteLinks(false);
          })
          .catch(error => {
            console.error('Failed to load favorite links:', error);
            setIsLoadingFavoriteLinks(false);
          });
      } else {
        // For guest users, get from localStorage
        const favoriteLinkIds = getPublicLinkFavorites();
        console.log('Favorite link IDs from localStorage:', favoriteLinkIds);

        // Build favorite links from tiles data
        const guestFavoriteLinks: FavoriteLink[] = [];
        tiles.forEach(tile => {
          tile.sections?.forEach(section => {
            section.links?.forEach(link => {
              if (favoriteLinkIds.includes(link.id)) {
                guestFavoriteLinks.push({
                  id: link.id,
                  label: link.label,
                  url: link.url,
                  icon: link.icon,
                  textColor: link.textColor,
                  visibility: link.visibility,
                  notes: link.notes,
                  tooltip: link.tooltip,
                  browser: link.browser,
                  isFavorite: true,
                  health: link.health,
                  tile: {
                    id: tile.id,
                    title: tile.title,
                    emoji: tile.emoji || '✨',
                    themeColor: tile.themeColor || 'blue'
                  }
                });
              }
            });
          });
        });

        console.log('Guest favorite links built:', guestFavoriteLinks);
        setFavoriteLinks(guestFavoriteLinks);
      }
    }
  }, [activeTab, isAuthenticated, tiles]);

  // Check health of favorite links when favorites tab is active with 5s delay and cancellation
  useEffect(() => {
    // Only check health for favorites and public-favorites tabs
    const isFavoritesTab = activeTab === 'favorites' || activeTab === 'public-favorites';

    if (!isFavoritesTab) {
      // Cancel any ongoing checks when switching away from favorites tab
      favoriteLinkHealthService.cancelCheck();
      setIsCheckingHealth(false);
      return;
    }

    // Don't check if no favorite links
    if (favoriteLinks.length === 0) {
      return;
    }

    let checkTimeoutId: NodeJS.Timeout | null = null;

    // Start health checking
    const checkHealth = async () => {
      setIsCheckingHealth(true);

      const linksToCheck = favoriteLinks.map(link => ({
        id: link.id,
        url: link.url
      }));

      try {
        const results = await favoriteLinkHealthService.checkMultipleLinks(
          linksToCheck,
          (linkId, result) => {
            // Update results progressively as each link is checked
            setLinkHealthResults(prev => {
              const newMap = new Map(prev);
              newMap.set(linkId, result);
              return newMap;
            });
          }
        );

        // Final update with all results
        setLinkHealthResults(results);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error checking link health:', error);
        }
      } finally {
        setIsCheckingHealth(false);
      }
    };

    // Add 5 second delay for health check calculation
    // If the user stays on the tab post 5 seconds, calculate status; if not, cancel it
    checkTimeoutId = setTimeout(() => {
      checkHealth();
    }, 5000);

    // Cleanup: cancel checks and clear timeout when component unmounts or dependencies change
    return () => {
      if (checkTimeoutId) {
        clearTimeout(checkTimeoutId);
      }
      favoriteLinkHealthService.cancelCheck();
      setIsCheckingHealth(false);
    };
  }, [activeTab, favoriteLinks]);

  const handleForceRefresh = useCallback(async () => {
    if (favoriteLinks.length === 0 || isCheckingHealth) return;

    setIsCheckingHealth(true);
    const linksToCheck = favoriteLinks.map(link => ({
      id: link.id,
      url: link.url
    }));

    try {
      await favoriteLinkHealthService.checkMultipleLinks(
        linksToCheck,
        (linkId, result) => {
          setLinkHealthResults(prev => {
            const newMap = new Map(prev);
            newMap.set(linkId, result);
            return newMap;
          });
        }
      );
      setRefreshCountdown(autoRefreshInterval);
    } catch (error) {
      console.error('Error in force refresh:', error);
    } finally {
      setIsCheckingHealth(false);
    }
  }, [favoriteLinks, isCheckingHealth, autoRefreshInterval]);

  // Handle auto-refresh of link health with countdown
  useEffect(() => {
    if (!isAutoRefreshEnabled || (activeTab !== 'favorites' && activeTab !== 'public-favorites') || favoriteLinks.length === 0) {
      setRefreshCountdown(autoRefreshInterval);
      return;
    }

    const intervalId = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          if (!isCheckingHealth) {
            handleForceRefresh();
          }
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isAutoRefreshEnabled, autoRefreshInterval, activeTab, favoriteLinks, isCheckingHealth, handleForceRefresh]);

  useEffect(() => {
    setRefreshCountdown(autoRefreshInterval);
  }, [autoRefreshInterval]);

  // Reset preferencesLoaded when authentication state changes
  // This ensures preferences are reloaded when user logs in or out
  useEffect(() => {
    setPreferencesLoaded(false);
  }, [isAuthenticated]);

  // Load saved active tab preference for authenticated users
  useEffect(() => {
    if (isAuthenticated && !preferencesLoaded) {
      // Try to load from localStorage first (for immediate restoration after login)
      const localStorageTab = localStorage.getItem('linknest_user_active_tab');

      userPreferencesService.getPreference('activeTab')
        .then(savedTab => {
          // Prefer user preferences over localStorage, but use localStorage as fallback
          const tabToRestore = savedTab || localStorageTab;

          if (tabToRestore && typeof tabToRestore === 'string') {
            const validTabs: TabType[] = ['public', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
            if (validTabs.includes(tabToRestore as TabType)) {
              setActiveTab(tabToRestore as TabType);
            }
          }
          setPreferencesLoaded(true);
        })
        .catch(error => {
          // If preferences can't be loaded, try localStorage as fallback
          console.debug('Could not load active tab preference:', error);

          if (localStorageTab) {
            const validTabs: TabType[] = ['public', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
            if (validTabs.includes(localStorageTab as TabType)) {
              setActiveTab(localStorageTab as TabType);
            }
          }

          setPreferencesLoaded(true); // Mark as loaded even on error to prevent retries
        });
    } else if (!isAuthenticated) {
      // For public users, load active tab from localStorage
      const savedTab = getPublicActiveTab();
      if (savedTab) {
        const validTabs: TabType[] = ['public', 'public-favorites'];
        if (validTabs.includes(savedTab as TabType)) {
          setActiveTab(savedTab as TabType);
        }
      }
      // Load public favorites
      setPublicFavorites(getPublicFavorites());
      setPreferencesLoaded(true);
    }
  }, [isAuthenticated, preferencesLoaded]);

  // Sync public favorites when they change (for public users)
  useEffect(() => {
    if (!isAuthenticated) {
      setPublicFavorites(getPublicFavorites());
    }
  }, [isAuthenticated, tiles]);

  // Save active tab preference when it changes (for authenticated users)
  useEffect(() => {
    if (isAuthenticated && activeTab && preferencesLoaded) {
      // Only save if preferences have been loaded (to avoid saving default 'public' on initial load)
      // Debounce the save to avoid too many API calls
      const timeoutId = setTimeout(() => {
        // Save to user preferences (server-side)
        userPreferencesService.updatePreference('activeTab', activeTab)
          .catch(error => {
            console.error('Failed to save active tab preference:', error);
          });

        // Also save to localStorage for immediate restoration after login
        localStorage.setItem('linknest_user_active_tab', activeTab);
      }, 300); // Wait 300ms after tab change before saving

      return () => clearTimeout(timeoutId);
    } else if (!isAuthenticated && activeTab && preferencesLoaded) {
      // For public users, save active tab to localStorage
      const validTabs: TabType[] = ['public', 'public-favorites'];
      if (validTabs.includes(activeTab)) {
        setPublicActiveTab(activeTab);
      }
    }
  }, [activeTab, isAuthenticated, preferencesLoaded]);

  // Calculate counts for tabs
  const favoriteTilesCount = useMemo(() => {
    return tiles.filter(t => t.isFavorite === true).length;
  }, [tiles]);

  const publicFavoritesCount = useMemo(() => {
    if (isAuthenticated) return 0;
    return tiles.filter(t => isPublicFavorite(t.id)).length;
  }, [tiles, isAuthenticated, publicFavorites]);

  const privateTilesCount = useMemo(() => {
    if (!isAuthenticated || !user) return 0;
    return tiles.filter(t => {
      if (t.visibility === 'authenticated') {
        return true; // All authenticated users can see authenticated tiles
      } else if (t.visibility === 'private') {
        // Only show if user is in allowedUsers list
        return t.allowedUsers && t.allowedUsers.includes(user.id);
      }
      return false;
    }).length;
  }, [tiles, isAuthenticated, user]);

  const scheduledTilesCount = useMemo(() => {
    const now = new Date();
    return tiles.filter(t => {
      if (t.visibleFrom) {
        const visibleFrom = new Date(t.visibleFrom);
        return now < visibleFrom;
      }
      return false;
    }).length;
  }, [tiles]);

  const expiredTilesCount = useMemo(() => {
    const now = new Date();
    return tiles.filter(t => {
      if (t.expiresAt) {
        const expiresAt = new Date(t.expiresAt);
        return now > expiresAt;
      }
      return false;
    }).length;
  }, [tiles]);

  // Filter and Group Tiles - Global search across all content
  const baseGroupedTiles = useMemo(() => {
    // First, filter tiles based on active tab
    let filteredTiles = tiles;

    if (activeTab === 'recycle-bin') {
      // Show recycle bin tiles
      filteredTiles = recycleBinTiles;
    } else if (activeTab === 'archive') {
      // Show archived tiles
      filteredTiles = archiveTiles;
    } else if (activeTab === 'favorites') {
      // Show only favorited tiles (internal favorites for authenticated users)
      filteredTiles = tiles.filter(t => t.isFavorite === true);
    } else if (activeTab === 'public-favorites') {
      // Show only public favorites (localStorage-based for non-authenticated users)
      // Use publicFavorites state array for immediate updates
      filteredTiles = tiles.filter(t => publicFavorites.includes(t.id));
    } else if (activeTab === 'public') {
      // Show only public tiles (same as current public access)
      filteredTiles = tiles.filter(t => t.visibility === 'public');
    } else if (activeTab === 'your-apps') {
      // Show tiles/links accessible via user roles - only show specific assigned links
      if (isAuthenticated && user) {
        // First, find all tiles that have links with role access
        filteredTiles = tiles.filter(t => {
          // Check if any link within the tile has role access
          const hasLinkWithRoleAccess = t.tabs?.some(tab =>
            tab.sections?.some(section =>
              section.links?.some(link => link.hasRoleAccess)
            )
          ) || t.tabs?.some(tab =>
            tab.links?.some(link => link.hasRoleAccess)
          );
          return hasLinkWithRoleAccess;
        });

        // Filter links within tiles to ONLY show those with role access (even if tile has role access)
        filteredTiles = filteredTiles.map(tile => {
          // Always filter to only show links with role access, regardless of tile access
          const filteredTabs = tile.tabs?.map(tab => {
            const filteredSections = tab.sections?.map(section => ({
              ...section,
              links: section.links?.filter(link => link.hasRoleAccess) || []
            })).filter(section => section.links && section.links.length > 0);
            const filteredTabLinks = tab.links?.filter(link => link.hasRoleAccess) || [];
            return {
              ...tab,
              sections: filteredSections && filteredSections.length > 0 ? filteredSections : undefined,
              links: filteredTabLinks.length > 0 ? filteredTabLinks : undefined
            };
          }).filter(tab =>
            (tab.sections && tab.sections.length > 0) ||
            (tab.links && tab.links.length > 0)
          );
          return {
            ...tile,
            tabs: filteredTabs && filteredTabs.length > 0 ? filteredTabs : []
          };
        }).filter(tile =>
          tile.tabs && tile.tabs.length > 0 && tile.tabs.some(tab =>
            (tab.sections && tab.sections.length > 0) ||
            (tab.links && tab.links.length > 0)
          )
        );
      } else {
        filteredTiles = []; // No role-based content for unauthenticated users
      }
    } else if (activeTab === 'private') {
      // Show only authenticated and private tiles that belong to the user
      if (isAuthenticated && user) {
        filteredTiles = tiles.filter(t => {
          if (t.visibility === 'authenticated') {
            return true; // All authenticated users can see authenticated tiles
          } else if (t.visibility === 'private') {
            // Only show if user is in allowedUsers list
            return t.allowedUsers && t.allowedUsers.includes(user.id);
          }
          return false;
        });
      } else {
        filteredTiles = []; // No private tiles for unauthenticated users
      }
    } else if (activeTab === 'scheduled') {
      // Show only tiles/spaces that are scheduled for future (visibleFrom is in the future)
      const now = new Date();
      filteredTiles = tiles.filter(t => {
        if (t.visibleFrom) {
          const visibleFrom = new Date(t.visibleFrom);
          return now < visibleFrom;
        }
        return false;
      });
    } else if (activeTab === 'expired') {
      // Show only tiles/spaces that have expired (expiresAt is in the past)
      const now = new Date();
      filteredTiles = tiles.filter(t => {
        if (t.expiresAt) {
          const expiresAt = new Date(t.expiresAt);
          return now > expiresAt;
        }
        return false;
      });
    }

    // For all tabs except 'scheduled', 'expired', and 'your-apps', filter out scheduled and expired tiles
    // Scheduled tiles should only appear in the scheduled tab
    // Expired tiles should only appear in the expired tab
    // 'your-apps' shows role-based content which may include scheduled/expired items
    if (activeTab !== 'scheduled' && activeTab !== 'expired' && activeTab !== 'your-apps' && activeTab !== 'recycle-bin' && activeTab !== 'archive') {
      const now = new Date();
      filteredTiles = filteredTiles.filter(t => {
        // Hide tiles that are scheduled for the future
        if (t.visibleFrom) {
          const visibleFrom = new Date(t.visibleFrom);
          if (now < visibleFrom) {
            return false; // Hide scheduled tiles from non-scheduled views
          }
        }
        // Hide tiles that have expired
        if (t.expiresAt) {
          const expiresAt = new Date(t.expiresAt);
          if (now > expiresAt) {
            return false; // Hide expired tiles from non-expired views
          }
        }
        return true;
      });
    }

    if (!searchTerm.trim()) {
      // No search term - return filtered tiles grouped normally
      // IMPORTANT: Preserve the order of tiles as they come from the API
      // The API already returns tiles in the correct order based on arrangement
      const groups: Record<string, Tile[]> = {};

      // Debug: Log tile order from API
      if (filteredTiles.length > 0) {
        console.log('Tiles from API (first 5):', filteredTiles.slice(0, 5).map(t => ({ id: t.id, group: t.group || 'General', title: t.title })));
      }

      filteredTiles.forEach(tile => {
        const groupName = tile.group || 'General';
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        // Push tiles in the order they appear (preserving API order)
        groups[groupName].push(tile);
      });

      // Debug: Log grouped tiles order
      Object.keys(groups).forEach(cat => {
        if (groups[cat].length > 0) {
          console.log(`Category "${cat}" tiles order:`, groups[cat].map(t => ({ id: t.id, title: t.title })));
        }
      });

      // Apply global category order if available (works for all users)
      if (categoryOrder.length > 0) {
        const finalGroups: Record<string, Tile[]> = {};
        const seenCategories = new Set<string>();

        // Add categories in saved order first (respecting scheduling and active tab)
        categoryOrder.forEach(category => {
          if (groups[category]) {
            const metadata = categoryMetadata[category];
            const now = new Date();
            let shouldShow = true;

            if (activeTab === 'scheduled') {
              // Show categories scheduled for future OR categories with scheduled tiles
              let categoryScheduled = false;
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                categoryScheduled = now < visibleFrom;
              }
              // Also check if any tile in this category is scheduled
              const hasScheduledTiles = groups[category].some(tile => {
                if (tile.visibleFrom) {
                  const tileVisibleFrom = new Date(tile.visibleFrom);
                  return now < tileVisibleFrom;
                }
                return false;
              });
              shouldShow = categoryScheduled || hasScheduledTiles;
            } else if (activeTab === 'expired') {
              // Show expired categories OR categories with expired tiles
              let categoryExpired = false;
              if (metadata?.expiresAt) {
                const expiresAt = new Date(metadata.expiresAt);
                categoryExpired = now > expiresAt;
              }
              // Also check if any tile in this category is expired
              const hasExpiredTiles = groups[category].some(tile => {
                if (tile.expiresAt) {
                  const tileExpiresAt = new Date(tile.expiresAt);
                  return now > tileExpiresAt;
                }
                return false;
              });
              shouldShow = categoryExpired || hasExpiredTiles;
            } else {
              // For other tabs, hide scheduled/expired categories
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                if (now < visibleFrom) {
                  shouldShow = false;
                }
              }

              if (metadata?.expiresAt && shouldShow) {
                const expiresAt = new Date(metadata.expiresAt);
                if (now > expiresAt) {
                  shouldShow = false;
                }
              }
            }

            if (shouldShow) {
              finalGroups[category] = groups[category];
              seenCategories.add(category);
            }
          }
        });

        // Add any remaining categories in their order of appearance from tiles (respecting scheduling and active tab)
        Object.keys(groups).forEach(category => {
          if (!seenCategories.has(category)) {
            const metadata = categoryMetadata[category];
            const now = new Date();
            let shouldShow = true;

            if (activeTab === 'scheduled') {
              // Show categories scheduled for future OR categories with scheduled tiles
              let categoryScheduled = false;
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                categoryScheduled = now < visibleFrom;
              }
              // Also check if any tile in this category is scheduled
              const hasScheduledTiles = groups[category].some(tile => {
                if (tile.visibleFrom) {
                  const tileVisibleFrom = new Date(tile.visibleFrom);
                  return now < tileVisibleFrom;
                }
                return false;
              });
              shouldShow = categoryScheduled || hasScheduledTiles;
            } else if (activeTab === 'expired') {
              // Show expired categories OR categories with expired tiles
              let categoryExpired = false;
              if (metadata?.expiresAt) {
                const expiresAt = new Date(metadata.expiresAt);
                categoryExpired = now > expiresAt;
              }
              // Also check if any tile in this category is expired
              const hasExpiredTiles = groups[category].some(tile => {
                if (tile.expiresAt) {
                  const tileExpiresAt = new Date(tile.expiresAt);
                  return now > tileExpiresAt;
                }
                return false;
              });
              shouldShow = categoryExpired || hasExpiredTiles;
            } else {
              // For other tabs, hide scheduled/expired categories
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                if (now < visibleFrom) {
                  shouldShow = false;
                }
              }

              if (metadata?.expiresAt && shouldShow) {
                const expiresAt = new Date(metadata.expiresAt);
                if (now > expiresAt) {
                  shouldShow = false;
                }
              }
            }

            if (shouldShow) {
              finalGroups[category] = groups[category];
            }
          }
        });

        return finalGroups;
      }

      return groups;
    }

    const searchLower = searchTerm.toLowerCase();

    // Global search: check title, description, tab titles, section titles, link labels, link URLs, notes, and tooltips
    const filtered = filteredTiles.filter(t => {
      // Check tile-level properties (but NOT the group/category name to avoid irrelevant results when searching)
      if (
        t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower)
      ) {
        return true;
      }

      // Check tabs, sections and links within the tile
      const allSections = [
        ...(t.sections || []),
        ...(t.tabs?.flatMap(tab => {
          // Also match tab title
          if (tab.title.toLowerCase().includes(searchLower)) return tab.sections; // If tab matches, we should probably return true for the tile
          return tab.sections;
        }) || [])
      ];

      // A better way to check tabs/sections/links comprehensively

      // 1. Check Tabs
      if (t.tabs && t.tabs.length > 0) {
        for (const tab of t.tabs) {
          if (tab.title.toLowerCase().includes(searchLower)) return true;

          if (tab.sections && tab.sections.length > 0) {
            for (const section of tab.sections) {
              if (section.title.toLowerCase().includes(searchLower)) return true;

              if (section.links && section.links.length > 0) {
                for (const link of section.links) {
                  if (
                    link.label.toLowerCase().includes(searchLower)
                  ) {
                    return true;
                  }
                }
              }

              if (section.richTextContent && section.richTextContent.length > 0) {
                for (const rt of section.richTextContent) {
                  if (rt.content.toLowerCase().includes(searchLower)) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }

      // 2. Check Sections (backward compatibility)
      if (t.sections && t.sections.length > 0) {
        for (const section of t.sections) {
          if (section.title.toLowerCase().includes(searchLower)) return true;

          if (section.links && section.links.length > 0) {
            for (const link of section.links) {
              if (
                link.label.toLowerCase().includes(searchLower)
              ) {
                return true;
              }
            }
          }

          if (section.richTextContent && section.richTextContent.length > 0) {
            for (const rt of section.richTextContent) {
              if (rt.content.toLowerCase().includes(searchLower)) {
                return true;
              }
            }
          }
        }
      }

      return false;
    });

    const groups: Record<string, Tile[]> = {};

    filtered.forEach(tile => {
      const groupName = tile.group || 'General';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(tile);
    });

    // Apply category scheduling filtering for scheduled/expired tabs
    if (activeTab === 'scheduled' || activeTab === 'expired') {
      const filteredGroups: Record<string, Tile[]> = {};
      const now = new Date();

      Object.keys(groups).forEach(category => {
        const metadata = categoryMetadata[category];
        let shouldShow = false;

        if (activeTab === 'scheduled') {
          // Show categories scheduled for future OR categories with scheduled tiles
          let categoryScheduled = false;
          if (metadata?.visibleFrom) {
            const visibleFrom = new Date(metadata.visibleFrom);
            categoryScheduled = now < visibleFrom;
          }
          // Also check if any tile in this category is scheduled
          const hasScheduledTiles = groups[category].some(tile => {
            if (tile.visibleFrom) {
              const tileVisibleFrom = new Date(tile.visibleFrom);
              return now < tileVisibleFrom;
            }
            return false;
          });
          shouldShow = categoryScheduled || hasScheduledTiles;
        } else if (activeTab === 'expired') {
          // Show expired categories OR categories with expired tiles
          let categoryExpired = false;
          if (metadata?.expiresAt) {
            const expiresAt = new Date(metadata.expiresAt);
            categoryExpired = now > expiresAt;
          }
          // Also check if any tile in this category is expired
          const hasExpiredTiles = groups[category].some(tile => {
            if (tile.expiresAt) {
              const tileExpiresAt = new Date(tile.expiresAt);
              return now > tileExpiresAt;
            }
            return false;
          });
          shouldShow = categoryExpired || hasExpiredTiles;
        }

        if (shouldShow) {
          filteredGroups[category] = groups[category];
        }
      });

      return filteredGroups;
    }

    return groups;
  }, [tiles, searchTerm, categoryOrder, categoryMetadata, activeTab, isAuthenticated, user, recycleBinTiles, archiveTiles, publicFavorites]);

  // Apply selected category filter to the grouped tiles
  const groupedTiles = useMemo(() => {
    if (selectedCategoryFilter && baseGroupedTiles[selectedCategoryFilter]) {
      return { [selectedCategoryFilter]: baseGroupedTiles[selectedCategoryFilter] };
    }
    return baseGroupedTiles;
  }, [baseGroupedTiles, selectedCategoryFilter]);

  // Helper function to format browser name for display
  const formatBrowserName = (browserId: string | null | undefined): string => {
    if (!browserId || browserId === 'default') return '';
    return browserId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace('Wsl', '(WSL)')
      .trim();
  };

  // Helper function to normalize browser ID
  const normalizeBrowserId = (browserId: string): string => {
    if (!browserId) return browserId;
    const normalized = browserId.toLowerCase().trim();
    const shortAliases: Record<string, string> = {
      'edge': 'edge-stable-local',
      'chrome': 'chrome-stable-local'
    };
    if (shortAliases[normalized]) {
      return shortAliases[normalized];
    }
    return browserId;
  };

  // Function to open link in a specific browser
  const openLinkInBrowser = (url: string, browserId: string) => {
    if (typeof window !== 'undefined' && (window as any).BrowserLauncher) {
      const BrowserLauncher = (window as any).BrowserLauncher;
      if (settings.browser_extension_id) {
        BrowserLauncher.setExtensionId(settings.browser_extension_id);
      }
      const normalizedBrowserId = normalizeBrowserId(browserId);
      BrowserLauncher.open(url, normalizedBrowserId, { fallback: true }, (response: any) => {
        if (response && response.success !== false) {
          // Success
        } else {
          console.warn('BrowserLauncher failed, falling back to default behavior');
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // State for favorite links section position (true = above tiles, false = below tiles)
  const [favoriteLinksAbove, setFavoriteLinksAbove] = useState<boolean>(() => {
    // Initialize from localStorage for public users
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('favoriteLinksAbove');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Load preference for authenticated user
  useEffect(() => {
    if (isAuthenticated) {
      userPreferencesService.getPreference('favoriteLinksAbove').then(val => {
        if (val !== null) {
          // Handle both string "true"/"false" and boolean values
          setFavoriteLinksAbove(String(val) === 'true');
        }
      });
    }
  }, [isAuthenticated]);

  const handleSetFavoriteLinksAbove = (above: boolean) => {
    setFavoriteLinksAbove(above);
    if (isAuthenticated) {
      userPreferencesService.updatePreference('favoriteLinksAbove', above);
    } else {
      localStorage.setItem('favoriteLinksAbove', String(above));
    }
  };

  const handleCreateTile = async () => {
    if (!newTitle.trim()) return;

    if (tileType === 'hyperlink' && !hyperlinkUrl.trim()) return;

    if (!isAuthenticated && onAuthRequired) {
      onAuthRequired();
      return;
    }

    // Ensure current user (owner) is always included in allowed users for private tiles
    let finalAllowedUsers = newAllowedUsers;
    if (newVisibility === 'private' && user) {
      if (!finalAllowedUsers.includes(user.id)) {
        finalAllowedUsers = [...finalAllowedUsers, user.id];
      }
    }

    const newTile: Tile = {
      id: generateId(),
      title: newTitle,
      description: newDesc,
      emoji: newEmoji,
      themeColor: newColor,
      group: tileType === 'space' ? (newGroup.trim() || 'General') : (newGroup.trim() || 'General'),
      sections: tileType === 'space' ? [
        {
          id: generateId(),
          title: 'General',
          links: []
        }
      ] : [],
      tabs: [],
      createdAt: Date.now(),
      visibility: newVisibility,
      allowedUsers: (newVisibility === 'private') ? finalAllowedUsers : undefined,
      allowedGroups: (newVisibility === 'private') ? newAllowedGroups : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined,
      visibleFrom: visibleFrom.trim() ? new Date(visibleFrom).toISOString() : undefined,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined,
      messages: messages,
      // Tile decoration properties - preserve false/0 values, only use undefined for empty
      // When all values are empty/default, they'll be undefined and tile will use global style manager
      tileBackgroundColor: tileBackgroundColor.trim() ? tileBackgroundColor.trim() : undefined,
      tileGradientEnabled: tileGradientEnabled !== undefined ? tileGradientEnabled : undefined,
      tileGradientColors: tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0 ? tileGradientColors : undefined,
      tileGradientColorPositions: tileGradientEnabled && tileGradientColors && tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length ? tileGradientColorPositions : undefined,
      tileGradientDirection: tileGradientEnabled && tileGradientDirection !== undefined ? tileGradientDirection : undefined,
      tileGradientType: tileGradientEnabled && tileGradientType ? tileGradientType : undefined,
      tileBorderRadius: tileBorderRadius !== undefined && tileBorderRadius !== null ? tileBorderRadius : undefined,
      tileTextColor: tileTextColor.trim() ? tileTextColor.trim() : undefined
    };

    if (onCreateTile) {
      try {
        await onCreateTile(newTile);
        resetForm();
        setIsModalOpen(false);
      } catch (error) {
        console.error('Failed to create tile:', error);
        alert('Failed to create tile. Please try again.');
      }
    } else {
      onUpdateTiles([...tiles, newTile]);
      resetForm();
      setIsModalOpen(false);
    }
  };


  const resetForm = () => {
    setNewTitle('');
    setNewDesc('');
    setNewGroup('');
    setNewEmoji('📁');
    setNewColor('blue');
    setShowEmojiPicker(false);
    setNewVisibility('public');
    setNewAllowedUsers([]);
    setNewAllowedGroups([]);
    setVisibilitySearchTerm('');
    setVisibilityActiveTab('users');
    setShowUserSelector(false);
    setTileType('space');
    setHyperlinkUrl('');
    setOpenInNewTab(true);
    setVisibleFrom('');
    setExpiresAt('');
    setEditModalActiveTab('general');
    // Reset decoration properties
    setTileBackgroundColor('');
    setTileGradientEnabled(false);
    setTileGradientColors(['#3b82f6', '#8b5cf6']);
    setTileGradientColorPositions([0, 100]);
    setTileGradientDirection(90);
    setTileGradientType('linear');
    setTileBorderRadius(12);
    setTileTextColor('');
    // Reset messages
    setMessages([]);
    setEditingMessageId(null);
    setMessageContent('');
    setMessageType('info');
    setMessageStartDate('');
    setMessageEndDate('');
    setMessageIsActive(true);
    setMessagePriority(0);
  };

  // Fetch users and groups when modal opens and visibility is private
  useEffect(() => {
    const shouldFetchUsers = (isModalOpen || isEditModalOpen) && isAuthenticated && newVisibility === 'private' && availableUsers.length === 0 && !isLoadingUsers;
    if (shouldFetchUsers) {
      setIsLoadingUsers(true);
      authService.getUsers()
        .then(users => {
          setAvailableUsers(users);
          setIsLoadingUsers(false);
        })
        .catch(err => {
          console.error('Failed to fetch users:', err);
          setIsLoadingUsers(false);
        });
    }
    
    const shouldFetchGroups = (isModalOpen || isEditModalOpen) && isAuthenticated && newVisibility === 'private' && availableGroups.length === 0 && !isLoadingGroups;
    if (shouldFetchGroups) {
      setIsLoadingGroups(true);
      fetch(`${resolveApiBase()}/user-groups`, {
        method: 'GET',
        credentials: 'include',
      })
        .then(response => response.json())
        .then(groups => {
          setAvailableGroups(groups);
          setIsLoadingGroups(false);
        })
        .catch(err => {
          console.error('Failed to fetch groups:', err);
          setIsLoadingGroups(false);
        });
    }
  }, [isModalOpen, isEditModalOpen, isAuthenticated, newVisibility]);

  // Handle ESC key for create tile modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
        resetForm();
      }
    };

    if (isModalOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isModalOpen]);

  // Handle ESC key for edit tile modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditModalOpen) {
        setIsEditModalOpen(false);
        setEditingTile(null);
        resetForm();
      }
    };

    if (isEditModalOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isEditModalOpen]);

  const handleDeleteTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const isFromArchive = activeTab === 'archive';
    const confirmMessage = isFromArchive
      ? "Are you sure you want to delete this space from archive? It will be moved to the recycle bin."
      : "Are you sure you want to delete this space? It will be moved to the recycle bin.";

    if (confirm(confirmMessage)) {
      if (onDeleteTile) {
        try {
          await onDeleteTile(id);
          // Reload tiles to reflect the deletion
          const updatedTiles = await getTiles();
          onUpdateTiles(updatedTiles);

          // Always reload recycle bin to update the counter (tile was moved to recycle bin)
          const updatedRecycleBin = await getRecycleBin();
          setRecycleBinTiles(updatedRecycleBin);

          // If deleting from archive, also reload archive
          if (isFromArchive) {
            const updatedArchive = await getArchive();
            setArchiveTiles(updatedArchive);
          }
        } catch (error) {
          console.error('Failed to delete tile:', error);
          alert('Failed to delete space. Please try again.');
        }
      } else {
        onUpdateTiles(tiles.filter(t => t.id !== id));
        // Still refresh recycle bin even if using local state
        try {
          const updatedRecycleBin = await getRecycleBin();
          setRecycleBinTiles(updatedRecycleBin);
        } catch (error) {
          console.error('Failed to refresh recycle bin:', error);
        }
      }
    }
  };

  const handleArchiveTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    if (confirm("Are you sure you want to archive this space? It will be moved to the archive.")) {
      try {
        await archiveTile(id);
        // Reload tiles to reflect the archive
        const updatedTiles = await getTiles();
        onUpdateTiles(updatedTiles);
        // Always reload archive to update the count
        const updatedArchive = await getArchive();
        setArchiveTiles(updatedArchive);
      } catch (error) {
        console.error('Failed to archive tile:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to archive space: ${errorMsg}`);
      }
    }
  };

  const handleUnarchiveTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    try {
      await unarchiveTile(id);
      // Reload tiles and archive
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);
    } catch (error) {
      console.error('Failed to unarchive tile:', error);
      alert('Failed to restore space. Please try again.');
    }
  };

  const handleRestoreTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    try {
      await restoreTile(id);
      // Reload recycle bin and main tiles
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to restore tile:', error);
      alert('Failed to restore space. Please try again.');
    }
  };

  const handlePermanentDeleteTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    if (!confirm("Are you sure you want to permanently delete this space? This action cannot be undone.")) {
      return;
    }

    try {
      await permanentDeleteTile(id);
      // Reload recycle bin and main tiles
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to permanently delete tile:', error);
      alert('Failed to permanently delete space. Please try again.');
    }
  };

  const handlePermanentDeleteCategory = async (categoryName: string) => {
    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const categoryTiles = recycleBinTiles.filter(tile => (tile.group || 'General') === categoryName);

    if (categoryTiles.length === 0) {
      alert('No tiles found in this category in recycle bin.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete the category "${categoryName}"? This will permanently delete ${categoryTiles.length} space(s). This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await permanentDeleteCategory(categoryName);
      // Reload recycle bin
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      alert(`Successfully permanently deleted ${result.purgedCount} space(s) from category "${categoryName}".`);
    } catch (error) {
      console.error('Failed to permanently delete category:', error);
      alert('Failed to permanently delete category. Please try again.');
    }
  };

  const handlePurgeRecycleBin = async () => {
    if (!isAuthenticated) {
      alert('You must be logged in to purge the recycle bin.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete all ${recycleBinTiles.length} space(s) from your recycle bin? This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await purgeRecycleBin();
      setRecycleBinTiles([]);
      alert(`Successfully purged ${result.purgedCount} space(s) from your recycle bin.`);
    } catch (error) {
      console.error('Failed to purge recycle bin:', error);
      alert('Failed to purge recycle bin. Please try again.');
    }
  };

  const handlePurgeArchive = async () => {
    if (!isAuthenticated || !user?.is_admin) {
      alert('Only administrators can purge the archive.');
      return;
    }

    if (!confirm(`Are you sure you want to move all ${archiveTiles.length} space(s) from the archive to the recycle bin? They can be permanently deleted from the recycle bin later.`)) {
      return;
    }

    try {
      const result = await purgeArchive();
      // Reload archive and recycle bin to reflect the changes
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      alert(`Successfully moved ${result.purgedCount} space(s) from archive to recycle bin.`);
    } catch (error) {
      console.error('Failed to purge archive:', error);
      alert('Failed to purge archive. Please try again.');
    }
  };

  const handleCloneTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    if (onCloneTile) {
      try {
        await onCloneTile(id);
      } catch (error) {
        console.error('Failed to clone tile:', error);
        alert('Failed to clone space. Please try again.');
      }
    }
  };

  const handleTileClick = (tileId: string) => {
    const tile = tiles.find(t => t.id === tileId);
    if (tile?.isHyperlink && tile.hyperlinkUrl) {
      if (tile.openInNewTab) {
        window.open(tile.hyperlinkUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = tile.hyperlinkUrl;
      }
    } else {
      // Include the active tab in the URL hash so TileDetail knows the source context
      window.location.hash = `#/tile/${tileId}?from=${activeTab}`;
    }
  };

  const handleOpenEditModal = (tile: Tile) => {
    setEditingTile(tile);
    setNewTitle(tile.title);
    setNewDesc(tile.description);
    setNewGroup(tile.group || '');
    setNewEmoji(tile.emoji);
    setNewColor(tile.themeColor);
    setTileType(tile.isHyperlink ? 'hyperlink' : 'space');
    setHyperlinkUrl(tile.hyperlinkUrl || '');
    setOpenInNewTab(tile.openInNewTab !== undefined ? tile.openInNewTab : true);
    // For hyperlinks: if user is not admin, set visibility to private (they can only select private)
    if (tile.isHyperlink && user && !user.is_admin && isAuthenticated) {
      setNewVisibility('private');
    } else {
      setNewVisibility(tile.visibility || 'public');
    }
    
    // Always include owner in allowed users list
    const allowedUsers = tile.allowedUsers || [];
    const allowedGroups = tile.allowedGroups || [];
    if (tile.userId) {
      const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
      if (!allowedUsers.includes(ownerIdNum)) {
        setNewAllowedUsers([...allowedUsers, ownerIdNum]);
      } else {
        setNewAllowedUsers(allowedUsers);
      }
    } else {
      setNewAllowedUsers(allowedUsers);
    }
    setNewAllowedGroups(allowedGroups);
    // Convert ISO date strings to datetime-local format (YYYY-MM-DDTHH:mm)
    setVisibleFrom(tile.visibleFrom ? new Date(tile.visibleFrom).toISOString().slice(0, 16) : '');
    setExpiresAt(tile.expiresAt ? new Date(tile.expiresAt).toISOString().slice(0, 16) : '');
    // Load decoration properties (use explicit checks to preserve false/0 values)
    setTileBackgroundColor(tile.tileBackgroundColor ?? '');
    setTileGradientEnabled(tile.tileGradientEnabled ?? false);
    const loadedColors = tile.tileGradientColors && tile.tileGradientColors.length > 0 ? tile.tileGradientColors : ['#3b82f6', '#8b5cf6'];
    setTileGradientColors(loadedColors);
    // Load color positions or generate defaults (evenly spaced)
    if (tile.tileGradientColorPositions && tile.tileGradientColorPositions.length === loadedColors.length) {
      setTileGradientColorPositions(tile.tileGradientColorPositions);
    } else {
      // Generate evenly spaced positions
      const positions = loadedColors.map((_, i) => loadedColors.length > 1 ? (i / (loadedColors.length - 1)) * 100 : 0);
      setTileGradientColorPositions(positions);
    }
    // Convert direction to angle if it's a string, otherwise use the number
    if (typeof tile.tileGradientDirection === 'string') {
      const dirMap: { [key: string]: number } = {
        'to right': 90,
        'to left': 270,
        'to bottom': 180,
        'to top': 0,
        'to bottom right': 135,
        'to bottom left': 225,
        'to top right': 45,
        'to top left': 315
      };
      const angle = dirMap[tile.tileGradientDirection] ?? (parseInt(tile.tileGradientDirection.replace('deg', '')) || 90);
      setTileGradientDirection(angle);
    } else {
      setTileGradientDirection(tile.tileGradientDirection ?? 90);
    }
    setTileGradientType((tile.tileGradientType ?? 'linear') as 'linear' | 'radial' | 'conic' | 'repeating-linear' | 'repeating-radial' | 'repeating-conic');
    setTileBorderRadius(tile.tileBorderRadius ?? 12);
    setTileTextColor(tile.tileTextColor ?? '');
    setMessages(tile.messages || []);
    setEditModalActiveTab('general');
    setIsEditModalOpen(true);

    // Load users if needed for private visibility
    if (tile.visibility === 'private' && isAuthenticated && availableUsers.length === 0 && !isLoadingUsers) {
      setIsLoadingUsers(true);
      authService.getUsers()
        .then(users => {
          setAvailableUsers(users);
          setIsLoadingUsers(false);
        })
        .catch(err => {
          console.error('Failed to fetch users:', err);
          setIsLoadingUsers(false);
        });
    }
  };

  const handleUpdateTile = async () => {
    if (!editingTile || !newTitle.trim()) return;

    if (tileType === 'hyperlink' && !hyperlinkUrl.trim()) return;

    if (!isAuthenticated && onAuthRequired) {
      onAuthRequired();
      return;
    }

    // Ensure owner is always included in allowed users for private tiles
    let finalAllowedUsers = newAllowedUsers;
    if (newVisibility === 'private' && editingTile.userId) {
      const ownerIdNum = typeof editingTile.userId === 'string' ? parseInt(editingTile.userId, 10) : editingTile.userId;
      if (!finalAllowedUsers.includes(ownerIdNum)) {
        finalAllowedUsers = [...finalAllowedUsers, ownerIdNum];
      }
    }

    const updatedTile: Tile = {
      ...editingTile,
      title: newTitle,
      description: newDesc,
      emoji: newEmoji,
      themeColor: newColor,
      group: newGroup.trim() || 'General',
      visibility: newVisibility,
      allowedUsers: (newVisibility === 'private') ? finalAllowedUsers : undefined,
      allowedGroups: (newVisibility === 'private') ? newAllowedGroups : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined,
      visibleFrom: visibleFrom.trim() ? new Date(visibleFrom).toISOString() : undefined,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined,
      // Tile decoration properties - preserve false/0 values, only use undefined for empty
      // When all values are empty/default, they'll be undefined and tile will use global style manager
      tileBackgroundColor: tileBackgroundColor.trim() ? tileBackgroundColor.trim() : undefined,
      tileGradientEnabled: tileGradientEnabled !== undefined ? tileGradientEnabled : undefined,
      tileGradientColors: tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0 ? tileGradientColors : undefined,
      tileGradientColorPositions: tileGradientEnabled && tileGradientColors && tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length ? tileGradientColorPositions : undefined,
      tileGradientDirection: tileGradientEnabled && tileGradientDirection !== undefined ? tileGradientDirection : undefined,
      tileGradientType: tileGradientEnabled && tileGradientType ? tileGradientType : undefined,
      tileBorderRadius: tileBorderRadius !== undefined && tileBorderRadius !== null ? tileBorderRadius : undefined,
      tileTextColor: tileTextColor.trim() ? tileTextColor.trim() : undefined,
      messages: messages
    };

    try {
      const updatedTiles = tiles.map(t => t.id === updatedTile.id ? updatedTile : t);
      onUpdateTiles(updatedTiles);

      // Save to backend if authenticated
      if (isAuthenticated) {
        await saveTile(updatedTile);
      }

      resetForm();
      setIsEditModalOpen(false);
      setEditingTile(null);
    } catch (error) {
      console.error('Failed to update tile:', error);
      alert('Failed to update tile. Please try again.');
    }
  };

  const isPrivateScopeSave = activeTab === 'private' && !!user;
  const buildArrangementAndScope = useCallback(
    (sourceTiles: Tile[]): { arrangement: Array<{ tileId: string; position: number; groupName: string }>; scope?: 'global' | 'private' } => {
      const owned = (t: Tile) => {
        const uid = t.userId ?? (t as { user_id?: number }).user_id;
        return uid != null && user && uid === user.id;
      };
      if (isPrivateScopeSave && user) {
        const filtered = sourceTiles.filter(owned);
        const grouped: Record<string, Tile[]> = {};
        filtered.forEach((t) => {
          const g = t.group || 'General';
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push(t);
        });
        const orderedCats: string[] = [];
        const seen = new Set<string>();
        if (categoryOrder.length > 0) {
          categoryOrder.forEach((c) => {
            if (grouped[c] && !seen.has(c)) {
              orderedCats.push(c);
              seen.add(c);
            }
          });
        }
        Object.keys(grouped).forEach((c) => {
          if (!seen.has(c)) orderedCats.push(c);
        });
        const arrangement: Array<{ tileId: string; position: number; groupName: string }> = [];
        orderedCats.forEach((cat) => {
          (grouped[cat] || []).forEach((t) =>
            arrangement.push({ tileId: t.id, position: arrangement.length, groupName: cat })
          );
        });
        return { arrangement, scope: 'private' };
      }
      return {
        arrangement: sourceTiles.map((t, i) => ({
          tileId: t.id,
          position: i,
          groupName: t.group || 'General',
        })),
        scope: undefined,
      };
    },
    [isPrivateScopeSave, user, categoryOrder]
  );

  const handleMoveTileToCategory = useCallback(async (tileId: string, categoryName: string) => {
    if (!isAuthenticated) return;

    try {
      const updatedTiles = tiles.map(tile =>
        tile.id === tileId
          ? { ...tile, group: categoryName }
          : tile
      );

      // Update local state
      onUpdateTiles(updatedTiles);

      // Save arrangement to backend - preserve order within each category
      try {
        // Group tiles by category and assign positions within each category
        const grouped: Record<string, Tile[]> = {};
        updatedTiles.forEach(tile => {
          const group = tile.group || 'General';
          if (!grouped[group]) {
            grouped[group] = [];
          }
          grouped[group].push(tile);
        });

        const orderedCategories: string[] = [];
        const seenCats = new Set<string>();
        if (categoryOrder.length > 0) {
          categoryOrder.forEach((c) => {
            if (grouped[c] && !seenCats.has(c)) {
              orderedCategories.push(c);
              seenCats.add(c);
            }
          });
        }
        Object.keys(grouped).forEach((c) => {
          if (!seenCats.has(c)) orderedCategories.push(c);
        });
        const flat: Tile[] = [];
        orderedCategories.forEach((cat) => flat.push(...(grouped[cat] || [])));
        const { arrangement, scope } = buildArrangementAndScope(flat);
        await saveTileArrangement(arrangement, scope);
      } catch (error) {
        console.error('Failed to save tile arrangement:', error);
        // Revert on error
        const errorMsg = error instanceof Error ? error.message : 'Failed to save tile arrangement. Please try again.';
        alert(errorMsg);
        onUpdateTiles(tiles);
      }
    } catch (error) {
      console.error('Failed to move tile to category:', error);
      alert('Failed to move tile. Please try again.');
    }
  }, [tiles, isAuthenticated, onUpdateTiles, categoryOrder, buildArrangementAndScope]);

  const handleMoveCategory = useCallback(async (categoryName: string, direction: 'up' | 'down') => {
    if (!isAuthenticated) return;

    // Get all current categories from tiles (preserve order)
    const allCategoriesFromTiles: string[] = [];
    const seenCats = new Set<string>();
    tiles.forEach(t => {
      const cat = t.group || 'General';
      if (!seenCats.has(cat)) {
        allCategoriesFromTiles.push(cat);
        seenCats.add(cat);
      }
    });

    // Build current order: use categoryOrder if available, otherwise use order from tiles
    let currentCategories: string[];
    if (categoryOrder.length > 0) {
      // Start with saved order, filter to only include existing categories
      currentCategories = categoryOrder.filter(cat => allCategoriesFromTiles.includes(cat));
      // Add any new categories not in the saved order (in their order of appearance)
      allCategoriesFromTiles.forEach(cat => {
        if (!currentCategories.includes(cat)) {
          currentCategories.push(cat);
        }
      });
    } else {
      // No saved order, use order from tiles
      currentCategories = [...allCategoriesFromTiles];
    }

    const currentIndex = currentCategories.indexOf(categoryName);

    if (currentIndex === -1) {
      console.error('Category not found in order:', categoryName);
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentCategories.length) {
      return; // Already at top or bottom
    }

    // Create new order by swapping
    const newCategoryOrder = [...currentCategories];
    [newCategoryOrder[currentIndex], newCategoryOrder[newIndex]] = [newCategoryOrder[newIndex], newCategoryOrder[currentIndex]];

    // Update state immediately for instant feedback
    setCategoryOrder(newCategoryOrder);

    // Save category arrangement to database (global for all users)
    try {
      const arrangement = newCategoryOrder.map((category, index) => ({
        categoryName: category,
        position: index,
        visibleFrom: categoryMetadata[category]?.visibleFrom || null,
        expiresAt: categoryMetadata[category]?.expiresAt || null
      }));
      await saveCategoryArrangement(arrangement);
      // Success - order is now saved globally and will be visible to all users
    } catch (error) {
      console.error('Failed to save category arrangement:', error);
      // Revert state on error
      setCategoryOrder(categoryOrder);
      const errorMsg = error instanceof Error ? error.message : 'Failed to save category order. Please try again.';
      alert(errorMsg);
    }
  }, [tiles, isAuthenticated, categoryOrder, categoryMetadata]);

  const handleExportCategory = useCallback(
    async (categoryName: string) => {
      if (!user?.is_admin) {
        alert('Only administrators can export categories.');
        return;
      }

      try {
        // Initialize progress
        setExportProgress({
          current: 0,
          total: 0,
          status: 'Preparing export...',
          errors: []
        });

        // Get category tiles
        const categoryTiles = tiles.filter(
          (t) => (t.group || 'General') === categoryName
        );

        if (categoryTiles.length === 0) {
          setExportProgress(null);
          alert(`No spaces found in category "${categoryName}".`);
          return;
        }

        // Update progress with total count
        setExportProgress({
          current: 0,
          total: categoryTiles.length,
          status: `Exporting ${categoryTiles.length} tiles from "${categoryName}"...`,
          errors: []
        });

        // Small delay to show progress animation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Prepare export payload
        const payload = {
          version: '1.1' as const,
          type: 'category' as const,
          exportedAt: Date.now(),
          categoryName,
          tiles: categoryTiles
        };

        // Update progress - processing
        setExportProgress({
          current: categoryTiles.length / 2,
          total: categoryTiles.length,
          status: `Processing ${categoryTiles.length} tiles...`,
          errors: []
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Trigger download
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linknest-category-${categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'space'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Final status
        setExportProgress({
          current: categoryTiles.length,
          total: categoryTiles.length,
          status: `✅ Successfully exported ${categoryTiles.length} tiles from category "${categoryName}"!`,
          errors: []
        });

        // Clear progress after delay
        setTimeout(() => {
          setExportProgress(null);
        }, 3000);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setExportProgress({
          current: 0,
          total: 0,
          status: `❌ Failed to export: ${errorMsg}`,
          errors: []
        });
        console.error('Export error:', error);

        // Clear progress after delay
        setTimeout(() => {
          setExportProgress(null);
        }, 5000);
      }
    },
    [tiles, user]
  );

  const handleExportTile = useCallback(
    (tile: Tile) => {
      if (!user?.is_admin) {
        alert('Only administrators can export tiles.');
        return;
      }
      exportTileToFile(tile);
    },
    [user]
  );

  const handleExportStats = useCallback(() => {
    if (favoriteLinks.length === 0) {
      alert('No favorite links to export');
      return;
    }

    // Prepare CSV data with both local and server latency
    const headers = ['Label', 'URL', 'Status', 'HTTP Code', 'Local Latency (ms)', 'Server Latency (ms)', 'Total Latency (ms)', 'Parent Space', 'Last Checked'];
    const rows: string[][] = [];

    favoriteLinks.forEach(link => {
      const healthResult = linkHealthResults.get(link.id);
      const status = healthResult?.health.status || 'unknown';
      const httpCode = healthResult?.health.httpCode || '';
      const localLatency = healthResult?.latency || 0;
      const serverLatency = healthResult?.serverLatency || 0;
      const totalLatency = localLatency; // Local latency already includes server processing time
      const lastChecked = healthResult?.health.checkedAt
        ? new Date(healthResult.health.checkedAt).toLocaleString()
        : 'Never';

      rows.push([
        link.label,
        link.url,
        status,
        httpCode.toString(),
        localLatency.toString(),
        serverLatency.toString(),
        totalLatency.toString(),
        link.tile.title,
        lastChecked
      ]);
    });

    // Convert to CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `favorite-links-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [favoriteLinks, linkHealthResults]);

  const handleImportCategory = useCallback(
    async (categoryName: string) => {
      if (!isAuthenticated) {
        if (onAuthRequired) onAuthRequired();
        return;
      }
      if (!user?.is_admin) {
        alert('Only administrators can import categories.');
        return;
      }

      // Create a file input element
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          // Initialize progress
          setImportProgress({
            current: 0,
            total: 0,
            status: 'Parsing file...',
            errors: []
          });

          const text = await file.text();
          const data = JSON.parse(text);

          // Validate and parse the import file
          const parsed = parseSpaceExportObject(data);

          // Normalize imported tiles and assign to the target category
          const normalizedTiles = normalizeImportedTiles(parsed);

          // Update group to target category
          const tilesToImport = normalizedTiles.map(tile => ({
            ...tile,
            group: categoryName
          }));

          if (tilesToImport.length === 0) {
            setImportProgress(null);
            alert('No tiles/spaces found to import.');
            return;
          }

          // Update progress with total count
          setImportProgress({
            current: 0,
            total: tilesToImport.length,
            status: `Importing ${tilesToImport.length} tiles to "${categoryName}"...`,
            errors: []
          });

          // Import tiles one by one using createTile API
          let successCount = 0;
          let errorCount = 0;
          const errors: string[] = [];

          for (let i = 0; i < tilesToImport.length; i++) {
            const tile = tilesToImport[i];
            try {
              await createTile(tile);
              successCount++;

              // Update progress
              setImportProgress({
                current: i + 1,
                total: tilesToImport.length,
                status: `Imported ${i + 1} of ${tilesToImport.length} tiles...`,
                errors: [...errors]
              });
            } catch (error) {
              errorCount++;
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              errors.push(`Failed to import "${tile.title}": ${errorMsg}`);
              console.error('Failed to import tile:', tile.title, error);

              // Update progress with error
              setImportProgress({
                current: i + 1,
                total: tilesToImport.length,
                status: `Imported ${i + 1} of ${tilesToImport.length} tiles... (${errorCount} errors)`,
                errors: [...errors]
              });
            }
          }

          // Final status
          if (errorCount === 0) {
            setImportProgress({
              current: tilesToImport.length,
              total: tilesToImport.length,
              status: `✅ Successfully imported ${successCount} tiles into category "${categoryName}"!`,
              errors: []
            });

            // Clear progress after delay
            setTimeout(() => {
              setImportProgress(null);
            }, 3000);
          } else {
            setImportProgress({
              current: tilesToImport.length,
              total: tilesToImport.length,
              status: `⚠️ Imported ${successCount} tiles, ${errorCount} failed.`,
              errors: errors
            });
          }

          // Refresh tiles from server
          try {
            const updatedTiles = await getTiles();
            onUpdateTiles(updatedTiles);
          } catch (error) {
            console.error('Failed to refresh tiles:', error);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          setImportProgress({
            current: 0,
            total: 0,
            status: `❌ Failed to import tiles: ${errorMsg}`,
            errors: []
          });
          console.error('Import error:', error);

          // Clear progress after delay
          setTimeout(() => {
            setImportProgress(null);
          }, 5000);
        }
      };
      input.click();
    },
    [isAuthenticated, onAuthRequired, onUpdateTiles, user]
  );

  const handleCloneCategory = useCallback(
    async (categoryName: string) => {
      if (!isAuthenticated) {
        if (onAuthRequired) onAuthRequired();
        return;
      }
      if (!user?.is_admin) {
        alert('Only administrators can clone categories.');
        return;
      }

      // Confirm with user
      if (!confirm(`Are you sure you want to clone the category "${categoryName}"?\n\nThis will create a copy of all tiles/spaces in this category.`)) {
        return;
      }

      try {
        const result = await cloneCategory(categoryName);

        // Refresh tiles from server
        try {
          const updatedTiles = await getTiles();
          onUpdateTiles(updatedTiles);
        } catch (error) {
          console.error('Failed to refresh tiles:', error);
        }

        // Show success message
        if (result.errors.length === 0) {
          alert(`Successfully cloned category "${categoryName}" to "${result.newCategoryName}".\n\nCloned ${result.clonedCount} tile(s).`);
        } else {
          alert(
            `Category cloned with some errors.\n\n` +
            `Cloned ${result.clonedCount} tile(s) successfully.\n` +
            `Errors:\n${result.errors.join('\n')}`
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to clone category: ${errorMsg}`);
        console.error('Clone category error:', error);
      }
    },
    [isAuthenticated, onAuthRequired, onUpdateTiles, user]
  );

  const handleRenameCategory = useCallback(async (oldName: string, newName: string) => {
    if (!isAuthenticated) return;
    if (!newName.trim() || newName.trim() === oldName) return;

    const trimmedNewName = newName.trim();

    try {
      // Update all tiles with the old category name to the new name
      const updatedTiles = tiles.map(tile => {
        if ((tile.group || 'General') === oldName) {
          return { ...tile, group: trimmedNewName };
        }
        return tile;
      });

      // Update local state
      onUpdateTiles(updatedTiles);

      // Update category order
      const newCategoryOrder = categoryOrder.map(cat =>
        cat === oldName ? trimmedNewName : cat
      );
      setCategoryOrder(newCategoryOrder);

      // Save updated arrangements
      try {
        // Save tile arrangement with updated category names
        const { arrangement, scope } = buildArrangementAndScope(updatedTiles);
        await saveTileArrangement(arrangement, scope);

        // Save category arrangement with renamed category
        if (newCategoryOrder.length > 0) {
          const categoryArrangement = newCategoryOrder.map((category, index) => ({
            categoryName: category,
            position: index,
            visibleFrom: categoryMetadata[category]?.visibleFrom || null,
            expiresAt: categoryMetadata[category]?.expiresAt || null
          }));
          await saveCategoryArrangement(categoryArrangement);
        }
      } catch (error) {
        console.error('Failed to save arrangements:', error);
        // Revert on error
        onUpdateTiles(tiles);
        setCategoryOrder(categoryOrder);
        alert('Failed to save category rename. Please try again.');
      }
    } catch (error) {
      console.error('Failed to rename category:', error);
      alert('Failed to rename category. Please try again.');
    }
  }, [tiles, isAuthenticated, onUpdateTiles, categoryOrder, categoryMetadata, buildArrangementAndScope]);

  const handleArchiveCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    const categoryTiles = tiles.filter(tile => (tile.group || 'General') === categoryName);

    if (categoryTiles.length === 0) {
      alert('Category is empty. Nothing to archive.');
      return;
    }

    try {
      // Archive all tiles in this category
      const result = await archiveCategory(categoryName);

      // Reload tiles and archive
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);

      alert(`Successfully archived ${result.archivedCount} space(s) from category "${categoryName}".`);
    } catch (error) {
      console.error('Failed to archive category:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to archive category: ${errorMsg}`);
    }
  }, [tiles, isAuthenticated, onUpdateTiles]);

  const handleUnarchiveCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    try {
      // Unarchive all tiles in this category
      const result = await unarchiveCategory(categoryName);

      // Reload tiles and archive
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);

      alert(`Successfully restored ${result.unarchivedCount} space(s) from category "${categoryName}".`);
    } catch (error) {
      console.error('Failed to unarchive category:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to restore category: ${errorMsg}`);
    }
  }, [isAuthenticated, onUpdateTiles]);

  const handleDeleteCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    // Get tiles from the appropriate source based on active tab
    let categoryTiles: Tile[];
    if (activeTab === 'archive') {
      // In archive view, get tiles from archiveTiles
      categoryTiles = archiveTiles.filter(tile => (tile.group || 'General') === categoryName);
    } else {
      // In normal view, get tiles from tiles
      categoryTiles = tiles.filter(tile => (tile.group || 'General') === categoryName);
    }

    if (categoryTiles.length === 0) {
      // No tiles in category, just remove the category
      const newCategoryOrder = categoryOrder.filter(cat => cat !== categoryName);
      setCategoryOrder(newCategoryOrder);
      if (newCategoryOrder.length > 0) {
        const categoryArrangement = newCategoryOrder.map((category, index) => ({
          categoryName: category,
          position: index
        }));
        await saveCategoryArrangement(categoryArrangement);
      } else {
        await saveCategoryArrangement([]);
      }
      return;
    }

    const isFromArchive = activeTab === 'archive';
    const confirmMessage = isFromArchive
      ? `Are you sure you want to delete the category "${categoryName}" from archive? This will move ${categoryTiles.length} tile(s) to the recycle bin.`
      : `Are you sure you want to delete the category "${categoryName}"? This will move ${categoryTiles.length} tile(s) to the recycle bin.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Initialize progress
      setDeleteCategoryProgress({
        current: 0,
        total: categoryTiles.length,
        status: 'Deleting tiles...',
        categoryName: categoryName
      });

      // Soft delete all tiles in this category (move to recycle bin) with progress tracking
      for (let i = 0; i < categoryTiles.length; i++) {
        await deleteTile(categoryTiles[i].id);
        setDeleteCategoryProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          status: `Deleting tile ${i + 1} of ${categoryTiles.length}...`
        } : null);
      }

      // Update progress - removing category
      setDeleteCategoryProgress(prev => prev ? {
        ...prev,
        status: 'Removing category...'
      } : null);

      // Remove category from category order
      const newCategoryOrder = categoryOrder.filter(cat => cat !== categoryName);
      setCategoryOrder(newCategoryOrder);

      // Save category arrangement
      if (newCategoryOrder.length > 0) {
        const categoryArrangement = newCategoryOrder.map((category, index) => ({
          categoryName: category,
          position: index,
          visibleFrom: categoryMetadata[category]?.visibleFrom || null,
          expiresAt: categoryMetadata[category]?.expiresAt || null
        }));
        await saveCategoryArrangement(categoryArrangement);
      } else {
        await saveCategoryArrangement([]);
      }

      // Remove category metadata
      const newMetadata = { ...categoryMetadata };
      delete newMetadata[categoryName];
      setCategoryMetadata(newMetadata);

      // Update progress - reloading data
      setDeleteCategoryProgress(prev => prev ? {
        ...prev,
        status: 'Reloading data...'
      } : null);

      // Reload tiles, recycle bin, and archive
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);

      // Always reload recycle bin to update the counter (tiles were moved to recycle bin)
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);

      // If deleting from archive, also reload archive
      if (activeTab === 'archive') {
        const updatedArchive = await getArchive();
        setArchiveTiles(updatedArchive);
      }

      // Clear progress after a short delay
      setTimeout(() => {
        setDeleteCategoryProgress(null);
      }, 500);
    } catch (error) {
      console.error('Failed to delete category:', error);
      setDeleteCategoryProgress(null);
      alert('Failed to delete category. Please try again.');
    }
  }, [tiles, archiveTiles, isAuthenticated, onUpdateTiles, categoryOrder, categoryMetadata, activeTab]);

  const handleOpenCategorySchedule = useCallback((categoryName: string) => {
    const metadata = categoryMetadata[categoryName];
    setCategoryVisibleFrom(metadata?.visibleFrom ? new Date(metadata.visibleFrom).toISOString().slice(0, 16) : '');
    setCategoryExpiresAt(metadata?.expiresAt ? new Date(metadata.expiresAt).toISOString().slice(0, 16) : '');
    setEditingCategorySchedule(categoryName);
  }, [categoryMetadata]);

  const handleOpenManageVisibility = useCallback(async (categoryName: string) => {
    try {
      // Load users list
      const users = await authService.getUsers();
      setVisibilityUsers(users.map(u => ({ id: u.id, username: u.username })));
      setEditingCategoryVisibility(categoryName);
    } catch (error) {
      console.error('Failed to load users:', error);
      alert('Failed to load users. Please try again.');
    }
  }, []);

  const handleSaveVisibilityChanges = useCallback(async (visibilityChanges: Record<string, { visibility: TileVisibility; allowedUsers: number[] }>) => {
    if (!editingCategoryVisibility || !isAuthenticated) return;

    try {
      // Update each tile's visibility
      const updatePromises = Object.entries(visibilityChanges).map(async ([tileId, settings]) => {
        const tile = tiles.find(t => t.id === tileId);
        if (!tile) return;

        const updatedTile: Tile = {
          ...tile,
          visibility: settings.visibility,
          allowedUsers: settings.visibility === 'private' ? settings.allowedUsers : undefined
        };

        return saveTile(updatedTile);
      });

      await Promise.all(updatePromises.filter(p => p !== undefined));

      // Reload tiles
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);

      setEditingCategoryVisibility(null);
    } catch (error) {
      console.error('Failed to save visibility changes:', error);
      alert('Failed to save visibility changes. Please try again.');
    }
  }, [editingCategoryVisibility, tiles, isAuthenticated, onUpdateTiles]);

  const handleSaveCategorySchedule = useCallback(async () => {
    if (!editingCategorySchedule || !isAuthenticated) return;

    try {
      const newMetadata = {
        ...categoryMetadata,
        [editingCategorySchedule]: {
          visibleFrom: categoryVisibleFrom.trim() || null,
          expiresAt: categoryExpiresAt.trim() || null
        }
      };

      // Remove entry if both dates are empty
      if (!categoryVisibleFrom.trim() && !categoryExpiresAt.trim()) {
        delete newMetadata[editingCategorySchedule];
      }

      setCategoryMetadata(newMetadata);

      // Save category arrangement with updated metadata
      const allCategories = [...categoryOrder];
      const arrangement = allCategories.map((category, index) => ({
        categoryName: category,
        position: index,
        visibleFrom: newMetadata[category]?.visibleFrom || null,
        expiresAt: newMetadata[category]?.expiresAt || null
      }));

      await saveCategoryArrangement(arrangement);
      setEditingCategorySchedule(null);
      setCategoryVisibleFrom('');
      setCategoryExpiresAt('');
    } catch (error) {
      console.error('Failed to save category schedule:', error);
      alert('Failed to save category schedule. Please try again.');
    }
  }, [editingCategorySchedule, categoryVisibleFrom, categoryExpiresAt, categoryMetadata, categoryOrder, isAuthenticated]);

  const handleMoveTile = useCallback(async (tileId: string, direction: 'left' | 'right') => {
    // Only authenticated users can move tiles
    if (!isAuthenticated) return;

    const currentIndex = tiles.findIndex(t => t.id === tileId);
    if (currentIndex === -1) return;

    const currentTile = tiles[currentIndex];
    const currentGroup = currentTile.group || 'General';

    // Find all tiles in this group to determine the target
    const groupTiles = tiles.filter(t => (t.group || 'General') === currentGroup);
    const indexInGroup = groupTiles.findIndex(t => t.id === tileId);

    if (indexInGroup === -1) return;

    // Calculate target index within the group
    const targetIndexInGroup = direction === 'left' ? indexInGroup - 1 : indexInGroup + 1;

    // Boundary checks within the group
    if (targetIndexInGroup < 0 || targetIndexInGroup >= groupTiles.length) {
      return;
    }

    // Find the target tile in the main array
    const targetTile = groupTiles[targetIndexInGroup];
    const targetIndex = tiles.findIndex(t => t.id === targetTile.id);

    if (targetIndex === -1) return;

    // Swap the two tiles in the flat array
    const reorderedTiles = [...tiles];
    [reorderedTiles[currentIndex], reorderedTiles[targetIndex]] = [
      reorderedTiles[targetIndex],
      reorderedTiles[currentIndex],
    ];

    // Update local state immediately for visual feedback
    onUpdateTiles(reorderedTiles);

    // Auto-save is kept for convenience, but manual save button provides reassurance
    try {
      const { arrangement, scope } = buildArrangementAndScope(reorderedTiles);
      await saveTileArrangement(arrangement, scope);
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      // Don't alert on auto-save failure to avoid annoying popups,
      // let the user use the manual save button if needed.
    }
  }, [tiles, isAuthenticated, onUpdateTiles, buildArrangementAndScope]);

  const handleManualSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      let sourceTiles: Tile[];
      if (isPrivateScopeSave && Object.keys(groupedTiles).length > 0) {
        const flat: Tile[] = [];
        const ordered = categoryOrder.length > 0
          ? categoryOrder.filter((c) => groupedTiles[c]).concat(Object.keys(groupedTiles).filter((c) => !categoryOrder.includes(c)))
          : Object.keys(groupedTiles);
        ordered.forEach((cat) => flat.push(...(groupedTiles[cat] || [])));
        sourceTiles = flat;
      } else {
        sourceTiles = tiles;
      }
      const { arrangement, scope } = buildArrangementAndScope(sourceTiles);
      await saveTileArrangement(arrangement, scope);
      alert('Tile order saved successfully!');
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      alert('Failed to save tile order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  }, [tiles, isSaving, isPrivateScopeSave, groupedTiles, categoryOrder, buildArrangementAndScope]);

  const handleShowTileInfo = useCallback((tile: Tile) => {
    setTileInfoDialog({ tile });
  }, []);

  const handleShowCategoryInfo = useCallback(async (categoryName: string, categoryTiles: Tile[]) => {
    // Determine category owner from oldest tile (first created in category)
    let categoryOwner: { userId: number | null; username: string | null; email: string | null; isAdmin: boolean } | undefined;
    
    if (categoryTiles.length > 0) {
      // Find oldest tile (first created)
      const oldestTile = categoryTiles.reduce((oldest, current) => 
        (!oldest || current.createdAt < oldest.createdAt) ? current : oldest
      );
      
      if (oldestTile.userId) {
        try {
          // Fetch owner info
          const API_BASE = import.meta.env.VITE_API_BASE || '/api';
          const response = await fetch(`${API_BASE}/auth/user/${oldestTile.userId}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const userInfo = await response.json();
            categoryOwner = {
              userId: userInfo.userId,
              username: userInfo.username,
              email: userInfo.email,
              isAdmin: userInfo.isAdmin || false
            };
          }
        } catch (err) {
          console.error('Failed to fetch category owner info:', err);
          // Fallback: just use userId
          categoryOwner = {
            userId: oldestTile.userId,
            username: null,
            email: null,
            isAdmin: false
          };
        }
      }
    }
    
    setTileInfoDialog({
      categoryInfo: {
        categoryName,
        tileCount: categoryTiles.length,
        tiles: categoryTiles.map(t => ({
          id: t.id,
          title: t.title,
          userId: t.userId,
          createdAt: t.createdAt,
          canView: t.canView ?? false,
          canEdit: t.canEdit ?? false,
          canDelete: t.canDelete ?? false
        })),
        owner: categoryOwner
      }
    });
  }, []);

  const handleCloseTileInfoDialog = useCallback(() => {
    setTileInfoDialog(null);
  }, []);

  const handleToggleFavorite = useCallback(async (tileId: string) => {
    if (!isAuthenticated) {
      // For public users, toggle public favorites in localStorage
      togglePublicFavorite(tileId);
      // Update public favorites state to trigger re-render
      setPublicFavorites(getPublicFavorites());
      return;
    }

    try {
      const result = await toggleFavorite(tileId);
      // Update the tile's favorite status in local state
      const updatedTiles = tiles.map(tile =>
        tile.id === tileId
          ? { ...tile, isFavorite: result.isFavorite }
          : tile
      );
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      alert('Failed to update favorite. Please try again.');
    }
  }, [tiles, isAuthenticated, onUpdateTiles, onAuthRequired]);

  const handleExportPublicFavorites = useCallback(() => {
    try {
      exportPublicFavorites();
    } catch (error) {
      console.error('Failed to export public favorites:', error);
      alert('Failed to export favorites. Please try again.');
    }
  }, []);

  const handleImportPublicFavorites = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importPublicFavorites(file);
      if (result.success) {
        // Update public favorites state immediately
        const updatedFavorites = getPublicFavorites();
        setPublicFavorites(updatedFavorites);

        // Ensure we're on the favorites tab to see the imported tiles
        if (activeTab !== 'public-favorites') {
          setActiveTab('public-favorites');
        }

        // Force a re-render by updating tiles (this ensures the filtered view updates)
        // The tiles themselves don't change, but this triggers the useMemo to recalculate
        onUpdateTiles([...tiles]);

        alert(result.message);
      } else {
        alert(`Import failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to import public favorites:', error);
      alert('Failed to import favorites. Please ensure the file is a valid export.');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [activeTab, tiles, onUpdateTiles]);

  const handleClearAllPublicFavorites = useCallback(() => {
    const tileCount = publicFavorites.length;
    const linkCount = favoriteLinks.length;
    const totalCount = tileCount + linkCount;

    if (totalCount === 0) {
      alert('No favorites to remove.');
      return;
    }

    const confirmMessage = `Are you sure you want to remove all ${totalCount} favorite(s)? This action will remove both favorite spaces and favorite links. This cannot be undone.`;
    if (window.confirm(confirmMessage)) {
      try {
        clearPublicFavorites();
        clearPublicLinkFavorites();
        // Update states immediately
        setPublicFavorites([]);
        setFavoriteLinks([]);
        alert(`Successfully removed all ${totalCount} favorite(s).`);
      } catch (error) {
        console.error('Failed to clear public favorites:', error);
        alert('Failed to clear favorites. Please try again.');
      }
    }
  }, [publicFavorites, favoriteLinks]);

  // Helper function to check if all tiles in a category are favorited
  const isCategoryFavorited = useCallback((categoryName: string): boolean => {
    const categoryTiles = tiles.filter(tile => (tile.group || 'General') === categoryName);
    if (categoryTiles.length === 0) return false;
    return categoryTiles.every(tile => tile.isFavorite === true);
  }, [tiles]);

  const handleToggleCategoryFavorite = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    try {
      const result = await toggleCategoryFavorite(categoryName);

      // Update all tiles in the category with their new favorite status
      const updatedTiles = tiles.map(tile => {
        if ((tile.group || 'General') === categoryName) {
          return { ...tile, isFavorite: result.isFavorite };
        }
        return tile;
      });
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to toggle category favorite:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to update category favorites: ${errorMsg}`);
    }
  }, [tiles, isAuthenticated, onUpdateTiles, onAuthRequired]);

  // Render mobile view if on mobile device
  if (isMobile && activeTab !== 'monitoring') {
    return (
      <MobileTileView
        tiles={tiles}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onTileClick={handleTileClick}
        activeTab={activeTab}
        groupedTiles={groupedTiles}
        settings={settings}
        darkMode={darkMode}
        toggleTheme={toggleTheme}
        onHelpClick={onHelpClick}
        onTabChange={requestTab}
        isAuthenticated={isAuthenticated}
        disabledTabs={disabledAppTabs}
        onLoginClick={onAuthRequired}
        user={user}
        onToggleFavorite={handleToggleFavorite}
        onUpdateTiles={onUpdateTiles}
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Enhanced Hero Header Section */}
      <div className="linknest-hero-section relative overflow-hidden bg-gradient-to-br from-brand-50 via-violet-50 to-blue-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 border border-brand-200/50 dark:border-slate-700/50">
        {/* Animated background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="linknest-hero-orb-1 absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="linknest-hero-orb-2 absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
          <div className="linknest-hero-orb-3 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <h1 className="linknest-spaces-title text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white">
                {settings.spaces_title || 'My Spaces'}
              </h1>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Enhanced Search Bar */}
            <div className="relative flex-1 sm:w-72">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search spaces..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/50 dark:border-slate-700/50 rounded-xl pl-12 pr-10 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              {/* View Mode Toggle */}
              <div className="flex bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/50 dark:border-slate-700/50 rounded-xl p-1 shadow-sm gap-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'grid'
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  title="Grid View"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                    <path d="M3 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM3 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM4.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                    <path d="M17 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM17 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM18.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setSelectedCategoryFilter(null);
                    setViewMode('categories');
                  }}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'categories'
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  title="Categories View"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Tile Animation Selector - Available for all users */}
              <TileAnimationSelector
                onAnimationChange={(animation) => setCurrentAnimation(animation)}
                onDecorationChange={(decoration) => setCurrentDecoration(decoration)}
              />

              {isAuthenticated && (
                <button
                  onClick={() => {
                    setIsModalOpen(true);
                    if (user && !user.is_admin) {
                      setNewVisibility('private');
                      setNewAllowedUsers([user.id]);
                      setShowUserSelector(true);
                    }
                  }}
                  className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-brand-500/30 hover:shadow-xl hover:shadow-brand-500/40 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Space
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        {!disabledAppTabs.has('public') && (
          <button
            onClick={() => requestTab('public')}
            data-active={activeTab === 'public'}
            className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'public' ? 'active' : ''}`}
          >
            Public
          </button>
        )}
        {isAuthenticated && !disabledAppTabs.has('your-apps') && (
          <button
            onClick={() => requestTab('your-apps')}
            data-active={activeTab === 'your-apps'}
            className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'your-apps' ? 'active' : ''}`}
          >
            Your Apps
            {(() => {
              const roleBasedTiles = tiles.filter(t => t.hasRoleAccess ||
                t.tabs?.some(tab =>
                  tab.sections?.some(section => section.links?.some(link => link.hasRoleAccess)) ||
                  tab.links?.some(link => link.hasRoleAccess)
                )
              );
              return roleBasedTiles.length > 0 ? (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                  {roleBasedTiles.length}
                </span>
              ) : null;
            })()}
          </button>
        )}
        {!isAuthenticated && !disabledAppTabs.has('favorites') && (
          <button
            onClick={() => requestTab('public-favorites')}
            data-active={activeTab === 'public-favorites'}
            className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'public-favorites' ? 'active' : ''}`}
          >
            Favorites
            {(publicFavoritesCount + favoriteLinks.length) > 0 && (
              <span className="ml-2 inline-flex items-center gap-1.5">
                {publicFavoritesCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {publicFavoritesCount} {publicFavoritesCount === 1 ? 'Space' : 'Spaces'}
                  </span>
                )}
                {favoriteLinks.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                    {favoriteLinks.length} {favoriteLinks.length === 1 ? 'Link' : 'Links'}
                  </span>
                )}
              </span>
            )}
          </button>
        )}
        {/* Export/Import buttons for public favorites - only show when favorites tab is active */}
        {!isAuthenticated && !disabledAppTabs.has('favorites') && activeTab === 'public-favorites' && (
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-300 dark:border-slate-600">
            <button
              onClick={handleExportPublicFavorites}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Export favorites to file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 2.955a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 001.09 1.03l2.955-2.955V13.25z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all"
              title="Import favorites from file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.295a.75.75 0 00-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 2.955V2.75z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportPublicFavorites}
              className="hidden"
            />
            <button
              onClick={handleClearAllPublicFavorites}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
              title="Remove all favorites"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
        {isAuthenticated && (
          <>
            {!disabledAppTabs.has('favorites') && (
              <button
                onClick={() => requestTab('favorites')}
                data-active={activeTab === 'favorites'}
                className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'favorites' ? 'active' : ''}`}
              >
                Favorites
                {(favoriteTilesCount + favoriteLinks.length) > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    {favoriteTilesCount > 0 && (
                      <span className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                        {favoriteTilesCount} {favoriteTilesCount === 1 ? 'Space' : 'Spaces'}
                      </span>
                    )}
                    {favoriteLinks.length > 0 && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                        {favoriteLinks.length} {favoriteLinks.length === 1 ? 'Link' : 'Links'}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('private') && (
              <button
                onClick={() => requestTab('private')}
                data-active={activeTab === 'private'}
                className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'private' ? 'active' : ''}`}
              >
                Private
                {privateTilesCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {privateTilesCount}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('scheduled') && (
              <button
                onClick={() => requestTab('scheduled')}
                data-active={activeTab === 'scheduled'}
                className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'scheduled' ? 'active' : ''}`}
              >
                Scheduled
                {scheduledTilesCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {scheduledTilesCount}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('expired') && (
              <button
                onClick={() => requestTab('expired')}
                data-active={activeTab === 'expired'}
                className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'expired' ? 'active' : ''}`}
              >
                Expired
                {expiredTilesCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {expiredTilesCount}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('archive') && (
              <button
                onClick={() => requestTab('archive')}
                data-active={activeTab === 'archive'}
                className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'archive' ? 'active' : ''}`}
              >
                Archive
                {isAuthenticated && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {archiveTiles.length}
                  </span>
                )}
              </button>
            )}
            {isAuthenticated && !disabledAppTabs.has('monitoring') && (
              <button
                onClick={() => requestTab('monitoring')}
                className={`linknest-spaces-tab px-4 py-2 ${activeTab === 'monitoring' ? 'active' : ''}`}
              >
                Monitoring
              </button>
            )}
            {!disabledAppTabs.has('recycle-bin') && (
              <button
                onClick={() => requestTab('recycle-bin')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'recycle-bin'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                Recycle Bin
                {isAuthenticated && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {recycleBinTiles.length}
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Archive Actions */}
      {activeTab === 'archive' && isAuthenticated && (
        <div className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {isLoadingArchive ? (
              'Loading archive...'
            ) : archiveTiles.length === 0 ? (
              'Archive is empty'
            ) : (
              `${archiveTiles.length} space(s) in archive`
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setIsLoadingArchive(true);
                try {
                  const updatedTiles = await getArchive();
                  setArchiveTiles(updatedTiles);
                } catch (error) {
                  console.error('Failed to refresh archive:', error);
                } finally {
                  setIsLoadingArchive(false);
                }
              }}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1.5"
              title="Refresh archive"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
              </svg>
              Refresh
            </button>
            {archiveTiles.length > 0 && user?.is_admin && (
              <button
                onClick={handlePurgeArchive}
                className="px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                title="Move all archived spaces to recycle bin"
              >
                Delete All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Recycle Bin Actions */}
      {activeTab === 'recycle-bin' && isAuthenticated && (
        <div className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {isLoadingRecycleBin ? (
              'Loading recycle bin...'
            ) : recycleBinTiles.length === 0 ? (
              'Recycle bin is empty'
            ) : (
              `${recycleBinTiles.length} space(s) in recycle bin`
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setIsLoadingRecycleBin(true);
                try {
                  const updatedTiles = await getRecycleBin();
                  setRecycleBinTiles(updatedTiles);
                } catch (error) {
                  console.error('Failed to refresh recycle bin:', error);
                } finally {
                  setIsLoadingRecycleBin(false);
                }
              }}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1.5"
              title="Refresh recycle bin"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
              </svg>
              Refresh
            </button>
            {recycleBinTiles.length > 0 && (
              <button
                onClick={handlePurgeRecycleBin}
                className="px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                Purge All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact Stats Bar */}
      {tiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span>{Object.keys(groupedTiles).length} {Object.keys(groupedTiles).length === 1 ? 'Category' : 'Categories'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
            <span>{Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)} {Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0) === 1 ? 'Space' : 'Spaces'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
            <span>{Object.values(groupedTiles).flat().reduce((acc: number, t: Tile) => {
              if (t.isHyperlink) return acc;
              const uniqueLinks = new Set<string>();
              const processLink = (link: any) => {
                const key = `${(link.label || '').toLowerCase()}|${(link.url || '').toLowerCase()}`;
                uniqueLinks.add(key);
              };

              if (t.tabs && t.tabs.length > 0) {
                t.tabs.forEach(tab => {
                  tab.sections?.forEach(section => {
                    section.links?.forEach(processLink);
                  });
                });
              } else {
                t.sections?.forEach(section => {
                  section.links?.forEach(processLink);
                });
              }
              return acc + uniqueLinks.size;
            }, 0)} Links</span>
          </div>
        </div>
      )}

      {/* Show All Categories Button - appears when a category filter is active */}
      {selectedCategoryFilter && viewMode === 'grid' && (
        <div className="mb-4">
          <button
            onClick={() => setSelectedCategoryFilter(null)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
            </svg>
            Show All Categories
            <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
              Filtering: {selectedCategoryFilter}
            </span>
          </button>
        </div>
      )}


      {/* Favorite Links Section - Component */}
      {(() => {
        const favoriteLinksSection = (activeTab === 'favorites' || activeTab === 'public-favorites') && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                </svg>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Favorite Links</h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">({favoriteLinks.length})</span>
              </div>
            </div>

            {/* Sub-row for Sort, Position, and Monitoring Controls */}
            <div className="flex items-center gap-4 mb-4">
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Sort:</span>
                <button
                  onClick={() => setFavLinksSort(prev => prev === 'default' ? 'asc' : 'default')}
                  className={`p-1.5 rounded-lg transition-all ${favLinksSort === 'asc'
                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  title={favLinksSort === 'asc' ? "Sorted alphabetically" : "Sort alphabetically"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 001.06-.04l1.95-2.1v8.59a.75.75 0 001.5 0V4.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L2.2 5.74a.75.75 0 00.04 1.06zm8 4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0-4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0 8a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Reorder Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Position:</span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => handleSetFavoriteLinksAbove(true)}
                    className={`px-2 py-1 text-xs rounded transition-all ${favoriteLinksAbove
                      ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    title="Show links above tiles"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleSetFavoriteLinksAbove(false)}
                    className={`px-2 py-1 text-xs rounded transition-all ${!favoriteLinksAbove
                      ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    title="Show links below tiles"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Monitoring Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportStats}
                  className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md"
                  title="Export stats to CSV"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                    <path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM4.5 4.5v11h11v-11h-11z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M10 13a.75.75 0 01-.75-.75V7.56l-1.72 1.72a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06l-1.72-1.72v4.69A.75.75 0 0110 13z" clipRule="evenodd" />
                  </svg>
                </button>

                <button
                  onClick={handleForceRefresh}
                  disabled={isCheckingHealth}
                  className={`flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 ${isCheckingHealth ? 'animate-spin' : ''}`}
                  title="Force refresh now"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>

                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
                  <div className="relative w-8 h-8 flex items-center justify-center">
                    <svg className="w-6 h-6 rotate-[-90deg]">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-100 dark:text-slate-700" />
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 10) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 10)} className={`${isAutoRefreshEnabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                    </svg>
                    <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                    </button>
                  </div>
                  <select value={autoRefreshInterval} onChange={(e) => setAutoRefreshInterval(Number(e.target.value))} disabled={!isAutoRefreshEnabled} className="bg-transparent text-[10px] font-medium text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-2 pl-0">
                    <option value={10}>10s</option>
                    <option value={30}>30s</option>
                    <option value={60}>1m</option>
                    <option value={180}>3m</option>
                    <option value={300}>5m</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...favoriteLinks]
                .sort((a, b) => {
                  if (favLinksSort === 'asc') {
                    return a.label.localeCompare(b.label);
                  }
                  return 0;
                })
                .map((link, linkIndex) => {
                  // Resolve effective browser (Link specific > Tile default > System default)
                  const parentTile = tiles.find(t => t.id === link.tile.id);
                  const browserToUse = (link.browser && link.browser !== 'default')
                    ? link.browser
                    : (parentTile?.browser && parentTile.browser !== 'default' ? parentTile.browser : null);

                  const animationClass = getTileAnimationClass(currentAnimation);
                  const decorationClass = getTileDecorationClass(currentDecoration);
                  const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
                  const animationDelay = (linkIndex * 50);
                  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

                  // Get health check result for this link
                  const healthResult = linkHealthResults.get(link.id);
                  const healthStatus = healthResult?.health.status || 'unknown';
                  const latency = healthResult?.latency;
                  const httpCode = healthResult?.health.httpCode;

                  return (
                    <div
                      key={link.id}
                      className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden`}
                      style={{ animationDelay: `${animationDelay}ms` }}
                      onClick={(e) => {
                        // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                        if (e.ctrlKey || e.metaKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                          if (newWindow) newWindow.focus();
                          return;
                        }

                        if (settings.browser_specific_links_enabled === '1' && browserToUse) {
                          e.preventDefault();
                          e.stopPropagation();
                          openLinkInBrowser(link.url, browserToUse);
                          return;
                        }

                        // Default behavior
                        window.open(link.url, '_blank');
                      }}
                    >
                      {/* Shark Fin Health Indicator - Top Left Corner */}
                      {healthResult && (
                        <div
                          className="absolute -top-[1px] -left-[1px] w-4 h-4 z-20 pointer-events-none overflow-hidden"
                          title={`Health Status: ${healthStatus.toUpperCase()}${httpCode ? ` (HTTP ${httpCode})` : ''}\n\n${healthResult.serverLatency ? `Server Check Time: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}\n(Time taken by server to check URL via cURL)` : ''}${latency ? `\n\nClient Roundtrip Time: ${favoriteLinkHealthService.formatLatency(latency)}\n(Total time from browser to server and back)` : ''}\n\nDifference = Network overhead + API processing`}
                        >
                          <div
                            className="absolute -top-2 -left-2 w-5 h-5 rotate-45"
                            style={{
                              backgroundColor: (healthStatus === 'healthy' || healthStatus === 'accessible' || healthStatus === 'restricted') ? '#10b981' :
                                healthStatus === 'timeout' ? '#f97316' :
                                  healthStatus === 'broken' ? '#ef4444' : '#94a3b8'
                            }}
                          />
                        </div>
                      )}

                      {/* Link Icon */}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                        {link.icon || '🔗'}
                      </div>

                      {/* Link Info */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {link.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {link.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                        </div>
                        {/* Browser Indicator */}
                        {settings.browser_specific_links_enabled === '1' && browserToUse && (
                          <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            ({formatBrowserName(browserToUse)} browser)
                          </div>
                        )}
                        {/* Parent Tile Info */}
                        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                          <span className="text-xs shrink-0">{link.tile.emoji}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{link.tile.title}</span>
                        </div>
                      </div>

                      {/* Latency and Status Code - Bottom Right Corner */}
                      {healthResult && (healthResult.serverLatency || latency || httpCode) && (
                        <div
                          className="absolute bottom-1 right-1 text-[10px] text-slate-400 dark:text-slate-500 opacity-60 font-mono cursor-help"
                          title={`Health Check Results:\n${healthResult.serverLatency ? `Server Check: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)} (Time for server to check URL)` : ''}${httpCode ? `\nServer Response Code: ${httpCode}` : ''}${latency ? `\n\nClient Roundtrip: ${favoriteLinkHealthService.formatLatency(latency)} (Total time from browser)` : ''}${httpCode ? `\nClient Response Code: ${httpCode}` : ''}\n\nStatus: ${healthStatus.toUpperCase()}`}
                        >
                          {/* Server latency (code) */}
                          {healthResult.serverLatency !== undefined ? (
                            <span>
                              {favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}
                              {httpCode && `(${httpCode})`}
                            </span>
                          ) : null}
                          {/* Separator */}
                          {healthResult.serverLatency !== undefined && latency && <span className="mx-1">|</span>}
                          {/* Client latency (code) */}
                          {latency && (
                            <span>
                              {favoriteLinkHealthService.formatLatency(latency)}
                              {httpCode && `(${httpCode})`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Unfavorite Button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (isAuthenticated) {
                            const { toggleLinkFavorite } = await import('../services/storageService');
                            await toggleLinkFavorite(link.id);
                            const links = await getFavoriteLinks();
                            setFavoriteLinks(links);
                          } else {
                            togglePublicLinkFavorite(link.id);
                            const favIds = getPublicLinkFavorites();
                            const newLinks: FavoriteLink[] = [];
                            tiles.forEach(t => t.sections?.forEach(s => s.links?.forEach(l => {
                              if (favIds.includes(l.id)) newLinks.push({ id: l.id, label: l.label, url: l.url, icon: l.icon, textColor: l.textColor, visibility: l.visibility, notes: l.notes, tooltip: l.tooltip, browser: l.browser, isFavorite: true, health: l.health, tile: { id: t.id, title: t.title, emoji: t.emoji || '✨', themeColor: t.themeColor || 'blue' } });
                            })));
                            setFavoriteLinks(newLinks);
                          }
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all z-10"
                        title="Remove from favorites"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        );

        // Render favorite links above if favoriteLinksAbove is true
        return favoriteLinksAbove ? favoriteLinksSection : null;
      })()}

      {activeTab === 'monitoring' && <MonitoringDashboard />}

      {/* Categories View */}
      {viewMode === 'categories' && activeTab !== 'monitoring' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 mt-6">
          {Object.keys(groupedTiles).map((groupName) => {
            const groupTiles = groupedTiles[groupName];
            const activeTabNameMap: Record<string, string> = {
              'your-apps': 'Your Apps',
              'public': 'Public',
              'favorites': 'Favorites',
              'private': 'Private',
              'scheduled': 'Scheduled',
              'expired': 'Expired',
              'archive': 'Archive',
              'recycle-bin': 'Recycle Bin',
              'monitoring': 'Monitoring',
              'public-favorites': 'Favorites'
            };

            const tabSuffix = activeTabNameMap[activeTab] || activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

            return (
              <div key={groupName} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-40 relative overflow-hidden group cursor-pointer" onClick={() => {
                // Set the category filter and switch to grid view to show only this category
                setSelectedCategoryFilter(groupName);
                setViewMode('grid');
              }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 dark:bg-brand-900/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/20 transition-colors"></div>

                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                        <path d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate flex-1" title={groupName}>{groupName}</h3>
                    {isAuthenticated && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleShowCategoryInfo(groupName, groupTiles);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
                        title="Show category information"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 pl-1">{groupTiles.length} {groupTiles.length === 1 ? 'Space' : 'Spaces'}</p>
                </div>

                <div className="relative z-10 flex justify-end mt-auto">
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-700">
                    {tabSuffix}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tiles Grid - Full Width with More Columns */}
      <div className={activeTab === 'monitoring' || viewMode === 'categories' ? 'hidden' : ''}>
        {Object.keys(groupedTiles).map((groupName, groupIndex) => {
          const groupTiles = groupedTiles[groupName];
          // Use the actual display order (which respects categoryOrder)
          const categoryKeys = Object.keys(groupedTiles);
          const canMoveUp = groupIndex > 0;
          const canMoveDown = groupIndex < categoryKeys.length - 1;

          return (
            <Category
              key={groupName}
              categoryName={groupName}
              tileCount={groupTiles.length}
              isAuthenticated={isAuthenticated}
              groupIndex={groupIndex}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveUp={() => handleMoveCategory(groupName, 'up')}
              onMoveDown={() => handleMoveCategory(groupName, 'down')}
              onDeleteCategory={activeTab !== 'recycle-bin' ? handleDeleteCategory : undefined}
              onArchiveCategory={activeTab !== 'recycle-bin' && activeTab !== 'archive' ? handleArchiveCategory : undefined}
              onUnarchiveCategory={activeTab === 'archive' ? handleUnarchiveCategory : undefined}
              onPermanentDeleteCategory={activeTab === 'recycle-bin' ? handlePermanentDeleteCategory : undefined}
              isRecycleBin={activeTab === 'recycle-bin'}
              isArchive={activeTab === 'archive'}
              onSaveCategoryOrder={handleManualSave}
              onRenameCategory={handleRenameCategory}
              onExportCategory={handleExportCategory}
              onImportCategory={handleImportCategory}
              onCloneCategory={handleCloneCategory}
              onToggleCategoryFavorite={handleToggleCategoryFavorite}
              isCategoryFavorited={isCategoryFavorited(groupName)}
              onScheduleCategory={handleOpenCategorySchedule}
              onManageVisibility={handleOpenManageVisibility}
              onShowCategoryInfo={handleShowCategoryInfo}
              categoryTiles={groupTiles}
              animationClass={`${getTileAnimationClass(currentAnimation)} ${getTileDecorationClass(currentDecoration)}`.trim()}
            >
              {/* Grid with wider tiles */}
              {groupTiles.length > 0 ? (
                <div className="linknest-tile-grid">
                  {groupTiles.map((tile, tileIndex) => {
                    const canMoveLeft = tileIndex > 0;
                    const canMoveRight = tileIndex < groupTiles.length - 1;

                    return (
                      <SortableTile
                        key={tile.id}
                        tile={tile}
                        isAuthenticated={isAuthenticated}
                        onTileClick={handleTileClick}
                        onDeleteTile={handleDeleteTile}
                        onCloneTile={handleCloneTile}
                        onEditTile={handleOpenEditModal}
                        onToggleFavorite={handleToggleFavorite}
                        onMoveToCategory={handleMoveTileToCategory}
                        onMoveLeft={() => handleMoveTile(tile.id, 'left')}
                        onMoveRight={() => handleMoveTile(tile.id, 'right')}
                        onExportTile={handleExportTile}
                        onRestoreTile={activeTab === 'recycle-bin' ? handleRestoreTile : undefined}
                        onPermanentDeleteTile={activeTab === 'recycle-bin' ? handlePermanentDeleteTile : undefined}
                        onArchiveTile={activeTab !== 'archive' && activeTab !== 'recycle-bin' ? handleArchiveTile : undefined}
                        onUnarchiveTile={activeTab === 'archive' ? handleUnarchiveTile : undefined}
                        isRecycleBin={activeTab === 'recycle-bin'}
                        isArchive={activeTab === 'archive'}
                        canMoveLeft={canMoveLeft}
                        canMoveRight={canMoveRight}
                        availableCategories={isAuthenticated && !user?.is_admin && activeTab === 'private'
                          ? allCategories.filter(cat => tiles.some(t => (t.group || 'General') === cat && (t.visibility === 'authenticated' || (t.visibility === 'private' && t.allowedUsers?.includes(user?.id || 0)))))
                          : allCategories
                        }
                        onShowTileInfo={handleShowTileInfo}
                        groupIndex={groupIndex}
                        tileIndex={tileIndex}
                        animationClass={`${getTileAnimationClass(currentAnimation)} ${getTileDecorationClass(currentDecoration)}`.trim()}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm italic">
                  No tiles in this category. Use the menu to move tiles here.
                </div>
              )}
            </Category>
          );
        })}

        {/* Compact Empty State */}
        {tiles.length === 0 && isAuthenticated && (
          <div
            onClick={() => setIsModalOpen(true)}
            className="group flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-400 dark:hover:border-brand-500 transition-all cursor-pointer hover:bg-gradient-to-br hover:from-brand-50/50 hover:to-transparent dark:hover:from-brand-500/5 dark:hover:to-transparent"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-500/20 dark:to-brand-600/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <span className="text-2xl">✨</span>
            </div>
            <p className="font-semibold text-sm mb-1">Create your first space</p>
            <p className="text-xs">Click here to get started</p>
          </div>
        )}

        {/* Compact No Results State */}
        {tiles.length > 0 && Object.keys(groupedTiles).length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">No spaces found</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Try adjusting your search terms</p>
            <button
              onClick={() => setSearchTerm('')}
              className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 text-sm font-medium underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Matching Links Section - Shown when searching */}
      {
        activeTab !== 'monitoring' && searchTerm.trim() && (() => {
          const searchLower = searchTerm.toLowerCase();
          type MatchingLink = {
            id: string;
            label: string;
            url: string;
            icon?: string;
            browser?: string | null;
            health?: any;
            richTextContent?: string;
            tile: {
              id: string;
              title: string;
              emoji: string;
              themeColor: string;
              browser?: string | null;
            };
          };

          // Collect all links that match the search term across both tabs and sections
          // Use a Map to ensure unique links based on label and URL
          const uniqueLinksMap = new Map<string, MatchingLink>();

          Object.values(groupedTiles).forEach((groupTiles: Tile[]) => {
            groupTiles.forEach(tile => {
              // Helper to process a list of sections
              const processSections = (sections: LinkSection[]) => {
                sections.forEach(section => {
                  section.links?.forEach(link => {
                    const uniqueKey = `${link.label.toLowerCase()}|${link.url.toLowerCase()}`;

                    // Only process/add if we haven't seen this specific link yet
                    if (
                      !uniqueLinksMap.has(uniqueKey) &&
                      (link.label.toLowerCase().includes(searchLower))
                    ) {
                      uniqueLinksMap.set(uniqueKey, {
                        id: link.id,
                        label: link.label,
                        url: link.url,
                        icon: link.icon,
                        browser: link.browser,
                        health: link.health,
                        richTextContent: link.richTextContent,
                        tile: {
                          id: tile.id,
                          title: tile.title,
                          emoji: tile.emoji || '✨',
                          themeColor: tile.themeColor || 'blue',
                          browser: tile.browser
                        }
                      });
                    }
                  });
                });
              };

              // Process deprecated sections
              if (tile.sections) {
                processSections(tile.sections);
              }
              // Process sections within tabs
              if (tile.tabs) {
                tile.tabs.forEach(tab => {
                  if (tab.sections) {
                    processSections(tab.sections);
                  }
                });
              }
            });
          });

          // Convert back to array
          const matchingLinks = Array.from(uniqueLinksMap.values());
          if (matchingLinks.length === 0) return null;

          return (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500">
                  <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                  <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                </svg>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Matching Links</h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">({matchingLinks.length})</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {matchingLinks.map((link, linkIndex) => {
                  // Resolve effective browser (Link specific > Tile default > System default)
                  const browserToUse = (link.browser && link.browser !== 'default')
                    ? link.browser
                    : (link.tile.browser && link.tile.browser !== 'default' ? link.tile.browser : null);

                  const animationClass = getTileAnimationClass(currentAnimation);
                  const decorationClass = getTileDecorationClass(currentDecoration);
                  const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
                  const animationDelay = (linkIndex * 50);
                  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

                  return (
                    <div
                      key={link.id}
                      className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass}`}
                      style={{ animationDelay: `${animationDelay}ms` }}
                      onClick={(e) => {
                        // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                        if (e.ctrlKey || e.metaKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          // If rich text content exists, still show dialog on Ctrl/Cmd
                          if (link.richTextContent) {
                            setLinkInfoDialog({ link: link as Link });
                            return;
                          }
                          const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                          if (newWindow) newWindow.focus();
                          return;
                        }

                        // If link has rich text content, show dialog instead of opening URL
                        if (link.richTextContent) {
                          e.preventDefault();
                          e.stopPropagation();
                          setLinkInfoDialog({ link: link as Link });
                          return;
                        }

                        if (settings.browser_specific_links_enabled === '1' && browserToUse) {
                          e.preventDefault();
                          e.stopPropagation();
                          openLinkInBrowser(link.url, browserToUse);
                          return;
                        }

                        // Default behavior
                        window.open(link.url, '_blank');
                      }}
                    >
                      {/* Health Status Indicator */}
                      {link.health && (
                        <div className="shrink-0">
                          <div
                            className={`w-2 h-2 rounded-full ${linkHealthService.getHealthColor(link.health.status)}`}
                            title={`${linkHealthService.getHealthLabel(link.health.status)}${link.health.error ? `: ${link.health.error}` : ''}`}
                          />
                        </div>
                      )}

                      {/* Link Icon */}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                        {link.icon || '🔗'}
                      </div>

                      {/* Link Info */}
                      <div className="flex-1 min-w-0 overflow-hidden pr-10">
                        <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {link.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {link.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                        </div>
                        {/* Browser Indicator */}
                        {settings.browser_specific_links_enabled === '1' && browserToUse && (
                          <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            ({formatBrowserName(browserToUse)} browser)
                          </div>
                        )}
                        {/* Parent Tile Info */}
                        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                          <span className="text-xs shrink-0">{link.tile.emoji}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{link.tile.title}</span>
                        </div>
                      </div>

                      {/* Favorite Button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (isAuthenticated) {
                            const { toggleLinkFavorite } = await import('../services/storageService');
                            await toggleLinkFavorite(link.id);
                            // Reload favorite links
                            const links = await getFavoriteLinks();
                            setFavoriteLinks(links);
                          } else {
                            togglePublicLinkFavorite(link.id);
                            const favIds = getPublicLinkFavorites();
                            const newLinks: FavoriteLink[] = [];
                            tiles.forEach(t => t.sections?.forEach(s => s.links?.forEach(l => {
                              if (favIds.includes(l.id)) newLinks.push({ id: l.id, label: l.label, url: l.url, icon: l.icon, textColor: l.textColor, visibility: l.visibility, notes: l.notes, tooltip: l.tooltip, browser: l.browser, isFavorite: true, health: l.health, tile: { id: t.id, title: t.title, emoji: t.emoji || '✨', themeColor: t.themeColor || 'blue' } });
                            })));
                            setFavoriteLinks(newLinks);
                          }
                        }}
                        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all z-10 ${(isAuthenticated ? favoriteLinks.some(fl => fl.id === link.id) : getPublicLinkFavorites().includes(link.id))
                          ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          }`}
                        title={(isAuthenticated ? favoriteLinks.some(fl => fl.id === link.id) : getPublicLinkFavorites().includes(link.id)) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={(isAuthenticated ? favoriteLinks.some(fl => fl.id === link.id) : getPublicLinkFavorites().includes(link.id)) ? 'currentColor' : 'none'} stroke="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()
      }

      {/* Favorite Links Section - Shown below tiles if favoriteLinksAbove is false */}
      {
        (() => {
          const favoriteLinksSection = (activeTab === 'favorites' || activeTab === 'public-favorites') && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Favorite Links</h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">({favoriteLinks.length})</span>
                </div>
              </div>

              {/* Sub-row for Sort, Position, and Monitoring Controls */}
              <div className="flex items-center gap-4 mb-4">
                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Sort:</span>
                  <button
                    onClick={() => setFavLinksSort(prev => prev === 'default' ? 'asc' : 'default')}
                    className={`p-1.5 rounded-lg transition-all ${favLinksSort === 'asc'
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    title={favLinksSort === 'asc' ? "Sorted alphabetically (Click to reset)" : "Sort alphabetically"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 001.06-.04l1.95-2.1v8.59a.75.75 0 001.5 0V4.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L2.2 5.74a.75.75 0 00.04 1.06zm8 4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0-4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0 8a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {/* Reorder Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Position:</span>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                    <button
                      onClick={() => handleSetFavoriteLinksAbove(true)}
                      className={`px-2 py-1 text-xs rounded transition-all ${favoriteLinksAbove
                        ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      title="Show links above tiles"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleSetFavoriteLinksAbove(false)}
                      className={`px-2 py-1 text-xs rounded transition-all ${!favoriteLinksAbove
                        ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      title="Show links below tiles"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Monitoring Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportStats}
                    className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md"
                    title="Export stats to CSV"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                      <path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM4.5 4.5v11h11v-11h-11z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M10 13a.75.75 0 01-.75-.75V7.56l-1.72 1.72a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06l-1.72-1.72v4.69A.75.75 0 0110 13z" clipRule="evenodd" />
                    </svg>
                  </button>

                  <button
                    onClick={handleForceRefresh}
                    disabled={isCheckingHealth}
                    className={`flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 ${isCheckingHealth ? 'animate-spin' : ''}`}
                    title="Force refresh now"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <svg className="w-6 h-6 rotate-[-90deg]">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-100 dark:text-slate-700" />
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 10) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 10)} className={`${isAutoRefreshEnabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                      </svg>
                      <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                      </button>
                    </div>
                    <select value={autoRefreshInterval} onChange={(e) => setAutoRefreshInterval(Number(e.target.value))} disabled={!isAutoRefreshEnabled} className="bg-transparent text-[10px] font-medium text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-2 pl-0">
                      <option value={10}>10s</option>
                      <option value={30}>30s</option>
                      <option value={60}>1m</option>
                      <option value={180}>3m</option>
                      <option value={300}>5m</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {[...favoriteLinks]
                  .sort((a, b) => {
                    if (favLinksSort === 'asc') {
                      return a.label.localeCompare(b.label);
                    }
                    return 0;
                  })
                  .map((link, linkIndex) => {
                    // Resolve effective browser (Link specific > Tile default > System default)
                    const parentTile = tiles.find(t => t.id === link.tile.id);
                    const browserToUse = (link.browser && link.browser !== 'default')
                      ? link.browser
                      : (parentTile?.browser && parentTile.browser !== 'default' ? parentTile.browser : null);

                    const animationClass = getTileAnimationClass(currentAnimation);
                    const decorationClass = getTileDecorationClass(currentDecoration);
                    const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
                    const animationDelay = (linkIndex * 50);
                    const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

                    // Get health check result for this link
                    const healthResult = linkHealthResults.get(link.id);
                    const healthStatus = healthResult?.health.status || 'unknown';
                    const latency = healthResult?.latency;
                    const httpCode = healthResult?.health.httpCode;

                    return (
                      <div
                        key={link.id}
                        className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden`}
                        style={{ animationDelay: `${animationDelay}ms` }}
                        onClick={(e) => {
                          // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                          if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                            if (newWindow) newWindow.focus();
                            return;
                          }

                          if (settings.browser_specific_links_enabled === '1' && browserToUse) {
                            e.preventDefault();
                            e.stopPropagation();
                            openLinkInBrowser(link.url, browserToUse);
                            return;
                          }

                          // Default behavior
                          window.open(link.url, '_blank');
                        }}
                      >
                        {/* Shark Fin Health Indicator - Top Left Corner */}
                        {healthResult && (
                          <div
                            className="absolute -top-[1px] -left-[1px] w-4 h-4 z-20 pointer-events-none overflow-hidden"
                            title={`Health Status: ${healthStatus.toUpperCase()}${httpCode ? ` (HTTP ${httpCode})` : ''}\n\n${healthResult.serverLatency ? `Server Check Time: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}\n(Time taken by server to check URL via cURL)` : ''}${latency ? `\n\nClient Roundtrip Time: ${favoriteLinkHealthService.formatLatency(latency)}\n(Total time from browser to server and back)` : ''}\n\nDifference = Network overhead + API processing`}
                          >
                            <div
                              className="absolute -top-2 -left-2 w-5 h-5 rotate-45"
                              style={{
                                backgroundColor: (healthStatus === 'healthy' || healthStatus === 'accessible' || healthStatus === 'restricted') ? '#10b981' :
                                  healthStatus === 'timeout' ? '#f97316' :
                                    healthStatus === 'broken' ? '#ef4444' : '#94a3b8'
                              }}
                            />
                          </div>
                        )}

                        {/* Link Icon */}
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                          {link.icon || '🔗'}
                        </div>

                        {/* Link Info */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {link.label}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {link.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                          </div>
                          {/* Browser Indicator */}
                          {settings.browser_specific_links_enabled === '1' && browserToUse && (
                            <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                              ({formatBrowserName(browserToUse)} browser)
                            </div>
                          )}
                          {/* Parent Tile Info */}
                          <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                            <span className="text-xs shrink-0">{link.tile.emoji}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{link.tile.title}</span>
                          </div>
                        </div>

                        {/* Latency and Status Code - Bottom Right Corner */}
                        {healthResult && (healthResult.serverLatency || latency || httpCode) && (
                          <div
                            className="absolute bottom-1 right-1 text-[10px] text-slate-400 dark:text-slate-500 opacity-60 font-mono cursor-help"
                            title={`Health Check Results:\n${healthResult.serverLatency ? `Server Check: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)} (Time for server to check URL)` : ''}${httpCode ? `\nServer Response Code: ${httpCode}` : ''}${latency ? `\n\nClient Roundtrip: ${favoriteLinkHealthService.formatLatency(latency)} (Total time from browser)` : ''}${httpCode ? `\nClient Response Code: ${httpCode}` : ''}\n\nStatus: ${healthStatus.toUpperCase()}`}
                          >
                            {/* Server latency (code) */}
                            {healthResult.serverLatency !== undefined ? (
                              <span>
                                {favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}
                                {httpCode && `(${httpCode})`}
                              </span>
                            ) : null}
                            {/* Separator */}
                            {healthResult.serverLatency !== undefined && latency && <span className="mx-1">|</span>}
                            {/* Client latency (code) */}
                            {latency && (
                              <span>
                                {favoriteLinkHealthService.formatLatency(latency)}
                                {httpCode && `(${httpCode})`}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Unfavorite Button */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (isAuthenticated) {
                              const { toggleLinkFavorite } = await import('../services/storageService');
                              await toggleLinkFavorite(link.id);
                              const links = await getFavoriteLinks();
                              setFavoriteLinks(links);
                            } else {
                              togglePublicLinkFavorite(link.id);
                              const favIds = getPublicLinkFavorites();
                              const newLinks: FavoriteLink[] = [];
                              tiles.forEach(t => t.sections?.forEach(s => s.links?.forEach(l => {
                                if (favIds.includes(l.id)) newLinks.push({ id: l.id, label: l.label, url: l.url, icon: l.icon, textColor: l.textColor, visibility: l.visibility, notes: l.notes, tooltip: l.tooltip, browser: l.browser, isFavorite: true, health: l.health, tile: { id: t.id, title: t.title, emoji: t.emoji || '✨', themeColor: t.themeColor || 'blue' } });
                              })));
                              setFavoriteLinks(newLinks);
                            }
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all z-10"
                          title="Remove from favorites"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          );

          // Render favorite links below if favoriteLinksAbove is false
          return !favoriteLinksAbove ? favoriteLinksSection : null;
        })()
      }

      {/* Compact Add Tile Modal */}
      {
        isModalOpen && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-transparent" style={{ zIndex: 99998 }} onClick={() => setIsModalOpen(false)}></div>
            <div
              ref={modalRef}
              className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col ${isDragging ? 'cursor-move' : ''} ${isDragging || isResizing ? 'will-change-transform' : ''}`}
              style={{
                zIndex: 99999,
                width: modalSize.width > 0 ? `${modalSize.width}px` : '600px',
                maxWidth: '90vw',
                minWidth: '400px',
                height: modalSize.height > 0 ? `${modalSize.height}px` : '700px',
                maxHeight: '90vh',
                minHeight: '300px',
                left: modalPosition.x > 0 ? `${modalPosition.x}px` : 'auto',
                top: modalPosition.y > 0 ? `${modalPosition.y}px` : 'auto',
                position: modalPosition.x > 0 || modalPosition.y > 0 ? 'absolute' : 'relative',
                transition: isDragging || isResizing ? 'none' : undefined
              }}
            >
              <div
                className="flex items-center justify-between mb-6 cursor-move select-none"
                onMouseDown={handleDragStart}
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Create New Space</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Organize your links</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer relative"
                  style={{ zIndex: 100000 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                <div className="space-y-4 pr-2">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Title</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Design Resources"
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                    />
                  </div>

                  {/* Type Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Type</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tileType"
                          value="space"
                          checked={tileType === 'space'}
                          onChange={(e) => {
                            setTileType(e.target.value as 'space' | 'hyperlink');
                            if (e.target.value === 'space') {
                              setNewEmoji('📁'); // Reset to folder for space
                            }
                          }}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Space - Create a new space with links and sections</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tileType"
                          value="hyperlink"
                          checked={tileType === 'hyperlink'}
                          onChange={(e) => {
                            setTileType(e.target.value as 'space' | 'hyperlink');
                            if (e.target.value === 'hyperlink') {
                              setNewEmoji('🔗'); // Set default link emoji
                              // Set default visibility: private for authenticated non-admin users, public for admins
                              if (user && !user.is_admin && isAuthenticated) {
                                setNewVisibility('private');
                              } else if (!user || user.is_admin) {
                                setNewVisibility('public');
                              }
                            } else {
                              setNewEmoji('📁'); // Reset to folder for space
                            }
                          }}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Hyperlink - Direct link to a URL</span>
                      </label>
                    </div>
                  </div>

                  {/* Hyperlink URL - Only shown when type is hyperlink */}
                  {tileType === 'hyperlink' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">URL</label>
                        <input
                          type="url"
                          value={hyperlinkUrl}
                          onChange={(e) => setHyperlinkUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                        <textarea
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                          placeholder="Short description..."
                          rows={2}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 resize-none placeholder-slate-400 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Open Link</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openInNewTab"
                              value="new"
                              checked={openInNewTab === true}
                              onChange={() => setOpenInNewTab(true)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in new tab</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openInNewTab"
                              value="same"
                              checked={openInNewTab === false}
                              onChange={() => setOpenInNewTab(false)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in same tab</span>
                          </label>
                        </div>
                      </div>

                      {/* Emoji & Theme - Also shown for hyperlinks */}
                      <div className="flex gap-3">
                        <div className="w-24 relative">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Icon</label>
                          <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="w-full h-12 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500/50"
                          >
                            {newEmoji || (tileType === 'hyperlink' ? '🔗' : '📁')}
                          </button>

                          {/* Emoji Picker Popover */}
                          {showEmojiPicker && (
                            <>
                              <div className="fixed inset-0" style={{ zIndex: 100001 }} onClick={() => setShowEmojiPicker(false)}></div>
                              <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ zIndex: 100002 }}>
                                <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                  <input
                                    type="text"
                                    value={newEmoji}
                                    onChange={(e) => setNewEmoji(e.target.value)}
                                    placeholder="Type emoji..."
                                    className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-slate-900 dark:text-white"
                                    autoFocus
                                  />
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-1">
                                  {POPULAR_EMOJIS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() => { setNewEmoji(emoji); setShowEmojiPicker(false); }}
                                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Theme</label>
                          <div className="grid grid-cols-9 gap-1.5">
                            {THEME_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => setNewColor(c)}
                                className={`
                              w-8 h-8 rounded-lg border-2 transition-all relative overflow-hidden
                              ${newColor === c ? 'border-brand-500 scale-110 shadow-md shadow-brand-500/30' : 'border-slate-200 dark:border-slate-700 hover:scale-105'} 
                            `}
                                title={c}
                              >
                                <div className={`absolute inset-0 ${COLOR_STYLES[c].base} rounded-md`}></div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Category - Also shown for hyperlinks */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                        <input
                          type="text"
                          value={newGroup}
                          onChange={(e) => setNewGroup(e.target.value)}
                          placeholder="Select or create a category (e.g., Work, Personal)"
                          list="category-suggestions-hyperlink"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                        <datalist id="category-suggestions-hyperlink">
                          {userOwnedCategories.map(cat => <option key={cat} value={cat} />)}
                        </datalist>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                      </div>

                      {/* Visibility Settings - For hyperlinks */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                        <div className="space-y-2">
                          {/* Public - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="visibility-hyperlink"
                                value="public"
                                checked={newVisibility === 'public'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                            </label>
                          )}
                          {/* Authenticated - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="visibility-hyperlink"
                                value="authenticated"
                                checked={newVisibility === 'authenticated'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                            </label>
                          )}
                          {/* Private - For admins and authenticated users */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="visibility-hyperlink"
                              value="private"
                              checked={newVisibility === 'private'}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(true);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                          </label>
                        </div>

                        {/* User and Group Selector for Private Visibility */}
                        {newVisibility === 'private' && isAuthenticated && (
                          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('users')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                  visibilityActiveTab === 'users'
                                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                USERS ({newAllowedUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('groups')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                  visibilityActiveTab === 'groups'
                                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                GROUPS ({newAllowedGroups.length})
                              </button>
                            </div>

                            {/* Search Input */}
                            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={visibilitySearchTerm}
                                  onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                  placeholder={`Search ${visibilityActiveTab}...`}
                                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {visibilitySearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibilitySearchTerm('')}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                              {visibilityActiveTab === 'users' && (
                                isLoadingUsers ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                                ) : availableUsers.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {availableUsers
                                      .filter(u => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return u.username.toLowerCase().includes(searchLower) ||
                                          u.email?.toLowerCase().includes(searchLower);
                                      })
                                      .map(u => {
                                        const isCurrentUserOwner = user && u.id === user.id;
                                        return (
                                          <label 
                                            key={u.id} 
                                            className={`flex items-center gap-2 p-2 rounded ${
                                              isCurrentUserOwner 
                                                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                                : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={newAllowedUsers.includes(u.id) || isCurrentUserOwner}
                                              disabled={isCurrentUserOwner}
                                              onChange={(e) => {
                                                if (isCurrentUserOwner) return;
                                                if (e.target.checked) {
                                                  setNewAllowedUsers([...newAllowedUsers, u.id]);
                                                } else {
                                                  setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                                }
                                              }}
                                              className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${
                                                isCurrentUserOwner ? 'opacity-50 cursor-not-allowed' : ''
                                              }`}
                                            />
                                            <span className={`text-sm flex-1 ${
                                              isCurrentUserOwner 
                                                ? 'text-amber-800 dark:text-amber-200 font-medium'
                                                : 'text-slate-700 dark:text-slate-300'
                                            }`}>
                                              {u.username}
                                            </span>
                                            {isCurrentUserOwner && (
                                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                Owner (You)
                                              </span>
                                            )}
                                            {u.auth_source && u.auth_source !== 'local' && (
                                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                                {u.auth_source.toUpperCase()}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    {availableUsers.filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                    )}
                                  </div>
                                )
                              )}

                              {visibilityActiveTab === 'groups' && (
                                isLoadingGroups ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                                ) : availableGroups.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {availableGroups
                                      .filter(g => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return g.name.toLowerCase().includes(searchLower) ||
                                          (g.description || '').toLowerCase().includes(searchLower);
                                      })
                                      .map(g => (
                                        <label 
                                          key={g.id} 
                                          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedGroups.includes(g.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setNewAllowedGroups([...newAllowedGroups, g.id]);
                                              } else {
                                                setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                              }
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                            {g.description && (
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                            )}
                                          </div>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                          </span>
                                        </label>
                                      ))}
                                    {availableGroups.filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>

                            {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                                Please select at least one user or group for private hyperlinks
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Description - Only shown when type is space */}
                  {tileType === 'space' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                      <textarea
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Short description..."
                        rows={2}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 resize-none placeholder-slate-400 transition-all"
                      />
                    </div>
                  )}

                  {/* Emoji & Theme - Only shown when type is space */}
                  {tileType === 'space' && (
                    <div className="flex gap-3">
                      <div className="w-24 relative">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Icon</label>
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="w-full h-12 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500/50"
                        >
                          {newEmoji || '✨'}
                        </button>

                        {/* Emoji Picker Popover */}
                        {showEmojiPicker && (
                          <>
                            <div className="fixed inset-0 z-[10001]" onClick={() => setShowEmojiPicker(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[10002] flex flex-col overflow-hidden">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <input
                                  type="text"
                                  value={newEmoji}
                                  onChange={(e) => setNewEmoji(e.target.value)}
                                  placeholder="Type emoji..."
                                  className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-slate-900 dark:text-white"
                                  autoFocus
                                />
                              </div>
                              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-1">
                                {POPULAR_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => { setNewEmoji(emoji); setShowEmojiPicker(false); }}
                                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Theme</label>
                        <div className="grid grid-cols-9 gap-1.5">
                          {THEME_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => setNewColor(c)}
                              className={`
                          w-8 h-8 rounded-lg border-2 transition-all relative overflow-hidden
                          ${newColor === c ? 'border-brand-500 scale-110 shadow-md shadow-brand-500/30' : 'border-slate-200 dark:border-slate-700 hover:scale-105'} 
                        `}
                              title={c}
                            >
                              <div className={`absolute inset-0 ${COLOR_STYLES[c].base} rounded-md`}></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category - Only shown when type is space */}
                  {tileType === 'space' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                      <input
                        type="text"
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                        placeholder="Select or create a category (e.g., Work, Personal)"
                        list="category-suggestions-space"
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                      />
                      <datalist id="category-suggestions-space">
                        {userOwnedCategories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                    </div>
                  )}

                  {/* Visibility Settings - Only shown when type is space */}
                  {tileType === 'space' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                      <div className="space-y-2">
                        <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input
                            type="radio"
                            name="visibility"
                            value="public"
                            checked={newVisibility === 'public'}
                            disabled={!!(user && !user.is_admin)}
                            onChange={(e) => {
                              setNewVisibility(e.target.value as TileVisibility);
                              setShowUserSelector(false);
                            }}
                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input
                            type="radio"
                            name="visibility"
                            value="authenticated"
                            checked={newVisibility === 'authenticated'}
                            disabled={!!(user && !user.is_admin)}
                            onChange={(e) => {
                              setNewVisibility(e.target.value as TileVisibility);
                              setShowUserSelector(false);
                            }}
                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="visibility"
                            value="private"
                            checked={newVisibility === 'private'}
                            onChange={(e) => {
                              setNewVisibility(e.target.value as TileVisibility);
                              setShowUserSelector(true);
                            }}
                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                        </label>
                      </div>

                      {/* User and Group Selector for Private Visibility */}
                      {newVisibility === 'private' && isAuthenticated && (
                        <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          {/* Tabs */}
                          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <button
                              type="button"
                              onClick={() => setVisibilityActiveTab('users')}
                              className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                visibilityActiveTab === 'users'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              USERS ({newAllowedUsers.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibilityActiveTab('groups')}
                              className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                visibilityActiveTab === 'groups'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              GROUPS ({newAllowedGroups.length})
                            </button>
                          </div>

                          {/* Search Input */}
                          <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            <div className="relative">
                              <input
                                type="text"
                                value={visibilitySearchTerm}
                                onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                placeholder={`Search ${visibilityActiveTab}...`}
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                              />
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              {visibilitySearchTerm && (
                                <button
                                  type="button"
                                  onClick={() => setVisibilitySearchTerm('')}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                            {visibilityActiveTab === 'users' && (
                              isLoadingUsers ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                              ) : availableUsers.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                              ) : (
                                <div className="space-y-1">
                                  {availableUsers
                                    .filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    })
                                    .map(u => {
                                      const isCurrentUserOwner = user && u.id === user.id;
                                      return (
                                        <label 
                                          key={u.id} 
                                          className={`flex items-center gap-2 p-2 rounded ${
                                            isCurrentUserOwner 
                                              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                              : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedUsers.includes(u.id) || isCurrentUserOwner}
                                            disabled={isCurrentUserOwner}
                                            onChange={(e) => {
                                              if (isCurrentUserOwner) return;
                                              if (e.target.checked) {
                                                setNewAllowedUsers([...newAllowedUsers, u.id]);
                                              } else {
                                                setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                              }
                                            }}
                                            className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${
                                              isCurrentUserOwner ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                          />
                                          <span className={`text-sm flex-1 ${
                                            isCurrentUserOwner 
                                              ? 'text-amber-800 dark:text-amber-200 font-medium'
                                              : 'text-slate-700 dark:text-slate-300'
                                          }`}>
                                            {u.username}
                                          </span>
                                          {isCurrentUserOwner && (
                                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                              Owner (You)
                                            </span>
                                          )}
                                          {u.auth_source && u.auth_source !== 'local' && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                              {u.auth_source.toUpperCase()}
                                            </span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  {availableUsers.filter(u => {
                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                    return u.username.toLowerCase().includes(searchLower) ||
                                      u.email?.toLowerCase().includes(searchLower);
                                  }).length === 0 && (
                                    <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                  )}
                                </div>
                              )
                            )}

                            {visibilityActiveTab === 'groups' && (
                              isLoadingGroups ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                              ) : availableGroups.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                              ) : (
                                <div className="space-y-1">
                                  {availableGroups
                                    .filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    })
                                    .map(g => (
                                      <label 
                                        key={g.id} 
                                        className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={newAllowedGroups.includes(g.id)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setNewAllowedGroups([...newAllowedGroups, g.id]);
                                            } else {
                                              setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                            }
                                          }}
                                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                        />
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                          {g.description && (
                                            <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                          )}
                                        </div>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                          {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                        </span>
                                      </label>
                                    ))}
                                  {availableGroups.filter(g => {
                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                    return g.name.toLowerCase().includes(searchLower) ||
                                      (g.description || '').toLowerCase().includes(searchLower);
                                  }).length === 0 && (
                                    <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                  )}
                                </div>
                              )
                            )}
                          </div>

                          {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                              Please select at least one user or group for private spaces
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scheduling - Only shown when type is space */}
                  {tileType === 'space' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Scheduling</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Available From (optional)</label>
                          <input
                            type="datetime-local"
                            value={visibleFrom}
                            onChange={(e) => setVisibleFrom(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for immediate availability</p>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Expires At (optional)</label>
                          <input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                            min={visibleFrom || undefined}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTile}
                      disabled={
                        !newTitle.trim() ||
                        (newVisibility === 'private' && newAllowedUsers.length === 0) ||
                        (tileType === 'hyperlink' && !hyperlinkUrl.trim())
                      }
                      className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 hover:scale-105 active:scale-95"
                    >
                      {tileType === 'hyperlink' ? 'Create Hyperlink' : 'Create Space'}
                    </button>
                  </div>
                </div>
              </div>
              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeStart}
                className={`absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end ${isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                style={{ zIndex: 100000 }}
              >
                <div className="w-4 h-4 relative">
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-br-lg"></div>
                  <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-slate-400 dark:border-slate-500 rounded-br"></div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Edit Tile Modal */}
      {
        isEditModalOpen && editingTile && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-transparent" style={{ zIndex: 99998 }} onClick={() => {
              setIsEditModalOpen(false);
              setEditingTile(null);
              resetForm();
            }}></div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto" style={{ zIndex: 99999 }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                    {tileType === 'hyperlink' ? 'Edit Hyperlink' : 'Edit Space'}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {tileType === 'hyperlink' ? 'Update your hyperlink settings' : 'Update your space settings'}
                  </p>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setEditModalActiveTab('general')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${editModalActiveTab === 'general'
                    ? 'text-brand-600 dark:text-brand-400 border-brand-500'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  General
                </button>
                <button
                  onClick={() => setEditModalActiveTab('decoration')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${editModalActiveTab === 'decoration'
                    ? 'text-brand-600 dark:text-brand-400 border-brand-500'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  Tile Decoration
                </button>
                {tileType === 'space' && (
                  <button
                    onClick={() => setEditModalActiveTab('messages')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${editModalActiveTab === 'messages'
                      ? 'text-brand-600 dark:text-brand-400 border-brand-500'
                      : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    Tile Message Board
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {editModalActiveTab === 'messages' ? (
                  <div className="space-y-5">
                    {/* Header Section */}
                    <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Scheduled Messages</h3>
                        {messages.length > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full">
                            {messages.length}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setEditingMessageId('new');
                          setMessageContent('');
                          setMessageType('info');
                          setMessageStartDate('');
                          setMessageEndDate('');
                          setMessageIsActive(true);
                          setMessagePriority(0);
                          setMessageTextColor('');
                          setMessageFontStyle('normal');
                          setMessageDisplayLocation('both');
                          setMessageAnimationType('rollover');
                          setMessageDelayBefore(0);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm hover:shadow"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        Add Message
                      </button>
                    </div>

                    {/* Message Editor */}
                    {editingMessageId && (
                      <div className="p-5 border-2 border-brand-200 dark:border-brand-800 rounded-xl bg-gradient-to-br from-brand-50/50 to-slate-50 dark:from-brand-900/20 dark:to-slate-900/50 shadow-sm">
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Message Content
                            </label>
                            <textarea
                              value={messageContent}
                              onChange={(e) => setMessageContent(e.target.value)}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all resize-none"
                              rows={4}
                              placeholder="Enter your message... URLs will be clickable. Use **bold** for bold text and _italic_ for italic text."
                            />
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                              💡 Formatting: URLs are automatically clickable. Use <strong>**text**</strong> for <strong>bold</strong> and <em>_text_</em> for <em>italic</em>.
                            </p>

                            {/* Message Presets - Enhanced with Categories */}
                            <div className="mt-3 space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Quick Presets:</span>
                              </div>

                              {/* Celebrations Category */}
                              <div>
                                <span className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 block">Celebrations</span>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => { setMessageContent("🎉 Happy Birthday!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎉 Birthday
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🎊 Congratulations!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎊 Congratulations
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🎈 Happy Anniversary!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎈 Anniversary
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🎁 Special Event Today!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎁 Special Event
                                  </button>
                                </div>
                              </div>

                              {/* Alerts & Warnings Category */}
                              <div>
                                <span className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 block">Alerts & Warnings</span>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => { setMessageContent("⚠️ Maintenance scheduled. System will be unavailable."); setMessageType('warning'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ⚠️ Maintenance
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🚨 System Alert: Action Required"); setMessageType('alert'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🚨 System Alert
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("⏰ Deadline Reminder: Please complete your tasks"); setMessageType('warning'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ⏰ Deadline
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🔒 Security Update Required"); setMessageType('alert'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🔒 Security Alert
                                  </button>
                                </div>
                              </div>

                              {/* Informational Category */}
                              <div>
                                <span className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 block">Information</span>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => { setMessageContent("ℹ️ Important Update: Please review the changes"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ℹ️ Update
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("📢 Announcement: New features available"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    📢 Announcement
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("💡 Tip: Did you know? Check out our new shortcuts"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    💡 Tip
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("✅ Task Completed Successfully"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ✅ Completed
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Message Type</label>
                              <select
                                value={messageType}
                                onChange={(e) => setMessageType(e.target.value as any)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              >
                                <option value="info">ℹ️ Info</option>
                                <option value="warning">⚠️ Warning</option>
                                <option value="celebration">🎉 Celebration</option>
                                <option value="alert">🚨 Alert</option>
                                <option value="custom">🎨 Custom</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={messageIsActive}
                                  onChange={(e) => setMessageIsActive(e.target.checked)}
                                  className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded border-slate-300 dark:border-slate-600"
                                />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</span>
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Start Date & Time</label>
                              <input
                                type="datetime-local"
                                value={messageStartDate}
                                onChange={(e) => setMessageStartDate(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <div className="mt-2 flex gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('today', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Today
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('tomorrow', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Tomorrow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('thisWeek', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  This Week
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('nextWeek', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Next Week
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">End Date & Time</label>
                              <input
                                type="datetime-local"
                                value={messageEndDate}
                                onChange={(e) => setMessageEndDate(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <div className="mt-2 flex gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('today', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Today
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('tomorrow', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Tomorrow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('thisWeek', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  This Week
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('nextWeek', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Next Week
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Text Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={messageTextColor || '#000000'}
                                  onChange={(e) => setMessageTextColor(e.target.value)}
                                  className="w-16 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={messageTextColor}
                                  onChange={(e) => setMessageTextColor(e.target.value)}
                                  placeholder="#000000"
                                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                                />
                                <button
                                  type="button"
                                  onClick={() => setMessageTextColor('')}
                                  className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Reset to default"
                                >
                                  Reset
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                              <select
                                value={messageFontStyle}
                                onChange={(e) => setMessageFontStyle(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              >
                                <option value="normal">Normal</option>
                                <option value="italic">Italic</option>
                                <option value="bold">Bold</option>
                                <option value="bold italic">Bold Italic</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Display Location</label>
                            <select
                              value={messageDisplayLocation}
                              onChange={(e) => setMessageDisplayLocation(e.target.value as 'tile' | 'detail' | 'both')}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                            >
                              <option value="both">Both (Tile & Detail Page)</option>
                              <option value="tile">Tile Only</option>
                              <option value="detail">Detail Page Only</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Animation Type</label>
                            <select
                              value={messageAnimationType}
                              onChange={(e) => setMessageAnimationType(e.target.value as any)}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                            >
                              <option value="rollover">Rollover (Marquee)</option>
                              <option value="still">Still (No Animation)</option>
                              <option value="flash">Flash</option>
                              <option value="flip-horizontal">Flip Horizontal</option>
                              <option value="flip-vertical">Flip Vertical</option>
                              <option value="bounce">Bounce</option>
                              <option value="pulse">Pulse</option>
                              <option value="shake">Shake</option>
                              <option value="fade">Fade</option>
                              <option value="slide">Slide</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Delay Before Display <span className="text-xs text-slate-500 dark:text-slate-400">(seconds, for sequential messages)</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                value={messageDelayBefore}
                                onChange={(e) => setMessageDelayBefore(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.5"
                                className="w-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Delay before this message appears (useful when multiple messages are active)
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Display Priority <span className="text-xs text-slate-500 dark:text-slate-400">(Lower number = higher priority)</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                value={messagePriority}
                                onChange={(e) => setMessagePriority(parseInt(e.target.value) || 0)}
                                min="0"
                                className="w-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Messages with lower priority numbers display first when multiple are active
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => setEditingMessageId(null)}
                              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                const newMessage: TileMessage = {
                                  id: editingMessageId === 'new' ? Math.random().toString(36).substr(2, 9) : editingMessageId!,
                                  content: messageContent,
                                  type: messageType,
                                  startDate: messageStartDate,
                                  endDate: messageEndDate,
                                  isActive: messageIsActive,
                                  priority: messagePriority,
                                  textColor: messageTextColor || undefined,
                                  fontStyle: messageFontStyle || undefined,
                                  displayLocation: messageDisplayLocation,
                                  animationType: messageAnimationType,
                                  delayBefore: messageDelayBefore || 0
                                };

                                if (editingMessageId === 'new') {
                                  setMessages([...messages, newMessage]);
                                } else {
                                  setMessages(messages.map(m => m.id === editingMessageId ? newMessage : m));
                                }
                                setEditingMessageId(null);
                              }}
                              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm hover:shadow"
                            >
                              {editingMessageId === 'new' ? 'Add Message' : 'Update Message'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message List */}
                    <div className="space-y-3">
                      {messages.length === 0 ? (
                        <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                          </svg>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">No messages scheduled</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">Click "Add Message" to create your first scheduled message</p>
                        </div>
                      ) : (
                        [...messages].sort((a, b) => (a.priority || 0) - (b.priority || 0)).map(msg => {
                          const status = getMessageStatus(msg);
                          return (
                            <div key={msg.id} className="group p-4 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-start bg-white dark:bg-slate-800 hover:shadow-md transition-all hover:border-brand-300 dark:hover:border-brand-700">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${msg.type === 'info' ? 'bg-blue-500' :
                                    msg.type === 'warning' ? 'bg-amber-500' :
                                      msg.type === 'celebration' ? 'bg-purple-500' :
                                        msg.type === 'alert' ? 'bg-red-500' : 'bg-slate-500'
                                    }`}></span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {msg.type === 'info' ? 'ℹ️ Info' :
                                      msg.type === 'warning' ? '⚠️ Warning' :
                                        msg.type === 'celebration' ? '🎉 Celebration' :
                                          msg.type === 'alert' ? '🚨 Alert' : '🎨 Custom'}
                                  </span>
                                  {/* Status Indicator */}
                                  {status === 'active' && (
                                    <span className="px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full">
                                      Active Now
                                    </span>
                                  )}
                                  {status === 'upcoming' && (
                                    <span className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                                      Upcoming
                                    </span>
                                  )}
                                  {status === 'expired' && (
                                    <span className="px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full">
                                      Expired
                                    </span>
                                  )}
                                  {/* Priority Badge */}
                                  <span className="px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full">
                                    Priority: {msg.priority || 0}
                                  </span>
                                </div>
                                <div className="text-sm text-slate-800 dark:text-slate-200 mb-2 leading-relaxed break-words">
                                  {renderMessageContent(msg.content)}
                                </div>
                                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                                  {msg.startDate && (
                                    <div className="flex items-center gap-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c0-.69.56-1.25 1.25-1.25h10c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H6c-.69 0-1.25-.56-1.25-1.25v-6.5z" clipRule="evenodd" />
                                      </svg>
                                      <span>From: {new Date(msg.startDate).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {msg.endDate && (
                                    <div className="flex items-center gap-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c0-.69.56-1.25 1.25-1.25h10c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H6c-.69 0-1.25-.56-1.25-1.25v-6.5z" clipRule="evenodd" />
                                      </svg>
                                      <span>To: {new Date(msg.endDate).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1.5 ml-4">
                                {/* Priority Controls */}
                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      const newPriority = Math.max(0, (msg.priority || 0) - 1);
                                      setMessages(messages.map(m => m.id === msg.id ? { ...m, priority: newPriority } : m));
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
                                    title="Increase priority (decrease number)"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => {
                                      const newPriority = (msg.priority || 0) + 1;
                                      setMessages(messages.map(m => m.id === msg.id ? { ...m, priority: newPriority } : m));
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
                                    title="Decrease priority (increase number)"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                                {/* Action Buttons */}
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(msg.id);
                                      setMessageContent(msg.content);
                                      setMessageType(msg.type);
                                      setMessageStartDate(msg.startDate);
                                      setMessageEndDate(msg.endDate);
                                      setMessageIsActive(msg.isActive);
                                      setMessagePriority(msg.priority || 0);
                                      setMessageTextColor(msg.textColor || '');
                                      setMessageFontStyle(msg.fontStyle || 'normal');
                                      setMessageDisplayLocation(msg.displayLocation || 'both');
                                      setMessageAnimationType(msg.animationType || 'rollover');
                                      setMessageDelayBefore(msg.delayBefore || 0);
                                    }}
                                    className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                                    title="Edit message"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => {
                                      const duplicatedMessage: TileMessage = {
                                        ...msg,
                                        id: Math.random().toString(36).substr(2, 9),
                                        content: msg.content + ' (Copy)'
                                      };
                                      setMessages([...messages, duplicatedMessage]);
                                    }}
                                    className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                                    title="Duplicate message"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setMessages(messages.filter(m => m.id !== msg.id))}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Delete message"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : editModalActiveTab === 'general' ? (
                  <>
                    {/* Title */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Title</label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g., Design Resources"
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                      />
                    </div>

                    {/* URL - Only for hyperlinks */}
                    {tileType === 'hyperlink' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">URL</label>
                        <input
                          type="url"
                          value={hyperlinkUrl}
                          onChange={(e) => setHyperlinkUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                      <textarea
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Short description..."
                        rows={2}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 resize-none placeholder-slate-400 transition-all"
                      />
                    </div>

                    {/* Open Link - Only for hyperlinks */}
                    {tileType === 'hyperlink' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Open Link</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editOpenInNewTab"
                              value="new"
                              checked={openInNewTab === true}
                              onChange={() => setOpenInNewTab(true)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in new tab</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editOpenInNewTab"
                              value="same"
                              checked={openInNewTab === false}
                              onChange={() => setOpenInNewTab(false)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in same tab</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Visibility Settings - For hyperlinks */}
                    {tileType === 'hyperlink' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                        <div className="space-y-2">
                          {/* Public - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="editVisibility-hyperlink"
                                value="public"
                                checked={newVisibility === 'public'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                            </label>
                          )}
                          {/* Authenticated - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="editVisibility-hyperlink"
                                value="authenticated"
                                checked={newVisibility === 'authenticated'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                            </label>
                          )}
                          {/* Private - For admins and authenticated users */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editVisibility-hyperlink"
                              value="private"
                              checked={newVisibility === 'private'}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(true);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                          </label>
                        </div>

                        {/* User and Group Selector for Private Visibility */}
                        {newVisibility === 'private' && isAuthenticated && (
                          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('users')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                  visibilityActiveTab === 'users'
                                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                USERS ({newAllowedUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('groups')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                  visibilityActiveTab === 'groups'
                                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                GROUPS ({newAllowedGroups.length})
                              </button>
                            </div>

                            {/* Search Input */}
                            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={visibilitySearchTerm}
                                  onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                  placeholder={`Search ${visibilityActiveTab}...`}
                                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {visibilitySearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibilitySearchTerm('')}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                              {visibilityActiveTab === 'users' && (
                                isLoadingUsers ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                                ) : availableUsers.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {availableUsers
                                      .filter(u => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return u.username.toLowerCase().includes(searchLower) ||
                                          u.email?.toLowerCase().includes(searchLower);
                                      })
                                      .map(u => {
                                        const isOwner = editingTile && editingTile.userId && u.id === (typeof editingTile.userId === 'string' ? parseInt(editingTile.userId, 10) : editingTile.userId);
                                        return (
                                          <label 
                                            key={u.id} 
                                            className={`flex items-center gap-2 p-2 rounded ${
                                              isOwner 
                                                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                                : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={newAllowedUsers.includes(u.id) || isOwner}
                                              disabled={isOwner}
                                              onChange={(e) => {
                                                if (isOwner) return;
                                                if (e.target.checked) {
                                                  setNewAllowedUsers([...newAllowedUsers, u.id]);
                                                } else {
                                                  setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                                }
                                              }}
                                              className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${
                                                isOwner ? 'opacity-50 cursor-not-allowed' : ''
                                              }`}
                                            />
                                            <span className={`text-sm flex-1 ${
                                              isOwner 
                                                ? 'text-amber-800 dark:text-amber-200 font-medium'
                                                : 'text-slate-700 dark:text-slate-300'
                                            }`}>
                                              {u.username}
                                            </span>
                                            {isOwner && (
                                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                Owner
                                              </span>
                                            )}
                                            {u.auth_source && u.auth_source !== 'local' && (
                                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                                {u.auth_source.toUpperCase()}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    {availableUsers.filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                    )}
                                  </div>
                                )
                              )}

                              {visibilityActiveTab === 'groups' && (
                                isLoadingGroups ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                                ) : availableGroups.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {availableGroups
                                      .filter(g => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return g.name.toLowerCase().includes(searchLower) ||
                                          (g.description || '').toLowerCase().includes(searchLower);
                                      })
                                      .map(g => (
                                        <label 
                                          key={g.id} 
                                          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedGroups.includes(g.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setNewAllowedGroups([...newAllowedGroups, g.id]);
                                              } else {
                                                setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                              }
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                            {g.description && (
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                            )}
                                          </div>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                          </span>
                                        </label>
                                      ))}
                                    {availableGroups.filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>

                            {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                                Please select at least one user or group for private hyperlinks
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Visibility Settings - Only for regular spaces */}
                    {tileType === 'space' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                        <div className="space-y-2">
                          <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                              type="radio"
                              name="editVisibility"
                              value="public"
                              checked={newVisibility === 'public'}
                              disabled={!!(user && !user.is_admin)}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(false);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                              type="radio"
                              name="editVisibility"
                              value="authenticated"
                              checked={newVisibility === 'authenticated'}
                              disabled={!!(user && !user.is_admin)}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(false);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editVisibility"
                              value="private"
                              checked={newVisibility === 'private'}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(true);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                          </label>
                        </div>

                        {/* User and Group Selector for Private Visibility */}
                        {newVisibility === 'private' && isAuthenticated && (
                          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('users')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                  visibilityActiveTab === 'users'
                                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                USERS ({newAllowedUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('groups')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
                                  visibilityActiveTab === 'groups'
                                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                GROUPS ({newAllowedGroups.length})
                              </button>
                            </div>

                            {/* Search Input */}
                            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={visibilitySearchTerm}
                                  onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                  placeholder={`Search ${visibilityActiveTab}...`}
                                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {visibilitySearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibilitySearchTerm('')}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                              {visibilityActiveTab === 'users' && (
                                isLoadingUsers ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                                ) : availableUsers.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {availableUsers
                                      .filter(u => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return u.username.toLowerCase().includes(searchLower) ||
                                          u.email?.toLowerCase().includes(searchLower);
                                      })
                                      .map(u => {
                                        const isOwner = editingTile && editingTile.userId && u.id === (typeof editingTile.userId === 'string' ? parseInt(editingTile.userId, 10) : editingTile.userId);
                                        return (
                                          <label 
                                            key={u.id} 
                                            className={`flex items-center gap-2 p-2 rounded ${
                                              isOwner 
                                                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                                : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={newAllowedUsers.includes(u.id) || isOwner}
                                              disabled={isOwner}
                                              onChange={(e) => {
                                                if (isOwner) return;
                                                if (e.target.checked) {
                                                  setNewAllowedUsers([...newAllowedUsers, u.id]);
                                                } else {
                                                  setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                                }
                                              }}
                                              className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${
                                                isOwner ? 'opacity-50 cursor-not-allowed' : ''
                                              }`}
                                            />
                                            <span className={`text-sm flex-1 ${
                                              isOwner 
                                                ? 'text-amber-800 dark:text-amber-200 font-medium'
                                                : 'text-slate-700 dark:text-slate-300'
                                            }`}>
                                              {u.username}
                                            </span>
                                            {isOwner && (
                                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                Owner
                                              </span>
                                            )}
                                            {u.auth_source && u.auth_source !== 'local' && (
                                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                                {u.auth_source.toUpperCase()}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    {availableUsers.filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                    )}
                                  </div>
                                )
                              )}

                              {visibilityActiveTab === 'groups' && (
                                isLoadingGroups ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                                ) : availableGroups.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {availableGroups
                                      .filter(g => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return g.name.toLowerCase().includes(searchLower) ||
                                          (g.description || '').toLowerCase().includes(searchLower);
                                      })
                                      .map(g => (
                                        <label 
                                          key={g.id} 
                                          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedGroups.includes(g.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setNewAllowedGroups([...newAllowedGroups, g.id]);
                                              } else {
                                                setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                              }
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                            {g.description && (
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                            )}
                                          </div>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                          </span>
                                        </label>
                                      ))}
                                    {availableGroups.filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>

                            {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                                Please select at least one user or group for private spaces
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Emoji & Theme */}
                    <div className="flex gap-3">
                      <div className="w-24 relative">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Icon</label>
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="w-full h-12 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500/50"
                        >
                          {newEmoji || (tileType === 'hyperlink' ? '🔗' : '📁')}
                        </button>

                        {/* Emoji Picker Popover */}
                        {showEmojiPicker && (
                          <>
                            <div className="fixed inset-0 z-[10001]" onClick={() => setShowEmojiPicker(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[10002] flex flex-col overflow-hidden">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <input
                                  type="text"
                                  value={newEmoji}
                                  onChange={(e) => setNewEmoji(e.target.value)}
                                  placeholder="Type emoji..."
                                  className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-slate-900 dark:text-white"
                                  autoFocus
                                />
                              </div>
                              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-1">
                                {POPULAR_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => { setNewEmoji(emoji); setShowEmojiPicker(false); }}
                                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Theme</label>
                        <div className="grid grid-cols-9 gap-1.5">
                          {THEME_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => setNewColor(c)}
                              className={`
                          w-8 h-8 rounded-lg border-2 transition-all relative overflow-hidden
                          ${newColor === c ? 'border-brand-500 scale-110 shadow-md shadow-brand-500/30' : 'border-slate-200 dark:border-slate-700 hover:scale-105'} 
                        `}
                              title={c}
                            >
                              <div className={`absolute inset-0 ${COLOR_STYLES[c].base} rounded-md`}></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                      <input
                        type="text"
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                        placeholder="Select or create a category (e.g., Work, Personal)"
                        list="category-suggestions-edit"
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                      />
                      <datalist id="category-suggestions-edit">
                        {userOwnedCategories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                    </div>

                    {/* Scheduling - Only shown when type is space */}
                    {tileType === 'space' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Scheduling</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Available From (optional)</label>
                            <input
                              type="datetime-local"
                              value={visibleFrom}
                              onChange={(e) => setVisibleFrom(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                            />
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for immediate availability</p>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Expires At (optional)</label>
                            <input
                              type="datetime-local"
                              value={expiresAt}
                              onChange={(e) => setExpiresAt(e.target.value)}
                              min={visibleFrom || undefined}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                            />
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Reset All Decoration */}
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-0.5">Reset Tile Decoration</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">Clear all decoration settings to use global style manager styles</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (confirm('Clear all tile decoration settings? This will reset the tile to use global style manager styles.')) {
                              if (!editingTile) return;

                              // Clear all decoration state
                              setTileBackgroundColor('');
                              setTileGradientEnabled(false);
                              setTileGradientColors(['#3b82f6', '#8b5cf6']);
                              setTileGradientColorPositions([0, 100]);
                              setTileGradientDirection(90);
                              setTileGradientType('linear');
                              setTileBorderRadius(12);
                              setTileTextColor('');

                              // Create updated tile with all decoration properties set to undefined
                              const updatedTile: Tile = {
                                ...editingTile,
                                tileBackgroundColor: undefined,
                                tileGradientEnabled: undefined,
                                tileGradientColors: undefined,
                                tileGradientColorPositions: undefined,
                                tileGradientDirection: undefined,
                                tileGradientType: undefined,
                                tileBorderRadius: undefined,
                                tileTextColor: undefined
                              };

                              try {
                                // Update local state
                                const updatedTiles = tiles.map(t => t.id === updatedTile.id ? updatedTile : t);
                                onUpdateTiles(updatedTiles);

                                // Save to backend if authenticated
                                if (isAuthenticated) {
                                  await saveTile(updatedTile);
                                }

                                // Update editing tile to reflect changes
                                setEditingTile(updatedTile);
                              } catch (error) {
                                console.error('Failed to reset tile decoration:', error);
                                alert('Failed to reset tile decoration. Please try again.');
                              }
                            }
                          }}
                          className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 rounded-lg transition-colors shadow-sm hover:shadow-md"
                        >
                          Reset All
                        </button>
                      </div>
                    </div>

                    {/* Background Color */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Background Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={tileBackgroundColor || '#ffffff'}
                          onChange={(e) => setTileBackgroundColor(e.target.value)}
                          className="w-16 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tileBackgroundColor}
                          onChange={(e) => setTileBackgroundColor(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                        {tileBackgroundColor && (
                          <button
                            onClick={() => setTileBackgroundColor('')}
                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty to use default theme color</p>
                    </div>

                    {/* Gradient Settings */}
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
                        <input
                          type="checkbox"
                          checked={tileGradientEnabled}
                          onChange={(e) => setTileGradientEnabled(e.target.checked)}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Enable Gradient Background</span>
                      </label>

                      {tileGradientEnabled && (
                        <div className="space-y-3 mt-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                          {/* Gradient Type */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Gradient Type</label>
                            <div className="grid grid-cols-3 gap-2">
                              {(['linear', 'radial', 'conic', 'repeating-linear', 'repeating-radial', 'repeating-conic'] as const).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setTileGradientType(type)}
                                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${tileGradientType === type
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                                    }`}
                                >
                                  {type.includes('repeating-')
                                    ? type.replace('repeating-', 'R-').charAt(0).toUpperCase() + type.replace('repeating-', 'R-').slice(1)
                                    : type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Gradient Direction - Slider */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                              Gradient Direction/Angle: {tileGradientDirection}°
                            </label>
                            <div className="flex gap-2 items-center">
                              <input
                                type="range"
                                min="0"
                                max="360"
                                value={tileGradientDirection}
                                onChange={(e) => setTileGradientDirection(parseInt(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                              />
                              <input
                                type="number"
                                min="0"
                                max="360"
                                value={tileGradientDirection}
                                onChange={(e) => setTileGradientDirection(parseInt(e.target.value) || 0)}
                                className="w-20 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">deg</span>
                            </div>
                            <div className="mt-2 flex gap-1 justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>0° (Top)</span>
                              <span>90° (Right)</span>
                              <span>180° (Bottom)</span>
                              <span>270° (Left)</span>
                              <span>360°</span>
                            </div>
                          </div>

                          {/* Gradient Colors with Position Controls */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Gradient Colors</label>
                            <div className="space-y-2">
                              {tileGradientColors.map((color, index) => (
                                <div key={index} className="space-y-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="color"
                                      value={color}
                                      onChange={(e) => {
                                        const newColors = [...tileGradientColors];
                                        newColors[index] = e.target.value;
                                        setTileGradientColors(newColors);
                                      }}
                                      className="w-12 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                                    />
                                    <input
                                      type="text"
                                      value={color}
                                      onChange={(e) => {
                                        const newColors = [...tileGradientColors];
                                        newColors[index] = e.target.value;
                                        setTileGradientColors(newColors);
                                      }}
                                      placeholder="#000000"
                                      className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400"
                                    />
                                    {tileGradientColors.length > 2 && (
                                      <button
                                        onClick={() => {
                                          const newColors = tileGradientColors.filter((_, i) => i !== index);
                                          const newPositions = tileGradientColorPositions.filter((_, i) => i !== index);
                                          setTileGradientColors(newColors);
                                          setTileGradientColorPositions(newPositions);
                                        }}
                                        className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                  {/* Color Position Control */}
                                  <div className="flex gap-2 items-center">
                                    <label className="text-xs text-slate-600 dark:text-slate-400 w-16">Position:</label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={tileGradientColorPositions[index] ?? (index / (tileGradientColors.length - 1)) * 100}
                                      onChange={(e) => {
                                        const newPositions = [...tileGradientColorPositions];
                                        newPositions[index] = parseInt(e.target.value);
                                        setTileGradientColorPositions(newPositions);
                                      }}
                                      className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={tileGradientColorPositions[index] ?? (index / (tileGradientColors.length - 1)) * 100}
                                      onChange={(e) => {
                                        const newPositions = [...tileGradientColorPositions];
                                        newPositions[index] = parseInt(e.target.value) || 0;
                                        setTileGradientColorPositions(newPositions);
                                      }}
                                      className="w-16 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                    />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 w-6">%</span>
                                  </div>
                                </div>
                              ))}
                              {tileGradientColors.length < 5 && (
                                <button
                                  onClick={() => {
                                    setTileGradientColors([...tileGradientColors, '#000000']);
                                    // Add position for new color (evenly spaced)
                                    const newPosition = (tileGradientColors.length / (tileGradientColors.length + 1)) * 100;
                                    setTileGradientColorPositions([...tileGradientColorPositions, newPosition]);
                                  }}
                                  className="w-full px-3 py-2 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 rounded-lg transition-colors border border-brand-200 dark:border-brand-500/30"
                                >
                                  + Add Color
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Gradient Preview */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Preview</label>
                            <div
                              className="w-full h-20 rounded-lg border border-slate-200 dark:border-slate-700"
                              style={{
                                background: (() => {
                                  const hasPositions = tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length;
                                  const gradientStops = tileGradientColors.map((color, i) => {
                                    if (hasPositions) {
                                      return `${color} ${tileGradientColorPositions[i]}%`;
                                    }
                                    return color;
                                  }).join(', ');

                                  if (tileGradientType === 'linear' || tileGradientType === 'repeating-linear') {
                                    const prefix = tileGradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
                                    return `${prefix}(${tileGradientDirection}deg, ${gradientStops})`;
                                  } else if (tileGradientType === 'radial' || tileGradientType === 'repeating-radial') {
                                    const prefix = tileGradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
                                    return `${prefix}(circle, ${gradientStops})`;
                                  } else if (tileGradientType === 'conic' || tileGradientType === 'repeating-conic') {
                                    const prefix = tileGradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
                                    return `${prefix}(from ${tileGradientDirection}deg, ${gradientStops})`;
                                  }
                                  return `linear-gradient(${tileGradientDirection}deg, ${gradientStops})`;
                                })()
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Style Presets */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Style Presets</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          // Metallic Presets
                          { name: 'Gold', colors: ['#FFD700', '#FFA500', '#FF8C00'], direction: 135, textColor: '#fff' },
                          { name: 'Silver', colors: ['#C0C0C0', '#A8A8A8', '#808080'], direction: 135, textColor: '#000' },
                          { name: 'Bronze', colors: ['#CD7F32', '#A0522D', '#8B4513'], direction: 135, textColor: '#fff' },
                          { name: 'Chrome', colors: ['#E8E8E8', '#C0C0C0', '#A0A0A0'], direction: 135, textColor: '#000' },
                          { name: 'Copper', colors: ['#B87333', '#8B4513', '#654321'], direction: 135, textColor: '#fff' },
                          { name: 'Platinum', colors: ['#E5E4E2', '#D3D3D3', '#C0C0C0'], direction: 135, textColor: '#000' },
                          { name: 'Rose Gold', colors: ['#E8B4B8', '#D4A5A9', '#C8969A'], direction: 135, textColor: '#fff' },
                          { name: 'Titanium', colors: ['#878681', '#6B6B6B', '#4F4F4F'], direction: 135, textColor: '#fff' },
                          // Colorful Presets
                          { name: 'Ocean Blue', colors: ['#0077BE', '#00A8E8', '#005F8C'], direction: 135, textColor: '#fff' },
                          { name: 'Sunset', colors: ['#FF6B6B', '#FF8E53', '#FFA07A'], direction: 90, textColor: '#fff' },
                          { name: 'Forest', colors: ['#2D5016', '#3D6B2A', '#4A7C3A'], direction: 180, textColor: '#fff' },
                          { name: 'Purple Dream', colors: ['#6C5CE7', '#A29BFE', '#FD79A8'], direction: 135, textColor: '#fff' },
                          { name: 'Orange Fire', colors: ['#FF5722', '#FF6D00', '#FF8F00'], direction: 90, textColor: '#fff' },
                          { name: 'Mint Fresh', colors: ['#00E676', '#1DE9B6', '#00BFA5'], direction: 135, textColor: '#000' },
                          { name: 'Cherry Blossom', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA'], direction: 90, textColor: '#333' },
                          { name: 'Midnight', colors: ['#2C3E50', '#34495E', '#1A252F'], direction: 135, textColor: '#fff' },
                          { name: 'Lavender', colors: ['#E1BEE7', '#CE93D8', '#BA68C8'], direction: 180, textColor: '#fff' },
                          { name: 'Emerald', colors: ['#00C853', '#00E676', '#00B248'], direction: 135, textColor: '#fff' },
                          { name: 'Coral Reef', colors: ['#FF6F61', '#FF8E80', '#FFAB91'], direction: 90, textColor: '#fff' },
                          { name: 'Sky Blue', colors: ['#42A5F5', '#64B5F6', '#90CAF9'], direction: 180, textColor: '#fff' },
                          { name: 'Raspberry', colors: ['#D81B60', '#E91E63', '#F06292'], direction: 135, textColor: '#fff' },
                          { name: 'Teal Wave', colors: ['#00897B', '#00ACC1', '#26A69A'], direction: 90, textColor: '#fff' },
                          { name: 'Amber Glow', colors: ['#FFC107', '#FFD54F', '#FFECB3'], direction: 135, textColor: '#000' },
                          { name: 'Deep Purple', colors: ['#673AB7', '#7E57C2', '#9575CD'], direction: 135, textColor: '#fff' },
                          { name: 'Turquoise', colors: ['#009688', '#00BCD4', '#4DD0E1'], direction: 90, textColor: '#fff' },
                          { name: 'Peachy', colors: ['#FF9800', '#FFB74D', '#FFCC80'], direction: 180, textColor: '#fff' },
                          { name: 'Navy', colors: ['#1565C0', '#1976D2', '#1E88E5'], direction: 135, textColor: '#fff' },
                          { name: 'Rose Pink', colors: ['#E91E63', '#F06292', '#F48FB1'], direction: 90, textColor: '#fff' }
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => {
                              setTileGradientEnabled(true);
                              setTileGradientType('linear');
                              setTileGradientDirection(preset.direction);
                              setTileGradientColors(preset.colors);
                              // Set evenly spaced positions for presets
                              const positions = preset.colors.map((_, i) => preset.colors.length > 1 ? (i / (preset.colors.length - 1)) * 100 : 0);
                              setTileGradientColorPositions(positions);
                              setTileTextColor(preset.textColor);
                            }}
                            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-400 transition-all relative overflow-hidden"
                            style={{
                              background: `linear-gradient(${preset.direction}deg, ${preset.colors.join(', ')})`,
                              color: preset.textColor
                            }}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Text Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={tileTextColor || '#000000'}
                          onChange={(e) => setTileTextColor(e.target.value)}
                          className="w-16 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tileTextColor}
                          onChange={(e) => setTileTextColor(e.target.value)}
                          placeholder="#000000"
                          className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                        {tileTextColor && (
                          <button
                            onClick={() => setTileTextColor('')}
                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty to use default text color</p>
                    </div>

                    {/* Border Radius */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Border Radius (px)</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={tileBorderRadius}
                          onChange={(e) => setTileBorderRadius(parseInt(e.target.value))}
                          className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                        />
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={tileBorderRadius}
                          onChange={(e) => setTileBorderRadius(parseInt(e.target.value) || 0)}
                          className="w-20 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        />
                      </div>
                    </div>

                    {/* Live Tile Preview */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Live Preview</label>
                      <div className="relative">
                        <div
                          className="w-full min-h-[120px] rounded-lg border-2 border-slate-200 dark:border-slate-700 p-4 flex flex-col items-center justify-center transition-all"
                          style={{
                            background: tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0
                              ? (() => {
                                const hasPositions = tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length;
                                const gradientStops = tileGradientColors.map((color, i) => {
                                  if (hasPositions) {
                                    return `${color} ${tileGradientColorPositions[i]}%`;
                                  }
                                  return color;
                                }).join(', ');

                                if (tileGradientType === 'linear' || tileGradientType === 'repeating-linear') {
                                  const prefix = tileGradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
                                  return `${prefix}(${tileGradientDirection}deg, ${gradientStops})`;
                                } else if (tileGradientType === 'radial' || tileGradientType === 'repeating-radial') {
                                  const prefix = tileGradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
                                  return `${prefix}(circle, ${gradientStops})`;
                                } else if (tileGradientType === 'conic' || tileGradientType === 'repeating-conic') {
                                  const prefix = tileGradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
                                  return `${prefix}(from ${tileGradientDirection}deg, ${gradientStops})`;
                                }
                                return `linear-gradient(${tileGradientDirection}deg, ${gradientStops})`;
                              })()
                              : tileBackgroundColor || 'transparent',
                            borderRadius: `${tileBorderRadius}px`,
                            color: tileTextColor || undefined
                          }}
                        >
                          <div className="text-4xl mb-2">{editingTile?.emoji || '📁'}</div>
                          <div className="text-sm font-semibold">{editingTile?.title || 'Tile Preview'}</div>
                          {editingTile?.description && (
                            <div className="text-xs mt-1 opacity-75">{editingTile.description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingTile(null);
                      resetForm();
                    }}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateTile}
                    disabled={
                      !newTitle.trim() ||
                      (tileType === 'hyperlink' && !hyperlinkUrl.trim()) ||
                      (newVisibility === 'private' && newAllowedUsers.length === 0)
                    }
                    className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 hover:scale-105 active:scale-95"
                  >
                    {tileType === 'hyperlink' ? 'Update Hyperlink' : 'Update Space'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Category Scheduling Modal */}
      {
        editingCategorySchedule && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-transparent" style={{ zIndex: 99998 }} onClick={() => {
              setEditingCategorySchedule(null);
              setCategoryVisibleFrom('');
              setCategoryExpiresAt('');
            }}></div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200" style={{ zIndex: 99999 }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Schedule Category</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{editingCategorySchedule}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingCategorySchedule(null);
                    setCategoryVisibleFrom('');
                    setCategoryExpiresAt('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Scheduling</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Available From (optional)</label>
                      <input
                        type="datetime-local"
                        value={categoryVisibleFrom}
                        onChange={(e) => setCategoryVisibleFrom(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for immediate availability</p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Expires At (optional)</label>
                      <input
                        type="datetime-local"
                        value={categoryExpiresAt}
                        onChange={(e) => setCategoryExpiresAt(e.target.value)}
                        min={categoryVisibleFrom || undefined}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setEditingCategorySchedule(null);
                      setCategoryVisibleFrom('');
                      setCategoryExpiresAt('');
                    }}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCategorySchedule}
                    className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 hover:scale-105 active:scale-95"
                  >
                    Save Schedule
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Category Visibility Management Modal */}
      {editingCategoryVisibility && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <CategoryVisibilityDialog
            categoryName={editingCategoryVisibility}
            tiles={tiles.filter(t => (t.group || 'General') === editingCategoryVisibility)}
            users={visibilityUsers}
            onClose={() => setEditingCategoryVisibility(null)}
            onSave={handleSaveVisibilityChanges}
          />
        </div>,
        document.body
      )}

      {/* Import Progress Modal */}
      {importProgress && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Importing Tiles
                </h3>
                <button
                  onClick={() => setImportProgress(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={importProgress.total > 0 && importProgress.current < importProgress.total}
                >
                  ✕
                </button>
              </div>

              {/* Progress Display */}
              <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                    <span>{importProgress.status}</span>
                    {importProgress.total > 0 && (
                      <span>{importProgress.current} / {importProgress.total}</span>
                    )}
                  </div>
                  {importProgress.total > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {importProgress.errors.length > 0 && (
                  <div className="mt-3 max-h-32 overflow-y-auto">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Errors ({importProgress.errors.length}):
                    </p>
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                      {importProgress.errors.slice(0, 5).map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                      {importProgress.errors.length > 5 && (
                        <li>... and {importProgress.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {importProgress.current >= importProgress.total && importProgress.total > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setImportProgress(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Export Progress Modal */}
      {exportProgress && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Exporting Tiles
                </h3>
                <button
                  onClick={() => setExportProgress(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={exportProgress.total > 0 && exportProgress.current < exportProgress.total}
                >
                  ✕
                </button>
              </div>

              {/* Progress Display */}
              <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                    <span>{exportProgress.status}</span>
                    {exportProgress.total > 0 && (
                      <span>{exportProgress.current} / {exportProgress.total}</span>
                    )}
                  </div>
                  {exportProgress.total > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {exportProgress.errors.length > 0 && (
                  <div className="mt-3 max-h-32 overflow-y-auto">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Errors ({exportProgress.errors.length}):
                    </p>
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                      {exportProgress.errors.slice(0, 5).map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                      {exportProgress.errors.length > 5 && (
                        <li>... and {exportProgress.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {exportProgress.current >= exportProgress.total && exportProgress.total > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setExportProgress(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Category Progress Modal */}
      {deleteCategoryProgress && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Deleting Category
                </h3>
                <button
                  onClick={() => setDeleteCategoryProgress(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={deleteCategoryProgress.total > 0 && deleteCategoryProgress.current < deleteCategoryProgress.total}
                >
                  ✕
                </button>
              </div>

              {/* Progress Display */}
              <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                    <span>{deleteCategoryProgress.status}</span>
                    {deleteCategoryProgress.total > 0 && (
                      <span>{deleteCategoryProgress.current} / {deleteCategoryProgress.total}</span>
                    )}
                  </div>
                  {deleteCategoryProgress.total > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(deleteCategoryProgress.current / deleteCategoryProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Category: <span className="font-medium">{deleteCategoryProgress.categoryName}</span>
                </div>
              </div>

              {deleteCategoryProgress.current >= deleteCategoryProgress.total && deleteCategoryProgress.total > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteCategoryProgress(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Link Info Dialog */}
      {linkInfoDialog && (
        <LinkInfoDialog
          isOpen={!!linkInfoDialog}
          onClose={() => setLinkInfoDialog(null)}
          linkLabel={linkInfoDialog.link.label}
          linkIcon={linkInfoDialog.link.icon}
          richTextContent={linkInfoDialog.link.richTextContent || ''}
          linkUrl={linkInfoDialog.link.url}
          browser={linkInfoDialog.link.browser}
        />
      )}

      {/* Tile/Category Info Dialog */}
      {tileInfoDialog && (
        <TileInfoDialog
          isOpen={!!tileInfoDialog}
          onClose={handleCloseTileInfoDialog}
          tile={tileInfoDialog.tile}
          categoryInfo={tileInfoDialog.categoryInfo}
        />
      )}
    </div >
  );
};
