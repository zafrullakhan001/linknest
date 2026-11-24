<?php
/**
 * Device Preview presets (Admin → Device Presets).
 *
 * Keep the built-in catalog in sync with services/devicePresetsService.ts.
 */

const DEVICE_PRESET_MAX = 200;
const DEVICE_PRESET_MIN_DIM = 120;
const DEVICE_PRESET_MAX_DIM = 4096;
const DEVICE_PRESET_MAX_QUICK = 40;

function devicePresetsAllowedGroups(): array {
    return ['Responsive', 'iPhone', 'Android', 'Tablet', 'Watch', 'Enterprise'];
}

function devicePresetsAllowedVariants(): array {
    return [
        'iphone-island', 'iphone-notch', 'iphone-legacy', 'android', 'android-tablet', 'ipad',
        'watch-square', 'watch-round', 'zebra-handheld', 'zebra-tc73', 'zebra-tc58', 'zebra-tc52ax',
        'zebra-et60', 'zebra-et51', 'zebra-mc3300', 'zebra-mc9300',
    ];
}

function devicePresetsDefaultCatalog(): array {
    return [
        ['id' => 'responsive', 'label' => 'Responsive', 'width' => 543, 'height' => 1006, 'variant' => 'android', 'group' => 'Responsive'],
        ['id' => 'iphone-se', 'label' => 'iPhone SE', 'width' => 375, 'height' => 667, 'variant' => 'iphone-legacy', 'group' => 'iPhone'],
        ['id' => 'iphone-14', 'label' => 'iPhone 14', 'width' => 390, 'height' => 844, 'variant' => 'iphone-notch', 'group' => 'iPhone'],
        ['id' => 'iphone-15-pro', 'label' => 'iPhone 15 Pro', 'width' => 393, 'height' => 852, 'variant' => 'iphone-island', 'group' => 'iPhone'],
        ['id' => 'iphone-16-pro', 'label' => 'iPhone 16 Pro', 'width' => 402, 'height' => 874, 'variant' => 'iphone-island', 'group' => 'iPhone'],
        ['id' => 'pixel-7', 'label' => 'Pixel 7', 'width' => 412, 'height' => 915, 'variant' => 'android', 'group' => 'Android'],
        ['id' => 'pixel-8', 'label' => 'Pixel 8', 'width' => 412, 'height' => 915, 'variant' => 'android', 'group' => 'Android'],
        ['id' => 'pixel-9', 'label' => 'Pixel 9', 'width' => 412, 'height' => 924, 'variant' => 'android', 'group' => 'Android'],
        ['id' => 'galaxy-s24', 'label' => 'Galaxy S24', 'width' => 360, 'height' => 780, 'variant' => 'android', 'group' => 'Android'],
        ['id' => 'ipad', 'label' => 'iPad', 'width' => 820, 'height' => 1180, 'variant' => 'ipad', 'group' => 'Tablet'],
        ['id' => 'android-tablet', 'label' => 'Android Tablet', 'width' => 800, 'height' => 1280, 'variant' => 'android-tablet', 'group' => 'Tablet'],
        ['id' => 'watch-square', 'label' => 'Watch (Square)', 'width' => 198, 'height' => 242, 'variant' => 'watch-square', 'group' => 'Watch'],
        ['id' => 'watch-round', 'label' => 'Watch (Round)', 'width' => 360, 'height' => 360, 'variant' => 'watch-round', 'group' => 'Watch'],
        ['id' => 'zebra-tc21', 'label' => 'Zebra TC21 · HD (720×1280)', 'width' => 720, 'height' => 1280, 'variant' => 'zebra-handheld', 'group' => 'Enterprise'],
        ['id' => 'zebra-tc52', 'label' => 'Zebra TC52 · HD (720×1280)', 'width' => 720, 'height' => 1280, 'variant' => 'zebra-tc52ax', 'group' => 'Enterprise'],
        ['id' => 'zebra-tc52ax', 'label' => 'Zebra TC52ax · HD (720×1280)', 'width' => 720, 'height' => 1280, 'variant' => 'zebra-tc52ax', 'group' => 'Enterprise'],
        ['id' => 'zebra-tc57', 'label' => 'Zebra TC57 · HD (720×1280)', 'width' => 720, 'height' => 1280, 'variant' => 'zebra-tc52ax', 'group' => 'Enterprise'],
        ['id' => 'zebra-tc58', 'label' => 'Zebra TC58 · Full HD (1080×2160)', 'width' => 1080, 'height' => 2160, 'variant' => 'zebra-tc58', 'group' => 'Enterprise'],
        ['id' => 'zebra-tc73', 'label' => 'Zebra TC73 · Full HD+ (1080×2160)', 'width' => 1080, 'height' => 2160, 'variant' => 'zebra-tc73', 'group' => 'Enterprise'],
        ['id' => 'zebra-mc3300', 'label' => 'Zebra MC3300 (480×800)', 'width' => 480, 'height' => 800, 'variant' => 'zebra-mc3300', 'group' => 'Enterprise'],
        ['id' => 'zebra-mc3300-768', 'label' => 'Zebra MC3300 (480×768)', 'width' => 480, 'height' => 768, 'variant' => 'zebra-mc3300', 'group' => 'Enterprise'],
        ['id' => 'zebra-mc9300', 'label' => 'Zebra MC9300 (480×800)', 'width' => 480, 'height' => 800, 'variant' => 'zebra-mc9300', 'group' => 'Enterprise'],
        ['id' => 'zebra-et51', 'label' => 'Zebra ET51 · WUXGA (1920×1200)', 'width' => 1920, 'height' => 1200, 'variant' => 'zebra-et51', 'group' => 'Enterprise'],
        ['id' => 'zebra-et60', 'label' => 'Zebra ET60 · WUXGA (1920×1200)', 'width' => 1920, 'height' => 1200, 'variant' => 'zebra-et60', 'group' => 'Enterprise'],
    ];
}

