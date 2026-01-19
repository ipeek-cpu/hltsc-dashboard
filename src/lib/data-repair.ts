/**
 * Data Repair Utility
 * Provides functions to fix common data corruption issues in beads database
 */

import { getWritableProjectDb, getProjectDb, notifyDbChange, refreshProjectDb } from './project-db';
import { normalizeStatus, normalizeTimestamp, normalizeAssignee } from './bead-validation';

export interface RepairResult {
	field: string;
	issueId: string;
	oldValue: string | null;
	newValue: string;
	description: string;
}

export interface RepairSummary {
	totalIssuesScanned: number;
	issuesRepaired: number;
	repairs: RepairResult[];
	errors: string[];
}

/**
 * Fix timestamps that are missing timezone offset
 * Adds the specified timezone offset (default: -06:00 CST)
 */
export function repairTimestamps(projectPath: string, defaultOffset = '-06:00'): RepairResult[] {
	const db = getWritableProjectDb(projectPath);
	const repairs: RepairResult[] = [];

	// Get all issues with timestamps that don't have timezone info
	const issues = db
		.prepare(
			`
		SELECT id, created_at, updated_at, closed_at
		FROM issues
		WHERE deleted_at IS NULL
		  AND (
			(created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at NOT LIKE '%+%' AND created_at NOT LIKE '%-%:%')
			OR (updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at NOT LIKE '%+%' AND updated_at NOT LIKE '%-%:%')
			OR (closed_at IS NOT NULL AND closed_at NOT LIKE '%Z' AND closed_at NOT LIKE '%+%' AND closed_at NOT LIKE '%-%:%')
		  )
	`
		)
		.all() as { id: string; created_at: string | null; updated_at: string | null; closed_at: string | null }[];

	for (const issue of issues) {
		const updates: string[] = [];
		const values: (string | null)[] = [];

		// Check created_at
		if (issue.created_at && !hasTimezone(issue.created_at)) {
			const normalized = normalizeTimestamp(issue.created_at, defaultOffset);
			updates.push('created_at = ?');
			values.push(normalized);
			repairs.push({
				field: 'created_at',
				issueId: issue.id,
				oldValue: issue.created_at,
				newValue: normalized,
				description: `Added timezone offset ${defaultOffset}`
			});
		}

		// Check updated_at
		if (issue.updated_at && !hasTimezone(issue.updated_at)) {
			const normalized = normalizeTimestamp(issue.updated_at, defaultOffset);
			updates.push('updated_at = ?');
			values.push(normalized);
			repairs.push({
				field: 'updated_at',
				issueId: issue.id,
				oldValue: issue.updated_at,
				newValue: normalized,
				description: `Added timezone offset ${defaultOffset}`
			});
		}

		// Check closed_at
		if (issue.closed_at && !hasTimezone(issue.closed_at)) {
			const normalized = normalizeTimestamp(issue.closed_at, defaultOffset);
			updates.push('closed_at = ?');
			values.push(normalized);
			repairs.push({
				field: 'closed_at',
				issueId: issue.id,
				oldValue: issue.closed_at,
				newValue: normalized,
				description: `Added timezone offset ${defaultOffset}`
			});
		}

		if (updates.length > 0) {
			values.push(issue.id);
			db.prepare(`UPDATE issues SET ${updates.join(', ')} WHERE id = ?`).run(...values);
		}
	}

	return repairs;
}

function hasTimezone(timestamp: string): boolean {
	return /[Z+-]\d{2}:?\d{2}$/.test(timestamp) || timestamp.endsWith('Z');
}

/**
 * Convert legacy status values to current schema
 * Maps: done → closed, wip → in_progress, todo → open, etc.
 */
export function repairStatuses(projectPath: string): RepairResult[] {
	const db = getWritableProjectDb(projectPath);
	const repairs: RepairResult[] = [];

	// Get all issues with legacy status values
	const issues = db
		.prepare(
			`
		SELECT id, status
		FROM issues
		WHERE deleted_at IS NULL
		  AND status NOT IN ('open', 'ready', 'in_progress', 'in_review', 'closed', 'blocked', 'deferred', 'tombstone')
	`
		)
		.all() as { id: string; status: string }[];

	for (const issue of issues) {
		const normalized = normalizeStatus(issue.status);

		if (normalized !== issue.status) {
			db.prepare('UPDATE issues SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
				normalized,
				issue.id
			);

			repairs.push({
				field: 'status',
				issueId: issue.id,
				oldValue: issue.status,
				newValue: normalized,
				description: `Converted legacy status '${issue.status}' to '${normalized}'`
			});
		}
	}

	return repairs;
}

/**
 * Normalize assignee format (add @ prefix if missing)
 */
export function repairAssignees(projectPath: string): RepairResult[] {
	const db = getWritableProjectDb(projectPath);
	const repairs: RepairResult[] = [];

	// Get all issues with assignees that don't start with @
	const issues = db
		.prepare(
			`
		SELECT id, assignee
		FROM issues
		WHERE deleted_at IS NULL
		  AND assignee IS NOT NULL
		  AND assignee != ''
		  AND assignee NOT LIKE '@%'
	`
		)
		.all() as { id: string; assignee: string }[];

	for (const issue of issues) {
		const normalized = normalizeAssignee(issue.assignee);

		if (normalized && normalized !== issue.assignee) {
			db.prepare('UPDATE issues SET assignee = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
				normalized,
				issue.id
			);

			repairs.push({
				field: 'assignee',
				issueId: issue.id,
				oldValue: issue.assignee,
				newValue: normalized,
				description: `Added @ prefix to assignee`
			});
		}
	}

	return repairs;
}

/**
 * Fix issues with null or empty required fields
 */
