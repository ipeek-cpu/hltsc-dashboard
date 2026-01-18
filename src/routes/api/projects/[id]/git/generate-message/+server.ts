import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { isGitRepo } from '$lib/git-utils';
import { spawnSync } from 'child_process';
import { getClaudePath } from '$lib/settings';

export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;

	if (!isGitRepo(projectPath)) {
		return json({ error: 'Not a git repository' }, { status: 400 });
	}

	try {
		// Check for Claude CLI
		const claudePathResult = getClaudePath();
		if (!claudePathResult.path) {
			return json({ error: 'Claude Code CLI not installed' }, { status: 400 });
		}

		const body = await request.json();
		const { userHint } = body; // Optional hint from user about what they changed

		// Get the diff of staged and unstaged changes
		const diffResult = spawnSync('git', ['diff', 'HEAD'], {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 10000
		});

		if (diffResult.error) {
			throw diffResult.error;
		}

		const diff = diffResult.stdout || '';

		// Get list of changed files for context
		const statusResult = spawnSync('git', ['status', '--porcelain'], {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 5000
		});

		const changedFiles = (statusResult.stdout || '')
			.split('\n')
			.filter(Boolean)
			.map(line => line.slice(3))
			.join(', ');

		// Limit diff size to avoid token limits
		const maxDiffLength = 8000;
		const truncatedDiff = diff.length > maxDiffLength
			? diff.slice(0, maxDiffLength) + '\n\n... (diff truncated)'
			: diff;

		// Generate commit message using Claude CLI
		const prompt = `You are helping a user write a git commit message. Based on the changes below, generate a title and optional description.

Rules for TITLE:
- Keep it under 72 characters
- Use imperative mood (e.g., "Add feature" not "Added feature")
- Be specific about what changed
- Don't include technical jargon unless necessary

Rules for DESCRIPTION (optional):
- Only include if there are multiple significant changes worth explaining
- Use bullet points for multiple items
- Keep it concise - 2-4 lines max
- Leave empty if the title explains everything

${userHint ? `User's description of changes: "${userHint}"` : ''}

Changed files: ${changedFiles}

Diff:
\`\`\`
${truncatedDiff}
\`\`\`

Respond in this exact JSON format, nothing else:
{"title": "your title here", "description": "optional description or empty string"}`;

		// Run Claude CLI with --print flag for one-shot response
		// Always use opus for automated processes that require reasoning
		const claudeResult = spawnSync(claudePathResult.path, [
			'-p', prompt,
			'--output-format', 'text',
			'--model', 'opus'
		], {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 60000, // 60 second timeout
			env: {
				...process.env,
				// Disable interactive features
				TERM: 'dumb',
				NO_COLOR: '1'
			}
		});

		if (claudeResult.error) {
			console.error('[git/generate-message] Claude CLI error:', claudeResult.error);
			throw claudeResult.error;
		}

		if (claudeResult.status !== 0) {
			console.error('[git/generate-message] Claude CLI failed:', claudeResult.stderr);
			throw new Error(claudeResult.stderr || 'Claude CLI failed');
		}

		const responseText = (claudeResult.stdout || '').trim();

		// Try to extract JSON from the response
		// Claude might include some text before/after the JSON
		const jsonMatch = responseText.match(/\{[\s\S]*"title"[\s\S]*\}/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[0]);
				return json({
					title: parsed.title || 'Update files',
					description: parsed.description || ''
				});
			} catch {
				// JSON parsing failed, fall through to fallback
			}
		}

		// Fallback: treat the response as the title
		const lines = responseText.split('\n').filter(Boolean);
		return json({
			title: (lines[0] || 'Update files').slice(0, 72),
			description: ''
		});
	} catch (error) {
		console.error('[git/generate-message] Error:', error);
		return json({ error: 'Failed to generate commit message' }, { status: 500 });
	}
};
