<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import type { Issue, Event, StreamMessage, ProjectInfo, IssueWithDetails, Agent, BoardFilter } from '$lib/types';
	import type { SessionPrompt } from '$lib/prompt-types';
	import type { KnownIssue } from '$lib/session-context-types';
	import KanbanColumn from '../../../../components/KanbanColumn.svelte';
	import EventFeed from '../../../../components/EventFeed.svelte';
	import TabSwitcher from '../../../../components/TabSwitcher.svelte';
	import EpicsView from '../../../../components/EpicsView.svelte';
	import IssueDetailSheet from '../../../../components/IssueDetailSheet.svelte';
	import AgentsView from '../../../../components/AgentsView.svelte';
	import AgentTasksView from '../../../../components/AgentTasksView.svelte';
	import AgentEditSheet from '../../../../components/AgentEditSheet.svelte';
	import BoardFilterComponent from '../../../../components/BoardFilter.svelte';
	import ChatSheet from '../../../../components/ChatSheet.svelte';
	import TaskRunnerPanel from '../../../../components/TaskRunnerPanel.svelte';
	import Icon from '../../../../components/Icon.svelte';
	import VersionHistoryView from '../../../../components/VersionHistoryView.svelte';
	import HistoryTabView from '../../../../components/HistoryTabView.svelte';
	import LiveEditMode from '../../../../components/LiveEditMode.svelte';
	import OrchestrationView from '../../../../components/OrchestrationView.svelte';
	import PromptEditor from '../../../../components/PromptEditor.svelte';
	import KnownIssuesPanel from '../../../../components/KnownIssuesPanel.svelte';
	import BeadsListView from '../../../../components/BeadsListView.svelte';
	import PlanningView from '../../../../components/PlanningView.svelte';
	import ExecutionView from '../../../../components/ExecutionView.svelte';
	import type { ListFilters } from '../../../../components/BeadsListFilters.svelte';

	let project: ProjectInfo | null = $state(null);
	let issues: Issue[] = $state([]);
	let events: Event[] = $state([]);
	let connected = $state(false);
	let dataVersion = $state(0);
	let recentlyChanged: Set<string> = $state(new Set());
	let eventSource: EventSource | null = null;
	let loadError = $state<string | null>(null);

	// Tab and detail sheet state
	let activeTab: 'board' | 'epics' | 'agents' | 'planning' | 'execution' | 'orchestration' | 'history' | 'settings' = $state('board');
	let selectedIssueId = $state<string | null>(null);
	let selectedIssue = $state<IssueWithDetails | null>(null);
	let sheetOpen = $state(false);

	// Settings/Prompts state
	let prompts = $state<SessionPrompt[]>([]);
	let startPrompt = $state<SessionPrompt | null>(null);
	let endPrompt = $state<SessionPrompt | null>(null);
	let hasPromptsDir = $state(false);
	let promptsFetched = $state(false);

	// Known issues state
	let knownIssues = $state<KnownIssue[]>([]);
	let knownIssuesFetched = $state(false);

	// Navigation history for back button
	let issueHistory = $state<string[]>([]);

	// Agents state
	let agents: Agent[] = $state([]);
	let hasAgentsDir = $state(false);
	let loadingAgents = $state(false);
	let agentsFetched = $state(false);
	let selectedAgent = $state<Agent | null>(null);
	let agentTasksViewOpen = $state(false);
	let agentEditSheetOpen = $state(false);
	let chatSheetOpen = $state(false);
	let chatAgent = $state<Agent | null>(null);

	// Task runner state
	let taskRunnerOpen = $state(false);
	let taskRunnerIssue = $state<Issue | null>(null);
	let taskRunnerMode = $state<'autonomous' | 'guided'>('autonomous');
	let activeRuns = $state<Array<{ id: string; issueId: string; status: string }>>([]);

	// Live Edit state
	let liveEditOpen = $state(false);

	// Dev server state
	let devServerStatus = $state<'stopped' | 'starting' | 'running' | 'error'>('stopped');
	let devServerPort = $state<number | null>(null);
	let hasDevConfig = $state(false);

	// Board filter state
	let boardFilter: BoardFilter = $state({ type: 'all' });

	// List view state
	let showListView = $state(false);
	let listViewFilters = $state<Partial<ListFilters> | null>(null);

	// Git status for unsaved changes banner
	let hasUnsavedChanges = $state(false);
	let unsavedChangeCount = $state(0);

	const columns = [
		{ title: 'Open', status: 'open' },
		{ title: 'Ready', status: 'ready' },
		{ title: 'In Progress', status: 'in_progress' },
		{ title: 'In Review', status: 'in_review' },
		{ title: 'Blocked', status: 'blocked' },
		{ title: 'Closed', status: 'closed' }
	];

	let connectionRetries = 0;
	const MAX_RETRIES = 5;

	function connectToStream(projectId: string) {
		console.log(`[Client] Connecting to stream for project: ${projectId}`);
		eventSource = new EventSource(`/api/projects/${projectId}/stream`);

		eventSource.onopen = () => {
			console.log(`[Client] Stream opened for project: ${projectId}`);
			connected = true;
			loadError = null;
			connectionRetries = 0; // Reset on successful connection
		};

		eventSource.onmessage = (event) => {
			try {
				const data: StreamMessage = JSON.parse(event.data);
				console.log(`[Client] Received message type: ${data.type}`);

				if (data.type === 'waiting') {
					// Database is still initializing - just wait
					// The connection is still alive, don't show error
					return;
				} else if (data.type === 'error') {
					// Server sent an error message
					console.log(`[Client] Server error: ${data.message}`);
					loadError = data.message || 'Connection error';
					eventSource?.close();
					return;
				} else if (data.type === 'init') {
					console.log(`[Client] Init received for project: ${data.project?.name}`);
					if (data.project) {
						project = data.project;
					}
					issues = data.issues;
					dataVersion = data.dataVersion;
					loadError = null; // Clear any error on successful init
				} else if (data.type === 'update') {
					// Track which issues changed
					const oldIds = new Set(issues.map((i) => i.id));
					const newIds = new Set(data.issues.map((i) => i.id));

					// Find changed issues
					const changedIds = new Set<string>();
					for (const issue of data.issues) {
						const oldIssue = issues.find((i) => i.id === issue.id);
						if (!oldIssue || oldIssue.updated_at !== issue.updated_at) {
							changedIds.add(issue.id);
						}
					}

					// Also mark new issues
					for (const id of newIds) {
						if (!oldIds.has(id)) {
							changedIds.add(id);
						}
					}

					issues = data.issues;
					dataVersion = data.dataVersion;

					if (data.events) {
						events = [...data.events, ...events].slice(0, 100);
					}

					// Highlight changed issues briefly
					recentlyChanged = changedIds;
					setTimeout(() => {
						recentlyChanged = new Set();
					}, 2000);
				}
			} catch (e) {
				console.error('Failed to parse stream message:', e);
			}
		};

		eventSource.onerror = (e) => {
			console.log(`[Client] EventSource error, retry ${connectionRetries + 1}/${MAX_RETRIES}`, e);
			connected = false;
			eventSource?.close();

			connectionRetries++;

			if (connectionRetries < MAX_RETRIES) {
				// Retry with exponential backoff (500ms, 1s, 2s, 4s, 8s)
				const delay = Math.min(500 * Math.pow(2, connectionRetries - 1), 8000);
				console.log(`[Client] Retrying in ${delay}ms`);
				setTimeout(() => connectToStream(projectId), delay);
			} else {
				// Give up after max retries
				console.log(`[Client] Max retries reached, showing error`);
				loadError = 'Project not found or unable to connect';
			}
		};
	}

	$effect(() => {
		if (browser) {
			const projectId = $page.params.id;
			console.log(`[Client] Effect running, projectId: ${projectId}, url: ${$page.url.pathname}`);

			// Guard against undefined projectId during navigation
			if (!projectId || projectId === 'undefined') {
				console.log(`[Client] Skipping connection - invalid projectId`);
				return;
			}

			connectionRetries = 0; // Reset retries for new project
			loadError = null;
			connectToStream(projectId);
			return () => {
				eventSource?.close();
			};
		}
	});

	let openCount = $derived(issues.filter((i) => i.status === 'open').length);
	let inProgressCount = $derived(issues.filter((i) => i.status === 'in_progress').length);
	let inReviewCount = $derived(issues.filter((i) => i.status === 'in_review').length);

	// Derive the active run ID for the selected issue
	let selectedIssueActiveRunId = $derived(() => {
		if (!selectedIssueId) return null;
		const run = activeRuns.find(r => r.issueId === selectedIssueId && (r.status === 'running' || r.status === 'queued' || r.status === 'paused'));
		return run?.id || null;
	});

	// Fetch active task runs
	async function fetchActiveRuns() {
		try {
			const projectId = $page.params.id;
			const response = await fetch(`/api/projects/${projectId}/task-runner`);
			if (response.ok) {
				const data = await response.json();
				activeRuns = data.runs || [];
			}
		} catch (err) {
			console.error('Error fetching active runs:', err);
		}
	}

	// Poll for active runs when task runner is open or sheet is open
	$effect(() => {
		if (browser && (taskRunnerOpen || sheetOpen)) {
			// Initial fetch
			fetchActiveRuns();
			// Poll every 2 seconds
			const interval = setInterval(fetchActiveRuns, 2000);
			return () => clearInterval(interval);
		}
	});

	// Handle issue card click - open detail sheet
	async function handleIssueClick(issueId: string) {
		// If sheet is already open and we're navigating to a different issue, push current to history
		if (sheetOpen && selectedIssueId && selectedIssueId !== issueId) {
			issueHistory = [...issueHistory, selectedIssueId];
		}

		selectedIssueId = issueId;
		sheetOpen = true;
		selectedIssue = null; // Clear previous while loading

		try {
			const projectId = $page.params.id;
			const response = await fetch(`/api/projects/${projectId}/issues/${issueId}`);
			if (response.ok) {
				selectedIssue = await response.json();
			} else {
				console.error('Failed to fetch issue details');
			}
		} catch (err) {
			console.error('Error fetching issue details:', err);
		}
	}

	// Navigate back to previous issue
	async function handleBack() {
		if (issueHistory.length === 0) return;

		const previousId = issueHistory[issueHistory.length - 1];
		issueHistory = issueHistory.slice(0, -1);

		selectedIssueId = previousId;
		selectedIssue = null;

		try {
			const projectId = $page.params.id;
			const response = await fetch(`/api/projects/${projectId}/issues/${previousId}`);
			if (response.ok) {
				selectedIssue = await response.json();
			}
		} catch (err) {
			console.error('Error fetching issue details:', err);
		}
	}

	function handleSheetClose() {
		sheetOpen = false;
		selectedIssueId = null;
		issueHistory = []; // Clear history when closing
	}

	function handleTabChange(tab: 'board' | 'epics' | 'agents' | 'planning' | 'execution' | 'orchestration' | 'history' | 'settings') {
		activeTab = tab;
	}

	// Handle issue update from detail sheet
	function handleIssueUpdate(updatedIssue: IssueWithDetails) {
		// Update the issue in the list
		issues = issues.map(issue =>
			issue.id === updatedIssue.id
				? { ...issue, title: updatedIssue.title, description: updatedIssue.description, updated_at: updatedIssue.updated_at }
				: issue
		);
		// Update the selected issue in the sheet
		selectedIssue = updatedIssue;
	}

	// Handle issue deletion from detail sheet
	function handleIssueDelete(deletedIds: string[]) {
		// Remove deleted issues from the list
		const deletedSet = new Set(deletedIds);
		issues = issues.filter(issue => !deletedSet.has(issue.id));
		// Clear history of any deleted issues
		issueHistory = issueHistory.filter(id => !deletedSet.has(id));
	}

	// Fetch agents when switching to agents tab
	async function fetchAgents() {
		const projectId = $page.params.id;
		if (!projectId) return;

		loadingAgents = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/agents`);
			if (response.ok) {
				const data = await response.json();
				agents = data.agents || [];
				hasAgentsDir = data.hasAgentsDir ?? false;
			}
		} catch (err) {
			console.error('Error fetching agents:', err);
		} finally {
			loadingAgents = false;
			agentsFetched = true;
		}
	}

	// Fetch prompts when switching to settings tab
	async function fetchPrompts() {
		const projectId = $page.params.id;
		if (!projectId) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/prompts`);
			if (response.ok) {
				const data = await response.json();
				prompts = data.prompts || [];
				startPrompt = data.startPrompt || null;
				endPrompt = data.endPrompt || null;
				hasPromptsDir = data.hasPromptsDir ?? false;
			}
		} catch (err) {
			console.error('Error fetching prompts:', err);
		} finally {
			promptsFetched = true;
		}
	}

	// Check git status for unsaved changes
	async function checkGitStatus() {
		const projectId = $page.params.id;
		if (!projectId) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/git/status`);
			if (response.ok) {
				const data = await response.json();
				hasUnsavedChanges = data.hasChanges || false;
				unsavedChangeCount = (data.staged?.length || 0) + (data.unstaged?.length || 0) + (data.untracked?.length || 0);
			}
		} catch (err) {
			// Git might not be initialized - that's ok
			hasUnsavedChanges = false;
		}
	}

	// Check git status periodically and on tab change away from history
	$effect(() => {
		if (browser && activeTab !== 'history') {
			checkGitStatus();
			const interval = setInterval(checkGitStatus, 30000); // Check every 30s
			return () => clearInterval(interval);
		}
	});

	// Fetch agents when tab changes to agents, planning, or execution
	$effect(() => {
		if (browser && (activeTab === 'agents' || activeTab === 'planning' || activeTab === 'execution') && !agentsFetched && !loadingAgents) {
			fetchAgents();
		}
	});

	// Fetch prompts when tab changes to settings
	$effect(() => {
		if (browser && activeTab === 'settings' && !promptsFetched) {
			fetchPrompts();
		}
	});

	// Fetch known issues when tab changes to settings
	async function fetchKnownIssues() {
		const projectId = $page.params.id;
		if (!projectId) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/known-issues`);
			if (response.ok) {
				const data = await response.json();
				knownIssues = data.issues || [];
			}
		} catch (err) {
			console.error('Error fetching known issues:', err);
		} finally {
			knownIssuesFetched = true;
		}
	}

	$effect(() => {
		if (browser && activeTab === 'settings' && !knownIssuesFetched) {
			fetchKnownIssues();
		}
	});

	// Agent handlers
	function handleAgentClick(agent: Agent) {
		selectedAgent = agent;
		agentTasksViewOpen = true;
	}

	function handleAgentTasksBack() {
		agentTasksViewOpen = false;
		selectedAgent = null;
	}

	function handleAgentEdit() {
		agentEditSheetOpen = true;
	}

	function handleAgentEditClose() {
		agentEditSheetOpen = false;
	}

	function handleAgentSave(updatedAgent: Agent) {
		// Update in list
		agents = agents.map(a =>
			a.filename === updatedAgent.filename ? updatedAgent : a
		);
		selectedAgent = updatedAgent;
	}

	function handleAgentChat() {
		chatAgent = selectedAgent;
		chatSheetOpen = true;
	}

	function handleChatClose() {
		chatSheetOpen = false;
		chatAgent = null;
	}

	function handleGeneralChat() {
		chatAgent = null; // No agent = general mode
		chatSheetOpen = true;
	}

	// Planner chat - fetch/create planner agent and open chat
	let plannerLoading = $state(false);
	async function handlePlannerChat() {
		const projectId = $page.params.id;
		if (!projectId || plannerLoading) return;

		plannerLoading = true;
		try {
			// This endpoint ensures the planner agent exists (creates if missing)
			const response = await fetch(`/api/projects/${projectId}/planner-agent`);
			if (response.ok) {
				const data = await response.json();
				chatAgent = data.agent;
				chatSheetOpen = true;
			} else {
				console.error('Failed to get planner agent');
			}
		} catch (err) {
			console.error('Error fetching planner agent:', err);
		} finally {
			plannerLoading = false;
		}
	}

	// Task runner handlers
	function handleStartTask(issue: Issue, mode: 'autonomous' | 'guided') {
		taskRunnerIssue = issue;
		taskRunnerMode = mode;
		taskRunnerOpen = true;
		// Close the detail sheet
		sheetOpen = false;
	}

	function handleChatTask(issue: Issue) {
		// Start in guided mode
		handleStartTask(issue, 'guided');
	}

	function handleTaskRunnerClose() {
		taskRunnerOpen = false;
		taskRunnerIssue = null;
		// Refresh active runs
		fetchActiveRuns();
	}

	async function handleStopTask(runId: string) {
		try {
			const projectId = $page.params.id;
			const response = await fetch(`/api/projects/${projectId}/task-runner/${runId}/stop`, {
				method: 'POST'
			});
			if (response.ok) {
				// Refresh active runs
				await fetchActiveRuns();
			}
		} catch (err) {
			console.error('Error stopping task:', err);
		}
	}

	// Board filter
	function handleBoardFilterChange(filter: BoardFilter) {
		boardFilter = filter;
	}

	// List view handlers
	function openListView(filters?: Partial<ListFilters>) {
		listViewFilters = filters || null;
		showListView = true;
	}

	function closeListView() {
		showListView = false;
		listViewFilters = null;
	}

	function handleStatClick(status: string) {
		openListView({ status });
	}

	// Live Edit handlers
	function handleLiveEditOpen() {
		liveEditOpen = true;
	}

	function handleLiveEditClose() {
		liveEditOpen = false;
		// Refresh dev server status when closing live edit
		checkDevServerStatus();
	}

	// Dev server handlers
	async function checkDevServerStatus() {
		const projectId = $page.params.id;
		if (!projectId) return;

		try {
			// Check if config exists
			const configResponse = await fetch(`/api/projects/${projectId}/dev-config`);
			if (configResponse.ok) {
				const configData = await configResponse.json();
				hasDevConfig = configData.hasConfig || false;

				if (hasDevConfig) {
					// Check server status
					const statusResponse = await fetch(`/api/projects/${projectId}/dev-server/status`);
					if (statusResponse.ok) {
						const statusData = await statusResponse.json();
						if (statusData.status?.running) {
							devServerStatus = 'running';
							devServerPort = statusData.status.port || configData.config?.defaultPort || null;
						} else {
							devServerStatus = 'stopped';
							devServerPort = configData.config?.defaultPort || null;
						}
					}
				}
			}
		} catch (err) {
			console.error('Error checking dev server status:', err);
		}
	}

	async function handleStartDevServer() {
		const projectId = $page.params.id;
		if (!projectId) return;

		devServerStatus = 'starting';
		try {
			const response = await fetch(`/api/projects/${projectId}/dev-server/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const data = await response.json();

			if (response.status === 409 && data.portConflict) {
				// Port conflict - open Live Edit to handle it
				devServerStatus = 'stopped';
				liveEditOpen = true;
				return;
			}

			if (data.success) {
				devServerStatus = 'running';
				devServerPort = data.status?.port || devServerPort;
			} else {
				devServerStatus = 'error';
			}
		} catch (err) {
			console.error('Error starting dev server:', err);
			devServerStatus = 'error';
		}
	}

	async function handleStopDevServer() {
		const projectId = $page.params.id;
		if (!projectId) return;

		try {
			await fetch(`/api/projects/${projectId}/dev-server/stop`, {
				method: 'POST'
			});
			devServerStatus = 'stopped';
		} catch (err) {
			console.error('Error stopping dev server:', err);
		}
	}

	// Check dev server status on load and periodically
	$effect(() => {
		if (browser && project) {
			checkDevServerStatus();
			const interval = setInterval(checkDevServerStatus, 5000);
			return () => clearInterval(interval);
		}
	});

	// Filtered issues for board
	let filteredIssues = $derived.by(() => {
		if (boardFilter.type === 'all') {
			return issues;
		}
		const agentName = boardFilter.name;
		return issues.filter(i => i.assignee === agentName);
	});
</script>

<svelte:head>
	<title>{project?.name || 'Project'} - Beads Dashboard</title>
</svelte:head>

<div class="dashboard">
	<header>
		<div class="header-left">
			<a href="/" class="back-link">← Projects</a>
			<h1>{project?.name || 'Loading...'}</h1>
			<div class="connection-status" class:connected>
				<span class="status-dot"></span>
				{connected ? 'Live' : 'Connecting...'}
			</div>
		</div>
		<div class="header-actions">
			{#if hasDevConfig}
				{#if devServerStatus === 'running'}
					<button class="server-btn running" onclick={handleStopDevServer} title="Stop dev server">
						<Icon name="square" size={16} />
						<span>Stop Server</span>
						{#if devServerPort}
							<span class="port-badge">:{devServerPort}</span>
						{/if}
					</button>
				{:else if devServerStatus === 'starting'}
					<button class="server-btn starting" disabled>
						<Icon name="loader" size={16} />
						<span>Starting...</span>
					</button>
				{:else}
					<button class="server-btn" onclick={handleStartDevServer} title="Start dev server">
						<Icon name="play" size={16} />
						<span>Start Server</span>
					</button>
				{/if}
			{/if}
			<button class="live-edit-btn" onclick={handleLiveEditOpen} title="Live edit with Claude">
				<Icon name="zap" size={20} />
				<span>Live Edit</span>
			</button>
			<button class="plan-btn" onclick={handlePlannerChat} title="Plan features and create issues" disabled={plannerLoading}>
				<Icon name="clipboard" size={20} />
				<span>{plannerLoading ? 'Loading...' : 'Plan'}</span>
			</button>
			<button class="chat-btn" onclick={handleGeneralChat} title="Chat with Claude">
				<Icon name="message-circle" size={20} />
				<span>Chat</span>
			</button>
		</div>
		<div class="header-stats">
			<button class="stat stat-clickable" onclick={() => handleStatClick('open')}>
				<span class="stat-value">{openCount}</span>
				<span class="stat-label">Open</span>
			</button>
			<button class="stat stat-clickable" onclick={() => handleStatClick('in_progress')}>
				<span class="stat-value">{inProgressCount}</span>
				<span class="stat-label">In Progress</span>
			</button>
			<button class="stat stat-clickable" onclick={() => handleStatClick('in_review')}>
				<span class="stat-value in-review">{inReviewCount}</span>
				<span class="stat-label">In Review</span>
			</button>
			<button class="stat stat-clickable" onclick={() => openListView()}>
				<span class="stat-value">{issues.length}</span>
				<span class="stat-label">Total</span>
			</button>
		</div>
	</header>

	{#if hasUnsavedChanges && activeTab !== 'history'}
		<button class="unsaved-banner" onclick={() => handleTabChange('history')}>
			<Icon name="alert-circle" size={16} />
			<span>{unsavedChangeCount} unsaved change{unsavedChangeCount !== 1 ? 's' : ''}</span>
			<span class="banner-action">View in History →</span>
		</button>
	{/if}

	{#if loadError}
		<div class="error-banner">
			<p>{loadError}</p>
			<a href="/" class="error-link">← Back to Projects</a>
		</div>
	{:else}
		<div class="tab-row">
			<TabSwitcher {activeTab} ontabchange={handleTabChange} />
			{#if activeTab === 'board' && agents.length > 0}
				<BoardFilterComponent
					{agents}
					value={boardFilter}
					onchange={handleBoardFilterChange}
				/>
			{/if}
		</div>

		<main>
			{#if activeTab === 'board'}
				<div class="board-container">
					<div class="kanban-board">
						{#each columns as column}
							<KanbanColumn
								title={column.title}
								status={column.status}
								issues={filteredIssues}
								{recentlyChanged}
								onissueclick={handleIssueClick}
							/>
						{/each}
					</div>

					<aside>
						<EventFeed {events} />
					</aside>
				</div>
			{:else if activeTab === 'epics'}
				<div class="epics-container">
					<EpicsView {issues} onissueclick={handleIssueClick} />
				</div>
			{:else if activeTab === 'agents'}
				<div class="agents-container">
					{#if agentTasksViewOpen && selectedAgent}
						<AgentTasksView
							agent={selectedAgent}
							{issues}
							onback={handleAgentTasksBack}
							onedit={handleAgentEdit}
							onchat={handleAgentChat}
							onissueclick={handleIssueClick}
						/>
					{:else}
						<AgentsView
							{agents}
							{issues}
							{hasAgentsDir}
							loading={loadingAgents}
							projectId={$page.params.id}
							onagentclick={handleAgentClick}
							onagentschange={() => fetchAgents()}
							onopenchat={handleGeneralChat}
						/>
					{/if}
				</div>
			{:else if activeTab === 'planning'}
				<div class="planning-container">
					<PlanningView
						{issues}
						{agents}
						projectId={$page.params.id}
						onissueclick={handleIssueClick}
						onchat={(agent) => {
							chatAgent = agent;
							chatSheetOpen = true;
						}}
					/>
				</div>
			{:else if activeTab === 'execution'}
				<div class="execution-container">
					<ExecutionView
						{issues}
						{agents}
						projectId={$page.params.id}
						{activeRuns}
						onissueclick={handleIssueClick}
						onchat={(agent) => {
							chatAgent = agent;
							chatSheetOpen = true;
						}}
						onstarttask={handleStartTask}
						onstoptask={handleStopTask}
					/>
				</div>
			{:else if activeTab === 'orchestration'}
				<div class="orchestration-container">
					<OrchestrationView
						projectId={$page.params.id}
						isVisible={activeTab === 'orchestration'}
					/>
				</div>
			{:else if activeTab === 'history'}
				<div class="history-container">
					<HistoryTabView projectId={$page.params.id} />
				</div>
			{:else if activeTab === 'settings'}
				<div class="settings-container">
					<div class="settings-section">
						<h2>Known Issues</h2>
						<p class="settings-description">
							Track known issues, CI failures, blockers, and notes. Active issues are
							automatically injected into new chat sessions so Claude doesn't attempt to fix them
							unless instructed.
						</p>
						<KnownIssuesPanel
							issues={knownIssues}
							projectId={$page.params.id}
							onupdate={fetchKnownIssues}
						/>
					</div>

					<div class="settings-section">
						<h2>Session Prompts</h2>
						<p class="settings-description">
							Configure prompts that are automatically injected at session start and end.
							Start prompts help initialize context, while end prompts help preserve knowledge
							across sessions.
						</p>
						<PromptEditor
							{prompts}
							{startPrompt}
							{endPrompt}
							{hasPromptsDir}
							projectId={$page.params.id}
							onupdate={fetchPrompts}
						/>
					</div>
				</div>
			{/if}
		</main>
	{/if}

	<IssueDetailSheet
		issue={selectedIssue}
		isOpen={sheetOpen}
		onclose={handleSheetClose}
		onissueclick={handleIssueClick}
		onback={handleBack}
		canGoBack={issueHistory.length > 0}
		projectId={$page.params.id}
		{agents}
		onupdate={handleIssueUpdate}
		ondelete={handleIssueDelete}
		onstarttask={handleStartTask}
		onchattask={handleChatTask}
		onstoptask={handleStopTask}
		activeRunId={selectedIssueActiveRunId()}
	/>

	<AgentEditSheet
		agent={selectedAgent}
		isOpen={agentEditSheetOpen}
		onclose={handleAgentEditClose}
		onsave={handleAgentSave}
		projectId={$page.params.id}
	/>

	<ChatSheet
		isOpen={chatSheetOpen}
		onclose={handleChatClose}
		projectId={$page.params.id}
		agent={chatAgent}
	/>

	<TaskRunnerPanel
		isOpen={taskRunnerOpen}
		onclose={handleTaskRunnerClose}
		projectId={$page.params.id}
		initialIssue={taskRunnerIssue}
		initialMode={taskRunnerMode}
	/>

	<LiveEditMode
		isOpen={liveEditOpen}
		projectId={$page.params.id}
		projectName={project?.name || 'Project'}
		onclose={handleLiveEditClose}
	/>

	{#if showListView}
		<div class="list-view-overlay">
			<BeadsListView
				{issues}
				{agents}
				initialFilters={listViewFilters}
				projectId={$page.params.id}
				onissueclick={handleIssueClick}
				onclose={closeListView}
			/>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #fafafa;
		color: #1a1a1a;
		font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(h1, h2, h3, h4, h5, h6) {
		font-family: 'Hedvig Letters Serif', Georgia, serif;
		font-weight: 400;
	}

	.dashboard {
		min-height: 100vh;
		max-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 32px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.back-link {
		color: #888888;
		text-decoration: none;
		font-size: 14px;
		transition: color 0.2s ease;
	}

	.back-link:hover {
		color: #1a1a1a;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 400;
		color: #1a1a1a;
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #888888;
		padding: 6px 12px;
		background: #f5f5f5;
		border-radius: 20px;
	}

	.connection-status.connected {
		color: #22c55e;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #dc3545;
	}

	.connection-status.connected .status-dot {
		background: #22c55e;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.server-btn,
	.chat-btn,
	.plan-btn,
	.live-edit-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: #f5f5f5;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #4b5563;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.chat-btn:hover {
		background: #ecfdf5;
		border-color: #a7f3d0;
		color: #059669;
	}

	.server-btn {
		background: #f0fdf4;
		border-color: #bbf7d0;
		color: #16a34a;
	}

	.server-btn:hover:not(:disabled) {
		background: #dcfce7;
		border-color: #86efac;
		color: #15803d;
	}

	.server-btn.running {
		background: #fef2f2;
		border-color: #fecaca;
		color: #dc2626;
	}

	.server-btn.running:hover {
		background: #fee2e2;
		border-color: #fca5a5;
		color: #b91c1c;
	}

	.server-btn.starting {
		background: #fefce8;
		border-color: #fef08a;
		color: #ca8a04;
	}

	.server-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.server-btn :global(.icon[data-name="loader"]) {
		animation: spin 1s linear infinite;
	}

	.port-badge {
		font-size: 12px;
		font-weight: 600;
		background: rgba(220, 38, 38, 0.15);
		padding: 2px 6px;
		border-radius: 4px;
		margin-left: 4px;
	}

	.live-edit-btn {
		background: #fef3c7;
		border-color: #fcd34d;
		color: #b45309;
	}

	.live-edit-btn:hover {
		background: #fde68a;
		border-color: #f59e0b;
		color: #92400e;
	}

	.plan-btn {
		background: #f5f3ff;
		border-color: #ddd6fe;
		color: #7c3aed;
	}

	.plan-btn:hover:not(:disabled) {
		background: #ede9fe;
		border-color: #c4b5fd;
		color: #6d28d9;
	}

	.plan-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.header-stats {
		display: flex;
		gap: 32px;
	}

	.stat {
		text-align: center;
	}

	.stat-value {
		display: block;
		font-size: 28px;
		font-weight: 600;
		color: #1a1a1a;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.stat-value.in-review {
		color: #8b5cf6;
	}

	.stat-label {
		font-size: 12px;
		color: #888888;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.stat-clickable {
		background: transparent;
		border: none;
		padding: 8px 12px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.stat-clickable:hover {
		background: #f3f4f6;
	}

	.stat-clickable:active {
		background: #e5e7eb;
	}

	.unsaved-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 10px 20px;
		background: #fffbeb;
		border: none;
		border-bottom: 1px solid #fcd34d;
		color: #92400e;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.unsaved-banner:hover {
		background: #fef3c7;
	}

	.unsaved-banner .banner-action {
		color: #b45309;
		margin-left: 8px;
	}

	.error-banner {
		background: #fef2f2;
		border-bottom: 1px solid #fecaca;
		padding: 24px;
		text-align: center;
	}

	.error-banner p {
		margin: 0 0 12px 0;
		color: #dc3545;
	}

	.error-link {
		color: #1a1a1a;
		text-decoration: none;
		font-weight: 500;
	}

	.error-link:hover {
		text-decoration: underline;
	}

	.tab-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 32px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	main {
		flex: 1;
		display: flex;
		overflow-x: auto;
		overflow-y: auto;
		background: #fafafa;
	}

	.board-container {
		flex: 1;
		display: flex;
		gap: 24px;
		padding: 24px 32px;
		overflow: auto;
	}

	.epics-container {
		flex: 1;
		padding: 24px 32px;
		overflow-y: auto;
	}

	.agents-container {
		flex: 1;
		overflow-y: auto;
	}

	.planning-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.execution-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.orchestration-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.history-container {
		flex: 1;
		overflow-y: auto;
		background: #fafafa;
	}

	.settings-container {
		flex: 1;
		padding: 24px 32px;
		overflow-y: auto;
		background: #fafafa;
	}

	.settings-section {
		max-width: 900px;
		margin: 0 auto;
	}

	.settings-section h2 {
		margin: 0 0 8px 0;
		font-size: 20px;
		font-weight: 600;
		color: #1f2937;
	}

	.settings-description {
		margin: 0 0 20px 0;
		font-size: 14px;
		color: #6b7280;
		line-height: 1.6;
	}

	.kanban-board {
		flex: 1;
		display: flex;
		gap: 20px;
		overflow-x: auto;
		padding-bottom: 8px;
	}

	aside {
		flex-shrink: 0;
	}

	.list-view-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 48px;
	}

	.list-view-overlay > :global(.list-view) {
		width: 100%;
		max-width: 1200px;
		max-height: 100%;
		border-radius: 12px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
</style>
