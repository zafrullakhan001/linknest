export interface LinkHealth {
  status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted' | 'accessible';
  httpCode?: number | null;
  error?: string | null;
  checkedAt?: number | null;
}

export type LinkVisibility = 'public' | 'authenticated' | 'private';
export type TileVisibility = 'public' | 'authenticated' | 'private';

export interface Link {
  id: string;
  label: string;
  url: string;
  icon?: string; // Optional emoji or icon identifier
  textColor?: string; // Optional text color for the link (hex color code)
  health?: LinkHealth; // Link health status
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private links
  allowedGroups?: number[]; // Array of group IDs for private links
  notes?: string; // Optional notes/description for the link
  tooltip?: string; // Optional custom hover tooltip text
  richTextContent?: string; // Optional rich text HTML content - if present, shows dialog instead of opening URL
  visibleFrom?: string; // ISO date string - link becomes visible from this date/time
  expiresAt?: string; // ISO date string - link expires at this date/time
  browser?: string; // Browser to open link in (e.g., 'chrome-stable', 'edge-stable', 'default')
  isFavorite?: boolean; // Whether this link is favorited by the current user
  hasRoleAccess?: boolean; // Whether this link is accessible via user roles
  position?: number; // Position for ordering mixed content
  /** Entrance animation id (same set as space/tile animations). */
  animation?: string;
}

export interface RichTextContent {
  id: string;
  content: string; // HTML content with text and images
  position: number; // Position in the section (for sorting)
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private rich text content
  allowedGroups?: number[]; // Array of group IDs for private rich text content
  visibleFrom?: string; // ISO date string - content becomes visible from this date/time
  expiresAt?: string; // ISO date string - content expires at this date/time
}

export interface LinkSection {
  id: string;
  title: string;
  links: Link[];
  richTextContent?: RichTextContent[]; // Rich text content items in this section
  textColor?: string; // Optional custom text color for section title (hex color code)
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private sections
  allowedGroups?: number[]; // Array of group IDs for private sections
  visibleFrom?: string; // ISO date string - section becomes visible from this date/time
  expiresAt?: string; // ISO date string - section expires at this date/time
  forceStackedView?: boolean; // Force stacked view for this section regardless of global view preference
  position?: number; // Position in the tab (for sorting)
}

export interface Tab {
  id: string;
  title: string;
  position: number;
  sections: LinkSection[];
  textColor?: string; // Optional custom text color for tab title (hex color code)
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private tabs
  allowedGroups?: number[]; // Array of group IDs for private tabs
  visibleFrom?: string; // ISO date string - tab becomes visible from this date/time
  expiresAt?: string; // ISO date string - tab expires at this date/time
}

export interface Tile {
  id: string;
  userId?: number | null;
  title: string;
  description: string; // Short description for the dashboard card
  htmlContent?: string; // Rich HTML content for the landing page
  emoji: string;
  themeColor: ThemeColor;
  tabs: Tab[]; // Tabs contain sections
  sections?: LinkSection[]; // Deprecated: kept for backward compatibility, use tabs instead
  group?: string; // New: Category/Group for the tile
  createdAt: number;
  visibility?: TileVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  sourceTab?: 'public' | 'staging'; // Source tab: public (main) or staging (admin-only staging area)
  allowedUsers?: number[]; // Array of user IDs for private tiles/spaces
  allowedGroups?: number[]; // Array of user group IDs for private tiles/spaces
  isFavorite?: boolean; // Whether this tile is favorited by the current user
  isHyperlink?: boolean; // Whether this tile is a hyperlink instead of a space
  hyperlinkUrl?: string; // URL for hyperlink tiles
  openInNewTab?: boolean; // Whether hyperlink should open in new tab (true) or same tab (false)
  canView?: boolean; // Whether the current user can view this tile (based on tile access permissions)
  canEdit?: boolean; // Whether the current user can edit this tile (based on tile access permissions)
  canDelete?: boolean; // Whether the current user can delete this tile (based on tile access permissions)
  hasRoleAccess?: boolean; // Whether this tile is accessible via user roles
  // Granular permissions for tile admins
  canAddLinks?: boolean;
  canAddSections?: boolean;
  canAddTabs?: boolean;
  canEditLinks?: boolean;
  canDeleteLinks?: boolean;
  canDeleteSections?: boolean;
  canDeleteTabs?: boolean;
  canChangeVisibility?: boolean;
  canChangeBrowser?: boolean;
  canCloneTile?: boolean;
  canViewTileInfo?: boolean;
  canEditTile?: boolean;
  deletedAt?: number; // Timestamp when tile was deleted (for recycle bin)
  visibleFrom?: string; // ISO date string - tile becomes visible from this date/time
  expiresAt?: string; // ISO date string - tile expires at this date/time
  archivedAt?: number; // Timestamp when tile was archived
  browser?: string; // Browser to open links in: 'default', 'chrome', 'firefox', 'edge', 'safari', or custom browser ID
  // Tile decoration properties
  tileBackgroundColor?: string; // Background color (hex code)
  tileGradientEnabled?: boolean; // Whether to use gradient background
  tileGradientColors?: string[]; // Array of gradient colors (hex codes)
  tileGradientDirection?: string; // Gradient direction (e.g., 'to right', 'to bottom', '45deg')
  tileGradientType?: 'linear' | 'radial' | 'conic' | 'repeating-linear' | 'repeating-radial' | 'repeating-conic'; // Gradient type
  tileGradientColorPositions?: number[]; // Array of color stop positions (0-100) for each gradient color
  tileBorderRadius?: number; // Border radius in pixels
  tileTextColor?: string; // Text color (hex code)
  /** Entrance animation for link sections on this space page (not individual links). */
  pageAnimation?: string;
  messages?: TileMessage[]; // Array of scheduled messages
  // Shared-with-me: when tile was shared by another user and receiver accepted
  sharedWithMeInvitationId?: number | null;
  sharedWithMeSharer?: { userId: number; username: string } | null;
}

