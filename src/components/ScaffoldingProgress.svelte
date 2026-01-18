<script lang="ts">
	import Icon from './Icon.svelte';
	import ClaudeBashCommand from './ClaudeBashCommand.svelte';
	import ToolDisplay from './ToolDisplay.svelte';

	interface TodoItem {
		content: string;
		status: 'pending' | 'in_progress' | 'completed';
		activeForm: string;
	}

	interface StreamMessage {
		type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'init' | 'done' | 'error';
		content?: string;
		tool?: string;
		input?: unknown;
		result?: string;
		status?: string;
	}

	let {
		messages = [],
		error = null,
		isComplete = false,
		projectName = '',
		onViewProject,
		onCreateAnother
	}: {
		messages?: StreamMessage[];
		error?: string | null;
		isComplete?: boolean;
		projectName?: string;
		onViewProject?: () => void;
		onCreateAnother?: () => void;
	} = $props();

	let outputRef = $state<HTMLDivElement | null>(null);
	let showDebugLogs = $state(false);

	// Track the current todos from TodoWrite tool calls
	let currentTodos = $state<TodoItem[]>([]);

	// Track which tool_use messages have received results
	let toolResults = $state<Map<number, unknown>>(new Map());
	let runningToolIndex = $state<number | null>(null);

	// Track previous active task for transition animation
	let previousActiveIndex = $state<number>(-1);

	// Process messages to extract todos and pair tool calls with results
	$effect(() => {
		let latestTodos: TodoItem[] = [];
		const results = new Map<number, unknown>();
		let currentToolIdx: number | null = null;

		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];

			// Extract todos from TodoWrite tool calls
			if (msg.type === 'tool_use' && msg.tool === 'TodoWrite' && msg.input) {
				const input = msg.input as { todos?: TodoItem[] };
				if (input.todos && Array.isArray(input.todos)) {
					latestTodos = input.todos;
				}
			}

			// Track all tool calls and their results
			if (msg.type === 'tool_use' && msg.tool) {
				currentToolIdx = i;
			}

			if (msg.type === 'tool_result' && currentToolIdx !== null) {
				results.set(currentToolIdx, msg.result);
				currentToolIdx = null;
			}
		}

		currentTodos = latestTodos;
		toolResults = results;

		// Find if there's a running tool (tool_use without result yet)
		runningToolIndex = null;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.type === 'tool_result') break;
			if (msg.type === 'tool_use' && msg.tool) {
				runningToolIndex = i;
				break;
			}
		}
	});

	// Calculate derived values
	let completedCount = $derived(currentTodos.filter(t => t.status === 'completed').length);
	let totalCount = $derived(currentTodos.length);
	let progressPercent = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

	// Find the current active task (in_progress)
	let activeTaskIndex = $derived(currentTodos.findIndex(t => t.status === 'in_progress'));
	let activeTask = $derived(activeTaskIndex >= 0 ? currentTodos[activeTaskIndex] : null);

	// Track task transitions for animation
	$effect(() => {
		if (activeTaskIndex !== previousActiveIndex && activeTaskIndex >= 0) {
			previousActiveIndex = activeTaskIndex;
		}
	});

	// Auto-scroll debug log to bottom when new messages arrive
	$effect(() => {
		if (outputRef && messages.length > 0 && showDebugLogs) {
			outputRef.scrollTop = outputRef.scrollHeight;
		}
	});

	// Automatically show debug logs on error
	$effect(() => {
		if (error) {
			showDebugLogs = true;
		}
	});

	// Check if a message should be hidden
	function shouldHideMessage(msg: StreamMessage): boolean {
		// Hide TodoWrite tool calls
		if (msg.type === 'tool_use' && msg.tool === 'TodoWrite') return true;
		// Hide all tool_result messages
		if (msg.type === 'tool_result') return true;
		return false;
	}

	// Extract Bash command info
	function getBashInfo(input: unknown): { command: string; description?: string } {
		if (input && typeof input === 'object') {
			const obj = input as { command?: string; description?: string };
			return {
				command: obj.command || '',
				description: obj.description
			};
		}
		return { command: String(input) };
	}

	// Calculate stroke dasharray for progress ring
	const circumference = 2 * Math.PI * 54; // radius = 54
	let strokeDashoffset = $derived(circumference - (progressPercent / 100) * circumference);

	// Get current running tool info for fallback display
	let currentToolInfo = $derived.by(() => {
		if (runningToolIndex === null) return null;
		const msg = messages[runningToolIndex];
		if (!msg || msg.type !== 'tool_use') return null;

		const tool = msg.tool || 'Working';
		const input = msg.input as Record<string, unknown> | undefined;

		// Try to get a description
		let description = input?.description as string | undefined;
		if (!description && tool === 'Bash' && input?.command) {
			// Truncate long commands
			const cmd = String(input.command);
			description = cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd;
		}

		return { tool, description };
	});

	// Check if we have any activity (messages beyond init)
	let hasActivity = $derived(messages.some(m => m.type === 'tool_use' || m.type === 'text'));
