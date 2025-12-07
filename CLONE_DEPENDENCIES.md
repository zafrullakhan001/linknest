# Clone Process Dependencies - Apache & PHP Requirements

## Overview
The clone process performs extensive file operations, database copying, and runs npm commands which can take significant time and resources. This document outlines all required dependencies and configurations.

## PHP Configuration Requirements

### Critical PHP Settings

#### 1. Execution Time Limits
**Required Settings:**
```ini
max_execution_time = 0  ; 0 = unlimited (recommended for CLI)
; OR at least 1800 (30 minutes) for web requests
max_input_time = 300    ; 5 minutes for input processing
```

**Why:** The clone process can take 10-30+ minutes depending on:
- Number of files to copy
- npm install duration
- npm build duration
- Database size

**Location:** `php.ini` (XAMPP: `C:\xampp\php\php.ini`)

#### 2. Memory Limits
**Required Settings:**
```ini
memory_limit = 512M  ; Minimum 512MB, 1GB recommended
```

**Why:** Large file operations, recursive directory copying, and npm operations require significant memory.

**Location:** `php.ini`

#### 3. Enabled Functions (Security Restrictions)
**Required Functions:**
```ini
disable_functions =  ; Must NOT include: exec, popen, pclose, shell_exec, system
```

**Why:** The clone process uses:
- `exec()` - To run npm commands
- `popen()` / `pclose()` - To start background processes on Windows
- `shell_exec()` - May be used for directory operations

**Check if disabled:**
```php
<?php
echo "exec: " . (function_exists('exec') ? 'ENABLED' : 'DISABLED') . "\n";
echo "popen: " . (function_exists('popen') ? 'ENABLED' : 'DISABLED') . "\n";
echo "pclose: " . (function_exists('pclose') ? 'ENABLED' : 'DISABLED') . "\n";
?>
```

**Location:** `php.ini` - Check `disable_functions` directive

#### 4. File System Functions
**Required:**
- `copy()` - File copying
- `mkdir()` - Directory creation
- `scandir()` - Directory listing
- `unlink()` - File deletion
- `rmdir()` - Directory deletion
- `realpath()` - Path resolution
- `file_exists()` - File existence checks
- `is_dir()` - Directory checks

**Why:** All file operations depend on these functions.

#### 5. PDO SQLite Extension
**Required:**
```ini
extension=pdo_sqlite
extension=sqlite3
```

**Why:** Database operations require SQLite PDO support.

**Check if enabled:**
```php
<?php
echo "PDO SQLite: " . (extension_loaded('pdo_sqlite') ? 'ENABLED' : 'DISABLED') . "\n";
?>
```

#### 6. JSON Extension
**Required:**
```ini
extension=json
```

**Why:** Status file operations use JSON encoding/decoding.

#### 7. Error Reporting (For Debugging)
**Recommended:**
```ini
display_errors = Off      ; Off for production
log_errors = On          ; On to log errors
error_log = "C:\xampp\php\logs\php_error.log"
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT
```

**Why:** Helps diagnose clone process failures.

### PHP CLI vs Web Server Configuration

**Important:** The clone process runs via PHP CLI (command line), which uses a different `php.ini` file:

- **Web Server PHP:** `C:\xampp\php\php.ini`
- **CLI PHP:** `C:\xampp\php\php.ini` (usually same file, but check with `php --ini`)

**To check CLI configuration:**
```bash
php --ini
php -i | findstr "max_execution_time"
php -i | findstr "memory_limit"
php -i | findstr "disable_functions"
```

## Apache Configuration Requirements

### 1. Timeout Settings
**Required Settings in `httpd.conf`:**
```apache
Timeout 300              ; 5 minutes (default is usually 60)
KeepAliveTimeout 5       ; Keep connections alive
```

**Why:** Prevents Apache from killing long-running requests.

**Location:** `C:\xampp\apache\conf\httpd.conf`

### 2. Process Management
**Recommended Settings:**
```apache
# For Windows, ensure proper process handling
Win32DisableAcceptEx
```

**Why:** Better process handling on Windows.

