import React, { useState, useMemo, useEffect } from 'react';
import { Tile } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { COLOR_STYLES } from '../types';
import { TileAnimationSelector, useTileAnimation, getTileAnimationClass, getTileDecorationClass, TileAnimation, TileDecoration } from './TileAnimationSelector';

interface MobileTileViewProps {
  tiles: Tile[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onTileClick: (tileId: string) => void;
  activeTab: string;
  groupedTiles: Record<string, Tile[]>;
  settings: any;
  darkMode: boolean;
  toggleTheme: () => void;
  onHelpClick: () => void;
  onTabChange?: (tab: string) => void;
  isAuthenticated?: boolean;
  disabledTabs?: Set<string>;
  onLoginClick?: () => void;
  user?: { id: number; username: string; email: string; is_admin?: boolean } | null;
}

export const MobileTileView: React.FC<MobileTileViewProps> = ({
  tiles,
  searchTerm,
  onSearchChange,
  onTileClick,
  activeTab,
  groupedTiles,
  settings,
  darkMode,
  toggleTheme,
  onHelpClick,
  onTabChange,
  isAuthenticated = false,
  disabledTabs = new Set(),
  onLoginClick,
  user: userProp
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user: authUser, logout } = useAuth();
  const user = userProp || authUser;
  
  // Animation state - get initial values from hook and maintain local state
  const { animation: initialAnimation, decoration: initialDecoration } = useTileAnimation();
  const [currentAnimation, setCurrentAnimation] = useState<TileAnimation>(initialAnimation);
  const [currentDecoration, setCurrentDecoration] = useState<TileDecoration>(initialDecoration);
  
  // Sync with initial values when they load
  useEffect(() => {
    setCurrentAnimation(initialAnimation);
    setCurrentDecoration(initialDecoration);
  }, [initialAnimation, initialDecoration]);

  // Close menu when clicking outside
  useEffect(() => {
    if (isMenuOpen) {
      const handleClickOutside = () => {
        setIsMenuOpen(false);
      };
      // Delay to avoid immediate close on menu open click
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isMenuOpen]);

  const handleTabClick = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      // Fallback: dispatch event like TileGrid does
      window.dispatchEvent(new CustomEvent('switchTab', { detail: tab }));
    }
    setIsMenuOpen(false);
  };
  // Filter tiles based on search term
  const filteredTiles = useMemo(() => {
    if (!searchTerm.trim()) {
      // If no search, return all tiles from grouped tiles
      return Object.values(groupedTiles).flat();
    }

    const searchLower = searchTerm.toLowerCase();
    return Object.values(groupedTiles)
      .flat()
      .filter(tile => {
        const titleMatch = tile.title?.toLowerCase().includes(searchLower);
        const descriptionMatch = tile.description?.toLowerCase().includes(searchLower);
        const emojiMatch = tile.emoji?.toLowerCase().includes(searchLower);
        const groupMatch = tile.group?.toLowerCase().includes(searchLower);
        
        return titleMatch || descriptionMatch || emojiMatch || groupMatch;
      });
  }, [searchTerm, groupedTiles]);

  const getTileStyles = (tile: Tile) => {
    const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];
    
    const decorationStyles: React.CSSProperties = {};
    
    if (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) {
      const gradientStops = tile.tileGradientColors.map((color, i) => {
        const position = tile.tileGradientColorPositions?.[i] ?? (i * 100) / (tile.tileGradientColors.length - 1 || 1);
        return `${color} ${position}%`;
      }).join(', ');
      
      const angle = typeof tile.tileGradientDirection === 'number' 
        ? tile.tileGradientDirection 
        : parseInt(String(tile.tileGradientDirection || '90').replace('deg', '')) || 90;
      
      decorationStyles.background = `linear-gradient(${angle}deg, ${gradientStops})`;
    } else if (tile.tileBackgroundColor) {
      decorationStyles.backgroundColor = tile.tileBackgroundColor;
    } else {
      decorationStyles.backgroundColor = styles.bg;
    }

