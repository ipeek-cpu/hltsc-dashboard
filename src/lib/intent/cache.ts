/**
 * Intent cache management for PROJECT_INTENT.md files
 *
 * This module provides caching layer for parsed intent documents.
 * The cache is stored in dashboard.db and invalidated via SHA-256 hash comparison.
 *
 * IMPORTANT: The cache is NEVER authoritative. The source of truth is always
 * the PROJECT_INTENT.md file on disk. Cache is purely for performance.
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parseIntentDocument } from './parser';
import { getCachedIntent, setCachedIntent, isIntentCacheValid } from '../dashboard-db';
import type { ProjectIntent, CachedIntent, IntentAnchorInfo } from './types';
import { INTENT_FILENAME, INTENT_SCHEMA_VERSION } from './types';

/**
 * Compute SHA-256 hash of file content
 *
 * Used for cache invalidation - if the hash changes, the cache is stale.
 *
 * @param content - The file content to hash
 * @returns Lowercase hex string of SHA-256 hash
 */
export function computeFileHash(content: string): string {
	return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Load project intent with caching
 *
 * Checks if the cache is valid (hash matches), and returns cached data if so.
 * Otherwise, parses the file fresh and updates the cache.
 *
 * @param projectPath - Absolute path to the project root
 * @param projectId - The project ID for cache lookup
 * @returns Intent and cache status, or null if file doesn't exist
 */
export async function loadProjectIntent(
	projectPath: string,
	projectId: string
): Promise<{ intent: ProjectIntent; anchors: IntentAnchorInfo[]; fromCache: boolean } | null> {
	const intentPath = join(projectPath, INTENT_FILENAME);

	// Check if file exists
	if (!existsSync(intentPath)) {
		return null;
	}

	// Read the file
	const content = await readFile(intentPath, 'utf8');
	const currentHash = computeFileHash(content);

	// Check if cache is valid
	if (isIntentCacheValid(projectId, currentHash)) {
		const cached = getCachedIntent(projectId);
		if (cached) {
			// Parse the cached content to get the full ProjectIntent structure
			const parseResult = parseIntentDocument(cached.content);
			return {
				intent: parseResult.intent,
				anchors: parseResult.anchors,
				fromCache: true
			};
		}
	}

	// Cache miss or invalid - parse fresh
	const parseResult = parseIntentDocument(content);

	// Update the cache
	const cachedIntent: CachedIntent = {
		projectId,
		fileHash: currentHash,
		parsedAt: new Date().toISOString(),
		version: INTENT_SCHEMA_VERSION,
		content,
		anchors: parseResult.anchors.map((a: IntentAnchorInfo) => a.path)
	};
	setCachedIntent(cachedIntent);

	return {
		intent: parseResult.intent,
		anchors: parseResult.anchors,
		fromCache: false
	};
}

/**
 * Force reindex - parse file and update cache regardless of hash
 *
 * Useful when you want to ensure the cache is fresh, or after editing
 * the intent file.
 *
 * @param projectPath - Absolute path to the project root
 * @param projectId - The project ID for cache storage
 * @returns Intent and hash, or null if file doesn't exist
 */
export async function reindexIntent(
	projectPath: string,
	projectId: string
): Promise<{ intent: ProjectIntent; anchors: IntentAnchorInfo[]; hash: string } | null> {
	const intentPath = join(projectPath, INTENT_FILENAME);

	// Check if file exists
	if (!existsSync(intentPath)) {
		return null;
	}

	// Read and parse the file
	const content = await readFile(intentPath, 'utf8');
	const hash = computeFileHash(content);
	const parseResult = parseIntentDocument(content);

	// Update the cache
	const cachedIntent: CachedIntent = {
		projectId,
		fileHash: hash,
		parsedAt: new Date().toISOString(),
		version: INTENT_SCHEMA_VERSION,
		content,
		anchors: parseResult.anchors.map((a: IntentAnchorInfo) => a.path)
	};
	setCachedIntent(cachedIntent);

	return {
		intent: parseResult.intent,
		anchors: parseResult.anchors,
		hash
	};
}

/**
 * Check if PROJECT_INTENT.md exists in the project
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if PROJECT_INTENT.md exists
 */
export function hasIntentFile(projectPath: string): boolean {
	const intentPath = join(projectPath, INTENT_FILENAME);
	return existsSync(intentPath);
}

/**
 * Get the path to the intent file for a project
 *
 * @param projectPath - Absolute path to the project root
 * @returns Full path to PROJECT_INTENT.md
 */
export function getIntentFilePath(projectPath: string): string {
	return join(projectPath, INTENT_FILENAME);
}
