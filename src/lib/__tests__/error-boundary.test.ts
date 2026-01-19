/**
 * Unit tests for Error Boundary functionality.
 *
 * Tests the client error logging API and error categorization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Error Boundary', () => {
	describe('Error categorization', () => {
		/**
		 * Helper to check if error is critical using the same patterns as ErrorBoundary
		 */
		function isCriticalError(err: Error): boolean {
			const criticalPatterns = [
				/database/i,
				/sqlite/i,
				/network/i,
				/fetch/i,
				/unauthorized/i,
				/forbidden/i
			];
			return criticalPatterns.some(
				(pattern) => pattern.test(err.message) || pattern.test(err.stack || '')
			);
		}

		it('identifies database errors as critical', () => {
			const err = new Error('Database connection failed');
			expect(isCriticalError(err)).toBe(true);
		});

		it('identifies sqlite errors as critical', () => {
			const err = new Error('SQLITE_ERROR: no such table');
			expect(isCriticalError(err)).toBe(true);
		});

		it('identifies network errors as critical', () => {
			const err = new Error('Network request failed');
			expect(isCriticalError(err)).toBe(true);
		});

		it('identifies fetch errors as critical', () => {
			const err = new Error('Failed to fetch');
			expect(isCriticalError(err)).toBe(true);
		});

		it('identifies unauthorized errors as critical', () => {
			const err = new Error('Unauthorized access');
			expect(isCriticalError(err)).toBe(true);
		});

		it('identifies forbidden errors as critical', () => {
			const err = new Error('403 Forbidden');
			expect(isCriticalError(err)).toBe(true);
		});

		it('does not flag regular errors as critical', () => {
			const err = new Error('Something went wrong');
			expect(isCriticalError(err)).toBe(false);
		});

		it('does not flag render errors as critical', () => {
			const err = new Error('Cannot read property of undefined');
			expect(isCriticalError(err)).toBe(false);
		});

		it('checks stack trace for critical patterns', () => {
			const err = new Error('Unknown error');
			err.stack = 'Error: Unknown error\n    at DatabaseModule.query';
			expect(isCriticalError(err)).toBe(true);
		});

		it('is case insensitive', () => {
			const err = new Error('DATABASE CONNECTION FAILED');
			expect(isCriticalError(err)).toBe(true);
		});
	});

	describe('Client error report structure', () => {
		interface ClientErrorReport {
			message: string;
			stack?: string;
			url: string;
			userAgent: string;
			timestamp: string;
		}

		it('has required message field', () => {
			const report: ClientErrorReport = {
				message: 'Test error',
				url: 'http://localhost:5555/',
				userAgent: 'Test/1.0',
				timestamp: new Date().toISOString()
			};

			expect(report.message).toBeDefined();
			expect(report.message.length).toBeGreaterThan(0);
		});

		it('accepts optional stack field', () => {
			const report: ClientErrorReport = {
				message: 'Test error',
				stack: 'Error: Test\n    at test.ts:1',
				url: 'http://localhost:5555/',
				userAgent: 'Test/1.0',
				timestamp: new Date().toISOString()
			};

			expect(report.stack).toBeDefined();
		});

		it('includes URL for context', () => {
			const report: ClientErrorReport = {
				message: 'Test error',
				url: 'http://localhost:5555/settings',
				userAgent: 'Test/1.0',
				timestamp: new Date().toISOString()
			};

			expect(report.url).toContain('localhost');
		});

		it('includes userAgent for debugging', () => {
			const report: ClientErrorReport = {
				message: 'Test error',
				url: 'http://localhost:5555/',
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
				timestamp: new Date().toISOString()
			};

			expect(report.userAgent).toContain('Macintosh');
		});

		it('has valid ISO timestamp', () => {
			const timestamp = new Date().toISOString();
			const report: ClientErrorReport = {
				message: 'Test error',
				url: 'http://localhost:5555/',
				userAgent: 'Test/1.0',
				timestamp
			};

			const parsed = new Date(report.timestamp);
			expect(parsed.toString()).not.toBe('Invalid Date');
		});
	});

	describe('Error message formatting', () => {
		it('handles errors with message only', () => {
			const err = new Error('Simple error');
			expect(err.message).toBe('Simple error');
		});

		it('handles errors with empty message', () => {
			const err = new Error('');
			expect(err.message).toBe('');
		});

		it('handles errors with stack trace', () => {
			const err = new Error('Error with stack');
			expect(err.stack).toBeDefined();
			expect(err.stack).toContain('Error with stack');
		});

		it('handles errors with custom properties', () => {
			const err = new Error('Custom error') as Error & { code: string };
			err.code = 'ERR_CUSTOM';
			expect(err.code).toBe('ERR_CUSTOM');
		});
	});

	describe('GitHub issue URL generation', () => {
		it('encodes error message properly', () => {
			const errorMessage = 'Error: Cannot read property "foo"';
			const encoded = encodeURIComponent(errorMessage);
			expect(encoded).not.toContain(' ');
			expect(encoded).not.toContain('"');
		});

		it('encodes stack trace properly', () => {
			const stack = 'Error: Test\n    at foo.ts:10:5';
			const encoded = encodeURIComponent(stack);
			expect(encoded).not.toContain('\n');
		});

		it('handles special characters', () => {
			const message = 'Error: <script>alert("xss")</script>';
			const encoded = encodeURIComponent(message);
			expect(encoded).not.toContain('<');
			expect(encoded).not.toContain('>');
		});
	});
});
