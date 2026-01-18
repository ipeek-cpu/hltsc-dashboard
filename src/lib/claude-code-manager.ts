/**
 * Claude Code CLI Manager
 * Handles downloading, installing, and updating Claude Code CLI
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import https from 'https';

// Base URL for Claude Code releases
const GCS_BASE_URL = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases';

// Managed installation directory
const MANAGED_DIR = path.join(os.homedir(), '.beads-dashboard', 'bin');
const MANAGED_CLAUDE_PATH = path.join(MANAGED_DIR, 'claude');

// Settings file for version tracking
const SETTINGS_DIR = path.join(os.homedir(), '.beads-dashboard');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export interface ClaudeCodeStatus {
	installed: boolean;
	version: string | null;
	latestVersion: string | null;
	updateAvailable: boolean;
	installPath: string | null;
	lastUpdateCheck: string | null;
}

interface ClaudeCodeSettings {
	installedVersion?: string;
	installPath?: string;
	lastUpdateCheck?: string;
	autoUpdate?: boolean;
}

/**
 * Get the platform identifier for Claude Code downloads
 */
export function getPlatformIdentifier(): string | null {
	const platform = os.platform();
	const arch = os.arch();

	if (platform === 'darwin') {
		return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
	} else if (platform === 'linux') {
		// Check for musl vs glibc
		try {
			execSync('ldd --version 2>&1 | grep -i musl', { encoding: 'utf-8' });
			return arch === 'arm64' ? 'linux-arm64-musl' : 'linux-x64-musl';
		} catch {
			return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
		}
	}

	// Windows not supported via native binary
	return null;
}

/**
 * Load Claude Code settings from disk
 */
function loadClaudeSettings(): ClaudeCodeSettings {
	try {
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			const settings = JSON.parse(content);
			return settings.claudeCode || {};
		}
	} catch (err) {
		console.warn('[claude-code-manager] Could not load settings:', err);
	}
	return {};
}

/**
 * Save Claude Code settings to disk
 */
function saveClaudeSettings(claudeSettings: ClaudeCodeSettings): void {
	try {
		// Ensure directory exists
		if (!fs.existsSync(SETTINGS_DIR)) {
			fs.mkdirSync(SETTINGS_DIR, { recursive: true });
		}

		// Load existing settings
		let settings: Record<string, unknown> = {};
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			settings = JSON.parse(content);
		}

		// Update Claude Code section
		settings.claudeCode = claudeSettings;
		settings.lastUpdated = new Date().toISOString();

		fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
		console.log('[claude-code-manager] Saved settings');
	} catch (err) {
		console.error('[claude-code-manager] Could not save settings:', err);
	}
}

/**
 * Get the path to the managed Claude Code binary
 */
export function getManagedClaudePath(): string {
	return MANAGED_CLAUDE_PATH;
}

/**
 * Check if Claude Code is installed in our managed location
 */
