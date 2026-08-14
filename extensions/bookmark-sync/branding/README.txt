Place your organisation logo here as logo.png (PNG, JPG, or WebP).

Then in ../org-branding.json set:
  "enabled": true
  "name": "Your Organisation Bookmark Sync"
  "appName": "Your Organisation"
  "appUrl": "https://intranet.example.com/linknest"
  "logo": "branding/logo.png"
  "locked": true
  "allowedOrigins": ["https://intranet.example.com"]
  "syncDefaultOn": false

allowedOrigins must be your real LinkNest origin (scheme + host + port). Remove localhost before production force-install.

Copy the whole bookmark-sync folder (or a packed CRX) to each PC. Force-install per user so each Chrome/Edge profile can only sync that user’s own bookmarks.
