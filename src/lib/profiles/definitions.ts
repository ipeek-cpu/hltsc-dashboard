/**
 * Built-in Profile Definitions
 *
 * Pre-configured profiles for common project types.
 */

import type { ProjectProfile } from './types';

/** iOS/macOS Swift project profile */
export const iosProfile: ProjectProfile = {
	id: 'ios',
	name: 'iOS / macOS',
	description: 'Swift and Xcode projects for Apple platforms',
	icon: 'smartphone',
	detectionPatterns: [
		'Package.swift',
		'*.xcodeproj',
		'*.xcworkspace',
		'Podfile',
		'Cartfile'
	],
	quickActions: [
		{
			id: 'build',
			label: 'Build',
			icon: 'package',
			command: 'swift build',
			description: 'Build the Swift package',
			shortcut: 'cmd+b'
		},
		{
			id: 'test',
			label: 'Test',
			icon: 'check-circle',
			command: 'swift test',
			description: 'Run unit tests',
			shortcut: 'cmd+u'
		},
		{
			id: 'lint',
			label: 'Lint',
			icon: 'eye',
			command: 'swiftlint',
			description: 'Run SwiftLint checks'
		},
		{
			id: 'format',
			label: 'Format',
			icon: 'align-left',
			command: 'swift-format format -i -r Sources/',
			description: 'Format Swift files'
		},
		{
			id: 'clean',
			label: 'Clean',
			icon: 'trash-2',
			command: 'swift package clean',
			description: 'Clean build artifacts',
			requiresConfirmation: true
		}
	],
	contextDefaults: {
		includePatterns: [
			'**/*.swift',
			'**/Package.swift',
			'**/*.xib',
			'**/*.storyboard',
			'**/Info.plist'
		],
		excludePatterns: [
			'.build/**',
			'DerivedData/**',
			'Pods/**',
			'Carthage/**',
			'*.xcodeproj/**'
		],
		codeGraphFocus: ['class', 'interface', 'method', 'function']
	},
	suggestedAgents: ['ios-architect', 'swift-expert', 'uikit-specialist', 'swiftui-expert']
};

/** Web frontend project profile (SvelteKit, React, Next.js, etc.) */
export const webProfile: ProjectProfile = {
	id: 'web',
	name: 'Web Frontend',
	description: 'SvelteKit, React, Next.js, and other web projects',
	icon: 'globe',
	detectionPatterns: [
		'svelte.config.js',
		'svelte.config.ts',
		'next.config.js',
		'next.config.ts',
		'vite.config.ts',
		'vite.config.js',
		'nuxt.config.ts',
		'angular.json',
		'package.json'
	],
	quickActions: [
		{
			id: 'dev',
			label: 'Dev Server',
			icon: 'play',
			command: 'bun run dev',
			description: 'Start development server',
			shortcut: 'cmd+d'
		},
		{
			id: 'build',
			label: 'Build',
			icon: 'package',
			command: 'bun run build',
			description: 'Build for production',
			shortcut: 'cmd+b'
		},
		{
			id: 'test',
			label: 'Test',
			icon: 'check-circle',
			command: 'bun test',
			description: 'Run tests',
			shortcut: 'cmd+t'
		},
		{
			id: 'lint',
			label: 'Lint',
			icon: 'eye',
			command: 'bun run lint',
			description: 'Run ESLint'
		},
		{
			id: 'typecheck',
			label: 'Type Check',
			icon: 'file-text',
			command: 'bun run check',
			description: 'Run TypeScript type checking'
		},
		{
			id: 'format',
			label: 'Format',
			icon: 'align-left',
			command: 'bun run format',
			description: 'Format with Prettier'
		}
	],
	contextDefaults: {
		includePatterns: [
			'**/*.svelte',
			'**/*.ts',
			'**/*.tsx',
			'**/*.js',
			'**/*.jsx',
			'**/+page.svelte',
			'**/+layout.svelte',
			'**/+server.ts',
			'src/routes/**/*',
			'src/lib/**/*',
			'src/components/**/*'
		],
		excludePatterns: [
			'node_modules/**',
			'.svelte-kit/**',
			'build/**',
			'dist/**',
			'.next/**',
			'coverage/**',
			'*.config.js',
			'*.config.ts'
		],
		codeGraphFocus: ['component', 'function', 'route', 'interface', 'type']
	},
	suggestedAgents: ['frontend-architect', 'svelte-expert', 'react-expert', 'api-specialist']
};

