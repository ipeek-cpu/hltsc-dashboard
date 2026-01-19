<script lang="ts">
	import Icon from './Icon.svelte';
	import CustomActionEditor from './CustomActionEditor.svelte';

	interface ProfileInfo {
		id: string;
		name: string;
		description: string;
		icon: string;
	}

	interface DetectedProfile {
		profileId: string;
		profileName: string;
		confidence: number;
		matchedPatterns: string[];
	}

	interface Detection {
		detectedProfiles: DetectedProfile[];
		isMonorepo: boolean;
		primaryProfile: string;
	}

	interface CustomAction {
		id: string;
		label: string;
		icon: string;
		command: string;
		description?: string;
		requiresConfirmation?: boolean;
	}

	let {
		projectId,
		selectedProfiles = [],
		availableProfiles = [],
		detection = null,
		isAutoDetected = true,
		customActions = [],
		onchange,
		onCustomActionsChange
	}: {
		projectId: string;
		selectedProfiles: ProfileInfo[];
		availableProfiles?: ProfileInfo[];
		detection?: Detection | null;
		isAutoDetected?: boolean;
		customActions?: CustomAction[];
		onchange?: (profileIds: string[], useAutoDetect: boolean) => void;
		onCustomActionsChange?: (actions: CustomAction[]) => void;
	} = $props();

	let isOpen = $state(false);
	let isLoading = $state(false);

	// Track selected profile IDs for multi-select
	let selectedIds = $derived(new Set(selectedProfiles.map((p) => p.id)));

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function closeDropdown() {
		isOpen = false;
	}

	function toggleProfile(profileId: string) {
		const newIds = new Set(selectedIds);
		if (newIds.has(profileId)) {
			newIds.delete(profileId);
		} else {
			newIds.add(profileId);
		}

		// Must have at least one profile selected
		if (newIds.size === 0) {
			newIds.add('generic');
		}

		saveSelection(Array.from(newIds));
	}

	async function saveSelection(profileIds: string[]) {
		isLoading = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/profile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileIds })
			});

			if (response.ok) {
				onchange?.(profileIds, false);
			}
		} catch (error) {
			console.error('Failed to update profile:', error);
		} finally {
			isLoading = false;
		}
	}

	async function revertToAutoDetect() {
		isLoading = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/profile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ useAutoDetect: true })
			});

			if (response.ok) {
				onchange?.([], true);
			}
		} catch (error) {
			console.error('Failed to revert to auto-detect:', error);
		} finally {
			isLoading = false;
			closeDropdown();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeDropdown();
		}
	}

	function getConfidenceLabel(confidence: number): string {
		if (confidence >= 0.7) return 'High';
		if (confidence >= 0.4) return 'Medium';
		return 'Low';
	}

	function getDisplayLabel(): string {
		if (selectedProfiles.length === 0) return 'Select Profile';
		if (selectedProfiles.length === 1) return selectedProfiles[0].name;
		return `${selectedProfiles.length} Profiles`;
	}

	function getTooltip(): string {
		if (selectedProfiles.length === 0) return 'Select a project profile';
		const names = selectedProfiles.map((p) => p.name).join(', ');
		const prefix = isAutoDetected ? 'Auto-detected: ' : 'Selected: ';
		return prefix + names;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="profile-selector" class:open={isOpen}>
	<button
		class="selector-button"
		onclick={toggleDropdown}
		disabled={isLoading}
		title={getTooltip()}
	>
		{#if selectedProfiles.length > 0}
			<div class="profile-icons">
				{#each selectedProfiles.slice(0, 3) as profile}
					<Icon name={profile.icon} size={14} />
				{/each}
			</div>
			<span class="profile-name">{getDisplayLabel()}</span>
			{#if isAutoDetected}
				<span class="auto-badge" title="Profiles auto-detected from project files">Auto</span>
			{:else}
				<span class="manual-badge" title="Manually selected profiles">Manual</span>
			{/if}
		{:else}
			<Icon name="folder" size={16} />
			<span class="profile-name">Select Profile</span>
		{/if}
		<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
	</button>

	{#if isOpen}
		<div class="dropdown" role="listbox">
			{#if detection?.isMonorepo}
				<div class="monorepo-hint">
					<Icon name="layers" size={14} />
					<span>Monorepo detected - select multiple profiles</span>
				</div>
			{/if}

			{#if detection && detection.detectedProfiles.length > 0}
				<div class="section-header">
					<span>Detected in Project</span>
				</div>
				{#each detection.detectedProfiles as detected}
					<button
						class="profile-option"
						class:selected={selectedIds.has(detected.profileId)}
						onclick={() => toggleProfile(detected.profileId)}
						role="option"
						aria-selected={selectedIds.has(detected.profileId)}
						title={`Matched: ${detected.matchedPatterns.slice(0, 3).join(', ')}${detected.matchedPatterns.length > 3 ? '...' : ''}`}
					>
						<div class="checkbox" class:checked={selectedIds.has(detected.profileId)}>
							{#if selectedIds.has(detected.profileId)}
								<Icon name="check" size={12} />
							{/if}
						</div>
						<Icon name={availableProfiles.find((p) => p.id === detected.profileId)?.icon || 'folder'} size={18} />
						<div class="option-content">
							<span class="option-name">{detected.profileName}</span>
							<span class="option-confidence">{getConfidenceLabel(detected.confidence)} confidence</span>
						</div>
					</button>
				{/each}
			{/if}

			<div class="section-header">
				<span>All Profiles</span>
			</div>
			{#each availableProfiles.filter((p) => !detection?.detectedProfiles.some((d) => d.profileId === p.id)) as profile}
				<button
					class="profile-option"
					class:selected={selectedIds.has(profile.id)}
					onclick={() => toggleProfile(profile.id)}
					role="option"
					aria-selected={selectedIds.has(profile.id)}
				>
					<div class="checkbox" class:checked={selectedIds.has(profile.id)}>
						{#if selectedIds.has(profile.id)}
							<Icon name="check" size={12} />
						{/if}
					</div>
					<Icon name={profile.icon} size={18} />
					<div class="option-content">
						<span class="option-name">{profile.name}</span>
						<span class="option-desc">{profile.description}</span>
					</div>
				</button>
			{/each}

			<CustomActionEditor
				{projectId}
				{customActions}
				onchange={onCustomActionsChange}
			/>

			{#if !isAutoDetected}
				<div class="dropdown-footer">
					<button class="revert-btn" onclick={revertToAutoDetect} disabled={isLoading}>
						<Icon name="refresh-cw" size={12} />
						Revert to Auto-Detect
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={closeDropdown}></div>
{/if}

<style>
	.profile-selector {
		position: relative;
		z-index: 100;
	}

	.selector-button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.selector-button:hover {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.selector-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.profile-icons {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.profile-name {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.auto-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 2px 5px;
		background: #dbeafe;
		color: #1d4ed8;
		border-radius: 3px;
	}

	.manual-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 2px 5px;
		background: #fef3c7;
		color: #92400e;
		border-radius: 3px;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 300px;
		max-height: 400px;
		overflow-y: auto;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
		z-index: 101;
	}

	.monorepo-hint {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: #fef3c7;
		border-bottom: 1px solid #fcd34d;
		font-size: 12px;
		color: #92400e;
	}

	.section-header {
		padding: 8px 14px 4px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #9ca3af;
		background: #f9fafb;
		border-top: 1px solid #f3f4f6;
	}

	.section-header:first-child {
		border-top: none;
	}

	.profile-option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.1s ease;
		text-align: left;
		font-family: 'Figtree', sans-serif;
	}

	.profile-option:hover {
		background: #f9fafb;
	}

	.profile-option.selected {
		background: #eff6ff;
	}

	.checkbox {
		width: 16px;
		height: 16px;
		border: 2px solid #d1d5db;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.checkbox.checked {
		background: #3b82f6;
		border-color: #3b82f6;
		color: white;
	}

	.option-content {
		flex: 1;
		min-width: 0;
	}

	.option-name {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #111827;
	}

	.option-desc,
	.option-confidence {
		display: block;
		font-size: 11px;
		color: #6b7280;
		margin-top: 1px;
	}

	.option-confidence {
		color: #059669;
	}

	.dropdown-footer {
		padding: 10px 14px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.revert-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 8px 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
		font-family: 'Figtree', sans-serif;
	}

	.revert-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #374151;
	}

	.revert-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}
</style>
