import React from 'react';
import { linkifyHtml } from '../utils/richTextDisplay';

interface RichTextBoxedViewProps {
  content: string;
  boxed?: boolean;
  boxTitle?: string | null;
  boxFooter?: string | null;
  className?: string;
  /** Extra classes for the inner HTML body */
  bodyClassName?: string;
}

/**
 * Renders section rich text with optional styled header/footer box.
 * Always linkifies bare URLs/emails and preserves whitespace (pre-wrap).
 */
export const RichTextBoxedView: React.FC<RichTextBoxedViewProps> = ({
  content,
  boxed = false,
  boxTitle,
  boxFooter,
  className = '',
  bodyClassName = '',
}) => {
  const html = linkifyHtml(content || '');
  const bodyStyle: React.CSSProperties = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  const body = (
    <div
      className={`rich-text-content prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-headings:text-slate-800 dark:prose-headings:text-slate-200 ${bodyClassName}`}
      style={bodyStyle}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );

  if (!boxed) {
    return <div className={className}>{body}</div>;
  }

  const title = (boxTitle || '').trim() || 'Notes';
  const footer = (boxFooter || '').trim();

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 shadow-sm ${className}`}
    >
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
          {title}
        </h4>
      </div>
      <div className="px-4 py-3">{body}</div>
      {footer ? (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400" style={{ whiteSpace: 'pre-wrap' }}>
            {footer}
          </p>
        </div>
      ) : (
        <div className="h-2 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/80" />
      )}
    </div>
  );
};
