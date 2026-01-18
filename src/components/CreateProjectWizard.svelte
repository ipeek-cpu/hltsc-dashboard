<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';
	import ProjectTypeSelector from './ProjectTypeSelector.svelte';
	import DynamicFormRenderer from './DynamicFormRenderer.svelte';
	import ProjectLocationPicker from './ProjectLocationPicker.svelte';
	import ScaffoldingProgress from './ScaffoldingProgress.svelte';
	import CreateProjectSummary from './CreateProjectSummary.svelte';
	import { type ProjectType, getProjectType } from '$lib/scaffold-templates';
	import type { FormField } from '../routes/api/projects/create/form-options/+server';

	type WizardStep = 'type' | 'configure' | 'review' | 'creating' | 'complete';

	interface StreamMessage {
		type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'init' | 'done' | 'error';
		content?: string;
		tool?: string;
		input?: unknown;
		result?: string;
		status?: string;
	}

	// State
	let currentStep = $state<WizardStep>('type');
	let selectedType = $state<ProjectType | null>(null);
	let formFields = $state<FormField[]>([]);
	let formValues = $state<Record<string, string | boolean>>({});
	let formLoading = $state(false);
	let formError = $state<string | null>(null);
	let parentDirectory = $state('');
	let projectName = $state('');
	let locationValid = $state(false);
	let extraInstructions = $state('');
	let streamMessages = $state<StreamMessage[]>([]);
	let scaffoldError = $state<string | null>(null);
	let scaffoldComplete = $state(false);
	let createdProject = $state<{ id: string; name: string; path: string } | undefined>();
	let selectedFramework = $state<string>('');

	// Derived
	let canProceedToConfig = $derived(selectedType !== null);
	let canProceedToReview = $derived(locationValid && projectName.trim().length > 0);

	// Load form options when type is selected
	async function loadFormOptions() {
		if (!selectedType) return;

		formLoading = true;
		formError = null;

		try {
			const typeConfig = getProjectType(selectedType);
			selectedFramework = typeConfig?.defaultFramework || '';

			const response = await fetch('/api/projects/create/form-options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectType: selectedType,
					framework: selectedFramework
				})
			});

			if (!response.ok) {
				throw new Error('Failed to load options');
			}

			const data = await response.json();
			formFields = data.fields || [];
			selectedFramework = data.defaultFramework || selectedFramework;

			// Initialize form values with defaults
			formValues = {};
			for (const field of formFields) {
				if (field.default !== undefined) {
					formValues[field.id] = field.default;
				}
			}
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to load options';
		} finally {
			formLoading = false;
		}
	}

	// Handle step navigation
	function goToStep(step: WizardStep) {
		currentStep = step;

		if (step === 'configure' && formFields.length === 0) {
			loadFormOptions();
		}
	}

	function handleNext() {
		switch (currentStep) {
			case 'type':
				if (canProceedToConfig) goToStep('configure');
				break;
			case 'configure':
				if (canProceedToReview) goToStep('review');
				break;
			case 'review':
				startScaffolding();
				break;
		}
	}

	function handleBack() {
		switch (currentStep) {
			case 'configure':
				goToStep('type');
				break;
			case 'review':
				goToStep('configure');
				break;
		}
	}

	// Start the scaffolding process
	async function startScaffolding() {
		if (!selectedType || !projectName || !parentDirectory) return;

		currentStep = 'creating';
		streamMessages = [];
		scaffoldError = null;
		scaffoldComplete = false;

		try {
			// Start scaffolding
			const response = await fetch('/api/projects/create/scaffold', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectType: selectedType,
					projectName,
					parentDirectory,
					framework: selectedFramework,
					options: formValues,
					extraInstructions
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to start scaffolding');
			}

			const { sessionId } = await response.json();

			// Connect to SSE stream
			const eventSource = new EventSource(
				`/api/projects/create/scaffold/stream?sessionId=${sessionId}`
			);

			eventSource.onmessage = (event) => {
				const data = JSON.parse(event.data);

				switch (data.type) {
					case 'text':
						streamMessages = [...streamMessages, { type: 'text', content: data.content }];
						break;
					case 'tool_use':
						streamMessages = [...streamMessages, { type: 'tool_use', tool: data.tool, input: data.input }];
						break;
					case 'tool_result':
						streamMessages = [...streamMessages, { type: 'tool_result', result: data.result }];
						break;
					case 'status':
						streamMessages = [...streamMessages, { type: 'status', status: data.status }];
						break;
					case 'done':
						createdProject = {
							id: data.projectId,
							name: data.projectName,
							path: data.projectPath
						};
						scaffoldComplete = true;
						// Stay on creating step so user can see the log
						eventSource.close();
						break;
					case 'error':
						scaffoldError = data.content || 'Unknown error';
						eventSource.close();
						break;
				}
			};

			eventSource.onerror = () => {
				scaffoldError = 'Connection lost';
				eventSource.close();
			};
		} catch (err) {
			scaffoldError = err instanceof Error ? err.message : 'Failed to create project';
		}
	}

	// Handle location validation
	function handleLocationValidation(isValid: boolean, error?: string) {
		locationValid = isValid;
	}

	// Navigate to created project
	function viewProject() {
		if (createdProject && createdProject.id) {
			goto(`/projects/${createdProject.id}`);
		}
	}

	// Reset wizard for creating another project
	function createAnother() {
		currentStep = 'type';
		selectedType = null;
		formFields = [];
		formValues = {};
		parentDirectory = '';
		projectName = '';
		locationValid = false;
		extraInstructions = '';
		streamMessages = [];
		scaffoldError = null;
		scaffoldComplete = false;
		createdProject = undefined;
	}

	// Get step label for review
	function getProjectTypeName(type: ProjectType): string {
		const names: Record<ProjectType, string> = {
			website: 'Website',
			webapp: 'Web App',
			mobile: 'Mobile App',
			shopify: 'Shopify Theme',
			api: 'API Backend'
		};
		return names[type] || type;
	}
