/**
 * Intent Links Management
 *
 * Manages the .beads/intent-links.json file which stores
 * bead-to-intent-anchor relationships.
 *
 * This module provides CRUD operations for intent links, enabling:
 * - Linking beads to specific intent anchors
 * - Querying links by bead or anchor
 * - Batch updates for a bead's links
 *
 * The intent-links.json file is git-tracked alongside other beads data.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { IntentLink, IntentLinksFile, IntentRelevance } from './types';
import { INTENT_LINKS_SCHEMA_VERSION, DEFAULT_INTENT_LINKS_FILE } from './types';

/**
 * Get the path to intent-links.json for a project
 *
 * @param projectPath - Absolute path to the project root
 * @returns Full path to .beads/intent-links.json
 */
export function getIntentLinksPath(projectPath: string): string {
	return join(projectPath, '.beads', 'intent-links.json');
}

/**
 * Load intent links from file
 *
 * Returns an empty links file if the file doesn't exist or is malformed.
 * This ensures graceful degradation for projects without intent links.
 *
 * @param projectPath - Absolute path to the project root
 * @returns The intent links file contents
 */
export async function loadIntentLinks(projectPath: string): Promise<IntentLinksFile> {
	const linksPath = getIntentLinksPath(projectPath);

	if (!existsSync(linksPath)) {
		return { ...DEFAULT_INTENT_LINKS_FILE };
	}

	try {
		const content = await readFile(linksPath, 'utf-8');
		const data = JSON.parse(content) as IntentLinksFile;

		// Validate basic structure
		if (typeof data.version !== 'number' || !Array.isArray(data.links)) {
			console.error('Invalid intent-links.json structure, returning default');
			return { ...DEFAULT_INTENT_LINKS_FILE };
		}

		return data;
	} catch (e) {
		console.error('Failed to load intent links:', e);
		return { ...DEFAULT_INTENT_LINKS_FILE };
	}
}

/**
 * Save intent links to file
 *
 * Creates the .beads directory if it doesn't exist.
 *
 * @param projectPath - Absolute path to the project root
 * @param links - The intent links file to save
 */
export async function saveIntentLinks(
	projectPath: string,
	links: IntentLinksFile
): Promise<void> {
	const linksPath = getIntentLinksPath(projectPath);

	// Ensure directory exists
	const dir = dirname(linksPath);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}

	await writeFile(linksPath, JSON.stringify(links, null, 2), 'utf-8');
}

/**
 * Get links for a specific bead
 *
 * @param projectPath - Absolute path to the project root
 * @param beadId - The bead ID to find links for
 * @returns Array of links for the bead
 */
export async function getLinksForBead(
	projectPath: string,
	beadId: string
): Promise<IntentLink[]> {
	const data = await loadIntentLinks(projectPath);
	return data.links.filter((l) => l.beadId === beadId);
}

/**
 * Get all beads linked to a specific anchor
 *
 * @param projectPath - Absolute path to the project root
 * @param anchor - The anchor path to find links for
 * @returns Array of links to the anchor
 */
export async function getBeadsForAnchor(
	projectPath: string,
	anchor: string
): Promise<IntentLink[]> {
	const data = await loadIntentLinks(projectPath);
	return data.links.filter((l) => l.anchor === anchor);
}

/**
 * Add a link between a bead and an intent anchor
 *
 * @param projectPath - Absolute path to the project root
 * @param link - The link to add (without addedAt timestamp)
 * @returns The created link with timestamp
 * @throws Error if link already exists
 */
export async function addIntentLink(
	projectPath: string,
	link: Omit<IntentLink, 'addedAt'>
): Promise<IntentLink> {
	const data = await loadIntentLinks(projectPath);

	// Check for duplicate
	const exists = data.links.some(
		(l) => l.beadId === link.beadId && l.anchor === link.anchor
	);

	if (exists) {
		throw new Error(`Link already exists: ${link.beadId} -> ${link.anchor}`);
	}

	const fullLink: IntentLink = {
		...link,
		addedAt: new Date().toISOString()
	};

	data.links.push(fullLink);
	await saveIntentLinks(projectPath, data);

	return fullLink;
}

/**
 * Remove a link between a bead and an intent anchor
 *
 * @param projectPath - Absolute path to the project root
 * @param beadId - The bead ID
 * @param anchor - The anchor path
 * @returns true if a link was removed, false if not found
 */
