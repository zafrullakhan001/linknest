# LinkNest Docker Deployment Guide

**Single Container Architecture**: This deployment uses ONE container that includes PHP 8.4, Apache, and SQLite - everything runs together for simplicity and efficiency.

This guide explains how to deploy LinkNest using Docker with all optimizations enabled.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose
- At least 2GB of free disk space
- Port 8090 available on your system

## Quick Start

### Windows
```batch
cd docker
deploy.bat
```

### Linux/Mac
```bash
cd docker
chmod +x deploy.sh
./deploy.sh
```

## Manual Deployment

### 1. Build the Docker Image
```bash
cd docker
docker-compose build
```

### 2. Start the Container
```bash
docker-compose up -d
```

### 3. Check Status
```bash
docker-compose ps
docker-compose logs -f
```

## Access the Application

Once deployed, access the application at:
- **URL**: http://localhost:8090
- **Default Admin**: 
  - Username: `admin`
  - Password: `admin123`

**⚠️ IMPORTANT**: Change the default admin password immediately after first login!

## Container Configuration

### Port Mapping
- Container port: `80`
- Host port: `8090`
- Access: `http://localhost:8090`

### Volumes
- Database: `./data` → `/var/www/html/data`
  - **Existing database**: Your existing `linknest.db` file will be copied into the container during build
  - **Volume mount**: The database is also mounted as a volume, so changes persist on the host
  - **First run**: If no database exists, it will be created automatically
- Uploads: `./uploads` → `/var/www/html/uploads`

### Environment Variables
- `APACHE_DOCUMENT_ROOT`: `/var/www/html`
- `PHP_MEMORY_LIMIT`: `256M`
- `PHP_MAX_EXECUTION_TIME`: `300`
- `PHP_UPLOAD_MAX_FILESIZE`: `10M`
- `PHP_POST_MAX_SIZE`: `10M`

## SQLite Optimizations

The deployment includes the following SQLite optimizations:

1. **WAL Mode**: Write-Ahead Logging for better concurrent access
2. **Memory Mapping**: 100MB mmap_size for faster database access
3. **Cache Size**: 4MB cache to hold entire database in memory
4. **Synchronous Mode**: NORMAL mode for better performance with WAL
5. **Temp Store**: MEMORY mode for faster temporary operations
6. **Busy Timeout**: 5000ms for handling concurrent access
7. **Database Indexes**: Comprehensive indexes on all frequently queried columns

## PHP Optimizations

1. **OPcache**: Enabled with 128MB memory, 10,000 accelerated files
2. **Realpath Cache**: 4MB cache with 600s TTL
3. **Output Compression**: Gzip compression enabled
4. **Memory Limit**: 256MB for handling large operations
5. **Execution Time**: 300 seconds for long-running tasks

## Apache Optimizations

1. **Rewrite Module**: Enabled for clean URLs
2. **Headers Module**: Enabled for proper MIME types
3. **MIME Module**: Enabled for correct content types
4. **Directory Indexing**: Disabled for security
5. **Cache Control**: Proper caching headers for static assets

## Useful Commands

### View Logs
```bash
docker-compose logs -f
```

### Stop Container
```bash
docker-compose stop
```

### Start Container
```bash
docker-compose start
```

### Restart Container
```bash
docker-compose restart
```

### Remove Container
```bash
docker-compose down
```

### Rebuild After Code Changes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Access Container Shell
```bash
docker exec -it linknest bash
```

### Check PHP Version
```bash
docker exec linknest php -v
```

### Check SQLite Extension
```bash
docker exec linknest php -m | grep sqlite
```

### Optimize Database
Access via browser: http://localhost:8090/api/optimize_database.php

## Troubleshooting

### Container Won't Start
1. Check if port 8090 is already in use:
   ```bash
   netstat -an | grep 8090  # Linux/Mac
   netstat -an | findstr 8090  # Windows
   ```
2. Check Docker logs:
   ```bash
   docker-compose logs
   ```

### Database Issues
1. Ensure data directory has proper permissions:
   ```bash
   chmod 755 data
   chmod 644 data/linknest.db
   ```

### Permission Issues
1. Fix ownership (Linux/Mac):
   ```bash
   sudo chown -R $USER:$USER data uploads
   ```

### Frontend Not Loading
1. Check if dist directory exists in container:
   ```bash
   docker exec linknest ls -la /var/www/html/dist
   ```
2. Rebuild frontend:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

## Production Considerations

1. **Change Default Passwords**: Immediately change admin password
2. **HTTPS**: Use a reverse proxy (nginx/traefik) for HTTPS
3. **Backup**: Regularly backup the `data` directory
4. **Monitoring**: Set up container health monitoring
5. **Updates**: Regularly update Docker images and dependencies
6. **Security**: Review and adjust PHP settings for your environment
7. **Firewall**: Configure firewall rules appropriately

## Backup and Restore

### Backup Database
```bash
cp data/linknest.db data/linknest.db.backup
```

### Restore Database
```bash
cp data/linknest.db.backup data/linknest.db
docker-compose restart
```

## Performance Monitoring

### Check Container Resources
```bash
docker stats linknest
```

### Check Database Size
```bash
docker exec linknest ls -lh /var/www/html/data/linknest.db
```

### Check PHP Memory Usage
Access: http://localhost:8090/check_opcache.php (if available)

## Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Review this documentation
3. Check the main project README

