# LinkNest - Agent Development Guide

## Project Overview

LinkNest is a **link and space organization platform** built with a React frontend and PHP backend. It allows users to create "tiles" (spaces) containing links organized in tabs and sections. The application supports both public (guest) access and authenticated user modes with role-based permissions.

**Key Capabilities:**
- Create and manage link spaces (tiles) with customizable themes
- Organize links using tabs and sections with drag-and-drop
- Link health monitoring and analytics
- User authentication (Local, LDAP, SAML, and optional Passkeys / WebAuthn)
- Per-user TOTP two-factor authentication after a Local/LDAP password check (opt-in in the profile menu; admin availability toggle, one-time recovery codes, 30-day trusted browsers, admin reset — see `docs/TWO_FACTOR_AUTH.md`)
- Role-based access control and user groups
- Private spaces shared with individual users (invite → accept → revoke); the space editor lists everyone a space is shared with, and Admin → Users can sync LDAP display names (`displayName` / `cn`) so users show full names next to their login id (see `docs/PRIVATE_SPACE_SHARING.md`)
- Floating widgets (clock, weather, calculator, notes, media library, etc.)
- AI-powered content generation via Google Gemini
- MCP interface so LLMs can list, search, and edit spaces and links (admin-scoped tokens can also manage users, roles, LDAP/SAML, Device Presets, and database export/import)
- Email notifications and broadcast messaging
- Browser integration for direct link opening
- Admin Apache monitoring dashboard (footer “online now” click; `mod_status`, access logs, OPcache, PHP memory, SQLite, disk; admins can purge Apache/PHP logs, enable OPcache in php.ini, and restart Apache). Work runs only while the dashboard window is open. Locates Apache from the running process / ServerRoot / service / PATH (any install path; optional `LINKNEST_APACHE_HTTPD`). Windows restart targets the installed service (`httpd -k restart -n`, then `net`/`sc` stop+start) from a detached process. Loopback `/server-status` uses this host’s scheme and port (not Docker `:8090` unless running in Docker).

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.x | UI framework |
| TypeScript | 5.8.x | Type safety |
| Vite | 6.2.x | Build tool and dev server |
| Tailwind CSS | 3.4.x | Styling |
| @dnd-kit | ^6.3.x | Drag and drop functionality |
| Recharts | 2.15.x | Charts and analytics |
| react-icons | 5.5.x | Icon library |
| uuid | ^13.0.0 | UUID generation |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| PHP | 8.2.x | Server-side language |
| SQLite | 3.x | Database |
| Apache | 2.4.x | Web server |

### Optional/External
- **Google GenAI** - AI content generation (requires `GEMINI_API_KEY`)
- **Mailpit** - Development SMTP server (Docker)

---

## Project Structure

```
linknest/
├── App.tsx                 # Main application component
├── index.tsx               # React entry point
├── index.html              # HTML template
├── types.ts                # TypeScript type definitions
├── components/             # React components (61 files)
│   ├── TileGrid.tsx        # Main tile display grid
│   ├── TileDetail.tsx      # Tile editing interface
│   ├── AdminPanel.tsx      # Admin configuration UI
│   ├── StyleManager.tsx    # Theme/style management
│   ├── Navigation.tsx      # Top navigation bar
│   └── ...                 # Widgets, dialogs, etc.
├── contexts/               # React Context providers
│   ├── AuthContext.tsx     # Authentication state
│   ├── SettingsContext.tsx # Application settings
│   └── StyleContext.tsx    # Custom styles/themes
├── services/               # API service functions
│   ├── storageService.ts   # Tile CRUD operations
│   ├── authService.ts      # Authentication API
│   ├── settingsService.ts  # Settings management
│   └── ...                 # Various feature services
├── hooks/                  # Custom React hooks
│   └── useMobile.ts        # Mobile detection hook
├── api/                    # PHP backend endpoints
│   ├── index.php           # API router
│   ├── mcp.php             # MCP (LLM) JSON-RPC endpoint
│   ├── mcp_lib.php         # MCP tools (spaces, links, notes)
│   ├── mcp_admin_lib.php   # Admin MCP tools (users, roles, LDAP/SAML, Device Presets, database export/import)
│   ├── mcp_user_lib.php    # MCP user management
│   ├── mcp_device_presets_lib.php # MCP Device Presets tools
│   ├── device_presets_lib.php     # Shared Device Preview catalog + persist
│   ├── mcp_tokens.php      # MCP token admin API
│   ├── tiles.php           # Tile CRUD API
│   ├── auth.php            # Authentication API
│   ├── settings.php        # Settings API
│   └── ...                 # 50+ endpoint files
├── mcp/                    # MCP stdio adapter (Claude Desktop / local Cursor)
│   └── server.mjs          # Forwards stdin JSON-RPC to POST /api/mcp
├── docker/                 # Docker deployment files
│   ├── Dockerfile          # Multi-stage build
│   ├── docker-compose.yml  # Service orchestration
│   └── ...                 # Configs and scripts
├── docs/                   # Documentation
├── data/                   # SQLite database storage
├── uploads/                # Uploaded files (logos, etc.)
└── land/                   # Browser extension integration
```

