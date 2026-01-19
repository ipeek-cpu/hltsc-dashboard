/**
 * Profile Detection Logic
 *
 * Auto-detects project type based on file patterns in the project directory.
 * Supports monorepos with multiple project types.
 */

import type { ProfileId, ProfileDetectionResult, MultiProfileDetectionResult } from './types';
import { builtInProfiles, genericProfile } from './definitions';

/** Minimum confidence threshold to consider a profile as detected */
const MIN_CONFIDENCE_THRESHOLD = 0.2;

/** Confidence threshold to consider detection "high confidence" */
const HIGH_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Check if a pattern matches any file in the provided file list
 * Supports simple glob patterns: *, **, and direct file names
 */
function patternMatches(pattern: string, files: string[]): boolean {
	// Convert glob pattern to regex
	const regexPattern = pattern
		.replace(/\./g, '\\.')
		.replace(/\*\*/g, '{{GLOBSTAR}}')
		.replace(/\*/g, '[^/]*')
		.replace(/\{\{GLOBSTAR\}\}/g, '.*');

	const regex = new RegExp(`(^|/)${regexPattern}($|/)`);

	return files.some((file) => regex.test(file));
}

/**
 * Detect ALL matching profiles for a project (supports monorepos)
 * @param files List of file paths relative to project root
 * @returns Multi-profile detection result
 */
export function detectAllProfiles(files: string[]): MultiProfileDetectionResult {
	// Skip generic profile as it's the fallback
	const detectableProfiles = builtInProfiles.filter((p) => p.id !== 'generic');
	const detectedProfiles: ProfileDetectionResult[] = [];

	for (const profile of detectableProfiles) {
		const matchedPatterns: string[] = [];

		for (const pattern of profile.detectionPatterns) {
			if (patternMatches(pattern, files)) {
				matchedPatterns.push(pattern);
			}
		}

		if (matchedPatterns.length > 0) {
			// Calculate confidence based on number of matches relative to total patterns
			const confidence = matchedPatterns.length / profile.detectionPatterns.length;

			if (confidence >= MIN_CONFIDENCE_THRESHOLD) {
				detectedProfiles.push({
					profileId: profile.id as ProfileId,
					confidence,
					matchedPatterns,
					profileName: profile.name
				});
			}
		}
	}

	// Sort by confidence (highest first)
	detectedProfiles.sort((a, b) => b.confidence - a.confidence);

	// Determine if this is a monorepo (2+ profiles with reasonable confidence)
	const highConfidenceCount = detectedProfiles.filter(
		(p) => p.confidence >= HIGH_CONFIDENCE_THRESHOLD
	).length;
	const isMonorepo = highConfidenceCount >= 2 || detectedProfiles.length >= 2;

	// Primary profile is the highest confidence one, or generic if none
	const primaryProfile = detectedProfiles.length > 0 ? detectedProfiles[0].profileId : 'generic';

	return {
		detectedProfiles,
		isMonorepo,
		primaryProfile
	};
}

/**
 * Detect the best single profile (legacy function for backwards compatibility)
 * @param files List of file paths relative to project root
 * @returns Detection result with profile ID, confidence, and matched patterns
 */
export function detectProfile(files: string[]): ProfileDetectionResult {
	const result = detectAllProfiles(files);

	if (result.detectedProfiles.length > 0) {
		return result.detectedProfiles[0];
	}

	return {
		profileId: 'generic',
		confidence: 0,
		matchedPatterns: []
	};
}

/**
 * Detect all profiles from a directory path by listing its files
 * This is a server-side function that reads the filesystem
 * @param projectPath Absolute path to the project directory
 * @returns Multi-profile detection result
 */
export async function detectAllProfilesFromPath(projectPath: string): Promise<MultiProfileDetectionResult> {
	const files = await listProjectFiles(projectPath);
	return detectAllProfiles(files);
}

/**
 * Detect single profile from a directory path (legacy function)
 * @param projectPath Absolute path to the project directory
 * @returns Detection result
 */
export async function detectProfileFromPath(projectPath: string): Promise<ProfileDetectionResult> {
	const files = await listProjectFiles(projectPath);
	return detectProfile(files);
}

/**
 * List files in a project directory (root + one level deep)
 */
async function listProjectFiles(projectPath: string): Promise<string[]> {
	const fs = await import('fs/promises');
	const path = await import('path');

	try {
		// Get files in the root directory and two levels deep for monorepos
		const rootFiles = await fs.readdir(projectPath, { withFileTypes: true });
		const files: string[] = [];

		for (const entry of rootFiles) {
			files.push(entry.name);

			// Check subdirectories for key files (supports monorepo structures)
			if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
				try {
					const subPath = path.join(projectPath, entry.name);
					const subFiles = await fs.readdir(subPath, { withFileTypes: true });

					for (const subEntry of subFiles) {
						files.push(`${entry.name}/${subEntry.name}`);

						// Go one more level for common monorepo structures like apps/ios/, packages/web/
						if (subEntry.isDirectory() && !subEntry.name.startsWith('.') && subEntry.name !== 'node_modules') {
							try {
								const deepPath = path.join(subPath, subEntry.name);
								const deepFiles = await fs.readdir(deepPath);
								for (const deepFile of deepFiles) {
									files.push(`${entry.name}/${subEntry.name}/${deepFile}`);
								}
							} catch {
								// Ignore errors reading deep directories
							}
						}
					}
				} catch {
					// Ignore errors reading subdirectories
				}
			}
		}

		return files;
	} catch (error) {
		console.error('Error listing project files:', error);
		return [];
	}
}

/**
 * Get a human-readable description of the detection result
 */
export function describeDetection(result: ProfileDetectionResult): string {
	if (result.profileId === 'generic' || result.confidence === 0) {
		return 'No specific project type detected';
	}

	const confidenceLevel =
		result.confidence >= 0.7 ? 'High' : result.confidence >= 0.4 ? 'Medium' : 'Low';

	return `${confidenceLevel} confidence ${result.profileId} project (matched: ${result.matchedPatterns.join(', ')})`;
}

/**
 * Get a human-readable description of multi-profile detection
 */
export function describeMultiDetection(result: MultiProfileDetectionResult): string {
	if (result.detectedProfiles.length === 0) {
		return 'No specific project types detected';
	}

	if (result.isMonorepo) {
		const profileNames = result.detectedProfiles.map((p) => p.profileName || p.profileId);
		return `Monorepo detected with: ${profileNames.join(', ')}`;
	}

	return describeDetection(result.detectedProfiles[0]);
}
