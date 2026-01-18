import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { parseFrontmatter } from '$lib/agents';
import { PLANNER_AGENT_FILENAME, getPlannerAgentContent } from '$lib/beads-instructions';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';
import type { Agent } from '$lib/types';

/**
 * GET - Ensure planner agent exists and return it
 * Creates the agent if it doesn't exist
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const agentsDir = path.join(project.path, '.claude', 'agents');
	const plannerPath = path.join(agentsDir, PLANNER_AGENT_FILENAME);

	// Create .claude/agents directory if it doesn't exist
	if (!fs.existsSync(agentsDir)) {
		try {
			fs.mkdirSync(agentsDir, { recursive: true });
		} catch (err) {
			console.error('Error creating agents directory:', err);
			return json({ error: 'Failed to create agents directory' }, { status: 500 });
		}
	}

	// Check if planner agent exists, create if not
	let rawContent: string;
	if (!fs.existsSync(plannerPath)) {
		// Create the planner agent with default content
		rawContent = getPlannerAgentContent();
		try {
			fs.writeFileSync(plannerPath, rawContent, 'utf-8');
			console.log('[planner-agent] Created planner agent at:', plannerPath);
		} catch (err) {
			console.error('Error creating planner agent:', err);
			return json({ error: 'Failed to create planner agent' }, { status: 500 });
		}
	} else {
		// Read existing planner agent
		rawContent = fs.readFileSync(plannerPath, 'utf-8');
	}

	// Parse the agent content
	const { frontmatter, content } = parseFrontmatter(rawContent);

	const agent: Agent = {
		filename: PLANNER_AGENT_FILENAME,
		filepath: plannerPath,
		frontmatter,
		content,
		rawContent
	};

	return json({ agent });
};

/**
 * POST - Reset planner agent to default content
 * Useful if user wants to restore the default planner
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const body = await request.json();
	const { reset } = body;

	if (!reset) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	const agentsDir = path.join(project.path, '.claude', 'agents');
	const plannerPath = path.join(agentsDir, PLANNER_AGENT_FILENAME);

	// Create .claude/agents directory if it doesn't exist
	if (!fs.existsSync(agentsDir)) {
		fs.mkdirSync(agentsDir, { recursive: true });
	}

	// Write default planner content
	const rawContent = getPlannerAgentContent();
	try {
		fs.writeFileSync(plannerPath, rawContent, 'utf-8');
	} catch (err) {
		console.error('Error resetting planner agent:', err);
		return json({ error: 'Failed to reset planner agent' }, { status: 500 });
	}

	const { frontmatter, content } = parseFrontmatter(rawContent);

	const agent: Agent = {
		filename: PLANNER_AGENT_FILENAME,
		filepath: plannerPath,
		frontmatter,
		content,
		rawContent
	};

	return json({ agent, reset: true });
};
