import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { getStatus, isGitRepo } from '$lib/git-utils';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;

	if (!isGitRepo(projectPath)) {
		return json({ error: 'Not a git repository' }, { status: 400 });
	}

	try {
		const status = getStatus(projectPath);
		return json(status);
	} catch (error) {
		console.error('[git/status] Error:', error);
		return json({ error: 'Failed to get git status' }, { status: 500 });
	}
};
