<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import Icon from './Icon.svelte';
	import type { TaskRun } from '$lib/types';

	interface ActiveTaskUpdate {
		type: 'task_added' | 'task_updated' | 'task_removed' | 'awaiting_input' | 'full_sync';
		task?: TaskRun;
		tasks?: TaskRun[];
		runId?: string;
	}

	let activeTasks = $state<TaskRun[]>([]);
	let isExpanded = $state(false);
	let eventSource: EventSource | null = null;

	// Computed values
	let taskCount = $derived(activeTasks.length);
	let awaitingCount = $derived(activeTasks.filter((t) => t.awaitingUserInput).length);
	let hasAttention = $derived(awaitingCount > 0);

	onMount(() => {
		if (!browser) return;

		// Connect to the active tasks SSE stream
		eventSource = new EventSource('/api/active-tasks/stream');

		eventSource.onmessage = (event) => {
			try {
				const update: ActiveTaskUpdate = JSON.parse(event.data);
				handleUpdate(update);
			} catch (e) {
				console.error('[GlobalTaskIndicator] Failed to parse SSE message:', e);
			}
		};

		eventSource.onerror = (e) => {
			console.error('[GlobalTaskIndicator] SSE error:', e);
		};
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	function handleUpdate(update: ActiveTaskUpdate) {
		switch (update.type) {
			case 'full_sync':
				if (update.tasks) {
					activeTasks = update.tasks;
				}
				break;

			case 'task_added':
				if (update.task) {
					activeTasks = [...activeTasks, update.task];
				}
				break;

			case 'task_updated':
				if (update.task) {
					activeTasks = activeTasks.map((t) => (t.id === update.task!.id ? update.task! : t));
				}
				break;

			case 'task_removed':
				if (update.runId) {
					activeTasks = activeTasks.filter((t) => t.id !== update.runId);
				}
				break;

			case 'awaiting_input':
				// Task needs attention - already handled via task_updated
				// Could trigger additional UI feedback here if needed
				break;
		}
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	async function navigateToTask(task: TaskRun) {
		isExpanded = false;
		// Navigate to the project page with the task ID as a query param
		// The project page will handle opening the TaskRunnerPanel
		await goto(`/projects/${task.projectId}?issue=${task.issueId}&openTask=true`);
	}

	function getStatusIcon(task: TaskRun): string {
		if (task.awaitingUserInput) return 'message-circle';
		if (task.status === 'running') return 'loader';
		if (task.status === 'paused') return 'pause';
		if (task.status === 'completed') return 'check-circle';
		if (task.status === 'failed') return 'x-circle';
		return 'circle';
	}

	function getStatusColor(task: TaskRun): string {
		if (task.awaitingUserInput) return '#f97316';
		if (task.status === 'running') return '#3b82f6';
		if (task.status === 'paused') return '#eab308';
		if (task.status === 'completed') return '#22c55e';
		if (task.status === 'failed') return '#ef4444';
		return '#6b7280';
	}

	function formatTime(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);

		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHour = Math.floor(diffMin / 60);
		if (diffHour < 24) return `${diffHour}h ago`;
		return d.toLocaleDateString();
	}
</script>

{#if taskCount > 0}
	<div class="global-task-indicator" class:has-attention={hasAttention}>
		<!-- Main badge button -->
		<button
			class="indicator-badge"
			class:expanded={isExpanded}
			onclick={toggleExpanded}
			aria-label={`${taskCount} active task${taskCount !== 1 ? 's' : ''}${hasAttention ? ', attention needed' : ''}`}
		>
			<div class="badge-icon" class:spinning={!hasAttention && activeTasks.some((t) => t.status === 'running')}>
				<Icon name={hasAttention ? 'message-circle' : 'activity'} size={20} />
			</div>
			<span class="badge-count">{taskCount}</span>
			{#if hasAttention}
				<span class="attention-dot"></span>
			{/if}
		</button>

		<!-- Expanded panel -->
		{#if isExpanded}
			<div class="task-panel">
				<div class="panel-header">
					<h3>Active Tasks</h3>
					{#if awaitingCount > 0}
						<span class="attention-badge">{awaitingCount} need{awaitingCount === 1 ? 's' : ''} input</span>
					{/if}
				</div>

				<div class="task-list">
					{#each activeTasks as task (task.id)}
						<button class="task-item" class:awaiting={task.awaitingUserInput} onclick={() => navigateToTask(task)}>
							<div class="task-icon" style="color: {getStatusColor(task)}">
								<Icon name={getStatusIcon(task)} size={16} />
							</div>
							<div class="task-info">
								<span class="task-title">{task.issueTitle}</span>
								<span class="task-meta">
									{task.awaitingUserInput ? 'Waiting for input' : task.status}
									&middot; {formatTime(task.lastActivityAt)}
								</span>
							</div>
							<Icon name="chevron-right" size={14} class="task-chevron" />
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Backdrop when expanded -->
	{#if isExpanded}
		<button class="backdrop" onclick={toggleExpanded} aria-label="Close task panel"></button>
	{/if}
{/if}

<style>
	.global-task-indicator {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 9000;
	}

	.indicator-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: #1a1a1a;
		color: #ffffff;
		border: none;
		border-radius: 24px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
		position: relative;
	}

	.indicator-badge:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2), 0 3px 6px rgba(0, 0, 0, 0.12);
	}

	.indicator-badge.expanded {
		border-radius: 24px 24px 0 0;
	}

	.has-attention .indicator-badge {
		background: #f97316;
		animation: pulse-attention 2s ease-in-out infinite;
	}

	@keyframes pulse-attention {
		0%,
		100% {
			box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3), 0 2px 4px rgba(249, 115, 22, 0.2);
		}
		50% {
			box-shadow: 0 6px 20px rgba(249, 115, 22, 0.5), 0 4px 8px rgba(249, 115, 22, 0.3);
		}
	}

	.badge-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.badge-icon.spinning :global(svg) {
		animation: spin 1.5s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.badge-count {
		font-size: 14px;
		font-weight: 600;
		font-family: 'Figtree', sans-serif;
	}

	.attention-dot {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 12px;
		height: 12px;
		background: #ef4444;
		border-radius: 50%;
		border: 2px solid #1a1a1a;
		animation: pulse-dot 1.5s ease-in-out infinite;
	}

	@keyframes pulse-dot {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
	}

	.task-panel {
		position: absolute;
		bottom: 100%;
		right: 0;
		width: 320px;
		max-height: 400px;
		background: #ffffff;
		border-radius: 16px 16px 0 0;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px;
		border-bottom: 1px solid #f0f0f0;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 500;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
		color: #1a1a1a;
	}

	.attention-badge {
		font-size: 11px;
		font-weight: 600;
		padding: 4px 8px;
		background: #fff7ed;
		color: #c2410c;
		border-radius: 12px;
	}

	.task-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.task-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px;
		background: transparent;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.15s ease;
		text-align: left;
	}

	.task-item:hover {
		background: #f5f5f5;
	}

	.task-item.awaiting {
		background: #fff7ed;
	}

	.task-item.awaiting:hover {
		background: #ffedd5;
	}

	.task-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.task-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.task-title {
		font-size: 13px;
		font-weight: 500;
		color: #1a1a1a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.task-meta {
		font-size: 11px;
		color: #888888;
	}

	.task-item :global(.task-chevron) {
		flex-shrink: 0;
		color: #cccccc;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
		z-index: 8999;
		border: none;
		cursor: default;
	}
</style>
