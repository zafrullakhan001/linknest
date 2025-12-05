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
    
    public function __construct($cloneId = null) {
        $this->db = getDB();
        $this->cloneId = $cloneId;
        if ($cloneId) {
            $this->statusFile = __DIR__ . '/../clone_status_' . $cloneId . '.json';
        }
    }
    
    /**
     * Update progress and log message
     */
    private function updateProgress($step, $progress, $message, $logs = []) {
        $status = [
            'step' => $step,
            'progress' => $progress,
            'message' => $message,
            'logs' => $logs,
            'timestamp' => time()
        ];
        
        // Save to status file
        if ($this->statusFile) {
            @file_put_contents($this->statusFile, json_encode($status, JSON_PRETTY_PRINT));
        }
        
        // Update database
        if ($this->cloneId) {
            try {
                $stmt = $this->db->prepare('UPDATE clones SET status = ?, progress = ?, error_message = ? WHERE id = ?');
                $errorMsg = ($step === 'error') ? $message : null;
                $statusValue = ($step === 'error') ? 'failed' : (($step === 'complete') ? 'completed' : 'running');
                $stmt->execute([$statusValue, $progress, $errorMsg, $this->cloneId]);
            } catch (PDOException $e) {
                error_log('Failed to update clone progress: ' . $e->getMessage());
            }
        }
    }
    
    /**
     * Add log message
     */
    private function addLog($message, $logs = []) {
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
        if (!is_dir($source)) {
            return $logs;
        }
        
        if (!is_dir($dest)) {
            if (!mkdir($dest, 0755, true)) {
                $logs = $this->addLog("ERROR: Failed to create directory: $dest", $logs);
                return $logs;
            }
        }
        
        $files = scandir($source);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            
            $srcFile = $source . DIRECTORY_SEPARATOR . $file;
            $destFile = $dest . DIRECTORY_SEPARATOR . $file;
            
            if (is_dir($srcFile)) {
                $logs = $this->copyDirectory($srcFile, $destFile, $logs);
            } else {
                if (!copy($srcFile, $destFile)) {
                    $logs = $this->addLog("WARNING: Failed to copy file: $file", $logs);
                }
            }
        }
        
        return $logs;
    }
    
    /**
     * Execute clone operation
     */
    public function executeClone($folderName, $sourcePath, $targetPath, $copyAssets, $copyDatabase, $createdBy = null) {
        $logs = [];
        $logs = $this->addLog("Starting clone operation for: $folderName", $logs);
        
        try {
            // Step 1: Validate and prepare paths
            $this->updateProgress('validating', 5, 'Validating paths...', $logs);
            
            $realSourcePath = realpath($sourcePath);
            if (!$realSourcePath || !is_dir($realSourcePath)) {
                throw new Exception("Source path does not exist: $sourcePath");
            }
            
            if (!file_exists($realSourcePath . '/package.json')) {
                throw new Exception("Source directory is not a valid LinkNest installation (package.json not found)");
            }
            
            $realTargetPath = realpath($targetPath);
            if (!$realTargetPath || !is_dir($realTargetPath)) {
                throw new Exception("Target path does not exist: $targetPath");
            }
            
            $targetDir = $realTargetPath . DIRECTORY_SEPARATOR . $folderName;
            $logs = $this->addLog("Source: $realSourcePath", $logs);
            $logs = $this->addLog("Target: $targetDir", $logs);
            
            // Check if target exists and remove if needed
            if (is_dir($targetDir)) {
                $logs = $this->addLog("WARNING: Target folder already exists, removing...", $logs);
                $this->updateProgress('preparing', 8, 'Removing existing folder...', $logs);
                
                $this->deleteDirectory($targetDir);
                $logs = $this->addLog("Existing folder removed", $logs);
            }
            
            // Step 2: Create target directory
            $this->updateProgress('creating', 10, 'Creating target directory...', $logs);
            if (!mkdir($targetDir, 0755, true)) {
                throw new Exception("Failed to create target directory: $targetDir");
            }
            $logs = $this->addLog("Target directory created", $logs);
            
            // Step 3: Copy files
            $this->updateProgress('copying', 15, 'Copying files...', $logs);
            $logs = $this->addLog("Copying root files...", $logs);
            
            // Files to copy
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
            foreach ($filesToCopy as $file) {
                $srcFile = $realSourcePath . DIRECTORY_SEPARATOR . $file;
                if (file_exists($srcFile)) {
                    $destFile = $targetDir . DIRECTORY_SEPARATOR . $file;
                    if (copy($srcFile, $destFile)) {
                        $copiedCount++;
                    } else {
                        $logs = $this->addLog("WARNING: Failed to copy $file", $logs);
                    }
                }
            }
            $logs = $this->addLog("Copied $copiedCount root files", $logs);
            
            // Copy directories
            $directories = ['api', 'components', 'contexts', 'services', 'src', 'docker', 'docs', 'land'];
            foreach ($directories as $dir) {
                $srcDir = $realSourcePath . DIRECTORY_SEPARATOR . $dir;
                if (is_dir($srcDir)) {
                    $logs = $this->addLog("Copying $dir directory...", $logs);
                    $destDir = $targetDir . DIRECTORY_SEPARATOR . $dir;
                    $logs = $this->copyDirectory($srcDir, $destDir, $logs);
                    $this->updateProgress('copying', 15 + (20 * (array_search($dir, $directories) + 1) / count($directories)), "Copying $dir...", $logs);
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
                $logs = $this->addLog("Copying assets...", $logs);
                $uploadsDir = $realSourcePath . DIRECTORY_SEPARATOR . 'uploads';
                $targetUploadsDir = $targetDir . DIRECTORY_SEPARATOR . 'uploads';
                
                if (is_dir($uploadsDir)) {
                    $logoFiles = glob($uploadsDir . DIRECTORY_SEPARATOR . 'logo_*.*');
                    $faviconFiles = glob($uploadsDir . DIRECTORY_SEPARATOR . 'favicon_*.*');
                    
                    foreach (array_merge($logoFiles, $faviconFiles) as $assetFile) {
                        $destAsset = $targetUploadsDir . DIRECTORY_SEPARATOR . basename($assetFile);
                        copy($assetFile, $destAsset);
                    }
                    $logs = $this->addLog("Copied " . (count($logoFiles) + count($faviconFiles)) . " asset files", $logs);
                }
            }
            
            // Copy database if requested
            if ($copyDatabase) {
                $logs = $this->addLog("Copying database...", $logs);
                $srcDb = $realSourcePath . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
                $destDb = $targetDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
                
                if (file_exists($srcDb)) {
                    if (copy($srcDb, $destDb)) {
                        $logs = $this->addLog("Database copied successfully", $logs);
                        
                        // Remove all clone records from target database
                        $logs = $this->addLog("Removing clone records from target database...", $logs);
                        try {
                            $targetDb = new PDO('sqlite:' . $destDb);
                            $targetDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                            
                            // Check if clones table exists
                            $checkStmt = $targetDb->query("SELECT name FROM sqlite_master WHERE type='table' AND name='clones'");
                            if ($checkStmt && $checkStmt->fetch()) {
                                // Delete all records from clones table
                                $deleteStmt = $targetDb->prepare('DELETE FROM clones');
                                $deleteStmt->execute();
                                $deletedCount = $deleteStmt->rowCount();
                                $logs = $this->addLog("Removed $deletedCount clone record(s) from target database", $logs);
                            } else {
                                $logs = $this->addLog("Clones table not found in target database (skipping)", $logs);
                            }
                            $targetDb = null; // Close connection
                        } catch (PDOException $e) {
                            $logs = $this->addLog("WARNING: Failed to remove clone records: " . $e->getMessage(), $logs);
                        } catch (Exception $e) {
                            $logs = $this->addLog("WARNING: Error removing clone records: " . $e->getMessage(), $logs);
                        }
                        
                        // Encrypt LDAP passwords if script exists
                        $encryptScript = $targetDir . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'encrypt_ldap_passwords.php';
                        if (file_exists($encryptScript)) {
                            $logs = $this->addLog("Encrypting LDAP passwords...", $logs);
                            $output = [];
                            $returnVar = 0;
                            exec('php ' . escapeshellarg($encryptScript) . ' 2>&1', $output, $returnVar);
                            if ($returnVar === 0) {
                                $logs = $this->addLog("LDAP passwords encrypted", $logs);
                            } else {
                                $logs = $this->addLog("WARNING: Failed to encrypt LDAP passwords", $logs);
                            }
                        }
                    } else {
                        $logs = $this->addLog("ERROR: Failed to copy database", $logs);
                    }
                } else {
                    $logs = $this->addLog("No database file found to copy", $logs);
                }
            }
            
            $this->updateProgress('configuring', 50, 'Creating configuration...', $logs);
            
            // Step 4: Create .env file
            $logs = $this->addLog("Creating .env file...", $logs);
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
            
            file_put_contents($targetDir . DIRECTORY_SEPARATOR . '.env', $envContent);
            $logs = $this->addLog("Created .env with VITE_BASE_PATH=/$folderName", $logs);
            
            // Step 5: Install dependencies
            $this->updateProgress('installing', 60, 'Installing npm dependencies...', $logs);
            $logs = $this->addLog("Installing npm dependencies (this may take a few minutes)...", $logs);
            
            $oldCwd = getcwd();
            chdir($targetDir);
            
            $output = [];
            $returnVar = 0;
            exec('npm install 2>&1', $output, $returnVar);
            
            if ($returnVar !== 0) {
                $errorOutput = implode("\n", $output);
                $logs = $this->addLog("ERROR: npm install failed", $logs);
                $logs = $this->addLog($errorOutput, $logs);
                throw new Exception("npm install failed: " . substr($errorOutput, 0, 200));
            }
            
            $logs = $this->addLog("npm install completed successfully", $logs);
            chdir($oldCwd);
            
            // Step 6: Build application
            $this->updateProgress('building', 80, 'Building application...', $logs);
            $logs = $this->addLog("Building application (this may take a few minutes)...", $logs);
            
            // Clean dist folder if exists
            $distDir = $targetDir . DIRECTORY_SEPARATOR . 'dist';
            if (is_dir($distDir)) {
                $this->deleteDirectory($distDir);
            }
            
            chdir($targetDir);
            $output = [];
            $returnVar = 0;
            exec('npm run build 2>&1', $output, $returnVar);
            
            if ($returnVar !== 0) {
                $errorOutput = implode("\n", $output);
                $logs = $this->addLog("WARNING: npm run build failed", $logs);
                $logs = $this->addLog($errorOutput, $logs);
                $logs = $this->addLog("Clone completed but build failed. You may need to run 'npm run build' manually.", $logs);
            } else {
                $logs = $this->addLog("Build completed successfully", $logs);
                
                // Clean up node_modules
                $nodeModulesDir = $targetDir . DIRECTORY_SEPARATOR . 'node_modules';
                if (is_dir($nodeModulesDir)) {
                    $this->deleteDirectory($nodeModulesDir);
                    $logs = $this->addLog("Cleaned up node_modules", $logs);
                }
            }
            
            chdir($oldCwd);
            
            // Step 7: Create README
            $this->updateProgress('finalizing', 95, 'Finalizing...', $logs);
            $logs = $this->addLog("Creating deployment README...", $logs);
            
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
            
            file_put_contents($targetDir . DIRECTORY_SEPARATOR . 'DEPLOYMENT.md', $readmeContent);
            
            // Determine URL - simple format: http://localhost/folderName/
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            // Just use localhost with folder name, no path components
            $url = "$protocol://$host/$folderName/";
            
            // Update database with completion
            if ($this->cloneId) {
                $stmt = $this->db->prepare('UPDATE clones SET status = ?, progress = 100, completed_at = ?, url = ? WHERE id = ?');
                $stmt->execute(['completed', time(), $url, $this->cloneId]);
            }
            
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
            $logs = $this->addLog("ERROR: " . $e->getMessage(), $logs);
            $this->updateProgress('error', 0, $e->getMessage(), $logs);
            
            if ($this->cloneId) {
                $stmt = $this->db->prepare('UPDATE clones SET status = ?, error_message = ? WHERE id = ?');
                $stmt->execute(['failed', $e->getMessage(), $this->cloneId]);
            }
            
            throw $e;
        }
    }
    
    /**
     * Recursively delete directory
     */
    private function deleteDirectory($dir) {
        if (!is_dir($dir)) {
            return;
        }
        
        $files = array_diff(scandir($dir), ['.', '..']);
        foreach ($files as $file) {
            $path = $dir . DIRECTORY_SEPARATOR . $file;
            if (is_dir($path)) {
                $this->deleteDirectory($path);
            } else {
                unlink($path);
            }
        }
        rmdir($dir);
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

