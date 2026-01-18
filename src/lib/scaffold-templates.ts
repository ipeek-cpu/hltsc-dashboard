/**
 * Project scaffolding templates and commands
 * Defines default frameworks and CLI commands for each project type
 */

export type ProjectType = 'website' | 'webapp' | 'mobile' | 'shopify' | 'api';

export interface FrameworkConfig {
	name: string;
	command: string;
	args: string[];
	// Optional args that get added based on user options
	optionalArgs?: Record<string, string[]>;
	// Post-install commands
	postInstall?: string[];
	// Environment requirements
	requires?: string[];
}

export interface ProjectTypeConfig {
	id: ProjectType;
	name: string;
	description: string;
	icon: string;
	defaultFramework: string;
	frameworks: Record<string, FrameworkConfig>;
}

export const PROJECT_TYPES: ProjectTypeConfig[] = [
	{
		id: 'website',
		name: 'Website',
		description: 'Static site, blog, or marketing page',
		icon: 'globe',
		defaultFramework: 'astro',
		frameworks: {
			astro: {
				name: 'Astro',
				command: 'npm',
				args: ['create', 'astro@latest', '.', '--', '--template', 'basics', '--no-git', '--no-install'],
				optionalArgs: {
					typescript: ['--typescript', 'strict'],
				}
			},
			'11ty': {
				name: 'Eleventy',
				command: 'npm',
				args: ['init', '-y'],
				postInstall: ['npm', 'install', '@11ty/eleventy']
			}
		}
	},
	{
		id: 'webapp',
		name: 'Web App',
		description: 'Full-stack web application with React',
		icon: 'layout',
		defaultFramework: 'nextjs',
		frameworks: {
			nextjs: {
				name: 'Next.js',
				command: 'npx',
				args: ['create-next-app@latest', '.', '--use-npm', '--no-git'],
				optionalArgs: {
					typescript: ['--typescript'],
					javascript: ['--js'],
					tailwind: ['--tailwind'],
					eslint: ['--eslint'],
					srcDir: ['--src-dir'],
					appRouter: ['--app'],
					pagesRouter: ['--no-app']
				}
			},
			sveltekit: {
				name: 'SvelteKit',
				command: 'npm',
				args: ['create', 'svelte@latest', '.'],
				optionalArgs: {
					typescript: ['--types', 'typescript']
				}
			},
			remix: {
				name: 'Remix',
				command: 'npx',
				args: ['create-remix@latest', '.', '--no-git-init'],
				optionalArgs: {
					typescript: ['--typescript']
				}
			}
		}
	},
	{
		id: 'mobile',
		name: 'Mobile App',
		description: 'Cross-platform iOS and Android app',
		icon: 'smartphone',
		defaultFramework: 'expo',
		frameworks: {
			expo: {
				name: 'Expo (React Native)',
				command: 'npx',
				args: ['create-expo-app@latest', '.', '--template', 'blank'],
				optionalArgs: {
					typescript: ['--template', 'blank-typescript'],
					navigation: ['--template', 'tabs']
				},
				requires: ['expo-cli']
			},
			'react-native': {
				name: 'React Native CLI',
				command: 'npx',
				args: ['react-native', 'init', '.'],
				optionalArgs: {
					typescript: ['--template', 'react-native-template-typescript']
				}
			}
		}
	},
	{
		id: 'shopify',
		name: 'Shopify Theme',
		description: 'Custom Shopify storefront theme',
		icon: 'shopping-bag',
		defaultFramework: 'dawn',
		frameworks: {
			dawn: {
				name: 'Dawn (Official)',
				command: 'shopify',
				args: ['theme', 'init', '.', '--clone-url', 'https://github.com/Shopify/dawn.git'],
				requires: ['shopify-cli']
			},
			skeleton: {
				name: 'Skeleton Theme',
				command: 'shopify',
				args: ['theme', 'init', '.', '--clone-url', 'https://github.com/Shopify/skeleton-theme.git'],
				requires: ['shopify-cli']
			}
		}
	},
	{
		id: 'api',
		name: 'API Backend',
		description: 'REST or GraphQL API server',
		icon: 'server',
		defaultFramework: 'nextjs-api',
		frameworks: {
			'nextjs-api': {
				name: 'Next.js API Routes',
				command: 'npx',
				args: ['create-next-app@latest', '.', '--use-npm', '--no-git', '--app', '--no-tailwind', '--no-src-dir'],
				optionalArgs: {
					typescript: ['--typescript'],
					javascript: ['--js']
				}
			},
			express: {
				name: 'Express.js',
				command: 'npm',
				args: ['init', '-y'],
				postInstall: ['npm', 'install', 'express', 'cors', 'dotenv']
			},
			fastify: {
				name: 'Fastify',
				command: 'npm',
				args: ['init', '-y'],
				postInstall: ['npm', 'install', 'fastify', '@fastify/cors', 'dotenv']
			},
			hono: {
				name: 'Hono',
				command: 'npm',
				args: ['create', 'hono@latest', '.']
			}
		}
	}
];

