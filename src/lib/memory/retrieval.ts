/**
 * Scoped retrieval logic for cmem (Persistent Memory) system
 *
 * Implements hierarchical memory retrieval following the scoping rules:
 * 1. Bead-scoped (default): All entries where bead_id = X
 * 2. Epic-scoped (fallback): All entries where epic_id = Y AND bead_id IS NULL
 * 3. Project-scoped: Only constraint entries where bead_id IS NULL AND epic_id IS NULL
 * 4. Active constraints: Non-expired constraint entries from any scope
 *
 * Also provides relevance ranking and token-budgeted brief generation.
 */

import type {
	MemoryEntry,
	MemoryKind,
	ScopedMemoryQuery,
	ScopedMemoryResult,
	MemoryBrief,
	MemoryBriefOptions,
	RankedMemory,
	MemoryRankingContext,
	MemoryEntryRow
} from './types';
import {
	TOKENS_PER_CHAR,
	DEFAULT_MEMORY_BRIEF_TOKENS,
	RECENCY_DECAY_DAYS,
	DEFAULT_MEMORY_LIMIT
} from './types';
import { getMemoryReader, memoryDbExists } from './db';

// ============================================================================
// Scoped Retrieval
// ============================================================================

/**
 * Get scoped memories following the hierarchy
 * Returns memories at bead, epic, and project levels
 *
 * Scoping rules:
 * - beadMemories: Entries directly scoped to the specified bead
 * - epicMemories: Entries scoped to the epic (excludes bead-specific)
 * - projectConstraints: Only constraints at project level (no bead/epic)
 * - activeConstraints: All non-expired constraints from any scope
 */
export function getScopedMemories(
	projectPath: string,
	query: ScopedMemoryQuery
): ScopedMemoryResult {
	// Return empty result if database doesn't exist
	if (!memoryDbExists(projectPath)) {
		return {
			beadMemories: [],
			epicMemories: [],
			projectConstraints: [],
			activeConstraints: []
		};
	}

	const db = getMemoryReader(projectPath);
	const now = new Date().toISOString();
	const limit = query.limit ?? DEFAULT_MEMORY_LIMIT;

	// Build base conditions for active entries
	const baseConditions: string[] = ['project_id = ?', 'deleted_at IS NULL'];
	if (!query.includeExpired) {
		baseConditions.push('(expires_at IS NULL OR expires_at > ?)');
	}

	// Kind filter
	const kindFilter =
		query.kinds && query.kinds.length > 0
			? `AND kind IN (${query.kinds.map(() => '?').join(', ')})`
			: '';

	// 1. Bead-scoped memories (direct match)
	let beadMemories: MemoryEntry[] = [];
	if (query.beadId) {
		const beadParams: (string | number)[] = [query.projectId];
		if (!query.includeExpired) {
			beadParams.push(now);
		}
		beadParams.push(query.beadId);
		if (query.kinds && query.kinds.length > 0) {
			beadParams.push(...query.kinds);
		}
		beadParams.push(limit);

		const beadRows = db
			.prepare(
				`
        SELECT * FROM memory_entries
        WHERE ${baseConditions.join(' AND ')}
          AND bead_id = ?
          ${kindFilter}
        ORDER BY relevance_score DESC, created_at DESC
        LIMIT ?
      `
			)
			.all(...beadParams) as MemoryEntryRow[];

		beadMemories = beadRows.map(rowToEntry);
	}

	// 2. Epic-scoped memories (fallback, excludes bead-specific entries)
	let epicMemories: MemoryEntry[] = [];
	if (query.epicId) {
		const epicParams: (string | number)[] = [query.projectId];
		if (!query.includeExpired) {
			epicParams.push(now);
		}
		epicParams.push(query.epicId);
		if (query.kinds && query.kinds.length > 0) {
			epicParams.push(...query.kinds);
		}
		epicParams.push(limit);

		const epicRows = db
			.prepare(
				`
        SELECT * FROM memory_entries
        WHERE ${baseConditions.join(' AND ')}
          AND epic_id = ?
          AND bead_id IS NULL
          ${kindFilter}
        ORDER BY relevance_score DESC, created_at DESC
        LIMIT ?
      `
			)
			.all(...epicParams) as MemoryEntryRow[];

		epicMemories = epicRows.map(rowToEntry);
	}

	// 3. Project-wide constraints only (prevents "global soup")
	const projectParams: (string | number)[] = [query.projectId];
	if (!query.includeExpired) {
		projectParams.push(now);
	}
	projectParams.push(limit);

	const projectRows = db
		.prepare(
			`
      SELECT * FROM memory_entries
      WHERE ${baseConditions.join(' AND ')}
        AND bead_id IS NULL
        AND epic_id IS NULL
        AND kind = 'constraint'
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT ?
    `
		)
		.all(...projectParams) as MemoryEntryRow[];

	const projectConstraints = projectRows.map(rowToEntry);

	// 4. Active constraints from all scopes
	const constraintParams: (string | number)[] = [
		query.projectId,
		now,
		query.beadId ?? '',
		query.epicId ?? '',
		limit
	];

	const constraintRows = db
		.prepare(
			`
      SELECT * FROM memory_entries
      WHERE project_id = ?
        AND kind = 'constraint'
        AND deleted_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY
        CASE
          WHEN bead_id = ? THEN 1
          WHEN epic_id = ? THEN 2
          ELSE 3
        END,
        relevance_score DESC
      LIMIT ?
    `
		)
		.all(...constraintParams) as MemoryEntryRow[];

	const activeConstraints = constraintRows.map(rowToEntry);

	return {
		beadMemories,
		epicMemories,
		projectConstraints,
		activeConstraints
	};
}

