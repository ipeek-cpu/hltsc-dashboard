<script lang="ts">
  import { marked } from 'marked';
  import type { IssueWithDetails, Issue, Agent } from '$lib/types';
  import Icon from './Icon.svelte';
  import TypeBadge from './TypeBadge.svelte';
  import CommentThread from './CommentThread.svelte';
  import MarkdownEditor from './MarkdownEditor.svelte';
  import ConfirmDeleteModal from './ConfirmDeleteModal.svelte';
  import ClaimBeadModal from './ClaimBeadModal.svelte';
  import CompleteBeadModal from './CompleteBeadModal.svelte';
  import StatusDropdown from './StatusDropdown.svelte';
  import ActivityTimeline from './ActivityTimeline.svelte';
  import MemoryPanel from './MemoryPanel.svelte';
  import IntentAnchorBadge from './IntentAnchorBadge.svelte';
  import IntentViewer from './IntentViewer.svelte';
  import { toasts } from '$lib/stores/toast-store';
  import type { BeadStatus } from '$lib/bead-lifecycle';

  // Interface for linked intent anchors
  interface LinkedAnchor {
    anchor: string;
    relevance: 'primary' | 'related';
    previewText?: string;
    addedBy: 'user' | 'agent';
    addedAt: string;
  }

  let { issue, isOpen, onclose, onissueclick, onback, canGoBack = false, onupdate, ondelete, projectId, projectPath, agents = [], onstarttask, onchattask, onstoptask, activeRunId = null }: {
    issue: IssueWithDetails | null;
    isOpen: boolean;
    onclose: () => void;
    onissueclick?: (issueId: string) => void;
    onback?: () => void;
    canGoBack?: boolean;
    onupdate?: (updatedIssue: IssueWithDetails) => void;
    ondelete?: (deletedIds: string[]) => void;
    projectId?: string;
    projectPath?: string;
    agents?: Agent[];
    onstarttask?: (issue: Issue, mode: 'autonomous' | 'guided') => void;
    onchattask?: (issue: Issue) => void;
    onstoptask?: (runId: string) => void;
    activeRunId?: string | null;
  } = $props();

  // Derived state for task running
  let isTaskRunning = $derived(activeRunId !== null);

  // Edit mode state
  let isEditing = $state(false);
  let editTitle = $state('');
  let editDescription = $state('');
  let isSaving = $state(false);

  // Delete modal state
  let showDeleteModal = $state(false);
  let deletePreview = $state<{ issue: Issue; descendants: Issue[] } | null>(null);
  let isDeleting = $state(false);

  // Claim/Complete modal state
  let showClaimModal = $state(false);
  let showCompleteModal = $state(false);

  // Quick capture state for memory
  let showQuickCapture = $state(false);
  let captureKind = $state<'decision' | 'checkpoint' | 'constraint'>('decision');
  let captureContent = $state('');
  let capturing = $state(false);
  let memoryPanelKey = $state(0); // Used to trigger MemoryPanel refresh

  // Intent anchor linking state
  let linkedAnchors = $state<LinkedAnchor[]>([]);
  let loadingAnchors = $state(false);
  let showIntentViewer = $state(false);
  let highlightAnchor = $state<string | undefined>(undefined);

  // Reset edit state when issue changes
  $effect(() => {
    if (issue) {
      editTitle = issue.title;
      editDescription = issue.description || '';
      isEditing = false;
    }
  });

  // Load linked anchors when issue changes
  async function loadLinkedAnchors() {
    if (!issue?.id || !projectId) {
      linkedAnchors = [];
      return;
    }

    loadingAnchors = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/intent/links?beadId=${encodeURIComponent(issue.id)}`);
      if (res.ok) {
        const data = await res.json();
        linkedAnchors = data.links || [];
      } else {
        linkedAnchors = [];
      }
    } catch (e) {
      // Silently fail - no linked anchors
      linkedAnchors = [];
    } finally {
      loadingAnchors = false;
    }
  }

  // Load linked anchors when issue or projectId changes
  $effect(() => {
    if (issue?.id && projectId) {
      loadLinkedAnchors();
    } else {
      linkedAnchors = [];
    }
  });

  // Open IntentViewer at a specific anchor
  function openIntentAtAnchor(anchor: string) {
    highlightAnchor = anchor;
    showIntentViewer = true;
  }

  // Close IntentViewer
  function closeIntentViewer() {
    showIntentViewer = false;
    highlightAnchor = undefined;
  }

  // Render description as markdown
  let renderedDescription = $derived(() => {
    if (!issue?.description) return '';
    try {
      return marked(issue.description);
    } catch {
      return issue.description;
    }
  });

  function startEditing() {
    if (issue) {
      editTitle = issue.title;
      editDescription = issue.description || '';
      isEditing = true;
    }
  }

  function cancelEditing() {
    if (issue) {
      editTitle = issue.title;
      editDescription = issue.description || '';
    }
    isEditing = false;
  }

  async function saveChanges() {
    if (!issue || !projectId) return;

    isSaving = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription
        })
      });

      if (response.ok) {
        const updatedIssue = await response.json();
        onupdate?.(updatedIssue);
        isEditing = false;
      } else {
        console.error('Failed to save changes');
      }
    } catch (err) {
      console.error('Error saving changes:', err);
    } finally {
      isSaving = false;
    }
  }

  async function openDeleteModal() {
    if (!issue || !projectId) return;

    try {
      // Fetch delete preview
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}?preview=true`, {
        method: 'DELETE'
      });

      if (response.ok) {
        deletePreview = await response.json();
        showDeleteModal = true;
      }
    } catch (err) {
      console.error('Error fetching delete preview:', err);
    }
  }

  async function confirmDelete() {
    if (!issue || !projectId) return;

    isDeleting = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const result = await response.json();
        ondelete?.(result.deleted);
        showDeleteModal = false;
        onclose();
      }
    } catch (err) {
      console.error('Error deleting issue:', err);
    } finally {
      isDeleting = false;
    }
  }

  function cancelDelete() {
    showDeleteModal = false;
    deletePreview = null;
  }

  // Claim bead (ready → in_progress)
  function openClaimModal() {
    showClaimModal = true;
  }

  function closeClaimModal() {
    showClaimModal = false;
  }

  async function handleClaim(data: { branch_name: string; agent_id: string }) {
    if (!issue || !projectId) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          branch_name: data.branch_name,
          assignee: data.agent_id,
          agent_id: data.agent_id
        })
      });

      if (response.ok) {
        const updatedIssue = await response.json();
        onupdate?.(updatedIssue);
        showClaimModal = false;
      } else {
        const error = await response.json();
        console.error('Failed to claim bead:', error);
        // Error is shown in modal via its error state
      }
    } catch (err) {
      console.error('Error claiming bead:', err);
    }
  }

  // Complete bead (in_progress → in_review)
  function openCompleteModal() {
    showCompleteModal = true;
  }

  function closeCompleteModal() {
    showCompleteModal = false;
  }

  async function handleComplete(data: { commit_hash: string; execution_log: string; pr_url?: string }) {
    if (!issue || !projectId) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_review',
          commit_hash: data.commit_hash,
          execution_log: data.execution_log,
          pr_url: data.pr_url
        })
      });

      if (response.ok) {
        const updatedIssue = await response.json();
        onupdate?.(updatedIssue);
        showCompleteModal = false;
      } else {
        const error = await response.json();
        console.error('Failed to complete bead:', error);
      }
    } catch (err) {
      console.error('Error completing bead:', err);
    }
  }

  // Check if bead can be claimed (ready status)
  let canClaim = $derived(issue?.status === 'ready');

  // Check if bead can be completed (in_progress status)
  let canComplete = $derived(issue?.status === 'in_progress');

  // Assignee update
  let isUpdatingAssignee = $state(false);

  async function updateAssignee(newAssignee: string | null) {
    if (!issue || !projectId) return;

    isUpdatingAssignee = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: newAssignee })
      });

      if (response.ok) {
        const updatedIssue = await response.json();
        onupdate?.(updatedIssue);
      } else {
        console.error('Failed to update assignee');
      }
    } catch (err) {
      console.error('Error updating assignee:', err);
    } finally {
      isUpdatingAssignee = false;
    }
  }

  function handleAssigneeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value || null;
    updateAssignee(value);
  }

  // Handle status change from dropdown
  async function handleStatusChange(newStatus: BeadStatus, requiresModal: boolean) {
    if (!issue || !projectId) return;

    // If transition requires modal, open the appropriate one
    if (requiresModal) {
      if (newStatus === 'in_progress') {
        showClaimModal = true;
      } else if (newStatus === 'in_review') {
        showCompleteModal = true;
      }
      return;
    }

    // Direct status change (no modal required)
    try {
      const response = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        const updatedIssue = await response.json();
        onupdate?.(updatedIssue);
        toasts.success(`Status changed to ${newStatus.replace('_', ' ')}`);
      } else {
        const error = await response.json();
        toasts.error(error.error || 'Failed to change status');
      }
    } catch (err) {
      console.error('Error changing status:', err);
      toasts.error('Failed to change status');
    }
  }

  // Track visibility separately to allow close animation
  let visible = $state(false);
  let animating = $state(false);

  // Resizable width
  const MIN_WIDTH = 420;
  const MAX_WIDTH = 900;
  let sheetWidth = $state(MIN_WIDTH);
  let isResizing = $state(false);

  $effect(() => {
    if (isOpen) {
      visible = true;
      // Small delay to ensure DOM is ready for animation
      requestAnimationFrame(() => {
        animating = true;
      });
    } else if (visible) {
      animating = false;
      // Wait for animation to complete before hiding
      setTimeout(() => {
        visible = false;
      }, 300);
    }
  });

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
    sheetWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
  }

  function stopResize() {
    isResizing = false;
    justFinishedResizing = true;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  const priorityLabels: Record<number, { label: string; color: string; chevrons: number }> = {
    0: { label: 'Critical', color: '#dc2626', chevrons: 4 },
    1: { label: 'High', color: '#ef4444', chevrons: 3 },
    2: { label: 'Medium', color: '#eab308', chevrons: 2 },
    3: { label: 'Low', color: '#22c55e', chevrons: 1 },
    4: { label: 'Backlog', color: '#6b7280', chevrons: 0 },
  };

  const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    open: { label: 'Open', color: '#2563eb', bg: '#dbeafe' },
    in_progress: { label: 'In Progress', color: '#d97706', bg: '#fef3c7' },
    blocked: { label: 'Blocked', color: '#dc2626', bg: '#fee2e2' },
    closed: { label: 'Closed', color: '#059669', bg: '#d1fae5' },
    deferred: { label: 'Deferred', color: '#7c3aed', bg: '#ede9fe' },
  };

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // Track if we just finished resizing to prevent accidental close
  let justFinishedResizing = $state(false);

  // Quick capture function for memory
  function quickCapture(kind: 'decision' | 'checkpoint' | 'constraint') {
    captureKind = kind;
    showQuickCapture = true;
  }

  // Submit quick capture to memory API
  async function submitCapture() {
    if (!captureContent.trim() || !issue || !projectId || !projectPath) return;
    capturing = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/memory?projectPath=${encodeURIComponent(projectPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beadId: issue.id,
          epicId: issue.parent?.id,
          kind: captureKind,
          title: `${captureKind.charAt(0).toUpperCase() + captureKind.slice(1)} - ${issue.title?.slice(0, 30)}`,
          content: captureContent
        })
      });
      if (response.ok) {
        captureContent = '';
        showQuickCapture = false;
        // Trigger MemoryPanel refresh by changing the key
        memoryPanelKey++;
        toasts.success(`${captureKind.charAt(0).toUpperCase() + captureKind.slice(1)} saved`);
      } else {
        const error = await response.json();
        toasts.error(error.message || 'Failed to save memory');
      }
    } catch (e) {
      console.error('Capture failed:', e);
      toasts.error('Failed to save memory');
    } finally {
      capturing = false;
    }
  }

  // Cancel quick capture
  function cancelQuickCapture() {
    showQuickCapture = false;
    captureContent = '';
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !justFinishedResizing) {
      onclose();
    }
    justFinishedResizing = false;
  }

  function handleIssueClick(issueId: string) {
    onissueclick?.(issueId);
  }
