# Beads Console FAQ

**Version**: 1.0
**Date**: 2026-01-19

---

## General Questions

### What is Beads Console?

Beads Console is a desktop application that provides a real-time Kanban board for managing AI agent workflows. It integrates with the Beads issue tracker and Claude Code to enable disciplined, observable AI-assisted development.

### What is Beads?

Beads is a distributed, git-backed issue tracker designed for AI agents. Issues (called "beads") are stored as JSONL files in your repository, synced to a local SQLite database for fast querying. Learn more at [github.com/steveyegge/beads](https://github.com/steveyegge/beads).

### What are the system requirements?

- **macOS**: Intel or Apple Silicon (macOS 12+)
- **Anthropic account**: For Claude authentication
- **Internet**: Required for Claude API access
- **Disk space**: ~500MB for application and bundled tools

### Does it work on Windows or Linux?

Not currently. Beads Console is macOS-only for now due to dependencies on macOS-specific features (Keychain, code signing). Windows and Linux support may be added in the future.

---

## Installation

### How do I install Beads Console?

1. Download the DMG from the releases page
2. Open the DMG and drag the app to Applications
3. Launch Beads Console
4. The app will auto-install required tools (Node.js, Beads CLI, Claude Code CLI)

### The app says it's from an unidentified developer

The app is code-signed and notarized by Apple. If you see this warning:
1. Right-click (or Control-click) the app in Finder
2. Select "Open" from the context menu
3. Click "Open" in the dialog

### Where does the app store data?

- **App data**: `~/.beads-dashboard/`
- **Claude CLI**: `~/.beads-dashboard/bin/claude`
- **Node.js**: `~/.beads-dashboard/node/`
- **Logs**: `~/.beads-dashboard/*.log`

---

## Projects

### How do I add a project?

1. Click the "+" button in the sidebar
2. Browse to your project directory
3. The app will detect the project type and configure defaults
4. If your project has a `.beads/` directory, beads will sync automatically

### My project doesn't have a `.beads/` folder

Run `bd init` in your project directory to initialize Beads. Or click "Initialize Beads" in the project settings.

### Can I manage multiple projects?

Yes. Use the sidebar to switch between projects. Each project has its own beads, sessions, and settings.

### How do I remove a project?

Right-click the project in the sidebar and select "Remove". This only removes the project from Beads Console - it doesn't delete any files.

---

## Beads & Workflow

### What's the difference between "open" and "ready"?

- **Open**: The bead exists but isn't ready for work (needs refinement, has blockers)
- **Ready**: The bead is fully defined and unblocked - an agent can claim it

### Why can't I move a bead directly to "in_progress"?

Beads Console enforces proper workflow discipline. You must:
1. Provide a branch name (required)
2. Select an agent (recommended)
3. The bead must be in "ready" status

This prevents anonymous, untraceable work.

### What's required to complete a bead?

To move a bead to "in_review", you must provide:
1. **Commit hash**: Proof that work was committed
2. **Execution log**: Markdown summary of what was done

This ensures every completed bead has an audit trail.

### A bead is stuck - how do I fix it?

Options:
1. **Return to ready**: If the agent hit a blocker
2. **Reassign**: Give it to a different agent
3. **Close**: If the work is no longer needed
4. **Check activity**: View the session history to see what happened

---

## Sessions

### What is a session?

A session is a focused work period with Claude. It captures:
- The bead being worked on (if any)
- The agent prompt being used
- All chat messages
- Files read and written
- Commands run

### Can I have multiple sessions at once?

You can have one active session per project. Other sessions will be paused. This prevents confusion about which session is current.

### How do I resume a paused session?

Click on the paused session in the sidebar, then click "Resume". Claude will receive context about where you left off.

### Where are session transcripts stored?

In your project's `.beads/sessions/` directory. Each session has its own folder with:
- `meta.json`: Session metadata
- `messages.jsonl`: Chat history
- `context.json`: Context pack snapshot

---

## Claude Integration

### How do I authenticate with Claude?

1. Click the user icon in the top right
2. Click "Sign in with Claude"
3. Complete the OAuth flow in your browser
4. Return to Beads Console

### The Claude CLI isn't responding

Try these steps:
1. Check your internet connection
2. Click Settings > Claude > "Restart Claude CLI"
3. Check the logs at `~/.beads-dashboard/claude-cli.log`
4. Re-authenticate if your session expired

### Can I use my own API key instead of OAuth?

Not currently. Beads Console uses the Claude Code CLI which requires OAuth authentication. API key support may be added in the future.

### What Claude model is used?

Beads Console uses whatever model Claude Code selects by default (typically claude-sonnet-4-20250514). You can specify a different model in agent prompts.

---

## Agents

### What is an agent?

An agent is a specialized prompt that configures Claude for a specific task. Agents are defined as markdown files with YAML frontmatter.

### Where are agents stored?

- **Global agents**: `~/.claude/agents/`
- **Project agents**: `{project}/.claude/agents/`

Project agents override global agents with the same filename.

### How do I create a custom agent?

Create a markdown file in one of the agent directories:

```markdown
---
name: My Custom Agent
description: Does something specific
---

You are an agent that specializes in...

## Guidelines
- Guideline 1
- Guideline 2
```

### What agents are included by default?

Beads Console comes with these built-in agents:
- **hlstc-planner**: Plans beads and validates dependencies
- **hlstc-executor**: Implements a single bead end-to-end
- **hlstc-review**: Validates implementations
- **hlstc-product-design**: UI/UX specs
- **hlstc-backend-architect**: API and schema design
- **hlstc-qa**: Test strategy

---

## Data & Privacy

### Is my data sent to the cloud?

- **Chat messages**: Sent to Claude's API (Anthropic)
- **Code context**: Sent to Claude's API when included in chat
- **Beads data**: Stored locally only
- **Sessions**: Stored locally only
- **No telemetry**: We don't collect usage data

### How do I back up my data?

All data is in your project's `.beads/` directory and `~/.beads-dashboard/`. Back up these directories like any other files.

### Can I export my session history?

Yes. Go to Settings > Export and select what to export (sessions, activity, metrics). Formats available: JSON, Markdown, CSV.

---

## Troubleshooting

### The Kanban board isn't updating

1. Check that your project has a valid `.beads/beads.db` file
2. Run `bd refresh` in the terminal to force a sync
3. Restart Beads Console

### "Data validation failed" error

Beads Console validates all writes. Common issues:
- **Missing timezone**: Timestamps must include timezone (e.g., `-06:00`)
- **Invalid status**: Must be one of: open, ready, in_progress, in_review, closed
- **Invalid transition**: Can't skip states (e.g., open → in_progress)

Use Settings > "Repair Data" to fix existing issues.

### High memory usage

If memory exceeds 500MB:
1. Close unused sessions
2. Clear old activity logs (Settings > Storage > Clear logs)
3. Restart the app

### Logs location

- `~/.beads-dashboard/settings.log` - Path resolution
- `~/.beads-dashboard/claude-cli.log` - CLI session management
- `~/.beads-dashboard/chat-manager.log` - Chat handling
- `~/.beads-dashboard/hooks.log` - Global errors

---

## Glossary

| Term | Definition |
|------|------------|
| **Bead** | A unit of work (issue/task) in the Beads system |
| **Session** | A focused work period with Claude |
| **Agent** | A specialized prompt that configures Claude |
| **Context Pack** | Collection of relevant code files for Claude |
| **Profile** | Project-type configuration (iOS, Web, Infra) |
| **Quick Action** | Project-specific shortcut command |
| **SSE** | Server-Sent Events - real-time update mechanism |
| **PTY** | Pseudo-terminal for Claude CLI communication |

---

## Getting Help

### Where can I report bugs?

Open an issue on GitHub: [github.com/ipeek-cpu/hlstc-dashboard/issues](https://github.com/ipeek-cpu/hlstc-dashboard/issues)

### Where can I request features?

Open a GitHub issue with the "enhancement" label.

### Is there a community?

Join the discussions on GitHub or reach out via the repository.
