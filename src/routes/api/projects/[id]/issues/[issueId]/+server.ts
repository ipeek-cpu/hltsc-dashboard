import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import {
	getIssueWithDetails,
	getIssueById,
	updateIssue,
	getAllDescendantIssues,
	deleteIssueWithDescendants,
	notifyDbChange,
	refreshProjectDb
} from '$lib/project-db';
import { validateTransition, type BeadStatus, type TransitionData } from '$lib/bead-lifecycle';
import { closeBead } from '$lib/beads-cli';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const issue = getIssueWithDetails(project.path, params.issueId);

		if (!issue) {
			return json({ error: 'Issue not found' }, { status: 404 });
		}

		return json(issue);
	} catch (e) {
		console.error('Error fetching issue details:', e);
		return json({ error: 'Failed to fetch issue details' }, { status: 500 });
	}
};

// Update issue title, description, status, and lifecycle fields
export const PATCH: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const {
			title,
			description,
			status,
			assignee,
			branch_name,
			agent_id,
			commit_hash,
			execution_log,
			pr_url,
			pr_status,
			ci_status
		} = body;

		// Check issue exists
		const issue = getIssueById(project.path, params.issueId);
		if (!issue) {
			return json({ error: 'Issue not found' }, { status: 404 });
		}

		// If status is being changed, validate the transition
		if (status !== undefined && status !== issue.status) {
			const transitionData: TransitionData = {
				branch_name,
				agent_id,
				commit_hash,
				execution_log,
				pr_url
			};

			const validation = validateTransition(
				issue.status as BeadStatus,
				status as BeadStatus,
				transitionData
			);

			if (!validation.valid) {
				return json(
					{
						error: validation.error,
						missingFields: validation.missingFields
					},
					{ status: 400 }
				);
			}
		}

		// Validate at least one field is provided
		const hasUpdates =
			title !== undefined ||
			description !== undefined ||
			status !== undefined ||
			assignee !== undefined ||
			branch_name !== undefined ||
			agent_id !== undefined ||
			commit_hash !== undefined ||
			execution_log !== undefined ||
			pr_url !== undefined ||
			pr_status !== undefined ||
			ci_status !== undefined;

		if (!hasUpdates) {
			return json({ error: 'No fields to update' }, { status: 400 });
		}

		// Special handling for closing beads - use bd close CLI
		if (status === 'closed' && issue.status !== 'closed') {
			const closeResult = closeBead(project.path, params.issueId);

			if (!closeResult.success) {
				return json(
					{ error: closeResult.error || 'Failed to close bead via bd CLI' },
					{ status: 500 }
				);
			}

			// Notify that we changed the DB and refresh connection
			notifyDbChange(project.path);
			refreshProjectDb(project.path);

			// Return updated issue
			const updatedIssue = getIssueWithDetails(project.path, params.issueId);
			return json(updatedIssue);
		}

		// For other updates, use direct DB update
		const success = updateIssue(project.path, params.issueId, {
			title,
			description,
			status,
			assignee,
			branch_name,
			agent_id,
			commit_hash,
			execution_log,
			pr_url,
			pr_status,
			ci_status
		});

		if (!success) {
			return json({ error: 'Failed to update issue' }, { status: 500 });
		}

		// Notify that we changed the DB and refresh connection so stream picks up change
		notifyDbChange(project.path);
		refreshProjectDb(project.path);

		// Return updated issue
		const updatedIssue = getIssueWithDetails(project.path, params.issueId);
		return json(updatedIssue);
	} catch (e) {
		console.error('Error updating issue:', e);
		return json({ error: 'Failed to update issue' }, { status: 500 });
	}
};

// Delete issue and all descendants
export const DELETE: RequestHandler = async ({ params, url }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		// Check issue exists
		const issue = getIssueById(project.path, params.issueId);
		if (!issue) {
			return json({ error: 'Issue not found' }, { status: 404 });
		}

		// If preview=true, just return what would be deleted
		const preview = url.searchParams.get('preview') === 'true';
		if (preview) {
			const descendants = getAllDescendantIssues(project.path, params.issueId);
			return json({
				issue,
				descendants,
				totalCount: 1 + descendants.length
			});
		}

		// Actually delete
		const result = deleteIssueWithDescendants(project.path, params.issueId);

		return json({
			success: true,
			deleted: result.deleted,
			count: result.deleted.length
		});
	} catch (e) {
		console.error('Error deleting issue:', e);
		return json({ error: 'Failed to delete issue' }, { status: 500 });
	}
};
