import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { CachedIntent } from './intent/types';

const DASHBOARD_DIR = path.join(os.homedir(), '.beads-dashboard');
const DASHBOARD_DB_PATH = path.join(DASHBOARD_DIR, 'dashboard.db');

let db: Database.Database | null = null;

function ensureDir(): void {
	if (!fs.existsSync(DASHBOARD_DIR)) {
		fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
	}
}

function getDb(): Database.Database {
	if (!db) {
		ensureDir();
		db = new Database(DASHBOARD_DB_PATH);
		db.pragma('journal_mode = WAL');
		initSchema();
	}
	return db;
}

function initSchema(): void {
	const database = db!;
	database.exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			path TEXT NOT NULL UNIQUE,
			added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_accessed DATETIME
		)
	`);

	// Migration: Add dev_config column if it doesn't exist
	const columns = database.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
	const hasDevConfig = columns.some(col => col.name === 'dev_config');
	if (!hasDevConfig) {
		database.exec('ALTER TABLE projects ADD COLUMN dev_config TEXT');
	}

	// Migration: Add profile_settings column if it doesn't exist
	const hasProfileSettings = columns.some(col => col.name === 'profile_settings');
	if (!hasProfileSettings) {
		database.exec('ALTER TABLE projects ADD COLUMN profile_settings TEXT');
	}

	// Migration: Add project_intents table for caching parsed PROJECT_INTENT.md files
	// This is a CACHE table - the source of truth is always the PROJECT_INTENT.md file
	const intentTableExists = database.prepare(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='project_intents'"
	).get();
	if (!intentTableExists) {
		database.exec(`
			CREATE TABLE IF NOT EXISTS project_intents (
				project_id TEXT PRIMARY KEY,
				file_hash TEXT NOT NULL,
				parsed_at TEXT NOT NULL,
				version INTEGER NOT NULL,
				content TEXT NOT NULL,
				anchors TEXT NOT NULL,
				sections TEXT
			);
			CREATE INDEX IF NOT EXISTS idx_project_intents_hash ON project_intents(file_hash);
		`);
	}
}

export interface DevServerConfig {
	framework: string;           // 'nextjs' | 'sveltekit' | 'vite' | 'expo' | 'shopify' | 'remix' | 'astro'
	devCommand: string;          // 'npm run dev' or 'bun dev'
	defaultPort: number;         // 3000, 5173, 4321, 8081
	hotReloadSupported: boolean;
	detectedAt: string;          // ISO timestamp
	previewUrl?: string;         // For Shopify themes - the myshopify.com preview URL
}

export interface CustomAction {
	id: string;
	label: string;
	icon: string;
	command: string;
	description?: string;
	requiresConfirmation?: boolean;
}

export interface ProfileSettings {
	selectedProfiles: string[];  // Array of profile IDs (supports monorepos)
	isAutoDetected: boolean;     // Whether using auto-detected profiles
	customActions: CustomAction[]; // Project-specific custom actions
	updatedAt: string;           // ISO timestamp
}

export interface Project {
	id: string;
	name: string;
	path: string;
	added_at: string;
	last_accessed: string | null;
	dev_config?: string | null;      // JSON string of DevServerConfig
	profile_settings?: string | null; // JSON string of ProfileSettings
}

export interface ProjectWithStats extends Project {
	open_count: number;
	in_progress_count: number;
	in_review_count: number;
	total_count: number;
	beads_version: string | null;
	beads_outdated: boolean;
	folder_missing: boolean;
}

function generateId(): string {
	return crypto.randomUUID();
}

export function getAllProjects(): Project[] {
	const database = getDb();
	return database
		.prepare('SELECT * FROM projects ORDER BY last_accessed DESC, added_at DESC')
		.all() as Project[];
}

export function getProjectById(id: string): Project | undefined {
	const database = getDb();
	return database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function getProjectByPath(projectPath: string): Project | undefined {
	const database = getDb();
	return database.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath) as
		| Project
		| undefined;
}

export function addProject(projectPath: string, name?: string): Project {
	const database = getDb();
	const id = generateId();
	const projectName = name || path.basename(projectPath);

	database
		.prepare('INSERT INTO projects (id, name, path) VALUES (?, ?, ?)')
		.run(id, projectName, projectPath);

	return getProjectById(id)!;
}

export function updateProjectLastAccessed(id: string): void {
	const database = getDb();
	database
		.prepare('UPDATE projects SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?')
		.run(id);
}

export function updateProjectName(id: string, name: string): void {
	const database = getDb();
	database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
}

export function updateProjectPath(id: string, newPath: string): void {
	const database = getDb();
	database.prepare('UPDATE projects SET path = ? WHERE id = ?').run(newPath, id);
}

export function getProjectProfileSettings(id: string): ProfileSettings | null {
	const database = getDb();
	const row = database.prepare('SELECT profile_settings FROM projects WHERE id = ?').get(id) as { profile_settings: string | null } | undefined;
	if (!row?.profile_settings) return null;
	try {
		return JSON.parse(row.profile_settings) as ProfileSettings;
	} catch {
		return null;
	}
}

export function setProjectProfileSettings(id: string, settings: ProfileSettings): void {
	const database = getDb();
	database.prepare('UPDATE projects SET profile_settings = ? WHERE id = ?').run(
		JSON.stringify(settings),
		id
	);
}

export function removeProject(id: string): void {
	const database = getDb();
	database.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function projectExists(projectPath: string): boolean {
	return getProjectByPath(projectPath) !== undefined;
}

export function validateProjectPath(projectPath: string): {
	valid: boolean;
	error?: string;
	needsInit?: boolean;
	hasBeadsDir?: boolean;
} {
	// Check if path exists
	if (!fs.existsSync(projectPath)) {
		return { valid: false, error: 'Path does not exist' };
	}

	// Check if it's a directory
	const stats = fs.statSync(projectPath);
	if (!stats.isDirectory()) {
		return { valid: false, error: 'Path is not a directory' };
	}

	// Check if .beads directory exists
	const beadsDir = path.join(projectPath, '.beads');
	const hasBeadsDir = fs.existsSync(beadsDir);

	// Check if .beads/beads.db exists
	const beadsDbPath = path.join(projectPath, '.beads', 'beads.db');
	if (!fs.existsSync(beadsDbPath)) {
		// Return needsInit flag so the UI can offer to initialize beads
		// Also return hasBeadsDir so UI can auto-repair if .beads exists
		return {
			valid: false,
			error: 'No beads database found in this directory',
			needsInit: true,
			hasBeadsDir
		};
	}

	// Check if already added
	if (projectExists(projectPath)) {
		return { valid: false, error: 'This project is already added' };
	}

	return { valid: true };
}

export function getProjectDevConfig(id: string): DevServerConfig | null {
	const database = getDb();
	const result = database.prepare('SELECT dev_config FROM projects WHERE id = ?').get(id) as { dev_config: string | null } | undefined;
	if (!result?.dev_config) return null;
	try {
		return JSON.parse(result.dev_config) as DevServerConfig;
	} catch {
		return null;
	}
}

export function setProjectDevConfig(id: string, config: DevServerConfig): void {
	const database = getDb();
	database.prepare('UPDATE projects SET dev_config = ? WHERE id = ?').run(JSON.stringify(config), id);
}

export function clearProjectDevConfig(id: string): void {
	const database = getDb();
	database.prepare('UPDATE projects SET dev_config = NULL WHERE id = ?').run(id);
}

// ============================================================================
// Intent Cache Operations
// ============================================================================

/**
 * Database row type for project_intents table
 */
interface IntentCacheRow {
	project_id: string;
	file_hash: string;
	parsed_at: string;
	version: number;
	content: string;
	anchors: string;
	sections: string | null;
}

/**
 * Get cached intent for a project
 *
 * @param projectId - The project ID to look up
 * @returns Cached intent or null if not found
 */
export function getCachedIntent(projectId: string): CachedIntent | null {
	const database = getDb();
	const row = database
		.prepare('SELECT * FROM project_intents WHERE project_id = ?')
		.get(projectId) as IntentCacheRow | undefined;

	if (!row) return null;

	return {
		projectId: row.project_id,
		fileHash: row.file_hash,
		parsedAt: row.parsed_at,
		version: row.version,
		content: row.content,
		anchors: JSON.parse(row.anchors) as string[]
	};
}

/**
 * Store or update cached intent for a project
 *
 * @param intent - The cached intent to store
 */
export function setCachedIntent(intent: CachedIntent): void {
	const database = getDb();
	database
		.prepare(
			`INSERT OR REPLACE INTO project_intents
			(project_id, file_hash, parsed_at, version, content, anchors, sections)
			VALUES (?, ?, ?, ?, ?, ?, NULL)`
		)
		.run(
			intent.projectId,
			intent.fileHash,
			intent.parsedAt,
			intent.version,
			intent.content,
			JSON.stringify(intent.anchors)
		);
}

/**
 * Delete cached intent for a project
 *
 * @param projectId - The project ID to delete cache for
 * @returns true if a row was deleted, false otherwise
 */
export function deleteCachedIntent(projectId: string): boolean {
	const database = getDb();
	const result = database
		.prepare('DELETE FROM project_intents WHERE project_id = ?')
		.run(projectId);
	return result.changes > 0;
}

/**
 * Check if the intent cache is valid by comparing file hashes
 *
 * This is the primary cache invalidation mechanism. If the file hash
 * has changed, the cache is stale and should be refreshed.
 *
 * @param projectId - The project ID to check
 * @param currentHash - SHA-256 hash of the current file content
 * @returns true if cache is valid (hashes match), false if stale or not found
 */
export function isIntentCacheValid(projectId: string, currentHash: string): boolean {
	const database = getDb();
	const row = database
		.prepare('SELECT file_hash FROM project_intents WHERE project_id = ?')
		.get(projectId) as { file_hash: string } | undefined;

	if (!row) return false;
	return row.file_hash === currentHash;
}
