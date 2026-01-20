/**
 * Parser for PROJECT_INTENT.md files
 *
 * Parses markdown documents with YAML frontmatter and anchor annotations.
 * Builds hierarchical section trees from markdown headings.
 *
 * This parser is pure (no side effects, no file I/O).
 */

import type {
	ProjectIntent,
	IntentSection,
	IntentParseResult,
	IntentParseOptions,
	IntentAnchorRef,
	IntentAnchorInfo,
	IntentParseWarning
} from './types';
import { ANCHOR_PATTERN, INTENT_SCHEMA_VERSION } from './types';

// ============================================================================
// Frontmatter Extraction
// ============================================================================

/**
 * Extract YAML frontmatter from markdown content
 *
 * Expected format:
 * ```
 * ---
 * version: 1
 * created_at: 2026-01-15T10:00:00Z
 * updated_at: 2026-01-20T14:30:00Z
 * ---
 * ```
 *
 * @param content - Raw markdown content
 * @returns Parsed frontmatter or null if not found/invalid
 */
export function extractFrontmatter(content: string): {
	version: number;
	createdAt: string;
	updatedAt: string;
} | null {
	// Match YAML frontmatter block at start of document
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return null;
	}

	const yamlContent = match[1];

	// Parse YAML fields manually (simple key: value format)
	const fields: Record<string, string> = {};
	const lines = yamlContent.split('\n');

	for (const line of lines) {
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.substring(0, colonIndex).trim();
		const value = line.substring(colonIndex + 1).trim();

		if (key && value) {
			fields[key] = value;
		}
	}

	// Extract required fields
	const version = parseInt(fields['version'] || '', 10);
	const createdAt = fields['created_at'] || '';
	const updatedAt = fields['updated_at'] || '';

	// Validate version is a number
	if (isNaN(version)) {
		return null;
	}

	// Validate timestamps look like ISO 8601
	const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
	if (!isoRegex.test(createdAt) || !isoRegex.test(updatedAt)) {
		return null;
	}

	return { version, createdAt, updatedAt };
}

/**
 * Remove frontmatter from content, returning the body
 */
function removeFrontmatter(content: string): string {
	const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n?/;
	return content.replace(frontmatterRegex, '');
}

// ============================================================================
// Anchor Extraction
// ============================================================================

/**
 * Extract all anchors from the document with line numbers
 *
 * Anchors use the format: {#anchor:path.to.section}
 * The path supports dot-notation for hierarchy.
 *
 * @param content - Raw markdown content
 * @returns Array of anchor references with line numbers
 */
export function extractAnchors(content: string): IntentAnchorRef[] {
	const anchors: IntentAnchorRef[] = [];

	// We need a fresh regex each time since we use lastIndex
	const anchorRegex = new RegExp(ANCHOR_PATTERN.source, 'g');
	let match: RegExpExecArray | null;

	while ((match = anchorRegex.exec(content)) !== null) {
		const path = match[1];
		anchors.push({ path });
	}

	return anchors;
}

/**
 * Extract anchors with line number information
 */
export function extractAnchorsWithLineNumbers(content: string): IntentAnchorInfo[] {
	const anchors: IntentAnchorInfo[] = [];
	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNumber = i + 1;

		// Find all anchors on this line
		const anchorRegex = new RegExp(ANCHOR_PATTERN.source, 'g');
		let match: RegExpExecArray | null;

		while ((match = anchorRegex.exec(line)) !== null) {
			anchors.push({
				path: match[1],
				line: lineNumber
			});
		}
	}

	return anchors;
}

// ============================================================================
// Heading Parsing
// ============================================================================

/**
 * Represents a parsed heading from the markdown
 */
interface ParsedHeading {
	level: number;
	text: string;
	anchor?: string;
	lineNumber: number;
	contentStart: number;
	contentEnd: number;
}

/**
 * Parse a heading line to extract level, text, and optional anchor
 */
function parseHeadingLine(line: string): { level: number; text: string; anchor?: string } | null {
	// Match markdown headings: # to ######
	const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
	if (!headingMatch) {
		return null;
	}

	const level = headingMatch[1].length;
	let text = headingMatch[2].trim();
	let anchor: string | undefined;

	// Extract anchor if present in the heading
	const anchorRegex = new RegExp(ANCHOR_PATTERN.source);
	const anchorMatch = text.match(anchorRegex);

	if (anchorMatch) {
		anchor = anchorMatch[1];
		// Remove anchor from heading text
		text = text.replace(anchorMatch[0], '').trim();
	}

	return { level, text, anchor };
}

/**
 * Generate a slug ID from heading text
 * Converts to lowercase, replaces spaces with hyphens, removes special chars
 */
