<script lang="ts">
	import { browser } from '$app/environment';
	import type { Issue, TaskRun, TaskRunEvent, TaskRunStatus, EpicSequence } from '$lib/types';
	import Icon from './Icon.svelte';
	import ChatInput from './ChatInput.svelte';
	import ClaudeTodoList, { type TodoItem } from './ClaudeTodoList.svelte';
	import ClaudeBashCommand from './ClaudeBashCommand.svelte';
	import ToolDisplay from './ToolDisplay.svelte';

	let {
		isOpen,
		onclose,
		projectId,
		initialIssue = null,
		initialMode = 'autonomous'
	}: {
		isOpen: boolean;
		onclose: () => void;
		projectId: string;
		initialIssue?: Issue | null;
		initialMode?: 'autonomous' | 'guided';
	} = $props();

	// Run state
	let runId = $state<string | null>(null);
	let issueId = $state<string | null>(null);
	let issueTitle = $state<string>('');
	let issueType = $state<string>('task');
	let issueStatus = $state<string>('open');
	let mode = $state<'autonomous' | 'guided'>('autonomous');
	let status = $state<TaskRunStatus>('queued');
	let epicSequence = $state<EpicSequence | null>(null);
	let awaitingUserInput = $state(false);
	let events = $state<TaskRunEvent[]>([]);

	// Connection state
	let isConnected = $state(false);
	let isStarting = $state(false);
	let error = $state<string | null>(null);

	// Event source for SSE
	let eventSource: EventSource | null = null;

	// UI refs
	let outputContainer: HTMLDivElement | null = $state(null);

	// Animation state
	let visible = $state(false);
	let animating = $state(false);

	// Resizable width
	const MIN_WIDTH = 450;
	const MAX_WIDTH = 1000;
	let panelWidth = $state(600);
	let isResizing = $state(false);
	let justFinishedResizing = $state(false);

	// Derived states
	let isRunning = $derived(status === 'running' || status === 'queued');
	let isPaused = $derived(status === 'paused');
	let isComplete = $derived(status === 'completed' || status === 'failed' || status === 'cancelled');
	let canSendMessage = $derived((mode === 'guided' && isRunning) || awaitingUserInput);
	let isInProgress = $derived(issueStatus === 'in_progress');

	let statusColor = $derived(() => {
		switch (status) {
			case 'running': return '#2563eb';
			case 'queued': return '#6b7280';
			case 'paused': return '#d97706';
			case 'completed': return '#059669';
			case 'failed': return '#dc2626';
			case 'cancelled': return '#9ca3af';
			default: return '#6b7280';
		}
	});

	let statusLabel = $derived(() => {
		switch (status) {
			case 'running': return 'Running';
			case 'queued': return 'Starting...';
			case 'paused': return 'Paused';
			case 'completed': return 'Completed';
			case 'failed': return 'Failed';
			case 'cancelled': return 'Cancelled';
			default: return status;
		}
	});

	// Track if task has been explicitly started by user
	let hasStarted = $state(false);

	// Open/close animation
	$effect(() => {
		if (isOpen) {
			visible = true;
			requestAnimationFrame(() => {
				animating = true;
			});
			// Set up issue info but don't auto-start
			if (browser && initialIssue && !runId) {
				issueId = initialIssue.id;
				issueTitle = initialIssue.title;
				issueType = initialIssue.issue_type;
				issueStatus = initialIssue.status;
				mode = initialMode;
				// Check for existing active run to reconnect, but don't start new ones
				checkForExistingRun();
			}
		} else if (visible) {
			animating = false;
			setTimeout(() => {
				visible = false;
				resetState();
			}, 300);
		}
	});

	// Auto-scroll output
	$effect(() => {
		if (events.length > 0 && outputContainer) {
			outputContainer.scrollTop = outputContainer.scrollHeight;
		}
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
		};
	});

	function resetState() {
		runId = null;
		issueId = null;
		issueTitle = '';
		issueType = 'task';
		issueStatus = 'open';
		mode = 'autonomous';
		status = 'queued';
		epicSequence = null;
		awaitingUserInput = false;
		events = [];
		isConnected = false;
		isStarting = false;
		hasStarted = false;
		error = null;
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	}

	async function checkForExistingRun() {
		if (!issueId) return;

		try {
			// Check if there's already an active run for this issue
			const listResponse = await fetch(`/api/projects/${projectId}/task-runner`);
			if (listResponse.ok) {
				const listData = await listResponse.json();
				const existingRun = listData.runs?.find(
					(r: { issueId: string; status: string }) =>
						r.issueId === issueId &&
						(r.status === 'running' || r.status === 'queued' || r.status === 'paused')
				);

				if (existingRun) {
					// Reconnect to existing run
					hasStarted = true;
					await reconnectToRun(existingRun.id);
				}
			}
		} catch (err) {
			console.error('Error checking for existing run:', err);
			// Don't show error - user can still start manually
		}
	}

	async function handleStartTask() {
		hasStarted = true;
		await startTask();
	}

	async function reconnectToRun(existingRunId: string) {
		try {
			// Fetch full run details including events
			const response = await fetch(`/api/projects/${projectId}/task-runner/${existingRunId}`);
			if (!response.ok) {
				throw new Error('Failed to fetch run details');
			}

			const data = await response.json();

			// Restore state from existing run
			runId = data.id;
			issueId = data.issueId;
			issueTitle = data.issueTitle;
			issueType = data.issueType;
			mode = data.mode;
			status = data.status;
			awaitingUserInput = data.awaitingUserInput || false;

			if (data.epicSequence) {
				epicSequence = data.epicSequence;
			}

			// Load existing events
			if (data.events && Array.isArray(data.events)) {
				events = data.events;
			}

			// Connect to SSE stream for new updates (skip history since we already loaded events)
			connectToStream(existingRunId, true);
		} catch (err) {
			console.error('Error reconnecting to run:', err);
			error = err instanceof Error ? err.message : 'Failed to reconnect to run';
		} finally {
			isStarting = false;
		}
	}

	async function startTask() {
		if (!issueId) return;

		isStarting = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/task-runner`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					issueId,
					mode
				})
			});

			if (!response.ok) {
				const data = await response.json();
				// If there's already an active run, try to reconnect to it
				if (response.status === 409 && data.existingRunId) {
					await reconnectToRun(data.existingRunId);
					return;
				}
				throw new Error(data.error || 'Failed to start task');
			}

			const data = await response.json();
			runId = data.runId;
			issueTitle = data.issueTitle || issueTitle;
			issueType = data.issueType || issueType;

			if (data.epicSequence) {
				epicSequence = {
					totalTasks: data.epicSequence.totalTasks,
					currentIndex: 0,
					taskIds: data.epicSequence.taskIds,
					completedTaskIds: [],
					failedTaskIds: []
				};
			}

			// Connect to SSE stream
			connectToStream(data.runId);
		} catch (err) {
			console.error('Error starting task:', err);
			error = err instanceof Error ? err.message : 'Failed to start task';
		} finally {
			isStarting = false;
		}
	}

	function connectToStream(rid: string, skipHistory: boolean = false) {
		if (eventSource) {
			eventSource.close();
		}

		const url = `/api/projects/${projectId}/task-runner/${rid}/stream${skipHistory ? '?skipHistory=true' : ''}`;
		eventSource = new EventSource(url);

		eventSource.onopen = () => {
			isConnected = true;
			error = null;
		};

		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);
				handleStreamMessage(data);
			} catch (err) {
				console.error('Error parsing stream message:', err);
			}
		};

		eventSource.onerror = () => {
			isConnected = false;
			// Try to reconnect after a delay if still open
			setTimeout(() => {
				if (isOpen && runId && !isComplete) {
					connectToStream(runId);
				}
			}, 3000);
		};
	}

	function handleStreamMessage(data: {
		type: string;
		run?: Partial<TaskRun>;
		event?: TaskRunEvent;
		status?: TaskRunStatus;
		reason?: string;
		epicSequence?: EpicSequence;
		awaiting?: boolean;
		message?: string;
	}) {
		switch (data.type) {
			case 'connected':
				isConnected = true;
				break;

			case 'state':
				if (data.run) {
					status = data.run.status || status;
					epicSequence = data.run.epicSequence || epicSequence;
					awaitingUserInput = data.run.awaitingUserInput || false;
				}
				break;

			case 'event':
				if (data.event) {
					events = [...events, data.event];
				}
				break;

			case 'status':
				if (data.status) {
					status = data.status;
				}
				break;

			case 'epic_progress':
				if (data.epicSequence) {
					epicSequence = data.epicSequence;
				}
				break;

			case 'awaiting_input':
				awaitingUserInput = data.awaiting || false;
				if (data.awaiting) {
					status = 'paused';
				}
				break;
		}
	}

	async function stopTask() {
		if (!runId) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/task-runner/${runId}/stop`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to stop task');
			}

			status = 'cancelled';
		} catch (err) {
			console.error('Error stopping task:', err);
			error = err instanceof Error ? err.message : 'Failed to stop task';
		}
	}

	async function sendMessage(content: string) {
		if (!runId || !content.trim()) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/task-runner/${runId}/message`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: content })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to send message');
			}

			// Message sent successfully - UI will update via SSE
		} catch (err) {
			console.error('Error sending message:', err);
			error = err instanceof Error ? err.message : 'Failed to send message';
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
		panelWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
	}

	function stopResize() {
		isResizing = false;
		justFinishedResizing = true;
		setTimeout(() => {
			justFinishedResizing = false;
		}, 100);
		document.removeEventListener('mousemove', handleResize);
		document.removeEventListener('mouseup', stopResize);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	function handleClose() {
		if (isResizing) {
			stopResize();
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		onclose();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (isResizing || justFinishedResizing) return;
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function formatEventContent(event: TaskRunEvent): string {
		if (event.type === 'tool_use' && event.toolName) {
			return `[Tool] ${event.toolName}`;
		}
		if (event.type === 'tool_result') {
			return '[Tool Result]';
		}
		return event.content || '';
	}

	function getEventIcon(event: TaskRunEvent): string {
		switch (event.type) {
			case 'tool_use': return 'terminal';
			case 'tool_result': return 'check-circle';
			case 'error': return 'alert-circle';
			case 'status_change': return 'info';
			case 'completion_signal': return 'flag';
			default: return 'message-circle';
		}
	}

	function getEventColor(event: TaskRunEvent): string {
		switch (event.type) {
			case 'tool_use': return '#8b5cf6';
			case 'tool_result': return '#10b981';
			case 'error': return '#ef4444';
			case 'status_change': return '#3b82f6';
			case 'completion_signal': return '#f59e0b';
			default: return '#6b7280';
		}
	}

	// Extract current todos from events
	let currentTodos = $derived(() => {
		let latestTodos: TodoItem[] = [];
		for (const event of events) {
			if (event.type === 'tool_use' && event.toolName === 'TodoWrite' && event.toolInput) {
				const input = event.toolInput as { todos?: TodoItem[] };
				if (input.todos && Array.isArray(input.todos)) {
					latestTodos = input.todos;
				}
			}
		}
		return latestTodos;
	});

	// Check if an event should be hidden (TodoWrite events are shown in floating list)
	function shouldHideEvent(event: TaskRunEvent): boolean {
		if (event.type === 'tool_use' && event.toolName === 'TodoWrite') return true;
		if (event.type === 'tool_result') {
			// Find the previous event to check if it was TodoWrite
			const idx = events.indexOf(event);
			if (idx > 0) {
				const prevEvent = events[idx - 1];
				if (prevEvent.type === 'tool_use' && prevEvent.toolName === 'TodoWrite') return true;
			}
		}
		return false;
	}

	// Check if an event is a Bash command
	function isBashEvent(event: TaskRunEvent): boolean {
		return event.type === 'tool_use' && event.toolName === 'Bash';
	}

	// Extract Bash command info from event
	function getBashInfo(event: TaskRunEvent): { command: string; description?: string } {
		const input = event.toolInput as { command?: string; description?: string } | undefined;
		return {
			command: input?.command || '',
			description: input?.description
		};
	}

	// Find result for a Bash command event
	function getBashResult(event: TaskRunEvent): string | undefined {
		const idx = events.indexOf(event);
		if (idx >= 0 && idx < events.length - 1) {
			const nextEvent = events[idx + 1];
			if (nextEvent.type === 'tool_result' && typeof nextEvent.toolResult === 'string') {
				return nextEvent.toolResult;
			}
		}
		return undefined;
	}

	// Check if Bash command is still running
	function isBashRunning(event: TaskRunEvent): boolean {
		const idx = events.indexOf(event);
		// Running if it's the last event or next event isn't a result
		if (idx === events.length - 1) return isRunning;
		const nextEvent = events[idx + 1];
		return nextEvent.type !== 'tool_result';
	}

	// Find the result for a tool_use event
	function getToolResult(event: TaskRunEvent): unknown {
		const idx = events.indexOf(event);
		if (idx >= 0 && idx < events.length - 1) {
			const nextEvent = events[idx + 1];
			if (nextEvent.type === 'tool_result') {
				return nextEvent.toolResult;
			}
		}
		return undefined;
	}
</script>

{#if visible}
	<div class="panel-overlay" class:open={animating} onclick={handleBackdropClick} role="presentation">
		<div class="task-runner-panel" class:open={animating} class:resizing={isResizing} style="width: {panelWidth}px">
			<div class="resize-handle" onmousedown={startResize} role="separator" aria-orientation="vertical"></div>

			<!-- Header -->
			<div class="panel-header">
				<div class="header-content">
					<div class="header-left">
						<div class="task-info">
							<span class="task-type-badge" class:epic={issueType === 'epic'}>
								{issueType === 'epic' ? 'Epic' : 'Task'}
							</span>
							<span class="task-title">{issueTitle || 'Task Runner'}</span>
						</div>
						{#if hasStarted}
						<div class="status-row">
							<span class="status-badge" style="background: {statusColor()}">
								{#if isRunning && !isComplete}
									<span class="status-spinner"></span>
								{/if}
								{statusLabel()}
							</span>
							<span class="mode-badge">{mode === 'autonomous' ? 'Autonomous' : 'Guided'}</span>
						</div>
					{/if}
					</div>

					<div class="header-right">
						{#if hasStarted && isRunning}
							<button class="stop-btn" onclick={stopTask} title="Stop task">
								<Icon name="square" size={16} />
								Stop
							</button>
						{/if}
						<button class="close-btn" onclick={handleClose}>
							<Icon name="x" size={20} />
						</button>
					</div>
				</div>
			</div>

			<!-- Epic Progress (if applicable) -->
			{#if epicSequence}
				<div class="epic-progress">
					<div class="progress-header">
						<span class="progress-label">Epic Progress</span>
						<span class="progress-count">
							{epicSequence.completedTaskIds.length} / {epicSequence.totalTasks} tasks
						</span>
					</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {(epicSequence.completedTaskIds.length / epicSequence.totalTasks) * 100}%"
						></div>
						{#if epicSequence.failedTaskIds.length > 0}
							<div
								class="progress-failed"
								style="width: {(epicSequence.failedTaskIds.length / epicSequence.totalTasks) * 100}%"
							></div>
						{/if}
					</div>
					<div class="task-list">
						{#each epicSequence.taskIds as taskId, i}
							<div
								class="task-item"
								class:completed={epicSequence.completedTaskIds.includes(taskId)}
								class:failed={epicSequence.failedTaskIds.includes(taskId)}
								class:current={i === epicSequence.currentIndex && isRunning}
							>
								{#if epicSequence.completedTaskIds.includes(taskId)}
									<Icon name="check" size={12} />
								{:else if epicSequence.failedTaskIds.includes(taskId)}
									<Icon name="x" size={12} />
								{:else if i === epicSequence.currentIndex && isRunning}
									<span class="task-spinner"></span>
								{:else}
									<Icon name="circle" size={12} />
								{/if}
								<span class="task-id">{taskId}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Output Area -->
			<div class="output-wrapper">
				<div class="output-container" bind:this={outputContainer}>
					{#if !hasStarted && !isStarting}
						<!-- Not started yet - show start button -->
						<div class="start-state">
							<div class="start-icon">
								<Icon name={isInProgress ? 'rotate-cw' : 'play-circle'} size={64} />
							</div>
							<h3>{isInProgress ? 'Continue task' : 'Ready to run task'}</h3>
							<p class="start-description">
								{isInProgress
									? `This ${issueType} is already in progress. Continue where you left off.`
									: `Click the button below to start Claude working on this ${issueType}.`}
							</p>
							<div class="mode-selector">
								<label class="mode-option">
									<input
										type="radio"
										name="mode"
										value="autonomous"
										checked={mode === 'autonomous'}
										onchange={() => mode = 'autonomous'}
									/>
									<span class="mode-label">
										<Icon name="zap" size={16} />
										Autonomous
									</span>
									<span class="mode-desc">Claude works independently</span>
								</label>
								<label class="mode-option">
									<input
										type="radio"
										name="mode"
										value="guided"
										checked={mode === 'guided'}
										onchange={() => mode = 'guided'}
									/>
									<span class="mode-label">
										<Icon name="message-circle" size={16} />
										Guided
									</span>
									<span class="mode-desc">Chat with Claude as it works</span>
								</label>
							</div>
							<button class="start-task-btn" onclick={handleStartTask}>
								<Icon name={isInProgress ? 'rotate-cw' : 'play'} size={18} />
								{isInProgress ? 'Continue Task' : 'Start Task'}
							</button>
						</div>
					{:else if isStarting}
						<div class="empty-state">
							<Icon name="loader" size={48} />
							<p>Starting task...</p>
						</div>
					{:else if events.length === 0 && !isComplete}
						<div class="empty-state">
							<Icon name="terminal" size={48} />
							<p>Waiting for output...</p>
						</div>
					{:else}
						<div class="events-list">
							{#each events as event (event.id)}
								{#if !shouldHideEvent(event)}
									{#if isBashEvent(event)}
										{@const bashInfo = getBashInfo(event)}
										<div class="event-bash">
											<ClaudeBashCommand
												command={bashInfo.command}
												description={bashInfo.description}
												result={getBashResult(event)}
												isRunning={isBashRunning(event)}
											/>
										</div>
									{:else if event.type === 'tool_use' && event.toolName && event.toolName !== 'Bash'}
										{@const toolResult = getToolResult(event)}
										<div class="event-tool">
											<ToolDisplay
												name={event.toolName}
												input={event.toolInput || {}}
												result={toolResult}
												isRunning={toolResult === undefined && isRunning}
												isDark={true}
											/>
										</div>
									{:else if event.type !== 'tool_result' && event.type !== 'tool_use'}
										<div class="event-item" class:error={event.type === 'error'}>
											<div class="event-header">
												<Icon name={getEventIcon(event)} size={14} />
												<span class="event-type" style="color: {getEventColor(event)}">
													{event.type.replace('_', ' ')}
												</span>
												<span class="event-time">
													{new Date(event.timestamp).toLocaleTimeString()}
												</span>
											</div>
											{#if event.content}
												<div class="event-content">
													<pre>{event.content}</pre>
												</div>
											{/if}
										</div>
									{/if}
								{/if}
							{/each}
						</div>
					{/if}

					{#if awaitingUserInput}
						<div class="awaiting-input-banner">
							<Icon name="alert-circle" size={16} />
							<span>Claude is waiting for your input</span>
						</div>
					{/if}

					{#if error}
						<div class="error-banner">
							<Icon name="alert-circle" size={16} />
							<span>{error}</span>
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

			<!-- Input Area (guided mode or awaiting input) -->
			{#if canSendMessage}
				<ChatInput
					onsend={sendMessage}
					disabled={!isConnected}
					isStreaming={false}
					placeholder={awaitingUserInput ? 'Respond to Claude...' : 'Send a message...'}
				/>
			{/if}

			<!-- Complete Footer -->
			{#if isComplete}
				<div class="complete-footer" class:success={status === 'completed'} class:failed={status === 'failed'}>
					<Icon name={status === 'completed' ? 'check-circle' : status === 'failed' ? 'x-circle' : 'minus-circle'} size={20} />
					<span>
						{status === 'completed' ? 'Task completed successfully' :
						 status === 'failed' ? 'Task failed' :
						 'Task cancelled'}
					</span>
					<button class="close-panel-btn" onclick={handleClose}>
						Close
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.panel-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 999;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.panel-overlay.open {
		opacity: 1;
		pointer-events: auto;
	}

	.task-runner-panel {
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

	.task-runner-panel.open {
		transform: translateX(0);
	}

	.task-runner-panel.resizing {
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

	.resize-handle:hover,
	.resize-handle:active {
		background: rgba(0, 0, 0, 0.08);
	}

	/* Header */
	.panel-header {
		padding: 16px 20px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
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

	.task-info {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.task-type-badge {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		background: #dbeafe;
		color: #2563eb;
		text-transform: uppercase;
	}

	.task-type-badge.epic {
		background: #fef3c7;
		color: #d97706;
	}

	.task-title {
		font-size: 16px;
		font-weight: 600;
		color: #1f2937;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 12px;
		color: #ffffff;
	}

	.status-spinner {
		width: 10px;
		height: 10px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.mode-badge {
		font-size: 11px;
		font-weight: 500;
		padding: 3px 8px;
		border-radius: 4px;
		background: #f3f4f6;
		color: #6b7280;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.stop-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: none;
		background: #fee2e2;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #dc2626;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.stop-btn:hover {
		background: #fecaca;
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

	/* Epic Progress */
	.epic-progress {
		padding: 12px 20px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.progress-label {
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
	}

	.progress-count {
		font-size: 12px;
		font-weight: 600;
		color: #1f2937;
	}

	.progress-bar {
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		margin-bottom: 12px;
	}

	.progress-fill {
		height: 100%;
		background: #10b981;
		transition: width 0.3s ease;
	}

	.progress-failed {
		height: 100%;
		background: #ef4444;
		transition: width 0.3s ease;
	}

	.task-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.task-item {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		padding: 3px 8px;
		border-radius: 4px;
		background: #f3f4f6;
		color: #6b7280;
	}

	.task-item.completed {
		background: #d1fae5;
		color: #059669;
	}

	.task-item.failed {
		background: #fee2e2;
		color: #dc2626;
	}

	.task-item.current {
		background: #dbeafe;
		color: #2563eb;
	}

	.task-spinner {
		width: 8px;
		height: 8px;
		border: 1.5px solid #93c5fd;
		border-top-color: #2563eb;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.task-id {
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	/* Output Area */
	.output-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		position: relative;
		min-height: 0;
		overflow: hidden;
	}

	.output-container {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		padding-bottom: 24px;
		background: #1f2937;
	}

	.floating-todos {
		position: sticky;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 12px 16px;
		background: #1f2937;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		pointer-events: none;
	}

	.floating-todos > :global(*) {
		pointer-events: auto;
	}

	.event-bash {
		margin-bottom: 8px;
	}

	.event-tool {
		margin-bottom: 8px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #9ca3af;
		text-align: center;
	}

	.empty-state :global(.icon) {
		color: #4b5563;
		margin-bottom: 12px;
	}

	.empty-state :global(.icon.loader) {
		animation: spin 1s linear infinite;
	}

	.empty-state p {
		margin: 0;
		font-size: 14px;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.events-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.event-item {
		padding: 10px 12px;
		background: #374151;
		border-radius: 6px;
		border-left: 3px solid #6b7280;
	}

	.event-item.error {
		border-left-color: #ef4444;
		background: #451a1a;
	}

	.event-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
		color: #9ca3af;
		font-size: 11px;
	}

	.event-type {
		font-weight: 500;
		text-transform: capitalize;
	}

	.event-time {
		margin-left: auto;
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	.event-content pre {
		margin: 0;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 13px;
		line-height: 1.5;
		color: #e5e7eb;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.tool-info {
		margin-top: 8px;
		padding: 8px;
		background: #1f2937;
		border-radius: 4px;
	}

	.tool-name {
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 12px;
		font-weight: 600;
		color: #a78bfa;
	}

	.tool-input,
	.tool-result pre {
		margin: 6px 0 0;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 11px;
		color: #9ca3af;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.tool-result {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #374151;
	}

	.result-label {
		font-size: 11px;
		font-weight: 500;
		color: #10b981;
	}

	.awaiting-input-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px;
		background: #fef3c7;
		border-radius: 6px;
		margin-top: 12px;
		font-size: 13px;
		color: #92400e;
	}

	.error-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px;
		background: #fee2e2;
		border-radius: 6px;
		margin-top: 12px;
		font-size: 13px;
		color: #dc2626;
	}

	/* Complete Footer */
	.complete-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 16px;
		background: #f3f4f6;
		border-top: 1px solid #e5e7eb;
		color: #6b7280;
	}

	.complete-footer.success {
		background: #d1fae5;
		color: #059669;
	}

	.complete-footer.failed {
		background: #fee2e2;
		color: #dc2626;
	}

	.close-panel-btn {
		margin-left: auto;
		padding: 8px 16px;
		border: none;
		background: #ffffff;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.close-panel-btn:hover {
		background: #f9fafb;
	}

	/* Start State */
	.start-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 40px 20px;
		text-align: center;
	}

	.start-icon {
		color: #6b7280;
		margin-bottom: 16px;
	}

	.start-state h3 {
		margin: 0 0 8px;
		font-size: 20px;
		font-weight: 600;
		color: #e5e7eb;
	}

	.start-description {
		margin: 0 0 24px;
		font-size: 14px;
		color: #9ca3af;
		max-width: 300px;
	}

	.mode-selector {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 24px;
		width: 100%;
		max-width: 280px;
	}

	.mode-option {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #374151;
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-option:hover {
		background: #4b5563;
	}

	.mode-option:has(input:checked) {
		border-color: #2563eb;
		background: #1e3a5f;
	}

	.mode-option input {
		display: none;
	}

	.mode-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 500;
		color: #e5e7eb;
	}

	.mode-desc {
		width: 100%;
		font-size: 12px;
		color: #9ca3af;
		margin-left: 22px;
	}

	.start-task-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 28px;
		background: #2563eb;
		border: none;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		color: #ffffff;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.start-task-btn:hover {
		background: #1d4ed8;
		transform: translateY(-1px);
	}

	.start-task-btn:active {
		transform: translateY(0);
	}
</style>
