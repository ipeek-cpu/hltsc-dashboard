/**
 * MCP Registry API Client
 * Interacts with the official MCP Registry at registry.modelcontextprotocol.io
 */

import type { McpRegistryServer, McpRegistryResult, McpRegistrySearchResponse } from './types';

const MCP_REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0';

// Simple in-memory cache for registry results
interface CacheEntry {
	data: McpRegistrySearchResponse;
	timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): McpRegistrySearchResponse | null {
	const entry = cache.get(key);
	if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
		return entry.data;
	}
	cache.delete(key);
	return null;
}

function setCache(key: string, data: McpRegistrySearchResponse): void {
	cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Search for MCP servers in the registry
 */
export async function searchMcpServers(
	query: string,
	options?: { limit?: number; cursor?: string }
): Promise<McpRegistrySearchResponse> {
	const limit = options?.limit || 20;
	const cacheKey = `search:${query}:${limit}:${options?.cursor || ''}`;

	// Check cache
	const cached = getCached(cacheKey);
	if (cached) {
		return cached;
	}

	const params = new URLSearchParams();
	params.set('search', query);
	params.set('limit', String(limit));
	if (options?.cursor) {
		params.set('cursor', options.cursor);
	}

	const response = await fetch(`${MCP_REGISTRY_BASE}/servers?${params}`);

	if (!response.ok) {
		throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();

	// The API returns an array of server results directly, or an object with servers array
	const result = normalizeResponse(data);

	setCache(cacheKey, result);
	return result;
}

/**
 * List all MCP servers (paginated)
 */
export async function listMcpServers(
	options?: { limit?: number; cursor?: string }
): Promise<McpRegistrySearchResponse> {
	const limit = options?.limit || 20;
	const cacheKey = `list:${limit}:${options?.cursor || ''}`;

	// Check cache
	const cached = getCached(cacheKey);
	if (cached) {
		return cached;
	}

	const params = new URLSearchParams();
	params.set('limit', String(limit));
	if (options?.cursor) {
		params.set('cursor', options.cursor);
	}

	const response = await fetch(`${MCP_REGISTRY_BASE}/servers?${params}`);

	if (!response.ok) {
		throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	const result = normalizeResponse(data);

	setCache(cacheKey, result);
	return result;
}

/**
 * Get a specific MCP server by name/id
 */
export async function getMcpServer(serverId: string): Promise<McpRegistryResult | null> {
	const cacheKey = `server:${serverId}`;

	// Check if we have it in a cached list
	for (const [key, entry] of cache.entries()) {
		if (Date.now() - entry.timestamp < CACHE_TTL) {
			const found = entry.data.servers.find(
				s => s.server.name === serverId || s.server.name.toLowerCase() === serverId.toLowerCase()
			);
			if (found) {
				return found;
			}
		}
	}

	try {
		const response = await fetch(`${MCP_REGISTRY_BASE}/servers/${encodeURIComponent(serverId)}`);

		if (!response.ok) {
			if (response.status === 404) {
				return null;
			}
			throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return normalizeServerResult(data);
	} catch (err) {
		console.error(`Error fetching server ${serverId}:`, err);
		return null;
	}
}

/**
 * Normalize the API response to our expected format
 * The registry API may return data in different formats
 */
function normalizeResponse(data: unknown): McpRegistrySearchResponse {
	// If it's already in the expected format
	if (data && typeof data === 'object' && 'servers' in data) {
		const obj = data as Record<string, unknown>;
		return {
			servers: (obj.servers as McpRegistryResult[]).map(normalizeServerResult),
			metadata: {
				count: (obj.metadata as Record<string, unknown>)?.count as number || (obj.servers as unknown[]).length,
				nextCursor: (obj.metadata as Record<string, unknown>)?.nextCursor as string | undefined
			}
		};
	}

	// If it's an array of servers
	if (Array.isArray(data)) {
		return {
			servers: data.map(normalizeServerResult),
			metadata: {
				count: data.length
			}
		};
	}

	// If it's a single server
	if (data && typeof data === 'object' && 'name' in data) {
		return {
			servers: [normalizeServerResult(data)],
			metadata: { count: 1 }
		};
	}

	// Empty response
	return {
		servers: [],
		metadata: { count: 0 }
	};
}

/**
 * Normalize a single server result
 */
function normalizeServerResult(data: unknown): McpRegistryResult {
	// Handle case where the server data is wrapped in a "server" key
	if (data && typeof data === 'object') {
		const obj = data as Record<string, unknown>;

		// If it's already wrapped
		if ('server' in obj) {
			return {
				server: obj.server as McpRegistryServer,
				_meta: obj._meta as McpRegistryResult['_meta']
			};
		}

		// If it's the raw server data
		return {
			server: {
				name: obj.name as string || 'unknown',
				description: obj.description as string || '',
				repository: obj.repository as McpRegistryServer['repository'] || { url: '', source: '' },
				version: obj.version as string || '0.0.0',
				packages: obj.packages as McpRegistryServer['packages'] || []
			},
			_meta: undefined
		};
	}

	// Fallback for unexpected data
	return {
		server: {
			name: 'unknown',
			description: '',
			repository: { url: '', source: '' },
			version: '0.0.0',
			packages: []
		}
	};
}

/**
 * Get popular/recommended MCP servers
 * This returns a curated list of well-known servers
 */
export function getPopularMcpServers(): McpRegistryResult[] {
	// These are commonly used MCP servers that users might want
	return [
		{
			server: {
				name: 'filesystem',
				description: 'Read and write files on the local filesystem',
				repository: { url: 'https://github.com/modelcontextprotocol/servers', source: 'github' },
				version: '1.0.0',
				packages: [
					{
						registryType: 'npm',
						identifier: '@modelcontextprotocol/server-filesystem',
						transport: { type: 'stdio' },
						packageArguments: ['/path/to/allowed/directory']
					}
				]
			}
		},
		{
			server: {
				name: 'github',
				description: 'Interact with GitHub repositories, issues, and PRs',
				repository: { url: 'https://github.com/modelcontextprotocol/servers', source: 'github' },
				version: '1.0.0',
				packages: [
					{
						registryType: 'npm',
						identifier: '@modelcontextprotocol/server-github',
						transport: { type: 'stdio' },
						environmentVariables: ['GITHUB_PERSONAL_ACCESS_TOKEN']
					}
				]
			}
		},
		{
			server: {
				name: 'memory',
				description: 'Store and retrieve persistent memory across conversations',
				repository: { url: 'https://github.com/modelcontextprotocol/servers', source: 'github' },
				version: '1.0.0',
				packages: [
					{
						registryType: 'npm',
						identifier: '@modelcontextprotocol/server-memory',
						transport: { type: 'stdio' }
					}
				]
			}
		},
		{
			server: {
				name: 'brave-search',
				description: 'Search the web using Brave Search API',
				repository: { url: 'https://github.com/modelcontextprotocol/servers', source: 'github' },
				version: '1.0.0',
				packages: [
					{
						registryType: 'npm',
						identifier: '@modelcontextprotocol/server-brave-search',
						transport: { type: 'stdio' },
						environmentVariables: ['BRAVE_API_KEY']
					}
				]
			}
		},
		{
			server: {
				name: 'slack',
				description: 'Read and send Slack messages',
				repository: { url: 'https://github.com/modelcontextprotocol/servers', source: 'github' },
				version: '1.0.0',
				packages: [
					{
						registryType: 'npm',
						identifier: '@modelcontextprotocol/server-slack',
						transport: { type: 'stdio' },
						environmentVariables: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID']
					}
				]
			}
		}
	];
}

/**
 * Clear the cache (useful for testing or forcing refresh)
 */
export function clearCache(): void {
	cache.clear();
}
