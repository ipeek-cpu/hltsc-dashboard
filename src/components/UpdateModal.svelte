<script lang="ts">
	import { check, type Update } from '@tauri-apps/plugin-updater';
	import { relaunch } from '@tauri-apps/plugin-process';
	import Icon from './Icon.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let update = $state<Update | null>(null);
	let currentVersion = $state<string>('');
	let newVersion = $state<string>('');
	let releaseNotes = $state<string>('');
	let status = $state<'checking' | 'ready' | 'downloading' | 'installing' | 'done' | 'error'>('checking');
	let downloadProgress = $state<number>(0);
	let downloadedBytes = $state<number>(0);
	let totalBytes = $state<number>(0);
	let errorMessage = $state<string>('');

	// Check for updates on mount
	$effect(() => {
		checkForUpdate();
	});

	async function checkForUpdate() {
		try {
			status = 'checking';
			const result = await check();

			if (result) {
				update = result;
				currentVersion = result.currentVersion;
				newVersion = result.version;
				releaseNotes = result.body || '';
				status = 'ready';
			} else {
				// No update available
				onClose();
			}
		} catch (e) {
			status = 'error';
			errorMessage = e instanceof Error ? e.message : 'Failed to check for updates';
		}
	}

	async function startUpdate() {
		if (!update) return;

		try {
			status = 'downloading';
			downloadProgress = 0;

			console.log('[Updater] Starting download...');
			console.log('[Updater] Update object:', update);

			await update.downloadAndInstall((event) => {
				console.log('[Updater] Event:', event.event, event.data);
				if (event.event === 'Started') {
					totalBytes = event.data.contentLength || 0;
					downloadedBytes = 0;
					downloadProgress = 0;
				} else if (event.event === 'Progress') {
					downloadedBytes += event.data.chunkLength;
					if (totalBytes > 0) {
						downloadProgress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
					}
				} else if (event.event === 'Finished') {
					downloadProgress = 100;
					downloadedBytes = totalBytes;
					status = 'installing';
				}
			});

			console.log('[Updater] Download and install completed');
			status = 'done';
		} catch (e) {
			console.error('[Updater] Download failed:', e);
			status = 'error';
			// Get more details from the error
			if (e instanceof Error) {
				errorMessage = e.message || 'Unknown error during update';
				console.error('[Updater] Error message:', e.message);
				console.error('[Updater] Error stack:', e.stack);
			} else if (typeof e === 'string') {
				errorMessage = e;
			} else {
				errorMessage = 'Failed to download update';
				console.error('[Updater] Non-Error thrown:', JSON.stringify(e));
			}
		}
	}

	async function restartApp() {
		await relaunch();
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function parseReleaseNotes(notes: string): string[] {
		if (!notes) return [];
		// Split by newlines and filter out empty lines
		return notes
			.split(/\n/)
			.map(line => line.trim())
			.filter(line => line.length > 0)
			.map(line => {
				// Remove common bullet point prefixes
				return line.replace(/^[-*•]\s*/, '');
			});
	}
</script>

<div class="modal-overlay" onclick={onClose} role="presentation">
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="update-title">
		{#if status === 'checking'}
			<div class="modal-content centered">
				<div class="spinner"></div>
				<p class="status-text">Checking for updates...</p>
			</div>
		{:else if status === 'error'}
			<div class="modal-header">
				<Icon name="alert-circle" size={24} />
				<h2 id="update-title">Update Error</h2>
			</div>
			<div class="modal-content">
				<p class="error-text">{errorMessage}</p>
			</div>
			<div class="modal-actions">
				<button class="btn btn-secondary" onclick={onClose}>Close</button>
				<button class="btn btn-primary" onclick={checkForUpdate}>Retry</button>
			</div>
		{:else if status === 'ready'}
			<div class="modal-header">
				<Icon name="download" size={24} />
				<h2 id="update-title">Update Available</h2>
			</div>
			<div class="modal-content">
				<div class="version-info">
					<span class="version current">{currentVersion}</span>
					<Icon name="arrow-right" size={16} />
					<span class="version new">{newVersion}</span>
				</div>

				{#if releaseNotes}
					<div class="changelog">
						<h3>What's New</h3>
						<ul>
							{#each parseReleaseNotes(releaseNotes) as note}
								<li>{note}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
			<div class="modal-actions">
				<button class="btn btn-secondary" onclick={onClose}>Later</button>
				<button class="btn btn-primary" onclick={startUpdate}>
					<Icon name="download" size={16} />
					Update Now
				</button>
			</div>
		{:else if status === 'downloading'}
			<div class="modal-header">
				<Icon name="download" size={24} />
				<h2 id="update-title">Downloading Update</h2>
			</div>
			<div class="modal-content">
				<div class="progress-container">
					<div class="progress-bar">
						<div class="progress-fill" style="width: {downloadProgress}%"></div>
					</div>
					<div class="progress-info">
						<span>{downloadProgress}%</span>
						<span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
					</div>
				</div>
				<p class="status-text">Downloading version {newVersion}...</p>
			</div>
		{:else if status === 'installing'}
			<div class="modal-content centered">
				<div class="spinner"></div>
				<p class="status-text">Installing update...</p>
			</div>
		{:else if status === 'done'}
			<div class="modal-header">
				<Icon name="check-circle" size={24} />
				<h2 id="update-title">Update Ready</h2>
			</div>
			<div class="modal-content">
				<p class="success-text">Version {newVersion} has been installed successfully.</p>
				<p class="subtitle">Restart the app to apply the update.</p>
			</div>
			<div class="modal-actions">
				<button class="btn btn-secondary" onclick={onClose}>Later</button>
				<button class="btn btn-primary" onclick={restartApp}>
					<Icon name="refresh-cw" size={16} />
					Restart Now
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		backdrop-filter: blur(4px);
	}

	.modal {
		background: #ffffff;
		border-radius: 16px;
		width: 100%;
		max-width: 420px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 20px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 24px 24px 0;
		color: #1a1a1a;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 400;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.modal-content {
		padding: 20px 24px;
	}

	.modal-content.centered {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 40px 24px;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		padding: 16px 24px 24px;
		justify-content: flex-end;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border-radius: 24px;
		font-size: 14px;
		font-weight: 500;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-primary {
		background: #1a1a1a;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #333333;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.btn-secondary {
		background: #f5f5f5;
		color: #666666;
	}

	.btn-secondary:hover {
		background: #eeeeee;
	}

	.version-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 16px;
		background: #f8f8f8;
		border-radius: 12px;
		margin-bottom: 20px;
	}

	.version {
		font-family: monospace;
		font-size: 16px;
		padding: 4px 12px;
		border-radius: 6px;
	}

	.version.current {
		background: #e5e5e5;
		color: #666666;
	}

	.version.new {
		background: #dcfce7;
		color: #166534;
		font-weight: 600;
	}

	.changelog {
		background: #fafafa;
		border-radius: 12px;
		padding: 16px;
		max-height: 200px;
		overflow-y: auto;
	}

	.changelog h3 {
		margin: 0 0 12px;
		font-size: 15px;
		font-weight: 400;
		color: #1a1a1a;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.changelog ul {
		margin: 0;
		padding: 0 0 0 20px;
	}

	.changelog li {
		margin-bottom: 8px;
		color: #444444;
		font-size: 14px;
		line-height: 1.5;
	}

	.changelog li:last-child {
		margin-bottom: 0;
	}

	.progress-container {
		margin-bottom: 16px;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #e5e5e5;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, #3b82f6, #2563eb);
		transition: width 0.15s ease-out;
	}

	.progress-info {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		font-size: 12px;
		color: #888888;
	}

	.status-text {
		color: #666666;
		font-size: 14px;
		margin: 0;
		text-align: center;
	}

	.success-text {
		color: #166534;
		font-size: 16px;
		margin: 0 0 8px;
		text-align: center;
	}

	.subtitle {
		color: #888888;
		font-size: 14px;
		margin: 0;
		text-align: center;
	}

	.error-text {
		color: #dc2626;
		font-size: 14px;
		margin: 0;
		text-align: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #e5e5e5;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 16px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
