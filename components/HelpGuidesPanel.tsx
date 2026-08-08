import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { DocListItem, getDoc, listDocs } from '../services/docsService';
import { renderDocsHtml } from '../utils/docsMarkdown';

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
  const layoutRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (docLoading || !html || !readerRef.current) return;
    const root = readerRef.current;
    const nodes = root.querySelectorAll<HTMLElement>('.mermaid');
    if (!nodes.length) return;

    let cancelled = false;

    const fixLabelOverflow = (scope: HTMLElement) => {
      scope.querySelectorAll('svg').forEach((svg) => {
        svg.style.overflow = 'visible';
        svg.removeAttribute('height');
        // Prefer intrinsic width; avoid shrinking that clips labels
        if (!svg.getAttribute('width') || svg.getAttribute('width') === '100%') {
          /* keep */
        }
        svg.style.maxWidth = '100%';
        svg.style.height = 'auto';
      });

      scope.querySelectorAll('foreignObject').forEach((fo) => {
        const el = fo as SVGForeignObjectElement;
        el.style.overflow = 'visible';
        const inner = el.querySelector('.nodeLabel, .edgeLabel, div, span') as HTMLElement | null;
        if (!inner) return;
        // Let layout settle, then expand FO to fit wrapped label text
        const padX = 12;
        const padY = 8;
        const needW = Math.ceil(Math.max(inner.scrollWidth, inner.offsetWidth, inner.getBoundingClientRect().width)) + padX;
        const needH = Math.ceil(Math.max(inner.scrollHeight, inner.offsetHeight, inner.getBoundingClientRect().height)) + padY;
        const curW = parseFloat(el.getAttribute('width') || '0') || 0;
        const curH = parseFloat(el.getAttribute('height') || '0') || 0;
        if (needW > curW) el.setAttribute('width', String(needW));
        if (needH > curH) el.setAttribute('height', String(needH));
        inner.style.overflow = 'visible';
        inner.style.whiteSpace = 'normal';
        inner.style.wordBreak = 'break-word';
        inner.style.overflowWrap = 'anywhere';
      });
    };

    (async () => {
      try {
        const { loadMermaid } = await import('../utils/loadMermaid');
        const mermaid = await loadMermaid();
        if (cancelled) return;
        const dark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: dark ? 'dark' : 'default',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          themeVariables: {
            fontSize: '15px',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
            padding: 18,
            nodeSpacing: 48,
            rankSpacing: 56,
            wrappingWidth: 180,
            useMaxWidth: true,
          },
          sequence: {
            useMaxWidth: true,
            actorMargin: 28,
            boxMargin: 12,
            messageMargin: 40,
            wrap: true,
            width: 180,
            height: 56,
          },
          er: {
            useMaxWidth: true,
            entityPadding: 18,
            fontSize: 14,
          },
        });
        nodes.forEach((node) => {
          if (node.getAttribute('data-processed')) {
            node.removeAttribute('data-processed');
            if (node.dataset.mermaidSource) {
              node.textContent = node.dataset.mermaidSource;
            }
          } else {
            node.dataset.mermaidSource = node.textContent || '';
          }
        });
        await mermaid.run({ nodes: Array.from(nodes) });
        if (cancelled) return;
        fixLabelOverflow(root);
        // Second pass after fonts/layout
        requestAnimationFrame(() => {
          if (!cancelled) fixLabelOverflow(root);
        });
      } catch (e) {
        console.warn('Mermaid render failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html, docLoading]);

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
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{title}</h3>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedFile}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
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
              dangerouslySetInnerHTML={{ __html: html }}
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
