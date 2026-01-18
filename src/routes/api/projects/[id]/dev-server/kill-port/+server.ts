import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { killProcessOnPort, findAvailablePort } from '$lib/dev-server-manager';

export const POST: RequestHandler = async ({ request }) => {
	console.log('[kill-port] Received request');

	try {
		const body = await request.json();
		const { port, action } = body;
		console.log('[kill-port] Action:', action, 'Port:', port);

		if (!port || typeof port !== 'number') {
			console.log('[kill-port] Error: Port is required');
			return json({ error: 'Port is required' }, { status: 400 });
		}

		if (action === 'kill') {
			console.log('[kill-port] Killing process on port', port);
			const result = await killProcessOnPort(port);
			console.log('[kill-port] Kill result:', result);
			if (!result.success) {
				return json({ error: result.error }, { status: 500 });
			}
			return json({ success: true, message: `Process on port ${port} killed` });
		}

		if (action === 'find-available') {
			console.log('[kill-port] Finding available port starting from', port + 1);
			const availablePort = await findAvailablePort(port + 1, 100);
			console.log('[kill-port] Found available port:', availablePort);
			if (!availablePort) {
				return json({ error: 'Could not find an available port' }, { status: 500 });
			}
			return json({ success: true, port: availablePort });
		}

		return json({ error: 'Invalid action. Use "kill" or "find-available"' }, { status: 400 });
	} catch (error) {
		console.error('[kill-port] Error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to process request' },
			{ status: 500 }
		);
	}
};
