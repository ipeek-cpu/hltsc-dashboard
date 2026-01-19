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
**Status**: Closed
**Objective**: Set up the repository with proper git hygiene and seed all planning documentation.

**Acceptance Criteria**:
- [x] .gitignore updated with proper exclusions (.codegraph, .beads, DerivedData, etc.)
- [x] /docs folder created with 7 canonical spec documents
- [x] /docs/epics folder created with 8 epic definitions
- [x] Git remote configured (github.com/ipeek-cpu/hlstc-dashboard)
- [x] All uncommitted changes (67 files) committed with descriptive message
- [x] Pushed to remote successfully

**Completion Evidence**: Commit `b63a8f7` contains all planning artifacts. Branch synced with origin/main.

**Dependencies**: None

---

### BC-EP0-002: Implement Bead Validation Module
**Status**: Closed
**Objective**: Create a validation layer that ensures all bead writes meet data integrity requirements.

**Acceptance Criteria**:
- [x] `src/lib/bead-validation.ts` module created
- [x] Timestamp validation: all timestamps must include timezone (ISO8601 with offset)
- [x] Status validation: only valid statuses accepted (open, ready, in_progress, in_review, closed)
- [x] State transition validation: only valid transitions allowed per state machine
- [x] Required field validation: assignee required for in_progress, execution log for in_review
- [x] Validation returns structured result with errors and warnings
- [x] Unit tests for all validation rules

**Completion Evidence**:
- `src/lib/bead-validation.ts` (310 lines) - timestamp, status, assignee, lifecycle validation
- `src/lib/bead-lifecycle.ts` (157 lines) - state machine and transition validation
- `src/lib/__tests__/bead-validation.test.ts` - 49 unit tests
- `src/lib/__tests__/bead-lifecycle.test.ts` - 54 unit tests
- All 103 tests passing

**Dependencies**: BC-EP0-001

---

### BC-EP0-003: Implement State Transition Enforcement
**Status**: Closed
**Objective**: Enforce valid state transitions in all bead update operations.

**Acceptance Criteria**:
- [x] API routes use validation before writing
- [x] Invalid transitions return 400 with clear error message
- [~] UI shows validation errors in toast notifications (PARTIAL: modals show inline errors; global toast system deferred to BC-EP1)
- [x] State machine documented in code comments
- [x] Integration tests verify rejection of invalid transitions

**Completion Evidence**:
- `/api/projects/[id]/issues/[issueId]` PATCH uses `validateTransition()` (lines 66-91)
- Invalid transitions return HTTP 400 with `error` and `missingFields`
- State machine documented with ASCII diagram in `bead-lifecycle.ts`
- 46 integration tests in `bead-transition-integration.test.ts`
- All 149 tests passing

**Note**: UI error surfacing via toast notifications deferred to BC-EP1 (Workflow). Current modals (`ClaimBeadModal`, `CompleteBeadModal`) display errors inline.

**Dependencies**: BC-EP0-002

---

### BC-EP0-004: Create Data Repair Utility
**Status**: Closed
**Objective**: Provide a utility to fix common data corruption issues in existing beads.

**Acceptance Criteria**:
- [x] `src/lib/data-repair.ts` module created
- [x] Fixes timestamps missing timezones (defaults to local timezone)
- [x] Converts legacy status values ("done" → "closed")
- [x] Normalizes assignee format (adds @ prefix if missing)
- [x] Generates repair report with all fixes applied
- [x] Settings page has "Repair Data" button
- [x] API endpoint: POST /api/projects/[id]/repair

**Completion Evidence**:
- `src/lib/data-repair.ts` (400 lines) - complete repair module with:
  - `repairTimestamps()` - adds timezone offset to naive timestamps
  - `repairLegacyStatuses()` - converts done→closed, wip→in_progress, etc.
  - `repairAssignees()` - normalizes assignee format with @ prefix
  - `repairRequiredFields()` - sets defaults for missing required fields
  - `repairAllIssues()` - orchestrates all repairs with dry-run support
