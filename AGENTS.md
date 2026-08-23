# AGENTS.md

LinkNest is a self-hostable visual bookmark / landing-page manager. It has a
React 19 + TypeScript + Vite frontend and a PHP backend that stores data in a
file-based **SQLite** database (not MySQL). Optional Python worker scripts under
`scripts/` handle uptime monitoring and email sending.

## Cursor Cloud specific instructions

### Services and how to run them (development)

The dev setup runs two long-lived processes. The Vite dev server proxies
`/api` and `/uploads` to the PHP backend, so both must be running.

| Service | Command | Port | Notes |
| --- | --- | --- | --- |
| PHP backend (API) | `php -S localhost:8000 router.php` (run from repo root) | 8000 | Serves `api/index.php`. The SQLite DB at `data/linknest.db` is created automatically on first request. |
| Vite frontend (dev) | `npm run dev` | 3000 | Open http://localhost:3000. Proxies API calls to the PHP backend. |

Non-obvious caveats:

- The Vite dev proxy target host/port comes from env vars, defaulting to
  `http://localhost:80`. A local (gitignored) `.env.local` with `VITE_PORT=8000`
  (plus `VITE_PROTOCOL=http`, `VITE_HOST=localhost`, `VITE_API_BASE=/api`) points
  the proxy at the PHP dev server on port 8000. Recreate `.env.local` if it is
  missing, or start PHP on whatever port `VITE_PORT` targets.
- There is **no `composer.json`** — PHP has no package dependencies. The backend
  only needs PHP 8 with the `pdo_sqlite` extension (also uses `ldap`/`curl`/
  `mbstring`/`opcache` for optional features).
- A default admin account is auto-seeded on first DB init: username `admin`,
  password `admin123`. New self-registered users are unapproved and cannot log
  in until an admin approves them.
- Guest access is disabled by default, so you must log in to view/create spaces.

### Lint / typecheck / build / test

- There is **no lint script and no automated test suite** in this repo. `package.json`
  only defines `dev`, `build`, `build:prod`, and `preview`.
- `npm run build` (Vite + esbuild) is the build check. Note esbuild does **not**
  typecheck; `npx tsc --noEmit` currently reports a couple of pre-existing type
  errors that do not block the build.
- The `data/` directory (SQLite DB) and `dist/` build output are gitignored.
