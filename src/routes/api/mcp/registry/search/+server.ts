/**
 * MCP Registry Search API
 * Proxies search requests to the official MCP Registry
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { searchMcpServers } from '$lib/mcp-registry';

/**
 * GET - Search the MCP Registry
 * Query params: q (search query), limit, cursor
 */
export async function GET({ url }: RequestEvent) {
	try {
		const query = url.searchParams.get('q') || '';
		const limit = parseInt(url.searchParams.get('limit') || '20', 10);
		const cursor = url.searchParams.get('cursor') || undefined;

		if (!query.trim()) {
			return json({ error: 'Search query (q) is required' }, { status: 400 });
		}

		const result = await searchMcpServers(query, { limit, cursor });

		return json(result);
	} catch (error) {
		console.error('Registry search error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to search registry' },
			{ status: 500 }
		);
	}
}