/**
 * Get active constraints (non-expired, any scope)
 */
export function getActiveConstraints(
	projectPath: string,
	projectId: string
): MemoryEntry[] {
	if (!memoryDbExists(projectPath)) {
		return [];
	}

	const db = getMemoryReader(projectPath);
	const now = new Date().toISOString();

	const rows = db
		.prepare(
			`
      SELECT * FROM memory_entries
      WHERE project_id = ?
        AND kind = 'constraint'
        AND deleted_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY relevance_score DESC, created_at DESC
    `
		)
		.all(projectId, now) as MemoryEntryRow[];

	return rows.map(rowToEntry);
}

// ============================================================================
// Relevance Ranking
// ============================================================================

/**
 * Calculate the number of days since a given date
 */
function getDaysSince(dateStr: string): number {
	const date = new Date(dateStr);
	const now = Date.now();
	const ageMs = now - date.getTime();
	return ageMs / (24 * 60 * 60 * 1000);
}

/**
 * Calculate relevance score for a memory entry
 *
 * Scoring factors:
 * - Base relevance (stored relevanceScore): weight 0.4
 * - Recency boost (decays over RECENCY_DECAY_DAYS): weight 0.3
 * - Scope proximity (bead > epic > project): weight 0.2
 * - Kind boost (constraints > decisions > others): weight 0.1
 */
function calculateRelevanceScore(
	entry: MemoryEntry,
	context: MemoryRankingContext
): {
	computedScore: number;
	scoreBreakdown: {
		baseRelevance: number;
		recencyBoost: number;
		scopeProximity: number;
		kindBoost: number;
	};
} {
	// 1. Base relevance from stored score
	const baseRelevance = entry.relevanceScore;

	// 2. Recency boost (1.0 for today, decays over RECENCY_DECAY_DAYS)
	const daysSinceCreation = getDaysSince(entry.createdAt);
	const recencyBoost = Math.max(0, 1 - daysSinceCreation / RECENCY_DECAY_DAYS);

	// 3. Scope proximity (closer = higher)
	let scopeProximity = 0.3; // Project level default
	if (context.beadId && entry.beadId === context.beadId) {
		scopeProximity = 1.0; // Exact bead match
	} else if (context.epicId && entry.epicId === context.epicId) {
		scopeProximity = 0.7; // Epic match
	}

	// 4. Kind boost (constraints always high)
	let kindBoost = 0;
	if (entry.kind === 'constraint') {
		kindBoost = 0.3;
	} else if (entry.kind === 'decision') {
		kindBoost = 0.2;
	} else if (entry.kind === 'checkpoint') {
		kindBoost = 0.1;
	}

	// Weighted combination
	const computedScore =
		baseRelevance * 0.4 + recencyBoost * 0.3 + scopeProximity * 0.2 + kindBoost * 0.1;

	return {
		computedScore,
		scoreBreakdown: {
			baseRelevance,
			recencyBoost,
			scopeProximity,
			kindBoost
		}
	};
}

/**
 * Rank memories by relevance
 * Factors: recency, scope proximity, kind priority
 */
export function rankMemories(
	memories: MemoryEntry[],
	context: MemoryRankingContext
): RankedMemory[] {
	return memories
		.map((memory) => {
			const { computedScore, scoreBreakdown } = calculateRelevanceScore(memory, context);
			return {
				...memory,
				computedScore,
				scoreBreakdown
			};
		})
		.sort((a, b) => b.computedScore - a.computedScore);
}

// ============================================================================
// Token Budgeting and Brief Generation
// ============================================================================

/**
 * Estimate token count from text
 * Uses conservative estimate: ~4 chars per token
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/**
 * Format a memory entry for inclusion in a brief
 */
