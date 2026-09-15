# LinkNest Clone Scripts

These scripts allow you to quickly clone LinkNest to a new folder with all necessary files, configure it for the new location, and build it ready for deployment.

## Usage

### Windows

```batch
cd scripts
clone-linknest.bat <new-folder-name> [--assets] [--database]
```

**Examples:**
```batch
# Basic clone (no assets or database)
clone-linknest.bat myspaces

# Clone with logos and favicon
clone-linknest.bat myspaces --assets

# Clone with database
clone-linknest.bat myspaces --database

# Clone with both assets and database
clone-linknest.bat myspaces --assets --database
```

This will create a new folder `myspaces` in the parent directory (e.g., `C:\xampp\htdocs\myspaces\`)

### Linux/Mac

```bash
cd scripts
chmod +x clone-linknest.sh
./clone-linknest.sh <new-folder-name> [--assets] [--database]
```

**Examples:**
```bash
# Basic clone (no assets or database)
./clone-linknest.sh myspaces

# Clone with logos and favicon
./clone-linknest.sh myspaces --assets

# Clone with database
./clone-linknest.sh myspaces --database

# Clone with both assets and database
./clone-linknest.sh myspaces --assets --database
```

This will create a new folder `myspaces` in the parent directory (e.g., `/var/www/html/myspaces/`)

## Parameters

- **`new-folder-name`** (required): Name of the new folder to create
- **`--assets`** (optional): Copy logos and favicon from the source `uploads/` folder
- **`--database`** (optional): Copy the database file from the source `data/` folder

## What the Script Does

1. **Creates target directory** - Creates a new folder with the specified name
2. **Copies necessary files** - Copies only essential files (excludes `node_modules`, `dist`, `.git`, etc.):
   - Source files (`.tsx`, `.ts`, `.php`)
   - Configuration files (`package.json`, `vite.config.ts`, etc.)
   - Directories: `api/`, `components/`, `contexts/`, `services/`, `src/`
   - Creates empty `data/` and `uploads/` directories
3. **Copies assets (optional)** - If `--assets` is specified:
   - Copies all logo files (`logo_*.*`) from source `uploads/` folder
   - Copies all favicon files (`favicon_*.*`) from source `uploads/` folder
4. **Copies database (optional)** - If `--database` is specified:
   - Copies `data/linknest.db` from source to new instance
   - New instance will have the same data as the source
5. **Creates .env file** - Automatically sets `VITE_BASE_PATH` to the new folder name
6. **Installs dependencies** - Runs `npm install`
7. **Builds application** - Runs `npm run build`
8. **Removes node_modules** - Automatically deletes `node_modules/` folder after build (saves space, not needed for production)
9. **Creates deployment README** - Adds a `DEPLOYMENT.md` file with instructions

## Files Included

The script copies:
- ✅ All source code files
- ✅ Configuration files (package.json, tsconfig.json, vite.config.ts, etc.)
- ✅ API files (api/ directory)
- ✅ React components and services
- ✅ Router and .htaccess files

The script excludes:
- ❌ `node_modules/` (will be installed fresh)
- ❌ `dist/` (will be built fresh)
- ❌ `.git/` (version control)
- ❌ Database files (`data/*.db`)
- ❌ Uploads (`uploads/*`)
- ❌ Log files
- ❌ Docker files
- ❌ Documentation files

## After Cloning

1. **Access the application**: `http://localhost/<new-folder-name>/`
2. **Login**: 
   - If `--database` was used: Use your existing credentials from the source instance
   - If `--database` was NOT used: Use default credentials `admin` / `admin123`
3. **Change password**: Update admin password in Admin Panel (if using new database)
4. **Database**: 
   - If `--database` was used: Database is already copied and ready
   - If `--database` was NOT used: Will be created automatically at `data/linknest.db` on first use
5. **Logos/Favicon**: 
   - If `--assets` was used: Logos and favicon are already copied
   - If `--assets` was NOT used: You'll need to upload them in the Admin Panel

## Customization

After cloning, you can edit `.env` in the new folder to:
- Change `VITE_BASE_PATH` (if needed)
- Add HTTPS configuration
- Add Gemini API key
- Configure other environment variables

## Rebuilding

If you make changes to the source code in the cloned instance:

```bash
cd <new-folder-name>
npm install  # Only needed if node_modules was deleted
npm run build
```

## About node_modules

**The script automatically deletes `node_modules/` after building!**

- All dependencies are bundled into `dist/assets/js/` during build
- The production server only needs the `dist/` folder to serve the app
- `node_modules/` is automatically removed to save space (often 100-500MB)

**The script keeps these files for future rebuilds:**
- `package.json` - Lists all dependencies
- `package-lock.json` - Locks dependency versions

**To rebuild later:**
1. Run `npm install` to restore `node_modules/`
2. Run `npm run build` to rebuild

**For production deployment, you only need:**
- `dist/` folder (built files)
- `api/` folder (PHP backend)
- `data/` folder (database)
- `uploads/` folder (user uploads)
- `.htaccess`, `router.php`, `.env` (configuration)

## Notes

- Each cloned instance has its own database file
- Each instance is independent and can have different configurations
- The original LinkNest folder is not modified
- The script creates a fresh build, so it's ready to use immediately

