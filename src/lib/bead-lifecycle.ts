/**
 * Bead Lifecycle Management
 *
 * This module enforces the bead state machine, ensuring all status transitions
 * follow valid paths and required data is provided for each transition.
 *
 * ## State Machine Diagram
 *
 * ```
 *                    ┌─────────────────────────────────────────────────┐
 *                    │                                                 │
 *                    ▼                                                 │
 *   ┌──────┐    ┌───────┐    ┌─────────────┐    ┌───────────┐    ┌────────┐
 *   │ open │───▶│ ready │───▶│ in_progress │───▶│ in_review │───▶│ closed │
 *   └──────┘    └───────┘    └─────────────┘    └───────────┘    └────────┘
 *       │           │               │                │                │
 *       │           │               │                │                │
 *       │           │               │                └───────┐        │
 *       │           │               │                        │        │
 *       │           │               └───────────────────┐    │        │
 *       │           │                                   │    │        │
 *       │           │         ┌─────────┐               │    │        │
 *       │           └────────▶│ blocked │◀──────────────┘    │        │
 *       │           │         └─────────┘                    │        │
 *       │           │               │                        │        │
 *       │           │               └────────────────────────┼────────┤
 *       │           │                                        │        │
 *       │           │         ┌──────────┐                   │        │
 *       └──────────▶│────────▶│ deferred │                   │        │
 *                   │         └──────────┘                   │        │
 *                   │               │                        │        │
 *                   └───────────────┴────────────────────────┘        │
 *                                                                     │
 *                   └─────────────────────────────────────────────────┘
 * ```
 *
 * ## Main Flow (Happy Path)
 *
 * 1. **open** - Bead created, needs refinement
 * 2. **ready** - Bead is fully defined and ready for execution
 * 3. **in_progress** - Agent has claimed the bead (requires: branch_name, agent_id)
 * 4. **in_review** - Work submitted for review (requires: commit_hash, execution_log)
 * 5. **closed** - Bead completed and approved
 *
 * ## Special States
 *
 * - **blocked** - Work is blocked by external dependency; can return to previous state
 * - **deferred** - Work postponed; can be reactivated to open or ready
 *
 * ## Transition Requirements
 *
 * | Transition              | Required Fields                    |
 * |-------------------------|------------------------------------|
 * | ready → in_progress     | branch_name, agent_id              |
 * | in_progress → in_review | commit_hash, execution_log         |
 *
 * ## API Integration
 *
 * The `/api/projects/[id]/issues/[issueId]` PATCH endpoint uses `validateTransition()`
 * to enforce these rules. Invalid transitions return HTTP 400 with error details.
 */

export type BeadStatus = 'open' | 'ready' | 'in_progress' | 'in_review' | 'closed' | 'blocked' | 'deferred';

/**
 * Valid state transitions for each status.
 *
 * Key design decisions:
 * - open can go directly to closed (for invalid/duplicate beads)
 * - in_progress can go back to ready (if work needs to be unclaimed)
 * - in_progress can go directly to closed (if abandoned)
 * - in_review can go back to in_progress (for rework)
 * - closed can only go to open (full cycle restart)
 * - blocked/deferred are parking states that can return to the workflow
 */
const VALID_TRANSITIONS: Record<BeadStatus, BeadStatus[]> = {
	open: ['ready', 'blocked', 'deferred', 'closed'],
	ready: ['in_progress', 'open', 'blocked', 'deferred'],
	in_progress: ['in_review', 'blocked', 'ready', 'closed'],
	in_review: ['closed', 'in_progress'],
	closed: ['open'],
	blocked: ['open', 'ready', 'in_progress'],
	deferred: ['open', 'ready']
};

// Required fields for specific transitions
export interface TransitionRequirements {
	branch_name?: boolean;
	agent_id?: boolean;
	commit_hash?: boolean;
	execution_log?: boolean;
	pr_url?: boolean;
}

