import React from 'react';
import { LinkSection, Tab } from '../types';
import { AccessRestrictionsBadge } from './AccessRestrictionsEditor';
import { ShortUrlActions } from './ShortUrlActions';
import { exportSectionLinksToFile, exportTabToFile } from '../services/sectionTabTransferService';
import { effectiveShowShortUrls } from '../utils/urlDisplay';

const iconBtn =
    'inline-flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500';

export const ShortUrlInheritToggle: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    title?: string;
}> = ({ checked, onChange, title }) => (
    <label
        className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 select-none"
        title={title || 'On: inherit short URLs from the parent. Off: show original URLs for this item.'}
        onClick={(e) => e.stopPropagation()}
    >
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 text-orange-500 bg-slate-100 border-slate-300 rounded focus:ring-orange-500 dark:bg-slate-700 dark:border-slate-600"
        />
        <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Short URLs</span>
    </label>
);

const ConvertToSpaceIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M2 4.25A2.25 2.25 0 014.25 2h2.5A2.25 2.25 0 019 4.25v2.5A2.25 2.25 0 016.75 9h-2.5A2.25 2.25 0 012 6.75v-2.5zM11 4.25A2.25 2.25 0 0113.25 2h2.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9h-2.5A2.25 2.25 0 0111 6.75v-2.5zM2 13.25A2.25 2.25 0 014.25 11h2.5A2.25 2.25 0 019 13.25v2.5A2.25 2.25 0 016.75 18h-2.5A2.25 2.25 0 012 15.75v-2.5zM12.25 11.75a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2a.75.75 0 00-1.5 0v2h-2z" />
    </svg>
);

const CloneIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
    </svg>
);

const ImportIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const ExportIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
);

const CalendarIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
    </svg>
);

const PencilIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

export interface HierarchyToolbarHandlers {
    showShortUrls: boolean;
    canRecycleShortUrl: boolean;
    canConvert: boolean;
    canDeleteTabs: boolean;
    canDeleteSections: boolean;
    shortOf: (type: 'tab' | 'section', id: string, current?: string) => string;
    onRecycledShortUrl: (type: 'tab' | 'section', id: string, shortUrl: string) => void;
    onConvertTabToSpace: (tabId: string) => void;
    onConvertSectionToSpace: (tabId: string, sectionId: string) => void;
    onCloneTab: (tabId: string) => void;
    onCloneSection: (tabId: string, sectionId: string) => void;
    onRemoveTab: (tabId: string) => void;
    onRemoveSection: (tabId: string, sectionId: string) => void;
    onImportTab: (tabId: string) => void;
    onImportSection: (tabId: string, sectionId: string) => void;
    onScheduleTab: (tabId: string) => void;
    onScheduleSection: (tabId: string, sectionId: string) => void;
    onVisibilityTab: (tabId: string) => void;
    onVisibilitySection: (tabId: string, sectionId: string) => void;
    onRestrictionsTab: (tabId: string) => void;
    importingSectionLinks?: Record<string, boolean>;
}

interface TabToolbarProps {
    tab: Tab;
    tabCount: number;
    isAdmin?: boolean;
    handlers: HierarchyToolbarHandlers;
    onInheritShortUrls: (inherit: boolean) => void;
    onColorChange: (color: string) => void;
}

