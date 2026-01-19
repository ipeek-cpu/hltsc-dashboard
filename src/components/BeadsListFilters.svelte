<script lang="ts">
	import type { Agent } from '$lib/types';
	import Icon from './Icon.svelte';

	export interface ListFilters {
		status: string | null;
		priority: number | null;
		type: string | null;
		assignee: string | null;
		search: string;
	}

	let {
		filters,
		agents = [],
		onfilterschange
	}: {
		filters: ListFilters;
		agents: Agent[];
		onfilterschange: (filters: ListFilters) => void;
	} = $props();

	const statuses = [
		{ value: 'open', label: 'Open' },
		{ value: 'ready', label: 'Ready' },
		{ value: 'in_progress', label: 'In Progress' },
		{ value: 'in_review', label: 'In Review' },
		{ value: 'blocked', label: 'Blocked' },
		{ value: 'closed', label: 'Closed' }
	];

	const priorities = [
		{ value: 0, label: 'Critical' },
		{ value: 1, label: 'High' },
		{ value: 2, label: 'Medium' },
		{ value: 3, label: 'Low' },
		{ value: 4, label: 'Backlog' }
	];

	const issueTypes = [
		{ value: 'task', label: 'Task' },
		{ value: 'bug', label: 'Bug' },
		{ value: 'feature', label: 'Feature' },
		{ value: 'epic', label: 'Epic' },
		{ value: 'question', label: 'Question' },
		{ value: 'docs', label: 'Docs' }
	];

	function updateFilter<K extends keyof ListFilters>(key: K, value: ListFilters[K]) {
		onfilterschange({
			...filters,
			[key]: value
		});
	}

	function clearFilters() {
		onfilterschange({
			status: null,
			priority: null,
			type: null,
			assignee: null,
			search: ''
		});
	}

	let hasActiveFilters = $derived(
		filters.status !== null ||
		filters.priority !== null ||
		filters.type !== null ||
		filters.assignee !== null ||
		filters.search !== ''
	);
</script>

<div class="filters-bar">
	<div class="search-box">
		<Icon name="search" size={16} />
		<input
			type="text"
			placeholder="Search issues..."
			value={filters.search}
			oninput={(e) => updateFilter('search', e.currentTarget.value)}
		/>
		{#if filters.search}
			<button class="clear-search" onclick={() => updateFilter('search', '')}>
				<Icon name="x" size={14} />
			</button>
		{/if}
	</div>

	<div class="filter-group">
		<select
			value={filters.status ?? ''}
			onchange={(e) => updateFilter('status', e.currentTarget.value || null)}
		>
			<option value="">All Statuses</option>
			{#each statuses as status}
				<option value={status.value}>{status.label}</option>
			{/each}
		</select>

		<select
			value={filters.priority !== null ? String(filters.priority) : ''}
			onchange={(e) => updateFilter('priority', e.currentTarget.value ? parseInt(e.currentTarget.value) : null)}
		>
			<option value="">All Priorities</option>
			{#each priorities as priority}
				<option value={priority.value}>{priority.label}</option>
			{/each}
		</select>

		<select
			value={filters.type ?? ''}
			onchange={(e) => updateFilter('type', e.currentTarget.value || null)}
		>
			<option value="">All Types</option>
			{#each issueTypes as type}
				<option value={type.value}>{type.label}</option>
			{/each}
		</select>

		{#if agents.length > 0}
			<select
				value={filters.assignee ?? ''}
				onchange={(e) => updateFilter('assignee', e.currentTarget.value || null)}
			>
				<option value="">All Assignees</option>
				{#each agents as agent}
					<option value={agent.frontmatter.name}>{agent.frontmatter.name}</option>
				{/each}
			</select>
		{/if}
	</div>

	{#if hasActiveFilters}
		<button class="clear-all-btn" onclick={clearFilters}>
			<Icon name="x" size={14} />
			Clear filters
		</button>
	{/if}
</div>

<style>
	.filters-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		width: 260px;
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
		color: #9ca3af;
	}

	.clear-search {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		background: #e5e7eb;
		border: none;
		border-radius: 4px;
		color: #6b7280;
		cursor: pointer;
	}

	.clear-search:hover {
		background: #d1d5db;
		color: #374151;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.filter-group select {
		padding: 8px 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-family: inherit;
		color: #374151;
		cursor: pointer;
	}

	.filter-group select:hover {
		border-color: #d1d5db;
	}

	.filter-group select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.clear-all-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		background: #fee2e2;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #dc2626;
		cursor: pointer;
		font-family: inherit;
		margin-left: auto;
	}

	.clear-all-btn:hover {
		background: #fecaca;
	}
</style>
