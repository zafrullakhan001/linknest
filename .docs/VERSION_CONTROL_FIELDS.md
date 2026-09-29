# Version Control - Captured Fields Documentation

## Overview
This document describes all fields that are captured and tracked in the LinkNest version control system.

---

## 📦 Tile-Level Fields

### Basic Information
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique tile identifier | `"tile_analytics"` |
| `title` | string | Tile title | `"Analytics Dashboard"` |
| `description` | string | Tile description | `"View all analytics"` |
| `htmlContent` | string/null | Rich HTML content | `"<p>Content</p>"` |
| `emoji` | string | Tile emoji icon | `"📊"` |
| `themeColor` | string | Theme color (hex) | `"#3b82f6"` |
| `group` | string | Category/group name | `"Work Tools"` |

### Visibility & Access Control
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `visibility` | string | Access level | `"public"`, `"authenticated"`, `"private"` |
| `allowedUsers` | array | User IDs with access | `["user_1", "user_2"]` |
| `visibleFrom` | datetime/null | Start visibility date | `"2026-01-01 00:00:00"` |
| `expiresAt` | datetime/null | End visibility date | `"2026-12-31 23:59:59"` |

### Hyperlink Configuration
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `isHyperlink` | boolean | Is tile a hyperlink? | `true` |
| `hyperlinkUrl` | string/null | URL to open | `"https://example.com"` |
| `openInNewTab` | boolean | Open in new tab? | `true` |
| `browser` | string/null | Preferred browser | `"chrome"`, `"firefox"`, `"edge"` |

### Tile Styling
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `tileBackgroundColor` | string/null | Background color | `"#1e293b"` |
| `tileGradientEnabled` | boolean | Enable gradient? | `true` |
| `tileGradientColors` | array/null | Gradient colors | `["#3b82f6", "#8b5cf6"]` |
| `tileGradientColorPositions` | array/null | Color stop positions | `[0, 50, 100]` |
| `tileGradientDirection` | int/string/null | Gradient angle | `45` or `"to right"` |
| `tileGradientType` | string/null | Gradient type | `"linear"`, `"radial"` |
| `tileBorderRadius` | int/null | Border radius (px) | `12` |
| `tileTextColor` | string/null | Text color | `"#ffffff"` |

---

## 💬 Messages

Messages are announcements/notifications displayed on tiles.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique message ID | `"msg_001"` |
| `content` | string | Message text | `"Important update!"` |
| `type` | string | Message type | `"info"`, `"warning"`, `"error"`, `"success"` |
| `startDate` | datetime/null | Display start date | `"2026-01-01 00:00:00"` |
| `endDate` | datetime/null | Display end date | `"2026-12-31 23:59:59"` |
| `isActive` | boolean | Is message active? | `true` |
| `priority` | int/null | Display priority | `1` |
| `textColor` | string/null | Text color | `"#ffffff"` |
| `fontStyle` | string/null | Font style | `"normal"`, `"italic"`, `"bold"` |
| `displayLocation` | string | Where to show | `"both"`, `"tile"`, `"detail"` |
| `tabIds` | array/null | Space-page tab ids this message is restricted to (empty/null = every tab) | `["tab_001"]` |
| `showOnCard` | boolean | Keep a tab-restricted message on the home-grid card banner | `true` |
| `placement` | string | Space-page banner placement | `"above"`, `"below"` |
| `fontFamily` | string/null | Message font family key from `MESSAGE_FONT_FAMILIES` | `"georgia"` |
| `fontSize` | int/null | Message font size in px (8-72) | `14` |
| `marqueeSeconds` | int/null | Stored marquee cycle length (5-180, higher = slower); rendered as a seamless loop via `marqueeLoopSeconds()` plus the measured seam gap (`marqueePaceScale()` in `utils/messageStyle.ts`), so existing values keep their scroll speed and a message is never on screen twice | `45` |
| `animationType` | string | Animation type | `"rollover"`, `"fade"`, `"slide"` |
| `delayBefore` | float | Delay before showing (s) | `2.5` |

---

## 📑 Tabs