export async function removeIntentLink(
	projectPath: string,
	beadId: string,
	anchor: string
): Promise<boolean> {
	const data = await loadIntentLinks(projectPath);
	const initialLength = data.links.length;

	data.links = data.links.filter(
		(l) => !(l.beadId === beadId && l.anchor === anchor)
	);

	if (data.links.length < initialLength) {
		await saveIntentLinks(projectPath, data);
		return true;
	}

	return false;
}

/**
 * Update links for a bead (replace all)
 *
 * Removes all existing links for the bead and replaces them with new ones.
 * Useful for batch updates from the UI.
 *
 * @param projectPath - Absolute path to the project root
 * @param beadId - The bead ID
 * @param anchors - Array of anchor paths to link to
 * @param addedBy - Who is adding the links (default: 'user')
 * @returns Array of created links
 */
export async function updateBeadLinks(
	projectPath: string,
	beadId: string,
	anchors: string[],
	addedBy: 'user' | 'agent' = 'user'
): Promise<IntentLink[]> {
	const data = await loadIntentLinks(projectPath);

	// Remove existing links for this bead
	data.links = data.links.filter((l) => l.beadId !== beadId);

	// Add new links
	const now = new Date().toISOString();
	const newLinks: IntentLink[] = anchors.map((anchor) => ({
		beadId,
		anchor,
		relevance: 'primary' as IntentRelevance,
		addedAt: now,
		addedBy
	}));

	data.links.push(...newLinks);
	await saveIntentLinks(projectPath, data);

	return newLinks;
}

/**
 * Check if a specific link exists
 *
 * @param projectPath - Absolute path to the project root
 * @param beadId - The bead ID
 * @param anchor - The anchor path
 * @returns true if the link exists
 */
export async function hasLink(
	projectPath: string,
	beadId: string,
	anchor: string
): Promise<boolean> {
	const data = await loadIntentLinks(projectPath);
	return data.links.some((l) => l.beadId === beadId && l.anchor === anchor);
}

/**
 * Get all unique anchors that have links
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of unique anchor paths
 */
export async function getLinkedAnchors(projectPath: string): Promise<string[]> {
	const data = await loadIntentLinks(projectPath);
	return Array.from(new Set(data.links.map((l) => l.anchor)));
}

/**
 * Get all unique beads that have links
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of unique bead IDs
 */
export async function getLinkedBeads(projectPath: string): Promise<string[]> {
	const data = await loadIntentLinks(projectPath);
	return Array.from(new Set(data.links.map((l) => l.beadId)));
}

/**
 * Remove all links for a bead
 *
 * Useful when a bead is deleted.
 *
 * @param projectPath - Absolute path to the project root
 * @param beadId - The bead ID
 * @returns Number of links removed
 */
export async function removeAllLinksForBead(
	projectPath: string,
	beadId: string
): Promise<number> {
	const data = await loadIntentLinks(projectPath);
	const initialLength = data.links.length;

	data.links = data.links.filter((l) => l.beadId !== beadId);
	const removed = initialLength - data.links.length;

	if (removed > 0) {
		await saveIntentLinks(projectPath, data);
	}

	return removed;
}

/**
 * Remove all links for an anchor
 *
 * Useful when an anchor is removed from the intent document.
 *
 * @param projectPath - Absolute path to the project root
 * @param anchor - The anchor path
 * @returns Number of links removed
 */
export async function removeAllLinksForAnchor(
	projectPath: string,
	anchor: string
): Promise<number> {
	const data = await loadIntentLinks(projectPath);
	const initialLength = data.links.length;

	data.links = data.links.filter((l) => l.anchor !== anchor);
	const removed = initialLength - data.links.length;

	if (removed > 0) {
		await saveIntentLinks(projectPath, data);
	}

	return removed;
}

/**
 * Update the relevance of an existing link
 *
 * @param projectPath - Absolute path to the project root
 * @param beadId - The bead ID
 * @param anchor - The anchor path
 * @param relevance - New relevance level
 * @returns The updated link, or null if not found
 */
export async function updateLinkRelevance(
	projectPath: string,
	beadId: string,
	anchor: string,
	relevance: IntentRelevance
): Promise<IntentLink | null> {
	const data = await loadIntentLinks(projectPath);
	const link = data.links.find(
		(l) => l.beadId === beadId && l.anchor === anchor
	);

	if (!link) {
		return null;
	}

	link.relevance = relevance;
	await saveIntentLinks(projectPath, data);

	return link;
}