</script>

<div class="wizard">
	<!-- Progress indicator -->
	{#if currentStep !== 'complete'}
		<div class="wizard-progress">
			<div
				class="progress-step"
				class:active={currentStep === 'type'}
				class:complete={currentStep !== 'type'}
			>
				<span class="step-dot">1</span>
				<span class="step-label">Type</span>
			</div>
			<div class="progress-line" class:complete={currentStep !== 'type'}></div>
			<div
				class="progress-step"
				class:active={currentStep === 'configure'}
				class:complete={currentStep === 'review' || currentStep === 'creating'}
			>
				<span class="step-dot">2</span>
				<span class="step-label">Configure</span>
			</div>
			<div class="progress-line" class:complete={currentStep === 'review' || currentStep === 'creating'}></div>
			<div
				class="progress-step"
				class:active={currentStep === 'review' || currentStep === 'creating'}
			>
				<span class="step-dot">3</span>
				<span class="step-label">{currentStep === 'creating' ? 'Creating...' : 'Create'}</span>
			</div>
		</div>
	{/if}

	<!-- Step content -->
	<div class="wizard-content">
		{#if currentStep === 'type'}
			<ProjectTypeSelector bind:selectedType />
		{:else if currentStep === 'configure'}
			<div class="configure-step">
				<h3>Configure Your Project</h3>

				<div class="configure-sections">
					<div class="section">
						<h4>Project Details</h4>
						<ProjectLocationPicker
							bind:parentDirectory
							bind:projectName
							onValidationChange={handleLocationValidation}
						/>
					</div>

					{#if formFields.length > 0 || formLoading}
						<div class="section">
							<h4>Options</h4>
							<DynamicFormRenderer
								fields={formFields}
								bind:values={formValues}
								isLoading={formLoading}
								error={formError}
							/>
						</div>
					{/if}

					<div class="section">
						<h4>Extra Instructions (Optional)</h4>
						<div class="extra-instructions">
							<textarea
								bind:value={extraInstructions}
								placeholder="Add any additional requirements for Claude, e.g., 'Use React Compiler', 'Include Prettier config', 'Set up Husky for pre-commit hooks'..."
								rows="3"
							></textarea>
							<p class="helper-text">
								<Icon name="info" size={14} />
								Claude will use these instructions when scaffolding your project.
							</p>
						</div>
					</div>
				</div>
			</div>
		{:else if currentStep === 'review'}
			<div class="review-step">
				<h3>Review Your Project</h3>

				<div class="review-card">
					<div class="review-row">
						<span class="review-label">Project Type</span>
						<span class="review-value">{selectedType ? getProjectTypeName(selectedType) : ''}</span>
					</div>
					<div class="review-row">
						<span class="review-label">Project Name</span>
						<span class="review-value">{projectName}</span>
					</div>
					<div class="review-row">
						<span class="review-label">Location</span>
						<code class="review-path">{parentDirectory}/{projectName}</code>
					</div>
					<div class="review-row">
						<span class="review-label">Framework</span>
						<span class="review-value">{selectedFramework}</span>
					</div>

					{#if Object.keys(formValues).length > 0}
						<div class="review-row">
							<span class="review-label">Options</span>
							<div class="review-options">
								{#each Object.entries(formValues) as [key, value]}
									{#if typeof value === 'boolean' && value}
										<span class="option-tag">{key}</span>
									{:else if typeof value === 'string' && value}
										<span class="option-tag">{key}: {value}</span>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					{#if extraInstructions.trim()}
						<div class="review-row">
							<span class="review-label">Extra</span>
							<span class="review-value review-extra">{extraInstructions}</span>
						</div>
					{/if}
				</div>

				<div class="review-note">
					<Icon name="info" size={16} />
					<span>Beads will be automatically initialized in your new project.</span>
				</div>
			</div>
		{:else if currentStep === 'creating'}
			<ScaffoldingProgress
				messages={streamMessages}
				error={scaffoldError}
				isComplete={scaffoldComplete}
				{projectName}
				onViewProject={createdProject ? viewProject : undefined}
				onCreateAnother={scaffoldComplete ? createAnother : undefined}
			/>
		{:else if currentStep === 'complete' && selectedType}
			<CreateProjectSummary
				{projectName}
				projectPath={`${parentDirectory}/${projectName}`}
				projectType={selectedType}
				framework={selectedFramework}
				{createdProject}
				options={formValues}
				onViewProject={viewProject}
				onCreateAnother={createAnother}
			/>
		{/if}
	</div>

	<!-- Navigation buttons -->
	{#if currentStep !== 'creating' && currentStep !== 'complete'}
		<div class="wizard-footer">
			{#if currentStep !== 'type'}
				<button class="nav-btn back" onclick={handleBack}>
					<Icon name="arrow-left" size={18} />
					Back
				</button>
			{:else}
				<div></div>
			{/if}

			<button
				class="nav-btn next"
				onclick={handleNext}
				disabled={
					(currentStep === 'type' && !canProceedToConfig) ||
					(currentStep === 'configure' && !canProceedToReview)
				}
			>
				{#if currentStep === 'review'}
					<Icon name="zap" size={18} />
					Create Project
				{:else}
					Continue
					<Icon name="arrow-right" size={18} />
				{/if}
			</button>
		</div>
	{/if}
</div>

<style>
	.wizard {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
	}

	.wizard-progress {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.progress-step {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.step-dot {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #e5e7eb;
		color: #6b7280;
		border-radius: 50%;
		font-size: 13px;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.progress-step.active .step-dot {
		background: #2563eb;
		color: #ffffff;
	}

	.progress-step.complete .step-dot {
		background: #22c55e;
		color: #ffffff;
	}

	.step-label {
		font-size: 13px;
		font-weight: 500;
		color: #6b7280;
	}

	.progress-step.active .step-label {
		color: #1f2937;
	}

	.progress-line {
		width: 60px;
		height: 2px;
		background: #e5e7eb;
		margin: 0 12px;
		transition: all 0.2s ease;
	}

	.progress-line.complete {
		background: #22c55e;
	}

	.wizard-content {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow-y: auto;
	}

	.configure-step,
	.review-step {
		padding: 24px;
	}

	.configure-step h3,
	.review-step h3 {
		margin: 0 0 24px;
		font-size: 20px;
		font-weight: 600;
		color: #1f2937;
	}

	.configure-sections {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.section h4 {
		margin: 0 0 16px;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.extra-instructions textarea {
		width: 100%;
		padding: 12px 14px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-family: 'Figtree', sans-serif;
		font-size: 14px;
		line-height: 1.5;
		resize: vertical;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.extra-instructions textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.extra-instructions textarea::placeholder {
		color: #9ca3af;
	}

	.helper-text {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 8px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	.review-card {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 20px;
	}

	.review-row {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 12px 0;
	}

	.review-row:not(:last-child) {
		border-bottom: 1px solid #e5e7eb;
	}

	.review-label {
		flex-shrink: 0;
		width: 120px;
		font-size: 13px;
		font-weight: 500;
		color: #6b7280;
	}

	.review-value {
		font-size: 14px;
		color: #1f2937;
	}

	.review-extra {
		font-style: italic;
		color: #4b5563;
	}

	.review-path {
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 12px;
		color: #374151;
		background: #f3f4f6;
		padding: 4px 8px;
		border-radius: 4px;
		word-break: break-all;
	}

	.review-options {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.option-tag {
		font-size: 11px;
		font-weight: 500;
		background: #dbeafe;
		color: #1d4ed8;
		padding: 4px 10px;
		border-radius: 12px;
		text-transform: capitalize;
	}

	.review-note {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 16px;
		padding: 12px 14px;
		background: #eff6ff;
		border-radius: 8px;
		font-size: 13px;
		color: #1e40af;
	}

	.wizard-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		background: #ffffff;
		border-top: 1px solid #e5e7eb;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.nav-btn.back {
		background: transparent;
		border: 1px solid #d1d5db;
		color: #374151;
	}

	.nav-btn.back:hover {
		background: #f3f4f6;
	}

	.nav-btn.next {
		background: #2563eb;
		border: none;
		color: #ffffff;
	}

	.nav-btn.next:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.nav-btn.next:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
