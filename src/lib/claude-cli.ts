import { randomUUID } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getClaudePath as getClaudePathFromSettings, getUserSkillLevel } from './settings';
import { getStoredToken, logout } from './claude-auth';
import { generateProjectInstructions } from './beads-instructions';
import { getBdPrimeContext } from './beads-cli';
import { getStartPromptContent } from './prompts';
import { getSessionContextForInjection } from './session-context';

// Path to bundled Node.js binary
const BUNDLED_NODE_DIR = path.join(os.homedir(), '.beads-dashboard', 'bin');

// Debug logging for production
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'claude-cli.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

logDebug('claude-cli.ts module loaded');

export interface ClaudeOutputChunk {
	type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'system' | 'status' | 'auth_expired';
	content?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	toolResult?: unknown;
	// Status info (for type: 'status')
	statusWord?: string;
	elapsed?: string;
	tokens?: string;
	state?: string;
	// Usage info (for type: 'done')
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	costUsd?: number;
	durationMs?: number;
}

export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';
export type ChatMode = 'agent' | 'plan' | 'ask';

export interface ClaudeSessionOptions {
	projectPath: string;
	agentPrompt?: string;
	model?: ClaudeModel;
	mode?: ChatMode;
	onData: (chunk: ClaudeOutputChunk) => void;
	onError: (error: Error) => void;
	onClose: (code: number) => void;
}

export interface ClaudeSession {
	id: string;
	projectPath: string;
	agentPrompt?: string;
	model: ClaudeModel;
	mode: ChatMode;
	isFirstMessage: boolean;  // Track if we need -c flag
	isStreaming: boolean;
	currentProcess: ChildProcess | null;
	onDataCallback?: (chunk: ClaudeOutputChunk) => void;
}

// Get the Claude CLI path from settings (auto-detects if not configured)
function getClaudePath(): string | null {
	logDebug('getClaudePath called');
	const result = getClaudePathFromSettings();
	logDebug(`getClaudePathFromSettings returned: path=${result.path}, isConfigured=${result.isConfigured}, isAutoDetected=${result.isAutoDetected}`);
	return result.path;
}

// Active sessions
const sessions = new Map<string, ClaudeSession>();

/**
 * Create a new Claude Code CLI session
 * Unlike the PTY approach, this doesn't spawn a process immediately.
 * The process is spawned when sending a message.
 */
export function createClaudeSession(options: ClaudeSessionOptions): ClaudeSession | null {
	logDebug('createClaudeSession called');
	const { projectPath, agentPrompt, model = 'opus', mode = 'agent', onData, onError } = options;
	logDebug(`createClaudeSession options: projectPath=${projectPath}, model=${model}, mode=${mode}`);
	const sessionId = randomUUID();

	const claudePath = getClaudePath();
	logDebug(`createClaudeSession claudePath=${claudePath}`);

	// Check if Claude CLI is configured
	if (!claudePath) {
		logDebug('createClaudeSession: Claude CLI not found, returning null');
		console.error('[claude-cli] Claude CLI not found - user needs to configure path');
		onError(new Error('CLAUDE_NOT_CONFIGURED'));
		return null;
	}

	const session: ClaudeSession = {
		id: sessionId,
		projectPath,
		agentPrompt,
		model,
		mode,
		isFirstMessage: true,
		isStreaming: false,
		currentProcess: null,
		onDataCallback: onData
	};

	sessions.set(sessionId, session);
	console.log('[Claude] Session created:', sessionId, 'model:', model, 'mode:', mode);

	return session;
}

/**
 * Parse a single line of NDJSON from Claude's stream-json output
 *
 * Key message types from --verbose --output-format stream-json:
 * - system/hook_response: Hook output (skip)
 * - system/init: Initialization info (skip)
 * - assistant: The response with message.content[].text
 * - result: Final result with success/error status
 */
