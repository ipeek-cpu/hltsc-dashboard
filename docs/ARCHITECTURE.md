# Beads Console Architecture

**Version**: 1.0
**Date**: 2026-01-19

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Electron Shell                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    BrowserWindow (Main UI)                    │   │
│  │  ┌─────────────┬──────────────────┬────────────────────────┐ │   │
│  │  │  Sidebar    │   Kanban Board   │   Chat Panel           │ │   │
│  │  │  - Projects │   - Columns      │   - Claude CLI         │ │   │
│  │  │  - Agents   │   - Bead Cards   │   - Context Packs      │ │   │
│  │  │  - Sessions │   - Drag/Drop    │   - Streaming          │ │   │
│  │  └─────────────┴──────────────────┴────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    BrowserView (Preview)                      │   │
│  │  - Storybook/Simulator preview (CSP headers stripped)         │   │
│  │  - DevTools integration                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                    ┌───────────┴───────────┐                        │
│                    │   Electron Main       │                        │
│                    │   - IPC Handlers      │                        │
│                    │   - ServerManager     │                        │
│                    │   - PreviewManager    │                        │
│                    └───────────┬───────────┘                        │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   SvelteKit Server      │
                    │   (localhost:5555)      │
                    │   - API Routes          │
                    │   - SSE Streaming       │
                    │   - Claude CLI Bridge   │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
    ┌──────┴──────┐      ┌──────┴──────┐      ┌──────┴──────┐
    │  Beads DB   │      │ Claude CLI  │      │  CodeGraph  │
    │  (SQLite)   │      │  (PTY)      │      │  (Future)   │
    │             │      │             │      │             │
    │ .beads/     │      │ Streaming   │      │ Context     │
    │ beads.db    │      │ responses   │      │ extraction  │
    └─────────────┘      └─────────────┘      └─────────────┘
```

---

## Data Flow

### 1. Bead Updates (SSE)

```
Browser ←──────────── SSE ─────────────── /api/stream
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │ Poll SQLite      │
                                    │ PRAGMA data_ver  │
                                    │ every 1 second   │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ .beads/beads.db  │
                                    │ (read-only WAL)  │
                                    └──────────────────┘
```

### 2. Claude CLI Chat

```
User Input ───────► /api/projects/[id]/chat/[sessionId] ───► Claude CLI (PTY)
                                                                    │
                                                                    ▼
UI Update  ◄─────── /api/projects/[id]/chat/[sessionId]/stream ◄─── stdout
(SSE streaming)
```

### 3. Bead Write (with validation)

```
UI Action ───────► /api/projects/[id]/issues/[issueId] ───► Validation
                                                                │
                                                    ┌───────────┴───────────┐
                                                    │                       │
                                              VALID │               INVALID │
                                                    ▼                       ▼
                                           Write to              Return error
                                           issues.jsonl          (no write)
                                                    │
                                                    ▼
                                           Trigger beads
                                           sync (bd refresh)
