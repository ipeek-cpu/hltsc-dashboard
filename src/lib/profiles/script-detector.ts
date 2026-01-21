/**
 * Script Detector
 *
 * Auto-detects available scripts and commands from project files:
 * - package.json scripts
 * - Makefile targets
 * - docker-compose.yml services
 * - Xcode schemes
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { QuickAction } from './types';

export interface DetectedScript {
	id: string;
	label: string;
	command: string;
	source: 'package.json' | 'Makefile' | 'docker-compose' | 'xcode' | 'custom';
	description?: string;
	icon?: string;
}

export interface ScriptDetectionResult {
	scripts: DetectedScript[];
	sources: string[];
}

/**
 * Common script names and their suggested icons/labels
 */
const SCRIPT_METADATA: Record<string, { icon: string; label?: string; description?: string }> = {
	// Development
	dev: { icon: 'play', label: 'Dev Server', description: 'Start development server' },
	start: { icon: 'play', label: 'Start', description: 'Start the application' },
	serve: { icon: 'play', label: 'Serve', description: 'Serve the application' },

	// Building
	build: { icon: 'package', label: 'Build', description: 'Build for production' },
	'build:dev': { icon: 'package', label: 'Build (Dev)', description: 'Build for development' },
	'build:prod': { icon: 'package', label: 'Build (Prod)', description: 'Build for production' },
	compile: { icon: 'package', label: 'Compile', description: 'Compile the project' },

	// Testing
	test: { icon: 'check-circle', label: 'Test', description: 'Run tests' },
	'test:unit': { icon: 'check-circle', label: 'Unit Tests', description: 'Run unit tests' },
	'test:e2e': { icon: 'check-circle', label: 'E2E Tests', description: 'Run end-to-end tests' },
	'test:watch': { icon: 'check-circle', label: 'Test (Watch)', description: 'Run tests in watch mode' },
	coverage: { icon: 'bar-chart-2', label: 'Coverage', description: 'Run tests with coverage' },

	// Linting & Formatting
	lint: { icon: 'eye', label: 'Lint', description: 'Run linter' },
	'lint:fix': { icon: 'eye', label: 'Lint (Fix)', description: 'Run linter with auto-fix' },
	format: { icon: 'align-left', label: 'Format', description: 'Format code' },
	prettier: { icon: 'align-left', label: 'Prettier', description: 'Run Prettier' },
	check: { icon: 'file-text', label: 'Type Check', description: 'Run type checking' },
	typecheck: { icon: 'file-text', label: 'Type Check', description: 'Run TypeScript type checking' },

	// Storybook
	storybook: { icon: 'book-open', label: 'Storybook', description: 'Start Storybook' },
	'build-storybook': { icon: 'book-open', label: 'Build Storybook', description: 'Build Storybook' },

	// Docker
	'docker:build': { icon: 'box', label: 'Docker Build', description: 'Build Docker image' },
	'docker:run': { icon: 'box', label: 'Docker Run', description: 'Run Docker container' },
	'docker:push': { icon: 'upload-cloud', label: 'Docker Push', description: 'Push Docker image' },

	// Deployment
	deploy: { icon: 'upload-cloud', label: 'Deploy', description: 'Deploy application' },
	'deploy:staging': { icon: 'upload-cloud', label: 'Deploy Staging', description: 'Deploy to staging' },
	'deploy:prod': { icon: 'upload-cloud', label: 'Deploy Prod', description: 'Deploy to production' },

	// Database
	'db:migrate': { icon: 'database', label: 'DB Migrate', description: 'Run database migrations' },
	'db:seed': { icon: 'database', label: 'DB Seed', description: 'Seed database' },
	'db:reset': { icon: 'database', label: 'DB Reset', description: 'Reset database' },

	// Cleaning
	clean: { icon: 'trash-2', label: 'Clean', description: 'Clean build artifacts' },

	// iOS/Xcode
	'ios:build': { icon: 'smartphone', label: 'Build iOS', description: 'Build iOS app' },
	'ios:test': { icon: 'smartphone', label: 'Test iOS', description: 'Run iOS tests' },

	// Preview/Generate
	preview: { icon: 'eye', label: 'Preview', description: 'Preview build' },
	generate: { icon: 'zap', label: 'Generate', description: 'Generate code' }
};

/**
 * Detect the package manager used in the project
 */
export function detectPackageManager(projectPath: string): 'bun' | 'npm' | 'yarn' | 'pnpm' {
	if (existsSync(join(projectPath, 'bun.lockb'))) return 'bun';
	if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
	if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
	return 'npm';
}

/**
 * Detect scripts from package.json
 */
