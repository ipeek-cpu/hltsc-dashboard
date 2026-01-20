<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import type { Issue, Event, StreamMessage, ProjectInfo, IssueWithDetails, Agent, BoardFilter } from '$lib/types';
	import type { SessionPrompt } from '$lib/prompt-types';
	import type { KnownIssue } from '$lib/session-context-types';
	import KanbanColumn, { type ColumnDropData } from '../../../../components/KanbanColumn.svelte';
		import ClaimBeadModal from '../../../../components/ClaimBeadModal.svelte';
	import CompleteBeadModal from '../../../../components/CompleteBeadModal.svelte';
	import { toasts } from '$lib/stores/toast-store';
	import { isValidTransition, transitionRequiresModal, type BeadStatus } from '$lib/bead-lifecycle';
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
	import ContextPacksPanel from '../../../../components/ContextPacksPanel.svelte';
	import BeadsListView from '../../../../components/BeadsListView.svelte';
	import PlanningView from '../../../../components/PlanningView.svelte';
	import ExecutionView from '../../../../components/ExecutionView.svelte';
	import StaleBeadsPanel from '../../../../components/StaleBeadsPanel.svelte';
	import BulkActionsBar from '../../../../components/BulkActionsBar.svelte';
	import ColumnVisibilityDropdown from '../../../../components/ColumnVisibilityDropdown.svelte';
	import BoardFilterToolbar from '../../../../components/BoardFilterToolbar.svelte';
	import type { ListFilters } from '../../../../components/BeadsListFilters.svelte';
	import ProfileSelector from '../../../../components/ProfileSelector.svelte';
	import QuickActionBar from '../../../../components/QuickActionBar.svelte';
	import type { QuickAction } from '$lib/profiles';

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

	// Profile state (supports multi-selection for monorepos)
	interface ProfileInfo { id: string; name: string; description: string; icon: string; }
	interface ProfileDetection {
		detectedProfiles: Array<{ profileId: string; profileName: string; confidence: number; matchedPatterns: string[]; }>;
		isMonorepo: boolean;
		primaryProfile: string;
	}
	let selectedProfiles = $state<ProfileInfo[]>([]);
	let availableProfiles = $state<ProfileInfo[]>([]);
	let profileDetection = $state<ProfileDetection | null>(null);
	let isAutoDetected = $state(true);
	let quickActions = $state<QuickAction[]>([]);

	// Custom actions (user-defined quick actions)
	interface CustomAction {
		id: string;
		label: string;
		icon: string;
		command: string;
		description?: string;
		requiresConfirmation?: boolean;
	}
	let customActions = $state<CustomAction[]>([]);

	// Board filter state
	let boardFilter: BoardFilter = $state({});

	// List view state
	let showListView = $state(false);
	let listViewFilters = $state<Partial<ListFilters> | null>(null);

	// Side-by-side layout state - chat sidebar persists across all tabs
	type ChatPanel = {
		id: string;
		agent: Agent | null;
	};
	let chatPanels = $state<ChatPanel[]>([]); // Up to 2 chat panels
	let chatSidebarWidth = $state(400); // Width of chat sidebar in pixels
	let isResizingSidebar = $state(false);
	let showChatSidebar = $derived(chatPanels.length > 0);

	// Bulk selection state
	let selectionMode = $state(false);
	let selectedIssueIds = $state<Set<string>>(new Set());

	// Column visibility state
	let hiddenColumns = $state<Set<string>>(new Set());

	// Git status for unsaved changes banner
	let hasUnsavedChanges = $state(false);
	let unsavedChangeCount = $state(0);

	// Drag-and-drop modal state
	let showClaimModal = $state(false);
	let showCompleteModal = $state(false);
	let dragDropIssue = $state<Issue | null>(null);

	// Handle column drop - validate transition and either open modal or update directly
	async function handleColumnDrop(data: ColumnDropData) {
		const { issueId, fromStatus, toStatus } = data;
		const projectId = $page.params.id;

		// Find the issue
		const issue = issues.find(i => i.id === issueId);
		if (!issue) {
			toasts.error('Issue not found');
			return;
		}

		// Validate transition
		if (!isValidTransition(fromStatus as BeadStatus, toStatus as BeadStatus)) {
			toasts.error(`Cannot move from ${fromStatus} to ${toStatus}`);
			return;
		}

		// Check if transition requires a modal
		if (transitionRequiresModal(fromStatus as BeadStatus, toStatus as BeadStatus)) {
			dragDropIssue = issue;

			if (toStatus === 'in_progress') {
				// ready → in_progress requires ClaimBeadModal
				showClaimModal = true;
			} else if (toStatus === 'in_review') {
				// in_progress → in_review requires CompleteBeadModal
				showCompleteModal = true;
			}
			return;
		}

		// Simple transition - update directly
		try {
			const response = await fetch(`/api/projects/${projectId}/issues/${issueId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: toStatus })
			});

			if (response.ok) {
				toasts.success(`Moved to ${toStatus.replace('_', ' ')}`);
			} else {
				const error = await response.json();
				toasts.error(error.error || 'Failed to update status');
			}
		} catch (err) {
			console.error('Error updating issue status:', err);
			toasts.error('Failed to update status');
		}
	}

	// Handle claim from drag-drop modal
	async function handleDragDropClaim(data: { branch_name: string; agent_id: string }) {
		if (!dragDropIssue) return;
		const projectId = $page.params.id;

		try {
			const response = await fetch(`/api/projects/${projectId}/issues/${dragDropIssue.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: 'in_progress',
					branch_name: data.branch_name,
					assignee: data.agent_id,
					agent_id: data.agent_id
				})
			});

			if (response.ok) {
				toasts.success('Bead claimed successfully');
				showClaimModal = false;
				dragDropIssue = null;
			} else {
				const error = await response.json();
				toasts.error(error.error || 'Failed to claim bead');
			}
		} catch (err) {
			console.error('Error claiming bead:', err);
			toasts.error('Failed to claim bead');
		}
	}

	// Handle complete from drag-drop modal
	async function handleDragDropComplete(data: { commit_hash: string; execution_log: string; pr_url?: string }) {
		if (!dragDropIssue) return;
		const projectId = $page.params.id;

		try {
			const response = await fetch(`/api/projects/${projectId}/issues/${dragDropIssue.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: 'in_review',
					commit_hash: data.commit_hash,
					execution_log: data.execution_log,
					pr_url: data.pr_url
				})
			});

			if (response.ok) {
				toasts.success('Submitted for review');
				showCompleteModal = false;
				dragDropIssue = null;
			} else {
				const error = await response.json();
				toasts.error(error.error || 'Failed to submit for review');
			}
		} catch (err) {
			console.error('Error completing bead:', err);
			toasts.error('Failed to submit for review');
		}
	}

	// Close drag-drop modals
	function closeDragDropModals() {
		showClaimModal = false;
		showCompleteModal = false;
		dragDropIssue = null;
	}

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

	// Chat sidebar functions - persistent across all tabs
	function openChatPanel(agent: Agent | null = null) {
		// Max 2 panels
		if (chatPanels.length >= 2) return;
		const newPanel: ChatPanel = {
			id: crypto.randomUUID(),
			agent
		};
		chatPanels = [...chatPanels, newPanel];
		saveChatPreference();
	}

	function closeChatPanel(panelId: string) {
		chatPanels = chatPanels.filter(p => p.id !== panelId);
		saveChatPreference();
	}

	function toggleChatSidebar() {
		if (chatPanels.length === 0) {
			openChatPanel(null); // Open general assistant
		} else {
			chatPanels = []; // Close all panels
		}
		saveChatPreference();
	}

	function saveChatPreference() {
		if (browser) {
			const projectId = $page.params.id;
			localStorage.setItem(`beads-chat-${projectId}`, JSON.stringify({
				width: chatSidebarWidth,
				panelCount: chatPanels.length
			}));
		}
	}

	function loadChatPreference() {
		if (browser) {
			const projectId = $page.params.id;
			const stored = localStorage.getItem(`beads-chat-${projectId}`);
			if (stored) {
				try {
					const { width } = JSON.parse(stored);
					if (width) chatSidebarWidth = width;
				} catch (e) {
					console.error('Failed to parse chat preference:', e);
				}
			}
		}
	}

	// Sidebar resize handlers
	function startSidebarResize(e: MouseEvent) {
		isResizingSidebar = true;
		e.preventDefault();
	}

	function handleSidebarResize(e: MouseEvent) {
		if (!isResizingSidebar) return;
		const newWidth = window.innerWidth - e.clientX;
		// Min 300px, max 800px
		chatSidebarWidth = Math.max(300, Math.min(window.innerWidth * 0.8, newWidth));
	}

	function endSidebarResize() {
		if (isResizingSidebar) {
			isResizingSidebar = false;
			saveChatPreference();
		}
	}

	// Keyboard shortcut for chat toggle (Cmd+/)
	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === '/') {
			e.preventDefault();
			toggleChatSidebar();
		}
	}

	// Load chat preference on mount
	$effect(() => {
		if (browser) {
			loadChatPreference();
		}
	});

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

	// Load project profile
	async function loadProjectProfile() {
		const projectId = $page.params.id;
		if (!projectId) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/profile`);
			if (response.ok) {
				const data = await response.json();
				selectedProfiles = data.selectedProfiles || [];
				availableProfiles = data.availableProfiles || [];
				profileDetection = data.detection || null;
				isAutoDetected = data.isAutoDetected ?? true;
				quickActions = data.quickActions || [];
				customActions = data.customActions || [];
			}
		} catch (err) {
			console.error('Failed to load profile:', err);
		}
	}

	function handleProfileChange(profileIds: string[], useAutoDetect: boolean) {
		// Reload profile data to get updated quick actions and selected profiles
		loadProjectProfile();
	}

	function handleCustomActionsChange(actions: CustomAction[]) {
		customActions = actions;
		// Reload profile to get updated quickActions which includes custom actions
		loadProjectProfile();
	}

	// Load profile on mount
	$effect(() => {
		if (browser && project) {
			loadProjectProfile();
		}
	});

	// Filtered issues for board
	let filteredIssues = $derived.by(() => {
		let result = issues;

		// Filter by search
		if (boardFilter.search) {
			const search = boardFilter.search.toLowerCase();
			result = result.filter(i =>
				i.title.toLowerCase().includes(search) ||
				i.description?.toLowerCase().includes(search) ||
				i.id.toLowerCase().includes(search)
			);
		}

		// Filter by agent
		if (boardFilter.agentName) {
			result = result.filter(i => i.assignee === boardFilter.agentName);
		}

		// Filter by epic (show epic and its children)
		if (boardFilter.epicId) {
			const epicId = boardFilter.epicId;
			result = result.filter(i => {
				// Include the epic itself
				if (i.id === epicId) return true;
				// Include children - check parent_id from dependencies table
				if (i.parent_id === epicId) return true;
				return false;
			});
		}

		return result;
	});

	// Get selected issues as array for BulkActionsBar
	let selectedIssues = $derived(issues.filter(i => selectedIssueIds.has(i.id)));

	// Selection mode handlers
	function toggleSelectionMode() {
		selectionMode = !selectionMode;
		if (!selectionMode) {
			selectedIssueIds = new Set();
		}
	}

	function handleIssueSelect(issueId: string, selected: boolean) {
		const newSet = new Set(selectedIssueIds);
		if (selected) {
			newSet.add(issueId);
		} else {
			newSet.delete(issueId);
		}
		selectedIssueIds = newSet;
	}

	function clearSelection() {
		selectedIssueIds = new Set();
		selectionMode = false;
	}

	// Bulk status change handler
	async function handleBulkStatusChange(issueIds: string[], newStatus: string) {
		const projectId = $page.params.id;
		let successCount = 0;
		let failCount = 0;

		for (const issueId of issueIds) {
			try {
				const response = await fetch(`/api/projects/${projectId}/issues/${issueId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: newStatus })
				});

				if (response.ok) {
					successCount++;
				} else {
					failCount++;
				}
			} catch (err) {
				console.error(`Error updating issue ${issueId}:`, err);
				failCount++;
			}
		}

		// Show result toast
		if (failCount === 0) {
			toasts.success(`Moved ${successCount} issue${successCount !== 1 ? 's' : ''} to ${newStatus.replace('_', ' ')}`);
		} else if (successCount === 0) {
			toasts.error(`Failed to update ${failCount} issue${failCount !== 1 ? 's' : ''}`);
		} else {
			toasts.success(`Moved ${successCount} issue${successCount !== 1 ? 's' : ''}, ${failCount} failed`);
		}

		// Clear selection after bulk action
		clearSelection();
	}

	// Column visibility handlers
	function handleColumnVisibilityChange(newHiddenColumns: Set<string>) {
		hiddenColumns = newHiddenColumns;
		// Persist to localStorage
		if (browser) {
			const projectId = $page.params.id;
			const key = `beads-hidden-columns-${projectId}`;
			if (newHiddenColumns.size > 0) {
				localStorage.setItem(key, JSON.stringify([...newHiddenColumns]));
			} else {
				localStorage.removeItem(key);
			}
		}
	}

	// Load column visibility from localStorage on mount
	$effect(() => {
		if (browser) {
			const projectId = $page.params.id;
			const key = `beads-hidden-columns-${projectId}`;
			const stored = localStorage.getItem(key);
			if (stored) {
				try {
					const parsed = JSON.parse(stored);
					hiddenColumns = new Set(parsed);
				} catch (e) {
					console.error('Failed to parse hidden columns:', e);
				}
			}
		}
	});

	// Filter columns based on visibility
	let visibleColumns = $derived(columns.filter(c => !hiddenColumns.has(c.status)));
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={handleSidebarResize} onmouseup={endSidebarResize} />

<svelte:head>
	<title>{project?.name || 'Project'} - Beads Dashboard</title>
</svelte:head>

<div class="dashboard">
	<header>
		<div class="header-left">
			<a href="/" class="back-link" title="Back to Projects">
				<Icon name="chevron-left" size={16} />
			</a>
			<h1>{project?.name || 'Loading...'}</h1>
			<div class="connection-status" class:connected>
				<span class="status-dot"></span>
			</div>
			{#if hasUnsavedChanges && activeTab !== 'history'}
				<button class="unsaved-pill" onclick={() => handleTabChange('history')} title="View unsaved changes">
					<Icon name="git-commit" size={12} />
					<span>{unsavedChangeCount}</span>
				</button>
			{/if}
		</div>

		<nav class="header-nav">
			<TabSwitcher {activeTab} ontabchange={handleTabChange} compact={true} />
		</nav>

		<div class="header-right">
			<div class="header-stats">
				<button class="stat-pill" onclick={() => handleStatClick('open')} title="Open issues">
					<span class="stat-value">{openCount}</span>
					<span class="stat-label">open</span>
				</button>
				<button class="stat-pill" onclick={() => handleStatClick('in_progress')} title="In progress">
					<span class="stat-value">{inProgressCount}</span>
					<span class="stat-label">active</span>
				</button>
				<button class="stat-pill in-review" onclick={() => handleStatClick('in_review')} title="In review">
					<span class="stat-value">{inReviewCount}</span>
					<span class="stat-label">review</span>
				</button>
				<button class="stat-pill total" onclick={() => openListView()} title="View all issues">
					<span class="stat-value">{issues.length}</span>
				</button>
			</div>
			<div class="header-actions">
				{#if hasDevConfig}
					{#if devServerStatus === 'running'}
						<button class="action-btn server running" onclick={handleStopDevServer} title="Stop dev server">
							<Icon name="square" size={14} />
							{#if devServerPort}
								<span class="port-badge">:{devServerPort}</span>
							{/if}
						</button>
					{:else if devServerStatus === 'starting'}
						<button class="action-btn server starting" disabled title="Starting...">
							<Icon name="loader" size={14} />
						</button>
					{:else}
						<button class="action-btn server" onclick={handleStartDevServer} title="Start dev server">
							<Icon name="play" size={14} />
						</button>
					{/if}
				{/if}
				<button class="action-btn live-edit" onclick={handleLiveEditOpen} title="Live edit with Claude">
					<Icon name="zap" size={16} />
				</button>
				<button class="action-btn plan" onclick={handlePlannerChat} title="Plan features" disabled={plannerLoading}>
					<Icon name="clipboard" size={16} />
				</button>
				<button class="action-btn chat" onclick={handleGeneralChat} title="Chat with Claude">
					<Icon name="message-circle" size={16} />
				</button>
			</div>
		</div>
	</header>

	{#if loadError}
		<div class="error-banner">
			<p>{loadError}</p>
			<a href="/" class="error-link">← Back to Projects</a>
		</div>
	{:else}
		{#if activeTab === 'board'}
			<div class="board-toolbar">
				<div class="board-controls-left">
					{#if selectedProfiles.length > 0 || availableProfiles.length > 0}
						<ProfileSelector
							projectId={$page.params.id || ''}
							{selectedProfiles}
							{availableProfiles}
							detection={profileDetection}
							{isAutoDetected}
							{customActions}
							onchange={handleProfileChange}
							onCustomActionsChange={handleCustomActionsChange}
						/>
					{/if}
					{#if quickActions.length > 0}
						<QuickActionBar
							projectId={$page.params.id || ''}
							actions={quickActions}
							compact={true}
						/>
					{/if}
					<div class="toolbar-divider"></div>
					<BoardFilterToolbar
						{issues}
						{agents}
						filter={boardFilter}
						onchange={handleBoardFilterChange}
					/>
				</div>
				<div class="board-controls-right">
					<button
						class="toolbar-btn"
						class:active={selectionMode}
						onclick={toggleSelectionMode}
						title={selectionMode ? 'Exit selection mode' : 'Select multiple'}
					>
						<Icon name={selectionMode ? 'x' : 'check-square'} size={14} />
						{selectionMode ? 'Cancel' : 'Select'}
					</button>
					<ColumnVisibilityDropdown
						{columns}
						{hiddenColumns}
						onchange={handleColumnVisibilityChange}
					/>
					<button
						class="toolbar-btn chat-toggle"
						class:active={showChatSidebar}
						onclick={toggleChatSidebar}
						title="Toggle chat sidebar (⌘/)"
					>
						<Icon name="message-circle" size={14} />
						{showChatSidebar ? 'Hide Chat' : 'Chat'}
					</button>
				</div>
			</div>
		{/if}

		<main class="main-layout" class:with-sidebar={showChatSidebar} class:resizing={isResizingSidebar}>
			<!-- Content area - all tabs render here -->
			<div class="content-area">
				{#if activeTab === 'board'}
					<div class="board-container">
						<div class="kanban-board">
							{#each visibleColumns as column (column.status)}
								<KanbanColumn
									title={column.title}
									status={column.status}
									issues={filteredIssues}
									{recentlyChanged}
									{selectionMode}
									selectedIds={selectedIssueIds}
									onissueclick={handleIssueClick}
									ondrop={handleColumnDrop}
									onselect={handleIssueSelect}
								/>
							{/each}
						</div>

						<StaleBeadsPanel
							{issues}
							onissueclick={handleIssueClick}
						/>
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
					<HistoryTabView projectId={$page.params.id} {events} />
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

					<div class="settings-section">
						<h2>Context Packs</h2>
						<p class="settings-description">
							Generate structured context packs from your codebase using CodeGraph.
							Export as markdown to inject into Claude sessions for better code understanding.
						</p>
						<ContextPacksPanel projectId={$page.params.id} />
					</div>
				</div>
			{/if}
			</div>

			<!-- Chat sidebar - persists across all tabs -->
			{#if showChatSidebar}
				<div
					class="sidebar-divider"
					onmousedown={startSidebarResize}
					role="separator"
					aria-orientation="vertical"
				>
					<div class="divider-handle"></div>
				</div>
				<div class="chat-sidebar" style="width: {chatSidebarWidth}px">
					<div class="chat-panels">
						{#each chatPanels as panel, index (panel.id)}
							<div class="chat-panel" class:single={chatPanels.length === 1}>
								<div class="panel-header">
									<span class="panel-label">Chat {index + 1}</span>
									<button class="panel-close-btn" onclick={() => closeChatPanel(panel.id)} title="Close this chat">
										<Icon name="x" size={14} />
									</button>
								</div>
								<ChatSheet
									isOpen={true}
									onclose={() => closeChatPanel(panel.id)}
									projectId={$page.params.id}
									agent={panel.agent}
									embedded={true}
									darkTerminal={true}
								/>
							</div>
						{/each}
					</div>
					{#if chatPanels.length < 2}
						<button class="add-chat-btn" onclick={() => openChatPanel(null)} title="Open another chat">
							<Icon name="plus" size={14} />
							Add Chat
						</button>
					{/if}
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

	<!-- Drag-and-drop workflow modals -->
	{#if showClaimModal && dragDropIssue}
		<ClaimBeadModal
			isOpen={true}
			issue={dragDropIssue}
			{agents}
			onclaim={handleDragDropClaim}
			onclose={closeDragDropModals}
		/>
	{/if}

	{#if showCompleteModal && dragDropIssue}
		<CompleteBeadModal
			isOpen={true}
			issue={dragDropIssue}
			oncomplete={handleDragDropComplete}
			onclose={closeDragDropModals}
		/>
	{/if}

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

	<!-- Bulk actions bar for selection mode -->
	<BulkActionsBar
		{selectedIssues}
		onstatuschange={handleBulkStatusChange}
		onclear={clearSelection}
	/>
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
		align-items: center;
		gap: 16px;
		padding: 10px 20px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
		min-height: 52px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.back-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		color: #6b7280;
		text-decoration: none;
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.back-link:hover {
		color: #1a1a1a;
		background: #f3f4f6;
	}

	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 500;
		color: #1a1a1a;
		font-family: 'Figtree', sans-serif;
		white-space: nowrap;
	}

	.connection-status {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 8px;
		height: 8px;
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
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.unsaved-pill {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: #fef3c7;
		border: 1px solid #fcd34d;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
		color: #92400e;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.unsaved-pill:hover {
		background: #fde68a;
		border-color: #f59e0b;
	}

	.header-nav {
		flex: 1;
		display: flex;
		justify-content: center;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.header-stats {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.stat-pill {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: #f5f5f5;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.stat-pill:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.stat-pill .stat-value {
		font-weight: 600;
		color: #374151;
	}

	.stat-pill .stat-label {
		font-weight: 400;
	}

	.stat-pill.in-review .stat-value {
		color: #7c3aed;
	}

	.stat-pill.total {
		background: #1f2937;
		color: #ffffff;
	}

	.stat-pill.total .stat-value {
		color: #ffffff;
	}

	.stat-pill.total:hover {
		background: #374151;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: 32px;
		height: 32px;
		background: #f5f5f5;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover:not(:disabled) {
		background: #e5e7eb;
		color: #374151;
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.server {
		background: #f0fdf4;
		border-color: #bbf7d0;
		color: #16a34a;
	}

	.action-btn.server:hover:not(:disabled) {
		background: #dcfce7;
		color: #15803d;
	}

	.action-btn.server.running {
		background: #fef2f2;
		border-color: #fecaca;
		color: #dc2626;
		width: auto;
		padding: 0 10px;
	}

	.action-btn.server.running:hover {
		background: #fee2e2;
		color: #b91c1c;
	}

	.action-btn.server.starting {
		background: #fefce8;
		border-color: #fef08a;
		color: #ca8a04;
	}

	.action-btn.server :global(.icon[data-name="loader"]) {
		animation: spin 1s linear infinite;
	}

	.action-btn .port-badge {
		font-size: 11px;
		font-weight: 600;
	}

	.action-btn.live-edit {
		background: #fef3c7;
		border-color: #fcd34d;
		color: #b45309;
	}

	.action-btn.live-edit:hover {
		background: #fde68a;
		color: #92400e;
	}

	.action-btn.plan {
		background: #f5f3ff;
		border-color: #ddd6fe;
		color: #7c3aed;
	}

	.action-btn.plan:hover:not(:disabled) {
		background: #ede9fe;
		color: #6d28d9;
	}

	.action-btn.chat {
		background: #ecfdf5;
		border-color: #a7f3d0;
		color: #059669;
	}

	.action-btn.chat:hover {
		background: #d1fae5;
		color: #047857;
	}

	.error-banner {
		background: #fef2f2;
		border-bottom: 1px solid #fecaca;
		padding: 16px 24px;
		text-align: center;
	}

	.error-banner p {
		margin: 0 0 8px 0;
		color: #dc3545;
		font-size: 14px;
	}

	.error-link {
		color: #1a1a1a;
		text-decoration: none;
		font-weight: 500;
		font-size: 13px;
	}

	.error-link:hover {
		text-decoration: underline;
	}

	.board-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 20px;
		background: #fafafa;
		border-bottom: 1px solid #f0f0f0;
		gap: 16px;
	}

	.board-controls-left {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.toolbar-divider {
		width: 1px;
		height: 24px;
		background: #e5e7eb;
		margin: 0 4px;
	}

	.board-controls-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		background: #ffffff;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.toolbar-btn:hover {
		background: #f5f5f5;
		border-color: #d1d5db;
		color: #374151;
	}

	.toolbar-btn.active {
		background: #dbeafe;
		border-color: #93c5fd;
		color: #1d4ed8;
	}

	.toolbar-btn.active:hover {
		background: #bfdbfe;
		border-color: #60a5fa;
	}

	main {
		flex: 1;
		display: flex;
		overflow: hidden;
		background: #fafafa;
	}

	.main-layout {
		flex: 1;
		display: flex;
		overflow: hidden;
		min-height: 0;
		height: 0; /* Allow flex: 1 to determine actual height */
	}

	.main-layout.resizing {
		cursor: col-resize;
		user-select: none;
	}

	.content-area {
		flex: 1 1 auto;
		display: flex;
		overflow: auto;
		min-width: 0;
		width: 100%;
	}

	/* When sidebar is hidden, ensure content takes full width */
	.main-layout:not(.with-sidebar) .content-area {
		width: 100%;
	}

	/* Chat sidebar */
	.sidebar-divider {
		width: 6px;
		background: #e5e7eb;
		cursor: col-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.15s ease;
	}

	.sidebar-divider:hover {
		background: #d1d5db;
	}

	.main-layout.resizing .sidebar-divider {
		background: #3b82f6;
	}

	.sidebar-divider .divider-handle {
		width: 3px;
		height: 40px;
		background: #9ca3af;
		border-radius: 2px;
	}

	.sidebar-divider:hover .divider-handle {
		background: #6b7280;
	}

	.main-layout.resizing .sidebar-divider .divider-handle {
		background: #ffffff;
	}

	.chat-sidebar {
		display: flex;
		flex-direction: column;
		background: #ffffff;
		border-left: 1px solid #e5e7eb;
		min-width: 300px;
		max-width: 80vw;
		align-self: stretch;
		flex-shrink: 0;
		overflow: hidden;
	}

	.chat-panels {
		flex: 1;
		display: flex;
		flex-direction: row;
		min-height: 0;
		overflow: hidden;
	}

	.chat-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		border-right: 1px solid #e5e7eb;
		min-width: 0;
		background: #f9fafb;
	}

	.chat-panel.single {
		border-right: none;
	}

	.chat-panel:last-child {
		border-right: none;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		background: #f8fafc;
		border-bottom: 1px solid #e5e7eb;
		flex-shrink: 0;
	}

	.panel-label {
		font-size: 11px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.panel-close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.panel-close-btn:hover {
		background: #e2e8f0;
		color: #475569;
	}

	/* Ensure ChatSheet fills the panel completely */
	.chat-panel :global(.sheet-overlay),
	.chat-panel :global(.sheet-overlay.embedded) {
		flex: 1 !important;
		display: flex !important;
		flex-direction: column !important;
		min-height: 0 !important;
		height: unset !important;
		position: relative !important;
	}

	.chat-panel :global(.chat-sheet),
	.chat-panel :global(.chat-sheet.embedded) {
		flex: 1 !important;
		display: flex !important;
		flex-direction: column !important;
		width: 100% !important;
		min-height: 0 !important;
		height: unset !important;
		position: relative !important;
	}

	.chat-panel :global(.messages-wrapper) {
		flex: 1 !important;
		min-height: 0 !important;
		overflow: hidden !important;
	}

	.chat-panel :global(.messages-container) {
		flex: 1 !important;
		min-height: 0 !important;
	}

	.chat-panel :global(.chat-input-container) {
		flex-shrink: 0 !important;
	}

	.add-chat-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px;
		background: #f9fafb;
		border: none;
		border-top: 1px solid #e5e7eb;
		color: #6b7280;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
		flex-shrink: 0;
	}

	.add-chat-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.chat-toggle.active {
		background: #dbeafe;
		border-color: #93c5fd;
		color: #1d4ed8;
	}

	.board-container {
		flex: 1;
		display: flex;
		gap: 16px;
		padding: 12px 20px;
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
