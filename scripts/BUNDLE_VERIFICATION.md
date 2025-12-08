# Bundle Verification - OPcache and LDAP

This document confirms that OPcache and LDAP extensions are included in the deployment bundle.

## What's Included in the Bundle

### 1. Dockerfile
The `docker/Dockerfile` in the bundle includes:
- **OPcache extension**: Installed via `docker-php-ext-install opcache`
- **LDAP extension**: Installed via `docker-php-ext-install ldap`
- **LDAP dependencies**: `libldap2-dev` package installed
- Both extensions are enabled: `docker-php-ext-enable opcache ldap`

### 2. PHP Configuration
The `docker/php-config.ini` in the bundle includes:
- **OPcache settings**:
  - `opcache.enable=1` (enabled for web requests)
  - `opcache.enable_cli=0` (disabled for CLI)
  - `opcache.memory_consumption=128` (128MB memory)
  - `opcache.max_accelerated_files=10000`
  - `opcache.revalidate_freq=2`
  - `opcache.fast_shutdown=1`

### 3. Utility Files
The bundle includes:
- `check_opcache.php` - OPcache status monitoring page

## Verification

When you create a bundle, the script will verify:
1. ✅ OPcache and LDAP are present in Dockerfile
2. ✅ OPcache configuration is present in php-config.ini

## After Deployment

After deploying the bundle, verify the extensions are loaded:

```bash
# Check if extensions are loaded
docker exec linknest php -m | grep -i opcache
docker exec linknest php -m | grep -i ldap

# Check OPcache status
docker exec linknest php -r "echo extension_loaded('opcache') ? 'OPcache loaded' : 'OPcache NOT loaded';"
docker exec linknest php -r "echo extension_loaded('ldap') ? 'LDAP loaded' : 'LDAP NOT loaded';"

# Access OPcache status page
# HTTP: http://localhost:8090/check_opcache.php
# HTTPS: https://localhost:8443/check_opcache.php
```

## Expected Results

After deployment, you should see:
- ✅ OPcache extension loaded and active
- ✅ LDAP extension loaded
- ✅ OPcache status page accessible
- ✅ OPcache statistics showing cached scripts and hit rates

## Troubleshooting

If extensions are not loaded:
1. Check Docker build logs: `docker-compose logs`
2. Verify Dockerfile was copied correctly
3. Rebuild the container: `docker-compose build --no-cache`
4. Check PHP configuration: `docker exec linknest php -i | grep opcache`

## Summary

✅ **OPcache**: Included in Dockerfile and configured in php-config.ini  
✅ **LDAP**: Included in Dockerfile with required dependencies  
✅ **Verification**: Bundle scripts verify both are included  
✅ **Status Page**: check_opcache.php included for monitoring  

Both extensions are fully included and configured in the deployment bundle!














































































