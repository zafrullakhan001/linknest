import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { linkifyHtml } from '../utils/richTextDisplay';
import { toSpeakableText, useReadAloud } from '../hooks/useReadAloud';
import { ReadAloudButtons, ReadAloudSettingsRow } from './ReadAloudControls';
import { TinyMceRichTextViewer } from './TinyMceRichTextViewer';
import { normalizeLinkContentTopics, visibleLinkInfoTopics, type LinkInfoTopic } from '../utils/linkInfoTopics';

interface LinkMaintenanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkLabel: string;
  linkIcon?: string;
  maintenanceMessage?: string;
  maintenanceTopics?: LinkInfoTopic[];
  maintenanceVideoUrl?: string;
}

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

const DEFAULT_MAINTENANCE_TEXT = 'This link is under a maintenance window and is temporarily unavailable.';

export const LinkMaintenanceDialog: React.FC<LinkMaintenanceDialogProps> = ({
  isOpen,
  onClose,
  linkLabel,
  linkIcon,
  maintenanceMessage,
  maintenanceTopics,
  maintenanceVideoUrl,
}) => {
  const topics = useMemo(
    () => visibleLinkInfoTopics(normalizeLinkContentTopics('maintenance', maintenanceTopics, maintenanceMessage)),
    [maintenanceTopics, maintenanceMessage]
  );
  const [selectedTopicId, setSelectedTopicId] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setSelectedTopicId(topics[0]?.id || '');
  }, [isOpen, topics]);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || topics[0] || null;
  const activeHtml = selectedTopic?.html || (topics.length === 0 ? maintenanceMessage || '' : '');

  const plainLabel = useMemo(() => stripHtmlTags(linkLabel || ''), [linkLabel]);
  const displayHtml = useMemo(() => linkifyHtml(activeHtml || ''), [activeHtml]);
  const hasMessage = !!stripHtmlTags(activeHtml || '').trim();
  const hasVideo = !!maintenanceVideoUrl?.trim();
  const speakableText = useMemo(() => {
    return toSpeakableText(activeHtml || '') || DEFAULT_MAINTENANCE_TEXT;
  }, [activeHtml]);
  const readAloud = useReadAloud({
    text: speakableText,
    active: isOpen,
    autoStart: isOpen && !hasVideo,
  });

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
              <div className="flex items-center gap-0.5 shrink-0">
                <ReadAloudButtons readAloud={readAloud} theme="amber" />
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Close"
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <ReadAloudSettingsRow readAloud={readAloud} idPrefix="link-maintenance" className="mt-2.5" />
          </div>

          <div className={`flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-900/50 ${hasVideo ? 'overflow-y-auto' : 'overflow-hidden'}`}>
            {hasVideo && (
              <video
                src={maintenanceVideoUrl}
                controls
                playsInline
                className="w-full max-h-72 rounded-lg bg-black shrink-0 mx-auto mt-4 px-5"
              />
            )}
            {topics.length > 1 ? (
              <div className="sm:hidden px-4 pt-3 shrink-0">
                <label className="sr-only" htmlFor="link-maintenance-topic-select">Topic</label>
                <select
                  id="link-maintenance-topic-select"
                  value={selectedTopic?.id || ''}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.title || 'Untitled'}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className={`flex-1 min-h-0 flex ${hasVideo ? 'mt-3' : ''} ${topics.length > 1 ? 'flex-col sm:flex-row' : ''}`}>
              {topics.length > 1 ? (
                <div className="hidden sm:flex sm:flex-col sm:w-44 shrink-0 border-r border-amber-200 dark:border-amber-800/60 p-2 gap-1 overflow-y-auto">
                  {topics.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTopicId(t.id)}
                      className={`text-left text-xs px-2.5 py-2 rounded-lg font-medium truncate transition-colors ${
                        t.id === selectedTopic?.id
                          ? 'bg-amber-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-slate-700'
                      }`}
                      title={t.title}
                    >
                      {t.title || 'Untitled'}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={`flex-1 min-w-0 min-h-0 ${hasVideo ? 'min-h-[220px] h-[280px] shrink-0' : 'h-full'}`}>
                {hasMessage ? (
                  <TinyMceRichTextViewer html={displayHtml} onEscape={onClose} />
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300 px-5 py-4">
                    {DEFAULT_MAINTENANCE_TEXT}
                  </p>
                )}
              </div>
            </div>
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
