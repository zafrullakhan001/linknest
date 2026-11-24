import React, { useEffect, useId, useRef, useState } from 'react';
import { renderMermaidNodes } from '../utils/renderDocsMermaid';

interface HelpMermaidDiagramProps {
  source: string;
  title?: string;
  caption?: string;
}

/**
 * Renders a Mermaid diagram inside Help / About (bundled mermaid, not CDN).
 */
export const HelpMermaidDiagram: React.FC<HelpMermaidDiagramProps> = ({
  source,
  title,
  caption,
}) => {
  const rawId = useId().replace(/:/g, '');
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const node = host.querySelector<HTMLElement>('.mermaid');
    if (!node) return;

    let cancelled = false;
    setBusy(true);
    setError(null);
    node.textContent = source.trim();
    node.removeAttribute('data-processed');
    delete node.dataset.mermaidSource;

    (async () => {
      try {
        await renderMermaidNodes([node]);
        if (!cancelled && !node.querySelector('svg')) {
          setError('Diagram did not render. Use View code or Guides.');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Diagram could not render');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="docs-reader my-3">
      {title ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
          {title}
        </p>
      ) : null}
      <div
        className="mermaid-diagram rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 overflow-x-auto"
        data-mermaid-diagram="1"
      >
        <div className="mermaid-canvas overflow-x-auto p-3" ref={hostRef}>
          <div className="mermaid" data-ln-mermaid={rawId} />
        </div>
        {busy ? (
          <p className="px-3 pb-2 text-[11px] text-slate-400">Rendering diagram…</p>
        ) : null}
        {error ? (
          <p className="px-3 pb-2 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}
      </div>
      {caption ? (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{caption}</p>
      ) : null}
    </div>
  );
};
