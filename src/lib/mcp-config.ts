/**
 * MCP Server Configuration Management
 * Handles reading and writing MCP configs from multiple scopes:
 * - Global: ~/.claude.json
 * - Project: <project>/.mcp.json
 * - Per-agent: Stored in agent frontmatter
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { McpServerConfig, McpServersConfig, McpServerWithScope, McpConfigScope } from './types';

// Debug logging
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'mcp-config.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

// File paths
const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const PROJECT_MCP_FILENAME = '.mcp.json';

/**
 * Read the global Claude configuration file
 */
function readClaudeConfig(): Record<string, unknown> {
	try {
		if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
			const content = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
			return JSON.parse(content);
		}
	} catch (err) {
		logDebug(`Error reading ~/.claude.json: ${err}`);
	}
	return {};
}

/**
 * Write to the global Claude configuration file
 * Merges with existing content to preserve other settings
 */
function writeClaudeConfig(updates: Record<string, unknown>): void {
	try {
		const existing = readClaudeConfig();
		const merged = { ...existing, ...updates };
		fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(merged, null, 2));
		logDebug('Successfully wrote to ~/.claude.json');
	} catch (err) {
		logDebug(`Error writing ~/.claude.json: ${err}`);
		throw new Error(`Failed to write Claude config: ${err}`);
	}
}

/**
 * Read global MCP server configuration from ~/.claude.json
 */
export function readGlobalMcpConfig(): Record<string, McpServerConfig> {
	const config = readClaudeConfig();
	const mcpServers = config.mcpServers as Record<string, McpServerConfig> | undefined;
	return mcpServers || {};
}

/**
 * Add or update a global MCP server
 */
export function writeGlobalMcpServer(name: string, config: McpServerConfig): void {
	const existing = readGlobalMcpConfig();
	existing[name] = config;
	writeClaudeConfig({ mcpServers: existing });
	logDebug(`Added/updated global MCP server: ${name}`);
}

/**
 * Delete a global MCP server
 */
export function deleteGlobalMcpServer(name: string): boolean {
	const existing = readGlobalMcpConfig();
	if (name in existing) {
		delete existing[name];
		writeClaudeConfig({ mcpServers: existing });
		logDebug(`Deleted global MCP server: ${name}`);
		return true;
	}
	return false;
}

/**
 * Get the .mcp.json path for a project
 */
function getProjectMcpPath(projectPath: string): string {
	return path.join(projectPath, PROJECT_MCP_FILENAME);
}

/**
 * Read project MCP configuration from <project>/.mcp.json
 */
export function readProjectMcpConfig(projectPath: string): Record<string, McpServerConfig> {
	const mcpPath = getProjectMcpPath(projectPath);
	try {
		if (fs.existsSync(mcpPath)) {
			const content = fs.readFileSync(mcpPath, 'utf-8');
			const parsed = JSON.parse(content) as McpServersConfig;
			return parsed.mcpServers || {};
		}
	} catch (err) {
		logDebug(`Error reading ${mcpPath}: ${err}`);
	}
	return {};
}

/**
 * Write project MCP configuration to <project>/.mcp.json
 */
function writeProjectMcpConfig(projectPath: string, servers: Record<string, McpServerConfig>): void {
	const mcpPath = getProjectMcpPath(projectPath);
	try {
		const config: McpServersConfig = { mcpServers: servers };
		fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2));
		logDebug(`Wrote project MCP config to: ${mcpPath}`);
	} catch (err) {
		logDebug(`Error writing ${mcpPath}: ${err}`);
		throw new Error(`Failed to write project MCP config: ${err}`);
	}
}

/**
 * Add or update a project-level MCP server
 */
export function writeProjectMcpServer(projectPath: string, name: string, config: McpServerConfig): void {
	const existing = readProjectMcpConfig(projectPath);
	existing[name] = config;
	writeProjectMcpConfig(projectPath, existing);
	logDebug(`Added/updated project MCP server: ${name} in ${projectPath}`);
}

