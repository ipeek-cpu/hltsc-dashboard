# HLSTC Dashboard Fork Specification

**Created**: 2026-01-18
**Source**: beads-live-dashboard-electron (from ~/Downloads/)
**Target**: ~/Repos/hlstc-dashboard
**Status**: Ready for Implementation

---

## Executive Summary

Fork and customize the beads-live-dashboard-electron app to enforce bead workflow discipline, provide agent visibility, and prevent the data corruption and tracking issues we've experienced.

---

## Setup Instructions

```bash
# 1. Copy to new location
cp -r ~/Downloads/beads-live-dashboard-electron ~/Repos/hlstc-dashboard

# 2. Initialize as new git repo
cd ~/Repos/hlstc-dashboard
rm -rf .git
git init
git add .
git commit -m "Initial fork of beads-live-dashboard-electron"

# 3. Install dependencies
bun install

# 4. Run in dev mode
bun run dev
# Opens at http://localhost:5555
```

---

## CRITICAL: Remove Authentication Layer

**Priority**: Do this FIRST before any other changes.

The current dashboard has an authentication layer that is not needed for local development. Remove it entirely:

1. Find and remove any auth middleware in `src/routes/`
2. Remove any login/logout UI components
3. Remove any session management
4. Remove any auth-related API routes
5. The dashboard should load directly to the main view without any login prompt

**Acceptance Criteria**:
- `bun run dev` opens directly to the Kanban board
- No login screen, no auth prompts
- No session cookies or tokens required

---

## Core Requirements

### 1. Mandatory Bead Lifecycle Enforcement

The dashboard MUST enforce proper state transitions. No exceptions.

#### Valid State Transitions

```
open → ready        (bead is refined and unblocked)
open → closed       (cancelled/won't do)
ready → in_progress (agent claims the bead)
ready → closed      (cancelled/won't do)
in_progress → in_review (work complete, needs review)
in_progress → ready     (blocked, returning to queue)
in_review → closed      (approved and merged)
in_review → in_progress (changes requested)
closed → open           (reopened)
```

#### Claim Requirements (ready → in_progress)

Before a bead can move to `in_progress`, the following MUST be provided:

```typescript
interface BeadClaimPayload {
  bead_id: string;
  agent_id: string;           // Who is claiming it
  branch_name: string;        // REQUIRED - no anonymous work
  started_at: string;         // ISO8601 with timezone, auto-generated
}
```

**UI**: When clicking "Start" on a bead, prompt for branch name. Auto-suggest: `feat/{bead_id}-{slug}`

#### Completion Requirements (in_progress → in_review)

Before a bead can move to `in_review`, the following MUST be provided:

```typescript
interface BeadCompletionPayload {
  bead_id: string;
  commit_hash: string;        // REQUIRED - proof of work
  pr_url?: string;            // Optional but encouraged
  files_changed: string[];    // List of files modified
  execution_log: string;      // Markdown summary of what was done
  completed_at: string;       // ISO8601 with timezone, auto-generated
}
```

**UI**: When clicking "Submit for Review", show a modal requiring:
- Commit hash (required, validate format)
- PR URL (optional)
- Execution log (required, markdown textarea)

The execution log should follow this template:

```markdown
## Execution Log

**Agent**: {agent_name}
**Branch**: {branch_name}
**Duration**: {time_spent}

### Files Changed
- path/to/file1.swift (new|modified|deleted)
- path/to/file2.swift (new|modified|deleted)

### Verification
- [ ] Build passes
- [ ] Tests pass
- [ ] Lint passes

### PR
{pr_url or "No PR created"}

### Notes
{free-form notes about the implementation}
```

---

### 2. Data Validation on Every Write

