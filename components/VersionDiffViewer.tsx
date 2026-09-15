import React, { useMemo } from 'react';
import { Tile, Tab, LinkSection, Link, RichTextContent } from '../types';

interface VersionDiffViewerProps {
    originalData: Tile;
    modifiedData: Tile; // Or "current" vs "selected version"
    originalTitle: string;
    modifiedTitle: string;
    onClose: () => void;
    originalVersionMeta?: {
        versionNumber: number;
        createdAt: number;
        username: string;
        changelogSummary?: string | null;
    };
    modifiedVersionMeta?: {
        versionNumber?: number;
        createdAt?: number;
        username?: string;
        changelogSummary?: string | null;
    };
    isRestorePreview?: boolean;
    onConfirmRestore?: () => void;
}

interface DiffResult<T> {
    status: 'added' | 'removed' | 'modified' | 'unchanged';
    original?: T;
    modified?: T;
    diffs?: Record<string, DiffResult<any>>; // For object properties
    children?: ChildDiffResult<any>[]; // For array items
}

interface ChildDiffResult<T> {
    key: string; // ID or Index
    status: 'added' | 'removed' | 'modified' | 'unchanged';
    item: T; // The item itself (or the modified version if modified)
    original?: T;
    details?: DiffResult<T>; // Deep diff details
    kind?: 'tab' | 'section' | 'link' | 'richText' | 'message';
}


// Normalize data for comparison (matches backend normalization)
// This preserves structure but normalizes values for consistent comparison
const normalizeForComparison = (data: any): any => {
    if (data === null || data === undefined) {
        return '';
    }
    
    if (Array.isArray(data)) {
        return data.map(item => normalizeForComparison(item));
    }
    
    if (typeof data === 'object' && !Array.isArray(data)) {
        // Exclude metadata fields (same as backend)
        const excludeKeys = [
            'createdAt', 'created_at',
            'updatedAt', 'updated_at',
            'deletedAt', 'deleted_at',
            'archivedAt', 'archived_at',
            'user_id', 'userId',
            'canView', 'can_view',
            'canEdit', 'can_edit',
            'canDelete', 'can_delete',
            'hasRoleAccess', 'has_role_access',
            'isFavorite', 'is_favorite',
            'health' // Transient link health data
        ];
        
        const result: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (excludeKeys.includes(key)) continue;
            result[key] = normalizeForComparison(value);
        }
        return result;
    }
    
    // Normalize booleans to strings (matches backend)
    if (typeof data === 'boolean') {
        return data ? '1' : '0';
    }
    
    // Keep other types as-is for comparison (numbers, strings, etc.)
    return data;
};

// Helper to compare primitive values (assumes data is already normalized)
const compareValues = (a: any, b: any): 'unchanged' | 'modified' => {
    // Handle null/undefined/empty string equivalence
    const valA = a === null || a === undefined || a === '' ? '' : a;
    const valB = b === null || b === undefined || b === '' ? '' : b;
    
    if (Array.isArray(valA) || Array.isArray(valB)) {
        const arrA = Array.isArray(valA) ? valA : [];
        const arrB = Array.isArray(valB) ? valB : [];
        return JSON.stringify(arrA) === JSON.stringify(arrB) ? 'unchanged' : 'modified';
    }
    
    // Deep comparison for objects
    if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null) {
        return JSON.stringify(valA) === JSON.stringify(valB) ? 'unchanged' : 'modified';
    }
    
    return valA === valB ? 'unchanged' : 'modified';
};

const diffObjects = (objA: any, objB: any, fields: string[]): Record<string, DiffResult<any>> => {
    const diffs: Record<string, DiffResult<any>> = {};
    fields.forEach(field => {
        const status = compareValues(objA[field], objB[field]);
        if (status === 'modified') {
            diffs[field] = {
                status: 'modified',
                original: objA[field],
                modified: objB[field]
            };
        }
    });
    return diffs;
};

