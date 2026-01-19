<script lang="ts">
	import Icon from './Icon.svelte';

	let { isOpen = false, onclose }: { isOpen: boolean; onclose?: () => void } = $props();

	let searchQuery = $state('');
	let activeSection = $state<string | null>(null);

	interface FAQItem {
		question: string;
		answer: string;
	}

	interface HelpSection {
		id: string;
		title: string;
		icon: string;
		items: FAQItem[];
	}

	const helpSections: HelpSection[] = [
		{
			id: 'getting-started',
			title: 'Getting Started',
			icon: 'play-circle',
			items: [
				{
					question: 'What is Beads Dashboard?',
					answer:
						'Beads Dashboard is a visual interface for managing beads - a distributed, git-backed issue tracker designed for AI agents. It provides a Kanban board view of your issues with real-time updates.'
				},
				{
					question: 'How do I add a project?',
					answer:
						'Click the "+" button on the home page or use the "Add Project" option in the sidebar. Browse to a folder that contains a .beads directory, or initialize beads in a new folder.'
				},
				{
					question: 'What are profiles?',
					answer:
						'Profiles customize the dashboard for different project types (iOS, Web, Infrastructure). They provide context-aware quick actions, suggested file patterns for context packs, and relevant agent suggestions.'
				}
			]
		},
		{
			id: 'beads',
			title: 'Working with Beads',
			icon: 'layers',
			items: [
				{
					question: 'What is a bead?',
					answer:
						'A bead is an issue or task in the beads system. Beads can have various types (task, bug, feature, epic), priorities (P0-P4), and statuses (open, in_progress, blocked, closed).'
				},
				{
					question: 'How do I create a new bead?',
					answer:
						'Use the "bd create" command in the terminal, or right-click on the Kanban board and select "New Bead". You can also create beads from the Planning view.'
				},
				{
					question: 'What do the priority levels mean?',
					answer:
						'P0 = Critical (drop everything), P1 = High (do next), P2 = Medium (planned work), P3 = Low (nice to have), P4 = Backlog (someday/maybe).'
				},
				{
					question: 'How do I move a bead between columns?',
					answer:
						'Drag and drop the bead card to a different column. Some transitions may require additional information (like a claim modal for in_progress or close reason for closed).'
				}
			]
		},
		{
			id: 'claude',
			title: 'Claude Integration',
			icon: 'message-circle',
			items: [
				{
					question: 'How do I start a chat with Claude?',
					answer:
						'Click the chat icon in the toolbar or press Cmd+J to open the chat sidebar. You can select an agent to customize Claude\'s behavior.'
				},
				{
					question: 'What are agents?',
					answer:
						'Agents are pre-configured Claude personas with specific system prompts. They help Claude focus on particular tasks like planning, reviewing, or implementing code.'
				},
				{
					question: 'How do I create a custom agent?',
					answer:
						'Go to the Agents tab in your project, click "Create Agent", and define the name, description, and system prompt for your custom agent.'
				}
			]
		},
		{
			id: 'quick-actions',
			title: 'Quick Actions',
			icon: 'zap',
			items: [
				{
					question: 'What are quick actions?',
					answer:
						'Quick actions are one-click shortcuts to common tasks like running tests, building the project, or starting the dev server. They appear in the toolbar based on your project profile.'
				},
				{
					question: 'How do I add custom quick actions?',
					answer:
						'Click the profile selector in the toolbar, scroll to "Custom Actions", and click the + button. Enter a label, command, and optionally an icon and description.'
				},
				{
					question: 'Can I require confirmation for destructive actions?',
					answer:
						'Yes! When creating a custom action, check the "Require confirmation" option. This will show a dialog before running commands like git clean or rm -rf.'
				}
			]
		},
		{
			id: 'keyboard',
			title: 'Keyboard Shortcuts',
			icon: 'command',
			items: [
				{
					question: 'What keyboard shortcuts are available?',
					answer:
						'Cmd+J: Open chat | Cmd+K: Quick search | Cmd+?: Help | Escape: Close panels | 1-5: Switch tabs'
				},
				{
					question: 'How do I navigate quickly?',
					answer:
						'Use Cmd+K to open quick search, then type a bead ID, title, or keyword to jump directly to it.'
				}
			]
		}
	];

	let filteredSections = $derived.by(() => {
		if (!searchQuery.trim()) return helpSections;

		const query = searchQuery.toLowerCase();
		return helpSections
			.map((section) => ({
				...section,
				items: section.items.filter(
					(item) =>
						item.question.toLowerCase().includes(query) ||
						item.answer.toLowerCase().includes(query)
				)
			}))
			.filter((section) => section.items.length > 0);
	});

	function toggleSection(sectionId: string) {
		activeSection = activeSection === sectionId ? null : sectionId;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			onclose?.();
		}
	}

	function handleBackdropClick() {
		onclose?.();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={handleBackdropClick}></div>
	<div class="help-panel" class:open={isOpen}>
		<div class="panel-header">
			<div class="header-title">
				<Icon name="help-circle" size={20} />
				<h2>Help & FAQ</h2>
			</div>
			<button class="close-btn" onclick={() => onclose?.()} title="Close (Esc)">
				<Icon name="x" size={20} />
			</button>
		</div>

		<div class="search-container">
			<Icon name="search" size={16} />
			<input
				type="text"
				placeholder="Search help topics..."
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button class="clear-search" onclick={() => (searchQuery = '')}>
					<Icon name="x" size={14} />
				</button>
			{/if}
		</div>

		<div class="panel-content">
			{#if filteredSections.length === 0}
				<div class="no-results">
					<Icon name="search" size={24} />
					<p>No results found for "{searchQuery}"</p>
				</div>
			{:else}
				{#each filteredSections as section}
					<div class="help-section">
						<button
							class="section-header"
							class:expanded={activeSection === section.id}
							onclick={() => toggleSection(section.id)}
						>
							<div class="section-title">
								<Icon name={section.icon} size={18} />
								<span>{section.title}</span>
							</div>
							<span class="item-count">{section.items.length}</span>
							<Icon
								name={activeSection === section.id ? 'chevron-up' : 'chevron-down'}
								size={16}
							/>
						</button>

						{#if activeSection === section.id}
							<div class="section-content">
								{#each section.items as item}
									<div class="faq-item">
										<div class="faq-question">
											<Icon name="help-circle" size={14} />
											{item.question}
										</div>
										<div class="faq-answer">{item.answer}</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<div class="panel-footer">
			<a href="https://github.com/steveyegge/beads" target="_blank" rel="noopener noreferrer">
				<Icon name="external-link" size={14} />
				Beads Documentation
			</a>
			<a href="https://docs.anthropic.com/claude-code" target="_blank" rel="noopener noreferrer">
				<Icon name="external-link" size={14} />
				Claude Code Docs
			</a>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 999;
	}

	.help-panel {
		position: fixed;
		top: 0;
		right: 0;
		width: 420px;
		max-width: 100vw;
		height: 100vh;
		background: #ffffff;
		box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		transform: translateX(100%);
		transition: transform 0.2s ease;
	}

	.help-panel.open {
		transform: translateX(0);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.header-title h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #111827;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: transparent;
		border-radius: 8px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.search-container {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 16px 20px;
		padding: 10px 14px;
		background: #f3f4f6;
		border-radius: 10px;
		color: #9ca3af;
	}

	.search-container input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 14px;
		color: #111827;
		outline: none;
	}

	.search-container input::placeholder {
		color: #9ca3af;
	}

	.clear-search {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: none;
		background: #d1d5db;
		border-radius: 50%;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.clear-search:hover {
		background: #9ca3af;
		color: #ffffff;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 0 20px 20px;
	}

	.no-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		color: #9ca3af;
		text-align: center;
	}

	.no-results p {
		margin: 12px 0 0;
		font-size: 14px;
	}

	.help-section {
		margin-bottom: 8px;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 14px;
		border: none;
		background: #f9fafb;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s;
		font-family: 'Figtree', sans-serif;
	}

	.section-header:hover {
		background: #f3f4f6;
	}

	.section-header.expanded {
		background: #e5e7eb;
		border-radius: 10px 10px 0 0;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		color: #111827;
		text-align: left;
	}

	.item-count {
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
		background: #ffffff;
		padding: 2px 8px;
		border-radius: 10px;
	}

	.section-content {
		background: #f9fafb;
		border-radius: 0 0 10px 10px;
		padding: 12px;
	}

	.faq-item {
		padding: 12px;
		background: #ffffff;
		border-radius: 8px;
		margin-bottom: 8px;
	}

	.faq-item:last-child {
		margin-bottom: 0;
	}

	.faq-question {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #111827;
		margin-bottom: 8px;
	}

	.faq-answer {
		font-size: 13px;
		color: #6b7280;
		line-height: 1.5;
		padding-left: 22px;
	}

	.panel-footer {
		display: flex;
		gap: 16px;
		padding: 16px 20px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.panel-footer a {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #3b82f6;
		text-decoration: none;
		transition: color 0.15s;
	}

	.panel-footer a:hover {
		color: #2563eb;
	}
</style>
