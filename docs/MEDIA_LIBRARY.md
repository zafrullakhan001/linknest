# Media Library

LinkNest includes a Joomla-style **Media Library**: a shared site repository for images, PDFs, audio, and video.

## Who can use it

| Action | Who |
|--------|-----|
| Upload, tags, archive, trash, delete, image edit, rename/delete folders | **Admins only** (manage surfaces) |
| Create **subfolders** | **Admins** (including from the rich-text picker) |
| Browse / search / insert into rich text | Any **authenticated** user |
| Floating Media widget + Admin → Media Library tab | **Admins only** |
| Public file URLs (`/uploads/media_*`) | Readable without login (so guest-visible spaces keep working) |

## Surfaces

1. **Admin → Tools → Media Library** — full management UI  
2. **Floating widget** — nav icon (admins) or Ctrl+Shift+Y → Media Library  
3. **Rich text editors** — **Insert Media** (TinyMCE) / Media Library (Simple) and section “From library”

## Folders

- Folders are a **virtual tree** in SQLite (`media_folders.parent_id`), not nested directories on disk.
- The sidebar shows a **collapsible folder tree** with breadcrumb + Up.
- Last opened folder is remembered in `localStorage` (`linknest.mediaLibrary.lastFolderId.v1`) across Admin, widget, and picker.
- Create a **subfolder** under the current folder with the sidebar “New subfolder” field (admins).
- **Delete folder** (manage UI): confirms first, then **cascades** — all nested subfolders are removed and every file in the subtree is moved to **Trash** (recoverable). The root `Library` folder cannot be deleted if it is the only root.

## Rich text insert (Joomla-style)

1. Open **Insert Media** from TinyMCE (toolbar or Insert menu), or the Media Library control in the Simple editor.
2. Browse folders; **single-click** a file to preview it in the detail pane.
3. Click **Insert into editor** (or **double-click** the file) to place HTML at the **caret**.
4. After insert, drag TinyMCE’s **resize handles** on images, videos, and YouTube iframes to fit the layout.

### YouTube

In the picker, open **YouTube**, paste a watch / share / Shorts URL (or 11-char id), preview the thumbnail, then **Insert**. The editor stores a resizable iframe embed (CSP allows `youtube.com` / `youtube-nocookie.com` inside the TinyMCE iframe).

## File storage

- Files are stored flat under `uploads/` as `media_{uuid}.{ext}` (and optional `media_{uuid}_thumb.webp|jpg`).
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

## Archive vs trash vs delete

- **Archive** — hides from the default library; file remains on the public URL path.  
- **Delete** (from library) — moves the file to **Trash** (soft-delete; recoverable).  
- **Delete** (from Trash) — permanent delete (disk + DB row). One control: deletes the selection, or all of Trash if nothing is selected.

## Image quality and viewing

- Uploads **keep the original file bytes** by default (no GD re-encode). Check **Optimize** on the upload bar only when you want a 2560px cap + re-encode.
- Grid tiles use a **480px** thumbnail (sharp on retina). The detail pane and **View full size** / double-click open a lightbox with the **original** image (fit or actual size, prev/next, download).
- Phone JPEGs: EXIF orientation is applied to thumbnails and recorded width/height; the original file is unchanged.

## Image editing

Admins can resize, crop, **rotate** (90° steps), compress (quality/format), and **remove background color** (chroma-key via PHP GD — same path as logo/favicon helpers).

- Single-file editor: format defaults to the original (JPEG stays JPEG); size presets; live size estimate; **Fit** vs **Exact** resize; crop overlay tracks the image. **Save as new** by default (keeps existing rich-text embeds working); optional **Replace original**.
- Bulk toolbar (selected images): rotate L/R, **Compress…** (choose max edge, quality, format), convert to JPG, remove BG — these **replace** the selected files in place.
- **Undo Remove BG**: after Remove BG (bulk or Edit image with “Replace original”), an **Undo** banner restores the previous image from a local backup under `uploads/.media_undo/`.
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
- `POST /batch-trash` — soft-delete multiple ids (Move to Trash)  
- `DELETE /{id}` — Trash, or permanent Delete if already in Trash  
- `POST /purge`, `POST /purge-all` — permanent Delete from Trash

## Related code

- [`api/media.php`](../api/media.php), [`api/media_lib.php`](../api/media_lib.php)  
- [`components/MediaLibrary.tsx`](../components/MediaLibrary.tsx)  
- [`components/MediaPickerModal.tsx`](../components/MediaPickerModal.tsx)  
- [`services/mediaService.ts`](../services/mediaService.ts) (`mediaFileToInsertHtml`)  
- [`utils/youtube.ts`](../utils/youtube.ts) (`youtubeToInsertHtml`)  
- [`public/tinymce-editor.html`](../public/tinymce-editor.html) (Insert Media, CSP, object resize)  
- Schema version **103** (`media_*` tables)
