/**
 * Scaffold Manager - Uses Claude Code to scaffold new projects
 * Reuses the Claude CLI infrastructure from chat-manager
 */
import {
	createClaudeSession,
	sendMessage as claudeSend,
	type ClaudeSession,
	type ClaudeOutputChunk
} from '$lib/claude-cli';
import { addProject } from '$lib/dashboard-db';
import { ensureInstalled as ensureNodeInstalled, getNodeBinDir } from '$lib/node-manager';
import { ensureInstalled as ensureBeadsInstalled, getBeadsPath } from '$lib/beads-manager';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProjectType } from './scaffold-templates';

const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'scaffold-manager.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
	} catch {
		// Ignore
	}
}

/**
 * Initialize Beads in a project directory programmatically
 * Returns true on success, throws on failure
 */
async function initBeadsInProject(projectPath: string): Promise<void> {
	const bdPath = getBeadsPath();
	logDebug(`Initializing Beads in ${projectPath} using ${bdPath}`);

	return new Promise((resolve, reject) => {
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
				logDebug(`Beads initialized successfully: ${stdout}`);
				resolve();
			} else {
				const error = stderr || `bd init exited with code ${code}`;
				logDebug(`Beads init failed: ${error}`);
				reject(new Error(error));
			}
		});

		child.on('error', (err) => {
			logDebug(`Failed to spawn bd init: ${err.message}`);
			reject(new Error(`Failed to run bd init: ${err.message}`));
		});
	});
}

export interface ScaffoldRequest {
	projectType: ProjectType;
	projectName: string;
	parentDirectory: string;
	framework?: string;
	options: Record<string, string | boolean>;
	extraInstructions?: string;
}

export interface ScaffoldSession {
	id: string;
	projectPath: string;
	projectName: string;
	status: 'running' | 'complete' | 'error';
	error?: string;
	claudeSession: ClaudeSession | null;
	// Set when project is successfully created
	createdProjectId?: string;
}

// Active scaffold sessions
const scaffoldSessions = new Map<string, ScaffoldSession>();

// SSE controllers for streaming to clients
const sseControllers = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Build a prompt for Claude to scaffold the project
 */
function buildScaffoldPrompt(request: ScaffoldRequest): string {
	const { projectType, projectName, parentDirectory, framework, options, extraInstructions } = request;
	const projectPath = path.join(parentDirectory, projectName);
	const nodeBinDir = getNodeBinDir();

	// Build options description
	const enabledOptions = Object.entries(options)
		.filter(([_, v]) => v === true || (typeof v === 'string' && v))
		.map(([k, v]) => typeof v === 'string' ? `${k}: ${v}` : k);

	const typeDescriptions: Record<ProjectType, string> = {
		website: 'static website',
		webapp: 'web application',
		mobile: 'mobile app with Expo/React Native',
		shopify: 'Shopify theme',
		api: 'API backend'
	};

	let prompt = `Create a new ${typeDescriptions[projectType] || projectType} project.

Project name: ${projectName}
Location: ${projectPath}
${framework ? `Framework: ${framework}` : ''}

CRITICAL - Progress Tracking with TodoWrite:
You MUST use the TodoWrite tool to track your progress. This shows the user what you're doing.
1. IMMEDIATELY after reading this, create a todo list with all the steps you'll perform
2. Mark each task as "in_progress" when you start it
3. Mark each task as "completed" when you finish it
4. Keep updating the todo list as you work

Example TodoWrite usage:
- First call: Create todos with status "pending" for all steps
- Before each step: Update the todo to "in_progress"
- After each step: Update the todo to "completed"

Each todo item needs: content (what to do), status (pending/in_progress/completed), activeForm (present tense, e.g., "Installing dependencies...")

CRITICAL - Node.js Setup:
The user does NOT have node/npm/npx installed system-wide.
You MUST prepend the PATH in EVERY bash command that uses node, npm, or npx:

PATH="${nodeBinDir}:$PATH" <your command>

Examples:
- PATH="${nodeBinDir}:$PATH" npx create-next-app@latest . --yes
- PATH="${nodeBinDir}:$PATH" npm install
- PATH="${nodeBinDir}:$PATH" npm run build

First, create the directory: mkdir -p "${projectPath}"
Then cd into it and scaffold the project.
`;

	if (enabledOptions.length > 0) {
		prompt += `\nOptions to enable:\n${enabledOptions.map(o => `- ${o}`).join('\n')}\n`;
	}

	if (extraInstructions?.trim()) {
		prompt += `\nAdditional instructions:\n${extraInstructions}\n`;
	}

	prompt += `
After scaffolding:
1. Make sure all dependencies are installed (PATH="${nodeBinDir}:$PATH" npm install)
2. Initialize a git repository if not already done
3. Let me know when the project is ready

Important: Use non-interactive mode for all commands (add --yes or similar flags where needed).
`;

	return prompt;
}

/**
 * Start a scaffold session
 */
