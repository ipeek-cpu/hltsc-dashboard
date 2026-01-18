# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beads Live Dashboard is a SvelteKit 2 application that provides a real-time Kanban board view for [Beads](https://github.com/steveyegge/beads) - a distributed, git-backed issue tracker designed for AI agents. The dashboard reads directly from the Beads SQLite cache (`../.beads/beads.db`) and streams updates via Server-Sent Events.

The app also includes an integrated **Claude Code chat interface** that allows users to interact with Claude directly within the dashboard context, with support for custom agents and multiple chat modes.

**System Requirements (for end users):**
- macOS (Intel or Apple Silicon)
- Anthropic account (for Claude authentication)
- Internet connection

Everything else (Node.js, Beads CLI, Claude Code CLI) is bundled or auto-installed.

### Desktop App Architecture

This is a **SvelteKit app packaged as a native desktop app using Electron**. The architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │  ServerManager  │  │         BrowserWindow            │  │
│  │  (spawns Node)  │  │  ┌────────────────────────────┐  │  │
│  │                 │  │  │   Main WebContents         │  │  │
│  │  SvelteKit      │  │  │   (Dashboard UI)           │  │  │
│  │  Server         │  │  │                            │  │  │
│  │  :5555          │  │  └────────────────────────────┘  │  │
│  │                 │  │  ┌────────────────────────────┐  │  │
│  │                 │  │  │   BrowserView              │  │  │
│  │                 │  │  │   (Preview - CSP stripped) │  │  │
│  │                 │  │  │   with DevTools            │  │  │
│  │                 │  │  └────────────────────────────┘  │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

1. **Electron** provides the native window and Chromium-based rendering
2. **ServerManager** (`electron/server-manager.ts`) spawns the bundled Node.js binary
3. **SvelteKit server** (built with `adapter-node`) runs on port 5555
4. **BrowserWindow** loads the dashboard UI from `http://127.0.0.1:5555`
5. **BrowserView** renders preview content with CSP headers stripped (enables Shopify embeds)
6. **PreviewManager** (`electron/preview-manager.ts`) handles preview, DevTools, and element inspection

Key Electron features:
- **CSP bypass** - Strips `frame-ancestors` headers to embed restricted sites (Shopify, etc.)
- **DevTools** - Inspect preview content with Chrome DevTools
- **URL tracking** - Monitor SPA navigation (e.g., `localhost:3000/home` not just `localhost:3000`)
- **Click-to-inspect** - Select elements and get CSS selectors for Claude context

## Commands

```bash
bun run dev              # Start dev server on localhost:5555
bun run build            # Build SvelteKit for production (uses adapter-node)
bun run build:electron   # Compile Electron TypeScript
bun run preview          # Preview production build

# Electron
bun run electron:dev     # Build and run Electron app locally
bun run electron:build   # Build Electron distributable (DMG)
```

## Architecture

### Real-Time Data Flow

```
Browser (EventSource) ←→ /api/stream ←→ SQLite (polling PRAGMA data_version)
```

1. Client connects to `/api/stream` via `EventSource`
2. Server sends initial data with all issues and current `dataVersion`
3. Server polls SQLite every second using `PRAGMA data_version` to detect changes
4. On change, server sends updated issues + recent events to client
5. Client highlights changed cards with animation for 2 seconds

### Key Files

**SvelteKit App:**
- `src/lib/db.ts` - SQLite connection and queries (read-only mode with WAL)
- `src/routes/api/stream/+server.ts` - SSE endpoint that polls for changes
- `src/routes/+page.svelte` - Main dashboard with Kanban board + event feed
- `src/lib/claude-code-manager.ts` - Claude Code CLI download/install/update
- `src/lib/claude-auth.ts` - PTY-based authentication (OAuth without Terminal.app)
- `src/lib/claude-cli.ts` - Claude CLI wrapper for chat sessions
- `src/lib/chat-manager.ts` - Chat session and SSE broadcast management
- `src/hooks.server.ts` - Global error handling and CORS

**Electron Main Process:**
- `electron/main.ts` - Main process entry, window creation, IPC handlers
- `electron/preload.ts` - IPC bridge exposing `window.electronAPI`
- `electron/server-manager.ts` - SvelteKit server lifecycle management
- `electron/preview-manager.ts` - BrowserView for preview with CSP bypass, DevTools, inspector

