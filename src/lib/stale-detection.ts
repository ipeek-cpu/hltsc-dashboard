/**
 * Stale Bead Detection
 * Automatically flag beads that have been stuck in a status for too long
 */

export type StalenessLevel = 'none' | 'warning' | 'critical';

export interface StalenessThreshold {
	warningHours: number;
	criticalHours: number;
}

// Thresholds by status (in hours)
const STALENESS_THRESHOLDS: Record<string, StalenessThreshold> = {
	in_progress: { warningHours: 2, criticalHours: 8 },
	in_review: { warningHours: 24, criticalHours: 72 },
	// Other statuses don't get stale alerts by default
	open: { warningHours: 168, criticalHours: 336 }, // 1 week / 2 weeks
	ready: { warningHours: 48, criticalHours: 168 }, // 2 days / 1 week
	blocked: { warningHours: 24, criticalHours: 72 }
};

export interface StalenessInfo {
	level: StalenessLevel;
	hoursStale: number;
	threshold: StalenessThreshold | null;
	message: string;
}

/**
 * Calculate staleness for an issue based on its status and updated_at time
 */
export function calculateStaleness(
	status: string,
	updatedAt: string | Date
): StalenessInfo {
	const threshold = STALENESS_THRESHOLDS[status];

	if (!threshold) {
		return {
			level: 'none',
			hoursStale: 0,
			threshold: null,
			message: ''
		};
	}

	const updatedDate = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
	const now = new Date();
	const hoursStale = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);

	let level: StalenessLevel = 'none';
	let message = '';

	if (hoursStale >= threshold.criticalHours) {
		level = 'critical';
		message = `Critical: ${formatDuration(hoursStale)} in ${formatStatus(status)}`;
	} else if (hoursStale >= threshold.warningHours) {
		level = 'warning';
		message = `Warning: ${formatDuration(hoursStale)} in ${formatStatus(status)}`;
	}

	return {
		level,
		hoursStale,
		threshold,
		message
	};
}

/**
 * Get staleness for multiple issues
 */
export function getStaleIssues(
	issues: Array<{ id: string; status: string; updated_at: string }>
): Array<{ id: string; staleness: StalenessInfo }> {
	return issues
		.map((issue) => ({
			id: issue.id,
			staleness: calculateStaleness(issue.status, issue.updated_at)
		}))
		.filter((item) => item.staleness.level !== 'none');
}

/**
 * Count stale issues by level
 */
export function countStaleIssues(
	issues: Array<{ id: string; status: string; updated_at: string }>
): { warning: number; critical: number } {
	const counts = { warning: 0, critical: 0 };

	for (const issue of issues) {
		const staleness = calculateStaleness(issue.status, issue.updated_at);
		if (staleness.level === 'warning') {
			counts.warning++;
		} else if (staleness.level === 'critical') {
			counts.critical++;
		}
	}

	return counts;
}

/**
 * Get issues that need attention (critical first, then warning)
 */
export function getIssuesNeedingAttention(
	issues: Array<{ id: string; status: string; updated_at: string; title: string }>
): Array<{ id: string; title: string; staleness: StalenessInfo }> {
	const staleIssues = issues
		.map((issue) => ({
			id: issue.id,
			title: issue.title,
			staleness: calculateStaleness(issue.status, issue.updated_at)
		}))
		.filter((item) => item.staleness.level !== 'none');

	// Sort: critical first, then by hours stale (descending)
	return staleIssues.sort((a, b) => {
		if (a.staleness.level === 'critical' && b.staleness.level !== 'critical') {
			return -1;
		}
		if (b.staleness.level === 'critical' && a.staleness.level !== 'critical') {
			return 1;
		}
		return b.staleness.hoursStale - a.staleness.hoursStale;
	});
}

/**
 * Format duration for display
 */
function formatDuration(hours: number): string {
	if (hours < 1) {
		const minutes = Math.round(hours * 60);
		return `${minutes}m`;
	}
	if (hours < 24) {
		return `${Math.round(hours)}h`;
	}
	const days = Math.floor(hours / 24);
	const remainingHours = Math.round(hours % 24);
	if (remainingHours === 0) {
		return `${days}d`;
	}
	return `${days}d ${remainingHours}h`;
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
	return status.replace(/_/g, ' ');
}

/**
 * Get color for staleness level
 */
export function getStalenessColor(level: StalenessLevel): string {
	switch (level) {
		case 'critical':
			return '#dc2626'; // red
		case 'warning':
			return '#f59e0b'; // amber
		default:
			return 'transparent';
	}
}

/**
 * Get background color for staleness level
 */
export function getStalenessBackground(level: StalenessLevel): string {
	switch (level) {
		case 'critical':
			return '#fef2f2'; // red-50
		case 'warning':
			return '#fffbeb'; // amber-50
		default:
			return 'transparent';
	}
}

/**
 * Get icon for staleness level
 */
export function getStalenessIcon(level: StalenessLevel): string {
	switch (level) {
		case 'critical':
			return 'alert-triangle';
		case 'warning':
			return 'clock';
		default:
			return '';
	}
}

/**
 * Check if an issue is stale
 */
export function isStale(status: string, updatedAt: string | Date): boolean {
	const staleness = calculateStaleness(status, updatedAt);
	return staleness.level !== 'none';
}

/**
 * Get custom thresholds (for configuration)
 */
export function getThresholds(): Record<string, StalenessThreshold> {
	return { ...STALENESS_THRESHOLDS };
}

/**
 * Calculate time until stale (for countdown display)
 */
export function getTimeUntilStale(
	status: string,
	updatedAt: string | Date
): { untilWarning: number; untilCritical: number } | null {
	const threshold = STALENESS_THRESHOLDS[status];
	if (!threshold) return null;

	const updatedDate = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
	const now = new Date();
	const hoursElapsed = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);

	return {
		untilWarning: Math.max(0, threshold.warningHours - hoursElapsed),
		untilCritical: Math.max(0, threshold.criticalHours - hoursElapsed)
	};
}
