import React, { useState } from 'react';
import type { UrlDiagnosis } from '../utils/urlDiagnostics';
import { diagnoseLinkUrl, hasBlockingUrlIssues } from '../utils/urlDiagnostics';

export const UrlFormDiagnostics: React.FC<{
  diagnosis: UrlDiagnosis;
  listId?: string;
  onApplyFix?: (url: string) => void;
}> = ({ diagnosis, listId, onApplyFix }) => {
  const errors = diagnosis.issues.filter((item) => item.severity === 'error');
  const warnings = diagnosis.issues.filter((item) => item.severity === 'warning');
  const items = [...errors, ...warnings];
  const [copied, setCopied] = useState(false);

  if (items.length === 0) return null;

  return (
    <div
      id={listId}
      className="mt-1.5 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 px-3 py-2"
      role="status"
    >
      <p className="text-[11px] font-semibold text-amber-950 dark:text-amber-100">
        This URL is not well formed
        <span className="font-medium text-amber-800 dark:text-amber-200/90">
          {' '}
          · {items.length} {items.length === 1 ? 'issue' : 'issues'}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="text-[11px] leading-snug text-amber-950 dark:text-amber-100">
            <span className="font-semibold">{item.title}.</span>{' '}
            <span className="text-amber-900/90 dark:text-amber-100/90">{item.detail}</span>
            {(item.found || item.expected) && (
              <span className="block mt-0.5 font-mono text-[10px] text-amber-800 dark:text-amber-200/90">
                {item.found ? <span>Found: {item.found}</span> : null}
                {item.found && item.expected ? ' → ' : null}
                {item.expected ? <span>Use: {item.expected}</span> : null}
              </span>
            )}
            <span className="block mt-0.5 text-amber-800 dark:text-amber-200/90">{item.fix}</span>
          </li>
        ))}
      </ul>
      {diagnosis.suggestedUrl && onApplyFix && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onApplyFix(diagnosis.suggestedUrl as string)}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 transition-colors"
          >
            Use suggested URL
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(diagnosis.suggestedUrl as string);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch {
                /* ignore */
              }
            }}
            className="text-[11px] font-medium text-amber-900 dark:text-amber-200 underline-offset-2 hover:underline"
          >
            {copied ? 'Copied' : 'Copy suggestion'}
          </button>
          <span className="font-mono text-[10px] text-amber-900/80 dark:text-amber-200/80 break-all">
            {diagnosis.suggestedUrl}
          </span>
        </div>
      )}
    </div>
  );
};

export const UrlNeedsFixBadge: React.FC<{ count: number }> = ({ count }) => (
  <span
    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100 border-amber-300 dark:border-amber-700"
    title="This URL is not well formed. See the notes under the field for what to fix."
    role="status"
  >
    <span aria-hidden>⚠️</span>
    Needs fixing{count > 1 ? ` · ${count}` : ''}
  </span>
);

/** Compact exclamation for link lists when the stored URL is not well formed. */
export const InvalidUrlMark: React.FC<{ url?: string; className?: string }> = ({ url, className }) => {
  const diagnosis = diagnoseLinkUrl(url || '');
  if (!hasBlockingUrlIssues(diagnosis)) return null;
  const titles = diagnosis.issues
    .filter((item) => item.severity === 'error')
    .map((item) => item.title);
  const hint = [
    titles.join('. ') || 'This URL is not valid',
    diagnosis.suggestedUrl ? `Suggested: ${diagnosis.suggestedUrl}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400 ${className || ''}`}
      title={hint}
      role="img"
      aria-label={hint}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
};
