<script lang="ts">
	import AddProjectForm from '../../../../components/AddProjectForm.svelte';
	import CreateProjectWizard from '../../../../components/CreateProjectWizard.svelte';
	import Icon from '../../../../components/Icon.svelte';

	let activeTab = $state<'existing' | 'create'>('existing');
</script>

<svelte:head>
	<title>Add Project - Beads Dashboard</title>
</svelte:head>

<div class="page">
	<header>
		<div class="header-left">
			<a href="/" class="back-link">← Back</a>
			<h1>Add Project</h1>
		</div>
	</header>

	<div class="tabs-container">
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'existing'}
				onclick={() => activeTab = 'existing'}
			>
				<Icon name="folder" size={18} />
				Add Existing
			</button>
			<button
				class="tab"
				class:active={activeTab === 'create'}
				onclick={() => activeTab = 'create'}
			>
				<Icon name="plus-circle" size={18} />
				Create New
			</button>
		</div>
	</div>

	<main>
		{#if activeTab === 'existing'}
			<AddProjectForm />
		{:else}
			<div class="wizard-container">
				<CreateProjectWizard />
			</div>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #fafafa;
		color: #1a1a1a;
		font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(h1, h2, h3, h4, h5, h6) {
		font-family: 'Hedvig Letters Serif', Georgia, serif;
		font-weight: 400;
	}

	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 32px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.back-link {
		color: #888888;
		text-decoration: none;
		font-size: 14px;
		transition: color 0.2s ease;
	}

	.back-link:hover {
		color: #1a1a1a;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 400;
		color: #1a1a1a;
	}

	.tabs-container {
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
		padding: 0 32px;
	}

	.tabs {
		display: flex;
		gap: 0;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px 24px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		font-size: 14px;
		font-weight: 500;
		font-family: 'Figtree', sans-serif;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: #374151;
		background: #f9fafb;
	}

	.tab.active {
		color: #2563eb;
		border-bottom-color: #2563eb;
	}

	main {
		flex: 1;
		background: #fafafa;
		display: flex;
		flex-direction: column;
	}

	/* Style AddProjectForm container */
	main > :global(:first-child:not(.wizard-container)) {
		padding: 48px 32px;
	}

	.wizard-container {
		flex: 1;
		background: #ffffff;
		margin: 24px;
		border-radius: 16px;
		border: 1px solid #e5e7eb;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
</style>
