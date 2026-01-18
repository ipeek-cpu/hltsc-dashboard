import { spawn, execSync, type ChildProcess } from 'child_process';
import type { DevServerConfig } from './dashboard-db';
import { EventEmitter } from 'events';
import net from 'net';

export interface PortConflictInfo {
	port: number;
	pid?: number;
	processName?: string;
	command?: string;
}

export interface ServerStatus {
	running: boolean;
	pid?: number;
	port?: number;
	startedAt?: string;
	ready: boolean;
	previewUrl?: string;  // For Shopify themes
	error?: string;
}

interface RunningServer {
	process: ChildProcess;
	projectId: string;
	config: DevServerConfig;
	startedAt: string;
	ready: boolean;
	previewUrl?: string;
	outputBuffer: string[];
	emitter: EventEmitter;
}

// Map of projectId -> running server
const runningServers = new Map<string, RunningServer>();

// Framework-specific ready detection patterns
const READY_PATTERNS: Record<string, RegExp[]> = {
	nextjs: [
		/✓\s*Ready in/i,
		/Ready in \d/i,
		/started server/i,
		/Local:\s*http/i,
		/localhost:\d+/i,
		/▲\s*Next\.js/i  // Next.js startup banner often precedes ready
	],
	sveltekit: [/Local:\s*http/i, /VITE.*ready/i, /ready in/i, /localhost:\d+/i],
	vite: [/Local:\s*http/i, /VITE.*ready/i, /ready in/i, /localhost:\d+/i],
	remix: [/Local:\s*http/i, /Built in/i, /App server started/i, /localhost:\d+/i],
	astro: [/Local\s*http/i, /watching for file changes/i, /localhost:\d+/i],
	expo: [/Bundler is ready/i, /Metro waiting/i, /Development server/i],
	shopify: [/Preview your theme/i, /https:\/\/.*\.myshopify\.com/i],
	nuxt: [/Local:\s*http/i, /Nitro.*ready/i, /ready in/i, /localhost:\d+/i],
	gatsby: [/You can now view/i, /success.*Building development bundle/i, /localhost:\d+/i],
	cra: [/Compiled successfully/i, /You can now view/i, /localhost:\d+/i],
	angular: [/Angular Live Development Server/i, /Compiled successfully/i, /localhost:\d+/i],
	vue: [/App running at/i, /Local:\s*http/i, /VITE.*ready/i, /localhost:\d+/i],
	other: []  // Will rely on generic patterns
};

// Generic patterns that work for most dev servers
// These are checked AFTER framework-specific patterns
const GENERIC_READY_PATTERNS: RegExp[] = [
	/Local:\s*https?:\/\/localhost:\d+/i,
	/Local:\s*https?:\/\/127\.0\.0\.1:\d+/i,
	/listening on port \d+/i,
	/server started on/i,
	/compiled successfully/i,
	/development server.*running/i,
	/watching for (file )?changes/i,
	/webpack.*compiled/i,
	/build completed/i
];

// Patterns that indicate an error (should NOT trigger ready)
const ERROR_PATTERNS: RegExp[] = [
	/EADDRINUSE/i,
	/address already in use/i,
	/error:/i,
	/failed to/i,
	/cannot find/i,
	/module not found/i,
	/syntax error/i
];

// Shopify preview URL pattern
const SHOPIFY_PREVIEW_PATTERN = /https:\/\/[a-zA-Z0-9-]+\.myshopify\.com[^\s]*/;

/**
 * Check if a port is available on both IPv4 and IPv6
 */
export async function isPortAvailable(port: number): Promise<boolean> {
	// Check IPv4
	const ipv4Available = await new Promise<boolean>((resolve) => {
		const server = net.createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close();
			resolve(true);
		});
		server.listen(port, '127.0.0.1');
	});

	if (!ipv4Available) return false;

	// Check IPv6 / all interfaces (this is what Node.js/Next.js typically uses)
	const ipv6Available = await new Promise<boolean>((resolve) => {
		const server = net.createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close();
			resolve(true);
		});
		// Listen without host to bind to all interfaces (including ::)
		server.listen(port);
	});

	return ipv6Available;
}

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const port = startPort + i;
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	return null;
}

/**
 * Get information about what's using a port
 */
