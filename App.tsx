import React, { useState, useEffect } from 'react';
import { Tile, Link } from './types';
import { getTiles, saveTiles, createTile, deleteTile } from './services/storageService';
import { TileGrid } from './components/TileGrid';
import { TileDetail } from './components/TileDetail';
import { Navigation } from './components/Navigation';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';

// Simple Hash Router implementation
const useHashRoute = () => {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/');
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
      <main className="flex-grow w-full px-4 sm:px-6 lg:px-8 py-6">
        {!isAuthenticated && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              👋 <strong>Guest Mode:</strong> You're viewing all public links. 
              <button 
                onClick={() => setAuthModalOpen(true)}
                className="ml-2 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                Sign in to edit
              </button>
            </p>
          </div>
        )}
        {content}
      </main>
      <footer className="py-6 text-center text-slate-400 dark:text-slate-500 text-sm">
        <p>© {new Date().getFullYear()} LinkNest. Built with React, Tailwind & Gemini.</p>
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
      <AppContent />
    </AuthProvider>
  );
};

export default App;