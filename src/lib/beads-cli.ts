/**
 * Server-side Beads CLI utilities
 * This file contains functions that use Node.js APIs and should only be used server-side
 */

import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

/**
 * Get the path to the bd CLI
 */
function getBdPath(): string {
	return path.join(os.homedir(), '.beads-dashboard', 'bin', 'bd');
}

/**
 * Get bd prime output for a project
 * This provides dynamic, up-to-date Beads workflow context
 */
export function getBdPrimeContext(projectPath: string): string | null {
	try {
		const bdPath = getBdPath();

		// Run bd prime in the project directory
		const output = execSync(`"${bdPath}" prime`, {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 5000, // 5 second timeout
			stdio: ['pipe', 'pipe', 'pipe']
		});

		return output.trim();
	} catch (error) {
		console.error('[beads-cli] Failed to get bd prime context:', error);
		return null;
	}
}

/**
 * Close a bead using the bd CLI
 *
 * @param projectPath - The project directory
 * @param issueId - The bead ID to close
 * @param reason - Optional reason for closing
 * @returns Object with success status and optional error message
 */
export function closeBead(
	projectPath: string,
	issueId: string,
	reason?: string
): { success: boolean; error?: string } {
	try {
		const bdPath = getBdPath();

		// Build the command
		let cmd = `"${bdPath}" close "${issueId}"`;
		if (reason) {
			// Escape quotes in reason
			const escapedReason = reason.replace(/"/g, '\\"');
			cmd += ` --reason="${escapedReason}"`;
		}

		execSync(cmd, {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 10000, // 10 second timeout
			stdio: ['pipe', 'pipe', 'pipe']
		});

		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('[beads-cli] Failed to close bead:', message);
		return { success: false, error: message };
	}
}

/**
 * Update a bead's status using the bd CLI
 *
 * @param projectPath - The project directory
 * @param issueId - The bead ID to update
 * @param status - The new status
 * @returns Object with success status and optional error message
 */
export function updateBeadStatus(
	projectPath: string,
	issueId: string,
	status: string
): { success: boolean; error?: string } {
	try {
		const bdPath = getBdPath();

		const cmd = `"${bdPath}" update "${issueId}" --status="${status}"`;

		execSync(cmd, {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: 10000,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('[beads-cli] Failed to update bead status:', message);
		return { success: false, error: message };
	}
}
