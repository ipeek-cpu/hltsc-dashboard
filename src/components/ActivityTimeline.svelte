<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Event } from '$lib/types';

  let { events = [] }: { events: Event[] } = $props();

  // Format event for display
  function formatEvent(event: Event): { icon: string; color: string; message: string } {
    switch (event.event_type) {
      case 'status_change':
        return {
          icon: getStatusIcon(event.new_value),
          color: getStatusColor(event.new_value),
          message: `Status changed from ${formatStatus(event.old_value)} to ${formatStatus(event.new_value)}`
        };
      case 'created':
        return {
          icon: 'plus-circle',
          color: '#22c55e',
          message: 'Issue created'
        };
      case 'assigned':
        return {
          icon: 'user-plus',
          color: '#3b82f6',
          message: event.new_value
            ? `Assigned to ${event.new_value}`
            : 'Unassigned'
        };
      case 'comment':
        return {
          icon: 'message-circle',
          color: '#6b7280',
          message: event.comment || 'Comment added'
        };
      case 'claimed':
        return {
          icon: 'git-branch',
          color: '#8b5cf6',
          message: `Claimed for execution${event.new_value ? ` on branch ${event.new_value}` : ''}`
        };
      case 'completed':
        return {
          icon: 'check-circle',
          color: '#22c55e',
          message: 'Submitted for review'
        };
      case 'priority_change':
        return {
          icon: 'chevron-up',
          color: '#f59e0b',
          message: `Priority changed from ${formatPriority(event.old_value)} to ${formatPriority(event.new_value)}`
        };
      case 'title_change':
        return {
          icon: 'edit',
          color: '#6b7280',
          message: 'Title updated'
        };
      case 'description_change':
        return {
          icon: 'file-text',
          color: '#6b7280',
          message: 'Description updated'
        };
      default:
        return {
          icon: 'activity',
          color: '#6b7280',
          message: event.event_type.replace(/_/g, ' ')
        };
    }
  }

  function getStatusIcon(status: string | null): string {
    switch (status) {
      case 'open': return 'circle';
      case 'ready': return 'check-circle';
      case 'in_progress': return 'play-circle';
      case 'in_review': return 'eye';
      case 'blocked': return 'x-octagon';
      case 'closed': return 'check';
      case 'deferred': return 'clock';
      default: return 'circle';
    }
  }

  function getStatusColor(status: string | null): string {
    switch (status) {
      case 'open': return '#3b82f6';
      case 'ready': return '#8b5cf6';
      case 'in_progress': return '#f59e0b';
      case 'in_review': return '#06b6d4';
      case 'blocked': return '#ef4444';
      case 'closed': return '#22c55e';
      case 'deferred': return '#6b7280';
      default: return '#6b7280';
    }
  }

  function formatStatus(status: string | null): string {
    if (!status) return 'unknown';
    return status.replace(/_/g, ' ');
  }

  function formatPriority(priority: string | null): string {
    if (!priority) return 'unknown';
    const map: Record<string, string> = {
      '0': 'Critical',
      '1': 'High',
      '2': 'Medium',
      '3': 'Low',
      '4': 'Backlog'
    };
    return map[priority] || priority;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now';
    }
    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    // Otherwise, show date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
</script>

{#if events.length > 0}
  <div class="activity-timeline">
    <h3 class="timeline-header">
      <Icon name="activity" size={16} />
      Activity
    </h3>
    <div class="timeline-list">
      {#each events as event (event.id)}
        {@const formatted = formatEvent(event)}
        <div class="timeline-item">
          <div class="timeline-line"></div>
          <div class="timeline-dot" style="background: {formatted.color}">
            <Icon name={formatted.icon} size={12} />
          </div>
          <div class="timeline-content">
            <span class="timeline-message">{formatted.message}</span>
            <span class="timeline-meta">
              {#if event.actor}
                <span class="timeline-actor">{event.actor}</span>
                <span class="timeline-separator">·</span>
              {/if}
              <span class="timeline-time">{formatDate(event.created_at)}</span>
            </span>
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="no-activity">
    <Icon name="activity" size={20} />
    <span>No activity recorded</span>
  </div>
{/if}

<style>
  .activity-timeline {
    margin-top: 24px;
  }

  .timeline-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    margin: 0 0 16px 0;
    font-family: 'Figtree', sans-serif;
  }

  .timeline-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .timeline-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    position: relative;
    padding-bottom: 16px;
  }

  .timeline-item:last-child {
    padding-bottom: 0;
  }

  .timeline-item:last-child .timeline-line {
    display: none;
  }

  .timeline-line {
    position: absolute;
    left: 11px;
    top: 24px;
    bottom: 0;
    width: 2px;
    background: #e5e7eb;
  }

  .timeline-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    flex-shrink: 0;
    color: white;
    z-index: 1;
  }

  .timeline-content {
    flex: 1;
    min-width: 0;
    padding-top: 2px;
  }

  .timeline-message {
    display: block;
    font-size: 13px;
    color: #374151;
    line-height: 1.4;
  }

  .timeline-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
    color: #9ca3af;
  }

  .timeline-actor {
    font-weight: 500;
    color: #6b7280;
  }

  .timeline-separator {
    color: #d1d5db;
  }

  .timeline-time {
    color: #9ca3af;
  }

  .no-activity {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: #9ca3af;
    font-size: 13px;
  }
</style>
