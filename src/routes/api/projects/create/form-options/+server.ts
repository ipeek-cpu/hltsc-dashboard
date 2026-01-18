import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import { getClaudePath } from '$lib/settings';
import { getProjectType, getFormOptionsPrompt, type ProjectType } from '$lib/scaffold-templates';
import type { RequestHandler } from './$types';

export interface FormField {
	id: string;
	type: 'select' | 'checkbox' | 'text';
	label: string;
	description?: string;
	options?: Array<{ value: string; label: string; recommended?: boolean }>;
	default?: string | boolean;
	required?: boolean;
	dependsOn?: { field: string; value: string | boolean };
}

export interface FormOptionsResponse {
	fields: FormField[];
	suggestedFeatures?: string[];
	defaultFramework: string;
	error?: string;
}

/**
 * POST - Get dynamic form options from Claude for a project type
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { projectType, framework } = body as {
			projectType: ProjectType;
			framework?: string;
		};

		if (!projectType) {
			return json({ error: 'Project type is required' }, { status: 400 });
		}

		const typeConfig = getProjectType(projectType);
		if (!typeConfig) {
			return json({ error: 'Invalid project type' }, { status: 400 });
		}

		const selectedFramework = framework || typeConfig.defaultFramework;
		const claudePathResult = getClaudePath();

		if (!claudePathResult.path) {
			// Fall back to default options if Claude not available
			return json(getDefaultFormOptions(projectType, selectedFramework));
		}

		try {
			const result = await askClaudeForOptions(
				claudePathResult.path,
				projectType,
				selectedFramework
			);
			return json({
				...result,
				defaultFramework: selectedFramework
			});
		} catch (err) {
			console.error('[form-options] Claude error, using defaults:', err);
			// Fall back to defaults on error
			return json(getDefaultFormOptions(projectType, selectedFramework));
		}
	} catch (err) {
		console.error('[form-options] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

/**
 * Ask Claude for form options using print mode
 */
async function askClaudeForOptions(
	claudePath: string,
	projectType: ProjectType,
	framework: string
): Promise<{ fields: FormField[]; suggestedFeatures?: string[] }> {
	return new Promise((resolve, reject) => {
		const prompt = getFormOptionsPrompt(projectType, framework);

		const args = [
			'-p', prompt,
			'--output-format', 'json',
			'--max-tokens', '2000'
		];

		const process = spawn(claudePath, args, {
			cwd: '/tmp',
			env: {
				...globalThis.process.env,
				CI: 'true'
			},
			stdio: ['pipe', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		process.stdout?.on('data', (data) => {
			stdout += data.toString();
		});

		process.stderr?.on('data', (data) => {
			stderr += data.toString();
		});

		// Set timeout
		const timeout = setTimeout(() => {
			process.kill();
			reject(new Error('Claude request timed out'));
		}, 30000);

		process.on('close', (code) => {
			clearTimeout(timeout);

			if (code !== 0) {
				reject(new Error(`Claude exited with code ${code}: ${stderr}`));
				return;
			}

			try {
				// Parse the JSON response from Claude
				// The response may be wrapped in the result structure
				const parsed = JSON.parse(stdout);

				// Handle different response formats
				let fields: FormField[] = [];
				let suggestedFeatures: string[] = [];

				if (parsed.result) {
					// Wrapped in result object
					const inner = typeof parsed.result === 'string'
						? JSON.parse(parsed.result)
						: parsed.result;
					fields = inner.fields || [];
					suggestedFeatures = inner.suggestedFeatures || [];
				} else if (parsed.fields) {
					// Direct response
					fields = parsed.fields;
					suggestedFeatures = parsed.suggestedFeatures || [];
				} else {
					throw new Error('Invalid response format');
				}

				resolve({ fields, suggestedFeatures });
			} catch (parseErr) {
				console.error('[form-options] Failed to parse Claude response:', stdout);
				reject(parseErr);
			}
		});

		process.on('error', (err) => {
			clearTimeout(timeout);
			reject(err);
		});

		process.stdin?.end();
	});
}

/**
 * Default form options when Claude is unavailable
 */
function getDefaultFormOptions(projectType: ProjectType, framework: string): FormOptionsResponse {
	const commonFields: FormField[] = [
		{
			id: 'typescript',
			type: 'checkbox',
			label: 'TypeScript',
			description: 'Use TypeScript for type safety',
			default: true
		}
	];

	const typeSpecificFields: Record<ProjectType, FormField[]> = {
		website: [
			{
				id: 'styling',
				type: 'select',
				label: 'CSS Framework',
				options: [
					{ value: 'tailwind', label: 'Tailwind CSS', recommended: true },
					{ value: 'vanilla', label: 'Plain CSS' },
					{ value: 'scss', label: 'SCSS/Sass' }
				],
				default: 'tailwind'
			}
		],
		webapp: [
			{
				id: 'styling',
				type: 'select',
				label: 'CSS Framework',
				options: [
					{ value: 'tailwind', label: 'Tailwind CSS', recommended: true },
					{ value: 'css-modules', label: 'CSS Modules' },
					{ value: 'styled', label: 'Styled Components' }
				],
				default: 'tailwind'
			},
			{
				id: 'eslint',
				type: 'checkbox',
				label: 'ESLint',
				description: 'Add ESLint for code linting',
				default: true
			},
			{
				id: 'srcDir',
				type: 'checkbox',
				label: 'src/ Directory',
				description: 'Use src/ directory for source files',
				default: false
			}
		],
		mobile: [
			{
				id: 'navigation',
				type: 'select',
				label: 'Navigation',
				options: [
					{ value: 'none', label: 'None (blank template)' },
					{ value: 'tabs', label: 'Tab Navigation', recommended: true },
					{ value: 'stack', label: 'Stack Navigation' }
				],
				default: 'none'
			}
		],
		shopify: [
			{
				id: 'sections',
				type: 'checkbox',
				label: 'Custom Sections',
				description: 'Include starter custom sections',
				default: true
			}
		],
		api: [
			{
				id: 'database',
				type: 'select',
				label: 'Database',
				options: [
					{ value: 'none', label: 'None' },
					{ value: 'prisma', label: 'Prisma ORM', recommended: true },
					{ value: 'drizzle', label: 'Drizzle ORM' }
				],
				default: 'none'
			},
			{
				id: 'validation',
				type: 'checkbox',
				label: 'Validation',
				description: 'Add Zod for input validation',
				default: true
			}
		]
	};

	return {
		fields: [...commonFields, ...(typeSpecificFields[projectType] || [])],
		defaultFramework: framework,
		suggestedFeatures: ['Git repository', 'Package.json', 'README.md']
	};
}
