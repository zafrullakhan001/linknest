<?php
/**
 * Device Preview presets MCP tools (Admin → Device Presets).
 *
 * Shown when the bound user is an administrator. The Admin token checkbox is
 * not required (that checkbox is for users / LDAP / database tools).
 * Collapsed to two tools so Cursor's ~40-tool budget can still see them.
 */

require_once __DIR__ . '/device_presets_lib.php';

function mcpHasDevicePresetsAccess(array $user): bool {
    return !empty($user['is_admin']);
}

function mcpDevicePresetsReadTools(): array {
    return [
        [
            'name' => 'list_device_presets',
            'description' => 'List Device Preview presets (Admin → Device Presets). Returns devices, quick-bar ids, allowed groups/variants, and whether the catalog is custom or built-in. Pass id to get one device. Bound user must be an administrator.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Optional preset id (e.g. iphone-14) to return one device'],
                    'preset_id' => ['type' => 'string', 'description' => 'Alias of id'],
                    'query' => ['type' => 'string', 'description' => 'Optional filter on id or label'],
                    'group' => [
                        'type' => 'string',
                        'enum' => devicePresetsAllowedGroups(),
                        'description' => 'Optional group filter',
                    ],
                ],
                'additionalProperties' => false,
            ],
        ],
    ];
}

function mcpDevicePresetsWriteTools(): array {
    $groupEnum = devicePresetsAllowedGroups();
    $variantEnum = devicePresetsAllowedVariants();
    return [
        [
            'name' => 'manage_device_presets',
            'description' => 'Change Device Preview presets. action: add, update, delete, set_quick, replace, reset. Same as Admin → Device Presets. Bound user must be an administrator with write scope. replace and reset require confirm=true. New phones can reuse variant iphone-island.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => [
                        'type' => 'string',
                        'enum' => ['add', 'update', 'delete', 'set_quick', 'replace', 'reset'],
                        'description' => 'add (default when id+label+width+height are set), update, delete, set_quick, replace, reset',
                    ],
                    'id' => ['type' => 'string', 'description' => 'Preset id slug (add/update/delete)'],
                    'preset_id' => ['type' => 'string'],
                    'new_id' => ['type' => 'string'],
                    'label' => ['type' => 'string'],
                    'width' => ['type' => 'integer', 'minimum' => 120, 'maximum' => 4096],
                    'height' => ['type' => 'integer', 'minimum' => 120, 'maximum' => 4096],
                    'group' => ['type' => 'string', 'enum' => $groupEnum],
                    'variant' => ['type' => 'string', 'enum' => $variantEnum],
                    'add_to_quick' => ['type' => 'boolean', 'description' => 'For add: put on the quick bar (default true)'],
                    'preset_ids' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'For set_quick'],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove'], 'description' => 'For set_quick (default add)'],
                    'presets' => [
                        'type' => 'array',
                        'description' => 'For replace: full catalog of {id, label, width, height, group, variant}',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'id' => ['type' => 'string'],
                                'label' => ['type' => 'string'],
                                'width' => ['type' => 'integer'],
                                'height' => ['type' => 'integer'],
                                'group' => ['type' => 'string', 'enum' => $groupEnum],
                                'variant' => ['type' => 'string', 'enum' => $variantEnum],
                            ],
                        ],
                    ],
                    'quick_presets' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'confirm' => ['type' => 'boolean', 'description' => 'Required true for replace and reset'],
                ],
                'additionalProperties' => false,
            ],
        ],
    ];
}

function mcpDevicePresetsDispatch(string $name, array $args, array $user): ?array {
    if (!mcpHasDevicePresetsAccess($user)) {
        return ['error' => 'Device Presets require a token bound to an administrator user.'];
    }
    switch ($name) {
        case 'list_device_presets':
            return mcpAdminListDevicePresets($args);
        case 'manage_device_presets':
            return mcpManageDevicePresets($args, $user);
        default:
            return null;
    }
}

