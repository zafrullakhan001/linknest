export interface LinkHealth {
  status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted';
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
  health?: LinkHealth; // Link health status
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private links
  notes?: string; // Optional notes/description for the link
  tooltip?: string; // Optional custom hover tooltip text
}

export interface LinkSection {
  id: string;
  title: string;
  links: Link[];
  textColor?: string; // Optional custom text color for section title (hex color code)
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private sections
}

export interface Tab {
  id: string;
  title: string;
  position: number;
  sections: LinkSection[];
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  allowedUsers?: number[]; // Array of user IDs for private tabs
}

export interface Tile {
  id: string;
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
  allowedUsers?: number[]; // Array of user IDs for private tiles/spaces
  isFavorite?: boolean; // Whether this tile is favorited by the current user
  isHyperlink?: boolean; // Whether this tile is a hyperlink instead of a space
  hyperlinkUrl?: string; // URL for hyperlink tiles
  openInNewTab?: boolean; // Whether hyperlink should open in new tab (true) or same tab (false)
  canView?: boolean; // Whether the current user can view this tile (based on tile access permissions)
  canEdit?: boolean; // Whether the current user can edit this tile (based on tile access permissions)
  canDelete?: boolean; // Whether the current user can delete this tile (based on tile access permissions)
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
  '⚡', '🎁', '🔔', '🔒', '🔑', '🏷️', '📌', '📎', '✏️', '🖌️'
];

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