/**
 * Database Polling Optimization
 *
 * Provides optimized database change detection with:
 * - PRAGMA data_version for efficient change detection
 * - Adaptive polling (slower when idle, faster during activity)
 * - Configurable poll intervals
 * - Last sync timestamp tracking
 */

import { getDataVersion } from './db';

/**
 * Polling configuration
 */
export interface PollerConfig {
	/** Minimum poll interval when active (ms) */
	minInterval: number;
	/** Maximum poll interval when idle (ms) */
	maxInterval: number;
	/** Number of idle polls before slowing down */
	idleThreshold: number;
	/** How much to increase interval per idle poll */
	backoffMultiplier: number;
}

/**
 * Default polling configuration
 */
export const DEFAULT_POLLER_CONFIG: PollerConfig = {
	minInterval: 1000, // 1 second when active
	maxInterval: 5000, // 5 seconds when idle
	idleThreshold: 5, // Slow down after 5 polls with no changes
	backoffMultiplier: 1.5 // Increase by 50% each idle cycle
};

/**
 * Polling state
 */
export interface PollerState {
	lastDataVersion: number;
	lastSyncTimestamp: string;
	currentInterval: number;
	idleCount: number;
	pollCount: number;
	changeCount: number;
}

/**
 * Create initial poller state
 */
export function createPollerState(): PollerState {
	return {
		lastDataVersion: getDataVersion(),
		lastSyncTimestamp: new Date().toISOString(),
		currentInterval: DEFAULT_POLLER_CONFIG.minInterval,
		idleCount: 0,
		pollCount: 0,
		changeCount: 0
	};
}

/**
 * Check for database changes and update state
 *
 * @returns true if data has changed
 */
export function checkForChanges(
	state: PollerState,
	config: PollerConfig = DEFAULT_POLLER_CONFIG
): boolean {
	const currentVersion = getDataVersion();
	state.pollCount++;

	if (currentVersion !== state.lastDataVersion) {
		// Data changed - reset to fast polling
		state.lastDataVersion = currentVersion;
		state.lastSyncTimestamp = new Date().toISOString();
		state.currentInterval = config.minInterval;
		state.idleCount = 0;
		state.changeCount++;
		return true;
	}

	// No change - implement adaptive slowdown
	state.idleCount++;

	if (state.idleCount >= config.idleThreshold) {
		// Slow down polling
		state.currentInterval = Math.min(
			state.currentInterval * config.backoffMultiplier,
			config.maxInterval
		);
	}

	return false;
}

/**
 * Get the next poll interval based on current state
 */
export function getNextInterval(state: PollerState): number {
	return Math.round(state.currentInterval);
}

/**
 * Reset poller to fast polling (e.g., when user interaction detected)
 */
export function resetToFastPolling(
	state: PollerState,
	config: PollerConfig = DEFAULT_POLLER_CONFIG
): void {
	state.currentInterval = config.minInterval;
	state.idleCount = 0;
}

/**
 * Get poller statistics for monitoring
 */
export function getPollerStats(state: PollerState): {
	pollCount: number;
	changeCount: number;
	idleCount: number;
	currentIntervalMs: number;
	lastSyncTimestamp: string;
	lastDataVersion: number;
	efficiency: number;
} {
	return {
		pollCount: state.pollCount,
		changeCount: state.changeCount,
		idleCount: state.idleCount,
		currentIntervalMs: Math.round(state.currentInterval),
		lastSyncTimestamp: state.lastSyncTimestamp,
		lastDataVersion: state.lastDataVersion,
		// Efficiency: ratio of changes to polls (higher is better when idle)
		efficiency: state.pollCount > 0 ? state.changeCount / state.pollCount : 0
	};
}

/**
 * Create an adaptive poller that automatically adjusts its interval
 *
 * @param callback Function to call when changes are detected
 * @param config Optional polling configuration
 * @returns Object with start, stop, and getStats methods
 */
export function createAdaptivePoller(
	callback: (state: PollerState) => void,
	config: PollerConfig = DEFAULT_POLLER_CONFIG
) {
	const state = createPollerState();
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let running = false;

	function poll(): void {
		if (!running) return;

		const hasChanges = checkForChanges(state, config);

		if (hasChanges) {
			callback(state);
		}

		// Schedule next poll with adaptive interval
		timeoutId = setTimeout(poll, getNextInterval(state));
	}

	return {
		start(): void {
			if (running) return;
			running = true;
			// Initial poll immediately
			poll();
		},
		stop(): void {
			running = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		},
		getStats() {
			return getPollerStats(state);
		},
		getState(): PollerState {
			return state;
		},
		resetToFast(): void {
			resetToFastPolling(state, config);
		},
		isRunning(): boolean {
			return running;
		}
	};
}
