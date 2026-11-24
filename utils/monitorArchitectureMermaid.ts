/** Shared Mermaid sources for Help, About, and docs/PYTHON_WORKERS.md */

export const MONITOR_ARCH_FLOW = `flowchart TB
  subgraph ApacheUI["Apache / PHP - UI only"]
    Dash["Monitoring dashboard"]
    API["PHP API"]
  end

  subgraph Sched["OS scheduler - outside Apache"]
    Win["Windows Task Scheduler"]
    Dock["Docker entrypoint loop"]
    Cron["Linux cron"]
  end

  subgraph Py["Python workers"]
    MR["monitor_runner.py"]
    ES["email_sender.py"]
  end

  DB[("SQLite<br/>data/linknest.db")]
  Targets["URL / headers / keyword / port / ping<br/>SSL / DNS / JSON"]
  SMTP["SMTP"]

  Dash -->|"configure + read status"| API
  API --> DB
  Win --> MR
  Win --> ES
  Dock --> MR
  Dock --> ES
  Cron --> MR
  Cron --> ES
  MR -->|"probe with hard timeouts"| Targets
  MR -->|"monitors + monitor_logs + email_outbox"| DB
  ES -->|"read email_outbox"| DB
  ES --> SMTP
  ES -->|"monitor_notification_logs"| DB

  classDef ui fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px
  classDef sched fill:#F8FAFC,stroke:#64748B,color:#334155,stroke-width:1.5px
  classDef work fill:#F5F3FF,stroke:#7C3AED,color:#4C1D95,stroke-width:1.5px
  classDef data fill:#FFFBEB,stroke:#D97706,color:#92400E,stroke-width:1.5px
  classDef ext fill:#F0FDFA,stroke:#0D9488,color:#134E4A,stroke-width:1.5px

  class Dash,API ui
  class Win,Dock,Cron sched
  class MR,ES work
  class DB data
  class Targets,SMTP ext`;

export const MONITOR_RUNNER_SEQ = `sequenceDiagram
  autonumber
  participant Sched as Task Scheduler / cron / Docker
  participant MR as monitor_runner.py
  participant T as Target
  participant DB as SQLite

  Sched->>MR: Interval job (1-2 min)
  MR->>DB: Load active monitors
  Note over MR: Network work is off Apache
  loop Due monitors concurrently
    MR->>T: URL / headers / keyword / port / ping / SSL / DNS / JSON
    T-->>MR: Status + latency or timeout
  end
  MR->>DB: UPDATE monitors + INSERT monitor_logs
  alt Status changed and notifications not paused
    MR->>DB: INSERT email_outbox
  end
  Note over DB: Dashboard reads the same tables`;

export const EMAIL_SENDER_SEQ = `sequenceDiagram
  autonumber
  participant Sched as Task Scheduler / cron / Docker
  participant ES as email_sender.py
  participant DB as SQLite
  participant SMTP as SMTP server

  Sched->>ES: Interval job
  ES->>DB: Claim due email_outbox rows
  loop Each claimed message
    ES->>DB: Re-check pause / maintenance / rules
    ES->>SMTP: Send with timeout
    SMTP-->>ES: OK or error
    ES->>DB: Mark sent or backoff retry
    ES->>DB: INSERT monitor_notification_logs
  end`;
