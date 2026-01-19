/**
 * Project Profile Types
 *
 * Defines the structure for project-type-specific configurations
 * that adapt the dashboard UI, quick actions, and context generation.
 */

/** Built-in profile identifiers */
export type ProfileId = 'ios' | 'web' | 'infra' | 'generic';

/** Quick action definition for profile-specific commands */
export interface QuickAction {
	id: string;
	label: string;
	icon: string;
	/** Command to execute via Claude Code CLI */
	command: string;
	/** Short description shown on hover */
	description?: string;
	/** If true, shows confirmation dialog before executing */
	requiresConfirmation?: boolean;
	/** Keyboard shortcut (e.g., "cmd+b" for build) */
	shortcut?: string;
}

/** Default settings for context pack generation */
export interface ContextPackDefaults {
	/** Glob patterns for files to include */
	includePatterns: string[];
	/** Glob patterns for files to exclude */
	excludePatterns: string[];
	/** CodeGraph node kinds to focus on */
	codeGraphFocus: Array<'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'route' | 'component'>;
	/** Maximum depth for dependency traversal */
	maxDepth?: number;
}

/** Complete project profile configuration */
export interface ProjectProfile {
	id: ProfileId | string;
	name: string;
	/** Short description of this profile */
	description: string;
	/** Icon name from feather-icons */
	icon: string;
	/** File patterns used to auto-detect this profile */
	detectionPatterns: string[];
	/** Quick actions available for this profile */
	quickActions: QuickAction[];
	/** Default settings for context pack generation */
	contextDefaults: ContextPackDefaults;
	/** Suggested agent names for this project type */
	suggestedAgents: string[];
}

/** User's profile selection for a project */
export interface ProjectProfileSettings {
	/** Currently selected profile IDs (supports monorepos with multiple profiles) */
	selectedProfiles: Array<ProfileId | string>;
	/** Whether the selection was auto-detected or manually overridden */
	isAutoDetected: boolean;
	/** Custom overrides for quick actions */
	customActions?: QuickAction[];
	/** Custom overrides for context defaults */
	customContextDefaults?: Partial<ContextPackDefaults>;
}

/** Multiple profile detection results for monorepos */
export interface MultiProfileDetectionResult {
	/** All detected profiles with their confidence scores */
	detectedProfiles: ProfileDetectionResult[];
	/** Whether this appears to be a monorepo (multiple high-confidence matches) */
	isMonorepo: boolean;
	/** Primary recommended profile if user wants single selection */
	primaryProfile: ProfileId;
}

/** Result of profile detection */
export interface ProfileDetectionResult {
	/** Detected profile ID */
	profileId: ProfileId;
	/** Confidence score (0-1) */
	confidence: number;
	/** Patterns that matched */
	matchedPatterns: string[];
	/** Display name of the profile */
	profileName?: string;
}
