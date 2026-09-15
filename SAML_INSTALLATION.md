# SAML 2.0 Installation Guide

## Prerequisites

SAML 2.0 authentication requires the OneLogin PHP-SAML library. This library must be installed using Composer.

## Installation Steps

### 1. Install Composer (if not already installed)

**Windows (XAMPP):**
- Download Composer from https://getcomposer.org/download/
- Run the Windows installer
- Or download `composer.phar` and place it in your project root

**Linux/Mac:**
```bash
curl -sS https://getcomposer.org/installer | php
```

### 2. Install SAML Dependencies

Navigate to your project root directory and run:

```bash
composer install
```

Or if using `composer.phar`:

```bash
php composer.phar install
```

This will:
- Create a `vendor/` directory
- Install the OneLogin PHP-SAML library
- Set up autoloading

### 3. Verify Installation

After installation, verify that the `vendor/` directory exists and contains:
- `vendor/autoload.php`
- `vendor/onelogin/php-saml/`

### 4. Configure SAML

1. Go to Admin Panel → SAML tab
2. Click "Open SAML Configuration"
3. Configure your Identity Provider (IdP) settings
4. Enable SAML authentication

## Troubleshooting

### Error: "SAML library not installed"

**Solution:** Run `composer install` in the project root directory.

### Error: "Missing vendor/autoload.php"

**Solution:** 
1. Ensure `composer.json` exists in the project root
2. Run `composer install`
3. Verify `vendor/autoload.php` exists

### Error: "OneLogin SAML classes not found"

**Solution:**
1. Check that `vendor/onelogin/php-saml` directory exists
2. Re-run `composer install`
3. Check PHP version (requires PHP 8.0+)

## Production Deployment

When deploying to production:

1. **Include vendor directory:** Ensure the `vendor/` directory is included in your deployment
2. **Or use composer in production:** Run `composer install --no-dev` on the production server
3. **Verify permissions:** Ensure the web server can read files in the `vendor/` directory

## Docker Deployment

If using Docker, add this to your Dockerfile:

```dockerfile
# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader
```

## Manual Installation (Alternative)

If Composer is not available, you can manually download the OneLogin PHP-SAML library:

1. Download from: https://github.com/onelogin/php-saml/releases
2. Extract to `vendor/onelogin/php-saml/`
3. Create `vendor/autoload.php` with appropriate autoloading

However, using Composer is strongly recommended.
