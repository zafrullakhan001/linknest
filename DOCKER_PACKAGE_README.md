# 🐳 LinkNest Docker Deployment Package System

## Overview

This system allows you to create **self-deploying Docker packages** that can be zipped and shared. Recipients can deploy LinkNest with a single command - no manual configuration required!

## 📁 Directory Structure

```
linknest/
├── create-docker-package.bat          # Master script (run this!)
├── docker-deploy-package/             # The deployment package
│   ├── deploy.bat                     # Main deployment script
│   ├── prepare-package.bat            # Package builder
│   ├── create-zip.bat                 # Zip creator
│   ├── Dockerfile                     # Docker image definition
│   ├── docker-compose.yml             # Container configuration
│   ├── README.md                      # User documentation
│   ├── QUICK_START.md                 # Quick start guide
│   ├── PACKAGE_BUILDER_GUIDE.md       # Builder guide
│   ├── DEPLOYMENT_PACKAGE_SUMMARY.md  # Summary
│   └── [all application files]        # Copied from source
```

## 🚀 Quick Start

### For Package Creators (You)

**Option 1: Complete Workflow (Recommended)**

Run the master script from the main directory:

```bash
create-docker-package.bat
```

This will guide you through:
1. Preparing the package
2. Testing it (optional)
3. Creating the zip file

**Option 2: Manual Steps**

```bash
# Step 1: Prepare the package
cd docker-deploy-package
prepare-package.bat

# Step 2: Test (optional)
deploy.bat
docker compose down

# Step 3: Create zip
create-zip.bat
```

### For Recipients (End Users)

1. Extract the zip file
2. Run `deploy.bat`
3. Access at http://localhost:8090

## 📦 What Gets Packaged

### ✅ Always Included
- Complete application source code
- All API endpoints
- All frontend components
- Configuration files
- Docker setup files
- Documentation

### ✅ Conditionally Included
- **Database**: Your current `data/linknest.db` (if exists)
- **Uploads**: Your current `uploads/` folder (if has files)

### ❌ Never Included
- node_modules/
- dist/ (built during Docker build)
- .git/
- Test files
- Log files
- Temporary files

## 🎯 Features

### Self-Contained
- No external dependencies except Docker
- All source code included
- Database and assets included
- Pre-configured and ready to run

### One-Click Deployment
- Single script does everything
- Automatic prerequisite checking
- Automatic building and startup
- Opens in browser when ready

### Production-Ready
- Optimized Docker image
- SSL/HTTPS support
- Performance tuning
- Automatic daily backups
- Health monitoring

### Easy Management
- Simple start/stop commands
- Easy data export/import
- Accessible logs
- Container health checks

## 📋 Prerequisites

### For Package Creation
- Windows OS
- Access to LinkNest source files
- PowerShell (for zip creation)

### For Deployment (Recipients)
- Docker Desktop installed and running
- Ports available: 8090, 8443, 1025, 8025
- 2GB+ free disk space
- 4GB+ RAM recommended

## 🔧 Detailed Usage

### Creating a Package

#### 1. Prepare
```bash
cd docker-deploy-package
prepare-package.bat
```

This copies all necessary files from your source directory.

**What it does:**
- Creates directory structure
- Copies API files
- Copies scripts
- Copies frontend source
- Copies configuration files
- Copies database (if exists)
- Copies uploads (if exist)
- Copies Docker configs
- Creates documentation

**Time**: 1-2 minutes

#### 2. Test (Recommended)
```bash
cd docker-deploy-package
deploy.bat
```

This builds and runs the container locally.

**What to verify:**
- ✅ Application loads
- ✅ Database data present
- ✅ Assets accessible
- ✅ Features working

**Time**: 5-10 minutes (first build)

**Cleanup:**
```bash
docker compose down
```

#### 3. Create Zip
```bash
cd docker-deploy-package
create-zip.bat
```

This creates a timestamped zip file.

**Output**: `linknest-docker-deploy-YYYYMMDD_HHMMSS.zip`

**Time**: 1-5 minutes

### Distributing the Package

1. **Share the zip file** via:
   - Email
   - File sharing service
   - Network drive
   - USB drive

2. **Provide instructions**:
   - Extract the zip
   - Run `deploy.bat`
   - Access at http://localhost:8090

3. **Include documentation**:
   - README.md (included in package)
   - QUICK_START.md (included in package)

## 🎨 Customization

### Before Creating Package