/**
 * Delete a project-level MCP server
 */
export function deleteProjectMcpServer(projectPath: string, name: string): boolean {
	const existing = readProjectMcpConfig(projectPath);
	if (name in existing) {
		delete existing[name];
		writeProjectMcpConfig(projectPath, existing);
		logDebug(`Deleted project MCP server: ${name} from ${projectPath}`);
		return true;
	}
	return false;
}

/**
 * Get all MCP servers merged from global and project scopes
 * Returns servers with their scope information
 */
export function getMergedMcpServers(projectPath?: string): McpServerWithScope[] {
	const result: McpServerWithScope[] = [];

	// Add global servers
	const globalServers = readGlobalMcpConfig();
	for (const [name, config] of Object.entries(globalServers)) {
		result.push({
			name,
			config,
			scope: 'global',
			source: CLAUDE_CONFIG_PATH
		});
	}

	// Add project servers (override global if same name)
	if (projectPath) {
		const projectServers = readProjectMcpConfig(projectPath);
		for (const [name, config] of Object.entries(projectServers)) {
			// Remove any global server with the same name
			const existingIndex = result.findIndex(s => s.name === name);
			if (existingIndex >= 0) {
				result.splice(existingIndex, 1);
			}
			result.push({
				name,
				config,
				scope: 'project',
				source: getProjectMcpPath(projectPath)
			});
		}
	}

	return result;
}

/**
 * Validate an MCP server configuration
 */
export function validateMcpConfig(config: McpServerConfig): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (config.type !== 'stdio') {
		errors.push(`Unsupported transport type: ${config.type}. Only "stdio" is supported.`);
	}

	if (!config.command || typeof config.command !== 'string') {
		errors.push('Command is required and must be a string.');
	}

	// Check for dangerous commands
	const dangerousCommands = ['rm', 'sudo', 'chmod', 'chown', 'dd', 'mkfs', 'fdisk'];
	const command = config.command?.toLowerCase() || '';
	for (const dangerous of dangerousCommands) {
		if (command === dangerous || command.startsWith(`${dangerous} `)) {
			errors.push(`Dangerous command detected: ${dangerous}`);
		}
	}

	if (config.args !== undefined && !Array.isArray(config.args)) {
		errors.push('Args must be an array if provided.');
	}

	if (config.env !== undefined && (typeof config.env !== 'object' || config.env === null)) {
		errors.push('Env must be an object if provided.');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Convert a registry package to local MCP server config
 */
export function convertRegistryPackageToConfig(
	pkg: { registryType: string; identifier: string; packageArguments?: string[] }
): McpServerConfig {
	if (pkg.registryType === 'npm') {
		return {
			type: 'stdio',
			command: 'npx',
			args: ['-y', pkg.identifier, ...(pkg.packageArguments || [])]
		};
	} else if (pkg.registryType === 'pip') {
		return {
			type: 'stdio',
			command: 'uvx',
			args: [pkg.identifier, ...(pkg.packageArguments || [])]
		};
	} else {
		// Default to trying npx for unknown types
		return {
			type: 'stdio',
			command: 'npx',
			args: ['-y', pkg.identifier, ...(pkg.packageArguments || [])]
		};
	}
}

/**
 * Mask sensitive environment variable values for display
 */
export function maskEnvValue(key: string, value: string): string {
	const sensitivePatterns = ['key', 'secret', 'token', 'password', 'credential', 'auth'];
	const isLikelySensitive = sensitivePatterns.some(pattern =>
		key.toLowerCase().includes(pattern)
	);

	if (isLikelySensitive && value.length > 4) {
		return value.substring(0, 2) + '••••••' + value.substring(value.length - 2);
	}
	return value;
}

/**
 * Check if a project has an .mcp.json file
 */
export function projectHasMcpConfig(projectPath: string): boolean {
	return fs.existsSync(getProjectMcpPath(projectPath));
}
