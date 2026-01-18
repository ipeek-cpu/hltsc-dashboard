/**
 * Beads CLI Manager
 * Handles downloading and installing Beads CLI
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import https from 'https';
import { extract } from 'tar';

// GitHub repository
const GITHUB_REPO = 'steveyegge/beads';

// Installation directory
const MANAGED_DIR = path.join(os.homedir(), '.beads-dashboard');
const BIN_DIR = path.join(MANAGED_DIR, 'bin');
const BEADS_PATH = path.join(BIN_DIR, 'bd');

// Settings file
const SETTINGS_FILE = path.join(MANAGED_DIR, 'settings.json');

// Cache for latest version (refreshed every hour)
let cachedLatestVersion: string | null = null;
let lastVersionCheck: number = 0;
const VERSION_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface BeadsStatus {
	installed: boolean;
	version: string | null;
	path: string | null;
	latestVersion: string | null;
}

interface BeadsSettings {
	installedVersion?: string;
	installPath?: string;
	installedAt?: string;
	lastUpdateCheck?: string;
}

/**
 * Get the platform identifier for Beads downloads
 */
function getPlatformIdentifier(): string | null {
	const platform = os.platform();
	const arch = os.arch();

	if (platform === 'darwin') {
		return arch === 'arm64' ? 'darwin_arm64' : 'darwin_amd64';
	} else if (platform === 'linux') {
		return arch === 'arm64' ? 'linux_arm64' : 'linux_amd64';
	} else if (platform === 'win32') {
		return arch === 'arm64' ? 'windows_arm64' : 'windows_amd64';
	}

	return null;
}

/**
 * Load Beads settings from disk
 */
function loadBeadsSettings(): BeadsSettings {
	try {
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			const settings = JSON.parse(content);
			return settings.beads || {};
		}
	} catch (err) {
		console.warn('[beads-manager] Could not load settings:', err);
	}
	return {};
}

/**
 * Save Beads settings to disk
 */
function saveBeadsSettings(beadsSettings: BeadsSettings): void {
	try {
		if (!fs.existsSync(MANAGED_DIR)) {
			fs.mkdirSync(MANAGED_DIR, { recursive: true });
		}

		let settings: Record<string, unknown> = {};
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			settings = JSON.parse(content);
		}

		settings.beads = beadsSettings;
		settings.lastUpdated = new Date().toISOString();

		fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
		console.log('[beads-manager] Saved settings');
	} catch (err) {
		console.error('[beads-manager] Could not save settings:', err);
	}
}

/**
 * Get the path to beads binary
 */
export function getBeadsPath(): string {
	return BEADS_PATH;
}

/**
 * Check if Beads is installed in our managed location
 */
