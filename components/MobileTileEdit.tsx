import React, { useState } from 'react';
import { Tile, Tab, LinkSection, Link, LinkVisibility, TileVisibility, ThemeColor, THEME_COLORS, COLOR_STYLES, AccessRestrictions } from '../types';
import { User } from '../services/authService';
import { AppSettings } from '../services/settingsService';
import { MobileRichTextEditor } from './MobileRichTextEditor';
import { LinkMaintenanceVideoField } from './LinkMaintenanceVideoField';
import { LinkMaintenanceBadge } from './LinkMaintenanceBadge';
import { TitleEmojiPicker } from './TitleEmojiPicker';
import { HierarchyExpandControls } from './TileHierarchyViews';
import { AccessRestrictionsEditor } from './AccessRestrictionsEditor';

interface MobileTileEditProps {
    tile: Tile;
    editTitle: string;
    editDesc: string;
    editHtml: string;
    editEmoji: string;
    editColor: ThemeColor;
    editVisibility: TileVisibility;
    editPublished: boolean;
    editAllowedUsers: number[];
    editAccessRestrictions?: AccessRestrictions;
    editTabs: Tab[];
    onTitleChange: (title: string) => void;
    onDescChange: (desc: string) => void;
    onHtmlChange: (html: string) => void;
    onEmojiChange: (emoji: string) => void;
    onColorChange: (color: ThemeColor) => void;
    onVisibilityChange: (visibility: TileVisibility) => void;
    onPublishedChange: (published: boolean) => void;
    onAllowedUsersChange: (users: number[]) => void;
    onAccessRestrictionsChange?: (next: AccessRestrictions | undefined) => void;
    onTabsChange: (tabs: Tab[]) => void;
    onSave: (tabs?: Tab[]) => void;
    onCancel: () => void;
    isAuthenticated?: boolean;
    usersList?: Array<{ id: number; username: string; email: string; auth_source?: string }>;
    loadingUsers?: boolean;
    showEmojiPicker: boolean;
    setShowEmojiPicker: (show: boolean) => void;
    showTileUserSelector: boolean;
    setShowTileUserSelector: (show: boolean) => void;
    settings?: Partial<AppSettings>;
    availableBrowsers?: string[];
    user?: User | null;
}

/**
 * Mobile-optimized tile edit page
 * Features:
 * - Single column layout
 * - Accordion-style sections
 * - Touch-friendly controls
 * - Optimized link editing
 * - Mobile-optimized rich text editor
 */
