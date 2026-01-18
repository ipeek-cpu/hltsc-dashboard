import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import { stopDevServer, getServerStatus } from '$lib/dev-server-manager';

export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Check if running
	const currentStatus = getServerStatus(id);
	if (!currentStatus.running) {
		return json({
			success: true,
			wasRunning: false
		});
	}

	const result = await stopDevServer(id);

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({
		success: true,
		wasRunning: true
	});
};
