<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';
	import McpRegistryServerCard from './McpRegistryServerCard.svelte';
	import type { McpRegistryResult, McpServerConfig } from '$lib/types';

	let {
		onServerAdded
	}: {
		onServerAdded?: (name: string, config: McpServerConfig) => void;
	} = $props();

	let searchQuery = $state('');
	let searchResults = $state<McpRegistryResult[]>([]);
	let popularServers = $state<McpRegistryResult[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Adding state
	let addingServer = $state<string | null>(null);
	let addError = $state<string | null>(null);

	async function loadPopularServers() {
		try {
			const response = await fetch('/api/mcp/registry/servers?popular=true');
			if (response.ok) {
				const data = await response.json();
				popularServers = data.servers || [];
			}
		} catch {
			// Ignore - popular servers are optional
		}
	}

	async function search() {
		if (!searchQuery.trim()) {
			searchResults = [];
			hasSearched = false;
			return;
		}

		loading = true;
		error = null;
		hasSearched = true;

		try {
			const response = await fetch(`/api/mcp/registry/search?q=${encodeURIComponent(searchQuery.trim())}&limit=20`);
			if (!response.ok) {
				throw new Error('Search failed');
			}
			const data = await response.json();
			searchResults = data.servers || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Search failed';
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	function handleSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		searchQuery = value;

		// Debounce search
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		if (value.trim()) {
			searchTimeout = setTimeout(() => {
				search();
			}, 300);
		} else {
			searchResults = [];
			hasSearched = false;
		}
	}

	async function handleAddServer(server: McpRegistryResult) {
		const name = server.server.name;
		addingServer = name;
		addError = null;

		try {
			// Get the first package (usually npm)
			const pkg = server.server.packages[0];
			if (!pkg) {
				throw new Error('No package configuration available');
			}

			// Build the config
			let config: McpServerConfig;
			if (pkg.registryType === 'npm') {
				config = {
					type: 'stdio',
					command: 'npx',
					args: ['-y', pkg.identifier, ...(pkg.packageArguments || [])]
				};
			} else if (pkg.registryType === 'pip') {
				config = {
					type: 'stdio',
					command: 'uvx',
					args: [pkg.identifier, ...(pkg.packageArguments || [])]
				};
			} else {
				// Default to npx
				config = {
					type: 'stdio',
					command: 'npx',
					args: ['-y', pkg.identifier, ...(pkg.packageArguments || [])]
				};
			}

			// Add environment variables if specified
			if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
				config.env = {};
				for (const envVar of pkg.environmentVariables) {
					config.env[envVar] = ''; // User will need to fill these in
				}
			}

			// Add to global config
			const response = await fetch('/api/settings/mcp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, config })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to add server');
			}

			// Notify parent
			onServerAdded?.(name, config);

		} catch (e) {
			addError = e instanceof Error ? e.message : 'Failed to add server';
		} finally {
			addingServer = null;
		}
	}

	$effect(() => {
		if (browser) {
			loadPopularServers();
		}
	});
</script>

<div class="registry-search">
	<div class="search-box">
		<Icon name="search" size={18} />
		<input
			type="text"
			value={searchQuery}
			oninput={handleSearchInput}
			placeholder="Search MCP servers (e.g., github, filesystem, slack)..."
		/>
		{#if loading}
			<Icon name="loader" size={18} />
		{/if}
	</div>

	{#if addError}
		<div class="add-error">
			<Icon name="alert-circle" size={16} />
			{addError}
		</div>
	{/if}

	{#if hasSearched}
		<div class="results-section">
			<h3>Search Results</h3>
			{#if error}
				<div class="error">{error}</div>
			{:else if searchResults.length === 0}
				<div class="no-results">No servers found for "{searchQuery}"</div>
			{:else}
				<div class="results-grid">
					{#each searchResults as result (result.server.name)}
						<McpRegistryServerCard
							server={result}
							onAdd={() => handleAddServer(result)}
							adding={addingServer === result.server.name}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{:else if popularServers.length > 0}
		<div class="popular-section">
			<h3>
				<Icon name="star" size={16} />
				Popular Servers
			</h3>
			<div class="results-grid">
				{#each popularServers as result (result.server.name)}
					<McpRegistryServerCard
						server={result}
						onAdd={() => handleAddServer(result)}
						adding={addingServer === result.server.name}
					/>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.registry-search {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: #f5f5f5;
		border-radius: 10px;
		border: 1px solid transparent;
		transition: all 0.15s ease;
	}

	.search-box:focus-within {
		background: #ffffff;
		border-color: #2563eb;
	}

	.search-box input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 14px;
		font-family: inherit;
		outline: none;
	}

	.search-box input::placeholder {
		color: #888888;
	}

	.add-error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: #fee2e2;
		color: #dc2626;
		border-radius: 8px;
		font-size: 13px;
	}

	.results-section,
	.popular-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.results-section h3,
	.popular-section h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.error {
		color: #dc2626;
		font-size: 14px;
	}

	.no-results {
		color: #888888;
		font-size: 14px;
		padding: 16px 0;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 12px;
	}
</style>