All writes to `.beads/issues.jsonl` MUST be validated. Reject invalid data.

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateBeadWrite(bead: Bead, previousBead?: Bead): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Timestamp MUST have timezone
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

  if (bead.created_at && !timestampRegex.test(bead.created_at)) {
    errors.push(`Invalid created_at timestamp: ${bead.created_at} (missing timezone)`);
  }
  if (bead.updated_at && !timestampRegex.test(bead.updated_at)) {
    errors.push(`Invalid updated_at timestamp: ${bead.updated_at} (missing timezone)`);
  }

  // 2. Status MUST be valid
  const validStatuses = ['open', 'ready', 'in_progress', 'in_review', 'closed'];
  if (!validStatuses.includes(bead.status)) {
    errors.push(`Invalid status: ${bead.status}`);
  }

  // 3. State transition MUST be valid
  if (previousBead) {
    const validTransitions: Record<string, string[]> = {
      'open': ['ready', 'closed'],
      'ready': ['in_progress', 'closed'],
      'in_progress': ['in_review', 'ready'],
      'in_review': ['closed', 'in_progress'],
      'closed': ['open']
    };

    if (!validTransitions[previousBead.status]?.includes(bead.status)) {
      errors.push(`Invalid transition: ${previousBead.status} → ${bead.status}`);
    }
  }

  // 4. Required fields for certain states
  if (bead.status === 'in_progress' && !bead.assignee) {
    warnings.push('in_progress bead has no assignee');
  }

  if (bead.status === 'in_review' && !bead.notes?.includes('## Execution Log')) {
    warnings.push('in_review bead missing execution log in notes');
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

**Behavior**:
- If `errors.length > 0`: REJECT the write, show error toast
- If `warnings.length > 0`: ALLOW the write, show warning toast

---

### 3. Data Repair Utility

Add a repair command/button that fixes existing data corruption:

```typescript
async function repairBeadsData(projectPath: string): Promise<RepairReport> {
  const issues: string[] = [];
  const fixes: string[] = [];

  // Read all beads
  const beads = await readBeadsJsonl(projectPath);

  for (const bead of beads) {
    // Fix 1: Add timezone to timestamps missing it
    if (bead.created_at && !bead.created_at.match(/[+-]\d{2}:\d{2}|Z$/)) {
      bead.created_at = bead.created_at + '-06:00'; // Default to CST
      fixes.push(`Added timezone to ${bead.id} created_at`);
    }
    if (bead.updated_at && !bead.updated_at.match(/[+-]\d{2}:\d{2}|Z$/)) {
      bead.updated_at = bead.updated_at + '-06:00';
      fixes.push(`Added timezone to ${bead.id} updated_at`);
    }

    // Fix 2: Convert "done" status to "closed"
    if (bead.status === 'done') {
      bead.status = 'closed';
      fixes.push(`Converted ${bead.id} status from "done" to "closed"`);
    }

    // Fix 3: Normalize assignee format
    if (bead.assignee && !bead.assignee.startsWith('@')) {
      bead.assignee = '@' + bead.assignee;
      fixes.push(`Normalized ${bead.id} assignee to ${bead.assignee}`);
    }
  }

  // Write repaired data
  await writeBeadsJsonl(projectPath, beads);

  return { issues, fixes, beadsProcessed: beads.length };
}
```

**UI**: Add a "Repair Data" button in settings that runs this and shows the report.

---

### 4. Agent Activity Stream

Show real-time visibility into what agents are doing.

```typescript
interface AgentActivityEvent {
  id: string;
  timestamp: string;          // ISO8601 with timezone
  agent_id: string;
  bead_id?: string;
  event_type:
    | 'claimed'               // Agent started work on a bead
    | 'file_read'             // Agent read a file
    | 'file_edit'             // Agent edited a file
    | 'file_create'           // Agent created a file
    | 'command_run'           // Agent ran a shell command
    | 'command_complete'      // Shell command finished
    | 'commit'                // Agent made a commit
    | 'pr_created'            // Agent created a PR
    | 'completed'             // Agent finished bead
    | 'failed'                // Agent encountered error
    | 'idle';                 // Agent waiting for input
  details: {
    file_path?: string;
    command?: string;
    exit_code?: number;
    commit_hash?: string;
    pr_url?: string;
    error?: string;
    duration_ms?: number;
  };
}
```

**UI Components**:

1. **Activity Feed Panel** (collapsible sidebar)
   - Real-time scrolling list of events
   - Filter by agent, bead, event type
   - Click event to see details

2. **Agent Status Cards**
   - Show each active agent
   - Current bead being worked on
   - Current activity (editing file X, running command Y)
   - Time elapsed on current bead

3. **Bead Activity Timeline**
   - On bead detail view, show all activity events for that bead
   - Chronological timeline with expandable details

---

### 5. Stale Bead Alerts

Automatically detect and alert on beads that appear stuck.

```typescript
interface StaleBeadAlert {
  bead_id: string;
  status: string;
  stale_duration_hours: number;
  last_activity?: AgentActivityEvent;
  alert_level: 'warning' | 'critical';
}

function detectStaleBeads(beads: Bead[], activityLog: AgentActivityEvent[]): StaleBeadAlert[] {
  const now = Date.now();
  const alerts: StaleBeadAlert[] = [];

  for (const bead of beads) {
    const updatedAt = new Date(bead.updated_at).getTime();
    const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);

    // Find last activity for this bead
    const lastActivity = activityLog
      .filter(e => e.bead_id === bead.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    if (bead.status === 'in_progress') {
      // In progress with no activity for 2+ hours
      if (hoursSinceUpdate > 2) {
        alerts.push({
          bead_id: bead.id,
          status: bead.status,
          stale_duration_hours: hoursSinceUpdate,
          last_activity: lastActivity,
          alert_level: hoursSinceUpdate > 8 ? 'critical' : 'warning'
        });
      }
    }

    if (bead.status === 'in_review') {
      // In review for 24+ hours
      if (hoursSinceUpdate > 24) {
        alerts.push({
          bead_id: bead.id,
          status: bead.status,
          stale_duration_hours: hoursSinceUpdate,
          last_activity: lastActivity,
          alert_level: hoursSinceUpdate > 72 ? 'critical' : 'warning'
        });
      }
    }
  }

  return alerts;
}
```

**UI**:
- Alert badge on beads that are stale
- Stale beads panel showing all alerts
- Click to view bead and take action (reassign, close, etc.)

---

### 6. Git/PR Integration

Show branch and PR status for each bead.

```typescript
interface BeadGitInfo {
  bead_id: string;
  branch_name?: string;
  branch_exists: boolean;
  commits_ahead: number;
  pr?: {
    number: number;
    url: string;
    state: 'open' | 'closed' | 'merged';
    ci_status: 'pending' | 'success' | 'failure' | 'unknown';
    review_status: 'pending' | 'approved' | 'changes_requested';
  };
}

async function getBeadGitInfo(projectPath: string, bead: Bead): Promise<BeadGitInfo> {
  const branchName = bead.metadata?.branch_name || `feat/${bead.id}`;

  // Check if branch exists
  const branchExists = await exec(`git branch --list ${branchName}`, { cwd: projectPath })
    .then(r => r.stdout.trim().length > 0);

  // Get commits ahead of main
  const commitsAhead = branchExists
    ? parseInt(await exec(`git rev-list --count main..${branchName}`, { cwd: projectPath }).then(r => r.stdout.trim()))
    : 0;

  // Check for PR (requires gh CLI)
  let pr = undefined;
  if (branchExists) {
    try {
      const prJson = await exec(`gh pr view ${branchName} --json number,url,state,statusCheckRollup,reviewDecision`, { cwd: projectPath });
      const prData = JSON.parse(prJson.stdout);
      pr = {
        number: prData.number,
        url: prData.url,
        state: prData.state.toLowerCase(),
        ci_status: mapCiStatus(prData.statusCheckRollup),
        review_status: mapReviewStatus(prData.reviewDecision)
      };
    } catch {
      // No PR exists
    }
  }

  return { bead_id: bead.id, branch_name: branchName, branch_exists: branchExists, commits_ahead: commitsAhead, pr };
}
```

**UI**:
- Branch indicator on bead cards
- PR status badge (open/merged/closed)
- CI status indicator (green check, red X, yellow spinner)
- Click PR badge to open in browser

---

### 7. Global Agent Support

Load agents from both global and project directories.

```typescript
async function loadAgents(projectPath: string): Promise<Agent[]> {
  const globalAgentsDir = path.join(os.homedir(), '.claude', 'agents');
  const projectAgentsDir = path.join(projectPath, '.claude', 'agents');

  const globalAgents = await loadAgentsFromDir(globalAgentsDir, 'global');
  const projectAgents = await loadAgentsFromDir(projectAgentsDir, 'project');

  // Project agents override global ones with same filename
  const merged = new Map<string, Agent>();
  for (const agent of globalAgents) merged.set(agent.filename, agent);
  for (const agent of projectAgents) merged.set(agent.filename, agent);

  return Array.from(merged.values());
}
```

**HLSTC Agents to Create** (in `~/.claude/agents/`):

| Filename | Name | Purpose |
|----------|------|---------|
| hlstc-planner.md | HLSTC Planner | Plan beads, validate dependencies, write planning docs |
| hlstc-executor.md | HLSTC Executor | Implement one READY bead end-to-end |
| hlstc-review.md | HLSTC Review | Validate implementation against acceptance criteria |
| hlstc-product-design.md | HLSTC Product Design | UI/UX specs and Storybook alignment |
| hlstc-backend-architect.md | HLSTC Backend Architect | API/schema design and data contracts |
| hlstc-qa.md | HLSTC QA | Test strategy and verification |

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `src/lib/agents.ts` | Add global agent loading |
| `src/lib/db.ts` | Add validation on writes |
| `src/lib/task-runner-manager.ts` | Add activity event logging |
| `src/routes/+layout.svelte` | Remove auth wrapper |
| `src/routes/api/stream/+server.ts` | Add activity events to SSE |
| `src/components/BoardCard.svelte` | Add git/PR status, stale indicator |
| `src/components/BeadDetailSheet.svelte` | Add claim/complete modals with required fields |
| `src/components/AgentsView.svelte` | Show global vs project agents |
| NEW: `src/components/ActivityFeed.svelte` | Real-time activity stream |
| NEW: `src/components/StaleBeadsPanel.svelte` | Stale bead alerts |
| NEW: `src/lib/repair.ts` | Data repair utility |
| NEW: `src/lib/validation.ts` | Bead validation logic |

---

## Success Criteria

1. **Auth removed**: Dashboard opens directly without login
2. **Lifecycle enforced**: Cannot transition states without required data
3. **Data validated**: Invalid writes are rejected with clear error messages
4. **Activity visible**: Can see real-time what agents are doing
5. **Stale alerts**: Stuck beads are automatically flagged
6. **Git integrated**: Branch/PR status visible on each bead
7. **Repair available**: One-click fix for corrupted data

---

## Reference: Beta Readiness Scope

From REALIGNMENT 1-17.MD, the dashboard should help track progress toward:

1. Onboarding captures correct inputs for plan generation
2. Backend architecture supports weekly personalization
3. UI reflects generated plans without coupling to generation logic
4. Both tiers (Starter/Performance) can be simulated end-to-end
5. Storybook reflects all relevant UI states
6. Authentication works or is fully mockable

The dashboard should make it obvious at a glance:
- Which beads are blocking beta readiness
- Which beads are stuck/stale
- Which agents are actively working
- What the critical path is

---

## Start Now

Begin by:
1. Removing the authentication layer
2. Adding data validation
3. Adding the repair utility
4. Then build out visibility features
