import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { getLog, isGitRepo } from '$lib/git-utils';

export const GET: RequestHandler = async ({ params, url }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;

	if (!isGitRepo(projectPath)) {
		return json({ error: 'Not a git repository' }, { status: 400 });
	}

	try {
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const commits = getLog(projectPath, limit);
		return json({ commits });
	} catch (error) {
		console.error('[git/log] Error:', error);
		return json({ error: 'Failed to get git log' }, { status: 500 });
	}
};
