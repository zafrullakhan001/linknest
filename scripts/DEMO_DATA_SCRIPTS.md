# Demo Data Generation Scripts

This directory contains two demo data generation scripts for LinkNest. Both create the same structure and **visibility buckets**; they differ only in visual styling (gradients vs solid colors).

Shared helpers: `demo_data_helpers.php` (CLI guard, clear list, visibility map, role assignments, category seeding).

---

## Available Scripts

### 1. `generate_demo_data.php` (Colorful / Gradients)

Creates demo data with **25 gradient presets** and named theme colors.

```bash
php scripts/generate_demo_data.php --yes
```

### 2. `generate_demo_data_simple.php` (Simple / Solid)

Same content with **named solid theme colors** and no gradient decorations.

```bash
php scripts/generate_demo_data_simple.php --yes
```

Both require CLI and `--yes` (or `--confirm`). They refuse to run from the web server. They **replace** tiles/links/monitors — backup first. Guest tile cache is cleared after seeding.

---

## Visibility buckets (how spaces appear)

| Bucket | Count | Visibility | Where it appears | Role permissions? |
|--------|------:|------------|------------------|-------------------|
| **Public** | 8 | `public` | **Public** tab (guests + everyone) | No |
| **Authenticated** | 5 | `authenticated` | **Your Apps → Authenticated** (all signed-in users) | No |
| **Your Assigned Apps** | 12 | `private` + role grants | **Your Apps → Your Assigned Apps** (per role) | Yes |

### Public examples
Company Dashboard, Analytics Hub, Customer Portal, Scheduling & Calendar, Documentation Center, Training & Learning, Resource Library, IT Support.

### Authenticated examples (every signed-in user)
HR Portal, Communication Hub, Project Management, File Sharing, Collaborative Workspaces.

### Role-assigned examples (not on Public)
Finance Center, Development Tools, Code Repositories, CI/CD, Testing, API Management, Cloud/Servers/Databases/Network/Security, Forms & Requests.

**Why assigned spaces use `private`:** so they stay off the Public/guest grid. Role tile/link permissions unlock them in **Your Assigned Apps**. Authenticated spaces stay separate so you can demo “everyone signed in” vs “only my role.”

---

## Demo roles and users

- **10 roles:** Manager, Developer, Designer, Support, Viewer, Editor, HR, Finance, Guest, Auditor  
- **10 users:** `demo1` … `demo10` (`demoN@demo.local` / password **`password`**)
  - Each user has **notes** describing their organisational role and what to expect in Your Assigned Apps (visible in Admin → Users).

### Example walkthroughs

| Who | What to open | What you should see |
|-----|--------------|---------------------|
| Signed out | **Public** | ~8 public showcase spaces |
| Any `demoN` | **Your Apps → Authenticated** | ~5 shared staff spaces |
| `demo3` (Designer) | **Your Apps → Your Assigned Apps** | Dev/design set (repos, CI/CD, testing, API, forms, …) |
| `demo2` (Developer) | **Your Assigned Apps** | Full Development + Infrastructure set |
| `demo9` (Guest role) | **Your Assigned Apps** | Minimal (Forms); Authenticated still shows the shared five |

App tabs granted to demo roles include Public, Your Apps, Favorites, Private, Scheduled, Expired, Archive, Recycle bin, Monitoring. All built-in widgets are assigned.

---

## Data structure

| Item | Count |
|------|-------|
| Tiles | 25 (8 public + 5 authenticated + 12 role-assigned) |
| Links | ~67 |
| Monitors | 10 |
| Categories | Main, Development, Infrastructure, Collaboration, Resources |

Ownership of tiles is spread across `demo1`–`demo10` (maintenance heat map uses `tiles.user_id`).

`theme_color` uses named `THEME_COLORS` (`blue`, `cyan`, …). Gradient hex values exist only in the colorful preset arrays. Keyword monitors use `type = 'keyword'`.

---

## In-app help

Help & About → **Demo Data Scripts (Public / Authenticated / Assigned)** explains the same buckets and example logins for presenters.

Also see Guides tab for broader product docs.
