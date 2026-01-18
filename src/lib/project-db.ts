import Database from 'better-sqlite3';
import path from 'path';

// Cache of open database connections (read-only)
const dbCache = new Map<string, Database.Database>();

// Cache of writable database connections
const writableDbCache = new Map<string, Database.Database>();

export interface Issue {
	id: string;
	title: string;
	description: string;
	status: string;
	priority: number;
	issue_type: string;
	assignee: string | null;
	created_at: string;
	created_by: string;
	updated_at: string;
	closed_at: string | null;
	close_reason: string;
}

export interface Event {
	id: number;
	issue_id: string;
	event_type: string;
	actor: string;
	old_value: string | null;
	new_value: string | null;
	comment: string | null;
	created_at: string;
}

export interface Comment {
	id: number;
	issue_id: string;
	author: string;
	text: string;
	created_at: string;
}

export interface IssueStats {
	status: string;
	count: number;
}

function getBeadsDbPath(projectPath: string): string {
	return path.join(projectPath, '.beads', 'beads.db');
}

export function getProjectDb(projectPath: string): Database.Database {
	const dbPath = getBeadsDbPath(projectPath);

	if (!dbCache.has(dbPath)) {
		const db = new Database(dbPath, { readonly: true });
		db.pragma('journal_mode = WAL');
		dbCache.set(dbPath, db);
	}

	return dbCache.get(dbPath)!;
}

export function closeProjectDb(projectPath: string): void {
	const dbPath = getBeadsDbPath(projectPath);
	const db = dbCache.get(dbPath);
	if (db) {
		db.close();
		dbCache.delete(dbPath);
	}
	const writableDb = writableDbCache.get(dbPath);
	if (writableDb) {
		writableDb.close();
		writableDbCache.delete(dbPath);
	}
}

// Get a writable database connection for updates/deletes
export function getWritableProjectDb(projectPath: string): Database.Database {
	const dbPath = getBeadsDbPath(projectPath);

	if (!writableDbCache.has(dbPath)) {
		const db = new Database(dbPath, { readonly: false });
		db.pragma('journal_mode = WAL');
		writableDbCache.set(dbPath, db);
	}

	return writableDbCache.get(dbPath)!;
}

export function getAllIssues(projectPath: string): Issue[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT id, title, description, status, priority, issue_type,
		       assignee, created_at, created_by, updated_at, closed_at, close_reason
		FROM issues
		WHERE deleted_at IS NULL
		ORDER BY priority ASC, updated_at DESC
	`
		)
		.all() as Issue[];
}

export function getIssuesByStatus(projectPath: string, status: string): Issue[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT id, title, description, status, priority, issue_type,
		       assignee, created_at, created_by, updated_at, closed_at, close_reason
		FROM issues
		WHERE status = ? AND deleted_at IS NULL
		ORDER BY priority ASC, updated_at DESC
	`
		)
		.all(status) as Issue[];
}

export function getIssueById(projectPath: string, id: string): Issue | undefined {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT id, title, description, status, priority, issue_type,
		       assignee, created_at, created_by, updated_at, closed_at, close_reason
		FROM issues
		WHERE id = ?
	`
		)
		.get(id) as Issue | undefined;
}

export function getCommentsForIssue(projectPath: string, issueId: string): Comment[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT id, issue_id, author, text, created_at
		FROM comments
		WHERE issue_id = ?
		ORDER BY created_at ASC
	`
		)
		.all(issueId) as Comment[];
}

export function getRecentEvents(projectPath: string, since?: string, limit = 100): Event[] {
	const db = getProjectDb(projectPath);
	if (since) {
		return db
			.prepare(
				`
			SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
			FROM events
			WHERE created_at > ?
			ORDER BY created_at DESC
			LIMIT ?
		`
			)
			.all(since, limit) as Event[];
	}
	return db
		.prepare(
			`
		SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
		FROM events
		ORDER BY created_at DESC
		LIMIT ?
	`
		)
		.all(limit) as Event[];
}

// Manual change counter per project - incremented when we write to the DB
const changeCounters = new Map<string, number>();

