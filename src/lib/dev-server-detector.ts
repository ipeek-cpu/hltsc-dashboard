import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getClaudePath } from './settings';
import type { DevServerConfig } from './dashboard-db';

export interface DetectionResult {
	detected: boolean;
	config?: DevServerConfig;
	frameworkDisplayName?: string;
	error?: string;
	needsStoreUrl?: boolean; // For Shopify themes without store URL configured
}

/**
 * Normalize a framework name to a lowercase key for dropdown matching
 */
function normalizeFrameworkName(name: string): string {
	const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');

	// Map common variations
	const mappings: Record<string, string> = {
		'nextjs': 'nextjs',
		'next': 'nextjs',
		'sveltekit': 'sveltekit',
		'svelte': 'sveltekit',
		'vite': 'vite',
		'vitejs': 'vite',
		'remix': 'remix',
		'remixrun': 'remix',
		'astro': 'astro',
		'astrojs': 'astro',
		'nuxt': 'nuxt',
		'nuxtjs': 'nuxt',
		'nuxt3': 'nuxt',
		'gatsby': 'gatsby',
		'gatsbyjs': 'gatsby',
		'expo': 'expo',
		'shopify': 'shopify',
		'shopifytheme': 'shopify',
		'cra': 'cra',
		'createreactapp': 'cra',
		'angular': 'angular',
		'vue': 'vue',
		'vuejs': 'vue',
		'vuecli': 'vue',
	};

	return mappings[normalized] || 'other';
}

/**
 * Use Claude Code CLI to intelligently detect the dev server configuration
 */
export async function detectDevServerConfig(projectPath: string): Promise<DetectionResult> {
	// Check for Claude CLI
	const claudePathResult = getClaudePath();
	if (!claudePathResult.path) {
		return {
			detected: false,
			error: 'Claude Code CLI not installed'
		};
	}

	try {
		// Gather project context for Claude
		const context = gatherProjectContext(projectPath);

		const prompt = `You are analyzing a software project to determine how to start its development server.

PROJECT CONTEXT:
${context}

Based on this project structure, determine:
1. The command to start the development server (e.g., "npm run dev", "bun dev", "shopify theme dev")
2. The port the dev server will run on
3. The preview URL to load in a browser (usually http://localhost:PORT, but for Shopify themes it's a myshopify.com preview URL that gets printed to stdout)
4. The framework key (lowercase, no spaces: nextjs, sveltekit, vite, remix, astro, nuxt, gatsby, expo, shopify, cra, angular, vue, or "other")
5. The framework display name for the UI
6. Whether hot reload is supported

IMPORTANT NOTES:
- For Shopify themes (detected by shopify.theme.toml, or by folder structure with assets/, templates/, sections/, config/ directories):
  - Look for the store URL in shopify.theme.toml (usually under [environments.development] as "store" field, e.g., "store = 'test-store.myshopify.com'")
  - If you find a store URL, the command should be "shopify theme dev --store=STORE_URL"
  - If you CANNOT find a store URL, set devCommand to just "shopify theme dev" and set "needsStoreUrl": true
  - The preview URL will be extracted from stdout at runtime, so set previewUrl to "shopify-preview" as a placeholder
- If there's a bun.lockb or bun.lock file, prefer "bun" over "npm run"
- Look at the "scripts" section in package.json to find the correct dev command
- Common dev commands: "dev", "start", "develop", "serve"
- If you see a port specified in the script (like --port 3001), use that port

Respond with ONLY this JSON, no other text:
{"devCommand": "the command", "port": 3000, "previewUrl": "http://localhost:3000", "frameworkKey": "nextjs", "frameworkName": "Next.js", "hotReloadSupported": true, "needsStoreUrl": false}`;

		// Run Claude CLI with --print flag for one-shot response
		// Always use opus for automated processes that require reasoning
		const claudeResult = spawnSync(claudePathResult.path, [
			'-p', prompt,
			'--output-format', 'text',
			'--model', 'opus'
		], {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 30000, // 30 second timeout
			env: {
				...process.env,
				TERM: 'dumb',
				NO_COLOR: '1'
			}
		});

		if (claudeResult.error) {
			console.error('[dev-server-detector] Claude CLI error:', claudeResult.error);
			return {
				detected: false,
				error: `Claude CLI error: ${claudeResult.error.message}`
			};
		}

		if (claudeResult.status !== 0) {
			console.error('[dev-server-detector] Claude CLI failed:', claudeResult.stderr);
			return {
				detected: false,
				error: claudeResult.stderr || 'Claude CLI failed'
			};
		}

		const responseText = (claudeResult.stdout || '').trim();

		// Extract JSON from the response
		const jsonMatch = responseText.match(/\{[\s\S]*"devCommand"[\s\S]*\}/);
		if (!jsonMatch) {
			console.error('[dev-server-detector] No JSON in response:', responseText);
			return {
				detected: false,
				error: 'Could not parse Claude response'
			};
		}

		try {
			const parsed = JSON.parse(jsonMatch[0]);

			// Validate required fields
			if (!parsed.devCommand || !parsed.port) {
				return {
					detected: false,
					error: 'Invalid response: missing required fields'
				};
			}

			// Use frameworkKey for the dropdown, frameworkName for display
			// Always normalize to ensure we get a valid key (lowercase, no spaces)
			const rawKey = parsed.frameworkKey || parsed.framework || parsed.frameworkName || 'other';
			const frameworkKey = normalizeFrameworkName(rawKey);
			const frameworkName = parsed.frameworkName || parsed.framework || 'Unknown';

			const config: DevServerConfig = {
				framework: frameworkKey,
				devCommand: parsed.devCommand,
				defaultPort: parsed.port,
				hotReloadSupported: parsed.hotReloadSupported ?? true,
				detectedAt: new Date().toISOString(),
				// For Shopify, previewUrl will be extracted at runtime from stdout
				previewUrl: parsed.previewUrl === 'shopify-preview' ? undefined : parsed.previewUrl
			};

			return {
				detected: true,
				config,
				frameworkDisplayName: frameworkName,
				needsStoreUrl: parsed.needsStoreUrl === true
			};
		} catch (parseError) {
			console.error('[dev-server-detector] JSON parse error:', parseError);
			return {
				detected: false,
				error: 'Failed to parse detection result'
			};
		}
	} catch (error) {
		console.error('[dev-server-detector] Error:', error);
		return {
			detected: false,
			error: error instanceof Error ? error.message : 'Detection failed'
		};
	}
}

