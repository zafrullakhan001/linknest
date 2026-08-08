import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChatMessage, getMessages, sendMessage, sendTile, deleteMessage } from '../services/chatService';
import { Tile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { authService, UserListItem } from '../services/authService';
import { createTile, saveTile } from '../services/storageService';
import { parseSpaceExportObject, normalizeImportedTiles } from '../services/spaceTransferService';
import { generateUuid } from '../services/idService';

interface ChatWidgetProps {
  tiles: Tile[];
  onTileShared?: (tile: Tile) => void;
  onTileImported?: () => void;
  onClose?: () => void;
  onUnreadChange?: (hasUnread: boolean) => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tiles, onTileShared, onTileImported, onClose, onUnreadChange }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<number | null>(null); // null for public chat
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [showTileSelector, setShowTileSelector] = useState(false);
  const [showJsonInput, setShowJsonInput] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(true);
  const [jsonInput, setJsonInput] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [duplicateDialog, setDuplicateDialog] = useState<{ 
    existingTile: Tile; 
    newTile: Tile; 
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Escape key handler to close widget
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Don't close if modals/dialogs are open
        if (showTileSelector || showJsonInput || duplicateDialog) {
          return;
        }
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose, showTileSelector, showJsonInput, duplicateDialog]);
  
  // Get last seen message ID from localStorage, or initialize to 0
  const getLastSeenMessageId = (): number => {
    if (!user) return 0;
    const stored = localStorage.getItem(`linknest_last_seen_message_${user.id}`);
    return stored ? parseInt(stored, 10) : 0;
  };
  
  const setLastSeenMessageId = (id: number) => {
    if (!user) return;
    localStorage.setItem(`linknest_last_seen_message_${user.id}`, id.toString());
  };
  
  const lastSeenMessageIdRef = useRef<number>(getLastSeenMessageId());

  // Filter users based on search term
  const filteredUsers = useMemo(() => {
    if (!userSearchTerm.trim()) {
      return users;
    }
    const searchLower = userSearchTerm.toLowerCase();
    return users.filter(u => 
      u.username.toLowerCase().includes(searchLower)
    );
  }, [users, userSearchTerm]);

  // Filter messages based on search term
  const filteredMessages = useMemo(() => {
    if (!messageSearchTerm.trim()) {
      return messages;
    }
    const searchLower = messageSearchTerm.toLowerCase();
    return messages.filter(m => 
      m.username.toLowerCase().includes(searchLower) ||
      m.message?.toLowerCase().includes(searchLower) ||
      m.tile_data?.title?.toLowerCase().includes(searchLower) ||
      m.tile_data?.description?.toLowerCase().includes(searchLower)
    );
  }, [messages, messageSearchTerm]);

  // Filter tiles based on sharing permissions:
  // - Regular users: can only share tiles from their private tab (visibility === 'private' && user has access)
  // - Admins: can share tiles from any tab (all tiles)
  const shareableTiles = useMemo(() => {
    if (!user) return [];

    // Admins can share all tiles
    if (user.is_admin === true) {
      return tiles;
    }

    // Regular users can only share private tiles they have access to
    return tiles.filter(tile => {
      // Only private tiles
      if (tile.visibility !== 'private') {
        return false;
      }

      // Check if user has access to this private tile
      // Either canView is true OR user ID is in allowedUsers array
      if (tile.canView === true) {
        return true;
      }

      if (Array.isArray(tile.allowedUsers) && tile.allowedUsers.includes(user.id)) {
        return true;
      }

      return false;
    });
  }, [tiles, user]);

  // Load users list function
  const loadUsers = async () => {
    try {
      const fetchedUsers = await authService.getUsers();
      // Filter out current user from the list
      const otherUsers = fetchedUsers.filter(u => u.id !== user?.id);
      setUsers(otherUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  // Load users list on mount
  useEffect(() => {
    if (user) {
      loadUsers();
    }
  }, [user]);

  // Load messages when chat widget is rendered or recipient changes
  useEffect(() => {
    loadMessages();
    // Poll for new messages every 3 seconds
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedRecipient]);

  // Mark existing messages as read when widget first opens or recipient changes
  useEffect(() => {
    if (messages.length > 0 && user && onUnreadChange) {
      const maxId = Math.max(...messages.map(m => m.id));
      if (maxId > lastSeenMessageIdRef.current) {
        lastSeenMessageIdRef.current = maxId;
        setLastSeenMessageId(maxId);
        onUnreadChange(false);
      }
    }
  }, [selectedRecipient, messages, user, onUnreadChange]); // Run when recipient changes or messages load

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Track unread messages and notify parent
  useEffect(() => {
    if (!user || !onUnreadChange) return;
    
    // Check for unread messages (messages from other users that are newer than last seen)
    const unreadMessages = messages.filter(msg => 
      msg.user_id !== user.id && 
      msg.id > lastSeenMessageIdRef.current
    );
    
    const hasUnread = unreadMessages.length > 0;
    onUnreadChange(hasUnread);
  }, [messages, user, onUnreadChange]);

  // Mark new messages as read when they arrive while widget is open
  useEffect(() => {
    if (messages.length > 0 && user) {
      const maxId = Math.max(...messages.map(m => m.id));
      if (maxId > lastSeenMessageIdRef.current) {
        lastSeenMessageIdRef.current = maxId;
        setLastSeenMessageId(maxId);
        // Clear unread status since we're viewing the messages
        if (onUnreadChange) {
          onUnreadChange(false);
        }
      }
    }
  }, [messages, user, onUnreadChange]);
  
  // Initialize last seen message ID from localStorage on mount
  useEffect(() => {
    if (user) {
      lastSeenMessageIdRef.current = getLastSeenMessageId();
    }
  }, [user]);

  const loadMessages = async () => {
    try {
      const fetchedMessages = await getMessages(100, 0, selectedRecipient);
      setMessages(fetchedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && !selectedTile && !jsonInput.trim()) return;

    setIsLoading(true);
    try {
      if (selectedTile) {
        // Send tile
        await sendTile(selectedTile, selectedRecipient);
        if (onTileShared) {
          onTileShared(selectedTile);
        }
        setSelectedTile(null);
      } else if (jsonInput.trim()) {
        // Try to parse JSON and send
        try {
          const jsonData = JSON.parse(jsonInput);
          await sendMessage('', jsonData, selectedRecipient);
          setJsonInput('');
          setShowJsonInput(false);
        } catch (e) {
          // If not valid JSON, send as text message
          await sendMessage(jsonInput, undefined, selectedRecipient);
          setJsonInput('');
          setShowJsonInput(false);
        }
      } else {
        // Send text message
        await sendMessage(inputMessage, undefined, selectedRecipient);
        setInputMessage('');
      }
      await loadMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      await deleteMessage(messageId);
      await loadMessages();
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message. Please try again.');
    }
  };

  const handleImportTile = async (tileData: any, action?: 'duplicate' | 'overwrite' | 'merge') => {
    // If action is provided, it means we're handling a duplicate
    if (!action && !confirm('Import this tile into your workspace?')) return;

    try {
      // Ensure tileData has required structure
      if (!tileData || typeof tileData !== 'object') {
        alert('Invalid tile data. Unable to import.');
        return;
      }

      // Ensure arrays exist for tabs and sections to avoid map errors
      const cleanedTileData = {
        ...tileData,
        tabs: Array.isArray(tileData.tabs) ? tileData.tabs : [],
        sections: Array.isArray(tileData.sections) ? tileData.sections : []
      };

      // Create a ParsedSpaceImport object for normalizeImportedTiles
      const parsed: any = {
        type: 'tile',
        tiles: [cleanedTileData],
        categoryName: 'Imported'
      };
      
      // Normalize the tile data
      const normalizedTiles = normalizeImportedTiles(parsed);
      
      if (!normalizedTiles || normalizedTiles.length === 0) {
        alert('Invalid tile data. Unable to import.');
        return;
      }

      const tileToImport = normalizedTiles[0];
      
      // Check for existing tile with same title in user's private "Imported" category
      if (!action && user?.id) {
        const existingTile = tiles.find(t => 
          t.title === tileToImport.title && 
          t.group === 'Imported' && 
          t.visibility === 'private' &&
          t.canView === true &&
          Array.isArray(t.allowedUsers) && 
          t.allowedUsers.includes(user.id)
        );

        if (existingTile) {
          // Show duplicate dialog
          setDuplicateDialog({
            existingTile,
            newTile: tileToImport
          });
          return;
        }
      }

      // Handle duplicate actions
      if (action && duplicateDialog) {
        // Use the already normalized tile from duplicateDialog when available
        const tileForAction = duplicateDialog.newTile || tileToImport;
        
        if (action === 'overwrite') {
          // Update existing tile with new tile data
          const updatedTile = {
            ...duplicateDialog.existingTile,
            ...tileForAction,
            id: duplicateDialog.existingTile.id, // Keep existing ID
            createdAt: duplicateDialog.existingTile.createdAt // Keep original creation date
          };
          
          // Ensure arrays are properly set
          if (!Array.isArray(updatedTile.tabs)) {
            updatedTile.tabs = [];
          }
          if (!Array.isArray(updatedTile.sections)) {
            updatedTile.sections = [];
          }
          
          await saveTile(updatedTile);
          setDuplicateDialog(null);
          
          if (onTileImported) {
            onTileImported();
          }
          alert('Tile overwritten successfully!');
          return;
        } else if (action === 'merge') {
          // Merge links from new tile into existing tile
          const existingTile = duplicateDialog.existingTile;
          const newTile = tileForAction;
          
          // Merge tabs
          const mergedTabs = [...(existingTile.tabs || [])];
          
          // Process new tile tabs
          if (newTile.tabs && newTile.tabs.length > 0) {
            for (const newTab of newTile.tabs) {
              // Find or create matching tab
              let existingTab = mergedTabs.find(t => t.title === newTab.title);
              if (!existingTab) {
                // Create new tab
                existingTab = {
                  ...newTab,
                  id: Math.random().toString(36).substring(2, 9),
                  position: mergedTabs.length
                };
                mergedTabs.push(existingTab);
              } else {
                // Merge sections into existing tab
                const mergedSections = [...(existingTab.sections || [])];
                
                if (newTab.sections && newTab.sections.length > 0) {
                  for (const newSection of newTab.sections) {
                    // Find or create matching section
                    let existingSection = mergedSections.find(s => s.title === newSection.title);
                    if (!existingSection) {
                      // Create new section
                      existingSection = {
                        ...newSection,
                        id: Math.random().toString(36).substring(2, 9),
                        links: newSection.links ? [...newSection.links] : [],
                        richTextContent: newSection.richTextContent ? [...newSection.richTextContent] : undefined
                      };
                      mergedSections.push(existingSection);
                    } else {
                      // Merge links into existing section (avoid duplicates by URL)
                      const existingLinks = existingSection.links || [];
                      const existingUrls = new Set(existingLinks.map(l => l.url));
                      
                      const newLinks = (newSection.links || []).filter(l => !existingUrls.has(l.url));
                      
                      existingSection.links = [...existingLinks, ...newLinks.map(l => ({
                        ...l,
                        id: Math.random().toString(36).substring(2, 9)
                      }))];
                      
                      // Merge rich text content
                      if (newSection.richTextContent && newSection.richTextContent.length > 0) {
                        const existingRichText = existingSection.richTextContent || [];
                        existingSection.richTextContent = [
                          ...existingRichText,
                          ...newSection.richTextContent.map(rt => ({
                            ...rt,
                            id: Math.random().toString(36).substring(2, 9)
                          }))
                        ];
                      }
                    }
                  }
                }
                
                existingTab.sections = mergedSections;
              }
            }
          }
          
          // Also handle legacy sections (backward compatibility)
          const mergedSections = [...(existingTile.sections || [])];
          if (newTile.sections && newTile.sections.length > 0) {
            for (const newSection of newTile.sections) {
              let existingSection = mergedSections.find(s => s.title === newSection.title);
              if (!existingSection) {
                existingSection = {
                  ...newSection,
                  id: Math.random().toString(36).substring(2, 9),
                  links: newSection.links ? [...newSection.links] : [],
                  richTextContent: newSection.richTextContent ? [...newSection.richTextContent] : undefined
                };
                mergedSections.push(existingSection);
              } else {
                const existingLinks = existingSection.links || [];
                const existingUrls = new Set(existingLinks.map(l => l.url));
                const newLinks = (newSection.links || []).filter(l => !existingUrls.has(l.url));
                
                existingSection.links = [...existingLinks, ...newLinks.map(l => ({
                  ...l,
                  id: Math.random().toString(36).substring(2, 9)
                }))];
                
                if (newSection.richTextContent && newSection.richTextContent.length > 0) {
                  const existingRichText = existingSection.richTextContent || [];
                  existingSection.richTextContent = [
                    ...existingRichText,
                    ...newSection.richTextContent.map(rt => ({
                      ...rt,
                      id: Math.random().toString(36).substring(2, 9)
                    }))
                  ];
                }
              }
            }
          }
          
          // Update existing tile with merged data
          const mergedTile: Tile = {
            ...existingTile,
            tabs: mergedTabs.length > 0 ? mergedTabs : undefined,
            sections: mergedSections,
            // Preserve existing tile properties but update with new decoration if provided
            tileBackgroundColor: newTile.tileBackgroundColor ?? existingTile.tileBackgroundColor,
            tileGradientEnabled: newTile.tileGradientEnabled ?? existingTile.tileGradientEnabled,
            tileGradientColors: newTile.tileGradientColors ?? existingTile.tileGradientColors,
            tileGradientDirection: newTile.tileGradientDirection ?? existingTile.tileGradientDirection,
            tileGradientType: newTile.tileGradientType ?? existingTile.tileGradientType,
            tileGradientColorPositions: newTile.tileGradientColorPositions ?? existingTile.tileGradientColorPositions,
            tileBorderRadius: newTile.tileBorderRadius ?? existingTile.tileBorderRadius,
            tileTextColor: newTile.tileTextColor ?? existingTile.tileTextColor
          };
          
          await saveTile(mergedTile);
          setDuplicateDialog(null);
          
          if (onTileImported) {
            onTileImported();
          }
          alert('Tile merged successfully! New links have been added to the existing tile.');
          return;
        }
      }

      // Default: create new tile (or duplicate if action === 'duplicate')
      // Generate new ID and timestamp
      tileToImport.id = generateUuid();
      tileToImport.createdAt = Date.now();
      
      // If duplicate action, add "- Copy-N" suffix to the title
      if (action === 'duplicate' && user?.id) {
        const baseTitle = tileToImport.title;
        // Check for existing tiles with the same base title or "Copy" pattern in Imported category
        const existingTilesInCategory = tiles.filter(t => 
          t.group === 'Imported' && 
          t.visibility === 'private' &&
          t.canView === true &&
          Array.isArray(t.allowedUsers) && 
          t.allowedUsers.includes(user.id) &&
          (t.title === baseTitle || t.title.startsWith(baseTitle + ' - Copy'))
        );
        
        // Extract copy numbers from existing titles
        const copyNumbers: number[] = [];
        existingTilesInCategory.forEach(t => {
          if (t.title === baseTitle) {
            // Original tile exists (no copy suffix)
            copyNumbers.push(0);
          } else if (t.title.startsWith(baseTitle + ' - Copy')) {
            // Extract number from " - Copy-N" pattern
            const match = t.title.match(/ - Copy-(\d+)$/);
            if (match) {
              copyNumbers.push(parseInt(match[1], 10));
            } else {
              // Just "- Copy" without number (treat as Copy-1)
              copyNumbers.push(1);
            }
          }
        });
        
        // Find the next available copy number
        let nextCopyNumber = 1;
        if (copyNumbers.length > 0) {
          const maxCopyNumber = Math.max(...copyNumbers);
          nextCopyNumber = maxCopyNumber + 1;
        }
        
        // Add suffix to title
        tileToImport.title = `${baseTitle} - Copy-${nextCopyNumber}`;
      }
      
      // Set imported tile to private visibility and "Imported" category
      tileToImport.visibility = 'private';
      tileToImport.group = 'Imported';
      
      // Set allowedUsers to include current user so the tile is visible to them
      if (user && user.id) {
        tileToImport.allowedUsers = [user.id];
      }
      
      // Remove user-specific fields that shouldn't be preserved (but keep allowedUsers which we just set)
      delete (tileToImport as any).user_id;
      
      // Ensure tabs array exists (normalizeImportedTiles should handle this, but be safe)
      if (!Array.isArray(tileToImport.tabs)) {
        tileToImport.tabs = [];
      }
      if (!Array.isArray(tileToImport.sections)) {
        tileToImport.sections = [];
      }
      
      // Create the tile
      await createTile(tileToImport);
      
      if (duplicateDialog) {
        setDuplicateDialog(null);
      }
      
      if (onTileImported) {
        onTileImported();
      }
      
      alert('Tile imported successfully to your Private tab in the Imported category!');
    } catch (error) {
      console.error('Failed to import tile:', error);
      alert('Failed to import tile. Please try again.');
      if (duplicateDialog) {
        setDuplicateDialog(null);
      }
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const renderTilePreview = (tile: any) => {
    const decorationStyles: React.CSSProperties = {};
    
    if (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) {
      const gradientColors = tile.tileGradientColors || [];
      const gradientPositions = tile.tileGradientColorPositions || [];
      const gradientDirection = tile.tileGradientDirection || '90deg';
      const gradientType = tile.tileGradientType || 'linear';

      const gradientStops = gradientColors
        .map((color: string, i: number) => {
          const position = gradientPositions[i] !== undefined ? gradientPositions[i] : (i * 100) / (gradientColors.length - 1 || 1);
          return `${color} ${position}%`;
        })
        .join(', ');

      if (gradientType === 'linear' || gradientType === 'repeating-linear') {
        const prefix = gradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
        decorationStyles.background = `${prefix}(${gradientDirection}deg, ${gradientStops})`;
      } else if (gradientType === 'radial' || gradientType === 'repeating-radial') {
        const prefix = gradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
        decorationStyles.background = `${prefix}(circle, ${gradientStops})`;
      } else if (gradientType === 'conic' || gradientType === 'repeating-conic') {
        const prefix = gradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
        decorationStyles.background = `${prefix}(from ${gradientDirection}deg, ${gradientStops})`;
      }
    } else if (tile.tileBackgroundColor) {
      decorationStyles.backgroundColor = tile.tileBackgroundColor;
    }

    if (tile.tileBorderRadius !== undefined) {
      decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
    }

    // Only apply text color if tile has other decorations (background or gradient)
    // This prevents forcing text color on tiles without decorations
    const hasOtherDecorations = !!(tile.tileBackgroundColor || (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0));
    if (tile.tileTextColor && hasOtherDecorations) {
      decorationStyles.color = tile.tileTextColor;
    }

    // Count links
    const linkCount = tile.tabs
      ? tile.tabs.reduce((count: number, tab: any) => {
          return count + (tab.sections?.reduce((secCount: number, section: any) => {
            return secCount + (section.links?.length || 0);
          }, 0) || 0);
        }, 0)
      : tile.sections?.reduce((count: number, section: any) => count + (section.links?.length || 0), 0) || 0;

    return (
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 max-w-sm cursor-pointer hover:shadow-lg transition-shadow"
        style={decorationStyles}
        onClick={() => handleImportTile(tile)}
      >
        <div className="flex items-start gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-base flex-shrink-0">
            {tile.emoji || '📁'}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
              {tile.title || 'Untitled Tile'}
            </h4>
            {tile.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                {tile.description}
              </p>
            )}
          </div>
        </div>
        {!tile.isHyperlink && linkCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
              <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
            </svg>
            <span>{linkCount} link{linkCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic">
          Click to import
        </div>
      </div>
    );
  };

  const getRecipientName = () => {
    if (selectedRecipient === null) return 'Public Chat';
    const recipient = users.find(u => u.id === selectedRecipient);
    return recipient ? recipient.username : 'Unknown';
  };

  return (
    <div className="w-full h-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex border border-slate-200 dark:border-slate-700">
      {/* User Panel */}
      {showUserPanel && (
        <div className="w-64 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-900">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Users</h3>
              <button
                onClick={loadUsers}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title="Refresh user list"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => setSelectedRecipient(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedRecipient === null
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM16 8a2 2 0 11-4 0 2 2 0 014 0zm-1.615 8.428a1.224 1.224 0 00.569-1.175 5.966 5.966 0 00-2.081-.416 5.967 5.967 0 00-1.788.27A9.953 9.953 0 0013 18a9.953 9.953 0 003.385-.572z" />
                </svg>
                <span className="font-medium">Public Chat</span>
              </div>
            </button>
            <div className="mt-2">
              <input
                type="text"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder="Search users..."
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredUsers.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-4">
                {userSearchTerm ? 'No users found' : 'No other users available'}
              </div>
            ) : (
              filteredUsers.map((userItem) => (
                <button
                  key={userItem.id}
                  onClick={() => setSelectedRecipient(userItem.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
                    selectedRecipient === userItem.id
                      ? 'bg-brand-500 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-semibold">
                      {userItem.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{userItem.username}</span>
                        {userItem.is_admin ? (
                          <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                            Admin
                          </span>
                        ) : (() => {
                          // Determine account type: SAML, LDAP, or Local
                          let accountType = 'Local';
                          if (userItem.auth_source === 'saml') {
                            accountType = 'SAML';
                          } else if (userItem.auth_source === 'ldap') {
                            accountType = 'LDAP';
                          } else if (userItem.email && userItem.email.includes('@localhost')) {
                            accountType = 'Local';
                          }
                          
                          return (
                            <span className="px-1.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                              {accountType}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowUserPanel(!showUserPanel)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title={showUserPanel ? "Hide user panel" : "Show user panel"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              </button>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{getRecipientName()}</h3>
                {selectedRecipient !== null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Direct message</p>
                )}
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title="Close Chat Widget"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            )}
          </div>
          <div>
            <input
              type="text"
              value={messageSearchTerm}
              onChange={(e) => setMessageSearchTerm(e.target.value)}
              placeholder="Search messages..."
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8">
            <p>{messageSearchTerm ? 'No messages found' : 'No messages yet. Start the conversation!'}</p>
          </div>
        ) : (
          filteredMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.user_id === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${message.user_id === user?.id ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 px-2 flex items-center gap-2">
                  <span className={message.user_id !== user?.id ? 'text-red-500 dark:text-red-400 font-semibold' : ''}>{message.username}</span>
                  {(() => {
                    const messageUser = users.find(u => u.id === message.user_id);
                    if (messageUser?.is_admin) {
                      return <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">Admin</span>;
                    } else {
                      // Determine account type: SAML, LDAP, or Local
                      let accountType = 'Local';
                      if (messageUser?.auth_source === 'saml') {
                        accountType = 'SAML';
                      } else if (messageUser?.auth_source === 'ldap') {
                        accountType = 'LDAP';
                      } else if (messageUser?.email && messageUser.email.includes('@localhost')) {
                        accountType = 'Local';
                      }
                      
                      return (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                          {accountType}
                        </span>
                      );
                    }
                  })()}
                  <span>• {formatTime(message.created_at)}</span>
                </div>
                <div
                  className={`rounded-2xl px-4 py-2 ${
                    message.user_id === user?.id
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white'
                  }`}
                >
                  {message.message_type === 'tile' && message.tile_data ? (
                    <div>
                      <div className="mb-2 font-medium text-sm">📦 Shared a tile:</div>
                      {renderTilePreview(message.tile_data)}
                    </div>
                  ) : message.message_type === 'json' ? (
                    <pre className="text-xs bg-black/10 dark:bg-black/20 p-2 rounded overflow-x-auto max-w-full">
                      {message.message}
                    </pre>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{message.message}</div>
                  )}
                </div>
                {message.user_id === user?.id && (
                  <button
                    onClick={() => handleDeleteMessage(message.id)}
                    className="mt-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-4">
        {selectedTile && (
          <div className="mb-2 p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{selectedTile.emoji}</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedTile.title}</span>
            </div>
            <button
              onClick={() => setSelectedTile(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}

        {showJsonInput && (
          <div className="mb-2">
            <textarea
              value={jsonInput}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 10000) {
                  setJsonInput(value);
                }
              }}
              placeholder="Paste JSON code here..."
              className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono"
              rows={4}
              maxLength={10000}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowJsonInput(false);
                  setJsonInput('');
                }
              }}
            />
            <div className="flex items-center justify-between mt-1">
              <div className={`text-xs ${jsonInput.length >= 9500 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                {jsonInput.length} / 10,000 characters
              </div>
              <button
                onClick={() => {
                  setShowJsonInput(false);
                  setJsonInput('');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {showTileSelector && (
          <div className="mb-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700">
            {shareableTiles.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                {user?.is_admin ? 'No tiles available' : 'No private tiles available to share'}
              </div>
            ) : (
              shareableTiles.map((tile) => (
                <button
                  key={tile.id}
                  onClick={() => {
                    setSelectedTile(tile);
                    setShowTileSelector(false);
                  }}
                  className="w-full p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-3 border-b border-slate-200 dark:border-slate-600 last:border-b-0"
                >
                  <span className="text-lg">{tile.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900 dark:text-white truncate">
                      {tile.title}
                    </div>
                    {tile.description && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {tile.description}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowTileSelector(!showTileSelector);
              setShowJsonInput(false);
            }}
            className="p-2 text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Share a tile"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h13.5A2.25 2.25 0 0019 13.75v-7.5A2.25 2.25 0 0016.75 4H3.25zM3.5 6.25a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v7.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-7.5z" />
              <path d="M6.25 8A1.25 1.25 0 105 9.25 1.25 1.25 0 006.25 8zM10.75 8a1.25 1.25 0 10-1.25 1.25 1.25 1.25 0 001.25-1.25zM15.25 8a1.25 1.25 0 10-1.25 1.25 1.25 1.25 0 001.25-1.25z" />
            </svg>
          </button>
          <button
            onClick={() => {
              setShowJsonInput(!showJsonInput);
              setShowTileSelector(false);
            }}
            className="p-2 text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Share JSON code"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zm4.03 6.28a.75.75 0 00-1.06-1.06L4.97 9.47a.75.75 0 000 1.06l2.25 2.25a.75.75 0 001.06-1.06L6.56 10l1.72-1.72zm4.5-1.06a.75.75 0 10-1.06 1.06L13.44 10l-1.72 1.72a.75.75 0 101.06 1.06l2.25-2.25a.75.75 0 000-1.06l-2.25-2.25z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex-1 flex flex-col">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 10000) {
                  setInputMessage(value);
                }
              }}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              maxLength={10000}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={isLoading || selectedTile !== null || showJsonInput}
            />
            {inputMessage.length > 0 && (
              <div className={`text-xs mt-1 px-1 ${inputMessage.length >= 9500 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                {inputMessage.length} / 10,000 characters
              </div>
            )}
          </div>
          <button
            onClick={handleSendMessage}
            disabled={isLoading || (!inputMessage.trim() && !selectedTile && !jsonInput.trim())}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      </div>

      {/* Duplicate Tile Dialog */}
      {duplicateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDuplicateDialog(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Tile Already Exists
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              A tile named <strong className="text-slate-900 dark:text-white">"{duplicateDialog.existingTile.title}"</strong> already exists in your Private area under the Imported category. What would you like to do?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleImportTile(duplicateDialog.newTile, 'duplicate')}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg transition-colors text-sm font-medium"
              >
                Create Duplicate Copy
              </button>
              <button
                onClick={() => handleImportTile(duplicateDialog.newTile, 'merge')}
                className="w-full px-4 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-900 dark:text-blue-200 rounded-lg transition-colors text-sm font-medium"
              >
                Merge Links (Add new links to existing tile)
              </button>
              <button
                onClick={() => handleImportTile(duplicateDialog.newTile, 'overwrite')}
                className="w-full px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-900 dark:text-red-200 rounded-lg transition-colors text-sm font-medium"
              >
                Overwrite Existing Tile
              </button>
              <button
                onClick={() => setDuplicateDialog(null)}
                className="w-full px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
