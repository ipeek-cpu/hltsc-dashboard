/**
 * Intent injection for Claude session context
 *
 * Builds formatted intent context for injection into Claude sessions.
 * Supports anchor-based filtering and token budgeting.
 *
 * Key features:
 * - Load intent-links.json to find anchors linked to beads
 * - Format intent markdown with highlighted linked sections
 * - Respect token budget by prioritizing linked sections
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
	IntentInjection,
	ProjectIntent,
	IntentSection,
	IntentLinksFile,
	IntentLink
} from './types';
import { DEFAULT_INTENT_LINKS_FILE } from './types';
import { loadProjectIntent } from './cache';
import { getSectionByAnchor, buildInjectionMarkdown } from './parser';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default token budget for intent injection
 */
const DEFAULT_MAX_TOKENS = 2000;

/**
 * Approximate characters per token (conservative estimate)
 * Claude tokenizer averages ~4 chars per token for English text
 */
const CHARS_PER_TOKEN = 4;

/**
 * Path to intent links file within .beads directory
 */
const INTENT_LINKS_FILENAME = 'intent-links.json';

// ============================================================================
// Intent Links File Management
// ============================================================================

/**
 * Load intent links file from project (synchronous for simpler API)
 *
 * @param projectPath - Absolute path to project root
 * @returns Parsed intent links file, or default if not found
 */
function loadIntentLinksFileSync(projectPath: string): IntentLinksFile {
	const linksPath = join(projectPath, '.beads', INTENT_LINKS_FILENAME);

	if (!existsSync(linksPath)) {
		return DEFAULT_INTENT_LINKS_FILE;
	}

	try {
		const content = readFileSync(linksPath, 'utf8');
		const parsed = JSON.parse(content) as IntentLinksFile;

		// Validate structure
		if (typeof parsed.version !== 'number' || !Array.isArray(parsed.links)) {
			console.warn('Invalid intent-links.json structure, using default');
			return DEFAULT_INTENT_LINKS_FILE;
		}

		return parsed;
	} catch (err) {
		console.warn('Failed to load intent-links.json:', err);
		return DEFAULT_INTENT_LINKS_FILE;
	}
}

/**
 * Get linked anchors for a specific bead
 *
 * Reads .beads/intent-links.json and filters for links matching the bead ID.
 *
 * @param projectPath - Absolute path to project root
 * @param beadId - The bead ID to find links for
 * @returns Array of anchor paths linked to this bead
 */
export function getLinkedAnchors(projectPath: string, beadId: string): string[] {
	const linksFile = loadIntentLinksFileSync(projectPath);
	return linksFile.links
		.filter((link: IntentLink) => link.beadId === beadId)
		.map((link: IntentLink) => link.anchor);
}

/**
 * Get linked anchors with full link metadata
 *
 * @param projectPath - Absolute path to project root
 * @param beadId - The bead ID to find links for
 * @returns Array of IntentLink objects for this bead
 */