/**
 * Gather relevant project context for Claude to analyze
 */
function gatherProjectContext(projectPath: string): string {
	const sections: string[] = [];

	// List files in root directory
	try {
		const files = fs.readdirSync(projectPath);
		const relevantFiles = files.filter(f => {
			// Include config files, package files, lock files
			const lowerF = f.toLowerCase();
			return (
				lowerF.endsWith('.json') ||
				lowerF.endsWith('.toml') ||
				lowerF.endsWith('.yaml') ||
				lowerF.endsWith('.yml') ||
				lowerF.includes('config') ||
				lowerF.includes('lock') ||
				lowerF === 'dockerfile' ||
				lowerF === 'makefile' ||
				lowerF === '.env.example'
			);
		});
		sections.push(`Files in project root:\n${relevantFiles.join('\n')}`);
	} catch {
		// Ignore errors
	}

	// Read package.json
	const packageJsonPath = path.join(projectPath, 'package.json');
	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
			// Only include relevant parts
			const relevantPackageJson = {
				name: packageJson.name,
				scripts: packageJson.scripts,
				dependencies: Object.keys(packageJson.dependencies || {}),
				devDependencies: Object.keys(packageJson.devDependencies || {})
			};
			sections.push(`package.json:\n${JSON.stringify(relevantPackageJson, null, 2)}`);
		} catch {
			// Ignore errors
		}
	}

	// Check for shopify.theme.toml - read full file to get store URL
	const shopifyTomlPath = path.join(projectPath, 'shopify.theme.toml');
	if (fs.existsSync(shopifyTomlPath)) {
		try {
			const content = fs.readFileSync(shopifyTomlPath, 'utf-8');
			sections.push(`shopify.theme.toml:\n${content}`);
		} catch {
			// Ignore errors
		}
	}

	// Check for common framework config files
	const configFiles = [
		'next.config.js', 'next.config.mjs', 'next.config.ts',
		'svelte.config.js', 'svelte.config.ts',
		'vite.config.js', 'vite.config.ts', 'vite.config.mjs',
		'astro.config.mjs', 'astro.config.js',
		'nuxt.config.js', 'nuxt.config.ts',
		'remix.config.js',
		'gatsby-config.js',
		'angular.json',
		'vue.config.js'
	];

	for (const configFile of configFiles) {
		const configPath = path.join(projectPath, configFile);
		if (fs.existsSync(configPath)) {
			sections.push(`Found config file: ${configFile}`);
			break; // Only note the first one found
		}
	}

	// Check for lock files to determine package manager
	if (fs.existsSync(path.join(projectPath, 'bun.lockb')) || fs.existsSync(path.join(projectPath, 'bun.lock'))) {
		sections.push('Package manager: bun (bun.lockb found)');
	} else if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
		sections.push('Package manager: pnpm (pnpm-lock.yaml found)');
	} else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
		sections.push('Package manager: yarn (yarn.lock found)');
	} else if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) {
		sections.push('Package manager: npm (package-lock.json found)');
	}

	return sections.join('\n\n');
}

/**
 * Get framework display name from the config
 */
export function getFrameworkDisplayName(config: DevServerConfig): string {
	return config.framework || 'Unknown Framework';
}
