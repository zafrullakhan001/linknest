#!/usr/bin/env node
/**
 * LinkNest MCP stdio adapter.
 *
 * Forwards JSON-RPC from stdin to the LinkNest Streamable HTTP endpoint
 * so Claude Desktop / Cursor can spawn a local process.
 *
 * Env:
 *   LINKNEST_URL    Base URL, e.g. http://localhost/linknest
 *   LINKNEST_TOKEN  Token from Admin → MCP / AI (lnmcp_…)
 *   LINKNEST_INSECURE_TLS=1  Allow self-signed HTTPS
 */

import { stdin, stdout, stderr } from 'node:process';

const BASE = String(process.env.LINKNEST_URL || '').replace(/\/+$/, '');
const TOKEN = String(process.env.LINKNEST_TOKEN || '').trim();
const ENDPOINT = `${BASE}/api/mcp`;

if (!BASE || !TOKEN) {
  stderr.write('LINKNEST_URL and LINKNEST_TOKEN are required.\n');
  process.exit(1);
}

if (process.env.LINKNEST_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

async function postMessage(message) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(message),
  });

  if (response.status === 202) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      return {
        jsonrpc: '2.0',
        id: message?.id ?? null,
        error: { code: -32000, message: `HTTP ${response.status}` },
      };
    }
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: { code: -32700, message: 'Invalid JSON from LinkNest MCP endpoint' },
    };
  }
}

function writeMessage(obj) {
  stdout.write(`${JSON.stringify(obj)}\n`);
}

let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    postMessage(message)
      .then((result) => {
        if (result != null) writeMessage(result);
      })
      .catch((err) => {
        writeMessage({
          jsonrpc: '2.0',
          id: message?.id ?? null,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
        });
      });
  }
});

stdin.on('end', () => process.exit(0));
