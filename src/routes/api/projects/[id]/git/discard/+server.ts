import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { discardAllChanges, getStatus, isGitRepo } from '$lib/git-utils';

export const POST: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;

	if (!isGitRepo(projectPath)) {
		return json({ error: 'Not a git repository' }, { status: 400 });
	}

	try {
		// Check if there are changes to discard
		const status = getStatus(projectPath);
		if (!status.hasChanges) {
			return json({ error: 'No changes to discard' }, { status: 400 });
		}

		// Discard all changes
		discardAllChanges(projectPath);

		return json({ success: true });
	} catch (error) {
		console.error('[git/discard] Error:', error);
		return json({ error: 'Failed to discard changes' }, { status: 500 });
	}
};
