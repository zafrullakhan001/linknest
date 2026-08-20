<?php
/**
 * Admin MCP tools for Device Preview presets (Admin → Device Presets).
 */

require_once __DIR__ . '/device_presets_lib.php';

function mcpAdminDevicePresetsReadToolsExtra(): array {
    $empty = ['type' => 'object', 'properties' => new stdClass(), 'additionalProperties' => false];
    return [
        [
            'name' => 'list_device_presets',
            'description' => 'List Device Preview presets (same catalog as Admin → Device Presets). Returns sizes, mockup variants, quick-bar ids, and whether the catalog is custom or built-in defaults. Optional group or query filter.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
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
        [
            'name' => 'get_device_preset',
            'description' => 'Get one Device Preview preset by id (for example iphone-14).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Preset id slug'],
                    'preset_id' => ['type' => 'string', 'description' => 'Alias of id'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'list_device_preset_options',
            'description' => 'Allowed Device Preview groups and mockup variants. Use before add_device_preset if you need the enum values.',
            'inputSchema' => $empty,
        ],
    ];
}

function mcpAdminDevicePresetsWriteToolsExtra(): array {
    $groupEnum = devicePresetsAllowedGroups();
    $variantEnum = devicePresetsAllowedVariants();
    return [
        [
            'name' => 'add_device_preset',
            'description' => 'Add a Device Preview device. If the catalog is still built-in defaults, those defaults are copied into the database first (same as Admin → Add & save). New devices are added to the quick bar unless add_to_quick is false. Reuse an existing variant (e.g. iphone-island) for new phones.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Unique slug, e.g. iphone-17'],
                    'label' => ['type' => 'string', 'description' => 'Dropdown label'],
                    'width' => ['type' => 'integer', 'minimum' => 120, 'maximum' => 4096],
                    'height' => ['type' => 'integer', 'minimum' => 120, 'maximum' => 4096],
                    'group' => ['type' => 'string', 'enum' => $groupEnum, 'description' => 'Default iPhone'],
                    'variant' => ['type' => 'string', 'enum' => $variantEnum, 'description' => 'Mockup shell; default from group'],
                    'add_to_quick' => ['type' => 'boolean', 'description' => 'Add to the quick-select bar (default true)'],
                ],
                'required' => ['id', 'label', 'width', 'height'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_device_preset',
            'description' => 'Update an existing Device Preview preset (label, size, group, variant, or id). Seeds built-in defaults into the database if they are not saved yet.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string'],
                    'preset_id' => ['type' => 'string'],
                    'new_id' => ['type' => 'string'],
                    'label' => ['type' => 'string'],
                    'width' => ['type' => 'integer', 'minimum' => 120, 'maximum' => 4096],
                    'height' => ['type' => 'integer', 'minimum' => 120, 'maximum' => 4096],
                    'group' => ['type' => 'string', 'enum' => $groupEnum],
                    'variant' => ['type' => 'string', 'enum' => $variantEnum],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'delete_device_preset',
            'description' => 'Remove a Device Preview preset by id. At least one preset must remain. Also removes it from the quick bar.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string'],
                    'preset_id' => ['type' => 'string'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_device_quick_presets',
            'description' => 'Change the Device Preview quick-select bar. mode defaults to add (merge). Use replace for the exact list, remove to take ids off the bar. Unknown ids are skipped.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'preset_ids' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove']],
                ],
                'required' => ['preset_ids'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'replace_device_presets',
            'description' => 'Replace the full Device Preview catalog (same as Admin → Import JSON). Requires confirm=true. Pass presets as an array of {id, label, width, height, group, variant}. Optional quick_presets ids.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'presets' => [
                        'type' => 'array',
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
                            'required' => ['id', 'label', 'width', 'height', 'group', 'variant'],
                        ],
                    ],
                    'quick_presets' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'confirm' => [
                        'type' => 'boolean',
                        'description' => 'Must be true. Replaces the saved catalog for all users.',
                    ],
                ],
                'required' => ['presets', 'confirm'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'reset_device_presets',
            'description' => 'Clear custom Device Preview presets so built-in defaults apply again (same as Admin → Reset defaults). Requires confirm=true.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'confirm' => [
                        'type' => 'boolean',
                        'description' => 'Must be true. Removes the custom catalog from the database.',
                    ],
                ],
                'required' => ['confirm'],
                'additionalProperties' => false,
            ],
        ],
    ];
}

function mcpAdminDevicePresetsDispatch(string $name, array $args, array $user): ?array {
    switch ($name) {
        case 'list_device_presets':
            return mcpAdminListDevicePresets($args);
        case 'get_device_preset':
            return mcpAdminGetDevicePreset($args);
        case 'list_device_preset_options':
            return mcpAdminListDevicePresetOptions();
        case 'add_device_preset':
            return mcpAdminAddDevicePreset($args, $user);
        case 'update_device_preset':
            return mcpAdminUpdateDevicePreset($args, $user);
        case 'delete_device_preset':
            return mcpAdminDeleteDevicePreset($args, $user);
        case 'set_device_quick_presets':
            return mcpAdminSetDeviceQuickPresets($args, $user);
        case 'replace_device_presets':
            return mcpAdminReplaceDevicePresets($args, $user);
        case 'reset_device_presets':
            return mcpAdminResetDevicePresets($args, $user);
        default:
            return null;
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
        return ['error' => 'Invalid variant. Call list_device_preset_options for allowed values.'];
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
                return ['error' => 'Invalid variant. Call list_device_preset_options for allowed values.'];
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