---

## Development Setup

### Prerequisites
- Node.js 20+ 
- PHP 8.2+
- SQLite extension for PHP

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the app** (Vite + PHP API):
   ```bash
   npm run dev
   ```

3. **Access the app:**
   Open http://localhost:3000

   `npm run dev` starts Vite on port 3000 and PHP's built-in server on port 8000. Apache is not required. Production `.env` values like `VITE_BASE_PATH=/linknest` apply to `npm run build`, not to local Vite.

### Environment Variables

Create `.env.local` for local development:
```env
GEMINI_API_KEY=your_gemini_api_key_here  # Optional, for AI features
```

`VITE_BASE_PATH` / `VITE_API_BASE` are for **production builds** (XAMPP subfolder). `npm run dev` ignores them and always serves `http://localhost:3000/` with `/api` proxied to PHP on port 8000.

---

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite (port 3000) and the PHP API (port 8000) |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run build:prod` | Production build with production mode |
| `npm run preview` | Preview production build locally |
| `npm run mcp` | Run the MCP stdio adapter (`LINKNEST_URL` + `LINKNEST_TOKEN`) |

---

## Architecture Patterns

### Frontend Architecture

1. **Component Organization:**
   - Components are co-located by feature
   - Heavy components use lazy loading (see `App.tsx` lines 46-49)
   - Widgets have both floating and non-floating variants

2. **State Management:**
   - React Context API for global state (Auth, Settings, Styles)
   - Local state with `useState` for component-level data
   - LocalStorage for user preferences (widget visibility, etc.)

3. **Routing:**
   - Hash-based routing (`useHashRoute` in `App.tsx`)
   - Routes: `#/` (home), `#/admin`, `#/style-manager`

4. **API Communication:**
   - Services in `/services` directory
   - Relative API URLs (`/api/*`) for protocol-agnostic requests
   - Credentials included for session-based auth

### Backend Architecture

1. **API Routing:**
   - Central router in `api/index.php`
   - Endpoints grouped by feature (tiles, auth, settings, etc.)
   - `PATH_INFO` used for sub-routing within endpoint files

2. **Database:**
   - SQLite database in `data/linknest.db`
   - Auto-created on first API request
   - Migration support via `api/config.php`

3. **Authentication:**
   - Session-based PHP authentication
   - Supports Local, LDAP, SAML, and optional Passkeys (WebAuthn)
   - Optional per-user TOTP two-factor authentication on top of Local/LDAP password sign-in (see `docs/TWO_FACTOR_AUTH.md`)
   - User roles and permissions system

---

## Code Style Guidelines

### TypeScript/React

1. **Types:**
   - All types defined in `types.ts`
   - Use explicit return types for service functions
   - Prefer interfaces over type aliases for object shapes

2. **Components:**
   - Functional components with hooks
   - Props interfaces defined inline or in types.ts
   - Use `React.FC` for component typing

3. **Naming:**
   - PascalCase for components and types
   - camelCase for variables, functions, and instances
   - UPPER_SNAKE_CASE for constants

