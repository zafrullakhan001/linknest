# Docker Deployment Summary

## Overview

**Single Container Architecture**: This deployment uses ONE container that includes:
- PHP 8.4 with Apache web server
- SQLite database with all optimizations
- All application code and assets
- No separate database container needed

This Docker deployment configuration provides a complete, optimized container setup for LinkNest with all performance enhancements enabled.

## Configuration Files

### 1. `docker-compose.yml`
- **Port**: Exposes application on port **8090** (host) → 80 (container)
- **Volumes**: 
  - `./data` → Database storage (persistent)
    - Existing `linknest.db` is copied into container during build
    - Volume mount ensures database persists on host filesystem
  - `./uploads` → File uploads (persistent)
- **Environment**: PHP memory and execution limits configured
- **Health Check**: Automatic health monitoring
- **Restart Policy**: Auto-restart on failure

### 2. `Dockerfile`
- **Base Image**: PHP 8.4 with Apache
- **Frontend Build**: Multi-stage build with Node.js 20
- **Extensions**: PDO SQLite enabled
- **Apache Modules**: rewrite, headers, mime
- **Permissions**: Proper ownership and permissions set

### 3. `php-config.ini`
- **OPcache**: 128MB, 10,000 files
- **Memory**: 256MB limit
- **Execution Time**: 300 seconds
- **Upload**: 10MB max file size
- **Realpath Cache**: 4MB with 600s TTL
- **Output Compression**: Enabled
- **Error Handling**: Production-safe (errors logged, not displayed)

### 4. `apache-config.conf`
- **MIME Types**: Proper JavaScript, CSS, JSON types
- **Cache Control**: Smart caching for static assets
- **Directory Index**: Configured for SPA routing
- **PHP Handler**: Proper PHP execution
- **Security**: Directory indexing disabled

## SQLite Optimizations

All SQLite optimizations are automatically applied via `api/config.php`:

1. **WAL Mode** (Write-Ahead Logging)
   - Better concurrent read/write performance
   - Automatic checkpointing

2. **Memory Mapping** (100MB)
   - Database accessed directly from memory
   - Faster than disk I/O

3. **Cache Size** (4MB)
   - Entire database fits in memory cache
   - Instant access to frequently used data

4. **Synchronous Mode** (NORMAL)
   - Balanced performance and durability
   - Safe with WAL mode

5. **Temp Store** (MEMORY)
   - Temporary operations use RAM
   - Faster sorts and joins

6. **Busy Timeout** (5000ms)
   - Handles concurrent access gracefully
   - Prevents lock timeouts

7. **Database Indexes**
   - Comprehensive indexes on all query columns
   - Optimized for common query patterns

## PHP Optimizations

1. **OPcache**
   - Precompiled bytecode caching
   - Reduces PHP execution time by ~30-50%

2. **Realpath Cache**
   - Caches file system paths
   - Reduces stat() calls

3. **Output Compression**
   - Gzip compression for responses
   - Reduces bandwidth usage

4. **Memory Management**
   - Optimized memory limits
   - Prevents memory exhaustion

## Apache Optimizations

1. **Module Configuration**
   - Rewrite engine for clean URLs
   - Proper MIME type handling
   - Header manipulation for caching

2. **Static Asset Caching**
   - Long-term caching for assets
   - No caching for HTML (always fresh)

3. **Security Headers**
   - Proper content types
   - Directory listing disabled

## Deployment Scripts

### `deploy.sh` (Linux/Mac)
- Automated deployment script
- Checks prerequisites
- Builds and starts container
- Provides status information

### `deploy.bat` (Windows)
- Windows-compatible deployment
- Same functionality as shell script
- User-friendly output

## Usage

### Quick Deploy
```bash
# Linux/Mac
cd docker && ./deploy.sh

# Windows
cd docker && deploy.bat
```

### Manual Deploy
```bash
cd docker
docker-compose build
docker-compose up -d
```

## Access

- **URL**: http://localhost:8090
- **Default Admin**: admin / admin123
- **Database**: `./data/linknest.db`
- **Uploads**: `./uploads/`

## Monitoring

### Container Health
```bash
docker-compose ps
docker stats linknest
```

### Logs
```bash
docker-compose logs -f
```

### Database Optimization
Access: http://localhost:8090/api/optimize_database.php

## Performance Metrics

Expected performance improvements:
- **Database Queries**: 50-80% faster (indexes + WAL)
- **PHP Execution**: 30-50% faster (OPcache)
- **Static Assets**: 90% faster (caching)
- **Memory Usage**: Optimized (memory mapping)

## Security Features

1. **Error Handling**: Errors logged, not displayed
2. **Directory Indexing**: Disabled
3. **File Permissions**: Proper ownership (www-data)
4. **Input Validation**: Handled by application
5. **Session Security**: Configured properly

## Backup & Restore

### Backup
```bash
cp data/linknest.db data/linknest.db.backup
tar -czf backup.tar.gz data/ uploads/
```

### Restore
```bash
cp data/linknest.db.backup data/linknest.db
docker-compose restart
```

## Troubleshooting

See `README_DEPLOY.md` for detailed troubleshooting guide.

## Next Steps

1. Deploy using the provided scripts
2. Change default admin password
3. Configure your application settings
4. Set up regular backups
5. Monitor container health

---

**All optimizations are enabled by default and require no additional configuration!**

