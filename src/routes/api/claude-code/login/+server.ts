/**
 * POST /api/claude-code/login
 * Triggers Claude Code OAuth login flow
 *
 * This opens a browser window for the user to authenticate with Anthropic
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { triggerLogin, getAuthStatus, logout } from '$lib/claude-auth';
import { isInstalled } from '$lib/claude-code-manager';

export const POST: RequestHandler = async () => {
	if (!isInstalled()) {
		return json({
			success: false,
			error: 'Claude Code is not installed. Please install it first.'
		}, { status: 400 });
	}

	try {
		console.log('[claude-code/login] Starting login flow...');

		const result = await triggerLogin();

		if (result.success) {
			// Get updated auth status
			const authStatus = await getAuthStatus();

			return json({
				success: true,
				authenticated: authStatus.authenticated,
				email: authStatus.email,
				accountType: authStatus.accountType
			});
		} else {
			return json({
				success: false,
				error: result.error || 'Login failed'
			}, { status: 400 });
		}
	} catch (err) {
		console.error('[claude-code/login] Error:', err);
		return json({
			success: false,
			error: err instanceof Error ? err.message : 'Unknown error'
		}, { status: 500 });
	}
};

/**
 * GET /api/claude-code/login
 * Get current authentication status
 */
export const GET: RequestHandler = async () => {
	if (!isInstalled()) {
		return json({
			installed: false,
			authenticated: false,
			error: 'Claude Code is not installed'
		});
	}

	try {
		const authStatus = await getAuthStatus();

		return json({
			installed: true,
			authenticated: authStatus.authenticated,
			email: authStatus.email,
			accountType: authStatus.accountType,
			error: authStatus.error
		});
	} catch (err) {
		console.error('[claude-code/login] Error getting auth status:', err);
		return json({
			installed: true,
			authenticated: false,
			error: err instanceof Error ? err.message : 'Unknown error'
		}, { status: 500 });
	}
};

/**
 * DELETE /api/claude-code/login
 * Logout from Claude Code
 */
export const DELETE: RequestHandler = async () => {
	if (!isInstalled()) {
		return json({
			success: false,
			error: 'Claude Code is not installed'
		}, { status: 400 });
	}

	try {
		const result = await logout();

		return json({
			success: result.success,
			error: result.error
		});
	} catch (err) {
		console.error('[claude-code/login] Error logging out:', err);
		return json({
			success: false,
			error: err instanceof Error ? err.message : 'Unknown error'
		}, { status: 500 });
	}
};
