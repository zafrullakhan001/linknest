# Help & About Dialog - Update Summary

## Overview
The Help & About dialog has been comprehensively updated to reflect all new features added to LinkNest.

## Latest: Runtime (PHP / Node) visibility — read-only (2026-09-30)

- New admin tab **Tools → System Runtime** (`components/RuntimeUpdatesPanel.tsx`): PHP / Node.js / npm / Apache / SQLite / git versions, vendor patches, **Security** badges, downtime reference and copy-paste commands
- New API (admin, read-only): `GET /api/runtime/status`, `POST /api/runtime/check`, `GET /api/runtime/instructions`, `GET /api/runtime/report` (`api/runtime.php`, `api/runtime_lib.php`, routed via `/runtime` in `api/index.php`)
- New CLI: `php api/runtime_check.php [--json|--markdown|--force]`
- Sources: `downloads.php.net/~windows/releases/releases.json` (PHP TS x64 with SHA256), `nodejs.org/dist/index.json` (LTS + vendor `security` flag), `php.net/feed.atom` (security-release hint)
- New guide: [`docs/RUNTIME_UPDATES.md`](../docs/RUNTIME_UPDATES.md) — registered in Guides under **Updates & Deploy** with a dated **Procedure changelog** (notes travel with App Updates)
- Help tab: **Underlying software updates (PHP / Node.js / Apache / SQLite)**; App Updates dialog gained an advisory strip linking to the new tab
- System Specs Check card links to **Open System Runtime**; cross-links added to `XAMPP_PHP_UPGRADE.md` / `VANILLA_APACHE_PHP_UPGRADE.md`
- **No schema change, no settings change.** Deliberately advisory: nothing is installed, replaced or restarted from the app; Node upgrades have no downtime, a Windows Apache `mod_php` patch needs a 5–20 s restart

---

## Latest: LinkNest 3.0.0 major release (2026-09)

- Database: `LINKNEST_SCHEMA_VERSION` **105 → 106** with new additive `schema_releases` audit registry (`api/config.php` → `ensureSchemaReleaseRegistry()`)
- Release notes: [`docs/RELEASE_NOTES_3.0.0.md`](../docs/RELEASE_NOTES_3.0.0.md) (schema v106, DB snapshot/rollback, apply steps)
- About tab: **What's New in 3.0.0** (passkeys, Apache monitoring dashboard, private space sharing + LDAP display names, tab/section backgrounds, URL Safety Intelligence, emulation/open-target modes)
- Help fallback version string `2.2.0` → `3.0.0` (About always prefers live `BUILD_INFO.json` / updater status)
- Publisher example refreshed to `-Version 3.0.0`; App Updates guide cross-links the release notes

---

## Latest: Your Bookmarks & Rewrite tools (2026-08)

- Added writable guide: [`docs/YOUR_BOOKMARKS.md`](../docs/YOUR_BOOKMARKS.md)
- Registered in Guides API (`api/docs.php`) under **Features**
- Help tab: **Favorites, Your Bookmarks & Rewrite tools** — Favorite Links compact view, guest Chrome import, full rewrite tool table (Domain → Recipes), Undo/CSV, suggested workflows
- Key Features card + Tips + About feature list updated
- In-panel rewrite tabs already show example help cards

---

## Latest: SSH Session SharedWorker guide (2026-08)

- Added writable guide: [`docs/SSH_SESSION_SHARED_WORKER.md`](../docs/SSH_SESSION_SHARED_WORKER.md)
- Registered in Guides API (`api/docs.php`) under **Features**
- Help tab: **SSH sessions across refresh (SharedWorker)** under Remote Widgets
- About → What’s New, Tips, and Guides intro cross-link the guide
- Cross-link from `REMOTE_WIDGETS_SETUP.md`

---

## Latest: Portable App Updates for ArchLinks / ERP3 (2026-08)

- Expanded [`docs/APP_UPDATES.md`](../docs/APP_UPDATES.md) with **Office playbook** (portable Release, commit vs Release, multi-folder steps, troubleshooting)
- Help tab: **In-app App Updates (office / ArchLinks / ERP3)** — publish once with relative base, apply same Release on every folder
- Cross-links from Tips, feature cards, About → What’s New, and Remote Widgets manual deploy guide
- Default publish `-BasePath` is `relative` (not `/linknest`) so one ZIP does not break sibling instances

---

## Latest: SSH / VNC Manual Deployment guide (2026-08)

