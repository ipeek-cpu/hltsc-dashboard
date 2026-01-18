/**
 * GET /api/claude-code/status
 * Returns the current status of Claude Code installation and authentication
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStatus, getPlatformIdentifier } from '$lib/claude-code-manager';
import { getAuthStatus } from '$lib/claude-auth';

export const GET: RequestHandler = async () => {
	try {
		const installStatus = await getStatus();
		const authStatus = await getAuthStatus();
		const platform = getPlatformIdentifier();

		return json({
			// Installation status
			installed: installStatus.installed,
			version: installStatus.version,
			latestVersion: installStatus.latestVersion,
			updateAvailable: installStatus.updateAvailable,
			installPath: installStatus.installPath,
			lastUpdateCheck: installStatus.lastUpdateCheck,

			// Authentication status
			authenticated: authStatus.authenticated,
			email: authStatus.email,
			accountType: authStatus.accountType,
			authError: authStatus.error,

			// Platform info
			platform,
			platformSupported: platform !== null
		});
	} catch (err) {
		console.error('[claude-code/status] Error:', err);
		return json({
			error: err instanceof Error ? err.message : 'Unknown error',
			installed: false,
			authenticated: false
		}, { status: 500 });
	}
};
