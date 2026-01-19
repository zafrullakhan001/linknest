import React from 'react';
import { createPortal } from 'react-dom';

interface LinkInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkLabel: string;
  linkIcon?: string;
  richTextContent: string;
  linkUrl?: string;
}

export const LinkInfoDialog: React.FC<LinkInfoDialogProps> = ({ 
  isOpen, 
  onClose, 
  linkLabel, 
  linkIcon,
  richTextContent,
  linkUrl 
}) => {
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
            {linkIcon && (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-2xl">
                {linkIcon}
              </div>
            )}
            {!linkIcon && (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold">
                ℹ️
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{linkLabel}</h2>
              {linkUrl && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{linkUrl}</p>
              )}
            </div>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div 
            className="rich-text-viewer bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            dangerouslySetInnerHTML={{ __html: richTextContent }}
            style={{
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          />
          <style>{`
            .rich-text-viewer h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
            .rich-text-viewer h2 { font-size: 1.5em; font-weight: bold; margin: 0.75em 0; }
            .rich-text-viewer h3 { font-size: 1.17em; font-weight: bold; margin: 0.83em 0; }
            .rich-text-viewer h4 { font-size: 1em; font-weight: bold; margin: 1.12em 0; }
            .rich-text-viewer h5 { font-size: 0.83em; font-weight: bold; margin: 1.5em 0; }
            .rich-text-viewer h6 { font-size: 0.75em; font-weight: bold; margin: 1.67em 0; }
            .rich-text-viewer img { max-width: 100%; height: auto; display: block; margin: 0.5em 0; }
            .rich-text-viewer ul, .rich-text-viewer ol { margin: 1em 0; padding-left: 2em; }
            .rich-text-viewer ul { list-style-type: disc; }
            .rich-text-viewer ol { list-style-type: decimal; }
            .rich-text-viewer li { margin: 0.25em 0; }
            .rich-text-viewer table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 1em 0; 
              border: 1px solid #cbd5e1;
            }
            .rich-text-viewer table th, 
            .rich-text-viewer table td { 
              border: 1px solid #cbd5e1; 
              padding: 0.5em 1em; 
              text-align: left;
            }
            .rich-text-viewer table th { 
              background-color: #f1f5f9; 
              font-weight: 600;
            }
            .rich-text-viewer blockquote { 
              border-left: 4px solid #4f46e5; 
              padding-left: 1em; 
              margin: 1em 0; 
              font-style: italic; 
              color: #64748b;
            }
            .rich-text-viewer code { 
              background-color: #f1f5f9; 
              padding: 0.125em 0.25em; 
              border-radius: 0.25rem; 
              font-family: monospace; 
              font-size: 0.875em;
            }
            .rich-text-viewer div[style*="background-color"] {
              border-radius: 0.5rem;
              padding: 1em;
              margin: 1em 0;
            }
            .rich-text-viewer .grid {
              display: grid;
              gap: 1rem;
              margin: 1em 0;
            }
            .rich-text-viewer .grid > div {
              min-height: 2em;
            }
            @media (max-width: 768px) {
              .rich-text-viewer .grid {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
          {linkUrl && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(linkUrl, '_blank', 'noopener,noreferrer');
              }}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
              Open Link
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
