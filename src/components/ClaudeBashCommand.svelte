<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		command,
		description,
		result,
		isRunning = false
	}: {
		command: string;
		description?: string;
		result?: string;
		isRunning?: boolean;
	} = $props();

	let showResult = $state(false);

	// Truncate command for display if too long
	function truncateCommand(cmd: string, maxLen: number): string {
		if (cmd.length <= maxLen) return cmd;
		return cmd.slice(0, maxLen) + '...';
	}
</script>

<div class="bash-container">
	<div class="bash-header">
		<div class="bash-icon">
			{#if isRunning}
				<div class="running-indicator"></div>
			{:else}
				<Icon name="terminal" size={14} />
			{/if}
		</div>
		<span class="bash-label">Terminal</span>
	</div>

	<div class="bash-content">
		<div class="command-line">
			<span class="prompt">$</span>
			<code class="command">{truncateCommand(command, 120)}</code>
		</div>

		{#if description}
			<div class="description">
				<Icon name="info" size={12} />
				<span>{description}</span>
			</div>
		{/if}
	</div>

	{#if result}
		<button class="toggle-result" onclick={() => showResult = !showResult}>
			<Icon name={showResult ? "chevron-up" : "chevron-down"} size={14} />
			<span>{showResult ? 'Hide output' : 'Show output'}</span>
		</button>

		{#if showResult}
			<div class="result-output">
				<pre>{result}</pre>
			</div>
		{/if}
	{/if}
</div>

<style>
	.bash-container {
		background: #0d1117;
		border: 1px solid #30363d;
		border-radius: 8px;
		overflow: hidden;
		font-family: 'SF Mono', Monaco, 'Consolas', monospace;
	}

	.bash-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #161b22;
		border-bottom: 1px solid #30363d;
	}

	.bash-icon {
		color: #8b949e;
		display: flex;
		align-items: center;
	}

	.running-indicator {
		width: 10px;
		height: 10px;
		background: #3fb950;
		border-radius: 50%;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.6; transform: scale(0.9); }
	}

	.bash-label {
		font-size: 11px;
		font-weight: 500;
		color: #8b949e;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.bash-content {
		padding: 12px;
	}

	.command-line {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.prompt {
		color: #3fb950;
		font-weight: 600;
		flex-shrink: 0;
	}

	.command {
		color: #e6edf3;
		font-size: 13px;
		line-height: 1.5;
		word-break: break-all;
		background: transparent;
	}

	.description {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		padding-left: 16px;
		font-size: 12px;
		color: #8b949e;
		font-family: 'Figtree', sans-serif;
	}

	.toggle-result {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 8px 12px;
		background: #161b22;
		border: none;
		border-top: 1px solid #30363d;
		color: #58a6ff;
		font-size: 11px;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.toggle-result:hover {
		background: #1f2937;
	}

	.result-output {
		padding: 12px;
		background: #0d1117;
		border-top: 1px solid #30363d;
		max-height: 200px;
		overflow-y: auto;
	}

	.result-output pre {
		margin: 0;
		font-size: 11px;
		color: #8b949e;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
