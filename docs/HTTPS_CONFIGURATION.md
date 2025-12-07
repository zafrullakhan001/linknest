# HTTPS Configuration Guide

This application is fully configured to work with both HTTP and HTTPS. All API calls use relative URLs, which automatically adapt to the protocol being used.

## Production HTTPS Setup

### 1. Install SSL Certificate on Apache

Follow your standard Apache SSL certificate installation process. Ensure:
- Certificate files are properly configured
- Apache SSL module is enabled
- Virtual host is configured for HTTPS on port 443

### 2. Configure Environment Variables (Optional)

For Vite development server with HTTPS proxy, create a `.env` file in the project root:

```env
# For production HTTPS
VITE_PROTOCOL=https
VITE_HOST=your-domain.com
VITE_PORT=443

# For development HTTPS (if needed)
# VITE_PROTOCOL=https
# VITE_HOST=localhost
# VITE_PORT=8443
```

**Note:** In production, these environment variables are optional. The application will automatically detect HTTPS from the browser's protocol.

### 3. Apache Configuration

Ensure your Apache virtual host is configured to:
- Listen on port 443 for HTTPS
- Redirect HTTP (port 80) to HTTPS (optional but recommended)
- Serve the application from the correct document root

Example Apache configuration:
```apache
<VirtualHost *:443>
    ServerName your-domain.com
    DocumentRoot /path/to/linknest
    
    SSLEngine on
    SSLCertificateFile /path/to/certificate.crt
    SSLCertificateKeyFile /path/to/private.key
    SSLCertificateChainFile /path/to/chain.crt
    
    # ... rest of your configuration
</VirtualHost>
```

## How It Works

### Protocol-Agnostic API Calls

All API services use relative URLs (starting with `/api` or `/linknest/api`), which means:
- ✅ They automatically use the same protocol as the page (HTTP or HTTPS)
- ✅ No code changes needed when switching between HTTP and HTTPS
- ✅ Works seamlessly with SSL certificates

### Services Configured

The following services are already configured for HTTPS:
- `services/storageService.ts` - Tile management
- `services/authService.ts` - Authentication
- `services/settingsService.ts` - Application settings
- `services/styleService.ts` - Style management
- `services/databaseService.ts` - Database operations
- `services/linkHealthService.ts` - Link health checks

### Vite Development Server

The Vite development server proxy is configured to support both HTTP and HTTPS:
- Automatically detects protocol from environment variables
- SSL verification enabled for HTTPS connections
- Proper headers set for HTTPS proxying

## Testing HTTPS

1. **Production**: Access your application via `https://your-domain.com/linknest`
2. **Development**: If using HTTPS locally, set environment variables and access via `https://localhost:8443`

## Troubleshooting

### Mixed Content Warnings

If you see mixed content warnings, ensure:
- All API calls use relative URLs (they already do)
- No hardcoded `http://` URLs in the codebase
- External resources (fonts, etc.) use HTTPS

### SSL Certificate Errors

- Verify certificate is properly installed
- Check certificate chain is complete
- Ensure Apache SSL module is enabled
- Verify virtual host configuration

### API Calls Failing

- Check browser console for errors
- Verify API endpoints are accessible via HTTPS
- Ensure `.htaccess` rules work with HTTPS
- Check Apache error logs

## Security Headers (Recommended)

Consider adding these security headers in your Apache configuration:

```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-XSS-Protection "1; mode=block"
```

## Notes

- The application does **not** require any code changes to work with HTTPS
- All API calls are protocol-agnostic by design
- SSL certificate installation is the only required step
- Environment variables are optional and only needed for Vite dev server HTTPS proxy





















































































