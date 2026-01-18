/**
 * Application settings management
 * Stores user preferences in a JSON file
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Debug logging for production
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'settings.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

export type SkillLevel = 'non-coder' | 'junior' | 'senior' | 'principal';

export interface AppSettings {
	claudePath?: string;
	claudePathAutoDetected?: boolean;
	lastUpdated?: string;
	userSkillLevel?: SkillLevel;
}

// Settings file location - in user's home directory
const SETTINGS_DIR = path.join(os.homedir(), '.beads-dashboard');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

/**
 * Load settings from disk
 */
export function loadSettings(): AppSettings {
	try {
		if (fs.existsSync(SETTINGS_FILE)) {
			const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
			return JSON.parse(content);
		}
	} catch (err) {
		console.warn('[settings] Could not load settings:', err);
	}
	return {};
}

/**
 * Save settings to disk
 */
export function saveSettings(settings: AppSettings): void {
	try {
		// Ensure directory exists
		if (!fs.existsSync(SETTINGS_DIR)) {
			fs.mkdirSync(SETTINGS_DIR, { recursive: true });
		}

		settings.lastUpdated = new Date().toISOString();
		fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
		console.log('[settings] Saved settings to:', SETTINGS_FILE);
	} catch (err) {
		console.error('[settings] Could not save settings:', err);
	}
}

/**
 * Get the managed Claude Code path
 * This is where Beads Dashboard installs Claude Code
 */
function getManagedClaudePath(): string {
	logDebug('getManagedClaudePath called');
	// Check environment variable first (set by Tauri)
	const envPath = process.env.MANAGED_CLAUDE_PATH;
	logDebug(`MANAGED_CLAUDE_PATH env var: ${envPath || 'not set'}`);
	if (envPath) {
		logDebug(`Using env path: ${envPath}`);
		return envPath;
	}
	// Default managed location
	const defaultPath = path.join(os.homedir(), '.beads-dashboard', 'bin', 'claude');
	logDebug(`Using default path: ${defaultPath}`);
	return defaultPath;
}

/**
 * Get the Claude CLI path - only uses the app-managed installation
 * We never use system-installed Claude binaries to ensure consistent behavior
 */
export function autoDetectClaudePath(): string | null {
	// Only use the managed installation (Beads Dashboard's own installation)
	const managedPath = getManagedClaudePath();
	try {
		fs.accessSync(managedPath, fs.constants.X_OK);
		console.log('[settings] Found claude at managed path:', managedPath);
		return managedPath;
	} catch {
		console.log('[settings] Managed claude not installed at:', managedPath);
		return null;
	}
}

/**
 * Get the Claude CLI path - only returns the managed installation path
 * We never use system-installed Claude binaries
 */
export function getClaudePath(): { path: string | null; isConfigured: boolean; isAutoDetected: boolean } {
	logDebug('getClaudePath called');
	const managedPath = getManagedClaudePath();
	logDebug(`Checking managed path: ${managedPath}`);

	// Check if the managed binary exists
	try {
		logDebug(`Checking if file exists...`);
		const exists = fs.existsSync(managedPath);
		logDebug(`File exists: ${exists}`);

		logDebug(`Checking if executable...`);
		fs.accessSync(managedPath, fs.constants.X_OK);
		logDebug(`File is executable, returning path`);
		return { path: managedPath, isConfigured: false, isAutoDetected: true };
	} catch (err) {
		// Managed binary not installed
		logDebug(`Access check failed: ${err instanceof Error ? err.message : String(err)}`);
		return { path: null, isConfigured: false, isAutoDetected: false };
	}
}

/**
 * Verify that Claude CLI is available and working
 */
export function verifyClaudeCli(claudePath: string): { valid: boolean; version?: string; error?: string } {
	try {
		// Try to get version
		const result = execSync(`"${claudePath}" --version`, {
			encoding: 'utf-8',
			timeout: 10000,
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();

		return { valid: true, version: result };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : 'Unknown error'
		};
	}
}

/**
 * Get the user's skill level
 */
export function getUserSkillLevel(): SkillLevel | undefined {
	const settings = loadSettings();
	return settings.userSkillLevel;
}

/**
 * Set the user's skill level
 */
export function setUserSkillLevel(level: SkillLevel): void {
	const settings = loadSettings();
	settings.userSkillLevel = level;
	saveSettings(settings);
	logDebug(`Skill level set to: ${level}`);
}
