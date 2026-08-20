import React, { useState, useEffect } from 'react';
import { useStyles } from '../contexts/StyleContext';
import { useAuth } from '../contexts/AuthContext';
import { styleService } from '../services/styleService';
import { userPreferencesService } from '../services/userPreferencesService';

export const PageZoomControl: React.FC = () => {
  const { styles, updateStyles } = useStyles();
  const { isAuthenticated } = useAuth();
  const [currentZoom, setCurrentZoom] = useState<number>(styles.pageZoom || 100);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Sync with styles.pageZoom when it changes
  useEffect(() => {
    const zoomValue = styles.pageZoom || 100;
    setCurrentZoom(zoomValue);
  }, [styles.pageZoom]);

  // Load zoom preference on mount
  // For logged-in users: load from database
  // For guest users: load from localStorage
  useEffect(() => {
    const loadZoomPreference = async () => {
      setIsLoadingPreference(true);
      try {
        let savedZoom: number | null = null;

        if (isAuthenticated) {
          // Load from database for logged-in users
          try {
            const dbZoom = await userPreferencesService.getPreference('page_zoom');
            if (dbZoom) {
              const zoomValue = parseInt(dbZoom, 10);
              if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
                savedZoom = zoomValue;
              }
            }
          } catch (error) {
            console.error('Failed to load zoom from database:', error);
            // Fallback to localStorage if database fails
            const localZoom = localStorage.getItem('linknest_user_page_zoom');
            if (localZoom) {
              const zoomValue = parseInt(localZoom, 10);
              if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
                savedZoom = zoomValue;
              }
            }
          }
        } else {
          // Load from localStorage for guest users
          const localZoom = localStorage.getItem('linknest_user_page_zoom');
          if (localZoom) {
            const zoomValue = parseInt(localZoom, 10);
            if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
              savedZoom = zoomValue;
            }
          }
        }

        // Apply saved zoom if different from current
        if (savedZoom !== null && savedZoom !== (styles.pageZoom || 100)) {
          const updatedStyles = { ...styles, pageZoom: savedZoom };
          updateStyles(updatedStyles);
          // Cache styles in localStorage for immediate access
          styleService.cacheStyles(updatedStyles);
        }
      } catch (error) {
        console.error('Failed to load zoom preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };

    loadZoomPreference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // Reload when authentication state changes

  const updateZoom = async (newZoom: number) => {
    // Clamp zoom value between 10 and 200
    const clampedZoom = Math.max(10, Math.min(200, newZoom));
    
    setCurrentZoom(clampedZoom);
    
    // Update styles (this will trigger the CSS update)
    const updatedStyles = { ...styles, pageZoom: clampedZoom };
    updateStyles(updatedStyles);
    
    // Cache styles in localStorage for immediate access (works for both authenticated and guest users)
    styleService.cacheStyles(updatedStyles);
    
    // Always persist locally so the next refresh can apply zoom before Style Manager CSS loads
    localStorage.setItem('linknest_user_page_zoom', clampedZoom.toString());

    // Save preference based on user type
    if (isAuthenticated) {
      // For logged-in users: save to database
      try {
        await userPreferencesService.updatePreference('page_zoom', clampedZoom.toString());
      } catch (error) {
        console.error('Failed to save zoom to database:', error);
      }
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(200, currentZoom + 5);
    updateZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(10, currentZoom - 5);
    updateZoom(newZoom);
  };

  const handleReset = () => {
    updateZoom(100);
  };

  const ZOOM_PRESETS = [70, 75, 80, 85, 90, 95, 100];

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Zoom Control Container */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2 flex flex-col items-center gap-2 min-w-[60px]">
        {/* Preset sizes 70–100 */}
        <div className="flex flex-wrap justify-center gap-1">
          {ZOOM_PRESETS.map((pct) => (
            <button
              key={pct}
              onClick={() => updateZoom(pct)}
              className={`min-w-[28px] h-7 px-1.5 rounded text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
                currentZoom === pct
                  ? 'bg-brand-500 text-white dark:bg-brand-600'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
              }`}
              title={`Zoom ${pct}%`}
              aria-label={`Zoom ${pct}%`}
            >
              {pct}
            </button>
          ))}
        </div>
        {/* Zoom In Button */}
        <button
          onClick={handleZoomIn}
          disabled={currentZoom >= 200}
          className="w-10 h-10 flex items-center justify-center rounded-md bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          title="Zoom In (+5%)"
          aria-label="Zoom In"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5H4.25a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Zoom Percentage Display */}
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-2 py-1 min-h-[24px] flex items-center justify-center">
          {currentZoom}%
        </div>

        {/* Zoom Out Button */}
        <button
          onClick={handleZoomOut}
          disabled={currentZoom <= 10}
          className="w-10 h-10 flex items-center justify-center rounded-md bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          title="Zoom Out (-5%)"
          aria-label="Zoom Out"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Reset Button */}
        {currentZoom !== 100 && (
          <button
            onClick={handleReset}
            className="w-10 h-10 flex items-center justify-center rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 text-xs font-semibold"
            title="Reset to 100%"
            aria-label="Reset Zoom"
          >
            100
          </button>
        )}
      </div>
    </div>
  );
};

// Export as PageZoomWidget for consistency with other widgets
export const PageZoomWidget = PageZoomControl;
