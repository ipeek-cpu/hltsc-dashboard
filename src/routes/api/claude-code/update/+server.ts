/**
 * POST /api/claude-code/update
 * Updates Claude Code CLI to the latest version
 *
 * Returns SSE stream with progress updates
 */

import type { RequestHandler } from './$types';
import {
	updateToLatest,
	isInstalled,
	checkForUpdates,
	getInstalledVersion
} from '$lib/claude-code-manager';

export const POST: RequestHandler = async () => {
	if (!isInstalled()) {
		return new Response(JSON.stringify({
			success: false,
			error: 'Claude Code is not installed'
		}), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Return SSE stream for progress updates
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const sendEvent = (data: Record<string, unknown>) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			try {
				const currentVersion = getInstalledVersion();
				sendEvent({
					type: 'status',
					message: `Updating from v${currentVersion}...`
				});

				const result = await updateToLatest((percent) => {
					sendEvent({ type: 'progress', percent });
				});

				sendEvent({
					type: 'complete',
					success: true,
					previousVersion: currentVersion,
					newVersion: result.version,
					path: result.path
				});
			} catch (err) {
				console.error('[claude-code/update] Error:', err);
				sendEvent({
					type: 'error',
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				});
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};

/**
 * GET /api/claude-code/update
 * Check if an update is available
 */
export const GET: RequestHandler = async () => {
	if (!isInstalled()) {
		return new Response(JSON.stringify({
			installed: false,
			updateAvailable: false
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const result = await checkForUpdates();

		return new Response(JSON.stringify({
			installed: true,
			currentVersion: result.currentVersion,
			latestVersion: result.latestVersion,
			updateAvailable: result.updateAvailable
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('[claude-code/update] Error checking for updates:', err);
		return new Response(JSON.stringify({
			installed: true,
			error: err instanceof Error ? err.message : 'Unknown error'
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
