<?php
/**
 * Sanitize optional admin notes stored on users.
 */
function sanitizeUserNotes($notes): ?string
{
    if ($notes === null) {
        return null;
    }
    $notes = trim((string) $notes);
    if ($notes === '') {
        return null;
    }
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($notes) > 2000) {
            $notes = mb_substr($notes, 0, 2000);
        }
    } elseif (strlen($notes) > 2000) {
        $notes = substr($notes, 0, 2000);
    }
    return $notes;
}