function devicePresetsDefaultQuickIds(): array {
    return [
        'iphone-14', 'iphone-15-pro', 'pixel-7', 'pixel-8', 'galaxy-s24',
        'ipad', 'zebra-tc73', 'zebra-et60', 'watch-square', 'watch-round',
    ];
}

function devicePresetsSuggestVariant(string $group): string {
    switch ($group) {
        case 'iPhone':
            return 'iphone-island';
        case 'Android':
            return 'android';
        case 'Tablet':
            return 'ipad';
        case 'Watch':
            return 'watch-square';
        case 'Enterprise':
            return 'zebra-handheld';
        case 'Responsive':
        default:
            return 'android';
    }
}

function devicePresetsSlugifyId(string $raw): string {
    $id = strtolower(trim($raw));
    $id = (string)preg_replace('/[^a-z0-9]+/', '-', $id);
    $id = trim($id, '-');
    if (strlen($id) > 64) {
        $id = rtrim(substr($id, 0, 64), '-');
    }
    return $id;
}

function devicePresetsClampDim($n): int {
    $v = (int)round((float)$n);
    if ($v < DEVICE_PRESET_MIN_DIM) {
        return DEVICE_PRESET_MIN_DIM;
    }
    if ($v > DEVICE_PRESET_MAX_DIM) {
        return DEVICE_PRESET_MAX_DIM;
    }
    return $v;
}

function devicePresetsTruncateLabel(string $label): string {
    $label = trim($label);
    if (function_exists('mb_substr')) {
        return mb_substr($label, 0, 120);
    }
    return substr($label, 0, 120);
}

/**
 * Normalize one preset object. Returns null if invalid or duplicate.
 *
 * @param array<int, string> $usedIds
 */
