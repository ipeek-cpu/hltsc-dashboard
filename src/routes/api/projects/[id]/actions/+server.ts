import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { getProfile } from '$lib/profiles';
import { spawn } from 'child_process';

/**
 * POST /api/projects/[id]/actions
 * Execute a quick action command in the project directory
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	let body: { actionId?: string; command?: string; profileId?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { actionId, command, profileId = 'generic' } = body;

	if (!actionId && !command) {
		return json({ error: 'Either actionId or command is required' }, { status: 400 });
	}

	// Get the command to execute
	let commandToRun: string;
	let actionLabel: string;

	if (command) {
		// Direct command provided
		commandToRun = command;
		actionLabel = actionId || 'custom';
	} else if (actionId) {
		// Look up action from profile
		const profile = getProfile(profileId);
		const action = profile.quickActions.find((a) => a.id === actionId);

		if (!action) {
			return json({ error: `Action '${actionId}' not found in profile '${profileId}'` }, { status: 404 });
		}

		commandToRun = action.command;
		actionLabel = action.label;
	} else {
		return json({ error: 'No command to execute' }, { status: 400 });
	}

	try {
		const result = await executeCommand(commandToRun, project.path);

		return json({
			success: result.exitCode === 0,
			action: actionLabel,
			command: commandToRun,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			message: result.exitCode === 0 ? 'Command completed successfully' : 'Command failed'
		});
	} catch (error) {
		console.error('Action execution error:', error);
		return json(
			{
				success: false,
				action: actionLabel,
				command: commandToRun,
				error: error instanceof Error ? error.message : 'Unknown error',
				message: 'Failed to execute command'
			},
			{ status: 500 }
		);
	}
};

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Execute a command in the specified directory
 */
function executeCommand(command: string, cwd: string): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const errorChunks: Buffer[] = [];

		// Split command into parts for spawn
		const parts = command.split(' ');
		const cmd = parts[0];
		const args = parts.slice(1);

		const proc = spawn(cmd, args, {
			cwd,
			shell: true,
			env: {
				...process.env,
				// Ensure we can find common tools
				PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`
			}
		});

		proc.stdout.on('data', (data) => {
			chunks.push(data);
		});

		proc.stderr.on('data', (data) => {
			errorChunks.push(data);
		});

		proc.on('close', (code) => {
			resolve({
				exitCode: code ?? 1,
				stdout: Buffer.concat(chunks).toString('utf-8'),
				stderr: Buffer.concat(errorChunks).toString('utf-8')
			});
		});

		proc.on('error', (err) => {
			reject(err);
		});

		// Timeout after 60 seconds
		setTimeout(() => {
			proc.kill('SIGTERM');
			reject(new Error('Command timed out after 60 seconds'));
		}, 60000);
	});
}

/**
 * GET /api/projects/[id]/actions
 * List available actions for the project's detected profile
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const profileId = url.searchParams.get('profileId') || 'generic';
	const profile = getProfile(profileId);

	return json({
		profileId: profile.id,
		profileName: profile.name,
		actions: profile.quickActions.map((action) => ({
			id: action.id,
			label: action.label,
			icon: action.icon,
			description: action.description,
			shortcut: action.shortcut,
			requiresConfirmation: action.requiresConfirmation
		}))
	});
};
