import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, getMessages, sendMessage, sendTile, deleteMessage } from '../services/chatService';
import { Tile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { authService, UserListItem } from '../services/authService';
import { createTile } from '../services/storageService';
import { parseSpaceExportObject, normalizeImportedTiles } from '../services/spaceTransferService';

interface ChatWidgetProps {
  tiles: Tile[];
  onTileShared?: (tile: Tile) => void;
  onTileImported?: () => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tiles, onTileShared, onTileImported }) => {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Load users list
  useEffect(() => {
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleImportTile = async (tileData: any) => {
    if (!confirm('Import this tile into your workspace?')) return;

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
      
      // Generate new ID and timestamp
      tileToImport.id = Math.random().toString(36).substring(2, 9);
      tileToImport.createdAt = Date.now();
      
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
      
      if (onTileImported) {
        onTileImported();
      }
      
      alert('Tile imported successfully to your Private tab in the Imported category!');
    } catch (error) {
      console.error('Failed to import tile:', error);
      alert('Failed to import tile. Please try again.');
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

    if (tile.tileTextColor) {
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
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Users</h3>
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
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {users.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-4">
                No other users available
              </div>
            ) : (
              users.map((userItem) => (
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
                    <span className="font-medium truncate">{userItem.username}</span>
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
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
        </div>

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.user_id === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${message.user_id === user?.id ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 px-2">
                  {message.username} • {formatTime(message.created_at)}
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
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste JSON code here..."
              className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono"
              rows={4}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowJsonInput(false);
                  setJsonInput('');
                }
              }}
            />
            <button
              onClick={() => {
                setShowJsonInput(false);
                setJsonInput('');
              }}
              className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        )}

        {showTileSelector && (
          <div className="mb-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700">
            {tiles.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                No tiles available
              </div>
            ) : (
              tiles.map((tile) => (
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
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={isLoading || selectedTile !== null || showJsonInput}
          />
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
    </div>
  );
};
