<?php
/**
 * Shared GD image helpers for brand logos, favicons, and tile header images.
 *
 * REQUIREMENT — PHP GD extension (ext-gd):
 * - Background removal, PNG conversion, and resizing all use PHP's built-in GD library.
 * - No Composer/npm image library is needed on the frontend or backend.
 * - If backgrounds are not stripped / uploads fail with "GD image extension is required",
 *   enable GD in php.ini (Windows XAMPP: uncomment extension=gd) and restart Apache.
 * - Confirm with: php -m | findstr gd   (Windows) or php -m | grep gd  (Linux).
 * - WebP/BMP decode also needs GD built with WebP/BMP support (standard on PHP 8+ builds).
 */

/**
 * Load a GD image resource from an uploaded temp file.
 * @return \GdImage|resource|false
 */
function loadGdImageFromFile($tmpPath, $mimeType, $extension = '') {
    $ext = strtolower($extension);
    switch ($mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            return @imagecreatefromjpeg($tmpPath);
        case 'image/png':
            return @imagecreatefrompng($tmpPath);
        case 'image/gif':
            return @imagecreatefromgif($tmpPath);
        case 'image/webp':
            return function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmpPath) : false;
        case 'image/bmp':
        case 'image/x-ms-bmp':
            return function_exists('imagecreatefrombmp') ? @imagecreatefrombmp($tmpPath) : false;
        case 'image/x-icon':
        case 'image/vnd.microsoft.icon':
            // ICO: try PNG/JPEG decode via getimagesize + GD when possible
            $info = @getimagesize($tmpPath);
            if ($info && !empty($info['mime'])) {
                return loadGdImageFromFile($tmpPath, $info['mime'], $ext);
            }
            return false;
        default:
            if ($ext === 'jpg' || $ext === 'jpeg') {
                return @imagecreatefromjpeg($tmpPath);
            }
            if ($ext === 'png') {
                return @imagecreatefrompng($tmpPath);
            }
            if ($ext === 'gif') {
                return @imagecreatefromgif($tmpPath);
            }
            if ($ext === 'webp' && function_exists('imagecreatefromwebp')) {
                return @imagecreatefromwebp($tmpPath);
            }
            return false;
    }
}

/**
 * Resize a GD image to fit inside maxW×maxH (aspect preserved). Never upscales.
 * @param \GdImage|resource $src
 * @return \GdImage|resource
 */
function resizeGdImageFit($src, $maxW, $maxH) {
    $srcW = imagesx($src);
    $srcH = imagesy($src);
    if ($srcW <= 0 || $srcH <= 0) {
        return $src;
    }

    $scale = min($maxW / $srcW, $maxH / $srcH, 1.0);
    $dstW = max(1, (int) round($srcW * $scale));
    $dstH = max(1, (int) round($srcH * $scale));

    if ($dstW === $srcW && $dstH === $srcH) {
        return $src;
    }

    $dst = imagecreatetruecolor($dstW, $dstH);
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
    imagefilledrectangle($dst, 0, 0, $dstW, $dstH, $transparent);
    imagealphablending($dst, true);
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);
    imagedestroy($src);
    return $dst;
}

/**
 * Copy a GD image (preserves alpha). Caller owns the returned resource.
 * @param \GdImage|resource $src
 * @return \GdImage|resource|false
 */
function cloneGdImage($src) {
    $w = imagesx($src);
    $h = imagesy($src);
    if ($w <= 0 || $h <= 0) {
        return false;
    }
    $dst = imagecreatetruecolor($w, $h);
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
    imagefilledrectangle($dst, 0, 0, $w, $h, $transparent);
    imagealphablending($dst, true);
    imagecopy($dst, $src, 0, 0, 0, 0, $w, $h);
    return $dst;
}

/**
 * Write a square PNG without destroying the source image.
 * @param \GdImage|resource $src
 */
function saveGdImageExactSquarePng($src, $size, $filepath) {
    $copy = cloneGdImage($src);
    if ($copy === false) {
        return false;
    }
    $square = resizeGdImageExactSquare($copy, (int) $size);
    imagealphablending($square, false);
    imagesavealpha($square, true);
    $ok = imagepng($square, $filepath, 6);
    imagedestroy($square);
    return (bool) $ok;
}

/**
 * Ensure 192×192 and 512×512 PNG copies exist next to a raster favicon.
 * Chromium requires manifest icon `sizes` to match the decoded pixel dimensions;
 * `sizes: any` is only valid for SVG and triggers "Resource size is not correct".
 *
 * @return array<int,string> map of pixel size => filename in uploads/
 */
