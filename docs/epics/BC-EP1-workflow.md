# BC-EP1: Workflow Enforcement - Kanban Moves, Status Editing, Assignments

**Priority**: High
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Enforce strict bead workflow discipline through the UI. Users and agents must follow the proper state machine, provide required metadata, and leave an audit trail for all work.

---

## Scope

### In Scope
- Kanban drag-and-drop with transition validation
- Claim bead modal (ready → in_progress)
- Complete bead modal (in_progress → in_review)
- Status editing with validation
- Agent assignment UI
- Stale bead detection and alerts
- Audit trail for all transitions

### Out of Scope
- Claude CLI integration (see EP3)
- Session management (see EP2)
- Git/PR integration (covered in EP0)

---

## Beads

### BC-EP1-001: Implement Claim Bead Modal
**Status**: Ready
**Objective**: When claiming a bead (ready → in_progress), require branch name and capture metadata.

**Acceptance Criteria**:
- [ ] Modal opens when clicking "Start" on a ready bead
- [ ] Branch name field (required)
- [ ] Auto-suggest branch name: `feat/{bead_id}-{slug}`
- [ ] Agent selector dropdown (optional, defaults to none)
- [ ] "Start Work" button creates transition
- [ ] Bead.assignee set to selected agent
- [ ] Bead.notes includes branch name and start timestamp
- [ ] Invalid branch names rejected (no spaces, special chars)

**Dependencies**: BC-EP0-003

---

### BC-EP1-002: Implement Complete Bead Modal
**Status**: Ready
**Objective**: When completing a bead (in_progress → in_review), require commit hash and execution log.

**Acceptance Criteria**:
- [ ] Modal opens when clicking "Submit for Review" on in_progress bead
- [ ] Commit hash field (required, validates format)
- [ ] PR URL field (optional, validates URL format)
- [ ] Execution log textarea (required, markdown)
- [ ] Pre-populated execution log template
- [ ] File list auto-populated from git diff if available
- [ ] "Submit for Review" creates transition
- [ ] Bead.notes updated with execution log
- [ ] Reject if commit hash invalid format

**Dependencies**: BC-EP0-003

---

### BC-EP1-003: Kanban Drag-and-Drop Validation
**Status**: Ready
**Objective**: Enable drag-and-drop column changes with transition validation.

**Acceptance Criteria**:
- [ ] Beads can be dragged between columns
- [ ] Invalid drops rejected with visual feedback
- [ ] ready → in_progress opens claim modal
- [ ] in_progress → in_review opens complete modal
- [ ] Other valid transitions happen immediately
- [ ] Drop zones highlight based on valid transitions
- [ ] Animation feedback on successful move
- [ ] Toast notification on invalid move attempt

**Dependencies**: BC-EP1-001, BC-EP1-002

---

### BC-EP1-004: Status Dropdown with Validation
**Status**: Ready
**Objective**: Allow status changes via dropdown with same validation as drag-and-drop.

**Acceptance Criteria**:
- [ ] Status dropdown in bead detail sheet
- [ ] Only valid next states shown in dropdown
- [ ] Selecting status triggers appropriate modal if needed
- [ ] Invalid options disabled with explanation tooltip
- [ ] Keyboard accessible
- [ ] Same validation as drag-and-drop

**Dependencies**: BC-EP1-003

---

### BC-EP1-005: Agent Assignment UI
**Status**: Ready
**Objective**: Allow assigning agents to beads with visual representation.

**Acceptance Criteria**:
- [ ] Assignee dropdown in bead detail sheet
- [ ] Shows all available agents (global + project)
- [ ] Unassigned option available
- [ ] Agent avatar/icon shown on bead card
- [ ] Assignee change logged in bead history
- [ ] Filter Kanban by assignee

**Dependencies**: BC-EP0-001

---

### BC-EP1-006: Stale Bead Detection
**Status**: Ready
**Objective**: Automatically detect beads that appear stuck.

**Acceptance Criteria**:
- [ ] `src/lib/stale-detection.ts` module created
- [ ] in_progress > 2 hours with no activity: warning
- [ ] in_progress > 8 hours with no activity: critical
- [ ] in_review > 24 hours: warning
- [ ] in_review > 72 hours: critical
- [ ] Detection runs on SSE data updates
- [ ] Stale state stored in client memory (not persisted)

**Dependencies**: BC-EP0-008

---

### BC-EP1-007: Stale Bead Alerts UI
**Status**: Ready
**Objective**: Display stale bead alerts prominently.

**Acceptance Criteria**:
- [ ] Alert badge on stale bead cards
- [ ] Badge color: yellow (warning), red (critical)
- [ ] Stale beads panel in sidebar
- [ ] Panel shows all stale beads sorted by severity
- [ ] Click alert to open bead detail
- [ ] Dismiss alert option (for 24 hours)
- [ ] Sound notification option (off by default)

**Dependencies**: BC-EP1-006

---

### BC-EP1-008: Transition Audit Trail
**Status**: Ready
**Objective**: Record all state transitions with full context.

**Acceptance Criteria**:
- [ ] Every transition logged to events table
- [ ] Event includes: old_status, new_status, actor, timestamp
- [ ] Metadata captured: branch name, commit hash, etc.
- [ ] Activity timeline in bead detail sheet
- [ ] Timeline shows all transitions chronologically
- [ ] Export audit trail option (markdown)

**Dependencies**: BC-EP0-003

---

### BC-EP1-009: Bulk Status Operations
**Status**: Ready
**Objective**: Allow status changes on multiple beads at once.

**Acceptance Criteria**:
- [ ] Multi-select mode (checkbox on cards)
- [ ] Bulk action toolbar appears when items selected
- [ ] Available actions based on common valid transitions
- [ ] All selected beads validated before operation
- [ ] If any invalid, show which ones and why
- [ ] Progress indicator during bulk operation
- [ ] Success/failure summary toast

**Dependencies**: BC-EP1-004

---

### BC-EP1-010: Kanban Column Customization
**Status**: Ready
**Objective**: Allow users to customize which columns are visible.

**Acceptance Criteria**:
- [ ] Column visibility toggle in settings
- [ ] Default: all columns visible
- [ ] Common preset: hide "closed" column
- [ ] Collapsed columns show count but no cards
- [ ] Drag-drop to reorder columns
- [ ] Column settings persist per project

**Dependencies**: BC-EP0-001

---

## Verification

After completing this epic:
1. Cannot move bead to in_progress without branch name
2. Cannot move bead to in_review without commit hash + execution log
3. Drag-and-drop respects state machine
4. Stale beads are automatically detected and highlighted
5. All transitions have audit trail
6. Bulk operations work with proper validation
