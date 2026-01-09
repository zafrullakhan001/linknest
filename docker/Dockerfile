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
    && docker-php-ext-install pdo pdo_sqlite opcache ldap \
    && docker-php-ext-enable pdo_sqlite opcache ldap \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache modules (including SSL)
RUN a2enmod rewrite headers mime ssl

# Set working directory
WORKDIR /var/www/html

# Copy PHP files
COPY api/ ./api/
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

# Create necessary directories first
RUN mkdir -p data uploads

# Copy existing SQLite database file(s) from host to container
# This copies the existing database into the image
# Note: The volume mount in docker-compose.yml will use the host database at runtime,
# but having it in the image ensures it's available even without volume mounts
COPY data/ ./data/

# Copy check_opcache.php if it exists in the build context (optional)
RUN if [ -f ../check_opcache.php ]; then \
        cp ../check_opcache.php ./check_opcache.php && \
        chmod 644 ./check_opcache.php && \
        echo "✓ check_opcache.php copied"; \
    else \
        echo "Note: check_opcache.php not found, skipping (optional file)"; \
    fi

# Set proper permissions for all files
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

# Verify PHP and SQLite are working
RUN /usr/local/bin/verify-php.sh

# Set environment variables
ENV APACHE_DOCUMENT_ROOT=/var/www/html
ENV PHP_INI_SCAN_DIR=/usr/local/etc/php/conf.d

# Expose ports (HTTP and HTTPS)
EXPOSE 80 443

# Start Apache
CMD ["apache2-foreground"]
































