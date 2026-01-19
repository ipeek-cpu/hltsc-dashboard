<script lang="ts">
	import VersionHistoryView from './VersionHistoryView.svelte';
	import SessionHistoryView from './SessionHistoryView.svelte';
	import RecentEventsPanel from './RecentEventsPanel.svelte';
	import Icon from './Icon.svelte';
	import type { Event } from '$lib/types';

	type HistorySubTab = 'activity' | 'git' | 'sessions';

	let {
		projectId,
		events = []
	}: {
		projectId: string;
		events?: Event[];
	} = $props();

	let activeSubTab = $state<HistorySubTab>('activity');
</script>

<div class="history-tab">
	<div class="sub-tab-bar">
		<button
			class="sub-tab"
			class:active={activeSubTab === 'activity'}
			onclick={() => activeSubTab = 'activity'}
		>
			<Icon name="activity" size={16} />
			<span>Activity</span>
		</button>
		<button
			class="sub-tab"
			class:active={activeSubTab === 'git'}
			onclick={() => activeSubTab = 'git'}
		>
			<Icon name="git-commit" size={16} />
			<span>Git Changes</span>
		</button>
		<button
			class="sub-tab"
			class:active={activeSubTab === 'sessions'}
			onclick={() => activeSubTab = 'sessions'}
		>
			<Icon name="message-circle" size={16} />
			<span>Sessions</span>
		</button>
	</div>

	<div class="sub-tab-content">
		{#if activeSubTab === 'activity'}
			<RecentEventsPanel {events} {projectId} />
		{:else if activeSubTab === 'git'}
			<VersionHistoryView {projectId} />
		{:else if activeSubTab === 'sessions'}
			<SessionHistoryView {projectId} isVisible={activeSubTab === 'sessions'} />
		{/if}
	</div>
</div>

<style>
	.history-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.sub-tab-bar {
		display: flex;
		gap: 4px;
		padding: 12px 24px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
	}

	.sub-tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: transparent;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.sub-tab:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.sub-tab.active {
		background: #f3f4f6;
		color: #1f2937;
	}

	.sub-tab-content {
		flex: 1;
		overflow: hidden;
	}
</style>
