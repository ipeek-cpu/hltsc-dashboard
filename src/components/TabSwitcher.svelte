<script lang="ts">
  import Icon from './Icon.svelte';

  type TabType = 'board' | 'epics' | 'agents' | 'planning' | 'execution' | 'orchestration' | 'history' | 'settings';

  let { activeTab, ontabchange, compact = false }: {
    activeTab: TabType;
    ontabchange: (tab: TabType) => void;
    compact?: boolean;
  } = $props();

  const tabs: { id: TabType; label: string; icon: string; class?: string }[] = [
    { id: 'board', label: 'Board', icon: 'columns' },
    { id: 'epics', label: 'Epics', icon: 'layers' },
    { id: 'agents', label: 'Agents', icon: 'cpu' },
    { id: 'planning', label: 'Planning', icon: 'clipboard', class: 'planning' },
    { id: 'execution', label: 'Execution', icon: 'play-circle', class: 'execution' },
    { id: 'orchestration', label: 'Orchestration', icon: 'grid' },
    { id: 'history', label: 'History', icon: 'clock' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
</script>

<div class="tab-switcher" class:compact>
  {#each tabs as tab}
    <button
      class="tab {tab.class || ''}"
      class:active={activeTab === tab.id}
      onclick={() => ontabchange(tab.id)}
      title={compact ? tab.label : undefined}
    >
      <Icon name={tab.icon} size={compact ? 18 : 16} />
      {#if !compact}
        <span class="tab-label">{tab.label}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .tab-switcher {
    display: flex;
    gap: 2px;
    background: #f5f5f5;
    padding: 3px;
    border-radius: 10px;
    width: fit-content;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    background: transparent;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    color: #888888;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .tab:hover {
    color: #1a1a1a;
    background: rgba(0, 0, 0, 0.04);
  }

  .tab.active {
    background: #ffffff;
    color: #1a1a1a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .tab.planning:hover {
    color: #7c3aed;
  }

  .tab.planning.active {
    color: #7c3aed;
  }

  .tab.execution:hover {
    color: #2563eb;
  }

  .tab.execution.active {
    color: #2563eb;
  }

  /* Compact mode - icon only */
  .tab-switcher.compact {
    gap: 1px;
    padding: 2px;
    border-radius: 8px;
  }

  .tab-switcher.compact .tab {
    padding: 6px 10px;
    border-radius: 6px;
  }
</style>