function formatMemoryEntry(memory: MemoryEntry, includeScore: boolean = false): string {
	const scope = memory.beadId
		? `[bead:${memory.beadId}]`
		: memory.epicId
			? `[epic:${memory.epicId}]`
			: '[project]';

	const date = new Date(memory.createdAt).toLocaleDateString();

	let entry = `### ${memory.title} ${scope}
**${memory.kind}** - ${date}
${memory.content}
`;

	if (includeScore && 'computedScore' in memory) {
		const rankedMemory = memory as RankedMemory;
		entry += `_Score: ${rankedMemory.computedScore.toFixed(2)}_\n`;
	}

	return entry;
}

/**
 * Build memory brief for Claude injection
 * Respects token budget
 *
 * Strategy:
 * 1. Always include constraints first (if they fit)
 * 2. Add other memories by computed score
 * 3. Truncate when budget exceeded
 */
export function buildMemoryBrief(
	memories: MemoryEntry[],
	options?: MemoryBriefOptions
): MemoryBrief {
	const maxTokens = options?.maxTokens ?? DEFAULT_MEMORY_BRIEF_TOKENS;
	const prioritizeConstraints = options?.prioritizeConstraints ?? true;
	const includeScoreBreakdown = options?.includeScoreBreakdown ?? false;

	const lines: string[] = [];
	let tokenCount = 0;
	let includedCount = 0;
	let truncatedCount = 0;

	// Header
	const header = '## Memory Context\n';
	lines.push(header);
	tokenCount += estimateTokens(header);

	// Separate constraints from other memories if prioritizing
	let constraints: MemoryEntry[] = [];
	let others: MemoryEntry[] = [];

	if (prioritizeConstraints) {
		constraints = memories.filter((m) => m.kind === 'constraint');
		others = memories.filter((m) => m.kind !== 'constraint');
	} else {
		others = memories;
	}

	// Add constraints first (always included if they fit)
	for (const constraint of constraints) {
		const entry = formatMemoryEntry(constraint, includeScoreBreakdown);
		const entryTokens = estimateTokens(entry);

		if (tokenCount + entryTokens <= maxTokens) {
			lines.push(entry);
			tokenCount += entryTokens;
			includedCount++;
		} else {
			truncatedCount++;
		}
	}

	// Add other memories by score
	for (const memory of others) {
		const entry = formatMemoryEntry(memory, includeScoreBreakdown);
		const entryTokens = estimateTokens(entry);

		if (tokenCount + entryTokens <= maxTokens) {
			lines.push(entry);
			tokenCount += entryTokens;
			includedCount++;
		} else {
			truncatedCount++;
		}
	}

	// Footer if truncated
	if (truncatedCount > 0) {
		const footer = `\n_${truncatedCount} additional memories omitted for brevity._`;
		lines.push(footer);
		tokenCount += estimateTokens(footer);
	}

	return {
		text: lines.join('\n'),
		tokenEstimate: Math.ceil(tokenCount),
		includedCount,
		truncatedCount
	};
}

// ============================================================================
// Search
// ============================================================================

/**
 * Search memories by text query (simple LIKE search)
 *
 * Searches in title and content fields.
 */
export function searchMemories(
	projectPath: string,
	query: {
		projectId: string;
		searchText: string;
		beadId?: string;
		kinds?: MemoryKind[];
		limit?: number;
	}
): MemoryEntry[] {
	if (!memoryDbExists(projectPath)) {
		return [];
	}

	const db = getMemoryReader(projectPath);
	const now = new Date().toISOString();
	const limit = query.limit ?? DEFAULT_MEMORY_LIMIT;

	// Build search pattern
	const searchPattern = `%${query.searchText}%`;

	const conditions: string[] = [
		'project_id = ?',
		'deleted_at IS NULL',
		'(expires_at IS NULL OR expires_at > ?)',
		'(title LIKE ? OR content LIKE ?)'
	];
	const params: (string | number)[] = [query.projectId, now, searchPattern, searchPattern];

	// Bead filter
	if (query.beadId) {
		conditions.push('bead_id = ?');
		params.push(query.beadId);
	}

	// Kind filter
	if (query.kinds && query.kinds.length > 0) {
		const placeholders = query.kinds.map(() => '?').join(', ');
		conditions.push(`kind IN (${placeholders})`);
		params.push(...query.kinds);
	}

	params.push(limit);

	const rows = db
		.prepare(
			`
      SELECT * FROM memory_entries
      WHERE ${conditions.join(' AND ')}
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT ?
    `
		)
		.all(...params) as MemoryEntryRow[];

	return rows.map(rowToEntry);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a database row to a MemoryEntry object
 * (Duplicated from db.ts to avoid circular dependency)
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
