<script lang="ts">
	/**
	 * Error Boundary Component
	 *
	 * Catches unhandled errors in child components and displays a friendly
	 * error message with options to reload or report the issue.
	 *
	 * Uses Svelte 5's <svelte:boundary> element.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let error = $state<Error | null>(null);
	let errorInfo = $state<{ componentStack?: string } | null>(null);

	/**
	 * Handle caught errors
	 */
	function handleError(err: Error, reset: () => void) {
		error = err;
		errorInfo = { componentStack: err.stack };

		// Log to console for debugging
		console.error('[ErrorBoundary] Caught error:', err);

		// Send error to server for logging
		logErrorToServer(err);
	}

	/**
	 * Log error to server via API
	 */
	async function logErrorToServer(err: Error) {
		try {
			await fetch('/api/logs/client-error', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: err.message,
					stack: err.stack,
					url: typeof window !== 'undefined' ? window.location.href : 'unknown',
					userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
					timestamp: new Date().toISOString()
				})
			});
		} catch {
			// Silently fail - we can't log about logging failures
		}
	}

	/**
	 * Reload the page
	 */
	function handleReload() {
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	}

	/**
	 * Reset the error state (for use with reset function from boundary)
	 */
	function handleReset() {
		error = null;
		errorInfo = null;
	}

	/**
	 * Determine if error is critical (affects core functionality)
	 */
	function isCriticalError(err: Error): boolean {
		const criticalPatterns = [
			/database/i,
			/sqlite/i,
			/network/i,
			/fetch/i,
			/unauthorized/i,
			/forbidden/i
		];
		return criticalPatterns.some((pattern) => pattern.test(err.message) || pattern.test(err.stack || ''));
	}
</script>

<svelte:boundary onerror={handleError}>
	{#if error}
		<div class="error-boundary">
			<div class="error-content">
				<div class="error-icon">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="8" x2="12" y2="12"></line>
						<line x1="12" y1="16" x2="12.01" y2="16"></line>
					</svg>
				</div>

				<h1>Something went wrong</h1>
				<p class="error-message">
					{error.message || 'An unexpected error occurred'}
				</p>

				{#if isCriticalError(error)}
					<p class="critical-notice">
						This appears to be a critical error that may affect core functionality.
					</p>
				{/if}

				<div class="error-actions">
					<button class="btn btn-primary" onclick={handleReload}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="23 4 23 10 17 10"></polyline>
							<polyline points="1 20 1 14 7 14"></polyline>
							<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
						</svg>
						Reload Page
					</button>

					<button class="btn btn-secondary" onclick={handleReset}>
						Try Again
					</button>
				</div>

				{#if isCriticalError(error)}
					<div class="report-section">
						<a
							href="https://github.com/ipeek-cpu/hlstc-dashboard/issues/new?title=Error%20Report&body={encodeURIComponent(`## Error\n${error.message}\n\n## Stack Trace\n\`\`\`\n${error.stack || 'No stack trace'}\n\`\`\`\n\n## URL\n${typeof window !== 'undefined' ? window.location.href : 'unknown'}\n\n## Timestamp\n${new Date().toISOString()}`)}"
							target="_blank"
							rel="noopener noreferrer"
							class="report-link"
						>
							Report Issue on GitHub
						</a>
					</div>
				{/if}

				<details class="error-details">
					<summary>Technical Details</summary>
					<pre>{error.stack || 'No stack trace available'}</pre>
				</details>
			</div>
		</div>
	{:else}
		{@render children()}
	{/if}
</svelte:boundary>

<style>
	.error-boundary {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		background-color: var(--bg-primary, #1a1a2e);
		color: var(--text-primary, #e4e4e7);
	}

	.error-content {
		max-width: 500px;
		text-align: center;
	}

	.error-icon {
		color: var(--color-error, #ef4444);
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.75rem 0;
		color: var(--text-primary, #e4e4e7);
	}

	.error-message {
		color: var(--text-secondary, #a1a1aa);
		margin: 0 0 1.5rem 0;
		line-height: 1.5;
	}

	.critical-notice {
		background-color: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		margin-bottom: 1.5rem;
		color: var(--color-error, #ef4444);
		font-size: 0.875rem;
	}

	.error-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.btn-primary {
		background-color: var(--color-primary, #3b82f6);
		color: white;
	}

	.btn-primary:hover {
		background-color: var(--color-primary-hover, #2563eb);
	}

	.btn-secondary {
		background-color: var(--bg-secondary, #27273a);
		color: var(--text-primary, #e4e4e7);
		border: 1px solid var(--border-color, #3f3f5a);
	}

	.btn-secondary:hover {
		background-color: var(--bg-tertiary, #32324a);
	}

	.report-section {
		margin-bottom: 1.5rem;
	}

	.report-link {
		color: var(--color-primary, #3b82f6);
		text-decoration: none;
		font-size: 0.875rem;
	}

	.report-link:hover {
		text-decoration: underline;
	}

	.error-details {
		text-align: left;
		background-color: var(--bg-secondary, #27273a);
		border-radius: 0.5rem;
		padding: 0;
		overflow: hidden;
	}

	.error-details summary {
		padding: 0.75rem 1rem;
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--text-secondary, #a1a1aa);
		user-select: none;
	}

	.error-details summary:hover {
		color: var(--text-primary, #e4e4e7);
	}

	.error-details pre {
		margin: 0;
		padding: 1rem;
		font-size: 0.75rem;
		line-height: 1.5;
		overflow-x: auto;
		background-color: var(--bg-tertiary, #1a1a2a);
		color: var(--text-secondary, #a1a1aa);
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
