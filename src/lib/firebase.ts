import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
	getAuth,
	type Auth,
	GoogleAuthProvider,
	GithubAuthProvider,
	signInWithCredential,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	signOut,
	onAuthStateChanged,
	type User
} from 'firebase/auth';
import { browser } from '$app/environment';

// Firebase configuration
const firebaseConfig = {
	apiKey: 'AIzaSyDkN9rHTyHiGYRB3tPxfxwUWkSdXT8P8vU',
	authDomain: 'beads-dashboard.firebaseapp.com',
	projectId: 'beads-dashboard',
	storageBucket: 'beads-dashboard.firebasestorage.app',
	messagingSenderId: '209874451681',
	appId: '1:209874451681:web:2f35003d69eab759bfcba0',
	measurementId: 'G-QY16SREFVR'
};

// Google OAuth Client ID from Firebase Console
const GOOGLE_CLIENT_ID = '209874451681-c94uo9jca6oj67bhk5f4nb3ed6hp8ode.apps.googleusercontent.com';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/**
 * Initialize Firebase (client-side only)
 */
export function initializeFirebase(): Auth | null {
	if (!browser) return null;

	if (!app) {
		app = initializeApp(firebaseConfig);
		auth = getAuth(app);
	}

	return auth;
}

/**
 * Get the Firebase Auth instance
 */
export function getFirebaseAuth(): Auth | null {
	return auth;
}

/**
 * Detect the current runtime environment
 */
function detectEnvironment(): 'electron' | 'tauri' | 'browser' {
	if (typeof window === 'undefined') return 'browser';

	// Check for Electron first - window.electronAPI is exposed by preload script
	const electronAPI = (window as any).electronAPI;
	if (electronAPI && electronAPI.isElectron === true) {
		return 'electron';
	}

	// Check for Tauri - __TAURI_INTERNALS__ with a working invoke function
	const tauriInternals = (window as any).__TAURI_INTERNALS__;
	if (tauriInternals && typeof tauriInternals.invoke === 'function') {
		return 'tauri';
	}

	return 'browser';
}

/**
 * Sign in with Google OAuth
 * Uses Electron's OAuth flow when available, falls back to Tauri
 */
export async function signInWithGoogle() {
	const auth = getFirebaseAuth();
	if (!auth) throw new Error('Firebase not initialized');

	const env = detectEnvironment();
	console.log('[OAuth] Detected environment:', env);
	console.log('[OAuth] window.electronAPI:', typeof window !== 'undefined' ? (window as any).electronAPI : 'undefined');
	console.log('[OAuth] window.__TAURI_INTERNALS__:', typeof window !== 'undefined' ? (window as any).__TAURI_INTERNALS__ : 'undefined');

	if (env === 'electron') {
		console.log('[OAuth] Using Electron OAuth flow');
		return signInWithGoogleElectron(auth);
	}

	if (env === 'tauri') {
		console.log('[OAuth] Using Tauri OAuth flow');
		return signInWithGoogleTauri(auth);
	}

	// In browser mode, OAuth is not available
	throw new Error('OAuth not available in browser mode. Please use the desktop app.');
}

/**
 * Sign in with Google using Electron's OAuth flow
 */
