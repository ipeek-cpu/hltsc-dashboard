/**
 * Session metrics tracking and calculation
 */

export interface SessionMetrics {
	// Model info
	model: 'opus' | 'sonnet' | 'haiku';

	// Timing
	sessionStartTime: number; // Unix timestamp
	blockStartTime?: number; // When current "block" started (for block duration)

	// Token usage
	totalInputTokens: number;
	totalOutputTokens: number;

	// Cost
	totalCostUsd: number;

	// Derived
	sessionDurationMs: number;
	blockDurationMs: number;
	contextUsagePercent: number;
}

export const DEFAULT_SESSION_METRICS: SessionMetrics = {
	model: 'opus',
	sessionStartTime: Date.now(),
	blockStartTime: undefined,
	totalInputTokens: 0,
	totalOutputTokens: 0,
	totalCostUsd: 0,
	sessionDurationMs: 0,
	blockDurationMs: 0,
	contextUsagePercent: 0
};

// Context window sizes by model (approximate max tokens)
const CONTEXT_WINDOWS: Record<string, number> = {
	opus: 200000,
	sonnet: 200000,
	haiku: 200000
};

/**
 * Create initial session metrics
 */
export function createSessionMetrics(model: 'opus' | 'sonnet' | 'haiku'): SessionMetrics {
	return {
		...DEFAULT_SESSION_METRICS,
		model,
		sessionStartTime: Date.now()
	};
}

/**
 * Update metrics with new usage data from Claude response
 */
export function updateMetrics(
	metrics: SessionMetrics,
	data: {
		inputTokens?: number;
		outputTokens?: number;
		costUsd?: number;
		durationMs?: number;
	}
): SessionMetrics {
	const now = Date.now();

	const totalInputTokens = metrics.totalInputTokens + (data.inputTokens || 0);
	const totalOutputTokens = metrics.totalOutputTokens + (data.outputTokens || 0);
	const totalCostUsd = metrics.totalCostUsd + (data.costUsd || 0);

	// Calculate context usage percentage based on total tokens in conversation
	// This is an estimate - actual context includes system prompt, etc.
	const contextWindow = CONTEXT_WINDOWS[metrics.model] || 200000;
	const totalTokens = totalInputTokens + totalOutputTokens;
	const contextUsagePercent = Math.min(100, (totalTokens / contextWindow) * 100);

	return {
		...metrics,
		totalInputTokens,
		totalOutputTokens,
		totalCostUsd,
		sessionDurationMs: now - metrics.sessionStartTime,
		blockDurationMs: metrics.blockStartTime ? now - metrics.blockStartTime : 0,
		contextUsagePercent
	};
}

/**
 * Start a new "block" (e.g., when user starts a work session)
 */
export function startBlock(metrics: SessionMetrics): SessionMetrics {
	return {
		...metrics,
		blockStartTime: Date.now()
	};
}

/**
 * Format milliseconds as duration string
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return `${hours}hr ${remainingMinutes}m`;
	}

	if (minutes > 0) {
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	return `${seconds}s`;
}

/**
 * Format cost as currency
 */
export function formatCost(usd: number): string {
	if (usd < 0.01) {
		return '$0.00';
	}
	return `$${usd.toFixed(2)}`;
}

/**
 * Format token count (with K/M suffix)
 */
export function formatTokens(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	}
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`;
	}
	return count.toString();
}

/**
 * Get context warning level based on percentage
 */
export function getContextWarningLevel(percent: number): 'none' | 'warning' | 'danger' {
	if (percent >= 85) return 'danger';
	if (percent >= 70) return 'warning';
	return 'none';
}

/**
 * Get model display info
 */
export function getModelInfo(model: string): { label: string; color: string; bg: string } {
	switch (model) {
		case 'opus':
			return { label: 'Opus 4.5', color: '#6b21a8', bg: '#f3e8ff' };
		case 'sonnet':
			return { label: 'Sonnet 4', color: '#0369a1', bg: '#e0f2fe' };
		case 'haiku':
			return { label: 'Haiku 3.5', color: '#059669', bg: '#d1fae5' };
		default:
			return { label: model, color: '#6b7280', bg: '#f3f4f6' };
	}
}
