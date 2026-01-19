<script lang="ts">
	import { marked } from 'marked';
	import hljs from 'highlight.js';
	// Import highlight.js GitHub theme (light, clean, works well with chat UI)
	import 'highlight.js/styles/github.css';
	import Icon from './Icon.svelte';
	import ClaudeBashCommand from './ClaudeBashCommand.svelte';
	import ToolDisplay from './ToolDisplay.svelte';

	// Configure marked to use highlight.js for code blocks
	marked.setOptions({
		highlight: function(code: string, lang: string) {
			if (lang && hljs.getLanguage(lang)) {
				try {
					return hljs.highlight(code, { language: lang }).value;
				} catch {
					// Fall through to auto-detection
				}
			}
			// Auto-detect language if not specified or invalid
			try {
				return hljs.highlightAuto(code).value;
			} catch {
				return code;
			}
		}
	});

	interface ToolCall {
		name: string;
		input: Record<string, unknown>;
		result?: unknown;
		error?: string;
		startedAt?: Date;
		completedAt?: Date;
	}

	let { role, content, toolCalls = [], isStreaming = false, timestamp, totalTokens }: {
		role: 'user' | 'assistant' | 'system';
		content: string;
		toolCalls?: ToolCall[];
		isStreaming?: boolean;
		timestamp?: Date;
		totalTokens?: number;
	} = $props();

	// Filter out TodoWrite calls - they're displayed separately as a floating list
	let visibleToolCalls = $derived(toolCalls.filter(t => t.name !== 'TodoWrite'));

	// Check if a tool is a Bash command
	function isBashTool(tool: ToolCall): boolean {
		return tool.name === 'Bash';
	}

	// Extract Bash command info
	function getBashInfo(tool: ToolCall): { command: string; description?: string } {
		const input = tool.input as { command?: string; description?: string };
		return {
			command: input.command || '',
			description: input.description
		};
	}

	// Check if result indicates the command is still running
	function isCommandRunning(tool: ToolCall): boolean {
		return tool.result === undefined;
	}

	let renderedContent = $derived(() => {
		if (!content) return '';
		try {
			return marked(content);
		} catch {
			return content;
		}
	});

	let formattedTime = $derived(() => {
		if (!timestamp) return '';
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	});

	let formattedTokens = $derived(() => {
		if (!totalTokens) return '';
		if (totalTokens >= 1000) {
			return `${(totalTokens / 1000).toFixed(1)}K tokens`;
		}
		return `${totalTokens} tokens`;
	});
</script>

