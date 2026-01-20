#!/usr/bin/env node
/**
 * MCP Server for Beads Memory
 *
 * Exposes memory operations to Claude Code:
 * - read_memory: Get scoped memories (bead -> epic -> project constraints)
 * - write_memory: Create memory entry with proper scoping
 * - search_memory: Search with relevance ranking
 *
 * Environment variables required:
 * - MEMORY_DB_PATH: Path to memory.db (e.g., /project/.beads/memory.db)
 * - PROJECT_ID: Project identifier for scoping
 *
 * NOTE: Requires @modelcontextprotocol/sdk to be installed:
 *   npm install @modelcontextprotocol/sdk
 *
 * Usage:
 *   MEMORY_DB_PATH=/path/to/.beads/memory.db PROJECT_ID=my-project node mcp-server.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { createMemoryEntry, listMemoryEntries } from './db';
import { getScopedMemories, searchMemories, rankMemories } from './retrieval';
import type { MemoryKind } from './types';
import { MEMORY_KINDS } from './types';

// ============================================================================
// Environment Configuration
// ============================================================================

const MEMORY_DB_PATH = process.env.MEMORY_DB_PATH;
const PROJECT_ID = process.env.PROJECT_ID;

if (!MEMORY_DB_PATH || !PROJECT_ID) {
	console.error('Required environment variables: MEMORY_DB_PATH, PROJECT_ID');
	console.error('Example: MEMORY_DB_PATH=/path/.beads/memory.db PROJECT_ID=my-project');
	process.exit(1);
}

// Derive project path from database path (remove /.beads/memory.db suffix)
const projectPath = MEMORY_DB_PATH.replace(/\/.beads\/memory\.db$/, '');

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
	{
		name: 'beads-memory',
		version: '1.0.0'
	},
	{
		capabilities: {
			tools: {}
		}
	}
);

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS = [
	{
		name: 'read_memory',
		description:
			'Read memories scoped to bead/epic/project. Returns relevant context from previous sessions. ' +
			'Memories are retrieved hierarchically: bead-specific first, then epic-level, then project constraints.',
		inputSchema: {
			type: 'object' as const,
			properties: {
				beadId: {
					type: 'string',
					description: 'Bead ID for bead-scoped retrieval (recommended for task context)'
				},
				epicId: {
					type: 'string',
					description: 'Epic ID for broader scope (if bead is not specified)'
				},
				kinds: {
					type: 'array',
					items: { type: 'string', enum: MEMORY_KINDS as unknown as string[] },
					description: `Filter by memory kind. Options: ${MEMORY_KINDS.join(', ')}`
				},
				limit: {
					type: 'number',
					description: 'Maximum entries to return (default: 20, max: 100)'
				}
			}
		}
	},
	{
		name: 'write_memory',
		description:
			'Write a memory entry to persist context across sessions. ' +
			'Use for decisions, checkpoints, constraints, handoff notes, action reports, or CI notes.',
		inputSchema: {
			type: 'object' as const,
			properties: {
				beadId: {
					type: 'string',
					description: 'Bead ID for bead-scoped entry (preferred for task-specific context)'
				},
				epicId: {
					type: 'string',
					description: 'Epic ID for epic-scoped entry (fallback if no bead)'
				},
				kind: {
					type: 'string',
					enum: MEMORY_KINDS as unknown as string[],
					description: `Memory type. Options: ${MEMORY_KINDS.join(', ')}`
				},
				title: {
					type: 'string',
					description: 'Brief title describing the memory (required)'
				},
				content: {
					type: 'string',
					description: 'Full content of the memory entry (markdown supported, required)'
				},
				intentAnchors: {
					type: 'array',
					items: { type: 'string' },
					description: 'Links to intent anchor paths (e.g., ["lifecycle.execute", "ux.chat"])'
				}
			},
			required: ['kind', 'title', 'content']
		}
	},
	{
		name: 'search_memory',
		description:
			'Search memories by text with relevance ranking. ' +
			'Useful for finding past decisions, notes, or context related to specific topics.',
		inputSchema: {
			type: 'object' as const,
			properties: {
				query: {
					type: 'string',
					description: 'Search text to match against titles and content (required)'
				},
				beadId: {
					type: 'string',
					description: 'Limit search to memories scoped to this bead'
				},
				kinds: {
					type: 'array',
					items: { type: 'string', enum: MEMORY_KINDS as unknown as string[] },
					description: `Filter by memory kind. Options: ${MEMORY_KINDS.join(', ')}`
				},
				limit: {
					type: 'number',
					description: 'Maximum results (default: 20, max: 100)'
				}
			},
			required: ['query']
		}
	}
];

// ============================================================================
// Request Handlers
// ============================================================================

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: TOOLS
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	try {
		switch (name) {
			case 'read_memory':
				return handleReadMemory(args as Record<string, unknown>);
			case 'write_memory':
				return handleWriteMemory(args as Record<string, unknown>);
			case 'search_memory':
				return handleSearchMemory(args as Record<string, unknown>);
			default:
				return {
					content: [{ type: 'text', text: `Unknown tool: ${name}` }],
					isError: true
				};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text', text: `Error: ${message}` }],
			isError: true
		};
	}
});

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handle read_memory tool call
 * Returns scoped memories following the hierarchy: bead -> epic -> project constraints
 */
