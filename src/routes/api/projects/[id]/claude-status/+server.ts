import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

/**
 * GET - Check if Claude Code is initialized in this project
 * Returns: { initialized: boolean, hasClaudeDir: boolean, hasClaudeMd: boolean }
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const claudeDir = path.join(project.path, '.claude');
	const claudeMd = path.join(project.path, 'CLAUDE.md');

	const hasClaudeDir = fs.existsSync(claudeDir);
	const hasClaudeMd = fs.existsSync(claudeMd);

	// Consider initialized if either .claude/ folder or CLAUDE.md exists
	const initialized = hasClaudeDir || hasClaudeMd;

	return json({
		initialized,
		hasClaudeDir,
		hasClaudeMd,
		projectPath: project.path
	});
};
