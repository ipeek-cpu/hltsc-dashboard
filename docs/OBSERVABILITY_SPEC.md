# Beads Console Observability Specification

**Version**: 1.0
**Date**: 2026-01-19

---

## Overview

Observability in Beads Console provides visibility into agent activity, session performance, and system health. All data is stored locally - no external telemetry services.

---

## Observability Pillars

### 1. Activity Traces

Real-time visibility into what agents are doing.

### 2. Session Metrics

Performance and usage data for sessions.

### 3. System Health

Dashboard and Claude CLI health indicators.

---

## Activity Traces

### Event Types

```typescript
type ActivityEventType =
  // Session lifecycle
  | 'session_start'
  | 'session_pause'
  | 'session_resume'
  | 'session_end'

  // Bead lifecycle
  | 'bead_claimed'
  | 'bead_completed'
  | 'bead_blocked'
  | 'bead_abandoned'

  // Agent actions
  | 'file_read'
  | 'file_write'
  | 'file_create'
  | 'file_delete'
  | 'command_start'
  | 'command_complete'
  | 'command_error'

  // Git operations
  | 'git_commit'
  | 'git_push'
  | 'git_pr_create'
  | 'git_pr_merge'

  // Claude interactions
  | 'message_sent'
  | 'message_received'
  | 'tool_call'
  | 'tool_result'
  | 'error';
```

### Event Structure

```typescript
interface ActivityEvent {
  id: string;
  timestamp: string;           // ISO8601 with timezone

  // Context
  session_id?: string;
  bead_id?: string;
  agent_id?: string;

  // Event
  type: ActivityEventType;

  // Details (varies by type)
  details: {
    // For file events
    file_path?: string;
    bytes?: number;

    // For command events
    command?: string;
    exit_code?: number;
    duration_ms?: number;
    output?: string;           // Truncated if long

    // For git events
    commit_hash?: string;
    branch?: string;
    pr_url?: string;
    pr_number?: number;

    // For message events
    role?: 'user' | 'assistant';
    tokens?: number;
    latency_ms?: number;

    // For tool calls
    tool?: string;
    input_summary?: string;
    output_summary?: string;

    // For errors
    error_type?: string;
    error_message?: string;
    stack?: string;
  };
}
```

### Activity Storage

```
.beads/
└── activity/
    ├── 2026-01-19.jsonl      # One file per day
    ├── 2026-01-18.jsonl
    └── index.json            # Recent activity index
```

---

## Activity Feed UI

### Real-time Feed Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Activity Feed                                    [Filter ▼]    │
├─────────────────────────────────────────────────────────────────┤
│  10:45:23  📝 file_write                                       │
│            src/lib/auth.ts (1,234 bytes)                       │
│            Session: Implement login • BC-001                    │
│                                                                  │
│  10:45:21  ▶️ command_complete                                  │
│            npm test (exit: 0, 4.2s)                            │
│            ✓ 12 tests passed                                    │
│                                                                  │
│  10:44:58  🔧 tool_call                                        │
│            Edit: src/lib/auth.ts                               │
│            Added validatePassword function                      │
│                                                                  │
│  10:44:45  💬 message_received                                  │
│            1,247 tokens • 2.3s latency                         │
│                                                                  │
│  10:44:32  📖 file_read                                        │
│            src/lib/types.ts                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Filters

- By event type (file, command, git, message)
- By session
- By bead
- By time range

### Event Detail Expansion

Click to expand any event:

```
┌─────────────────────────────────────────────────────────────────┐
│  ▶️ command_complete                              10:45:21      │
├─────────────────────────────────────────────────────────────────┤
│  Command:   npm test                                            │
│  Exit code: 0                                                   │
│  Duration:  4.2s                                                │
│  Session:   Implement login validation                          │
│  Bead:      BC-001                                              │
│                                                                  │
│  Output:                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  > my-app@1.0.0 test                                    │   │
│  │  > vitest run                                           │   │
│  │                                                          │   │
│  │  ✓ src/lib/auth.test.ts (6 tests) 1.2s                 │   │
│  │  ✓ src/lib/validation.test.ts (6 tests) 0.8s          │   │
│  │                                                          │   │
│  │  Test Files  2 passed (2)                               │   │
│  │  Tests       12 passed (12)                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Session Metrics

### Per-Session Metrics

```typescript
interface SessionMetrics {
  session_id: string;

  // Timing
  total_duration_ms: number;        // Wall clock time
  active_duration_ms: number;       // Excluding pauses

  // Messages
  user_messages: number;
  assistant_messages: number;
  total_tokens: number;
  avg_response_latency_ms: number;

  // Tool usage
  tool_calls: number;
  files_read: number;
  files_written: number;
  commands_run: number;

  // Git
  commits: number;
  lines_added: number;
  lines_removed: number;

  // Errors
  errors: number;
  command_failures: number;
}
```

### Metrics Bar (Session View)

```
┌─────────────────────────────────────────────────────────────────┐
│  Session Metrics                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ⏱️ 45m active    💬 12 messages    🎟️ 8,432 tokens             │
│  📝 6 files       ▶️ 8 commands     📦 3 commits                 │
└─────────────────────────────────────────────────────────────────┘
```

### Session Timeline

Visual timeline of session activity:

```
┌─────────────────────────────────────────────────────────────────┐
│  Session Timeline                                               │
├─────────────────────────────────────────────────────────────────┤
│  10:00        10:15        10:30        10:45        11:00      │
│  ├────────────┼────────────┼────────────┼────────────┤          │
│  │▓▓▓▓▓▓░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░▓▓▓▓▓▓▓▓▓│          │
│  │                                                    │          │
│  │ 💬──📖──📖──📝──▶️──📝──▶️──📦──💬──📖──📝──▶️──📦│          │
│  │                                                    │          │
│  │ ▓ Active  ░ Idle/Waiting                          │          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Aggregated Metrics

