# 📊 Docker Deployment Package - Visual Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LinkNest Source Files                        │
│  (Your current installation: c:\xampp\htdocs\linknest)         │
│                                                                 │
│  • api/              • components/      • data/linknest.db     │
│  • scripts/          • contexts/        • uploads/             │
│  • services/         • land/            • config files         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ prepare-package.bat
                              │ (copies files)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Docker Deployment Package                          │
│         (docker-deploy-package/ folder)                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Core Files                                                │ │
│  │  • deploy.bat          (main deployment script)          │ │
│  │  • Dockerfile          (image definition)                │ │
│  │  • docker-compose.yml  (container config)                │ │
│  │  • .dockerignore       (build optimization)              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Application Files (copied from source)                   │ │
│  │  • api/              • components/      • data/          │ │
│  │  • scripts/          • contexts/        • uploads/       │ │
│  │  • services/         • land/            • configs/       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Documentation                                             │ │
│  │  • README.md                (complete guide)             │ │
│  │  • QUICK_START.md           (quick start)                │ │
│  │  • PACKAGE_BUILDER_GUIDE.md (for creators)               │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ create-zip.bat
                              │ (creates zip file)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         linknest-docker-deploy-YYYYMMDD_HHMMSS.zip             │
│                  (Distributable Package)                        │
│                                                                 │
│  • Ready to share                                              │
│  • Self-contained                                              │
│  • One-click deployment                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Share via email, drive, etc.
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Recipient's Machine                          │
│                                                                 │
│  1. Extract zip file                                           │
│  2. Run deploy.bat                                             │
│  3. Access at http://localhost:8090                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ deploy.bat
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Containers                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ LinkNest Container (linknest)                           │  │
│  │                                                         │  │
│  │  • PHP 8.2 + Apache                                    │  │
│  │  • SQLite Database                                     │  │
│  │  • React Frontend (built)                              │  │
│  │  • Monitoring Workers                                  │  │
│  │  • SSL/HTTPS Support                                   │  │
│  │  • Automatic Backups                                   │  │
│  │                                                         │  │
│  │  Ports: 8090 (HTTP), 8443 (HTTPS)                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Mailpit Container (linknest-mailpit)                   │  │
│  │                                                         │  │
│  │  • Email Testing Server                                │  │
│  │  • Web UI for Emails                                   │  │
│  │                                                         │  │
│  │  Ports: 1025 (SMTP), 8025 (Web UI)                    │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow Diagram

### For Package Creators

```
START
  │
  ├─► Run create-docker-package.bat (Master Script)
  │     │
  │     ├─► Step 1: Prepare Package
  │     │     │
  │     │     ├─► Create directories
  │     │     ├─► Copy API files
  │     │     ├─► Copy scripts
  │     │     ├─► Copy frontend source
  │     │     ├─► Copy configs
  │     │     ├─► Copy database
  │     │     ├─► Copy uploads
  │     │     └─► Create docs
  │     │
  │     ├─► Step 2: Test (Optional)
  │     │     │
  │     │     ├─► Build Docker image
  │     │     ├─► Start containers
  │     │     ├─► Verify functionality
  │     │     └─► Stop containers
  │     │
  │     └─► Step 3: Create Zip
  │           │
  │           └─► Generate timestamped zip file
  │
  └─► DONE: Ready to distribute!
```

### For Recipients

```
START
  │
  ├─► Receive zip file
  │
  ├─► Extract to folder
  │
  ├─► Run deploy.bat
  │     │
  │     ├─► Check Docker installed
  │     ├─► Check Docker running
  │     ├─► Stop old containers
  │     ├─► Build Docker image
  │     │     │
  │     │     ├─► Stage 1: Build Frontend
  │     │     │     ├─► Install npm dependencies
  │     │     │     ├─► Build React app
  │     │     │     └─► Verify build
  │     │     │
  │     │     └─► Stage 2: Create Runtime
  │     │           ├─► Install PHP + Apache
  │     │           ├─► Copy built frontend
  │     │           ├─► Copy backend files
  │     │           ├─► Copy database
  │     │           ├─► Copy uploads
  │     │           ├─► Configure Apache
  │     │           ├─► Configure PHP
  │     │           ├─► Generate SSL cert
  │     │           └─► Set up cron jobs
  │     │
  │     ├─► Start containers
  │     │     ├─► Start LinkNest
  │     │     └─► Start Mailpit
  │     │
  │     ├─► Wait for health check
  │     │
  │     └─► Open browser
  │
  └─► DONE: Application running!
```

## File Flow

```
Source Files                Package Files              Docker Image
────────────                ─────────────              ────────────

api/                   ──►  api/                  ──►  /var/www/html/api/
scripts/               ──►  scripts/              ──►  /var/www/html/scripts/
components/            ──►  components/           ──►  (built to dist/)
contexts/              ──►  contexts/             ──►  (built to dist/)
services/              ──►  services/             ──►  (built to dist/)
land/                  ──►  land/                 ──►  (built to dist/)
data/linknest.db       ──►  data/linknest.db      ──►  /var/www/html/data/linknest.db
uploads/               ──►  uploads/              ──►  /var/www/html/uploads/
package.json           ──►  package.json          ──►  (used during build)
vite.config.ts         ──►  vite.config.ts        ──►  (used during build)
index.html             ──►  index.html            ──►  /var/www/html/index.html
.htaccess              ──►  .htaccess             ──►  /var/www/html/.htaccess
check_opcache.php      ──►  check_opcache.php     ──►  /var/www/html/check_opcache.php

docker/apache-*.conf   ──►  docker-config/*.conf  ──►  /etc/apache2/sites-available/
docker/php-config.ini  ──►  docker-config/*.ini   ──►  /usr/local/etc/php/conf.d/
docker/*.sh            ──►  docker-config/*.sh    ──►  /usr/local/bin/
```

