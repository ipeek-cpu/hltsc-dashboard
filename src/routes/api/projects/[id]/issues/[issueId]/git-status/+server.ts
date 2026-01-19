import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { getIssueById, updateIssue, notifyDbChange, refreshProjectDb } from '$lib/project-db';
import { getBeadGitStatus } from '$lib/git-utils';
import type { RequestHandler } from './$types';

/**
 * GET: Fetch current git/PR/CI status for an issue's branch
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const issue = getIssueById(project.path, params.issueId);

		if (!issue) {
			return json({ error: 'Issue not found' }, { status: 404 });
		}

		// If no branch_name, return empty status
		if (!issue.branch_name) {
			return json({
				branch: null,
				pr: null,
				ci: null,
				message: 'No branch assigned to this issue'
			});
		}

		// Get combined git status
		const gitStatus = getBeadGitStatus(project.path, issue.branch_name);

		return json(gitStatus);
	} catch (e) {
		console.error('Error fetching git status:', e);
		return json({ error: 'Failed to fetch git status' }, { status: 500 });
	}
};

/**
 * POST: Refresh git/PR/CI status and update the issue record
 */
export const POST: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const issue = getIssueById(project.path, params.issueId);

		if (!issue) {
			return json({ error: 'Issue not found' }, { status: 404 });
		}

		// If no branch_name, nothing to refresh
		if (!issue.branch_name) {
			return json({
				updated: false,
				message: 'No branch assigned to this issue'
			});
		}

		// Get current git status
		const gitStatus = getBeadGitStatus(project.path, issue.branch_name);

		// Update the issue with PR/CI status
		const updates: {
			pr_url?: string;
			pr_status?: 'open' | 'merged' | 'closed';
			ci_status?: 'pending' | 'success' | 'failure';
		} = {};

		if (gitStatus.pr) {
			updates.pr_url = gitStatus.pr.url;
			// Map PRStatus to the simpler pr_status field
			if (gitStatus.pr.status === 'open' || gitStatus.pr.status === 'draft') {
				updates.pr_status = 'open';
			} else if (gitStatus.pr.status === 'merged') {
				updates.pr_status = 'merged';
			} else if (gitStatus.pr.status === 'closed') {
				updates.pr_status = 'closed';
			}
		}

		if (gitStatus.ci && gitStatus.ci.status !== 'unknown') {
			updates.ci_status = gitStatus.ci.status as 'pending' | 'success' | 'failure';
		}

		// Only update if we have new data
		if (Object.keys(updates).length > 0) {
			const success = updateIssue(project.path, params.issueId, updates);

			if (success) {
				notifyDbChange(project.path);
				refreshProjectDb(project.path);
			}

			return json({
				updated: success,
				gitStatus,
				appliedUpdates: updates
			});
		}

		return json({
			updated: false,
			gitStatus,
			message: 'No updates to apply'
		});
	} catch (e) {
		console.error('Error refreshing git status:', e);
		return json({ error: 'Failed to refresh git status' }, { status: 500 });
	}
};