export function getDataVersion(projectPath: string): number {
	const db = getProjectDb(projectPath);
	const result = db.pragma('data_version', { simple: true });
	// Combine SQLite's data_version with our manual change counter
	const manualCounter = changeCounters.get(projectPath) || 0;
	return (result as number) + manualCounter * 1000000;
}

/**
 * Notify that we've made a change to the database.
 * This increments a counter that forces the stream to detect changes.
 */
export function notifyDbChange(projectPath: string): void {
	const current = changeCounters.get(projectPath) || 0;
	changeCounters.set(projectPath, current + 1);
}

/**
 * Refresh the database connection to get latest data.
 * Call this when data_version changes to ensure we see the latest writes.
 */
export function refreshProjectDb(projectPath: string): void {
	const dbPath = getBeadsDbPath(projectPath);
	const db = dbCache.get(dbPath);
	if (db) {
		db.close();
		dbCache.delete(dbPath);
	}
	// The next getProjectDb call will open a fresh connection
}

export function getIssueStats(projectPath: string): IssueStats[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT status, COUNT(*) as count
		FROM issues
		WHERE deleted_at IS NULL
		GROUP BY status
	`
		)
		.all() as IssueStats[];
}

export function getProjectCounts(projectPath: string): {
	open: number;
	in_progress: number;
	total: number;
} {
	const stats = getIssueStats(projectPath);
	let open = 0;
	let in_progress = 0;
	let total = 0;

	for (const stat of stats) {
		total += stat.count;
		if (stat.status === 'open') {
			open = stat.count;
		} else if (stat.status === 'in_progress') {
			in_progress = stat.count;
		}
	}

	return { open, in_progress, total };
}

// Get issues that block this issue (this issue depends on them)
export function getBlockersForIssue(projectPath: string, issueId: string): Issue[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT i.id, i.title, i.description, i.status, i.priority, i.issue_type,
		       i.assignee, i.created_at, i.created_by, i.updated_at, i.closed_at, i.close_reason
		FROM issues i
		JOIN dependencies d ON i.id = d.depends_on_id
		WHERE d.issue_id = ? AND d.type = 'blocks' AND i.deleted_at IS NULL
		ORDER BY i.priority ASC
	`
		)
		.all(issueId) as Issue[];
}