**Preview Components:**
- `src/components/DevServerPreview.svelte` - Preview container (iframe or BrowserView)
- `src/components/LiveEditMode.svelte` - Full-screen edit mode with chat + preview

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/stream` | SSE stream of live issue updates |
| `/api/issues` | REST endpoint for all issues |
| `/api/events?since=&limit=` | Recent events with pagination |
| `/api/stats` | Issue counts by status + data version |
| `/api/health` | Health check endpoint |
| `/api/claude-code/status` | Check Claude Code installation status |
| `/api/claude-code/install` | Install Claude Code CLI |
| `/api/claude-code/update` | Update Claude Code to latest version |
| `/api/claude-code/login` | Trigger OAuth login flow |
| `/api/projects/[id]/chat` | Create/list chat sessions |
| `/api/projects/[id]/chat/[sessionId]` | Send messages to chat session |
| `/api/projects/[id]/chat/[sessionId]/stream` | SSE stream for chat responses |

### Svelte 5 Patterns

This app uses Svelte 5 runes:
- `$state()` for reactive state
- `$derived()` for computed values
- `$props()` for component props
- `$effect()` for side effects (like EventSource connection)

## Beads Database Schema

The dashboard reads from `../.beads/beads.db`. Key tables:

### issues
Main table with extensive fields:
- **Core**: `id`, `title`, `description`, `status`, `priority` (0-4), `issue_type`
- **Extended**: `design`, `acceptance_criteria`, `notes`, `assignee`
- **Timing**: `estimated_minutes`, `created_at`, `updated_at`, `closed_at`, `due_at`, `defer_until`
- **Hierarchy**: Issues can have parent-child relationships via `dependencies` table
- **Special**: `pinned`, `is_template`, `ephemeral`, `close_reason`

**Status values**: `open`, `in_progress`, `blocked`, `closed`, `deferred`, `tombstone`

**Priority levels**: 0=critical, 1=high, 2=medium, 3=low, 4=backlog

**Issue types**: `task`, `bug`, `feature`, `epic`, `question`, `docs`, `gate`

### dependencies
Links between issues:
- `issue_id` → `depends_on_id` with `type` (e.g., `blocks`, `parent-child`)
- Used for blocker tracking and epic hierarchies

### labels
Many-to-many tags: `issue_id` + `label`

### comments
Discussion threads: `issue_id`, `author`, `text`, `created_at`

### events
Activity log: `issue_id`, `event_type`, `actor`, `old_value`, `new_value`, `comment`

### Useful Views
- `ready_issues` - Open issues with no unresolved blockers
- `blocked_issues` - Issues blocked by other open issues (with `blocked_by_count`)

## Claude Code Integration

The app manages its own Claude Code CLI installation for consistent behavior:

### Managed Installation
- **Location**: `~/.beads-dashboard/bin/claude`
- **Auto-download**: Downloads from Anthropic's GCS bucket on first launch
- **Auto-update**: Checks for updates and can upgrade in-place

### Authentication
- Uses **PTY-based OAuth** via `node-pty` (no Terminal.app popup)
- Auth status checked via **macOS Keychain** (`Claude Code-credentials` service)
- Falls back to Terminal.app if PTY unavailable

### Key Environment Variables (set by Tauri)
- `MANAGED_CLAUDE_PATH` - Path to managed Claude binary (~/.beads-dashboard/bin/claude)

### Auto-Downloaded Tools
All external tools are downloaded on first use to `~/.beads-dashboard/`:
- `node/` - Node.js runtime (for Claude Code and scaffolding)
- `bin/claude` - Claude Code CLI
- `bin/bd` - Beads CLI

### Debug Logging
Production debug logs are written to `~/.beads-dashboard/`:
- `settings.log` - Path resolution
- `claude-cli.log` - CLI session management
- `chat-manager.log` - Chat session handling
- `hooks.log` - Global errors and requests
- `claude-auth.log` - Authentication flow

## Electron Bundling

### Native Modules

Native modules (`better-sqlite3`, `node-pty`) require special handling:

1. **electron-rebuild** - Run after `npm install` to compile for Electron's Node version
2. **extraResources** - Listed in `electron-builder.yml` for bundling in the app

### Currently Bundled Packages

In `electron-builder.yml` under `extraResources`:
- `better-sqlite3` - Native SQLite bindings
- `bindings` / `prebuild-install` / `file-uri-to-path` - Dependencies of better-sqlite3
- `feather-icons` - Icon assets loaded at runtime
- `node-pty` - PTY for Claude authentication
- `yaml` - YAML parser for agent frontmatter
- `tar` - Tarball extraction for Node.js download
- `@isaacs/fs-minipass` / `chownr` / `minipass` / `minizlib` / `yallist` - Dependencies of tar

### Adding New Native Packages

1. **Install the package** - `bun add <package>`
2. **Add to extraResources** - In `electron-builder.yml`:
   ```yaml
   extraResources:
     - from: node_modules/your-package
       to: node_modules/your-package
   ```
3. **Rebuild for Electron** - `npx electron-rebuild`
4. **Test production build** - `bun run electron:build`

### Debugging Bundling Issues

1. **Symptom**: Works in dev, fails in production with "Cannot find package 'X'"
2. **Check logs**: `~/.beads-dashboard/hooks.log` shows the exact error
3. **Add to extraResources**: Include the package and its runtime dependencies

## Electron IPC API

The preload script exposes `window.electronAPI` with these methods:

**Preview Controls:**
- `loadPreview(url)` - Load URL in BrowserView
- `refreshPreview()` - Reload the preview
- `openDevTools()` / `closeDevTools()` - Toggle DevTools for preview
- `enableInspector()` / `disableInspector()` - Element selection mode
- `setPreviewBounds(bounds)` - Position the BrowserView
- `showPreview()` / `hidePreview()` - Toggle BrowserView visibility

**Event Listeners:**
- `onUrlChanged(callback)` - SPA navigation tracking
- `onElementSelected(callback)` - Inspector element selection
- `onTitleChanged(callback)` - Page title updates

**Auto-Updater:**
- `checkForUpdates()` - Check for new version
- `downloadUpdate()` - Download available update
- `installUpdate()` - Quit and install

## Legacy Tauri Files

The `src-tauri/` directory contains legacy Tauri files kept for reference:
- `bin/` - Bundled Node.js binaries (still used by Electron)
- `icons/` - App icons (used by electron-builder)
- `dmg/` - DMG background image (used by electron-builder)
- Other files are legacy and not used by the Electron build

## Releasing the App

The app uses GitHub Actions to build for both Intel (x86_64) and Apple Silicon (ARM) Macs, then uploads to Cloudflare R2.

### Why CI is Required for Multi-Architecture

Local builds only work for your current architecture because native Node modules (`better-sqlite3`, `node-pty`) compile for the current CPU. To support both Intel and ARM Macs, the CI builds on both `macos-13` (Intel) and `macos-latest` (ARM) runners.

### GitHub Actions Workflow

The `.github/workflows/electron-build.yml` workflow:
1. Builds on both Intel (`macos-13`) and ARM (`macos-latest`) macOS runners
2. Installs Apple Developer ID certificate into a temporary keychain
3. Rebuilds native modules for Electron (`electron-rebuild`)
4. Signs all native modules (`.node` files, `spawn-helper`) before packaging
5. Builds the Electron app with electron-builder
6. Notarizes with Apple
7. Creates DMG installers for both architectures
8. Generates `latest-mac.json` for electron-updater
9. Uploads everything to Cloudflare R2

### Triggering a Release

**Option 1: Push a tag**
```bash
git tag v0.2.2
git push origin v0.2.2
```

**Option 2: Manual trigger**
Go to Actions → Electron Build → Run workflow

### Apple Code Signing & Notarization

The app is signed with an Apple Developer ID certificate and notarized.

**Signing Identity:** `Developer ID Application: RETAILER LLC (C7G662Y5QT)`

**Entitlements:** Required for Node.js JIT compilation (`build-resources/entitlements.mac.plist`):
- `com.apple.security.cs.allow-jit` - V8 JIT compiler
- `com.apple.security.cs.disable-library-validation` - Native modules
- `com.apple.security.cs.allow-unsigned-executable-memory` - JIT memory

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with R2 write access |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `APPLE_CERTIFICATE` | Base64-encoded .p12 certificate (Developer ID Application) |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 certificate |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password for notarization |

### Architecture Support

The app includes Node.js binaries for both architectures in `src-tauri/bin/`:
- `node-aarch64-apple-darwin` (ARM)
- `node-x86_64-apple-darwin` (Intel)

Native modules are compiled per-architecture during the CI build using `electron-rebuild`.

## Beads CLI Reference

The `bd` command manages issues. Useful for testing:

```bash
bd ready                    # Show unblocked issues
bd list --status=open       # List by status
bd show <id>                # View issue details
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>
```