// Compare Arrays of Objects (Tabs, Sections, Links)
// Assumes items have 'id'
const diffArray = <T extends { id: string }>(
    arrA: T[],
    arrB: T[],
    fieldsToCompare: string[],
    deepCompare?: (a: T, b: T) => DiffResult<any>, // recursive diff
    kind?: ChildDiffResult<T>['kind']
): ChildDiffResult<T>[] => {
    const mapA = new Map(arrA.map(item => [item.id, item]));
    const mapB = new Map(arrB.map(item => [item.id, item]));
    const results: ChildDiffResult<T>[] = [];

    const allIds = new Set([...Array.from(mapA.keys()), ...Array.from(mapB.keys())]);

    allIds.forEach(id => {
        const itemA = mapA.get(id);
        const itemB = mapB.get(id);

        if (!itemA && itemB) {
            results.push({ key: id, status: 'added', item: itemB, kind });
        } else if (itemA && !itemB) {
            results.push({ key: id, status: 'removed', item: itemA, original: itemA, kind });
        } else if (itemA && itemB) {
            // Check for shallow changes
            const fieldDiffs = diffObjects(itemA, itemB, fieldsToCompare);
            let deepDiff = deepCompare ? deepCompare(itemA, itemB) : null;

            const hasFieldChanges = Object.keys(fieldDiffs).length > 0;
            const hasDeepChanges = deepDiff && (
                Object.keys(deepDiff.diffs || {}).length > 0 ||
                (deepDiff.children && deepDiff.children.some(c => c.status !== 'unchanged'))
            );

            if (hasFieldChanges || hasDeepChanges) {
                results.push({
                    key: id,
                    status: 'modified',
                    item: itemB,
                    original: itemA,
                    kind,
                    details: {
                        status: 'modified',
                        original: itemA,
                        modified: itemB,
                        diffs: fieldDiffs,
                        children: deepDiff?.children
                    }
                });
            } else {
                results.push({ key: id, status: 'unchanged', item: itemB, kind });
            }
        }
    });

    return results;
};


