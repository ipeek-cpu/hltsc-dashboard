# BC-EP0: Foundation - Repo Hygiene + Beads Sync Reliability

**Priority**: High
**Status**: Ready for Execution
**Created**: 2026-01-19

---

## Objective

Establish a solid foundation with clean git hygiene, reliable beads database synchronization, and validated data integrity. This epic ensures all subsequent work builds on a stable base.

---

## Scope

### In Scope
- Git repository setup and configuration
- Beads database connection and sync reliability
- Data validation on reads and writes
- Data repair utility for corruption
- Error handling and logging infrastructure
- Basic health check endpoints

### Out of Scope
- New UI features
- Claude CLI integration
- Session management
- Project profiles

---

## Beads

### BC-EP0-001: Initialize Repository with Planning Artifacts
**Status**: In Progress
**Objective**: Set up the repository with proper git hygiene and seed all planning documentation.

**Acceptance Criteria**:
- [ ] .gitignore updated with proper exclusions (.codegraph, .beads, DerivedData, etc.)
- [ ] /docs folder created with 7 canonical spec documents
- [ ] /docs/epics folder created with 8 epic definitions
- [ ] Git remote configured (github.com/ipeek-cpu/hlstc-dashboard)
- [ ] All uncommitted changes (67 files) committed with descriptive message
- [ ] Pushed to remote successfully

**Dependencies**: None

---

### BC-EP0-002: Implement Bead Validation Module
**Status**: Ready
**Objective**: Create a validation layer that ensures all bead writes meet data integrity requirements.

**Acceptance Criteria**:
- [ ] `src/lib/bead-validation.ts` module created
- [ ] Timestamp validation: all timestamps must include timezone (ISO8601 with offset)
- [ ] Status validation: only valid statuses accepted (open, ready, in_progress, in_review, closed)
- [ ] State transition validation: only valid transitions allowed per state machine
- [ ] Required field validation: assignee required for in_progress, execution log for in_review
- [ ] Validation returns structured result with errors and warnings
- [ ] Unit tests for all validation rules

**Dependencies**: BC-EP0-001

---

### BC-EP0-003: Implement State Transition Enforcement
**Status**: Ready
**Objective**: Enforce valid state transitions in all bead update operations.

**Acceptance Criteria**:
- [ ] API routes use validation before writing
- [ ] Invalid transitions return 400 with clear error message
- [ ] UI shows validation errors in toast notifications
- [ ] State machine documented in code comments
- [ ] Integration tests verify rejection of invalid transitions

**Dependencies**: BC-EP0-002

---

### BC-EP0-004: Create Data Repair Utility
**Status**: Ready
**Objective**: Provide a utility to fix common data corruption issues in existing beads.

**Acceptance Criteria**:
- [ ] `src/lib/data-repair.ts` module created
- [ ] Fixes timestamps missing timezones (defaults to local timezone)
- [ ] Converts legacy status values ("done" → "closed")
- [ ] Normalizes assignee format (adds @ prefix if missing)
- [ ] Generates repair report with all fixes applied
- [ ] Settings page has "Repair Data" button
- [ ] API endpoint: POST /api/projects/[id]/repair

**Dependencies**: BC-EP0-002

---

### BC-EP0-005: Improve SQLite Connection Reliability
**Status**: Ready
**Objective**: Ensure database connections are stable and handle edge cases gracefully.

**Acceptance Criteria**:
- [ ] WAL mode enabled for concurrent reads
- [ ] Connection timeout handling
- [ ] Graceful reconnection on connection loss
- [ ] Database file existence check before connecting
- [ ] Clear error messages when database unavailable
- [ ] Health check endpoint reports database status

**Dependencies**: BC-EP0-001

---

### BC-EP0-006: Implement Structured Logging
**Status**: Ready
**Objective**: Set up comprehensive logging for debugging and observability.

**Acceptance Criteria**:
- [ ] Log files created in ~/.beads-dashboard/
- [ ] Log rotation: keep last 7 days
- [ ] Log levels: debug, info, warn, error
- [ ] All API errors logged with request context
- [ ] All Claude CLI events logged
- [ ] Settings page shows log file locations
- [ ] Button to open log directory in Finder

**Dependencies**: BC-EP0-001

---

### BC-EP0-007: Add Health Check Endpoint
**Status**: Ready
**Objective**: Provide endpoint for monitoring system health.

**Acceptance Criteria**:
- [ ] GET /api/health returns health status
- [ ] Checks: SQLite connection, SSE active, Claude CLI status
- [ ] Returns structured JSON with component statuses
- [ ] Returns 200 if healthy, 503 if degraded
- [ ] Response time < 100ms

**Dependencies**: BC-EP0-005

---

### BC-EP0-008: SSE Connection Stability
**Status**: Ready
**Objective**: Ensure Server-Sent Events connection is stable and recovers from disconnects.

**Acceptance Criteria**:
- [ ] Heartbeat sent every 15 seconds
- [ ] Client auto-reconnects on disconnect
- [ ] Reconnection uses exponential backoff (max 30s)
- [ ] Server detects and cleans up stale connections
- [ ] Connection count visible in health endpoint
- [ ] No memory leaks from accumulated connections

**Dependencies**: BC-EP0-005

---

### BC-EP0-009: Database Polling Optimization
**Status**: Ready
**Objective**: Optimize database change detection for minimal resource usage.

**Acceptance Criteria**:
- [ ] Use PRAGMA data_version for change detection
- [ ] Poll interval: 1 second (configurable)
- [ ] Only fetch changed data, not full dataset
- [ ] Track last sync timestamp
- [ ] Adaptive polling: slower when idle, faster during activity
- [ ] CPU usage < 1% when idle

**Dependencies**: BC-EP0-005

---

### BC-EP0-010: Error Boundary Implementation
**Status**: Ready
**Objective**: Prevent errors from crashing the entire application.

**Acceptance Criteria**:
- [ ] Svelte error boundary wraps main layout
- [ ] Errors captured and logged
- [ ] User sees friendly error message
- [ ] "Reload" button available
- [ ] Critical errors show "Report Issue" link
- [ ] API errors don't crash frontend

**Dependencies**: BC-EP0-006

---

## Verification

After completing this epic:
1. Repository is clean with proper git setup
2. All data writes are validated before persisting
3. Invalid state transitions are blocked
4. Corrupted data can be repaired with one click
5. Database connections are stable
6. Errors are logged and don't crash the app
7. Health status is visible and accurate