Tabs organize content within a tile.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique tab ID | `"tab_001"` |
| `title` | string | Tab title | `"Development"` |
| `position` | int | Display order | `0` |
| `textColor` | string/null | Tab text color | `"#3b82f6"` |
| `visibleFrom` | datetime/null | Start visibility | `"2026-01-01 00:00:00"` |
| `expiresAt` | datetime/null | End visibility | `"2026-12-31 23:59:59"` |
| `sections` | array | Array of sections | See below |

---

## 📋 Sections

Sections group links within tabs.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique section ID | `"section_001"` |
| `title` | string | Section title | `"Code Repositories"` |
| `textColor` | string/null | Section text color | `"#000000"` |
| `visibleFrom` | datetime/null | Start visibility | `"2026-01-01 00:00:00"` |
| `expiresAt` | datetime/null | End visibility | `"2026-12-31 23:59:59"` |
| `forceStackedView` | boolean | Force stacked layout? | `false` |
| `position` | int | Display order | `0` |
| `links` | array | Array of links | See below |
| `richTextContent` | array | Rich text blocks | See below |

---

## 🔗 Links

Individual links within sections.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique link ID | `"link_001"` |
| `label` | string | Link display text | `"GitHub"` |
| `url` | string | Link URL | `"https://github.com"` |
| `icon` | string/null | Link icon/emoji | `"🐙"` |
| `textColor` | string/null | Link text color | `"#3b82f6"` |
| `visibility` | string | Access level | `"public"`, `"authenticated"`, `"private"` |
| `allowedUsers` | array | User IDs with access | `["user_1"]` |
| `notes` | string/null | Internal notes | `"Main repository"` |
| `tooltip` | string/null | Hover tooltip | `"View all repos"` |
| `visibleFrom` | datetime/null | Start visibility | `"2026-01-01 00:00:00"` |
| `expiresAt` | datetime/null | End visibility | `"2026-12-31 23:59:59"` |
| `browser` | string/null | Preferred browser | `"chrome"` |
| `position` | int | Display order | `0` |
| `richTextContent` | string/null | Rich text description | `"<p>Details</p>"` |
| `isFavorite` | boolean | Is favorited? | `false` |

---

## 📝 Rich Text Content

Rich text blocks within sections.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique rich text ID | `"rt_001"` |
| `content` | string | HTML content | `"<p>Instructions here</p>"` |
| `position` | int | Display order | `0` |

---

## 🚫 Fields EXCLUDED from Change Detection

These fields are **NOT** compared when detecting changes (they are metadata or transient):

- `createdAt` / `created_at` - Creation timestamp
- `updatedAt` / `updated_at` - Last update timestamp
- `deletedAt` / `deleted_at` - Deletion timestamp
- `archivedAt` / `archived_at` - Archive timestamp
- `user_id` / `userId` - User who created/modified
- `canView` / `can_view` - Permission flag
- `canEdit` / `can_edit` - Permission flag
- `canDelete` / `can_delete` - Permission flag
- `hasRoleAccess` / `has_role_access` - Role-based access flag
- `isFavorite` / `is_favorite` - User favorite flag
- `health` - Link health check data (transient)

---

## 📊 Version Metadata

Additional metadata stored with each version (not part of tile data):

| Field | Type | Description |
|-------|------|-------------|
| `version_number` | int | Sequential version number |
| `created_at` | timestamp | When version was created |
| `user_id` | string | User who created the version |
| `changelog_summary` | string/null | Auto-generated change summary |
| `is_temp` | boolean | Is this a temporary "before" snapshot? |
| `is_locked` | boolean | Is this version locked from deletion? |

---

## 🔄 How Version Control Works

1. **Opening a Tile for Edit**: Creates a **temp version** (`is_temp = 1`) as a "before" snapshot
2. **Saving Changes**: 
   - Deletes the temp version
   - Creates a **permanent version** (`is_temp = 0`) with the new state
   - Generates a changelog summary comparing old vs new
3. **Discarding Changes**: Deletes the temp version without creating a permanent one
4. **Duplicate Detection**: Permanent versions are only created if data actually changed (temp versions always created)
5. **Auto-cleanup**: Keeps max 10 unlocked, non-temp versions per tile

---

## 📁 File Location

- Full JSON example: `.docs/VERSION_CONTROL_FIELDS.json`
- This documentation: `.docs/VERSION_CONTROL_FIELDS.md`
