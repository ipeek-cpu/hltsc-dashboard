# Beads Console: Intent, Memory & Context Architecture

> How agents interact with Project Intent, Memory (scopes, checkpoints, constraints), Context Packs, and Session Prompts.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Project Intent System](#1-project-intent-system)
3. [Memory System (cmem)](#2-memory-system-cmem)
4. [Context Pack System](#3-context-pack-system)
5. [Session & Prompt System](#4-session--prompt-system)
6. [Integration: How Systems Work Together](#integration-how-systems-work-together)
7. [Agent Interaction Patterns](#agent-interaction-patterns)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BEADS CONSOLE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │   PROJECT INTENT    │     │   SESSION PROMPTS   │                        │
│  │   (PROJECT_INTENT.md)│     │   (.beads/prompts/) │                        │
│  │   + Anchor Links    │     │   start/end hooks   │                        │
│  └──────────┬──────────┘     └──────────┬──────────┘                        │
│             │                           │                                    │
│             ▼                           ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    CLAUDE SESSION CONTEXT                         │       │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │       │
│  │  │ Intent Brief   │  │ Memory Brief   │  │ Context Pack   │      │       │
│  │  │ (~2000 tokens) │  │ (~2000 tokens) │  │ (~50K tokens)  │      │       │
│  │  └────────────────┘  └────────────────┘  └────────────────┘      │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│             ▲                           ▲                                    │
│             │                           │                                    │
│  ┌──────────┴──────────┐     ┌──────────┴──────────┐                        │
│  │   MEMORY (cmem)     │     │   CONTEXT PACKS     │                        │
│  │   (.beads/memory.db)│     │   (CodeGraph/Files) │                        │
│  │   Scoped retrieval  │     │   On-demand gen     │                        │
│  └─────────────────────┘     └─────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Project Intent System

### Purpose
Persistent documentation of business/technical assumptions that survive session compaction and provide consistent context across all agents working on a project.

### Storage Architecture

```
project_root/
├── PROJECT_INTENT.md          # Source of truth (git-tracked)
└── .beads/
    └── intent-links.json      # Bead-to-anchor mappings (git-tracked)

dashboard.db                    # Cache for parsed intent (rebuild from file)
└── project_intents table
```

### Data Models

#### PROJECT_INTENT.md Format
```markdown
---
version: 1
created_at: 2026-01-15T10:00:00Z
updated_at: 2026-01-20T14:30:00Z
---

# Project Intent: My App

## Overview {#anchor:overview}
Brief description of project purpose...

## Business Model {#anchor:business-model}

### Target Users {#anchor:business-model.users}
- User type 1
- User type 2

### Revenue {#anchor:business-model.revenue}
Monetization strategy...

## Architecture Constraints {#anchor:constraints}

### Tech Stack {#anchor:constraints.tech-stack}
- Framework X
- Database Y

## Non-Negotiables {#anchor:non-negotiables}
- Security requirement A
- Performance threshold B

## Anti-Goals {#anchor:anti-goals}
- NOT trying to do X
- Out of scope: Y
```

#### Intent Anchor Syntax
```
{#anchor:path.to.section}
```
- Pattern: `[a-z0-9-]+(\.[a-z0-9-]+)*`
- Examples: `overview`, `business-model.users`, `constraints.tech-stack`

#### Intent Link (Bead → Anchor)
```typescript
interface IntentLink {
  beadId: string;           // "task-123"
  anchor: string;           // "constraints.tech-stack"
  relevance: 'primary' | 'related';
  addedAt: string;          // ISO 8601
  addedBy: 'user' | 'agent';
  note?: string;            // "This task implements the tech stack"
}
```

### APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/[id]/intent` | GET | Get parsed intent + anchors |
| `/api/projects/[id]/intent` | PUT | Update intent document |
| `/api/projects/[id]/intent/links` | GET | List bead-anchor links |
| `/api/projects/[id]/intent/links` | POST | Create/update link |
| `/api/projects/[id]/intent/links` | DELETE | Remove link |
| `/api/projects/[id]/intent/reindex` | POST | Force cache rebuild |

### Agent Interaction

**Reading Intent:**
```typescript
// Agent receives intent in session context automatically
// Linked sections marked with <!-- LINKED TO CURRENT BEAD -->
```

**Linking Beads to Intent:**
```typescript
// Via UI: IntentAnchorPicker component
// Via API: POST /api/projects/{id}/intent/links
{
  "beadId": "task-123",
  "anchor": "constraints.tech-stack",
  "relevance": "primary",
  "note": "Implements database layer per tech stack"
}
```

### Injection into Claude

**Token Budget:** ~2000 tokens

**Format:**
```markdown
<!-- Intent v1 | Updated: 2026-01-20T14:30:00Z -->

## Overview
Brief description...

## Non-Negotiables <!-- LINKED TO CURRENT BEAD -->
- Security requirement A
- Performance threshold B

<!-- Truncated: 3 sections omitted (token budget) -->
```

---

## 2. Memory System (cmem)

### Purpose
Append-only memory store for decisions, checkpoints, constraints, and handoff notes that survive session compaction and enable knowledge transfer between agents.

### Storage Architecture

```
project_root/
└── .beads/
    └── memory.db              # SQLite with WAL mode
        └── memory_entries     # Single table, append-only
```

### Memory Kinds

| Kind | Description | Default Expiry | Use Case |
|------|-------------|----------------|----------|
| `constraint` | Hard rules that always apply | Never | "Never use SQLite in production" |
| `decision` | Architectural choices with rationale | 90 days | "Chose Redis for caching because..." |
| `checkpoint` | Session state snapshots | 30 days | Auto-captured on session close |
| `next_step` | Handoff notes for next agent | 7 days | "Continue with login form validation" |
| `action_report` | Quick action execution results | 14 days | Build output, test results |
| `ci_note` | CI/CD observations | 30 days | "Build failing on Node 18" |

### Scoping Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETRIEVAL PRIORITY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. BEAD-SCOPED (highest priority)                              │
│     WHERE bead_id = 'task-123'                                  │
│     Most specific, directly relevant                            │
│                                                                  │
│  2. EPIC-SCOPED (fallback)                                      │
│     WHERE epic_id = 'epic-456' AND bead_id IS NULL             │
│     Relevant to parent epic                                     │
│                                                                  │
│  3. PROJECT CONSTRAINTS (always included)                       │
│     WHERE bead_id IS NULL AND epic_id IS NULL                  │
│           AND kind = 'constraint'                               │
│     Global rules that apply everywhere                          │
│                                                                  │
│  4. ACTIVE CONSTRAINTS (cross-scope)                            │
│     WHERE kind = 'constraint' AND expires_at > NOW()           │
│     All non-expired constraints from any scope                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model

```typescript
interface MemoryEntry {
  id: string;                    // UUID v4
  projectId: string;             // Required
  beadId?: string;               // Preferred scope
  epicId?: string;               // Fallback scope
  sessionId?: string;            // Creating session
  chatId?: string;               // Chat within session
  agentName?: string;            // "backend-architect"

  kind: MemoryKind;              // constraint|decision|checkpoint|...
  title: string;                 // Brief title
  content: string;               // Markdown content
  data?: Record<string, any>;    // Structured metadata
  intentAnchors?: string[];      // Links to intent anchors

  relevanceScore: number;        // 0.0-1.0 (default 1.0)
  expiresAt?: string;            // ISO 8601 (null = never)
  deletedAt?: string;            // Soft delete timestamp
  createdAt: string;             // ISO 8601
}
```

### Relevance Ranking Algorithm

```typescript
function calculateRelevance(entry: MemoryEntry, context: QueryContext): number {
  // Base relevance (40%)
  const baseScore = entry.relevanceScore * 0.4;

  // Recency boost (30%) - decays over 30 days
  const ageInDays = daysSince(entry.createdAt);
  const recencyBoost = Math.max(0, 1 - (ageInDays / 30)) * 0.3;

  // Scope proximity (20%)
  let scopeScore = 0.3;  // project-level default
  if (entry.beadId === context.beadId) scopeScore = 1.0;
  else if (entry.epicId === context.epicId) scopeScore = 0.7;
  const scopeBoost = scopeScore * 0.2;

  // Kind boost (10%)
  const kindBoosts = { constraint: 0.3, decision: 0.2, checkpoint: 0.1 };
  const kindBoost = (kindBoosts[entry.kind] || 0) * 0.1;

  return baseScore + recencyBoost + scopeBoost + kindBoost;
}
```

### APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/[id]/memory` | GET | List memories (filterable) |
| `/api/projects/[id]/memory` | POST | Create memory entry |
| `/api/projects/[id]/memory/[memId]` | GET | Get single entry |
| `/api/projects/[id]/memory/[memId]` | DELETE | Soft-delete entry |
| `/api/projects/[id]/memory/scoped` | GET | Get hierarchical scoped memories |

### MCP Tools for Agents

```typescript
// Available to Claude via MCP server

// Read memories for current context
read_memory({
  projectId: string,
  beadId?: string,       // Preferred
  epicId?: string,       // Fallback
  kinds?: MemoryKind[],  // Filter by type
  limit?: number         // Default 20, max 100
})

// Write a new memory
write_memory({
  projectId: string,
  beadId?: string,
  kind: MemoryKind,
  title: string,
  content: string,
  intentAnchors?: string[]  // Link to intent sections
})

// Search memories
search_memory({
  projectId: string,
  query: string,         // Full-text search
  beadId?: string,
  kinds?: MemoryKind[],
  limit?: number
})
```

### Agent Interaction Examples

**Writing a Decision:**
```typescript
await write_memory({
  projectId: "proj-123",
  beadId: "task-456",
  kind: "decision",
  title: "Use Postgres over SQLite",
  content: `
## Decision
Chose Postgres for the user database.

## Rationale
- Need concurrent write support
- SQLite locks on writes
- Postgres better for production scale

## Alternatives Considered
- SQLite (rejected: write locks)
- MySQL (rejected: team expertise)
  `,
  intentAnchors: ["constraints.tech-stack", "non-negotiables"]
});
```

**Reading Scoped Context:**
```typescript
const memories = await read_memory({
  projectId: "proj-123",
  beadId: "task-456",
  kinds: ["constraint", "decision"],
  limit: 10
});

// Returns memories from:
// 1. task-456 specifically
// 2. Parent epic (if task has one)
// 3. Project-wide constraints
```

### Memory Brief Generation

**Trigger:** Automatic on session creation (bead-scoped only)

**Token Budget:** ~2000 tokens

**Output Format:**
```markdown
## Memory Context

### Constraint [project]
**constraint** - 2026-01-15
Use Postgres for all data persistence (not SQLite)

### Decision [epic:epic-456]
**decision** - 2026-01-18
Implemented async task queue with Redis for background jobs.
Rationale: Need reliable job persistence and retries.

### Checkpoint [bead:task-123]
**checkpoint** - 2026-01-19
Last session ended after implementing the login form UI.
Next: Add validation and error handling.
```

---

## 3. Context Pack System

### Purpose
Structured bundles of code context generated on-demand for injection into Claude sessions. Provides relevant code snippets, symbols, and dependencies.

### Generation Methods

| Method | Quality | Speed | Availability |
|--------|---------|-------|--------------|
| CodeGraph | High | Slow | Requires CodeGraph MCP |
| Heuristic | Medium | Fast | Always available |
| Manual | Variable | N/A | User-selected files |

### Data Model

```typescript
interface ContextPack {
  id: string;
  name: string;
  projectId: string;
  generationMethod: 'codegraph' | 'heuristic' | 'manual';

  files: ContextFile[];           // Code files/excerpts
  symbols: ContextSymbol[];       // Functions, classes, types
  dependencies: ContextDependency[]; // Symbol relationships

  totalTokens: number;
  createdAt: string;

  metadata: {
    generationTimeMs: number;
    codegraphAvailable: boolean;
    codegraphQueries: string[];
    warnings: string[];
  };
}

interface ContextFile {
  path: string;                   // Relative path
  content: string;                // Full or excerpt
  language: string;
  relevance: number;              // 0.0-1.0
  excerpt?: {
    startLine: number;
    endLine: number;
    totalLines: number;
  };
  reason?: string;                // Why included
  tokenEstimate: number;
}

interface ContextSymbol {
  name: string;
  kind: 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'route' | 'component';
  filePath: string;
  line: number;
  signature?: string;
  code?: string;
  documentation?: string;
  relevance: number;
  tokenEstimate: number;
}
```

### Token Budgeting

```
Total Budget: 50,000 tokens (configurable)

Allocation:
├── 70% Symbols (35,000 tokens)
│   └── Sorted by relevance, highest first
└── 30% Files (15,000 tokens)
    └── Sorted by relevance, highest first

Truncation: Items exceeding budget are omitted
Warning: Logged in metadata.warnings
```

### Profile-Based Defaults

Each project profile defines default context patterns:

```typescript
// iOS Profile
contextDefaults: {
  includePatterns: ['**/*.swift', '**/Package.swift', '**/*.xib'],
  excludePatterns: ['.build/**', 'DerivedData/**'],
  codeGraphFocus: ['class', 'interface', 'method', 'function']
}

// Web Profile
contextDefaults: {
  includePatterns: ['**/*.svelte', '**/*.ts', 'src/routes/**/*'],
  excludePatterns: ['node_modules/**', '.svelte-kit/**'],
  codeGraphFocus: ['component', 'function', 'route', 'interface']
}
```

### Injection Format

```markdown
## Code Context

### Symbol: UserService (class)
**File:** src/services/user.ts:15
**Relevance:** 0.95

\`\`\`typescript
export class UserService {
  async findById(id: string): Promise<User | null> {
    return this.db.users.findUnique({ where: { id } });
  }

  async create(data: CreateUserInput): Promise<User> {
    return this.db.users.create({ data });
  }
}
\`\`\`

### File: src/routes/api/users/+server.ts
**Relevance:** 0.85

\`\`\`typescript
import { UserService } from '$lib/services/user';

export async function GET({ params }) {
  const user = await userService.findById(params.id);
  return json(user);
}
\`\`\`
```

---

## 4. Session & Prompt System

### Purpose
Manage Claude Code chat sessions with automatic memory brief generation, checkpoint capture on close, and skill-level-appropriate communication.

### Storage Architecture

```
.beads/
└── sessions/
    └── {sessionId}/
        ├── meta.json          # Session metadata
        └── messages.jsonl     # Message history (append-only)
```

### Session State Machine

```
        ┌─────────────────────────────────────────┐
        │                                         │
        ▼                                         │
    ┌────────┐      start       ┌────────┐       │
    │ draft  │─────────────────▶│ active │       │
    └────────┘                  └────────┘       │
        │                           │  ▲         │
        │                     pause │  │ resume  │
        │                           ▼  │         │
        │                       ┌────────┐       │
        │       close           │ paused │       │
        │◀──────────────────────┴────────┘       │
        │                           │            │
        ▼                           │ close      │
    ┌────────┐◀─────────────────────┘            │
    │ closed │                                   │
    └────────┘───────────────────────────────────┘
                    (terminal)
```

### Session Model

```typescript
interface Session {
  id: string;
  projectId: string;
  beadId?: string;               // Scoped to task
  agentId?: string;
  agentName?: string;

  status: 'draft' | 'active' | 'paused' | 'closed';
  title?: string;
  summary?: string;              // Final summary on close

  // Auto-generated for bead-scoped sessions
  memoryBrief?: string;
  memoryBriefTokens?: number;

  tags?: string[];

  createdAt: string;
  startedAt?: string;
  pausedAt?: string;
  closedAt?: string;
  lastActivityAt: string;

  metrics: {
    messageCount: number;
    durationMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    toolCallCount: number;
  };
}
```

### Checkpoint Capture

**Trigger:** Session close (if bead-scoped + has messages)

**Process:**
1. Load last 5 messages from session
2. Build checkpoint summary
3. Create memory entry with `kind: 'checkpoint'`
4. Set expiry to 30 days

**Checkpoint Format:**
```markdown
## Session Checkpoint

**Trigger:** session_end
**Session:** sess-123
**Bead:** task-456
**Duration:** 1800s (30 min)
**Messages:** 24

### Summary
Implemented user authentication flow including:
- Login form component
- JWT token generation
- Session management

### Last Exchange

**User:** Can you add remember-me functionality?

**Assistant:** I'll add a persistent token mechanism...

### Next Steps
- Add token refresh logic
- Implement logout across devices
```

### Session Prompts

Located in `.beads/prompts/` directory:

```
.beads/prompts/
├── session-start.md       # Injected at session start
└── session-end.md         # Injected before session close
```

**Session Start Prompt Example:**
```markdown
## Session Context

You are continuing work on the {{project_name}} project.

### Current Task
{{bead_title}}
{{bead_description}}

### Acceptance Criteria
{{bead_acceptance_criteria}}

### Relevant Intent
{{intent_brief}}

### Memory Context
{{memory_brief}}
```

### Skill Levels

| Level | Communication Style |
|-------|---------------------|
| `non-coder` | Plain language, no jargon, explain everything |
| `junior` | Explain the why, introduce best practices gradually |
| `senior` | Concise, focus on trade-offs and alternatives |
| `principal` | Peer discussion, system-wide implications |

### Project Instructions Generation

```typescript
function generateProjectInstructions(
  skillLevel?: SkillLevel,
  bdPrimeContext?: string,      // From `bd prime` CLI
  intentContext?: IntentInjection
): string {
  return [
    generateAgentFormatGuide(),
    bdPrimeContext && formatBdPrime(bdPrimeContext),
    intentContext && formatIntent(intentContext),
    generateBeadsCliInstructions(),
    generateCommunicationStyle(skillLevel),
    generatePlanningQuestions()
  ].filter(Boolean).join('\n\n');
}
```

### APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/[id]/sessions` | GET | List sessions |
| `/api/projects/[id]/sessions` | POST | Create session |
| `/api/projects/[id]/sessions/[id]` | GET | Get session details |
| `/api/projects/[id]/sessions/[id]` | PATCH | Update session |
| `/api/projects/[id]/sessions/[id]` | DELETE | Close session |
| `/api/projects/[id]/chat/[sessionId]` | POST | Send message |
| `/api/projects/[id]/chat/[sessionId]/stream` | GET | SSE response stream |

---

## Integration: How Systems Work Together

### Session Initialization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION CREATION                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User creates session scoped to task-123                     │
│     └─▶ createSession({ beadId: 'task-123' })                   │
│                                                                  │
│  2. Look up parent epic                                         │
│     └─▶ SELECT parent_id FROM dependencies                      │
│         WHERE issue_id = 'task-123' AND type = 'parent-child'   │
│                                                                  │
│  3. Generate memory brief                                       │
│     └─▶ getScopedMemories(projectId, 'task-123', 'epic-456')   │
│         └─▶ Bead memories (task-123)                            │
│         └─▶ Epic memories (epic-456, no bead)                   │
│         └─▶ Project constraints                                 │
│                                                                  │
│  4. Rank and truncate to token budget                          │
│     └─▶ rankMemories() by relevance                            │
│     └─▶ buildMemoryBrief(2000 tokens)                          │
│                                                                  │
│  5. Load intent context                                         │
│     └─▶ getLinkedAnchors('task-123')                           │
│     └─▶ buildIntentContext(linkedAnchors)                      │
│                                                                  │
│  6. Store session with briefs                                   │
│     └─▶ session.memoryBrief = brief                            │
│     └─▶ session.intentContext = intentBrief                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Claude Message Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    MESSAGE PROCESSING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User sends message                                          │
│     └─▶ "Implement the login form"                              │
│                                                                  │
│  2. Build system context                                        │
│     ├─▶ Project instructions (skill level, bd prime)           │
│     ├─▶ Intent brief (linked sections highlighted)             │
│     ├─▶ Memory brief (scoped to current task)                  │
│     └─▶ Context pack (if code context needed)                  │
│                                                                  │
│  3. Assemble prompt                                             │
│     ┌────────────────────────────────────────────────┐          │
│     │ <system>                                        │          │
│     │   <project-instructions>                        │          │
│     │     {agent format, beads CLI, communication}   │          │
│     │   </project-instructions>                       │          │
│     │                                                 │          │
│     │   <intent-context>                              │          │
│     │     {relevant intent sections}                  │          │
│     │   </intent-context>                             │          │
│     │                                                 │          │
│     │   <memory-context>                              │          │
│     │     {scoped memories + constraints}             │          │
│     │   </memory-context>                             │          │
│     │                                                 │          │
│     │   <code-context>                                │          │
│     │     {context pack if available}                 │          │
│     │   </code-context>                               │          │
│     │ </system>                                       │          │
│     │                                                 │          │
│     │ User: Implement the login form                  │          │
│     └────────────────────────────────────────────────┘          │
│                                                                  │
│  4. Call Claude API                                             │
│                                                                  │
│  5. Stream response via SSE                                     │
│                                                                  │
│  6. Log message to session (messages.jsonl)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Session Close Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION CLOSE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User closes session                                         │
│     └─▶ closeSession(sessionId)                                 │
│                                                                  │
│  2. Check if checkpoint needed                                  │
│     └─▶ if (session.beadId && session.messageCount > 0)        │
│                                                                  │
│  3. Build checkpoint                                            │
│     ├─▶ Load last 5 messages                                   │
│     ├─▶ Build summary                                          │
│     └─▶ Extract next steps                                     │
│                                                                  │
│  4. Create memory entry                                         │
│     └─▶ createMemoryEntry({                                    │
│           kind: 'checkpoint',                                   │
│           beadId: session.beadId,                               │
│           title: 'Session Checkpoint',                          │
│           content: checkpointMarkdown,                          │
│           expiresAt: now + 30 days                              │
│         })                                                      │
│                                                                  │
│  5. Update session status                                       │
│     └─▶ session.status = 'closed'                              │
│     └─▶ session.closedAt = now                                 │
│                                                                  │
│  6. Checkpoint available for next session                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Interaction Patterns

### Pattern 1: Starting Work on a Task

```typescript
// Agent receives context automatically when session starts

// Available in system prompt:
// - Project intent (non-negotiables, constraints, anti-goals)
// - Memory brief (relevant decisions, previous checkpoints)
// - Task details (from bead)

// Agent can read more context:
const memories = await mcp.read_memory({
  projectId: currentProject,
  beadId: currentTask,
  kinds: ['decision', 'constraint']
});

// Agent can link task to intent:
await api.post(`/projects/${projectId}/intent/links`, {
  beadId: currentTask,
  anchor: 'constraints.tech-stack',
  relevance: 'primary',
  note: 'This task implements the auth layer'
});
```

### Pattern 2: Making an Architectural Decision

```typescript
// Agent discovers need for decision during work
// Writes decision to memory for future reference

await mcp.write_memory({
  projectId: currentProject,
  beadId: currentTask,
  kind: 'decision',
  title: 'Use JWT for API authentication',
  content: `
## Decision
Use JWT tokens for API authentication instead of sessions.

## Context
- Task: Implement user authentication
- Intent anchor: constraints.tech-stack

## Rationale
1. Stateless - no server-side session storage
2. Scalable - works across multiple API servers
3. Mobile-friendly - easy to store and send

## Alternatives Rejected
- Session cookies: Requires sticky sessions or shared store
- API keys: Less secure, no expiration built-in

## Implementation Notes
- Token expiry: 24 hours
- Refresh token: 7 days
- Storage: httpOnly cookies for web, secure storage for mobile
`,
  intentAnchors: ['constraints.tech-stack', 'non-negotiables']
});
```

### Pattern 3: Handoff to Next Agent

```typescript
// Current agent finishing work, leaving notes for next agent

await mcp.write_memory({
  projectId: currentProject,
  beadId: currentTask,
  kind: 'next_step',
  title: 'Continue with form validation',
  content: `
## Completed
- Login form UI component
- JWT token generation
- Basic error display

## Next Steps
1. Add client-side validation (email format, password strength)
2. Add rate limiting on API
3. Implement "forgot password" flow

## Known Issues
- Form doesn't show loading state during submission
- Error messages are generic, need specific codes from API

## Files Changed
- src/components/LoginForm.svelte
- src/routes/api/auth/login/+server.ts
- src/lib/auth.ts
`,
  expiresAt: addDays(7).toISOString()  // 7-day expiry for handoff notes
});
```

### Pattern 4: Recording a Constraint

```typescript
// Agent discovers or is told about a constraint
// Constraints never expire and apply globally

await mcp.write_memory({
  projectId: currentProject,
  // Note: No beadId - project-wide constraint
  kind: 'constraint',
  title: 'No direct database access from components',
  content: `
## Constraint
Components must never import database modules directly.
All data access must go through service layer.

## Rationale
- Separation of concerns
- Testability (mock services, not DB)
- Security (validate at service layer)

## Enforcement
- ESLint rule: no-restricted-imports
- PR review checklist item

## Intent Anchor
See: constraints.architecture
`,
  intentAnchors: ['constraints.architecture']
});
```

### Pattern 5: Context Pack for Code Understanding

```typescript
// Agent needs to understand code before making changes
// Context pack generated with relevant symbols

const contextPack = await generateContextPack({
  projectId: currentProject,
  task: 'Implement user profile page',
  method: 'codegraph',  // or 'heuristic' if CodeGraph unavailable
  tokenBudget: 30000
});

// Context pack includes:
// - UserService class and methods
// - User type/interface
// - Related API routes
// - Existing profile components

// Agent receives this in system prompt as <code-context>
```

---

## Key Design Principles

1. **Append-Only Memory**: No destructive updates, full audit trail
2. **Soft Deletes**: Data retained 30 days before hard purge
3. **Hierarchical Scoping**: Bead → Epic → Project (most specific wins)
4. **Token Budgeting**: All injections respect context window limits
5. **Git-Tracked State**: Intent, links, sessions versioned with code
6. **Hash-Based Invalidation**: Intent cache rebuilt when file changes
7. **Automatic Checkpoints**: Session knowledge preserved for continuity
8. **Intent Anchors**: Fine-grained linking between code and business logic
9. **Skill-Level Adaptation**: Communication style matches user expertise
10. **MCP Integration**: Agents can read/write memory directly

---

## File Reference

| System | Files |
|--------|-------|
| Intent | `src/lib/intent/{types,parser,cache,injection,links}.ts` |
| Memory | `src/lib/memory/{types,db,retrieval,actions,mcp-server}.ts` |
| Context | `src/lib/context-pack/{types,generator,codegraph,heuristic}.ts` |
| Session | `src/lib/session-persistence.ts`, `src/lib/beads-instructions.ts` |
| APIs | `src/routes/api/projects/[id]/{intent,memory,sessions,chat}/*` |
| UI | `src/components/{IntentViewer,MemoryPanel,ContextPacksPanel}.svelte` |
