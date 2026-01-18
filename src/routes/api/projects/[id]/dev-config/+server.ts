import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getProjectById,
	getProjectDevConfig,
	setProjectDevConfig,
	clearProjectDevConfig,
	type DevServerConfig
} from '$lib/dashboard-db';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const config = getProjectDevConfig(id);
	return json({
		hasConfig: config !== null,
		config
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const body = await request.json();

		// Validate the config
		if (!body.framework || !body.devCommand || !body.defaultPort) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const config: DevServerConfig = {
			framework: body.framework,
			devCommand: body.devCommand,
			defaultPort: body.defaultPort,
			hotReloadSupported: body.hotReloadSupported ?? true,
			detectedAt: new Date().toISOString(),
			previewUrl: body.previewUrl
		};

		setProjectDevConfig(id, config);

		return json({ success: true, config });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to save config' },
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	clearProjectDevConfig(id);
	return json({ success: true });
};