function generateSlugId(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/-+/g, '-') // Collapse multiple hyphens
		.replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}

/**
 * Parse markdown content into flat list of headings with content ranges
 */
function parseHeadingsFlat(content: string): ParsedHeading[] {
	const lines = content.split('\n');
	const headings: ParsedHeading[] = [];

	for (let i = 0; i < lines.length; i++) {
		const parsed = parseHeadingLine(lines[i]);
		if (parsed) {
			headings.push({
				level: parsed.level,
				text: parsed.text,
				anchor: parsed.anchor,
				lineNumber: i + 1,
				contentStart: i + 1, // Will be updated
				contentEnd: lines.length // Will be updated
			});
		}
	}

	// Calculate content ranges
	for (let i = 0; i < headings.length; i++) {
		headings[i].contentStart = headings[i].lineNumber + 1;
		if (i < headings.length - 1) {
			headings[i].contentEnd = headings[i + 1].lineNumber - 1;
		} else {
			headings[i].contentEnd = lines.length;
		}
	}

	return headings;
}

/**
 * Extract content lines between start and end (1-indexed, inclusive)
 */
function extractContent(content: string, start: number, end: number): string {
	const lines = content.split('\n');
	const contentLines = lines.slice(start - 1, end);

	// Trim leading and trailing empty lines
	while (contentLines.length > 0 && contentLines[0].trim() === '') {
		contentLines.shift();
	}
	while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
		contentLines.pop();
	}

	return contentLines.join('\n');
}

/**
 * Parse markdown headings into hierarchical section tree
 *
 * @param content - Markdown content (without frontmatter)
 * @returns Array of top-level sections with nested children
 */
export function parseHeadings(content: string): IntentSection[] {
	const flatHeadings = parseHeadingsFlat(content);
	const sections: IntentSection[] = [];

	if (flatHeadings.length === 0) {
		return sections;
	}

	// Build hierarchy using a stack
	const stack: { section: IntentSection; level: number }[] = [];

	for (const heading of flatHeadings) {
		const section: IntentSection = {
			id: generateSlugId(heading.text),
			heading: heading.text,
			level: heading.level,
			content: extractContent(content, heading.contentStart, heading.contentEnd),
			children: []
		};

		if (heading.anchor) {
			section.anchor = heading.anchor;
		}

		// Pop stack until we find a parent with lower level
		while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
			stack.pop();
		}

		if (stack.length === 0) {
			// Top-level section
			sections.push(section);
		} else {
			// Child of the section on top of stack
			stack[stack.length - 1].section.children.push(section);
		}

		stack.push({ section, level: heading.level });
	}

	return sections;
}

// ============================================================================
// Section Navigation
// ============================================================================

/**
 * Get a section by anchor path using dot-notation
 *
 * Searches for a section with a matching explicit anchor path.
 * The path can be hierarchical (e.g., "business-model.revenue").
 *
 * @param intent - Parsed ProjectIntent
 * @param anchorPath - Dot-notation path to the anchor
 * @returns Matching section or null if not found
 */
export function getSectionByAnchor(
	intent: ProjectIntent,
	anchorPath: string
): IntentSection | null {
	// First, try to find a section with an exact anchor match
	const exactMatch = findSectionByExactAnchor(intent.sections, anchorPath);
	if (exactMatch) {
		return exactMatch;
	}

	// If not found by exact anchor, try navigating by path components
	// This supports anchors like "business-model.revenue" where each part
	// corresponds to a nested section
	const pathParts = anchorPath.split('.');
	return navigateByPath(intent.sections, pathParts);
}

/**
 * Find a section with an exact anchor match (recursive)
 */
function findSectionByExactAnchor(
	sections: IntentSection[],
	anchorPath: string
): IntentSection | null {
	for (const section of sections) {
		if (section.anchor === anchorPath) {
			return section;
		}

		// Search children
		const childMatch = findSectionByExactAnchor(section.children, anchorPath);
		if (childMatch) {
			return childMatch;
		}
	}

	return null;
}

/**
 * Navigate sections by path parts (e.g., ["business-model", "revenue"])
 *
 * Each path part matches against the section's id or anchor
 */
function navigateByPath(sections: IntentSection[], pathParts: string[]): IntentSection | null {
	if (pathParts.length === 0) {
		return null;
	}

	const [current, ...rest] = pathParts;

	// Find section matching current path part
	const section = sections.find(
		(s) =>
			s.id === current ||
			s.anchor === current ||
			(s.anchor && s.anchor.endsWith('.' + current)) ||
			(s.anchor && s.anchor.startsWith(current + '.'))
	);

	if (!section) {
		return null;
	}

	if (rest.length === 0) {
		return section;
	}

	// Continue navigation in children
	return navigateByPath(section.children, rest);
}

