<script lang="ts">
	import Icon from './Icon.svelte';
	import type { SkillLevel } from '$lib/settings';

	let {
		isOpen,
		onselect,
		oncancel
	}: {
		isOpen: boolean;
		onselect: (level: SkillLevel) => void;
		oncancel: () => void;
	} = $props();

	const skillLevels: { value: SkillLevel; label: string; description: string; icon: string }[] = [
		{
			value: 'non-coder',
			label: 'Non-Coder',
			description: 'Product manager, designer, or similar non-technical role',
			icon: 'briefcase'
		},
		{
			value: 'junior',
			label: 'Junior Developer',
			description: '0-3 years of coding experience',
			icon: 'code'
		},
		{
			value: 'senior',
			label: 'Senior Developer',
			description: '3-8 years of experience',
			icon: 'terminal'
		},
		{
			value: 'principal',
			label: 'Principal / Staff',
			description: '8+ years, architectural focus',
			icon: 'layers'
		}
	];

	let selectedLevel = $state<SkillLevel | null>(null);

	function handleSelect(level: SkillLevel) {
		selectedLevel = level;
	}

	function handleConfirm() {
		if (selectedLevel) {
			onselect(selectedLevel);
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			oncancel();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			oncancel();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" onclick={handleBackdropClick} role="presentation">
		<div class="modal">
			<div class="modal-header">
				<div class="header-icon">
					<Icon name="user" size={24} />
				</div>
				<div class="header-text">
					<h2>What's your experience level?</h2>
					<p>This helps Claude adjust how it communicates with you.</p>
				</div>
			</div>

			<div class="modal-content">
				<div class="skill-options">
					{#each skillLevels as level}
						<button
							class="skill-option"
							class:selected={selectedLevel === level.value}
							onclick={() => handleSelect(level.value)}
						>
							<div class="option-icon">
								<Icon name={level.icon} size={20} />
							</div>
							<div class="option-content">
								<span class="option-label">{level.label}</span>
								<span class="option-description">{level.description}</span>
							</div>
							{#if selectedLevel === level.value}
								<div class="option-check">
									<Icon name="check" size={16} />
								</div>
							{/if}
						</button>
					{/each}
				</div>

				<p class="change-later-note">
					<Icon name="info" size={14} />
					You can change this later in settings.
				</p>
			</div>

			<div class="modal-actions">
				<button class="btn-skip" onclick={oncancel}>
					Skip for now
				</button>
				<button
					class="btn-confirm"
					onclick={handleConfirm}
					disabled={!selectedLevel}
				>
					Continue
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		background: #ffffff;
		border-radius: 16px;
		width: 480px;
		max-width: 90vw;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
		animation: slideUp 0.2s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 24px 24px 16px;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: #f0f7ff;
		border-radius: 12px;
		color: #2563eb;
		flex-shrink: 0;
	}

	.header-text h2 {
		margin: 0 0 4px 0;
		font-size: 18px;
		font-weight: 600;
		color: #1a1a1a;
		font-family: 'Figtree', sans-serif;
	}

	.header-text p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
	}

	.modal-content {
		padding: 8px 24px 20px;
		overflow-y: auto;
		flex: 1;
	}

	.skill-options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.skill-option {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		background: #f8f9fa;
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		font-family: 'Figtree', sans-serif;
	}

	.skill-option:hover {
		background: #f0f4f8;
		border-color: #e0e7ef;
	}

	.skill-option.selected {
		background: #f0f7ff;
		border-color: #2563eb;
	}

	.option-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: #ffffff;
		border-radius: 10px;
		color: #4b5563;
		flex-shrink: 0;
	}

	.skill-option.selected .option-icon {
		background: #2563eb;
		color: #ffffff;
	}

	.option-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option-label {
		font-size: 15px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.option-description {
		font-size: 13px;
		color: #6b7280;
	}

	.option-check {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: #2563eb;
		border-radius: 50%;
		color: #ffffff;
		flex-shrink: 0;
	}

	.change-later-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 16px 0 0 0;
		font-size: 13px;
		color: #9ca3af;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #eaeaea;
		background: #fafafa;
	}

	.btn-skip,
	.btn-confirm {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-skip {
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #6b7280;
	}

	.btn-skip:hover {
		background: #f5f5f5;
		border-color: #d0d0d0;
	}

	.btn-confirm {
		background: #2563eb;
		border: 1px solid #2563eb;
		color: #ffffff;
	}

	.btn-confirm:hover:not(:disabled) {
		background: #1d4ed8;
		border-color: #1d4ed8;
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