export const VersionDiffViewer: React.FC<VersionDiffViewerProps> = ({
    originalData,
    modifiedData,
    originalTitle,
    modifiedTitle,
    onClose,
    originalVersionMeta,
    modifiedVersionMeta,
    isRestorePreview = false,
    onConfirmRestore
}) => {

    // Handle ESC key to close
    React.useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        // Use capture phase to ensure we get the event first
        document.addEventListener('keydown', handleEsc, true);
        return () => document.removeEventListener('keydown', handleEsc, true);
    }, [onClose]);

    // Main comparison logic
    const diffTree = useMemo(() => {
        // Normalize both datasets before comparison to ensure consistent structure
        const normalizedOriginal = normalizeForComparison(originalData);
        const normalizedModified = normalizeForComparison(modifiedData);

        // Root fields
        const rootFields = [
            'title', 'description', 'htmlContent', 'emoji', 'group', 'visibility', 'browser',
            'themeColor', 'isHyperlink', 'hyperlinkUrl', 'openInNewTab',
            'allowedUsers', 'visibleFrom', 'expiresAt',
            'tileBackgroundColor', 'tileGradientEnabled', 'tileGradientColors', 'tileGradientColorPositions',
            'tileGradientDirection', 'tileGradientType', 'tileBorderRadius', 'tileTextColor'
        ];
        const rootDiffs = diffObjects(normalizedOriginal, normalizedModified, rootFields);

        // Normalize Tabs/Sections (handle legacy sections structure if needed, but assuming normalized here)
        // Note: The logic in backend might return just sections if no tabs.
        // We will try to normalize to tabs structure for comparison if possible.

        const tabsA = normalizedOriginal.tabs || [];
        const tabsB = normalizedModified.tabs || [];

        // Recursive comparison function for Tabs
        const compareTabs = (tabA: Tab, tabB: Tab): DiffResult<Tab> => {
            const fieldDiffs = diffObjects(tabA, tabB, ['title', 'position', 'textColor', 'backgroundColor', 'backgroundGradientEnabled', 'backgroundGradientColors', 'backgroundGradientDirection', 'backgroundGradientType', 'backgroundGradientColorPositions', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt']);

            // Compare Sections
            const sectionsDiff = diffArray(tabA.sections || [], tabB.sections || [], ['title', 'position', 'textColor', 'backgroundColor', 'backgroundGradientEnabled', 'backgroundGradientColors', 'backgroundGradientDirection', 'backgroundGradientType', 'backgroundGradientColorPositions', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt', 'forceStackedView'], (secA, secB) => {
                // Compare Links
                const linksDiff = diffArray(
                    secA.links || [],
                    secB.links || [],
                    ['label', 'url', 'icon', 'visibility', 'browser', 'textColor', 'notes', 'tooltip', 'visibleFrom', 'expiresAt', 'position', 'richTextContent', 'allowedUsers'],
                    undefined,
                    'link'
                );

                const richTextDiff = diffArray(
                    secA.richTextContent || [],
                    secB.richTextContent || [],
                    ['content', 'position', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt'],
                    undefined,
                    'richText'
                );

                return { status: 'modified', children: [...linksDiff, ...richTextDiff] };
            }, 'section');

            return {
                status: 'modified',
                diffs: fieldDiffs,
                children: sectionsDiff
            };
        };

        const tabsDiff = diffArray(tabsA, tabsB, ['title', 'position', 'textColor', 'backgroundColor', 'backgroundGradientEnabled', 'backgroundGradientColors', 'backgroundGradientDirection', 'backgroundGradientType', 'backgroundGradientColorPositions', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt'], compareTabs, 'tab');

        const messagesDiff = diffArray(
            normalizedOriginal.messages || [],
            normalizedModified.messages || [],
            ['content', 'type', 'startDate', 'endDate', 'isActive', 'priority', 'textColor', 'fontStyle', 'displayLocation', 'animationType', 'delayBefore'],
            undefined,
            'message'
        );

        return {
            root: rootDiffs,
            tabs: tabsDiff,
            messages: messagesDiff
        };

    }, [originalData, modifiedData]);

    const renderChangedValue = (val: any) => {
        if (val === null || val === undefined) return <em className="text-slate-400">empty</em>;
        if (Array.isArray(val)) return val.length ? val.join(', ') : <em className="text-slate-400">empty</em>;
        if (typeof val === 'boolean') return val ? 'True' : 'False';
        return String(val);
    };

    const isRichTextItem = (item: any): item is RichTextContent => {
        return item && typeof item === 'object' && 'content' in item && !('url' in item);
    };

    const renderRichTextPreview = (content: string) => {
        const text = content.replace(/<[^>]*>/g, '').trim();
        if (!text) return <em className="text-slate-400">empty</em>;
        return text.length > 120 ? `${text.slice(0, 120)}...` : text;
    };

    // Helper to render a field value in a panel
    const renderFieldValue = (label: string, value: any, isChanged: boolean, isRemoved: boolean = false) => {
        return (
            <div className={`p-2 rounded ${isRemoved ? 'bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500' : isChanged ? 'bg-green-50 dark:bg-green-900/10 border-l-4 border-green-500' : 'bg-slate-50 dark:bg-slate-800/50 border-l-4 border-slate-300 dark:border-slate-600'}`}>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</div>
                <div className={`text-sm ${isRemoved ? 'line-through text-red-600 dark:text-red-400' : isChanged ? 'text-green-700 dark:text-green-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                    {renderChangedValue(value)}
                </div>
            </div>
        );
    };

    // Render side-by-side field comparison
    const renderSideBySideField = (label: string, originalVal: any, modifiedVal: any) => {
        const isChanged = originalVal !== modifiedVal;
        return (
            <div className="grid grid-cols-2 gap-2 border-b border-slate-200 dark:border-slate-700 last:border-0">
                <div className="p-2">
                    {renderFieldValue(label, originalVal, false, isChanged && originalVal !== null && originalVal !== undefined)}
                </div>
                <div className="p-2">
                    {renderFieldValue(label, modifiedVal, isChanged, false)}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                            Version Comparison
                        </h2>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-4 mt-2">
                            <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-100 border border-red-500"></span>
                                <span className="font-medium">Old:</span> {originalTitle}
                                {originalVersionMeta && (
                                    <>
                                        <span className="mx-1">•</span>
                                        <span>v{originalVersionMeta.versionNumber}</span>
                                        <span className="mx-1">•</span>
                                        <span>{new Date(originalVersionMeta.createdAt * 1000).toLocaleString()}</span>
                                        <span className="mx-1">•</span>
                                        <span>by {originalVersionMeta.username}</span>
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-100 border border-green-500"></span>
                                <span className="font-medium">New:</span> {modifiedTitle}
                                {modifiedVersionMeta && (
                                    <>
                                        {modifiedVersionMeta.versionNumber && (
                                            <>
                                                <span className="mx-1">•</span>
                                                <span>v{modifiedVersionMeta.versionNumber}</span>
                                            </>
                                        )}
                                        {modifiedVersionMeta.createdAt && (
                                            <>
                                                <span className="mx-1">•</span>
                                                <span>{new Date(modifiedVersionMeta.createdAt * 1000).toLocaleString()}</span>
                                            </>
                                        )}
                                        {modifiedVersionMeta.username && (
                                            <>
                                                <span className="mx-1">•</span>
                                                <span>by {modifiedVersionMeta.username}</span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        {(originalVersionMeta?.changelogSummary || modifiedVersionMeta?.changelogSummary) && (
                            <div className="mt-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400 font-medium">Changes:</span>
                                <span className="text-slate-500 dark:text-slate-500 ml-1">
                                    {modifiedVersionMeta?.changelogSummary || originalVersionMeta?.changelogSummary || 'No summary available'}
                                </span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors ml-4">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-slate-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content - Two Panel Layout */}
                <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50">
                    {/* Root Fields - Side by Side */}
                    {Object.keys(diffTree.root).length > 0 && (
                        <div className="mb-4 bg-white dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-600">
                            <div className="sticky top-0 bg-slate-100 dark:bg-slate-800 px-4 py-3 border-b-2 border-slate-300 dark:border-slate-600 z-10">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">General Settings</h3>
                            </div>
                            <div className="grid grid-cols-2 divide-x-2 divide-slate-300 dark:divide-slate-600">
                                <div className="bg-red-50/50 dark:bg-red-900/10 px-4 py-2 text-xs font-bold text-red-700 dark:text-red-400 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-[41px] z-10">
                                    {originalTitle}
                                </div>
                                <div className="bg-green-50/50 dark:bg-green-900/10 px-4 py-2 text-xs font-bold text-green-700 dark:text-green-400 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-[41px] z-10">
                                    {modifiedTitle}
                                </div>
                            </div>
                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                {Object.keys(diffTree.root).map(key => {
                                    const diff = diffTree.root[key];
                                    const originalVal = diff?.original ?? originalData[key];
                                    const modifiedVal = diff?.modified ?? modifiedData[key];
                                    const isChanged = diff && diff.status === 'modified';
                                    return (
                                        <div key={key} className={`grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 ${isChanged ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}>
                                            <div className={`p-3 ${isChanged ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-white dark:bg-slate-800'}`}>
                                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">{key}</div>
                                                <div className={`text-sm ${isChanged ? 'line-through text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    {renderChangedValue(originalVal)}
                                                </div>
                                            </div>
                                            <div className={`p-3 ${isChanged ? 'bg-green-50/50 dark:bg-green-900/10' : 'bg-white dark:bg-slate-800'}`}>
                                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">{key}</div>
                                                <div className={`text-sm ${isChanged ? 'text-green-600 dark:text-green-400 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    {renderChangedValue(modifiedVal)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Two Panel Layout for Tabs/Content */}
                    {diffTree.tabs.some(t => t.status !== 'unchanged') || diffTree.messages.some(m => m.status !== 'unchanged') ? (
                        <div className="bg-white dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-600">
                            {/* Header for tabs/content */}
                            <div className="sticky top-0 bg-slate-100 dark:bg-slate-800 px-4 py-3 border-b-2 border-slate-300 dark:border-slate-600 z-10">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Tabs & Content</h3>
                            </div>
                            <div className="grid grid-cols-2 divide-x-2 divide-slate-300 dark:divide-slate-600">
                                <div className="bg-red-50/50 dark:bg-red-900/10 px-4 py-2 text-xs font-bold text-red-700 dark:text-red-400 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-[41px] z-10">
                                    {originalTitle}
                                </div>
                                <div className="bg-green-50/50 dark:bg-green-900/10 px-4 py-2 text-xs font-bold text-green-700 dark:text-green-400 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-[41px] z-10">
                                    {modifiedTitle}
                                </div>
                            </div>

                            {/* Render tabs side by side */}
                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                {(() => {
                                    const originalTabs = originalData.tabs || [];
                                    const modifiedTabs = modifiedData.tabs || [];
                                    const allTabIds = new Set([...originalTabs.map(t => t.id), ...modifiedTabs.map(t => t.id)]);
                                    const tabMapA = new Map(originalTabs.map(t => [t.id, t]));
                                    const tabMapB = new Map(modifiedTabs.map(t => [t.id, t]));

                                    return Array.from(allTabIds).map(tabId => {
                                        const tabA = tabMapA.get(tabId);
                                        const tabB = tabMapB.get(tabId);
                                        const tabDiff = diffTree.tabs.find(t => t.key === tabId);
                                        const isUnchanged = !tabDiff || tabDiff.status === 'unchanged';
                                        
                                        if (isUnchanged && tabA && tabB) {
                                            // Show unchanged tab (dimmed)
                                            return (
                                                <div key={tabId} className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 opacity-60">
                                                    <div className="p-3 bg-white dark:bg-slate-800">
                                                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{tabA.title || '(Untitled)'}</div>
                                                    </div>
                                                    <div className="p-3 bg-white dark:bg-slate-800">
                                                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{tabB.title || '(Untitled)'}</div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Show changed tab
                                        return (
                                            <div key={tabId} className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700">
                                                <div className={`p-3 ${tabDiff.status === 'removed' || (tabDiff.status === 'modified' && !tabA) ? 'bg-red-50 dark:bg-red-900/10' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                                                    {tabA ? (
                                                        <>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="text-xs font-semibold text-slate-500">Tab</span>
                                                                <div className={`text-sm font-medium ${tabDiff.status === 'removed' ? 'line-through text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                                    {tabA.title || '(Untitled)'}
                                                                </div>
                                                            </div>
                                                            {tabDiff.status === 'modified' && tabDiff.details?.diffs && (
                                                                <div className="space-y-1 mt-2">
                                                                    {Object.keys(tabDiff.details.diffs).map(key => (
                                                                        <div key={key} className="text-xs">
                                                                            <span className="text-slate-500">{key}:</span>{' '}
                                                                            <span className="text-red-600 dark:text-red-400 line-through">{renderChangedValue(tabDiff.details?.diffs?.[key]?.original)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {/* Render sections for this tab */}
                                                            {tabA.sections && tabA.sections.length > 0 && (
                                                                <div className="mt-3 space-y-2">
                                                                    {tabA.sections.map(section => {
                                                                        const sectionDiff = tabDiff.details?.children?.find(c => c.key === section.id);
                                                                        if (sectionDiff && sectionDiff.status === 'unchanged') return null;
                                                                        return (
                                                                            <div key={section.id} className={`ml-2 pl-2 border-l-2 ${sectionDiff?.status === 'removed' ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`}>
                                                                                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{section.title || '(Untitled Section)'}</div>
                                                                                {section.links && section.links.length > 0 && (
                                                                                    <div className="mt-1 space-y-1">
                                                                                        {section.links.map(link => {
                                                                                            const linkDiff = sectionDiff?.details?.children?.find(l => l.key === link.id);
                                                                                            if (linkDiff && linkDiff.status === 'unchanged') return null;
                                                                                            return (
                                                                                                <div key={link.id} className={`text-xs p-1 rounded ${linkDiff?.status === 'removed' ? 'bg-red-100 dark:bg-red-900/20' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
                                                                                                    <span className="font-medium">{link.label}</span>
                                                                                                    {linkDiff?.status === 'removed' && <span className="ml-1 text-red-600 line-through">{link.url}</span>}
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                )}
                                                                                {section.richTextContent && section.richTextContent.length > 0 && (
                                                                                    <div className="mt-1 space-y-1">
                                                                                        {section.richTextContent.map(rt => {
                                                                                            const rtDiff = sectionDiff?.details?.children?.find(l => l.key === rt.id && l.kind === 'richText');
                                                                                            if (rtDiff && rtDiff.status === 'unchanged') return null;
                                                                                            return (
                                                                                                <div key={rt.id} className={`text-xs p-1 rounded ${rtDiff?.status === 'removed' ? 'bg-red-100 dark:bg-red-900/20' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
                                                                                                    <span>📝 Rich Text</span>
                                                                                                    {rtDiff?.status === 'removed' && <span className="ml-1 text-red-600 line-through">(removed)</span>}
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="text-sm text-slate-400 italic">—</div>
                                                    )}
                                                </div>
                                                <div className={`p-3 ${tabDiff.status === 'added' || (tabDiff.status === 'modified' && !tabB) ? 'bg-green-50 dark:bg-green-900/10' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                                                    {tabB ? (
                                                        <>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="text-xs font-semibold text-slate-500">Tab</span>
                                                                    <div className={`text-sm font-medium ${tabDiff.status === 'added' ? 'text-green-600 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                                        {tabB.title || '(Untitled)'}
                                                                    </div>
                                                                </div>
                                                                {tabDiff.status === 'modified' && tabDiff.details?.diffs && (
                                                                    <div className="space-y-1 mt-2">
                                                                        {Object.keys(tabDiff.details.diffs).map(key => (
                                                                            <div key={key} className="text-xs">
                                                                                <span className="text-slate-500">{key}:</span>{' '}
                                                                                <span className="text-green-600 dark:text-green-400 font-medium">{renderChangedValue(tabDiff.details?.diffs?.[key]?.modified)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {/* Render sections for this tab */}
                                                                {tabB.sections && tabB.sections.length > 0 && (
                                                                    <div className="mt-3 space-y-2">
                                                                        {tabB.sections.map(section => {
                                                                            const sectionDiff = tabDiff.details?.children?.find(c => c.key === section.id);
                                                                            if (sectionDiff && sectionDiff.status === 'unchanged') return null;
                                                                            return (
                                                                                <div key={section.id} className={`ml-2 pl-2 border-l-2 ${sectionDiff?.status === 'added' ? 'border-green-400' : 'border-slate-300 dark:border-slate-600'}`}>
                                                                                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{section.title || '(Untitled Section)'}</div>
                                                                                    {section.links && section.links.length > 0 && (
                                                                                        <div className="mt-1 space-y-1">
                                                                                            {section.links.map(link => {
                                                                                                const linkDiff = sectionDiff?.details?.children?.find(l => l.key === link.id);
                                                                                                if (linkDiff && linkDiff.status === 'unchanged') return null;
                                                                                                return (
                                                                                                    <div key={link.id} className={`text-xs p-1 rounded ${linkDiff?.status === 'added' ? 'bg-green-100 dark:bg-green-900/20' : linkDiff?.status === 'modified' ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
                                                                                                        <span className="font-medium">{link.label}</span>
                                                                                                        {linkDiff?.status === 'added' && <span className="ml-1 text-green-600">{link.url}</span>}
                                                                                                        {linkDiff?.status === 'modified' && linkDiff.details?.diffs && (
                                                                                                            <div className="mt-1 pl-2 space-y-0.5">
                                                                                                                {Object.keys(linkDiff.details.diffs).map(fieldKey => (
                                                                                                                    <div key={fieldKey} className="text-[10px]">
                                                                                                                        <span className="text-slate-500">{fieldKey}:</span>{' '}
                                                                                                                        <span className="text-red-600 line-through">{renderChangedValue(linkDiff.details?.diffs?.[fieldKey]?.original)}</span>
                                                                                                                        {' → '}
                                                                                                                        <span className="text-green-600">{renderChangedValue(linkDiff.details?.diffs?.[fieldKey]?.modified)}</span>
                                                                                                                    </div>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                    {section.richTextContent && section.richTextContent.length > 0 && (
                                                                                        <div className="mt-1 space-y-1">
                                                                                            {section.richTextContent.map(rt => {
                                                                                                const rtDiff = sectionDiff?.details?.children?.find(l => l.key === rt.id && l.kind === 'richText');
                                                                                                if (rtDiff && rtDiff.status === 'unchanged') return null;
                                                                                                return (
                                                                                                    <div key={rt.id} className={`text-xs p-1 rounded ${rtDiff?.status === 'added' ? 'bg-green-100 dark:bg-green-900/20' : rtDiff?.status === 'modified' ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
                                                                                                        <span>📝 Rich Text</span>
                                                                                                        {rtDiff?.status === 'added' && <span className="ml-1 text-green-600">(added)</span>}
                                                                                                        {rtDiff?.status === 'modified' && (
                                                                                                            <div className="mt-1 text-[10px] text-slate-500">
                                                                                                                Content modified
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                        </>
                                                    ) : (
                                                        <div className="text-sm text-slate-400 italic">—</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }).filter(Boolean);
                                })()}
                            </div>

                            {/* Messages Side by Side */}
                            {diffTree.messages.some(m => m.status !== 'unchanged') && (
                                <>
                                    <div className="sticky top-0 bg-slate-100 dark:bg-slate-800 px-4 py-3 border-y-2 border-slate-300 dark:border-slate-600 z-10">
                                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Messages</h3>
                                    </div>
                                    <div className="grid grid-cols-2 divide-x-2 divide-slate-300 dark:divide-slate-600">
                                        <div className="bg-red-50/50 dark:bg-red-900/10 px-4 py-2 text-xs font-bold text-red-700 dark:text-red-400 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-[41px] z-10">
                                            {originalTitle}
                                        </div>
                                        <div className="bg-green-50/50 dark:bg-green-900/10 px-4 py-2 text-xs font-bold text-green-700 dark:text-green-400 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-[41px] z-10">
                                            {modifiedTitle}
                                        </div>
                                    </div>
                                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                        {(() => {
                                            const originalMessages = originalData.messages || [];
                                            const modifiedMessages = modifiedData.messages || [];
                                            const allMsgIds = new Set([...originalMessages.map(m => m.id), ...modifiedMessages.map(m => m.id)]);
                                            const msgMapA = new Map(originalMessages.map(m => [m.id, m]));
                                            const msgMapB = new Map(modifiedMessages.map(m => [m.id, m]));

                                            return Array.from(allMsgIds).map(msgId => {
                                                const msgA = msgMapA.get(msgId);
                                                const msgB = msgMapB.get(msgId);
                                                const msgDiff = diffTree.messages.find(m => m.key === msgId);
                                                const isUnchanged = !msgDiff || msgDiff.status === 'unchanged';
                                                
                                                if (isUnchanged && msgA && msgB) {
                                                    return (
                                                        <div key={msgId} className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 opacity-60">
                                                            <div className="p-3 bg-white dark:bg-slate-800">
                                                                <div className="text-xs text-slate-500 dark:text-slate-400">{(msgA as any).content}</div>
                                                            </div>
                                                            <div className="p-3 bg-white dark:bg-slate-800">
                                                                <div className="text-xs text-slate-500 dark:text-slate-400">{(msgB as any).content}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={msgId} className={`grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 ${msgDiff?.status === 'modified' ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}>
                                                        <div className={`p-3 ${msgDiff?.status === 'removed' ? 'bg-red-50 dark:bg-red-900/10' : msgDiff?.status === 'modified' ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-white dark:bg-slate-800'}`}>
                                                            {msgA ? (
                                                                <>
                                                                    <div className={`text-sm ${msgDiff?.status === 'removed' ? 'line-through text-red-600 dark:text-red-400' : msgDiff?.status === 'modified' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                                        {(msgA as any).content}
                                                                    </div>
                                                                    {msgDiff?.status === 'modified' && msgDiff.details?.diffs && (
                                                                        <div className="mt-2 space-y-1">
                                                                            {Object.keys(msgDiff.details.diffs).map(fieldKey => (
                                                                                <div key={fieldKey} className="text-xs p-1.5 bg-red-100 dark:bg-red-900/20 rounded border-l-2 border-red-500">
                                                                                    <span className="text-slate-600 dark:text-slate-400">{fieldKey}:</span>{' '}
                                                                                    <span className="text-red-600 line-through">{renderChangedValue(msgDiff.details?.diffs?.[fieldKey]?.original)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <div className="text-sm text-slate-400 italic">—</div>
                                                            )}
                                                        </div>
                                                        <div className={`p-3 ${msgDiff?.status === 'added' ? 'bg-green-50 dark:bg-green-900/10' : msgDiff?.status === 'modified' ? 'bg-green-50/50 dark:bg-green-900/10' : 'bg-white dark:bg-slate-800'}`}>
                                                            {msgB ? (
                                                                <>
                                                                    <div className={`text-sm ${msgDiff?.status === 'added' ? 'text-green-600 dark:text-green-400 font-medium' : msgDiff?.status === 'modified' ? 'text-green-600 dark:text-green-400 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                                                        {(msgB as any).content}
                                                                    </div>
                                                                    {msgDiff?.status === 'modified' && msgDiff.details?.diffs && (
                                                                        <div className="mt-2 space-y-1">
                                                                            {Object.keys(msgDiff.details.diffs).map(fieldKey => (
                                                                                <div key={fieldKey} className="text-xs p-1.5 bg-green-100 dark:bg-green-900/20 rounded border-l-2 border-green-500">
                                                                                    <span className="text-slate-600 dark:text-slate-400">{fieldKey}:</span>{' '}
                                                                                    <span className="text-green-600 font-medium">{renderChangedValue(msgDiff.details?.diffs?.[fieldKey]?.modified)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <div className="text-sm text-slate-400 italic">—</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }).filter(Boolean);
                                        })()}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (() => {
                        // Check if there are any differences at all
                        const hasRootChanges = Object.keys(diffTree.root).length > 0;
                        const hasTabChanges = diffTree.tabs.some(t => t.status !== 'unchanged');
                        const hasMessageChanges = diffTree.messages.some(m => m.status !== 'unchanged');
                        const hasAnyChanges = hasRootChanges || hasTabChanges || hasMessageChanges;
                        
                        if (!hasAnyChanges) {
                            return (
                                <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                                    <div className="mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-slate-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <p className="font-medium">No differences found between these versions.</p>
                                    <p className="text-xs mt-2">The versions are identical in all tracked fields.</p>
                                    <p className="text-xs mt-1 text-slate-400">(Only internal IDs or hidden metadata might differ)</p>
                                    {originalVersionMeta?.changelogSummary && (
                                        <p className="text-xs mt-3 text-amber-600 dark:text-amber-400">
                                            Note: The changelog summary indicates changes were made when this version was created, 
                                            but the current state matches this version exactly.
                                        </p>
                                    )}
                                </div>
                            );
                        }
                        return null;
                    })()}

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                    {isRestorePreview && (
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                            <span className="font-semibold">⚠️ Restore Preview:</span> Review changes before confirming restore
                        </div>
                    )}
                    <div className="flex gap-2 ml-auto">
                        {isRestorePreview && onConfirmRestore && (
                            <button
                                onClick={onConfirmRestore}
                                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Confirm Restore
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
                        >
                            {isRestorePreview ? 'Cancel' : 'Close Comparison'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
