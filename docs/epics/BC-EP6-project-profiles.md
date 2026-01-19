# BC-EP6: Project Profiles + Quick Actions (iOS/Web/Infra)

**Priority**: Low
**Status**: Ready for Planning
**Created**: 2026-01-19

---

## Objective

Define project-type-specific configurations that provide appropriate defaults, quick actions, and context settings. Support iOS, Web, and Infrastructure project types out of the box.

---

## Scope

### In Scope
- Project profile data model
- Profile detection (auto and manual)
- Quick actions system
- Built-in profiles (iOS, Web, Infra)
- Custom profile support
- Preview configuration per profile
- Context defaults per profile

### Out of Scope
- Profile marketplace/sharing
- Multi-profile projects
- Xcode/IDE integration

---

## Beads

### BC-EP6-001: Define Project Profile Data Model
**Status**: Ready
**Objective**: Define TypeScript interfaces for project profiles.

**Acceptance Criteria**:
- [ ] `src/lib/project-profile-types.ts` created
- [ ] ProjectProfile interface: id, name, icon, detection, quickActions, previewConfig, contextDefaults, conventions
- [ ] QuickAction interface: id, name, icon, command, persistent?, dangerous?, variables?
- [ ] Detection rules: files and patterns to match
- [ ] Conventions: branch prefix, test patterns, config files

**Dependencies**: BC-EP0-001

---

### BC-EP6-002: Profile Detection System
**Status**: Ready
**Objective**: Auto-detect project type when adding a project.

**Acceptance Criteria**:
- [ ] `src/lib/profile-detection.ts` module
- [ ] detectProfile(projectPath): ProfileId | null
- [ ] Check for profile-specific files
- [ ] Check for code pattern matches
- [ ] Priority: project .beads/profile.json > auto-detect
- [ ] Fallback to "generic" if no match
- [ ] Detection runs on project add

**Dependencies**: BC-EP6-001

---

### BC-EP6-003: iOS Profile Definition
**Status**: Ready
**Objective**: Define iOS project profile.

**Acceptance Criteria**:
- [ ] Detects: *.xcodeproj, Package.swift, *.swift files
- [ ] Quick actions: Build, Test, Run Simulator, SwiftLint
- [ ] Preview: Simulator (device selector)
- [ ] Context: include *.swift, Info.plist; exclude DerivedData
- [ ] Conventions: feat/ios-{id}-{slug}, *Tests.swift

**Dependencies**: BC-EP6-001

---

### BC-EP6-004: Web Profile Definition
**Status**: Ready
**Objective**: Define Web project profile.

**Acceptance Criteria**:
- [ ] Detects: package.json, tsconfig.json, vite.config.*
- [ ] Quick actions: Dev Server, Build, Test, Lint, Storybook, Type Check
- [ ] Preview: Browser (default URL), Storybook URL
- [ ] Context: include *.ts, *.tsx, *.svelte; exclude node_modules
- [ ] Conventions: feat/{id}-{slug}, *.test.ts

**Dependencies**: BC-EP6-001

---

### BC-EP6-005: Infra Profile Definition
**Status**: Ready
**Objective**: Define Infrastructure project profile.

**Acceptance Criteria**:
- [ ] Detects: *.tf, Dockerfile, docker-compose.yml, .github/workflows
- [ ] Quick actions: Terraform Plan, Terraform Apply, Docker Build, Compose Up
- [ ] Preview: none
- [ ] Context: include *.tf, Dockerfile, *.yml; exclude .terraform
- [ ] Conventions: infra/{id}-{slug}

**Dependencies**: BC-EP6-001

---

### BC-EP6-006: Quick Actions System
**Status**: Ready
**Objective**: Execute profile-defined quick actions.

**Acceptance Criteria**:
- [ ] `src/lib/quick-actions.ts` module
- [ ] executeQuickAction(action, project): Promise<void>
- [ ] Variable substitution in commands ({scheme}, {device})
- [ ] Persistent actions: start/stop toggle
- [ ] Dangerous actions: confirmation dialog
- [ ] Output captured and displayed
- [ ] Error handling

**Dependencies**: BC-EP6-001

---

### BC-EP6-007: Quick Actions UI
**Status**: Ready
**Objective**: Display and trigger quick actions in UI.

**Acceptance Criteria**:
- [ ] Quick actions bar in project header
- [ ] Icon buttons for each action
- [ ] Tooltip with action name
- [ ] Click to run
- [ ] Running indicator for persistent actions
- [ ] Stop button for persistent actions
- [ ] Last run status indicator

**Dependencies**: BC-EP6-006

---

### BC-EP6-008: Quick Action Output Panel
**Status**: Ready
**Objective**: Show quick action command output.

**Acceptance Criteria**:
- [ ] Collapsible output panel below actions bar
- [ ] Real-time streaming output
- [ ] ANSI color support
- [ ] Clear button
- [ ] Copy output button
- [ ] Auto-scroll to bottom
- [ ] Error highlighting

**Dependencies**: BC-EP6-006

---

### BC-EP6-009: Custom Profile Support
**Status**: Ready
**Objective**: Allow project-specific profile overrides.

**Acceptance Criteria**:
- [ ] .beads/profile.json in project
- [ ] Can extend built-in profile
- [ ] Can add custom quick actions
- [ ] Can override context defaults
- [ ] UI to edit profile (or edit JSON directly)
- [ ] Validation on save

**Dependencies**: BC-EP6-001

---

### BC-EP6-010: Preview Configuration
**Status**: Ready
**Objective**: Configure preview based on profile.

**Acceptance Criteria**:
- [ ] Profile specifies preview type: browser, simulator, none
- [ ] Browser: URL, Storybook URL
- [ ] Simulator: default device, orientations
- [ ] Preview panel respects profile settings
- [ ] User can override URL temporarily
- [ ] Storybook toggle for web projects

**Dependencies**: BC-EP6-001

---

### BC-EP6-011: Context Defaults Application
**Status**: Ready
**Objective**: Apply profile context defaults to context generation.

**Acceptance Criteria**:
- [ ] Profile includePatterns used in context generation
- [ ] Profile excludePatterns respected
- [ ] Profile configFiles always included
- [ ] User can override defaults per session
- [ ] Defaults shown in context editor

**Dependencies**: BC-EP4-002, BC-EP6-001

---

### BC-EP6-012: Branch Name Suggestions
**Status**: Ready
**Objective**: Suggest branch names using profile conventions.

**Acceptance Criteria**:
- [ ] Profile branchPrefix used in claim modal
- [ ] Auto-generate: {prefix}{bead_id}-{slug}
- [ ] Slug generated from bead title
- [ ] User can edit suggestion
- [ ] Remember last used pattern per profile

**Dependencies**: BC-EP1-001, BC-EP6-001

---

## Verification

After completing this epic:
1. Projects auto-detect to iOS/Web/Infra profiles
2. Quick actions work for each profile type
3. Preview configured appropriately per profile
4. Context defaults applied from profile
5. Branch names follow profile conventions
6. Custom profiles can extend built-ins
