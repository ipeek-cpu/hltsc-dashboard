import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getProjectType, type ProjectType } from '$lib/scaffold-templates';
import {
	startScaffoldSession,
	getScaffoldSession,
	type ScaffoldRequest
} from '$lib/scaffold-manager';
import { ensureInstalled as ensureNodeInstalled } from '$lib/node-manager';
import { ensureInstalled as ensureBeadsInstalled } from '$lib/beads-manager';
import type { RequestHandler } from './$types';

/**
 * POST - Start scaffolding a new project using Claude
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const {
			projectType,
			projectName,
			parentDirectory,
			framework,
			options = {},
			extraInstructions = ''
		} = body as {
			projectType: ProjectType;
			projectName: string;
			parentDirectory: string;
			framework?: string;
			options?: Record<string, boolean | string>;
			extraInstructions?: string;
		};

		// Validate inputs
		if (!projectType || !projectName || !parentDirectory) {
			return json(
				{ error: 'Project type, name, and parent directory are required' },
				{ status: 400 }
			);
		}

		// Ensure Node.js is installed (downloads if needed)
		console.log('[scaffold] Ensuring Node.js is installed...');
		try {
			await ensureNodeInstalled();
			console.log('[scaffold] Node.js ready');
		} catch (nodeErr) {
			console.error('[scaffold] Failed to install Node.js:', nodeErr);
			return json(
				{ error: 'Failed to install Node.js. Check your internet connection.' },
				{ status: 500 }
			);
		}

		// Ensure Beads is installed (downloads if needed)
		console.log('[scaffold] Ensuring Beads is installed...');
		try {
			await ensureBeadsInstalled();
			console.log('[scaffold] Beads ready');
		} catch (beadsErr) {
			console.error('[scaffold] Failed to install Beads:', beadsErr);
			return json(
				{ error: 'Failed to install Beads CLI. Check your internet connection.' },
				{ status: 500 }
			);
		}

		// Validate project type
		const typeConfig = getProjectType(projectType);
		if (!typeConfig) {
			return json({ error: 'Invalid project type' }, { status: 400 });
		}

		// Validate parent directory exists
		if (!fs.existsSync(parentDirectory)) {
			return json({ error: 'Parent directory does not exist' }, { status: 400 });
		}

		// Build full project path and check it doesn't exist
		const projectPath = path.join(parentDirectory, projectName);
		if (fs.existsSync(projectPath)) {
			return json(
				{ error: 'A folder with this name already exists' },
				{ status: 400 }
			);
		}

		// Create session ID
		const sessionId = randomUUID();
		const selectedFramework = framework || typeConfig.defaultFramework;

		// Build scaffold request
		const scaffoldRequest: ScaffoldRequest = {
			projectType,
			projectName,
			parentDirectory,
			framework: selectedFramework,
			options,
			extraInstructions
		};

		// Start scaffold session with Claude
		const session = startScaffoldSession(sessionId, scaffoldRequest);

		if (!session) {
			return json(
				{ error: 'Failed to start scaffold session. Make sure Claude Code is configured.' },
				{ status: 500 }
			);
		}

		return json({
			sessionId,
			projectPath
		});
	} catch (err) {
		console.error('[scaffold] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

/**
 * GET - Get session status
 */
export const GET: RequestHandler = async ({ url }) => {
	const sessionId = url.searchParams.get('sessionId');

	if (!sessionId) {
		return json({ error: 'Session ID is required' }, { status: 400 });
	}

	const session = getScaffoldSession(sessionId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json({
		status: session.status,
		error: session.error,
		projectPath: session.projectPath,
		projectName: session.projectName
	});
};
