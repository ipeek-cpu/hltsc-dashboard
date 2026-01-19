/**
 * Bead Data Validation
 * Validates timestamps, status values, and field formats
 */

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

export interface ValidationError {
	field: string;
	message: string;
	value?: unknown;
}

export interface ValidationWarning {
	field: string;
	message: string;
	value?: unknown;
}

// Valid status values
const VALID_STATUSES = ['open', 'ready', 'in_progress', 'in_review', 'closed', 'blocked', 'deferred', 'tombstone'];

// Legacy status mappings
const STATUS_MAPPINGS: Record<string, string> = {
	done: 'closed',
	wip: 'in_progress',
	todo: 'open',
	pending: 'open',
	review: 'in_review'
};

/**
 * Validate and normalize a status value
 */
export function normalizeStatus(status: string): string {
	const lower = status.toLowerCase().trim();

	// Check for exact match
	if (VALID_STATUSES.includes(lower)) {
		return lower;
	}

	// Check for legacy mapping
	if (lower in STATUS_MAPPINGS) {
		return STATUS_MAPPINGS[lower];
	}

	// Default to open if unknown
	return 'open';
}

/**
 * Check if a status value is valid
 */
export function isValidStatus(status: string): boolean {
	const lower = status.toLowerCase().trim();
	return VALID_STATUSES.includes(lower) || lower in STATUS_MAPPINGS;
}

/**
 * Validate ISO timestamp format and timezone
 */
export function validateTimestamp(timestamp: string): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	if (!timestamp) {
		errors.push({
			field: 'timestamp',
			message: 'Timestamp is required',
			value: timestamp
		});
		return { valid: false, errors, warnings };
	}

	// Check for valid ISO 8601 format
	const isoRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
	if (!isoRegex.test(timestamp)) {
		errors.push({
			field: 'timestamp',
			message: 'Invalid timestamp format. Expected ISO 8601 format',
			value: timestamp
		});
		return { valid: false, errors, warnings };
	}

	// Check for timezone
	const hasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(timestamp) || timestamp.endsWith('Z');
	if (!hasTimezone) {
		warnings.push({
			field: 'timestamp',
			message: 'Timestamp missing timezone. Consider adding timezone offset',
			value: timestamp
		});
	}

	// Check if date is valid
	const date = new Date(timestamp);
	if (isNaN(date.getTime())) {
		errors.push({
			field: 'timestamp',
			message: 'Invalid date value',
			value: timestamp
		});
		return { valid: false, errors, warnings };
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Add timezone offset to a timestamp if missing
 */
export function normalizeTimestamp(timestamp: string, defaultOffset = '-06:00'): string {
	if (!timestamp) return timestamp;

	// Already has timezone
	const hasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(timestamp) || timestamp.endsWith('Z');
	if (hasTimezone) {
		return timestamp;
	}

	// Add default offset
	return timestamp + defaultOffset;
}

/**
 * Validate assignee format (should have @ prefix)
 */
export function validateAssignee(assignee: string | null): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	if (!assignee) {
		return { valid: true, errors, warnings };
	}

	if (!assignee.startsWith('@')) {
		warnings.push({
			field: 'assignee',
			message: 'Assignee should start with @ symbol',
			value: assignee
		});
	}

	return { valid: true, errors, warnings };
}

/**
 * Normalize assignee format (add @ prefix if missing)
 */
export function normalizeAssignee(assignee: string | null): string | null {
	if (!assignee) return null;

	const trimmed = assignee.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith('@')) {
		return trimmed;
	}

	return `@${trimmed}`;
}

/**
 * Validate bead lifecycle fields for a specific transition
 */
export function validateLifecycleFields(
	fromStatus: string,
	toStatus: string,
	data: {
		branch_name?: string;
		agent_id?: string;
		commit_hash?: string;
		execution_log?: string;
		pr_url?: string;
	}
): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	// Validate ready → in_progress transition
	if (fromStatus === 'ready' && toStatus === 'in_progress') {
		if (!data.branch_name?.trim()) {
			errors.push({
				field: 'branch_name',
				message: 'Branch name is required when claiming a bead'
			});
		}
		if (!data.agent_id?.trim()) {
			errors.push({
				field: 'agent_id',
				message: 'Agent ID is required when claiming a bead'
			});
		}
	}

	// Validate in_progress → in_review transition
	if (fromStatus === 'in_progress' && toStatus === 'in_review') {
		if (!data.commit_hash?.trim()) {
			errors.push({
				field: 'commit_hash',
				message: 'Commit hash is required when submitting for review'
			});
		}
		if (!data.execution_log?.trim()) {
			errors.push({
				field: 'execution_log',
				message: 'Execution log is required when submitting for review'
			});
		}
	}

	// Validate commit hash format if provided
	if (data.commit_hash) {
		const hashRegex = /^[a-f0-9]{7,40}$/i;
		if (!hashRegex.test(data.commit_hash.trim())) {
			warnings.push({
				field: 'commit_hash',
				message: 'Commit hash appears to be malformed',
				value: data.commit_hash
			});
		}
	}

	// Validate PR URL format if provided
	if (data.pr_url) {
		try {
			const url = new URL(data.pr_url);
			if (!url.hostname.includes('github.com') && !url.hostname.includes('gitlab.com')) {
				warnings.push({
					field: 'pr_url',
					message: 'PR URL does not appear to be from GitHub or GitLab',
					value: data.pr_url
				});
			}
		} catch {
			errors.push({
				field: 'pr_url',
				message: 'Invalid PR URL format',
				value: data.pr_url
			});
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all fields of a bead/issue
 */
export function validateBead(bead: {
	id?: string;
	title?: string;
	status?: string;
	created_at?: string;
	updated_at?: string;
	assignee?: string | null;
}): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	// Validate ID
	if (!bead.id?.trim()) {
		errors.push({
			field: 'id',
			message: 'Bead ID is required'
		});
	}

	// Validate title
	if (!bead.title?.trim()) {
		errors.push({
			field: 'title',
			message: 'Bead title is required'
		});
	}

	// Validate status
	if (bead.status && !isValidStatus(bead.status)) {
		warnings.push({
			field: 'status',
			message: `Unknown status '${bead.status}', will be normalized`,
			value: bead.status
		});
	}

	// Validate timestamps
	if (bead.created_at) {
		const created = validateTimestamp(bead.created_at);
		errors.push(...created.errors.map((e) => ({ ...e, field: 'created_at' })));
		warnings.push(...created.warnings.map((w) => ({ ...w, field: 'created_at' })));
	}

	if (bead.updated_at) {
		const updated = validateTimestamp(bead.updated_at);
		errors.push(...updated.errors.map((e) => ({ ...e, field: 'updated_at' })));
		warnings.push(...updated.warnings.map((w) => ({ ...w, field: 'updated_at' })));
	}

	// Validate assignee
	const assigneeResult = validateAssignee(bead.assignee ?? null);
	warnings.push(...assigneeResult.warnings);

	return { valid: errors.length === 0, errors, warnings };
}