export const TabEditActionToolbar: React.FC<TabToolbarProps> = ({
    tab,
    tabCount,
    isAdmin,
    handlers,
    onInheritShortUrls,
    onColorChange,
}) => {
    const showShorts = effectiveShowShortUrls(handlers.showShortUrls, tab);
    const deleteDisabled = tabCount <= 1;

    return (
        <div
            className="flex items-center gap-0.5 flex-wrap max-w-full [&>*]:shrink-0 px-3 pb-2"
            onClick={(e) => e.stopPropagation()}
        >
            {handlers.canConvert && (
                <button
                    type="button"
                    onClick={() => handlers.onConvertTabToSpace(tab.id)}
                    className={`${iconBtn} p-2`}
                    style={{ minHeight: 44, minWidth: 44 }}
                    title="Convert tab to independent space"
                >
                    <ConvertToSpaceIcon />
                </button>
            )}
            <ShortUrlInheritToggle
                checked={tab.inheritShortUrls !== false}
                title="On: inherit short URLs from the space. Off: show original URLs for this tab."
                onChange={onInheritShortUrls}
            />
            {showShorts ? (
                <ShortUrlActions
                    targetType="tab"
                    targetId={tab.id}
                    shortUrl={handlers.shortOf('tab', tab.id, tab.shortUrl)}
                    canRecycle={handlers.canRecycleShortUrl}
                    compact
                    onRecycled={({ shortUrl }) => handlers.onRecycledShortUrl('tab', tab.id, shortUrl)}
                />
            ) : null}
            <label
                className="cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                title="Choose text color for this tab"
                style={{ minHeight: 44 }}
            >
                <input
                    type="color"
                    value={tab.textColor && tab.textColor.trim() ? tab.textColor : '#000000'}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">Color</span>
            </label>
            {tab.textColor ? (
                <button
                    type="button"
                    onClick={() => onColorChange('')}
                    className={`${iconBtn} p-2`}
                    style={{ minHeight: 44, minWidth: 44 }}
                    title="Remove color"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            ) : null}
            <button type="button" onClick={() => handlers.onCloneTab(tab.id)} className={`${iconBtn} p-2`} style={{ minHeight: 44, minWidth: 44 }} title="Clone Tab">
                <CloneIcon />
            </button>
            <button type="button" onClick={() => handlers.onImportTab(tab.id)} className={`${iconBtn} p-2`} style={{ minHeight: 44, minWidth: 44 }} title="Import tab from JSON (inserts after this tab)">
                <ImportIcon />
            </button>
            <button type="button" onClick={() => exportTabToFile(tab)} className={`${iconBtn} p-2`} style={{ minHeight: 44, minWidth: 44 }} title="Export tab as JSON">
                <ExportIcon />
            </button>
            <button type="button" onClick={() => handlers.onScheduleTab(tab.id)} className={`${iconBtn} p-2 hover:text-green-600 dark:hover:text-green-400`} style={{ minHeight: 44, minWidth: 44 }} title="Schedule Tab">
                <CalendarIcon />
            </button>
            {(tab.visibleFrom || tab.expiresAt) && (
                <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">📅 Scheduled</span>
            )}
            {tab.visibility && tab.visibility !== 'public' && (
                <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    {tab.visibility === 'authenticated' ? 'Auth' : 'Restricted'}
                </span>
            )}
            {isAdmin && tab.published === false && (
                <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">Unpublished</span>
            )}
            <button type="button" onClick={() => handlers.onVisibilityTab(tab.id)} className={`${iconBtn} p-2 hover:text-blue-600 dark:hover:text-blue-400`} style={{ minHeight: 44, minWidth: 44 }} title="Set Tab Visibility">
                <PencilIcon />
            </button>
            <button type="button" onClick={() => handlers.onRestrictionsTab(tab.id)} className={`${iconBtn} p-2 hover:text-amber-600 dark:hover:text-amber-400`} style={{ minHeight: 44, minWidth: 44 }} title="Tab access restrictions">
                <span className="text-base leading-none">🛡️</span>
            </button>
            <AccessRestrictionsBadge rules={tab.accessRestrictions} />
            {handlers.canDeleteTabs && (
                <button
                    type="button"
                    onClick={() => handlers.onRemoveTab(tab.id)}
                    disabled={deleteDisabled}
                    className={`${iconBtn} p-2 hover:text-red-500`}
                    style={{ minHeight: 44, minWidth: 44 }}
                    title={deleteDisabled ? 'Cannot delete the last tab' : 'Delete Tab'}
                >
                    <TrashIcon />
                </button>
            )}
        </div>
    );
};

interface SectionToolbarProps {
    tab: Tab;
    section: LinkSection;
    isAdmin?: boolean;
    handlers: HierarchyToolbarHandlers;
    onInheritShortUrls: (inherit: boolean) => void;
    onColorChange: (color: string) => void;
    onForceStackedChange: (value: boolean) => void;
}

