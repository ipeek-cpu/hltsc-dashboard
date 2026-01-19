# Beads Console Session Model

**Version**: 1.0
**Date**: 2026-01-19

---

## Overview

Sessions are first-class objects in Beads Console. They capture the full context of work - which bead, which agent, what was discussed, what files were touched. Sessions provide continuity across interruptions and enable review of past work.

---

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     Session State Machine                        │
│                                                                  │
│   ┌─────────┐     ┌──────────┐     ┌───────────┐     ┌────────┐│
│   │  draft  │────▶│  active  │────▶│  paused   │────▶│ closed ││
│   └─────────┘     └──────────┘     └───────────┘     └────────┘│
│        │               │                │                  ▲    │
│        │               │                │                  │    │
│        └───────────────┴────────────────┴──────────────────┘    │
│                            (can close from any state)            │
└─────────────────────────────────────────────────────────────────┘
```

### States

| State | Description |
|-------|-------------|
| `draft` | Session created but not yet started (selecting agent, context) |
| `active` | Work in progress, Claude CLI running |
| `paused` | Temporarily stopped, can be resumed |
| `closed` | Completed or abandoned, read-only |

### Transitions

| From | To | Trigger |
|------|-----|---------|
| draft | active | User starts session (with or without bead) |
| active | paused | User pauses, or inactivity timeout |
| active | closed | User ends session, or bead moves to in_review |
| paused | active | User resumes |
| paused | closed | User abandons |
| * | closed | User explicitly closes |

---

## Session Data Model

```typescript
interface Session {
  // Identity
  id: string;                    // UUID
  project_id: string;            // Which project

  // Context
  bead_id?: string;              // Associated bead (optional)
  agent_id?: string;             // Which agent prompt

  // State
  status: 'draft' | 'active' | 'paused' | 'closed';

  // Timing
  created_at: string;            // ISO8601 with timezone
  started_at?: string;           // When work began
  paused_at?: string;            // When paused (if applicable)
  closed_at?: string;            // When ended

  // Content
  title?: string;                // User-provided or auto-generated
  objective?: string;            // What we're trying to accomplish

  // Artifacts
  context_pack?: ContextPack;    // Code context included
  messages: Message[];           // Chat history
  files_touched: string[];       // Files read/written
  commits: string[];             // Commit hashes created

  // Metrics
  total_tokens?: number;         // API usage
  total_duration_ms?: number;    // Active time
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;

  // Tool usage
  tool_calls?: ToolCall[];

  // Metadata
  tokens?: number;
  latency_ms?: number;
}

interface ToolCall {
  tool: string;                  // Read, Write, Bash, etc.
  input: Record<string, unknown>;
  output?: string;
  duration_ms?: number;
}
```

---

## Session Creation Flow

### 1. From Bead Card

```
User clicks "Start Work" on a READY bead
    │
    ▼
┌────────────────────────────┐
│   Claim Bead Modal         │
│   - Branch name (required) │
│   - Agent selection        │
│   - Context pack options   │
└────────────┬───────────────┘
             │
             ▼
    Bead moves to IN_PROGRESS
    Session created in 'active' state
    Chat panel opens
```

### 2. Ad-hoc (No Bead)

```
User clicks "New Session"
    │
    ▼
┌────────────────────────────┐
│   New Session Modal        │
│   - Title (optional)       │
│   - Objective (optional)   │
│   - Agent selection        │
│   - Link to bead (optional)│
└────────────┬───────────────┘
             │
             ▼
    Session created in 'active' state
    Chat panel opens
```

---

## Session Persistence

### Local Storage (per project)

Sessions are stored in the project's `.beads/` directory:

```
.beads/
├── beads.db              # Main beads database
├── issues.jsonl          # Beads data
└── sessions/
    ├── index.json        # Session metadata index
    └── {session-id}/
        ├── meta.json     # Session metadata
        ├── messages.jsonl # Chat history
        └── context.json  # Context pack snapshot
```

### Index File

```json
{
  "sessions": [
    {
      "id": "abc-123",
      "project_id": "proj-1",
      "bead_id": "BC-001",
      "status": "closed",
      "created_at": "2026-01-19T10:00:00-06:00",
      "closed_at": "2026-01-19T12:30:00-06:00",
      "title": "Implement login validation"
    }
  ],
  "active_session_id": null
}
```

---

## Session UI Components

### 1. Session Bar (Top of Chat Panel)

```
┌─────────────────────────────────────────────────────────────────┐
│  [●] Session: Implement login validation      [Pause] [End]     │
│  Bead: BC-001 • Agent: hlstc-executor • 45m active              │
└─────────────────────────────────────────────────────────────────┘
```

Shows:
- Session status indicator (● active, ◐ paused, ○ closed)
- Session title or bead title
- Linked bead (clickable)
- Active agent
- Duration

### 2. Session List (Sidebar)

```
┌─────────────────────────────────┐
│  Sessions                [+]   │
├─────────────────────────────────┤
│  ● Implement login validation  │
│    BC-001 • 45m • active       │
├─────────────────────────────────┤
│  ○ Fix auth redirect           │
│    BC-002 • 2h • closed        │
├─────────────────────────────────┤
│  ○ Research caching options    │
│    No bead • 30m • closed      │
└─────────────────────────────────┘
```

### 3. Session History View

Full view of past sessions with:
- Search/filter by date, bead, agent
- Session summary cards
- Click to view full transcript
- Export to markdown option

---

## Session Metrics

### Per-Session

| Metric | Description |
|--------|-------------|
| duration_ms | Total active time (excluding paused) |
| message_count | Number of messages exchanged |
| token_count | Total API tokens used |
| files_touched | Unique files read or written |
| commits | Number of commits made |

### Aggregated (Project Dashboard)

| Metric | Description |
|--------|-------------|
| sessions_per_day | Session activity trend |
| avg_session_duration | Mean time per session |
| sessions_per_bead | How many sessions to complete a bead |
| agent_usage | Which agents are used most |

---

## Session Resumption

When resuming a paused session:

1. **Restore context**: Load messages, context pack, agent
2. **Check bead status**: Verify linked bead is still in expected state
3. **Refresh file state**: Note any files changed outside session
4. **Prompt Claude**: Provide summary of where we left off

Resume prompt template:

```
You are resuming a paused session.

Session Context:
- Bead: {bead_title} ({bead_status})
- Objective: {objective}
- Last message: {last_message_summary}
- Files touched: {files_list}
- Paused at: {paused_at}
- Changes since pause: {external_changes}

Please acknowledge and continue from where we left off.
```

---

## Session Cleanup

### Automatic
- Draft sessions older than 24 hours: auto-close
- Paused sessions older than 7 days: prompt to close or resume

### Manual
- User can delete closed sessions
- Bulk delete by date range
- Export before delete option

---

## Integration with Beads

### Session → Bead

- Session can be linked to at most one bead
- When session closes with bead in_progress:
  - Prompt: "Move bead to in_review?"
  - Auto-populate execution log from session summary

### Bead → Sessions

- Bead detail view shows all related sessions
- Multiple sessions can be linked to same bead (over time)
- Session history provides audit trail for bead work