function parseStreamJsonLine(line: string): ClaudeOutputChunk | null {
	if (!line.trim()) return null;

	try {
		const data = JSON.parse(line);

		// Handle different message types from stream-json format
		if (data.type === 'assistant') {
			// Assistant message with content blocks
			// Structure: { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
			if (data.message?.content && Array.isArray(data.message.content)) {
				const textBlocks: string[] = [];
				const toolCalls: ClaudeOutputChunk[] = [];

				for (const block of data.message.content) {
					if (block.type === 'text' && block.text) {
						textBlocks.push(block.text);
					} else if (block.type === 'tool_use') {
						toolCalls.push({
							type: 'tool_use',
							toolName: block.name,
							toolInput: block.input
						});
					}
				}

				// Return text content if found
				if (textBlocks.length > 0) {
					return { type: 'text', content: textBlocks.join('\n') };
				}

				// Return first tool call if no text
				if (toolCalls.length > 0) {
					return toolCalls[0];
				}
			}
		} else if (data.type === 'content_block_delta') {
			// Streaming text delta (real-time updates)
			if (data.delta?.type === 'text_delta' && data.delta.text) {
				return { type: 'text', content: data.delta.text };
			}
		} else if (data.type === 'content_block_start') {
			// Start of a content block
			if (data.content_block?.type === 'tool_use') {
				return {
					type: 'tool_use',
					toolName: data.content_block.name,
					toolInput: {}
				};
			}
		} else if (data.type === 'result') {
			// Final result from CLI
			// Structure: { type: "result", subtype: "success", result: "...", duration_ms: ..., usage: {...} }
			if (data.is_error) {
				return {
					type: 'error',
					content: data.result || 'Unknown error'
				};
			}
			// Success - include usage stats
			const usage = data.usage || {};
			const inputTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
			const outputTokens = usage.output_tokens || 0;
			return {
				type: 'done',
				inputTokens,
				outputTokens,
				totalTokens: inputTokens + outputTokens,
				costUsd: data.total_cost_usd,
				durationMs: data.duration_ms
			};
		} else if (data.type === 'user') {
			// Tool result being passed back
			if (data.message?.content && Array.isArray(data.message.content)) {
				for (const block of data.message.content) {
					if (block.type === 'tool_result') {
						return {
							type: 'tool_result',
							toolResult: block.content
						};
					}
				}
			}
		} else if (data.type === 'error') {
			return {
				type: 'error',
				content: data.error?.message || JSON.stringify(data.error) || 'Unknown error'
			};
		} else if (data.type === 'system') {
			// System messages - skip most of them (init, hooks, etc)
			// Could extract useful info later if needed
			console.log('[Claude] System message:', data.subtype);
			return null;
		} else if (data.type === 'message_start' || data.type === 'message_delta' || data.type === 'message_stop') {
			// Message lifecycle events - skip
			return null;
		}

		// Log unknown types for debugging
		console.log('[Claude] Unhandled type:', data.type);
		return null;

	} catch (err) {
		// Not valid JSON - might be partial line or other output
		console.warn('[Claude] Failed to parse JSON:', line.substring(0, 100));
		return null;
	}
}

/**
 * Send a message to the Claude session using print mode
 * Spawns a new process for each message with -p flag
 */
