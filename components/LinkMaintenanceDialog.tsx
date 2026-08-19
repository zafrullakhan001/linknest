import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { linkifyHtml } from '../utils/richTextDisplay';

interface LinkMaintenanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkLabel: string;
  linkIcon?: string;
  maintenanceMessage?: string;
  maintenanceVideoUrl?: string;
}

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

export const LinkMaintenanceDialog: React.FC<LinkMaintenanceDialogProps> = ({
  isOpen,
  onClose,
  linkLabel,
  linkIcon,
  maintenanceMessage,
  maintenanceVideoUrl,
}) => {
  const plainLabel = useMemo(() => stripHtmlTags(linkLabel || ''), [linkLabel]);
  const displayHtml = useMemo(() => linkifyHtml(maintenanceMessage || ''), [maintenanceMessage]);
  const hasMessage = !!stripHtmlTags(maintenanceMessage || '').trim();
  const hasVideo = !!maintenanceVideoUrl?.trim();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-maintenance-dialog-title"
          className="pointer-events-auto w-full max-w-2xl max-h-[min(640px,calc(100vh-2rem))] flex flex-col overflow-hidden rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="shrink-0 px-5 py-3.5 border-b border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60 text-xl" aria-hidden>
                  {linkIcon || '🔧'}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Under maintenance
                  </p>
                  <h2
                    id="link-maintenance-dialog-title"
                    className="text-base font-semibold text-slate-900 dark:text-white truncate"
                    title={plainLabel}
                  >
                    {plainLabel || 'This link'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
                title="Close"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 px-5 py-4 space-y-4">
            {hasVideo && (
              <video
                src={maintenanceVideoUrl}
                controls
                playsInline
                className="w-full max-h-72 rounded-lg bg-black"
              />
            )}
            {hasMessage ? (
              <div
                className="link-info-viewer ln-tinymce-content text-slate-700 dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This link is under a maintenance window and is temporarily unavailable.
              </p>
            )}
          </div>

          <div className="shrink-0 px-5 py-3 border-t border-amber-200 dark:border-amber-800/60 bg-white dark:bg-slate-800 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
