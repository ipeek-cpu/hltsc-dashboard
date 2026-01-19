<script lang="ts">
  import type { Issue, IssueWithDetails, BlockingRelation } from '$lib/types';
  import EpicCard from './EpicCard.svelte';
  import TaskGraph from './TaskGraph.svelte';
  import Icon from './Icon.svelte';

  let { issues = [], onissueclick }: {
    issues?: Issue[];
    onissueclick?: (issueId: string) => void;
  } = $props();

  let expandedEpics = $state<Set<string>>(new Set());

  // Tree view state
  let treeViewEpic = $state<IssueWithDetails | null>(null);
  let loadingTreeView = $state(false);

  // Filter to only epics
  let epics = $derived(issues.filter(i => i.issue_type === 'epic'));

  let epicChildren = $state<Record<string, Issue[]>>({});
  let loadingEpics = $state<Set<string>>(new Set());
  let initialLoadDone = $state(false);

  // Fetch children for all epics on initial load
  $effect(() => {
    if (initialLoadDone || epics.length === 0) return;
    initialLoadDone = true;

    const pathParts = window.location.pathname.split('/');
    const projectId = pathParts[pathParts.indexOf('projects') + 1];

    // Fetch children for all epics in parallel
    Promise.all(
      epics.map(async (epic) => {
        if (epicChildren[epic.id]) return; // Already loaded
        try {
          const response = await fetch(`/api/projects/${projectId}/issues/${epic.id}`);
          if (response.ok) {
            const epicWithDetails = await response.json();
            return { id: epic.id, children: epicWithDetails.children || [] };
          }
        } catch (err) {
          console.error(`Failed to fetch children for epic ${epic.id}:`, err);
        }
        return null;
      })
    ).then((results) => {
      const newChildren: Record<string, Issue[]> = { ...epicChildren };
      for (const result of results) {
        if (result) {
          newChildren[result.id] = result.children;
        }
      }
      epicChildren = newChildren;
    });
  });

  async function toggleEpic(epicId: string) {
    if (expandedEpics.has(epicId)) {
      expandedEpics = new Set([...expandedEpics].filter(id => id !== epicId));
    } else {
      expandedEpics = new Set([...expandedEpics, epicId]);

      // Fetch children if not already loaded
      if (!epicChildren[epicId] && !loadingEpics.has(epicId)) {
        loadingEpics = new Set([...loadingEpics, epicId]);
        try {
          const pathParts = window.location.pathname.split('/');
          const projectId = pathParts[pathParts.indexOf('projects') + 1];

          const response = await fetch(`/api/projects/${projectId}/issues/${epicId}`);
          if (response.ok) {
            const epicWithDetails = await response.json();
            epicChildren = { ...epicChildren, [epicId]: epicWithDetails.children || [] };
          }
        } catch (err) {
          console.error('Failed to fetch epic children:', err);
        } finally {
          loadingEpics = new Set([...loadingEpics].filter(id => id !== epicId));
        }
      }
    }
  }

  async function openTreeView(epicId: string) {
    loadingTreeView = true;
    try {
      const pathParts = window.location.pathname.split('/');
      const projectId = pathParts[pathParts.indexOf('projects') + 1];

      const response = await fetch(`/api/projects/${projectId}/issues/${epicId}`);
      if (response.ok) {
        const epicWithDetails: IssueWithDetails = await response.json();
        treeViewEpic = epicWithDetails;
      }
    } catch (err) {
      console.error('Failed to fetch epic for tree view:', err);
    } finally {
      loadingTreeView = false;
    }
  }

  function closeTreeView() {
    treeViewEpic = null;
  }

  function handleIssueClick(issueId: string) {
    onissueclick?.(issueId);
  }

  // Get blocking relations for current tree view epic
  let blockingRelations = $derived<BlockingRelation[]>(
    treeViewEpic?.childBlockingRelations || []
  );

  // Sync tree view children with live updates from SSE
  // When issues prop changes, update the children in the tree view
  $effect(() => {
    if (!treeViewEpic || !issues.length) return;

    // Create a map of issue ID to latest issue data
    const issueMap = new Map(issues.map(i => [i.id, i]));

    // Check if any children need updating
    let needsUpdate = false;
    const updatedChildren = treeViewEpic.children.map(child => {
      const latestChild = issueMap.get(child.id);
      if (latestChild && latestChild.status !== child.status) {
        needsUpdate = true;
        return { ...child, ...latestChild };
      }
      return child;
    });

    // Also update the epic itself if it changed
    const latestEpic = issueMap.get(treeViewEpic.id);
    const epicNeedsUpdate = latestEpic && (
      latestEpic.status !== treeViewEpic.status ||
      latestEpic.title !== treeViewEpic.title
    );

    if (needsUpdate || epicNeedsUpdate) {
      treeViewEpic = {
        ...treeViewEpic,
        ...(latestEpic ? { status: latestEpic.status, title: latestEpic.title } : {}),
        children: updatedChildren
      };
    }
  });

  // Also sync expanded epic children with live updates
  $effect(() => {
    if (!issues.length || Object.keys(epicChildren).length === 0) return;

    const issueMap = new Map(issues.map(i => [i.id, i]));
    let needsUpdate = false;
    const updatedEpicChildren: Record<string, Issue[]> = {};

    for (const [epicId, children] of Object.entries(epicChildren)) {
      const updatedChildren = children.map(child => {
        const latestChild = issueMap.get(child.id);
        if (latestChild && latestChild.status !== child.status) {
          needsUpdate = true;
          return { ...child, ...latestChild };
        }
        return child;
      });
      updatedEpicChildren[epicId] = updatedChildren;
    }

    if (needsUpdate) {
      epicChildren = updatedEpicChildren;
    }
  });
