/**
 * Copy self-hosted TinyMCE runtime assets into public/tinymce for Vite.
 * Runs on postinstall so Docker/XAMPP builds work offline without a CDN.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'node_modules', 'tinymce');
const dest = path.join(root, 'public', 'tinymce');

if (!fs.existsSync(src)) {
  console.warn('[copy-tinymce-assets] tinymce not installed; skip');
  process.exit(0);
}

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      copyRecursive(path.join(from, name), path.join(to, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const entries = ['tinymce.min.js', 'themes', 'models', 'icons', 'skins', 'plugins'];
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const name of entries) {
  const from = path.join(src, name);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-tinymce-assets] missing ${name}`);
    continue;
  }
  copyRecursive(from, path.join(dest, name));
}
console.log('[copy-tinymce-assets] synced to public/tinymce');
