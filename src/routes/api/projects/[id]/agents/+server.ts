import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { parseFrontmatter, serializeAgent } from '$lib/agents';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RequestHandler } from './$types';
import type { Agent } from '$lib/types';

/**
 * Load agents from a directory
 */
function loadAgentsFromDir(
	dir: string,
	scope: 'global' | 'project'
): Agent[] {
	if (!fs.existsSync(dir)) {
		return [];
	}

	const agents: Agent[] = [];
	const files = fs.readdirSync(dir);

	for (const file of files) {
		if (!file.endsWith('.md')) continue;

		const filepath = path.join(dir, file);
		const stat = fs.statSync(filepath);

		if (!stat.isFile()) continue;

		const rawContent = fs.readFileSync(filepath, 'utf-8');
		const { frontmatter, content } = parseFrontmatter(rawContent);

		agents.push({
			filename: file,
			filepath,
			frontmatter,
			content,
			rawContent,
			scope
		});
	}

	return agents;
}

// GET - List all agents (global + project, with project overriding global)
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		// Load global agents from ~/.claude/agents/
		const globalAgentsDir = path.join(os.homedir(), '.claude', 'agents');
		const globalAgents = loadAgentsFromDir(globalAgentsDir, 'global');

		// Load project agents from .claude/agents/
		const projectAgentsDir = path.join(project.path, '.claude', 'agents');
		const projectAgents = loadAgentsFromDir(projectAgentsDir, 'project');

		// Merge: project agents override global agents with same filename
		const agentMap = new Map<string, Agent>();

		// Add global agents first
		for (const agent of globalAgents) {
			agentMap.set(agent.filename, agent);
		}

		// Override with project agents
		for (const agent of projectAgents) {
			agentMap.set(agent.filename, agent);
		}

		// Convert back to array and sort
		const agents = Array.from(agentMap.values());
		agents.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));

		return json({
			agents,
			hasAgentsDir: projectAgents.length > 0 || globalAgents.length > 0,
			hasGlobalAgentsDir: fs.existsSync(globalAgentsDir),
			hasProjectAgentsDir: fs.existsSync(projectAgentsDir),
			globalCount: globalAgents.length,
			projectCount: projectAgents.length
		});
	} catch (err) {
		console.error('Error reading agents directories:', err);
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
			rawContent: content,
			scope: 'project' as const // New agents are always created in project scope
		}, { status: 201 });
	} catch (err) {
		console.error('Error creating agent file:', err);
		return json({ error: 'Failed to create agent' }, { status: 500 });
	}
};
