import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import fs from 'fs';
import type { RequestHandler } from './$types';
import { getBeadsPath, isInstalled, ensureInstalled } from '$lib/beads-manager';

/**
 * GET - Check if beads is installed
 */
export const GET: RequestHandler = async () => {
	const installed = isInstalled();
	return json({ installed, bdPath: installed ? getBeadsPath() : null });
};

/**
 * POST - Initialize beads in a directory
 * Runs `bd init` to set up the .beads directory and database
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { path: projectPath } = body;

	if (!projectPath) {
		return json({ success: false, error: 'Path is required' }, { status: 400 });
	}

	// Ensure beads is installed (downloads if needed)
	try {
		await ensureInstalled();
	} catch (err) {
		return json({
			success: false,
			error: `Failed to install Beads CLI: ${err instanceof Error ? err.message : 'Unknown error'}`,
			notInstalled: true
		}, { status: 500 });
	}

	// Verify the path exists and is a directory
	if (!fs.existsSync(projectPath)) {
		return json({ success: false, error: 'Path does not exist' }, { status: 400 });
	}

	const stats = fs.statSync(projectPath);
	if (!stats.isDirectory()) {
		return json({ success: false, error: 'Path is not a directory' }, { status: 400 });
	}

	// Check if beads is already fully initialized (has the database)
	const beadsDbPath = `${projectPath}/.beads/beads.db`;
	if (fs.existsSync(beadsDbPath)) {
		// Beads is fully initialized - tell the client they can add it directly
		return json({
			success: false,
			error: 'Beads is already initialized in this directory',
			alreadyInitialized: true
		}, { status: 400 });
	}

	// If .beads directory exists but no database, it's a partial/corrupted state
	// Let bd init handle it (it may repair or fail gracefully)
	const beadsDir = `${projectPath}/.beads`;
	const hasPartialInit = fs.existsSync(beadsDir);

	try {
		// Run `bd init` in the project directory
		const bdPath = getBeadsPath();
		const result = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
			const child = spawn(bdPath, ['init'], {
				cwd: projectPath,
				env: process.env,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			let stdout = '';
			let stderr = '';

			child.stdout?.on('data', (data) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data) => {
				stderr += data.toString();
			});

			child.on('close', (code) => {
				if (code === 0) {
					resolve({ success: true, output: stdout });
				} else {
					resolve({
						success: false,
						output: stdout,
						error: stderr || `bd init exited with code ${code}`
					});
				}
			});

			child.on('error', (err) => {
				resolve({
					success: false,
					output: '',
					error: `Failed to run bd init: ${err.message}`
				});
			});
		});

		if (!result.success) {
			return json({
				success: false,
				error: result.error || 'Failed to initialize beads'
			}, { status: 500 });
		}

		return json({
			success: true,
			message: 'Beads initialized successfully',
			output: result.output
		});

	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error';
		return json({ success: false, error }, { status: 500 });
	}
};
