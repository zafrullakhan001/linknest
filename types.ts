export interface LinkRedirectHop {
  step: number;
  url: string;
  httpCode: number;
  /** Location header as received (may be relative). */
  location?: string;
  locationRaw?: string;
  locationResolved?: string;
  locationRelative?: boolean;
  locationProtocolRelative?: boolean;
  error?: string;
  requestMethod?: string;
  /** 307/308 — browsers repeat the original method. Probe itself always uses HEAD. */
  methodPreserving?: boolean;
  timingMs?: number;
  dnsMs?: number;
  connectMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  ip?: string;
  port?: number;
  httpVersion?: string;
  server?: string;
  contentType?: string;
  contentLength?: number;
  setCookieNames?: string[];
  hsts?: boolean;
  cacheControl?: string;
  wwwAuthenticate?: string;
  loop?: boolean;
}

export interface LinkHealth {
  status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted' | 'accessible' | 'redirected' | 'network';
  httpCode?: number | null;
  error?: string | null;
  checkedAt?: number | null;
  /** Final URL after following redirects (when available from health probe). */
  finalUrl?: string | null;
  /** Number of redirects followed during the health probe (when available). */
  redirectCount?: number;
  /** Hop-by-hop redirect trace from the edit-form URL probe (when available). */
  redirectChain?: LinkRedirectHop[];
  /** WAF/CDN fingerprint from the edit-form URL probe (when available). */
  waf?: UrlWafInfo | null;
  /** URL security letter grade (HTTPS + headers), SSL Labs–style bands. */
  urlGrade?: UrlGradeInfo | null;
}

export interface UrlWafInfo {
  detected: boolean;
  vendor?: string | null;
  reason?: string;
  source?: string;
  inconclusive?: boolean;
}

export interface UrlGradeCheck {
  id: string;
  ok: boolean;
  label: string;
}

export interface UrlGradeInfo {
  letter: string;
  numeric: number;
  summary: string;
  checks?: UrlGradeCheck[];
}

/** Live URL Safety Intelligence verdict (not persisted on the link). */
export type UrlSafetyVerdict =
  | 'safe'
  | 'malicious'
  | 'adult'
  | 'suspicious'
  | 'unknown'
  | 'disabled';

export interface UrlSafetyFlag {
  id: string;
  category?: string;
  title: string;
  detail: string;
  source?: string;
  sourceLabel?: string;
  matchedDomain?: string;
}

export interface UrlSafetyResult {
  verdict: UrlSafetyVerdict;
  flags: UrlSafetyFlag[];
  listsReady?: boolean;
  listsPending?: boolean;
  requiresConfirm?: boolean;
  blockMalicious?: boolean;
  host?: string;
  matchedDomain?: string;
  sourceLabel?: string;
}

export type LinkVisibility = 'public' | 'authenticated' | 'private';

/** How a link opens when clicked. Default (missing) is `tab` (current behavior). */
export type LinkOpenTarget = 'same' | 'tab' | 'window' | 'browser' | 'private';
export type TileVisibility = 'public' | 'authenticated' | 'private';

export type AccessRestrictionMode = 'allow' | 'deny';
export type AccessDeviceType = 'any' | 'desktop' | 'mobile';
export type AccessBrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'brave' | 'vivaldi' | 'duckduckgo';
export type AccessOsName = 'windows' | 'macos' | 'linux' | 'android' | 'ios';

export interface AccessTimeRule {
  mode: AccessRestrictionMode;
  /** 1 (Monday) through 7 (Sunday). Null/omitted = any day. */
  dayOfWeek?: number | null;
  startTime: string;
  endTime: string;
}

export interface AccessHostRule {
  mode: AccessRestrictionMode;
  pattern: string;
}

export interface AccessBrowserRule {
  name: AccessBrowserName;
  minVersion?: number;
}

export interface AccessVpnRules {
  required?: boolean;
  allowedIpRanges?: string;
  trustedHeaderName?: string;
  trustedHeaderValue?: string;
}

