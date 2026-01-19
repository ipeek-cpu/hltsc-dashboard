# Beads Console Project Profiles Specification

**Version**: 1.0
**Date**: 2026-01-19

---

## Overview

Project Profiles define project-type-specific configurations, quick actions, and context defaults. They help Beads Console understand the structure and conventions of different technology stacks.

---

## Built-in Profiles

### iOS Profile

For Swift/SwiftUI iOS applications.

```typescript
const iosProfile: ProjectProfile = {
  id: 'ios',
  name: 'iOS App',
  icon: 'apple',

  detection: {
    // Auto-detect if these exist
    files: ['*.xcodeproj', '*.xcworkspace', 'Package.swift'],
    patterns: ['**/*.swift']
  },

  quickActions: [
    {
      id: 'build',
      name: 'Build',
      icon: 'hammer',
      command: 'xcodebuild -scheme {scheme} -configuration Debug build'
    },
    {
      id: 'test',
      name: 'Test',
      icon: 'play',
      command: 'xcodebuild -scheme {scheme} -configuration Debug test'
    },
    {
      id: 'simulator',
      name: 'Run Simulator',
      icon: 'device-mobile',
      command: 'open -a Simulator && xcrun simctl boot {device}'
    },
    {
      id: 'lint',
      name: 'SwiftLint',
      icon: 'check',
      command: 'swiftlint lint --reporter html > lint-report.html'
    }
  ],

  previewConfig: {
    type: 'simulator',
    defaultDevice: 'iPhone 15 Pro',
    orientations: ['portrait', 'landscape']
  },

  contextDefaults: {
    includePatterns: [
      '**/*.swift',
      '**/Info.plist',
      '**/Package.swift',
      '**/project.pbxproj'
    ],
    excludePatterns: [
      '**/DerivedData/**',
      '**/.build/**',
      '**/Pods/**'
    ]
  },

  conventions: {
    branchPrefix: 'feat/ios-',
    testFilePattern: '*Tests.swift',
    configFiles: ['Info.plist', 'Package.swift']
  }
};
```

### Web Profile

For TypeScript/JavaScript web applications.

```typescript
const webProfile: ProjectProfile = {
  id: 'web',
  name: 'Web App',
  icon: 'globe',

  detection: {
    files: ['package.json', 'tsconfig.json', 'vite.config.*'],
    patterns: ['**/*.tsx', '**/*.svelte', '**/*.vue']
  },

  quickActions: [
    {
      id: 'dev',
      name: 'Dev Server',
      icon: 'play',
      command: 'npm run dev',
      persistent: true  // Runs until stopped
    },
    {
      id: 'build',
      name: 'Build',
      icon: 'hammer',
      command: 'npm run build'
    },
    {
      id: 'test',
      name: 'Test',
      icon: 'check-circle',
      command: 'npm test'
    },
    {
      id: 'lint',
      name: 'Lint',
      icon: 'check',
      command: 'npm run lint'
    },
    {
      id: 'storybook',
      name: 'Storybook',
      icon: 'book',
      command: 'npm run storybook',
      persistent: true
    },
    {
      id: 'typecheck',
      name: 'Type Check',
      icon: 'code',
      command: 'npm run typecheck || npx tsc --noEmit'
    }
  ],

  previewConfig: {
    type: 'browser',
    defaultUrl: 'http://localhost:5173',
    storybookUrl: 'http://localhost:6006'
  },

  contextDefaults: {
    includePatterns: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.svelte',
      '**/*.vue',
      '**/package.json',
      '**/tsconfig.json'
    ],
    excludePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**'
    ]
  },

  conventions: {
    branchPrefix: 'feat/',
    testFilePattern: '*.test.{ts,tsx}',
    configFiles: ['package.json', 'tsconfig.json', 'vite.config.ts']
  }
};
```

### Infra Profile

For infrastructure-as-code and DevOps.

```typescript
const infraProfile: ProjectProfile = {
  id: 'infra',
  name: 'Infrastructure',
  icon: 'server',

  detection: {
    files: ['terraform.tf', 'Dockerfile', 'docker-compose.yml', '.github/workflows/*'],
    patterns: ['**/*.tf', '**/Dockerfile*']
  },

  quickActions: [
    {
      id: 'terraform-plan',
      name: 'Terraform Plan',
      icon: 'eye',
      command: 'terraform plan -out=tfplan'
    },
    {
      id: 'terraform-apply',
      name: 'Terraform Apply',
      icon: 'rocket',
      command: 'terraform apply tfplan',
      dangerous: true  // Requires confirmation
    },
    {
      id: 'docker-build',
      name: 'Docker Build',
      icon: 'box',
      command: 'docker build -t {image_name} .'
    },
    {
      id: 'docker-compose-up',
      name: 'Compose Up',
      icon: 'play',
      command: 'docker-compose up -d',
      persistent: true
    },
    {
      id: 'validate-workflows',
      name: 'Validate Workflows',
      icon: 'check',
      command: 'actionlint .github/workflows/*.yml'
    }
  ],

  previewConfig: {
    type: 'none'  // No preview for infra
  },

  contextDefaults: {
    includePatterns: [
      '**/*.tf',
      '**/Dockerfile*',
      '**/docker-compose*.yml',
      '**/.github/workflows/*.yml',
      '**/Makefile'
    ],
    excludePatterns: [
      '**/.terraform/**',
      '**/terraform.tfstate*'
    ]
  },

  conventions: {
    branchPrefix: 'infra/',
    testFilePattern: '*_test.go',
    configFiles: ['terraform.tf', 'docker-compose.yml']
  }
};
```

