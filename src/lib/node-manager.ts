/**
 * Node.js Manager
 * Handles downloading and installing Node.js for use by Claude Code
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import https from 'https';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';

// Node.js version to install - must match version used to compile native modules
const NODE_VERSION = '22.12.0';

// Installation directory
const MANAGED_DIR = path.join(os.homedir(), '.beads-dashboard');
const NODE_DIR = path.join(MANAGED_DIR, 'node');
const NODE_BIN_DIR = path.join(NODE_DIR, 'bin');

// Settings file
const SETTINGS_FILE = path.join(MANAGED_DIR, 'settings.json');

export interface NodeStatus {
	installed: boolean;
	version: string | null;
	nodePath: string | null;
	npmPath: string | null;
	npxPath: string | null;
}

interface NodeSettings {
	installedVersion?: string;
	installPath?: string;
	installedAt?: string;
}

/**
 * Get the platform identifier for Node.js downloads
 */
function getPlatformIdentifier(): { platform: string; arch: string } | null {
	const platform = os.platform();
	const arch = os.arch();

	if (platform === 'darwin') {
		return {
			platform: 'darwin',
			arch: arch === 'arm64' ? 'arm64' : 'x64'
		};
	} else if (platform === 'linux') {
		return {
			platform: 'linux',
			arch: arch === 'arm64' ? 'arm64' : 'x64'
		};
	}

	// Windows would need different handling (.zip instead of .tar.gz)
	return null;
}

/**
 * Load Node settings from disk
 */
function loadNodeSettings(): NodeSettings {
	try {
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			const settings = JSON.parse(content);
			return settings.node || {};
		}
	} catch (err) {
		console.warn('[node-manager] Could not load settings:', err);
	}
	return {};
}

/**
 * Save Node settings to disk
 */
function saveNodeSettings(nodeSettings: NodeSettings): void {
	try {
		if (!fs.existsSync(MANAGED_DIR)) {
			fs.mkdirSync(MANAGED_DIR, { recursive: true });
		}

		let settings: Record<string, unknown> = {};
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			settings = JSON.parse(content);
		}

		settings.node = nodeSettings;
		settings.lastUpdated = new Date().toISOString();

		fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
		console.log('[node-manager] Saved settings');
	} catch (err) {
		console.error('[node-manager] Could not save settings:', err);
	}
}

/**
 * Get the path to node binary
 */
export function getNodePath(): string {
	return path.join(NODE_BIN_DIR, 'node');
}

/**
 * Get the path to npm binary
 */
export function getNpmPath(): string {
	return path.join(NODE_BIN_DIR, 'npm');
}

/**
 * Get the path to npx binary
 */
export function getNpxPath(): string {
	return path.join(NODE_BIN_DIR, 'npx');
}

/**
 * Get the bin directory (for adding to PATH)
 */
export function getNodeBinDir(): string {
	return NODE_BIN_DIR;
}

/**
 * Check if Node.js is installed in our managed location
 */
