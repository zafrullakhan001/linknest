<?php
require_once __DIR__ . '/api/session_bootstrap.php';
linknestConfigureSession();
session_start();
require_once __DIR__ . '/api/config.php';

// Handle Database Switching
$dataDir = __DIR__ . '/data';
$dbFiles = glob($dataDir . '/*.db');
$availableDbs = array_map('basename', $dbFiles);

if (isset($_GET['switch_db'])) {
    if (in_array($_GET['switch_db'], $availableDbs) || $_GET['switch_db'] === 'default') {
        $_SESSION['current_db'] = $_GET['switch_db'];
    }
    // Redirect to remove query param
    header("Location: clones.php");
    exit;
}

$currentDb = $_SESSION['current_db'] ?? 'default';

// CSS styles
$css = "
<link href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap' rel='stylesheet'>
<style>
    :root {
        --primary: #6366f1; /* Indigo 500 */
        --primary-hover: #4f46e5; /* Indigo 600 */
        --bg-color: #f9fafb; /* Gray 50 */
        --card-bg: #ffffff;
        --text-main: #111827; /* Gray 900 */
        --text-secondary: #4b5563; /* Gray 600 */
        --text-muted: #9ca3af; /* Gray 400 */
        --border-color: #e5e7eb; /* Gray 200 */
        --success-bg: #ecfdf5;
        --success-text: #059669;
        --danger-bg: #fef2f2;
        --danger-text: #dc2626;
        --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --radius: 12px;
    }

    * { box-sizing: border-box; }

    body { 
        font-family: 'Inter', system-ui, -apple-system, sans-serif; 
        background-color: var(--bg-color); 
        color: var(--text-main); 
        margin: 0; 
        padding: 40px 20px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
    }

    .container { 
        max-width: 1100px; 
        margin: 0 auto; 
        background: var(--card-bg); 
        border-radius: var(--radius); 
        box-shadow: var(--shadow); 
        overflow: hidden;
        border: 1px solid var(--border-color);
    }

    /* Header & Titles */
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 24px 32px;
        border-bottom: 1px solid var(--border-color);
        background: #ffffff;
    }
    
    .page-header h1 { 
        margin: 0;
        padding: 0;
        border: none;
        font-size: 1.5rem; 
        font-weight: 700; 
        color: var(--text-main);
        letter-spacing: -0.025em;
    }

    .db-switcher form {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .db-switcher select {
        padding: 6px 12px;
        font-size: 0.85rem;
        border-radius: 6px;
        width: auto;
        cursor: pointer;
        background-color: #f9fafb;
    }

    /* Forms & Inputs */
    .form-group { margin-bottom: 20px; }
    label { 
        display: block; 
        margin-bottom: 8px; 
        font-weight: 500; 
        color: var(--text-main); 
        font-size: 0.875rem;
    }
    input[type='text'], input[type='number'], select, textarea { 
        width: 100%; 
        padding: 10px 12px; 
        border: 1px solid var(--border-color); 
        border-radius: 8px; 
        font-size: 0.95rem; 
        transition: all 0.2s;
        background: #fdfdfd;
        color: var(--text-main);
    }
    input:focus, select:focus, textarea:focus { 
        outline: none; 
        border-color: var(--primary); 
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); 
        background: #fff;
    }

    /* Buttons */
    .btn { 
        display: inline-flex; 
        align-items: center;
        justify-content: center;
        padding: 10px 18px; 
        border-radius: 8px; 
        text-decoration: none; 
        font-weight: 500; 
        cursor: pointer; 
        border: 1px solid transparent; 
        font-size: 0.875rem; 
        transition: all 0.2s; 
        gap: 6px;
    }
    .btn-primary { 
        background-color: var(--primary); 
        color: white; 
        box-shadow: var(--shadow-sm);
    }
    .btn-primary:hover { 
        background-color: var(--primary-hover); 
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.3);
    }
    .btn-secondary { 
        background-color: #fff; 
        color: var(--text-secondary); 
        border-color: var(--border-color); 
    }
    .btn-secondary:hover { 
        background-color: #f9fafb; 
        border-color: #d1d5db; 
        color: var(--text-main);
    }
    .btn-danger { 
        background-color: var(--danger-text); 
        color: white; 
    }
    .btn-danger:hover { 
        background-color: #b91c1c; 
    }
    .btn-sm { 
        padding: 6px 12px; 
        font-size: 0.8rem; 
        border-radius: 6px;
    }

    /* Table */
    .table-responsive {
        width: 100%;
        overflow-x: auto;
    }
    table { 
        width: 100%; 
        border-collapse: collapse; 
        margin: 0; 
    }
    th, td { 
        padding: 16px 24px; 
        text-align: left; 
        border-bottom: 1px solid var(--border-color); 
    }
    th { 
        background-color: #f8fafc; 
        font-weight: 600; 
        color: var(--text-secondary); 
        font-size: 0.75rem; 
        text-transform: uppercase; 
        letter-spacing: 0.05em;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background-color: #f9fafb; }
    
    td {
        color: var(--text-secondary);
        font-size: 0.9rem;
    }
    td:first-child { 
        color: var(--text-secondary); 
        font-variant-numeric: tabular-nums;
        width: 60px;
    }
    td:nth-child(2) {
        font-weight: 500;
        color: var(--text-main);
    }

    /* Alerts */
    .alert { padding: 16px; margin: 20px; border-radius: 8px; border: 1px solid transparent; font-size: 0.9rem; }
    .alert-success { background-color: var(--success-bg); color: var(--success-text); border-color: #d1fae5; }
    .alert-error { background-color: var(--danger-bg); color: var(--danger-text); border-color: #fee2e2; }

    /* Links */
    a.link-url {
        color: var(--primary);
        text-decoration: none;
        transition: color 0.1s;
    }
    a.link-url:hover { 
        color: var(--primary-hover); 
        text-decoration: underline; 
    }
    
    .back-link {
        display: inline-block;
        margin-bottom: 20px;
        color: var(--text-secondary);
        text-decoration: none;
        font-weight: 500;
    }
    .back-link:hover { color: var(--primary); }

    /* Search & Pagination */
    .content-wrapper { padding: 24px 32px; }
    
    .search-container { 
        display: flex; 
        gap: 12px; 
        margin-bottom: 24px;
        background: #f9fafb;
        padding: 4px;
        border-radius: 10px;
        border: 1px solid var(--border-color);
    }
    .search-container input { 
        border: none; 
        background: transparent; 
        box-shadow: none !important;
        padding: 12px 16px;
        font-size: 0.95rem;
    }
    .search-container .btn {
        border-radius: 8px;
        padding: 8px 20px;
        margin: 4px;
    }

    .pagination { 
        display: flex; 
        justify-content: center; 
        gap: 6px; 
        margin-top: 32px; 
    }
    .pagination a, .pagination span { 
        min-width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px; 
        border: 1px solid var(--border-color); 
        border-radius: 6px; 
        text-decoration: none; 
        color: var(--text-secondary); 
        font-size: 0.875rem;
        background: white;
        transition: all 0.2s;
    }
    .pagination a:hover { 
        background-color: #f9fafb; 
        border-color: #d1d5db; 
        color: var(--text-main);
    }
    .pagination .active { 
        background-color: var(--primary); 
        color: white; 
        border-color: var(--primary); 
    }
    .pagination .disabled { 
        color: var(--text-muted); 
        pointer-events: none; 
        background: #f9fafb;
        border-color: #e5e7eb;
    }
    
    .footer-stat {
        background: #f9fafb;
        padding: 16px 32px;
        border-top: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
    }
</style>
";

// Helper functions
function getDBConnection() {
    global $currentDb, $dataDir;
    
    if ($currentDb !== 'default') {
        $dbPath = $dataDir . '/' . $currentDb;
        if (file_exists($dbPath)) {
            try {
                $db = new PDO('sqlite:' . $dbPath);
                $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                // Basic optimizations
                $db->exec('PRAGMA busy_timeout = 5000');
                try { $db->exec('PRAGMA journal_mode = WAL'); } catch(Exception $e) {}
                return $db;
            } catch (Exception $e) {
                // If connection fails, treat as fatal for this page
                die("Failed to connect to selected database ($currentDb): " . $e->getMessage());
            }
        }
    }
    return getDB(); // Defined in config.php
}

function getClones($search = '', $page = 1, $perPage = 50) {
    $db = getDBConnection();
    $offset = ($page - 1) * $perPage;
    $params = [];
    $whereClause = "";

    if (!empty($search)) {
        $searchTerm = "%$search%";
        $whereClause = "WHERE folder_name LIKE :search 
                        OR source_path LIKE :search 
                        OR target_path LIKE :search 
                        OR full_path LIKE :search 
                        OR url LIKE :search 
                        OR status LIKE :search
                        OR id LIKE :search";
        $params[':search'] = $searchTerm;
    }

    // Get total count for pagination
    $countSql = "SELECT COUNT(*) FROM clones $whereClause";
    $stmtCount = $db->prepare($countSql);
    $stmtCount->execute($params);
    $totalRecords = $stmtCount->fetchColumn();

    // Get records
    $sql = "SELECT * FROM clones $whereClause ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
    $stmt = $db->prepare($sql);
    
    foreach ($params as $key => $val) {
        $stmt->bindValue($key, $val);
    }
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    
    return [
        'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        'total' => $totalRecords,
        'pages' => ceil($totalRecords / $perPage),
        'currentPage' => $page
    ];
}

function getClone($id) {
    $db = getDBConnection();
    $stmt = $db->prepare("SELECT * FROM clones WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function createClone($data) {
    $db = getDBConnection();
    $sql = "INSERT INTO clones (folder_name, source_path, target_path, full_path, url, status, progress, copy_assets, copy_database, created_at, created_by) 
            VALUES (:folder_name, :source_path, :target_path, :full_path, :url, :status, :progress, :copy_assets, :copy_database, :created_at, :created_by)";
    $stmt = $db->prepare($sql);
    
    $params = [
        ':folder_name' => $data['folder_name'],
        ':source_path' => $data['source_path'],
        ':target_path' => $data['target_path'],
        ':full_path' => $data['full_path'],
        ':url' => $data['url'],
        ':status' => $data['status'] ?? 'pending',
        ':progress' => $data['progress'] ?? 0,
        ':copy_assets' => isset($data['copy_assets']) ? 1 : 0,
        ':copy_database' => isset($data['copy_database']) ? 1 : 0,
        ':created_at' => time(),
        ':created_by' => 0 // Default to system/admin for now as we don't have session user here easily
    ];
    
    return $stmt->execute($params);
}

function updateClone($id, $data) {
    $db = getDBConnection();
    $sql = "UPDATE clones SET 
            folder_name = :folder_name,
            source_path = :source_path,
            target_path = :target_path,
            full_path = :full_path,
            url = :url,
            status = :status,
            progress = :progress,
            copy_assets = :copy_assets,
            copy_database = :copy_database
            WHERE id = :id";
    
    $stmt = $db->prepare($sql);
    
    $params = [
        ':id' => $id,
        ':folder_name' => $data['folder_name'],
        ':source_path' => $data['source_path'],
        ':target_path' => $data['target_path'],
        ':full_path' => $data['full_path'],
        ':url' => $data['url'],
        ':status' => $data['status'],
        ':progress' => $data['progress'],
        ':copy_assets' => isset($data['copy_assets']) ? 1 : 0,
        ':copy_database' => isset($data['copy_database']) ? 1 : 0
    ];
    
    return $stmt->execute($params);
}

function deleteClone($id) {
    $db = getDBConnection();
    $stmt = $db->prepare("DELETE FROM clones WHERE id = ?");
    return $stmt->execute([$id]);
}

// Handle Actions
$action = $_GET['action'] ?? 'list';
$search = $_GET['search'] ?? '';
$page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$perPage = 50;

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['create'])) {
        try {
            if (createClone($_POST)) {
                header("Location: clones.php?msg=created");
                exit;
            } else {
                $error = "Failed to create clone.";
            }
        } catch (Exception $e) {
            $error = "Error: " . $e->getMessage();
        }
    } elseif (isset($_POST['update'])) {
        try {
            if (updateClone($_POST['id'], $_POST)) {
                header("Location: clones.php?msg=updated");
                exit;
            } else {
                $error = "Failed to update clone.";
            }
        } catch (Exception $e) {
            $error = "Error: " . $e->getMessage();
        }
    } elseif (isset($_POST['delete'])) {
        try {
            if (deleteClone($_POST['id'])) {
                header("Location: clones.php?msg=deleted");
                exit;
            } else {
                $error = "Failed to delete clone.";
            }
        } catch (Exception $e) {
            $error = "Error: " . $e->getMessage();
        }
    }
}

if (isset($_GET['msg'])) {
    if ($_GET['msg'] === 'created') $message = "Clone created successfully.";
    if ($_GET['msg'] === 'updated') $message = "Clone updated successfully.";
    if ($_GET['msg'] === 'deleted') $message = "Clone deleted successfully.";
}

// Views
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Demands</title>
    <?= $css ?>
</head>
<body>
    <div class="container">
        <?php if ($action === 'create' || $action === 'edit'): ?>
            <?php 
                $clone = null;
                if ($action === 'edit' && isset($_GET['id'])) {
                    $clone = getClone($_GET['id']);
                }
                $isEdit = $clone !== null;
            ?>
            <div class="content-wrapper">
                <a href="clones.php" class="back-link">&larr; Back to List</a>
                
                <?php if ($message): ?>
                    <div class="alert alert-success"><?= htmlspecialchars($message) ?></div>
                <?php endif; ?>
                <?php if ($error): ?>
                    <div class="alert alert-error"><?= htmlspecialchars($error) ?></div>
                <?php endif; ?>

                <div style="margin-bottom: 24px;">
                    <h2 style="font-size: 1.5rem; margin: 0;"><?= $isEdit ? 'Edit Clone' : 'Create New Clone' ?></h2>
                </div>
                
                <form method="POST" action="clones.php">
                    <?php if ($isEdit): ?>
                        <input type="hidden" name="id" value="<?= $clone['id'] ?>">
                    <?php endif; ?>
                    
                    <div class="form-group">
                        <label for="folder_name">Solution Name</label>
                        <input type="text" id="folder_name" name="folder_name" required value="<?= $isEdit ? htmlspecialchars($clone['folder_name']) : '' ?>">
                    </div>
                    
                    <div class="form-group">
                        <label for="source_path">Source Path</label>
                        <input type="text" id="source_path" name="source_path" required value="<?= $isEdit ? htmlspecialchars($clone['source_path']) : '' ?>">
                    </div>
                    
                    <div class="form-group">
                        <label for="target_path">Target Path</label>
                        <input type="text" id="target_path" name="target_path" required value="<?= $isEdit ? htmlspecialchars($clone['target_path']) : '' ?>">
                    </div>
                    
                    <div class="form-group">
                        <label for="full_path">Full Path</label>
                        <input type="text" id="full_path" name="full_path" required value="<?= $isEdit ? htmlspecialchars($clone['full_path']) : '' ?>">
                    </div>
                    
                    <div class="form-group">
                        <label for="url">Landing Page URL</label>
                        <input type="text" id="url" name="url" required value="<?= $isEdit ? htmlspecialchars($clone['url']) : '' ?>">
                    </div>
                    
                    <div class="form-group">
                        <label for="status">Status</label>
                        <select id="status" name="status">
                            <option value="pending" <?= ($isEdit && $clone['status'] === 'pending') ? 'selected' : '' ?>>Pending</option>
                            <option value="processing" <?= ($isEdit && $clone['status'] === 'processing') ? 'selected' : '' ?>>Processing</option>
                            <option value="completed" <?= ($isEdit && $clone['status'] === 'completed') ? 'selected' : '' ?>>Completed</option>
                            <option value="failed" <?= ($isEdit && $clone['status'] === 'failed') ? 'selected' : '' ?>>Failed</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="progress">Progress (%)</label>
                        <input type="number" id="progress" name="progress" min="0" max="100" value="<?= $isEdit ? (int)$clone['progress'] : 0 ?>">
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="copy_assets" <?= ($isEdit && $clone['copy_assets']) ? 'checked' : '' ?> style="width: auto;"> Copy Assets
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="copy_database" <?= ($isEdit && $clone['copy_database']) ? 'checked' : '' ?> style="width: auto;"> Copy Database
                        </label>
                    </div>
                    
                    <div style="margin-top: 30px;">
                        <button type="submit" name="<?= $isEdit ? 'update' : 'create' ?>" class="btn btn-primary">
                            <?= $isEdit ? 'Update Clone' : 'Create Clone' ?>
                        </button>
                    </div>
                </form>
            </div>

        <?php elseif ($action === 'delete_confirm' && isset($_GET['id'])): ?>
            <?php $clone = getClone($_GET['id']); ?>
            <div class="content-wrapper">
                <a href="clones.php" class="back-link">&larr; Back to List</a>
                
                <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 24px; text-align: center; max-width: 500px; margin: 40px auto;">
                    <h2 style="color: #dc2626; margin-top: 0;">Delete Clone?</h2>
                    <p style="color: #4b5563; margin-bottom: 24px;">Are you sure you want to delete the record for <strong><?= htmlspecialchars($clone['folder_name']) ?></strong>?</p>
                    <form method="POST" action="clones.php">
                        <input type="hidden" name="id" value="<?= $clone['id'] ?>">
                        <div style="display: flex; gap: 12px; justify-content: center;">
                            <button type="submit" name="delete" class="btn btn-danger">Yes, Delete Forever</button>
                            <a href="clones.php" class="btn btn-secondary">Cancel</a>
                        </div>
                    </form>
                </div>
            </div>

        <?php else: ?>
            <div class="page-header">
                <h1>Demands</h1>
                <div class="db-switcher">
                    <form method="GET" action="clones.php">
                        <select name="switch_db" onchange="this.form.submit()">
                            <option value="default" <?= $currentDb === 'default' ? 'selected' : '' ?>>Default (linknest.db)</option>
                            <?php foreach ($availableDbs as $dbFile): 
                                if ($dbFile === 'linknest.db') continue; // Skip default if present to avoid confusion
                            ?>
                                <option value="<?= htmlspecialchars($dbFile) ?>" <?= $currentDb === $dbFile ? 'selected' : '' ?>>
                                    <?= htmlspecialchars($dbFile) ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </form>
                </div>
            </div>
            
            <?php if ($message): ?>
                <div class="alert alert-success"><?= htmlspecialchars($message) ?></div>
            <?php endif; ?>
            <?php if ($error): ?>
                <div class="alert alert-error"><?= htmlspecialchars($error) ?></div>
            <?php endif; ?>
            
            <div class="content-wrapper">
                <form method="GET" action="clones.php" class="search-container">
                    <input type="text" name="search" placeholder="Search by Solution, Landing Page, Status or ID..." value="<?= htmlspecialchars($search) ?>">
                    <?php if ($search): ?>
                        <a href="clones.php" class="btn btn-secondary" style="background: transparent; border: none; font-size: 1.2rem; color: #9ca3af; padding: 0 12px;">&times;</a>
                    <?php endif; ?>
                    <button type="submit" class="btn btn-primary" style="margin: 4px; border-radius: 6px;">Search</button>
                </form>
                
                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Solution</th>
                                <th>Landing Pages</th>
                                <th>Created At</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php 
                            $result = getClones($search, $page, $perPage);
                            $clones = $result['data'];
                            $totalPages = $result['pages'];
                            $totalRecords = $result['total'];
                            $offset = ($page - 1) * $perPage;
                            
                            if (count($clones) > 0):
                                foreach ($clones as $index => $clone): 
                            ?>
                            <tr>
                                <td><?= sprintf('%02d', $offset + $index + 1) ?></td>
                                <td>
                                    <div style="font-weight: 500; color: #111827;"><?= htmlspecialchars($clone['folder_name']) ?></div>
                                </td>
                                <td>
                                    <a href="<?= htmlspecialchars($clone['url']) ?>" target="_blank" class="link-url">
                                        <?= htmlspecialchars($clone['url']) ?>
                                    </a>
                                </td>
                                <td style="color: #6b7280; font-size: 0.85rem;">
                                    <?= date('M j, Y, g:i a', $clone['created_at']) ?>
                                </td>
                            </tr>
                            <?php 
                                endforeach; 
                            else:
                            ?>
                            <tr>
                                <td colspan="4" style="text-align: center; color: #6b7280; padding: 40px;">
                                    <div style="font-size: 3rem; margin-bottom: 10px;">🔍</div>
                                    <div>No demands found matching your criteria.</div>
                                </td>
                            </tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
                
                <?php if ($totalPages > 1): ?>
                    <div class="pagination">
                        <?php if ($page > 1): ?>
                            <a href="?page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>">&larr;</a>
                        <?php else: ?>
                            <span class="disabled">&larr;</span>
                        <?php endif; ?>
                        
                        <?php 
                        // Intelligent pagination range
                        $range = 2;
                        $start = max(1, $page - $range);
                        $end = min($totalPages, $page + $range);
                        
                        if ($start > 1) {
                            echo '<a href="?page=1&search='.urlencode($search).'">1</a>';
                            if ($start > 2) echo '<span class="disabled">...</span>';
                        }
                        
                        for ($i = $start; $i <= $end; $i++): ?>
                            <a href="?page=<?= $i ?>&search=<?= urlencode($search) ?>" class="<?= $i === $page ? 'active' : '' ?>"><?= $i ?></a>
                        <?php endfor; 
                        
                        if ($end < $totalPages) {
                            if ($end < $totalPages - 1) echo '<span class="disabled">...</span>';
                            echo '<a href="?page='.$totalPages.'&search='.urlencode($search).'">'.$totalPages.'</a>';
                        }
                        ?>
                        
                        <?php if ($page < $totalPages): ?>
                            <a href="?page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>">&rarr;</a>
                        <?php else: ?>
                            <span class="disabled">&rarr;</span>
                        <?php endif; ?>
                    </div>
                <?php endif; ?>
            </div>
            
            <div class="footer-stat">
                <span>Total Items</span>
                <span style="color: var(--text-main); font-weight: 600;"><?= number_format($totalRecords) ?></span>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
