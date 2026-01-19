<script lang="ts">
  import Icon from './Icon.svelte';
  import type { BeadStatus } from '$lib/bead-lifecycle';
  import {
    getValidTargetStatuses,
    transitionRequiresModal,
    getTransitionDescription
  } from '$lib/bead-lifecycle';

  let {
    status,
    onchange,
    disabled = false
  }: {
    status: BeadStatus;
    onchange: (newStatus: BeadStatus, requiresModal: boolean) => void;
    disabled?: boolean;
  } = $props();

  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  // Status display configuration
  const statusConfig: Record<BeadStatus, { label: string; color: string; bg: string; icon: string }> = {
    open: { label: 'Open', color: '#3b82f6', bg: '#eff6ff', icon: 'circle' },
    ready: { label: 'Ready', color: '#8b5cf6', bg: '#f5f3ff', icon: 'check-circle' },
    in_progress: { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb', icon: 'play-circle' },
    in_review: { label: 'In Review', color: '#06b6d4', bg: '#ecfeff', icon: 'eye' },
    blocked: { label: 'Blocked', color: '#ef4444', bg: '#fef2f2', icon: 'x-octagon' },
    closed: { label: 'Closed', color: '#22c55e', bg: '#f0fdf4', icon: 'check' },
    deferred: { label: 'Deferred', color: '#6b7280', bg: '#f3f4f6', icon: 'clock' }
  };

  // Get valid targets for current status
  let validTargets = $derived(getValidTargetStatuses(status));

  function handleToggle() {
    if (!disabled && validTargets.length > 0) {
      isOpen = !isOpen;
    }
  }

  function handleSelect(newStatus: BeadStatus) {
    const requiresModal = transitionRequiresModal(status, newStatus);
    isOpen = false;
    onchange(newStatus, requiresModal);
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeydown);
      };
    }
  });

  const currentConfig = $derived(statusConfig[status]);
</script>

<div class="status-dropdown" bind:this={dropdownRef}>
  <button
    class="status-trigger"
    class:disabled
    class:has-options={validTargets.length > 0}
    style="color: {currentConfig?.color}; background: {currentConfig?.bg}"
    onclick={handleToggle}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    {disabled}
  >
    <Icon name={currentConfig?.icon || 'circle'} size={14} />
    <span>{currentConfig?.label || status}</span>
    {#if validTargets.length > 0 && !disabled}
      <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
    {/if}
  </button>

  {#if isOpen}
    <div class="dropdown-menu" role="listbox">
      <div class="dropdown-header">Change status to:</div>
      {#each validTargets as targetStatus}
        {@const config = statusConfig[targetStatus]}
        {@const requiresModal = transitionRequiresModal(status, targetStatus)}
        {@const description = getTransitionDescription(status, targetStatus)}
        <button
          class="dropdown-option"
          role="option"
          onclick={() => handleSelect(targetStatus)}
          title={description}
        >
          <span class="option-icon" style="color: {config?.color}">
            <Icon name={config?.icon || 'circle'} size={16} />
          </span>
          <span class="option-content">
            <span class="option-label">{config?.label}</span>
            <span class="option-description">{description}</span>
          </span>
          {#if requiresModal}
            <span class="modal-indicator" title="Opens a dialog">
              <Icon name="edit-3" size={12} />
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .status-dropdown {
    position: relative;
    display: inline-block;
  }

  .status-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'Figtree', sans-serif;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .status-trigger:hover:not(.disabled) {
    filter: brightness(0.95);
  }

  .status-trigger.has-options:not(.disabled) {
    border-color: currentColor;
    border-style: dashed;
  }

  .status-trigger.disabled {
    cursor: default;
    opacity: 0.8;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 280px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.05);
    z-index: 100;
    overflow: hidden;
    animation: dropdownFadeIn 0.15s ease;
  }

  @keyframes dropdownFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-header {
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .dropdown-option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .dropdown-option:hover {
    background: #f3f4f6;
  }

  .dropdown-option:not(:last-child) {
    border-bottom: 1px solid #f3f4f6;
  }

  .option-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: currentColor;
    background: color-mix(in srgb, currentColor 10%, transparent);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .option-content {
    flex: 1;
    min-width: 0;
  }

  .option-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
    font-family: 'Figtree', sans-serif;
  }

  .option-description {
    display: block;
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
    line-height: 1.4;
  }

  .modal-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    flex-shrink: 0;
    margin-top: 4px;
  }
</style>
