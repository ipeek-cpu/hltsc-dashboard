import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById, getProjectDevConfig } from '$lib/dashboard-db';
import { startDevServer, getServerStatus, getPreviewUrl } from '$lib/dev-server-manager';

export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const config = getProjectDevConfig(id);
	if (!config) {
		return json({ error: 'No dev server configuration. Please detect or configure first.' }, { status: 400 });
	}

	// Check for override port in request body
	let overridePort: number | undefined;
	try {
		const body = await request.json().catch(() => ({}));
		if (body.port && typeof body.port === 'number') {
			overridePort = body.port;
		}
	} catch {
		// No body or invalid JSON, that's fine
	}

	// Check if already running
	const currentStatus = getServerStatus(id);
	if (currentStatus.running) {
		const previewUrl = getPreviewUrl(id, config);
		return json({
			success: true,
			alreadyRunning: true,
			status: currentStatus,
			previewUrl
		});
	}

	const result = await startDevServer(id, project.path, config, { overridePort });

	// If there's a port conflict, return it with a specific status
	if (!result.success && result.portConflict) {
		return json({
			success: false,
			error: result.error,
			portConflict: result.portConflict
		}, { status: 409 }); // 409 Conflict
	}

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	const status = getServerStatus(id);
	const previewUrl = getPreviewUrl(id, config);

	return json({
		success: true,
		status,
		previewUrl,
		port: result.port
	});
};
