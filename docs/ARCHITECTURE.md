# LinkNest Architecture

High-level system design for LinkNest: React UI, PHP API, SQLite storage, background workers, and the in-app update pipeline. Diagrams below render as Mermaid in **Help → Guides → Architecture**.

## System overview

Browser clients talk to a same-origin PHP API. Session cookies authenticate users. SQLite in `data/` is the primary store; optional workers handle monitoring and email.

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    Browser["🌐 Browser SPA"]
    Land["🔗 land/ launcher"]
  end

  subgraph App["LinkNest application"]
    Vite["⚛️ React + Vite UI"]
    API["⚡ PHP API<br/>api/index.php"]
    DB[("🗄️ SQLite<br/>data/linknest.db")]
    Uploads["📁 uploads/"]
    Workers["🐍 Python workers"]
  end

  subgraph External["External services"]
    LDAP["🔐 LDAP / SAML IdP"]
    GitHub["📦 GitHub git / Releases"]
    SMTP["✉️ SMTP / Mailpit"]
    Gemini["✨ Google Gemini"]
  end

  Browser --> Vite
  Land --> Vite
  Vite -->|"fetch /api/*"| API
  API --> DB
  API --> Uploads
  API --> LDAP
  API --> GitHub
  API --> SMTP
  API --> Gemini
  Workers --> DB
  Workers --> SMTP

  classDef client fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px
  classDef ui fill:#F0FDFA,stroke:#0D9488,color:#134E4A,stroke-width:1.5px
  classDef api fill:#EEF2FF,stroke:#4F46E5,color:#312E81,stroke-width:1.5px
  classDef data fill:#FFFBEB,stroke:#D97706,color:#92400E,stroke-width:1.5px
  classDef work fill:#F5F3FF,stroke:#7C3AED,color:#4C1D95,stroke-width:1.5px
  classDef ext fill:#F8FAFC,stroke:#64748B,color:#334155,stroke-width:1.5px

  class Browser,Land client
  class Vite ui
  class API api
  class DB,Uploads data
  class Workers work
  class LDAP,GitHub,SMTP,Gemini ext
```

## Request path

Typical authenticated request from UI through the central router into an endpoint module.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant R as React services/
  participant I as api/index.php
  participant E as Endpoint
  participant S as SQLite

  rect rgb(239, 246, 255)
    Note over U,R: UI action
    U->>R: Open / save / load
    R->>I: HTTP + session cookie
  end

  rect rgb(238, 242, 255)
    Note over I,E: Route & authorize
    I->>I: Match PATH_INFO
    I->>E: Include endpoint
  end

  rect rgb(255, 251, 235)
    Note over E,S: Persist / read
    E->>S: PDO prepared SQL
    S-->>E: Rows
  end

  E-->>R: JSON data or error
  R-->>U: UI update
```

## Login sequence

How Local / LDAP / SAML settle into a PHP session used by the rest of the app.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant UI as AuthModal
  participant A as auth.php
  participant IdP as LDAP / SAML
  participant S as Session + SQLite

  alt Local password
    U->>UI: Username + password
    UI->>A: POST /api/auth/login
    A->>S: Verify credentials
  else LDAP
    U->>UI: Directory credentials
    UI->>A: POST login LDAP
    A->>IdP: Bind / search
    IdP-->>A: User attributes
    A->>S: Upsert user + session
  else SAML SSO
    U->>UI: Start SSO
    UI->>A: SAML ACS flow
    A->>IdP: Assert identity
    IdP-->>A: Assertion
    A->>S: Create session
  end

  A-->>UI: User profile + roles
  UI-->>U: Signed-in home
```

## Frontend structure

Contexts hold global auth/settings/styles. Feature UI lives in components; API access is centralized in services.

```mermaid
flowchart LR
  subgraph Entry["Boot"]
    Index["index.tsx"]
    App["App.tsx"]
  end

  subgraph State["Contexts"]
    Auth["🔐 AuthContext"]
    Settings["⚙️ SettingsContext"]
    Style["🎨 StyleContext"]
  end

  subgraph UI["Screens & chrome"]
    Nav["🧭 Navigation"]
    Grid["▦ TileGrid"]
    Detail["📋 TileDetail"]
    Admin["🛡️ AdminPanel"]
    Help["❓ Help & Guides"]
    Widgets["🧩 Floating widgets"]
  end

  subgraph IO["API layer"]
    Services["📡 services/*"]
  end

  Index --> App
  App --> Auth
  App --> Settings
  App --> Style
  App --> Nav
  App --> Grid
  App --> Detail
  App --> Admin
  App --> Help
  App --> Widgets
  Grid --> Services
  Detail --> Services
  Admin --> Services
  Help --> Services
  Auth --> Services

  classDef boot fill:#F8FAFC,stroke:#64748B,color:#0F172A,stroke-width:1.5px
  classDef ctx fill:#ECFDF5,stroke:#059669,color:#064E3B,stroke-width:1.5px
  classDef screen fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px
  classDef svc fill:#EEF2FF,stroke:#4F46E5,color:#312E81,stroke-width:1.5px

  class Index,App boot
  class Auth,Settings,Style ctx
  class Nav,Grid,Detail,Admin,Help,Widgets screen
  class Services svc
