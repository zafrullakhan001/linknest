import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface LinkInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkLabel: string;
  linkIcon?: string;
  richTextContent: string;
  linkUrl?: string;
}

// Function to format/beautify HTML (same as RichTextEditor)
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

export const LinkInfoDialog: React.FC<LinkInfoDialogProps> = ({ 
  isOpen, 
  onClose, 
  linkLabel, 
  linkIcon,
  richTextContent,
  linkUrl 
}) => {
  const [showCodeView, setShowCodeView] = useState(false);
  const [codeViewValue, setCodeViewValue] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (showCodeView && richTextContent) {
      const formatted = formatHTML(richTextContent);
      setCodeViewValue(formatted);
    }
  }, [showCodeView, richTextContent]);

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowCodeView(!showCodeView);
                if (!showCodeView && richTextContent) {
                  const formatted = formatHTML(richTextContent);
                  setCodeViewValue(formatted);
                }
              }}
              className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
              title={showCodeView ? "View Visual" : "View HTML Code"}
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative">
          {showCodeView ? (
            <div className="relative h-full">
              <textarea
                value={codeViewValue}
                onChange={(e) => setCodeViewValue(e.target.value)}
                className="w-full h-full p-4 bg-slate-900 dark:bg-slate-950 text-green-400 font-mono text-sm border-0 focus:outline-none resize-none"
                style={{ minHeight: '400px' }}
                spellCheck={false}
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={() => {
                    const formatted = formatHTML(codeViewValue);
                    setCodeViewValue(formatted);
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                  title="Format HTML"
                >
                  Format
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(codeViewValue);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } else {
                        throw new Error('Clipboard API not available');
                      }
                    } catch (err) {
                      console.error('Failed to copy:', err);
                      // Fallback method
                      try {
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
                HTML Code View - View or copy to clipboard
              </div>
            </div>
          ) : (
            <div 
              className="rich-text-viewer bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              dangerouslySetInnerHTML={{ __html: richTextContent }}
              style={{
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            />
          )}
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
