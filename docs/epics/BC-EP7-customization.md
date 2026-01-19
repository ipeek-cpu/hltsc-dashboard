# BC-EP7: Customization, Agents, Settings, FAQ

**Priority**: Low
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Provide comprehensive customization options, agent management, settings UI, and help resources. Enable users to tailor Beads Console to their workflow.

---

## Scope

### In Scope
- Settings page organization
- Agent management (view, create, edit)
- Global vs project agents
- Keyboard shortcuts
- Theme preferences
- Storage management
- In-app help/FAQ
- About/version info

### Out of Scope
- Plugin system
- Custom themes (beyond dark/light)
- Agent marketplace

---

## Beads

### BC-EP7-001: Settings Page Structure
**Status**: Ready
**Objective**: Organize settings into logical sections.

**Acceptance Criteria**:
- [ ] Settings route: /settings
- [ ] Sections: General, Claude, Agents, Storage, About
- [ ] Sidebar navigation within settings
- [ ] Settings persist to localStorage + optional file
- [ ] Reset to defaults option
- [ ] Changes apply immediately

**Dependencies**: BC-EP0-001

---

### BC-EP7-002: General Settings
**Status**: Ready
**Objective**: Basic application preferences.

**Acceptance Criteria**:
- [ ] Theme: light, dark, system
- [ ] Sidebar position: left, right
- [ ] Default Kanban columns visible
- [ ] SSE polling interval
- [ ] Stale bead thresholds
- [ ] Sound notifications toggle

**Dependencies**: BC-EP7-001

---

### BC-EP7-003: Claude Settings
**Status**: Ready
**Objective**: Claude CLI configuration.

**Acceptance Criteria**:
- [ ] Auth status display
- [ ] Sign in / Sign out buttons
- [ ] Claude CLI version display
- [ ] Update CLI button
- [ ] Restart CLI button
- [ ] CLI path display
- [ ] Log file link

**Dependencies**: BC-EP7-001, BC-EP3-002

---

### BC-EP7-004: Agent List View
**Status**: Ready
**Objective**: Display all available agents.

**Acceptance Criteria**:
- [ ] Agents section in settings
- [ ] List: global agents, project agents
- [ ] Card: name, description, source (global/project)
- [ ] Project agents show override indicator
- [ ] Click to view/edit
- [ ] "New Agent" button

**Dependencies**: BC-EP7-001

---

### BC-EP7-005: Agent Detail/Edit View
**Status**: Ready
**Objective**: View and edit agent definitions.

**Acceptance Criteria**:
- [ ] Agent detail sheet
- [ ] Show: name, description, full prompt
- [ ] Edit mode with markdown editor
- [ ] YAML frontmatter editor
- [ ] Preview rendered markdown
- [ ] Save changes
- [ ] Delete agent (with confirmation)

**Dependencies**: BC-EP7-004

---

### BC-EP7-006: Create New Agent
**Status**: Ready
**Objective**: UI for creating custom agents.

**Acceptance Criteria**:
- [ ] "New Agent" opens creation modal
- [ ] Choose location: global or project
- [ ] Name and filename
- [ ] Description
- [ ] Prompt template with examples
- [ ] Save creates .md file in appropriate directory
- [ ] Agent immediately available

**Dependencies**: BC-EP7-004

---

### BC-EP7-007: Built-in Agent Templates
**Status**: Ready
**Objective**: Provide starter templates for common agent types.

**Acceptance Criteria**:
- [ ] Templates: Planner, Executor, Reviewer, Code Writer, Researcher
- [ ] Template selector in new agent modal
- [ ] Each template has: name, description, prompt
- [ ] Customizable after selection
- [ ] "Start from scratch" option

**Dependencies**: BC-EP7-006

---

### BC-EP7-008: Keyboard Shortcuts
**Status**: Ready
**Objective**: Configurable keyboard shortcuts.

**Acceptance Criteria**:
- [ ] Shortcuts section in settings
- [ ] Default shortcuts for common actions
- [ ] Shortcuts: new session, toggle chat, focus search, etc.
- [ ] Edit shortcut by clicking and pressing new key
- [ ] Reset to defaults
- [ ] Conflict detection

**Dependencies**: BC-EP7-001

---

### BC-EP7-009: Storage Management
**Status**: Ready
**Objective**: View and manage local storage usage.

**Acceptance Criteria**:
- [ ] Storage section in settings
- [ ] Show: sessions, activity logs, context packs
- [ ] Size per category
- [ ] Total storage used
- [ ] Clear old data buttons
- [ ] Retention settings

**Dependencies**: BC-EP7-001, BC-EP5-012

---

### BC-EP7-010: In-App Help
**Status**: Ready
**Objective**: Provide help resources within the app.

**Acceptance Criteria**:
- [ ] Help button in sidebar (?)
- [ ] FAQ page with common questions
- [ ] Searchable FAQ
- [ ] Glossary of terms
- [ ] Link to documentation
- [ ] Link to report issues

**Dependencies**: BC-EP7-001

---

### BC-EP7-011: About Page
**Status**: Ready
**Objective**: Show version and credit information.

**Acceptance Criteria**:
- [ ] About section in settings
- [ ] App version
- [ ] Electron version
- [ ] Claude CLI version
- [ ] Check for updates button
- [ ] Links: GitHub, documentation
- [ ] Credits/acknowledgments

**Dependencies**: BC-EP7-001

---

### BC-EP7-012: Prompt Editor Component
**Status**: Ready
**Objective**: Reusable markdown editor for prompts.

**Acceptance Criteria**:
- [ ] `src/components/PromptEditor.svelte`
- [ ] Markdown editing with syntax highlighting
- [ ] YAML frontmatter support
- [ ] Preview toggle
- [ ] Variable insertion helpers
- [ ] Auto-save draft
- [ ] Undo/redo

**Dependencies**: BC-EP7-005

---

## Verification

After completing this epic:
1. Settings are organized and accessible
2. All agents (global + project) visible and editable
3. New agents can be created from templates
4. Keyboard shortcuts are configurable
5. Storage usage is visible and manageable
6. Help/FAQ is accessible in-app
7. Version info and update check available
