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

    $hash = $data['fingerprintHash'] ?? $data['fingerprint_hash'] ?? '';
    $hashes = $data['fingerprintHashes'] ?? $data['fingerprint_hashes'] ?? null;
    $result = evaluate_entity_access_chain($entityType, $id, [
        'fingerprint_hash' => is_scalar($hash) ? (string) $hash : '',
        'fingerprint_hashes' => is_array($hashes) ? $hashes : null,
    ]);
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