- Added writable guide: [`docs/REMOTE_WIDGETS_MANUAL_DEPLOY.md`](../docs/REMOTE_WIDGETS_MANUAL_DEPLOY.md)
- Registered in Guides API (`api/docs.php`) under **Updates & Deploy**
- Help tab section: **Remote Widgets — SSH / VNC Manual Deployment** (online / air-gapped / HTTPS WSS paths, deps, Admin checklist, SSH/`ssh://`, VNC/`vnc://`, MFA tips)
- About → What’s New and Tips cross-link the guide
- Cross-links from `REMOTE_WIDGETS_SETUP.md`, `PACKAGE_FOR_DEPLOYMENT.md`, `AGENTS.md`

---

## Latest: Package for Deployment + XAMPP PHP docs (2026-08)

- Added in-app guide: [`docs/PACKAGE_FOR_DEPLOYMENT.md`](../docs/PACKAGE_FOR_DEPLOYMENT.md) (Help → **Guides** → Updates & Deploy)
- [`package-for-deployment.bat`](../package-for-deployment.bat) now **forwards all CLI flags** to `package-for-deployment.ps1`
- Help tab: **Package for Deployment (Windows)** section with full options table
- Cross-links in Tips, feature cards, and About → What’s New

### Packager options (Windows)
| Flag | Purpose |
|------|---------|
| *(default)* | Fresh ZIP, rebuild `dist/`, no live DB, include uploads + SQLite + remote `bin/` |
| `-IncludeDatabase` | Ship live `data/linknest.db` |
| `-ExcludeUploads` | Skip `uploads/` |
| `-SkipBuild` | Reuse existing `dist/` |
| `-SkipSqliteRuntime` | Skip SQLite DLL bundle |
| `-SkipRemoteRuntime` | Skip ttyd/websockify under `bin/` |
| `-BasePath "/name"` | Frontend base path (default `/linknest`) |
| `-OutputDir "E:\"` | ZIP output directory |

```bat
package-for-deployment.bat
package-for-deployment.bat -IncludeDatabase -OutputDir "D:\zips"
```

### Also: XAMPP PHP upgrade docs
- Guide: [`docs/XAMPP_PHP_UPGRADE.md`](../docs/XAMPP_PHP_UPGRADE.md)
- Help section + About tech stack: **PHP 8.5+ (8.2+ minimum)**

```powershell
.\scripts\upgrade-xampp-php-run-elevated.ps1 -Version 8.5 -RestartApache
```

---

## Changes Made

### Updated Version
- **Old:** Version 1.0.0
- **New:** Version 2.0.0
- **Copyright:** Updated to 2026

### New Features Added to Help Section

#### 1. User Groups & Access Control (New Section)
- **User Groups Management**
  - Create groups to organize users by team/department
  - Assign users to multiple groups
  - Assign roles to groups with inheritance
  
- **Tile Admins with Group Support**
  - Assign tile admin privileges to users OR groups
  - Visual distinction between users (👤) and groups (👥)
  - Entity filter to show all/users only/groups only
  - Combined search across users and groups
  - Admin count breakdown per tile
  
- **Granular Permissions**
  - Control add/edit/delete for links, sections, tabs
  - Visibility and browser setting controls
  - Clone and info access management
  - Default: Allow add/edit, restrict delete/sensitive settings

- **Role Management**
  - Create custom roles with specific permissions
  - Assign roles to users or groups
  - Control access to tiles, tabs, links, widgets
  - Bulk operations for role assignment

#### 2. Version Control & History (New Section)
- Automatic version creation on every save
- View complete change history
- Compare versions side-by-side
- Restore previous versions
- Lock important versions
- Auto-generated changelogs
- Add tags and comments
- Cleanup tools for versions
- Temporary snapshots when editing
- Tracks all tile properties, tabs, sections, links, and content

#### 3. Database Maintenance (New Section)
- Scan for orphaned records
- Remove orphaned data safely
- Detailed cleanup breakdown
- Transaction-based safety
- Available via UI and CLI
- Resolves duplicates and improves performance
- Cleans permissions, sections, links, tabs

#### 4. Custom Widgets Development (New Section)
- React component-based widget framework
- Floating or embedded widget types
- Full React hooks and state management
- Dark mode support
- Role-based access control
- Register via Admin Panel
- Integration with design system

