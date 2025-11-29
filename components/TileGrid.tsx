import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Tile, LinkSection, ThemeColor, THEME_COLORS, COLOR_STYLES, POPULAR_EMOJIS, TileVisibility } from '../types';
import { generateTileContent, GeneratedTileContent } from '../services/geminiService';
import { useSettings } from '../contexts/SettingsContext';
import { saveTileArrangement, saveCategoryArrangement, getCategoryArrangement, toggleFavorite, saveTile, createTile, getTiles, cloneCategory, toggleCategoryFavorite } from '../services/storageService';
import {
  exportCategoryToFile,
  exportTileToFile,
  parseSpaceExportObject,
  normalizeImportedTiles
} from '../services/spaceTransferService';
import { authService, UserListItem } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

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
  onSaveCategoryOrder?: () => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  onExportCategory?: (categoryName: string) => void;
  onImportCategory?: (categoryName: string) => void;
  onCloneCategory?: (categoryName: string) => void;
  onToggleCategoryFavorite?: (categoryName: string) => void;
  isCategoryFavorited?: boolean;
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
  onSaveCategoryOrder,
  onRenameCategory,
  onExportCategory,
  onImportCategory,
  onCloneCategory,
  onToggleCategoryFavorite,
  isCategoryFavorited = false
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
      className="linknest-category linknest-category-animated"
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
            {onDeleteCategory && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to delete the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will move ${tileCount} tile(s) to "General" category.` : ''}`)) {
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
            {onCloneCategory && user?.is_admin && (
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
            {onToggleCategoryFavorite && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCategoryFavorite(categoryName);
                }}
                className={`opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 rounded-md transition-all ml-1 ${
                  isCategoryFavorited
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
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  availableCategories: string[];
  groupIndex: number;
  tileIndex: number;
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
  canMoveLeft = false,
  canMoveRight = false,
  availableCategories,
  groupIndex,
  tileIndex
}) => {
  const { user } = useAuth();
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];
  const linkCount = tile.isHyperlink ? 0 : (tile.sections?.reduce((acc, section) => acc + section.links.length, 0) || 0);
  const currentCategory = tile.group || 'General';

  const animationDelay = (groupIndex * 80) + (tileIndex * 50);

  const style = {
    animationDelay: `${animationDelay}ms`,
  };

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
        linknest-tile linknest-tile-animated group relative rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50
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
        {isAuthenticated && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
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

            {/* Favorite Button */}
            {onToggleFavorite && (
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


            {/* Delete Button - Only show if user has delete permission */}
            {tile.canDelete && (
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
          </div>
        )}
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

type TabType = 'favorites' | 'public' | 'private';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<Tile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('public');

  // New Tile Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newEmoji, setNewEmoji] = useState('📁');
  const [newColor, setNewColor] = useState<ThemeColor>('blue');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{ label: string, url: string }[]>([]);
  const [newVisibility, setNewVisibility] = useState<TileVisibility>('public');
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


  // Category order state
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Load global category arrangement on mount (works for all users)
  useEffect(() => {
    const loadCategoryOrder = async () => {
      try {
        const arrangement = await getCategoryArrangement();
        if (arrangement.length > 0) {
          // Read categories in saved order (already sorted by position from API)
          const ordered = arrangement.map(c => c.categoryName);
          setCategoryOrder(ordered);
        } else {
          // Reset to empty if no arrangement found
          setCategoryOrder([]);
        }
      } catch (error) {
        console.error('Failed to load category arrangement:', error);
        // On error, reset to empty to avoid stale data
        setCategoryOrder([]);
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

  // Filter and Group Tiles - Global search across all content
  const groupedTiles = useMemo(() => {
    // First, filter tiles based on active tab
    let filteredTiles = tiles;

    if (activeTab === 'favorites') {
      // Show only favorited tiles
      filteredTiles = tiles.filter(t => t.isFavorite === true);
    } else if (activeTab === 'public') {
      // Show only public tiles (same as current public access)
      filteredTiles = tiles.filter(t => t.visibility === 'public');
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

        // Add categories in saved order first
        categoryOrder.forEach(category => {
          if (groups[category]) {
            finalGroups[category] = groups[category];
            seenCategories.add(category);
          }
        });

        // Add any remaining categories in their order of appearance from tiles
        Object.keys(groups).forEach(category => {
          if (!seenCategories.has(category)) {
            finalGroups[category] = groups[category];
          }
        });

        return finalGroups;
      }

      return groups;
    }

    const searchLower = searchTerm.toLowerCase();

    // Global search: check title, description, group, section titles, link labels, and link URLs
    const filtered = filteredTiles.filter(t => {
      // Check tile-level properties
      if (
        t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        (t.group || '').toLowerCase().includes(searchLower)
      ) {
        return true;
      }

      // Check sections and links within the tile
      if (t.sections && t.sections.length > 0) {
        for (const section of t.sections) {
          // Check section title
          if (section.title.toLowerCase().includes(searchLower)) {
            return true;
          }

          // Check links in this section
          if (section.links && section.links.length > 0) {
            for (const link of section.links) {
              if (
                link.label.toLowerCase().includes(searchLower) ||
                link.url.toLowerCase().includes(searchLower)
              ) {
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

    return groups;
  }, [tiles, searchTerm, categoryOrder, activeTab, isAuthenticated, user]);

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
          links: generatedLinks.map(l => ({ ...l, id: generateId() }))
        }
      ] : [],
      tabs: [],
      createdAt: Date.now(),
      visibility: tileType === 'space' ? newVisibility : 'public',
      allowedUsers: (tileType === 'space' && newVisibility === 'private') ? newAllowedUsers : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined
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

  const handleMagicFill = async () => {
    if (!newTitle) return;
    setIsGenerating(true);
    try {
      const result: GeneratedTileContent = await generateTileContent(newTitle);
      setNewDesc(result.description);
      setNewEmoji(result.emoji);
      setGeneratedLinks(result.suggestedLinks);
    } catch (e) {
      alert("Failed to generate content. Please ensure API key is set.");
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewDesc('');
    setNewGroup('');
    setNewEmoji('📁');
    setNewColor('blue');
    setGeneratedLinks([]);
    setShowEmojiPicker(false);
    setNewVisibility('public');
    setNewAllowedUsers([]);
    setShowUserSelector(false);
    setTileType('space');
    setHyperlinkUrl('');
    setOpenInNewTab(true);
  };

  // Fetch users when modal opens and visibility is private
  useEffect(() => {
    if (isModalOpen && isAuthenticated && newVisibility === 'private' && availableUsers.length === 0 && !isLoadingUsers) {
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
  }, [isModalOpen, isAuthenticated, newVisibility]);

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

    if (confirm("Are you sure you want to delete this space?")) {
      if (onDeleteTile) {
        try {
          await onDeleteTile(id);
        } catch (error) {
          console.error('Failed to delete tile:', error);
          alert('Failed to delete space. Please try again.');
        }
      } else {
        onUpdateTiles(tiles.filter(t => t.id !== id));
      }
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
      window.location.hash = `#/tile/${tileId}`;
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
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined
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
        position: index
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
  }, [tiles, isAuthenticated, categoryOrder]);

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
            position: index
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
  }, [tiles, isAuthenticated, onUpdateTiles, categoryOrder]);

  const handleDeleteCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    try {
      // Move all tiles in this category to "General"
      const updatedTiles = tiles.map(tile => {
        if ((tile.group || 'General') === categoryName) {
          return { ...tile, group: 'General' };
        }
        return tile;
      });

      // Update tiles
      onUpdateTiles(updatedTiles);

      // Remove category from category order
      const newCategoryOrder = categoryOrder.filter(cat => cat !== categoryName);
      setCategoryOrder(newCategoryOrder);

      // Save updated arrangements
      try {
        // Save tile arrangement
        const arrangement = updatedTiles.map((tile, index) => ({
          tileId: tile.id,
          position: index,
          groupName: tile.group || 'General'
        }));
        await saveTileArrangement(arrangement);

        // Save category arrangement
        if (newCategoryOrder.length > 0) {
          const categoryArrangement = newCategoryOrder.map((category, index) => ({
            categoryName: category,
            position: index
          }));
          await saveCategoryArrangement(categoryArrangement);
        } else {
          // If no categories left, clear the arrangement
          await saveCategoryArrangement([]);
        }
      } catch (error) {
        console.error('Failed to save arrangements:', error);
        // Revert on error
        onUpdateTiles(tiles);
        setCategoryOrder(categoryOrder);
      }
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category. Please try again.');
    }
  }, [tiles, isAuthenticated, onUpdateTiles, categoryOrder]);

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
      if (onAuthRequired) onAuthRequired();
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
      {/* Compact Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="linknest-spaces-title text-2xl font-bold text-slate-900 dark:text-white">{settings.spaces_title || 'My Spaces'}</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Compact Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-8 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            {isAuthenticated && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Space
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('public')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'public'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
        >
          Public
        </button>
        {isAuthenticated && (
          <>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'favorites'
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              Favorites
            </button>
            <button
              onClick={() => setActiveTab('private')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'private'
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              Private
            </button>
          </>
        )}
      </div>

      {/* Compact Stats Bar */}
      {tiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span>{Object.keys(groupedTiles).length} {Object.keys(groupedTiles).length === 1 ? 'Category' : 'Categories'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
            <span>{Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)} {Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0) === 1 ? 'Tile' : 'Tiles'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
            <span>{Object.values(groupedTiles).flat().reduce((acc: number, t: Tile) => acc + (t.sections?.reduce((s: number, sec: LinkSection) => s + sec.links.length, 0) || 0), 0)} Links</span>
          </div>
        </div>
      )}

      {/* Tiles Grid - Full Width with More Columns */}
      <div>
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
              onDeleteCategory={handleDeleteCategory}
              onSaveCategoryOrder={handleManualSave}
              onRenameCategory={handleRenameCategory}
              onExportCategory={handleExportCategory}
              onImportCategory={handleImportCategory}
              onCloneCategory={handleCloneCategory}
              onToggleCategoryFavorite={handleToggleCategoryFavorite}
              isCategoryFavorited={isCategoryFavorited(groupName)}
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
                        canMoveLeft={canMoveLeft}
                        canMoveRight={canMoveRight}
                        availableCategories={allCategories}
                        groupIndex={groupIndex}
                        tileIndex={tileIndex}
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

      {/* Compact Add Tile Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/70 dark:bg-slate-900/90 backdrop-blur-md" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Create New Space</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Organize your links</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Title & AI */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Title</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g., Design Resources"
                    className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                  />
                  <button
                    onClick={handleMagicFill}
                    disabled={isGenerating || !newTitle}
                    className={`
                      px-3 py-2.5 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white
                      disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-violet-500/30
                      hover:scale-105 active:scale-95
                    `}
                    title="AI Generate"
                  >
                    {isGenerating ? (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM12 1.5a.75.75 0 01.728.568L12.94 3.08a2.25 2.25 0 001.48 1.48l1.012.212a.75.75 0 010 1.456l-1.012.212a2.25 2.25 0 00-1.48 1.48l-.212 1.012a.75.75 0 01-1.456 0l-.212-1.012a2.25 2.25 0 00-1.48-1.48l-1.012-.212a.75.75 0 010-1.456l1.012-.212a2.25 2.25 0 001.48-1.48l.212-1.012A.75.75 0 0112 1.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
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
                          <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
                          <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden">
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

                  {/* Grouping - Also shown for hyperlinks */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Group / Category</label>
                    <input
                      type="text"
                      value={newGroup}
                      onChange={(e) => setNewGroup(e.target.value)}
                      placeholder="e.g. Work, Personal"
                      list="group-suggestions"
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                    />
                    <datalist id="group-suggestions">
                      {existingGroups.map(g => <option key={g} value={g} />)}
                    </datalist>
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
                        <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden">
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

              {/* Generated Links Preview - Only shown when type is space */}
              {tileType === 'space' && generatedLinks.length > 0 && (
                <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-500/10 dark:to-fuchsia-500/10 p-4 rounded-lg border border-violet-200 dark:border-violet-500/30">
                  <p className="text-xs text-violet-600 dark:text-violet-400 font-bold uppercase tracking-wider mb-2">AI Suggested Links</p>
                  <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                    {generatedLinks.map((l, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0"></span>
                        <span className="truncate">{l.label}</span>
                      </li>
                    ))}
                  </ul>
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
        </div>
      )}

      {/* Edit Tile Modal */}
      {isEditModalOpen && editingTile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/70 dark:bg-slate-900/90 backdrop-blur-md" onClick={() => {
            setIsEditModalOpen(false);
            setEditingTile(null);
            resetForm();
          }}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
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
                      <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
                      <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden">
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

              {/* Grouping */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Group / Category</label>
                <input
                  type="text"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  placeholder="e.g. Work, Personal"
                  list="group-suggestions-edit"
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                />
                <datalist id="group-suggestions-edit">
                  {existingGroups.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>

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
        </div>
      )}
    </div>
  );
};
