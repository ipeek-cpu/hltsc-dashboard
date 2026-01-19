# Beads Console Context Pack Specification

**Version**: 1.0
**Date**: 2026-01-19

---

## Overview

Context Packs are curated collections of code context that help Claude understand your codebase and provide better assistance. They are generated using CodeGraph (or simpler heuristics as a fallback) and attached to sessions.

---

## What is a Context Pack?

A Context Pack includes:

1. **Relevant source files** (full or excerpted)
2. **Symbol definitions** (functions, classes, types)
3. **Dependency graph** (what calls what)
4. **Configuration files** (package.json, tsconfig, etc.)
5. **Documentation** (README, CLAUDE.md)

The goal is to give Claude enough context to:
- Understand existing patterns
- Make consistent changes
- Avoid breaking dependencies
- Follow project conventions

---

## Context Pack Structure

```typescript
interface ContextPack {
  // Identity
  id: string;
  created_at: string;

  // Scope
  project_id: string;
  bead_id?: string;              // If generated for a specific bead
  query?: string;                // User query that triggered generation

  // Content
  files: ContextFile[];
  symbols: ContextSymbol[];
  dependencies: DependencyEdge[];
  config: ConfigFile[];
  docs: DocFile[];

  // Metadata
  generation_method: 'codegraph' | 'heuristic' | 'manual';
  total_tokens: number;          // Estimated token count
  truncated: boolean;            // If content was trimmed for size
}

interface ContextFile {
  path: string;
  content: string;               // May be truncated
  language: string;
  relevance_score: number;       // 0-1, how relevant to query
  excerpt_only: boolean;         // If only showing part of file
  line_start?: number;           // If excerpt, start line
  line_end?: number;             // If excerpt, end line
}

interface ContextSymbol {
  name: string;
  kind: 'function' | 'class' | 'type' | 'interface' | 'variable' | 'constant';
  file_path: string;
  line: number;
  signature?: string;            // e.g., "function foo(a: string): number"
  documentation?: string;        // JSDoc/docstring
}

interface DependencyEdge {
  from_symbol: string;
  to_symbol: string;
  type: 'calls' | 'imports' | 'extends' | 'implements' | 'uses';
}

interface ConfigFile {
  path: string;
  content: string;
}

interface DocFile {
  path: string;
  content: string;
}
```

---

## Context Pack Generation

### Method 1: CodeGraph (Preferred)

CodeGraph provides semantic code analysis:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CodeGraph Query                              │
│                                                                  │
│  Input: Bead acceptance criteria or user query                   │
│                                                                  │
│  1. Parse query for keywords and intent                         │
│  2. Search symbol index for matches                              │
│  3. Expand to include dependencies (callers, callees)           │
│  4. Include type definitions                                    │
│  5. Add configuration files if relevant                         │
│  6. Truncate to fit token budget                                │
│                                                                  │
│  Output: ContextPack                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Method 2: Heuristic (Fallback)

When CodeGraph is unavailable:

1. **Keyword search**: Grep for terms from bead/query
2. **File pattern matching**: Include files matching patterns (e.g., `**/auth/**`)
3. **Recent files**: Include recently modified files
4. **Convention-based**: Include common config files

### Method 3: Manual

User explicitly selects files:

```
┌────────────────────────────────────────────┐
│  Select Context Files                      │
├────────────────────────────────────────────┤
│  ☑ src/lib/auth.ts                        │
│  ☑ src/routes/login/+page.svelte          │
│  ☐ src/routes/+layout.svelte              │
│  ☑ src/lib/types.ts                       │
│                                            │
│  Estimated tokens: 4,200                   │
│  [Add Selected]                            │
└────────────────────────────────────────────┘
```

---

## Context Pack UI

### In Chat Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Context Pack (4 files, ~3,200 tokens)              [Edit] [×]  │
├─────────────────────────────────────────────────────────────────┤
│  📄 src/lib/auth.ts (full)                                      │
│  📄 src/lib/types.ts (lines 45-120)                            │
│  📄 src/routes/login/+page.svelte (full)                       │
│  📄 package.json (config)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Context Pack Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Context Pack                                    [Save]    │
├─────────────────────────────────────────────────────────────────┤
│  Search: [auth____________] [🔍]                                │
│                                                                  │
│  Included Files:                                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ src/lib/auth.ts           1,200 tokens         [Remove]   │ │
│  │ src/lib/types.ts (45-120)   800 tokens         [Remove]   │ │
│  │ src/routes/login/+page.svelte 900 tokens       [Remove]   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Suggested Files:                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ src/hooks.server.ts       600 tokens           [Add]      │ │
│  │ src/lib/session.ts        400 tokens           [Add]      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Total: 2,900 tokens (budget: 10,000)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Token Budget Management

### Default Budgets

| Context Type | Token Budget |
|--------------|--------------|
| Quick question | 2,000 |
| Standard session | 10,000 |
| Deep dive | 25,000 |
| Custom | User-defined |

### Truncation Strategy

When content exceeds budget:

1. **Prioritize by relevance score**: Keep highest-scoring files
2. **Excerpt over full**: Show relevant lines only
3. **Symbols over implementation**: Keep signatures, trim bodies
4. **Required files last to cut**: Keep config, types, docs

---

## Bead-Based Context

When starting work on a bead, context is auto-generated from:

1. **Acceptance criteria**: Extract keywords and file references
2. **Related beads**: Include context from parent epic
3. **Recent sessions**: Reuse context from past sessions on same bead

Example:

```
Bead: "Add email validation to signup form"

Acceptance Criteria:
- Validate email format before submit
- Show inline error message
- Prevent submission if invalid

Auto-generated context includes:
- src/routes/signup/+page.svelte (contains signup form)
- src/lib/validation.ts (existing validation utilities)
- src/lib/types.ts (form types)
```

---

## Context Pack Storage

### Per-Session

Each session stores its context pack snapshot:

```
.beads/sessions/{session-id}/
└── context.json          # ContextPack snapshot
```

### Reusable Templates

Users can save context pack templates:

```
.beads/context-templates/
├── auth.json             # Auth-related files
├── api.json              # API routes and types
└── ui-components.json    # Component library
```

---

## Integration with Claude CLI

When sending a message to Claude, context is prepended:

```
<context_pack>
<file path="src/lib/auth.ts">
// ... file content ...
</file>
<file path="src/lib/types.ts" lines="45-120">
// ... excerpt ...
</file>
<symbols>
- function validateEmail(email: string): boolean (src/lib/validation.ts:23)
- interface User { ... } (src/lib/types.ts:45)
</symbols>
</context_pack>

User message: How should I add email validation to the signup form?
```

---

## Future: CodeGraph Deep Integration

When CodeGraph is fully integrated:

### Automatic Context

- Query CodeGraph on every message
- Include relevant symbols automatically
- No manual file selection needed

### Impact Analysis

- Before making changes, show what will be affected
- "This change impacts 5 files and 12 functions"

### Semantic Search

- "Find all places where we validate user input"
- Returns symbols, not just text matches

### Refactoring Support

- "Rename this function" → auto-update all call sites
- "Extract this to a util" → auto-update imports
