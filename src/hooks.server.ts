import type { Handle, HandleServerError } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Debug logging for production
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'hooks.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

logDebug('hooks.server.ts module loaded');

/**
 * Handle unexpected errors
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const errorMsg = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : '';
	logDebug(`UNHANDLED ERROR: ${status} ${message}`);
	logDebug(`URL: ${event.url.pathname}`);
	logDebug(`Error: ${errorMsg}`);
	logDebug(`Stack: ${errorStack}`);
	console.error('[hooks] Unhandled error:', error);
	return { message: 'Internal Error' };
};

/**
 * Server hooks to handle CORS for Tauri loading page
 * The loading page is served from tauri://localhost and needs to
 * make requests to http://127.0.0.1:5555
 */
export const handle: Handle = async ({ event, resolve }) => {
	logDebug(`Request: ${event.request.method} ${event.url.pathname}`);

	// Handle preflight requests
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				'Access-Control-Max-Age': '86400'
			}
		});
	}

	try {
		const response = await resolve(event);

		// Add CORS headers to all responses
		// This allows the Tauri loading page (tauri://localhost) to access the API
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

		return response;
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : '';
		logDebug(`EXCEPTION in handle: ${errorMsg}`);
		logDebug(`Stack: ${errorStack}`);
		throw err;
	}
};