/**
 * Get project type config by ID
 */
export function getProjectType(id: ProjectType): ProjectTypeConfig | undefined {
	return PROJECT_TYPES.find(pt => pt.id === id);
}

/**
 * Get framework config for a project type
 */
export function getFramework(projectType: ProjectType, frameworkId: string): FrameworkConfig | undefined {
	const pt = getProjectType(projectType);
	return pt?.frameworks[frameworkId];
}

/**
 * Build the full command args based on user options
 */
export function buildCommandArgs(
	framework: FrameworkConfig,
	options: Record<string, boolean | string>
): string[] {
	const args = [...framework.args];

	// Add optional args based on user selections
	if (framework.optionalArgs) {
		for (const [key, value] of Object.entries(options)) {
			if (value && framework.optionalArgs[key]) {
				args.push(...framework.optionalArgs[key]);
			}
		}
	}

	return args;
}

/**
 * Default scaffolding steps
 */
export interface ScaffoldStep {
	id: string;
	label: string;
	status: 'pending' | 'running' | 'complete' | 'error';
	error?: string;
}

export const DEFAULT_SCAFFOLD_STEPS: Omit<ScaffoldStep, 'status'>[] = [
	{ id: 'create_dir', label: 'Creating project folder' },
	{ id: 'init_git', label: 'Initializing git repository' },
	{ id: 'scaffold', label: 'Setting up framework' },
	{ id: 'install_deps', label: 'Installing dependencies' },
	{ id: 'init_beads', label: 'Initializing Beads' },
	{ id: 'finalize', label: 'Finalizing project' }
];

/**
 * Claude prompt for generating dynamic form options
 */
export function getFormOptionsPrompt(projectType: ProjectType, framework: string): string {
	const typeConfig = getProjectType(projectType);
	const frameworkConfig = typeConfig?.frameworks[framework];

	return `You are helping a user scaffold a new ${typeConfig?.name || projectType} project using ${frameworkConfig?.name || framework}.

Based on this project type, what customization options should the user be able to configure?

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "fields": [
    {
      "id": "string (camelCase identifier)",
      "type": "select" | "checkbox",
      "label": "string (human readable)",
      "description": "string (brief explanation)",
      "options": [{"value": "string", "label": "string", "recommended": boolean}],
      "default": "string or boolean",
      "required": boolean
    }
  ],
  "suggestedFeatures": ["string array of what this setup will include"]
}

Guidelines:
- Include 4-6 key configuration options that are most impactful
- For ${projectType}, focus on: ${getRelevantOptions(projectType)}
- Mark the most common/recommended option in each field
- Use "checkbox" type for yes/no toggles, "select" for multiple choices
- Keep descriptions concise (under 100 characters)`;
}

function getRelevantOptions(projectType: ProjectType): string {
	switch (projectType) {
		case 'website':
			return 'TypeScript, CSS framework (Tailwind), content management, SEO setup';
		case 'webapp':
			return 'TypeScript, styling (Tailwind/CSS Modules), authentication, state management, testing';
		case 'mobile':
			return 'TypeScript, navigation setup, state management, native modules';
		case 'shopify':
			return 'Theme sections, custom fonts, performance optimizations';
		case 'api':
			return 'TypeScript, database (Prisma/Drizzle), authentication, validation, documentation';
		default:
			return 'TypeScript, testing, linting';
	}
}
