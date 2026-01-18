import { json } from '@sveltejs/kit';
import {
	getAllProjects,
	addProject,
	validateProjectPath,
	type ProjectWithStats
} from '$lib/dashboard-db';
import { getProjectCounts } from '$lib/project-db';
import {
	getLatestVersion,
	getProjectBeadsVersion,
	isProjectBeadsOutdated
} from '$lib/beads-manager';
import type { RequestHandler } from './$types';
import fs from 'fs';

export const GET: RequestHandler = async () => {
	const projects = getAllProjects();

	// Fetch latest beads version (cached, won't block on subsequent calls)
	const latestBeadsVersion = await getLatestVersion();

	// Enrich with stats from each project's beads.db
	const projectsWithStats: ProjectWithStats[] = projects.map((project) => {
		// Check if folder exists
		const folderExists = fs.existsSync(project.path);

		if (!folderExists) {
			return {
				...project,
				open_count: 0,
				in_progress_count: 0,
				total_count: 0,
				beads_version: null,
				beads_outdated: false,
				folder_missing: true
			};
		}

		try {
			const counts = getProjectCounts(project.path);
			const beadsVersion = getProjectBeadsVersion(project.path);
			const beadsOutdated = isProjectBeadsOutdated(project.path, latestBeadsVersion);

			return {
				...project,
				open_count: counts.open,
				in_progress_count: counts.in_progress,
				total_count: counts.total,
				beads_version: beadsVersion,
				beads_outdated: beadsOutdated,
				folder_missing: false
			};
		} catch {
			// If we can't read the project's DB, return zeros
			return {
				...project,
				open_count: 0,
				in_progress_count: 0,
				total_count: 0,
				beads_version: null,
				beads_outdated: false,
				folder_missing: false
			};
		}
	});

	return json(projectsWithStats);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { path: projectPath, name } = body;

	if (!projectPath) {
		return json({ error: 'Path is required' }, { status: 400 });
	}

	const validation = validateProjectPath(projectPath);
	if (!validation.valid) {
		return json({ error: validation.error }, { status: 400 });
	}

	const project = addProject(projectPath, name);
	return json(project, { status: 201 });
};
