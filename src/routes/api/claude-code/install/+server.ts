/**
 * POST /api/claude-code/install
 * Installs Claude Code CLI
 *
 * Returns SSE stream with progress updates
 */

import type { RequestHandler } from './$types';
import { installLatest, getPlatformIdentifier, isInstalled } from '$lib/claude-code-manager';

export const POST: RequestHandler = async () => {
	const platform = getPlatformIdentifier();

	if (!platform) {
		return new Response(JSON.stringify({
			success: false,
			error: 'Your platform is not supported for Claude Code installation'
		}), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (isInstalled()) {
		return new Response(JSON.stringify({
			success: false,
			error: 'Claude Code is already installed'
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
				sendEvent({ type: 'status', message: 'Starting installation...' });

				const result = await installLatest((percent) => {
					sendEvent({ type: 'progress', percent });
				});

				sendEvent({
					type: 'complete',
					success: true,
					version: result.version,
					path: result.path
				});
			} catch (err) {
				console.error('[claude-code/install] Error:', err);
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
 * GET /api/claude-code/install
 * Check if installation is possible
 */
export const GET: RequestHandler = async () => {
	const platform = getPlatformIdentifier();
	const installed = isInstalled();

	return new Response(JSON.stringify({
		canInstall: platform !== null && !installed,
		platform,
		platformSupported: platform !== null,
		alreadyInstalled: installed
	}), {
		headers: { 'Content-Type': 'application/json' }
	});
};