4. **Imports:**
   - React imports first
   - Third-party libraries second
   - Local modules last
   - Use path alias `@/` for root-relative imports

### PHP

1. **Endpoints:**
   - Return JSON with `Content-Type: application/json` header
   - Use `http_response_code()` for status codes
   - Error handling with try-catch blocks

2. **Database:**
   - Use PDO with prepared statements
   - SQLite pragmas for performance in `api/config.php`

---

## Key Conventions

### Tile Data Structure
Tiles are the primary data entity. Key fields:
- `id` - Unique identifier
- `title`, `description`, `emoji` - Display properties
- `themeColor` - One of 17 predefined colors
- `tabs` - Array containing sections and links
- `visibility` - 'public', 'authenticated', or 'private'
- `allowedUsers`/`allowedGroups` - Permission arrays

### API Response Format
```typescript
// Successful response
{ data: Tile | Tile[] | ... }

// Error response
{ error: string }
```

### Styling
- Tailwind CSS for all styling
- Custom styles applied via `<style id="linknest-custom-styles">`
- Dark mode via `dark:` prefix classes
- Theme colors from `THEME_COLORS` array in `types.ts`

---

## Testing

**Note:** The project does not currently have automated test suites. Testing is done manually:

1. **Development Testing:**
   - Run `npm run dev` (starts Vite and the PHP API)
   - Test both authenticated and guest modes
   - Verify drag-and-drop functionality
   - Test mobile responsiveness (use mobile device or devtools)

2. **Production Testing:**
   - Build with `npm run build`
   - Test from `dist/` folder
   - Verify API proxy configuration

---

## Deployment

### Docker Deployment (Recommended)

Single-container deployment with PHP, Apache, and SQLite:

```bash
cd docker
chmod +x docker-deploy.sh
./docker-deploy.sh
```

Access at http://localhost:8090 (HTTP) or https://localhost:8443 (HTTPS)

Default credentials:
- Username: `admin`
- Password: `admin123`

### Manual Deployment

1. Build frontend: `npm run build`
2. Copy `dist/` to web server
3. Configure Apache/Nginx to serve `dist/index.html` for SPA routing
4. Ensure PHP 8.2+ with SQLite support
5. Set proper permissions on `data/` and `uploads/` directories

### Environment-Specific Configs

- `vite.config.ts` - Development configuration
- `vite.docker.config.ts` - Docker production build
- `vite.runtime.config.ts` - Runtime configuration

---

## Security Considerations

1. **Authentication:**
   - Session-based with HttpOnly cookies
   - CSRF protection via same-site cookie policy
   - LDAP/SAML for enterprise SSO

2. **Authorization:**
   - Role-based access control (RBAC)
   - Granular tile permissions (view, edit, delete, etc.)
   - User groups for permission management

3. **Input Validation:**
   - All API inputs should be validated/sanitized
   - File uploads restricted to images
   - SQL injection prevention via PDO prepared statements

4. **Deployment:**
   - HTTPS recommended for production
   - Self-signed SSL certs auto-generated in Docker
   - `.htaccess` blocks access to source files

---

## Troubleshooting

### Common Issues

1. **Database permission errors:**
   ```bash
   chmod 755 data
   chmod 644 data/*.db
   ```

2. **CORS errors in development:**
   - Ensure PHP server runs on port 8000
   - Vite proxy is configured in `vite.config.ts`

3. **Vite HMR not working:**
   - Check `host: 'localhost'` in HMR config
   - Clear browser cache

4. **API 404 errors:**
   - Verify `.htaccess` is being read (Apache)
   - Check `mod_rewrite` is enabled
   - For Nginx, configure try_files for SPA routing

---

## Documentation References