function ensurePwaFaviconIconFiles($sourceDisk) {
    $out = [];
    $sourceDisk = (string) $sourceDisk;
    if ($sourceDisk === '' || !is_file($sourceDisk) || !extension_loaded('gd')) {
        return $out;
    }
    $ext = strtolower(pathinfo($sourceDisk, PATHINFO_EXTENSION));
    if ($ext === 'svg') {
        return $out;
    }
    $base = pathinfo($sourceDisk, PATHINFO_FILENAME);
    if ($base === '' || preg_match('/_(192|512)$/', $base)) {
        return $out;
    }
    $dir = dirname($sourceDisk);

    $src = loadGdImageFromFile($sourceDisk, '', $ext);
    if ($src === false) {
        $info = @getimagesize($sourceDisk);
        if ($info && !empty($info['mime'])) {
            $src = loadGdImageFromFile($sourceDisk, $info['mime'], $ext);
        }
    }
    if ($src === false) {
        return $out;
    }

    foreach ([192, 512] as $size) {
        $filename = $base . '_' . $size . '.png';
        $filepath = $dir . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($filepath) && !saveGdImageExactSquarePng($src, $size, $filepath)) {
            continue;
        }
        if (is_file($filepath)) {
            $out[$size] = $filename;
        }
    }
    imagedestroy($src);
    return $out;
}

/**
 * Resize into an exact square canvas (centered, transparent padding).
 * @param \GdImage|resource $src
 * @return \GdImage|resource
 */
function resizeGdImageExactSquare($src, $size) {
    $srcW = imagesx($src);
    $srcH = imagesy($src);
    $scale = min($size / max(1, $srcW), $size / max(1, $srcH));
    $dstW = max(1, (int) round($srcW * $scale));
    $dstH = max(1, (int) round($srcH * $scale));
    $offsetX = (int) floor(($size - $dstW) / 2);
    $offsetY = (int) floor(($size - $dstH) / 2);

    $dst = imagecreatetruecolor($size, $size);
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
    imagefilledrectangle($dst, 0, 0, $size, $size, $transparent);
    imagealphablending($dst, true);
    imagecopyresampled($dst, $src, $offsetX, $offsetY, 0, 0, $dstW, $dstH, $srcW, $srcH);
    imagedestroy($src);
    return $dst;
}

/**
 * Auto-convert an uploaded image for logo or favicon use.
 * - SVG: stored as-is (background removal not applied)
 * - Raster: converted to PNG, resized to target; optional chroma-key background removal
 *
 * Background removal uses PHP GD only (see file header). Missing ext-gd → error below.
 *
 * @param bool $removeBackground When true, chroma-key background to transparency
 * @param string|null $bgColorHex Optional #rrggbb; when empty uses corner sampling
 * @return array{filename: string, filepath: string, converted: bool, width?: int, height?: int}
 */