export interface TileMessage {
  id: string;
  content: string;
  type: 'info' | 'warning' | 'celebration' | 'alert' | 'custom';
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  isActive: boolean;
  priority?: number; // Display order priority (lower number = higher priority)
  textColor?: string; // Text color (hex code)
  fontStyle?: string; // Font style (normal, italic, bold, bold italic, etc.)
  displayLocation?: 'tile' | 'detail' | 'both'; // Where to display the message
  animationType?: 'rollover' | 'still' | 'flash' | 'flip-horizontal' | 'flip-vertical' | 'bounce' | 'pulse' | 'shake' | 'fade' | 'slide'; // Animation type
  delayBefore?: number; // Delay in seconds before showing this message (for sequential display when multiple messages are active)
  celebrationEffect?: 'none' | 'fireworks' | 'confetti' | 'snowfall' | 'hearts-rising' | 'hearts-falling' | 'bubbles' | 'butterflies' | 'birds-flying' | 'rocket-launch' | 'burst-fireworks' | 'sparkles' | 'petals' | 'shooting-stars' | 'leaves' | 'fireflies' | 'balloons' | 'stars' | 'rainbow'; // Visual effect for celebration messages
  celebrationConfig?: CelebrationConfig; // Optional overrides for celebration animation
  url?: string; // Optional URL link for more information about the message
  urlLabel?: string; // Optional custom display text for the link (e.g. "Learn more", "View details")
}

/** Optional per-message overrides for celebration effect animations. All values use defaults when omitted. */
export interface CelebrationConfig {
  /** 0–100. Affects opacity and speed. Default 100. */
  intensity?: number;
  /** Particles per burst (hearts, bubbles, confetti, snowflakes, firework particles). Default varies by effect. */
  particleCount?: number;
  /** 50–200. Size multiplier (%). Default 100. */
  particleSize?: number;
  /** 20–200. Speed multiplier (%). Default 100. */
  speed?: number;
  /** Milliseconds between bursts. Default 5000. Min 2000, max 15000. */
  triggerIntervalMs?: number;
}

export const THEME_COLORS = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'fuchsia',
  'orange',
  'red',
  'indigo',
  'lime',
  'sky',
  'slate',
  'teal',
  'pink',
  'purple',
  'yellow',
  'zinc'
] as const;

export type ThemeColor = typeof THEME_COLORS[number];

