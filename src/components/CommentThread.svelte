<script lang="ts">
  import type { Comment } from '$lib/types';
  import Icon from './Icon.svelte';

  let { comments = [] }: { comments?: Comment[] } = $props();

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? 'just now' : `${minutes}m ago`;
      }
      return `${hours}h ago`;
    }
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  function getInitials(name: string): string {
    return name
      .split(/[\s_-]+/)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
</script>

<div class="comment-thread">
  <h4 class="section-title">
    <Icon name="message-circle" size={16} />
    Comments ({comments.length})
  </h4>

  {#if comments.length === 0}
    <div class="empty-state">No comments yet</div>
  {:else}
    <div class="comments-list">
      {#each comments as comment (comment.id)}
        <div class="comment">
          <div class="comment-avatar">
            {getInitials(comment.author)}
          </div>
          <div class="comment-content">
            <div class="comment-header">
              <span class="comment-author">{comment.author}</span>
              <span class="comment-time">{formatTime(comment.created_at)}</span>
            </div>
            <div class="comment-text">{comment.text}</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .comment-thread {
    border-top: 1px solid #eaeaea;
    padding-top: 20px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
    font-family: 'Figtree', sans-serif;
  }

  .empty-state {
    color: #888888;
    font-size: 14px;
    text-align: center;
    padding: 24px;
  }

  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .comment {
    display: flex;
    gap: 12px;
  }

  .comment-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #6b7280;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .comment-content {
    flex: 1;
    min-width: 0;
  }

  .comment-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .comment-author {
    font-size: 13px;
    font-weight: 500;
    color: #1a1a1a;
  }

  .comment-time {
    font-size: 12px;
    color: #888888;
  }

  .comment-text {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