</script>

{#if visible}
  <div class="sheet-overlay" class:open={animating} onclick={handleBackdropClick} role="presentation">
    <div class="detail-sheet" class:open={animating} class:resizing={isResizing} style="width: {sheetWidth}px">
      <div class="resize-handle" onmousedown={startResize} role="separator" aria-orientation="vertical"></div>
      {#if issue}
        <div class="sheet-header">
          <div class="sheet-title-row">
            <div class="title-left">
              {#if canGoBack && !isEditing}
                <button class="back-btn" onclick={onback}>
                  <Icon name="arrow-left" size={18} />
                </button>
              {/if}
              <span class="issue-id">{issue.id}</span>
            </div>
            <div class="header-actions">
              {#if !isEditing}
                {#if issue.status !== 'closed'}
                  {#if canClaim}
                    <button class="claim-btn" onclick={openClaimModal} title="Claim this bead and start working">
                      <Icon name="git-branch" size={16} />
                      Claim
                    </button>
                  {:else if canComplete}
                    <button class="complete-btn" onclick={openCompleteModal} title="Submit for review">
                      <Icon name="check-circle" size={16} />
                      Complete
                    </button>
                  {/if}
                  {#if isTaskRunning && activeRunId}
                    <button class="stop-btn" onclick={() => onstoptask?.(activeRunId)} title="Stop Task">
                      <Icon name="square" size={16} />
                      Stop
                    </button>
                  {:else if onstarttask && issue.status === 'in_progress'}
                    <button class="start-btn" onclick={() => onstarttask?.(issue, 'autonomous')} title="Start Task">
                      <Icon name="play" size={16} />
                      Run
                    </button>
                  {/if}
                  <button class="chat-btn" onclick={() => onchattask?.(issue)} title="Chat About Task">
                    <Icon name="message-circle" size={16} />
                  </button>
                {/if}
                <button class="edit-btn" onclick={startEditing} title="Edit">
                  <Icon name="edit-2" size={18} />
                </button>
                <button class="delete-btn" onclick={openDeleteModal} title="Delete">
                  <Icon name="trash-2" size={18} />
                </button>
              {/if}
              <button class="close-btn" onclick={onclose}>
                <Icon name="x" size={20} />
              </button>
            </div>
          </div>
          {#if isEditing}
            <input
              type="text"
              class="title-input"
              bind:value={editTitle}
              placeholder="Issue title..."
            />
          {:else}
            <h2 class="sheet-title">{issue.title}</h2>
          {/if}
        </div>

        <div class="sheet-content">
          <div class="metadata-section">
            <div class="metadata-row">
              <span class="metadata-label">Status</span>
              <StatusDropdown
                status={issue.status as BeadStatus}
                onchange={handleStatusChange}
                disabled={isEditing}
              />
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Type</span>
              <TypeBadge type={issue.issue_type} size="md" />
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Priority</span>
              <span class="priority-badge">
                {#if priorityLabels[issue.priority]?.chevrons > 0}
                  <span class="priority-chevrons" style="color: {priorityLabels[issue.priority]?.color || '#6b7280'}">
                    {#each Array(priorityLabels[issue.priority]?.chevrons || 1) as _, i}
                      <Icon name="chevron-up" size={14} />
                    {/each}
                  </span>
                {/if}
                {priorityLabels[issue.priority]?.label || 'Unknown'}
              </span>
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Assignee</span>
              {#if agents.length > 0}
                <select
                  class="assignee-select"
                  value={issue.assignee || ''}
                  onchange={handleAssigneeChange}
                  disabled={isUpdatingAssignee}
                >
                  <option value="">Unassigned</option>
                  {#each agents as agent}
                    <option value={agent.frontmatter.name}>{agent.frontmatter.name}</option>
                  {/each}
                </select>
              {:else if issue.assignee}
                <span class="assignee-badge">
                  <Icon name="user" size={14} />
                  {issue.assignee}
                </span>
              {:else}
                <span class="assignee-empty">Unassigned</span>
              {/if}
            </div>
            {#if linkedAnchors.length > 0}
              <div class="metadata-row intent-row">
                <span class="metadata-label">Intent</span>
                <div class="anchor-badges">
                  {#each linkedAnchors as link (link.anchor)}
                    <IntentAnchorBadge
                      anchor={link.anchor}
                      previewText={link.previewText}
                      size="sm"
                      onclick={openIntentAtAnchor}
                    />
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <div class="dates-section">
            <div class="date-row">
              <Icon name="calendar" size={14} />
              <span class="date-label">Created</span>
              <span class="date-value">{formatDate(issue.created_at)}</span>
            </div>
            <div class="date-row">
              <Icon name="clock" size={14} />
              <span class="date-label">Updated</span>
              <span class="date-value">{formatDate(issue.updated_at)}</span>
            </div>
            {#if issue.closed_at}
              <div class="date-row">
                <Icon name="check-circle" size={14} />
                <span class="date-label">Closed</span>
                <span class="date-value">{formatDate(issue.closed_at)}</span>
              </div>
            {/if}
          </div>

          {#if isEditing}
            <div class="description-section">
              <h4 class="section-title">Description</h4>
              <MarkdownEditor
                value={editDescription}
                onchange={(val) => editDescription = val}
                placeholder="Enter description (markdown supported)..."
              />
            </div>

            <div class="edit-actions">
              <button class="btn-cancel" onclick={cancelEditing} disabled={isSaving}>
                Cancel
              </button>
              <button class="btn-save" onclick={saveChanges} disabled={isSaving}>
                {#if isSaving}
                  <Icon name="loader" size={16} />
                  Saving...
                {:else}
                  <Icon name="check" size={16} />
                  Save Changes
                {/if}
              </button>
            </div>
          {:else if issue.description}
            <div class="description-section">
              <h4 class="section-title">Description</h4>
              <div class="description-content">
                {@html renderedDescription()}
              </div>
            </div>
          {/if}

          {#if issue.blockers.length > 0}
            <div class="related-section">
              <h4 class="section-title">
                <Icon name="corner-down-right" size={16} />
                Depends on ({issue.blockers.length})
              </h4>
              <div class="related-list">
                {#each issue.blockers as blocker (blocker.id)}
                  <button class="related-item" onclick={() => handleIssueClick(blocker.id)}>
                    <span class="related-id">{blocker.id}</span>
                    <span class="related-title">{blocker.title}</span>
                    <span class="related-status" style="color: {statusLabels[blocker.status]?.color || '#6b7280'}">
                      {statusLabels[blocker.status]?.label || blocker.status}
                    </span>
                    <Icon name="chevron-right" size={14} />
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if issue.blocked_by.length > 0}
            <div class="related-section">
              <h4 class="section-title">
                <Icon name="corner-up-right" size={16} />
                Dependency for ({issue.blocked_by.length})
              </h4>
              <div class="related-list">
                {#each issue.blocked_by as blocked (blocked.id)}
                  <button class="related-item" onclick={() => handleIssueClick(blocked.id)}>
                    <span class="related-id">{blocked.id}</span>
                    <span class="related-title">{blocked.title}</span>
                    <span class="related-status" style="color: {statusLabels[blocked.status]?.color || '#6b7280'}">
                      {statusLabels[blocked.status]?.label || blocked.status}
                    </span>
                    <Icon name="chevron-right" size={14} />
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if issue.parent}
            <div class="related-section">
              <h4 class="section-title">
                <Icon name="corner-left-up" size={16} />
                Parent Epic
              </h4>
              <button class="related-item" onclick={() => handleIssueClick(issue.parent!.id)}>
                <span class="related-id">{issue.parent.id}</span>
                <span class="related-title">{issue.parent.title}</span>
                <span class="related-status" style="color: {statusLabels[issue.parent.status]?.color || '#6b7280'}">
                  {statusLabels[issue.parent.status]?.label || issue.parent.status}
                </span>
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          {/if}

          {#if issue.children.length > 0}
            <div class="related-section">
              <h4 class="section-title">
                <Icon name="list" size={16} />
                Child Tasks ({issue.children.length})
              </h4>
              <div class="related-list">
                {#each issue.children as child (child.id)}
                  <button class="related-item" onclick={() => handleIssueClick(child.id)}>
                    <span class="related-id">{child.id}</span>
                    <span class="related-title">{child.title}</span>
                    <span class="child-status" style="color: {statusLabels[child.status]?.color || '#6b7280'}">
                      {statusLabels[child.status]?.label || child.status}
                    </span>
                    <Icon name="chevron-right" size={14} />
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <CommentThread comments={issue.comments} />

          {#if projectId && projectPath}
            <section class="memory-section">
              <div class="memory-section-header">
                <h4 class="section-title">Memory</h4>
                <div class="quick-actions">
                  <button class="btn-quick" onclick={() => quickCapture('decision')} title="Save Decision">
                    <Icon name="check-circle" size={14} />
                    Decision
                  </button>
                  <button class="btn-quick" onclick={() => quickCapture('checkpoint')} title="Save Checkpoint">
                    <Icon name="flag" size={14} />
                    Checkpoint
                  </button>
                  <button class="btn-quick" onclick={() => quickCapture('constraint')} title="Add Constraint">
                    <Icon name="alert-triangle" size={14} />
                    Constraint
                  </button>
                </div>
              </div>

              {#if showQuickCapture}
                <div class="quick-capture-form">
                  <div class="capture-kind-badge" data-kind={captureKind}>
                    <Icon name={captureKind === 'decision' ? 'check-circle' : captureKind === 'checkpoint' ? 'flag' : 'alert-triangle'} size={12} />
                    {captureKind.charAt(0).toUpperCase() + captureKind.slice(1)}
                  </div>
                  <textarea
                    bind:value={captureContent}
                    placeholder="What should be remembered?"
                    rows="3"
                  ></textarea>
                  <div class="capture-actions">
                    <button class="btn-secondary" onclick={cancelQuickCapture}>Cancel</button>
                    <button class="btn-primary" onclick={submitCapture} disabled={capturing || !captureContent.trim()}>
                      {capturing ? 'Saving...' : `Save ${captureKind}`}
                    </button>
                  </div>
                </div>
              {/if}

              {#key memoryPanelKey}
                <MemoryPanel
                  beadId={issue.id}
                  {projectId}
                  {projectPath}
                  epicId={issue.parent?.id}
                />
              {/key}
            </section>
          {/if}

          <ActivityTimeline events={issue.events || []} />
        </div>
      {:else}
        <div class="loading-state">
          <span>Loading...</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<ConfirmDeleteModal
  isOpen={showDeleteModal}
  issue={deletePreview?.issue ?? null}
  descendants={deletePreview?.descendants ?? []}
  isDeleting={isDeleting}
  onconfirm={confirmDelete}
  oncancel={cancelDelete}
/>

<ClaimBeadModal
  isOpen={showClaimModal}
  issue={issue}
  {agents}
  onclose={closeClaimModal}
  onclaim={handleClaim}
/>

<CompleteBeadModal
  isOpen={showCompleteModal}
  issue={issue}
  onclose={closeCompleteModal}
  oncomplete={handleComplete}
/>

{#if projectId}
  <IntentViewer
    {projectId}
    open={showIntentViewer}
    {highlightAnchor}
    onclose={closeIntentViewer}
  />
{/if}

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .sheet-overlay.open {
    opacity: 1;
    pointer-events: auto;
  }

  .detail-sheet {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    min-width: 420px;
    max-width: 90vw;
    background: #ffffff;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
  }

  .detail-sheet.open {
    transform: translateX(0);
  }

  .detail-sheet.resizing {
    transition: none;
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

  .resize-handle::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 40px;
    background: #d0d0d0;
    border-radius: 1px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .resize-handle:hover::after {
    opacity: 1;
  }

  .sheet-header {
    padding: 20px 24px;
    border-bottom: 1px solid #eaeaea;
    flex-shrink: 0;
  }

  .sheet-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .title-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    border: none;
    color: #666666;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: #eeeeee;
    color: #1a1a1a;
  }

  .issue-id {
    font-family: monospace;
    font-size: 13px;
    color: #888888;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #888888;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .start-btn,
  .stop-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .start-btn {
    background: #10b981;
  }

  .start-btn:hover {
    background: #059669;
  }

  .stop-btn {
    background: #dc2626;
  }

  .stop-btn:hover {
    background: #b91c1c;
  }

  .claim-btn,
  .complete-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .claim-btn {
    background: #3b82f6;
  }

  .claim-btn:hover {
    background: #2563eb;
  }

  .complete-btn {
    background: #10b981;
  }

  .complete-btn:hover {
    background: #059669;
  }

  .chat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    background: #f3f4f6;
    border: none;
    border-radius: 6px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chat-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .edit-btn,
  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #888888;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .edit-btn:hover {
    background: #f0f7ff;
    color: #2563eb;
  }

  .delete-btn:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .title-input {
    width: 100%;
    padding: 10px 12px;
    font-size: 18px;
    font-weight: 500;
    color: #1a1a1a;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-family: 'Figtree', sans-serif;
    background: #ffffff;
    transition: border-color 0.15s ease;
  }

  .title-input:focus {
    outline: none;
    border-color: #2563eb;
  }

  .title-input::placeholder {
    color: #aaaaaa;
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 16px;
    border-top: 1px solid #eaeaea;
    margin-bottom: 24px;
  }

  .btn-cancel,
  .btn-save {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .btn-cancel {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    color: #4b5563;
  }

  .btn-cancel:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #d0d0d0;
  }

  .btn-save {
    background: #2563eb;
    border: 1px solid #2563eb;
    color: #ffffff;
  }

  .btn-save:hover:not(:disabled) {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-save:disabled :global(.icon) {
    animation: spin 1s linear infinite;
  }

  .sheet-title {
    margin: 0;
    font-size: 20px;
    font-weight: 400;
    color: #1a1a1a;
    line-height: 1.4;
  }

  .sheet-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .metadata-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .metadata-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .metadata-label {
    font-size: 13px;
    color: #888888;
  }

  .intent-row {
    align-items: flex-start;
  }

  .anchor-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
    max-width: 70%;
  }

  .status-badge {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 6px;
  }

  .priority-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #1a1a1a;
  }

  .priority-chevrons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: -8px;
    line-height: 0;
  }

  .priority-chevrons :global(.icon) {
    margin: -4px 0;
  }

  .assignee-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #1a1a1a;
  }

  .assignee-select {
    padding: 6px 10px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'Figtree', sans-serif;
    color: #1a1a1a;
    cursor: pointer;
    min-width: 140px;
    transition: border-color 0.15s ease;
  }

  .assignee-select:hover:not(:disabled) {
    border-color: #d1d5db;
  }

  .assignee-select:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .assignee-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .assignee-empty {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }

  .dates-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: #f8f8f8;
    border-radius: 12px;
    margin-bottom: 24px;
  }

  .date-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #888888;
  }

  .date-label {
    width: 60px;
  }

  .date-value {
    color: #1a1a1a;
  }

  .description-section {
    margin-bottom: 24px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
    font-family: 'Figtree', sans-serif;
  }

  .description-content {
    font-size: 14px;
    line-height: 1.6;
    color: #4b5563;
  }

  .description-content :global(h1),
  .description-content :global(h2),
  .description-content :global(h3),
  .description-content :global(h4),
  .description-content :global(h5),
  .description-content :global(h6) {
    margin-top: 0;
    margin-bottom: 12px;
    font-family: 'Figtree', sans-serif;
    font-weight: 600;
    color: #1a1a1a;
  }

  .description-content :global(h1) { font-size: 1.5em; }
  .description-content :global(h2) { font-size: 1.3em; }
  .description-content :global(h3) { font-size: 1.15em; }

  .description-content :global(p) {
    margin: 0 0 12px 0;
  }

  .description-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .description-content :global(ul),
  .description-content :global(ol) {
    margin: 0 0 12px 0;
    padding-left: 20px;
  }

  .description-content :global(li) {
    margin-bottom: 4px;
  }

  .description-content :global(code) {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 0.9em;
  }

  .description-content :global(pre) {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 12px 0;
  }

  .description-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .description-content :global(blockquote) {
    margin: 0 0 12px 0;
    padding-left: 14px;
    border-left: 3px solid #e0e0e0;
    color: #666666;
  }

  .description-content :global(a) {
    color: #2563eb;
    text-decoration: none;
  }

  .description-content :global(a:hover) {
    text-decoration: underline;
  }

  .related-section {
    margin-bottom: 24px;
    border-top: 1px solid #eaeaea;
    padding-top: 20px;
  }

  .related-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .related-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: #f8f8f8;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .related-item:hover {
    background: #f0f0f0;
  }

  .related-id {
    font-family: monospace;
    font-size: 11px;
    color: #888888;
    flex-shrink: 0;
  }

  .related-title {
    flex: 1;
    font-size: 13px;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .child-status,
  .related-status {
    font-size: 11px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #888888;
    font-size: 14px;
  }

  @media (max-width: 480px) {
    .detail-sheet {
      width: 100vw;
    }
  }

  /* Memory section styles */
  .memory-section {
    margin-top: 24px;
    border-top: 1px solid #eaeaea;
    padding-top: 20px;
  }

  .memory-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .quick-actions {
    display: flex;
    gap: 6px;
  }

  .btn-quick {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 500;
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .btn-quick:hover {
    background: #eeeeee;
    color: #1a1a1a;
    border-color: #d0d0d0;
  }

  .quick-capture-form {
    margin-bottom: 16px;
    padding: 12px;
    background: #f8f8f8;
    border-radius: 8px;
  }

  .capture-kind-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    border-radius: 4px;
    margin-bottom: 8px;
  }

  .capture-kind-badge[data-kind="decision"] {
    background: #dcfce7;
    color: #16a34a;
  }

  .capture-kind-badge[data-kind="checkpoint"] {
    background: #ede9fe;
    color: #7c3aed;
  }

  .capture-kind-badge[data-kind="constraint"] {
    background: #fef3c7;
    color: #d97706;
  }

  .quick-capture-form textarea {
    width: 100%;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    color: #1a1a1a;
    font-size: 13px;
    font-family: 'Figtree', sans-serif;
    resize: vertical;
    min-height: 60px;
    transition: border-color 0.15s ease;
  }

  .quick-capture-form textarea:focus {
    outline: none;
    border-color: #2563eb;
  }

  .quick-capture-form textarea::placeholder {
    color: #aaaaaa;
  }

  .capture-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }

  .capture-actions .btn-secondary,
  .capture-actions .btn-primary {
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .capture-actions .btn-secondary {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    color: #666666;
  }

  .capture-actions .btn-secondary:hover {
    background: #f5f5f5;
    border-color: #d0d0d0;
  }

  .capture-actions .btn-primary {
    background: #2563eb;
    border: 1px solid #2563eb;
    color: #ffffff;
  }

  .capture-actions .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }

  .capture-actions .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
