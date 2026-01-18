<script lang="ts">
	import Icon from './Icon.svelte';

	export interface QuestionOption {
		label: string;
		description: string;
	}

	export interface Question {
		question: string;
		header: string;
		options: QuestionOption[];
		multiSelect: boolean;
	}

	let {
		questions,
		onsubmit,
		oncancel
	}: {
		questions: Question[];
		onsubmit: (answers: Map<number, string[]>) => void;
		oncancel: () => void;
	} = $props();

	// Track selected answers for each question
	// Key is question index, value is array of selected option labels
	let selectedAnswers = $state<Map<number, Set<string>>>(new Map());
	// Track "Other" text inputs for each question
	let otherTexts = $state<Map<number, string>>(new Map());
	// Track if "Other" is selected for each question
	let otherSelected = $state<Map<number, boolean>>(new Map());

	function toggleOption(questionIdx: number, optionLabel: string, isMultiSelect: boolean) {
		const current = selectedAnswers.get(questionIdx) || new Set<string>();

		if (isMultiSelect) {
			// Multi-select: toggle the option
			if (current.has(optionLabel)) {
				current.delete(optionLabel);
			} else {
				current.add(optionLabel);
			}
		} else {
			// Single select: clear others and set this one
			current.clear();
			current.add(optionLabel);
			// Clear "Other" if selecting a predefined option
			otherSelected.set(questionIdx, false);
			otherSelected = new Map(otherSelected);
		}

		selectedAnswers.set(questionIdx, current);
		selectedAnswers = new Map(selectedAnswers);
	}

	function toggleOther(questionIdx: number, isMultiSelect: boolean) {
		const isCurrentlySelected = otherSelected.get(questionIdx) || false;

		if (isMultiSelect) {
			// Multi-select: just toggle Other
			otherSelected.set(questionIdx, !isCurrentlySelected);
		} else {
			// Single select: clear other selections
			if (!isCurrentlySelected) {
				const current = selectedAnswers.get(questionIdx) || new Set<string>();
				current.clear();
				selectedAnswers.set(questionIdx, current);
				selectedAnswers = new Map(selectedAnswers);
			}
			otherSelected.set(questionIdx, !isCurrentlySelected);
		}
		otherSelected = new Map(otherSelected);
	}

	function handleOtherInput(questionIdx: number, value: string) {
		otherTexts.set(questionIdx, value);
		otherTexts = new Map(otherTexts);
	}

	function canSubmit(): boolean {
		// Check each question has at least one answer
		for (let i = 0; i < questions.length; i++) {
			const selected = selectedAnswers.get(i) || new Set();
			const hasOther = otherSelected.get(i) && (otherTexts.get(i) || '').trim().length > 0;
			if (selected.size === 0 && !hasOther) {
				return false;
			}
		}
		return true;
	}

	function handleSubmit() {
		const answers = new Map<number, string[]>();

		for (let i = 0; i < questions.length; i++) {
			const selected = Array.from(selectedAnswers.get(i) || new Set());
			const hasOther = otherSelected.get(i);
			const otherText = (otherTexts.get(i) || '').trim();

			if (hasOther && otherText) {
				selected.push(`Other: ${otherText}`);
			}

			answers.set(i, selected);
		}

		onsubmit(answers);
	}

	// Helper to check if "Other" is selected for a question
	function isOtherChecked(qIdx: number): boolean {
		return otherSelected.get(qIdx) || false;
	}
</script>

