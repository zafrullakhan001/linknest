# Single Container Dockerfile for LinkNest
# Multi-stage build (build-time only) - final result is ONE container
# Stage 1: Build frontend assets
# Use Debian-based Node (not Alpine) — Alpine/musl npm has been crashing with
# "Exit handler never called!" and leaving vite missing from node_modules.
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY vite.config.ts vite.docker.config.ts tsconfig.json ./
COPY tailwind.config.js postcss.config.js ./

# Install dependencies (vite lives in devDependencies and is required to build)
# --ignore-scripts: package.json postinstall copies TinyMCE, but that script is
# copied after npm ci. The Vite build step runs copy-tinymce-assets.mjs itself.
# Some environments (corporate SSL inspection / local MITM antivirus) break npm's
# TLS verification inside containers with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
# Disable strict SSL only in this disposable builder stage.
RUN set -eux; \
    npm config set strict-ssl false; \
    if [ -f package-lock.json ]; then \
        npm ci --include=dev --no-audit --no-fund --ignore-scripts; \
    else \
        npm install --include=dev --no-audit --no-fund --ignore-scripts; \
    fi; \
    test -f node_modules/vite/package.json; \
    test -x node_modules/.bin/vite; \
    echo "✓ vite installed"

# Copy source files (index.html MUST be copied for Vite to transform it)
COPY index.html index.tsx index.css ./
COPY components/ ./components/
COPY contexts/ ./contexts/
COPY services/ ./services/
COPY hooks/ ./hooks/
COPY utils/ ./utils/
COPY land/ ./land/
COPY public/ ./public/
COPY scripts/copy-tinymce-assets.mjs ./scripts/copy-tinymce-assets.mjs
COPY scripts/vite-build-shared.ts ./scripts/vite-build-shared.ts
COPY App.tsx ./
COPY types.ts ./
# Type declarations required by VNC Viewer widget (@novnc/novnc)
COPY novnc.d.ts ./

# Optional Gemini key for the Vite production bundle (from compose build args / .env)
ARG GEMINI_API_KEY=
ENV GEMINI_API_KEY=$GEMINI_API_KEY

# Verify index.html exists and has the entry point
RUN if [ ! -f index.html ]; then echo "ERROR: index.html not found!" && exit 1; fi && \
    if ! grep -q "index.tsx" index.html; then echo "ERROR: index.html missing entry point!" && exit 1; fi && \
    echo "✓ Source index.html verified"

# Build frontend for Docker (base path is /)
# Keep production mode for the Vite build only; do not set NODE_ENV before npm ci
ENV NODE_ENV=production
RUN node scripts/copy-tinymce-assets.mjs && \
    ./node_modules/.bin/vite build --config vite.docker.config.ts && \
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
    openssh-client \
    iproute2 \
    libldap2-dev \
    libzip-dev \
    zlib1g-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libwebp-dev \
    python3 \
    python3-pip \
    cron \
    tzdata \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install pdo pdo_sqlite opcache ldap zip gd \
    && docker-php-ext-enable pdo_sqlite opcache ldap zip gd \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    # websockify — VNC Viewer Easy-mode gateway (python3 -m websockify)
    # --trusted-host helps builds behind SSL inspection / MITM antivirus
    && pip3 install --break-system-packages --no-cache-dir \
        --trusted-host pypi.org \
        --trusted-host pypi.python.org \
        --trusted-host files.pythonhosted.org \
        websockify \
    && python3 -c "import websockify" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ttyd — SSH Terminal widget WebSocket gateway
# Prefer vendored Linux binary (bin/ttyd.x86_64) so builds work behind SSL inspection.
# Fallback: download from GitHub if the vendored file is missing.
COPY bin/ ./bin/
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64|amd64) ttyd_src="ttyd.x86_64" ;; \
      aarch64|arm64) ttyd_src="ttyd.aarch64" ;; \
      *) echo "Unsupported arch for ttyd: $arch" >&2; exit 1 ;; \
    esac; \
    if [ -f "/var/www/html/bin/${ttyd_src}" ]; then \
      cp "/var/www/html/bin/${ttyd_src}" /usr/local/bin/ttyd; \
    elif [ -f /var/www/html/bin/ttyd ] && [ ! -f /var/www/html/bin/ttyd.exe ]; then \
      cp /var/www/html/bin/ttyd /usr/local/bin/ttyd; \
    else \
      curl -fsSLk "https://github.com/tsl0922/ttyd/releases/download/1.7.7/${ttyd_src}" -o /usr/local/bin/ttyd; \
    fi; \
    chmod 755 /usr/local/bin/ttyd; \
    /usr/local/bin/ttyd --version; \
    rm -rf /var/www/html/bin

