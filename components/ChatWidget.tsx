import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChatMessage, getMessages, sendMessage, sendTile, deleteMessage } from '../services/chatService';
import { Tile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { authService, UserListItem } from '../services/authService';
import { createTile, saveTile } from '../services/storageService';
import { parseSpaceExportObject, normalizeImportedTiles, restoreImportedTileAssets } from '../services/spaceTransferService';
import { generateUuid } from '../services/idService';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';
import { EmojiPickerPanel } from './EmojiPickerPanel';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🙏', '🔥', '✅', '👋', '😊', '🚀'];

const CHAT_THEME_KEY = 'linknest.chatWidget.theme.v1';
type ChatThemeId = 'vivid' | 'indigo';

const CHAT_THEMES = {
  vivid: {
    label: 'Colorful',
    emoji: '🎨',
    shell: 'border border-violet-200 dark:border-violet-800/60 bg-white dark:bg-slate-800',
    sidebar: 'border-r border-violet-200/80 dark:border-violet-800/50 bg-gradient-to-b from-violet-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40',
    sidebarHeader: 'border-b border-violet-200/70 dark:border-violet-800/40',
    sidebarTitle: 'text-violet-900 dark:text-violet-100',
    refreshBtn: 'text-violet-400 hover:text-violet-700 dark:hover:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-900/40',
    publicOn: 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md',
    publicOff: 'text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20',
    search: 'border border-violet-200 dark:border-violet-700 bg-white/80 dark:bg-slate-800 placeholder-violet-400 dark:placeholder-violet-500/70 focus:ring-violet-400',
    userOn: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md',
    userOff: 'text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/20',
    chatArea: 'bg-gradient-to-br from-white via-violet-50/40 to-sky-50/60 dark:from-slate-800 dark:via-slate-800 dark:to-violet-950/30',
    header: 'border-b border-violet-200/70 dark:border-violet-800/40 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-sky-50 dark:from-slate-900 dark:via-violet-950/50 dark:to-slate-900',
    menuBtn: 'text-violet-400 hover:text-violet-700 dark:hover:text-violet-200 hover:bg-white/70 dark:hover:bg-violet-900/40',
    publicAvatar: 'bg-gradient-to-br from-teal-400 to-emerald-500',
    subtitle: 'text-fuchsia-600 dark:text-fuchsia-300',
    closeBtn: 'text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30',
    messageSearch: 'border border-violet-200 dark:border-violet-700 bg-white/90 dark:bg-slate-800 placeholder-violet-400 dark:placeholder-violet-500/70 focus:ring-fuchsia-400',
    emptyTitle: 'text-violet-700 dark:text-violet-300',
    ownName: 'font-semibold text-sky-600 dark:text-sky-300',
    otherName: 'font-semibold text-fuchsia-600 dark:text-fuchsia-300',
    ownBubble: 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white rounded-br-md',
    otherBubble: 'bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-900/60 dark:to-fuchsia-900/40 text-slate-900 dark:text-violet-50 border border-violet-200/70 dark:border-violet-700/40 rounded-bl-md',
    composer: 'border-t border-violet-200/70 dark:border-violet-800/40 bg-gradient-to-r from-white via-violet-50/50 to-sky-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40',
    input: 'border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-800 placeholder-violet-400 dark:placeholder-violet-500/70 focus:ring-fuchsia-400',
    send: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-md',
    sendIcon: '🚀',
    quickHover: 'hover:bg-violet-100 dark:hover:bg-violet-900/40',
    emojiPanel: 'border border-fuchsia-200 dark:border-fuchsia-700/40',
    emojiOn: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-200',
    emojiOff: 'text-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/30',
    tileOn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    tileOff: 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30',
    jsonOn: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
    jsonOff: 'text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
    dialog: 'border-violet-200 dark:border-violet-800',
    dialogDup: 'bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50 text-violet-900 dark:text-violet-100',
    avatars: [
      'bg-gradient-to-br from-violet-500 to-fuchsia-500',
      'bg-gradient-to-br from-sky-500 to-cyan-500',
      'bg-gradient-to-br from-emerald-500 to-teal-500',
      'bg-gradient-to-br from-amber-500 to-orange-500',
      'bg-gradient-to-br from-rose-500 to-pink-500',
      'bg-gradient-to-br from-indigo-500 to-blue-600',
      'bg-gradient-to-br from-lime-500 to-green-600',
      'bg-gradient-to-br from-fuchsia-500 to-purple-600',
      'bg-gradient-to-br from-cyan-500 to-blue-500',
      'bg-gradient-to-br from-orange-500 to-red-500',
    ],
  },
  indigo: {
    label: 'Indigo',
    emoji: '💼',
    shell: 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
    sidebar: 'border-r border-slate-200 dark:border-slate-700 bg-gradient-to-b from-brand-50 via-slate-50 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950',
    sidebarHeader: 'border-b border-slate-200 dark:border-slate-700',
    sidebarTitle: 'text-slate-900 dark:text-white',
    refreshBtn: 'text-slate-400 hover:text-brand-600 dark:hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700',
    publicOn: 'bg-brand-500 text-white shadow-sm',
    publicOff: 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
    search: 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-brand-500',
    userOn: 'bg-brand-500 text-white shadow-sm',
    userOff: 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
    chatArea: 'bg-slate-50/70 dark:bg-slate-800',
    header: 'border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-brand-50 to-white dark:from-slate-900 dark:to-slate-800',
    menuBtn: 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
    publicAvatar: 'bg-gradient-to-br from-brand-500 to-indigo-700',
    subtitle: 'text-slate-500 dark:text-slate-400',
    closeBtn: 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
    messageSearch: 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-brand-500',
    emptyTitle: 'text-slate-600 dark:text-slate-300',
    ownName: 'font-semibold text-brand-600 dark:text-brand-500',
    otherName: 'font-semibold text-indigo-600 dark:text-indigo-300',
    ownBubble: 'bg-brand-500 text-white rounded-br-md',
    otherBubble: 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-bl-md',
    composer: 'border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
    input: 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-brand-500',
    send: 'bg-brand-500 hover:bg-brand-600 shadow-sm',
    sendIcon: '➤',
    quickHover: 'hover:bg-slate-100 dark:hover:bg-slate-700',
    emojiPanel: 'border-slate-200 dark:border-slate-700',
    emojiOn: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100',
    emojiOff: 'text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700',
    tileOn: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100',
    tileOff: 'text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700',
    jsonOn: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
    jsonOff: 'text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-700',
    dialog: 'border-slate-200 dark:border-slate-700',
    dialogDup: 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white',
    avatars: [
      'bg-gradient-to-br from-brand-500 to-indigo-700',
      'bg-gradient-to-br from-indigo-500 to-blue-700',
      'bg-gradient-to-br from-blue-500 to-indigo-600',
      'bg-gradient-to-br from-slate-500 to-slate-700',
      'bg-gradient-to-br from-sky-600 to-indigo-700',
      'bg-gradient-to-br from-indigo-600 to-brand-700',
      'bg-gradient-to-br from-blue-600 to-slate-700',
      'bg-gradient-to-br from-brand-600 to-blue-800',
      'bg-gradient-to-br from-indigo-400 to-indigo-700',
      'bg-gradient-to-br from-slate-600 to-indigo-800',
    ],
  },
} as const;

const readChatTheme = (): ChatThemeId => {
  try {
    const saved = localStorage.getItem(CHAT_THEME_KEY);
    if (saved === 'vivid' || saved === 'indigo') return saved;
  } catch {
    // ignore
  }
  return 'vivid';
};

const getAvatarGradient = (name: string, palettes: readonly string[]): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palettes[hash % palettes.length];
};

