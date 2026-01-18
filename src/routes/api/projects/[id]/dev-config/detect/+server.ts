import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById, setProjectDevConfig } from '$lib/dashboard-db';
import { detectDevServerConfig, getFrameworkDisplayName } from '$lib/dev-server-detector';

export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		// Use Claude Code CLI to intelligently detect the dev server config
		const result = await detectDevServerConfig(project.path);

		if (!result.detected || !result.config) {
			return json({
				detected: false,
				message: result.error || 'Could not detect framework. Please configure manually.'
			});
		}

		// If store URL is needed, don't save config yet - wait for user input
		if (!result.needsStoreUrl) {
			setProjectDevConfig(id, result.config);
		}

		return json({
			detected: true,
			config: result.config,
			frameworkInfo: {
				displayName: result.frameworkDisplayName || getFrameworkDisplayName(result.config),
				hotReloadSupported: result.config.hotReloadSupported
			},
			needsStoreUrl: result.needsStoreUrl || false
		});
	} catch (error) {
		console.error('[dev-config/detect] Error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Detection failed' },
			{ status: 500 }
		);
	}
};