# Enable Apache modules (including SSL, WebSocket proxy for SSH/VNC gateways)
RUN a2enmod rewrite headers mime ssl expires deflate cache proxy proxy_http proxy_wstunnel status

# Set working directory
WORKDIR /var/www/html

# Copy PHP files
COPY api/ ./api/
COPY scripts/ ./scripts/
RUN find ./scripts -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true; \
    find ./scripts -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete 2>/dev/null || true
COPY extensions/ ./extensions/
COPY land/ ./land/
COPY docs/ ./docs/
COPY apache/ ./apache/
COPY config/SamlConfig.php ./config/SamlConfig.php
COPY composer.json ./composer.json
COPY vendor/ ./vendor/
COPY docker/.htaccess ./.htaccess
COPY sw-cache-first.php ./sw-cache-first.php
COPY s.php ./s.php

# Frontend sources so Docker Clone / App Updates can run Vite (npm is in this image).
COPY package.json package-lock.json tsconfig.json ./
COPY vite.config.ts vite.docker.config.ts vite.runtime.config.ts ./
COPY tailwind.config.js postcss.config.js ./
COPY index.html index.tsx index.css App.tsx types.ts novnc.d.ts ./
COPY components/ ./components/
COPY contexts/ ./contexts/
COPY services/ ./services/
COPY hooks/ ./hooks/
COPY utils/ ./utils/
COPY public/ ./public/

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
    cp -a index.html index.vite.html && \
    # Copy dist/index.html to root for DirectoryIndex to work
    cp dist/index.html index.html && \
    echo "✓ Copied dist/index.html to root (Vite source saved as index.vite.html)"

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
    chmod 644 data/*.db 2>/dev/null || echo "Note: Database will be created on first run if not present" && \
    mkdir -p /var/www/clones && \
    chown www-data:www-data /var/www/clones && \
    chmod 775 /var/www/clones

# Copy SSL certificate generation script
COPY docker/generate-ssl-cert.sh /usr/local/bin/generate-ssl-cert.sh
RUN chmod +x /usr/local/bin/generate-ssl-cert.sh

# Generate self-signed SSL certificate
RUN /usr/local/bin/generate-ssl-cert.sh
# Allow www-data (Apache/PHP) to start ttyd with --ssl using the same certs
RUN chgrp www-data /etc/apache2/ssl/linknest.key /etc/apache2/ssl/linknest.crt \
    && chmod 640 /etc/apache2/ssl/linknest.key \
    && chmod 644 /etc/apache2/ssl/linknest.crt

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
COPY docker/apache-gateway-proxy.conf /etc/apache2/conf-available/linknest-gateway-proxy.conf
COPY docker/apache-clones.conf /etc/apache2/conf-available/linknest-clones.conf

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

# Node.js 20 + npm for in-app App Updates (commit zipballs rebuild dist/ with Vite).
# Copy the toolchain from the frontend-builder stage so the runtime matches the image build.
COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend-builder /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && mkdir -p /var/www/.npm /var/www/.cache \
    && chown -R www-data:www-data /var/www/.npm /var/www/.cache \
    && node --version \
    && npm --version \
    && mkdir -p /usr/local/etc \
    && printf 'strict-ssl=false\n' > /usr/local/etc/npmrc \
    && printf 'strict-ssl=false\n' > /var/www/.npmrc \
    && chown www-data:www-data /var/www/.npmrc \
    && echo "✓ Node.js + npm available for in-container frontend rebuilds"

# Post-build cleanup: drop git metadata and tests; keep Vite sources for clone + in-app rebuilds.
RUN echo "🧹 Cleaning up unnecessary files to reduce image size..." && \
    find /var/www/html -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true && \
    find /var/www/html -type d -name ".git" -exec rm -rf {} + 2>/dev/null || true && \
    find /var/www/html -type f -name "test_*.php" -delete 2>/dev/null || true && \
    find /var/www/html -type f -name "*.test.*" -delete 2>/dev/null || true && \
    apt-get clean && \
    rm -rf /tmp/* /var/tmp/* && \
    echo "✓ Cleanup complete (frontend sources kept for Docker clone / App Updates)"

# Set environment variables
ENV APACHE_DOCUMENT_ROOT=/var/www/html
ENV PHP_INI_SCAN_DIR=/usr/local/etc/php/conf.d
# Timezone will be set at runtime from host system or TZ environment variable

# Expose ports (HTTP and HTTPS)
EXPOSE 80 443

# Start workers (optional) + Apache
CMD ["/usr/local/bin/linknest-entrypoint.sh"]
































