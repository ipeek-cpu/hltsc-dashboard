# BC-EP5: Observability - Local Traces, Metrics, Timeline

**Priority**: Medium
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Provide comprehensive visibility into agent activity, session performance, and system health. All observability data is stored locally - no external telemetry.

---

## Scope

### In Scope
- Activity event logging
- Real-time activity feed
- Session timeline view
- Aggregated metrics dashboard
- System health monitoring
- Alert system for anomalies
- Data export

### Out of Scope
- External telemetry services
- Cloud storage of metrics
- Real-time alerting to external systems

---

## Beads

### BC-EP5-001: Define Activity Event Model
**Status**: Ready
**Objective**: Define the structure for activity events.

**Acceptance Criteria**:
- [ ] `src/lib/agent-activity-types.ts` created
- [ ] ActivityEvent interface: id, timestamp, session_id?, bead_id?, agent_id?, type, details
- [ ] Event types: session_*, bead_*, file_*, command_*, git_*, message_*, tool_*, error
- [ ] Details vary by type (file_path, command, exit_code, etc.)
- [ ] Efficient storage format (JSONL)

**Dependencies**: BC-EP0-001

---

### BC-EP5-002: Activity Event Logging
**Status**: Ready
**Objective**: Capture and persist activity events.

**Acceptance Criteria**:
- [ ] `src/lib/agent-activity-store.ts` module
- [ ] logActivity(event): void
- [ ] Events written to .beads/activity/YYYY-MM-DD.jsonl
- [ ] Daily rotation
- [ ] Async write (non-blocking)
- [ ] Batch writes for performance
- [ ] 30-day retention with auto-cleanup

**Dependencies**: BC-EP5-001

---

### BC-EP5-003: Instrument Claude CLI
**Status**: Ready
**Objective**: Capture activity events from Claude CLI interactions.

**Acceptance Criteria**:
- [ ] Log message_sent when user sends message
- [ ] Log message_received when Claude responds
- [ ] Log tool_call for each tool invocation
- [ ] Log tool_result when tool completes
- [ ] Capture: tokens, latency, tool details
- [ ] Log errors separately

**Dependencies**: BC-EP5-002, BC-EP3-007

---

### BC-EP5-004: Activity Feed Panel
**Status**: Ready
**Objective**: Real-time scrolling list of activity events.

**Acceptance Criteria**:
- [ ] `src/components/ActivityFeedPanel.svelte`
- [ ] Real-time updates (SSE or polling)
- [ ] Event cards with icon, time, summary
- [ ] Click to expand full details
- [ ] Filter by: event type, session, bead
- [ ] Search within events
- [ ] Pause/resume feed

**Dependencies**: BC-EP5-002

---

### BC-EP5-005: Event Detail View
**Status**: Ready
**Objective**: Display full event details in expandable card.

**Acceptance Criteria**:
- [ ] Expandable card in activity feed
- [ ] Shows all event fields
- [ ] Code/command output with syntax highlighting
- [ ] Timestamps in local time
- [ ] Copy event as JSON
- [ ] Link to related session/bead

**Dependencies**: BC-EP5-004

---

### BC-EP5-006: Session Timeline View
**Status**: Ready
**Objective**: Visual timeline of activity within a session.

**Acceptance Criteria**:
- [ ] Horizontal timeline with time axis
- [ ] Events as markers on timeline
- [ ] Active periods highlighted
- [ ] Idle periods shown
- [ ] Hover for event preview
- [ ] Click to jump to event
- [ ] Zoom in/out

**Dependencies**: BC-EP5-004

---

### BC-EP5-007: Session Metrics Aggregation
**Status**: Ready
**Objective**: Calculate and display session-level metrics.

**Acceptance Criteria**:
- [ ] Calculate from activity events
- [ ] Metrics: duration, messages, tokens, files, commands, commits
- [ ] Average response latency
- [ ] Error count
- [ ] Store in session meta.json
- [ ] Display in session bar and detail view

**Dependencies**: BC-EP5-002, BC-EP2-011

---

### BC-EP5-008: Project Metrics Dashboard
**Status**: Ready
**Objective**: Aggregated metrics view for entire project.

**Acceptance Criteria**:
- [ ] Metrics panel in project view
- [ ] Time range selector: today, 7d, 30d
- [ ] Show: sessions, beads completed, tokens, time spent
- [ ] Trend charts (sessions/day, tokens/day)
- [ ] Agent usage breakdown
- [ ] Compare to previous period

**Dependencies**: BC-EP5-007

---

### BC-EP5-009: System Health Monitor
**Status**: Ready
**Objective**: Monitor and display system component health.

**Acceptance Criteria**:
- [ ] Health panel in settings
- [ ] Components: Dashboard, SQLite, SSE, Claude CLI, Auth
- [ ] Status: healthy, degraded, error
- [ ] Last check timestamp
- [ ] Refresh button
- [ ] Alert when health degrades

**Dependencies**: BC-EP0-007

---

### BC-EP5-010: Alert System
**Status**: Ready
**Objective**: Generate alerts for anomalies and issues.

**Acceptance Criteria**:
- [ ] Alert types: stale_bead, session_idle, command_failed, auth_expiring
- [ ] Alert storage in memory (not persisted)
- [ ] Alert badge in sidebar
- [ ] Alert panel with list
- [ ] Dismiss alert
- [ ] Alert sound option (off by default)

**Dependencies**: BC-EP5-002

---

### BC-EP5-011: Data Export
**Status**: Ready
**Objective**: Export observability data.

**Acceptance Criteria**:
- [ ] Export modal in settings
- [ ] Select: activity events, metrics, sessions
- [ ] Date range filter
- [ ] Formats: JSON, Markdown, CSV
- [ ] File saved to Downloads
- [ ] Progress indicator for large exports

**Dependencies**: BC-EP5-002

---

### BC-EP5-012: Retention Management
**Status**: Ready
**Objective**: Manage storage of observability data.

**Acceptance Criteria**:
- [ ] Storage usage display in settings
- [ ] Retention settings: 7d, 30d, 90d, forever
- [ ] Auto-cleanup of old data
- [ ] Manual cleanup button
- [ ] Confirm before delete
- [ ] Exclude certain sessions from cleanup

**Dependencies**: BC-EP5-002

---

## Verification

After completing this epic:
1. All Claude CLI activity is logged
2. Activity feed shows real-time events
3. Session timelines provide visual overview
4. Project-level metrics are aggregated
5. System health is monitored and displayed
6. Alerts appear for anomalies
7. Data can be exported and retention managed
