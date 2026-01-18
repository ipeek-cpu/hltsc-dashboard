import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { parseFrontmatter } from '$lib/agents';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

// GET single agent
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const filepath = path.join(project.path, '.claude', 'agents', params.filename);

	if (!fs.existsSync(filepath)) {
		return json({ error: 'Agent not found' }, { status: 404 });
	}

	try {
		const rawContent = fs.readFileSync(filepath, 'utf-8');
		const { frontmatter, content } = parseFrontmatter(rawContent);

		return json({
			filename: params.filename,
			filepath,
			frontmatter,
			content,
			rawContent
		});
	} catch (err) {
		console.error('Error reading agent file:', err);
		return json({ error: 'Failed to read agent' }, { status: 500 });
	}
};

// PUT - Update agent content
export const PUT: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const filepath = path.join(project.path, '.claude', 'agents', params.filename);

	if (!fs.existsSync(filepath)) {
		return json({ error: 'Agent not found' }, { status: 404 });
	}

	const body = await request.json();
	const { content } = body;

	if (typeof content !== 'string') {
		return json({ error: 'Content is required' }, { status: 400 });
	}

	try {
		fs.writeFileSync(filepath, content, 'utf-8');

		// Return updated agent
		const { frontmatter, content: parsedContent } = parseFrontmatter(content);

		return json({
			filename: params.filename,
			filepath,
			frontmatter,
			content: parsedContent,
			rawContent: content
		});
	} catch (err) {
		console.error('Error writing agent file:', err);
		return json({ error: 'Failed to save agent' }, { status: 500 });
	}
};

// DELETE - Delete agent
export const DELETE: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const filepath = path.join(project.path, '.claude', 'agents', params.filename);

	if (!fs.existsSync(filepath)) {
		return json({ error: 'Agent not found' }, { status: 404 });
	}

	try {
		fs.unlinkSync(filepath);
		return json({ success: true, deleted: params.filename });
	} catch (err) {
		console.error('Error deleting agent file:', err);
		return json({ error: 'Failed to delete agent' }, { status: 500 });
	}
};