function mcpManageDevicePresets(array $args, array $user): array {
    $action = strtolower(trim((string)($args['action'] ?? '')));
    if ($action === '') {
        if (isset($args['presets'])) {
            $action = 'replace';
        } elseif (isset($args['preset_ids'])) {
            $action = 'set_quick';
        } elseif (isset($args['id']) || isset($args['preset_id'])) {
            if (isset($args['label']) && isset($args['width']) && isset($args['height'])) {
                $action = 'add';
            } elseif (isset($args['new_id']) || isset($args['label']) || isset($args['width']) || isset($args['height']) || isset($args['group']) || isset($args['variant'])) {
                $action = 'update';
            } else {
                $action = 'delete';
            }
        } else {
            return ['error' => 'action is required: add, update, delete, set_quick, replace, or reset.'];
        }
    }
    switch ($action) {
        case 'add':
            return mcpAdminAddDevicePreset($args, $user);
        case 'update':
            return mcpAdminUpdateDevicePreset($args, $user);
        case 'delete':
            return mcpAdminDeleteDevicePreset($args, $user);
        case 'set_quick':
            return mcpAdminSetDeviceQuickPresets($args, $user);
        case 'replace':
            return mcpAdminReplaceDevicePresets($args, $user);
        case 'reset':
            return mcpAdminResetDevicePresets($args, $user);
        default:
            return ['error' => 'Unknown action. Use add, update, delete, set_quick, replace, or reset.'];
    }
}

function mcpDevicePresetIdArg(array $args): string {
    return devicePresetsSlugifyId((string)($args['id'] ?? $args['preset_id'] ?? ''));
}

function mcpDevicePresetsDecorate(array $effective, array $presets): array {
    $quick = array_flip($effective['quickPresets'] ?? []);
    $out = [];
    foreach ($presets as $p) {
        $id = (string)($p['id'] ?? '');
        $p['in_quick'] = $id !== '' && isset($quick[$id]);
        $out[] = $p;
    }
    return $out;
}

function mcpDevicePresetsSummary(array $effective, array $extra = []): array {
    $presets = $effective['presets'] ?? [];
    return array_merge([
        'ok' => true,
        'isCustom' => !empty($effective['isCustom']),
        'count' => count($presets),
        'quickPresets' => $effective['quickPresets'] ?? [],
        'presets' => mcpDevicePresetsDecorate($effective, $presets),
        'allowed_groups' => devicePresetsAllowedGroups(),
        'allowed_variants' => devicePresetsAllowedVariants(),
        'note' => !empty($effective['isCustom'])
            ? 'Custom catalog saved in the database.'
            : 'Using built-in defaults (nothing saved in the database yet).',
    ], $extra);
}

function mcpAdminListDevicePresetOptions(): array {
    $byGroup = [];
    foreach (devicePresetsAllowedGroups() as $g) {
        $byGroup[$g] = devicePresetsSuggestVariant($g);
    }
    return [
        'groups' => devicePresetsAllowedGroups(),
        'variants' => devicePresetsAllowedVariants(),
        'suggested_variant_by_group' => $byGroup,
        'max_presets' => DEVICE_PRESET_MAX,
        'width_height' => ['min' => DEVICE_PRESET_MIN_DIM, 'max' => DEVICE_PRESET_MAX_DIM],
        'max_quick' => DEVICE_PRESET_MAX_QUICK,
    ];
}

function mcpAdminListDevicePresets(array $args): array {
    $effective = devicePresetsGetEffective();
    $presets = $effective['presets'];
    $group = trim((string)($args['group'] ?? ''));
    if ($group !== '') {
        if (!in_array($group, devicePresetsAllowedGroups(), true)) {
            return ['error' => 'Invalid group. Allowed: ' . implode(', ', devicePresetsAllowedGroups())];
        }
        $presets = array_values(array_filter($presets, static function ($p) use ($group) {
            return ($p['group'] ?? '') === $group;
        }));
    }
    $query = strtolower(trim((string)($args['query'] ?? '')));
    if ($query !== '') {
        $presets = array_values(array_filter($presets, static function ($p) use ($query) {
            $hay = strtolower((string)($p['id'] ?? '') . ' ' . (string)($p['label'] ?? ''));
            return strpos($hay, $query) !== false;
        }));
    }
    $summary = mcpDevicePresetsSummary($effective);
    $summary['count'] = count($presets);
    $summary['presets'] = mcpDevicePresetsDecorate($effective, $presets);
    $summary['options'] = mcpAdminListDevicePresetOptions();
    $id = mcpDevicePresetIdArg($args);
    if ($id !== '') {
        $preset = devicePresetsFind($effective['presets'], $id);
        if ($preset === null) {
            return ['error' => 'Device preset not found: ' . $id];
        }
        $quick = array_flip($effective['quickPresets'] ?? []);
        $preset['in_quick'] = isset($quick[$id]);
        $summary['preset'] = $preset;
        $summary['count'] = 1;
        $summary['presets'] = mcpDevicePresetsDecorate($effective, [$preset]);
    }
    if ($group !== '') {
        $summary['filter_group'] = $group;
    }
    if ($query !== '') {
        $summary['filter_query'] = $query;
    }
    return $summary;
}