export function sendMessage(
	session: ClaudeSession,
	message: string,
	onData?: (chunk: ClaudeOutputChunk) => void,
	onError?: (error: Error) => void,
	onClose?: (code: number) => void
): void {
	const claudePath = getClaudePath();
	if (!claudePath) {
		onError?.(new Error('Claude CLI not configured'));
		return;
	}

	// Build the prompt with agent context if this is the first message
	let fullPrompt = message;
	if (session.isFirstMessage) {
		// Generate project instructions based on user's skill level
		const skillLevel = getUserSkillLevel();

		// Get bd prime context for up-to-date Beads workflow info
		const bdPrimeContext = getBdPrimeContext(session.projectPath);
		if (bdPrimeContext) {
			logDebug('Got bd prime context');
		} else {
			logDebug('No bd prime context available (beads may not be initialized)');
		}

		const projectInstructions = generateProjectInstructions(skillLevel, bdPrimeContext);

		// Get session start prompt if configured
		let sessionStartPrompt = '';
		try {
			const startPromptContent = getStartPromptContent(session.projectPath);
			if (startPromptContent) {
				sessionStartPrompt = `
<session-start-instructions>
${startPromptContent}
</session-start-instructions>

`;
				logDebug('Session start prompt loaded');
			}
		} catch (err) {
			logDebug(`Error loading session start prompt: ${err}`);
		}

		// Get session context (known issues, previous session summary)
		let sessionContextSection = '';
		try {
			const contextContent = getSessionContextForInjection(session.projectPath);
			if (contextContent) {
				sessionContextSection = `
<session-context>
${contextContent}
</session-context>

`;
				logDebug('Session context loaded');
			}
		} catch (err) {
			logDebug(`Error loading session context: ${err}`);
		}

		if (session.agentPrompt) {
			fullPrompt = `${projectInstructions}
${sessionContextSection}${sessionStartPrompt}<agent-context>
You are operating as a specialized agent with the following profile:

${session.agentPrompt}

Please respond according to this agent's specialization and guidelines.
</agent-context>

${message}`;
		} else {
			fullPrompt = `${projectInstructions}
${sessionContextSection}${sessionStartPrompt}${message}`;
		}
	}

	// Build command arguments based on mode
	// - agent: Full access with --dangerously-skip-permissions
	// - plan: Read-only mode with --permission-mode plan
	// - ask: Quick questions with --permission-mode plan (no file access needed)
	const args = [
		'-p', fullPrompt,
		'--output-format', 'stream-json',
		'--verbose',
		'--model', session.model
	];

	// Add permission flags based on mode
	if (session.mode === 'agent') {
		// Agent mode: full access to read, write, and execute
		args.push('--dangerously-skip-permissions');
	} else {
		// Plan and Ask modes: read-only analysis
		args.push('--permission-mode', 'plan');
	}

	// Add -c flag for continuation if not first message
	if (!session.isFirstMessage) {
		args.push('-c');
	}

	console.log('[Claude] Spawning command:', claudePath);
	console.log('[Claude] Args:', args);
	console.log('[Claude] CWD:', session.projectPath);

	// Update session state
	session.isStreaming = true;
	session.isFirstMessage = false;
	session.onDataCallback = onData;

	// Build PATH with bundled Node.js first so it takes precedence
	const currentPath = globalThis.process.env.PATH || '';
	const augmentedPath = `${BUNDLED_NODE_DIR}:${currentPath}`;
	logDebug(`Augmented PATH: ${BUNDLED_NODE_DIR} prepended to system PATH`);

	// Get stored OAuth token for authentication
	const oauthToken = getStoredToken();
	if (oauthToken) {
		logDebug('OAuth token found, will use CLAUDE_CODE_OAUTH_TOKEN');
	}

	// Spawn the process
	const childProcess = spawn(claudePath, args, {
		cwd: session.projectPath,
		env: {
			...globalThis.process.env,
			// Add bundled Node.js to PATH so npx, npm, etc. are available
			PATH: augmentedPath,
			// Ensure we don't get any interactive prompts
			CI: 'true',
			// Use stored OAuth token if available
			...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {})
		},
		stdio: ['pipe', 'pipe', 'pipe']
	});

	session.currentProcess = childProcess;

	// Close stdin since we're passing prompt via -p flag
	childProcess.stdin?.end();

	console.log('[Claude] Process spawned, PID:', childProcess.pid);
	console.log('[Claude] stdout available:', !!childProcess.stdout);
	console.log('[Claude] stderr available:', !!childProcess.stderr);

	// Buffer for incomplete lines
	let buffer = '';

	// Handle stdout (stream-json output)
	if (!childProcess.stdout) {
		console.error('[Claude] No stdout stream available!');
	}
	childProcess.stdout?.on('data', (data: Buffer) => {
		const text = data.toString();
		console.log('[STDOUT RAW]:', text);

		// Check for auth expiration in stdout (Claude's Ink interface may output here)
		const lowerText = text.toLowerCase();
		if (lowerText.includes('invalid api key') ||
		    lowerText.includes('please run /login') ||
		    lowerText.includes('authentication') && lowerText.includes('expired') ||
		    lowerText.includes('unauthorized')) {
			console.log('[Claude] Auth expired detected in stdout, clearing credentials');
			logout().catch(() => {});
			onData?.({ type: 'auth_expired', content: 'Your Claude authentication has expired. Please log in again.' });
			return;
		}

		buffer += text;

		// Process complete lines
		const lines = buffer.split('\n');
		buffer = lines.pop() || ''; // Keep incomplete last line in buffer

		for (const line of lines) {
			if (!line.trim()) continue;

			// Log full line for debugging
			console.log('[NDJSON LINE]:', line);

			const chunk = parseStreamJsonLine(line);
			console.log('[PARSED CHUNK]:', chunk);

			if (chunk) {
				if (chunk.type === 'done') {
					session.isStreaming = false;
				}
				onData?.(chunk);
			}
		}
	});

	// Handle stderr (errors and possibly some status output)
	childProcess.stderr?.on('data', (data: Buffer) => {
		const text = data.toString();
		console.log('[STDERR RAW]:', text);

		// Check for auth expiration
		const lowerText = text.toLowerCase();
		if (lowerText.includes('invalid api key') ||
		    lowerText.includes('please run /login') ||
		    lowerText.includes('authentication') && lowerText.includes('expired') ||
		    lowerText.includes('unauthorized')) {
			console.log('[Claude] Auth expired detected, clearing credentials');
			// Clear the expired token
			logout().catch(() => {});
			// Notify the UI about auth expiration
			onData?.({ type: 'auth_expired', content: 'Your Claude authentication has expired. Please log in again.' });
			return;
		}

		// Don't treat all stderr as errors - Claude CLI may output status info
		// Only send as error if it looks like an actual error
		if (lowerText.includes('error') || lowerText.includes('failed')) {
			onData?.({ type: 'error', content: text.trim() });
		}
	});

	// Handle process exit
	childProcess.on('close', (code) => {
		console.log('[Claude] Process exited with code:', code);
		console.log('[Claude] Remaining buffer:', buffer);

		session.isStreaming = false;
		session.currentProcess = null;

		// Process any remaining buffer
		if (buffer.trim()) {
			console.log('[Claude] Processing remaining buffer');
			const chunk = parseStreamJsonLine(buffer);
			console.log('[Claude] Remaining buffer parsed:', chunk);
			if (chunk) {
				onData?.(chunk);
			}
		}

		// Send done if we haven't already
		onData?.({ type: 'done' });
		onClose?.(code || 0);
	});

	// Handle spawn errors
	childProcess.on('error', (err) => {
		console.error('[Claude] Process error:', err);
		session.isStreaming = false;
		session.currentProcess = null;
		onError?.(err);
	});
}

/**
 * Cancel the current streaming response
 */
export function cancelResponse(session: ClaudeSession): void {
	if (session.currentProcess && session.isStreaming) {
		console.log('[Claude] Canceling response');
		session.currentProcess.kill('SIGINT');
		session.isStreaming = false;
	}
}

/**
 * Close a Claude session
 */
export function closeSession(session: ClaudeSession): void {
	if (session.currentProcess) {
		session.currentProcess.kill();
		session.currentProcess = null;
	}
	sessions.delete(session.id);
	console.log('[Claude] Session closed:', session.id);
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): ClaudeSession | undefined {
	return sessions.get(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllSessions(): ClaudeSession[] {
	return Array.from(sessions.values());
}

/**
 * Cleanup old sessions
 */
export function cleanupSessions(): void {
	// For now, just a placeholder - could add timeout logic later
}