export function isInstalled(): boolean {
	try {
		const nodePath = getNodePath();
		fs.accessSync(nodePath, fs.constants.X_OK);
		// Also check npm exists
		const npmPath = getNpmPath();
		fs.accessSync(npmPath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the installed version of Node.js
 */
export function getInstalledVersion(): string | null {
	if (!isInstalled()) {
		return null;
	}

	try {
		const nodePath = getNodePath();
		const result = execSync(`"${nodePath}" --version`, {
			encoding: 'utf-8',
			timeout: 10000,
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();

		// Remove 'v' prefix if present
		return result.startsWith('v') ? result.slice(1) : result;
	} catch (err) {
		console.error('[node-manager] Error getting installed version:', err);
		return null;
	}
}

/**
 * Download Node.js tarball
 */
async function downloadNode(
	version: string,
	onProgress?: (percent: number) => void
): Promise<string> {
	const platformInfo = getPlatformIdentifier();
	if (!platformInfo) {
		throw new Error('Unsupported platform');
	}

	const filename = `node-v${version}-${platformInfo.platform}-${platformInfo.arch}.tar.gz`;
	const url = `https://nodejs.org/dist/v${version}/${filename}`;
	console.log('[node-manager] Downloading from:', url);

	const tempPath = path.join(os.tmpdir(), `node-${version}-${Date.now()}.tar.gz`);

	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(tempPath);

		const request = https.get(url, (response) => {
			if (response.statusCode === 302 || response.statusCode === 301) {
				const redirectUrl = response.headers.location;
				if (redirectUrl) {
					file.close();
					try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
					downloadFromUrl(redirectUrl, tempPath, onProgress)
						.then(resolve)
						.catch(reject);
					return;
				}
			}

			if (response.statusCode !== 200) {
				file.close();
				try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
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
				console.log('[node-manager] Download complete:', tempPath);
				resolve(tempPath);
			});
		});

		request.on('error', (err) => {
			file.close();
			try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
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
 * Extract and install Node.js from tarball
 */
async function installFromTarball(tarballPath: string, version: string): Promise<void> {
	const platformInfo = getPlatformIdentifier();
	if (!platformInfo) {
		throw new Error('Unsupported platform');
	}

	// Remove existing installation
	if (fs.existsSync(NODE_DIR)) {
		fs.rmSync(NODE_DIR, { recursive: true, force: true });
	}

	// Create parent directory
	if (!fs.existsSync(MANAGED_DIR)) {
		fs.mkdirSync(MANAGED_DIR, { recursive: true });
	}

	// Extract tarball
	// The tarball contains a directory like node-v20.11.1-darwin-arm64/
	// We want to extract it and rename to just 'node'
	const extractDir = path.join(MANAGED_DIR, 'node-extract-temp');

	if (fs.existsSync(extractDir)) {
		fs.rmSync(extractDir, { recursive: true, force: true });
	}
	fs.mkdirSync(extractDir, { recursive: true });

	console.log('[node-manager] Extracting to:', extractDir);

	// Use tar to extract
	await extract({
		file: tarballPath,
		cwd: extractDir,
		gzip: true
	});

	// Find the extracted directory
	const extractedName = `node-v${version}-${platformInfo.platform}-${platformInfo.arch}`;
	const extractedPath = path.join(extractDir, extractedName);

	if (!fs.existsSync(extractedPath)) {
		throw new Error(`Expected directory ${extractedName} not found after extraction`);
	}

	// Rename to final location
	fs.renameSync(extractedPath, NODE_DIR);

	// Cleanup
	fs.rmSync(extractDir, { recursive: true, force: true });
	try { fs.unlinkSync(tarballPath); } catch { /* ignore */ }

	// Save settings
	saveNodeSettings({
		installedVersion: version,
		installPath: NODE_DIR,
		installedAt: new Date().toISOString()
	});

	console.log('[node-manager] Installed Node.js', version, 'to', NODE_DIR);
}

/**
 * Install Node.js
 */
export async function install(
	onProgress?: (percent: number, stage: string) => void
): Promise<{ version: string; path: string }> {
	const version = NODE_VERSION;

	onProgress?.(0, 'Downloading Node.js...');
	const tarballPath = await downloadNode(version, (percent) => {
		onProgress?.(percent * 0.8, 'Downloading Node.js...');
	});

	onProgress?.(80, 'Installing Node.js...');
	await installFromTarball(tarballPath, version);

	onProgress?.(100, 'Complete');

	return {
		version,
		path: NODE_DIR
	};
}

/**
 * Get status of Node.js installation
 */
export function getStatus(): NodeStatus {
	const installed = isInstalled();
	const settings = loadNodeSettings();

	let version: string | null = null;
	if (installed) {
		version = settings.installedVersion || getInstalledVersion();
	}

	return {
		installed,
		version,
		nodePath: installed ? getNodePath() : null,
		npmPath: installed ? getNpmPath() : null,
		npxPath: installed ? getNpxPath() : null
	};
}

/**
 * Ensure Node.js is installed, installing if necessary
 */
export async function ensureInstalled(
	onProgress?: (percent: number, stage: string) => void
): Promise<NodeStatus> {
	if (isInstalled()) {
		return getStatus();
	}

	await install(onProgress);
	return getStatus();
}