export const SectionEditActionToolbar: React.FC<SectionToolbarProps> = ({
    tab,
    section,
    isAdmin,
    handlers,
    onInheritShortUrls,
    onColorChange,
    onForceStackedChange,
}) => {
    const showShorts = effectiveShowShortUrls(handlers.showShortUrls, tab, section);
    const importing = !!handlers.importingSectionLinks?.[section.id];

    return (
        <div
            className="flex items-center gap-0.5 flex-wrap max-w-full [&>*]:shrink-0 px-3 pb-2"
            onClick={(e) => e.stopPropagation()}
        >
            {handlers.canConvert && (
                <button
                    type="button"
                    onClick={() => handlers.onConvertSectionToSpace(tab.id, section.id)}
                    className={`${iconBtn} p-2`}
                    style={{ minHeight: 44, minWidth: 44 }}
                    title="Convert section to independent space"
                >
                    <ConvertToSpaceIcon />
                </button>
            )}
            <ShortUrlInheritToggle
                checked={section.inheritShortUrls !== false}
                title="On: inherit short URLs from the tab/space. Off: show original URLs for this section."
                onChange={onInheritShortUrls}
            />
            {showShorts ? (
                <ShortUrlActions
                    targetType="section"
                    targetId={section.id}
                    shortUrl={handlers.shortOf('section', section.id, section.shortUrl)}
                    canRecycle={handlers.canRecycleShortUrl}
                    compact
                    onRecycled={({ shortUrl }) => handlers.onRecycledShortUrl('section', section.id, shortUrl)}
                />
            ) : null}
            <label
                className="cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                title="Choose text color for this section"
                style={{ minHeight: 44 }}
            >
                <input
                    type="color"
                    value={section.textColor && section.textColor.trim() ? section.textColor : '#000000'}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">Color</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title="Force stacked view for this section" style={{ minHeight: 44 }}>
                <input
                    type="checkbox"
                    checked={section.forceStackedView || false}
                    onChange={(e) => onForceStackedChange(e.target.checked)}
                    className="w-4 h-4 text-brand-600 bg-slate-100 border-slate-300 rounded focus:ring-brand-500 dark:bg-slate-700 dark:border-slate-600"
                />
                <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Force Stacked</span>
            </label>
            <button
                type="button"
                onClick={() => handlers.onImportSection(tab.id, section.id)}
                disabled={importing}
                className={`${iconBtn} p-2`}
                style={{ minHeight: 44, minWidth: 44 }}
                title="Import links from JSON or CSV"
            >
                <ImportIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => exportSectionLinksToFile(section)}
                className={`${iconBtn} p-2`}
                style={{ minHeight: 44, minWidth: 44 }}
                title="Export links in this section as JSON"
            >
                <ExportIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => handlers.onCloneSection(tab.id, section.id)} className={`${iconBtn} p-2`} style={{ minHeight: 44, minWidth: 44 }} title="Clone Section">
                <CloneIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => handlers.onScheduleSection(tab.id, section.id)} className={`${iconBtn} p-2 hover:text-green-600 dark:hover:text-green-400`} style={{ minHeight: 44, minWidth: 44 }} title="Schedule Section">
                <CalendarIcon className="w-4 h-4" />
            </button>
            {(section.visibleFrom || section.expiresAt) && (
                <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">📅 Scheduled</span>
            )}
            {section.visibility && section.visibility !== 'public' && (
                <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    {section.visibility === 'authenticated' ? 'Auth' : 'Restricted'}
                </span>
            )}
            {isAdmin && section.published === false && (
                <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">Unpublished</span>
            )}
            <button type="button" onClick={() => handlers.onVisibilitySection(tab.id, section.id)} className={`${iconBtn} p-2 hover:text-blue-600 dark:hover:text-blue-400`} style={{ minHeight: 44, minWidth: 44 }} title="Set Section Visibility">
                <PencilIcon className="w-4 h-4" />
            </button>
            {handlers.canDeleteSections && (
                <button
                    type="button"
                    onClick={() => handlers.onRemoveSection(tab.id, section.id)}
                    className={`${iconBtn} p-2 hover:text-red-500`}
                    style={{ minHeight: 44, minWidth: 44 }}
                    title="Delete Section"
                >
                    <TrashIcon />
                </button>
            )}
        </div>
    );
};
