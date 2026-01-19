<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '../../../components/Icon.svelte';
	import McpServerList from '../../../components/McpServerList.svelte';
	import McpRegistrySearch from '../../../components/McpRegistrySearch.svelte';
	import type { McpServerWithScope, McpServerConfig } from '$lib/types';
	import type { RepairSummary } from '$lib/data-repair';

	// Tab state
	type Tab = 'mcp' | 'general' | 'claude' | 'logs';
	let activeTab = $state<Tab>('mcp');

	// MCP servers state
	let globalServers = $state<McpServerWithScope[]>([]);
	let loadingGlobal = $state(true);
	let globalError = $state<string | null>(null);

	// Skill level state
	type SkillLevel = 'non-coder' | 'junior' | 'senior' | 'principal';
	let skillLevel = $state<SkillLevel | null>(null);
	let loadingSkill = $state(true);

	// Data repair state
	let projects = $state<{ id: string; name: string }[]>([]);
	let selectedProjectId = $state<string>('');
	let repairPreview = $state<RepairSummary | null>(null);
	let repairResult = $state<RepairSummary | null>(null);
	let loadingRepair = $state(false);
	let repairError = $state<string | null>(null);

	// Claude Code status
	let claudeStatus = $state<{ installed: boolean; version?: string } | null>(null);
	let loadingClaude = $state(true);

	// Logs state
	interface LogFile {
		name: string;
		path: string;
		size: number;
		sizeFormatted: string;
		modified: string;
	}
	let logFiles = $state<LogFile[]>([]);
	let logDir = $state<string>('');
	let totalLogSize = $state<string>('');
	let loadingLogs = $state(true);
	let logOperation = $state<string | null>(null);

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

	async function loadProjects() {
		try {
			const response = await fetch('/api/projects');
			if (response.ok) {
				projects = await response.json();
				if (projects.length > 0 && !selectedProjectId) {
					selectedProjectId = projects[0].id;
				}
			}
		} catch {
			// Ignore errors
		}
	}

	async function previewRepairs() {
		if (!selectedProjectId) return;

		loadingRepair = true;
		repairError = null;
		repairResult = null;

		try {
			const response = await fetch(`/api/projects/${selectedProjectId}/repair`);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to preview repairs');
			}
			repairPreview = await response.json();
		} catch (e) {
			repairError = e instanceof Error ? e.message : 'Failed to preview repairs';
		} finally {
			loadingRepair = false;
		}
	}

	async function runRepairs() {
		if (!selectedProjectId) return;

		loadingRepair = true;
		repairError = null;

		try {
			const response = await fetch(`/api/projects/${selectedProjectId}/repair`, {
				method: 'POST'
			});
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to run repairs');
			}
			repairResult = await response.json();
			repairPreview = null;
		} catch (e) {
			repairError = e instanceof Error ? e.message : 'Failed to run repairs';
		} finally {
			loadingRepair = false;
		}
	}

	async function loadLogFiles() {
		try {
			loadingLogs = true;
			const response = await fetch('/api/logs');
			if (response.ok) {
				const data = await response.json();
				logFiles = data.files;
				logDir = data.logDir;
				totalLogSize = data.totalSizeFormatted;
			}
		} catch {
			// Ignore errors
		} finally {
			loadingLogs = false;
		}
	}

	async function rotateLogs() {
		logOperation = 'rotate';
		try {
			const response = await fetch('/api/logs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'rotate' })
			});
			if (response.ok) {
				await loadLogFiles();
			}
		} catch {
			// Ignore errors
		} finally {
			logOperation = null;
		}
	}

	async function clearLogs() {
		if (!confirm('Are you sure you want to delete all log files?')) return;
		logOperation = 'clear';
		try {
			const response = await fetch('/api/logs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clear' })
			});
			if (response.ok) {
				await loadLogFiles();
			}
		} catch {
			// Ignore errors
		} finally {
			logOperation = null;
		}
	}

	function openLogDirectory() {
		// Use Electron IPC if available, otherwise alert
		if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { openPath?: (path: string) => void } }).electronAPI?.openPath) {
			(window as unknown as { electronAPI: { openPath: (path: string) => void } }).electronAPI.openPath(logDir);
		} else {
			alert(`Log directory: ${logDir}\n\nOpen this path in Finder to view log files.`);
		}
	}

	function formatDate(isoString: string): string {
		return new Date(isoString).toLocaleString();
	}

	$effect(() => {
		if (browser) {
			loadGlobalServers();
			loadSkillLevel();
			loadClaudeStatus();
			loadProjects();
			loadLogFiles();
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
		<button
			class="tab"
			class:active={activeTab === 'logs'}
			onclick={() => activeTab = 'logs'}
		>
			<Icon name="file-text" size={16} />
			Logs
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

				<section class="section">
					<h2>
						<Icon name="tool" size={18} />
						Data Repair
					</h2>
					<p class="section-description">
						Scan and repair common data issues in your beads database.
					</p>

					{#if projects.length === 0}
						<p class="empty-message">No projects found. Add a project first.</p>
					{:else}
						<div class="repair-controls">
							<select bind:value={selectedProjectId} disabled={loadingRepair}>
								{#each projects as project}
									<option value={project.id}>{project.name}</option>
								{/each}
							</select>

							<div class="repair-buttons">
								<button
									class="btn-preview"
									onclick={previewRepairs}
									disabled={loadingRepair || !selectedProjectId}
								>
									{#if loadingRepair && !repairResult}
										<Icon name="loader" size={16} />
									{:else}
										<Icon name="search" size={16} />
									{/if}
									Preview
								</button>
								<button
									class="btn-repair"
									onclick={runRepairs}
									disabled={loadingRepair || !selectedProjectId}
								>
									{#if loadingRepair && repairResult}
										<Icon name="loader" size={16} />
									{:else}
										<Icon name="zap" size={16} />
									{/if}
									Repair Data
								</button>
							</div>
						</div>

						{#if repairError}
							<div class="repair-error">
								<Icon name="alert-circle" size={16} />
								{repairError}
							</div>
						{/if}

						{#if repairPreview}
							<div class="repair-results preview">
								<h3>Preview ({repairPreview.repairs.length} repairs needed)</h3>
								<p class="repair-summary">
									Scanned {repairPreview.totalIssuesScanned} issues, {repairPreview.issuesRepaired} need repairs.
								</p>
								{#if repairPreview.repairs.length > 0}
									<div class="repair-list">
										{#each repairPreview.repairs.slice(0, 10) as repair}
											<div class="repair-item">
												<span class="repair-field">{repair.field}</span>
												<span class="repair-id">{repair.issueId}</span>
												<span class="repair-desc">{repair.description}</span>
											</div>
										{/each}
										{#if repairPreview.repairs.length > 10}
											<p class="more-items">...and {repairPreview.repairs.length - 10} more</p>
										{/if}
									</div>
								{:else}
									<p class="no-repairs">No repairs needed! Data looks good.</p>
								{/if}
							</div>
						{/if}

						{#if repairResult}
							<div class="repair-results success">
								<h3>Repair Complete</h3>
								<p class="repair-summary">
									Fixed {repairResult.repairs.length} issues across {repairResult.issuesRepaired} beads.
								</p>
								{#if repairResult.repairs.length > 0}
									<div class="repair-list">
										{#each repairResult.repairs.slice(0, 10) as repair}
											<div class="repair-item">
												<span class="repair-field">{repair.field}</span>
												<span class="repair-id">{repair.issueId}</span>
												<span class="repair-desc">{repair.description}</span>
											</div>
										{/each}
										{#if repairResult.repairs.length > 10}
											<p class="more-items">...and {repairResult.repairs.length - 10} more</p>
										{/if}
									</div>
								{/if}
								{#if repairResult.errors.length > 0}
									<div class="repair-errors">
										<h4>Errors:</h4>
										{#each repairResult.errors as err}
											<p class="error-item">{err}</p>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
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

		{:else if activeTab === 'logs'}
			<div class="tab-content">
				<section class="section">
					<h2>
						<Icon name="file-text" size={18} />
						Log Files
					</h2>
					<p class="section-description">
						Application logs are stored in <code>{logDir || '~/.beads-dashboard/'}</code>
					</p>

					<div class="log-actions">
						<button
							class="btn-action"
							onclick={openLogDirectory}
						>
							<Icon name="folder" size={16} />
							Open in Finder
						</button>
						<button
							class="btn-action"
							onclick={rotateLogs}
							disabled={logOperation !== null}
						>
							{#if logOperation === 'rotate'}
								<Icon name="loader" size={16} />
							{:else}
								<Icon name="refresh-cw" size={16} />
							{/if}
							Rotate Old Logs
						</button>
						<button
							class="btn-action danger"
							onclick={clearLogs}
							disabled={logOperation !== null}
						>
							{#if logOperation === 'clear'}
								<Icon name="loader" size={16} />
							{:else}
								<Icon name="trash-2" size={16} />
							{/if}
							Clear All
						</button>
					</div>

					{#if loadingLogs}
						<div class="loading">Loading log files...</div>
					{:else if logFiles.length === 0}
						<p class="empty-message">No log files found.</p>
					{:else}
						<div class="log-summary">
							<span>{logFiles.length} files</span>
							<span class="log-size">{totalLogSize} total</span>
						</div>
						<div class="log-list">
							{#each logFiles as file}
								<div class="log-item">
									<div class="log-name">
										<Icon name="file" size={14} />
										{file.name}
									</div>
									<div class="log-meta">
										<span class="log-size">{file.sizeFormatted}</span>
										<span class="log-date">{formatDate(file.modified)}</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="section">
					<h2>
						<Icon name="info" size={18} />
						Log Levels
					</h2>
					<p class="section-description">
						The application logs at the following levels:
					</p>
					<div class="log-levels">
						<div class="level-item">
							<span class="level-name debug">DEBUG</span>
							<span class="level-desc">Detailed diagnostic information</span>
						</div>
						<div class="level-item">
							<span class="level-name info">INFO</span>
							<span class="level-desc">General operational information</span>
						</div>
						<div class="level-item">
							<span class="level-name warn">WARN</span>
							<span class="level-desc">Warning conditions that may need attention</span>
						</div>
						<div class="level-item">
							<span class="level-name error">ERROR</span>
							<span class="level-desc">Error conditions and failures</span>
						</div>
					</div>
					<p class="log-retention">
						<Icon name="clock" size={14} />
						Logs older than 7 days are automatically cleaned up.
					</p>
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

	/* Data Repair Styles */
	.empty-message {
		color: #888888;
		font-size: 14px;
	}

	.repair-controls {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}

	.repair-controls select {
		flex: 1;
		min-width: 200px;
		padding: 10px 12px;
		font-size: 14px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		background: #ffffff;
		font-family: 'Figtree', sans-serif;
	}

	.repair-buttons {
		display: flex;
		gap: 8px;
	}

	.btn-preview,
	.btn-repair {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-preview {
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #4b5563;
	}

	.btn-preview:hover:not(:disabled) {
		background: #f5f5f5;
	}

	.btn-repair {
		background: #2563eb;
		border: 1px solid #2563eb;
		color: #ffffff;
	}

	.btn-repair:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-preview:disabled,
	.btn-repair:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.repair-error {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		padding: 12px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		font-size: 14px;
	}

	.repair-results {
		margin-top: 20px;
		padding: 16px;
		border-radius: 10px;
	}

	.repair-results.preview {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.repair-results.success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
	}

	.repair-results h3 {
		margin: 0 0 8px 0;
		font-size: 15px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.repair-summary {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: #666666;
	}

	.repair-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.repair-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: #ffffff;
		border-radius: 6px;
		font-size: 13px;
	}

	.repair-field {
		font-weight: 500;
		color: #4b5563;
		min-width: 80px;
	}

	.repair-id {
		font-family: monospace;
		font-size: 12px;
		color: #888888;
		min-width: 100px;
	}

	.repair-desc {
		color: #666666;
		flex: 1;
	}

	.more-items {
		margin: 8px 0 0 0;
		font-size: 13px;
		color: #888888;
		font-style: italic;
	}

	.no-repairs {
		margin: 0;
		font-size: 14px;
		color: #16a34a;
	}

	.repair-errors {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid #fecaca;
	}

	.repair-errors h4 {
		margin: 0 0 8px 0;
		font-size: 14px;
		color: #dc2626;
	}

	.error-item {
		margin: 4px 0;
		font-size: 13px;
		color: #dc2626;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.btn-preview:disabled :global(.icon),
	.btn-repair:disabled :global(.icon) {
		animation: spin 1s linear infinite;
	}

	/* Logs Tab Styles */
	.log-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}

	.btn-action {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #4b5563;
	}

	.btn-action:hover:not(:disabled) {
		background: #f5f5f5;
	}

	.btn-action:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-action.danger {
		color: #dc2626;
		border-color: #fecaca;
	}

	.btn-action.danger:hover:not(:disabled) {
		background: #fef2f2;
	}

	.btn-action:disabled :global(.icon) {
		animation: spin 1s linear infinite;
	}

	.log-summary {
		display: flex;
		gap: 16px;
		padding: 12px;
		background: #f8fafc;
		border-radius: 8px;
		margin-bottom: 12px;
		font-size: 14px;
		color: #666666;
	}

	.log-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.log-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		background: #ffffff;
		border: 1px solid #eaeaea;
		border-radius: 8px;
		font-size: 14px;
	}

	.log-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		color: #1a1a1a;
	}

	.log-meta {
		display: flex;
		gap: 16px;
		color: #888888;
		font-size: 13px;
	}

	.log-size {
		font-family: monospace;
	}

	.log-date {
		color: #aaaaaa;
	}

	.log-levels {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.level-item {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.level-name {
		font-family: monospace;
		font-size: 12px;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 4px;
		min-width: 60px;
		text-align: center;
	}

	.level-name.debug {
		background: #f3f4f6;
		color: #6b7280;
	}

	.level-name.info {
		background: #dbeafe;
		color: #2563eb;
	}

	.level-name.warn {
		background: #fef3c7;
		color: #d97706;
	}

	.level-name.error {
		background: #fee2e2;
		color: #dc2626;
	}

	.level-desc {
		font-size: 14px;
		color: #666666;
	}

	.log-retention {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		padding: 10px 12px;
		background: #f0f9ff;
		border-radius: 8px;
		font-size: 13px;
		color: #0369a1;
	}

</style>
