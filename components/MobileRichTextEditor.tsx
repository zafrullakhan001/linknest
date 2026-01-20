import React, { useRef, useEffect, useState } from 'react';
import { RichTextEditor } from './RichTextEditor';

interface MobileRichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Mobile-optimized wrapper for RichTextEditor
 * Features:
 * - Collapsible toolbar with organized sections
 * - Touch-friendly buttons
 * - Full-screen mode with full editor
 * - Better mobile keyboard handling
 * - Organized formatting options in tabs/categories
 */
export const MobileRichTextEditor: React.FC<MobileRichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Enter text...',
    className = ''
}) => {
    const [showToolbar, setShowToolbar] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [toolbarCategory, setToolbarCategory] = useState<'basic' | 'format' | 'insert'>('basic');
    const editorRef = useRef<HTMLDivElement>(null);

    // Close toolbar when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
                setShowToolbar(false);
            }
        };

        if (showToolbar) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showToolbar]);

    // Prevent body scroll when in fullscreen
    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isFullscreen]);

    const execCommand = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        // Trigger onChange by getting the current content
        setTimeout(() => {
            if (editorRef.current) {
                const editor = editorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
                if (editor) {
                    onChange(editor.innerHTML);
                }
            }
        }, 0);
    };

    return (
        <div className={`mobile-rich-text-editor ${className}`} ref={editorRef}>
            {/* Mobile Toolbar Toggle Button */}
            <div className="flex items-center justify-between mb-2 gap-2">
                <button
                    type="button"
                    onClick={() => setShowToolbar(!showToolbar)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 touch-manipulation flex-1"
                    style={{ minHeight: '44px' }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                    {showToolbar ? 'Hide Formatting' : 'Show Formatting'}
                </button>
                <button
                    type="button"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700 rounded-lg touch-manipulation"
                    style={{ minHeight: '44px', minWidth: '44px' }}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Editor'}
                >
                    {isFullscreen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Fullscreen Overlay */}
            {isFullscreen && (
                <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Text</h3>
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(false)}
                            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700 rounded-lg touch-manipulation"
                            style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                        <RichTextEditor
                            value={value}
                            onChange={onChange}
                            placeholder={placeholder}
                            className="h-full"
                        />
                    </div>
                </div>
            )}

            {/* Regular Editor (when not fullscreen) */}
            {!isFullscreen && (
                <div className="relative">
                    {/* Enhanced Collapsible Toolbar */}
                    {showToolbar && (
                        <div className="mb-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Toolbar Category Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                <button
                                    type="button"
                                    onClick={() => setToolbarCategory('basic')}
                                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors touch-manipulation ${
                                        toolbarCategory === 'basic'
                                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                    style={{ minHeight: '44px' }}
                                >
                                    Basic
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setToolbarCategory('format')}
                                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors touch-manipulation ${
                                        toolbarCategory === 'format'
                                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                    style={{ minHeight: '44px' }}
                                >
                                    Format
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setToolbarCategory('insert')}
                                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors touch-manipulation ${
                                        toolbarCategory === 'insert'
                                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                    style={{ minHeight: '44px' }}
                                >
                                    Insert
                                </button>
                            </div>

                            {/* Toolbar Content */}
                            <div className="p-3">
                                {/* Basic Formatting */}
                                {toolbarCategory === 'basic' && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-4 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => execCommand('bold')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Bold"
                                            >
                                                <strong>B</strong>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => execCommand('italic')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm italic text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Italic"
                                            >
                                                <em>I</em>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => execCommand('underline')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm underline text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Underline"
                                            >
                                                <u>U</u>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const url = prompt('Enter URL:');
                                                    if (url) execCommand('createLink', url);
                                                }}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Insert Link"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mx-auto">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => execCommand('justifyLeft')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Align Left"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mx-auto">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => execCommand('justifyCenter')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Align Center"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mx-auto">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => execCommand('justifyRight')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Align Right"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mx-auto">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Format Options */}
                                {toolbarCategory === 'format' && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        execCommand('formatBlock', e.target.value);
                                                        e.target.value = '';
                                                    }
                                                }}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                                style={{ minHeight: '44px' }}
                                            >
                                                <option value="">Heading...</option>
                                                <option value="h1">Heading 1</option>
                                                <option value="h2">Heading 2</option>
                                                <option value="h3">Heading 3</option>
                                                <option value="h4">Heading 4</option>
                                                <option value="p">Paragraph</option>
                                            </select>
                                            <select
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        execCommand('fontSize', e.target.value);
                                                        e.target.value = '';
                                                    }
                                                }}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                                style={{ minHeight: '44px' }}
                                            >
                                                <option value="">Size...</option>
                                                <option value="1">Small</option>
                                                <option value="3">Normal</option>
                                                <option value="5">Large</option>
                                                <option value="7">Extra Large</option>
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => execCommand('insertUnorderedList')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation flex items-center justify-center gap-2"
                                                style={{ minHeight: '44px' }}
                                                title="Bullet List"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                                </svg>
                                                <span className="text-sm">List</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => execCommand('insertOrderedList')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation flex items-center justify-center gap-2"
                                                style={{ minHeight: '44px' }}
                                                title="Numbered List"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                                </svg>
                                                <span className="text-sm"># List</span>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => execCommand('removeFormat')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Clear Formatting"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => execCommand('undo')}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Undo"
                                            >
                                                ↶ Undo
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Insert Options */}
                                {toolbarCategory === 'insert' && (
                                    <div className="space-y-3">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">
                                            Use Fullscreen mode for advanced options like tables, images, and code blocks
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const date = new Date().toLocaleDateString();
                                                    execCommand('insertText', false, date);
                                                }}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Insert Date"
                                            >
                                                📅 Date
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const time = new Date().toLocaleTimeString();
                                                    execCommand('insertText', false, time);
                                                }}
                                                className="p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                                style={{ minHeight: '44px' }}
                                                title="Insert Time"
                                            >
                                                🕐 Time
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Editor */}
                    <RichTextEditor
                        value={value}
                        onChange={onChange}
                        placeholder={placeholder}
                        className="mobile-editor"
                    />
                </div>
            )}
        </div>
    );
};
