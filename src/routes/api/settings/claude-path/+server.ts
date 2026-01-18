import { json } from '@sveltejs/kit';
import { getClaudePath, verifyClaudeCli } from '$lib/settings';
import type { RequestHandler } from './$types';

/**
 * GET - Get current Claude CLI path configuration
 * Only returns the managed installation path - we never use external Claude binaries
 */
export const GET: RequestHandler = async () => {
	const { path } = getClaudePath();

	let verification = null;
	if (path) {
		verification = verifyClaudeCli(path);
	}

	return json({
		path,
		isInstalled: !!path,
		isValid: verification?.valid || false,
		version: verification?.version,
		error: verification?.error
	});
};
