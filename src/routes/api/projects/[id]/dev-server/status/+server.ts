import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById, getProjectDevConfig } from '$lib/dashboard-db';
import { getServerStatus, getPreviewUrl, getServerOutput } from '$lib/dev-server-manager';

export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const status = getServerStatus(id);
	const config = getProjectDevConfig(id);

	// Include recent output if requested
	const includeOutput = url.searchParams.get('output') === 'true';
	const outputLines = includeOutput ? getServerOutput(id, 20) : [];

	// Get preview URL if server is running and config exists
	const previewUrl = status.running && config ? getPreviewUrl(id, config) : null;

	return json({
		status,
		config,
		previewUrl,
		output: outputLines
	});
};
