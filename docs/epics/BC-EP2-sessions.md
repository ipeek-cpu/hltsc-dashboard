# BC-EP2: Session System - First-Class Objects + High-Visibility UI

**Priority**: Critical
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Make sessions first-class objects that capture the full context of work. Sessions provide continuity across interruptions, enable review of past work, and create an audit trail for agent activities.

---

## Scope

### In Scope
- Session data model and persistence
- Session lifecycle (draft → active → paused → closed)
- Session creation UI (from bead, ad-hoc)
- Session bar showing current session
- Session list in sidebar
- Session detail view and history
- Session-bead linking
- Session metrics collection

### Out of Scope
- Claude CLI integration (see EP3)
- Context pack generation (see EP4)
- Activity event streaming (see EP5)

---

## Beads

### BC-EP2-001: Define Session Data Model
**Status**: Ready
**Objective**: Define the TypeScript interfaces and persistence format for sessions.

**Acceptance Criteria**:
- [ ] `src/lib/session-context-types.ts` defines Session interface
- [ ] Session states: draft, active, paused, closed
- [ ] Session fields: id, project_id, bead_id?, agent_id?, status, timestamps
- [ ] Message interface for chat history
- [ ] ToolCall interface for tool usage tracking
- [ ] Storage format: .beads/sessions/{id}/meta.json + messages.jsonl
- [ ] Index file: .beads/sessions/index.json

**Dependencies**: BC-EP0-001

---

### BC-EP2-002: Implement Session Storage Layer
**Status**: Ready
**Objective**: Create functions to read and write session data.

**Acceptance Criteria**:
- [ ] `src/lib/session-context.ts` with CRUD operations
- [ ] createSession(projectId, options): Session
- [ ] getSession(sessionId): Session
- [ ] updateSession(sessionId, updates): Session
- [ ] listSessions(projectId, filters): Session[]
- [ ] deleteSession(sessionId): void
- [ ] Messages stored as JSONL for streaming writes
- [ ] Atomic writes to prevent corruption

**Dependencies**: BC-EP2-001

---

### BC-EP2-003: Session State Machine
**Status**: Ready
**Objective**: Implement session state transitions with validation.

**Acceptance Criteria**:
- [ ] draft → active: startSession()
- [ ] active → paused: pauseSession()
- [ ] active → closed: endSession()
- [ ] paused → active: resumeSession()
- [ ] paused → closed: abandonSession()
- [ ] Invalid transitions throw errors
- [ ] State changes update timestamps appropriately
- [ ] Unit tests for all transitions

**Dependencies**: BC-EP2-002

---

### BC-EP2-004: Create Session from Bead
**Status**: Ready
**Objective**: Enable starting a session directly from a bead card.

**Acceptance Criteria**:
- [ ] "Start Session" button on ready bead cards
- [ ] Opens session creation modal
- [ ] Pre-populates bead context (id, title, acceptance criteria)
- [ ] Agent selection dropdown
- [ ] Context pack options (if available)
- [ ] Creates session and claims bead in one operation
- [ ] Opens chat panel with new session active

**Dependencies**: BC-EP2-003, BC-EP1-001

---

### BC-EP2-005: Ad-hoc Session Creation
**Status**: Ready
**Objective**: Allow creating sessions not linked to a specific bead.

**Acceptance Criteria**:
- [ ] "New Session" button in sidebar
- [ ] Modal with: title (optional), objective (optional), agent selector
- [ ] Option to link to existing bead
- [ ] Creates session in active state
- [ ] Opens chat panel
- [ ] Session appears in sidebar list

**Dependencies**: BC-EP2-003

---

### BC-EP2-006: Session Bar Component
**Status**: Ready
**Objective**: Show current session status at top of chat panel.

**Acceptance Criteria**:
- [ ] `src/components/SessionMetricsBar.svelte`
- [ ] Shows: status indicator, session title, linked bead, agent, duration
- [ ] Status colors: green (active), yellow (paused), gray (closed)
- [ ] Pause button (when active)
- [ ] Resume button (when paused)
- [ ] End Session button
- [ ] Clicking bead name opens bead detail

**Dependencies**: BC-EP2-004

---

### BC-EP2-007: Session List in Sidebar
**Status**: Ready
**Objective**: Display all sessions for the current project in the sidebar.

**Acceptance Criteria**:
- [ ] Sessions section in sidebar
- [ ] Shows: status indicator, title/bead, duration, time ago
- [ ] Active session highlighted
- [ ] Click to switch session
- [ ] Right-click menu: Resume, Close, Delete
- [ ] Filter: all, active, closed
- [ ] Sort: recent first

**Dependencies**: BC-EP2-003

---

### BC-EP2-008: Session History View
**Status**: Ready
**Objective**: Full view of past sessions with search and filtering.

**Acceptance Criteria**:
- [ ] `src/components/SessionHistoryView.svelte`
- [ ] List of all closed sessions
- [ ] Search by title, bead, agent
- [ ] Filter by date range
- [ ] Session cards show: title, bead, agent, duration, message count
- [ ] Click to view full transcript
- [ ] Export to markdown button

**Dependencies**: BC-EP2-007

---

### BC-EP2-009: Session Transcript View
**Status**: Ready
**Objective**: Display full chat history for a session.

**Acceptance Criteria**:
- [ ] Read-only view of closed session
- [ ] Messages displayed in chat bubble format
- [ ] Tool calls shown with collapsible details
- [ ] Timestamps on each message
- [ ] Syntax highlighting for code
- [ ] Copy message button
- [ ] Jump to message by timestamp

**Dependencies**: BC-EP2-008

---

### BC-EP2-010: Session-Bead Integration
**Status**: Ready
**Objective**: Sync session state with bead state.

**Acceptance Criteria**:
- [ ] When session ends with bead in_progress: prompt to move to in_review
- [ ] Auto-populate execution log from session summary
- [ ] Bead detail shows linked sessions
- [ ] Multiple sessions can link to same bead (over time)
- [ ] Session history provides audit trail for bead work

**Dependencies**: BC-EP2-003, BC-EP1-002

---

### BC-EP2-011: Session Metrics Collection
**Status**: Ready
**Objective**: Track metrics for each session.

**Acceptance Criteria**:
- [ ] `src/lib/session-metrics.ts` module
- [ ] Tracks: duration, message count, token count, files touched, commands run
- [ ] Metrics displayed in session bar
- [ ] Metrics stored in session meta.json
- [ ] Aggregation functions for project-level stats

**Dependencies**: BC-EP2-006

---

### BC-EP2-012: Session Resumption
**Status**: Ready
**Objective**: Allow resuming paused sessions with context restoration.

**Acceptance Criteria**:
- [ ] Resume loads session context: messages, bead, agent
- [ ] Check bead status hasn't changed unexpectedly
- [ ] Detect files changed outside session
- [ ] Generate resume prompt for Claude
- [ ] Prompt includes: where we left off, external changes
- [ ] Claude acknowledges context restoration

**Dependencies**: BC-EP2-003

---

## Verification

After completing this epic:
1. Sessions persist across app restarts
2. Session lifecycle (draft → active → paused → closed) works correctly
3. Sessions can be created from beads or ad-hoc
4. Active session is prominently displayed
5. Past sessions are searchable and viewable
6. Session metrics are tracked and displayed
7. Sessions integrate properly with bead workflow
