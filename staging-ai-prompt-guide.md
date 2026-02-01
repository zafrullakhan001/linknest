# LinkNest Staging – AI Offline Prompt Guide

Use this guide with **ChatGPT**, **Claude**, or other LLMs to generate tile and link configurations offline. Copy the prompts below, paste into your AI chat, customize your requirements, and save the AI's CSV output. Then upload the CSV in the Staging tab to generate an import-ready JSON file.

---

## Data Hierarchy

LinkNest tiles follow this structure:

```
Tile Category (group)
└── Tile (space/card)
    └── Tab
        └── Section
            └── Link
```

- **Tile Category**: Logical grouping (e.g., "Development", "Operations", "HR")
- **Tile**: A space containing tabs and links (e.g., "Architecture Links", "Monitoring Hub")
- **Tab**: Tabs within a tile (e.g., "Default", "Documentation", "Status")
- **Section**: Sections within a tab (e.g., "API Docs", "Architecture Links")
- **Link**: Individual URL with label (e.g., "API Documentation", "https://api.example.com/docs")

---

## Prompt 1: Generate CSV from Description

Copy and paste this into your AI, then describe your needs:

```
Generate a CSV file for LinkNest tile import with the following columns (exact headers):
Tile Group, Tile Title, Tile Description, Tile Emoji, Tile Theme Color, Tab Title, Section Title, Link Label, Link URL, Link Icon, Link Visibility, Link Notes, Link Tooltip

Rules:
- Tile Group = category (e.g., Development, Operations, HR)
- Each row defines ONE link; repeat Tile Title, Tile Group, Tab Title, Section Title for links in the same tile/tab/section
- Required: Tile Group, Tile Title, Link Label, Link URL
- Tile Emoji: single emoji (e.g., 📁, 🚀, 💻, 📊, 🔐)
- Tile Theme Color: blue, emerald, violet, amber, rose, cyan, fuchsia, orange, red, indigo, lime, sky, slate, teal, pink, purple, yellow, zinc
- Tab Title: default "Default" if only one tab
- Section Title: e.g., "Documentation", "Quick Links"
- Link Visibility: public, authenticated, or private
- Link Icon, Link Notes, Link Tooltip: optional; leave empty if not needed

Output ONLY valid CSV with header row and data rows. No markdown, no code fences, no explanation.
```

**Your request:** *[Describe the tiles and links you need, e.g., "Create tiles for a software team: Development category with API Docs and Repositories sections, Operations with Monitoring and Alerts."]*

---

## Prompt 2: Structured Bulk Generation

Use this for larger or more structured requests:

```
You are generating a LinkNest CSV for bulk import. Structure:

1. Categories (Tile Group): List 3–5 categories (e.g., Development, Operations, HR, Marketing, Support)
2. For each category, define 1–3 tiles (Tile Title, Tile Description, Tile Emoji, Tile Theme Color)
3. Each tile has 1–2 tabs (Tab Title)
4. Each tab has 1–3 sections (Section Title)
5. Each section has 2–5 links (Link Label, Link URL)

Output a CSV with columns:
Tile Group, Tile Title, Tile Description, Tile Emoji, Tile Theme Color, Tab Title, Section Title, Link Label, Link URL, Link Icon, Link Visibility, Link Notes, Link Tooltip

Use realistic placeholder URLs (e.g., https://docs.example.com, https://status.example.com).
Output ONLY the CSV. No markdown code block, no extra text.
```

---

## Prompt 3: Expand from a List

If you have a simple list of links to organize:

```
I have these links to organize into LinkNest tiles:
[List your links, e.g.:
- API Docs: https://api.example.com/docs
- Status Page: https://status.example.com
- GitHub: https://github.com/org/repo
]

Organize them into logical categories, tiles, tabs, and sections. Generate a CSV with columns:
Tile Group, Tile Title, Tile Description, Tile Emoji, Tile Theme Color, Tab Title, Section Title, Link Label, Link URL, Link Icon, Link Visibility, Link Notes, Link Tooltip

Use sensible defaults (e.g., Tab Title "Default", Section Title "Links", Visibility "public").
Output ONLY the CSV. No markdown, no explanation.
```

---

## Next Steps

1. **Save the AI output** as a `.csv` file (e.g., `my-tiles.csv`).
2. **Open the Staging tab** in LinkNest (admin only).
3. **Upload your CSV** using "Generate JSON from CSV" to produce an import-ready JSON file.
4. **Import the JSON** using the category import button or the "Import AI JSON" option in the Staging action bar.

---

## Example CSV Output

```csv
Tile Group,Tile Title,Tile Description,Tile Emoji,Tile Theme Color,Tab Title,Section Title,Link Label,Link URL,Link Icon,Link Visibility,Link Notes,Link Tooltip
Development,API Hub,Developer resources,💻,emerald,Default,Documentation,API Docs,https://api.example.com/docs,,public,,
Development,API Hub,Developer resources,💻,emerald,Default,Documentation,Guide,https://docs.example.com,,public,,
Operations,Monitoring,Service status,📊,amber,Default,Status,Status Page,https://status.example.com,,public,,
```

---

*This guide is part of the LinkNest Staging offline workflow. Download the CSV template from the Staging tab for column reference.*
