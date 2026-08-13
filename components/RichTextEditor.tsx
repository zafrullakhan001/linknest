import React, { useRef, useEffect, useState } from 'react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { EmojiPickerPopover } from './EmojiPickerPanel';

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
    const isInternalUpdateRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showCodeView, setShowCodeView] = useState(false);
    const [codeViewValue, setCodeViewValue] = useState(value || '');
    const [copied, setCopied] = useState(false);
    const [showTableDialog, setShowTableDialog] = useState(false);
    const [tableRows, setTableRows] = useState(3);
    const [tableCols, setTableCols] = useState(3);
    const [showSectionColorPicker, setShowSectionColorPicker] = useState(false);
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const [linkOpenNewTab, setLinkOpenNewTab] = useState(true);
    const [showPasteWordDialog, setShowPasteWordDialog] = useState(false);
    const [pasteWordContent, setPasteWordContent] = useState('');

    useEscapeToClose(showPasteWordDialog, () => {
        setShowPasteWordDialog(false);
        setPasteWordContent('');
    });
    useEscapeToClose(showLinkDialog, () => {
        setShowLinkDialog(false);
        setLinkUrl('');
        setLinkText('');
    });
    useEscapeToClose(showTableDialog, () => setShowTableDialog(false));

    // Function to format/beautify HTML
    const formatHTML = (html: string): string => {
        if (!html || !html.trim()) return '';
        
        try {
            // Use a temporary div to parse and format HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            const formatElement = (element: Element | Node, indent: number = 0): string => {
                const indentStr = '  '.repeat(indent);
                let result = '';
                
                if (element.nodeType === Node.TEXT_NODE) {
                    const text = element.textContent;
                    if (text) {
                        const trimmed = text.trim();
                        if (trimmed) {
                            // Preserve line breaks in text nodes
                            const lines = text.split('\n');
                            const nonEmptyLines = lines.filter(line => line.trim());
                            if (nonEmptyLines.length > 0) {
                                result += indentStr + trimmed + '\n';
                            }
                        }
                    }
                } else if (element.nodeType === Node.ELEMENT_NODE) {
                    const el = element as Element;
                    const tagName = el.tagName.toLowerCase();
                    
                    // Get attributes and format them nicely
                    const attrs: string[] = [];
                    for (let i = 0; i < el.attributes.length; i++) {
                        const attr = el.attributes[i];
                        attrs.push(`${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`);
                    }
                    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
                    
                    // Self-closing tags
                    const selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
                    
                    if (selfClosing.includes(tagName)) {
                        result += `${indentStr}<${tagName}${attrStr} />\n`;
                    } else {
                        const children = Array.from(el.childNodes);
                        const hasTextChildren = children.some(child => 
                            child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
                        );
                        const hasElementChildren = children.some(child => 
                            child.nodeType === Node.ELEMENT_NODE
                        );
                        
                        if (hasElementChildren || (hasTextChildren && children.length > 1)) {
                            // Has children - format with indentation
                            result += `${indentStr}<${tagName}${attrStr}>\n`;
                            children.forEach(child => {
                                result += formatElement(child, indent + 1);
                            });
                            result += `${indentStr}</${tagName}>\n`;
                        } else if (hasTextChildren && children.length === 1) {
                            // Single text child - inline format
                            const textContent = children[0].textContent?.trim() || '';
                            if (textContent.length < 80) {
                                // Short text - keep on one line
                                result += `${indentStr}<${tagName}${attrStr}>${textContent}</${tagName}>\n`;
                            } else {
                                // Long text - break into multiple lines
                                result += `${indentStr}<${tagName}${attrStr}>\n`;
                                result += '  '.repeat(indent + 1) + textContent + '\n';
                                result += `${indentStr}</${tagName}>\n`;
                            }
                        } else {
                            // No children - self-closing format
                            result += `${indentStr}<${tagName}${attrStr}></${tagName}>\n`;
                        }
                    }
                }
                
                return result;
            };
            
            let formatted = '';
            const childNodes = Array.from(tempDiv.childNodes);
            
            if (childNodes.length === 0) {
                return html;
            }
            
            childNodes.forEach(node => {
                formatted += formatElement(node, 0);
            });
            
            return formatted.trim() || html;
        } catch (e) {
            // If formatting fails, return original HTML
            console.warn('HTML formatting failed:', e);
            return html;
        }
    };

    useEffect(() => {
        // Only update if the change came from outside (not from user input)
        if (showCodeView) {
            // In code view, update the textarea value
            setCodeViewValue(value || '');
        } else if (editorRef.current && value !== editorRef.current.innerHTML && !isInternalUpdateRef.current) {
            // In visual view, update the editor content
            editorRef.current.innerHTML = value || '';
        }
        isInternalUpdateRef.current = false;
    }, [value, showCodeView]);

    const handleInput = () => {
        if (editorRef.current) {
            isInternalUpdateRef.current = true;
            onChange(editorRef.current.innerHTML);
        }
    };

    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editorRef.current) {
            const range = selection.getRangeAt(0);
            if (editorRef.current.contains(range.commonAncestorContainer)) {
                // Toolbar focus often collapses the live selection. Keep a prior
                // non-collapsed editor range so heading/font controls can still apply.
                if (
                    range.collapsed &&
                    savedRangeRef.current &&
                    !savedRangeRef.current.collapsed &&
                    editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)
                ) {
                    return;
                }
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

    /** Remove CSS properties from descendants so wrapper/heading styles can take effect on pasted HTML. */
    const clearStylePropertiesOnDescendants = (root: HTMLElement, properties: string[]) => {
        if (!properties.length) return;
        root.querySelectorAll('*').forEach((node) => {
            const el = node as HTMLElement;
            if (!el.style) return;
            properties.forEach((prop) => el.style.removeProperty(prop));
            if (!el.getAttribute('style')?.trim()) {
                el.removeAttribute('style');
            }
        });
    };

    const stylePropertiesFromDeclaration = (styleDecl: string): string[] => {
        return styleDecl
            .split(';')
            .map((part) => part.split(':')[0]?.trim().toLowerCase())
            .filter((prop): prop is string => Boolean(prop));
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

        const conflictingProps = attributes.style
            ? stylePropertiesFromDeclaration(attributes.style)
            : [];

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
            let wrapped: HTMLElement | null = null;
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
                wrapped = element;
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
                wrapped = element;
            }

            // Pasted HTML often has nested spans with absolute font-size/family/color;
            // clear those so the newly applied wrapper style is visible.
            if (wrapped && conflictingProps.length > 0) {
                clearStylePropertiesOnDescendants(wrapped, conflictingProps);
            }

            if (wrapped) {
                const selection = window.getSelection();
                if (selection) {
                    const newRange = document.createRange();
                    newRange.selectNodeContents(wrapped);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    savedRangeRef.current = newRange.cloneRange();
                }
            }
        }

        // Use setTimeout to ensure the DOM is updated before calling handleInput
        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const applyFormat = (command: string, value?: string) => {
        if (!editorRef.current) return;

        // Save selection before any operations
        saveSelection();
        
        // Focus and restore selection
        editorRef.current.focus();
        
        // Small delay to ensure focus is set
        setTimeout(() => {
            if (!editorRef.current) return;
            
            restoreSelection();
            
            // Ensure we have a valid selection
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                // No selection, create one at the end
                const range = document.createRange();
                range.selectNodeContents(editorRef.current);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
            }

            try {
                // Execute the command
                const success = document.execCommand(command, false, value);
                
                if (!success) {
                    console.warn(`Format command failed: ${command}`);
                }
                
                // Update the value after formatting
                setTimeout(() => {
                    handleInput();
                    // Save selection again after formatting
                    saveSelection();
                }, 0);
            } catch (e) {
                console.error(`Format command error: ${command}`, e);
            }
        }, 10);
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
        if (!editorRef.current) return;

        editorRef.current.focus();
        restoreSelection();

        const tagName = `h${level}`;
        try {
            // Use formatBlock so headings replace the block instead of nesting invalid wrappers
            document.execCommand('formatBlock', false, tagName);
        } catch (e) {
            console.warn('formatBlock heading failed, falling back to wrap', e);
            wrapSelection(tagName, {});
            return;
        }

        // Strip paste font sizing so editor heading CSS can apply
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode;
            }
            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;
                    const tag = el.tagName.toLowerCase();
                    if (tag === tagName || /^h[1-6]$/.test(tag)) {
                        clearStylePropertiesOnDescendants(el, ['font-size', 'font-family', 'font-weight', 'line-height']);
                        el.style.removeProperty('font-size');
                        el.style.removeProperty('font-family');
                        el.style.removeProperty('font-weight');
                        el.style.removeProperty('line-height');
                        break;
                    }
                }
                node = node.parentNode;
            }
        }

        setTimeout(() => {
            handleInput();
            saveSelection();
        }, 0);
    };

    const insertLink = () => {
        if (!editorRef.current) return;

        editorRef.current.focus();
        restoreSelection();

        const selection = window.getSelection();
        const selectedText = selection && selection.rangeCount > 0 ? selection.toString() : '';

        // Check if we're editing an existing link
        let existingLink: HTMLAnchorElement | null = null;
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode as Node;
            }
            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'a') {
                    existingLink = node as HTMLAnchorElement;
                    break;
                }
                node = node.parentNode as Node;
            }
        }

        if (existingLink) {
            // Editing existing link
            setLinkUrl(existingLink.href);
            setLinkText(existingLink.textContent || '');
            setLinkOpenNewTab(existingLink.target === '_blank');
        } else {
            // New link
            setLinkUrl('');
            setLinkText(selectedText);
            setLinkOpenNewTab(true);
        }

        setShowLinkDialog(true);
    };

    const handleInsertLink = () => {
        if (!linkUrl.trim()) {
            alert('Please enter a URL');
            return;
        }

        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const selection = window.getSelection();
        const selectedText = selection && selection.rangeCount > 0 ? selection.toString() : '';

        // Check if we're editing an existing link
        let existingLink: HTMLAnchorElement | null = null;
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode as Node;
            }
            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'a') {
                    existingLink = node as HTMLAnchorElement;
                    break;
                }
                node = node.parentNode as Node;
            }
        }

        const finalUrl = linkUrl.startsWith('http://') || linkUrl.startsWith('https://') || linkUrl.startsWith('mailto:') || linkUrl.startsWith('#') 
            ? linkUrl 
            : `https://${linkUrl}`;
        const finalText = linkText.trim() || selectedText || finalUrl;

        const range = getCurrentRange();
        if (range) {
            if (existingLink) {
                // Update existing link
                existingLink.href = finalUrl;
                existingLink.textContent = finalText;
                if (linkOpenNewTab) {
                    existingLink.target = '_blank';
                    existingLink.rel = 'noopener noreferrer';
                } else {
                    existingLink.removeAttribute('target');
                    existingLink.removeAttribute('rel');
                }
            } else {
                if (!range.collapsed && selectedText) {
                    // Replace selected text with link
                    range.deleteContents();
                    const link = document.createElement('a');
                    link.href = finalUrl;
                    link.textContent = finalText;
                    if (linkOpenNewTab) {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    }
                    range.insertNode(link);
                    range.collapse(false);
                } else {
                    // Insert link at cursor
                    const link = document.createElement('a');
                    link.href = finalUrl;
                    link.textContent = finalText;
                    if (linkOpenNewTab) {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    }
                    range.insertNode(link);
                    range.collapse(false);
                }
            }
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            setTimeout(() => {
                handleInput();
            }, 0);
        }

        setShowLinkDialog(false);
        setLinkUrl('');
        setLinkText('');
        setLinkOpenNewTab(true);
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
            setTimeout(() => {
                handleInput();
            }, 0);
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
            setTimeout(() => {
                handleInput();
            }, 0);
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

    const insertEmoji = (emoji: string) => {
        insertHTML(emoji);
        setShowEmojiPicker(false);
    };

    const insertList = (ordered: boolean = false) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const listTag = ordered ? 'ol' : 'ul';
        const list = document.createElement(listTag);
        list.className = ordered 
            ? 'list-decimal list-inside space-y-1 ml-2' 
            : 'list-disc list-inside space-y-1 ml-2';

        const listItem = document.createElement('li');
        const selectedText = range.toString().trim() || 'List item';
        listItem.textContent = selectedText;

        if (!range.collapsed) {
            range.deleteContents();
        }
        list.appendChild(listItem);
        range.insertNode(list);
        range.setStartAfter(listItem);
        range.collapse(true);

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const insertTable = (rows: number = 3, cols: number = 3) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const table = document.createElement('table');
        table.className = 'min-w-full border-collapse border border-slate-300 dark:border-slate-600';
        table.style.margin = '1em 0';

        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.className = 'bg-slate-100 dark:bg-slate-800';
        for (let i = 0; i < cols; i++) {
            const th = document.createElement('th');
            th.className = 'border border-slate-300 dark:border-slate-600 px-4 py-2 text-left font-semibold';
            th.textContent = `Header ${i + 1}`;
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body rows
        const tbody = document.createElement('tbody');
        for (let i = 0; i < rows - 1; i++) {
            const tr = document.createElement('tr');
            for (let j = 0; j < cols; j++) {
                const td = document.createElement('td');
                td.className = 'border border-slate-300 dark:border-slate-600 px-4 py-2';
                td.textContent = `Cell ${i + 1}-${j + 1}`;
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        if (!range.collapsed) {
            range.deleteContents();
        }
        range.insertNode(table);
        range.setStartAfter(table);
        range.collapse(true);

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const insertSection = (bgColor: string = '#f1f5f9') => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const section = document.createElement('div');
        section.className = 'rounded-lg p-4 space-y-2';
        section.style.backgroundColor = bgColor;
        section.style.margin = '1em 0';

        const selectedText = range.toString().trim() || 'Section content';
        const p = document.createElement('p');
        p.textContent = selectedText;
        section.appendChild(p);

        if (!range.collapsed) {
            range.deleteContents();
        }
        range.insertNode(section);
        range.setStart(p, 0);
        range.setEnd(p, 0);

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const insertBlockquote = () => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const blockquote = document.createElement('blockquote');
        blockquote.className = 'border-l-4 border-brand-500 pl-4 italic my-4 text-slate-600 dark:text-slate-400';
        const selectedText = range.toString().trim() || 'Quote text';
        blockquote.textContent = selectedText;

        if (!range.collapsed) {
            range.deleteContents();
        }
        range.insertNode(blockquote);
        range.setStart(blockquote, 0);
        range.setEnd(blockquote, 0);

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const insertCodeBlock = () => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const code = document.createElement('code');
        code.className = 'bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-sm font-mono';
        const selectedText = range.toString().trim() || 'code';
        code.textContent = selectedText;

        if (!range.collapsed) {
            range.deleteContents();
        }
        range.insertNode(code);
        range.setStart(code, 0);
        range.setEnd(code, 0);

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const insertColumns = (numColumns: number = 2) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const container = document.createElement('div');
        container.className = 'grid gap-4 my-4';
        container.style.gridTemplateColumns = `repeat(${numColumns}, 1fr)`;
        container.style.margin = '1em 0';

        // Create columns
        for (let i = 0; i < numColumns; i++) {
            const column = document.createElement('div');
            column.className = 'space-y-2';
            const p = document.createElement('p');
            p.textContent = `Column ${i + 1} content`;
            column.appendChild(p);
            container.appendChild(column);
        }

        if (!range.collapsed) {
            range.deleteContents();
        }
        range.insertNode(container);
        
        // Set cursor in first column
        const firstColumn = container.firstChild as HTMLElement;
        if (firstColumn) {
            const firstP = firstColumn.querySelector('p');
            if (firstP) {
                range.setStart(firstP, 0);
                range.setEnd(firstP, 0);
            }
        }

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const increaseIndent = () => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        // Get all selected nodes
        const selectedNodes: Node[] = [];
        if (range.collapsed) {
            // No selection, get the current block element
            let node: Node | null = range.commonAncestorContainer;
            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as HTMLElement;
                    const tagName = element.tagName.toLowerCase();
                    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tagName)) {
                        selectedNodes.push(node);
                        break;
                    }
                }
                node = node.parentNode;
            }
        } else {
            // Has selection, get all block elements in range
            const walker = document.createTreeWalker(
                range.commonAncestorContainer,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode: (node: Node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;
                            const tagName = element.tagName.toLowerCase();
                            if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tagName)) {
                                if (range.intersectsNode(node)) {
                                    return NodeFilter.FILTER_ACCEPT;
                                }
                            }
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                }
            );

            let node;
            while (node = walker.nextNode()) {
                selectedNodes.push(node);
            }
        }

        // If no block elements found, wrap selection in a div
        if (selectedNodes.length === 0) {
            const wrapper = document.createElement('div');
            wrapper.style.marginLeft = '2em';
            wrapper.style.paddingLeft = '1em';
            wrapper.style.borderLeft = '2px solid #cbd5e1';
            
            if (!range.collapsed) {
                try {
                    range.surroundContents(wrapper);
                } catch (e) {
                    const contents = range.extractContents();
                    wrapper.appendChild(contents);
                    range.insertNode(wrapper);
                }
            } else {
                const p = document.createElement('p');
                p.textContent = '\u00A0'; // Non-breaking space
                wrapper.appendChild(p);
                range.insertNode(wrapper);
                range.setStart(p, 0);
                range.setEnd(p, 0);
            }
        } else {
            // Increase indent for each selected block element
            selectedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as HTMLElement;
                    const currentMarginLeft = parseInt(window.getComputedStyle(element).marginLeft) || 0;
                    const currentPaddingLeft = parseInt(window.getComputedStyle(element).paddingLeft) || 0;
                    const indentAmount = 2; // em units
                    
                    element.style.marginLeft = `${currentMarginLeft / 16 + indentAmount}em`;
                    if (currentPaddingLeft === 0) {
                        element.style.paddingLeft = '1em';
                        element.style.borderLeft = '2px solid #cbd5e1';
                    }
                }
            });
        }

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const decreaseIndent = () => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const range = getCurrentRange();
        if (!range) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        // Get all selected nodes
        const selectedNodes: Node[] = [];
        if (range.collapsed) {
            // No selection, get the current block element
            let node: Node | null = range.commonAncestorContainer;
            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as HTMLElement;
                    const tagName = element.tagName.toLowerCase();
                    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tagName)) {
                        selectedNodes.push(node);
                        break;
                    }
                }
                node = node.parentNode;
            }
        } else {
            // Has selection, get all block elements in range
            const walker = document.createTreeWalker(
                range.commonAncestorContainer,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode: (node: Node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;
                            const tagName = element.tagName.toLowerCase();
                            if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tagName)) {
                                if (range.intersectsNode(node)) {
                                    return NodeFilter.FILTER_ACCEPT;
                                }
                            }
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                }
            );

            let node;
            while (node = walker.nextNode()) {
                selectedNodes.push(node);
            }
        }

        // Decrease indent for each selected block element
        selectedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                const currentMarginLeft = parseInt(window.getComputedStyle(element).marginLeft) || 0;
                const indentAmount = 2; // em units
                const newMarginLeft = Math.max(0, currentMarginLeft / 16 - indentAmount);
                
                if (newMarginLeft === 0) {
                    element.style.marginLeft = '';
                    element.style.paddingLeft = '';
                    element.style.borderLeft = '';
                } else {
                    element.style.marginLeft = `${newMarginLeft}em`;
                }
            }
        });

        setTimeout(() => {
            handleInput();
        }, 0);
    };

    const cleanWordHTML = (html: string): string => {
        if (!html) return '';

        // Minimal cleaning - only remove Word-specific XML namespaces and attributes
        // Preserve ALL formatting, spacing, styles, margins, padding, etc.
        let cleaned = html;
        
        // Remove Word-specific XML namespaces from tags (but keep content)
        cleaned = cleaned.replace(/xmlns:o="[^"]*"/gi, '');
        cleaned = cleaned.replace(/xmlns:w="[^"]*"/gi, '');
        cleaned = cleaned.replace(/xmlns:m="[^"]*"/gi, '');
        cleaned = cleaned.replace(/xmlns:v="[^"]*"/gi, '');
        cleaned = cleaned.replace(/xmlns="[^"]*"/gi, '');
        
        // Remove Word's o:p tags (but preserve their content)
        cleaned = cleaned.replace(/<o:p[^>]*>/gi, '');
        cleaned = cleaned.replace(/<\/o:p>/gi, '');
        
        // Remove Word-specific attributes (but keep all style attributes)
        cleaned = cleaned.replace(/\s+lang="[^"]*"/gi, '');
        cleaned = cleaned.replace(/\s+xml:lang="[^"]*"/gi, '');
        cleaned = cleaned.replace(/\s+o:p="[^"]*"/gi, '');
        
        // Remove Word-specific comments
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
        
        // Remove Word-specific class names but preserve all styles
        // Use regex to remove Mso* classes from class attributes
        cleaned = cleaned.replace(/\s+class="([^"]*Mso[^"]*|Mso[^"]*)"([^>]*)>/gi, (match, classAttr, rest) => {
            // Remove Mso classes but keep other classes
            const classes = classAttr.split(' ').filter((cls: string) => 
                !cls.startsWith('Mso') && 
                !cls.startsWith('ms-') &&
                cls !== 'MsoNormal' &&
                cls !== 'MsoListParagraph' &&
                cls.trim() !== ''
            );
            if (classes.length > 0) {
                return ` class="${classes.join(' ')}"${rest}>`;
            } else {
                return rest + '>';
            }
        });
        
        // Also handle class attributes that might have Mso in the middle
        cleaned = cleaned.replace(/\s+class="([^"]*)\s+Mso[^\s"]*([^"]*)"/gi, (match, before, after) => {
            const classes = (before + ' ' + after).split(' ').filter((cls: string) => 
                !cls.startsWith('Mso') && 
                !cls.startsWith('ms-') &&
                cls !== 'MsoNormal' &&
                cls !== 'MsoListParagraph' &&
                cls.trim() !== ''
            );
            if (classes.length > 0) {
                return ` class="${classes.join(' ')}"`;
            } else {
                return '';
            }
        });
        
        // Preserve ALL spacing, margins, padding, fonts, colors, etc.
        // Don't remove or modify any style attributes
        
        // Preserve non-breaking spaces
        cleaned = cleaned.replace(/\u00A0/g, '&nbsp;');
        
        return cleaned;
    };

    const handlePasteFromWord = (e?: React.ClipboardEvent) => {
        if (e) {
            e.preventDefault();
        }

        if (!editorRef.current) return;

        // If dialog is shown, get content from dialog
        if (showPasteWordDialog) {
            const cleanedHTML = cleanWordHTML(pasteWordContent);
            insertHTML(cleanedHTML);
            setShowPasteWordDialog(false);
            setPasteWordContent('');
            return;
        }

        // Try to get clipboard data
        const getClipboardData = async () => {
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        // Check if it looks like HTML (Word usually pastes HTML)
                        if (text.includes('<') || text.includes('&nbsp;') || text.includes('Mso')) {
                            setPasteWordContent(text);
                            setShowPasteWordDialog(true);
                        } else {
                            // Plain text, just insert it
                            insertHTML(text.replace(/\n/g, '<br />'));
                        }
                    }
                } else if (e && e.clipboardData) {
                    const html = e.clipboardData.getData('text/html');
                    const text = e.clipboardData.getData('text/plain');
                    
                    if (html && (html.includes('Mso') || html.includes('mso-'))) {
                        // Word content detected
                        setPasteWordContent(html);
                        setShowPasteWordDialog(true);
                    } else if (html) {
                        // Regular HTML, clean it
                        const cleaned = cleanWordHTML(html);
                        insertHTML(cleaned);
                    } else if (text) {
                        // Plain text
                        insertHTML(text.replace(/\n/g, '<br />'));
                    }
                }
            } catch (err) {
                console.error('Error reading clipboard:', err);
                // Fallback: show dialog for manual paste
                setShowPasteWordDialog(true);
            }
        };

        getClipboardData();
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        const html = clipboardData.getData('text/html');
        const text = clipboardData.getData('text/plain');

        // Check if it's Word content
        if (html && (html.includes('Mso') || html.includes('mso-') || html.includes('xmlns:o') || html.includes('xmlns:w'))) {
            e.preventDefault();
            // Clean it minimally to preserve formatting
            const cleaned = cleanWordHTML(html);
            insertHTML(cleaned);
            return;
        }

        // For regular HTML, preserve it as-is (minimal cleaning)
        if (html) {
            e.preventDefault();
            const cleaned = cleanWordHTML(html);
            insertHTML(cleaned);
            return;
        }

        // For plain text, convert newlines to breaks
        if (text && !html) {
            e.preventDefault();
            insertHTML(text.replace(/\n/g, '<br />'));
            return;
        }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Invalid file type. Allowed: JPEG, PNG, GIF, SVG, WebP');
            return;
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            alert('File size too large. Maximum size: 5MB');
            return;
        }

        // Create form data
        const formData = new FormData();
        formData.append('image', file);

        try {
            // Resolve API base dynamically (same pattern as other services)
            let apiBase = '/api';
            if (typeof window !== 'undefined') {
                const path = window.location.pathname || '';
                if (path !== '/' && path.length > 1) {
                    const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
                    if (cleanPath && cleanPath !== '/') {
                        apiBase = `${cleanPath}/api`;
                    }
                }
            }
            
            const response = await fetch(`${apiBase}/uploads.php/rich-text-image`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Upload failed' }));
                throw new Error(error.error || 'Upload failed');
            }

            const data = await response.json();
            if (data.success && data.url) {
                // Insert image at cursor position
                const img = document.createElement('img');
                img.src = data.url;
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.alt = file.name;

                editorRef.current?.focus();
                restoreSelection();

                const range = getCurrentRange();
                if (range) {
                    if (!range.collapsed) {
                        range.deleteContents();
                    }
                    range.insertNode(img);
                    range.collapse(false);
                    const selection = window.getSelection();
                    if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                    setTimeout(() => {
                        handleInput();
                    }, 0);
                }
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Image upload error:', error);
            alert(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
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
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('bold');
                        }}
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
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('italic');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Italic"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('underline');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Underline"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M6 4v8a6 6 0 0012 0V4" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('strikeThrough');
                        }}
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
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('subscript');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-xs font-bold"
                        title="Subscript"
                    >
                        x<sub>2</sub>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('superscript');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-xs font-bold"
                        title="Superscript"
                    >
                        x<sup>2</sup>
                    </button>
                </div>

                {/* Hyperlink */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1 relative">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertLink();
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Link"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </button>
                    {showLinkDialog && (
                        <>
                            <div 
                                className="fixed inset-0 z-[9998]" 
                                onClick={() => {
                                    setShowLinkDialog(false);
                                    setLinkUrl('');
                                    setLinkText('');
                                    setLinkOpenNewTab(true);
                                }}
                            ></div>
                            <div 
                                className="absolute z-[9999] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4"
                                style={{ top: '100%', left: 0, marginTop: '4px', width: '320px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Insert Link</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">URL</label>
                                        <input
                                            type="text"
                                            value={linkUrl}
                                            onChange={(e) => setLinkUrl(e.target.value)}
                                            placeholder="https://example.com"
                                            className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Link Text</label>
                                        <input
                                            type="text"
                                            value={linkText}
                                            onChange={(e) => setLinkText(e.target.value)}
                                            placeholder="Link text"
                                            className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="link-open-new-tab"
                                            checked={linkOpenNewTab}
                                            onChange={(e) => setLinkOpenNewTab(e.target.checked)}
                                            className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                                        />
                                        <label htmlFor="link-open-new-tab" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                            Open in new tab
                                        </label>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={handleInsertLink}
                                            className="flex-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-sm font-medium transition-colors"
                                        >
                                            Insert
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowLinkDialog(false);
                                                setLinkUrl('');
                                                setLinkText('');
                                                setLinkOpenNewTab(true);
                                            }}
                                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-sm font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Font Size */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <select
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
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('justifyLeft');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Align Left"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('justifyCenter');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Align Center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M9 6h6M9 18h6" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            applyFormat('justifyRight');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Align Right"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h12M3 18h12" />
                        </svg>
                    </button>
                </div>

                {/* Indent */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            decreaseIndent();
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Decrease Indent"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 9l-3 3m0 0l3 3m-3-3h7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            increaseIndent();
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Increase Indent"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 15l3-3m0 0l-3-3m3 3h-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                </div>

                {/* Lists */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertList(false);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Bullet List"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13m-13 6h13M3 6h.01M3 12h.01M3 18h.01" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertList(true);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Numbered List"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                    </button>
                </div>

                {/* Table */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1 relative">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            setShowTableDialog(true);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Table"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                    {showTableDialog && (
                        <>
                            <div 
                                className="fixed inset-0 z-[9998]" 
                                onClick={() => setShowTableDialog(false)}
                            ></div>
                            <div 
                                className="absolute z-[9999] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4"
                                style={{ top: '100%', left: 0, marginTop: '4px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Insert Table</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Rows</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={tableRows}
                                            onChange={(e) => setTableRows(parseInt(e.target.value) || 3)}
                                            className="w-full px-2 py-1 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Columns</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={tableCols}
                                            onChange={(e) => setTableCols(parseInt(e.target.value) || 3)}
                                            className="w-full px-2 py-1 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                insertTable(tableRows, tableCols);
                                                setShowTableDialog(false);
                                            }}
                                            className="flex-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-sm font-medium transition-colors"
                                        >
                                            Insert
                                        </button>
                                        <button
                                            onClick={() => setShowTableDialog(false)}
                                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-sm font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Section with Background */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1 relative">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            setShowSectionColorPicker(!showSectionColorPicker);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Section with Background"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                    {showSectionColorPicker && (
                        <>
                            <div 
                                className="fixed inset-0 z-[9998]" 
                                onClick={() => setShowSectionColorPicker(false)}
                            ></div>
                            <div 
                                className="absolute z-[9999] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4"
                                style={{ top: '100%', left: 0, marginTop: '4px', width: '280px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Section Background Color</h4>
                                <div className="grid grid-cols-6 gap-2 mb-3">
                                    {['#f1f5f9', '#fef3c7', '#dbeafe', '#e0e7ff', '#fce7f3', '#dcfce7', '#fef2f2', '#f0fdf4', '#f0f9ff', '#faf5ff', '#fff7ed', '#fefce8'].map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => {
                                                insertSection(color);
                                                setShowSectionColorPicker(false);
                                            }}
                                            className="w-8 h-8 rounded border-2 border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform"
                                            style={{ backgroundColor: color }}
                                            title={color}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        id="section-color-picker"
                                        defaultValue="#f1f5f9"
                                        onChange={(e) => {
                                            insertSection(e.target.value);
                                            setShowSectionColorPicker(false);
                                        }}
                                        className="w-10 h-10 border border-slate-300 dark:border-slate-600 rounded cursor-pointer"
                                    />
                                    <label htmlFor="section-color-picker" className="text-xs text-slate-600 dark:text-slate-400">Custom Color</label>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Blockquote & Code */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertBlockquote();
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Blockquote"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertCodeBlock();
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Code Block"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                        </svg>
                    </button>
                </div>

                {/* Columns */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertColumns(2);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert 2 Columns"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.5 0h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertColumns(3);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert 3 Columns"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>

                {/* Date/Time */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertDate();
                        }}
                        className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Insert Date"
                    >
                        📅 Date
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            insertTime();
                        }}
                        className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Insert Time"
                    >
                        🕐 Time
                    </button>
                </div>

                {/* Emoji Picker */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1 relative">
                    <button
                        ref={emojiBtnRef}
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            setShowEmojiPicker(!showEmojiPicker);
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Emoji"
                    >
                        <span className="text-lg">😀</span>
                    </button>
                    <EmojiPickerPopover
                        open={showEmojiPicker}
                        onClose={() => setShowEmojiPicker(false)}
                        onSelect={insertEmoji}
                        anchorRef={emojiBtnRef}
                    />
                </div>

                {/* Image Upload */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/svg+xml,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Insert Image"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                    </button>
                </div>

                {/* Clear Formatting */}
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        if (!editorRef.current) return;
                        
                        editorRef.current.focus();
                        restoreSelection();
                        
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            
                            if (range.collapsed) {
                                // No selection - clear all formatting in the editor
                                const textContent = editorRef.current.textContent || '';
                                editorRef.current.innerHTML = '';
                                const textNode = document.createTextNode(textContent);
                                editorRef.current.appendChild(textNode);
                                
                                // Set cursor at end
                                const newRange = document.createRange();
                                newRange.selectNodeContents(editorRef.current);
                                newRange.collapse(false);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            } else {
                                // Has selection - remove formatting from selected text
                                try {
                                    // First try removeFormat
                                    document.execCommand('removeFormat', false);
                                    
                                    // Then remove all inline styles and tags, keeping only text
                                    const selectedContent = range.extractContents();
                                    const textContent = selectedContent.textContent || '';
                                    
                                    // Create a text node with just the text
                                    const textNode = document.createTextNode(textContent);
                                    range.insertNode(textNode);
                                    
                                    // Collapse range after inserted text
                                    range.collapse(false);
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                } catch (e) {
                                    // Fallback: just extract text content
                                    const selectedContent = range.extractContents();
                                    const textContent = selectedContent.textContent || '';
                                    const textNode = document.createTextNode(textContent);
                                    range.insertNode(textNode);
                                    range.collapse(false);
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                }
                            }
                            
                            setTimeout(() => {
                                handleInput();
                            }, 0);
                        } else {
                            // No selection - clear all formatting
                            const textContent = editorRef.current.textContent || '';
                            editorRef.current.innerHTML = '';
                            const textNode = document.createTextNode(textContent);
                            editorRef.current.appendChild(textNode);
                            
                            // Set cursor at end
                            const newRange = document.createRange();
                            newRange.selectNodeContents(editorRef.current);
                            newRange.collapse(false);
                            const sel = window.getSelection();
                            if (sel) {
                                sel.removeAllRanges();
                                sel.addRange(newRange);
                            }
                            
                            setTimeout(() => {
                                handleInput();
                            }, 0);
                        }
                    }}
                    className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Clear Formatting"
                >
                    Clear
                </button>

                {/* Paste from Word */}
                <div className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-600 pr-2 mr-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelection();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            handlePasteFromWord();
                        }}
                        className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Paste from Word"
                    >
                        📋 Word
                    </button>
                </div>

                {/* Code View Toggle */}
                <div className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-600 pl-2 ml-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            if (showCodeView) {
                                // Switching from code view to visual view
                                const htmlCode = codeViewValue;
                                if (editorRef.current) {
                                    editorRef.current.innerHTML = htmlCode;
                                    isInternalUpdateRef.current = true;
                                    onChange(htmlCode);
                                }
                            } else {
                                // Switching from visual view to code view - format the HTML
                                const currentHtml = editorRef.current?.innerHTML || value || '';
                                const formattedHtml = formatHTML(currentHtml);
                                setCodeViewValue(formattedHtml);
                                // Update the value with formatted HTML
                                if (formattedHtml !== currentHtml) {
                                    isInternalUpdateRef.current = true;
                                    onChange(formattedHtml);
                                }
                            }
                            setShowCodeView(!showCodeView);
                        }}
                        className={`px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 ${
                            showCodeView ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 border-brand-300 dark:border-brand-700' : ''
                        }`}
                        title={showCodeView ? 'Switch to Visual Editor' : 'Switch to Code View'}
                    >
                        {showCodeView ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Visual
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                                </svg>
                                Code
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Editor - Visual or Code View */}
            {showCodeView && (
                <div className="relative">
                    <textarea
                        value={codeViewValue}
                        onChange={(e) => {
                            setCodeViewValue(e.target.value);
                            // Update the parent component in real-time
                            onChange(e.target.value);
                        }}
                        className="w-full min-h-[200px] bg-slate-900 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-b-lg px-3 py-2 text-sm text-green-400 font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all resize-y"
                        style={{
                            fontFamily: 'monospace',
                            lineHeight: '1.5',
                            tabSize: 2
                        }}
                        placeholder="Enter HTML code here..."
                        spellCheck={false}
                    />
                    <div className="absolute top-2 right-2 flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                // Format the HTML code
                                const formatted = formatHTML(codeViewValue);
                                setCodeViewValue(formatted);
                                onChange(formatted);
                            }}
                            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-lg"
                            title="Format HTML Code"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                            Format
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    // Try modern clipboard API first
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                        await navigator.clipboard.writeText(codeViewValue);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    } else {
                                        // Fallback for browsers that don't support clipboard API
                                        const textArea = document.createElement('textarea');
                                        textArea.value = codeViewValue;
                                        textArea.style.position = 'fixed';
                                        textArea.style.left = '-999999px';
                                        textArea.style.top = '-999999px';
                                        document.body.appendChild(textArea);
                                        textArea.focus();
                                        textArea.select();
                                        
                                        try {
                                            const successful = document.execCommand('copy');
                                            if (successful) {
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            } else {
                                                throw new Error('execCommand copy failed');
                                            }
                                        } finally {
                                            document.body.removeChild(textArea);
                                        }
                                    }
                                } catch (err) {
                                    console.error('Failed to copy:', err);
                                    // Try fallback method
                                    try {
                                        const textArea = document.createElement('textarea');
                                        textArea.value = codeViewValue;
                                        textArea.style.position = 'fixed';
                                        textArea.style.left = '-999999px';
                                        textArea.style.top = '-999999px';
                                        document.body.appendChild(textArea);
                                        textArea.focus();
                                        textArea.select();
                                        
                                        const successful = document.execCommand('copy');
                                        document.body.removeChild(textArea);
                                        
                                        if (successful) {
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        } else {
                                            alert('Failed to copy to clipboard. Please copy manually.');
                                        }
                                    } catch (fallbackErr) {
                                        console.error('Fallback copy also failed:', fallbackErr);
                                        alert('Failed to copy to clipboard. Please select and copy manually (Ctrl+C or Cmd+C).');
                                    }
                                }
                            }}
                            className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-lg"
                            title="Copy HTML Code"
                        >
                            {copied ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                    </svg>
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                    </svg>
                                    Copy HTML
                                </>
                            )}
                        </button>
                    </div>
                    <div className="absolute bottom-2 left-2 text-xs text-slate-400 dark:text-slate-500 bg-slate-800/80 dark:bg-slate-900/80 px-2 py-1 rounded">
                        HTML Code View - Edit directly or copy to clipboard
                    </div>
                </div>
            )}
            {!showCodeView && (
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onBlur={handleInput}
                    onMouseUp={saveSelection}
                    onKeyUp={saveSelection}
                    onPaste={handlePaste}
                    className="min-h-[60px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-b-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                    style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}
                    data-placeholder={placeholder}
                    suppressContentEditableWarning
                />
            )}

            {/* Paste from Word Dialog */}
            {showPasteWordDialog && (
                <>
                    <div 
                        className="fixed inset-0 z-[9998] bg-black/50" 
                        onClick={() => {
                            setShowPasteWordDialog(false);
                            setPasteWordContent('');
                        }}
                    ></div>
                    <div 
                        className="fixed z-[9999] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-6"
                        style={{ 
                            top: '50%', 
                            left: '50%', 
                            transform: 'translate(-50%, -50%)',
                            width: '90%',
                            maxWidth: '600px',
                            maxHeight: '80vh',
                            overflow: 'auto'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Paste from Word</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Paste your Word content below. The formatting will be cleaned automatically.
                        </p>
                        <textarea
                            value={pasteWordContent}
                            onChange={(e) => setPasteWordContent(e.target.value)}
                            placeholder="Paste your Word content here (Ctrl+V or Cmd+V)..."
                            className="w-full h-64 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                            autoFocus
                            onPaste={(e) => {
                                e.preventDefault();
                                const text = e.clipboardData.getData('text/plain');
                                const html = e.clipboardData.getData('text/html');
                                setPasteWordContent(html || text);
                            }}
                        />
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => {
                                    const cleanedHTML = cleanWordHTML(pasteWordContent);
                                    insertHTML(cleanedHTML);
                                    setShowPasteWordDialog(false);
                                    setPasteWordContent('');
                                }}
                                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded text-sm font-medium transition-colors"
                            >
                                Paste Cleaned Content
                            </button>
                            <button
                                onClick={() => {
                                    setShowPasteWordDialog(false);
                                    setPasteWordContent('');
                                }}
                                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </>
            )}

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
                .rich-text-editor img { max-width: 100%; height: auto; display: block; margin: 0.5em 0; }
                .rich-text-editor ul, .rich-text-editor ol { margin: 1em 0; padding-left: 2em; }
                .rich-text-editor ul { list-style-type: disc; }
                .rich-text-editor ol { list-style-type: decimal; }
                .rich-text-editor li { margin: 0.25em 0; }
                .rich-text-editor table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin: 1em 0; 
                    border: 1px solid #cbd5e1;
                }
                .rich-text-editor table th, 
                .rich-text-editor table td { 
                    border: 1px solid #cbd5e1; 
                    padding: 0.5em 1em; 
                    text-align: left;
                }
                .rich-text-editor table th { 
                    background-color: #f1f5f9; 
                    font-weight: 600;
                }
                .rich-text-editor blockquote { 
                    border-left: 4px solid #4f46e5; 
                    padding-left: 1em; 
                    margin: 1em 0; 
                    font-style: italic; 
                    color: #64748b;
                }
                .rich-text-editor code { 
                    background-color: #f1f5f9; 
                    padding: 0.125em 0.25em; 
                    border-radius: 0.25rem; 
                    font-family: monospace; 
                    font-size: 0.875em;
                }
                .rich-text-editor div[style*="background-color"] {
                    border-radius: 0.5rem;
                    padding: 1em;
                    margin: 1em 0;
                }
                .rich-text-editor .grid {
                    display: grid;
                    gap: 1rem;
                    margin: 1em 0;
                }
                .rich-text-editor .grid > div {
                    min-height: 2em;
                }
                @media (max-width: 768px) {
                    .rich-text-editor .grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};
