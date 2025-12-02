# HTTPS Setup with Self-Signed Certificate

## Overview

The Docker container is configured with HTTPS using a self-signed SSL certificate. This provides encrypted communication between the browser and server.

## Access URLs

- **HTTP**: http://localhost:8090
- **HTTPS**: https://localhost:8443 (recommended)

## Browser Security Warning

Since we're using a self-signed certificate, browsers will show a security warning. This is normal and expected for self-signed certificates.

### To Accept the Certificate:

**Chrome/Edge:**
1. Click "Advanced" or "Show Details"
2. Click "Proceed to localhost (unsafe)" or "Continue to localhost"

**Firefox:**
1. Click "Advanced"
2. Click "Accept the Risk and Continue"

**Safari:**
1. Click "Show Details"
2. Click "visit this website"
3. Confirm the exception

## Certificate Details

- **Certificate Location**: `/etc/apache2/ssl/linknest.crt`
- **Private Key Location**: `/etc/apache2/ssl/linknest.key`
- **Validity**: 365 days
- **Key Size**: 2048 bits RSA
- **Subject**: CN=localhost
- **SAN**: localhost, *.localhost, 127.0.0.1, 0.0.0.0

## Security Features Enabled

1. **TLS 1.2+ Only**: Older protocols (SSLv3, TLS 1.0, TLS 1.1) are disabled
2. **Strong Ciphers**: Only high-security cipher suites allowed
3. **HSTS**: HTTP Strict Transport Security header enabled
4. **Security Headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection

## Force HTTPS Redirect (Optional)

To automatically redirect all HTTP traffic to HTTPS, uncomment these lines in `docker/apache-config.conf`:

```apache
# Redirect HTTP to HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
```

Then rebuild the container:
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

## Regenerating the Certificate

The certificate is generated during container build. To regenerate:

1. Rebuild the container:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

2. Or manually generate inside the container:
   ```bash
   docker exec -it linknest /usr/local/bin/generate-ssl-cert.sh
   docker-compose restart
   ```

## Using Your Own Certificate

To use your own SSL certificate:

1. Place your certificate and key in the container:
   ```bash
   docker cp your-cert.crt linknest:/etc/apache2/ssl/linknest.crt
   docker cp your-key.key linknest:/etc/apache2/ssl/linknest.key
   ```

2. Set proper permissions:
   ```bash
   docker exec linknest chmod 600 /etc/apache2/ssl/linknest.key
   docker exec linknest chmod 644 /etc/apache2/ssl/linknest.crt
   ```

3. Restart Apache:
   ```bash
   docker-compose restart
   ```

## Testing HTTPS

Test the HTTPS connection:
```bash
# Test with curl (ignore certificate warning)
curl -k https://localhost:8443/api/settings

# Test with openssl
openssl s_client -connect localhost:8443 -servername localhost
```

## Troubleshooting

### Certificate Not Found
If you see "SSL certificate file does not exist":
1. Check if certificate was generated: `docker exec linknest ls -la /etc/apache2/ssl/`
2. Rebuild the container if missing

### Port Already in Use
If port 8443 is already in use:
1. Change the port in `docker-compose.yml`: `"YOUR_PORT:443"`
2. Rebuild and restart

### Apache Won't Start
Check Apache error logs:
```bash
docker-compose logs | grep -i ssl
docker exec linknest cat /var/log/apache2/ssl_error.log
```

## Production Considerations

For production use, consider:

1. **Use a Real Certificate**: Get a certificate from Let's Encrypt or a commercial CA
2. **Automatic Renewal**: Set up automatic certificate renewal
3. **Force HTTPS**: Enable HTTP to HTTPS redirect
4. **Certificate Monitoring**: Monitor certificate expiration
5. **Security Headers**: Review and adjust security headers as needed

## Notes

- Self-signed certificates are fine for development and internal use
- For production, use a certificate from a trusted Certificate Authority
- The certificate is valid for 365 days and will need to be regenerated annually

























