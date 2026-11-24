# LinkNest Docker - All Available URLs

After running `refresh_docker.bat`, the following URLs will be available:

## 🌐 Application URLs

### Main Application
- **HTTP**: http://localhost:8090
- **HTTPS**: https://localhost:8443 (recommended)

> ⚠️ **Note**: The HTTPS certificate is self-signed. Your browser will show a security warning. Click "Advanced" → "Proceed to localhost (unsafe)" to continue.

---

## 🔍 Health Check & Monitoring URLs

### OPcache Status Dashboard
- **HTTP**: http://localhost:8090/check_opcache.php
- **HTTPS**: https://localhost:8443/check_opcache.php

**What it shows:**
- OPcache memory usage and statistics
- Cache hit/miss rates
- Number of cached scripts
- SQLite database status
- PHP configuration details

---

## 📧 Mailpit (Email Testing) URLs

### Mailpit Web UI (Email Inbox)
- **Web Interface**: http://localhost:8025

**Features:**
- View all emails sent by the application
- Test email functionality
- Preview HTML emails
- Download email attachments
- Search and filter emails

### SMTP Server
- **Host**: `localhost` (from your PC) or `mailpit` (from inside Docker)
- **Port**: `1025`
- **Authentication**: None required
- **TLS/SSL**: Disabled (development only)

**Configuration for LinkNest:**
- SMTP Host: `mailpit` (when configuring inside Docker)
- SMTP Port: `1025`
- Username: (leave empty)
- Password: (leave empty)
- TLS/SSL: Disabled

---

## 🔌 API Endpoints

### Base API URLs
- **HTTP**: http://localhost:8090/api/
- **HTTPS**: https://localhost:8443/api/

### Common API Endpoints
- **Settings**: http://localhost:8090/api/settings
- **Authentication**: http://localhost:8090/api/auth.php
- **Tiles**: http://localhost:8090/api/tiles.php
- **Database Info**: http://localhost:8090/api/database.php/info
- **Database Export**: http://localhost:8090/api/database.php/export
- **Snapshots List**: http://localhost:8090/api/database.php/snapshots
- **Monitors**: http://localhost:8090/api/monitors.php
- **Uploads**: http://localhost:8090/api/uploads.php

> **Note**: Most API endpoints require authentication. Use the main application interface for full functionality.

---

## 🐳 Docker Container Management

### Check Container Status
```bash
docker ps
```

### View Container Logs
```bash
# Application logs
docker logs linknest

# Mailpit logs
docker logs linknest-mailpit

# Follow logs in real-time
docker logs -f linknest
```

### Access Container Shell
```bash
docker exec -it linknest bash
```

### Stop Containers
```bash
docker-compose -f docker/docker-compose.yml down
```

### Restart Containers
```bash
docker-compose -f docker/docker-compose.yml restart
```

---

## 📊 Quick Reference Table

| Service | Protocol | URL/Endpoint | Port | Description |
|---------|----------|-------------|------|-------------|
| **LinkNest App** | HTTP | http://localhost:8090 | 8090 | Main application |
| **LinkNest App** | HTTPS | https://localhost:8443 | 8443 | Main application (secure) |
| **OPcache Status** | HTTP | http://localhost:8090/check_opcache.php | 8090 | Health check dashboard |
| **OPcache Status** | HTTPS | https://localhost:8443/check_opcache.php | 8443 | Health check dashboard (secure) |
| **Mailpit Web UI** | HTTP | http://localhost:8025 | 8025 | Email inbox viewer |
| **Mailpit SMTP** | SMTP | localhost:1025 | 1025 | SMTP server (no auth) |
| **API Base** | HTTP | http://localhost:8090/api/ | 8090 | REST API endpoints |
| **API Base** | HTTPS | https://localhost:8443/api/ | 8443 | REST API endpoints (secure) |

---

## 🔐 Default Credentials

⚠️ **IMPORTANT**: Change these immediately after first login!

- **Username**: `admin`
- **Password**: `admin`

---

## 🛠️ Troubleshooting

### Port Already in Use

If you get an error that a port is already in use:

1. **Check which process is using the port:**
   ```bash
   # Windows
   netstat -ano | findstr :8090
   
   # Linux/Mac
   lsof -i :8090
   ```

2. **Change the port in `docker/docker-compose.yml`:**
   ```yaml
   ports:
     - "YOUR_PORT:80"   # Change YOUR_PORT to available port
     - "YOUR_PORT_SSL:443"  # Change YOUR_PORT_SSL to available port
   ```

### Cannot Access Application

1. **Check if containers are running:**
   ```bash
   docker ps
   ```

2. **Check container logs:**
   ```bash
   docker logs linknest
   ```

3. **Verify ports are exposed:**
   ```bash
   docker port linknest
   ```

### HTTPS Certificate Warning

This is normal! The container uses a self-signed certificate for development. Click "Advanced" → "Proceed to localhost" in your browser.

---

## 📝 Notes

- All URLs use `localhost` - if accessing from another machine, replace with the server's IP address
- The container is fully isolated - database and files are inside the container
- Daily database backups run automatically at 3:00 AM
- Backups older than 30 days are automatically removed
- Python workers run inside the container for monitoring and email sending

---

## 🚀 Next Steps

1. **Access the application**: http://localhost:8090
2. **Login with default credentials**: admin/admin
3. **Change the admin password immediately**
4. **Check OPcache status**: http://localhost:8090/check_opcache.php
5. **Test email functionality**: Send a test email and check http://localhost:8025

---

**Last Updated**: Based on current Docker configuration
**Container Name**: `linknest`
**Mailpit Container**: `linknest-mailpit`
