import React, { useState, useEffect } from 'react';
import { Tile, Link, LinkSection, Tab, LinkVisibility, TileVisibility, COLOR_STYLES, THEME_COLORS, ThemeColor, POPULAR_EMOJIS } from '../types';
import { linkHealthService, LinkHealthMap } from '../services/linkHealthService';
import { authService, UserListItem } from '../services/authService';
import { exportTileToFile } from '../services/spaceTransferService';
import { cloneTile, getTiles } from '../services/storageService';

interface TileDetailProps {
    tile: Tile;
    allTiles: Tile[];
    onUpdateTiles: (tiles: Tile[]) => void;
    isAuthenticated?: boolean;
    onAuthRequired?: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const TileDetail: React.FC<TileDetailProps> = ({
    tile,
    allTiles,
    onUpdateTiles,
    isAuthenticated = false,
    onAuthRequired
}) => {
    const [isEditing, setIsEditing] = useState(false);

    // Edit State
    const [editTitle, setEditTitle] = useState(tile.title);
    const [editDesc, setEditDesc] = useState(tile.description);
    const [editHtml, setEditHtml] = useState(tile.htmlContent || '');
    const [editEmoji, setEditEmoji] = useState(tile.emoji);
    const [editColor, setEditColor] = useState<ThemeColor>(tile.themeColor);
    const [editVisibility, setEditVisibility] = useState<TileVisibility>(tile.visibility || 'public');
    const [editAllowedUsers, setEditAllowedUsers] = useState<number[]>(tile.allowedUsers || []);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showTileUserSelector, setShowTileUserSelector] = useState(false);

    // Tabs State (new structure)
    const [editTabs, setEditTabs] = useState<Tab[]>(tile.tabs || []);
    // Sections State (for backward compatibility)
    const [editSections, setEditSections] = useState<LinkSection[]>(tile.sections || []);

    // Temporary State for Adding Links (keyed by section ID)
    const [newLinkState, setNewLinkState] = useState<Record<string, { label: string, url: string, visibility: LinkVisibility, allowedUsers: number[], notes: string, tooltip: string }>>({});

    // State for Editing Links (keyed by link ID)
    const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
    const [editLinkState, setEditLinkState] = useState<Record<string, { label: string, url: string, visibility: LinkVisibility, allowedUsers: number[], notes: string, tooltip: string }>>({});

    // Users list for private link selection
    const [usersList, setUsersList] = useState<UserListItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [showUserPicker, setShowUserPicker] = useState<Record<string, boolean>>({});

    // View State
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
    const [viewLayout, setViewLayout] = useState<'stacked' | 'side-by-side'>(() => {
        // Load saved preference from localStorage
        try {
            const saved = localStorage.getItem('linknest_view_layout');
            return (saved === 'side-by-side' || saved === 'stacked') ? saved : 'stacked';
        } catch {
            return 'stacked';
        }
    });

    // Visibility Dialog State
    const [visibilityDialogTab, setVisibilityDialogTab] = useState<string | null>(null);
    const [visibilityDialogSection, setVisibilityDialogSection] = useState<{ tabId: string; sectionId: string } | null>(null);

    // Health Check State
    const [linkHealth, setLinkHealth] = useState<LinkHealthMap>({});
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [checkingLinkId, setCheckingLinkId] = useState<string | null>(null);

    // CSV Import State
    const [csvImportFile, setCsvImportFile] = useState<Record<string, File | null>>({});
    const [importingCsv, setImportingCsv] = useState<Record<string, boolean>>({});