### Project Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Project Metrics (Last 7 Days)                                  │
├──────────────────────────┬──────────────────────────────────────┤
│  Sessions                │  Beads                               │
│  ├─ Total: 23            │  ├─ Completed: 8                     │
│  ├─ Avg duration: 38m    │  ├─ In progress: 3                   │
│  └─ Total time: 14.5h    │  └─ Avg sessions/bead: 2.1           │
├──────────────────────────┼──────────────────────────────────────┤
│  Tokens                  │  Activity                            │
│  ├─ Total: 142,000       │  ├─ Files modified: 45               │
│  ├─ Avg/session: 6,173   │  ├─ Commands run: 156                │
│  └─ Cost est: $4.26      │  └─ Commits: 24                      │
└──────────────────────────┴──────────────────────────────────────┘
```

### Trend Charts

```
Sessions per Day                    Tokens per Day
┌────────────────────┐              ┌────────────────────┐
│        ▄▄          │              │     ▄▄             │
│     ▄▄ ██          │              │  ▄▄ ██ ▄▄         │
│  ▄▄ ██ ██ ▄▄ ▄▄   │              │  ██ ██ ██ ▄▄ ▄▄   │
│  ██ ██ ██ ██ ██ ▄▄│              │  ██ ██ ██ ██ ██ ▄▄│
├────────────────────┤              ├────────────────────┤
│  M  T  W  Th F  S  │              │  M  T  W  Th F  S  │
└────────────────────┘              └────────────────────┘
```

---

## System Health

### Health Indicators

```typescript
interface SystemHealth {
  // Dashboard
  dashboard_status: 'healthy' | 'degraded' | 'error';
  sveltekit_server: boolean;
  sqlite_connection: boolean;
  sse_active_connections: number;

  // Claude CLI
  claude_cli_installed: boolean;
  claude_cli_version: string;
  claude_authenticated: boolean;
  active_sessions: number;

  // Beads
  beads_db_path: string;
  beads_db_accessible: boolean;
  last_sync: string;

  // Resources
  memory_usage_mb: number;
  cpu_usage_percent: number;
}
```

### Health Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  System Health                                     [Refresh]    │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard        ●  Healthy                                    │
│    SvelteKit      ✓  Running on :5555                          │
│    SQLite         ✓  Connected (WAL mode)                       │
│    SSE            ✓  2 active connections                       │
│                                                                  │
│  Claude CLI       ●  Healthy                                    │
│    Version        ✓  1.0.14                                     │
│    Auth           ✓  Authenticated (expires in 23h)            │
│    Sessions       ✓  1 active                                   │
│                                                                  │
│  Beads            ●  Healthy                                    │
│    Database       ✓  /Users/dev/.beads/beads.db                │
│    Last sync      ✓  2 seconds ago                              │
│                                                                  │
│  Resources                                                       │
│    Memory         158 MB                                        │
│    CPU            3%                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Alerts

### Alert Types

```typescript
type AlertType =
  | 'bead_stale'           // Bead stuck too long
  | 'session_idle'         // Active session with no activity
  | 'command_failed'       // Command exited with error
  | 'auth_expiring'        // Claude auth expiring soon
  | 'disk_space_low'       // Running out of space
  | 'sync_failed';         // Beads sync failed
```

### Alert Display

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Alerts (2)                                                  │
├─────────────────────────────────────────────────────────────────┤
│  🟡 Bead stale: BC-003                            [View] [Dismiss]
│     In progress for 6 hours with no activity                    │
│                                                                  │
│  🔴 Command failed: npm test                      [View] [Dismiss]
│     Exit code 1 in session "Fix auth bug"                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Retention

### Retention Policy

| Data Type | Retention |
|-----------|-----------|
| Activity events | 30 days |
| Session metrics | 90 days |
| Session transcripts | Forever (user controlled) |
| System health snapshots | 7 days |

### Cleanup

```typescript
async function cleanupOldData(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  // Remove old activity files
  const activityFiles = await glob('.beads/activity/*.jsonl');
  for (const file of activityFiles) {
    const date = parseDateFromFilename(file);
    if (date < cutoffDate) {
      await fs.unlink(file);
    }
  }
}
```

---

## Export

### Export Formats

- **JSON**: Full structured data
- **CSV**: Tabular metrics
- **Markdown**: Human-readable reports

### Export UI

```
┌─────────────────────────────────────────────────────────────────┐
│  Export Data                                                    │
├─────────────────────────────────────────────────────────────────┤
│  Date range:  [Last 7 days ▼]                                  │
│                                                                  │
│  Include:                                                       │
│  ☑ Activity events                                              │
│  ☑ Session metrics                                              │
│  ☐ Session transcripts                                          │
│  ☐ System health logs                                           │
│                                                                  │
│  Format:  ○ JSON  ● Markdown  ○ CSV                            │
│                                                                  │
│                                              [Cancel] [Export]  │
└─────────────────────────────────────────────────────────────────┘
```
