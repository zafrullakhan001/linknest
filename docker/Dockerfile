# Single Container Dockerfile for LinkNest
# Multi-stage build (build-time only) - final result is ONE container
# Stage 1: Build frontend assets
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY vite.config.ts vite.docker.config.ts tsconfig.json ./
COPY tailwind.config.js postcss.config.js ./

# Install dependencies
# Use npm install if package-lock.json doesn't exist, otherwise use npm ci
RUN if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Copy source files (index.html MUST be copied for Vite to transform it)
COPY index.html index.tsx index.css ./
COPY components/ ./components/
COPY contexts/ ./contexts/
COPY services/ ./services/
COPY hooks/ ./hooks/
COPY land/ ./land/
COPY App.tsx ./
COPY types.ts ./

# Verify index.html exists and has the entry point
RUN if [ ! -f index.html ]; then echo "ERROR: index.html not found!" && exit 1; fi && \
    if ! grep -q "index.tsx" index.html; then echo "ERROR: index.html missing entry point!" && exit 1; fi && \
    echo "✓ Source index.html verified"

# Build frontend for Docker (base path is /)
ENV NODE_ENV=production
RUN npm run build -- --config vite.docker.config.ts && \
    echo "=== Build Output Verification ===" && \
    ls -la dist/ && \
    echo "" && \
    echo "=== dist/index.html content ===" && \
    cat dist/index.html && \
    echo "" && \
    if grep -q "index.tsx" dist/index.html; then \
        echo "ERROR: Built HTML still references index.tsx!" && \
        exit 1; \
    fi && \
    echo "✓ Build verification passed"

# Stage 2: Final single container with PHP, Apache, and SQLite
# This is the ONLY container that runs - everything is included here
# PHP 8.4: 8.5 has broken extension install (Makefile modules/*) in official image; switch to 8.5 when fixed
FROM php:8.4-apache

# Install system deps and PHP extensions (ldap, zip, pdo_sqlite, opcache)
# curl and openssl are already in the base php image
# - libldap2-dev: for PHP ldap extension
# - libzip-dev, zlib1g-dev: for PHP zip extension
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    sqlite3 \
    curl \
    openssl \
    libldap2-dev \
    libzip-dev \
    zlib1g-dev \
    python3 \
    cron \
    tzdata \
    && docker-php-ext-install pdo pdo_sqlite opcache ldap zip \
    && docker-php-ext-enable pdo_sqlite opcache ldap zip \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache modules (including SSL and performance modules)
RUN a2enmod rewrite headers mime ssl expires deflate cache

# Set working directory
WORKDIR /var/www/html

# Copy PHP files
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY docker/.htaccess ./.htaccess

# Staging AI Offline Kit templates (served by api/tiles.php from app root)
COPY staging-ai-import-template.csv ./staging-ai-import-template.csv
COPY staging-ai-prompt-guide.md ./staging-ai-prompt-guide.md
COPY bulk-import-template.csv ./bulk-import-template.csv
COPY section-links-import-template.csv ./section-links-import-template.csv

# Copy check_opcache.php to root for system status monitoring (optional - copy if exists)
# Note: This file is optional and won't break the build if missing

# Copy built frontend from builder
COPY --from=frontend-builder /app/dist ./dist

# Verify the built index.html exists and has correct content
RUN if [ ! -f dist/index.html ]; then echo "ERROR: dist/index.html not found!" && exit 1; fi && \
    if grep -q "index.tsx" dist/index.html; then echo "ERROR: Built HTML still references index.tsx!" && cat dist/index.html && exit 1; fi && \
    echo "✓ Built index.html verified" && \
    # Copy dist/index.html to root for DirectoryIndex to work
    cp dist/index.html index.html && \
    echo "✓ Copied dist/index.html to root"

# Create necessary directories with proper permissions
RUN mkdir -p data uploads data/backups && \
    chown -R www-data:www-data data uploads && \
    chmod -R 755 data uploads && \
    chmod 755 data/backups

# Copy existing SQLite database file(s) from host to container if they exist
# This allows you to start with your existing database, but it will be isolated inside the container
# Note: If data/ directory doesn't exist in build context, create it first, then copy if present
# The database will be auto-created on first run if not copied
COPY data/ ./data/

# Copy uploads folder (contains logo images and branding data)
# This allows you to start with your existing branding assets, but they will be isolated inside the container
COPY uploads/ ./uploads/

# Copy check_opcache.php for OPcache status monitoring (health check page)
# This provides a web-accessible dashboard for monitoring OPcache and database status
COPY check_opcache.php ./check_opcache.php
RUN chmod 644 ./check_opcache.php && \
    echo "✓ check_opcache.php copied (OPcache health check page)"

# Copy backup_restore_docker.php for Docker container backup/restore management
# This provides a web-accessible interface for managing database backups in Docker containers
COPY backup_restore_docker.php ./backup_restore_docker.php
RUN chmod 644 ./backup_restore_docker.php && \
    echo "✓ backup_restore_docker.php copied (Docker backup & restore page)"

# Copy docker-landing.php for Docker container landing page
# This provides a comprehensive landing page with all application links and services
COPY docker-landing.php ./docker-landing.php
RUN chmod 644 ./docker-landing.php && \
    echo "✓ docker-landing.php copied (Docker landing page)"