#### Change Ports
Edit `docker-deploy-package/docker-compose.yml`:
```yaml
ports:
  - "9090:80"   # Change from 8090
  - "9443:443"  # Change from 8443
```

#### Change Timezone
Edit `docker-deploy-package/docker-compose.yml`:
```yaml
environment:
  - TZ=Europe/London  # Change timezone
```

#### Change PHP Settings
Edit `docker-deploy-package/docker-config/php-config.ini`

#### Exclude Database
Delete `docker-deploy-package/data/linknest.db` before zipping

#### Exclude Uploads
Delete contents of `docker-deploy-package/uploads/` before zipping

## 📊 Package Sizes

Typical sizes:

| Scenario | Size |
|----------|------|
| Fresh install | 5-10 MB |
| Small database | 10-20 MB |
| Medium database | 20-50 MB |
| Large database | 50-200 MB |
| + Uploads | +upload size |

## 🔐 Security Considerations

### Before Distributing

**Review what's included:**
- 🔍 Database contains all your data
- 🔍 Uploads contain all your assets
- 🔍 Source code is included

**Consider:**
- Clean sensitive data from database
- Remove private files from uploads
- Review who receives the package

### In Production

**Recipients should:**
- 🔒 Replace self-signed SSL cert
- 🔒 Change default passwords
- 🔒 Review security settings
- 🔒 Set up proper backups

## 🆘 Troubleshooting

### Package Creation Issues

**"Source files not found"**
- Ensure you're in the correct directory
- Verify source files exist
- Check file permissions

**"Package too large"**
- Check database size
- Check uploads size
- Consider excluding large files

### Deployment Issues

**"Docker is not running"**
- Start Docker Desktop
- Wait for it to initialize
- Try again

**"Port already in use"**
- Another service using the port
- Change ports in docker-compose.yml
- Or stop the conflicting service

**"Build fails"**
- Check internet connection
- Verify all files copied correctly
- Try: `docker compose build --no-cache`

## 📚 Documentation

### Included in Package
- **README.md** - Complete user guide
- **QUICK_START.md** - Quick start for users
- **PACKAGE_BUILDER_GUIDE.md** - Guide for creators
- **DEPLOYMENT_PACKAGE_SUMMARY.md** - Summary

### Scripts
- **deploy.bat** - Main deployment script
- **prepare-package.bat** - Package builder
- **create-zip.bat** - Zip creator
- **create-docker-package.bat** - Master workflow

## 💡 Use Cases

### Perfect For:
- ✅ Multi-server deployments
- ✅ Team distribution
- ✅ Client deliveries
- ✅ Backup/recovery
- ✅ Testing environments
- ✅ Demo installations

### Not For:
- ❌ Public distribution (contains your data)
- ❌ Open source (use git)

## 🎊 Success Checklist

Before distributing:

- [ ] Package prepared successfully
- [ ] Tested locally and works
- [ ] Database included (if desired)
- [ ] Uploads included (if desired)
- [ ] Sensitive data reviewed
- [ ] Documentation included
- [ ] Zip file created
- [ ] Zip file tested (extract and deploy)

## 📞 Support

### For Package Creators
- Check PACKAGE_BUILDER_GUIDE.md
- Review this README
- Verify source files

### For Recipients
- Check README.md in package
- Check QUICK_START.md
- Review error messages
- Check Docker is running

## 🔄 Updating

### Update Package Contents
1. Make changes to source files
2. Run `prepare-package.bat` again
3. Test the updated package
4. Create new zip file

### Update Package Scripts
- Edit scripts in `docker-deploy-package/`
- Test changes
- Document modifications

## 📝 Version History

Track your packages:
- Zip files include timestamps
- Consider adding version numbers
- Document changes between versions

## 🌟 Best Practices

1. **Always test before distributing**
2. **Include all documentation**
3. **Review security implications**
4. **Document customizations**
5. **Version your packages**
6. **Clean sensitive data**
7. **Verify file sizes**
8. **Test extraction and deployment**

---

## Quick Reference

### Create Package
```bash
create-docker-package.bat
```

### Manual Steps
```bash
cd docker-deploy-package
prepare-package.bat  # Prepare
deploy.bat           # Test
docker compose down  # Cleanup
create-zip.bat       # Package
```

### Deploy Package (Recipients)
```bash
deploy.bat
```

### Manage Containers
```bash
docker compose logs -f    # View logs
docker compose stop       # Stop
docker compose start      # Start
docker compose restart    # Restart
docker compose down       # Remove
```

---

**Ready to create your package?** Run `create-docker-package.bat` to get started! 🚀