/** HTTP-checkable open-time restrictions (tile, tab, or link). Empty/omitted = no extra gate. */
export interface AccessRestrictions {
  timeRules?: AccessTimeRule[];
  hostRules?: AccessHostRule[];
  vpn?: AccessVpnRules;
  allowedDeviceType?: AccessDeviceType;
  browsers?: AccessBrowserRule[];
  osAllow?: AccessOsName[];
  countryAllow?: string[];
  countryDeny?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
  referrerPatterns?: string[];
  /** SHA-256 fingerprint hashes (lnfp_… or hex). Non-empty = only matching browsers may open. */
  fingerprintHashes?: string[];
}

export interface Link {
  id: string;
  label: string;
  url: string;
  icon?: string; // Optional emoji or icon identifier
  textColor?: string; // Optional text color for the link (hex color code)
  health?: LinkHealth; // Link health status
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  published?: boolean; // When false, hidden from everyone except platform admins (overrides visibility)
  allowedUsers?: number[]; // Array of user IDs for private links
  allowedGroups?: number[]; // Array of group IDs for private links
  notes?: string; // Optional notes/description for the link
  tooltip?: string; // Optional custom hover tooltip (rich HTML — fonts, colors, and formatting are shown on hover)
  /** Hover tooltip presentation for this link. classic = native Windows/browser title; rich = formatted overlay. */
  tooltipStyle?: 'rich' | 'classic';
  /** When false, notes and hover tooltip are hidden. Content is kept. Unspecified infers from content. */
  notesEnabled?: boolean;
  /** Optional uploaded/recorded video URL shown in the Notes dialog with the notes text. */
  notesVideoUrl?: string;
  richTextContent?: string; // Optional rich text HTML content - if present, shows dialog instead of opening URL
  /** When false, clicking opens the URL even if richTextContent is stored. Unspecified infers from content. */
  richTextEnabled?: boolean;
  /** Optional uploaded/recorded video URL shown in the Info dialog with the info content. */
  infoVideoUrl?: string;
  /** When false, the info dialog hides the footer Open Link button. Defaults to shown. */
  infoShowOpenLink?: boolean;
  visibleFrom?: string; // ISO date string - link becomes visible from this date/time
  expiresAt?: string; // ISO date string - link expires at this date/time
  browser?: string; // Browser to open link in (e.g., 'chrome-stable', 'edge-stable', 'default')
  /** Where to open the URL: same window, new tab (default), compact popup, full browser window, or InPrivate/Incognito. */
  openTarget?: LinkOpenTarget;
  isFavorite?: boolean; // Whether this link is favorited by the current user
  hasRoleAccess?: boolean; // Whether this link is accessible via user roles
  position?: number; // Position for ordering mixed content
  /**
   * Entrance animation for this link.
   * Omitted/undefined = inherit space linksAnimation; 'none' = no animation; other id = override.
   */
  animation?: string;
  /** Open-time HTTP restrictions (does not hide the link). */
  accessRestrictions?: AccessRestrictions;
  /** Recyclable LinkNest short URL for this link. */
  shortUrl?: string;
  /**
   * On/omitted: inherit short-URL display from the parent section/tab/space.
   * Off: show the original URL even if the space has short URLs on.
   */
  inheritShortUrls?: boolean | null;
  /**
   * When true, always display and open this link as its short URL,
   * even if the space/tab/section uses original URLs.
   */
  forceShortUrl?: boolean | null;
  /**
   * When set, replaces the default "Broken" badge text when health.status === 'broken'
   * (or when brokenStatusManual is true).
   */
  brokenStatusLabel?: string | null;
  /** Optional hover note shown with the custom broken / lifecycle badge. */
  brokenStatusNote?: string | null;
  /** Badge color: red (default alarm), amber (lifecycle), slate (neutral). */
  brokenStatusTone?: 'red' | 'amber' | 'slate' | null;
  /** When true, downtime is expected — excluded from surprise broken stats. */
  brokenStatusExpected?: boolean | null;
  /** When true, show the custom label badge even if health is not broken. */
  brokenStatusManual?: boolean | null;
  /** Optional hex color for the badge label text. */
  brokenStatusFontColor?: string | null;
  /** Badge label weight: normal or bold. */
  brokenStatusFontWeight?: 'normal' | 'bold' | null;
  /** Badge label style: normal or italic. */
  brokenStatusFontStyle?: 'normal' | 'italic' | null;
  /** CSS font-family stack for the badge label (includes cursive/script options). */
  brokenStatusFontFamily?: string | null;
  /** When true, clicking the link shows the maintenance dialog instead of opening the URL. */
  maintenanceEnabled?: boolean;
  /** HTML maintenance message shown in the dialog. Kept when the toggle is off. */
  maintenanceMessage?: string;
  /** Optional uploaded/recorded video URL for the maintenance dialog. */
  maintenanceVideoUrl?: string;
  /**
   * When true, the Preview on mobile action opens a Device emulation popup
   * directly (skipping the in-app Device Preview dialog).
   */
  mobilePreviewEmulation?: boolean;
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
  boxed?: boolean; // Wrap content in a styled box with header/footer
  boxTitle?: string; // Header title when boxed
  boxFooter?: string; // Optional footer text when boxed
  boxHeaderAlign?: 'left' | 'center' | 'right';
  boxFooterAlign?: 'left' | 'center' | 'right';
  boxHeaderBg?: string; // Header background hex color
  boxFooterBg?: string; // Footer background hex color
  boxBodyBg?: string; // Content/body background hex color
  boxHeaderFontWeight?: 'normal' | 'bold';
  boxFooterFontWeight?: 'normal' | 'bold';
  boxHeaderFontSize?: 'sm' | 'md' | 'lg';
  boxFooterFontSize?: 'sm' | 'md' | 'lg';
  boxHeaderEmoji?: string; // Optional emoji shown left of header title
  boxImportance?: 'notes' | 'info' | 'tip' | 'important' | 'warning' | 'critical';
}

