/**
 * Unit tests for the centralized logging module.
 *
 * These tests verify the logger interfaces and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
	createLogger,
	createApiLogger,
	formatBytes,
	getLogDir,
	getLogFilePath,
	type LogLevel,
	type RequestContext
} from '../logger';

describe('Logger module', () => {
	describe('createLogger', () => {
		it('creates a logger with all log level methods', () => {
			const logger = createLogger('test');

			expect(typeof logger.debug).toBe('function');
			expect(typeof logger.info).toBe('function');
			expect(typeof logger.warn).toBe('function');
			expect(typeof logger.error).toBe('function');
		});

		it('accepts category name', () => {
			const logger = createLogger('my-category');
			// Should not throw
			expect(logger).toBeDefined();
		});
	});

	describe('createApiLogger', () => {
		it('creates a logger with request-specific methods', () => {
			const logger = createApiLogger('api');

			expect(typeof logger.debug).toBe('function');
			expect(typeof logger.info).toBe('function');
			expect(typeof logger.warn).toBe('function');
			expect(typeof logger.error).toBe('function');
			expect(typeof logger.request).toBe('function');
			expect(typeof logger.requestError).toBe('function');
		});

		it('request method accepts RequestContext', () => {
			const logger = createApiLogger('api');
			const context: RequestContext = {
				method: 'GET',
				path: '/api/health',
				query: { foo: 'bar' },
				userAgent: 'test',
				ip: '127.0.0.1'
			};

			// Should not throw
			expect(() => logger.request('Test request', context)).not.toThrow();
		});

		it('requestError method accepts error and context', () => {
			const logger = createApiLogger('api');
			const context: RequestContext = {
				method: 'POST',
				path: '/api/data'
			};
			const error = new Error('Test error');

			// Should not throw
			expect(() => logger.requestError('Request failed', context, error)).not.toThrow();
		});
	});

	describe('formatBytes', () => {
		it('formats 0 bytes', () => {
			expect(formatBytes(0)).toBe('0 B');
		});

		it('formats bytes', () => {
			expect(formatBytes(500)).toBe('500 B');
		});

		it('formats kilobytes', () => {
			expect(formatBytes(1024)).toBe('1 KB');
			expect(formatBytes(1536)).toBe('1.5 KB');
		});

		it('formats megabytes', () => {
			expect(formatBytes(1048576)).toBe('1 MB');
			expect(formatBytes(2621440)).toBe('2.5 MB');
		});

		it('formats gigabytes', () => {
			expect(formatBytes(1073741824)).toBe('1 GB');
		});
	});

	describe('getLogDir', () => {
		it('returns a path containing .beads-dashboard', () => {
			const dir = getLogDir();
			expect(dir).toContain('.beads-dashboard');
		});

		it('returns an absolute path', () => {
			const dir = getLogDir();
			expect(dir.startsWith('/')).toBe(true);
		});
	});

	describe('getLogFilePath', () => {
		it('returns a path for the given category', () => {
			const path = getLogFilePath('test');
			expect(path).toContain('.beads-dashboard');
			expect(path).toContain('test.log');
		});

		it('returns different paths for different categories', () => {
			const path1 = getLogFilePath('api');
			const path2 = getLogFilePath('database');
			expect(path1).not.toBe(path2);
		});
	});

	describe('LogLevel type', () => {
		it('has all expected levels', () => {
			const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
			expect(levels).toHaveLength(4);
		});
	});

	describe('RequestContext interface', () => {
		it('has required fields', () => {
			const context: RequestContext = {
				method: 'GET',
				path: '/test'
			};
			expect(context.method).toBe('GET');
			expect(context.path).toBe('/test');
		});

		it('accepts optional fields', () => {
			const context: RequestContext = {
				method: 'POST',
				path: '/api/data',
				query: { id: '123' },
				userAgent: 'Mozilla/5.0',
				ip: '192.168.1.1'
			};
			expect(context.query?.id).toBe('123');
			expect(context.userAgent).toBe('Mozilla/5.0');
			expect(context.ip).toBe('192.168.1.1');
		});
	});
});
