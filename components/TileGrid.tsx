import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tile, LinkSection, ThemeColor, THEME_COLORS, COLOR_STYLES, POPULAR_EMOJIS, TileVisibility } from '../types';
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


interface TileGridProps {
  tiles: Tile[];
  onUpdateTiles: (tiles: Tile[]) => void;
  onCreateTile?: (tile: Tile) => Promise<void>;
  onDeleteTile?: (tileId: string) => Promise<void>;
  onCloneTile?: (tileId: string) => Promise<void>;
  isAuthenticated?: boolean;
  onAuthRequired?: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

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
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

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
  const currentCategory = tile.group || 'General';

  const animationDelay = (groupIndex * 80) + (tileIndex * 50);

  const style = {
    animationDelay: `${animationDelay}ms`,
  };

  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

  return (
    <div
      style={style}
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
        linknest-tile ${tileAnimatedClass} ${animationClass} group relative rounded-xl border border-slate-200 dark:border-slate-700/50
        hover:border-brand-300 dark:hover:border-brand-500/50
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
              {onMoveToCategory && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowCategoryMenu(!showCategoryMenu);
                    }}
                    className="p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
                    title="Move to category"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zm0-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM9 12a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0V12z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Category Dropdown Menu */}
                  {showCategoryMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-[100]"
                        onClick={() => setShowCategoryMenu(false)}
                      ></div>
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-[101] py-1 max-h-64 overflow-y-auto">
                        <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700">
                          Move to Category
                        </div>
                        {availableCategories.map((category) => (
                          <button
                            key={category}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (category !== currentCategory && onMoveToCategory) {
                                onMoveToCategory(tile.id, category);
                              }
                              setShowCategoryMenu(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${category === currentCategory
                              ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{category}</span>
                              {category === currentCategory && (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-brand-500">
                                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
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

          {/* Edit Button - Only show if user has edit permission */}
          {onEditTile && tile.canEdit && (
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


          {/* Clone Button - Only show if user has edit permission (creating a copy requires edit rights) */}
          {onCloneTile && tile.canEdit && (
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
              {tile.canDelete && onDeleteTile && (
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
          ) : tile.canDelete ? (
            // Show delete and archive buttons if user has delete permission
            <>
              <button
                onClick={(e) => onDeleteTile(e, tile.id)}
                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
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
  onAuthRequired
}) => {
  const { settings } = useSettings();
  const { user } = useAuth();
  
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
  const [availableUsers, setAvailableUsers] = useState<UserListItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showUserSelector, setShowUserSelector] = useState(false);

  // Hyperlink state
  const [tileType, setTileType] = useState<'space' | 'hyperlink'>('space');
  const [hyperlinkUrl, setHyperlinkUrl] = useState('');
  const [openInNewTab, setOpenInNewTab] = useState(true);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
  const groupedTiles = useMemo(() => {
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
      visibility: tileType === 'space' ? newVisibility : 'public',
      allowedUsers: (tileType === 'space' && newVisibility === 'private') ? newAllowedUsers : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined,
      visibleFrom: visibleFrom.trim() ? new Date(visibleFrom).toISOString() : undefined,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined
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
    setShowUserSelector(false);
    setTileType('space');
    setHyperlinkUrl('');
    setOpenInNewTab(true);
    setVisibleFrom('');
    setExpiresAt('');
  };

  // Fetch users when modal opens and visibility is private
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
    setNewVisibility(tile.visibility || 'public');
    setNewAllowedUsers(tile.allowedUsers || []);
    // Convert ISO date strings to datetime-local format (YYYY-MM-DDTHH:mm)
    setVisibleFrom(tile.visibleFrom ? new Date(tile.visibleFrom).toISOString().slice(0, 16) : '');
    setExpiresAt(tile.expiresAt ? new Date(tile.expiresAt).toISOString().slice(0, 16) : '');
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

    const updatedTile: Tile = {
      ...editingTile,
      title: newTitle,
      description: newDesc,
      emoji: newEmoji,
      themeColor: newColor,
      group: newGroup.trim() || 'General',
      visibility: tileType === 'space' ? newVisibility : 'public',
      allowedUsers: (tileType === 'space' && newVisibility === 'private') ? newAllowedUsers : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined,
      visibleFrom: visibleFrom.trim() ? new Date(visibleFrom).toISOString() : undefined,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined
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

        // Build arrangement preserving order within each category
        const arrangement: Array<{ tileId: string; position: number; groupName: string }> = [];
        let globalPosition = 0;

        // Use categoryOrder if available, otherwise use order from tiles
        const orderedCategories: string[] = [];
        const seenCats = new Set<string>();

        if (categoryOrder.length > 0) {
          // Add categories from saved order first
          categoryOrder.forEach(cat => {
            if (grouped[cat] && !seenCats.has(cat)) {
              orderedCategories.push(cat);
              seenCats.add(cat);
            }
          });
        }

        // Add any remaining categories in their order of appearance
        Object.keys(grouped).forEach(cat => {
          if (!seenCats.has(cat)) {
            orderedCategories.push(cat);
          }
        });

        orderedCategories.forEach(categoryName => {
          const categoryTiles = grouped[categoryName] || [];
          categoryTiles.forEach(tile => {
            arrangement.push({
              tileId: tile.id,
              position: globalPosition++,
              groupName: categoryName
            });
          });
        });

        await saveTileArrangement(arrangement);
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
  }, [tiles, isAuthenticated, onUpdateTiles]);

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
    (categoryName: string) => {
      if (!user?.is_admin) {
        alert('Only administrators can export categories.');
        return;
      }
      exportCategoryToFile(categoryName, tiles);
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
            alert('No tiles/spaces found to import.');
            return;
          }

          // Import tiles one by one using createTile API
          let successCount = 0;
          let errorCount = 0;
          const errors: string[] = [];

          for (const tile of tilesToImport) {
            try {
              await createTile(tile);
              successCount++;
            } catch (error) {
              errorCount++;
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              errors.push(`Failed to import "${tile.title}": ${errorMsg}`);
              console.error('Failed to import tile:', tile.title, error);
            }
          }

          // Refresh tiles from server
          try {
            const updatedTiles = await getTiles();
            onUpdateTiles(updatedTiles);
          } catch (error) {
            console.error('Failed to refresh tiles:', error);
          }

          // Show results
          if (errorCount === 0) {
            alert(`Successfully imported ${successCount} tile(s) to category "${categoryName}".`);
          } else {
            alert(
              `Imported ${successCount} tile(s) successfully.\n` +
              `Failed to import ${errorCount} tile(s).\n\n` +
              `Errors:\n${errors.join('\n')}`
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          alert(`Failed to import tiles: ${errorMsg}`);
          console.error('Import error:', error);
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
        const arrangement = updatedTiles.map((tile, index) => ({
          tileId: tile.id,
          position: index,
          groupName: tile.group || 'General'
        }));
        await saveTileArrangement(arrangement);

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
  }, [tiles, isAuthenticated, onUpdateTiles, categoryOrder, categoryMetadata]);

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
      // Soft delete all tiles in this category (move to recycle bin)
      const deletePromises = categoryTiles.map(tile => deleteTile(tile.id));
      await Promise.all(deletePromises);

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
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category. Please try again.');
    }
  }, [tiles, archiveTiles, isAuthenticated, onUpdateTiles, categoryOrder, categoryMetadata, activeTab]);

  const handleOpenCategorySchedule = useCallback((categoryName: string) => {
    const metadata = categoryMetadata[categoryName];
    setCategoryVisibleFrom(metadata?.visibleFrom ? new Date(metadata.visibleFrom).toISOString().slice(0, 16) : '');
    setCategoryExpiresAt(metadata?.expiresAt ? new Date(metadata.expiresAt).toISOString().slice(0, 16) : '');
    setEditingCategorySchedule(categoryName);
  }, [categoryMetadata]);

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
      const arrangement: Array<{ tileId: string; position: number; groupName: string }> =
        reorderedTiles.map((tile, index) => ({
          tileId: tile.id,
          position: index,
          groupName: tile.group || 'General',
        }));

      await saveTileArrangement(arrangement);
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      // Don't alert on auto-save failure to avoid annoying popups, 
      // let the user use the manual save button if needed.
    }
  }, [tiles, isAuthenticated, onUpdateTiles]);

  const handleManualSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const arrangement: Array<{ tileId: string; position: number; groupName: string }> =
        tiles.map((tile, index) => ({
          tileId: tile.id,
          position: index,
          groupName: tile.group || 'General',
        }));

      await saveTileArrangement(arrangement);
      alert('Tile order saved successfully!');
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      alert('Failed to save tile order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  }, [tiles, isSaving]);

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
              {/* Tile Animation Selector - Available for all users */}
              <TileAnimationSelector
                onAnimationChange={(animation) => setCurrentAnimation(animation)}
                onDecorationChange={(decoration) => setCurrentDecoration(decoration)}
              />

              {isAuthenticated && (
                <button
                  onClick={() => setIsModalOpen(true)}
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

      {/* Tiles Grid - Full Width with More Columns */}
      <div className={activeTab === 'monitoring' ? 'hidden' : ''}>
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
                        availableCategories={allCategories}
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
                          {allCategories.map(cat => <option key={cat} value={cat} />)}
                        </datalist>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
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
                        {allCategories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                    </div>
                  )}

                  {/* Visibility Settings - Only shown when type is space */}
                  {tileType === 'space' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="visibility"
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
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="visibility"
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

                      {/* User Selector for Private Visibility */}
                      {newVisibility === 'private' && isAuthenticated && (
                        <div className="mt-3">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Select Users</label>
                          {isLoadingUsers ? (
                            <div className="text-sm text-slate-500 dark:text-slate-400">Loading users...</div>
                          ) : (
                            <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-slate-50 dark:bg-slate-900/50">
                              {availableUsers.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400">No users available</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {availableUsers.map(user => (
                                    <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded">
                                      <input
                                        type="checkbox"
                                        checked={newAllowedUsers.includes(user.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setNewAllowedUsers([...newAllowedUsers, user.id]);
                                          } else {
                                            setNewAllowedUsers(newAllowedUsers.filter(id => id !== user.id));
                                          }
                                        }}
                                        className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                      />
                                      <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                      {user.auth_source && user.auth_source !== 'local' && (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">({user.auth_source})</span>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {newVisibility === 'private' && newAllowedUsers.length === 0 && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Please select at least one user for private spaces</p>
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
                        (tileType === 'space' && newVisibility === 'private' && newAllowedUsers.length === 0) ||
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

              <div className="space-y-4">
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

                {/* Visibility Settings - Only for regular spaces */}
                {tileType === 'space' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="editVisibility"
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
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="editVisibility"
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

                    {/* User Selector for Private Visibility */}
                    {newVisibility === 'private' && isAuthenticated && (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Select Users</label>
                        {isLoadingUsers ? (
                          <div className="text-sm text-slate-500 dark:text-slate-400">Loading users...</div>
                        ) : (
                          <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-slate-50 dark:bg-slate-900/50">
                            {availableUsers.length === 0 ? (
                              <div className="text-sm text-slate-500 dark:text-slate-400">No users available</div>
                            ) : (
                              <div className="space-y-1.5">
                                {availableUsers.map(user => (
                                  <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded">
                                    <input
                                      type="checkbox"
                                      checked={newAllowedUsers.includes(user.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setNewAllowedUsers([...newAllowedUsers, user.id]);
                                        } else {
                                          setNewAllowedUsers(newAllowedUsers.filter(id => id !== user.id));
                                        }
                                      }}
                                      className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                    {user.auth_source && user.auth_source !== 'local' && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400">({user.auth_source})</span>
                                    )}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {newVisibility === 'private' && newAllowedUsers.length === 0 && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Please select at least one user for private spaces</p>
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
                    {allCategories.map(cat => <option key={cat} value={cat} />)}
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
                      (tileType === 'space' && newVisibility === 'private' && newAllowedUsers.length === 0)
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
    </div >
  );
};