export function detectPackageJsonScripts(projectPath: string): DetectedScript[] {
	const packageJsonPath = join(projectPath, 'package.json');

	if (!existsSync(packageJsonPath)) {
		return [];
	}

	try {
		const content = readFileSync(packageJsonPath, 'utf-8');
		const pkg = JSON.parse(content);
		const scripts = pkg.scripts || {};
		const packageManager = detectPackageManager(projectPath);
		const runCmd = packageManager === 'npm' ? 'npm run' : `${packageManager} run`;

		const detected: DetectedScript[] = [];

		for (const [name, _script] of Object.entries(scripts)) {
			// Skip private/internal scripts (starting with _ or pre/post hooks)
			if (name.startsWith('_') || name.startsWith('pre') || name.startsWith('post')) {
				continue;
			}

			const metadata = SCRIPT_METADATA[name] || SCRIPT_METADATA[name.split(':')[0]];
			const label = metadata?.label || formatScriptName(name);

			detected.push({
				id: `pkg-${name}`,
				label,
				command: `${runCmd} ${name}`,
				source: 'package.json',
				description: metadata?.description || `Run "${name}" script`,
				icon: metadata?.icon || 'terminal'
			});
		}

		return detected;
	} catch (error) {
		console.error('Failed to parse package.json:', error);
		return [];
	}
}

/**
 * Detect targets from Makefile
 */
export function detectMakefileTargets(projectPath: string): DetectedScript[] {
	const makefilePath = join(projectPath, 'Makefile');

	if (!existsSync(makefilePath)) {
		return [];
	}

	try {
		const content = readFileSync(makefilePath, 'utf-8');
		const detected: DetectedScript[] = [];

		// Match target definitions (lines starting with a word followed by :)
		const targetRegex = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm;
		let match;

		while ((match = targetRegex.exec(content)) !== null) {
			const name = match[1];

			// Skip hidden targets and common internal targets
			if (name.startsWith('.') || ['all', 'default', 'PHONY'].includes(name)) {
				continue;
			}

			const metadata = SCRIPT_METADATA[name];

			detected.push({
				id: `make-${name}`,
				label: metadata?.label || formatScriptName(name),
				command: `make ${name}`,
				source: 'Makefile',
				description: metadata?.description || `Run make ${name}`,
				icon: metadata?.icon || 'tool'
			});
		}

		return detected;
	} catch (error) {
		console.error('Failed to parse Makefile:', error);
		return [];
	}
}

/**
 * Detect services from docker-compose.yml
 */
export function detectDockerComposeServices(projectPath: string): DetectedScript[] {
	const composePaths = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
	let composePath: string | null = null;

	for (const name of composePaths) {
		const fullPath = join(projectPath, name);
		if (existsSync(fullPath)) {
			composePath = fullPath;
			break;
		}
	}

	if (!composePath) {
		return [];
	}

	// Return common docker-compose actions
	return [
		{
			id: 'compose-up',
			label: 'Compose Up',
			command: 'docker-compose up -d',
			source: 'docker-compose',
			description: 'Start all services',
			icon: 'layers'
		},
		{
			id: 'compose-down',
			label: 'Compose Down',
			command: 'docker-compose down',
			source: 'docker-compose',
			description: 'Stop all services',
			icon: 'layers'
		},
		{
			id: 'compose-logs',
			label: 'Compose Logs',
			command: 'docker-compose logs -f',
			source: 'docker-compose',
			description: 'View service logs',
			icon: 'file-text'
		},
		{
			id: 'compose-build',
			label: 'Compose Build',
			command: 'docker-compose build',
			source: 'docker-compose',
			description: 'Build all images',
			icon: 'box'
		}
	];
}

/**
 * Detect all available scripts from a project
 */
export function detectAllScripts(projectPath: string): ScriptDetectionResult {
	const scripts: DetectedScript[] = [];
	const sources: string[] = [];

	// Detect package.json scripts
	const pkgScripts = detectPackageJsonScripts(projectPath);
	if (pkgScripts.length > 0) {
		scripts.push(...pkgScripts);
		sources.push('package.json');
	}

	// Detect Makefile targets
	const makeTargets = detectMakefileTargets(projectPath);
	if (makeTargets.length > 0) {
		scripts.push(...makeTargets);
		sources.push('Makefile');
	}

	// Detect docker-compose services
	const dockerServices = detectDockerComposeServices(projectPath);
	if (dockerServices.length > 0) {
		scripts.push(...dockerServices);
		sources.push('docker-compose');
	}

	return { scripts, sources };
}

/**
 * Convert detected scripts to QuickAction format
 */
export function scriptsToQuickActions(scripts: DetectedScript[]): QuickAction[] {
	return scripts.map((script) => ({
		id: script.id,
		label: script.label,
		icon: script.icon || 'terminal',
		command: script.command,
		description: script.description
	}));
}

/**
 * Format a script name into a readable label
 */
function formatScriptName(name: string): string {
	return name
		.split(/[-:_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
