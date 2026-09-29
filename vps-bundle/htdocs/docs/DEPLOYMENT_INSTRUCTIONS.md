# LinkNest Deployment Instructions

This document explains how to deploy LinkNest from a bundled zip file.

## For Windows Users

### Prerequisites

1. **Docker Desktop for Windows**
   - Download from: https://www.docker.com/products/docker-desktop
   - Install and start Docker Desktop
   - Make sure Docker Desktop is running before proceeding

2. **Extract the Bundle**
   - Extract the `linknest-deploy-*.zip` file to a folder
   - Example: `C:\linknest\`

### Deployment Steps

1. **Open Command Prompt or PowerShell**
   - Navigate to the extracted folder
   - Example: `cd C:\linknest`

2. **Run the Deployment Script**
   ```
   scripts\deploy.bat
   ```

3. **Wait for Completion**
   - The script will:
     - Check Docker installation
     - Build the Docker image (first time may take 5-10 minutes)
     - Start the application
   - You'll see "Deployment Successful!" when done

4. **Access the Application**
   - Open your browser and go to: `http://localhost:8000`
   - Default login:
     - Username: `admin`
     - Password: `admin123`
   - **IMPORTANT**: Change the admin password immediately!

### Troubleshooting

**Docker is not running:**
- Make sure Docker Desktop is started
- Wait for Docker Desktop to fully initialize (whale icon in system tray)

**Port 8000 already in use:**
- Edit `docker-compose.yml`
- Change `"8000:80"` to another port like `"8001:80"`

**Build fails:**
- Check internet connection (needs to download Docker images)
- Ensure Docker Desktop has enough resources allocated
- Check logs: `docker compose logs`

**Container won't start:**
- Check logs: `docker compose logs`
- Ensure port 8000 is not blocked by firewall

## For Linux/Mac Users

### Prerequisites

1. **Docker and Docker Compose**
   - Install Docker: https://docs.docker.com/get-docker/
   - Docker Compose is usually included

2. **Extract the Bundle**
   - Extract the zip file
   - Example: `~/linknest/`

### Deployment Steps

1. **Open Terminal**
   - Navigate to the extracted folder
   - Example: `cd ~/linknest`

2. **Make Script Executable**
   ```bash
   chmod +x scripts/deploy.sh
   ```

3. **Run the Deployment Script**
   ```bash
   ./scripts/deploy.sh
   ```

4. **Access the Application**
   - Open browser: `http://localhost:8000`
   - Default login: `admin` / `admin123`

## Useful Commands

### View Logs
```bash
# Windows
docker compose logs -f

# Linux/Mac
docker compose logs -f
```

### Stop Application
```bash
docker compose down
```

### Restart Application
```bash
docker compose restart
```

### View Status
```bash
docker compose ps
```

### Rebuild After Changes
```bash
docker compose down
docker compose up -d --build
```

## Data Persistence

Your data is stored in:
- `data/` - Database files
- `uploads/` - Uploaded logo images

These folders persist even if you remove the container.

## Backup

To backup your data:
1. Stop the application: `docker compose down`
2. Copy the `data/` and `uploads/` folders
3. Restart: `docker compose up -d`

## Production Deployment

For production, use the production compose file:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This runs on port 8000.

## Support

If you encounter issues:
1. Check Docker Desktop is running (Windows)
2. Check Docker service is running (Linux)
3. Review logs: `docker compose logs`
4. Ensure ports are not blocked by firewall
5. Verify Docker has enough resources allocated

## Security Notes

1. **Change default admin password immediately**
2. **Don't expose port 80/8080 to the internet without proper security**
3. **Regularly backup your data folder**
4. **Keep Docker images updated**

## XAMPP in-app updates (no Docker)

For XAMPP installs, publish GitHub Releases with `scripts/publish-update-release.ps1` and apply them from **Admin → App Updates**. See [`docs/APP_UPDATES.md`](APP_UPDATES.md).


