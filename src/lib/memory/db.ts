/**
 * Database operations for cmem (Persistent Memory) system
 *
 * Manages SQLite database for memory entries with append-only semantics.
 * Location: <project_root>/.beads/memory.db
 *
 * Design principles:
 * - Append-only: Normal operations never UPDATE or DELETE rows
 * - Soft deletes: set deleted_at timestamp instead of DELETE
 * - WAL mode: Better concurrency with multiple readers, single writer
 * - Scoped retrieval: bead -> epic -> project (constraints only)
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type {
	MemoryEntry,
	CreateMemoryEntry,
	MemoryEntryRow,
	MemoryKind
} from './types';
import { MEMORY_KINDS, DEFAULT_RELEVANCE_SCORE } from './types';

// ============================================================================
// Database Path Helpers
// ============================================================================

/**
 * Get the path to the memory database for a project
 */
export function getMemoryDbPath(projectPath: string): string {
	return join(projectPath, '.beads', 'memory.db');
}

// ============================================================================
// Connection Management
// ============================================================================

// Singleton writer connection per database path
const writerConnections = new Map<string, Database.Database>();

// Reader connections pool per database path
const readerConnections = new Map<string, Database.Database[]>();
const MAX_READERS = 3;

/**
 * Schema DDL for memory_entries table
 */
const SCHEMA_DDL = `
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 10000;
PRAGMA foreign_keys = OFF;

-- Main memory entries table
CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  bead_id TEXT,
  epic_id TEXT,
  session_id TEXT,
  chat_id TEXT,
  agent_name TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('decision', 'checkpoint', 'constraint', 'next_step', 'action_report', 'ci_note')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data TEXT,
  intent_anchors TEXT,
  relevance_score REAL DEFAULT 1.0,
  expires_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary retrieval indexes
CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entries(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_bead ON memory_entries(bead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_epic ON memory_entries(epic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_kind ON memory_entries(kind) WHERE deleted_at IS NULL;

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_entries(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_entries(expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

-- Constraint retrieval
CREATE INDEX IF NOT EXISTS idx_memory_constraints ON memory_entries(project_id, kind) WHERE kind = 'constraint' AND deleted_at IS NULL;

-- Session traceability
CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_entries(session_id, chat_id) WHERE deleted_at IS NULL;
`;

/**
 * Initialize the memory database with schema
 * Creates the database file and tables if they don't exist
 */
export function initMemoryDb(projectPath: string): Database.Database {
	const dbPath = getMemoryDbPath(projectPath);

	// Ensure .beads directory exists
	const dbDir = dirname(dbPath);
	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	// Create or open database
	const db = new Database(dbPath, { timeout: 10000 });

	// Run schema DDL
	db.exec(SCHEMA_DDL);

	return db;
}

/**
 * Get a read-only connection to the memory database
 * Returns from pool if available, creates new if under limit
 */
