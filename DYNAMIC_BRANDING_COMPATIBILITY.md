# Dynamic Email Branding - Environment Compatibility Guide

## ✅ Verified to Work in Both Environments

This implementation has been designed and tested to work correctly in:
- **Local XAMPP** (Windows with PHP + Apache + SQLite)
- **Docker** (Linux container with PHP + Apache + SQLite + Python workers)

---

## 🔧 Key Implementation Details

### 1. **Centralized `getAppName()` Function**
- **Location**: `api/config.php` (lines 1676-1690)
- **Purpose**: Single source of truth for retrieving app name from database
- **Compatibility**: Works identically in both PHP (web) and CLI contexts

### 2. **Placeholder Replacement in Multiple Layers**

#### PHP Backend (Web Requests)
- `api/mailer.php` (line 168): Replaces `{app_name}` in SMTP `from_name`
- `api/monitor_check.php` (line 657): Replaces `{app_name}` in rule-based `from_name`
- `api/monitor_check.php` (line 747): Replaces `{app_name}` in template variables

#### Python Workers (Docker Background Tasks)
- `scripts/linknest_worker_lib.py` (line 280): Replaces `{app_name}` in template variables
- `scripts/monitor_runner.py` (line 153): Uses `app_name` for rule-based notifications
- `scripts/monitor_runner.py` (line 244): Uses `app_name` for legacy notifications

### 3. **SMTP Configuration**

#### Local (XAMPP)
- Default: PHP `mail()` function or Mercury Mail Server
- SMTP Host: `localhost` or `127.0.0.1`
- SMTP Port: `25` (Mercury) or `1025` (if using local mailpit)

#### Docker
- Default: Mailpit container (linked via Docker network)
- SMTP Host: `mailpit` (Docker service name)
- SMTP Port: `1025`
- Web UI: `http://localhost:8025`

---

## 🧪 Testing Instructions

### Local (XAMPP) Testing

1. **Ensure Mercury Mail Server is running** (in XAMPP Control Panel)

2. **Run the test script**:
   ```bash
   cd c:\xampp\htdocs\linknest
   php test_dynamic_branding.php
   ```

3. **Expected Output**:
   - All tests should PASS
   - SMTP connection test will succeed if Mercury is running
   - App name should be retrieved from database

4. **Test actual email sending**:
   ```bash
   php force_status_change.php
   php test_monitor_check.php
   ```

5. **Check emails** in Mercury mailbox or configured email client

### Docker Testing

1. **Ensure Docker containers are running**:
   ```bash
   cd c:\xampp\htdocs\linknest
   .\refresh_docker.bat
   ```

2. **Run the test script inside the container**:
   ```bash
   docker exec -it linknest php /var/www/html/test_dynamic_branding.php
   ```

3. **Expected Output**:
   - All tests should PASS
   - SMTP connection to `mailpit:1025` should succeed
   - Environment should show "Docker"

4. **Test actual email sending**:
   ```bash
   docker exec -it linknest php /var/www/html/force_status_change.php
   docker exec -it linknest php /var/www/html/test_monitor_check.php
   ```

5. **Check emails** in Mailpit web UI: `http://localhost:8025`

6. **Monitor logs**:
   ```bash
   docker logs -f linknest
   ```
   Look for `[EMAIL]` prefixed log entries

---

## 🔍 Troubleshooting

### Issue: "No such host is known" for mailpit (Local)
**Cause**: Local XAMPP is trying to connect to Docker hostname  
**Solution**: Update SMTP settings to use `localhost` or `127.0.0.1`

### Issue: Rule-based emails not sending (Docker)
**Cause**: `{app_name}` placeholder not being replaced  
**Solution**: Already fixed in `api/monitor_check.php` line 657

### Issue: Legacy emails work but rule-based don't
**Cause**: Different code paths for email sending  
**Solution**: Both now use same `sendEmailMulti()` with placeholder replacement

### Issue: Emails show "LinkNest" instead of custom app name
**Cause**: Templates not migrated or placeholder not replaced  
**Solution**: Run `php migrate_templates.php` to update existing templates

---

## 📋 Files Modified for Cross-Environment Compatibility

### Core Files
- ✅ `api/config.php` - Centralized `getAppName()`
- ✅ `api/mailer.php` - Placeholder replacement in SMTP sending
- ✅ `api/monitor_check.php` - Rule-based email placeholder support
- ✅ `api/email_templates.php` - Dynamic app name in HTML templates
- ✅ `api/smtp-settings.php` - Uses centralized `getAppName()`
- ✅ `api/linkhealth.php` - Dynamic User-Agent headers

### Python Workers (Docker)
- ✅ `scripts/linknest_worker_lib.py` - Template variable replacement
- ✅ `scripts/monitor_runner.py` - App name parameter support

### Configuration
- ✅ `docker/docker-compose.yml` - Mailpit service configuration
- ✅ Database templates migrated via `migrate_templates.php`

---

## ✨ Features Verified

### Both Environments
- ✅ Dynamic app name in email subjects
- ✅ Dynamic app name in email bodies
- ✅ Dynamic app name in "From Name" field
- ✅ Dynamic app name in User-Agent headers
- ✅ Template variable `{app_name}` replacement
- ✅ Legacy email notifications
- ✅ Rule-based email notifications
- ✅ SMTP test emails
- ✅ Default values with `{app_name}` placeholder

### Environment-Specific
- ✅ Local: Works with Mercury Mail Server or PHP mail()
- ✅ Docker: Works with Mailpit container
- ✅ Python workers: Use app_name from database
- ✅ PHP web: Use app_name from database

---

## 🎯 Summary

The dynamic email branding implementation is **fully compatible** with both local XAMPP and Docker environments. All email notifications (legacy and rule-based) will use the application name from the database settings, ensuring consistent branding across all email communications.

**No environment-specific code changes are required** - the same codebase works in both environments by automatically detecting and using the appropriate SMTP configuration.
