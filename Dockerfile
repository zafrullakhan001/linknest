# Multi-stage build for LinkNest
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY vite.config.ts vite.docker.config.ts tsconfig.json ./
COPY tailwind.config.js postcss.config.js ./

# Install dependencies
RUN npm ci

# Copy source files
COPY index.html index.tsx index.css ./
COPY components/ ./components/
COPY contexts/ ./contexts/
COPY services/ ./services/
COPY App.tsx ./
COPY types.ts ./

# Build frontend for Docker (base path is /)
ENV NODE_ENV=production
RUN npm run build -- --config vite.docker.config.ts

# Production stage
FROM php:8.2-apache

# Install required PHP extensions and utilities
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    sqlite3 \
    curl \
    && docker-php-ext-install pdo pdo_sqlite \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache modules
RUN a2enmod rewrite headers

# Set working directory
WORKDIR /var/www/html

# Copy PHP files
COPY api/ ./api/
COPY docker/.htaccess ./.htaccess

# Copy built frontend from builder
COPY --from=frontend-builder /app/dist ./dist

# Create necessary directories
RUN mkdir -p data uploads && \
    chown -R www-data:www-data /var/www/html && \
    chmod -R 755 /var/www/html

# Configure Apache
COPY docker/apache-config.conf /etc/apache2/sites-available/000-default.conf

# Set environment variables
ENV APACHE_DOCUMENT_ROOT=/var/www/html
ENV PHP_INI_SCAN_DIR=/usr/local/etc/php/conf.d

# Expose port
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]

