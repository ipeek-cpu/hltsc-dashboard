import { browser } from '$app/environment';
import type { User } from 'firebase/auth';

// Auth state using Svelte 5 runes
let user = $state<User | null>(null);
let loading = $state(true);
let initialized = $state(false);

/**
 * Initialize auth listener (call once in root layout)
 */
export async function initAuth() {
	if (!browser || initialized) return;

	// Dynamic import to avoid SSR issues
	const { initializeFirebase, onAuthStateChanged } = await import('./firebase');

	const auth = initializeFirebase();
	if (!auth) {
		loading = false;
		return;
	}

	initialized = true;

	onAuthStateChanged(auth, (firebaseUser) => {
		user = firebaseUser;
		loading = false;
	});
}

/**
 * Auth state object with reactive getters
 */
export const auth = {
	get user() {
		return user;
	},
	get loading() {
		return loading;
	},
	get isAuthenticated() {
		return !!user;
	}
};