    const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];

    // Sync state when tile changes
    useEffect(() => {
        setEditTitle(tile.title);
        setEditDesc(tile.description);
        setEditHtml(tile.htmlContent || '');
        setEditEmoji(tile.emoji);
        setEditColor(tile.themeColor);

        // Use tabs if available, otherwise fall back to sections (backward compatibility)
        if (tile.tabs && tile.tabs.length > 0) {
            setEditTabs(tile.tabs);
            // Flatten sections from tabs for backward compatibility
            const allSections: LinkSection[] = [];
            tile.tabs.forEach(tab => {
                allSections.push(...tab.sections);
            });
            setEditSections(allSections);
        } else {
            setEditTabs([]);
            setEditSections(tile.sections || []);
        }

        setEditVisibility(tile.visibility || 'public');
        setEditAllowedUsers(tile.allowedUsers || []);

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
    }, [tile]);

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

    // Handle ESC key to close visibility dialogs
    useEffect(() => {
        const handleEscKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (visibilityDialogTab) {
                    setVisibilityDialogTab(null);
                } else if (visibilityDialogSection) {
                    setVisibilityDialogSection(null);
                }
            }
        };

        if (visibilityDialogTab || visibilityDialogSection) {
            document.addEventListener('keydown', handleEscKey);
            return () => document.removeEventListener('keydown', handleEscKey);
        }
    }, [visibilityDialogTab, visibilityDialogSection]);

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
            loadUsers();
        }
    }, [isEditing, isAuthenticated, tile.canEdit]);

    // Exit edit mode if user doesn't have permission
    useEffect(() => {
        if (isEditing && !tile.canEdit) {
            setIsEditing(false);
        }
    }, [isEditing, tile.canEdit]);

    const handleSaveChanges = () => {
        // Check if user has edit permission
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            setIsEditing(false);
            return;
        }

        // Use tabs if we have them, otherwise use sections (backward compatibility)
        const updatedTile: Tile = {
            ...tile,
            title: editTitle,
            description: editDesc,
            htmlContent: editHtml,
            emoji: editEmoji,
            themeColor: editColor,
            tabs: editTabs.length > 0 ? editTabs : undefined,
            sections: editTabs.length > 0 ? undefined : editSections, // Only include sections if no tabs
            visibility: editVisibility,
            allowedUsers: editVisibility === 'private' ? editAllowedUsers : undefined,
        };

        const updatedTiles = allTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
        onUpdateTiles(updatedTiles);
        setIsEditing(false);
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
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }
        if (confirm('Delete this tab and all its sections and links?')) {
            setEditTabs(editTabs.filter(t => t.id !== tabId).map((t, idx) => ({ ...t, position: idx })));
        }
    };

    const handleUpdateTabTitle = (tabId: string, newTitle: string) => {
        setEditTabs(editTabs.map(t => t.id === tabId ? { ...t, title: newTitle } : t));
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
            sections: tabToClone.sections.map(section => ({
                id: generateId(),
                title: section.title,
                textColor: section.textColor,
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

    const handleUpdateTabVisibility = (tabId: string, visibility: LinkVisibility, allowedUsers?: number[]) => {
        setEditTabs(editTabs.map(t =>
            t.id === tabId
                ? { ...t, visibility, allowedUsers: visibility === 'private' ? allowedUsers : undefined }
                : t
        ));
    };

    // Section Management (within tabs)
    const handleAddSection = (tabId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id === tabId) {
                return {
                    ...tab,
                    sections: [...tab.sections, { id: generateId(), title: 'New Section', links: [] }]
                };
            }
            return tab;
        }));
    };

    const handleRemoveSection = (tabId: string, sectionId: string) => {
        if (!tile.canEdit) {
            alert('You do not have permission to edit this tile.');
            return;
        }
        if (confirm('Delete this section and all its links?')) {
            setEditTabs(editTabs.map(tab => {
                if (tab.id === tabId) {
                    return {
                        ...tab,
                        sections: tab.sections.filter(s => s.id !== sectionId)
                    };
                }
                return tab;
            }));
        }
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

            const index = tab.sections.findIndex(s => s.id === sectionId);
            if (index === -1) return tab;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= tab.sections.length) return tab;

            const newSections = [...tab.sections];
            [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
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

            // Insert cloned section after the original
            const index = tab.sections.findIndex(s => s.id === sectionId);
            const newSections = [
                ...tab.sections.slice(0, index + 1),
                clonedSection,
                ...tab.sections.slice(index + 1)
            ];

            return { ...tab, sections: newSections };
        }));
    };

    const handleUpdateSectionVisibility = (tabId: string, sectionId: string, visibility: LinkVisibility, allowedUsers?: number[]) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(s =>
                    s.id === sectionId
                        ? { ...s, visibility, allowedUsers: visibility === 'private' ? allowedUsers : undefined }
                        : s
                )
            };
        }));
    };

    // Link Management
    const updateNewLinkState = (sectionId: string, field: 'label' | 'url' | 'visibility' | 'allowedUsers' | 'notes' | 'tooltip', value: string | LinkVisibility | number[]) => {
        setNewLinkState(prev => ({
            ...prev,
            [sectionId]: {
                ...(prev[sectionId] || { label: '', url: '', visibility: 'public' as LinkVisibility, allowedUsers: [], notes: '', tooltip: '' }),
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

    const handleAddLinkToSection = (tabId: string, sectionId: string) => {
        const state = newLinkState[sectionId];
        if (!state || !state.label.trim() || !state.url.trim()) return;

        const newLink: Link = {
            id: generateId(),
            label: state.label,
            url: state.url.startsWith('http') ? state.url : `https://${state.url}`,
            visibility: state.visibility || 'public',
            allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
            notes: state.notes?.trim() || undefined,
            tooltip: state.tooltip?.trim() || undefined
        };

        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id === tabId) {
                    return {
                        ...tab,
                        sections: tab.sections.map(s => {
                            if (s.id === sectionId) {
                                return { ...s, links: [...s.links, newLink] };
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
                    return { ...s, links: [...s.links, newLink] };
                }
                return s;
            }));
        }

        // Clear form
        setNewLinkState(prev => ({ ...prev, [sectionId]: { label: '', url: '', visibility: 'public' as LinkVisibility, allowedUsers: [], notes: '', tooltip: '' } }));
        setShowUserPicker(prev => ({ ...prev, [sectionId]: false }));
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
                                return { ...s, links: s.links.filter(l => l.id !== linkId) };
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
                    return { ...s, links: s.links.filter(l => l.id !== linkId) };
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
                                    return { ...s, links: [...s.links, ...newLinks] };
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
                        return { ...s, links: [...s.links, ...newLinks] };
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
                visibility: link.visibility || 'public',
                allowedUsers: link.allowedUsers || [],
                notes: link.notes || '',
                tooltip: link.tooltip || ''
            }
        });
        setShowUserPicker(prev => ({ ...prev, [link.id]: false }));
    };

    const handleCancelEditLink = () => {
        setEditingLinkId(null);
        setEditLinkState({});
    };

    const handleUpdateLink = (tabId: string, sectionId: string, linkId: string) => {
        const state = editLinkState[linkId];
        if (!state || !state.label.trim() || !state.url.trim()) return;

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
                                        visibility: state.visibility || 'public',
                                        allowedUsers: state.allowedUsers && state.allowedUsers.length > 0 ? state.allowedUsers : undefined,
                                        notes: state.notes?.trim() || undefined,
                                        tooltip: state.tooltip?.trim() || undefined
                                    }
                                    : l
                            )
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
                                notes: state.notes?.trim() || undefined,
                                tooltip: state.tooltip?.trim() || undefined
                            }
                            : l
                    )
                };
            }));
        }

        setEditingLinkId(null);
        setEditLinkState({});
        setShowUserPicker(prev => ({ ...prev, [linkId]: false }));
    };

    const updateEditLinkState = (linkId: string, field: 'label' | 'url' | 'visibility' | 'allowedUsers' | 'notes' | 'tooltip', value: string | LinkVisibility | number[]) => {
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

    const handleMoveLink = (tabId: string, sectionId: string, linkId: string, direction: 'up' | 'down') => {
        if (editTabs.length > 0) {
            // New structure with tabs
            setEditTabs(editTabs.map(tab => {
                if (tab.id !== tabId) return tab;

                return {
                    ...tab,
                    sections: tab.sections.map(s => {
                        if (s.id !== sectionId) return s;

                        const index = s.links.findIndex(l => l.id === linkId);
                        if (index === -1) return s;

                        const newIndex = direction === 'up' ? index - 1 : index + 1;
                        if (newIndex < 0 || newIndex >= s.links.length) return s;

                        const newLinks = [...s.links];
                        [newLinks[index], newLinks[newIndex]] = [newLinks[newIndex], newLinks[index]];
                        return { ...s, links: newLinks };
                    })
                };
            }));
        } else {
            // Backward compatibility: sections without tabs
            setEditSections(editSections.map(s => {
                if (s.id !== sectionId) return s;

                const index = s.links.findIndex(l => l.id === linkId);
                if (index === -1) return s;

                const newIndex = direction === 'up' ? index - 1 : index + 1;
                if (newIndex < 0 || newIndex >= s.links.length) return s;

                const newLinks = [...s.links];
                [newLinks[index], newLinks[newIndex]] = [newLinks[newIndex], newLinks[index]];
                return { ...s, links: newLinks };
            }));
        }
    };

    const handleCloneLink = (tabId: string, sectionId: string, linkId: string) => {
        setEditTabs(editTabs.map(tab => {
            if (tab.id !== tabId) return tab;

            return {
                ...tab,
                sections: tab.sections.map(section => {
                    if (section.id !== sectionId) return section;

                    const linkToClone = section.links.find(l => l.id === linkId);
                    if (!linkToClone) return section;

                    // Clone the link with a new ID
                    const clonedLink: Link = {
                        id: generateId(),
                        label: `${linkToClone.label} (Copy)`,
                        url: linkToClone.url,
                        icon: linkToClone.icon,
                        visibility: linkToClone.visibility,
                        allowedUsers: linkToClone.allowedUsers ? [...linkToClone.allowedUsers] : undefined,
                        notes: linkToClone.notes,
                        tooltip: linkToClone.tooltip,
                        health: linkToClone.health
                    };

                    // Insert cloned link after the original
                    const index = section.links.findIndex(l => l.id === linkId);
                    const newLinks = [
                        ...section.links.slice(0, index + 1),
                        clonedLink,
                        ...section.links.slice(index + 1)
                    ];

                    return { ...section, links: newLinks };
                })
            };
        }));
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
    const handleCheckTileHealth = async () => {
        setCheckingHealth(true);
        try {
            const results = await linkHealthService.checkTileLinks(tile.id);
            setLinkHealth(prev => ({ ...prev, ...results }));
        } catch (error) {
            console.error('Failed to check tile health:', error);
            alert('Failed to check link health. Please try again.');
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

    // Initialize selected tab to first tab if tabs exist
    useEffect(() => {
        if (tile.tabs && tile.tabs.length > 0 && !selectedTabId) {
            // Sort tabs by position and select the first one
            const sortedTabs = [...tile.tabs].sort((a, b) => (a.position || 0) - (b.position || 0));
            if (sortedTabs.length > 0) {
                setSelectedTabId(sortedTabs[0].id);
            }
        }
    }, [tile.tabs, selectedTabId]);

    const getFilteredSections = () => {
        let sectionsToFilter = [];

        // If tabs exist, show sections from selected tab (or first tab if none selected yet)
        if (tile.tabs && tile.tabs.length > 0) {
            const sortedTabs = [...tile.tabs].sort((a, b) => (a.position || 0) - (b.position || 0));
            const tabIdToUse = selectedTabId || (sortedTabs.length > 0 ? sortedTabs[0].id : null);
            if (tabIdToUse) {
                const selectedTab = tile.tabs.find(tab => tab.id === tabIdToUse);
                sectionsToFilter = selectedTab ? selectedTab.sections : [];
            }
        } else {
            // Otherwise, get all sections (backward compatibility - no tabs)
            sectionsToFilter = getAllSections();
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

    // Get tabs for view mode (for tab navigation) - sort by position
    const displayTabs = tile.tabs && tile.tabs.length > 0
        ? [...tile.tabs].sort((a, b) => (a.position || 0) - (b.position || 0))
        : null;


    // VIEW MODE
    if (!isEditing) {
        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 min-h-[80vh] flex flex-col w-full pb-10">

                {/* Compact Modern Header */}
                <div className="linknest-content-header relative rounded-2xl overflow-hidden mb-6 group border border-slate-200 dark:border-slate-700/50 shadow-lg dark:shadow-none">
                    {/* Ambient Background */}
                    <div className={`absolute inset-0 bg-gradient-to-r ${styles.gradient} opacity-90 dark:opacity-20`}></div>
                    {/* Light mode overlay to make text readable on intense gradients, dark mode transparent */}
                    <div className="absolute inset-0 bg-white/10 dark:bg-slate-900/60 backdrop-blur-md"></div>

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
                                className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center gap-2 backdrop-blur-sm"
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
                                onClick={handleCheckTileHealth}
                                disabled={checkingHealth}
                                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center gap-2 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Check all links in this tile"
                            >
                                {checkingHealth ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                        </svg>
                                        Check Links
                                    </>
                                )}
                            </button>

                            {isAuthenticated && tile.canEdit && (
                                <>
                                    <button
                                        onClick={() => {
                                            if (!tile.canEdit) {
                                                alert('You do not have permission to edit this tile.');
                                                return;
                                            }
                                            setIsEditing(true);
                                        }}
                                        className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center gap-2 backdrop-blur-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                        </svg>
                                        Edit
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!isAuthenticated) {
                                                if (onAuthRequired) onAuthRequired();
                                                return;
                                            }
                                            if (!tile.canEdit) {
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
                                        className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium border border-white/20 transition-all shadow-sm flex items-center gap-2 backdrop-blur-sm"
                                        title="Clone this space"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                        </svg>
                                        Clone
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => window.location.hash = '#/'}
                                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all backdrop-blur-sm"
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
                                    const tabLinksCount = tabSections.reduce((acc, s) => acc + (s.links?.length || 0), 0);

                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setSelectedTabId(tab.id)}
                                            data-active={isActive}
                                            className={`linknest-content-tab relative px-5 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap rounded-lg ${isActive
                                                ? `${styles.text} font-semibold`
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
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
                        <div className={viewLayout === 'stacked' ? 'space-y-8' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
                            {filteredSections.map((section, sectionIndex) => (
                                <div key={section.id} className="linknest-content-section animate-in fade-in slide-in-from-bottom-2 bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-200/80 dark:border-slate-700/50 p-6 shadow-sm">
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

                                    {/* Links Grid */}
                                    <div className="linknest-content-link-grid">
                                        {section.links.map((link, linkIndex) => {
                                            const health = linkHealth[link.id];
                                            const isBroken = health?.status === 'broken';
                                            const animationDelay = (sectionIndex * 100) + (linkIndex * 30);

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
                                                        🔗
                                                    </div>

                                                    <a
                                                        href={link.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-1 min-w-0 block focus:outline-none"
                                                    >
                                                        <h4 className={`linknest-content-link-title text-sm font-semibold ${styles.text} group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors`}>
                                                            {link.label}
                                                        </h4>
                                                        <div className="linknest-content-link-domain flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors mt-0.5">
                                                            <span className="break-words">
                                                                {link.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                                            </span>
                                                            {link.visibility && link.visibility !== 'public' && (
                                                                <span
                                                                    className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${link.visibility === 'authenticated'
                                                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                                                        : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                                                                        }`}
                                                                    title={link.visibility === 'authenticated' ? 'Authenticated users only' : 'Private - specific users only'}
                                                                >
                                                                    {link.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                </span>
                                                            )}
                                                            {isBroken && (
                                                                <span className="text-red-500 text-xs font-medium flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                                                    Broken
                                                                </span>
                                                            )}
                                                        </div>
                                                    </a>

                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 px-1">
                                                        {/* Re-check button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleCheckSingleLink(link.id);
                                                            }}
                                                            disabled={checkingLinkId === link.id}
                                                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
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
                                                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all relative"
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
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // EDIT MODE - Only show if user has edit permission
    if (isEditing && tile.canEdit) {
        return (
            <div className="animate-in fade-in zoom-in duration-300 w-full">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Edit Page: {editTitle}</h1>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveChanges}
                            disabled={editVisibility === 'private' && editAllowedUsers.length === 0}
                            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-brand-500/20"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT COLUMN: General Settings & HTML Editor */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Basic Info Card */}
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4 sticky top-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">General Settings</h3>
                            <div className="flex gap-4">
                                <div className="w-24 relative">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Emoji</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className="w-full h-[42px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500"
                                    >
                                        {editEmoji || '✨'}
                                    </button>
                                    {showEmojiPicker && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
                                            <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 flex flex-col overflow-hidden">
                                                <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                                    <input
                                                        type="text"
                                                        value={editEmoji}
                                                        onChange={(e) => setEditEmoji(e.target.value)}
                                                        placeholder="Type emoji..."
                                                        className="w-full text-sm px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 dark:text-white"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-6 gap-1">
                                                    {POPULAR_EMOJIS.map((emoji) => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => { setEditEmoji(emoji); setShowEmojiPicker(false); }}
                                                            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
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
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Page Title</label>
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none font-bold text-lg"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Theme Color</label>
                                <div className="flex gap-2 flex-wrap">
                                    {THEME_COLORS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setEditColor(color)}
                                            className={`
                                w-8 h-8 rounded-full border-2 transition-all relative overflow-hidden
                                ${editColor === color ? 'border-brand-500 scale-110' : 'border-transparent hover:scale-105'} 
                            `}
                                        >
                                            <div className={`absolute inset-0 ${COLOR_STYLES[color].base}`}></div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Card Description</label>
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    rows={2}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-600 dark:text-slate-300 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                                    placeholder="Brief summary..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Intro Content (HTML)</label>
                                <textarea
                                    value={editHtml}
                                    onChange={(e) => setEditHtml(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-4 text-slate-600 dark:text-slate-300 font-mono text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none leading-relaxed h-40"
                                    placeholder="<p>Welcome to my page!</p>"
                                />
                            </div>

                            {/* Visibility Settings */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Visibility</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tileVisibility"
                                            value="public"
                                            checked={editVisibility === 'public'}
                                            onChange={(e) => {
                                                setEditVisibility(e.target.value as TileVisibility);
                                                setShowTileUserSelector(false);
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tileVisibility"
                                            value="authenticated"
                                            checked={editVisibility === 'authenticated'}
                                            onChange={(e) => {
                                                setEditVisibility(e.target.value as TileVisibility);
                                                setShowTileUserSelector(false);
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tileVisibility"
                                            value="private"
                                            checked={editVisibility === 'private'}
                                            onChange={(e) => {
                                                setEditVisibility(e.target.value as TileVisibility);
                                                setShowTileUserSelector(true);
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                                    </label>
                                </div>

                                {/* User Selector for Private Visibility */}
                                {editVisibility === 'private' && isAuthenticated && (
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Select Users</label>
                                            <button
                                                type="button"
                                                onClick={() => setShowTileUserSelector(!showTileUserSelector)}
                                                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                            >
                                                {showTileUserSelector ? 'Hide' : 'Show'} Users
                                            </button>
                                        </div>
                                        {editAllowedUsers.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {editAllowedUsers.map(userId => {
                                                    const user = usersList.find(u => u.id === userId);
                                                    return (
                                                        <span
                                                            key={userId}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded text-xs"
                                                        >
                                                            {user?.username || `User ${userId}`}
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditAllowedUsers(editAllowedUsers.filter(id => id !== userId))}
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
                                            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                {loadingUsers ? (
                                                    <div className="text-xs text-slate-500 text-center py-2">Loading users...</div>
                                                ) : usersList.length === 0 ? (
                                                    <div className="text-xs text-slate-500 text-center py-2">No users available</div>
                                                ) : (
                                                    usersList.map(user => (
                                                        <label
                                                            key={user.id}
                                                            className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={editAllowedUsers.includes(user.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setEditAllowedUsers([...editAllowedUsers, user.id]);
                                                                    } else {
                                                                        setEditAllowedUsers(editAllowedUsers.filter(id => id !== user.id));
                                                                    }
                                                                }}
                                                                className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                                                            />
                                                            <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                                            {user.auth_source && user.auth_source !== 'local' && (
                                                                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-semibold">
                                                                    {user.auth_source.toUpperCase()}
                                                                </span>
                                                            )}
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                        {editVisibility === 'private' && editAllowedUsers.length === 0 && (
                                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Please select at least one user for private spaces</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Tab and Section Manager */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Manage Tabs & Sections</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddTab}
                                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Add Tab
                                </button>
                            </div>
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
                                editTabs.map((tab, tabIndex) => (
                                    <div id={`tab-${tab.id}`} key={tab.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm dark:shadow-black/20 scroll-mt-24">
                                        {/* Tab Header */}
                                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 flex gap-2 items-center">
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
                                                className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-bold text-lg focus:ring-0 placeholder-slate-400"
                                            />
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
                                            <button
                                                onClick={() => handleRemoveTab(tab.id)}
                                                className="text-slate-400 hover:text-red-500 p-2"
                                                title="Delete Tab"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Tab Sections */}
                                        <div className="p-4 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sections in this tab</h4>
                                                <button
                                                    onClick={() => handleAddSection(tab.id)}
                                                    className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-2"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                    </svg>
                                                    Add Section
                                                </button>
                                            </div>

                                            {tab.sections.map((section, sectionIndex) => (
                                                <div key={section.id} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                                    {/* Section Header */}
                                                    <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex gap-2 items-center">
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
                                                        <input
                                                            type="text"
                                                            value={section.title}
                                                            onChange={(e) => handleUpdateSectionTitle(tab.id, section.id, e.target.value)}
                                                            placeholder="Section Header (e.g. Resources)"
                                                            className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-semibold focus:ring-0 placeholder-slate-400"
                                                        />
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
                                                        <button
                                                            onClick={() => handleRemoveSection(tab.id, section.id)}
                                                            className="text-slate-400 hover:text-red-500 p-2"
                                                            title="Delete Section"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    </div>

                                                    {/* Section Links */}
                                                    <div className="p-4 bg-white dark:bg-slate-800">
                                                        <div className="space-y-2 mb-4">
                                                            {section.links.length === 0 && (
                                                                <p className="text-slate-400 dark:text-slate-600 text-sm italic py-2">No links in this section yet.</p>
                                                            )}
                                                            {section.links.map((link, linkIndex) => (
                                                                editingLinkId === link.id ? (
                                                                    // Edit Mode
                                                                    <div key={link.id} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-brand-500 dark:border-brand-500/50">
                                                                        <div className="flex gap-2 items-center">
                                                                            <input
                                                                                type="text"
                                                                                value={editLinkState[link.id]?.label || ''}
                                                                                onChange={(e) => updateEditLinkState(link.id, 'label', e.target.value)}
                                                                                placeholder="Link Label"
                                                                                className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                value={editLinkState[link.id]?.url || ''}
                                                                                onChange={(e) => updateEditLinkState(link.id, 'url', e.target.value)}
                                                                                placeholder="https://..."
                                                                                className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors font-mono"
                                                                            />
                                                                        </div>
                                                                        <div className="flex gap-2 items-center">
                                                                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Visibility:</label>
                                                                            <select
                                                                                value={editLinkState[link.id]?.visibility || 'public'}
                                                                                onChange={(e) => updateEditLinkState(link.id, 'visibility', e.target.value as LinkVisibility)}
                                                                                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
                                                                            >
                                                                                <option value="public">Public (visible to everyone)</option>
                                                                                <option value="authenticated">Authenticated (logged-in users only)</option>
                                                                                <option value="private">Private (specific users only)</option>
                                                                            </select>
                                                                        </div>
                                                                        <div className="flex gap-2 items-start">
                                                                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap pt-2">Notes:</label>
                                                                            <textarea
                                                                                value={editLinkState[link.id]?.notes || ''}
                                                                                onChange={(e) => updateEditLinkState(link.id, 'notes', e.target.value)}
                                                                                placeholder="Add notes or description for this link..."
                                                                                rows={2}
                                                                                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors resize-none"
                                                                            />
                                                                        </div>
                                                                        <div className="flex gap-2 items-center">
                                                                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Hover Tooltip:</label>
                                                                            <input
                                                                                type="text"
                                                                                value={editLinkState[link.id]?.tooltip || ''}
                                                                                onChange={(e) => updateEditLinkState(link.id, 'tooltip', e.target.value)}
                                                                                placeholder="Text shown on hover..."
                                                                                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
                                                                            />
                                                                        </div>
                                                                        {editLinkState[link.id]?.visibility === 'private' && (
                                                                            <div className="space-y-2">
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Select Users:</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setShowUserPicker(prev => ({ ...prev, [link.id]: !prev[link.id] }))}
                                                                                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                                                                    >
                                                                                        {showUserPicker[link.id] ? 'Hide' : 'Show'} Users
                                                                                    </button>
                                                                                </div>
                                                                                {editLinkState[link.id]?.allowedUsers && editLinkState[link.id]!.allowedUsers.length > 0 && (
                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                        {editLinkState[link.id]!.allowedUsers.map(userId => {
                                                                                            const user = usersList.find(u => u.id === userId);
                                                                                            return (
                                                                                                <span
                                                                                                    key={userId}
                                                                                                    className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded text-xs"
                                                                                                >
                                                                                                    {user?.username || `User ${userId}`}
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => toggleEditUserSelection(link.id, userId)}
                                                                                                        className="hover:text-red-600 dark:hover:text-red-400"
                                                                                                    >
                                                                                                        ×
                                                                                                    </button>
                                                                                                </span>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                )}
                                                                                {showUserPicker[link.id] && (
                                                                                    <div className="max-h-48 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                                        {loadingUsers ? (
                                                                                            <div className="text-xs text-slate-500 text-center py-2">Loading users...</div>
                                                                                        ) : usersList.length === 0 ? (
                                                                                            <div className="text-xs text-slate-500 text-center py-2">No users available</div>
                                                                                        ) : (
                                                                                            usersList.map(user => (
                                                                                                <label
                                                                                                    key={user.id}
                                                                                                    className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer"
                                                                                                >
                                                                                                    <input
                                                                                                        type="checkbox"
                                                                                                        checked={editLinkState[link.id]?.allowedUsers?.includes(user.id) || false}
                                                                                                        onChange={() => toggleEditUserSelection(link.id, user.id)}
                                                                                                        className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                                                                                                    />
                                                                                                    <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                                                                                    {user.auth_source === 'ldap' ? (
                                                                                                        <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-semibold">
                                                                                                            LDAP
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                                                                                                            Local
                                                                                                        </span>
                                                                                                    )}
                                                                                                </label>
                                                                                            ))
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex gap-2 justify-end">
                                                                            <button
                                                                                onClick={handleCancelEditLink}
                                                                                className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUpdateLink(tab.id, section.id, link.id)}
                                                                                disabled={!editLinkState[link.id]?.label?.trim() || !editLinkState[link.id]?.url?.trim()}
                                                                                className="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                                                                            >
                                                                                Save
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    // View Mode
                                                                    <div key={link.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                                                        {/* Link Reorder Buttons */}
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <button
                                                                                onClick={() => handleMoveLink(tab.id, section.id, link.id, 'up')}
                                                                                disabled={linkIndex === 0}
                                                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                                                title="Move Up"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                                                </svg>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleMoveLink(tab.id, section.id, link.id, 'down')}
                                                                                disabled={linkIndex === section.links.length - 1}
                                                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                                                title="Move Down"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                                </svg>
                                                                            </button>
                                                                        </div>
                                                                        <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">🔗</div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{link.label}</div>
                                                                                {link.visibility && link.visibility !== 'public' && (
                                                                                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${link.visibility === 'authenticated'
                                                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                                                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                                                                        }`}>
                                                                                        {link.visibility === 'authenticated' ? '🔒' : '🔐'}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-xs text-slate-500 truncate font-mono">{link.url}</div>
                                                                        </div>
                                                                        <div className="flex gap-1">
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
                                                                                onClick={() => handleRemoveLinkFromSection(tab.id, section.id, link.id)}
                                                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                                                title="Delete Link"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                                                </svg>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            ))}
                                                        </div>

                                                        {/* Inline Add Form */}
                                                        <div className="space-y-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
                                                            <div className="flex gap-2 items-center">
                                                                <input
                                                                    type="text"
                                                                    value={newLinkState[section.id]?.label || ''}
                                                                    onChange={(e) => updateNewLinkState(section.id, 'label', e.target.value)}
                                                                    placeholder="Link Label"
                                                                    className="flex-1 min-w-0 bg-transparent border-b border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white px-2 py-1 focus:border-brand-500 focus:outline-none transition-colors"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={newLinkState[section.id]?.url || ''}
                                                                    onChange={(e) => updateNewLinkState(section.id, 'url', e.target.value)}
                                                                    placeholder="https://..."
                                                                    className="flex-1 min-w-0 bg-transparent border-b border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white px-2 py-1 focus:border-brand-500 focus:outline-none transition-colors font-mono"
                                                                />
                                                                <button
                                                                    onClick={() => handleAddLinkToSection(tab.id, section.id)}
                                                                    disabled={!newLinkState[section.id]?.label || !newLinkState[section.id]?.url}
                                                                    className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-md transition-colors"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                            <div className="flex gap-2 items-start">
                                                                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap pt-1.5">Notes:</label>
                                                                <textarea
                                                                    value={newLinkState[section.id]?.notes || ''}
                                                                    onChange={(e) => updateNewLinkState(section.id, 'notes', e.target.value)}
                                                                    placeholder="Add notes or description for this link..."
                                                                    rows={2}
                                                                    className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors resize-none"
                                                                />
                                                            </div>
                                                            <div className="flex gap-2 items-center">
                                                                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Hover Tooltip:</label>
                                                                <input
                                                                    type="text"
                                                                    value={newLinkState[section.id]?.tooltip || ''}
                                                                    onChange={(e) => updateNewLinkState(section.id, 'tooltip', e.target.value)}
                                                                    placeholder="Text shown on hover..."
                                                                    className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
                                                                />
                                                            </div>
                                                            <div className="flex gap-2 items-center">
                                                                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Visibility:</label>
                                                                <select
                                                                    value={newLinkState[section.id]?.visibility || 'public'}
                                                                    onChange={(e) => updateNewLinkState(section.id, 'visibility', e.target.value as LinkVisibility)}
                                                                    className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
                                                                >
                                                                    <option value="public">Public (visible to everyone)</option>
                                                                    <option value="authenticated">Authenticated (logged-in users only)</option>
                                                                    <option value="private">Private (specific users only)</option>
                                                                </select>
                                                            </div>
                                                            {(newLinkState[section.id]?.visibility || 'public') === 'private' && (
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Select Users:</label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowUserPicker(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                                                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                                                        >
                                                                            {showUserPicker[section.id] ? 'Hide' : 'Show'} Users
                                                                        </button>
                                                                    </div>
                                                                    {newLinkState[section.id]?.allowedUsers && newLinkState[section.id]!.allowedUsers.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {newLinkState[section.id]!.allowedUsers.map(userId => {
                                                                                const user = usersList.find(u => u.id === userId);
                                                                                return (
                                                                                    <span
                                                                                        key={userId}
                                                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded text-xs"
                                                                                    >
                                                                                        {user?.username || `User ${userId}`}
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => toggleUserSelection(section.id, userId)}
                                                                                            className="hover:text-red-600 dark:hover:text-red-400"
                                                                                        >
                                                                                            ×
                                                                                        </button>
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                    {showUserPicker[section.id] && (
                                                                        <div className="max-h-48 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                                                                            {loadingUsers ? (
                                                                                <div className="text-xs text-slate-500 text-center py-2">Loading users...</div>
                                                                            ) : usersList.length === 0 ? (
                                                                                <div className="text-xs text-slate-500 text-center py-2">No users available</div>
                                                                            ) : (
                                                                                usersList.map(user => (
                                                                                    <label
                                                                                        key={user.id}
                                                                                        className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer"
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={newLinkState[section.id]?.allowedUsers?.includes(user.id) || false}
                                                                                            onChange={() => toggleUserSelection(section.id, user.id)}
                                                                                            className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                                                                                        />
                                                                                        <span className="text-sm text-slate-700 dark:text-slate-300">{user.username}</span>
                                                                                        {user.auth_source === 'ldap' ? (
                                                                                            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-semibold">
                                                                                                LDAP
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                                                                                                Local
                                                                                            </span>
                                                                                        )}
                                                                                    </label>
                                                                                ))
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {tab.sections.length === 0 && (
                                                <div className="text-center py-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 text-sm">
                                                    <p>No sections in this tab. Click "Add Section" to get started.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                // Backward compatibility: Render sections without tabs
                                editSections.map((section, index) => (
                                    <div key={section.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm dark:shadow-black/20">
                                        {/* Section Header */}
                                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 flex gap-2 items-center">
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
                                                    if (confirm('Delete this section and all its links?')) {
                                                        setEditSections(editSections.filter(s => s.id !== section.id));
                                                    }
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
                                ))
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

                                        <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                            <input
                                                type="radio"
                                                name="tabVisibility"
                                                checked={tab.visibility === 'private'}
                                                onChange={() => handleUpdateTabVisibility(tab.id, 'private', tab.allowedUsers || [])}
                                                className="w-4 h-4"
                                            />
                                            <div>
                                                <div className="font-semibold text-slate-900 dark:text-white">🔐 Private</div>
                                                <div className="text-xs text-slate-500">Specific users only</div>
                                            </div>
                                        </label>
                                    </div>

                                    {tab.visibility === 'private' && (
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Users:</label>
                                            <div className="max-h-48 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
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
                                                                handleUpdateTabVisibility(tab.id, 'private', newUsers);
                                                            }}
                                                            className="rounded"
                                                        />
                                                        <span className="text-sm">{user.username}</span>
                                                    </label>
                                                ))}
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

                                        <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer transition-colors">
                                            <input
                                                type="radio"
                                                name="sectionVisibility"
                                                checked={section.visibility === 'private'}
                                                onChange={() => handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', section.allowedUsers || [])}
                                                className="w-4 h-4"
                                            />
                                            <div>
                                                <div className="font-semibold text-slate-900 dark:text-white">🔐 Private</div>
                                                <div className="text-xs text-slate-500">Specific users only</div>
                                            </div>
                                        </label>
                                    </div>

                                    {section.visibility === 'private' && (
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Users:</label>
                                            <div className="max-h-48 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-lg p-2 space-y-1">
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
                                                                handleUpdateSectionVisibility(visibilityDialogSection.tabId, section.id, 'private', newUsers);
                                                            }}
                                                            className="rounded"
                                                        />
                                                        <span className="text-sm">{user.username}</span>
                                                    </label>
                                                ))}
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

                </div>
            </div>
        );
    }

    // Fallback: if somehow in edit mode without permission, return view mode
    // (useEffect will handle resetting isEditing state)
    return null;
};