export function startScaffoldSession(
	sessionId: string,
	request: ScaffoldRequest
): ScaffoldSession | null {
	logDebug(`Starting scaffold session: ${sessionId}`);

	const projectPath = path.join(request.parentDirectory, request.projectName);

	// Check if directory already exists
	if (fs.existsSync(projectPath)) {
		logDebug(`Directory already exists: ${projectPath}`);
		return null;
	}

	// Create parent directory if needed
	if (!fs.existsSync(request.parentDirectory)) {
		logDebug(`Parent directory doesn't exist: ${request.parentDirectory}`);
		return null;
	}

	// Create Claude session - use parent directory as working dir initially
	const claudeSession = createClaudeSession({
		projectPath: request.parentDirectory,
		model: 'sonnet', // Use sonnet for speed
		mode: 'agent',
		onData: (chunk: ClaudeOutputChunk) => {
			handleClaudeOutput(sessionId, chunk);
		},
		onError: (error: Error) => {
			logDebug(`Claude error: ${error.message}`);
			const session = scaffoldSessions.get(sessionId);
			if (session) {
				session.status = 'error';
				session.error = error.message;
			}
			broadcastToSession(sessionId, {
				type: 'error',
				content: error.message
			});
		},
		// Note: onClose here is NOT called - the actual onClose is in sendMessage below
		onClose: () => {}
	});

	if (!claudeSession) {
		logDebug('Failed to create Claude session');
		return null;
	}

	const session: ScaffoldSession = {
		id: sessionId,
		projectPath,
		projectName: request.projectName,
		status: 'running',
		claudeSession
	};

	scaffoldSessions.set(sessionId, session);

	// Send the scaffold prompt
	const prompt = buildScaffoldPrompt(request);
	logDebug(`Sending prompt: ${prompt.substring(0, 200)}...`);

	claudeSend(
		claudeSession,
		prompt,
		(chunk: ClaudeOutputChunk) => handleClaudeOutput(sessionId, chunk),
		(error: Error) => {
			logDebug(`Send error: ${error.message}`);
			broadcastToSession(sessionId, { type: 'error', content: error.message });
		},
		async (code: number) => {
			logDebug(`Send complete with code: ${code}`);
			const session = scaffoldSessions.get(sessionId);
			if (session && session.status === 'running') {
				if (code === 0) {
					// Success - initialize Beads and add project to dashboard
					try {
						// Initialize Beads programmatically (more reliable than prompt)
						broadcastToSession(sessionId, {
							type: 'status',
							status: 'Initializing Beads...'
						});
						await initBeadsInProject(projectPath);
						logDebug('Beads initialized successfully');

						const project = addProject(projectPath, request.projectName);
						session.status = 'complete';
						session.createdProjectId = project.id;
						logDebug(`Project added successfully: ${project.id}`);
						console.log(`[Scaffold] Project added to dashboard: ${project.id} - ${project.name} at ${project.path}`);
						const doneMessage = {
							type: 'done',
							projectId: project.id,
							projectName: project.name,
							projectPath: project.path
						};
						console.log(`[Scaffold] Broadcasting done message:`, doneMessage);
						broadcastToSession(sessionId, doneMessage);
					} catch (err) {
						session.status = 'error';
						session.error = err instanceof Error ? err.message : 'Failed to initialize project';
						logDebug(`Failed to initialize project: ${session.error}`);
						broadcastToSession(sessionId, {
							type: 'error',
							content: session.error
						});
					}
				} else {
					session.status = 'error';
					session.error = `Claude exited with code ${code}`;
					logDebug(`Claude exited with non-zero code: ${code}`);
					broadcastToSession(sessionId, {
						type: 'error',
						content: session.error
					});
				}
			}
		}
	);

	return session;
}

/**
 * Handle Claude output and broadcast to SSE clients
 */
function handleClaudeOutput(sessionId: string, chunk: ClaudeOutputChunk): void {
	// Don't broadcast Claude's 'done' message - we send our own 'done' with project info
	// after Beads initialization completes
	if (chunk.type === 'done') {
		logDebug(`Ignoring Claude's done message, will send our own after Beads init`);
		return;
	}

	// Transform chunk for scaffold UI
	const message: Record<string, unknown> = { type: chunk.type };

	if (chunk.type === 'text' && chunk.content) {
		message.content = chunk.content;
	} else if (chunk.type === 'tool_use') {
		message.tool = chunk.toolName;
		message.input = chunk.toolInput;
	} else if (chunk.type === 'tool_result') {
		message.result = chunk.toolResult;
	} else if (chunk.type === 'status') {
		message.status = chunk.statusWord;
	}

	broadcastToSession(sessionId, message);
}

/**
 * Broadcast a message to all SSE clients for a session
 */
function broadcastToSession(sessionId: string, data: Record<string, unknown>): void {
	const controllers = sseControllers.get(sessionId);
	if (!controllers) return;

	const encoder = new TextEncoder();
	const message = `data: ${JSON.stringify(data)}\n\n`;

	for (const controller of controllers) {
		try {
			controller.enqueue(encoder.encode(message));
		} catch {
			// Controller may be closed
		}
	}
}

/**
 * Register an SSE controller for a session
 */
export function registerSSEController(
	sessionId: string,
	controller: ReadableStreamDefaultController
): void {
	let controllers = sseControllers.get(sessionId);
	if (!controllers) {
		controllers = new Set();
		sseControllers.set(sessionId, controllers);
	}
	controllers.add(controller);
}

/**
 * Unregister an SSE controller
 */
export function unregisterSSEController(
	sessionId: string,
	controller: ReadableStreamDefaultController
): void {
	const controllers = sseControllers.get(sessionId);
	if (controllers) {
		controllers.delete(controller);
		if (controllers.size === 0) {
			sseControllers.delete(sessionId);
		}
	}
}

/**
 * Get a scaffold session
 */
export function getScaffoldSession(sessionId: string): ScaffoldSession | undefined {
	return scaffoldSessions.get(sessionId);
}

/**
 * Clean up a scaffold session
 */
export function cleanupScaffoldSession(sessionId: string): void {
	scaffoldSessions.delete(sessionId);
	sseControllers.delete(sessionId);
}
