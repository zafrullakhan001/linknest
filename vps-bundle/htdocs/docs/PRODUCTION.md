# Production Deployment Guide

## Building for Production

1. **Build the frontend:**
   ```bash
   npm run build
   ```
   This creates optimized production files in the `dist/` directory.

2. **Verify the build:**
   - Check that `dist/index.html` exists
   - Check that `dist/assets/` contains the bundled JavaScript files

## Production Setup

The application is configured to run in production mode with XAMPP/Apache:

### File Structure
- **Frontend (Production)**: Files in `dist/` directory
- **Backend API**: Files in `api/` directory
- **Database**: SQLite database in `data/linknest.db`

### Apache Configuration

The `.htaccess` file is configured to:
1. Route API requests (`/api/*`) to `api/index.php`
2. Serve production files from `dist/` directory
3. Fall back to `dist/index.html` for SPA routes

### Accessing the Application

- **Production URL**: `http://localhost/linknest/`
- The application will automatically serve files from `dist/` if they exist
- API endpoints are available at `http://localhost/linknest/api/*`

## Development vs Production

### Development Mode
- Run `npm run dev` to start Vite dev server
- Access at `http://localhost:3000`
- Hot module replacement enabled
- Source maps available

### Production Mode
- Run `npm run build` to create production build
- Access at `http://localhost/linknest/`
- Optimized and minified code
- No source maps (for smaller bundle size)

## Rebuilding After Changes

Whenever you make changes to the frontend code:

1. Run `npm run build` to rebuild
2. The new files will be in `dist/`
3. Refresh your browser to see changes

## Environment Variables

Make sure to set any required environment variables (like `GEMINI_API_KEY`) in your `.env` file before building.

## In-app updates (XAMPP)

Admins can apply GitHub Releases from the UI (bell / **Admin → App Updates**) without a manual ZIP deploy.

See **[APP_UPDATES.md](APP_UPDATES.md)** for publishing (`scripts/publish-update-release.ps1`) and applying updates.

## Troubleshooting

### Build fails
- Check that all dependencies are installed: `npm install`
- Verify Node.js version is compatible

### Production site not loading
- Check that `dist/index.html` exists
- Verify `.htaccess` is properly configured
- Check Apache error logs

### API not working
- Verify `api/index.php` is accessible
- Check that `.htaccess` rewrite rules are enabled
- Verify PHP is running and SQLite extension is enabled

