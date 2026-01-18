<script lang="ts">
	import Icon from './Icon.svelte';

	export interface TodoItem {
		content: string;
		status: 'pending' | 'in_progress' | 'completed';
		activeForm: string;
	}

	let {
		todos = []
	}: {
		todos: TodoItem[];
	} = $props();

	// Calculate progress
	let completedCount = $derived(todos.filter(t => t.status === 'completed').length);
	let totalCount = $derived(todos.length);
	let progressPercent = $derived(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);
</script>

{#if todos.length > 0}
	<div class="todo-container">
		<div class="todo-header">
			<div class="header-left">
				<Icon name="check-square" size={14} />
				<span class="header-title">Tasks</span>
			</div>
			<div class="progress-indicator">
				<span class="progress-text">{completedCount}/{totalCount}</span>
				<div class="progress-bar">
					<div class="progress-fill" style="width: {progressPercent}%"></div>
				</div>
			</div>
		</div>
		<div class="todo-list">
			{#each todos as todo, i (i)}
				<div class="todo-item" class:completed={todo.status === 'completed'} class:in-progress={todo.status === 'in_progress'}>
					<div class="todo-status">
						{#if todo.status === 'completed'}
							<div class="status-icon completed">
								<Icon name="check" size={12} />
							</div>
						{:else if todo.status === 'in_progress'}
							<div class="status-icon in-progress">
								<div class="spinner"></div>
							</div>
						{:else}
							<div class="status-icon pending">
								<div class="circle"></div>
							</div>
						{/if}
					</div>
					<span class="todo-text">
						{#if todo.status === 'in_progress'}
							{todo.activeForm}
						{:else}
							{todo.content}
						{/if}
					</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.todo-container {
		background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
		border: 1px solid #334155;
		border-radius: 12px;
		padding: 12px 16px;
		font-family: 'Figtree', sans-serif;
	}

	.todo-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid #334155;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #94a3b8;
	}

	.header-title {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.progress-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.progress-text {
		font-size: 11px;
		color: #64748b;
		font-weight: 500;
	}

	.progress-bar {
		width: 60px;
		height: 4px;
		background: #334155;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #22c55e, #4ade80);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.todo-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.todo-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
	}

	.todo-status {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-icon {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-icon.completed {
		background: #22c55e;
		color: #ffffff;
	}

	.status-icon.in-progress {
		background: transparent;
	}

	.status-icon.pending .circle {
		width: 10px;
		height: 10px;
		border: 2px solid #475569;
		border-radius: 50%;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid #334155;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.todo-text {
		font-size: 13px;
		color: #e2e8f0;
		line-height: 1.4;
	}

	.todo-item.completed .todo-text {
		color: #64748b;
		text-decoration: line-through;
	}

	.todo-item.in-progress .todo-text {
		color: #60a5fa;
		font-weight: 500;
	}
</style>
