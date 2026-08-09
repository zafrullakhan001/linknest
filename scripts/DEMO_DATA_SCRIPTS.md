# Demo Data Generation Scripts

This directory contains two demo data generation scripts for LinkNest. Both create the same structure of tiles, links, and monitors, but differ in visual styling.

Shared helpers live in `demo_data_helpers.php` (CLI guard, table clear list, category seeding, prepared tab/section inserts).

---

## Available Scripts

### 1. `generate_demo_data.php` (Colorful / Gradients)

Creates demo data with **25 gradient presets** and named theme colors.

**Usage:**
```bash
php scripts/generate_demo_data.php --yes
```

**Best for:** YouTube demos, showcasing gradients, colorful dashboards.

### 2. `generate_demo_data_simple.php` (Simple / Solid)

Creates the same content with **named solid theme colors** and no gradient decorations.

**Usage:**
```bash
php scripts/generate_demo_data_simple.php --yes
```

**Best for:** clean/minimal demos, performance baselines, corporate styling.

Both scripts require CLI and an explicit `--yes` (or `--confirm`) flag. They refuse to run from the web server.

---

## Demo Roles and Users

Both scripts create:

- **10 roles:** Manager, Developer, Designer, Support, Viewer, Editor, HR, Finance, Guest, Auditor
- **10 demo users:** `demo1` … `demo10`  
  - Emails: `demo1@demo.local` … `demo10@demo.local`  
  - Password: `password`  
  - Approved local users with one role each

Role access uses varied tile/link subsets. App tabs granted (Public excluded): Your Apps, Favorites, Private, Scheduled, Expired, Archive, Recycle bin, Monitoring. All built-in widgets are assigned.

---

## Data Structure

| Item | Count |
|------|-------|
| Tiles | 25 (5 categories × 5) |
| Links | ~67 |
| Monitors | 10 |
| Categories | Main, Development, Infrastructure, Collaboration, Resources |

Categories are reseeded in `category_arrangements` (`user_id = 0`).

`theme_color` uses named `THEME_COLORS` values (`blue`, `cyan`, `teal`, …), not hex. Gradient hex colors remain only in colorful preset arrays.

Keyword monitors use `type = 'keyword'` (not `url`).

---

## Important Notes

Both scripts **DELETE existing demo-related data** (tiles, links, monitors, arrangements, favorites, tile versions/messages/visits, related monitor notification rows). Backup first.

Tiles are owned by the admin user, `visibility = public`, `published = 1`, `source_tab = public`.

Re-running either script reuses demo users/roles, resets demo passwords to `password`, and re-applies permissions.

---

## Switching Styles

```bash
# Gradients
php scripts/generate_demo_data.php --yes

# Solid colors
php scripts/generate_demo_data_simple.php --yes
```

### Demo logins
- **Admin:** existing admin account
- **Demo users:** `demo1@demo.local` / `password` (through `demo10`)
