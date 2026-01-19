/**
 * Integration tests for bead state transition enforcement.
 *
 * These tests verify that the validation logic works correctly
 * for the transitions that require data (ready→in_progress, in_progress→in_review).
 *
 * Note: Full API endpoint testing requires a running server and database.
 * These tests verify the validation layer that the API uses.
 */

import { describe, it, expect } from 'vitest';
import { validateTransition, isValidTransition, type BeadStatus } from '../bead-lifecycle';

describe('Bead Transition Integration', () => {
	describe('Invalid transitions are rejected', () => {
		const invalidTransitions: [BeadStatus, BeadStatus][] = [
			['open', 'in_progress'], // Must go through ready
			['open', 'in_review'], // Must go through ready and in_progress
			['ready', 'in_review'], // Must go through in_progress
			['ready', 'closed'], // Must go through in_progress and in_review
			['in_review', 'open'], // Must go to closed first
			['in_review', 'ready'], // Cannot skip back
			['closed', 'ready'], // Must go to open first
			['closed', 'in_progress'], // Must go to open first
			['closed', 'in_review'], // Must go to open first
			['deferred', 'in_progress'], // Must go to ready first
			['deferred', 'closed'] // Must reactivate first
		];

		invalidTransitions.forEach(([from, to]) => {
			it(`rejects ${from} → ${to}`, () => {
				expect(isValidTransition(from, to)).toBe(false);

				const result = validateTransition(from, to);
				expect(result.valid).toBe(false);
				expect(result.error).toContain('Invalid transition');
			});
		});
	});

	describe('Valid transitions are accepted', () => {
		const validTransitions: [BeadStatus, BeadStatus][] = [
			['open', 'ready'],
			['open', 'blocked'],
			['open', 'deferred'],
			['open', 'closed'],
			['ready', 'in_progress'],
			['ready', 'open'],
			['ready', 'blocked'],
			['in_progress', 'in_review'],
			['in_progress', 'blocked'],
			['in_progress', 'ready'],
			['in_progress', 'closed'],
			['in_review', 'closed'],
			['in_review', 'in_progress'],
			['closed', 'open'],
			['blocked', 'open'],
			['blocked', 'ready'],
			['blocked', 'in_progress'],
			['deferred', 'open'],
			['deferred', 'ready']
		];

		validTransitions.forEach(([from, to]) => {
			it(`accepts ${from} → ${to}`, () => {
				expect(isValidTransition(from, to)).toBe(true);
			});
		});
	});

	describe('Claiming a bead (ready → in_progress)', () => {
		it('rejects transition without branch_name', () => {
			const result = validateTransition('ready', 'in_progress', {
				agent_id: '@executor'
			});

			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('branch_name');
		});

		it('rejects transition without agent_id', () => {
			const result = validateTransition('ready', 'in_progress', {
				branch_name: 'feat/BC-001'
			});

			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('agent_id');
		});

		it('rejects transition with empty strings', () => {
			const result = validateTransition('ready', 'in_progress', {
				branch_name: '   ',
				agent_id: ''
			});

			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('branch_name');
			expect(result.missingFields).toContain('agent_id');
		});

		it('accepts transition with all required fields', () => {
			const result = validateTransition('ready', 'in_progress', {
				branch_name: 'feat/BC-001-implement-feature',
				agent_id: '@hlstc-executor'
			});

			expect(result.valid).toBe(true);
			expect(result.missingFields).toBeUndefined();
		});
	});

	describe('Completing a bead (in_progress → in_review)', () => {
		it('rejects transition without commit_hash', () => {
			const result = validateTransition('in_progress', 'in_review', {
				execution_log: '## Summary\nImplemented the feature'
			});

			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('commit_hash');
		});

		it('rejects transition without execution_log', () => {
			const result = validateTransition('in_progress', 'in_review', {
				commit_hash: 'abc1234'
			});

			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('execution_log');
		});

		it('rejects transition with empty strings', () => {
			const result = validateTransition('in_progress', 'in_review', {
				commit_hash: '',
				execution_log: '   '
			});

			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('commit_hash');
			expect(result.missingFields).toContain('execution_log');
		});

		it('accepts transition with all required fields', () => {
			const result = validateTransition('in_progress', 'in_review', {
				commit_hash: 'abc1234567',
				execution_log: '## Summary\n\nImplemented feature X.\n\n## Tests\n\nAll passing.'
			});

			expect(result.valid).toBe(true);
			expect(result.missingFields).toBeUndefined();
		});

		it('accepts transition with optional pr_url', () => {
			const result = validateTransition('in_progress', 'in_review', {
				commit_hash: 'abc1234567',
				execution_log: '## Summary\nDone',
				pr_url: 'https://github.com/owner/repo/pull/123'
			});

			expect(result.valid).toBe(true);
		});
	});

	describe('Transitions without requirements', () => {
		it('accepts open → ready without data', () => {
			const result = validateTransition('open', 'ready', {});
			expect(result.valid).toBe(true);
		});

		it('accepts in_review → closed without data', () => {
			const result = validateTransition('in_review', 'closed', {});
			expect(result.valid).toBe(true);
		});

		it('accepts closed → open without data (reopen)', () => {
			const result = validateTransition('closed', 'open', {});
			expect(result.valid).toBe(true);
		});

		it('accepts in_progress → blocked without data', () => {
			const result = validateTransition('in_progress', 'blocked', {});
			expect(result.valid).toBe(true);
		});

		it('accepts blocked → ready without data', () => {
			const result = validateTransition('blocked', 'ready', {});
			expect(result.valid).toBe(true);
		});
	});

	describe('Error messages are clear and actionable', () => {
		it('includes valid targets in invalid transition error', () => {
			const result = validateTransition('open', 'in_progress');

			expect(result.error).toContain('Invalid transition');
			expect(result.error).toContain('ready');
			expect(result.error).toContain('Valid targets');
		});

		it('lists missing fields for incomplete transition', () => {
			const result = validateTransition('ready', 'in_progress', {});

			expect(result.error).toContain('Missing required fields');
			expect(result.missingFields).toEqual(['branch_name', 'agent_id']);
		});
	});
});