- `docs/YOUR_BOOKMARKS.md` - Guest Your Bookmarks, Favorite Links compact view, Rewrite tools
- `docs/BOOKMARK_SYNC_EXTENSION.md` - LinkNest Bookmark Sync extension (handshake, origin allowlist, per-profile sync, mass deploy)
- `docs/MCP.md` - MCP / AI: LLMs (Cursor, Claude Desktop) list spaces, search links, create or edit bookmarks, and (admin tokens) manage users, roles, Device Presets, and database export/import
- `docs/PRIVATE_SPACE_SHARING.md` - Private space sharing: `allowed_users` + `tile_share_invitations`, pending/accepted flow, keeping shared users checked in the space editor, revoke on uncheck, and LDAP full-name capture/sync
- `docs/MESSAGE_BOARD_TABS.md` - Message Board tab scoping, banner placement + message fonts: per-message `tabIds`, `showOnCard`, `placement` (above/below the tabs), `fontFamily`/`fontSize`, `marqueeSeconds` (marquee speed slider + seamless loop with a measured seam gap, so a message is never on screen twice), editor pickers, space-page/card visibility rules, `tile_messages.tab_ids`/`show_on_card`/`placement`/`font_family`/`font_size`/`marquee_seconds` (schema v109)
- `docs/ADMIN_LOCKOUT_RECOVERY.md` - Re-enable Local auth and reset local admin password (`scripts/reset_admin_password.php`); unlock Fingerprint-only access (`scripts/unlock_fingerprint_lock.php`) or login allowlist (`scripts/unlock_login_allowlist.php`) when locked out
- `docs/TWO_FACTOR_AUTH.md` - Per-user TOTP two-factor authentication after a Local/LDAP password check: profile enrolment (QR + setup key + one-time recovery codes), the code prompt in the sign-in modal, replay/lockout hardening, automatic authenticator clock-drift handling (`clock_offset_steps`), 30-day trusted browsers, admin availability toggle + `PUT /api/auth/2fa/reset/{userId}`, schema v110 (`user_two_factor`, `user_two_factor_devices`)

- `docs/MEDIA_LIBRARY.md` - Shared media library (images, PDF, audio, video; Admin + floating widget + RTE picker)
- `docs/APP_UPDATES.md` - In-app App Updates (portable Releases for ArchLinks / ERP3)
- `docs/RELEASE_NOTES_3.0.0.md` - LinkNest 3.0.0 major release (schema v106 `schema_releases` registry, DB snapshot/rollback, apply steps)
- `docs/PYTHON_WORKERS.md` - Monitoring + email Python workers; Windows Task Scheduler (`scripts/schedule-monitor-workers.bat`) and Docker entrypoint loop; also documents **scheduled worker speed tests** (host path vs browser path)
- `docs/SETUP.md` - Detailed setup instructions
- `docs/VANILLA_APACHE_PHP85_WINDOWS.md` - Vanilla Apache + PHP 8.5 on Windows (`D:\Apache` + `D:\php`, post-install `httpd.conf` / `php.ini`)
- `docs/PACKAGE_FOR_DEPLOYMENT.md` - Windows XAMPP deploy ZIP (`package-for-deployment.bat`)
- `docs/WINDOWS_BOOTSTRAP_BUNDLES.md` - Rebuild Apache+PHP runtime ZIP + LinkNest deploy ZIP and upload to GitHub (`publish-windows-bootstrap-bundles.bat`)
- `docs/VANILLA_APACHE_PHP_UPGRADE.md` - In-place PHP/Apache patches on `D:\Apache` + `D:\php` (`upgrade-vanilla-apache-php.bat`)
- `docs/REMOTE_WIDGETS_MANUAL_DEPLOY.md` - SSH / VNC manual deployment (ttyd, websockify, HTTPS WSS)
- `docs/REMOTE_WIDGETS_SETUP.md` - SSH / VNC feature overview
- `docs/SSH_SESSION_SHARED_WORKER.md` - SSH sessions across browser refresh (SharedWorker in browser memory)
- `docs/XAMPP_PHP_UPGRADE.md` - Upgrade PHP inside Windows XAMPP (8.5+ / future minors)
- `docs/PRODUCTION.md` - Production deployment guide
- `docs/DEPLOYMENT_INSTRUCTIONS.md` - Deployment procedures
- `docker/README_DOCKER.md` - Docker-specific documentation
- `docs/README_BACKEND.md` - Backend API documentation

---

## Adding New Features