```

### Key frontend folders

| Path | Role |
|------|------|
| `components/` | Screens, dialogs, tiles, widgets |
| `contexts/` | Auth, settings, styles |
| `services/` | API clients (`storageService`, `authService`, `updaterService`, …) |
| `hooks/` | Shared hooks (e.g. mobile) |
| `utils/` | Markdown renderers, helpers |

## Save a tile (sequence)

What happens when an editor saves space content.

```mermaid
sequenceDiagram
  autonumber
  actor E as Editor
  participant TD as TileDetail
  participant SS as storageService
  participant API as tiles.php
  participant DB as SQLite

  E->>TD: Edit tabs / links / theme
  TD->>SS: saveTile(tile)
  SS->>API: PUT /api/tiles/{id}
  API->>API: Auth + permissions check
  API->>DB: UPDATE tile JSON / columns
  DB-->>API: OK
  API-->>SS: { data: tile }
  SS-->>TD: Updated tile
  TD-->>E: Grid / detail refresh
```

## Backend / API

`api/index.php` dispatches by path to focused PHP modules. Config and migrations live in `api/config.php`.

```mermaid
flowchart TB
  Client["🌐 HTTP client"] --> Router["⚡ api/index.php"]
  Router --> AuthA["🔐 auth.php"]
  Router --> Tiles["▦ tiles.php"]
  Router --> SettingsA["⚙️ settings.php"]
  Router --> Docs["📚 docs.php"]
  Router --> Updater["🚀 updater.php"]
  Router --> Other["… other endpoints"]
  AuthA --> Config["config.php + PDO"]
  Tiles --> Config
  SettingsA --> Config
  Docs --> Files[("📄 docs/*.md")]
  Updater --> Git["📦 git / GitHub"]
  Updater --> Snap["💾 updater-snapshots/"]
  Config --> DB[("🗄️ SQLite")]

  classDef edge fill:#F8FAFC,stroke:#64748B,color:#334155,stroke-width:1.5px
  classDef route fill:#EEF2FF,stroke:#4F46E5,color:#312E81,stroke-width:1.5px
  classDef ep fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px
  classDef store fill:#FFFBEB,stroke:#D97706,color:#92400E,stroke-width:1.5px
  classDef out fill:#F0FDFA,stroke:#0D9488,color:#134E4A,stroke-width:1.5px

  class Client edge
  class Router route
  class AuthA,Tiles,SettingsA,Docs,Updater,Other ep
  class Config,DB,Files,Snap store
  class Git out
```

## Auth & access

Supported login methods feed a session-backed user. Tile visibility and RBAC/groups gate data.

```mermaid
flowchart LR
  Local["👤 Local user"]
  LDAPN["🗂️ LDAP"]
  SAML["🔑 SAML"]
  Session["🍪 PHP session"]
  Roles["👥 Roles / groups"]
  TilesV["🛡️ Tile visibility<br/>+ permissions"]

  Local --> Session
  LDAPN --> Session
  SAML --> Session
  Session --> Roles
  Roles --> TilesV

  classDef idp fill:#F8FAFC,stroke:#64748B,color:#334155,stroke-width:1.5px
  classDef sess fill:#ECFDF5,stroke:#059669,color:#064E3B,stroke-width:1.5px
  classDef rbac fill:#EEF2FF,stroke:#4F46E5,color:#312E81,stroke-width:1.5px
  classDef gate fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px

  class Local,LDAPN,SAML idp
  class Session sess
  class Roles rbac
  class TilesV gate
