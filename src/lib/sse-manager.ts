/**
 * SSE Connection Manager
 *
 * Manages Server-Sent Events connections with:
 * - Heartbeat mechanism (every 15 seconds)
 * - Connection tracking for health monitoring
 * - Automatic cleanup of stale connections
 * - Memory leak prevention
 */

export interface SseConnection {
	id: string;
	controller: ReadableStreamDefaultController;
	encoder: TextEncoder;
	createdAt: Date;
	lastActivity: Date;
	heartbeatInterval: ReturnType<typeof setInterval> | null;
	pollInterval: ReturnType<typeof setInterval> | null;
}

// Global connection store
const connections = new Map<string, SseConnection>();

// Heartbeat interval (15 seconds)
const HEARTBEAT_INTERVAL = 15000;

// Stale connection timeout (2 minutes without activity)
const STALE_CONNECTION_TIMEOUT = 120000;

// Connection cleanup interval (30 seconds)
const CLEANUP_INTERVAL = 30000;

// Cleanup timer
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Generate a unique connection ID
 */
function generateConnectionId(): string {
	return `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Start the stale connection cleanup timer
 */
function startCleanupTimer(): void {
	if (cleanupIntervalId) return;

	cleanupIntervalId = setInterval(() => {
		const now = Date.now();
		const staleIds: string[] = [];

		connections.forEach((conn, id) => {
			if (now - conn.lastActivity.getTime() > STALE_CONNECTION_TIMEOUT) {
				staleIds.push(id);
			}
		});

		staleIds.forEach((id) => {
			closeConnection(id);
		});
	}, CLEANUP_INTERVAL);
}

/**
 * Stop the cleanup timer if no connections
 */
function maybeStopCleanupTimer(): void {
	if (connections.size === 0 && cleanupIntervalId) {
		clearInterval(cleanupIntervalId);
		cleanupIntervalId = null;
	}
}

/**
 * Register a new SSE connection
 */
export function registerConnection(controller: ReadableStreamDefaultController): SseConnection {
	const id = generateConnectionId();
	const encoder = new TextEncoder();
	const now = new Date();

	const connection: SseConnection = {
		id,
		controller,
		encoder,
		createdAt: now,
		lastActivity: now,
		heartbeatInterval: null,
		pollInterval: null
	};

	// Start heartbeat
	connection.heartbeatInterval = setInterval(() => {
		sendHeartbeat(connection);
	}, HEARTBEAT_INTERVAL);

	connections.set(id, connection);
	startCleanupTimer();

	return connection;
}

/**
 * Update connection activity timestamp
 */
export function updateActivity(connectionId: string): void {
	const connection = connections.get(connectionId);
	if (connection) {
		connection.lastActivity = new Date();
	}
}

/**
 * Send a heartbeat to keep the connection alive
 */
function sendHeartbeat(connection: SseConnection): void {
	try {
		const message = `: heartbeat\n\n`;
		connection.controller.enqueue(connection.encoder.encode(message));
		connection.lastActivity = new Date();
	} catch {
		// Connection likely closed, cleanup will handle it
	}
}

/**
 * Send data to a specific connection
 */
export function sendData(connectionId: string, data: unknown): boolean {
	const connection = connections.get(connectionId);
	if (!connection) return false;

	try {
		const message = `data: ${JSON.stringify(data)}\n\n`;
		connection.controller.enqueue(connection.encoder.encode(message));
		connection.lastActivity = new Date();
		return true;
	} catch {
		// Connection likely closed
		closeConnection(connectionId);
		return false;
	}
}

/**
 * Send an event with type to a specific connection
 */
export function sendEvent(connectionId: string, eventType: string, data: unknown): boolean {
	const connection = connections.get(connectionId);
	if (!connection) return false;

	try {
		const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
		connection.controller.enqueue(connection.encoder.encode(message));
		connection.lastActivity = new Date();
		return true;
	} catch {
		closeConnection(connectionId);
		return false;
	}
}

/**
 * Close a connection and cleanup resources
 */
export function closeConnection(connectionId: string): void {
	const connection = connections.get(connectionId);
	if (!connection) return;

	// Clear heartbeat
	if (connection.heartbeatInterval) {
		clearInterval(connection.heartbeatInterval);
		connection.heartbeatInterval = null;
	}

	// Clear poll interval if set
	if (connection.pollInterval) {
		clearInterval(connection.pollInterval);
		connection.pollInterval = null;
	}

	// Try to close the controller
	try {
		connection.controller.close();
	} catch {
		// Already closed
	}

	connections.delete(connectionId);
	maybeStopCleanupTimer();
}

/**
 * Set a poll interval for a connection
 */
export function setPollInterval(
	connectionId: string,
	callback: () => void,
	intervalMs: number
): void {
	const connection = connections.get(connectionId);
	if (!connection) return;

	// Clear existing poll interval
	if (connection.pollInterval) {
		clearInterval(connection.pollInterval);
	}

	connection.pollInterval = setInterval(callback, intervalMs);
}

/**
 * Get connection statistics for health monitoring
 */
export function getConnectionStats(): {
	totalConnections: number;
	activeConnections: number;
	staleConnections: number;
	oldestConnectionAge: number | null;
} {
	const now = Date.now();
	let activeCount = 0;
	let staleCount = 0;
	let oldestAge: number | null = null;

	connections.forEach((conn) => {
		const age = now - conn.createdAt.getTime();
		const timeSinceActivity = now - conn.lastActivity.getTime();

		if (timeSinceActivity > STALE_CONNECTION_TIMEOUT) {
			staleCount++;
		} else {
			activeCount++;
		}

		if (oldestAge === null || age > oldestAge) {
			oldestAge = age;
		}
	});

	return {
		totalConnections: connections.size,
		activeConnections: activeCount,
		staleConnections: staleCount,
		oldestConnectionAge: oldestAge
	};
}

/**
 * Close all connections (for shutdown)
 */
export function closeAllConnections(): void {
	const ids = Array.from(connections.keys());
	ids.forEach((id) => closeConnection(id));
}
