import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinkSection, Tab, TileMessage } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { SpaceModalHeader } from './SpaceFormChrome';
import {
  applyContentTransfer,
  describeContentTransfer,
  exportSectionsToFile,
  exportTabsToFile,
  mergeSectionsIntoOne,
  mergeTabsIntoOne,
  parseContentTransfer,
  splitLinksIntoSection,
  splitSectionsIntoTabs,
  type ParsedContentTransfer,
} from '../services/sectionTabTransferService';

export type SpaceContentApplyPayload = {
  tabs: Tab[];
  messages?: TileMessage[];
  /** How the change was produced (for success messaging). */
  action: 'import' | 'merge' | 'split';
};

export type SpaceContentTransferDialogProps = {
  tabs: Tab[];
  spaceTitle?: string;
  messages?: TileMessage[];
  canAddTabs?: boolean;
  canAddSections?: boolean;
  canAddLinks?: boolean;
  canDeleteTabs?: boolean;
  canDeleteSections?: boolean;
  onClose: () => void;
  /**
   * Apply imported or merged tabs (and remapped messages when tabs were merged).
   * Prefer this over onImport.
   */
  onApply: (payload: SpaceContentApplyPayload) => void | Promise<void>;
  /** @deprecated Prefer onApply. Still accepted for older call sites. */
  onImport?: (nextTabs: Tab[]) => void | Promise<void>;
};

type Mode = 'export' | 'import' | 'merge' | 'split';
type Scope = 'tabs' | 'sections';

const toggleOrdered = (ordered: string[], id: string, checked: boolean): string[] => {
  if (checked) {
    if (ordered.includes(id)) return ordered;
    return [...ordered, id];
  }
  return ordered.filter((x) => x !== id);
};

