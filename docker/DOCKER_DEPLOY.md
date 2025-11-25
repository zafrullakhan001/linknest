# Docker Deployment Guide - Port 8000

This guide will help you deploy LinkNest as a Docker container on port 8000.

## Quick Start

### Windows
```bash
cd docker
docker-deploy.bat
```

### Linux/Mac
```bash
cd docker
chmod +x docker-deploy.sh
./docker-deploy.sh
```

### Manual Deployment

1. **Create necessary directories:**
   ```bash
   mkdir -p data uploads
   ```

2. **Build and start the container:**
   ```bash
   docker compose -f docker/docker-compose.yml up -d --build
   ```

3. **Access the application:**
   Open your browser and navigate to: **http://localhost:8000**

## Default Credentials

- **Username:** `admin`
- **Password:** `admin123`

⚠️ **IMPORTANT:** Change the admin password immediately after first login!

## Docker Commands

### View Logs
```bash
docker compose -f docker/docker-compose.yml logs -f
```

### Stop Container
```bash
docker compose -f docker/docker-compose.yml down
```

### Restart Container
```bash
docker compose -f docker/docker-compose.yml restart
```

### View Container Status
```bash
docker compose -f docker/docker-compose.yml ps
```

### Rebuild After Code Changes
```bash
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

### Access Container Shell
```bash
docker exec -it linknest bash
```

## Port Configuration

The application is configured to run on **port 8000**. The container maps:
- Host port: `8000`
- Container port: `80` (Apache)

To change the port, edit `docker/docker-compose.yml`:
```yaml
ports:
  - "YOUR_PORT:80"  # Change YOUR_PORT to desired port
```

## Data Persistence

The following directories are mounted as volumes and persist data:
- `./data` - SQLite database
- `./uploads` - Uploaded logo images

These directories are created automatically if they don't exist.

## Troubleshooting

### Container won't start
```bash
docker compose -f docker/docker-compose.yml logs
```

### Port 8000 already in use
1. Stop the service using port 8000, or
2. Change the port in `docker/docker-compose.yml`:
   ```yaml
   ports:
     - "8001:80"  # Use port 8001 instead
   ```

### Permission issues (Linux/Mac)
```bash
sudo chown -R $USER:$USER data uploads
chmod -R 755 data uploads
```

### Rebuild after code changes
```bash
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

## Architecture

- **Frontend:** React/Vite application (built during Docker build)
- **Backend:** PHP 8.2 with Apache
- **Database:** SQLite (stored in `./data` directory)
- **Uploads:** Logo images (stored in `./uploads` directory)

## Health Check

The container includes a health check that verifies the API is responding:
```bash
docker compose -f docker/docker-compose.yml ps
```

Look for "healthy" status in the output.

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
# Pull latest code (if using git)
git pull

# Rebuild and restart
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

## Production Deployment

For production, use the production compose file:
```bash
docker compose -f docker/docker-compose.prod.yml up -d --build
```

This includes:
- Restart policy: `always`
- Health checks
- Traefik labels (if using Traefik)

## Environment Variables

Create a `.env` file in the project root for environment variables:
```env
GEMINI_API_KEY=your_api_key_here
```

## Security Notes

1. Change default admin password immediately
2. Use environment variables for sensitive data
3. Consider using Docker secrets for production
4. Regularly update Docker images
5. The uploads directory has `.htaccess` to prevent PHP execution

