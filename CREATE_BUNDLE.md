# Creating LinkNest Deployment Bundle

This guide explains how to create a deployment bundle for users who don't have access to the repository.

## For Windows Users

### Step 1: Run the Bundle Script

Double-click `bundle.bat` or run it from Command Prompt:

```cmd
bundle.bat
```

This will:
1. Copy all necessary files
2. Exclude unnecessary files (node_modules, .git, etc.)
3. Create a zip file named `linknest-deploy-YYYYMMDD-HHMMSS.zip`

### Step 2: Distribute the Bundle

The zip file contains:
- All source code
- Docker configuration files
- Deployment scripts (deploy.bat for Windows, deploy.sh for Linux/Mac)
- Documentation

**File size**: Approximately 500KB - 2MB (depending on code size)

## For Linux/Mac Users

### Step 1: Make Script Executable

```bash
chmod +x bundle.sh
```

### Step 2: Run the Bundle Script

```bash
./bundle.sh
```

This creates the same zip file as the Windows version.

## What's Included in the Bundle

✅ **Source Code**
- All React/TypeScript components
- PHP API files
- Configuration files

✅ **Docker Files**
- Dockerfile
- docker-compose.yml
- docker-compose.prod.yml
- Docker configuration

✅ **Deployment Scripts**
- deploy.bat (Windows)
- deploy.sh (Linux/Mac)

✅ **Documentation**
- README_DOCKER.md
- DEPLOYMENT_INSTRUCTIONS.md

❌ **Excluded** (to keep bundle small)
- node_modules (will be installed during Docker build)
- dist (will be built during Docker build)
- .git (repository files)
- data/*.db (user data - should be empty in bundle)
- uploads/* (user uploads - should be empty in bundle)
- Log files
- IDE configuration files

## Bundle Contents Structure

```
linknest-deploy-YYYYMMDD-HHMMSS.zip
├── api/
│   ├── auth.php
│   ├── config.php
│   ├── index.php
│   ├── settings.php
│   └── tiles.php
├── components/
│   ├── AdminPanel.tsx
│   ├── AuthModal.tsx
│   ├── Navigation.tsx
│   ├── TileDetail.tsx
│   └── TileGrid.tsx
├── contexts/
│   ├── AuthContext.tsx
│   └── SettingsContext.tsx
├── services/
│   ├── authService.ts
│   ├── geminiService.ts
│   ├── settingsService.ts
│   └── storageService.ts
├── docker/
│   ├── apache-config.conf
│   └── .htaccess
├── data/ (empty)
├── uploads/ (empty, with .htaccess)
├── App.tsx
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── deploy.bat
├── deploy.sh
├── index.html
├── index.tsx
├── package.json
├── package-lock.json
├── vite.config.ts
├── vite.docker.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── DEPLOYMENT_INSTRUCTIONS.md
```

## Distribution

1. **Create the bundle** using `bundle.bat` or `bundle.sh`
2. **Test the bundle** by extracting it and running `deploy.bat` or `deploy.sh`
3. **Distribute** the zip file to users
4. **Users extract** and follow `DEPLOYMENT_INSTRUCTIONS.md`

## Notes

- The bundle is self-contained - no repository access needed
- Docker will download required images on first deployment
- Users need Docker Desktop (Windows) or Docker (Linux/Mac) installed
- First deployment may take 5-10 minutes (downloading Docker images)
- Subsequent deployments are faster (images cached)

## Troubleshooting Bundle Creation

**Windows:**
- Ensure PowerShell is available (Windows 10+)
- Run from Command Prompt if double-click doesn't work
- Check that all source files exist

**Linux/Mac:**
- Ensure `zip` command is installed: `sudo apt-get install zip` (Ubuntu/Debian)
- Check file permissions
- Run from project root directory

