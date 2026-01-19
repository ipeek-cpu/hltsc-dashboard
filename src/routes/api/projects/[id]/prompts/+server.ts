/**
 * Session prompts API - CRUD operations for project prompts
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	loadPrompts,
	savePrompt,
	deletePrompt,
	createDefaultPrompts,
	hasPromptsDir,
	getStartPromptContent,
	getEndPromptContent
} from '$lib/prompts';

/**
 * GET /api/projects/[id]/prompts
 * Get all prompts for a project
 */
export const GET: RequestHandler = async ({ params }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const config = loadPrompts(project.path);

		return json({
			prompts: config.allPrompts,
			startPrompt: config.startPrompt || null,
			endPrompt: config.endPrompt || null,
			hasPromptsDir: hasPromptsDir(project.path)
		});
	} catch (err) {
		console.error('Error loading prompts:', err);
		throw error(500, 'Failed to load prompts');
	}
};

/**
 * POST /api/projects/[id]/prompts
 * Create or update a prompt
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { filename, content, createDefaults } = body;

		// Option to create default prompts
		if (createDefaults) {
			createDefaultPrompts(project.path);
			const config = loadPrompts(project.path);
			return json({
				success: true,
				prompts: config.allPrompts,
				startPrompt: config.startPrompt || null,
				endPrompt: config.endPrompt || null
			});
		}

		if (!filename || !content) {
			throw error(400, 'filename and content are required');
		}

		// Validate filename
		if (!filename.endsWith('.md')) {
			throw error(400, 'filename must end with .md');
		}

		const prompt = savePrompt(project.path, filename, content);

		return json({
			success: true,
			prompt
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error saving prompt:', err);
		throw error(500, 'Failed to save prompt');
	}
};

/**
 * DELETE /api/projects/[id]/prompts
 * Delete a prompt
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { filename } = body;

		if (!filename) {
			throw error(400, 'filename is required');
		}

		const deleted = deletePrompt(project.path, filename);

		if (!deleted) {
			throw error(404, 'Prompt not found');
		}

		return json({
			success: true,
			deleted: filename
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error deleting prompt:', err);
		throw error(500, 'Failed to delete prompt');
	}
};