export const POPULAR_EMOJIS = [
  '💻', '🎨', '🚀', '📚', '🛠️', '🎮', '🎵', '🎬', '📷', '📝',
  '💰', '🏥', '✈️', '🛒', '🍔', '🏋️', '🏠', '🎓', '🔐', '☁️',
  '📱', '🌐', '💡', '📅', '🔍', '⚙️', '📂', '📧', '📊', '📈',
  '⚡', '🎁', '🔔', '🔒', '🔑', '🏷️', '📌', '📎', '✏️', '🖌️',
  // Infrastructure
  '🏗️', '🏢', '🏭', '🔩', '🔧', '🔌', '🗄️', '🖥️', '💾', '📡', '🔋', '🗃️', '🖨️',
  '🔄', '⚙️', '📦', '🌍', '🌎', '🏘️', '🏡', '🏚️', '🏙️', '🌆', '🌇', '🌃', '🌉',
  '🌁', '⛽', '🏗️', '🚧', '🛣️', '🛤️', '🚇', '🚊', '🚝', '🚞', '🚋', '🚃', '🚈',
  // Healthcare
  '⚕️', '🩺', '💊', '💉', '🚑', '🩹', '🏨', '🔬', '🧪', '🫀', '🫁', '🦷',
  '🦴', '🧠', '👁️', '👂', '👃', '🦵', '🦶', '🩼', '🦽', '🦼', '🚨', '⛑️', '🧑‍⚕️',
  '👨‍⚕️', '👩‍⚕️', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🏩', '💈', '🧴', '🧬', '🩸', '🫁',
  // Mobile handsets & Communication
  '📲', '📞', '☎️', '📟', '📠', '📻', '📺', '⌨️', '🖱️', '🖲️', '💽', '📀', '💿',
  '📼', '🎙️', '🎚️', '🎛️', '📡', '📶', '📢', '📣', '📻', '📺', '🎥', '📹', '📷',
  '📸', '🎞️', '🎬', '🔊', '🔉', '🔈', '🔇', '🎵', '🎶', '🎤', '🎧', '🎧', '📻',
  // Social media & Networking
  '👥', '💬', '📢', '🔗', '🌍', '🌎', '🌏', '💌', '📸', '📹', '📺',
  '🌐', '🗺️', '📍', '🧭', '📡', '📞', '📧', '📨', '📩', '📤', '📥', '📦', '📪',
  '📫', '📬', '📭', '📮', '💬', '💭', '🗨️', '🗯️', '💢', '👤', '👥', '🗣️', '👨‍💻',
  '👩‍💻', '👨‍💼', '👩‍💼', '🤝', '🤲', '🙌', '👏', '👍', '👎', '👊', '✊', '🤛', '🤜',
  // Corporate & Business
  '💼', '👔', '🤝', '🏦', '🏛️', '🎯', '📋', '✍️', '📑', '📄',
  '📊', '📈', '📉', '📌', '📍', '🗂️', '📁', '📂', '🗄️', '🗃️', '📓', '📔', '📒',
  '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧾', '📋', '📜', '📃', '📄', '📑',
  '🧾', '📰', '🗞️', '📄', '💳', '💵', '💴', '💶', '💷', '💰', '💸', '💎', '🏆',
  '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🏵️', '🎟️', '🎫', '🎪', '🎭', '🎨', '🎬',
  // Tech & IT
  '💻', '⌨️', '🖱️', '🖲️', '🖨️', '🖥️', '💾', '💿', '📀', '📼', '🔌', '🔋', '⚡',
  '🛠️', '🔧', '🔩', '⚙️', '🗜️', '🔨', '⚒️', '🛠️', '🔪', '🗡️', '⚔️', '🛡️', '🔒',
  '🔓', '🔐', '🔑', '🗝️', '🔑', '🔐', '🔒', '🔓', '🔌', '🔋', '💡', '🔦', '🕯️',
  '🧯', '🛒', '🛍️', '🛒', '🧰', '🧲', '🧪', '🧫', '🔬', '🔭', '📡', '🛰️', '🚀',
  // Food & Dining
  '🍔', '🍕', '🍖', '🍗', '🥩', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇',
  '🥞', '🧈', '🍞', '🥐', '🥨', '🥯', '🥖', '🧀', '🥗', '🥙', '🥪', '🌮', '🌯',
  '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘',
  '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮',
  '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕',
  '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉',
  '🧊', '🥢', '🍽️', '🍴', '🥄', '🔪', '🫙', '🏺', '⚱️', '⚰️', '🪦', '🪦', '🪦',
  // Transport & Travel
  '✈️', '🛫', '🛬', '🛩️', '💺', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸', '🚤',
  '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛵', '🛶', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓',
  '⛵', '🛶', '🚤', '🚣', '🛶', '🚁', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈',
  '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔',
  '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🛴', '🚲',
  '🛺', '🚨', '🚔', '🚍', '🚌', '🚐', '🚒', '🚑', '🚓', '🚗', '🚙', '🚚', '🚛',
  '🚜', '🏎️', '🏍️', '🛵', '🛴', '🚲', '🛺', '🚲', '🛴', '🛵', '🏍️', '🏎️', '🚜',
  // Education & Learning
  '📚', '📖', '📗', '📘', '📙', '📕', '📓', '📔', '📒', '📃', '📜', '📄', '📑',
  '🧾', '📊', '📈', '📉', '📊', '📋', '📌', '📍', '🗂️', '📁', '📂', '🗄️', '🗃️',
  '🎓', '👨‍🎓', '👩‍🎓', '🧑‍🎓', '👨‍🏫', '👩‍🏫', '🧑‍🏫', '👨‍🏭', '👩‍🏭', '🧑‍🏭', '👨‍💻', '👩‍💻', '🧑‍💻',
  '👨‍💼', '👩‍💼', '🧑‍💼', '👨‍🔧', '👩‍🔧', '🧑‍🔧', '👨‍🔬', '👩‍🔬', '🧑‍🔬', '👨‍🎨', '👩‍🎨', '🧑‍🎨', '👨‍✈️',
  '👩‍✈️', '🧑‍✈️', '👨‍🚀', '👩‍🚀', '🧑‍🚀', '👨‍⚖️', '👩‍⚖️', '🧑‍⚖️', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️',
  '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '🥷', '👷', '👷‍♂️', '👷‍♀️', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️',
  // Sports & Fitness
  '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒',
  '🏑', '🥍', '🏏', '🥅', '⛳', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️',
  '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤼‍♂️', '🤼‍♀️', '🤸', '🤸‍♂️', '🤸‍♀️', '⛹️',
  '⛹️‍♂️', '⛹️‍♀️', '🤺', '🤾', '🤾‍♂️', '🤾‍♀️', '🏌️', '🏌️‍♂️', '🏌️‍♀️', '🏇', '🧘', '🧘‍♂️', '🧘‍♀️',
  // Gaming & Entertainment
  '🎮', '🕹️', '🎰', '🎲', '🧩', '♠️', '♥️', '♦️', '♣️', '🃏', '🀄', '🎴', '🎯',
  '🎳', '🎪', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎵', '🎶', '🎹', '🥁',
  '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🕹️', '🎰', '🧩',
  // Nature & Weather
  '🌍', '🌎', '🌏', '🌐', '🗺️', '🧭', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️',
  '🏝️', '🏞️', '🏟️', '🏛️', '🏗️', '🧱', '🏘️', '🏚️', '🏠', '🏡', '🏢', '🏣', '🏤',
  '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽',
  '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃', '🏙️', '🌄', '🌅',
  '🌆', '🌇', '🌉', '♨️', '🎠', '🎡', '🎢', '💈', '🎪', '🚂', '🚃', '🚄', '🚅',
  '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑',
  '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️',
  '🛵', '🛴', '🚲', '🛺', '🚨', '🚔', '🚍', '🚌', '🚐', '🚒', '🚑', '🚓', '🚗',
  // Time & Calendar
  '📅', '📆', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏',
  '📐', '✂️', '🗑️', '🔒', '🔓', '🔏', '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '⚒️',
  '🛠️', '🗡️', '⚔️', '🔫', '🪃', '🏹', '🛡️', '🪚', '🔧', '🪛', '🔩', '⚙️', '🗜️',
  '⚖️', '🦯', '🔗', '⛓️', '🧰', '🧲', '🪜', '🛠️', '🔩', '⚙️', '🗜️', '⚖️', '🦯',
  '🔗', '⛓️', '🧰', '🧲', '🪜', '🧱', '🪤', '🪝', '🧯', '🛢️', '💸', '💵', '💴',
  '💶', '💷', '💰', '💳', '💎', '⚖️', '🪜', '🧱', '🪤', '🪝', '🧯', '🛢️', '🧱',
  // Objects & Tools
  '🔦', '🕯️', '🧯', '🛒', '🛍️', '🛒', '🧰', '🧲', '🧪', '🧫', '🔬', '🔭', '📡',
  '🛰️', '🚀', '🛸', '🧯', '🛒', '🛍️', '🛒', '🧰', '🧲', '🧪', '🧫', '🔬', '🔭',
  // Symbols & Shapes
  '❌', '⭕', '✅', '✔️', '✖️', '➕', '➖', '➗', '🔴', '🟠', '🟡', '🟢', '🔵',
  '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳',
  '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪',
  '⬛', '⬜', '🟫', '🔈', '🔉', '🔊', '🔇', '📢', '📣', '📯', '🔔', '🔕', '📻',
  // Flags & Country
  '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇳', '🇦🇫', '🇦🇽', '🇦🇱', '🇩🇿', '🇦🇸',
  '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭',
  '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿', '🇧🇯', '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇮🇴',
  '🇻🇬', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦', '🇮🇶', '🇮🇲', '🇨🇱', '🇨🇳', '🇨🇽',
  '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬', '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮', '🇭🇷', '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿',
  '🇩🇰', '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇸🇿', '🇪🇹', '🇪🇺',
  '🇫🇰', '🇫🇴', '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇫', '🇵🇫', '🇹🇫', '🇬🇦', '🇬🇲', '🇬🇪', '🇩🇪', '🇬🇭',
  '🇬🇮', '🇬🇷', '🇬🇱', '🇬🇩', '🇬🇵', '🇬🇺', '🇬🇹', '🇬🇬', '🇬🇳', '🇬🇼', '🇬🇾', '🇭🇹', '🇭🇳',
  '🇭🇰', '🇭🇺', '🇮🇸', '🇮🇳', '🇮🇩', '🇮🇷', '🇮🇶', '🇮🇪', '🇮🇹', '🇯🇪', '🇯🇲', '🇯🇵', '🇯🇴',
  '🇰🇿', '🇰🇪', '🇰🇮', '🇽🇰', '🇰🇼', '🇰🇬', '🇱🇦', '🇱🇻', '🇱🇧', '🇱🇸', '🇱🇷', '🇱🇾', '🇱🇮',
  '🇱🇹', '🇱🇺', '🇲🇴', '🇲🇬', '🇲🇼', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹', '🇲🇭', '🇲🇶', '🇲🇷', '🇲🇺',
  '🇾🇹', '🇲🇽', '🇫🇲', '🇲🇩', '🇲🇨', '🇲🇳', '🇲🇪', '🇲🇸', '🇲🇦', '🇲🇿', '🇲🇲', '🇳🇦', '🇳🇷',
  '🇳🇵', '🇳🇱', '🇳🇨', '🇳🇿', '🇳🇮', '🇳🇪', '🇳🇬', '🇳🇺', '🇳🇫', '🇰🇵', '🇲🇰', '🇲🇵', '🇳🇴',
  '🇴🇲', '🇵🇰', '🇵🇼', '🇵🇸', '🇵🇦', '🇵🇬', '🇵🇾', '🇵🇪', '🇵🇭', '🇵🇳', '🇵🇱', '🇵🇹', '🇵🇷',
  '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇺', '🇷🇼', '🇼🇸', '🇸🇲', '🇸🇹', '🇸🇦', '🇸🇳', '🇷🇸', '🇸🇨', '🇸🇱',
  '🇸🇬', '🇸🇽', '🇸🇰', '🇸🇮', '🇬🇸', '🇸🇧', '🇸🇴', '🇿🇦', '🇰🇷', '🇸🇸', '🇪🇸', '🇱🇰', '🇧🇱',
  '🇸🇭', '🇰🇳', '🇱🇨', '🇵🇲', '🇻🇨', '🇸🇩', '🇸🇷', '🇸🇪', '🇨🇭', '🇸🇾', '🇹🇼', '🇹🇯', '🇹🇿',
  '🇹🇭', '🇹🇱', '🇹🇬', '🇹🇰', '🇹🇴', '🇹🇹', '🇹🇳', '🇹🇷', '🇹🇲', '🇹🇨', '🇹🇻', '🇺🇬', '🇺🇦',
  '🇦🇪', '🇬🇧', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇺', '🇻🇦', '🇻🇪', '🇻🇳', '🇻🇬', '🇻🇮', '🇼🇫', '🇪🇭',
  '🇾🇪', '🇿🇲', '🇿🇼', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️',
  // Special & Miscellaneous
  '⭐', '🌟', '💫', '✨', '💥', '💢', '💦', '💨', '☀️', '🌤️', '⛅', '🌥️', '☁️',
  '🌦️', '🌧️', '⛈️', '🌩️', '⚡', '☔', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦',
  '🔥', '🌊', '🌈', '☂️', '☔', '⚡', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦',
  '🔥', '🌊', '🌈', '☂️', '☔', '⚡', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦',
  // Additional useful icons
  '🎉', '🎊', '🎈', '🎁', '🎀', '🎃', '🎄', '🎅', '🤶', '🧑‍🎄', '🎆', '🎇', '🧨',
  '✨', '🎈', '🎉', '🎊', '🎁', '🎀', '🎃', '🎄', '🎅', '🤶', '🧑‍🎄', '🎆', '🎇',
  '🧨', '🔔', '🔕', '🎵', '🎶', '🎤', '🎧', '📻', '🎷', '🎺', '🎸', '🪕', '🎻',
  '🎹', '🥁', '🪘', '🎧', '🎼', '🎵', '🎶', '🎤', '🎧', '📻', '🎷', '🎺', '🎸',
  '🪕', '🎻', '🎹', '🥁', '🪘', '🎮', '🕹️', '🎰', '🎲', '🧩', '♠️', '♥️', '♦️',
  '♣️', '🃏', '🀄', '🎴', '🎯', '🎳', '🎪', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧',
  '🎼', '🎵', '🎶', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯',
  '🎳', '🎮', '🕹️', '🎰', '🧩'
];