export function getMemoryReader(projectPath: string): Database.Database {
	const dbPath = getMemoryDbPath(projectPath);

	// Check if database exists
	if (!existsSync(dbPath)) {
		throw new MemoryDatabaseError(
			`Memory database not found at ${dbPath}. Initialize with initMemoryDb() first.`,
			'DB_NOT_FOUND',
			dbPath
		);
	}

	// Get or create readers pool for this path
	let readers = readerConnections.get(dbPath);
	if (!readers) {
		readers = [];
		readerConnections.set(dbPath, readers);
	}

	// Try to reuse existing reader
	for (const reader of readers) {
		try {
			// Health check
			reader.pragma('data_version', { simple: true });
			return reader;
		} catch {
			// Reader is stale, remove it
			const idx = readers.indexOf(reader);
			if (idx >= 0) readers.splice(idx, 1);
		}
	}

	// Create new reader if under limit
	if (readers.length < MAX_READERS) {
		try {
			const reader = new Database(dbPath, { readonly: true, timeout: 5000 });
			reader.pragma('journal_mode = WAL');
			readers.push(reader);
			return reader;
		} catch (error) {
			throw new MemoryDatabaseError(
				`Failed to connect to memory database: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'DB_CONNECTION_FAILED',
				dbPath
			);
		}
	}

	// Fallback to first reader (should rarely happen)
	if (readers.length > 0) {
		return readers[0];
	}

	throw new MemoryDatabaseError(
		'No reader connections available',
		'DB_CONNECTION_FAILED',
		dbPath
	);
}

/**
 * Get the write connection to the memory database
 * Creates database and schema if it doesn't exist
 */
export function getMemoryWriter(projectPath: string): Database.Database {
	const dbPath = getMemoryDbPath(projectPath);

	// Check for existing connection
	const existing = writerConnections.get(dbPath);
	if (existing) {
		try {
			// Health check
			existing.pragma('data_version', { simple: true });
			return existing;
		} catch {
			// Connection is stale, close and recreate
			try {
				existing.close();
			} catch {
				// Ignore close errors
			}
			writerConnections.delete(dbPath);
		}
	}

	// Initialize database if it doesn't exist
	if (!existsSync(dbPath)) {
		const db = initMemoryDb(projectPath);
		writerConnections.set(dbPath, db);
		return db;
	}

	// Open existing database
	try {
		const db = new Database(dbPath, { timeout: 10000 });
		db.pragma('journal_mode = WAL');
		db.pragma('busy_timeout = 10000');
		writerConnections.set(dbPath, db);
		return db;
	} catch (error) {
		throw new MemoryDatabaseError(
			`Failed to connect to memory database: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'DB_CONNECTION_FAILED',
			dbPath
		);
	}
}

/**
 * Close all memory database connections
 */
export function closeMemoryDb(projectPath?: string): void {
	if (projectPath) {
		const dbPath = getMemoryDbPath(projectPath);

		// Close writer
		const writer = writerConnections.get(dbPath);
		if (writer) {
			try {
				writer.close();
			} catch {
				// Ignore
			}
			writerConnections.delete(dbPath);
		}

		// Close readers
		const readers = readerConnections.get(dbPath);
		if (readers) {
			for (const reader of readers) {
				try {
					reader.close();
				} catch {
					// Ignore
				}
			}
			readerConnections.delete(dbPath);
		}
	} else {
		// Close all connections
		for (const [, writer] of writerConnections) {
			try {
				writer.close();
			} catch {
				// Ignore
			}
		}
		writerConnections.clear();

		for (const [, readers] of readerConnections) {
			for (const reader of readers) {
				try {
					reader.close();
				} catch {
					// Ignore
				}
			}
		}
		readerConnections.clear();
	}
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new memory entry
 * @returns The ID of the created entry
 */
export function createMemoryEntry(
	projectPath: string,
	entry: CreateMemoryEntry
): string {
	const db = getMemoryWriter(projectPath);
	const id = randomUUID();
	const now = new Date().toISOString();

	// Validate kind
	if (!MEMORY_KINDS.includes(entry.kind)) {
		throw new MemoryDatabaseError(
			`Invalid memory kind: ${entry.kind}. Must be one of: ${MEMORY_KINDS.join(', ')}`,
			'INVALID_ENTRY'
		);
	}

	// Validate required fields
	if (!entry.title?.trim()) {
		throw new MemoryDatabaseError('Title is required', 'INVALID_ENTRY');
	}
	if (!entry.content?.trim()) {
		throw new MemoryDatabaseError('Content is required', 'INVALID_ENTRY');
	}
	if (!entry.projectId?.trim()) {
		throw new MemoryDatabaseError('Project ID is required', 'INVALID_ENTRY');
	}

	const stmt = db.prepare(`
    INSERT INTO memory_entries (
      id, project_id, bead_id, epic_id, session_id, chat_id, agent_name,
      kind, title, content, data, intent_anchors, relevance_score, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

	stmt.run(
		id,
		entry.projectId,
		entry.beadId ?? null,
		entry.epicId ?? null,
		entry.sessionId ?? null,
		entry.chatId ?? null,
		entry.agentName ?? null,
		entry.kind,
		entry.title,
		entry.content,
		entry.data ? JSON.stringify(entry.data) : null,
		entry.intentAnchors ? JSON.stringify(entry.intentAnchors) : null,
		entry.relevanceScore ?? DEFAULT_RELEVANCE_SCORE,
		entry.expiresAt ?? null,
		now
	);

	return id;
}

/**
 * Get a memory entry by ID
 */
export function getMemoryEntry(
	projectPath: string,
	entryId: string
): MemoryEntry | null {
	const db = getMemoryReader(projectPath);

	const row = db
		.prepare('SELECT * FROM memory_entries WHERE id = ?')
		.get(entryId) as MemoryEntryRow | undefined;

	if (!row) {
		return null;
	}

	return rowToEntry(row);
}

/**
 * List options for querying memory entries
 */
export interface ListMemoryOptions {
	projectId: string;
	beadId?: string;
	epicId?: string;
	kinds?: MemoryKind[];
	limit?: number;
	includeDeleted?: boolean;
	includeExpired?: boolean;
}

/**
 * List memory entries with filtering options
 */
export function listMemoryEntries(
	projectPath: string,
	options: ListMemoryOptions
): MemoryEntry[] {
	const db = getMemoryReader(projectPath);
	const now = new Date().toISOString();

	const conditions: string[] = ['project_id = ?'];
	const params: (string | number)[] = [options.projectId];

	// Bead filter
	if (options.beadId) {
		conditions.push('bead_id = ?');
		params.push(options.beadId);
	}

	// Epic filter
	if (options.epicId) {
		conditions.push('epic_id = ?');
		params.push(options.epicId);
	}

	// Kind filter
	if (options.kinds && options.kinds.length > 0) {
		const placeholders = options.kinds.map(() => '?').join(', ');
		conditions.push(`kind IN (${placeholders})`);
		params.push(...options.kinds);
	}

	// Deleted filter
	if (!options.includeDeleted) {
		conditions.push('deleted_at IS NULL');
	}

	// Expired filter
	if (!options.includeExpired) {
		conditions.push('(expires_at IS NULL OR expires_at > ?)');
		params.push(now);
	}

	const whereClause = conditions.join(' AND ');
	const limit = options.limit ?? 50;
	params.push(limit);

	const rows = db
		.prepare(
			`
      SELECT * FROM memory_entries
      WHERE ${whereClause}
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT ?
    `
		)
		.all(...params) as MemoryEntryRow[];

	return rows.map(rowToEntry);
}

/**
 * Soft delete a memory entry (sets deleted_at timestamp)
 * @returns true if entry was deleted, false if not found
 */
export function softDeleteMemoryEntry(
	projectPath: string,
	entryId: string
): boolean {
	const db = getMemoryWriter(projectPath);
	const now = new Date().toISOString();

	const result = db
		.prepare(
			`
      UPDATE memory_entries
      SET deleted_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `
		)
		.run(now, entryId);

	return result.changes > 0;
}

/**
 * Update the relevance score of a memory entry
 * This is one of the few allowed UPDATE operations (doesn't change content)
 */
export function updateRelevanceScore(
	projectPath: string,
	entryId: string,
	score: number
): boolean {
	if (score < 0 || score > 1) {
		throw new MemoryDatabaseError(
			'Relevance score must be between 0 and 1',
			'INVALID_ENTRY'
		);
	}

	const db = getMemoryWriter(projectPath);

	const result = db
		.prepare(
			`
      UPDATE memory_entries
      SET relevance_score = ?
      WHERE id = ? AND deleted_at IS NULL
    `
		)
		.run(score, entryId);

	return result.changes > 0;
}

// ============================================================================
// Cleanup Operations (Admin Only)
// ============================================================================

/**
 * Hard delete soft-deleted entries older than specified days
 * This is an admin operation, not exposed to normal API
 */
export function purgeDeletedEntries(
	projectPath: string,
	olderThanDays: number = 30
): number {
	const db = getMemoryWriter(projectPath);

	const result = db
		.prepare(
			`
      DELETE FROM memory_entries
      WHERE deleted_at IS NOT NULL
        AND deleted_at < datetime('now', '-' || ? || ' days')
    `
		)
		.run(olderThanDays);

	return result.changes;
}

/**
 * Soft delete expired entries
 */
export function expireOldEntries(projectPath: string): number {
	const db = getMemoryWriter(projectPath);
	const now = new Date().toISOString();

	const result = db
		.prepare(
			`
      UPDATE memory_entries
      SET deleted_at = ?
      WHERE expires_at IS NOT NULL
        AND expires_at < ?
        AND deleted_at IS NULL
    `
		)
		.run(now, now);

	return result.changes;
}

// ============================================================================
// Row Conversion Helpers
// ============================================================================

/**
 * Convert a database row to a MemoryEntry object
 */
function rowToEntry(row: MemoryEntryRow): MemoryEntry {
	return {
		id: row.id,
		projectId: row.project_id,
		beadId: row.bead_id ?? undefined,
		epicId: row.epic_id ?? undefined,
		sessionId: row.session_id ?? undefined,
		chatId: row.chat_id ?? undefined,
		agentName: row.agent_name ?? undefined,
		kind: row.kind as MemoryKind,
		title: row.title,
		content: row.content,
		data: row.data ? JSON.parse(row.data) : undefined,
		intentAnchors: row.intent_anchors ? JSON.parse(row.intent_anchors) : undefined,
		relevanceScore: row.relevance_score,
		expiresAt: row.expires_at ?? undefined,
		deletedAt: row.deleted_at ?? undefined,
		createdAt: row.created_at
	};
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error type for memory database operations
 */
export class MemoryDatabaseError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'DB_NOT_FOUND'
			| 'DB_CONNECTION_FAILED'
			| 'INVALID_ENTRY'
			| 'ENTRY_NOT_FOUND'
			| 'QUERY_FAILED',
		public readonly path?: string
	) {
		super(message);
		this.name = 'MemoryDatabaseError';
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the memory database exists for a project
 */
export function memoryDbExists(projectPath: string): boolean {
	return existsSync(getMemoryDbPath(projectPath));
}

/**
 * Get memory database statistics
 */
export function getMemoryStats(
	projectPath: string,
	projectId: string
): {
	totalEntries: number;
	activeEntries: number;
	deletedEntries: number;
	entriesByKind: Record<MemoryKind, number>;
} {
	const db = getMemoryReader(projectPath);

	const total = db
		.prepare('SELECT COUNT(*) as count FROM memory_entries WHERE project_id = ?')
		.get(projectId) as { count: number };

	const active = db
		.prepare(
			'SELECT COUNT(*) as count FROM memory_entries WHERE project_id = ? AND deleted_at IS NULL'
		)
		.get(projectId) as { count: number };

	const deleted = db
		.prepare(
			'SELECT COUNT(*) as count FROM memory_entries WHERE project_id = ? AND deleted_at IS NOT NULL'
		)
		.get(projectId) as { count: number };

	const kindCounts = db
		.prepare(
			`
      SELECT kind, COUNT(*) as count
      FROM memory_entries
      WHERE project_id = ? AND deleted_at IS NULL
      GROUP BY kind
    `
		)
		.all(projectId) as { kind: string; count: number }[];

	const entriesByKind: Record<MemoryKind, number> = {
		decision: 0,
		checkpoint: 0,
		constraint: 0,
		next_step: 0,
		action_report: 0,
		ci_note: 0
	};

	for (const row of kindCounts) {
		if (row.kind in entriesByKind) {
			entriesByKind[row.kind as MemoryKind] = row.count;
		}
	}

	return {
		totalEntries: total.count,
		activeEntries: active.count,
		deletedEntries: deleted.count,
		entriesByKind
	};
}
