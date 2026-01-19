import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabaseHealth, type DatabaseHealth } from '$lib/db';
import { getClaudePath, verifyClaudeCli } from '$lib/settings';
import { getConnectionStats } from '$lib/sse-manager';

/**
 * Component health status
 */
interface ComponentHealth {
	healthy: boolean;
	message?: string;
}

/**
 * Claude CLI health status
 */
interface ClaudeHealth extends ComponentHealth {
	installed: boolean;
	version?: string;
	path?: string;
}

/**
 * SSE connection health status
 */
interface SseHealth extends ComponentHealth {
	active: boolean;
	totalConnections: number;
	activeConnections: number;
	staleConnections: number;
}

/**
 * Full health response
 */
interface HealthResponse {
	ok: boolean;
	timestamp: number;
	responseTime: number;
	status: 'healthy' | 'degraded' | 'unhealthy';
	components: {
		database: DatabaseHealth & ComponentHealth;
		claude: ClaudeHealth;
		sse: SseHealth;
	};
}

/**
 * Check Claude CLI health
 */
function getClaudeHealth(): ClaudeHealth {
	const { path: claudePath } = getClaudePath();

	if (!claudePath) {
		return {
			healthy: false,
			installed: false,
			message: 'Claude CLI not installed'
		};
	}

	const verification = verifyClaudeCli(claudePath);

	if (!verification.valid) {
		return {
			healthy: false,
			installed: true,
			path: claudePath,
			message: verification.error || 'Claude CLI verification failed'
		};
	}

	return {
		healthy: true,
		installed: true,
		version: verification.version,
		path: claudePath
	};
}

/**
 * Check SSE health with connection statistics
 */
function getSseHealth(): SseHealth {
	const stats = getConnectionStats();

	return {
		healthy: true,
		active: true,
		totalConnections: stats.totalConnections,
		activeConnections: stats.activeConnections,
		staleConnections: stats.staleConnections
	};
}

/**
 * Health check endpoint with comprehensive component status
 *
 * Returns:
 * - 200: System healthy (all critical components working)
 * - 503: System degraded or unhealthy (database or critical component issues)
 *
 * Response includes detailed health for all components.
 * Response time target: < 100ms
 */
export const GET: RequestHandler = async () => {
	const startTime = Date.now();

	// Check all components
	const database = getDatabaseHealth();
	const claude = getClaudeHealth();
	const sse = getSseHealth();

	const responseTime = Date.now() - startTime;

	// Determine overall status
	let status: HealthResponse['status'] = 'healthy';
	let httpStatus = 200;

	// Database is critical
	if (!database.exists || !database.connected) {
		status = 'unhealthy';
		httpStatus = 503;
	} else if (!database.walMode) {
		status = 'degraded';
	}

	// Claude is important but not critical for basic operation
	if (!claude.installed) {
		if (status === 'healthy') {
			status = 'degraded';
		}
	}

	const response: HealthResponse = {
		ok: status === 'healthy',
		timestamp: Date.now(),
		responseTime,
		status,
		components: {
			database: {
				...database,
				healthy: database.connected && database.exists
			},
			claude,
			sse
		}
	};

	return json(response, {
		status: httpStatus,
		headers: {
			'X-Response-Time': `${responseTime}ms`,
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
