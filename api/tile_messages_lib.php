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