<div class="question-panel">
	<div class="panel-header">
		<Icon name="help-circle" size={20} />
		<span>Claude has some questions</span>
	</div>

	<div class="questions-container">
		{#each questions as question, qIdx}
			<div class="question-block">
				<div class="question-header">
					<span class="question-badge">{question.header}</span>
					{#if question.multiSelect}
						<span class="multi-hint">Select all that apply</span>
					{/if}
				</div>
				<p class="question-text">{question.question}</p>

				<div class="options-list">
					{#each question.options as option}
						{@const isSelected = selectedAnswers.get(qIdx)?.has(option.label) || false}
						<button
							class="option-btn"
							class:selected={isSelected}
							onclick={() => toggleOption(qIdx, option.label, question.multiSelect)}
						>
							<div class="option-check">
								{#if question.multiSelect}
									<div class="checkbox" class:checked={isSelected}>
										{#if isSelected}
											<Icon name="check" size={12} />
										{/if}
									</div>
								{:else}
									<div class="radio" class:checked={isSelected}>
										{#if isSelected}
											<div class="radio-dot"></div>
										{/if}
									</div>
								{/if}
							</div>
							<div class="option-content">
								<span class="option-label">{option.label}</span>
								<span class="option-desc">{option.description}</span>
							</div>
						</button>
					{/each}

					<!-- Other option -->
					<button
						class="option-btn other-option"
						class:selected={isOtherChecked(qIdx)}
						onclick={() => toggleOther(qIdx, question.multiSelect)}
					>
						<div class="option-check">
							{#if question.multiSelect}
								<div class="checkbox" class:checked={isOtherChecked(qIdx)}>
									{#if isOtherChecked(qIdx)}
										<Icon name="check" size={12} />
									{/if}
								</div>
							{:else}
								<div class="radio" class:checked={isOtherChecked(qIdx)}>
									{#if isOtherChecked(qIdx)}
										<div class="radio-dot"></div>
									{/if}
								</div>
							{/if}
						</div>
						<div class="option-content">
							<span class="option-label">Other</span>
							<span class="option-desc">Provide a custom answer</span>
						</div>
					</button>

					{#if isOtherChecked(qIdx)}
						<div class="other-input-container">
							<input
								type="text"
								class="other-input"
								placeholder="Type your answer..."
								value={otherTexts.get(qIdx) || ''}
								oninput={(e) => handleOtherInput(qIdx, e.currentTarget.value)}
							/>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="panel-actions">
		<button class="btn-cancel" onclick={oncancel}>
			Skip Questions
		</button>
		<button
			class="btn-submit"
			disabled={!canSubmit()}
			onclick={handleSubmit}
		>
			<Icon name="send" size={16} />
			Send Answers
		</button>
	</div>
</div>

<style>
	.question-panel {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		margin: 12px 16px;
		overflow: hidden;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		background: #f0f7ff;
		border-bottom: 1px solid #dbeafe;
		color: #1d4ed8;
		font-weight: 600;
		font-size: 14px;
	}

	.questions-container {
		padding: 16px;
		max-height: 400px;
		overflow-y: auto;
	}

	.question-block {
		margin-bottom: 20px;
	}

	.question-block:last-child {
		margin-bottom: 0;
	}

	.question-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.question-badge {
		display: inline-block;
		padding: 4px 10px;
		background: #2563eb;
		color: #ffffff;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.multi-hint {
		font-size: 12px;
		color: #6b7280;
		font-style: italic;
	}

	.question-text {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: #1f2937;
		line-height: 1.5;
	}

	.options-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.option-btn {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
		background: #f9fafb;
		border: 2px solid transparent;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		font-family: 'Figtree', sans-serif;
	}

	.option-btn:hover {
		background: #f3f4f6;
		border-color: #e5e7eb;
	}

	.option-btn.selected {
		background: #eff6ff;
		border-color: #2563eb;
	}

	.option-check {
		flex-shrink: 0;
		padding-top: 2px;
	}

	.checkbox,
	.radio {
		width: 18px;
		height: 18px;
		border: 2px solid #d1d5db;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.checkbox {
		border-radius: 4px;
	}

	.radio {
		border-radius: 50%;
	}

	.checkbox.checked,
	.radio.checked {
		background: #2563eb;
		border-color: #2563eb;
		color: #ffffff;
	}

	.radio-dot {
		width: 6px;
		height: 6px;
		background: #ffffff;
		border-radius: 50%;
	}

	.option-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option-label {
		font-size: 14px;
		font-weight: 500;
		color: #1f2937;
	}

	.option-desc {
		font-size: 12px;
		color: #6b7280;
	}

	.other-option {
		border-style: dashed;
	}

	.other-input-container {
		margin-top: 8px;
		margin-left: 30px;
	}

	.other-input {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		transition: all 0.15s ease;
	}

	.other-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.panel-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 14px 16px;
		border-top: 1px solid #e5e7eb;
		background: #fafafa;
	}

	.btn-cancel,
	.btn-submit {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-cancel {
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #6b7280;
	}

	.btn-cancel:hover {
		background: #f5f5f5;
		border-color: #d0d0d0;
	}

	.btn-submit {
		background: #2563eb;
		border: 1px solid #2563eb;
		color: #ffffff;
	}

	.btn-submit:hover:not(:disabled) {
		background: #1d4ed8;
		border-color: #1d4ed8;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
