import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface HelpAboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'help' | 'about';

export const HelpAboutDialog: React.FC<HelpAboutDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('help');

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold">
              ?
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Help & About</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('help')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'help'
                ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            Help
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'about'
                ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            About
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                    <strong>LinkNest</strong> is a smart landing page manager that helps you organize and share your important links in a beautiful, visual way.
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">For Guests (Not Signed In):</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>View all public tiles and links</li>
                      <li>Search and filter links</li>
                      <li>Navigate between tiles</li>
                      <li>Cannot create, edit, or delete content</li>
                    </ul>
                  </div>
                  <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-brand-900 dark:text-brand-100">For Authenticated Users:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                      <li>All guest features</li>
                      <li>Create new tiles/spaces</li>
                      <li>Edit existing tiles</li>
                      <li>Delete tiles</li>
                      <li>Manage links and sections</li>
                      <li>Organize tiles into categories</li>
                      <li>Favorite tiles for quick access</li>
                    </ul>
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
                    <li><strong>Customize:</strong> Choose an emoji, color theme, title, and description for your space</li>
                    <li><strong>Add Links:</strong> Click on your tile to open it, then add links to sections</li>
                    <li><strong>Organize:</strong> Create tabs and sections to organize your links logically</li>
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
                      Create visual tiles for different topics. Each tile can contain multiple tabs and sections to organize your links.
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Link Management</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Add, edit, and organize links with custom icons, notes, and tooltips. Set visibility levels for each link.
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
                    <li>Favorite frequently used tiles for quick access</li>
                    <li>Organize related tiles into categories</li>
                    <li>Use tabs within tiles to group related links</li>
                    <li>Set expiration dates for time-sensitive links</li>
                    <li>Export and import spaces to share with others</li>
                    <li>Use the recycle bin to recover accidentally deleted tiles</li>
                    <li>Archive old tiles to keep your workspace clean</li>
                  </ul>
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
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">LinkNest</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  A smart, aesthetic landing page manager
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-500">
                  Version 1.0.0
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Description</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  LinkNest helps you create beautiful, organized landing pages for your important links. 
                  Organize links into visual tiles, customize their appearance, and share them with your team or make them public. 
                  With features like link health monitoring and flexible visibility controls, 
                  LinkNest makes managing and sharing links simple and elegant.
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
                    'Link Organization',
                    'Link Health Monitoring',
                    'User Authentication',
                    'Visibility Controls',
                    'Categories & Groups',
                    'Favorites & Archive',
                    'Export/Import',
                    'Dark Mode',
                    'Responsive Design',
                    'Guest Access Mode'
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
                  © 2025 AdventHealth
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