export function isInstalled(): boolean {
	try {
		fs.accessSync(MANAGED_CLAUDE_PATH, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the installed version of Claude Code
 */
export function getInstalledVersion(): string | null {
	if (!isInstalled()) {
		return null;
	}

	try {
		const result = execSync(`"${MANAGED_CLAUDE_PATH}" --version`, {
			encoding: 'utf-8',
			timeout: 10000,
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();

		// Parse version from output (e.g., "claude-code 2.1.7" or just "2.1.7")
		const match = result.match(/(\d+\.\d+\.\d+)/);
		return match ? match[1] : result;
	} catch (err) {
		console.error('[claude-code-manager] Error getting installed version:', err);
		return null;
	}
}

/**
 * Fetch the latest version from GCS
 */
export async function getLatestVersion(): Promise<string | null> {
	return new Promise((resolve) => {
		const url = `${GCS_BASE_URL}/latest`;

		https.get(url, (res) => {
			if (res.statusCode === 302 || res.statusCode === 301) {
				// Follow redirect
				const redirectUrl = res.headers.location;
				if (redirectUrl) {
					https.get(redirectUrl, (redirectRes) => {
						let data = '';
						redirectRes.on('data', (chunk) => data += chunk);
						redirectRes.on('end', () => {
							const version = data.trim();
							console.log('[claude-code-manager] Latest version:', version);
							resolve(version);
						});
					}).on('error', (err) => {
						console.error('[claude-code-manager] Error fetching latest version:', err);
						resolve(null);
					});
				} else {
					resolve(null);
				}
			} else if (res.statusCode === 200) {
				let data = '';
				res.on('data', (chunk) => data += chunk);
				res.on('end', () => {
					const version = data.trim();
					console.log('[claude-code-manager] Latest version:', version);
					resolve(version);
				});
			} else {
				console.error('[claude-code-manager] Unexpected status:', res.statusCode);
				resolve(null);
			}
		}).on('error', (err) => {
			console.error('[claude-code-manager] Error fetching latest version:', err);
			resolve(null);
		});
	});
}

/**
 * Check if an update is available
 */
export async function isUpdateAvailable(): Promise<boolean> {
	const installed = getInstalledVersion();
	if (!installed) return false;

	const latest = await getLatestVersion();
	if (!latest) return false;

	// Simple version comparison (assumes semver-like format)
	return latest !== installed && compareVersions(latest, installed) > 0;
}

/**
 * Compare two version strings
 * Returns: positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
	const partsA = a.split('.').map(Number);
	const partsB = b.split('.').map(Number);

	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const numA = partsA[i] || 0;
		const numB = partsB[i] || 0;
		if (numA !== numB) {
			return numA - numB;
		}
	}
	return 0;
}

/**
 * Download Claude Code binary
 */
export async function downloadClaudeCode(
	version: string,
	onProgress?: (percent: number) => void
): Promise<string> {
	const platform = getPlatformIdentifier();
	if (!platform) {
		throw new Error('Unsupported platform');
	}

	const url = `${GCS_BASE_URL}/${version}/${platform}/claude`;
	console.log('[claude-code-manager] Downloading from:', url);

	// Create temp file for download
	const tempPath = path.join(os.tmpdir(), `claude-code-${version}-${Date.now()}`);

	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(tempPath);

		const request = https.get(url, (response) => {
			// Handle redirects
			if (response.statusCode === 302 || response.statusCode === 301) {
				const redirectUrl = response.headers.location;
				if (redirectUrl) {
					file.close();
					fs.unlinkSync(tempPath);
					// Recursively follow redirect
					downloadFromUrl(redirectUrl, tempPath, onProgress)
						.then(resolve)
						.catch(reject);
					return;
				}
			}

			if (response.statusCode !== 200) {
				file.close();
				fs.unlinkSync(tempPath);
				reject(new Error(`Download failed with status ${response.statusCode}`));
				return;
			}

			const totalSize = parseInt(response.headers['content-length'] || '0', 10);
			let downloadedSize = 0;

			response.on('data', (chunk) => {
				downloadedSize += chunk.length;
				if (totalSize > 0 && onProgress) {
					onProgress(Math.round((downloadedSize / totalSize) * 100));
				}
			});

			response.pipe(file);

			file.on('finish', () => {
				file.close();
				console.log('[claude-code-manager] Download complete:', tempPath);
				resolve(tempPath);
			});
		});

		request.on('error', (err) => {
			file.close();
			fs.unlinkSync(tempPath);
			reject(err);
		});
	});
}

/**
 * Helper to download from a URL (handles redirects)
 */
function downloadFromUrl(
	url: string,
	destPath: string,
	onProgress?: (percent: number) => void
): Promise<string> {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(destPath);

		const request = https.get(url, (response) => {
			if (response.statusCode === 302 || response.statusCode === 301) {
				const redirectUrl = response.headers.location;
				if (redirectUrl) {
					file.close();
					try { fs.unlinkSync(destPath); } catch { /* ignore */ }
					downloadFromUrl(redirectUrl, destPath, onProgress)
						.then(resolve)
						.catch(reject);
					return;
				}
			}

			if (response.statusCode !== 200) {
				file.close();
				try { fs.unlinkSync(destPath); } catch { /* ignore */ }
				reject(new Error(`Download failed with status ${response.statusCode}`));
				return;
			}

			const totalSize = parseInt(response.headers['content-length'] || '0', 10);
			let downloadedSize = 0;

			response.on('data', (chunk) => {
				downloadedSize += chunk.length;
				if (totalSize > 0 && onProgress) {
					onProgress(Math.round((downloadedSize / totalSize) * 100));
				}
			});

			response.pipe(file);

			file.on('finish', () => {
				file.close();
				resolve(destPath);
			});
		});

		request.on('error', (err) => {
			file.close();
			try { fs.unlinkSync(destPath); } catch { /* ignore */ }
			reject(err);
		});
	});
}

/**
 * Install Claude Code from a downloaded binary
 */
export async function installClaudeCode(binaryPath: string, version: string): Promise<void> {
	// Ensure managed directory exists
	if (!fs.existsSync(MANAGED_DIR)) {
		fs.mkdirSync(MANAGED_DIR, { recursive: true });
	}

	// Copy binary to managed location
	fs.copyFileSync(binaryPath, MANAGED_CLAUDE_PATH);

	// Make executable
	fs.chmodSync(MANAGED_CLAUDE_PATH, 0o755);

	// Clean up temp file
	try {
		fs.unlinkSync(binaryPath);
	} catch { /* ignore */ }

	// Save version to settings
	saveClaudeSettings({
		installedVersion: version,
		installPath: MANAGED_CLAUDE_PATH,
		lastUpdateCheck: new Date().toISOString()
	});

	console.log('[claude-code-manager] Installed Claude Code', version, 'to', MANAGED_CLAUDE_PATH);
}

/**
 * Download and install the latest version of Claude Code
 */
export async function installLatest(
	onProgress?: (percent: number) => void
): Promise<{ version: string; path: string }> {
	const version = await getLatestVersion();
	if (!version) {
		throw new Error('Could not determine latest version');
	}

	const binaryPath = await downloadClaudeCode(version, onProgress);
	await installClaudeCode(binaryPath, version);

	return {
		version,
		path: MANAGED_CLAUDE_PATH
	};
}

/**
 * Get full status of Claude Code installation (fast version, no network calls)
 */
export async function getStatus(options?: { checkLatest?: boolean }): Promise<ClaudeCodeStatus> {
	const installed = isInstalled();
	const settings = loadClaudeSettings();

	// Get installed version - use cached version from settings if available (faster)
	let installedVersion: string | null = null;
	if (installed) {
		// First try cached version, then fall back to CLI call
		installedVersion = settings.installedVersion || null;
		if (!installedVersion) {
			installedVersion = getInstalledVersion();
		}
	}

	let latestVersion: string | null = null;
	let updateAvailable = false;

	// Only check for updates if explicitly requested
	if (options?.checkLatest && installed) {
		const lastCheck = settings.lastUpdateCheck ? new Date(settings.lastUpdateCheck) : null;
		const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

		if (!lastCheck || lastCheck < hourAgo) {
			latestVersion = await getLatestVersion();
			if (latestVersion && installedVersion) {
				updateAvailable = compareVersions(latestVersion, installedVersion) > 0;
			}
			// Update last check time
			saveClaudeSettings({
				...settings,
				lastUpdateCheck: new Date().toISOString()
			});
		}
	}

	return {
		installed,
		version: installedVersion,
		latestVersion,
		updateAvailable,
		installPath: installed ? MANAGED_CLAUDE_PATH : null,
		lastUpdateCheck: settings.lastUpdateCheck || null
	};
}

/**
 * Force check for updates (ignores cache)
 */
export async function checkForUpdates(): Promise<{
	updateAvailable: boolean;
	currentVersion: string | null;
	latestVersion: string | null;
}> {
	const currentVersion = getInstalledVersion();
	const latestVersion = await getLatestVersion();

	let updateAvailable = false;
	if (currentVersion && latestVersion) {
		updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
	}

	// Update last check time
	const settings = loadClaudeSettings();
	saveClaudeSettings({
		...settings,
		lastUpdateCheck: new Date().toISOString()
	});

	return {
		updateAvailable,
		currentVersion,
		latestVersion
	};
}

/**
 * Update Claude Code to the latest version
 */
export async function updateToLatest(
	onProgress?: (percent: number) => void
): Promise<{ version: string; path: string }> {
	return installLatest(onProgress);
}
