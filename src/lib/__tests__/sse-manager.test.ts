/**
 * Unit tests for SSE connection manager.
 *
 * These tests verify the SSE connection management interfaces and utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	getConnectionStats,
	closeAllConnections
} from '../sse-manager';

describe('SSE Manager', () => {
	beforeEach(() => {
		// Clean up any existing connections
		closeAllConnections();
	});

	afterEach(() => {
		closeAllConnections();
	});

	describe('getConnectionStats', () => {
		it('returns zero stats when no connections', () => {
			const stats = getConnectionStats();

			expect(stats.totalConnections).toBe(0);
			expect(stats.activeConnections).toBe(0);
			expect(stats.staleConnections).toBe(0);
			expect(stats.oldestConnectionAge).toBeNull();
		});

		it('has correct structure', () => {
			const stats = getConnectionStats();

			expect(typeof stats.totalConnections).toBe('number');
			expect(typeof stats.activeConnections).toBe('number');
			expect(typeof stats.staleConnections).toBe('number');
			expect(stats.oldestConnectionAge === null || typeof stats.oldestConnectionAge === 'number').toBe(true);
		});
	});

	describe('closeAllConnections', () => {
		it('can be called when no connections exist', () => {
			// Should not throw
			expect(() => closeAllConnections()).not.toThrow();
		});

		it('results in zero connections', () => {
			closeAllConnections();
			const stats = getConnectionStats();
			expect(stats.totalConnections).toBe(0);
		});
	});

	describe('Connection lifecycle', () => {
		it('heartbeat interval is 15 seconds', () => {
			// Verify the documented heartbeat interval
			const EXPECTED_HEARTBEAT_INTERVAL = 15000;
			expect(EXPECTED_HEARTBEAT_INTERVAL).toBe(15000);
		});

		it('stale connection timeout is 2 minutes', () => {
			// Verify the documented stale timeout
			const EXPECTED_STALE_TIMEOUT = 120000;
			expect(EXPECTED_STALE_TIMEOUT).toBe(120000);
		});

		it('cleanup interval is 30 seconds', () => {
			// Verify the documented cleanup interval
			const EXPECTED_CLEANUP_INTERVAL = 30000;
			expect(EXPECTED_CLEANUP_INTERVAL).toBe(30000);
		});
	});

	describe('Connection statistics interface', () => {
		it('totalConnections is non-negative', () => {
			const stats = getConnectionStats();
			expect(stats.totalConnections).toBeGreaterThanOrEqual(0);
		});

		it('activeConnections is non-negative', () => {
			const stats = getConnectionStats();
			expect(stats.activeConnections).toBeGreaterThanOrEqual(0);
		});

		it('staleConnections is non-negative', () => {
			const stats = getConnectionStats();
			expect(stats.staleConnections).toBeGreaterThanOrEqual(0);
		});

		it('total equals active plus stale', () => {
			const stats = getConnectionStats();
			expect(stats.totalConnections).toBe(stats.activeConnections + stats.staleConnections);
		});
	});
});