export const MobileTileEdit: React.FC<MobileTileEditProps> = ({
    tile,
    editTitle,
    editDesc,
    editHtml,
    editEmoji,
    editColor,
    editVisibility,
    editPublished,
    editAllowedUsers,
    editAccessRestrictions,
    editTabs,
    onTitleChange,
    onDescChange,
    onHtmlChange,
    onEmojiChange,
    onColorChange,
    onVisibilityChange,
    onPublishedChange,
    onAllowedUsersChange,
    onAccessRestrictionsChange,
    onTabsChange,
    onSave,
    onCancel,
    isAuthenticated = false,
    usersList = [],
    loadingUsers = false,
    showEmojiPicker,
    setShowEmojiPicker,
    showTileUserSelector,
    setShowTileUserSelector,
    settings = {},
    availableBrowsers = [],
    user
}) => {
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [editingIntro, setEditingIntro] = useState(false);
    const [expandedTabs, setExpandedTabs] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [showAddLinkForm, setShowAddLinkForm] = useState<Record<string, boolean>>({});
    const [newLinkState, setNewLinkState] = useState<Record<string, {
        label: string;
        url: string;
        icon: string;
        textColor: string;
        visibility: LinkVisibility;
        allowedUsers: number[];
        notes: string;
        tooltip: string;
        browser: string;
        richTextContent: string;
        maintenanceEnabled: boolean;
        maintenanceMessage: string;
        maintenanceVideoUrl: string;
    }>>({});
    const [editingLink, setEditingLink] = useState<{ tabId: string; sectionId: string; linkId: string } | null>(null);
    const [editLinkState, setEditLinkState] = useState<Record<string, {
        label: string;
        url: string;
        icon: string;
        textColor: string;
        visibility: LinkVisibility;
        allowedUsers: number[];
        notes: string;
        tooltip: string;
        browser: string;
        richTextContent: string;
        maintenanceEnabled: boolean;
        maintenanceMessage: string;
        maintenanceVideoUrl: string;
    }>>({});
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [showLinkUserPicker, setShowLinkUserPicker] = useState<Record<string, boolean>>({});

    const toggleTab = (tabId: string) => {
        setExpandedTabs(prev => {
            const next = new Set(prev);
            if (next.has(tabId)) {
                next.delete(tabId);
            } else {
                next.add(tabId);
            }
            return next;
        });
    };

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
            }
            return next;
        });
    };

    const allSectionIds = editTabs.flatMap((t) => (t.sections || []).map((s) => s.id));

    const expandAllToSections = () => {
        setExpandedTabs(new Set(editTabs.map((t) => t.id)));
        setExpandedSections(new Set(allSectionIds));
    };

    const collapseAllTabsAndSections = () => {
        setExpandedTabs(new Set());
        setExpandedSections(new Set());
    };

    const allTabsExpandedToSections =
        editTabs.length > 0 &&
        editTabs.every((t) => expandedTabs.has(t.id)) &&
        (allSectionIds.length === 0 || allSectionIds.every((id) => expandedSections.has(id)));
    const canExpandAllToSections = editTabs.length > 0 && !allTabsExpandedToSections;
    const canCollapseAll = expandedTabs.size > 0 || expandedSections.size > 0;

    const handleAddTab = () => {
        const newTab: Tab = {
            id: `tab_${Date.now()}`,
            title: `Tab #${editTabs.length + 1}`,
            position: editTabs.length,
            sections: []
        };
        onTabsChange([...editTabs, newTab]);
        setExpandedTabs(prev => new Set(prev).add(newTab.id));
    };

    const handleAddSection = (tabId: string) => {
        const tab = editTabs.find(t => t.id === tabId);
        if (!tab) return;

        const newSection: LinkSection = {
            id: `section_${Date.now()}`,
            title: `Section #${(tab.sections?.length || 0) + 1}`,
            links: [],
            position: tab.sections?.length || 0
        };

        const updatedTabs = editTabs.map(t =>
            t.id === tabId
                ? { ...t, sections: [...(t.sections || []), newSection] }
                : t
        );
        onTabsChange(updatedTabs);
        setExpandedSections(prev => new Set(prev).add(newSection.id));
    };

    const handleAddLink = (tabId: string, sectionId: string) => {
        const state = newLinkState[sectionId];
        if (!state || !state.url.trim()) {
            alert('Please enter a URL');
            return;
        }

        const newLink: Link = {
            id: `link_${Date.now()}`,
            label: state.label || 'New Link',
            url: state.url,
            icon: state.icon || '🔗',
            textColor: state.textColor || undefined,
            visibility: state.visibility || 'public',
            allowedUsers: state.allowedUsers || [],
            notes: state.notes || undefined,
            tooltip: state.tooltip || undefined,
            browser: state.browser || 'default',
            richTextContent: state.richTextContent || undefined,
            maintenanceEnabled: state.maintenanceEnabled === true,
            maintenanceMessage: state.maintenanceMessage || undefined,
            maintenanceVideoUrl: state.maintenanceVideoUrl || undefined
        };

        const updatedTabs = editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections?.map(section =>
                        section.id === sectionId
                            ? { ...section, links: [...(section.links || []), newLink] }
                            : section
                    )
                }
                : tab
        );
        onTabsChange(updatedTabs);
        setNewLinkState(prev => ({
            ...prev,
            [sectionId]: {
                label: '',
                url: '',
                icon: '',
                textColor: '',
                visibility: 'public',
                allowedUsers: [],
                notes: '',
                tooltip: '',
                browser: 'default',
                richTextContent: '',
                maintenanceEnabled: false,
                maintenanceMessage: '',
                maintenanceVideoUrl: ''
            }
        }));
        setShowAddLinkForm(prev => ({ ...prev, [sectionId]: false }));
    };

    const handleStartEditLink = (tabId: string, sectionId: string, linkId: string) => {
        const tab = editTabs.find(t => t.id === tabId);
        const section = tab?.sections?.find(s => s.id === sectionId);
        const link = section?.links?.find(l => l.id === linkId);

        if (link) {
            setEditingLink({ tabId, sectionId, linkId });
            setEditLinkState({
                [linkId]: {
                    label: link.label || '',
                    url: link.url || '',
                    icon: link.icon || '',
                    textColor: link.textColor || '',
                    visibility: link.visibility || 'public',
                    allowedUsers: link.allowedUsers || [],
                    notes: link.notes || '',
                    tooltip: link.tooltip || '',
                    browser: link.browser || 'default',
                    richTextContent: link.richTextContent || '',
                    maintenanceEnabled: link.maintenanceEnabled === true,
                    maintenanceMessage: link.maintenanceMessage || '',
                    maintenanceVideoUrl: link.maintenanceVideoUrl || ''
                }
            });
            // Close add form if open
            setShowAddLinkForm(prev => ({ ...prev, [sectionId]: false }));
        }
    };

    const handleSaveEditLink = (tabId: string, sectionId: string, linkId: string) => {
        const state = editLinkState[linkId];
        if (!state || !state.url.trim()) {
            alert('Please enter a URL');
            return;
        }

        const updatedTabs = editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections?.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                links: section.links?.map(link =>
                                    link.id === linkId
                                        ? {
                                            ...link,
                                            label: state.label || 'New Link',
                                            url: state.url,
                                            icon: state.icon || '🔗',
                                            textColor: state.textColor || undefined,
                                            visibility: state.visibility || 'public',
                                            allowedUsers: state.allowedUsers || [],
                                            notes: state.notes || undefined,
                                            tooltip: state.tooltip || undefined,
                                            browser: state.browser || 'default',
                                            richTextContent: state.richTextContent || undefined,
                                            maintenanceEnabled: state.maintenanceEnabled === true,
                                            maintenanceMessage: state.maintenanceMessage || undefined,
                                            maintenanceVideoUrl: state.maintenanceVideoUrl || undefined
                                        }
                                        : link
                                ) || []
                            }
                            : section
                    )
                }
                : tab
        );
        onTabsChange(updatedTabs);
        setEditingLink(null);
        setEditLinkState(prev => {
            const next = { ...prev };
            delete next[linkId];
            return next;
        });
    };

    const handleCancelEditLink = () => {
        setEditingLink(null);
        setEditLinkState(prev => {
            if (editingLink) {
                const next = { ...prev };
                delete next[editingLink.linkId];
                return next;
            }
            return prev;
        });
    };

    const emptyNewLinkFormState = (): NonNullable<(typeof newLinkState)[string]> => ({
        label: '',
        url: '',
        icon: '',
        textColor: '',
        visibility: 'public',
        allowedUsers: [],
        notes: '',
        tooltip: '',
        browser: 'default',
        richTextContent: '',
        maintenanceEnabled: false,
        maintenanceMessage: '',
        maintenanceVideoUrl: ''
    });

    const applyMobileLinkState = (
        link: Link,
        state: NonNullable<(typeof editLinkState)[string]>
    ): Link => ({
        ...link,
        label: state.label || 'New Link',
        url: state.url,
        icon: state.icon || '🔗',
        textColor: state.textColor || undefined,
        visibility: state.visibility || 'public',
        allowedUsers: state.allowedUsers || [],
        notes: state.notes || undefined,
        tooltip: state.tooltip || undefined,
        browser: state.browser || 'default',
        richTextContent: state.richTextContent || undefined,
        maintenanceEnabled: state.maintenanceEnabled === true,
        maintenanceMessage: state.maintenanceMessage || undefined,
        maintenanceVideoUrl: state.maintenanceVideoUrl || undefined
    });

    const flushPendingLinkChanges = (): Tab[] => {
        let nextTabs = editTabs;
        let changed = false;

        if (editingLink) {
            const { tabId, sectionId, linkId } = editingLink;
            const state = editLinkState[linkId];
            if (state && state.url.trim()) {
                nextTabs = nextTabs.map(tab =>
                    tab.id !== tabId
                        ? tab
                        : {
                            ...tab,
                            sections: tab.sections?.map(section =>
                                section.id !== sectionId
                                    ? section
                                    : {
                                        ...section,
                                        links: section.links?.map(link =>
                                            link.id === linkId ? applyMobileLinkState(link, state) : link
                                        ) || []
                                    }
                            )
                        }
                );
                changed = true;
            }
        }

        Object.entries(newLinkState).forEach(([sectionId, state]) => {
            if (!state?.url?.trim()) return;
            const tab = nextTabs.find(t => t.sections?.some(s => s.id === sectionId));
            if (!tab) return;
            const newLink: Link = {
                id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                label: state.label || 'New Link',
                url: state.url,
                icon: state.icon || '🔗',
                textColor: state.textColor || undefined,
                visibility: state.visibility || 'public',
                allowedUsers: state.allowedUsers || [],
                notes: state.notes || undefined,
                tooltip: state.tooltip || undefined,
                browser: state.browser || 'default',
                richTextContent: state.richTextContent || undefined,
                maintenanceEnabled: state.maintenanceEnabled === true,
                maintenanceMessage: state.maintenanceMessage || undefined,
                maintenanceVideoUrl: state.maintenanceVideoUrl || undefined
            };
            nextTabs = nextTabs.map(t =>
                t.id !== tab.id
                    ? t
                    : {
                        ...t,
                        sections: t.sections?.map(section =>
                            section.id !== sectionId
                                ? section
                                : { ...section, links: [...(section.links || []), newLink] }
                        )
                    }
            );
            changed = true;
        });

        if (changed) {
            onTabsChange(nextTabs);
            if (editingLink) {
                setEditingLink(null);
                setEditLinkState({});
            }
            setNewLinkState(prev => {
                const next = { ...prev };
                Object.entries(prev).forEach(([sectionId, state]) => {
                    if (state?.url?.trim()) {
                        next[sectionId] = emptyNewLinkFormState();
                    }
                });
                return next;
            });
            setShowAddLinkForm(prev => {
                const next = { ...prev };
                Object.entries(newLinkState).forEach(([sectionId, state]) => {
                    if (state?.url?.trim()) next[sectionId] = false;
                });
                return next;
            });
        }

        return nextTabs;
    };

    const handleSavePage = () => {
        onSave(flushPendingLinkChanges());
    };

    const handleCloneLink = (tabId: string, sectionId: string, linkId: string) => {
        const updatedTabs = editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections?.map(section => {
                        if (section.id !== sectionId) return section;
                        const clonedLinks = (section.links || []).flatMap(link => {
                            if (link.id !== linkId) return [link];
                            const newLink: Link = {
                                ...link,
                                id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
                            };
                            return [link, newLink];
                        });
                        return { ...section, links: clonedLinks };
                    }) || []
                }
                : tab
        );
        onTabsChange(updatedTabs);
    };

    const handleDeleteLink = (tabId: string, sectionId: string, linkId: string) => {
        if (!confirm('Are you sure you want to delete this link?')) return;

        const updatedTabs = editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections?.map(section =>
                        section.id === sectionId
                            ? { ...section, links: section.links?.filter(link => link.id !== linkId) || [] }
                            : section
                    )
                }
                : tab
        );
        onTabsChange(updatedTabs);
        // Clear edit state if deleting the link being edited
        if (editingLink && editingLink.linkId === linkId) {
            handleCancelEditLink();
        }
    };

    const updateNewLinkState = (sectionId: string, field: string, value: any) => {
        setNewLinkState(prev => ({
            ...prev,
            [sectionId]: {
                ...(prev[sectionId] || {
                    label: '',
                    url: '',
                    icon: '',
                    textColor: '',
                    visibility: 'public' as LinkVisibility,
                    allowedUsers: [],
                    notes: '',
                    tooltip: '',
                    browser: 'default',
                    richTextContent: '',
                    maintenanceEnabled: false,
                    maintenanceMessage: '',
                    maintenanceVideoUrl: ''
                }),
                [field]: value
            }
        }));
    };

    const updateEditLinkState = (linkId: string, field: string, value: any) => {
        setEditLinkState(prev => ({
            ...prev,
            [linkId]: {
                ...(prev[linkId] || {
                    label: '',
                    url: '',
                    icon: '',
                    textColor: '',
                    visibility: 'public' as LinkVisibility,
                    allowedUsers: [],
                    notes: '',
                    tooltip: '',
                    browser: 'default',
                    richTextContent: '',
                    maintenanceEnabled: false,
                    maintenanceMessage: '',
                    maintenanceVideoUrl: ''
                }),
                [field]: value
            }
        }));
    };

    // Filter links based on search
    const filteredTabs = linkSearchTerm
        ? editTabs.map(tab => ({
            ...tab,
            sections: tab.sections?.map(section => ({
                ...section,
                links: section.links?.filter(link =>
                    link.label.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                    link.url.toLowerCase().includes(linkSearchTerm.toLowerCase())
                ) || []
            })) || []
        }))
        : editTabs;

    return (
        <div className="mobile-tile-edit min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            {/* Sticky Header */}
            <div className="sticky top-0 z-50 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Edit Page</h1>
                        <div className="flex gap-2">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg font-medium active:bg-slate-200 dark:active:bg-slate-600 touch-manipulation"
                                style={{ minHeight: '44px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePage}
                                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold active:bg-brand-700 touch-manipulation"
                                style={{ minHeight: '44px' }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="text-2xl">{editEmoji || '✨'}</span>
                        <span className="font-medium">{editTitle || 'Untitled Page'}</span>
                    </div>
                </div>
            </div>

            <div className="px-4 py-4 space-y-4">
                {/* General Settings Accordion */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button
                        onClick={() => setActiveSection(activeSection === 'general' ? null : 'general')}
                        className="w-full px-4 py-3 flex items-center justify-between text-left bg-slate-50 dark:bg-slate-900/50 active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                        style={{ minHeight: '44px' }}
                    >
                        <div className="flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.128.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.128c-.355-.196-.75-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="font-semibold text-slate-900 dark:text-white">General Settings</span>
                        </div>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className={`w-5 h-5 text-slate-400 transition-transform ${activeSection === 'general' ? 'rotate-180' : ''}`}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {activeSection === 'general' && (
                        <div className="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
                            {/* Emoji & Title */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                                    Emoji & Page Title
                                </label>
                                <div className="flex gap-2">
                                    <TitleEmojiPicker
                                        value={editEmoji}
                                        onChange={onEmojiChange}
                                        size="lg"
                                        title="Choose page emoji"
                                    />
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => onTitleChange(e.target.value)}
                                        className="flex-1 h-14 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-semibold text-base"
                                        placeholder="Enter page title..."
                                    />
                                </div>
                            </div>

                            {/* Theme Color */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                                    Theme Color
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {THEME_COLORS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => onColorChange(color)}
                                            className={`w-12 h-12 rounded-full border-3 transition-all relative overflow-hidden ${editColor === color
                                                ? 'border-brand-500 dark:border-brand-400 scale-110 ring-2 ring-brand-200 dark:ring-brand-900/50'
                                                : 'border-slate-300 dark:border-slate-600 active:scale-105'
                                                } touch-manipulation`}
                                            title={color.charAt(0).toUpperCase() + color.slice(1)}
                                        >
                                            <div className={`absolute inset-0 ${COLOR_STYLES[color].base}`}></div>
                                            {editColor === color && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white drop-shadow-lg">
                                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Card Description */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                                    Card Description
                                </label>
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => onDescChange(e.target.value)}
                                    rows={3}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-700 dark:text-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                                    placeholder="Brief summary of this page..."
                                />
                            </div>

                            {/* Intro Content */}
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                        Intro Content
                                    </label>
                                    {editingIntro ? (
                                        <button
                                            type="button"
                                            onClick={() => setEditingIntro(false)}
                                            className="text-xs font-semibold text-brand-600 dark:text-brand-400 px-2 py-1 rounded-lg active:bg-brand-50 dark:active:bg-brand-900/20 touch-manipulation"
                                            style={{ minHeight: '44px' }}
                                        >
                                            Done
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setEditingIntro(true)}
                                            className="p-2 text-slate-400 active:text-brand-600 dark:active:text-brand-400 active:bg-slate-100 dark:active:bg-slate-800 rounded transition-colors touch-manipulation"
                                            title="Edit intro content"
                                            style={{ minHeight: '44px', minWidth: '44px' }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                {editingIntro && (
                                    <MobileRichTextEditor
                                        value={editHtml}
                                        onChange={onHtmlChange}
                                        placeholder="Enter intro content with formatting..."
                                    />
                                )}
                            </div>

                            {/* Publish Status (admin only) */}
                            {user?.is_admin && (
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                                        Publish Status
                                    </label>
                                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                {editPublished ? 'Published' : 'Unpublished'}
                                            </div>
                                            <div className="text-xs text-slate-600 dark:text-slate-400">
                                                {editPublished
                                                    ? 'Visible according to Visibility settings'
                                                    : 'Hidden from everyone except platform admins'}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={editPublished}
                                            onClick={() => onPublishedChange(!editPublished)}
                                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${editPublished ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                        >
                                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${editPublished ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Visibility Settings */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                                    Visibility
                                </label>
                                <div className="space-y-2">
                                    {(['public', 'authenticated', 'private'] as TileVisibility[]).filter(v => user?.is_admin || v === 'private').map(visibility => (
                                        <label
                                            key={visibility}
                                            className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all touch-manipulation ${editVisibility === visibility
                                                ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                                : 'border-slate-200 dark:border-slate-700 active:border-slate-300 dark:active:border-slate-600'
                                                }`}
                                            style={{ minHeight: '44px' }}
                                        >
                                            <input
                                                type="radio"
                                                name="tileVisibility"
                                                value={visibility}
                                                checked={editVisibility === visibility}
                                                onChange={(e) => {
                                                    onVisibilityChange(e.target.value as TileVisibility);
                                                    if (e.target.value === 'private') {
                                                        setShowTileUserSelector(true);
                                                    }
                                                }}
                                                className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                                                    {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
                                                </div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                                    {visibility === 'public' && 'Available for everyone'}
                                                    {visibility === 'authenticated' && 'Available for logged in users only'}
                                                    {visibility === 'private' && 'Available for specific users only'}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {/* User Selector for Private Visibility */}
                                {editVisibility === 'private' && isAuthenticated && (
                                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                Select Users
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowTileUserSelector(!showTileUserSelector)}
                                                className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium"
                                            >
                                                {showTileUserSelector ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                        {editAllowedUsers.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {editAllowedUsers.map(userId => {
                                                    const user = usersList.find(u => u.id === userId);
                                                    return (
                                                        <span
                                                            key={userId}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded-lg text-xs font-medium"
                                                        >
                                                            {user?.username || `User ${userId}`}
                                                            <button
                                                                type="button"
                                                                onClick={() => onAllowedUsersChange(editAllowedUsers.filter(id => id !== userId))}
                                                                className="hover:text-red-600 dark:hover:text-red-400"
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {showTileUserSelector && (
                                            <div className="max-h-56 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-3 space-y-1.5">
                                                {loadingUsers ? (
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                                                        Loading users...
                                                    </div>
                                                ) : usersList.length === 0 ? (
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                                                        No users available
                                                    </div>
                                                ) : (
                                                    usersList.map(user => (
                                                        <label
                                                            key={user.id}
                                                            className="flex items-center gap-3 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer touch-manipulation"
                                                            style={{ minHeight: '44px' }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={editAllowedUsers.includes(user.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        onAllowedUsersChange([...editAllowedUsers, user.id]);
                                                                    } else {
                                                                        onAllowedUsersChange(editAllowedUsers.filter(id => id !== user.id));
                                                                    }
                                                                }}
                                                                className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 w-4 h-4"
                                                            />
                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
                                                                {user.username}
                                                            </span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {onAccessRestrictionsChange && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                        <AccessRestrictionsEditor
                            compact
                            value={editAccessRestrictions}
                            onChange={onAccessRestrictionsChange}
                            disabled={tile.canChangeVisibility === false}
                        />
                    </div>
                )}

                {/* Tabs & Sections */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="font-semibold text-slate-900 dark:text-white">Manage Tabs & Sections</span>
                        </div>
                        <button
                            onClick={handleAddTab}
                            className="px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-semibold active:bg-brand-700 touch-manipulation"
                            style={{ minHeight: '44px' }}
                        >
                            + Add Tab
                        </button>
                    </div>
                    <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <HierarchyExpandControls
                            canExpand={canExpandAllToSections}
                            canCollapse={canCollapseAll}
                            onExpandAll={expandAllToSections}
                            onCollapseAll={collapseAllTabsAndSections}
                        />
                    </div>

                    {/* Search */}
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                        <div className="relative">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            <input
                                type="text"
                                value={linkSearchTerm}
                                onChange={(e) => setLinkSearchTerm(e.target.value)}
                                placeholder="Search links..."
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                            />
                        </div>
                    </div>

                    {/* Tabs List */}
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {filteredTabs.map((tab, tabIndex) => (
                            <div key={tab.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                                {/* Tab Header */}
                                <button
                                    onClick={() => toggleTab(tab.id)}
                                    className="w-full px-4 py-3 flex items-center justify-between text-left active:bg-slate-50 dark:active:bg-slate-800 touch-manipulation"
                                    style={{ minHeight: '44px' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-xs font-bold flex items-center justify-center">
                                            {tabIndex + 1}
                                        </span>
                                        <span onClick={(e) => e.stopPropagation()}>
                                            <TitleEmojiPicker
                                                value={tab.emoji || ''}
                                                onChange={(emoji) => {
                                                    onTabsChange(editTabs.map(t => t.id === tab.id ? { ...t, emoji: emoji.trim() || undefined } : t));
                                                }}
                                                size="sm"
                                                title="Tab emoji"
                                            />
                                        </span>
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                            {tab.title || 'Untitled Tab'}
                                        </span>
                                    </div>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2}
                                        stroke="currentColor"
                                        className={`w-5 h-5 text-slate-400 transition-transform ${expandedTabs.has(tab.id) ? 'rotate-180' : ''}`}
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                    </svg>
                                </button>

                                {/* Tab Content */}
                                {expandedTabs.has(tab.id) && (
                                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 space-y-3">
                                        {/* Add Section Button */}
                                        <button
                                            onClick={() => handleAddSection(tab.id)}
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700 touch-manipulation"
                                            style={{ minHeight: '44px' }}
                                        >
                                            + Add Section
                                        </button>

                                        {/* Sections */}
                                        {tab.sections?.map((section, sectionIndex) => (
                                            <div key={section.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                                {/* Section Header */}
                                                <button
                                                    onClick={() => toggleSection(section.id)}
                                                    className="w-full px-3 py-2 flex items-center justify-between text-left active:bg-slate-50 dark:active:bg-slate-700 touch-manipulation"
                                                    style={{ minHeight: '44px' }}
                                                >
                                                    <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                                        <span onClick={(e) => e.stopPropagation()}>
                                                            <TitleEmojiPicker
                                                                value={section.emoji || ''}
                                                                onChange={(emoji) => {
                                                                    onTabsChange(editTabs.map(t => t.id === tab.id
                                                                        ? { ...t, sections: (t.sections || []).map(s => s.id === section.id ? { ...s, emoji: emoji.trim() || undefined } : s) }
                                                                        : t));
                                                                }}
                                                                size="sm"
                                                                title="Section emoji"
                                                            />
                                                        </span>
                                                        #{sectionIndex + 1} {section.title || 'Untitled Section'}
                                                    </span>
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        strokeWidth={2}
                                                        stroke="currentColor"
                                                        className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.has(section.id) ? 'rotate-180' : ''}`}
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                    </svg>
                                                </button>

                                                {/* Section Content */}
                                                {expandedSections.has(section.id) && (
                                                    <div className="px-3 py-3 space-y-3 border-t border-slate-200 dark:border-slate-700">
                                                        {/* Add Link Button */}
                                                        <button
                                                            onClick={() => setShowAddLinkForm(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                                            className="w-full px-3 py-2 bg-brand-50 dark:bg-brand-900/20 border border-brand-300 dark:border-brand-700 rounded-lg text-sm font-medium text-brand-700 dark:text-brand-300 active:bg-brand-100 dark:active:bg-brand-900/30 touch-manipulation"
                                                            style={{ minHeight: '44px' }}
                                                        >
                                                            {showAddLinkForm[section.id] ? '− Cancel' : '+ Add Link'}
                                                        </button>

                                                        {/* Add Link Form */}
                                                        {showAddLinkForm[section.id] && (
                                                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Link Label (Rich Text)
                                                                    </label>
                                                                    <MobileRichTextEditor
                                                                        value={newLinkState[section.id]?.label || ''}
                                                                        onChange={(value) => updateNewLinkState(section.id, 'label', value)}
                                                                        placeholder="Enter link name..."
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        URL
                                                                    </label>
                                                                    <input
                                                                        type="url"
                                                                        value={newLinkState[section.id]?.url || ''}
                                                                        onChange={(e) => updateNewLinkState(section.id, 'url', e.target.value)}
                                                                        placeholder="https://…  http://…  ssh://user@host:22  or vnc://host:5900"
                                                                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 font-mono"
                                                                        style={{ minHeight: '44px' }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Emoji
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={newLinkState[section.id]?.icon || ''}
                                                                        onChange={(e) => updateNewLinkState(section.id, 'icon', e.target.value)}
                                                                        placeholder="🔗"
                                                                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                        style={{ minHeight: '44px' }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Text Color
                                                                    </label>
                                                                    <div className="flex gap-2 items-center">
                                                                        <input
                                                                            type="color"
                                                                            value={newLinkState[section.id]?.textColor && newLinkState[section.id]!.textColor.trim() ? newLinkState[section.id]!.textColor : '#000000'}
                                                                            onChange={(e) => updateNewLinkState(section.id, 'textColor', e.target.value)}
                                                                            className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer touch-manipulation"
                                                                            style={{ minHeight: '44px', minWidth: '44px' }}
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={newLinkState[section.id]?.textColor || ''}
                                                                            onChange={(e) => updateNewLinkState(section.id, 'textColor', e.target.value)}
                                                                            placeholder="#000000"
                                                                            className="flex-1 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 font-mono"
                                                                            style={{ minHeight: '44px' }}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateNewLinkState(section.id, 'textColor', '')}
                                                                            className="px-3 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium touch-manipulation"
                                                                            style={{ minHeight: '44px' }}
                                                                        >
                                                                            Clear
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Visibility
                                                                    </label>
                                                                    <select
                                                                        value={newLinkState[section.id]?.visibility || 'public'}
                                                                        onChange={(e) => updateNewLinkState(section.id, 'visibility', e.target.value as LinkVisibility)}
                                                                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                        style={{ minHeight: '44px' }}
                                                                    >
                                                                        {user?.is_admin && <option value="public">Public (visible to everyone)</option>}
                                                                        {user?.is_admin && <option value="authenticated">Authenticated (logged-in users only)</option>}
                                                                        <option value="private">Private (specific users only)</option>
                                                                    </select>
                                                                </div>
                                                                {newLinkState[section.id]?.visibility === 'private' && isAuthenticated && (
                                                                    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                                                Select Users
                                                                            </label>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowLinkUserPicker(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                                                                className="text-xs text-brand-600 dark:text-brand-400 font-medium"
                                                                            >
                                                                                {showLinkUserPicker[section.id] ? 'Hide' : 'Show'}
                                                                            </button>
                                                                        </div>
                                                                        {(newLinkState[section.id]?.allowedUsers || []).length > 0 && (
                                                                            <div className="flex flex-wrap gap-2 mb-2">
                                                                                {(newLinkState[section.id]?.allowedUsers || []).map(userId => {
                                                                                    const user = usersList.find(u => u.id === userId);
                                                                                    return (
                                                                                        <span
                                                                                            key={userId}
                                                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs"
                                                                                        >
                                                                                            {user?.username || `User ${userId}`}
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => updateNewLinkState(section.id, 'allowedUsers', (newLinkState[section.id]?.allowedUsers || []).filter(id => id !== userId))}
                                                                                                className="hover:text-red-600"
                                                                                            >
                                                                                                ×
                                                                                            </button>
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                        {showLinkUserPicker[section.id] && (
                                                                            <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 p-2 space-y-1">
                                                                                {usersList.map(user => (
                                                                                    <label
                                                                                        key={user.id}
                                                                                        className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer touch-manipulation"
                                                                                        style={{ minHeight: '44px' }}
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={(newLinkState[section.id]?.allowedUsers || []).includes(user.id)}
                                                                                            onChange={(e) => {
                                                                                                const current = newLinkState[section.id]?.allowedUsers || [];
                                                                                                if (e.target.checked) {
                                                                                                    updateNewLinkState(section.id, 'allowedUsers', [...current, user.id]);
                                                                                                } else {
                                                                                                    updateNewLinkState(section.id, 'allowedUsers', current.filter(id => id !== user.id));
                                                                                                }
                                                                                            }}
                                                                                            className="rounded border-slate-300 dark:border-slate-600 text-brand-600 w-4 h-4"
                                                                                        />
                                                                                        <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                                                                    </label>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Notes
                                                                    </label>
                                                                    <textarea
                                                                        value={newLinkState[section.id]?.notes || ''}
                                                                        onChange={(e) => updateNewLinkState(section.id, 'notes', e.target.value)}
                                                                        placeholder="Add notes..."
                                                                        rows={2}
                                                                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Hover Tooltip
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={newLinkState[section.id]?.tooltip || ''}
                                                                        onChange={(e) => updateNewLinkState(section.id, 'tooltip', e.target.value)}
                                                                        placeholder="Text shown on hover..."
                                                                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                        style={{ minHeight: '44px' }}
                                                                    />
                                                                </div>
                                                                {(settings as any)?.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                                                    <div>
                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                            Open link in
                                                                        </label>
                                                                        <select
                                                                            value={newLinkState[section.id]?.browser || 'default'}
                                                                            onChange={(e) => updateNewLinkState(section.id, 'browser', e.target.value)}
                                                                            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                            style={{ minHeight: '44px' }}
                                                                        >
                                                                            <option value="default">Default Browser</option>
                                                                            {(availableBrowsers || []).map(browserId => {
                                                                                const displayName = browserId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                                                                return <option key={browserId} value={browserId}>{displayName}</option>;
                                                                            })}
                                                                        </select>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Information Content (Rich Text)
                                                                    </label>
                                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                        If provided, clicking this link will open a rich text dialog instead of navigating to the URL.
                                                                    </p>
                                                                    <MobileRichTextEditor
                                                                        value={newLinkState[section.id]?.richTextContent || ''}
                                                                        onChange={(value) => updateNewLinkState(section.id, 'richTextContent', value)}
                                                                        placeholder="Enter rich text content..."
                                                                    />
                                                                </div>
                                                                <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border-2 ${
                                                                    newLinkState[section.id]?.maintenanceEnabled
                                                                        ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                                                }`}>
                                                                    <div>
                                                                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Maintenance window</div>
                                                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                            {newLinkState[section.id]?.maintenanceEnabled ? 'On' : 'Off'}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        role="switch"
                                                                        aria-checked={!!newLinkState[section.id]?.maintenanceEnabled}
                                                                        onClick={() => updateNewLinkState(section.id, 'maintenanceEnabled', !newLinkState[section.id]?.maintenanceEnabled)}
                                                                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${newLinkState[section.id]?.maintenanceEnabled ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                    >
                                                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${newLinkState[section.id]?.maintenanceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                    </button>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                        Maintenance message
                                                                    </label>
                                                                    <MobileRichTextEditor
                                                                        value={newLinkState[section.id]?.maintenanceMessage || ''}
                                                                        onChange={(value) => updateNewLinkState(section.id, 'maintenanceMessage', value)}
                                                                        placeholder="Describe the maintenance window..."
                                                                    />
                                                                </div>
                                                                <LinkMaintenanceVideoField
                                                                    value={newLinkState[section.id]?.maintenanceVideoUrl || ''}
                                                                    onChange={(url) => updateNewLinkState(section.id, 'maintenanceVideoUrl', url)}
                                                                />
                                                                <button
                                                                    onClick={() => handleAddLink(tab.id, section.id)}
                                                                    className="w-full px-4 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold active:bg-brand-700 touch-manipulation"
                                                                    style={{ minHeight: '44px' }}
                                                                >
                                                                    Save Link
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Links List */}
                                                        {section.links && section.links.length > 0 && (
                                                            <div className="space-y-2">
                                                                {section.links.map(link => {
                                                                    const isEditing = editingLink?.linkId === link.id && editingLink?.sectionId === section.id && editingLink?.tabId === tab.id;
                                                                    return (
                                                                        <div key={link.id}>
                                                                            {isEditing ? (
                                                                                /* Edit Link Form */
                                                                                <div className="p-3 bg-brand-50 dark:bg-brand-900/20 border-2 border-brand-500 dark:border-brand-500/50 rounded-lg space-y-3">
                                                                                    <div className="flex items-center justify-between mb-2">
                                                                                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Edit Link</h4>
                                                                                        <button
                                                                                            onClick={handleCancelEditLink}
                                                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors touch-manipulation"
                                                                                            style={{ minHeight: '44px', minWidth: '44px' }}
                                                                                            title="Cancel editing"
                                                                                        >
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                                            </svg>
                                                                                        </button>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Link Label (Rich Text)
                                                                                        </label>
                                                                                        <MobileRichTextEditor
                                                                                            value={editLinkState[link.id]?.label || ''}
                                                                                            onChange={(value) => updateEditLinkState(link.id, 'label', value)}
                                                                                            placeholder="Enter link name..."
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            URL
                                                                                        </label>
                                                                                        <input
                                                                                            type="url"
                                                                                            value={editLinkState[link.id]?.url || ''}
                                                                                            onChange={(e) => updateEditLinkState(link.id, 'url', e.target.value)}
                                                                                            placeholder="https://…  http://…  ssh://user@host:22  or vnc://host:5900"
                                                                                            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 font-mono"
                                                                                            style={{ minHeight: '44px' }}
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Emoji
                                                                                        </label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editLinkState[link.id]?.icon || ''}
                                                                                            onChange={(e) => updateEditLinkState(link.id, 'icon', e.target.value)}
                                                                                            placeholder="🔗"
                                                                                            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                            style={{ minHeight: '44px' }}
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Text Color
                                                                                        </label>
                                                                                        <div className="flex gap-2 items-center">
                                                                                            <input
                                                                                                type="color"
                                                                                                value={editLinkState[link.id]?.textColor && editLinkState[link.id]!.textColor.trim() ? editLinkState[link.id]!.textColor : '#000000'}
                                                                                                onChange={(e) => updateEditLinkState(link.id, 'textColor', e.target.value)}
                                                                                                className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer touch-manipulation"
                                                                                                style={{ minHeight: '44px', minWidth: '44px' }}
                                                                                            />
                                                                                            <input
                                                                                                type="text"
                                                                                                value={editLinkState[link.id]?.textColor || ''}
                                                                                                onChange={(e) => updateEditLinkState(link.id, 'textColor', e.target.value)}
                                                                                                placeholder="#000000"
                                                                                                className="flex-1 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 font-mono"
                                                                                                style={{ minHeight: '44px' }}
                                                                                            />
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => updateEditLinkState(link.id, 'textColor', '')}
                                                                                                className="px-3 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium touch-manipulation"
                                                                                                style={{ minHeight: '44px' }}
                                                                                            >
                                                                                                Clear
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Visibility
                                                                                        </label>
                                                                                        <select
                                                                                            value={editLinkState[link.id]?.visibility || 'public'}
                                                                                            onChange={(e) => updateEditLinkState(link.id, 'visibility', e.target.value as LinkVisibility)}
                                                                                            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                            style={{ minHeight: '44px' }}
                                                                                        >
                                                                                            {user?.is_admin && <option value="public">Public (visible to everyone)</option>}
                                                                                            {user?.is_admin && <option value="authenticated">Authenticated (logged-in users only)</option>}
                                                                                            <option value="private">Private (specific users only)</option>
                                                                                        </select>
                                                                                    </div>
                                                                                    {editLinkState[link.id]?.visibility === 'private' && isAuthenticated && (
                                                                                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                                                                            <div className="flex items-center justify-between mb-2">
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                                                                    Select Users
                                                                                                </label>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setShowLinkUserPicker(prev => ({ ...prev, [link.id]: !prev[link.id] }))}
                                                                                                    className="text-xs text-brand-600 dark:text-brand-400 font-medium"
                                                                                                >
                                                                                                    {showLinkUserPicker[link.id] ? 'Hide' : 'Show'}
                                                                                                </button>
                                                                                            </div>
                                                                                            {(editLinkState[link.id]?.allowedUsers || []).length > 0 && (
                                                                                                <div className="flex flex-wrap gap-2 mb-2">
                                                                                                    {(editLinkState[link.id]?.allowedUsers || []).map(userId => {
                                                                                                        const user = usersList.find(u => u.id === userId);
                                                                                                        return (
                                                                                                            <span
                                                                                                                key={userId}
                                                                                                                className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs"
                                                                                                            >
                                                                                                                {user?.username || `User ${userId}`}
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => updateEditLinkState(link.id, 'allowedUsers', (editLinkState[link.id]?.allowedUsers || []).filter(id => id !== userId))}
                                                                                                                    className="hover:text-red-600"
                                                                                                                >
                                                                                                                    ×
                                                                                                                </button>
                                                                                                            </span>
                                                                                                        );
                                                                                                    })}
                                                                                                </div>
                                                                                            )}
                                                                                            {showLinkUserPicker[link.id] && (
                                                                                                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 p-2 space-y-1">
                                                                                                    {usersList.map(user => (
                                                                                                        <label
                                                                                                            key={user.id}
                                                                                                            className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer touch-manipulation"
                                                                                                            style={{ minHeight: '44px' }}
                                                                                                        >
                                                                                                            <input
                                                                                                                type="checkbox"
                                                                                                                checked={(editLinkState[link.id]?.allowedUsers || []).includes(user.id)}
                                                                                                                onChange={(e) => {
                                                                                                                    const current = editLinkState[link.id]?.allowedUsers || [];
                                                                                                                    if (e.target.checked) {
                                                                                                                        updateEditLinkState(link.id, 'allowedUsers', [...current, user.id]);
                                                                                                                    } else {
                                                                                                                        updateEditLinkState(link.id, 'allowedUsers', current.filter(id => id !== user.id));
                                                                                                                    }
                                                                                                                }}
                                                                                                                className="rounded border-slate-300 dark:border-slate-600 text-brand-600 w-4 h-4"
                                                                                                            />
                                                                                                            <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                                                                                        </label>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Notes
                                                                                        </label>
                                                                                        <textarea
                                                                                            value={editLinkState[link.id]?.notes || ''}
                                                                                            onChange={(e) => updateEditLinkState(link.id, 'notes', e.target.value)}
                                                                                            placeholder="Add notes..."
                                                                                            rows={2}
                                                                                            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Hover Tooltip
                                                                                        </label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editLinkState[link.id]?.tooltip || ''}
                                                                                            onChange={(e) => updateEditLinkState(link.id, 'tooltip', e.target.value)}
                                                                                            placeholder="Text shown on hover..."
                                                                                            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                            style={{ minHeight: '44px' }}
                                                                                        />
                                                                                    </div>
                                                                                    {(settings as any)?.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                                                                        <div>
                                                                                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                                Open link in
                                                                                            </label>
                                                                                            <select
                                                                                                value={editLinkState[link.id]?.browser || 'default'}
                                                                                                onChange={(e) => updateEditLinkState(link.id, 'browser', e.target.value)}
                                                                                                className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                                                                style={{ minHeight: '44px' }}
                                                                                            >
                                                                                                <option value="default">Default Browser</option>
                                                                                                {(availableBrowsers || []).map(browserId => {
                                                                                                    const displayName = browserId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                                                                                    return <option key={browserId} value={browserId}>{displayName}</option>;
                                                                                                })}
                                                                                            </select>
                                                                                        </div>
                                                                                    )}
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Information Content (Rich Text)
                                                                                        </label>
                                                                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                                            If provided, clicking this link will open a rich text dialog instead of navigating to the URL.
                                                                                        </p>
                                                                                        <MobileRichTextEditor
                                                                                            value={editLinkState[link.id]?.richTextContent || ''}
                                                                                            onChange={(value) => updateEditLinkState(link.id, 'richTextContent', value)}
                                                                                            placeholder="Enter rich text content..."
                                                                                        />
                                                                                    </div>
                                                                                    <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border-2 ${
                                                                                        editLinkState[link.id]?.maintenanceEnabled
                                                                                            ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                                                                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                                                                    }`}>
                                                                                        <div>
                                                                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Maintenance window</div>
                                                                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                                                {editLinkState[link.id]?.maintenanceEnabled ? 'On' : 'Off'}
                                                                                            </div>
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            role="switch"
                                                                                            aria-checked={!!editLinkState[link.id]?.maintenanceEnabled}
                                                                                            onClick={() => updateEditLinkState(link.id, 'maintenanceEnabled', !editLinkState[link.id]?.maintenanceEnabled)}
                                                                                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${editLinkState[link.id]?.maintenanceEnabled ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                                        >
                                                                                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${editLinkState[link.id]?.maintenanceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                                                        </button>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                                                                                            Maintenance message
                                                                                        </label>
                                                                                        <MobileRichTextEditor
                                                                                            value={editLinkState[link.id]?.maintenanceMessage || ''}
                                                                                            onChange={(value) => updateEditLinkState(link.id, 'maintenanceMessage', value)}
                                                                                            placeholder="Describe the maintenance window..."
                                                                                        />
                                                                                    </div>
                                                                                    <LinkMaintenanceVideoField
                                                                                        value={editLinkState[link.id]?.maintenanceVideoUrl || ''}
                                                                                        onChange={(url) => updateEditLinkState(link.id, 'maintenanceVideoUrl', url)}
                                                                                    />
                                                                                    <div className="flex gap-2">
                                                                                        <button
                                                                                            onClick={handleCancelEditLink}
                                                                                            className="flex-1 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-semibold active:bg-slate-400 dark:active:bg-slate-500 touch-manipulation"
                                                                                            style={{ minHeight: '44px' }}
                                                                                        >
                                                                                            Cancel
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleSaveEditLink(tab.id, section.id, link.id)}
                                                                                            className="flex-1 px-4 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold active:bg-brand-700 touch-manipulation"
                                                                                            style={{ minHeight: '44px' }}
                                                                                        >
                                                                                            Save
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                /* Link Display */
                                                                                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                                                                                    <div className="flex items-center justify-between">
                                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                                            <span className="text-lg">{link.icon || '🔗'}</span>
                                                                                            <div className="flex-1 min-w-0">
                                                                                                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                                                                                    {link.label || 'Untitled Link'}
                                                                                                </div>
                                                                                                <LinkMaintenanceBadge link={link} compact className="mt-0.5" />
                                                                                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                                                                    {link.url}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="flex gap-1">
                                                                                            <button
                                                                                                onClick={() => handleCloneLink(tab.id, section.id, link.id)}
                                                                                                className="p-2 text-emerald-500 hover:text-emerald-600 active:bg-emerald-50 dark:active:bg-emerald-900/20 rounded-lg touch-manipulation"
                                                                                                style={{ minHeight: '44px', minWidth: '44px' }}
                                                                                                title="Clone Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                                                                    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                                                    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleStartEditLink(tab.id, section.id, link.id)}
                                                                                                className="p-2 text-brand-500 hover:text-brand-600 active:bg-brand-50 dark:active:bg-brand-900/20 rounded-lg touch-manipulation"
                                                                                                style={{ minHeight: '44px', minWidth: '44px' }}
                                                                                                title="Edit Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleDeleteLink(tab.id, section.id, link.id)}
                                                                                                className="p-2 text-red-500 hover:text-red-600 active:bg-red-50 dark:active:bg-red-900/20 rounded-lg touch-manipulation"
                                                                                                style={{ minHeight: '44px', minWidth: '44px' }}
                                                                                                title="Delete Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                                </svg>
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
