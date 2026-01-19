<script lang="ts">
  import Icon from './Icon.svelte';

  type TabType = 'board' | 'epics' | 'agents' | 'planning' | 'execution' | 'orchestration' | 'history' | 'settings';

  let { activeTab, ontabchange }: {
    activeTab: TabType;
    ontabchange: (tab: TabType) => void;
  } = $props();
</script>

<div class="tab-switcher">
  <button
    class="tab"
    class:active={activeTab === 'board'}
    onclick={() => ontabchange('board')}
  >
    <Icon name="columns" size={16} />
    Board
  </button>
  <button
    class="tab"
    class:active={activeTab === 'epics'}
    onclick={() => ontabchange('epics')}
  >
    <Icon name="layers" size={16} />
    Epics
  </button>
  <button
    class="tab"
    class:active={activeTab === 'agents'}
    onclick={() => ontabchange('agents')}
  >
    <Icon name="cpu" size={16} />
    Agents
  </button>
  <button
    class="tab planning"
    class:active={activeTab === 'planning'}
    onclick={() => ontabchange('planning')}
  >
    <Icon name="clipboard" size={16} />
    Planning
  </button>
  <button
    class="tab execution"
    class:active={activeTab === 'execution'}
    onclick={() => ontabchange('execution')}
  >
    <Icon name="play-circle" size={16} />
    Execution
  </button>
  <button
    class="tab"
    class:active={activeTab === 'orchestration'}
    onclick={() => ontabchange('orchestration')}
  >
    <Icon name="grid" size={16} />
    Orchestration
  </button>
  <button
    class="tab"
    class:active={activeTab === 'history'}
    onclick={() => ontabchange('history')}
  >
    <Icon name="clock" size={16} />
    History
  </button>
  <button
    class="tab"
    class:active={activeTab === 'settings'}
    onclick={() => ontabchange('settings')}
  >
    <Icon name="settings" size={16} />
    Settings
  </button>
</div>

<style>
  .tab-switcher {
    display: flex;
    gap: 4px;
    background: #f5f5f5;
    padding: 4px;
    border-radius: 12px;
    width: fit-content;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #888888;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Figtree', sans-serif;
  }

  .tab:hover {
    color: #1a1a1a;
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
</style>
