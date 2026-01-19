import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabaseHealth, type DatabaseHealth } from '$lib/db';

interface HealthResponse {
	ok: boolean;
	timestamp: number;
	database: DatabaseHealth;
	status: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Health check endpoint with database status
 *
 * Returns:
 * - 200: System healthy (database connected)
 * - 503: System degraded or unhealthy (database issues)
 *
 * Response includes detailed database health for monitoring.
 */
export const GET: RequestHandler = async () => {
	const startTime = Date.now();
	const database = getDatabaseHealth();
	const responseTime = Date.now() - startTime;

	let status: HealthResponse['status'] = 'healthy';
	let httpStatus = 200;

	if (!database.exists) {
		status = 'unhealthy';
		httpStatus = 503;
	} else if (!database.connected) {
		status = 'degraded';
		httpStatus = 503;
	} else if (!database.walMode) {
		status = 'degraded';
		// Still return 200 - WAL mode is preferred but not required
	}

	const response: HealthResponse = {
		ok: status === 'healthy',
		timestamp: Date.now(),
		database,
		status
	};

	return json(response, {
		status: httpStatus,
		headers: {
			'X-Response-Time': `${responseTime}ms`
		}
	});
};
