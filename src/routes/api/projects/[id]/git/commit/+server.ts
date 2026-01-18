import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { createCommit, getStatus, isGitRepo, push } from '$lib/git-utils';

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
		const { message, shouldPush = false } = body;

		if (!message) {
			return json({ error: 'Commit message is required' }, { status: 400 });
		}

		// Check if there are changes to commit
		const status = getStatus(projectPath);
		if (!status.hasChanges) {
			return json({ error: 'No changes to save' }, { status: 400 });
		}

		// Create the commit
		const commitHash = createCommit(projectPath, message);

		// Push if requested
		let pushResult = null;
		if (shouldPush) {
			pushResult = push(projectPath);
		}

		return json({
			success: true,
			commitHash,
			pushed: shouldPush ? pushResult?.success : false
		});
	} catch (error) {
		console.error('[git/commit] Error:', error);
		return json({ error: 'Failed to create checkpoint' }, { status: 500 });
	}
};
