<script lang="ts">
	import type { Event } from '$lib/types';
	import Icon from './Icon.svelte';

	let { events = [], projectId }: {
		events?: Event[];
		projectId: string;
	} = $props();

	const eventIcons: Record<string, string> = {
		created: 'plus-circle',
		status_change: 'refresh-cw',
		comment_added: 'message-circle',
		priority_change: 'zap',
		assigned: 'user',
		closed: 'check-circle',
	};

	function formatTime(dateStr: string): string {
		let normalizedDateStr = dateStr;
		if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
			normalizedDateStr = normalizedDateStr.replace(' ', 'T') + 'Z';
		}
		const date = new Date(normalizedDateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (seconds < 60) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	function formatFullTime(dateStr: string): string {
		let normalizedDateStr = dateStr;
		if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
			normalizedDateStr = normalizedDateStr.replace(' ', 'T') + 'Z';
		}
		const date = new Date(normalizedDateStr);
		return date.toLocaleString();
	}

	function getEventDescription(event: Event): string {
		switch (event.event_type) {
			case 'status_change':
				return `Status changed from ${event.old_value} to ${event.new_value}`;
			case 'created':
				return 'Issue created';
			case 'comment_added':
				return 'Comment added';
			case 'priority_change':
				return `Priority changed from ${event.old_value} to ${event.new_value}`;
			case 'assigned':
				return `Assigned to ${event.new_value || 'someone'}`;
			case 'closed':
				return 'Issue closed';
			default:
				return event.event_type.replace(/_/g, ' ');
		}
	}

	function getEventColor(eventType: string): string {
		switch (eventType) {
			case 'created': return '#22c55e';
			case 'closed': return '#6b7280';
			case 'status_change': return '#3b82f6';
			case 'priority_change': return '#f59e0b';
			case 'assigned': return '#8b5cf6';
			case 'comment_added': return '#06b6d4';
			default: return '#6b7280';
		}
	}

	// Group events by date
	let groupedEvents = $derived(() => {
		const groups: Map<string, Event[]> = new Map();

		for (const event of events) {
			let normalizedDateStr = event.created_at;
			if (!normalizedDateStr.includes('Z') && !normalizedDateStr.includes('+') && !normalizedDateStr.includes('-', 10)) {
				normalizedDateStr = normalizedDateStr.replace(' ', 'T') + 'Z';
			}
			const date = new Date(normalizedDateStr);
			const dateKey = date.toLocaleDateString(undefined, {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});

			if (!groups.has(dateKey)) {
				groups.set(dateKey, []);
			}
			groups.get(dateKey)!.push(event);
		}

		return groups;
	});
</script>

<div class="recent-events-panel">
	<header class="panel-header">
		<div class="header-info">
			<Icon name="clock" size={20} />
			<h2>Recent Activity</h2>
			<span class="event-count">{events.length} events</span>
		</div>
	</header>

	<div class="feed-content">
		{#if events.length === 0}
			<div class="empty-state">
				<Icon name="inbox" size={48} />
				<p>No recent activity</p>
				<p class="hint">Activity from issue changes will appear here</p>
			</div>
		{:else}
			{#each [...groupedEvents().entries()] as [dateLabel, dayEvents]}
				<div class="date-group">
					<div class="date-header">{dateLabel}</div>
					<div class="events-list">
						{#each dayEvents as event}
							<div class="event-item">
								<div class="event-icon" style="--event-color: {getEventColor(event.event_type)}">
									<Icon name={eventIcons[event.event_type] || 'circle'} size={14} />
								</div>
								<div class="event-content">
									<div class="event-main">
										<span class="event-issue">#{event.issue_id?.slice(0, 8) || 'unknown'}</span>
										<span class="event-desc">{getEventDescription(event)}</span>
									</div>
									{#if event.actor}
										<div class="event-actor">by {event.actor}</div>
									{/if}
									{#if event.comment}
										<div class="event-comment">"{event.comment}"</div>
									{/if}
								</div>
								<div class="event-time" title={formatFullTime(event.created_at)}>
									{formatTime(event.created_at)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.recent-events-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-info h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
	}

	.event-count {
		padding: 2px 8px;
		font-size: 12px;
		background: #e5e7eb;
		border-radius: 10px;
		color: #6b7280;
	}

	.feed-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px 24px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: #9ca3af;
	}

	.empty-state p {
		margin: 8px 0 0;
	}

	.empty-state .hint {
		font-size: 13px;
		color: #d1d5db;
	}

	.date-group {
		margin-bottom: 24px;
	}

	.date-header {
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid #e5e7eb;
	}

	.events-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.event-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 16px;
		background: #ffffff;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
		transition: box-shadow 0.15s;
	}

	.event-item:hover {
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.event-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--event-color) 15%, white);
		color: var(--event-color);
		flex-shrink: 0;
	}

	.event-content {
		flex: 1;
		min-width: 0;
	}

	.event-main {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}

	.event-issue {
		font-family: 'SF Mono', monospace;
		font-size: 12px;
		font-weight: 500;
		color: #3b82f6;
	}

	.event-desc {
		font-size: 13px;
		color: #374151;
	}

	.event-actor {
		font-size: 12px;
		color: #9ca3af;
		margin-top: 2px;
	}

	.event-comment {
		font-size: 12px;
		color: #6b7280;
		font-style: italic;
		margin-top: 4px;
		padding: 6px 10px;
		background: #f9fafb;
		border-radius: 4px;
		border-left: 2px solid #e5e7eb;
	}

	.event-time {
		font-size: 11px;
		color: #9ca3af;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
