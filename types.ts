export interface LinkHealth {
  status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted';
  httpCode?: number | null;
  error?: string | null;
  checkedAt?: number | null;
}

export interface Link {
  id: string;
  label: string;
  url: string;
  icon?: string; // Optional emoji or icon identifier
  health?: LinkHealth; // Link health status
}

export interface LinkSection {
  id: string;
  title: string;
  links: Link[];
}

export interface Tile {
  id: string;
  title: string;
  description: string; // Short description for the dashboard card
  htmlContent?: string; // Rich HTML content for the landing page
  emoji: string;
  themeColor: ThemeColor;
  sections: LinkSection[];
  group?: string; // New: Category/Group for the tile
  createdAt: number;
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