# Set proper permissions for all files
# Set permissions on database files if they exist (will be auto-created if not present)
RUN chown -R www-data:www-data /var/www/html && \
    chmod -R 755 /var/www/html && \
    chmod 644 data/*.db 2>/dev/null || echo "Note: Database will be created on first run if not present"

# Copy SSL certificate generation script
COPY docker/generate-ssl-cert.sh /usr/local/bin/generate-ssl-cert.sh
RUN chmod +x /usr/local/bin/generate-ssl-cert.sh

# Generate self-signed SSL certificate
RUN /usr/local/bin/generate-ssl-cert.sh

# Configure Apache for high performance (1000+ concurrent users)
# Optimize MPM (Multi-Processing Module) settings for production
RUN echo '<IfModule mpm_prefork_module>' > /etc/apache2/conf-available/mpm-performance.conf && \
    echo '    StartServers 8' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '    MinSpareServers 5' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '    MaxSpareServers 20' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '    ServerLimit 256' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '    MaxRequestWorkers 256' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '    MaxConnectionsPerChild 10000' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '</IfModule>' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo '# Performance tuning' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo 'Timeout 300' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo 'KeepAlive On' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo 'MaxKeepAliveRequests 100' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo 'KeepAliveTimeout 5' >> /etc/apache2/conf-available/mpm-performance.conf && \
    echo 'HostnameLookups Off' >> /etc/apache2/conf-available/mpm-performance.conf && \
    a2enconf mpm-performance

# Configure Apache
COPY docker/apache-config.conf /etc/apache2/sites-available/000-default.conf
COPY docker/apache-ssl-config.conf /etc/apache2/sites-available/000-default-ssl.conf

# Enable SSL site
RUN a2ensite 000-default-ssl.conf

# Configure PHP
COPY docker/php-config.ini /usr/local/etc/php/conf.d/linknest.ini

# Copy verification script
COPY docker/verify-php.sh /usr/local/bin/verify-php.sh
RUN chmod +x /usr/local/bin/verify-php.sh

# Copy container entrypoint (starts workers + apache)
COPY docker/linknest-entrypoint.sh /usr/local/bin/linknest-entrypoint.sh
RUN chmod +x /usr/local/bin/linknest-entrypoint.sh

# Set up cron jobs for daily database backups
# Cron format: minute hour day month day-of-week user command
# 0 2 * * * = Every day at 2:00 AM (export_database.php)
# 0 3 * * * = Every day at 3:00 AM (snapshot.php)
# Note: Both export_database.php and snapshot.php automatically remove backups older than 30 days
RUN echo "# Daily database export at 2:00 AM" > /etc/cron.d/linknest-backup && \
    echo "0 2 * * * www-data /usr/bin/php /var/www/html/scripts/export_database.php >> /var/log/linknest-backup.log 2>&1" >> /etc/cron.d/linknest-backup && \
    echo "" >> /etc/cron.d/linknest-backup && \
    echo "# Daily database snapshot at 3:00 AM" >> /etc/cron.d/linknest-backup && \
    echo "0 3 * * * www-data /usr/bin/php /var/www/html/api/snapshot.php >> /var/log/linknest-backup.log 2>&1" >> /etc/cron.d/linknest-backup && \
    chmod 0644 /etc/cron.d/linknest-backup && \
    # Create log file with proper permissions
    touch /var/log/linknest-backup.log && \
    chown www-data:www-data /var/log/linknest-backup.log && \
    # Ensure cron can read the crontab
    chmod 644 /etc/cron.d/linknest-backup

# Verify PHP and SQLite are working
RUN /usr/local/bin/verify-php.sh

# Post-build cleanup: Remove unnecessary files to reduce image size
RUN echo "🧹 Cleaning up unnecessary files to reduce image size..." && \
    # Remove any node_modules if present (shouldn't be, but just in case)
    find /var/www/html -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true && \
    # Remove TypeScript/React source files (we only need the built dist folder)
    find /var/www/html -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" \) ! -path "*/dist/*" ! -path "*/scripts/*" -delete 2>/dev/null || true && \
    # Remove source directories (components, contexts, services, land) if they exist
    rm -rf /var/www/html/components /var/www/html/contexts /var/www/html/services /var/www/html/land 2>/dev/null || true && \
    # Remove build configuration files (not needed in runtime)
    rm -f /var/www/html/vite.config.ts /var/www/html/vite.docker.config.ts /var/www/html/vite.runtime.config.ts \
          /var/www/html/tsconfig.json /var/www/html/tailwind.config.js /var/www/html/postcss.config.js \
          /var/www/html/package.json /var/www/html/package-lock.json 2>/dev/null || true && \
    # Remove source files from root
    rm -f /var/www/html/App.tsx /var/www/html/index.tsx /var/www/html/types.ts /var/www/html/index.css 2>/dev/null || true && \
    # Remove any .git directories if present
    find /var/www/html -type d -name ".git" -exec rm -rf {} + 2>/dev/null || true && \
    # Remove documentation and markdown files (keep Staging AI prompt guide — required by API)
    find /var/www/html -type f -name "*.md" ! -name "staging-ai-prompt-guide.md" -delete 2>/dev/null || true && \
    # Remove test files
    find /var/www/html -type f -name "test_*.php" -delete 2>/dev/null || true && \
    find /var/www/html -type f -name "*.test.*" -delete 2>/dev/null || true && \
    # Clean up apt cache and temporary files
    apt-get clean && \
    rm -rf /tmp/* /var/tmp/* && \
    echo "✓ Cleanup complete - image size optimized"

# Set environment variables
ENV APACHE_DOCUMENT_ROOT=/var/www/html
ENV PHP_INI_SCAN_DIR=/usr/local/etc/php/conf.d
# Timezone will be set at runtime from host system or TZ environment variable

# Expose ports (HTTP and HTTPS)
EXPOSE 80 443

# Start workers (optional) + Apache
CMD ["/usr/local/bin/linknest-entrypoint.sh"]
































