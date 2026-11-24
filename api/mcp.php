<?php
/**
 * LinkNest MCP (Model Context Protocol) endpoint.
 *
 * Streamable HTTP transport: POST JSON-RPC to /api/mcp with
 * Authorization: Bearer lnmcp_…
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-03-26
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mcp_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'DELETE') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    header('Allow: POST, DELETE, OPTIONS');
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Use HTTP POST with a JSON-RPC body for MCP. GET SSE streams are not required by this server.',
        'endpoint' => 'POST /api/mcp',
        'auth' => 'Authorization: Bearer lnmcp_…',
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if ($method !== 'POST') {
    header('Allow: POST, DELETE, OPTIONS');
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_SLASHES);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    mcpHttpJsonRpcError(null, -32700, 'Parse error: empty body', 400);
}

$decoded = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || (!is_array($decoded))) {
    mcpHttpJsonRpcError(null, -32700, 'Parse error: invalid JSON', 400);
}

$user = getMcpTokenUser();
if (!$user) {
    header('WWW-Authenticate: Bearer realm="LinkNest MCP", error="invalid_token"');
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => is_array($decoded) && !mcpIsJsonRpcBatch($decoded) ? ($decoded['id'] ?? null) : null,
        'error' => [
            'code' => -32001,
            'message' => 'Authentication required. Create an MCP token in Admin → MCP / AI and send it as Authorization: Bearer lnmcp_…',
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

header('MCP-Protocol-Version: ' . MCP_DEFAULT_PROTOCOL_VERSION);

if (mcpIsJsonRpcBatch($decoded)) {
    $out = [];
    foreach ($decoded as $message) {
        if (!is_array($message)) {
            continue;
        }
        $result = mcpHandleMessage($message, $user);
        if ($result !== null) {
            $out[] = $result;
        }
    }
    if ($out === []) {
        http_response_code(202);
        exit;
    }
    mcpSendJson($out);
}

$result = mcpHandleMessage($decoded, $user);
if ($result === null) {
    http_response_code(202);
    exit;
}
mcpSendJson($result);
