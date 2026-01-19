<script lang="ts">
	import type { Issue, Agent, IssueWithDetails } from '$lib/types';
	import BeadsListFilters, { type ListFilters } from './BeadsListFilters.svelte';
	import Icon from './Icon.svelte';
	import TypeBadge from './TypeBadge.svelte';
	import { marked } from 'marked';

	type SortField = 'id' | 'title' | 'status' | 'priority' | 'assignee' | 'updated_at';
	type SortDirection = 'asc' | 'desc';

	let {
		issues,
		agents = [],
		initialFilters = null,
		projectId,
		onissueclick,
		onclose
	}: {
		issues: Issue[];
		agents: Agent[];
		initialFilters?: Partial<ListFilters> | null;
		projectId: string;
		onissueclick: (issueId: string) => void;
		onclose: () => void;
	} = $props();

	let filters = $state<ListFilters>({
		status: initialFilters?.status ?? null,
		priority: initialFilters?.priority ?? null,
		type: initialFilters?.type ?? null,
		assignee: initialFilters?.assignee ?? null,
		search: initialFilters?.search ?? ''
	});

	let sortField = $state<SortField>('updated_at');
	let sortDirection = $state<SortDirection>('desc');

	// Pagination
	let currentPage = $state(1);
	const pageSize = 25;

	// Selected issue for detail panel
	let selectedIssueId = $state<string | null>(null);
	let selectedIssueDetails = $state<IssueWithDetails | null>(null);
	let loadingDetails = $state(false);

	// Filter issues
	let filteredIssues = $derived.by(() => {
		let result = issues;

		if (filters.status) {
			result = result.filter((i) => i.status === filters.status);
		}

		if (filters.priority !== null) {
			result = result.filter((i) => i.priority === filters.priority);
		}

		if (filters.type) {
			result = result.filter((i) => i.issue_type === filters.type);
		}

		if (filters.assignee) {
			result = result.filter((i) => i.assignee === filters.assignee);
		}

		if (filters.search) {
			const search = filters.search.toLowerCase();
			result = result.filter(
				(i) =>
					i.title.toLowerCase().includes(search) ||
					i.description?.toLowerCase().includes(search) ||
					i.id.toLowerCase().includes(search)
			);
		}

		return result;
	});

	// Sort issues
	let sortedIssues = $derived.by(() => {
		const result = [...filteredIssues];

		result.sort((a, b) => {
			let aVal: string | number | null = null;
			let bVal: string | number | null = null;

			switch (sortField) {
				case 'id':
					aVal = a.id;
					bVal = b.id;
					break;
				case 'title':
					aVal = a.title.toLowerCase();
					bVal = b.title.toLowerCase();
					break;
				case 'status':
					aVal = a.status;
					bVal = b.status;
					break;
				case 'priority':
					aVal = a.priority ?? 4;
					bVal = b.priority ?? 4;
					break;
				case 'assignee':
					aVal = a.assignee ?? 'zzz';
					bVal = b.assignee ?? 'zzz';
					break;
				case 'updated_at':
					aVal = new Date(a.updated_at).getTime();
					bVal = new Date(b.updated_at).getTime();
					break;
			}

			if (aVal === null || bVal === null) return 0;

			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});

		return result;
	});

	// Paginate issues
	let paginatedIssues = $derived(
		sortedIssues.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	);

	let totalPages = $derived(Math.ceil(sortedIssues.length / pageSize));

	function handleFiltersChange(newFilters: ListFilters) {
		filters = newFilters;
		currentPage = 1; // Reset to first page when filters change
	}

	function handleSort(field: SortField) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}
	}

	async function selectIssue(issueId: string) {
		selectedIssueId = issueId;
		loadingDetails = true;

		try {
			const response = await fetch(`/api/projects/${projectId}/issues/${issueId}`);
			if (response.ok) {
				selectedIssueDetails = await response.json();
			}
		} catch (err) {
			console.error('Error fetching issue details:', err);
		} finally {
			loadingDetails = false;
		}
	}

	function closeDetailPanel() {
		selectedIssueId = null;
		selectedIssueDetails = null;
	}

	function openInFullView() {
		if (selectedIssueId) {
			onclose();
			onissueclick(selectedIssueId);
		}
	}

	function getPriorityLabel(priority: number | undefined): string {
		switch (priority) {
			case 0:
				return 'Critical';
			case 1:
				return 'High';
			case 2:
				return 'Medium';
			case 3:
				return 'Low';
			case 4:
			default:
				return 'Backlog';
		}
	}

	function getPriorityColor(priority: number | undefined): string {
		switch (priority) {
			case 0:
				return '#dc2626';
			case 1:
				return '#f97316';
			case 2:
				return '#eab308';
			case 3:
				return '#22c55e';
			case 4:
			default:
				return '#9ca3af';
		}
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'in_progress':
				return 'In Progress';
			case 'in_review':
				return 'In Review';
			default:
				return status.charAt(0).toUpperCase() + status.slice(1);
		}
	}

	const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
		open: { label: 'Open', color: '#2563eb', bg: '#dbeafe' },
		ready: { label: 'Ready', color: '#16a34a', bg: '#dcfce7' },
		in_progress: { label: 'In Progress', color: '#d97706', bg: '#fef3c7' },
		in_review: { label: 'In Review', color: '#7c3aed', bg: '#f3e8ff' },
		blocked: { label: 'Blocked', color: '#dc2626', bg: '#fee2e2' },
		closed: { label: 'Closed', color: '#059669', bg: '#d1fae5' },
	};

	const priorityLabels: Record<number, { label: string; color: string; chevrons: number }> = {
		0: { label: 'Critical', color: '#dc2626', chevrons: 4 },
		1: { label: 'High', color: '#ef4444', chevrons: 3 },
		2: { label: 'Medium', color: '#eab308', chevrons: 2 },
		3: { label: 'Low', color: '#22c55e', chevrons: 1 },
		4: { label: 'Backlog', color: '#6b7280', chevrons: 0 },
	};

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}

	function formatFullDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	let renderedDescription = $derived(() => {
		if (!selectedIssueDetails?.description) return '';
		try {
			return marked(selectedIssueDetails.description);
		} catch {
			return selectedIssueDetails.description;
		}
	});
