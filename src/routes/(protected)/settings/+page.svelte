<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '../../../components/Icon.svelte';
	import McpServerList from '../../../components/McpServerList.svelte';
	import McpRegistrySearch from '../../../components/McpRegistrySearch.svelte';
	import type { McpServerWithScope, McpServerConfig } from '$lib/types';

	// Tab state
	type Tab = 'mcp' | 'general' | 'claude';
	let activeTab = $state<Tab>('mcp');

	// MCP servers state
	let globalServers = $state<McpServerWithScope[]>([]);
	let loadingGlobal = $state(true);
	let globalError = $state<string | null>(null);

	// Skill level state
	type SkillLevel = 'non-coder' | 'junior' | 'senior' | 'principal';
	let skillLevel = $state<SkillLevel | null>(null);
	let loadingSkill = $state(true);


	// Claude Code status
	let claudeStatus = $state<{ installed: boolean; version?: string } | null>(null);
	let loadingClaude = $state(true);

	async function loadGlobalServers() {
		try {
			loadingGlobal = true;
			globalError = null;
			const response = await fetch('/api/settings/mcp');
			if (!response.ok) {
				throw new Error('Failed to load MCP servers');
			}
			const data = await response.json();

			// Convert to McpServerWithScope format
			globalServers = Object.entries(data.servers).map(([name, config]) => ({
				name,
				config: config as McpServerConfig,
				scope: 'global' as const,
				source: '~/.claude.json'
			}));
		} catch (e) {
			globalError = e instanceof Error ? e.message : 'Failed to load servers';
		} finally {
			loadingGlobal = false;
		}
	}

	async function loadSkillLevel() {
		try {
			loadingSkill = true;
			const response = await fetch('/api/settings/skill-level');
			if (response.ok) {
				const data = await response.json();
				skillLevel = data.level || null;
			}
		} catch {
			// Ignore errors
		} finally {
			loadingSkill = false;
		}
	}

	async function loadClaudeStatus() {
		try {
			loadingClaude = true;
			const response = await fetch('/api/claude-code/status');
			if (response.ok) {
				claudeStatus = await response.json();
			}
		} catch {
			claudeStatus = null;
		} finally {
			loadingClaude = false;
		}
	}

	async function setSkillLevel(level: SkillLevel) {
		try {
			const response = await fetch('/api/settings/skill-level', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ level })
			});
			if (response.ok) {
				skillLevel = level;
			}
		} catch {
			// Ignore errors
		}
	}


	async function handleServerAdded(name: string, config: McpServerConfig) {
		// Add to local state immediately
		globalServers = [...globalServers, {
			name,
			config,
			scope: 'global',
			source: '~/.claude.json'
		}];
	}

	async function handleServerDeleted(name: string) {
		try {
			const response = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(name)}`, {
				method: 'DELETE'
			});
			if (response.ok) {
				globalServers = globalServers.filter(s => s.name !== name);
			}
		} catch (e) {
			console.error('Failed to delete server:', e);
		}
	}

	$effect(() => {
		if (browser) {
			loadGlobalServers();
			loadSkillLevel();
			loadClaudeStatus();
		}
	});
</script>

<svelte:head>
	<title>Settings - Beads Dashboard</title>
</svelte:head>

<div class="page">
	<header>
		<div class="header-left">
			<a href="/" class="back-link">
				<Icon name="arrow-left" size={20} />
			</a>
			<Icon name="settings" size={24} />
			<h1>Settings</h1>
		</div>
	</header>

	<div class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'mcp'}
			onclick={() => activeTab = 'mcp'}
		>
			<Icon name="cpu" size={16} />
			MCP Servers
		</button>
		<button
			class="tab"
			class:active={activeTab === 'general'}
			onclick={() => activeTab = 'general'}
		>
			<Icon name="sliders" size={16} />
			General
		</button>
		<button
			class="tab"
			class:active={activeTab === 'claude'}
			onclick={() => activeTab = 'claude'}
		>
			<Icon name="terminal" size={16} />
			Claude Code
		</button>
	</div>

	<main>
		{#if activeTab === 'mcp'}
			<div class="tab-content">
				<section class="section">
					<h2>
						<Icon name="search" size={18} />
						Discover MCP Servers
					</h2>
					<p class="section-description">
						Search the official MCP Registry to find and install servers.
					</p>
					<McpRegistrySearch onServerAdded={handleServerAdded} />
				</section>

				<section class="section">
					<h2>
						<Icon name="globe" size={18} />
						Global Servers
					</h2>
					<p class="section-description">
						These servers are available to all projects. Stored in <code>~/.claude.json</code>
					</p>
					{#if loadingGlobal}
						<div class="loading">Loading servers...</div>
					{:else if globalError}
						<div class="error">{globalError}</div>
					{:else}
						<McpServerList
							servers={globalServers}
							onDelete={handleServerDeleted}
							emptyMessage="No global MCP servers configured"
						/>
					{/if}
				</section>
			</div>

		{:else if activeTab === 'general'}
			<div class="tab-content">
				<section class="section">
					<h2>
						<Icon name="user" size={18} />
						Skill Level
					</h2>
					<p class="section-description">
						Your coding experience level affects how Claude responds to you.
					</p>
					{#if loadingSkill}
						<div class="loading">Loading...</div>
					{:else}
						<div class="skill-options">
							{#each [
								{ value: 'non-coder', label: 'Non-Coder', desc: 'Simple explanations, no jargon' },
								{ value: 'junior', label: 'Junior', desc: 'Learning, needs guidance' },
								{ value: 'senior', label: 'Senior', desc: 'Experienced, concise responses' },
								{ value: 'principal', label: 'Principal', desc: 'Expert, minimal explanation' }
							] as option}
								<button
									class="skill-option"
									class:selected={skillLevel === option.value}
									onclick={() => setSkillLevel(option.value as SkillLevel)}
								>
									<span class="skill-label">{option.label}</span>
									<span class="skill-desc">{option.desc}</span>
								</button>
							{/each}
						</div>
					{/if}
				</section>

			</div>

		{:else if activeTab === 'claude'}
			<div class="tab-content">
				<section class="section">
					<h2>
						<Icon name="terminal" size={18} />
						Claude Code Status
					</h2>
					{#if loadingClaude}
						<div class="loading">Checking status...</div>
					{:else if claudeStatus}
						<div class="status-card">
							<div class="status-row">
								<span class="status-label">Status</span>
								<span class="status-value" class:success={claudeStatus.installed}>
									{claudeStatus.installed ? 'Installed' : 'Not Installed'}
								</span>
							</div>
							{#if claudeStatus.version}
								<div class="status-row">
									<span class="status-label">Version</span>
									<span class="status-value">{claudeStatus.version}</span>
								</div>
							{/if}
							<div class="status-row">
								<span class="status-label">Location</span>
								<code class="status-path">~/.beads-dashboard/bin/claude</code>
							</div>
						</div>
					{:else}
						<div class="error">Unable to check Claude Code status</div>
					{/if}
				</section>
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		background: #fafafa;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
		color: #1a1a1a;
	}

	.back-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		color: #666666;
		transition: all 0.15s ease;
	}

	.back-link:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
	}

	.tabs {
		display: flex;
		gap: 4px;
		padding: 12px 24px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border: none;
		background: transparent;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #666666;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.tab:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.tab.active {
		background: #1a1a1a;
		color: #ffffff;
	}

	main {
		padding: 24px;
		max-width: 800px;
		margin: 0 auto;
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.section {
		background: #ffffff;
		border-radius: 12px;
		padding: 24px;
		border: 1px solid #eaeaea;
	}

	.section h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px 0;
		font-size: 16px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.section-description {
		margin: 0 0 16px 0;
		font-size: 14px;
		color: #666666;
	}

	.section-description code {
		background: #f5f5f5;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 13px;
	}

	.loading {
		color: #888888;
		font-size: 14px;
		padding: 16px 0;
	}

	.error {
		color: #dc2626;
		font-size: 14px;
		padding: 16px 0;
	}

	.skill-options {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.skill-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 16px;
		border: 1px solid #eaeaea;
		border-radius: 10px;
		background: #ffffff;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		font-family: 'Figtree', sans-serif;
	}

	.skill-option:hover {
		border-color: #d0d0d0;
		background: #fafafa;
	}

	.skill-option.selected {
		border-color: #2563eb;
		background: #eff6ff;
	}

	.skill-label {
		font-size: 14px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.skill-desc {
		font-size: 13px;
		color: #666666;
	}

	.skill-option.selected .skill-label {
		color: #2563eb;
	}

	.status-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		background: #fafafa;
		border-radius: 8px;
	}

	.status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.status-label {
		font-size: 14px;
		color: #666666;
	}

	.status-value {
		font-size: 14px;
		font-weight: 500;
		color: #1a1a1a;
	}

	.status-value.success {
		color: #16a34a;
	}

	.status-path {
		font-size: 13px;
		background: #ffffff;
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #eaeaea;
	}

</style>
