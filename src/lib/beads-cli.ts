/**
 * Server-side Beads CLI utilities
 * This file contains functions that use Node.js APIs and should only be used server-side
 */

import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

/**
 * Get bd prime output for a project
 * This provides dynamic, up-to-date Beads workflow context
 */
export function getBdPrimeContext(projectPath: string): string | null {
	try {
		// Get the bd CLI path
		const bdPath = path.join(os.homedir(), '.beads-dashboard', 'bin', 'bd');

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
