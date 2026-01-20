/**
 * Action Report Persistence
 *
 * Persists Quick Action execution results as memory entries (kind='action_report')
 * for audit trail and "Send to Claude" functionality.
 *
 * Design:
 * - Action reports stored in memory.db with kind='action_report'
 * - Full stdout/stderr capture for debugging
 * - Environment sanitization to prevent credential leakage
 * - "Send to Claude" tracking for audit purposes
 */

import { createMemoryEntry, listMemoryEntries, getMemoryEntry, getMemoryWriter } from './db';
import type { ActionExecutionRecord, MemoryEntry, CreateMemoryEntry } from './types';

// ============================================================================
// Action Report Persistence
// ============================================================================

/**
 * Persist an action execution report as a memory entry
 * Returns the created memory entry ID
 */
export function persistActionReport(
	projectPath: string,
	projectId: string,
	record: ActionExecutionRecord
): string {
	// Build formatted content
	const content = formatActionReportContent(record);

	// Create memory entry with kind='action_report'
	return createMemoryEntry(projectPath, {
		projectId,
		beadId: record.beadId,
		sessionId: record.sessionId,
		chatId: record.chatId,
		kind: 'action_report',
		title: `Action: ${record.label}`,
		content,
		data: {
			actionId: record.actionId,
			command: record.command,
			resolvedCommand: record.resolvedCommand,
			exitCode: record.exitCode,
			durationMs: record.durationMs,
			workingDirectory: record.workingDirectory,
			profileUsed: record.profileUsed,
			startedAt: record.startedAt,
			completedAt: record.completedAt,
			sentToChat: record.sentToChat
		}
	});
}

/**
 * Format action report for storage/display
 */
function formatActionReportContent(record: ActionExecutionRecord): string {
	const status = record.exitCode === 0 ? 'SUCCESS' : 'FAILED';

	let content = `## Action Report: ${record.label}

**Status:** ${status} (exit code ${record.exitCode})
**Duration:** ${record.durationMs}ms
**Profile:** ${record.profileUsed}
**Working Directory:** ${record.workingDirectory}

### Command
\`\`\`
${record.resolvedCommand}
\`\`\`

### Output
\`\`\`
${record.stdout || '(no output)'}
\`\`\``;

	if (record.stderr) {
		content += `

### Errors
\`\`\`
${record.stderr}
\`\`\``;
	}

	return content;
}

// ============================================================================
// Action Report Retrieval
// ============================================================================

/**
 * Get recent action reports for a project
 */
export function getRecentActionReports(
	projectPath: string,
	projectId: string,
	options?: {
		beadId?: string;
		sessionId?: string;
		limit?: number;
	}
): MemoryEntry[] {
	const entries = listMemoryEntries(projectPath, {
		projectId,
		beadId: options?.beadId,
		kinds: ['action_report'],
		limit: options?.limit ?? 20,
		includeDeleted: false
	});

	// Filter by sessionId if provided (listMemoryEntries doesn't support sessionId filter)
	if (options?.sessionId) {
		return entries.filter((e) => e.sessionId === options.sessionId);
	}

	return entries;
}

/**
 * Get a single action report by memory entry ID
 */
export function getActionReport(projectPath: string, entryId: string): MemoryEntry | null {
	const entry = getMemoryEntry(projectPath, entryId);
	if (!entry || entry.kind !== 'action_report') {
		return null;
	}
	return entry;
}

// ============================================================================
// Send to Claude Tracking
// ============================================================================

/**
 * Mark an action report as "sent to Claude"
 *
 * Note: This updates the data field which is normally append-only.
 * This is acceptable because we're only adding tracking metadata,
 * not changing the action report content itself.
 */
export function markActionSentToChat(
	projectPath: string,
	entryId: string,
	method: 'insert' | 'copy'
): boolean {
	const db = getMemoryWriter(projectPath);
	const now = new Date().toISOString();

	// Get current entry
	const row = db.prepare('SELECT data FROM memory_entries WHERE id = ? AND deleted_at IS NULL').get(entryId) as
		| { data: string | null }
		| undefined;

	if (!row) {
		return false;
	}

	// Parse existing data and add sentToChat
	const data = row.data ? JSON.parse(row.data) : {};
	data.sentToChat = {
		method,
		sentAt: now
	};

	// Update the entry
	const result = db
		.prepare(
			`
      UPDATE memory_entries
      SET data = ?
      WHERE id = ? AND deleted_at IS NULL
    `
		)
		.run(JSON.stringify(data), entryId);

	return result.changes > 0;
}

// ============================================================================
// Chat Integration Formatting
// ============================================================================

/**
 * Format action report for sending to Claude chat
 * Returns a well-structured message suitable for chat context
 */
export function formatActionForChat(entry: MemoryEntry): string {
	const data = entry.data as
		| {
				actionId?: string;
				exitCode?: number;
				durationMs?: number;
				workingDirectory?: string;
		  }
		| undefined;

	const exitCode = data?.exitCode ?? 'unknown';
	const status = exitCode === 0 ? 'completed successfully' : `failed with exit code ${exitCode}`;

	return `**Action Result: ${entry.title}**

The action ${status}.

${entry.content}

---
*Action ID: ${data?.actionId || 'unknown'} | Duration: ${data?.durationMs ?? 0}ms*`;
}

