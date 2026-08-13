import React, { useEffect, useRef, useState } from 'react';
import { Tab, LinkSection, Link, RichTextContent } from '../types';
import { exportSectionLinksToFile, exportTabToFile } from '../services/sectionTabTransferService';
import { TitleEmojiPicker } from './TitleEmojiPicker';

export type HierarchyViewMode = 'cards' | 'tree' | 'compact';

const STORAGE_KEY = 'linknest.tileEditHierarchyView';

export function readHierarchyViewPreference(): HierarchyViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'cards' || v === 'tree' || v === 'compact') return v;
  } catch {
    /* ignore */
  }
  return 'tree';
}

export function writeHierarchyViewPreference(mode: HierarchyViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function stripHtml(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const div = document.createElement('div');
  div.innerHTML = content;
  return (div.textContent || div.innerText || '').trim();
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function getSortedItems(section: LinkSection): Array<
  (Link & { itemType: 'link' }) | (RichTextContent & { itemType: 'rich-text' })
> {
  const links = (section.links || []).map((l) => ({ ...l, itemType: 'link' as const }));
  const richText = (section.richTextContent || []).map((r) => ({ ...r, itemType: 'rich-text' as const }));
  return [...links, ...richText].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function matchesSearch(link: Link, term: string): boolean {
  if (!term) return true;
  const q = term.toLowerCase();
  return (
    stripHtml(link.label).toLowerCase().includes(q) ||
    (link.url || '').toLowerCase().includes(q)
  );
}

const Chevron: React.FC<{ open: boolean; className?: string }> = ({ open, className = '' }) => (
  <svg
    className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''} ${className}`}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
      clipRule="evenodd"
    />
  </svg>
);

const OverflowMenu: React.FC<{
  label: string;
  items: Array<{ id: string; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }>;
}> = ({ label, items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60"
        title={label}
        aria-label={label}
        aria-expanded={open}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const HierarchyViewSwitcher: React.FC<{
  value: HierarchyViewMode;
  onChange: (mode: HierarchyViewMode) => void;
}> = ({ value, onChange }) => {
  const options: Array<{ id: HierarchyViewMode; label: string; icon: React.ReactNode }> = [
    {
      id: 'cards',
      label: 'Cards',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      id: 'tree',
      label: 'Tree',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      ),
    },
    {
      id: 'compact',
      label: 'Compact',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100/80 dark:bg-slate-900/60"
      role="tablist"
      aria-label="Hierarchy view"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              active
                ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={`${opt.label} view`}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export interface TileHierarchyViewsProps {
  mode: 'tree' | 'compact';
  tabs: Tab[];
  expandedTabs: Set<string>;
  expandedSections: Set<string>;
  selectedLinkIds: string[];
  linkSearchTerm: string;
  canDeleteTabs: boolean;
  onToggleTab: (tabId: string) => void;
  onToggleSection: (sectionId: string) => void;
  onAddSection: (tabId: string) => void;
  onRemoveTab: (tabId: string) => void;
  onRemoveSection: (tabId: string, sectionId: string) => void;
  onCloneTab: (tabId: string) => void;
  onCloneSection: (tabId: string, sectionId: string) => void;
  onCloneLink: (tabId: string, sectionId: string, linkId: string) => void;
  onRemoveLink: (tabId: string, sectionId: string, linkId: string) => void;
  onMoveTab: (tabId: string, direction: 'up' | 'down') => void;
  onMoveSection: (tabId: string, sectionId: string, direction: 'up' | 'down') => void;
  onMoveItem: (tabId: string, sectionId: string, itemId: string, direction: 'up' | 'down') => void;
  onUpdateTabColor: (tabId: string, color: string) => void;
  onUpdateTabEmoji: (tabId: string, emoji: string) => void;
  onUpdateSectionColor: (tabId: string, sectionId: string, color: string) => void;
  onUpdateSectionEmoji: (tabId: string, sectionId: string, emoji: string) => void;
  onToggleForceStacked: (tabId: string, sectionId: string, value: boolean) => void;
  onImportTab: (afterTabId: string) => void;
  onImportSection: (tabId: string, sectionId: string) => void;
  onScheduleTab: (tabId: string) => void;
  onScheduleSection: (tabId: string, sectionId: string) => void;
  onScheduleLink: (tabId: string, sectionId: string, linkId: string) => void;
  onVisibilityTab: (tabId: string) => void;
  onVisibilitySection: (tabId: string, sectionId: string) => void;
  onEditLink: (tabId: string, sectionId: string, link: Link) => void;
  onEditRichText: (tabId: string, sectionId: string, richTextId: string) => void;
  onDeleteRichText: (tabId: string, sectionId: string, richTextId: string) => void;
  onCloneRichText: (tabId: string, sectionId: string, richTextId: string) => void;
  onAddLink: (tabId: string, sectionId: string) => void;
  onAddRichText: (tabId: string, sectionId: string) => void;
  onToggleLinkSelection: (linkId: string) => void;
  onToggleFavorite?: (linkId: string) => void;
}

export const TileHierarchyViews: React.FC<TileHierarchyViewsProps> = (props) => {
  const { mode, tabs, linkSearchTerm } = props;
  const isCompact = mode === 'compact';

  if (tabs.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 text-sm">
        No tabs yet. Click “Add Tab” to get started.
      </div>
    );
  }

  return (
    <div
      className={
        isCompact
          ? 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/80'
          : 'space-y-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-2'
      }
    >
      {tabs
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((tab, tabIndex) => (
          <TabNode
            key={tab.id}
            tab={tab}
            tabIndex={tabIndex}
            tabCount={tabs.length}
            isCompact={isCompact}
            {...props}
            linkSearchTerm={linkSearchTerm}
          />
        ))}
    </div>
  );
};

const TabNode: React.FC<
  TileHierarchyViewsProps & { tab: Tab; tabIndex: number; tabCount: number; isCompact: boolean }
> = ({
  tab,
  tabIndex,
  tabCount,
  isCompact,
  expandedTabs,
  expandedSections,
  linkSearchTerm,
  canDeleteTabs,
  onToggleTab,
  onToggleSection,
  onAddSection,
  onRemoveTab,
  onRemoveSection,
  onCloneTab,
  onCloneSection,
  onCloneLink,
  onRemoveLink,
  onMoveTab,
  onMoveSection,
  onMoveItem,
  onUpdateTabColor,
  onUpdateTabEmoji,
  onUpdateSectionColor,
  onUpdateSectionEmoji,
  onToggleForceStacked,
  onImportTab,
  onImportSection,
  onScheduleTab,
  onScheduleSection,
  onScheduleLink,
  onVisibilityTab,
  onVisibilitySection,
  onEditLink,
  onEditRichText,
  onDeleteRichText,
  onCloneRichText,
  onAddLink,
  onAddRichText,
  onToggleLinkSelection,
  onToggleFavorite,
  selectedLinkIds,
}) => {
  const open = expandedTabs.has(tab.id);
  const sections = [...(tab.sections || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const rowPad = isCompact ? 'px-3 py-2' : 'px-2.5 py-2';
  const rowHover = 'hover:bg-white dark:hover:bg-slate-800/70';

  return (
    <div className={isCompact ? '' : 'rounded-lg'}>
      <div
        id={`tab-${tab.id}`}
        className={`group flex items-center gap-2 ${rowPad} ${rowHover} ${
          isCompact ? '' : 'rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600'
        }`}
      >
        <button
          type="button"
          onClick={() => onToggleTab(tab.id)}
          className="p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700"
          aria-expanded={open}
          title={open ? 'Collapse tab' : 'Expand tab'}
        >
          <Chevron open={open} />
        </button>
        <span
          className="w-2 h-2 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-800"
          style={{ backgroundColor: tab.textColor || '#64748b' }}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => onToggleTab(tab.id)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
              Tab {tabIndex + 1}
            </span>
            <span
              className={`text-sm font-semibold truncate ${isCompact ? 'text-slate-800 dark:text-slate-100' : 'text-slate-900 dark:text-white'}`}
              style={tab.textColor ? { color: tab.textColor } : undefined}
            >
              {tab.emoji ? <span className="mr-1" aria-hidden>{tab.emoji}</span> : null}
              {tab.title || 'Untitled tab'}
            </span>
            <span className="text-[10px] text-slate-400 shrink-0">
              {sections.length} section{sections.length !== 1 ? 's' : ''}
            </span>
            {tab.published === false && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                Unpublished
              </span>
            )}
          </div>
        </button>
        <TitleEmojiPicker
          value={tab.emoji || ''}
          onChange={(emoji) => onUpdateTabEmoji(tab.id, emoji)}
          size="sm"
          title="Tab emoji"
        />
        <input
          type="color"
          value={tab.textColor && tab.textColor.trim() ? tab.textColor : '#000000'}
          onChange={(e) => onUpdateTabColor(tab.id, e.target.value)}
          className="w-6 h-6 rounded border border-slate-200 dark:border-slate-600 cursor-pointer shrink-0"
          title="Tab color"
          onClick={(e) => e.stopPropagation()}
        />
        <OverflowMenu
          label="Tab actions"
          items={[
            { id: 'move-up', label: 'Move up', onClick: () => onMoveTab(tab.id, 'up'), disabled: tabIndex === 0 },
            { id: 'move-down', label: 'Move down', onClick: () => onMoveTab(tab.id, 'down'), disabled: tabIndex >= tabCount - 1 },
            { id: 'clone', label: 'Clone tab', onClick: () => onCloneTab(tab.id) },
            { id: 'import', label: 'Import tab (JSON)', onClick: () => onImportTab(tab.id) },
            { id: 'export', label: 'Export tab (JSON)', onClick: () => exportTabToFile(tab) },
            { id: 'schedule', label: 'Schedule…', onClick: () => onScheduleTab(tab.id) },
            { id: 'visibility', label: 'Visibility…', onClick: () => onVisibilityTab(tab.id) },
            { id: 'clear-color', label: 'Clear color', onClick: () => onUpdateTabColor(tab.id, '') },
            {
              id: 'delete',
              label: 'Delete tab',
              danger: true,
              disabled: !canDeleteTabs || tabCount <= 1,
              onClick: () => onRemoveTab(tab.id),
            },
          ]}
        />
      </div>

      {open && (
        <div className={isCompact ? 'bg-slate-50/80 dark:bg-slate-900/40' : 'ml-3 pl-3 border-l-2 border-slate-200 dark:border-slate-600 space-y-0.5 pb-2'}>
          {sections.map((section, sectionIndex) => (
            <SectionNode
              key={section.id}
              tab={tab}
              section={section}
              sectionIndex={sectionIndex}
              sectionCount={sections.length}
              isCompact={isCompact}
              expanded={expandedSections.has(section.id)}
              linkSearchTerm={linkSearchTerm}
              selectedLinkIds={selectedLinkIds}
              onToggleSection={onToggleSection}
              onRemoveSection={onRemoveSection}
              onCloneSection={onCloneSection}
              onCloneLink={onCloneLink}
              onRemoveLink={onRemoveLink}
              onMoveSection={onMoveSection}
              onMoveItem={onMoveItem}
              onUpdateSectionColor={onUpdateSectionColor}
              onUpdateSectionEmoji={onUpdateSectionEmoji}
              onToggleForceStacked={onToggleForceStacked}
              onImportSection={onImportSection}
              onScheduleSection={onScheduleSection}
              onScheduleLink={onScheduleLink}
              onVisibilitySection={onVisibilitySection}
              onEditLink={onEditLink}
              onEditRichText={onEditRichText}
              onDeleteRichText={onDeleteRichText}
              onCloneRichText={onCloneRichText}
              onAddLink={onAddLink}
              onAddRichText={onAddRichText}
              onToggleLinkSelection={onToggleLinkSelection}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
          {sections.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-2">No sections in this tab.</p>
          )}
          <div className={`flex flex-wrap gap-2 ${isCompact ? 'px-3 py-2' : 'pt-1'}`}>
            <button
              type="button"
              onClick={() => onAddSection(tab.id)}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              + Add Section
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SectionNode: React.FC<{
  tab: Tab;
  section: LinkSection;
  sectionIndex: number;
  sectionCount: number;
  isCompact: boolean;
  expanded: boolean;
  linkSearchTerm: string;
  selectedLinkIds: string[];
  onToggleSection: (sectionId: string) => void;
  onRemoveSection: (tabId: string, sectionId: string) => void;
  onCloneSection: (tabId: string, sectionId: string) => void;
  onCloneLink: (tabId: string, sectionId: string, linkId: string) => void;
  onRemoveLink: (tabId: string, sectionId: string, linkId: string) => void;
  onMoveSection: (tabId: string, sectionId: string, direction: 'up' | 'down') => void;
  onMoveItem: (tabId: string, sectionId: string, itemId: string, direction: 'up' | 'down') => void;
  onUpdateSectionColor: (tabId: string, sectionId: string, color: string) => void;
  onUpdateSectionEmoji: (tabId: string, sectionId: string, emoji: string) => void;
  onToggleForceStacked: (tabId: string, sectionId: string, value: boolean) => void;
  onImportSection: (tabId: string, sectionId: string) => void;
  onScheduleSection: (tabId: string, sectionId: string) => void;
  onScheduleLink: (tabId: string, sectionId: string, linkId: string) => void;
  onVisibilitySection: (tabId: string, sectionId: string) => void;
  onEditLink: (tabId: string, sectionId: string, link: Link) => void;
  onEditRichText: (tabId: string, sectionId: string, richTextId: string) => void;
  onDeleteRichText: (tabId: string, sectionId: string, richTextId: string) => void;
  onCloneRichText: (tabId: string, sectionId: string, richTextId: string) => void;
  onAddLink: (tabId: string, sectionId: string) => void;
  onAddRichText: (tabId: string, sectionId: string) => void;
  onToggleLinkSelection: (linkId: string) => void;
  onToggleFavorite?: (linkId: string) => void;
}> = ({
  tab,
  section,
  sectionIndex,
  sectionCount,
  isCompact,
  expanded,
  linkSearchTerm,
  selectedLinkIds,
  onToggleSection,
  onRemoveSection,
  onCloneSection,
  onCloneLink,
  onRemoveLink,
  onMoveSection,
  onMoveItem,
  onUpdateSectionColor,
  onUpdateSectionEmoji,
  onToggleForceStacked,
  onImportSection,
  onScheduleSection,
  onScheduleLink,
  onVisibilitySection,
  onEditLink,
  onEditRichText,
  onDeleteRichText,
  onCloneRichText,
  onAddLink,
  onAddRichText,
  onToggleLinkSelection,
  onToggleFavorite,
}) => {
  const items = getSortedItems(section);
  const filtered = linkSearchTerm
    ? items.filter((item) => (item.itemType === 'link' ? matchesSearch(item, linkSearchTerm) : true))
    : items;

  const accent = section.textColor || '#3b82f6';

  return (
    <div>
      <div
        className={`group flex items-center gap-2 ${isCompact ? 'px-3 py-1.5 pl-6' : 'px-2 py-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800/60'}`}
        style={!isCompact ? { borderLeft: `3px solid ${accent}` } : undefined}
      >
        <button
          type="button"
          onClick={() => onToggleSection(section.id)}
          className="p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700"
          aria-expanded={expanded}
        >
          <Chevron open={expanded} />
        </button>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} aria-hidden />
        <button type="button" onClick={() => onToggleSection(section.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 shrink-0">§{sectionIndex + 1}</span>
            <span
              className="text-sm font-medium truncate text-slate-800 dark:text-slate-100"
              style={section.textColor ? { color: section.textColor } : undefined}
            >
              {section.emoji ? <span className="mr-1" aria-hidden>{section.emoji}</span> : null}
              {section.title || 'Untitled section'}
            </span>
            <span className="text-[10px] text-slate-400 shrink-0">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
            {section.forceStackedView && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                Stacked
              </span>
            )}
          </div>
        </button>
        <TitleEmojiPicker
          value={section.emoji || ''}
          onChange={(emoji) => onUpdateSectionEmoji(tab.id, section.id, emoji)}
          size="sm"
          title="Section emoji"
        />
        <input
          type="color"
          value={section.textColor && section.textColor.trim() ? section.textColor : '#000000'}
          onChange={(e) => onUpdateSectionColor(tab.id, section.id, e.target.value)}
          className="w-5 h-5 rounded border border-slate-200 dark:border-slate-600 cursor-pointer shrink-0"
          title="Section color"
          onClick={(e) => e.stopPropagation()}
        />
        <OverflowMenu
          label="Section actions"
          items={[
            {
              id: 'move-up',
              label: 'Move up',
              onClick: () => onMoveSection(tab.id, section.id, 'up'),
              disabled: sectionIndex === 0,
            },
            {
              id: 'move-down',
              label: 'Move down',
              onClick: () => onMoveSection(tab.id, section.id, 'down'),
              disabled: sectionIndex >= sectionCount - 1,
            },
            { id: 'clone', label: 'Clone section', onClick: () => onCloneSection(tab.id, section.id) },
            { id: 'import', label: 'Import links (JSON/CSV)', onClick: () => onImportSection(tab.id, section.id) },
            { id: 'export', label: 'Export links (JSON)', onClick: () => exportSectionLinksToFile(section) },
            { id: 'schedule', label: 'Schedule…', onClick: () => onScheduleSection(tab.id, section.id) },
            { id: 'visibility', label: 'Visibility…', onClick: () => onVisibilitySection(tab.id, section.id) },
            {
              id: 'stacked',
              label: section.forceStackedView ? 'Disable force stacked' : 'Force stacked view',
              onClick: () => onToggleForceStacked(tab.id, section.id, !section.forceStackedView),
            },
            {
              id: 'clear-color',
              label: 'Clear color',
              onClick: () => onUpdateSectionColor(tab.id, section.id, ''),
            },
            {
              id: 'delete',
              label: 'Delete section',
              danger: true,
              onClick: () => onRemoveSection(tab.id, section.id),
            },
          ]}
        />
      </div>

      {expanded && (
        <div className={isCompact ? 'bg-white/50 dark:bg-slate-800/20' : 'ml-4 pl-3 border-l border-dashed border-slate-200 dark:border-slate-600 space-y-0.5 pb-1'}>
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-1.5 pl-8">
              {linkSearchTerm ? 'No matching links in this section.' : 'No items yet.'}
            </p>
          )}
          {filtered.map((item, itemIndex) => {
            if (item.itemType === 'rich-text') {
              const title =
                item.boxTitle?.trim() ||
                stripHtml(item.content || '').slice(0, 48) ||
                'Rich text';
              return (
                <div
                  key={item.id}
                  id={`link-${item.id}`}
                  className={`flex items-center gap-2 ${isCompact ? 'px-3 py-1 pl-10' : 'px-2 py-1 rounded hover:bg-violet-50/80 dark:hover:bg-violet-950/20'}`}
                >
                  <span className="text-sm shrink-0" aria-hidden>
                    📄
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-violet-800 dark:text-violet-200 truncate">{title}</div>
                    <div className="text-[10px] text-slate-400">Rich text</div>
                  </div>
                  <OverflowMenu
                    label="Rich text actions"
                    items={[
                      {
                        id: 'up',
                        label: 'Move up',
                        onClick: () => onMoveItem(tab.id, section.id, item.id, 'up'),
                        disabled: itemIndex === 0,
                      },
                      {
                        id: 'down',
                        label: 'Move down',
                        onClick: () => onMoveItem(tab.id, section.id, item.id, 'down'),
                        disabled: itemIndex >= filtered.length - 1,
                      },
                      {
                        id: 'edit',
                        label: 'Edit',
                        onClick: () => onEditRichText(tab.id, section.id, item.id),
                      },
                      {
                        id: 'clone',
                        label: 'Clone',
                        onClick: () => onCloneRichText(tab.id, section.id, item.id),
                      },
                      {
                        id: 'delete',
                        label: 'Delete',
                        danger: true,
                        onClick: () => onDeleteRichText(tab.id, section.id, item.id),
                      },
                    ]}
                  />
                </div>
              );
            }

            const link = item as Link & { itemType: 'link' };
            const selected = selectedLinkIds.includes(link.id);
            return (
              <div
                key={link.id}
                id={`link-${link.id}`}
                className={`flex items-center gap-2 ${isCompact ? 'px-3 py-1 pl-10' : 'px-2 py-1 rounded hover:bg-sky-50/80 dark:hover:bg-sky-950/20'} ${
                  selected ? 'bg-brand-50/80 dark:bg-brand-950/20' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleLinkSelection(link.id)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-sm shrink-0" aria-hidden>
                  {link.icon || '🔗'}
                </span>
                <button
                  type="button"
                  onClick={() => onEditLink(tab.id, section.id, link)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div
                    className="text-xs font-medium truncate"
                    style={link.textColor ? { color: link.textColor } : undefined}
                    dangerouslySetInnerHTML={{ __html: link.label || 'Untitled link' }}
                  />
                  <div className="text-[10px] text-slate-400 truncate">{hostFromUrl(link.url || '')}</div>
                </button>
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(link.id);
                    }}
                    className="p-1 text-slate-300 hover:text-rose-500"
                    title="Favorite"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.427 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.927-2.045 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
                    </svg>
                  </button>
                )}
                <OverflowMenu
                  label="Link actions"
                  items={[
                    {
                      id: 'up',
                      label: 'Move up',
                      onClick: () => onMoveItem(tab.id, section.id, link.id, 'up'),
                      disabled: itemIndex === 0,
                    },
                    {
                      id: 'down',
                      label: 'Move down',
                      onClick: () => onMoveItem(tab.id, section.id, link.id, 'down'),
                      disabled: itemIndex >= filtered.length - 1,
                    },
                    { id: 'edit', label: 'Edit link', onClick: () => onEditLink(tab.id, section.id, link) },
                    { id: 'clone', label: 'Clone', onClick: () => onCloneLink(tab.id, section.id, link.id) },
                    {
                      id: 'schedule',
                      label: 'Schedule…',
                      onClick: () => onScheduleLink(tab.id, section.id, link.id),
                    },
                    {
                      id: 'delete',
                      label: 'Delete',
                      danger: true,
                      onClick: () => onRemoveLink(tab.id, section.id, link.id),
                    },
                  ]}
                />
              </div>
            );
          })}
          <div className={`flex flex-wrap gap-3 ${isCompact ? 'px-3 py-1.5 pl-10' : 'px-2 py-1'}`}>
            <button
              type="button"
              onClick={() => onAddLink(tab.id, section.id)}
              className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              + Add Link
            </button>
            <button
              type="button"
              onClick={() => onAddRichText(tab.id, section.id)}
              className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              + Add Rich Text
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