### 3. File Permissions
**Required:**
- Apache service user must have **read/write** access to:
  - Source directory (to read files)
  - Target directory (to create clone folder)
  - `api/` directory (to write status files)
  - `data/` directory (if copying database)

**Windows XAMPP:**
- Default user: Usually runs as `SYSTEM` or current user
- Check: Windows Services → Apache → Properties → Log On tab

**To fix permissions:**
1. Right-click target directory → Properties → Security
2. Add Apache service user or `Everyone` (for testing)
3. Grant: **Read & Execute**, **List folder contents**, **Write**

### 4. Directory Indexing (Optional)
```apache
Options -Indexes +FollowSymLinks
```

**Why:** Security - prevents directory listing.

## System Requirements

### 1. Node.js and npm
**Required:**
- Node.js installed and accessible from command line
- npm available in PATH

**Check:**
```bash
node --version
npm --version
```

**Why:** Clone process runs:
- `npm install` - Installs dependencies
- `npm run build` - Builds the application

**If not in PATH:**
- Add Node.js installation directory to Windows PATH
- Or modify `clone_service.php` to use full path to npm

### 2. Disk Space
**Required:**
- At least **2-3x** the size of source directory
- Space for: source files + node_modules + dist build

**Why:** 
- Full directory copy
- npm install creates large `node_modules/` folder
- Build process creates `dist/` folder

### 3. File System
**Required:**
- NTFS or compatible file system
- Support for long file paths (Windows 10+)

**Windows Long Paths:**
- Enable in Windows: Group Policy → Computer Configuration → Administrative Templates → System → Filesystem → Enable Win32 long paths

## Common Issues and Solutions

### Issue 1: Clone Process Freezes/Hangs
**Symptoms:**
- Process starts but never completes
- Status file shows same progress for long time
- Apache becomes unresponsive

**Solutions:**
1. **Check PHP execution time:**
   ```ini
   max_execution_time = 0  ; In php.ini
   ```
   Then restart Apache.

2. **Check if exec/popen are disabled:**
   ```php
   <?php phpinfo(); ?>
   ```
   Search for "disable_functions" - ensure exec, popen are NOT listed.

3. **Check Apache error log:**
   ```
   C:\xampp\apache\logs\error.log
   ```

4. **Check PHP error log:**
   ```
   C:\xampp\php\logs\php_error.log
   ```

5. **Check Windows Event Viewer:**
   - Look for Apache/PHP crashes
   - Check for memory issues

### Issue 2: "npm: command not found"
**Symptoms:**
- Clone fails at "Installing npm dependencies" step
- Error: `npm: command not found`

**Solutions:**
1. Verify Node.js is installed:
   ```bash
   node --version
   ```

2. Add Node.js to PATH:
   - System Properties → Environment Variables
   - Add Node.js installation directory to PATH
   - Restart Apache

3. Or modify `clone_service.php` line 331:
   ```php
   // Find npm executable
   $npmPath = exec('where npm');
   if (empty($npmPath)) {
       $npmPath = 'npm'; // Fallback
   }
   exec($npmPath . ' install 2>&1', $output, $returnVar);
   ```

### Issue 3: Permission Denied Errors
**Symptoms:**
- "Failed to create directory"
- "Permission denied" errors

**Solutions:**
1. Check folder permissions:
   - Right-click target directory → Properties → Security
   - Ensure Apache user has Write permissions

2. Check if folder is locked:
   - Close any file explorers with the folder open
   - Stop any processes using files in the directory

3. Run Apache as Administrator (not recommended for production):
   - Windows Services → Apache → Properties → Log On → Local System account

### Issue 4: Out of Memory Errors
**Symptoms:**
- "Fatal error: Allowed memory size exhausted"
- Clone process crashes

**Solutions:**
1. Increase memory limit:
   ```ini
   memory_limit = 1024M  ; 1GB
   ```

2. Check available system RAM:
   - Ensure at least 2GB free RAM available

3. Close other applications to free memory

### Issue 5: Background Process Not Starting
**Symptoms:**
- Clone status stays "pending"
- No progress updates

