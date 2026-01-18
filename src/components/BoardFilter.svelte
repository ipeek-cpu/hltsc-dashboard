<script lang="ts">
  import type { Agent, BoardFilter } from '$lib/types';
  import { getAgentColor } from '$lib/agents';
  import Icon from './Icon.svelte';

  let { agents = [], value, onchange }: {
    agents?: Agent[];
    value: BoardFilter;
    onchange: (filter: BoardFilter) => void;
  } = $props();

  let isOpen = $state(false);

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function selectAll() {
    onchange({ type: 'all' });
    isOpen = false;
  }

  function selectAgent(name: string) {
    onchange({ type: 'agent', name });
    isOpen = false;
  }

  // Get display label
  let displayLabel = $derived(
    value.type === 'all' ? 'All Tasks' : value.name
  );

  // Get display color
  let displayColor = $derived(() => {
    if (value.type === 'all') return null;
    const agent = agents.find(a => a.frontmatter.name === value.name);
    return agent ? getAgentColor(agent.frontmatter.color) : null;
  });

  // Close dropdown when clicking outside
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.board-filter')) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="board-filter">
  <button class="filter-button" onclick={toggleDropdown}>
    {#if displayColor()}
      <span class="color-dot" style="background: {displayColor()}"></span>
    {:else}
      <Icon name="filter" size={14} />
    {/if}
    <span class="filter-label">{displayLabel}</span>
    <Icon name="chevron-down" size={14} />
  </button>

  {#if isOpen}
    <div class="dropdown">
      <button
        class="dropdown-item"
        class:active={value.type === 'all'}
        onclick={selectAll}
      >
        <Icon name="list" size={14} />
        <span>All Tasks</span>
        {#if value.type === 'all'}
          <Icon name="check" size={14} />
        {/if}
      </button>

      {#if agents.length > 0}
        <div class="dropdown-divider"></div>
        <div class="dropdown-label">Filter by Agent</div>

        {#each agents as agent (agent.filename)}
          {@const agentColor = getAgentColor(agent.frontmatter.color)}
          {@const isSelected = value.type === 'agent' && value.name === agent.frontmatter.name}
          <button
            class="dropdown-item"
            class:active={isSelected}
            onclick={() => selectAgent(agent.frontmatter.name)}
          >
            <span class="color-dot" style="background: {agentColor}"></span>
            <span>{agent.frontmatter.name}</span>
            {#if isSelected}
              <Icon name="check" size={14} />
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .board-filter {
    position: relative;
  }

  .filter-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: #4b5563;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .filter-button:hover {
    background: #f5f5f5;
    border-color: #d0d0d0;
  }

  .filter-label {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 200px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    z-index: 100;
    padding: 6px;
    max-height: 300px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-size: 13px;
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
    background: #f0f7ff;
    color: #2563eb;
  }

  .dropdown-item span:first-of-type:not(.color-dot) {
    flex: 1;
  }

  .dropdown-divider {
    height: 1px;
    background: #f0f0f0;
    margin: 6px 0;
  }

  .dropdown-label {
    padding: 6px 10px 4px;
    font-size: 11px;
    font-weight: 600;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