const getAuthSourceMeta = (item?: { auth_source?: string }) => {
  const source = String(item?.auth_source || 'local').trim().toLowerCase();
  if (source === 'saml') {
    return { label: 'SAML', emoji: '🔐', pill: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200' };
  }
  if (source === 'ldap') {
    return { label: 'LDAP', emoji: '🏢', pill: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200' };
  }
  if (source === 'local') {
    return { label: 'Local', emoji: '🏠', pill: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' };
  }
  return {
    label: source.toUpperCase(),
    emoji: '🔑',
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  };
};

const ADMIN_PILL = {
  label: 'Admin',
  emoji: '👑',
  pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
};

const PUBLIC_DESTINATION_PILL = {
  label: 'Public',
  emoji: '🌍',
  pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  title: 'Sent to Public Chat',
};

const getMessageRecipientId = (message: ChatMessage): number | null => {
  const raw = message.recipient_user_id as unknown;
  if (raw === null || raw === undefined || raw === '') return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isMessageInConversation = (
  message: ChatMessage,
  recipientId: number | null,
  currentUserId?: number
): boolean => {
  const destId = getMessageRecipientId(message);
  if (recipientId === null) {
    return destId === null;
  }
  if (destId === null || currentUserId == null) return false;
  const senderId = Number(message.user_id);
  const me = Number(currentUserId);
  const other = Number(recipientId);
  return (senderId === me && destId === other) || (senderId === other && destId === me);
};

const getMessageDestinationMeta = (
  message: ChatMessage,
  currentUserId?: number,
  people: UserListItem[] = []
) => {
  const recipientId = getMessageRecipientId(message);
  if (recipientId === null) {
    return PUBLIC_DESTINATION_PILL;
  }

  const isToSelf = currentUserId != null && recipientId === Number(currentUserId);
  const listed = people.find((person) => Number(person.id) === recipientId);
  const name = isToSelf ? 'You' : getPersonDisplayName(listed || { username: message.recipient_username || 'someone' });

  return {
    label: `to ${name}`,
    emoji: '💬',
    pill: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
    title: isToSelf ? 'Sent privately to you' : `Sent privately to ${name}`,
  };
};

type ShareTabId = 'private' | 'public' | 'authenticated' | 'staging';
type ShareTabFilter = 'all' | ShareTabId;

const SHARE_TAB_ORDER: ShareTabId[] = ['private', 'public', 'authenticated', 'staging'];

const SHARE_TAB_META: Record<ShareTabId, { label: string; emoji: string; chip: string; header: string }> = {
  private: {
    label: 'Private tab',
    emoji: '🔒',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    header: 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  },
  public: {
    label: 'Public tab',
    emoji: '🌍',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    header: 'bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200',
  },
  authenticated: {
    label: 'Your Apps',
    emoji: '👤',
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
    header: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200',
  },
  staging: {
    label: 'Staging',
    emoji: '🧪',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    header: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  },
};

const getShareTab = (tile: Tile): ShareTabId => {
  if (tile.sourceTab === 'staging') return 'staging';
  if (tile.visibility === 'private') return 'private';
  if (tile.visibility === 'authenticated') return 'authenticated';
  return 'public';
};

const getTileShareTags = (tile: Tile): string[] => {
  const tags: string[] = [];
  const group = (tile.group || '').trim();
  if (group) tags.push(group);
  if (Array.isArray(tile.searchTags)) {
    for (const raw of tile.searchTags) {
      const tag = String(raw).trim();
      if (tag && !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
        tags.push(tag);
      }
    }
  }
  return tags;
};

const titleCaseToken = (token: string): string => {
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

/** First / last name guessed from the email local part (jane.doe@x.com → Jane Doe). */
const nameFromEmail = (email?: string): string => {
  if (!email || !email.includes('@')) return '';
  const local = email.split('@')[0].trim();
  if (!local) return '';
  const parts = local.split(/[._+\-]+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(titleCaseToken).join(' ');
};

type PersonNameFields = {
  username?: string;
  email?: string;
  display_name?: string | null;
};

const getPersonDisplayName = (person?: PersonNameFields | null): string => {
  const display = person?.display_name?.trim();
  if (display) return display;
  const fromEmail = nameFromEmail(person?.email);
  if (fromEmail) return fromEmail;
  const username = person?.username?.trim();
  return username || 'Unknown';
};

const getPersonLoginId = (person?: PersonNameFields | null): string => {
  const username = person?.username?.trim() || '';
  if (!username) return '';
  if (username.toLowerCase() === getPersonDisplayName(person).toLowerCase()) return '';
  return username;
};

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
  const [tileShareSearch, setTileShareSearch] = useState('');
  const [tileShareTabFilter, setTileShareTabFilter] = useState<ShareTabFilter>('all');
  const [tileShareTagFilter, setTileShareTagFilter] = useState<string | null>(null);
  const [showJsonInput, setShowJsonInput] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(true);
  const [jsonInput, setJsonInput] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [duplicateDialog, setDuplicateDialog] = useState<{ 
    existingTile: Tile; 
    newTile: Tile; 
  } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [chatTheme, setChatTheme] = useState<ChatThemeId>(readChatTheme);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const t = CHAT_THEMES[chatTheme];
  const lastNotifiedMessageIdRef = useRef<number>(0);
  const conversationKeyRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);

  const applyChatTheme = (id: ChatThemeId) => {
    setChatTheme(id);
    try {
      localStorage.setItem(CHAT_THEME_KEY, id);
    } catch {
      // ignore
    }
  };

  // Escape key handler to close widget
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Close nested dialogs first instead of the whole widget
        if (duplicateDialog) {
          e.preventDefault();
          e.stopPropagation();
          setDuplicateDialog(null);
          return;
        }
        if (showEmojiPicker) {
          e.preventDefault();
          e.stopPropagation();
          setShowEmojiPicker(false);
          return;
        }
        if (showTileSelector) {
          e.preventDefault();
          e.stopPropagation();
          setShowTileSelector(false);
          return;
        }
        if (showJsonInput) {
          e.preventDefault();
          e.stopPropagation();
          setShowJsonInput(false);
          return;
        }
        if (isEscapeDialogOpen()) return;
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
  }, [onClose, showTileSelector, showJsonInput, duplicateDialog, showEmojiPicker]);
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

  // Filter users based on search term, showing first/last name first
  const filteredUsers = useMemo(() => {
    const searchLower = userSearchTerm.trim().toLowerCase();
    const searchDigits = searchLower.replace(/^#/, '');
    const list = !searchLower
      ? users
      : users.filter((u) => {
          if (u.username.toLowerCase().includes(searchLower)) return true;
          if (u.display_name && u.display_name.toLowerCase().includes(searchLower)) return true;
          if (u.email && u.email.toLowerCase().includes(searchLower)) return true;
          if (String(u.id) === searchDigits || String(u.id).includes(searchDigits)) return true;
          const displayName = getPersonDisplayName(u);
          if (displayName.toLowerCase().includes(searchLower)) return true;
          return false;
        });
    return [...list].sort((a, b) =>
      getPersonDisplayName(a).localeCompare(getPersonDisplayName(b), undefined, { sensitivity: 'base' })
    );
  }, [users, userSearchTerm]);

  // Filter messages based on the open conversation, then the search term
  const conversationMessages = useMemo(
    () => messages.filter((m) => isMessageInConversation(m, selectedRecipient, user?.id)),
    [messages, selectedRecipient, user?.id]
  );

  const filteredMessages = useMemo(() => {
    if (!messageSearchTerm.trim()) {
      return conversationMessages;
    }
    const searchLower = messageSearchTerm.toLowerCase();
    return conversationMessages.filter(m => {
      const destination = getMessageDestinationMeta(m, user?.id, users).label.toLowerCase();
      return (
        m.username.toLowerCase().includes(searchLower) ||
        m.message?.toLowerCase().includes(searchLower) ||
        destination.includes(searchLower) ||
        m.tile_data?.title?.toLowerCase().includes(searchLower) ||
        m.tile_data?.description?.toLowerCase().includes(searchLower)
      );
    });
  }, [conversationMessages, messageSearchTerm, user?.id, users]);

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

  const shareTabCounts = useMemo(() => {
    const counts: Record<ShareTabId, number> = { private: 0, public: 0, authenticated: 0, staging: 0 };
    shareableTiles.forEach((tile) => {
      counts[getShareTab(tile)] += 1;
    });
    return counts;
  }, [shareableTiles]);

  const filteredShareTiles = useMemo(() => {
    const query = tileShareSearch.trim().toLowerCase();
    return shareableTiles.filter((tile) => {
      const tab = getShareTab(tile);
      if (tileShareTabFilter !== 'all' && tab !== tileShareTabFilter) return false;
      const tags = getTileShareTags(tile);
      if (
        tileShareTagFilter &&
        !tags.some((tag) => tag.toLowerCase() === tileShareTagFilter.toLowerCase())
      ) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        tile.title,
        tile.description,
        tile.group,
        SHARE_TAB_META[tab].label,
        ...tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [shareableTiles, tileShareSearch, tileShareTabFilter, tileShareTagFilter]);

  const groupedShareTiles = useMemo(() => {
    return SHARE_TAB_ORDER
      .map((tab) => ({
        tab,
        tiles: filteredShareTiles.filter((tile) => getShareTab(tile) === tab),
      }))
      .filter((group) => group.tiles.length > 0);
  }, [filteredShareTiles]);

  const visibleShareTabs = useMemo(
    () => SHARE_TAB_ORDER.filter((tab) => shareTabCounts[tab] > 0),
    [shareTabCounts]
  );

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
    conversationKeyRef.current = selectedRecipient;
    stickToBottomRef.current = true;
    setMessages([]);
    void loadMessages(selectedRecipient);
    const interval = setInterval(() => {
      void loadMessages(selectedRecipient);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedRecipient]);

  // Mark existing messages as read when widget first opens or recipient changes (only if tab is visible)
  useEffect(() => {
    if (messages.length > 0 && user && onUnreadChange && document.visibilityState === 'visible') {
      const maxId = Math.max(...messages.map(m => m.id));
      if (maxId > lastSeenMessageIdRef.current) {
        lastSeenMessageIdRef.current = maxId;
        setLastSeenMessageId(maxId);
        onUnreadChange(false);
      }
    }
  }, [selectedRecipient, messages, user, onUnreadChange]); // Run when recipient changes or messages load

  // Auto-scroll only when the user is already at (or near) the latest message
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filteredMessages]);

  const showNewMessageBrowserNotification = (msg: ChatMessage) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Avoid notifying while the user is actively looking at this chat
    if (document.visibilityState === 'visible') return;
    if (msg.id <= lastNotifiedMessageIdRef.current) return;
    lastNotifiedMessageIdRef.current = msg.id;
    try {
      const preview =
        msg.message_type === 'tile'
          ? 'Shared a tile'
          : msg.message_type === 'json'
            ? 'Shared JSON'
            : (msg.message || 'New message').slice(0, 120);
      const n = new Notification('New chat message', {
        body: `${msg.username}: ${preview}`,
        tag: 'linknest-chat-new',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // ignore (unsupported / blocked)
    }
  };

  // Track unread across public + DMs (current pane is conversation-scoped)
  useEffect(() => {
    if (!user || !onUnreadChange) return;
    let cancelled = false;

    const checkInboxUnread = async () => {
      try {
        const inbox = await getMessages(50, 0, null, { scope: 'inbox' });
        if (cancelled) return;
        const unreadMessages = inbox.filter(
          (msg) => Number(msg.user_id) !== Number(user.id) && msg.id > lastSeenMessageIdRef.current
        );
        onUnreadChange(unreadMessages.length > 0);
        if (unreadMessages.length > 0 && document.visibilityState === 'hidden') {
          const newest = unreadMessages.reduce((a, b) => (a.id > b.id ? a : b));
          showNewMessageBrowserNotification(newest);
        }
      } catch {
        // ignore — unread check must not disrupt chat
      }
    };

    void checkInboxUnread();
    const interval = setInterval(() => {
      void checkInboxUnread();
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, onUnreadChange, messages, selectedRecipient]);

  // Mark new messages as read when they arrive while widget is open AND tab is visible
  useEffect(() => {
    if (messages.length === 0 || !user) return;
    if (document.visibilityState !== 'visible') return;

    const maxId = Math.max(...messages.map((m) => m.id));
    if (maxId > lastSeenMessageIdRef.current) {
      lastSeenMessageIdRef.current = maxId;
      setLastSeenMessageId(maxId);
      if (onUnreadChange) {
        onUnreadChange(false);
      }
    }
  }, [messages, user, onUnreadChange]);

  // When tab becomes visible again with chat open, mark current messages as read
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !user || messages.length === 0) return;
      const maxId = Math.max(...messages.map((m) => m.id));
      if (maxId > lastSeenMessageIdRef.current) {
        lastSeenMessageIdRef.current = maxId;
        setLastSeenMessageId(maxId);
      }
      onUnreadChange?.(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [messages, user, onUnreadChange]);
  
  // Initialize last seen message ID from localStorage on mount
  useEffect(() => {
    if (user) {
      lastSeenMessageIdRef.current = getLastSeenMessageId();
      lastNotifiedMessageIdRef.current = lastSeenMessageIdRef.current;
    }
  }, [user]);

  const loadMessages = async (recipientId: number | null = conversationKeyRef.current) => {
    try {
      const fetchedMessages = await getMessages(100, 0, recipientId);
      if (conversationKeyRef.current !== recipientId) return;
      setMessages((prev) => {
        if (
          prev.length === fetchedMessages.length &&
          prev.every((msg, index) => msg.id === fetchedMessages[index].id)
        ) {
          return prev;
        }
        return fetchedMessages;
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const selectConversation = (recipientId: number | null) => {
    if (recipientId === selectedRecipient) return;
    conversationKeyRef.current = recipientId;
    stickToBottomRef.current = true;
    setSelectedRecipient(recipientId);
    setMessages([]);
    setMessageSearchTerm('');
  };

  const isChatNearBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 96;
  };

  const handleChatScroll = () => {
    stickToBottomRef.current = isChatNearBottom();
  };

  const scrollToBottom = () => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
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
      stickToBottomRef.current = true;
      await loadMessages();
      scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
      // Keep typing focus in the message box after send
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
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
    try {
      // Ensure tileData has required structure
      if (!tileData || typeof tileData !== 'object') {
        alert('Invalid tile data. Unable to import.');
        return;
      }

      // Support full SpaceExportFile (v1.2/v1.3) or a raw tile object
      let parsed;
      try {
        if (
          tileData.type === 'tile' ||
          tileData.type === 'category' ||
          tileData.type === 'all_categories'
        ) {
          parsed = parseSpaceExportObject(tileData);
        } else {
          const cleanedTileData = {
            ...tileData,
            tabs: Array.isArray(tileData.tabs) ? tileData.tabs : [],
            sections: Array.isArray(tileData.sections) ? tileData.sections : []
          };
          parsed = {
            type: 'tile' as const,
            tiles: [cleanedTileData],
            categoryName: 'Imported',
            assets: undefined
          };
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Invalid tile data. Unable to import.');
        return;
      }
      
      // Normalize the tile data
      const normalizedTiles = normalizeImportedTiles(parsed);
      
      if (!normalizedTiles || normalizedTiles.length === 0) {
        alert('Invalid tile data. Unable to import.');
        return;
      }

      const tileToImport = normalizedTiles[0];

      const sectionHasContent = (section: { links?: unknown[]; richTextContent?: unknown[] } | undefined) =>
        (section?.links?.length ?? 0) > 0 ||
        (section?.richTextContent?.length ?? 0) > 0 ||
        (Array.isArray(section?.richTextContent) &&
          section.richTextContent.some((rt: any) => typeof rt?.content === 'string' && rt.content.trim() !== ''));

      const hasNestedContent =
        (tileToImport.tabs ?? []).some((tab) =>
          (tab.sections ?? []).some((section) => sectionHasContent(section))
        ) ||
        (tileToImport.sections ?? []).some((section) => sectionHasContent(section)) ||
        !!(tileToImport.htmlContent && String(tileToImport.htmlContent).trim());

      if (!tileToImport.isHyperlink && !hasNestedContent) {
        alert('This shared tile has no links or content to import. Ask the sender to share it again.');
        return;
      }

      // If action is provided, it means we're handling a duplicate
      if (!action && !confirm('Import this tile into your workspace?')) return;

      await restoreImportedTileAssets(normalizedTiles, parsed.assets);
      
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

    // Count links from nested tabs/sections, then fall back to summary fields
    const nestedLinkCount = Array.isArray(tile.tabs) && tile.tabs.length > 0
      ? tile.tabs.reduce((count: number, tab: any) => {
          return count + (tab.sections?.reduce((secCount: number, section: any) => {
            return secCount + (section.links?.length || 0);
          }, 0) || 0);
        }, 0)
      : (Array.isArray(tile.sections)
          ? tile.sections.reduce((count: number, section: any) => count + (section.links?.length || 0), 0)
          : 0);
    const summaryLinkCount = typeof tile.linkCount === 'number'
      ? tile.linkCount
      : (Array.isArray(tile.searchLinks) ? tile.searchLinks.length : 0);
    const linkCount = nestedLinkCount > 0 ? nestedLinkCount : summaryLinkCount;

    return (
      <div
        className="bg-white/95 dark:bg-slate-800/95 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 max-w-sm cursor-pointer hover:shadow-lg hover:border-amber-400 dark:hover:border-amber-500 transition-all shadow-sm"
        style={decorationStyles}
        onClick={() => handleImportTile(tile)}
      >
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 flex items-center justify-center text-lg flex-shrink-0 shadow-inner">
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
          <div className="flex items-center gap-1 text-xs text-teal-700 dark:text-teal-300 mt-2 font-medium">
            <span>🔗</span>
            <span>{linkCount} link{linkCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
          ⬇️ Click to import
        </div>
      </div>
    );
  };

  const getRecipientName = () => {
    if (selectedRecipient === null) return 'Public Chat';
    const recipient = users.find(u => u.id === selectedRecipient);
    return recipient ? getPersonDisplayName(recipient) : 'Unknown';
  };

  const getRecipientLoginId = () => {
    if (selectedRecipient === null) return '';
    const recipient = users.find(u => u.id === selectedRecipient);
    return getPersonLoginId(recipient);
  };

  const insertEmoji = (emoji: string) => {
    setInputMessage((prev) => {
      if (prev.length + emoji.length > 10000) return prev;
      return prev + emoji;
    });
  };

  const renderAvatar = (name: string, size: 'sm' | 'md' = 'sm') => {
    const sizeClass = size === 'md' ? 'w-9 h-9 text-sm' : 'w-8 h-8 text-xs';
    return (
      <div
        className={`${sizeClass} rounded-full ${getAvatarGradient(name, t.avatars)} text-white flex items-center justify-center font-bold shadow-md ring-2 ring-white/80 dark:ring-slate-800 flex-shrink-0`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const renderAccountPills = (
    item?: { auth_source?: string; email?: string; is_admin?: boolean }
  ) => {
    const source = getAuthSourceMeta(item);
    const pills = item?.is_admin ? [ADMIN_PILL, source] : [source];
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {pills.map((meta) => (
          <span
            key={meta.label}
            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${meta.pill}`}
          >
            {meta.emoji} {meta.label}
          </span>
        ))}
      </span>
    );
  };

  const renderDestinationPill = (message: ChatMessage) => {
    const dest = getMessageDestinationMeta(message, user?.id, users);
    return (
      <span
        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${dest.pill}`}
        title={dest.title}
      >
        {dest.emoji} {dest.label}
      </span>
    );
  };

  return (
    <div className={`w-full h-full rounded-2xl shadow-2xl flex overflow-hidden ${t.shell}`}>
      {/* User Panel */}
      {showUserPanel && (
        <div className={`w-64 flex flex-col ${t.sidebar}`}>
          <div className={`p-4 ${t.sidebarHeader}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-bold ${t.sidebarTitle}`}>👥 People</h3>
              <button
                onClick={loadUsers}
                className={`p-1.5 rounded-lg transition-colors ${t.refreshBtn}`}
                title="Refresh user list"
              >
                <span className="text-sm" aria-hidden>🔄</span>
              </button>
            </div>
            <button
              onClick={() => selectConversation(null)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                selectedRecipient === null ? t.publicOn : t.publicOff
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden>🌍</span>
                <span className="font-semibold">Public Chat</span>
              </div>
            </button>
            <div className="mt-2">
              <input
                type="text"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder="🔍 Search name, email, or ID..."
                className={`w-full px-3 py-2 text-sm rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${t.search}`}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredUsers.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-6 px-2">
                <div className="text-2xl mb-1" aria-hidden>{userSearchTerm ? '🧐' : '😴'}</div>
                {userSearchTerm ? 'No people found' : 'No other people yet'}
              </div>
            ) : (
              filteredUsers.map((userItem) => {
                const isSelected = selectedRecipient === userItem.id;
                const displayName = getPersonDisplayName(userItem);
                const loginId = getPersonLoginId(userItem);
                return (
                  <button
                    key={userItem.id}
                    onClick={() => selectConversation(userItem.id)}
                    title={[displayName, loginId, userItem.email, `ID ${userItem.id}`].filter(Boolean).join(' · ')}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all mb-1 ${
                      isSelected ? t.userOn : t.userOff
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {renderAvatar(displayName)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold truncate">{displayName}</span>
                        </div>
                        {loginId && (
                          <div className={`text-[11px] truncate ${isSelected ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                            {loginId}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-0.5 min-w-0">
                          {renderAccountPills(userItem)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${t.chatArea}`}>
        {/* Header */}
        <div className={`p-4 ${t.header}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setShowUserPanel(!showUserPanel)}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${t.menuBtn}`}
                title={showUserPanel ? "Hide people panel" : "Show people panel"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex items-center gap-2 min-w-0">
                {selectedRecipient === null ? (
                  <div className={`w-9 h-9 rounded-full ${t.publicAvatar} text-white flex items-center justify-center text-lg shadow-md ring-2 ring-white/80 dark:ring-slate-800`}>
                    🌍
                  </div>
                ) : (
                  renderAvatar(getRecipientName(), 'md')
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <span className="truncate">{selectedRecipient === null ? '🌍 Public Chat' : getRecipientName()}</span>
                    {selectedRecipient !== null && renderAccountPills(users.find((u) => u.id === selectedRecipient))}
                  </h3>
                  <p className={`text-xs font-medium ${t.subtitle}`}>
                    {selectedRecipient === null
                      ? '💬 Everyone can see this'
                      : `💌 Direct message${getRecipientLoginId() ? ` · ${getRecipientLoginId()}` : ''}`}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className="flex items-center rounded-lg p-0.5 bg-white/80 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-600 shadow-sm"
                role="group"
                aria-label="Chat appearance"
              >
                <button
                  type="button"
                  onClick={() => applyChatTheme('vivid')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                    chatTheme === 'vivid'
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                  title="Colorful theme"
                  aria-pressed={chatTheme === 'vivid'}
                >
                  🎨 Colorful
                </button>
                <button
                  type="button"
                  onClick={() => applyChatTheme('indigo')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                    chatTheme === 'indigo'
                      ? 'bg-brand-500 text-white shadow'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                  title="Indigo professional theme"
                  aria-pressed={chatTheme === 'indigo'}
                >
                  💼 Indigo
                </button>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className={`p-1.5 rounded-lg transition-colors ${t.closeBtn}`}
                  title="Close Chat Widget"
                >
                  <span className="text-base" aria-hidden>✖️</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <input
              type="text"
              value={messageSearchTerm}
              onChange={(e) => setMessageSearchTerm(e.target.value)}
              placeholder="🔎 Search messages..."
              className={`w-full px-3 py-2 text-sm rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${t.messageSearch}`}
            />
          </div>
        </div>

      {/* Messages */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleChatScroll}
      >
        {filteredMessages.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="text-4xl mb-2" aria-hidden>{messageSearchTerm ? '🔎' : '✨'}</div>
            <p className={`text-sm font-semibold ${t.emptyTitle}`}>
              {messageSearchTerm
                ? 'No matching messages'
                : selectedRecipient === null
                  ? 'No messages yet'
                  : 'No private messages yet'}
            </p>
            {!messageSearchTerm && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {selectedRecipient === null
                  ? 'Say hello 👋 or drop a 🎉 to start the conversation'
                  : `Start a private chat with ${getRecipientName()}`}
              </p>
            )}
          </div>
        ) : (
          filteredMessages.map((message) => {
            const isOwn = message.user_id === user?.id;
            const messageUser = isOwn && user
              ? user
              : users.find(u => u.id === message.user_id);
            const senderLabel = isOwn
              ? '🙋 You'
              : getPersonDisplayName(messageUser || { username: message.username });
            return (
              <div
                key={message.id}
                className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                {!isOwn && renderAvatar(senderLabel)}
                <div className={`max-w-[80%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 px-1 flex items-center gap-1.5 flex-wrap">
                    <span className={isOwn ? t.ownName : t.otherName}>
                      {senderLabel}
                    </span>
                    {renderAccountPills(messageUser)}
                    {renderDestinationPill(message)}
                    <span>🕒 {formatTime(message.created_at)}</span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2 shadow-sm ${
                      isOwn ? t.ownBubble : t.otherBubble
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
                  {isOwn && (
                    <button
                      onClick={() => handleDeleteMessage(message.id)}
                      className="mt-1 text-xs text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`p-3 ${t.composer}`}>
        {selectedTile && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{selectedTile.emoji || '📦'}</span>
              <div className="min-w-0">
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate block">{selectedTile.title}</span>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  {(() => {
                    const tab = getShareTab(selectedTile);
                    const meta = SHARE_TAB_META[tab];
                    return (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${meta.chip}`}>
                        {meta.emoji} {meta.label.replace(' tab', '')}
                      </span>
                    );
                  })()}
                  {getTileShareTags(selectedTile).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">
                      🏷️ {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedTile(null)}
              className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-300 shrink-0"
              title="Remove attached tile"
            >
              ✖️
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
              placeholder="🧩 Paste JSON code here..."
              className="w-full p-2 text-sm border border-indigo-200 dark:border-indigo-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
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
          <div className="mb-2 max-h-80 flex flex-col border border-amber-200 dark:border-amber-700/40 rounded-xl bg-white dark:bg-slate-800 overflow-hidden">
            <div className="p-2 border-b border-amber-100 dark:border-slate-700 space-y-2 shrink-0">
              <input
                type="text"
                value={tileShareSearch}
                onChange={(e) => setTileShareSearch(e.target.value)}
                placeholder="🔎 Filter tiles by name or tag..."
                className={`w-full px-3 py-1.5 text-sm rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${t.search}`}
              />
              {visibleShareTabs.length > 1 && (
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTileShareTabFilter('all');
                      setTileShareTagFilter(null);
                    }}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${
                      tileShareTabFilter === 'all'
                        ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    All ({shareableTiles.length})
                  </button>
                  {visibleShareTabs.map((tab) => {
                    const meta = SHARE_TAB_META[tab];
                    const active = tileShareTabFilter === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setTileShareTabFilter(active ? 'all' : tab);
                          setTileShareTagFilter(null);
                        }}
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${
                          active ? `${meta.chip} ring-1 ring-current` : meta.chip
                        }`}
                      >
                        {meta.emoji} {meta.label.replace(' tab', '')} ({shareTabCounts[tab]})
                      </button>
                    );
                  })}
                </div>
              )}
              {tileShareTagFilter && (
                <button
                  type="button"
                  onClick={() => setTileShareTagFilter(null)}
                  className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-teal-600 text-white inline-flex items-center gap-1"
                  title="Clear tag filter"
                >
                  🏷️ {tileShareTagFilter} ✕
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {shareableTiles.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                  {user?.is_admin ? '📭 No tiles available' : '🔒 No private tiles available to share'}
                </div>
              ) : groupedShareTiles.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                  🧐 No tiles match this filter
                </div>
              ) : (
                groupedShareTiles.map((group) => {
                  const meta = SHARE_TAB_META[group.tab];
                  return (
                    <div key={group.tab}>
                      <div className={`sticky top-0 z-[1] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${meta.header}`}>
                        {meta.emoji} {meta.label} · {group.tiles.length}
                      </div>
                      {group.tiles.map((tile) => {
                        const tags = getTileShareTags(tile);
                        return (
                          <button
                            key={tile.id}
                            type="button"
                            onClick={() => {
                              setSelectedTile(tile);
                              setShowTileSelector(false);
                            }}
                            className="w-full p-3 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-start gap-3 border-b border-amber-100 dark:border-slate-700 last:border-b-0"
                          >
                            <span className="text-lg mt-0.5">{tile.emoji || '📦'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-slate-900 dark:text-white truncate">
                                {tile.title}
                              </div>
                              {tile.description && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {tile.description}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${meta.chip}`}>
                                  {meta.emoji} {meta.label.replace(' tab', '')}
                                </span>
                                {tags.map((tag) => (
                                  <span
                                    key={tag}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTileShareTagFilter(
                                        tileShareTagFilter?.toLowerCase() === tag.toLowerCase() ? null : tag
                                      );
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== 'Enter' && e.key !== ' ') return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTileShareTagFilter(
                                        tileShareTagFilter?.toLowerCase() === tag.toLowerCase() ? null : tag
                                      );
                                    }}
                                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                      tileShareTagFilter?.toLowerCase() === tag.toLowerCase()
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 hover:bg-teal-100'
                                    }`}
                                  >
                                    🏷️ {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {showEmojiPicker && (
          <div className={`mb-2 h-72 rounded-xl overflow-hidden shadow-inner border ${t.emojiPanel}`}>
            <EmojiPickerPanel
              onSelect={(emoji) => {
                insertEmoji(emoji);
                setShowEmojiPicker(false);
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-0.5">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              disabled={isLoading || selectedTile !== null || showJsonInput}
              className={`h-8 w-8 flex items-center justify-center text-base rounded-lg hover:scale-110 transition-all disabled:opacity-40 ${t.quickHover}`}
              title={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <button
            onClick={() => {
              setShowTileSelector(!showTileSelector);
              setShowJsonInput(false);
              setShowEmojiPicker(false);
            }}
            className={`p-2 rounded-xl transition-colors ${
              showTileSelector ? t.tileOn : t.tileOff
            }`}
            title="Share a tile"
          >
            <span className="text-lg" aria-hidden>📦</span>
          </button>
          <button
            onClick={() => {
              setShowJsonInput(!showJsonInput);
              setShowTileSelector(false);
              setShowEmojiPicker(false);
            }}
            className={`p-2 rounded-xl transition-colors ${
              showJsonInput ? t.jsonOn : t.jsonOff
            }`}
            title="Share JSON code"
          >
            <span className="text-lg" aria-hidden>🧩</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowTileSelector(false);
              setShowJsonInput(false);
            }}
            disabled={isLoading || selectedTile !== null || showJsonInput}
            className={`p-2 rounded-xl transition-colors disabled:opacity-40 ${
              showEmojiPicker ? t.emojiOn : t.emojiOff
            }`}
            title="Add emoji"
          >
            <span className="text-lg" aria-hidden>😊</span>
          </button>
          <div className="flex-1 flex flex-col">
            <input
              ref={messageInputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 10000) {
                  setInputMessage(value);
                }
              }}
              onKeyPress={handleKeyPress}
              placeholder="Type a message… ✨"
              maxLength={10000}
              className={`w-full px-4 py-2.5 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${t.input}`}
              disabled={selectedTile !== null || showJsonInput}
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
            className={`px-4 py-2.5 text-white rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold ${t.send}`}
            title="Send"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : chatTheme === 'indigo' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            ) : (
              <span className="text-lg leading-none" aria-hidden>{t.sendIcon}</span>
            )}
          </button>
        </div>
      </div>
      </div>

      {/* Duplicate Tile Dialog */}
      {duplicateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDuplicateDialog(null)}>
          <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md w-full mx-4 border ${t.dialog}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              📦 Tile already exists
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              A tile named <strong className="text-slate-900 dark:text-white">"{duplicateDialog.existingTile.title}"</strong> already exists in your Private area under the Imported category. What would you like to do?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleImportTile(duplicateDialog.newTile, 'duplicate')}
                className={`w-full px-4 py-2 rounded-xl transition-colors text-sm font-medium ${t.dialogDup}`}
              >
                📄 Create duplicate copy
              </button>
              <button
                onClick={() => handleImportTile(duplicateDialog.newTile, 'merge')}
                className="w-full px-4 py-2 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 text-sky-900 dark:text-sky-200 rounded-xl transition-colors text-sm font-medium"
              >
                🔗 Merge links (add new links to existing tile)
              </button>
              <button
                onClick={() => handleImportTile(duplicateDialog.newTile, 'overwrite')}
                className="w-full px-4 py-2 bg-rose-100 dark:bg-rose-900/30 hover:bg-rose-200 dark:hover:bg-rose-900/50 text-rose-900 dark:text-rose-200 rounded-xl transition-colors text-sm font-medium"
              >
                ⚠️ Overwrite existing tile
              </button>
              <button
                onClick={() => setDuplicateDialog(null)}
                className="w-full px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors text-sm font-medium"
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