export function repairRequiredFields(projectPath: string): RepairResult[] {
	const db = getWritableProjectDb(projectPath);
	const repairs: RepairResult[] = [];

	// Fix issues with empty titles
	const emptyTitleIssues = db
		.prepare(
			`
		SELECT id, title
		FROM issues
		WHERE deleted_at IS NULL
		  AND (title IS NULL OR title = '')
	`
		)
		.all() as { id: string; title: string | null }[];

	for (const issue of emptyTitleIssues) {
		const newTitle = `Untitled (${issue.id})`;
		db.prepare('UPDATE issues SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
			newTitle,
			issue.id
		);

		repairs.push({
			field: 'title',
			issueId: issue.id,
			oldValue: issue.title,
			newValue: newTitle,
			description: 'Set default title for empty issue'
		});
	}

	// Fix issues with invalid priority values
	const invalidPriorityIssues = db
		.prepare(
			`
		SELECT id, priority
		FROM issues
		WHERE deleted_at IS NULL
		  AND (priority IS NULL OR priority < 0 OR priority > 4)
	`
		)
		.all() as { id: string; priority: number | null }[];

	for (const issue of invalidPriorityIssues) {
		const newPriority = 2; // Default to medium priority
		db.prepare('UPDATE issues SET priority = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
			newPriority,
			issue.id
		);

		repairs.push({
			field: 'priority',
			issueId: issue.id,
			oldValue: issue.priority?.toString() ?? null,
			newValue: newPriority.toString(),
			description: `Set default priority (was ${issue.priority ?? 'null'})`
		});
	}

	return repairs;
}

/**
 * Run all repair operations on a project
 */
export function repairAllData(projectPath: string): RepairSummary {
	const repairs: RepairResult[] = [];
	const errors: string[] = [];

	// Get total issues count
	const db = getProjectDb(projectPath);
	const countResult = db
		.prepare('SELECT COUNT(*) as count FROM issues WHERE deleted_at IS NULL')
		.get() as { count: number };

	const totalIssuesScanned = countResult?.count ?? 0;

	try {
		// Run all repair operations
		repairs.push(...repairTimestamps(projectPath));
		repairs.push(...repairStatuses(projectPath));
		repairs.push(...repairAssignees(projectPath));
		repairs.push(...repairRequiredFields(projectPath));

		// Notify database change if repairs were made
		if (repairs.length > 0) {
			notifyDbChange(projectPath);
			refreshProjectDb(projectPath);
		}
	} catch (e) {
		errors.push(e instanceof Error ? e.message : 'Unknown error during repair');
	}

	// Count unique issues that were repaired
	const repairedIssueIds = new Set(repairs.map((r) => r.issueId));

	return {
		totalIssuesScanned,
		issuesRepaired: repairedIssueIds.size,
		repairs,
		errors
	};
}

/**
 * Preview what repairs would be made without applying them
 */
export function previewRepairs(projectPath: string): RepairSummary {
	const db = getProjectDb(projectPath);
	const repairs: RepairResult[] = [];

	// Get total issues count
	const countResult = db
		.prepare('SELECT COUNT(*) as count FROM issues WHERE deleted_at IS NULL')
		.get() as { count: number };

	const totalIssuesScanned = countResult?.count ?? 0;

	// Preview timestamp repairs
	const timestampIssues = db
		.prepare(
			`
		SELECT id, created_at, updated_at, closed_at
		FROM issues
		WHERE deleted_at IS NULL
		  AND (
			(created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at NOT LIKE '%+%' AND created_at NOT LIKE '%-%:%')
			OR (updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at NOT LIKE '%+%' AND updated_at NOT LIKE '%-%:%')
			OR (closed_at IS NOT NULL AND closed_at NOT LIKE '%Z' AND closed_at NOT LIKE '%+%' AND closed_at NOT LIKE '%-%:%')
		  )
	`
		)
		.all() as { id: string; created_at: string | null; updated_at: string | null; closed_at: string | null }[];

	for (const issue of timestampIssues) {
		if (issue.created_at && !hasTimezone(issue.created_at)) {
			repairs.push({
				field: 'created_at',
				issueId: issue.id,
				oldValue: issue.created_at,
				newValue: normalizeTimestamp(issue.created_at, '-06:00'),
				description: 'Would add timezone offset -06:00'
			});
		}
	}

	// Preview status repairs
	const statusIssues = db
		.prepare(
			`
		SELECT id, status
		FROM issues
		WHERE deleted_at IS NULL
		  AND status NOT IN ('open', 'ready', 'in_progress', 'in_review', 'closed', 'blocked', 'deferred', 'tombstone')
	`
		)
		.all() as { id: string; status: string }[];

	for (const issue of statusIssues) {
		const normalized = normalizeStatus(issue.status);
		if (normalized !== issue.status) {
			repairs.push({
				field: 'status',
				issueId: issue.id,
				oldValue: issue.status,
				newValue: normalized,
				description: `Would convert '${issue.status}' to '${normalized}'`
			});
		}
	}

	// Preview assignee repairs
	const assigneeIssues = db
		.prepare(
			`
		SELECT id, assignee
		FROM issues
		WHERE deleted_at IS NULL
		  AND assignee IS NOT NULL
		  AND assignee != ''
		  AND assignee NOT LIKE '@%'
	`
		)
		.all() as { id: string; assignee: string }[];

	for (const issue of assigneeIssues) {
		repairs.push({
			field: 'assignee',
			issueId: issue.id,
			oldValue: issue.assignee,
			newValue: normalizeAssignee(issue.assignee) || issue.assignee,
			description: 'Would add @ prefix'
		});
	}

	const repairedIssueIds = new Set(repairs.map((r) => r.issueId));

	return {
		totalIssuesScanned,
		issuesRepaired: repairedIssueIds.size,
		repairs,
		errors: []
	};
}
