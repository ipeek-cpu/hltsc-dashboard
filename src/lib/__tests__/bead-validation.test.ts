import { describe, it, expect } from 'vitest';
import {
	validateTimestamp,
	normalizeTimestamp,
	isValidStatus,
	normalizeStatus,
	validateAssignee,
	normalizeAssignee,
	validateLifecycleFields,
	validateBead
} from '../bead-validation';

describe('bead-validation', () => {
	describe('validateTimestamp', () => {
		it('returns valid for ISO8601 with timezone offset', () => {
			const result = validateTimestamp('2026-01-19T10:30:00-06:00');
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});

		it('returns valid for ISO8601 with Z timezone', () => {
			const result = validateTimestamp('2026-01-19T16:30:00Z');
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('returns valid with warning for timestamp without timezone', () => {
			const result = validateTimestamp('2026-01-19T10:30:00');
			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0].message).toContain('missing timezone');
		});

		it('returns invalid for empty timestamp', () => {
			const result = validateTimestamp('');
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toContain('required');
		});

		it('returns invalid for malformed timestamp', () => {
			const result = validateTimestamp('not-a-date');
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
		});

		it('returns invalid for partial date', () => {
			const result = validateTimestamp('2026-01-19');
			expect(result.valid).toBe(false);
		});

		it('handles milliseconds in timestamp', () => {
			const result = validateTimestamp('2026-01-19T10:30:00.123-06:00');
			expect(result.valid).toBe(true);
		});

		it('handles space separator instead of T', () => {
			const result = validateTimestamp('2026-01-19 10:30:00-06:00');
			expect(result.valid).toBe(true);
		});
	});

	describe('normalizeTimestamp', () => {
		it('returns timestamp unchanged if already has timezone', () => {
			const ts = '2026-01-19T10:30:00-06:00';
			expect(normalizeTimestamp(ts)).toBe(ts);
		});

		it('returns timestamp unchanged if has Z timezone', () => {
			const ts = '2026-01-19T10:30:00Z';
			expect(normalizeTimestamp(ts)).toBe(ts);
		});

		it('adds default timezone offset if missing', () => {
			const result = normalizeTimestamp('2026-01-19T10:30:00');
			expect(result).toBe('2026-01-19T10:30:00-06:00');
		});

		it('uses custom default offset', () => {
			const result = normalizeTimestamp('2026-01-19T10:30:00', '+00:00');
			expect(result).toBe('2026-01-19T10:30:00+00:00');
		});

		it('returns empty string unchanged', () => {
			expect(normalizeTimestamp('')).toBe('');
		});
	});

	describe('isValidStatus', () => {
		it('returns true for all valid statuses', () => {
			const validStatuses = ['open', 'ready', 'in_progress', 'in_review', 'closed', 'blocked', 'deferred', 'tombstone'];
			validStatuses.forEach((status) => {
				expect(isValidStatus(status)).toBe(true);
			});
		});

		it('returns true for legacy status values', () => {
			expect(isValidStatus('done')).toBe(true);
			expect(isValidStatus('wip')).toBe(true);
			expect(isValidStatus('todo')).toBe(true);
			expect(isValidStatus('pending')).toBe(true);
			expect(isValidStatus('review')).toBe(true);
		});

		it('is case insensitive', () => {
			expect(isValidStatus('OPEN')).toBe(true);
			expect(isValidStatus('In_Progress')).toBe(true);
		});

		it('returns false for invalid status', () => {
			expect(isValidStatus('invalid')).toBe(false);
			expect(isValidStatus('completed')).toBe(false);
		});
	});

	describe('normalizeStatus', () => {
		it('returns valid status unchanged', () => {
			expect(normalizeStatus('open')).toBe('open');
			expect(normalizeStatus('in_progress')).toBe('in_progress');
		});

		it('normalizes case', () => {
			expect(normalizeStatus('OPEN')).toBe('open');
			expect(normalizeStatus('In_Progress')).toBe('in_progress');
		});

		it('maps legacy statuses', () => {
			expect(normalizeStatus('done')).toBe('closed');
			expect(normalizeStatus('wip')).toBe('in_progress');
			expect(normalizeStatus('todo')).toBe('open');
			expect(normalizeStatus('pending')).toBe('open');
			expect(normalizeStatus('review')).toBe('in_review');
		});

		it('defaults unknown status to open', () => {
			expect(normalizeStatus('invalid')).toBe('open');
			expect(normalizeStatus('unknown')).toBe('open');
		});

		it('trims whitespace', () => {
			expect(normalizeStatus('  open  ')).toBe('open');
		});
	});

	describe('validateAssignee', () => {
		it('returns valid for null assignee', () => {
			const result = validateAssignee(null);
			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(0);
		});

		it('returns valid for assignee with @ prefix', () => {
			const result = validateAssignee('@agent-executor');
			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(0);
		});

		it('returns valid with warning for assignee without @ prefix', () => {
			const result = validateAssignee('agent-executor');
			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0].message).toContain('@');
		});
	});

	describe('normalizeAssignee', () => {
		it('returns null for null input', () => {
			expect(normalizeAssignee(null)).toBeNull();
		});

		it('returns null for empty string', () => {
			expect(normalizeAssignee('')).toBeNull();
			expect(normalizeAssignee('   ')).toBeNull();
		});

		it('adds @ prefix if missing', () => {
			expect(normalizeAssignee('agent')).toBe('@agent');
		});

		it('returns unchanged if @ prefix exists', () => {
			expect(normalizeAssignee('@agent')).toBe('@agent');
		});

		it('trims whitespace', () => {
			expect(normalizeAssignee('  agent  ')).toBe('@agent');
		});
	});

	describe('validateLifecycleFields', () => {
		describe('ready → in_progress transition', () => {
			it('returns valid when branch_name and agent_id provided', () => {
				const result = validateLifecycleFields('ready', 'in_progress', {
					branch_name: 'feat/BC-001-implement',
					agent_id: '@hlstc-executor'
				});
				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it('returns invalid when branch_name missing', () => {
				const result = validateLifecycleFields('ready', 'in_progress', {
					agent_id: '@hlstc-executor'
				});
				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.field === 'branch_name')).toBe(true);
			});

			it('returns invalid when agent_id missing', () => {
				const result = validateLifecycleFields('ready', 'in_progress', {
					branch_name: 'feat/BC-001-implement'
				});
				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.field === 'agent_id')).toBe(true);
			});
		});

		describe('in_progress → in_review transition', () => {
			it('returns valid when commit_hash and execution_log provided', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234',
					execution_log: '## Summary\nImplemented feature X'
				});
				expect(result.valid).toBe(true);
			});

			it('returns invalid when commit_hash missing', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					execution_log: '## Summary\nImplemented feature X'
				});
				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.field === 'commit_hash')).toBe(true);
			});

			it('returns invalid when execution_log missing', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234'
				});
				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.field === 'execution_log')).toBe(true);
			});
		});

		describe('commit_hash validation', () => {
			it('accepts valid short hash', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234',
					execution_log: 'Done'
				});
				expect(result.warnings).toHaveLength(0);
			});

			it('accepts valid full hash', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234567890abcdef1234567890abcdef1234',
					execution_log: 'Done'
				});
				expect(result.warnings).toHaveLength(0);
			});

			it('warns on malformed hash', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'not-a-hash',
					execution_log: 'Done'
				});
				expect(result.warnings.some((w) => w.field === 'commit_hash')).toBe(true);
			});
		});

		describe('pr_url validation', () => {
			it('accepts valid GitHub URL', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234',
					execution_log: 'Done',
					pr_url: 'https://github.com/owner/repo/pull/123'
				});
				expect(result.valid).toBe(true);
				expect(result.warnings).toHaveLength(0);
			});

			it('accepts valid GitLab URL', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234',
					execution_log: 'Done',
					pr_url: 'https://gitlab.com/owner/repo/-/merge_requests/123'
				});
				expect(result.valid).toBe(true);
			});

			it('warns on non-GitHub/GitLab URL', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234',
					execution_log: 'Done',
					pr_url: 'https://bitbucket.org/owner/repo/pull/123'
				});
				expect(result.warnings.some((w) => w.field === 'pr_url')).toBe(true);
			});

			it('errors on invalid URL', () => {
				const result = validateLifecycleFields('in_progress', 'in_review', {
					commit_hash: 'abc1234',
					execution_log: 'Done',
					pr_url: 'not-a-url'
				});
				expect(result.errors.some((e) => e.field === 'pr_url')).toBe(true);
			});
		});
	});

	describe('validateBead', () => {
		it('returns valid for complete bead', () => {
			const result = validateBead({
				id: 'BC-001',
				title: 'Implement feature',
				status: 'open',
				created_at: '2026-01-19T10:00:00-06:00',
				updated_at: '2026-01-19T10:00:00-06:00',
				assignee: '@agent'
			});
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('returns invalid when id missing', () => {
			const result = validateBead({
				title: 'Test',
				status: 'open'
			});
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === 'id')).toBe(true);
		});

		it('returns invalid when title missing', () => {
			const result = validateBead({
				id: 'BC-001',
				status: 'open'
			});
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === 'title')).toBe(true);
		});

		it('warns on unknown status', () => {
			const result = validateBead({
				id: 'BC-001',
				title: 'Test',
				status: 'unknown_status'
			});
			expect(result.valid).toBe(true);
			expect(result.warnings.some((w) => w.field === 'status')).toBe(true);
		});

		it('validates timestamp fields', () => {
			const result = validateBead({
				id: 'BC-001',
				title: 'Test',
				created_at: 'invalid-date'
			});
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === 'created_at')).toBe(true);
		});

		it('warns on assignee without @ prefix', () => {
			const result = validateBead({
				id: 'BC-001',
				title: 'Test',
				assignee: 'agent'
			});
			expect(result.valid).toBe(true);
			expect(result.warnings.some((w) => w.field === 'assignee')).toBe(true);
		});
	});
});
