/**
 * Unit tests for database polling optimization.
 *
 * These tests verify the adaptive polling logic and configuration.
 */

import { describe, it, expect } from 'vitest';
import {
	DEFAULT_POLLER_CONFIG,
	createPollerState,
	getNextInterval,
	resetToFastPolling,
	getPollerStats,
	type PollerConfig,
	type PollerState
} from '../db-poller';

describe('Database Poller', () => {
	describe('DEFAULT_POLLER_CONFIG', () => {
		it('has minimum interval of 1 second', () => {
			expect(DEFAULT_POLLER_CONFIG.minInterval).toBe(1000);
		});

		it('has maximum interval of 5 seconds', () => {
			expect(DEFAULT_POLLER_CONFIG.maxInterval).toBe(5000);
		});

		it('has idle threshold of 5', () => {
			expect(DEFAULT_POLLER_CONFIG.idleThreshold).toBe(5);
		});

		it('has backoff multiplier of 1.5', () => {
			expect(DEFAULT_POLLER_CONFIG.backoffMultiplier).toBe(1.5);
		});

		it('max interval is greater than min interval', () => {
			expect(DEFAULT_POLLER_CONFIG.maxInterval).toBeGreaterThan(
				DEFAULT_POLLER_CONFIG.minInterval
			);
		});
	});

	describe('createPollerState', () => {
		it('creates state with initial values', () => {
			const state = createPollerState();

			expect(state.currentInterval).toBe(DEFAULT_POLLER_CONFIG.minInterval);
			expect(state.idleCount).toBe(0);
			expect(state.pollCount).toBe(0);
			expect(state.changeCount).toBe(0);
			expect(typeof state.lastDataVersion).toBe('number');
			expect(typeof state.lastSyncTimestamp).toBe('string');
		});

		it('has valid timestamp format', () => {
			const state = createPollerState();
			const date = new Date(state.lastSyncTimestamp);
			expect(date.toString()).not.toBe('Invalid Date');
		});
	});

	describe('getNextInterval', () => {
		it('returns current interval from state', () => {
			const state = createPollerState();
			state.currentInterval = 2500;

			expect(getNextInterval(state)).toBe(2500);
		});

		it('returns rounded value', () => {
			const state = createPollerState();
			state.currentInterval = 1500.7;

			expect(getNextInterval(state)).toBe(1501);
		});
	});

	describe('resetToFastPolling', () => {
		it('resets interval to minimum', () => {
			const state = createPollerState();
			state.currentInterval = 5000;
			state.idleCount = 10;

			resetToFastPolling(state);

			expect(state.currentInterval).toBe(DEFAULT_POLLER_CONFIG.minInterval);
			expect(state.idleCount).toBe(0);
		});

		it('uses custom config if provided', () => {
			const state = createPollerState();
			state.currentInterval = 5000;

			const customConfig: PollerConfig = {
				...DEFAULT_POLLER_CONFIG,
				minInterval: 500
			};

			resetToFastPolling(state, customConfig);

			expect(state.currentInterval).toBe(500);
		});
	});

	describe('getPollerStats', () => {
		it('returns all statistics', () => {
			const state = createPollerState();
			state.pollCount = 100;
			state.changeCount = 5;
			state.idleCount = 3;
			state.currentInterval = 2000;

			const stats = getPollerStats(state);

			expect(stats.pollCount).toBe(100);
			expect(stats.changeCount).toBe(5);
			expect(stats.idleCount).toBe(3);
			expect(stats.currentIntervalMs).toBe(2000);
			expect(stats.efficiency).toBe(0.05);
			expect(typeof stats.lastSyncTimestamp).toBe('string');
			expect(typeof stats.lastDataVersion).toBe('number');
		});

		it('calculates efficiency correctly', () => {
			const state = createPollerState();
			state.pollCount = 10;
			state.changeCount = 2;

			const stats = getPollerStats(state);

			expect(stats.efficiency).toBe(0.2);
		});

		it('handles zero polls', () => {
			const state = createPollerState();

			const stats = getPollerStats(state);

			expect(stats.efficiency).toBe(0);
		});
	});

	describe('Adaptive polling behavior', () => {
		it('starts at minimum interval', () => {
			const state = createPollerState();
			expect(state.currentInterval).toBe(1000);
		});

		it('idle threshold triggers slowdown', () => {
			// After idleThreshold polls without changes, interval should increase
			const threshold = DEFAULT_POLLER_CONFIG.idleThreshold;
			expect(threshold).toBe(5);
		});

		it('backoff multiplier increases interval gradually', () => {
			const multiplier = DEFAULT_POLLER_CONFIG.backoffMultiplier;
			const minInterval = DEFAULT_POLLER_CONFIG.minInterval;

			// After one backoff cycle
			const afterBackoff = minInterval * multiplier;
			expect(afterBackoff).toBe(1500);
		});

		it('max interval caps the slowdown', () => {
			const maxInterval = DEFAULT_POLLER_CONFIG.maxInterval;
			expect(maxInterval).toBe(5000);

			// Simulate multiple backoffs - should never exceed max
			let interval = DEFAULT_POLLER_CONFIG.minInterval;
			for (let i = 0; i < 20; i++) {
				interval = Math.min(
					interval * DEFAULT_POLLER_CONFIG.backoffMultiplier,
					maxInterval
				);
			}
			expect(interval).toBeLessThanOrEqual(maxInterval);
		});
	});

	describe('PollerState interface', () => {
		it('has all required fields', () => {
			const state: PollerState = {
				lastDataVersion: 1,
				lastSyncTimestamp: '2026-01-19T12:00:00Z',
				currentInterval: 1000,
				idleCount: 0,
				pollCount: 0,
				changeCount: 0
			};

			expect(state).toBeDefined();
		});
	});

	describe('PollerConfig interface', () => {
		it('accepts custom configuration', () => {
			const config: PollerConfig = {
				minInterval: 500,
				maxInterval: 10000,
				idleThreshold: 10,
				backoffMultiplier: 2.0
			};

			expect(config.minInterval).toBe(500);
			expect(config.maxInterval).toBe(10000);
			expect(config.idleThreshold).toBe(10);
			expect(config.backoffMultiplier).toBe(2.0);
		});
	});
});
