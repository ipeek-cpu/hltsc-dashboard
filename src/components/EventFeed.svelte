<script lang="ts">
  import { browser } from '$app/environment';
  import type { Event } from '$lib/types';
  import Icon from './Icon.svelte';

  let { events = [] }: { events?: Event[] } = $props();

  // Collapsible state with localStorage persistence
  let collapsed = $state(false);

  // Load collapsed state from localStorage on mount
  $effect(() => {
    if (browser) {
      const stored = localStorage.getItem('beads-activity-collapsed');
      if (stored === 'true') {
        collapsed = true;
      }
    }
  });

  function toggleCollapsed() {
    collapsed = !collapsed;
    if (browser) {
      localStorage.setItem('beads-activity-collapsed', String(collapsed));
    }
  }

  const eventIcons: Record<string, string> = {
    created: 'plus-circle',
    status_change: 'refresh-cw',
    comment_added: 'message-circle',
    priority_change: 'zap',
    assigned: 'user',
    closed: 'check-circle',
  };

  function formatTime(dateStr: string): string {
    // Handle SQLite timestamps which may be stored in UTC without 'Z' suffix
    let normalizedDateStr = dateStr;
    if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      normalizedDateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    const date = new Date(normalizedDateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }

  function getEventDescription(event: Event): string {
    switch (event.event_type) {
      case 'status_change':
        return `changed status: ${event.old_value} → ${event.new_value}`;
      case 'created':
        return 'created issue';
      case 'comment_added':
        return 'added a comment';
      case 'priority_change':
        return `changed priority: ${event.old_value} → ${event.new_value}`;
      case 'assigned':
        return `assigned to ${event.new_value}`;
      case 'closed':
        return 'closed issue';
      default:
        return event.event_type;
    }
  }
</script>

<div class="event-feed" class:collapsed>
  <button class="header" onclick={toggleCollapsed}>
    <h3>Recent Activity</h3>
    {#if collapsed && events.length > 0}
      <span class="badge">{events.length}</span>
    {/if}
    <Icon name={collapsed ? 'chevron-left' : 'chevron-down'} size={14} />
  </button>

  {#if !collapsed}
    <div class="events-list">
      {#each events.slice(0, 20) as event (event.id)}
        <div class="event-item">
          <span class="event-icon">
            <Icon name={eventIcons[event.event_type] || 'edit'} size={14} />
          </span>
          <div class="event-content">
            <span class="event-issue">{event.issue_id}</span>
            <span class="event-desc">{getEventDescription(event)}</span>
            <span class="event-time">{formatTime(event.created_at)}</span>
          </div>
        </div>
      {/each}

      {#if events.length === 0}
        <div class="empty-state">No recent activity</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .event-feed {
    background: #ffffff;
    border-radius: 16px;
    padding: 16px;
    width: 280px;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
    transition: width 0.2s ease;
  }

  .event-feed.collapsed {
    width: auto;
    min-width: 48px;
    padding: 12px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0;
    margin: 0 0 12px 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: #6b7280;
    transition: color 0.15s ease;
  }

  .header:hover {
    color: #374151;
  }

  .collapsed .header {
    margin: 0;
    justify-content: center;
  }

  .collapsed .header h3 {
    display: none;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #1a1a1a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: 'Figtree', sans-serif;
    flex: 1;
  }

  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: #3b82f6;
    color: #ffffff;
    font-size: 10px;
    font-weight: 600;
    border-radius: 9px;
    font-family: 'Figtree', sans-serif;
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-item {
    display: flex;
    gap: 10px;
    padding: 10px;
    background: #f8f8f8;
    border-radius: 10px;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .event-icon {
    color: #888888;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .event-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .event-issue {
    font-family: monospace;
    font-size: 11px;
    color: #3b82f6;
  }

  .event-desc {
    font-size: 12px;
    color: #666666;
  }

  .event-time {
    font-size: 10px;
    color: #888888;
  }

  .empty-state {
    text-align: center;
    color: #888888;
    padding: 24px;
    font-size: 13px;
  }
</style>
