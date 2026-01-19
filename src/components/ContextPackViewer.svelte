<script lang="ts">
	import { marked } from 'marked';
	import hljs from 'highlight.js';
	import Icon from './Icon.svelte';
	import type { ContextPack, ContextSymbol, ContextFile } from '$lib/context-pack-types';
	import { packToMarkdown } from '$lib/context-pack-types';

	let { pack, onClose, onExport }: {
		pack: ContextPack;
		onClose?: () => void;
		onExport?: (markdown: string) => void;
	} = $props();

	let activeTab: 'overview' | 'symbols' | 'files' | 'markdown' = $state('overview');
	let expandedSymbols = $state(new Set<string>());
	let expandedFiles = $state(new Set<string>());
	let copiedMarkdown = $state(false);

	// Generate markdown once
	let markdown = $derived(packToMarkdown(pack));

	function toggleSymbol(name: string) {
		const newSet = new Set(expandedSymbols);
		if (newSet.has(name)) {
			newSet.delete(name);
		} else {
			newSet.add(name);
		}
		expandedSymbols = newSet;
	}

	function toggleFile(path: string) {
		const newSet = new Set(expandedFiles);
		if (newSet.has(path)) {
			newSet.delete(path);
		} else {
			newSet.add(path);
		}
		expandedFiles = newSet;
	}

	function getKindIcon(kind: string): string {
		const icons: Record<string, string> = {
			function: 'code',
			method: 'git-commit',
			class: 'box',
			interface: 'layers',
			type: 'hash',
			variable: 'at-sign',
			route: 'navigation',
			component: 'layout'
		};
		return icons[kind] || 'file';
	}

	function formatTokens(tokens: number): string {
		if (tokens >= 1000) {
			return `${(tokens / 1000).toFixed(1)}K`;
		}
		return tokens.toString();
	}

	function highlightCode(code: string, lang: string): string {
		if (lang && hljs.getLanguage(lang)) {
			try {
				return hljs.highlight(code, { language: lang }).value;
			} catch {
				// Fall through
			}
		}
		try {
			return hljs.highlightAuto(code).value;
		} catch {
			return code;
		}
	}

	async function copyMarkdown() {
		try {
			await navigator.clipboard.writeText(markdown);
			copiedMarkdown = true;
			setTimeout(() => copiedMarkdown = false, 2000);
		} catch {
			console.error('Failed to copy markdown');
		}
	}

	function handleExport() {
		if (onExport) {
			onExport(markdown);
		} else {
			// Download as file
			const blob = new Blob([markdown], { type: 'text/markdown' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${pack.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
			a.click();
			URL.revokeObjectURL(url);
		}
	}
</script>

<div class="context-pack-viewer">
	<header class="viewer-header">
		<div class="header-left">
			<Icon name="package" size={20} />
			<h2>{pack.name}</h2>
			<span class="method-badge" class:codegraph={pack.generationMethod === 'codegraph'}>
				{pack.generationMethod}
			</span>
		</div>
		<div class="header-right">
			<button class="icon-btn" onclick={copyMarkdown} title="Copy as Markdown">
				<Icon name={copiedMarkdown ? 'check' : 'copy'} size={16} />
			</button>
			<button class="icon-btn" onclick={handleExport} title="Export">
				<Icon name="download" size={16} />
			</button>
			{#if onClose}
				<button class="icon-btn" onclick={onClose} title="Close">
					<Icon name="x" size={16} />
				</button>
			{/if}
		</div>
	</header>

	<nav class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'overview'}
			onclick={() => activeTab = 'overview'}
		>
			<Icon name="info" size={14} />
			Overview
		</button>
		<button
			class="tab"
			class:active={activeTab === 'symbols'}
			onclick={() => activeTab = 'symbols'}
		>
			<Icon name="code" size={14} />
			Symbols ({pack.symbols.length})
		</button>
		<button
			class="tab"
			class:active={activeTab === 'files'}
			onclick={() => activeTab = 'files'}
		>
			<Icon name="file-text" size={14} />
			Files ({pack.files.length})
		</button>
		<button
			class="tab"
			class:active={activeTab === 'markdown'}
			onclick={() => activeTab = 'markdown'}
		>
			<Icon name="file-code" size={14} />
			Markdown
		</button>
	</nav>

	<div class="tab-content">
		{#if activeTab === 'overview'}
			<div class="overview">
				{#if pack.description}
					<p class="description">{pack.description}</p>
				{/if}

				<div class="stats-grid">
					<div class="stat">
						<span class="stat-value">{formatTokens(pack.totalTokens)}</span>
						<span class="stat-label">Tokens</span>
					</div>
					<div class="stat">
						<span class="stat-value">{pack.symbols.length}</span>
						<span class="stat-label">Symbols</span>
					</div>
					<div class="stat">
						<span class="stat-value">{pack.files.length}</span>
						<span class="stat-label">Files</span>
					</div>
					<div class="stat">
						<span class="stat-value">{pack.dependencies.length}</span>
						<span class="stat-label">Dependencies</span>
					</div>
				</div>

				<div class="meta-section">
					<h3>Generation Details</h3>
					<dl class="meta-list">
						<dt>Entry Point</dt>
						<dd><code>{pack.config.entryPoint}</code></dd>
						<dt>Method</dt>
						<dd>{pack.generationMethod}</dd>
						<dt>Generated</dt>
						<dd>{new Date(pack.createdAt).toLocaleString()}</dd>
						<dt>Generation Time</dt>
						<dd>{pack.metadata.generationTimeMs}ms</dd>
						{#if pack.metadata.codegraphQueries > 0}
							<dt>CodeGraph Queries</dt>
							<dd>{pack.metadata.codegraphQueries}</dd>
						{/if}
					</dl>
				</div>

				{#if pack.metadata.warnings.length > 0}
					<div class="warnings">
						<h3><Icon name="alert-triangle" size={14} /> Warnings</h3>
						<ul>
							{#each pack.metadata.warnings as warning}
								<li>{warning}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

		{:else if activeTab === 'symbols'}
			<div class="symbols-list">
				{#each pack.symbols as symbol}
					<div class="symbol-item">
						<button
							class="symbol-header"
							onclick={() => toggleSymbol(symbol.name)}
						>
							<Icon name={expandedSymbols.has(symbol.name) ? 'chevron-down' : 'chevron-right'} size={14} />
							<Icon name={getKindIcon(symbol.kind)} size={14} />
							<span class="symbol-name">{symbol.name}</span>
							<span class="symbol-kind">{symbol.kind}</span>
							<span class="symbol-relevance" style="--relevance: {symbol.relevance}">
								{Math.round(symbol.relevance * 100)}%
							</span>
							<span class="symbol-tokens">{formatTokens(symbol.tokenEstimate)} tok</span>
						</button>
						{#if expandedSymbols.has(symbol.name)}
							<div class="symbol-details">
								<div class="symbol-location">
									<Icon name="map-pin" size={12} />
									{symbol.filePath}:{symbol.line}
								</div>
								{#if symbol.reason}
									<div class="symbol-reason">
										<Icon name="info" size={12} />
										{symbol.reason}
									</div>
								{/if}
								{#if symbol.signature}
									<pre class="symbol-signature"><code>{@html highlightCode(symbol.signature, 'typescript')}</code></pre>
								{/if}
								{#if symbol.code}
									<pre class="symbol-code"><code>{@html highlightCode(symbol.code, 'typescript')}</code></pre>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

		{:else if activeTab === 'files'}
			<div class="files-list">
				{#each pack.files as file}
					<div class="file-item">
						<button
							class="file-header"
							onclick={() => toggleFile(file.path)}
						>
							<Icon name={expandedFiles.has(file.path) ? 'chevron-down' : 'chevron-right'} size={14} />
							<Icon name="file" size={14} />
							<span class="file-path">{file.path}</span>
							<span class="file-lang">{file.language}</span>
							<span class="file-relevance" style="--relevance: {file.relevance}">
								{Math.round(file.relevance * 100)}%
							</span>
							<span class="file-tokens">{formatTokens(file.tokenEstimate)} tok</span>
						</button>
						{#if expandedFiles.has(file.path)}
							<div class="file-details">
								{#if file.reason}
									<div class="file-reason">
										<Icon name="info" size={12} />
										{file.reason}
									</div>
								{/if}
								{#if file.excerpt}
									<div class="file-excerpt-info">
										Lines {file.excerpt.startLine}-{file.excerpt.endLine} of {file.excerpt.totalLines}
									</div>
								{/if}
								<pre class="file-content"><code>{@html highlightCode(file.content, file.language)}</code></pre>
							</div>
						{/if}
					</div>
				{/each}
			</div>

		{:else if activeTab === 'markdown'}
			<div class="markdown-view">
				<div class="markdown-actions">
					<button class="btn btn-sm" onclick={copyMarkdown}>
						<Icon name={copiedMarkdown ? 'check' : 'copy'} size={14} />
						{copiedMarkdown ? 'Copied!' : 'Copy'}
					</button>
					<button class="btn btn-sm" onclick={handleExport}>
						<Icon name="download" size={14} />
						Download
					</button>
				</div>
				<pre class="markdown-content"><code>{markdown}</code></pre>
			</div>
		{/if}
	</div>
</div>

<style>
	.context-pack-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border-radius: 8px;
		overflow: hidden;
	}

	.viewer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-left h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}

	.method-badge {
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 500;
		border-radius: 4px;
		background: #f3f4f6;
		color: #6b7280;
	}

	.method-badge.codegraph {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.header-right {
		display: flex;
		gap: 8px;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.icon-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.tabs {
		display: flex;
		gap: 4px;
		padding: 8px 16px;
		border-bottom: 1px solid #e5e7eb;
		background: #fafafa;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: none;
		border-radius: 6px;
		background: transparent;
		font-size: 13px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.tab.active {
		background: #ffffff;
		color: #111827;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	/* Overview */
	.overview {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.description {
		margin: 0;
		color: #6b7280;
		font-size: 14px;
		line-height: 1.5;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 16px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.stat-value {
		font-size: 24px;
		font-weight: 600;
		color: #111827;
	}

	.stat-label {
		font-size: 12px;
		color: #6b7280;
		margin-top: 4px;
	}

	.meta-section h3 {
		margin: 0 0 12px 0;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
	}

	.meta-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 16px;
		margin: 0;
		font-size: 13px;
	}

	.meta-list dt {
		color: #6b7280;
	}

	.meta-list dd {
		margin: 0;
		color: #111827;
	}

	.meta-list code {
		padding: 2px 6px;
		background: #f3f4f6;
		border-radius: 4px;
		font-family: 'SF Mono', monospace;
		font-size: 12px;
	}

	.warnings {
		padding: 12px 16px;
		background: #fef3c7;
		border-radius: 8px;
	}

	.warnings h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px 0;
		font-size: 13px;
		font-weight: 600;
		color: #92400e;
	}

	.warnings ul {
		margin: 0;
		padding-left: 20px;
		font-size: 13px;
		color: #92400e;
	}

	/* Symbols List */
	.symbols-list, .files-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.symbol-item, .file-item {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}

	.symbol-header, .file-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 12px;
		border: none;
		background: #fafafa;
		font-size: 13px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.symbol-header:hover, .file-header:hover {
		background: #f3f4f6;
	}

	.symbol-name, .file-path {
		font-weight: 500;
		color: #111827;
	}

	.symbol-kind, .file-lang {
		padding: 2px 6px;
		font-size: 11px;
		background: #e5e7eb;
		border-radius: 4px;
		color: #6b7280;
	}

	.symbol-relevance, .file-relevance {
		margin-left: auto;
		padding: 2px 6px;
		font-size: 11px;
		border-radius: 4px;
		background: color-mix(in srgb, #22c55e calc(var(--relevance) * 100%), #f3f4f6);
		color: #374151;
	}

	.symbol-tokens, .file-tokens {
		font-size: 11px;
		color: #9ca3af;
		font-family: 'SF Mono', monospace;
	}

	.symbol-details, .file-details {
		padding: 12px;
		border-top: 1px solid #e5e7eb;
		background: #ffffff;
	}

	.symbol-location, .file-reason, .symbol-reason {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #6b7280;
		margin-bottom: 8px;
	}

	.file-excerpt-info {
		font-size: 11px;
		color: #9ca3af;
		margin-bottom: 8px;
	}

	.symbol-signature, .symbol-code, .file-content {
		margin: 8px 0 0 0;
		padding: 12px;
		background: #f6f8fa;
		border: 1px solid #e1e4e8;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 12px;
		line-height: 1.5;
	}

	.symbol-signature code, .symbol-code code, .file-content code {
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	/* Markdown View */
	.markdown-view {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.markdown-actions {
		display: flex;
		gap: 8px;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #ffffff;
		font-size: 13px;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn:hover {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.btn-sm {
		padding: 6px 10px;
		font-size: 12px;
	}

	.markdown-content {
		flex: 1;
		margin: 0;
		padding: 16px;
		background: #f6f8fa;
		border: 1px solid #e1e4e8;
		border-radius: 8px;
		overflow: auto;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.markdown-content code {
		font-family: 'SF Mono', 'Consolas', monospace;
	}
</style>