export function isInstalled(): boolean {
	try {
		fs.accessSync(BEADS_PATH, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the installed version of Beads
 */
export function getInstalledVersion(): string | null {
	if (!isInstalled()) {
		return null;
	}

	try {
		const result = execSync(`"${BEADS_PATH}" --version`, {
			encoding: 'utf-8',
			timeout: 10000,
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();

		// Parse version from output (e.g., "beads version 0.47.1")
		const match = result.match(/(\d+\.\d+\.\d+)/);
		return match ? match[1] : result;
	} catch (err) {
		console.error('[beads-manager] Error getting installed version:', err);
		return null;
	}
}

/**
 * Fetch the latest version from GitHub (with caching)
 */
export async function getLatestVersion(forceRefresh = false): Promise<string | null> {
	// Return cached version if still valid
	const now = Date.now();
	if (!forceRefresh && cachedLatestVersion && (now - lastVersionCheck) < VERSION_CACHE_TTL) {
		return cachedLatestVersion;
	}

	return new Promise((resolve) => {
		const options = {
			hostname: 'api.github.com',
			path: `/repos/${GITHUB_REPO}/releases/latest`,
			headers: {
				'User-Agent': 'BeadsDashboard/1.0'
			}
		};

		https.get(options, (res) => {
			let data = '';
			res.on('data', (chunk) => data += chunk);
			res.on('end', () => {
				try {
					const release = JSON.parse(data);
					const version = release.tag_name?.replace(/^v/, '') || null;
					console.log('[beads-manager] Latest version:', version);
					// Update cache
					cachedLatestVersion = version;
					lastVersionCheck = now;
					resolve(version);
				} catch (err) {
					console.error('[beads-manager] Error parsing release:', err);
					resolve(cachedLatestVersion); // Return cached on error
				}
			});
		}).on('error', (err) => {
			console.error('[beads-manager] Error fetching latest version:', err);
			resolve(cachedLatestVersion); // Return cached on error
		});
	});
}

/**
 * Get the cached latest version (non-blocking)
 * Returns null if not yet fetched
 */
export function getCachedLatestVersion(): string | null {
	return cachedLatestVersion;
}

/**
 * Read the local beads version from a project's .beads/.local_version file
 */
export function getProjectBeadsVersion(projectPath: string): string | null {
	try {
		const versionFile = path.join(projectPath, '.beads', '.local_version');
		if (fs.existsSync(versionFile)) {
			const version = fs.readFileSync(versionFile, 'utf-8').trim();
			// Remove 'v' prefix if present
			return version.startsWith('v') ? version.slice(1) : version;
		}
	} catch (err) {
		console.warn('[beads-manager] Could not read project beads version:', err);
	}
	return null;
}

/**
 * Compare two version strings
 * Returns: positive if a > b, negative if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
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
 * Check if a project's beads version is outdated
 */
export function isProjectBeadsOutdated(projectPath: string, latestVersion: string | null): boolean {
	if (!latestVersion) return false;

	const projectVersion = getProjectBeadsVersion(projectPath);
	if (!projectVersion) return false; // Can't determine, assume not outdated

	return compareVersions(latestVersion, projectVersion) > 0;
}

/**
 * Get download URL for a specific version
 */
function getDownloadUrl(version: string): string | null {
	const platformId = getPlatformIdentifier();
	if (!platformId) {
		return null;
	}

	const isWindows = os.platform() === 'win32';
	const ext = isWindows ? 'zip' : 'tar.gz';
	const filename = `beads_${version}_${platformId}.${ext}`;

	return `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}`;
}

/**
 * Download Beads archive
 */
async function downloadBeads(
	version: string,
	onProgress?: (percent: number) => void
): Promise<string> {
	const url = getDownloadUrl(version);
	if (!url) {
		throw new Error('Unsupported platform');
	}

	console.log('[beads-manager] Downloading from:', url);

	const isWindows = os.platform() === 'win32';
	const ext = isWindows ? 'zip' : 'tar.gz';
	const tempPath = path.join(os.tmpdir(), `beads-${version}-${Date.now()}.${ext}`);

	return downloadFromUrl(url, tempPath, onProgress);
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
		const parsedUrl = new URL(url);
		const options = {
			hostname: parsedUrl.hostname,
			path: parsedUrl.pathname + parsedUrl.search,
			headers: {
				'User-Agent': 'BeadsDashboard/1.0'
			}
		};

		const file = fs.createWriteStream(destPath);

		const request = https.get(options, (response) => {
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
				console.log('[beads-manager] Download complete:', destPath);
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
 * Extract and install Beads from archive
 */
async function installFromArchive(archivePath: string, version: string): Promise<void> {
	// Ensure bin directory exists
	if (!fs.existsSync(BIN_DIR)) {
		fs.mkdirSync(BIN_DIR, { recursive: true });
	}

	// Extract tarball
	const extractDir = path.join(os.tmpdir(), `beads-extract-${Date.now()}`);
	fs.mkdirSync(extractDir, { recursive: true });

	console.log('[beads-manager] Extracting to:', extractDir);

	await extract({
		file: archivePath,
		cwd: extractDir,
		gzip: true
	});

	// Find the bd binary in extracted files
	const extractedBd = path.join(extractDir, 'bd');
	if (!fs.existsSync(extractedBd)) {
		// Try looking in a subdirectory
		const files = fs.readdirSync(extractDir);
		console.log('[beads-manager] Extracted files:', files);
		throw new Error('bd binary not found in archive');
	}

	// Copy to final location
	fs.copyFileSync(extractedBd, BEADS_PATH);
	fs.chmodSync(BEADS_PATH, 0o755);

	// Cleanup
	fs.rmSync(extractDir, { recursive: true, force: true });
	try { fs.unlinkSync(archivePath); } catch { /* ignore */ }

	// Save settings
	saveBeadsSettings({
		installedVersion: version,
		installPath: BEADS_PATH,
		installedAt: new Date().toISOString()
	});

	console.log('[beads-manager] Installed Beads', version, 'to', BEADS_PATH);
}

/**
 * Install Beads
 */
export async function install(
	onProgress?: (percent: number, stage: string) => void
): Promise<{ version: string; path: string }> {
	const version = await getLatestVersion();
	if (!version) {
		throw new Error('Could not determine latest version');
	}

	onProgress?.(0, 'Downloading Beads CLI...');
	const archivePath = await downloadBeads(version, (percent) => {
		onProgress?.(percent * 0.8, 'Downloading Beads CLI...');
	});

	onProgress?.(80, 'Installing Beads CLI...');
	await installFromArchive(archivePath, version);

	onProgress?.(100, 'Complete');

	return {
		version,
		path: BEADS_PATH
	};
}

/**
 * Get status of Beads installation
 */
export async function getStatus(options?: { checkLatest?: boolean }): Promise<BeadsStatus> {
	const installed = isInstalled();
	const settings = loadBeadsSettings();

	let version: string | null = null;
	if (installed) {
		version = settings.installedVersion || getInstalledVersion();
	}

	let latestVersion: string | null = null;
	if (options?.checkLatest) {
		latestVersion = await getLatestVersion();
	}

	return {
		installed,
		version,
		path: installed ? BEADS_PATH : null,
		latestVersion
	};
}

/**
 * Ensure Beads is installed, installing if necessary
 */
export async function ensureInstalled(
	onProgress?: (percent: number, stage: string) => void
): Promise<BeadsStatus> {
	if (isInstalled()) {
		return getStatus();
	}

	await install(onProgress);
	return getStatus();
}

/**
 * Update to latest version
 */
export async function updateToLatest(
	onProgress?: (percent: number, stage: string) => void
): Promise<{ version: string; path: string }> {
	return install(onProgress);
}