export function getLinkedAnchorsWithMetadata(
	projectPath: string,
	beadId: string
): IntentLink[] {
	const linksFile = loadIntentLinksFileSync(projectPath);
	return linksFile.links.filter((link) => link.beadId === beadId);
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for intent content
 *
 * Uses a conservative estimate of ~4 characters per token.
 * This is a rough approximation - actual tokenization varies by model.
 *
 * @param content - The text content to estimate
 * @returns Estimated token count
 */
export function estimateIntentTokens(content: string): number {
	if (!content) return 0;
	return Math.ceil(content.length / CHARS_PER_TOKEN);
}

// ============================================================================
// Intent Formatting
// ============================================================================

/**
 * Format a section with its children as markdown
 *
 * @param section - The section to format
 * @param linkedAnchors - Optional anchors to highlight
 * @param includeChildren - Whether to include child sections
 * @returns Formatted markdown string
 */
function formatSectionWithHighlight(
	section: IntentSection,
	linkedAnchors?: string[],
	includeChildren: boolean = true
): string {
	const lines: string[] = [];

	// Check if this section is linked
	const isLinked =
		linkedAnchors &&
		linkedAnchors.length > 0 &&
		(linkedAnchors.includes(section.anchor || '') ||
			linkedAnchors.includes(section.id) ||
			linkedAnchors.some(
				(anchor) =>
					section.anchor &&
					(section.anchor.startsWith(anchor + '.') || anchor.startsWith(section.anchor + '.'))
			));

	// Build heading with anchor reference and highlight if linked
	const anchorRef = section.anchor ? ` {#anchor:${section.anchor}}` : '';
	const heading = '#'.repeat(section.level) + ' ' + section.heading + anchorRef;

	lines.push(heading);

	// Add linked indicator
	if (isLinked) {
		lines.push('<!-- LINKED TO CURRENT BEAD -->');
	}

	if (section.content.trim()) {
		lines.push('');
		lines.push(section.content);
	}

	lines.push('');

	// Include children
	if (includeChildren && section.children.length > 0) {
		for (const child of section.children) {
			lines.push(formatSectionWithHighlight(child, linkedAnchors, true));
		}
	}

	return lines.join('\n');
}

/**
 * Format intent for injection into Claude context
 *
 * Formats the intent document as markdown, highlighting linked sections
 * if anchor paths are provided.
 *
 * @param intent - Parsed ProjectIntent
 * @param linkedAnchors - Optional array of anchor paths to highlight
 * @returns Formatted markdown string ready for injection
 */
export function formatIntentForInjection(intent: ProjectIntent, linkedAnchors?: string[]): string {
	const lines: string[] = [];

	// Add metadata comment
	lines.push(`<!-- Intent v${intent.version} | Updated: ${intent.updatedAt} -->`);

	// Add relevant anchors comment if any are linked
	if (linkedAnchors && linkedAnchors.length > 0) {
		lines.push(`<!-- RELEVANT ANCHORS: ${linkedAnchors.join(', ')} -->`);
	}

	lines.push('');

	// Format each top-level section
	for (const section of intent.sections) {
		lines.push(formatSectionWithHighlight(section, linkedAnchors, true));
	}

	return lines.join('\n').trim();
}

/**
 * Format intent with only linked sections (for token-constrained contexts)
 *
 * @param intent - Parsed ProjectIntent
 * @param linkedAnchors - Anchor paths to include
 * @returns Formatted markdown with only linked sections
 */
function formatLinkedSectionsOnly(intent: ProjectIntent, linkedAnchors: string[]): string {
	const lines: string[] = [];

	// Add metadata comment
	lines.push(`<!-- Intent v${intent.version} | Updated: ${intent.updatedAt} -->`);
	lines.push(`<!-- SHOWING LINKED SECTIONS ONLY: ${linkedAnchors.join(', ')} -->`);
	lines.push('');

	// Collect linked sections
	const linkedSections: IntentSection[] = [];

	for (const anchor of linkedAnchors) {
		const section = getSectionByAnchor(intent, anchor);
		if (section && !linkedSections.includes(section)) {
			linkedSections.push(section);
		}
	}

	// Format each linked section (without children to save tokens)
	for (const section of linkedSections) {
		const anchorRef = section.anchor ? ` {#anchor:${section.anchor}}` : '';
		lines.push('#'.repeat(section.level) + ' ' + section.heading + anchorRef);
		lines.push('<!-- LINKED TO CURRENT BEAD -->');

		if (section.content.trim()) {
			lines.push('');
			lines.push(section.content);
		}

		lines.push('');
	}

	return lines.join('\n').trim();
}

// ============================================================================
// Main Build Function
// ============================================================================

/**
 * Build intent context for Claude session injection
 *
 * Loads the project intent, optionally filters by linked anchors,
 * and formats for injection within a token budget.
 *
 * If linkedAnchors are provided, those sections are highlighted.
 * If the full document exceeds the token budget, linked sections
 * are prioritized and others are truncated.
 *
 * @param projectPath - Absolute path to project root
 * @param projectId - The project ID for cache lookup
 * @param options - Optional configuration
 * @returns IntentInjection object or null if no intent file exists
 */
export async function buildIntentContext(
	projectPath: string,
	projectId: string,
	options?: {
		linkedAnchors?: string[];
		maxTokens?: number;
		includeFullDocument?: boolean;
	}
): Promise<IntentInjection | null> {
	const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
	const includeFullDocument = options?.includeFullDocument ?? true;
	const linkedAnchors = options?.linkedAnchors ?? [];

	// Load the intent from cache or file
	const intentResult = await loadProjectIntent(projectPath, projectId);

	if (!intentResult) {
		return null;
	}

	const { intent, anchors } = intentResult;

	// Get all anchor paths
	const allAnchorPaths = anchors.map((a) => a.path);

	// Format the intent
	let formattedMarkdown: string;

	if (includeFullDocument) {
		// Include full document with highlights
		formattedMarkdown = formatIntentForInjection(intent, linkedAnchors);
	} else if (linkedAnchors.length > 0) {
		// Include only linked sections
		formattedMarkdown = formatLinkedSectionsOnly(intent, linkedAnchors);
	} else {
		// No linked anchors and not including full - use built-in formatter
		formattedMarkdown = buildInjectionMarkdown(intent);
	}

	// Check token budget
	const estimatedTokens = estimateIntentTokens(formattedMarkdown);

	if (estimatedTokens > maxTokens) {
		// Over budget - try to truncate
		if (linkedAnchors.length > 0) {
			// Prioritize linked sections
			formattedMarkdown = formatLinkedSectionsOnly(intent, linkedAnchors);

			// If still over budget, truncate content
			const stillOverBudget = estimateIntentTokens(formattedMarkdown) > maxTokens;
			if (stillOverBudget) {
				const maxChars = maxTokens * CHARS_PER_TOKEN;
				formattedMarkdown = formattedMarkdown.slice(0, maxChars);
				formattedMarkdown += '\n\n<!-- TRUNCATED: Intent exceeds token budget -->';
			}
		} else {
			// No linked anchors - truncate the full document
			const maxChars = maxTokens * CHARS_PER_TOKEN;
			formattedMarkdown = formattedMarkdown.slice(0, maxChars);
			formattedMarkdown += '\n\n<!-- TRUNCATED: Intent exceeds token budget -->';
		}
	}

	return {
		projectId,
		formattedMarkdown,
		anchors: allAnchorPaths,
		linkedAnchors: linkedAnchors.length > 0 ? linkedAnchors : undefined
	};
}

/**
 * Build intent context with automatic anchor discovery for a bead
 *
 * Convenience function that loads linked anchors for the bead automatically.
 *
 * @param projectPath - Absolute path to project root
 * @param projectId - The project ID
 * @param beadId - The bead ID to find linked anchors for
 * @param options - Optional configuration
 * @returns IntentInjection object or null if no intent file exists
 */
export async function buildIntentContextForBead(
	projectPath: string,
	projectId: string,
	beadId: string,
	options?: {
		maxTokens?: number;
		includeFullDocument?: boolean;
	}
): Promise<IntentInjection | null> {
	// Get linked anchors for this bead
	const linkedAnchors = getLinkedAnchors(projectPath, beadId);

	return buildIntentContext(projectPath, projectId, {
		linkedAnchors,
		maxTokens: options?.maxTokens,
		includeFullDocument: options?.includeFullDocument
	});
}
