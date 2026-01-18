import { json } from '@sveltejs/kit';
import { validateProjectPath } from '$lib/dashboard-db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { path: projectPath } = body;

	if (!projectPath) {
		return json({ valid: false, error: 'Path is required' }, { status: 400 });
	}

	const validation = validateProjectPath(projectPath);
	return json(validation);
};
