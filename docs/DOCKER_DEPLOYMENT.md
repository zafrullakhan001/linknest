# Docker deployment & database

LinkNest Docker is a **single isolated container** (PHP + Apache + SQLite). It does **not** bind-mount `data/` or `uploads/` from the host. The image copies those folders at **build** time. After that, the live database lives **only inside the container** until you copy it in or out.

Rebuilds (`redeploy-docker.bat`) bake whatever is on the host **at build time**. They do **not** keep later edits you made only inside Docker, and they do not rewrite XAMPP paths such as `/linknest/uploads/...`. Use the sync commands below to copy a live database without rebuilding the image.

Also in-app: **Help & About → Help → Docker deployment & database**.

---

## URLs

| Service | URL |
|---------|-----|
| App HTTP | http://localhost:8090 |
| App HTTPS | https://localhost:8443 |
| Mailpit inbox | http://localhost:8025 |
| Backup UI (in container) | http://localhost:8090/backup_restore_docker.php |

Default login: `admin` / `admin123` (change it).

---

## Deploy / redeploy

From the project root (Windows):

```bat
redeploy-docker.bat
```

Or:

```bat
docker\docker-deploy.bat
```

Linux / macOS:

```bash
./redeploy-docker.sh
# or
chmod +x docker/docker-deploy.sh && ./docker/docker-deploy.sh
```

This stops the stack, rebuilds the image (frontend + PHP), and starts **linknest** + **linknest-mailpit**.

Manual equivalent:

```bash
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

---

## Copy the host database into Docker (restore images / tiles)

XAMPP usually stores tile images as `/linknest/uploads/filename.png`. Docker serves the app at `/`, so those URLs 404 (broken image icons) until paths are rewritten to `/uploads/filename.png`.

**Windows (recommended):**

```bat
docker\docker-sync-database.bat
```

That copies `data/linknest.db` **and** `uploads/` into the running `linknest` container, rewrites `/linknest/uploads/` → `/uploads/`, and restarts the container.

**Linux / macOS:**

```bash
chmod +x docker/docker-sync-database.sh
./docker/docker-sync-database.sh in
```

**Raw Docker commands** (same idea, no rewrite):

```bat
docker cp data\linknest.db linknest:/var/www/html/data/linknest.db
docker cp uploads\. linknest:/var/www/html/uploads/
docker exec -u root linknest sh -c "chown www-data:www-data /var/www/html/data/linknest.db && chown -R www-data:www-data /var/www/html/uploads"
docker restart linknest
```

Then hard-refresh the browser (Ctrl+F5).

---

## Copy the Docker database back to the host

Use this when Docker is the source of truth (you edited tiles only in the container) and you want XAMPP to match.

```bat
docker\docker-sync-database.bat -Direction Out
```

The host `data/linknest.db` is copied aside as `data/linknest.db.hostbak-YYYYMMDD-HHMMSS` first.

Linux:

```bash
./docker/docker-sync-database.sh out
```

**Raw Docker commands:**

```bat
docker cp linknest:/var/www/html/data/linknest.db data\linknest.db
docker cp linknest:/var/www/html/uploads\. uploads\
```

---

## Sync script options

### Windows (`docker-sync-database.bat` → `.ps1`)

| Flag | Purpose |
|------|---------|
| *(none)* / `-Direction In` | Host → Docker (default) |
| `-Direction Out` | Docker → host |
| `-DatabaseOnly` | Copy only `data/linknest.db` |
| `-UploadsOnly` | Copy only `uploads/` (logos, tile emoji/header images) |
| `-SkipPathRewrite` | Do not change `/linknest/uploads` vs `/uploads` |
| `-HostBasePath "/linknest"` | When copying **Out**, prefix `/uploads/` with this XAMPP folder (also `/ArchLinks`, `/ERP3`) |
| `-Container linknest` | Container name |

Examples:

```bat
docker\docker-sync-database.bat
docker\docker-sync-database.bat -Direction Out
docker\docker-sync-database.bat -DatabaseOnly
docker\docker-sync-database.bat -UploadsOnly
docker\docker-sync-database.bat -Direction Out -HostBasePath /ArchLinks
```

### Linux (`docker-sync-database.sh`)

| Argument | Purpose |
|----------|---------|
| `in` (default) | Host → Docker |
| `out` | Docker → host |
| `--db-only` | Database only |
| `--uploads-only` | Uploads only |
| `--skip-path-rewrite` | Leave stored URLs unchanged |
| `--host-base-path /linknest` | XAMPP folder name for outbound rewrite |

```bash
./docker/docker-sync-database.sh in
./docker/docker-sync-database.sh out --db-only
./docker/docker-sync-database.sh in --uploads-only
```

---

## Why images break after a Docker rebuild

1. Tile **emoji** / **header** images are files in `uploads/` plus URLs in SQLite (`tiles.emoji_image`, `tiles.header_image`).
2. A rebuild copies host files **once**. If Docker was missing `uploads/` or using an older DB, cards show the browser broken-image icon.
3. Even with files present, URLs like `/linknest/uploads/tileemoji_….png` do not exist on Docker (no `/linknest` prefix). The sync script (and container start) rewrite them to `/uploads/…`.
4. Apache in Docker also maps `/linknest/uploads/…` → `/uploads/…` as a safety net.

---

## Other useful Docker commands

```bat
docker compose -f docker\docker-compose.yml ps
docker compose -f docker\docker-compose.yml logs -f linknest
docker compose -f docker\docker-compose.yml restart
docker compose -f docker\docker-compose.yml down
docker exec -it linknest bash
```

Web backup/restore inside the container: [http://localhost:8090/backup_restore_docker.php](http://localhost:8090/backup_restore_docker.php).

In-app **App Updates** do **not** apply inside Docker; redeploy the image instead.
