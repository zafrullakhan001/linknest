import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tile, Link, LinkSection, Tab, LinkVisibility, TileVisibility, COLOR_STYLES, THEME_COLORS, ThemeColor, POPULAR_EMOJIS, LINK_EMOJIS, ALL_LINK_EMOJIS, TileMessage } from '../types';
import { linkHealthService, LinkHealthMap } from '../services/linkHealthService';
import { performanceAnalyticsService, type AnalyticsMetric } from '../services/performanceAnalyticsService';
import { authService, UserListItem, User } from '../services/authService';
import { exportTileToFile } from '../services/spaceTransferService';
import { cloneTile, getTiles, saveTile, toggleLinkFavorite, createTempVersion } from '../services/storageService';
import { useSettings } from '../contexts/SettingsContext';
import { RichTextEditor } from './RichTextEditor';
import { RichTextContentItem } from './RichTextContentItem';
import { RichTextContent } from '../types';
import { isPublicLinkFavorite, togglePublicLinkFavorite } from '../services/publicFavoritesService';
import { LinkInfoDialog } from './LinkInfoDialog';
import { MobileTileEdit } from './MobileTileEdit';
import { useMobile } from '../hooks/useMobile';
import { VersionDiffViewer } from './VersionDiffViewer';

// Resolve API base dynamically
function resolveApiBase(): string {
    const envBase = (import.meta as any)?.env?.VITE_API_BASE;
    if (envBase) {
        return envBase;
    }

    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '';
        if (path !== '/' && path.length > 1) {
            const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
            if (cleanPath && cleanPath !== '/') {
                return `${cleanPath}/api`;
            }
        }
    }

    return '/api';
}

interface TileVersion {
    id: number;
    version_number: number;
    created_at: number;
    user_id: number;
    username: string;
    changelog_summary: string | null;
    is_locked: boolean;
    tags?: string[] | null;
    comments?: string | null;
}