</script>

<div class="progress-container">
	<!-- Main Content Area -->
	<div class="main-content">
		{#if isComplete}
			<!-- Success State -->
			<div class="success-state">
				<div class="success-icon">
					<Icon name="check" size={48} />
				</div>
				<h1 class="success-title">{projectName || 'Your Project'} is ready!</h1>
				<p class="success-subtitle">Your project has been successfully created and configured.</p>

				{#if onViewProject || onCreateAnother}
					<div class="action-buttons">
						{#if onViewProject}
							<button class="action-btn primary" onclick={onViewProject}>
								<Icon name="folder" size={20} />
								View Project
							</button>
						{/if}
						{#if onCreateAnother}
							<button class="action-btn secondary" onclick={onCreateAnother}>
								<Icon name="plus" size={20} />
								Create Another
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else if error}
			<!-- Error State -->
			<div class="error-state">
				<div class="error-icon">
					<Icon name="alert-circle" size={48} />
				</div>
				<h1 class="error-title">Something went wrong</h1>
				<p class="error-subtitle">{error}</p>

				<button class="toggle-logs-btn" onclick={() => showDebugLogs = !showDebugLogs}>
					<Icon name={showDebugLogs ? 'chevron-up' : 'chevron-down'} size={16} />
					{showDebugLogs ? 'Hide' : 'Show'} debug logs
				</button>
			</div>
		{:else if currentTodos.length > 0}
			<!-- Active Task State -->
			<div class="task-display">
				<!-- Progress Ring -->
				<div class="progress-ring-container">
					<svg class="progress-ring" viewBox="0 0 120 120">
						<circle
							class="progress-ring-bg"
							cx="60"
							cy="60"
							r="54"
							fill="none"
							stroke-width="6"
						/>
						<circle
							class="progress-ring-fill"
							cx="60"
							cy="60"
							r="54"
							fill="none"
							stroke-width="6"
							stroke-linecap="round"
							stroke-dasharray={circumference}
							stroke-dashoffset={strokeDashoffset}
						/>
					</svg>
					<div class="progress-ring-content">
						<!-- Show current task number (1-indexed) if active, otherwise completed count -->
						<span class="progress-count">{activeTaskIndex >= 0 ? activeTaskIndex + 1 : completedCount}</span>
						<span class="progress-total">of {totalCount}</span>
					</div>
				</div>

				<!-- Current Task Info (no spinner - the ring is animated) -->
				{#if activeTask}
					<div class="current-task" key={activeTaskIndex}>
						<h1 class="task-title">{activeTask.activeForm}</h1>
						<p class="task-description">{activeTask.content}</p>
					</div>
				{:else}
					<div class="current-task">
						<h1 class="task-title">Finishing up...</h1>
						<p class="task-description">Completing final steps</p>
					</div>
				{/if}

				<!-- Task List Preview -->
				<div class="task-list-preview">
					{#each currentTodos as todo, i (i)}
						<div
							class="task-dot"
							class:completed={todo.status === 'completed'}
							class:active={todo.status === 'in_progress'}
							class:pending={todo.status === 'pending'}
							title={todo.content}
						></div>
					{/each}
				</div>
			</div>
		{:else if hasActivity}
			<!-- Fallback Working State (when no todos but activity is happening) -->
			<div class="task-display">
				<div class="working-indicator">
					<div class="working-spinner"></div>
				</div>

				<div class="current-task">
					{#if currentToolInfo}
						<h1 class="task-title">Running {currentToolInfo.tool}...</h1>
						{#if currentToolInfo.description}
							<p class="task-description">{currentToolInfo.description}</p>
						{/if}
					{:else}
						<h1 class="task-title">Setting up your project...</h1>
						<p class="task-description">Claude is working on {projectName || 'your project'}</p>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Initial Loading State -->
			<div class="loading-state">
				<div class="loading-spinner-large"></div>
				<h1 class="loading-title">Creating {projectName || 'Your Project'}</h1>
				<p class="loading-subtitle">Connecting to Claude...</p>
			</div>
		{/if}
	</div>

	<!-- Debug Logs Panel (collapsible) -->
	{#if showDebugLogs}
		<div class="debug-panel">
			<div class="debug-header">
				<div class="debug-header-left">
					<Icon name="terminal" size={14} />
					<span>Debug Logs</span>
				</div>
				<button class="debug-close" onclick={() => showDebugLogs = false}>
					<Icon name="x" size={14} />
				</button>
			</div>
			<div class="debug-content" bind:this={outputRef}>
				{#each messages as message, i (i)}
					{#if !shouldHideMessage(message)}
						{#if message.type === 'text' && message.content}
							<div class="stream-message text-message">
								<div class="message-content">{message.content}</div>
							</div>
						{:else if message.type === 'tool_use' && message.tool === 'Bash'}
							{@const bashInfo = getBashInfo(message.input)}
							{@const bashResult = toolResults.get(i)}
							<div class="stream-message">
								<ClaudeBashCommand
									command={bashInfo.command}
									description={bashInfo.description}
									result={typeof bashResult === 'string' ? bashResult : undefined}
									isRunning={runningToolIndex === i}
								/>
							</div>
						{:else if message.type === 'tool_use' && message.tool}
							<div class="stream-message">
								<ToolDisplay
									name={message.tool}
									input={(message.input as Record<string, unknown>) || {}}
									result={toolResults.get(i)}
									isRunning={runningToolIndex === i}
									isDark={true}
								/>
							</div>
						{:else if message.type === 'status' && message.status}
							<div class="stream-message status-message">
								<Icon name="info" size={14} />
								<span>{message.status}</span>
							</div>
						{/if}
					{/if}
				{/each}

				{#if messages.length === 0}
					<div class="debug-empty">
						<Icon name="inbox" size={20} />
						<span>No logs yet...</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Show Logs Toggle (when not in error state) -->
	{#if !error && !isComplete && messages.length > 0}
		<button
			class="show-logs-toggle"
			onclick={() => showDebugLogs = !showDebugLogs}
			title={showDebugLogs ? 'Hide logs' : 'Show logs'}
		>
			<Icon name="terminal" size={16} />
		</button>
	{/if}
</div>

<style>
	.progress-container {
		display: flex;
		flex-direction: column;
		flex: 1;
		background: #fafbfc;
		position: relative;
	}

	/* Main Content Area */
	.main-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 48px 24px;
		min-height: 0;
	}

	/* Success State */
	.success-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 400px;
		animation: fadeIn 0.5s ease;
	}

	.success-icon {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		margin-bottom: 24px;
		box-shadow: 0 8px 24px rgba(34, 197, 94, 0.3);
	}

	.success-title {
		font-family: 'Hedvig Letters Serif', serif;
		font-size: 28px;
		font-weight: 400;
		color: #1f2937;
		margin: 0 0 8px 0;
	}

	.success-subtitle {
		font-family: 'Figtree', sans-serif;
		font-size: 15px;
		color: #6b7280;
		margin: 0 0 32px 0;
	}

	/* Error State */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 400px;
		animation: fadeIn 0.5s ease;
	}

	.error-icon {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		margin-bottom: 24px;
		box-shadow: 0 8px 24px rgba(239, 68, 68, 0.3);
	}

	.error-title {
		font-family: 'Figtree', sans-serif;
		font-size: 28px;
		font-weight: 700;
		color: #1f2937;
		margin: 0 0 8px 0;
	}

	.error-subtitle {
		font-family: 'Figtree', sans-serif;
		font-size: 15px;
		color: #6b7280;
		margin: 0 0 24px 0;
		max-width: 300px;
	}

	.toggle-logs-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-family: 'Figtree', sans-serif;
		font-size: 13px;
		font-weight: 500;
		color: #4b5563;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toggle-logs-btn:hover {
		background: #e5e7eb;
	}

	/* Active Task State */
	.task-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 500px;
	}

	.progress-ring-container {
		position: relative;
		width: 120px;
		height: 120px;
		margin-bottom: 32px;
	}

	.progress-ring {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.progress-ring-bg {
		stroke: #e5e7eb;
	}

	.progress-ring-fill {
		stroke: #3b82f6;
		transition: stroke-dashoffset 0.5s ease;
	}

	.progress-ring-content {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.progress-count {
		font-family: 'Figtree', sans-serif;
		font-size: 32px;
		font-weight: 700;
		color: #1f2937;
		line-height: 1;
	}

	.progress-total {
		font-family: 'Figtree', sans-serif;
		font-size: 12px;
		color: #6b7280;
		margin-top: 2px;
	}

	.current-task {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: fadeIn 0.4s ease;
	}

	.task-title {
		font-family: 'Hedvig Letters Serif', serif;
		font-size: 26px;
		font-weight: 400;
		color: #1f2937;
		margin: 0 0 8px 0;
		line-height: 1.3;
	}

	.task-description {
		font-family: 'Figtree', sans-serif;
		font-size: 14px;
		color: #6b7280;
		margin: 0;
		max-width: 350px;
	}

	/* Task List Preview (dots) */
	.task-list-preview {
		display: flex;
		gap: 8px;
		margin-top: 40px;
	}

	.task-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		transition: all 0.3s ease;
	}

	.task-dot.completed {
		background: #22c55e;
	}

	.task-dot.active {
		background: #3b82f6;
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
		animation: pulse 1.5s ease infinite;
	}

	.task-dot.pending {
		background: #d1d5db;
	}

	/* Working Indicator (fallback when no todos) */
	.working-indicator {
		width: 120px;
		height: 120px;
		margin-bottom: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.working-spinner {
		width: 64px;
		height: 64px;
		border: 4px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		animation: fadeIn 0.5s ease;
	}

	.loading-spinner-large {
		width: 48px;
		height: 48px;
		border: 4px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 24px;
	}

	.loading-title {
		font-family: 'Hedvig Letters Serif', serif;
		font-size: 28px;
		font-weight: 400;
		color: #1f2937;
		margin: 0 0 8px 0;
	}

	.loading-subtitle {
		font-family: 'Figtree', sans-serif;
		font-size: 14px;
		color: #6b7280;
		margin: 0;
	}

	/* Action Buttons */
	.action-buttons {
		display: flex;
		gap: 12px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 24px;
		border-radius: 10px;
		font-size: 15px;
		font-weight: 600;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn.primary {
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
		border: none;
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.action-btn.primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
	}

	.action-btn.secondary {
		background: #ffffff;
		border: 1px solid #d1d5db;
		color: #374151;
	}

	.action-btn.secondary:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	/* Debug Panel */
	.debug-panel {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 300px;
		background: #1a1a2e;
		border-top: 1px solid #334155;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease;
	}

	.debug-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #0f172a;
		border-bottom: 1px solid #334155;
	}

	.debug-header-left {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #94a3b8;
		font-family: 'Figtree', sans-serif;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.debug-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: transparent;
		border: none;
		color: #64748b;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.debug-close:hover {
		background: #334155;
		color: #94a3b8;
	}

	.debug-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		font-family: 'SF Mono', Monaco, 'Consolas', monospace;
		font-size: 12px;
		line-height: 1.6;
	}

	.debug-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 100%;
		color: #64748b;
	}

	.stream-message {
		margin-bottom: 12px;
	}

	.text-message .message-content {
		color: #e2e8f0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.status-message {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #94a3b8;
		font-size: 12px;
		padding: 4px 0;
	}

	/* Show Logs Toggle Button */
	.show-logs-toggle {
		position: absolute;
		bottom: 16px;
		right: 16px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: #1f2937;
		border: none;
		color: #9ca3af;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.show-logs-toggle:hover {
		background: #374151;
		color: #e5e7eb;
		transform: scale(1.05);
	}

	/* Animations */
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.1);
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
</style>