async function signInWithGoogleElectron(auth: Auth) {
	const electronAPI = window.electronAPI;
	if (!electronAPI) throw new Error('Electron API not available');

	// Start OAuth server
	const serverResult = await electronAPI.startOAuthServer();
	if (!serverResult.success || !serverResult.port) {
		throw new Error('Failed to start OAuth server');
	}

	const port = serverResult.port;

	try {
		// Build Google OAuth URL
		// Use localhost (not 127.0.0.1) to match Google OAuth client configuration
		const redirectUri = `http://localhost:${port}`;
		const params = new URLSearchParams({
			client_id: GOOGLE_CLIENT_ID,
			redirect_uri: redirectUri,
			response_type: 'token',
			scope: 'openid email profile',
			prompt: 'consent'
		});

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

		// Set up callback listener before opening browser
		const urlPromise = new Promise<string>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('OAuth timeout - no response received'));
			}, 120000); // 2 minute timeout

			const cleanup = electronAPI.onOAuthCallback((url) => {
				clearTimeout(timeout);
				cleanup();
				resolve(url);
			});
		});

		// Open in external browser
		await electronAPI.openExternal(authUrl);

		// Wait for callback
		const url = await urlPromise;

		// Parse the access token from the URL query params
		// (The OAuth server's JavaScript extracts the fragment and sends it as query params)
		const urlObj = new URL(url);
		const accessToken = urlObj.searchParams.get('access_token');

		if (!accessToken) {
			throw new Error('No access token received from Google');
		}

		// Create Firebase credential and sign in
		const credential = GoogleAuthProvider.credential(null, accessToken);
		return signInWithCredential(auth, credential);
	} finally {
		// Clean up the OAuth server
		await electronAPI.stopOAuthServer(port);
	}
}

/**
 * Sign in with Google using Tauri OAuth plugin
 */
async function signInWithGoogleTauri(auth: Auth) {
	// Import Tauri OAuth plugin
	const { start, cancel } = await import('@fabianlars/tauri-plugin-oauth');
	const { openUrl } = await import('@tauri-apps/plugin-opener');

	// Custom HTML response for the OAuth callback page
	const callbackHtml = `
<!DOCTYPE html>
<html>
<head>
	<title>Sign In Successful - Beads Dashboard</title>
	<style>
		body { font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa; }
		.card { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
		h2 { margin: 0 0 8px; font-size: 20px; color: #1a1a1a; }
		p { margin: 0; color: #666; font-size: 14px; }
	</style>
</head>
<body>
	<div class="card">
		<h2>Sign In Successful</h2>
		<p>You can close this window and return to the app.</p>
	</div>
</body>
</html>`;

	// Start localhost server to capture OAuth redirect
	const port = await start({ response: callbackHtml });

	try {
		// Build Google OAuth URL
		const redirectUri = `http://localhost:${port}`;
		const params = new URLSearchParams({
			client_id: GOOGLE_CLIENT_ID,
			redirect_uri: redirectUri,
			response_type: 'token',
			scope: 'openid email profile',
			prompt: 'consent'
		});

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

		// Open in external browser
		await openUrl(authUrl);

		// Wait for the OAuth redirect (the plugin will capture it)
		const url = await new Promise<string>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('OAuth timeout - no response received'));
			}, 120000);

			import('@tauri-apps/api/event').then(({ listen }) => {
				listen('oauth://url', (event) => {
					clearTimeout(timeout);
					resolve(event.payload as string);
				});
			});
		});

		// Parse the access token from the URL fragment
		const urlObj = new URL(url.replace('#', '?'));
		const accessToken = urlObj.searchParams.get('access_token');

		if (!accessToken) {
			throw new Error('No access token received from Google');
		}

		// Create Firebase credential and sign in
		const credential = GoogleAuthProvider.credential(null, accessToken);
		return signInWithCredential(auth, credential);
	} finally {
		await cancel(port);
	}
}

/**
 * Sign in with GitHub OAuth using Tauri OAuth plugin
 */
export async function signInWithGithub() {
	const auth = getFirebaseAuth();
	if (!auth) throw new Error('Firebase not initialized');

	// For now, throw an error - GitHub OAuth requires a client ID
	// which should be configured in Firebase Console
	throw new Error('GitHub OAuth not yet configured');
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
	const auth = getFirebaseAuth();
	if (!auth) throw new Error('Firebase not initialized');
	return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new account with email and password
 */
export async function signUpWithEmail(email: string, password: string) {
	const auth = getFirebaseAuth();
	if (!auth) throw new Error('Firebase not initialized');
	return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out the current user
 */
export async function logOut() {
	const auth = getFirebaseAuth();
	if (!auth) throw new Error('Firebase not initialized');
	return signOut(auth);
}

export { onAuthStateChanged, type User };