// Comprehensive emoji list for links - servers, cloud, onprem, hospital modalities, etc.
export const LINK_EMOJIS = {
  servers: ['🖥️', '💾', '🖨️', '📡', '🔄', '⚙️', '🔧', '🛠️', '📦', '🗄️', '🗃️', '📊', '📈', '📉', '🔌', '🔋', '⚡', '🌐', '🌍', '🌎'],
  cloud: ['☁️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️', '☁️‍️'],
  onprem: ['🏢', '🏭', '🏗️', '🏛️', '🏘️', '🏠', '🏡', '🏚️', '🏙️', '🌆', '🌇', '🌃', '🌉', '🌁', '🌉', '🌉', '🌉', '🌉', '🌉', '🌉'],
  hospital: ['🏥', '⚕️', '🩺', '💊', '💉', '🩹', '🩼', '🦽', '🦼', '🚑', '🚨', '🏨', '👨‍⚕️', '👩‍⚕️', '🧑‍⚕️', '👨‍🔬', '👩‍🔬', '🧑‍🔬', '🔬', '🧪'],
  modalities: ['📷', '📸', '📹', '🎥', '📽️', '🎞️', '📼', '💿', '💾', '💽', '📀', '🖥️', '🖨️', '📠', '📺', '📻', '📱', '📞', '☎️', '📟'],
  medical: ['🫀', '🫁', '🧠', '🦷', '🦴', '👁️', '👂', '👃', '👄', '🦵', '🦶', '👶', '👧', '🧒', '👦', '👩', '👨', '👴', '👵', '🧓'],
  technology: ['💻', '⌨️', '🖱️', '🖲️', '🖨️', '🖥️', '📱', '📲', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📺', '📻'],
  network: ['🌐', '📡', '📶', '📞', '☎️', '📠', '📧', '📨', '📩', '📤', '📥', '📦', '📪', '📫', '📬', '📭', '📮', '🗳️', '📯', '📜'],
  security: ['🔐', '🔒', '🔓', '🔑', '🗝️', '🛡️', '⚔️', '🗡️', '🔪', '🛠️', '🔧', '🔩', '⚙️', '⛓️', '🔗', '⛓️‍💥', '🔫', '💣', '🧨', '🎯'],
  data: ['📊', '📈', '📉', '📋', '📌', '📍', '🗂️', '📁', '📂', '🗂️', '🗄️', '🗃️', '📑', '📃', '📄', '📃', '📜', '📰', '📓', '📔'],
  communication: ['💬', '💭', '🗨️', '🗯️', '💢', '💬', '👤', '👥', '👤', '👥', '🗣️', '👤', '👥', '👤', '👥', '👤', '👥', '👤', '👥', '👤'],
  all: ['🖥️', '💾', '🖨️', '📡', '🔄', '⚙️', '🔧', '🛠️', '📦', '🗄️', '🗃️', '📊', '📈', '📉', '🔌', '🔋', '⚡', '🌐', '🌍', '🌎', '☁️', '🏢', '🏭', '🏗️', '🏛️', '🏘️', '🏠', '🏡', '🏚️', '🏙️', '🌆', '🌇', '🌃', '🌉', '🌁', '🏥', '⚕️', '🩺', '💊', '💉', '🩹', '🩼', '🦽', '🦼', '🚑', '🚨', '🏨', '👨‍⚕️', '👩‍⚕️', '🧑‍⚕️', '👨‍🔬', '👩‍🔬', '🧑‍🔬', '🔬', '🧪', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📼', '💿', '💾', '💽', '📀', '🖥️', '🖨️', '📠', '📺', '📻', '📱', '📞', '☎️', '📟', '🫀', '🫁', '🧠', '🦷', '🦴', '👁️', '👂', '👃', '👄', '🦵', '🦶', '💻', '⌨️', '🖱️', '🖲️', '🖨️', '🖥️', '📱', '📲', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📺', '📻', '🌐', '📡', '📶', '📞', '☎️', '📠', '📧', '📨', '📩', '📤', '📥', '📦', '📪', '📫', '📬', '📭', '📮', '🗳️', '📯', '📜', '🔐', '🔒', '🔓', '🔑', '🗝️', '🛡️', '⚔️', '🗡️', '🔪', '🛠️', '🔧', '🔩', '⚙️', '⛓️', '🔗', '⛓️‍💥', '🔫', '💣', '🧨', '🎯', '📊', '📈', '📉', '📋', '📌', '📍', '🗂️', '📁', '📂', '🗂️', '🗄️', '🗃️', '📑', '📃', '📄', '📃', '📜', '📰', '📓', '📔', '💬', '💭', '🗨️', '🗯️', '💢', '💬', '👤', '👥', '🗣️']
};

// Flatten all emojis into a single array for easy access
export const ALL_LINK_EMOJIS = [
  ...LINK_EMOJIS.servers,
  ...LINK_EMOJIS.cloud,
  ...LINK_EMOJIS.onprem,
  ...LINK_EMOJIS.hospital,
  ...LINK_EMOJIS.modalities,
  ...LINK_EMOJIS.medical,
  ...LINK_EMOJIS.technology,
  ...LINK_EMOJIS.network,
  ...LINK_EMOJIS.security,
  ...LINK_EMOJIS.data,
  ...LINK_EMOJIS.communication
].filter((emoji, index, self) => self.indexOf(emoji) === index); // Remove duplicates

// Helper to generate styles that work in both Light and Dark mode
// Light mode: darker text, softer backgrounds
// Dark mode: lighter text, transparent backgrounds
const createStyle = (color: string, gradientTo: string) => ({
  base: `bg-${color}-600`,
  soft: `bg-${color}-50 text-${color}-700 dark:bg-${color}-500/10 dark:text-${color}-400`,
  border: `border-${color}-200 dark:border-${color}-500/30`,
  text: `text-${color}-600 dark:text-${color}-400`,
  hoverBorder: `hover:border-${color}-400 dark:hover:border-${color}-500`,
  gradient: `from-${color}-600 to-${gradientTo}-600 dark:to-${gradientTo}-900`,
  iconBg: `bg-${color}-100 text-${color}-700 dark:bg-${color}-500/20 dark:text-${color}-300`
});

export const COLOR_STYLES: Record<ThemeColor, {
  base: string;
  soft: string;
  border: string;
  text: string;
  hoverBorder: string;
  gradient: string;
  iconBg: string;
}> = {
  blue: createStyle('blue', 'indigo'),
  emerald: createStyle('emerald', 'teal'),
  violet: createStyle('violet', 'purple'),
  amber: createStyle('amber', 'orange'),
  rose: createStyle('rose', 'pink'),
  cyan: createStyle('cyan', 'blue'),
  fuchsia: createStyle('fuchsia', 'pink'),
  orange: createStyle('orange', 'red'),
  red: createStyle('red', 'orange'),
  indigo: createStyle('indigo', 'blue'),
  lime: createStyle('lime', 'green'),
  sky: createStyle('sky', 'blue'),
  slate: createStyle('slate', 'gray'),
  teal: createStyle('teal', 'emerald'),
  pink: createStyle('pink', 'rose'),
  purple: createStyle('purple', 'indigo'),
  yellow: createStyle('yellow', 'orange'),
  zinc: createStyle('zinc', 'neutral'),
};