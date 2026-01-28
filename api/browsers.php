<?php
/**
 * Browser List Management API
 * 
 * Stores and retrieves the browser list from the database
 * to avoid repeatedly fetching from the extension
 */

require_once __DIR__ . '/config.php';


// Ensure database tables exist
function ensureBrowsersTable($db) {
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS browser_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            browser_id TEXT NOT NULL UNIQUE,
            browser_name TEXT NOT NULL,
            browser_path TEXT,
            browser_version TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');
        
        $db->exec('CREATE TABLE IF NOT EXISTS browser_list_metadata (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            last_updated INTEGER NOT NULL,
            source TEXT NOT NULL
        )');
    } catch (Exception $e) {
        error_log('Failed to create browser tables: ' . $e->getMessage());
        // Don't throw - tables might already exist
    }
}


// Initialize database
try {
    error_log('Browsers API: Attempting to get database connection');
    $db = getDB();
    error_log('Browsers API: Database connection successful, ensuring tables');
    ensureBrowsersTable($db);
    error_log('Browsers API: Tables ensured successfully');
} catch (Exception $e) {
    error_log('Browsers API: Database initialization failed - ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Database initialization failed',
        'details' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
    exit;
}



// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Ensure session is started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Check authentication
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// For POST and DELETE, require admin access
if (in_array($method, ['POST', 'DELETE'])) {
    try {
        $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user || !$user['is_admin']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Admin access required']);
            exit;
        }
    } catch (Exception $e) {
        error_log('Failed to check admin status: ' . $e->getMessage());
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Failed to verify admin access',
            'details' => $e->getMessage()
        ]);
        exit;
    }
}


try {
    if ($method === 'GET') {
        // Get saved browser list
        $browsers = [];
        try {
            $stmt = $db->query('SELECT browser_id, browser_name, browser_path, browser_version FROM browser_list ORDER BY browser_name');
            if ($stmt) {
                $browsers = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            }
        } catch (PDOException $e) {
            error_log('Browser list query failed: ' . $e->getMessage());
            // Continue with empty array
            $browsers = [];
        }
        
        // Get metadata (may not exist yet)
        $metadata = null;
        try {
            $metaStmt = $db->query('SELECT last_updated, source FROM browser_list_metadata WHERE id = 1');
            if ($metaStmt) {
                $metadata = $metaStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            }
        } catch (PDOException $e) {
            // Metadata table might not have a row yet - that's okay
            error_log('Browser metadata query failed (non-critical): ' . $e->getMessage());
            $metadata = null;
        }
        
        header('Content-Type: application/json');
        $response = [
            'success' => true,
            'browsers' => $browsers,
            'metadata' => $metadata
        ];
        $json = json_encode($response);
        if ($json === false) {
            throw new Exception('Failed to encode JSON: ' . json_last_error_msg());
        }
        echo $json;
        
    } elseif ($method === 'POST') {
        // Save browser list from extension
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($input['browsers']) || !is_array($input['browsers'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid browser list data']);
            exit;
        }
        
        $db->beginTransaction();
        
        try {
            // Clear existing browser list
            $db->exec('DELETE FROM browser_list');
            
            // Insert new browser list
            $stmt = $db->prepare('INSERT INTO browser_list (browser_id, browser_name, browser_path, browser_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
            
            $now = time();
            foreach ($input['browsers'] as $browser) {
                $browserId = $browser['id'] ?? $browser;
                $browserName = $browser['name'] ?? $browserId;
                $browserPath = $browser['path'] ?? null;
                $browserVersion = $browser['version'] ?? null;
                
                $stmt->execute([
                    $browserId,
                    $browserName,
                    $browserPath,
                    $browserVersion,
                    $now,
                    $now
                ]);
            }
            
            // Update metadata
            $db->exec('DELETE FROM browser_list_metadata');
            $metaStmt = $db->prepare('INSERT INTO browser_list_metadata (id, last_updated, source) VALUES (1, ?, ?)');
            $metaStmt->execute([$now, 'extension']);
            
            $db->commit();
            
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'message' => 'Browser list saved successfully',
                'count' => count($input['browsers'])
            ]);
            
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
        
    } elseif ($method === 'DELETE') {
        // Clear browser list
        $db->beginTransaction();
        
        try {
            $db->exec('DELETE FROM browser_list');
            $db->exec('DELETE FROM browser_list_metadata');
            $db->commit();
            
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'message' => 'Browser list cleared successfully'
            ]);
            
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
        
    } else {
        http_response_code(405);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Method not allowed']);
    }
    
} catch (PDOException $e) {
    error_log('Browser API PDO error: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Database error',
        'details' => $e->getMessage()
    ]);
} catch (Exception $e) {
    error_log('Browser API error: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Failed to manage browser list',
        'details' => $e->getMessage()
    ]);
}
