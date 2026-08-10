# LinkNest Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Servers

You need to run two servers:

**Terminal 1 - PHP Backend:**
```bash
php -S localhost:8000 -t .
```

**Terminal 2 - Frontend (Vite):**
```bash
npm run dev
```

### 3. Access the Application

Open your browser to: `http://localhost:3000`

## Features

### Guest Mode (Not Authenticated)
- ✅ View all public tiles and links
- ✅ Search and filter links
- ✅ Navigate between tiles
- ❌ Cannot create, edit, or delete tiles

### Authenticated Mode
- ✅ All guest features
- ✅ Create new tiles/spaces
- ✅ Edit existing tiles
- ✅ Delete tiles
- ✅ Manage links and sections
- ✅ AI-powered content generation

## First Time Setup

1. **Create Account**: Click "Sign In" in the navigation, then "Sign up"
2. **Create Your First Space**: Click "New Space" button
3. **Add Links**: Click on a tile to view/edit, then add links to sections

## Database

The SQLite database is automatically created in the `data/` directory on first API request. No manual setup required!

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_BASE=/api
GEMINI_API_KEY=your_gemini_api_key_here
```

The Gemini API key is optional - it's only needed for AI-powered content generation features.

## Troubleshooting

### Database Permission Errors
```bash
chmod 755 data
chmod 644 data/*.db
```

### PHP Session Issues
Make sure the `data/` directory is writable for session storage.

### API Not Working
- Check that PHP server is running on port 8000
- Check browser console for CORS errors
- Verify `.htaccess` is being read (Apache) or configure Nginx properly

## Production Deployment

See `README_BACKEND.md` for production setup instructions.

## Upgrade PHP on Windows XAMPP

Official XAMPP packages may ship an older PHP (for example 8.2) while LinkNest runs well on newer releases such as **PHP 8.5**.

Use the PowerShell upgrader (elevated when Apache is a Windows service):

```powershell
cd C:\xampp\htdocs\linknest
.\scripts\upgrade-xampp-php-run-elevated.ps1 -Version 8.5 -RestartApache
```

The script downloads the official Thread Safe x64 build, verifies SHA256, checks **LDAP** before swapping, and keeps a `php-backup-*` folder for rollback.

Full guide (also in Help → Guides): [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md).

