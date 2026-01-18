import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import { getProjectById } from '$lib/dashboard-db';
import {
	ensureInstalled,
	getBeadsPath,
	getLatestVersion,
	getProjectBeadsVersion
} from '$lib/beads-manager';
import type { RequestHandler } from './$types';

/**
 * POST - Update beads for a specific project
 * This ensures the latest beads CLI is installed, then re-initializes beads in the project
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Get project
	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		// Ensure latest beads is installed
		console.log('[update-beads] Ensuring latest beads is installed...');
		await ensureInstalled();

		const beadsPath = getBeadsPath();
		const latestVersion = await getLatestVersion();

		// Run beads status to update the project's local version
		// Running any beads command with the new CLI updates .beads/.local_version
		console.log('[update-beads] Running beads status in project:', project.path);

		execSync(`"${beadsPath}" status --no-activity`, {
			cwd: project.path,
			encoding: 'utf-8',
			timeout: 30000,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		// Get the new version
		const newVersion = getProjectBeadsVersion(project.path);

		console.log('[update-beads] Project updated to version:', newVersion);

		return json({
			success: true,
			previousVersion: null, // We could track this if needed
			newVersion,
			latestVersion
		});
	} catch (err) {
		console.error('[update-beads] Error:', err);
		return json(
			{
				error: err instanceof Error ? err.message : 'Failed to update beads'
			},
			{ status: 500 }
		);
	}
};
