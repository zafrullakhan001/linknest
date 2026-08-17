<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/access_restrictions_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

if ($method === 'POST' && ($path === '/check' || $path === 'check')) {
    handleAccessRestrictionsCheck();
} else {
    sendJSON(['error' => 'Invalid endpoint'], 404);
}

function handleAccessRestrictionsCheck(): void {
    $data = getJSONInput();
    $entityType = strtolower(trim((string) ($data['entityType'] ?? $data['entity_type'] ?? '')));
    $id = trim((string) ($data['id'] ?? ''));
    if ($id === '' || !in_array($entityType, ['tile', 'tab', 'link'], true)) {
        sendJSON(['error' => 'entityType and id are required'], 400);
        return;
    }

    $result = evaluate_entity_access_chain($entityType, $id);
    if (($result['reason'] ?? '') === 'not_found') {
        sendJSON(['error' => 'Not found'], 404);
        return;
    }

    sendJSON([
        'allowed' => !empty($result['allowed']),
        'message' => $result['message'] ?? null,
        'reason' => $result['reason'] ?? null,
        'failedAt' => $result['failedAt'] ?? null,
    ]);
}
