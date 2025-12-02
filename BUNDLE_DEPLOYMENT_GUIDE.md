# LinkNest Bundle Deployment Guide

This guide explains how to create and deploy a standalone bundle of LinkNest without requiring access to the source repository.

## Quick Start

### 1. Create the Bundle

**Windows:**
```batch
cd scripts
bundle-for-deployment.bat
```

**Linux/Mac:**
```bash
cd scripts
chmod +x bundle-for-deployment.sh
./bundle-for-deployment.sh
```

### 2. Deploy the Bundle

The bundle will be created in the project root with a timestamped name. Copy it to your deployment location, then:

**Windows:**
```batch
cd linknest-deployment-YYYYMMDD-HHMMSS
deploy.bat
```

**Linux/Mac:**
```bash
cd linknest-deployment-YYYYMMDD-HHMMSS
chmod +x deploy.sh
./deploy.sh
```

## What is a Deployment Bundle?

A deployment bundle is a self-contained package that includes everything needed to deploy LinkNest:

- ✅ All source code (frontend and backend)
- ✅ Docker configuration files
- ✅ Build configuration files
- ✅ Deployment scripts
- ✅ Documentation

**No repository access required!** The bundle can be copied to any server and deployed independently.

## Bundle Contents

```
linknest-deployment-*/
├── docker/              # Complete Docker setup
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── [all config files]
├── api/                 # PHP backend
├── components/          # React components
├── contexts/            # React contexts
├── services/            # Service files
├── [all source files]
├── deploy.sh            # Deployment script (Linux/Mac)
├── deploy.bat           # Deployment script (Windows)
└── README_DEPLOYMENT.md # Full documentation
```

## Use Cases

1. **Production Deployment**: Deploy to servers without exposing the repository
2. **Client Delivery**: Package for clients who don't need repository access
3. **Offline Deployment**: Deploy to servers without internet (after initial Docker pull)
4. **Version Distribution**: Create versioned bundles for different environments

## Deployment Process

### Step 1: Create Bundle

Run the bundle script from the `scripts/` directory. This creates a timestamped folder with all necessary files.

### Step 2: Transfer Bundle

Copy the entire bundle folder to your deployment location:
- Via USB drive
- Via network transfer
- Via cloud storage
- Via any file transfer method

### Step 3: Deploy

On the deployment server:
1. Navigate to the bundle folder
2. Run the deployment script
3. Wait for Docker to build and start
4. Access the application

## Requirements

The deployment server needs:
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose
- Ports 8090 (HTTP) and 8443 (HTTPS) available
- At least 2GB free disk space

## Default Access

After deployment:
- **HTTP**: http://localhost:8090
- **HTTPS**: https://localhost:8443
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change the default password immediately!**

## Updating a Deployment

To update an existing deployment:

1. Stop the container:
   ```bash
   cd docker
   docker-compose down
   ```

2. Replace files in the bundle with new versions

3. Rebuild and restart:
   ```bash
   docker-compose build
   docker-compose up -d
   ```

## Bundle Size

- **Without database**: ~2-5 MB
- **With database**: Varies based on database size

The bundle is lightweight and portable.

## Security Notes

- Bundle contains all source code - protect accordingly
- Database files included if they exist - ensure proper security
- Default credentials included - change immediately
- SSL certificates are self-signed - use proper certificates in production

## Troubleshooting

### Bundle Creation Issues
- Ensure write permissions in project directory
- Check that all source files exist
- Verify sufficient disk space

### Deployment Issues
- Ensure Docker is installed and running
- Check that required ports are available
- Verify all files were copied correctly
- Check Docker logs: `docker-compose logs`

## Compression

You can compress the bundle for easier transfer:

**Windows:**
- Right-click folder → Send to → Compressed (zipped) folder

**Linux/Mac:**
```bash
tar -czf linknest-deployment.tar.gz linknest-deployment-*/
```

## Support

For detailed information, see:
- `scripts/README_BUNDLE.md` - Bundle creation details
- Bundle's `README_DEPLOYMENT.md` - Deployment details
- Main project documentation

## Notes

- Bundle is completely self-contained
- No Git repository required
- All dependencies resolved during Docker build
- Database created automatically if missing
- Can be deployed on any Docker-compatible system






















