<?php
/**
 * Clone Service - PHP implementation of clone-linknest.bat
 * Handles cloning LinkNest instances with progress tracking
 */

require_once __DIR__ . '/config.php';

class CloneService {
    private $db;
    private $cloneId;
    private $statusFile;
    private $traceLogFile;
    private $startTime;
    
    public function __construct($cloneId = null) {
        $this->db = getDB();
        $this->cloneId = $cloneId;
        $this->startTime = microtime(true);
        if ($cloneId) {
            $this->statusFile = __DIR__ . '/../clone_status_' . $cloneId . '.json';
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
     * Update progress and log message
     */
    private function updateProgress($step, $progress, $message, $logs = []) {
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
                $stmt->execute([$statusValue, $progress, $errorMsg, $this->cloneId]);
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
    public function executeClone($folderName, $sourcePath, $targetPath, $copyAssets, $copyDatabase, $createdBy = null) {
        $this->writeTraceLog("=== EXECUTE CLONE STARTED ===", 'INFO');
        $this->writeTraceLog("Parameters: folderName=$folderName, sourcePath=$sourcePath, targetPath=$targetPath", 'INFO');
        $this->writeTraceLog("Options: copyAssets=" . ($copyAssets ? 'true' : 'false') . ", copyDatabase=" . ($copyDatabase ? 'true' : 'false'), 'INFO');
        $this->writeTraceLog("Created by user ID: " . ($createdBy ?? 'null'), 'INFO');
        
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
                'router.php',
                '.htaccess',
                '.gitignore',
                'README.md',
                'BUNDLE_DEPLOYMENT_GUIDE.md',
                'bulk-import-template.csv',
                'section-links-import-template.csv',
                'metadata.json'
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
            
            // Copy directories
            $this->writeTraceLog("Starting to copy directories", 'INFO');
            $directories = ['api', 'components', 'contexts', 'services', 'src', 'docker', 'docs', 'land'];
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
            
            // Copy scripts
            $scriptsDir = $realSourcePath . DIRECTORY_SEPARATOR . 'scripts';
            if (is_dir($scriptsDir)) {
                $logs = $this->addLog("Copying scripts...", $logs);
                $targetScriptsDir = $targetDir . DIRECTORY_SEPARATOR . 'scripts';
                $scriptFiles = glob($scriptsDir . DIRECTORY_SEPARATOR . '*.{bat,sh,php,md}', GLOB_BRACE);
                $scriptCount = 0;
                foreach ($scriptFiles as $scriptFile) {
                    $scriptName = basename($scriptFile);
                    $destScript = $targetScriptsDir . DIRECTORY_SEPARATOR . $scriptName;
                    if (copy($scriptFile, $destScript)) {
                        $scriptCount++;
                    }
                }
                $logs = $this->addLog("Copied $scriptCount script files", $logs);
            }
            
            // Copy assets if requested
            if ($copyAssets) {
                $this->writeTraceLog("STEP: Copying assets", 'INFO');
                $logs = $this->addLog("Copying assets...", $logs);
                $uploadsDir = $realSourcePath . DIRECTORY_SEPARATOR . 'uploads';
                $targetUploadsDir = $targetDir . DIRECTORY_SEPARATOR . 'uploads';
                
                $this->writeTraceLog("Source uploads directory: $uploadsDir", 'DEBUG');
                $this->writeTraceLog("Target uploads directory: $targetUploadsDir", 'DEBUG');
                
                if (is_dir($uploadsDir)) {
                    $this->writeTraceLog("Uploads directory exists, searching for asset files", 'DEBUG');
                    $logoFiles = glob($uploadsDir . DIRECTORY_SEPARATOR . 'logo_*.*');
                    $faviconFiles = glob($uploadsDir . DIRECTORY_SEPARATOR . 'favicon_*.*');
                    
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
                } else {
                    $this->writeTraceLog("Uploads directory not found: $uploadsDir", 'DEBUG');
                }
            } else {
                $this->writeTraceLog("Asset copy not requested (copyAssets=false)", 'DEBUG');
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
                    $dbCopyStart = microtime(true);
                    if (copy($srcDb, $destDb)) {
                        $dbCopyTime = number_format(microtime(true) - $dbCopyStart, 2);
                        $this->writeTraceLog("Database copied successfully in {$dbCopyTime}s", 'INFO');
                        $logs = $this->addLog("Database copied successfully", $logs);
                        
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
                        
                        // Encrypt LDAP passwords if script exists
                        $encryptScript = $targetDir . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'encrypt_ldap_passwords.php';
                        $this->writeTraceLog("Checking for LDAP password encryption script: $encryptScript", 'DEBUG');
                        if (file_exists($encryptScript)) {
                            $this->writeTraceLog("LDAP encryption script found, executing", 'INFO');
                            $logs = $this->addLog("Encrypting LDAP passwords...", $logs);
                            $encryptStart = microtime(true);
                            $output = [];
                            $returnVar = 0;
                            $this->writeTraceLog("Executing: php " . escapeshellarg($encryptScript), 'DEBUG');
                            exec('php ' . escapeshellarg($encryptScript) . ' 2>&1', $output, $returnVar);
                            $encryptTime = number_format(microtime(true) - $encryptStart, 2);
                            $this->writeTraceLog("LDAP encryption completed in {$encryptTime}s with exit code: $returnVar", 'INFO');
                            if (count($output) > 0) {
                                foreach ($output as $line) {
                                    $this->writeTraceLog("  encrypt: $line", 'DEBUG');
                                }
                            }
                            if ($returnVar === 0) {
                                $this->writeTraceLog("LDAP passwords encrypted successfully", 'INFO');
                                $logs = $this->addLog("LDAP passwords encrypted", $logs);
                            } else {
                                $this->writeTraceLog("WARNING: LDAP password encryption failed with exit code $returnVar", 'WARNING');
                                $logs = $this->addLog("WARNING: Failed to encrypt LDAP passwords", $logs);
                            }
                        } else {
                            $this->writeTraceLog("LDAP encryption script not found, skipping", 'DEBUG');
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
            
            $this->updateProgress('configuring', 50, 'Creating configuration...', $logs);
            
            // Step 4: Create .env file
            $this->writeTraceLog("STEP 4: Creating configuration files", 'INFO');
            $logs = $this->addLog("Creating .env file...", $logs);
            $envPath = $targetDir . DIRECTORY_SEPARATOR . '.env';
            $this->writeTraceLog("Creating .env file: $envPath", 'DEBUG');
            
            $envContent = "# LinkNest Environment Variables\n";
            $envContent .= "# Base path for the application\n";
            $envContent .= "VITE_BASE_PATH=/$folderName\n";
            $envContent .= "\n";
            $envContent .= "# Optional: HTTPS Configuration\n";
            $envContent .= "# VITE_PROTOCOL=https\n";
            $envContent .= "# VITE_HOST=your-domain.com\n";
            $envContent .= "# VITE_PORT=443\n";
            $envContent .= "\n";
            $envContent .= "# Optional: Gemini API Key\n";
            $envContent .= "# GEMINI_API_KEY=your-api-key-here\n";
            
            $this->writeTraceLog(".env content length: " . strlen($envContent) . " bytes", 'DEBUG');
            $this->writeTraceLog(".env content preview: VITE_BASE_PATH=/$folderName", 'DEBUG');
            
            $result = file_put_contents($envPath, $envContent);
            if ($result === false) {
                $error = error_get_last();
                $this->writeTraceLog("ERROR: Failed to write .env file - " . ($error['message'] ?? 'Unknown error'), 'ERROR');
            } else {
                $this->writeTraceLog(".env file created successfully: $result bytes written", 'INFO');
            }
            $logs = $this->addLog("Created .env with VITE_BASE_PATH=/$folderName", $logs);
            
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
            exec('npm install 2>&1', $output, $returnVar);
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
            exec('npm run build 2>&1', $output, $returnVar);
            $buildTime = number_format(microtime(true) - $buildStart, 2);
            
            $this->writeTraceLog("npm run build completed in {$buildTime}s with exit code: $returnVar", 'INFO');
            $this->writeTraceLog("npm run build output (" . count($output) . " lines):", 'DEBUG');
            foreach ($output as $line) {
                $this->writeTraceLog("  build: $line", 'DEBUG');
            }
            
            if ($returnVar !== 0) {
                $errorOutput = implode("\n", $output);
                $this->writeTraceLog("WARNING: npm run build failed with exit code $returnVar", 'WARNING');
                $this->writeTraceLog("Build error output: $errorOutput", 'WARNING');
                $logs = $this->addLog("WARNING: npm run build failed", $logs);
                $logs = $this->addLog($errorOutput, $logs);
                $logs = $this->addLog("Clone completed but build failed. You may need to run 'npm run build' manually.", $logs);
            } else {
                $this->writeTraceLog("Build completed successfully", 'INFO');
                $logs = $this->addLog("Build completed successfully", $logs);
                
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
            $readmeContent .= "## Quick Start\n\n";
            $readmeContent .= "1. The application has been built and is ready to use\n";
            $readmeContent .= "2. Access it at: http://localhost/$folderName/\n";
            $readmeContent .= "3. Default admin credentials: admin / admin123\n\n";
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
            
            // Determine URL - simple format: http://localhost/folderName/
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            // Just use localhost with folder name, no path components
            $url = "$protocol://$host/$folderName/";
            
            $this->writeTraceLog("Determined clone URL: $url", 'INFO');
            $this->writeTraceLog("Protocol: $protocol, Host: $host", 'DEBUG');
            
            // Update database with completion
            if ($this->cloneId) {
                $this->writeTraceLog("Updating database with completion status", 'DEBUG');
                try {
                    $stmt = $this->db->prepare('UPDATE clones SET status = ?, progress = 100, completed_at = ?, url = ? WHERE id = ?');
                    $stmt->execute(['completed', time(), $url, $this->cloneId]);
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
            return is_array($result) ? $result : [];
        } catch (Exception $e) {
            error_log("Error in getAllClones: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return [];
        } catch (Error $e) {
            error_log("Fatal error in getAllClones: " . $e->getMessage());
            return [];
        }
    }
}