function processUploadedBrandImage($tmpPath, $originalName, $mimeType, $kind, $removeBackground = false, $bgColorHex = null) {
    // REQUIRES: PHP GD (ext-gd). Not Imagick / not a frontend library.
    if (!extension_loaded('gd')) {
        sendJSON([
            'error' => 'PHP GD extension (ext-gd) is required for image conversion and background removal. Enable extension=gd in php.ini and restart Apache. Check: php -m | findstr gd'
        ], 500);
    }

    $uploadDir = __DIR__ . '/../uploads';
    if (!file_exists($uploadDir) && !mkdir($uploadDir, 0755, true)) {
        sendJSON(['error' => 'Failed to create uploads directory'], 500);
    }

    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $isSvg = ($mimeType === 'image/svg+xml' || $extension === 'svg');

    // Keep SVG as-is (vector logos/favicons) — chroma-key needs a raster
    if ($isSvg) {
        if ($removeBackground) {
            sendJSON(['error' => 'Background removal is not supported for SVG. Upload a PNG, JPEG, GIF, WebP, or ICO instead.'], 400);
        }
        $filename = ($kind === 'favicon' ? 'favicon_' : 'logo_') . time() . '_' . uniqid() . '.svg';
        $filepath = $uploadDir . '/' . $filename;
        if (!move_uploaded_file($tmpPath, $filepath) && !rename($tmpPath, $filepath) && !copy($tmpPath, $filepath)) {
            sendJSON(['error' => 'Failed to save uploaded file'], 500);
        }
        return ['filename' => $filename, 'filepath' => $filepath, 'converted' => false];
    }

    $src = loadGdImageFromFile($tmpPath, $mimeType, $extension);
    if ($src === false) {
        // Fallback: try getimagesize mime
        $info = @getimagesize($tmpPath);
        if ($info && !empty($info['mime'])) {
            $src = loadGdImageFromFile($tmpPath, $info['mime'], $extension);
        }
    }
    if ($src === false) {
        // Keep original when GD cannot decode (common for some .ico files)
        if ($removeBackground) {
            sendJSON(['error' => 'Could not decode image for background removal. Please upload JPEG, PNG, GIF, or WebP.'], 400);
        }
        $safeExt = preg_replace('/[^a-z0-9]/', '', $extension) ?: 'bin';
        if (!in_array($safeExt, ['ico', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], true)) {
            sendJSON(['error' => 'Could not read image. Please upload JPEG, PNG, GIF, WebP, SVG, or ICO.'], 400);
        }
        $filename = ($kind === 'favicon' ? 'favicon_' : 'logo_') . time() . '_' . uniqid() . '.' . $safeExt;
        $filepath = $uploadDir . '/' . $filename;
        if (!move_uploaded_file($tmpPath, $filepath) && !@rename($tmpPath, $filepath) && !@copy($tmpPath, $filepath)) {
            sendJSON(['error' => 'Failed to save uploaded file'], 500);
        }
        return ['filename' => $filename, 'filepath' => $filepath, 'converted' => false];
    }

    if ($removeBackground) {
        $rgb = $bgColorHex ? parseHexColorToRgb($bgColorHex) : null;
        if ($rgb === null) {
            $rgb = sampleCornerBackgroundColor($src);
        }
        if ($rgb !== null) {
            $src = removeGdImageBackgroundColor($src, $rgb[0], $rgb[1], $rgb[2]);
        }
    }

    if ($kind === 'favicon') {
        $stamp = time() . '_' . uniqid();
        foreach ([192, 512] as $pwaSize) {
            $pwaPath = $uploadDir . '/favicon_' . $stamp . '_' . $pwaSize . '.png';
            saveGdImageExactSquarePng($src, $pwaSize, $pwaPath);
        }
        $dst = resizeGdImageExactSquare($src, 32);
        $filename = 'favicon_' . $stamp . '.png';
    } else {
        $dst = resizeGdImageFit($src, 512, 512);
        $filename = 'logo_' . time() . '_' . uniqid() . '.png';
    }

    $filepath = $uploadDir . '/' . $filename;
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    if (!imagepng($dst, $filepath, 6)) {
        imagedestroy($dst);
        sendJSON(['error' => 'Failed to save converted image'], 500);
    }

    $width = imagesx($dst);
    $height = imagesy($dst);
    imagedestroy($dst);

    // Clean up temp upload if still present
    if (is_uploaded_file($tmpPath)) {
        @unlink($tmpPath);
    }

    return [
        'filename' => $filename,
        'filepath' => $filepath,
        'converted' => true,
        'width' => $width,
        'height' => $height
    ];
}

/**
 * Parse a CSS hex color (#rgb / #rrggbb) into [r,g,b] or null.
 * @return array{0:int,1:int,2:int}|null
 */
function parseHexColorToRgb($hex) {
    $hex = ltrim(trim((string)$hex), '#');
    if (preg_match('/^[0-9a-fA-F]{3}$/', $hex)) {
        $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
    }
    if (!preg_match('/^[0-9a-fA-F]{6}$/', $hex)) {
        return null;
    }
    return [
        hexdec(substr($hex, 0, 2)),
        hexdec(substr($hex, 2, 2)),
        hexdec(substr($hex, 4, 2))
    ];
}

/**
 * Sample corner pixels and return a background RGB if corners are similar.
 * @param \GdImage|resource $img
 * @return array{0:int,1:int,2:int}|null
 */
function sampleCornerBackgroundColor($img) {
    $w = imagesx($img);
    $h = imagesy($img);
    if ($w < 2 || $h < 2) {
        return null;
    }
    $points = [
        [0, 0],
        [$w - 1, 0],
        [0, $h - 1],
        [$w - 1, $h - 1],
        [(int)floor($w / 2), 0],
        [0, (int)floor($h / 2)]
    ];
    $colors = [];
    foreach ($points as $p) {
        $rgba = imagecolorat($img, $p[0], $p[1]);
        $colors[] = [
            ($rgba >> 16) & 0xFF,
            ($rgba >> 8) & 0xFF,
            $rgba & 0xFF
        ];
    }
    // Average of corner samples
    $n = count($colors);
    $r = (int)round(array_sum(array_column($colors, 0)) / $n);
    $g = (int)round(array_sum(array_column($colors, 1)) / $n);
    $b = (int)round(array_sum(array_column($colors, 2)) / $n);
    return [$r, $g, $b];
}

