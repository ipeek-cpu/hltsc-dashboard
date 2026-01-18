<script lang="ts">
  import { browser } from '$app/environment';
  import { marked } from 'marked';
  import type { Agent, McpServerWithScope } from '$lib/types';
  import { getAgentColor } from '$lib/agents';
  import Icon from './Icon.svelte';
  import MarkdownEditor from './MarkdownEditor.svelte';

  let { agent, isOpen, onclose, onsave, projectId }: {
    agent: Agent | null;
    isOpen: boolean;
    onclose: () => void;
    onsave?: (updatedAgent: Agent) => void;
    projectId?: string;
  } = $props();

  // Edit state
  let editContent = $state('');
  let isSaving = $state(false);

  // MCP servers state
  let availableMcpServers = $state<McpServerWithScope[]>([]);
  let loadingMcpServers = $state(false);
  let showMcpHelp = $state(false);

  // Reset edit state when agent changes
  $effect(() => {
    if (agent) {
      editContent = agent.rawContent;
    }
  });

  // Load available MCP servers when sheet opens
  $effect(() => {
    if (browser && isOpen && projectId) {
      loadMcpServers();
    }
  });

  async function loadMcpServers() {
    loadingMcpServers = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/mcp?merged=true`);
      if (response.ok) {
        const data = await response.json();
        availableMcpServers = data.servers || [];
      }
    } catch (e) {
      console.error('Failed to load MCP servers:', e);
    } finally {
      loadingMcpServers = false;
    }
  }

  let agentColor = $derived(getAgentColor(agent?.frontmatter.color));

  async function saveChanges() {
    if (!agent || !projectId) return;

    isSaving = true;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/agents/${agent.filename}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editContent })
        }
      );

      if (response.ok) {
        const updatedAgent = await response.json();
        onsave?.(updatedAgent);
        onclose();
      } else {
        console.error('Failed to save agent');
      }
    } catch (err) {
      console.error('Error saving agent:', err);
    } finally {
      isSaving = false;
    }
  }

  function handleCancel() {
    if (agent) {
      editContent = agent.rawContent;
    }
    onclose();
  }

  // Animation state
  let visible = $state(false);
  let animating = $state(false);

  $effect(() => {
    if (isOpen) {
      visible = true;
      requestAnimationFrame(() => {
        animating = true;
      });
    } else if (visible) {
      animating = false;
      setTimeout(() => {
        visible = false;
      }, 300);
    }
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }
</script>

{#if visible}
  <div class="sheet-overlay" class:open={animating} onclick={handleBackdropClick} role="presentation">
    <div class="detail-sheet" class:open={animating}>
      {#if agent}
        <div class="sheet-header">
          <div class="color-bar" style="background: {agentColor}"></div>
          <div class="sheet-title-row">
            <div class="title-left">
              <span class="filename">{agent.filename}</span>
            </div>
            <button class="close-btn" onclick={handleCancel}>
              <Icon name="x" size={20} />
            </button>
          </div>
          <h2 class="sheet-title">Edit Agent</h2>
          <p class="sheet-subtitle">Editing {agent.frontmatter.name}</p>
        </div>

        <div class="sheet-content">
          <!-- MCP Servers Help Section -->
          {#if availableMcpServers.length > 0}
            <div class="mcp-section">
              <button class="mcp-toggle" onclick={() => showMcpHelp = !showMcpHelp}>
                <Icon name="cpu" size={16} />
                <span>MCP Servers ({availableMcpServers.length} available)</span>
                <Icon name={showMcpHelp ? 'chevron-up' : 'chevron-down'} size={16} />
              </button>

              {#if showMcpHelp}
                <div class="mcp-help">
                  <p class="mcp-hint">
                    Add <code>mcpServers</code> to your agent's frontmatter to control which MCP tools are available:
                  </p>
                  <pre class="mcp-example">{`mcpServers:
  enabled:
${availableMcpServers.slice(0, 3).map(s => `    - ${s.name}`).join('\n')}
  disabled:
    - server-to-disable`}</pre>

                  <div class="available-servers">
                    <span class="servers-label">Available servers:</span>
                    <div class="server-chips">
                      {#each availableMcpServers as server (server.name)}
                        <span class="server-chip" class:global={server.scope === 'global'} class:project={server.scope === 'project'}>
                          {server.name}
                        </span>
                      {/each}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="edit-section">
            <p class="edit-hint">
              Edit the full markdown file including YAML frontmatter. Changes will be saved directly to the file.
            </p>
            <MarkdownEditor
              value={editContent}
              onchange={(val) => editContent = val}
              placeholder="Enter agent definition..."
            />
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-cancel" onclick={handleCancel} disabled={isSaving}>
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
      {:else}
        <div class="loading-state">
          <span>Loading...</span>
        </div>
      {/if}
    </div>
  </div>
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
    width: 600px;
    max-width: 90vw;
    height: 100vh;
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

  .sheet-header {
    position: relative;
    padding: 20px 24px;
    border-bottom: 1px solid #eaeaea;
    flex-shrink: 0;
  }

  .color-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
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

  .filename {
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

  .sheet-title {
    margin: 0 0 4px 0;
    font-size: 20px;
    font-weight: 500;
    color: #1a1a1a;
    line-height: 1.4;
  }

  .sheet-subtitle {
    margin: 0;
    font-size: 14px;
    color: #666666;
  }

  .sheet-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .edit-section {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .edit-hint {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: #888888;
  }

  .mcp-section {
    margin-bottom: 16px;
    border: 1px solid #eaeaea;
    border-radius: 10px;
    overflow: hidden;
  }

  .mcp-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: #fafafa;
    border: none;
    cursor: pointer;
    font-family: 'Figtree', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: #1a1a1a;
    transition: background 0.15s ease;
  }

  .mcp-toggle:hover {
    background: #f5f5f5;
  }

  .mcp-toggle span {
    flex: 1;
    text-align: left;
  }

  .mcp-help {
    padding: 16px;
    background: #ffffff;
    border-top: 1px solid #eaeaea;
  }

  .mcp-hint {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: #666666;
  }

  .mcp-hint code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
  }

  .mcp-example {
    margin: 0 0 12px 0;
    padding: 12px;
    background: #1a1a1a;
    color: #e5e5e5;
    border-radius: 8px;
    font-size: 12px;
    font-family: monospace;
    overflow-x: auto;
  }

  .available-servers {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .servers-label {
    font-size: 12px;
    font-weight: 500;
    color: #666666;
  }

  .server-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .server-chip {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 12px;
    background: #f5f5f5;
    color: #666666;
  }

  .server-chip.global {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .server-chip.project {
    background: #dcfce7;
    color: #16a34a;
  }

  .sheet-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 24px;
    border-top: 1px solid #eaeaea;
    flex-shrink: 0;
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
  }

  .btn-save {
    background: #2563eb;
    border: 1px solid #2563eb;
    color: #ffffff;
  }

  .btn-save:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #888888;
  }
</style>
