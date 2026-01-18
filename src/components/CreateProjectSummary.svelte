<script lang="ts">
	import Icon from './Icon.svelte';
	import type { ProjectType } from '$lib/scaffold-templates';

	let {
		projectName,
		projectPath,
		projectType,
		framework,
		createdProject,
		options = {},
		onViewProject,
		onCreateAnother
	}: {
		projectName: string;
		projectPath: string;
		projectType: ProjectType;
		framework: string;
		createdProject?: { id: string; name: string; path: string };
		options?: Record<string, string | boolean>;
		onViewProject: () => void;
		onCreateAnother: () => void;
	} = $props();

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}

	function openInTerminal() {
		// For now, just copy the cd command
		copyToClipboard(`cd "${projectPath}"`);
	}

	// Get enabled features from options
	let enabledFeatures = $derived(
		Object.entries(options)
			.filter(([_, value]) => value === true)
			.map(([key]) => key)
	);

	// Get display name for project type
	let projectTypeName = $derived(() => {
		const names: Record<ProjectType, string> = {
			website: 'Website',
			webapp: 'Web App',
			mobile: 'Mobile App',
			shopify: 'Shopify Theme',
			api: 'API Backend'
		};
		return names[projectType] || projectType;
	});
</script>

<div class="summary">
	<div class="success-header">
		<div class="success-icon">
			<Icon name="check" size={32} strokeWidth={2.5} />
		</div>
		<h2>Project Created!</h2>
		<p class="subtitle">Your {projectTypeName()} is ready to go</p>
	</div>

	<div class="project-info">
		<div class="info-row">
			<span class="info-label">Project Name</span>
			<span class="info-value">{projectName}</span>
		</div>
		<div class="info-row">
			<span class="info-label">Location</span>
			<code class="info-path">{projectPath}</code>
		</div>
		<div class="info-row">
			<span class="info-label">Framework</span>
			<span class="info-value">{framework}</span>
		</div>
		{#if enabledFeatures.length > 0}
			<div class="info-row">
				<span class="info-label">Features</span>
				<div class="feature-tags">
					{#each enabledFeatures as feature}
						<span class="feature-tag">{feature}</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="next-steps">
		<h3>Next Steps</h3>
		<div class="steps-list">
			<div class="next-step">
				<div class="step-number">1</div>
				<div class="step-content">
					<span class="step-title">Open in Terminal</span>
					<div class="command-box">
						<code>cd "{projectPath}"</code>
						<button class="copy-btn" onclick={openInTerminal} title="Copy command">
							<Icon name="copy" size={14} />
						</button>
					</div>
				</div>
			</div>

			<div class="next-step">
				<div class="step-number">2</div>
				<div class="step-content">
					<span class="step-title">Start Development</span>
					<div class="command-box">
						<code>npm run dev</code>
						<button class="copy-btn" onclick={() => copyToClipboard('npm run dev')} title="Copy command">
							<Icon name="copy" size={14} />
						</button>
					</div>
				</div>
			</div>

			<div class="next-step">
				<div class="step-number">3</div>
				<div class="step-content">
					<span class="step-title">Open in VS Code</span>
					<div class="command-box">
						<code>code .</code>
						<button class="copy-btn" onclick={() => copyToClipboard('code .')} title="Copy command">
							<Icon name="copy" size={14} />
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="actions">
		<button class="action-btn secondary" onclick={onCreateAnother}>
			<Icon name="plus" size={18} />
			Create Another Project
		</button>
		<button class="action-btn primary" onclick={onViewProject}>
			<Icon name="layout" size={18} />
			View in Dashboard
		</button>
	</div>
</div>

<style>
	.summary {
		padding: 24px;
		text-align: center;
	}

	.success-header {
		margin-bottom: 32px;
	}

	.success-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		background: #dcfce7;
		border-radius: 50%;
		color: #22c55e;
		margin-bottom: 16px;
	}

	.success-header h2 {
		margin: 0 0 8px;
		font-size: 24px;
		font-weight: 600;
		color: #1f2937;
	}

	.subtitle {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
	}

	.project-info {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 20px;
		margin-bottom: 24px;
		text-align: left;
	}

	.info-row {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 10px 0;
	}

	.info-row:not(:last-child) {
		border-bottom: 1px solid #e5e7eb;
	}

	.info-label {
		flex-shrink: 0;
		width: 100px;
		font-size: 13px;
		font-weight: 500;
		color: #6b7280;
	}

	.info-value {
		font-size: 14px;
		color: #1f2937;
	}

	.info-path {
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 12px;
		color: #374151;
		background: #f3f4f6;
		padding: 4px 8px;
		border-radius: 4px;
		word-break: break-all;
	}

	.feature-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.feature-tag {
		font-size: 11px;
		font-weight: 500;
		background: #dbeafe;
		color: #1d4ed8;
		padding: 4px 10px;
		border-radius: 12px;
		text-transform: capitalize;
	}

	.next-steps {
		text-align: left;
		margin-bottom: 24px;
	}

	.next-steps h3 {
		margin: 0 0 16px;
		font-size: 16px;
		font-weight: 600;
		color: #374151;
	}

	.steps-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.next-step {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.step-number {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eff6ff;
		color: #2563eb;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 600;
	}

	.step-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.step-title {
		font-size: 13px;
		font-weight: 500;
		color: #374151;
	}

	.command-box {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #1f2937;
		padding: 8px 12px;
		border-radius: 6px;
	}

	.command-box code {
		flex: 1;
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 12px;
		color: #e5e7eb;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.copy-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.copy-btn:hover {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.1);
	}

	.actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn.secondary {
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		color: #374151;
	}

	.action-btn.secondary:hover {
		background: #e5e7eb;
	}

	.action-btn.primary {
		background: #2563eb;
		border: none;
		color: #ffffff;
	}

	.action-btn.primary:hover {
		background: #1d4ed8;
	}
</style>