```

---

## Key Components

### Frontend (SvelteKit + Svelte 5)

| Component | Purpose |
|-----------|---------|
| `EpicsView.svelte` | Kanban board with bead cards |
| `IssueCard.svelte` | Individual bead card with status, actions |
| `IssueDetailSheet.svelte` | Full bead details, edit, transitions |
| `ChatSheet.svelte` | Claude CLI integration panel |
| `AgentCard.svelte` | Agent status and quick actions |
| `SessionHistoryView.svelte` | Past sessions and context |
| `ActivityFeedPanel.svelte` | Real-time agent activity stream |

### Backend (SvelteKit API Routes)

| Route | Purpose |
|-------|---------|
| `/api/stream` | SSE endpoint for live bead updates |
| `/api/projects/[id]/issues` | CRUD for beads |
| `/api/projects/[id]/chat` | Chat session management |
| `/api/projects/[id]/chat/[sessionId]/stream` | Chat response streaming |
| `/api/projects/[id]/agents` | Agent listing (global + project) |
| `/api/projects/[id]/activity` | Agent activity log |
| `/api/projects/[id]/repair` | Data repair utility |

### Electron Main Process

| Module | Purpose |
|--------|---------|
| `main.ts` | Window creation, IPC handlers |
| `server-manager.ts` | SvelteKit server lifecycle |
| `preview-manager.ts` | BrowserView for previews, CSP bypass |
| `preload.ts` | IPC bridge to renderer |

### Libraries

| Module | Purpose |
|--------|---------|
| `bead-validation.ts` | State transition and data validation |
| `bead-lifecycle.ts` | Claim, complete, transition logic |
| `session-context.ts` | Session state management |
| `claude-cli.ts` | Claude Code CLI wrapper |
| `agent-activity-store.ts` | Activity event collection |
| `stale-detection.ts` | Stale bead alerting |
| `data-repair.ts` | Data corruption repair utility |

---

## Database Schema

The app reads from `.beads/beads.db` (SQLite). Key tables:

### issues
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Unique bead ID |
| title | TEXT | Bead title |
| description | TEXT | Markdown description |
| status | TEXT | open/ready/in_progress/in_review/closed |
| priority | INTEGER | 0=critical, 1=high, 2=medium, 3=low, 4=backlog |
| issue_type | TEXT | task/bug/feature/epic/question/docs/gate |
| assignee | TEXT | Agent or person assigned |
| notes | TEXT | Execution log, additional metadata |
| created_at | TEXT | ISO8601 with timezone |
| updated_at | TEXT | ISO8601 with timezone |

### dependencies
| Column | Type | Description |
|--------|------|-------------|
| issue_id | TEXT | Child bead |
| depends_on_id | TEXT | Parent/blocking bead |
| type | TEXT | blocks, parent-child |

### events
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment |
| issue_id | TEXT | Related bead |
| event_type | TEXT | status_change, comment, etc. |
| actor | TEXT | Who made the change |
| old_value | TEXT | Previous value |
| new_value | TEXT | New value |
| created_at | TEXT | When it happened |

---

## Security Model

### Local-Only
- All data stored in local git repositories
- No external API calls except to Claude (via authenticated CLI)
- No telemetry, no analytics, no tracking

### Electron Sandbox
- Renderer process sandboxed
- IPC bridge for specific operations only
- No direct filesystem access from renderer

### Claude Authentication
- OAuth via Claude Code CLI
- Credentials stored in macOS Keychain
- No API keys exposed to app

---

## Performance Considerations

### SQLite
- Read-only mode with WAL journaling
- Connection pooling (max 1 connection for reads)
- PRAGMA data_version polling (1 second interval)

### SSE Streaming
- Single EventSource per client
- Heartbeat every 15 seconds
- Automatic reconnection on disconnect

### Claude CLI
- PTY-based for real streaming (not buffered)
- One CLI process per active chat session
- Process cleanup on session close

---

## Core Module Strategy

### Current State

The `src/lib/` directory contains 43 TypeScript modules with no clear separation between:

| Category | Files | Purpose |
|----------|-------|---------|
| Database | `db.ts`, `project-db.ts`, `dashboard-db.ts` | SQLite access |
| Claude Integration | `claude-cli.ts`, `claude-auth.ts`, `claude-code-manager.ts`, `chat-manager.ts` | CLI wrapper, auth, session management |
| Beads Domain | `beads-manager.ts`, `beads-cli.ts`, `bead-validation.ts`, `bead-lifecycle.ts` | Bead operations |
| Session/State | `session-store.ts`, `session-context.ts`, `session-metrics.ts` | Session management |
| Agent System | `agents.ts`, `agent-activity-store.ts` | Agent parsing, activity tracking |
| Task Runner | `task-runner-store.ts`, `task-runner-manager.ts`, `active-tasks-store.ts` | Task execution |
| Infrastructure | `node-manager.ts`, `dev-server-manager.ts`, `scaffold-manager.ts` | Tool management |
| Utilities | `types.ts`, `settings.ts`, `data-repair.ts`, `stale-detection.ts`, `git-utils.ts` | Shared utilities |

### Proposed Core Module Location

```
src/lib/core/
├── validation/
│   ├── bead-validator.ts      # State transition rules, field validation
│   ├── timestamp-validator.ts # ISO8601 with timezone enforcement
│   └── schema.ts              # Zod/Valibot schemas
├── state-machine/
│   ├── bead-states.ts         # State definitions and transitions
│   └── session-states.ts      # Session lifecycle states
├── types/
│   ├── bead.ts                # Bead domain types
│   ├── session.ts             # Session domain types
│   └── agent.ts               # Agent domain types
└── index.ts                   # Public API
```

### Design Principles for Core

1. **No I/O**: Core modules must not import database, filesystem, or network modules
2. **No UI**: Core modules must not import Svelte stores or components
3. **Pure functions**: Prefer pure functions over stateful classes
4. **Testable**: All core logic must be unit-testable without mocks
5. **Explicit dependencies**: If external data needed, accept it as parameters

### Migration Path (NOT YET EXECUTED)

1. Extract pure validation logic from `bead-validation.ts` → `core/validation/`
2. Extract state machine from `bead-lifecycle.ts` → `core/state-machine/`
3. Consolidate types from multiple files → `core/types/`
4. Update imports in consuming modules
5. Add unit tests for all core modules

**Note**: This refactoring is tracked as a separate bead. Do NOT execute until explicitly planned.

---

## Future: CodeGraph Integration

CodeGraph will provide intelligent code context for prompts:

```
┌─────────────────────────────────────────────────────────────────┐
│                       CodeGraph Engine                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Parser    │  │   Indexer   │  │   Query     │             │
│  │   (TS/JS/   │  │   (Symbol   │  │   Engine    │             │
│  │   Swift/Go) │  │   DB)       │  │             │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                       │
│                  ┌───────────────┐                              │
│                  │ Context Pack  │                              │
│                  │ Generator     │                              │
│                  └───────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

Integration points:
- Bead acceptance criteria → relevant file suggestions
- Chat context → automatic code snippets
- Refactoring → impact analysis
