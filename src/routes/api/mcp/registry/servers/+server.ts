/**
 * MCP Registry Servers List API
 * Lists servers from the official MCP Registry and popular curated list
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { listMcpServers, getPopularMcpServers } from '$lib/mcp-registry';

/**
 * GET - List MCP servers from registry
 * Query params: limit, cursor, popular (boolean)
 */
export async function GET({ url }: RequestEvent) {
	try {
		const limit = parseInt(url.searchParams.get('limit') || '20', 10);
		const cursor = url.searchParams.get('cursor') || undefined;
		const popular = url.searchParams.get('popular') === 'true';

		// Return curated popular servers
		if (popular) {
			const servers = getPopularMcpServers();
			return json({
				servers,
				metadata: {
					count: servers.length,
					source: 'curated'
				}
			});
		}

		// Fetch from registry
		const result = await listMcpServers({ limit, cursor });

		return json(result);
	} catch (error) {
		console.error('Registry list error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to list servers' },
			{ status: 500 }
		);
	}
}
