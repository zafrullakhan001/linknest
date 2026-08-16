# LinkNest Clone Scripts

These scripts copy LinkNest to a **sibling folder on the host filesystem** (for example `C:\xampp\htdocs\myspaces`), configure a new base path, apply a clone preset, isolate login cookies, and build for deployment.

**Docker and WSL are not supported.** Admin → Integrations → Clone and these scripts both refuse there with:

> Clone is not available in Docker or WSL mode. Please go with Docker clone or redeploy via Docker container.

Use `redeploy-docker.bat` / `redeploy-docker.sh` (or `docker/docker-deploy.bat`) to rebuild the container instead.

## Usage

### Windows

```batch
cd scripts
clone-linknest.bat <new-folder-name> [--preset empty|structure|full|demo]
```

**Examples:**
```batch
clone-linknest.bat myspaces
clone-linknest.bat myspaces --preset empty
clone-linknest.bat myspaces --preset structure
clone-linknest.bat myspaces --preset full
clone-linknest.bat myspaces --preset demo
```

This creates `myspaces` in the parent directory (e.g. `C:\xampp\htdocs\myspaces\`).

### Linux/Mac (host Apache/PHP, not WSL)

```bash
cd scripts
chmod +x clone-linknest.sh
./clone-linknest.sh <new-folder-name> [--preset empty|structure|full|demo]
```

## Presets

| Preset | Database | Uploads | Login |
|--------|----------|---------|-------|
| **empty** (default) | Fresh schema | None | `admin` / `admin123` |
| **structure** | Copied, then private tiles and extra users removed | All | `admin` / `admin123` |
| **full** | Full copy | All | Same as source |
| **demo** | Fresh schema + demo seed | None | `admin` / `admin123` and `demo1`–`demo10` / `password` |

Legacy flags still work: `--assets --database` maps to **full**, `--database` maps to **structure**.

## What the Script Does

1. Refuses to run inside Docker or WSL
2. Copies application files (excludes `node_modules`, `dist`, `.git`)
3. Copies database and uploads according to the preset
4. Writes `.env` with `VITE_BASE_PATH`
5. Runs `scripts/apply-clone-preset.php` (schema, structure sanitization or demo data, `data/install_identity.php`)
6. Runs `npm install` and `npm run build`, then removes `node_modules`

Each clone gets its own session cookie name and path (`data/install_identity.php`). Do not copy that file between installs.

## After Cloning

1. Open `http://localhost/<new-folder-name>/`
2. Sign in with the credentials for the preset you chose
3. Change the admin password in Admin Panel

## Docker

Do not use these scripts inside the container. Rebuild:

```batch
redeploy-docker.bat
```

The Docker image already includes the host-only Clone UI (shown as unavailable) and writes a Docker-specific install identity on startup so `http://localhost:8090` does not share login cookies with host XAMPP.
