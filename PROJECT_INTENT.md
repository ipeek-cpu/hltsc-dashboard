---
version: 1
created_at: 2026-01-20T00:00:00Z
updated_at: 2026-01-20T18:00:00Z
---

# Project Intent: Beads Console

## Overview {#anchor:overview}

Beads Console is a control plane for multi-agent, multi-session software development. It provides real-time visibility into Beads issues, Claude Code chat integration, and tools for managing drift across development sessions.

## Business Model {#anchor:business-model}

### Target Users {#anchor:business-model.users}
- Solo developers using AI-assisted development
- Small teams coordinating multiple Claude Code sessions
- Projects requiring audit trails and decision tracking

### Value Proposition {#anchor:business-model.value}
- Single dashboard for Beads + Claude Code
- Persistent memory across sessions (cmem)
- Project intent enforcement to prevent drift

## Architecture Constraints {#anchor:constraints}

### Chat-Pane-Safe Design {#anchor:constraints.chat-pane}
All UI features MUST remain usable with the chat pane open. New experiences use sheets, drawers, or embedded panels - never full-page navigation that hides the chat.

### Read-Only Beads DB {#anchor:constraints.beads-db}
The dashboard reads from `.beads/beads.db` but NEVER writes to it. All dashboard-specific state goes to `dashboard.db` or separate files like `intent-links.json`.

### Electron + SvelteKit {#anchor:constraints.tech-stack}
- SvelteKit with adapter-node for the web app
- Electron for native desktop packaging
- SQLite with WAL mode for all databases
- SSE for real-time updates

## Non-Negotiables {#anchor:non-negotiables}

- Session context must persist across compaction events
- Intent anchors must be git-tracked (not in database)
- Memory retrieval must be scoped (bead > epic > project constraints)
- All Quick Actions must have audit trails

## Anti-Goals {#anchor:anti-goals}

- Not a replacement for the `bd` CLI - complement it
- Not a full IDE - focused control plane only
- Not multi-tenant - single user per installation
- No cloud sync - all data stays local

## Plan Lifecycle {#anchor:lifecycle}

### Generate {#anchor:lifecycle.generate}
Create implementation plans with clear scope, acceptance criteria, and dependency chains. Use Beads epics to organize related work.

### Execute {#anchor:lifecycle.execute}
Implement one bead at a time with isolated branches. Run preflights, tests, and builds before marking complete.

### Review {#anchor:lifecycle.review}
Validate implementations against acceptance criteria. Check for regressions and ensure structured execution logs are present.

### Iterate {#anchor:lifecycle.iterate}
Refine based on review feedback. Update memory with decisions and learnings for future sessions.
