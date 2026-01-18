import { json } from '@sveltejs/kit';
import { getProjectById, removeProject, updateProjectName, updateProjectPath, getProjectByPath } from '$lib/dashboard-db';
import { getProjectCounts } from '$lib/project-db';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const counts = getProjectCounts(project.path);
		return json({
			...project,
			open_count: counts.open,
			in_progress_count: counts.in_progress,
			total_count: counts.total
		});
	} catch {
		return json({
			...project,
			open_count: 0,
			in_progress_count: 0,
			total_count: 0
		});
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const body = await request.json();

	if (body.name) {
		updateProjectName(params.id, body.name);
	}

	if (body.path) {
		// Validate the new path
		if (!fs.existsSync(body.path)) {
			return json({ error: 'Path does not exist' }, { status: 400 });
		}

		const stats = fs.statSync(body.path);
		if (!stats.isDirectory()) {
			return json({ error: 'Path is not a directory' }, { status: 400 });
		}

		// Check for beads database
		const beadsDbPath = path.join(body.path, '.beads', 'beads.db');
		if (!fs.existsSync(beadsDbPath)) {
			return json({ error: 'No beads database found in this directory' }, { status: 400 });
		}

		// Check if path is already used by another project
		const existingProject = getProjectByPath(body.path);
		if (existingProject && existingProject.id !== params.id) {
			return json({ error: 'This path is already used by another project' }, { status: 400 });
		}

		updateProjectPath(params.id, body.path);
	}

	return json(getProjectById(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	removeProject(params.id);
	return json({ success: true });
};
