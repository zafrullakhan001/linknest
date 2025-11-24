# Production Mode Troubleshooting

## Issue: Getting `GET http://localhost/index.tsx 404` Error

This error occurs when the browser is serving the **development** `index.html` instead of the **production** build from `dist/`.

## Quick Fixes

### 1. Clear Browser Cache
The browser may be caching the old development `index.html`. Try:

**Chrome/Edge:**
- Press `Ctrl + Shift + Delete`
- Select "Cached images and files"
- Click "Clear data"
- Or use `Ctrl + F5` for hard refresh

**Firefox:**
- Press `Ctrl + Shift + Delete`
- Select "Cache"
- Click "Clear Now"
- Or use `Ctrl + F5` for hard refresh

### 2. Verify Production Build Exists
```bash
# Check if dist/index.html exists
dir dist\index.html

# If it doesn't exist or is outdated, rebuild:
npm run build
```

### 3. Test Direct Access
Try accessing the production file directly:
```
http://localhost/linknest/dist/index.html
```

If this works, the build is correct and the issue is with routing.

### 4. Verify .htaccess is Working
Check Apache error logs if the rewrite rules aren't working:
- XAMPP: `C:\xampp\apache\logs\error.log`

### 5. Restart Apache
Sometimes Apache needs a restart to pick up .htaccess changes:
1. Open XAMPP Control Panel
2. Stop Apache
3. Start Apache

## Expected Behavior

**Production Mode (when `dist/index.html` exists):**
- `http://localhost/linknest/` → Serves `dist/index.html`
- `http://localhost/linknest/#/tile/123` → Serves `dist/index.html` (SPA routing)
- `http://localhost/linknest/api/*` → Routes to `api/index.php`

**Development Mode (when `dist/index.html` doesn't exist):**
- `http://localhost/linknest/` → Serves root `index.html`
- Use `npm run dev` for development server

## Verification

After clearing cache, check the browser's Network tab:
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh the page
4. Look for `index.html` - it should load from `/linknest/dist/index.html`
5. The JS files should be from `/linknest/assets/` not `/index.tsx`

## Still Not Working?

If the issue persists:
1. Delete the `dist` folder
2. Run `npm run build` again
3. Clear browser cache
4. Restart Apache
5. Try accessing `http://localhost/linknest/dist/index.html` directly