export const SpaceContentTransferDialog: React.FC<SpaceContentTransferDialogProps> = ({
  tabs,
  spaceTitle,
  messages,
  canAddTabs = true,
  canAddSections = true,
  canAddLinks = true,
  canDeleteTabs = true,
  canDeleteSections = true,
  onClose,
  onApply,
  onImport,
}) => {
  const [mode, setMode] = useState<Mode>('export');
  const [scope, setScope] = useState<Scope>('tabs');
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(() => new Set(tabs.map((t) => t.id)));
  const [sectionsSourceTabId, setSectionsSourceTabId] = useState<string>(() => tabs[0]?.id || '');
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(() => {
    const first = tabs[0];
    return new Set((first?.sections || []).map((s) => s.id));
  });

  /** Merge selection order: first id is the primary (keeps title/settings). */
  const [mergeTabIdsOrdered, setMergeTabIdsOrdered] = useState<string[]>([]);
  const [mergeSectionIdsOrdered, setMergeSectionIdsOrdered] = useState<string[]>([]);
  /** Split what: sections→tabs, or links→new section. */
  const [splitKind, setSplitKind] = useState<'sections' | 'links'>('sections');
  /** Split: sections to promote into their own tabs (selection order). */
  const [splitSectionIdsOrdered, setSplitSectionIdsOrdered] = useState<string[]>([]);
  /** Split destination: one tab per section, or all into one user-named tab. */
  const [splitDest, setSplitDest] = useState<'per-section' | 'single-tab'>('single-tab');
  const [splitNewTabTitle, setSplitNewTabTitle] = useState('');
  /** Split links: source section + selected link ids + new section name. */
  const [splitLinksSectionId, setSplitLinksSectionId] = useState<string>(
    () => tabs[0]?.sections?.[0]?.id || ''
  );
  const [splitLinkIdsOrdered, setSplitLinkIdsOrdered] = useState<string[]>([]);
  const [splitNewSectionTitle, setSplitNewSectionTitle] = useState('');
  /** Where the new section lands: same tab, another existing tab, or a new tab. */
  const [splitLinksDest, setSplitLinksDest] = useState<'same-tab' | 'existing-tab' | 'new-tab'>(
    'same-tab'
  );
  const [splitLinksTargetTabId, setSplitLinksTargetTabId] = useState<string>(
    () => tabs[0]?.id || ''
  );
  const [splitLinksNewTabTitle, setSplitLinksNewTabTitle] = useState('');

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
    setMergeSectionIdsOrdered([]);
    setSplitSectionIdsOrdered([]);
    const firstSec = tab?.sections?.[0]?.id || '';
    setSplitLinksSectionId(firstSec);
    setSplitLinkIdsOrdered([]);
  };

  const splitLinksSourceSection = useMemo(() => {
    const tab = sectionsSourceTab;
    if (!tab) return undefined;
    return (tab.sections || []).find((s) => s.id === splitLinksSectionId) || tab.sections?.[0];
  }, [sectionsSourceTab, splitLinksSectionId]);

  const switchSplitLinksSection = (sectionId: string) => {
    setSplitLinksSectionId(sectionId);
    setSplitLinkIdsOrdered([]);
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

  const applyResult = async (payload: SpaceContentApplyPayload) => {
    if (onApply) {
      await onApply(payload);
      return;
    }
    if (onImport) {
      await onImport(payload.tabs);
    }
  };

  const handleExport = () => {
    setError(null);
    try {
      if (scope === 'tabs') {
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
      await applyResult({ tabs: nextTabs, action: 'import' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleMergeConfirm = async () => {
    setError(null);
    setBusy(true);
    try {
      if (scope === 'tabs') {
        if (!canDeleteTabs) {
          throw new Error('You do not have permission to remove tabs in this space.');
        }
        const result = mergeTabsIntoOne(tabs, mergeTabIdsOrdered, messages);
        await applyResult({
          tabs: result.tabs,
          messages: result.messages,
          action: 'merge',
        });
      } else {
        if (!canDeleteSections) {
          throw new Error('You do not have permission to remove sections in this space.');
        }
        const tabId = sectionsSourceTab?.id;
        if (!tabId) {
          throw new Error('Choose a tab that has sections to merge.');
        }
        const nextTabs = mergeSectionsIntoOne(tabs, tabId, mergeSectionIdsOrdered);
        await applyResult({ tabs: nextTabs, action: 'merge' });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSplitConfirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const tabId = sectionsSourceTab?.id;
      if (!tabId) {
        throw new Error('Choose a tab to split from.');
      }

      if (splitKind === 'links') {
        if (!canAddSections) {
          throw new Error('You do not have permission to add sections to this space.');
        }
        if (splitLinksDest === 'new-tab' && !canAddTabs) {
          throw new Error('You do not have permission to add tabs to this space.');
        }
        const sectionId = splitLinksSourceSection?.id;
        if (!sectionId) {
          throw new Error('Choose a section that has links to split.');
        }
        const destination =
          splitLinksDest === 'new-tab'
            ? ({ kind: 'new-tab', newTabTitle: splitLinksNewTabTitle } as const)
            : splitLinksDest === 'existing-tab'
              ? ({ kind: 'existing-tab', targetTabId: splitLinksTargetTabId || tabId } as const)
              : ({ kind: 'same-tab' } as const);
        const nextTabs = splitLinksIntoSection(
          tabs,
          tabId,
          sectionId,
          splitLinkIdsOrdered,
          splitNewSectionTitle,
          destination
        );
        await applyResult({ tabs: nextTabs, action: 'split' });
      } else {
        if (!canAddTabs) {
          throw new Error('You do not have permission to add tabs to this space.');
        }
        const nextTabs =
          splitDest === 'single-tab'
            ? splitSectionsIntoTabs(tabs, tabId, splitSectionIdsOrdered, {
                mode: 'single-tab',
                newTabTitle: splitNewTabTitle,
              })
            : splitSectionsIntoTabs(tabs, tabId, splitSectionIdsOrdered, {
                mode: 'per-section',
              });
        await applyResult({ tabs: nextTabs, action: 'split' });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Split failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportReady =
    scope === 'tabs'
      ? selectedTabIds.size > 0
      : selectedSectionIds.size > 0 && !!sectionsSourceTab;

  const importNeedsTarget =
    parsed?.kind === 'sections' || parsed?.kind === 'links';
  const importReady =
    !!parsed &&
    (!importNeedsTarget || !!targetTab) &&
    (parsed.kind !== 'links' || !!targetSectionId);

  const mergeReady =
    scope === 'tabs'
      ? mergeTabIdsOrdered.length >= 2
      : mergeSectionIdsOrdered.length >= 2 && !!sectionsSourceTab;

  const splitLinksDestReady =
    splitLinksDest === 'same-tab' ||
    (splitLinksDest === 'existing-tab' && !!splitLinksTargetTabId) ||
    (splitLinksDest === 'new-tab' &&
      splitLinksNewTabTitle.trim().length > 0 &&
      canAddTabs);

  const splitReady =
    splitKind === 'links'
      ? splitLinkIdsOrdered.length >= 1 &&
        !!sectionsSourceTab &&
        !!splitLinksSourceSection &&
        splitNewSectionTitle.trim().length > 0 &&
        canAddSections &&
        splitLinksDestReady
      : splitSectionIdsOrdered.length >= 1 &&
        !!sectionsSourceTab &&
        canAddTabs &&
        (splitDest === 'per-section' || splitNewTabTitle.trim().length > 0);

  const primaryTabId = mergeTabIdsOrdered[0];
  const primarySectionId = mergeSectionIdsOrdered[0];

  const checklist = (
    items: Array<{ id: string; label: string; hint?: string; primary?: boolean }>,
    selected: Set<string> | string[],
    onToggle: (id: string, checked: boolean) => void,
    onSelectAll: (all: boolean) => void
  ) => {
    const isSelected = (id: string) =>
      Array.isArray(selected) ? selected.includes(id) : selected.has(id);
    return (
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
                    checked={isSelected(item.id)}
                    onChange={(e) => onToggle(item.id, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {item.label}
                      {item.primary ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold text-brand-600 dark:text-brand-400">
                          Primary
                        </span>
                      ) : null}
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
  };

  const scopeToggle = (
    <div className="flex gap-2">
      <button
        type="button"
        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
          scope === 'tabs'
            ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
        }`}
        onClick={() => setScope('tabs')}
      >
        Tabs
      </button>
      <button
        type="button"
        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
          scope === 'sections'
            ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
        }`}
        onClick={() => setScope('sections')}
      >
        Sections
      </button>
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
            subtitle={
              spaceTitle
                ? `Inside “${spaceTitle}”`
                : 'Export, import, merge, or split tabs and sections'
            }
            onClose={onClose}
          />
        </div>

        <div className="px-6 pb-2">
          <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-900/50 gap-0.5">
            {(['export', 'import', 'merge', 'split'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors capitalize ${
                  mode === m
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === 'export'
                  ? 'Export'
                  : m === 'import'
                    ? 'Import'
                    : m === 'merge'
                      ? 'Merge'
                      : 'Split'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[min(70vh,560px)] overflow-y-auto">
          {mode === 'export' ? (
            <>
              {scopeToggle}
              {scope === 'tabs' ? (
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
          ) : null}

          {mode === 'import' ? (
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
          ) : null}

          {mode === 'merge' ? (
            <>
              {scopeToggle}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select two or more. The first selected item is the <strong className="font-semibold text-slate-700 dark:text-slate-200">primary</strong> — it keeps the name and settings; content from the others is appended into it, then the others are removed.
              </p>
              {scope === 'tabs' ? (
                checklist(
                  tabs.map((t) => ({
                    id: t.id,
                    label: t.title || 'Untitled tab',
                    hint: `${t.sections?.length || 0} section${(t.sections?.length || 0) === 1 ? '' : 's'}`,
                    primary: t.id === primaryTabId,
                  })),
                  mergeTabIdsOrdered,
                  (id, checked) => setMergeTabIdsOrdered((prev) => toggleOrdered(prev, id, checked)),
                  (all) =>
                    setMergeTabIdsOrdered(all ? tabs.map((t) => t.id) : [])
                )
              ) : (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      In tab
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
                      primary: s.id === primarySectionId,
                    })),
                    mergeSectionIdsOrdered,
                    (id, checked) =>
                      setMergeSectionIdsOrdered((prev) => toggleOrdered(prev, id, checked)),
                    (all) =>
                      setMergeSectionIdsOrdered(
                        all ? (sectionsSourceTab?.sections || []).map((s) => s.id) : []
                      )
                  )}
                </div>
              )}
            </>
          ) : null}

          {mode === 'split' ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    splitKind === 'sections'
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => setSplitKind('sections')}
                >
                  Sections → tabs
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    splitKind === 'links'
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => setSplitKind('links')}
                >
                  Links → section
                </button>
              </div>

              {splitKind === 'sections' ? (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Move selected sections out of a tab. Remaining sections stay in the source tab.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                        splitDest === 'single-tab'
                          ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                      onClick={() => setSplitDest('single-tab')}
                    >
                      One named tab
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                        splitDest === 'per-section'
                          ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                      onClick={() => setSplitDest('per-section')}
                    >
                      One tab per section
                    </button>
                  </div>
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
                    {splitDest === 'single-tab' ? (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          New tab name
                        </span>
                        <input
                          type="text"
                          value={splitNewTabTitle}
                          onChange={(e) => setSplitNewTabTitle(e.target.value)}
                          placeholder="Name for the new tab"
                          className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/50"
                          autoComplete="off"
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Each selected section becomes its own tab, named after that section.
                      </p>
                    )}
                    {checklist(
                      (sectionsSourceTab?.sections || []).map((s: LinkSection) => ({
                        id: s.id,
                        label: s.title || 'Untitled section',
                        hint:
                          splitDest === 'single-tab'
                            ? `${s.links?.length || 0} link${(s.links?.length || 0) === 1 ? '' : 's'}`
                            : `${s.links?.length || 0} link${(s.links?.length || 0) === 1 ? '' : 's'} → new tab`,
                      })),
                      splitSectionIdsOrdered,
                      (id, checked) =>
                        setSplitSectionIdsOrdered((prev) => toggleOrdered(prev, id, checked)),
                      (all) =>
                        setSplitSectionIdsOrdered(
                          all ? (sectionsSourceTab?.sections || []).map((s) => s.id) : []
                        )
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Move selected links into a new named section. Choose whether that section stays in this tab, goes to another tab, or creates a new tab. Remaining links stay in the source section.
                  </p>
                  <div className="space-y-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        From tab
                      </span>
                      <select
                        className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        value={sectionsSourceTab?.id || ''}
                        onChange={(e) => {
                          switchSectionsSourceTab(e.target.value);
                          setSplitLinksTargetTabId(e.target.value);
                        }}
                      >
                        {tabs.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title || 'Untitled tab'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        From section
                      </span>
                      <select
                        className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        value={splitLinksSourceSection?.id || ''}
                        onChange={(e) => switchSplitLinksSection(e.target.value)}
                      >
                        {(sectionsSourceTab?.sections || []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title || 'Untitled section'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        New section name
                      </span>
                      <input
                        type="text"
                        value={splitNewSectionTitle}
                        onChange={(e) => setSplitNewSectionTitle(e.target.value)}
                        placeholder="Name for the new section"
                        className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/50"
                        autoComplete="off"
                      />
                    </label>
                    <div className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Put new section in
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input
                            type="radio"
                            name="split-links-dest"
                            checked={splitLinksDest === 'same-tab'}
                            onChange={() => setSplitLinksDest('same-tab')}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          Same tab
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input
                            type="radio"
                            name="split-links-dest"
                            checked={splitLinksDest === 'existing-tab'}
                            onChange={() => {
                              setSplitLinksDest('existing-tab');
                              if (!splitLinksTargetTabId) {
                                setSplitLinksTargetTabId(sectionsSourceTab?.id || tabs[0]?.id || '');
                              }
                            }}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          Existing tab
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input
                            type="radio"
                            name="split-links-dest"
                            checked={splitLinksDest === 'new-tab'}
                            onChange={() => setSplitLinksDest('new-tab')}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          New tab
                        </label>
                      </div>
                    </div>
                    {splitLinksDest === 'existing-tab' ? (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Destination tab
                        </span>
                        <select
                          className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          value={splitLinksTargetTabId}
                          onChange={(e) => setSplitLinksTargetTabId(e.target.value)}
                        >
                          {tabs.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title || 'Untitled tab'}
                              {t.id === sectionsSourceTab?.id ? ' (source)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {splitLinksDest === 'new-tab' ? (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          New tab name
                        </span>
                        <input
                          type="text"
                          value={splitLinksNewTabTitle}
                          onChange={(e) => setSplitLinksNewTabTitle(e.target.value)}
                          placeholder="Name for the new tab"
                          className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/50"
                          autoComplete="off"
                        />
                      </label>
                    ) : null}
                    {checklist(
                      (splitLinksSourceSection?.links || []).map((l) => ({
                        id: l.id,
                        label: l.label || l.url || 'Untitled link',
                        hint: l.url || undefined,
                      })),
                      splitLinkIdsOrdered,
                      (id, checked) =>
                        setSplitLinkIdsOrdered((prev) => toggleOrdered(prev, id, checked)),
                      (all) =>
                        setSplitLinkIdsOrdered(
                          all ? (splitLinksSourceSection?.links || []).map((l) => l.id) : []
                        )
                    )}
                  </div>
                </>
              )}
            </>
          ) : null}

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
          ) : null}
          {mode === 'import' ? (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
              disabled={!importReady || busy}
              onClick={() => void handleImportConfirm()}
            >
              {busy ? 'Importing…' : 'Import into space'}
            </button>
          ) : null}
          {mode === 'merge' ? (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
              disabled={!mergeReady || busy}
              onClick={() => void handleMergeConfirm()}
            >
              {busy ? 'Merging…' : 'Merge into one'}
            </button>
          ) : null}
          {mode === 'split' ? (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
              disabled={!splitReady || busy}
              onClick={() => void handleSplitConfirm()}
            >
              {busy
                ? 'Splitting…'
                : splitKind === 'links'
                  ? 'Split into new section'
                  : 'Split into new tabs'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default SpaceContentTransferDialog;
