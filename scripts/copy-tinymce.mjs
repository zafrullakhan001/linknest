import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'tinymce');
const dest = join(root, 'public', 'tinymce');

if (!existsSync(src)) {
  console.warn('[copy-tinymce] node_modules/tinymce not found — skip');
  process.exit(0);
}

const items = ['tinymce.min.js', 'tinymce.js', 'icons', 'models', 'plugins', 'skins', 'themes', 'langs'];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

for (const item of items) {
  const from = join(src, item);
  if (!existsSync(from)) continue;
  cpSync(from, join(dest, item), { recursive: true });
}

console.log('[copy-tinymce] Copied TinyMCE assets to public/tinymce');
