import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../contexts/SettingsContext';
import { HelpGuidesPanel } from './HelpGuidesPanel';

type TabType = 'help' | 'guides' | 'about';

interface HelpAboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional starting tab (defaults to help). */
  initialTab?: TabType;
}

export const HelpAboutDialog: React.FC<HelpAboutDialogProps> = ({
  isOpen,
  onClose,
  initialTab = 'help',
}) => {
  const { settings } = useSettings();
  const appName = settings?.app_name || 'LinkNest';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [appVersion, setAppVersion] = useState<string>('2.2.0');

  type WindowGeom = { x: number; y: number; width: number; height: number };
  const [geom, setGeom] = useState<WindowGeom>({ x: 0, y: 0, width: 1200, height: 800 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxGeom, setPreMaxGeom] = useState<WindowGeom | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ w: 0, h: 0, x: 0, y: 0 });

  const computeLargeGeom = (): WindowGeom => {
    const margin = 12;
    const width = Math.min(window.innerWidth - margin * 2, 1600);
    const height = Math.min(window.innerHeight - margin * 2, Math.floor(window.innerHeight * 0.94));
    return {
      width,
      height,
      x: Math.max(0, Math.round((window.innerWidth - width) / 2)),
      y: Math.max(0, Math.round((window.innerHeight - height) / 2)),
    };
  };

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Open large (near fullscreen) each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setIsMaximized(false);
    setPreMaxGeom(null);
    setGeom(computeLargeGeom());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      if (isMaximized) return;
      setGeom((prev) => {
        const maxW = window.innerWidth - 8;
        const maxH = window.innerHeight - 8;
        return {
          width: Math.min(prev.width, maxW),
          height: Math.min(prev.height, maxH),
          x: Math.min(Math.max(0, prev.x), Math.max(0, maxW - Math.min(prev.width, maxW))),
          y: Math.min(Math.max(0, prev.y), Math.max(0, maxH - Math.min(prev.height, maxH))),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, isMaximized]);

  const toggleMaximize = () => {
    if (isMaximized) {
      setGeom(preMaxGeom || computeLargeGeom());
      setPreMaxGeom(null);
      setIsMaximized(false);
    } else {
      setPreMaxGeom(geom);
      setIsMaximized(true);
    }
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({ x: e.clientX - geom.x, y: e.clientY - geom.y });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({ w: geom.width, h: geom.height, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        const nextX = e.clientX - dragOffset.x;
        const nextY = e.clientY - dragOffset.y;
        setGeom((prev) => ({
          ...prev,
          x: Math.min(Math.max(-prev.width + 80, nextX), window.innerWidth - 80),
          y: Math.min(Math.max(0, nextY), window.innerHeight - 48),
        }));
      }
      if (isResizing) {
        const dw = e.clientX - resizeStart.x;
        const dh = e.clientY - resizeStart.y;
        setGeom((prev) => ({
          ...prev,
          width: Math.max(480, Math.min(window.innerWidth - prev.x - 8, resizeStart.w + dw)),
          height: Math.max(360, Math.min(window.innerHeight - prev.y - 8, resizeStart.h + dh)),
        }));
      }
    };

    const onUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const base =
          (typeof window !== 'undefined'
            ? (window.location.pathname || '/').replace(/\/[^/]*$/, '').replace(/\/$/, '')
            : '') || '';
        const candidates = [
          `${base}/BUILD_INFO.json`,
          `${base}/dist/BUILD_INFO.json`,
          '/BUILD_INFO.json',
        ];
        for (const url of candidates) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const info = await res.json();
            if (!cancelled && info?.appVersion) {
              setAppVersion(String(info.appVersion));
              return;
            }
          } catch {
            /* try next */
          }
        }
        // Admin fallback via updater API
        try {
          const { getUpdaterStatus } = await import('../services/updaterService');
          const s = await getUpdaterStatus();
          if (!cancelled && s?.currentVersion) {
            setAppVersion(s.currentVersion);
          }
        } catch {
          /* keep default */
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      <div
        className={`bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col pointer-events-auto border border-slate-200 dark:border-slate-700 relative ${
          isMaximized ? 'rounded-none' : 'rounded-2xl'
        } ${isDragging ? 'select-none' : ''}`}
        style={
          isMaximized
            ? {
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100vw',
                height: '100dvh',
                maxWidth: '100vw',
                maxHeight: '100dvh',
              }
            : {
                position: 'fixed',
                left: geom.x,
                top: geom.y,
                width: geom.width,
                height: geom.height,
                maxWidth: '100vw',
                maxHeight: '100dvh',
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — drag handle */}
        <div
          onMouseDown={handleHeaderMouseDown}
          onDoubleClick={toggleMaximize}
          className={`flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 ${
            isMaximized ? '' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              ?
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                Help & About
              </h2>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Drag header to move · Resize corner · Double-click or use Maximize for full screen
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleMaximize}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M5 4a1 1 0 00-1 1v3h2V6h2V4H5zm8 0v2h2v2h2V5a1 1 0 00-1-1h-3zM4 12v3a1 1 0 001 1h3v-2H6v-2H4zm12 0h-2v2h-2v2h3a1 1 0 001-1v-3z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4 4a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm2 1v8h8V5H6z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`flex-1 min-w-[5.5rem] px-4 sm:px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'help'
                ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guides')}
            className={`flex-1 min-w-[5.5rem] px-4 sm:px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'guides'
                ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            Guides
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('about')}
            className={`flex-1 min-w-[5.5rem] px-4 sm:px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'about'
                ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            About
          </button>
        </div>

        {/* Content */}
        <div
          className={`flex-1 min-h-0 ${
            activeTab === 'guides' ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 sm:p-6'
          }`}
        >
          {activeTab === 'guides' && <HelpGuidesPanel />}
          {activeTab === 'help' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                  Getting Started
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    <strong>{appName}</strong> is a smart landing page manager that helps you organize and share your important links in a beautiful, visual way.
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">For Guests (Not Signed In):</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>View all public tiles and links</li>
                      <li>Search and filter links</li>
                      <li>Navigate between tiles</li>
                      <li>Share the app via QR code from the navigation bar</li>
                      <li>Use floating widgets allowed for guests (clock, weather, calculator, and more)</li>
                      <li>Cannot create, edit, or delete content</li>
                    </ul>
                  </div>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">For Authenticated Users:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>All guest features</li>
                      <li>Create, edit, and delete tiles/spaces</li>
                      <li>Manage links, tabs, sections, and rich text (including boxed content)</li>
                      <li>Customize tiles with header/emoji images and display options</li>
                      <li>Organize tiles into categories and favorite them</li>
                      <li>Share spaces with other users and accept shared-tile invitations</li>
                      <li>View visitor stats on spaces you can manage</li>
                      <li>Use Notes, Chat, Favorites Organizer, and other signed-in widgets</li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2 border border-emerald-200 dark:border-emerald-800">
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Guides tab:</p>
                    <p className="text-sm">
                      Open the <strong>Guides</strong> tab in this dialog for searchable in-app docs (setup, architecture, App Updates, deployment, and more). Start with App Updates or Architecture for the latest admin workflows.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                  Creating Your First Space
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li><strong>Sign In:</strong> Click "Sign In" in the navigation bar and create an account or log in</li>
                    <li><strong>Create Space:</strong> Click the "New Space" button on the main page</li>
                    <li><strong>Choose Type:</strong> Select between a "Space" (for organizing links) or "Hyperlink" (for quick external links)</li>
                    <li><strong>Customize:</strong> Choose an emoji or emoji image, color theme, optional header image, title, and description</li>
                    <li><strong>Add Links:</strong> Click on your tile to open it, then add links to sections</li>
                    <li><strong>Organize:</strong> Create tabs and sections to organize your links logically</li>
                    <li><strong>Enrich:</strong> Add rich text or boxed content, scheduling, browser preferences, or visibility settings</li>
                    <li><strong>Share:</strong> Use QR codes or Share with a user when you want others to open the space quickly</li>
                  </ol>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
                  </svg>
                  Key Features
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Tiles & Spaces</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Create visual tiles for different topics. Each tile can contain multiple tabs and sections to organize your links. Tiles can also be hyperlinks that redirect to external URLs.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Link Management</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Add, edit, and organize links with custom icons, notes, tooltips, and rich text content. Set visibility levels, scheduling, and browser preferences for each link.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Roles &amp; Teams</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Create teams and roles to manage access at scale. Roles control what people can see; teams share roles across members; space editors let trusted people edit specific spaces.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Categories</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Organize your tiles into categories for better navigation. Drag and drop to reorder tiles within categories.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Link Health Monitoring</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Automatically check the health of your links and get notified when links are broken or unreachable.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Visibility Controls</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Set tiles, tabs, sections, and links as public, authenticated-only, or private with user-specific access.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Scheduling</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Schedule tiles and tabs to appear or expire at specific dates and times. Perfect for time-sensitive content and announcements.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Rich Text &amp; Boxed Content</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Add rich text to sections with formatting, emoji, and images. Turn items into boxed cards with optional titles and footers for polished notes, docs, or announcements.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Tile Visuals</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Upload header and emoji images, control title/description visibility, and adjust header image position. Compact mobile layouts adapt automatically on smaller screens.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">QR Code Sharing</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Share the app URL via a branded QR code from the nav bar (desktop and mobile). Open space QR codes from tile views for quick access on phones and shared displays. Long URLs (for example many SharePoint links) intentionally omit the center logo or emoji so the code stays scannable — that is expected, not a missing branding setting.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Share Spaces</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Share a space with another user, manage active shares, and revoke access anytime. Recipients get share notifications they can accept or decline.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Visitor Insights</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Track space visits with hit counts and unique visitors. Review stats from Space Info to understand engagement over time.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Style Management</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Administrators can create and manage custom style profiles to customize the appearance of tiles, categories, and the entire application. Switch between different visual themes instantly.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Access Manager</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Clear access tools for roles (what people can see), teams (shared roles), and space editors (who can edit specific spaces). Fine-tune permissions control add, edit, and delete actions. Built for admins who should not need a training manual.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Staging &amp; AI Offline Kit</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Admin-only sandbox for preparing spaces before they go live. Use the AI Offline Kit to download a CSV template and prompt guide, convert CSV to JSON, and import into Staging — then Move to Public when ready. Staging content is never visible to normal users.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Version Control</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Track all changes to your tiles with comprehensive version history. View, compare, and restore previous versions. Lock important versions to prevent deletion. Automatic changelog generation for every change.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Custom Widgets</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Create and integrate custom widgets into the application. Full widget development framework with role-based access control. Build your own tools and utilities that integrate seamlessly with {appName}.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Instance Cloning</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Clone entire {appName} instances with progress tracking. Create copies of your installation with or without assets and database. Perfect for creating test environments or backups.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Tile Animations</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Choose from 200+ professional tile animations including fade, slide, zoom, bounce, and many more. Add seasonal decorations for holidays and special occasions. Personalize your workspace appearance.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Floating Widgets</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Clock (timezones), Weather, Calculator, Password Generator, Phonetic Alphabet, Page Zoom, Theme, Notes, Favorites Organizer, Chat, and Snake Game. Toggle from the nav bar or press Ctrl+Shift+Y for Quick Access.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">System Monitoring</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Monitor URLs, keywords, ports, and ping targets. Track response times, view historical charts, set up maintenance windows, and receive email notifications with advanced rule-based alerts.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Add-ons (Analytics &amp; Monitorv2)</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Optional PostgreSQL-backed add-ons: Performance Analytics (beacons, sampling, dashboards) and Monitorv2 for advanced monitoring with TimescaleDB retention. Configure under Admin → Add-ons.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">In-app App Updates</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Admins can check GitHub commits/releases, preview changes, apply updates with database backup, and roll back from the App Updates UI (XAMPP/filesystem installs).
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Email Notifications</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Advanced email notification system with multiple SMTP server support, custom templates, time-based rules, day-of-week filters, and recipient management. Pause/resume notifications globally.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Link Health Statuses</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Health checks surface up, down, and redirected states so you can spot broken links and unexpected redirects before users hit them.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                    <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                  </svg>
                  Browser Integration
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    {appName} integrates with <strong>Browser Launcher Pro</strong> extension to open links in specific browsers. This is perfect for testing, development, or organizing links by browser.
                  </p>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">Browser-Specific Links:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Set a default browser for an entire tile</li>
                      <li>Override browser per individual link</li>
                      <li>Support for Chrome, Edge, Firefox, Opera, Brave (stable, beta, dev versions)</li>
                      <li>WSL browser support for development environments</li>
                      <li>Automatic fallback to default browser if extension is unavailable</li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Setup Instructions:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                      <li>Install the Browser Launcher Pro extension in your browser</li>
                      <li>Go to Admin Panel → Browser Extension tab</li>
                      <li>Configure your extension ID (usually auto-detected)</li>
                      <li>Enable "Browser-Specific Links" in settings</li>
                      <li>Select browsers for your tiles or individual links</li>
                    </ol>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Note:</strong> Browser integration requires the Browser Launcher Pro extension. Links will open normally in your default browser if the extension is not installed or enabled.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm5.75 7.75a.75.75 0 00-1.5 0v2.546l-.72-.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l2-2a.75.75 0 10-1.06-1.06l-.72.72V9.75z" clipRule="evenodd" />
                  </svg>
                  In-app App Updates
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    On XAMPP / filesystem installs, admins can update {appName} from GitHub without manually copying a deploy ZIP. Open the bell in the nav or <strong>Admin → Tools → App Updates</strong>.
                  </p>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">What you can do:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Track a branch (e.g. <code className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">main</code>) and see new commits ahead of your install</li>
                      <li>Apply versioned GitHub Releases (<code className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">vX.Y.Z</code>)</li>
                      <li>Preview changed files, approximate size, and ETA before updating</li>
                      <li>Back up the database before apply (on by default) and keep rollback snapshots</li>
                      <li>Restore a previous snapshot (optionally with the linked DB backup)</li>
                      <li>See <strong>local only</strong> commits made on this machine that are not yet pushed</li>
                    </ul>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Note:</strong> Private repos need a GitHub classic PAT with <code className="bg-white dark:bg-slate-800 px-1 rounded text-xs">repo</code> scope. Docker in-container updates are out of scope — use your image rebuild process instead. Full details are in Guides → App Updates.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h2.5A2.25 2.25 0 0110 4.25v2.5A2.25 2.25 0 017.75 9h-2.5A2.25 2.25 0 013 6.75v-2.5zm0 9A2.25 2.25 0 015.25 11h2.5A2.25 2.25 0 0110 13.25v2.5A2.25 2.25 0 017.75 18h-2.5A2.25 2.25 0 013 15.75v-2.5zm9-9A2.25 2.25 0 0114.25 2h2.5A2.25 2.25 0 0119 4.25v2.5A2.25 2.25 0 0116.75 9h-2.5A2.25 2.25 0 0112 6.75v-2.5zm2.25 9a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75v-.5a.75.75 0 00-.75-.75h-.5zM12 13.25a.75.75 0 01.75-.75h.5a.75.75 0 01.75.75v.5a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75v-.5zm4.5 2.25a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75v-.5a.75.75 0 00-.75-.75h-.5zM12 16.75a.75.75 0 01.75-.75h.5a.75.75 0 01.75.75v.5a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75v-.5z" clipRule="evenodd" />
                  </svg>
                  QR Codes, Sharing &amp; Visits
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">QR codes:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Tap the QR icon in the navigation bar to share the app URL (guests included)</li>
                      <li>Open space QR codes from tile / mobile views for on-the-go access</li>
                      <li>Branded QR centers use your logo or emoji; admins can tune branding in Settings</li>
                      <li>Very long links skip the center image on purpose so the QR can still encode and scan reliably (common with SharePoint and similar URLs)</li>
                    </ul>
                  </div>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">Share a space with a user:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>From a space you manage, open Share and pick a user (search by username or email)</li>
                      <li>Recipients see share notifications and can accept or reject</li>
                      <li>Revoke shares anytime from the same dialog</li>
                      <li>Block a user to stop future shares from them; manage the list under Blocked Users</li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Visitor stats:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Opening a space records visits (hits and unique visitors)</li>
                      <li>View totals under Space Info → Visitors</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                  System Monitoring Dashboard
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Monitor the health and availability of your systems, services, and websites with comprehensive monitoring tools.
                  </p>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">Monitor Types:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>URL Monitoring:</strong> Check HTTP/HTTPS endpoints and websites</li>
                      <li><strong>Keyword Monitoring:</strong> Verify specific text appears on web pages</li>
                      <li><strong>Port Monitoring:</strong> Check if network ports are open and accepting connections</li>
                      <li><strong>Ping Monitoring:</strong> Verify host/IP address reachability</li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Monitoring Features:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Customizable check intervals (minutes)</li>
                      <li>Response time tracking and historical charts</li>
                      <li>Warning thresholds and consecutive failure tracking</li>
                      <li>Maintenance windows to suppress alerts during scheduled downtime</li>
                      <li>Multiple view modes: tiles, grid, compact, and capsule layouts</li>
                      <li>Auto-refresh with configurable intervals</li>
                      <li>Fullscreen monitoring dashboard</li>
                      <li>Custom tile styling for different statuses (up, down, warning)</li>
                      <li>Organize monitors into tabs and groups</li>
                      <li>Export/import monitors via CSV</li>
                      <li>Bulk operations and duplicate monitors</li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Email Notifications:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Advanced rule-based notification system</li>
                      <li>Multiple SMTP server support with failover</li>
                      <li>Custom email templates with variables</li>
                      <li>Time-based rules (specific hours, days of week)</li>
                      <li>Status triggers (down, up, or both)</li>
                      <li>Recipient management (to, cc, bcc)</li>
                      <li>Global notification pause/resume</li>
                      <li>Email log viewing and troubleshooting</li>
                    </ul>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-violet-900 dark:text-violet-100">Add-ons — Monitorv2 &amp; Analytics:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>Monitorv2:</strong> Optional advanced monitoring stack backed by PostgreSQL / TimescaleDB with retention and cleanup controls</li>
                      <li><strong>Performance Analytics:</strong> Optional beacon-based metrics with sampling, anonymous/login tracking, and dashboard URL</li>
                      <li>Enable and configure both under <strong>Admin → Tools → Add-ons</strong> (includes connection tests and setup helpers)</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
                  </svg>
                  Teams &amp; Access Control
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Manage access using <strong>teams</strong>, <strong>roles</strong>, and <strong>space editors</strong> from Admin → Access Manager.
                  </p>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">Teams:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Create teams to organize users by department or project</li>
                      <li>Assign users to multiple teams for flexible organization</li>
                      <li>Assign roles to teams — all members inherit team permissions</li>
                      <li>Manage membership from Access Manager → Teams</li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Space editors with team support:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>Assign people &amp; teams:</strong> Grant edit privileges on specific spaces</li>
                      <li><strong>Not full admins:</strong> Editors only manage assigned spaces</li>
                      <li><strong>Fine-tune permissions:</strong> Control add/edit/delete for links, sections, and tabs</li>
                      <li><strong>Defaults:</strong> Editors can add/edit but not delete or change sensitive settings</li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Fine-tune permissions:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>Add/Edit Control:</strong> Allow or restrict adding/editing links, sections, and tabs</li>
                      <li><strong>Delete Control:</strong> Separate permissions for deleting links, sections, and tabs</li>
                      <li><strong>Visibility Control:</strong> Control who can change space visibility settings</li>
                      <li><strong>Browser Control:</strong> Manage who can change browser settings</li>
                      <li><strong>Clone Control:</strong> Restrict space cloning to specific users</li>
                      <li><strong>Info Access:</strong> Control access to space information and statistics</li>
                      <li>Default: Space editors can add/edit but not delete or change sensitive settings</li>
                    </ul>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-violet-900 dark:text-violet-100">Roles:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Create roles that control what people can <strong>see</strong> (not edit)</li>
                      <li>Assign roles to people or teams from Access Manager → Roles → Assign access</li>
                      <li>Configure spaces &amp; links, app tabs, and widgets per role</li>
                      <li>Bulk add, replace, or remove roles for many people or teams at once</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 018.75 1h2.5A2.75 2.75 0 0114 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.759 2.551A41.44 41.44 0 0110 14c-1.392 0-2.767-.128-4.121-.378-1.065-.36-1.759-1.425-1.759-2.55V7.07c0-1.32.947-2.488 2.294-2.676A41.46 41.46 0 016 4.193V3.75zM8.75 2.5a1.25 1.25 0 00-1.25 1.25v.34A41.81 41.81 0 0110 4c.932 0 1.854.04 2.765.118v-.368a1.25 1.25 0 00-1.25-1.25h-2.5zM10 15.5c.967 0 1.92-.073 2.855-.215a.75.75 0 01.845.835l-.112.84a2.75 2.75 0 01-2.728 2.39H9.14a2.75 2.75 0 01-2.728-2.39l-.112-.84a.75.75 0 01.845-.835c.935.142 1.888.215 2.855.215z" clipRule="evenodd" />
                  </svg>
                  Demo Data Scripts (Public / Authenticated / Assigned)
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Admins can seed presentation data with CLI scripts under <code className="text-sm bg-slate-100 dark:bg-slate-800 px-1 rounded">scripts/</code>.
                    The colorful script uses gradients; the simple script uses solid theme colors. Both create the same visibility and role layout.
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Run (CLI only — requires confirmation):</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm font-mono">
                      <li>php scripts/generate_demo_data.php --yes</li>
                      <li>php scripts/generate_demo_data_simple.php --yes</li>
                    </ul>
                    <p className="text-sm mt-2">These scripts replace existing tiles, links, and monitors. Backup the database first.</p>
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-4 space-y-2 border border-sky-200 dark:border-sky-800">
                    <p className="font-medium text-sky-900 dark:text-sky-100">How demo spaces are split (25 total):</p>
                    <ul className="list-disc list-inside space-y-2 ml-2 text-sm">
                      <li>
                        <strong>Public (~8)</strong> — visibility <em>public</em>. Appear on the <strong>Public</strong> tab for guests and signed-in users.
                        Examples: Company Dashboard, Analytics Hub, Customer Portal, Documentation, IT Support.
                      </li>
                      <li>
                        <strong>Authenticated (~5)</strong> — visibility <em>authenticated</em>. Appear under <strong>Your Apps → Authenticated</strong> for every signed-in user (not for guests).
                        Examples: HR Portal, Communication Hub, Project Management, File Sharing, Collaborative Workspaces.
                      </li>
                      <li>
                        <strong>Your Assigned Apps (~12)</strong> — visibility <em>private</em> plus <strong>role tile/link permissions</strong>.
                        Appear under <strong>Your Apps → Your Assigned Apps</strong> only for users whose role was granted that space.
                        Examples: Development Tools, CI/CD, Cloud Services, Finance Center, Forms &amp; Requests.
                      </li>
                    </ul>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 space-y-2 border border-violet-200 dark:border-violet-800">
                    <p className="font-medium text-violet-900 dark:text-violet-100">Try it with demo users (password: <code className="text-xs bg-white/60 dark:bg-slate-800 px-1 rounded">password</code>):</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>Guest (signed out)</strong> — Public tab shows the public showcase only.</li>
                      <li><strong>Any demo user</strong> — Your Apps → Authenticated shows the shared staff spaces.</li>
                      <li><strong>demo3 (Designer)</strong> — Your Assigned Apps shows design/dev tools (repos, CI/CD, testing, API, forms). Check Admin → Users notes for the org role blurb.</li>
                      <li><strong>demo2 (Developer)</strong> — Your Assigned Apps shows the full Development + Infrastructure set.</li>
                      <li><strong>demo9 (Guest role)</strong> — Your Assigned Apps is minimal (Forms only), while Authenticated still shows the shared five.</li>
                    </ul>
                    <p className="text-sm mt-2">Demo accounts include admin <strong>Notes</strong> (role and access context) so presenters can see who each user represents.</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2 border border-emerald-200 dark:border-emerald-800">
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Why Assigned spaces are not on Public:</p>
                    <p className="text-sm">
                      Role-assigned demo spaces use private visibility so they stay off the Public/guest grid.
                      Role permissions unlock them in Your Assigned Apps (and when opening a space, only role-granted links are highlighted for that view).
                      Authenticated spaces stay separate so you can demo “everyone signed in” vs “only my role.”
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 018.75 1h2.5A2.75 2.75 0 0114 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.759 2.551A41.44 41.44 0 0110 14c-1.392 0-2.767-.128-4.121-.378-1.065-.36-1.759-1.425-1.759-2.55V7.07c0-1.32.947-2.488 2.294-2.676A41.46 41.46 0 016 4.193V3.75zM8.75 2.5a1.25 1.25 0 00-1.25 1.25v.34A41.81 41.81 0 0110 4c.932 0 1.854.04 2.765.118v-.368a1.25 1.25 0 00-1.25-1.25h-2.5zM10 15.5c.967 0 1.92-.073 2.855-.215a.75.75 0 01.845.835l-.112.84a2.75 2.75 0 01-2.728 2.39H9.14a2.75 2.75 0 01-2.728-2.39l-.112-.84a.75.75 0 01.845-.835c.935.142 1.888.215 2.855.215z" clipRule="evenodd" />
                  </svg>
                  Staging &amp; Space Lifecycle
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    <strong>Staging</strong> is an admin-only sandbox. Prepare and test spaces there without affecting what normal users see. When ready, open a space and choose <strong>Move to Public</strong>.
                  </p>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-amber-900 dark:text-amber-100">AI Offline Kit:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                      <li>Download the CSV Template and AI Prompt Guide</li>
                      <li>Fill the CSV offline with an AI using the prompt guide</li>
                      <li>Convert with CSV → JSON (downloads JSON; does not save to the database yet)</li>
                      <li>Import AI JSON into Staging, review, then Move to Public</li>
                    </ol>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">After publishing (simplified lifecycle):</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>Public / Your Apps / Private / Favorites</strong> — live views based on visibility and favorites</li>
                      <li><strong>Scheduled / Expired</strong> — controlled by visible-from and expires-at dates</li>
                      <li><strong>Archive</strong> — hide from active browsing but keep for reference</li>
                      <li><strong>Recycle Bin</strong> — soft-deleted spaces; restore or purge permanently</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                  </svg>
                  Version Control & History
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Track every change made to your tiles with comprehensive version control.
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Version Features:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Automatic version creation on every save</li>
                      <li>View complete history of all changes</li>
                      <li>Compare versions side-by-side with diff viewer</li>
                      <li>Restore any previous version</li>
                      <li>Lock important versions to prevent deletion</li>
                      <li>Auto-generated changelog summaries</li>
                      <li>Add tags and comments to versions</li>
                      <li>Cleanup empty or duplicate versions</li>
                      <li>Temporary "before" snapshots when editing</li>
                    </ul>
                  </div>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">What's Tracked:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Tile properties (title, description, emoji, theme, category)</li>
                      <li>All tabs, sections, and links</li>
                      <li>Visibility settings and allowed users</li>
                      <li>Rich text content and formatting</li>
                      <li>Scheduling dates and browser preferences</li>
                      <li>Messages and announcements</li>
                      <li>Complete structure and organization</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 014.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
                  </svg>
                  Database Maintenance
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Keep your database clean and optimized with built-in maintenance tools.
                  </p>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-orange-900 dark:text-orange-100">Database Cleanup:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Scan for orphaned records (sections, links, tabs, permissions)</li>
                      <li>Remove orphaned data with one click</li>
                      <li>Detailed breakdown of what will be cleaned</li>
                      <li>Transaction-based safety (rollback on errors)</li>
                      <li>Available via Admin Panel UI or CLI scripts</li>
                      <li>Helps resolve duplicate entries and improves performance</li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">What Gets Cleaned:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Permissions for deleted tiles</li>
                      <li>Sections referencing deleted tiles</li>
                      <li>Links referencing deleted sections</li>
                      <li>Tabs referencing deleted tiles</li>
                      <li>Duplicate permission records</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
                  </svg>
                  Custom Widgets Development
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Extend {appName} with custom widgets built using React and TypeScript.
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Widget Capabilities:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Create floating widgets or embedded components</li>
                      <li>Full access to React hooks and state management</li>
                      <li>Integration with {appName} design system</li>
                      <li>Dark mode support built-in</li>
                      <li>Role-based access control for custom widgets</li>
                      <li>Register widgets via Admin Panel interface</li>
                    </ul>
                  </div>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">Getting Started:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                      <li>Create your React component in <code className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">components/</code></li>
                      <li>Register widget via Admin Panel → Widgets</li>
                      <li>Assign widget to roles for access control</li>
                      <li>Widget appears in navigation for authorized users</li>
                    </ol>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M6 4a1 1 0 011-1h6a1 1 0 011 1v1h1a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h1V4zm2 2V4h4v2H8zM5 7a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1H5zm3 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  Keyboard Shortcuts
                </h3>
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="text-left pb-2 font-semibold text-slate-900 dark:text-white">Shortcut</th>
                          <th className="text-left pb-2 font-semibold text-slate-900 dark:text-white">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        <tr>
                          <td className="py-2 pr-4">
                            <span className="inline-flex items-center gap-1">
                              <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">Ctrl</kbd>
                              <span className="text-slate-400">+</span>
                              <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">Shift</kbd>
                              <span className="text-slate-400">+</span>
                              <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">Y</kbd>
                            </span>
                          </td>
                          <td className="py-2 text-slate-700 dark:text-slate-300">Open Widget Quick Access menu</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4">
                            <span className="inline-flex items-center gap-1">
                              <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">↑</kbd>
                              <span className="text-slate-400">/</span>
                              <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">↓</kbd>
                            </span>
                          </td>
                          <td className="py-2 text-slate-700 dark:text-slate-300">Navigate widgets in menu</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4">
                            <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">Enter</kbd>
                          </td>
                          <td className="py-2 text-slate-700 dark:text-slate-300">Toggle selected widget on/off</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4">
                            <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono shadow-sm">Esc</kbd>
                          </td>
                          <td className="py-2 text-slate-700 dark:text-slate-300">Close dialogs &amp; menus</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                  Tips & Tricks
                </h3>
                <div className="space-y-2 text-slate-700 dark:text-slate-300">
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Use the search bar to quickly find links across all tiles</li>
                    <li>Favorite frequently used tiles for quick access; organize favorites with the Favorites Organizer widget</li>
                    <li>Organize related tiles into categories</li>
                    <li>Use tabs within tiles to group related links</li>
                    <li>Create hyperlink tiles for quick access to external resources</li>
                    <li>Upload header or emoji images and hide title/description when you want a visual-first card</li>
                    <li>Use boxed rich text for titled cards with optional footers inside sections</li>
                    <li>Schedule tiles and tabs to appear or expire automatically</li>
                    <li>Set browser preferences per tile or link for testing workflows</li>
                    <li>Hold Ctrl/Cmd while clicking links to override browser settings</li>
                    <li>Share the app or a space via branded QR codes</li>
                    <li>Share a private/authenticated space with another user and manage shares from the Share dialog</li>
                    <li>Block unwanted sharers; review Blocked Users when needed</li>
                    <li>Check Space Info → Visitors for hit counts and unique visitors</li>
                    <li>Export and import spaces to share with others</li>
                    <li>Use the recycle bin to recover accidentally deleted tiles</li>
                    <li>Archive old tiles to keep your workspace clean</li>
                    <li>Watch for redirected link-health status when a URL unexpectedly changes destination</li>
                    <li>Use style profiles and page backgrounds to customize appearance (admin / style manager)</li>
                    <li>Create teams and assign entire teams to spaces (admin only)</li>
                    <li>Assign space editor privileges to people or teams with fine-tune permission control (admin only)</li>
                    <li>Manage roles and assign them to users and groups for streamlined access control (admin only)</li>
                    <li>Track tile changes with version control — view, compare, and restore versions</li>
                    <li>Apply App Updates from the admin bell, with DB backup and rollback (admin, XAMPP installs)</li>
                    <li>Configure optional Analytics and Monitorv2 add-ons under Admin → Add-ons</li>
                    <li>Clone {appName} instances for testing or backup purposes (admin only)</li>
                    <li>Run database cleanup to remove orphaned records and optimize performance (admin only)</li>
                    <li>Create custom widgets with full development framework (admin only)</li>
                    <li>Customize tile animations from 200+ options for a personalized experience</li>
                    <li>Add seasonal decorations to tiles for holidays and special occasions</li>
                    <li>Toggle floating widgets from the navigation bar or press <strong>Ctrl+Shift+Y</strong> for the Widget Quick Access menu</li>
                    <li>Use the Notes and Chat widgets when signed in; Password Generator and Zoom Control are available from the widgets pill</li>
                    <li>Monitor system health with URL, keyword, port, and ping checks</li>
                    <li>Set up email notifications with advanced rules and multiple SMTP servers</li>
                    <li>View monitoring history with interactive charts and graphs</li>
                    <li>Schedule maintenance windows to suppress monitoring alerts</li>
                    <li>Pause/resume email notifications globally when needed</li>
                    <li>Use SAML/SSO for enterprise Single Sign-On authentication (admin only)</li>
                    <li>Control tab visibility to show/hide specific tabs application-wide (admin only)</li>
                    <li>Send broadcast messages that scroll across the application (admin only)</li>
                    <li>Open the <strong>Guides</strong> tab for searchable docs (Architecture, App Updates, deployment, and more)</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                  </svg>
                  Enterprise Features
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    {appName} includes enterprise-grade features for large organizations.
                  </p>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-indigo-900 dark:text-indigo-100">Authentication & SSO:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>Local Authentication:</strong> Built-in user management with secure password storage</li>
                      <li><strong>LDAP Integration:</strong> Connect to Active Directory or LDAP servers for centralized user management</li>
                      <li><strong>LDAP User Search:</strong> Prefix search by username, display name, email, CN, or UPN — short names (2+ characters) supported with AD-friendly fallbacks</li>
                      <li><strong>LDAP Directory Info:</strong> View lock status, account flags, CN/DN, and group membership from User Actions (expand to load)</li>
                      <li><strong>SAML/SSO:</strong> Enterprise Single Sign-On with SAML 2.0 protocol support</li>
                      <li>Multiple authentication sources can coexist</li>
                      <li>User provisioning and synchronization</li>
                    </ul>
                  </div>
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-cyan-900 dark:text-cyan-100">Deployment Options:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>Traditional LAMP/WAMP stack deployment</li>
                      <li>Docker containerization support</li>
                      <li>Docker Compose orchestration</li>
                      <li>HTTPS/SSL configuration guides</li>
                      <li>Reverse proxy support (Apache, Nginx)</li>
                      <li>Load balancing ready</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                  Administrator Features
                </h3>
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p>
                    Administrators have access to additional features through the Admin Panel:
                  </p>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">Admin Panel Features:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li><strong>User Management:</strong> Approve pending users, manage all users, change local user passwords, edit user details</li>
                      <li><strong>User Actions:</strong> Promote/disable users, impersonate, assign roles, toggle auth source; LDAP users show expandable directory info (lock status, CN, groups, and more)</li>
                      <li><strong>Add LDAP Users:</strong> Search directory with short or partial names; auto-select exact/single matches; detailed errors when LDAP search fails</li>
                      <li><strong>Change Password (Local):</strong> Admins can set a new password for non-admin local accounts from User Actions</li>
                      <li><strong>Teams:</strong> Create teams, add members, attach roles so everyone inherits the same visibility</li>
                      <li><strong>Roles:</strong> Control what people can see — spaces, links, app tabs, and widgets</li>
                      <li><strong>Space editors:</strong> Let people or teams edit specific spaces without full admin rights</li>
                      <li><strong>Fine-tune permissions:</strong> Control what space editors can add, edit, or delete</li>
                      <li><strong>Assign access:</strong> Add, replace, or remove roles for people or teams in bulk</li>
                      <li><strong>Branding &amp; Settings:</strong> App name, logos, favicon, header logo, fonts, QR branding, footer, and guest access</li>
                      <li><strong>Style Management:</strong> Create style profiles, page backgrounds, and switch themes instantly</li>
                      <li><strong>App Updates:</strong> Check GitHub commits/releases, preview changes, apply with DB backup, and roll back</li>
                      <li><strong>Add-ons:</strong> Enable Performance Analytics and Monitorv2 (PostgreSQL), test connections, and manage retention</li>
                      <li><strong>Instance Cloning:</strong> Clone {appName} installations with progress tracking</li>
                      <li><strong>LDAP Integration:</strong> Configure LDAP authentication for enterprise environments</li>
                      <li><strong>SAML/SSO:</strong> Enterprise Single Sign-On with SAML 2.0 support</li>
                      <li><strong>Browser Extension:</strong> Configure Browser Launcher Pro extension settings</li>
                      <li><strong>Database Management:</strong> Export/import backups, cleanup orphaned records, duplicate-tile cleanup</li>
                      <li><strong>Space Management:</strong> Bulk import/export spaces, manage all spaces</li>
                      <li><strong>Staging:</strong> Admin sandbox with AI Offline Kit (CSV → JSON → Staging → Public)</li>
                      <li><strong>Tab Visibility:</strong> Control which tabs are visible in the application</li>
                      <li><strong>Custom Widgets:</strong> Create, enable/disable, and manage custom widgets</li>
                      <li><strong>Broadcast Messages:</strong> Display scrolling messages across the application</li>
                      <li><strong>Monitoring Management:</strong> Create, edit, and manage system monitors with advanced configuration</li>
                      <li><strong>SMTP Configuration:</strong> Configure multiple SMTP servers for email notifications</li>
                      <li><strong>Email Templates:</strong> Customize email notification templates and manage notification rules</li>
                      <li><strong>Load Test:</strong> Run and review load-test tooling from Admin → Tools</li>
                      <li><strong>Maintenance:</strong> Maintenance mode and maintenance scripts</li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6">
              <section className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center mx-auto mb-4 text-4xl shadow-lg">
                  🔗
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{appName}</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  A smart, aesthetic landing page manager
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-500">
                  Version {appVersion}
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">What&apos;s New in 2.2.0</h3>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>In-app App Updates:</strong> Check GitHub commits/releases, preview changes, apply with DB backup, and roll back from Admin (XAMPP installs)</li>
                    <li><strong>Guides tab:</strong> Searchable in-app documentation (Architecture, App Updates, deployment, and more)</li>
                    <li><strong>QR sharing:</strong> Branded QR codes for the app URL and spaces (desktop + mobile)</li>
                    <li><strong>Share spaces:</strong> Share with users, accept/reject notifications, and revoke access</li>
                    <li><strong>Visitor stats:</strong> Hit counts and unique visitors on Space Info</li>
                    <li><strong>Tile visuals:</strong> Header &amp; emoji images, title/description visibility, and compact mobile layouts</li>
                    <li><strong>Boxed rich text:</strong> Optional titled/footer cards inside sections</li>
                    <li><strong>Add-ons:</strong> Performance Analytics and Monitorv2 (PostgreSQL) management under Admin → Add-ons</li>
                    <li><strong>Link health:</strong> Redirected status alongside up/down</li>
                    <li><strong>Branding:</strong> Favicon, header logo, QR branding options, and improved logo handling</li>
                  </ul>
                </div>
                <div className="mt-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-medium text-slate-900 dark:text-white">Also in recent 2.1.x:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>LDAP short/partial name search with richer diagnostics</li>
                    <li>LDAP Directory Info panel on User Actions</li>
                    <li>Admin change-password for local (non-admin) users</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Description</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  {appName} helps you create beautiful, organized landing pages for your important links.
                  Organize links into visual tiles, customize their appearance (including header images and boxed rich text), and share them with your team — via roles, space editors, user shares, or QR codes.
                  With <strong>Access Manager</strong>, <strong>Staging &amp; AI Offline Kit</strong>, <strong>version control</strong>, <strong>in-app App Updates</strong>, browser integration, scheduling, link health monitoring, visitor insights,
                  style management, system monitoring and optional add-ons, email notifications, floating widgets, SAML/SSO, and 200+ tile animations,
                  {appName} makes managing and sharing links simple, powerful, and elegant.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Technology Stack</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Frontend</h4>
                    <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                      <li>• React 19</li>
                      <li>• TypeScript</li>
                      <li>• Tailwind CSS</li>
                      <li>• Vite</li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Backend</h4>
                    <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                      <li>• PHP 8+</li>
                      <li>• SQLite</li>
                      <li>• RESTful API</li>
                      <li>• Apache/Nginx</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Features</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {[
                    'Visual Tile Management',
                    'Header & Emoji Images',
                    'Link Organization',
                    'Link Health Monitoring (incl. Redirected)',
                    'User Authentication',
                    'Visibility Controls',
                    'Categories & Groups',
                    'Favorites & Archive',
                    'Share Spaces with Users',
                    'Shared Tile Notifications',
                    'QR Code Sharing',
                    'Visitor Hit & Unique Stats',
                    'Export/Import',
                    'Dark Mode',
                    'Responsive / Mobile Layouts',
                    'Guest Access Mode',
                    'Browser Integration',
                    'Hyperlink Tiles',
                    'Scheduling & Time-based Content',
                    'Tab & Section Organization',
                    'Rich Text & Boxed Content',
                    'Style Profile Management',
                    'Page Backgrounds',
                    'Teams Management',
                    'Roles & Visibility Access',
                    'Space Editors with Team Support',
                    'Fine-tune Permission System',
                    'Version Control & History',
                    'Version Comparison & Restore',
                    'Access Manager',
                    'Staging & AI Offline Kit',
                    'In-app App Updates & Rollback',
                    'Help Guides (in-app docs)',
                    'Instance Cloning',
                    'LDAP Authentication',
                    'LDAP Directory User Details',
                    'LDAP Short-Name User Search',
                    'SAML/SSO Authentication',
                    'Admin Panel',
                    'Admin Change Local Password',
                    'Branding (Logo, Favicon, Header Logo)',
                    'Bulk Import/Export',
                    'Database Cleanup Tools',
                    'Custom Widget Development',
                    'Tab Visibility Control',
                    'Broadcast Messages',
                    'Tile Animations (200+ options)',
                    'Seasonal Decorations',
                    'Floating Widgets',
                    'Clock & Timezone Display',
                    'Phonetic Alphabet Reference',
                    'Notes Widget',
                    'Weather Widget',
                    'Calculator Widget',
                    'Password Generator Widget',
                    'Zoom Control Widget',
                    'Theme Toggle Widget',
                    'Favorites Organizer Widget',
                    'Chat Widget',
                    'Snake Game Widget',
                    'System Monitoring Dashboard',
                    'URL / Keyword / Port / Ping Monitoring',
                    'Monitorv2 Add-on (PostgreSQL)',
                    'Performance Analytics Add-on',
                    'Response Time Tracking',
                    'Historical Charts & Graphs',
                    'Maintenance Windows',
                    'Email Notifications',
                    'Advanced Notification Rules',
                    'Multiple SMTP Servers',
                    'Email Templates',
                    'Notification Pause/Resume'
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 border border-brand-200 dark:border-brand-800">
                <h3 className="text-lg font-semibold text-brand-900 dark:text-brand-100 mb-2">Credits</h3>
                <p className="text-sm text-brand-800 dark:text-brand-200">
                  Designed and developed by AIT Architecture team
                </p>
                <p className="text-xs text-brand-700 dark:text-brand-300 mt-2">
                  © 2026 AdventHealth
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>

        {/* Resize handle */}
        {!isMaximized && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize z-10"
            title="Resize"
            aria-hidden
          >
            <svg
              viewBox="0 0 20 20"
              className="w-4 h-4 absolute right-1 bottom-1 text-slate-400 dark:text-slate-500"
              fill="currentColor"
            >
              <path d="M14 18l4-4v4h-4zM10 18l8-8v2l-6 6h-2zM6 18l12-12v2L8 18H6z" />
            </svg>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