---

## Profile Data Model

```typescript
interface ProjectProfile {
  id: string;
  name: string;
  icon: string;

  detection: {
    files: string[];      // Files that indicate this profile
    patterns: string[];   // Glob patterns that indicate this profile
  };

  quickActions: QuickAction[];

  previewConfig: {
    type: 'browser' | 'simulator' | 'terminal' | 'none';
    defaultUrl?: string;
    storybookUrl?: string;
    defaultDevice?: string;
    orientations?: string[];
  };

  contextDefaults: {
    includePatterns: string[];
    excludePatterns: string[];
  };

  conventions: {
    branchPrefix: string;
    testFilePattern: string;
    configFiles: string[];
  };
}

interface QuickAction {
  id: string;
  name: string;
  icon: string;
  command: string;
  persistent?: boolean;   // Long-running command
  dangerous?: boolean;    // Requires confirmation
  variables?: Variable[]; // User-configurable parts
}

interface Variable {
  name: string;
  label: string;
  type: 'string' | 'select';
  default?: string;
  options?: string[];     // For select type
}
```

---

## Profile Detection

When adding a project, Beads Console auto-detects the profile:

```typescript
async function detectProfile(projectPath: string): Promise<ProjectProfile | null> {
  const profiles = [iosProfile, webProfile, infraProfile];

  for (const profile of profiles) {
    // Check for detection files
    for (const filePattern of profile.detection.files) {
      const matches = await glob(filePattern, { cwd: projectPath });
      if (matches.length > 0) {
        return profile;
      }
    }

    // Check for detection patterns
    for (const pattern of profile.detection.patterns) {
      const matches = await glob(pattern, { cwd: projectPath, limit: 1 });
      if (matches.length > 0) {
        return profile;
      }
    }
  }

  return null;  // No profile detected
}
```

---

## Quick Actions UI

### Project Header

```
┌─────────────────────────────────────────────────────────────────┐
│  My iOS App                                            [⚙️]     │
│  iOS App • /Users/dev/projects/my-app                          │
├─────────────────────────────────────────────────────────────────┤
│  [🔨 Build] [▶️ Test] [📱 Simulator] [✓ Lint]                   │
└─────────────────────────────────────────────────────────────────┘
```

### Action Panel (Expanded)

```
┌─────────────────────────────────────────────────────────────────┐
│  Quick Actions                                         [Edit]   │
├─────────────────────────────────────────────────────────────────┤
│  🔨 Build                                           [Run]      │
│     xcodebuild -scheme MyApp -configuration Debug build         │
│                                                                  │
│  ▶️ Test                                            [Run]      │
│     xcodebuild -scheme MyApp -configuration Debug test          │
│                                                                  │
│  📱 Simulator                                      [Running]    │
│     iPhone 15 Pro • Running                        [Stop]       │
│                                                                  │
│  ✓ Lint                                 Last: 2 warnings       │
│     swiftlint lint                                  [Run]       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Custom Profiles

Users can create custom profiles:

```json
// .beads/profile.json
{
  "extends": "web",
  "quickActions": [
    {
      "id": "deploy-staging",
      "name": "Deploy Staging",
      "icon": "rocket",
      "command": "npm run deploy:staging",
      "dangerous": true
    }
  ],
  "previewConfig": {
    "type": "browser",
    "defaultUrl": "http://localhost:3000",
    "storybookUrl": "http://localhost:6006"
  },
  "contextDefaults": {
    "includePatterns": [
      "src/**/*.ts",
      "src/**/*.svelte"
    ]
  }
}
```

---

## Profile Integration Points

### 1. Bead Context

When generating context for a bead, use profile's `contextDefaults`:

```typescript
function generateBeadContext(bead: Bead, profile: ProjectProfile): ContextPack {
  const relevantFiles = await glob(profile.contextDefaults.includePatterns, {
    ignore: profile.contextDefaults.excludePatterns
  });
  // ... generate context pack
}
```

### 2. Branch Suggestions

When claiming a bead, suggest branch name using profile conventions:

```typescript
function suggestBranchName(bead: Bead, profile: ProjectProfile): string {
  const slug = slugify(bead.title);
  return `${profile.conventions.branchPrefix}${bead.id}-${slug}`;
}
// iOS: feat/ios-BC-001-add-login-screen
// Web: feat/BC-001-add-login-form
```

### 3. Preview

Use profile's `previewConfig` to show appropriate preview:

```typescript
function getPreviewUrl(profile: ProjectProfile, mode: 'default' | 'storybook'): string | null {
  if (profile.previewConfig.type === 'none') return null;
  return mode === 'storybook'
    ? profile.previewConfig.storybookUrl
    : profile.previewConfig.defaultUrl;
}
```

---

## Future Enhancements

### Multi-Profile Projects

Some projects span multiple technologies:

```json
{
  "profiles": ["ios", "web"],
  "defaultProfile": "web"
}
```

### Profile Marketplace

Share profiles with the community:

```bash
beads profile install @company/react-native-profile
```

### AI-Generated Actions

Let Claude suggest quick actions based on project structure:

```
Claude: I noticed you have a `Makefile` with a `deploy` target.
Would you like me to add a "Deploy" quick action?
```