function handleReadMemory(args: Record<string, unknown>) {
	const { beadId, epicId, kinds, limit = 20 } = args;
	const effectiveLimit = Math.min(Number(limit) || 20, 100);

	const result = getScopedMemories(projectPath, {
		projectId: PROJECT_ID!,
		beadId: beadId as string | undefined,
		epicId: epicId as string | undefined,
		kinds: kinds as MemoryKind[] | undefined,
		limit: effectiveLimit
	});

	// Combine all memories respecting the limit
	const allMemories = [
		...result.beadMemories,
		...result.epicMemories,
		...result.projectConstraints
	].slice(0, effectiveLimit);

	const response = {
		summary: {
			beadMemories: result.beadMemories.length,
			epicMemories: result.epicMemories.length,
			projectConstraints: result.projectConstraints.length,
			activeConstraints: result.activeConstraints.length,
			totalReturned: allMemories.length
		},
		memories: allMemories.map((m) => ({
			id: m.id,
			kind: m.kind,
			title: m.title,
			content: m.content,
			beadId: m.beadId,
			epicId: m.epicId,
			intentAnchors: m.intentAnchors,
			createdAt: m.createdAt
		}))
	};

	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(response, null, 2)
			}
		]
	};
}

/**
 * Handle write_memory tool call
 * Creates a new memory entry with proper scoping
 */
function handleWriteMemory(args: Record<string, unknown>) {
	const { beadId, epicId, kind, title, content, intentAnchors } = args;

	// Validate required fields
	if (!kind || typeof kind !== 'string') {
		return {
			content: [{ type: 'text', text: 'Missing required field: kind' }],
			isError: true
		};
	}
	if (!title || typeof title !== 'string') {
		return {
			content: [{ type: 'text', text: 'Missing required field: title' }],
			isError: true
		};
	}
	if (!content || typeof content !== 'string') {
		return {
			content: [{ type: 'text', text: 'Missing required field: content' }],
			isError: true
		};
	}

	// Validate kind is valid
	if (!MEMORY_KINDS.includes(kind as MemoryKind)) {
		return {
			content: [
				{
					type: 'text',
					text: `Invalid kind: ${kind}. Must be one of: ${MEMORY_KINDS.join(', ')}`
				}
			],
			isError: true
		};
	}

	// Create the memory entry
	const id = createMemoryEntry(projectPath, {
		projectId: PROJECT_ID!,
		beadId: beadId as string | undefined,
		epicId: epicId as string | undefined,
		kind: kind as MemoryKind,
		title: title as string,
		content: content as string,
		intentAnchors: intentAnchors as string[] | undefined
	});

	const response = {
		success: true,
		id,
		message: `Memory entry created with ID: ${id}`,
		scope: beadId ? `bead:${beadId}` : epicId ? `epic:${epicId}` : 'project'
	};

	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(response, null, 2)
			}
		]
	};
}

/**
 * Handle search_memory tool call
 * Searches memories by text and returns ranked results
 */
function handleSearchMemory(args: Record<string, unknown>) {
	const { query, beadId, kinds, limit = 20 } = args;
	const effectiveLimit = Math.min(Number(limit) || 20, 100);

	// Validate query
	if (!query || typeof query !== 'string') {
		return {
			content: [{ type: 'text', text: 'Missing required field: query' }],
			isError: true
		};
	}

	// Search memories
	const results = searchMemories(projectPath, {
		projectId: PROJECT_ID!,
		searchText: query as string,
		beadId: beadId as string | undefined,
		kinds: kinds as MemoryKind[] | undefined,
		limit: effectiveLimit
	});

	// Rank by relevance
	const ranked = rankMemories(results, {
		beadId: beadId as string | undefined
	});

	const response = {
		query,
		count: ranked.length,
		results: ranked.slice(0, effectiveLimit).map((m) => ({
			id: m.id,
			kind: m.kind,
			title: m.title,
			content: m.content,
			beadId: m.beadId,
			epicId: m.epicId,
			relevanceScore: m.computedScore,
			createdAt: m.createdAt
		}))
	};

	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(response, null, 2)
			}
		]
	};
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('Beads Memory MCP server running');
	console.error(`  Project: ${PROJECT_ID}`);
	console.error(`  Database: ${MEMORY_DB_PATH}`);
}

main().catch((err) => {
	console.error('MCP server error:', err);
	process.exit(1);
});
