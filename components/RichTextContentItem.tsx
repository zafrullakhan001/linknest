import React, { useState, useRef, useEffect } from 'react';
import { RichTextContent } from '../types';
import { RichTextEditor } from './RichTextEditor';
import { RichTextBoxedView } from './RichTextBoxedView';

export interface RichTextBoxMeta {
    boxed?: boolean;
    boxTitle?: string;
    boxFooter?: string;
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
}

export const RichTextContentItem: React.FC<RichTextContentItemProps> = ({
    content,
    sectionId,
    tabId,
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
    expiresAt
}) => {
    const [localContent, setLocalContent] = useState(content.content);
    const [localBoxed, setLocalBoxed] = useState(!!content.boxed);
    const [localBoxTitle, setLocalBoxTitle] = useState(content.boxTitle || '');
    const [localBoxFooter, setLocalBoxFooter] = useState(content.boxFooter || '');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (isEditing) {
            setLocalContent(content.content);
            setLocalBoxed(!!content.boxed);
            setLocalBoxTitle(content.boxTitle || '');
            setLocalBoxFooter(content.boxFooter || '');
        }
    }, [isEditing, content.id, content.content, content.boxed, content.boxTitle, content.boxFooter]);

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
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const data = await response.json();
            const imageUrl = data.url;

            const imageHtml = `<img src="${imageUrl}" alt="Uploaded image" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
            const newContent = localContent + imageHtml;
            setLocalContent(newContent);
        } catch (error: any) {
            alert('Failed to upload image: ' + error.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleContentChange = (value: string) => {
        setLocalContent(value);
    };

    const handleSave = () => {
        onUpdate(content.id, localContent, {
            boxed: localBoxed,
            boxTitle: localBoxed ? localBoxTitle.trim() : undefined,
            boxFooter: localBoxed ? localBoxFooter.trim() : undefined,
        });
        onSave();
    };

    const handleCancel = () => {
        setLocalContent(content.content);
        setLocalBoxed(!!content.boxed);
        setLocalBoxTitle(content.boxTitle || '');
        setLocalBoxFooter(content.boxFooter || '');
        onCancel();
    };

    const boxOptions = (
        <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={localBoxed}
                    onChange={(e) => setLocalBoxed(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Wrap in styled box
                </span>
            </label>
            {localBoxed && (
                <div className="grid gap-2 sm:grid-cols-2 pl-6">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Header title
                        </label>
                        <input
                            type="text"
                            value={localBoxTitle}
                            onChange={(e) => setLocalBoxTitle(e.target.value)}
                            placeholder="e.g. Architecture Guidelines"
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Footer <span className="font-normal normal-case">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={localBoxFooter}
                            onChange={(e) => setLocalBoxFooter(e.target.value)}
                            placeholder="Optional footer text"
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        />
                    </div>
                </div>
            )}
        </div>
    );

    if (isEditing) {
        return (
            <div className="bg-white dark:bg-slate-800 border-2 border-brand-500 dark:border-brand-500/50 rounded-xl p-4 shadow-lg space-y-3">
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
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
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
                <RichTextEditor
                    value={localContent}
                    onChange={handleContentChange}
                    placeholder="Enter rich text content..."
                />
                {boxOptions}
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
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-all group rich-text-content-item">
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

                <div className="flex-1 min-w-0">
                    <RichTextBoxedView
                        content={content.content || '<p class="text-slate-400 italic">Empty content</p>'}
                        boxed={!!content.boxed}
                        boxTitle={content.boxTitle}
                        boxFooter={content.boxFooter}
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
                        <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" title={`Visible from: ${visibleFrom || 'now'}, Expires: ${expiresAt || 'never'}`}>
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
};
