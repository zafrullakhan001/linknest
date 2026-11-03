<?php
/**
 * Admin user export / import API (JSON / CSV).
 * Routes: POST /api/user-transfer/export, POST /api/user-transfer/import
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user_transfer_lib.php';
require_once __DIR__ . '/user_audit_helper.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim($path, '/') ?: '/';

switch ($method) {
    case 'POST':
        if ($path === '/export') {
            handleUserTransferExport();
        } elseif ($path === '/import') {
            handleUserTransferImport();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleUserTransferExport(): void
{
    requireAdmin();

    $data = getJSONInput();
    $userIds = $data['userIds'] ?? $data['user_ids'] ?? null;
    if (!is_array($userIds) || empty($userIds)) {
        sendJSON(['error' => 'Select at least one user to export'], 400);
    }

    $format = strtolower(trim((string) ($data['format'] ?? 'json')));
    if ($format !== 'json' && $format !== 'csv') {
        sendJSON(['error' => 'format must be json or csv'], 400);
    }

    $includeHashes = !empty($data['includePasswordHashes']) || !empty($data['include_password_hashes']);

    try {
        $db = getDB();
        $rows = userTransferBuildExportRows($db, $userIds, $includeHashes);
        if (empty($rows)) {
            sendJSON(['error' => 'None of the selected users were found'], 404);
        }

        $stamp = date('Ymd-Hi');
        if ($format === 'csv') {
            $body = userTransferBuildCsvDocument($rows, $includeHashes);
            $filename = 'linknest-users-' . $stamp . '.csv';
            header('Content-Type: text/csv; charset=utf-8');
        } else {
            $body = userTransferBuildJsonDocument($rows, $includeHashes);
            $filename = 'linknest-users-' . $stamp . '.json';
            header('Content-Type: application/json; charset=utf-8');
        }

        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Content-Length: ' . strlen($body));
        echo $body;
        exit;
    } catch (Throwable $e) {
        error_log('user-transfer export: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to export users'], 500);
    }
}

function handleUserTransferImport(): void
{
    requireAdmin();

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        sendJSON(['error' => 'Upload a JSON or CSV file'], 400);
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'Upload failed'], 400);
    }

    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0) {
        sendJSON(['error' => 'Uploaded file is empty'], 400);
    }
    if ($size > LINKNEST_USER_TRANSFER_MAX_BYTES) {
        sendJSON(['error' => 'File is too large (max 2 MB)'], 400);
    }

    $name = (string) ($file['name'] ?? '');
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext !== 'json' && $ext !== 'csv') {
        sendJSON(['error' => 'File must be .json or .csv'], 400);
    }

    $tmp = (string) ($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        sendJSON(['error' => 'Invalid upload'], 400);
    }

    $text = file_get_contents($tmp);
    if ($text === false || $text === '') {
        sendJSON(['error' => 'Failed to read uploaded file'], 400);
    }

    try {
        if ($ext === 'json') {
            $users = userTransferParseJsonUsers($text);
        } else {
            $users = userTransferParseCsvUsers($text);
        }
    } catch (InvalidArgumentException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Throwable $e) {
        error_log('user-transfer parse: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to parse file'], 400);
    }

    if (empty($users)) {
        sendJSON(['error' => 'No users found in file'], 400);
    }

    try {
        $db = getDB();
        $result = userTransferImportUsers($db, $users);

        if (function_exists('logUserAuditBulkCreated')) {
            logUserAuditBulkCreated('user_transfer', $result['success'], [
                'skipped' => $result['summary']['skipped'],
                'errors' => $result['summary']['errors'],
                'total' => $result['summary']['total'],
            ]);
        }

        $created = $result['summary']['created'];
        $skipped = $result['summary']['skipped'];
        $errors = $result['summary']['errors'];
        $total = $result['summary']['total'];

        sendJSON([
            'success' => true,
            'message' => "Processed $total users. $created created, $skipped skipped, $errors errors.",
            'results' => [
                'success' => $result['success'],
                'skipped' => $result['skipped'],
                'errors' => $result['errors'],
            ],
            'summary' => $result['summary'],
        ]);
    } catch (InvalidArgumentException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Throwable $e) {
        error_log('user-transfer import: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to import users'], 500);
    }
}