// Get issues that this issue blocks (they depend on this issue)
export function getBlockedByIssue(projectPath: string, issueId: string): Issue[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT i.id, i.title, i.description, i.status, i.priority, i.issue_type,
		       i.assignee, i.created_at, i.created_by, i.updated_at, i.closed_at, i.close_reason
		FROM issues i
		JOIN dependencies d ON i.id = d.issue_id
		WHERE d.depends_on_id = ? AND d.type = 'blocks' AND i.deleted_at IS NULL
		ORDER BY i.priority ASC
	`
		)
		.all(issueId) as Issue[];
}

// Get child issues for an epic (parent-child relationship)
export function getChildIssues(projectPath: string, epicId: string): Issue[] {
	const db = getProjectDb(projectPath);
	return db
		.prepare(
			`
		SELECT i.id, i.title, i.description, i.status, i.priority, i.issue_type,
		       i.assignee, i.created_at, i.created_by, i.updated_at, i.closed_at, i.close_reason
		FROM issues i
		JOIN dependencies d ON i.id = d.issue_id
		WHERE d.depends_on_id = ? AND d.type = 'parent-child' AND i.deleted_at IS NULL
		ORDER BY i.priority ASC, i.created_at ASC
	`
		)
		.all(epicId) as Issue[];
}

// Get child issues sorted by blocking dependencies (topological sort)
// Tasks that block others but aren't blocked come first, final tasks come last
export function getChildIssuesSorted(projectPath: string, epicId: string): Issue[] {
	const db = getProjectDb(projectPath);

	// Get all child issues
	const children = db
		.prepare(
			`
		SELECT i.id, i.title, i.description, i.status, i.priority, i.issue_type,
		       i.assignee, i.created_at, i.created_by, i.updated_at, i.closed_at, i.close_reason
		FROM issues i
		JOIN dependencies d ON i.id = d.issue_id
		WHERE d.depends_on_id = ? AND d.type = 'parent-child' AND i.deleted_at IS NULL
	`
		)
		.all(epicId) as Issue[];

	if (children.length === 0) return [];

	const childIds = children.map(c => c.id);
	const childMap = new Map(children.map(c => [c.id, c]));

	// Get blocking relationships between children only
	// d.issue_id is blocked by d.depends_on_id
	const placeholders = childIds.map(() => '?').join(',');
	const blockingRelations = db
		.prepare(
			`
		SELECT issue_id as blocked_id, depends_on_id as blocker_id
		FROM dependencies
		WHERE type = 'blocks'
		  AND issue_id IN (${placeholders})
		  AND depends_on_id IN (${placeholders})
	`
		)
		.all(...childIds, ...childIds) as { blocked_id: string; blocker_id: string }[];

	// Build adjacency list: blocker -> [tasks it blocks]
	// And track in-degree (how many tasks block each task)
	const blocksMap = new Map<string, string[]>(); // blocker -> blocked tasks
	const inDegree = new Map<string, number>(); // task -> number of blockers

	// Initialize
	for (const id of childIds) {
		blocksMap.set(id, []);
		inDegree.set(id, 0);
	}

	// Build graph
	for (const rel of blockingRelations) {
		blocksMap.get(rel.blocker_id)?.push(rel.blocked_id);
		inDegree.set(rel.blocked_id, (inDegree.get(rel.blocked_id) || 0) + 1);
	}

	// Kahn's algorithm for topological sort
	const sorted: Issue[] = [];
	const queue: string[] = [];

	// Start with tasks that have no blockers (in-degree = 0)
	for (const id of childIds) {
		if (inDegree.get(id) === 0) {
			queue.push(id);
		}
	}

	// Sort queue by priority initially (lower priority number = higher priority)
	queue.sort((a, b) => (childMap.get(a)?.priority || 0) - (childMap.get(b)?.priority || 0));

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		const issue = childMap.get(currentId);
		if (issue) {
			sorted.push(issue);
		}

		// Reduce in-degree for tasks this one blocks
		for (const blockedId of blocksMap.get(currentId) || []) {
			const newDegree = (inDegree.get(blockedId) || 1) - 1;
			inDegree.set(blockedId, newDegree);
			if (newDegree === 0) {
				queue.push(blockedId);
				// Keep queue sorted by priority
				queue.sort((a, b) => (childMap.get(a)?.priority || 0) - (childMap.get(b)?.priority || 0));
			}
		}
	}

	// Add any remaining tasks (in case of cycles or unconnected tasks)
	// These go at the end, sorted by priority
	const sortedIds = new Set(sorted.map(i => i.id));
	const remaining = children
		.filter(c => !sortedIds.has(c.id))
		.sort((a, b) => a.priority - b.priority);

	return [...sorted, ...remaining];
}

// Get parent issue if this task belongs to an epic
export function getParentIssue(projectPath: string, issueId: string): Issue | null {
	const db = getProjectDb(projectPath);
	const result = db
		.prepare(
			`
		SELECT i.id, i.title, i.description, i.status, i.priority, i.issue_type,
		       i.assignee, i.created_at, i.created_by, i.updated_at, i.closed_at, i.close_reason
		FROM issues i
		JOIN dependencies d ON i.id = d.depends_on_id
		WHERE d.issue_id = ? AND d.type = 'parent-child' AND i.deleted_at IS NULL
		LIMIT 1
	`
		)
		.get(issueId) as Issue | undefined;
	return result || null;
}

// Blocking relation between two issues
export interface BlockingRelation {
	source: string; // The blocker (this issue blocks the target)
	target: string; // The blocked issue (depends on source)
}

// Get blocking relations between children of an epic (for graph visualization)
export function getChildBlockingRelations(projectPath: string, epicId: string): BlockingRelation[] {
	const db = getProjectDb(projectPath);

	// Get all child IDs first
	const children = db
		.prepare(
			`
		SELECT i.id
		FROM issues i
		JOIN dependencies d ON i.id = d.issue_id
		WHERE d.depends_on_id = ? AND d.type = 'parent-child' AND i.deleted_at IS NULL
	`
		)
		.all(epicId) as { id: string }[];

	if (children.length === 0) return [];

	const childIds = children.map((c) => c.id);
	const placeholders = childIds.map(() => '?').join(',');

	// Get blocking relationships where both issues are children of this epic
	// d.issue_id is blocked by d.depends_on_id
	const relations = db
		.prepare(
			`
		SELECT depends_on_id as source, issue_id as target
		FROM dependencies
		WHERE type = 'blocks'
		  AND issue_id IN (${placeholders})
		  AND depends_on_id IN (${placeholders})
	`
		)
		.all(...childIds, ...childIds) as BlockingRelation[];

	return relations;
}

// Get full issue details with all relationships
export interface IssueWithDetails extends Issue {
	blockers: Issue[];
	blocked_by: Issue[];
	children: Issue[];
	parent: Issue | null;
	comments: Comment[];
	childBlockingRelations?: BlockingRelation[]; // For graph visualization
}

export function getIssueWithDetails(projectPath: string, issueId: string): IssueWithDetails | null {
	const issue = getIssueById(projectPath, issueId);
	if (!issue) return null;

	const children = getChildIssuesSorted(projectPath, issueId);

	return {
		...issue,
		blockers: getBlockersForIssue(projectPath, issueId),
		blocked_by: getBlockedByIssue(projectPath, issueId),
		children,
		parent: getParentIssue(projectPath, issueId),
		comments: getCommentsForIssue(projectPath, issueId),
		// Include blocking relations if this is an epic with children
		childBlockingRelations:
			issue.issue_type === 'epic' && children.length > 0
				? getChildBlockingRelations(projectPath, issueId)
				: undefined
	};
}

// ============== WRITE OPERATIONS ==============

// Update issue fields (title, description, status)
export function updateIssue(
	projectPath: string,
	issueId: string,
	updates: { title?: string; description?: string; status?: string }
): boolean {
	const db = getWritableProjectDb(projectPath);

	const setClauses: string[] = [];
	const values: (string | null)[] = [];

	if (updates.title !== undefined) {
		setClauses.push('title = ?');
		values.push(updates.title);
	}

	if (updates.description !== undefined) {
		setClauses.push('description = ?');
		values.push(updates.description);
	}

	if (updates.status !== undefined) {
		setClauses.push('status = ?');
		values.push(updates.status);
	}

	if (setClauses.length === 0) return false;

	// Always update updated_at
	setClauses.push('updated_at = datetime(\'now\')');

	values.push(issueId);

	const result = db
		.prepare(`UPDATE issues SET ${setClauses.join(', ')} WHERE id = ?`)
		.run(...values);

	return result.changes > 0;
}

// Get all descendant issues (children, grandchildren, etc.) for deletion preview
export function getAllDescendantIssues(projectPath: string, issueId: string): Issue[] {
	const db = getProjectDb(projectPath);
	const descendants: Issue[] = [];
	const visited = new Set<string>();

	function collectDescendants(parentId: string) {
		if (visited.has(parentId)) return;
		visited.add(parentId);

		const children = db
			.prepare(
				`
			SELECT i.id, i.title, i.description, i.status, i.priority, i.issue_type,
			       i.assignee, i.created_at, i.created_by, i.updated_at, i.closed_at, i.close_reason
			FROM issues i
			JOIN dependencies d ON i.id = d.issue_id
			WHERE d.depends_on_id = ? AND d.type = 'parent-child' AND i.deleted_at IS NULL
		`
			)
			.all(parentId) as Issue[];

		for (const child of children) {
			descendants.push(child);
			collectDescendants(child.id);
		}
	}

	collectDescendants(issueId);
	return descendants;
}

// Soft delete an issue and all its descendants
export function deleteIssueWithDescendants(projectPath: string, issueId: string): { deleted: string[] } {
	const db = getWritableProjectDb(projectPath);

	// Get all descendants first
	const descendants = getAllDescendantIssues(projectPath, issueId);
	const allIds = [issueId, ...descendants.map(d => d.id)];

	// Soft delete all issues by setting deleted_at
	const placeholders = allIds.map(() => '?').join(',');
	db.prepare(
		`UPDATE issues SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id IN (${placeholders})`
	).run(...allIds);

	// Also remove dependencies where these issues are involved
	db.prepare(
		`DELETE FROM dependencies WHERE issue_id IN (${placeholders}) OR depends_on_id IN (${placeholders})`
	).run(...allIds, ...allIds);

	return { deleted: allIds };
}
