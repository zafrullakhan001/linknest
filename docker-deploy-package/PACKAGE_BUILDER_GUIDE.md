# 📦 Package Builder Guide

This guide explains how to prepare and distribute the LinkNest Docker deployment package.

## Overview

The deployment package system allows you to create a self-contained, distributable folder that contains everything needed to deploy LinkNest in Docker. This is perfect for:

- Sharing with team members
- Deploying to multiple servers
- Creating backups
- Distributing to clients

## Files in This Directory

| File | Purpose |
|------|---------|
| `prepare-package.bat` | Copies all necessary files from source to create the package |
| `deploy.bat` | The main deployment script (runs on recipient's machine) |
| `create-zip.bat` | Creates a distributable zip file of the package |
| `Dockerfile` | Docker image definition |
| `docker-compose.yml` | Docker Compose configuration |
| `README.md` | Comprehensive user documentation |
| `QUICK_START.md` | Simplified quick start guide |
| `.dockerignore` | Files to exclude from Docker build |

## Step-by-Step: Creating a Deployment Package

### Step 1: Prepare the Package

Run the package builder script:

```bash
prepare-package.bat
```

This script will:
1. ✅ Create the necessary directory structure
2. ✅ Copy all API files
3. ✅ Copy all scripts
4. ✅ Copy frontend source files (components, contexts, services, land)
5. ✅ Copy configuration files (package.json, vite configs, etc.)
6. ✅ Copy the database file (if it exists)
7. ✅ Copy the uploads folder
8. ✅ Copy Docker configuration files
9. ✅ Create README and .dockerignore

**Time**: 1-2 minutes depending on database and upload sizes

### Step 2: Test the Package

Before distributing, test that it works:

```bash
deploy.bat
```

This will:
1. Build the Docker image
2. Start the containers
3. Open the application in your browser

**Time**: 5-10 minutes for first build

Verify that:
- ✅ Application loads at http://localhost:8090
- ✅ Database data is present (if you copied an existing database)
- ✅ Uploads/assets are accessible
- ✅ All features work correctly

### Step 3: Clean Up (Optional)

If the test was successful, you can stop the containers:

```bash
docker compose down
```

This removes the test containers but keeps the package files intact.

### Step 4: Create Zip File

Create a distributable zip file:

```bash
create-zip.bat
```

This creates a timestamped zip file in the parent directory:
- Example: `linknest-docker-deploy-20260115_153000.zip`

**Time**: 1-5 minutes depending on size

### Step 5: Distribute

Share the zip file with recipients. They just need to:
1. Extract the zip file
2. Run `deploy.bat`
3. Access the application at http://localhost:8090

## What Gets Included

### ✅ Always Included
- All API files (`api/`)
- All scripts (`scripts/`)
- Frontend source code (`components/`, `contexts/`, `services/`, `land/`)
- Configuration files (package.json, vite configs, etc.)
- Docker configuration files
- Documentation (README.md, QUICK_START.md)

### ⚠️ Conditionally Included
- **Database file**: Included if `data/linknest.db` exists in source
- **Uploads folder**: Included if `uploads/` folder has files

### ❌ Never Included
- node_modules/
- dist/
- .git/
- Test files
- Documentation files from source
- Temporary files
- Log files

## Package Size Expectations

Typical package sizes:

| Scenario | Approximate Size |
|----------|-----------------|
| Fresh install (no data) | 5-10 MB |
| Small database (<100 links) | 10-20 MB |
| Medium database (1000 links) | 20-50 MB |
| Large database (10000+ links) | 50-200 MB |
| With many uploads | +size of uploads folder |

## Customization

### Changing Ports

Edit `docker-compose.yml` before creating the zip:

```yaml
ports:
  - "8090:80"   # Change 8090 to your preferred HTTP port
  - "8443:443"  # Change 8443 to your preferred HTTPS port
```

### Changing Timezone

Edit `docker-compose.yml`:

```yaml
environment:
  - TZ=America/New_York  # Change to your timezone
```

### Changing PHP Settings

Edit `docker-config/php-config.ini` before creating the zip.

## Troubleshooting

### prepare-package.bat fails

**Issue**: Script can't find source files

**Solution**: 
- Ensure you're running from the `docker-deploy-package` folder
- Verify the source files exist in the parent directory

### Package is too large

**Issue**: Zip file is very large

**Solution**:
- Check the size of your database file
- Check the size of your uploads folder
- Consider excluding large files if not needed
- You can manually delete files from the package before zipping

### deploy.bat fails during testing

**Issue**: Deployment fails

**Solution**:
- Check Docker is installed and running
- Verify all files were copied correctly
- Check the error messages
- Try rebuilding: `docker compose build --no-cache`

## Best Practices

### 1. Test Before Distributing
Always test the package locally before sharing it.

### 2. Include Documentation
The README.md and QUICK_START.md are automatically included - don't remove them.

### 3. Version Your Packages
The zip file includes a timestamp. Consider adding version numbers to the filename.

### 4. Clean Database (Optional)
If distributing to others, consider cleaning sensitive data from the database first.

### 5. Document Custom Changes
If you modify the package, document changes in the README.md.

## Advanced: Manual Package Creation

If you prefer to create the package manually:

1. Create a new folder: `linknest-docker-deploy`
2. Copy these files from source:
   - `api/` folder
   - `scripts/` folder
   - `components/` folder
   - `contexts/` folder
   - `services/` folder
   - `land/` folder
   - `data/` folder (with database)
   - `uploads/` folder
   - All config files (package.json, vite configs, etc.)
3. Copy these files from `docker/`:
   - All files to `docker-config/` subfolder
4. Create `Dockerfile` and `docker-compose.yml` (use templates)
5. Create `deploy.bat` (use template)
6. Create `README.md` and `QUICK_START.md`
7. Create `.dockerignore`

## Support

For issues with the package builder:
1. Check this guide
2. Verify source files exist
3. Check file permissions
4. Try running as administrator

---

**Ready to create your package?** Run `prepare-package.bat` to get started! 📦
