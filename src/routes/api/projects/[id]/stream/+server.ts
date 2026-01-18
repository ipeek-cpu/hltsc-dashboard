import { getProjectById, updateProjectLastAccessed } from '$lib/dashboard-db';
import { getAllIssues, getDataVersion, getRecentEvents, refreshProjectDb } from '$lib/project-db';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

// Helper to check if beads.db exists
function beadsDbExists(projectPath: string): boolean {
	const dbPath = path.join(projectPath, '.beads', 'beads.db');
	return fs.existsSync(dbPath);
}

// Helper to sleep
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const GET: RequestHandler = async ({ params }) => {
	console.log(`[Stream] Request for project: ${params.id}`);
	const project = getProjectById(params.id);

	if (!project) {
		console.log(`[Stream] Project NOT FOUND: ${params.id}`);
		return new Response(JSON.stringify({ error: 'Project not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	console.log(`[Stream] Project found: ${project.name} at ${project.path}`);

	// Update last accessed time
	updateProjectLastAccessed(params.id);

	const projectPath = project.path;
	let lastDataVersion = 0;
	let lastEventTime = new Date().toISOString();
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let dbReady = false;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			console.log(`[Stream] Starting stream for ${project.name}`);

			// Wait for beads.db inside the stream (keeps SSE connection alive)
			const maxWaitMs = 5000;
			const startTime = Date.now();

			while (!dbReady && Date.now() - startTime < maxWaitMs) {
				if (beadsDbExists(projectPath)) {
					dbReady = true;
					console.log(`[Stream] beads.db found after ${Date.now() - startTime}ms`);
					break;
				}
				// Send a waiting status to keep connection alive
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'waiting', message: 'Initializing database...' })}\n\n`));
				await sleep(200);
			}

			if (!dbReady) {
				console.log(`[Stream] beads.db NOT FOUND after ${maxWaitMs}ms timeout`);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Database not ready' })}\n\n`));
				controller.close();
				return;
			}

			// Now get initial data
			try {
				lastDataVersion = getDataVersion(projectPath);
				const initialData = {
					type: 'init',
					project: {
						id: project.id,
						name: project.name,
						path: project.path
					},
					issues: getAllIssues(projectPath),
					dataVersion: lastDataVersion
				};
				console.log(`[Stream] Sending init with ${initialData.issues.length} issues`);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));
			} catch (error) {
				console.error('[Stream] Error sending initial data:', error);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Failed to read database' })}\n\n`));
				controller.close();
				return;
			}

			// Poll for changes every second
			intervalId = setInterval(() => {
				try {
					const currentVersion = getDataVersion(projectPath);

					if (currentVersion !== lastDataVersion) {
						lastDataVersion = currentVersion;

						// Refresh the database connection to get latest data
						// This is needed because SQLite WAL mode can cache old snapshots
						refreshProjectDb(projectPath);

						// Get new events since last check
						const newEvents = getRecentEvents(projectPath, lastEventTime, 50);
						if (newEvents.length > 0) {
							lastEventTime = newEvents[0].created_at;
						}

						// Send full update
						const update = {
							type: 'update',
							issues: getAllIssues(projectPath),
							events: newEvents,
							dataVersion: currentVersion
						};
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
					}
				} catch (error) {
					console.error('Stream poll error:', error);
				}
			}, 1000);
		},
		cancel() {
			if (intervalId) {
				clearInterval(intervalId);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