</script>

<div class="list-view" class:has-detail={selectedIssueId !== null}>
	<div class="list-panel">
		<div class="list-header">
			<h2>All Issues</h2>
			<div class="header-actions">
				<span class="count">{sortedIssues.length} issues</span>
				<button class="close-btn" onclick={onclose}>
					<Icon name="x" size={20} />
				</button>
			</div>
		</div>

		<BeadsListFilters
			{filters}
			{agents}
			onfilterschange={handleFiltersChange}
		/>

		<div class="table-container">
			<table>
				<thead>
					<tr>
						<th class="sortable" onclick={() => handleSort('id')}>
							ID
							{#if sortField === 'id'}
								<Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} />
							{/if}
						</th>
						<th class="sortable" onclick={() => handleSort('title')}>
							Title
							{#if sortField === 'title'}
								<Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} />
							{/if}
						</th>
						<th class="sortable" onclick={() => handleSort('status')}>
							Status
							{#if sortField === 'status'}
								<Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} />
							{/if}
						</th>
						<th class="sortable" onclick={() => handleSort('priority')}>
							Priority
							{#if sortField === 'priority'}
								<Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} />
							{/if}
						</th>
						<th class="sortable" onclick={() => handleSort('assignee')}>
							Assignee
							{#if sortField === 'assignee'}
								<Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} />
							{/if}
						</th>
						<th class="sortable" onclick={() => handleSort('updated_at')}>
							Updated
							{#if sortField === 'updated_at'}
								<Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} />
							{/if}
						</th>
					</tr>
				</thead>
				<tbody>
					{#if paginatedIssues.length === 0}
						<tr>
							<td colspan="6" class="empty-message">
								No issues found matching your filters.
							</td>
						</tr>
					{:else}
						{#each paginatedIssues as issue}
							<tr
								class="clickable"
								class:selected={issue.id === selectedIssueId}
								onclick={() => selectIssue(issue.id)}
							>
								<td class="id-cell">
									<code>{issue.id.substring(0, 8)}</code>
								</td>
								<td class="title-cell">
									<span class="title">{issue.title}</span>
									{#if issue.issue_type && issue.issue_type !== 'task'}
										<span class="type-badge">{issue.issue_type}</span>
									{/if}
								</td>
								<td>
									<span class="status-badge status-{issue.status}">
										{getStatusLabel(issue.status)}
									</span>
								</td>
								<td>
									<span class="priority-indicator" style="color: {getPriorityColor(issue.priority)}">
										{getPriorityLabel(issue.priority)}
									</span>
								</td>
								<td class="assignee-cell">
									{issue.assignee || '—'}
								</td>
								<td class="date-cell">
									{formatDate(issue.updated_at)}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		{#if totalPages > 1}
			<div class="pagination">
				<button
					class="page-btn"
					disabled={currentPage === 1}
					onclick={() => currentPage = 1}
				>
					<Icon name="chevrons-left" size={16} />
				</button>
				<button
					class="page-btn"
					disabled={currentPage === 1}
					onclick={() => currentPage--}
				>
					<Icon name="chevron-left" size={16} />
				</button>
				<span class="page-info">
					Page {currentPage} of {totalPages}
				</span>
				<button
					class="page-btn"
					disabled={currentPage === totalPages}
					onclick={() => currentPage++}
				>
					<Icon name="chevron-right" size={16} />
				</button>
				<button
					class="page-btn"
					disabled={currentPage === totalPages}
					onclick={() => currentPage = totalPages}
				>
					<Icon name="chevrons-right" size={16} />
				</button>
			</div>
		{/if}
	</div>

	{#if selectedIssueId}
		<div class="detail-panel">
			{#if loadingDetails}
				<div class="loading-state">
					<Icon name="loader" size={24} />
					<span>Loading...</span>
				</div>
			{:else if selectedIssueDetails}
				<div class="detail-header">
					<div class="detail-title-row">
						<span class="detail-id">{selectedIssueDetails.id}</span>
						<div class="detail-actions">
							<button class="expand-btn" onclick={openInFullView} title="Open in full view">
								<Icon name="maximize-2" size={16} />
							</button>
							<button class="close-detail-btn" onclick={closeDetailPanel}>
								<Icon name="x" size={18} />
							</button>
						</div>
					</div>
					<h3 class="detail-title">{selectedIssueDetails.title}</h3>
				</div>

				<div class="detail-content">
					<div class="metadata-section">
						<div class="metadata-row">
							<span class="metadata-label">Status</span>
							<span
								class="status-badge-lg"
								style="color: {statusLabels[selectedIssueDetails.status]?.color || '#6b7280'}; background: {statusLabels[selectedIssueDetails.status]?.bg || '#f3f4f6'}"
							>
								{statusLabels[selectedIssueDetails.status]?.label || selectedIssueDetails.status}
							</span>
						</div>
						<div class="metadata-row">
							<span class="metadata-label">Type</span>
							<TypeBadge type={selectedIssueDetails.issue_type} size="md" />
						</div>
						<div class="metadata-row">
							<span class="metadata-label">Priority</span>
							<span class="priority-badge-lg">
								{#if priorityLabels[selectedIssueDetails.priority]?.chevrons > 0}
									<span class="priority-chevrons" style="color: {priorityLabels[selectedIssueDetails.priority]?.color || '#6b7280'}">
										{#each Array(priorityLabels[selectedIssueDetails.priority]?.chevrons || 1) as _}
											<Icon name="chevron-up" size={14} />
										{/each}
									</span>
								{/if}
								{priorityLabels[selectedIssueDetails.priority]?.label || 'Unknown'}
							</span>
						</div>
						{#if selectedIssueDetails.assignee}
							<div class="metadata-row">
								<span class="metadata-label">Assignee</span>
								<span class="assignee-badge">
									<Icon name="user" size={14} />
									{selectedIssueDetails.assignee}
								</span>
							</div>
						{/if}
					</div>

					<div class="dates-section">
						<div class="date-row">
							<Icon name="calendar" size={14} />
							<span class="date-label">Created</span>
							<span class="date-value">{formatFullDate(selectedIssueDetails.created_at)}</span>
						</div>
						<div class="date-row">
							<Icon name="clock" size={14} />
							<span class="date-label">Updated</span>
							<span class="date-value">{formatFullDate(selectedIssueDetails.updated_at)}</span>
						</div>
					</div>

					{#if selectedIssueDetails.description}
						<div class="description-section">
							<h4 class="section-title">Description</h4>
							<div class="description-content">
								{@html renderedDescription()}
							</div>
						</div>
					{/if}

					{#if selectedIssueDetails.blockers.length > 0}
						<div class="related-section">
							<h4 class="section-title">
								<Icon name="corner-down-right" size={14} />
								Depends on ({selectedIssueDetails.blockers.length})
							</h4>
							<div class="related-list">
								{#each selectedIssueDetails.blockers as blocker}
									<button class="related-item" onclick={() => selectIssue(blocker.id)}>
										<span class="related-id">{blocker.id.substring(0, 8)}</span>
										<span class="related-title">{blocker.title}</span>
										<span class="related-status" style="color: {statusLabels[blocker.status]?.color || '#6b7280'}">
											{statusLabels[blocker.status]?.label || blocker.status}
										</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if selectedIssueDetails.parent}
						<div class="related-section">
							<h4 class="section-title">
								<Icon name="corner-left-up" size={14} />
								Parent Epic
							</h4>
							<button class="related-item" onclick={() => selectIssue(selectedIssueDetails!.parent!.id)}>
								<span class="related-id">{selectedIssueDetails.parent.id.substring(0, 8)}</span>
								<span class="related-title">{selectedIssueDetails.parent.title}</span>
								<span class="related-status" style="color: {statusLabels[selectedIssueDetails.parent.status]?.color || '#6b7280'}">
									{statusLabels[selectedIssueDetails.parent.status]?.label || selectedIssueDetails.parent.status}
								</span>
							</button>
						</div>
					{/if}

					{#if selectedIssueDetails.children.length > 0}
						<div class="related-section">
							<h4 class="section-title">
								<Icon name="list" size={14} />
								Child Tasks ({selectedIssueDetails.children.length})
							</h4>
							<div class="related-list">
								{#each selectedIssueDetails.children as child}
									<button class="related-item" onclick={() => selectIssue(child.id)}>
										<span class="related-id">{child.id.substring(0, 8)}</span>
										<span class="related-title">{child.title}</span>
										<span class="related-status" style="color: {statusLabels[child.status]?.color || '#6b7280'}">
											{statusLabels[child.status]?.label || child.status}
										</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.list-view {
		display: flex;
		height: 100%;
		background: #ffffff;
	}

	.list-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		border-right: 1px solid #e5e7eb;
	}

	.list-view.has-detail .list-panel {
		max-width: 60%;
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.list-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #1f2937;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.count {
		font-size: 13px;
		color: #6b7280;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: #f3f4f6;
		border: none;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.table-container {
		flex: 1;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	thead {
		position: sticky;
		top: 0;
		background: #f9fafb;
		z-index: 1;
	}

	th {
		padding: 12px 16px;
		text-align: left;
		font-weight: 600;
		color: #6b7280;
		border-bottom: 1px solid #e5e7eb;
		white-space: nowrap;
	}

	th.sortable {
		cursor: pointer;
		user-select: none;
	}

	th.sortable:hover {
		background: #f3f4f6;
	}

	td {
		padding: 12px 16px;
		border-bottom: 1px solid #f3f4f6;
		vertical-align: middle;
	}

	tr.clickable {
		cursor: pointer;
		transition: background 0.1s ease;
	}

	tr.clickable:hover {
		background: #f9fafb;
	}

	tr.clickable.selected {
		background: #eff6ff;
	}

	tr.clickable.selected:hover {
		background: #dbeafe;
	}

	.empty-message {
		text-align: center;
		color: #9ca3af;
		padding: 48px 16px;
	}

	.id-cell code {
		font-size: 12px;
		padding: 2px 6px;
		background: #f3f4f6;
		border-radius: 4px;
		color: #6b7280;
	}

	.title-cell {
		max-width: 300px;
	}

	.title {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #1f2937;
	}

	.type-badge {
		display: inline-block;
		margin-top: 4px;
		padding: 2px 6px;
		background: #f3f4f6;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 500;
		color: #6b7280;
		text-transform: uppercase;
	}

	.status-badge {
		display: inline-block;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 500;
	}

	.status-badge.status-open {
		background: #f3f4f6;
		color: #374151;
	}

	.status-badge.status-ready {
		background: #dcfce7;
		color: #16a34a;
	}

	.status-badge.status-in_progress {
		background: #dbeafe;
		color: #2563eb;
	}

	.status-badge.status-in_review {
		background: #f3e8ff;
		color: #7c3aed;
	}

	.status-badge.status-blocked {
		background: #fee2e2;
		color: #dc2626;
	}

	.status-badge.status-closed {
		background: #f3f4f6;
		color: #9ca3af;
	}

	.priority-indicator {
		font-size: 12px;
		white-space: nowrap;
	}

	.assignee-cell {
		color: #6b7280;
	}

	.date-cell {
		color: #9ca3af;
		white-space: nowrap;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.page-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.page-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #374151;
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-info {
		font-size: 13px;
		color: #6b7280;
		margin: 0 8px;
	}

	/* Detail Panel Styles */
	.detail-panel {
		width: 40%;
		display: flex;
		flex-direction: column;
		background: #ffffff;
		overflow: hidden;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 12px;
		color: #6b7280;
	}

	.loading-state :global(.icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.detail-header {
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.detail-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.detail-id {
		font-family: monospace;
		font-size: 12px;
		color: #6b7280;
	}

	.detail-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.expand-btn,
	.close-detail-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.expand-btn:hover {
		background: #f0f7ff;
		color: #2563eb;
	}

	.close-detail-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.detail-title {
		margin: 0;
		font-size: 16px;
		font-weight: 500;
		color: #1f2937;
		line-height: 1.4;
	}

	.detail-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
	}

	.metadata-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 20px;
	}

	.metadata-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.metadata-label {
		font-size: 12px;
		color: #6b7280;
	}

	.status-badge-lg {
		font-size: 12px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 6px;
	}

	.priority-badge-lg {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: #1f2937;
	}

	.priority-chevrons {
		display: flex;
		flex-direction: column;
		line-height: 0;
	}

	.priority-chevrons :global(.icon) {
		margin: -4px 0;
	}

	.assignee-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #1f2937;
	}

	.dates-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px;
		background: #f9fafb;
		border-radius: 8px;
		margin-bottom: 20px;
	}

	.date-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #6b7280;
	}

	.date-label {
		width: 60px;
	}

	.date-value {
		color: #1f2937;
	}

	.description-section {
		margin-bottom: 20px;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 10px 0;
		font-size: 12px;
		font-weight: 600;
		color: #374151;
		font-family: 'Figtree', sans-serif;
	}

	.description-content {
		font-size: 13px;
		line-height: 1.6;
		color: #4b5563;
	}

	.description-content :global(p) {
		margin: 0 0 10px 0;
	}

	.description-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.description-content :global(code) {
		background: #f3f4f6;
		padding: 2px 4px;
		border-radius: 3px;
		font-size: 0.9em;
	}

	.related-section {
		margin-bottom: 16px;
		padding-top: 16px;
		border-top: 1px solid #f3f4f6;
	}

	.related-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.related-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		background: #f9fafb;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.related-item:hover {
		background: #f3f4f6;
	}

	.related-id {
		font-family: monospace;
		font-size: 10px;
		color: #9ca3af;
		flex-shrink: 0;
	}

	.related-title {
		flex: 1;
		font-size: 12px;
		color: #1f2937;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.related-status {
		font-size: 10px;
		font-weight: 500;
		flex-shrink: 0;
	}
</style>
