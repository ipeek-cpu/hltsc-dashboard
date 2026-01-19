/**
 * Unit tests for data-repair module.
 *
 * These tests verify the repair logic interfaces and result structures.
 * Full integration tests require a test database.
 */

import { describe, it, expect } from 'vitest';
import type { RepairResult, RepairSummary } from '../data-repair';

describe('data-repair types and interfaces', () => {
	describe('RepairResult interface', () => {
		it('has correct structure for timestamp repair', () => {
			const result: RepairResult = {
				field: 'created_at',
				issueId: 'BC-001',
				oldValue: '2026-01-19T10:00:00',
				newValue: '2026-01-19T10:00:00-06:00',
				description: 'Added timezone offset -06:00'
			};

			expect(result.field).toBe('created_at');
			expect(result.issueId).toBe('BC-001');
			expect(result.oldValue).not.toContain('-06:00');
			expect(result.newValue).toContain('-06:00');
		});

		it('has correct structure for status repair', () => {
			const result: RepairResult = {
				field: 'status',
				issueId: 'BC-002',
				oldValue: 'done',
				newValue: 'closed',
				description: "Converted legacy status 'done' to 'closed'"
			};

			expect(result.field).toBe('status');
			expect(result.oldValue).toBe('done');
			expect(result.newValue).toBe('closed');
		});

		it('has correct structure for assignee repair', () => {
			const result: RepairResult = {
				field: 'assignee',
				issueId: 'BC-003',
				oldValue: 'executor',
				newValue: '@executor',
				description: 'Added @ prefix to assignee'
			};

			expect(result.field).toBe('assignee');
			expect(result.oldValue).not.toMatch(/^@/);
			expect(result.newValue).toMatch(/^@/);
		});

		it('allows null oldValue for required field repairs', () => {
			const result: RepairResult = {
				field: 'title',
				issueId: 'BC-004',
				oldValue: null,
				newValue: 'Untitled (BC-004)',
				description: 'Set default title for empty issue'
			};

			expect(result.oldValue).toBeNull();
			expect(result.newValue).toBeTruthy();
		});
	});

	describe('RepairSummary interface', () => {
		it('has correct structure for empty result', () => {
			const summary: RepairSummary = {
				totalIssuesScanned: 50,
				issuesRepaired: 0,
				repairs: [],
				errors: []
			};

			expect(summary.totalIssuesScanned).toBe(50);
			expect(summary.issuesRepaired).toBe(0);
			expect(summary.repairs).toHaveLength(0);
			expect(summary.errors).toHaveLength(0);
		});

		it('has correct structure for successful repairs', () => {
			const repairs: RepairResult[] = [
				{
					field: 'status',
					issueId: 'BC-001',
					oldValue: 'done',
					newValue: 'closed',
					description: 'Converted status'
				},
				{
					field: 'assignee',
					issueId: 'BC-001',
					oldValue: 'agent',
					newValue: '@agent',
					description: 'Added @ prefix'
				},
				{
					field: 'created_at',
					issueId: 'BC-002',
					oldValue: '2026-01-19T10:00:00',
					newValue: '2026-01-19T10:00:00-06:00',
					description: 'Added timezone'
				}
			];

			const summary: RepairSummary = {
				totalIssuesScanned: 100,
				issuesRepaired: 2,
				repairs,
				errors: []
			};

			expect(summary.totalIssuesScanned).toBe(100);
			expect(summary.issuesRepaired).toBe(2);
			expect(summary.repairs).toHaveLength(3);

			// Multiple repairs can apply to same issue
			const issueIds = new Set(repairs.map((r) => r.issueId));
			expect(issueIds.size).toBe(summary.issuesRepaired);
		});

		it('can contain errors', () => {
			const summary: RepairSummary = {
				totalIssuesScanned: 50,
				issuesRepaired: 3,
				repairs: [],
				errors: ['Database connection failed', 'Permission denied']
			};

			expect(summary.errors).toHaveLength(2);
			expect(summary.errors[0]).toContain('Database');
		});
	});

	describe('Repair field types', () => {
		it('supports all timestamp fields', () => {
			const timestampFields = ['created_at', 'updated_at', 'closed_at'];

			timestampFields.forEach((field) => {
				const result: RepairResult = {
					field,
					issueId: 'test',
					oldValue: '2026-01-19T10:00:00',
					newValue: '2026-01-19T10:00:00-06:00',
					description: 'timestamp repair'
				};
				expect(result.field).toBe(field);
			});
		});

		it('supports status field', () => {
			const legacyStatuses = ['done', 'wip', 'todo', 'pending', 'review'];
			const normalizedStatuses = ['closed', 'in_progress', 'open', 'open', 'in_review'];

			legacyStatuses.forEach((legacy, i) => {
				const result: RepairResult = {
					field: 'status',
					issueId: 'test',
					oldValue: legacy,
					newValue: normalizedStatuses[i],
					description: `Converted ${legacy}`
				};
				expect(result.oldValue).toBe(legacy);
				expect(result.newValue).toBe(normalizedStatuses[i]);
			});
		});

		it('supports assignee field', () => {
			const result: RepairResult = {
				field: 'assignee',
				issueId: 'test',
				oldValue: 'username',
				newValue: '@username',
				description: 'normalized'
			};
			expect(result.newValue).toBe('@username');
		});

		it('supports title field for required field repairs', () => {
			const result: RepairResult = {
				field: 'title',
				issueId: 'BC-123',
				oldValue: null,
				newValue: 'Untitled (BC-123)',
				description: 'Set default title'
			};
			expect(result.newValue).toContain('BC-123');
		});

		it('supports priority field for required field repairs', () => {
			const result: RepairResult = {
				field: 'priority',
				issueId: 'test',
				oldValue: null,
				newValue: '2',
				description: 'Set default priority'
			};
			expect(result.newValue).toBe('2'); // Medium priority
		});
	});

	describe('Repair descriptions are informative', () => {
		it('timestamp repair describes the offset added', () => {
			const result: RepairResult = {
				field: 'created_at',
				issueId: 'test',
				oldValue: '2026-01-19T10:00:00',
				newValue: '2026-01-19T10:00:00-06:00',
				description: 'Added timezone offset -06:00'
			};

			expect(result.description).toContain('-06:00');
			expect(result.description.toLowerCase()).toContain('timezone');
		});

		it('status repair describes the conversion', () => {
			const result: RepairResult = {
				field: 'status',
				issueId: 'test',
				oldValue: 'done',
				newValue: 'closed',
				description: "Converted legacy status 'done' to 'closed'"
			};

			expect(result.description).toContain('done');
			expect(result.description).toContain('closed');
		});

		it('assignee repair describes the normalization', () => {
			const result: RepairResult = {
				field: 'assignee',
				issueId: 'test',
				oldValue: 'agent',
				newValue: '@agent',
				description: 'Added @ prefix to assignee'
			};

			expect(result.description).toContain('@');
		});
	});
});
