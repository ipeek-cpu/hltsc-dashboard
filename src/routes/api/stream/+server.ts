import { getAllIssues, getDataVersion, getRecentEvents } from '$lib/db';
import {
	registerConnection,
	closeConnection,
	sendData,
	setPollInterval
} from '$lib/sse-manager';
import type { RequestHandler } from './$types';

/**
 * SSE endpoint for real-time issue updates
 *
 * Features:
 * - Heartbeat every 15 seconds (via sse-manager)
 * - Automatic reconnection support (client-side)
 * - Connection tracking for health monitoring
 * - Stale connection cleanup
 */
export const GET: RequestHandler = async () => {
	let connectionId: string | null = null;
	let lastDataVersion = getDataVersion();
	let lastEventTime = new Date().toISOString();

	const stream = new ReadableStream({
		start(controller) {
			// Register connection with the manager (starts heartbeat)
			const connection = registerConnection(controller);
			connectionId = connection.id;

			// Send initial data immediately
			try {
				const initialData = {
					type: 'init',
					issues: getAllIssues(),
					dataVersion: lastDataVersion
				};
				sendData(connection.id, initialData);
			} catch (error) {
				console.error('Error sending initial data:', error);
			}

			// Set up polling for changes every second
			setPollInterval(
				connection.id,
				() => {
					try {
						const currentVersion = getDataVersion();

						if (currentVersion !== lastDataVersion) {
							lastDataVersion = currentVersion;

							// Get new events since last check
							const newEvents = getRecentEvents(lastEventTime, 50);
							if (newEvents.length > 0) {
								lastEventTime = newEvents[0].created_at;
							}

							// Send full update
							const update = {
								type: 'update',
								issues: getAllIssues(),
								events: newEvents,
								dataVersion: currentVersion
							};
							sendData(connection.id, update);
						}
					} catch (error) {
						console.error('Stream poll error:', error);
					}
				},
				1000
			);
		},
		cancel() {
			// Cleanup connection when stream is cancelled
			if (connectionId) {
				closeConnection(connectionId);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			// Suggest client retry after 3 seconds on disconnect
			'retry': '3000'
		}
	});
};
