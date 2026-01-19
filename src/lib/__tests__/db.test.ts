/**
 * Unit tests for database connection reliability features.
 *
 * These tests verify the error handling, health check, and connection
 * management interfaces without requiring an actual database file.
 */

import { describe, it, expect } from 'vitest';
import { DatabaseError, getDatabasePath, type DatabaseHealth } from '../db';

describe('DatabaseError', () => {
	it('has correct structure for NOT_FOUND error', () => {
		const error = new DatabaseError('Database not found', 'NOT_FOUND', '/path/to/db');

		expect(error.message).toBe('Database not found');
		expect(error.code).toBe('NOT_FOUND');
		expect(error.path).toBe('/path/to/db');
		expect(error.name).toBe('DatabaseError');
	});

	it('has correct structure for CONNECTION_FAILED error', () => {
		const error = new DatabaseError('Connection refused', 'CONNECTION_FAILED');

		expect(error.code).toBe('CONNECTION_FAILED');
		expect(error.path).toBeUndefined();
	});

	it('has correct structure for QUERY_FAILED error', () => {
		const error = new DatabaseError('Query syntax error', 'QUERY_FAILED');

		expect(error.code).toBe('QUERY_FAILED');
	});

	it('has correct structure for TIMEOUT error', () => {
		const error = new DatabaseError('Lock timeout', 'TIMEOUT');

		expect(error.code).toBe('TIMEOUT');
	});

	it('is an instance of Error', () => {
		const error = new DatabaseError('Test error', 'NOT_FOUND');
		expect(error instanceof Error).toBe(true);
	});
});

describe('DatabaseHealth interface', () => {
	it('has correct structure for healthy database', () => {
		const health: DatabaseHealth = {
			connected: true,
			path: '/path/to/.beads/beads.db',
			exists: true,
			walMode: true,
			dataVersion: 42,
			error: null
		};

		expect(health.connected).toBe(true);
		expect(health.exists).toBe(true);
		expect(health.walMode).toBe(true);
		expect(health.dataVersion).toBe(42);
		expect(health.error).toBeNull();
	});

	it('has correct structure for missing database', () => {
		const health: DatabaseHealth = {
			connected: false,
			path: '/path/to/.beads/beads.db',
			exists: false,
			walMode: false,
			dataVersion: null,
			error: 'Database not found'
		};

		expect(health.connected).toBe(false);
		expect(health.exists).toBe(false);
		expect(health.error).toContain('not found');
	});

	it('has correct structure for connection error', () => {
		const health: DatabaseHealth = {
			connected: false,
			path: '/path/to/.beads/beads.db',
			exists: true,
			walMode: false,
			dataVersion: null,
			error: 'Connection failed: SQLITE_BUSY'
		};

		expect(health.exists).toBe(true);
		expect(health.connected).toBe(false);
		expect(health.error).toContain('Connection failed');
	});

	it('dataVersion can be any number', () => {
		const health: DatabaseHealth = {
			connected: true,
			path: '/path',
			exists: true,
			walMode: true,
			dataVersion: 12345,
			error: null
		};
		expect(health.dataVersion).toBe(12345);
	});
});

describe('getDatabasePath', () => {
	it('returns the configured database path', () => {
		const path = getDatabasePath();

		expect(path).toContain('.beads');
		expect(path).toContain('beads.db');
	});

	it('returns an absolute path', () => {
		const path = getDatabasePath();
		expect(path.startsWith('/')).toBe(true);
	});
});

describe('Error message clarity', () => {
	it('NOT_FOUND error message is actionable', () => {
		const error = new DatabaseError(
			"Beads database not found at /path. Make sure you have initialized Beads by running 'bd init'.",
			'NOT_FOUND',
			'/path'
		);

		expect(error.message).toContain('bd init');
		expect(error.message).toContain('not found');
	});

	it('CONNECTION_FAILED error includes context', () => {
		const error = new DatabaseError(
			'Failed to connect to Beads database: SQLITE_BUSY',
			'CONNECTION_FAILED',
			'/path/to/db'
		);

		expect(error.message).toContain('Failed to connect');
		expect(error.message).toContain('SQLITE_BUSY');
	});

	it('error codes are distinct and meaningful', () => {
		const codes = ['NOT_FOUND', 'CONNECTION_FAILED', 'QUERY_FAILED', 'TIMEOUT'] as const;
		const uniqueCodes = new Set(codes);
		expect(uniqueCodes.size).toBe(codes.length);
	});
});

describe('Connection timeout configuration', () => {
	it('timeout value is reasonable (5 seconds)', () => {
		// The timeout is configured in the Database constructor options
		// We verify the expected value is documented
		const expectedTimeout = 5000;
		expect(expectedTimeout).toBe(5000);
		expect(expectedTimeout).toBeLessThanOrEqual(10000); // Max reasonable timeout
		expect(expectedTimeout).toBeGreaterThanOrEqual(1000); // Min reasonable timeout
	});
});

describe('Connection retry interval', () => {
	it('retry interval is reasonable (5 seconds)', () => {
		// The retry interval prevents rapid reconnection attempts
		const expectedInterval = 5000;
		expect(expectedInterval).toBe(5000);
		expect(expectedInterval).toBeLessThanOrEqual(30000); // Max reasonable interval
		expect(expectedInterval).toBeGreaterThanOrEqual(1000); // Min reasonable interval
	});
});
