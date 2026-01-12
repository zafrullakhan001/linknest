# Quick Start - Docker Deployment

**Single Container Setup**: Everything (PHP, Apache, SQLite) runs in one container - no separate services needed!

## One-Command Deployment

### Windows
```batch
cd docker
deploy.bat
```

### Linux/Mac
```bash
cd docker
./deploy.sh
```

## Access Your Application

After deployment, open your browser and go to:
- **HTTP**: http://localhost:8090
- **HTTPS**: https://localhost:8443 (recommended)

⚠️ **Note**: The HTTPS certificate is self-signed. Your browser will show a security warning - click "Advanced" and "Proceed to localhost" to continue.

## Built-in Mail Server (Pilot Run)

For an easy pilot run, Docker also starts a local SMTP server (**Mailpit**) so you don't need to set up a real mail provider.

- **Mailpit Web UI (inbox)**: http://localhost:8025
- **SMTP host**: `mailpit` (from inside Docker) / `localhost` (from your PC)
- **SMTP port**: `1025`
- **Encryption**: `none`
- **Username/Password**: leave blank

In LinkNest, go to **SMTP Settings** and set:
- Host: `mailpit`
- Port: `1025`
- Encryption: `none`
- Enabled: `true`

### Default Login
- Username: `admin`
- Password: `admin123`

⚠️ **Change the password immediately after first login!**

## What's Included

✅ PHP 8.2 with Apache  
✅ SQLite with all optimizations (WAL mode, memory mapping, caching)  
✅ OPcache enabled for PHP performance  
✅ All database indexes for optimal queries  
✅ Proper MIME types and caching headers  
✅ Health checks and auto-restart  
✅ Data persistence (database and uploads)  

## Common Commands

```bash
# View logs
docker-compose logs -f

# Stop
docker-compose stop

# Start
docker-compose start

# Restart
docker-compose restart

# Remove everything
docker-compose down
```

## Troubleshooting

**Port 8090 already in use?**
- Change the port in `docker-compose.yml`: `"8090:80"` → `"YOUR_PORT:80"`

**Container won't start?**
- Check logs: `docker-compose logs`
- Ensure Docker is running
- Check disk space

**Need help?**
- See `README_DEPLOY.md` for detailed documentation