function mcpAdminGetDevicePreset(array $args): array {
    $id = mcpDevicePresetIdArg($args);
    if ($id === '') {
        return ['error' => 'id is required (preset slug, e.g. iphone-14).'];
    }
    $effective = devicePresetsGetEffective();
    $preset = devicePresetsFind($effective['presets'], $id);
    if ($preset === null) {
        return ['error' => 'Device preset not found: ' . $id];
    }
    $quick = array_flip($effective['quickPresets']);
    $preset['in_quick'] = isset($quick[$id]);
    return [
        'ok' => true,
        'isCustom' => !empty($effective['isCustom']),
        'preset' => $preset,
    ];
}

function mcpAdminAuditDevicePresets(array $user, string $action, array $details): void {
    if (!function_exists('logUserAudit')) {
        return;
    }
    logUserAudit('mcp.device_presets', [
        'actor' => $user,
        'details' => array_merge(['action' => $action], $details),
    ]);
}

function mcpAdminAddDevicePreset(array $args, array $user): array {
    $id = devicePresetsSlugifyId((string)($args['id'] ?? ''));
    $label = devicePresetsTruncateLabel((string)($args['label'] ?? ''));
    if ($id === '' || $label === '') {
        return ['error' => 'id and label are required.'];
    }
    if (!isset($args['width'], $args['height'])) {
        return ['error' => 'width and height are required (120–4096).'];
    }
    $group = trim((string)($args['group'] ?? 'iPhone'));
    if ($group === '') {
        $group = 'iPhone';
    }
    if (!in_array($group, devicePresetsAllowedGroups(), true)) {
        return ['error' => 'Invalid group. Allowed: ' . implode(', ', devicePresetsAllowedGroups())];
    }
    $variant = trim((string)($args['variant'] ?? ''));
    if ($variant === '') {
        $variant = devicePresetsSuggestVariant($group);
    }
    if (!in_array($variant, devicePresetsAllowedVariants(), true)) {
        return ['error' => 'Invalid variant. Allowed values are in list_device_presets → options.variants.'];
    }

    $effective = devicePresetsGetEffective();
    if (devicePresetsFind($effective['presets'], $id) !== null) {
        return ['error' => 'A device preset with id "' . $id . '" already exists.'];
    }
    if (count($effective['presets']) >= DEVICE_PRESET_MAX) {
        return ['error' => 'device_presets supports at most ' . DEVICE_PRESET_MAX . ' devices'];
    }

    $candidate = [
        'id' => $id,
        'label' => $label,
        'width' => devicePresetsClampDim($args['width']),
        'height' => devicePresetsClampDim($args['height']),
        'group' => $group,
        'variant' => $variant,
    ];
    $next = $effective['presets'];
    $next[] = $candidate;
    $quick = $effective['quickPresets'];
    $addToQuick = array_key_exists('add_to_quick', $args)
        ? (function_exists('mcpAdminArgIsTrue') && mcpAdminArgIsTrue($args['add_to_quick']))
        : true;
    if ($addToQuick && !in_array($id, $quick, true) && count($quick) < DEVICE_PRESET_MAX_QUICK) {
        $quick[] = $id;
    }

    $saved = devicePresetsSave($next, $quick);
    if (empty($saved['ok'])) {
        return ['error' => $saved['error'] ?? 'Failed to save device preset'];
    }
    mcpAdminAuditDevicePresets($user, 'add', ['id' => $id, 'label' => $label]);
    return mcpDevicePresetsSummary($saved, [
        'added' => $candidate,
        'seeded_defaults' => empty($effective['isCustom']),
        'message' => 'Added ' . $label . ' (' . $id . ').',
    ]);
}

