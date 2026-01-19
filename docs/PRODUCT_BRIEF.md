# Beads Console Product Brief

**Version**: 1.0
**Date**: 2026-01-19
**Status**: Active Development

---

## Vision

Beads Console is the command center for AI-assisted software development. It provides real-time visibility into agent workflows, enforces disciplined bead lifecycle management, and enables seamless human-AI collaboration through a unified interface.

---

## Target Users

### Primary: Individual Developers + AI Agents
- Solo developers working with Claude Code on personal or side projects
- Developers using multiple AI agents for parallel workstreams
- Teams of 1-3 developers with dedicated AI agents per project

### Secondary: Small Teams
- Engineering teams using Beads for task management
- Teams experimenting with AI-augmented development workflows

---

## Core Value Propositions

### 1. Workflow Discipline
- **Enforced state transitions**: No shortcuts, no corruption
- **Required metadata**: Branch names, commit hashes, execution logs
- **Validation on every write**: Catch problems before they persist

### 2. Agent Visibility
- **Real-time activity stream**: See what agents are doing now
- **Stale bead detection**: Automatic alerts for stuck work
- **Session tracking**: Full history of agent interactions

### 3. Integrated Experience
- **Claude Code side-by-side**: Chat and Kanban in one view
- **Context packs**: Intelligent code context for prompts
- **Quick actions**: Project-specific shortcuts (iOS/Web/Infra)

### 4. Git-Native
- **Branch/PR status on every bead**: Visual indicators for CI/review
- **Automatic branch suggestions**: Consistent naming conventions
- **PR integration**: One-click navigation to GitHub

---

## What Beads Console Is NOT

- **Not a full IDE**: Use VS Code, Cursor, or your preferred editor
- **Not a CI/CD system**: GitHub Actions handles builds/deploys
- **Not a chat history viewer**: Focus is on actionable work, not conversation logs
- **Not a project manager for large teams**: Optimized for individuals and small teams

---

## Success Metrics

### User Experience
- Time from launch to first bead claim: < 30 seconds
- Data validation catches 100% of malformed writes
- Zero beads stuck in "in_progress" without activity for 8+ hours (with alerts)

### Technical
- SSE updates visible within 1 second of database change
- Claude CLI response streaming with < 100ms first token latency
- CodeGraph context pack generation in < 5 seconds

---

## Design Principles

1. **Observability over automation**: Show what's happening, let humans decide
2. **Discipline over flexibility**: Enforce correct workflows, prevent corruption
3. **Integration over replacement**: Work with existing tools (git, GitHub, Claude Code)
4. **Local-first**: All data in git-backed files, no external dependencies
5. **Premium aesthetic**: Clean, focused UI worthy of professional tools

---

## Feature Priorities

| Priority | Feature Area | Epic |
|----------|--------------|------|
| Critical | Session System | BC-EP2 |
| Critical | Claude CLI Integration | BC-EP3 |
| High | Workflow Enforcement | BC-EP1 |
| High | Foundation/Data Integrity | BC-EP0 |
| Medium | Context Packs | BC-EP4 |
| Medium | Observability | BC-EP5 |
| Low | Project Profiles | BC-EP6 |
| Low | Customization | BC-EP7 |

---

## Out of Scope (v1)

- Multi-user collaboration features
- Cloud sync or remote storage
- Mobile companion app
- Plugin/extension system
- Custom theming beyond dark/light mode
