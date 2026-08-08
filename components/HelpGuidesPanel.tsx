import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaChevronDown, FaChevronRight, FaRedo } from 'react-icons/fa';
import { DocListItem, getDoc, listDocs } from '../services/docsService';
import { renderDocsHtml } from '../utils/docsMarkdown';
import {
  collectMermaidNodes,
  getMermaidSourceFromDiagram,
  getUnprocessedOrBrokenMermaidNodes,
  refreshAllMermaid,
  refreshOneMermaid,
} from '../utils/renderDocsMermaid';
import { buildMermaidLiveUrl } from '../utils/mermaidLiveUrl';

const DEFAULT_DOC = 'APP_UPDATES.md';
const SIDEBAR_STORAGE_KEY = 'linknest_help_guides_sidebar_width';
const COLLAPSED_STORAGE_KEY = 'linknest_help_guides_collapsed_cats';
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;

export const HelpGuidesPanel: React.FC = () => {
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [categories, setCategories] = useState<Record<string, DocListItem[]>>({});
  const [selectedFile, setSelectedFile] = useState<string>(DEFAULT_DOC);
  const [title, setTitle] = useState('Documentation');
  const [html, setHtml] = useState('');
  const [filter, setFilter] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      const n = raw ? parseInt(raw, 10) : SIDEBAR_DEFAULT;
      if (Number.isFinite(n)) {
        return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
      }
    } catch {
      /* ignore */
    }
    return SIDEBAR_DEFAULT;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
      }
    } catch {
      /* ignore */
    }
    return {};
  });
  const [hasMermaid, setHasMermaid] = useState(false);
  const [mermaidBusy, setMermaidBusy] = useState(false);
  const [toolMsg, setToolMsg] = useState<string | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const mermaidRenderGen = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedCats));
    } catch {
      /* ignore */
    }
  }, [collapsedCats]);

  const toggleCategory = (cat: string) => {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  useEffect(() => {
    if (!isResizingSidebar) return;

    const onMove = (e: MouseEvent) => {
      const root = layoutRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const next = e.clientX - rect.left;
      const maxAllowed = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, rect.width - 280));
      setSidebarWidth(Math.min(maxAllowed, Math.max(SIDEBAR_MIN, next)));
    };

    const onUp = () => setIsResizingSidebar(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setError(null);
      try {
        const data = await listDocs();
        if (cancelled) return;
        setDocs(data.docs || []);
        setCategories(data.categories || {});
        const prefer =
          data.docs.find((d) => d.file === DEFAULT_DOC)?.file ||
          data.docs.find((d) => d.file === 'ARCHITECTURE.md')?.file ||
          data.docs.find((d) => d.category === 'Getting Started')?.file ||
          data.docs[0]?.file;
        if (prefer) setSelectedFile(prefer);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load guides');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    (async () => {
      setDocLoading(true);
      setError(null);
      try {
        const doc = await getDoc(selectedFile);
        if (cancelled) return;
        setTitle(doc.title || selectedFile);
        setHtml(renderDocsHtml(doc.markdown || ''));
      } catch (e: any) {
        if (!cancelled) {
          setHtml('');
          setError(e?.message || 'Failed to load document');
        }
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  // Imperative HTML so parent re-renders (dialog resize) do not wipe Mermaid SVGs
  useEffect(() => {
    const root = readerRef.current;
    if (!root) return;
    if (docLoading || !html) {
      root.innerHTML = '';
      setHasMermaid(false);
      return;
    }
    root.innerHTML = html;
    setHasMermaid(root.querySelectorAll('.mermaid').length > 0);
  }, [html, docLoading]);

  useEffect(() => {
    if (docLoading || !html || !readerRef.current) return;
    const root = readerRef.current;
    const nodes = collectMermaidNodes(root);
    if (!nodes.length) return;

    const gen = ++mermaidRenderGen.current;
    let cancelled = false;
    setMermaidBusy(true);
    (async () => {
      try {
        await refreshAllMermaid(root);
      } catch (e) {
        console.warn('Mermaid render failed', e);
      } finally {
        if (!cancelled && gen === mermaidRenderGen.current) setMermaidBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html, docLoading]);

  // Auto re-render if resize leaves raw code / unprocessed blocks
  useEffect(() => {
    const scrollEl = readerScrollRef.current;
    const layoutEl = layoutRef.current;
    if (!scrollEl && !layoutEl) return;

    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const root = readerRef.current;
        if (!root || !html || docLoading) return;
        const broken = getUnprocessedOrBrokenMermaidNodes(root);
        if (!broken.length) return;
        setMermaidBusy(true);
        try {
          await refreshAllMermaid(root);
        } catch (e) {
          console.warn('Mermaid auto-refresh failed', e);
        } finally {
          setMermaidBusy(false);
        }
      }, 250);
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (ro) {
      if (scrollEl) ro.observe(scrollEl);
      if (layoutEl) ro.observe(layoutEl);
    }
    window.addEventListener('resize', schedule);
    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [html, docLoading]);

  useEffect(() => {
    if (!toolMsg) return;
    const t = window.setTimeout(() => setToolMsg(null), 2000);
    return () => window.clearTimeout(t);
  }, [toolMsg]);

  const flashTool = (msg: string) => setToolMsg(msg);

  const handleRefreshAllDiagrams = async () => {
    const root = readerRef.current;
    if (!root) return;
    setMermaidBusy(true);
    try {
      await refreshAllMermaid(root);
      flashTool('Diagrams refreshed');
    } catch (e) {
      console.warn(e);
      flashTool('Refresh failed');
    } finally {
      setMermaidBusy(false);
    }
  };

  const handleReaderClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest?.('[data-mermaid-action]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const action = btn.getAttribute('data-mermaid-action');
    const diagram = btn.closest('[data-mermaid-diagram]') as HTMLElement | null;
    if (!diagram || !action) return;

    const node = diagram.querySelector<HTMLElement>('.mermaid');
    const source = getMermaidSourceFromDiagram(diagram);

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(source);
        flashTool('Copied Mermaid source');
        btn.textContent = 'Copied';
        window.setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1200);
      } catch {
        flashTool('Copy failed');
      }
      return;
    }

    if (action === 'live') {
      try {
        const url = await buildMermaidLiveUrl(source);
        window.open(url, '_blank', 'noopener,noreferrer');
        flashTool('Opened Mermaid Live');
      } catch (err) {
        console.warn(err);
        try {
          await navigator.clipboard.writeText(source);
          window.open('https://mermaid.live/edit', '_blank', 'noopener,noreferrer');
          flashTool('Live failed to encode — source copied; paste in Mermaid Live');
        } catch {
          flashTool('Could not open Mermaid Live');
        }
      }
      return;
    }

    if (action === 'refresh' && node) {
      setMermaidBusy(true);
      try {
        await refreshOneMermaid(node);
        flashTool('Diagram refreshed');
      } catch (err) {
        console.warn(err);
        flashTool('Refresh failed');
      } finally {
        setMermaidBusy(false);
      }
    }
  };

  const filteredCategories = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const result: Record<string, DocListItem[]> = {};
    const entries = Object.entries(categories);
    for (const [cat, items] of entries) {
      const kept = !q
        ? items
        : items.filter(
            (d) =>
              d.title.toLowerCase().includes(q) ||
              d.file.toLowerCase().includes(q) ||
              cat.toLowerCase().includes(q)
          );
      if (kept.length) result[cat] = kept;
    }
    return result;
  }, [categories, filter]);

  const flatFiltered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.file.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [docs, filter]);

  return (
    <div ref={layoutRef} className="flex flex-col sm:flex-row h-full min-h-0 gap-0">
      {/* Mobile select */}
      <div className="sm:hidden border-b border-slate-200 dark:border-slate-700 p-3 space-y-2 shrink-0">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter guides…"
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        />
        <select
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          disabled={listLoading || flatFiltered.length === 0}
        >
          {flatFiltered.map((d) => (
            <option key={d.file} value={d.file}>
              {d.category}: {d.title}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop left nav (resizable) */}
      <aside
        className="hidden sm:flex sm:flex-col shrink-0 bg-slate-50/80 dark:bg-slate-900/40 min-h-0"
        style={{ width: sidebarWidth }}
      >
        <div className="p-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter guides…"
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {listLoading && (
            <p className="text-xs text-slate-500 px-2 py-1">Loading guides…</p>
          )}
          {!listLoading && Object.keys(filteredCategories).length === 0 && (
            <p className="text-xs text-slate-500 px-2 py-1">No guides match.</p>
          )}
          {Object.entries(filteredCategories).map(([cat, items]) => {
            const forceOpen = Boolean(filter.trim());
            const isOpen = forceOpen || !collapsedCats[cat];
            return (
              <div key={cat}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-slate-600 dark:text-slate-300 shrink-0 w-3 flex justify-center">
                    {isOpen ? (
                      <FaChevronDown className="text-[9px]" aria-hidden />
                    ) : (
                      <FaChevronRight className="text-[9px]" aria-hidden />
                    )}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                    {cat}
                  </span>
                  <span className="ml-auto text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                    {items.length}
                  </span>
                </button>
                {isOpen && (
                  <ul className="space-y-0.5 mt-0.5">
                    {items.map((d) => (
                      <li key={d.file}>
                        <button
                          type="button"
                          onClick={() => setSelectedFile(d.file)}
                          className={`w-full text-left pl-6 pr-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                            selectedFile === d.file
                              ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-900 dark:text-brand-100 font-medium'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {d.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Drag splitter */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize guides panel"
        title="Drag to resize · Double-click to reset"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingSidebar(true);
        }}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
        className={`hidden sm:block w-1.5 shrink-0 cursor-col-resize relative z-10 ${
          isResizingSidebar
            ? 'bg-brand-400 dark:bg-brand-500'
            : 'bg-slate-200 dark:bg-slate-700 hover:bg-brand-400 dark:hover:bg-brand-500'
        }`}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      {/* Reader */}
      <section className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{title}</h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedFile}</p>
            {toolMsg && (
              <p className="text-[11px] text-brand-700 dark:text-brand-300 mt-1">{toolMsg}</p>
            )}
          </div>
          {hasMermaid && (
            <button
              type="button"
              onClick={() => void handleRefreshAllDiagrams()}
              disabled={mermaidBusy}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              title="Re-render all Mermaid diagrams"
            >
              <FaRedo className={mermaidBusy ? 'animate-spin text-[10px]' : 'text-[10px]'} aria-hidden />
              {mermaidBusy ? 'Rendering…' : 'Refresh diagrams'}
            </button>
          )}
        </div>
        <div ref={readerScrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300 mb-3">
              {error}
            </div>
          )}
          {docLoading && <p className="text-sm text-slate-500">Loading document…</p>}
          {!docLoading && html && (
            <div
              ref={readerRef}
              className="docs-reader max-w-4xl"
              onClick={(e) => void handleReaderClick(e)}
            />
          )}
          {!docLoading && !html && !error && (
            <p className="text-sm text-slate-500">Select a guide to read.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default HelpGuidesPanel;
