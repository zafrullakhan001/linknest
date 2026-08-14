import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { RichTextContent } from '../types';
import { SelectableRichTextEditor } from './SelectableRichTextEditor';
import { RichTextBoxedView, type BoxAlign } from './RichTextBoxedView';
import {
  RichTextBoxOptionsFields,
  buildBoxMetaFromFields,
  DEFAULT_HEADER_BG,
  DEFAULT_FOOTER_BG,
  DEFAULT_BODY_BG,
  type RichTextBoxMeta,
  type BoxFontWeight,
  type BoxFontSize,
  type BoxImportance,
} from './RichTextBoxOptionsFields';

export type { RichTextBoxMeta };

export interface RichTextContentItemHandle {
  getDraft: () => { id: string; content: string; meta: RichTextBoxMeta };
}

interface RichTextContentItemProps {
  content: RichTextContent;
  sectionId: string;
  tabId: string;
  onUpdate: (id: string, content: string, meta?: RichTextBoxMeta) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onClone?: () => void;
  onSchedule?: () => void;
  onVisibilityChange?: (visibility: 'public' | 'authenticated' | 'private') => void;
  visibility?: 'public' | 'authenticated' | 'private';
  visibleFrom?: string;
  expiresAt?: string;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function normalizeAlign(v?: string | null): BoxAlign {
  return v === 'center' || v === 'right' ? v : 'left';
}

function normalizeWeight(v?: string | null, fallback: BoxFontWeight = 'normal'): BoxFontWeight {
  return v === 'bold' || v === 'normal' ? v : fallback;
}

function normalizeSize(v?: string | null, fallback: BoxFontSize = 'md'): BoxFontSize {
  return v === 'sm' || v === 'md' || v === 'lg' ? v : fallback;
}

function normalizeImportance(v?: string | null): BoxImportance {
  const allowed: BoxImportance[] = ['notes', 'info', 'tip', 'important', 'warning', 'critical'];
  return allowed.includes(v as BoxImportance) ? (v as BoxImportance) : 'notes';
}

export const RichTextContentItem = forwardRef<RichTextContentItemHandle, RichTextContentItemProps>(function RichTextContentItem(
  {
    content,
    sectionId,
    onUpdate,
    onDelete,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
    isEditing,
    onEdit,
    onCancel,
    onSave,
    onClone,
    onSchedule,
    onVisibilityChange,
    visibility = 'public',
    visibleFrom,
    expiresAt,
    isSelected = false,
    onToggleSelect,
  },
  ref
) {
  const [localContent, setLocalContent] = useState(content.content);
  const [localBoxed, setLocalBoxed] = useState(!!content.boxed);
  const [localBoxTitle, setLocalBoxTitle] = useState(content.boxTitle || '');
  const [localBoxFooter, setLocalBoxFooter] = useState(content.boxFooter || '');
  const [localHeaderAlign, setLocalHeaderAlign] = useState<BoxAlign>(normalizeAlign(content.boxHeaderAlign));
  const [localFooterAlign, setLocalFooterAlign] = useState<BoxAlign>(normalizeAlign(content.boxFooterAlign));
  const [localHeaderBg, setLocalHeaderBg] = useState(content.boxHeaderBg || DEFAULT_HEADER_BG);
  const [localFooterBg, setLocalFooterBg] = useState(content.boxFooterBg || DEFAULT_FOOTER_BG);
  const [localBodyBg, setLocalBodyBg] = useState(content.boxBodyBg || DEFAULT_BODY_BG);
  const [localHeaderWeight, setLocalHeaderWeight] = useState<BoxFontWeight>(normalizeWeight(content.boxHeaderFontWeight, 'bold'));
  const [localFooterWeight, setLocalFooterWeight] = useState<BoxFontWeight>(normalizeWeight(content.boxFooterFontWeight, 'normal'));
  const [localHeaderSize, setLocalHeaderSize] = useState<BoxFontSize>(normalizeSize(content.boxHeaderFontSize, 'md'));
  const [localFooterSize, setLocalFooterSize] = useState<BoxFontSize>(normalizeSize(content.boxFooterFontSize, 'sm'));
  const [localHeaderEmoji, setLocalHeaderEmoji] = useState(content.boxHeaderEmoji || '');
  const [localImportance, setLocalImportance] = useState<BoxImportance>(normalizeImportance(content.boxImportance));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const syncFromContent = () => {
    setLocalContent(content.content);
    setLocalBoxed(!!content.boxed);
    setLocalBoxTitle(content.boxTitle || '');
    setLocalBoxFooter(content.boxFooter || '');
    setLocalHeaderAlign(normalizeAlign(content.boxHeaderAlign));
    setLocalFooterAlign(normalizeAlign(content.boxFooterAlign));
    setLocalHeaderBg(content.boxHeaderBg || DEFAULT_HEADER_BG);
    setLocalFooterBg(content.boxFooterBg || DEFAULT_FOOTER_BG);
    setLocalBodyBg(content.boxBodyBg || DEFAULT_BODY_BG);
    setLocalHeaderWeight(normalizeWeight(content.boxHeaderFontWeight, 'bold'));
    setLocalFooterWeight(normalizeWeight(content.boxFooterFontWeight, 'normal'));
    setLocalHeaderSize(normalizeSize(content.boxHeaderFontSize, 'md'));
    setLocalFooterSize(normalizeSize(content.boxFooterFontSize, 'sm'));
    setLocalHeaderEmoji(content.boxHeaderEmoji || '');
    setLocalImportance(normalizeImportance(content.boxImportance));
  };

  useEffect(() => {
    if (isEditing) {
      syncFromContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, content.id]);

  const currentMeta = () =>
    buildBoxMetaFromFields({
      boxed: localBoxed,
      boxTitle: localBoxTitle,
      boxFooter: localBoxFooter,
      boxHeaderAlign: localHeaderAlign,
      boxFooterAlign: localFooterAlign,
      boxHeaderBg: localHeaderBg,
      boxFooterBg: localFooterBg,
      boxBodyBg: localBodyBg,
      boxHeaderFontWeight: localHeaderWeight,
      boxFooterFontWeight: localFooterWeight,
      boxHeaderFontSize: localHeaderSize,
      boxFooterFontSize: localFooterSize,
      boxHeaderEmoji: localHeaderEmoji,
      boxImportance: localImportance,
    });

  useImperativeHandle(ref, () => ({
    getDraft: () => ({
      id: content.id,
      content: localContent,
      meta: currentMeta(),
    }),
  }));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('section_id', sectionId);

    try {
      const API_BASE = import.meta.env.VITE_API_BASE || '/api';
      const response = await fetch(`${API_BASE}/uploads/rich-text-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      const imageHtml = `<img src="${data.url}" alt="Uploaded image" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
      setLocalContent((prev) => prev + imageHtml);
    } catch (error: any) {
      alert('Failed to upload image: ' + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = () => {
    onUpdate(content.id, localContent, currentMeta());
    onSave();
  };

  const handleCancel = () => {
    syncFromContent();
    onCancel();
  };

  if (isEditing) {
    return (
      <div className="bg-white dark:bg-slate-800 border-2 border-brand-500 dark:border-brand-500/50 rounded-xl p-4 shadow-lg space-y-3 overflow-visible relative z-20">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Edit Rich Text Content</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : '📷 Add Image'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <button
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
              title="Cancel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <SelectableRichTextEditor value={localContent} onChange={setLocalContent} placeholder="Enter rich text content..." />
        <RichTextBoxOptionsFields
          boxed={localBoxed}
          onBoxedChange={setLocalBoxed}
          boxTitle={localBoxTitle}
          onBoxTitleChange={setLocalBoxTitle}
          boxFooter={localBoxFooter}
          onBoxFooterChange={setLocalBoxFooter}
          boxHeaderAlign={localHeaderAlign}
          onBoxHeaderAlignChange={setLocalHeaderAlign}
          boxFooterAlign={localFooterAlign}
          onBoxFooterAlignChange={setLocalFooterAlign}
          boxHeaderBg={localHeaderBg}
          onBoxHeaderBgChange={setLocalHeaderBg}
          boxFooterBg={localFooterBg}
          onBoxFooterBgChange={setLocalFooterBg}
          boxBodyBg={localBodyBg}
          onBoxBodyBgChange={setLocalBodyBg}
          boxHeaderFontWeight={localHeaderWeight}
          onBoxHeaderFontWeightChange={setLocalHeaderWeight}
          boxFooterFontWeight={localFooterWeight}
          onBoxFooterFontWeightChange={setLocalFooterWeight}
          boxHeaderFontSize={localHeaderSize}
          onBoxHeaderFontSizeChange={setLocalHeaderSize}
          boxFooterFontSize={localFooterSize}
          onBoxFooterFontSizeChange={setLocalFooterSize}
          boxHeaderEmoji={localHeaderEmoji}
          onBoxHeaderEmojiChange={setLocalHeaderEmoji}
          boxImportance={localImportance}
          onBoxImportanceChange={setLocalImportance}
          accent="brand"
        />
        <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-lg p-4 shadow-sm hover:shadow-md transition-all group rich-text-content-item ${
      isSelected
        ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-400/40 dark:ring-brand-500/40'
        : 'border-slate-200 dark:border-slate-700'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>

        {onToggleSelect && (
          <div className="flex items-center pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
              title="Select rich text for move / copy"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <RichTextBoxedView
            content={content.content || '<p class="text-slate-400 italic">Empty content</p>'}
            boxed={!!content.boxed}
            boxTitle={content.boxTitle}
            boxFooter={content.boxFooter}
            boxHeaderAlign={content.boxHeaderAlign}
            boxFooterAlign={content.boxFooterAlign}
            boxHeaderBg={content.boxHeaderBg}
            boxFooterBg={content.boxFooterBg}
            boxBodyBg={content.boxBodyBg}
            boxHeaderFontWeight={content.boxHeaderFontWeight}
            boxFooterFontWeight={content.boxFooterFontWeight}
            boxHeaderFontSize={content.boxHeaderFontSize}
            boxFooterFontSize={content.boxFooterFontSize}
            boxHeaderEmoji={content.boxHeaderEmoji}
            boxImportance={content.boxImportance}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
            title="Edit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          {onClone && (
            <button
              onClick={onClone}
              className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
              title="Clone Rich Text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            </button>
          )}
          {onSchedule && (
            <button
              onClick={onSchedule}
              className="p-1.5 text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
              title="Schedule Rich Text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {onVisibilityChange && (
            <select
              value={visibility}
              onChange={(e) => onVisibilityChange(e.target.value as 'public' | 'authenticated' | 'private')}
              className="p-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Visibility"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="public">Public</option>
              <option value="authenticated">Auth</option>
              <option value="private">Private</option>
            </select>
          )}
          {(visibleFrom || expiresAt) && (
            <span
              className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
              title={`Visible from: ${visibleFrom || 'now'}, Expires: ${expiresAt || 'never'}`}
            >
              📅
            </span>
          )}
          <button
            onClick={() => onDelete(content.id)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
