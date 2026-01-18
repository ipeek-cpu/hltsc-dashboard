import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Simple health check endpoint - no database required
 * Used by the loading screen to check if the server is running
 */
export const GET: RequestHandler = async () => {
	return json({ ok: true, timestamp: Date.now() });
};