function devicePresetsNormalizeOne($raw, array &$usedIds): ?array {
    if (!is_array($raw)) {
        return null;
    }
    $id = devicePresetsSlugifyId((string)($raw['id'] ?? ''));
    $label = devicePresetsTruncateLabel((string)($raw['label'] ?? ''));
    if ($id === '' || $label === '' || isset($usedIds[$id])) {
        return null;
    }
    $group = (string)($raw['group'] ?? '');
    $variant = (string)($raw['variant'] ?? '');
    if (!in_array($group, devicePresetsAllowedGroups(), true) || !in_array($variant, devicePresetsAllowedVariants(), true)) {
        return null;
    }
    $usedIds[$id] = true;
    return [
        'id' => $id,
        'label' => $label,
        'width' => devicePresetsClampDim($raw['width'] ?? 0),
        'height' => devicePresetsClampDim($raw['height'] ?? 0),
        'variant' => $variant,
        'group' => $group,
    ];
}

/**
 * @return array{ok: bool, json?: string, error?: string}
 */
function devicePresetsEncodeSetting($value): array {
    $decoded = null;
    if (is_array($value)) {
        $decoded = $value;
    } elseif (is_string($value)) {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return ['ok' => true, 'json' => ''];
        }
        $decoded = json_decode($trimmed, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'error' => 'device_presets must be a JSON array'];
        }
    } else {
        return ['ok' => true, 'json' => ''];
    }

    if (count($decoded) > DEVICE_PRESET_MAX) {
        return ['ok' => false, 'error' => 'device_presets supports at most ' . DEVICE_PRESET_MAX . ' devices'];
    }

    $out = [];
    $used = [];
    foreach ($decoded as $item) {
        $preset = devicePresetsNormalizeOne($item, $used);
        if ($preset !== null) {
            $out[] = $preset;
        }
    }

    if (count($decoded) > 0 && $out === []) {
        return ['ok' => false, 'error' => 'device_presets contained no valid devices'];
    }

    return ['ok' => true, 'json' => $out === [] ? '' : json_encode($out, JSON_UNESCAPED_UNICODE)];
}

/**
 * @return array{ok: bool, json?: string, error?: string}
 */
function devicePresetsEncodeQuickSetting($value): array {
    $decoded = null;
    if (is_array($value)) {
        $decoded = $value;
    } elseif (is_string($value)) {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return ['ok' => true, 'json' => ''];
        }
        $decoded = json_decode($trimmed, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'error' => 'device_quick_presets must be a JSON array'];
        }
    } else {
        return ['ok' => true, 'json' => ''];
    }

    $out = [];
    $seen = [];
    foreach ($decoded as $item) {
        $id = devicePresetsSlugifyId((string)$item);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $out[] = $id;
        if (count($out) >= DEVICE_PRESET_MAX_QUICK) {
            break;
        }
    }

    return ['ok' => true, 'json' => $out === [] ? '' : json_encode($out, JSON_UNESCAPED_UNICODE)];
}

/**
 * @param list<array<string, mixed>> $presets
 * @return list<string>
 */