function mcpAdminUpdateDevicePreset(array $args, array $user): array {
    $id = mcpDevicePresetIdArg($args);
    if ($id === '') {
        return ['error' => 'id is required.'];
    }
    $hasUpdate = isset($args['new_id']) || isset($args['label']) || isset($args['width'])
        || isset($args['height']) || isset($args['group']) || isset($args['variant']);
    if (!$hasUpdate) {
        return ['error' => 'Nothing to update. Pass label, width, height, group, variant, and/or new_id.'];
    }

    $effective = devicePresetsGetEffective();
    $found = false;
    $updated = null;
    $next = [];
    foreach ($effective['presets'] as $preset) {
        if (($preset['id'] ?? '') !== $id) {
            $next[] = $preset;
            continue;
        }
        $found = true;
        if (isset($args['new_id']) && trim((string)$args['new_id']) !== '') {
            $newId = devicePresetsSlugifyId((string)$args['new_id']);
            if ($newId === '') {
                return ['error' => 'new_id is not a valid slug.'];
            }
            if ($newId !== $id && devicePresetsFind($effective['presets'], $newId) !== null) {
                return ['error' => 'A device preset with id "' . $newId . '" already exists.'];
            }
            $preset['id'] = $newId;
        }
        if (isset($args['label'])) {
            $label = devicePresetsTruncateLabel((string)$args['label']);
            if ($label === '') {
                return ['error' => 'label cannot be empty.'];
            }
            $preset['label'] = $label;
        }
        if (isset($args['width'])) {
            $preset['width'] = devicePresetsClampDim($args['width']);
        }
        if (isset($args['height'])) {
            $preset['height'] = devicePresetsClampDim($args['height']);
        }
        if (isset($args['group'])) {
            $group = trim((string)$args['group']);
            if (!in_array($group, devicePresetsAllowedGroups(), true)) {
                return ['error' => 'Invalid group. Allowed: ' . implode(', ', devicePresetsAllowedGroups())];
            }
            $preset['group'] = $group;
        }
        if (isset($args['variant'])) {
            $variant = trim((string)$args['variant']);
            if (!in_array($variant, devicePresetsAllowedVariants(), true)) {
                return ['error' => 'Invalid variant. Allowed values are in list_device_presets → options.variants.'];
            }
            $preset['variant'] = $variant;
        }
        $updated = $preset;
        $next[] = $preset;
    }
    if (!$found || $updated === null) {
        return ['error' => 'Device preset not found: ' . $id];
    }

    $quick = $effective['quickPresets'];
    $newId = (string)$updated['id'];
    if ($newId !== $id) {
        $quick = array_map(static function ($qid) use ($id, $newId) {
            return $qid === $id ? $newId : $qid;
        }, $quick);
    }

    $saved = devicePresetsSave($next, $quick);
    if (empty($saved['ok'])) {
        return ['error' => $saved['error'] ?? 'Failed to update device preset'];
    }
    mcpAdminAuditDevicePresets($user, 'update', ['id' => $id, 'new_id' => $newId]);
    return mcpDevicePresetsSummary($saved, [
        'updated' => $updated,
        'seeded_defaults' => empty($effective['isCustom']),
        'message' => 'Updated ' . $newId . '.',
    ]);
}

function mcpAdminDeleteDevicePreset(array $args, array $user): array {
    $id = mcpDevicePresetIdArg($args);
    if ($id === '') {
        return ['error' => 'id is required.'];
    }
    $effective = devicePresetsGetEffective();
    if (devicePresetsFind($effective['presets'], $id) === null) {
        return ['error' => 'Device preset not found: ' . $id];
    }
    if (count($effective['presets']) <= 1) {
        return ['error' => 'Keep at least one device preset'];
    }
    $next = array_values(array_filter($effective['presets'], static function ($p) use ($id) {
        return ($p['id'] ?? '') !== $id;
    }));
    $quick = array_values(array_filter($effective['quickPresets'], static function ($qid) use ($id) {
        return $qid !== $id;
    }));
    $saved = devicePresetsSave($next, $quick);
    if (empty($saved['ok'])) {
        return ['error' => $saved['error'] ?? 'Failed to delete device preset'];
    }
    mcpAdminAuditDevicePresets($user, 'delete', ['id' => $id]);
    return mcpDevicePresetsSummary($saved, [
        'deleted' => $id,
        'seeded_defaults' => empty($effective['isCustom']),
        'message' => 'Removed ' . $id . '.',
    ]);
}

