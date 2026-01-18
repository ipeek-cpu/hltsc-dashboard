import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { getBranches, getCurrentBranch, isGitRepo, createBranch, switchBranch } from '$lib/git-utils';

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
		const branches = getBranches(projectPath);
		const currentBranch = getCurrentBranch(projectPath);
		return json({ branches, currentBranch });
	} catch (error) {
		console.error('[git/branches] Error:', error);
		return json({ error: 'Failed to get branches' }, { status: 500 });
	}
};

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
		const body = await request.json();
		const { action, branchName } = body;

		if (action === 'create') {
			if (!branchName) {
				return json({ error: 'Branch name is required' }, { status: 400 });
			}
			const result = createBranch(projectPath, branchName);
			if (!result.success) {
				return json({ error: result.error }, { status: 400 });
			}
			return json({ success: true, branch: branchName });
		}

		if (action === 'switch') {
			if (!branchName) {
				return json({ error: 'Branch name is required' }, { status: 400 });
			}
			const result = switchBranch(projectPath, branchName);
			if (!result.success) {
				return json({ error: result.error }, { status: 400 });
			}
			return json({ success: true, branch: branchName });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		console.error('[git/branches] Error:', error);
		return json({ error: 'Failed to perform branch operation' }, { status: 500 });
	}
};