**Solutions:**
1. Check Windows command execution:
   ```php
   // Test in PHP
   exec('echo test', $output);
   print_r($output);
   ```

2. Check `popen()` on Windows:
   ```php
   $handle = popen('echo test', 'r');
   if ($handle) {
       echo "popen works";
       pclose($handle);
   }
   ```

3. Verify `clone_worker.php` is accessible:
   - Check file exists: `api/clone_worker.php`
   - Check file permissions

## Recommended XAMPP Configuration

### php.ini Settings
```ini
; Execution
max_execution_time = 0
max_input_time = 300

; Memory
memory_limit = 512M

; Functions (ensure NOT disabled)
; disable_functions =  ; Comment out or remove exec, popen, etc.

; Error logging
display_errors = Off
log_errors = On
error_log = "C:\xampp\php\logs\php_error.log"
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT

; Extensions
extension=pdo_sqlite
extension=sqlite3
extension=json
```

### httpd.conf Settings
```apache
Timeout 300
KeepAliveTimeout 5
```

## Testing Your Configuration

Create a test file `api/test_clone_deps.php`:

```php
<?php
header('Content-Type: text/plain');

echo "=== PHP Configuration ===\n";
echo "max_execution_time: " . ini_get('max_execution_time') . "\n";
echo "memory_limit: " . ini_get('memory_limit') . "\n";
echo "max_input_time: " . ini_get('max_input_time') . "\n";

echo "\n=== Required Functions ===\n";
$functions = ['exec', 'popen', 'pclose', 'copy', 'mkdir', 'scandir', 'unlink', 'rmdir'];
foreach ($functions as $func) {
    echo "$func: " . (function_exists($func) ? 'ENABLED' : 'DISABLED') . "\n";
}

echo "\n=== Extensions ===\n";
echo "PDO SQLite: " . (extension_loaded('pdo_sqlite') ? 'ENABLED' : 'DISABLED') . "\n";
echo "SQLite3: " . (extension_loaded('sqlite3') ? 'ENABLED' : 'DISABLED') . "\n";
echo "JSON: " . (extension_loaded('json') ? 'ENABLED' : 'DISABLED') . "\n";

echo "\n=== System Commands ===\n";
exec('node --version 2>&1', $nodeOutput, $nodeReturn);
echo "Node.js: " . ($nodeReturn === 0 ? implode(' ', $nodeOutput) : 'NOT FOUND') . "\n";

exec('npm --version 2>&1', $npmOutput, $npmReturn);
echo "npm: " . ($npmReturn === 0 ? implode(' ', $npmOutput) : 'NOT FOUND') . "\n";

echo "\n=== File Permissions ===\n";
$testDir = __DIR__ . '/../test_write';
if (@mkdir($testDir, 0755, true)) {
    echo "Write permission: OK\n";
    @rmdir($testDir);
} else {
    echo "Write permission: FAILED\n";
}

echo "\n=== PHP CLI Check ===\n";
$cliIni = shell_exec('php --ini 2>&1');
echo $cliIni;
?>
```

Access via browser: `http://localhost/linknest/api/test_clone_deps.php`

## Quick Fix Checklist

If clone process is freezing, check in order:

1. ✅ PHP `max_execution_time = 0` in `php.ini`
2. ✅ PHP `memory_limit = 512M` or higher
3. ✅ `exec()` and `popen()` NOT in `disable_functions`
4. ✅ Apache `Timeout 300` in `httpd.conf`
5. ✅ Node.js and npm accessible from command line
6. ✅ File permissions: Apache user can write to target directory
7. ✅ Sufficient disk space (2-3x source size)
8. ✅ Check error logs: Apache and PHP error logs
9. ✅ Restart Apache after php.ini changes
10. ✅ Test with `test_clone_deps.php` script

## Additional Notes

- The clone process runs in **background** via `clone_worker.php`
- Status is tracked in `clone_status_{id}.json` files
- Progress is updated in database `clones` table
- On Windows, uses `start /B` command to run in background
- Process can take 10-30+ minutes for large projects
- Monitor via status endpoint: `/api/clone/status/{id}`

