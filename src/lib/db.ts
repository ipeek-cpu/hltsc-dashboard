import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const BEADS_DB_PATH = path.resolve(process.cwd(), '.beads/beads.db');

let db: Database.Database | null = null;
let lastConnectionAttempt = 0;
const CONNECTION_RETRY_INTERVAL = 5000; // 5 seconds between retry attempts

/**
 * Database connection error with user-friendly messaging
 */
export class DatabaseError extends Error {
	constructor(
		message: string,
		public readonly code: 'NOT_FOUND' | 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'TIMEOUT',
		public readonly path?: string
	) {
		super(message);
		this.name = 'DatabaseError';
	}
}

/**
 * Database health status for monitoring
 */
export interface DatabaseHealth {
	connected: boolean;
	path: string;
	exists: boolean;
	walMode: boolean;
	dataVersion: number | null;
	error: string | null;
}

/**
 * Check if the database file exists
 */
export function databaseExists(): boolean {
	return fs.existsSync(BEADS_DB_PATH);
}

/**
 * Get the database path
 */
export function getDatabasePath(): string {
	return BEADS_DB_PATH;
}

/**
 * Get comprehensive database health status
 */
export function getDatabaseHealth(): DatabaseHealth {
	const health: DatabaseHealth = {
		connected: false,
		path: BEADS_DB_PATH,
		exists: databaseExists(),
		walMode: false,
		dataVersion: null,
		error: null
	};

	if (!health.exists) {
		health.error = `Database not found at ${BEADS_DB_PATH}. Run 'bd init' to initialize Beads.`;
		return health;
	}

	try {
		const database = getDb();
		health.connected = true;

		const journalMode = database.pragma('journal_mode', { simple: true });
		health.walMode = journalMode === 'wal';

		health.dataVersion = database.pragma('data_version', { simple: true }) as number;
	} catch (error) {
		health.error = error instanceof Error ? error.message : 'Unknown connection error';
	}

	return health;
}

/**
 * Close the database connection (for cleanup or reconnection)
 */
export function closeDb(): void {
	if (db) {
		try {
			db.close();
		} catch {
			// Ignore close errors
		}
		db = null;
	}
}

/**
 * Get database connection with existence check and graceful error handling
 */
function getDb(): Database.Database {
	// Return existing connection if valid
	if (db) {
		try {
			// Quick health check - if this fails, connection is stale
			db.pragma('data_version', { simple: true });
			return db;
		} catch {
			// Connection is stale, close and reconnect
			closeDb();
		}
	}

	// Rate limit reconnection attempts
	const now = Date.now();
	if (now - lastConnectionAttempt < CONNECTION_RETRY_INTERVAL && lastConnectionAttempt > 0) {
		throw new DatabaseError(
			'Database connection recently failed. Waiting before retry.',
			'CONNECTION_FAILED',
			BEADS_DB_PATH
		);
	}
	lastConnectionAttempt = now;

	// Check if database file exists
	if (!databaseExists()) {
		throw new DatabaseError(
			`Beads database not found at ${BEADS_DB_PATH}. ` +
				`Make sure you have initialized Beads in this project by running 'bd init'.`,
			'NOT_FOUND',
			BEADS_DB_PATH
		);
	}

	try {
		db = new Database(BEADS_DB_PATH, {
			readonly: true,
			timeout: 5000 // 5 second timeout for locks
		});
		db.pragma('journal_mode = WAL');
		lastConnectionAttempt = 0; // Reset on successful connection
		return db;
	} catch (error) {
		const message =
			error instanceof Error
				? `Failed to connect to Beads database: ${error.message}`
				: 'Failed to connect to Beads database';
		throw new DatabaseError(message, 'CONNECTION_FAILED', BEADS_DB_PATH);
	}
}

/**
 * Execute a database query with error handling
 */
function safeQuery<T>(queryFn: (db: Database.Database) => T, fallback: T): T {
	try {
		return queryFn(getDb());
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		const message = error instanceof Error ? error.message : 'Query failed';
		throw new DatabaseError(message, 'QUERY_FAILED');
	}
}

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

export function getAllIssues(): Issue[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, description, status, priority, issue_type,
           assignee, created_at, created_by, updated_at, closed_at, close_reason
    FROM issues
    WHERE deleted_at IS NULL
    ORDER BY priority ASC, updated_at DESC
  `).all() as Issue[];
}

export function getIssuesByStatus(status: string): Issue[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, description, status, priority, issue_type,
           assignee, created_at, created_by, updated_at, closed_at, close_reason
    FROM issues
    WHERE status = ? AND deleted_at IS NULL
    ORDER BY priority ASC, updated_at DESC
  `).all(status) as Issue[];
}

export function getIssueById(id: string): Issue | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, description, status, priority, issue_type,
           assignee, created_at, created_by, updated_at, closed_at, close_reason
    FROM issues
    WHERE id = ?
  `).get(id) as Issue | undefined;
}

export function getCommentsForIssue(issueId: string): Comment[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, issue_id, author, text, created_at
    FROM comments
    WHERE issue_id = ?
    ORDER BY created_at ASC
  `).all(issueId) as Comment[];
}

export function getRecentEvents(since?: string, limit = 100): Event[] {
  const db = getDb();
  if (since) {
    return db.prepare(`
      SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
      FROM events
      WHERE created_at > ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(since, limit) as Event[];
  }
  return db.prepare(`
    SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
    FROM events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Event[];
}

export function getDataVersion(): number {
  const db = getDb();
  const result = db.pragma('data_version', { simple: true });
  return result as number;
}

export function getIssueStats(): { status: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT status, COUNT(*) as count
    FROM issues
    WHERE deleted_at IS NULL
    GROUP BY status
  `).all() as { status: string; count: number }[];
}