#### 5. Enterprise Features (New Section)
- **Authentication & SSO:**
  - Local authentication with secure storage
  - LDAP/Active Directory integration
  - SAML 2.0 Single Sign-On
  - Multiple auth sources supported
  
- **Deployment Options:**
  - Traditional LAMP/WAMP deployment
  - Docker containerization
  - Docker Compose orchestration
  - HTTPS/SSL support
  - Reverse proxy compatibility
  - Load balancing ready

### Updated Administrator Features
Added to existing admin panel features:
- User Groups management
- Role Management for users and groups
- Tile Admins with granular permissions
- Granular permission control
- Database cleanup tools
- Custom widget management
- Tab visibility control
- Broadcast messages
- SAML/SSO configuration

### Updated Key Features Grid
Added to feature list:
- User Groups Management
- Role-Based Access Control
- Tile Admin with User & Group Support
- Granular Permission System
- Version Control & History
- Version Comparison & Restore
- SAML/SSO Authentication
- Database Cleanup Tools
- Custom Widget Development
- Tab Visibility Control
- Broadcast Messages
- Password Generator Widget
- Zoom Control Widget
- Theme Toggle Widget
- Favorites Organizer Widget
- Chat Widget
- Snake Game Widget

### Updated Tips & Tricks
Added:
- Create user groups to manage team permissions efficiently
- Assign tile admin privileges to groups for easier management
- Use granular permissions to control what tile admins can do
- Track changes with version control and restore if needed
- Run database cleanup monthly to maintain performance
- Create custom widgets for specialized tools
- Use role management to assign multiple permissions at once
- Filter tile admin view by users or groups

### Enhanced Descriptions
- **Access Control:** Now mentions user groups, roles, and granular permissions
- **Link Management:** Added rich text content and browser preferences
- **Roles & Groups:** New feature card explaining group-based permissions

## Feature Count

### Before Update
- ~42 features listed

### After Update
- **59+ features listed**
- More detailed explanations
- Better organization by category

## New Sections Added

1. **User Groups & Access Control** - Complete guide to permission system
2. **Version Control & History** - Explains version tracking features
3. **Database Maintenance** - Database cleanup tools
4. **Custom Widgets Development** - Widget framework guide
5. **Enterprise Features** - SSO, SAML, LDAP, deployment options

## Visual Improvements

- Added appropriate icons for each section
- Color-coded feature cards for better visual hierarchy
- Organized related features together
- Clear separation between user and admin features

## Documentation Structure

### Help Tab Sections
1. Getting Started
2. Creating Your First Space
3. Key Features (grid layout)
4. Browser Integration
5. System Monitoring Dashboard
6. **User Groups & Access Control** ⭐ NEW
7. **Version Control & History** ⭐ NEW
8. **Database Maintenance** ⭐ NEW
9. **Custom Widgets Development** ⭐ NEW
10. **Enterprise Features** ⭐ NEW
11. Administrator Features
12. Tips & Tricks

### About Tab Sections
1. App Info (name, icon, version)
2. Description
3. Technology Stack
4. Features (comprehensive grid)
5. Credits

## Files Modified

- `components/HelpAboutDialog.tsx` - Complete content update

## User Impact

✅ **Better Discovery:** Users can now find all features easily
✅ **Clear Documentation:** Each feature has a detailed explanation
✅ **Visual Clarity:** Color-coded sections and icons
✅ **Up-to-Date:** Reflects all new features added in v2.0
✅ **Organized:** Related features grouped logically

## Testing Checklist

- [x] Version number updated to 2.0.0
- [x] Copyright year updated to 2026
- [x] All new features documented
- [x] Feature grid expanded
- [x] New sections added
- [x] Tips updated
- [x] Admin features updated
- [x] Description enhanced
- [x] Visual layout maintained
- [x] Dark mode support preserved

## Conclusion

The Help & About dialog now comprehensively documents all features in LinkNest 2.0, including:
- User Groups
- Role-Based Access Control
- Granular Tile Admin Permissions
- Version Control
- Database Cleanup
- Custom Widgets
- Enterprise SSO/SAML
- XAMPP PHP runtime upgrade (Guides → Upgrade PHP in XAMPP)
- Package for Deployment / Windows XAMPP ZIP (Guides → Package for Deployment)
- SSH / VNC Manual Deployment (Help + Guides → SSH / VNC Manual Deployment)
- And 50+ other features

Users can now fully understand the capabilities of LinkNest through the built-in help system.
