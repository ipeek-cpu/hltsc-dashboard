/**
 * Centralized Logging Module
 *
 * Provides structured logging with:
 * - Log levels (debug, info, warn, error)
 * - Automatic log rotation (keeps last 7 days)
 * - Consistent formatting with timestamps
 * - Request context support for API logging
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
};

const LOG_DIR = path.join(os.homedir(), '.beads-dashboard');
const LOG_RETENTION_DAYS = 7;

// Current minimum log level (can be changed at runtime)
let minLogLevel: LogLevel = 'debug';

/**
 * Ensure the log directory exists
 */
function ensureLogDir(): void {
	if (!fs.existsSync(LOG_DIR)) {
		fs.mkdirSync(LOG_DIR, { recursive: true });
	}
}

/**
 * Get the log file path for a specific category
 */
export function getLogFilePath(category: string): string {
	return path.join(LOG_DIR, `${category}.log`);
}

/**
 * Get the logs directory path
 */
export function getLogDir(): string {
	return LOG_DIR;
}

/**
 * List all log files with their sizes and modification times
 */
export function listLogFiles(): {
	name: string;
	path: string;
	size: number;
	modified: Date;
}[] {
	ensureLogDir();
	try {
		const files = fs.readdirSync(LOG_DIR);
		return files
			.filter((f) => f.endsWith('.log'))
			.map((name) => {
				const filePath = path.join(LOG_DIR, name);
				const stats = fs.statSync(filePath);
				return {
					name,
					path: filePath,
					size: stats.size,
					modified: stats.mtime
				};
			})
			.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	} catch {
		return [];
	}
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Rotate old log files (delete logs older than retention period)
 */
export function rotateOldLogs(): { deleted: string[]; errors: string[] } {
	const result = { deleted: [] as string[], errors: [] as string[] };
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

	try {
		const files = fs.readdirSync(LOG_DIR);
		for (const file of files) {
			if (!file.endsWith('.log')) continue;

			const filePath = path.join(LOG_DIR, file);
			try {
				const stats = fs.statSync(filePath);
				if (stats.mtime < cutoffDate) {
					fs.unlinkSync(filePath);
					result.deleted.push(file);
				}
			} catch (err) {
				result.errors.push(`Failed to process ${file}: ${err instanceof Error ? err.message : 'unknown error'}`);
			}
		}
	} catch (err) {
		result.errors.push(`Failed to read log directory: ${err instanceof Error ? err.message : 'unknown error'}`);
	}

	return result;
}

/**
 * Clear all log files
 */
export function clearAllLogs(): { cleared: string[]; errors: string[] } {
	const result = { cleared: [] as string[], errors: [] as string[] };

	try {
		const files = fs.readdirSync(LOG_DIR);
		for (const file of files) {
			if (!file.endsWith('.log')) continue;

			const filePath = path.join(LOG_DIR, file);
			try {
				fs.unlinkSync(filePath);
				result.cleared.push(file);
			} catch (err) {
				result.errors.push(`Failed to delete ${file}: ${err instanceof Error ? err.message : 'unknown error'}`);
			}
		}
	} catch (err) {
		result.errors.push(`Failed to read log directory: ${err instanceof Error ? err.message : 'unknown error'}`);
	}

	return result;
}

/**
 * Set the minimum log level
 */
export function setLogLevel(level: LogLevel): void {
	minLogLevel = level;
}

/**
 * Get the current minimum log level
 */
export function getLogLevel(): LogLevel {
	return minLogLevel;
}

/**
 * Format a log entry
 */
function formatLogEntry(
	level: LogLevel,
	category: string,
	message: string,
	context?: Record<string, unknown>
): string {
	const timestamp = new Date().toISOString();
	const levelStr = level.toUpperCase().padEnd(5);
	let entry = `[${timestamp}] [${levelStr}] [${category}] ${message}`;

	if (context && Object.keys(context).length > 0) {
		try {
			entry += ` ${JSON.stringify(context)}`;
		} catch {
			entry += ' [context serialization failed]';
		}
	}

	return entry;
}

/**
 * Write a log entry to file
 */
function writeLog(
	level: LogLevel,
	category: string,
	message: string,
	context?: Record<string, unknown>
): void {
	// Check if level meets minimum threshold
	if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLogLevel]) {
		return;
	}

	try {
		ensureLogDir();
		const logFile = getLogFilePath(category);
		const entry = formatLogEntry(level, category, message, context);
		fs.appendFileSync(logFile, entry + '\n');
	} catch {
		// Silently fail - we can't log about logging failures
	}
}

/**
 * Create a logger instance for a specific category
 */
export function createLogger(category: string) {
	return {
		debug: (message: string, context?: Record<string, unknown>) =>
			writeLog('debug', category, message, context),
		info: (message: string, context?: Record<string, unknown>) =>
			writeLog('info', category, message, context),
		warn: (message: string, context?: Record<string, unknown>) =>
			writeLog('warn', category, message, context),
		error: (message: string, context?: Record<string, unknown>) =>
			writeLog('error', category, message, context)
	};
}

/**
 * Request context for API logging
 */
export interface RequestContext {
	method: string;
	path: string;
	query?: Record<string, string>;
	userAgent?: string;
	ip?: string;
}

/**
 * Create a logger for API requests
 */
export function createApiLogger(category: string) {
	const logger = createLogger(category);

	return {
		...logger,
		request: (message: string, req: RequestContext, extra?: Record<string, unknown>) => {
			logger.info(message, { ...req, ...extra });
		},
		requestError: (message: string, req: RequestContext, error: Error | unknown, extra?: Record<string, unknown>) => {
			const errorInfo = error instanceof Error
				? { error: error.message, stack: error.stack }
				: { error: String(error) };
			logger.error(message, { ...req, ...errorInfo, ...extra });
		}
	};
}

// Pre-created loggers for common categories
export const appLogger = createLogger('app');
export const apiLogger = createApiLogger('api');
export const claudeLogger = createLogger('claude-cli');
export const chatLogger = createLogger('chat-manager');
export const dbLogger = createLogger('database');
