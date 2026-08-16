<?php
/**
 * Clone Service - PHP implementation of clone-linknest.bat
 * Handles cloning LinkNest instances with progress tracking
 */

require_once __DIR__ . '/config.php';

/**
 * Message shown when folder clone is blocked in Docker or WSL.
 */
function linknestCloneUnavailableMessage(): string
{
    return 'Clone is not available in WSL. Use a host filesystem install or Docker.';
}

/**
 * Directory where Docker folder clones are written (sibling of html, not DocumentRoot).
 */
function linknestCloneDockerInstancesRoot(): string
{
    return '/var/www/clones';
}

/**
 * Public browser URL for a clone folder.
 * Docker publishes 8090/8443; Apache inside the container listens on 80/443.
 */
function linknestClonePublicUrl(string $folderName): string
{
    $folderName = trim($folderName, "/\\");
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((string) ($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $protocol = $https ? 'https' : 'http';
    $host = trim((string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    if (strpos($host, ':') === false && function_exists('linknestCloneIsDocker') && linknestCloneIsDocker()) {
        $host .= $https ? ':8443' : ':8090';
    }
    return $protocol . '://' . $host . '/' . $folderName . '/';
}

/**
 * Prefer a Docker-reachable URL when the stored value is host-style (no published port).
 */
function linknestRewriteDockerCloneUrl(string $url, string $folderName): string
{
    $public = linknestClonePublicUrl($folderName);
    if ($folderName === '') {
        return $url;
    }
    if ($url === '') {
        return $public;
    }
    if (!function_exists('linknestCloneIsDocker') || !linknestCloneIsDocker()) {
        return $url;
    }
    $parsed = parse_url($url);
    $host = strtolower((string) ($parsed['host'] ?? ''));
    $port = $parsed['port'] ?? null;
    if (($host === 'localhost' || $host === '127.0.0.1') && $port === null) {
        return $public;
    }
    return $url;
}

/**
 * Folder names that must not be used for clones (main-app URL prefixes).
 *
 * @return list<string>
 */
function linknestCloneReservedFolderNames(): array
{
    $names = function_exists('linknestReservedUrlSegments')
        ? linknestReservedUrlSegments()
        : ['api', 'uploads', 'dist', 'assets', 'node_modules', 'vendor', 'public', 'data', 'bin', 'scripts', 'docs'];
    $names = array_merge($names, [
        'html', 'clones', 'apache', 'favicon.ico', 'index.php', 'index.html',
        'components', 'contexts', 'services', 'hooks', 'utils', 'land', 'extensions',
    ]);
    $out = [];
    foreach ($names as $name) {
        $key = strtolower((string) $name);
        if ($key !== '') {
            $out[$key] = $key;
        }
    }
    return array_values($out);
}

/**
 * True when this PHP process is running inside a container.
 * Checked before WSL because Docker Desktop kernels often contain "microsoft".
 */
function linknestCloneIsDocker(): bool
{
    if (getenv('LINKNEST_DOCKER') === '1' || getenv('SSH_GATEWAY_DOCKER') === '1') {
        return true;
    }
    if (is_file('/.dockerenv')) {
        return true;
    }
    if (is_readable('/proc/1/cgroup')) {
        $cgroup = @file_get_contents('/proc/1/cgroup');
        if (is_string($cgroup) && $cgroup !== '' && (
            stripos($cgroup, 'docker') !== false
            || stripos($cgroup, 'containerd') !== false
            || stripos($cgroup, 'kubepods') !== false
        )) {
            return true;
        }
    }
    return false;
}

/**
 * True when PHP is running in WSL (not Windows XAMPP, not a Docker container).
 */
function linknestCloneIsWsl(): bool
{
    if (defined('PHP_OS_FAMILY') && PHP_OS_FAMILY === 'Windows') {
        return false;
    }
    if (getenv('WSL_DISTRO_NAME') || getenv('WSL_INTEROP') || getenv('WSLENV')) {
        return true;
    }
    $release = php_uname('r');
    if (stripos($release, 'microsoft') !== false || stripos($release, 'WSL') !== false) {
        return true;
    }
    if (is_readable('/proc/version')) {
        $version = @file_get_contents('/proc/version');
        if (is_string($version) && $version !== '' && (
            stripos($version, 'microsoft') !== false
            || stripos($version, 'WSL') !== false
        )) {
            return true;
        }
    }
    return false;
}

/**
 * Detect whether clone may run on this install.
 *
 * @return array{runtime: string, cloneAllowed: bool, message: string|null}
 */
function linknestGetCloneRuntimeEnvironment(): array
{
    $unavailable = linknestCloneUnavailableMessage();

    if (linknestCloneIsWsl()) {
        $nodeBin = trim((string) @shell_exec('command -v node 2>/dev/null'));
        $npmBin = trim((string) @shell_exec('command -v npm 2>/dev/null'));
        $clonesRoot = linknestCloneDockerInstancesRoot();
        $writable = is_dir($clonesRoot) && is_writable($clonesRoot);
        if ($nodeBin === '' || $npmBin === '') {
            return [
                'runtime' => 'docker',
                'cloneAllowed' => false,
                'message' => 'Clone in Docker needs Node.js/npm in the image. Redeploy with the current Dockerfile, then try again.',
            ];
        }
        if (!$writable) {
            return [
                'runtime' => 'docker',
                'cloneAllowed' => false,
                'message' => 'Clone in Docker needs a writable ' . $clonesRoot . ' directory.',
            ];
        }
        return [
            'runtime' => 'docker',
            'cloneAllowed' => true,
            'message' => null,
        ];
    }

    if (linknestCloneIsWsl()) {
        return [
            'runtime' => 'wsl',
            'cloneAllowed' => false,
            'message' => $unavailable,
        ];
    }

    return [
        'runtime' => 'host',
        'cloneAllowed' => true,
        'message' => null,
    ];
}

/**
 * Allowed Clone Instance presets.
 *
 * @return list<string>
 */
function linknestClonePresetIds(): array
{
    return ['empty', 'structure', 'full', 'demo'];
}

/**
 * Resolve a clone preset from the API payload or legacy copy checkboxes.
 */
function linknestNormalizeClonePreset($preset, $copyAssets = false, $copyDatabase = false): string
{
    $preset = is_string($preset) ? strtolower(trim($preset)) : '';
    if (in_array($preset, linknestClonePresetIds(), true)) {
        return $preset;
    }
    if ($copyDatabase && $copyAssets) {
        return 'full';
    }
    if ($copyDatabase) {
        return 'structure';
    }
    return 'empty';
}

/**
 * Copy / sanitize flags for a clone preset.
 *
 * @return array{copyAssets: bool, copyDatabase: bool, copyAllUploads: bool, sanitizeStructure: bool, runDemo: bool}
 */
function linknestClonePresetOptions(string $preset): array
{
    switch (linknestNormalizeClonePreset($preset)) {
        case 'full':
            return [
                'copyAssets' => true,
                'copyDatabase' => true,
                'copyAllUploads' => true,
                'sanitizeStructure' => false,
                'runDemo' => false,
            ];
        case 'structure':
            return [
                'copyAssets' => true,
                'copyDatabase' => true,
                'copyAllUploads' => true,
                'sanitizeStructure' => true,
                'runDemo' => false,
            ];
        case 'demo':
            return [
                'copyAssets' => false,
                'copyDatabase' => false,
                'copyAllUploads' => false,
                'sanitizeStructure' => false,
                'runDemo' => true,
            ];
        case 'empty':
        default:
            return [
                'copyAssets' => false,
                'copyDatabase' => false,
                'copyAllUploads' => false,
                'sanitizeStructure' => false,
                'runDemo' => false,
            ];
    }
}

class CloneService {
    private $db;
    private $cloneId;
    private $statusFile;
    private $traceLogFile;
    private $startTime;
    
    public function __construct($cloneId = null, $enableTraceLog = true) {
        $this->db = getDB();
        $this->cloneId = $cloneId;
        $this->startTime = microtime(true);
        $this->statusFile = null;
        $this->traceLogFile = null;
        if ($cloneId) {
            $this->statusFile = __DIR__ . '/../clone_status_' . $cloneId . '.json';
            // Only enable trace logging if requested (set to false when just reading status)
            if ($enableTraceLog) {
                $this->traceLogFile = __DIR__ . '/../clone_trace_' . $cloneId . '.log';
                // Initialize trace log
                $this->writeTraceLog("=== CLONE PROCESS STARTED ===");
                $this->writeTraceLog("Clone ID: $cloneId");
                $this->writeTraceLog("Start Time: " . date('Y-m-d H:i:s'));
                $this->writeTraceLog("PHP Version: " . PHP_VERSION);
                $this->writeTraceLog("Memory Limit: " . ini_get('memory_limit'));
                $this->writeTraceLog("Max Execution Time: " . ini_get('max_execution_time'));
                $this->writeTraceLog("Current Memory Usage: " . $this->formatBytes(memory_get_usage(true)));
                $this->writeTraceLog("Peak Memory Usage: " . $this->formatBytes(memory_get_peak_usage(true)));
            }
        }
        $this->prepareCloneDbConnection();
    }

    private function prepareCloneDbConnection(): void
    {
        if (!$this->db) {
            return;
        }
        try {
            $this->db->exec('PRAGMA busy_timeout = 15000');
            $this->db->setAttribute(PDO::ATTR_TIMEOUT, 15);
        } catch (Throwable $e) {
            // Connection still usable; retries handle SQLITE_BUSY.
        }
    }

    private function cloneDbExecute(PDOStatement $stmt, array $params): bool
    {
        $delayUs = 50000;
        $last = null;
        for ($attempt = 1; $attempt <= 8; $attempt++) {
            try {
                return $stmt->execute($params);
            } catch (PDOException $e) {
                $last = $e;
                $msg = $e->getMessage();
                $busy = stripos($msg, 'database is locked') !== false
                    || stripos($msg, 'SQLITE_BUSY') !== false;
                if (!$busy || $attempt === 8) {
                    throw $e;
                }
                $this->writeTraceLog("SQLite busy on attempt $attempt, retrying: $msg", 'WARNING');
                usleep($delayUs);
                $delayUs = min($delayUs * 2, 500000);
            }
        }
        if ($last) {
            throw $last;
        }
        return false;
    }
    
    /**
     * Write detailed trace log to file and error_log
     */
    private function writeTraceLog($message, $level = 'INFO') {
        $timestamp = date('Y-m-d H:i:s.v');
        $elapsed = $this->startTime ? number_format(microtime(true) - $this->startTime, 3) : '0.000';
        $memory = $this->formatBytes(memory_get_usage(true));
        $logMessage = "[$timestamp] [$elapsed s] [$memory] [$level] $message";
        
        // Write to trace log file
        if ($this->traceLogFile) {
            @file_put_contents($this->traceLogFile, $logMessage . "\n", FILE_APPEND | LOCK_EX);
        }
        
        // Also write to error_log
        error_log("CloneService[{$this->cloneId}]: $message");
    }
    
    /**
     * Normalize host for clone URL (fix common typos like locahost -> localhost).
     * @param string $host HTTP_HOST or URL host part
     * @return string Normalized host
     */
    private function normalizeCloneHost($host) {
        $host = trim($host);
        if (strpos($host, ':') !== false) {
            $parts = explode(':', $host, 2);
            $parts[0] = $this->normalizeCloneHost($parts[0]);
            return $parts[0] . ':' . $parts[1];
        }
        $typos = ['locahost' => 'localhost', 'localhos' => 'localhost', 'localhot' => 'localhost', '127.0.0.1' => 'localhost'];
        $lower = strtolower($host);
        return $typos[$lower] ?? $host;
    }

    /**
     * Rebuild URL from parse_url() result (with optional path normalization).
     * @param array $parsed Result of parse_url()
     * @return string URL
     */
    private function buildUrlFromParsed(array $parsed) {
        $scheme = $parsed['scheme'] ?? 'http';
        $host = $parsed['host'] ?? '';
        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
        $path = isset($parsed['path']) ? $parsed['path'] : '/';
        $path = rtrim($path, '/') . '/';
        return $scheme . '://' . $host . $port . $path;
    }

    /**
     * Format bytes to human readable format
     */
    private function formatBytes($bytes, $precision = 2) {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= pow(1024, $pow);
        return round($bytes, $precision) . ' ' . $units[$pow];
    }
    
    /**
     * Get encryption key for a specific database path
     * This allows us to decrypt/encrypt passwords for different database instances
     */
    private function getEncryptionKeyForDb($dbPath) {
        $salt = 'linknest_ldap_encryption_salt_v1';
        $keySource = $dbPath . $salt;
        return hash('sha256', $keySource, true); // Returns 32 bytes for AES-256
    }
    
    /**
     * Decrypt a password using a specific database path's encryption key
     */
    private function decryptPasswordForDb($encryptedPassword, $dbPath) {
        if (empty($encryptedPassword)) {
            return '';
        }
        
        // Handle plain text passwords (for backward compatibility)
        // Encrypted passwords have exactly 2 dots in format: base64(iv).base64(tag).base64(encrypted)
        if (strpos($encryptedPassword, '.') === false || substr_count($encryptedPassword, '.') !== 2) {
            // This is plain text, return as-is
            return $encryptedPassword;
        }
        
        $parts = explode('.', $encryptedPassword, 3);
        if (count($parts) !== 3) {
            throw new Exception('Invalid encrypted password format - expected 3 parts separated by dots');
        }
        
        $iv = base64_decode($parts[0], true);
        $tag = base64_decode($parts[1], true);
        $encrypted = base64_decode($parts[2], true);
        
        if ($iv === false || $tag === false || $encrypted === false) {
            throw new Exception('Invalid base64 encoding in encrypted password parts');
        }
        
        if (empty($iv) || empty($tag) || empty($encrypted)) {
            throw new Exception('One or more encrypted password parts are empty after base64 decoding');
        }
        
        $key = $this->getEncryptionKeyForDb($dbPath);
        if (empty($key) || strlen($key) !== 32) {
            throw new Exception('Invalid encryption key generated (expected 32 bytes)');
        }
        
        $decrypted = openssl_decrypt(
            $encrypted,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        
        if ($decrypted === false) {
            throw new Exception('Decryption failed - invalid key or corrupted data. Database path: ' . $dbPath);
        }
        
        return $decrypted;
    }
    
    /**
     * Encrypt a password using a specific database path's encryption key
     */
    private function encryptPasswordForDb($password, $dbPath) {
        if (empty($password)) {
            return '';
        }
        
        $key = $this->getEncryptionKeyForDb($dbPath);
        $ivLength = openssl_cipher_iv_length('aes-256-gcm');
        $iv = openssl_random_pseudo_bytes($ivLength);
        
        $tag = '';
        $encrypted = openssl_encrypt(
            $password,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        
        if ($encrypted === false) {
            throw new Exception('Encryption failed');
        }
        
        // Return: base64(iv) . '.' . base64(tag) . '.' . base64(encrypted)
        return base64_encode($iv) . '.' . base64_encode($tag) . '.' . base64_encode($encrypted);
    }
    
    /**
     * Update progress and log message
     */
    private function updateProgress($step, $progress, $message, $logs = []) {
        $progress = (int) round(max(0, min(100, (float) $progress)));
        $this->writeTraceLog("PROGRESS UPDATE: Step=$step, Progress=$progress%, Message=$message", 'PROGRESS');
        
        $status = [
            'step' => $step,
            'progress' => $progress,
            'message' => $message,
            'logs' => $logs,
            'timestamp' => time(),
            'memory_usage' => $this->formatBytes(memory_get_usage(true)),
            'peak_memory' => $this->formatBytes(memory_get_peak_usage(true)),
            'elapsed_time' => $this->startTime ? number_format(microtime(true) - $this->startTime, 2) : '0.00'
        ];
        
        // Save to status file
        if ($this->statusFile) {
            $result = @file_put_contents($this->statusFile, json_encode($status, JSON_PRETTY_PRINT), LOCK_EX);
            if ($result === false) {
                $this->writeTraceLog("WARNING: Failed to write status file: $this->statusFile", 'WARNING');
            } else {
                $this->writeTraceLog("Status file updated: " . strlen(json_encode($status)) . " bytes written", 'DEBUG');
            }
        }
        
        // Update database
        if ($this->cloneId) {
            try {
                $stmt = $this->db->prepare('UPDATE clones SET status = ?, progress = ?, error_message = ? WHERE id = ?');
                $errorMsg = ($step === 'error') ? $message : null;
                $statusValue = ($step === 'error') ? 'failed' : (($step === 'complete') ? 'completed' : 'running');
                $this->cloneDbExecute($stmt, [$statusValue, $progress, $errorMsg, $this->cloneId]);
                $this->writeTraceLog("Database updated: status=$statusValue, progress=$progress", 'DEBUG');
            } catch (PDOException $e) {
                $this->writeTraceLog("ERROR: Failed to update clone progress in database: " . $e->getMessage(), 'ERROR');
                $this->writeTraceLog("SQL State: " . $e->getCode(), 'ERROR');
                $this->writeTraceLog("Stack trace: " . $e->getTraceAsString(), 'ERROR');
                error_log('Failed to update clone progress: ' . $e->getMessage());
            }
        }
    }
    
    /**
     * Add log message
     */
    private function addLog($message, $logs = []) {
        $this->writeTraceLog($message, 'LOG');
        
        // Keep only last 100 logs to avoid memory issues
        $logs[] = [
            'time' => date('Y-m-d H:i:s'),
            'message' => $message
        ];
        if (count($logs) > 100) {
            $logs = array_slice($logs, -100);
        }
        return $logs;
    }
    
    /**
     * Recursively copy directory
     */
    private function copyDirectory($source, $dest, $logs = []) {
        $this->writeTraceLog("copyDirectory: Source=$source, Dest=$dest", 'DEBUG');
        
        if (!is_dir($source)) {
            $this->writeTraceLog("ERROR: Source is not a directory: $source", 'ERROR');
            return $logs;
        }
        
        if (!is_dir($dest)) {
            $this->writeTraceLog("Creating directory: $dest", 'DEBUG');
            if (!mkdir($dest, 0755, true)) {
                $error = error_get_last();
                $this->writeTraceLog("ERROR: Failed to create directory: $dest - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
                $logs = $this->addLog("ERROR: Failed to create directory: $dest", $logs);
                return $logs;
            }
            $this->writeTraceLog("Directory created successfully: $dest", 'DEBUG');
        }
        
        $this->writeTraceLog("Scanning directory: $source", 'DEBUG');
        $files = scandir($source);
        if ($files === false) {
            $error = error_get_last();
            $this->writeTraceLog("ERROR: Failed to scan directory: $source - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
            return $logs;
        }
        
        $fileCount = 0;
        $dirCount = 0;
        $errorCount = 0;
        
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            
            $srcFile = $source . DIRECTORY_SEPARATOR . $file;
            $destFile = $dest . DIRECTORY_SEPARATOR . $file;
            
            if (is_dir($srcFile)) {
                $dirCount++;
                $this->writeTraceLog("Copying subdirectory: $file", 'DEBUG');
                $logs = $this->copyDirectory($srcFile, $destFile, $logs);
            } else {
                $fileCount++;
                $fileSize = filesize($srcFile);
                $this->writeTraceLog("Copying file: $file (" . $this->formatBytes($fileSize) . ")", 'DEBUG');
                $copyStart = microtime(true);
                if (!copy($srcFile, $destFile)) {
                    $errorCount++;
                    $error = error_get_last();
                    $this->writeTraceLog("WARNING: Failed to copy file: $file - " . ($error['message'] ?? 'Unknown error'), 'WARNING');
                    $logs = $this->addLog("WARNING: Failed to copy file: $file", $logs);
                } else {
                    $copyTime = number_format((microtime(true) - $copyStart) * 1000, 2);
                    $this->writeTraceLog("File copied successfully: $file (took {$copyTime}ms)", 'DEBUG');
                }
            }
        }
        
        $this->writeTraceLog("copyDirectory completed: $fileCount files, $dirCount directories, $errorCount errors", 'DEBUG');
        return $logs;
    }
    
    /**
     * Execute clone operation
     */
    public function executeClone($folderName, $sourcePath, $targetPath, $copyAssets, $copyDatabase, $createdBy = null, $preset = null) {
        $preset = linknestNormalizeClonePreset($preset, $copyAssets, $copyDatabase);
        $presetOpts = linknestClonePresetOptions($preset);
        $copyAssets = $presetOpts['copyAssets'];
        $copyDatabase = $presetOpts['copyDatabase'];

        $this->writeTraceLog("=== EXECUTE CLONE STARTED ===", 'INFO');
        $this->writeTraceLog("Parameters: folderName=$folderName, sourcePath=$sourcePath, targetPath=$targetPath", 'INFO');
        $this->writeTraceLog("Preset: $preset", 'INFO');
        $this->writeTraceLog("Options: copyAssets=" . ($copyAssets ? 'true' : 'false') . ", copyDatabase=" . ($copyDatabase ? 'true' : 'false') . ", copyAllUploads=" . ($presetOpts['copyAllUploads'] ? 'true' : 'false'), 'INFO');
        $this->writeTraceLog("Created by user ID: " . ($createdBy ?? 'null'), 'INFO');

        $runtimeEnv = linknestGetCloneRuntimeEnvironment();
        $this->writeTraceLog("Runtime environment: " . $runtimeEnv['runtime'] . ", cloneAllowed=" . ($runtimeEnv['cloneAllowed'] ? 'true' : 'false'), 'INFO');
        if (!$runtimeEnv['cloneAllowed']) {
            $blocked = $runtimeEnv['message'] ?? linknestCloneUnavailableMessage();
            $this->writeTraceLog("ERROR: Clone blocked on runtime " . $runtimeEnv['runtime'] . ": $blocked", 'ERROR');
            $logs = $this->addLog("ERROR: $blocked", []);
            $this->updateProgress('error', 0, $blocked, $logs);
            if ($this->cloneId) {
                try {
                    $stmt = $this->db->prepare('UPDATE clones SET status = ?, error_message = ? WHERE id = ?');
                    $stmt->execute(['failed', $blocked, $this->cloneId]);
                } catch (PDOException $dbError) {
                    $this->writeTraceLog("ERROR: Failed to update database with runtime block: " . $dbError->getMessage(), 'ERROR');
                }
            }
            throw new Exception($blocked);
        }
        
        // Get URL from database early (use stored URL instead of generating)
        $url = null;
        if ($this->cloneId) {
            $this->writeTraceLog("Retrieving URL from database", 'DEBUG');
            try {
                $stmt = $this->db->prepare('SELECT url FROM clones WHERE id = ?');
                $stmt->execute([$this->cloneId]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($result && !empty($result['url'])) {
                    $url = $result['url'];
                    $this->writeTraceLog("Retrieved URL from database: $url", 'INFO');
                } else {
                    $this->writeTraceLog("WARNING: No URL found in database, will generate default", 'WARNING');
                }
            } catch (PDOException $e) {
                $this->writeTraceLog("ERROR: Failed to retrieve URL from database: " . $e->getMessage(), 'ERROR');
            }
        }
        
        // Fallback to default URL generation if not found
        if (!$url) {
            $url = function_exists('linknestClonePublicUrl')
                ? linknestClonePublicUrl($folderName)
                : (( (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http')
                    . '://' . $this->normalizeCloneHost($_SERVER['HTTP_HOST'] ?? 'localhost') . "/$folderName/");
            $this->writeTraceLog("Using generated default URL: $url", 'INFO');
        } else {
            // Normalize host in stored URL (fix typos like locahost -> localhost)
            $parsed = parse_url($url);
            if (!empty($parsed['host'])) {
                $fixedHost = $this->normalizeCloneHost($parsed['host']);
                $parsed['host'] = $fixedHost;
                $url = $this->buildUrlFromParsed($parsed);
                $this->writeTraceLog("Normalized URL from database: $url", 'INFO');
            }
        }
        
        $logs = [];
        $logs = $this->addLog("Starting clone operation for: $folderName", $logs);
        
        try {
            // Step 1: Validate and prepare paths
            $this->writeTraceLog("STEP 1: Validating paths", 'INFO');
            $this->updateProgress('validating', 5, 'Validating paths...', $logs);
            
            $this->writeTraceLog("Resolving source path: $sourcePath", 'DEBUG');
            $realSourcePath = realpath($sourcePath);
            if (!$realSourcePath || !is_dir($realSourcePath)) {
                $this->writeTraceLog("ERROR: Source path does not exist or is not a directory: $sourcePath", 'ERROR');
                throw new Exception("Source path does not exist: $sourcePath");
            }
            $this->writeTraceLog("Source path resolved: $realSourcePath", 'INFO');
            
            $packageJsonPath = $realSourcePath . '/package.json';
            $this->writeTraceLog("Checking for package.json: $packageJsonPath", 'DEBUG');
            if (!file_exists($packageJsonPath)) {
                $this->writeTraceLog("ERROR: package.json not found at: $packageJsonPath", 'ERROR');
                throw new Exception("Source directory is not a valid LinkNest installation (package.json not found)");
            }
            $this->writeTraceLog("package.json found", 'DEBUG');
            
            $this->writeTraceLog("Resolving target path: $targetPath", 'DEBUG');
            $realTargetPath = realpath($targetPath);
            if (!$realTargetPath || !is_dir($realTargetPath)) {
                $this->writeTraceLog("ERROR: Target path does not exist or is not a directory: $targetPath", 'ERROR');
                throw new Exception("Target path does not exist: $targetPath");
            }
            $this->writeTraceLog("Target path resolved: $realTargetPath", 'INFO');
            
            $targetDir = $realTargetPath . DIRECTORY_SEPARATOR . $folderName;
            $this->writeTraceLog("Target directory will be: $targetDir", 'INFO');
            $logs = $this->addLog("Source: $realSourcePath", $logs);
            $logs = $this->addLog("Target: $targetDir", $logs);
            
            // Check if target exists and remove if needed
            $this->writeTraceLog("Checking if target directory exists: $targetDir", 'DEBUG');
            if (is_dir($targetDir)) {
                $this->writeTraceLog("WARNING: Target folder already exists, will remove it", 'WARNING');
                $logs = $this->addLog("WARNING: Target folder already exists, removing...", $logs);
                $this->updateProgress('preparing', 8, 'Removing existing folder...', $logs);
                
                $deleteStart = microtime(true);
                $this->writeTraceLog("Starting directory deletion: $targetDir", 'INFO');
                $this->deleteDirectory($targetDir);
                $deleteTime = number_format(microtime(true) - $deleteStart, 2);
                $this->writeTraceLog("Directory deletion completed in {$deleteTime}s", 'INFO');
                $logs = $this->addLog("Existing folder removed", $logs);
            } else {
                $this->writeTraceLog("Target directory does not exist, will create it", 'DEBUG');
            }
            
            // Step 2: Create target directory
            $this->writeTraceLog("STEP 2: Creating target directory", 'INFO');
            $this->updateProgress('creating', 10, 'Creating target directory...', $logs);
            $this->writeTraceLog("Creating directory: $targetDir with permissions 0755", 'DEBUG');
            if (!mkdir($targetDir, 0755, true)) {
                $error = error_get_last();
                $this->writeTraceLog("ERROR: Failed to create target directory: $targetDir - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
                throw new Exception("Failed to create target directory: $targetDir");
            }
            $this->writeTraceLog("Target directory created successfully", 'INFO');
            $logs = $this->addLog("Target directory created", $logs);
            
            // Step 3: Copy files
            $this->writeTraceLog("STEP 3: Copying files", 'INFO');
            $this->updateProgress('copying', 15, 'Copying files...', $logs);
            $logs = $this->addLog("Copying root files...", $logs);
            
            // Files to copy
            $this->writeTraceLog("Preparing list of root files to copy", 'DEBUG');
            $filesToCopy = [
                'package.json',
                'package-lock.json',
                'tsconfig.json',
                'vite.config.ts',
                'vite.docker.config.ts',
                'vite.runtime.config.ts',
                'tailwind.config.js',
                'postcss.config.js',
                'index.html',
                'index.tsx',
                'index.css',
                'App.tsx',
                'types.ts',
                'novnc.d.ts',
                'index.vite.html',
                'router.php',
                'landing.php',
                'sw-cache-first.php',
                '.htaccess',
                '.gitignore',
                'README.md',
                'BUNDLE_DEPLOYMENT_GUIDE.md',
                'bulk-import-template.csv',
                'section-links-import-template.csv',
                'staging-ai-import-template.csv',
                'staging-ai-prompt-guide.md',
                'metadata.json',
                'AGENTS.md',
                'package-for-deployment.bat',
                'redeploy-docker.bat',
                'redeploy-docker.sh'
            ];
            
            $copiedCount = 0;
            $skippedCount = 0;
            $failedCount = 0;
            $this->writeTraceLog("Starting to copy " . count($filesToCopy) . " root files", 'INFO');
            
            foreach ($filesToCopy as $file) {
                $srcFile = $realSourcePath . DIRECTORY_SEPARATOR . $file;
                if (file_exists($srcFile)) {
                    $destFile = $targetDir . DIRECTORY_SEPARATOR . $file;
                    $fileSize = filesize($srcFile);
                    $this->writeTraceLog("Copying root file: $file (" . $this->formatBytes($fileSize) . ")", 'DEBUG');
                    $copyStart = microtime(true);
                    if (copy($srcFile, $destFile)) {
                        $copiedCount++;
                        $copyTime = number_format((microtime(true) - $copyStart) * 1000, 2);
                        $this->writeTraceLog("Root file copied: $file (took {$copyTime}ms)", 'DEBUG');
                    } else {
                        $failedCount++;
                        $error = error_get_last();
                        $this->writeTraceLog("WARNING: Failed to copy root file: $file - " . ($error['message'] ?? 'Unknown error'), 'WARNING');
                        $logs = $this->addLog("WARNING: Failed to copy $file", $logs);
                    }
                } else {
                    $skippedCount++;
                    $this->writeTraceLog("Skipping root file (not found): $file", 'DEBUG');
                }
            }
            $this->writeTraceLog("Root files copy completed: $copiedCount copied, $skippedCount skipped, $failedCount failed", 'INFO');
            $logs = $this->addLog("Copied $copiedCount root files", $logs);

            if (linknestCloneIsDocker()) {
                $viteHtml = $realSourcePath . DIRECTORY_SEPARATOR . 'index.vite.html';
                if (is_file($viteHtml)) {
                    @copy($viteHtml, $targetDir . DIRECTORY_SEPARATOR . 'index.html');
                    $logs = $this->addLog('Restored Vite source index.html for Docker clone build', $logs);
                }
                $this->writeDockerCloneHtaccess($targetDir, $folderName);
                $logs = $this->addLog('Wrote subdirectory .htaccess for /' . $folderName . '/', $logs);
            }
            
            // Copy directories
            $this->writeTraceLog("Starting to copy directories", 'INFO');
            // Include utils (frontend helpers) and public (static JS / SW assets)
            $directories = ['api', 'analytics', 'bin', 'components', 'config', 'contexts', 'hooks', 'migrations', 'services', 'src', 'utils', 'public', 'docker', 'docs', 'land'];
            $this->writeTraceLog("Directories to copy: " . implode(', ', $directories), 'DEBUG');
            
            foreach ($directories as $index => $dir) {
                $srcDir = $realSourcePath . DIRECTORY_SEPARATOR . $dir;
                $this->writeTraceLog("Processing directory: $dir", 'INFO');
                if (is_dir($srcDir)) {
                    $logs = $this->addLog("Copying $dir directory...", $logs);
                    $destDir = $targetDir . DIRECTORY_SEPARATOR . $dir;
                    $dirCopyStart = microtime(true);
                    $logs = $this->copyDirectory($srcDir, $destDir, $logs);
                    $dirCopyTime = number_format(microtime(true) - $dirCopyStart, 2);
                    $this->writeTraceLog("Directory copy completed: $dir (took {$dirCopyTime}s)", 'INFO');
                    $progress = 15 + (20 * ($index + 1) / count($directories));
                    $this->updateProgress('copying', $progress, "Copying $dir...", $logs);
                } else {
                    $this->writeTraceLog("Skipping directory (not found): $dir", 'DEBUG');
                }
            }
            
            // Create required directories
            $requiredDirs = ['data', 'uploads', 'scripts'];
            foreach ($requiredDirs as $dir) {
                $dirPath = $targetDir . DIRECTORY_SEPARATOR . $dir;
                if (!is_dir($dirPath)) {
                    mkdir($dirPath, 0755, true);
                    $logs = $this->addLog("Created $dir directory", $logs);
                }
            }

            $this->updateProgress('configuring', 36, 'Isolating session cookies...', $logs);
            $logs = $this->writeInstallIsolation($targetDir, $folderName, $url, $logs);
            
            // Copy scripts
            $scriptsDir = $realSourcePath . DIRECTORY_SEPARATOR . 'scripts';
            if (is_dir($scriptsDir)) {
                $logs = $this->addLog("Copying scripts...", $logs);
                $targetScriptsDir = $targetDir . DIRECTORY_SEPARATOR . 'scripts';
                // Copy entire scripts directory to ensure Python workers (*.py) and other helper scripts are included
                $scriptsCopyStart = microtime(true);
                $logs = $this->copyDirectory($scriptsDir, $targetScriptsDir, $logs);
                $scriptsCopyTime = number_format(microtime(true) - $scriptsCopyStart, 2);
                $logs = $this->addLog("Scripts copied (took {$scriptsCopyTime}s)", $logs);
            }
            
            // Copy uploads: full/structure copy the whole folder; legacy logo-only when copyAssets without all-uploads
            if ($presetOpts['copyAllUploads'] || $copyAssets) {
                $this->writeTraceLog("STEP: Copying uploads", 'INFO');
                $logs = $this->addLog($presetOpts['copyAllUploads'] ? 'Copying all uploads...' : 'Copying branding assets...', $logs);
                $uploadsDir = $realSourcePath . DIRECTORY_SEPARATOR . 'uploads';
                $targetUploadsDir = $targetDir . DIRECTORY_SEPARATOR . 'uploads';
                
                $this->writeTraceLog("Source uploads directory: $uploadsDir", 'DEBUG');
                $this->writeTraceLog("Target uploads directory: $targetUploadsDir", 'DEBUG');
                
                if (is_dir($uploadsDir)) {
                    if ($presetOpts['copyAllUploads']) {
                        $logs = $this->copyDirectory($uploadsDir, $targetUploadsDir, $logs);
                        $logs = $this->addLog("Copied uploads directory", $logs);
                    } else {
                        $this->writeTraceLog("Uploads directory exists, searching for asset files", 'DEBUG');
                        $logoFiles = glob($uploadsDir . DIRECTORY_SEPARATOR . 'logo_*.*') ?: [];
                        $faviconFiles = glob($uploadsDir . DIRECTORY_SEPARATOR . 'favicon_*.*') ?: [];
                        
                        $this->writeTraceLog("Found " . count($logoFiles) . " logo files and " . count($faviconFiles) . " favicon files", 'INFO');
                        
                        $assetCount = 0;
                        foreach (array_merge($logoFiles, $faviconFiles) as $assetFile) {
                            $destAsset = $targetUploadsDir . DIRECTORY_SEPARATOR . basename($assetFile);
                            $assetSize = filesize($assetFile);
                            $this->writeTraceLog("Copying asset: " . basename($assetFile) . " (" . $this->formatBytes($assetSize) . ")", 'DEBUG');
                            if (copy($assetFile, $destAsset)) {
                                $assetCount++;
                                $this->writeTraceLog("Asset copied: " . basename($assetFile), 'DEBUG');
                            } else {
                                $error = error_get_last();
                                $this->writeTraceLog("WARNING: Failed to copy asset: " . basename($assetFile) . " - " . ($error['message'] ?? 'Unknown error'), 'WARNING');
                            }
                        }
                        $this->writeTraceLog("Asset copy completed: $assetCount files copied", 'INFO');
                        $logs = $this->addLog("Copied $assetCount asset files", $logs);
                    }
                } else {
                    $this->writeTraceLog("Uploads directory not found: $uploadsDir", 'DEBUG');
                }
            } else {
                $this->writeTraceLog("Upload copy not requested for preset $preset", 'DEBUG');
            }
            
            // Copy database if requested
            if ($copyDatabase) {
                $this->writeTraceLog("STEP: Copying database", 'INFO');
                $logs = $this->addLog("Copying database...", $logs);
                $srcDb = $realSourcePath . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
                $destDb = $targetDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
                
                $this->writeTraceLog("Source database: $srcDb", 'DEBUG');
                $this->writeTraceLog("Target database: $destDb", 'DEBUG');
                
                if (file_exists($srcDb)) {
                    $dbSize = filesize($srcDb);
                    $this->writeTraceLog("Database file found, size: " . $this->formatBytes($dbSize), 'INFO');
                    
                    // If source DB is in WAL mode, checkpoint it so the copied DB is consistent.
                    // This avoids cases where linknest.db-wal contains the latest changes that wouldn't be copied.
                    try {
                        $this->writeTraceLog("Attempting WAL checkpoint on source database before copy...", 'INFO');
                        $sourceDbForCheckpoint = new PDO('sqlite:' . $srcDb);
                        $sourceDbForCheckpoint->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                        @$sourceDbForCheckpoint->exec('PRAGMA wal_checkpoint(TRUNCATE)');
                        $sourceDbForCheckpoint = null;
                        $this->writeTraceLog("WAL checkpoint attempt completed", 'INFO');
                    } catch (Exception $e) {
                        $this->writeTraceLog("WARNING: WAL checkpoint failed/skipped: " . $e->getMessage(), 'WARNING');
                    }

                    // Step 1: Extract and decrypt LDAP password from source database
                    $plainLdapPassword = null;
                    try {
                        $this->writeTraceLog("Extracting LDAP password from source database...", 'INFO');
                        $sourceDb = new PDO('sqlite:' . $srcDb);
                        $sourceDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                        
                        // Check if settings table exists
                        $checkStmt = $sourceDb->query("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'");
                        if (!$checkStmt || !$checkStmt->fetch()) {
                            $this->writeTraceLog("Settings table not found in source database", 'WARNING');
                            $sourceDb = null;
                        } else {
                            $stmt = $sourceDb->prepare('SELECT value FROM settings WHERE key = ?');
                            $stmt->execute(['ldap_bind_password']);
                            $row = $stmt->fetch(PDO::FETCH_ASSOC);
                            
                            if ($row && !empty($row['value'])) {
                                $encryptedPassword = $row['value'];
                                $this->writeTraceLog("Found LDAP password in source database (length: " . strlen($encryptedPassword) . ")", 'INFO');
                                
                                // Check if password is encrypted (contains dots in format: base64.base64.base64)
                                $isEncrypted = (strpos($encryptedPassword, '.') !== false && substr_count($encryptedPassword, '.') === 2);
                                
                                if ($isEncrypted) {
                                    try {
                                        // Decrypt using source database's encryption key
                                        $plainLdapPassword = $this->decryptPasswordForDb($encryptedPassword, $srcDb);
                                        if (!empty($plainLdapPassword)) {
                                            $this->writeTraceLog("LDAP password decrypted successfully from source database (length: " . strlen($plainLdapPassword) . ")", 'INFO');
                                        } else {
                                            $this->writeTraceLog("WARNING: Decrypted password is empty", 'WARNING');
                                        }
                                    } catch (Exception $decryptEx) {
                                        $this->writeTraceLog("ERROR: Failed to decrypt password from source: " . $decryptEx->getMessage(), 'ERROR');
                                        $this->writeTraceLog("Stack trace: " . $decryptEx->getTraceAsString(), 'ERROR');
                                        // Try to use it as plain text if decryption fails (might be corrupted)
                                        $plainLdapPassword = $encryptedPassword;
                                        $this->writeTraceLog("WARNING: Using password as-is (decryption failed, may be corrupted)", 'WARNING');
                                    }
                                } else {
                                    // Password is plain text
                                    $plainLdapPassword = $encryptedPassword;
                                    $this->writeTraceLog("LDAP password is plain text in source database (length: " . strlen($plainLdapPassword) . ")", 'INFO');
                                }
                            } else {
                                $this->writeTraceLog("No LDAP password found in source database (empty or not set)", 'INFO');
                            }
                            $sourceDb = null; // Close connection
                        }
                    } catch (Exception $e) {
                        $this->writeTraceLog("ERROR: Failed to extract LDAP password from source: " . $e->getMessage(), 'ERROR');
                        $this->writeTraceLog("Stack trace: " . $e->getTraceAsString(), 'ERROR');
                        $logs = $this->addLog("ERROR: Could not extract LDAP password from source database: " . $e->getMessage(), $logs);
                    }
                    
                    $dbCopyStart = microtime(true);
                    if (copy($srcDb, $destDb)) {
                        $dbCopyTime = number_format(microtime(true) - $dbCopyStart, 2);
                        $this->writeTraceLog("Database copied successfully in {$dbCopyTime}s", 'INFO');
                        $logs = $this->addLog("Database copied successfully", $logs);

                        // Remove any WAL/SHM files in the target (they may cause locks/corruption if copied or left stale)
                        $destWal = $destDb . '-wal';
                        $destShm = $destDb . '-shm';
                        if (file_exists($destWal)) { @unlink($destWal); }
                        if (file_exists($destShm)) { @unlink($destShm); }
                        
                        // Remove all clone records from target database
                        $this->writeTraceLog("Opening target database to remove clone records", 'DEBUG');
                        $logs = $this->addLog("Removing clone records from target database...", $logs);
                        try {
                            $this->writeTraceLog("Connecting to SQLite database: $destDb", 'DEBUG');
                            $targetDb = new PDO('sqlite:' . $destDb);
                            $targetDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                            $this->writeTraceLog("Database connection established", 'DEBUG');
                            
                            // Check if clones table exists
                            $this->writeTraceLog("Checking if clones table exists", 'DEBUG');
                            $checkStmt = $targetDb->query("SELECT name FROM sqlite_master WHERE type='table' AND name='clones'");
                            if ($checkStmt && $checkStmt->fetch()) {
                                $this->writeTraceLog("Clones table found, deleting all records", 'INFO');
                                // Delete all records from clones table
                                $deleteStmt = $targetDb->prepare('DELETE FROM clones');
                                $deleteStmt->execute();
                                $deletedCount = $deleteStmt->rowCount();
                                $this->writeTraceLog("Deleted $deletedCount clone record(s) from target database", 'INFO');
                                $logs = $this->addLog("Removed $deletedCount clone record(s) from target database", $logs);
                            } else {
                                $this->writeTraceLog("Clones table not found in target database (skipping)", 'DEBUG');
                                $logs = $this->addLog("Clones table not found in target database (skipping)", $logs);
                            }
                            // Re-encrypt LDAP password with target database's encryption key (full mirror only)
                            if (!$presetOpts['sanitizeStructure'] && $plainLdapPassword !== null && !empty(trim($plainLdapPassword))) {
                                try {
                                    $this->writeTraceLog("Re-encrypting LDAP password for target database...", 'INFO');
                                    $logs = $this->addLog("Re-encrypting LDAP password...", $logs);
                                    
                                    // Ensure settings table exists
                                    $checkSettingsStmt = $targetDb->query("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'");
                                    if (!$checkSettingsStmt || !$checkSettingsStmt->fetch()) {
                                        $this->writeTraceLog("Creating settings table in target database", 'INFO');
                                        $targetDb->exec('CREATE TABLE IF NOT EXISTS settings (
                                            key TEXT PRIMARY KEY,
                                            value TEXT,
                                            updated_at INTEGER
                                        )');
                                    }
                                    
                                    // Encrypt using target database's encryption key
                                    $encryptedPassword = $this->encryptPasswordForDb($plainLdapPassword, $destDb);
                                    $this->writeTraceLog("Password encrypted for target database (encrypted length: " . strlen($encryptedPassword) . ")", 'DEBUG');
                                    
                                    // Update the password in target database
                                    $updateStmt = $targetDb->prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?');
                                    $updateStmt->execute([$encryptedPassword, time(), 'ldap_bind_password']);
                                    
                                    if ($updateStmt->rowCount() > 0) {
                                        $this->writeTraceLog("LDAP password updated successfully in target database", 'INFO');
                                        $logs = $this->addLog("LDAP password re-encrypted successfully", $logs);
                                        
                                        // Verify the password was saved correctly and can be decrypted
                                        $verifyStmt = $targetDb->prepare('SELECT value FROM settings WHERE key = ?');
                                        $verifyStmt->execute(['ldap_bind_password']);
                                        $verifyRow = $verifyStmt->fetch(PDO::FETCH_ASSOC);
                                        if ($verifyRow && $verifyRow['value'] === $encryptedPassword) {
                                            $this->writeTraceLog("Password verification successful - password correctly stored", 'INFO');
                                            // Try to decrypt it back to verify it works
                                            try {
                                                $decryptedTest = $this->decryptPasswordForDb($encryptedPassword, $destDb);
                                                if ($decryptedTest === $plainLdapPassword) {
                                                    $this->writeTraceLog("Password decryption test successful - encryption/decryption working correctly", 'INFO');
                                                } else {
                                                    $this->writeTraceLog("WARNING: Password decryption test failed - decrypted value doesn't match original", 'WARNING');
                                                }
                                            } catch (Exception $decryptTestEx) {
                                                $this->writeTraceLog("ERROR: Password decryption test failed: " . $decryptTestEx->getMessage(), 'ERROR');
                                            }
                                        } else {
                                            $this->writeTraceLog("WARNING: Password verification failed - stored value may be incorrect", 'WARNING');
                                        }
                                    } else {
                                        // Password might not exist in target, insert it
                                        $this->writeTraceLog("Password not found in target, inserting new record", 'INFO');
                                        $insertStmt = $targetDb->prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
                                        $insertStmt->execute(['ldap_bind_password', $encryptedPassword, time()]);
                                        $this->writeTraceLog("LDAP password inserted into target database", 'INFO');
                                        $logs = $this->addLog("LDAP password inserted into target database", $logs);
                                        
                                        // Verify the password was inserted correctly and can be decrypted
                                        $verifyStmt = $targetDb->prepare('SELECT value FROM settings WHERE key = ?');
                                        $verifyStmt->execute(['ldap_bind_password']);
                                        $verifyRow = $verifyStmt->fetch(PDO::FETCH_ASSOC);
                                        if ($verifyRow && $verifyRow['value'] === $encryptedPassword) {
                                            $this->writeTraceLog("Password verification successful - password correctly stored", 'INFO');
                                            // Try to decrypt it back to verify it works
                                            try {
                                                $decryptedTest = $this->decryptPasswordForDb($encryptedPassword, $destDb);
                                                if ($decryptedTest === $plainLdapPassword) {
                                                    $this->writeTraceLog("Password decryption test successful - encryption/decryption working correctly", 'INFO');
                                                } else {
                                                    $this->writeTraceLog("WARNING: Password decryption test failed - decrypted value doesn't match original", 'WARNING');
                                                }
                                            } catch (Exception $decryptTestEx) {
                                                $this->writeTraceLog("ERROR: Password decryption test failed: " . $decryptTestEx->getMessage(), 'ERROR');
                                            }
                                        } else {
                                            $this->writeTraceLog("WARNING: Password verification failed after insert", 'WARNING');
                                        }
                                    }
                                } catch (Exception $e) {
                                    $this->writeTraceLog("ERROR: Failed to re-encrypt LDAP password: " . $e->getMessage(), 'ERROR');
                                    $this->writeTraceLog("Stack trace: " . $e->getTraceAsString(), 'ERROR');
                                    $logs = $this->addLog("ERROR: Failed to re-encrypt LDAP password: " . $e->getMessage(), $logs);
                                }
                            } else {
                                if ($plainLdapPassword === null) {
                                    $this->writeTraceLog("Skipping LDAP password migration - no password found in source database", 'INFO');
                                } else {
                                    $this->writeTraceLog("WARNING: Skipping LDAP password migration - password is empty", 'WARNING');
                                }
                            }
                            
                            $targetDb = null; // Close connection
                            $this->writeTraceLog("Database connection closed", 'DEBUG');
                        } catch (PDOException $e) {
                            $this->writeTraceLog("WARNING: PDOException removing clone records: " . $e->getMessage(), 'WARNING');
                            $this->writeTraceLog("SQL State: " . $e->getCode(), 'WARNING');
                            $this->writeTraceLog("Stack trace: " . $e->getTraceAsString(), 'WARNING');
                            $logs = $this->addLog("WARNING: Failed to remove clone records: " . $e->getMessage(), $logs);
                        } catch (Exception $e) {
                            $this->writeTraceLog("WARNING: Exception removing clone records: " . $e->getMessage(), 'WARNING');
                            $this->writeTraceLog("Stack trace: " . $e->getTraceAsString(), 'WARNING');
                            $logs = $this->addLog("WARNING: Error removing clone records: " . $e->getMessage(), $logs);
                        }
                    } else {
                        $error = error_get_last();
                        $this->writeTraceLog("ERROR: Failed to copy database file - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
                        $logs = $this->addLog("ERROR: Failed to copy database", $logs);
                    }
                } else {
                    $this->writeTraceLog("Database file not found at source: $srcDb", 'WARNING');
                    $logs = $this->addLog("No database file found to copy", $logs);
                }
            } else {
                $this->writeTraceLog("Database copy not requested (copyDatabase=false)", 'DEBUG');
            }
            
            // Ensure the cloned instance has an initialized/migrated DB so Python workers can run immediately
            // (even if copyDatabase=false and before the UI is opened).
            $this->writeTraceLog("STEP: Initializing/migrating target database schema", 'INFO');
            $this->updateProgress('configuring', 50, 'Initializing database schema...', $logs);
            $logs = $this->addLog("Initializing database schema in cloned instance...", $logs);
            $this->initializeTargetDatabase($targetDir, $logs);

            $destDb = $targetDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
            if ($presetOpts['sanitizeStructure']) {
                $this->writeTraceLog("STEP: Applying structure preset (drop users and private content)", 'INFO');
                $this->updateProgress('configuring', 52, 'Applying structure preset...', $logs);
                $logs = $this->applyStructurePreset($destDb, $logs);
            }
            if ($presetOpts['runDemo']) {
                $this->writeTraceLog("STEP: Seeding demo data", 'INFO');
                $this->updateProgress('configuring', 53, 'Generating demo data...', $logs);
                $logs = $this->runDemoDataSeed($targetDir, $logs);
            }

            $this->updateProgress('configuring', 55, 'Creating configuration...', $logs);
            
            // Step 4: Create .env file
            $this->writeTraceLog("STEP 4: Creating configuration files", 'INFO');
            $logs = $this->addLog("Creating .env file...", $logs);
            $envPath = $targetDir . DIRECTORY_SEPARATOR . '.env';
            $this->writeTraceLog("Creating .env file: $envPath", 'DEBUG');
            
            $envContent = "# LinkNest Environment Variables\n";
            $envContent .= "# Base path for the application\n";
            if (linknestCloneIsDocker()) {
                $envContent .= "VITE_BASE_PATH=./\n";
            } else {
                $envContent .= "VITE_BASE_PATH=/$folderName\n";
            }
            $envContent .= "\n";
            $envContent .= "# Optional: HTTPS Configuration\n";
            $envContent .= "# VITE_PROTOCOL=https\n";
            $envContent .= "# VITE_HOST=your-domain.com\n";
            $envContent .= "# VITE_PORT=443\n";
            $envContent .= "\n";
            $envContent .= "# Optional: Gemini API Key\n";
            $envContent .= "# GEMINI_API_KEY=your-api-key-here\n";
            
            $this->writeTraceLog(".env content length: " . strlen($envContent) . " bytes", 'DEBUG');
            $viteBase = linknestCloneIsDocker() ? './' : "/$folderName";
            $this->writeTraceLog(".env content preview: VITE_BASE_PATH=$viteBase", 'DEBUG');
            
            $result = file_put_contents($envPath, $envContent);
            if ($result === false) {
                $error = error_get_last();
                $this->writeTraceLog("ERROR: Failed to write .env file - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
            } else {
                $this->writeTraceLog(".env file created successfully: $result bytes written", 'INFO');
            }
            $logs = $this->addLog("Created .env with VITE_BASE_PATH=$viteBase", $logs);
            
            // Step 5: Install dependencies
            $this->writeTraceLog("STEP 5: Installing npm dependencies", 'INFO');
            $this->updateProgress('installing', 60, 'Installing npm dependencies...', $logs);
            $logs = $this->addLog("Installing npm dependencies (this may take a few minutes)...", $logs);
            
            $oldCwd = getcwd();
            $this->writeTraceLog("Current working directory: $oldCwd", 'DEBUG');
            $this->writeTraceLog("Changing to target directory: $targetDir", 'DEBUG');
            chdir($targetDir);
            $this->writeTraceLog("Changed to: " . getcwd(), 'DEBUG');
            
            // Check if package.json exists
            if (!file_exists('package.json')) {
                $this->writeTraceLog("ERROR: package.json not found in target directory", 'ERROR');
                chdir($oldCwd);
                throw new Exception("package.json not found in target directory");
            }
            
            $this->writeTraceLog("Executing: npm install", 'INFO');
            $npmStart = microtime(true);
            $output = [];
            $returnVar = 0;
            exec($this->cloneNpmCommandPrefix() . 'npm install 2>&1', $output, $returnVar);
            $npmTime = number_format(microtime(true) - $npmStart, 2);
            
            $this->writeTraceLog("npm install completed in {$npmTime}s with exit code: $returnVar", 'INFO');
            $this->writeTraceLog("npm install output (" . count($output) . " lines):", 'DEBUG');
            foreach ($output as $line) {
                $this->writeTraceLog("  npm: $line", 'DEBUG');
            }
            
            if ($returnVar !== 0) {
                $errorOutput = implode("\n", $output);
                $this->writeTraceLog("ERROR: npm install failed with exit code $returnVar", 'ERROR');
                $this->writeTraceLog("Error output: $errorOutput", 'ERROR');
                $logs = $this->addLog("ERROR: npm install failed", $logs);
                $logs = $this->addLog($errorOutput, $logs);
                chdir($oldCwd);
                throw new Exception("npm install failed: " . substr($errorOutput, 0, 200));
            }
            
            $this->writeTraceLog("npm install completed successfully", 'INFO');
            $logs = $this->addLog("npm install completed successfully", $logs);
            chdir($oldCwd);
            $this->writeTraceLog("Restored working directory: " . getcwd(), 'DEBUG');
            
            // Step 6: Build application
            $this->writeTraceLog("STEP 6: Building application", 'INFO');
            $this->updateProgress('building', 80, 'Building application...', $logs);
            $logs = $this->addLog("Building application (this may take a few minutes)...", $logs);
            
            // Clean dist folder if exists
            $distDir = $targetDir . DIRECTORY_SEPARATOR . 'dist';
            $this->writeTraceLog("Checking for existing dist directory: $distDir", 'DEBUG');
            if (is_dir($distDir)) {
                $this->writeTraceLog("Removing existing dist directory", 'INFO');
                $this->deleteDirectory($distDir);
                $this->writeTraceLog("Dist directory removed", 'INFO');
            }
            
            $this->writeTraceLog("Changing to target directory: $targetDir", 'DEBUG');
            chdir($targetDir);
            $this->writeTraceLog("Executing: npm run build", 'INFO');
            $buildStart = microtime(true);
            $output = [];
            $returnVar = 0;
            $buildCmd = linknestCloneIsDocker()
                ? $this->cloneNpmCommandPrefix() . 'VITE_BASE_PATH=./ npm run build 2>&1'
                : 'npm run build 2>&1';
            exec($buildCmd, $output, $returnVar);
            $buildTime = number_format(microtime(true) - $buildStart, 2);
            
            $this->writeTraceLog("npm run build completed in {$buildTime}s with exit code: $returnVar", 'INFO');
            $this->writeTraceLog("npm run build output (" . count($output) . " lines):", 'DEBUG');
            foreach ($output as $line) {
                $this->writeTraceLog("  build: $line", 'DEBUG');
            }
            
            if ($returnVar !== 0) {
                $errorOutput = implode("\n", $output);
                $this->writeTraceLog("ERROR: npm run build failed with exit code $returnVar", 'ERROR');
                $this->writeTraceLog("Build error output: $errorOutput", 'ERROR');
                $logs = $this->addLog("ERROR: npm run build failed", $logs);
                $logs = $this->addLog($errorOutput, $logs);
                if (linknestCloneIsDocker()) {
                    chdir($oldCwd);
                    throw new Exception("npm run build failed: " . substr($errorOutput, 0, 400));
                }
                $logs = $this->addLog("Clone completed but build failed. You may need to run 'npm run build' manually.", $logs);
            } else {
                $this->writeTraceLog("Build completed successfully", 'INFO');
                $logs = $this->addLog("Build completed successfully", $logs);
                $builtIndex = $targetDir . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'index.html';
                $rootIndex = $targetDir . DIRECTORY_SEPARATOR . 'index.html';
                if (is_file($builtIndex)) {
                    @copy($builtIndex, $rootIndex);
                    $logs = $this->addLog("Installed dist/index.html as the clone home page", $logs);
                }
                if (linknestCloneIsDocker()) {
                    $logs = $this->publishDockerCloneDistAssets($targetDir, $logs);
                }

                // Clean up node_modules
                $nodeModulesDir = $targetDir . DIRECTORY_SEPARATOR . 'node_modules';
                $this->writeTraceLog("Checking for node_modules directory: $nodeModulesDir", 'DEBUG');
                if (is_dir($nodeModulesDir)) {
                    $this->writeTraceLog("Removing node_modules directory (cleanup)", 'INFO');
                    $cleanupStart = microtime(true);
                    $this->deleteDirectory($nodeModulesDir);
                    $cleanupTime = number_format(microtime(true) - $cleanupStart, 2);
                    $this->writeTraceLog("node_modules removed in {$cleanupTime}s", 'INFO');
                    $logs = $this->addLog("Cleaned up node_modules", $logs);
                } else {
                    $this->writeTraceLog("node_modules directory not found (already cleaned)", 'DEBUG');
                }
            }
            
            chdir($oldCwd);
            $this->writeTraceLog("Restored working directory: " . getcwd(), 'DEBUG');
            
            // Step 7: Create README
            $this->writeTraceLog("STEP 7: Finalizing - Creating README", 'INFO');
            $this->updateProgress('finalizing', 95, 'Finalizing...', $logs);
            $logs = $this->addLog("Creating deployment README...", $logs);
            
            $readmePath = $targetDir . DIRECTORY_SEPARATOR . 'DEPLOYMENT.md';
            $this->writeTraceLog("Creating DEPLOYMENT.md: $readmePath", 'DEBUG');
            
            $readmeContent = "# $folderName - LinkNest Instance\n\n";
            $readmeContent .= "This is a cloned instance of LinkNest deployed to /$folderName/\n\n";
            $readmeContent .= "Clone preset: $preset\n\n";
            $readmeContent .= "Login sessions use a unique cookie name and path for this folder, so logging in or out here does not affect the source instance on the same host.\n\n";
            $readmeContent .= "## Quick Start\n\n";
            $readmeContent .= "1. The application has been built and is ready to use\n";
            $readmeContent .= "2. Access it at: $url\n";
            if ($preset === 'full') {
                $readmeContent .= "3. Use the same login as the source instance\n\n";
            } elseif ($preset === 'demo') {
                $readmeContent .= "3. Admin: admin / admin123. Demo users (demo1–demo10) use password: password\n\n";
            } else {
                $readmeContent .= "3. Default admin credentials: admin / admin123\n\n";
            }
            $readmeContent .= "## Database\n\n";
            $readmeContent .= "The database file will be created at: data/linknest.db\n\n";
            $readmeContent .= "## Configuration\n\n";
            $readmeContent .= "Edit .env to change settings:\n";
            $readmeContent .= "- VITE_BASE_PATH: Current value is /$folderName\n";
            $readmeContent .= "- VITE_PROTOCOL: HTTP/HTTPS protocol\n";
            $readmeContent .= "- VITE_HOST: Server hostname\n";
            $readmeContent .= "- GEMINI_API_KEY: Optional API key for AI features\n\n";
            
            $result = file_put_contents($readmePath, $readmeContent);
            if ($result === false) {
                $error = error_get_last();
                $this->writeTraceLog("WARNING: Failed to write DEPLOYMENT.md - " . ($error['message'] ?? 'Unknown error'), 'WARNING');
            } else {
                $this->writeTraceLog("DEPLOYMENT.md created successfully: $result bytes written", 'INFO');
            }
            
            // Update database with completion (preserve existing URL)
            if ($this->cloneId) {
                $this->writeTraceLog("Updating database with completion status", 'DEBUG');
                try {
                    $stmt = $this->db->prepare('UPDATE clones SET status = ?, progress = 100, completed_at = ?, url = ? WHERE id = ?');
                    $this->cloneDbExecute($stmt, ['completed', time(), $url, $this->cloneId]);
                    $this->writeTraceLog("Database updated successfully", 'INFO');
                } catch (PDOException $e) {
                    $this->writeTraceLog("ERROR: Failed to update database with completion: " . $e->getMessage(), 'ERROR');
                }
            }
            
            $totalTime = number_format(microtime(true) - $this->startTime, 2);
            $this->writeTraceLog("=== CLONE PROCESS COMPLETED SUCCESSFULLY ===", 'INFO');
            $this->writeTraceLog("Total execution time: {$totalTime}s", 'INFO');
            $this->writeTraceLog("Final memory usage: " . $this->formatBytes(memory_get_usage(true)), 'INFO');
            $this->writeTraceLog("Peak memory usage: " . $this->formatBytes(memory_get_peak_usage(true)), 'INFO');
            $this->writeTraceLog("Target directory: $targetDir", 'INFO');
            $this->writeTraceLog("Clone URL: $url", 'INFO');
            
            $logs = $this->addLog("Clone completed successfully!", $logs);
            $logs = $this->addLog("URL: $url", $logs);
            $this->updateProgress('complete', 100, 'Clone completed successfully!', $logs);
            
            return [
                'success' => true,
                'targetDir' => $targetDir,
                'url' => $url,
                'logs' => $logs
            ];
            
        } catch (Exception $e) {
            $totalTime = number_format(microtime(true) - $this->startTime, 2);
            $this->writeTraceLog("=== CLONE PROCESS FAILED ===", 'ERROR');
            $this->writeTraceLog("Error: " . $e->getMessage(), 'ERROR');
            $this->writeTraceLog("File: " . $e->getFile(), 'ERROR');
            $this->writeTraceLog("Line: " . $e->getLine(), 'ERROR');
            $this->writeTraceLog("Stack trace:", 'ERROR');
            $this->writeTraceLog($e->getTraceAsString(), 'ERROR');
            $this->writeTraceLog("Total execution time before failure: {$totalTime}s", 'ERROR');
            $this->writeTraceLog("Memory usage at failure: " . $this->formatBytes(memory_get_usage(true)), 'ERROR');
            $this->writeTraceLog("Peak memory usage: " . $this->formatBytes(memory_get_peak_usage(true)), 'ERROR');
            
            $logs = $this->addLog("ERROR: " . $e->getMessage(), $logs);
            $this->updateProgress('error', 0, $e->getMessage(), $logs);
            
            if ($this->cloneId) {
                try {
                    $stmt = $this->db->prepare('UPDATE clones SET status = ?, error_message = ? WHERE id = ?');
                    $stmt->execute(['failed', $e->getMessage(), $this->cloneId]);
                    $this->writeTraceLog("Database updated with error status", 'DEBUG');
                } catch (PDOException $dbError) {
                    $this->writeTraceLog("ERROR: Failed to update database with error: " . $dbError->getMessage(), 'ERROR');
                }
            }
            
            throw $e;
        }
    }
    
    /**
     * Recursively delete directory
     */
    private function deleteDirectory($dir) {
        $this->writeTraceLog("deleteDirectory: Starting deletion of $dir", 'DEBUG');
        
        if (!is_dir($dir)) {
            $this->writeTraceLog("deleteDirectory: Not a directory, skipping: $dir", 'DEBUG');
            return;
        }
        
        $files = scandir($dir);
        if ($files === false) {
            $error = error_get_last();
            $this->writeTraceLog("ERROR: Failed to scan directory for deletion: $dir - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
            return;
        }
        
        $files = array_diff($files, ['.', '..']);
        $fileCount = 0;
        $dirCount = 0;
        
        foreach ($files as $file) {
            $path = $dir . DIRECTORY_SEPARATOR . $file;
            if (is_dir($path)) {
                $dirCount++;
                $this->writeTraceLog("deleteDirectory: Recursing into subdirectory: $file", 'DEBUG');
                $this->deleteDirectory($path);
            } else {
                $fileCount++;
                $this->writeTraceLog("deleteDirectory: Deleting file: $file", 'DEBUG');
                if (!unlink($path)) {
                    $error = error_get_last();
                    $this->writeTraceLog("WARNING: Failed to delete file: $path - " . ($error['message'] ?? 'Unknown error'), 'WARNING');
                }
            }
        }
        
        $this->writeTraceLog("deleteDirectory: Removing directory: $dir ($fileCount files, $dirCount subdirectories)", 'DEBUG');
        if (!rmdir($dir)) {
            $error = error_get_last();
            $this->writeTraceLog("WARNING: Failed to remove directory: $dir - " . ($error['message'] ?? 'Unknown error'), 'WARNING');
        } else {
            $this->writeTraceLog("deleteDirectory: Directory removed successfully: $dir", 'DEBUG');
        }
    }
    
    /**
     * Get clone status
     */
    public function getStatus() {
        if (!$this->statusFile || !file_exists($this->statusFile)) {
            return null;
        }
        
        $content = file_get_contents($this->statusFile);
        return json_decode($content, true);
    }
    
    /**
     * Status JSON is written even when SQLite is busy. Heal stale DB rows from it.
     */
    private static function syncCloneRowFromStatusFile(array $row): array
    {
        $id = (int) ($row['id'] ?? 0);
        if ($id < 1) {
            return $row;
        }
        $statusFile = __DIR__ . '/../clone_status_' . $id . '.json';
        if (!is_file($statusFile)) {
            return $row;
        }
        $file = json_decode((string) @file_get_contents($statusFile), true);
        if (!is_array($file)) {
            return $row;
        }
        $step = (string) ($file['step'] ?? '');
        $fileProgress = isset($file['progress']) ? (int) $file['progress'] : null;
        if ($step === 'complete' || $step === 'completed' || ($fileProgress !== null && $fileProgress >= 100 && $step !== 'error')) {
            $row['status'] = 'completed';
            $row['progress'] = 100;
            if (empty($row['completed_at'])) {
                $row['completed_at'] = $file['timestamp'] ?? time();
            }
            self::persistHealedCloneState($id, 'completed', 100, null, (int) $row['completed_at']);
            return $row;
        }
        if ($step === 'error') {
            $row['status'] = 'failed';
            $row['error_message'] = $file['message'] ?? ($row['error_message'] ?? 'Clone failed');
            self::persistHealedCloneState($id, 'failed', (int) ($row['progress'] ?? 0), (string) $row['error_message'], null);
            return $row;
        }
        if ($fileProgress !== null && in_array((string) ($row['status'] ?? ''), ['running', 'pending'], true)) {
            $row['progress'] = max((int) ($row['progress'] ?? 0), $fileProgress);
        }
        return $row;
    }

    private static function persistHealedCloneState(int $id, string $status, int $progress, ?string $error, $completedAt): void
    {
        try {
            $db = getDB();
            $db->exec('PRAGMA busy_timeout = 15000');
            if ($status === 'completed') {
                $stmt = $db->prepare('UPDATE clones SET status = ?, progress = ?, error_message = NULL, completed_at = COALESCE(completed_at, ?) WHERE id = ? AND status != ?');
                $stmt->execute([$status, $progress, $completedAt ?: time(), $id, 'completed']);
            } else {
                $stmt = $db->prepare('UPDATE clones SET status = ?, progress = ?, error_message = ? WHERE id = ?');
                $stmt->execute([$status, $progress, $error, $id]);
            }
        } catch (Throwable $e) {
            error_log('clone heal persist failed: ' . $e->getMessage());
        }
    }

    /**
     * Get all clones
     */
    public static function getAllClones() {
        try {
            $db = getDB();
            $stmt = $db->prepare('SELECT * FROM clones ORDER BY created_at DESC');
            if (!$stmt) {
                error_log("Failed to prepare statement in getAllClones");
                return [];
            }
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (!is_array($result)) {
                return [];
            }
            foreach ($result as $i => $row) {
                $result[$i] = self::syncCloneRowFromStatusFile($row);
            }
            return $result;
        } catch (Exception $e) {
            error_log("Error in getAllClones: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return [];
        } catch (Error $e) {
            error_log("Fatal error in getAllClones: " . $e->getMessage());
            return [];
        }
    }

    /**
     * After files are copied, initialize schema and apply structure/demo sanitization.
     * Used by Admin clone and by scripts/apply-clone-preset.php.
     */
    public function applyPostCopyPreset($targetDir, $preset)
    {
        $preset = linknestNormalizeClonePreset($preset);
        $opts = linknestClonePresetOptions($preset);
        $this->initializeTargetDatabase($targetDir, []);
        $destDb = $targetDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
        if ($opts['sanitizeStructure']) {
            $this->applyStructurePreset($destDb, []);
        }
        if ($opts['runDemo']) {
            $this->runDemoDataSeed($targetDir, []);
        }
    }

    /**
     * Give this clone its own session cookie name/path, session files, and system token
     * so login/logout on the same host does not share the source instance.
     */
    private function writeInstallIsolation($targetDir, $folderName, $url, $logs = [])
    {
        try {
            $info = linknestWriteInstallIdentity($targetDir, (string) $folderName, is_string($url) ? $url : null);
            $this->writeTraceLog("Install isolation written: session={$info['sessionName']} path={$info['cookiePath']}", 'INFO');
            $logs = $this->addLog("Isolated login cookie: {$info['sessionName']} (path {$info['cookiePath']})", $logs);
            $logs = $this->addLog("Isolated PHP session files and system token for this clone", $logs);
        } catch (Throwable $e) {
            $this->writeTraceLog("WARNING: Failed to write install identity: " . $e->getMessage(), 'WARNING');
            $logs = $this->addLog("WARNING: Could not write install identity (session isolation)", $logs);
        }
        return $logs;
    }

    /**
     * Structure preset: keep public/authenticated tiles and links, drop users and private content.
     */
    private function applyStructurePreset($destDb, $logs = [])
    {
        if (!is_file($destDb)) {
            $this->writeTraceLog("WARNING: Structure preset skipped — database not found: $destDb", 'WARNING');
            return $this->addLog("WARNING: Structure preset skipped (no database)", $logs);
        }

        try {
            $db = new PDO('sqlite:' . $destDb);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $db->exec('PRAGMA foreign_keys = OFF');
            $db->beginTransaction();

            $tableExists = function (string $name) use ($db): bool {
                $stmt = $db->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
                $stmt->execute([$name]);
                return (bool)$stmt->fetchColumn();
            };
            $tableHasColumn = function (string $table, string $column) use ($db): bool {
                $cols = $db->query("PRAGMA table_info({$table})")->fetchAll(PDO::FETCH_ASSOC);
                return in_array($column, array_column($cols, 'name'), true);
            };

            foreach (['tiles', 'tabs', 'sections', 'links'] as $table) {
                if (!$tableExists($table) || !$tableHasColumn($table, 'visibility')) {
                    continue;
                }
                $deleted = $db->exec("DELETE FROM {$table} WHERE visibility = 'private'");
                $this->writeTraceLog("Structure: deleted $deleted private row(s) from $table", 'INFO');
            }
            if ($tableExists('tiles') && $tableHasColumn('tiles', 'source_tab')) {
                $deleted = $db->exec("DELETE FROM tiles WHERE source_tab = 'staging'");
                $this->writeTraceLog("Structure: deleted $deleted staging tile(s)", 'INFO');
            }
            foreach (['tiles', 'tabs', 'sections', 'links'] as $table) {
                if (!$tableExists($table)) {
                    continue;
                }
                if ($tableHasColumn($table, 'allowed_users')) {
                    $db->exec("UPDATE {$table} SET allowed_users = NULL");
                }
                if ($tableHasColumn($table, 'allowed_groups')) {
                    $db->exec("UPDATE {$table} SET allowed_groups = NULL");
                }
            }

            $adminId = null;
            if ($tableExists('users')) {
                $adminRow = $db->query('SELECT id FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
                if ($adminRow) {
                    $adminId = (int)$adminRow['id'];
                    $db->prepare('DELETE FROM users WHERE id != ?')->execute([$adminId]);
                    $hash = password_hash('admin123', PASSWORD_DEFAULT);
                    try {
                        $db->prepare('UPDATE users SET username = ?, email = ?, password_hash = ?, is_admin = 1, is_approved = 1, auth_source = ? WHERE id = ?')
                            ->execute(['admin', 'admin@linknest.local', $hash, 'local', $adminId]);
                    } catch (PDOException $e) {
                        $db->prepare('UPDATE users SET username = ?, email = ?, password_hash = ?, is_admin = 1, is_approved = 1 WHERE id = ?')
                            ->execute(['admin', 'admin@linknest.local', $hash, $adminId]);
                    }
                    $this->writeTraceLog("Structure: kept admin user id=$adminId and reset to admin / admin123", 'INFO');
                }
            }
            if ($adminId && $tableExists('tiles') && $tableHasColumn('tiles', 'user_id')) {
                $db->prepare('UPDATE tiles SET user_id = ?')->execute([$adminId]);
            }

            $clearTables = [
                'user_preferences',
                'user_custom_timezones',
                'user_alarms',
                'user_ssh_connections',
                'user_vnc_connections',
                'user_notes',
                'user_blocked_sharers',
                'user_link_favorites',
                'user_tile_favorites',
                'user_tile_permissions',
                'user_monitor_permissions',
                'user_roles',
                'user_group_members',
                'tile_share_invitations',
                'tile_visits',
                'tile_versions',
                'tile_messages',
                'email_outbox',
                'user_audit_log',
                'clones',
            ];
            foreach ($clearTables as $table) {
                if (!$tableExists($table)) {
                    continue;
                }
                $db->exec("DELETE FROM {$table}");
            }

            if ($tableExists('settings')) {
                foreach (['ldap_enabled', 'ldap_auth_enabled', 'saml_enabled', 'saml_auth_enabled'] as $key) {
                    $db->prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')->execute(['0', time(), $key]);
                }
                foreach (['ldap_bind_password', 'smtp_password', 'smtp_pass', 'mail_password'] as $key) {
                    $db->prepare('DELETE FROM settings WHERE key = ?')->execute([$key]);
                }
            }

            $db->commit();
            $db->exec('PRAGMA foreign_keys = ON');
            $db = null;
            $logs = $this->addLog("Structure preset applied: public/authenticated tiles kept; users reset to admin / admin123", $logs);
        } catch (Exception $e) {
            $this->writeTraceLog("ERROR: Structure preset failed: " . $e->getMessage(), 'ERROR');
            $logs = $this->addLog("ERROR: Structure preset failed: " . $e->getMessage(), $logs);
            throw $e;
        }

        return $logs;
    }

    /**
     * Demo preset: seed presentation tiles/users via generate_demo_data.php in the clone folder.
     */
    private function runDemoDataSeed($targetDir, $logs = [])
    {
        $script = $targetDir . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'generate_demo_data.php';
        if (!is_file($script)) {
            throw new Exception('Demo preset requires scripts/generate_demo_data.php in the cloned instance');
        }

        $php = PHP_BINARY ?: 'php';
        $oldCwd = getcwd();
        $this->writeTraceLog("Running demo seed in $targetDir", 'INFO');
        $logs = $this->addLog("Generating demo data (this may take a minute)...", $logs);
        chdir($targetDir);
        $output = [];
        $returnVar = 0;
        $cmd = escapeshellarg($php) . ' ' . escapeshellarg($script) . ' --yes 2>&1';
        exec($cmd, $output, $returnVar);
        chdir($oldCwd);

        foreach ($output as $line) {
            $this->writeTraceLog("  demo: $line", 'DEBUG');
        }
        if ($returnVar !== 0) {
            $errorOutput = implode("\n", $output);
            $this->writeTraceLog("ERROR: Demo data generation failed with exit code $returnVar", 'ERROR');
            throw new Exception("Demo data generation failed: " . substr($errorOutput, 0, 400));
        }

        $this->writeTraceLog("Demo data generation completed", 'INFO');
        return $this->addLog("Demo data generated (demo users use password: password; admin / admin123)", $logs);
    }

    /**
     * Run the cloned instance's own api/config.php initDatabase() via PHP CLI.
     * This ensures schema migrations (including Python-related tables) are present immediately.
     */
    private function initializeTargetDatabase($targetDir, $logs = []) {
        try {
            $php = PHP_BINARY ?: 'php';
            $targetDirNorm = str_replace('\\', '/', $targetDir);
            // Use chdir so we can require relative paths without escaping backslashes.
            $code = "chdir('" . str_replace("'", "\\'", $targetDirNorm) . "'); require 'api/config.php'; getDB(); echo \"DB_OK\\n\";";
            $cmd = escapeshellarg($php) . ' -r ' . escapeshellarg($code) . ' 2>&1';
            $this->writeTraceLog("Running DB init command: $cmd", 'DEBUG');
            $out = [];
            $rc = 0;
            exec($cmd, $out, $rc);
            $output = trim(implode("\n", $out));
            if ($rc !== 0) {
                $this->writeTraceLog("WARNING: Target DB init returned non-zero exit code: $rc", 'WARNING');
                if ($output) {
                    $this->writeTraceLog("DB init output: $output", 'WARNING');
                }
                return $logs;
            }
            $this->writeTraceLog("Target DB init completed successfully", 'INFO');
            if ($output) {
                $this->writeTraceLog("DB init output: $output", 'DEBUG');
            }
        } catch (Exception $e) {
            $this->writeTraceLog("WARNING: Failed to initialize target DB: " . $e->getMessage(), 'WARNING');
        }
        return $logs;
    }

    private function cloneNpmCommandPrefix(): string
    {
        if (!linknestCloneIsDocker()) {
            return '';
        }
        $path = getenv('PATH') ?: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        if (strpos($path, '/usr/local/bin') === false) {
            $path = '/usr/local/bin:' . $path;
        }
        return 'HOME=/var/www PATH=' . escapeshellarg($path)
            . ' npm_config_strict_ssl=false NODE_TLS_REJECT_UNAUTHORIZED=0 ';
    }

    /**
     * Apache AliasMatch maps /{folder}/assets/... onto the clone root, but Vite
     * emits those files under dist/. Symlink the public build dirs so requests
     * resolve even if vhost rewrite is missing.
     */
    private function publishDockerCloneDistAssets(string $targetDir, array $logs): array
    {
        $dist = $targetDir . DIRECTORY_SEPARATOR . 'dist';
        if (!is_dir($dist)) {
            return $logs;
        }
        foreach (['assets', 'tinymce', 'js'] as $dir) {
            $src = $dist . DIRECTORY_SEPARATOR . $dir;
            $dest = $targetDir . DIRECTORY_SEPARATOR . $dir;
            if (!is_dir($src) || file_exists($dest)) {
                continue;
            }
            if (@symlink('dist' . DIRECTORY_SEPARATOR . $dir, $dest)) {
                $this->writeTraceLog("Linked $dir -> dist/$dir", 'INFO');
                $logs = $this->addLog("Linked $dir to dist/$dir", $logs);
            } else {
                $this->writeTraceLog("WARNING: Could not symlink $dir -> dist/$dir", 'WARNING');
            }
        }
        foreach (['ssh-session-shared-worker.js', 'ssh-session-keepalive.html', 'sw-cache-first.js', 'tinymce-editor.html'] as $file) {
            $src = $dist . DIRECTORY_SEPARATOR . $file;
            $dest = $targetDir . DIRECTORY_SEPARATOR . $file;
            if (!is_file($src) || file_exists($dest)) {
                continue;
            }
            @symlink('dist' . DIRECTORY_SEPARATOR . $file, $dest);
        }
        return $logs;
    }

    private function writeDockerCloneHtaccess($targetDir, $folderName): void
    {
        $ht = "# LinkNest Docker clone — subdirectory at /{$folderName}/\n";
        $ht .= "Options -Indexes -MultiViews +FollowSymLinks\n";
        $ht .= "DirectoryIndex dist/index.html index.html\n";
        $ht .= "<IfModule mod_rewrite.c>\n";
        $ht .= "    RewriteEngine On\n";
        $ht .= "    RewriteCond %{REQUEST_FILENAME} -f [OR]\n";
        $ht .= "    RewriteCond %{REQUEST_FILENAME} -d\n";
        $ht .= "    RewriteRule ^ - [L]\n";
        $ht .= "    RewriteRule ^api/(.*)\$ api/index.php?path=\$1 [BCTLS,L,QSA]\n";
        $ht .= "    RewriteRule ^assets/(.*)\$ dist/assets/\$1 [L]\n";
        $ht .= "    RewriteRule (^|/)tinymce/(.*)\$ dist/tinymce/\$2 [L]\n";
        $ht .= "    RewriteRule (^|/)ssh-session-shared-worker\\.js\$ dist/ssh-session-shared-worker.js [L]\n";
        $ht .= "    RewriteRule (^|/)ssh-session-keepalive\\.html\$ dist/ssh-session-keepalive.html [L]\n";
        $ht .= "    RewriteRule (^|/)tinymce-editor\\.html\$ dist/tinymce-editor.html [L]\n";
        $ht .= "    RewriteRule . dist/index.html [L]\n";
        $ht .= "</IfModule>\n";
        @file_put_contents($targetDir . DIRECTORY_SEPARATOR . '.htaccess', $ht);
    }
}

