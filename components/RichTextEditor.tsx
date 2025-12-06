import React, { useRef, useEffect } from 'react';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Enter text...',
    className = ''
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedRangeRef = useRef<Range | null>(null);

    useEffect(() => {
        if (editorRef.current && value !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editorRef.current) {
            const range = selection.getRangeAt(0);
            if (editorRef.current.contains(range.commonAncestorContainer)) {
                savedRangeRef.current = range.cloneRange();
            }
        }
    };

    const restoreSelection = () => {
        if (savedRangeRef.current && editorRef.current) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(savedRangeRef.current);
                editorRef.current.focus();
            }
        } else if (editorRef.current) {
            // No saved selection, create range at end
            const range = document.createRange();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
            editorRef.current.focus();
        }
    };

    const getCurrentRange = (): Range | null => {
        if (!editorRef.current) return null;

        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editorRef.current.contains(range.commonAncestorContainer)) {
                return range;
            }
        }
        return null;
    };

    const wrapSelection = (tagName: string, attributes: Record<string, string> = {}) => {
        if (!editorRef.current) return;

        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) {
            // No selection, create range at end
            const newRange = document.createRange();
            newRange.selectNodeContents(editorRef.current);
            newRange.collapse(false);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            return;
        }

        if (range.collapsed) {
            // No selection, just insert the element
            const element = document.createElement(tagName);
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'style' && typeof value === 'string') {
                    element.setAttribute('style', value);
                } else {
                    element.setAttribute(key, value);
                }
            });
            range.insertNode(element);
            // Move cursor inside
            range.setStart(element, 0);
            range.setEnd(element, 0);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } else {
            // Has selection, wrap it
            try {
                const element = document.createElement(tagName);
                Object.entries(attributes).forEach(([key, value]) => {
                    if (key === 'style' && typeof value === 'string') {
                        element.setAttribute('style', value);
                    } else {
                        element.setAttribute(key, value);
                    }
                });
                range.surroundContents(element);
            } catch (e) {
                // surroundContents failed, try alternative
                const contents = range.extractContents();
                const element = document.createElement(tagName);
                Object.entries(attributes).forEach(([key, value]) => {
                    if (key === 'style' && typeof value === 'string') {
                        element.setAttribute('style', value);
                    } else {
                        element.setAttribute(key, value);
                    }
                });
                element.appendChild(contents);
                range.insertNode(element);
            }
        }

        handleInput();
    };

    const applyFormat = (command: string, value?: string) => {
        if (!editorRef.current) return;

        editorRef.current.focus();
        restoreSelection();

        try {
            document.execCommand(command, false, value);
            handleInput();
        } catch (e) {
            console.error(`Format command failed: ${command}`, e);
        }
    };

    const applyFontSize = (size: string) => {
        const sizeMap: Record<string, string> = {
            '1': '0.75rem',
            '2': '0.875rem',
            '3': '1rem',
            '4': '1.125rem',
            '5': '1.25rem',
            '6': '1.5rem',
            '7': '2rem'
        };
        const fontSize = sizeMap[size] || sizeMap['3'];
        wrapSelection('span', { style: `font-size: ${fontSize};` });
    };

    const applyFontFamily = (font: string) => {
        wrapSelection('span', { style: `font-family: ${font};` });
    };

    const applyHeading = (level: string) => {
        const tagName = `h${level}`;
        wrapSelection(tagName, {});
    };

    const insertLink = () => {
        if (!editorRef.current) return;

        editorRef.current.focus();
        restoreSelection();

        const selection = window.getSelection();
        const selectedText = selection && selection.rangeCount > 0 ? selection.toString() : '';

        const url = prompt('Enter URL:', selectedText || '');
        if (url && url.trim()) {
            const linkText = selectedText || url;
            const linkUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

            const range = getCurrentRange();
            if (range) {
                if (!range.collapsed && selectedText) {
                    // Replace selected text with link
                    range.deleteContents();
                    const link = document.createElement('a');
                    link.href = linkUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = linkText;
                    range.insertNode(link);
                    range.collapse(false);
                } else {
                    // Insert link at cursor
                    const link = document.createElement('a');
                    link.href = linkUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = linkText;
                    range.insertNode(link);
                    range.collapse(false);
                }
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                handleInput();
            }
        }
    };

    const insertHTML = (html: string) => {
        if (!editorRef.current) return;

        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (range) {
            if (!range.collapsed) {
                range.deleteContents();
            }
            const div = document.createElement('div');
            div.innerHTML = html;
            const fragment = document.createDocumentFragment();
            while (div.firstChild) {
                fragment.appendChild(div.firstChild);
            }
            range.insertNode(fragment);
            range.collapse(false);
            handleInput();
        } else {
            // No range, insert at end
            const newRange = document.createRange();
            newRange.selectNodeContents(editorRef.current);
            newRange.collapse(false);
            const div = document.createElement('div');
            div.innerHTML = html;
            const fragment = document.createDocumentFragment();
            while (div.firstChild) {
                fragment.appendChild(div.firstChild);
            }
            newRange.insertNode(fragment);
            newRange.collapse(false);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            handleInput();
        }
    };

    const insertDate = () => {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        insertHTML(`<span style="font-weight: 600;">${dateStr}</span>`);
    };

    const insertTime = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        insertHTML(`<span style="font-weight: 600;">${timeStr}</span>`);
    };

    return (
        <div className={`rich-text-editor ${className}`}>
            {/* Toolbar */}
            <div
                className="flex flex-wrap items-center gap-1 p-2 bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-t-lg border-b-0"
                onMouseDown={(e) => e.preventDefault()}
            >
                {/* Text Formatting */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('bold')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Bold"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('italic')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Italic"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('underline')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Underline"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M6 4v8a6 6 0 0012 0V4" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('strikeThrough')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Strikethrough"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12M9 6h6M9 18h6" />
                        </svg>
                    </button>
                </div>

                {/* Headings */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <select
                        onFocus={saveSelection}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            saveSelection();
                        }}
                        onChange={(e) => {
                            const level = e.target.value;
                            if (level) {
                                applyHeading(level);
                            }
                            e.target.value = '';
                        }}
                        className="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-slate-700 dark:text-slate-300"
                        defaultValue=""
                    >
                        <option value="">Heading</option>
                        <option value="1">Heading 1</option>
                        <option value="2">Heading 2</option>
                        <option value="3">Heading 3</option>
                        <option value="4">Heading 4</option>
                        <option value="5">Heading 5</option>
                        <option value="6">Heading 6</option>
                    </select>
                </div>

                {/* Subscript/Superscript */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('subscript')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-xs font-bold"
                        title="Subscript"
                    >
                        x<sub>2</sub>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('superscript')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-xs font-bold"
                        title="Superscript"
                    >
                        x<sup>2</sup>
                    </button>
                </div>

                {/* Hyperlink */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={insertLink}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Link"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </button>
                </div>

                {/* Font Size */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <select
                        onFocus={saveSelection}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            saveSelection();
                        }}
                        onChange={(e) => {
                            const size = e.target.value;
                            if (size) {
                                applyFontSize(size);
                            }
                            e.target.value = '';
                        }}
                        className="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-slate-700 dark:text-slate-300"
                        defaultValue=""
                    >
                        <option value="">Size</option>
                        <option value="1">Small</option>
                        <option value="2">Medium-Small</option>
                        <option value="3">Normal</option>
                        <option value="4">Medium-Large</option>
                        <option value="5">Large</option>
                        <option value="6">X-Large</option>
                        <option value="7">XX-Large</option>
                    </select>
                </div>

                {/* Font Family */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <select
                        onFocus={saveSelection}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            saveSelection();
                        }}
                        onChange={(e) => {
                            const font = e.target.value;
                            if (font) {
                                applyFontFamily(font);
                            }
                            e.target.value = '';
                        }}
                        className="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-slate-700 dark:text-slate-300"
                        defaultValue=""
                    >
                        <option value="">Font</option>
                        <option value="Arial">Arial</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Palatino">Palatino</option>
                        <option value="Garamond">Garamond</option>
                        <option value="Comic Sans MS">Comic Sans MS</option>
                        <option value="Trebuchet MS">Trebuchet MS</option>
                        <option value="Impact">Impact</option>
                    </select>
                </div>

                {/* Text Color */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <input
                        type="color"
                        onFocus={saveSelection}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            saveSelection();
                        }}
                        onChange={(e) => {
                            wrapSelection('span', { style: `color: ${e.target.value};` });
                        }}
                        className="w-7 h-7 border border-slate-300 dark:border-slate-600 rounded cursor-pointer"
                        title="Text Color"
                    />
                </div>

                {/* Background Color */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <input
                        type="color"
                        onFocus={saveSelection}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            saveSelection();
                        }}
                        onChange={(e) => {
                            wrapSelection('span', { style: `background-color: ${e.target.value};` });
                        }}
                        className="w-7 h-7 border border-slate-300 dark:border-slate-600 rounded cursor-pointer"
                        title="Background Color"
                    />
                </div>

                {/* Alignment */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('justifyLeft')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Align Left"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('justifyCenter')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Align Center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M9 6h6M9 18h6" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFormat('justifyRight')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Align Right"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h12M3 18h12" />
                        </svg>
                    </button>
                </div>

                {/* Date/Time */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={insertDate}
                        className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Insert Date"
                    >
                        📅 Date
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={insertTime}
                        className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Insert Time"
                    >
                        🕐 Time
                    </button>
                </div>

                {/* Clear Formatting */}
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormat('removeFormat')}
                    className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Clear Formatting"
                >
                    Clear
                </button>
            </div>

            {/* Editor */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                onBlur={handleInput}
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
                className="min-h-[60px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-b-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                }}
                data-placeholder={placeholder}
                suppressContentEditableWarning
            />

            <style>{`
                .rich-text-editor [contenteditable][data-placeholder]:empty:before {
                    content: attr(data-placeholder);
                    color: #94a3b8;
                    pointer-events: none;
                }
                .rich-text-editor [contenteditable]:focus {
                    outline: none;
                }
                .rich-text-editor h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
                .rich-text-editor h2 { font-size: 1.5em; font-weight: bold; margin: 0.75em 0; }
                .rich-text-editor h3 { font-size: 1.17em; font-weight: bold; margin: 0.83em 0; }
                .rich-text-editor h4 { font-size: 1em; font-weight: bold; margin: 1.12em 0; }
                .rich-text-editor h5 { font-size: 0.83em; font-weight: bold; margin: 1.5em 0; }
                .rich-text-editor h6 { font-size: 0.75em; font-weight: bold; margin: 1.67em 0; }
            `}</style>
        </div>
    );
};
