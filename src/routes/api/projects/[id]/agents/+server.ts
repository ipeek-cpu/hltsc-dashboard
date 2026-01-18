import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { parseFrontmatter, serializeAgent } from '$lib/agents';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';
import type { Agent } from '$lib/types';

// GET - List all agents
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const agentsDir = path.join(project.path, '.claude', 'agents');

	// Check if .claude/agents directory exists
	if (!fs.existsSync(agentsDir)) {
		return json({ agents: [], hasAgentsDir: false });
	}

	try {
		const files = fs.readdirSync(agentsDir);
		const agents: Agent[] = [];

		for (const file of files) {
			if (!file.endsWith('.md')) continue;

			const filepath = path.join(agentsDir, file);
			const stat = fs.statSync(filepath);

			if (!stat.isFile()) continue;

			const rawContent = fs.readFileSync(filepath, 'utf-8');
			const { frontmatter, content } = parseFrontmatter(rawContent);

			agents.push({
				filename: file,
				filepath,
				frontmatter,
				content,
				rawContent
			});
		}

		// Sort by name
		agents.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));

		return json({ agents, hasAgentsDir: true });
	} catch (err) {
		console.error('Error reading agents directory:', err);
		return json({ error: 'Failed to read agents' }, { status: 500 });
	}
};

// POST - Create new agent
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const agentsDir = path.join(project.path, '.claude', 'agents');

	// Create .claude/agents directory if it doesn't exist
	if (!fs.existsSync(agentsDir)) {
		try {
			fs.mkdirSync(agentsDir, { recursive: true });
		} catch (err) {
			console.error('Error creating agents directory:', err);
			return json({ error: 'Failed to create agents directory' }, { status: 500 });
		}
	}

	const body = await request.json();
	const { name, description, model = 'sonnet', color = 'blue', prompt = '' } = body;

	if (!name || typeof name !== 'string') {
		return json({ error: 'Name is required' }, { status: 400 });
	}

	// Generate filename from name
	const filename = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md';
	const filepath = path.join(agentsDir, filename);

	// Check if file already exists
	if (fs.existsSync(filepath)) {
		return json({ error: 'Agent with this name already exists' }, { status: 409 });
	}

	try {
		// Create agent content with frontmatter
		const content = serializeAgent(
			{ name, description, model, color },
			prompt || `You are ${name}.\n\n${description || 'Add your agent instructions here.'}`
		);

		fs.writeFileSync(filepath, content, 'utf-8');

		// Return created agent
		const { frontmatter, content: parsedContent } = parseFrontmatter(content);

		return json({
			filename,
			filepath,
			frontmatter,
			content: parsedContent,
			rawContent: content
		}, { status: 201 });
	} catch (err) {
		console.error('Error creating agent file:', err);
		return json({ error: 'Failed to create agent' }, { status: 500 });
	}
};
