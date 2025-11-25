import React, { useState, useEffect } from 'react';
import { Tile, Link } from './types';
import { getTiles, saveTiles, createTile, deleteTile } from './services/storageService';
import { TileGrid } from './components/TileGrid';
import { TileDetail } from './components/TileDetail';
import { Navigation } from './components/Navigation';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';

// Simple Hash Router implementation
const useHashRoute = () => {
  // Normalize hash: empty hash or no hash = root route (but don't modify URL)
  const normalizeHash = (hash: string) => {
    if (!hash || hash === '#' || hash === '#/') {
      return '#/';
    }
    return hash;
  };

  const [route, setRoute] = useState(normalizeHash(window.location.hash));

  useEffect(() => {
    const handler = () => {
      setRoute(normalizeHash(window.location.hash));
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  return route;
};

const AppContent: React.FC = () => {
  const route = useHashRoute();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  
  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('linknest_theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('linknest_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('linknest_theme', 'light');
    }
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(!darkMode);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = await getTiles();
        setTiles(stored);
      } catch (error) {
        console.error('Failed to load tiles:', error);
        setTiles([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isAuthenticated]); // Reload when auth state changes

  const handleUpdateTiles = async (newTiles: Tile[]) => {
    if (!isAuthenticated) {
      // Guest mode: just update local state for viewing
      setTiles(newTiles);
      return;
    }
    
    try {
      setTiles(newTiles);
      await saveTiles(newTiles);
    } catch (error) {
      console.error('Failed to save tiles:', error);
      // Reload from server on error
      const stored = await getTiles();
      setTiles(stored);
    }
  };

  const handleCreateTile = async (tile: Tile) => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    
    try {
      const created = await createTile(tile);
      setTiles([...tiles, created]);
    } catch (error) {
      console.error('Failed to create tile:', error);
      throw error;
    }
  };

  const handleDeleteTile = async (tileId: string) => {
    if (!isAuthenticated) {
      return;
    }
    
    try {
      await deleteTile(tileId);
      setTiles(tiles.filter(t => t.id !== tileId));
    } catch (error) {
      console.error('Failed to delete tile:', error);
      throw error;
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors duration-300">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  // Routing Logic
  let content;
  if (route === '#/' || route === '') {
    content = (
      <TileGrid 
        tiles={tiles} 
        onUpdateTiles={handleUpdateTiles}
        onCreateTile={handleCreateTile}
        onDeleteTile={handleDeleteTile}
        isAuthenticated={isAuthenticated}
        onAuthRequired={() => setAuthModalOpen(true)}
      />
    );
  } else if (route === '#/admin') {
    if (user?.is_admin) {
      content = (
        <AdminPanel 
          onUserApproved={() => {
            // Refresh tiles if needed
            const loadData = async () => {
              try {
                const stored = await getTiles();
                setTiles(stored);
              } catch (error) {
                console.error('Failed to load tiles:', error);
              }
            };
            loadData();
          }}
        />
      );
    } else {
      window.location.hash = '#/';
      content = null;
    }
  } else if (route.startsWith('#/tile/')) {
    const tileId = route.split('/tile/')[1];
    const tile = tiles.find((t) => t.id === tileId);
    if (tile) {
      content = (
        <TileDetail 
          tile={tile} 
          allTiles={tiles} 
          onUpdateTiles={handleUpdateTiles}
          isAuthenticated={isAuthenticated}
          onAuthRequired={() => setAuthModalOpen(true)}
        />
      );
    } else {
      // 404 or redirect
      window.location.hash = '#/';
      content = null;
    }
  } else {
    content = (
      <TileGrid 
        tiles={tiles} 
        onUpdateTiles={handleUpdateTiles}
        onCreateTile={handleCreateTile}
        onDeleteTile={handleDeleteTile}
        isAuthenticated={isAuthenticated}
        onAuthRequired={() => setAuthModalOpen(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white transition-colors duration-300">
      <Navigation 
        darkMode={darkMode} 
        toggleTheme={toggleTheme}
        user={user}
        onLoginClick={() => setAuthModalOpen(true)}
      />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        {content}
      </main>
      {!isAuthenticated && (
        <div className="container mx-auto px-4 max-w-6xl pb-4">
          <div className="p-2.5 bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50 rounded-md text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              👋 Guest Mode: You're viewing all public links. 
              <button 
                onClick={() => setAuthModalOpen(true)}
                className="ml-1.5 text-slate-700 dark:text-slate-300 hover:underline"
              >
                Sign in to edit
              </button>
            </p>
          </div>
        </div>
      )}
      <footer className="py-6 text-center text-slate-400 dark:text-slate-500 text-sm">
        <p>© {new Date().getFullYear()} Adventhealth - Designed and developed by AIT Architecture team</p>
      </footer>
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </AuthProvider>
  );
};

export default App;