- `src/routes/api/projects/[id]/repair/+server.ts` - POST endpoint
- `src/routes/settings/+page.svelte` - "Repair Data" button with full UI
- `src/lib/__tests__/data-repair.test.ts` - 15 unit tests
- All 164 tests passing

**Dependencies**: BC-EP0-002

---

### BC-EP0-005: Improve SQLite Connection Reliability
**Status**: Closed
**Objective**: Ensure database connections are stable and handle edge cases gracefully.

**Acceptance Criteria**:
- [x] WAL mode enabled for concurrent reads
- [x] Connection timeout handling
- [x] Graceful reconnection on connection loss
- [x] Database file existence check before connecting
- [x] Clear error messages when database unavailable
- [x] Health check endpoint reports database status

**Completion Evidence**:
- `src/lib/db.ts` enhanced with:
  - `DatabaseError` class with codes: NOT_FOUND, CONNECTION_FAILED, QUERY_FAILED, TIMEOUT
  - `DatabaseHealth` interface for monitoring
  - `databaseExists()` - checks file existence before connecting
  - `getDatabaseHealth()` - comprehensive health status
  - `closeDb()` - graceful cleanup for reconnection
  - Connection timeout: 5 seconds via better-sqlite3 options
  - Retry rate limiting: 5 seconds between failed attempts
  - Connection health check on each `getDb()` call
- `/api/health` endpoint enhanced to return:
  - HTTP 200 for healthy, 503 for degraded/unhealthy
  - Full DatabaseHealth in response body
  - X-Response-Time header
- `src/lib/__tests__/db.test.ts` - 16 unit tests
- All 180 tests passing

**Dependencies**: BC-EP0-001

---

### BC-EP0-006: Implement Structured Logging
**Status**: Closed
**Objective**: Set up comprehensive logging for debugging and observability.

**Acceptance Criteria**:
- [x] Log files created in ~/.beads-dashboard/
- [x] Log rotation: keep last 7 days
- [x] Log levels: debug, info, warn, error
- [x] All API errors logged with request context
- [x] All Claude CLI events logged
- [x] Settings page shows log file locations
- [x] Button to open log directory in Finder

**Completion Evidence**:
- `src/lib/logger.ts` - Centralized logging module with:
  - `createLogger(category)` - category-specific loggers
  - `createApiLogger(category)` - request-context aware API loggers
  - Log levels: debug, info, warn, error with priority filtering
  - `rotateOldLogs()` - removes logs older than 7 days
  - `clearAllLogs()` - clears all log files
  - `listLogFiles()` - lists files with size/date
  - Pre-created loggers: appLogger, apiLogger, claudeLogger, chatLogger, dbLogger
- `/api/logs` endpoint for log management
- Settings page "Logs" tab with:
  - Log file list with sizes and modification dates
  - "Open in Finder" button
  - "Rotate Old Logs" button
  - "Clear All" button with confirmation
  - Log level documentation
- `src/lib/__tests__/logger.test.ts` - 17 unit tests
- All 197 tests passing

**Dependencies**: BC-EP0-001

---

### BC-EP0-007: Add Health Check Endpoint
**Status**: Closed
**Objective**: Provide endpoint for monitoring system health.

**Acceptance Criteria**:
- [x] GET /api/health returns health status
- [x] Checks: SQLite connection, SSE active, Claude CLI status
- [x] Returns structured JSON with component statuses
- [x] Returns 200 if healthy, 503 if degraded
- [x] Response time < 100ms

**Completion Evidence**:
- `/api/health` enhanced with comprehensive component checks:
  - Database: connected, exists, walMode, dataVersion, error
  - Claude CLI: installed, version, path, verification status
  - SSE: active status (capability check)
- Returns `components` object with detailed health per component
- Returns `responseTime` in response body and X-Response-Time header
- HTTP 200 for healthy, 503 for degraded/unhealthy
- Cache-Control: no-cache to prevent stale health data
- All 197 tests passing

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
