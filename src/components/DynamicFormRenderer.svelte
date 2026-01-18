<script lang="ts">
	import Icon from './Icon.svelte';
	import type { FormField } from '../routes/api/projects/create/form-options/+server';

	let {
		fields = [],
		values = $bindable<Record<string, string | boolean>>({}),
		isLoading = false,
		error = null
	}: {
		fields?: FormField[];
		values?: Record<string, string | boolean>;
		isLoading?: boolean;
		error?: string | null;
	} = $props();

	// Initialize default values
	$effect(() => {
		for (const field of fields) {
			if (values[field.id] === undefined && field.default !== undefined) {
				values[field.id] = field.default;
			}
		}
	});

	// Check if a field should be visible (based on dependsOn)
	function isFieldVisible(field: FormField): boolean {
		if (!field.dependsOn) return true;
		return values[field.dependsOn.field] === field.dependsOn.value;
	}

	// Filter visible fields (for potential future use)
	// let visibleFields = $derived.by(() => fields.filter(isFieldVisible));
</script>

<div class="form-renderer">
	{#if isLoading}
		<div class="loading-state">
			<Icon name="loader" size={24} />
			<span>Loading options...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<Icon name="alert-circle" size={20} />
			<span>{error}</span>
		</div>
	{:else if fields.length === 0}
		<div class="empty-state">
			<span>No configuration options available</span>
		</div>
	{:else}
		<div class="fields">
			{#each fields as field}
				{#if isFieldVisible(field)}
					<div class="field" class:checkbox-field={field.type === 'checkbox'}>
						{#if field.type === 'select'}
							<label for={field.id}>{field.label}</label>
							{#if field.description}
								<span class="field-desc">{field.description}</span>
							{/if}
							<select
								id={field.id}
								bind:value={values[field.id]}
							>
								{#each field.options || [] as option}
									<option value={option.value}>
										{option.label}
										{#if option.recommended}(Recommended){/if}
									</option>
								{/each}
							</select>
						{:else if field.type === 'checkbox'}
							<label class="checkbox-label">
								<input
									type="checkbox"
									id={field.id}
									bind:checked={values[field.id]}
								/>
								<span class="checkbox-text">
									<span class="checkbox-title">{field.label}</span>
									{#if field.description}
										<span class="checkbox-desc">{field.description}</span>
									{/if}
								</span>
							</label>
						{:else if field.type === 'text'}
							<label for={field.id}>{field.label}</label>
							{#if field.description}
								<span class="field-desc">{field.description}</span>
							{/if}
							<input
								type="text"
								id={field.id}
								bind:value={values[field.id]}
								placeholder={field.label}
							/>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.form-renderer {
		padding: 0;
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 24px;
		color: #6b7280;
		font-size: 14px;
	}

	.loading-state :global(.icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.error-state {
		color: #dc2626;
		background: #fef2f2;
		border-radius: 8px;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field label {
		font-size: 14px;
		font-weight: 500;
		color: #374151;
	}

	.field-desc {
		font-size: 12px;
		color: #6b7280;
		margin-bottom: 4px;
	}

	.field select,
	.field input[type="text"] {
		padding: 10px 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		background: #ffffff;
		color: #1f2937;
		transition: border-color 0.15s ease;
	}

	.field select:focus,
	.field input[type="text"]:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	/* Checkbox field styling */
	.checkbox-field {
		flex-direction: row;
	}

	.checkbox-label {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		cursor: pointer;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		transition: all 0.15s ease;
	}

	.checkbox-label:hover {
		background: #f3f4f6;
		border-color: #d1d5db;
	}

	.checkbox-label input[type="checkbox"] {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		accent-color: #2563eb;
		cursor: pointer;
	}

	.checkbox-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.checkbox-title {
		font-size: 14px;
		font-weight: 500;
		color: #374151;
	}

	.checkbox-desc {
		font-size: 12px;
		color: #6b7280;
	}
</style>
