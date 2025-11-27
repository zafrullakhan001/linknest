# Multi-stage build for LinkNest
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY vite.config.ts vite.docker.config.ts tsconfig.json ./
COPY tailwind.config.js postcss.config.js ./

# Install dependencies
RUN npm ci

# Copy source files (index.html MUST be copied for Vite to transform it)
COPY index.html index.tsx index.css ./
COPY components/ ./components/
COPY contexts/ ./contexts/
COPY services/ ./services/
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

# Production stage
FROM php:8.2-apache

# Install required PHP extensions and utilities
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    sqlite3 \
    curl \
    && docker-php-ext-install pdo pdo_sqlite \
    && docker-php-ext-enable pdo_sqlite \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache modules
RUN a2enmod rewrite headers mime

# Set working directory
WORKDIR /var/www/html

# Copy PHP files
COPY api/ ./api/
COPY docker/.htaccess ./.htaccess

# Copy built frontend from builder
COPY --from=frontend-builder /app/dist ./dist

# Verify the built index.html exists and has correct content
RUN if [ ! -f dist/index.html ]; then echo "ERROR: dist/index.html not found!" && exit 1; fi && \
    if grep -q "index.tsx" dist/index.html; then echo "ERROR: Built HTML still references index.tsx!" && cat dist/index.html && exit 1; fi && \
    echo "✓ Built index.html verified" && \
    # Copy dist/index.html to root for DirectoryIndex to work
    cp dist/index.html index.html && \
    echo "✓ Copied dist/index.html to root"

# Create necessary directories
RUN mkdir -p data uploads && \
    chown -R www-data:www-data /var/www/html && \
    chmod -R 755 /var/www/html

# Configure Apache
COPY docker/apache-config.conf /etc/apache2/sites-available/000-default.conf

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

# Expose port
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]
