function devicePresetsNormalizeQuickList($raw, array $presets): array {
    $ids = [];
    foreach ($presets as $p) {
        if (!empty($p['id'])) {
            $ids[(string)$p['id']] = true;
        }
    }
    if (!is_array($raw)) {
        $out = [];
        foreach (devicePresetsDefaultQuickIds() as $id) {
            if (isset($ids[$id])) {
                $out[] = $id;
            }
        }
        return $out;
    }
    $out = [];
    $seen = [];
    foreach ($raw as $item) {
        $id = devicePresetsSlugifyId((string)$item);
        if ($id === '' || !isset($ids[$id]) || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $out[] = $id;
        if (count($out) >= DEVICE_PRESET_MAX_QUICK) {
            break;
        }
    }
    return $out;
}

/**
 * Effective catalog: custom settings if present, otherwise built-in defaults.
 *
 * @return array{presets: list<array<string, mixed>>, quickPresets: list<string>, isCustom: bool}
 */
function devicePresetsGetEffective(): array {
    $raw = function_exists('getSetting') ? (string)getSetting('device_presets', '') : '';
    $trimmed = trim($raw);
    if ($trimmed === '') {
        $defaults = devicePresetsDefaultCatalog();
        return [
            'presets' => $defaults,
            'quickPresets' => devicePresetsNormalizeQuickList(devicePresetsDefaultQuickIds(), $defaults),
            'isCustom' => false,
        ];
    }
    $decoded = json_decode($trimmed, true);
    $used = [];
    $presets = [];
    if (is_array($decoded)) {
        foreach ($decoded as $item) {
            if (count($presets) >= DEVICE_PRESET_MAX) {
                break;
            }
            $preset = devicePresetsNormalizeOne($item, $used);
            if ($preset !== null) {
                $presets[] = $preset;
            }
        }
    }
    if ($presets === []) {
        $defaults = devicePresetsDefaultCatalog();
        return [
            'presets' => $defaults,
            'quickPresets' => devicePresetsNormalizeQuickList(devicePresetsDefaultQuickIds(), $defaults),
            'isCustom' => false,
        ];
    }

    $quickRaw = function_exists('getSetting') ? (string)getSetting('device_quick_presets', '') : '';
    $quickDecoded = null;
    if (trim($quickRaw) !== '') {
        $parsed = json_decode($quickRaw, true);
        $quickDecoded = is_array($parsed) ? $parsed : null;
    }
    $quick = devicePresetsNormalizeQuickList($quickDecoded, $presets);
    if ($quick === []) {
        $quick = devicePresetsNormalizeQuickList(devicePresetsDefaultQuickIds(), $presets);
    }

    return [
        'presets' => $presets,
        'quickPresets' => $quick,
        'isCustom' => true,
    ];
}

/**
 * Persist a custom catalog. Empty presets is not allowed (use devicePresetsReset for defaults).
 *
 * @param list<array<string, mixed>> $presets
 * @param list<string> $quickPresets
 * @return array{ok: bool, error?: string, presets?: list<array<string, mixed>>, quickPresets?: list<string>, isCustom?: bool}
 */
function devicePresetsSave(array $presets, array $quickPresets): array {
    $used = [];
    $out = [];
    foreach ($presets as $item) {
        if (count($out) >= DEVICE_PRESET_MAX) {
            return ['ok' => false, 'error' => 'device_presets supports at most ' . DEVICE_PRESET_MAX . ' devices'];
        }
        $preset = devicePresetsNormalizeOne($item, $used);
        if ($preset !== null) {
            $out[] = $preset;
        }
    }
    if ($out === []) {
        return ['ok' => false, 'error' => 'Keep at least one valid device preset'];
    }
    $quick = devicePresetsNormalizeQuickList($quickPresets, $out);
    if (!function_exists('setSetting')) {
        return ['ok' => false, 'error' => 'Settings storage is not available'];
    }
    setSetting('device_presets', json_encode($out, JSON_UNESCAPED_UNICODE));
    setSetting('device_quick_presets', $quick === [] ? '' : json_encode($quick, JSON_UNESCAPED_UNICODE));
    if (function_exists('responseCacheInvalidate')) {
        responseCacheInvalidate('settings_public');
    }
    return [
        'ok' => true,
        'presets' => $out,
        'quickPresets' => $quick,
        'isCustom' => true,
    ];
}

function devicePresetsReset(): array {
    if (!function_exists('setSetting')) {
        return ['ok' => false, 'error' => 'Settings storage is not available'];
    }
    setSetting('device_presets', '');
    setSetting('device_quick_presets', '');
    if (function_exists('responseCacheInvalidate')) {
        responseCacheInvalidate('settings_public');
    }
    $effective = devicePresetsGetEffective();
    $effective['ok'] = true;
    $effective['reset'] = true;
    return $effective;
}

function devicePresetsFind(array $presets, string $id): ?array {
    $id = devicePresetsSlugifyId($id);
    if ($id === '') {
        return null;
    }
    foreach ($presets as $preset) {
        if (($preset['id'] ?? '') === $id) {
            return $preset;
        }
    }
    return null;
}