</script>

{#if treeViewEpic}
  <!-- Full viewport tree view -->
  <div class="tree-view">
    <div class="tree-header">
      <button class="back-btn" onclick={closeTreeView}>
        <Icon name="arrow-left" size={18} />
        Back to Epics
      </button>
      <div class="tree-title">
        <span class="epic-id">{treeViewEpic.id}</span>
        <h2>{treeViewEpic.title}</h2>
      </div>
      <div class="tree-stats">
        <span class="task-count">
          {treeViewEpic.children.length} tasks
        </span>
      </div>
    </div>
    <div class="tree-content">
      <TaskGraph
        issues={treeViewEpic.children}
        {blockingRelations}
        onissueclick={handleIssueClick}
      />
    </div>
  </div>
{:else}
  <!-- List view -->
  <div class="epics-view">
    <div class="epics-header">
      <h3 class="epics-title">
        <Icon name="layers" size={18} />
        Epics
      </h3>
      <span class="epics-count">{epics.length} total</span>
    </div>

    {#if loadingTreeView}
      <div class="loading-state">
        <Icon name="loader" size={24} />
        <p>Loading tree view...</p>
      </div>
    {:else if epics.length === 0}
      <div class="empty-state">
        <Icon name="inbox" size={40} />
        <p>No epics found</p>
        <span>Create an epic to organize related tasks</span>
      </div>
    {:else}
      <div class="epics-list">
        {#each epics as epic (epic.id)}
          <EpicCard
            {epic}
            children={epicChildren[epic.id] || []}
            isExpanded={expandedEpics.has(epic.id)}
            ontoggle={() => toggleEpic(epic.id)}
            onissueclick={handleIssueClick}
            ontreeview={() => openTreeView(epic.id)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .epics-view {
    padding: 20px;
    max-width: 900px;
    margin: 0 auto;
  }

  .epics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .epics-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    font-family: 'Figtree', sans-serif;
  }

  .epics-count {
    font-size: 13px;
    color: #888888;
    background: #f5f5f5;
    padding: 4px 12px;
    border-radius: 12px;
  }

  .empty-state,
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #888888;
    text-align: center;
  }

  .empty-state p,
  .loading-state p {
    margin: 16px 0 4px;
    font-size: 16px;
    font-weight: 500;
    color: #666666;
  }

  .empty-state span {
    font-size: 14px;
  }

  .loading-state :global(.icon) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .epics-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Tree view styles */
  .tree-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: calc(100vh - 200px);
  }

  .tree-header {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 16px 24px;
    background: #ffffff;
    border-bottom: 1px solid #eaeaea;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #f5f5f5;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .back-btn:hover {
    background: #eeeeee;
    color: #1a1a1a;
  }

  .tree-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tree-title .epic-id {
    font-family: monospace;
    font-size: 12px;
    color: #888888;
    background: #f5f5f5;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .tree-title h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    color: #1a1a1a;
  }

  .tree-stats {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .task-count {
    font-size: 13px;
    color: #666666;
    background: #f0f0f0;
    padding: 6px 12px;
    border-radius: 16px;
  }

  .tree-content {
    flex: 1;
    min-height: 500px;
  }
</style>
