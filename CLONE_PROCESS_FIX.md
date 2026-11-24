# Clone Process Fix - Missing Directories Issue

## Issue Summary
The newly cloned instance "ZAF" was failing to load with a 404 error. Investigation revealed that the `dist` folder was missing because the build process failed during the clone operation.

## Root Cause
The clone service (`api/clone_service.php`) was **not copying several critical directories** during the clone process, specifically:
- **`hooks/`** - Contains custom React hooks (e.g., `useMobile.ts`)
- **`config/`** - Contains configuration files (e.g., `SamlConfig.php`)
- **`migrations/`** - Contains database migration scripts

When the build process (`npm run build`) ran, it failed with the error:
```
Could not resolve "./hooks/useMobile" from "App.tsx"
```

This happened because `App.tsx` imports from the `hooks` directory, which wasn't copied to the cloned instance.

## Fix Applied

### 1. Updated Clone Service
Updated `api/clone_service.php` to include the missing directories in the copy list:

**Before:**
```php
$directories = ['api', 'components', 'contexts', 'services', 'src', 'docker', 'docs', 'land'];
```

**After:**
```php
$directories = ['api', 'components', 'config', 'contexts', 'hooks', 'migrations', 'services', 'src', 'docker', 'docs', 'land'];
```

### 2. Repaired Existing ZAF Clone
For the existing ZAF instance, manually copied the missing directories:
- Copied `hooks/` directory
- Copied `config/` directory
- Copied `migrations/` directory
- Ran `npm run build` successfully
- The `dist` folder was created with all necessary files

## Files Modified
1. `c:\xampp\htdocs\linknest\api\clone_service.php` - Added missing directories to the copy list
2. `c:\xampp\htdocs\ZAF\` - Manually copied missing directories and rebuilt

## Testing the Fix

### Test the ZAF Instance
1. Open your browser
2. Navigate to: `http://localhost/ZAF/`
3. The application should load without any 404 errors
4. Check the browser console (F12) - no errors should appear
5. Try logging in and navigating around the application

### Test Future Clones
1. Create a new clone from the Admin Panel
2. Monitor the clone process - it should complete successfully
3. The build step should complete without errors
4. The new clone should have:
   - `hooks/` directory with `useMobile.ts`
   - `config/` directory with `SamlConfig.php`
   - `migrations/` directory with migration scripts
   - `dist/` directory with built application files

## What to Check in Browser
When you access `http://localhost/ZAF/`:
1. ✅ Page loads successfully (no 404 errors)
2. ✅ No "Failed to load resource" errors in console
3. ✅ Application UI displays correctly
4. ✅ All JavaScript and CSS files load from `/ZAF/dist/assets/`
5. ✅ Login functionality works
6. ✅ Navigation works properly

## Additional Notes

### Build Output
The build process should produce output similar to:
```
vite v6.4.1 building for production...
transforming...
✓ 737 modules transformed.
rendering chunks...
dist/index.html                             2.99 kB
dist/assets/style-DxIdwSRn.css            263.14 kB
dist/assets/js/vendor-BjpwptUW.js          65.41 kB
dist/assets/js/style-manager-D_XBxD2y.js  188.65 kB
dist/assets/js/react-vendor-Cmtt_Evi.js   234.47 kB
dist/assets/js/charts-vendor-BQqNLs5v.js  310.30 kB
dist/assets/js/tile-detail-Dsv03cIz.js    394.90 kB
dist/assets/js/index-DAyZckjt.js          405.48 kB
dist/assets/js/tile-grid-DtvP7s7p.js      528.78 kB
dist/assets/js/admin-panel-CuiVkJVO.js    576.58 kB
✓ built in 4.85s
```

### Directory Structure
After a successful clone, the instance should have this structure:
```
ZAF/
├── api/              (API endpoints)
├── components/       (React components)
├── config/           (Configuration files) ✓ NEW
├── contexts/         (React contexts)
├── data/             (SQLite database)
├── dist/             (Built application) ✓ SHOULD EXIST
├── docker/           (Docker configuration)
├── docs/             (Documentation)
├── hooks/            (React hooks) ✓ NEW
├── land/             (Landing page integration)
├── migrations/       (Database migrations) ✓ NEW
├── scripts/          (Helper scripts)
├── services/         (TypeScript services)
├── src/              (Additional source files)
├── uploads/          (User-uploaded assets)
├── .env              (Environment configuration)
├── .htaccess         (Apache rewrite rules)
├── package.json      (NPM dependencies)
└── ... (other config files)
```

## Prevention
This fix ensures that:
1. **All future clones** will include the `hooks`, `config`, and `migrations` directories
2. **Build process** will complete successfully
3. **Cloned instances** will be fully functional immediately after cloning
4. **No manual intervention** required for new clones

## Related Issues
- Missing `dist` folder → Fixed by ensuring build succeeds
- 404 errors on cloned instances → Fixed by copying all required directories
- Build failure "Could not resolve ./hooks/useMobile" → Fixed by copying hooks directory

## Date Fixed
January 23, 2026

## Tested By
- ZAF instance manually repaired and tested
- Clone service updated to prevent future occurrences