const TRANSITION_REQUIREMENTS: Record<string, TransitionRequirements> = {
	'ready→in_progress': {
		branch_name: true,
		agent_id: true
	},
	'in_progress→in_review': {
		commit_hash: true,
		execution_log: true
	}
};

export interface TransitionData {
	branch_name?: string;
	agent_id?: string;
	commit_hash?: string;
	execution_log?: string;
	pr_url?: string;
}

export interface TransitionResult {
	valid: boolean;
	error?: string;
	missingFields?: string[];
}

/**
 * Check if a status transition is valid
 */
export function isValidTransition(fromStatus: BeadStatus, toStatus: BeadStatus): boolean {
	const validTargets = VALID_TRANSITIONS[fromStatus];
	return validTargets?.includes(toStatus) ?? false;
}

/**
 * Get the requirements for a specific transition
 */
export function getTransitionRequirements(
	fromStatus: BeadStatus,
	toStatus: BeadStatus
): TransitionRequirements | null {
	const key = `${fromStatus}→${toStatus}`;
	return TRANSITION_REQUIREMENTS[key] || null;
}

/**
 * Validate a status transition with provided data
 */
export function validateTransition(
	fromStatus: BeadStatus,
	toStatus: BeadStatus,
	data: TransitionData = {}
): TransitionResult {
	// Check if transition is valid
	if (!isValidTransition(fromStatus, toStatus)) {
		return {
			valid: false,
			error: `Invalid transition from '${fromStatus}' to '${toStatus}'. Valid targets: ${VALID_TRANSITIONS[fromStatus]?.join(', ') || 'none'}`
		};
	}

	// Check required fields
	const requirements = getTransitionRequirements(fromStatus, toStatus);
	if (requirements) {
		const missingFields: string[] = [];

		if (requirements.branch_name && !data.branch_name?.trim()) {
			missingFields.push('branch_name');
		}
		if (requirements.agent_id && !data.agent_id?.trim()) {
			missingFields.push('agent_id');
		}
		if (requirements.commit_hash && !data.commit_hash?.trim()) {
			missingFields.push('commit_hash');
		}
		if (requirements.execution_log && !data.execution_log?.trim()) {
			missingFields.push('execution_log');
		}
		if (requirements.pr_url && !data.pr_url?.trim()) {
			missingFields.push('pr_url');
		}

		if (missingFields.length > 0) {
			return {
				valid: false,
				error: `Missing required fields for ${fromStatus}→${toStatus} transition`,
				missingFields
			};
		}
	}

	return { valid: true };
}

/**
 * Get user-friendly description of a transition
 */
export function getTransitionDescription(fromStatus: BeadStatus, toStatus: BeadStatus): string {
	const descriptions: Record<string, string> = {
		'open→ready': 'Mark bead as ready for execution',
		'ready→in_progress': 'Claim bead for execution (requires branch name and agent)',
		'in_progress→in_review': 'Submit for review (requires commit hash and execution log)',
		'in_review→closed': 'Approve and close bead',
		'in_review→in_progress': 'Request rework',
		'closed→open': 'Reopen bead',
		'*→blocked': 'Mark as blocked',
		'*→deferred': 'Defer bead'
	};

	return (
		descriptions[`${fromStatus}→${toStatus}`] ||
		descriptions[`*→${toStatus}`] ||
		`Change status from ${fromStatus} to ${toStatus}`
	);
}

/**
 * Get all valid target statuses from current status
 */
export function getValidTargetStatuses(fromStatus: BeadStatus): BeadStatus[] {
	return VALID_TRANSITIONS[fromStatus] || [];
}

/**
 * Check if transition requires a modal (has required fields)
 */
export function transitionRequiresModal(fromStatus: BeadStatus, toStatus: BeadStatus): boolean {
	const key = `${fromStatus}→${toStatus}`;
	return key in TRANSITION_REQUIREMENTS;
}