1. **Frontend Component:**
   - Create in `components/YourComponent.tsx`
   - Add types to `types.ts` if needed
   - Create service in `services/` for API calls
   - Update `App.tsx` if adding new routes

2. **Backend API:**
   - Add endpoint file in `api/yourfeature.php`
   - Register route in `api/index.php`
   - Follow existing patterns for request/response handling

3. **Database Changes:**
   - Add migration logic to `api/config.php`
   - Use `PRAGMA user_version` for version tracking

---

*This file should be updated when significant architectural changes are made to the project.*

## In-app updates

See [`docs/APP_UPDATES.md`](docs/APP_UPDATES.md). Double-click [`publish-base-release.bat`](publish-base-release.bat) to publish a portable GitHub Release from the current branch, then apply it from Admin → App Updates.

Current major release: **v3.0.0** — `LINKNEST_SCHEMA_VERSION` **110** (`schema_releases` audit registry, additive/idempotent; 107 adds `tile_messages.tab_ids` + `tile_messages.show_on_card` for Message Board tab scoping, 108 adds `tile_messages.placement` for above/below-tabs banner placement, 109 adds `tile_messages.font_family`/`font_size`/`marquee_seconds` for message fonts and marquee speed, 110 adds `user_two_factor` + `user_two_factor_devices` for per-user TOTP two-factor authentication) with pre-release SQLite snapshots via `php api/snapshot.php`. See [`docs/RELEASE_NOTES_3.0.0.md`](docs/RELEASE_NOTES_3.0.0.md) and [`docs/TWO_FACTOR_AUTH.md`](docs/TWO_FACTOR_AUTH.md).

## Vanilla Apache + PHP 8.5 (Windows)

See [`docs/VANILLA_APACHE_PHP85_WINDOWS.md`](docs/VANILLA_APACHE_PHP85_WINDOWS.md) for post-install `httpd.conf` / `php.ini` on a stock Apache + PHP 8.5 Thread Safe layout (`D:\Apache`, `D:\php`) — not XAMPP.

To rebuild the pre-configured runtime ZIP **and** the LinkNest app ZIP and upload both to GitHub Release tag `apache-php85-runtime`, double-click [`publish-windows-bootstrap-bundles.bat`](publish-windows-bootstrap-bundles.bat) (`uploads/` excluded by default). Individual packagers: `scripts\package-vanilla-apache-php85.bat` and `package-for-deployment.bat`. See [`docs/WINDOWS_BOOTSTRAP_BUNDLES.md`](docs/WINDOWS_BOOTSTRAP_BUNDLES.md).

To patch PHP and Apache **in place** on an existing `D:\Apache` + `D:\php` host (keep `php.ini` / `httpd.conf`): [`upgrade-vanilla-apache-php.bat`](upgrade-vanilla-apache-php.bat) — [`docs/VANILLA_APACHE_PHP_UPGRADE.md`](docs/VANILLA_APACHE_PHP_UPGRADE.md).

## XAMPP PHP upgrades

See [`docs/XAMPP_PHP_UPGRADE.md`](docs/XAMPP_PHP_UPGRADE.md) and `scripts/upgrade-xampp-php.ps1` to upgrade the Windows XAMPP PHP runtime (LDAP-gated; works for 8.5 and later published minors).

## Package for deployment (Windows XAMPP)

See [`docs/PACKAGE_FOR_DEPLOYMENT.md`](docs/PACKAGE_FOR_DEPLOYMENT.md). Double-click or run `package-for-deployment.bat` (flags forward to `package-for-deployment.ps1`: `-AppOnly` for a lean application ZIP, `-IncludeDatabase`, `-ExcludeUploads`, `-SkipBuild`, `-SkipSqliteRuntime`, `-SkipRemoteRuntime`, `-BasePath`, `-OutputDir`).

## Office / Windows Server 2022 replication

See [`docs/OFFICE_WIN2022_DEPLOY.md`](docs/OFFICE_WIN2022_DEPLOY.md) for the verified Win2022 deploy (PHP 8.5.9, Apache, link-health fix, performance tweaks) and how to repeat it on an office host.
