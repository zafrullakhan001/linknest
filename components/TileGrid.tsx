import React, { useState, useMemo } from 'react';
import { Tile, ThemeColor, THEME_COLORS, COLOR_STYLES, POPULAR_EMOJIS } from '../types';
import { generateTileContent, GeneratedTileContent } from '../services/geminiService';

interface TileGridProps {
  tiles: Tile[];
  onUpdateTiles: (tiles: Tile[]) => void;
  onCreateTile?: (tile: Tile) => Promise<void>;
  onDeleteTile?: (tileId: string) => Promise<void>;
  isAuthenticated?: boolean;
  onAuthRequired?: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const TileGrid: React.FC<TileGridProps> = ({ 
  tiles, 
  onUpdateTiles, 
  onCreateTile,
  onDeleteTile,
  isAuthenticated = false,
  onAuthRequired
}) => {
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

  // Get unique existing groups for suggestions
  const existingGroups = useMemo(() => {
    return Array.from(new Set(tiles.map(t => t.group || 'General'))).sort();
  }, [tiles]);

  // Filter and Group Tiles
  const groupedTiles = useMemo(() => {
    const filtered = tiles.filter(t => 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.group || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups: Record<string, Tile[]> = {};
    
    filtered.forEach(tile => {
      const groupName = tile.group || 'General';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(tile);
    });

    return groups;
  }, [tiles, searchTerm]);

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
    
    if (confirm("Are you sure you want to delete this tile?")) {
      if (onDeleteTile) {
        try {
          await onDeleteTile(id);
        } catch (error) {
          console.error('Failed to delete tile:', error);
          alert('Failed to delete tile. Please try again.');
        }
      } else {
        onUpdateTiles(tiles.filter(t => t.id !== id));
      }
    }
  };

  const handleTileClick = (tileId: string) => {
    window.location.hash = `#/tile/${tileId}`;
  };

  return (
    <div>
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">My Spaces</h1>
          <p className="text-slate-500 dark:text-slate-400">Organize your web, your way.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative flex-grow sm:w-64">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                <input 
                    type="text" 
                    placeholder="Search spaces..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-full pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all shadow-sm"
                />
            </div>

            {isAuthenticated && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-full font-medium transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 hover:scale-105 active:scale-95 whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Space
              </button>
            )}
        </div>
      </div>

      {/* Tiles Grid grouped by Categories */}
      <div className="space-y-10">
        {Object.keys(groupedTiles).sort().map(groupName => (
            <div key={groupName} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-lg font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{groupName}</h2>
                    <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {groupedTiles[groupName].map((tile) => {
                        const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];
                        const linkCount = tile.sections?.reduce((acc, section) => acc + section.links.length, 0) || 0;
                        
                        return (
                            <div
                            key={tile.id}
                            onClick={() => handleTileClick(tile.id)}
                            role="button"
                            tabIndex={0}
                            className={`
                                relative group p-5 rounded-xl bg-white dark:bg-slate-800 border ${styles.border}
                                ${styles.hoverBorder} hover:shadow-xl dark:hover:bg-slate-800/80 hover:-translate-y-1 
                                transition-all duration-200 flex flex-col h-full min-h-[11rem] cursor-pointer overflow-hidden
                            `}
                            >
                                {/* Compact Card Layout */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-10 h-10 rounded-lg ${styles.soft} flex items-center justify-center text-xl border ${styles.border}`}>
                                        {tile.emoji}
                                    </div>
                                    {isAuthenticated && (
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                              onClick={(e) => handleDeleteTile(e, tile.id)}
                                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                                          >
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                              </svg>
                                          </button>
                                      </div>
                                    )}
                                </div>
                                
                                <h3 className={`font-bold text-lg leading-snug line-clamp-2 mb-1 ${styles.text}`}>
                                    {tile.title}
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-xs line-clamp-3 mb-4 leading-relaxed">
                                    {tile.description}
                                </p>
                                
                                <div className={`mt-auto pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-center text-xs font-bold uppercase tracking-wider ${styles.text}`}>
                                    <span className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                            <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                        </svg>
                                        {linkCount} Links
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        ))}
        
        {tiles.length === 0 && isAuthenticated && (
          <div 
            onClick={() => setIsModalOpen(true)}
            className="flex flex-col items-center justify-center h-56 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 transition-all cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="text-2xl">✨</span>
            </div>
            <p className="font-medium">Create your first space</p>
          </div>
        )}

        {tiles.length > 0 && Object.keys(groupedTiles).length === 0 && (
            <div className="text-center py-10 text-slate-500">
                <p>No spaces match your search.</p>
                <button onClick={() => setSearchTerm('')} className="text-brand-500 hover:underline mt-2">Clear search</button>
            </div>
        )}
      </div>

      {/* Add Tile Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create New Space</h2>
            
            <div className="space-y-5">
              
              {/* Title & AI */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Title</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g., Design Resources"
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-400"
                  />
                  <button 
                    onClick={handleMagicFill}
                    disabled={isGenerating || !newTitle}
                    className={`
                      px-3 py-2 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white
                      disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-violet-500/20
                    `}
                    title="Auto-generate description and links with AI"
                  >
                    {isGenerating ? (
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                           <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM12 1.5a.75.75 0 01.728.568L12.94 3.08a2.25 2.25 0 001.48 1.48l1.012.212a.75.75 0 010 1.456l-1.012.212a2.25 2.25 0 00-1.48 1.48l-.212 1.012a.75.75 0 01-1.456 0l-.212-1.012a2.25 2.25 0 00-1.48-1.48l-1.012-.212a.75.75 0 010-1.456l1.012-.212a2.25 2.25 0 001.48-1.48l.212-1.012A.75.75 0 0112 1.5z" clipRule="evenodd" />
                        </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Grouping */}
              <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Group / Category</label>
                  <input
                    type="text"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="e.g. Work, Personal, Hobby"
                    list="group-suggestions"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-400"
                  />
                  <datalist id="group-suggestions">
                      {existingGroups.map(g => <option key={g} value={g} />)}
                  </datalist>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Short description..."
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none placeholder-slate-400"
                />
              </div>

              {/* Emoji & Theme */}
              <div className="flex gap-4">
                <div className="w-24 relative">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Icon</label>
                  <button 
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-full h-[50px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-2xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500"
                  >
                    {newEmoji || '✨'}
                  </button>
                  
                  {/* Emoji Picker Popover */}
                  {showEmojiPicker && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 flex flex-col overflow-hidden">
                            <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <input 
                                    type="text" 
                                    value={newEmoji}
                                    onChange={(e) => setNewEmoji(e.target.value)}
                                    placeholder="Type emoji..." 
                                    className="w-full text-sm px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 dark:text-white"
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-6 gap-1">
                                {POPULAR_EMOJIS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => { setNewEmoji(emoji); setShowEmojiPicker(false); }}
                                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
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
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Theme</label>
                    <div className="grid grid-cols-6 gap-2">
                        {THEME_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setNewColor(c)}
                                className={`
                                    w-8 h-8 rounded-full border-2 transition-all relative overflow-hidden
                                    ${newColor === c ? 'border-brand-500 scale-110' : 'border-transparent hover:scale-105'} 
                                `}
                                title={c}
                            >
                                <div className={`absolute inset-0 ${COLOR_STYLES[c].base}`}></div> 
                            </button>
                        ))}
                    </div>
                </div>
              </div>
              
              {/* Generated Links Preview */}
              {generatedLinks.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/50">
                      <p className="text-xs text-brand-500 font-bold uppercase tracking-wider mb-3">Suggested Links</p>
                      <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                          {generatedLinks.map((l, i) => (
                              <li key={i} className="flex items-center gap-2 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
                                {l.label}
                              </li>
                          ))}
                      </ul>
                  </div>
              )}

              {/* Actions */}
              <div className="pt-4 flex justify-end gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTile}
                  disabled={!newTitle.trim()}
                  className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-brand-500/20"
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