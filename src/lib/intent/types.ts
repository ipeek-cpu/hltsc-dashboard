/**
 * Type definitions for Project Intent system
 *
 * Project Intent provides persistent documentation of business/technical assumptions
 * that survive session compaction and provide consistent context across agents.
 *
 * Intent documents are stored as markdown files (PROJECT_INTENT.md) with optional
 * anchor annotations ({#anchor:path}) for fine-grained linking to beads.
 *
 * Storage:
 * - Source file: <project_root>/PROJECT_INTENT.md (git-tracked)
 * - Cache: dashboard.db project_intents table
 * - Links: .beads/intent-links.json (git-tracked)
 */

// ============================================================================
// Intent Document Types
// ============================================================================

/**
 * Parsed Project Intent document structure
 *
 * Represents the fully parsed intent document with hierarchical sections
 * and extracted anchor paths.
 */
export interface ProjectIntent {
	/** Schema version for forward compatibility */
	version: number;

	/** ISO 8601 timestamp when the intent was first created */
	createdAt: string;

	/** ISO 8601 timestamp when the intent was last modified */
	updatedAt: string;

	/** Hierarchical sections parsed from the markdown document */
	sections: IntentSection[];
}

/**
 * A section within the intent document
 *
 * Sections correspond to markdown headings and can be nested via children.
 * Each section may have an explicit anchor or one auto-generated from the heading.
 */
export interface IntentSection {
	/** Auto-generated ID from heading (lowercase, hyphenated) */
	id: string;

	/** Explicit anchor path if {#anchor:path} syntax present */
	anchor?: string;

	/** The original heading text */
	heading: string;

	/** Heading level (1-6 for h1-h6) */
	level: number;

	/** Content under this heading (markdown text until next heading) */
	content: string;

	/** Child sections (nested headings) */
	children: IntentSection[];
}

/**
 * Reference to an anchor within the intent document
 *
 * Used when linking beads or other entities to specific intent sections.
 */
export interface IntentAnchorRef {
	/** Dot-notation path to the anchor (e.g., "lifecycle.execute") */
	path: string;

	/** Resolved section if available */
	section?: IntentSection;
}

// ============================================================================
// Intent-Bead Linking Types
// ============================================================================

/**
 * Relevance level for intent-bead links
 *
 * - primary: The bead directly implements or addresses this intent section
 * - related: The bead is related to this intent section
 */
export type IntentRelevance = 'primary' | 'related';

/**
 * Link between a bead and an intent anchor
 *
 * Links provide bidirectional context: when working on a bead, relevant
 * intent sections can be surfaced automatically.
 */
export interface IntentLink {
	/** ID of the linked bead */
	beadId: string;

	/** Anchor path within the intent document */
	anchor: string;

	/** How relevant this intent section is to the bead */
	relevance: IntentRelevance;

	/** ISO 8601 timestamp when the link was created */
	addedAt: string;

	/** Who created the link */
	addedBy: 'user' | 'agent';

	/** Optional note explaining the link */
	note?: string;
}

/**
 * File format for .beads/intent-links.json
 *
 * This file is git-tracked and managed by the dashboard.
 */
export interface IntentLinksFile {
	/** Schema version for forward compatibility */
	version: number;

	/** All links between beads and intent anchors */
	links: IntentLink[];
}

// ============================================================================
// Intent Injection Types
// ============================================================================

/**
 * Intent context prepared for injection into Claude sessions
 *
 * Contains formatted markdown and metadata for context window management.
 */
export interface IntentInjection {
	/** Project ID this intent belongs to */
	projectId: string;

	/** Formatted markdown content ready for injection */
	formattedMarkdown: string;

	/** All anchor paths available in the document */
	anchors: string[];

	/** Anchors linked to the current bead (for filtering) */
	linkedAnchors?: string[];
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cached intent stored in dashboard.db
 *
 * The cache enables fast retrieval and change detection via file hash.
 */
export interface CachedIntent {
	/** Project ID this intent belongs to */
	projectId: string;

	/** SHA-256 hash of the source file for cache invalidation */
	fileHash: string;

	/** ISO 8601 timestamp when the intent was last parsed */
	parsedAt: string;

	/** Schema version of the cached document */
	version: number;

	/** Full markdown content of the intent document */
	content: string;

	/** All anchor paths extracted from the document */
	anchors: string[];
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Response from GET /api/projects/[id]/intent
 */
export interface IntentGetResponse {
	/** Parsed intent document */
	intent: {
		metadata: {
			version: number;
			createdAt: string;
			updatedAt: string;
		};
		sections: IntentSection[];
		anchors: IntentAnchorInfo[];
	};

	/** Cache status information */
	cache: {
		indexedAt: string;
		fileHash: string;
		isStale: boolean;
	};
}

/**
 * Anchor information with line number for navigation
 */
export interface IntentAnchorInfo {
	/** Anchor path (e.g., "business-model.revenue") */
	path: string;

	/** Line number in the source document */
	line: number;
}

/**
 * Request body for PUT /api/projects/[id]/intent
 */
export interface IntentPutRequest {
	/** Full markdown content to write */
	content: string;
}

/**
 * Response from PUT /api/projects/[id]/intent
 */
export interface IntentPutResponse {
	/** Operation success status */
	success: boolean;

	/** Updated intent (same as GET response) */
	intent: IntentGetResponse['intent'];

	/** Updated cache info */
	cache: IntentGetResponse['cache'];
}

/**
 * Error response for intent operations
 */
export interface IntentErrorResponse {
	/** Error code for programmatic handling */
	error: IntentErrorCode;

	/** Human-readable error message */
	message: string;

	/** Additional error details */
	details?: {
		line?: number;
		expected?: string;
	};
}

/**
 * Intent error codes
 */
export type IntentErrorCode = 'intent_not_found' | 'invalid_intent' | 'parse_error' | 'write_error';

// ============================================================================
// Parser Types
// ============================================================================

/**
 * Options for the intent parser
 */
export interface IntentParseOptions {
	/** Extract anchors from {#anchor:path} syntax */
	extractAnchors?: boolean;

	/** Build section hierarchy from headings */
	buildHierarchy?: boolean;
}

/**
 * Result of parsing an intent document
 */
export interface IntentParseResult {
	/** Parsed intent document */
	intent: ProjectIntent;

	/** All extracted anchors with line numbers */
	anchors: IntentAnchorInfo[];

	/** Any warnings during parsing (non-fatal issues) */
	warnings: IntentParseWarning[];
}

/**
 * Warning from intent parsing (non-fatal)
 */
export interface IntentParseWarning {
	/** Warning type */
	type: 'duplicate_anchor' | 'orphan_anchor' | 'invalid_anchor_format';

	/** Human-readable message */
	message: string;

	/** Line number where the warning occurred */
	line: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default intent document filename
 */
export const INTENT_FILENAME = 'PROJECT_INTENT.md';

/**
 * Regex pattern for extracting anchors from markdown
 * Matches: {#anchor:some.path} or {#anchor:some-path}
 */
export const ANCHOR_PATTERN = /\{#anchor:([a-z0-9-]+(?:\.[a-z0-9-]+)*)\}/g;

/**
 * Current schema version for intent documents
 */
export const INTENT_SCHEMA_VERSION = 1;

/**
 * Current schema version for intent links file
 */
export const INTENT_LINKS_SCHEMA_VERSION = 1;

/**
 * Default empty intent links file
 */
export const DEFAULT_INTENT_LINKS_FILE: IntentLinksFile = {
	version: INTENT_LINKS_SCHEMA_VERSION,
	links: []
};
