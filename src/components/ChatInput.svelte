<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	export type ChatMode = 'agent' | 'plan' | 'ask';
	export type ChatModel = 'opus' | 'sonnet' | 'haiku';

	interface AttachedFile {
		path: string;
		name: string;
	}

	let {
		onsend,
		oncancel,
		disabled = false,
		isStreaming = false,
		mode = $bindable<ChatMode>('agent'),
		model = $bindable<ChatModel>('opus'),
		attachedFiles = $bindable<AttachedFile[]>([]),
		onOpenFolder,
		onRef = null
	}: {
		onsend: (message: string, files: AttachedFile[]) => void;
		oncancel?: () => void;
		disabled?: boolean;
		isStreaming?: boolean;
		mode?: ChatMode;
		model?: ChatModel;
		attachedFiles?: AttachedFile[];
		onOpenFolder?: (path: string) => void;
		onRef?: ((ref: { setInput: (text: string) => void }) => void) | null;
	} = $props();

	let inputValue = $state('');
	let textareaEl: HTMLTextAreaElement | null = $state(null);
	let modeDropdownOpen = $state(false);
	let modelDropdownOpen = $state(false);
	let isDragOver = $state(false);

	// Expose setInput function to parent
	function setInput(text: string) {
		inputValue = text;
		// Auto-expand textarea after setting value
		if (textareaEl) {
			// Use requestAnimationFrame to ensure the value is set first
			requestAnimationFrame(() => {
				if (textareaEl) {
					textareaEl.style.height = 'auto';
					textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
					textareaEl.focus();
					// Move cursor to end
					textareaEl.setSelectionRange(text.length, text.length);
				}
			});
		}
	}

	// Notify parent about the ref on mount
	onMount(() => {
		if (onRef) {
			onRef({ setInput });
		}
	});

	// Tauri APIs (loaded dynamically to support both browser and Tauri environments)
	let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
	let tauriEvent: typeof import('@tauri-apps/api/event') | null = null;
	let unlistenDragDrop: (() => void) | null = null;
	let isTauriEnvironment = $state(false);

	onMount(async () => {
		// Check if we're in Tauri environment (with retry for production builds)
		const checkTauri = () => (window as any).__TAURI_INTERNALS__?.invoke;

		let internals = checkTauri();
		if (!internals) {
			// In production, Tauri internals may not be immediately available
			// Wait up to 3 seconds with retries
			console.log('[ChatInput] Tauri not immediately available, waiting...');
			for (let i = 0; i < 30; i++) {
				await new Promise(r => setTimeout(r, 100));
				internals = checkTauri();
				if (internals) {
					console.log('[ChatInput] Tauri became available after', (i + 1) * 100, 'ms');
					break;
				}
			}
		}

		if (!internals) {
			console.log('[ChatInput] Not in Tauri environment, file features limited');
			return;
		}

		console.log('[ChatInput] Tauri environment detected, loading APIs...');
		isTauriEnvironment = true;

		// Load Tauri APIs
		try {
			tauriDialog = await import('@tauri-apps/plugin-dialog');
			console.log('[ChatInput] Dialog plugin loaded');
		} catch (e) {
			console.error('[ChatInput] Failed to load dialog plugin:', e);
		}

		try {
			tauriEvent = await import('@tauri-apps/api/event');
			console.log('[ChatInput] Event API loaded');

			// Listen for Tauri drag-drop events
			if (tauriEvent) {
				// Listen for file drop
				const unlistenDrop = await tauriEvent.listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
					console.log('[ChatInput] Drag-drop event received:', event.payload);
					isDragOver = false;
					if (event.payload.paths && event.payload.paths.length > 0) {
						addFilesFromPaths(event.payload.paths);
					}
				});

				// Listen for drag over (files hovering over window)
				const unlistenOver = await tauriEvent.listen('tauri://drag-over', () => {
					console.log('[ChatInput] Drag-over event');
					isDragOver = true;
				});

				// Listen for drag cancelled (files dragged away)
				const unlistenCancelled = await tauriEvent.listen('tauri://drag-cancelled', () => {
					console.log('[ChatInput] Drag-cancelled event');
					isDragOver = false;
				});

				// Combine all unlisten functions
				unlistenDragDrop = () => {
					unlistenDrop();
					unlistenOver();
					unlistenCancelled();
				};
				console.log('[ChatInput] All drag-drop listeners registered');
			}
		} catch (e) {
			console.error('[ChatInput] Failed to load event API:', e);
		}

		return () => {
			if (unlistenDragDrop) {
				unlistenDragDrop();
			}
		};
	});

	const modes: { value: ChatMode; label: string; icon: string; description: string }[] = [
		{ value: 'agent', label: 'Agent', icon: 'zap', description: 'Full access to read, write, and execute' },
		{ value: 'plan', label: 'Plan', icon: 'list', description: 'Read-only analysis and planning' },
		{ value: 'ask', label: 'Ask', icon: 'message-circle', description: 'Quick questions without file access' }
	];

	const models: { value: ChatModel; label: string; description: string }[] = [
		{ value: 'opus', label: 'Opus', description: 'Most capable, best for complex tasks' },
		{ value: 'sonnet', label: 'Sonnet', description: 'Balanced performance and speed' },
		{ value: 'haiku', label: 'Haiku', description: 'Fastest, best for simple tasks' }
	];

	let currentMode = $derived(modes.find(m => m.value === mode) || modes[0]);
	let currentModel = $derived(models.find(m => m.value === model) || models[0]);

	function handleSubmit() {
		if (disabled || isStreaming || (!inputValue.trim() && attachedFiles.length === 0)) return;

		onsend(inputValue.trim(), attachedFiles);
		inputValue = '';
		attachedFiles = [];

		// Reset textarea height
		if (textareaEl) {
			textareaEl.style.height = 'auto';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
		// Close dropdowns on Escape
		if (e.key === 'Escape') {
			modeDropdownOpen = false;
			modelDropdownOpen = false;
		}
	}

	function handleInput() {
		// Auto-expand textarea
		if (textareaEl) {
			textareaEl.style.height = 'auto';
			textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
		}
	}

	function handleCancel() {
		oncancel?.();
	}

	function selectMode(m: ChatMode) {
		mode = m;
		modeDropdownOpen = false;
	}

	function selectModel(m: ChatModel) {
		model = m;
		modelDropdownOpen = false;
	}

	function toggleModeDropdown() {
		modeDropdownOpen = !modeDropdownOpen;
		modelDropdownOpen = false;
	}

	function toggleModelDropdown() {
		modelDropdownOpen = !modelDropdownOpen;
		modeDropdownOpen = false;
	}

	// Close dropdowns when clicking outside
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.pill-dropdown')) {
			modeDropdownOpen = false;
			modelDropdownOpen = false;
		}
	}

	// File attachment functions
	async function openFilePicker() {
		const currentInternals = (window as any).__TAURI_INTERNALS__;
		console.log('[ChatInput] Opening file picker:', {
			tauriDialog: !!tauriDialog,
			isTauriEnv: isTauriEnvironment,
			hasInternals: !!currentInternals,
			hasInvoke: !!currentInternals?.invoke
		});

		// If Tauri wasn't detected on mount but is now available, try to initialize
		if (!isTauriEnvironment && currentInternals?.invoke) {
			console.log('[ChatInput] Tauri now available, late initialization...');
			isTauriEnvironment = true;
		}

		if (!tauriDialog) {
			// Try to load dialog plugin again if not loaded
			if (isTauriEnvironment || currentInternals?.invoke) {
				try {
					tauriDialog = await import('@tauri-apps/plugin-dialog');
					console.log('[ChatInput] Dialog plugin loaded on demand');
				} catch (e) {
					console.error('[ChatInput] Failed to load dialog plugin on demand:', e);
				}
			}
		}

		if (tauriDialog) {
			try {
				// Use Tauri's native file dialog for full path support
				console.log('[ChatInput] Calling tauriDialog.open()...');
				const selected = await tauriDialog.open({
					multiple: true,
					title: 'Select files to attach'
				});
				console.log('[ChatInput] Dialog result:', selected);

				if (selected) {
					const paths = Array.isArray(selected) ? selected : [selected];
					addFilesFromPaths(paths);
				}
			} catch (e) {
				console.error('[ChatInput] Error opening file dialog:', e);
			}
		} else {
			// Fallback for browser (won't have full paths)
			console.warn('[ChatInput] File picker not available - not in Tauri environment or plugin not loaded');
		}
	}

	function addFilesFromPaths(paths: string[]) {
		const newFiles: AttachedFile[] = paths.map(p => ({
			path: p,
			name: p.split('/').pop() || p.split('\\').pop() || p
		}));

		// Filter out duplicates
		const existingPaths = new Set(attachedFiles.map(f => f.path));
		const uniqueNew = newFiles.filter(f => !existingPaths.has(f.path));

		attachedFiles = [...attachedFiles, ...uniqueNew];
	}

	function removeFile(index: number) {
		attachedFiles = attachedFiles.filter((_, i) => i !== index);
	}

	function handleFileClick(file: AttachedFile) {
		// Open the parent folder
		if (onOpenFolder) {
			const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
			onOpenFolder(parentPath || file.path);
		}
	}

	// Drag and drop handlers (visual feedback only - actual file handling via Tauri events)
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;
		// File handling is done via Tauri's tauri://drag-drop event listener
	}

	// Get file extension for icon
	function getFileIcon(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase();
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext || '')) return 'image';
		if (['pdf'].includes(ext || '')) return 'file-text';
		if (['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) return 'video';
		if (['mp3', 'wav', 'ogg'].includes(ext || '')) return 'music';
		if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext || '')) return 'archive';
		if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(ext || '')) return 'code';
		if (['json', 'yaml', 'yml', 'xml', 'toml'].includes(ext || '')) return 'settings';
		if (['md', 'txt', 'doc', 'docx'].includes(ext || '')) return 'file-text';
		return 'file';
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div
	class="chat-input-container"
	class:drag-over={isDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
>
	<!-- Attached files display -->
	{#if attachedFiles.length > 0}
		<div class="attached-files">
			{#each attachedFiles as file, i (file.path)}
				<div
					class="file-chip"
					onclick={() => handleFileClick(file)}
					onkeydown={(e) => e.key === 'Enter' && handleFileClick(file)}
					role="button"
					tabindex="0"
					title={`Click to open folder: ${file.path}`}
				>
					<Icon name={getFileIcon(file.name)} size={14} />
					<span class="file-name">{file.name}</span>
					<button
						class="remove-file"
						onclick={(e) => { e.stopPropagation(); removeFile(i); }}
						title="Remove file"
					>
						<Icon name="x" size={12} />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="input-wrapper">
		<textarea
			bind:this={textareaEl}
			bind:value={inputValue}
			placeholder={isDragOver ? 'Drop files here...' : isStreaming ? 'Claude is responding...' : mode === 'plan' ? 'Describe what you want to plan...' : mode === 'ask' ? 'Ask a question...' : 'Type your message...'}
			disabled={disabled}
			rows="1"
			onkeydown={handleKeydown}
			oninput={handleInput}
		></textarea>

		<div class="input-actions">
			<!-- Attach file button -->
			<button
				class="attach-btn"
				onclick={openFilePicker}
				disabled={disabled || isStreaming}
				title="Attach files"
			>
				<Icon name="paperclip" size={18} />
			</button>

			{#if isStreaming}
				<button class="cancel-btn" onclick={handleCancel} title="Cancel response">
					<Icon name="square" size={18} />
				</button>
			{:else}
				<button
					class="send-btn"
					onclick={handleSubmit}
					disabled={disabled || (!inputValue.trim() && attachedFiles.length === 0)}
					title="Send message (Enter)"
				>
					<Icon name="send" size={18} />
				</button>
			{/if}
		</div>
	</div>

	<div class="input-footer">
		<div class="pills-container">
			<!-- Mode Pill -->
			<div class="pill-dropdown">
				<button
					class="pill"
					class:active={modeDropdownOpen}
					onclick={toggleModeDropdown}
					disabled={isStreaming}
				>
					<Icon name={currentMode.icon} size={14} />
					<span>{currentMode.label}</span>
					<Icon name="chevron-down" size={12} />
				</button>

				{#if modeDropdownOpen}
					<div class="dropdown-menu">
						{#each modes as m}
							<button
								class="dropdown-item"
								class:selected={mode === m.value}
								onclick={() => selectMode(m.value)}
							>
								<div class="item-icon">
									<Icon name={m.icon} size={16} />
								</div>
								<div class="item-content">
									<span class="item-label">{m.label}</span>
									<span class="item-desc">{m.description}</span>
								</div>
								{#if mode === m.value}
									<Icon name="check" size={16} class="check-icon" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Model Pill -->
			<div class="pill-dropdown">
				<button
					class="pill"
					class:active={modelDropdownOpen}
					onclick={toggleModelDropdown}
					disabled={isStreaming}
				>
					<span>{currentModel.label}</span>
					<Icon name="chevron-down" size={12} />
				</button>

				{#if modelDropdownOpen}
					<div class="dropdown-menu">
						{#each models as m}
							<button
								class="dropdown-item"
								class:selected={model === m.value}
								onclick={() => selectModel(m.value)}
							>
								<div class="item-content">
									<span class="item-label">{m.label}</span>
									<span class="item-desc">{m.description}</span>
								</div>
								{#if model === m.value}
									<Icon name="check" size={16} class="check-icon" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="input-hint">
			<kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> new line
		</div>
	</div>

	<!-- Drag overlay -->
	{#if isDragOver}
		<div class="drag-overlay">
			<Icon name="upload" size={32} />
			<span>Drop files to attach</span>
		</div>
	{/if}
</div>

<style>
	.chat-input-container {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px;
		background: #ffffff;
		border-top: 1px solid #e5e7eb;
		position: relative;
	}

	.chat-input-container.drag-over {
		background: #eff6ff;
	}

	/* Attached files */
	.attached-files {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.file-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px 6px 10px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 13px;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.file-chip:hover {
		background: #e5e7eb;
		border-color: #d1d5db;
	}

	.file-name {
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-file {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.remove-file:hover {
		background: #dc2626;
		color: #ffffff;
	}

	.input-wrapper {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 8px 12px;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.input-wrapper:focus-within {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	textarea {
		flex: 1;
		border: none;
		background: transparent;
		resize: none;
		font-family: 'Figtree', sans-serif;
		font-size: 14px;
		line-height: 1.5;
		color: #1f2937;
		padding: 4px 0;
		min-height: 24px;
		max-height: 200px;
	}

	textarea:focus {
		outline: none;
	}

	textarea::placeholder {
		color: #9ca3af;
	}

	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.input-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.attach-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.attach-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #374151;
	}

	.attach-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.send-btn,
	.cancel-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.send-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.send-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.send-btn:disabled {
		background: #e5e7eb;
		color: #9ca3af;
		cursor: not-allowed;
	}

	.cancel-btn {
		background: #fef2f2;
		color: #dc2626;
	}

	.cancel-btn:hover {
		background: #fee2e2;
	}

	.input-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.pills-container {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pill-dropdown {
		position: relative;
	}

	.pill {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: #f3f4f6;
		border: 1px solid transparent;
		border-radius: 16px;
		font-size: 13px;
		font-weight: 500;
		color: #4b5563;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.pill:hover:not(:disabled) {
		background: #e5e7eb;
	}

	.pill:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.pill.active {
		background: #e5e7eb;
		border-color: #d1d5db;
	}

	.pill :global(.icon) {
		flex-shrink: 0;
	}

	.dropdown-menu {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		min-width: 240px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		padding: 6px;
		z-index: 100;
		animation: dropdown-in 0.15s ease;
	}

	@keyframes dropdown-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		border-radius: 8px;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
		font-family: 'Figtree', sans-serif;
	}

	.dropdown-item:hover {
		background: #f3f4f6;
	}

	.dropdown-item.selected {
		background: #eff6ff;
	}

	.item-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: #f3f4f6;
		border-radius: 8px;
		color: #6b7280;
		flex-shrink: 0;
	}

	.dropdown-item.selected .item-icon {
		background: #dbeafe;
		color: #2563eb;
	}

	.item-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.item-label {
		font-size: 14px;
		font-weight: 500;
		color: #1f2937;
	}

	.item-desc {
		font-size: 12px;
		color: #6b7280;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dropdown-item :global(.check-icon) {
		color: #2563eb;
		flex-shrink: 0;
	}

	.input-hint {
		font-size: 11px;
		color: #9ca3af;
	}

	.input-hint kbd {
		display: inline-block;
		padding: 2px 5px;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 10px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		margin: 0 2px;
	}

	/* Drag overlay */
	.drag-overlay {
		position: absolute;
		inset: 0;
		background: rgba(37, 99, 235, 0.1);
		border: 2px dashed #2563eb;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #2563eb;
		font-size: 14px;
		font-weight: 500;
		pointer-events: none;
		z-index: 10;
	}
</style>
