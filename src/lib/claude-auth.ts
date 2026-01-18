/**
 * Claude Code Authentication Manager
 * Handles checking auth status and triggering OAuth login flow
 *
 * Uses `claude setup-token` which opens the browser directly for OAuth.
 * Requires node-pty for TTY support (Claude CLI uses Ink which needs raw mode).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getManagedClaudePath, isInstalled } from './claude-code-manager';

// Lazy-load node-pty to avoid top-level import issues
let pty: typeof import('node-pty') | null = null;
let ptyLoadAttempted = false;

async function getPty(): Promise<typeof import('node-pty') | null> {
	if (ptyLoadAttempted) return pty;
	ptyLoadAttempted = true;

	try {
		pty = await import('node-pty');
		logToFile('node-pty loaded successfully');
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		logToFile(`node-pty load failed: ${errorMsg}`);
	}
	return pty;
}

// Token storage location
const TOKEN_FILE = path.join(os.homedir(), '.beads-dashboard', 'claude-token');

// Legacy keychain service name (for backwards compatibility check)
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export interface AuthStatus {
	authenticated: boolean;
	email?: string;
	accountType?: string;
	error?: string;
}

export interface LoginResult {
	success: boolean;
	error?: string;
}

/**
 * Get the stored OAuth token
 */
export function getStoredToken(): string | null {
	try {
		if (fs.existsSync(TOKEN_FILE)) {
			const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
			if (token && token.startsWith('sk-ant-')) {
				return token;
			}
		}
	} catch {
		// Ignore read errors
	}
	return null;
}

/**
 * Store the OAuth token
 */
function storeToken(token: string): void {
	try {
		const dir = path.dirname(TOKEN_FILE);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 }); // Secure permissions
		logToFile(`Token stored successfully at ${TOKEN_FILE}`);
	} catch (err) {
		logToFile(`Failed to store token: ${err}`);
	}
}

/**
 * Check if user is authenticated with Claude
 * Checks for stored OAuth token or legacy keychain credentials
 */
export function isAuthenticated(): boolean {
	// First check for our stored token
	if (getStoredToken()) {
		return true;
	}

	// Fall back to checking legacy keychain (for users who authenticated before)
	if (process.platform === 'darwin') {
		try {
			execSync(`security find-generic-password -s "${KEYCHAIN_SERVICE}" -w`, {
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe']
			});
			return true;
		} catch {
			// No keychain entry
		}
	}

	return false;
}

/**
 * Get detailed authentication status
 */
export async function getAuthStatus(): Promise<AuthStatus> {
	// First check if Claude is installed
	if (!isInstalled()) {
		return {
			authenticated: false
		};
	}

	return {
		authenticated: isAuthenticated()
	};
}

// Track active login process
let activeLoginProcess: import('node-pty').IPty | null = null;

// Log file for debugging in production
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'claude-auth.log');

function logToFile(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

/**
 * Trigger the Claude login flow using `claude setup-token`
 * Uses PTY because Claude CLI (Ink) requires raw mode TTY support.
 * Opens browser directly for OAuth - no prompt answering needed.
 */
export async function triggerLogin(): Promise<LoginResult> {
	if (!isInstalled()) {
		return {
			success: false,
			error: 'Claude Code is not installed'
		};
	}

	const claudePath = getManagedClaudePath();
	logToFile(`Starting login with setup-token, claudePath: ${claudePath}`);
	console.log('[claude-auth] Starting login with setup-token...');

	// Kill any existing login process
	if (activeLoginProcess) {
		try {
			activeLoginProcess.kill();
		} catch {
			// Ignore
		}
		activeLoginProcess = null;
	}

	// Load node-pty (required for Claude CLI's Ink interface)
	const ptyModule = await getPty();
	if (!ptyModule) {
		logToFile('node-pty not available');
		return {
			success: false,
			error: 'PTY support not available for login'
		};
	}

	return new Promise((resolve) => {
		try {
			// Run `claude setup-token` with PTY - opens browser directly for OAuth
			const ptyProcess = ptyModule.spawn(claudePath, ['setup-token'], {
				name: 'xterm-256color',
				cols: 80,
				rows: 24,
				cwd: os.homedir(),
				env: {
					...process.env,
					TERM: 'xterm-256color',
					GIT_TERMINAL_PROMPT: '0',
					GIT_ASKPASS: '',
				}
			});

			logToFile(`PTY process spawned, pid: ${ptyProcess.pid}`);
			console.log('[claude-auth] PTY process spawned, pid:', ptyProcess.pid);

			activeLoginProcess = ptyProcess;
			let output = '';
			let resolved = false;

			ptyProcess.onData((data) => {
				output += data;
				const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
				if (cleanData) {
					logToFile(`PTY output: ${cleanData}`);
					console.log('[claude-auth] PTY output:', cleanData);
				}

				// Look for the token in the output
				const tokenMatch = output.match(/sk-ant-[a-zA-Z0-9_-]+/);
				if (tokenMatch) {
					const token = tokenMatch[0];
					logToFile(`Token captured: ${token.substring(0, 20)}...`);
					storeToken(token);
				}
			});

			ptyProcess.onExit(({ exitCode }) => {
				logToFile(`PTY exited with code: ${exitCode}`);
				console.log('[claude-auth] PTY exited with code:', exitCode);
				activeLoginProcess = null;

				if (resolved) return;
				resolved = true;

				// Check if we got a token
				if (isAuthenticated()) {
					resolve({ success: true });
				} else if (exitCode === 0) {
					resolve({
						success: false,
						error: 'Login was not completed'
					});
				} else {
					resolve({
						success: false,
						error: `Login failed (exit code ${exitCode})`
					});
				}
			});

			// Resolve with success after PTY starts to unblock the UI
			// The actual authentication happens in the browser
			setTimeout(() => {
				if (!resolved) {
					logToFile('Login process started, browser should be opening for OAuth');
					resolved = true;
					resolve({ success: true });
				}
			}, 2000);

		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logToFile(`PTY spawn failed: ${errorMsg}`);
			console.error('[claude-auth] PTY spawn failed:', err);
			resolve({
				success: false,
				error: `Failed to start login: ${errorMsg}`
			});
		}
	});
}

/**
 * Cancel any active login process
 */
export function cancelLogin(): void {
	if (activeLoginProcess) {
		console.log('[claude-auth] Cancelling login process');
		try {
			activeLoginProcess.kill();
		} catch {
			// Ignore
		}
		activeLoginProcess = null;
	}
}

/**
 * Trigger logout (clear credentials)
 */
export async function logout(): Promise<{ success: boolean; error?: string }> {
	// Remove stored token file
	try {
		if (fs.existsSync(TOKEN_FILE)) {
			fs.unlinkSync(TOKEN_FILE);
			logToFile('Token file removed');
		}
	} catch (err) {
		logToFile(`Failed to remove token file: ${err}`);
	}

	// Also run claude logout to clear any keychain entries
	if (isInstalled()) {
		const claudePath = getManagedClaudePath();
		try {
			execSync(`"${claudePath}" logout`, {
				encoding: 'utf-8',
				timeout: 10000,
				stdio: ['pipe', 'pipe', 'pipe']
			});
		} catch {
			// Ignore - may fail if not logged in via keychain
		}
	}

	return { success: true };
}

/**
 * Check if Claude config directory exists
 */
export function hasClaudeConfigDir(): boolean {
	return fs.existsSync(path.join(os.homedir(), '.claude'));
}
