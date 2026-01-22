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


// Helper to compare primitive values
const compareValues = (a: any, b: any): 'unchanged' | 'modified' => {
    // Treat null and undefined as equal for our purposes, or empty strings
    const valA = a === null || a === undefined ? '' : a;
    const valB = b === null || b === undefined ? '' : b;
    if (Array.isArray(valA) || Array.isArray(valB)) {
        const arrA = Array.isArray(valA) ? valA : [];
        const arrB = Array.isArray(valB) ? valB : [];
        return JSON.stringify(arrA) === JSON.stringify(arrB) ? 'unchanged' : 'modified';
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
    modifiedVersionMeta
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

        // Root fields
        const rootFields = [
            'title', 'description', 'htmlContent', 'emoji', 'group', 'visibility', 'browser',
            'themeColor', 'isHyperlink', 'hyperlinkUrl', 'openInNewTab',
            'allowedUsers', 'visibleFrom', 'expiresAt',
            'tileBackgroundColor', 'tileGradientEnabled', 'tileGradientColors', 'tileGradientColorPositions',
            'tileGradientDirection', 'tileGradientType', 'tileBorderRadius', 'tileTextColor'
        ];
        const rootDiffs = diffObjects(originalData, modifiedData, rootFields);

        // Normalize Tabs/Sections (handle legacy sections structure if needed, but assuming normalized here)
        // Note: The logic in backend might return just sections if no tabs.
        // We will try to normalize to tabs structure for comparison if possible.

        const tabsA = originalData.tabs || [];
        const tabsB = modifiedData.tabs || [];

        // Recursive comparison function for Tabs
        const compareTabs = (tabA: Tab, tabB: Tab): DiffResult<Tab> => {
            const fieldDiffs = diffObjects(tabA, tabB, ['title', 'position', 'textColor', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt']);

            // Compare Sections
            const sectionsDiff = diffArray(tabA.sections || [], tabB.sections || [], ['title', 'position', 'textColor', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt', 'forceStackedView'], (secA, secB) => {
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

        const tabsDiff = diffArray(tabsA, tabsB, ['title', 'position', 'textColor', 'visibility', 'allowedUsers', 'visibleFrom', 'expiresAt'], compareTabs, 'tab');

        const messagesDiff = diffArray(
            originalData.messages || [],
            modifiedData.messages || [],
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

    const renderDiffItem = (label: string, diff: DiffResult<any> | undefined) => {
        if (!diff || diff.status !== 'modified') return null;
        return (
            <div className="flex flex-col border-l-2 border-amber-400 pl-3 py-1 my-1 bg-amber-50 dark:bg-amber-900/10 rounded-r">
                <span className="text-xs font-semibold text-slate-500 uppercase">{label}</span>
                <div className="flex items-center gap-2 text-sm">
                    <div className="line-through text-red-500 opacity-70">{renderChangedValue(diff.original)}</div>
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    <div className="text-green-600 font-medium">{renderChangedValue(diff.modified)}</div>
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

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/50">

                    {/* Root Changes */}
                    {Object.keys(diffTree.root).length > 0 && (
                        <div className="mb-8 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">General Settings Changes</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.keys(diffTree.root).map(key => renderDiffItem(key, diffTree.root[key]))}
                            </div>
                        </div>
                    )}

                    {/* Tabs & Content Changes */}
                    <div className="space-y-6">
                        {diffTree.tabs.filter(t => t.status !== 'unchanged').map(tabDiff => (
                            <div key={tabDiff.key} className={`rounded-xl border shadow-sm overflow-hidden ${tabDiff.status === 'added' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' :
                                tabDiff.status === 'removed' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' :
                                    'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                }`}>
                                <div className="p-3 border-b border-inherit/50 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${tabDiff.status === 'added' ? 'bg-green-200 text-green-800' :
                                            tabDiff.status === 'removed' ? 'bg-red-200 text-red-800' :
                                                'bg-yellow-200 text-yellow-800'
                                            }`}>{tabDiff.status}</span>
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200">
                                            Tab: {tabDiff.item.title || '(Untitled)'}
                                        </h4>
                                    </div>
                                    {tabDiff.status === 'modified' && (
                                        <div className="text-xs text-slate-500">ID: {tabDiff.key}</div>
                                    )}
                                </div>

                                <div className="p-4 space-y-3">
                                    {/* Tab Field Changes */}
                                    {tabDiff.status === 'modified' && tabDiff.details && tabDiff.details.diffs && (
                                        <div className="space-y-1">
                                            {Object.keys(tabDiff.details.diffs).map(key => renderDiffItem(key, tabDiff.details?.diffs?.[key]))}
                                        </div>
                                    )}

                                    {/* Sections */}
                                    {tabDiff.details?.children?.filter(c => c.status !== 'unchanged').map(sectionDiff => (
                                        <div key={sectionDiff.key} className={`ml-4 pl-4 border-l-2 ${sectionDiff.status === 'added' ? 'border-green-400' :
                                            sectionDiff.status === 'removed' ? 'border-red-400' :
                                                'border-slate-300 dark:border-slate-600'
                                            }`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`text-[10px] uppercase font-bold ${sectionDiff.status === 'added' ? 'text-green-600' :
                                                    sectionDiff.status === 'removed' ? 'text-red-600' :
                                                        'text-amber-500'
                                                    }`}>[{sectionDiff.status} Section]</span>
                                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{sectionDiff.item.title || '(Untitled Section)'}</span>
                                            </div>

                                            {/* Section Field Changes */}
                                            {sectionDiff.status === 'modified' && sectionDiff.details?.diffs && (
                                                <div className="mb-2">
                                                    {Object.keys(sectionDiff.details.diffs).map(key => renderDiffItem(key, sectionDiff.details?.diffs?.[key]))}
                                                </div>
                                            )}

                                            {/* Links */}
                                            <div className="space-y-1 mt-2">
                                                <div className="space-y-1 mt-2">
                                                    {sectionDiff.details?.children?.filter(l => l.status !== 'unchanged').map(linkDiff => {
                                                        const isRichText = linkDiff.kind === 'richText' || isRichTextItem(linkDiff.item);
                                                        return (
                                                            <div key={linkDiff.key} className={`p-2 rounded text-sm ${linkDiff.status === 'added' ? 'bg-green-100/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                                                                linkDiff.status === 'removed' ? 'bg-red-100/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                                                                    'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
                                                                }`}>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-lg">{isRichText ? '📝' : (linkDiff.item as Link).icon || '🔗'}</span>
                                                                        <div className="flex flex-col">
                                                                            <span className={`font-medium ${linkDiff.status === 'removed' ? 'line-through opacity-70' : ''}`}>
                                                                                {isRichText ? 'Rich Text Block' : (linkDiff.item as Link).label}
                                                                            </span>
                                                                            <span className={`text-xs opacity-70 ${linkDiff.status === 'removed' ? 'line-through' : ''}`}>
                                                                                {isRichText ? renderRichTextPreview((linkDiff.item as RichTextContent).content || '') : (linkDiff.item as Link).url}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`text-[10px] font-bold uppercase tracking-wider opacity-80 ${linkDiff.status === 'added' ? 'text-green-700' :
                                                                        linkDiff.status === 'removed' ? 'text-red-700' : 'text-amber-700'
                                                                        }`}>
                                                                        {linkDiff.status}
                                                                    </div>
                                                                </div>

                                                                {/* Detailed Field Diffs for Modified Items */}
                                                                {linkDiff.status === 'modified' && linkDiff.details?.diffs && (
                                                                    <div className="mt-2 pl-2 border-l-2 border-amber-300 dark:border-amber-700 space-y-1">
                                                                        {Object.keys(linkDiff.details.diffs).map(fieldKey => {
                                                                            return renderDiffItem(fieldKey, linkDiff.details?.diffs?.[fieldKey]);
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Messages */}
                        {diffTree.messages.some(m => m.status !== 'unchanged') && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Message Changes</h3>
                                <div className="space-y-2">
                                    {diffTree.messages.filter(m => m.status !== 'unchanged').map(messageDiff => (
                                        <div key={messageDiff.key} className={`p-3 rounded text-sm ${messageDiff.status === 'added' ? 'bg-green-100/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                                            messageDiff.status === 'removed' ? 'bg-red-100/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                                                'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
                                            }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex flex-col">
                                                    <span className={`font-medium ${messageDiff.status === 'removed' ? 'line-through opacity-70' : ''}`}>
                                                        {(messageDiff.item as any).content || '(Empty message)'}
                                                    </span>
                                                    <span className={`text-xs opacity-70 ${messageDiff.status === 'removed' ? 'line-through' : ''}`}>
                                                        Type: {(messageDiff.item as any).type || 'info'}
                                                    </span>
                                                </div>
                                                <div className={`text-[10px] font-bold uppercase tracking-wider opacity-80 ${messageDiff.status === 'added' ? 'text-green-700' :
                                                    messageDiff.status === 'removed' ? 'text-red-700' : 'text-amber-700'
                                                    }`}>
                                                    {messageDiff.status}
                                                </div>
                                            </div>
                                            {messageDiff.status === 'modified' && messageDiff.details?.diffs && (
                                                <div className="mt-2 pl-2 border-l-2 border-amber-300 dark:border-amber-700 space-y-1">
                                                    {Object.keys(messageDiff.details.diffs).map(fieldKey => {
                                                        return renderDiffItem(fieldKey, messageDiff.details?.diffs?.[fieldKey]);
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Show message if no changes found in tabs but root had changes */}
                        {diffTree.tabs.every(t => t.status === 'unchanged') && Object.keys(diffTree.root).length === 0 && diffTree.messages.every(m => m.status === 'unchanged') && (
                            <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                                <p>No visual differences found in content.</p>
                                <p className="text-xs mt-1">(Only internal IDs or hidden metadata might have changed)</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
                    >
                        Close Comparison
                    </button>
                </div>
            </div>
        </div>
    );
};
