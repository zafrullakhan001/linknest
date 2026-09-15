/**
 * Start PHP's built-in server for `npm run dev` so API/uploads work without Apache.
 * Reuses an already-open port (for example a leftover `php -S`) instead of failing.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findPhp() {
  const fromEnv = process.env.PHP_BINARY || process.env.PHP_PATH;
  const candidates = [
    fromEnv,
    path.join('C:', 'xampp', 'php', 'php.exe'),
    path.join('D:', 'php', 'php.exe'),
    path.join('D:', 'xampp', 'php', 'php.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'php';
}

function isPortOpen(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, host, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`PHP did not listen on ${host}:${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryOnce, 100);
      });
    };
    tryOnce();
  });
}

let child = null;
let startedByUs = false;
let stopping = false;
let respawning = false;

function stopPhp() {
  if (stopping || !child || !startedByUs) return;
  stopping = true;
  const pid = child.pid;
  child = null;
  startedByUs = false;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function ensurePhp({ port, host }) {
  if (await isPortOpen(port, host)) {
    console.log(`[linknest-php] using existing backend at http://${host}:${port}`);
    return;
  }

  const php = findPhp();
  stopping = false;
  child = spawn(php, ['-S', `${host}:${port}`, '-t', root], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  startedByUs = true;
  const log = (buf) => {
    const line = String(buf).trim();
    if (line) console.log(`[php] ${line}`);
  };
  child.stdout?.on('data', log);
  child.stderr?.on('data', log);
  child.on('exit', (code) => {
    const wasOurs = startedByUs;
    child = null;
    startedByUs = false;
    if (stopping) return;
    if (wasOurs) {
      console.error(`[linknest-php] PHP exited${code != null ? ` with code ${code}` : ''}; restarting`);
      if (!respawning) {
        respawning = true;
        setTimeout(() => {
          respawning = false;
          ensurePhp({ port, host }).catch((err) => {
            console.error(`[linknest-php] ${err.message}`);
          });
        }, 500);
      }
    }
  });

  try {
    await waitForPort(port, host, 8000);
    console.log(`[linknest-php] ${php} -S ${host}:${port}`);
  } catch (err) {
    console.error(`[linknest-php] ${err.message}`);
    console.error('[linknest-php] API requests will fail until PHP is available.');
  }
}

export function phpDevServerPlugin({ port = 8000, host = '127.0.0.1', disabled = false, proxyLabel = '' } = {}) {
  return {
    name: 'linknest-php-dev',
    apply: 'serve',
    async configureServer(server) {
      if (disabled) {
        console.log(`[linknest] Dev app:  http://localhost:${server.config.server.port || 3000}/`);
        console.log(`[linknest] Dev API:  ${proxyLabel || 'Apache'} (php -S skipped)`);
        return;
      }

      await ensurePhp({ port, host });

      console.log(`[linknest] Dev app:  http://localhost:${server.config.server.port || 3000}/`);
      console.log(`[linknest] Dev API:  http://${host}:${port}/api/index.php`);

      // Do not stop PHP when Vite restarts on config change — only when the Node process exits.
      process.once('exit', stopPhp);
      process.once('SIGINT', stopPhp);
      process.once('SIGTERM', stopPhp);
    },
  };
}