interface TileDetailProps {
    tile: Tile;
    allTiles: Tile[];
    onUpdateTiles: (tiles: Tile[], skipReload?: boolean, isFinal?: boolean) => void;
    isAuthenticated?: boolean;
    onAuthRequired?: () => void;
    sourceTab?: 'public' | 'your-apps' | 'private' | 'favorites' | 'public-favorites' | null;
    user?: User | null;
}
// Enhanced emoji categories with more emojis
const EMOJI_CATEGORIES = {
    servers: ['🖥️', '💾', '🖨️', '📡', '🔄', '⚙️', '🔧', '🛠️', '📦', '🗄️', '🗃️', '📊', '📈', '📉', '🔌', '🔋', '⚡', '🌐', '🌍', '🌎', '🖱️', '⌨️', '🖲️', '💿', '💽', '📀', '📼', '📷', '📸', '📹', '🎥'],
    cloud: ['☁️', '🌥️', '⛅', '🌤️', '☀️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☂️', '☔', '🌈', '🌊', '💧', '💨', '🌪️', '🌀', '🌫️'],
    onprem: ['🏢', '🏭', '🏗️', '🏛️', '🏘️', '🏠', '🏡', '🏚️', '🏙️', '🌆', '🌇', '🌃', '🌉', '🌁', '🗼', '🗽', '⛪', '🕌', '🕍', '🛕'],
    hospital: ['🏥', '⚕️', '🩺', '💊', '💉', '🩹', '🩼', '🦽', '🦼', '🚑', '🚨', '🏨', '👨‍⚕️', '👩‍⚕️', '🧑‍⚕️', '👨‍🔬', '👩‍🔬', '🧑‍🔬', '🔬', '🧪', '🫀', '🫁', '🧠', '🦷', '🦴'],
    technology: ['💻', '⌨️', '🖱️', '🖲️', '🖨️', '🖥️', '📱', '📲', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📺', '📻', '📟', '☎️', '📞', '📠', '📧'],
    network: ['🌐', '📡', '📶', '📞', '☎️', '📠', '📧', '📨', '📩', '📤', '📥', '📦', '📪', '📫', '📬', '📭', '📮', '🗳️', '📯', '📜', '🔗', '⛓️', '🔌', '💡', '⚡'],
    security: ['🔐', '🔒', '🔓', '🔑', '🗝️', '🛡️', '⚔️', '🗡️', '🔪', '🛠️', '🔧', '🔩', '⚙️', '⛓️', '🔗', '🔫', '💣', '🧨', '🎯', '🚨', '🚔', '🚓', '👮', '🕵️', '🦹'],
    data: ['📊', '📈', '📉', '📋', '📌', '📍', '🗂️', '📁', '📂', '🗂️', '🗄️', '🗃️', '📑', '📃', '📄', '📜', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚'],
    communication: ['💬', '💭', '🗨️', '🗯️', '💢', '👤', '👥', '🗣️', '👂', '👃', '👀', '👁️', '👄', '💋', '💌', '💍', '💎', '🎁', '🎉', '🎊'],
    popular: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝'],
    objects: ['📱', '⌚', '📷', '📹', '🎥', '📺', '📻', '🔊', '🔉', '🔈', '🔇', '📢', '📣', '📯', '🔔', '🔕', '📻', '📡', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '🖱️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️']
};

// Emoji Picker Tabs Component
const EmojiPickerTabs: React.FC<{
    linkId: string;
    editLinkState: any;
    updateEditLinkState: (linkId: string, field: string, value: any) => void;
    setShowLinkEmojiPicker: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ linkId, editLinkState, updateEditLinkState, setShowLinkEmojiPicker }) => {
    const [activeTab, setActiveTab] = useState<string>('popular');
    const [searchTerm, setSearchTerm] = useState('');

    const categories = [
        { id: 'popular', name: 'Popular', emojis: EMOJI_CATEGORIES.popular },
        { id: 'servers', name: 'Servers', emojis: EMOJI_CATEGORIES.servers },
        { id: 'cloud', name: 'Cloud', emojis: EMOJI_CATEGORIES.cloud },
        { id: 'technology', name: 'Tech', emojis: EMOJI_CATEGORIES.technology },
        { id: 'network', name: 'Network', emojis: EMOJI_CATEGORIES.network },
        { id: 'security', name: 'Security', emojis: EMOJI_CATEGORIES.security },
        { id: 'data', name: 'Data', emojis: EMOJI_CATEGORIES.data },
        { id: 'hospital', name: 'Medical', emojis: EMOJI_CATEGORIES.hospital },
        { id: 'onprem', name: 'On-Prem', emojis: EMOJI_CATEGORIES.onprem },
        { id: 'communication', name: 'Chat', emojis: EMOJI_CATEGORIES.communication },
        { id: 'objects', name: 'Objects', emojis: EMOJI_CATEGORIES.objects },
        { id: 'symbols', name: 'Symbols', emojis: EMOJI_CATEGORIES.symbols }
    ];

    // Get all emojis for search
    const allEmojis = categories.flatMap(cat => cat.emojis);
    const uniqueEmojis = Array.from(new Set(allEmojis));

    const filteredEmojis = searchTerm
        ? uniqueEmojis.filter(emoji => emoji.includes(searchTerm))
        : categories.find(cat => cat.id === activeTab)?.emojis || [];

    return (
        <div className="flex flex-col h-full max-h-[400px]">
            {/* Search - Update search term when typing in parent input */}
            <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        if (e.target.value) {
                            setActiveTab('');
                        }
                    }}
                    placeholder="Search emojis..."
                    className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
                />
            </div>

            {/* Tabs */}
            {!searchTerm && (
                <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
                    {categories.map(category => (
                        <button
                            key={category.id}
                            onClick={() => {
                                setActiveTab(category.id);
                                setSearchTerm('');
                            }}
                            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === category.id
                                ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                        >
                            {category.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Emoji Grid */}
            <div className="flex-1 overflow-y-auto p-3">
                {filteredEmojis.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {filteredEmojis.map((emoji, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                    updateEditLinkState(linkId, 'icon', emoji);
                                    setShowLinkEmojiPicker(prev => ({ ...prev, [linkId]: false }));
                                }}
                                className="text-2xl hover:bg-brand-100 dark:hover:bg-brand-900/30 p-2 rounded-lg transition-all hover:scale-110"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                ) : searchTerm ? (
                    <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                        No emojis found. Try a different search term.
                    </div>
                ) : null}
            </div>

            {/* Footer with link to more emojis */}
            <div className="p-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center">
                <a
                    href="https://emojipedia.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1.5"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Get more emojis from Emojipedia
                </a>
            </div>
        </div>
    );
};

const generateId = () => Math.random().toString(36).substring(2, 9);

export const TileDetail: React.FC<TileDetailProps> = ({
    tile,
    allTiles,
    onUpdateTiles,
    isAuthenticated = false,
    onAuthRequired,
    sourceTab = null,
    user
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const autoSavingRef = useRef(false);
    const tempVersionCreatedRef = useRef<{ tileId: string | null; active: boolean }>({ tileId: null, active: false });

    // Edit State
    const [editTitle, setEditTitle] = useState(tile.title);
    const [editDesc, setEditDesc] = useState(tile.description);
    const [editHtml, setEditHtml] = useState(tile.htmlContent || '');
    const [editEmoji, setEditEmoji] = useState(tile.emoji);
    const [editColor, setEditColor] = useState<ThemeColor>(tile.themeColor);
    const [editVisibility, setEditVisibility] = useState<TileVisibility>(tile.visibility || 'public');
    const [editAllowedUsers, setEditAllowedUsers] = useState<number[]>(() => {
        // Always include owner in allowed users list for initialization
        const allowedUsers = tile.allowedUsers || [];
        if (tile.userId) {
            const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
            if (!allowedUsers.includes(ownerIdNum)) {
                return [...allowedUsers, ownerIdNum];
            }
        }
        return allowedUsers;
    });
    const [editAllowedGroups, setEditAllowedGroups] = useState<number[]>(tile.allowedGroups || []);
    const [availableGroups, setAvailableGroups] = useState<Array<{ id: number; name: string; description: string | null; memberCount: number }>>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [editBrowser, setEditBrowser] = useState<string>(tile.browser || 'default');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showTileUserSelector, setShowTileUserSelector] = useState(false);
    const [visibilitySearchTerm, setVisibilitySearchTerm] = useState('');
    const [visibilityActiveTab, setVisibilityActiveTab] = useState<'users' | 'groups'>('users');

    const { settings } = useSettings();
    const isMobile = useMobile(768); // Use mobile layout below 768px

    // Tabs State (new structure)
    const [editTabs, setEditTabs] = useState<Tab[]>(() => {
        const tabs = tile.tabs || [];
        // Ensure all sections are sorted by position
        return tabs.map(tab => ({
            ...tab,
            sections: tab.sections ? [...tab.sections]
                .sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA - posB;
                })
                .map((section, idx) => ({
                    ...section,
                    position: section.position ?? idx
                })) : []
        }));
    });
    // Sections State (for backward compatibility)
    const [editSections, setEditSections] = useState<LinkSection[]>(tile.sections || []);

    // Temporary State for Adding Links (keyed by section ID)
    const [newLinkState, setNewLinkState] = useState<Record<string, { label: string, url: string, icon: string, textColor: string, visibility: LinkVisibility, allowedUsers: number[], allowedGroups: number[], notes: string, tooltip: string, browser: string, richTextContent: string }>>({});

    // Selection State for Bulk Actions
    const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);

    // State for Editing Links (keyed by link ID)
    const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
    const [editLinkState, setEditLinkState] = useState<Record<string, { label: string, url: string, icon: string, textColor: string, visibility: LinkVisibility, allowedUsers: number[], allowedGroups: number[], notes: string, tooltip: string, browser: string, richTextContent: string }>>({});

    // Available browsers from BrowserLauncher API
    const [availableBrowsers, setAvailableBrowsers] = useState<string[]>([]);

    // State for browser selection menu (keyed by link ID)
    const [showBrowserMenu, setShowBrowserMenu] = useState<Record<string, boolean>>({});
    const [browserMenuPosition, setBrowserMenuPosition] = useState<Record<string, { x: number; y: number }>>({});
    const [saveBrowserForLink, setSaveBrowserForLink] = useState<Record<string, boolean>>({});
    const [selectedBrowserForLink, setSelectedBrowserForLink] = useState<Record<string, string>>({});

    // State for link emoji picker visibility (keyed by section ID or link ID)
    const [showLinkEmojiPicker, setShowLinkEmojiPicker] = useState<Record<string, boolean>>({});

    // Users list for private link selection
    const [usersList, setUsersList] = useState<UserListItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [showUserPicker, setShowUserPicker] = useState<Record<string, boolean>>({});

    // View State
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    // Initialize selectedTabId from localStorage, keyed by tile ID
    const [selectedTabId, setSelectedTabId] = useState<string | null>(() => {
        try {
            const savedTabId = localStorage.getItem(`tile_selected_tab_${tile.id}`);
            return savedTabId || null;
        } catch {
            return null;
        }
    });

    // Save selectedTabId to localStorage whenever it changes
    useEffect(() => {
        if (selectedTabId) {
            try {
                localStorage.setItem(`tile_selected_tab_${tile.id}`, selectedTabId);
            } catch (error) {
                console.error('Failed to save selected tab to localStorage:', error);
            }
        }
    }, [selectedTabId, tile.id]);

    // Reload selected tab from localStorage when tile changes (when viewing a different tile)
    // This needs to run before the tab initialization useEffect
    useEffect(() => {
        try {
            const savedTabId = localStorage.getItem(`tile_selected_tab_${tile.id}`);
            // Set to null first, then the initialization useEffect will validate and set it properly
            setSelectedTabId(savedTabId || null);
        } catch (error) {
            console.error('Failed to load selected tab from localStorage:', error);
            setSelectedTabId(null);
        }
    }, [tile.id]);
    const [viewLayout, setViewLayout] = useState<'stacked' | 'side-by-side'>(() => {
        // Load saved preference from localStorage
        try {
            const saved = localStorage.getItem('linknest_view_layout');
            return (saved === 'side-by-side' || saved === 'stacked') ? saved : 'side-by-side';
        } catch {
            return 'side-by-side';
        }
    });

    // Visibility Dialog State
    const [visibilityDialogTab, setVisibilityDialogTab] = useState<string | null>(null);
    const [visibilityDialogSection, setVisibilityDialogSection] = useState<{ tabId: string; sectionId: string } | null>(null);

    // Scheduling Dialog State
    const [schedulingDialogTab, setSchedulingDialogTab] = useState<string | null>(null);
    const [schedulingDialogSection, setSchedulingDialogSection] = useState<{ tabId: string; sectionId: string } | null>(null);
    const [schedulingDialogLink, setSchedulingDialogLink] = useState<{ tabId: string; sectionId: string; linkId: string } | null>(null);
    const [schedulingDialogRichText, setSchedulingDialogRichText] = useState<{ tabId: string; sectionId: string; richTextId: string } | null>(null);

    // Health Check State
    const [linkHealth, setLinkHealth] = useState<LinkHealthMap>({});
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [checkingLinkId, setCheckingLinkId] = useState<string | null>(null);

    // CSV Import State
    const [csvImportFile, setCsvImportFile] = useState<Record<string, File | null>>({});
    const [importingCsv, setImportingCsv] = useState<Record<string, boolean>>({});

    // Add Link Form Visibility State
    const [showAddLinkForm, setShowAddLinkForm] = useState<Record<string, boolean>>({});

    // Rich Text Content State
    const [editingRichTextId, setEditingRichTextId] = useState<Record<string, string | null>>({}); // sectionId -> richTextId
    const [showAddRichTextForm, setShowAddRichTextForm] = useState<Record<string, boolean>>({});
    const [newRichTextContent, setNewRichTextContent] = useState<Record<string, string>>({}); // sectionId -> content

    // Link Search State (for edit mode)
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
    const [notesDialogState, setNotesDialogState] = useState<{ linkId: string; notes: string; linkLabel: string } | null>(null);
    const [notesCopied, setNotesCopied] = useState(false);
    const [linkInfoDialog, setLinkInfoDialog] = useState<{ link: Link } | null>(null);

    // Version Control State
    const [showVersions, setShowVersions] = useState(false);
    const [tileVersions, setTileVersions] = useState<TileVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [versionActionLoading, setVersionActionLoading] = useState<number | null>(null);

    // Version Filter/Search State
    const [versionSearchTerm, setVersionSearchTerm] = useState('');
    const [versionFilterUser, setVersionFilterUser] = useState<string>('');
    const [versionFilterDateFrom, setVersionFilterDateFrom] = useState<string>('');
    const [versionFilterDateTo, setVersionFilterDateTo] = useState<string>('');
    const [versionFilterTag, setVersionFilterTag] = useState<string>('');

    // Version Compare State
    const [selectedVersionsForCompare, setSelectedVersionsForCompare] = useState<number[]>([]);
    const [isDiffLoading, setIsDiffLoading] = useState(false);

    // Version Edit State (tags/comments)
    const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
    const [editingVersionTags, setEditingVersionTags] = useState<string[]>([]);
    const [editingVersionComments, setEditingVersionComments] = useState<string>('');
    const [newTagInput, setNewTagInput] = useState('');

    // Restore Preview State
    const [restorePreviewVersion, setRestorePreviewVersion] = useState<number | null>(null);

    // Diff Viewer State
    const [diffViewerOpen, setDiffViewerOpen] = useState(false);
    const [diffOriginalTile, setDiffOriginalTile] = useState<any | null>(null);
    const [diffModifiedTile, setDiffModifiedTile] = useState<any | null>(null);
    const [diffTitle, setDiffTitle] = useState('');
    const [diffOriginalVersionMeta, setDiffOriginalVersionMeta] = useState<{
        versionNumber: number;
        createdAt: number;
        username: string;
        changelogSummary?: string | null;
    } | null>(null);
    const [diffModifiedVersionMeta, setDiffModifiedVersionMeta] = useState<{
        versionNumber?: number;
        createdAt?: number;
        username?: string;
        changelogSummary?: string | null;
    } | null>(null);


    // Handle ESC key to close notes dialog
    useEffect(() => {
        if (!notesDialogState) return;

        const handleEscKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setNotesDialogState(null);
                setNotesCopied(false);
            }
        };

        document.addEventListener('keydown', handleEscKey);
        return () => {
            document.removeEventListener('keydown', handleEscKey);
        };
    }, [notesDialogState]);
    const [notesPresetFormState, setNotesPresetFormState] = useState<{ linkId: string } | null>(null);
    const [notesPresetForm, setNotesPresetForm] = useState({
        ownerInfo: '',
        supportTeamInfo: '',
        serviceNowGroupInfo: '',
        businessOwner: '',
        productOwner: '',
        architect: '',
        vendorDetails: '',
        serviceNowDemand: '',
        serviceNowProject: '',
        serviceNowTask: '',
        goLiveInfo: '',
        majorUpgradeInfo: '',
        serviceDeliveryManager: '',
        businessRelationshipManager: '',
        technologyRelationshipManager: ''
    });

    // Auto-scroll to first matching link when search changes
    useEffect(() => {
        if (linkSearchTerm) {
            const allLinks = editTabs.flatMap(tab => tab.sections.flatMap(section => section.links));
            const allRichText = editTabs.flatMap(tab => tab.sections.flatMap(section => section.richTextContent || []));

            const firstLinkMatch = allLinks.find(link =>
                link.label.toLowerCase().includes(linkSearchTerm.toLowerCase())
            );

            const firstRichTextMatch = allRichText.find(rt =>
                rt.content.toLowerCase().includes(linkSearchTerm.toLowerCase())
            );

            // Prioritize link match if both exist, or use whichever comes first in the document would be better but let's just pick one
            const firstMatch = firstLinkMatch || firstRichTextMatch;
            if (firstMatch) {
                setTimeout(() => {
                    const element = document.getElementById(`link-${firstMatch.id}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        }
    }, [linkSearchTerm, editTabs]);

    // Auto-check links when tile is opened
    useEffect(() => {
        // Automatically check tile links when component mounts
        // This ensures analytics data is captured as soon as user opens the tile
        const autoCheckLinks = async () => {
            try {
                // Small delay to allow UI to render first
                await new Promise(resolve => setTimeout(resolve, 500));

                // Get all sections from the tile
                const sections = tile.tabs && tile.tabs.length > 0
                    ? tile.tabs.flatMap(tab => tab.sections)
                    : tile.sections || [];

                // Check if tile has any links
                const hasLinks = sections.some(section =>
                    section.links && section.links.length > 0
                );

                // Only auto-check if tile has links and we're not already checking
                if (hasLinks && !checkingHealth) {
                    handleCheckTileHealth();
                }
            } catch (error) {
                console.debug('Auto link check skipped:', error);
            }
        };

        autoCheckLinks();
        // Run only once when component mounts
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];

    // Helper function to get active messages
    const getActiveMessages = (): TileMessage[] => {
        return (tile.messages?.filter(m =>
            m.isActive &&
            (!m.startDate || new Date(m.startDate) <= new Date()) &&
            (!m.endDate || new Date(m.endDate) >= new Date()) &&
            (m.displayLocation === 'detail' || m.displayLocation === 'both' || !m.displayLocation)
        ) || []).sort((a, b) => (a.priority || 0) - (b.priority || 0));
    };

    // Helper function to strip formatting characters for plain text display
    const stripFormatting = (content: string): string => {
        let plainText = content.replace(/\*\*(.*?)\*\*/g, '$1');
        plainText = plainText.replace(/\*([^*]+)\*/g, '$1');
        plainText = plainText.replace(/_([^_]+)_/g, '$1');
        return plainText;
    };

    // Helper function to strip HTML tags from content for plain text display
    const stripHtmlTags = (content: string): string => {
        if (!content) return '';
        // Remove HTML tags using regex
        let plainText = content.replace(/<[^>]*>/g, '');
        // Decode HTML entities
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = plainText;
        return tempDiv.textContent || tempDiv.innerText || '';
    };

    // Helper function to parse URLs and render clickable links with formatting
    const renderMessageContent = (content: string) => {
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const boldPattern = /(\*\*)(.*?)\1/g;
        const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

        let processedContent = content;
        processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');
        processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

        const parts = processedContent.split(urlPattern);

        return parts.map((part, index) => {
            if (urlPattern.test(part)) {
                return (
                    <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold hover:opacity-80 transition-opacity inherit"
                        style={{ color: 'inherit' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                );
            }
            return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
        });
    };

    const activeMessages = getActiveMessages();
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

    // Helper function to get animation class based on animation type
    const getMessageAnimationClass = (animationType?: string) => {
        if (!animationType || animationType === 'rollover' || animationType === 'still') return '';
        return `message-animate-${animationType}`;
    };

    // Get animation duration in seconds based on animation type
    const getAnimationDuration = (animationType?: string): number => {
        if (animationType === 'still') return 0; // No animation duration for still
        const durations: Record<string, number> = {
            'flash': 1.5,
            'flip-horizontal': 2,
            'flip-vertical': 2,
            'bounce': 2,
            'pulse': 2,
            'shake': 1,
            'fade': 2,
            'slide': 3
        };
        return durations[animationType || ''] || 2;
    };

    // Cycle through messages sequentially for non-rollover animations
    useEffect(() => {
        if (activeMessages.length <= 1) {
            setCurrentMessageIndex(0);
            return;
        }

        // Check if any message uses non-rollover animation
        const hasNonRollover = activeMessages.some(msg => msg.animationType && msg.animationType !== 'rollover');
        if (!hasNonRollover) {
            // All messages are rollover - don't cycle
            setCurrentMessageIndex(0);
            return;
        }

        // Get current message
        const currentMsg = activeMessages[currentMessageIndex];
        if (!currentMsg || currentMessageIndex >= activeMessages.length) {
            setCurrentMessageIndex(0);
            return;
        }

        const animationType = currentMsg.animationType || 'rollover';

        // Calculate duration: animation duration + delay before next message
        const animationDuration = animationType === 'rollover' ? 0 : getAnimationDuration(animationType);
        const delayBefore = currentMsg.delayBefore || 0;
        // For 'still' messages with no delay, use a default display duration (3 seconds)
        const displayDuration = animationType === 'still' && delayBefore === 0 ? 3 : (animationDuration + delayBefore);
        const totalDuration = displayDuration * 1000; // Convert to milliseconds

        // Only set timer if we have a duration (non-rollover)
        if (animationType === 'rollover' && totalDuration <= 0) {
            // Skip rollover messages immediately
            setCurrentMessageIndex((prevIndex) => {
                const nextIndex = (prevIndex + 1) % activeMessages.length;
                return nextIndex;
            });
            return;
        }

        const timer = setTimeout(() => {
            setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % activeMessages.length);
        }, totalDuration);

        return () => clearTimeout(timer);
    }, [currentMessageIndex, activeMessages]);

    // Sync state when tile changes, but only when not editing to prevent losing unsaved changes.
    // IMPORTANT: We only depend on `tile` and `isEditing` so that local edits
    // to `editTabs` (like deleting a tab) are not immediately overwritten by
    // the current `tile` prop until the user actually saves.
    useEffect(() => {
        // CRITICAL: Don't sync ANYTHING if we're currently editing - user might have unsaved changes
        // This prevents overwriting deletions or other edits while user is working
        if (isEditing) {
            return;
        }

        // Basic fields
        setEditTitle(tile.title);
        setEditDesc(tile.description);
        setEditHtml(tile.htmlContent || '');
        setEditEmoji(tile.emoji);
        setEditColor(tile.themeColor);
        setEditVisibility(tile.visibility || 'public');

        // Always include owner in allowed users list
        const allowedUsers = tile.allowedUsers || [];
        if (tile.userId) {
            const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
            if (!allowedUsers.includes(ownerIdNum)) {
                setEditAllowedUsers([...allowedUsers, ownerIdNum]);
            } else {
                setEditAllowedUsers(allowedUsers);
            }
        } else {
            setEditAllowedUsers(allowedUsers);
        }

        // Load allowed groups
        setEditAllowedGroups(tile.allowedGroups || []);

        setEditBrowser(tile.browser || 'default');

        // Tabs / sections: always reflect the latest tile data when
        // we're *not* editing. While editing, `editTabs` is the source
        // of truth and won't be touched by this effect.
        if (tile.tabs && tile.tabs.length > 0) {
            // Deep clone tabs to ensure all properties including textColor and richTextContent are preserved
            const clonedTabs = tile.tabs.map(tab => ({
                ...tab,
                sections: tab.sections ? [...tab.sections]
                    .sort((a, b) => {
                        const posA = a.position ?? 0;
                        const posB = b.position ?? 0;
                        return posA - posB;
                    })
                    .map((section, idx) => ({
                        ...section,
                        position: section.position ?? idx,
                        links: section.links ? section.links.map(link => ({ ...link })) : [],
                        richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
                    })) : []
            }));

            // Debug: Log richTextContent when loading
            clonedTabs.forEach(tab => {
                tab.sections.forEach(section => {
                });
            });

            setEditTabs(clonedTabs);
            const allSections: LinkSection[] = [];
            clonedTabs.forEach(tab => {
                allSections.push(...tab.sections);
            });
            setEditSections(allSections);
        } else {
            // Also clone sections to preserve richTextContent
            const clonedSections = (tile.sections || []).map(section => ({
                ...section,
                links: section.links ? section.links.map(link => ({ ...link })) : [],
                richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
            }));
            setEditTabs([]);
            setEditSections(clonedSections);
        }

        // Load health status from tile data
        const healthMap: LinkHealthMap = {};
        const sectionsToCheck = tile.tabs ? tile.tabs.flatMap(tab => tab.sections) : (tile.sections || []);
        sectionsToCheck.forEach(section => {
            section.links?.forEach(link => {
                if (link.health) {
                    healthMap[link.id] = link.health;
                }
            });
        });
        setLinkHealth(healthMap);
    }, [tile, isEditing]);

    // Keep edit mode active during auto-save operations
    useEffect(() => {
        if (autoSavingRef.current && !isEditing) {
            console.log('Auto-save: Detected edit mode was reset, restoring it');
            setIsEditing(true);
        }
    }, [isEditing]);

    // Refresh editTabs when entering edit mode to ensure we have the latest data
    // AND create a temp version snapshot once per edit session
    useEffect(() => {
        if (isEditing && tile.canEdit) {
            if (!tempVersionCreatedRef.current.active || tempVersionCreatedRef.current.tileId !== tile.id) {
                tempVersionCreatedRef.current = { tileId: tile.id, active: true };
                createTempVersion(tile.id);
            }

            if (tile.tabs && tile.tabs.length > 0) {
                const clonedTabs = tile.tabs.map(tab => ({
                    ...tab,
                    sections: tab.sections ? tab.sections.map(section => ({
                        ...section,
                        links: section.links ? section.links.map(link => ({ ...link })) : [],
                        richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
                    })) : []
                }));

                setEditTabs(clonedTabs);
                const allSections: LinkSection[] = [];
                clonedTabs.forEach(tab => {
                    allSections.push(...tab.sections);
                });
                setEditSections(allSections);
            } else {
                const clonedSections = (tile.sections || []).map(section => ({
                    ...section,
                    links: section.links ? section.links.map(link => ({ ...link })) : [],
                    richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
                }));
                setEditTabs([]);
                setEditSections(clonedSections);
            }
        }

        if (!isEditing && !autoSavingRef.current && tempVersionCreatedRef.current.active) {
            tempVersionCreatedRef.current = { tileId: null, active: false };
        }
    }, [isEditing, tile.id, tile.canEdit]); // Run when isEditing becomes true or tile changes

    // Load fresh health data on mount
    useEffect(() => {
        const loadHealth = async () => {
            try {
                const health = await linkHealthService.getAllHealth();
                setLinkHealth(health);
            } catch (error) {
                console.error('Failed to load link health:', error);
            }
        };
        loadHealth();
    }, [tile.id]);

    // Save view layout preference to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('linknest_view_layout', viewLayout);
        } catch (error) {
            console.error('Failed to save view layout preference:', error);
        }
    }, [viewLayout]);

    // Handle ESC key to close visibility and scheduling dialogs
    useEffect(() => {
        const handleEscKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (visibilityDialogTab) {
                    setVisibilityDialogTab(null);
                } else if (visibilityDialogSection) {
                    setVisibilityDialogSection(null);
                } else if (schedulingDialogTab) {
                    setSchedulingDialogTab(null);
                } else if (schedulingDialogSection) {
                    setSchedulingDialogSection(null);
                } else if (schedulingDialogLink) {
                    setSchedulingDialogLink(null);
                } else if (schedulingDialogRichText) {
                    setSchedulingDialogRichText(null);
                }
            }
        };

        if (visibilityDialogTab || visibilityDialogSection || schedulingDialogTab || schedulingDialogSection || schedulingDialogLink || schedulingDialogRichText) {
            document.addEventListener('keydown', handleEscKey);
            return () => document.removeEventListener('keydown', handleEscKey);
        }
    }, [visibilityDialogTab, visibilityDialogSection, schedulingDialogTab, schedulingDialogSection, schedulingDialogLink, schedulingDialogRichText]);

    // Load users list when editing and authenticated
    useEffect(() => {
        if (isEditing && isAuthenticated && tile.canEdit) {
            const loadUsers = async () => {
                try {
                    setLoadingUsers(true);
                    const users = await authService.getUsers();
                    setUsersList(users);
                } catch (error) {
                    console.error('Failed to load users:', error);
                } finally {
                    setLoadingUsers(false);
                }
            };
            const loadGroups = async () => {
                try {
                    setIsLoadingGroups(true);
                    const response = await fetch(`${resolveApiBase()}/user-groups`, {
                        method: 'GET',
                        credentials: 'include',
                    });
                    if (response.ok) {
                        const groups = await response.json();
                        setAvailableGroups(groups);
                    }
                } catch (error) {
                    console.error('Failed to load groups:', error);
                } finally {
                    setIsLoadingGroups(false);
                }
            };
            loadUsers();
            loadGroups();
        }
    }, [isEditing, isAuthenticated, tile.canEdit]);

    // Load available browsers from database when feature is enabled
    useEffect(() => {
        if (settings.browser_specific_links_enabled === '1') {
            const loadBrowsersFromDatabase = async () => {
                try {
                    const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
                    const response = await fetch(`${API_BASE}/browsers`, {
                        credentials: 'include',
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.browsers && data.browsers.length > 0) {
                            const browserIds = data.browsers.map((b: any) => b.browser_id);
                            console.log('Loaded browsers from database:', browserIds);
                            setAvailableBrowsers(browserIds);
                        } else {
                            console.log('No browsers found in database, using fallback');
                            // Fallback to BrowserLauncher static list if database is empty
                            if (typeof (window as any).BrowserLauncher !== 'undefined') {
                                const BrowserLauncher = (window as any).BrowserLauncher;
                                const browsers = BrowserLauncher.getBrowsers();
                                if (browsers && browsers.length > 0) {
                                    setAvailableBrowsers(browsers);
                                }
                            }
                        }
                    }
                } catch {
                    // Browsers from database optional; ignore errors
                }
            };

            loadBrowsersFromDatabase();
        } else {
            setAvailableBrowsers([]);
        }
    }, [settings.browser_specific_links_enabled]);

    // Close browser menu on ESC key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowBrowserMenu({});
                setSaveBrowserForLink({});
                setSelectedBrowserForLink({});
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    // Version Control Handlers
    const fetchVersions = async () => {
        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.versions) {
                    setTileVersions(data.versions);
                }
            } else {
                console.error('Failed to fetch versions');
            }
        } catch (err) {
            console.error('Error fetching versions:', err);
        } finally {
            setLoadingVersions(false);
        }
    };

    const handleToggleVersionLock = async (versionId: number, isLocked: boolean) => {
        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isLocked: !isLocked }),
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.map(v =>
                    v.id === versionId ? { ...v, is_locked: !isLocked } : v
                ));
            }
        } catch (err) {
            console.error('Error toggling lock:', err);
        } finally {
            setVersionActionLoading(null);
        }
    };

    const handleRestoreVersion = async (versionId: number) => {
        if (!window.confirm('Are you sure you want to restore this version? Current changes will be overwritten.')) return;

        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/restore`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                // Reload tiles to reflect changes
                if (onUpdateTiles) {
                    // Force reload everything
                    const updatedTiles = await getTiles();
                    onUpdateTiles(updatedTiles);
                    setIsEditing(false); // Exit edit mode on restore
                    alert('Version restored successfully.');
                }
            } else {
                alert('Failed to restore version.');
            }
        } catch (err) {
            console.error('Error restoring version:', err);
            alert('Error restoring version.');
        } finally {
            setVersionActionLoading(null);
        }
    };

    const handleCompareWithCurrent = async (version: TileVersion) => {
        try {
            setIsDiffLoading(true);
            setVersionActionLoading(version.id);

            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const res = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${version.id}`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error('Failed to fetch version details');
            const data = await res.json();

            if (data.version && data.version.tile_data) {
                const versionParams = JSON.parse(data.version.tile_data);

                setDiffOriginalTile(versionParams);
                setDiffModifiedTile(tile); // Current state
                setDiffTitle(`Comparing Version ${version.version_number} vs Current`);

                // Set version metadata for display
                setDiffOriginalVersionMeta({
                    versionNumber: version.version_number,
                    createdAt: version.created_at,
                    username: version.username,
                    changelogSummary: version.changelog_summary
                });

                // For current state, we don't have version metadata, but we can show it's current
                setDiffModifiedVersionMeta({
                    changelogSummary: null // Current state doesn't have a changelog summary
                });

                setDiffViewerOpen(true);
            }
        } catch (error) {
            console.error('Error preparing comparison:', error);
            alert('Failed to load version details for comparison');
        } finally {
            setIsDiffLoading(false);
            setVersionActionLoading(null);
        }
    };

    const handleDeleteVersion = async (versionId: number) => {
        if (!window.confirm('Are you sure you want to delete this version?')) return;

        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.filter(v => v.id !== versionId));
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete version.');
            }
        } catch (err) {
            console.error('Error deleting version:', err);
        } finally {
            setVersionActionLoading(null);
        }
    };

    const handleDeleteAllVersions = async () => {
        if (!window.confirm('Are you sure you want to delete ALL unlocked versions? This cannot be undone!')) return;

        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/delete-all`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                alert(`Successfully deleted ${data.deleted} version(s).`);
                fetchVersions(); // Refresh the list
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete versions.');
            }
        } catch (err) {
            console.error('Error deleting all versions:', err);
            alert('Error deleting versions.');
        } finally {
            setLoadingVersions(false);
        }
    };

    const handleDeleteEmptyVersions = async () => {
        if (!window.confirm('Delete all versions with no differences from the previous version? This cannot be undone!')) return;

        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/delete-empty`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.deleted > 0) {
                    alert(`Successfully deleted ${data.deleted} empty version(s).`);
                    fetchVersions(); // Refresh the list
                } else {
                    alert('No empty versions found.');
                }
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete empty versions.');
            }
        } catch (err) {
            console.error('Error deleting empty versions:', err);
            alert('Error deleting empty versions.');
        } finally {
            setLoadingVersions(false);
        }
    };

    const handleDeleteDuplicateVersions = async () => {
        if (!window.confirm('Delete all duplicate versions (identical to any previous version)? This cannot be undone!')) return;

        try {
            setLoadingVersions(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/delete-duplicate`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.deleted > 0) {
                    alert(`Successfully deleted ${data.deleted} duplicate version(s).`);
                    fetchVersions(); // Refresh the list
                } else {
                    alert('No duplicate versions found.');
                }
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete duplicate versions.');
            }
        } catch (err) {
            console.error('Error deleting duplicate versions:', err);
            alert('Error deleting duplicate versions.');
        } finally {
            setLoadingVersions(false);
        }
    };

    // Compare any two versions
    const handleCompareTwoVersions = async (versionId1: number, versionId2: number) => {
        try {
            setIsDiffLoading(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const res = await fetch(`${API_BASE}/tiles/${tile.id}/versions/compare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId1, versionId2 }),
                credentials: 'include'
            });

            if (!res.ok) throw new Error('Failed to compare versions');
            const data = await res.json();

            if (data.version1 && data.version2) {
                setDiffOriginalTile(data.version1.data);
                setDiffModifiedTile(data.version2.data);
                setDiffTitle(`Comparing Version ${data.version1.version_number} vs Version ${data.version2.version_number}`);

                setDiffOriginalVersionMeta({
                    versionNumber: data.version1.version_number,
                    createdAt: data.version1.created_at,
                    username: tileVersions.find(v => v.id === versionId1)?.username || 'Unknown',
                    changelogSummary: data.version1.changelog_summary
                });

                setDiffModifiedVersionMeta({
                    versionNumber: data.version2.version_number,
                    createdAt: data.version2.created_at,
                    username: tileVersions.find(v => v.id === versionId2)?.username || 'Unknown',
                    changelogSummary: data.version2.changelog_summary
                });

                setDiffViewerOpen(true);
                setSelectedVersionsForCompare([]);
            }
        } catch (error) {
            console.error('Error comparing versions:', error);
            alert('Failed to compare versions.');
        } finally {
            setIsDiffLoading(false);
        }
    };

    // Toggle version selection for comparison
    const handleToggleVersionSelect = (versionId: number) => {
        setSelectedVersionsForCompare(prev => {
            if (prev.includes(versionId)) {
                return prev.filter(id => id !== versionId);
            } else if (prev.length < 2) {
                return [...prev, versionId];
            } else {
                return [prev[1], versionId]; // Replace oldest selection
            }
        });
    };

    // Update version tags
    const handleUpdateVersionTags = async (versionId: number) => {
        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: editingVersionTags }),
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.map(v =>
                    v.id === versionId ? { ...v, tags: editingVersionTags } : v
                ));
                setEditingVersionId(null);
                setEditingVersionTags([]);
                setNewTagInput('');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update tags.');
            }
        } catch (err) {
            console.error('Error updating tags:', err);
            alert('Error updating tags.');
        } finally {
            setVersionActionLoading(null);
        }
    };

    // Update version comments
    const handleUpdateVersionComments = async (versionId: number) => {
        try {
            setVersionActionLoading(versionId);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comments: editingVersionComments }),
                credentials: 'include',
            });
            if (response.ok) {
                setTileVersions(prev => prev.map(v =>
                    v.id === versionId ? { ...v, comments: editingVersionComments } : v
                ));
                setEditingVersionId(null);
                setEditingVersionComments('');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update comments.');
            }
        } catch (err) {
            console.error('Error updating comments:', err);
            alert('Error updating comments.');
        } finally {
            setVersionActionLoading(null);
        }
    };

    // Start editing version tags/comments
    const handleStartEditVersion = (version: TileVersion) => {
        setEditingVersionId(version.id);
        setEditingVersionTags(version.tags || []);
        setEditingVersionComments(version.comments || '');
    };

    // Cancel editing
    const handleCancelEditVersion = () => {
        setEditingVersionId(null);
        setEditingVersionTags([]);
        setEditingVersionComments('');
        setNewTagInput('');
    };

    // Add tag to editing list
    const handleAddTag = () => {
        if (newTagInput.trim() && !editingVersionTags.includes(newTagInput.trim())) {
            setEditingVersionTags([...editingVersionTags, newTagInput.trim()]);
            setNewTagInput('');
        }
    };

    // Remove tag from editing list
    const handleRemoveTag = (tag: string) => {
        setEditingVersionTags(editingVersionTags.filter(t => t !== tag));
    };

    // Restore with preview
    const handleRestoreWithPreview = async (versionId: number) => {
        setRestorePreviewVersion(versionId);
        // Load version data and show diff
        try {
            setIsDiffLoading(true);
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const res = await fetch(`${API_BASE}/tiles/${tile.id}/versions/${versionId}`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error('Failed to fetch version details');
            const data = await res.json();

            if (data.version && data.version.tile_data) {
                const versionParams = JSON.parse(data.version.tile_data);
                const version = tileVersions.find(v => v.id === versionId);

                setDiffOriginalTile(tile); // Current state
                setDiffModifiedTile(versionParams); // Version to restore
                setDiffTitle(`Restore Preview: Version ${version?.version_number || versionId}`);

                setDiffOriginalVersionMeta({
                    versionNumber: 0, // Current
                    createdAt: Date.now() / 1000,
                    username: 'Current State',
                    changelogSummary: null
                });

                setDiffModifiedVersionMeta({
                    versionNumber: version?.version_number || 0,
                    createdAt: version?.created_at || 0,
                    username: version?.username || 'Unknown',
                    changelogSummary: version?.changelog_summary || null
                });

                setDiffViewerOpen(true);
            }
        } catch (error) {
            console.error('Error loading restore preview:', error);
            alert('Failed to load restore preview.');
        } finally {
            setIsDiffLoading(false);
        }
    };

    // Confirm restore after preview
    const handleConfirmRestore = async () => {
        if (restorePreviewVersion) {
            setDiffViewerOpen(false);
            await handleRestoreVersion(restorePreviewVersion);
            setRestorePreviewVersion(null);
        }
    };

    // Filter versions
    const filteredVersions = tileVersions.filter(version => {
        // Search term filter
        if (versionSearchTerm) {
            const searchLower = versionSearchTerm.toLowerCase();
            const matchesSearch =
                version.changelog_summary?.toLowerCase().includes(searchLower) ||
                version.username?.toLowerCase().includes(searchLower) ||
                version.comments?.toLowerCase().includes(searchLower) ||
                version.tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
                `v${version.version_number}`.includes(searchLower);
            if (!matchesSearch) return false;
        }

        // User filter
        if (versionFilterUser && version.username !== versionFilterUser) {
            return false;
        }

        // Date range filter
        if (versionFilterDateFrom) {
            const fromDate = new Date(versionFilterDateFrom).getTime() / 1000;
            if (version.created_at < fromDate) return false;
        }
        if (versionFilterDateTo) {
            const toDate = new Date(versionFilterDateTo).getTime() / 1000 + 86400; // Add 1 day
            if (version.created_at > toDate) return false;
        }

        // Tag filter
        if (versionFilterTag && (!version.tags || !version.tags.includes(versionFilterTag))) {
            return false;
        }

        return true;
    });

    // Get all unique tags and users for filters
    const allTags = Array.from(new Set(tileVersions.flatMap(v => v.tags || []))).sort();
    const allUsers = Array.from(new Set(tileVersions.map(v => v.username))).sort();

    const cleanupEmptyVersions = async () => {
        try {
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/versions/cleanup-empty`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.deleted > 0) {
                    console.log(`Auto-cleaned ${data.deleted} empty version(s)`);
                    // Silently refresh versions if we're showing them
                    if (showVersions) {
                        fetchVersions();
                    }
                }
            }
        } catch {
            // Ignore auto-clean errors
        }
    };

    useEffect(() => {
        if (showVersions && isEditing) {
            fetchVersions();
        }
    }, [showVersions, isEditing]);

    // Auto-cleanup empty versions when tile is opened
    useEffect(() => {
        if (tile.id) {
            cleanupEmptyVersions();
        }
    }, [tile.id]);

    // Function to update link browser for admin users
    const handleUpdateLinkBrowser = async (linkId: string, browserId: string) => {
        if (!isAuthenticated || !tile.canEdit) {
            alert('You do not have permission to update link settings.');
            return;
        }

        // Find the link in the tile structure
        const findAndUpdateLink = (tabs: Tab[] | undefined, sections: LinkSection[] | undefined): Tile | null => {
            if (tabs && tabs.length > 0) {
                for (const tab of tabs) {
                    for (const section of tab.sections) {
                        const linkIndex = section.links.findIndex(l => l.id === linkId);
                        if (linkIndex !== -1) {
                            const updatedLinks = [...section.links];
                            updatedLinks[linkIndex] = {
                                ...updatedLinks[linkIndex],
                                browser: browserId && browserId !== 'default' ? browserId : undefined
                            };
                            const updatedSections = tab.sections.map(s =>
                                s.id === section.id ? { ...s, links: updatedLinks } : s
                            );
                            const updatedTabs = tabs.map(t =>
                                t.id === tab.id ? { ...t, sections: updatedSections } : t
                            );
                            return {
                                ...tile,
                                tabs: updatedTabs
                            };
                        }
                    }
                }
            } else if (sections && sections.length > 0) {
                for (const section of sections) {
                    const linkIndex = section.links.findIndex(l => l.id === linkId);
                    if (linkIndex !== -1) {
                        const updatedLinks = [...section.links];
                        updatedLinks[linkIndex] = {
                            ...updatedLinks[linkIndex],
                            browser: browserId && browserId !== 'default' ? browserId : undefined
                        };
                        const updatedSections = sections.map(s =>
                            s.id === section.id ? { ...s, links: updatedLinks } : s
                        );
                        return {
                            ...tile,
                            sections: updatedSections
                        };
                    }
                }
            }
            return null;
        };

        const updatedTile = findAndUpdateLink(tile.tabs, tile.sections);
        if (updatedTile) {
            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
            onUpdateTiles(updatedTiles);
            setShowBrowserMenu(prev => ({ ...prev, [linkId]: false }));
            setSaveBrowserForLink(prev => ({ ...prev, [linkId]: false }));
            setSelectedBrowserForLink(prev => ({ ...prev, [linkId]: '' }));
        }
    };

    // Function to update all links' browser settings in this tile
    const handleUpdateLinksBrowser = async () => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }

        try {
            const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
            const response = await fetch(`${API_BASE}/tiles/${tile.id}/update-links-browser`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    browser: editBrowser
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to update links browser' }));
                throw new Error(errorData.error || 'Failed to update links browser');
            }

            const result = await response.json();

            // Update the tile's browser setting in local state
            const updatedTile: Tile = {
                ...tile,
                browser: editBrowser !== 'default' ? editBrowser : undefined,
            };
            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
            onUpdateTiles(updatedTiles, true); // Skip reload since we're just updating browser

            // Show success message
            alert(`Successfully updated default browser for ${result.updatedLinks || 0} link(s) in this tile.`);
        } catch (error) {
            console.error('Failed to update links browser:', error);
            alert(`Failed to update links browser: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };



    const handleSaveChanges = () => {

        // Check if user has edit permission
        if (!tile.canEdit) {
            console.log('ERROR: No edit permission');
            alert('You do not have permission to edit this tile.');
            setIsEditing(false);
            return;
        }

        // Use tabs if we have them, otherwise use sections (backward compatibility)
        // Deep clone editTabs to ensure richTextContent and positions are included
        const clonedTabs = editTabs.length > 0 ? editTabs.map(tab => ({
            ...tab,
            sections: tab.sections.map(section => ({
                ...section,
                position: section.position ?? 0, // Ensure position is included
                links: section.links ? [...section.links] : [],
                richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
            }))
        })) : undefined;

        const clonedSections = editTabs.length === 0 ? editSections.map(section => ({
            ...section,
            links: section.links ? [...section.links] : [],
            richTextContent: section.richTextContent ? section.richTextContent.map(rt => ({ ...rt })) : []
        })) : undefined;

        // Ensure owner is always included in allowed users for private tiles
        let finalAllowedUsers = editAllowedUsers;
        if (editVisibility === 'private' && tile.userId) {
            const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
            if (!finalAllowedUsers.includes(ownerIdNum)) {
                finalAllowedUsers = [...finalAllowedUsers, ownerIdNum];
            }
        }

        const updatedTile: Tile = {
            ...tile,
            title: editTitle,
            description: editDesc,
            htmlContent: editHtml,
            emoji: editEmoji,
            themeColor: editColor,
            tabs: clonedTabs,
            sections: clonedSections, // Only include sections if no tabs
            visibility: editVisibility,
            allowedUsers: editVisibility === 'private' ? finalAllowedUsers : undefined,
            allowedGroups: editVisibility === 'private' ? editAllowedGroups : undefined,
            browser: editBrowser !== 'default' ? editBrowser : undefined,
        };

        const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);

        // Push the updated tiles up; App will persist them and re‑pass
        // the updated `tile` prop back down.
        // Note: onUpdateTiles will reload from server, which should include richTextContent
        // The backend will handle change detection via temp version comparison
        onUpdateTiles(updatedTiles, false, true);

        // Only exit edit mode if this is NOT an auto-save
        if (!autoSavingRef.current) {
            setIsEditing(false);
        }
    };

    // Tab Management
    const handleAddTab = () => {
        const newTab: Tab = {
            id: generateId(),
            title: 'New Tab',
            position: editTabs.length,
            sections: []
        };
        setEditTabs([...editTabs, newTab]);

        // If this is the first tab and we have sections, migrate them to this tab
        if (editTabs.length === 0 && editSections.length > 0) {
            newTab.sections = [...editSections];
            setEditTabs([newTab]);
            setEditSections([]);
        }
    };

    const handleRemoveTab = (tabId: string) => {
        console.log('=== TAB DELETION START ===');
        console.log('Tab ID to delete:', tabId);
        console.log('isEditing:', isEditing);
        console.log('Current editTabs before deletion:', editTabs.map(t => ({ id: t.id, title: t.title, position: t.position })));
        console.log('Current editTabs count:', editTabs.length);

        // Ensure we're in edit mode
        if (!isEditing) {
            console.error('ERROR: Not in edit mode!');
            alert('Please enter edit mode first before deleting tabs.');
            return;
        }

        if (!tile.canEdit) {
            console.log('ERROR: No edit permission');
            alert('You do not have permission to edit this tile.');
            return;
        }

        // Check tab count before showing confirm dialog
        if (editTabs.length <= 1) {
            console.log('ERROR: Cannot delete last tab');
            alert('Cannot delete the last tab. A tile must have at least one tab.');
            return;
        }

        // Verify the tab exists
        const tabExists = editTabs.some(t => t.id === tabId);
        console.log('Tab exists in editTabs:', tabExists);
        if (!tabExists) {
            console.error('ERROR: Tab not found in editTabs!', { tabId, availableIds: editTabs.map(t => t.id) });
            alert('Tab not found. This may be a synchronization issue.');
            return;
        }

        // Ask for confirmation
        const confirmed = window.confirm('Delete this tab and all its sections and links?');
        if (!confirmed) {
            console.log('User cancelled deletion');
            return;
        }

        console.log('Proceeding with deletion...');

        // Calculate the updated tabs first
        const filteredTabs = editTabs.filter(t => t.id !== tabId);
        const reorderedTabs = filteredTabs.map((t, idx) => ({ ...t, position: idx }));

        console.log('After filter - remaining tabs:', reorderedTabs.map(t => ({ id: t.id, title: t.title })));
        console.log('After reorder - final tabs:', reorderedTabs.map(t => ({ id: t.id, title: t.title, position: t.position })));
        console.log('=== TAB DELETION COMPLETE ===');

        // Update state
        setEditTabs(reorderedTabs);

        // Automatically save after deletion
        // Mark that we're auto-saving to prevent edit mode from exiting
        autoSavingRef.current = true;

        // Use setTimeout to ensure state update is processed first
        setTimeout(() => {
            console.log('Auto-saving after tab deletion...');
            console.log('Tabs to save:', reorderedTabs.length);
            console.log('Current isEditing state:', isEditing);

            // Ensure we're still in edit mode before saving
            if (!isEditing) {
                console.log('WARNING: Not in edit mode anymore, skipping auto-save');
                autoSavingRef.current = false;
                return;
            }

            // Build updated tile with the new tabs
            const updatedTile: Tile = {
                ...tile,
                title: editTitle,
                description: editDesc,
                htmlContent: editHtml,
                emoji: editEmoji,
                themeColor: editColor,
                tabs: reorderedTabs.length > 0 ? reorderedTabs : undefined,
                sections: reorderedTabs.length > 0 ? undefined : editSections,
                visibility: editVisibility,
                allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
            };

            console.log('Auto-save: Updated tile tabs:', updatedTile.tabs?.length || 0);
            console.log('Auto-save: Tab IDs:', updatedTile.tabs?.map(t => ({ id: t.id, title: t.title })) || []);

            const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
            console.log('Auto-save: Calling onUpdateTiles with skipReload=true');

            // Call onUpdateTiles with skipReload=true to prevent reload that resets edit mode
            try {
                // This will save to server but skip the reload
                onUpdateTiles(updatedTiles, true);
                console.log('Auto-save: Tab deletion saved successfully - staying in edit mode');

                // Reset the flag after a delay
                setTimeout(() => {
                    autoSavingRef.current = false;
                    console.log('Auto-save: Flag reset');
                }, 1000);
            } catch (error) {
                console.error('Auto-save: Failed to save:', error);
                alert('Failed to save tab deletion. Please try saving manually.');
                autoSavingRef.current = false;
            }
        }, 150);
    };

    const handleUpdateTabTitle = (tabId: string, newTitle: string) => {
        setEditTabs(editTabs.map(t => t.id === tabId ? { ...t, title: newTitle } : t));
    };

    const handleUpdateTabColor = (tabId: string, textColor: string) => {
        // Convert empty string to undefined to properly clear the color
        const normalizedColor = textColor && textColor.trim() ? textColor : undefined;
        setEditTabs(editTabs.map(t => t.id === tabId ? { ...t, textColor: normalizedColor } : t));
    };

    const handleMoveTab = (tabId: string, direction: 'up' | 'down') => {
        const index = editTabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= editTabs.length) return;

        const newTabs = [...editTabs];
        [newTabs[index], newTabs[newIndex]] = [newTabs[newIndex], newTabs[index]];
        // Update positions
        newTabs.forEach((t, idx) => { t.position = idx; });
        setEditTabs(newTabs);
    };

    const handleCloneTab = (tabId: string) => {
        const tabToClone = editTabs.find(t => t.id === tabId);
        if (!tabToClone) return;

        // Deep clone the tab with new IDs
        const clonedTab: Tab = {
            id: generateId(),
            title: `${tabToClone.title} (Copy)`,
            position: tabToClone.position + 1,
            textColor: tabToClone.textColor,
            sections: tabToClone.sections.map((section, index) => ({
                id: generateId(),
                title: section.title,
                textColor: section.textColor,
                position: section.position ?? index,
                links: section.links.map(link => ({
                    id: generateId(),
                    label: link.label,
                    url: link.url,
                    icon: link.icon,
                    visibility: link.visibility,
                    allowedUsers: link.allowedUsers ? [...link.allowedUsers] : undefined,
                    notes: link.notes,
                    tooltip: link.tooltip,
                    health: link.health
                }))
            }))
        };

        // Insert cloned tab after the original
        const index = editTabs.findIndex(t => t.id === tabId);
        const newTabs = [
            ...editTabs.slice(0, index + 1),
            clonedTab,
            ...editTabs.slice(index + 1)
        ];

        // Update positions
        newTabs.forEach((t, idx) => { t.position = idx; });
        setEditTabs(newTabs);
    };

    const handleUpdateTabVisibility = (tabId: string, visibility: LinkVisibility, allowedUsers?: number[], allowedGroups?: number[]) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId
                ? { ...t, visibility, allowedUsers: visibility === 'private' ? allowedUsers : undefined, allowedGroups: visibility === 'private' ? allowedGroups : undefined }
                : t
        ));
    };

    const handleUpdateTabScheduling = (tabId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId
                ? {
                    ...t,
                    visibleFrom: visibleFrom || undefined,
                    expiresAt: expiresAt || undefined
                }
                : t
        ));
    };

    const handleUpdateSectionScheduling = (tabId: string, sectionId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                visibleFrom: visibleFrom || undefined,
                                expiresAt: expiresAt || undefined
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    const handleUpdateLinkScheduling = (tabId: string, sectionId: string, linkId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                links: section.links.map(link =>
                                    link.id === linkId
                                        ? {
                                            ...link,
                                            visibleFrom: visibleFrom || undefined,
                                            expiresAt: expiresAt || undefined
                                        }
                                        : link
                                )
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    const handleToggleLinkFavorite = async (linkId: string) => {
        if (!isAuthenticated) {
            onAuthRequired?.();
            return;
        }

        try {
            const { isFavorite } = await toggleLinkFavorite(linkId);

            const updateLinkInTabs = (tabs: Tab[]): Tab[] => {
                return tabs.map(tab => ({
                    ...tab,
                    sections: tab.sections.map(section => ({
                        ...section,
                        links: (section.links || []).map(link =>
                            link.id === linkId ? { ...link, isFavorite } : link
                        )
                    }))
                }));
            };

            const updateLinkInSections = (sections: LinkSection[]): LinkSection[] => {
                return sections.map(section => ({
                    ...section,
                    links: (section.links || []).map(link =>
                        link.id === linkId ? { ...link, isFavorite } : link
                    )
                }));
            };

            // Update local edit state if needed
            if (editTabs.length > 0) {
                setEditTabs(updateLinkInTabs(editTabs));
            }
            if (editSections.length > 0) {
                setEditSections(updateLinkInSections(editSections));
            }

            // Create updated tile to notify parent
            const updatedTile: Tile = {
                ...tile,
                tabs: tile.tabs ? updateLinkInTabs(tile.tabs) : undefined,
                sections: tile.sections ? updateLinkInSections(tile.sections) : undefined
            };

            const updatedTiles = allTiles.map(t => t.id === tile.id ? updatedTile : t);
            onUpdateTiles(updatedTiles, true); // skipReload: true to prevent UI flash

        } catch (error) {
            console.error('Failed to toggle link favorite:', error);
        }
    };

    // Section Management (within tabs)
    const handleAddSection = (tabId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id === tabId) {
                // Sort sections first to get accurate max position
                const sortedSections = [...tab.sections].sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA - posB;
                });
                const maxPosition = Math.max(...sortedSections.map(s => s.position ?? 0), -1);
                const newSection = { id: generateId(), title: 'New Section', links: [], position: maxPosition + 1 };
                // Add new section and keep sorted
                const newSections = [...sortedSections, newSection].sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA - posB;
                });
                return {
                    ...tab,
                    sections: newSections
                };
            }
            return tab;
        }));
    };

    const handleRemoveSection = (tabId: string, sectionId: string) => {
        console.log('=== SECTION DELETION START ===');
        console.log('Tab ID:', tabId, 'Section ID:', sectionId);

        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }

        // Ensure we're in edit mode
        if (!isEditing) {
            console.error('ERROR: Not in edit mode!');
            alert('Please enter edit mode first before deleting sections.');
            return;
        }

        const confirmed = window.confirm('Delete this section and all its links?');
        if (!confirmed) {
            console.log('User cancelled section deletion');
            return;
        }

        console.log('Proceeding with section deletion...');
        console.log('Current editTabs:', editTabs.map(t => ({ id: t.id, title: t.title, sectionsCount: t.sections.length })));

        // Find the tab and section
        const tab = editTabs.find(t => t.id === tabId);
        if (!tab) {
            console.error('ERROR: Tab not found!', tabId);
            alert('Tab not found. This may be a synchronization issue.');
            return;
        }

        const section = tab.sections.find(s => s.id === sectionId);
        if (!section) {
            console.error('ERROR: Section not found!', sectionId);
            alert('Section not found. This may be a synchronization issue.');
            return;
        }

        console.log('Found tab:', tab.title, 'Found section:', section.title);
        console.log('Tab sections before deletion:', tab.sections.map(s => ({ id: s.id, title: s.title })));

        // Calculate the updated tabs with section removed
        const updatedTabs = editTabs.map(tab => {
            if (tab.id === tabId) {
                const filteredSections = tab.sections.filter(s => s.id !== sectionId);
                // Reorder positions after deletion
                const reorderedSections = filteredSections.map((s, idx) => ({ ...s, position: idx }));
                console.log('Tab', tabId, '- sections before:', tab.sections.length, 'after:', filteredSections.length);
                console.log('Filtered sections:', filteredSections.map(s => ({ id: s.id, title: s.title })));
                return {
                    ...tab,
                    sections: reorderedSections
                };
            }
            return tab;
        });

        console.log('=== SECTION DELETION COMPLETE ===');
        console.log('Updated tabs:', updatedTabs.map(t => ({ id: t.id, title: t.title, sectionsCount: t.sections.length })));

        // Update state using functional update to ensure we have latest state
        setEditTabs(prevTabs => {
            console.log('Inside setEditTabs for section deletion - prevTabs:', prevTabs.map(t => ({ id: t.id, sectionsCount: t.sections.length })));
            const result = prevTabs.map(tab => {
                if (tab.id === tabId) {
                    const filtered = tab.sections.filter(s => s.id !== sectionId);
                    // Reorder positions after deletion
                    const reordered = filtered.map((s, idx) => ({ ...s, position: idx }));
                    console.log('Filtering sections for tab', tabId, '- before:', tab.sections.length, 'after:', filtered.length);
                    return {
                        ...tab,
                        sections: reordered
                    };
                }
                return tab;
            });
            console.log('setEditTabs result:', result.map(t => ({ id: t.id, sectionsCount: t.sections.length })));
            return result;
        });

        // Automatically save after deletion
        autoSavingRef.current = true;

        // Use setTimeout to ensure state update is processed first
        setTimeout(() => {
            console.log('Auto-saving after section deletion...');

            // Get the latest tabs state for saving
            setEditTabs(currentTabs => {
                // Build updated tile with the current tabs (which should have section removed)
                const updatedTile: Tile = {
                    ...tile,
                    title: editTitle,
                    description: editDesc,
                    htmlContent: editHtml,
                    emoji: editEmoji,
                    themeColor: editColor,
                    tabs: currentTabs.length > 0 ? currentTabs : undefined,
                    sections: currentTabs.length > 0 ? undefined : editSections,
                    visibility: editVisibility,
                    allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
                };

                console.log('Auto-save: Updated tile with section removed');
                console.log('Auto-save: Tabs to save:', currentTabs.map(t => ({ id: t.id, title: t.title, sectionsCount: t.sections.length })));

                const updatedTilesArray = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
                console.log('Auto-save: Calling onUpdateTiles with skipReload=true');

                // Call onUpdateTiles with skipReload=true to prevent reload that resets edit mode
                // Do this outside the setState callback to avoid issues
                setTimeout(() => {
                    try {
                        onUpdateTiles(updatedTilesArray, true);
                        console.log('Auto-save: Section deletion saved successfully - staying in edit mode');

                        // Reset the flag after a delay
                        setTimeout(() => {
                            autoSavingRef.current = false;
                            console.log('Auto-save: Flag reset');
                        }, 1000);
                    } catch (error) {
                        console.error('Auto-save: Failed to save:', error);
                        alert('Failed to save section deletion. Please try saving manually.');
                        autoSavingRef.current = false;
                    }
                }, 50);

                // Return current tabs unchanged (state already updated above)
                return currentTabs;
            });
        }, 150);
    };

    const handleUpdateSectionTitle = (tabId: string, sectionId: string, newTitle: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id === tabId) {
                return {
                    ...tab,
                    sections: tab.sections.map(s => s.id === sectionId ? { ...s, title: newTitle } : s)
                };
            }
            return tab;
        }));
    };

    const handleMoveSection = (tabId: string, sectionId: string, direction: 'up' | 'down') => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            // Sort sections by position first to ensure we're working with the correct order
            const sortedSections = [...tab.sections].sort((a, b) => {
                const posA = a.position ?? 0;
                const posB = b.position ?? 0;
                return posA - posB;
            });

            const index = sortedSections.findIndex(s => s.id === sectionId);
            if (index === -1) return tab;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= sortedSections.length) return tab;

            // Swap sections
            const newSections = [...sortedSections];
            [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];

            // Update positions after reordering
            newSections.forEach((section, idx) => {
                section.position = idx;
            });

            return { ...tab, sections: newSections };
        }));
    };

    const handleCloneSection = (tabId: string, sectionId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            const sectionToClone = tab.sections.find(s => s.id === sectionId);
            if (!sectionToClone) return tab;

            // Deep clone the section with new IDs
            const clonedSection: LinkSection = {
                id: generateId(),
                title: `${sectionToClone.title} (Copy)`,
                textColor: sectionToClone.textColor,
                position: (sectionToClone.position ?? 0) + 1,
                links: sectionToClone.links.map(link => ({
                    id: generateId(),
                    label: link.label,
                    url: link.url,
                    icon: link.icon,
                    visibility: link.visibility,
                    allowedUsers: link.allowedUsers ? [...link.allowedUsers] : undefined,
                    notes: link.notes,
                    tooltip: link.tooltip,
                    health: link.health
                }))
            };

            // Sort sections first to find correct index
            const sortedSections = [...tab.sections].sort((a, b) => {
                const posA = a.position ?? 0;
                const posB = b.position ?? 0;
                return posA - posB;
            });

            const index = sortedSections.findIndex(s => s.id === sectionId);
            if (index === -1) return tab;

            // Insert cloned section after the original
            const newSections = [
                ...sortedSections.slice(0, index + 1),
                clonedSection,
                ...sortedSections.slice(index + 1)
            ];

            // Reorder positions after insertion
            newSections.forEach((section, idx) => {
                section.position = idx;
            });

            return { ...tab, sections: newSections };
        }));
    };

    const handleUpdateSectionVisibility = (tabId: string, sectionId: string, visibility: LinkVisibility, allowedUsers?: number[], allowedGroups?: number[]) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(s =>
                    s.id === sectionId
                        ? { ...s, visibility, allowedUsers: visibility === 'private' ? allowedUsers : undefined, allowedGroups: visibility === 'private' ? allowedGroups : undefined }
                        : s
                )
            };
        }));
    };

    // Link Management
    const updateNewLinkState = (sectionId: string, field: 'label' | 'url' | 'icon' | 'textColor' | 'visibility' | 'allowedUsers' | 'allowedGroups' | 'notes' | 'tooltip' | 'browser' | 'richTextContent', value: string | LinkVisibility | number[]) => {
        setNewLinkState(prev => ({
            ...prev,
            [sectionId]: {
                ...(prev[sectionId] || { label: '', url: '', icon: '', textColor: '', visibility: 'public' as LinkVisibility, allowedUsers: [], allowedGroups: [], notes: '', tooltip: '', browser: 'default', richTextContent: '' }),
                [field]: value
            }
        }));
    };

    const toggleUserSelection = (sectionId: string, userId: number) => {
        const currentUsers = newLinkState[sectionId]?.allowedUsers || [];
        const newUsers = currentUsers.includes(userId)
            ? currentUsers.filter(id => id !== userId)
            : [...currentUsers, userId];
        updateNewLinkState(sectionId, 'allowedUsers', newUsers);
    };

    const toggleGroupSelection = (sectionId: string, groupId: number) => {
        const currentGroups = newLinkState[sectionId]?.allowedGroups || [];
        const newGroups = currentGroups.includes(groupId)
            ? currentGroups.filter(id => id !== groupId)
            : [...currentGroups, groupId];
        updateNewLinkState(sectionId, 'allowedGroups', newGroups);
    };

    const handleAddLinkToSection = (tabId: string, sectionId: string) => {
        const state = newLinkState[sectionId];
        if (!state || !state.label.trim() || !state.url.trim()) return;

        const newLink: Link = {
            id: generateId(),
            label: state.label,
            url: state.url.startsWith('http') ? state.url : `https://${state.url}`,
            icon: state.icon?.trim() || undefined,
            textColor: state.textColor?.trim() || undefined,
            visibility: state.visibility || 'public',
            allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
            allowedGroups: state.allowedGroups && state.allowedGroups.length > 0 ? state.allowedGroups : undefined,
            notes: state.notes?.trim() || undefined,
            tooltip: state.tooltip?.trim() || stripHtmlTags(state.label).trim() || undefined,
            browser: state.browser && state.browser !== 'default' ? state.browser : undefined,
            richTextContent: state.richTextContent?.trim() || undefined
        };

        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id === tabId) {
                    return {
                        ...tab,
                        sections: tab.sections.map(s => {
                            if (s.id === sectionId) {
                                // Calculate position
                                const items = getSortedItems(s);
                                const maxPosition = Math.max(...items.map(i => i.position || 0), -1);
                                const linkWithPos = { ...newLink, position: maxPosition + 1 };
                                return { ...s, links: [...s.links, linkWithPos], richTextContent: s.richTextContent || [] };
                            }
                            return s;
                        })
                    };
                }
                return tab;
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id === sectionId) {
                    // Calculate position
                    const items = getSortedItems(s);
                    const maxPosition = Math.max(...items.map(i => i.position || 0), -1);
                    const linkWithPos = { ...newLink, position: maxPosition + 1 };
                    return { ...s, links: [...s.links, linkWithPos], richTextContent: s.richTextContent || [] };
                }
                return s;
            }));
        }

        // Clear form and hide it
        setNewLinkState(prev => ({ ...prev, [sectionId]: { label: '', url: '', icon: '', textColor: '', visibility: 'public' as LinkVisibility, allowedUsers: [], allowedGroups: [], notes: '', tooltip: '', browser: 'default', richTextContent: '' } }));
        setShowUserPicker(prev => ({ ...prev, [sectionId]: false }));
        setShowLinkEmojiPicker(prev => ({ ...prev, [sectionId]: false }));
        setShowAddLinkForm(prev => ({ ...prev, [sectionId]: false }));
    };

    const handleRemoveLinkFromSection = (tabId: string, sectionId: string, linkId: string) => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }
        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id === tabId) {
                    return {
                        ...tab,
                        sections: tab.sections.map(s => {
                            if (s.id === sectionId) {
                                return { ...s, links: s.links.filter(l => l.id !== linkId), richTextContent: s.richTextContent || [] };
                            }
                            return s;
                        })
                    };
                }
                return tab;
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id === sectionId) {
                    return { ...s, links: s.links.filter(l => l.id !== linkId), richTextContent: s.richTextContent || [] };
                }
                return s;
            }));
        }
    };

    // CSV Import Function
    const handleImportLinksFromCSV = async (tabId: string, sectionId: string) => {
        const file = csvImportFile[sectionId];
        if (!file) {
            alert('Please select a CSV file first');
            return;
        }

        setImportingCsv(prev => ({ ...prev, [sectionId]: true }));

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                alert('CSV file must have at least a header row and one data row');
                setImportingCsv(prev => ({ ...prev, [sectionId]: false }));
                return;
            }

            // Parse header row
            const headerLine = lines[0];
            const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

            // Find column indices
            const labelIndex = headers.findIndex(h =>
                h === 'link name' || h === 'linkname' || h === 'name' || h === 'label' || h === 'title'
            );
            const urlIndex = headers.findIndex(h =>
                h === 'link' || h === 'url' || h === 'link url' || h === 'linkurl' || h === 'href'
            );

            if (labelIndex === -1 || urlIndex === -1) {
                alert('CSV file must contain "Link Name" and "Link" columns');
                setImportingCsv(prev => ({ ...prev, [sectionId]: false }));
                return;
            }

            // Parse data rows
            const newLinks: Link[] = [];
            let importedCount = 0;
            let skippedCount = 0;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Handle CSV parsing with quoted fields
                const values: string[] = [];
                let current = '';
                let inQuotes = false;

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        // Handle escaped quotes
                        if (j + 1 < line.length && line[j + 1] === '"' && inQuotes) {
                            current += '"';
                            j++; // Skip next quote
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                // Add the last field
                values.push(current.trim());

                // Ensure we have enough columns
                if (values.length <= Math.max(labelIndex, urlIndex)) {
                    skippedCount++;
                    continue;
                }

                const label = values[labelIndex]?.trim().replace(/^["']|["']$/g, '') || '';
                const url = values[urlIndex]?.trim().replace(/^["']|["']$/g, '') || '';

                if (label && url) {
                    const newLink: Link = {
                        id: generateId(),
                        label: label,
                        url: url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`,
                        visibility: 'public',
                        notes: undefined,
                        tooltip: undefined
                    };
                    newLinks.push(newLink);
                    importedCount++;
                } else {
                    skippedCount++;
                }
            }

            if (newLinks.length === 0) {
                alert('No valid links found in CSV file');
                setImportingCsv(prev => ({ ...prev, [sectionId]: false }));
                return;
            }

            // Add links to section
            if (editTabs.length > 0) {
                // New structure with tabs
                setEditTabs(editTabs.map(tab => {
                    if (tab.id === tabId) {
                        return {
                            ...tab,
                            sections: tab.sections.map(s => {
                                if (s.id === sectionId) {
                                    return { ...s, links: [...s.links, ...newLinks], richTextContent: s.richTextContent || [] };
                                }
                                return s;
                            })
                        };
                    }
                    return tab;
                }));
            } else {
                // Backward compatibility: sections without tabs
                setEditSections(editSections.map(s => {
                    if (s.id === sectionId) {
                        return { ...s, links: [...s.links, ...newLinks], richTextContent: s.richTextContent || [] };
                    }
                    return s;
                }));
            }

            // Clear file input
            setCsvImportFile(prev => ({ ...prev, [sectionId]: null }));

            alert(`Successfully imported ${importedCount} link(s)${skippedCount > 0 ? ` (${skippedCount} row(s) skipped)` : ''}`);
        } catch (error) {
            console.error('CSV import error:', error);
            alert('Failed to import CSV file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setImportingCsv(prev => ({ ...prev, [sectionId]: false }));
        }
    };

    const handleStartEditLink = (link: Link) => {
        setEditingLinkId(link.id);
        setEditLinkState({
            [link.id]: {
                label: link.label,
                url: link.url,
                icon: link.icon || '',
                textColor: link.textColor || '',
                visibility: link.visibility || 'public',
                allowedUsers: link.allowedUsers || [],
                allowedGroups: link.allowedGroups || [],
                notes: link.notes || '',
                tooltip: link.tooltip || '',
                browser: link.browser || 'default',
                richTextContent: link.richTextContent || ''
            }
        });
        setShowUserPicker(prev => ({ ...prev, [link.id]: false }));
        console.log('Starting to edit link:', link.id, 'browser:', link.browser || 'default');
    };

    const handleCancelEditLink = () => {
        setEditingLinkId(null);
        setEditLinkState({});
    };

    const handleUpdateLink = (tabId: string, sectionId: string, linkId: string) => {
        const state = editLinkState[linkId];
        if (!state || !state.label.trim() || !state.url.trim()) return;

        console.log('Updating link:', linkId, 'browser state:', state.browser, 'full state:', state);

        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;

                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;

                        return {
                            ...s,
                            links: s.links.map(l =>
                                l.id === linkId
                                    ? {
                                        ...l,
                                        label: state.label,
                                        url: state.url.startsWith('http') ? state.url : `https://${state.url}`,
                                        icon: state.icon?.trim() || undefined,
                                        textColor: state.textColor?.trim() || undefined,
                                        visibility: state.visibility || 'public',
                                        allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
                                        allowedGroups: state.allowedGroups && state.allowedGroups.length > 0 ? state.allowedGroups : undefined,
                                        notes: state.notes?.trim() || undefined,
                                        tooltip: state.tooltip?.trim() || stripHtmlTags(state.label).trim() || undefined,
                                        browser: state.browser && state.browser !== 'default' ? state.browser : undefined,
                                        richTextContent: state.richTextContent?.trim() || undefined
                                    }
                                    : l
                            ),
                            richTextContent: s.richTextContent || [] // Preserve richTextContent
                        };
                    })
                };
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id !== sectionId) return s;

                return {
                    ...s,
                    links: s.links.map(l =>
                        l.id === linkId
                            ? {
                                ...l,
                                label: state.label,
                                url: state.url.startsWith('http') ? state.url : `https://${state.url}`,
                                visibility: state.visibility || 'public',
                                allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
                                allowedGroups: state.allowedGroups && state.allowedGroups.length > 0 ? state.allowedGroups : undefined,
                                notes: state.notes?.trim() || undefined,
                                tooltip: state.tooltip?.trim() || stripHtmlTags(state.label).trim() || undefined,
                                browser: state.browser && state.browser !== 'default' ? state.browser : undefined
                            }
                            : l
                    ),
                    richTextContent: s.richTextContent || [] // Preserve richTextContent
                };
            }));
        }

        setEditingLinkId(null);
        setEditLinkState({});
        setShowUserPicker(prev => ({ ...prev, [linkId]: false }));
    };

    const updateEditLinkState = (linkId: string, field: 'label' | 'url' | 'icon' | 'textColor' | 'visibility' | 'allowedUsers' | 'allowedGroups' | 'notes' | 'tooltip' | 'browser', value: string | LinkVisibility | number[]) => {
        setEditLinkState(prev => ({
            ...prev,
            [linkId]: { ...prev[linkId], [field]: value }
        }));
    };

    const toggleEditUserSelection = (linkId: string, userId: number) => {
        const currentUsers = editLinkState[linkId]?.allowedUsers || [];
        const newUsers = currentUsers.includes(userId)
            ? currentUsers.filter(id => id !== userId)
            : [...currentUsers, userId];
        updateEditLinkState(linkId, 'allowedUsers', newUsers);
    };

    const toggleEditGroupSelection = (linkId: string, groupId: number) => {
        const currentGroups = editLinkState[linkId]?.allowedGroups || [];
        const newGroups = currentGroups.includes(groupId)
            ? currentGroups.filter(id => id !== groupId)
            : [...currentGroups, groupId];
        updateEditLinkState(linkId, 'allowedGroups', newGroups);
    };

    // Helper to get normalized sorted items
    const getSortedItems = (section: LinkSection) => {
        const links = (section.links || []).map(l => ({ ...l, type: 'link' as const }));
        const richText = (section.richTextContent || []).map(r => ({ ...r, type: 'rich-text' as const }));
        return [...links, ...richText].sort((a, b) => {
            const posA = a.position !== undefined ? a.position : 0;
            const posB = b.position !== undefined ? b.position : 0;
            return posA - posB;
        });
    };

    const handleMoveItem = (tabId: string, sectionId: string, itemId: string, direction: 'up' | 'down') => {
        const updateSection = (s: LinkSection) => {
            if (s.id !== sectionId) return s;

            // 1. Get all items sorted and normalized
            let items = getSortedItems(s);

            // 2. Find index of item to move
            const index = items.findIndex(i => i.id === itemId);
            if (index === -1) return s;

            // 3. Calculate target index
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= items.length) return s;

            // 4. Swap in the array
            const newItems = [...items];
            [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];

            // 5. Re-assign strict positions
            newItems.forEach((item, idx) => {
                item.position = idx;
            });

            // 6. Split back into links and richTextContent
            const newLinks = newItems.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link);
            const newRichText = newItems.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent);

            return { ...s, links: newLinks, richTextContent: newRichText };
        };

        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(updateSection)
                };
            }));
        } else {
            setEditSections(editSections.map(updateSection));
        }
    };

    // Rich Text Content Handlers
    const handleAddRichTextToSection = (tabId: string, sectionId: string) => {
        const content = newRichTextContent[sectionId]?.trim();
        if (!content) return;

        const newRichText: RichTextContent = {
            id: generateId(),
            content: content,
            position: 0 // Will be set based on current items
        };

        const updateSection = (s: LinkSection) => {
            if (s.id !== sectionId) return s;
            const items = getSortedItems(s);
            const maxPosition = Math.max(...items.map(i => i.position || 0), -1);
            newRichText.position = maxPosition + 1;
            const richTextItems = s.richTextContent || [];
            return {
                ...s,
                richTextContent: [...richTextItems, newRichText]
            };
        };

        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(updateSection)
                };
            }));
        } else {
            setEditSections(editSections.map(updateSection));
        }

        setNewRichTextContent(prev => ({ ...prev, [sectionId]: '' }));
        setShowAddRichTextForm(prev => ({ ...prev, [sectionId]: false }));
    };

    const handleUpdateRichText = (tabId: string, sectionId: string, richTextId: string, content: string) => {
        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;
                        return {
                            ...s,
                            richTextContent: (s.richTextContent || []).map(rt =>
                                rt.id === richTextId ? { ...rt, content } : rt
                            )
                        };
                    })
                };
            }));
        } else {
            setEditSections(editSections.map(s => {
                if (s.id !== sectionId) return s;
                return {
                    ...s,
                    richTextContent: (s.richTextContent || []).map(rt =>
                        rt.id === richTextId ? { ...rt, content } : rt
                    )
                };
            }));
        }
    };

    const handleDeleteRichText = (tabId: string, sectionId: string, richTextId: string) => {
        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;
                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;
                        return {
                            ...s,
                            richTextContent: (s.richTextContent || []).filter(rt => rt.id !== richTextId)
                        };
                    })
                };
            }));
        } else {
            setEditSections(editSections.map(s => {
                if (s.id !== sectionId) return s;
                return {
                    ...s,
                    richTextContent: (s.richTextContent || []).filter(rt => rt.id !== richTextId)
                };
            }));
        }
        setEditingRichTextId(prev => ({ ...prev, [sectionId]: null }));
    };

    const handleMoveRichText = (tabId: string, sectionId: string, richTextId: string, direction: 'up' | 'down') => {
        handleMoveItem(tabId, sectionId, richTextId, direction);
    };

    const toggleLinkSelection = (linkId: string) => {
        setSelectedLinkIds(prev =>
            prev.includes(linkId)
                ? prev.filter(id => id !== linkId)
                : [...prev, linkId]
        );
    };

    const toggleAllLinksInSectionSelection = (section: LinkSection) => {
        const sectionLinkIds = (section.links || []).map(l => l.id);
        const allSelected = sectionLinkIds.length > 0 && sectionLinkIds.every(id => selectedLinkIds.includes(id));

        if (allSelected) {
            setSelectedLinkIds(prev => prev.filter(id => !sectionLinkIds.includes(id)));
        } else {
            setSelectedLinkIds(prev => [...new Set([...prev, ...sectionLinkIds])]);
        }
    };

    const handleBulkMove = (targetTabId: string, targetSectionId: string) => {
        if (selectedLinkIds.length === 0) return;

        // 1. Find and extract all selected links from the appropriate source
        const selectedLinks: Link[] = [];

        const processSection = (section: LinkSection) => {
            const preservedLinks: Link[] = [];
            (section.links || []).forEach(link => {
                if (selectedLinkIds.includes(link.id)) {
                    selectedLinks.push({ ...link });
                } else {
                    preservedLinks.push(link);
                }
            });

            return {
                ...section,
                links: preservedLinks
            };
        };

        // 2. Define finalization logic for a section
        const finalizeSection = (section: LinkSection) => {
            if (section.id !== targetSectionId) {
                // Just re-index to ensure no gaps
                const items = getSortedItems(section);
                items.forEach((item, idx) => { item.position = idx; });
                return {
                    ...section,
                    links: items.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link),
                    richTextContent: items.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent)
                };
            }

            // Target section: add links to the end
            const currentItems = getSortedItems(section);
            const nextPos = currentItems.length;
            const linksToAdd = selectedLinks.map((link, idx) => ({
                ...link,
                position: nextPos + idx
            }));

            const finalItems = [...currentItems, ...linksToAdd.map(l => ({ ...l, type: 'link' as const }))];
            // Ensure strict positions
            finalItems.forEach((item, idx) => { item.position = idx; });

            return {
                ...section,
                links: finalItems.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link),
                richTextContent: finalItems.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent)
            };
        };

        // 3. Apply changes to the relevant state
        if (editTabs.length > 0) {
            // First pass: remove links
            const updatedTabs = editTabs.map(tab => ({
                ...tab,
                sections: tab.sections.map(processSection)
            }));

            if (selectedLinks.length === 0) return;

            // Second pass: add to target
            setEditTabs(updatedTabs.map(tab => ({
                ...tab,
                sections: tab.sections.map(finalizeSection)
            })));
        } else if (editSections.length > 0) {
            // First pass: remove links
            const updatedSections = editSections.map(processSection);

            if (selectedLinks.length === 0) return;

            // Second pass: add to target
            setEditSections(updatedSections.map(finalizeSection));
        }

        setSelectedLinkIds([]);
    };

    const handleBulkCopy = (targetTabId: string, targetSectionId: string) => {
        if (selectedLinkIds.length === 0) return;

        // 1. Find all selected links (don't remove them)
        const linksToCopy: Link[] = [];
        const allSections = editTabs.length > 0
            ? editTabs.flatMap(t => t.sections)
            : editSections;

        allSections.forEach(section => {
            (section.links || []).forEach(link => {
                if (selectedLinkIds.includes(link.id)) {
                    linksToCopy.push({
                        ...link,
                        id: generateId(),
                        label: `${link.label} (Copy)`
                    });
                }
            });
        });

        if (linksToCopy.length === 0) return;

        // 2. Add copies to target section
        const addToSection = (section: LinkSection) => {
            if (section.id !== targetSectionId) return section;

            const currentItems = getSortedItems(section);
            const nextPos = currentItems.length;

            const newLinks = linksToCopy.map((link, idx) => ({
                ...link,
                position: nextPos + idx
            }));

            const finalItems = [...currentItems, ...newLinks.map(l => ({ ...l, type: 'link' as const }))];
            finalItems.forEach((item, idx) => { item.position = idx; });

            return {
                ...section,
                links: finalItems.filter(i => i.type === 'link').map(({ type, ...rest }) => rest as Link),
                richTextContent: finalItems.filter(i => i.type === 'rich-text').map(({ type, ...rest }) => rest as RichTextContent)
            };
        };

        if (editTabs.length > 0) {
            setEditTabs(editTabs.map(tab => ({
                ...tab,
                sections: tab.sections.map(addToSection)
            })));
        } else {
            setEditSections(editSections.map(addToSection));
        }

        setSelectedLinkIds([]);
    };

    const handleCloneLink = (tabId: string, sectionId: string, linkId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(section => {
                    if (section.id !== sectionId) return section;

                    const items = getSortedItems(section);
                    const sourceIndex = items.findIndex(i => i.id === linkId && i.type === 'link');

                    if (sourceIndex === -1) return section;

                    const linkToClone = items[sourceIndex] as Link;

                    // Clone the link with a new ID
                    const clonedLink: Link = {
                        id: generateId(),
                        label: `${linkToClone.label} (Copy)`,
                        url: linkToClone.url,
                        icon: linkToClone.icon,
                        textColor: linkToClone.textColor,
                        visibility: linkToClone.visibility,
                        allowedUsers: linkToClone.allowedUsers ? [...linkToClone.allowedUsers] : undefined,
                        notes: linkToClone.notes,
                        tooltip: linkToClone.tooltip,
                        health: linkToClone.health,
                        browser: linkToClone.browser
                    };

                    // Insert cloned link after the original in the sorted list
                    const updatedItems = [
                        ...items.slice(0, sourceIndex + 1),
                        { ...clonedLink, type: 'link' as const },
                        ...items.slice(sourceIndex + 1)
                    ];

                    // Re-assign positions and separate back into links and rich text
                    const finalLinks: Link[] = [];
                    const finalRichText: RichTextContent[] = [];

                    updatedItems.forEach((item, index) => {
                        // Extract strictly the properties needed, excluding the temporary 'type'
                        const { type, ...rest } = item;
                        const itemWithPos = { ...rest, position: index };

                        if (type === 'link') {
                            finalLinks.push(itemWithPos as Link);
                        } else {
                            finalRichText.push(itemWithPos as RichTextContent);
                        }
                    });

                    return { ...section, links: finalLinks, richTextContent: finalRichText };
                })
            };
        }));
    };

    const handleCloneRichText = (tabId: string, sectionId: string, richTextId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(section => {
                    if (section.id !== sectionId) return section;

                    const items = getSortedItems(section);
                    const sourceIndex = items.findIndex(i => i.id === richTextId && i.type === 'rich-text');

                    if (sourceIndex === -1) return section;

                    const richTextToClone = items[sourceIndex] as RichTextContent;

                    // Clone the rich text with a new ID
                    const clonedRichText: RichTextContent = {
                        id: generateId(),
                        content: richTextToClone.content,
                        position: richTextToClone.position,
                        visibility: richTextToClone.visibility,
                        allowedUsers: richTextToClone.allowedUsers ? [...richTextToClone.allowedUsers] : undefined,
                        visibleFrom: richTextToClone.visibleFrom,
                        expiresAt: richTextToClone.expiresAt
                    };

                    // Insert cloned rich text after the original in the sorted list
                    const updatedItems = [
                        ...items.slice(0, sourceIndex + 1),
                        { ...clonedRichText, type: 'rich-text' as const },
                        ...items.slice(sourceIndex + 1)
                    ];

                    // Re-assign positions and separate back into links and rich text
                    const finalLinks: Link[] = [];
                    const finalRichText: RichTextContent[] = [];

                    updatedItems.forEach((item, index) => {
                        const { type, ...rest } = item;
                        const itemWithPos = { ...rest, position: index };

                        if (type === 'link') {
                            finalLinks.push(itemWithPos as Link);
                        } else {
                            finalRichText.push(itemWithPos as RichTextContent);
                        }
                    });

                    return { ...section, links: finalLinks, richTextContent: finalRichText };
                })
            };
        }));
    };

    const handleUpdateRichTextScheduling = (tabId: string, sectionId: string, richTextId: string, visibleFrom?: string, expiresAt?: string) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                richTextContent: section.richTextContent?.map(richText =>
                                    richText.id === richTextId
                                        ? {
                                            ...richText,
                                            visibleFrom: visibleFrom || undefined,
                                            expiresAt: expiresAt || undefined
                                        }
                                        : richText
                                ) || []
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    const handleUpdateRichTextVisibility = (tabId: string, sectionId: string, richTextId: string, visibility: LinkVisibility) => {
        setEditTabs(editTabs.map(tab =>
            tab.id === tabId
                ? {
                    ...tab,
                    sections: tab.sections.map(section =>
                        section.id === sectionId
                            ? {
                                ...section,
                                richTextContent: section.richTextContent?.map(richText =>
                                    richText.id === richTextId
                                        ? {
                                            ...richText,
                                            visibility: visibility,
                                            allowedUsers: visibility === 'private' ? richText.allowedUsers : undefined
                                        }
                                        : richText
                                ) || []
                            }
                            : section
                    )
                }
                : tab
        ));
    };

    // Helper function to format browser name for display
    const formatBrowserName = (browserId: string | null | undefined): string => {
        if (!browserId || browserId === 'default') return '';
        return browserId
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase())
            .replace('Wsl', '(WSL)')
            .trim();
    };

    // Helper function to normalize browser ID (map aliases to full IDs)
    // IMPORTANT: We should NOT remove -wsl suffix - the extension's normalizeBrowserId handles that
    // The extension maps: edge-stable-wsl -> edge-stable (WSL), edge-stable -> edge-stable-local (Local)
    // So we must pass WSL browsers WITH the -wsl suffix to the extension
    const normalizeBrowserId = (browserId: string): string => {
        if (!browserId) return browserId;

        const normalized = browserId.toLowerCase().trim();

        // DO NOT remove -wsl suffix - pass it to the extension as-is
        // The extension's normalizeBrowserId will correctly map:
        // - edge-stable-wsl -> edge-stable (WSL browser)
        // - edge-stable -> edge-stable-local (Local browser)

        // Only handle short aliases that need mapping
        const shortAliases: Record<string, string> = {
            'edge': 'edge-stable-local',
            'chrome': 'chrome-stable-local'
        };

        if (shortAliases[normalized]) {
            return shortAliases[normalized];
        }

        // Return as-is - let the extension's normalizeBrowserId handle all WSL/local mapping
        // This is critical: WSL browsers must keep their -wsl suffix
        return browserId;
    };

    // Function to open link in a specific browser
    const openLinkInBrowser = (url: string, browserId: string) => {
        if (typeof window !== 'undefined' && (window as any).BrowserLauncher) {
            const BrowserLauncher = (window as any).BrowserLauncher;

            // Configure extension ID if provided
            if (settings.browser_extension_id) {
                BrowserLauncher.setExtensionId(settings.browser_extension_id);
            }

            // Normalize browser ID before opening
            const normalizedBrowserId = normalizeBrowserId(browserId);
            console.log('Opening link in browser:', url, 'browserId:', browserId, 'normalized:', normalizedBrowserId);

            // Open link in specified browser
            BrowserLauncher.open(url, normalizedBrowserId, { fallback: true }, (response: any) => {
                if (response && response.success !== false) {
                    console.log('Link opened successfully in browser:', normalizedBrowserId);
                } else {
                    // Fallback to default behavior if extension fails
                    console.warn('Browser extension failed, falling back to default:', response?.error);
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            }).catch((error: any) => {
                // Fallback to default behavior on error
                console.warn('Browser extension error, falling back to default:', error);
                window.open(url, '_blank', 'noopener,noreferrer');
            });
        } else {
            // Fallback to default behavior if BrowserLauncher is not available
            console.warn('BrowserLauncher not available, using default browser');
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCopy = async (e: React.MouseEvent, text: string, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            // Try modern Clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                setCopiedId(id);
                setTimeout(() => setCopiedId(null), 2000);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        setCopiedId(id);
                        setTimeout(() => setCopiedId(null), 2000);
                    } else {
                        console.error('Copy command failed');
                    }
                } catch (err) {
                    console.error('Fallback copy failed:', err);
                } finally {
                    document.body.removeChild(textArea);
                }
            }
        } catch (err) {
            console.error('Failed to copy text:', err);
            // Still show feedback even if copy fails
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    // Health Check Handlers
    const handleCheckTileHealth = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        setCheckingHealth(true);
        try {
            const results = await linkHealthService.checkTileLinks(tile.id);
            if (results && typeof results === 'object') {
                setLinkHealth(prev => ({ ...prev, ...results }));

                // Best-effort: also record per-URL client/server latency into Performance Analytics (if enabled).
                // This is intentionally fire-and-forget: health check UX must remain fast.
                void (async () => {
                    try {
                        const cfg = await performanceAnalyticsService.ensureLocation(undefined, { allowPrompt: true });
                        if (!cfg.enabled) return;

                        const sections = getAllSections();
                        const allLinks = sections.flatMap(s => (s?.links || []));

                        const shouldTest = (url: string) => {
                            const patterns = cfg.beaconUrls || [];
                            if (!patterns.length) return true;
                            return patterns.some(p => url.includes(p));
                        };

                        const targets = allLinks
                            .filter(l => typeof l?.url === 'string' && (l.url.startsWith('http://') || l.url.startsWith('https://')))
                            .filter(l => shouldTest(l.url));

                        if (!targets.length) return;

                        const batchSize = 4;
                        const metrics: AnalyticsMetric[] = [];

                        for (let i = 0; i < targets.length; i += batchSize) {
                            const batch = targets.slice(i, i + batchSize);
                            const measured = await Promise.all(
                                batch.map(async (l) => {
                                    const m = await performanceAnalyticsService.measureUrlLatency(l.url);
                                    return { link: l, measured: m };
                                })
                            );

                            for (const item of measured) {
                                const linkId = item.link.id;
                                const health = (results as LinkHealthMap)[linkId];

                                // Client metric: always record (even if request failed or URL is invalid)
                                metrics.push({
                                    url: item.link.url,
                                    measurement_type: 'client',
                                    full_response_time: item.measured.durationMs,
                                    http_status_code: item.measured.httpStatus ?? 0,
                                    error_message: item.measured.error ?? null,
                                    ok: item.measured.ok,
                                    error_category: item.measured.errorCategory,
                                    response_type: item.measured.responseType,
                                    redirected: item.measured.redirected,
                                    final_url: item.measured.finalUrl,
                                    method: item.measured.method,
                                    cache_mode: item.measured.cacheMode,
                                    timeout_ms: item.measured.timeoutMs,
                                    attempted_at: item.measured.attemptedAt,
                                    tile_id: tile.id,
                                    link_id: item.link.id
                                });
                            }
                        }

                        // Force send on explicit user action ("Check Links") so it never gets skipped by sampling.
                        await performanceAnalyticsService.sendMetrics(metrics, { force: true });
                    } catch (err) {
                        // Never let analytics failures affect the user experience
                        console.debug('Performance analytics capture skipped:', err);
                    }
                })();
            } else {
                console.warn('Unexpected results format:', results);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            alert(`Failed to check link health: ${errorMessage}. Please try again.`);
        } finally {
            setCheckingHealth(false);
        }
    };

    const handleCheckSingleLink = async (linkId: string) => {
        setCheckingLinkId(linkId);
        setLinkHealth(prev => ({
            ...prev,
            [linkId]: { ...prev[linkId], status: 'checking' }
        }));

        try {
            const health = await linkHealthService.checkLink(linkId);
            setLinkHealth(prev => ({ ...prev, [linkId]: health }));
        } catch (error) {
            console.error('Failed to check link:', error);
            setLinkHealth(prev => ({
                ...prev,
                [linkId]: { ...prev[linkId], status: 'unknown', error: 'Check failed' }
            }));
        } finally {
            setCheckingLinkId(null);
        }
    };

    // Helper to get health indicator
    const getHealthIndicator = (linkId: string) => {
        const health = linkHealth[linkId];
        const status = health?.status || 'unknown';
        const colorClass = linkHealthService.getHealthColor(status);
        const label = linkHealthService.getHealthLabel(status);
        const errorText = health?.error ? `: ${health.error}` : '';

        return (
            <div
                className={`w-2 h-2 rounded-full ${colorClass} shrink-0`}
                title={`${label}${errorText}`}
            />
        );
    };

    // Filter links logic for View Mode
    // Get sections from tabs or directly (backward compatibility)
    const getAllSections = () => {
        if (tile.tabs && tile.tabs.length > 0) {
            // Flatten sections from all tabs
            return tile.tabs.flatMap(tab => tab.sections);
        }
        return tile.sections || [];
    };

    // Performance Analytics: automatic (sampled) scan when opening a tile with links.
    // This seeds URLs into analytics even if they fail/are invalid.
    const lastAutoScanRef = useRef<number>(0);
    useEffect(() => {
        void (async () => {
            try {
                const now = Date.now();
                // Avoid spamming if user navigates quickly
                if (now - lastAutoScanRef.current < 60_000) return;
                lastAutoScanRef.current = now;

                const cfg = await performanceAnalyticsService.getConfig();
                if (!cfg.enabled) return;

                const sections = getAllSections();
                const allLinks = sections.flatMap(s => (s?.links || []));
                if (!allLinks.length) return;

                const shouldTest = (url: string) => {
                    const patterns = cfg.beaconUrls || [];
                    if (!patterns.length) return true;
                    return patterns.some(p => url.includes(p));
                };

                const targets = allLinks
                    .filter(l => typeof l?.url === 'string' && l.url.trim().length > 0)
                    .filter(l => shouldTest(l.url));

                if (!targets.length) return;

                // Try to ensure location for accurate geographic performance data
                const cfgWithLoc = await performanceAnalyticsService.ensureLocation(cfg, { allowPrompt: true });
                if (!cfgWithLoc.enabled) return;

                const batchSize = 4;
                const metrics: AnalyticsMetric[] = [];

                for (let i = 0; i < targets.length; i += batchSize) {
                    const batch = targets.slice(i, i + batchSize);
                    const measured = await Promise.all(
                        batch.map(async (l) => {
                            const url = l.url;
                            if (url.startsWith('http://') || url.startsWith('https://')) {
                                const m = await performanceAnalyticsService.measureUrlLatency(url);
                                return { link: l, measured: m };
                            }
                            // Non-http(s): record as failure (0ms, status 0)
                            return {
                                link: l,
                                measured: {
                                    ok: false,
                                    durationMs: 0,
                                    httpStatus: 0,
                                    responseType: null,
                                    redirected: false,
                                    finalUrl: null,
                                    errorCategory: 'invalid_url',
                                    error: 'Non-http(s) URL',
                                    attemptedAt: Date.now(),
                                    method: 'HEAD',
                                    cacheMode: 'no-store',
                                    timeoutMs: 0
                                }
                            };
                        })
                    );

                    measured.forEach(item => {
                        metrics.push({
                            url: item.link.url,
                            measurement_type: 'client',
                            full_response_time: item.measured.durationMs,
                            http_status_code: item.measured.httpStatus ?? 0,
                            error_message: item.measured.error ?? null,
                            ok: item.measured.ok,
                            error_category: item.measured.errorCategory,
                            response_type: item.measured.responseType,
                            redirected: item.measured.redirected,
                            final_url: item.measured.finalUrl,
                            method: item.measured.method,
                            cache_mode: item.measured.cacheMode,
                            timeout_ms: item.measured.timeoutMs,
                            attempted_at: item.measured.attemptedAt,
                            tile_id: tile.id,
                            link_id: item.link.id
                        });
                    });
                }

                // Sampled send for background scans (respects sampleRate).
                await performanceAnalyticsService.sendMetrics(metrics);
            } catch {
                // ignore
            }
        })();
        // Intentionally only rescan when tile changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tile.id]);

    // Helper to check if content is visible based on schedule
    const isContentVisible = (item: { visibleFrom?: string; expiresAt?: string }) => {
        if (!item.visibleFrom && !item.expiresAt) return true;

        const now = new Date();

        if (item.visibleFrom) {
            const visibleFrom = new Date(item.visibleFrom);
            if (now < visibleFrom) return false;
        }

        if (item.expiresAt) {
            const expiresAt = new Date(item.expiresAt);
            if (now > expiresAt) return false;
        }

        return true;
    };

    // Initialize selected tab: restore from localStorage if valid, otherwise select first visible tab
    useEffect(() => {
        if (tile.tabs && tile.tabs.length > 0) {
            // Sort tabs by position and filter visible ones
            const sortedTabs = [...tile.tabs]
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .filter(tab => isEditing || isContentVisible(tab)); // Show all in edit mode

            if (sortedTabs.length > 0) {
                // Check if saved tab ID is still valid (exists and is visible)
                if (selectedTabId) {
                    const savedTabExists = sortedTabs.some(tab => tab.id === selectedTabId);
                    if (savedTabExists) {
                        // Saved tab is valid, keep it selected
                        return;
                    } else {
                        // Saved tab no longer exists or is not visible, clear it
                        try {
                            localStorage.removeItem(`tile_selected_tab_${tile.id}`);
                        } catch (error) {
                            console.error('Failed to remove invalid tab from localStorage:', error);
                        }
                        // Fall through to select first tab
                    }
                }

                // No valid saved tab, select the first visible one
                setSelectedTabId(sortedTabs[0].id);
            }
        } else if (!tile.tabs || tile.tabs.length === 0) {
            // No tabs exist, clear the saved selection
            try {
                localStorage.removeItem(`tile_selected_tab_${tile.id}`);
            } catch (error) {
                console.error('Failed to clear tab selection from localStorage:', error);
            }
            setSelectedTabId(null);
        }
    }, [tile.tabs, selectedTabId, isEditing, tile.id]);

    const getFilteredSections = () => {
        let sectionsToFilter = [];

        // If tabs exist, show sections from selected tab (or first visible tab if none selected yet)
        if (tile.tabs && tile.tabs.length > 0) {
            const sortedTabs = [...tile.tabs]
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .filter(tab => isEditing || isContentVisible(tab)); // Show all in edit mode

            // If selected tab is not visible (e.g. expired while viewing), switch to first visible
            let tabIdToUse = selectedTabId;
            if (tabIdToUse && !isEditing) {
                const selectedTab = tile.tabs.find(t => t.id === tabIdToUse);
                if (selectedTab && !isContentVisible(selectedTab)) {
                    tabIdToUse = null;
                }
            }

            tabIdToUse = tabIdToUse || (sortedTabs.length > 0 ? sortedTabs[0].id : null);

            if (tabIdToUse) {
                const selectedTab = tile.tabs.find(tab => tab.id === tabIdToUse);
                if (selectedTab && selectedTab.sections) {
                    // Sort sections by position
                    sectionsToFilter = [...selectedTab.sections].sort((a, b) => {
                        const posA = a.position ?? 0;
                        const posB = b.position ?? 0;
                        return posA - posB;
                    });
                } else {
                    sectionsToFilter = [];
                }
            }
        } else {
            // Otherwise, get all sections (backward compatibility - no tabs)
            sectionsToFilter = getAllSections();
        }

        // Filter sections and links by schedule in view mode
        // Apply role-based filtering ONLY if sourceTab is "your-apps"
        // For all other tabs (public, private, etc.), show all links based on their own visibility settings
        if (!isEditing) {
            // Only apply role-based filtering if we came from "Your Apps" tab
            // BUT for 'authenticated' tiles (which are now in Your Apps), we show full content
            const shouldApplyRoleFiltering = sourceTab === 'your-apps' && tile.visibility !== 'authenticated';

            sectionsToFilter = sectionsToFilter
                .filter(section => isContentVisible(section))
                .map(section => ({
                    ...section,
                    links: section.links.filter(link => {
                        // Always filter by schedule
                        if (!isContentVisible(link)) return false;
                        // Only apply role-based filtering if source is "Your Apps" tab
                        // For all other tabs (public, private, authenticated), show all links based on their visibility
                        if (shouldApplyRoleFiltering) {
                            return link.hasRoleAccess === true;
                        }
                        return true;
                    })
                }))
                .filter(section => section.links.length > 0);
        }

        // Apply search filter if search term exists
        if (!searchTerm) return sectionsToFilter;

        return sectionsToFilter.map(section => ({
            ...section,
            links: section.links.filter(link =>
                link.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                link.url.toLowerCase().includes(searchTerm.toLowerCase())
            )
        })).filter(section => section.links.length > 0);
    };

    const filteredSections = getFilteredSections();
    const allSections = getAllSections();
    const totalLinks = allSections?.reduce((acc, s) => acc + (s.links?.length || 0), 0) || 0;

    // Get tabs for view mode (for tab navigation) - sort by position and filter by schedule
    const displayTabs = tile.tabs && tile.tabs.length > 0
        ? [...tile.tabs]
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .filter(tab => isEditing || isContentVisible(tab)) // Show all in edit mode
        : [];


    // VIEW MODE
    if (!isEditing) {
        return (
            <>
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 min-h-[80vh] flex flex-col w-full pb-10">

                    {/* Compact Modern Header */}
                    <div className="linknest-content-header relative rounded-2xl overflow-hidden mb-6 group border border-slate-200 dark:border-slate-700/50 shadow-lg dark:shadow-none isolate">
                        {/* Ambient Background - rounded to match parent and avoid corner artifacts */}
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${styles.gradient} opacity-90 dark:opacity-20`}></div>
                        {/* Light mode overlay - solid overlay instead of backdrop-blur to avoid corner notch artifacts */}
                        <div className="absolute inset-0 rounded-2xl bg-white/10 dark:bg-slate-900/60"></div>

                        <div className="relative z-10 px-6 py-6 flex flex-col md:flex-row items-center gap-6">

                            {/* Icon Box */}
                            <div className={`
                    linknest-content-link-icon w-16 h-16 rounded-2xl ${styles.base} shadow-xl shadow-black/10 dark:shadow-black/20 
                    flex items-center justify-center text-3xl shrink-0 border-t border-white/20 text-white
                `}>
                                {tile.emoji}
                            </div>

                            {/* Title & Meta */}
                            <div className="flex-1 min-w-0 text-center md:text-left">
                                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                                    <h1 className="linknest-content-title text-2xl md:text-3xl font-bold text-white tracking-tight">
                                        {tile.title}
                                    </h1>
                                </div>
                                <p className="text-white/80 dark:text-slate-400 text-sm font-medium dark:font-normal">{tile.description}</p>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-3">
                                {/* Export single space */}
                                <button
                                    onClick={() => exportTileToFile(tile)}
                                    className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 backdrop-blur-sm"
                                    title="Export this space as JSON"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M3.75 2.75A.75.75 0 014.5 2h11a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0V4.56l-4.72 4.72a.75.75 0 01-1.06 0L5.25 4.56v9.69h3.5a.75.75 0 010 1.5h-4.25a.75.75 0 01-.75-.75v-12z" />
                                        <path d="M12.75 10.75a.75.75 0 00-1.5 0v3.44l-1.72-1.72a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25a.75.75 0 10-1.06-1.06l-1.72 1.72v-3.44z" />
                                    </svg>
                                    <span>Export</span>
                                </button>
                                {/* Check All Links Button */}
                                <button
                                    onClick={(e) => handleCheckTileHealth(e)}
                                    disabled={checkingHealth}
                                    className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Check all links in this tile"
                                    type="button"
                                >
                                    {checkingHealth ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>Checking...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                            </svg>
                                            <span>Check Links</span>
                                        </>
                                    )}
                                </button>

                                {isAuthenticated && tile.canEdit === true && (
                                    <>
                                        <button
                                            onClick={async () => {
                                                if (tile.canEdit !== true) {
                                                    alert('You do not have permission to edit this tile.');
                                                    return;
                                                }
                                                setIsEditing(true);
                                            }}
                                            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 backdrop-blur-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                            </svg>
                                            <span>Edit</span>
                                        </button>
                                        {(user?.is_admin || tile.canCloneTile === true) && (
                                            <button
                                                onClick={async () => {
                                                    if (!isAuthenticated) {
                                                        if (onAuthRequired) onAuthRequired();
                                                        return;
                                                    }
                                                    if (!tile.canEdit && !user?.is_admin) {
                                                        alert('You do not have permission to clone this space.');
                                                        return;
                                                    }
                                                    try {
                                                        await cloneTile(tile.id);
                                                        // Fetch fresh tiles to get the cloned one
                                                        const freshTiles = await getTiles();
                                                        onUpdateTiles(freshTiles);
                                                        alert('Space cloned successfully!');
                                                    } catch (error) {
                                                        console.error('Failed to clone tile:', error);
                                                        alert('Failed to clone space. Please try again.');
                                                    }
                                                }}
                                                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 backdrop-blur-sm"
                                                title="Clone this space"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                                </svg>
                                                <span>Clone</span>
                                            </button>
                                        )}
                                    </>
                                )}
                                <button
                                    onClick={() => window.location.hash = '#/'}
                                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all backdrop-blur-sm flex items-center justify-center"
                                    title="Back to Dashboard"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar - Now at the top */}
                    <div className="mb-6">
                        <div className="bg-white dark:bg-slate-900/50 backdrop-blur border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <div className="relative flex-1 w-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Find link..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-slate-600 focus:border-brand-500 rounded-lg pl-10 pr-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none transition-all"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium uppercase tracking-wider">
                                        <span>Total Links</span>
                                        <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 font-semibold">{totalLinks}</span>
                                    </div>

                                    {/* View Layout Toggle */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">View:</span>
                                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                            <button
                                                onClick={() => setViewLayout('stacked')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewLayout === 'stacked'
                                                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                                title="Stacked view - sections appear vertically"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 4.5zM2 10a2.5 2.5 0 012.5-2.5h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 10zM4.5 13.5A2.5 2.5 0 002 16a2.5 2.5 0 002.5 2.5h11a2.5 2.5 0 000-5h-11z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => setViewLayout('side-by-side')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewLayout === 'side-by-side'
                                                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                                title="Side-by-side view - sections appear horizontally"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M2 4.5A2.5 2.5 0 014.5 2h3A2.5 2.5 0 0110 4.5v11A2.5 2.5 0 017.5 18h-3A2.5 2.5 0 012 15.5v-11zM10.5 2A2.5 2.5 0 0013 4.5v11a2.5 2.5 0 01-2.5 2.5H13a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0013 2h-.5z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rolling Messages Display - Below Search Bar */}
                    {activeMessages.length > 0 && (
                        <div className="mb-2 w-full group/message relative cursor-help">
                            {/* Custom Instant Tooltip - Optimized for Large Detail View */}
                            <div
                                className="tooltip-force-black absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-yellow-400 text-[10px] rounded-lg shadow-xl opacity-0 translate-y-2 group-hover/message:opacity-100 group-hover/message:translate-y-0 transition-all duration-200 pointer-events-none z-[100] border border-yellow-500 w-max max-w-[400px] text-left"
                            >
                                {activeMessages.map((m, idx) => (
                                    <div key={m.id} className="last:mb-0 mb-1 leading-tight">
                                        {activeMessages.length > 1 && <span className="opacity-50 mr-1">{idx + 1}.</span>}
                                        {stripFormatting(m.content)}
                                    </div>
                                ))}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-yellow-400"></div>
                            </div>

                            <div className={`relative h-6 flex items-center overflow-hidden ${!activeMessages[0].textColor ? (
                                activeMessages[0].type === 'alert' ? 'text-amber-600 dark:text-amber-400' :
                                    activeMessages[0].type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                                        activeMessages[0].type === 'celebration' ? 'text-pink-600 dark:text-pink-400' :
                                            'text-brand-600 dark:text-brand-400'
                            ) : ''}`}
                                style={activeMessages[0].textColor ? {
                                    // Only set color on parent if custom color is set, to override tile text color
                                    color: activeMessages[0].textColor
                                } : undefined}
                            >
                                {(() => {
                                    // Check if all messages use rollover animation
                                    const allRollover = activeMessages.length > 0 && activeMessages.every(msg => !msg.animationType || msg.animationType === 'rollover');

                                    if (allRollover) {
                                        // Rollover animation - stock ticker style: single copy, right-to-left, pause when fully gone
                                        return (
                                            <div className="animate-rolling-detail flex items-center gap-10 text-sm font-semibold">
                                                {activeMessages.map((msg, idx) => (
                                                    <div
                                                        key={`${msg.id}-${idx}`}
                                                        className="flex items-center gap-2 shrink-0"
                                                        style={{
                                                            ...(msg.textColor ? { '--message-text-color': msg.textColor, color: msg.textColor } : {}),
                                                            fontStyle: msg.fontStyle === 'italic' || msg.fontStyle === 'bold italic' ? 'italic' : undefined,
                                                            fontWeight: msg.fontStyle === 'bold' || msg.fontStyle === 'bold italic' ? 'bold' : undefined
                                                        } as React.CSSProperties}
                                                        data-message-color={msg.textColor || ''}
                                                    >
                                                        {renderMessageContent(msg.content)}
                                                        {msg.url && (
                                                            <a
                                                                href={msg.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                                                                onClick={(e) => e.stopPropagation()}
                                                                title={msg.urlLabel || 'Click for more info'}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                                                    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                                                </svg>
                                                                {msg.urlLabel || 'Info'}
                                                            </a>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    } else {
                                        // Other animations - show one message at a time, cycle through them
                                        const currentMsg = activeMessages[currentMessageIndex] || activeMessages[0];

                                        if (!currentMsg) {
                                            return null;
                                        }

                                        const currentAnimationType = currentMsg.animationType || 'rollover';
                                        const animationClass = getMessageAnimationClass(currentAnimationType);

                                        return (
                                            <div className={`flex items-center gap-2 text-sm font-semibold ${animationClass}`}>
                                                <div
                                                    key={`${currentMsg.id}-current`}
                                                    className="flex items-center gap-1"
                                                    style={{
                                                        ...(currentMsg.textColor ? { '--message-text-color': currentMsg.textColor, color: currentMsg.textColor } : {}),
                                                        fontStyle: currentMsg.fontStyle === 'italic' || currentMsg.fontStyle === 'bold italic' ? 'italic' : undefined,
                                                        fontWeight: currentMsg.fontStyle === 'bold' || currentMsg.fontStyle === 'bold italic' ? 'bold' : undefined
                                                    } as React.CSSProperties}
                                                    data-message-color={currentMsg.textColor || ''}
                                                >
                                                    {renderMessageContent(currentMsg.content)}
                                                    {currentMsg.url && (
                                                        <a
                                                            href={currentMsg.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title={currentMsg.urlLabel || 'Click for more info'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                                                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                                            </svg>
                                                            {currentMsg.urlLabel || 'Info'}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Main Content Area - Full Width */}
                    <div className="flex flex-col gap-8">
                        {/* Mobile HTML Content */}
                        {tile.htmlContent && (
                            <div className="lg:hidden bg-white dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm">
                                <div
                                    className="prose prose-sm max-w-none dark:prose-invert"
                                    dangerouslySetInnerHTML={{ __html: tile.htmlContent }}
                                />
                            </div>
                        )}

                        {/* Desktop HTML Content - Now above tabs */}
                        {tile.htmlContent && (
                            <div className="hidden lg:block bg-white dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                                <div
                                    className="prose prose-sm max-w-none dark:prose-invert prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-a:text-brand-500 dark:prose-a:text-brand-400 prose-headings:text-slate-800 dark:prose-headings:text-slate-200 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: tile.htmlContent }}
                                />
                            </div>
                        )}

                        {/* Tab Navigation */}
                        {displayTabs && displayTabs.length > 0 && (
                            <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-sm rounded-t-xl">
                                <div className="flex gap-2 min-w-max py-1 px-2">
                                    {displayTabs.map((tab) => {
                                        const isActive = selectedTabId === tab.id;
                                        const tabSections = tab.sections || [];
                                        // Only apply role-based filtering if source is "Your Apps" tab
                                        const shouldApplyRoleFiltering = sourceTab === 'your-apps';
                                        // Count links, filtering by role access if needed
                                        const tabLinksCount = tabSections.reduce((acc, s) => {
                                            const links = s.links || [];
                                            const filteredLinks = shouldApplyRoleFiltering
                                                ? links.filter(link => link.hasRoleAccess === true)
                                                : links;
                                            return acc + filteredLinks.length;
                                        }, 0);

                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setSelectedTabId(tab.id)}
                                                data-active={isActive}
                                                className={`linknest-content-tab relative px-5 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap rounded-lg ${isActive
                                                    ? `${styles.text} font-semibold`
                                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                                    }`}
                                                style={tab.textColor && isActive ? { color: tab.textColor } : undefined}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {tab.title}
                                                    {tabLinksCount > 0 && (
                                                        <span className={`px-2 py-0.5 text-xs rounded-full font-semibold transition-colors ${isActive
                                                            ? `${styles.iconBg} ${styles.text}`
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                            }`}>
                                                            {tabLinksCount}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {filteredSections.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-600 mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                </div>
                                <p className="text-slate-500 font-medium">No links found</p>
                            </div>
                        ) : (
                            <div
                                className={viewLayout === 'stacked' ? 'space-y-8' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}
                                data-view-layout={viewLayout}
                            >
                                {filteredSections.map((section, sectionIndex) => {
                                    // Check if this section should force stacked view for its content (links/rich text)
                                    const shouldForceStacked = section.forceStackedView === true;

                                    return (
                                        <div
                                            key={section.id}
                                            className="linknest-content-section animate-in fade-in slide-in-from-bottom-2 bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-200/80 dark:border-slate-700/50 p-6 shadow-sm"
                                        >
                                            {/* Section Title */}
                                            {section.title && (
                                                <h3
                                                    className={`linknest-content-section-title text-lg font-bold mb-5 flex items-center gap-3 ${!section.textColor ? 'text-slate-800 dark:text-white' : ''}`}
                                                    style={section.textColor ? { color: section.textColor } : undefined}
                                                >
                                                    <span className={`w-1.5 h-7 rounded-full ${styles.base} shadow-sm`}></span>
                                                    {section.title}
                                                </h3>
                                            )}

                                            {/* Links and Rich Text - Force stacked if checkbox is checked, otherwise use grid layout (side-by-side) */}
                                            <div className={shouldForceStacked ? 'space-y-4' : 'linknest-content-link-grid'}>
                                                {(() => {
                                                    // Merge links and rich text, sort by position
                                                    const sortedItems = [
                                                        ...(section.links || []).map(l => ({ ...l, itemType: 'link' as const })),
                                                        ...(section.richTextContent || []).map(rt => ({ ...rt, itemType: 'rich-text' as const }))
                                                    ].sort((a, b) => {
                                                        const posA = a.position ?? 0;
                                                        const posB = b.position ?? 0;
                                                        return posA - posB;
                                                    });

                                                    return sortedItems.map((item, itemIndex) => {
                                                        const animationDelay = (sectionIndex * 100) + (itemIndex * 30);

                                                        // Render rich text content
                                                        if (item.itemType === 'rich-text') {
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    style={{ animationDelay: `${animationDelay}ms` }}
                                                                    className="linknest-content-rich-text rich-text-content-item animate-in fade-in slide-in-from-bottom-2"
                                                                >
                                                                    <div
                                                                        className="rich-text-content prose prose-sm max-w-none dark:prose-invert prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-a:text-brand-500 dark:prose-a:text-brand-400 prose-headings:text-slate-800 dark:prose-headings:text-slate-200"
                                                                        dangerouslySetInnerHTML={{ __html: item.content || '' }}
                                                                    />
                                                                </div>
                                                            );
                                                        }

                                                        // Render link (itemType === 'link')
                                                        const link = item as Link;
                                                        const health = linkHealth[link.id];
                                                        const isBroken = health?.status === 'broken';

                                                        return (
                                                            <div
                                                                key={link.id}
                                                                style={{ animationDelay: `${animationDelay}ms` }}
                                                                className={`
                                                    linknest-content-link group relative flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60
                                                    hover:border-brand-300 dark:hover:border-brand-500/50 transition-all duration-300 shadow-sm
                                                    ${isBroken ? 'border-red-300 dark:border-red-500/50 bg-red-50/50 dark:bg-red-900/10' : ''}
                                                `}
                                                                title={link.tooltip || link.label}
                                                            >
                                                                {/* Health Indicator */}
                                                                <div className="linknest-content-link-health flex flex-col items-center gap-1 shrink-0">
                                                                    {getHealthIndicator(link.id)}
                                                                </div>

                                                                <div className={`linknest-content-link-icon w-11 h-11 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0 text-lg select-none shadow-sm border border-white/20`}>
                                                                    {link.icon || '🔗'}
                                                                </div>

                                                                <a
                                                                    href={link.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex-1 min-w-0 block focus:outline-none pr-32 overflow-hidden"
                                                                    onClick={(e) => {
                                                                        // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                                                                        if (e.ctrlKey || e.metaKey) {
                                                                            // Explicitly open in new tab and focus it using window.open
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            // If rich text content exists, still show dialog on Ctrl/Cmd
                                                                            if (link.richTextContent) {
                                                                                setLinkInfoDialog({ link });
                                                                                return;
                                                                            }
                                                                            const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                                                                            // Focus the new window/tab if it was successfully opened
                                                                            if (newWindow) {
                                                                                newWindow.focus();
                                                                            }
                                                                            return;
                                                                        }

                                                                        // If link has rich text content, show dialog instead of opening URL
                                                                        if (link.richTextContent) {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setLinkInfoDialog({ link });
                                                                            return;
                                                                        }

                                                                        // If browser extension is enabled, check for browser configuration
                                                                        if (settings.browser_specific_links_enabled === '1') {
                                                                            // Priority: link-specific browser > tile default browser > default browser
                                                                            const browserToUse = link.browser && link.browser !== 'default'
                                                                                ? link.browser
                                                                                : (tile.browser && tile.browser !== 'default' ? tile.browser : null);

                                                                            if (browserToUse && typeof window !== 'undefined' && (window as any).BrowserLauncher) {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                openLinkInBrowser(link.url, browserToUse);
                                                                                return;
                                                                            }
                                                                            // If BrowserLauncher is not available, allow default behavior
                                                                        }
                                                                        // If no browser is set or set to default, allow normal link behavior (opens in default browser)
                                                                        // Menu will only appear when clicking the browser button
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <h4
                                                                            className={`linknest-content-link-title text-sm font-semibold break-words ${styles.text} group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors`}
                                                                            style={{
                                                                                wordBreak: 'break-word',
                                                                                overflowWrap: 'anywhere',
                                                                                ...(link.textColor ? {
                                                                                    color: link.textColor,
                                                                                    // Add text shadow for better visibility
                                                                                    textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                                                                    fontWeight: '700'
                                                                                } : {})
                                                                            }}
                                                                            dangerouslySetInnerHTML={{ __html: link.label || '' }}
                                                                        />
                                                                    </div>
                                                                    <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                                                                        <div className="linknest-content-link-domain flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors overflow-hidden">
                                                                            <span className="break-words">
                                                                                {link.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                                                            </span>
                                                                            {link.visibility && link.visibility !== 'public' && (
                                                                                <span
                                                                                    className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${link.visibility === 'authenticated'
                                                                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                                                                        : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                                                                                        }`}
                                                                                    title={link.visibility === 'authenticated' ? 'Authenticated users only' : 'Private - specific users only'}
                                                                                >
                                                                                    {link.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                                </span>
                                                                            )}
                                                                            {isBroken && (
                                                                                <span className="text-red-500 text-xs font-medium flex items-center gap-1 shrink-0">
                                                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                                                                    Broken
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {settings.browser_specific_links_enabled === '1' && (() => {
                                                                            // Determine which browser is being used for this link
                                                                            // Priority: link-specific browser > tile default browser > system default
                                                                            const browserToUse = link.browser && link.browser !== 'default'
                                                                                ? link.browser
                                                                                : (tile.browser && tile.browser !== 'default' ? tile.browser : null);

                                                                            // Only show browser indicator if it's not the system default
                                                                            if (browserToUse) {
                                                                                return (
                                                                                    <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                                                                        ({formatBrowserName(browserToUse)} browser)
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                    </div>
                                                                </a>

                                                                {/* Browser Selection Menu - Rendered via Portal */}
                                                                {showBrowserMenu[link.id] && settings.browser_specific_links_enabled === '1' && typeof document !== 'undefined' && createPortal(
                                                                    <>
                                                                        <div
                                                                            className="fixed inset-0 z-[99998] bg-transparent"
                                                                            onClick={() => {
                                                                                setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                setSaveBrowserForLink(prev => ({ ...prev, [link.id]: false }));
                                                                                setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: '' }));
                                                                            }}
                                                                            style={{ pointerEvents: 'auto' }}
                                                                        ></div>
                                                                        <div
                                                                            className="fixed z-[99999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-[300px] overflow-y-auto"
                                                                            style={{
                                                                                top: `${browserMenuPosition[link.id]?.y || 0}px`,
                                                                                left: `${browserMenuPosition[link.id]?.x || 0}px`,
                                                                                width: '180px',
                                                                                maxWidth: '180px',
                                                                                pointerEvents: 'auto',
                                                                                position: 'fixed'
                                                                            }}
                                                                        >
                                                                            <div className="py-1">
                                                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2 py-1.5 mb-0.5">
                                                                                    Open in Browser
                                                                                </div>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: 'default' }));
                                                                                        if (!saveBrowserForLink[link.id]) {
                                                                                            // If not saving, just open the link
                                                                                            setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                            window.open(link.url, '_blank', 'noopener,noreferrer');
                                                                                        }
                                                                                    }}
                                                                                    className={`w-full text-left px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${(!link.browser || link.browser === 'default') && !selectedBrowserForLink[link.id]
                                                                                        ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                                                                                        : selectedBrowserForLink[link.id] === 'default'
                                                                                            ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                                                                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                                        }`}
                                                                                >
                                                                                    <span className="text-xs">🌐</span>
                                                                                    <span>Default Browser</span>
                                                                                </button>
                                                                                {availableBrowsers.length > 0 ? (
                                                                                    availableBrowsers.map((browserId) => {
                                                                                        const displayName = formatBrowserName(browserId);
                                                                                        const isSelected = link.browser === browserId;
                                                                                        const isCurrentlySelected = selectedBrowserForLink[link.id] === browserId || (!selectedBrowserForLink[link.id] && isSelected);
                                                                                        return (
                                                                                            <button
                                                                                                key={browserId}
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: browserId }));
                                                                                                    if (!saveBrowserForLink[link.id]) {
                                                                                                        // If not saving, just open the link
                                                                                                        setShowBrowserMenu(prev => ({ ...prev, [link.id]: false }));
                                                                                                        openLinkInBrowser(link.url, browserId);
                                                                                                    }
                                                                                                }}
                                                                                                className={`w-full text-left px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${isCurrentlySelected
                                                                                                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                                                                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                                                    }`}
                                                                                            >
                                                                                                <span className="text-xs">{isCurrentlySelected ? '✓' : '○'}</span>
                                                                                                <span className="truncate">{displayName || browserId}</span>
                                                                                            </button>
                                                                                        );
                                                                                    })
                                                                                ) : (
                                                                                    <div className="px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400">
                                                                                        No browsers available
                                                                                    </div>
                                                                                )}
                                                                                {/* Admin controls - only show when user has canChangeBrowser */}
                                                                                {isAuthenticated && tile.canEdit && tile.canChangeBrowser === true && (
                                                                                    <>
                                                                                        <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                                                                        <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={saveBrowserForLink[link.id] || false}
                                                                                                onChange={(e) => {
                                                                                                    setSaveBrowserForLink(prev => ({ ...prev, [link.id]: e.target.checked }));
                                                                                                    if (!e.target.checked) {
                                                                                                        setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: '' }));
                                                                                                    } else {
                                                                                                        setSelectedBrowserForLink(prev => ({ ...prev, [link.id]: link.browser || 'default' }));
                                                                                                    }
                                                                                                }}
                                                                                                className="w-3 h-3 text-brand-600 rounded focus:ring-brand-500"
                                                                                            />
                                                                                            <span>Save as default</span>
                                                                                        </label>
                                                                                        {saveBrowserForLink[link.id] && (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    const browserToSave = selectedBrowserForLink[link.id] || link.browser || 'default';
                                                                                                    handleUpdateLinkBrowser(link.id, browserToSave);
                                                                                                }}
                                                                                                className="w-full mx-2 mb-1 px-2 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded transition-colors"
                                                                                            >
                                                                                                Save
                                                                                            </button>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </>,
                                                                    document.body
                                                                )}

                                                                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 z-20 pointer-events-none group-hover:pointer-events-auto">
                                                                    {/* Notes info button - only show if link has notes */}
                                                                    {link.notes && link.notes.trim() && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                // Strip HTML from label for dialog display
                                                                                const tempDiv = document.createElement('div');
                                                                                tempDiv.innerHTML = link.label || '';
                                                                                const plainLabel = tempDiv.textContent || tempDiv.innerText || link.label;
                                                                                setNotesDialogState({
                                                                                    linkId: link.id,
                                                                                    notes: link.notes || '',
                                                                                    linkLabel: plainLabel
                                                                                });
                                                                            }}
                                                                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                                                                            title="View notes"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    {/* Favorite button - available for all users */}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (isAuthenticated) {
                                                                                handleToggleLinkFavorite(link.id);
                                                                            } else {
                                                                                // For guest users, use localStorage
                                                                                togglePublicLinkFavorite(link.id);
                                                                                // Force re-render by updating parent
                                                                                onUpdateTiles([...allTiles], true);
                                                                            }
                                                                        }}
                                                                        className={`p-1 rounded-md transition-all ${isAuthenticated
                                                                            ? (link.isFavorite
                                                                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                                                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700')
                                                                            : (isPublicLinkFavorite(link.id)
                                                                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                                                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700')
                                                                            }`}
                                                                        title={
                                                                            isAuthenticated
                                                                                ? (link.isFavorite ? "Unfavorite" : "Favorite")
                                                                                : (isPublicLinkFavorite(link.id) ? "Unfavorite" : "Favorite")
                                                                        }
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>

                                                                    {/* Re-check button */}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            handleCheckSingleLink(link.id);
                                                                        }}
                                                                        disabled={checkingLinkId === link.id}
                                                                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                                                                        title="Check link health"
                                                                    >
                                                                        {checkingLinkId === link.id ? (
                                                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                                                            </svg>
                                                                        )}
                                                                    </button>

                                                                    {/* Copy button */}
                                                                    <button
                                                                        onClick={(e) => handleCopy(e, link.url, link.id)}
                                                                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all relative"
                                                                        title="Copy URL"
                                                                    >
                                                                        {copiedId === link.id ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                                                                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                            </svg>
                                                                        )}
                                                                    </button>

                                                                    {/* Browser selection button - only show when extension is enabled, user is authenticated, and has canChangeBrowser */}
                                                                    {settings.browser_specific_links_enabled === '1' && isAuthenticated && tile.canChangeBrowser === true && typeof window !== 'undefined' && (window as any).BrowserLauncher && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();

                                                                                // Show browser selection menu with smart positioning
                                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                                const menuWidth = 180;
                                                                                const menuHeight = Math.min(300, (availableBrowsers.length + 1) * 28 + 40);
                                                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                                                const spaceAbove = rect.top;
                                                                                const spaceRight = window.innerWidth - rect.right;
                                                                                const spaceLeft = rect.left;

                                                                                // Calculate vertical position - align with button top
                                                                                let menuY = rect.top;
                                                                                // If not enough space below, align with button bottom
                                                                                if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                                                                                    menuY = rect.bottom - menuHeight;
                                                                                }
                                                                                menuY = Math.max(10, Math.min(menuY, window.innerHeight - menuHeight - 10));

                                                                                // Calculate horizontal position - prefer right side of button, fallback to left
                                                                                let menuX = rect.right + 8;
                                                                                if (spaceRight < menuWidth && spaceLeft > spaceRight) {
                                                                                    menuX = rect.left - menuWidth - 8;
                                                                                }
                                                                                menuX = Math.max(10, Math.min(menuX, window.innerWidth - menuWidth - 10));

                                                                                setBrowserMenuPosition(prev => ({
                                                                                    ...prev,
                                                                                    [link.id]: {
                                                                                        x: menuX,
                                                                                        y: menuY
                                                                                    }
                                                                                }));
                                                                                setShowBrowserMenu(prev => ({ ...prev, [link.id]: true }));
                                                                            }}
                                                                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                                                                            title="Open in browser"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM9 8a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1zm-3 4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Notes Dialog */}
                {notesDialogState && (
                    <>
                        {typeof document !== 'undefined' && createPortal(
                            <div
                                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                                onClick={() => setNotesDialogState(null)}
                            >
                                <div
                                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full max-h-[80vh] flex flex-col"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Dialog Header */}
                                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Link Notes</h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{notesDialogState.linkLabel}</p>
                                        </div>
                                        <button
                                            onClick={() => setNotesDialogState(null)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Dialog Content */}
                                    <div className="px-6 py-4 flex-1 overflow-y-auto">
                                        <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                            {notesDialogState.notes}
                                        </div>
                                    </div>

                                    {/* Dialog Footer */}
                                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
                                        <button
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                try {
                                                    await navigator.clipboard.writeText(notesDialogState.notes);
                                                    // Show feedback
                                                    setNotesCopied(true);
                                                    setTimeout(() => {
                                                        setNotesCopied(false);
                                                    }, 2000);
                                                } catch (err) {
                                                    console.error('Failed to copy:', err);
                                                    alert('Failed to copy to clipboard');
                                                }
                                            }}
                                            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                        >
                                            {notesCopied ? (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                    </svg>
                                                    Copied!
                                                </>
                                            ) : (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                    </svg>
                                                    Copy Notes
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setNotesDialogState(null);
                                                setNotesCopied(false);
                                            }}
                                            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </>
                )}

                {/* Link Info Dialog */}
                {linkInfoDialog && (
                    <LinkInfoDialog
                        isOpen={!!linkInfoDialog}
                        onClose={() => setLinkInfoDialog(null)}
                        linkLabel={linkInfoDialog.link.label}
                        linkIcon={linkInfoDialog.link.icon}
                        richTextContent={linkInfoDialog.link.richTextContent || ''}
                        linkUrl={linkInfoDialog.link.url}
                        browser={linkInfoDialog.link.browser}
                    />
                )}
            </>
        );
    }

    // EDIT MODE - Only show if user has edit permission
    if (isEditing && tile.canEdit) {
        // Use mobile-optimized edit page on mobile devices
        if (isMobile) {
            return (
                <MobileTileEdit
                    tile={tile}
                    editTitle={editTitle}
                    editDesc={editDesc}
                    editHtml={editHtml}
                    editEmoji={editEmoji}
                    editColor={editColor}
                    editVisibility={editVisibility}
                    editAllowedUsers={editAllowedUsers}
                    editTabs={editTabs}
                    onTitleChange={setEditTitle}
                    onDescChange={setEditDesc}
                    onHtmlChange={setEditHtml}
                    onEmojiChange={setEditEmoji}
                    onColorChange={setEditColor}
                    onVisibilityChange={setEditVisibility}
                    onAllowedUsersChange={setEditAllowedUsers}
                    onTabsChange={setEditTabs}
                    onSave={handleSaveChanges}
                    onCancel={() => {
                        const confirmed = window.confirm('Are you sure you want to cancel? All unsaved changes will be lost.');
                        if (confirmed) {
                            setIsEditing(false);
                        }
                    }}
                    isAuthenticated={isAuthenticated}
                    usersList={usersList}
                    loadingUsers={loadingUsers}
                    showEmojiPicker={showEmojiPicker}
                    setShowEmojiPicker={setShowEmojiPicker}
                    showTileUserSelector={showTileUserSelector}
                    setShowTileUserSelector={setShowTileUserSelector}
                    settings={settings}
                    availableBrowsers={availableBrowsers}
                    user={user}
                />
            );
        }

        // Desktop edit mode
        return (
            <>
                <div className="animate-in fade-in zoom-in duration-300 w-full">
                    {/* Enhanced Header */}
                    <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-700 -mx-6 px-6 py-5 mb-8 rounded-b-xl shadow-sm">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">Edit Page</h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span className="text-lg">{editEmoji || '✨'}</span>
                                    <span className="font-medium">{editTitle || 'Untitled Page'}</span>
                                </p>
                            </div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <button
                                    onClick={() => {
                                        const confirmed = window.confirm('Are you sure you want to cancel? All unsaved changes will be lost.');
                                        if (confirmed) {
                                            console.log('Cancel clicked - exiting edit mode');
                                            setIsEditing(false);
                                        } else {
                                            console.log('Cancel cancelled - staying in edit mode');
                                        }
                                    }}
                                    className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-all font-medium rounded-lg border border-slate-200 dark:border-slate-600 flex-1 sm:flex-none"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        console.log('=== SAVE BUTTON CLICKED ===');
                                        console.log('Current editTabs count:', editTabs.length);
                                        console.log('Button disabled?', editVisibility === 'private' && editAllowedUsers.length === 0 && editAllowedGroups.length === 0);
                                        console.log('editVisibility:', editVisibility);
                                        console.log('editAllowedUsers.length:', editAllowedUsers.length);
                                        console.log('editAllowedGroups.length:', editAllowedGroups.length);
                                        if (editVisibility === 'private' && editAllowedUsers.length === 0 && editAllowedGroups.length === 0) {
                                            alert('Please select at least one user or group for private visibility before saving.');
                                            return;
                                        }
                                        handleSaveChanges();
                                    }}
                                    disabled={editVisibility === 'private' && editAllowedUsers.length === 0 && editAllowedGroups.length === 0}
                                    className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center gap-2 flex-1 sm:flex-none"
                                    title={editVisibility === 'private' && editAllowedUsers.length === 0 && editAllowedGroups.length === 0 ? 'Please select users or groups for private visibility' : 'Save all changes'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Save Changes {editTabs.length !== (tile.tabs?.length || 0) ? '⚠️' : ''}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* LEFT COLUMN: General Settings & HTML Editor */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Basic Info Card */}
                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6 sticky top-6 shadow-lg shadow-slate-200/50 dark:shadow-black/20">
                                <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.128.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.128c-.355-.196-.75-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">General Settings</h3>
                                </div>

                                {/* Emoji & Title */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2.5">Emoji & Page Title</label>
                                        <div className="flex gap-3">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                    className="w-16 h-14 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-2xl flex items-center justify-center hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                                >
                                                    {editEmoji || '✨'}
                                                </button>
                                                {showEmojiPicker && (
                                                    <>
                                                        <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
                                                        <div className="absolute top-full left-0 mt-2 w-72 h-72 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden">
                                                            <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800">
                                                                <input
                                                                    type="text"
                                                                    value={editEmoji}
                                                                    onChange={(e) => setEditEmoji(e.target.value)}
                                                                    placeholder="Type emoji..."
                                                                    className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-8 gap-1.5">
                                                                {POPULAR_EMOJIS.map((emoji) => (
                                                                    <button
                                                                        key={emoji}
                                                                        onClick={() => { setEditEmoji(emoji); setShowEmojiPicker(false); }}
                                                                        className="w-9 h-9 flex items-center justify-center text-xl hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-lg transition-all hover:scale-110"
                                                                    >
                                                                        {emoji}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    className="w-full h-14 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-semibold text-base transition-all"
                                                    placeholder="Enter page title..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Theme Color */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Theme Color</label>
                                    <div className="flex gap-2.5 flex-wrap p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                        {THEME_COLORS.map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setEditColor(color)}
                                                className={`
                                                w-10 h-10 rounded-full border-3 transition-all relative overflow-hidden shadow-sm hover:shadow-md
                                                ${editColor === color ? 'border-brand-500 dark:border-brand-400 scale-110 ring-2 ring-brand-200 dark:ring-brand-900/50' : 'border-slate-300 dark:border-slate-600 hover:scale-105'} 
                                            `}
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
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2.5">Card Description</label>
                                    <textarea
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        rows={3}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-700 dark:text-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none transition-all"
                                        placeholder="Brief summary of this page..."
                                    />
                                </div>

                                {/* Intro Content */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2.5">Intro Content (HTML)</label>
                                    <textarea
                                        value={editHtml}
                                        onChange={(e) => setEditHtml(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none leading-relaxed h-40 transition-all"
                                        placeholder="<p>Welcome to my page!</p>"
                                    />
                                </div>

                                {/* Visibility Settings */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Visibility</label>
                                    <div className="space-y-2.5">
                                        {user?.is_admin && (
                                            <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${editVisibility === 'public'
                                                ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                                }`}>
                                                <input
                                                    type="radio"
                                                    name="tileVisibility"
                                                    value="public"
                                                    checked={editVisibility === 'public'}
                                                    onChange={(e) => {
                                                        setEditVisibility(e.target.value as TileVisibility);
                                                        setShowTileUserSelector(false);
                                                    }}
                                                    className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                                />
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Public</div>
                                                    <div className="text-xs text-slate-600 dark:text-slate-400">Available for everyone (guests and logged in users)</div>
                                                </div>
                                                {editVisibility === 'public' && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </label>
                                        )}
                                        {user?.is_admin && (
                                            <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${editVisibility === 'authenticated'
                                                ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                                }`}>
                                                <input
                                                    type="radio"
                                                    name="tileVisibility"
                                                    value="authenticated"
                                                    checked={editVisibility === 'authenticated'}
                                                    onChange={(e) => {
                                                        setEditVisibility(e.target.value as TileVisibility);
                                                        setShowTileUserSelector(false);
                                                    }}
                                                    className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                                />
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Authenticated</div>
                                                    <div className="text-xs text-slate-600 dark:text-slate-400">Available for logged in users only</div>
                                                </div>
                                                {editVisibility === 'authenticated' && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </label>
                                        )}
                                        <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${editVisibility === 'private'
                                            ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                            }`}>
                                            <input
                                                type="radio"
                                                name="tileVisibility"
                                                value="private"
                                                checked={editVisibility === 'private'}
                                                onChange={(e) => {
                                                    setEditVisibility(e.target.value as TileVisibility);
                                                    setShowTileUserSelector(true);
                                                }}
                                                className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Private</div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400">Available for specific users only</div>
                                            </div>
                                            {editVisibility === 'private' && (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </label>
                                    </div>

                                    {/* User and Group Selector for Private Visibility */}
                                    {editVisibility === 'private' && isAuthenticated && (
                                        <div className="mt-4 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                            {/* Tabs */}
                                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                                <button
                                                    type="button"
                                                    onClick={() => setVisibilityActiveTab('users')}
                                                    className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${visibilityActiveTab === 'users'
                                                        ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                        }`}
                                                >
                                                    Users ({editAllowedUsers.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setVisibilityActiveTab('groups')}
                                                    className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${visibilityActiveTab === 'groups'
                                                        ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                        }`}
                                                >
                                                    Groups ({editAllowedGroups.length})
                                                </button>
                                            </div>

                                            {/* Search Input */}
                                            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={visibilitySearchTerm}
                                                        onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                                        placeholder={`Search ${visibilityActiveTab}...`}
                                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                                    />
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                    {visibilitySearchTerm && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setVisibilitySearchTerm('')}
                                                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Selected Items Display */}
                                            {(editAllowedUsers.length > 0 || editAllowedGroups.length > 0) && (
                                                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                                                    <div className="flex flex-wrap gap-2">
                                                        {editAllowedUsers.map(userId => {
                                                            const user = usersList.find(u => u.id === userId);
                                                            const isOwner = tile.userId && userId === (typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId);
                                                            return (
                                                                <span
                                                                    key={`user-${userId}`}
                                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${isOwner
                                                                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700'
                                                                        : 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800'
                                                                        }`}
                                                                >
                                                                    {user?.username || `User ${userId}`}
                                                                    {isOwner && (
                                                                        <span className="text-[9px] font-bold uppercase">Owner</span>
                                                                    )}
                                                                    {!isOwner && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditAllowedUsers(editAllowedUsers.filter(id => id !== userId))}
                                                                            className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                            title="Remove user"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </span>
                                                            );
                                                        })}
                                                        {editAllowedGroups.map(groupId => {
                                                            const group = availableGroups.find(g => g.id === groupId);
                                                            return (
                                                                <span
                                                                    key={`group-${groupId}`}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM16 8a2 2 0 11-4 0 2 2 0 014 0zm-1.615 8.428a1.224 1.224 0 00.569-1.175 5.966 5.966 0 00-2.081-.416 5.967 5.967 0 00-1.788.27A9.953 9.953 0 0013 18a9.953 9.953 0 003.385-.572z" />
                                                                    </svg>
                                                                    {group?.name || `Group ${groupId}`}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setEditAllowedGroups(editAllowedGroups.filter(id => id !== groupId))}
                                                                        className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                        title="Remove group"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                        </svg>
                                                                    </button>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Content */}
                                            <div className="max-h-80 overflow-y-auto p-3 bg-white dark:bg-slate-800">
                                                {visibilityActiveTab === 'users' && (
                                                    loadingUsers ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8 flex items-center justify-center gap-2">
                                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Loading users...
                                                        </div>
                                                    ) : usersList.length === 0 ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {usersList
                                                                .filter(u => {
                                                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                                                    return u.username.toLowerCase().includes(searchLower) ||
                                                                        u.email?.toLowerCase().includes(searchLower);
                                                                })
                                                                .map(user => {
                                                                    const isOwner = tile.userId && user.id === (typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId);
                                                                    return (
                                                                        <label
                                                                            key={user.id}
                                                                            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isOwner
                                                                                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer'
                                                                                }`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={editAllowedUsers.includes(user.id) || isOwner}
                                                                                onChange={(e) => {
                                                                                    if (isOwner) return;
                                                                                    if (e.target.checked) {
                                                                                        setEditAllowedUsers([...editAllowedUsers, user.id]);
                                                                                    } else {
                                                                                        setEditAllowedUsers(editAllowedUsers.filter(id => id !== user.id));
                                                                                    }
                                                                                }}
                                                                                disabled={isOwner}
                                                                                className={`rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 w-4 h-4 ${isOwner ? 'opacity-50 cursor-not-allowed' : ''
                                                                                    }`}
                                                                            />
                                                                            <span className={`text-sm font-medium flex-1 ${isOwner
                                                                                ? 'text-amber-800 dark:text-amber-200'
                                                                                : 'text-slate-700 dark:text-slate-300'
                                                                                }`}>
                                                                                {user.username}
                                                                            </span>
                                                                            {isOwner && (
                                                                                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                                                    Owner
                                                                                </span>
                                                                            )}
                                                                            {user.auth_source && user.auth_source !== 'local' && (
                                                                                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-semibold">
                                                                                    {user.auth_source.toUpperCase()}
                                                                                </span>
                                                                            )}
                                                                        </label>
                                                                    );
                                                                })}
                                                            {usersList.filter(u => {
                                                                const searchLower = visibilitySearchTerm.toLowerCase();
                                                                return u.username.toLowerCase().includes(searchLower) ||
                                                                    u.email?.toLowerCase().includes(searchLower);
                                                            }).length === 0 && (
                                                                    <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                                                )}
                                                        </div>
                                                    )
                                                )}

                                                {visibilityActiveTab === 'groups' && (
                                                    isLoadingGroups ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8 flex items-center justify-center gap-2">
                                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Loading groups...
                                                        </div>
                                                    ) : availableGroups.length === 0 ? (
                                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {availableGroups
                                                                .filter(g => {
                                                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                                                    return g.name.toLowerCase().includes(searchLower) ||
                                                                        (g.description || '').toLowerCase().includes(searchLower);
                                                                })
                                                                .map(g => (
                                                                    <label
                                                                        key={g.id}
                                                                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={editAllowedGroups.includes(g.id)}
                                                                            onChange={(e) => {
                                                                                if (e.target.checked) {
                                                                                    setEditAllowedGroups([...editAllowedGroups, g.id]);
                                                                                } else {
                                                                                    setEditAllowedGroups(editAllowedGroups.filter(id => id !== g.id));
                                                                                }
                                                                            }}
                                                                            className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 w-4 h-4"
                                                                        />
                                                                        <div className="flex-1">
                                                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                                                            {g.description && (
                                                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{g.description}</div>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                                                        </span>
                                                                    </label>
                                                                ))}
                                                            {availableGroups.filter(g => {
                                                                const searchLower = visibilitySearchTerm.toLowerCase();
                                                                return g.name.toLowerCase().includes(searchLower) ||
                                                                    (g.description || '').toLowerCase().includes(searchLower);
                                                            }).length === 0 && (
                                                                    <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                                                )}
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            {editVisibility === 'private' && editAllowedUsers.length === 0 && editAllowedGroups.length === 0 && (
                                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20">
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                                        </svg>
                                                        Please select at least one user or group for private spaces
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Browser Selection - Only show if feature is enabled and user has canChangeBrowser or is admin */}
                                {settings.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Default Browser for All Links</label>
                                        <select
                                            value={editBrowser}
                                            onChange={(e) => setEditBrowser(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm transition-all"
                                        >
                                            <option value="default">Default Browser</option>
                                            {availableBrowsers.length > 0 ? (
                                                availableBrowsers.map((browserId) => {
                                                    // Format browser ID for display
                                                    const displayName = browserId
                                                        .replace(/-/g, ' ')
                                                        .replace(/\b\w/g, (l) => l.toUpperCase())
                                                        .replace('Wsl', '(WSL)')
                                                        .replace('Stable', 'Stable')
                                                        .replace('Beta', 'Beta')
                                                        .replace('Dev', 'Dev');
                                                    return (
                                                        <option key={browserId} value={browserId}>
                                                            {displayName}
                                                        </option>
                                                    );
                                                })
                                            ) : (
                                                <>
                                                    <option value="chrome-stable">Chrome Stable</option>
                                                    <option value="chrome-beta">Chrome Beta</option>
                                                    <option value="chrome-dev">Chrome Dev</option>
                                                    <option value="edge-stable">Edge Stable</option>
                                                    <option value="edge-beta">Edge Beta</option>
                                                    <option value="edge-dev">Edge Dev</option>
                                                    <option value="firefox-wsl">Firefox (WSL)</option>
                                                    <option value="chrome-stable-wsl">Chrome Stable (WSL)</option>
                                                    <option value="edge-stable-wsl">Edge Stable (WSL)</option>
                                                </>
                                            )}
                                        </select>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 mb-3">
                                            Select which browser should open links from this tile. This will apply to all links unless they have a specific browser override. Requires browser extension to be installed.
                                        </p>
                                        <button
                                            onClick={handleUpdateLinksBrowser}
                                            className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center justify-center gap-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Save Default Browser for All Links
                                        </button>
                                    </div>
                                )}

                                {/* Version History Section */}
                                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm mt-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                            </svg>
                                            Version History
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            {showVersions && tileVersions.length > 0 && (
                                                <>
                                                    <button
                                                        onClick={handleDeleteEmptyVersions}
                                                        disabled={loadingVersions}
                                                        className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete versions with no differences from previous version"
                                                    >
                                                        Delete Empty
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteDuplicateVersions}
                                                        disabled={loadingVersions}
                                                        className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete duplicate versions (identical to any previous version)"
                                                    >
                                                        Delete Duplicate
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteAllVersions}
                                                        disabled={loadingVersions}
                                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete all unlocked versions"
                                                    >
                                                        Delete All
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => setShowVersions(!showVersions)}
                                                className="text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 text-xs font-semibold"
                                            >
                                                {showVersions ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </div>

                                    {showVersions && (
                                        <div className="space-y-3">
                                            {/* Search and Filter Controls */}
                                            {tileVersions.length > 0 && (
                                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 space-y-2 border border-slate-200 dark:border-slate-700">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Search versions..."
                                                            value={versionSearchTerm}
                                                            onChange={(e) => setVersionSearchTerm(e.target.value)}
                                                            className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        />
                                                        {selectedVersionsForCompare.length === 2 && (
                                                            <button
                                                                onClick={() => handleCompareTwoVersions(selectedVersionsForCompare[0], selectedVersionsForCompare[1])}
                                                                disabled={isDiffLoading}
                                                                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                            >
                                                                Compare Selected
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <select
                                                            value={versionFilterUser}
                                                            onChange={(e) => setVersionFilterUser(e.target.value)}
                                                            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        >
                                                            <option value="">All Users</option>
                                                            {allUsers.map(user => (
                                                                <option key={user} value={user}>{user}</option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            type="date"
                                                            value={versionFilterDateFrom}
                                                            onChange={(e) => setVersionFilterDateFrom(e.target.value)}
                                                            placeholder="From Date"
                                                            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        />
                                                        <input
                                                            type="date"
                                                            value={versionFilterDateTo}
                                                            onChange={(e) => setVersionFilterDateTo(e.target.value)}
                                                            placeholder="To Date"
                                                            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        />
                                                    </div>
                                                    {allTags.length > 0 && (
                                                        <select
                                                            value={versionFilterTag}
                                                            onChange={(e) => setVersionFilterTag(e.target.value)}
                                                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                                        >
                                                            <option value="">All Tags</option>
                                                            {allTags.map(tag => (
                                                                <option key={tag} value={tag}>{tag}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )}

                                            {loadingVersions ? (
                                                <div className="text-center py-4 text-slate-500 text-sm">Loading versions...</div>
                                            ) : tileVersions.length === 0 ? (
                                                <div className="text-center py-4 text-slate-500 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                                    No previous versions saved.
                                                </div>
                                            ) : filteredVersions.length === 0 ? (
                                                <div className="text-center py-4 text-slate-500 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                                    No versions match your filters.
                                                </div>
                                            ) : (
                                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                                    {filteredVersions.map((version) => (
                                                        <div key={version.id} className={`bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border ${version.is_locked ? 'border-amber-400 dark:border-amber-600' : selectedVersionsForCompare.includes(version.id) ? 'border-brand-500 dark:border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200 dark:border-slate-700'} relative group`}>
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={selectedVersionsForCompare.includes(version.id)}
                                                                                onChange={() => handleToggleVersionSelect(version.id)}
                                                                                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                                                                                title="Select for comparison"
                                                                            />
                                                                            <span className="font-bold text-sm text-slate-700 dark:text-slate-200">v{version.version_number}</span>
                                                                        </label>
                                                                        {version.is_locked && (
                                                                            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                                                </svg>
                                                                                Locked
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                                        {new Date(version.created_at * 1000).toLocaleString()}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500">
                                                                        by <span className="font-medium text-slate-700 dark:text-slate-300">{version.username}</span>
                                                                    </div>
                                                                    {version.changelog_summary && (
                                                                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                                                                            {version.changelog_summary}
                                                                        </div>
                                                                    )}
                                                                    {/* Tags */}
                                                                    {version.tags && version.tags.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                                            {version.tags.map((tag, idx) => (
                                                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-[10px] font-medium">
                                                                                    {tag}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {/* Comments */}
                                                                    {version.comments && (
                                                                        <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-600 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-slate-600">
                                                                            {version.comments}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <button
                                                                        onClick={() => handleToggleVersionLock(version.id, version.is_locked)}
                                                                        disabled={versionActionLoading === version.id}
                                                                        className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${version.is_locked ? 'text-amber-500' : 'text-slate-400'}`}
                                                                        title={version.is_locked ? "Unlock Version" : "Lock Version (Prevent Deletion)"}
                                                                    >
                                                                        {version.is_locked ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                                            </svg>
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleStartEditVersion(version)}
                                                                        disabled={versionActionLoading === version.id}
                                                                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-400"
                                                                        title="Edit Tags/Comments"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Edit Tags/Comments UI */}
                                                            {editingVersionId === version.id && (
                                                                <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-600 space-y-3">
                                                                    <div>
                                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tags</label>
                                                                        <div className="flex flex-wrap gap-1 mb-2">
                                                                            {editingVersionTags.map((tag, idx) => (
                                                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                                                                                    {tag}
                                                                                    <button
                                                                                        onClick={() => handleRemoveTag(tag)}
                                                                                        className="hover:text-red-600"
                                                                                    >
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                        </svg>
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                        <div className="flex gap-2">
                                                                            <input
                                                                                type="text"
                                                                                value={newTagInput}
                                                                                onChange={(e) => setNewTagInput(e.target.value)}
                                                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                                                                placeholder="Add tag..."
                                                                                className="flex-1 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                                                            />
                                                                            <button
                                                                                onClick={handleAddTag}
                                                                                className="px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white text-xs rounded"
                                                                            >
                                                                                Add
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Comments</label>
                                                                        <textarea
                                                                            value={editingVersionComments}
                                                                            onChange={(e) => setEditingVersionComments(e.target.value)}
                                                                            placeholder="Add notes about this version..."
                                                                            rows={3}
                                                                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                                                        />
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handleUpdateVersionTags(version.id)}
                                                                            disabled={versionActionLoading === version.id}
                                                                            className="flex-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded"
                                                                        >
                                                                            Save Tags
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateVersionComments(version.id)}
                                                                            disabled={versionActionLoading === version.id}
                                                                            className="flex-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded"
                                                                        >
                                                                            Save Comments
                                                                        </button>
                                                                        <button
                                                                            onClick={handleCancelEditVersion}
                                                                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                                                <button
                                                                    onClick={() => handleCompareWithCurrent(version)}
                                                                    disabled={versionActionLoading === version.id || isDiffLoading}
                                                                    className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1"
                                                                    title="Compare with Current State"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                                                    </svg>
                                                                    Diff
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRestoreWithPreview(version.id)}
                                                                    disabled={versionActionLoading === version.id || isDiffLoading}
                                                                    className="flex-1 py-1.5 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1"
                                                                    title="Preview restore before confirming"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                    Preview
                                                                </button>
                                                                {!version.is_locked && (
                                                                    <button
                                                                        onClick={() => handleDeleteVersion(version.id)}
                                                                        disabled={versionActionLoading === version.id}
                                                                        className="px-2 py-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                        title="Delete Version"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-slate-400 text-center pt-2">
                                                Automatically keeps last 10 versions. Lock versions to prevent auto-deletion.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tab and Section Manager */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Manage Tabs & Sections</h3>
                                </div>
                                <button
                                    onClick={handleAddTab}
                                    className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Add Tab
                                </button>
                            </div>

                            {/* Link Search Box */}
                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                                <div className="relative">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={linkSearchTerm}
                                        onChange={(e) => setLinkSearchTerm(e.target.value)}
                                        placeholder="Search links by name or URL..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                    />
                                    {linkSearchTerm && (
                                        <button
                                            onClick={() => setLinkSearchTerm('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                            title="Clear search"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                {linkSearchTerm && (
                                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        {(() => {
                                            const allLinks = editTabs.flatMap(tab => tab.sections.flatMap(section => section.links));
                                            const matchedLinks = allLinks.filter(link =>
                                                link.label.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                                                link.url.toLowerCase().includes(linkSearchTerm.toLowerCase())
                                            );
                                            return (
                                                <>
                                                    {matchedLinks.length} link{matchedLinks.length !== 1 ? 's' : ''} found
                                                    {selectedLinkIds.length > 0 && (
                                                        <button
                                                            onClick={() => setSelectedLinkIds([])}
                                                            className="text-xs text-red-500 hover:text-red-600 font-semibold underline underline-offset-2 transition-colors ml-4"
                                                        >
                                                            Clear selection ({selectedLinkIds.length})
                                                        </button>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                                {!linkSearchTerm && selectedLinkIds.length > 0 && (
                                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        {selectedLinkIds.length} link{selectedLinkIds.length !== 1 ? 's' : ''} selected
                                        <button
                                            onClick={() => setSelectedLinkIds([])}
                                            className="text-xs text-red-500 hover:text-red-600 font-semibold underline underline-offset-2 transition-colors ml-4"
                                        >
                                            Clear selection
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Tab Navigation Bar - Sticky */}
                            {editTabs.length > 1 && (
                                <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                                    <div className="flex items-center gap-2 overflow-x-auto">
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Quick Nav:</span>
                                        <div className="flex gap-2">
                                            {editTabs.map((tab, index) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => {
                                                        const element = document.getElementById(`tab-${tab.id}`);
                                                        if (element) {
                                                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-brand-100 dark:hover:bg-brand-900/30 text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors whitespace-nowrap flex items-center gap-1.5"
                                                >
                                                    <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold flex items-center justify-center">
                                                        {index + 1}
                                                    </span>
                                                    {tab.title || 'Untitled'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-6">
                                {/* Render tabs if available, otherwise fall back to sections (backward compatibility) */}
                                {editTabs.length > 0 ? (
                                    editTabs.map((tab, tabIndex) => {
                                        // Generate a color for visual identification based on tab index
                                        const tabColorIndex = tabIndex % 6;
                                        const tabBorderColors = [
                                            'border-l-4 border-l-blue-600',
                                            'border-l-4 border-l-green-600',
                                            'border-l-4 border-l-purple-600',
                                            'border-l-4 border-l-orange-600',
                                            'border-l-4 border-l-pink-600',
                                            'border-l-4 border-l-teal-600'
                                        ];
                                        const tabBgColors = [
                                            'bg-gradient-to-r from-blue-50 via-white to-slate-50 dark:from-blue-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-green-50 via-white to-slate-50 dark:from-green-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-purple-50 via-white to-slate-50 dark:from-purple-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-orange-50 via-white to-slate-50 dark:from-orange-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-pink-50 via-white to-slate-50 dark:from-pink-900/20 dark:via-slate-800/50 dark:to-slate-900/50',
                                            'bg-gradient-to-r from-teal-50 via-white to-slate-50 dark:from-teal-900/20 dark:via-slate-800/50 dark:to-slate-900/50'
                                        ];
                                        const tabColorClass = tabBorderColors[tabColorIndex];
                                        const tabBgClass = tabBgColors[tabColorIndex];

                                        return (
                                            <div id={`tab-${tab.id}`} key={tab.id} className={`bg-white dark:bg-slate-800 border-2 border-t-2 border-r-2 border-b-2 border-slate-200 dark:border-slate-700 ${tabColorClass} rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-black/20 scroll-mt-24 hover:shadow-xl transition-shadow`}>
                                                {/* Tab Header */}
                                                <div className={`p-5 border-b-2 border-slate-200 dark:border-slate-700 ${tabBgClass} flex gap-3 items-center`}>
                                                    {/* Tab Reorder Buttons */}
                                                    <div className="flex flex-col gap-0.5">
                                                        <button
                                                            onClick={() => handleMoveTab(tab.id, 'up')}
                                                            disabled={tabIndex === 0}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                            title="Move Tab Up"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleMoveTab(tab.id, 'down')}
                                                            disabled={tabIndex === editTabs.length - 1}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                            title="Move Tab Down"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <div className="text-slate-400 dark:text-slate-500 font-mono text-sm">Tab #{tabIndex + 1}</div>
                                                    <input
                                                        type="text"
                                                        value={tab.title}
                                                        onChange={(e) => handleUpdateTabTitle(tab.id, e.target.value)}
                                                        placeholder="Tab Title (e.g. Resources)"
                                                        className="flex-1 bg-transparent border-none font-bold text-lg focus:ring-0 placeholder-slate-400"
                                                        style={tab.textColor ? { color: tab.textColor } : { color: 'inherit' }}
                                                    />
                                                    {/* Color Picker for Tab Title */}
                                                    <div className="flex items-center gap-1">
                                                        <label
                                                            className="cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                                                            title="Choose text color for this tab"
                                                        >
                                                            <input
                                                                type="color"
                                                                value={tab.textColor && tab.textColor.trim() ? tab.textColor : '#000000'}
                                                                onChange={(e) => handleUpdateTabColor(tab.id, e.target.value)}
                                                                className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                                                            />
                                                            <span className="text-xs text-slate-500 dark:text-slate-400">Color</span>
                                                        </label>
                                                        {tab.textColor && (
                                                            <button
                                                                onClick={() => handleUpdateTabColor(tab.id, '')}
                                                                className="text-slate-400 hover:text-red-500 p-1"
                                                                title="Remove color"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleCloneTab(tab.id)}
                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2"
                                                        title="Clone Tab"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => setSchedulingDialogTab(tab.id)}
                                                        className="text-slate-400 hover:text-green-600 dark:hover:text-green-400 p-2"
                                                        title="Schedule Tab"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                    {(tab.visibleFrom || tab.expiresAt) && (
                                                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                            📅 Scheduled
                                                        </span>
                                                    )}
                                                    {tab.visibility && tab.visibility !== 'public' && (
                                                        <span className={`text-xs px-2 py-1 rounded ${tab.visibility === 'authenticated'
                                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                                            }`}>
                                                            {tab.visibility === 'authenticated' ? '🔒 Auth' : '🔐 Private'}
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => setVisibilityDialogTab(tab.id)}
                                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-2"
                                                        title="Set Tab Visibility"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                                        </svg>
                                                    </button>
                                                    {(tile.canDeleteTabs !== false && (tile.canDeleteTabs !== undefined || tile.canEdit)) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (tile.canDeleteTabs !== false && (tile.canDeleteTabs !== undefined || tile.canEdit)) {
                                                                    console.log('Delete button clicked for tab:', { id: tab.id, title: tab.title });
                                                                    handleRemoveTab(tab.id);
                                                                }
                                                            }}
                                                            disabled={editTabs.length <= 1}
                                                            className="text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed p-2"
                                                            title={editTabs.length <= 1 ? "Cannot delete the last tab" : "Delete Tab"}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Tab Sections */}
                                                <div className="p-4 space-y-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Sections in this tab</h4>
                                                        <button
                                                            onClick={() => handleAddSection(tab.id)}
                                                            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center gap-2"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                            </svg>
                                                            Add Section
                                                        </button>
                                                    </div>

                                                    {[...tab.sections].sort((a, b) => {
                                                        const posA = a.position ?? 0;
                                                        const posB = b.position ?? 0;
                                                        return posA - posB;
                                                    }).map((section, sectionIndex) => {
                                                        // Generate a color for visual identification based on section index
                                                        const colorIndex = sectionIndex % 6;
                                                        const borderColors = [
                                                            'border-r-4 border-r-blue-500',
                                                            'border-r-4 border-r-green-500',
                                                            'border-r-4 border-r-purple-500',
                                                            'border-r-4 border-r-orange-500',
                                                            'border-r-4 border-r-pink-500',
                                                            'border-r-4 border-r-teal-500'
                                                        ];
                                                        const bgColors = [
                                                            'bg-blue-50 dark:bg-blue-900/10',
                                                            'bg-green-50 dark:bg-green-900/10',
                                                            'bg-purple-50 dark:bg-purple-900/10',
                                                            'bg-orange-50 dark:bg-orange-900/10',
                                                            'bg-pink-50 dark:bg-pink-900/10',
                                                            'bg-teal-50 dark:bg-teal-900/10'
                                                        ];
                                                        const sectionColorClass = borderColors[colorIndex];
                                                        const sectionBgClass = bgColors[colorIndex];

                                                        return (
                                                            <div key={section.id} className={`bg-slate-50 dark:bg-slate-900/50 border-2 border-l-2 border-t-2 border-b-2 border-slate-200 dark:border-slate-700 ${sectionColorClass} rounded-xl overflow-hidden shadow-sm`}>
                                                                {/* Section Header */}
                                                                <div className={`p-4 border-b-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${sectionBgClass} flex gap-3 items-center`}>
                                                                    {/* Reorder Buttons */}
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <button
                                                                            onClick={() => handleMoveSection(tab.id, section.id, 'up')}
                                                                            disabled={sectionIndex === 0}
                                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                                            title="Move Up"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleMoveSection(tab.id, section.id, 'down')}
                                                                            disabled={sectionIndex === tab.sections.length - 1}
                                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                                                                            title="Move Down"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                    <div className="text-slate-400 dark:text-slate-500 font-mono text-xs">#{sectionIndex + 1}</div>
                                                                    {/* Select All Checkbox */}
                                                                    <div className="flex items-center px-1" title="Select all links in this section">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={(section.links || []).length > 0 && (section.links || []).every(l => selectedLinkIds.includes(l.id))}
                                                                            onChange={() => toggleAllLinksInSectionSelection(section)}
                                                                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                                                        />
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={section.title}
                                                                        onChange={(e) => handleUpdateSectionTitle(tab.id, section.id, e.target.value)}
                                                                        placeholder="Section Header (e.g. Resources)"
                                                                        className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-semibold focus:ring-0 placeholder-slate-400"
                                                                    />
                                                                    {/* Bulk Action Buttons */}
                                                                    {selectedLinkIds.length > 0 && (
                                                                        <div className="flex gap-1.5 animate-in fade-in slide-in-from-right-2">
                                                                            <button
                                                                                onClick={() => handleBulkMove(tab.id, section.id)}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-[10px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 whitespace-nowrap"
                                                                                title="Move selected links to this section"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                                                                </svg>
                                                                                MOVE ({selectedLinkIds.length})
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleBulkCopy(tab.id, section.id)}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 whitespace-nowrap"
                                                                                title="Copy selected links to this section"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v2.25a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 19.5V6.25a2.25 2.25 0 0 1 2.25-2.25h9a2.25 2.25 0 0 1 2.25 2.25v2.25m-6.75 2.25h13.5m-3 0-3 3m3-3-3-3" />
                                                                                </svg>
                                                                                COPY
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    {/* Color Picker for Section Title */}
                                                                    <div className="flex items-center gap-1">
                                                                        <label
                                                                            className="cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                                                                            title="Choose text color for this section"
                                                                        >
                                                                            <input
                                                                                type="color"
                                                                                value={section.textColor || '#000000'}
                                                                                onChange={(e) => {
                                                                                    const newTabs = editTabs.map(t => {
                                                                                        if (t.id === tab.id) {
                                                                                            return {
                                                                                                ...t,
                                                                                                sections: t.sections.map(s =>
                                                                                                    s.id === section.id
                                                                                                        ? { ...s, textColor: e.target.value }
                                                                                                        : s
                                                                                                )
                                                                                            };
                                                                                        }
                                                                                        return t;
                                                                                    });
                                                                                    setEditTabs(newTabs);
                                                                                }}
                                                                                className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                                                                            />
                                                                            <span className="text-xs text-slate-500 dark:text-slate-400">Color</span>
                                                                        </label>
                                                                        {section.textColor && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    const newTabs = editTabs.map(t => {
                                                                                        if (t.id === tab.id) {
                                                                                            return {
                                                                                                ...t,
                                                                                                sections: t.sections.map(s =>
                                                                                                    s.id === section.id
                                                                                                        ? { ...s, textColor: undefined }
                                                                                                        : s
                                                                                                )
                                                                                            };
                                                                                        }
                                                                                        return t;
                                                                                    });
                                                                                    setEditTabs(newTabs);
                                                                                }}
                                                                                className="text-slate-400 hover:text-red-500 p-1"
                                                                                title="Reset to default color"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                </svg>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {/* Force Stacked View Checkbox */}
                                                                    <div className="flex items-center gap-1">
                                                                        <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Force stacked view for this section">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={section.forceStackedView || false}
                                                                                onChange={(e) => {
                                                                                    const newTabs = editTabs.map(t => {
                                                                                        if (t.id === tab.id) {
                                                                                            return {
                                                                                                ...t,
                                                                                                sections: t.sections.map(s =>
                                                                                                    s.id === section.id
                                                                                                        ? { ...s, forceStackedView: e.target.checked }
                                                                                                        : s
                                                                                                )
                                                                                            };
                                                                                        }
                                                                                        return t;
                                                                                    });
                                                                                    setEditTabs(newTabs);
                                                                                }}
                                                                                className="w-4 h-4 text-brand-600 bg-slate-100 border-slate-300 rounded focus:ring-brand-500 dark:focus:ring-brand-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                                                                            />
                                                                            <span className="text-xs text-slate-600 dark:text-slate-400">Force Stacked</span>
                                                                        </label>
                                                                    </div>
                                                                    {/* CSV Import */}
                                                                    <div className="flex items-center gap-1">
                                                                        <label className="cursor-pointer">
                                                                            <input
                                                                                type="file"
                                                                                accept=".csv,text/csv"
                                                                                className="hidden"
                                                                                onChange={(e) => {
                                                                                    const file = e.target.files?.[0] || null;
                                                                                    setCsvImportFile(prev => ({ ...prev, [section.id]: file }));
                                                                                }}
                                                                            />
                                                                            <span className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2" title="Import Links from CSV (requires 'Link Name' and 'Link' columns)">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                                                </svg>
                                                                            </span>
                                                                        </label>
                                                                        {csvImportFile[section.id] && (
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-xs text-slate-500 dark:text-slate-400 max-w-[100px] truncate" title={csvImportFile[section.id]?.name}>
                                                                                    {csvImportFile[section.id]?.name}
                                                                                </span>
                                                                                <button
                                                                                    onClick={() => handleImportLinksFromCSV(tab.id, section.id)}
                                                                                    disabled={importingCsv[section.id]}
                                                                                    className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                                                                                    title="Import CSV"
                                                                                >
                                                                                    {importingCsv[section.id] ? (
                                                                                        <>
                                                                                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                                            </svg>
                                                                                            Importing...
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                                                            </svg>
                                                                                            Import
                                                                                        </>
                                                                                    )}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setCsvImportFile(prev => ({ ...prev, [section.id]: null }))}
                                                                                    className="text-slate-400 hover:text-red-500 p-1"
                                                                                    title="Clear file"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleCloneSection(tab.id, section.id)}
                                                                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-2"
                                                                        title="Clone Section"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setSchedulingDialogSection({ tabId: tab.id, sectionId: section.id })}
                                                                        className="text-slate-400 hover:text-green-600 dark:hover:text-green-400 p-2"
                                                                        title="Schedule Section"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>
                                                                    {(section.visibleFrom || section.expiresAt) && (
                                                                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                                            📅 Scheduled
                                                                        </span>
                                                                    )}
                                                                    {section.visibility && section.visibility !== 'public' && (
                                                                        <span className={`text-xs px-2 py-1 rounded ${section.visibility === 'authenticated'
                                                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                                                            }`}>
                                                                            {section.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        onClick={() => setVisibilityDialogSection({ tabId: tab.id, sectionId: section.id })}
                                                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-2"
                                                                        title="Set Section Visibility"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                                                        </svg>
                                                                    </button>
                                                                    {(tile.canDeleteSections !== false && (tile.canDeleteSections !== undefined || tile.canEdit)) && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (tile.canDeleteSections !== false && (tile.canDeleteSections !== undefined || tile.canEdit)) {
                                                                                    console.log('Delete section button clicked:', { tabId: tab.id, sectionId: section.id });
                                                                                    handleRemoveSection(tab.id, section.id);
                                                                                }
                                                                            }}
                                                                            className="text-slate-400 hover:text-red-500 p-2"
                                                                            title="Delete Section"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Section Links */}
                                                                <div className="p-4 bg-white dark:bg-slate-800">
                                                                    <div className="space-y-2 mb-4">
                                                                        {/* Merged Content Rendering */}
                                                                        {(() => {
                                                                            const sortedItems = [
                                                                                ...(section.links || []).map(l => ({ ...l, itemType: 'link' as const })),
                                                                                ...(section.richTextContent || []).map(rt => ({ ...rt, itemType: 'rich-text' as const }))
                                                                            ].sort((a, b) => {
                                                                                const posA = a.position ?? 0;
                                                                                const posB = b.position ?? 0;
                                                                                return posA - posB;
                                                                            });

                                                                            if (sortedItems.length === 0) {
                                                                                return <p className="text-slate-400 dark:text-slate-600 text-sm italic py-2">No content in this section yet.</p>;
                                                                            }

                                                                            return sortedItems.map((item, index) => {
                                                                                const isFirst = index === 0;
                                                                                const isLast = index === sortedItems.length - 1;

                                                                                if (item.itemType === 'rich-text') {
                                                                                    const richText = item;
                                                                                    const isEditing = editingRichTextId[section.id] === richText.id;
                                                                                    const matchesSearch = linkSearchTerm
                                                                                        ? richText.content.toLowerCase().includes(linkSearchTerm.toLowerCase())
                                                                                        : true;

                                                                                    return (
                                                                                        <div
                                                                                            key={richText.id}
                                                                                            id={`link-${richText.id}`} // Using link- prefix for scroll compatibility
                                                                                            className={`transition-opacity duration-200 ${matchesSearch ? 'opacity-100' : 'opacity-40'}`}
                                                                                        >
                                                                                            <RichTextContentItem
                                                                                                content={richText}
                                                                                                sectionId={section.id}
                                                                                                tabId={tab.id}
                                                                                                onUpdate={(id, content) => handleUpdateRichText(tab.id, section.id, id, content)}
                                                                                                onDelete={(id) => handleDeleteRichText(tab.id, section.id, id)}
                                                                                                onMoveUp={() => handleMoveItem(tab.id, section.id, richText.id, 'up')}
                                                                                                onMoveDown={() => handleMoveItem(tab.id, section.id, richText.id, 'down')}
                                                                                                canMoveUp={!isFirst}
                                                                                                canMoveDown={!isLast}
                                                                                                isEditing={isEditing}
                                                                                                onEdit={() => setEditingRichTextId(prev => ({ ...prev, [section.id]: richText.id }))}
                                                                                                onCancel={() => setEditingRichTextId(prev => ({ ...prev, [section.id]: null }))}
                                                                                                onSave={() => setEditingRichTextId(prev => ({ ...prev, [section.id]: null }))}
                                                                                                onClone={() => handleCloneRichText(tab.id, section.id, richText.id)}
                                                                                                onSchedule={() => setSchedulingDialogRichText({ tabId: tab.id, sectionId: section.id, richTextId: richText.id })}
                                                                                                onVisibilityChange={(visibility) => handleUpdateRichTextVisibility(tab.id, section.id, richText.id, visibility)}
                                                                                                visibility={richText.visibility || 'public'}
                                                                                                visibleFrom={richText.visibleFrom}
                                                                                                expiresAt={richText.expiresAt}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                const link = item as Link;
                                                                                const matchesSearch = linkSearchTerm
                                                                                    ? link.label.toLowerCase().includes(linkSearchTerm.toLowerCase())
                                                                                    : true;
                                                                                const isHovered = hoveredLinkId === link.id;

                                                                                return editingLinkId === link.id ? (
                                                                                    // Edit Mode
                                                                                    <div key={link.id} className="bg-white dark:bg-slate-800 border-2 border-brand-500 dark:border-brand-500/50 rounded-xl p-4 shadow-lg space-y-3">
                                                                                        {/* Link Label & URL */}
                                                                                        <div className="space-y-3">
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Link Label (Rich Text)</label>
                                                                                                <RichTextEditor
                                                                                                    value={editLinkState[link.id]?.label || ''}
                                                                                                    onChange={(value) => updateEditLinkState(link.id, 'label', value)}
                                                                                                    placeholder="Enter link name with formatting..."
                                                                                                />
                                                                                            </div>
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">URL</label>
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={editLinkState[link.id]?.url || ''}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'url', e.target.value)}
                                                                                                    placeholder="https://example.com"
                                                                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                                />
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Emoji Selection */}
                                                                                        <div className="relative">
                                                                                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Emoji</label>
                                                                                            <div className="flex gap-2 items-center">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [link.id]: !prev[link.id] }))}
                                                                                                    className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                                                                                    title="Select emoji"
                                                                                                >
                                                                                                    <span className="text-xl">
                                                                                                        {editLinkState[link.id]?.icon || '😀'}
                                                                                                    </span>
                                                                                                </button>
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={editLinkState[link.id]?.icon || ''}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'icon', e.target.value)}
                                                                                                    placeholder="Or type emoji..."
                                                                                                    className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                                />
                                                                                            </div>
                                                                                            {showLinkEmojiPicker[link.id] && (
                                                                                                <>
                                                                                                    <div className="fixed inset-0 z-[9998]" onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [link.id]: false }))}></div>
                                                                                                    <div className="fixed z-[9999] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-96 max-h-[500px] flex flex-col overflow-hidden" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                                                                                        <EmojiPickerTabs linkId={link.id} editLinkState={editLinkState[link.id]} updateEditLinkState={updateEditLinkState} setShowLinkEmojiPicker={setShowLinkEmojiPicker} />
                                                                                                    </div>
                                                                                                </>
                                                                                            )}
                                                                                        </div>

                                                                                        {/* Text Color & Visibility - Side by Side */}
                                                                                        <div className="grid grid-cols-2 gap-3">
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Text Color</label>
                                                                                                <div className="flex gap-2 items-center">
                                                                                                    <input
                                                                                                        type="color"
                                                                                                        value={editLinkState[link.id]?.textColor && editLinkState[link.id]!.textColor.trim() ? editLinkState[link.id]!.textColor : '#000000'}
                                                                                                        onChange={(e) => updateEditLinkState(link.id, 'textColor', e.target.value)}
                                                                                                        className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 transition-all"
                                                                                                        title="Select text color"
                                                                                                    />
                                                                                                    <div className="flex-1 flex gap-1.5">
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={editLinkState[link.id]?.textColor || ''}
                                                                                                            onChange={(e) => updateEditLinkState(link.id, 'textColor', e.target.value)}
                                                                                                            placeholder="#000000"
                                                                                                            className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                                        />
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => updateEditLinkState(link.id, 'textColor', '')}
                                                                                                            className="px-2.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium"
                                                                                                            title="Clear color"
                                                                                                        >
                                                                                                            Clear
                                                                                                        </button>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Visibility</label>
                                                                                                <select
                                                                                                    value={editLinkState[link.id]?.visibility || 'public'}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'visibility', e.target.value as LinkVisibility)}
                                                                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium"
                                                                                                >
                                                                                                    {user?.is_admin && <option value="public">Public (visible to everyone)</option>}
                                                                                                    {user?.is_admin && <option value="authenticated">Authenticated (logged-in users only)</option>}
                                                                                                    <option value="private">Private (specific users only)</option>
                                                                                                </select>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Notes & Tooltip - Side by Side */}
                                                                                        <div className="grid grid-cols-2 gap-3">
                                                                                            <div>
                                                                                                <div className="flex items-center justify-between mb-1.5">
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Notes</label>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => {
                                                                                                            setNotesPresetFormState({ linkId: link.id });
                                                                                                        }}
                                                                                                        className="text-[10px] px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 hover:bg-brand-200 dark:hover:bg-brand-900/50 rounded transition-colors flex items-center gap-1"
                                                                                                        title="Use preset form"
                                                                                                    >
                                                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                                                        </svg>
                                                                                                        Preset Form
                                                                                                    </button>
                                                                                                </div>
                                                                                                <textarea
                                                                                                    value={editLinkState[link.id]?.notes || ''}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'notes', e.target.value)}
                                                                                                    placeholder="Add notes... or use Preset Form button above"
                                                                                                    rows={2}
                                                                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all resize-none"
                                                                                                />
                                                                                            </div>
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Hover Tooltip</label>
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={editLinkState[link.id]?.tooltip || ''}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'tooltip', e.target.value)}
                                                                                                    placeholder="Text shown on hover..."
                                                                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                                />
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Rich Text Content */}
                                                                                        <div>
                                                                                            <div className="flex items-center justify-between mb-1.5">
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                                                                    Information Content (Rich Text)
                                                                                                </label>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        const demoContent = '<h2>Welcome to Information Content</h2><p>This is a <strong>sample rich text content</strong> that demonstrates various formatting options available in the editor.</p><h3>Key Features</h3><ul><li>Rich text formatting with <em>bold</em> and <u>underline</u></li><li>Lists and structured content</li><li>Links and embedded content</li><li>Custom styling options</li></ul><h3>Contact Information</h3><p>For more information, please contact:</p><p><strong>Support Team:</strong> support@company.com<br/><strong>Phone:</strong> +1-555-0100</p><blockquote><p>This is an important note or quote that stands out from the regular content.</p></blockquote><p>You can edit this content using the rich text editor toolbar above.</p>';
                                                                                                        const currentState = editLinkState[link.id] || {
                                                                                                            label: link.label,
                                                                                                            url: link.url,
                                                                                                            icon: link.icon || '',
                                                                                                            textColor: link.textColor || '',
                                                                                                            visibility: link.visibility || 'public',
                                                                                                            allowedUsers: link.allowedUsers || [],
                                                                                                            allowedGroups: link.allowedGroups || [],
                                                                                                            notes: link.notes || '',
                                                                                                            tooltip: link.tooltip || '',
                                                                                                            browser: link.browser || 'default',
                                                                                                            richTextContent: ''
                                                                                                        };
                                                                                                        setEditLinkState({
                                                                                                            ...editLinkState,
                                                                                                            [link.id]: {
                                                                                                                ...currentState,
                                                                                                                richTextContent: demoContent
                                                                                                            }
                                                                                                        });
                                                                                                    }}
                                                                                                    className="px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                                                                                                >
                                                                                                    Demo Fill
                                                                                                </button>
                                                                                            </div>
                                                                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                                                If provided, clicking this link will open a rich text dialog instead of navigating to the URL. Leave empty to open the URL normally.
                                                                                            </p>
                                                                                            <RichTextEditor
                                                                                                value={editLinkState[link.id]?.richTextContent || ''}
                                                                                                onChange={(html) => {
                                                                                                    const currentState = editLinkState[link.id] || {
                                                                                                        label: link.label,
                                                                                                        url: link.url,
                                                                                                        icon: link.icon || '',
                                                                                                        textColor: link.textColor || '',
                                                                                                        visibility: link.visibility || 'public',
                                                                                                        allowedUsers: link.allowedUsers || [],
                                                                                                        notes: link.notes || '',
                                                                                                        tooltip: link.tooltip || '',
                                                                                                        browser: link.browser || 'default',
                                                                                                        richTextContent: ''
                                                                                                    };
                                                                                                    setEditLinkState({
                                                                                                        ...editLinkState,
                                                                                                        [link.id]: {
                                                                                                            ...currentState,
                                                                                                            richTextContent: html
                                                                                                        }
                                                                                                    });
                                                                                                }}
                                                                                                placeholder="Enter rich text content that will be displayed in a dialog when the link is clicked..."
                                                                                                className="min-h-[200px]"
                                                                                            />
                                                                                        </div>

                                                                                        {/* Browser Selection - Only show if feature is enabled and user has canChangeBrowser */}
                                                                                        {settings.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                                                                            <div>
                                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Open link in</label>
                                                                                                <select
                                                                                                    value={editLinkState[link.id]?.browser || 'default'}
                                                                                                    onChange={(e) => updateEditLinkState(link.id, 'browser', e.target.value)}
                                                                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                                >
                                                                                                    <option value="default">Default Browser</option>
                                                                                                    {availableBrowsers.length > 0 ? (
                                                                                                        availableBrowsers.map((browserId) => {
                                                                                                            // Format browser ID for display
                                                                                                            const displayName = browserId
                                                                                                                .replace(/-/g, ' ')
                                                                                                                .replace(/\b\w/g, (l) => l.toUpperCase())
                                                                                                                .replace('Wsl', '(WSL)')
                                                                                                                .replace('Stable', 'Stable')
                                                                                                                .replace('Beta', 'Beta')
                                                                                                                .replace('Dev', 'Dev');
                                                                                                            return (
                                                                                                                <option key={browserId} value={browserId}>
                                                                                                                    {displayName}
                                                                                                                </option>
                                                                                                            );
                                                                                                        })
                                                                                                    ) : (
                                                                                                        <>
                                                                                                            <option value="chrome-stable">Chrome Stable</option>
                                                                                                            <option value="chrome-beta">Chrome Beta</option>
                                                                                                            <option value="chrome-dev">Chrome Dev</option>
                                                                                                            <option value="edge-stable">Edge Stable</option>
                                                                                                            <option value="edge-beta">Edge Beta</option>
                                                                                                            <option value="edge-dev">Edge Dev</option>
                                                                                                            <option value="firefox">Firefox (WSL)</option>
                                                                                                        </>
                                                                                                    )}
                                                                                                </select>
                                                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                                                                                    Select which browser should open this link. Requires browser extension to be installed.
                                                                                                </p>
                                                                                            </div>
                                                                                        )}

                                                                                        {/* User and Group Selector for Private Visibility */}
                                                                                        {editLinkState[link.id]?.visibility === 'private' && (
                                                                                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border-2 border-slate-200 dark:border-slate-700 space-y-3">
                                                                                                <div>
                                                                                                    <div className="flex items-center justify-between mb-2">
                                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Select Users</label>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setShowUserPicker(prev => ({ ...prev, [link.id]: !prev[link.id] }))}
                                                                                                            className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium flex items-center gap-1"
                                                                                                        >
                                                                                                            {showUserPicker[link.id] ? 'Hide' : 'Show'}
                                                                                                        </button>
                                                                                                    </div>
                                                                                                    {editLinkState[link.id]?.allowedUsers && editLinkState[link.id]!.allowedUsers.length > 0 && (
                                                                                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                            {editLinkState[link.id]!.allowedUsers.map(userId => {
                                                                                                                const user = usersList.find(u => u.id === userId);
                                                                                                                return (
                                                                                                                    <span
                                                                                                                        key={userId}
                                                                                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs font-medium"
                                                                                                                    >
                                                                                                                        {user?.username || `User ${userId}`}
                                                                                                                        <button
                                                                                                                            type="button"
                                                                                                                            onClick={() => toggleEditUserSelection(link.id, userId)}
                                                                                                                            className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                                                                            title="Remove user"
                                                                                                                        >
                                                                                                                            ×
                                                                                                                        </button>
                                                                                                                    </span>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {showUserPicker[link.id] && (
                                                                                                        <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                            {loadingUsers ? (
                                                                                                                <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">Loading...</div>
                                                                                                            ) : usersList.length === 0 ? (
                                                                                                                <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No users available</div>
                                                                                                            ) : (
                                                                                                                usersList.map(user => (
                                                                                                                    <label key={user.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                                        <input type="checkbox" checked={editLinkState[link.id]?.allowedUsers?.includes(user.id) || false} onChange={() => toggleEditUserSelection(link.id, user.id)} className="rounded w-3.5 h-3.5" />
                                                                                                                        <span className="text-xs font-medium">{user.username}</span>
                                                                                                                    </label>
                                                                                                                ))
                                                                                                            )}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div>
                                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Select Groups</label>
                                                                                                    {editLinkState[link.id]?.allowedGroups && editLinkState[link.id]!.allowedGroups.length > 0 && (
                                                                                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                            {editLinkState[link.id]!.allowedGroups.map(groupId => {
                                                                                                                const group = availableGroups.find(g => g.id === groupId);
                                                                                                                return (
                                                                                                                    <span key={groupId} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                                                                                                        {group?.name || `Group ${groupId}`}
                                                                                                                        <button type="button" onClick={() => toggleEditGroupSelection(link.id, groupId)} className="hover:text-red-600 dark:hover:text-red-400">×</button>
                                                                                                                    </span>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                        {availableGroups.length === 0 ? (
                                                                                                            <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No groups available</div>
                                                                                                        ) : (
                                                                                                            availableGroups.map(group => (
                                                                                                                <label key={group.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                                    <input type="checkbox" checked={editLinkState[link.id]?.allowedGroups?.includes(group.id) || false} onChange={() => toggleEditGroupSelection(link.id, group.id)} className="rounded w-3.5 h-3.5" />
                                                                                                                    <span className="text-xs font-medium">{group.name}</span>
                                                                                                                    <span className="text-[10px] text-slate-500">({group.memberCount})</span>
                                                                                                                </label>
                                                                                                            ))
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}

                                                                                        {/* Action Buttons */}
                                                                                        <div className="flex gap-2 justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                                            <button
                                                                                                onClick={handleCancelEditLink}
                                                                                                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                                                                                            >
                                                                                                Cancel
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleUpdateLink(tab.id, section.id, link.id)}
                                                                                                disabled={!editLinkState[link.id]?.label?.trim() || !editLinkState[link.id]?.url?.trim()}
                                                                                                className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                                </svg>
                                                                                                Save
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                ) : (
                                                                                    // View Mode
                                                                                    <div
                                                                                        key={link.id}
                                                                                        id={`link-${link.id}`}
                                                                                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 cursor-pointer ${matchesSearch
                                                                                            ? linkSearchTerm
                                                                                                ? isHovered
                                                                                                    ? 'bg-yellow-300 dark:bg-yellow-600/40 border-yellow-400 dark:border-yellow-500 shadow-lg scale-[1.02]'
                                                                                                    : 'bg-yellow-200 dark:bg-yellow-600/30 border-yellow-300 dark:border-yellow-500 hover:bg-yellow-300 dark:hover:bg-yellow-600/40 hover:border-yellow-400 dark:hover:border-yellow-500 hover:shadow-md'
                                                                                                : isHovered
                                                                                                    ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 shadow-md scale-[1.02]'
                                                                                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-brand-200 dark:hover:border-brand-700 hover:shadow-sm'
                                                                                            : 'bg-slate-50 dark:bg-slate-900 opacity-40 border-slate-100 dark:border-slate-800'
                                                                                            }`}
                                                                                        onMouseEnter={() => setHoveredLinkId(link.id)}
                                                                                        onMouseLeave={() => setHoveredLinkId(null)}
                                                                                        onClick={() => {
                                                                                            if (linkSearchTerm && matchesSearch) {
                                                                                                document.getElementById(`link-${link.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        {/* Link Reorder Buttons */}
                                                                                        <div className="flex flex-col gap-0.5">
                                                                                            <button
                                                                                                onClick={(e) => { e.stopPropagation(); handleMoveItem(tab.id, section.id, link.id, 'up'); }}
                                                                                                disabled={isFirst}
                                                                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                                                                title="Move Up"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={(e) => { e.stopPropagation(); handleMoveItem(tab.id, section.id, link.id, 'down'); }}
                                                                                                disabled={isLast}
                                                                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                                                                title="Move Down"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                                                </svg>
                                                                                            </button>
                                                                                        </div>
                                                                                        {/* Selection Checkbox */}
                                                                                        <div className="flex items-center px-1" onClick={(e) => e.stopPropagation()}>
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selectedLinkIds.includes(link.id)}
                                                                                                onChange={() => toggleLinkSelection(link.id)}
                                                                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                                                                            />
                                                                                        </div>
                                                                                        <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">🔗</div>
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <div
                                                                                                    className={`text-sm font-medium truncate transition-colors duration-200 ${!link.textColor
                                                                                                        ? 'text-slate-700 dark:text-slate-200'
                                                                                                        : isHovered
                                                                                                            ? ''
                                                                                                            : ''
                                                                                                        }`}
                                                                                                    style={link.textColor ? {
                                                                                                        color: isHovered ? link.textColor : link.textColor,
                                                                                                        // Add text shadow for better visibility on light backgrounds
                                                                                                        textShadow: isHovered ? '0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)',
                                                                                                        fontWeight: isHovered ? '700' : '600',
                                                                                                        filter: isHovered ? 'brightness(1.1)' : 'none',
                                                                                                        transition: 'all 0.2s ease'
                                                                                                    } : undefined}
                                                                                                    dangerouslySetInnerHTML={{ __html: link.label || '' }}
                                                                                                />
                                                                                                {link.visibility && link.visibility !== 'public' && (
                                                                                                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${link.visibility === 'authenticated'
                                                                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                                                                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                                                                                        }`}>
                                                                                                        {link.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                                                    </span>
                                                                                                )}
                                                                                                {(link.visibleFrom || link.expiresAt) && (
                                                                                                    <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                                                                        📅
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="text-xs text-slate-500 truncate font-mono">{link.url}</div>
                                                                                            {settings.browser_specific_links_enabled === '1' && (() => {
                                                                                                // Determine which browser is being used for this link
                                                                                                // Priority: link-specific browser > tile default browser > system default
                                                                                                const browserToUse = link.browser && link.browser !== 'default'
                                                                                                    ? link.browser
                                                                                                    : (tile.browser && tile.browser !== 'default' ? tile.browser : null);

                                                                                                // Only show browser indicator if it's not the system default
                                                                                                if (browserToUse) {
                                                                                                    return (
                                                                                                        <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                                                                                            ({formatBrowserName(browserToUse)} browser)
                                                                                                        </div>
                                                                                                    );
                                                                                                }
                                                                                                return null;
                                                                                            })()}
                                                                                        </div>
                                                                                        <div className="flex gap-1">
                                                                                            {/* Favorite button (in edit mode list) */}
                                                                                            {isAuthenticated && (
                                                                                                <button
                                                                                                    onClick={() => handleToggleLinkFavorite(link.id)}
                                                                                                    className={`p-1.5 rounded transition-all ${link.isFavorite
                                                                                                        ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                                                                        : 'text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                                                                        }`}
                                                                                                    title={link.isFavorite ? "Unfavorite" : "Favorite"}
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                        <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9c-2.436-2.147-4.134-4.194-4.134-6.32 0-2.205 1.795-4 4-4a4.002 4.002 0 013.235 1.643 4.002 4.002 0 013.235-1.643 4 4 0 014 4c0 2.126-1.698 4.173-4.134 6.32a22.037 22.037 0 01-2.582 1.9 20.271 20.271 0 01-1.162.682l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            )}
                                                                                            <button
                                                                                                onClick={() => handleStartEditLink(link)}
                                                                                                className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Edit Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleCloneLink(tab.id, section.id, link.id)}
                                                                                                className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Clone Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                                                    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => setSchedulingDialogLink({ tabId: tab.id, sectionId: section.id, linkId: link.id })}
                                                                                                className="p-1.5 text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                title="Schedule Link"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            {(tile.canDeleteLinks !== false && (tile.canDeleteLinks !== undefined || tile.canEdit)) && (
                                                                                                <button
                                                                                                    onClick={() => handleRemoveLinkFromSection(tab.id, section.id, link.id)}
                                                                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                                    title="Delete Link"
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </div>

                                                                    {/* Inline Add Form - Compact Design - Only show when expanded */}
                                                                    {showAddLinkForm[section.id] && (
                                                                        <div className="mt-3 bg-white dark:bg-slate-800 border-2 border-brand-500 dark:border-brand-500/50 rounded-xl p-4 shadow-lg space-y-3">
                                                                            {/* Form Header with Close Button */}
                                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                                                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add New Link</h4>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setShowAddLinkForm(prev => ({ ...prev, [section.id]: false }));
                                                                                        // Clear form when closing
                                                                                        setNewLinkState(prev => ({ ...prev, [section.id]: { label: '', url: '', icon: '', textColor: '', visibility: 'public' as LinkVisibility, allowedUsers: [], allowedGroups: [], notes: '', tooltip: '', browser: 'default', richTextContent: '' } }));
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                                                                    title="Close form"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                            {/* Link Label & URL */}
                                                                            <div className="space-y-3">
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Link Label (Rich Text)</label>
                                                                                    <RichTextEditor
                                                                                        value={newLinkState[section.id]?.label || ''}
                                                                                        onChange={(value) => updateNewLinkState(section.id, 'label', value)}
                                                                                        placeholder="Enter link name with formatting..."
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">URL</label>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={newLinkState[section.id]?.url || ''}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'url', e.target.value)}
                                                                                        placeholder="https://example.com"
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {/* Emoji Selection */}
                                                                            <div className="relative">
                                                                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Emoji</label>
                                                                                <div className="flex gap-2 items-center">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                                                                        className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                                                                        title="Select emoji"
                                                                                    >
                                                                                        <span className="text-xl">
                                                                                            {newLinkState[section.id]?.icon || '😀'}
                                                                                        </span>
                                                                                    </button>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={newLinkState[section.id]?.icon || ''}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'icon', e.target.value)}
                                                                                        placeholder="Or type emoji..."
                                                                                        className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                    />
                                                                                </div>
                                                                                {showLinkEmojiPicker[section.id] && (
                                                                                    <>
                                                                                        <div className="fixed inset-0 z-[9998]" onClick={() => setShowLinkEmojiPicker(prev => ({ ...prev, [section.id]: false }))}></div>
                                                                                        <div className="fixed z-[9999] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-96 max-h-[500px] flex flex-col overflow-hidden" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                                                                            <EmojiPickerTabs linkId={section.id} editLinkState={newLinkState[section.id]} updateEditLinkState={(id, field, value) => updateNewLinkState(id, field, value)} setShowLinkEmojiPicker={setShowLinkEmojiPicker} />
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>

                                                                            {/* Text Color & Visibility - Side by Side */}
                                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Text Color</label>
                                                                                    <div className="flex gap-2 items-center">
                                                                                        <input
                                                                                            type="color"
                                                                                            value={newLinkState[section.id]?.textColor && newLinkState[section.id]!.textColor.trim() ? newLinkState[section.id]!.textColor : '#000000'}
                                                                                            onChange={(e) => updateNewLinkState(section.id, 'textColor', e.target.value)}
                                                                                            className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 transition-all"
                                                                                            title="Select text color"
                                                                                        />
                                                                                        <div className="flex-1 flex gap-1.5">
                                                                                            <input
                                                                                                type="text"
                                                                                                value={newLinkState[section.id]?.textColor || ''}
                                                                                                onChange={(e) => updateNewLinkState(section.id, 'textColor', e.target.value)}
                                                                                                placeholder="#000000"
                                                                                                className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
                                                                                            />
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => updateNewLinkState(section.id, 'textColor', '')}
                                                                                                className="px-2.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium"
                                                                                                title="Clear color"
                                                                                            >
                                                                                                Clear
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Visibility</label>
                                                                                    <select
                                                                                        value={newLinkState[section.id]?.visibility || 'public'}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'visibility', e.target.value as LinkVisibility)}
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium"
                                                                                    >
                                                                                        {user?.is_admin && <option value="public">Public (visible to everyone)</option>}
                                                                                        {user?.is_admin && <option value="authenticated">Authenticated (logged-in users only)</option>}
                                                                                        <option value="private">Private (specific users only)</option>
                                                                                    </select>
                                                                                </div>
                                                                            </div>

                                                                            {/* Notes & Tooltip - Side by Side */}
                                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Notes</label>
                                                                                    <textarea
                                                                                        value={newLinkState[section.id]?.notes || ''}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'notes', e.target.value)}
                                                                                        placeholder="Add notes..."
                                                                                        rows={2}
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all resize-none"
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Hover Tooltip</label>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={newLinkState[section.id]?.tooltip || ''}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'tooltip', e.target.value)}
                                                                                        placeholder="Text shown on hover..."
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {/* Rich Text Content */}
                                                                            <div>
                                                                                <div className="flex items-center justify-between mb-1.5">
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                                                        Information Content (Rich Text)
                                                                                    </label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            const demoContent = '<h2>Welcome to Information Content</h2><p>This is a <strong>sample rich text content</strong> that demonstrates various formatting options available in the editor.</p><h3>Key Features</h3><ul><li>Rich text formatting with <em>bold</em> and <u>underline</u></li><li>Lists and structured content</li><li>Links and embedded content</li><li>Custom styling options</li></ul><h3>Contact Information</h3><p>For more information, please contact:</p><p><strong>Support Team:</strong> support@company.com<br/><strong>Phone:</strong> +1-555-0100</p><blockquote><p>This is an important note or quote that stands out from the regular content.</p></blockquote><p>You can edit this content using the rich text editor toolbar above.</p>';
                                                                                            updateNewLinkState(section.id, 'richTextContent', demoContent);
                                                                                        }}
                                                                                        className="px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                                                                                    >
                                                                                        Demo Fill
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                                    If provided, clicking this link will open a rich text dialog instead of navigating to the URL. Leave empty to open the URL normally.
                                                                                </p>
                                                                                <RichTextEditor
                                                                                    value={newLinkState[section.id]?.richTextContent || ''}
                                                                                    onChange={(html) => updateNewLinkState(section.id, 'richTextContent', html)}
                                                                                    placeholder="Enter rich text content that will be displayed in a dialog when the link is clicked..."
                                                                                    className="min-h-[200px]"
                                                                                />
                                                                            </div>

                                                                            {/* Browser Selection - Only show if feature is enabled and user has canChangeBrowser or is admin */}
                                                                            {settings.browser_specific_links_enabled === '1' && (user?.is_admin || tile.canChangeBrowser === true) && (
                                                                                <div>
                                                                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Open link in</label>
                                                                                    <select
                                                                                        value={newLinkState[section.id]?.browser || 'default'}
                                                                                        onChange={(e) => updateNewLinkState(section.id, 'browser', e.target.value)}
                                                                                        className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                                                    >
                                                                                        <option value="default">Default Browser</option>
                                                                                        {availableBrowsers.length > 0 ? (
                                                                                            availableBrowsers.map((browserId) => {
                                                                                                // Format browser ID for display
                                                                                                const displayName = browserId
                                                                                                    .replace(/-/g, ' ')
                                                                                                    .replace(/\b\w/g, (l) => l.toUpperCase())
                                                                                                    .replace('Wsl', '(WSL)')
                                                                                                    .replace('Stable', 'Stable')
                                                                                                    .replace('Beta', 'Beta')
                                                                                                    .replace('Dev', 'Dev');
                                                                                                return (
                                                                                                    <option key={browserId} value={browserId}>
                                                                                                        {displayName}
                                                                                                    </option>
                                                                                                );
                                                                                            })
                                                                                        ) : (
                                                                                            <>
                                                                                                <option value="chrome-stable">Chrome Stable</option>
                                                                                                <option value="chrome-beta">Chrome Beta</option>
                                                                                                <option value="chrome-dev">Chrome Dev</option>
                                                                                                <option value="edge-stable">Edge Stable</option>
                                                                                                <option value="edge-beta">Edge Beta</option>
                                                                                                <option value="edge-dev">Edge Dev</option>
                                                                                                <option value="firefox">Firefox (WSL)</option>
                                                                                            </>
                                                                                        )}
                                                                                    </select>
                                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                                                                        Select which browser should open this link. Requires browser extension to be installed.
                                                                                    </p>
                                                                                </div>
                                                                            )}

                                                                            {/* User and Group Selector for Private Visibility */}
                                                                            {(newLinkState[section.id]?.visibility || 'public') === 'private' && (
                                                                                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border-2 border-slate-200 dark:border-slate-700 space-y-3">
                                                                                    <div>
                                                                                        <div className="flex items-center justify-between mb-2">
                                                                                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Select Users</label>
                                                                                            <button type="button" onClick={() => setShowUserPicker(prev => ({ ...prev, [section.id]: !prev[section.id] }))} className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium">
                                                                                                {showUserPicker[section.id] ? 'Hide' : 'Show'}
                                                                                            </button>
                                                                                        </div>
                                                                                        {newLinkState[section.id]?.allowedUsers && newLinkState[section.id]!.allowedUsers.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                {newLinkState[section.id]!.allowedUsers.map(userId => {
                                                                                                    const user = usersList.find(u => u.id === userId);
                                                                                                    return (
                                                                                                        <span key={userId} className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs font-medium">
                                                                                                            {user?.username || `User ${userId}`}
                                                                                                            <button type="button" onClick={() => toggleUserSelection(section.id, userId)} className="hover:text-red-600">×</button>
                                                                                                        </span>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                        {showUserPicker[section.id] && (
                                                                                            <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                                {loadingUsers ? <div className="text-xs text-slate-500 text-center py-2">Loading...</div> : usersList.length === 0 ? <div className="text-xs text-slate-500 text-center py-2">No users available</div> : usersList.map(user => (
                                                                                                    <label key={user.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                        <input type="checkbox" checked={newLinkState[section.id]?.allowedUsers?.includes(user.id) || false} onChange={() => toggleUserSelection(section.id, user.id)} className="rounded w-3.5 h-3.5" />
                                                                                                        <span className="text-xs font-medium">{user.username}</span>
                                                                                                    </label>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Select Groups</label>
                                                                                        {newLinkState[section.id]?.allowedGroups && newLinkState[section.id]!.allowedGroups.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                                                                {newLinkState[section.id]!.allowedGroups.map(groupId => {
                                                                                                    const group = availableGroups.find(g => g.id === groupId);
                                                                                                    return (
                                                                                                        <span key={groupId} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                                                                                            {group?.name || `Group ${groupId}`}
                                                                                                            <button type="button" onClick={() => toggleGroupSelection(section.id, groupId)} className="hover:text-red-600">×</button>
                                                                                                        </span>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                            {availableGroups.length === 0 ? <div className="text-xs text-slate-500 text-center py-2">No groups available</div> : availableGroups.map(group => (
                                                                                                <label key={group.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                                                                                                    <input type="checkbox" checked={newLinkState[section.id]?.allowedGroups?.includes(group.id) || false} onChange={() => toggleGroupSelection(section.id, group.id)} className="rounded w-3.5 h-3.5" />
                                                                                                    <span className="text-xs font-medium">{group.name}</span>
                                                                                                    <span className="text-[10px] text-slate-500">({group.memberCount})</span>
                                                                                                </label>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            {/* Action Button */}
                                                                            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                                <button
                                                                                    onClick={() => handleAddLinkToSection(tab.id, section.id)}
                                                                                    disabled={!newLinkState[section.id]?.label || !newLinkState[section.id]?.url}
                                                                                    className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                                    </svg>
                                                                                    Add Link
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Add Rich Text Form */}
                                                                    {showAddRichTextForm[section.id] && (
                                                                        <div className="mt-3 bg-white dark:bg-slate-800 border-2 border-emerald-500 dark:border-emerald-500/50 rounded-xl p-4 shadow-lg space-y-3">
                                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                                                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add Rich Text Content</h4>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setShowAddRichTextForm(prev => ({ ...prev, [section.id]: false }));
                                                                                        setNewRichTextContent(prev => ({ ...prev, [section.id]: '' }));
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                                                                    title="Close form"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                            <RichTextEditor
                                                                                value={newRichTextContent[section.id] || ''}
                                                                                onChange={(value) => setNewRichTextContent(prev => ({ ...prev, [section.id]: value }))}
                                                                                placeholder="Enter rich text content with formatting..."
                                                                            />
                                                                            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                                <button
                                                                                    onClick={() => handleAddRichTextToSection(tab.id, section.id)}
                                                                                    disabled={!newRichTextContent[section.id]?.trim()}
                                                                                    className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-emerald-500/30 flex items-center gap-1.5"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                                    </svg>
                                                                                    Add Rich Text
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Add Link and Rich Text Buttons - Show when forms are collapsed - At bottom of section */}
                                                                    {!showAddLinkForm[section.id] && !showAddRichTextForm[section.id] && (
                                                                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                                                                            <button
                                                                                onClick={() => {
                                                                                    setShowAddRichTextForm(prev => ({ ...prev, [section.id]: true }));
                                                                                }}
                                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 flex items-center justify-center gap-2"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                                                </svg>
                                                                                Add Rich Text
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setShowAddLinkForm(prev => ({ ...prev, [section.id]: true }));
                                                                                }}
                                                                                className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center justify-center gap-2"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                                </svg>
                                                                                Add Link
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {tab.sections.length === 0 && (
                                                        <div className="text-center py-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 text-sm">
                                                            <p>No sections in this tab. Click "Add Section" to get started.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    // Backward compatibility: Render sections without tabs
                                    editSections.map((section, index) => {
                                        // Generate a color for visual identification based on section index
                                        const colorIndex = index % 6;
                                        const borderColors = [
                                            'border-r-4 border-r-blue-500',
                                            'border-r-4 border-r-green-500',
                                            'border-r-4 border-r-purple-500',
                                            'border-r-4 border-r-orange-500',
                                            'border-r-4 border-r-pink-500',
                                            'border-r-4 border-r-teal-500'
                                        ];
                                        const bgColors = [
                                            'bg-blue-50 dark:bg-blue-900/10',
                                            'bg-green-50 dark:bg-green-900/10',
                                            'bg-purple-50 dark:bg-purple-900/10',
                                            'bg-orange-50 dark:bg-orange-900/10',
                                            'bg-pink-50 dark:bg-pink-900/10',
                                            'bg-teal-50 dark:bg-teal-900/10'
                                        ];
                                        const sectionColorClass = borderColors[colorIndex];
                                        const sectionBgClass = bgColors[colorIndex];

                                        return (
                                            <div key={section.id} className={`bg-white dark:bg-slate-800 border border-l-2 border-t-2 border-b-2 border-slate-200 dark:border-slate-700 ${sectionColorClass} rounded-2xl overflow-hidden shadow-sm dark:shadow-black/20`}>
                                                {/* Section Header */}
                                                <div className={`p-4 border-b border-slate-200 dark:border-slate-700 ${sectionBgClass} flex gap-2 items-center`}>
                                                    <div className="text-slate-400 dark:text-slate-500 font-mono text-sm">#{index + 1}</div>
                                                    <input
                                                        type="text"
                                                        value={section.title}
                                                        onChange={(e) => {
                                                            // For backward compatibility, update sections directly
                                                            const newSections = editSections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s);
                                                            setEditSections(newSections);
                                                        }}
                                                        placeholder="Section Header (e.g. Resources)"
                                                        className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-bold focus:ring-0 placeholder-slate-400"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            console.log('=== LEGACY SECTION DELETION START ===');
                                                            console.log('Section ID:', section.id);

                                                            if (!isEditing) {
                                                                alert('Please enter edit mode first before deleting sections.');
                                                                return;
                                                            }

                                                            const confirmed = window.confirm('Delete this section and all its links?');
                                                            if (!confirmed) {
                                                                return;
                                                            }

                                                            console.log('Proceeding with legacy section deletion...');
                                                            const filteredSections = editSections.filter(s => s.id !== section.id);
                                                            console.log('Sections before:', editSections.length, 'after:', filteredSections.length);

                                                            setEditSections(filteredSections);

                                                            // Automatically save after deletion
                                                            autoSavingRef.current = true;

                                                            setTimeout(() => {
                                                                console.log('Auto-saving after legacy section deletion...');

                                                                const updatedTile: Tile = {
                                                                    ...tile,
                                                                    title: editTitle,
                                                                    description: editDesc,
                                                                    htmlContent: editHtml,
                                                                    emoji: editEmoji,
                                                                    themeColor: editColor,
                                                                    tabs: editTabs.length > 0 ? editTabs : undefined,
                                                                    sections: editTabs.length > 0 ? undefined : filteredSections,
                                                                    visibility: editVisibility,
                                                                    allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
                                                                };

                                                                const updatedTilesArray = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);

                                                                try {
                                                                    onUpdateTiles(updatedTilesArray, true);
                                                                    console.log('Auto-save: Legacy section deletion saved successfully');

                                                                    setTimeout(() => {
                                                                        autoSavingRef.current = false;
                                                                    }, 1000);
                                                                } catch (error) {
                                                                    console.error('Auto-save: Failed to save:', error);
                                                                    alert('Failed to save section deletion. Please try saving manually.');
                                                                    autoSavingRef.current = false;
                                                                }
                                                            }, 150);
                                                        }}
                                                        className="text-slate-400 hover:text-red-500 p-2"
                                                        title="Delete Section"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="p-4 bg-white dark:bg-slate-800">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 italic mb-4">This section uses the old structure. Add a tab to use the new tab-based organization.</p>
                                                    <p className="text-xs text-slate-400 dark:text-slate-600">Links: {section.links?.length || 0}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}

                                {editTabs.length === 0 && editSections.length === 0 && (
                                    <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-500">
                                        <p>No tabs yet. Click "Add Tab" to get started.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tab Visibility Dialog */}
                        {visibilityDialogTab && (() => {
                            const tab = editTabs.find(t => t.id === visibilityDialogTab);
                            if (!tab) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setVisibilityDialogTab(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tab Visibility: {tab.title}</h3>
                                            <button
                                                onClick={() => setVisibilityDialogTab(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-3 mb-6">
                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="tabVisibility"
                                                        checked={!tab.visibility || tab.visibility === 'public'}
                                                        onChange={() => handleUpdateTabVisibility(tab.id, 'public')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🌐 Public</div>
                                                        <div className="text-xs text-slate-500">Available for everyone</div>
                                                    </div>
                                                </label>
                                            )}

                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="tabVisibility"
                                                        checked={tab.visibility === 'authenticated'}
                                                        onChange={() => handleUpdateTabVisibility(tab.id, 'authenticated')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🔒 Authenticated</div>
                                                        <div className="text-xs text-slate-500">Logged in users only</div>
                                                    </div>
                                                </label>
                                            )}

                                            <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                <input
                                                    type="radio"
                                                    name="tabVisibility"
                                                    checked={tab.visibility === 'private'}
                                                    onChange={() => handleUpdateTabVisibility(tab.id, 'private', tab.allowedUsers || [], tab.allowedGroups || [])}
                                                    className="w-4 h-4"
                                                />
                                                <div>
                                                    <div className="font-semibold text-slate-900 dark:text-white">🔐 Private</div>
                                                    <div className="text-xs text-slate-500">Specific users and/or groups only</div>
                                                </div>
                                            </label>
                                        </div>

                                        {tab.visibility === 'private' && (
                                            <div className="mb-6 space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Users:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {usersList.map(user => (
                                                            <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={tab.allowedUsers?.includes(user.id) || false}
                                                                    onChange={(e) => {
                                                                        const currentUsers = tab.allowedUsers || [];
                                                                        const newUsers = e.target.checked
                                                                            ? [...currentUsers, user.id]
                                                                            : currentUsers.filter(id => id !== user.id);
                                                                        handleUpdateTabVisibility(tab.id, 'private', newUsers, tab.allowedGroups || []);
                                                                    }}
                                                                    className="rounded"
                                                                />
                                                                <span className="text-sm">{user.username}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Groups:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {availableGroups.length === 0 ? (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">No groups available</p>
                                                        ) : (
                                                            availableGroups.map(group => (
                                                                <label key={group.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={tab.allowedGroups?.includes(group.id) || false}
                                                                        onChange={(e) => {
                                                                            const currentGroups = tab.allowedGroups || [];
                                                                            const newGroups = e.target.checked
                                                                                ? [...currentGroups, group.id]
                                                                                : currentGroups.filter(id => id !== group.id);
                                                                            handleUpdateTabVisibility(tab.id, 'private', tab.allowedUsers || [], newGroups);
                                                                        }}
                                                                        className="rounded"
                                                                    />
                                                                    <span className="text-sm">{group.name}</span>
                                                                    <span className="text-xs text-slate-500">({group.memberCount} members)</span>
                                                                </label>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => setVisibilityDialogTab(null)}
                                            className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Section Visibility Dialog */}
                        {visibilityDialogSection && (() => {
                            const tab = editTabs.find(t => t.id === visibilityDialogSection.tabId);
                            const section = tab?.sections.find(s => s.id === visibilityDialogSection.sectionId);
                            if (!section) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setVisibilityDialogSection(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Section Visibility: {section.title}</h3>
                                            <button
                                                onClick={() => setVisibilityDialogSection(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-3 mb-6">
                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="sectionVisibility"
                                                        checked={!section.visibility || section.visibility === 'public'}
                                                        onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'public')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🌐 Public</div>
                                                        <div className="text-xs text-slate-500">Available for everyone</div>
                                                    </div>
                                                </label>
                                            )}

                                            {user?.is_admin && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="sectionVisibility"
                                                        checked={section.visibility === 'authenticated'}
                                                        onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'authenticated')}
                                                        className="w-4 h-4"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-slate-900 dark:text-white">🔒 Authenticated</div>
                                                        <div className="text-xs text-slate-500">Logged in users only</div>
                                                    </div>
                                                </label>
                                            )}

                                            <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                                <input
                                                    type="radio"
                                                    name="sectionVisibility"
                                                    checked={section.visibility === 'private'}
                                                    onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', section.allowedUsers || [], section.allowedGroups || [])}
                                                    className="w-4 h-4"
                                                />
                                                <div>
                                                    <div className="font-semibold text-slate-900 dark:text-white">🔐 Private</div>
                                                    <div className="text-xs text-slate-500">Specific users and/or groups only</div>
                                                </div>
                                            </label>
                                        </div>

                                        {section.visibility === 'private' && (
                                            <div className="mb-6 space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Users:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {usersList.map(user => (
                                                            <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={section.allowedUsers?.includes(user.id) || false}
                                                                    onChange={(e) => {
                                                                        const currentUsers = section.allowedUsers || [];
                                                                        const newUsers = e.target.checked
                                                                            ? [...currentUsers, user.id]
                                                                            : currentUsers.filter(id => id !== user.id);
                                                                        handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', newUsers, section.allowedGroups || []);
                                                                    }}
                                                                    className="rounded"
                                                                />
                                                                <span className="text-sm">{user.username}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Groups:</label>
                                                    <div className="max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                        {availableGroups.length === 0 ? (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">No groups available</p>
                                                        ) : (
                                                            availableGroups.map(group => (
                                                                <label key={group.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={section.allowedGroups?.includes(group.id) || false}
                                                                        onChange={(e) => {
                                                                            const currentGroups = section.allowedGroups || [];
                                                                            const newGroups = e.target.checked
                                                                                ? [...currentGroups, group.id]
                                                                                : currentGroups.filter(id => id !== group.id);
                                                                            handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', section.allowedUsers || [], newGroups);
                                                                        }}
                                                                        className="rounded"
                                                                    />
                                                                    <span className="text-sm">{group.name}</span>
                                                                    <span className="text-xs text-slate-500">({group.memberCount} members)</span>
                                                                </label>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => setVisibilityDialogSection(null)}
                                            className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Tab Scheduling Dialog */}
                        {schedulingDialogTab && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogTab);
                            if (!tab) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogTab(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Tab: {tab.title}</h3>
                                            <button
                                                onClick={() => setSchedulingDialogTab(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={tab.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateTabScheduling(tab.id, e.target.value, tab.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tab becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={tab.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateTabScheduling(tab.id, tab.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tab expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration"
                                                    checked={!tab.visibleFrom && !tab.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateTabScheduling(tab.id, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(tab.visibleFrom || tab.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The tab will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateTabScheduling(tab.id, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogTab(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Section Scheduling Dialog */}
                        {schedulingDialogSection && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogSection.tabId);
                            const section = tab?.sections.find(s => s.id === schedulingDialogSection.sectionId);
                            if (!section) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogSection(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Section: {section.title}</h3>
                                            <button
                                                onClick={() => setSchedulingDialogSection(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={section.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, e.target.value, section.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Section becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={section.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, section.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Section expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration-section"
                                                    checked={!section.visibleFrom && !section.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration-section" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(section.visibleFrom || section.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The section will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateSectionScheduling(schedulingDialogSection.tabId, schedulingDialogSection.sectionId, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogSection(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Link Scheduling Dialog */}
                        {schedulingDialogLink && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogLink.tabId);
                            const section = tab?.sections.find(s => s.id === schedulingDialogLink.sectionId);
                            const link = section?.links.find(l => l.id === schedulingDialogLink.linkId);
                            if (!link) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogLink(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Link: <span dangerouslySetInnerHTML={{ __html: link.label || '' }} /></h3>
                                            <button
                                                onClick={() => setSchedulingDialogLink(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={link.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, e.target.value, link.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Link becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={link.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, link.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Link expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration-link"
                                                    checked={!link.visibleFrom && !link.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration-link" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(link.visibleFrom || link.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The link will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateLinkScheduling(schedulingDialogLink.tabId, schedulingDialogLink.sectionId, schedulingDialogLink.linkId, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogLink(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Rich Text Scheduling Dialog */}
                        {schedulingDialogRichText && (() => {
                            const tab = editTabs.find(t => t.id === schedulingDialogRichText.tabId);
                            const section = tab?.sections.find(s => s.id === schedulingDialogRichText.sectionId);
                            const richText = section?.richTextContent?.find(r => r.id === schedulingDialogRichText.richTextId);
                            if (!richText) return null;

                            return (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSchedulingDialogRichText(null)}>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Schedule Rich Text Content</h3>
                                            <button
                                                onClick={() => setSchedulingDialogRichText(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                title="Close"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Visible From (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={richText.visibleFrom?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, e.target.value, richText.expiresAt)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Content becomes visible at this date/time</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Expires At (optional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={richText.expiresAt?.slice(0, 16) || ''}
                                                    onChange={(e) => handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, richText.visibleFrom, e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                                />
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Content expires at this date/time</p>
                                            </div>

                                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id="no-expiration-richtext"
                                                    checked={!richText.visibleFrom && !richText.expiresAt}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, undefined, undefined);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                                <label htmlFor="no-expiration-richtext" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    No expiration (always visible)
                                                </label>
                                            </div>

                                            {(richText.visibleFrom || richText.expiresAt) && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        <strong>Note:</strong> Times are in your local timezone. The content will be automatically shown/hidden based on these dates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateRichTextScheduling(schedulingDialogRichText.tabId, schedulingDialogRichText.sectionId, schedulingDialogRichText.richTextId, undefined, undefined)}
                                                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setSchedulingDialogRichText(null)}
                                                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                    </div>
                </div>

                {/* Notes Preset Form Dialog */}
                {notesPresetFormState && (
                    <>
                        {typeof document !== 'undefined' && createPortal(
                            <div
                                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
                            >
                                <div
                                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-3xl w-full max-h-[90vh] flex flex-col my-8"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Dialog Header */}
                                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notes Preset Form</h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Fill in the fields below (all optional)</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setNotesPresetFormState(null);
                                                setNotesPresetForm({
                                                    ownerInfo: '',
                                                    supportTeamInfo: '',
                                                    serviceNowGroupInfo: '',
                                                    businessOwner: '',
                                                    productOwner: '',
                                                    architect: '',
                                                    vendorDetails: '',
                                                    serviceNowDemand: '',
                                                    serviceNowProject: '',
                                                    serviceNowTask: '',
                                                    goLiveInfo: '',
                                                    majorUpgradeInfo: '',
                                                    serviceDeliveryManager: '',
                                                    businessRelationshipManager: '',
                                                    technologyRelationshipManager: ''
                                                });
                                            }}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Dialog Content - Scrollable Form */}
                                    <div className="px-6 py-4 flex-1 overflow-y-auto">
                                        <div className="space-y-4">
                                            {/* Owner Information */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Owner Information</label>
                                                <input
                                                    type="text"
                                                    value={notesPresetForm.ownerInfo}
                                                    onChange={(e) => setNotesPresetForm(prev => ({ ...prev, ownerInfo: e.target.value }))}
                                                    placeholder="Enter owner information..."
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                />
                                            </div>

                                            {/* Support Team Information */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Support Team Information</label>
                                                <input
                                                    type="text"
                                                    value={notesPresetForm.supportTeamInfo}
                                                    onChange={(e) => setNotesPresetForm(prev => ({ ...prev, supportTeamInfo: e.target.value }))}
                                                    placeholder="Enter support team information..."
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                />
                                            </div>

                                            {/* Service Now Group Information */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Service Now Group Information</label>
                                                <input
                                                    type="text"
                                                    value={notesPresetForm.serviceNowGroupInfo}
                                                    onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowGroupInfo: e.target.value }))}
                                                    placeholder="Enter Service Now group information..."
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                />
                                            </div>

                                            {/* Contact Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Contact Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Owner</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.businessOwner}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, businessOwner: e.target.value }))}
                                                            placeholder="Business owner details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Product Owner</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.productOwner}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, productOwner: e.target.value }))}
                                                            placeholder="Product owner details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Architect</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.architect}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, architect: e.target.value }))}
                                                            placeholder="Architect details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Vendor Details</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.vendorDetails}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, vendorDetails: e.target.value }))}
                                                            placeholder="Vendor details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Service Now Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Service Now Ticket Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Demand Ticket</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceNowDemand}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowDemand: e.target.value }))}
                                                            placeholder="Service Now demand ticket..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Project Ticket</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceNowProject}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowProject: e.target.value }))}
                                                            placeholder="Service Now project ticket..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Task Ticket</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceNowTask}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceNowTask: e.target.value }))}
                                                            placeholder="Service Now task ticket..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Project Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Project Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Go-Live Information</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.goLiveInfo}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, goLiveInfo: e.target.value }))}
                                                            placeholder="Go-live date and details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Major Upgrade Information</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.majorUpgradeInfo}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, majorUpgradeInfo: e.target.value }))}
                                                            placeholder="Major upgrade information..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Manager Information Section */}
                                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Manager Information</h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Service Delivery Manager</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.serviceDeliveryManager}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, serviceDeliveryManager: e.target.value }))}
                                                            placeholder="Service Delivery Manager details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Relationship Manager</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.businessRelationshipManager}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, businessRelationshipManager: e.target.value }))}
                                                            placeholder="Business Relationship Manager details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Technology Relationship Manager</label>
                                                        <input
                                                            type="text"
                                                            value={notesPresetForm.technologyRelationshipManager}
                                                            onChange={(e) => setNotesPresetForm(prev => ({ ...prev, technologyRelationshipManager: e.target.value }))}
                                                            placeholder="Technology Relationship Manager details..."
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dialog Footer */}
                                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
                                        <button
                                            onClick={() => {
                                                setNotesPresetFormState(null);
                                                setNotesPresetForm({
                                                    ownerInfo: '',
                                                    supportTeamInfo: '',
                                                    serviceNowGroupInfo: '',
                                                    businessOwner: '',
                                                    productOwner: '',
                                                    architect: '',
                                                    vendorDetails: '',
                                                    serviceNowDemand: '',
                                                    serviceNowProject: '',
                                                    serviceNowTask: '',
                                                    goLiveInfo: '',
                                                    majorUpgradeInfo: '',
                                                    serviceDeliveryManager: '',
                                                    businessRelationshipManager: '',
                                                    technologyRelationshipManager: ''
                                                });
                                            }}
                                            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Fill form with demo data
                                                setNotesPresetForm({
                                                    ownerInfo: 'IT Operations Team - John Smith (john.smith@company.com)',
                                                    supportTeamInfo: 'Level 1 Support - support@company.com | Level 2 Support - l2support@company.com',
                                                    serviceNowGroupInfo: 'IT Operations Group (it-ops-group@company.com)',
                                                    businessOwner: 'Sarah Johnson - Director of IT Operations (sarah.johnson@company.com, ext. 1234)',
                                                    productOwner: 'Michael Chen - Senior Product Manager (michael.chen@company.com, ext. 5678)',
                                                    architect: 'David Williams - Solutions Architect (david.williams@company.com, ext. 9012)',
                                                    vendorDetails: 'TechCorp Solutions - Vendor Contact: vendor@techcorp.com | Support: support@techcorp.com | Phone: +1-555-0100',
                                                    serviceNowDemand: 'DEM-2024-001234',
                                                    serviceNowProject: 'PROJ-2024-005678',
                                                    serviceNowTask: 'TASK-2024-009012',
                                                    goLiveInfo: 'Planned Go-Live: Q2 2024 | Target Date: June 15, 2024 | Status: On Track',
                                                    majorUpgradeInfo: 'Next Major Upgrade: Version 3.0 | Scheduled: Q3 2024 | Upgrade Window: September 2024',
                                                    serviceDeliveryManager: 'Emily Davis - SDM (emily.davis@company.com, ext. 3456)',
                                                    businessRelationshipManager: 'Robert Martinez - BRM (robert.martinez@company.com, ext. 7890)',
                                                    technologyRelationshipManager: 'Jennifer Lee - TRM (jennifer.lee@company.com, ext. 2468)'
                                                });
                                            }}
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Demo Fill
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Format the notes with proper headings
                                                const sections: string[] = [];

                                                if (notesPresetForm.ownerInfo) sections.push(`Owner Information:\n${notesPresetForm.ownerInfo}`);
                                                if (notesPresetForm.supportTeamInfo) sections.push(`Support Team Information:\n${notesPresetForm.supportTeamInfo}`);
                                                if (notesPresetForm.serviceNowGroupInfo) sections.push(`Service Now Group Information:\n${notesPresetForm.serviceNowGroupInfo}`);

                                                const contacts: string[] = [];
                                                if (notesPresetForm.businessOwner) contacts.push(`Business Owner: ${notesPresetForm.businessOwner}`);
                                                if (notesPresetForm.productOwner) contacts.push(`Product Owner: ${notesPresetForm.productOwner}`);
                                                if (notesPresetForm.architect) contacts.push(`Architect: ${notesPresetForm.architect}`);
                                                if (notesPresetForm.vendorDetails) contacts.push(`Vendor Details: ${notesPresetForm.vendorDetails}`);
                                                if (contacts.length > 0) sections.push(`Contact Information:\n${contacts.join('\n')}`);

                                                const tickets: string[] = [];
                                                if (notesPresetForm.serviceNowDemand) tickets.push(`Demand: ${notesPresetForm.serviceNowDemand}`);
                                                if (notesPresetForm.serviceNowProject) tickets.push(`Project: ${notesPresetForm.serviceNowProject}`);
                                                if (notesPresetForm.serviceNowTask) tickets.push(`Task: ${notesPresetForm.serviceNowTask}`);
                                                if (tickets.length > 0) sections.push(`Service Now Ticket Information:\n${tickets.join('\n')}`);

                                                if (notesPresetForm.goLiveInfo) sections.push(`Go-Live Information:\n${notesPresetForm.goLiveInfo}`);
                                                if (notesPresetForm.majorUpgradeInfo) sections.push(`Major Upgrade Information:\n${notesPresetForm.majorUpgradeInfo}`);

                                                const managers: string[] = [];
                                                if (notesPresetForm.serviceDeliveryManager) managers.push(`Service Delivery Manager: ${notesPresetForm.serviceDeliveryManager}`);
                                                if (notesPresetForm.businessRelationshipManager) managers.push(`Business Relationship Manager: ${notesPresetForm.businessRelationshipManager}`);
                                                if (notesPresetForm.technologyRelationshipManager) managers.push(`Technology Relationship Manager: ${notesPresetForm.technologyRelationshipManager}`);
                                                if (managers.length > 0) sections.push(`Manager Information:\n${managers.join('\n')}`);

                                                const formattedNotes = sections.join('\n\n');

                                                // Update the notes field for this link
                                                if (notesPresetFormState.linkId) {
                                                    const currentNotes = editLinkState[notesPresetFormState.linkId]?.notes || '';
                                                    const combinedNotes = currentNotes
                                                        ? (currentNotes + '\n\n' + formattedNotes)
                                                        : formattedNotes;
                                                    updateEditLinkState(notesPresetFormState.linkId, 'notes', combinedNotes);
                                                }

                                                // Reset form and close dialog
                                                setNotesPresetFormState(null);
                                                setNotesPresetForm({
                                                    ownerInfo: '',
                                                    supportTeamInfo: '',
                                                    serviceNowGroupInfo: '',
                                                    businessOwner: '',
                                                    productOwner: '',
                                                    architect: '',
                                                    vendorDetails: '',
                                                    serviceNowDemand: '',
                                                    serviceNowProject: '',
                                                    serviceNowTask: '',
                                                    goLiveInfo: '',
                                                    majorUpgradeInfo: '',
                                                    serviceDeliveryManager: '',
                                                    businessRelationshipManager: '',
                                                    technologyRelationshipManager: ''
                                                });
                                            }}
                                            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Add to Notes
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </>
                )}

                {/* Version Diff Viewer */}
                {diffViewerOpen && diffOriginalTile && diffModifiedTile && (
                    <VersionDiffViewer
                        originalData={diffOriginalTile}
                        modifiedData={diffModifiedTile}
                        originalTitle={restorePreviewVersion ? `Current State` : `Version ${diffOriginalVersionMeta?.versionNumber || 'N/A'}`}
                        modifiedTitle={restorePreviewVersion ? `Version ${diffModifiedVersionMeta?.versionNumber || 'N/A'}` : `Current State`}
                        onClose={() => {
                            setDiffViewerOpen(false);
                            setDiffOriginalVersionMeta(null);
                            setDiffModifiedVersionMeta(null);
                            setRestorePreviewVersion(null);
                        }}
                        originalVersionMeta={restorePreviewVersion ? diffModifiedVersionMeta || undefined : diffOriginalVersionMeta || undefined}
                        modifiedVersionMeta={restorePreviewVersion ? diffOriginalVersionMeta || undefined : diffModifiedVersionMeta || undefined}
                        isRestorePreview={!!restorePreviewVersion}
                        onConfirmRestore={restorePreviewVersion ? handleConfirmRestore : undefined}
                    />
                )}
            </>
        );
    }


    // Fallback: if somehow in edit mode without permission, return view mode
    // (useEffect will handle resetting isEditing state)
    return null;
};