/**
 * Format action report as a compact summary for chat insertion
 */
export function formatActionSummaryForChat(entry: MemoryEntry): string {
	const data = entry.data as
		| {
				exitCode?: number;
				resolvedCommand?: string;
		  }
		| undefined;

	const exitCode = data?.exitCode ?? 'unknown';
	const status = exitCode === 0 ? 'SUCCESS' : 'FAILED';
	const command = data?.resolvedCommand || '(unknown command)';

	return `[Action ${status}] \`${command}\`
Exit code: ${exitCode}`;
}

// ============================================================================
// Environment Sanitization
// ============================================================================

/**
 * Patterns that indicate sensitive environment variables
 */
const SENSITIVE_PATTERNS = [
	'key',
	'secret',
	'token',
	'password',
	'credential',
	'auth',
	'api_key',
	'apikey',
	'private',
	'bearer',
	'jwt',
	'session',
	'cookie'
];

/**
 * Sanitize environment variables for storage
 * Redacts values that likely contain sensitive data
 */
export function sanitizeEnvironment(env: Record<string, string>): Record<string, string> {
	const sanitized: Record<string, string> = {};

	for (const [key, value] of Object.entries(env)) {
		const keyLower = key.toLowerCase();
		const isLikelySensitive = SENSITIVE_PATTERNS.some((pattern) => keyLower.includes(pattern));
		sanitized[key] = isLikelySensitive ? '[REDACTED]' : value;
	}

	return sanitized;
}

/**
 * Check if an environment variable key appears sensitive
 */
export function isSensitiveEnvKey(key: string): boolean {
	const keyLower = key.toLowerCase();
	return SENSITIVE_PATTERNS.some((pattern) => keyLower.includes(pattern));
}

// ============================================================================
// Dry Run Preview
// ============================================================================

/**
 * Build a dry-run preview of an action
 * Shows what would be executed without running the command
 */
export function buildDryRunPreview(
	command: string,
	resolvedCommand: string,
	workingDirectory: string,
	environment: Record<string, string>
): string {
	const sanitizedEnv = sanitizeEnvironment(environment);

	// Only show non-sensitive, non-standard environment variables
	const relevantEnv = Object.entries(sanitizedEnv)
		.filter(([key, value]) => {
			// Skip redacted values
			if (value === '[REDACTED]') return false;
			// Skip common system variables
			if (['PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL'].includes(key)) return false;
			return true;
		})
		.map(([k, v]) => `  ${k}=${v}`)
		.join('\n');

	let preview = `## Dry Run Preview

**Command Template:** \`${command}\`
**Resolved Command:** \`${resolvedCommand}\`
**Working Directory:** ${workingDirectory}`;

	if (relevantEnv) {
		preview += `

**Environment:**
${relevantEnv}`;
	}

	preview += `

*This is a preview. No command was executed.*`;

	return preview;
}

// ============================================================================
// Action Record Builder
// ============================================================================

/**
 * Create an ActionExecutionRecord from execution results
 * Helper for building records before persistence
 */
export function buildActionRecord(params: {
	actionId: string;
	label: string;
	command: string;
	resolvedCommand: string;
	workingDirectory: string;
	profileUsed: string;
	environment: Record<string, string>;
	startedAt: Date;
	completedAt: Date;
	exitCode: number;
	stdout: string;
	stderr: string;
	sessionId: string;
	chatId: string;
	beadId?: string;
}): ActionExecutionRecord {
	return {
		actionId: params.actionId,
		label: params.label,
		command: params.command,
		resolvedCommand: params.resolvedCommand,
		workingDirectory: params.workingDirectory,
		profileUsed: params.profileUsed,
		environment: sanitizeEnvironment(params.environment),
		startedAt: params.startedAt.toISOString(),
		completedAt: params.completedAt.toISOString(),
		durationMs: params.completedAt.getTime() - params.startedAt.getTime(),
		exitCode: params.exitCode,
		stdout: params.stdout,
		stderr: params.stderr,
		sessionId: params.sessionId,
		chatId: params.chatId,
		beadId: params.beadId
	};
}

// ============================================================================
// Action History Statistics
// ============================================================================

/**
 * Get statistics about action executions for a project
 */
export function getActionStats(
	projectPath: string,
	projectId: string,
	options?: {
		beadId?: string;
		sessionId?: string;
	}
): {
	totalActions: number;
	successCount: number;
	failureCount: number;
	averageDurationMs: number;
} {
	const reports = getRecentActionReports(projectPath, projectId, {
		beadId: options?.beadId,
		sessionId: options?.sessionId,
		limit: 100 // Get more for statistics
	});

	if (reports.length === 0) {
		return {
			totalActions: 0,
			successCount: 0,
			failureCount: 0,
			averageDurationMs: 0
		};
	}

	let successCount = 0;
	let failureCount = 0;
	let totalDuration = 0;

	for (const report of reports) {
		const data = report.data as { exitCode?: number; durationMs?: number } | undefined;
		if (data?.exitCode === 0) {
			successCount++;
		} else {
			failureCount++;
		}
		totalDuration += data?.durationMs ?? 0;
	}

	return {
		totalActions: reports.length,
		successCount,
		failureCount,
		averageDurationMs: Math.round(totalDuration / reports.length)
	};
}
