# 🚀 QUICK START GUIDE

## For First-Time Users

### Step 1: Install Docker Desktop
If you don't have Docker installed:
1. Download from: https://www.docker.com/products/docker-desktop
2. Install and restart your computer if prompted
3. Start Docker Desktop and wait for it to be ready

### Step 2: Extract This Folder
If you received this as a zip file:
1. Right-click the zip file
2. Select "Extract All..."
3. Choose a location and extract

### Step 3: Deploy
1. Open the extracted folder
2. Double-click `deploy.bat`
3. Wait for the build to complete (5-10 minutes first time)
4. The application will open automatically in your browser

### Step 4: Access
- **Main Application**: http://localhost:8090
- **Email Testing**: http://localhost:8025

---

## That's It!

You now have LinkNest running in a Docker container.

### Common Commands

**Stop the application:**
```
docker compose stop
```

**Start the application:**
```
docker compose start
```

**View logs:**
```
docker compose logs -f
```

**Remove everything:**
```
docker compose down
```

---

## Need Help?

See the full `README.md` for detailed documentation and troubleshooting.

## Quick Troubleshooting

**"Docker is not running"**
→ Start Docker Desktop and try again

**"Port already in use"**
→ Another application is using port 8090. Edit `docker-compose.yml` to change the port.

**Build fails**
→ Check your internet connection and try again

---

**Questions?** Check the full README.md for comprehensive documentation.
