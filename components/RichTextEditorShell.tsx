import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RichTextEditor } from './RichTextEditor';

export interface RichTextEditorShellProps {
    open: boolean;
    title: string;
    value: string;
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
    saveLabel?: string;
    saveDisabled?: boolean;
    placeholder?: string;
    /** Left in the page flow while the shell is open (section list placeholder). */
    inlinePlaceholder?: React.ReactNode;
    /** When set, shows Add Image and posts to the rich-text upload API. */
    sectionId?: string;
}

/**
 * Full-viewport TinyMCE host — menus stay anchored (ui_mode split + scroll lock).
 */
export const RichTextEditorShell: React.FC<RichTextEditorShellProps> = ({
    open,
    title,
    value,
    onChange,
    onSave,
    onCancel,
    saveLabel = 'Save',
    saveDisabled = false,
    placeholder = 'Enter rich text content...',
    inlinePlaceholder,
    sectionId
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

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
        if (sectionId) formData.append('section_id', sectionId);

        try {
            const API_BASE = import.meta.env.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/uploads/rich-text-image`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Upload failed' }));
                throw new Error(error.error || 'Upload failed');
            }

            const data = await response.json();
            const imageUrl = data.url;
            const imageHtml = `<img src="${imageUrl}" alt="Uploaded image" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
            onChange((value || '') + imageHtml);
        } catch (error: any) {
            alert('Failed to upload image: ' + (error?.message || 'Unknown error'));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const editorShell = (
        <div
            className="linknest-tinymce-shell fixed inset-0 z-[12000] flex flex-col bg-white dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900">
                <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
                <div className="flex items-center gap-2">
                    {sectionId !== undefined && (
                        <>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
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
                        </>
                    )}
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saveDisabled}
                        className="px-4 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md shadow-brand-500/20"
                    >
                        {saveLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                        title="Close"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
                <RichTextEditor
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    fillHeight
                    hideFullscreen
                    className="flex-1 min-h-0 h-full rounded-none border-0"
                />
            </div>
        </div>
    );

    return (
        <>
            {inlinePlaceholder ?? null}
            {createPortal(editorShell, document.body)}
        </>
    );
};
