import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinkSection, Tab } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { SpaceModalHeader } from './SpaceFormChrome';
import {
  applyContentTransfer,
  describeContentTransfer,
  exportSectionsToFile,
  exportTabsToFile,
  parseContentTransfer,
  type ParsedContentTransfer,
} from '../services/sectionTabTransferService';

export type SpaceContentTransferDialogProps = {
  tabs: Tab[];
  spaceTitle?: string;
  canAddTabs?: boolean;
  canAddSections?: boolean;
  canAddLinks?: boolean;
  onClose: () => void;
  /** Called with the merged tabs array after a successful import. */
  onImport: (nextTabs: Tab[]) => void | Promise<void>;
};

type Mode = 'export' | 'import';
type ExportScope = 'tabs' | 'sections';

export const SpaceContentTransferDialog: React.FC<SpaceContentTransferDialogProps> = ({
  tabs,
  spaceTitle,
  canAddTabs = true,
  canAddSections = true,
  canAddLinks = true,
  onClose,
  onImport,
}) => {
  const [mode, setMode] = useState<Mode>('export');
  const [exportScope, setExportScope] = useState<ExportScope>('tabs');
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(() => new Set(tabs.map((t) => t.id)));
  const [sectionsSourceTabId, setSectionsSourceTabId] = useState<string>(() => tabs[0]?.id || '');
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(() => {
    const first = tabs[0];
    return new Set((first?.sections || []).map((s) => s.id));
  });

  const [parsed, setParsed] = useState<ParsedContentTransfer | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [targetTabId, setTargetTabId] = useState<string>(() => tabs[0]?.id || '');
  const [targetSectionId, setTargetSectionId] = useState<string>(() => tabs[0]?.sections?.[0]?.id || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeToClose(true, onClose);

  const sectionsSourceTab = useMemo(
    () => tabs.find((t) => t.id === sectionsSourceTabId) || tabs[0],
    [tabs, sectionsSourceTabId]
  );

  const targetTab = useMemo(
    () => tabs.find((t) => t.id === targetTabId) || tabs[0],
    [tabs, targetTabId]
  );

  const switchSectionsSourceTab = (tabId: string) => {
    setSectionsSourceTabId(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    setSelectedSectionIds(new Set((tab?.sections || []).map((s) => s.id)));
  };

  const switchTargetTab = (tabId: string) => {
    setTargetTabId(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    setTargetSectionId(tab?.sections?.[0]?.id || '');
  };

  const toggleId = (set: Set<string>, id: string, checked: boolean): Set<string> => {
    const next = new Set(set);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  };

  const handleExport = () => {
    setError(null);
    try {
      if (exportScope === 'tabs') {
        const chosen = tabs.filter((t) => selectedTabIds.has(t.id));
        exportTabsToFile(chosen);
      } else {
        const sections = (sectionsSourceTab?.sections || []).filter((s) =>
          selectedSectionIds.has(s.id)
        );
        exportSectionsToFile(sections, sectionsSourceTab?.title);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setParsed(null);
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const next = parseContentTransfer(data);
      if (next.kind === 'tabs' && !canAddTabs) {
        throw new Error('You do not have permission to add tabs to this space.');
      }
      if (next.kind === 'sections' && !canAddSections) {
        throw new Error('You do not have permission to add sections to this space.');
      }
      if (next.kind === 'links' && !canAddLinks) {
        throw new Error('You do not have permission to add links to this space.');
      }
      setParsed(next);
      if (next.kind === 'sections' || next.kind === 'links') {
        const match = next.sourceTabTitle
          ? tabs.find((t) => t.title === next.sourceTabTitle)
          : undefined;
        if (match) switchTargetTab(match.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read this file.');
    }
  };

  const handleImportConfirm = async () => {
    if (!parsed) return;
    setError(null);
    setBusy(true);
    try {
      const nextTabs = applyContentTransfer(tabs, parsed, {
        targetTabId: targetTab?.id,
        targetSectionId,
      });
      await onImport(nextTabs);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportReady =
    exportScope === 'tabs'
      ? selectedTabIds.size > 0
      : selectedSectionIds.size > 0 && !!sectionsSourceTab;

  const importNeedsTarget =
    parsed?.kind === 'sections' || parsed?.kind === 'links';
  const importReady =
    !!parsed &&
    (!importNeedsTarget || !!targetTab) &&
    (parsed.kind !== 'links' || !!targetSectionId);

  const checklist = (items: Array<{ id: string; label: string; hint?: string }>, selected: Set<string>, onToggle: (id: string, checked: boolean) => void, onSelectAll: (all: boolean) => void) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Select items
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
            onClick={() => onSelectAll(true)}
          >
            Select all
          </button>
          <button
            type="button"
            className="text-xs text-slate-500 hover:underline"
            onClick={() => onSelectAll(false)}
          >
            Clear
          </button>
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/80">
        {items.length === 0 ? (
          <li className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">Nothing to list.</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={selected.has(item.id)}
                  onChange={(e) => onToggle(item.id, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{item.hint}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  );

  const modal = (
    <div
      className="fixed inset-0 z-[100050] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="space-content-transfer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 pt-6">
          <SpaceModalHeader
            emoji="📦"
            eyebrow="Space transfer"
            title="Tabs & sections"
            subtitle={spaceTitle ? `Inside “${spaceTitle}”` : 'Export or import JSON inside this space'}
            onClose={onClose}
          />
        </div>

        <div className="px-6 pb-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-900/50">
            <button
              type="button"
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                mode === 'export'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              onClick={() => {
                setMode('export');
                setError(null);
              }}
            >
              Export
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                mode === 'import'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              onClick={() => {
                setMode('import');
                setError(null);
              }}
            >
              Import
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[min(70vh,560px)] overflow-y-auto">
          {mode === 'export' ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    exportScope === 'tabs'
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => setExportScope('tabs')}
                >
                  Tabs
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    exportScope === 'sections'
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => setExportScope('sections')}
                >
                  Sections
                </button>
              </div>

              {exportScope === 'tabs' ? (
                checklist(
                  tabs.map((t) => ({
                    id: t.id,
                    label: t.title || 'Untitled tab',
                    hint: `${t.sections?.length || 0} section${(t.sections?.length || 0) === 1 ? '' : 's'}`,
                  })),
                  selectedTabIds,
                  (id, checked) => setSelectedTabIds((prev) => toggleId(prev, id, checked)),
                  (all) =>
                    setSelectedTabIds(all ? new Set(tabs.map((t) => t.id)) : new Set())
                )
              ) : (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      From tab
                    </span>
                    <select
                      className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      value={sectionsSourceTab?.id || ''}
                      onChange={(e) => switchSectionsSourceTab(e.target.value)}
                    >
                      {tabs.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title || 'Untitled tab'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {checklist(
                    (sectionsSourceTab?.sections || []).map((s: LinkSection) => ({
                      id: s.id,
                      label: s.title || 'Untitled section',
                      hint: `${s.links?.length || 0} link${(s.links?.length || 0) === 1 ? '' : 's'}`,
                    })),
                    selectedSectionIds,
                    (id, checked) => setSelectedSectionIds((prev) => toggleId(prev, id, checked)),
                    (all) =>
                      setSelectedSectionIds(
                        all
                          ? new Set((sectionsSourceTab?.sections || []).map((s) => s.id))
                          : new Set()
                      )
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 p-4 text-center space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Choose a LinkNest JSON file exported from a tab, tabs, section, sections, or section links.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => void handleFileChosen(e)}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose JSON file
                </button>
                {importFileName ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{importFileName}</p>
                ) : null}
              </div>

              {parsed ? (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-3 space-y-3">
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                    Ready to import: {describeContentTransfer(parsed)}
                  </p>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
                    Items are added as copies with new ids. Existing tabs and sections are left in place.
                  </p>

                  {(parsed.kind === 'sections' || parsed.kind === 'links') && (
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                        Add into tab
                      </span>
                      <select
                        className="w-full rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        value={targetTab?.id || ''}
                        onChange={(e) => switchTargetTab(e.target.value)}
                      >
                        {tabs.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title || 'Untitled tab'}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {parsed.kind === 'links' && (
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                        Add into section
                      </span>
                      <select
                        className="w-full rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        value={targetSectionId}
                        onChange={(e) => setTargetSectionId(e.target.value)}
                      >
                        {(targetTab?.sections || []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title || 'Untitled section'}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </p>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {mode === 'export' ? (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
              disabled={!exportReady}
              onClick={handleExport}
            >
              Download JSON
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
              disabled={!importReady || busy}
              onClick={() => void handleImportConfirm()}
            >
              {busy ? 'Importing…' : 'Import into space'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default SpaceContentTransferDialog;