    if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius >= 0) {
      decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
    } else {
      decorationStyles.borderRadius = '16px';
    }

    if (tile.tileTextColor) {
      decorationStyles.color = tile.tileTextColor;
    }

    return decorationStyles;
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      {/* Mobile Header with Logo, Hamburger Menu, Dark Mode, and Help */}
      <div className="sticky top-0 z-20 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Hamburger Menu and Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all"
              title="Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                {isMenuOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>
            <div
              onClick={() => window.location.hash = '#/'}
              className="flex items-center gap-2 cursor-pointer"
            >
              {settings.logo_type === 'image' && settings.logo_image ? (
                <img
                  src={settings.logo_image}
                  alt={settings.app_name}
                  className="w-8 h-8 rounded-lg object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg text-lg">
                  {settings.logo_icon || '🔗'}
                </div>
              )}
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {settings.app_name || 'LinkNest'}
              </span>
            </div>
          </div>

          {/* Animation Selector, Dark Mode and Help Icons */}
          <div className="flex items-center gap-2">
            {/* Tile Animation Selector - Available for all users */}
            <TileAnimationSelector
              onAnimationChange={(animation) => setCurrentAnimation(animation)}
              onDecorationChange={(decoration) => setCurrentDecoration(decoration)}
            />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-indigo-500">
                  <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button
              onClick={onHelpClick}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all"
              title="Help & About"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <path d="M12 17h.01"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Hamburger Menu Sidebar */}
      {isMenuOpen && (
        <>
          {/* Overlay - Fade animation */}
          <div 
            className="fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 opacity-100"
            onClick={() => setIsMenuOpen(false)}
          />
          {/* Menu - Smooth slide animation */}
          <div 
            className="fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-40 shadow-2xl transform transition-transform duration-300 ease-out translate-x-0"
            style={{ 
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-full">
              {/* Menu Header */}
              <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Navigation</h2>
              </div>

              {/* Sign In Button - At top of menu if not authenticated */}
              {!isAuthenticated && onLoginClick && (
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => {
                      if (onLoginClick) {
                        onLoginClick();
                      }
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors shadow-md hover:shadow-lg"
                  >
                    Sign In
                  </button>
                </div>
              )}
              
              {/* Menu Items */}
              <div className="flex-1 overflow-y-auto py-4">
                <div className="space-y-1 px-2">
                  {/* Public Tab */}
                  {!disabledTabs.has('public') && (
                    <button
                      onClick={() => handleTabClick('public')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                        activeTab === 'public'
                          ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                      <span>Public</span>
                    </button>
                  )}

                  {/* Favorites Tab */}
                  {!disabledTabs.has('favorites') && (
                    <button
                      onClick={() => handleTabClick(isAuthenticated ? 'favorites' : 'public-favorites')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                        activeTab === 'favorites' || activeTab === 'public-favorites'
                          ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                      </svg>
                      <span>Favorites</span>
                    </button>
                  )}

                  {/* Private Tab - Only for authenticated users */}
                  {isAuthenticated && !disabledTabs.has('private') && (
                    <button
                      onClick={() => handleTabClick('private')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                        activeTab === 'private'
                          ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      <span>Private</span>
                    </button>
                  )}

                  {/* Your Apps Tab - Only for authenticated users */}
                  {isAuthenticated && !disabledTabs.has('your-apps') && (
                    <button
                      onClick={() => handleTabClick('your-apps')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                        activeTab === 'your-apps'
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                      </svg>
                      <span>Your Apps</span>
                    </button>
                  )}
                </div>
              </div>

              {/* User Section - Only show if authenticated */}
              {user && (
                <div className="border-t border-slate-200 dark:border-slate-800 px-2 py-4">
                  <div className="px-4 py-2">
                    <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      {user.username}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await logout();
                          window.location.hash = '#/';
                          setIsMenuOpen(false);
                        } catch (error) {
                          console.error('Logout failed:', error);
                        }
                      }}
                      className="w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-left"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Search Bar - Modern styling with glassmorphism */}
      <div className="sticky top-[73px] z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-700/50 px-4 py-3 shadow-sm">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search spaces..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-10 py-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all shadow-sm hover:shadow-md"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:scale-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tiles Grid - 3 columns like mobile apps */}
      <div className="px-4 py-6">
        {filteredTiles.length > 0 ? (
          <div className="grid grid-cols-3 gap-6">
            {filteredTiles.map((tile, index) => {
              const tileStyles = getTileStyles(tile);
              const animationClass = getTileAnimationClass(currentAnimation);
              const decorationClass = getTileDecorationClass(currentDecoration);
              const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
              const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';
              
              return (
                <div
                  key={tile.id}
                  onClick={() => onTileClick(tile.id)}
                  className={`flex flex-col items-center cursor-pointer group mobile-tile ${fullAnimationClass} ${tileAnimatedClass}`}
                  style={{
                    animationDelay: fullAnimationClass ? `${index * 0.05}s` : undefined
                  }}
                >
                  {/* Tile Icon - Square like mobile app icon with modern styling */}
                  <div
                    className="relative w-20 h-20 rounded-2xl shadow-lg hover:shadow-xl flex items-center justify-center text-3xl mb-2 transition-all duration-200 active:scale-90 group-hover:scale-105 overflow-hidden"
                    style={tileStyles}
                  >
                    {/* Ripple effect background */}
                    <div className="absolute inset-0 opacity-0 group-active:opacity-20 bg-white transition-opacity duration-200 rounded-2xl" />
                    {/* Tile icon */}
                    <span className="relative z-10">{tile.emoji || '📄'}</span>
                    {/* Subtle shine effect on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br from-white/30 to-transparent transition-opacity duration-200 rounded-2xl" />
                  </div>
                  
                  {/* Tile Name - Force readable text color for mobile */}
                  <div className="text-center w-full">
                    <p 
                      className="text-xs font-medium line-clamp-2 px-1 transition-colors duration-200 group-hover:text-brand-600 dark:group-hover:text-brand-400"
                      style={{ 
                        color: darkMode ? '#f1f5f9' : '#1e293b' // Force readable text: light in dark mode, dark in light mode
                      }}
                    >
                      {tile.title || 'Untitled'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 animate-fadeIn">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No spaces found</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Try adjusting your search terms</p>
            <button
              onClick={() => onSearchChange('')}
              className="px-6 py-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-xl text-sm font-medium transition-all active:scale-95"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
