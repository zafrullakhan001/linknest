# LinkNest Deployment Bundle Creator

This directory contains scripts to create a standalone deployment package of LinkNest that can be deployed from any location without requiring access to the source repository.

## What is a Deployment Bundle?

A deployment bundle is a self-contained package that includes:
- All application source code (frontend and backend)
- Docker configuration files
- Build configuration files
- Deployment scripts
- Documentation

The bundle can be copied to any server and deployed without needing the full Git repository.

## Creating a Bundle

### Windows
```batch
cd scripts
bundle-for-deployment.bat
```

### Linux/Mac
```bash
cd scripts
chmod +x bundle-for-deployment.sh
./bundle-for-deployment.sh
```

## Bundle Contents

The bundle will be created in the project root with a timestamped name:
- `linknest-deployment-YYYYMMDD-HHMMSS/`

### Directory Structure

```
linknest-deployment-*/
├── docker/              # Docker configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── apache-config.conf
│   ├── apache-ssl-config.conf
│   ├── php-config.ini
│   ├── generate-ssl-cert.sh
│   ├── verify-php.sh
│   ├── deploy.sh
│   └── deploy.bat
├── api/                 # PHP API files
├── components/          # React components
├── contexts/            # React contexts
├── services/            # Service files
├── data/                # Database directory
├── uploads/             # Uploads directory
├── index.html           # Frontend entry point
├── index.tsx            # React entry point
├── App.tsx              # Main app component
├── types.ts             # TypeScript types
├── package.json         # Node.js dependencies
├── vite.config.ts       # Vite configuration
├── vite.docker.config.ts # Docker-specific Vite config
├── tsconfig.json        # TypeScript configuration
├── tailwind.config.js   # Tailwind CSS configuration
├── postcss.config.js    # PostCSS configuration
├── check_opcache.php    # OPcache status page
├── deploy.sh            # Standalone deployment script (Linux/Mac)
├── deploy.bat           # Standalone deployment script (Windows)
├── README.md            # Quick start guide
├── README_DEPLOYMENT.md # Full deployment documentation
├── BUNDLE_INFO.txt      # Bundle information
└── .gitignore          # Git ignore file
```

## Using the Bundle

### Step 1: Create the Bundle

Run the bundle script from the `scripts/` directory:

**Windows:**
```batch
bundle-for-deployment.bat
```

**Linux/Mac:**
```bash
./bundle-for-deployment.sh
```

### Step 2: Copy the Bundle

Copy the entire bundle folder to your deployment location (server, different machine, etc.).

### Step 3: Deploy

Navigate to the bundle folder and run the deployment script:

**Windows:**
```batch
deploy.bat
```

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

## What Gets Included

✅ **All Source Code**
- Frontend React/TypeScript files
- Backend PHP API files
- All components, contexts, and services

✅ **Docker Configuration**
- Complete Dockerfile
- docker-compose.yml
- Apache and PHP configurations
- SSL certificate generation

✅ **Build Configuration**
- package.json with all dependencies
- Vite configuration
- TypeScript configuration
- Tailwind CSS configuration

✅ **Deployment Scripts**
- Standalone deployment scripts
- Docker deployment scripts
- All helper scripts

✅ **Documentation**
- Quick start guide
- Full deployment documentation
- Bundle information

## What Gets Excluded

The bundle script intentionally excludes:
- `node_modules/` (will be installed during Docker build)
- `dist/` (will be built during Docker build)
- `.git/` directory
- Development-only files
- Temporary files

## Bundle Size

A typical bundle is approximately:
- **Without database**: ~2-5 MB
- **With database**: Varies based on database size

The bundle is designed to be lightweight and portable.

## Use Cases

### 1. Production Deployment
Create a bundle and deploy to production servers without exposing the repository.

### 2. Client Delivery
Package the application for delivery to clients who don't need repository access.

### 3. Offline Deployment
Deploy to servers without internet access (after initial Docker image pull).

### 4. Version Distribution
Create versioned bundles for different deployment environments.

## Updating a Deployment

To update an existing deployment:

1. Stop the current container:
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

## Security Considerations

- The bundle contains all source code - protect it accordingly
- Database files are included if they exist - ensure proper security
- SSL certificates are generated during build - use proper certificates in production
- Default admin credentials are included - change immediately after deployment

## Troubleshooting

### Bundle Creation Fails
- Ensure you have write permissions in the project directory
- Check that all source files exist
- Verify disk space is available

### Deployment Fails
- Ensure Docker is installed and running
- Check that required ports are available
- Verify all files were copied correctly

### Missing Files
- Check that the bundle script completed successfully
- Verify source files exist in the repository
- Re-run the bundle script if needed

## Notes

- The bundle is self-contained and doesn't require Git
- All dependencies are resolved during Docker build
- The bundle can be compressed (zip/tar) for easier distribution
- Database files are optional - will be created if missing

## Support

For issues with bundle creation or deployment, refer to:
- `README_DEPLOYMENT.md` in the bundle
- Main project documentation
- Docker logs: `docker-compose logs`













































































