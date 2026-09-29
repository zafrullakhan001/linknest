<?php
/**
 * Message Board tab scoping helpers (schema v107).
 *
 * A scheduled message may be restricted to specific tabs of its space:
 *   - `tab_ids`      JSON array of Tab.id values (NULL/empty = show on every tab)
 *   - `show_on_card` 1 keeps a tab-restricted message on the home-grid card banner
 *
 * See docs/MESSAGE_BOARD_TABS.md.
 */

/**
 * Decode tile_messages.tab_ids (JSON array of Tab.id values a message is restricted to).
 * Returns null when the message is not tab-restricted (i.e. shows on every tab).
 */
function tileMessageTabIdsFromRow(array $msgRow): ?array {
    if (!isset($msgRow['tab_ids']) || $msgRow['tab_ids'] === null || $msgRow['tab_ids'] === '') {
        return null;
    }
    $decoded = json_decode((string)$msgRow['tab_ids'], true);
    if (!is_array($decoded)) {
        return null;
    }
    return tileMessageTabIdsNormalize($decoded);
}

/** True when a tab-restricted message should still appear on the home-grid card. */
function tileMessageShowOnCardFromRow(array $msgRow): bool {
    return !empty($msgRow['show_on_card']);
}

/** Clean a raw tab-id list (array or decoded JSON) into unique non-empty strings. */
function tileMessageTabIdsNormalize($tabIds): ?array {
    if (!is_array($tabIds)) {
        return null;
    }
    $ids = [];
    foreach ($tabIds as $id) {
        if (!is_string($id) && !is_int($id)) {
            continue;
        }
        $id = trim((string)$id);
        if ($id !== '' && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return $ids === [] ? null : $ids;
}

/** Encode a message payload's tab scope for tile_messages.tab_ids (null when unrestricted). */
function tileMessageTabIdsForStorage($tabIds): ?string {
    $ids = tileMessageTabIdsNormalize($tabIds);
    return $ids === null ? null : json_encode(array_values($ids));
}

/** Valid space-page banner placements. */
function tileMessagePlacements(): array {
    return ['above', 'below'];
}

/** Decode tile_messages.placement ('above' = above the tabs, 'below' = under the tabs). */
function tileMessagePlacementFromRow(array $msgRow): string {
    $value = isset($msgRow['placement']) ? strtolower(trim((string)$msgRow['placement'])) : '';
    return in_array($value, tileMessagePlacements(), true) ? $value : 'above';
}

/** Encode a message payload's placement for tile_messages.placement. */
function tileMessagePlacementForStorage($placement): string {
    $value = is_string($placement) ? strtolower(trim($placement)) : '';
    return in_array($value, tileMessagePlacements(), true) ? $value : 'above';
}

/** Font families allowed for a message (mirrors MESSAGE_FONT_FAMILIES in types.ts). */
function tileMessageFontFamilies(): array {
    return ['system', 'arial', 'verdana', 'tahoma', 'trebuchet', 'georgia', 'times', 'garamond', 'courier', 'consolas', 'impact', 'comic'];
}

/** Whitelist a message font family key; null = inherit the space font. */
function tileMessageFontFamilyNormalize($value): ?string {
    if (!is_string($value)) {
        return null;
    }
    $key = strtolower(trim($value));
    if ($key === '' || $key === 'default') {
        return null;
    }
    return in_array($key, tileMessageFontFamilies(), true) ? $key : null;
}

/** Clamp a message font size in px to 8-72; null = inherit the contextual size. */
function tileMessageFontSizeNormalize($value): ?int {
    if (!is_numeric($value)) {
        return null;
    }
    $size = (int)round((float)$value);
    if ($size <= 0) {
        return null;
    }
    return max(8, min(72, $size));
}

/** Clamp a marquee cycle length to 5-180s; null = surface default (25s card / 35s page). */
function tileMessageMarqueeSecondsNormalize($value): ?int {
    if (!is_numeric($value)) {
        return null;
    }
    $seconds = (int)round((float)$value);
    if ($seconds <= 0) {
        return null;
    }
    return max(5, min(180, $seconds));
}

function tileMessageFontFamilyFromRow(array $msgRow): ?string {
    return tileMessageFontFamilyNormalize($msgRow['font_family'] ?? null);
}

function tileMessageFontFamilyForStorage($value): ?string {
    return tileMessageFontFamilyNormalize($value);
}

function tileMessageFontSizeFromRow(array $msgRow): ?int {
    return tileMessageFontSizeNormalize($msgRow['font_size'] ?? null);
}

function tileMessageFontSizeForStorage($value): ?int {
    return tileMessageFontSizeNormalize($value);
}

function tileMessageMarqueeSecondsFromRow(array $msgRow): ?int {
    return tileMessageMarqueeSecondsNormalize($msgRow['marquee_seconds'] ?? null);
}

function tileMessageMarqueeSecondsForStorage($value): ?int {
    return tileMessageMarqueeSecondsNormalize($value);
}
