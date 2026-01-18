import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { restoreToCommit, getCommitsToUndo, getStatus, isGitRepo } from '$lib/git-utils';

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
		const { commitHash, saveFirst = false, commitMessage } = body;

		if (!commitHash) {
			return json({ error: 'Commit hash is required' }, { status: 400 });
		}

		// Get commits that will be undone (for confirmation/logging)
		const commitsToUndo = getCommitsToUndo(projectPath, commitHash);

		// Perform the restore
		const result = restoreToCommit(projectPath, commitHash, {
			saveFirst,
			commitMessage
		});

		if (!result.success) {
			return json({ error: result.error }, { status: 500 });
		}

		return json({
			success: true,
			savedCommitHash: result.savedCommitHash,
			commitsUndone: commitsToUndo.length
		});
	} catch (error) {
		console.error('[git/restore] Error:', error);
		return json({ error: 'Failed to restore to checkpoint' }, { status: 500 });
	}
};

// GET endpoint to preview what will be undone
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
		const commitHash = url.searchParams.get('commitHash');

		if (!commitHash) {
			return json({ error: 'Commit hash is required' }, { status: 400 });
		}

		const commitsToUndo = getCommitsToUndo(projectPath, commitHash);
		const status = getStatus(projectPath);

		return json({
			commitsToUndo,
			hasUnsavedChanges: status.hasChanges,
			unsavedChangesSummary: status.summary
		});
	} catch (error) {
		console.error('[git/restore] Error:', error);
		return json({ error: 'Failed to get restore preview' }, { status: 500 });
	}
};