```

## Data model (conceptual)

Tiles are the primary entity: themes, tabs, sections, and links, plus visibility and allow-lists.

```mermaid
erDiagram
  USER ||--o{ TILE : owns_or_edits
  GROUP ||--o{ USER : contains
  TILE ||--|{ TAB : has
  TAB ||--|{ SECTION : has
  SECTION ||--o{ LINK : contains
  TILE }o--o{ GROUP : allowedGroups
  TILE }o--o{ USER : allowedUsers

  USER {
    string id
    string username
    string role
  }
  TILE {
    string id
    string title
    string visibility
    string themeColor
  }
```

## App Updates pipeline

Admin → App Updates can preview commits/releases, optionally snapshot the DB, then apply via git (preferred on XAMPP) or ZIP packages.

```mermaid
flowchart TB
  UI["🖥️ UpdatesDialog"]
  API["⚡ updater.php"]
  Preview["🔍 GET /updater/preview"]
  Apply["▶️ POST apply / CLI"]
  Snap["💾 DB snapshot<br/>updater-snapshots/"]
  Git["📦 git fetch / checkout"]
  Zip["🗜️ ZIP download + extract"]
  Hist["🕘 History + rollback"]

  UI --> Preview
  UI --> Apply
  Preview --> API
  Apply --> API
  API --> Snap
  API --> Git
  API --> Zip
  Apply --> Hist
  Hist -->|"rollback"| Snap
  Hist -->|"rollback"| Git

  classDef ui fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px
  classDef api fill:#EEF2FF,stroke:#4F46E5,color:#312E81,stroke-width:1.5px
  classDef safe fill:#ECFDF5,stroke:#059669,color:#064E3B,stroke-width:1.5px
  classDef src fill:#FFFBEB,stroke:#D97706,color:#92400E,stroke-width:1.5px
  classDef hist fill:#F8FAFC,stroke:#64748B,color:#334155,stroke-width:1.5px

  class UI ui
  class API,Preview,Apply api
  class Snap safe
  class Git,Zip src
  class Hist hist
```

## Apply an update (sequence)

End-to-end flow when an admin confirms a commit or release.

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  participant UI as UpdatesDialog
  participant U as updater.php
  participant Snap as DB snapshots
  participant Git as git / GitHub
  participant App as App files

  A->>UI: Choose commit / release
  UI->>U: GET /updater/preview
  U-->>UI: Files, size, rebuild flag
  A->>UI: Confirm apply (+ DB backup)
  UI->>U: POST apply

  alt Database backup enabled
    U->>Snap: WAL checkpoint + copy DB
    Snap-->>U: snapshot id
  end

  alt Git mode
    U->>Git: fetch + checkout target
    Git-->>U: New HEAD
  else ZIP mode
    U->>Git: Download release asset
    U->>App: Extract package
  end

  U->>App: Record history entry
  U-->>UI: Progress → complete
  UI-->>A: Reload / verify
```

## Operations workers

Optional Python workers for monitoring and outbound email, sharing the same SQLite database and SMTP settings.

```mermaid
flowchart LR
  Cron["⏱️ Scheduler / OS task"]
  MW["📡 Monitoring worker"]
  EW["✉️ Email worker"]
  DB[("🗄️ SQLite")]
  SMTP["📨 SMTP"]

  Cron --> MW
  Cron --> EW
  MW --> DB
  EW --> DB
  EW --> SMTP

  classDef sched fill:#F8FAFC,stroke:#64748B,color:#334155,stroke-width:1.5px
  classDef work fill:#EEF2FF,stroke:#4F46E5,color:#312E81,stroke-width:1.5px
  classDef data fill:#FFFBEB,stroke:#D97706,color:#92400E,stroke-width:1.5px
  classDef mail fill:#F0FDFA,stroke:#0D9488,color:#134E4A,stroke-width:1.5px

  class Cron sched
  class MW,EW work
  class DB data
  class SMTP mail
```

## Monitoring check (sequence)

How a scheduled worker records link health for the monitoring UI.

```mermaid
sequenceDiagram
  autonumber
  participant Cron as Scheduler
  participant W as Monitoring worker
  participant DB as SQLite
  participant T as Target URL

  Cron->>W: Trigger interval job
  W->>DB: Load monitors / links
  loop Each target
    W->>T: HTTP probe
    T-->>W: Status / latency
    W->>DB: Write result + history
  end
  Note over W,DB: Dashboard reads same tables
```

## Deploy shapes

| Mode | Notes |
|------|--------|
| XAMPP / Apache | Common local/prod path; PHP serves API + built `dist/` |
| Vite dev | `npm run dev` + `php -S` with API proxy |
| Docker | Multi-stage image: Apache + PHP + SQLite |

---

For setup and day-to-day ops, see **Getting Started** and **Updates & Deploy** in this same Guides panel.