export function getPortConflictInfo(port: number): PortConflictInfo {
	const info: PortConflictInfo = { port };

	try {
		// Use lsof on macOS/Linux to find the process
		const result = execSync(`lsof -i :${port} -t 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
		console.log(`[dev-server-manager] lsof result for port ${port}:`, result);
		if (result) {
			const pids = result.split('\n').filter(Boolean);
			if (pids.length > 0) {
				info.pid = parseInt(pids[0], 10);
				console.log(`[dev-server-manager] Found PID ${info.pid} using port ${port}`);

				// Get process name
				try {
					const psResult = execSync(`ps -p ${info.pid} -o comm= 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
					if (psResult) {
						info.processName = psResult;
					}
				} catch {
					// Ignore
				}

				// Get full command
				try {
					const cmdResult = execSync(`ps -p ${info.pid} -o args= 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
					if (cmdResult) {
						info.command = cmdResult.slice(0, 100); // Truncate long commands
					}
				} catch {
					// Ignore
				}
			}
		}
	} catch (error) {
		console.error('[dev-server-manager] Error getting port info:', error);
	}

	return info;
}

/**
 * Kill the process using a specific port
 */
export async function killProcessOnPort(port: number): Promise<{ success: boolean; error?: string }> {
	console.log(`[dev-server-manager] killProcessOnPort called for port ${port}`);

	try {
		const info = getPortConflictInfo(port);
		console.log(`[dev-server-manager] Port conflict info:`, info);

		if (!info.pid) {
			console.log(`[dev-server-manager] No PID found, port may already be free`);
			return { success: true }; // Nothing to kill
		}

		console.log(`[dev-server-manager] Attempting to kill PID ${info.pid} with SIGTERM`);

		// Try graceful kill first
		try {
			process.kill(info.pid, 'SIGTERM');
			console.log(`[dev-server-manager] SIGTERM sent to PID ${info.pid}`);
		} catch (err) {
			console.log(`[dev-server-manager] SIGTERM failed:`, err);
			// Process might already be dead
		}

		// Wait a bit for graceful shutdown
		await new Promise(resolve => setTimeout(resolve, 1500));

		// Check if still running
		const stillRunning = !(await isPortAvailable(port));
		console.log(`[dev-server-manager] After SIGTERM, port still in use: ${stillRunning}`);

		if (stillRunning) {
			// Force kill
			console.log(`[dev-server-manager] Sending SIGKILL to PID ${info.pid}`);
			try {
				process.kill(info.pid, 'SIGKILL');
			} catch (err) {
				console.log(`[dev-server-manager] SIGKILL failed:`, err);
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		// Verify port is free
		const portFree = await isPortAvailable(port);
		console.log(`[dev-server-manager] Final check - port ${port} is free: ${portFree}`);

		if (!portFree) {
			// Try using shell kill as a fallback
			console.log(`[dev-server-manager] Trying shell kill as fallback`);
			try {
				execSync(`kill -9 ${info.pid} 2>/dev/null || true`, { encoding: 'utf-8' });
				await new Promise(resolve => setTimeout(resolve, 500));

				const finalCheck = await isPortAvailable(port);
				if (finalCheck) {
					console.log(`[dev-server-manager] Shell kill succeeded`);
					return { success: true };
				}
			} catch {
				// Ignore
			}

			return { success: false, error: 'Failed to free port after killing process' };
		}

		return { success: true };
	} catch (error) {
		console.error(`[dev-server-manager] Error killing process:`, error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to kill process'
		};
	}
}

export interface StartServerResult {
	success: boolean;
	error?: string;
	port?: number;
	portConflict?: PortConflictInfo;
}

/**
 * Start a dev server for a project
 */
export async function startDevServer(
	projectId: string,
	projectPath: string,
	config: DevServerConfig,
	options?: { overridePort?: number }
): Promise<StartServerResult> {
	// Check if already running
	const existing = runningServers.get(projectId);
	if (existing && existing.process && !existing.process.killed) {
		return { success: true, port: config.defaultPort };
	}

	// Use override port if provided
	const targetPort = options?.overridePort ?? config.defaultPort;
	if (options?.overridePort) {
		config = {
			...config,
			defaultPort: targetPort,
			devCommand: appendPortToCommand(config.devCommand, targetPort)
		};
	}

	// Check if port is available
	const portAvailable = await isPortAvailable(targetPort);
	if (!portAvailable) {
		// Return port conflict info so the UI can ask the user what to do
		const conflictInfo = getPortConflictInfo(targetPort);
		return {
			success: false,
			error: `Port ${targetPort} is already in use`,
			portConflict: conflictInfo
		};
	}

	try {
		// Parse command and args
		const [cmd, ...args] = parseCommand(config.devCommand);

		const childProcess = spawn(cmd, args, {
			cwd: projectPath,
			shell: true,
			env: {
				...process.env,
				PORT: String(config.defaultPort),
				NODE_ENV: 'development',
				FORCE_COLOR: '1'
			},
			stdio: ['pipe', 'pipe', 'pipe']
		});

		const emitter = new EventEmitter();
		emitter.setMaxListeners(50); // Prevent memory leak warnings
		const server: RunningServer = {
			process: childProcess,
			projectId,
			config,
			startedAt: new Date().toISOString(),
			ready: false,
			outputBuffer: [],
			emitter
		};

		runningServers.set(projectId, server);

		// Handle stdout
		childProcess.stdout?.on('data', (data: Buffer) => {
			const output = data.toString();
			handleOutput(server, output);
		});

		// Handle stderr
		childProcess.stderr?.on('data', (data: Buffer) => {
			const output = data.toString();
			handleOutput(server, output);
		});

		// Handle process exit
		childProcess.on('exit', (code) => {
			server.emitter.emit('exit', code);
			runningServers.delete(projectId);
		});

		childProcess.on('error', (error) => {
			server.emitter.emit('error', error.message);
			runningServers.delete(projectId);
		});

		// Start port polling as backup ready detection
		startPortPolling(projectId, config.defaultPort);

		return { success: true, port: config.defaultPort };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to start server'
		};
	}
}

function parseCommand(command: string): string[] {
	// Handle common command patterns
	const parts = command.split(/\s+/);
	return parts;
}

function appendPortToCommand(command: string, port: number): string {
	// Check if command already has a port flag
	if (/--port|(?:^|\s)-p\s/.test(command)) {
		return command.replace(/--port\s*=?\s*\d+/, `--port ${port}`)
			.replace(/(^|\s)-p\s+\d+/, `$1-p ${port}`);
	}
	// Append port flag (different frameworks use different flags)
	return `${command} --port ${port}`;
}

function handleOutput(server: RunningServer, output: string) {
	// Add to buffer (keep last 100 lines)
	server.outputBuffer.push(output);
	if (server.outputBuffer.length > 100) {
		server.outputBuffer.shift();
	}

	// Emit output event
	server.emitter.emit('output', output);

	// Check for error patterns first - don't mark as ready if there's an error
	const hasError = ERROR_PATTERNS.some(pattern => pattern.test(output));
	if (hasError) {
		console.log(`[dev-server-manager] Error detected in output: ${output.slice(0, 150)}`);
		// Don't emit error here - let the process exit handler deal with it
		return;
	}

	// Check for ready signal
	if (!server.ready) {
		// Normalize framework name for lookup (handle cases like "Next.js" -> "nextjs")
		const normalizedFramework = server.config.framework.toLowerCase().replace(/[^a-z0-9]/g, '');
		// First try framework-specific patterns
		const frameworkPatterns = READY_PATTERNS[normalizedFramework] || READY_PATTERNS[server.config.framework] || [];
		// Then try generic patterns as fallback
		const allPatterns = [...frameworkPatterns, ...GENERIC_READY_PATTERNS];

		for (const pattern of allPatterns) {
			if (pattern.test(output)) {
				console.log(`[dev-server-manager] Ready detected via pattern: ${pattern} in output: ${output.slice(0, 100)}`);
				server.ready = true;
				server.emitter.emit('ready');
				break;
			}
		}
	}

	// Check for Shopify preview URL
	if (server.config.framework === 'shopify' && !server.previewUrl) {
		const match = output.match(SHOPIFY_PREVIEW_PATTERN);
		if (match) {
			server.previewUrl = match[0];
			server.emitter.emit('preview-url', server.previewUrl);
		}
	}
}

/**
 * Poll the port to detect when the server is ready to accept connections
 * This serves as a backup to stdout pattern matching
 */
function startPortPolling(projectId: string, port: number) {
	const maxAttempts = 30; // Try for up to 30 seconds
	let attempts = 0;
	let stopped = false;

	const poll = () => {
		if (stopped) return;

		const server = runningServers.get(projectId);
		if (!server || server.ready || server.process.killed) {
			console.log(`[dev-server-manager] Stopping port poll - no server or already ready/killed`);
			stopped = true;
			return;
		}

		// Check if the process is actually still running
		if (server.process.exitCode !== null) {
			console.log(`[dev-server-manager] Stopping port poll - process exited with code ${server.process.exitCode}`);
			stopped = true;
			return;
		}

		attempts++;
		if (attempts > maxAttempts) {
			console.log(`[dev-server-manager] Port polling timeout for project ${projectId}`);
			stopped = true;
			return;
		}

		// Try to connect to the port
		const socket = new net.Socket();
		socket.setTimeout(1000);

		socket.on('connect', () => {
			socket.destroy();
			// Double-check server is still valid and process is running
			const currentServer = runningServers.get(projectId);
			if (currentServer && !currentServer.ready && currentServer.process.exitCode === null) {
				console.log(`[dev-server-manager] Ready detected via port polling on port ${port}`);
				currentServer.ready = true;
				currentServer.emitter.emit('ready');
			}
			stopped = true;
		});

		socket.on('error', () => {
			socket.destroy();
			if (stopped) return;
			// Try again after a delay
			setTimeout(poll, 1000);
		});

		socket.on('timeout', () => {
			socket.destroy();
			if (stopped) return;
			// Try again after a delay
			setTimeout(poll, 1000);
		});

		socket.connect(port, '127.0.0.1');
	};

	// Start polling after a short delay to let the process start
	setTimeout(poll, 3000);
}

/**
 * Stop a dev server
 */
export async function stopDevServer(projectId: string): Promise<{ success: boolean; error?: string }> {
	const server = runningServers.get(projectId);
	if (!server) {
		return { success: true }; // Already stopped
	}

	try {
		// Try graceful shutdown first
		server.process.kill('SIGTERM');

		// Wait for process to exit
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				// Force kill if not exited after 5 seconds
				if (!server.process.killed) {
					server.process.kill('SIGKILL');
				}
				resolve();
			}, 5000);

			server.process.once('exit', () => {
				clearTimeout(timeout);
				resolve();
			});
		});

		runningServers.delete(projectId);
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to stop server'
		};
	}
}

/**
 * Get the status of a dev server
 */
export function getServerStatus(projectId: string): ServerStatus {
	const server = runningServers.get(projectId);
	if (!server) {
		return { running: false, ready: false };
	}

	return {
		running: !server.process.killed,
		pid: server.process.pid,
		port: server.config.defaultPort,
		startedAt: server.startedAt,
		ready: server.ready,
		previewUrl: server.previewUrl
	};
}

/**
 * Get the event emitter for a server to subscribe to events
 */
export function getServerEmitter(projectId: string): EventEmitter | null {
	const server = runningServers.get(projectId);
	return server?.emitter || null;
}

/**
 * Get recent output from a server
 */
export function getServerOutput(projectId: string, lines = 50): string[] {
	const server = runningServers.get(projectId);
	if (!server) return [];
	return server.outputBuffer.slice(-lines);
}

/**
 * Get the preview URL for a project
 */
export function getPreviewUrl(projectId: string, config: DevServerConfig): string {
	const server = runningServers.get(projectId);

	// For Shopify, use the extracted preview URL
	if (config.framework === 'shopify' && server?.previewUrl) {
		return server.previewUrl;
	}

	// For other frameworks, use localhost
	return `http://localhost:${config.defaultPort}`;
}

/**
 * Stop all running dev servers (call on app exit)
 */
export async function stopAllServers(): Promise<void> {
	const promises = Array.from(runningServers.keys()).map(projectId => stopDevServer(projectId));
	await Promise.all(promises);
}

/**
 * Check if any server is running
 */
export function hasRunningServers(): boolean {
	return runningServers.size > 0;
}

// Cleanup on process exit
process.on('beforeExit', async () => {
	await stopAllServers();
});
