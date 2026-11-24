# Device Preview presets

Device Preview sizes live in **Admin → Configuration → Device Presets**. They are stored in the SQLite `settings` table as:

- `device_presets` — JSON array of devices
- `device_quick_presets` — JSON array of preset ids for the quick-select chip bar

If those keys are empty, LinkNest uses the built-in catalog from code.

## JSON format

See [`device-presets.template.json`](device-presets.template.json) for a full example (includes sample **iPhone 17** and **iPhone 18** entries).

```json
{
  "version": 1,
  "exportedAt": "2026-08-09T00:00:00.000Z",
  "quickPresets": ["iphone-14", "iphone-17"],
  "presets": [
    {
      "id": "iphone-17",
      "label": "iPhone 17",
      "width": 402,
      "height": 874,
      "variant": "iphone-island",
      "group": "iPhone"
    }
  ]
}
```

### Fields

| Field | Notes |
|-------|--------|
| `id` | Unique slug (`iphone-17`) |
| `label` | Dropdown label |
| `width` / `height` | CSS viewport (120–4096) |
| `group` | `Responsive`, `iPhone`, `Android`, `Tablet`, `Watch`, or `Enterprise` |
| `variant` | Mockup shell: `iphone-island`, `iphone-notch`, `iphone-legacy`, `android`, `android-tablet`, `ipad`, `watch-square`, `watch-round`, `zebra-handheld`, `zebra-tc73`, `zebra-tc58`, `zebra-tc52ax`, `zebra-et60`, `zebra-et51`, `zebra-mc3300`, `zebra-mc9300` |

New phones can reuse an existing variant (e.g. `iphone-island`); a unique bezel is not required.

## Workflow

1. **Export JSON** from Admin → Device Presets (or start from the template file).
2. Edit / add devices (width × height + group + variant).
3. **Import JSON** — replaces the saved catalog and writes to the database.
4. Or use **Add device** in Admin and click **Add & save**.
5. **Reset defaults** clears custom settings so built-ins apply again.

Admins with an MCP token bound to an administrator (write to edit) can manage Device Presets from Cursor or Claude: `list_device_presets` and `manage_device_presets` (`action` add / update / delete / set_quick / replace / reset). `replace` and `reset` need `confirm: true`. See [`MCP.md`](MCP.md).

Import replaces the full list (not a merge). Keep your previous export if you need to restore.
