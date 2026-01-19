import { describe, it, expect } from 'vitest';
import {
	isValidTransition,
	validateTransition,
	getTransitionRequirements,
	getValidTargetStatuses,
	transitionRequiresModal,
	getTransitionDescription,
	type BeadStatus
} from '../bead-lifecycle';

describe('bead-lifecycle', () => {
	describe('isValidTransition', () => {
		describe('from open', () => {
			it('allows transition to ready', () => {
				expect(isValidTransition('open', 'ready')).toBe(true);
			});

			it('allows transition to blocked', () => {
				expect(isValidTransition('open', 'blocked')).toBe(true);
			});

			it('allows transition to deferred', () => {
				expect(isValidTransition('open', 'deferred')).toBe(true);
			});

			it('allows transition to closed', () => {
				expect(isValidTransition('open', 'closed')).toBe(true);
			});

			it('disallows transition to in_progress', () => {
				expect(isValidTransition('open', 'in_progress')).toBe(false);
			});

			it('disallows transition to in_review', () => {
				expect(isValidTransition('open', 'in_review')).toBe(false);
			});
		});

		describe('from ready', () => {
			it('allows transition to in_progress', () => {
				expect(isValidTransition('ready', 'in_progress')).toBe(true);
			});

			it('allows transition back to open', () => {
				expect(isValidTransition('ready', 'open')).toBe(true);
			});

			it('allows transition to blocked', () => {
				expect(isValidTransition('ready', 'blocked')).toBe(true);
			});

			it('allows transition to deferred', () => {
				expect(isValidTransition('ready', 'deferred')).toBe(true);
			});

			it('disallows direct transition to in_review', () => {
				expect(isValidTransition('ready', 'in_review')).toBe(false);
			});

			it('disallows direct transition to closed', () => {
				expect(isValidTransition('ready', 'closed')).toBe(false);
			});
		});

		describe('from in_progress', () => {
			it('allows transition to in_review', () => {
				expect(isValidTransition('in_progress', 'in_review')).toBe(true);
			});

			it('allows transition to blocked', () => {
				expect(isValidTransition('in_progress', 'blocked')).toBe(true);
			});

			it('allows transition back to ready', () => {
				expect(isValidTransition('in_progress', 'ready')).toBe(true);
			});

			it('allows transition to closed (abandoned)', () => {
				expect(isValidTransition('in_progress', 'closed')).toBe(true);
			});

			it('disallows transition back to open', () => {
				expect(isValidTransition('in_progress', 'open')).toBe(false);
			});
		});

		describe('from in_review', () => {
			it('allows transition to closed', () => {
				expect(isValidTransition('in_review', 'closed')).toBe(true);
			});

			it('allows transition back to in_progress (rework)', () => {
				expect(isValidTransition('in_review', 'in_progress')).toBe(true);
			});

			it('disallows transition to ready', () => {
				expect(isValidTransition('in_review', 'ready')).toBe(false);
			});

			it('disallows transition to open', () => {
				expect(isValidTransition('in_review', 'open')).toBe(false);
			});
		});

		describe('from closed', () => {
			it('allows transition to open (reopen)', () => {
				expect(isValidTransition('closed', 'open')).toBe(true);
			});

			it('disallows transition to ready', () => {
				expect(isValidTransition('closed', 'ready')).toBe(false);
			});

			it('disallows transition to in_progress', () => {
				expect(isValidTransition('closed', 'in_progress')).toBe(false);
			});
		});

		describe('from blocked', () => {
			it('allows transition to open', () => {
				expect(isValidTransition('blocked', 'open')).toBe(true);
			});

			it('allows transition to ready', () => {
				expect(isValidTransition('blocked', 'ready')).toBe(true);
			});

			it('allows transition to in_progress', () => {
				expect(isValidTransition('blocked', 'in_progress')).toBe(true);
			});
		});

		describe('from deferred', () => {
			it('allows transition to open', () => {
				expect(isValidTransition('deferred', 'open')).toBe(true);
			});

			it('allows transition to ready', () => {
				expect(isValidTransition('deferred', 'ready')).toBe(true);
			});

			it('disallows transition to in_progress', () => {
				expect(isValidTransition('deferred', 'in_progress')).toBe(false);
			});
		});
	});

	describe('getTransitionRequirements', () => {
		it('returns requirements for ready→in_progress', () => {
			const reqs = getTransitionRequirements('ready', 'in_progress');
			expect(reqs).not.toBeNull();
			expect(reqs?.branch_name).toBe(true);
			expect(reqs?.agent_id).toBe(true);
		});

		it('returns requirements for in_progress→in_review', () => {
			const reqs = getTransitionRequirements('in_progress', 'in_review');
			expect(reqs).not.toBeNull();
			expect(reqs?.commit_hash).toBe(true);
			expect(reqs?.execution_log).toBe(true);
		});

		it('returns null for transitions without requirements', () => {
			expect(getTransitionRequirements('open', 'ready')).toBeNull();
			expect(getTransitionRequirements('in_review', 'closed')).toBeNull();
			expect(getTransitionRequirements('closed', 'open')).toBeNull();
		});
	});

	describe('validateTransition', () => {
		it('returns valid for allowed transition without requirements', () => {
			const result = validateTransition('open', 'ready');
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('returns invalid for disallowed transition', () => {
			const result = validateTransition('open', 'in_progress');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid transition');
			expect(result.error).toContain('Valid targets');
		});

		it('returns valid when required fields provided for ready→in_progress', () => {
			const result = validateTransition('ready', 'in_progress', {
				branch_name: 'feat/BC-001',
				agent_id: '@executor'
			});
			expect(result.valid).toBe(true);
		});

		it('returns invalid with missing fields for ready→in_progress', () => {
			const result = validateTransition('ready', 'in_progress', {});
			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('branch_name');
			expect(result.missingFields).toContain('agent_id');
		});

		it('returns invalid when only branch_name provided for ready→in_progress', () => {
			const result = validateTransition('ready', 'in_progress', {
				branch_name: 'feat/BC-001'
			});
			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('agent_id');
			expect(result.missingFields).not.toContain('branch_name');
		});

		it('returns valid when required fields provided for in_progress→in_review', () => {
			const result = validateTransition('in_progress', 'in_review', {
				commit_hash: 'abc1234',
				execution_log: '## Done\nImplemented the feature'
			});
			expect(result.valid).toBe(true);
		});

		it('returns invalid with missing fields for in_progress→in_review', () => {
			const result = validateTransition('in_progress', 'in_review', {});
			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('commit_hash');
			expect(result.missingFields).toContain('execution_log');
		});

		it('treats whitespace-only as missing', () => {
			const result = validateTransition('ready', 'in_progress', {
				branch_name: '   ',
				agent_id: '   '
			});
			expect(result.valid).toBe(false);
			expect(result.missingFields).toContain('branch_name');
			expect(result.missingFields).toContain('agent_id');
		});
	});

	describe('getValidTargetStatuses', () => {
		it('returns correct targets for open', () => {
			const targets = getValidTargetStatuses('open');
			expect(targets).toContain('ready');
			expect(targets).toContain('blocked');
			expect(targets).toContain('deferred');
			expect(targets).toContain('closed');
			expect(targets).not.toContain('in_progress');
		});

		it('returns correct targets for ready', () => {
			const targets = getValidTargetStatuses('ready');
			expect(targets).toContain('in_progress');
			expect(targets).toContain('open');
			expect(targets).toContain('blocked');
		});

		it('returns correct targets for in_progress', () => {
			const targets = getValidTargetStatuses('in_progress');
			expect(targets).toContain('in_review');
			expect(targets).toContain('blocked');
			expect(targets).toContain('ready');
			expect(targets).toContain('closed');
		});

		it('returns correct targets for in_review', () => {
			const targets = getValidTargetStatuses('in_review');
			expect(targets).toContain('closed');
			expect(targets).toContain('in_progress');
		});

		it('returns correct targets for closed', () => {
			const targets = getValidTargetStatuses('closed');
			expect(targets).toContain('open');
			expect(targets).toHaveLength(1);
		});

		it('returns empty array for unknown status', () => {
			const targets = getValidTargetStatuses('unknown' as BeadStatus);
			expect(targets).toEqual([]);
		});
	});

	describe('transitionRequiresModal', () => {
		it('returns true for ready→in_progress', () => {
			expect(transitionRequiresModal('ready', 'in_progress')).toBe(true);
		});

		it('returns true for in_progress→in_review', () => {
			expect(transitionRequiresModal('in_progress', 'in_review')).toBe(true);
		});

		it('returns false for transitions without requirements', () => {
			expect(transitionRequiresModal('open', 'ready')).toBe(false);
			expect(transitionRequiresModal('in_review', 'closed')).toBe(false);
			expect(transitionRequiresModal('closed', 'open')).toBe(false);
		});
	});

	describe('getTransitionDescription', () => {
		it('returns description for open→ready', () => {
			const desc = getTransitionDescription('open', 'ready');
			expect(desc).toContain('ready');
		});

		it('returns description for ready→in_progress', () => {
			const desc = getTransitionDescription('ready', 'in_progress');
			expect(desc).toContain('Claim');
			expect(desc).toContain('branch');
		});

		it('returns description for in_progress→in_review', () => {
			const desc = getTransitionDescription('in_progress', 'in_review');
			expect(desc).toContain('review');
			expect(desc).toContain('commit');
		});

		it('returns fallback description for unknown transitions', () => {
			const desc = getTransitionDescription('blocked', 'ready');
			expect(desc).toContain('blocked');
			expect(desc).toContain('ready');
		});
	});
});