## Port Mapping

```
Host Machine              Docker Container
────────────              ────────────────

localhost:8090       ──►  linknest:80        (HTTP)
localhost:8443       ──►  linknest:443       (HTTPS)
localhost:1025       ──►  mailpit:1025       (SMTP)
localhost:8025       ──►  mailpit:8025       (Web UI)
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     User's Browser                           │
│                  http://localhost:8090                       │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                  Apache Web Server                           │
│                  (in linknest container)                     │
│                                                              │
│  ┌────────────────────┐        ┌──────────────────────┐    │
│  │  Static Files      │        │  PHP Backend         │    │
│  │  (React App)       │        │  (API Endpoints)     │    │
│  │  /dist/            │        │  /api/               │    │
│  └────────────────────┘        └──────────────────────┘    │
│                                          │                   │
└──────────────────────────────────────────┼───────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────┐
                            │  SQLite Database         │
                            │  /var/www/html/data/     │
                            │  linknest.db             │
                            └──────────────────────────┘
```

## Container Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Container Lifecycle                       │
└─────────────────────────────────────────────────────────────┘

docker compose up -d
       │
       ├─► Container Created
       │
       ├─► Entrypoint Script Runs
       │     │
       │     ├─► Start Cron (for backups)
       │     ├─► Start Workers (monitoring)
       │     └─► Start Apache
       │
       ├─► Health Check Starts
       │     │
       │     └─► Checks /api/settings every 30s
       │
       ├─► Container Running
       │     │
       │     ├─► Serves HTTP on port 80
       │     ├─► Serves HTTPS on port 443
       │     ├─► Runs monitoring workers
       │     └─► Daily backups at 3 AM
       │
       └─► Container Healthy ✓

docker compose stop
       │
       └─► Container Stopped (data preserved)

docker compose start
       │
       └─► Container Restarted (same data)

docker compose down
       │
       └─► Container Removed (data lost unless exported)
```

## Backup Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Automatic Backups                         │
└─────────────────────────────────────────────────────────────┘

Every Day at 3:00 AM
       │
       ├─► Cron Job Triggers
       │
       ├─► /api/snapshot.php Runs
       │     │
       │     ├─► Creates snapshot in /data/backups/
       │     ├─► Filename: linknest-snapshot-YYYY-MM-DD-HHMMSS.db
       │     └─► Removes backups older than 30 days
       │
       └─► Backup Complete

Manual Export
       │
       └─► docker cp linknest:/var/www/html/data/linknest.db ./backup.db
```

## Troubleshooting Flow

```
Problem: Container won't start
       │
       ├─► Check: Is Docker running?
       │     ├─► No  → Start Docker Desktop
       │     └─► Yes → Continue
       │
       ├─► Check: Are ports available?
       │     ├─► No  → Change ports in docker-compose.yml
       │     └─► Yes → Continue
       │
       ├─► Check: View logs
       │     └─► docker compose logs
       │
       └─► Rebuild: docker compose build --no-cache
```

---

## Quick Reference Cards

### Package Creator Card
```
┌─────────────────────────────────────┐
│   Package Creator Quick Ref         │
├─────────────────────────────────────┤
│ 1. Prepare:                         │
│    cd docker-deploy-package         │
│    prepare-package.bat              │
│                                     │
│ 2. Test:                            │
│    deploy.bat                       │
│    docker compose down              │
│                                     │
│ 3. Package:                         │
│    create-zip.bat                   │
│                                     │
│ 4. Distribute:                      │
│    Share the zip file               │
└─────────────────────────────────────┘
```

### Recipient Card
```
┌─────────────────────────────────────┐
│   Recipient Quick Ref               │
├─────────────────────────────────────┤
│ 1. Extract zip file                 │
│                                     │
│ 2. Run deploy.bat                   │
│                                     │
│ 3. Access:                          │
│    http://localhost:8090            │
│                                     │
│ 4. Manage:                          │
│    docker compose stop/start        │
└─────────────────────────────────────┘
```

### Container Management Card
```
┌─────────────────────────────────────┐
│   Container Management              │
├─────────────────────────────────────┤
│ View logs:                          │
│   docker compose logs -f            │
│                                     │
│ Stop:                               │
│   docker compose stop               │
│                                     │
│ Start:                              │
│   docker compose start              │
│                                     │
│ Restart:                            │
│   docker compose restart            │
│                                     │
│ Remove:                             │
│   docker compose down               │
│                                     │
│ Rebuild:                            │
│   docker compose build --no-cache   │
└─────────────────────────────────────┘
```

---

This visual guide provides a comprehensive overview of the entire Docker deployment package system!