function mcpAdminSetDeviceQuickPresets(array $args, array $user): array {
    if (!isset($args['preset_ids']) || !is_array($args['preset_ids'])) {
        return ['error' => 'preset_ids must be an array of preset ids.'];
    }
    $mode = strtolower(trim((string)($args['mode'] ?? 'add')));
    if (!in_array($mode, ['add', 'replace', 'remove'], true)) {
        return ['error' => 'mode must be add, replace, or remove.'];
    }
    $effective = devicePresetsGetEffective();
    $known = [];
    foreach ($effective['presets'] as $p) {
        $known[(string)$p['id']] = true;
    }
    $incoming = [];
    $skipped = [];
    foreach ($args['preset_ids'] as $raw) {
        $id = devicePresetsSlugifyId((string)$raw);
        if ($id === '') {
            continue;
        }
        if (!isset($known[$id])) {
            $skipped[] = $id;
            continue;
        }
        $incoming[] = $id;
    }
    if (function_exists('mcpAdminMergeIds')) {
        $quick = mcpAdminMergeIds($effective['quickPresets'], $incoming, $mode);
    } else {
        $quick = $incoming;
    }
    $quick = devicePresetsNormalizeQuickList($quick, $effective['presets']);
    $saved = devicePresetsSave($effective['presets'], $quick);
    if (empty($saved['ok'])) {
        return ['error' => $saved['error'] ?? 'Failed to update quick presets'];
    }
    mcpAdminAuditDevicePresets($user, 'set_quick', ['mode' => $mode, 'preset_ids' => $incoming]);
    $extra = [
        'mode' => $mode,
        'seeded_defaults' => empty($effective['isCustom']),
        'message' => 'Updated the Device Preview quick bar.',
    ];
    if ($skipped !== []) {
        $extra['skipped_unknown_ids'] = $skipped;
    }
    return mcpDevicePresetsSummary($saved, $extra);
}

function mcpAdminReplaceDevicePresets(array $args, array $user): array {
    if (!function_exists('mcpAdminArgIsTrue') || !mcpAdminArgIsTrue($args['confirm'] ?? false)) {
        return ['error' => 'Replace refused. Pass confirm=true. This replaces the Device Preview catalog for all users.'];
    }
    if (!isset($args['presets']) || !is_array($args['presets'])) {
        return ['error' => 'presets must be an array of {id, label, width, height, group, variant}.'];
    }
    $quick = $args['quick_presets'] ?? $args['quickPresets'] ?? [];
    if (!is_array($quick)) {
        $quick = [];
    }
    $saved = devicePresetsSave($args['presets'], $quick);
    if (empty($saved['ok'])) {
        return ['error' => $saved['error'] ?? 'Failed to replace device presets'];
    }
    $kept = count($saved['presets']);
    $skipped = count($args['presets']) - $kept;
    mcpAdminAuditDevicePresets($user, 'replace', ['count' => $kept, 'skipped_invalid' => $skipped]);
    $extra = [
        'replaced' => true,
        'message' => 'Replaced the Device Preview catalog (' . $kept . ' devices).',
    ];
    if ($skipped > 0) {
        $extra['skipped_invalid'] = $skipped;
        $extra['message'] .= ' Skipped ' . $skipped . ' invalid item(s).';
    }
    return mcpDevicePresetsSummary($saved, $extra);
}

function mcpAdminResetDevicePresets(array $args, array $user): array {
    if (!function_exists('mcpAdminArgIsTrue') || !mcpAdminArgIsTrue($args['confirm'] ?? false)) {
        return ['error' => 'Reset refused. Pass confirm=true. Custom devices saved in the database will be removed.'];
    }
    $saved = devicePresetsReset();
    if (empty($saved['ok'])) {
        return ['error' => $saved['error'] ?? 'Failed to reset device presets'];
    }
    mcpAdminAuditDevicePresets($user, 'reset', []);
    return mcpDevicePresetsSummary($saved, [
        'reset' => true,
        'message' => 'Device presets reset to built-in defaults.',
    ]);
}