/** Infrastructure/DevOps project profile */
export const infraProfile: ProjectProfile = {
	id: 'infra',
	name: 'Infrastructure',
	description: 'Terraform, Ansible, Docker, and Kubernetes projects',
	icon: 'server',
	detectionPatterns: [
		'*.tf',
		'terraform.tfvars',
		'ansible.cfg',
		'playbook.yml',
		'docker-compose.yml',
		'docker-compose.yaml',
		'Dockerfile',
		'k8s/**/*.yaml',
		'kubernetes/**/*.yaml',
		'Chart.yaml',
		'helmfile.yaml'
	],
	quickActions: [
		{
			id: 'tf-init',
			label: 'TF Init',
			icon: 'download',
			command: 'terraform init',
			description: 'Initialize Terraform'
		},
		{
			id: 'tf-plan',
			label: 'TF Plan',
			icon: 'list',
			command: 'terraform plan',
			description: 'Preview Terraform changes'
		},
		{
			id: 'tf-apply',
			label: 'TF Apply',
			icon: 'upload-cloud',
			command: 'terraform apply',
			description: 'Apply Terraform changes',
			requiresConfirmation: true
		},
		{
			id: 'docker-build',
			label: 'Docker Build',
			icon: 'box',
			command: 'docker build -t app:latest .',
			description: 'Build Docker image'
		},
		{
			id: 'docker-compose',
			label: 'Compose Up',
			icon: 'layers',
			command: 'docker-compose up -d',
			description: 'Start Docker Compose stack'
		},
		{
			id: 'k8s-apply',
			label: 'K8s Apply',
			icon: 'cloud',
			command: 'kubectl apply -f k8s/',
			description: 'Apply Kubernetes manifests',
			requiresConfirmation: true
		}
	],
	contextDefaults: {
		includePatterns: [
			'**/*.tf',
			'**/*.tfvars',
			'**/*.yml',
			'**/*.yaml',
			'**/Dockerfile',
			'**/*.sh',
			'**/values.yaml',
			'**/Chart.yaml'
		],
		excludePatterns: [
			'.terraform/**',
			'*.tfstate',
			'*.tfstate.backup',
			'.terragrunt-cache/**'
		],
		codeGraphFocus: ['variable', 'function']
	},
	suggestedAgents: ['devops-engineer', 'terraform-expert', 'k8s-specialist', 'security-reviewer']
};

/** Generic fallback profile for unrecognized projects */
export const genericProfile: ProjectProfile = {
	id: 'generic',
	name: 'Generic',
	description: 'Default profile for any project type',
	icon: 'folder',
	detectionPatterns: [],
	quickActions: [
		{
			id: 'git-status',
			label: 'Git Status',
			icon: 'git-branch',
			command: 'git status',
			description: 'Show git status'
		},
		{
			id: 'git-log',
			label: 'Git Log',
			icon: 'list',
			command: 'git log --oneline -10',
			description: 'Show recent commits'
		},
		{
			id: 'explore',
			label: 'Explore',
			icon: 'search',
			command: 'ls -la',
			description: 'List directory contents'
		}
	],
	contextDefaults: {
		includePatterns: [
			'**/*.ts',
			'**/*.js',
			'**/*.py',
			'**/*.go',
			'**/*.rs',
			'**/*.swift',
			'**/*.java',
			'**/*.md'
		],
		excludePatterns: [
			'node_modules/**',
			'.git/**',
			'dist/**',
			'build/**',
			'target/**',
			'__pycache__/**',
			'*.min.js',
			'*.map'
		],
		codeGraphFocus: ['function', 'class', 'method', 'interface']
	},
	suggestedAgents: ['general-assistant', 'code-reviewer']
};

/** All built-in profiles */
export const builtInProfiles: ProjectProfile[] = [
	iosProfile,
	webProfile,
	infraProfile,
	genericProfile
];

/** Map of profile ID to profile */
export const profilesById: Record<string, ProjectProfile> = {
	ios: iosProfile,
	web: webProfile,
	infra: infraProfile,
	generic: genericProfile
};

/**
 * Get a profile by ID
 * @param id Profile ID
 * @returns The profile or generic profile if not found
 */
export function getProfile(id: string): ProjectProfile {
	return profilesById[id] || genericProfile;
}