// ============================================================================
// Injection Markdown Building
// ============================================================================

/**
 * Build formatted markdown for Claude context injection
 *
 * If linkedAnchors are specified, only those sections (and their ancestors)
 * are included. Otherwise, the full document is formatted.
 *
 * @param intent - Parsed ProjectIntent
 * @param linkedAnchors - Optional array of anchor paths to include
 * @returns Formatted markdown string
 */
export function buildInjectionMarkdown(intent: ProjectIntent, linkedAnchors?: string[]): string {
	const lines: string[] = [];

	// Add metadata header
	lines.push(`<!-- Intent v${intent.version} | Updated: ${intent.updatedAt} -->`);
	lines.push('');

	if (linkedAnchors && linkedAnchors.length > 0) {
		// Include only linked sections
		const includedSections = new Set<IntentSection>();

		for (const anchorPath of linkedAnchors) {
			const section = getSectionByAnchor(intent, anchorPath);
			if (section) {
				includedSections.add(section);
				// Also collect ancestors for context (would need parent tracking)
			}
		}

		for (const section of includedSections) {
			formatSection(section, lines, true);
		}
	} else {
		// Include all sections
		for (const section of intent.sections) {
			formatSection(section, lines, false);
		}
	}

	return lines.join('\n').trim();
}

/**
 * Format a section and its children as markdown
 */
function formatSection(section: IntentSection, lines: string[], skipChildren: boolean): void {
	// Build heading with anchor reference if present
	const anchorRef = section.anchor ? ` [${section.anchor}]` : '';
	const heading = '#'.repeat(section.level) + ' ' + section.heading + anchorRef;

	lines.push(heading);

	if (section.content.trim()) {
		lines.push('');
		lines.push(section.content);
	}

	lines.push('');

	// Include children unless skipped
	if (!skipChildren) {
		for (const child of section.children) {
			formatSection(child, lines, false);
		}
	}
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a PROJECT_INTENT.md file content into structured data
 *
 * @param content - Raw markdown content
 * @param options - Optional parsing options
 * @returns Parse result with intent, anchors, and warnings
 */
export function parseIntentDocument(
	content: string,
	options?: IntentParseOptions
): IntentParseResult {
	const warnings: IntentParseWarning[] = [];
	const extractAnchorsOption = options?.extractAnchors ?? true;
	const buildHierarchyOption = options?.buildHierarchy ?? true;

	// Extract frontmatter
	const frontmatter = extractFrontmatter(content);

	// Use defaults if frontmatter is missing or invalid
	const now = new Date().toISOString();
	const version = frontmatter?.version ?? INTENT_SCHEMA_VERSION;
	const createdAt = frontmatter?.createdAt ?? now;
	const updatedAt = frontmatter?.updatedAt ?? now;

	if (!frontmatter) {
		warnings.push({
			type: 'invalid_anchor_format', // Reusing type for frontmatter warning
			message: 'Missing or invalid YAML frontmatter. Using default values.',
			line: 1
		});
	}

	// Remove frontmatter from content for parsing body
	const body = removeFrontmatter(content);

	// Parse sections
	let sections: IntentSection[] = [];
	if (buildHierarchyOption) {
		sections = parseHeadings(body);
	}

	// Extract anchors with line numbers
	let anchors: IntentAnchorInfo[] = [];
	if (extractAnchorsOption) {
		anchors = extractAnchorsWithLineNumbers(content);

		// Check for duplicate anchors
		const seenPaths = new Set<string>();
		for (const anchor of anchors) {
			if (seenPaths.has(anchor.path)) {
				warnings.push({
					type: 'duplicate_anchor',
					message: `Duplicate anchor path: ${anchor.path}`,
					line: anchor.line
				});
			} else {
				seenPaths.add(anchor.path);
			}
		}

		// Check for anchors not associated with headings (orphan anchors)
		// This happens when anchors are in content body, not heading lines
		const headingLines = new Set<number>();
		const lines = content.split('\n');
		for (let i = 0; i < lines.length; i++) {
			if (parseHeadingLine(lines[i])) {
				headingLines.add(i + 1);
			}
		}

		for (const anchor of anchors) {
			if (!headingLines.has(anchor.line)) {
				warnings.push({
					type: 'orphan_anchor',
					message: `Anchor "${anchor.path}" is not in a heading line`,
					line: anchor.line
				});
			}
		}
	}

	// Build the ProjectIntent structure
	const intent: ProjectIntent = {
		version,
		createdAt,
		updatedAt,
		sections
	};

	return {
		intent,
		anchors,
		warnings
	};
}