/** Media library file kinds */
export type MediaKind = 'image' | 'pdf' | 'audio' | 'video' | 'other';
export type MediaStatus = 'active' | 'archived' | 'trash';

export interface MediaFolder {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
  createdBy: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MediaTag {
  id: number;
  name: string;
}

export interface MediaFile {
  id: number;
  folderId: number | null;
  uuid: string;
  originalName: string;
  storedName: string;
  thumbName: string | null;
  mime: string;
  kind: MediaKind;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  title: string | null;
  altText: string | null;
  description: string | null;
  status: MediaStatus;
  uploadedBy: number | null;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
  url: string | null;
  thumbUrl: string | null;
  tags?: string[];
}

export interface MediaListResponse {
  data: MediaFile[];
  total: number;
  page: number;
  perPage: number;
}

export interface MediaTransformOptions {
  width?: number;
  height?: number;
  crop?: { x: number; y: number; w: number; h: number };
  /** Clockwise rotation in degrees: 90, 180, or 270 */
  rotate?: 90 | 180 | 270;
  quality?: number;
  format?: 'png' | 'jpg' | 'webp';
  /** fit = contain inside box (default). exact = stretch to width×height */
  resizeMode?: 'fit' | 'exact';
  removeBackground?: boolean;
  bgColor?: string;
  /** When true, overwrite the existing file; default saves as a new file */
  replace?: boolean;
}

export interface LinkSection {
  id: string;
  title: string;
  /** Optional emoji shown to the left of the section title. */
  emoji?: string;
  links: Link[];
  richTextContent?: RichTextContent[]; // Rich text content items in this section
  textColor?: string; // Optional custom text color for section title (hex color code)
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  published?: boolean; // When false, hidden from everyone except platform admins (overrides visibility)
  allowedUsers?: number[]; // Array of user IDs for private sections
  allowedGroups?: number[]; // Array of group IDs for private sections
  visibleFrom?: string; // ISO date string - section becomes visible from this date/time
  expiresAt?: string; // ISO date string - section expires at this date/time
  forceStackedView?: boolean; // Force stacked view for this section regardless of global view preference
  position?: number; // Position in the tab (for sorting)
  /** Recyclable LinkNest short URL for this section. */
  shortUrl?: string;
  /**
   * On/omitted: inherit short-URL display from the parent tab/space.
   * Off: show original URLs for this section even if the space has short URLs on.
   */
  inheritShortUrls?: boolean | null;
}

export interface Tab {
  id: string;
  title: string;
  /** Optional emoji shown to the left of the tab title. */
  emoji?: string;
  position: number;
  sections: LinkSection[];
  textColor?: string; // Optional custom text color for tab title (hex color code)
  visibility?: LinkVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  published?: boolean; // When false, hidden from everyone except platform admins (overrides visibility)
  allowedUsers?: number[]; // Array of user IDs for private tabs
  allowedGroups?: number[]; // Array of group IDs for private tabs
  visibleFrom?: string; // ISO date string - tab becomes visible from this date/time
  expiresAt?: string; // ISO date string - tab expires at this date/time
  /** Open-time HTTP restrictions (does not hide the tab). */
  accessRestrictions?: AccessRestrictions;
  /** Recyclable LinkNest short URL for this tab. */
  shortUrl?: string;
  /**
   * On/omitted: inherit short-URL display from the space.
   * Off: show original URLs for this tab even if the space has short URLs on.
   */
  inheritShortUrls?: boolean | null;
}

export interface Tile {
  id: string;
  userId?: number | null;
  title: string;
  description: string; // Short description for the dashboard card
  htmlContent?: string; // Rich HTML content for the landing page
  emoji: string;
  /** When false, the emoji badge is hidden on the space/tile card. Default true. */
  showEmoji?: boolean | null;
  /** When false, the title is hidden on the space/tile card. Default true. */
  showTitle?: boolean | null;
  /** When false, the description is hidden on the space/tile card. Default true. */
  showDescription?: boolean | null;
  /** When true, viewers see/copy/QR the recyclable short URL instead of the original destination. */
  showShortUrls?: boolean | null;
  /** Recyclable LinkNest short URL for this space. */
  shortUrl?: string;
  /** Optional PNG URL shown inside the emoji badge (replaces the emoji character when set). */
  emojiImage?: string | null;
  /** Opacity of the emoji/icon image (0–100). Default 100. */
  emojiImageOpacity?: number | null;
  /** Fine horizontal offset in pixels (−50…50). Default 0. */
  emojiImageOffsetX?: number | null;
  /** Fine vertical offset in pixels (−50…50). Default 0. */
  emojiImageOffsetY?: number | null;
  /** Zoom of the emoji/icon image (50–300%). Default 100. */
  emojiImageZoom?: number | null;
  /** Optional PNG shown in the tile card top-right header region (behind admin controls). */
  headerImage?: string | null;
  /** Horizontal alignment of the header image within the controls region. */
  headerImageAlign?: 'left' | 'center' | 'right' | null;
  /** Opacity of the header image (0–100). Default 100. */
  headerImageOpacity?: number | null;
  /** Fine horizontal offset in pixels (−300…300). Default 0. */
  headerImageOffsetX?: number | null;
  /** Fine vertical offset in pixels (−300…300). Default 0. */
  headerImageOffsetY?: number | null;
  /** Zoom of the header image (50–300%). Default 100. */
  headerImageZoom?: number | null;
  /** How the image scales in the header region: contain (center fit) or cover (fill). */
  headerImageFit?: 'contain' | 'cover' | null;
  themeColor: ThemeColor;
  tabs: Tab[]; // Tabs contain sections
  sections?: LinkSection[]; // Deprecated: kept for backward compatibility, use tabs instead
  group?: string; // New: Category/Group for the tile
  /** Dashboard card order (global across categories). Lower = earlier. */
  position?: number;
  /** Alternate search keywords (up to 100); matched by global "Search spaces…" */
  searchTags?: string[];
  createdAt: number;
  visibility?: TileVisibility; // Visibility setting: 'public', 'authenticated', or 'private'
  published?: boolean; // When false, hidden from everyone except platform admins (overrides visibility)
  sourceTab?: 'public' | 'staging'; // Source tab: public (main) or staging (admin-only staging area)
  allowedUsers?: number[]; // Array of user IDs for private tiles/spaces
  allowedGroups?: number[]; // Array of user group IDs for private tiles/spaces
  isFavorite?: boolean; // Whether this tile is favorited by the current user
  isHyperlink?: boolean; // Whether this tile is a hyperlink instead of a space
  hyperlinkUrl?: string; // URL for hyperlink tiles
  openInNewTab?: boolean; // Whether hyperlink should open in new tab (true) or same tab (false)
  /** Video space: plays YouTube or an uploaded file in-app (not a link list). */
  isVideo?: boolean;
  /** YouTube URL or uploaded video file URL for video spaces. */
  videoUrl?: string;
  /** How videoUrl should be interpreted. */
  videoSource?: 'youtube' | 'file';
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
  /** Open-time HTTP restrictions (does not hide the space). Null/undefined = none. */
  accessRestrictions?: AccessRestrictions | null;
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
  /** Default entrance animation for all links on this space (links may inherit or override). null clears persisted default. */
  linksAnimation?: string | null;
  messages?: TileMessage[]; // Array of scheduled messages
  /** Link count for home-grid cards when nested graph is omitted (summary mode). */
  linkCount?: number;
  /**
   * Lightweight links for home-grid search (summary mode).
   * Present when tabs/sections are omitted so search can still match labels/URLs.
   */
  searchLinks?: Link[];
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

export type EmojiPickerCategory = {
  id: string;
  name: string;
  keywords: string;
  emojis: string[];
};

const uniqueEmojis = (items: string[]): string[] => Array.from(new Set(items));

export const EMOJI_PICKER_CATEGORIES: EmojiPickerCategory[] = [
  {
    id: 'popular',
    name: 'Popular',
    keywords: 'popular common favorite star rocket computer',
    emojis: uniqueEmojis([
      '💻', '🚀', '📚', '🛠️', '🏥', '☁️', '📊', '🔐', '⚙️', '🌐',
      '📱', '💡', '📅', '📧', '📈', '⚡', '🏢', '🧬', '🔬', '💼',
      '🩺', '💊', '🧪', '📡', '🖥️', '💾', '🏭', '🤝', '📋', '🧾',
      '🛰️', '🤖', '🧠', '🚑', '🩻', '🧫', '🦠', '🏦', '🚚', '🔑',
      '🛡️', '📁', '🔗', '⭐', '🎯', '🔔', '📝', '🎨', '🎓', '🏠',
    ]),
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    keywords: 'health healthcare hospital medical doctor nurse clinic pharmacy ambulance vaccine medicine emr ehr pacs ris lis his epic cerner meditech radiology cardiology dental surgery pharmacy icu er emergency patient care nursing',
    emojis: uniqueEmojis([
      '🏥', '⚕️', '🩺', '💊', '💉', '🚑', '🩹', '🏨', '🧬', '🩸',
      '🦠', '🧫', '🧪', '🔬', '🩻', '🦷', '🫀', '🫁', '🧠', '🦴',
      '👁️', '👂', '👃', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🩼',
      '🦽', '🦼', '🚨', '🧴', '🌡️', '🧼', '😷', '🧤', '🥽', '🥼',
      '🛏️', '🤰', '👶', '🧓', '👴', '👵', '🦵', '🦶', '🫀', '💊',
      '🧯', '⛑️', '🏥', '🏨',
    ]),
  },
  {
    id: 'bioscience',
    name: 'Bioscience',
    keywords: 'bio bioscience biology lab laboratory dna gene genome microbe bacteria virus petri microscope research science chemistry molecule cell tissue plant ecology life sciences biotech pharma',
    emojis: uniqueEmojis([
      '🧬', '🦠', '🧫', '🧪', '🔬', '⚗️', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🌱',
      '🌿', '🍃', '🌾', '🪲', '🦋', '🐛', '🐭', '🌡️', '💧', '🌍',
      '🔭', '📊', '🧲', '⚛️', '💡', '🔋', '🧴', '🧤', '🥽', '🥼',
      '💉', '🩸', '🌳', '🌲', '🌵', '🍀', '🌺', '🌼', '🌻', '🌽',
      '🍄', '🫧',
    ]),
  },
  {
    id: 'erp',
    name: 'ERP',
    keywords: 'erp sap oracle netsuite dynamics finance accounting warehouse inventory invoice payroll crm sales hr human resources procurement supply chain manufacturing business office work',
    emojis: uniqueEmojis([
      '📊', '📈', '📉', '💼', '🏢', '🏭', '📦', '📋', '📑', '🧾',
      '💰', '💳', '🏦', '🤝', '👥', '📅', '🗓️', '📁', '📂', '🗂️',
      '🗃️', '🗄️', '🚚', '🚛', '🛒', '🏷️', '📌', '✅', '📝', '🧮',
      '⚖️', '🎯', '💡', '⏱️', '📇', '🖊️', '👤', '👨‍💼', '👩‍💼', '🏗️',
      '🏪', '🏬', '🏛️', '📬', '📤', '📥', '🔖', '📎', '💵', '💴',
      '💶', '💷', '💸', '💎', '🏆', '📇', '🖋️', '✒️', '📏', '📐',
    ]),
  },
  {
    id: 'cloud',
    name: 'Cloud',
    keywords: 'cloud aws azure gcp google amazon hosting saas paas iaas kubernetes docker kubernetes devops cicd serverless lambda s3 blob storage cdn vpn',
    emojis: uniqueEmojis([
      '☁️', '🌥️', '⛅', '🌤️', '🌦️', '💻', '🖥️', '💾', '📡', '🛰️',
      '🚀', '🔌', '🔋', '⚡', '🔐', '🔒', '🔑', '🌐', '📶', '📱',
      '⌨️', '🖱️', '🖨️', '💿', '📀', '🛠️', '⚙️', '🔧', '🔩', '🧰',
      '🛡️', '🔗', '📦', '🗄️', '🗃️', '💡', '🤖', '🧠', '🪄', '🌍',
      '📲', '🔄', '♻️', '🧩', '✨', '💫', '🛸', '🌀', '🌈',
    ]),
  },
  {
    id: 'technology',
    name: 'Tech',
    keywords: 'tech technology it computer laptop phone software hardware code developer programming ai',
    emojis: uniqueEmojis([
      '💻', '⌨️', '🖱️', '🖲️', '🖨️', '🖥️', '📱', '📲', '💾', '💿',
      '📀', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📺', '📻', '📟',
      '☎️', '📞', '📠', '⌚', '🕹️', '🎮', '🤖', '🧠', '💡', '🔦',
    ]),
  },
  {
    id: 'servers',
    name: 'Servers',
    keywords: 'server datacenter rack database storage backup onprem vm virtualization',
    emojis: uniqueEmojis([
      '🖥️', '💾', '🖨️', '📡', '🔄', '⚙️', '🔧', '🛠️', '📦', '🗄️',
      '🗃️', '📊', '📈', '📉', '🔌', '🔋', '⚡', '🌐', '🌍', '💽',
      '📀', '💿', '🧰', '🔩', '🗜️',
    ]),
  },
  {
    id: 'network',
    name: 'Network',
    keywords: 'network wifi internet dns firewall router switch vpn lan wan',
    emojis: uniqueEmojis([
      '🌐', '📡', '📶', '📞', '☎️', '📠', '📧', '📨', '📩', '📤',
      '📥', '📦', '🔗', '⛓️', '🔌', '💡', '⚡', '🛰️', '🌍', '🗺️',
      '📍', '🧭',
    ]),
  },
  {
    id: 'security',
    name: 'Security',
    keywords: 'security lock password identity iam firewall antivirus compliance hipaa',
    emojis: uniqueEmojis([
      '🔐', '🔒', '🔓', '🔑', '🗝️', '🛡️', '⚔️', '🗡️', '🛠️', '🔧',
      '🔩', '⚙️', '⛓️', '🔗', '🚨', '👮', '🕵️', '🎯', '🚫', '⚠️',
      '🛑', '✅', '🔏',
    ]),
  },
  {
    id: 'data',
    name: 'Data',
    keywords: 'data analytics report dashboard chart file folder document spreadsheet bi',
    emojis: uniqueEmojis([
      '📊', '📈', '📉', '📋', '📌', '📍', '🗂️', '📁', '📂', '🗄️',
      '🗃️', '📑', '📃', '📄', '📜', '📰', '📓', '📔', '📒', '📕',
      '📗', '📘', '📙', '📚', '🔖', '🧾',
    ]),
  },
  {
    id: 'onprem',
    name: 'On-Prem',
    keywords: 'onprem on-prem campus building factory warehouse office site',
    emojis: uniqueEmojis([
      '🏢', '🏭', '🏗️', '🏛️', '🏘️', '🏠', '🏡', '🏙️', '🌆', '🌇',
      '🌃', '🏪', '🏬', '🏫', '🏦', '🏨', '🏥', '🚧', '🧱',
    ]),
  },
  {
    id: 'modalities',
    name: 'Imaging',
    keywords: 'imaging modality mri ct xray ultrasound pacs dicom camera monitor',
    emojis: uniqueEmojis([
      '🩻', '📷', '📸', '📹', '🎥', '🖥️', '📺', '💾', '💿', '🖨️',
      '📠', '📱', '📡', '🔬', '🔭', '💡',
    ]),
  },
  {
    id: 'communication',
    name: 'Chat',
    keywords: 'chat message email phone teams slack talk meeting',
    emojis: uniqueEmojis([
      '💬', '💭', '🗨️', '👤', '👥', '🗣️', '📢', '📣', '📧', '📨',
      '📩', '📞', '📱', '💌', '🔔', '🔕',
    ]),
  },
  {
    id: 'objects',
    name: 'Objects',
    keywords: 'objects tools icons stuff',
    emojis: uniqueEmojis([
      '📱', '⌚', '📷', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🔔', '📢',
      '📦', '📎', '📌', '✏️', '🖊️', '📁', '📂', '🔍', '🔎', '💡',
    ]),
  },
  {
    id: 'symbols',
    name: 'Symbols',
    keywords: 'symbols hearts colors check warning',
    emojis: uniqueEmojis([
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '⭐',
      '✅', '❌', '⚠️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫',
      '⚪', '🔶', '🔷', '➕', '➖', '✔️',
    ]),
  },
];

export const POPULAR_EMOJIS = uniqueEmojis(
  EMOJI_PICKER_CATEGORIES.flatMap((category) => category.emojis)
);

export const LINK_EMOJIS = {
  servers: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'servers')?.emojis || [],
  cloud: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'cloud')?.emojis || [],
  onprem: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'onprem')?.emojis || [],
  hospital: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'healthcare')?.emojis || [],
  modalities: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'modalities')?.emojis || [],
  medical: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'healthcare')?.emojis || [],
  technology: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'technology')?.emojis || [],
  network: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'network')?.emojis || [],
  security: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'security')?.emojis || [],
  data: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'data')?.emojis || [],
  communication: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'communication')?.emojis || [],
  erp: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'erp')?.emojis || [],
  bioscience: EMOJI_PICKER_CATEGORIES.find((c) => c.id === 'bioscience')?.emojis || [],
  all: POPULAR_EMOJIS,
};

export const ALL_LINK_EMOJIS = POPULAR_EMOJIS;

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