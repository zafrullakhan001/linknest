# Media Library

LinkNest includes a Joomla-style **Media Library**: a shared site repository for images, PDFs, audio, and video.

## Who can use it

| Action | Who |
|--------|-----|
| Upload, folders, tags, archive, trash, purge, image edit | **Admins only** |
| Browse / search / insert into rich text | Any **authenticated** user |
| Floating Media widget + Admin → Media Library tab | **Admins only** |
| Public file URLs (`/uploads/media_*`) | Readable without login (so guest-visible spaces keep working) |

## Surfaces

1. **Admin → Tools → Media Library** — full management UI  
2. **Floating widget** — nav icon (admins) or Ctrl+Shift+Y → Media Library  
3. **Rich text editors** — Media Library button (Simple + TinyMCE “Media”) and section “From library”

## File storage

- Files are stored flat under `uploads/` as `media_{uuid}.{ext}` (and optional `media_{uuid}_thumb.webp|jpg`).
- Folders are **virtual** (database tree), not nested directories on disk.
- Trash moves files into `uploads/.media_trash/` (not publicly served).
- Active/archived files are served like other uploads via Apache `/uploads/` or `GET /api/uploads/{filename}`.

## Size limits

| Kind | Max size |
|------|----------|
| Images (JPEG, PNG, GIF, WebP, SVG) | 10 MB |
| PDF | 20 MB |
| Audio (MP3, WAV, OGG, M4A) | 25 MB |
| Video (MP4, WebM, OGV, MOV) | 50 MB |

If PHP `upload_max_filesize` / `post_max_size` are lower, raise them (videos need at least 50MB).

## Archive vs trash vs purge

- **Archive** — hides from the default library; file remains on the public URL path.  
- **Trash** — soft-delete; file moved off the public path.  
- **Purge / Empty trash** — permanent delete (disk + DB row).

## Image editing

Admins can resize, crop, **rotate** (90° steps), compress (quality/format), and **remove background color** (chroma-key via PHP GD — same path as logo/favicon helpers).

- Single-file editor: **Save as new** by default (keeps existing rich-text embeds working); optional **Replace original**.
- Bulk toolbar (selected images): rotate L/R, compress (max 1920px / quality 72), convert to JPG, remove BG — these **replace** the selected files in place.
- Also: **Select all** / **Select images** in the current folder view, and **Trash selected**.

Requires PHP **ext-gd**. Enable `extension=gd` in `php.ini` if transforms fail.

## API (summary)

Base: `/api/media` (session auth).

- `GET /` — list/search (`q`, `folder_id`, `kind`, `status`, `tag`, `page`)  
- `GET /folders`, `GET /tags`, `GET /{id}`  
- `POST /` — multipart upload (admin)  
- `POST /folders`, `PATCH /folders/{id}`, `DELETE /folders/{id}`  
- `PATCH /{id}` — metadata / status  
- `POST /{id}/transform` — image edit (resize, crop, rotate, compress, remove BG)  
- `POST /batch-transform` — same options for multiple image ids (admin; replaces in place by default)  
- `POST /batch-trash` — soft-delete multiple ids  
- `DELETE /{id}` — trash (or purge if already trash)  
- `POST /purge`, `POST /purge-all`

## Related code

- [`api/media.php`](../api/media.php), [`api/media_lib.php`](../api/media_lib.php)  
- [`components/MediaLibrary.tsx`](../components/MediaLibrary.tsx)  
- [`services/mediaService.ts`](../services/mediaService.ts)  
- Schema version **103** (`media_*` tables)
