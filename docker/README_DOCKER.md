# LinkNest Docker Deployment Guide

This guide explains how to deploy LinkNest using Docker on Ubuntu.

## Quick Start (Single Command)

Run the deployment script from the docker directory:

```bash
cd docker
chmod +x docker-deploy.sh
./docker-deploy.sh
```

This script will:
1. Install Docker and Docker Compose (if not already installed)
2. Create necessary directories
3. Build the Docker image
4. Start the application

The application will be available at `http://localhost:8090` and `https://localhost:8443`

## Manual Deployment

### Prerequisites

- Ubuntu 20.04 or later
- Docker and Docker Compose installed

### Step 1: Install Docker (if not installed)

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo usermod -aG docker $USER
# Log out and log back in for group changes to take effect
```

### Step 2: Clone/Navigate to Project

```bash
cd /path/to/linknest
```

### Step 3: Create Directories

```bash
mkdir -p data uploads
chmod 755 data uploads
```

### Step 4: Build and Run

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

### Step 5: Access Application

Open your browser and navigate to:
- HTTP: `http://localhost:8090`
- HTTPS: `https://localhost:8443`

## Docker Commands

### View Logs
```bash
docker compose -f docker/docker-compose.yml logs -f
```

### Stop Application
```bash
docker compose -f docker/docker-compose.yml down
```

### Restart Application
```bash
docker compose -f docker/docker-compose.yml restart
```

### Rebuild After Changes
```bash
docker compose -f docker/docker-compose.yml up -d --build
```

### View Container Status
```bash
docker compose -f docker/docker-compose.yml ps
```

### Access Container Shell
```bash
docker exec -it linknest bash
```

## Default Credentials

- **Username**: `admin`
- **Password**: `admin123`

**Important**: Change the admin password immediately after first login!

## Clone Instance (host only)

Admin → Integrations → Clone copies the app to a **sibling folder on the host** (for example XAMPP `htdocs`). That path does not work inside Docker or WSL. In those modes the UI shows:

> Clone is not available in Docker or WSL mode. Please go with Docker clone or redeploy via Docker container.

To refresh this container after code changes, rebuild:

```bash
# from the project root
./redeploy-docker.sh
# Windows: redeploy-docker.bat
```

The Docker image includes **Node.js 20 + npm** so Admin → App Updates can apply a GitHub commit and rebuild `dist/` inside the container (Vite config `vite.docker.config.ts`, base `/`).

To create another **host** copy (not a second container), run on the host:

```bash
scripts/clone-linknest.sh myspaces --preset empty
```

Presets: `empty`, `structure`, `full`, `demo`. Each clone writes `data/install_identity.php` so logins do not share cookies with other folders. The Docker entrypoint writes a Docker identity (`LNSESSdocker`, cookie path `/`) so `http://localhost:8090` stays separate from host XAMPP.

## Production Deployment

For production, use the production compose file:

```bash
docker compose -f docker/docker-compose.prod.yml up -d --build
```

This will:
- Run on HTTP 8090 and HTTPS 8443
- Set restart policy to `always`
- Include health checks, SSH/VNC gateway ports, and workers

## Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
```

## Data Persistence

The following directories are mounted as volumes:
- `./data` - SQLite database
- `./uploads` - Uploaded logo images

These persist even if the container is removed.

## Troubleshooting

### Container won't start
```bash
docker compose -f docker/docker-compose.yml logs
```

### Permission issues
```bash
sudo chown -R $USER:$USER data uploads
chmod -R 755 data uploads
```

### Port already in use
Edit `docker/docker-compose.yml` and change the port mapping:
```yaml
ports:
  - "8090:80"  # Change 8090 to any available port (e.g., "8001:80")
  - "8443:443"
```

### Rebuild after code changes
```bash
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

## Architecture

The Docker setup includes:
- **Frontend**: React/Vite application (built during Docker build)
- **Backend**: PHP 8.4 with Apache (GD, LDAP, zip, OPcache)
- **Database**: SQLite (stored in `./data` directory)
- **Uploads**: Logo images (stored in `./uploads` directory)

## Security Notes

1. Change default admin password immediately
2. Use environment variables for sensitive data
3. Consider using Docker secrets for production
4. Regularly update Docker images
5. The uploads directory has `.htaccess` to prevent PHP execution

## Backup

To backup your data:

```bash
# Backup database
cp data/linknest.db data/linknest.db.backup

# Backup uploads
tar -czf uploads-backup.tar.gz uploads/
```

## Updates

To update the application:

```bash
git pull  # If using git
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

















































































































