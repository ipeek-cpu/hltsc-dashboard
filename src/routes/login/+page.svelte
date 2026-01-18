<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth-store.svelte';
	import Icon from '../../components/Icon.svelte';

	let error = $state<string | null>(null);
	let loading = $state(false);

	// Redirect if already authenticated
	$effect(() => {
		if (browser && !auth.loading && auth.isAuthenticated) {
			goto('/');
		}
	});

	async function handleGoogleSignIn() {
		loading = true;
		error = null;
		try {
			const { signInWithGoogle } = await import('$lib/firebase');
			await signInWithGoogle();
			goto('/');
		} catch (e: any) {
			error = getErrorMessage(e);
		} finally {
			loading = false;
		}
	}

	async function handleGithubSignIn() {
		loading = true;
		error = null;
		try {
			const { signInWithGithub } = await import('$lib/firebase');
			await signInWithGithub();
			goto('/');
		} catch (e: any) {
			error = getErrorMessage(e);
		} finally {
			loading = false;
		}
	}

	function getErrorMessage(e: any): string {
		const errorCode = e?.code || '';
		switch (errorCode) {
			case 'auth/popup-closed-by-user':
				return 'Sign in cancelled';
			case 'auth/account-exists-with-different-credential':
				return 'Account exists with different sign-in method';
			case 'auth/popup-blocked':
				return 'Popup was blocked. Please allow popups for this site.';
			default:
				return e instanceof Error ? e.message : 'Authentication failed';
		}
	}
</script>

<svelte:head>
	<title>Sign In - Beads Dashboard</title>
</svelte:head>

<div class="login-page">
	<div class="login-card">
		<div class="logo-section">
			<img src="/logo.svg" alt="Beads" class="logo" width="80" height="80" />
			<h1>Beads Dashboard</h1>
		</div>

		<h2>Welcome back</h2>

		{#if error}
			<div class="error-message">
				<Icon name="alert-circle" size={16} />
				<span>{error}</span>
			</div>
		{/if}

		<div class="oauth-buttons">
			<button class="oauth-btn github" onclick={handleGithubSignIn} disabled={loading}>
				<Icon name="github" size={20} />
				<span>Continue with GitHub</span>
			</button>

			<button class="oauth-btn google" onclick={handleGoogleSignIn} disabled={loading}>
				<svg viewBox="0 0 24 24" width="20" height="20">
					<path
						fill="#4285F4"
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					/>
					<path
						fill="#34A853"
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					/>
					<path
						fill="#FBBC05"
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					/>
					<path
						fill="#EA4335"
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					/>
				</svg>
				<span>Continue with Google</span>
			</button>
		</div>
	</div>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fafafa;
		padding: 24px;
		font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.login-card {
		background: #ffffff;
		border-radius: 16px;
		padding: 40px;
		width: 100%;
		max-width: 420px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
		border: 1px solid #f0f0f0;
	}

	.logo-section {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin-bottom: 24px;
		color: #1a1a1a;
	}

	.logo {
		border-radius: 6px;
	}

	.logo-section h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 400;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	h2 {
		margin: 0 0 24px 0;
		font-size: 20px;
		font-weight: 400;
		color: #1a1a1a;
		text-align: center;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 10px;
		color: #dc2626;
		font-size: 14px;
		margin-bottom: 20px;
	}

	.oauth-buttons {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.oauth-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 12px 20px;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: 'Figtree', sans-serif;
	}

	.oauth-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.oauth-btn.github {
		background: #1a1a1a;
		color: #ffffff;
		border: 1px solid #1a1a1a;
	}

	.oauth-btn.github:hover:not(:disabled) {
		background: #333333;
	}

	.oauth-btn.google {
		background: #ffffff;
		color: #1a1a1a;
		border: 1px solid #e0e0e0;
	}

	.oauth-btn.google:hover:not(:disabled) {
		background: #f5f5f5;
		border-color: #d0d0d0;
	}

	.oauth-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
