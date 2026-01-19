# BC-EP3: Claude CLI Side-by-Side Integration (PTY + Streaming)

**Priority**: Critical
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Integrate Claude Code CLI as the primary AI interface, providing real-time streaming responses via PTY. Enable side-by-side view with Kanban board for seamless workflow.

---

## Scope

### In Scope
- Claude CLI process management
- PTY-based communication for real streaming
- Chat panel UI with streaming messages
- Agent prompt injection
- Tool call display
- Chat input with markdown support
- Error handling and recovery
- Authentication flow

### Out of Scope
- Session persistence (covered in EP2)
- Context pack generation (see EP4)
- Custom model selection (future)

---

## Beads

### BC-EP3-001: Claude CLI Process Manager
**Status**: Ready
**Objective**: Manage Claude CLI process lifecycle for chat sessions.

**Acceptance Criteria**:
- [ ] `src/lib/claude-cli.ts` manages CLI processes
- [ ] Start process with agent prompt injection
- [ ] PTY-based for real streaming (not buffered)
- [ ] Process pool: one process per active session
- [ ] Graceful shutdown on session end
- [ ] Force kill with timeout if unresponsive
- [ ] Detect crashed processes and notify

**Dependencies**: BC-EP0-001

---

### BC-EP3-002: Claude CLI Authentication
**Status**: Ready
**Objective**: Handle Claude authentication through the CLI.

**Acceptance Criteria**:
- [ ] Detect auth status via macOS Keychain check
- [ ] "Sign in with Claude" button when not authenticated
- [ ] OAuth flow via PTY (no Terminal.app popup)
- [ ] Auth success notification
- [ ] Auth expiry detection
- [ ] Re-auth prompt before expiry
- [ ] Auth status in system health panel

**Dependencies**: BC-EP3-001

---

### BC-EP3-003: Chat Panel Component
**Status**: Ready
**Objective**: Create the main chat panel for Claude interaction.

**Acceptance Criteria**:
- [ ] `src/components/ChatSheet.svelte` (existing, enhanced)
- [ ] Message list with user/assistant bubbles
- [ ] Real-time streaming display
- [ ] Markdown rendering in messages
- [ ] Code blocks with syntax highlighting
- [ ] Copy code button
- [ ] Scroll to bottom on new messages
- [ ] Loading indicator during response

**Dependencies**: BC-EP3-001

---

### BC-EP3-004: Chat Input Component
**Status**: Ready
**Objective**: Create the input area for sending messages to Claude.

**Acceptance Criteria**:
- [ ] Textarea with auto-resize
- [ ] Send button (and Enter to send, Shift+Enter for newline)
- [ ] Disabled during streaming response
- [ ] Character count indicator
- [ ] Markdown preview toggle
- [ ] Paste image support (converts to base64)
- [ ] Command shortcuts (/, @)

**Dependencies**: BC-EP3-003

---

### BC-EP3-005: Tool Call Display
**Status**: Ready
**Objective**: Show Claude's tool usage in a clear, collapsible format.

**Acceptance Criteria**:
- [ ] Tool calls shown inline in message stream
- [ ] Collapsible card for each tool call
- [ ] Shows: tool name, input summary, output summary
- [ ] Syntax highlighting for code in inputs/outputs
- [ ] Duration indicator
- [ ] Error state with red highlight
- [ ] Click to expand full details

**Dependencies**: BC-EP3-003

---

### BC-EP3-006: Agent Prompt Injection
**Status**: Ready
**Objective**: Inject selected agent prompt when starting CLI.

**Acceptance Criteria**:
- [ ] Agent selector in session creation
- [ ] Agent prompt loaded from .claude/agents/
- [ ] Prompt injected as system message
- [ ] Agent indicator shown in chat panel
- [ ] Switch agent mid-session option (starts new CLI)
- [ ] "No agent" option uses default Claude behavior

**Dependencies**: BC-EP3-001

---

### BC-EP3-007: Stream Processing
**Status**: Ready
**Objective**: Parse and process Claude CLI stdout stream.

**Acceptance Criteria**:
- [ ] Parse streaming JSON from CLI
- [ ] Handle partial JSON (buffering)
- [ ] Detect message start/end boundaries
- [ ] Extract tool calls from stream
- [ ] Handle control characters (ANSI codes)
- [ ] Emit events: message_chunk, tool_call, complete
- [ ] Error detection in stream

**Dependencies**: BC-EP3-001

---

### BC-EP3-008: Error Handling and Recovery
**Status**: Ready
**Objective**: Handle CLI errors gracefully.

**Acceptance Criteria**:
- [ ] Detect process crash
- [ ] Show error message in chat panel
- [ ] "Retry" button for transient errors
- [ ] "Restart Session" for fatal errors
- [ ] Rate limit detection and backoff
- [ ] Network error detection
- [ ] Auth error triggers re-auth flow

**Dependencies**: BC-EP3-003

---

### BC-EP3-009: Side-by-Side Layout
**Status**: Ready
**Objective**: Enable Kanban and chat side-by-side.

**Acceptance Criteria**:
- [ ] Resizable split pane
- [ ] Toggle: full Kanban, full chat, split
- [ ] Keyboard shortcut to toggle (Cmd+/)
- [ ] Remember layout preference
- [ ] Collapse chat to sidebar button
- [ ] Minimum widths for each pane

**Dependencies**: BC-EP3-003

---

### BC-EP3-010: Chat History Display
**Status**: Ready
**Objective**: Load and display existing messages when viewing session.

**Acceptance Criteria**:
- [ ] Load messages.jsonl on session open
- [ ] Display in chronological order
- [ ] Streaming indicator for last message if incomplete
- [ ] Scroll position remembered per session
- [ ] "Jump to latest" button if scrolled up
- [ ] Performance: virtualized list for long sessions

**Dependencies**: BC-EP3-003, BC-EP2-002

---

### BC-EP3-011: Interrupt/Cancel
**Status**: Ready
**Objective**: Allow interrupting Claude's response.

**Acceptance Criteria**:
- [ ] Cancel button appears during streaming
- [ ] Sends interrupt signal to CLI (Ctrl+C)
- [ ] Partial response preserved
- [ ] Message marked as interrupted
- [ ] User can send new message after cancel
- [ ] No orphaned processes

**Dependencies**: BC-EP3-007

---

### BC-EP3-012: Message Actions
**Status**: Ready
**Objective**: Provide actions on individual messages.

**Acceptance Criteria**:
- [ ] Copy message content
- [ ] Copy code block (individual)
- [ ] Regenerate response (for last assistant message)
- [ ] Edit and resend (for user messages)
- [ ] Delete message from view (not from storage)
- [ ] Hover to reveal action buttons

**Dependencies**: BC-EP3-003

---

## Verification

After completing this epic:
1. Claude CLI starts reliably with agent prompts
2. Streaming responses appear in real-time
3. Tool calls are displayed clearly
4. Errors are handled gracefully with recovery options
5. Side-by-side layout works smoothly
6. Can interrupt long responses
7. Chat history loads correctly on session resume