/**
 * Make pixels near the target RGB transparent (chroma-key style).
 * @param \GdImage|resource $src
 * @return \GdImage|resource
 */
function removeGdImageBackgroundColor($src, $r, $g, $b, $tolerance = 42) {
    $w = imagesx($src);
    $h = imagesy($src);
    $dst = imagecreatetruecolor($w, $h);
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
    imagefilledrectangle($dst, 0, 0, $w, $h, $transparent);

    $tol2 = $tolerance * $tolerance;
    for ($y = 0; $y < $h; $y++) {
        for ($x = 0; $x < $w; $x++) {
            $rgba = imagecolorat($src, $x, $y);
            $cr = ($rgba >> 16) & 0xFF;
            $cg = ($rgba >> 8) & 0xFF;
            $cb = $rgba & 0xFF;
            $ca = ($rgba & 0x7F000000) >> 24; // GD alpha 0-127

            $dr = $cr - $r;
            $dg = $cg - $g;
            $db = $cb - $b;
            if (($dr * $dr + $dg * $dg + $db * $db) <= $tol2) {
                imagesetpixel($dst, $x, $y, $transparent);
                continue;
            }
            $color = imagecolorallocatealpha($dst, $cr, $cg, $cb, $ca);
            imagesetpixel($dst, $x, $y, $color);
        }
    }
    imagedestroy($src);
    return $dst;
}

/**
 * Convert an uploaded raster image to PNG for tile header use.
 * Fits inside maxW×maxH (aspect preserved, never upscales). SVG rejected.
 *
 * @param bool $removeBackground When true, chroma-key background to transparency
 * @param string|null $bgColorHex Optional #rrggbb; when empty uses corner sampling
 * @return array{filename: string, filepath: string, converted: bool, width: int, height: int}
 */
function processUploadedTileHeaderImage($tmpPath, $originalName, $mimeType, $maxW = 400, $maxH = 80, $removeBackground = false, $bgColorHex = null, $filenamePrefix = 'tileheader_') {
    // REQUIRES: PHP GD (ext-gd). See file header comment.
    if (!extension_loaded('gd')) {
        sendJSON([
            'error' => 'PHP GD extension (ext-gd) is required for image conversion and background removal. Enable extension=gd in php.ini and restart Apache. Check: php -m | findstr gd'
        ], 500);
    }

    $uploadDir = __DIR__ . '/../uploads';
    if (!file_exists($uploadDir) && !mkdir($uploadDir, 0755, true)) {
        sendJSON(['error' => 'Failed to create uploads directory'], 500);
    }

    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($mimeType === 'image/svg+xml' || $extension === 'svg') {
        sendJSON(['error' => 'SVG is not supported for tile images. Please upload JPEG, PNG, GIF, WebP, or BMP.'], 400);
    }

    $prefix = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$filenamePrefix));
    if ($prefix === '') {
        $prefix = 'tileheader_';
    }
    if (substr($prefix, -1) !== '_') {
        $prefix .= '_';
    }

    $src = loadGdImageFromFile($tmpPath, $mimeType, $extension);
    if ($src === false) {
        $info = @getimagesize($tmpPath);
        if ($info && !empty($info['mime'])) {
            $src = loadGdImageFromFile($tmpPath, $info['mime'], $extension);
        }
    }
    if ($src === false) {
        sendJSON(['error' => 'Could not read image. Please upload JPEG, PNG, GIF, WebP, or BMP.'], 400);
    }

    if ($removeBackground) {
        $rgb = $bgColorHex ? parseHexColorToRgb($bgColorHex) : null;
        if ($rgb === null) {
            $rgb = sampleCornerBackgroundColor($src);
        }
        if ($rgb !== null) {
            $src = removeGdImageBackgroundColor($src, $rgb[0], $rgb[1], $rgb[2]);
        }
    }

    $dst = resizeGdImageFit($src, $maxW, $maxH);
    $filename = $prefix . time() . '_' . uniqid() . '.png';
    $filepath = $uploadDir . '/' . $filename;

    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    if (!imagepng($dst, $filepath, 6)) {
        imagedestroy($dst);
        sendJSON(['error' => 'Failed to save converted image'], 500);
    }

    $width = imagesx($dst);
    $height = imagesy($dst);
    imagedestroy($dst);

    if (is_uploaded_file($tmpPath)) {
        @unlink($tmpPath);
    }

    return [
        'filename' => $filename,
        'filepath' => $filepath,
        'converted' => true,
        'width' => $width,
        'height' => $height
    ];
}
