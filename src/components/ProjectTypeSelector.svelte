<script lang="ts">
	import Icon from './Icon.svelte';
	import { PROJECT_TYPES, type ProjectType } from '$lib/scaffold-templates';

	let { selectedType = $bindable<ProjectType | null>(null) }: {
		selectedType?: ProjectType | null;
	} = $props();

	function selectType(type: ProjectType) {
		selectedType = type;
	}
</script>

<div class="type-selector">
	<h3>What would you like to create?</h3>
	<p class="subtitle">Select a project type to get started</p>

	<div class="type-grid">
		{#each PROJECT_TYPES as type}
			<button
				class="type-card"
				class:selected={selectedType === type.id}
				onclick={() => selectType(type.id)}
			>
				<div class="type-icon">
					<Icon name={type.icon} size={32} />
				</div>
				<span class="type-name">{type.name}</span>
				<span class="type-desc">{type.description}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.type-selector {
		padding: 24px;
	}

	h3 {
		margin: 0 0 8px;
		font-size: 20px;
		font-weight: 600;
		color: #1f2937;
	}

	.subtitle {
		margin: 0 0 24px;
		font-size: 14px;
		color: #6b7280;
	}

	.type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 16px;
	}

	.type-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 24px 16px;
		background: #ffffff;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
		font-family: 'Figtree', sans-serif;
	}

	.type-card:hover {
		border-color: #d1d5db;
		background: #f9fafb;
	}

	.type-card.selected {
		border-color: #2563eb;
		background: #eff6ff;
	}

	.type-card.selected .type-icon {
		color: #2563eb;
	}

	.type-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: #f3f4f6;
		border-radius: 12px;
		color: #6b7280;
		transition: all 0.15s ease;
	}

	.type-card.selected .type-icon {
		background: #dbeafe;
	}

	.type-name {
		font-size: 15px;
		font-weight: 600;
		color: #1f2937;
	}

	.type-desc {
		font-size: 12px;
		color: #6b7280;
		line-height: 1.4;
	}
</style>
