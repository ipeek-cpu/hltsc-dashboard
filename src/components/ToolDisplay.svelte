<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		name: string;
		input: Record<string, unknown>;
		result?: unknown;
		isRunning?: boolean;
		isDark?: boolean;
	}

	let { name, input, result, isRunning = false, isDark = false }: Props = $props();

	// Track expanded state
	let isExpanded = $state(false);

	// Get tool display info based on tool type
	function getToolInfo(): { icon: string; title: string; subtitle?: string } {
		switch (name) {
			case 'Read': {
				const filePath = (input.file_path as string) || '';
				const filename = filePath.split('/').pop() || 'file';
				const parentPath = getShortPath(filePath);
				return { icon: 'file-text', title: filename, subtitle: parentPath };
			}
			case 'Write': {
				const filePath = (input.file_path as string) || '';
				const filename = filePath.split('/').pop() || 'file';
				const parentPath = getShortPath(filePath);
				return { icon: 'file-plus', title: `Creating ${filename}`, subtitle: parentPath };
			}
			case 'Edit': {
				const filePath = (input.file_path as string) || '';
				const filename = filePath.split('/').pop() || 'file';
				const parentPath = getShortPath(filePath);
				return { icon: 'edit-3', title: `Editing ${filename}`, subtitle: parentPath };
			}
			case 'Glob': {
				const pattern = (input.pattern as string) || '*';
				const path = (input.path as string) || '';
				return { icon: 'search', title: `Search: ${pattern}`, subtitle: path ? getShortPath(path) : undefined };
			}
			case 'Grep': {
				const pattern = (input.pattern as string) || '';
				const path = (input.path as string) || '';
				return { icon: 'search', title: `Find: "${pattern}"`, subtitle: path ? getShortPath(path) : undefined };
			}
			case 'Task': {
				const desc = (input.description as string) || 'Running task';
				return { icon: 'cpu', title: desc };
			}
			case 'WebFetch': {
				const url = (input.url as string) || '';
				try {
					const hostname = new URL(url).hostname;
					return { icon: 'globe', title: `Fetching ${hostname}` };
				} catch {
					return { icon: 'globe', title: 'Fetching URL' };
				}
			}
			case 'WebSearch': {
				const query = (input.query as string) || '';
				return { icon: 'search', title: `Searching: "${query}"` };
			}
			default:
				return { icon: 'tool', title: name };
		}
	}

	// Get shortened path (last 2-3 directories)
	function getShortPath(filePath: string): string {
		const parts = filePath.split('/');
		if (parts.length <= 3) return filePath;
		return '.../' + parts.slice(-3, -1).join('/');
	}

	// Get result summary
	function getResultSummary(): { text: string; hasMore: boolean } {
		if (result === undefined) return { text: '', hasMore: false };

		const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

		// For file lists, count files
		if (name === 'Glob' || name === 'Grep') {
			const lines = resultStr.split('\n').filter(Boolean);
			if (lines.length > 0) {
				const matchType = name === 'Glob' ? 'files' : 'matches';
				return { text: `${lines.length} ${matchType} found`, hasMore: lines.length > 3 };
			}
			return { text: 'No matches', hasMore: false };
		}

		// For Read results, show line count
		if (name === 'Read') {
			const lines = resultStr.split('\n');
			if (lines.length > 10) {
				return { text: `${lines.length} lines`, hasMore: true };
			}
		}

		// Default: show first line or truncate
		const firstLine = resultStr.split('\n')[0] || '';
		if (firstLine.length > 60) {
			return { text: firstLine.slice(0, 60) + '...', hasMore: true };
		}
		return { text: firstLine, hasMore: resultStr.includes('\n') };
	}

	// Format result for display
	function formatResult(): string {
		if (result === undefined) return '';
		if (typeof result === 'string') return result;
		try {
			return JSON.stringify(result, null, 2);
		} catch {
			return String(result);
		}
	}

	let toolInfo = $derived(getToolInfo());
	let resultSummary = $derived(getResultSummary());
</script>

<div class="tool-display" class:dark={isDark}>
	<div class="tool-header">
		<div class="tool-icon">
			<Icon name={toolInfo.icon} size={14} />
		</div>
		<div class="tool-info">
			<span class="tool-title">{toolInfo.title}</span>
			{#if toolInfo.subtitle}
				<span class="tool-subtitle">{toolInfo.subtitle}</span>
			{/if}
		</div>
		{#if isRunning}
			<div class="tool-running">
				<Icon name="loader" size={14} />
			</div>
		{/if}
	</div>

	{#if result !== undefined && !isRunning}
		<div class="tool-result">
			<button class="result-toggle" onclick={() => isExpanded = !isExpanded}>
				<Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
				<span class="result-label">Result</span>
				{#if !isExpanded && resultSummary.text}
					<span class="result-summary">{resultSummary.text}</span>
				{/if}
			</button>
			{#if isExpanded}
				<pre class="result-content">{formatResult()}</pre>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tool-display {
		background: rgba(59, 130, 246, 0.08);
		border-left: 3px solid #3b82f6;
		border-radius: 0 8px 8px 0;
		padding: 10px 12px;
		font-size: 13px;
	}

	.tool-display.dark {
		background: rgba(59, 130, 246, 0.15);
	}

	.tool-header {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.tool-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: rgba(59, 130, 246, 0.15);
		border-radius: 6px;
		color: #3b82f6;
		flex-shrink: 0;
	}

	.dark .tool-icon {
		background: rgba(59, 130, 246, 0.25);
		color: #60a5fa;
	}

	.tool-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tool-title {
		font-weight: 500;
		color: #1f2937;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dark .tool-title {
		color: #e2e8f0;
	}

	.tool-subtitle {
		font-size: 11px;
		color: #6b7280;
		font-family: 'SF Mono', 'Consolas', monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dark .tool-subtitle {
		color: #94a3b8;
	}

	.tool-running {
		color: #3b82f6;
	}

	.tool-running :global(.icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.tool-result {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid rgba(59, 130, 246, 0.15);
	}

	.dark .tool-result {
		border-top-color: rgba(59, 130, 246, 0.25);
	}

	.result-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: 12px;
		font-family: inherit;
		color: #059669;
		transition: color 0.15s ease;
		width: 100%;
		min-width: 0;
		text-align: left;
	}

	.dark .result-toggle {
		color: #34d399;
	}

	.result-toggle:hover {
		color: #047857;
	}

	.dark .result-toggle:hover {
		color: #6ee7b7;
	}

	.result-label {
		font-weight: 500;
		flex-shrink: 0;
	}

	.result-summary {
		color: #6b7280;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 11px;
		margin-left: 4px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dark .result-summary {
		color: #94a3b8;
	}

	.result-content {
		margin: 10px 0 0 0;
		padding: 10px 12px;
		background: #1e293b;
		border-radius: 6px;
		font-size: 11px;
		font-family: 'SF Mono', 'Consolas', monospace;
		color: #94a3b8;
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 300px;
		overflow-y: auto;
	}

	.dark .result-content {
		background: rgba(0, 0, 0, 0.3);
	}
</style>
