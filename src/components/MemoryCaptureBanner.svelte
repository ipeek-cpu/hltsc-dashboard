<script lang="ts">
	import Icon from './Icon.svelte';
	import type { MemoryKind } from '$lib/memory/types';

	interface Props {
		projectId: string;
		projectPath: string;
		beadId?: string;
		contextPercent: number; // 0-100
		threshold?: number; // When to show (default 80)
		onCapture?: () => void; // Called after successful capture
		ondismiss?: () => void;
	}

	let {
		projectId,
		projectPath,
		beadId,
		contextPercent,
		threshold = 80,
		onCapture,
		ondismiss
	}: Props = $props();

	// State
	let expanded = $state(false);
	let captureKind = $state<MemoryKind>('checkpoint');
	let captureContent = $state('');
	let saving = $state(false);
	let dismissed = $state(false);
	let showSuccess = $state(false);

	// Computed visibility
	const visible = $derived(contextPercent >= threshold && !dismissed);

	// Urgency level
	const urgency = $derived(
		contextPercent >= 95 ? 'critical' : contextPercent >= 90 ? 'high' : 'normal'
	);

	async function saveMemory() {
		if (!captureContent.trim()) return;
		saving = true;

		try {
			const res = await fetch(
				`/api/projects/${projectId}/memory?projectPath=${encodeURIComponent(projectPath)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						beadId,
						kind: captureKind,
						title: `Context checkpoint at ${contextPercent}%`,
						content: captureContent
					})
				}
			);

			if (!res.ok) throw new Error('Save failed');

			// Show success briefly then dismiss
			showSuccess = true;
			setTimeout(() => {
				dismissed = true;
				onCapture?.();
			}, 1500);
		} catch (e) {
			console.error('Memory capture failed:', e);
		} finally {
			saving = false;
		}
	}

	function dismiss() {
		dismissed = true;
		ondismiss?.();
	}

	function toggleExpand() {
		expanded = !expanded;
	}
</script>

{#if visible}
	<div
		class="capture-banner"
		class:expanded
		class:success={showSuccess}
		class:critical={urgency === 'critical'}
		class:high={urgency === 'high'}
	>
		{#if showSuccess}
			<div class="success-message">
				<Icon name="check-circle" size={16} />
				<span>Memory saved!</span>
			</div>
		{:else if !expanded}
			<div class="banner-compact">
				<div class="context-indicator">
					<Icon name="alert-circle" size={16} />
					<span>Context at {contextPercent}%</span>
				</div>
				<div class="banner-actions">
					<button class="btn-save" onclick={toggleExpand}>
						<Icon name="save" size={14} />
						Save Context
					</button>
					<button class="btn-dismiss" onclick={dismiss} title="Dismiss">
						<Icon name="x" size={14} />
					</button>
				</div>
			</div>
		{:else}
			<div class="banner-expanded">
				<div class="expanded-header">
					<span>Capture important context</span>
					<button class="btn-close" onclick={toggleExpand}>
						<Icon name="x" size={14} />
					</button>
				</div>
				<div class="capture-form">
					<select bind:value={captureKind}>
						<option value="checkpoint">Checkpoint</option>
						<option value="decision">Decision</option>
						<option value="constraint">Constraint</option>
						<option value="next_step">Next Step</option>
					</select>
					<textarea
						bind:value={captureContent}
						placeholder="What should be remembered from this session?"
						rows={3}
					></textarea>
					<div class="form-actions">
						<button class="btn-cancel" onclick={toggleExpand}>Cancel</button>
						<button
							class="btn-primary"
							onclick={saveMemory}
							disabled={saving || !captureContent.trim()}
						>
							{saving ? 'Saving...' : 'Save Memory'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.capture-banner {
		position: fixed;
		bottom: 80px; /* Above chat input */
		left: 50%;
		transform: translateX(-50%);
		background: #ffffff;
		border: 1px solid #eaeaea;
		border-radius: 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		z-index: 90;
		animation: slideUp 0.3s ease-out;
		min-width: 300px;
		max-width: 500px;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.capture-banner.high {
		border-color: #f59e0b;
	}

	.capture-banner.critical {
		border-color: #ef4444;
		animation:
			slideUp 0.3s ease-out,
			pulse 2s infinite 0.3s;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 4px 16px rgba(239, 68, 68, 0.2);
		}
		50% {
			box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
		}
	}

	.banner-compact {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		gap: 1rem;
	}

	.context-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #f59e0b;
		font-weight: 500;
	}

	.capture-banner.critical .context-indicator {
		color: #ef4444;
	}

	.banner-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-save {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: #2563eb;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		font-family: 'Figtree', sans-serif;
	}

	.btn-save:hover {
		background: #1d4ed8;
	}

	.btn-dismiss,
	.btn-close {
		background: none;
		border: none;
		color: #999999;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-dismiss:hover,
	.btn-close:hover {
		background: #f5f5f5;
		color: #666666;
	}

	.banner-expanded {
		padding: 1rem;
		width: 400px;
	}

	.expanded-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #1a1a1a;
	}

	.capture-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.capture-form select,
	.capture-form textarea {
		padding: 0.5rem;
		background: #ffffff;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		color: #1a1a1a;
		font-size: 0.875rem;
		font-family: 'Figtree', sans-serif;
		transition: border-color 0.15s;
	}

	.capture-form select:focus,
	.capture-form textarea:focus {
		outline: none;
		border-color: #2563eb;
	}

	.capture-form textarea {
		resize: vertical;
		min-height: 60px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.btn-cancel {
		padding: 0.375rem 0.75rem;
		background: none;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		color: #666666;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: 'Figtree', sans-serif;
	}

	.btn-cancel:hover {
		background: #f5f5f5;
	}

	.btn-primary {
		padding: 0.375rem 0.75rem;
		background: #2563eb;
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		font-family: 'Figtree', sans-serif;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.success-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		color: #22c55e;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.capture-banner.success {
		border-color: #22c55e;
		background: #f0fdf4;
	}
</style>
