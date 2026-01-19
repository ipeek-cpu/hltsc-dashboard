<script lang="ts">
  import type { Agent, BoardFilter, Issue } from '$lib/types';
  import { getAgentColor } from '$lib/agents';
  import Icon from './Icon.svelte';

  let { issues = [], agents = [], filter, onchange }: {
    issues: Issue[];
    agents: Agent[];
    filter: BoardFilter;
    onchange: (filter: BoardFilter) => void;
  } = $props();

  let searchValue = $state(filter.search || '');
  let agentDropdownOpen = $state(false);
  let epicDropdownOpen = $state(false);

  // Derive epics from issues (type = 'epic')
  let epics = $derived(issues.filter(i => i.issue_type === 'epic'));

  // Get child issues for each epic (for counting)
  function getEpicChildCount(epicId: string): number {
    return issues.filter(i => {
      // This is simplified - in reality we'd check dependencies table
      // For now, we assume issues with the epic in their parent_id or similar
      return i.id !== epicId && i.issue_type !== 'epic';
    }).length;
  }

  // Handle search with debounce
  let searchTimeout: ReturnType<typeof setTimeout>;
  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchValue = value;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onchange({ ...filter, search: value || undefined });
    }, 200);
  }

  function clearSearch() {
    searchValue = '';
    onchange({ ...filter, search: undefined });
  }

  function selectAgent(agentName: string | undefined) {
    onchange({ ...filter, agentName });
    agentDropdownOpen = false;
  }

  function selectEpic(epicId: string | undefined) {
    onchange({ ...filter, epicId });
    epicDropdownOpen = false;
  }

  function clearAllFilters() {
    searchValue = '';
    onchange({});
  }

  // Close dropdowns when clicking outside
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.agent-filter')) {
      agentDropdownOpen = false;
    }
    if (!target.closest('.epic-filter')) {
      epicDropdownOpen = false;
    }
  }

  $effect(() => {
    if (agentDropdownOpen || epicDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });

  // Check if any filters are active
  let hasActiveFilters = $derived(
    !!(filter.search || filter.agentName || filter.epicId)
  );

  // Get selected agent
  let selectedAgent = $derived(
    filter.agentName ? agents.find(a => a.frontmatter.name === filter.agentName) : null
  );

  // Get selected epic
  let selectedEpic = $derived(
    filter.epicId ? epics.find(e => e.id === filter.epicId) : null
  );
</script>

<div class="filter-toolbar">
  <!-- Search -->
  <div class="search-box">
    <Icon name="search" size={14} />
    <input
      type="text"
      placeholder="Search issues..."
      value={searchValue}
      oninput={handleSearchInput}
    />
    {#if searchValue}
      <button class="clear-btn" onclick={clearSearch} title="Clear search">
        <Icon name="x" size={12} />
      </button>
    {/if}
  </div>

  <!-- Epic Filter -->
  {#if epics.length > 0}
    <div class="epic-filter">
      <button
        class="filter-btn"
        class:active={!!filter.epicId}
        onclick={() => epicDropdownOpen = !epicDropdownOpen}
      >
        <Icon name="layers" size={14} />
        <span>{selectedEpic ? selectedEpic.title : 'Epic'}</span>
        <Icon name="chevron-down" size={12} />
      </button>

      {#if epicDropdownOpen}
        <div class="dropdown">
          <button
            class="dropdown-item"
            class:active={!filter.epicId}
            onclick={() => selectEpic(undefined)}
          >
            <Icon name="list" size={14} />
            <span>All Epics</span>
            {#if !filter.epicId}
              <Icon name="check" size={14} />
            {/if}
          </button>

          <div class="dropdown-divider"></div>

          {#each epics as epic (epic.id)}
            <button
              class="dropdown-item"
              class:active={filter.epicId === epic.id}
              onclick={() => selectEpic(epic.id)}
            >
              <span class="epic-color"></span>
              <span class="epic-name">{epic.title}</span>
              {#if filter.epicId === epic.id}
                <Icon name="check" size={14} />
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Agent Filter -->
  {#if agents.length > 0}
    <div class="agent-filter">
      <button
        class="filter-btn"
        class:active={!!filter.agentName}
        onclick={() => agentDropdownOpen = !agentDropdownOpen}
      >
        {#if selectedAgent}
          <span class="color-dot" style="background: {getAgentColor(selectedAgent.frontmatter.color)}"></span>
        {:else}
          <Icon name="cpu" size={14} />
        {/if}
        <span>{selectedAgent ? selectedAgent.frontmatter.name : 'Agent'}</span>
        <Icon name="chevron-down" size={12} />
      </button>

      {#if agentDropdownOpen}
        <div class="dropdown">
          <button
            class="dropdown-item"
            class:active={!filter.agentName}
            onclick={() => selectAgent(undefined)}
          >
            <Icon name="list" size={14} />
            <span>All Agents</span>
            {#if !filter.agentName}
              <Icon name="check" size={14} />
            {/if}
          </button>

          <div class="dropdown-divider"></div>

          {#each agents as agent (agent.filename)}
            {@const agentColor = getAgentColor(agent.frontmatter.color)}
            <button
              class="dropdown-item"
              class:active={filter.agentName === agent.frontmatter.name}
              onclick={() => selectAgent(agent.frontmatter.name)}
            >
              <span class="color-dot" style="background: {agentColor}"></span>
              <span>{agent.frontmatter.name}</span>
              {#if filter.agentName === agent.frontmatter.name}
                <Icon name="check" size={14} />
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Clear All -->
  {#if hasActiveFilters}
    <button class="clear-all-btn" onclick={clearAllFilters} title="Clear all filters">
      <Icon name="x" size={12} />
      Clear
    </button>
  {/if}
</div>

<style>
  .filter-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    color: #9ca3af;
    min-width: 180px;
  }

  .search-box:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .search-box input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 12px;
    font-family: 'Figtree', sans-serif;
    color: #374151;
    background: transparent;
    min-width: 100px;
  }

  .search-box input::placeholder {
    color: #9ca3af;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: #e5e7eb;
    border: none;
    border-radius: 50%;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-btn:hover {
    background: #d1d5db;
    color: #374151;
  }

  .epic-filter,
  .agent-filter {
    position: relative;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
    white-space: nowrap;
    max-width: 150px;
  }

  .filter-btn span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .filter-btn:hover {
    background: #f5f5f5;
    border-color: #d1d5db;
    color: #374151;
  }

  .filter-btn.active {
    background: #eff6ff;
    border-color: #93c5fd;
    color: #2563eb;
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .epic-color {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: #8b5cf6;
    flex-shrink: 0;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 180px;
    max-width: 250px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    z-index: 100;
    padding: 4px;
    max-height: 280px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    color: #4b5563;
    cursor: pointer;
    text-align: left;
    font-family: 'Figtree', sans-serif;
    transition: background 0.15s ease;
  }

  .dropdown-item:hover {
    background: #f5f5f5;
  }

  .dropdown-item.active {
    background: #eff6ff;
    color: #2563eb;
  }

  .dropdown-item span:not(.color-dot):not(.epic-color) {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-divider {
    height: 1px;
    background: #f0f0f0;
    margin: 4px 0;
  }

  .clear-all-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    color: #dc2626;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .clear-all-btn:hover {
    background: #fee2e2;
    border-color: #fca5a5;
  }
</style>
