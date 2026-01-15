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
FROM php:8.2-apache

# Install required PHP extensions and utilities
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    sqlite3 \
    curl \
    openssl \
    libldap2-dev \
    python3 \
    && docker-php-ext-install pdo pdo_sqlite opcache ldap \
    && docker-php-ext-enable pdo_sqlite opcache ldap \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache modules (including SSL)
RUN a2enmod rewrite headers mime ssl

# Set working directory
WORKDIR /var/www/html

# Copy PHP files
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY docker/.htaccess ./.htaccess

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
RUN mkdir -p data uploads && \
    chown -R www-data:www-data data uploads && \
    chmod -R 755 data uploads

# Copy existing SQLite database file(s) from host to container if they exist
# This allows you to start with your existing database, but it will be isolated inside the container
# Note: If data/ directory doesn't exist in build context, create it first, then copy if present
# The database will be auto-created on first run if not copied
COPY data/ ./data/

# Copy uploads folder (contains logo images and branding data)
# This allows you to start with your existing branding assets, but they will be isolated inside the container
COPY uploads/ ./uploads/

# Copy check_opcache.php if it exists in the build context (optional)
RUN if [ -f ../check_opcache.php ]; then \
        cp ../check_opcache.php ./check_opcache.php && \
        chmod 644 ./check_opcache.php && \
        echo "✓ check_opcache.php copied"; \
    else \
        echo "Note: check_opcache.php not found, skipping (optional file)"; \
    fi

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
    # Remove documentation and markdown files
    find /var/www/html -type f -name "*.md" -delete 2>/dev/null || true && \
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

# Expose ports (HTTP and HTTPS)
EXPOSE 80 443

# Start workers (optional) + Apache
CMD ["/usr/local/bin/linknest-entrypoint.sh"]
































