import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { repairAllData, previewRepairs } from '$lib/data-repair';
import type { RequestHandler } from './$types';

// GET - Preview what repairs would be made
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const preview = previewRepairs(project.path);
		return json({
			preview: true,
			...preview
		});
	} catch (e) {
		console.error('Error previewing repairs:', e);
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to preview repairs' },
			{ status: 500 }
		);
	}
};

// POST - Run repairs
export const POST: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const result = repairAllData(project.path);
		return json({
			success: true,
			...result
		});
	} catch (e) {
		console.error('Error running repairs:', e);
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to run repairs' },
			{ status: 500 }
		);
	}
};