<div class="chat-message" class:user={role === 'user'} class:assistant={role === 'assistant'} class:system={role === 'system'}>
	{#if role !== 'system'}
		<div class="message-header">
			<div class="avatar" class:user-avatar={role === 'user'} class:assistant-avatar={role === 'assistant'}>
				{#if role === 'user'}
					<Icon name="user" size={14} />
				{:else}
					<Icon name="cpu" size={14} />
				{/if}
			</div>
			<span class="role-label">{role === 'user' ? 'You' : 'Claude'}</span>
			{#if formattedTime()}
				<span class="timestamp">{formattedTime()}</span>
			{/if}
			{#if isStreaming}
				<span class="streaming-indicator">
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="dot"></span>
				</span>
			{/if}
		</div>
	{/if}

	<div class="message-content" class:system-content={role === 'system'}>
		{#if role === 'system'}
			<Icon name="info" size={14} />
			<span>{content}</span>
		{:else}
			{@html renderedContent()}
		{/if}
	</div>

	{#if visibleToolCalls.length > 0}
		<div class="tool-calls">
			{#each visibleToolCalls as tool}
				{#if isBashTool(tool)}
					{@const bashInfo = getBashInfo(tool)}
					<ClaudeBashCommand
						command={bashInfo.command}
						description={bashInfo.description}
						result={typeof tool.result === 'string' ? tool.result : undefined}
						isRunning={isCommandRunning(tool)}
					/>
				{:else}
					<ToolDisplay
						name={tool.name}
						input={tool.input}
						result={tool.result}
						error={tool.error}
						startedAt={tool.startedAt}
						completedAt={tool.completedAt}
						isRunning={isCommandRunning(tool)}
					/>
				{/if}
			{/each}
		</div>
	{/if}

	{#if role === 'assistant' && formattedTokens() && !isStreaming}
		<div class="message-footer">
			<span class="token-count">{formattedTokens()}</span>
		</div>
	{/if}
</div>

<style>
	.chat-message {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px;
		border-radius: 12px;
		max-width: 85%;
	}

	.chat-message.user {
		align-self: flex-end;
		background: #2563eb;
		color: #ffffff;
	}

	.chat-message.assistant {
		align-self: flex-start;
		background: #ffffff;
		border: 1px solid #e5e7eb;
	}

	.chat-message.system {
		align-self: center;
		max-width: 100%;
		padding: 8px 12px;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		opacity: 0.8;
	}

	.user .message-header {
		color: rgba(255, 255, 255, 0.8);
	}

	.assistant .message-header {
		color: #6b7280;
	}

	.avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.user-avatar {
		background: rgba(255, 255, 255, 0.2);
		color: #ffffff;
	}

	.assistant-avatar {
		background: #f3f4f6;
		color: #4b5563;
	}

	.role-label {
		font-weight: 500;
	}

	.timestamp {
		margin-left: auto;
		font-size: 11px;
	}

	.streaming-indicator {
		display: flex;
		gap: 3px;
		margin-left: 8px;
	}

	.streaming-indicator .dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: currentColor;
		animation: bounce 1.4s ease-in-out infinite;
	}

	.streaming-indicator .dot:nth-child(1) { animation-delay: 0s; }
	.streaming-indicator .dot:nth-child(2) { animation-delay: 0.2s; }
	.streaming-indicator .dot:nth-child(3) { animation-delay: 0.4s; }

	@keyframes bounce {
		0%, 80%, 100% { transform: translateY(0); }
		40% { transform: translateY(-4px); }
	}

	.message-content {
		font-size: 14px;
		line-height: 1.6;
	}

	.system-content {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #6b7280;
		font-style: italic;
	}

	.message-content :global(p) {
		margin: 0 0 8px 0;
	}

	.message-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.message-content :global(code) {
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 0.9em;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.user .message-content :global(code) {
		background: rgba(255, 255, 255, 0.2);
	}

	.assistant .message-content :global(code) {
		background: #f3f4f6;
	}

	.message-content :global(pre) {
		margin: 8px 0;
		padding: 12px;
		border-radius: 8px;
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
	}

	/* Code inside pre (syntax highlighted) - reset highlight.js background */
	.message-content :global(pre code) {
		padding: 0;
		background: transparent;
		font-size: inherit;
	}

	/* highlight.js language label (if shown) */
	.message-content :global(pre code.hljs) {
		padding: 0;
	}

	.user .message-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
	}

	/* Override highlight.js colors for user messages (light text on dark bg) */
	.user .message-content :global(pre code),
	.user .message-content :global(pre .hljs) {
		color: rgba(255, 255, 255, 0.95);
	}
	.user .message-content :global(pre .hljs-keyword),
	.user .message-content :global(pre .hljs-selector-tag) {
		color: #ff79c6;
	}
	.user .message-content :global(pre .hljs-string),
	.user .message-content :global(pre .hljs-attr) {
		color: #8be9fd;
	}
	.user .message-content :global(pre .hljs-number) {
		color: #bd93f9;
	}
	.user .message-content :global(pre .hljs-comment) {
		color: rgba(255, 255, 255, 0.5);
	}

	.assistant .message-content :global(pre) {
		background: #f6f8fa;
		border: 1px solid #e1e4e8;
	}

	.message-content :global(ul),
	.message-content :global(ol) {
		margin: 8px 0;
		padding-left: 20px;
	}

	.tool-calls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
	}

	.message-footer {
		display: flex;
		justify-content: flex-end;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #e5e7eb;
	}

	.token-count {
		font-size: 11px;
		color: #9ca3af;
		font-family: 'SF Mono', 'Consolas', monospace;
	}
</style>
