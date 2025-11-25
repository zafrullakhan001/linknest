import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Tile, ThemeColor, THEME_COLORS, COLOR_STYLES, POPULAR_EMOJIS } from '../types';
import { generateTileContent, GeneratedTileContent } from '../services/geminiService';
import { useSettings } from '../contexts/SettingsContext';
import { saveTileArrangement, saveCategoryArrangement, getCategoryArrangement } from '../services/storageService';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TileGridProps {
  tiles: Tile[];
  onUpdateTiles: (tiles: Tile[]) => void;
  onCreateTile?: (tile: Tile) => Promise<void>;
  onDeleteTile?: (tileId: string) => Promise<void>;
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
  onDeleteCategory
}) => {
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ animationDelay: `${groupIndex * 50}ms` }}
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
              className={`p-1 rounded-md transition-all ${
                canMoveUp
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
              className={`p-1 rounded-md transition-all ${
                canMoveDown
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
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{categoryName}</h2>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {tileCount}
        </span>
        <div className="h-px bg-slate-200 dark:border-slate-700 flex-1"></div>
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
  onMoveToCategory?: (tileId: string, categoryName: string) => void;
  availableCategories: string[];
  groupIndex: number;
  tileIndex: number;
}

const SortableTile: React.FC<SortableTileProps> = ({
  tile,
  isAuthenticated,
  onTileClick,
  onDeleteTile,
  onMoveToCategory,
  availableCategories,
  groupIndex,
  tileIndex
}) => {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tile.id });

  const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];
  const linkCount = tile.sections?.reduce((acc, section) => acc + section.links.length, 0) || 0;
  const currentCategory = tile.group || 'General';

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    animationDelay: `${(groupIndex * 50) + (tileIndex * 20)}ms`,
  };

  return (
    <div
      ref={setNodeRef}
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
        group relative p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50
        hover:border-brand-300 dark:hover:border-brand-500/50
        hover:shadow-lg hover:shadow-brand-500/10 dark:hover:shadow-brand-500/5
        hover:-translate-y-0.5 transition-all duration-200 
        flex flex-col h-full min-h-[140px] cursor-pointer
        ${isDragging ? 'z-50' : ''}
      `}
    >
      {/* Drag Handle - Only visible for authenticated users - positioned at top center */}
      {isAuthenticated && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10 p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
          onClick={(e) => e.stopPropagation()}
          title="Drag to rearrange"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
            <path d="M7 2a2 2 0 1 1 0 4a2 2 0 0 1 0-4zM7 8a2 2 0 1 1 0 4a2 2 0 0 1 0-4zM7 14a2 2 0 1 1 0 4a2 2 0 0 1 0-4zM13 2a2 2 0 1 1 0 4a2 2 0 0 1 0-4zM13 8a2 2 0 1 1 0 4a2 2 0 0 1 0-4zM13 14a2 2 0 1 1 0 4a2 2 0 0 1 0-4z" />
          </svg>
        </div>
      )}

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
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            category === currentCategory
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
            
            {/* Delete Button */}
            <button 
              onClick={(e) => onDeleteTile(e, tile.id)}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
              title="Delete"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
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
        <div className={`flex items-center gap-1.5 text-xs font-medium ${styles.text}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
            <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
          </svg>
          <span>{linkCount}</span>
        </div>
        <div className="text-slate-300 dark:text-slate-600 group-hover:text-brand-500 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export const TileGrid: React.FC<TileGridProps> = ({ 
  tiles, 
  onUpdateTiles, 
  onCreateTile,
  onDeleteTile,
  isAuthenticated = false,
  onAuthRequired
}) => {
  const { settings } = useSettings();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Tile Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newEmoji, setNewEmoji] = useState('📁');
  const [newColor, setNewColor] = useState<ThemeColor>('blue');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{label:string, url:string}[]>([]);
  
  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Category order state
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load global category arrangement on mount (works for all users)
  useEffect(() => {
    const loadCategoryOrder = async () => {
      try {
        const arrangement = await getCategoryArrangement();
        if (arrangement.length > 0) {
          const ordered = arrangement.sort((a, b) => a.position - b.position).map(c => c.categoryName);
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

  // Get unique existing groups for suggestions
  const existingGroups = useMemo(() => {
    return Array.from(new Set(tiles.map(t => t.group || 'General'))).sort();
  }, [tiles]);

  // Get all available categories (including empty ones from categoryOrder)
  const allCategories = useMemo(() => {
    const categoriesFromTiles = Array.from(new Set(tiles.map(t => t.group || 'General')));
    const allCats = new Set(categoriesFromTiles);
    
    // Add categories from categoryOrder (including empty ones)
    if (categoryOrder.length > 0) {
      categoryOrder.forEach(cat => allCats.add(cat));
    }
    
    // Sort: ordered categories first, then others alphabetically
    const ordered = categoryOrder.length > 0
      ? categoryOrder.filter(cat => allCats.has(cat))
      : [];
    const unordered = Array.from(allCats).filter(cat => !ordered.includes(cat)).sort();
    
    return [...ordered, ...unordered];
  }, [tiles, categoryOrder, isAuthenticated]);

  // Filter and Group Tiles - Global search across all content
  const groupedTiles = useMemo(() => {
    if (!searchTerm.trim()) {
      // No search term - return all tiles grouped normally
      const groups: Record<string, Tile[]> = {};
      tiles.forEach(tile => {
        const groupName = tile.group || 'General';
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(tile);
      });
      
      // Apply global category order if available (works for all users)
      if (categoryOrder.length > 0) {
        const orderedGroups: Record<string, Tile[]> = {};
        const unorderedGroups: Record<string, Tile[]> = {};
        
        // Separate ordered and unordered categories
        Object.keys(groups).forEach(category => {
          if (categoryOrder.includes(category)) {
            orderedGroups[category] = groups[category];
          } else {
            unorderedGroups[category] = groups[category];
          }
        });
        
        // Merge in order: ordered categories first (including empty ones), then unordered (alphabetically)
        const finalGroups: Record<string, Tile[]> = {};
        categoryOrder.forEach(category => {
          // Include category even if it has no tiles (empty category)
          finalGroups[category] = orderedGroups[category] || [];
        });
        Object.keys(unorderedGroups).sort().forEach(category => {
          finalGroups[category] = unorderedGroups[category];
        });
        
        return finalGroups;
      }
      
      return groups;
    }

    const searchLower = searchTerm.toLowerCase();
    
    // Global search: check title, description, group, section titles, link labels, and link URLs
    const filtered = tiles.filter(t => {
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
  }, [tiles, searchTerm, categoryOrder]);

  const handleCreateTile = async () => {
    if (!newTitle.trim()) return;

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
      group: newGroup.trim() || 'General',
      sections: [
          {
              id: generateId(),
              title: 'General',
              links: generatedLinks.map(l => ({ ...l, id: generateId() }))
          }
      ],
      createdAt: Date.now()
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
  };

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

  const handleTileClick = (tileId: string) => {
    window.location.hash = `#/tile/${tileId}`;
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

      // Save arrangement to backend
      try {
        const arrangement = updatedTiles.map((tile, index) => ({
          tileId: tile.id,
          position: index,
          groupName: tile.group || 'General'
        }));
        await saveTileArrangement(arrangement);
      } catch (error) {
        console.error('Failed to save tile arrangement:', error);
        // Revert on error
        onUpdateTiles(tiles);
      }
    } catch (error) {
      console.error('Failed to move tile to category:', error);
      alert('Failed to move tile. Please try again.');
    }
  }, [tiles, isAuthenticated, onUpdateTiles]);

  const handleMoveCategory = useCallback(async (categoryName: string, direction: 'up' | 'down') => {
    if (!isAuthenticated) return;

    // Get all current categories from tiles
    const allCategoriesFromTiles = Array.from(new Set(tiles.map(t => t.group || 'General')));
    
    // Build current order: use categoryOrder if available, otherwise use alphabetical
    let currentCategories: string[];
    if (categoryOrder.length > 0) {
      // Start with saved order, filter to only include existing categories
      currentCategories = categoryOrder.filter(cat => allCategoriesFromTiles.includes(cat));
      // Add any new categories not in the saved order (alphabetically)
      const newCategories = allCategoriesFromTiles
        .filter(cat => !currentCategories.includes(cat))
        .sort();
      currentCategories = [...currentCategories, ...newCategories];
    } else {
      // No saved order, use alphabetical
      currentCategories = [...allCategoriesFromTiles].sort();
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
      alert('Failed to save category order. Please try again.');
    }
  }, [tiles, isAuthenticated, categoryOrder]);

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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    if (!isAuthenticated) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Check if this is a category drag
    const activeId = String(active.id);
    const overId = String(over.id);
    
    // Tile rearrangement (tile dropped on another tile)
    const activeTile = tiles.find(t => t.id === active.id);
    const overTile = tiles.find(t => t.id === over.id);
    
    if (!activeTile || !overTile) return;

    // Get current grouped tiles
    const currentGroups: Record<string, Tile[]> = {};
    tiles.forEach(tile => {
      const groupName = tile.group || 'General';
      if (!currentGroups[groupName]) {
        currentGroups[groupName] = [];
      }
      currentGroups[groupName].push(tile);
    });

    // Only allow reordering within the same category
    const activeGroup = activeTile.group || 'General';
    const overGroup = overTile.group || 'General';

    // Prevent moving tiles between categories via drag
    if (activeGroup !== overGroup) {
      return;
    }

    // Create new tiles array with updated order
    const newTiles = [...tiles];
    const activeIndex = newTiles.findIndex(t => t.id === active.id);
    const overIndex = newTiles.findIndex(t => t.id === over.id);

    // Reorder tiles
    const reorderedTiles = arrayMove(newTiles, activeIndex, overIndex);
    
    // Update local state
    onUpdateTiles(reorderedTiles);

    // Save arrangement to backend
    try {
      const arrangement = reorderedTiles.map((tile, index) => ({
        tileId: tile.id,
        position: index,
        groupName: tile.group || 'General'
      }));
      await saveTileArrangement(arrangement);
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      // Revert on error
      onUpdateTiles(tiles);
    }
  }, [tiles, isAuthenticated, onUpdateTiles, categoryOrder]);

  return (
    <div className="w-full space-y-6">
      {/* Compact Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{settings.spaces_title || 'My Spaces'}</h1>
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

      {/* Compact Stats Bar */}
      {tiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span>{Object.keys(groupedTiles).length} {Object.keys(groupedTiles).length === 1 ? 'Category' : 'Categories'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
            <span>{tiles.length} {tiles.length === 1 ? 'Tile' : 'Tiles'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
            <span>{tiles.reduce((acc, t) => acc + (t.sections?.reduce((s, sec) => s + sec.links.length, 0) || 0), 0)} Links</span>
          </div>
        </div>
      )}

      {/* Tiles Grid - Full Width with More Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tiles.map(t => t.id)}>
          <div className="space-y-8">
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
                >
                  {/* Grid with wider tiles */}
                  {groupTiles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {groupTiles.map((tile, tileIndex) => (
                        <SortableTile
                          key={tile.id}
                          tile={tile}
                          isAuthenticated={isAuthenticated}
                          onTileClick={handleTileClick}
                          onDeleteTile={handleDeleteTile}
                          onMoveToCategory={handleMoveTileToCategory}
                          availableCategories={allCategories}
                          groupIndex={groupIndex}
                          tileIndex={tileIndex}
                        />
                      ))}
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
        </SortableContext>
      </DndContext>

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

              {/* Grouping */}
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

              {/* Emoji & Theme */}
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
              
              {/* Generated Links Preview */}
              {generatedLinks.length > 0 && (
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
                  disabled={!newTitle.trim()}
                  className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 hover:scale-105 active:scale-95"
                >
                  Create Space
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
