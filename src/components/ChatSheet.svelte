<script lang="ts">
	import { browser } from '$app/environment';
	import type { Agent } from '$lib/types';
	import type { SkillLevel } from '$lib/settings';
	import type { SessionMetrics } from '$lib/session-metrics';
	import { createSessionMetrics, updateMetrics, startBlock } from '$lib/session-metrics';
	import { getAgentColor, getModelStyle } from '$lib/agents';
	import Icon from './Icon.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import ChatInput from './ChatInput.svelte';
	import ClaudeTodoList, { type TodoItem } from './ClaudeTodoList.svelte';
	import ClaudeBashCommand from './ClaudeBashCommand.svelte';
	import SkillLevelModal from './SkillLevelModal.svelte';
	import ClaudeQuestionPanel, { type Question } from './ClaudeQuestionPanel.svelte';
	import ToolDisplay from './ToolDisplay.svelte';
	import GlobalDropZone from './GlobalDropZone.svelte';
	import SessionMetricsBar from './SessionMetricsBar.svelte';

	interface InitStreamMessage {
		type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'init' | 'done' | 'error' | 'auth_expired';
		content?: string;
		tool?: string;
		input?: unknown;
		result?: string;
		status?: string;
	}

	interface ChatMessageData {
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		timestamp: Date;
		toolCalls?: Array<{
			name: string;
			input: Record<string, unknown>;
			result?: unknown;
		}>;
		isStreaming?: boolean;
		// Usage stats (for assistant messages)
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		costUsd?: number;
		durationMs?: number;
	}

	interface ElementSelectionData {
		selector: string;
		tagName: string;
		id: string | null;
		className: string | null;
		text: string | null;
		rect: { x: number; y: number; width: number; height: number };
		styles: Record<string, string>;
	}

	let {
		isOpen,
		onclose,
		projectId,
		agent = null,
		embedded = false,
		darkTerminal = false,
		livePreviewUrl = null,
		selectedElement = null,
		currentNavigationUrl = null,
		onInputRef = null
	}: {
		isOpen: boolean;
		onclose: () => void;
		projectId: string;
		agent?: Agent | null;
		embedded?: boolean;
		darkTerminal?: boolean;
		livePreviewUrl?: string | null;
		selectedElement?: ElementSelectionData | null;
		currentNavigationUrl?: string | null;
		onInputRef?: ((ref: { setInput: (text: string) => void }) => void) | null;
	} = $props();

	// Mode and Model selection (synced with ChatInput pills)
	type ChatMode = 'agent' | 'plan' | 'ask';
	type ChatModel = 'opus' | 'sonnet' | 'haiku';
	let selectedMode = $state<ChatMode>('agent');
	let selectedModel = $state<ChatModel>('opus');

	// Claude CLI configuration state
	let claudeConfigured = $state(true);
	let claudePath = $state<string | null>(null);
	let claudeVersion = $state<string | null>(null);
	let claudeConfigError = $state<string | null>(null);

	// Initialization state
	let checkingInit = $state(true);
	let isInitialized = $state(false);
	let isInitializing = $state(false);
	let initMessages = $state<InitStreamMessage[]>([]);
	let initError = $state<string | null>(null);

	// Track bash commands and their results during init
	let initBashResults = $state<Map<number, string>>(new Map());
	let initRunningBashIndex = $state<number | null>(null);
	let initTodos = $state<TodoItem[]>([]);

	// Session state
	let sessionId = $state<string | null>(null);
	let messages = $state<ChatMessageData[]>([]);
	let isStreaming = $state(false);
	let isConnected = $state(false);
	let claudeReady = $state(false);  // Claude CLI has finished initializing
	let error = $state<string | null>(null);
	let authExpired = $state(false);
	let isLoggingIn = $state(false);

	// Claude status (shown during processing)
	let claudeStatus = $state<{
		statusWord?: string;
		elapsed?: string;
		tokens?: string;
		state?: string;
	} | null>(null);


	// Event source for SSE
	let eventSource: EventSource | null = null;

	// Auto-scroll ref
	let messagesContainer: HTMLDivElement | null = $state(null);
	let initOutputContainer: HTMLDivElement | null = $state(null);

	// Chat input ref for programmatic input setting
	let chatInputComponent: { setInput: (text: string) => void } | null = $state(null);

	function handleChatInputRef(ref: { setInput: (text: string) => void }) {
		chatInputComponent = ref;
		// Pass the ref to parent immediately
		if (onInputRef) {
			onInputRef(ref);
		}
	}

	// Animation state
	let visible = $state(false);
	let animating = $state(false);

	// Skill level state
	let showSkillModal = $state(false);
	let userSkillLevel = $state<SkillLevel | null | undefined>(undefined); // undefined = not checked, null = checked but not set
	let skillLevelChecked = $state(false);

	// Pending questions from AskUserQuestion tool
	let pendingQuestions = $state<Question[] | null>(null);

	// File attachments
	interface AttachedFile {
		path: string;
		name: string;
	}
	let attachedFiles = $state<AttachedFile[]>([]);

	// Session prompts state
	let hasEndPrompt = $state(false);
	let endPromptContent = $state<string | null>(null);

	// Session metrics state
	let sessionMetrics = $state<SessionMetrics | null>(null);
	let showMetrics = $state(true);

	// Resizable width
	const MIN_WIDTH = 400;
	const MAX_WIDTH = 900;
	let sheetWidth = $state(500);
	let isResizing = $state(false);
	let justFinishedResizing = $state(false);

	// Agent styling
	let agentColor = $derived(agent ? getAgentColor(agent.frontmatter.color) : '#6b7280');
	let modelStyle = $derived(agent ? getModelStyle(agent.frontmatter.model) : null);

	// Extract current todos from messages
	let currentTodos = $derived(() => {
		let latestTodos: TodoItem[] = [];
		for (const msg of messages) {
			if (msg.toolCalls) {
				for (const tool of msg.toolCalls) {
					if (tool.name === 'TodoWrite' && tool.input && typeof tool.input === 'object') {
						const input = tool.input as { todos?: TodoItem[] };
						if (input.todos && Array.isArray(input.todos)) {
							latestTodos = input.todos;
						}
					}
				}
			}
		}
		return latestTodos;
	});

	$effect(() => {
		if (isOpen || embedded) {
			visible = true;
			requestAnimationFrame(() => {
				animating = true;
			});
			// Check initialization status when opened
			if (browser) {
				// Load saved chat history first
				const savedHistory = loadChatHistory();
				if (savedHistory && savedHistory.messages.length > 0) {
					messages = savedHistory.messages;
					// Don't restore sessionId - it's stale after page reload
					// Claude session will be recreated, but messages are preserved for display
				}
				checkInitialization();
				// Check skill level (will show modal if not set after init check completes)
				checkSkillLevel();
				// Check for session prompts
				checkSessionPrompts();
			}
		} else if (visible && !embedded) {
			animating = false;
			setTimeout(() => {
				visible = false;
				// Reset state when closed (but preserve chat history)
				resetState(true);
			}, 300);
		}
	});

	// Cleanup on close
	$effect(() => {
		return () => {
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
		};
	});

	function handleFileDrop(paths: string[]) {
		const newFiles: AttachedFile[] = paths.map(p => ({
			path: p,
			name: p.split('/').pop() || p.split('\\').pop() || p
		}));

		// Filter out duplicates
		const existingPaths = new Set(attachedFiles.map(f => f.path));
		const uniqueNew = newFiles.filter(f => !existingPaths.has(f.path));

		attachedFiles = [...attachedFiles, ...uniqueNew];
	}

	// Auto-scroll when new messages arrive
	$effect(() => {
		if (messages.length > 0 && messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	// Auto-scroll init output
	$effect(() => {
		if (initMessages.length > 0 && initOutputContainer) {
			initOutputContainer.scrollTop = initOutputContainer.scrollHeight;
		}
	});

	// Process init messages to extract todos and pair Bash commands with results
	$effect(() => {
		let latestTodos: TodoItem[] = [];
		const results = new Map<number, string>();
		let currentBashIdx: number | null = null;

		for (let i = 0; i < initMessages.length; i++) {
			const msg = initMessages[i];

			// Extract todos from TodoWrite tool calls
			if (msg.type === 'tool_use' && msg.tool === 'TodoWrite' && msg.input) {
				const input = msg.input as { todos?: TodoItem[] };
				if (input.todos && Array.isArray(input.todos)) {
					latestTodos = input.todos;
				}
			}

			// Track Bash commands and their results
			if (msg.type === 'tool_use' && msg.tool === 'Bash') {
				currentBashIdx = i;
			}

			if (msg.type === 'tool_result' && currentBashIdx !== null) {
				results.set(currentBashIdx, msg.result || '');
				currentBashIdx = null;
			}
		}

		initTodos = latestTodos;
		initBashResults = results;

		// Find if there's a running Bash command
		initRunningBashIndex = null;
		for (let i = initMessages.length - 1; i >= 0; i--) {
			const msg = initMessages[i];
			if (msg.type === 'tool_result') break;
			if (msg.type === 'tool_use' && msg.tool === 'Bash') {
				initRunningBashIndex = i;
				break;
			}
		}
	});

	// Persist messages to localStorage
	function getChatStorageKey() {
		const agentKey = agent?.filename || 'general';
		return `chat-history-${projectId}-${agentKey}`;
	}

	function saveChatHistory() {
		if (!browser || !projectId) return;
		const data = {
			sessionId,
			messages: messages.map(m => ({
				...m,
				// Always save isStreaming as false - stream won't be active on reload
				isStreaming: false,
				timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp
			})),
			savedAt: new Date().toISOString()
		};
		localStorage.setItem(getChatStorageKey(), JSON.stringify(data));
	}

	function loadChatHistory(): { sessionId: string | null; messages: ChatMessageData[] } | null {
		if (!browser || !projectId) return null;
		try {
			const stored = localStorage.getItem(getChatStorageKey());
			if (!stored) return null;
			const data = JSON.parse(stored);
			// Convert timestamp strings back to Date objects and ensure isStreaming is false
			const loadedMessages = (data.messages || []).map((m: ChatMessageData & { timestamp: string }) => ({
				...m,
				// Always set isStreaming to false - no active stream on load
				isStreaming: false,
				timestamp: new Date(m.timestamp)
			}));
			return {
				sessionId: data.sessionId,
				messages: loadedMessages
			};
		} catch (err) {
			console.error('Error loading chat history:', err);
			return null;
		}
	}

	function clearChatHistory() {
		if (!browser || !projectId) return;
		localStorage.removeItem(getChatStorageKey());
	}

	// Save messages whenever they change (but not during streaming to avoid too many writes)
	$effect(() => {
		if (messages.length > 0 && !isStreaming) {
			saveChatHistory();
		}
	});

	function resetState(preserveHistory = true) {
		claudeConfigured = true;
		claudePath = null;
		claudeVersion = null;
		claudeConfigError = null;
		checkingInit = true;
		isInitialized = false;
		isInitializing = false;
		initMessages = [];
		initBashResults = new Map();
		initRunningBashIndex = null;
		initTodos = [];
		initError = null;
		// Always reset sessionId - a new session will be created on reopen
		// Messages are preserved for display but the backend session is new
		sessionId = null;
		if (!preserveHistory) {
			messages = [];
			clearChatHistory();
			sessionMetrics = null;
		}
		isStreaming = false;
		isConnected = false;
		claudeReady = false;
		claudeStatus = null;
		error = null;
	}

	async function checkClaudeConfiguration() {
		try {
			const response = await fetch('/api/settings/claude-path');
			if (response.ok) {
				const data = await response.json();
				claudeConfigured = data.isValid;
				claudePath = data.path;
				claudeVersion = data.version;

				if (!data.isValid && data.path) {
					claudeConfigError = data.error || 'Claude CLI not working';
				}
			}
		} catch (err) {
			console.error('Error checking Claude configuration:', err);
			claudeConfigured = false;
		}
	}

	async function checkInitialization() {
		checkingInit = true;
		initError = null;
		claudeConfigError = null;

		// First check if Claude CLI is configured
		await checkClaudeConfiguration();

		if (!claudeConfigured) {
			checkingInit = false;
			return;
		}

		try {
			const response = await fetch(`/api/projects/${projectId}/claude-status`);
			if (response.ok) {
				const data = await response.json();
				isInitialized = data.initialized;

				// If initialized, start chat session
				if (isInitialized && !sessionId) {
					startSession();
				}
			} else {
				initError = 'Failed to check Claude Code status';
			}
		} catch (err) {
			console.error('Error checking initialization:', err);
			initError = 'Failed to check Claude Code status';
		} finally {
			checkingInit = false;
		}
	}

	async function checkSkillLevel() {
		try {
			const response = await fetch('/api/settings/skill-level');
			if (response.ok) {
				const data = await response.json();
				userSkillLevel = data.level || null; // null means checked but not set
			}
		} catch (err) {
			console.error('Error checking skill level:', err);
			userSkillLevel = null;
		}
		skillLevelChecked = true;
	}

	async function checkSessionPrompts() {
		try {
			const response = await fetch(`/api/projects/${projectId}/prompts`);
			if (response.ok) {
				const data = await response.json();
				if (data.endPrompt && data.endPrompt.frontmatter?.enabled !== false) {
					hasEndPrompt = true;
					endPromptContent = data.endPrompt.content;
				} else {
					hasEndPrompt = false;
					endPromptContent = null;
				}
			}
		} catch (err) {
			console.error('Error checking session prompts:', err);
			hasEndPrompt = false;
		}
	}

	function applyEndPrompt() {
		if (!endPromptContent) return;

		// Send the end prompt as a user message
		const wrapUpMessage = `Please help me wrap up this session:

${endPromptContent}`;
		sendMessage(wrapUpMessage);
	}

	// Show skill level modal when project is initialized and skill level not set
	$effect(() => {
		if (isInitialized && skillLevelChecked && userSkillLevel === null && !showSkillModal) {
			// Small delay to let the UI settle
			setTimeout(() => {
				if (userSkillLevel === null) {
					showSkillModal = true;
				}
			}, 300);
		}
	});

	async function handleSkillSelect(level: SkillLevel) {
		try {
			const response = await fetch('/api/settings/skill-level', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ level })
			});
			if (response.ok) {
				userSkillLevel = level;
				showSkillModal = false;
			}
		} catch (err) {
			console.error('Error setting skill level:', err);
		}
	}

	function handleSkillCancel() {
		// Default to senior if skipped
		handleSkillSelect('senior');
	}

	async function startInitialization() {
		isInitializing = true;
		initMessages = [];
		initBashResults = new Map();
		initRunningBashIndex = null;
		initTodos = [];
		initError = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/claude-init`, {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to start initialization');
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Parse SSE messages
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = JSON.parse(line.slice(6));
							handleInitMessage(data);
						} catch {
							// Ignore parse errors
						}
					}
				}
			}
		} catch (err) {
			console.error('Error during initialization:', err);
			initError = err instanceof Error ? err.message : 'Initialization failed';
			isInitializing = false;
		}
	}

	function handleInitMessage(data: InitStreamMessage) {
		switch (data.type) {
			case 'text':
				initMessages = [...initMessages, { type: 'text', content: data.content }];
				break;
			case 'tool_use':
				initMessages = [...initMessages, {
					type: 'tool_use',
					tool: data.tool,
					input: data.input
				}];
				break;
			case 'tool_result':
				initMessages = [...initMessages, {
					type: 'tool_result',
					result: data.result
				}];
				break;
			case 'status':
				initMessages = [...initMessages, {
					type: 'status',
					status: data.status || data.content
				}];
				break;
			case 'done':
				initMessages = [...initMessages, { type: 'done', content: data.content }];
				isInitializing = false;
				isInitialized = true;
				// Start chat session after successful init
				setTimeout(() => {
					startSession();
				}, 1000);
				break;
			case 'error':
				initError = data.content || 'Unknown error';
				isInitializing = false;
				break;
		}
	}

	async function startSession() {
		try {
			error = null;
			const response = await fetch(`/api/projects/${projectId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					agentFilename: agent?.filename,
					model: selectedModel,
					mode: selectedMode
				})
			});

			if (!response.ok) {
				throw new Error('Failed to create chat session');
			}

			const data = await response.json();
			sessionId = data.sessionId;

			// Initialize session metrics
			sessionMetrics = createSessionMetrics(selectedModel);
			sessionMetrics = startBlock(sessionMetrics);

			// With print mode, Claude is always ready immediately (no startup wait)
			claudeReady = true;

			// Connect to SSE stream
			connectToStream(data.sessionId);
		} catch (err) {
			console.error('Error starting session:', err);
			error = 'Failed to start chat session';
		}
	}

	function connectToStream(sid: string) {
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource(`/api/projects/${projectId}/chat/${sid}/stream`);

		eventSource.onopen = () => {
			isConnected = true;
			error = null;
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				handleStreamMessage(data);
			} catch (err) {
				console.error('Error parsing stream message:', err);
			}
		};

		eventSource.onerror = () => {
			isConnected = false;
			// Try to reconnect after a delay
			setTimeout(() => {
				if (isOpen && sessionId) {
					connectToStream(sessionId);
				}
			}, 3000);
		};
	}

	function handleStreamMessage(data: {
		type: string;
		content?: string;
		message?: ChatMessageData;
		sessionId?: string;
		toolName?: string;
		toolInput?: Record<string, unknown>;
		toolResult?: unknown;
		// Status info
		statusWord?: string;
		elapsed?: string;
		tokens?: string;
		state?: string;
		// Usage info (for done)
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		costUsd?: number;
		durationMs?: number;
	}) {
		switch (data.type) {
			case 'connected':
				isConnected = true;
				break;

			case 'history':
				if (data.message) {
					// Add message from history
					const exists = messages.find(m => m.id === data.message!.id);
					if (!exists) {
						messages = [...messages, data.message];
					}
				}
				break;

			case 'text':
				// Append text to last assistant message or create new one
				isStreaming = true;
				const lastMsg = messages[messages.length - 1];
				if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
					lastMsg.content += data.content || '';
					messages = [...messages]; // Trigger reactivity
				}
				break;

			case 'tool_use':
				// Check if this is an AskUserQuestion tool call
				if (data.toolName === 'AskUserQuestion' && data.toolInput?.questions) {
					// Only show questions if we don't already have pending questions (avoid duplicates from retry)
					if (!pendingQuestions || pendingQuestions.length === 0) {
						// Store the questions and show the panel
						pendingQuestions = data.toolInput.questions as Question[];
						// Cancel the current response to prevent the retry loop
						// The CLI can't handle AskUserQuestion interactively, so we'll handle it ourselves
						cancelResponse();
					}
					// Don't add this to the visible tool calls - we'll show our custom UI
					break;
				}

				// Add tool call to last message
				const msgWithTool = messages[messages.length - 1];
				if (msgWithTool && msgWithTool.role === 'assistant') {
					if (!msgWithTool.toolCalls) {
						msgWithTool.toolCalls = [];
					}
					msgWithTool.toolCalls.push({
						name: data.toolName || 'unknown',
						input: data.toolInput || {}
					});
					messages = [...messages];
				}
				break;

			case 'tool_result':
				// Update last tool call with result
				const msgWithResult = messages[messages.length - 1];
				if (msgWithResult?.toolCalls?.length) {
					msgWithResult.toolCalls[msgWithResult.toolCalls.length - 1].result = data.toolResult;
					messages = [...messages];
				}
				break;

			case 'done':
				isStreaming = false;
				claudeStatus = null;  // Clear status when done
				const doneMsg = messages[messages.length - 1];
				if (doneMsg) {
					doneMsg.isStreaming = false;
					// Add usage stats
					if (data.totalTokens) {
						doneMsg.inputTokens = data.inputTokens;
						doneMsg.outputTokens = data.outputTokens;
						doneMsg.totalTokens = data.totalTokens;
						doneMsg.costUsd = data.costUsd;
						doneMsg.durationMs = data.durationMs;

						// Update session metrics
						if (sessionMetrics) {
							sessionMetrics = updateMetrics(sessionMetrics, {
								inputTokens: data.inputTokens,
								outputTokens: data.outputTokens,
								costUsd: data.costUsd,
								durationMs: data.durationMs
							});
						}
					}
					messages = [...messages];
				}
				break;

			case 'error':
				error = data.content || 'An error occurred';
				isStreaming = false;
				claudeStatus = null;  // Clear status on error
				break;

			case 'auth_expired':
				authExpired = true;
				isStreaming = false;
				claudeStatus = null;
				// Close the event source since the session is invalid
				if (eventSource) {
					eventSource.close();
					eventSource = null;
				}
				sessionId = null;
				break;

			case 'status':
				// Update Claude's processing status
				claudeStatus = {
					statusWord: data.statusWord,
					elapsed: data.elapsed,
					tokens: data.tokens,
					state: data.state
				};
				break;

			case 'system':
				// Check if Claude is ready
				if (data.content?.includes('Claude is ready')) {
					claudeReady = true;
					// Don't show "Claude is ready" message in chat
					return;
				}
				messages = [...messages, {
					id: crypto.randomUUID(),
					role: 'system',
					content: data.content || '',
					timestamp: new Date()
				}];
				break;
		}
	}

	async function sendMessage(content: string, files: AttachedFile[] = []) {
		if (!sessionId || isStreaming) return;

		// Build the full message content
		let fullContent = content;

		// Add live preview context if in embedded mode
		if (embedded && livePreviewUrl) {
			fullContent = `[Live Preview Context: User is currently viewing ${livePreviewUrl} in the dev server preview]\n\n${fullContent}`;
		}

		if (files.length > 0) {
			const filePaths = files.map(f => f.path).join('\n');
			fullContent += `\n\n[Attached files - please read these files:\n${filePaths}]`;
		}

		// Clear attached files after sending
		attachedFiles = [];

		// Add user message to UI immediately
		messages = [...messages, {
			id: crypto.randomUUID(),
			role: 'user',
			content: fullContent,
			timestamp: new Date()
		}];

		// Add placeholder for assistant response
		messages = [...messages, {
			id: crypto.randomUUID(),
			role: 'assistant',
			content: '',
			timestamp: new Date(),
			isStreaming: true
		}];

		isStreaming = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/chat/${sessionId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: fullContent })
			});

			if (!response.ok) {
				throw new Error('Failed to send message');
			}
		} catch (err) {
			console.error('Error sending message:', err);
			error = 'Failed to send message';
			isStreaming = false;
			// Remove the placeholder message
			messages = messages.slice(0, -1);
		}
	}

	async function cancelResponse() {
		if (!sessionId || !isStreaming) return;

		try {
			await fetch(`/api/projects/${projectId}/chat/${sessionId}/cancel`, {
				method: 'POST'
			});
			isStreaming = false;
		} catch (err) {
			console.error('Error canceling response:', err);
		}
	}

	function startNewChat() {
		// Close existing event source
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		// Clear history and start fresh
		messages = [];
		sessionId = null;
		claudeReady = false;
		isConnected = false;
		pendingQuestions = null;
		clearChatHistory();
		// Start a new session
		startSession();
	}

	async function handleReLogin() {
		isLoggingIn = true;
		error = null;

		try {
			const response = await fetch('/api/claude-code/login', {
				method: 'POST'
			});

			const result = await response.json();

			if (result.success && result.authenticated) {
				// Login successful, reset state and start new session
				authExpired = false;
				messages = [];
				pendingQuestions = null;
				startSession();
			} else {
				error = result.error || 'Login failed. Please try again.';
			}
		} catch (err) {
			console.error('Error during login:', err);
			error = 'Failed to initiate login. Please try again.';
		} finally {
			isLoggingIn = false;
		}
	}

	function handleQuestionSubmit(answers: Map<number, string[]>) {
		if (!pendingQuestions) return;

		// Format the answers as a natural response message
		let answerText = '';
		pendingQuestions.forEach((question, idx) => {
			const questionAnswers = answers.get(idx) || [];
			if (questionAnswers.length > 0) {
				answerText += `**${question.header}**: ${questionAnswers.join(', ')}\n`;
			}
		});

		// Clear pending questions
		pendingQuestions = null;

		// Send the answers as a regular message
		if (answerText.trim()) {
			sendMessage(answerText.trim());
		}
	}

	function handleQuestionCancel() {
		// Clear questions and send a skip message
		pendingQuestions = null;
		sendMessage("I'd like to skip these questions for now and proceed with reasonable defaults.");
	}

	async function handleOpenFolder(folderPath: string) {
		try {
			// Use Tauri's shell.open API to open the folder in Finder
			const { open } = await import('@tauri-apps/plugin-shell');
			await open(folderPath);
		} catch (err) {
			console.error('Failed to open folder:', err);
		}
	}

	// Resize functions
	function startResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		document.addEventListener('mousemove', handleResize);
		document.addEventListener('mouseup', stopResize);
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';
	}

	function handleResize(e: MouseEvent) {
		if (!isResizing) return;
		const newWidth = window.innerWidth - e.clientX;
		sheetWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
	}

	function stopResize() {
		isResizing = false;
		justFinishedResizing = true;
		// Clear the flag after a short delay to prevent backdrop click from closing
		setTimeout(() => {
			justFinishedResizing = false;
		}, 100);
		document.removeEventListener('mousemove', handleResize);
		document.removeEventListener('mouseup', stopResize);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	function handleClose() {
		// Clean up resize listeners if active
		if (isResizing) {
			stopResize();
		}
		// Close event source
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		// Call parent close handler
		onclose();
	}

	function handleBackdropClick(e: MouseEvent) {
		// Don't close if we're resizing or just finished (mouse might drift over backdrop)
		if (isResizing || justFinishedResizing) return;
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	// Helper functions for init message rendering
	function shouldHideInitMessage(msg: InitStreamMessage, index: number): boolean {
		// Hide TodoWrite tool calls and their results
		if (msg.type === 'tool_use' && msg.tool === 'TodoWrite') return true;
		// Hide all tool_result events - they're shown inline with the tool_use via ToolDisplay
		if (msg.type === 'tool_result') return true;
		return false;
	}

	function getInitBashInfo(input: unknown): { command: string; description?: string } {
		if (input && typeof input === 'object') {
			const obj = input as { command?: string; description?: string };
			return {
				command: obj.command || '',
				description: obj.description
			};
		}
		return { command: String(input) };
	}

	function formatInitToolInput(input: unknown): string {
		if (typeof input === 'string') return input;
		if (input && typeof input === 'object') {
			try {
				return JSON.stringify(input, null, 2);
			} catch {
				return String(input);
			}
		}
		return String(input);
	}

	function truncateText(str: string, len: number): string {
		if (str.length <= len) return str;
		return str.slice(0, len) + '...';
	}

	// Get the result for an init tool_use event by index
	function getInitToolResult(toolIndex: number): unknown {
		// Look for the next tool_result event after this tool_use
		for (let i = toolIndex + 1; i < initMessages.length; i++) {
			const msg = initMessages[i];
			if (msg.type === 'tool_result') {
				return msg.result;
			}
			// Stop if we hit another tool_use
			if (msg.type === 'tool_use') {
				break;
			}
		}
		return undefined;
	}

	// Check if an init tool is still running
	function isInitToolRunning(toolIndex: number): boolean {
		// Running if no result found yet
		return getInitToolResult(toolIndex) === undefined && isInitializing;
	}
</script>

{#if visible}
	<!-- Global drop zone for file attachments -->
	<GlobalDropZone
		enabled={isOpen && isInitialized}
		title="Drop files to attach"
		subtitle="Files will be added to your message"
		onDrop={handleFileDrop}
	/>

	<div class="sheet-overlay" class:open={animating} class:embedded onclick={handleBackdropClick} role="presentation">
		<div class="chat-sheet" class:open={animating} class:resizing={isResizing} class:embedded style="width: {embedded ? '100%' : `${sheetWidth}px`}">
			<div class="resize-handle" onmousedown={startResize} role="separator" aria-orientation="vertical"></div>
			<div class="sheet-header" style="border-color: {agentColor}">
				<div class="header-content">
					<div class="header-left">
						{#if agent}
							<div class="agent-info">
								<span class="agent-name">{agent.frontmatter.name}</span>
								{#if modelStyle}
									<span
										class="model-badge"
										style="background: {modelStyle.bg}; color: {modelStyle.color}"
									>
										{modelStyle.label}
									</span>
								{/if}
							</div>
							{#if agent.frontmatter.description}
								<p class="agent-description">{agent.frontmatter.description.substring(0, 100)}...</p>
							{/if}
						{:else}
							<div class="agent-info">
								<span class="agent-name">General Assistant</span>
								<span class="model-badge" style="background: #dbeafe; color: #2563eb">Claude</span>
							</div>
							<p class="agent-description">Chat with Claude about this project</p>
						{/if}
					</div>

					<div class="header-right">
						{#if isInitialized && messages.length > 0 && hasEndPrompt}
							<button
								class="wrap-up-btn"
								onclick={applyEndPrompt}
								title="Wrap up session and save context"
								disabled={isStreaming}
							>
								<Icon name="flag" size={16} />
								Wrap Up
							</button>
						{/if}
						{#if isInitialized && messages.length > 0}
							<button class="new-chat-btn" onclick={startNewChat} title="Start new chat">
								<Icon name="plus" size={16} />
								New Chat
							</button>
						{/if}
						{#if isInitialized}
							<div class="connection-status" class:connected={isConnected}>
								<span class="status-dot"></span>
								{isConnected ? 'Connected' : 'Connecting...'}
							</div>
						{/if}
						{#if !embedded}
							<button class="close-btn" onclick={handleClose}>
								<Icon name="x" size={20} />
							</button>
						{/if}
					</div>
				</div>
			</div>

			{#if isInitialized && sessionMetrics && showMetrics}
				<SessionMetricsBar
					metrics={sessionMetrics}
					onNewSession={startNewChat}
				/>
			{/if}

			{#if checkingInit}
				<!-- Loading state while checking initialization -->
				<div class="init-container">
					<div class="loading-state">
						<Icon name="loader" size={32} />
						<p>Checking Claude Code status...</p>
					</div>
				</div>
			{:else if !claudeConfigured}
				<!-- Claude CLI not installed -->
				<div class="init-container">
					<div class="init-prompt">
						<div class="init-icon">
							<Icon name="alert-circle" size={48} />
						</div>
						<h3>Claude Code Not Installed</h3>
						<p>
							Claude Code needs to be installed to use chat features.
							Please restart the app to complete the installation.
						</p>

						{#if claudeConfigError}
							<div class="init-error">
								<Icon name="alert-circle" size={16} />
								<span>{claudeConfigError}</span>
							</div>
						{/if}

						<div class="config-actions">
							<button
								class="init-btn"
								onclick={() => checkInitialization()}
							>
								<Icon name="refresh-cw" size={18} />
								Retry
							</button>
						</div>
					</div>
				</div>
			{:else if !isInitialized}
				<!-- Initialization prompt -->
				<div class="init-container">
					{#if isInitializing || initMessages.length > 0}
						<!-- Initialization in progress -->
						<div class="init-progress">
							<div class="init-header">
								<div class="init-header-left">
									<Icon name="terminal" size={24} />
									<h3>Initializing Claude Code</h3>
								</div>
								{#if isInitializing}
									<div class="init-status-indicator">
										<span class="init-pulse"></span>
										<span class="init-status-text">Claude is working...</span>
									</div>
								{:else}
									<div class="init-status-indicator complete">
										<Icon name="check-circle" size={18} />
										<span class="init-status-text">Complete</span>
									</div>
								{/if}
							</div>
							<div class="init-stream-wrapper">
								<div class="init-output" bind:this={initOutputContainer}>
									{#each initMessages as message, i (i)}
										{#if !shouldHideInitMessage(message, i)}
											{#if message.type === 'text' && message.content}
												<div class="init-stream-message init-text-message">
													<div class="init-message-content">{message.content}</div>
												</div>
											{:else if message.type === 'tool_use' && message.tool === 'Bash'}
												{@const bashInfo = getInitBashInfo(message.input)}
												<div class="init-stream-message">
													<ClaudeBashCommand
														command={bashInfo.command}
														description={bashInfo.description}
														result={initBashResults.get(i)}
														isRunning={initRunningBashIndex === i}
													/>
												</div>
											{:else if message.type === 'tool_use' && message.tool}
												<div class="init-stream-message">
													<ToolDisplay
														name={message.tool}
														input={message.input as Record<string, unknown> || {}}
														result={getInitToolResult(i)}
														isRunning={isInitToolRunning(i)}
														isDark={true}
													/>
												</div>
											{:else if message.type === 'status' && message.status}
												<div class="init-stream-message init-status-message">
													<Icon name="info" size={14} />
													<span>{message.status}</span>
												</div>
											{:else if message.type === 'done' && message.content}
												<div class="init-stream-message init-done-message">
													<Icon name="check-circle" size={14} />
													<span>{message.content}</span>
												</div>
											{/if}
										{/if}
									{/each}

									{#if initMessages.length === 0 && !initError}
										<div class="init-loading-placeholder">
											<Icon name="loader" size={24} />
											<span>Connecting to Claude...</span>
										</div>
									{/if}
								</div>

								<!-- Floating Todo List -->
								{#if initTodos.length > 0}
									<div class="init-floating-todos">
										<ClaudeTodoList todos={initTodos} />
									</div>
								{/if}
							</div>
						</div>
					{:else}
						<!-- Prompt to initialize -->
						<div class="init-prompt">
							<div class="init-icon">
								<Icon name="alert-triangle" size={48} />
							</div>
							<h3>Claude Code Not Initialized</h3>
							<p>
								This project doesn't have Claude Code set up yet. Claude Code needs a
								<code>.claude/</code> folder to store configuration and context about your project.
							</p>
							{#if initError}
								<div class="init-error">
									<Icon name="alert-circle" size={16} />
									<span>{initError}</span>
								</div>
							{/if}
							<button class="init-btn" onclick={startInitialization}>
								<Icon name="play" size={18} />
								Initialize Claude Code
							</button>
							<span class="init-hint">
								This will run <code>claude /init</code> in your project directory
							</span>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Normal chat interface -->
				<div class="messages-wrapper" class:dark-terminal={darkTerminal}>
					<div class="messages-container" class:dark-terminal={darkTerminal} bind:this={messagesContainer}>
						{#if messages.length === 0 && !claudeReady}
							<!-- Claude is loading and no history -->
							<div class="empty-state loading">
								<Icon name="loader" size={48} />
								<p>Starting Claude...</p>
								<span>Please wait while Claude Code initializes</span>
							</div>
						{:else if messages.length === 0}
							<div class="empty-state">
								<Icon name="message-circle" size={48} />
								<p>Start a conversation</p>
								<span>Ask questions about the project or request help with tasks</span>
							</div>
						{:else}
							<div class="messages-list">
								{#each messages as message (message.id)}
									<ChatMessage
										role={message.role}
										content={message.content}
										toolCalls={message.toolCalls}
										isStreaming={message.isStreaming}
										timestamp={message.timestamp}
										totalTokens={message.totalTokens}
									/>
								{/each}
							</div>
						{/if}

						{#if messages.length > 0 && !claudeReady}
							<div class="reconnecting-banner">
								<Icon name="loader" size={14} />
								<span>Reconnecting to Claude...</span>
							</div>
						{/if}

						{#if error}
							<div class="error-banner">
								<Icon name="alert-circle" size={16} />
								<span>{error}</span>
							</div>
						{/if}

						{#if authExpired}
							<div class="auth-expired-banner">
								<div class="auth-expired-content">
									<Icon name="lock" size={24} />
									<div class="auth-expired-text">
										<h4>Session Expired</h4>
										<p>Your Claude authentication has expired. Please log in again to continue.</p>
									</div>
								</div>
								<button
									class="login-btn"
									onclick={handleReLogin}
									disabled={isLoggingIn}
								>
									{#if isLoggingIn}
										<Icon name="loader" size={16} />
										<span>Logging in...</span>
									{:else}
										<Icon name="log-in" size={16} />
										<span>Log In</span>
									{/if}
								</button>
							</div>
						{/if}
					</div>

					<!-- Floating Todo List -->
					{#if currentTodos().length > 0}
						<div class="floating-todos">
							<ClaudeTodoList todos={currentTodos()} />
						</div>
					{/if}
				</div>

				{#if claudeStatus}
					<div class="status-bar">
						<div class="status-spinner"></div>
						<span class="status-word">{claudeStatus.statusWord || 'Processing'}…</span>
						{#if claudeStatus.elapsed}
							<span class="status-detail">{claudeStatus.elapsed}</span>
						{/if}
						{#if claudeStatus.tokens}
							<span class="status-detail">{claudeStatus.tokens}</span>
						{/if}
						{#if claudeStatus.state}
							<span class="status-state">{claudeStatus.state}</span>
						{/if}
					</div>
				{/if}

				<!-- Question panel for AskUserQuestion tool -->
				{#if pendingQuestions && pendingQuestions.length > 0}
					<ClaudeQuestionPanel
						questions={pendingQuestions}
						onsubmit={handleQuestionSubmit}
						oncancel={handleQuestionCancel}
					/>
				{/if}

				<ChatInput
					onsend={sendMessage}
					oncancel={cancelResponse}
					disabled={!isConnected || !claudeReady || (pendingQuestions !== null && pendingQuestions.length > 0)}
					{isStreaming}
					bind:mode={selectedMode}
					bind:model={selectedModel}
					bind:attachedFiles
					onOpenFolder={handleOpenFolder}
					onRef={handleChatInputRef}
				/>
			{/if}
		</div>
	</div>

	<!-- Skill Level Modal -->
	<SkillLevelModal
		isOpen={showSkillModal}
		onselect={handleSkillSelect}
		oncancel={handleSkillCancel}
	/>
{/if}

<style>
	.sheet-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 999;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.sheet-overlay.open {
		opacity: 1;
		pointer-events: auto;
	}

	.sheet-overlay.embedded {
		position: relative;
		background: transparent;
		z-index: auto;
		opacity: 1;
		pointer-events: auto;
		height: 100%;
	}

	.chat-sheet {
		position: fixed;
		top: 0;
		right: 0;
		max-width: 90vw;
		height: 100vh;
		background: #f9fafb;
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
		z-index: 1000;
		transform: translateX(100%);
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.1s ease;
		display: flex;
		flex-direction: column;
	}

	.chat-sheet.open {
		transform: translateX(0);
	}

	.chat-sheet.embedded {
		position: relative;
		top: auto;
		right: auto;
		max-width: 100%;
		height: 100%;
		box-shadow: none;
		z-index: auto;
		transform: none;
	}

	.chat-sheet.resizing {
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		user-select: none;
	}

	.resize-handle {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
		background: transparent;
		transition: background 0.15s ease;
		z-index: 10;
	}

	.chat-sheet.embedded .resize-handle {
		display: none;
	}

	.resize-handle:hover,
	.resize-handle:active {
		background: rgba(0, 0, 0, 0.08);
	}

	.resize-handle::after {
		content: '';
		position: absolute;
		left: 2px;
		top: 50%;
		transform: translateY(-50%);
		width: 2px;
		height: 32px;
		background: #d1d5db;
		border-radius: 1px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.resize-handle:hover::after {
		opacity: 1;
	}

	.sheet-header {
		padding: 16px 20px;
		background: #ffffff;
		border-bottom: 3px solid;
		flex-shrink: 0;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}

	.header-left {
		flex: 1;
		min-width: 0;
	}

	.agent-info {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.agent-name {
		font-size: 16px;
		font-weight: 600;
		color: #1f2937;
	}

	.model-badge {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 4px;
	}

	.agent-description {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #9ca3af;
	}

	.connection-status.connected {
		color: #10b981;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #9ca3af;
	}

	.connection-status.connected .status-dot {
		background: #10b981;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.new-chat-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.new-chat-btn:hover {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.wrap-up-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid #fcd34d;
		background: #fef3c7;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #92400e;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.wrap-up-btn:hover:not(:disabled) {
		background: #fde68a;
		border-color: #fbbf24;
	}

	.wrap-up-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: #f3f4f6;
		border-radius: 8px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	/* Initialization states */
	.init-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.loading-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: #6b7280;
	}

	.loading-state :global(.icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.loading-state p {
		margin: 0;
		font-size: 14px;
	}

	.init-prompt {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 24px;
		text-align: center;
	}

	.init-icon {
		color: #f59e0b;
		margin-bottom: 16px;
	}

	.init-prompt h3 {
		margin: 0 0 12px;
		font-size: 20px;
		font-weight: 600;
		color: #1f2937;
	}

	.init-prompt p {
		margin: 0 0 24px;
		font-size: 14px;
		color: #6b7280;
		line-height: 1.6;
		max-width: 340px;
	}

	.init-prompt code {
		background: #f3f4f6;
		padding: 2px 6px;
		border-radius: 4px;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 0.9em;
	}

	.init-error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		margin-bottom: 16px;
		font-size: 13px;
		color: #dc2626;
	}

	.init-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		background: #2563eb;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.init-btn:hover {
		background: #1d4ed8;
	}

	.init-hint {
		margin-top: 16px;
		font-size: 12px;
		color: #9ca3af;
	}

	/* Claude CLI configuration styles */
	.config-actions {
		margin-bottom: 24px;
	}

	.init-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.init-btn :global(.icon) {
		flex-shrink: 0;
	}

	.config-manual {
		width: 100%;
		max-width: 340px;
		margin-bottom: 24px;
	}

	.config-label {
		margin: 0 0 8px;
		font-size: 13px;
		color: #6b7280;
		text-align: left;
	}

	.config-input-row {
		display: flex;
		gap: 8px;
	}

	.config-input {
		flex: 1;
		padding: 10px 12px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 13px;
		font-family: 'SF Mono', 'Consolas', monospace;
		background: #ffffff;
	}

	.config-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.config-input:disabled {
		background: #f3f4f6;
		color: #9ca3af;
	}

	.config-set-btn {
		padding: 10px 16px;
		background: #1f2937;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.config-set-btn:hover:not(:disabled) {
		background: #374151;
	}

	.config-set-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.config-help {
		margin-top: 8px;
	}

	.config-help p {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
	}

	.config-help a {
		color: #2563eb;
		text-decoration: none;
	}

	.config-help a:hover {
		text-decoration: underline;
	}

	.init-progress {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 12px;
		margin: 16px;
	}

	.init-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		background: #1f2937;
		color: #ffffff;
		border-radius: 12px 12px 0 0;
	}

	.init-header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.init-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}

	.init-status-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #3b82f6;
	}

	.init-status-indicator.complete {
		color: #22c55e;
	}

	.init-status-text {
		font-weight: 500;
	}

	.init-pulse {
		width: 8px;
		height: 8px;
		background: #3b82f6;
		border-radius: 50%;
		animation: init-pulse 1.5s ease-in-out infinite;
	}

	@keyframes init-pulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.8);
		}
	}

	.init-stream-wrapper {
		flex: 1;
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.init-output {
		flex: 1;
		background: #1a1a2e;
		padding: 16px;
		padding-bottom: 24px;
		overflow-y: auto;
		font-family: 'SF Mono', Monaco, 'Consolas', monospace;
		font-size: 13px;
		line-height: 1.6;
		border-radius: 0 0 12px 12px;
	}

	.init-floating-todos {
		position: sticky;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 12px;
		background: #1a1a2e;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		pointer-events: none;
	}

	.init-floating-todos > :global(*) {
		pointer-events: auto;
	}

	.init-stream-message {
		margin-bottom: 12px;
	}

	.init-text-message .init-message-content {
		color: #e2e8f0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.init-tool-message {
		background: rgba(59, 130, 246, 0.1);
		border-left: 3px solid #3b82f6;
		border-radius: 0 8px 8px 0;
		padding: 10px 12px;
	}

	.init-tool-header {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #60a5fa;
		font-weight: 500;
		margin-bottom: 6px;
	}

	.init-tool-name {
		text-transform: capitalize;
	}

	.init-tool-input {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		padding: 8px 10px;
		overflow-x: auto;
	}

	.init-tool-input code {
		color: #94a3b8;
		font-size: 11px;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.init-status-message {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #94a3b8;
		font-size: 12px;
		padding: 4px 0;
	}

	.init-done-message {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #22c55e;
		font-size: 13px;
		font-weight: 500;
		padding: 8px 0;
	}

	.init-loading-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		height: 200px;
		color: #64748b;
	}

	.init-loading-placeholder :global(.icon) {
		animation: spin 1s linear infinite;
	}

	/* Chat interface */
	.messages-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		position: relative;
		min-height: 0;
		overflow: hidden;
	}

	.messages-wrapper.dark-terminal {
		background: #0a0a0a;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		padding-bottom: 24px;
	}

	.messages-container.dark-terminal {
		background: #0a0a0a;
	}

	.messages-container.dark-terminal .empty-state {
		color: #9ca3af;
	}

	.messages-container.dark-terminal .empty-state :global(svg) {
		color: #4b5563;
	}

	.floating-todos {
		position: sticky;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 12px 16px;
		background: #f9fafb;
		border-top: 1px solid #e5e7eb;
		pointer-events: none;
	}

	.floating-todos > :global(*) {
		pointer-events: auto;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #9ca3af;
		text-align: center;
		padding: 40px 20px;
	}

	.empty-state p {
		margin: 16px 0 4px;
		font-size: 16px;
		font-weight: 500;
		color: #6b7280;
	}

	.empty-state span {
		font-size: 14px;
	}

	.empty-state.loading :global(.icon) {
		animation: spin 1s linear infinite;
		color: #2563eb;
	}

	.messages-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		margin-top: 12px;
		font-size: 13px;
		color: #dc2626;
	}

	.reconnecting-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		background: #fefce8;
		border: 1px solid #fde047;
		border-radius: 8px;
		margin-top: 12px;
		font-size: 13px;
		color: #a16207;
	}

	.reconnecting-banner :global(.icon) {
		animation: spin 1s linear infinite;
	}

	.auth-expired-banner {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px;
		background: #fef3c7;
		border: 1px solid #fbbf24;
		border-radius: 12px;
		margin-top: 16px;
	}

	.auth-expired-content {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		color: #92400e;
	}

	.auth-expired-text h4 {
		margin: 0 0 4px 0;
		font-size: 15px;
		font-weight: 600;
		color: #78350f;
	}

	.auth-expired-text p {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: #92400e;
	}

	.login-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 20px;
		background: #2563eb;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.login-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.login-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.login-btn :global(.icon) {
		flex-shrink: 0;
	}

	.login-btn:disabled :global(.icon) {
		animation: spin 1s linear infinite;
	}

	/* Status bar */
	.status-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: #f0f9ff;
		border-top: 1px solid #bae6fd;
		font-size: 13px;
		color: #0369a1;
	}

	.status-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid #bae6fd;
		border-top-color: #0369a1;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.status-word {
		font-weight: 500;
	}

	.status-detail {
		color: #0284c7;
		opacity: 0.8;
	}

	.status-detail::before {
		content: '·';
		margin-right: 8px;
	}

	.status-state {
		margin-left: auto;
		font-size: 12px;
		color: #0284c7;
		opacity: 0.7;
	}

</style>
