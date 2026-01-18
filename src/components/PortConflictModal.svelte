<script lang="ts">
	import Icon from './Icon.svelte';

	interface PortConflictInfo {
		port: number;
		pid?: number;
		processName?: string;
		command?: string;
	}

	interface Props {
		isOpen: boolean;
		conflictInfo: PortConflictInfo;
		onResolve: (action: 'kill' | 'random' | 'custom', port?: number) => void;
		onCancel: () => void;
	}

	let { isOpen, conflictInfo, onResolve, onCancel }: Props = $props();

	let visible = $state(false);
	let animating = $state(false);
	let customPort = $state('');
	let selectedAction = $state<'kill' | 'random' | 'custom'>('kill');
	let isLoading = $state(false);

	$effect(() => {
		if (isOpen) {
			visible = true;
			customPort = String(conflictInfo.port + 1);
			requestAnimationFrame(() => {
				animating = true;
			});
		} else if (visible) {
			animating = false;
			setTimeout(() => {
				visible = false;
				isLoading = false;
			}, 200);
		}
	});

	function handleResolve() {
		console.log('[PortConflictModal] handleResolve called, selectedAction:', selectedAction);
		isLoading = true;
		if (selectedAction === 'custom') {
			const port = parseInt(customPort, 10);
			console.log('[PortConflictModal] Custom port:', port);
			if (isNaN(port) || port < 1 || port > 65535) {
				console.log('[PortConflictModal] Invalid port, aborting');
				isLoading = false;
				return;
			}
			console.log('[PortConflictModal] Calling onResolve with custom port');
			onResolve('custom', port);
		} else {
			console.log('[PortConflictModal] Calling onResolve with action:', selectedAction);
			onResolve(selectedAction);
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && !isLoading) {
			onCancel();
		}
	}
</script>

{#if visible}
	<div class="modal-overlay" class:open={animating} onclick={handleBackdropClick} role="presentation">
		<div class="modal" class:open={animating}>
			<div class="modal-header">
				<div class="header-icon">
					<Icon name="alert-triangle" size={24} />
				</div>
				<h2>Port {conflictInfo.port} is in use</h2>
			</div>

			<div class="modal-content">
				{#if conflictInfo.processName || conflictInfo.pid}
					<div class="conflict-info">
						<div class="info-label">Currently using this port:</div>
						<div class="info-value">
							{#if conflictInfo.processName}
								<span class="process-name">{conflictInfo.processName}</span>
							{/if}
							{#if conflictInfo.pid}
								<span class="process-pid">(PID: {conflictInfo.pid})</span>
							{/if}
						</div>
						{#if conflictInfo.command}
							<div class="info-command">{conflictInfo.command}</div>
						{/if}
					</div>
				{/if}

				<div class="options">
					<label class="option" class:selected={selectedAction === 'kill'}>
						<input
							type="radio"
							name="action"
							value="kill"
							bind:group={selectedAction}
							disabled={isLoading}
						/>
						<div class="option-content">
							<div class="option-icon kill">
								<Icon name="x-circle" size={20} />
							</div>
							<div class="option-text">
								<div class="option-title">Kill the existing process</div>
								<div class="option-desc">Stop what's running on port {conflictInfo.port} and use it</div>
							</div>
						</div>
					</label>

					<label class="option" class:selected={selectedAction === 'random'}>
						<input
							type="radio"
							name="action"
							value="random"
							bind:group={selectedAction}
							disabled={isLoading}
						/>
						<div class="option-content">
							<div class="option-icon random">
								<Icon name="shuffle" size={20} />
							</div>
							<div class="option-text">
								<div class="option-title">Use an available port</div>
								<div class="option-desc">Automatically find and use the next free port</div>
							</div>
						</div>
					</label>

					<label class="option" class:selected={selectedAction === 'custom'}>
						<input
							type="radio"
							name="action"
							value="custom"
							bind:group={selectedAction}
							disabled={isLoading}
						/>
						<div class="option-content">
							<div class="option-icon custom">
								<Icon name="edit-3" size={20} />
							</div>
							<div class="option-text">
								<div class="option-title">Specify a different port</div>
								{#if selectedAction === 'custom'}
									<input
										type="number"
										class="port-input"
										bind:value={customPort}
										min="1"
										max="65535"
										placeholder="Enter port"
										disabled={isLoading}
									/>
								{:else}
									<div class="option-desc">Enter a specific port number to use</div>
								{/if}
							</div>
						</div>
					</label>
				</div>
			</div>

			<div class="modal-footer">
				<button class="cancel-btn" onclick={() => { console.log('[PortConflictModal] CANCEL CLICKED!'); onCancel(); }} disabled={isLoading}>
					Cancel
				</button>
				<button class="resolve-btn" onclick={() => { console.log('[PortConflictModal] BUTTON CLICKED!'); handleResolve(); }} disabled={isLoading}>
					{#if isLoading}
						<Icon name="loader" size={16} />
						<span>Working...</span>
					{:else}
						<Icon name="check" size={16} />
						<span>Continue</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1002;
		opacity: 0;
		transition: opacity 0.2s ease;
		pointer-events: none;
	}

	.modal-overlay.open {
		opacity: 1;
		pointer-events: auto;
	}

	.modal {
		width: 100%;
		max-width: 480px;
		background: #ffffff;
		border-radius: 16px;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
		transform: scale(0.95) translateY(10px);
		transition: transform 0.2s ease;
		overflow: hidden;
	}

	.modal.open {
		transform: scale(1) translateY(0);
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 24px 24px 0;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: #fef3c7;
		border-radius: 12px;
		color: #d97706;
		flex-shrink: 0;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #1f2937;
		font-family: 'Figtree', sans-serif;
	}

	.modal-content {
		padding: 20px 24px;
	}

	.conflict-info {
		padding: 14px 16px;
		background: #f3f4f6;
		border-radius: 10px;
		margin-bottom: 20px;
	}

	.info-label {
		font-size: 12px;
		color: #6b7280;
		margin-bottom: 6px;
	}

	.info-value {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.process-name {
		font-weight: 600;
		color: #1f2937;
	}

	.process-pid {
		color: #6b7280;
		font-size: 13px;
	}

	.info-command {
		margin-top: 8px;
		padding: 8px 10px;
		background: #e5e7eb;
		border-radius: 6px;
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 12px;
		color: #374151;
		word-break: break-all;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.option {
		display: block;
		cursor: pointer;
	}

	.option input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.option-content {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 14px 16px;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		transition: all 0.15s ease;
	}

	.option:hover .option-content {
		border-color: #d1d5db;
		background: #f9fafb;
	}

	.option.selected .option-content {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.option-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.option-icon.kill {
		background: #fef2f2;
		color: #dc2626;
	}

	.option-icon.random {
		background: #f0fdf4;
		color: #16a34a;
	}

	.option-icon.custom {
		background: #faf5ff;
		color: #9333ea;
	}

	.option-text {
		flex: 1;
		min-width: 0;
	}

	.option-title {
		font-size: 14px;
		font-weight: 600;
		color: #1f2937;
		margin-bottom: 4px;
	}

	.option-desc {
		font-size: 13px;
		color: #6b7280;
	}

	.port-input {
		width: 100%;
		margin-top: 8px;
		padding: 8px 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
	}

	.port-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		background: #f9fafb;
		border-top: 1px solid #e5e7eb;
	}

	.cancel-btn {
		padding: 10px 20px;
		background: #ffffff;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.cancel-btn:hover:not(:disabled) {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.cancel-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.resolve-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: #3b82f6;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.resolve-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.resolve-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.resolve-btn :global(.icon[data-name="loader"]) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
