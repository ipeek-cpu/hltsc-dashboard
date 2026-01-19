# BC-EP4: Context Packs via CodeGraph Integration

**Priority**: Medium
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Implement intelligent code context generation using CodeGraph as the primary code intelligence engine. Context packs provide Claude with relevant code snippets, symbol definitions, and dependency information.

---

## Scope

### In Scope
- Context pack data model
- Heuristic-based context generation (fallback)
- CodeGraph integration (when available)
- Context pack UI (view, edit, save)
- Bead-based automatic context
- Token budget management
- Context templates

### Out of Scope
- CodeGraph development (external dependency)
- Full semantic search (future)
- Cross-repository context

---

## Beads

### BC-EP4-001: Define Context Pack Data Model
**Status**: Ready
**Objective**: Define TypeScript interfaces for context packs.

**Acceptance Criteria**:
- [ ] `src/lib/context-pack-types.ts` created
- [ ] ContextPack interface: id, files, symbols, dependencies, config, docs
- [ ] ContextFile: path, content, language, relevance, excerpt info
- [ ] ContextSymbol: name, kind, file, line, signature, docs
- [ ] DependencyEdge: from, to, type (calls/imports/extends)
- [ ] Token count estimates
- [ ] Generation method tracking (codegraph/heuristic/manual)

**Dependencies**: BC-EP0-001

---

### BC-EP4-002: Implement Heuristic Context Generator
**Status**: Ready
**Objective**: Create fallback context generation when CodeGraph unavailable.

**Acceptance Criteria**:
- [ ] `src/lib/context-generator.ts` module
- [ ] Keyword extraction from query/bead
- [ ] File search by keyword (grep)
- [ ] Pattern matching for common file types
- [ ] Include recently modified files
- [ ] Include config files (package.json, tsconfig)
- [ ] Respects token budget
- [ ] Returns ContextPack

**Dependencies**: BC-EP4-001

---

### BC-EP4-003: Bead-Based Context Generation
**Status**: Ready
**Objective**: Auto-generate context when starting work on a bead.

**Acceptance Criteria**:
- [ ] Extract keywords from bead title + acceptance criteria
- [ ] Identify file references in bead description
- [ ] Include related files from epic (if child of epic)
- [ ] Pull context from previous sessions on same bead
- [ ] Suggest files but allow user override
- [ ] Cache generated context per bead

**Dependencies**: BC-EP4-002

---

### BC-EP4-004: Context Pack Viewer
**Status**: Ready
**Objective**: Display context pack contents in UI.

**Acceptance Criteria**:
- [ ] Collapsible panel in chat area
- [ ] Shows: file count, estimated tokens
- [ ] List of included files with sizes
- [ ] Expand file to see content preview
- [ ] Indicates full vs excerpt
- [ ] "Remove" button per file
- [ ] "Add files" button

**Dependencies**: BC-EP4-001

---

### BC-EP4-005: Context Pack Editor
**Status**: Ready
**Objective**: Allow manual editing of context pack.

**Acceptance Criteria**:
- [ ] File browser to add files
- [ ] Search files by name/content
- [ ] Add/remove files
- [ ] Set excerpt lines (start-end)
- [ ] Show token budget and usage
- [ ] Warning when over budget
- [ ] Save as template option

**Dependencies**: BC-EP4-004

---

### BC-EP4-006: Token Budget Management
**Status**: Ready
**Objective**: Enforce token limits on context packs.

**Acceptance Criteria**:
- [ ] Token counting function (approximate)
- [ ] Default budgets: quick (2K), standard (10K), deep (25K)
- [ ] Budget selector in UI
- [ ] Auto-truncation when over budget
- [ ] Truncation priority: relevance score based
- [ ] Warning before truncation
- [ ] Show what was truncated

**Dependencies**: BC-EP4-002

---

### BC-EP4-007: Context Templates
**Status**: Ready
**Objective**: Allow saving and reusing context configurations.

**Acceptance Criteria**:
- [ ] Save current context as template
- [ ] Template name and description
- [ ] Templates stored in .beads/context-templates/
- [ ] Load template from dropdown
- [ ] Project-specific templates
- [ ] "Auth files" template auto-created
- [ ] "API routes" template auto-created

**Dependencies**: BC-EP4-005

---

### BC-EP4-008: CodeGraph Integration Layer
**Status**: Ready
**Objective**: Create abstraction layer for CodeGraph integration.

**Acceptance Criteria**:
- [ ] `src/lib/codegraph-client.ts` interface
- [ ] Query symbols by name
- [ ] Query callers/callees of function
- [ ] Get type definitions
- [ ] Check CodeGraph availability
- [ ] Fallback to heuristic when unavailable
- [ ] Timeout handling

**Dependencies**: BC-EP4-001

---

### BC-EP4-009: Symbol-Based Context
**Status**: Ready
**Objective**: Include relevant symbols in context pack.

**Acceptance Criteria**:
- [ ] Extract symbols from included files
- [ ] Include type definitions for used types
- [ ] Include function signatures for called functions
- [ ] Symbol summary section in context pack
- [ ] Configurable depth (just this file vs dependencies)
- [ ] Works with heuristic extraction (simple regex)

**Dependencies**: BC-EP4-008

---

### BC-EP4-010: Context Pack Storage
**Status**: Ready
**Objective**: Persist context packs with sessions.

**Acceptance Criteria**:
- [ ] Context pack snapshot saved in session folder
- [ ] .beads/sessions/{id}/context.json
- [ ] Restored when viewing session history
- [ ] Compare current context to session context
- [ ] "Restore context" option for old sessions

**Dependencies**: BC-EP4-001, BC-EP2-002

---

### BC-EP4-011: Inject Context to Claude
**Status**: Ready
**Objective**: Prepend context pack to Claude prompts.

**Acceptance Criteria**:
- [ ] Format context as XML/markdown for Claude
- [ ] Include file contents with path markers
- [ ] Include symbol summaries
- [ ] Respect token budget
- [ ] Option to attach context to single message vs all
- [ ] Clear context option

**Dependencies**: BC-EP3-004

---

### BC-EP4-012: Context Suggestions
**Status**: Ready
**Objective**: Suggest relevant files during conversation.

**Acceptance Criteria**:
- [ ] Analyze Claude's responses for file references
- [ ] Suggest adding mentioned but not included files
- [ ] "Add to context" button on suggestions
- [ ] Suggestions panel (collapsible)
- [ ] Learn from user accept/reject patterns (local only)

**Dependencies**: BC-EP4-002, BC-EP3-003

---

## Verification

After completing this epic:
1. Context packs can be generated from beads automatically
2. Manual editing allows adding/removing files
3. Token budgets are enforced
4. Context templates can be saved and reused
5. Context is injected into Claude prompts
6. CodeGraph integration ready (when CodeGraph available)
